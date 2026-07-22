/**
 * Leveling Handlers
 *
 * Generates act-by-act leveling progression guides using the build's class,
 * main skill, and ascendancy. Reads from the Lua bridge if available, or
 * falls back to user-provided args.
 */

import type { PoBLuaApiClient } from "../pobLuaBridge.js";
import { wrapHandler } from "../utils/errorHandling.js";

export interface LevelingContext {
  getLuaClient: () => PoBLuaApiClient | null;
  ensureLuaClient: () => Promise<void>;
}

// Act-by-act milestone levels (PoE 1 campaign)
const ACT_MILESTONES = [
  { act: 1, level: 12, label: 'End of Act 1 (Merveil)' },
  { act: 2, level: 22, label: 'End of Act 2 (Vaal Oversoul)' },
  { act: 3, level: 32, label: 'End of Act 3 (Dominus)' },
  { act: 4, level: 40, label: 'End of Act 4 (Malachai)' },
  { act: 5, level: 46, label: 'End of Act 5 (Kitava)' },
  { act: 6, level: 52, label: 'End of Act 6 (Tsoagoth)' },
  { act: 7, level: 58, label: 'End of Act 7 (Arakaali)' },
  { act: 8, level: 64, label: 'End of Act 8 (Lunaris & Solaris)' },
  { act: 9, level: 68, label: 'End of Act 9 (The Depraved Trinity)' },
  { act: 10, level: 70, label: 'End of Act 10 / Maps (Kitava)' },
];

const CLASS_STARTER_SKILLS: Record<string, { early: string; links: string[] }> = {
  Marauder: { early: 'Infernal Blow or Heavy Strike', links: ['Maim Support', 'Onslaught Support'] },
  Ranger: { early: 'Splitting Steel or Burning Arrow', links: ['Pierce Support', 'Lesser Multiple Projectiles'] },
  Witch: { early: 'Freezing Pulse or Arc', links: ['Arcane Surge Support', 'Added Lightning Damage'] },
  Duelist: { early: 'Cleave or Splitting Steel', links: ['Maim Support', 'Onslaught Support'] },
  Templar: { early: 'Holy Flame Totem or Arc', links: ['Arcane Surge Support', 'Controlled Destruction'] },
  Shadow: { early: 'Viper Strike or Freezing Pulse', links: ['Added Chaos Damage', 'Onslaught Support'] },
  Scion: { early: 'Cleave or Arc', links: ['Onslaught Support', 'Added Lightning Damage'] },
};

const ASCENDANCY_UNLOCK = { normal: 36, cruel: 55, merciless: 68 };

export async function handlePlanLeveling(
  context: LevelingContext,
  args: {
    build_name?: string;
    class_name?: string;
    main_skill?: string;
    ascendancy?: string;
  }
) {
  return wrapHandler('plan leveling', async () => {
  let className = args.class_name;
  let mainSkill = args.main_skill;
  let ascendancy = args.ascendancy;

  // Try to read info from the currently loaded Lua build
  const luaClient = context.getLuaClient();
  if (luaClient) {
    try {
      const info = await luaClient.getBuildInfo();
      className = className || info.className;
      ascendancy = ascendancy || info.ascendClassName;

      if (!mainSkill) {
        const skills = await luaClient.getSkills();
        if (skills?.groups?.length > 0) {
          const mainGroup =
            skills.groups.find((g: any) => g.index === skills.mainSocketGroup) ||
            skills.groups[0];
          mainSkill =
            mainGroup?.gems?.[0]?.name ||
            mainGroup?.skills?.[0] ||
            'your main skill';
        }
      }
    } catch {
      // Fall through and use whatever was provided in args
    }
  }

  // Defaults when neither Lua nor args provide a value
  className = className || 'Witch';
  mainSkill = mainSkill || 'your main skill';
  ascendancy = ascendancy || 'Unknown';

  const starter = CLASS_STARTER_SKILLS[className] || CLASS_STARTER_SKILLS['Witch'];

  let output = `# Leveling Guide: ${className} (${ascendancy})\n`;
  output += `**Main Skill:** ${mainSkill}\n\n`;

  output += `## Before Your Main Skill is Available\n`;
  output += `Use: **${starter.early}**\n`;
  output += `Support with: ${starter.links.join(', ')}\n\n`;

  output += `## Act Milestones\n\n`;

  for (const m of ACT_MILESTONES) {
    output += `### Act ${m.act} (Level ~${m.level}) — ${m.label}\n`;

    if (m.level <= 28) {
      output += `- Still leveling with starter skill; switch to ${mainSkill} when available (usually level 12-18)\n`;
    } else {
      output += `- Should be running ${mainSkill} in ${m.level >= 38 ? 'a 4-link' : '3-link'}\n`;
    }

    if (m.level >= ASCENDANCY_UNLOCK.normal && m.level < ASCENDANCY_UNLOCK.cruel) {
      output += `- **Do Labyrinth (Normal)** — unlock first 2 ascendancy points\n`;
    }
    if (m.level >= ASCENDANCY_UNLOCK.cruel && m.level < ASCENDANCY_UNLOCK.merciless) {
      output += `- **Do Labyrinth (Cruel)** — unlock next 2 ascendancy points\n`;
    }
    if (m.level >= ASCENDANCY_UNLOCK.merciless) {
      output += `- **Do Labyrinth (Merciless)** when ready — final 2 ascendancy points\n`;
    }

    output += `- Resist priority: cap Fire/Cold/Lightning at each difficulty transition\n`;
    output += '\n';
  }

  output += `## Gem Link Progression\n\n`;
  output += `| Milestone | Links | Setup |\n`;
  output += `|-----------|-------|-------|\n`;
  output += `| Level 1-12 | 2L | ${mainSkill} + Onslaught |\n`;
  output += `| Level 12-28 | 3L | ${mainSkill} + 2 key supports |\n`;
  output += `| Level 28-50 | 4L | ${mainSkill} + 3 supports |\n`;
  output += `| Level 50-70 | 5L | ${mainSkill} + 4 supports |\n`;
  output += `| Endgame | 6L | ${mainSkill} + 5 supports |\n\n`;

  output += `## Key Tips\n`;
  output += `- Grab **movement speed boots** in Act 2 — most impactful early upgrade\n`;
  output += `- Vendor recipe for leveling weapons: magic weapon + rustic sash + blacksmith's whetstone = weapon with % physical damage\n`;
  output += `- Prioritize resistances over damage on gear — you will feel the difference at each act\n`;
  output += `- Allocate ascendancy passives after each Lab — they are huge power spikes\n`;
  output += `- Level your 6-link gems in a weapon swap to get XP while using weaker links\n\n`;

  output += `## Passive Tree Priority Order\n`;
  output += `1. Path to your class's key damage cluster\n`;
  output += `2. Life nodes along the way\n`;
  output += `3. Resistance nodes near your path\n`;
  output += `4. Ascendancy path once you know your lab routing\n`;
  output += `5. Jewel sockets when you have good leveling jewels\n\n`;

  output += `_Use \`get_passive_upgrades\` with a loaded build for specific node recommendations._\n`;

  return { content: [{ type: 'text' as const, text: output }] };
  });
}
