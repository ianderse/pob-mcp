/**
 * Defensive Analyzer for Path of Building builds
 * Analyzes defensive stats and provides recommendations
 */

export interface DefensiveAnalysis {
  resistances: ResistanceAnalysis;
  lifePool: LifePoolAnalysis;
  mitigation: MitigationAnalysis;
  sustain: SustainAnalysis;
  recommendations: Recommendation[];
  overallScore: 'excellent' | 'good' | 'fair' | 'poor' | 'critical';
}

export interface ResistanceAnalysis {
  fire: { value: number; status: 'capped' | 'overcapped' | 'uncapped' };
  cold: { value: number; status: 'capped' | 'overcapped' | 'uncapped' };
  lightning: { value: number; status: 'capped' | 'overcapped' | 'uncapped' };
  chaos: { value: number; status: 'good' | 'low' | 'dangerous' };
  allCapped: boolean;
}

export interface LifePoolAnalysis {
  life: number;
  energyShield: number;
  total: number;
  status: 'excellent' | 'good' | 'adequate' | 'low' | 'critical';
  recommendation?: string;
}

export interface MitigationAnalysis {
  armour: { value: number; effectiveness: string };
  evasion: { value: number; effectiveness: string };
  block: { value: number; effectiveness: string };
  spellBlock: { value: number; effectiveness: string };
  overall: 'excellent' | 'good' | 'fair' | 'poor' | 'none';
}

export interface SustainAnalysis {
  lifeRegen: { value: number; percentOfMax: number; status: string };
  manaRegen: { value: number; status: string };
  esRecharge: { value: number; status: string };
  overall: 'excellent' | 'good' | 'adequate' | 'poor';
}

export interface Recommendation {
  priority: 'critical' | 'high' | 'medium' | 'low';
  category: 'resistance' | 'life' | 'mitigation' | 'sustain';
  issue: string;
  solutions: string[];
  impact?: string;
}

/**
 * Analyze defensive stats from a build
 */
export function analyzeDefenses(stats: Record<string, any>): DefensiveAnalysis {
  const resistances = analyzeResistances(stats);
  const lifePool = analyzeLifePool(stats);
  const mitigation = analyzeMitigation(stats);
  const sustain = analyzeSustain(stats);

  const recommendations: Recommendation[] = [];

  // Generate recommendations based on analysis
  recommendations.push(...generateResistanceRecommendations(resistances));
  recommendations.push(...generateLifePoolRecommendations(lifePool));
  recommendations.push(...generateMitigationRecommendations(mitigation, stats));
  recommendations.push(...generateSustainRecommendations(sustain));

  // Sort by priority
  recommendations.sort((a, b) => {
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });

  const overallScore = calculateOverallScore(resistances, lifePool, mitigation, sustain);

  return {
    resistances,
    lifePool,
    mitigation,
    sustain,
    recommendations,
    overallScore,
  };
}

/**
 * Analyze resistance stats
 */
function analyzeResistances(stats: Record<string, any>): ResistanceAnalysis {
  // Helper to get stat value - works with both Lua stats object and parsed stats
  const getStat = (key: string): number => {
    // Try direct property access (Lua format)
    if (stats[key] !== undefined) {
      return parseFloat(stats[key]) || 0;
    }
    // Try with "Player" prefix (alternate format)
    if (stats[`Player${key}`] !== undefined) {
      return parseFloat(stats[`Player${key}`]) || 0;
    }
    return 0;
  };

  const fire = getStat('FireResist');
  const cold = getStat('ColdResist');
  const lightning = getStat('LightningResist');
  const chaos = getStat('ChaosResist');

  const getResistStatus = (value: number) => {
    if (value >= 75) return value > 75 ? 'overcapped' : 'capped';
    return 'uncapped';
  };

  const getChaosStatus = (value: number) => {
    if (value >= 60) return 'good';
    if (value >= 0) return 'low';
    return 'dangerous';
  };

  return {
    fire: { value: fire, status: getResistStatus(fire) },
    cold: { value: cold, status: getResistStatus(cold) },
    lightning: { value: lightning, status: getResistStatus(lightning) },
    chaos: { value: chaos, status: getChaosStatus(chaos) },
    allCapped: fire >= 75 && cold >= 75 && lightning >= 75,
  };
}

/**
 * Analyze life pool
 */
function analyzeLifePool(stats: Record<string, any>): LifePoolAnalysis {
  // Helper to get stat value
  const getStat = (key: string): number => {
    if (stats[key] !== undefined) return parseFloat(stats[key]) || 0;
    if (stats[`Player${key}`] !== undefined) return parseFloat(stats[`Player${key}`]) || 0;
    return 0;
  };

  const life = getStat('Life');
  const es = getStat('EnergyShield');
  const total = life + es;

  let status: LifePoolAnalysis['status'];
  let recommendation: string | undefined;

  if (total >= 6000) {
    status = 'excellent';
  } else if (total >= 4500) {
    status = 'good';
  } else if (total >= 3500) {
    status = 'adequate';
    recommendation = 'Consider adding more life/ES nodes or gear';
  } else if (total >= 2500) {
    status = 'low';
    recommendation = 'Life/ES is quite low - prioritize defensive nodes';
  } else {
    status = 'critical';
    recommendation = 'CRITICAL: Life/ES is dangerously low!';
  }

  return { life, energyShield: es, total, status, recommendation };
}

/**
 * Analyze mitigation
 */
function analyzeMitigation(stats: Record<string, any>): MitigationAnalysis {
  // Helper to get stat value
  const getStat = (key: string): number => {
    if (stats[key] !== undefined) return parseFloat(stats[key]) || 0;
    if (stats[`Player${key}`] !== undefined) return parseFloat(stats[`Player${key}`]) || 0;
    return 0;
  };

  const armour = getStat('Armour');
  const evasion = getStat('Evasion');
  const block = getStat('BlockChance');
  const spellBlock = getStat('SpellBlockChance');

  const getArmourEffectiveness = (value: number): string => {
    if (value >= 30000) return 'excellent (~40-50% phys reduction)';
    if (value >= 15000) return 'good (~25-35% phys reduction)';
    if (value >= 5000) return 'moderate (~10-20% phys reduction)';
    if (value >= 1000) return 'minimal (~3-8% phys reduction)';
    return 'negligible';
  };

  const getEvasionEffectiveness = (value: number): string => {
    if (value >= 30000) return 'excellent (~50-60% evade chance)';
    if (value >= 15000) return 'good (~35-45% evade chance)';
    if (value >= 5000) return 'moderate (~20-30% evade chance)';
    if (value >= 1000) return 'minimal (~5-15% evade chance)';
    return 'negligible';
  };

  const getBlockEffectiveness = (value: number): string => {
    if (value >= 60) return 'excellent (near cap)';
    if (value >= 40) return 'good';
    if (value >= 20) return 'moderate';
    if (value >= 10) return 'minimal';
    return 'none';
  };

  // Determine overall mitigation
  let overall: MitigationAnalysis['overall'];
  const hasMitigation = armour >= 10000 || evasion >= 10000 || block >= 30;

  if ((armour >= 30000 || evasion >= 30000) && block >= 40) {
    overall = 'excellent';
  } else if ((armour >= 15000 || evasion >= 15000) && block >= 20) {
    overall = 'good';
  } else if (hasMitigation) {
    overall = 'fair';
  } else if (armour >= 1000 || evasion >= 1000 || block >= 10) {
    overall = 'poor';
  } else {
    overall = 'none';
  }

  return {
    armour: { value: armour, effectiveness: getArmourEffectiveness(armour) },
    evasion: { value: evasion, effectiveness: getEvasionEffectiveness(evasion) },
    block: { value: block, effectiveness: getBlockEffectiveness(block) },
    spellBlock: { value: spellBlock, effectiveness: getBlockEffectiveness(spellBlock) },
    overall,
  };
}

/**
 * Analyze sustain
 */
function analyzeSustain(stats: Record<string, any>): SustainAnalysis {
  // Helper to get stat value
  const getStat = (key: string): number => {
    if (stats[key] !== undefined) return parseFloat(stats[key]) || 0;
    if (stats[`Player${key}`] !== undefined) return parseFloat(stats[`Player${key}`]) || 0;
    return 0;
  };

  const lifeRegen = getStat('LifeRegen');
  const life = getStat('Life') || 1; // Avoid division by zero
  const manaRegen = getStat('ManaRegen');
  const esRecharge = getStat('ESRecharge');

  const lifeRegenPercent = (lifeRegen / life) * 100;

  const getLifeRegenStatus = (percent: number): string => {
    if (percent >= 5) return 'excellent';
    if (percent >= 2) return 'good';
    if (percent >= 1) return 'adequate';
    if (percent > 0) return 'minimal';
    return 'none';
  };

  const getManaRegenStatus = (value: number): string => {
    if (value >= 200) return 'excellent';
    if (value >= 100) return 'good';
    if (value >= 50) return 'adequate';
    return 'low';
  };

  const getESRechargeStatus = (value: number): string => {
    if (value >= 1000) return 'excellent';
    if (value >= 500) return 'good';
    if (value >= 200) return 'adequate';
    return 'low or none';
  };

  // Overall sustain assessment
  let overall: SustainAnalysis['overall'];
  if (lifeRegenPercent >= 3 || esRecharge >= 800) {
    overall = 'excellent';
  } else if (lifeRegenPercent >= 1.5 || esRecharge >= 400) {
    overall = 'good';
  } else if (lifeRegenPercent >= 0.5 || esRecharge >= 100) {
    overall = 'adequate';
  } else {
    overall = 'poor';
  }

  return {
    lifeRegen: {
      value: lifeRegen,
      percentOfMax: lifeRegenPercent,
      status: getLifeRegenStatus(lifeRegenPercent),
    },
    manaRegen: { value: manaRegen, status: getManaRegenStatus(manaRegen) },
    esRecharge: { value: esRecharge, status: getESRechargeStatus(esRecharge) },
    overall,
  };
}

/**
 * Generate resistance recommendations
 */
function generateResistanceRecommendations(analysis: ResistanceAnalysis): Recommendation[] {
  const recs: Recommendation[] = [];

  // Check elemental resistances
  const uncapped: string[] = [];
  if (analysis.fire.status === 'uncapped') uncapped.push(`Fire (${analysis.fire.value}%)`);
  if (analysis.cold.status === 'uncapped') uncapped.push(`Cold (${analysis.cold.value}%)`);
  if (analysis.lightning.status === 'uncapped')
    uncapped.push(`Lightning (${analysis.lightning.value}%)`);

  if (uncapped.length > 0) {
    const needed = uncapped.map((r) => {
      const match = r.match(/\((\d+)%\)/);
      const current = match ? parseInt(match[1]) : 0;
      return 75 - current;
    });

    recs.push({
      priority: 'critical',
      category: 'resistance',
      issue: `Uncapped resistances: ${uncapped.join(', ')}`,
      solutions: [
        `Need +${Math.max(...needed)}% total to cap all`,
        'Check gear for resistance upgrades',
        'Consider passive tree nodes (Diamond Skin, prismatic nodes)',
        'Use Purity auras if desperate',
      ],
      impact: 'Uncapped resists = taking significantly more elemental damage',
    });
  }

  // Check chaos resistance
  if (analysis.chaos.status === 'dangerous') {
    recs.push({
      priority: 'high',
      category: 'resistance',
      issue: `Chaos Resistance: ${analysis.chaos.value}% (negative or very low)`,
      solutions: [
        'Not critical but helpful against chaos damage',
        'Allocate chaos resist nodes if convenient',
        'Upgrade gear with chaos resist when possible',
        'Amethyst flask can help in chaos damage zones',
      ],
      impact: 'Low priority unless facing chaos damage enemies',
    });
  } else if (analysis.chaos.status === 'low') {
    recs.push({
      priority: 'low',
      category: 'resistance',
      issue: `Chaos Resistance: ${analysis.chaos.value}% (could be better)`,
      solutions: [
        'Consider upgrading when convenient',
        '30-60% chaos resist is comfortable for most content',
      ],
    });
  }

  return recs;
}

/**
 * Generate life pool recommendations
 */
function generateLifePoolRecommendations(analysis: LifePoolAnalysis): Recommendation[] {
  const recs: Recommendation[] = [];

  if (analysis.status === 'critical' || analysis.status === 'low') {
    const priority = analysis.status === 'critical' ? 'critical' : 'high';

    recs.push({
      priority,
      category: 'life',
      issue: `Total Life/ES: ${analysis.total.toLocaleString()} (${analysis.status})`,
      solutions: [
        'Prioritize life/ES nodes on passive tree',
        'Look for +maximum life on all gear pieces',
        'Consider Constitution, Heart of Oak, or other major life wheels',
        `Target: ${analysis.total < 3500 ? '4,000+' : '5,000+'} total life/ES`,
      ],
      impact: 'Low life pool = frequent deaths, especially to one-shots',
    });
  } else if (analysis.status === 'adequate') {
    recs.push({
      priority: 'medium',
      category: 'life',
      issue: `Life/ES is adequate (${analysis.total.toLocaleString()}) but could be better`,
      solutions: [
        'Look for opportunities to add life nodes without sacrificing too much damage',
        'Upgrade gear with higher life rolls when possible',
      ],
    });
  }

  return recs;
}

/**
 * Generate mitigation recommendations
 */
function generateMitigationRecommendations(
  analysis: MitigationAnalysis,
  stats: Record<string, any>
): Recommendation[] {
  const recs: Recommendation[] = [];

  if (analysis.overall === 'none' || analysis.overall === 'poor') {
    recs.push({
      priority: 'high',
      category: 'mitigation',
      issue: 'No meaningful physical damage mitigation',
      solutions: [
        'Consider running Determination (armour) or Grace (evasion) aura',
        'Look for armour/evasion on gear',
        'Allocate defensive nodes on tree',
        'Consider block if using shield or staff',
        'Endurance charges provide physical mitigation',
      ],
      impact: 'No mitigation = taking full physical damage from hits',
    });
  } else if (analysis.overall === 'fair') {
    recs.push({
      priority: 'medium',
      category: 'mitigation',
      issue: 'Physical mitigation is present but could be improved',
      solutions: [
        'Stack more of your chosen defense (armour, evasion, or block)',
        'Consider hybrid defenses (e.g., armour + block)',
        'Quality on armour pieces adds significant defense',
      ],
    });
  }

  return recs;
}

/**
 * Generate sustain recommendations
 */
function generateSustainRecommendations(analysis: SustainAnalysis): Recommendation[] {
  const recs: Recommendation[] = [];

  if (analysis.overall === 'poor') {
    recs.push({
      priority: 'medium',
      category: 'sustain',
      issue: 'No sustain mechanism (regen, leech, recharge)',
      solutions: [
        'Life builds: Allocate regen nodes or get life leech',
        'ES builds: Ensure ES recharge is working (avoid constant hits)',
        'Consider life/mana gain on hit for fast-hitting builds',
        'Flasks help but not a complete solution',
      ],
      impact: 'Without sustain, you rely entirely on flasks for recovery',
    });
  }

  return recs;
}

/**
 * Calculate overall defensive score
 */
function calculateOverallScore(
  resistances: ResistanceAnalysis,
  lifePool: LifePoolAnalysis,
  mitigation: MitigationAnalysis,
  sustain: SustainAnalysis
): DefensiveAnalysis['overallScore'] {
  // Critical issues = critical score
  if (!resistances.allCapped || lifePool.status === 'critical') {
    return 'critical';
  }

  // Count issues
  let issues = 0;
  if (lifePool.status === 'low') issues += 2;
  if (lifePool.status === 'adequate') issues += 1;
  if (mitigation.overall === 'none' || mitigation.overall === 'poor') issues += 2;
  if (mitigation.overall === 'fair') issues += 1;
  if (sustain.overall === 'poor') issues += 1;
  if (resistances.chaos.status === 'dangerous') issues += 1;

  if (issues === 0) return 'excellent';
  if (issues <= 2) return 'good';
  if (issues <= 4) return 'fair';
  return 'poor';
}

/**
 * Format defensive analysis as readable text
 */
export function formatDefensiveAnalysis(analysis: DefensiveAnalysis): string {
  let output = '=== Defensive Analysis ===\n\n';

  // Overall score
  const scoreEmoji = {
    excellent: '✅',
    good: '✓',
    fair: '⚠️',
    poor: '⚠️',
    critical: '🚨',
  };
  output += `Overall: ${scoreEmoji[analysis.overallScore]} ${analysis.overallScore.toUpperCase()}\n\n`;

  // Resistances
  output += '**Resistances:**\n';
  const resistIcon = (status: string) => (status === 'capped' || status === 'overcapped' ? '✓' : '✗');
  output += `${resistIcon(analysis.resistances.fire.status)} Fire: ${analysis.resistances.fire.value}%\n`;
  output += `${resistIcon(analysis.resistances.cold.status)} Cold: ${analysis.resistances.cold.value}%\n`;
  output += `${resistIcon(analysis.resistances.lightning.status)} Lightning: ${analysis.resistances.lightning.value}%\n`;
  output += `  Chaos: ${analysis.resistances.chaos.value}% (${analysis.resistances.chaos.status})\n\n`;

  // Life Pool
  output += '**Life Pool:**\n';
  output += `Life: ${analysis.lifePool.life.toLocaleString()}\n`;
  if (analysis.lifePool.energyShield > 0) {
    output += `Energy Shield: ${analysis.lifePool.energyShield.toLocaleString()}\n`;
  }
  output += `Total: ${analysis.lifePool.total.toLocaleString()} (${analysis.lifePool.status})\n\n`;

  // Mitigation
  output += '**Physical Mitigation:**\n';
  output += `Armour: ${analysis.mitigation.armour.value.toLocaleString()} - ${analysis.mitigation.armour.effectiveness}\n`;
  output += `Evasion: ${analysis.mitigation.evasion.value.toLocaleString()} - ${analysis.mitigation.evasion.effectiveness}\n`;
  output += `Block: ${analysis.mitigation.block.value}% - ${analysis.mitigation.block.effectiveness}\n`;
  if (analysis.mitigation.spellBlock.value > 0) {
    output += `Spell Block: ${analysis.mitigation.spellBlock.value}% - ${analysis.mitigation.spellBlock.effectiveness}\n`;
  }
  output += `Overall: ${analysis.mitigation.overall}\n\n`;

  // Sustain
  output += '**Sustain:**\n';
  output += `Life Regen: ${analysis.sustain.lifeRegen.value.toFixed(1)}/sec (${analysis.sustain.lifeRegen.percentOfMax.toFixed(1)}% of max) - ${analysis.sustain.lifeRegen.status}\n`;
  if (analysis.sustain.esRecharge.value > 0) {
    output += `ES Recharge: ${analysis.sustain.esRecharge.value}/sec - ${analysis.sustain.esRecharge.status}\n`;
  }
  output += `Overall: ${analysis.sustain.overall}\n\n`;

  // Recommendations
  if (analysis.recommendations.length > 0) {
    output += '**Recommendations:**\n\n';
    for (let i = 0; i < analysis.recommendations.length; i++) {
      const rec = analysis.recommendations[i];
      const priorityIcon = {
        critical: '🚨',
        high: '⚠️',
        medium: '○',
        low: '·',
      };

      output += `${i + 1}. ${priorityIcon[rec.priority]} [${rec.priority.toUpperCase()}] ${rec.issue}\n`;
      for (const solution of rec.solutions) {
        output += `   → ${solution}\n`;
      }
      if (rec.impact) {
        output += `   Impact: ${rec.impact}\n`;
      }
      output += '\n';
    }
  } else {
    output += '**No critical issues found!** Defenses look solid.\n';
  }

  return output;
}
