import { describe, it, expect } from '@jest/globals';
import { SteinerSolver } from '../../src/services/steinerSolver';
import type { PassiveTreeData, PassiveTreeNode } from '../../src/types';

// Simple linear graph: A -- B -- C -- D -- E
function makeLinearGraph(): PassiveTreeData {
  const nodes = new Map<string, PassiveTreeNode>();
  nodes.set('1', { skill: 1, name: 'A', out: ['2'], in: [] });
  nodes.set('2', { skill: 2, name: 'B', out: ['3'], in: ['1'] });
  nodes.set('3', { skill: 3, name: 'C', out: ['4'], in: ['2'] });
  nodes.set('4', { skill: 4, name: 'D', out: ['5'], in: ['3'] });
  nodes.set('5', { skill: 5, name: 'E', out: [], in: ['4'] });
  return { nodes, version: '3_27' };
}

// Diamond graph:    B
//                  / \
//            A -- X   Y -- E
//                  \ /
//                   C
function makeDiamondGraph(): PassiveTreeData {
  const nodes = new Map<string, PassiveTreeNode>();
  nodes.set('1', { skill: 1, name: 'A', out: ['2'], in: [] });
  nodes.set('2', { skill: 2, name: 'X', out: ['3', '4'], in: ['1'] });
  nodes.set('3', { skill: 3, name: 'B', out: ['5'], in: ['2'] });
  nodes.set('4', { skill: 4, name: 'C', out: ['5'], in: ['2'] });
  nodes.set('5', { skill: 5, name: 'Y', out: ['6'], in: ['3', '4'] });
  nodes.set('6', { skill: 6, name: 'E', out: [], in: ['5'] });
  return { nodes, version: '3_27' };
}

describe('SteinerSolver', () => {
  describe('computeAllPairsDistances', () => {
    it('should compute distances on linear graph', () => {
      const graph = makeLinearGraph();
      const terminals = new Set(['1', '3', '5']);
      const solver = new SteinerSolver(graph, terminals);
      const { distances } = solver.computeAllPairsDistances();

      expect(distances.get('1')!.get('3')).toBe(2);
      expect(distances.get('1')!.get('5')).toBe(4);
      expect(distances.get('3')!.get('5')).toBe(2);
    });

    it('should return shortest path nodes between terminals', () => {
      const graph = makeLinearGraph();
      const terminals = new Set(['1', '5']);
      const solver = new SteinerSolver(graph, terminals);
      const { paths } = solver.computeAllPairsDistances();

      const path = paths.get('1')!.get('5')!;
      expect(path).toEqual(['1', '2', '3', '4', '5']);
    });

    it('should find shortest path in diamond graph', () => {
      const graph = makeDiamondGraph();
      const terminals = new Set(['1', '6']);
      const solver = new SteinerSolver(graph, terminals);
      const { distances } = solver.computeAllPairsDistances();

      // A->X->B->Y->E or A->X->C->Y->E = 4 either way
      expect(distances.get('1')!.get('6')).toBe(4);
    });
  });

  describe('buildReducedSubgraph', () => {
    it('should include all shortest path nodes', () => {
      const graph = makeLinearGraph();
      const terminals = new Set(['1', '5']);
      const solver = new SteinerSolver(graph, terminals);
      const reduced = solver.buildReducedSubgraph();

      // All nodes on the only path 1->2->3->4->5
      expect(reduced.has('1')).toBe(true);
      expect(reduced.has('2')).toBe(true);
      expect(reduced.has('3')).toBe(true);
      expect(reduced.has('4')).toBe(true);
      expect(reduced.has('5')).toBe(true);
    });

    it('should include 1-node expansion neighbors', () => {
      // Graph with a side branch:
      // 1 -- 2 -- 3 -- 4
      //           |
      //           5 (side branch)
      const nodes = new Map<string, PassiveTreeNode>();
      nodes.set('1', { skill: 1, name: 'A', out: ['2'], in: [] });
      nodes.set('2', { skill: 2, name: 'B', out: ['3'], in: ['1'] });
      nodes.set('3', { skill: 3, name: 'C', out: ['4', '5'], in: ['2'] });
      nodes.set('4', { skill: 4, name: 'D', out: [], in: ['3'] });
      nodes.set('5', { skill: 5, name: 'E', out: [], in: ['3'] });
      const graph: PassiveTreeData = { nodes, version: '3_27' };

      const terminals = new Set(['1', '4']);
      const solver = new SteinerSolver(graph, terminals);
      const reduced = solver.buildReducedSubgraph();

      // Path is 1->2->3->4, node 5 is 1 away from node 3 (on path)
      expect(reduced.has('5')).toBe(true);
    });

    it('should not include nodes more than 1 away from shortest paths', () => {
      // 1 -- 2 -- 3 -- 4
      //                |
      //                5 -- 6 -- 7
      const nodes = new Map<string, PassiveTreeNode>();
      nodes.set('1', { skill: 1, name: 'A', out: ['2'], in: [] });
      nodes.set('2', { skill: 2, name: 'B', out: ['3'], in: ['1'] });
      nodes.set('3', { skill: 3, name: 'C', out: ['4'], in: ['2'] });
      nodes.set('4', { skill: 4, name: 'D', out: ['5'], in: ['3'] });
      nodes.set('5', { skill: 5, name: 'E', out: ['6'], in: ['4'] });
      nodes.set('6', { skill: 6, name: 'F', out: ['7'], in: ['5'] });
      nodes.set('7', { skill: 7, name: 'G', out: [], in: ['6'] });
      const graph: PassiveTreeData = { nodes, version: '3_27' };

      // Terminals are 1 and 3, path is 1->2->3
      // Node 4 is 1 away from path node 3 (included), 5 is 1 away from 4 (included)
      // Expansion is only 1 from PATH nodes, not recursive
      const terminals = new Set(['1', '3']);
      const solver = new SteinerSolver(graph, terminals);
      const reduced = solver.buildReducedSubgraph();

      expect(reduced.has('4')).toBe(true);  // 1 away from path node 3
      expect(reduced.has('5')).toBe(false); // 2 away from path
      expect(reduced.has('6')).toBe(false);
      expect(reduced.has('7')).toBe(false);
    });
  });

  describe('node-weighted cost', () => {
    it('does not charge for adjacent terminals', () => {
      // A(t) -- B(t) -- C -- D(t)
      const nodes = new Map<string, PassiveTreeNode>();
      nodes.set('1', { skill: 1, name: 'A', out: ['2'], in: [] });
      nodes.set('2', { skill: 2, name: 'B', out: ['3'], in: ['1'] });
      nodes.set('3', { skill: 3, name: 'C', out: ['4'], in: ['2'] });
      nodes.set('4', { skill: 4, name: 'D', out: [], in: ['3'] });
      const result = new SteinerSolver({ nodes, version: '3_27' }, new Set(['1', '2', '4'])).solve();
      expect(result.cost).toBe(1);
      expect(result.nodes).toEqual(new Set(['1', '2', '3', '4']));
    });

    it('prefers a route through another terminal over a long forced-looking chain', () => {
      // A and B are joined by a 5-node chain, but also via terminal C (A-C-B)
      const nodes = new Map<string, PassiveTreeNode>();
      const link = (a: string, b: string) => {
        nodes.get(a)!.out!.push(b);
        nodes.get(b)!.in!.push(a);
      };
      for (const id of ['A', 'B', 'C', 'x1', 'x2', 'x3', 'x4', 'x5']) {
        nodes.set(id, { skill: 0, name: id, out: [], in: [] });
      }
      link('A', 'x1'); link('x1', 'x2'); link('x2', 'x3'); link('x3', 'x4'); link('x4', 'x5'); link('x5', 'B');
      link('A', 'C'); link('C', 'B');
      const result = new SteinerSolver({ nodes, version: '3_27' }, new Set(['A', 'B', 'C'])).solve();
      expect(result.cost).toBe(0);
      expect(result.nodes).toEqual(new Set(['A', 'B', 'C']));
    });
  });

  describe('reachability and limits', () => {
    it('reports terminals in a different component instead of failing', () => {
      const nodes = new Map<string, PassiveTreeNode>();
      nodes.set('1', { skill: 1, name: 'A', out: ['2'], in: [] });
      nodes.set('2', { skill: 2, name: 'B', out: [], in: ['1'] });
      nodes.set('9', { skill: 9, name: 'Island', out: [], in: [] });
      const result = new SteinerSolver({ nodes, version: '3_27' }, new Set(['1', '2', '9'])).solve();
      expect(result.unreachable).toEqual(['9']);
      expect(result.terminalCount).toBe(2);
      expect(result.nodes).toEqual(new Set(['1', '2']));
    });

    it('falls back to KMB beyond the reduced-DP terminal limit', () => {
      // Star: hub 0 with 14 leaf terminals
      const nodes = new Map<string, PassiveTreeNode>();
      nodes.set('0', { skill: 0, name: 'hub', out: [], in: [] });
      const leaves: string[] = [];
      for (let i = 1; i <= 14; i++) {
        nodes.set(String(i), { skill: i, name: `L${i}`, out: ['0'], in: [] });
        leaves.push(String(i));
      }
      const result = new SteinerSolver({ nodes, version: '3_27' }, new Set(leaves)).solve();
      expect(result.method).toBe('kmb');
      expect(result.exact).toBe(false);
      expect(result.cost).toBe(1);
    });

    it('falls back to KMB when the DP exceeds its deadline', () => {
      const nodes = new Map<string, PassiveTreeNode>();
      nodes.set('0', { skill: 0, name: 'hub', out: [], in: [] });
      const leaves: string[] = [];
      for (let i = 1; i <= 8; i++) {
        nodes.set(String(i), { skill: i, name: `L${i}`, out: ['0'], in: [] });
        leaves.push(String(i));
      }
      const result = new SteinerSolver({ nodes, version: '3_27' }, new Set(leaves), { deadlineMs: -1 }).solve();
      expect(result.timedOut).toBe(true);
      expect(result.method).toBe('kmb');
      expect(result.cost).toBe(1);
    });
  });

  describe('solveExact', () => {
    it('should find optimal tree on linear graph', () => {
      const graph = makeLinearGraph();
      const terminals = new Set(['1', '5']);
      const solver = new SteinerSolver(graph, terminals);
      const result = solver.solveExact();

      // Only path: 1-2-3-4-5, cost = 3 travel nodes
      expect(result.nodes).toEqual(new Set(['1', '2', '3', '4', '5']));
      expect(result.cost).toBe(3); // 3 non-terminal nodes
      expect(result.exact).toBe(true);
    });

    it('should find optimal tree on diamond graph', () => {
      const graph = makeDiamondGraph();
      // Terminals: A(1) and E(6)
      // Path A->X->B->Y->E or A->X->C->Y->E = 4 nodes each (2 travel)
      const terminals = new Set(['1', '6']);
      const solver = new SteinerSolver(graph, terminals);
      const result = solver.solveExact();

      expect(result.cost).toBe(3); // 3 travel nodes (X, B|C, Y)
      expect(result.nodes.size).toBe(5); // 2 terminals + 3 travel
    });

    it('should find optimal Steiner point in Y-shaped graph', () => {
      //     B(t)
      //     |
      // A(t)-- X -- C(t)
      //
      // X is the Steiner point connecting all 3 terminals
      const nodes = new Map<string, PassiveTreeNode>();
      nodes.set('1', { skill: 1, name: 'A', isNotable: true, out: ['4'], in: [] });
      nodes.set('2', { skill: 2, name: 'B', isNotable: true, out: ['4'], in: [] });
      nodes.set('3', { skill: 3, name: 'C', isNotable: true, out: ['4'], in: [] });
      nodes.set('4', { skill: 4, name: 'X', out: [], in: ['1', '2', '3'] });
      const graph: PassiveTreeData = { nodes, version: '3_27' };

      const terminals = new Set(['1', '2', '3']);
      const solver = new SteinerSolver(graph, terminals);
      const result = solver.solveExact();

      // Optimal: use X as Steiner point, cost = 1 travel node
      expect(result.nodes).toEqual(new Set(['1', '2', '3', '4']));
      expect(result.cost).toBe(1);
    });

    it('should prefer fewer travel nodes over longer paths', () => {
      // Star graph: center X connects to terminals A, B, C and also
      // there's a long path A--D--E--B
      const nodes = new Map<string, PassiveTreeNode>();
      nodes.set('1', { skill: 1, name: 'A', isNotable: true, out: ['4'], in: [] });
      nodes.set('2', { skill: 2, name: 'B', isNotable: true, out: ['4', '6'], in: [] });
      nodes.set('3', { skill: 3, name: 'C', isNotable: true, out: ['4'], in: [] });
      nodes.set('4', { skill: 4, name: 'X', out: [], in: ['1', '2', '3'] });
      nodes.set('5', { skill: 5, name: 'D', out: ['6'], in: ['1'] }); // A--D
      nodes.set('6', { skill: 6, name: 'E', out: [], in: ['5', '2'] }); // D--E--B
      // Add reverse connections
      nodes.get('1')!.out!.push('5');
      const graph: PassiveTreeData = { nodes, version: '3_27' };

      const terminals = new Set(['1', '2', '3']);
      const solver = new SteinerSolver(graph, terminals);
      const result = solver.solveExact();

      // Optimal: star through X (cost 1), not A-D-E-B path (cost 2)
      expect(result.cost).toBe(1);
      expect(result.nodes.has('4')).toBe(true); // X is the Steiner point
    });
  });

  describe('solveKMB', () => {
    it('should find a valid tree on linear graph', () => {
      const graph = makeLinearGraph();
      const terminals = new Set(['1', '5']);
      const solver = new SteinerSolver(graph, terminals);
      const result = solver.solveKMB();

      expect(result.nodes).toEqual(new Set(['1', '2', '3', '4', '5']));
      expect(result.cost).toBe(3);
      expect(result.exact).toBe(false);
    });

    it('should find optimal tree on Y-shaped graph', () => {
      const nodes = new Map<string, PassiveTreeNode>();
      nodes.set('1', { skill: 1, name: 'A', isNotable: true, out: ['4'], in: [] });
      nodes.set('2', { skill: 2, name: 'B', isNotable: true, out: ['4'], in: [] });
      nodes.set('3', { skill: 3, name: 'C', isNotable: true, out: ['4'], in: [] });
      nodes.set('4', { skill: 4, name: 'X', out: [], in: ['1', '2', '3'] });
      const graph: PassiveTreeData = { nodes, version: '3_27' };

      const terminals = new Set(['1', '2', '3']);
      const solver = new SteinerSolver(graph, terminals);
      const result = solver.solveKMB();

      // KMB should also find the optimal here (MST of metric graph uses X)
      expect(result.nodes.has('4')).toBe(true);
      expect(result.cost).toBe(1);
    });
  });

  describe('solve', () => {
    it('should use exact DP for small terminal count', () => {
      const graph = makeLinearGraph();
      const terminals = new Set(['1', '5']);
      const solver = new SteinerSolver(graph, terminals);
      const result = solver.solve();

      expect(result.exact).toBe(true);
      expect(result.cost).toBe(3);
    });

    it('should return the same result as solveExact for small graphs', () => {
      const nodes = new Map<string, PassiveTreeNode>();
      nodes.set('1', { skill: 1, name: 'A', isNotable: true, out: ['4'], in: [] });
      nodes.set('2', { skill: 2, name: 'B', isNotable: true, out: ['4'], in: [] });
      nodes.set('3', { skill: 3, name: 'C', isNotable: true, out: ['4'], in: [] });
      nodes.set('4', { skill: 4, name: 'X', out: [], in: ['1', '2', '3'] });
      const graph: PassiveTreeData = { nodes, version: '3_27' };

      const terminals = new Set(['1', '2', '3']);
      const solver = new SteinerSolver(graph, terminals);
      const result = solver.solve();

      expect(result.exact).toBe(true);
      expect(result.cost).toBe(1);
      expect(result.nodes.has('4')).toBe(true);
    });
  });
});
