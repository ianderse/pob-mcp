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
 * Check if stats meet all constraints
 */
export function meetsConstraints(
  stats: any,
  constraints: OptimizationConstraints
): boolean {
  if (constraints.minLife && parseFloat(stats.Life || 0) < constraints.minLife) {
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

  // Changes
  text += `**Tree Changes:**\n`;
  if (result.nodesRemoved.length > 0) {
    text += `Removed ${result.nodesRemoved.length} nodes: ${result.nodesRemoved.slice(0, 10).join(', ')}`;
    if (result.nodesRemoved.length > 10) {
      text += ` ... and ${result.nodesRemoved.length - 10} more`;
    }
    text += `\n`;
  }
  if (result.nodesAdded.length > 0) {
    text += `Added ${result.nodesAdded.length} nodes: ${result.nodesAdded.slice(0, 10).join(', ')}`;
    if (result.nodesAdded.length > 10) {
      text += ` ... and ${result.nodesAdded.length - 10} more`;
    }
    text += `\n`;
  }
  if (result.nodesRemoved.length === 0 && result.nodesAdded.length === 0) {
    text += `No changes made (tree is already optimal)\n`;
  }
  text += `\n`;

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
  text += `**To Apply:**\n`;
  text += `Use lua_set_tree with the following parameters:\n`;
  text += `- classId: ${result.formattedTree.classId}\n`;
  text += `- ascendClassId: ${result.formattedTree.ascendClassId}\n`;
  text += `- nodes: [${result.formattedTree.nodes.length} nodes]\n\n`;

  // Tips
  text += `**Tips:**\n`;
  text += `- Save your build before applying changes\n`;
  text += `- Review removed nodes to ensure none are critical\n`;
  text += `- You can protect specific nodes with the 'protected_nodes' parameter\n`;
  text += `- Run optimize_tree again after applying to find further improvements\n`;

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
