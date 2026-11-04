import type { PoBLuaApiClient, SocketGroupEntry } from "../pobLuaBridge.js";
import { wrapHandler } from "../utils/errorHandling.js";

interface JewelAdvisorContext {
  getLuaClient: () => PoBLuaApiClient | null;
  ensureLuaClient: () => Promise<void>;
}

interface WatchersEyeMod {
  mod: string;
  tier: 'S' | 'A' | 'B';
  note: string;
}

// Watcher's Eye mods indexed by aura name
const WATCHERS_EYE_MODS: Record<string, WatchersEyeMod[]> = {
  Hatred: [
    { mod: 'Penetrate X% Cold Resistance while affected by Hatred', tier: 'S', note: 'Best-in-slot for cold damage builds' },
    { mod: 'Gain X% of Cold Damage as Extra Chaos while affected by Hatred', tier: 'A', note: 'Chaos conversion amplifier' },
    { mod: 'X% increased Cold Damage while affected by Hatred', tier: 'B', note: 'Flat cold damage increase' },
  ],
  Anger: [
    { mod: 'Penetrate X% Fire Resistance while affected by Anger', tier: 'S', note: 'Best-in-slot for fire damage builds' },
    { mod: 'Gain X% of Fire Damage as Extra Chaos while affected by Anger', tier: 'A', note: 'Chaos conversion amplifier' },
    { mod: 'X% increased Fire Damage while affected by Anger', tier: 'B', note: 'Flat fire damage increase' },
  ],
  Wrath: [
    { mod: 'Penetrate X% Lightning Resistance while affected by Wrath', tier: 'S', note: 'Best-in-slot for lightning builds' },
    { mod: 'Gain X% of Lightning Damage as Extra Chaos while affected by Wrath', tier: 'A', note: 'Chaos conversion amplifier' },
    { mod: 'X% increased Lightning Damage while affected by Wrath', tier: 'B', note: 'Flat lightning damage increase' },
  ],
  Precision: [
    { mod: 'X% increased Critical Strike Chance while affected by Precision', tier: 'S', note: 'Best crit scaling for attack builds' },
    { mod: 'X% of Physical Attack Damage Leeched as Life while affected by Precision', tier: 'A', note: 'Strong sustain for attack builds' },
    { mod: 'Gain X% of Physical Damage as Extra Lightning while affected by Precision', tier: 'B', note: 'Damage conversion' },
  ],
  Grace: [
    { mod: 'X% chance to Dodge Attack Hits while affected by Grace', tier: 'S', note: 'Huge avoidance for evasion builds' },
    { mod: 'Unaffected by Bleeding while affected by Grace', tier: 'A', note: 'Frees up a flask slot' },
    { mod: 'X% increased Evasion Rating while affected by Grace', tier: 'B', note: 'More evasion stacking' },
  ],
  Determination: [
    { mod: 'X% of Armour applies to Chaos Damage taken while affected by Determination', tier: 'S', note: 'Incredible for armour-stacking builds' },
    { mod: 'Recover X% of Life when you Block while affected by Determination', tier: 'A', note: 'Good for block builds' },
    { mod: 'X% increased Armour while affected by Determination', tier: 'B', note: 'More armour stacking' },
  ],
  Zealotry: [
    { mod: 'Consecrated Ground you create while affected by Zealotry grants X% increased Spell Damage', tier: 'S', note: 'Best for spell caster builds' },
    { mod: 'Spells have X% increased Critical Strike Chance while affected by Zealotry', tier: 'A', note: 'Strong crit scaling for spell builds' },
  ],
  Discipline: [
    { mod: 'X% of Damage taken from Hits is Energy Shield before Life while affected by Discipline', tier: 'S', note: 'Massive defensive layer for ES builds' },
    { mod: 'Gain X Energy Shield when you Block while affected by Discipline', tier: 'S', note: 'Essential for ES block builds' },
    { mod: 'Recover X% of Energy Shield when you use a Flask while affected by Discipline', tier: 'A', note: 'Flask synergy for ES builds' },
  ],
  Malevolence: [
    { mod: 'Regenerate X Life per second for each Debuff on Enemies while affected by Malevolence', tier: 'A', note: 'Sustain for DoT builds' },
    { mod: 'X% increased Damage over Time while affected by Malevolence', tier: 'A', note: 'Generic DoT scaling' },
  ],
  Haste: [
    { mod: 'X% increased Attack Speed while affected by Haste', tier: 'A', note: 'Attack speed stacking' },
    { mod: 'X% increased Cast Speed while affected by Haste', tier: 'A', note: 'Cast speed scaling' },
  ],
  Purity_of_Elements: [
    { mod: 'Unaffected by Elemental Ailments while affected by Purity of Elements', tier: 'S', note: 'Frees up all ailment flask slots' },
  ],
};

const KNOWN_AURA_NAMES = new Set(Object.keys(WATCHERS_EYE_MODS));

function detectActiveAuras(groups: SocketGroupEntry[]): string[] {
  const found: string[] = [];
  for (const group of groups) {
    for (const gem of (group.gems ?? [])) {
      const name: string = gem.name || '';
      if (KNOWN_AURA_NAMES.has(name)) found.push(name);
      // Handle "Purity of Elements" which has an underscore key
      if (name === 'Purity of Elements') found.push('Purity_of_Elements');
    }
  }
  return [...new Set(found)];
}

export async function handleSuggestWatchersEye(context: JewelAdvisorContext) {
  return wrapHandler('suggest watchers eye', async () => {
  await context.ensureLuaClient();
  const luaClient = context.getLuaClient();
  if (!luaClient) throw new Error('Lua bridge not active. Use lua_load_build first.');

  const skills = await luaClient.getSkills();
  const groups: SocketGroupEntry[] = skills?.groups ?? [];
  const activeAuras = detectActiveAuras(groups);

  let output = "=== Watcher's Eye Recommendations ===\n\n";

  if (activeAuras.length === 0) {
    output += 'No recognized auras detected in the skill setup.\n';
    output += 'Ensure auras (Hatred, Anger, Grace, Precision, Discipline, etc.) are in a socket group.\n';
    return { content: [{ type: 'text' as const, text: output }] };
  }

  output += `**Active Auras Detected:** ${activeAuras.map(a => a.replace('_', ' ')).join(', ')}\n\n`;
  output += `A Watcher's Eye rolls mods for 2–3 of your active auras. Aim for S-tier mods across different auras.\n\n`;

  for (const aura of activeAuras) {
    const mods = WATCHERS_EYE_MODS[aura];
    if (!mods) continue;
    output += `### ${aura.replace('_', ' ')}\n`;
    for (const m of mods) {
      const icon = m.tier === 'S' ? '⭐' : m.tier === 'A' ? '🔷' : '🔹';
      output += `  ${icon} [${m.tier}] ${m.mod}\n`;
      output += `     _${m.note}_\n`;
    }
    output += '\n';
  }

  // Suggest best 2-mod combinations from S-tier mods across different auras
  const sTierByAura = activeAuras
    .map(a => ({ aura: a.replace('_', ' '), mods: (WATCHERS_EYE_MODS[a] ?? []).filter(m => m.tier === 'S') }))
    .filter(x => x.mods.length > 0);

  if (sTierByAura.length >= 2) {
    output += '**Best 2-mod combinations (S-tier):**\n';
    for (let i = 0; i < Math.min(sTierByAura.length, 4); i++) {
      for (let j = i + 1; j < Math.min(sTierByAura.length, 4); j++) {
        const a = sTierByAura[i];
        const b = sTierByAura[j];
        output += `  - ${a.aura}: ${a.mods[0].mod.slice(0, 45)}… + ${b.aura}: ${b.mods[0].mod.slice(0, 45)}…\n`;
      }
    }
    output += '\n';
  }

  output += `_Use \`get_currency_rates\` to estimate current market prices for specific mods._\n`;

  return { content: [{ type: 'text' as const, text: output }] };
  });
}
