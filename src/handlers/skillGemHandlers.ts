import type { BuildService } from "../services/buildService.js";
import type { SkillGemService } from "../services/skillGemService.js";

export interface SkillGemHandlerContext {
  buildService: BuildService;
  skillGemService: SkillGemService;
}

/**
 * Handle analyze_skill_links tool call
 */
export async function handleAnalyzeSkillLinks(
  context: SkillGemHandlerContext,
  args?: { build_name?: string; skill_index?: number }
) {
  const { buildService, skillGemService } = context;

  if (!args?.build_name) {
    throw new Error("build_name is required");
  }

  const buildData = await buildService.readBuild(args.build_name);
  const skillIndex = args.skill_index || 0;

  const analysis = skillGemService.analyzeSkillLinks(buildData, skillIndex);

  // Format output
  let output = `=== Skill Analysis: ${analysis.activeSkill.name} ===\n\n`;

  output += `Active Skill: ${analysis.activeSkill.name} (Level ${analysis.activeSkill.level}/${analysis.activeSkill.quality})\n`;
  output += `Tags: ${analysis.activeSkill.tags.join(", ")}\n`;
  output += `Archetype: ${analysis.archetype}\n\n`;

  output += `=== Support Gems (${analysis.linkCount}-Link) ===\n`;

  for (let i = 0; i < analysis.supports.length; i++) {
    const support = analysis.supports[i];
    const symbol = support.rating === "excellent" ? "✓" : support.rating === "poor" ? "✗" : "⚠";

    output += `${i + 1}. ${symbol} ${support.name} (${support.level}/${support.quality}) - ${
      support.rating.charAt(0).toUpperCase() + support.rating.slice(1)
    }\n`;

    if (support.issues && support.issues.length > 0) {
      for (const issue of support.issues) {
        output += `   ⚠ ${issue}\n`;
      }
    }

    if (support.recommendations && support.recommendations.length > 0) {
      for (const rec of support.recommendations) {
        output += `   → ${rec}\n`;
      }
    }
  }

  if (analysis.issues.length > 0) {
    output += `\n=== Issues Detected ===\n`;
    for (const issue of analysis.issues) {
      output += `⚠ ${issue}\n`;
    }
  }

  output += `\n=== Archetype Match: ${Math.round(analysis.archetypeMatch)}% ===\n`;
  if (analysis.archetypeMatch >= 80) {
    output += `Strong alignment with "${analysis.archetype}" archetype\n`;
  } else if (analysis.archetypeMatch >= 60) {
    output += `Moderate alignment with "${analysis.archetype}" archetype\n`;
  } else {
    output += `Weak alignment with "${analysis.archetype}" archetype - consider reviewing gem choices\n`;
  }

  output += `\n💡 Use suggest_support_gems to see recommended improvements\n`;

  return {
    content: [
      {
        type: "text" as const,
        text: output,
      },
    ],
  };
}

/**
 * Handle suggest_support_gems tool call
 */
export async function handleSuggestSupportGems(
  context: SkillGemHandlerContext,
  args?: {
    build_name?: string;
    skill_index?: number;
    count?: number;
    include_awakened?: boolean;
    budget?: "league_start" | "mid_league" | "endgame";
  }
) {
  const { buildService, skillGemService } = context;

  if (!args?.build_name) {
    throw new Error("build_name is required");
  }

  const buildData = await buildService.readBuild(args.build_name);
  const skillIndex = args.skill_index || 0;

  const suggestions = skillGemService.suggestSupportGems(buildData, skillIndex, {
    count: args.count,
    includeAwakened: args.include_awakened,
    budget: args.budget,
  });

  // Get current analysis for context
  const analysis = skillGemService.analyzeSkillLinks(buildData, skillIndex);

  // Format output
  let output = `=== Support Gem Recommendations for ${analysis.activeSkill.name} ===\n\n`;

  if (suggestions.length === 0) {
    output += `No recommendations found. Your current setup appears optimal!\n`;
    return {
      content: [
        {
          type: "text" as const,
          text: output,
        },
      ],
    };
  }

  output += `Top ${suggestions.length} Recommendations:\n\n`;

  for (let i = 0; i < suggestions.length; i++) {
    const suggestion = suggestions[i];

    output += `${i + 1}. ${suggestion.gem}\n`;
    if (suggestion.replaces) {
      output += `   Replaces: ${suggestion.replaces}\n`;
    }
    output += `   Est. DPS Increase: +${suggestion.dpsIncrease.toFixed(1)}%\n`;
    output += `   Why: ${suggestion.reasoning}\n`;
    output += `   Cost: ${suggestion.cost}\n`;

    if (suggestion.requires && suggestion.requires.length > 0) {
      output += `   Requires: ${suggestion.requires.join(", ")}\n`;
    }

    if (suggestion.conflicts && suggestion.conflicts.length > 0) {
      output += `   ⚠ Conflicts: ${suggestion.conflicts.join(", ")}\n`;
    }

    output += `\n`;
  }

  // Add budget-specific recommendations
  const budget = args.budget || "endgame";
  const bestBudget = suggestions.find((s) => s.cost.includes("Chaos"));
  const bestEndgame = suggestions.find((s) => s.dpsIncrease === Math.max(...suggestions.map((s) => s.dpsIncrease)));

  if (bestBudget && budget === "endgame") {
    output += `💡 Best Bang-for-Buck: ${bestBudget.gem} (+${bestBudget.dpsIncrease.toFixed(1)}% for ${bestBudget.cost})\n`;
  }
  if (bestEndgame) {
    output += `💡 ${budget === "endgame" ? "Endgame" : "Best"} Priority: ${bestEndgame.gem} (+${bestEndgame.dpsIncrease.toFixed(1)}%)\n`;
  }

  return {
    content: [
      {
        type: "text" as const,
        text: output,
      },
    ],
  };
}

/**
 * Handle compare_gem_setups tool call
 */
export async function handleCompareGemSetups(
  context: SkillGemHandlerContext,
  args: {
    build_name: string;
    skill_index?: number;
    setups: Array<{ name: string; gems: string[] }>;
  }
) {
  const { buildService } = context;

  if (!args.build_name) {
    throw new Error("build_name is required");
  }

  if (!args.setups || args.setups.length < 2) {
    throw new Error("At least 2 setups are required for comparison");
  }

  const buildData = await buildService.readBuild(args.build_name);

  // Get active skill name for context
  const skills = extractSkills(buildData);
  const skillIndex = args.skill_index || 0;
  const activeSkillName = skills[skillIndex]?.gems[0]?.nameSpec || "Unknown Skill";

  // Format output
  let output = `=== Gem Setup Comparison for ${activeSkillName} ===\n\n`;

  for (let i = 0; i < args.setups.length; i++) {
    const setup = args.setups[i];

    output += `Setup ${String.fromCharCode(65 + i)}: "${setup.name}"\n`;
    output += `Gems: [${setup.gems.join(", ")}]\n`;
    output += `Links: ${setup.gems.length}\n`;

    // Note: Actual DPS calculation would require Lua bridge integration
    // For now, we provide structural comparison
    output += `⚠ DPS calculation requires Lua bridge (future enhancement)\n`;
    output += `\n`;
  }

  output += `=== Comparison Notes ===\n`;
  output += `This tool currently provides structural comparison.\n`;
  output += `For accurate DPS calculations, use suggest_support_gems which provides estimated increases.\n`;
  output += `\n💡 Future enhancement: Integrate with Lua bridge for real DPS testing\n`;

  return {
    content: [
      {
        type: "text" as const,
        text: output,
      },
    ],
  };
}

/**
 * Handle validate_gem_quality tool call
 */
export async function handleValidateGemQuality(
  context: SkillGemHandlerContext,
  args?: { build_name?: string; include_corrupted?: boolean }
) {
  const { buildService, skillGemService } = context;

  if (!args?.build_name) {
    throw new Error("build_name is required");
  }

  const buildData = await buildService.readBuild(args.build_name);

  const validation = skillGemService.validateGemQuality(buildData, {
    includeCorrupted: args.include_corrupted,
  });

  // Format output
  let output = `=== Gem Quality Validation ===\n\n`;

  if (validation.needsQuality.length > 0) {
    output += `⚠ ${validation.needsQuality.length} gem(s) need quality improvement:\n`;
    for (let i = 0; i < validation.needsQuality.length; i++) {
      const gem = validation.needsQuality[i];
      output += `${i + 1}. ${gem.gem}: ${gem.current} → ${gem.recommended} (Impact: ${gem.impact})\n`;
    }
    output += `\n`;
  } else {
    output += `✓ All gems have quality 20\n\n`;
  }

  if (validation.awakenedUpgrades.length > 0) {
    output += `⭐ Awakened Gem Upgrades Available:\n`;
    for (let i = 0; i < validation.awakenedUpgrades.length; i++) {
      const upgrade = validation.awakenedUpgrades[i];
      output += `${i + 1}. ${upgrade.gem} → ${upgrade.awakened}\n`;
      output += `   Est. DPS Gain: ${upgrade.dpsGain}\n`;
    }
    output += `\n`;
  }

  if (validation.corruptionTargets && validation.corruptionTargets.length > 0) {
    output += `💎 Corruption Opportunities:\n`;
    for (let i = 0; i < validation.corruptionTargets.length; i++) {
      const target = validation.corruptionTargets[i];
      output += `${i + 1}. ${target.gem} (current) → ${target.target} (corrupted)\n`;
      output += `   Risk: ${target.risk}\n`;
    }
    output += `\n`;
  }

  if (validation.needsQuality.length > 0) {
    const highPriority = validation.needsQuality.find((g) => g.impact === "High");
    if (highPriority) {
      output += `💡 Priority: Quality your ${highPriority.gem} first (highest impact)\n`;
    }
  } else if (validation.awakenedUpgrades.length > 0) {
    output += `💡 Consider awakened gem upgrades for significant DPS improvements\n`;
  } else {
    output += `🎉 Your gems are fully optimized!\n`;
  }

  return {
    content: [
      {
        type: "text" as const,
        text: output,
      },
    ],
  };
}

/**
 * Handle find_optimal_links tool call
 */
export async function handleFindOptimalLinks(
  context: SkillGemHandlerContext,
  args: {
    build_name: string;
    skill_index?: number;
    link_count: number;
    budget?: "league_start" | "mid_league" | "endgame";
    optimize_for?: "dps" | "clear_speed" | "bossing" | "defense";
  }
) {
  const { buildService, skillGemService } = context;

  if (!args.build_name) {
    throw new Error("build_name is required");
  }

  if (!args.link_count || args.link_count < 4 || args.link_count > 6) {
    throw new Error("link_count must be between 4 and 6");
  }

  const buildData = await buildService.readBuild(args.build_name);
  const skillIndex = args.skill_index || 0;

  const analysis = skillGemService.analyzeSkillLinks(buildData, skillIndex);
  const suggestions = skillGemService.suggestSupportGems(buildData, skillIndex, {
    count: args.link_count - 1, // Subtract 1 for active skill
    includeAwakened: args.budget !== "league_start",
    budget: args.budget,
  });

  const budget = args.budget || "endgame";
  const optimizeFor = args.optimize_for || "dps";

  // Format output
  let output = `=== Optimal ${args.link_count}-Link for ${analysis.activeSkill.name} ===\n\n`;

  output += `Optimization Target: ${optimizeFor.toUpperCase()}\n`;
  output += `Budget: ${budget.replace("_", " ").replace(/\b\w/g, (l) => l.toUpperCase())}\n\n`;

  output += `🏆 Optimal Setup:\n`;
  output += `1. ${analysis.activeSkill.name} (${analysis.activeSkill.level}/${analysis.activeSkill.quality})\n`;

  for (let i = 0; i < Math.min(suggestions.length, args.link_count - 1); i++) {
    const suggestion = suggestions[i];
    output += `${i + 2}. ${suggestion.gem}\n`;
  }

  output += `\n=== Upgrade Path ===\n\n`;

  let cumulativeDPS = 0;
  for (let i = 0; i < Math.min(suggestions.length, args.link_count - 1); i++) {
    const suggestion = suggestions[i];
    cumulativeDPS += suggestion.dpsIncrease;

    output += `Step ${i + 1}: Add ${suggestion.gem}`;
    if (suggestion.replaces) {
      output += ` (replace ${suggestion.replaces})`;
    }
    output += `\n`;
    output += `Cost: ${suggestion.cost}\n`;
    output += `Est. DPS Increase: +${suggestion.dpsIncrease.toFixed(1)}%\n`;
    output += `\n`;
  }

  output += `=== Summary ===\n`;
  output += `Total Est. DPS Increase: +${cumulativeDPS.toFixed(1)}%\n`;

  if (budget === "league_start") {
    output += `\n💡 League start setup focuses on easily obtainable gems\n`;
  } else if (budget === "mid_league") {
    output += `\n💡 Mid-league setup balances cost and performance\n`;
  } else {
    const bestSuggestion = suggestions[0];
    if (bestSuggestion) {
      output += `\n💡 Best first upgrade: ${bestSuggestion.gem} (+${bestSuggestion.dpsIncrease.toFixed(1)}%)\n`;
    }
  }

  return {
    content: [
      {
        type: "text" as const,
        text: output,
      },
    ],
  };
}

/**
 * Helper: Extract skills from build
 */
function extractSkills(build: any): Array<{ gems: any[]; slot: string }> {
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
