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

  // These tests verify the API surface exists
  describe('API surface', () => {
    let client: PoBLuaApiClient;

    beforeEach(() => {
      client = new PoBLuaApiClient();
    });

    it('should have start method', () => {
      expect(typeof client.start).toBe('function');
    });

    it('should have stop method', () => {
      expect(typeof client.stop).toBe('function');
    });

    it('should have ping method', () => {
      expect(typeof client.ping).toBe('function');
    });

    it('should have loadBuildXml method', () => {
      expect(typeof client.loadBuildXml).toBe('function');
    });

    it('should have getStats method', () => {
      expect(typeof client.getStats).toBe('function');
    });

    it('should have getTree method', () => {
      expect(typeof client.getTree).toBe('function');
    });

    it('should have setTree method', () => {
      expect(typeof client.setTree).toBe('function');
    });

    it('should have getItems method', () => {
      expect(typeof client.getItems).toBe('function');
    });

    it('should have addItem method', () => {
      expect(typeof client.addItem).toBe('function');
    });

    it('should have setFlaskActive method', () => {
      expect(typeof client.setFlaskActive).toBe('function');
    });

    it('should have getSkills method', () => {
      expect(typeof client.getSkills).toBe('function');
    });

    it('should have setMainSelection method', () => {
      expect(typeof client.setMainSelection).toBe('function');
    });
  });
});

describe('PoBLuaTcpClient - API surface', () => {
  // Just verify the class exists and can be imported
  it('should be able to import PoBLuaTcpClient', async () => {
    const { PoBLuaTcpClient } = await import('../../src/pobLuaBridge');
    expect(PoBLuaTcpClient).toBeDefined();
  });
});
