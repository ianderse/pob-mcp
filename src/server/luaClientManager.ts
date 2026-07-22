/**
 * Lua Client Manager
 *
 * Manages the lifecycle of the PoB Lua Bridge (stdio headless mode)
 */

import { PoBLuaApiClient } from '../pobLuaBridge.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolve repo-owned files relative to this module, not process.cwd() —
// MCP clients like Claude Desktop launch the server with an arbitrary cwd.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export class LuaClientManager {
  private client: PoBLuaApiClient | null = null;
  private enabled: boolean;
  private starting: Promise<void> | null = null;

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

    // A start is already in flight — join it instead of spawning a second process
    if (this.starting) {
      return this.starting;
    }

    let crashed = false;
    if (this.client) {
      if (this.client.isAlive()) {
        return; // Already initialized and healthy
      }
      // Process died — clean up the dead client so we restart below
      console.error('[Lua Bridge] Client process died, restarting...');
      crashed = true;
      try { await this.client.stop(); } catch {}
      this.client = null;
    }

    this.starting = this.initClient();
    try {
      await this.starting;
    } finally {
      this.starting = null;
    }

    if (crashed) {
      // The restarted bridge holds only the init-test build; proceeding silently
      // would return blank-character stats as if they were the user's build.
      throw new Error('The PoB Lua bridge crashed and was restarted. The previously loaded build was lost — reload it with lua_load_build, then retry.');
    }
  }

  private async initClient(): Promise<void> {
    console.error('[Lua Bridge] Initializing client...');

    const vanillaAdapter = process.env.POB_VANILLA === 'true';
    const stdioClient = new PoBLuaApiClient({
      cwd: process.env.POB_FORK_PATH,
      cmd: process.env.POB_CMD,
      args: process.env.POB_ARGS ? process.env.POB_ARGS.split(/\s+/).filter(Boolean) : vanillaAdapter ? [path.join(repoRoot, 'lua', 'vanilla_stdio_bridge.lua')] : undefined,
      // The repo-owned vanilla adapter calls HeadlessWrapper as a library; its
      // own JSON-lines loop must not take over stdin/stdout first.
      env: vanillaAdapter ? { POB_API_STDIO: '0' } : undefined,
      timeoutMs: process.env.POB_TIMEOUT_MS ? parseInt(process.env.POB_TIMEOUT_MS) : undefined,
    });

    try {
      await stdioClient.start();
      console.error('[Lua Bridge] Client initialized successfully');

      // Wait for HeadlessWrapper to be fully ready (loadBuildFromXML available)
      console.error('[Lua Bridge] Waiting for HeadlessWrapper to finish loading...');
      const testXml = '<?xml version="1.0" encoding="UTF-8"?><PathOfBuilding><Build level="1" className="Witch"/></PathOfBuilding>';
      let attempts = 0;
      const maxAttempts = 5;

      while (attempts < maxAttempts) {
        try {
          await stdioClient.loadBuildXml(testXml, 'Init Test');
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
      try { await stdioClient.stop(); } catch {}
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error('[Lua Bridge] Failed to initialize:', errorMsg);
      throw new Error(`Failed to start PoB Lua Bridge: ${errorMsg}`);
    }
  }

  /**
   * Stop the Lua client
   */
  async stopClient(): Promise<void> {
    if (this.client) {
      console.error('[Lua Bridge] Stopping client...');
      try {
        await this.client.stop();
      } catch (error) {
        console.error('[Lua Bridge] Error stopping client:', error);
      }
      this.client = null;
    }
  }

  /**
   * Check if Lua bridge is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }
}
