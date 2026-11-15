import type { PassiveTreeData } from '../types.js';

/**
 * Minimum-cost connection of a set of passive tree nodes.
 *
 * Cost is the number of NON-terminal nodes in the connecting tree (every
 * travel node costs one passive point; terminals are free because the caller
 * wants them regardless). That is the node-weighted Steiner tree problem.
 *
 * Original solver design (Dreyfus-Wagner DP with a KMB fallback) by
 * marcoaaguiar/pob-mcp. This version weights nodes rather than edges so
 * adjacent terminals need no special merging, and adds a deadline and a
 * reachability report.
 */

export interface SteinerResult {
  /** Terminals plus the travel nodes that connect them */
  nodes: Set<string>;
  /** Number of non-terminal nodes in `nodes` (the passive points spent) */
  cost: number;
  /**
   * True only when the dynamic program ran over the whole graph, so `cost` is
   * a proven minimum. False for the reduced-subgraph DP and for the KMB
   * approximation (at most about twice the minimum).
   */
  exact: boolean;
  /** Which method produced the result */
  method: 'trivial' | 'exact' | 'reduced-dp' | 'kmb';
  /** Terminals that were connected (those in the first terminal's component) */
  terminalCount: number;
  /** Terminals that cannot be reached from the first terminal at all */
  unreachable: string[];
  /** True when the DP ran out of time and the KMB fallback was used */
  timedOut: boolean;
}

export interface SteinerOptions {
  /** Wall-clock budget for the DP in milliseconds (default 5000) */
  deadlineMs?: number;
  /** Largest terminal count solved by full-graph DP (default 8) */
  maxExactTerminals?: number;
  /** Largest terminal count solved by reduced-subgraph DP (default 12) */
  maxReducedTerminals?: number;
}

class DeadlineExceeded extends Error {}

const INF = 1e9;

export class SteinerSolver {
  private readonly adjacency = new Map<string, string[]>();
  private readonly terminals: Set<string>;
  private readonly deadlineMs: number;
  private readonly maxExact: number;
  private readonly maxReduced: number;
  private deadlineAt = Infinity;

  constructor(graph: PassiveTreeData, terminals: Set<string>, options: SteinerOptions = {}) {
    this.deadlineMs = options.deadlineMs ?? 5000;
    this.maxExact = options.maxExactTerminals ?? 8;
    this.maxReduced = options.maxReducedTerminals ?? 12;

    // Build a symmetric, de-duplicated adjacency restricted to known nodes.
    for (const id of graph.nodes.keys()) this.adjacency.set(id, []);
    for (const [id, node] of graph.nodes) {
      for (const other of [...(node.out ?? []), ...(node.in ?? [])]) {
        if (other === id || !graph.nodes.has(other)) continue;
        this.adjacency.get(id)!.push(other);
        this.adjacency.get(other)!.push(id);
      }
    }
    for (const [id, list] of this.adjacency) this.adjacency.set(id, [...new Set(list)]);

    this.terminals = new Set([...terminals].filter(t => this.adjacency.has(t)));
  }

  private getNeighbors(nodeId: string): string[] {
    return this.adjacency.get(nodeId) ?? [];
  }

  private checkDeadline(): void {
    if (Date.now() > this.deadlineAt) throw new DeadlineExceeded();
  }

  private bfs(source: string): { dist: Map<string, number>; prev: Map<string, string | null> } {
    const dist = new Map<string, number>([[source, 0]]);
    const prev = new Map<string, string | null>([[source, null]]);
    const queue: string[] = [source];
    let head = 0;
    while (head < queue.length) {
      const current = queue[head++];
      const d = dist.get(current)!;
      for (const neighbor of this.getNeighbors(current)) {
        if (!dist.has(neighbor)) {
          dist.set(neighbor, d + 1);
          prev.set(neighbor, current);
          queue.push(neighbor);
        }
      }
    }
    return { dist, prev };
  }

  private reconstructPath(prev: Map<string, string | null>, from: string, to: string): string[] {
    const path: string[] = [];
    let current: string | null = to;
    while (current !== null) {
      path.push(current);
      current = prev.get(current) ?? null;
    }
    path.reverse();
    return path[0] === from ? path : [];
  }

  /** Shortest distances and paths between every pair of terminals (BFS on the full graph). */
  computeAllPairsDistances(terminals: Iterable<string> = this.terminals): {
    distances: Map<string, Map<string, number>>;
    paths: Map<string, Map<string, string[]>>;
  } {
    const list = [...terminals];
    const distances = new Map<string, Map<string, number>>();
    const paths = new Map<string, Map<string, string[]>>();
    for (const a of list) {
      const { dist, prev } = this.bfs(a);
      const dMap = new Map<string, number>();
      const pMap = new Map<string, string[]>();
      for (const b of list) {
        if (a === b) continue;
        const d = dist.get(b);
        if (d !== undefined) {
          dMap.set(b, d);
          pMap.set(b, this.reconstructPath(prev, a, b));
        }
      }
      distances.set(a, dMap);
      paths.set(a, pMap);
    }
    return { distances, paths };
  }

  /** Union of all pairwise shortest paths between terminals, expanded by one node. */
  buildReducedSubgraph(terminals: Iterable<string> = this.terminals): Set<string> {
    const { paths } = this.computeAllPairsDistances(terminals);
    const pathNodes = new Set<string>();
    for (const [, termPaths] of paths) {
      for (const [, path] of termPaths) for (const id of path) pathNodes.add(id);
    }
    const expanded = new Set(pathNodes);
    for (const id of pathNodes) for (const n of this.getNeighbors(id)) expanded.add(n);
    return expanded;
  }

  private countTravel(nodes: Set<string>): number {
    let n = 0;
    for (const id of nodes) if (!this.terminals.has(id)) n++;
    return n;
  }

  /** Node-weighted Dreyfus-Wagner over `nodeSet` (terminals weigh 0, others 1). */
  private runDP(termList: string[], nodeSet: Set<string>): Set<string> {
    const nodeList = [...nodeSet];
    const n = nodeList.length;
    const index = new Map<string, number>();
    nodeList.forEach((id, i) => index.set(id, i));
    const adj: number[][] = nodeList.map(id =>
      this.getNeighbors(id).map(x => index.get(x)).filter((x): x is number => x !== undefined)
    );
    const weight = new Uint8Array(n);
    for (let i = 0; i < n; i++) weight[i] = this.terminals.has(nodeList[i]) ? 0 : 1;

    const k = termList.length;
    const full = (1 << k) - 1;
    const dp = new Float64Array((full + 1) * n).fill(INF);
    // kind: 0 none/base, 1 combine (arg = S1), 2 edge (arg = predecessor index)
    const kind = new Uint8Array((full + 1) * n);
    const arg = new Int32Array((full + 1) * n);

    for (let i = 0; i < k; i++) {
      const ti = index.get(termList[i]);
      if (ti === undefined) throw new Error('terminal missing from DP subgraph');
      dp[(1 << i) * n + ti] = 0;
    }

    for (let S = 1; S <= full; S++) {
      this.checkDeadline();
      const base = S * n;
      if ((S & (S - 1)) !== 0) {
        for (let S1 = (S - 1) & S; S1 > 0; S1 = (S1 - 1) & S) {
          const S2 = S ^ S1;
          if (S2 > S1) continue;
          const b1 = S1 * n;
          const b2 = S2 * n;
          for (let v = 0; v < n; v++) {
            const val = dp[b1 + v] + dp[b2 + v] - weight[v];
            if (val < dp[base + v]) {
              dp[base + v] = val;
              kind[base + v] = 1;
              arg[base + v] = S1;
            }
          }
        }
        this.checkDeadline();
      }
      // Dijkstra relaxation with node weights (binary heap of [cost, node]).
      const heap: Array<[number, number]> = [];
      const push = (item: [number, number]) => {
        heap.push(item);
        let i = heap.length - 1;
        while (i > 0) {
          const p = (i - 1) >> 1;
          if (heap[p][0] <= heap[i][0]) break;
          [heap[p], heap[i]] = [heap[i], heap[p]];
          i = p;
        }
      };
      const pop = (): [number, number] => {
        const top = heap[0];
        const last = heap.pop()!;
        if (heap.length > 0) {
          heap[0] = last;
          let i = 0;
          for (;;) {
            const l = 2 * i + 1;
            const r = l + 1;
            let m = i;
            if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
            if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
            if (m === i) break;
            [heap[m], heap[i]] = [heap[i], heap[m]];
            i = m;
          }
        }
        return top;
      };
      for (let v = 0; v < n; v++) if (dp[base + v] < INF) push([dp[base + v], v]);
      while (heap.length > 0) {
        const [cost, v] = pop();
        if (cost > dp[base + v]) continue;
        for (const u of adj[v]) {
          const nc = cost + weight[u];
          if (nc < dp[base + u]) {
            dp[base + u] = nc;
            kind[base + u] = 2;
            arg[base + u] = v;
            push([nc, u]);
          }
        }
      }
    }

    const root = index.get(termList[0])!;
    if (dp[full * n + root] >= INF) throw new Error('terminals are not connected in the DP subgraph');

    const result = new Set<string>();
    const stack: Array<[number, number]> = [[full, root]];
    while (stack.length > 0) {
      const [S, v] = stack.pop()!;
      result.add(nodeList[v]);
      const at = S * n + v;
      if (kind[at] === 1) {
        stack.push([arg[at], v], [S ^ arg[at], v]);
      } else if (kind[at] === 2) {
        stack.push([S, arg[at]]);
      }
    }
    return result;
  }

  /** Terminals in the component of the first terminal, plus the ones cut off from it. */
  private splitReachable(): { connected: string[]; unreachable: string[] } {
    const list = [...this.terminals];
    if (list.length === 0) return { connected: [], unreachable: [] };
    const { dist } = this.bfs(list[0]);
    return {
      connected: list.filter(t => dist.has(t)),
      unreachable: list.filter(t => !dist.has(t)),
    };
  }

  /**
   * Exact node-weighted DP over `nodeSet` (the whole graph when omitted).
   * Only proven optimal when run on the whole graph.
   */
  solveExact(): SteinerResult {
    return this.finish('exact', () => {
      const { connected } = this.splitReachable();
      return this.runDP(connected, this.componentOf(connected[0]));
    });
  }

  private componentOf(source: string): Set<string> {
    return new Set(this.bfs(source).dist.keys());
  }

  /**
   * KMB 2-approximation: MST over the terminals' shortest-path metric closure,
   * expanded back to real paths, then pruned of non-terminal leaves.
   */
  solveKMB(): SteinerResult {
    return this.finish('kmb', () => this.kmbNodes(this.splitReachable().connected));
  }

  private kmbNodes(termList: string[]): Set<string> {
    const k = termList.length;
    const { distances, paths } = this.computeAllPairsDistances(termList);
    const inMST = new Set<string>();
    const key = new Map<string, number>(termList.map(t => [t, Infinity]));
    const parent = new Map<string, string | null>(termList.map(t => [t, null]));
    key.set(termList[0], 0);
    const solution = new Set<string>();

    for (let i = 0; i < k; i++) {
      let u = '';
      let best = Infinity;
      for (const t of termList) {
        if (!inMST.has(t) && key.get(t)! < best) {
          best = key.get(t)!;
          u = t;
        }
      }
      if (u === '') break;
      inMST.add(u);
      solution.add(u);
      const p = parent.get(u);
      if (p) for (const id of paths.get(p)?.get(u) ?? []) solution.add(id);
      for (const t of termList) {
        if (inMST.has(t)) continue;
        const d = distances.get(u)?.get(t);
        if (d !== undefined && d < key.get(t)!) {
          key.set(t, d);
          parent.set(t, u);
        }
      }
    }

    let pruned = true;
    while (pruned) {
      pruned = false;
      for (const id of [...solution]) {
        if (this.terminals.has(id)) continue;
        if (this.getNeighbors(id).filter(x => solution.has(x)).length <= 1) {
          solution.delete(id);
          pruned = true;
        }
      }
    }
    return solution;
  }

  private finish(method: 'exact' | 'kmb', run: () => Set<string>): SteinerResult {
    const { connected, unreachable } = this.splitReachable();
    if (connected.length <= 1) {
      const nodes = new Set(connected);
      return { nodes, cost: 0, exact: true, method: 'trivial', terminalCount: connected.length, unreachable, timedOut: false };
    }
    this.deadlineAt = Date.now() + this.deadlineMs;
    const nodes = run();
    return {
      nodes,
      cost: this.countTravel(nodes),
      exact: method === 'exact',
      method,
      terminalCount: connected.length,
      unreachable,
      timedOut: false,
    };
  }

  /**
   * Picks a method by terminal count: full-graph DP (proven minimum) for few
   * terminals, DP on the reduced subgraph (usually optimal, not proven) for
   * more, KMB beyond that or when the DP exceeds its time budget.
   */
  solve(): SteinerResult {
    const { connected, unreachable } = this.splitReachable();
    if (connected.length <= 1) return this.finish('exact', () => new Set(connected));

    this.deadlineAt = Date.now() + this.deadlineMs;
    const k = connected.length;
    try {
      if (k <= this.maxExact) {
        const nodes = this.runDP(connected, this.componentOf(connected[0]));
        return { nodes, cost: this.countTravel(nodes), exact: true, method: 'exact', terminalCount: k, unreachable, timedOut: false };
      }
      if (k <= this.maxReduced) {
        const nodes = this.runDP(connected, this.buildReducedSubgraph(connected));
        return { nodes, cost: this.countTravel(nodes), exact: false, method: 'reduced-dp', terminalCount: k, unreachable, timedOut: false };
      }
    } catch (e) {
      if (!(e instanceof DeadlineExceeded)) throw e;
      const nodes = this.kmbNodes(connected);
      return { nodes, cost: this.countTravel(nodes), exact: false, method: 'kmb', terminalCount: k, unreachable, timedOut: true };
    }
    const nodes = this.kmbNodes(connected);
    return { nodes, cost: this.countTravel(nodes), exact: false, method: 'kmb', terminalCount: k, unreachable, timedOut: false };
  }
}
