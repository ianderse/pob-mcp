import type { BuildService } from "../services/buildService.js";
import type { TreeService } from "../services/treeService.js";
import type { TreeAnalysisResult, TreeComparison, PassiveTreeNode, AllocationChange, PassiveTreeData } from "../types.js";

export interface TreeHandlerContext {
  buildService: BuildService;
  treeService: TreeService;
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

export async function handleTestAllocation(
  context: TreeHandlerContext,
  buildName: string,
  changes: string
) {
  try {
    // This is a complex method that would need significant refactoring
    // For now, we'll throw an error indicating it needs Lua bridge
    throw new Error('test_allocation requires Lua bridge integration. Use lua_set_tree instead.');
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

    // Find nearby nodes (this would need to be implemented in TreeService)
    // For now, throw an error
    throw new Error('get_nearby_nodes needs to be fully implemented in TreeService');
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

    // This requires findShortestPaths to be implemented in TreeService
    throw new Error('find_path_to_node needs findShortestPaths to be implemented in TreeService');
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

export async function handleAllocateNodes(
  context: TreeHandlerContext,
  buildName: string,
  nodeIds: string[],
  showFullStats?: boolean
) {
  try {
    throw new Error('allocate_nodes requires Lua bridge integration. Use lua_set_tree instead.');
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

export async function handlePlanTree(
  context: TreeHandlerContext,
  buildName: string | undefined,
  goals: string
) {
  try {
    throw new Error('plan_tree requires Lua bridge integration and advanced AI analysis.');
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
