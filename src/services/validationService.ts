import type { PoBBuild, BuildValidation, ValidationIssue, FlaskAnalysis } from "../types.js";

export class ValidationService {
  /**
   * Validate a complete build and return all issues found
   */
  validateBuild(
    build: PoBBuild,
    flaskAnalysis: FlaskAnalysis | null
  ): BuildValidation {
    const criticalIssues: ValidationIssue[] = [];
    const warnings: ValidationIssue[] = [];
    const recommendations: ValidationIssue[] = [];

    // Extract stats from build
    const stats = this.extractStats(build);

    // Run validation rules
    this.validateResistances(stats, criticalIssues, warnings);
    this.validateDefenses(stats, build, criticalIssues, warnings);
    this.validateImmunities(flaskAnalysis, criticalIssues, warnings, recommendations);

    // Calculate overall score
    const overallScore = this.calculateScore(criticalIssues, warnings);
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
    stats: Map<string, number>,
    criticalIssues: ValidationIssue[],
    warnings: ValidationIssue[]
  ): void {
    const resistCap = 75;
    const resistances = [
      { key: 'FireResist', name: 'Fire' },
      { key: 'ColdResist', name: 'Cold' },
      { key: 'LightningResist', name: 'Lightning' },
      { key: 'ChaosResist', name: 'Chaos' },
    ];

    for (const resist of resistances) {
      const value = stats.get(resist.key) || 0;

      if (resist.key !== 'ChaosResist' && value < resistCap) {
        // Fire, Cold, Lightning must be 75% for maps
        criticalIssues.push({
          severity: 'critical',
          category: 'resistances',
          title: `${resist.name} Resistance Too Low`,
          description: `${resist.name} resistance is ${value}%. You need ${resistCap}% for endgame content.`,
          currentValue: value,
          recommendedValue: resistCap,
          suggestions: [
            `Craft +${resistCap - value}% ${resist.name} Resistance on gear with open suffix`,
            `Use a ${resist.name.toLowerCase()} resistance flask temporarily`,
            `Allocate resistance nodes on the passive tree`,
            `Upgrade jewelry pieces - rings and amulets can have high resistance rolls`,
          ],
          location: 'Gear',
        });
      } else if (resist.key === 'ChaosResist' && value < 0) {
        // Chaos resist should be at least 0% (negative is dangerous)
        warnings.push({
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
        });
      }
    }
  }

  private validateDefenses(
    stats: Map<string, number>,
    build: PoBBuild,
    criticalIssues: ValidationIssue[],
    warnings: ValidationIssue[]
  ): void {
    const life = stats.get('Life') || 0;
    const es = stats.get('EnergyShield') || 0;
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
      criticalIssues.push({
        severity: 'critical',
        category: 'immunities',
        title: 'No Bleed Immunity',
        description: 'You have no way to remove bleeding. This is extremely dangerous as bleeds can kill you rapidly while moving.',
        suggestions: [
          `Add a "of Staunching" suffix to your life flask`,
          `Use a flask with "Grants Immunity to Bleeding"`,
          `Corrupted Blood immunity can come from jewel corruptions`,
        ],
        location: 'Flasks',
      });
    }

    if (!flaskAnalysis.hasFreezeImmunity) {
      criticalIssues.push({
        severity: 'critical',
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
    warnings: ValidationIssue[]
  ): number {
    // Start at 10 (perfect)
    let score = 10;

    // Each critical issue removes 2 points
    score -= criticalIssues.length * 2;

    // Each warning removes 0.5 points
    score -= warnings.length * 0.5;

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
