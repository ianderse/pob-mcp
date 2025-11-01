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

  describe('parseConfiguration', () => {
    it('should return null if build has no config', () => {
      const build = { Build: {} };
      const config = buildService.parseConfiguration(build);
      expect(config).toBeNull();
    });

    it('should parse basic configuration with charges', () => {
      const build = {
        Config: {
          activeConfigSet: '1',
          ConfigSet: {
            id: '1',
            title: 'Default',
            Input: [
              { name: 'usePowerCharges', boolean: 'true' },
              { name: 'useFrenzyCharges', boolean: 'true' },
              { name: 'useEnduranceCharges', boolean: 'false' },
            ],
          },
        },
      };

      const config = buildService.parseConfiguration(build);
      expect(config).not.toBeNull();
      expect(config?.activeConfigSetTitle).toBe('Default');
      expect(config?.chargeUsage.powerCharges).toBe(true);
      expect(config?.chargeUsage.frenzyCharges).toBe(true);
      expect(config?.chargeUsage.enduranceCharges).toBe(false);
    });

    it('should parse conditions', () => {
      const build = {
        Config: {
          ConfigSet: {
            Input: [
              { name: 'conditionEnemyShocked', boolean: 'true' },
              { name: 'conditionEnemyChilled', boolean: 'true' },
              { name: 'conditionFullLife', boolean: 'false' },
            ],
          },
        },
      };

      const config = buildService.parseConfiguration(build);
      expect(config?.conditions.conditionEnemyShocked).toBe(true);
      expect(config?.conditions.conditionEnemyChilled).toBe(true);
      expect(config?.conditions.conditionFullLife).toBe(false);
    });

    it('should parse enemy settings', () => {
      const build = {
        Config: {
          ConfigSet: {
            Placeholder: [
              { name: 'enemyLevel', number: '84' },
              { name: 'enemyLightningResist', number: '50' },
              { name: 'enemyFireResist', number: '50' },
              { name: 'enemyArmour', number: '20000' },
            ],
          },
        },
      };

      const config = buildService.parseConfiguration(build);
      expect(config?.enemySettings.level).toBe(84);
      expect(config?.enemySettings.lightningResist).toBe(50);
      expect(config?.enemySettings.fireResist).toBe(50);
      expect(config?.enemySettings.armour).toBe(20000);
    });

    it('should parse multipliers', () => {
      const build = {
        Config: {
          ConfigSet: {
            Input: [
              { name: 'multiplierRage', number: '30' },
              { name: 'multiplierWitheredStackCountSelf', number: '15' },
            ],
          },
        },
      };

      const config = buildService.parseConfiguration(build);
      expect(config?.multipliers.multiplierRage).toBe(30);
      expect(config?.multipliers.multiplierWitheredStackCountSelf).toBe(15);
    });

    it('should parse custom mods', () => {
      const build = {
        Config: {
          ConfigSet: {
            Input: {
              name: 'customMods',
              string: '20% increased effect of herald buffs\n50% more damage',
            },
          },
        },
      };

      const config = buildService.parseConfiguration(build);
      expect(config?.customMods).toContain('herald buffs');
      expect(config?.customMods).toContain('50% more damage');
    });

    it('should parse bandit choice from config', () => {
      const build = {
        Config: {
          ConfigSet: {
            Input: {
              name: 'bandit',
              string: 'Alira',
            },
          },
        },
      };

      const config = buildService.parseConfiguration(build);
      expect(config?.bandit).toBe('Alira');
    });

    it('should fallback to build bandit if not in config', () => {
      const build = {
        Build: {
          bandit: 'Oak',
        },
        Config: {
          ConfigSet: {
            Input: [],
          },
        },
      };

      const config = buildService.parseConfiguration(build);
      expect(config?.bandit).toBe('Oak');
    });

    it('should handle single Input instead of array', () => {
      const build = {
        Config: {
          ConfigSet: {
            Input: { name: 'usePowerCharges', boolean: 'true' },
          },
        },
      };

      const config = buildService.parseConfiguration(build);
      expect(config?.chargeUsage.powerCharges).toBe(true);
    });

    it('should handle multiple ConfigSets and use active one', () => {
      const build = {
        Config: {
          activeConfigSet: '2',
          ConfigSet: [
            {
              id: '1',
              title: 'Config 1',
              Input: { name: 'usePowerCharges', boolean: 'false' },
            },
            {
              id: '2',
              title: 'Config 2',
              Input: { name: 'usePowerCharges', boolean: 'true' },
            },
          ],
        },
      };

      const config = buildService.parseConfiguration(build);
      expect(config?.activeConfigSetId).toBe('2');
      expect(config?.activeConfigSetTitle).toBe('Config 2');
      expect(config?.chargeUsage.powerCharges).toBe(true);
    });

    it('should parse boolean attributes correctly', () => {
      const build = {
        Config: {
          ConfigSet: {
            Input: [
              { name: 'test1', boolean: true },
              { name: 'test2', boolean: 'true' },
              { name: 'test3', boolean: false },
              { name: 'test4', boolean: 'false' },
            ],
          },
        },
      };

      const config = buildService.parseConfiguration(build);
      const test1 = config?.allInputs.get('test1');
      const test2 = config?.allInputs.get('test2');
      const test3 = config?.allInputs.get('test3');
      const test4 = config?.allInputs.get('test4');

      expect(test1?.boolean).toBe(true);
      expect(test2?.boolean).toBe('true');
      expect(test3?.boolean).toBe(false);
      expect(test4?.boolean).toBe('false');
    });

    it('should parse number attributes correctly', () => {
      const build = {
        Config: {
          ConfigSet: {
            Input: [
              { name: 'test1', number: 42 },
              { name: 'test2', number: '50' },
            ],
          },
        },
      };

      const config = buildService.parseConfiguration(build);
      const test1 = config?.allInputs.get('test1');
      const test2 = config?.allInputs.get('test2');

      expect(test1?.number).toBe(42);
      expect(test2?.number).toBe('50');
    });
  });

  describe('formatConfiguration', () => {
    it('should format configuration output', () => {
      const config = {
        activeConfigSetId: '1',
        activeConfigSetTitle: 'Boss DPS',
        chargeUsage: {
          powerCharges: true,
          frenzyCharges: true,
          enduranceCharges: false,
        },
        conditions: {
          conditionEnemyShocked: true,
        },
        customMods: '20% increased damage',
        enemySettings: {
          level: 84,
          lightningResist: 50,
        },
        multipliers: {
          multiplierRage: 30,
        },
        bandit: 'Alira',
        allInputs: new Map(),
      };

      const formatted = buildService.formatConfiguration(config);
      expect(formatted).toContain('Boss DPS');
      expect(formatted).toContain('Power Charges: Active');
      expect(formatted).toContain('Frenzy Charges: Active');
      expect(formatted).toContain('Endurance Charges: Inactive');
      expect(formatted).toContain('Enemy Shocked'); // Formatted from "conditionEnemyShocked"
      expect(formatted).toContain('Level: 84');
      expect(formatted).toContain('Lightning Resist: 50%');
      expect(formatted).toContain('Rage: 30');
      expect(formatted).toContain('20% increased damage');
      expect(formatted).toContain('Alira');
    });

    it('should handle empty configuration sections', () => {
      const config = {
        activeConfigSetId: '1',
        activeConfigSetTitle: 'Default',
        chargeUsage: {
          powerCharges: false,
          frenzyCharges: false,
          enduranceCharges: false,
        },
        conditions: {},
        customMods: '',
        enemySettings: {},
        multipliers: {},
        allInputs: new Map(),
      };

      const formatted = buildService.formatConfiguration(config);
      expect(formatted).toContain('Default');
      expect(formatted).toContain('Power Charges: Inactive');
      // Should not crash on empty sections
      expect(formatted).toBeDefined();
    });
  });

  describe('parseFlasks', () => {
    it('should return null if build has no items', () => {
      const build = { Build: {} };
      const flasks = buildService.parseFlasks(build);
      expect(flasks).toBeNull();
    });

    it('should parse basic flask setup', () => {
      const build = {
        Items: {
          ItemSet: {
            Slot: [
              {
                name: 'Flask 1',
                active: 'true',
                Item: `Rarity: MAGIC
Surgeon's Diamond Flask of Rupturing
Diamond Flask
Crafted: true
Quality: 20
LevelReq: 64
35% chance to gain a Flask Charge when you deal a Critical Strike
40% increased Critical Strike Chance during Effect`,
              },
              {
                name: 'Flask 2',
                Item: `Rarity: MAGIC
Quicksilver Flask
Quicksilver Flask
Quality: 20
LevelReq: 4`,
              },
            ],
          },
        },
      };

      const flasks = buildService.parseFlasks(build);
      expect(flasks).not.toBeNull();
      expect(flasks?.totalFlasks).toBe(2);
      expect(flasks?.activeFlasks).toBe(1);
      expect(flasks?.flasks[0].name).toBe("Surgeon's Diamond Flask of Rupturing");
      expect(flasks?.flasks[0].isActive).toBe(true);
      expect(flasks?.flasks[0].quality).toBe(20);
      expect(flasks?.flasks[1].isActive).toBe(false);
    });

    it('should categorize flask types correctly', () => {
      const build = {
        Items: {
          ItemSet: {
            Slot: [
              { name: 'Flask 1', Item: 'Rarity: MAGIC\nDivine Life Flask\nDivine Life Flask' },
              { name: 'Flask 2', Item: 'Rarity: MAGIC\nEternal Mana Flask\nEternal Mana Flask' },
              { name: 'Flask 3', Item: 'Rarity: MAGIC\nQuicksilver Flask\nQuicksilver Flask' },
            ],
          },
        },
      };

      const flasks = buildService.parseFlasks(build);
      expect(flasks?.flaskTypes.life).toBe(1);
      expect(flasks?.flaskTypes.mana).toBe(1);
      expect(flasks?.flaskTypes.utility).toBe(1);
    });

    it('should detect bleed immunity', () => {
      const build = {
        Items: {
          ItemSet: {
            Slot: [
              {
                name: 'Flask 1',
                Item: `Rarity: MAGIC
Divine Life Flask of Staunching
Divine Life Flask
Grants Immunity to Bleeding for 4 seconds if used while Bleeding`,
              },
            ],
          },
        },
      };

      const flasks = buildService.parseFlasks(build);
      expect(flasks?.hasBleedImmunity).toBe(true);
    });

    it('should detect freeze immunity', () => {
      const build = {
        Items: {
          ItemSet: {
            Slot: [
              {
                name: 'Flask 1',
                Item: `Rarity: MAGIC
Quicksilver Flask of Heat
Quicksilver Flask
Grants Immunity to Freeze and Chill for 5 seconds if used while Frozen`,
              },
            ],
          },
        },
      };

      const flasks = buildService.parseFlasks(build);
      expect(flasks?.hasFreezeImmunity).toBe(true);
    });

    it('should detect corrupted blood immunity', () => {
      const build = {
        Items: {
          ItemSet: {
            Slot: [
              {
                name: 'Flask 1',
                Item: `Rarity: MAGIC
Life Flask of Alleviation
Divine Life Flask
Grants Immunity to Corrupted Blood for 11 seconds if used while affected by Corrupted Blood`,
              },
            ],
          },
        },
      };

      const flasks = buildService.parseFlasks(build);
      expect(flasks?.hasBleedImmunity).toBe(true);
    });

    it('should detect unique flasks', () => {
      const build = {
        Items: {
          ItemSet: {
            Slot: [
              {
                name: 'Flask 1',
                Item: `Rarity: UNIQUE
Dying Sun
Ruby Flask
Quality: 20`,
              },
            ],
          },
        },
      };

      const flasks = buildService.parseFlasks(build);
      expect(flasks?.uniqueFlasks).toContain('Dying Sun');
      expect(flasks?.flasks[0].isUnique).toBe(true);
    });

    it('should warn about missing flask slots', () => {
      const build = {
        Items: {
          ItemSet: {
            Slot: [
              { name: 'Flask 1', Item: 'Rarity: MAGIC\nLife Flask\nLife Flask' },
              { name: 'Flask 2', Item: 'Rarity: MAGIC\nQuicksilver Flask\nQuicksilver Flask' },
            ],
          },
        },
      };

      const flasks = buildService.parseFlasks(build);
      expect(flasks?.warnings).toContain('Only 2/5 flask slots filled');
    });

    it('should warn about no life flask', () => {
      const build = {
        Items: {
          ItemSet: {
            Slot: [
              { name: 'Flask 1', Item: 'Rarity: MAGIC\nQuicksilver Flask\nQuicksilver Flask' },
            ],
          },
        },
      };

      const flasks = buildService.parseFlasks(build);
      expect(flasks?.warnings).toContain('No life flask equipped - risky for recovery');
    });

    it('should recommend bleed immunity if missing', () => {
      const build = {
        Items: {
          ItemSet: {
            Slot: [
              { name: 'Flask 1', Item: 'Rarity: MAGIC\nLife Flask\nLife Flask' },
            ],
          },
        },
      };

      const flasks = buildService.parseFlasks(build);
      expect(flasks?.recommendations.some(r => r.includes('bleed'))).toBe(true);
    });

    it('should recommend freeze immunity if missing', () => {
      const build = {
        Items: {
          ItemSet: {
            Slot: [
              { name: 'Flask 1', Item: 'Rarity: MAGIC\nLife Flask\nLife Flask' },
            ],
          },
        },
      };

      const flasks = buildService.parseFlasks(build);
      expect(flasks?.recommendations.some(r => r.includes('freeze'))).toBe(true);
    });

    it('should parse prefix and suffix', () => {
      const build = {
        Items: {
          ItemSet: {
            Slot: [
              {
                name: 'Flask 1',
                Item: `Rarity: MAGIC
Surgeon's Diamond Flask of Rupturing
Diamond Flask
Prefix: {range:1}FlaskChanceRechargeOnCrit5
Suffix: {range:0.306}FlaskBuffCriticalChanceWhileHealing3
35% chance to gain a Flask Charge when you deal a Critical Strike
40% increased Critical Strike Chance during Effect`,
              },
            ],
          },
        },
      };

      const flasks = buildService.parseFlasks(build);
      expect(flasks?.flasks[0].prefix).toBe('FlaskChanceRechargeOnCrit5');
      expect(flasks?.flasks[0].suffix).toBe('FlaskBuffCriticalChanceWhileHealing3');
    });

    it('should extract base flask type from magic name', () => {
      const build = {
        Items: {
          ItemSet: {
            Slot: [
              {
                name: 'Flask 1',
                Item: `Rarity: MAGIC
Surgeon's Diamond Flask of Rupturing
Diamond Flask`,
              },
            ],
          },
        },
      };

      const flasks = buildService.parseFlasks(build);
      expect(flasks?.flasks[0].baseType).toBe('Diamond Flask');
    });

    it('should handle empty flask slots gracefully', () => {
      const build = {
        Items: {
          ItemSet: {
            Slot: [
              { name: 'Weapon 1', Item: 'Some weapon' },
              { name: 'Flask 1' }, // Empty flask slot
            ],
          },
        },
      };

      const flasks = buildService.parseFlasks(build);
      expect(flasks?.totalFlasks).toBe(0);
      expect(flasks?.warnings).toContain('No flasks equipped');
    });
  });

  describe('formatFlaskAnalysis', () => {
    it('should format flask analysis output', () => {
      const analysis = {
        totalFlasks: 3,
        activeFlasks: 1,
        flasks: [
          {
            id: 'flask_1',
            slotNumber: 1,
            isActive: true,
            rarity: 'MAGIC' as const,
            name: 'Diamond Flask',
            baseType: 'Diamond Flask',
            quality: 20,
            levelRequirement: 64,
            mods: ['40% increased Critical Strike Chance during Effect'],
            isUnique: false,
          },
        ],
        flaskTypes: {
          life: 0,
          mana: 0,
          hybrid: 0,
          utility: 3,
        },
        hasBleedImmunity: false,
        hasFreezeImmunity: true,
        hasPoisonImmunity: false,
        hasCurseImmunity: false,
        uniqueFlasks: [],
        warnings: ['No life flask equipped - risky for recovery'],
        recommendations: ['Add bleed immunity'],
      };

      const formatted = buildService.formatFlaskAnalysis(analysis);
      expect(formatted).toContain('Flasks Equipped: 3/5');
      expect(formatted).toContain('Active in Config: 1');
      expect(formatted).toContain('Utility Flasks: 3');
      expect(formatted).toContain('Bleed/Corrupted Blood: ✗');
      expect(formatted).toContain('Freeze/Chill: ✓');
      expect(formatted).toContain('Flask 1: Diamond Flask [ACTIVE]');
      expect(formatted).toContain('⚠️  No life flask equipped');
      expect(formatted).toContain('💡 Add bleed immunity');
    });

    it('should handle empty flask analysis', () => {
      const analysis = {
        totalFlasks: 0,
        activeFlasks: 0,
        flasks: [],
        flaskTypes: { life: 0, mana: 0, hybrid: 0, utility: 0 },
        hasBleedImmunity: false,
        hasFreezeImmunity: false,
        hasPoisonImmunity: false,
        hasCurseImmunity: false,
        uniqueFlasks: [],
        warnings: [],
        recommendations: [],
      };

      const formatted = buildService.formatFlaskAnalysis(analysis);
      expect(formatted).toContain('Flasks Equipped: 0/5');
      expect(formatted).toBeDefined();
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
