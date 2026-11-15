import { describe, it, expect } from '@jest/globals';
import { handleParseItem } from '../../src/handlers/luaHandlers.js';
import type { ParsedItem } from '../../src/pobLuaBridge.js';
import { textOf } from '../helpers/response.js';

type Context = Parameters<typeof handleParseItem>[0];

const parsed = (over: Partial<ParsedItem> = {}): ParsedItem => ({
  name: 'Smoke Jacket, Quilted Jacket',
  base: 'Quilted Jacket',
  corrupted: false,
  identified: true,
  implicits: [],
  explicits: ['+500 to maximum Life'],
  crafted: [],
  fractured: [],
  enchants: [],
  unparsed: [],
  requirements: { level: 72 },
  ...over,
});

const contextReturning = (item: ParsedItem): Context =>
  ({
    ensureLuaClient: async () => {},
    getLuaClient: () => ({ parseItem: async () => item }),
  }) as unknown as Context;

describe('handleParseItem', () => {
  it('reports the parsed item and says the build was not touched', async () => {
    const text = textOf(await handleParseItem(contextReturning(parsed()), 'item text'));
    expect(text).toContain('Smoke Jacket, Quilted Jacket');
    expect(text).toContain('+500 to maximum Life');
    expect(text).toContain('not added or equipped');
    expect(text).not.toContain('WARNING');
  });

  it('warns about mod lines PoB could not read', async () => {
    const text = textOf(await handleParseItem(contextReturning(parsed({ unparsed: ['+9 to Nonsense'] })), 'item text'));
    expect(text).toContain('WARNING');
    expect(text).toContain('"+9 to Nonsense"');
  });

  it('rejects empty text before touching the bridge', async () => {
    await expect(handleParseItem(contextReturning(parsed()), '  ')).rejects.toThrow('item text is required');
  });
});
