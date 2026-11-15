/**
 * Lua Client Manager
 *
 * Manages the lifecycle of the PoB Lua Bridge (stdio headless mode)
 */

import { PoBLuaApiClient } from '../pobLuaBridge.js';
import { noteIgnoredError } from '../utils/errorHandling.js';
import { BOOTSTRAP_BUILD_NAME } from './bootstrapBuild.js';
import { resolveLuaCommand } from '../utils/luaCommand.js';
import path from 'node:path';

/**
 * Resolve a repo-owned file relative to this module, not process.cwd() —
 * MCP clients like Claude Desktop launch the server with an arbitrary cwd.
 *
 * Resolved on call and without the bare `import.meta` meta-property: it is a
 * hard compile error under the CommonJS ts-jest transform (TS1343), which made
 * this module — the bridge lifecycle — impossible to import in tests, and a
 * module-scope const would break importing the file even when unused.
 *
 * ESM fallback: a module URL must be constructed without process.cwd(), and
 * the only cwd-free options (import.meta, or eval'd meta-property) are either
 * a compile break in CJS or a new runtime dependency. So in ESM (the production
 * build) we resolve via the require cache of an anchor require built from the
 * entry module's wrapper directory — see the caller comment in index.ts: it
 * sets POB_REPO_ROOT at startup, which is the authoritative source; this
 * fallback exists only for library use without that env var.
 */
function repoPath(...segments: string[]): string {
  if (process.env.POB_REPO_ROOT) {
    return path.join(process.env.POB_REPO_ROOT, ...segments);
  }
  if (typeof require !== 'undefined' && typeof __dirname !== 'undefined') {
    return path.join(__dirname, '..', '..', ...segments);
  }
  throw new Error(
    'Cannot locate repo-owned Lua files: set POB_REPO_ROOT (the shipped server entry sets it automatically)',
  );
}

export class LuaClientManager {
  private client: PoBLuaApiClient | null = null;
  private enabled: boolean;
  private starting: Promise<void> | null = null;
  private stopping: Promise<void> | null = null;

  constructor(enabled: boolean) {
    this.enabled = enabled;
  }

  /**
   * Get the current client instance
   */
  getClient(): PoBLuaApiClient | null {
    return this.client;
  }

  /**
   * Ensure the Lua client is initialized and ready
   */
  async ensureClient(): Promise<void> {
    if (!this.enabled) {
      throw new Error('PoB Lua Bridge is not enabled. Set POB_LUA_ENABLED=true to use lua_* tools.');
    }

    // A stop is draining — join it before deciding anything. stopClient()
    // awaits the quit handshake BEFORE clearing this.client, so without this
    // a concurrent tool call saw the (already killing) client as healthy,
    // returned it, and the stop then killed it mid-use — or worse, raced a
    // fresh spawn against the kill.
    if (this.stopping) {
      await this.stopping.catch(() => {});
    }

    // A start is already in flight — join it instead of spawning a second process
    if (this.starting) {
      return this.starting;
    }

    if (this.client && this.client.isAlive()) {
      return; // Already initialized and healthy
    }

    let crashed = false;
    let deadClient: PoBLuaApiClient | null = null;
    if (this.client) {
      // Process died — clean up the dead client so we restart below
      console.error('[Lua Bridge] Client process died, restarting...');
      crashed = true;
      deadClient = this.client;
      this.client = null;
    }

    // Reserve the starting slot SYNCHRONOUSLY before awaiting anything.
    // The old order (await dead.stop(), THEN set this.starting) let a second
    // concurrent ensureClient() — two tool calls in one stdio read batch —
    // see starting===null and a dead client, take the same path, and spawn a
    // second bridge whose process nothing could ever stop.
    const pending = (async () => {
      if (deadClient) {
        try { await deadClient.stop(); } catch (e) { noteIgnoredError("stop of crashed bridge before restart (process already gone)", e); }
      }
      await this.initClient();
      if (crashed) {
        // The restarted bridge holds only the init-test build; proceeding silently
        // would return blank-character stats as if they were the user's build.
        throw new Error('The PoB Lua bridge crashed and was restarted. The previously loaded build was lost — reload it with lua_load_build, then retry.');
      }
    })();
    this.starting = pending;
    try {
      await pending;
    } finally {
      if (this.starting === pending) {
        this.starting = null;
      }
    }
  }

  private async initClient(): Promise<void> {
    console.error('[Lua Bridge] Initializing client...');

    const launch = resolveLuaCommand(process.env, [repoPath('lua', 'vanilla_stdio_bridge.lua')]);
    const stdioClient = new PoBLuaApiClient({
      cwd: process.env.POB_PATH || process.env.POB_FORK_PATH,
      cmd: launch.cmd,
      args: launch.args,
      // The repo-owned adapter calls HeadlessWrapper as a library; nothing in
      // the PoB checkout may take over stdin/stdout first.
      env: { POB_API_STDIO: '0' },
      timeoutMs: process.env.POB_TIMEOUT_MS ? parseInt(process.env.POB_TIMEOUT_MS) : undefined,
    });

    try {
      await stdioClient.start();
      console.error('[Lua Bridge] Client initialized successfully');

      // Wait for HeadlessWrapper to be fully ready (loadBuildFromXML available)
      console.error('[Lua Bridge] Waiting for HeadlessWrapper to finish loading...');
      // Omitting targetVersion opens PoB's legacy conversion prompt and leaves initialization incomplete.
      const testXml = '<?xml version="1.0" encoding="UTF-8"?><PathOfBuilding><Build level="1" targetVersion="3_0" className="Witch"/></PathOfBuilding>';
      let attempts = 0;
      const maxAttempts = 5;

      while (attempts < maxAttempts) {
        try {
          await stdioClient.loadBuildXml(testXml, BOOTSTRAP_BUILD_NAME);
          console.error('[Lua Bridge] HeadlessWrapper fully initialized');
          break;
        } catch (loadError) {
          attempts++;
          if (attempts >= maxAttempts) {
            throw new Error(`HeadlessWrapper did not initialize after ${maxAttempts} attempts. Error: ${loadError instanceof Error ? loadError.message : String(loadError)}`);
          }
          console.error(`[Lua Bridge] HeadlessWrapper not ready (attempt ${attempts}/${maxAttempts}), waiting 2s...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      // Only expose the client once it has proven it can load a build
      this.client = stdioClient;
    } catch (error) {
      // Don't leak a half-initialized process, and don't let a later
      // ensureClient() treat this unverified client as healthy
      try { await stdioClient.stop(); } catch (e) { noteIgnoredError("stop of half-initialized bridge (start is what failed)", e); }
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error('[Lua Bridge] Failed to initialize:', errorMsg);
      throw new Error(`Failed to start PoB Lua Bridge: ${errorMsg}`);
    }
  }

  /**
   * Stop the Lua client
   */
  async stopClient(): Promise<void> {
    if (this.stopping) {
      return this.stopping;
    }
    // Reserve the stopping slot SYNCHRONOUSLY (the starting slot lesson): the
    // quit handshake yields, and anything that races in must see the stop,
    // not a live client. A start already in flight gets joined first — the
    // bridge being spawned is then stopped, never orphaned.
    const pending = (async () => {
      if (this.starting) {
        await this.starting.catch(() => {});
      }
      if (this.client) {
        console.error('[Lua Bridge] Stopping client...');
        try {
          await this.client.stop();
        } catch (error) {
          console.error('[Lua Bridge] Error stopping client:', error);
        }
        this.client = null;
      }
    })();
    this.stopping = pending;
    try {
      await pending;
    } finally {
      if (this.stopping === pending) {
        this.stopping = null;
      }
    }
  }

  /**
   * Check if Lua bridge is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }
}
