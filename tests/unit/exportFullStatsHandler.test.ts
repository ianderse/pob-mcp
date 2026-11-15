import { describe, it, expect } from '@jest/globals';
import { handleExportFullStats } from '../../src/handlers/luaHandlers.js';
import { textOf } from '../helpers/response.js';

type Context = Parameters<typeof handleExportFullStats>[0];

const contextReturning = (stats: Record<string, unknown>): Context =>
  ({
    ensureLuaClient: async () => {},
    getLuaClient: () => ({ exportFullStats: async () => stats }),
  }) as unknown as Context;

const stats = { Life: 4000, FireResist: 75, ColdResist: 75, _meta: { buildName: 'b' } };

describe('handleExportFullStats', () => {
  it('returns every stat and the metadata when unfiltered', async () => {
    const text = textOf(await handleExportFullStats(contextReturning(stats)));
    expect(text).toContain('3 numeric values');
    expect(text).toContain('"Life": 4000');
    expect(text).toContain('"buildName": "b"');
  });

  it('keeps only matching keys, case-insensitively, and still reports the metadata', async () => {
    const text = textOf(await handleExportFullStats(contextReturning(stats), 'RESIST'));
    expect(text).toContain('2 of 3');
    expect(text).toContain('"FireResist"');
    expect(text).not.toContain('"Life"');
    expect(text).toContain('"buildName"');
  });
});
