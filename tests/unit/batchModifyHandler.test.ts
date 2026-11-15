import { describe, it, expect } from '@jest/globals';
import { handleBatchModify } from '../../src/handlers/luaHandlers.js';
import type { BatchChange, BatchModifyResult } from '../../src/pobLuaBridge.js';
import { textOf } from '../helpers/response.js';

type Context = Parameters<typeof handleBatchModify>[0];

const contextReturning = (batchModify: (changes: BatchChange[]) => Promise<BatchModifyResult>): Context =>
  ({
    ensureLuaClient: async () => {},
    getLuaClient: () => ({ batchModify }),
  }) as unknown as Context;

describe('handleBatchModify', () => {
  it('reports the applied count and puts headline stats first', async () => {
    const context = contextReturning(async () => ({
      applied: 2,
      delta: {
        Armour: { before: 100, after: 400, change: 300, percent: 300 },
        Life: { before: 1000, after: 1100, change: 100, percent: 10 },
      },
    }));
    const text = textOf(await handleBatchModify(context, [{ type: 'set_level', level: 90 }, { type: 'set_level', level: 91 }]));
    expect(text).toContain('Batch applied: 2 change(s)');
    expect(text.indexOf('Life:')).toBeLessThan(text.indexOf('Armour:'));
  });

  it('says so when nothing changed', async () => {
    const context = contextReturning(async () => ({ applied: 1, delta: {} }));
    expect(textOf(await handleBatchModify(context, [{ type: 'set_level', level: 90 }]))).toContain('No stat changed');
  });

  it('surfaces the bridge error with its rollback outcome', async () => {
    const context = contextReturning(async () => {
      throw new Error('change 2 (set_config) failed: nope; rolled back, restored build verified identical');
    });
    await expect(handleBatchModify(context, [{ type: 'set_level', level: 90 }])).rejects.toThrow('rolled back, restored build verified identical');
  });

  it('rejects an empty batch before touching the bridge', async () => {
    const context = contextReturning(async () => {
      throw new Error('must not be called');
    });
    await expect(handleBatchModify(context, [])).rejects.toThrow('non-empty array');
    await expect(handleBatchModify(context, undefined)).rejects.toThrow('non-empty array');
  });
});
