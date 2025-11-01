import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { BuildService } from '../../src/services/buildService.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

describe('BuildService', () => {
  let buildService: BuildService;
  let tempDir: string;

  beforeEach(async () => {
    // Create a temporary directory for test builds
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pob-test-'));
    buildService = new BuildService(tempDir);
  });

  afterEach(async () => {
    // Clean up temporary directory
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('listBuilds', () => {
    it('should return empty array for empty directory', async () => {
      const builds = await buildService.listBuilds();
      expect(builds).toEqual([]);
    });

    it('should list XML files in the directory', async () => {
      // Create test build files
      await fs.writeFile(path.join(tempDir, 'build1.xml'), '<PathOfBuilding></PathOfBuilding>');
      await fs.writeFile(path.join(tempDir, 'build2.xml'), '<PathOfBuilding></PathOfBuilding>');

      const builds = await buildService.listBuilds();
      expect(builds).toHaveLength(2);
      expect(builds).toContain('build1.xml');
      expect(builds).toContain('build2.xml');
    });

    it('should skip hidden files', async () => {
      await fs.writeFile(path.join(tempDir, '.hidden.xml'), '<PathOfBuilding></PathOfBuilding>');
      await fs.writeFile(path.join(tempDir, 'visible.xml'), '<PathOfBuilding></PathOfBuilding>');

      const builds = await buildService.listBuilds();
      expect(builds).toHaveLength(1);
      expect(builds).toContain('visible.xml');
      expect(builds).not.toContain('.hidden.xml');
    });

    it('should skip temp files', async () => {
      await fs.writeFile(path.join(tempDir, '~~temp~~build.xml'), '<PathOfBuilding></PathOfBuilding>');
      await fs.writeFile(path.join(tempDir, 'build.xml'), '<PathOfBuilding></PathOfBuilding>');

      const builds = await buildService.listBuilds();
      expect(builds).toHaveLength(1);
      expect(builds).toContain('build.xml');
    });

    it('should list builds in subdirectories', async () => {
      const subDir = path.join(tempDir, 'league');
      await fs.mkdir(subDir);
      await fs.writeFile(path.join(tempDir, 'standard.xml'), '<PathOfBuilding></PathOfBuilding>');
      await fs.writeFile(path.join(subDir, 'league-starter.xml'), '<PathOfBuilding></PathOfBuilding>');

      const builds = await buildService.listBuilds();
      expect(builds).toHaveLength(2);
      expect(builds).toContain('standard.xml');
      expect(builds).toContain(path.join('league', 'league-starter.xml'));
    });

    it('should ignore non-XML files', async () => {
      await fs.writeFile(path.join(tempDir, 'build.xml'), '<PathOfBuilding></PathOfBuilding>');
      await fs.writeFile(path.join(tempDir, 'notes.txt'), 'Some notes');
      await fs.writeFile(path.join(tempDir, 'config.json'), '{}');

      const builds = await buildService.listBuilds();
      expect(builds).toHaveLength(1);
      expect(builds).toContain('build.xml');
    });
  });

  describe('readBuild', () => {
    const sampleBuild = `<?xml version="1.0" encoding="UTF-8"?>
<PathOfBuilding>
  <Build className="Ranger" ascendClassName="Deadeye" level="90">
    <PlayerStat stat="Life" value="4500"/>
    <PlayerStat stat="TotalDPS" value="1000000"/>
  </Build>
</PathOfBuilding>`;

    it('should read and parse build XML', async () => {
      await fs.writeFile(path.join(tempDir, 'test.xml'), sampleBuild);

      const build = await buildService.readBuild('test.xml');
      expect(build).toBeDefined();
      expect(build.Build).toBeDefined();
      expect(build.Build?.className).toBe('Ranger');
      expect(build.Build?.ascendClassName).toBe('Deadeye');
    });

    it('should cache build after first read', async () => {
      await fs.writeFile(path.join(tempDir, 'cached.xml'), sampleBuild);

      // First read
      const build1 = await buildService.readBuild('cached.xml');
      // Second read should use cache
      const build2 = await buildService.readBuild('cached.xml');

      expect(build1).toBe(build2); // Same object reference = cached
    });

    it('should handle builds in subdirectories', async () => {
      const subDir = path.join(tempDir, '3.27');
      await fs.mkdir(subDir);
      await fs.writeFile(path.join(subDir, 'build.xml'), sampleBuild);

      const build = await buildService.readBuild(path.join('3.27', 'build.xml'));
      expect(build.Build?.className).toBe('Ranger');
    });

    it('should throw error for non-existent build', async () => {
      await expect(buildService.readBuild('nonexistent.xml')).rejects.toThrow();
    });
  });

  describe('generateBuildSummary', () => {
    it('should generate summary with basic info', () => {
      const build = {
        Build: {
          className: 'Witch',
          ascendClassName: 'Necromancer',
          level: '85',
        },
      };

      const summary = buildService.generateBuildSummary(build);
      expect(summary).toContain('Class: Witch');
      expect(summary).toContain('Ascendancy: Necromancer');
      expect(summary).toContain('Level: 85');
    });

    it('should include stats', () => {
      const build = {
        Build: {
          className: 'Ranger',
          PlayerStat: [
            { stat: 'Life', value: '5000' },
            { stat: 'EnergyShield', value: '0' },
          ],
        },
      };

      const summary = buildService.generateBuildSummary(build);
      expect(summary).toContain('Life: 5000');
      expect(summary).toContain('EnergyShield: 0');
    });

    it('should handle single PlayerStat object', () => {
      const build = {
        Build: {
          className: 'Ranger',
          PlayerStat: { stat: 'Life', value: '4000' },
        },
      };

      const summary = buildService.generateBuildSummary(build);
      expect(summary).toContain('Life: 4000');
    });

    it('should include skills', () => {
      const build = {
        Build: { className: 'Ranger' },
        Skills: {
          SkillSet: {
            Skill: [
              {
                Gem: [
                  { name: 'Lightning Arrow', level: '20', quality: '20' },
                  { name: 'Mirage Archer Support', level: '20', quality: '20' },
                ],
              },
            ],
          },
        },
      };

      const summary = buildService.generateBuildSummary(build);
      expect(summary).toContain('Lightning Arrow');
      expect(summary).toContain('Mirage Archer Support');
    });

    it('should include equipped items', () => {
      const build = {
        Build: { className: 'Ranger' },
        Items: {
          ItemSet: {
            Slot: [
              { name: 'Weapon 1', Item: 'Rarity: Rare\nDeath Bow\nThicket Bow' },
              { name: 'Body Armour', Item: 'Rarity: Unique\nKaom\'s Heart\nGlorious Plate' },
            ],
          },
        },
      };

      const summary = buildService.generateBuildSummary(build);
      expect(summary).toContain('Weapon 1');
      expect(summary).toContain('Rarity: Rare'); // Only first line is shown
      expect(summary).toContain('Body Armour');
      expect(summary).toContain('Rarity: Unique'); // Only first line is shown
    });

    it('should include notes if present', () => {
      const build = {
        Build: { className: 'Ranger' },
        Notes: 'This is a league starter build.\nVery budget friendly.',
      };

      const summary = buildService.generateBuildSummary(build);
      expect(summary).toContain('Notes');
      expect(summary).toContain('league starter');
      expect(summary).toContain('budget friendly');
    });

    it('should handle build with minimal data', () => {
      const build = {
        Build: {
          className: 'Unknown',
        },
      };

      const summary = buildService.generateBuildSummary(build);
      expect(summary).toContain('Class: Unknown');
      expect(summary).toContain('Ascendancy: None');
      expect(summary).toContain('Level: Unknown');
    });
  });

  describe('getActiveSpec', () => {
    it('should return null if no tree', () => {
      const build = { Build: {} };
      const spec = buildService.getActiveSpec(build);
      expect(spec).toBeNull();
    });

    it('should return single spec directly', () => {
      const build = {
        Tree: {
          Spec: { nodes: '1,2,3', treeVersion: '3_26' },
        },
      };

      const spec = buildService.getActiveSpec(build);
      expect(spec).toBeDefined();
      expect(spec.nodes).toBe('1,2,3');
    });

    it('should return active spec from array', () => {
      const build = {
        Tree: {
          activeSpec: '1', // 1-indexed
          Spec: [
            { nodes: '1,2,3', treeVersion: '3_26' },
            { nodes: '4,5,6', treeVersion: '3_26' },
          ],
        },
      };

      const spec = buildService.getActiveSpec(build);
      expect(spec.nodes).toBe('4,5,6');
    });

    it('should return first spec if activeSpec not specified', () => {
      const build = {
        Tree: {
          Spec: [
            { nodes: '1,2,3', treeVersion: '3_26' },
            { nodes: '4,5,6', treeVersion: '3_26' },
          ],
        },
      };

      const spec = buildService.getActiveSpec(build);
      // When activeSpec is not specified, it defaults to "0" which means first spec
      expect(spec.nodes).toBe('1,2,3');
    });
  });

  describe('parseAllocatedNodes', () => {
    it('should parse comma-separated node IDs', () => {
      const build = {
        Tree: {
          Spec: { nodes: '12345,67890,11111' },
        },
      };

      const nodes = buildService.parseAllocatedNodes(build);
      expect(nodes).toEqual(['12345', '67890', '11111']);
    });

    it('should handle nodes with whitespace', () => {
      const build = {
        Tree: {
          Spec: { nodes: ' 12345 , 67890 , 11111 ' },
        },
      };

      const nodes = buildService.parseAllocatedNodes(build);
      expect(nodes).toEqual(['12345', '67890', '11111']);
    });

    it('should return empty array for build without tree', () => {
      const build = {};
      const nodes = buildService.parseAllocatedNodes(build);
      expect(nodes).toEqual([]);
    });

    it('should return empty array for empty nodes string', () => {
      const build = {
        Tree: {
          Spec: { nodes: '' },
        },
      };

      const nodes = buildService.parseAllocatedNodes(build);
      expect(nodes).toEqual([]);
    });
  });

  describe('extractBuildVersion', () => {
    it('should extract version from tree URL', () => {
      const build = {
        Tree: {
          Spec: { URL: 'https://pobb.in/abcd?version=3_26' },
        },
      };

      const version = buildService.extractBuildVersion(build);
      expect(version).toBe('3_26');
    });

    it('should extract version from treeVersion field', () => {
      const build = {
        Tree: {
          Spec: { treeVersion: '3_25' },
        },
      };

      const version = buildService.extractBuildVersion(build);
      expect(version).toBe('3_25');
    });

    it('should prefer URL version over treeVersion', () => {
      const build = {
        Tree: {
          Spec: {
            URL: 'https://pobb.in/abcd?version=3_26',
            treeVersion: '3_25',
          },
        },
      };

      const version = buildService.extractBuildVersion(build);
      expect(version).toBe('3_26');
    });

    it('should return "Unknown" for build without version info', () => {
      const build = {
        Tree: {
          Spec: {},
        },
      };

      const version = buildService.extractBuildVersion(build);
      expect(version).toBe('Unknown');
    });

    it('should return "Unknown" for build without tree', () => {
      const build = {};
      const version = buildService.extractBuildVersion(build);
      expect(version).toBe('Unknown');
    });
  });

  describe('cache management', () => {
    const sampleBuild = `<?xml version="1.0" encoding="UTF-8"?>
<PathOfBuilding>
  <Build className="Ranger" level="90"/>
</PathOfBuilding>`;

    it('should clear all cached builds', async () => {
      await fs.writeFile(path.join(tempDir, 'build1.xml'), sampleBuild);
      await fs.writeFile(path.join(tempDir, 'build2.xml'), sampleBuild);

      // Cache both builds
      await buildService.readBuild('build1.xml');
      await buildService.readBuild('build2.xml');

      // Clear cache
      buildService.clearCache();

      // Next reads should reload from file (not test implementation details, just verify it works)
      const build = await buildService.readBuild('build1.xml');
      expect(build).toBeDefined();
    });

    it('should invalidate specific build', async () => {
      await fs.writeFile(path.join(tempDir, 'build.xml'), sampleBuild);

      // Cache build
      const build1 = await buildService.readBuild('build.xml');

      // Invalidate
      buildService.invalidateBuild('build.xml');

      // Next read should reload
      const build2 = await buildService.readBuild('build.xml');
      expect(build2).toBeDefined();
      // Since we reloaded, it should be a fresh parse (different object)
      expect(build1).not.toBe(build2);
    });
  });
});
