import type { BuildService } from "../services/buildService.js";
import { noteIgnoredError } from '../utils/errorHandling.js';
import type { TreeService } from "../services/treeService.js";
import type { SearchedNode } from "../pobLuaBridge.js";
import type { PassiveTreeData, PassiveTreeNode, TreeComparison } from "../types.js";
import { SteinerSolver } from "../services/steinerSolver.js";
import { loadBuildIfDifferent } from "../utils/namedBuild.js";
import type { PoBLuaApiClient } from "../pobLuaBridge.js";
import { handleGetBuildIssues } from "./buildGoalsHandlers.js";

// The only stats the candidate scoring reads; asking calc_with for just these
// keeps each simulation from shipping the whole PoB output over stdio.
const SCORE_FIELDS = ['CombinedDPS', 'TotalDPS', 'TotalEHP', 'Life', 'Minion'];

interface TreeHandlerContext {
  buildService: BuildService;
  treeService: TreeService;
  getLuaClient?: () => PoBLuaApiClient | null;
}

interface PassiveUpgradesContext {
  getLuaClient: () => PoBLuaApiClient | null;
  ensureLuaClient: () => Promise<void>;
}

export async function handleCompareTrees(
  context: TreeHandlerContext,
  build1Name: string,
  build2Name: string
) {
  try {
    const build1 = await context.buildService.readBuild(build1Name);
    const build2 = await context.buildService.readBuild(build2Name);

    const analysis1 = await context.treeService.analyzePassiveTree(build1);
    const analysis2 = await context.treeService.analyzePassiveTree(build2);

    if (!analysis1 || !analysis2) {
      throw new Error('One or both builds lack passive tree data');
    }

    // Calculate differences
    const nodes1Ids = new Set(analysis1.allocatedNodes.map(n => String(n.skill)));
    const nodes2Ids = new Set(analysis2.allocatedNodes.map(n => String(n.skill)));

    const uniqueToBuild1 = analysis1.allocatedNodes.filter(n => !nodes2Ids.has(String(n.skill)));
    const uniqueToBuild2 = analysis2.allocatedNodes.filter(n => !nodes1Ids.has(String(n.skill)));
    const sharedNodes = analysis1.allocatedNodes.filter(n => nodes2Ids.has(String(n.skill)));

    const pointDifference = analysis1.totalPoints - analysis2.totalPoints;

    let archetypeDifference = '';
    if (analysis1.archetype !== analysis2.archetype) {
      archetypeDifference = `Build 1: ${analysis1.archetype} vs Build 2: ${analysis2.archetype}`;
    } else {
      archetypeDifference = `Both builds: ${analysis1.archetype}`;
    }

    const comparison: TreeComparison = {
      build1: { name: build1Name, analysis: analysis1 },
      build2: { name: build2Name, analysis: analysis2 },
      differences: {
        uniqueToBuild1,
        uniqueToBuild2,
        sharedNodes,
        pointDifference,
        archetypeDifference
      }
    };

    const output = formatTreeComparison(comparison);

    return {
      content: [
        {
          type: "text" as const,
          text: output,
        },
      ],
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to compare trees: ${errorMsg}`);
  }
}


export async function handleGetNearbyNodes(
  context: TreeHandlerContext,
  buildName: string | undefined,
  maxDistance?: number,
  filter?: string
) {
  try {
    let allocatedNodeIds: string[] = [];
    let treeVersion = 'Unknown';

    // Try file-based path first
    if (buildName) {
      try {
        const build = await context.buildService.readBuild(buildName);
        allocatedNodeIds = context.buildService.parseAllocatedNodes(build);
        treeVersion = context.buildService.extractBuildVersion(build);
      } catch (e) { noteIgnoredError("Fall through to Lua fallback", e); }
    }

    // Lua bridge fallback when no file or file read failed
    if (allocatedNodeIds.length === 0 && context.getLuaClient) {
      const luaClient = context.getLuaClient();
      if (luaClient) {
        const treeResult = await luaClient.getTree();
        allocatedNodeIds = (treeResult.nodes || []).map(String);
        treeVersion = treeResult.treeVersion || 'Unknown';
      }
    }

    if (allocatedNodeIds.length === 0) {
      return {
        content: [{
          type: "text" as const,
          text: "No allocated nodes found. Provide a build_name or load a build with lua_load_build first.",
        }],
      };
    }

    const allocatedNodes = new Set<string>(allocatedNodeIds);
    const treeData = await context.treeService.getTreeData(treeVersion);

    const distance = maxDistance || 3;

    // Find nearby nodes using TreeService
    const nearbyNodes = context.treeService.findNearbyNodes(
      allocatedNodes,
      treeData,
      distance,
      filter
    );

    if (nearbyNodes.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: `No notable or keystone nodes found within ${distance} nodes of your current tree.\n\nTry increasing max_distance or removing the filter.`,
          },
        ],
      };
    }

    const textLines: string[] = [
      `=== Nearby Nodes (within ${distance} nodes) ===`,
      '',
      `Build: ${buildName || '(in-memory build)'}`,
      `Found ${nearbyNodes.length} nodes`,
      '',
    ];

    // Group by distance
    const byDistance = new Map<number, typeof nearbyNodes>();
    for (const node of nearbyNodes) {
      const existing = byDistance.get(node.distance) || [];
      existing.push(node);
      byDistance.set(node.distance, existing);
    }

    for (const [dist, nodes] of Array.from(byDistance.entries()).sort((a, b) => a[0] - b[0])) {
      textLines.push(`**Distance ${dist}** (${nodes.length} nodes):`);
      for (const { node, nodeId } of nodes.slice(0, 10)) {
        let line = `- ${node.name || 'Unnamed'} [${nodeId}]`;
        if (node.isKeystone) line += ' (KEYSTONE)';
        textLines.push(line);
        if (node.stats && node.stats.length > 0) {
          textLines.push(`  ${node.stats.slice(0, 2).join('; ')}`);
        }
      }
      if (nodes.length > 10) {
        textLines.push(`  ... and ${nodes.length - 10} more`);
      }
      textLines.push('');
    }

    return {
      content: [
        {
          type: "text" as const,
          text: textLines.join('\n'),
        },
      ],
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return {
      isError: true,
      content: [
        {
          type: "text" as const,
          text: `Error: ${errorMsg}`,
        },
      ],
    };
  }
}

export async function handleFindPath(
  context: TreeHandlerContext,
  buildName: string | undefined,
  targetNodeId: string,
  fromNodeId?: string
) {
  try {
    let allocatedNodeIds: string[] = [];
    let treeVersion = 'Unknown';

    // Try file-based path first
    if (buildName) {
      try {
        const build = await context.buildService.readBuild(buildName);
        const spec = context.buildService.getActiveSpec(build);
        if (!spec) {
          throw new Error("Build has no passive tree data");
        }
        allocatedNodeIds = context.buildService.parseAllocatedNodes(build);
        treeVersion = context.buildService.extractBuildVersion(build);
      } catch (e) { noteIgnoredError("Fall through to Lua fallback", e); }
    }

    // Lua bridge fallback when no file or file read failed
    if (allocatedNodeIds.length === 0 && context.getLuaClient) {
      const luaClient = context.getLuaClient();
      if (luaClient) {
        const treeResult = await luaClient.getTree();
        allocatedNodeIds = (treeResult.nodes || []).map(String);
        treeVersion = treeResult.treeVersion || 'Unknown';
      }
    }

    if (allocatedNodeIds.length === 0 && !fromNodeId) {
      return {
        content: [{
          type: "text" as const,
          text: "No allocated nodes found. Provide a build_name or load a build with lua_load_build first.",
        }],
      };
    }

    let allocatedNodes = new Set<string>(allocatedNodeIds);
    const treeData = await context.treeService.getTreeData(treeVersion);

    // Check if target node exists
    const targetNode = treeData.nodes.get(targetNodeId);
    if (!targetNode) {
      throw new Error(`Node ${targetNodeId} not found in tree data`);
    }

    // from_node_id routes from that single node instead of the build's allocated
    // frontier, enabling any-node-to-any-node routing.
    if (fromNodeId) {
      if (!treeData.nodes.has(fromNodeId)) {
        throw new Error(`from_node_id ${fromNodeId} not found in tree data`);
      }
      allocatedNodes = new Set([fromNodeId]);
    }

    // Check if target is already allocated (or is the starting node)
    if (allocatedNodes.has(targetNodeId)) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Node ${targetNodeId} (${targetNode.name || "Unknown"}) is already allocated in this build.`,
          },
        ],
      };
    }

    // Find shortest path(s) using TreeService
    const paths = context.treeService.findShortestPaths(
      allocatedNodes,
      targetNodeId,
      treeData
    );

    if (paths.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: `No path found to node ${targetNodeId} (${targetNode.name || "Unknown"}).\n\nThis node may be unreachable from your current tree (e.g., different class starting area or ascendancy nodes).`,
          },
        ],
      };
    }

    // Format output
    const routeDesc = fromNodeId
      ? `from ${treeData.nodes.get(fromNodeId)?.name || "Node " + fromNodeId} to ${targetNode.name || "Node " + targetNodeId}`
      : `to ${targetNode.name || "Node " + targetNodeId}`;
    const textLines: string[] = [`=== Path ${routeDesc} ===`, ''];
    if (fromNodeId) {
      textLines.push(`From: ${treeData.nodes.get(fromNodeId)?.name || "Unknown"} [${fromNodeId}]`);
    } else {
      textLines.push(`Build: ${buildName || '(in-memory build)'}`);
    }
    textLines.push(`Target: ${targetNode.name || "Unknown"} [${targetNodeId}]`);
    if (targetNode.isKeystone) textLines.push('Type: KEYSTONE');
    else if (targetNode.isNotable) textLines.push('Type: Notable');
    textLines.push('');

    for (let i = 0; i < paths.length; i++) {
      const path = paths[i];
      const pathLabel = paths.length > 1 ? `Path ${i + 1} (Alternative ${i === 0 ? "- Shortest" : i})` : "Shortest Path";

      textLines.push(`**${pathLabel}**`);
      textLines.push(`Total Cost: ${path.cost} passive points`);
      const keystones = path.nodes.filter(id => treeData.nodes.get(id)?.isKeystone).length;
      const notables = path.nodes.filter(id => { const n = treeData.nodes.get(id); return n?.isNotable && !n?.isKeystone; }).length;
      const travel = path.nodes.length - keystones - notables;
      textLines.push(`Nodes to Allocate: ${path.nodes.length}  (${keystones > 0 ? keystones + ' keystone, ' : ''}${notables} notable, ${travel} travel)`, '');

      textLines.push('Allocation Order:');
      for (let j = 0; j < path.nodes.length; j++) {
        const nodeId = path.nodes[j];
        const node = treeData.nodes.get(nodeId);
        if (!node) continue;

        const isTarget = nodeId === targetNodeId;
        const prefix = isTarget ? "→ TARGET: " : `  ${j + 1}. `;

        textLines.push(`${prefix}${node.name || "Travel Node"} [${nodeId}]`);

        if (node.stats && node.stats.length > 0) {
          for (const stat of node.stats) {
            textLines.push(`      ${stat}`);
          }
        } else if (!isTarget) {
          textLines.push('      (Travel node - no stats)');
        }

        if (j < path.nodes.length - 1) textLines.push('');
      }

      if (i < paths.length - 1) textLines.push('', '='.repeat(50), '');
    }

    textLines.push('', '**Next Steps:**');
    textLines.push('Use lua_set_tree to allocate these nodes and recalculate stats.');

    return {
      content: [
        {
          type: "text" as const,
          text: textLines.join('\n'),
        },
      ],
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return {
      isError: true,
      content: [
        {
          type: "text" as const,
          text: `Error: ${errorMsg}`,
        },
      ],
    };
  }
}


export async function handleGetPassiveUpgrades(
  context: PassiveUpgradesContext,
  focus: 'dps' | 'defence' | 'both' = 'both',
  maxResults: number = 10
) {
  await context.ensureLuaClient();
  const luaClient = context.getLuaClient();
  if (!luaClient) throw new Error('Lua bridge not active. Use lua_start and lua_load_build first.');

  // Step 1: get current base stats and issues to determine search keywords
  const { issues, stats: baseStats } = await handleGetBuildIssues(context);

  const baseDPS = (baseStats.CombinedDPS as number) || (baseStats.TotalDPS as number) || (baseStats.MinionTotalDPS as number) || 1;
  const baseEHP = (baseStats.TotalEHP as number) || (baseStats.Life as number) || 1;

  // Step 2: map focus + issues to search keywords
  const keywords: string[] = [];

  if (focus === 'dps' || focus === 'both') {
    keywords.push('damage', 'critical');
  }

  if (focus === 'defence' || focus === 'both') {
    keywords.push('life', 'energy shield');
    // If there are resistance issues, add resistance keywords
    const hasResistIssue = issues.some(i => i.category === 'resistance' && (i.severity === 'error' || i.severity === 'warning'));
    if (hasResistIssue) {
      keywords.push('resistance');
    }
  }

  // Step 3: search for notable candidates
  // search_nodes matches across the whole tree, which includes every other
  // class's ascendancy. Those can never be allocated by this build, so drop
  // them before scoring rather than spending a simulation on each.
  const ownAscendancy = (await luaClient.getBuildInfo())?.ascendClassName ?? '';
  const isSimulatable = (node: SearchedNode): boolean => {
    const ascendancy = node.ascendancy ?? node.ascendancyName ?? '';
    const isForeignAscendancy = ascendancy !== '' && ascendancy !== ownAscendancy;
    const isMastery = node.isMastery === true || node.type === 'Mastery';
    // Blight notables sit off the tree entirely and are reached by anointing an
    // amulet, never by spending a passive point. find_best_anointment covers them.
    const isAnointOnly = node.isBlighted === true;
    return !isForeignAscendancy && !isMastery && !isAnointOnly;
  };

  // One failed keyword should narrow the search, not sink the whole suggestion.
  const searchNotables = async (keyword: string): Promise<SearchedNode[]> => {
    try {
      const results = await luaClient.searchNodes({
        keyword,
        nodeType: 'notable',
        maxResults: 15,
        includeAllocated: false,
      });
      return results?.nodes ?? [];
    } catch {
      return [];
    }
  };

  const uniqueById = (nodes: SearchedNode[]): SearchedNode[] =>
    [...new Map(nodes.map((node) => [String(node.id), node])).values()];

  // The stdio bridge rejects concurrent requests, so these must run in
  // sequence; the accumulator keeps that ordering without mutating state.
  const searched = await keywords.slice(0, 4).reduce<Promise<SearchedNode[]>>(
    async (acc, keyword) => [...(await acc), ...(await searchNotables(keyword))],
    Promise.resolve([]),
  );

  const distinct = uniqueById(searched);
  const candidates = distinct.filter(isSimulatable);
  const skippedForeign = distinct.length - candidates.length;

  if (candidates.length === 0) {
    return {
      content: [{
        type: 'text' as const,
        text: `=== Passive Upgrades (focus: ${focus}) ===\n\nNo unallocated notable candidates found. Make sure a build is loaded.\n`,
      }],
    };
  }

  // Step 4: simulate each candidate with calcWith
  interface ScoredNode {
    node: SearchedNode;
    dpsDelta: number;
    ehpDelta: number;
    score: number;
  }

  const scored: ScoredNode[] = [];

  for (const node of candidates) {
    try {
      const { output: out } = await luaClient.calcWith({ addNodes: [node.id], fields: SCORE_FIELDS });
      if (!out) continue;

      // calcWith returns raw Lua output; minion stats are nested under out.Minion
      // (unlike getStats() which remaps them to MinionTotalDPS etc.)
      const outDPS = (out.CombinedDPS as number) || (out.TotalDPS as number) ||
                     (out.Minion?.CombinedDPS as number) || (out.Minion?.TotalDPS as number) || baseDPS;
      const outEHP = (out.TotalEHP as number) || (out.Life as number) || baseEHP;

      const dpsDelta = outDPS - baseDPS;
      const ehpDelta = outEHP - baseEHP;

      // Relative score weighted by focus
      let score: number;
      if (focus === 'dps') {
        score = dpsDelta / baseDPS;
      } else if (focus === 'defence') {
        score = ehpDelta / baseEHP;
      } else {
        score = (dpsDelta / baseDPS) + (ehpDelta / baseEHP);
      }

      scored.push({ node, dpsDelta, ehpDelta, score });
    } catch (e) {
      // One failed calcWith simulation only removes that candidate; log once
      // per node (dozens per run) rather than aggregating and hiding details.
      noteIgnoredError(`candidate scoring for node ${node.id} skipped`, e);
    }
  }

  // Step 5: sort and return top N
  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, maxResults);

  const textLines: string[] = [
    `=== Passive Upgrades (focus: ${focus}) ===`,
    '',
    `Base DPS: ${Math.round(baseDPS).toLocaleString()}  |  Base EHP: ${Math.round(baseEHP).toLocaleString()}`,
    `Evaluated ${candidates.length} candidate notables, showing top ${top.length}:`,
    ...(skippedForeign > 0
      ? [`(skipped ${skippedForeign} node(s) this build cannot allocate)`]
      : []),
    '',
  ];

  for (let i = 0; i < top.length; i++) {
    const { node, dpsDelta, ehpDelta, score } = top[i];
    textLines.push(`${i + 1}. **${node.name}** [${node.id}]`);
    let scoreLine = `   Score: ${score.toFixed(4)}`;
    if (dpsDelta !== 0) scoreLine += `  |  DPS Δ: ${dpsDelta > 0 ? '+' : ''}${Math.round(dpsDelta).toLocaleString()}`;
    if (ehpDelta !== 0) scoreLine += `  |  EHP Δ: ${ehpDelta > 0 ? '+' : ''}${Math.round(ehpDelta).toLocaleString()}`;
    textLines.push(scoreLine);
    if (node.stats && node.stats.length > 0) {
      for (const stat of (node.stats as string[]).slice(0, 2)) {
        textLines.push(`   - ${stat}`);
      }
    }
    textLines.push('');
  }

  if (top.length === 0) {
    textLines.push('No results after simulation. Try a different focus or ensure a build is loaded.');
  } else {
    textLines.push('', '💡 Use lua_set_tree to allocate the top node and recalculate stats.');
  }

  return {
    content: [{ type: 'text' as const, text: textLines.join('\n') }],
  };
}

interface ScoredEffect {
  stat: string;
  dpsDelta: number;
  ehpDelta: number;
}

export async function handleSuggestMasteries(context: PassiveUpgradesContext) {
  await context.ensureLuaClient();
  const luaClient = context.getLuaClient();
  if (!luaClient) throw new Error('Lua bridge not active. Use lua_load_build first.');

  const data = await luaClient.getMasteryOptions();
  const masteries = data?.masteries ?? [];

  if (masteries.length === 0) {
    return {
      content: [{ type: 'text' as const, text: '=== Mastery Suggestions ===\n\nNo allocated mastery nodes found in the current build.\n' }],
    };
  }

  // Get base stats for scoring
  const baseStats = await luaClient.getStats(['TotalDPS', 'CombinedDPS', 'MinionTotalDPS', 'TotalEHP', 'Life']);
  const baseDPS = (baseStats.CombinedDPS as number) || (baseStats.TotalDPS as number) || (baseStats.MinionTotalDPS as number) || 1;
  const baseEHP = (baseStats.TotalEHP as number) || (baseStats.Life as number) || 1;

  // Current mastery effect map: { nodeId: effectId } — the wire shape calcWith
  // takes; ids coerced to numbers because PoB's tree ids are numeric.
  const currentMasteryEffects: Record<string | number, number> = {};
  for (const m of masteries) {
    if (m.allocatedEffect != null) {
      currentMasteryEffects[Number(m.nodeId)] = m.allocatedEffect;
    }
  }

  const outputLines: string[] = ['=== Mastery Node Suggestions ===', ''];

  for (const mastery of masteries) {
    outputLines.push(`**${mastery.nodeName}** (node ${mastery.nodeId})`);
    if (mastery.allocatedEffect != null) {
      const current = mastery.availableEffects.find((e) => e.effectId === mastery.allocatedEffect);
      outputLines.push(`  Current: ${current?.stat ?? mastery.allocatedEffect}`);
    } else {
      outputLines.push('  Current: (none selected)');
    }

    // Simulate each effect choice
    const scored: ScoredEffect[] = [];
    for (const effect of mastery.availableEffects) {
      try {
        const newMasteryEffects = { ...currentMasteryEffects, [Number(mastery.nodeId)]: effect.effectId };
        const { output: out } = await luaClient.calcWith({ masteryEffects: newMasteryEffects, fields: SCORE_FIELDS });
        if (!out) continue;
        // calcWith returns raw Lua output; minion stats nested under out.Minion
        const outDPS = (out.CombinedDPS as number) || (out.TotalDPS as number) ||
                       (out.Minion?.CombinedDPS as number) || (out.Minion?.TotalDPS as number) || baseDPS;
        const outEHP = (out.TotalEHP as number) || (out.Life as number) || baseEHP;
        scored.push({ stat: effect.stat, dpsDelta: outDPS - baseDPS, ehpDelta: outEHP - baseEHP });
      } catch (e) {
        noteIgnoredError(`mastery effect simulation skipped (node ${mastery.nodeId}, effect ${effect.effectId})`, e);
      }
    }

    // Sort by relative gain (same formula as handleGetPassiveUpgrades to avoid raw-value scale mismatch)
    scored.sort((a, b) =>
      ((b.dpsDelta / baseDPS) + (b.ehpDelta / baseEHP)) -
      ((a.dpsDelta / baseDPS) + (a.ehpDelta / baseEHP))
    );
    if (scored.length === 0) {
      outputLines.push('  (simulation unavailable for this mastery)');
    }
    for (const s of scored.slice(0, 3)) {
      const dpsStr = s.dpsDelta !== 0 ? ` | DPS Delta${s.dpsDelta > 0 ? '+' : ''}${Math.round(s.dpsDelta)}` : '';
      const ehpStr = s.ehpDelta !== 0 ? ` | EHP Delta${s.ehpDelta > 0 ? '+' : ''}${Math.round(s.ehpDelta)}` : '';
      outputLines.push(`  - ${s.stat}${dpsStr}${ehpStr}`);
    }
    outputLines.push('');
  }

  return { content: [{ type: 'text' as const, text: outputLines.join('\n') }] };
}

// Helper function
function formatTreeComparison(comparison: TreeComparison): string {
  const lines: string[] = [
    '=== Passive Tree Comparison ===',
    '',
    `Build 1: ${comparison.build1.name}`,
    `Build 2: ${comparison.build2.name}`,
    '',
    '=== Point Allocation ===',
    `Build 1: ${comparison.build1.analysis.totalPoints} points`,
    `Build 2: ${comparison.build2.analysis.totalPoints} points`,
    `Difference: ${Math.abs(comparison.differences.pointDifference)} points ` +
      (comparison.differences.pointDifference > 0 ? '(Build 1 has more)' : '(Build 2 has more)'),
    '',
    '=== Archetype Comparison ===',
    comparison.differences.archetypeDifference,
    '',
    '=== Keystones Comparison ===',
    `Build 1 Keystones: ${comparison.build1.analysis.keystones.map(k => k.name).join(', ') || 'None'}`,
    `Build 2 Keystones: ${comparison.build2.analysis.keystones.map(k => k.name).join(', ') || 'None'}`,
  ];

  // Unique keystones
  const uniqueKeystones1 = comparison.differences.uniqueToBuild1.filter(n => n.isKeystone);
  const uniqueKeystones2 = comparison.differences.uniqueToBuild2.filter(n => n.isKeystone);

  if (uniqueKeystones1.length > 0) {
    lines.push('\nUnique to Build 1:');
    for (const ks of uniqueKeystones1) {
      lines.push(`- ${ks.name}`);
    }
  }

  if (uniqueKeystones2.length > 0) {
    lines.push('\nUnique to Build 2:');
    for (const ks of uniqueKeystones2) {
      lines.push(`- ${ks.name}`);
    }
  }

  // Notables comparison
  lines.push(
    '',
    '=== Notable Passives Comparison ===',
    `Build 1: ${comparison.build1.analysis.notables.length} notables`,
    `Build 2: ${comparison.build2.analysis.notables.length} notables`
  );

  const uniqueNotables1 = comparison.differences.uniqueToBuild1.filter(n => n.isNotable);
  const uniqueNotables2 = comparison.differences.uniqueToBuild2.filter(n => n.isNotable);

  if (uniqueNotables1.length > 0) {
    lines.push('\nTop 5 Unique Notables to Build 1:');
    for (const notable of uniqueNotables1.slice(0, 5)) {
      lines.push(`- ${notable.name || 'Unnamed'}`);
    }
  }

  if (uniqueNotables2.length > 0) {
    lines.push('\nTop 5 Unique Notables to Build 2:');
    for (const notable of uniqueNotables2.slice(0, 5)) {
      lines.push(`- ${notable.name || 'Unnamed'}`);
    }
  }

  // Pathing efficiency
  lines.push(
    '',
    '=== Pathing Efficiency ===',
    `Build 1: ${comparison.build1.analysis.pathingEfficiency}`,
    `Build 2: ${comparison.build2.analysis.pathingEfficiency}`,
    '',
    '=== Shared Nodes ===',
    `${comparison.differences.sharedNodes.length} nodes are allocated in both builds`
  );

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// connect_nodes: cheapest connected tree through a set of target nodes
// ---------------------------------------------------------------------------

const ALLOCATED_HUB = '__allocated__';
const CLASS_START_NAMES = new Set(['Scion', 'Marauder', 'Ranger', 'Witch', 'Duelist', 'Templar', 'Shadow']);
const MAX_CONNECT_TARGETS = 40;

/** Stats reported when validating the result with calcWith. */
const CONNECT_VALIDATION_STATS: Array<[string, string]> = [
  ['CombinedDPS', 'Combined DPS'],
  ['TotalDPS', 'Total DPS'],
  ['Life', 'Life'],
  ['EnergyShield', 'Energy Shield'],
  ['TotalEHP', 'Total EHP'],
  ['FireResist', 'Fire resist'],
  ['ColdResist', 'Cold resist'],
  ['LightningResist', 'Lightning resist'],
  ['ChaosResist', 'Chaos resist'],
];

interface ConnectNodesContext extends TreeHandlerContext {
  pobDirectory?: string;
  ensureLuaClient?: () => Promise<void>;
}

/**
 * Build the graph the solver works on: every allocated node collapsed into one
 * free hub, with nodes PoB cannot path through (other classes' start nodes,
 * masteries, ascendancies that are neither allocated nor targeted) removed.
 */
function buildConnectGraph(treeData: PassiveTreeData, allocated: Set<string>, targets: string[]): PassiveTreeData {
  const allowedAscendancies = new Set<string>();
  for (const id of [...allocated, ...targets]) {
    const asc = treeData.nodes.get(id)?.ascendancyName;
    if (asc) allowedAscendancies.add(asc);
  }
  const eligible = (id: string): boolean => {
    const node = treeData.nodes.get(id);
    if (!node || node.isMastery) return false;
    if (allocated.has(id)) return true; // folded into the hub below
    if (node.name && CLASS_START_NAMES.has(node.name) && !node.stats?.length) return false;
    if (node.ascendancyName && !allowedAscendancies.has(node.ascendancyName)) return false;
    return true;
  };

  // Symmetric adjacency: the tree lists most edges on both ends, not all.
  const neighbors = new Map<string, Set<string>>();
  for (const [id, node] of treeData.nodes) {
    for (const other of [...(node.out ?? []), ...(node.in ?? [])]) {
      if (!treeData.nodes.has(other)) continue;
      if (!neighbors.has(id)) neighbors.set(id, new Set());
      if (!neighbors.has(other)) neighbors.set(other, new Set());
      neighbors.get(id)!.add(other);
      neighbors.get(other)!.add(id);
    }
  }

  const nodes = new Map<string, PassiveTreeNode>();
  const hubOut = new Set<string>();
  for (const [id, node] of treeData.nodes) {
    if (allocated.has(id) || !eligible(id)) continue;
    const out = new Set<string>();
    for (const other of neighbors.get(id) ?? []) {
      if (!eligible(other)) continue;
      if (allocated.has(other)) {
        out.add(ALLOCATED_HUB);
        hubOut.add(id);
      } else {
        out.add(other);
      }
    }
    nodes.set(id, { skill: node.skill, name: node.name, out: [...out], in: [] });
  }
  nodes.set(ALLOCATED_HUB, { skill: -1, name: 'allocated tree', out: [...hubOut], in: [] });
  return { nodes, version: treeData.version };
}

export async function handleConnectNodes(
  context: ConnectNodesContext,
  buildName: string | undefined,
  targetNodeIds: string[],
  validate: boolean = true
) {
  try {
    const targets = [...new Set((targetNodeIds ?? []).map(String))];
    if (targets.length === 0) throw new Error('target_node_ids must contain at least one node ID');
    if (targets.length > MAX_CONNECT_TARGETS) {
      throw new Error(`Too many targets (${targets.length}); the maximum is ${MAX_CONNECT_TARGETS}`);
    }

    let allocatedIds: string[] = [];
    let treeVersion: string | undefined;
    let luaClient: PoBLuaApiClient | null = null;

    if (buildName) {
      const build = await context.buildService.readBuild(buildName);
      allocatedIds = context.buildService.parseAllocatedNodes(build);
      treeVersion = context.buildService.extractBuildVersion(build);
      luaClient = context.getLuaClient?.() ?? null;
    } else {
      if (context.ensureLuaClient) await context.ensureLuaClient();
      luaClient = context.getLuaClient?.() ?? null;
      if (!luaClient) throw new Error('Provide a build_name, or load a build with lua_load_build first.');
      const tree = await luaClient.getTree();
      allocatedIds = (tree.nodes || []).map(String);
      treeVersion = tree.treeVersion;
    }
    if (allocatedIds.length === 0) throw new Error('The build has no allocated passive nodes to connect from.');

    const treeData = await context.treeService.getTreeData(treeVersion);
    const missing = targets.filter(id => !treeData.nodes.has(id));
    if (missing.length > 0) throw new Error(`Node(s) not found in tree data: ${missing.join(', ')}`);

    const allocated = new Set(allocatedIds.filter(id => treeData.nodes.has(id)));
    const masteries = targets.filter(id => treeData.nodes.get(id)?.isMastery);
    if (masteries.length > 0) {
      throw new Error(`Mastery nodes are selected through their parent notable, not pathed to: ${masteries.join(', ')}`);
    }
    const alreadyAllocated = targets.filter(id => allocated.has(id));
    const pending = targets.filter(id => !allocated.has(id));
    const label = (id: string) => `${treeData.nodes.get(id)?.name || 'Node'} [${id}]`;

    const lines: string[] = ['=== Cheapest Connection ===', '', `Build: ${buildName || '(in-memory build)'}`, `Targets: ${targets.length}`];
    if (alreadyAllocated.length > 0) {
      lines.push(`Already allocated: ${alreadyAllocated.map(label).join(', ')}`);
    }
    if (pending.length === 0) {
      lines.push('', 'Every target is already allocated; nothing to connect.');
      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    }

    const graph = buildConnectGraph(treeData, allocated, pending);
    const solver = new SteinerSolver(graph, new Set([ALLOCATED_HUB, ...pending]));
    const result = solver.solve();

    const unreachable = result.unreachable.filter(id => id !== ALLOCATED_HUB);
    if (result.unreachable.includes(ALLOCATED_HUB) || result.terminalCount < 2) {
      lines.push('', 'No target can be reached from the allocated tree (different class region or an ascendancy you have not started).');
      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    }

    const chosen = new Set([...result.nodes].filter(id => id !== ALLOCATED_HUB));
    // Allocation order: breadth-first outward from the allocated tree.
    const ordered: string[] = [];
    const seen = new Set<string>([ALLOCATED_HUB]);
    let frontier: string[] = [ALLOCATED_HUB];
    while (frontier.length > 0) {
      const next: string[] = [];
      for (const id of frontier) {
        for (const nb of graph.nodes.get(id)?.out ?? []) {
          if (!seen.has(nb) && chosen.has(nb)) {
            seen.add(nb);
            ordered.push(nb);
            next.push(nb);
          }
        }
      }
      frontier = next;
    }

    // Baseline: price each target on its own with no sharing between paths.
    let separate = 0;
    for (const id of pending) {
      if (unreachable.includes(id)) continue;
      const single = new SteinerSolver(graph, new Set([ALLOCATED_HUB, id])).solve();
      separate += single.nodes.size - 1;
    }

    const method = result.method === 'exact'
      ? 'exact (proven minimum)'
      : result.method === 'reduced-dp'
        ? 'dynamic programming on the shortest-path corridor (near-optimal, not proven)'
        : `KMB approximation (at most about 2x the minimum travel)${result.timedOut ? '; the exact search timed out' : ''}`;
    const targetCount = ordered.filter(id => pending.includes(id)).length;
    lines.push(
      `Method: ${method}`,
      `Passive points to spend: ${ordered.length} (${ordered.length - targetCount} travel + ${targetCount} target)`,
      `Separate shortest paths with no sharing would cost: ${separate} (saved ${separate - ordered.length})`,
      ''
    );
    if (unreachable.length > 0) {
      lines.push(`Unreachable targets (skipped): ${unreachable.map(label).join(', ')}`, '');
    }
    lines.push('Allocation order:');
    ordered.forEach((id, i) => {
      const isTarget = pending.includes(id);
      lines.push(`  ${i + 1}. ${label(id)}${isTarget ? ' <- TARGET' : ''}`);
      if (isTarget) for (const stat of treeData.nodes.get(id)?.stats ?? []) lines.push(`       ${stat}`);
    });
    lines.push('', `Node IDs: ${ordered.join(', ')}`);

    if (validate && luaClient) {
      try {
        if (buildName && context.pobDirectory) {
          await loadBuildIfDifferent(luaClient, buildName, context.pobDirectory);
        }
        const { output, base } = await luaClient.calcWith({ addNodes: ordered.map(Number) });
        const deltas: string[] = [];
        for (const [key, title] of CONNECT_VALIDATION_STATS) {
          const before = base?.[key];
          const after = output?.[key];
          if (typeof before !== 'number' || typeof after !== 'number' || before === after) continue;
          const diff = after - before;
          deltas.push(`  ${title}: ${Math.round(before).toLocaleString()} -> ${Math.round(after).toLocaleString()} (${diff > 0 ? '+' : ''}${Math.round(diff).toLocaleString()})`);
        }
        lines.push('', '=== Stat change if allocated (PoB calcWith) ===');
        lines.push(...(deltas.length > 0 ? deltas : ['  No change in the tracked stats.']));
      } catch (e) {
        noteIgnoredError('connect_nodes calcWith validation skipped', e);
        lines.push('', `Stat validation skipped: ${e instanceof Error ? e.message : String(e)}`);
      }
    } else if (validate) {
      lines.push('', 'Stat validation skipped: the Lua bridge is not running (lua_start / lua_load_build enables the stat preview).');
    }
    lines.push('', 'Use lua_set_tree to apply (include your existing allocated nodes).');

    return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
  } catch (error) {
    return {
      content: [{ type: 'text' as const, text: `Error connecting nodes: ${error instanceof Error ? error.message : String(error)}` }],
      isError: true,
    };
  }
}
