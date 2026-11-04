import { toFiniteNumber, type PoBLuaApiClient, type SearchedNode } from "../pobLuaBridge.js";
import { noteIgnoredError } from '../utils/errorHandling.js';
import type { BuildService } from "../services/buildService.js";
import type { TreeService } from "../services/treeService.js";
import type { OptimizationConstraints } from "../types/optimization.js";
import type { PassiveTreeData } from "../types.js";
import { analyzeDefenses, formatDefensiveAnalysis } from "../defensiveAnalyzer.js";
import { wrapHandler } from "../utils/errorHandling.js";
import { resolveBuildFile } from "../utils/pathSanitizer.js";
import { loadBuildIfDifferent, readNamedBuild } from "../utils/namedBuild.js";

/** PoB's blank level 1 character: 60 Life, no Energy Shield, no Ward. */
const BLANK_CHARACTER_POOL = 60;

interface OptimizationHandlerContext {
  buildService: BuildService;
  treeService: TreeService;
  pobDirectory: string;
  getLuaClient: () => PoBLuaApiClient | null;
  ensureLuaClient: () => Promise<void>;
}

export async function handleAnalyzeDefenses(
  context: OptimizationHandlerContext,
  buildName?: string
) {
  return wrapHandler('analyze defenses', async () => {
    if (!buildName) {
      throw new Error('build_name is required. Please specify which build to analyze.');
    }

    await context.ensureLuaClient();

    const luaClient = context.getLuaClient();
    if (!luaClient) {
      throw new Error('Lua client not initialized.');
    }

    // Only reload from disk if a different build (or no build) is currently loaded.
    // If the same build is already loaded, preserve the current spec/item set selection.
    await loadBuildIfDifferent(luaClient, buildName, context.pobDirectory);

    // Get stats from PoB
    const stats = await luaClient.getStats();

    // Chaos Inoculation sets Life to 1 and carries the pool as Energy Shield.
    const effectivePool = (toFiniteNumber(stats.Life) ?? 0) + (toFiniteNumber(stats.EnergyShield) ?? 0) + (toFiniteNumber(stats.Ward) ?? 0);
    if (effectivePool <= BLANK_CHARACTER_POOL) {
      throw new Error(
        `Build "${buildName}" appears to be in default/empty state. The build may not have loaded correctly.`
      );
    }

    // Collect active spec / item set context for the header
    let contextHeader = `Analyzing: ${buildName}`;
    try {
      const specsResult = await luaClient.listSpecs();
      const itemSetsResult = await luaClient.listItemSets();
      const activeSpec = specsResult?.specs?.find((s) => s.active);
      const activeItemSet = itemSetsResult?.itemSets?.find((s) => s.active);
      const parts: string[] = [];
      if (activeSpec && specsResult?.specs?.length > 1) {
        parts.push(`Spec ${activeSpec.index}/${specsResult.specs.length}: "${activeSpec.title}" (${activeSpec.nodeCount} nodes)`);
      }
      if (activeItemSet && itemSetsResult?.itemSets?.length > 1) {
        parts.push(`Item Set ${activeItemSet.id}/${itemSetsResult.itemSets.length}: "${activeItemSet.title}"`);
      }
      if (parts.length > 0) {
        contextHeader += `\n[${parts.join(' | ')}]`;
      }
    } catch (e) { noteIgnoredError('active spec/set context header (analysis unaffected)', e); }

    // Analyze defenses
    const analysis = analyzeDefenses(stats);

    let text = `${contextHeader}\n\n`;
    text += formatDefensiveAnalysis(analysis);

    return {
      content: [
        {
          type: "text" as const,
          text,
        },
      ],
    };
  });
}

export async function handleSuggestOptimalNodes(
  context: OptimizationHandlerContext,
  buildName: string,
  goalString: string,
  pointsAvailable?: number
) {
  return wrapHandler('suggest optimal nodes', async () => {
    await context.ensureLuaClient();
    const luaClient = context.getLuaClient();
    if (!luaClient) throw new Error('Lua client not initialized');

    // Load build from disk if buildName refers to an existing file, otherwise
    // assume a build is already loaded in the Lua bridge (in-memory workflow)
    if (buildName) {
      const buildXml = await readNamedBuild(buildName, context.pobDirectory);
      await luaClient.loadBuildXml(buildXml, buildName, resolveBuildFile(buildName, context.pobDirectory));
    }

    const points = pointsAvailable || 10;

    // Detect build archetype from active skills to improve relevance
    let buildKeywords: string[] = [];
    try {
      const skills = await luaClient.getSkills();
      const allGemNames: string[] = [];
      if (skills && skills.groups) {
        for (const group of skills.groups) {
          for (const gem of (group.gems || [])) {
            if (gem.name) allGemNames.push(gem.name.toLowerCase());
          }
        }
      }
      const gemText = allGemNames.join(' ');
      // Detect archetypes from gem names and inject relevant keywords
      if (gemText.includes('minion') || gemText.includes('summon') || gemText.includes('golem') || gemText.includes('skeleton') || gemText.includes('zombie')) {
        buildKeywords.push('minion');
      }
      if (gemText.includes('lightning') || gemText.includes('thunder') || gemText.includes('storm') || gemText.includes('arc ')) {
        buildKeywords.push('lightning');
      }
      if (gemText.includes('fire') || gemText.includes('flame') || gemText.includes('ignite') || gemText.includes('burning')) {
        buildKeywords.push('fire');
      }
      if (gemText.includes('cold') || gemText.includes('ice') || gemText.includes('freeze') || gemText.includes('frost')) {
        buildKeywords.push('cold');
      }
      if (gemText.includes('chaos') || gemText.includes('poison') || gemText.includes('blight')) {
        buildKeywords.push('chaos');
      }
      if (gemText.includes('spell') || gemText.includes('arcane') || gemText.includes('cast')) {
        buildKeywords.push('spell');
      }
      if (!gemText.includes('summon') && !gemText.includes('minion') &&
          (gemText.includes('strike') || gemText.includes('slash') || gemText.includes('attack'))) {
        buildKeywords.push('attack');
      }
    } catch (e) { noteIgnoredError("skill-type keywords from gem names (archetype heuristics weaker)", e); }

    // Map goal to search keywords, prioritising build archetype
    const goalKeywords: Record<string, string[]> = {
      damage: buildKeywords.length > 0
        ? [...buildKeywords.map(k => `${k} damage`), 'damage', 'critical']
        : ['damage', 'critical', 'elemental', 'spell'],
      dps: buildKeywords.length > 0
        ? [...buildKeywords, 'cast speed', 'critical']
        : ['damage', 'critical', 'cast speed'],
      defense: ['life', 'armour', 'evasion', 'block', 'energy shield'],
      life: ['life', 'maximum life', 'life regeneration'],
      es: ['energy shield', 'maximum energy shield'],
      resist: ['resistance', 'elemental resistance'],
      speed: ['attack speed', 'cast speed', 'movement speed'],
    };

    const goal = goalString.toLowerCase();
    const keywords = goalKeywords[goal] || (buildKeywords.length > 0 ? [...buildKeywords, goal] : [goal]);

    // Search for relevant notable/keystone nodes
    let allNodes: SearchedNode[] = [];
    for (const keyword of keywords.slice(0, 3)) {
      try {
        const results = await luaClient.searchNodes({
          keyword,
          nodeType: 'notable',
          maxResults: 10,
          includeAllocated: false,
        });
        if (results && results.nodes) {
          allNodes.push(...results.nodes);
        }
      } catch (e) { noteIgnoredError("class keystone lookup for tree search (result set smaller)", e); }
    }

    // Also search for keystones
    try {
      const keystoneResults = await luaClient.searchNodes({
        keyword: keywords[0],
        nodeType: 'keystone',
        maxResults: 5,
        includeAllocated: false,
      });
      if (keystoneResults && keystoneResults.nodes) {
        allNodes.push(...keystoneResults.nodes);
      }
    } catch (e) { noteIgnoredError("ascendancy keystone lookup for tree search (result set smaller)", e); }

    // Deduplicate by id
    const seen = new Set<string>();
    const uniqueNodes = allNodes.filter(n => {
      const id = String(n.id);
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });

    // Get current stats for context
    const stats = await luaClient.getStats();

    let text = `=== Suggested Nodes for Goal: ${goalString} ===\n\n`;
    text += `Build: ${buildName}\n`;
    text += `Points to spend: ${points}\n\n`;

    // Show current relevant stats
    if (goal === 'life' || goal === 'defense') {
      text += `Current Life: ${stats.Life || 'N/A'}\n`;
    }
    if (goal === 'damage' || goal === 'dps') {
      text += `Current Total DPS: ${stats.TotalDPS ? Math.round(Number(stats.TotalDPS)).toLocaleString() : 'N/A'}\n`;
    }
    if (goal === 'es') {
      text += `Current Energy Shield: ${stats.EnergyShield || 'N/A'}\n`;
    }
    text += '\n';

    if (uniqueNodes.length === 0) {
      text += `No unallocated nodes found matching "${goalString}".\n`;
      text += `Try a different goal: damage, defense, life, es, resist, speed\n`;
    } else {
      text += `**Recommended Nodes (top ${Math.min(uniqueNodes.length, points)} unallocated):**\n\n`;
      for (const node of uniqueNodes.slice(0, points)) {
        const typeTag = node.type === 'keystone' ? ' [KEYSTONE]' : node.type === 'notable' ? ' [Notable]' : '';
        text += `**${node.name}**${typeTag}\n`;
        text += `  Node ID: ${node.id}\n`;
        if (node.stats && node.stats.length > 0) {
          for (const stat of node.stats.slice(0, 3)) {
            text += `  - ${stat}\n`;
          }
        }
        text += '\n';
      }
      text += `\n💡 Use get_nearby_nodes to find nodes reachable from your current tree.\n`;
      text += `💡 Use lua_set_tree with updated node IDs to apply changes.\n`;
    }

    return {
      content: [{ type: "text" as const, text }],
    };
  });
}

export async function handleOptimizeTree(
  context: OptimizationHandlerContext,
  buildName: string,
  goalString: string,
  maxPoints?: number,
  constraints?: OptimizationConstraints
) {
  return wrapHandler('optimize tree', async () => {
    await context.ensureLuaClient();
    const luaClient = context.getLuaClient();
    if (!luaClient) throw new Error('Lua client not initialized');

    // Load build from disk if it exists, otherwise use the currently loaded Lua build
    if (buildName) {
      const buildXml = await readNamedBuild(buildName, context.pobDirectory);
      await luaClient.loadBuildXml(buildXml, buildName, resolveBuildFile(buildName, context.pobDirectory));
    }

    const points = maxPoints || 10;
    const goal = (goalString || 'balanced').toLowerCase();

    // Get current stats
    const stats = await luaClient.getStats();

    // Get allocated nodes count
    const tree = await luaClient.getTree();
    const allocatedCount = tree?.nodes?.length || 0;

    // Get nearby notable/keystone recommendations via TreeService
    // For in-memory builds (no file on disk), fall back to the node IDs from the Lua bridge
    let allocatedNodes: Set<string>;
    let treeData: PassiveTreeData;
    try {
      const build = await context.buildService.readBuild(buildName);
      const allocatedNodeIds = context.buildService.parseAllocatedNodes(build);
      allocatedNodes = new Set<string>(allocatedNodeIds);
      const treeVersion = context.buildService.extractBuildVersion(build);
      treeData = await context.treeService.getTreeData(treeVersion);
    } catch (e) {
      // Build not on disk — use node IDs already loaded from Lua bridge
      noteIgnoredError("on-disk build for optimize (in-memory Lua tree used)", e);
      const luaNodeIds: string[] = (tree?.nodes ?? []).map((n) => String(n));
      allocatedNodes = new Set<string>(luaNodeIds);
      treeData = await context.treeService.getTreeData(undefined);
    }

    // Get nearby nodes within reach
    const goalFilter = goal === 'damage' || goal === 'dps' ? 'damage' :
                       goal === 'defense' ? 'life' :
                       goal === 'life' ? 'life' :
                       goal === 'es' ? 'energy shield' :
                       undefined;

    const nearbyNodes = context.treeService.findNearbyNodes(allocatedNodes, treeData, 3, goalFilter);

    // Constraints: protectedNodes is enforced by dropping protected nodes
    // from the recommendations. minLife/minES are evaluated against CURRENT
    // stats — suggestions are not stat-recalculated (that needs a full PoB
    // recompute), so "met" here means "the current build already satisfies
    // it", stated as such below.
    const protectedSet = new Set((constraints?.protectedNodes ?? []).map(String));
    const protectedSkipped = nearbyNodes.filter(({ nodeId }) => protectedSet.has(String(nodeId)));
    const candidateNodes = nearbyNodes.filter(({ nodeId }) => !protectedSet.has(String(nodeId)));

    let text = `=== Tree Optimization: ${buildName} ===\n\n`;
    text += `Goal: ${goalString}\n`;
    text += `Points to optimize: ${points}\n`;
    text += `Currently allocated: ${allocatedCount} nodes\n\n`;

    // Current stats summary
    text += `=== Current Stats ===\n`;
    text += `Life: ${stats.Life || 'N/A'}\n`;
    text += `Energy Shield: ${stats.EnergyShield || 'N/A'}\n`;
    text += `Total DPS: ${stats.TotalDPS ? Math.round(Number(stats.TotalDPS)).toLocaleString() : 'N/A'}\n`;
    text += `Fire/Cold/Lightning Resist: ${stats.FireResist || 0}%/${stats.ColdResist || 0}%/${stats.LightningResist || 0}%\n\n`;

    // Recommendations based on nearby nodes
    if (candidateNodes.length > 0) {
      text += `=== Recommended Allocations (within 3 nodes) ===\n\n`;
      let count = 0;
      for (const { node, nodeId } of candidateNodes.slice(0, points)) {
        const typeTag = node.isKeystone ? ' [KEYSTONE]' : node.isNotable ? ' [Notable]' : '';
        text += `${count + 1}. **${node.name || 'Unnamed'}**${typeTag} [${nodeId}]\n`;
        if (node.stats && node.stats.length > 0) {
          for (const stat of (node.stats as string[]).slice(0, 2)) {
            text += `   - ${stat}\n`;
          }
        }
        count++;
      }
      text += `\n💡 Use lua_set_tree with the node IDs to apply changes.\n`;
    } else {
      text += `No nearby nodes found matching the goal "${goalString}".\n`;
      text += `Try get_nearby_nodes for unfiltered nearby node suggestions.\n`;
    }

    if (constraints && (constraints.minLife || constraints.minES || constraints.protectedNodes)) {
      text += `\n=== Constraints ===\n`;
      if (constraints.minLife) {
        const lifeNow = toFiniteNumber(stats.Life) ?? 0;
        text += `- Min Life ${constraints.minLife}: currently ${lifeNow.toLocaleString()} — ${lifeNow >= constraints.minLife ? 'met by current build' : 'NOT met by current build'} (suggestions are not stat-recalculated)\n`;
      }
      if (constraints.minES) {
        const esNow = toFiniteNumber(stats.EnergyShield) ?? 0;
        text += `- Min ES ${constraints.minES}: currently ${esNow.toLocaleString()} — ${esNow >= constraints.minES ? 'met by current build' : 'NOT met by current build'} (suggestions are not stat-recalculated)\n`;
      }
      if (protectedSet.size > 0) {
        text += `- Protected nodes (${protectedSet.size}): excluded from recommendations` +
          (protectedSkipped.length > 0 ? ` — ${protectedSkipped.length} matching suggestion(s) dropped` : '') + '\n';
      }
    }

    return {
      content: [{ type: "text" as const, text }],
    };
  });
}
