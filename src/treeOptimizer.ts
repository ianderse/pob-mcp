/**
 * Tree Optimizer - Full passive tree optimization and reallocation
 *
 * Unlike suggest_optimal_nodes (which only adds nodes), this optimizer can:
 * - Remove inefficient nodes
 * - Reallocate points to better locations
 * - Swap entire branches for better alternatives
 * - Respect defensive constraints and protected nodes
 */

// Type definitions
export interface OptimizationConstraints {
  minLife?: number;
  minES?: number;
  minEHP?: number;
  minFireResist?: number;
  minColdResist?: number;
  minLightningResist?: number;
  minChaosResist?: number;
  protectedNodes?: string[];  // Node IDs that cannot be removed
}

export interface OptimizationResult {
  goal: string;
  goalDescription: string;
  buildName: string;
  startingStats: {
    targetValue: number;
    life: number;
    es: number;
    dps: number;
    pointsAllocated: number;
  };
  finalStats: {
    targetValue: number;
    life: number;
    es: number;
    dps: number;
    pointsAllocated: number;
  };
  improvements: {
    targetValueGain: number;
    targetValuePercent: number;
    lifeChange: number;
    esChange: number;
    dpsChange: number;
    pointsChange: number;
  };
  iterations: number;
  nodesAdded: string[];
  nodesRemoved: string[];
  constraintsMet: boolean;
  warnings: string[];
  formattedTree: {
    classId: number;
    ascendClassId: number;
    nodes: number[];
  };
}

export type OptimizationGoal =
  | 'maximize_dps'
  | 'maximize_life'
  | 'maximize_es'
  | 'maximize_ehp'
  | 'balanced'
  | 'league_start';

/**
 * Calculate a composite score based on optimization goal
 */
export function calculateScore(
  stats: any,
  goal: OptimizationGoal
): number {
  const life = parseFloat(stats.Life || 0);
  const es = parseFloat(stats.EnergyShield || 0);
  const dps = parseFloat(stats.TotalDPS || 0);

  switch (goal) {
    case 'maximize_dps':
      return dps;

    case 'maximize_life':
      return life;

    case 'maximize_es':
      return es;

    case 'maximize_ehp':
      return life + es;

    case 'balanced':
      // Geometric mean of DPS and EHP (punishes extremes)
      return Math.sqrt(dps * (life + es) / 1000);

    case 'league_start':
      // Prioritize survivability (60%) over damage (40%)
      return ((life + es) * 0.6) + (dps * 0.4 / 1000);

    default:
      return dps;
  }
}

/**
 * Detect if this is a low-life build (life reserved below 50%)
 */
export function isLowLifeBuild(stats: any): boolean {
  const life = parseFloat(stats.Life || 0);
  const totalLife = parseFloat(stats.TotalLife || stats.Life || 0);

  // If life is less than 50% of total, likely low-life
  if (life < totalLife * 0.5) {
    return true;
  }

  // Alternative check: large ES pool with small life pool
  const es = parseFloat(stats.EnergyShield || 0);
  if (life < 2000 && es > 4000) {
    return true;
  }

  return false;
}

/**
 * Check if stats meet all constraints
 */
export function meetsConstraints(
  stats: any,
  constraints: OptimizationConstraints
): boolean {
  // For low-life builds, skip minLife constraint (they run at ~35% life by design)
  const isLowLife = isLowLifeBuild(stats);

  if (constraints.minLife && !isLowLife && parseFloat(stats.Life || 0) < constraints.minLife) {
    return false;
  }

  if (constraints.minES && parseFloat(stats.EnergyShield || 0) < constraints.minES) {
    return false;
  }

  if (constraints.minEHP) {
    const ehp = parseFloat(stats.Life || 0) + parseFloat(stats.EnergyShield || 0);
    if (ehp < constraints.minEHP) return false;
  }

  if (constraints.minFireResist && parseFloat(stats.FireResist || 0) < constraints.minFireResist) {
    return false;
  }

  if (constraints.minColdResist && parseFloat(stats.ColdResist || 0) < constraints.minColdResist) {
    return false;
  }

  if (constraints.minLightningResist && parseFloat(stats.LightningResist || 0) < constraints.minLightningResist) {
    return false;
  }

  if (constraints.minChaosResist && parseFloat(stats.ChaosResist || 0) < constraints.minChaosResist) {
    return false;
  }

  return true;
}

/**
 * Get description for optimization goal
 */
export function getGoalDescription(goal: OptimizationGoal): string {
  const descriptions: Record<OptimizationGoal, string> = {
    maximize_dps: 'Maximize Total DPS',
    maximize_life: 'Maximize Life Pool',
    maximize_es: 'Maximize Energy Shield',
    maximize_ehp: 'Maximize Effective HP (Life + ES)',
    balanced: 'Balance Offense and Defense',
    league_start: 'Optimize for League Start (prioritize survivability)'
  };
  return descriptions[goal];
}

/**
 * Check if a node is required for tree pathing
 * (i.e., removing it would orphan other allocated nodes)
 */
export function isRequiredForPath(
  nodeId: string,
  allocatedNodes: Set<string>,
  treeData: any,
  protectedNodes?: string[]
): boolean {
  // Protected nodes can never be removed
  if (protectedNodes && protectedNodes.includes(nodeId)) {
    return true;
  }

  // Ascendancy start nodes can never be removed
  const node = treeData.nodes.get(nodeId);
  if (node && node.isAscendancyStart) {
    return true;
  }

  // Check if removing this node would disconnect the tree
  // This is a simplified check - a full implementation would need graph traversal
  // For now, we'll mark it as required if it has multiple allocated neighbors
  let allocatedNeighborCount = 0;
  if (node && node.out) {
    for (const neighborId of node.out) {
      if (allocatedNodes.has(neighborId)) {
        allocatedNeighborCount++;
      }
    }
  }

  // If this node has 2+ allocated neighbors, it's likely required for pathing
  return allocatedNeighborCount >= 2;
}

/**
 * Find nodes that can be safely removed (not required for pathing)
 */
export function findRemovableNodes(
  allocatedNodes: Set<string>,
  treeData: any,
  constraints: OptimizationConstraints
): string[] {
  const removable: string[] = [];

  for (const nodeId of allocatedNodes) {
    if (!isRequiredForPath(nodeId, allocatedNodes, treeData, constraints.protectedNodes)) {
      removable.push(nodeId);
    }
  }

  return removable;
}

/**
 * Format optimization result into readable text
 */
export function formatOptimizationResult(result: OptimizationResult): string {
  let text = `=== Tree Optimization Result ===\n\n`;

  text += `Goal: ${result.goalDescription}\n`;
  text += `Build: ${result.buildName}\n`;
  text += `Iterations: ${result.iterations}\n\n`;

  // Starting stats
  text += `**Starting Stats:**\n`;
  text += `- Target Value: ${result.startingStats.targetValue.toFixed(0)}\n`;
  text += `- Life: ${result.startingStats.life.toFixed(0)}\n`;
  text += `- ES: ${result.startingStats.es.toFixed(0)}\n`;
  text += `- DPS: ${result.startingStats.dps.toFixed(0)}\n`;
  text += `- Points: ${result.startingStats.pointsAllocated}\n\n`;

  // Final stats
  text += `**Final Stats:**\n`;
  text += `- Target Value: ${result.finalStats.targetValue.toFixed(0)}\n`;
  text += `- Life: ${result.finalStats.life.toFixed(0)}\n`;
  text += `- ES: ${result.finalStats.es.toFixed(0)}\n`;
  text += `- DPS: ${result.finalStats.dps.toFixed(0)}\n`;
  text += `- Points: ${result.finalStats.pointsAllocated}\n\n`;

  // Improvements
  const improvements = result.improvements;
  text += `**Improvements:**\n`;
  text += `- Target: ${improvements.targetValueGain >= 0 ? '+' : ''}${improvements.targetValueGain.toFixed(0)} `;
  text += `(${improvements.targetValuePercent >= 0 ? '+' : ''}${improvements.targetValuePercent.toFixed(1)}%)\n`;
  text += `- Life: ${improvements.lifeChange >= 0 ? '+' : ''}${improvements.lifeChange.toFixed(0)}\n`;
  text += `- ES: ${improvements.esChange >= 0 ? '+' : ''}${improvements.esChange.toFixed(0)}\n`;
  text += `- DPS: ${improvements.dpsChange >= 0 ? '+' : ''}${improvements.dpsChange.toFixed(0)}\n`;
  text += `- Points: ${improvements.pointsChange >= 0 ? '+' : ''}${improvements.pointsChange}\n\n`;

  // Changes - MOST IMPORTANT SECTION
  text += `**📋 TREE CHANGES (ACTION REQUIRED):**\n\n`;

  if (result.nodesRemoved.length > 0) {
    text += `❌ **REMOVE ${result.nodesRemoved.length} NODE${result.nodesRemoved.length > 1 ? 'S' : ''}:**\n`;
    text += `${result.nodesRemoved.join(', ')}\n`;
    text += `→ Removing these frees up ${result.nodesRemoved.length} passive point${result.nodesRemoved.length > 1 ? 's' : ''}.\n\n`;
  }

  if (result.nodesAdded.length > 0) {
    text += `✅ **ADD ${result.nodesAdded.length} NODE${result.nodesAdded.length > 1 ? 'S' : ''}:**\n`;
    text += `${result.nodesAdded.join(', ')}\n`;
    text += `→ These nodes provide optimal stat gains for your goal.\n\n`;
  }

  if (result.nodesRemoved.length === 0 && result.nodesAdded.length === 0) {
    text += `No changes needed - tree is already optimal!\n\n`;
  } else {
    // Net point change
    const netChange = result.nodesAdded.length - result.nodesRemoved.length;
    text += `**Net Point Change:** ${netChange >= 0 ? '+' : ''}${netChange}\n`;
    if (netChange > 0) {
      text += `⚠️ You need ${netChange} additional passive point${netChange > 1 ? 's' : ''} to apply all changes.\n`;
    } else if (netChange < 0) {
      text += `✓ You'll have ${Math.abs(netChange)} passive point${Math.abs(netChange) > 1 ? 's' : ''} left over.\n`;
    } else {
      text += `✓ Equal nodes added/removed - no extra points needed.\n`;
    }
    text += `\n`;
  }

  // Warnings
  if (result.warnings.length > 0) {
    text += `**Warnings:**\n`;
    for (const warning of result.warnings) {
      text += `⚠️  ${warning}\n`;
    }
    text += `\n`;
  }

  // Constraints
  text += `**Constraints Met:** ${result.constraintsMet ? '✓ Yes' : '✗ No'}\n\n`;

  // How to apply
  text += `**🔧 TO APPLY CHANGES:**\n\n`;

  if (result.nodesRemoved.length > 0 || result.nodesAdded.length > 0) {
    text += `**Option 1 - Manual (Recommended for reviewing changes):**\n`;
    if (result.nodesRemoved.length > 0) {
      text += `1. In Path of Building, unallocate these node IDs: ${result.nodesRemoved.join(', ')}\n`;
    }
    if (result.nodesAdded.length > 0) {
      text += `${result.nodesRemoved.length > 0 ? '2' : '1'}. Use allocate_nodes tool with these IDs: ${result.nodesAdded.join(', ')}\n`;
    }
    text += `\n`;

    text += `**Option 2 - Automatic (applies entire optimized tree):**\n`;
    text += `Use lua_set_tree with these parameters:\n`;
    text += `- classId: ${result.formattedTree.classId}\n`;
    text += `- ascendClassId: ${result.formattedTree.ascendClassId}\n`;
    text += `- nodes: [${result.formattedTree.nodes.join(', ')}]\n`;
    text += `⚠️ This replaces your entire passive tree!\n\n`;
  }

  // Tips
  text += `**💡 IMPORTANT TIPS:**\n`;
  text += `- 🔴 BACKUP your build file before making changes!\n`;
  text += `- Review nodes marked for removal - they may have situational value\n`;
  text += `- Use constraints.protectedNodes to prevent removal of critical nodes\n`;
  text += `- You can run optimize_tree multiple times for incremental improvements\n`;
  text += `- Check if you have enough passive points before applying changes\n`;

  return text;
}

/**
 * Parse optimization goal from string
 */
export function parseOptimizationGoal(goalString: string): OptimizationGoal {
  const normalized = goalString.toLowerCase().trim().replace(/\s+/g, '_');

  if (normalized.includes('dps') || normalized.includes('damage') || normalized.includes('offense')) {
    return 'maximize_dps';
  }

  if (normalized.includes('life') && !normalized.includes('es') && !normalized.includes('energy')) {
    return 'maximize_life';
  }

  if (normalized.includes('es') || normalized.includes('energy_shield')) {
    return 'maximize_es';
  }

  if (normalized.includes('ehp') || normalized.includes('survivability')) {
    return 'maximize_ehp';
  }

  if (normalized.includes('balanced') || normalized.includes('hybrid')) {
    return 'balanced';
  }

  if (normalized.includes('league') || normalized.includes('budget')) {
    return 'league_start';
  }

  // Default to DPS
  return 'maximize_dps';
}
