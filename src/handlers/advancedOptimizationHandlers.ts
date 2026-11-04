import { toFiniteNumber, type PoBLuaApiClient } from "../pobLuaBridge.js";
import { noteIgnoredError } from '../utils/errorHandling.js';
import type { BuildService } from "../services/buildService.js";
import { activeItemSlotsOf, itemTextMapOf } from "../utils/pobXml.js";
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
import { resolveBuildFile } from "../utils/pathSanitizer.js";
import { loadBuildIfDifferent, readNamedBuild } from "../utils/namedBuild.js";
import { activeSkillSet, asArray } from "../utils/xmlCollections.js";

interface AdvancedOptimizationContext {
  buildService: BuildService;
  pobDirectory: string;
  getLuaClient: () => PoBLuaApiClient | null;
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
    try {
      await context.ensureLuaClient();
    } catch (e) { noteIgnoredError("Lua unavailable — fall back to XML below", e); }
    const luaClient = context.getLuaClient();

    if (luaClient) {
      // Load build into Lua only if a different build (or no build) is currently loaded.
      // Preserves any select_spec / select_item_set changes made in the current session.
      if (buildName) {
        await loadBuildIfDifferent(luaClient, buildName, context.pobDirectory);
      }

      try {
        const luaItems = await luaClient.getItems();
        items = luaItems.map((item) => ({
          slot: item.slot,
          name: item.name,
          baseName: item.baseName,
          rarity: item.rarity,
          shown: item.shown,
        }));

        // Get stats from Lua
        const luaStats = await luaClient.getStats();
        stats = {
          life: toFiniteNumber(luaStats.Life),
          energyShield: toFiniteNumber(luaStats.EnergyShield),
          evasion: toFiniteNumber(luaStats.Evasion),
          armour: toFiniteNumber(luaStats.Armour),
          dps: toFiniteNumber(luaStats.TotalDPS),
          fireRes: toFiniteNumber(luaStats['FireResist']),
          coldRes: toFiniteNumber(luaStats['ColdResist']),
          lightningRes: toFiniteNumber(luaStats['LightningResist']),
          chaosRes: toFiniteNumber(luaStats['ChaosResist']),
        };

        // Get class info from tree
        const tree = await luaClient.getTree();
        const classNames = ['Scion', 'Marauder', 'Ranger', 'Witch', 'Duelist', 'Templar', 'Shadow'];
        className = classNames[tree.classId] || 'Unknown';
      } catch (error) {
        if (!buildName) {
          throw new Error(
            'No build loaded in Lua client and no build_name provided. Load a build first or provide build_name.'
          );
        }
        // Fall through to XML parsing below
      }
    }

    // Fall back to XML if no Lua data
    if (items.length === 0 && buildName) {
      const build = await context.buildService.readBuild(buildName);

      className = className || build.Build?.className;
      ascendClassName = build.Build?.ascendClassName;

      // Extract items from XML — via the shared active-set normalisation:
      // ItemSet is an array whenever a build has >1 gear set, which the
      // previous single-object read silently mishandled.
      const xmlSlots = activeItemSlotsOf(build);
      if (xmlSlots.length > 0) {
        // Slot elements carry no item text - the bodies live in Items/Item,
        // joined by itemId (same lookup ShoppingListService uses). No engine
        // here, so hidden-empty gating relies on treeVersion alone; an empty
        // Graft/Ring 3 that the engine WOULD hide is simply not flagged in
        // this fallback path (better silence than false demands).
        const itemTexts = itemTextMapOf(build);
        items = xmlSlots.map((slot) => {
          const filled = Boolean(slot.itemId && slot.itemId !== '0');
          const itemText = filled ? itemTexts.get(String(slot.itemId)) ?? '' : '';
          const lines = itemText.split('\n');
          const rarity = lines.find((l) => /^Rarity:/.test(l.trim()))?.split(':').slice(1).join(':').trim();
          const name = lines.find((l) => l.trim() !== '' && !/^(Item Class|Rarity):/.test(l.trim()))?.trim() ?? '';

          return {
            slot: slot.name || 'Unknown',
            name,
            rarity,
          };
        });
      }

      // Extract stats from XML
      if (!stats && build.Build?.PlayerStat) {
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
    try {
      await context.ensureLuaClient();
    } catch (e) { noteIgnoredError("Lua unavailable — fall back to XML below", e); }
    const luaClient = context.getLuaClient();

    if (luaClient) {
      // Load build if buildName provided
      if (buildName) {
        const xml = await readNamedBuild(buildName, context.pobDirectory);
        await luaClient.loadBuildXml(xml, buildName, resolveBuildFile(buildName, context.pobDirectory));
      }

      try {
        const skillData = await luaClient.getSkills();

        if (skillData && skillData.groups) {
          skillGroups = skillData.groups.map((group) => ({
            index: group.index,
            label: group.label,
            slot: group.slot,
            enabled: group.enabled ?? true,
            isMainSkill: group.index === skillData.mainSocketGroup,
            gems: group.gems || group.skills?.map((skillName: string) => ({ name: skillName })) || [],
            includeInFullDPS: group.includeInFullDPS,
          }));
        }

        // Get build type from tree/stats
        const tree = await luaClient.getTree();
        const stats = await luaClient.getStats(['TotalDPS', 'Life', 'EnergyShield']);
        const classNames = ['Scion', 'Marauder', 'Ranger', 'Witch', 'Duelist', 'Templar', 'Shadow'];
        const className = classNames[tree.classId];

        buildArchetype = inferBuildArchetype(className, undefined, {
          life: toFiniteNumber(stats.Life),
          energyShield: toFiniteNumber(stats.EnergyShield),
          dps: toFiniteNumber(stats.TotalDPS),
        });
      } catch (error) {
        if (!buildName) {
          throw new Error(
            'No build loaded in Lua client and no build_name provided. Load a build first or provide build_name.'
          );
        }
      }
    }

    // Fall back to XML if Lua data was unavailable
    if (buildName && skillGroups.length === 0) {
      const build = await context.buildService.readBuild(buildName);

      buildArchetype = inferBuildArchetype(
        build.Build?.className,
        build.Build?.ascendClassName
      );

      // Extract skills from XML
      const skills = asArray(activeSkillSet(build)?.Skill);
      if (skills.length > 0) {
        skillGroups = skills.map((skill, idx: number) => {
          const gems = Array.isArray(skill.Gem) ? skill.Gem : skill.Gem ? [skill.Gem] : [];

          return {
            index: idx + 1,
            label: skill.label,
            slot: skill.slot,
            enabled: skill.enabled !== 'false',
            isMainSkill: idx === 0, // Assume first is main
            gems: gems.map((gem) => ({
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
  buildName: string,
  budgetTier: string = 'league-start'
) {
  try {
    // Map budget tier to internal level
    const budgetTierMap: Record<string, 'low' | 'medium' | 'high'> = {
      'league-start': 'low',
      'low': 'low',
      'medium': 'medium',
      'endgame': 'high',
      'high': 'high',
    };
    const budget_level = budgetTierMap[budgetTier] || 'low';

    // Read build info from XML
    const build = await context.buildService.readBuild(buildName);
    const class_name = build.Build?.className || 'Unknown';
    const ascendancy = build.Build?.ascendClassName;

    // Get main skill from first skill group
    let main_skill = 'your main skill';
    {
      const skills = asArray(activeSkillSet(build)?.Skill);
      const firstSkill = skills[0];
      if (firstSkill?.Gem) {
        const gems = Array.isArray(firstSkill.Gem) ? firstSkill.Gem : [firstSkill.Gem];
        const activeGem = gems.find((g) => g.enabled !== 'false' && !g.name?.includes('Support'));
        if (activeGem?.name) main_skill = activeGem.name;
      }
    }

    const outputLines: string[] = [
      '=== Budget Build Guide ===',
      '',
      `Build: ${buildName}`,
      `Class: ${class_name}${ascendancy ? ` (${ascendancy})` : ''}`,
      `Main Skill: ${main_skill}`,
      `Budget Tier: ${budgetTier}`,
      '',
      '=== Budget Guidelines ===',
    ];

    if (budget_level === 'low') {
      outputLines.push(
        '- Total budget: < 50 Chaos Orbs',
        '- Use mostly self-found or vendor recipe items',
        '- Focus on life/resistance capped gear first'
      );
    } else if (budget_level === 'medium') {
      outputLines.push(
        '- Total budget: 50-500 Chaos Orbs',
        '- Can afford some build-enabling uniques',
        '- Aim for 5-link main skill'
      );
    } else {
      outputLines.push(
        '- Total budget: 500+ Chaos Orbs',
        '- Access to most uniques and well-rolled rares',
        '- 6-link possible'
      );
    }
    outputLines.push('');

    // Skill setup recommendations
    outputLines.push(
      '=== Recommended Skill Links ===',
      `Main Skill (${budget_level === 'high' ? '6' : budget_level === 'medium' ? '5' : '4'}-link):`,
      `  1. ${main_skill}`,
      '  2. [Damage Support - e.g., Added Fire, Elemental Damage with Attacks]',
      '  3. [Multiplier Support - e.g., Multistrike, Spell Echo]',
      '  4. [Utility Support - e.g., Faster Attacks, Inspiration]'
    );

    if (budget_level !== 'low') {
      outputLines.push('  5. [Penetration or More Damage - e.g., Fire Penetration, Elemental Focus]');
    }
    if (budget_level === 'high') {
      outputLines.push('  6. [Advanced Support - e.g., Exceptional gems, Empower]');
    }
    outputLines.push('');

    // Defensive layers
    outputLines.push(
      '=== Defensive Layers ===',
      '- Aim for 75% all elemental resistances (MANDATORY)',
      '- Target 4000+ life for softcore, 5000+ for hardcore',
      '- Use defensive auras (Determination, Grace, or Defiance Banner)',
      '- Get spell suppression if on right side of tree (Ranger/Shadow)',
      '- Consider block/evasion/armour based on class',
      ''
    );

    // Gearing strategy
    outputLines.push('=== Budget Gearing Strategy ===', '**Weapons:**');
    if (budget_level === 'low') {
      outputLines.push(
        '  - Use vendor recipes or essence crafting',
        '  - For spells: +1 to gems wands/sceptres',
        '  - For attacks: high physical DPS rares'
      );
    } else {
      outputLines.push(
        '  - Budget uniques that enable the build',
        '  - Well-rolled rare weapons with good DPS'
      );
    }
    outputLines.push('**Armor:**');
    if (budget_level === 'low') {
      outputLines.push(
        '  - Prioritize life and resistances',
        '  - Use essences for guaranteed mods',
        '  - Tabula Rasa for temporary 6-link (1 chaos)'
      );
    } else {
      outputLines.push(
        '  - Build-enabling chest uniques if applicable',
        '  - Aim for 5-6 link rare with life and resistances'
      );
    }
    outputLines.push(
      '**Accessories:**',
      '  - Fill in missing resistances',
      '  - Add damage stats where possible',
      '  - Get unique ring/amulet if budget allows',
      ''
    );

    // Passive tree guidance
    outputLines.push(
      '=== Passive Tree Priorities ===',
      '1. Path to key damage clusters for your skill',
      '2. Grab life/ES nodes along the way',
      '3. Get important keystones for your build',
      '4. Fill in jewel sockets if you have good jewels',
      '',
      'Use the `suggest_optimal_nodes` or `get_passive_upgrades` tools for specific recommendations!',
      ''
    );

    // Leveling tips
    outputLines.push(
      '=== Leveling Tips ===',
      `- Level with ${main_skill} or a similar skill if available early`,
      '- Use vendor recipe weapons (magic/rare rustic sash + weapon + whetstone)',
      '- Grab life nodes while leveling, respec for damage later if needed',
      '- Get movement speed boots ASAP',
      "- Don't worry about resistances until Act 5+",
      ''
    );

    // Next steps
    outputLines.push(
      '=== Next Steps ===',
      '1. Use `lua_new_build` to create a new build with this class',
      '2. Use `setup_skill_with_gems` to configure your main skill',
      '3. Use `suggest_optimal_nodes` to get passive tree recommendations',
      '4. Use `add_item` or `add_multiple_items` to equip budget gear',
      '5. Use `analyze_defenses` to check for defensive gaps'
    );
    const output = outputLines.join('\n');

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
