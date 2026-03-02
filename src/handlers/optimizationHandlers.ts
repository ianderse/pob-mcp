import type { PoBLuaApiClient, PoBLuaTcpClient } from "../pobLuaBridge.js";
import type { BuildService } from "../services/buildService.js";
import type { TreeService } from "../services/treeService.js";
import type { OptimizationConstraints } from "../treeOptimizer.js";
import path from "path";
import fs from "fs/promises";
import { analyzeDefenses, formatDefensiveAnalysis } from "../defensiveAnalyzer.js";
import {
  parseGoal,
  formatOptimalNodesResult,
} from "../nodeOptimizer.js";
import {
  parseOptimizationGoal,
  formatOptimizationResult,
  calculateScore,
  isLowLifeBuild,
} from "../treeOptimizer.js";

export interface OptimizationHandlerContext {
  buildService: BuildService;
  treeService: TreeService;
  pobDirectory: string;
  getLuaClient: () => PoBLuaApiClient | PoBLuaTcpClient | null;
  ensureLuaClient: () => Promise<void>;
}

export async function handleAnalyzeDefenses(
  context: OptimizationHandlerContext,
  buildName?: string
) {
  try {
    if (!buildName) {
      throw new Error('build_name is required. Please specify which build to analyze.');
    }

    await context.ensureLuaClient();

    const luaClient = context.getLuaClient();
    if (!luaClient) {
      throw new Error('Lua client not initialized.');
    }

    const targetBuild = buildName;

    // Load the build into the Lua bridge
    const buildPath = path.join(context.pobDirectory, targetBuild);
    const buildXml = await fs.readFile(buildPath, 'utf-8');

    await luaClient.loadBuildXml(buildXml, 'Defense Analysis');

    // Get stats from PoB
    const stats = await luaClient.getStats();

    // Validate that we have meaningful stats (not empty/default state)
    const life = stats.Life || 0;
    if (life <= 60) {
      throw new Error(
        `Build "${targetBuild}" appears to be in default/empty state. The build may not have loaded correctly.`
      );
    }

    // Analyze defenses
    const analysis = analyzeDefenses(stats);

    // Format for output
    let text = `Analyzing: ${targetBuild}\n\n`;
    text += formatDefensiveAnalysis(analysis);

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
    throw new Error(`Failed to analyze defenses: ${errorMsg}`);
  }
}

export async function handleSuggestOptimalNodes(
  context: OptimizationHandlerContext,
  buildName: string,
  goalString: string,
  pointsAvailable?: number
) {
  try {
    await context.ensureLuaClient();
    const luaClient = context.getLuaClient();
    if (!luaClient) throw new Error('Lua client not initialized');

    // Load build from disk if buildName refers to an existing file, otherwise
    // assume a build is already loaded in the Lua bridge (in-memory workflow)
    if (buildName) {
      const buildPath = path.join(context.pobDirectory, buildName);
      try {
        const buildXml = await fs.readFile(buildPath, 'utf-8');
        await luaClient.loadBuildXml(buildXml, buildName);
      } catch {
        // Build file not found — use whichever build is currently loaded in Lua bridge
      }
    }

    const points = pointsAvailable || 10;

    // Detect build archetype from active skills to improve relevance
    let buildKeywords: string[] = [];
    try {
      const skills = await luaClient.getSkills();
      const allGemNames: string[] = [];
      if (skills && skills.socketGroups) {
        for (const group of skills.socketGroups) {
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
    } catch {}

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
    let allNodes: any[] = [];
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
      } catch {}
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
    } catch {}

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
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text" as const, text: `Error: ${errorMsg}` }],
    };
  }
}

export async function handleOptimizeTree(
  context: OptimizationHandlerContext,
  buildName: string,
  goalString: string,
  maxPoints?: number,
  maxIterations?: number,
  constraints?: OptimizationConstraints
) {
  try {
    await context.ensureLuaClient();
    const luaClient = context.getLuaClient();
    if (!luaClient) throw new Error('Lua client not initialized');

    // Load build from disk if it exists, otherwise use the currently loaded Lua build
    if (buildName) {
      const buildPath = path.join(context.pobDirectory, buildName);
      try {
        const buildXml = await fs.readFile(buildPath, 'utf-8');
        await luaClient.loadBuildXml(buildXml, buildName);
      } catch {
        // Build file not found — use whichever build is currently loaded in Lua bridge
      }
    }

    const points = maxPoints || 10;
    const goal = (goalString || 'balanced').toLowerCase();

    // Get current stats
    const stats = await luaClient.getStats();

    // Get allocated nodes count
    const tree = await luaClient.getTree();
    const allocatedCount = tree?.nodes?.length || 0;

    // Get nearby notable/keystone recommendations via TreeService
    const build = await context.buildService.readBuild(buildName);
    const allocatedNodeIds = context.buildService.parseAllocatedNodes(build);
    const allocatedNodes = new Set<string>(allocatedNodeIds);
    const treeVersion = context.buildService.extractBuildVersion(build);
    const treeData = await context.treeService.getTreeData(treeVersion);

    // Get nearby nodes within reach
    const goalFilter = goal === 'damage' || goal === 'dps' ? 'damage' :
                       goal === 'defense' ? 'life' :
                       goal === 'life' ? 'life' :
                       goal === 'es' ? 'energy shield' :
                       undefined;

    const nearbyNodes = context.treeService.findNearbyNodes(allocatedNodes, treeData, 3, goalFilter);

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
    if (nearbyNodes.length > 0) {
      text += `=== Recommended Allocations (within 3 nodes) ===\n\n`;
      let count = 0;
      for (const { node, nodeId } of nearbyNodes.slice(0, points)) {
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

    if (constraints) {
      text += `\n=== Constraints Applied ===\n`;
      if (constraints.minLife) text += `- Minimum Life: ${constraints.minLife}\n`;
      if (constraints.minES) text += `- Minimum Energy Shield: ${constraints.minES}\n`;
      if (constraints.protectedNodes) text += `- Protected Nodes: ${constraints.protectedNodes.join(', ')}\n`;
    }

    return {
      content: [{ type: "text" as const, text }],
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text" as const, text: `Error: ${errorMsg}` }],
    };
  }
}
