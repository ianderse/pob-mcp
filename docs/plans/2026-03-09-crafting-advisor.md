# Crafting Advisor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a `suggest_crafting` MCP tool that takes a gear slot + desired mods (auto-detected from the loaded build if not provided), fetches mod data from poedb, and returns structured crafting data for Claude to synthesize into a step-by-step crafting guide.

**Architecture:** A new `craftingDataService.ts` fetches poedb pages for the given base type and lightly processes the HTML into useful text. A new `craftingAdvisorHandler.ts` orchestrates: PoB Lua bridge for build context, poedb for mod data, poe.ninja for currency prices. Claude receives all structured data and synthesizes the recommendation.

**Tech Stack:** TypeScript, node fetch (same pattern as poeNinjaClient), poedb.tw for mod data, existing PoB Lua bridge + poe.ninja integration.

---

## Task 1: `craftingDataService.ts` — fetch poedb mod data

**Files:**
- Create: `src/services/craftingDataService.ts`
- Test: `tests/unit/craftingDataService.test.ts`

### Step 1: Write the failing tests

```typescript
// tests/unit/craftingDataService.test.ts
import { describe, it, expect } from '@jest/globals';
import { formatBaseSlug, parsePoedbText } from '../../src/services/craftingDataService';

describe('formatBaseSlug', () => {
  it('replaces spaces with underscores', () => {
    expect(formatBaseSlug('Hubris Circlet')).toBe('Hubris_Circlet');
  });

  it('handles single word bases', () => {
    expect(formatBaseSlug('Helmet')).toBe('Helmet');
  });

  it('handles apostrophes', () => {
    expect(formatBaseSlug("Soldier's Helmet")).toBe("Soldier's_Helmet");
  });
});

describe('parsePoedbText', () => {
  it('extracts fossil section when present', () => {
    const html = '<h2>Fossil</h2><p>Aberrant Fossil - removes lightning mods</p>';
    const result = parsePoedbText(html, 'Hubris Circlet');
    expect(result).toContain('Aberrant');
  });

  it('returns base name in output', () => {
    const result = parsePoedbText('<html>some content</html>', 'Hubris Circlet');
    expect(result).toContain('Hubris Circlet');
  });
});
```

### Step 2: Run to verify they fail

```bash
npx jest tests/unit/craftingDataService.test.ts --no-coverage
```

Expected: FAIL — module not found.

### Step 3: Implement

```typescript
// src/services/craftingDataService.ts

export function formatBaseSlug(base: string): string {
  return base.replace(/ /g, '_');
}

/**
 * Lightly processes poedb HTML into plain text sections useful for Claude.
 * We don't need perfect parsing — Claude can interpret semi-structured text.
 */
export function parsePoedbText(html: string, base: string): string {
  // Strip script/style tags
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s{2,}/g, '\n')
    .trim();

  return `=== poedb data for: ${base} ===\n\n${text.slice(0, 8000)}`;
}

export interface CraftingBaseData {
  base: string;
  poedbUrl: string;
  modText: string;
}

export async function fetchBaseModData(base: string): Promise<CraftingBaseData> {
  const slug = formatBaseSlug(base);
  const url = `https://poedb.tw/us/${encodeURIComponent(slug)}`;

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'pob-mcp-server/1.0 (crafting advisor)',
    },
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(`poedb fetch failed for "${base}": ${response.status}`);
  }

  const html = await response.text();
  const modText = parsePoedbText(html, base);

  return { base, poedbUrl: url, modText };
}
```

### Step 4: Run tests to verify they pass

```bash
npx jest tests/unit/craftingDataService.test.ts --no-coverage
```

Expected: PASS.

### Step 5: Commit

```bash
git add src/services/craftingDataService.ts tests/unit/craftingDataService.test.ts
git commit -m "feat: add craftingDataService to fetch poedb mod data"
```

---

## Task 2: `craftingAdvisorHandler.ts` — orchestration handler

**Files:**
- Create: `src/handlers/craftingAdvisorHandler.ts`
- Test: `tests/unit/craftingAdvisorHandler.test.ts`

### Step 1: Write the failing tests

```typescript
// tests/unit/craftingAdvisorHandler.test.ts
import { describe, it, expect, jest } from '@jest/globals';
import { buildCraftingResponse } from '../../src/handlers/craftingAdvisorHandler';

describe('buildCraftingResponse', () => {
  it('includes base name in output', () => {
    const result = buildCraftingResponse({
      base: 'Hubris Circlet',
      slot: 'helmet',
      desiredMods: ['maximum life', 'cold resistance'],
      modData: '=== poedb data ===\nsome mod info',
      currencyRates: { chaos: 1, divine: 200 },
      buildContext: null,
    });
    expect(result).toContain('Hubris Circlet');
  });

  it('includes desired mods in output', () => {
    const result = buildCraftingResponse({
      base: 'Hubris Circlet',
      slot: 'helmet',
      desiredMods: ['maximum life', 'cold resistance'],
      modData: '',
      currencyRates: { chaos: 1, divine: 200 },
      buildContext: null,
    });
    expect(result).toContain('maximum life');
    expect(result).toContain('cold resistance');
  });

  it('includes build context when provided', () => {
    const result = buildCraftingResponse({
      base: 'Hubris Circlet',
      slot: 'helmet',
      desiredMods: [],
      modData: '',
      currencyRates: { chaos: 1, divine: 200 },
      buildContext: { life: 3000, fireRes: 45, coldRes: 10 },
    });
    expect(result).toContain('Build context');
  });

  it('includes currency rates', () => {
    const result = buildCraftingResponse({
      base: 'Hubris Circlet',
      slot: 'helmet',
      desiredMods: [],
      modData: '',
      currencyRates: { chaos: 1, divine: 200 },
      buildContext: null,
    });
    expect(result).toContain('200');
  });
});
```

### Step 2: Run to verify they fail

```bash
npx jest tests/unit/craftingAdvisorHandler.test.ts --no-coverage
```

Expected: FAIL — module not found.

### Step 3: Implement

```typescript
// src/handlers/craftingAdvisorHandler.ts
import type { PoBLuaApiClient } from '../pobLuaBridge.js';
import type { PoeNinjaClient } from '../services/poeNinjaClient.js';
import { fetchBaseModData } from '../services/craftingDataService.js';
import { wrapHandler } from '../utils/errorHandling.js';

export interface CraftingAdvisorContext {
  getLuaClient: () => PoBLuaApiClient | null;
  ninjaClient: PoeNinjaClient;
  pobDirectory: string;
}

export interface CraftingResponseInput {
  base: string;
  slot: string;
  desiredMods: string[];
  modData: string;
  currencyRates: { chaos: number; divine: number };
  buildContext: Record<string, any> | null;
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

  if (buildContext) {
    text += `## Build Context\n`;
    Object.entries(buildContext).forEach(([k, v]) => {
      text += `- ${k}: ${v}\n`;
    });
    text += '\n';
  }

  text += `## Currency Rates\n`;
  text += `- 1 Divine Orb = ${currencyRates.divine} Chaos Orb\n\n`;

  text += CRAFTING_METHODS + '\n';

  if (modData) {
    text += modData + '\n';
  }

  text += `\n---\nUsing the mod data above, recommend the best crafting method for the target mods on this base. `;
  text += `Provide: (1) recommended method with reasoning, (2) step-by-step instructions, (3) estimated cost in chaos, (4) fallback if it bricks.`;

  return text;
}

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
    const { slot, desired_mods = [], budget, ilvl, league = 'Standard' } = args;

    // Resolve base: from args, or from equipped item in slot via PoB
    let base = args.base;
    let buildContext: Record<string, any> | null = null;

    const luaClient = context.getLuaClient();
    if (luaClient) {
      try {
        // Get build stats for context
        const stats = await luaClient.getStats([
          'Life', 'EnergyShield', 'FireResist', 'ColdResist', 'LightningResist', 'ChaosResist',
          'TotalDPS', 'MinionTotalDPS', 'Armour', 'Evasion',
        ]);
        buildContext = stats;

        // Try to get equipped item base in this slot if base not provided
        if (!base) {
          try {
            const items = await luaClient.getItems();
            const slotMap: Record<string, string> = {
              helmet: 'Helmet', chest: 'Body Armour', gloves: 'Gloves',
              boots: 'Boots', weapon: 'Weapon 1', offhand: 'Weapon 2',
              ring: 'Ring 1', amulet: 'Amulet', belt: 'Belt',
            };
            const slotName = slotMap[slot.toLowerCase()];
            const item = items.find((i: any) => i.slot === slotName);
            if (item?.base) base = item.base;
          } catch {
            // no item in slot — fine
          }
        }
      } catch {
        // PoB not loaded — fine, continue without build context
      }
    }

    if (!base) {
      return {
        content: [{
          type: 'text',
          text: `Please provide a base type (e.g. "Hubris Circlet") — no build is loaded to auto-detect the equipped item in the ${slot} slot.`,
        }],
      };
    }

    // Fetch currency rates
    let currencyRates = { chaos: 1, divine: 200 };
    try {
      const rateMap = await context.ninjaClient.getCurrencyExchangeMap(league);
      const divineRate = rateMap.get('Divine Orb');
      if (divineRate) currencyRates = { chaos: 1, divine: Math.round(divineRate) };
    } catch {
      // poe.ninja unavailable — use fallback rates
    }

    // Fetch poedb mod data
    let modData = '';
    try {
      const data = await fetchBaseModData(base);
      modData = data.modText;
    } catch (err: any) {
      modData = `(Could not fetch poedb data for "${base}": ${err.message})`;
    }

    const responseText = buildCraftingResponse({
      base,
      slot,
      desiredMods: desired_mods,
      modData,
      currencyRates,
      buildContext,
    });

    return {
      content: [{ type: 'text', text: responseText }],
    };
  });
}
```

### Step 4: Run tests to verify they pass

```bash
npx jest tests/unit/craftingAdvisorHandler.test.ts --no-coverage
```

Expected: PASS.

### Step 5: Commit

```bash
git add src/handlers/craftingAdvisorHandler.ts tests/unit/craftingAdvisorHandler.test.ts
git commit -m "feat: add craftingAdvisorHandler"
```

---

## Task 3: Register the tool — schema, router, index

**Files:**
- Modify: `src/server/toolSchemas.ts` (add to `getToolSchemas()`)
- Modify: `src/server/toolRouter.ts` (add case)
- Modify: `src/index.ts` (pass ninjaClient to handler context)

### Step 1: Add schema to `toolSchemas.ts`

Find `getToolSchemas()` (line ~21) and add to the returned array:

```typescript
{
  name: "suggest_crafting",
  description: "Recommend the best crafting method for an item. Provide a gear slot and optionally a base type and desired mods. If a build is loaded, auto-detects the equipped base and build gaps.",
  inputSchema: {
    type: "object",
    properties: {
      slot: {
        type: "string",
        description: "Gear slot: helmet, chest, gloves, boots, weapon, offhand, ring, amulet, belt",
        enum: ["helmet", "chest", "gloves", "boots", "weapon", "offhand", "ring", "amulet", "belt"],
      },
      base: {
        type: "string",
        description: "Base item type (e.g. 'Hubris Circlet'). Auto-detected from equipped item if a build is loaded.",
      },
      desired_mods: {
        type: "array",
        items: { type: "string" },
        description: "List of desired mod descriptions (e.g. ['maximum life', 'cold resistance', 'spell damage'])",
      },
      budget: {
        type: "string",
        enum: ["low", "medium", "high"],
        description: "Crafting budget: low (<50c), medium (50-500c), high (500c+)",
      },
      ilvl: {
        type: "number",
        description: "Item level — determines which mod tiers are reachable. 84+ for top tiers on most bases.",
      },
      league: {
        type: "string",
        description: "League name for currency prices (default: Standard)",
      },
    },
    required: ["slot"],
  },
},
```

### Step 2: Add route to `toolRouter.ts`

In the `switch` statement, add before the `default` case:

```typescript
case "suggest_crafting": {
  const craftingContext = {
    getLuaClient: deps.getLuaClient,
    ninjaClient: deps.ninjaClient,
    pobDirectory: deps.pobDirectory,
  };
  return await handleSuggestCrafting(craftingContext, args as any);
}
```

Also add the import at the top of `toolRouter.ts`:

```typescript
import { handleSuggestCrafting } from '../handlers/craftingAdvisorHandler.js';
```

### Step 3: Verify `ninjaClient` is already in deps

Check that `deps` in `toolRouter.ts` already has `ninjaClient` — it does (used by `handleGetCurrencyRates`). Also check `deps` has `getLuaClient` and `pobDirectory` — they're already there.

### Step 4: Build to check for type errors

```bash
npm run build
```

Expected: clean build (no errors).

### Step 5: Commit

```bash
git add src/server/toolSchemas.ts src/server/toolRouter.ts
git commit -m "feat: register suggest_crafting tool in schema and router"
```

---

## Task 4: Manual smoke test

### Step 1: Restart the MCP server

Ask the user to restart Claude Desktop (or reload the MCP server).

### Step 2: Test without a build loaded

Call: `suggest_crafting` with `slot: "helmet"`, `base: "Hubris Circlet"`, `desired_mods: ["maximum life", "cold resistance", "spell damage"]`

Expected: Returns structured output with poedb mod data + currency rates + crafting methods section. Claude synthesizes a recommendation.

### Step 3: Test with a build loaded

Load a build, then call: `suggest_crafting` with `slot: "helmet"` only (no base, no desired_mods).

Expected: Auto-detects the equipped helmet base and uses build stats to fill in desired mods.

### Step 4: Test graceful degradation

Call with an invalid base: `suggest_crafting` with `slot: "helmet"`, `base: "Fake Item Base"`

Expected: Returns a response noting poedb fetch failed, still provides crafting method overview.

---

## Task 5: Final commit and cleanup

```bash
npm run build
git add -A
git commit -m "feat: add suggest_crafting tool — crafting advisor with poedb mod data and PoB build integration"
```
