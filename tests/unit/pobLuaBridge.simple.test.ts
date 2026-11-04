/**
 * Simple unit tests for PoBLuaApiClient
 * These tests focus on testing the client logic without complex mocking
 */

import { PoBLuaApiClient } from '../../src/pobLuaBridge';

describe('PoBLuaApiClient - Simple Tests', () => {
  describe('Initialization', () => {
    it('should create a client with default options', () => {
      const client = new PoBLuaApiClient();
      expect(client).toBeDefined();
    });

    it('should create a client with custom options', () => {
      const client = new PoBLuaApiClient({
        cwd: '/test/path',
        cmd: 'custom-luajit',
        timeoutMs: 5000,
      });
      expect(client).toBeDefined();
    });

    it('should handle stop when not started', async () => {
      const client = new PoBLuaApiClient();
      // Should not throw
      await expect(client.stop()).resolves.toBeUndefined();
    });
  });

  describe('Error handling before initialization', () => {
    it('should throw when calling ping before start', async () => {
      const client = new PoBLuaApiClient();
      await expect(client.ping()).rejects.toThrow();
    });

    it('should throw when calling getStats before start', async () => {
      const client = new PoBLuaApiClient();
      await expect(client.getStats()).rejects.toThrow();
    });

    it('should throw when calling loadBuildXml before start', async () => {
      const client = new PoBLuaApiClient();
      await expect(client.loadBuildXml('<Build></Build>')).rejects.toThrow();
    });
  });
});
