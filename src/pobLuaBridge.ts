import { spawn, ChildProcessWithoutNullStreams } from "child_process";
import net from "net";
import path from "path";
import os from "os";

type Json = any;

export interface PoBLuaApiOptions {
  cwd?: string;
  cmd?: string; // default: 'luajit'
  args?: string[]; // default: ['HeadlessWrapper.lua']
  env?: Record<string, string>;
  timeoutMs?: number; // per-request timeout
}

export class PoBLuaApiClient {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private options: PoBLuaApiOptions;
  private buffer = "";
  private ready = false;
  private pending: { resolve: (v: Json) => void; reject: (e: Error) => void } | null = null;
  private killed = false;

  constructor(options: PoBLuaApiOptions = {}) {
    const forkSrc = options.cwd || path.join(os.homedir(), "Projects", "pob-api-fork", "src");
    this.options = {
      cwd: forkSrc,
      cmd: options.cmd || "luajit",
      args: options.args || ["HeadlessWrapper.lua"],
      env: options.env || {},
      timeoutMs: options.timeoutMs ?? 10000,
    };
  }

  async start(): Promise<void> {
    if (this.proc) return;
    const env = { ...process.env, ...this.options.env, POB_API_STDIO: "1" } as NodeJS.ProcessEnv;
    this.proc = spawn(this.options.cmd!, this.options.args!, {
      cwd: this.options.cwd,
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    this.proc.stdout.setEncoding("utf8");
    this.proc.stderr.setEncoding("utf8");

    this.proc.stdout.on("data", (chunk: string) => this.onStdout(chunk));
    this.proc.stderr.on("data", (chunk: string) => {
      // Keep stderr visible for debugging but don’t reject requests by default
      // console.error("[PoB API stderr]", chunk.trim());
    });

    this.proc.on("exit", (code, signal) => {
      this.killed = true;
      if (this.pending) {
        this.pending.reject(new Error(`PoB API exited: code=${code} signal=${signal}`));
        this.pending = null;
      }
    });

    // Wait for ready banner
    const ready = await this.readLineWithTimeout(this.options.timeoutMs);
    try {
      const msg = JSON.parse(ready);
      if (!msg || msg.ready !== true) {
        throw new Error(`Unexpected banner: ${ready}`);
      }
    } catch (e) {
      throw new Error(`Failed to parse ready banner: ${e}`);
    }
    this.ready = true;
  }

  private onStdout(chunk: string) {
    this.buffer += chunk;
  }

  private async readLineWithTimeout(timeoutMs?: number): Promise<string> {
    const deadline = Date.now() + (timeoutMs ?? this.options.timeoutMs!);
    while (true) {
      const idx = this.buffer.indexOf("\n");
      if (idx >= 0) {
        const line = this.buffer.slice(0, idx);
        this.buffer = this.buffer.slice(idx + 1);
        return line;
      }
      if (Date.now() > deadline) throw new Error("Timed out waiting for response");
      await new Promise((r) => setTimeout(r, 10));
    }
  }

  private async send(obj: Json): Promise<Json> {
    if (!this.proc || !this.proc.stdin) throw new Error("Process not started");
    if (!this.ready) throw new Error("Process not ready");
    if (this.pending) throw new Error("Concurrent request not supported");

    this.proc.stdin.write(JSON.stringify(obj) + "\n");
    const line = await this.readLineWithTimeout(this.options.timeoutMs);
    let res: any;
    try {
      res = JSON.parse(line);
    } catch (e) {
      throw new Error(`Invalid JSON from server: ${line}`);
    }
    return res;
  }

  async ping(): Promise<boolean> {
    const res = await this.send({ action: "ping" });
    return !!res.ok;
  }

  async loadBuildXml(xml: string, name = "API Build"): Promise<void> {
    const res = await this.send({ action: "load_build_xml", params: { xml, name } });
    if (!res.ok) throw new Error(res.error || "load_build_xml failed");
  }

  async getStats(fields?: string[]): Promise<Record<string, any>> {
    const res = await this.send({ action: "get_stats", params: { fields } });
    if (!res.ok) throw new Error(res.error || "get_stats failed");
    return res.stats;
  }

  async getTree(): Promise<any> {
    const res = await this.send({ action: "get_tree" });
    if (!res.ok) throw new Error(res.error || "get_tree failed");
    return res.tree;
  }

  

  async getItems(): Promise<any[]> {
    const res = await this.send({ action: "get_items" });
    if (!res.ok) throw new Error(res.error || "get_items failed");
    return res.items;
  }
async setTree(params: {
    classId: number;
    ascendClassId: number;
    secondaryAscendClassId?: number;
    nodes: number[];
    masteryEffects?: Record<number, number>;
    treeVersion?: string;
  }): Promise<any> {
    const res = await this.send({ action: "set_tree", params });
    if (!res.ok) throw new Error(res.error || "set_tree failed");
    return res.tree;
  }

  async stop(): Promise<void> {
    if (!this.proc) return;
    try {
      await this.send({ action: "quit" });
    } catch {}
    this.proc.kill();
    this.proc = null;
  }
}

export interface PoBLuaTcpOptions {
  host?: string; // default 127.0.0.1
  port?: number; // default 31337
  timeoutMs?: number; // per-request timeout
}

export class PoBLuaTcpClient {
  private socket: net.Socket | null = null;
  private buffer = "";
  private ready = false;
  private timeoutMs: number;
  private host: string;
  private port: number;

  constructor(opts: PoBLuaTcpOptions = {}) {
    this.host = opts.host || "127.0.0.1";
    this.port = opts.port ?? 31337;
    this.timeoutMs = opts.timeoutMs ?? 10000;
  }

  async start(): Promise<void> {
    if (this.socket) return;
    await new Promise<void>((resolve, reject) => {
      const sock = net.createConnection({ host: this.host, port: this.port }, () => {
        // Connected; will wait for ready banner
      });
      this.socket = sock;
      sock.setEncoding("utf8");
      sock.on("data", (chunk: string) => (this.buffer += chunk));
      sock.on("error", (err) => reject(err));
      sock.on("close", () => {
        this.socket = null;
      });
      // Wait for banner
      this.readLineWithTimeout(this.timeoutMs)
        .then((line) => {
          try {
            const msg = JSON.parse(line);
            if (!msg || msg.ready !== true) throw new Error(`Unexpected banner: ${line}`);
            this.ready = true;
            resolve();
          } catch (e) {
            reject(new Error(`Failed to parse ready banner: ${e}`));
          }
        })
        .catch(reject);
    });
  }

  private async readLineWithTimeout(timeoutMs?: number): Promise<string> {
    const deadline = Date.now() + (timeoutMs ?? this.timeoutMs);
    while (true) {
      const idx = this.buffer.indexOf("\n");
      if (idx >= 0) {
        const line = this.buffer.slice(0, idx);
        this.buffer = this.buffer.slice(idx + 1);
        return line;
      }
      if (Date.now() > deadline) throw new Error("Timed out waiting for response");
      await new Promise((r) => setTimeout(r, 10));
    }
  }

  private async send(obj: any): Promise<any> {
    if (!this.socket) throw new Error("Socket not connected");
    if (!this.ready) throw new Error("Not ready");
    this.socket.write(JSON.stringify(obj) + "\n");
    const line = await this.readLineWithTimeout(this.timeoutMs);
    let res: any;
    try {
      res = JSON.parse(line);
    } catch (e) {
      throw new Error(`Invalid JSON from server: ${line}`);
    }
    return res;
  }

  async ping(): Promise<boolean> {
    const res = await this.send({ action: "ping" });
    return !!res.ok;
  }

  async loadBuildXml(xml: string, name = "API Build"): Promise<void> {
    const res = await this.send({ action: "load_build_xml", params: { xml, name } });
    if (!res.ok) throw new Error(res.error || "load_build_xml failed");
  }

  async getStats(fields?: string[]): Promise<Record<string, any>> {
    const res = await this.send({ action: "get_stats", params: { fields } });
    if (!res.ok) throw new Error(res.error || "get_stats failed");
    return res.stats;
  }

  async getTree(): Promise<any> {
    const res = await this.send({ action: "get_tree" });
    if (!res.ok) throw new Error(res.error || "get_tree failed");
    return res.tree;
  }

  async setTree(params: {
    classId: number;
    ascendClassId: number;
    secondaryAscendClassId?: number;
    nodes: number[];
    masteryEffects?: Record<number, number>;
    treeVersion?: string;
  }): Promise<any> {
    const res = await this.send({ action: "set_tree", params });
    if (!res.ok) throw new Error(res.error || "set_tree failed");
    return res.tree;
  }

  async updateTreeDelta(params: { addNodes?: number[]; removeNodes?: number[]; classId?: number; ascendClassId?: number; secondaryAscendClassId?: number; treeVersion?: string; }): Promise<any> {
    const res = await this.send({ action: "update_tree_delta", params });
    if (!res.ok) throw new Error(res.error || "update_tree_delta failed");
    return res.tree;
  }

  async calcWith(params: { addNodes?: number[]; removeNodes?: number[]; useFullDPS?: boolean; }): Promise<any> {
    const res = await this.send({ action: "calc_with", params });
    if (!res.ok) throw new Error(res.error || "calc_with failed");
    return res.output;
  }

  async exportBuildXml(): Promise<string> {
    const res = await this.send({ action: "export_build_xml" });
    if (!res.ok) throw new Error(res.error || "export_build_xml failed");
    return res.xml;
  }

  async getBuildInfo(): Promise<any> {
    const res = await this.send({ action: "get_build_info" });
    if (!res.ok) throw new Error(res.error || "get_build_info failed");
    return res.info;
  }

  async setLevel(level: number): Promise<void> {
    const res = await this.send({ action: "set_level", params: { level } });
    if (!res.ok) throw new Error(res.error || "set_level failed");
  }

  async getConfig(): Promise<any> {
    const res = await this.send({ action: "get_config" });
    if (!res.ok) throw new Error(res.error || "get_config failed");
    return res.config;
  }

  async setConfig(params: { bandit?: string; pantheonMajorGod?: string; pantheonMinorGod?: string; enemyLevel?: number; }): Promise<any> {
    const res = await this.send({ action: "set_config", params });
    if (!res.ok) throw new Error(res.error || "set_config failed");
    return res.config;
  }

  async stop(): Promise<void> {
    if (!this.socket) return;
    try { this.socket.end(); } catch {}
    try { this.socket.destroy(); } catch {}
    this.socket = null;
  }
}
