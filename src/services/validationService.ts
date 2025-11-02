import type { PoBBuild, BuildValidation, ValidationIssue, FlaskAnalysis } from "../types.js";

export class ValidationService {
  /**
   * Validate a complete build and return all issues found
   *
   * @param build - Build data from XML
   * @param flaskAnalysis - Flask analysis (optional)
   * @param luaStats - Stats from Lua bridge (optional, more accurate)
   */
  validateBuild(
    build: PoBBuild,
    flaskAnalysis: FlaskAnalysis | null = null,
    luaStats?: any
  ): BuildValidation {
    const criticalIssues: ValidationIssue[] = [];
    const warnings: ValidationIssue[] = [];
    const recommendations: ValidationIssue[] = [];

    // Prefer Lua stats, fall back to XML stats
    const stats = luaStats || this.extractStats(build);

    // Run validation rules
    this.validateResistances(stats, criticalIssues, warnings);
    this.validateDefenses(stats, build, criticalIssues, warnings);
    this.validateMana(stats, build, criticalIssues, warnings, recommendations);
    this.validateAccuracy(stats, build, criticalIssues, warnings);
    this.validateImmunities(flaskAnalysis, criticalIssues, warnings, recommendations);

    // Calculate overall score
    const overallScore = this.calculateScore(criticalIssues, warnings, recommendations);
    const isValid = criticalIssues.length === 0;

    // Generate summary
    const summary = this.generateSummary(overallScore, criticalIssues, warnings);

    return {
      isValid,
      overallScore,
      criticalIssues,
      warnings,
      recommendations,
      summary,
    };
  }

  private extractStats(build: PoBBuild): Map<string, number> {
    const stats = new Map<string, number>();

    if (!build.Build?.PlayerStat) {
      return stats;
    }

    const statArray = Array.isArray(build.Build.PlayerStat)
      ? build.Build.PlayerStat
      : [build.Build.PlayerStat];

    for (const stat of statArray) {
      const value = parseFloat(stat.value);
      if (!isNaN(value)) {
        stats.set(stat.stat, value);
      }
    }

    return stats;
  }

  private validateResistances(
    stats: any,
    criticalIssues: ValidationIssue[],
    warnings: ValidationIssue[]
  ): void {
    // Get resist value (works with both Lua stats object and Map from XML)
    const getResist = (key: string): number => {
      return typeof stats.get === 'function' ? (stats.get(key) || 0) : (stats[key] || 0);
    };

    const resistCap = 75;
    const resistances = [
      { key: 'FireResist', name: 'Fire' },
      { key: 'ColdResist', name: 'Cold' },
      { key: 'LightningResist', name: 'Lightning' },
      { key: 'ChaosResist', name: 'Chaos' },
    ];

    for (const { key, name } of resistances) {
      const value = getResist(key);

      if (key !== 'ChaosResist' && value < resistCap) {
        criticalIssues.push(this.createResistIssue(name, value, resistCap));
      } else if (key === 'ChaosResist' && value < 0) {
        warnings.push(this.createChaosResistWarning(value));
      }
    }
  }

  private createResistIssue(name: string, current: number, cap: number): ValidationIssue {
    return {
      severity: 'critical',
      category: 'resistances',
      title: `${name} Resistance Too Low`,
      description: `${name} resistance is ${current}%. You need ${cap}% for endgame content.`,
      currentValue: current,
      recommendedValue: cap,
      suggestions: [
        `Craft +${cap - current}% ${name} Resistance on gear with open suffix`,
        `Use a ${name.toLowerCase()} resistance flask temporarily`,
        `Allocate resistance nodes on the passive tree`,
        `Upgrade jewelry pieces - rings and amulets can have high resistance rolls`,
      ],
      location: 'Gear',
    };
  }

  private createChaosResistWarning(value: number): ValidationIssue {
    return {
      severity: 'warning',
      category: 'resistances',
      title: 'Negative Chaos Resistance',
      description: `Chaos resistance is ${value}%. Negative chaos resist makes you take more chaos damage.`,
      currentValue: value,
      recommendedValue: 0,
      suggestions: [
        `Craft chaos resistance on gear`,
        `Use an Amethyst Flask for temporary chaos resistance`,
        `Consider taking the "Crystal Skin" notable on the tree (+15% chaos res)`,
      ],
      location: 'Gear',
    };
  }

  private validateDefenses(
    stats: any,
    build: PoBBuild,
    criticalIssues: ValidationIssue[],
    warnings: ValidationIssue[]
  ): void {
    // Get defense stats (works with both Lua stats object and Map from XML)
    const getDefense = (key: string): number => {
      return typeof stats.get === 'function' ? (stats.get(key) || 0) : (stats[key] || 0);
    };

    const life = getDefense('Life');
    const es = getDefense('EnergyShield');
    const level = parseInt(build.Build?.level || '0', 10);

    // Determine if this is a life or ES build
    const isESBuild = es > life;
    const effectiveHP = isESBuild ? es : life;

    // Expected HP by level (rough guidelines)
    let expectedHP = 3000; // Base expectation
    if (level >= 80) expectedHP = 4500;
    if (level >= 90) expectedHP = 5500;
    if (level >= 95) expectedHP = 6000;

    if (effectiveHP < expectedHP) {
      const hpType = isESBuild ? 'Energy Shield' : 'Life';
      const deficit = expectedHP - effectiveHP;

      criticalIssues.push({
        severity: 'critical',
        category: 'defenses',
        title: `${hpType} Pool Too Low`,
        description: `${hpType} is ${effectiveHP.toFixed(0)} at level ${level}. Expected at least ${expectedHP} for endgame content. You're ${deficit.toFixed(0)} ${hpType.toLowerCase()} short.`,
        currentValue: effectiveHP,
        recommendedValue: expectedHP,
        suggestions: isESBuild
          ? [
              `Increase %ES on gear (chest, shield)`,
              `Allocate more ES nodes on the passive tree`,
              `Consider using a Discipline aura`,
              `Upgrade your chest piece to a higher base ES armor`,
            ]
          : [
              `Look for nearby life nodes on the passive tree`,
              `Add +maximum life to jewelry (rings, amulets, belt)`,
              `Increase %maximum life from gear and tree`,
              `Consider the Scion life wheel if nearby (+24% life)`,
            ],
        location: isESBuild ? 'Gear & Tree' : 'Gear & Tree',
      });
    } else if (effectiveHP < expectedHP * 1.2) {
      // Within 20% of expected - give a warning
      const hpType = isESBuild ? 'Energy Shield' : 'Life';
      warnings.push({
        severity: 'warning',
        category: 'defenses',
        title: `${hpType} Pool Marginal`,
        description: `${hpType} is ${effectiveHP.toFixed(0)}. This is barely adequate for level ${level}. Consider increasing it for safety.`,
        currentValue: effectiveHP,
        recommendedValue: expectedHP * 1.2,
        suggestions: [
          `Add more ${hpType.toLowerCase()} to gear`,
          `Look for nearby ${hpType.toLowerCase()} nodes on the tree`,
        ],
        location: 'Gear & Tree',
      });
    }
  }

  private validateMana(
    stats: any,
    build: PoBBuild,
    criticalIssues: ValidationIssue[],
    warnings: ValidationIssue[],
    recommendations: ValidationIssue[]
  ): void {
    // Get mana stats (works with both Lua stats object and Map from XML)
    const getMana = (key: string): number => {
      return typeof stats.get === 'function' ? (stats.get(key) || 0) : (stats[key] || 0);
    };

    const mana = getMana('Mana');
    const manaUnreserved = getMana('ManaUnreserved');
    const manaRegen = getMana('ManaRegen');

    // Skip if no mana data available
    if (mana === 0 && manaUnreserved === 0) {
      return;
    }

    // Check unreserved mana
    if (manaUnreserved < 50) {
      criticalIssues.push({
        severity: 'critical',
        category: 'mana',
        title: 'Insufficient Unreserved Mana',
        description: `Only ${manaUnreserved.toFixed(0)} unreserved mana. You need at least 50 to cast most skills.`,
        currentValue: manaUnreserved,
        recommendedValue: 100,
        suggestions: [
          'Reduce aura reservation',
          'Add Enlighten Support to aura links',
          'Use -mana cost crafts on rings/amulet',
          'Consider Elreon -mana cost crafted jewelry',
        ],
        location: 'Gear & Skills',
      });
    } else if (manaUnreserved < 100) {
      warnings.push({
        severity: 'warning',
        category: 'mana',
        title: 'Low Unreserved Mana',
        description: `${manaUnreserved.toFixed(0)} unreserved mana is low. You may struggle with mana-intensive skills.`,
        currentValue: manaUnreserved,
        recommendedValue: 150,
        suggestions: [
          'Reduce aura reservation slightly',
          'Add -mana cost crafts',
          'Consider increasing mana pool or regeneration',
        ],
        location: 'Gear & Skills',
      });
    }

    // Check mana regeneration for caster builds (if mana costs are significant)
    if (manaRegen > 0 && manaRegen < 50 && manaUnreserved > 100) {
      recommendations.push({
        severity: 'info',
        category: 'mana',
        title: 'Low Mana Regeneration',
        description: `${manaRegen.toFixed(1)} mana/s regeneration may be insufficient for sustained casting.`,
        currentValue: manaRegen,
        recommendedValue: 100,
        suggestions: [
          'Enable Clarity aura',
          'Allocate mana regeneration nodes',
          'Add mana regeneration to gear',
          'Consider a mana flask for long fights',
        ],
        location: 'Gear & Tree',
      });
    }
  }

  private validateAccuracy(
    stats: any,
    build: PoBBuild,
    criticalIssues: ValidationIssue[],
    warnings: ValidationIssue[]
  ): void {
    // Get accuracy stats (works with both Lua stats object and Map from XML)
    const getAccuracy = (key: string): number => {
      return typeof stats.get === 'function' ? (stats.get(key) || 0) : (stats[key] || 0);
    };

    const hitChance = getAccuracy('HitChance');
    const accuracy = getAccuracy('Accuracy');

    // Skip if no accuracy data (likely a spell build)
    if (hitChance === 0 && accuracy === 0) {
      return;
    }

    // Check hit chance for attack builds
    if (hitChance > 0) {
      if (hitChance < 85) {
        criticalIssues.push({
          severity: 'critical',
          category: 'accuracy',
          title: 'Very Low Hit Chance',
          description: `${hitChance.toFixed(1)}% chance to hit means you miss ${(100 - hitChance).toFixed(1)}% of attacks. This severely reduces your DPS.`,
          currentValue: hitChance,
          recommendedValue: 95,
          suggestions: [
            'Add accuracy to gear (gloves, helmet, jewelry)',
            'Enable Precision aura',
            'Allocate accuracy nodes on the passive tree',
            'Consider using a "Hits can\'t be Evaded" weapon',
          ],
          location: 'Gear & Tree',
        });
      } else if (hitChance < 90) {
        warnings.push({
          severity: 'warning',
          category: 'accuracy',
          title: 'Low Hit Chance',
          description: `${hitChance.toFixed(1)}% chance to hit is below the recommended 95%+.`,
          currentValue: hitChance,
          recommendedValue: 95,
          suggestions: [
            'Add more accuracy to gear',
            'Enable or level up Precision aura',
            'Allocate nearby accuracy nodes',
          ],
          location: 'Gear & Tree',
        });
      }
    }
  }

  private validateImmunities(
    flaskAnalysis: FlaskAnalysis | null,
    criticalIssues: ValidationIssue[],
    warnings: ValidationIssue[],
    recommendations: ValidationIssue[]
  ): void {
    if (!flaskAnalysis) {
      return;
    }

    // Check for critical immunities
    if (!flaskAnalysis.hasBleedImmunity) {
      warnings.push({
        severity: 'warning',
        category: 'immunities',
        title: 'No Bleed Immunity',
        description: 'You have no way to remove bleeding. This is dangerous as bleeds can kill you rapidly while moving.',
        suggestions: [
          `Add a "of Staunching" suffix to your life flask`,
          `Use a flask with "Grants Immunity to Bleeding"`,
          `Corrupted Blood immunity can come from jewel corruptions`,
        ],
        location: 'Flasks',
      });
    }

    if (!flaskAnalysis.hasFreezeImmunity) {
      warnings.push({
        severity: 'warning',
        category: 'immunities',
        title: 'No Freeze Immunity',
        description: 'You have no freeze immunity. Getting frozen leaves you unable to act and is often fatal.',
        suggestions: [
          `Add a "of Heat" suffix to a utility flask`,
          `Use an Aquamarine Flask for freeze immunity`,
          `Consider the Brine King pantheon upgrade`,
          `Some items grant freeze immunity (e.g., unique boots)`,
        ],
        location: 'Flasks',
      });
    }

    // Poison immunity is less critical but still recommended
    if (!flaskAnalysis.hasPoisonImmunity) {
      recommendations.push({
        severity: 'info',
        category: 'immunities',
        title: 'Consider Poison Immunity',
        description: 'Poison immunity is useful for certain map mods and enemy types.',
        suggestions: [
          `Add a "of Curing" suffix to a utility flask`,
          `Poison immunity is less critical than freeze/bleed`,
        ],
        location: 'Flasks',
      });
    }
  }

  private calculateScore(
    criticalIssues: ValidationIssue[],
    warnings: ValidationIssue[],
    recommendations: ValidationIssue[]
  ): number {
    // Start at 10 (perfect)
    let score = 10;

    // Each critical issue removes 3 points
    score -= criticalIssues.length * 3;

    // Each warning removes 1 point
    score -= warnings.length * 1;

    // Each recommendation removes 0.25 points
    score -= recommendations.length * 0.25;

    // Clamp to 0-10
    return Math.max(0, Math.min(10, score));
  }

  private generateSummary(
    score: number,
    criticalIssues: ValidationIssue[],
    warnings: ValidationIssue[]
  ): string {
    if (score >= 9) {
      return 'Build is in excellent shape! Only minor improvements possible.';
    } else if (score >= 7) {
      return 'Build is solid but has some issues to address.';
    } else if (score >= 5) {
      return 'Build has notable problems that should be fixed before endgame content.';
    } else if (score >= 3) {
      return 'Build has serious issues that will make it struggle in maps.';
    } else {
      return 'Build has critical problems that must be fixed. It is not viable for endgame in its current state.';
    }
  }

  /**
   * Format validation results for display
   */
  formatValidation(validation: BuildValidation): string {
    let output = '=== Build Validation Report ===\n\n';

    output += `Overall Score: ${validation.overallScore.toFixed(1)}/10\n`;
    output += `Status: ${validation.summary}\n\n`;

    // Critical Issues
    if (validation.criticalIssues.length > 0) {
      output += `=== Critical Issues (${validation.criticalIssues.length}) ===\n`;
      for (const issue of validation.criticalIssues) {
        output += this.formatIssue(issue, '❌');
      }
      output += '\n';
    }

    // Warnings
    if (validation.warnings.length > 0) {
      output += `=== Warnings (${validation.warnings.length}) ===\n`;
      for (const issue of validation.warnings) {
        output += this.formatIssue(issue, '⚠️');
      }
      output += '\n';
    }

    // Recommendations
    if (validation.recommendations.length > 0) {
      output += `=== Recommendations (${validation.recommendations.length}) ===\n`;
      for (const issue of validation.recommendations) {
        output += this.formatIssue(issue, '💡');
      }
      output += '\n';
    }

    if (validation.isValid && validation.warnings.length === 0 && validation.recommendations.length === 0) {
      output += '✅ No issues found! Build looks great!\n';
    }

    return output;
  }

  private formatIssue(issue: ValidationIssue, icon: string): string {
    let output = `\n${icon} ${issue.title}\n`;
    output += `   ${issue.description}\n`;

    if (issue.currentValue !== undefined && issue.recommendedValue !== undefined) {
      output += `   Current: ${issue.currentValue} | Recommended: ${issue.recommendedValue}\n`;
    }

    if (issue.suggestions.length > 0) {
      output += `   Suggestions:\n`;
      for (const suggestion of issue.suggestions) {
        output += `   → ${suggestion}\n`;
      }
    }

    return output;
  }
}
