/**
 * Item Shopping Advisor
 *
 * Generates a "shopping spec" description of what stats/mods to look for
 * in a given gear slot, based on the currently loaded build. No trade API
 * required — the output is a human-readable guide for manual searching.
 */

import type { PoBLuaApiClient } from '../pobLuaBridge.js';
import { wrapHandler } from '../utils/errorHandling.js';

export interface ItemShoppingContext {
  getLuaClient: () => PoBLuaApiClient | null;
}

// Slot-specific knowledge: which mods matter and what the base options are
const SLOT_KNOWLEDGE: Record<string, {
  label: string;
  suggestedBases: string[];
  universalMods: string[];
  notes: string;
  tradeFilters: string[];
}> = {
  'Boots': {
    label: 'Boots',
    suggestedBases: [
      'Two-Toned Boots (Armour/ES) — most flexible, good for hybrid defences',
      'Sorcerer Boots — max ES for energy shield builds',
      'Crusader Boots — for high ES + movement speed',
    ],
    universalMods: ['30%+ Movement Speed (mandatory suffix)'],
    notes: 'Movement speed is non-negotiable — prioritize it first. Aim for 30-35%.',
    tradeFilters: ['Movement Speed ≥ 30%'],
  },
  'Gloves': {
    label: 'Gloves',
    suggestedBases: [
      'Spiked Gloves — adds melee physical damage (attack builds)',
      'Fingerless Silk Gloves — adds spell damage',
      'Crusader Gloves — ES/armour hybrid',
      'Paladin Gloves — armour/ES with influence potential',
    ],
    universalMods: [],
    notes: 'Gloves can roll accuracy, attack speed, and added damage — valuable for attack builds. Caster builds prioritize life/res/stats.',
    tradeFilters: [],
  },
  'Helmet': {
    label: 'Helmet',
    suggestedBases: [
      'Hubris Circlet — highest ES base for spell builds',
      'Eternal Burgonet — highest armour base',
      'Bone Helmet — 40% increased minion damage enchant (minion builds)',
      'Starkonja\'s Head / rare open prefix for elder mods',
    ],
    universalMods: [],
    notes: 'Check if your skill has a helmet enchantment — it can be a massive damage boost. Enchanted bases command a premium.',
    tradeFilters: [],
  },
  'Body Armour': {
    label: 'Body Armour',
    suggestedBases: [
      'Astral Plate — max life + strength, best for life builds',
      'Vaal Regalia — highest ES base for spell builds',
      'Occultist\'s Vestment — ES/int hybrid',
      'Sacred Chainmail — armour/ES hybrid',
    ],
    universalMods: [],
    notes: 'Body armour can have 6 sockets for your main skill. A 6-link is often the most impactful single upgrade. Also look for % increased max life or ES.',
    tradeFilters: ['6 linked sockets (if you need the 6-link)'],
  },
  'Amulet': {
    label: 'Amulet',
    suggestedBases: [
      'Onyx Amulet — +10-16 to all attributes (best universal base)',
      'Citrine Amulet — +20-30 STR/DEX',
      'Jade Amulet — high dexterity',
      'Lapis Amulet — high intelligence',
    ],
    universalMods: [],
    notes: 'Amulets can be anointed with Notable passive effects using Oils. Check which anointment is best for your build before buying.',
    tradeFilters: [],
  },
  'Belt': {
    label: 'Belt',
    suggestedBases: [
      'Stygian Vise — has an Abyss jewel socket for extra stats',
      'Heavy Belt — +35 strength (useful for coloring gear)',
      'Leather Belt — +25-40 maximum life implicit',
      'Crystal Belt — +60-80 ES implicit (ES builds)',
      'Vanguard Belt — armour/evasion implicit (hybrid)',
      'Cord Belt — Can be Anointed (anoint a Notable)',
    ],
    universalMods: [],
    notes: 'Stygian Vise is the best general belt because the Abyss jewel socket adds significant stats. Cord Belt is notable if you want to anoint a passive.',
    tradeFilters: [],
  },
  'Ring 1': {
    label: 'Ring',
    suggestedBases: [
      'Amethyst Ring — +35% chaos resistance implicit (great for chaos cap)',
      'Sapphire Ring — +35% cold resistance implicit',
      'Topaz Ring — +35% lightning resistance implicit',
      'Ruby Ring — +35% fire resistance implicit',
      'Two-Stone Ring — +12-16% to two elemental resistances',
      'Vermillion Ring — +26-30 maximum life implicit',
    ],
    universalMods: [],
    notes: 'Rings are the best slot for resistance stacking. Match the base implicit to your largest resistance gap.',
    tradeFilters: [],
  },
  'Ring 2': {
    label: 'Ring',
    suggestedBases: [
      'Amethyst Ring — +35% chaos resistance implicit',
      'Sapphire Ring — +35% cold resistance implicit',
      'Topaz Ring — +35% lightning resistance implicit',
      'Ruby Ring — +35% fire resistance implicit',
      'Two-Stone Ring — +12-16% to two elemental resistances',
      'Vermillion Ring — +26-30 maximum life implicit',
    ],
    universalMods: [],
    notes: 'Rings are the best slot for resistance stacking. Match the base implicit to your largest resistance gap.',
    tradeFilters: [],
  },
  'Weapon 1': {
    label: 'Weapon (Main Hand)',
    suggestedBases: [],
    universalMods: [],
    notes: 'Weapon upgrades depend heavily on your skill. Prioritize whichever damage type your skill scales with (physical DPS, elemental damage, spell damage, crit).',
    tradeFilters: [],
  },
  'Weapon 2': {
    label: 'Offhand / Shield',
    suggestedBases: [
      'Titanium Spirit Shield — highest ES shield',
      'Pinnacle Tower Shield — highest block chance',
      'Fossilised Spirit Shield — ES hybrid',
    ],
    universalMods: [],
    notes: 'If using a shield, prioritize block chance + ES or life. Check if "Chance to Block Spell Damage" is important for your build.',
    tradeFilters: [],
  },
};

function getSlotKnowledge(slot: string) {
  return SLOT_KNOWLEDGE[slot] ?? {
    label: slot,
    suggestedBases: [],
    universalMods: [],
    notes: '',
    tradeFilters: [],
  };
}

function resistLabel(pct: number): string {
  if (pct >= 40) return 'critical';
  if (pct >= 20) return 'high';
  if (pct >= 10) return 'moderate';
  return 'minor';
}

export async function handleFindItemUpgrades(
  context: ItemShoppingContext,
  args: {
    slot: string;
    build_name?: string;
    priority?: 'dps' | 'defense' | 'resistance' | 'balanced';
  }
): Promise<{ content: Array<{ type: string; text: string }> }> {
  return wrapHandler('find item upgrades', async () => {
    const { slot, priority = 'balanced' } = args;
    const slotInfo = getSlotKnowledge(slot);

    // Gather build context from Lua bridge
    let buildName: string | null = null;
    let buildClass: string | null = null;
    let currentItemName: string | null = null;
    let currentItemBase: string | null = null;
    let currentItemRarity: string | null = null;

    let life = 0;
    let es = 0;
    let fireResist = 75;
    let coldResist = 75;
    let lightningResist = 75;
    let chaosResist = 0;
    let fireOverCap = 0;
    let coldOverCap = 0;
    let lightningOverCap = 0;
    let totalDps = 0;
    let str = 0;
    let dex = 0;
    let int_ = 0;

    const luaClient = context.getLuaClient();
    if (luaClient) {
      try {
        const info = await luaClient.getBuildInfo();
        buildName = info?.name ?? null;
        buildClass = info?.className && info?.ascendancy
          ? `${info.className} (${info.ascendancy})`
          : (info?.className ?? null);
      } catch { /* build info unavailable */ }

      try {
        const stats = await luaClient.getStats([
          'Life', 'EnergyShield',
          'FireResist', 'ColdResist', 'LightningResist', 'ChaosResist',
          'FireResistOverCap', 'ColdResistOverCap', 'LightningResistOverCap',
          'TotalDPS', 'CombinedDPS',
          'Str', 'Dex', 'Int',
        ]);
        life = Number(stats?.Life ?? 0);
        es = Number(stats?.EnergyShield ?? 0);
        fireResist = Number(stats?.FireResist ?? 75);
        coldResist = Number(stats?.ColdResist ?? 75);
        lightningResist = Number(stats?.LightningResist ?? 75);
        chaosResist = Number(stats?.ChaosResist ?? 0);
        fireOverCap = Number(stats?.FireResistOverCap ?? 0);
        coldOverCap = Number(stats?.ColdResistOverCap ?? 0);
        lightningOverCap = Number(stats?.LightningResistOverCap ?? 0);
        totalDps = Number(stats?.CombinedDPS ?? stats?.TotalDPS ?? 0);
        str = Number(stats?.Str ?? 0);
        dex = Number(stats?.Dex ?? 0);
        int_ = Number(stats?.Int ?? 0);
      } catch { /* stats unavailable */ }

      try {
        const items = await luaClient.getItems();
        const equipped = Array.isArray(items)
          ? items.find((i: any) => i.slot === slot)
          : null;
        if (equipped) {
          currentItemName = equipped.name ?? equipped.title ?? null;
          currentItemBase = equipped.base ?? null;
          currentItemRarity = equipped.rarity ?? null;
        }
      } catch { /* items unavailable */ }
    }

    // Compute resistance gaps (to cap = 75%)
    const fireMissing = Math.max(0, 75 - fireResist);
    const coldMissing = Math.max(0, 75 - coldResist);
    const lightningMissing = Math.max(0, 75 - lightningResist);
    const chaosMissing = Math.max(0, 0 - chaosResist); // chaos target is ≥ 0%

    // Life/ES assessment
    const isESBuild = es > life;
    const lifeGood = isESBuild ? es >= 4000 : life >= 4500;
    const defenceLabel = isESBuild ? 'Energy Shield' : 'Life';
    const defenceValue = isESBuild ? es : life;

    // Build output
    let text = `=== Item Shopping Spec: ${slotInfo.label} ===\n`;

    if (buildName) {
      text += `Build: ${buildName}`;
      if (buildClass) text += ` — ${buildClass}`;
      text += '\n';
    }

    if (currentItemName || currentItemBase) {
      text += `Current: ${currentItemRarity ?? 'Unknown'} — ${currentItemName ?? ''}`;
      if (currentItemBase && currentItemBase !== currentItemName) text += ` (${currentItemBase})`;
      text += '\n';
    } else if (luaClient) {
      text += `Current: (nothing equipped in this slot)\n`;
    }

    text += '\n';

    // --- BUILD GAPS ---
    const gaps: string[] = [];
    if (!lifeGood) gaps.push(`${defenceLabel} is ${defenceValue.toLocaleString()} — target ${isESBuild ? '4000+' : '4500+'}`);
    if (fireMissing > 0) gaps.push(`Fire resist ${fireResist}% — ${fireMissing}% short of cap (${resistLabel(fireMissing)} priority)`);
    if (coldMissing > 0) gaps.push(`Cold resist ${coldResist}% — ${coldMissing}% short of cap (${resistLabel(coldMissing)} priority)`);
    if (lightningMissing > 0) gaps.push(`Lightning resist ${lightningResist}% — ${lightningMissing}% short of cap (${resistLabel(lightningMissing)} priority)`);
    if (chaosResist < 0) gaps.push(`Chaos resist ${chaosResist}% — negative, very dangerous`);
    else if (chaosResist < 20) gaps.push(`Chaos resist ${chaosResist}% — below 20%, consider improving`);

    if (gaps.length > 0) {
      text += `## Build Gaps\n`;
      for (const g of gaps) text += `- ${g}\n`;
      text += '\n';
    } else if (luaClient) {
      text += `## Build Status\n`;
      text += `- ${defenceLabel}: ${defenceValue.toLocaleString()} ✓\n`;
      text += `- Resistances: Fire ${fireResist}% / Cold ${coldResist}% / Lightning ${lightningResist}% / Chaos ${chaosResist}% ✓\n`;
      text += `- No critical gaps — this is a quality-of-life upgrade\n`;
      text += '\n';
    }

    // --- PRIORITY MODS ---
    text += `## Priority Mods (look for these first)\n`;

    // Universal slot mods
    for (const mod of slotInfo.universalMods) {
      text += `- ${mod}\n`;
    }

    // Resistance mods based on gaps
    const resMods: string[] = [];
    if (fireMissing >= 10) resMods.push(`+${fireMissing + 5}–${fireMissing + 20}% to Fire Resistance`);
    if (coldMissing >= 10) resMods.push(`+${coldMissing + 5}–${coldMissing + 20}% to Cold Resistance`);
    if (lightningMissing >= 10) resMods.push(`+${lightningMissing + 5}–${lightningMissing + 20}% to Lightning Resistance`);
    if (chaosResist < 0) resMods.push(`+${Math.abs(chaosResist) + 10}–${Math.abs(chaosResist) + 30}% to Chaos Resistance`);

    if (resMods.length > 0) {
      for (const mod of resMods) text += `- ${mod}\n`;
    }

    // Defence mods
    if (!lifeGood) {
      if (isESBuild) {
        text += `- +80–120 to Maximum Energy Shield\n`;
        text += `- % increased Energy Shield\n`;
      } else {
        text += `- +80–120 to Maximum Life\n`;
      }
    } else {
      // Already fine — still suggest it as a secondary improvement
      if (isESBuild) {
        text += `- Additional Energy Shield (build is fine but more is always better)\n`;
      } else {
        text += `- Additional Life (build is fine but more is always better)\n`;
      }
    }

    // Priority focus overrides
    if (priority === 'dps') {
      text += `- Damage mods relevant to your skill (added damage, crit multiplier, skill-specific stats)\n`;
    }
    if (priority === 'defense') {
      text += `- Armour, Evasion, or Energy Shield (whichever matches your defensive layer)\n`;
      text += `- Block chance (if using a shield)\n`;
    }

    text += '\n';

    // --- SECONDARY MODS ---
    text += `## Secondary Mods (nice to have)\n`;
    const secondaryRes: string[] = [];
    // Overcap suggestions — if already capped, small top-ups are still useful for reflect/map mods
    if (fireMissing === 0 && fireOverCap < 10) secondaryRes.push('Fire resistance (extra overcap)');
    if (coldMissing === 0 && coldOverCap < 10) secondaryRes.push('Cold resistance (extra overcap)');
    if (lightningMissing === 0 && lightningOverCap < 10) secondaryRes.push('Lightning resistance (extra overcap)');
    if (chaosResist >= 0 && chaosResist < 40) secondaryRes.push('Chaos resistance (40%+ is a solid target)');

    if (secondaryRes.length > 0) {
      for (const r of secondaryRes) text += `- ${r}\n`;
    }

    // Attribute checks — only flag if very low
    if (str < 100) text += `- Strength (currently ${str} — may need more for gear/gem requirements)\n`;
    if (dex < 100 && (slot === 'Boots' || slot === 'Gloves' || slot === 'Ring 1' || slot === 'Ring 2')) {
      text += `- Dexterity (currently ${dex})\n`;
    }
    if (int_ < 100 && (slot === 'Helmet' || slot === 'Amulet' || slot === 'Ring 1' || slot === 'Ring 2')) {
      text += `- Intelligence (currently ${int_})\n`;
    }

    text += `- Any open prefix/suffix for bench crafting a needed stat\n`;
    text += '\n';

    // --- BASE TYPE RECOMMENDATIONS ---
    if (slotInfo.suggestedBases.length > 0) {
      text += `## Suggested Bases\n`;
      for (const base of slotInfo.suggestedBases) {
        text += `- ${base}\n`;
      }
      text += '\n';
    }

    // --- TRADE SEARCH GUIDANCE ---
    text += `## How to Search on pathofexile.com/trade\n`;
    text += `1. Go to the trade site and select your league\n`;
    text += `2. Set Item Type: ${slotInfo.label}\n`;

    const filters: string[] = [...slotInfo.tradeFilters];
    if (fireMissing >= 10) filters.push(`Fire Resistance ≥ ${fireMissing}`);
    if (coldMissing >= 10) filters.push(`Cold Resistance ≥ ${coldMissing}`);
    if (lightningMissing >= 10) filters.push(`Lightning Resistance ≥ ${lightningMissing}`);
    if (chaosResist < 0) filters.push(`Chaos Resistance ≥ ${Math.abs(chaosResist)}`);
    if (!lifeGood && !isESBuild) filters.push('Maximum Life ≥ 60');
    if (!lifeGood && isESBuild) filters.push('Maximum Energy Shield ≥ 60');

    if (filters.length > 0) {
      text += `3. Add stat filters:\n`;
      for (const f of filters) text += `   - ${f}\n`;
      text += `4. Start broad — too many filters means few results. Add one filter at a time.\n`;
    } else {
      text += `3. Start with just the item type, then add stat filters one at a time to narrow results.\n`;
    }
    text += `5. Sort by price (cheapest first) and inspect items to compare the full mod list.\n`;
    text += `6. For rare items, you'll rarely find the exact item you want — prioritize the most important stats and be flexible on secondaries.\n`;
    text += '\n';

    // --- SLOT NOTES ---
    if (slotInfo.notes) {
      text += `## Notes\n${slotInfo.notes}\n`;
    }

    return { content: [{ type: 'text', text }] };
  });
}
