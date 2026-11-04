import type { PoBLuaApiClient, StatsExport } from '../pobLuaBridge.js';
import type { PoeNinjaClient } from '../services/poeNinjaClient.js';
import { fetchBaseModData } from '../services/craftingDataService.js';
import { wrapHandler, noteIgnoredError,} from '../utils/errorHandling.js';

interface CraftingAdvisorContext {
  getLuaClient: () => PoBLuaApiClient | null;
  ninjaClient: PoeNinjaClient;
}

interface CraftingResponseInput {
  base: string;
  slot: string;
  desiredMods: string[];
  modData: string;
  currencyRates: { chaos: number; divine: number; live: boolean };
  buildContext: StatsExport | null;
  ilvl?: number;
  budget?: 'low' | 'medium' | 'high';
}

const CRAFTING_METHODS = `
## Always-Available Crafting Methods

1. **Chaos spam** — buy rares of the base, chaos orb repeatedly. Good when many mods are acceptable.
2. **Alt/aug/regal** — start magic, alt/aug for desired prefix+suffix, regal to rare. Good for 2-mod targets.
3. **Essence** — guarantees one specific mod. Best anchor point for crafting.
4. **Fossil/resonator** — biases mod pool toward/away from tags. Best for specific combos.
5. **Bench craft** — deterministically adds/removes one mod. Always used to finish an item.
6. **Scour + annul** — remove unwanted mods from a rare. Pairs with exalt slam.
7. **Exalt slam** — adds a random mod to a rare. High variance but can finish items.
8. **Meta-crafting** — "Prefixes Cannot Be Changed" / "Suffixes Cannot Be Changed" / "Cannot Roll Attack Mods". Lets you safely scour half the item.
`;

/**
 * Builds the crafting advisor response text from structured input.
 * Pure function — no async, no side effects — so it is easily unit tested.
 */
export function buildCraftingResponse(input: CraftingResponseInput): string {
  const { base, slot, desiredMods, modData, currencyRates, buildContext } = input;

  let text = `=== Crafting Advisor: ${base} (${slot}) ===\n\n`;

  text += `## Target Mods\n`;
  if (desiredMods.length > 0) {
    desiredMods.forEach(mod => { text += `- ${mod}\n`; });
  } else {
    text += `(No specific mods requested — use build context below)\n`;
  }
  text += '\n';

  if (input.ilvl !== undefined || input.budget !== undefined) {
    text += `## Crafting Parameters\n`;
    if (input.ilvl !== undefined) text += `- Item Level: ${input.ilvl} (affects reachable mod tiers)\n`;
    if (input.budget !== undefined) text += `- Budget: ${input.budget}\n`;
    text += '\n';
  }

  if (buildContext) {
    text += `## Build context\n`;
    Object.entries(buildContext).forEach(([k, v]) => {
      text += `- ${k}: ${v}\n`;
    });
    text += '\n';
  }

  text += `## Currency Rates\n`;
  text += `- 1 Divine Orb = ${currencyRates.divine} Chaos Orb${currencyRates.live ? '' : '  ⚠ fallback rate — poe.ninja was unavailable; verify before costing the craft'}\n\n`;

  text += CRAFTING_METHODS + '\n';

  if (modData) {
    text += modData + '\n';
  }

  text += `\n---\nUsing the mod data above, recommend the best crafting method for the target mods on this base. `;
  text += `Provide: (1) recommended method with reasoning, (2) step-by-step instructions, (3) estimated cost in chaos, (4) fallback if it bricks.`;

  return text;
}

/**
 * MCP handler for the suggest_crafting tool.
 * Gathers live build stats, currency rates, and poedb mod data, then
 * returns a structured prompt for the AI to reason about crafting strategy.
 */
export async function handleSuggestCrafting(
  context: CraftingAdvisorContext,
  args: {
    slot: string;
    base?: string;
    desired_mods?: string[];
    budget?: 'low' | 'medium' | 'high';
    ilvl?: number;
    league?: string;
  }
) {
  return wrapHandler('suggest crafting', async () => {
    const { slot, desired_mods = [], league = 'Standard' } = args;

    let base = args.base;
    let buildContext: StatsExport | null = null;

    const luaClient = context.getLuaClient();
    if (luaClient) {
      try {
        const stats = await luaClient.getStats([
          'Life', 'EnergyShield', 'FireResist', 'ColdResist', 'LightningResist', 'ChaosResist',
          'TotalDPS', 'MinionTotalDPS', 'Armour', 'Evasion',
        ]);
        buildContext = stats;

        if (!base) {
          try {
            const items = await luaClient.getItems();
            const slotMap: Record<string, string> = {
              helmet: 'Helmet', chest: 'Body Armour', gloves: 'Gloves',
              boots: 'Boots', weapon: 'Weapon 1', offhand: 'Weapon 2',
              ring: 'Ring 1', amulet: 'Amulet', belt: 'Belt',
            };
            const slotName = slotMap[slot.toLowerCase()];
            const item = items.find((i) => i.slot === slotName);
            if (item?.baseName) base = item.baseName;
          } catch (e) { noteIgnoredError("No item in slot — fine, continue without auto-detected base", e); }
        }
      } catch (e) { noteIgnoredError("PoB not loaded — fine, continue without build context", e); }
    }

    if (!base) {
      return {
        content: [{
          type: 'text',
          text: `Please provide a base type (e.g. "Hubris Circlet") — no build is loaded to auto-detect the equipped item in the ${slot} slot.`,
        }],
      };
    }

    let currencyRates = { chaos: 1, divine: 200, live: false };
    try {
      const rateMap = await context.ninjaClient.getCurrencyExchangeMap(league);
      const divineRate = rateMap.get('Divine Orb');
      if (divineRate) currencyRates = { chaos: 1, divine: Math.round(divineRate), live: true };
    } catch (e) { noteIgnoredError("poe.ninja unavailable — use fallback rates (labelled as such in the response)", e); }

    let modData = '';
    try {
      const data = await fetchBaseModData(base);
      modData = data.modText;
    } catch (err) {
      modData = `(Could not fetch poedb data for "${base}": ${err instanceof Error ? err.message : String(err)})`;
    }

    const responseText = buildCraftingResponse({
      base,
      slot,
      desiredMods: desired_mods,
      modData,
      currencyRates,
      buildContext,
      ilvl: args.ilvl,
      budget: args.budget,
    });

    return {
      content: [{ type: 'text', text: responseText }],
    };
  });
}
