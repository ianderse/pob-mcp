/**
 * Lua Client Manager
 *
 * Manages the lifecycle of PoB Lua Bridge clients (stdio or TCP mode)
 */

import { PoBLuaApiClient, PoBLuaTcpClient } from '../pobLuaBridge.js';

export class LuaClientManager {
  private client: PoBLuaApiClient | PoBLuaTcpClient | null = null;
  private enabled: boolean;
  private useTcpMode: boolean;

  constructor(enabled: boolean, useTcpMode: boolean) {
    this.enabled = enabled;
    this.useTcpMode = useTcpMode;
  }

  /**
   * Get the current client instance
   */
  getClient(): PoBLuaApiClient | PoBLuaTcpClient | null {
    return this.client;
  }

  /**
   * Ensure the Lua client is initialized and ready
   */
  async ensureClient(): Promise<void> {
    if (!this.enabled) {
      throw new Error('PoB Lua Bridge is not enabled. Set POB_LUA_ENABLED=true to use lua_* tools.');
    }

    if (this.client) {
      return; // Already initialized
    }

    console.error('[Lua Bridge] Initializing client...');

    try {
      if (this.useTcpMode) {
        const tcpClient = new PoBLuaTcpClient({
          host: process.env.POB_API_TCP_HOST,
          port: process.env.POB_API_TCP_PORT ? parseInt(process.env.POB_API_TCP_PORT) : undefined,
          timeoutMs: process.env.POB_TIMEOUT_MS ? parseInt(process.env.POB_TIMEOUT_MS) : undefined,
        });
        await tcpClient.start();
        this.client = tcpClient;
      } else {
        const stdioClient = new PoBLuaApiClient({
          cwd: process.env.POB_FORK_PATH,
          cmd: process.env.POB_CMD,
          args: process.env.POB_ARGS ? [process.env.POB_ARGS] : undefined,
          timeoutMs: process.env.POB_TIMEOUT_MS ? parseInt(process.env.POB_TIMEOUT_MS) : undefined,
        });
        await stdioClient.start();
        this.client = stdioClient;
      }

      console.error('[Lua Bridge] Client initialized successfully');

      // Wait for HeadlessWrapper to be fully ready (loadBuildFromXML available)
      console.error('[Lua Bridge] Waiting for HeadlessWrapper to finish loading...');
      const testXml = '<?xml version="1.0" encoding="UTF-8"?><PathOfBuilding><Build level="1" className="Witch"/></PathOfBuilding>';
      let attempts = 0;
      const maxAttempts = 5;

      while (attempts < maxAttempts) {
        try {
          await this.client.loadBuildXml(testXml, 'Init Test');
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
    } catch (error) {
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

  /**
   * Check if using TCP mode
   */
  isTcpMode(): boolean {
    return this.useTcpMode;
  }
}
