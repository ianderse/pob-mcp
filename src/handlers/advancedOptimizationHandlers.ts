import type { PoBLuaApiClient, PoBLuaTcpClient } from "../pobLuaBridge.js";
import type { BuildService } from "../services/buildService.js";
import {
  analyzeEquippedItems,
  formatItemAnalysis,
  inferBuildArchetype,
  type BuildStats,
} from "../itemAnalyzer.js";
import {
  analyzeSkillSetup,
  formatSkillOptimization,
  type SkillGroup,
} from "../skillLinkOptimizer.js";

export interface AdvancedOptimizationContext {
  buildService: BuildService;
  getLuaClient: () => PoBLuaApiClient | PoBLuaTcpClient | null;
  ensureLuaClient: () => Promise<void>;
}

/**
 * Analyze equipped items and suggest upgrades
 */
export async function handleAnalyzeItems(
  context: AdvancedOptimizationContext,
  buildName?: string
) {
  try {
    let items: Array<{ slot: string; name?: string; baseName?: string; rarity?: string }> = [];
    let className: string | undefined;
    let ascendClassName: string | undefined;
    let stats: BuildStats | undefined;

    // Try to use Lua client for accurate data if available
    const luaClient = context.getLuaClient();

    if (luaClient && !buildName) {
      // Use currently loaded build from Lua
      try {
        const luaItems = await luaClient.getItems();
        items = luaItems.map((item) => ({
          slot: item.slot,
          name: item.name,
          baseName: item.baseName,
          rarity: item.rarity,
        }));

        // Get stats from Lua
        const luaStats = await luaClient.getStats();
        stats = {
          life: luaStats.Life,
          energyShield: luaStats.EnergyShield,
          evasion: luaStats.Evasion,
          armour: luaStats.Armour,
          dps: luaStats.TotalDPS,
          fireRes: luaStats['FireResist'],
          coldRes: luaStats['ColdResist'],
          lightningRes: luaStats['LightningResist'],
          chaosRes: luaStats['ChaosResist'],
        };

        // Get class info from tree
        const tree = await luaClient.getTree();
        const classNames = ['Scion', 'Marauder', 'Ranger', 'Witch', 'Duelist', 'Templar', 'Shadow'];
        className = classNames[tree.classId] || 'Unknown';
      } catch (error) {
        // Fall back to XML if Lua fails
        if (!buildName) {
          throw new Error(
            'No build loaded in Lua client and no build_name provided. Load a build first or provide build_name.'
          );
        }
      }
    }

    // Fall back to XML if no Lua data or buildName was provided
    if (buildName) {
      const build = await context.buildService.readBuild(buildName);

      className = build.Build?.className;
      ascendClassName = build.Build?.ascendClassName;

      // Extract items from XML
      if (build.Items?.ItemSet?.Slot) {
        const slots = Array.isArray(build.Items.ItemSet.Slot)
          ? build.Items.ItemSet.Slot
          : [build.Items.ItemSet.Slot];

        items = slots.map((slot) => {
          const itemText = slot.Item || '';
          const lines = itemText.split('\n');
          const rarity = lines[0]?.includes('Rarity:') ? lines[0].split(':')[1]?.trim() : undefined;
          const name = lines[1] || '(empty)';

          return {
            slot: slot.name || 'Unknown',
            name,
            rarity,
          };
        });
      }

      // Extract stats from XML
      if (build.Build?.PlayerStat) {
        const statsArray = Array.isArray(build.Build.PlayerStat)
          ? build.Build.PlayerStat
          : [build.Build.PlayerStat];

        stats = {};
        for (const stat of statsArray) {
          const key = stat.stat.replace(/\s+/g, '');
          stats[key] = parseFloat(stat.value) || 0;
        }
      }
    }

    // Analyze items
    const analysis = analyzeEquippedItems(items, className, ascendClassName, stats);
    const formatted = formatItemAnalysis(analysis);

    return {
      content: [
        {
          type: "text" as const,
          text: formatted,
        },
      ],
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to analyze items: ${errorMsg}`);
  }
}

/**
 * Analyze skill links and suggest optimizations
 */
export async function handleOptimizeSkillLinks(
  context: AdvancedOptimizationContext,
  buildName?: string
) {
  try {
    let skillGroups: SkillGroup[] = [];
    let buildArchetype = 'unknown';

    // Try Lua client first for accurate data
    const luaClient = context.getLuaClient();

    if (luaClient && !buildName) {
      try {
        const skillData = await luaClient.getSkills();

        if (skillData && skillData.groups) {
          skillGroups = skillData.groups.map((group: any) => ({
            index: group.index,
            label: group.label,
            slot: group.slot,
            enabled: group.enabled,
            isMainSkill: group.index === skillData.mainSocketGroup,
            gems: group.skills?.map((skillName: string) => ({ name: skillName })) || [],
            includeInFullDPS: group.includeInFullDPS,
          }));
        }

        // Get build type from tree/stats
        const tree = await luaClient.getTree();
        const stats = await luaClient.getStats();
        const classNames = ['Scion', 'Marauder', 'Ranger', 'Witch', 'Duelist', 'Templar', 'Shadow'];
        const className = classNames[tree.classId];

        buildArchetype = inferBuildArchetype(className, undefined, {
          life: stats.Life,
          energyShield: stats.EnergyShield,
          dps: stats.TotalDPS,
        });
      } catch (error) {
        // Fall back to XML
        if (!buildName) {
          throw new Error(
            'No build loaded in Lua client and no build_name provided. Load a build first or provide build_name.'
          );
        }
      }
    }

    // Fall back to XML if needed
    if (buildName) {
      const build = await context.buildService.readBuild(buildName);

      buildArchetype = inferBuildArchetype(
        build.Build?.className,
        build.Build?.ascendClassName
      );

      // Extract skills from XML
      if (build.Skills?.SkillSet?.Skill) {
        const skills = Array.isArray(build.Skills.SkillSet.Skill)
          ? build.Skills.SkillSet.Skill
          : [build.Skills.SkillSet.Skill];

        skillGroups = skills.map((skill: any, idx) => {
          const gems = Array.isArray(skill.Gem) ? skill.Gem : skill.Gem ? [skill.Gem] : [];

          return {
            index: idx + 1,
            label: skill.label,
            slot: skill.slot,
            enabled: skill.enabled !== 'false',
            isMainSkill: idx === 0, // Assume first is main
            gems: gems.map((gem: any) => ({
              name: gem.name || 'Unknown',
              level: parseInt(gem.level || '1', 10),
              quality: parseInt(gem.quality || '0', 10),
              enabled: gem.enabled !== 'false',
            })),
          };
        });
      }
    }

    if (skillGroups.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: "No skill groups found. Add skills to your build first.",
          },
        ],
      };
    }

    // Analyze skill setup
    const optimization = analyzeSkillSetup(skillGroups, buildArchetype);
    const formatted = formatSkillOptimization(optimization);

    return {
      content: [
        {
          type: "text" as const,
          text: formatted,
        },
      ],
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to optimize skill links: ${errorMsg}`);
  }
}

/**
 * Create a budget build from scratch based on requirements
 * This is a planning/guidance tool, not a full build generator
 */
export async function handleCreateBudgetBuild(
  context: AdvancedOptimizationContext,
  requirements: {
    class_name: string;
    ascendancy?: string;
    main_skill: string;
    budget_level: 'low' | 'medium' | 'high';
    focus?: 'offense' | 'defense' | 'balanced';
  }
) {
  try {
    const { class_name, ascendancy, main_skill, budget_level, focus = 'balanced' } = requirements;

    let output = '=== Budget Build Planner ===\n\n';
    output += `Class: ${class_name}${ascendancy ? ` (${ascendancy})` : ''}\n`;
    output += `Main Skill: ${main_skill}\n`;
    output += `Budget Level: ${budget_level}\n`;
    output += `Focus: ${focus}\n\n`;

    // Budget definitions
    output += '=== Budget Guidelines ===\n';
    if (budget_level === 'low') {
      output += '- Total budget: < 50 Chaos Orbs\n';
      output += '- Use mostly self-found or vendor recipe items\n';
      output += '- Focus on life/resistance capped gear first\n';
    } else if (budget_level === 'medium') {
      output += '- Total budget: 50-500 Chaos Orbs\n';
      output += '- Can afford some build-enabling uniques\n';
      output += '- Aim for 5-link main skill\n';
    } else {
      output += '- Total budget: 500+ Chaos Orbs\n';
      output += '- Access to most uniques and well-rolled rares\n';
      output += '- 6-link possible\n';
    }
    output += '\n';

    // Skill setup recommendations
    output += '=== Recommended Skill Links ===\n';
    output += `Main Skill (${budget_level === 'high' ? '6' : budget_level === 'medium' ? '5' : '4'}-link):\n`;
    output += `  1. ${main_skill}\n`;
    output += '  2. [Damage Support - e.g., Added Fire, Elemental Damage with Attacks]\n';
    output += '  3. [Multiplier Support - e.g., Multistrike, Spell Echo]\n';
    output += '  4. [Utility Support - e.g., Faster Attacks, Inspiration]\n';

    if (budget_level !== 'low') {
      output += '  5. [Penetration or More Damage - e.g., Fire Penetration, Elemental Focus]\n';
    }
    if (budget_level === 'high') {
      output += '  6. [Advanced Support - e.g., Awakened gems, Empower]\n';
    }
    output += '\n';

    // Defensive layers
    output += '=== Defensive Layers ===\n';
    if (focus === 'defense' || focus === 'balanced') {
      output += '- Aim for 75% all elemental resistances (MANDATORY)\n';
      output += '- Target 4000+ life for softcore, 5000+ for hardcore\n';
      output += '- Use defensive auras (Determination, Grace, or Defiance Banner)\n';
      output += '- Get spell suppression if on right side of tree (Ranger/Shadow)\n';
      output += '- Consider block/evasion/armour based on class\n';
    } else {
      output += '- Minimum 3500 life and capped resistances\n';
      output += '- One defensive layer (block, evasion, or armour)\n';
    }
    output += '\n';

    // Gearing strategy
    output += '=== Budget Gearing Strategy ===\n';
    output += '**Weapons:**\n';
    if (budget_level === 'low') {
      output += '  - Use vendor recipes or essence crafting\n';
      output += '  - For spells: +1 to gems wands/sceptres\n';
      output += '  - For attacks: high physical DPS rares\n';
    } else {
      output += '  - Budget uniques that enable the build\n';
      output += '  - Well-rolled rare weapons with good DPS\n';
    }
    output += '\n**Armor:**\n';
    if (budget_level === 'low') {
      output += '  - Prioritize life and resistances\n';
      output += '  - Use essences for guaranteed mods\n';
      output += '  - Tabula Rasa for temporary 6-link (1 chaos)\n';
    } else {
      output += '  - Build-enabling chest uniques if applicable\n';
      output += '  - Aim for 5-6 link rare with life and resistances\n';
    }
    output += '\n**Accessories:**\n';
    output += '  - Fill in missing resistances\n';
    output += '  - Add damage stats where possible\n';
    output += '  - Get unique ring/amulet if budget allows\n';
    output += '\n';

    // Passive tree guidance
    output += '=== Passive Tree Priorities ===\n';
    output += '1. Path to key damage clusters for your skill\n';
    output += '2. Grab life/ES nodes along the way\n';
    output += '3. Get important keystones for your build\n';
    output += '4. Fill in jewel sockets if you have good jewels\n';
    output += '\nUse the `plan_tree` or `suggest_optimal_nodes` tools for specific recommendations!\n';
    output += '\n';

    // Leveling tips
    output += '=== Leveling Tips ===\n';
    output += `- Level with ${main_skill} or a similar skill if available early\n`;
    output += '- Use vendor recipe weapons (magic/rare rustic sash + weapon + whetstone)\n';
    output += '- Grab life nodes while leveling, respec for damage later if needed\n';
    output += '- Get movement speed boots ASAP\n';
    output += '- Don\'t worry about resistances until Act 5+\n';
    output += '\n';

    // Next steps
    output += '=== Next Steps ===\n';
    output += '1. Use `lua_new_build` to create a new build with this class\n';
    output += '2. Use `setup_skill_with_gems` to configure your main skill\n';
    output += '3. Use `suggest_optimal_nodes` to get passive tree recommendations\n';
    output += '4. Use `add_item` or `add_multiple_items` to equip budget gear\n';
    output += '5. Use `analyze_defenses` to check for defensive gaps\n';

    return {
      content: [
        {
          type: "text" as const,
          text: output,
        },
      ],
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to create budget build plan: ${errorMsg}`);
  }
}
