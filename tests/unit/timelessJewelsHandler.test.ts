import { describe, it, expect } from '@jest/globals';
import { handleLuaGetTimelessJewels } from '../../src/handlers/luaHandlers.js';
import type { TimelessJewel, TimelessJewelsReport } from '../../src/pobLuaBridge.js';
import { textOf } from '../helpers/response.js';

type Ctx = Parameters<typeof handleLuaGetTimelessJewels>[0];

const contextReturning = (report: TimelessJewelsReport): Ctx =>
  ({
    ensureLuaClient: async () => {},
    getLuaClient: () => ({ getTimelessJewels: async () => report }),
  }) as unknown as Ctx;

// Shaped after the real Lethal Pride on a 3.29 Juggernaut strength stacker.
const lethalPride = (over: Partial<TimelessJewel> = {}): TimelessJewel => ({
  itemId: 14,
  name: 'Lethal Pride',
  socketNodeId: 54127,
  socketAllocated: true,
  seed: 12721,
  conqueror: { type: 'karui', id: 2 },
  jewelType: 2,
  lutLoaded: true,
  conqueredCount: 3,
  conquered: [
    { nodeId: 10661, name: 'Tempered by War', originalName: 'Iron Reflexes', type: 'Keystone', allocated: true,
      stats: ['50% of Cold and Lightning Damage taken as Fire Damage'] },
    { nodeId: 11859, name: 'Strength', originalName: 'Strength', type: 'Normal', allocated: true,
      stats: ['+10 to Strength', ' ', '+2 to Strength'] },
    { nodeId: 2000, name: 'Life', originalName: 'Life', type: 'Normal', allocated: false, stats: ['+4 to Strength'] },
  ],
  ...over,
});

describe('handleLuaGetTimelessJewels', () => {
  it('lists allocated conquests with renames and drops blank stat separators', async () => {
    const text = textOf(await handleLuaGetTimelessJewels(contextReturning({ zlib: true, jewels: [lethalPride()] })));
    expect(text).toContain('**Lethal Pride** in socket 54127 (seed 12721, karui #2)');
    expect(text).toContain('Conquered passives in range: 3 (2 allocated)');
    expect(text).toContain('[10661] Iron Reflexes → Tempered by War');
    expect(text).toContain('[11859] Strength: +10 to Strength; +2 to Strength');
    expect(text).not.toContain('[2000]');
    expect(text).not.toContain('⚠️');
  });

  it('includes unallocated passives on request', async () => {
    const text = textOf(await handleLuaGetTimelessJewels(contextReturning({ zlib: true, jewels: [lethalPride()] }), true));
    expect(text).toContain('[2000] Life (unallocated): +4 to Strength');
  });

  // The failure this tool exists to surface: the jewel is there and does nothing.
  it('warns loudly when the engine has no zlib', async () => {
    const text = textOf(await handleLuaGetTimelessJewels(contextReturning({ zlib: false, jewels: [lethalPride()] })));
    expect(text).toContain('no working Inflate (zlib), so NO timeless jewel can take effect');
  });

  it('flags an unloaded table, an unallocated socket and an empty conquest', async () => {
    const report: TimelessJewelsReport = {
      zlib: true,
      jewels: [
        lethalPride({ lutLoaded: false }),
        lethalPride({ socketNodeId: 1, socketAllocated: false, conqueredCount: 0, conquered: [] }),
        lethalPride({ socketNodeId: 2, conqueredCount: 0, conquered: [] }),
      ],
    };
    const text = textOf(await handleLuaGetTimelessJewels(contextReturning(report)));
    expect(text).toContain('lookup table did not load');
    expect(text).toContain('socket not allocated');
    expect(text).toContain('conquers nothing');
  });

  it('says so when there are no timeless jewels', async () => {
    const text = textOf(await handleLuaGetTimelessJewels(contextReturning({ zlib: true, jewels: [] })));
    expect(text).toContain('No timeless jewels are socketed');
  });
});
