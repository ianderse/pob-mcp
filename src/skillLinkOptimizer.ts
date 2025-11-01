/**
 * Skill Link Optimization and Analysis
 *
 * Analyzes skill gem setups and suggests improvements for optimal damage/utility.
 */

export interface SkillGem {
  name: string;
  level?: number;
  quality?: number;
  qualityType?: string;
  enabled?: boolean;
}

export interface SkillGroup {
  index: number;
  label?: string;
  slot?: string;
  enabled: boolean;
  isMainSkill: boolean;
  gems: SkillGem[];
  includeInFullDPS?: boolean;
}

export interface SkillLinkIssue {
  type: 'missing_link' | 'suboptimal_gem' | 'low_level' | 'no_quality' | 'link_order' | 'wrong_support';
  severity: 'high' | 'medium' | 'low';
  message: string;
  suggestion: string;
}

export interface SkillGroupAnalysis {
  group: SkillGroup;
  isValid: boolean;
  linkCount: number;
  issues: SkillLinkIssue[];
  suggestions: string[];
  expectedDamageBoost?: string;
}

export interface SkillOptimizationResult {
  summary: string;
  buildType: string;
  groupAnalyses: SkillGroupAnalysis[];
  generalSuggestions: string[];
}

/**
 * Common support gem recommendations by skill type
 */
const SUPPORT_RECOMMENDATIONS: Record<string, string[]> = {
  // Physical attack
  'physical-attack': [
    'Brutality Support',
    'Melee Physical Damage Support',
    'Impale Support',
    'Close Combat Support',
    'Multistrike Support',
    'Fortify Support',
  ],

  // Elemental attack
  'elemental-attack': [
    'Elemental Damage with Attacks Support',
    'Trinity Support',
    'Inspiration Support',
    'Elemental Focus Support',
    'Penetration Support',
  ],

  // Spell (general)
  'spell': [
    'Spell Echo Support',
    'Controlled Destruction Support',
    'Concentrated Effect Support',
    'Elemental Focus Support',
    'Awakened Spell Cascade Support',
  ],

  // DOT (damage over time)
  'dot': [
    'Efficacy Support',
    'Swift Affliction Support',
    'Deadly Ailments Support',
    'Void Manipulation Support',
    'Cruelty Support',
  ],

  // Minion
  'minion': [
    'Minion Damage Support',
    'Minion Life Support',
    'Feeding Frenzy Support',
    'Predator Support',
    'Meat Shield Support',
  ],

  // Projectile
  'projectile': [
    'Greater Multiple Projectiles Support',
    'Awakened Fork Support',
    'Chain Support',
    'Pierce Support',
    'Barrage Support',
  ],

  // Crit
  'crit': [
    'Increased Critical Strikes Support',
    'Increased Critical Damage Support',
    'Precise Technique Support',
  ],

  // Aura/Curse
  'aura': [
    'Enlighten Support',
    'Empower Support',
    'Enhance Support',
  ],
};

/**
 * Detect skill type from gem name
 */
export function detectSkillType(gemName: string): string[] {
  const name = gemName.toLowerCase();
  const types: string[] = [];

  // Active skill indicators
  if (name.includes('strike') || name.includes('slam') || name.includes('smite')) {
    types.push('attack', 'melee');
  }
  if (name.includes('shot') || name.includes('arrow') || name.includes('barrage')) {
    types.push('attack', 'projectile', 'bow');
  }
  if (name.includes('spectral') || name.includes('ethereal')) {
    types.push('attack', 'projectile');
  }
  if (name.includes('blade') && !name.includes('vortex')) {
    types.push('spell', 'projectile');
  }
  if (name.includes('arc') || name.includes('ball') || name.includes('nova')) {
    types.push('spell');
  }
  if (name.includes('aura') || name.includes('purity') || name.includes('grace')) {
    types.push('aura');
  }
  if (name.includes('curse') || name.includes('mark') || name.includes('hex')) {
    types.push('curse');
  }
  if (name.includes('golem') || name.includes('zombie') || name.includes('spectre')) {
    types.push('minion');
  }
  if (name.includes('totem')) {
    types.push('totem');
  }
  if (name.includes('trap') || name.includes('mine')) {
    types.push('trap-mine');
  }

  // Damage type
  if (name.includes('fire') || name.includes('flame') || name.includes('burn')) {
    types.push('fire');
  }
  if (name.includes('cold') || name.includes('ice') || name.includes('frost')) {
    types.push('cold');
  }
  if (name.includes('lightning') || name.includes('shock')) {
    types.push('lightning');
  }
  if (name.includes('chaos') || name.includes('poison') || name.includes('venom')) {
    types.push('chaos');
  }
  if (name.includes('physical')) {
    types.push('physical');
  }

  // Special mechanics
  if (name.includes('crit')) {
    types.push('crit');
  }
  if (name.includes('bleed') || name.includes('poison') || name.includes('ignite')) {
    types.push('dot');
  }

  return types;
}

/**
 * Check if a gem is a support gem
 */
export function isSupportGem(gemName: string): boolean {
  return gemName.toLowerCase().includes('support');
}

/**
 * Analyze a single skill group
 */
export function analyzeSkillGroup(
  group: SkillGroup,
  buildArchetype: string
): SkillGroupAnalysis {
  const analysis: SkillGroupAnalysis = {
    group,
    isValid: true,
    linkCount: group.gems.length,
    issues: [],
    suggestions: [],
  };

  if (group.gems.length === 0) {
    analysis.isValid = false;
    analysis.issues.push({
      type: 'missing_link',
      severity: 'high',
      message: 'Socket group is empty',
      suggestion: 'Add skill gems to this socket group',
    });
    return analysis;
  }

  // Find the active skill (first non-support gem)
  const activeSkill = group.gems.find((g) => !isSupportGem(g.name));
  if (!activeSkill) {
    analysis.isValid = false;
    analysis.issues.push({
      type: 'wrong_support',
      severity: 'high',
      message: 'No active skill gem found - only support gems',
      suggestion: 'Add an active skill gem to this socket group',
    });
    return analysis;
  }

  const activeSkillName = activeSkill.name;
  const skillTypes = detectSkillType(activeSkillName);
  const supports = group.gems.filter((g) => isSupportGem(g.name));

  // Check link count
  if (group.isMainSkill && analysis.linkCount < 6) {
    analysis.issues.push({
      type: 'missing_link',
      severity: analysis.linkCount < 4 ? 'high' : 'medium',
      message: `Main skill only has ${analysis.linkCount} links (optimal is 6)`,
      suggestion: 'Upgrade to a 6-link for maximum damage',
    });
  }

  // Check gem levels
  for (const gem of group.gems) {
    const level = gem.level || 1;
    if (level < 20 && !gem.name.includes('Enlighten') && !gem.name.includes('Empower')) {
      analysis.issues.push({
        type: 'low_level',
        severity: level < 15 ? 'medium' : 'low',
        message: `${gem.name} is only level ${level}`,
        suggestion: `Level ${gem.name} to 20 for maximum effect`,
      });
    }
  }

  // Check gem quality
  for (const gem of group.gems) {
    const quality = gem.quality || 0;
    if (quality < 20 && group.isMainSkill) {
      analysis.issues.push({
        type: 'no_quality',
        severity: 'low',
        message: `${gem.name} has ${quality}% quality`,
        suggestion: `Use Gemcutter's Prisms to get 20% quality`,
      });
    }
  }

  // Suggest support gems based on skill type
  const supportNames = supports.map((s) => s.name.toLowerCase());

  if (skillTypes.includes('attack')) {
    if (!supportNames.some((s) => s.includes('multistrike') || s.includes('faster attacks'))) {
      analysis.suggestions.push('Consider Multistrike or Faster Attacks Support for attack speed');
    }
  }

  if (skillTypes.includes('spell')) {
    if (!supportNames.some((s) => s.includes('spell echo') || s.includes('faster casting'))) {
      analysis.suggestions.push('Consider Spell Echo or Faster Casting Support');
    }
  }

  if (skillTypes.includes('projectile')) {
    if (!supportNames.some((s) => s.includes('gmp') || s.includes('volley') || s.includes('chain'))) {
      analysis.suggestions.push('Consider GMP, Volley, or Chain Support for clear speed');
    }
  }

  if (skillTypes.includes('crit')) {
    if (!supportNames.some((s) => s.includes('critical'))) {
      analysis.suggestions.push('Consider Increased Critical Strikes/Damage Support');
    }
  }

  if (skillTypes.includes('dot')) {
    if (!supportNames.some((s) => s.includes('efficacy') || s.includes('swift affliction'))) {
      analysis.suggestions.push('Consider Efficacy or Swift Affliction Support for DoT builds');
    }
  }

  if (skillTypes.includes('minion')) {
    if (!supportNames.some((s) => s.includes('minion damage'))) {
      analysis.suggestions.push('Add Minion Damage Support for significant DPS increase');
    }
  }

  // Check for common anti-synergies
  const hasElementalFocus = supportNames.some((s) => s.includes('elemental focus'));
  const hasAilmentSupport = supportNames.some((s) =>
    s.includes('ignite') || s.includes('freeze') || s.includes('shock') || s.includes('chill')
  );

  if (hasElementalFocus && hasAilmentSupport) {
    analysis.issues.push({
      type: 'wrong_support',
      severity: 'high',
      message: 'Elemental Focus prevents ailments, conflicting with ailment supports',
      suggestion: 'Remove either Elemental Focus or ailment-specific supports',
    });
  }

  return analysis;
}

/**
 * Analyze all skill groups
 */
export function analyzeSkillSetup(
  groups: SkillGroup[],
  buildArchetype: string
): SkillOptimizationResult {
  const groupAnalyses: SkillGroupAnalysis[] = [];
  const generalSuggestions: string[] = [];

  for (const group of groups) {
    if (group.gems.length === 0 && !group.isMainSkill) {
      continue; // Skip empty non-main groups
    }
    const analysis = analyzeSkillGroup(group, buildArchetype);
    groupAnalyses.push(analysis);
  }

  // General suggestions
  const mainSkill = groupAnalyses.find((g) => g.group.isMainSkill);
  if (!mainSkill) {
    generalSuggestions.push('⚠️ No main skill selected - set a main skill for accurate DPS calculations');
  } else if (mainSkill.linkCount < 6) {
    generalSuggestions.push(
      `Main skill has ${mainSkill.linkCount} links - upgrade to 6-link for ~${
        Math.pow(1.4, 6 - mainSkill.linkCount) * 100 - 100
      }% more damage`
    );
  }

  // Check for auras
  const hasAuras = groups.some((g) =>
    g.gems.some((gem) => {
      const types = detectSkillType(gem.name);
      return types.includes('aura');
    })
  );
  if (!hasAuras && !buildArchetype.includes('minion')) {
    generalSuggestions.push('Consider adding auras for permanent buffs (e.g., Determination, Grace, Precision)');
  }

  const totalIssues = groupAnalyses.reduce((sum, g) => sum + g.issues.length, 0);

  return {
    summary: `Analyzed ${groupAnalyses.length} skill groups with ${totalIssues} issue${
      totalIssues !== 1 ? 's' : ''
    }`,
    buildType: buildArchetype,
    groupAnalyses,
    generalSuggestions,
  };
}

/**
 * Format skill optimization results
 */
export function formatSkillOptimization(result: SkillOptimizationResult): string {
  let output = '=== Skill Link Optimization ===\n\n';

  output += `Build Type: ${result.buildType}\n`;
  output += `${result.summary}\n\n`;

  // General suggestions
  if (result.generalSuggestions.length > 0) {
    output += '=== General Recommendations ===\n';
    for (const suggestion of result.generalSuggestions) {
      output += `${suggestion}\n`;
    }
    output += '\n';
  }

  // Analyze each group
  for (const analysis of result.groupAnalyses) {
    const group = analysis.group;
    output += `**Group ${group.index}${group.isMainSkill ? ' (MAIN)' : ''}**\n`;
    if (group.label) {
      output += `  Label: ${group.label}\n`;
    }
    output += `  Links: ${analysis.linkCount}\n`;
    output += `  Gems: ${group.gems.map((g) => g.name).join(', ')}\n`;

    if (analysis.issues.length > 0) {
      output += `  Issues:\n`;
      for (const issue of analysis.issues) {
        const icon = issue.severity === 'high' ? '⚠️' : issue.severity === 'medium' ? '⚡' : 'ℹ️';
        output += `    ${icon} ${issue.message}\n`;
        output += `       → ${issue.suggestion}\n`;
      }
    }

    if (analysis.suggestions.length > 0) {
      output += `  Suggestions:\n`;
      for (const suggestion of analysis.suggestions) {
        output += `    → ${suggestion}\n`;
      }
    }

    output += '\n';
  }

  return output;
}
