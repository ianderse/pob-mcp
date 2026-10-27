/**
 * Defensive Analyzer for Path of Building builds
 *
 * Evaluates builds against the three-layer defensive framework:
 *   1. Avoidance  — not getting hit or not taking full hits
 *      (evasion, spell suppression, dodge, block)
 *   2. Mitigation — reducing damage when you do get hit
 *      (armour/PDR, endurance charges, elemental resists)
 *   3. Recovery   — healing back up after damage
 *      (life/ES regen, leech, gain on hit, ES recharge)
 *
 * A good build has at least 2 of these layers.
 * An exceptional build has all 3, with strong values in each.
 */

export interface DefensiveAnalysis {
  resistances: ResistanceAnalysis;
  lifePool: LifePoolAnalysis;
  avoidance: AvoidanceAnalysis;
  mitigation: MitigationAnalysis;
  sustain: SustainAnalysis;
  recommendations: Recommendation[];
  overallScore: 'excellent' | 'good' | 'fair' | 'poor' | 'critical';
  defensiveLayerCount: number;
  defensiveLayerSummary: string[];
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
  ehp: number;
  status: 'excellent' | 'good' | 'adequate' | 'low' | 'critical';
  recommendation?: string;
}

export interface AvoidanceAnalysis {
  spellSuppression: number;
  dodge: number;
  spellDodge: number;
  block: number;
  evasionRating: number;
  estimatedEvadeChance: number;
  hasSignificantAvoidance: boolean;
  summary: string;
}

export interface MitigationAnalysis {
  armour: { value: number; effectiveness: string };
  evasion: { value: number; effectiveness: string };
  block: { value: number; effectiveness: string };
  spellBlock: { value: number; effectiveness: string };
  physicalDamageReduction: number;
  enduranceCharges: number;
  overall: 'excellent' | 'good' | 'fair' | 'poor' | 'none';
}

export interface SustainAnalysis {
  lifeRegen: { value: number; percentOfMax: number; status: string };
  manaRegen: { value: number; status: string };
  esRecharge: { value: number; status: string };
  hasLeech: boolean;
  overall: 'excellent' | 'good' | 'adequate' | 'poor';
}

export interface Recommendation {
  priority: 'critical' | 'high' | 'medium' | 'low';
  category: 'resistance' | 'life' | 'mitigation' | 'sustain' | 'avoidance' | 'layers';
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
  const avoidance = analyzeAvoidance(stats);
  const mitigation = analyzeMitigation(stats);
  const sustain = analyzeSustain(stats);

  const recommendations: Recommendation[] = [];
  recommendations.push(...generateResistanceRecommendations(resistances));
  recommendations.push(...generateLifePoolRecommendations(lifePool));
  recommendations.push(...generateAvoidanceRecommendations(avoidance));
  recommendations.push(...generateMitigationRecommendations(mitigation, stats));
  recommendations.push(...generateSustainRecommendations(sustain));

  // Evaluate defensive layers
  const avoidanceLayer = avoidance.hasSignificantAvoidance;
  const mitigationLayer = mitigation.overall !== 'none' && mitigation.overall !== 'poor';
  const recoveryLayer = sustain.overall !== 'poor';

  const defensiveLayerCount = [avoidanceLayer, mitigationLayer, recoveryLayer].filter(Boolean).length;
  const defensiveLayerSummary: string[] = [];

  defensiveLayerSummary.push(
    `${avoidanceLayer ? '✓' : '✗'} Avoidance: ${avoidance.summary}`
  );
  defensiveLayerSummary.push(
    `${mitigationLayer ? '✓' : '✗'} Mitigation: ${mitigation.overall} (armour ${mitigation.armour.value.toLocaleString()}, PDR ${mitigation.physicalDamageReduction}%)`
  );
  defensiveLayerSummary.push(
    `${recoveryLayer ? '✓' : '✗'} Recovery: ${sustain.overall} (regen ${sustain.lifeRegen.percentOfMax.toFixed(1)}%/s${sustain.hasLeech ? ', has leech' : ''})`
  );

  if (defensiveLayerCount < 2) {
    recommendations.push({
      priority: 'high',
      category: 'layers',
      issue: `Only ${defensiveLayerCount} of 3 defensive layers active (avoidance / mitigation / recovery)`,
      solutions: [
        'Avoidance: add evasion, spell suppression (100% chance cap), dodge, or block',
        'Mitigation: add armour (Determination aura), endurance charges, or physical reduction',
        'Recovery: add life regeneration, life leech, or gain-on-hit',
      ],
      impact: 'Builds with only one defensive layer are fragile — a single mechanic bypass kills you',
    });
  }

  recommendations.sort((a, b) => {
    const order = { critical: 0, high: 1, medium: 2, low: 3 };
    return order[a.priority] - order[b.priority];
  });

  const overallScore = calculateOverallScore(resistances, lifePool, mitigation, sustain, defensiveLayerCount);

  return {
    resistances,
    lifePool,
    avoidance,
    mitigation,
    sustain,
    recommendations,
    overallScore,
    defensiveLayerCount,
    defensiveLayerSummary,
  };
}

function analyzeResistances(stats: Record<string, any>): ResistanceAnalysis {
  const getStat = (key: string): number => {
    if (stats[key] !== undefined) return parseFloat(stats[key]) || 0;
    if (stats[`Player${key}`] !== undefined) return parseFloat(stats[`Player${key}`]) || 0;
    return 0;
  };

  const fire = getStat('FireResist');
  const cold = getStat('ColdResist');
  const lightning = getStat('LightningResist');
  const chaos = getStat('ChaosResist');

  const getResistStatus = (value: number) => {
    if (value > 75) return 'overcapped' as const;
    if (value >= 75) return 'capped' as const;
    return 'uncapped' as const;
  };

  const getChaosStatus = (value: number) => {
    if (value >= 60) return 'good' as const;
    if (value >= 0) return 'low' as const;
    return 'dangerous' as const;
  };

  return {
    fire: { value: fire, status: getResistStatus(fire) },
    cold: { value: cold, status: getResistStatus(cold) },
    lightning: { value: lightning, status: getResistStatus(lightning) },
    chaos: { value: chaos, status: getChaosStatus(chaos) },
    allCapped: fire >= 75 && cold >= 75 && lightning >= 75,
  };
}

function analyzeLifePool(stats: Record<string, any>): LifePoolAnalysis {
  const getStat = (key: string): number => {
    if (stats[key] !== undefined) return parseFloat(stats[key]) || 0;
    if (stats[`Player${key}`] !== undefined) return parseFloat(stats[`Player${key}`]) || 0;
    return 0;
  };

  const life = getStat('Life');
  const es = getStat('EnergyShield');
  const total = life + es;

  // Use TotalEHP from PoB if available, otherwise estimate from PDR
  let ehp = getStat('TotalEHP');
  if (!ehp || ehp <= total) {
    const pdr = getStat('PhysicalDamageReduction');
    // Approximate EHP: raw HP / (1 - mitigation%), capped at 5× total
    if (pdr > 0 && pdr < 100) {
      ehp = Math.round(total / (1 - pdr / 100));
    } else {
      ehp = total;
    }
  }

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
    recommendation = 'Life/ES is quite low — prioritize defensive nodes';
  } else {
    status = 'critical';
    recommendation = 'CRITICAL: Life/ES is dangerously low!';
  }

  return { life, energyShield: es, total, ehp, status, recommendation };
}

/**
 * Analyze avoidance layer:
 *   - Spell suppression (chance caps at 100%)
 *   - Evasion (gives % chance to evade attacks)
 *   - Dodge (attack/spell dodge)
 *   - Block
 */
function analyzeAvoidance(stats: Record<string, any>): AvoidanceAnalysis {
  const getStat = (key: string): number => {
    if (stats[key] !== undefined) return parseFloat(stats[key]) || 0;
    if (stats[`Player${key}`] !== undefined) return parseFloat(stats[`Player${key}`]) || 0;
    return 0;
  };

  const spellSuppression = getStat('EffectiveSpellSuppressionChance') || getStat('SpellSuppressionChance');
  const dodge = getStat('DodgeChance') || getStat('AttackDodgeChance');
  const spellDodge = getStat('SpellDodgeChance');
  const block = getStat('BlockChance');
  const evasionRating = getStat('Evasion');

  // Rough evade chance estimate: evasion / (evasion + attacker_accuracy)
  // At high tier content, attacker accuracy is roughly 5000–10000
  // This is a simplified estimate — PoB computes this more precisely
  const estimatedEvadeChance = evasionRating > 0
    ? Math.min(75, Math.round((evasionRating / (evasionRating + 7500)) * 100))
    : 0;

  const parts: string[] = [];
  if (spellSuppression >= 100) parts.push(`spell suppression ${spellSuppression}%`);
  else if (spellSuppression > 0) parts.push(`partial suppression ${spellSuppression}%`);
  if (estimatedEvadeChance >= 20) parts.push(`~${estimatedEvadeChance}% evade`);
  if (dodge >= 20) parts.push(`${dodge}% dodge`);
  if (spellDodge >= 20) parts.push(`${spellDodge}% spell dodge`);
  if (block >= 30) parts.push(`${block}% block`);

  // A meaningful avoidance layer means at least one solid avoidance mechanic:
  //   - 50% spell suppression (a meaningful partial layer, not the cap)
  //   - OR evasion giving ≥30% evade chance
  //   - OR dodge/spell dodge ≥30%
  //   - OR block ≥30%
  const hasSignificantAvoidance =
    spellSuppression >= 50 ||
    estimatedEvadeChance >= 30 ||
    dodge >= 30 ||
    spellDodge >= 30 ||
    block >= 30;

  const summary = parts.length > 0 ? parts.join(', ') : 'none';

  return {
    spellSuppression,
    dodge,
    spellDodge,
    block,
    evasionRating,
    estimatedEvadeChance,
    hasSignificantAvoidance,
    summary,
  };
}

function analyzeMitigation(stats: Record<string, any>): MitigationAnalysis {
  const getStat = (key: string): number => {
    if (stats[key] !== undefined) return parseFloat(stats[key]) || 0;
    if (stats[`Player${key}`] !== undefined) return parseFloat(stats[`Player${key}`]) || 0;
    return 0;
  };

  const armour = getStat('Armour');
  const evasion = getStat('Evasion');
  const block = getStat('BlockChance');
  const spellBlock = getStat('SpellBlockChance');
  const physicalDamageReduction = Math.round(getStat('PhysicalDamageReduction'));
  const enduranceCharges = Math.round(getStat('EnduranceChargesMax') || 0);

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

  // Mitigation layer: meaningful if armour provides significant PDR, or endurance charges, or high block
  let overall: MitigationAnalysis['overall'];
  const hasStrongMitigation = physicalDamageReduction >= 30 || enduranceCharges >= 3 || block >= 40;
  const hasModerateMitigation = physicalDamageReduction >= 15 || armour >= 10000 || evasion >= 10000 || block >= 20;

  if (hasStrongMitigation && (armour >= 15000 || block >= 40)) {
    overall = 'excellent';
  } else if (hasStrongMitigation || (armour >= 15000 && block >= 20)) {
    overall = 'good';
  } else if (hasModerateMitigation) {
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
    physicalDamageReduction,
    enduranceCharges,
    overall,
  };
}

function analyzeSustain(stats: Record<string, any>): SustainAnalysis {
  const getStat = (key: string): number => {
    if (stats[key] !== undefined) return parseFloat(stats[key]) || 0;
    if (stats[`Player${key}`] !== undefined) return parseFloat(stats[`Player${key}`]) || 0;
    return 0;
  };

  const lifeRegen = getStat('LifeRegen');
  const life = getStat('Life') || 1;
  const manaRegen = getStat('ManaRegen');
  const esRecharge = getStat('ESRecharge');
  const lifeLeechRate = getStat('LifeLeechGainRate');
  const hasLeech = lifeLeechRate > 0;

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

  // Recovery layer: meaningful if regen ≥1% or has leech or ES recharge
  let overall: SustainAnalysis['overall'];
  if (lifeRegenPercent >= 3 || esRecharge >= 800 || (hasLeech && lifeRegenPercent >= 1)) {
    overall = 'excellent';
  } else if (lifeRegenPercent >= 1.5 || esRecharge >= 400 || hasLeech) {
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
    hasLeech,
    overall,
  };
}

function generateResistanceRecommendations(analysis: ResistanceAnalysis): Recommendation[] {
  const recs: Recommendation[] = [];
  const uncapped: string[] = [];
  if (analysis.fire.status === 'uncapped') uncapped.push(`Fire (${analysis.fire.value}%)`);
  if (analysis.cold.status === 'uncapped') uncapped.push(`Cold (${analysis.cold.value}%)`);
  if (analysis.lightning.status === 'uncapped') uncapped.push(`Lightning (${analysis.lightning.value}%)`);

  if (uncapped.length > 0) {
    const needed = uncapped.map((r) => {
      const match = r.match(/\((-?\d+)%\)/);
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

  if (analysis.chaos.status === 'dangerous') {
    recs.push({
      priority: 'high',
      category: 'resistance',
      issue: `Chaos Resistance: ${analysis.chaos.value}% (negative)`,
      solutions: [
        'Allocate chaos resist nodes if convenient',
        'Upgrade gear with chaos resist when possible',
        'Amethyst flask can help in chaos damage zones',
      ],
      impact: 'Negative chaos resist amplifies chaos damage taken',
    });
  } else if (analysis.chaos.status === 'low') {
    recs.push({
      priority: 'low',
      category: 'resistance',
      issue: `Chaos Resistance: ${analysis.chaos.value}% (could be better)`,
      solutions: ['Consider upgrading when convenient', '30–60% chaos resist is comfortable'],
    });
  }

  return recs;
}

function generateLifePoolRecommendations(analysis: LifePoolAnalysis): Recommendation[] {
  const recs: Recommendation[] = [];
  if (analysis.status === 'critical' || analysis.status === 'low') {
    recs.push({
      priority: analysis.status === 'critical' ? 'critical' : 'high',
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

function generateAvoidanceRecommendations(analysis: AvoidanceAnalysis): Recommendation[] {
  const recs: Recommendation[] = [];
  if (!analysis.hasSignificantAvoidance) {
    recs.push({
      priority: 'medium',
      category: 'avoidance',
      issue: 'No significant avoidance layer (no evasion, spell suppression, dodge, or block)',
      solutions: [
        'Evasion: equip evasion-based armour and run Grace aura',
        'Spell Suppression: reach 100% chance to reliably reduce spell-hit damage — available on tree (Shadow/Ranger side)',
        'Block: use a shield or staff and invest in block nodes',
        'Dodge: Acrobatics keystone gives 30% attack/spell dodge (but disables block)',
      ],
      impact: 'Without avoidance, every hit lands at full effect — requires pure mitigation + recovery to survive',
    });
  } else if (analysis.spellSuppression > 0 && analysis.spellSuppression < 100) {
    recs.push({
      priority: 'low',
      category: 'avoidance',
      issue: `Spell suppression is ${analysis.spellSuppression}% — not at 100% chance cap`,
      solutions: [
        'Cap spell suppression chance at 100% for reliable suppression',
        'Additional suppression nodes or gear can reach the cap',
      ],
    });
  }
  return recs;
}

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
        'Run Determination (armour) or Grace (evasion) aura',
        'Look for armour/evasion on gear',
        'Endurance charges provide flat physical mitigation (4% per charge)',
        'Consider block if using shield or staff',
      ],
      impact: 'No mitigation = taking full physical damage from hits',
    });
  } else if (analysis.overall === 'fair') {
    recs.push({
      priority: 'medium',
      category: 'mitigation',
      issue: 'Physical mitigation could be improved',
      solutions: [
        'Stack more of your chosen defense (armour, evasion, or block)',
        'Consider hybrid defenses (e.g., armour + block)',
        'Quality on armour pieces adds significant defense',
      ],
    });
  }
  return recs;
}

function generateSustainRecommendations(analysis: SustainAnalysis): Recommendation[] {
  const recs: Recommendation[] = [];
  if (analysis.overall === 'poor') {
    recs.push({
      priority: 'medium',
      category: 'sustain',
      issue: 'No sustain mechanism (no regen, leech, or recharge)',
      solutions: [
        'Life builds: Allocate regen nodes (Vitality aura, life regen notables)',
        'Add life leech via skill gems (Warlord\'s Mark, leech support) or tree',
        'ES builds: Ensure ES recharge is working (avoid constant hits or use Wicked Ward)',
        'Gain on hit provides reliable recovery for fast-hitting builds',
        'Flasks help but are not a complete sustain solution for endgame bossing',
      ],
      impact: 'Without sustain, chip damage and DoTs are lethal; flask reliance fails on "no regen" maps',
    });
  }
  return recs;
}

function calculateOverallScore(
  resistances: ResistanceAnalysis,
  lifePool: LifePoolAnalysis,
  mitigation: MitigationAnalysis,
  sustain: SustainAnalysis,
  defensiveLayerCount: number
): DefensiveAnalysis['overallScore'] {
  if (!resistances.allCapped || lifePool.status === 'critical') {
    return 'critical';
  }

  let issues = 0;
  if (lifePool.status === 'low') issues += 2;
  if (lifePool.status === 'adequate') issues += 1;
  if (mitigation.overall === 'none' || mitigation.overall === 'poor') issues += 2;
  if (mitigation.overall === 'fair') issues += 1;
  if (sustain.overall === 'poor') issues += 2;
  if (sustain.overall === 'adequate') issues += 1;
  if (resistances.chaos.status === 'dangerous') issues += 1;
  if (defensiveLayerCount < 2) issues += 2;
  if (defensiveLayerCount < 3) issues += 1;

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

  const scoreEmoji: Record<string, string> = {
    excellent: '✅',
    good: '✓',
    fair: '⚠️',
    poor: '⚠️',
    critical: '🚨',
  };
  output += `Overall: ${scoreEmoji[analysis.overallScore]} ${analysis.overallScore.toUpperCase()}\n`;
  output += `EHP: ${analysis.lifePool.ehp.toLocaleString()} (effective HP including mitigation)\n\n`;

  // Defensive Layers summary
  output += `**Defensive Layers: ${analysis.defensiveLayerCount}/3**\n`;
  for (const line of analysis.defensiveLayerSummary) {
    output += `  ${line}\n`;
  }
  output += '\n';

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

  // Avoidance
  output += '**Avoidance Layer:**\n';
  if (analysis.avoidance.spellSuppression > 0) {
    const suppIcon = analysis.avoidance.spellSuppression >= 100 ? '✓' : '⚠';
    output += `${suppIcon} Spell Suppression: ${analysis.avoidance.spellSuppression}%${analysis.avoidance.spellSuppression >= 100 ? ' (capped)' : ' (below 100% chance cap)'}\n`;
  }
  if (analysis.avoidance.estimatedEvadeChance > 0) {
    output += `  Evasion: ${analysis.avoidance.evasionRating.toLocaleString()} (~${analysis.avoidance.estimatedEvadeChance}% evade)\n`;
  }
  if (analysis.avoidance.dodge > 0) {
    output += `  Dodge: ${analysis.avoidance.dodge}%\n`;
  }
  if (analysis.avoidance.spellDodge > 0) {
    output += `  Spell Dodge: ${analysis.avoidance.spellDodge}%\n`;
  }
  if (analysis.avoidance.block > 0) {
    output += `  Block: ${analysis.avoidance.block}%\n`;
  }
  if (!analysis.avoidance.hasSignificantAvoidance) {
    output += `  ⚠ No significant avoidance — all hits land at full effect\n`;
  }
  output += '\n';

  // Mitigation
  output += '**Mitigation Layer:**\n';
  output += `Armour: ${analysis.mitigation.armour.value.toLocaleString()} — ${analysis.mitigation.armour.effectiveness}\n`;
  if (analysis.mitigation.physicalDamageReduction > 0) {
    output += `Physical Damage Reduction: ${analysis.mitigation.physicalDamageReduction}%\n`;
  }
  if (analysis.mitigation.enduranceCharges > 0) {
    output += `Endurance Charges: ${analysis.mitigation.enduranceCharges} (${analysis.mitigation.enduranceCharges * 4}% phys reduction)\n`;
  }
  output += `Block: ${analysis.mitigation.block.value}% — ${analysis.mitigation.block.effectiveness}\n`;
  if (analysis.mitigation.spellBlock.value > 0) {
    output += `Spell Block: ${analysis.mitigation.spellBlock.value}% — ${analysis.mitigation.spellBlock.effectiveness}\n`;
  }
  output += `Overall: ${analysis.mitigation.overall}\n\n`;

  // Recovery (Sustain)
  output += '**Recovery Layer:**\n';
  output += `Life Regen: ${analysis.sustain.lifeRegen.value.toFixed(1)}/s (${analysis.sustain.lifeRegen.percentOfMax.toFixed(1)}% of max) — ${analysis.sustain.lifeRegen.status}\n`;
  if (analysis.sustain.hasLeech) {
    output += `Life Leech: active\n`;
  }
  if (analysis.sustain.esRecharge.value > 0) {
    output += `ES Recharge: ${analysis.sustain.esRecharge.value}/s — ${analysis.sustain.esRecharge.status}\n`;
  }
  output += `Overall: ${analysis.sustain.overall}\n\n`;

  // Recommendations
  if (analysis.recommendations.length > 0) {
    output += '**Recommendations:**\n\n';
    for (let i = 0; i < analysis.recommendations.length; i++) {
      const rec = analysis.recommendations[i];
      const priorityIcon: Record<string, string> = {
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
