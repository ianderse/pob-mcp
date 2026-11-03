import { describe, it, expect, jest } from '@jest/globals';
import { handleSetEnemyStats } from '../../src/handlers/configHandlers.js';

interface SetConfigCall {
  params: Record<string, unknown>;
}

function makeContext(setConfigResult: { applied: Record<string, unknown>; rejected: Record<string, string> }) {
  const calls: SetConfigCall[] = [];
  const luaClient = {
    getStats: jest.fn(async () => ({ TotalDPS: 1000, CombinedDPS: 1000, Life: 5000, EnergyShield: 0 })),
    getConfig: jest.fn(async () => ({})),
    setConfig: jest.fn(async (params: Record<string, unknown>) => {
      calls.push({ params });
      return setConfigResult;
    }),
  };
  return {
    calls,
    context: {
      ensureLuaClient: async () => {},
      getLuaClient: () => luaClient,
    },
  };
}

const textOf = (r: { content: Array<{ type: string; text?: string }> }) =>
  r.content.map((c) => c.text ?? '').join('');

describe('handleSetEnemyStats', () => {
  it('writes PoB-whitelisted option names, not *Resistance spellings', async () => {
    const { calls, context } = makeContext({ applied: {}, rejected: {} });
    await handleSetEnemyStats(context as never, {
      fire_resist: 75, cold_resist: 75, lightning_resist: 75, chaos_resist: 50, level: 85,
    });
    expect(calls).toHaveLength(1);
    expect(Object.keys(calls[0].params).sort()).toEqual([
      'enemyChaosResist', 'enemyColdResist', 'enemyFireResist', 'enemyLevel', 'enemyLightningResist',
    ]);
  });

  it('reports rejection instead of claiming success when PoB rejects keys', async () => {
    const { context } = makeContext({
      applied: {},
      rejected: { enemyFireResist: 'unknown config option' },
    });
    const result = await handleSetEnemyStats(context as never, { fire_resist: 75 });
    const text = textOf(result as never);
    expect(text).toContain('NOT Updated');
    expect(text).toContain('Fire Resist: ❌ rejected by Path of Building (unknown config option)');
    expect(text).not.toContain('=== Enemy Configuration Updated ===');
  });

  it('reports applied changes normally when nothing is rejected', async () => {
    const { context } = makeContext({ applied: { enemyFireResist: 75 }, rejected: {} });
    const result = await handleSetEnemyStats(context as never, { fire_resist: 75 });
    const text = textOf(result as never);
    expect(text).toContain('=== Enemy Configuration Updated ===');
    expect(text).toContain('Fire Resist: 75%');
    expect(text).not.toContain('❌');
  });
});
