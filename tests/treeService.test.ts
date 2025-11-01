import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { TreeService } from '../src/services/treeService';
import { BuildService } from '../src/services/buildService';
import type { PassiveTreeNode, PassiveTreeData, PoBBuild } from '../src/types';

// Mock BuildService
jest.mock('../src/services/buildService');

describe('TreeService', () => {
  let treeService: TreeService;
  let mockBuildService: jest.Mocked<BuildService>;

  beforeEach(() => {
    mockBuildService = new BuildService('/test/pob') as jest.Mocked<BuildService>;
    treeService = new TreeService(mockBuildService);
  });

  describe('categorizeNodes', () => {
    it('should categorize keystones correctly', () => {
      const nodes: PassiveTreeNode[] = [
        { skill: 1, name: 'Keystone 1', isKeystone: true },
        { skill: 2, name: 'Notable 1', isNotable: true },
        { skill: 3, name: 'Normal 1' },
      ];

      const result = treeService.categorizeNodes(nodes);

      expect(result.keystones).toHaveLength(1);
      expect(result.keystones[0].name).toBe('Keystone 1');
    });

    it('should categorize notables correctly', () => {
      const nodes: PassiveTreeNode[] = [
        { skill: 1, name: 'Notable 1', isNotable: true },
        { skill: 2, name: 'Mastery 1', isMastery: true },
        { skill: 3, name: 'Normal 1' },
      ];

      const result = treeService.categorizeNodes(nodes);

      expect(result.notables).toHaveLength(2);
      expect(result.notables[0].name).toBe('Notable 1');
      expect(result.notables[1].name).toBe('Mastery 1');
    });

    it('should categorize jewel sockets correctly', () => {
      const nodes: PassiveTreeNode[] = [
        { skill: 1, name: 'Jewel 1', isJewelSocket: true },
        { skill: 2, name: 'Normal 1' },
      ];

      const result = treeService.categorizeNodes(nodes);

      expect(result.jewels).toHaveLength(1);
      expect(result.jewels[0].name).toBe('Jewel 1');
    });

    it('should categorize normal nodes correctly', () => {
      const nodes: PassiveTreeNode[] = [
        { skill: 1, name: 'Normal 1' },
        { skill: 2, name: 'Normal 2' },
        { skill: 3, name: 'Notable 1', isNotable: true },
      ];

      const result = treeService.categorizeNodes(nodes);

      expect(result.normal).toHaveLength(2);
    });

    it('should handle empty array', () => {
      const result = treeService.categorizeNodes([]);

      expect(result.keystones).toHaveLength(0);
      expect(result.notables).toHaveLength(0);
      expect(result.jewels).toHaveLength(0);
      expect(result.normal).toHaveLength(0);
    });
  });

  describe('calculatePassivePoints', () => {
    it('should calculate points for level 90 character', () => {
      const build = { Build: { level: '90' } } as PoBBuild;
      const allocatedCount = 100;

      const result = treeService.calculatePassivePoints(build, allocatedCount);

      expect(result.total).toBe(100);
      expect(result.available).toBe(89 + 22); // (90-1) + 22 quest points = 111
    });

    it('should calculate points for level 1 character', () => {
      const build = { Build: { level: '1' } } as PoBBuild;
      const allocatedCount = 0;

      const result = treeService.calculatePassivePoints(build, allocatedCount);

      expect(result.total).toBe(0);
      expect(result.available).toBe(22); // 0 + 22 quest points
    });

    it('should handle missing level', () => {
      const build = { Build: {} } as PoBBuild;
      const allocatedCount = 50;

      const result = treeService.calculatePassivePoints(build, allocatedCount);

      expect(result.total).toBe(50);
      expect(result.available).toBe(22); // Default level 1
    });
  });

  describe('detectArchetype', () => {
    it('should detect Resolute Technique builds', () => {
      const keystones: PassiveTreeNode[] = [
        { skill: 1, name: 'Resolute Technique' },
      ];
      const notables: PassiveTreeNode[] = [];

      const result = treeService.detectArchetype(keystones, notables);

      expect(result.archetype).toContain('Attack-based (Non-crit)');
      expect(result.confidence).toBe('High');
    });

    it('should detect Chaos Inoculation builds', () => {
      const keystones: PassiveTreeNode[] = [
        { skill: 1, name: 'Chaos Inoculation' },
      ];
      const notables: PassiveTreeNode[] = [];

      const result = treeService.detectArchetype(keystones, notables);

      expect(result.archetype).toContain('Energy Shield');
      expect(result.confidence).toBe('High');
    });

    it('should detect life-based builds from notables', () => {
      const keystones: PassiveTreeNode[] = [];
      const notables: PassiveTreeNode[] = [
        { skill: 1, name: 'Life node 1', stats: ['10% increased maximum Life'] },
        { skill: 2, name: 'Life node 2', stats: ['12% increased maximum Life'] },
        { skill: 3, name: 'Life node 3', stats: ['15% increased maximum Life'] },
        { skill: 4, name: 'Life node 4', stats: ['8% increased maximum Life'] },
      ];

      const result = treeService.detectArchetype(keystones, notables);

      expect(result.archetype).toContain('Life-based');
      expect(result.confidence).toBe('Medium');
    });

    it('should detect hybrid builds from notables', () => {
      const keystones: PassiveTreeNode[] = [];
      const notables: PassiveTreeNode[] = [
        { skill: 1, name: 'ES node 1', stats: ['10% increased Energy Shield'] },
        { skill: 2, name: 'ES node 2', stats: ['12% increased Energy Shield'] },
        { skill: 3, name: 'ES node 3', stats: ['15% increased Energy Shield'] },
        { skill: 4, name: 'ES node 4', stats: ['8% increased Energy Shield'] },
      ];

      const result = treeService.detectArchetype(keystones, notables);

      expect(result.archetype).toContain('Hybrid Life/ES');
      expect(result.confidence).toBe('Medium');
    });

    it('should return unspecified for builds without clear markers', () => {
      const keystones: PassiveTreeNode[] = [];
      const notables: PassiveTreeNode[] = [
        { skill: 1, name: 'Generic node 1', stats: ['10% increased damage'] },
      ];

      const result = treeService.detectArchetype(keystones, notables);

      expect(result.archetype).toBe('Unspecified');
      expect(result.confidence).toBe('Low');
    });

    it('should combine multiple archetype markers', () => {
      const keystones: PassiveTreeNode[] = [
        { skill: 1, name: 'Resolute Technique' },
        { skill: 2, name: 'Avatar of Fire' },
      ];
      const notables: PassiveTreeNode[] = [];

      const result = treeService.detectArchetype(keystones, notables);

      expect(result.archetype).toContain('Attack-based (Non-crit)');
      expect(result.archetype).toContain('Fire Conversion');
      expect(result.confidence).toBe('High');
    });
  });

  describe('calculatePathingEfficiency', () => {
    it('should return Excellent for highly efficient pathing', () => {
      const allocatedNodes: PassiveTreeNode[] = Array(10).fill({ skill: 1 });
      const keystones: PassiveTreeNode[] = [{ skill: 1, name: 'Keystone' }];
      const notables: PassiveTreeNode[] = Array(6).fill({ skill: 2 });
      const jewels: PassiveTreeNode[] = [];

      const result = treeService.calculatePathingEfficiency(
        allocatedNodes,
        keystones,
        notables,
        jewels
      );

      expect(result).toBe('Excellent');
    });

    it('should return Good for moderately efficient pathing', () => {
      const allocatedNodes: PassiveTreeNode[] = Array(20).fill({ skill: 1 });
      const keystones: PassiveTreeNode[] = [{ skill: 1, name: 'Keystone' }];
      const notables: PassiveTreeNode[] = Array(6).fill({ skill: 2 });
      const jewels: PassiveTreeNode[] = [];

      const result = treeService.calculatePathingEfficiency(
        allocatedNodes,
        keystones,
        notables,
        jewels
      );

      expect(result).toBe('Good');
    });

    it('should return Moderate for average pathing', () => {
      const allocatedNodes: PassiveTreeNode[] = Array(25).fill({ skill: 1 });
      const keystones: PassiveTreeNode[] = [{ skill: 1, name: 'Keystone' }];
      const notables: PassiveTreeNode[] = Array(6).fill({ skill: 2 });
      const jewels: PassiveTreeNode[] = [];

      const result = treeService.calculatePathingEfficiency(
        allocatedNodes,
        keystones,
        notables,
        jewels
      );

      expect(result).toBe('Moderate');
    });

    it('should return Inefficient for poor pathing', () => {
      const allocatedNodes: PassiveTreeNode[] = Array(35).fill({ skill: 1 });
      const keystones: PassiveTreeNode[] = [{ skill: 1, name: 'Keystone' }];
      const notables: PassiveTreeNode[] = Array(6).fill({ skill: 2 });
      const jewels: PassiveTreeNode[] = [];

      const result = treeService.calculatePathingEfficiency(
        allocatedNodes,
        keystones,
        notables,
        jewels
      );

      expect(result).toBe('Inefficient');
    });

    it('should handle no allocated nodes', () => {
      const result = treeService.calculatePathingEfficiency([], [], [], []);

      expect(result).toBe('No nodes allocated');
    });
  });

  describe('mapNodesToDetails', () => {
    it('should map valid node IDs to nodes', async () => {
      const treeData: PassiveTreeData = {
        nodes: new Map([
          ['100', { skill: 100, name: 'Node 1' }],
          ['200', { skill: 200, name: 'Node 2' }],
        ]),
        version: '3_26',
      };

      const result = await treeService.mapNodesToDetails(['100', '200'], treeData);

      expect(result.nodes).toHaveLength(2);
      expect(result.invalidIds).toHaveLength(0);
      expect(result.nodes[0].name).toBe('Node 1');
      expect(result.nodes[1].name).toBe('Node 2');
    });

    it('should skip cluster jewel nodes (ID >= 65536)', async () => {
      const treeData: PassiveTreeData = {
        nodes: new Map([
          ['100', { skill: 100, name: 'Node 1' }],
        ]),
        version: '3_26',
      };

      const result = await treeService.mapNodesToDetails(['100', '65536', '70000'], treeData);

      expect(result.nodes).toHaveLength(1);
      expect(result.invalidIds).toHaveLength(0);
      expect(result.nodes[0].name).toBe('Node 1');
    });

    it('should identify invalid node IDs', async () => {
      const treeData: PassiveTreeData = {
        nodes: new Map([
          ['100', { skill: 100, name: 'Node 1' }],
        ]),
        version: '3_26',
      };

      const result = await treeService.mapNodesToDetails(['100', '999'], treeData);

      expect(result.nodes).toHaveLength(1);
      expect(result.invalidIds).toHaveLength(1);
      expect(result.invalidIds[0]).toBe('999');
    });

    it('should handle empty node list', async () => {
      const treeData: PassiveTreeData = {
        nodes: new Map(),
        version: '3_26',
      };

      const result = await treeService.mapNodesToDetails([], treeData);

      expect(result.nodes).toHaveLength(0);
      expect(result.invalidIds).toHaveLength(0);
    });
  });

  describe('refreshTreeData', () => {
    it('should clear specific version from cache', async () => {
      // Manually add to cache
      const treeData: PassiveTreeData = {
        nodes: new Map(),
        version: '3_26',
      };
      (treeService as any).treeDataCache.set('3_26', {
        data: treeData,
        timestamp: Date.now(),
      });

      await treeService.refreshTreeData('3_26');

      expect((treeService as any).treeDataCache.has('3_26')).toBe(false);
    });

    it('should clear all versions when no version specified', async () => {
      // Add multiple versions
      (treeService as any).treeDataCache.set('3_25', { data: {}, timestamp: Date.now() });
      (treeService as any).treeDataCache.set('3_26', { data: {}, timestamp: Date.now() });

      await treeService.refreshTreeData();

      expect((treeService as any).treeDataCache.size).toBe(0);
    });
  });

  describe('findShortestPaths', () => {
    it('should find shortest path between nodes', () => {
      const treeData: PassiveTreeData = {
        nodes: new Map([
          ['1', { skill: 1, out: ['2'] }],
          ['2', { skill: 2, out: ['3'] }],
          ['3', { skill: 3, out: ['4'] }],
          ['4', { skill: 4, out: [] }],
        ]),
        version: '3_26',
      };

      const allocatedNodes = new Set(['1', '2']);
      const result = treeService.findShortestPaths(allocatedNodes, '4', treeData, 1);

      expect(result).toHaveLength(1);
      expect(result[0].nodes).toEqual(['3', '4']);
      expect(result[0].cost).toBe(2);
    });

    it('should return empty array for unreachable nodes', () => {
      const treeData: PassiveTreeData = {
        nodes: new Map([
          ['1', { skill: 1, out: ['2'] }],
          ['2', { skill: 2, out: [] }],
          ['3', { skill: 3, out: ['4'] }],
          ['4', { skill: 4, out: [] }],
        ]),
        version: '3_26',
      };

      const allocatedNodes = new Set(['1', '2']);
      const result = treeService.findShortestPaths(allocatedNodes, '4', treeData, 1);

      expect(result).toHaveLength(0);
    });

    it('should handle target node already allocated', () => {
      const treeData: PassiveTreeData = {
        nodes: new Map([
          ['1', { skill: 1, out: ['2'] }],
          ['2', { skill: 2, out: [] }],
        ]),
        version: '3_26',
      };

      const allocatedNodes = new Set(['1', '2']);
      const result = treeService.findShortestPaths(allocatedNodes, '2', treeData, 1);

      // When target is already allocated, algorithm returns empty array (no path needed)
      expect(result).toHaveLength(0);
    });
  });
});
