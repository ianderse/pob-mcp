import { describe, it, expect } from '@jest/globals';
import { handleListSpecs, handleDeleteSpec, handleRenameSpec, handleListItemSets } from '../../src/handlers/luaHandlers.js';

// A full spec list is a perfectly normal success response; these handlers
// keyed "failure" off specs.length, so the last remaining spec, the last item
// set, or a build whose specs carry no title was reported as "Failed to …".
const specResult = (specs: unknown[], activeSpec = 1) => ({ specs, activeSpec });

const ctx = (api: Record<string, unknown>) =>
  ({
    pobDirectory: '/tmp',
    luaEnabled: true,
    ensureLuaClient: async () => {},
    getLuaClient: () => api,
    stopLuaClient: async () => {},
  }) as unknown as Parameters<typeof handleListSpecs>[0];

const textOf = (r: { content: Array<{ type: string; text: string }> }) =>
  r.content.map((c) => c.text).join('');

describe('spec and item-set handlers treat empty-but-successful results as data', () => {
  it('lists the last remaining spec instead of "No specs found"', async () => {
    const api = {
      listSpecs: async () => specResult([{ index: 1, title: 'Solo', active: true, nodeCount: 42 }]),
    };
    const text = textOf(await handleListSpecs(ctx(api)));
    expect(text).toContain('Solo');
    expect(text).not.toMatch(/No specs found/i);
  });

  it('confirms deleting down to the last spec', async () => {
    const api = {
      deleteSpec: async () => specResult([{ index: 1, title: 'OnlyOne', active: true, nodeCount: 10 }]),
    };
    const text = textOf(await handleDeleteSpec(ctx(api), 2));
    expect(text).toMatch(/Deleted spec 2/);
    expect(text).toContain('1 spec(s) remaining');
    expect(text).not.toMatch(/Failed/i);
  });

  it('confirms a rename even when the spec list comes back empty', async () => {
    const api = { renameSpec: async () => specResult([]) };
    const text = textOf(await handleRenameSpec(ctx(api), 3, 'Fresh Title'));
    expect(text).toMatch(/renamed to "Fresh Title"/);
    expect(text).not.toMatch(/Failed/i);
  });

  it('lists the last remaining item set', async () => {
    const api = {
      listItemSets: async () => ({ itemSets: [{ id: 1, title: 'Gear', active: true }], activeItemSetId: 1 }),
    };
    const text = textOf(await handleListItemSets(ctx(api)));
    expect(text).toContain('Gear');
    expect(text).not.toMatch(/No item sets found/i);
  });
});
