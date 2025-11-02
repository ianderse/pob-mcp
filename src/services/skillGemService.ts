import type { PoBBuild } from "../types.js";

export interface GemData {
  name: string;
  type: "active" | "support";
  tags: string[];
  level_scaling?: {
    damage_multiplier?: number;
    added_damage?: { min: number; max: number };
  };
  quality_bonus?: string;
  awakened?: {
    base_gem: string;
    max_level: number;
    bonus_at_5: string;
  };
  synergies?: string[];
  anti_synergies?: string[];
  cost_tier?: "common" | "uncommon" | "rare" | "very_rare"; // Relative cost
}

export interface ArchetypeTemplate {
  name: string;
  description: string;
  required_tags: string[];
  recommended_supports: {
    gem: string;
    priority: number;
    reasoning: string;
  }[];
  avoid_supports: string[];
}

export interface GemAnalysis {
  activeSkill: {
    name: string;
    level: number;
    quality: number;
    tags: string[];
  };
  supports: {
    name: string;
    level: number;
    quality: number;
    rating: "excellent" | "good" | "suboptimal" | "poor";
    issues?: string[];
    recommendations?: string[];
  }[];
  archetype: string;
  archetypeMatch: number; // 0-100
  issues: string[];
  linkCount: number;
  maxLinks: number;
}

export interface GemSuggestion {
  gem: string;
  replaces?: string;
  dpsIncrease: number; // Estimated percentage
  reasoning: string;
  cost: string;
  priority: number;
  requires?: string[];
  conflicts?: string[];
}

export class SkillGemService {
  private gemDatabase: Map<string, GemData>;
  private archetypes: ArchetypeTemplate[];

  constructor() {
    this.gemDatabase = new Map();
    this.archetypes = [];
    this.initializeGemDatabase();
    this.initializeArchetypes();
  }

  /**
   * Analyze a skill's gem setup
   */
  analyzeSkillLinks(
    build: PoBBuild,
    skillIndex: number = 0
  ): GemAnalysis {
    const skills = this.extractSkills(build);
    if (skillIndex >= skills.length) {
      throw new Error(`Skill index ${skillIndex} not found. Build has ${skills.length} skills.`);
    }

    const skill = skills[skillIndex];
    const activeGem = skill.gems[0]; // First gem is usually active skill
    const supportGems = skill.gems.slice(1);

    // Detect archetype
    const archetype = this.detectArchetype(activeGem, build);
    const archetypeMatch = this.calculateArchetypeMatch(supportGems, archetype);

    // Rate each support gem
    const supports = supportGems.map((gem) => this.rateSupport(gem, activeGem, archetype));

    // Detect issues
    const issues = this.detectIssues(activeGem, supportGems, archetype);

    return {
      activeSkill: {
        name: activeGem.nameSpec || activeGem.gemId || "Unknown",
        level: activeGem.level || 1,
        quality: activeGem.quality || 0,
        tags: this.getGemTags(activeGem.nameSpec || activeGem.gemId || ""),
      },
      supports,
      archetype: archetype.name,
      archetypeMatch,
      issues,
      linkCount: skill.gems.length,
      maxLinks: 6, // Could parse from item slots
    };
  }

  /**
   * Suggest better support gems
   */
  suggestSupportGems(
    build: PoBBuild,
    skillIndex: number = 0,
    options: {
      count?: number;
      includeAwakened?: boolean;
      budget?: "league_start" | "mid_league" | "endgame";
    } = {}
  ): GemSuggestion[] {
    const count = options.count || 5;
    const includeAwakened = options.includeAwakened !== false;
    const budget = options.budget || "endgame";

    const analysis = this.analyzeSkillLinks(build, skillIndex);
    const activeGem = analysis.activeSkill;
    const currentSupports = analysis.supports.map((s) => s.name);

    // Get archetype template
    const archetype = this.archetypes.find((a) => a.name === analysis.archetype);
    if (!archetype) {
      return [];
    }

    // Build suggestion list
    const suggestions: GemSuggestion[] = [];

    // Check archetype recommendations
    for (const rec of archetype.recommended_supports) {
      const gemData = this.gemDatabase.get(rec.gem);
      if (!gemData) continue;

      // Skip if already using
      if (currentSupports.includes(rec.gem)) continue;

      // Skip awakened if not included
      if (!includeAwakened && gemData.awakened) continue;

      // Budget filter
      if (budget === "league_start" && gemData.cost_tier === "very_rare") continue;
      if (budget === "mid_league" && gemData.cost_tier === "very_rare") continue;

      // Find what to replace
      const weakestSupport = this.findWeakestSupport(analysis.supports);

      suggestions.push({
        gem: rec.gem,
        replaces: weakestSupport?.name,
        dpsIncrease: this.estimateDPSIncrease(rec.gem, activeGem.tags),
        reasoning: rec.reasoning,
        cost: this.estimateCost(gemData, budget),
        priority: rec.priority,
        requires: gemData.synergies,
        conflicts: gemData.anti_synergies,
      });
    }

    // Check awakened upgrades for current supports
    for (const support of analysis.supports) {
      const gemData = this.gemDatabase.get(support.name);
      if (gemData?.awakened && includeAwakened) {
        const awakenedName = `Awakened ${support.name}`;
        const awakenedData = this.gemDatabase.get(awakenedName);
        if (awakenedData) {
          suggestions.push({
            gem: awakenedName,
            replaces: support.name,
            dpsIncrease: 8, // Awakened gems typically ~8-12% increase
            reasoning: `Awakened version provides higher multiplier and bonus at level 5`,
            cost: this.estimateCost(awakenedData, budget),
            priority: 5,
          });
        }
      }
    }

    // Sort by priority and DPS increase
    suggestions.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return b.dpsIncrease - a.dpsIncrease;
    });

    return suggestions.slice(0, count);
  }

  /**
   * Validate gem quality and levels
   */
  validateGemQuality(
    build: PoBBuild,
    options: { includeCorrupted?: boolean } = {}
  ): {
    needsQuality: Array<{ gem: string; current: string; recommended: string; impact: string }>;
    awakenedUpgrades: Array<{ gem: string; awakened: string; dpsGain: string }>;
    corruptionTargets?: Array<{ gem: string; target: string; risk: string }>;
  } {
    const skills = this.extractSkills(build);
    const allGems = skills.flatMap((s) => s.gems);

    const needsQuality: Array<{ gem: string; current: string; recommended: string; impact: string }> = [];
    const awakenedUpgrades: Array<{ gem: string; awakened: string; dpsGain: string }> = [];
    const corruptionTargets: Array<{ gem: string; target: string; risk: string }> = [];

    for (const gem of allGems) {
      const name = gem.nameSpec || gem.gemId || "Unknown";
      const level = gem.level || 1;
      const quality = gem.quality || 0;

      // Check quality
      if (quality < 20) {
        const impact = quality === 0 ? "High" : "Medium";
        needsQuality.push({
          gem: name,
          current: `${level}/${quality}`,
          recommended: `${level}/20`,
          impact,
        });
      }

      // Check awakened upgrades
      const gemData = this.gemDatabase.get(name);
      if (gemData?.awakened) {
        const awakenedName = `Awakened ${name}`;
        awakenedUpgrades.push({
          gem: name,
          awakened: awakenedName,
          dpsGain: "~8-12%",
        });
      }

      // Check corruption targets
      if (options.includeCorrupted && level === 20 && quality === 20) {
        corruptionTargets.push({
          gem: name,
          target: `${level + 1}/${quality + 3}`,
          risk: "Could brick to 20/20",
        });
      }
    }

    return {
      needsQuality,
      awakenedUpgrades,
      corruptionTargets: options.includeCorrupted ? corruptionTargets : undefined,
    };
  }

  /**
   * Extract skills from build
   */
  private extractSkills(build: PoBBuild): Array<{ gems: any[]; slot: string }> {
    const skills: Array<{ gems: any[]; slot: string }> = [];

    if (build.Skills?.SkillSet) {
      const skillSets = Array.isArray(build.Skills.SkillSet)
        ? build.Skills.SkillSet
        : [build.Skills.SkillSet];

      for (const skillSet of skillSets) {
        if (skillSet.Skill) {
          const skillArray = Array.isArray(skillSet.Skill) ? skillSet.Skill : [skillSet.Skill];

          for (const skill of skillArray) {
            if (skill.Gem) {
              const gems = Array.isArray(skill.Gem) ? skill.Gem : [skill.Gem];
              skills.push({
                gems,
                slot: skill.slot || "Unknown",
              });
            }
          }
        }
      }
    }

    return skills;
  }

  /**
   * Detect build archetype
   */
  private detectArchetype(activeGem: any, build: PoBBuild): ArchetypeTemplate {
    const gemName = activeGem.nameSpec || activeGem.gemId || "";
    const tags = this.getGemTags(gemName);

    // Try to match archetype based on tags
    for (const archetype of this.archetypes) {
      const matchCount = archetype.required_tags.filter((tag) => tags.includes(tag)).length;
      if (matchCount >= archetype.required_tags.length) {
        return archetype;
      }
    }

    // Default to generic
    return this.archetypes[this.archetypes.length - 1];
  }

  /**
   * Calculate archetype match percentage
   */
  private calculateArchetypeMatch(supports: any[], archetype: ArchetypeTemplate): number {
    const supportNames = supports.map((s) => s.nameSpec || s.gemId || "");
    const recommended = archetype.recommended_supports.map((r) => r.gem);
    const avoided = archetype.avoid_supports;

    let matches = 0;
    let penalties = 0;

    for (const support of supportNames) {
      if (recommended.includes(support)) matches++;
      if (avoided.includes(support)) penalties++;
    }

    const total = recommended.length;
    const score = total > 0 ? ((matches - penalties) / total) * 100 : 50;

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Rate a support gem
   */
  private rateSupport(
    gem: any,
    activeGem: any,
    archetype: ArchetypeTemplate
  ): {
    name: string;
    level: number;
    quality: number;
    rating: "excellent" | "good" | "suboptimal" | "poor";
    issues?: string[];
    recommendations?: string[];
  } {
    const name = gem.nameSpec || gem.gemId || "Unknown";
    const level = gem.level || 1;
    const quality = gem.quality || 0;

    const issues: string[] = [];
    const recommendations: string[] = [];

    // Check if recommended by archetype
    const isRecommended = archetype.recommended_supports.some((r) => r.gem === name);
    const isAvoided = archetype.avoid_supports.includes(name);

    // Check quality
    if (quality === 0) {
      issues.push("Missing quality");
      recommendations.push(`Add quality to ${name}`);
    } else if (quality < 20) {
      issues.push(`Low quality (${quality}/20)`);
    }

    // Check if awakened version exists
    const gemData = this.gemDatabase.get(name);
    if (gemData?.awakened && !name.startsWith("Awakened")) {
      recommendations.push(`Consider Awakened ${name}`);
    }

    // Determine rating
    let rating: "excellent" | "good" | "suboptimal" | "poor";
    if (isAvoided) {
      rating = "poor";
      issues.push("Not recommended for this build archetype");
    } else if (isRecommended && quality >= 20) {
      rating = "excellent";
    } else if (isRecommended) {
      rating = "good";
    } else {
      rating = "suboptimal";
      issues.push("Not in recommended support list for this archetype");
    }

    return {
      name,
      level,
      quality,
      rating,
      issues: issues.length > 0 ? issues : undefined,
      recommendations: recommendations.length > 0 ? recommendations : undefined,
    };
  }

  /**
   * Detect issues with skill setup
   */
  private detectIssues(activeGem: any, supports: any[], archetype: ArchetypeTemplate): string[] {
    const issues: string[] = [];
    const supportNames = supports.map((s) => s.nameSpec || s.gemId || "");

    // Check for missing recommended supports
    const missingRecommended = archetype.recommended_supports
      .filter((r) => r.priority <= 3)
      .filter((r) => !supportNames.includes(r.gem));

    if (missingRecommended.length > 0) {
      issues.push(`Missing critical support: ${missingRecommended[0].gem}`);
    }

    // Check for conflicts
    for (const support of supportNames) {
      const gemData = this.gemDatabase.get(support);
      if (gemData?.anti_synergies) {
        for (const antiSynergy of gemData.anti_synergies) {
          const hasConflict = supportNames.some((s) => {
            const otherGem = this.gemDatabase.get(s);
            return otherGem?.tags.includes(antiSynergy);
          });
          if (hasConflict) {
            issues.push(`${support} conflicts with other gems (${antiSynergy})`);
          }
        }
      }
    }

    // Check for low-quality gems
    const lowQuality = supports.filter((s) => (s.quality || 0) === 0);
    if (lowQuality.length > 0) {
      issues.push(`${lowQuality.length} gem(s) missing quality`);
    }

    return issues;
  }

  /**
   * Find weakest support to replace
   */
  private findWeakestSupport(supports: GemAnalysis["supports"]): { name: string } | null {
    const poor = supports.find((s) => s.rating === "poor");
    if (poor) return { name: poor.name };

    const suboptimal = supports.find((s) => s.rating === "suboptimal");
    if (suboptimal) return { name: suboptimal.name };

    const good = supports.find((s) => s.rating === "good");
    if (good) return { name: good.name };

    return null;
  }

  /**
   * Estimate DPS increase from adding a gem
   */
  private estimateDPSIncrease(gemName: string, activeTags: string[]): number {
    const gemData = this.gemDatabase.get(gemName);
    if (!gemData) return 5;

    // Check tag synergies
    const synergies = gemData.synergies || [];
    const matchingTags = synergies.filter((tag) => activeTags.includes(tag)).length;

    // Base estimate: 10-30% depending on synergies
    return 10 + matchingTags * 5;
  }

  /**
   * Estimate gem cost
   */
  private estimateCost(gemData: GemData, budget: string): string {
    if (gemData.cost_tier === "common") return "~5 Chaos Orbs";
    if (gemData.cost_tier === "uncommon") return "~20 Chaos Orbs";
    if (gemData.cost_tier === "rare") return "~5 Divine Orbs";
    if (gemData.cost_tier === "very_rare") {
      if (budget === "endgame") return "~50 Divine Orbs";
      return "~20 Divine Orbs";
    }
    return "~10 Chaos Orbs";
  }

  /**
   * Get gem tags
   */
  private getGemTags(gemName: string): string[] {
    const gemData = this.gemDatabase.get(gemName);
    return gemData?.tags || [];
  }

  /**
   * Initialize gem database
   */
  private initializeGemDatabase(): void {
    const gems: GemData[] = [
      // Attack Supports
      {
        name: "Elemental Damage with Attacks Support",
        type: "support",
        tags: ["Attack", "Support"],
        synergies: ["Attack", "Elemental", "Fire", "Cold", "Lightning"],
        anti_synergies: ["Spell"],
        cost_tier: "common",
        awakened: {
          base_gem: "Elemental Damage with Attacks Support",
          max_level: 5,
          bonus_at_5: "+1% to all Elemental Resistances per 1% Quality",
        },
      },
      {
        name: "Awakened Elemental Damage with Attacks Support",
        type: "support",
        tags: ["Attack", "Support"],
        synergies: ["Attack", "Elemental", "Fire", "Cold", "Lightning"],
        anti_synergies: ["Spell"],
        cost_tier: "very_rare",
      },
      {
        name: "Added Lightning Damage Support",
        type: "support",
        tags: ["Lightning", "Support"],
        synergies: ["Attack", "Lightning"],
        cost_tier: "common",
        awakened: {
          base_gem: "Added Lightning Damage Support",
          max_level: 5,
          bonus_at_5: "Supported Skills deal 10% increased Lightning Damage",
        },
      },
      {
        name: "Awakened Added Lightning Damage Support",
        type: "support",
        tags: ["Lightning", "Support"],
        synergies: ["Attack", "Lightning"],
        cost_tier: "very_rare",
      },
      {
        name: "Lightning Penetration Support",
        type: "support",
        tags: ["Lightning", "Support"],
        synergies: ["Lightning", "Elemental"],
        cost_tier: "common",
        awakened: {
          base_gem: "Lightning Penetration Support",
          max_level: 5,
          bonus_at_5: "Penetrate 6% Lightning Resistance",
        },
      },
      {
        name: "Awakened Lightning Penetration Support",
        type: "support",
        tags: ["Lightning", "Support"],
        synergies: ["Lightning", "Elemental"],
        cost_tier: "very_rare",
      },
      {
        name: "Inspiration Support",
        type: "support",
        tags: ["Support"],
        synergies: ["Attack", "Spell"],
        cost_tier: "common",
        quality_bonus: "1% reduced Mana Cost per 1% Quality",
      },
      {
        name: "Mirage Archer Support",
        type: "support",
        tags: ["Attack", "Bow", "Support"],
        synergies: ["Attack", "Bow", "Projectile"],
        anti_synergies: ["Melee"],
        cost_tier: "uncommon",
      },
      {
        name: "Faster Attacks Support",
        type: "support",
        tags: ["Attack", "Support"],
        synergies: ["Attack"],
        anti_synergies: ["Spell"],
        cost_tier: "common",
      },
      {
        name: "Elemental Focus Support",
        type: "support",
        tags: ["Support"],
        synergies: ["Elemental", "Fire", "Cold", "Lightning"],
        anti_synergies: ["Ignite", "Freeze", "Shock", "Ailment"],
        cost_tier: "common",
      },
      {
        name: "Trinity Support",
        type: "support",
        tags: ["Support"],
        synergies: ["Fire", "Cold", "Lightning", "Elemental", "Attack", "Spell"],
        anti_synergies: ["Elemental Focus"],
        cost_tier: "common",
      },
      {
        name: "Awakened Trinity Support",
        type: "support",
        tags: ["Support"],
        synergies: ["Fire", "Cold", "Lightning", "Elemental", "Attack", "Spell"],
        anti_synergies: ["Elemental Focus"],
        cost_tier: "very_rare",
      },
      {
        name: "Hypothermia Support",
        type: "support",
        tags: ["Cold", "Support"],
        synergies: ["Cold"],
        cost_tier: "common",
      },
      {
        name: "Brutality Support",
        type: "support",
        tags: ["Physical", "Support"],
        synergies: ["Physical", "Attack"],
        anti_synergies: ["Elemental", "Fire", "Cold", "Lightning", "Chaos"],
        cost_tier: "common",
      },
      // Spell Supports
      {
        name: "Spell Echo Support",
        type: "support",
        tags: ["Spell", "Support"],
        synergies: ["Spell"],
        anti_synergies: ["Attack", "Totem", "Trap", "Mine"],
        cost_tier: "common",
      },
      {
        name: "Controlled Destruction Support",
        type: "support",
        tags: ["Spell", "Support"],
        synergies: ["Spell"],
        anti_synergies: ["Attack"],
        cost_tier: "common",
      },
      {
        name: "Concentrated Effect Support",
        type: "support",
        tags: ["AoE", "Support"],
        synergies: ["AoE"],
        cost_tier: "common",
      },
      // Generic/Multi-purpose
      {
        name: "Increased Critical Strikes Support",
        type: "support",
        tags: ["Critical", "Support"],
        synergies: ["Attack", "Spell", "Critical"],
        cost_tier: "common",
      },
      {
        name: "Increased Critical Damage Support",
        type: "support",
        tags: ["Critical", "Support"],
        synergies: ["Attack", "Spell", "Critical"],
        cost_tier: "common",
      },
    ];

    for (const gem of gems) {
      this.gemDatabase.set(gem.name, gem);
    }
  }

  /**
   * Initialize archetype templates
   */
  private initializeArchetypes(): void {
    this.archetypes = [
      {
        name: "Elemental Bow Attack",
        description: "Bow attack with elemental conversion or added damage",
        required_tags: ["Attack", "Bow"],
        recommended_supports: [
          {
            gem: "Elemental Damage with Attacks Support",
            priority: 1,
            reasoning: "Core multiplier for elemental attacks",
          },
          {
            gem: "Lightning Penetration Support",
            priority: 2,
            reasoning: "Penetration is crucial against resistant enemies",
          },
          {
            gem: "Inspiration Support",
            priority: 3,
            reasoning: "More damage and reduced mana cost",
          },
          {
            gem: "Mirage Archer Support",
            priority: 4,
            reasoning: "Additional damage uptime for bow skills",
          },
          {
            gem: "Trinity Support",
            priority: 5,
            reasoning: "Excellent for multi-element builds",
          },
        ],
        avoid_supports: [
          "Brutality Support",
          "Spell Echo Support",
          "Controlled Destruction Support",
        ],
      },
      {
        name: "Physical Bow Attack",
        description: "Bow attack focused on physical damage",
        required_tags: ["Attack", "Bow", "Physical"],
        recommended_supports: [
          {
            gem: "Brutality Support",
            priority: 1,
            reasoning: "Massive more multiplier for pure physical",
          },
          {
            gem: "Mirage Archer Support",
            priority: 2,
            reasoning: "Additional damage uptime",
          },
          {
            gem: "Faster Attacks Support",
            priority: 4,
            reasoning: "Increases attack speed",
          },
        ],
        avoid_supports: [
          "Elemental Damage with Attacks Support",
          "Lightning Penetration Support",
          "Trinity Support",
        ],
      },
      {
        name: "Critical Spell",
        description: "Spell with high critical strike chance",
        required_tags: ["Spell", "Critical"],
        recommended_supports: [
          {
            gem: "Increased Critical Strikes Support",
            priority: 1,
            reasoning: "Boosts critical strike chance",
          },
          {
            gem: "Increased Critical Damage Support",
            priority: 2,
            reasoning: "Multiplies critical damage",
          },
          {
            gem: "Spell Echo Support",
            priority: 3,
            reasoning: "Cast speed and repeat",
          },
          {
            gem: "Controlled Destruction Support",
            priority: 4,
            reasoning: "More spell damage",
          },
        ],
        avoid_supports: ["Brutality Support", "Elemental Damage with Attacks Support"],
      },
      {
        name: "Generic",
        description: "Unclassified build type",
        required_tags: [],
        recommended_supports: [],
        avoid_supports: [],
      },
    ];
  }
}
