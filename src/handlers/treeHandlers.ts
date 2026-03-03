import type { BuildService } from "../services/buildService.js";
import type { TreeService } from "../services/treeService.js";
import type { TreeAnalysisResult, TreeComparison, PassiveTreeNode, AllocationChange, PassiveTreeData } from "../types.js";
import type { PoBLuaApiClient } from "../pobLuaBridge.js";
import { handleGetBuildIssues } from "./buildGoalsHandlers.js";

export interface TreeHandlerContext {
  buildService: BuildService;
  treeService: TreeService;
}

export interface PassiveUpgradesContext {
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
  buildName: string,
  maxDistance?: number,
  filter?: string
) {
  try {
    const build = await context.buildService.readBuild(buildName);
    const allocatedNodeIds = context.buildService.parseAllocatedNodes(build);
    const allocatedNodes = new Set<string>(allocatedNodeIds);
    const treeVersion = context.buildService.extractBuildVersion(build);
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

    let text = `=== Nearby Nodes (within ${distance} nodes) ===\n\n`;
    text += `Build: ${buildName}\n`;
    text += `Found ${nearbyNodes.length} nodes\n\n`;

    // Group by distance
    const byDistance = new Map<number, typeof nearbyNodes>();
    for (const node of nearbyNodes) {
      const existing = byDistance.get(node.distance) || [];
      existing.push(node);
      byDistance.set(node.distance, existing);
    }

    for (const [distance, nodes] of Array.from(byDistance.entries()).sort((a, b) => a[0] - b[0])) {
      text += `**Distance ${distance}** (${nodes.length} nodes):\n`;
      for (const { node, nodeId } of nodes.slice(0, 10)) {
        text += `- ${node.name || 'Unnamed'} [${nodeId}]`;
        if (node.isKeystone) text += ' (KEYSTONE)';
        text += '\n';
        if (node.stats && node.stats.length > 0) {
          text += `  ${node.stats.slice(0, 2).join('; ')}\n`;
        }
      }
      if (nodes.length > 10) {
        text += `  ... and ${nodes.length - 10} more\n`;
      }
      text += '\n';
    }

    return {
      content: [
        {
          type: "text" as const,
          text,
        },
      ],
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return {
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
  buildName: string,
  targetNodeId: string,
  showAlternatives?: boolean
) {
  try {
    const build = await context.buildService.readBuild(buildName);
    const spec = context.buildService.getActiveSpec(build);

    if (!spec) {
      throw new Error("Build has no passive tree data");
    }

    const allocatedNodeIds = context.buildService.parseAllocatedNodes(build);
    const allocatedNodes = new Set<string>(allocatedNodeIds);
    const treeVersion = context.buildService.extractBuildVersion(build);
    const treeData = await context.treeService.getTreeData(treeVersion);

    // Check if target node exists
    const targetNode = treeData.nodes.get(targetNodeId);
    if (!targetNode) {
      throw new Error(`Node ${targetNodeId} not found in tree data`);
    }

    // Check if target is already allocated
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
      treeData,
      showAlternatives ? 3 : 1
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
    let text = `=== Path to ${targetNode.name || "Node " + targetNodeId} ===\n\n`;
    text += `Build: ${buildName}\n`;
    text += `Target: ${targetNode.name || "Unknown"} [${targetNodeId}]\n`;
    if (targetNode.isKeystone) text += `Type: KEYSTONE\n`;
    else if (targetNode.isNotable) text += `Type: Notable\n`;
    text += `\n`;

    for (let i = 0; i < paths.length; i++) {
      const path = paths[i];
      const pathLabel = paths.length > 1 ? `Path ${i + 1} (Alternative ${i === 0 ? "- Shortest" : i})` : "Shortest Path";

      text += `**${pathLabel}**\n`;
      text += `Total Cost: ${path.cost} passive points\n`;
      text += `Nodes to Allocate: ${path.nodes.length}\n\n`;

      text += `Allocation Order:\n`;
      for (let j = 0; j < path.nodes.length; j++) {
        const nodeId = path.nodes[j];
        const node = treeData.nodes.get(nodeId);
        if (!node) continue;

        const isTarget = nodeId === targetNodeId;
        const prefix = isTarget ? "→ TARGET: " : `  ${j + 1}. `;

        text += `${prefix}${node.name || "Travel Node"} [${nodeId}]\n`;

        if (node.stats && node.stats.length > 0) {
          for (const stat of node.stats) {
            text += `      ${stat}\n`;
          }
        } else if (!isTarget) {
          text += `      (Travel node - no stats)\n`;
        }

        if (j < path.nodes.length - 1) text += `\n`;
      }

      if (i < paths.length - 1) text += `\n${"=".repeat(50)}\n\n`;
    }

    text += `\n**Next Steps:**\n`;
    text += `Use lua_set_tree to allocate these nodes and recalculate stats.\n`;

    return {
      content: [
        {
          type: "text" as const,
          text,
        },
      ],
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return {
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
  const seen = new Set<string>();
  const candidates: any[] = [];

  for (const keyword of keywords.slice(0, 4)) {
    try {
      const results = await luaClient.searchNodes({
        keyword,
        nodeType: 'notable',
        maxResults: 15,
        includeAllocated: false,
      });
      if (results && results.nodes) {
        for (const node of results.nodes) {
          const id = String(node.id);
          if (!seen.has(id)) {
            seen.add(id);
            candidates.push(node);
          }
        }
      }
    } catch { /* skip failed searches */ }
  }

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
    node: any;
    dpsDelta: number;
    ehpDelta: number;
    score: number;
  }

  const scored: ScoredNode[] = [];

  for (const node of candidates) {
    try {
      const out = await luaClient.calcWith({ addNodes: [node.id] });
      if (!out) continue;

      const outDPS = (out.CombinedDPS as number) || (out.TotalDPS as number) || (out.MinionTotalDPS as number) || baseDPS;
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
    } catch { /* skip nodes that fail calcWith */ }
  }

  // Step 5: sort and return top N
  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, maxResults);

  let text = `=== Passive Upgrades (focus: ${focus}) ===\n\n`;
  text += `Base DPS: ${Math.round(baseDPS).toLocaleString()}  |  Base EHP: ${Math.round(baseEHP).toLocaleString()}\n`;
  text += `Evaluated ${candidates.length} candidate notables, showing top ${top.length}:\n\n`;

  for (let i = 0; i < top.length; i++) {
    const { node, dpsDelta, ehpDelta, score } = top[i];
    text += `${i + 1}. **${node.name}** [${node.id}]\n`;
    text += `   Score: ${score.toFixed(4)}`;
    if (dpsDelta !== 0) text += `  |  DPS Δ: ${dpsDelta > 0 ? '+' : ''}${Math.round(dpsDelta).toLocaleString()}`;
    if (ehpDelta !== 0) text += `  |  EHP Δ: ${ehpDelta > 0 ? '+' : ''}${Math.round(ehpDelta).toLocaleString()}`;
    text += '\n';
    if (node.stats && node.stats.length > 0) {
      for (const stat of (node.stats as string[]).slice(0, 2)) {
        text += `   - ${stat}\n`;
      }
    }
    text += '\n';
  }

  if (top.length === 0) {
    text += 'No results after simulation. Try a different focus or ensure a build is loaded.\n';
  } else {
    text += `\n💡 Use lua_set_tree to allocate the top node and recalculate stats.\n`;
  }

  return {
    content: [{ type: 'text' as const, text }],
  };
}

export async function handleSuggestMasteries(context: PassiveUpgradesContext) {
  await context.ensureLuaClient();
  const luaClient = context.getLuaClient();
  if (!luaClient) throw new Error('Lua bridge not active. Use lua_load_build first.');

  const data = await luaClient.getMasteryOptions();
  const masteries: any[] = data?.masteries ?? [];

  if (masteries.length === 0) {
    return {
      content: [{ type: 'text' as const, text: '=== Mastery Suggestions ===\n\nNo allocated mastery nodes found in the current build.\n' }],
    };
  }

  // Get base stats for scoring
  const baseStats = await luaClient.getStats(['TotalDPS', 'CombinedDPS', 'MinionTotalDPS', 'TotalEHP', 'Life']);
  const baseDPS = (baseStats.CombinedDPS as number) || (baseStats.TotalDPS as number) || (baseStats.MinionTotalDPS as number) || 1;
  const baseEHP = (baseStats.TotalEHP as number) || (baseStats.Life as number) || 1;

  // Current mastery effect map: { nodeId: effectId }
  const currentMasteryEffects: Record<number, number> = {};
  for (const m of masteries) {
    if (m.allocatedEffect != null) {
      currentMasteryEffects[m.nodeId] = m.allocatedEffect;
    }
  }

  let output = '=== Mastery Node Suggestions ===\n\n';

  for (const mastery of masteries) {
    output += `**${mastery.nodeName}** (node ${mastery.nodeId})\n`;
    if (mastery.allocatedEffect != null) {
      const current = mastery.availableEffects.find((e: any) => e.effectId === mastery.allocatedEffect);
      output += `  Current: ${current?.stat ?? mastery.allocatedEffect}\n`;
    } else {
      output += `  Current: (none selected)\n`;
    }

    // Simulate each effect choice
    interface ScoredEffect {
      stat: string;
      dpsDelta: number;
      ehpDelta: number;
    }
    const scored: ScoredEffect[] = [];
    for (const effect of mastery.availableEffects) {
      try {
        const newMasteryEffects = { ...currentMasteryEffects, [mastery.nodeId]: effect.effectId };
        const out = await luaClient.calcWith({ masteryEffects: newMasteryEffects });
        if (!out) continue;
        const outDPS = (out.CombinedDPS as number) || (out.TotalDPS as number) || (out.MinionTotalDPS as number) || baseDPS;
        const outEHP = (out.TotalEHP as number) || (out.Life as number) || baseEHP;
        scored.push({ stat: effect.stat, dpsDelta: outDPS - baseDPS, ehpDelta: outEHP - baseEHP });
      } catch { /* skip effects that fail simulation */ }
    }

    scored.sort((a, b) => (b.dpsDelta + b.ehpDelta * 0.5) - (a.dpsDelta + a.ehpDelta * 0.5));
    for (const s of scored.slice(0, 3)) {
      const dpsStr = s.dpsDelta !== 0 ? ` | DPS Delta${s.dpsDelta > 0 ? '+' : ''}${Math.round(s.dpsDelta)}` : '';
      const ehpStr = s.ehpDelta !== 0 ? ` | EHP Delta${s.ehpDelta > 0 ? '+' : ''}${Math.round(s.ehpDelta)}` : '';
      output += `  - ${s.stat}${dpsStr}${ehpStr}\n`;
    }
    output += '\n';
  }

  return { content: [{ type: 'text' as const, text: output }] };
}

// Helper function
function formatTreeComparison(comparison: TreeComparison): string {
  let output = `=== Passive Tree Comparison ===\n\n`;
  output += `Build 1: ${comparison.build1.name}\n`;
  output += `Build 2: ${comparison.build2.name}\n\n`;

  // Point allocation
  output += `=== Point Allocation ===\n`;
  output += `Build 1: ${comparison.build1.analysis.totalPoints} points\n`;
  output += `Build 2: ${comparison.build2.analysis.totalPoints} points\n`;
  output += `Difference: ${Math.abs(comparison.differences.pointDifference)} points `;
  output += comparison.differences.pointDifference > 0 ? '(Build 1 has more)\n' : '(Build 2 has more)\n';

  // Archetype comparison
  output += `\n=== Archetype Comparison ===\n`;
  output += `${comparison.differences.archetypeDifference}\n`;

  // Keystones comparison
  output += `\n=== Keystones Comparison ===\n`;
  output += `Build 1 Keystones: ${comparison.build1.analysis.keystones.map(k => k.name).join(', ') || 'None'}\n`;
  output += `Build 2 Keystones: ${comparison.build2.analysis.keystones.map(k => k.name).join(', ') || 'None'}\n`;

  // Unique keystones
  const uniqueKeystones1 = comparison.differences.uniqueToBuild1.filter(n => n.isKeystone);
  const uniqueKeystones2 = comparison.differences.uniqueToBuild2.filter(n => n.isKeystone);

  if (uniqueKeystones1.length > 0) {
    output += `\nUnique to Build 1:\n`;
    for (const ks of uniqueKeystones1) {
      output += `- ${ks.name}\n`;
    }
  }

  if (uniqueKeystones2.length > 0) {
    output += `\nUnique to Build 2:\n`;
    for (const ks of uniqueKeystones2) {
      output += `- ${ks.name}\n`;
    }
  }

  // Notables comparison
  output += `\n=== Notable Passives Comparison ===\n`;
  output += `Build 1: ${comparison.build1.analysis.notables.length} notables\n`;
  output += `Build 2: ${comparison.build2.analysis.notables.length} notables\n`;

  const uniqueNotables1 = comparison.differences.uniqueToBuild1.filter(n => n.isNotable);
  const uniqueNotables2 = comparison.differences.uniqueToBuild2.filter(n => n.isNotable);

  if (uniqueNotables1.length > 0) {
    output += `\nTop 5 Unique Notables to Build 1:\n`;
    for (const notable of uniqueNotables1.slice(0, 5)) {
      output += `- ${notable.name || 'Unnamed'}\n`;
    }
  }

  if (uniqueNotables2.length > 0) {
    output += `\nTop 5 Unique Notables to Build 2:\n`;
    for (const notable of uniqueNotables2.slice(0, 5)) {
      output += `- ${notable.name || 'Unnamed'}\n`;
    }
  }

  // Pathing efficiency
  output += `\n=== Pathing Efficiency ===\n`;
  output += `Build 1: ${comparison.build1.analysis.pathingEfficiency}\n`;
  output += `Build 2: ${comparison.build2.analysis.pathingEfficiency}\n`;

  // Shared nodes
  output += `\n=== Shared Nodes ===\n`;
  output += `${comparison.differences.sharedNodes.length} nodes are allocated in both builds\n`;

  return output;
}
