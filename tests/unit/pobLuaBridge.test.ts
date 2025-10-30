import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { MockPoBProcess, createMockSpawn } from '../mocks/pobProcess.mock.js';
import { SAMPLE_BUILD_XML, SAMPLE_ITEMS } from '../mocks/responses.mock.js';

// Mock child_process before importing the module
const mockSpawn = createMockSpawn();
jest.mock('child_process', () => ({
  spawn: mockSpawn,
}));

// Now import after mocking
import { PoBLuaApiClient } from '../../src/pobLuaBridge.js';

describe('PoBLuaApiClient', () => {
  let client: PoBLuaApiClient;
  let mockProcess: MockPoBProcess;

  beforeEach(() => {
    jest.clearAllMocks();
    client = new PoBLuaApiClient({
      cwd: '/test/path',
      cmd: 'luajit',
      timeoutMs: 1000,
    });
  });

  afterEach(async () => {
    if (client) {
      await client.stop();
    }
  });

  describe('Initialization', () => {
    it('should spawn luajit process with correct arguments', async () => {
      await client.start();

      expect(mockSpawn).toHaveBeenCalledWith(
        'luajit',
        ['HeadlessWrapper.lua'],
        expect.objectContaining({
          cwd: '/test/path',
          env: expect.objectContaining({ POB_API_STDIO: '1' }),
          stdio: ['pipe', 'pipe', 'pipe'],
        })
      );
    });

    it('should wait for ready banner before resolving', async () => {
      const startPromise = client.start();
      await expect(startPromise).resolves.toBeUndefined();

      mockProcess = mockSpawn.getLastProcess()!;
      expect(mockProcess).toBeDefined();
    });

    it('should timeout if ready banner not received', async () => {
      // Create client with very short timeout
      client = new PoBLuaApiClient({ timeoutMs: 100 });

      // Mock process that never sends ready
      mockSpawn.mockImplementationOnce(() => {
        const proc = new MockPoBProcess();
        // Override to never send ready
        proc.stdout.removeAllListeners('data');
        return proc;
      });

      await expect(client.start()).rejects.toThrow(/Timed out|Failed to find valid ready banner/);
    });

    it('should handle multiple non-JSON lines before ready banner', async () => {
      mockSpawn.mockImplementationOnce(() => {
        const proc = new MockPoBProcess();
        // Send some log lines before ready
        process.nextTick(() => {
          proc.stdout.emit('data', 'Loading modules...\n');
          proc.stdout.emit('data', 'Initializing...\n');
          proc.stdout.emit('data', '{"ready":true}\n');
        });
        return proc;
      });

      await expect(client.start()).resolves.toBeUndefined();
    });

    it('should only initialize once', async () => {
      await client.start();
      await client.start(); // Second call should be no-op

      expect(mockSpawn).toHaveBeenCalledTimes(1);
    });
  });

  describe('ping', () => {
    beforeEach(async () => {
      await client.start();
      mockProcess = mockSpawn.getLastProcess()!;
    });

    it('should return true on successful ping', async () => {
      const result = await client.ping();
      expect(result).toBe(true);
    });

    it('should send correct JSON to stdin', async () => {
      await client.ping();

      const lastRequest = mockProcess.getLastRequest();
      expect(lastRequest).toEqual({ action: 'ping' });
    });
  });

  describe('loadBuildXml', () => {
    beforeEach(async () => {
      await client.start();
      mockProcess = mockSpawn.getLastProcess()!;
    });

    it('should send load_build_xml action with XML', async () => {
      await client.loadBuildXml(SAMPLE_BUILD_XML);

      const lastRequest = mockProcess.getLastRequest();
      expect(lastRequest).toEqual({
        action: 'load_build_xml',
        params: { xml: SAMPLE_BUILD_XML, name: 'API Build' },
      });
    });

    it('should accept custom build name', async () => {
      await client.loadBuildXml(SAMPLE_BUILD_XML, 'Custom Name');

      const lastRequest = mockProcess.getLastRequest();
      expect(lastRequest?.params?.name).toBe('Custom Name');
    });

    it('should throw on error response', async () => {
      mockProcess.registerError('load_build_xml', 'invalid_xml');

      await expect(client.loadBuildXml('<invalid>')).rejects.toThrow('Failed to parse XML');
    });
  });

  describe('getStats', () => {
    beforeEach(async () => {
      await client.start();
      mockProcess = mockSpawn.getLastProcess()!;
    });

    it('should return stats object', async () => {
      const stats = await client.getStats();

      expect(stats).toBeDefined();
      expect(stats.Life).toBe(5000);
      expect(stats.TotalDPS).toBe(1000000);
    });

    it('should request all stats when no fields specified', async () => {
      await client.getStats();

      const lastRequest = mockProcess.getLastRequest();
      expect(lastRequest).toEqual({
        action: 'get_stats',
        params: { fields: undefined },
      });
    });

    it('should request specific fields when provided', async () => {
      await client.getStats(['Life', 'TotalDPS']);

      const lastRequest = mockProcess.getLastRequest();
      expect(lastRequest?.params?.fields).toEqual(['Life', 'TotalDPS']);
    });

    it('should throw when build not loaded', async () => {
      mockProcess.registerError('get_stats', 'build_not_initialized');

      await expect(client.getStats()).rejects.toThrow('build not initialized');
    });
  });

  describe('getTree', () => {
    beforeEach(async () => {
      await client.start();
      mockProcess = mockSpawn.getLastProcess()!;
    });

    it('should return tree data', async () => {
      const tree = await client.getTree();

      expect(tree).toBeDefined();
      expect(tree.classId).toBe(2);
      expect(tree.ascendClassId).toBe(1);
      expect(Array.isArray(tree.nodes)).toBe(true);
    });

    it('should include all tree metadata', async () => {
      const tree = await client.getTree();

      expect(tree).toHaveProperty('treeVersion');
      expect(tree).toHaveProperty('classId');
      expect(tree).toHaveProperty('ascendClassId');
      expect(tree).toHaveProperty('nodes');
      expect(tree).toHaveProperty('masteryEffects');
    });
  });

  describe('setTree', () => {
    beforeEach(async () => {
      await client.start();
      mockProcess = mockSpawn.getLastProcess()!;
    });

    it('should send tree parameters', async () => {
      await client.setTree({
        classId: 2,
        ascendClassId: 1,
        nodes: [1, 2, 3, 4, 5],
      });

      const lastRequest = mockProcess.getLastRequest();
      expect(lastRequest).toEqual({
        action: 'set_tree',
        params: {
          classId: 2,
          ascendClassId: 1,
          nodes: [1, 2, 3, 4, 5],
          secondaryAscendClassId: undefined,
          masteryEffects: undefined,
          treeVersion: undefined,
        },
      });
    });

    it('should include optional parameters when provided', async () => {
      await client.setTree({
        classId: 0,
        ascendClassId: 1,
        secondaryAscendClassId: 2,
        nodes: [1, 2, 3],
        masteryEffects: { 100: 200 },
        treeVersion: '3_26',
      });

      const lastRequest = mockProcess.getLastRequest();
      expect(lastRequest?.params?.secondaryAscendClassId).toBe(2);
      expect(lastRequest?.params?.masteryEffects).toEqual({ 100: 200 });
      expect(lastRequest?.params?.treeVersion).toBe('3_26');
    });
  });

  describe('Phase 4: Item Methods', () => {
    beforeEach(async () => {
      await client.start();
      mockProcess = mockSpawn.getLastProcess()!;
    });

    describe('getItems', () => {
      it('should return items array', async () => {
        const items = await client.getItems();

        expect(Array.isArray(items)).toBe(true);
        expect(items.length).toBeGreaterThan(0);
      });

      it('should include item details', async () => {
        const items = await client.getItems();
        const weapon = items.find((i) => i.slot === 'Weapon 1');

        expect(weapon).toBeDefined();
        expect(weapon?.name).toBe('Death Bow');
        expect(weapon?.baseName).toBe('Thicket Bow');
      });
    });

    describe('addItem', () => {
      it('should send item text and return result', async () => {
        const result = await client.addItem(SAMPLE_ITEMS.weapon);

        expect(result).toBeDefined();
        expect(result.id).toBe(123);
        expect(result.name).toBe('Steel Blade');
        expect(result.slot).toBe('Weapon 1');
      });

      it('should accept optional slot name', async () => {
        await client.addItem(SAMPLE_ITEMS.weapon, 'Weapon 2');

        const lastRequest = mockProcess.getLastRequest();
        expect(lastRequest?.params?.slotName).toBe('Weapon 2');
      });

      it('should accept noAutoEquip flag', async () => {
        await client.addItem(SAMPLE_ITEMS.weapon, undefined, true);

        const lastRequest = mockProcess.getLastRequest();
        expect(lastRequest?.params?.noAutoEquip).toBe(true);
      });
    });

    describe('setFlaskActive', () => {
      it('should toggle flask activation', async () => {
        await client.setFlaskActive(1, true);

        const lastRequest = mockProcess.getLastRequest();
        expect(lastRequest).toEqual({
          action: 'set_flask_active',
          params: { index: 1, active: true },
        });
      });

      it('should handle deactivation', async () => {
        await client.setFlaskActive(3, false);

        const lastRequest = mockProcess.getLastRequest();
        expect(lastRequest?.params?.active).toBe(false);
      });
    });
  });

  describe('Phase 4: Skill Methods', () => {
    beforeEach(async () => {
      await client.start();
      mockProcess = mockSpawn.getLastProcess()!;
    });

    describe('getSkills', () => {
      it('should return skill data', async () => {
        const skills = await client.getSkills();

        expect(skills).toBeDefined();
        expect(skills.mainSocketGroup).toBe(1);
        expect(Array.isArray(skills.groups)).toBe(true);
      });

      it('should include skill group details', async () => {
        const skills = await client.getSkills();
        const mainGroup = skills.groups[0];

        expect(mainGroup.index).toBe(1);
        expect(mainGroup.label).toBe('Main 6L');
        expect(Array.isArray(mainGroup.skills)).toBe(true);
        expect(mainGroup.enabled).toBe(true);
      });
    });

    describe('setMainSelection', () => {
      it('should set main socket group', async () => {
        await client.setMainSelection({ mainSocketGroup: 2 });

        const lastRequest = mockProcess.getLastRequest();
        expect(lastRequest?.params?.mainSocketGroup).toBe(2);
      });

      it('should accept all optional parameters', async () => {
        await client.setMainSelection({
          mainSocketGroup: 1,
          mainActiveSkill: 2,
          skillPart: 3,
        });

        const lastRequest = mockProcess.getLastRequest();
        expect(lastRequest?.params).toEqual({
          mainSocketGroup: 1,
          mainActiveSkill: 2,
          skillPart: 3,
        });
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle process crash', async () => {
      await client.start();
      mockProcess = mockSpawn.getLastProcess()!;

      // Simulate process crash
      mockProcess.crash();

      await expect(client.ping()).rejects.toThrow(/PoB API exited/);
    });

    it('should handle invalid JSON response', async () => {
      await client.start();
      mockProcess = mockSpawn.getLastProcess()!;

      // Send invalid JSON
      mockProcess.stdout.emit('data', 'not json\n');

      await expect(client.ping()).rejects.toThrow(/Invalid JSON/);
    });

    it('should handle timeout', async () => {
      await client.start();
      mockProcess = mockSpawn.getLastProcess()!;

      // Make process hang
      mockProcess.simulateHang();

      await expect(client.ping()).rejects.toThrow(/Timed out/);
    });

    it('should throw when calling methods before start', async () => {
      await expect(client.ping()).rejects.toThrow(/Process not started/);
    });
  });

  describe('Lifecycle', () => {
    it('should clean up on stop', async () => {
      await client.start();
      mockProcess = mockSpawn.getLastProcess()!;

      await client.stop();

      expect(mockProcess.killed).toBe(true);
    });

    it('should handle stop when not started', async () => {
      await expect(client.stop()).resolves.toBeUndefined();
    });

    it('should handle multiple stop calls', async () => {
      await client.start();

      await client.stop();
      await client.stop();

      // Should not throw
    });
  });
});
