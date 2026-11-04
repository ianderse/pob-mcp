import { spawn, ChildProcessWithoutNullStreams } from "child_process";
import { noteIgnoredError } from './utils/errorHandling.js';
import { EventEmitter } from "events";
import path from "path";
import zlib from "zlib";
import fs from "fs/promises";
import { randomUUID } from "crypto";
import { atomicWriteFile } from "./utils/atomicWrite.js";
import { resolvePoBLayout } from "./utils/pobLayout.js";

/** Lua bridge request envelope */
type LuaRequest = { action: string; params?: Record<string, unknown> };
/** Lua bridge response envelope — always an object with at minimum `ok: boolean` */
type LuaResponse = { ok: boolean; error?: string; [key: string]: unknown };

// ============================================================================
// Typed bridge results. Each interface mirrors the exact table returned by the
// corresponding M.<action>() in lua/pob_ops.lua (or a stdio handler) — keep
// them in sync when changing the Lua side. Optional fields are those the Lua
// layer only sets when the underlying PoB state has them.
// ============================================================================

/** get_build_info */
export interface BuildInfo {
  name?: string;
  level?: number;
  className?: string;
  ascendClassName?: string;
  treeVersion?: string;
}

/** get_tree / set_tree / update_tree_delta .tree */
export interface TreeState {
  treeVersion?: string;
  classId: number;
  ascendClassId: number;
  secondaryAscendClassId: number;
  nodes: number[];
  masteryEffects: Record<string, number>;
  /**
   * Allocated ascendancy nodes minus the free ascendancy-start node. Computed
   * by the Lua bridge (pob_ops.lua M.get_tree); backs the max-8 cap guard and
   * unspent-point estimates.
   */
  ascendancyPointsUsed?: number;
}

/** export_stats meta block (string fields nested under _meta, not numeric) */
interface StatsMeta {
  treeVersion?: string;
  level?: number;
  buildName?: string;
}

/**
 * get_stats: PoB's calculator output for the requested fields. Values are
 * numbers by contract; `string` stays in the type because PoB's raw output
 * table can carry display strings for a few fields, and consumers coerce.
 * `_meta` is the only non-numeric member (treeVersion/level/buildName).
 */
export type StatsExport = { [stat: string]: number | string | undefined } & { _meta?: StatsMeta };

/**
 * Coerce a PoB stat to a finite number. PoB's output table is stringly typed
 * in a handful of fields and the JSON round-trip can widen/shape values, so
 * every numeric consumer must narrow through this helper (or Number()) rather
 * than assume the wire type. NaN/undefined => not reported by PoB.
 */
export function toFiniteNumber(v: unknown): number | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * calc_with raw PoB output: numeric stats plus the nested Minion table and
 * functions stripped by sanitize_for_json.
 */
type CalcOutput = { [stat: string]: number | undefined } & {
  Minion?: { [stat: string]: number | undefined };
  _meta?: StatsMeta;
};

/** get_items entry (M.get_items) */
interface EquippedItem {
  slot: string;
  id: number;
  name?: string;
  baseName?: string;
  type?: string;
  rarity?: string;
  /** PoB's raw item line, when present */
  raw?: string;
  /** flask/tincture activation; only meaningful for flask slots */
  active?: boolean;
}

/** get_skills */
interface SkillGemEntry {
  index: number;
  name: string;
  level: number;
  quality: number;
  qualityId: string;
  enabled: boolean;
  isSupport: boolean;
}

export interface SocketGroupEntry {
  index: number;
  label?: string;
  slot?: string;
  enabled?: boolean;
  includeInFullDPS?: boolean;
  mainActiveSkill?: number;
  skills: string[];
  gems: SkillGemEntry[];
}

export interface SkillsOutput {
  mainSocketGroup?: number;
  calcsSkillNumber?: number;
  groups: SocketGroupEntry[];
}

/** search_nodes */
interface SearchNodesResult {
  nodes: SearchedNode[];
  count: number;
}

export interface SearchedNode {
  id: number | string;
  name: string;
  type: 'keystone' | 'notable' | 'jewel' | 'mastery' | 'ascendancy' | 'normal' | string;
  stats: string[];
  allocated: boolean;
  x: number;
  y: number;
  orbit?: string;
  orbitIndex?: number;
  /** PoB's tree data carries both spellings depending on data vintage. */
  ascendancy?: string;
  ascendancyName?: string;
  isMastery?: boolean;
  isBlighted?: boolean;
}

/** list_specs / create_spec / select_spec / delete_spec / rename_spec */
export interface SpecEntry {
  index: number;
  title: string;
  active: boolean;
  className?: string;
  ascendClassName?: string;
  treeVersion?: string;
  nodeCount: number;
}

interface SpecList {
  specs: SpecEntry[];
  activeSpec: number;
}

/** list_item_sets / select_item_set */
export interface ItemSetEntry {
  id: number;
  title: string;
  active: boolean;
  useSecondWeaponSet: boolean;
}

interface ItemSetList {
  itemSets: ItemSetEntry[];
  activeItemSetId: number;
}

/** get_config / set_config .config */
export interface ConfigValues {
  [key: string]: string | number | boolean | undefined;
}

/** get_capabilities (plus the offline fallback shape) */
interface BridgeCapabilities {
  mode?: string;
  adapter?: string;
  actions?: string[];
  /** set only by the offline fallback (no bridge answered) */
  capabilitiesReported?: boolean;
}

/** add_item_text */
interface AddedItem {
  id: number;
  name?: string;
  slot?: string;
}

/** create_socket_group */
interface CreatedSocketGroup {
  index: number;
  label?: string;
  enabled?: boolean;
  [key: string]: unknown;
}

/** add_gem */
interface AddedGem {
  gemIndex: number;
  name?: string;
}

/** get_mastery_options */
interface MasteryOptionEffect {
  effectId: number;
  stat: string;
}

interface MasteryOptionNode {
  nodeId: number | string;
  nodeName: string;
  allocatedEffect?: number;
  availableEffects: MasteryOptionEffect[];
}

interface MasteryOptions {
  masteries: MasteryOptionNode[];
}

/** new_build / load_build_xml / import_code envelope result (state facts only) */
interface BuildLoadResult {
  ok: true;
}

/** save_build */
interface SavedBuild {
  path: string;
  /** byte size of the XML PoB serialized */
  size: number;
}


const ROCK_BY_LUA_MODULE: Record<string, string> = {
  "lua-utf8": "luautf8",
};

/** PoB reports this on stdout and then blocks, so the bare symptom is a startup timeout. */
function missingLuaModuleMessage(moduleName: string): string {
  const rock = ROCK_BY_LUA_MODULE[moduleName];
  return (
    `Failed to start PoB Lua Bridge: PoB could not load the Lua module '${moduleName}'.\n\n` +
    `PoB's C modules are committed to runtime/ as Windows .dll builds only, so a fresh\n` +
    `PathOfBuilding checkout cannot supply them on macOS or Linux.\n\n` +
    `Install it for LuaJIT (Lua 5.1):\n` +
    `  luarocks --lua-version=5.1 --local install ${rock ?? moduleName}\n\n` +
    `On Homebrew LuaJIT, add --lua-dir=$(brew --prefix luajit).\n` +
    `This bridge already searches ~/.luarocks/lib/lua/5.1, so no extra config is needed.`
  );
}

interface PoBLuaApiOptions {
  cwd?: string;
  cmd?: string; // default: 'luajit'
  args?: string[]; // default: ['HeadlessWrapper.lua']
  env?: Record<string, string>;
  timeoutMs?: number; // per-request timeout
}

/** Constructor input with every defaulted field resolved — what the client stores. */
type ResolvedOptions = Required<Omit<PoBLuaApiOptions, 'cwd'>> & { cwd?: string };

/**
 * A non-damaging ailment as the engine sees it. `appliedEffect` is what the
 * DPS calculation is actually crediting; `calculatedEffect` is what the skill
 * would inflict on the configured enemy. They differ whenever the ailment is
 * chance-based, because PoB only applies guaranteed or hand-configured ones.
 */
export interface AilmentReport {
  name: string;
  chanceOnHit: number;
  chanceOnCrit: number;
  effectMod?: number;
  duration?: number;
  /** Below this the ailment does not land at all. */
  minimumEffect?: number;
  maximumEffect?: number;
  appliedEffect: number;
  calculatedEffect?: number;
  landsOnConfiguredEnemy?: boolean;
  creditedInCalc: boolean;
  /** PoB's own config var names, derived from its option list rather than guessed. */
  effectConfigVar?: string;
  enabledConfigVar?: string;
  enabledOnEnemy?: boolean;
  thresholdTable?: Array<{
    ailmentThreshold: number;
    effect: number;
    note?: string;
    isConfiguredEnemy?: boolean;
  }>;
}

export class PoBLuaApiClient {
  private loadedFilePath?: string;
  private buildGeneration = 0;

  getLoadedFilePath(): string | undefined { return this.loadedFilePath; }
  private proc: ChildProcessWithoutNullStreams | null = null;
  private options: ResolvedOptions;
  private buffer = "";
  private ready = false;
  private isSending = false;
  private killed = false;
  private dataEmitter = new EventEmitter();

  /** Returns true if the process is running and ready to accept requests. */
  isAlive(): boolean {
    return !this.killed && this.ready && !!this.proc;
  }

  constructor(options: PoBLuaApiOptions = {}) {
    // Prevent unhandled 'error' events (emitted on process exit) from crashing Node.js
    this.dataEmitter.on("error", () => {});
    const forkSrc = options.cwd || process.env.POB_PATH || process.env.POB_FORK_PATH;
    this.options = {
      cwd: forkSrc,  // may be undefined; resolved by layout detection in start()
      cmd: options.cmd || "luajit",
      args: options.args || ["HeadlessWrapper.lua"],
      env: options.env || {},
      timeoutMs: options.timeoutMs ?? 30000, // Increased from 10s to 30s
    };
  }

  async start(): Promise<void> {
    if (this.proc) {
      if (!this.killed) return;
      // Previous process died; clear it so we can restart
      this.proc = null;
    }
    this.killed = false;
    this.ready = false;
    this.buffer = "";
    this.loadedFilePath = undefined;

    const layout = resolvePoBLayout(this.options.cwd);
    this.options.cwd = layout.src;

    // ';' separates entries on ALL platforms; trailing ';;' appends Lua's defaults
    const luaSep = ';';
    const toSearchPath = (entries: string[]) => entries.join(luaSep) + luaSep + luaSep;

    const env = {
      ...process.env,
      POB_API_STDIO: "1",
      LUA_PATH: toSearchPath(layout.luaPath),
      LUA_CPATH: toSearchPath(layout.luaCPath),
      ...this.options.env,
    } as NodeJS.ProcessEnv;

    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawn(this.options.cmd, this.options.args, {
        cwd: this.options.cwd,
        env,
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to spawn LuaJIT process: ${message}`);
    }
    this.proc = child;

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");

    // EPIPE from a write racing process death must not crash the server;
    // the 'exit' handler below already surfaces the failure via dataEmitter.
    child.stdin.on("error", () => {});

    // Track spawn errors
    let spawnError: Error | null = null;
    child.on("error", (err: Error) => {
      if (this.proc !== child) return; // stale event from a replaced process
      spawnError = err;
      this.killed = true;
      this.dataEmitter.emit("error", err);
    });

    child.stdout.on("data", (chunk: string) => {
      if (this.proc !== child) return;
      this.onStdout(chunk);
    });
    child.stderr.on("data", (chunk: string) => {
      // Keep stderr visible for debugging but don't reject requests by default
      console.error("[PoB API stderr]", chunk.trim());
    });

    child.on("exit", (code, signal) => {
      if (this.proc !== child) return;
      this.killed = true;
      this.dataEmitter.emit("error", new Error(`PoB API exited: code=${code} signal=${signal}`));
    });

    try {
      // Wait for ready banner (skip non-JSON lines like log messages)
      let ready: string = "";
      let attempts = 0;
      const maxAttempts = 50; // 50 lines max to find JSON banner

      while (attempts < maxAttempts) {
        // Check if process errored during spawn
        if (spawnError !== null) {
          const cmd = this.options.cmd;
          const err: Error = spawnError;
          const errMsg = err.message || String(err);
          if (errMsg.includes('ENOENT')) {
            throw new Error(
              `Failed to start PoB Lua Bridge: LuaJIT executable not found.\n\n` +
              `The command "${cmd}" does not exist or is not in PATH.\n\n` +
              `Please:\n` +
              `1. Install LuaJIT (https://luajit.org/download.html)\n` +
              `2. Update your Claude Desktop config with the correct POB_CMD path\n` +
              `3. Or add LuaJIT to your system PATH and set POB_CMD=luajit\n\n` +
              `Current POB_CMD: ${cmd}`
            );
          }
          throw new Error(`Failed to spawn LuaJIT process: ${errMsg}`);
        }

        // Check if process exited
        if (this.killed) {
          throw new Error('PoB API process exited before becoming ready');
        }

        ready = await this.readLineWithTimeout(this.options.timeoutMs);
        attempts++;

        // Skip empty lines or lines that don't start with '{'
        if (!ready.trim() || !ready.trim().startsWith('{')) {
          const missingModule = ready.match(/module '([\w.\-]+)' not found/);
          if (missingModule) {
            throw new Error(missingLuaModuleMessage(missingModule[1]));
          }
          continue;
        }

        // Try to parse as JSON
        try {
          const msg = JSON.parse(ready);
          if (msg && msg.ready === true) {
            this.ready = true;
            return; // Successfully initialized
          }
        } catch (e) {
          // Not valid JSON, keep looking
          continue;
        }
      }

      throw new Error(`Failed to find valid ready banner after ${maxAttempts} lines`);
    } catch (err) {
      // Don't leak the spawned process when startup fails
      this.proc = null;
      this.killed = true;
      try { child.kill(); } catch (e) { noteIgnoredError("kill during startup cleanup (process likely already exited)", e); }
      throw err;
    }
  }

  private onStdout(chunk: string) {
    if (process.env.POB_DEBUG === "true") {
      console.error("[PoB API stdout]", chunk.trim());
    }
    this.buffer += chunk;
    this.dataEmitter.emit("data");
  }

  private readLineWithTimeout(timeoutMs = this.options.timeoutMs): Promise<string> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error("Timed out waiting for response"));
      }, timeoutMs);

      const tryRead = (): boolean => {
        const idx = this.buffer.indexOf("\n");
        if (idx >= 0) {
          const line = this.buffer.slice(0, idx);
          this.buffer = this.buffer.slice(idx + 1);
          cleanup();
          resolve(line);
          return true;
        }
        return false;
      };

      const onError = (err: Error) => {
        cleanup();
        reject(err);
      };

      const cleanup = () => {
        clearTimeout(timer);
        this.dataEmitter.off("data", onData);
        this.dataEmitter.off("error", onError);
      };

      const onData = () => { tryRead(); };

      if (!tryRead()) {
        this.dataEmitter.on("data", onData);
        this.dataEmitter.on("error", onError);
      }
    });
  }

  private async send(obj: LuaRequest): Promise<LuaResponse> {
    if (!this.proc || !this.proc.stdin) throw new Error("Process not started");
    if (this.killed) throw new Error("PoB API exited");
    if (!this.ready) throw new Error("Process not ready");
    if (this.isSending) throw new Error("Concurrent request not supported");

    this.isSending = true;
    try {
      this.proc.stdin.write(JSON.stringify(obj) + "\n");

      // Read lines until we get valid JSON response
      // Skip non-JSON lines (like "LOADING", warnings, etc.)
      let attempts = 0;
      const maxAttempts = 100;

      while (attempts < maxAttempts) {
        let line: string;
        try {
          line = await this.readLineWithTimeout(this.options.timeoutMs);
        } catch (err) {
          // A timed-out request leaves the protocol desynced: the late reply
          // would be consumed as the answer to the NEXT request. Kill the
          // process so the manager restarts from a clean state instead.
          if (err instanceof Error && /Timed out/.test(err.message)) {
            this.killed = true;
            this.buffer = "";
            try { this.proc?.kill(); } catch (e) { noteIgnoredError("kill on stop (process likely already exited)", e); }
            throw new Error("Timed out waiting for response; the PoB bridge was terminated to avoid protocol desync and will restart on the next call");
          }
          throw err;
        }
        attempts++;

        // Skip empty lines or lines that don't look like JSON (debug messages, etc.)
        if (!line.trim() || !line.trim().startsWith('{')) {
          continue;
        }

        // Try to parse as JSON
        try {
          const res = JSON.parse(line);
          return res;
        } catch (e) {
          // Not valid JSON, keep looking
          continue;
        }
      }

      throw new Error(`Failed to receive valid JSON response after ${maxAttempts} lines`);
    } finally {
      this.isSending = false;
    }
  }

  async ping(): Promise<boolean> {
    const res = await this.send({ action: "ping" });
    return !!res.ok;
  }

  async getCapabilities(): Promise<BridgeCapabilities> {
    const res = await this.send({ action: "get_capabilities" });
    if (!res.ok) return { mode: 'unreported', adapter: 'unknown', capabilitiesReported: false };
    // An ok response that carries no capabilities block means the bridge predates
    // this action — claiming 'fork/native' there would be fabricated.
    return (res.capabilities as BridgeCapabilities | undefined)
      ?? { mode: 'unreported', adapter: 'unknown', capabilitiesReported: false };
  }

  async newBuild(params?: { className?: string; ascendancy?: string }): Promise<BuildLoadResult> {
    const res = await this.send({ action: "new_build", params: params || {} });
    if (!res.ok) throw new Error(res.error || "new_build failed");
    this.loadedFilePath = undefined;
    this.buildGeneration++;
    return { ok: true };
  }

  async saveBuild(filePath: string, overwrite = false): Promise<SavedBuild> {
    const destination = path.resolve(filePath);
    const mayReplace = overwrite || this.loadedFilePath === destination;
    const generation = this.buildGeneration;
    const temporary = path.join(path.dirname(destination), `.pob-save-${randomUUID()}.tmp`);
    try {
      const res = await this.send({ action: "save_build", params: { path: temporary } });
      if (!res.ok) throw new Error(res.error || "save_build failed");
      const xml = await fs.readFile(temporary, 'utf8');
      await atomicWriteFile(destination, xml, mayReplace);
      if (this.buildGeneration === generation) this.loadedFilePath = destination;
      // size/path from the Lua save result are for the temp write; the
      // authoritative facts for callers are the final destination + bytes.
      return { path: destination, size: xml.length };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        throw new Error(`Refusing to overwrite existing build "${destination}". Pass overwrite: true to replace it, or choose a new name.`);
      }
      throw error;
    } finally {
      await fs.unlink(temporary).catch((error: unknown) => { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; });
    }
  }

  async loadBuildXml(xml: string, name = "API Build", sourcePath?: string): Promise<BuildLoadResult> {
    // A failed import may already have closed the previous native build.
    this.loadedFilePath = undefined;
    this.buildGeneration++;
    const res = await this.send({ action: "load_build_xml", params: { xml, name } });
    if (!res.ok) throw new Error(res.error || "load_build_xml failed");
    this.loadedFilePath = sourcePath ? path.resolve(sourcePath) : undefined;
    return { ok: true };
  }

  /**
   * Decodes a PoB import/export code (URL-safe base64 + zlib deflate — the
   * format PoB's desktop Import tab produces/consumes) and loads the
   * resulting build XML. Decoding happens here, not in the Lua bridge,
   * because the headless engine's own Inflate/Deflate are stubs that always
   * return "" — the real implementation lives in the native SimpleGraphic
   * host the desktop app links against, which headless mode has none of.
   */
  async importCode(code: string, name = "Imported Build"): Promise<BuildLoadResult> {
    const b64 = code.trim().replace(/-/g, "+").replace(/_/g, "/");
    const compressed = Buffer.from(b64, "base64");

    let xml: string;
    try {
      xml = zlib.inflateSync(compressed).toString("utf8");
    } catch (zlibErr) {
      try {
        xml = zlib.inflateRawSync(compressed).toString("utf8");
      } catch {
        const msg = zlibErr instanceof Error ? zlibErr.message : String(zlibErr);
        throw new Error(`Failed to decode import code: ${msg}`);
      }
    }

    return this.loadBuildXml(xml, name);
  }

  async getStats(fields?: string[]): Promise<StatsExport> {
    const res = await this.send({ action: "get_stats", params: { fields } });
    if (!res.ok) throw new Error(res.error || "get_stats failed");
    return res.stats as StatsExport;
  }

  async getTree(): Promise<TreeState> {
    const res = await this.send({ action: "get_tree" });
    if (!res.ok) throw new Error(res.error || "get_tree failed");
    return res.tree as TreeState;
  }

  

  async getItems(): Promise<EquippedItem[]> {
    const res = await this.send({ action: "get_items" });
    if (!res.ok) throw new Error(res.error || "get_items failed");
    return res.items as EquippedItem[];
  }

  async addItem(itemText: string, slotName?: string, noAutoEquip?: boolean): Promise<AddedItem> {
    const res = await this.send({
      action: "add_item_text",
      params: { text: itemText, slotName, noAutoEquip },
    });
    if (!res.ok) throw new Error(res.error || "add_item_text failed");
    return res.item as AddedItem;
  }

  async setFlaskActive(flaskIndex: number, active: boolean): Promise<void> {
    const res = await this.send({
      action: "set_flask_active",
      params: { index: flaskIndex, active },
    });
    if (!res.ok) throw new Error(res.error || "set_flask_active failed");
  }

  async getSkills(): Promise<SkillsOutput> {
    const res = await this.send({ action: "get_skills" });
    if (!res.ok) throw new Error(res.error || "get_skills failed");
    return res.skills as SkillsOutput;
  }

  async setMainSelection(params: {
    mainSocketGroup?: number;
    mainActiveSkill?: number;
    skillPart?: number;
  }): Promise<void> {
    const res = await this.send({ action: "set_main_selection", params });
    if (!res.ok) throw new Error(res.error || "set_main_selection failed");
  }

async setTree(params: {
    classId: number;
    ascendClassId: number;
    secondaryAscendClassId?: number;
    nodes: number[];
    masteryEffects?: Record<number, number>;
    treeVersion?: string;
  }): Promise<TreeState> {
    const res = await this.send({ action: "set_tree", params });
    if (!res.ok) throw new Error(res.error || "set_tree failed");
    return res.tree as TreeState;
  }

  async exportBuildXml(): Promise<string> {
    const res = await this.send({ action: "export_build_xml" });
    if (!res.ok) throw new Error(res.error || "export_build_xml failed");
    return res.xml as string;
  }

  async getBuildInfo(): Promise<BuildInfo> {
    const res = await this.send({ action: "get_build_info" });
    if (!res.ok) throw new Error(res.error || "get_build_info failed");
    return res.info as BuildInfo;
  }

  async setLevel(level: number): Promise<void> {
    const res = await this.send({ action: "set_level", params: { level } });
    if (!res.ok) throw new Error(res.error || "set_level failed");
  }

  async getConfig(): Promise<ConfigValues> {
    const res = await this.send({ action: "get_config" });
    if (!res.ok) throw new Error(res.error || "get_config failed");
    return res.config as ConfigValues;
  }

  /** Human-facing labels for dropdown config values (bandit "None" -> "Kill all"). */
  async getConfigLabels(): Promise<Record<string, string>> {
    const res = await this.send({ action: "get_config" });
    if (!res.ok) throw new Error(res.error || "get_config failed");
    return (res.labels as Record<string, string>) ?? {};
  }

  async setConfig(params: Record<string, string | number | boolean>): Promise<{
    applied: ConfigValues;
    rejected: Record<string, string>;
    config: ConfigValues;
  }> {
    const res = await this.send({ action: "set_config", params });
    if (!res.ok) throw new Error(res.error || "set_config failed");
    return {
      applied: (res.applied as ConfigValues) ?? {},
      rejected: (res.rejected as Record<string, string>) ?? {},
      config: (res.config as ConfigValues) ?? {},
    };
  }

  async createSocketGroup(params?: { label?: string; slot?: string; enabled?: boolean; includeInFullDPS?: boolean }): Promise<CreatedSocketGroup> {
    const res = await this.send({ action: "create_socket_group", params: params || {} });
    if (!res.ok) throw new Error(res.error || "create_socket_group failed");
    return res.socketGroup as CreatedSocketGroup;
  }

  async addGem(params: { groupIndex: number; gemName: string; level?: number; quality?: number; qualityId?: string; enabled?: boolean; count?: number }): Promise<AddedGem> {
    const res = await this.send({ action: "add_gem", params });
    if (!res.ok) throw new Error(res.error || "add_gem failed");
    return res.gem as AddedGem;
  }

  async setGemLevel(params: { groupIndex: number; gemIndex: number; level: number }): Promise<void> {
    const res = await this.send({ action: "set_gem_level", params });
    if (!res.ok) throw new Error(res.error || "set_gem_level failed");
  }

  async setGemQuality(params: { groupIndex: number; gemIndex: number; quality: number; qualityId?: string }): Promise<void> {
    const res = await this.send({ action: "set_gem_quality", params });
    if (!res.ok) throw new Error(res.error || "set_gem_quality failed");
  }

  async removeSkill(params: { groupIndex: number }): Promise<void> {
    const res = await this.send({ action: "remove_skill", params });
    if (!res.ok) throw new Error(res.error || "remove_skill failed");
  }

  async removeGem(params: { groupIndex: number; gemIndex: number }): Promise<void> {
    const res = await this.send({ action: "remove_gem", params });
    if (!res.ok) throw new Error(res.error || "remove_gem failed");
  }

  async setSocketGroupEnabled(params: { groupIndex: number; enabled: boolean }): Promise<{ groupIndex: number; label?: string; enabled: boolean }> {
    const res = await this.send({ action: "set_socket_group_enabled", params });
    if (!res.ok) throw new Error(res.error || "set_socket_group_enabled failed");
    return res.result as { groupIndex: number; label?: string; enabled: boolean };
  }

  async setGemEnabled(params: { groupIndex: number; gemIndex: number; enabled: boolean }): Promise<void> {
    const res = await this.send({ action: "set_gem_enabled", params });
    if (!res.ok) throw new Error(res.error || "set_gem_enabled failed");
  }

  async searchNodes(params: { keyword: string; nodeType?: string; maxResults?: number; includeAllocated?: boolean }): Promise<SearchNodesResult> {
    const res = await this.send({ action: "search_nodes", params });
    if (!res.ok) throw new Error(res.error || "search_nodes failed");
    return res.results as SearchNodesResult;
  }

  async updateTreeDelta(params: { addNodes?: Array<number | string>; removeNodes?: Array<number | string>; masteryEffects?: Record<string, number>; classId?: number; ascendClassId?: number; secondaryAscendClassId?: number; treeVersion?: string; }): Promise<{ tree: TreeState; droppedNodes?: number[] }> {
    const res = await this.send({ action: "update_tree_delta", params });
    if (!res.ok) throw new Error(res.error || "update_tree_delta failed");
    return {
      tree: res.tree as TreeState,
      droppedNodes: res.droppedNodes as number[] | undefined,
    };
  }

  async calcWith(params: { addNodes?: Array<number | string>; removeNodes?: Array<number | string>; masteryEffects?: Record<string | number, number>; useFullDPS?: boolean }): Promise<CalcOutput> {
    const res = await this.send({ action: "calc_with", params });
    if (!res.ok) throw new Error(res.error || "calc_with failed");
    return res.output as CalcOutput;
  }

  async getMasteryOptions(): Promise<MasteryOptions> {
    const res = await this.send({ action: "get_mastery_options" });
    if (!res.ok) throw new Error(res.error || "get_mastery_options failed");
    return res.result as MasteryOptions;
  }

  async getAilments(): Promise<{ ailments: AilmentReport[] }> {
    const res = await this.send({ action: "get_ailments" });
    if (!res.ok) throw new Error(res.error || "get_ailments failed");
    const result = res.result;
    if (!result || typeof result !== "object" || !Array.isArray((result as { ailments?: unknown }).ailments)) {
      throw new Error("get_ailments returned an unexpected shape");
    }
    return result as { ailments: AilmentReport[] };
  }

  async evaluateAnointCandidates(params: { slot: string; focus?: 'dps' | 'defence' | 'both'; limit?: number }): Promise<{
    candidates: Array<{ nodeId: number | string; name: string; dpsDelta: number; ehpDelta: number; score: number; recipe?: string[] }>;
    base: { CombinedDPS: number; TotalEHP: number }; evaluated: number; skipped: number; slot: string; baseType: string; focus: string;
  }> {
    const res = await this.send({ action: 'evaluate_anoint_candidates', params });
    if (!res.ok) throw new Error(res.error || 'evaluate_anoint_candidates failed');
    // The bridge handler replies with the result fields at the envelope top
    // level (no nested `result`), hence reading from `res` itself.
    const { ok: _ok, ...result } = res;
    return result as unknown as {
      candidates: Array<{ nodeId: number | string; name: string; dpsDelta: number; ehpDelta: number; score: number; recipe?: string[] }>;
      base: { CombinedDPS: number; TotalEHP: number }; evaluated: number; skipped: number; slot: string; baseType: string; focus: string;
    };
  }

  async generateWeightedTradeQuery(slot: string, options?: Record<string, unknown>): Promise<{ query: unknown; warning?: string }> {
    const res = await this.send({ action: 'generate_weighted_trade_query', params: { slot, options: options || {} } });
    if (!res.ok) throw new Error(res.error || 'generate_weighted_trade_query failed');
    const query = typeof res.query === 'string' ? JSON.parse(res.query) : res.query;
    return { query, warning: typeof res.warning === 'string' ? res.warning : undefined };
  }

  async createSpec(params?: { title?: string; copyFrom?: number; activate?: boolean }): Promise<SpecList> {
    const res = await this.send({ action: "create_spec", params: params || {} });
    if (!res.ok) throw new Error(res.error || "create_spec failed");
    return res.result as SpecList;
  }

  async listSpecs(): Promise<SpecList> {
    const res = await this.send({ action: "list_specs" });
    if (!res.ok) throw new Error(res.error || "list_specs failed");
    return res.result as SpecList;
  }

  async selectSpec(index: number): Promise<SpecList> {
    const res = await this.send({ action: "select_spec", params: { index } });
    if (!res.ok) throw new Error(res.error || "select_spec failed");
    return res.result as SpecList;
  }

  async deleteSpec(index: number): Promise<SpecList> {
    const res = await this.send({ action: "delete_spec", params: { index } });
    if (!res.ok) throw new Error(res.error || "delete_spec failed");
    return res.result as SpecList;
  }

  async renameSpec(index: number, title: string): Promise<SpecList> {
    const res = await this.send({ action: "rename_spec", params: { index, title } });
    if (!res.ok) throw new Error(res.error || "rename_spec failed");
    return res.result as SpecList;
  }

  async listItemSets(): Promise<ItemSetList> {
    const res = await this.send({ action: "list_item_sets" });
    if (!res.ok) throw new Error(res.error || "list_item_sets failed");
    return res.result as ItemSetList;
  }

  async selectItemSet(id: number): Promise<ItemSetList> {
    const res = await this.send({ action: "select_item_set", params: { id } });
    if (!res.ok) throw new Error(res.error || "select_item_set failed");
    return res.result as ItemSetList;
  }

  async stop(): Promise<void> {
    if (!this.proc) return;
    try {
      await this.send({ action: "quit" });
    } catch (e) { noteIgnoredError('graceful quit handshake (hard kill follows)', e); }
    this.proc.kill();
    this.proc = null;
  }
}
