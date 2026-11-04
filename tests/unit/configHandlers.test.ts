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

import { textOf } from '../helpers/response.js';

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

describe('handleSaveConfigPreset — atomic write', () => {
  it('keeps the previous preset intact when committing the new one fails', async () => {
    const fsSync = await import('fs');
    const fsp = await import('fs/promises');
    const os = await import('os');
    const pathMod = await import('path');
    const { handleSaveConfigPreset } = await import('../../src/handlers/configHandlers.js');

    const dir = fsSync.mkdtempSync(pathMod.join(os.tmpdir(), 'pob-preset-'));
    const { atomicWriteFile } = await import('../../src/utils/atomicWrite.js');
    // Real preset location; getPresetPath would mkdir it anyway, but it must
    // exist BEFORE the write is patched to fail, or ENOENT masks the ENOSPC.
    const presetDir = pathMod.join(dir, '.pob-mcp-presets');
    fsSync.mkdirSync(presetDir);
    const presetFile = pathMod.join(presetDir, 'guardian.json');
    await atomicWriteFile(presetFile, '{"GOOD":1}', true);

    // Fail the *next* commit (the handler's save) mid-write; the earlier
    // atomicWriteFile above has already completed.
    const handle = await fsp.open(pathMod.join(dir, 'probe.tmp'), 'wx');
    const proto = Object.getPrototypeOf(handle) as {
      writeFile(data: string, enc?: string): Promise<unknown>;
    };
    const real = proto.writeFile;
    proto.writeFile = async () => {
      throw Object.assign(new Error('ENOSPC'), { code: 'ENOSPC' });
    };
    const context = {
      pobDirectory: dir,
      ensureLuaClient: async () => {},
      getLuaClient: () => ({ getConfig: async () => ({ Life: 1 }) }),
    } as unknown as Parameters<typeof handleSaveConfigPreset>[0];
    try {
      await expect(handleSaveConfigPreset(context, 'guardian')).rejects.toThrow(/save config preset.*ENOSPC/);
      // The old preset survived; a plain writeFile would have truncated it.
      expect(fsSync.readFileSync(presetFile, 'utf-8')).toBe('{"GOOD":1}');
    } finally {
      proto.writeFile = real;
      await handle.close().catch(() => {});
      fsSync.rmSync(dir, { recursive: true, force: true });
    }
  });
});
