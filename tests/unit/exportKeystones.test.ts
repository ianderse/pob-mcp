import { describe, it, expect, jest } from '@jest/globals';
import { handleExportBuildSummary } from '../../src/handlers/exportHandlers.js';

// The bridge's get_tree returns node IDs only. The export summary used to
// carry no keystone section at all (review finding 17); keystones are now
// derived from the same passive-tree data the tree tools use, and the
// section degrades honestly: omitted when unresolvable, never fabricated.

const baseTree = {
  nodes: [1, 2],
  treeVersion: '3_28',
  classId: 2,
  ascendClassId: 0,
  secondaryAscendClassId: 0,
  masteryEffects: {},
  ascendancyPointsUsed: 0,
};

function makeContext(tree: unknown, treeService: Record<string, unknown>) {
  return {
    buildService: {},
    exportService: {},
    treeService,
    luaClient: {
      getBuildInfo: async () => ({ name: 'Test Build', level: 100, className: 'Ranger' }),
      getStats: async () => ({ Life: 5000, CombinedDPS: 1e6 }),
      getSkills: async () => ({ groups: [], mainSocketGroup: 1 }),
      getTree: async () => tree,
    },
  } as unknown as Parameters<typeof handleExportBuildSummary>[0];
}

const textOf = (r: { content: Array<{ type: string; text: string }> }) =>
  r.content.map((c) => c.text).join('');

describe('export build summary keystone section', () => {
  it('renders keystone names derived from tree data (not other node types)', async () => {
    const mapNodesToDetails = jest.fn(async () => ({
      nodes: [
        { skill: 1, name: 'Glancing Blows', isKeystone: true },
        { skill: 2, name: 'Some Notable', isNotable: true },
      ],
      invalidIds: [],
    }));
    const ctx = makeContext(baseTree, {
      getTreeData: async () => ({}),
      mapNodesToDetails,
    });

    const text = textOf(await handleExportBuildSummary(ctx));
    expect(text).toContain('## Keystones');
    expect(text).toContain('- Glancing Blows');
    expect(text).not.toContain('- Some Notable');
    // derivation asked for the build's own tree version
    expect(mapNodesToDetails).toHaveBeenCalledWith(['1', '2'], {});
  });

  it('says None allocated for a loaded-but-empty tree instead of vanishing', async () => {
    const ctx = makeContext({ ...baseTree, nodes: [] }, {
      getTreeData: async () => { throw new Error('must not fetch for empty tree'); },
      mapNodesToDetails: async () => ({ nodes: [], invalidIds: [] }),
    });
    const text = textOf(await handleExportBuildSummary(ctx));
    expect(text).toContain('## Keystones');
    expect(text).toContain('_None allocated_');
  });

  it('omits the section when tree data cannot be resolved, keeping the rest of the summary', async () => {
    const ctx = makeContext(baseTree, {
      getTreeData: async () => { throw new Error('tree data unreachable'); },
      mapNodesToDetails: async () => ({ nodes: [], invalidIds: [] }),
    });
    const text = textOf(await handleExportBuildSummary(ctx));
    expect(text).not.toContain('## Keystones');
    expect(text).toContain('# Test Build'); // summary still produced
  });

  it('does not claim keystones when the bridge could not report the tree at all', async () => {
    const ctx = makeContext(null, {
      getTreeData: async () => ({}),
      mapNodesToDetails: async () => ({ nodes: [], invalidIds: [] }),
    });
    const text = textOf(await handleExportBuildSummary(ctx));
    expect(text).not.toContain('## Keystones');
  });
});
