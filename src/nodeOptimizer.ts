/**
 * Node Optimizer - Intelligent passive tree optimization
 *
 * Analyzes builds and suggests optimal passive nodes to allocate based on goals.
 * Uses Lua bridge for accurate stat calculations and scores nodes by efficiency.
 */

// Type definitions
export interface NodeScore {
  nodeId: string;
  nodeName: string;
  nodeType: 'keystone' | 'notable' | 'jewel' | 'small';
  pathNodes: string[];        // All nodes needed (travel + target)
  pathCost: number;           // Total points to allocate
  statGain: number;           // Increase in target stat
  efficiency: number;         // statGain / pathCost
  currentValue: number;       // Baseline stat value
  newValue: number;           // Stat value after allocation
  percentIncrease: number;    // Percentage increase
  secondaryBenefits?: {[key: string]: number};  // Other stats improved
  notes?: string;             // Special notes (e.g., "grants keystone")
}

export interface OptimalNodesResult {
  goal: string;
  goalDescription: string;
  buildName: string;
  currentValue: number;
  pointsAvailable: number;
  maxDistance: number;
  candidatesEvaluated: number;
  candidatesScored: number;
  recommendations: NodeScore[];
  summary: {
    topPick?: NodeScore;
    totalStatGain: number;
    totalPointCost: number;
    averageEfficiency: number;
    projectedValue: number;
    projectedIncrease: number;
  };
  warnings: string[];
}

export type BuildGoal =
  // Offense
  | 'maximize_dps'
  | 'maximize_hit_dps'
  | 'maximize_dot_dps'
  | 'crit_chance'
  | 'crit_multi'
  | 'attack_speed'
  | 'cast_speed'
  // Defense
  | 'maximize_life'
  | 'maximize_es'
  | 'maximize_ehp'
  | 'resistances'
  | 'armour'
  | 'evasion'
  | 'block'
  | 'spell_block'
  // Utility
  | 'movement_speed'
  | 'mana_regen'
  | 'life_regen'
  | 'attributes'
  // Balanced
  | 'balanced'
  | 'league_start';

// Stat extraction functions
type StatExtractor = (stats: any) => number;

const STAT_EXTRACTORS: Record<BuildGoal, StatExtractor> = {
  // Offense
  maximize_dps: (stats) => parseFloat(stats.TotalDPS || 0),
  maximize_hit_dps: (stats) => parseFloat(stats.TotalDPS || 0) - parseFloat(stats.TotalDot || 0),
  maximize_dot_dps: (stats) => parseFloat(stats.TotalDot || 0),
  crit_chance: (stats) => parseFloat(stats.CritChance || 0),
  crit_multi: (stats) => parseFloat(stats.CritMultiplier || 0),
  attack_speed: (stats) => parseFloat(stats.Speed || stats.AttackRate || 0),
  cast_speed: (stats) => parseFloat(stats.Speed || stats.CastRate || 0),

  // Defense
  maximize_life: (stats) => parseFloat(stats.Life || 0),
  maximize_es: (stats) => parseFloat(stats.EnergyShield || 0),
  maximize_ehp: (stats) => parseFloat(stats.Life || 0) + parseFloat(stats.EnergyShield || 0),
  resistances: (stats) => Math.min(
    parseFloat(stats.FireResist || 0),
    parseFloat(stats.ColdResist || 0),
    parseFloat(stats.LightningResist || 0)
  ),
  armour: (stats) => parseFloat(stats.Armour || 0),
  evasion: (stats) => parseFloat(stats.Evasion || 0),
  block: (stats) => parseFloat(stats.BlockChance || 0),
  spell_block: (stats) => parseFloat(stats.SpellBlockChance || 0),

  // Utility
  movement_speed: (stats) => parseFloat(stats.MovementSpeed || stats.MoveSpeed || 0),
  mana_regen: (stats) => parseFloat(stats.ManaRegen || stats.ManaRegenRate || 0),
  life_regen: (stats) => parseFloat(stats.LifeRegen || stats.LifeRegenRate || 0),
  attributes: (stats) =>
    parseFloat(stats.Str || 0) +
    parseFloat(stats.Dex || 0) +
    parseFloat(stats.Int || 0),

  // Balanced (composite scoring)
  balanced: (stats) => {
    const life = parseFloat(stats.Life || 0);
    const dps = parseFloat(stats.TotalDPS || 0);
    // Normalize and combine (weighted equally)
    return (life / 100) + (dps / 100);
  },
  league_start: (stats) => {
    const life = parseFloat(stats.Life || 0);
    const dps = parseFloat(stats.TotalDPS || 0);
    // Prioritize life 60/40 for league start
    return (life / 100 * 0.6) + (dps / 100 * 0.4);
  }
};

const GOAL_DESCRIPTIONS: Record<BuildGoal, string> = {
  maximize_dps: 'Maximize Total DPS',
  maximize_hit_dps: 'Maximize Hit DPS (excluding DoT)',
  maximize_dot_dps: 'Maximize Damage over Time',
  crit_chance: 'Increase Critical Strike Chance',
  crit_multi: 'Increase Critical Strike Multiplier',
  attack_speed: 'Increase Attack Speed',
  cast_speed: 'Increase Cast Speed',
  maximize_life: 'Maximize Life Pool',
  maximize_es: 'Maximize Energy Shield',
  maximize_ehp: 'Maximize Effective HP (Life + ES)',
  resistances: 'Increase Resistances (lowest)',
  armour: 'Increase Armour Rating',
  evasion: 'Increase Evasion Rating',
  block: 'Increase Block Chance',
  spell_block: 'Increase Spell Block Chance',
  movement_speed: 'Increase Movement Speed',
  mana_regen: 'Increase Mana Regeneration',
  life_regen: 'Increase Life Regeneration',
  attributes: 'Increase Total Attributes',
  balanced: 'Balance Offense and Defense',
  league_start: 'Optimize for League Start (prioritize survivability)'
};

/**
 * Extract secondary benefits (other stats that improved)
 */
export function extractSecondaryBenefits(
  baselineStats: any,
  newStats: any,
  primaryGoal: BuildGoal
): {[key: string]: number} {
  const benefits: {[key: string]: number} = {};

  // Key stats to track
  const secondaryStats = [
    { key: 'Life', label: 'Life' },
    { key: 'EnergyShield', label: 'ES' },
    { key: 'TotalDPS', label: 'DPS' },
    { key: 'Armour', label: 'Armour' },
    { key: 'Evasion', label: 'Evasion' },
    { key: 'Str', label: 'STR' },
    { key: 'Dex', label: 'DEX' },
    { key: 'Int', label: 'INT' },
  ];

  for (const stat of secondaryStats) {
    // Skip if this is the primary stat we're optimizing for
    if (primaryGoal.includes(stat.key.toLowerCase())) continue;

    const baseline = parseFloat(baselineStats[stat.key] || 0);
    const newVal = parseFloat(newStats[stat.key] || 0);
    const gain = newVal - baseline;

    if (Math.abs(gain) > 0.01) {  // Ignore tiny differences
      benefits[stat.label] = gain;
    }
  }

  return benefits;
}

/**
 * Format a number with appropriate precision
 */
function formatStatValue(value: number, goal: BuildGoal): string {
  // Percentages
  if (goal.includes('chance') || goal.includes('resist') || goal.includes('speed')) {
    return value.toFixed(1) + '%';
  }

  // DPS values (large numbers)
  if (goal.includes('dps')) {
    if (value >= 1000000) {
      return (value / 1000000).toFixed(2) + 'M';
    } else if (value >= 1000) {
      return (value / 1000).toFixed(1) + 'k';
    }
    return value.toFixed(0);
  }

  // Rates (regen, etc.)
  if (goal.includes('regen')) {
    return value.toFixed(1) + '/sec';
  }

  // Default: round to integer
  return Math.round(value).toString();
}

/**
 * Determine node type from node data
 */
export function getNodeType(node: any): 'keystone' | 'notable' | 'jewel' | 'small' {
  if (node.isKeystone) return 'keystone';
  if (node.isJewelSocket) return 'jewel';
  if (node.isNotable) return 'notable';
  return 'small';
}

/**
 * Format recommendations into readable text
 */
export function formatOptimalNodesResult(result: OptimalNodesResult): string {
  let text = `=== Optimal Nodes for Goal: ${result.goalDescription} ===\n\n`;

  text += `Build: ${result.buildName}\n`;
  text += `Current Value: ${formatStatValue(result.currentValue, result.goal as BuildGoal)}\n`;
  text += `Points Available: ${result.pointsAvailable}\n`;
  text += `Max Distance: ${result.maxDistance} nodes\n`;
  text += `Candidates Evaluated: ${result.candidatesEvaluated}\n`;
  text += `Candidates Scored: ${result.candidatesScored}\n\n`;

  // Warnings
  if (result.warnings.length > 0) {
    text += `**WARNINGS:**\n`;
    for (const warning of result.warnings) {
      text += `⚠️  ${warning}\n`;
    }
    text += `\n`;
  }

  // Recommendations
  if (result.recommendations.length === 0) {
    text += `**NO RECOMMENDATIONS FOUND**\n\n`;
    text += `Try:\n`;
    text += `- Increasing max_distance\n`;
    text += `- Lowering min_efficiency threshold\n`;
    text += `- Choosing a different goal\n`;
    return text;
  }

  text += `**TOP RECOMMENDATIONS:**\n\n`;

  for (let i = 0; i < Math.min(result.recommendations.length, 10); i++) {
    const rec = result.recommendations[i];
    const icon = i === 0 ? '⭐' : (rec.nodeType === 'keystone' ? '🔑' : '📍');

    text += `${i + 1}. ${icon} ${rec.nodeName || 'Unknown'} [${rec.nodeId}] (${rec.nodeType.toUpperCase()})`;
    text += ` - EFFICIENCY: ${formatStatValue(rec.efficiency, result.goal as BuildGoal)}/point\n`;

    text += `   Path: ${rec.pathCost} node${rec.pathCost > 1 ? 's' : ''} to allocate\n`;
    text += `   Stat Gain: ${formatStatValue(rec.statGain, result.goal as BuildGoal)} `;
    text += `(${rec.percentIncrease >= 0 ? '+' : ''}${rec.percentIncrease.toFixed(1)}% increase)\n`;

    // Secondary benefits
    if (rec.secondaryBenefits && Object.keys(rec.secondaryBenefits).length > 0) {
      const benefits = Object.entries(rec.secondaryBenefits)
        .map(([stat, val]) => `${val > 0 ? '+' : ''}${Math.round(val as number)} ${stat}`)
        .join(', ');
      text += `   Bonus: ${benefits}\n`;
    }

    // Notes
    if (rec.notes) {
      text += `   Note: ${rec.notes}\n`;
    }

    text += `   → Use: allocate_nodes(build_name="${result.buildName}", node_ids=${JSON.stringify(rec.pathNodes)})\n`;
    text += `\n`;
  }

  // Summary
  text += `**SUMMARY:**\n`;
  if (result.summary.topPick) {
    const top = result.summary.topPick;
    text += `Best Pick: ${top.nodeName} (${formatStatValue(top.efficiency, result.goal as BuildGoal)}/point)\n`;
  }

  const top3 = result.recommendations.slice(0, 3);
  if (top3.length > 0) {
    const totalGain = top3.reduce((sum, r) => sum + r.statGain, 0);
    const totalCost = top3.reduce((sum, r) => sum + r.pathCost, 0);
    const avgEff = totalGain / totalCost;

    text += `Top ${top3.length} picks would give ${formatStatValue(totalGain, result.goal as BuildGoal)} `;
    text += `for ${totalCost} points (${formatStatValue(avgEff, result.goal as BuildGoal)}/point average)\n`;

    text += `Current: ${formatStatValue(result.currentValue, result.goal as BuildGoal)} → `;
    text += `Projected: ${formatStatValue(result.currentValue + totalGain, result.goal as BuildGoal)} `;
    text += `(${((totalGain / result.currentValue) * 100).toFixed(1)}% increase)\n`;
  }

  text += `\n**TIP:** Allocate the top pick first, then re-run this tool to find the next best options.\n`;

  return text;
}

/**
 * Parse a goal string into a BuildGoal enum
 */
export function parseGoal(goalString: string): BuildGoal {
  const normalized = goalString.toLowerCase().trim().replace(/\s+/g, '_');

  // Direct matches
  if (normalized in STAT_EXTRACTORS) {
    return normalized as BuildGoal;
  }

  // Fuzzy matching
  if (normalized.includes('dps') || normalized.includes('damage')) {
    if (normalized.includes('dot') || normalized.includes('bleed') || normalized.includes('poison')) {
      return 'maximize_dot_dps';
    }
    if (normalized.includes('hit')) {
      return 'maximize_hit_dps';
    }
    return 'maximize_dps';
  }

  if (normalized.includes('life') || normalized.includes('hp')) {
    if (normalized.includes('regen')) return 'life_regen';
    return 'maximize_life';
  }

  if (normalized.includes('es') || normalized.includes('energy_shield')) {
    return 'maximize_es';
  }

  if (normalized.includes('ehp') || normalized.includes('survivability')) {
    return 'maximize_ehp';
  }

  if (normalized.includes('resist')) {
    return 'resistances';
  }

  if (normalized.includes('armour') || normalized.includes('armor')) {
    return 'armour';
  }

  if (normalized.includes('evasion') || normalized.includes('evade')) {
    return 'evasion';
  }

  if (normalized.includes('block')) {
    if (normalized.includes('spell')) return 'spell_block';
    return 'block';
  }

  if (normalized.includes('crit')) {
    if (normalized.includes('multi') || normalized.includes('multiplier')) {
      return 'crit_multi';
    }
    return 'crit_chance';
  }

  if (normalized.includes('attack_speed') || normalized.includes('aps')) {
    return 'attack_speed';
  }

  if (normalized.includes('cast_speed')) {
    return 'cast_speed';
  }

  if (normalized.includes('movement') || normalized.includes('move_speed')) {
    return 'movement_speed';
  }

  if (normalized.includes('mana') && normalized.includes('regen')) {
    return 'mana_regen';
  }

  if (normalized.includes('attribute') || normalized.includes('str') || normalized.includes('dex') || normalized.includes('int')) {
    return 'attributes';
  }

  if (normalized.includes('balanced') || normalized.includes('mix')) {
    return 'balanced';
  }

  if (normalized.includes('league') || normalized.includes('leveling')) {
    return 'league_start';
  }

  // Default to maximize_dps if unclear
  return 'maximize_dps';
}

/**
 * Get the stat extractor for a goal
 */
export function getStatExtractor(goal: BuildGoal): StatExtractor {
  return STAT_EXTRACTORS[goal];
}

/**
 * Get the description for a goal
 */
export function getGoalDescription(goal: BuildGoal): string {
  return GOAL_DESCRIPTIONS[goal];
}
