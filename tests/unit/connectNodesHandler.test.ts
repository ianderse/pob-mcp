import { describe, it, expect, jest } from '@jest/globals';
import { handleConnectNodes } from '../../src/handlers/treeHandlers';
import type { PassiveTreeData, PassiveTreeNode } from '../../src/types';

// 1 (allocated) - 2 - 3 - 4(target)
//                     \ 5 - 6(target)
// 7 is a mastery, 8 is an unstarted ascendancy node touching 3.
function makeTree(): PassiveTreeData {
  const nodes = new Map<string, PassiveTreeNode>();
  const add = (id: string, extra: Partial<PassiveTreeNode>, out: string[]) =>
    nodes.set(id, { skill: Number(id), name: `N${id}`, out, in: [], ...extra });
  add('1', {}, ['2']);
  add('2', {}, ['3']);
  add('3', {}, ['4', '5', '8']);
  add('4', { isNotable: true, stats: ['+10 to Strength'] }, []);
  add('5', {}, ['6']);
  add('6', { isNotable: true, stats: ['+10 to Dexterity'] }, []);
  add('7', { isMastery: true }, []);
  add('8', { ascendancyName: 'Slayer' }, []);
  return { nodes, version: '3_28' };
}

function makeContext(calcWith?: jest.Mock) {
  const luaClient = calcWith ? ({ calcWith } as never) : null;
  return {
    buildService: {
      readBuild: async () => ({}),
      parseAllocatedNodes: () => ['1'],
      extractBuildVersion: () => '3_28',
    },
    treeService: { getTreeData: async () => makeTree() },
    getLuaClient: () => luaClient,
  } as never;
}

describe('handleConnectNodes', () => {
  it('shares travel nodes between targets and reports the saving', async () => {
    const res = await handleConnectNodes(makeContext(), 'B', ['4', '6'], false);
    const text = res.content[0].text;
    expect(text).toContain('proven minimum');
    // 2, 3, 4, 5, 6 = 5 points; separate paths cost 3 + 4 = 7
    expect(text).toContain('Passive points to spend: 5 (3 travel + 2 target)');
    expect(text).toContain('saved 2');
    expect(text).toContain('Node IDs: 2, 3, 4, 5, 6');
  });

  it('previews stats with calcWith when the bridge is running', async () => {
    const calcWith = jest.fn(async () => ({ output: { Life: 1200 }, base: { Life: 1000 } }));
    const res = await handleConnectNodes(makeContext(calcWith as never), 'B', ['4']);
    expect(calcWith).toHaveBeenCalledWith({ addNodes: [2, 3, 4] });
    expect(res.content[0].text).toContain('Life: 1,000 -> 1,200 (+200)');
  });

  it('only enters an ascendancy the build has started or targets', async () => {
    const targeted = await handleConnectNodes(makeContext(), 'B', ['8'], false);
    expect(targeted.content[0].text).toContain('Node IDs: 2, 3, 8');
    // 8 is never used as a shortcut when it is not requested
    const other = await handleConnectNodes(makeContext(), 'B', ['4'], false);
    expect(other.content[0].text).not.toContain('[8]');
  });

  it('rejects masteries and unknown nodes', async () => {
    const mastery = await handleConnectNodes(makeContext(), 'B', ['7'], false);
    expect(mastery.isError).toBe(true);
    const unknown = await handleConnectNodes(makeContext(), 'B', ['999'], false);
    expect(unknown.content[0].text).toContain('not found in tree data');
  });

  it('reports already-allocated targets', async () => {
    const res = await handleConnectNodes(makeContext(), 'B', ['1'], false);
    expect(res.content[0].text).toContain('nothing to connect');
  });
});
