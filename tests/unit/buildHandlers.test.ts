import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  handleListBuilds,
  handleAnalyzeBuild,
  handleCompareBuilds,
  handleGetBuildStats,
  type HandlerContext,
} from '../../src/handlers/buildHandlers.js';
import { BuildService } from '../../src/services/buildService.js';
import { TreeService } from '../../src/services/treeService.js';
import type { PoBBuild } from '../../src/types.js';

describe('BuildHandlers', () => {
  let context: HandlerContext;
  let mockBuildService: jest.Mocked<BuildService>;
  let mockTreeService: jest.Mocked<TreeService>;

  beforeEach(() => {
    // Create mock services
    mockBuildService = {
      listBuilds: jest.fn(),
      readBuild: jest.fn(),
      generateBuildSummary: jest.fn(),
    } as any;

    mockTreeService = {
      analyzePassiveTree: jest.fn(),
    } as any;

    context = {
      buildService: mockBuildService,
      treeService: mockTreeService,
      validationService: {
        validateBuild: jest.fn(),
        formatValidation: jest.fn(),
      } as any,
    };
  });

  describe('handleListBuilds', () => {
    it('should return formatted list of builds', async () => {
      mockBuildService.listBuilds.mockResolvedValue([
        'build1.xml',
        'build2.xml',
        'league/starter.xml',
      ]);

      const result = await handleListBuilds(context);

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('Available builds:');
      expect(result.content[0].text).toContain('1. build1.xml');
      expect(result.content[0].text).toContain('2. build2.xml');
      expect(result.content[0].text).toContain('3. league/starter.xml');
    });

    it('should return message when no builds found', async () => {
      mockBuildService.listBuilds.mockResolvedValue([]);

      const result = await handleListBuilds(context);

      expect(result.content).toHaveLength(1);
      expect(result.content[0].text).toContain('No builds found');
    });
  });

  describe('handleAnalyzeBuild', () => {
    const mockBuild: PoBBuild = {
      Build: {
        className: 'Ranger',
        ascendClassName: 'Deadeye',
        level: '90',
      },
    };

    it('should return build summary with tree analysis', async () => {
      mockBuildService.readBuild.mockResolvedValue(mockBuild);
      mockBuildService.generateBuildSummary.mockReturnValue('=== Build Summary ===\nClass: Ranger');
      mockTreeService.analyzePassiveTree.mockResolvedValue({
        treeVersion: '3_26',
        buildVersion: '3_26',
        versionMismatch: false,
        totalPoints: 95,
        availablePoints: 100,
        allocatedNodes: [],
        keystones: [{ skill: 123, name: 'Point Blank', stats: ['50% more Projectile Damage at Close Range'], isKeystone: true }],
        notables: [],
        jewels: [],
        normalNodes: [],
        invalidNodeIds: [],
        archetype: 'physical-attack',
        archetypeConfidence: 'high',
        pathingEfficiency: 'good',
        optimizationSuggestions: [],
      });

      const result = await handleAnalyzeBuild(context, 'test.xml');

      expect(mockBuildService.readBuild).toHaveBeenCalledWith('test.xml');
      expect(mockBuildService.generateBuildSummary).toHaveBeenCalledWith(mockBuild);
      expect(mockTreeService.analyzePassiveTree).toHaveBeenCalledWith(mockBuild);
      expect(result.content).toHaveLength(1);
      expect(result.content[0].text).toContain('Build Summary');
      expect(result.content[0].text).toContain('Passive Tree');
      expect(result.content[0].text).toContain('Point Blank');
    });

    it('should handle build without tree data', async () => {
      mockBuildService.readBuild.mockResolvedValue(mockBuild);
      mockBuildService.generateBuildSummary.mockReturnValue('=== Build Summary ===');
      mockTreeService.analyzePassiveTree.mockResolvedValue(null);

      const result = await handleAnalyzeBuild(context, 'test.xml');

      expect(result.content[0].text).toContain('No passive tree data found');
    });

    it('should handle invalid tree data error', async () => {
      mockBuildService.readBuild.mockResolvedValue(mockBuild);
      mockBuildService.generateBuildSummary.mockReturnValue('=== Build Summary ===');
      mockTreeService.analyzePassiveTree.mockRejectedValue(
        new Error('Invalid passive tree data detected: Node 99999 not found')
      );

      const result = await handleAnalyzeBuild(context, 'test.xml');

      expect(result.content[0].text).toContain('Invalid passive tree data detected');
      expect(result.content[0].text).toContain('Node 99999 not found');
    });

    it('should handle other tree analysis errors gracefully', async () => {
      mockBuildService.readBuild.mockResolvedValue(mockBuild);
      mockBuildService.generateBuildSummary.mockReturnValue('=== Build Summary ===');
      mockTreeService.analyzePassiveTree.mockRejectedValue(new Error('Network timeout'));

      const result = await handleAnalyzeBuild(context, 'test.xml');

      expect(result.content[0].text).toContain('Build Summary');
      expect(result.content[0].text).toContain('Passive tree analysis unavailable');
      expect(result.content[0].text).toContain('Network timeout');
    });

    it('should show version mismatch warning', async () => {
      mockBuildService.readBuild.mockResolvedValue(mockBuild);
      mockBuildService.generateBuildSummary.mockReturnValue('=== Build Summary ===');
      mockTreeService.analyzePassiveTree.mockResolvedValue({
        treeVersion: '3_26',
        buildVersion: '3_25',
        versionMismatch: true,
        totalPoints: 95,
        availablePoints: 100,
        allocatedNodes: [],
        keystones: [],
        notables: [],
        jewels: [],
        normalNodes: [],
        invalidNodeIds: [],
        archetype: 'unknown',
        archetypeConfidence: 'low',
        pathingEfficiency: 'good',
        optimizationSuggestions: [],
      });

      const result = await handleAnalyzeBuild(context, 'test.xml');

      expect(result.content[0].text).toContain('WARNING');
      expect(result.content[0].text).toContain('version 3_25');
      expect(result.content[0].text).toContain('version 3_26');
    });

    it('should show optimization suggestions', async () => {
      mockBuildService.readBuild.mockResolvedValue(mockBuild);
      mockBuildService.generateBuildSummary.mockReturnValue('=== Build Summary ===');
      mockTreeService.analyzePassiveTree.mockResolvedValue({
        treeVersion: '3_26',
        buildVersion: '3_26',
        versionMismatch: false,
        totalPoints: 95,
        availablePoints: 100,
        allocatedNodes: [],
        keystones: [],
        notables: [],
        jewels: [],
        normalNodes: [],
        invalidNodeIds: [],
        archetype: 'physical-attack',
        archetypeConfidence: 'high',
        pathingEfficiency: 'good',
        optimizationSuggestions: [
          {
            type: 'path',
            title: 'Inefficient path detected',
            description: 'Consider using a more direct route',
            priority: 'high',
            pointsSaved: 2,
          },
          {
            type: 'reachable',
            title: 'Strong nearby notable',
            description: 'Constitution is only 3 points away',
            priority: 'medium',
            potentialGain: '+120 life',
          },
        ],
      });

      const result = await handleAnalyzeBuild(context, 'test.xml');

      expect(result.content[0].text).toContain('Optimization Suggestions');
      expect(result.content[0].text).toContain('High Priority');
      expect(result.content[0].text).toContain('Inefficient path detected');
      expect(result.content[0].text).toContain('Medium Priority');
      expect(result.content[0].text).toContain('Constitution');
    });
  });

  describe('handleCompareBuilds', () => {
    const build1: PoBBuild = {
      Build: {
        className: 'Ranger',
        ascendClassName: 'Deadeye',
        PlayerStat: [
          { stat: 'Life', value: '4500' },
          { stat: 'TotalDPS', value: '1000000' },
        ],
      },
    };

    const build2: PoBBuild = {
      Build: {
        className: 'Ranger',
        ascendClassName: 'Pathfinder',
        PlayerStat: [
          { stat: 'Life', value: '5000' },
          { stat: 'TotalDPS', value: '800000' },
        ],
      },
    };

    it('should compare two builds', async () => {
      mockBuildService.readBuild.mockResolvedValueOnce(build1).mockResolvedValueOnce(build2);

      const result = await handleCompareBuilds(context, 'build1.xml', 'build2.xml');

      expect(mockBuildService.readBuild).toHaveBeenCalledWith('build1.xml');
      expect(mockBuildService.readBuild).toHaveBeenCalledWith('build2.xml');
      expect(result.content).toHaveLength(1);
      expect(result.content[0].text).toContain('Build Comparison');
      expect(result.content[0].text).toContain('build1.xml');
      expect(result.content[0].text).toContain('build2.xml');
      expect(result.content[0].text).toContain('Deadeye vs Pathfinder');
    });

    it('should compare stats between builds', async () => {
      mockBuildService.readBuild.mockResolvedValueOnce(build1).mockResolvedValueOnce(build2);

      const result = await handleCompareBuilds(context, 'build1.xml', 'build2.xml');

      expect(result.content[0].text).toContain('Life: 4500 vs 5000');
      expect(result.content[0].text).toContain('TotalDPS: 1000000 vs 800000');
    });

    it('should handle builds with single PlayerStat object', async () => {
      const singleStatBuild1 = {
        Build: {
          className: 'Witch',
          ascendClassName: 'Necromancer',
          PlayerStat: { stat: 'Life', value: '3000' },
        },
      };

      const singleStatBuild2 = {
        Build: {
          className: 'Witch',
          ascendClassName: 'Elementalist',
          PlayerStat: { stat: 'Life', value: '3500' },
        },
      };

      mockBuildService.readBuild
        .mockResolvedValueOnce(singleStatBuild1)
        .mockResolvedValueOnce(singleStatBuild2);

      const result = await handleCompareBuilds(context, 'build1.xml', 'build2.xml');

      expect(result.content[0].text).toContain('Life: 3000 vs 3500');
    });

    it('should handle builds without stats', async () => {
      const noStatsBuild1 = {
        Build: { className: 'Ranger', ascendClassName: 'Deadeye' },
      };
      const noStatsBuild2 = {
        Build: { className: 'Ranger', ascendClassName: 'Pathfinder' },
      };

      mockBuildService.readBuild
        .mockResolvedValueOnce(noStatsBuild1)
        .mockResolvedValueOnce(noStatsBuild2);

      const result = await handleCompareBuilds(context, 'build1.xml', 'build2.xml');

      expect(result.content[0].text).toContain('Build Comparison');
      expect(result.content[0].text).toContain('Deadeye vs Pathfinder');
    });
  });

  describe('handleGetBuildStats', () => {
    it('should return all stats from build', async () => {
      const build: PoBBuild = {
        Build: {
          PlayerStat: [
            { stat: 'Life', value: '5000' },
            { stat: 'EnergyShield', value: '0' },
            { stat: 'TotalDPS', value: '1500000' },
            { stat: 'FireResist', value: '75' },
          ],
        },
      };

      mockBuildService.readBuild.mockResolvedValue(build);

      const result = await handleGetBuildStats(context, 'test.xml');

      expect(result.content).toHaveLength(1);
      expect(result.content[0].text).toContain('Stats for test.xml');
      expect(result.content[0].text).toContain('Life: 5000');
      expect(result.content[0].text).toContain('EnergyShield: 0');
      expect(result.content[0].text).toContain('TotalDPS: 1500000');
      expect(result.content[0].text).toContain('FireResist: 75');
    });

    it('should handle single PlayerStat object', async () => {
      const build: PoBBuild = {
        Build: {
          PlayerStat: { stat: 'Life', value: '4000' },
        },
      };

      mockBuildService.readBuild.mockResolvedValue(build);

      const result = await handleGetBuildStats(context, 'test.xml');

      expect(result.content[0].text).toContain('Life: 4000');
    });

    it('should handle build without stats', async () => {
      const build: PoBBuild = {
        Build: {},
      };

      mockBuildService.readBuild.mockResolvedValue(build);

      const result = await handleGetBuildStats(context, 'test.xml');

      expect(result.content[0].text).toContain('No stats found');
    });
  });
});
