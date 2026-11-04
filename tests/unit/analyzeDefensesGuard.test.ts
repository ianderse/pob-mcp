import { describe, it, expect } from '@jest/globals';
import { handleAnalyzeDefenses } from '../../src/handlers/optimizationHandlers.js';
type OptContext = Parameters<typeof handleAnalyzeDefenses>[0];
import type { StatsExport } from '../../src/pobLuaBridge.js';

/** Measured against a real PoB engine. Chaos Inoculation sets Life to 1. */
const CI_BUILD = {
  Life: 1, EnergyShield: 5251, Ward: 200, Mana: 1038, TotalEHP: 200734.2,
  Armour: 1766, Evasion: 177, BlockChance: 70, SpellBlockChance: 78,
  PhysicalDamageReduction: 40, EnduranceChargesMax: 4,
  FireResist: 75, ColdResist: 80, LightningResist: 81, ChaosResist: 28,
};

const context = (): OptContext => ({
  buildService: {} as OptContext['buildService'],
  treeService: {} as OptContext['treeService'],
  pobDirectory: '/nonexistent',
  getLuaClient: () => ({
    getBuildInfo: async () => ({ name: 'fixture' }),
    getStats: async (): Promise<StatsExport> => CI_BUILD,
    listSpecs: async () => ({ specs: [], activeSpec: 1 }),
    listItemSets: async () => ({ itemSets: [], activeItemSetId: 1 }),
    getItems: async () => [],
  }) as unknown as NonNullable<ReturnType<OptContext['getLuaClient']>>,
  ensureLuaClient: async () => {},
});

describe('handleAnalyzeDefenses empty-state guard', () => {
  it('analyses a Chaos Inoculation build, whose Life is 1', async () => {
    const result = await handleAnalyzeDefenses(context(), 'fixture');

    expect(result.content[0]?.text).toContain('Defensive Analysis');
  });
});
