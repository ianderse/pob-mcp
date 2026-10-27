import { describe, it, expect } from '@jest/globals';
import { handleAnalyzeDefenses } from '../../src/handlers/optimizationHandlers.js';

/** Measured against a real PoB engine. Chaos Inoculation sets Life to 1. */
const CI_BUILD = {
  Life: 1, EnergyShield: 5251, Ward: 200, Mana: 1038, TotalEHP: 200734.2,
  Armour: 1766, Evasion: 177, BlockChance: 70, SpellBlockChance: 78,
  PhysicalDamageReduction: 40, EnduranceChargesMax: 4,
  FireResist: 75, ColdResist: 80, LightningResist: 81, ChaosResist: 28,
};

const context = () => ({
  buildService: {} as any,
  treeService: {} as any,
  pobDirectory: '/nonexistent',
  getLuaClient: () => ({
    getBuildInfo: async () => ({ name: 'fixture' }),
    getStats: async () => CI_BUILD,
    listSpecs: async () => ({ specs: [] }),
    listItemSets: async () => ({ itemSets: [] }),
    getItems: async () => [],
  }) as any,
  ensureLuaClient: async () => {},
});

describe('handleAnalyzeDefenses empty-state guard', () => {
  it('analyses a Chaos Inoculation build, whose Life is 1', async () => {
    const result = await handleAnalyzeDefenses(context(), 'fixture');

    expect(result.content[0].text).toContain('Defensive Analysis');
  });
});
