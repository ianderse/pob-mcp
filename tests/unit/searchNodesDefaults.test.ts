import { describe, it, expect } from '@jest/globals';
import { handleSearchTreeNodes } from '../../src/handlers/luaHandlers.js';

// search_tree_nodes documents include_allocated as defaulting to false, but
// the Lua engine reads a missing value as `~= false` — i.e. TRUE. Passing the
// undefined straight through meant the documented default silently produced
// the opposite: every default search included already-allocated nodes.
describe('search_tree_nodes include_allocated default', () => {
  const capture = () => {
    const seen: Array<Record<string, unknown>> = [];
    const api = {
      searchNodes: async (params: Record<string, unknown>) => {
        seen.push(params);
        return { nodes: [], count: 0 };
      },
    };
    const context = {
      pobDirectory: '/tmp',
      luaEnabled: true,
      ensureLuaClient: async () => {},
      getLuaClient: () => api,
      stopLuaClient: async () => {},
    } as unknown as Parameters<typeof handleSearchTreeNodes>[0];
    return { context, seen };
  };

  it('sends includeAllocated=false when the caller omits it', async () => {
    const { context, seen } = capture();
    await handleSearchTreeNodes(context, 'life');
    expect(seen[0].includeAllocated).toBe(false);
  });

  it('honours an explicit true', async () => {
    const { context, seen } = capture();
    await handleSearchTreeNodes(context, 'life', undefined, undefined, true);
    expect(seen[0].includeAllocated).toBe(true);
  });

  it('honours an explicit false', async () => {
    const { context, seen } = capture();
    await handleSearchTreeNodes(context, 'life', undefined, undefined, false);
    expect(seen[0].includeAllocated).toBe(false);
  });
});
