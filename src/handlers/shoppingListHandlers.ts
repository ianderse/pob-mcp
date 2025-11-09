/**
 * Shopping List Handlers
 *
 * Generate shopping lists from PoB builds
 */

import { wrapHandler } from '../utils/errorHandling.js';
import { BuildService } from '../services/buildService.js';
import { ShoppingListService, BudgetTier } from '../services/shoppingListService.js';
import { TradeApiClient } from '../services/tradeClient.js';
import { StatMapper } from '../services/statMapper.js';
import { PoeNinjaClient } from '../services/poeNinjaClient.js';

interface ShoppingListContext {
  buildService: BuildService;
  tradeClient?: TradeApiClient;
  statMapper?: StatMapper;
  ninjaClient?: PoeNinjaClient;
}

/**
 * Generate a shopping list from a PoB build
 */
export async function handleGenerateShoppingList(
  context: ShoppingListContext,
  args: {
    build_name: string;
    league: string;
    budget?: 'budget' | 'medium' | 'endgame';
  }
): Promise<{
  content: Array<{
    type: string;
    text: string;
  }>;
}> {
  return wrapHandler('generate shopping list', async () => {
    const { build_name, league, budget = 'medium' } = args;

    // Read the build
    const build = await context.buildService.readBuild(build_name);

    // Create shopping list service
    const shoppingService = new ShoppingListService(
      context.tradeClient,
      context.statMapper,
      context.ninjaClient
    );

    // Generate the list
    const shoppingList = await shoppingService.generateShoppingList(build, build_name, league, budget);

    // Format output
    const output = formatShoppingList(shoppingList, budget);

    return {
      content: [
        {
          type: 'text',
          text: output,
        },
      ],
    };
  });
}

/**
 * Format shopping list for output
 */
function formatShoppingList(list: any, selectedBudget: BudgetTier): string {
  let output = `=== Shopping List: ${list.buildName} ===\n`;
  output += `League: ${list.league}\n`;
  output += `Budget: ${selectedBudget}\n\n`;

  // Summary
  output += `📊 SUMMARY\n`;
  output += `Items to Upgrade: ${list.summary.totalItems}\n`;
  output += `Critical: ${list.summary.criticalUpgrades}\n`;
  output += `Budget Cost: ~${list.summary.totalBudgetCost} chaos\n`;
  output += `Medium Cost: ~${list.summary.totalMediumCost} chaos\n`;
  output += `Endgame Cost: ~${list.summary.totalEndgameCost} chaos\n\n`;

  // Build Needs
  if (list.buildNeeds.lifeNeeded > 0 || Object.values(list.buildNeeds.resistanceGaps).some((v: any) => v > 0)) {
    output += `⚠️  BUILD NEEDS\n`;
    if (list.buildNeeds.lifeNeeded > 0) {
      output += `Life: Need +${list.buildNeeds.lifeNeeded} more (target 4500+)\n`;
    }

    const resGaps = list.buildNeeds.resistanceGaps;
    const resNeeded = [];
    if (resGaps.fire > 0) resNeeded.push(`${resGaps.fire}% Fire`);
    if (resGaps.cold > 0) resNeeded.push(`${resGaps.cold}% Cold`);
    if (resGaps.lightning > 0) resNeeded.push(`${resGaps.lightning}% Lightning`);
    if (resGaps.chaos > 0) resNeeded.push(`${resGaps.chaos}% Chaos`);

    if (resNeeded.length > 0) {
      output += `Resistances: Need ${resNeeded.join(', ')}\n`;
    }
    output += '\n';
  }

  // Priority Sections
  if (list.priorities.immediate.length > 0) {
    output += `🔴 IMMEDIATE (Critical)\n`;
    for (const slot of list.priorities.immediate) {
      const item = list.items.find((i: any) => i.slot === slot);
      if (item) {
        output += formatShoppingItem(item, selectedBudget, true);
      }
    }
    output += '\n';
  }

  if (list.priorities.shortTerm.length > 0) {
    output += `🟡 SHORT TERM (High Priority)\n`;
    for (const slot of list.priorities.shortTerm) {
      const item = list.items.find((i: any) => i.slot === slot);
      if (item) {
        output += formatShoppingItem(item, selectedBudget, true);
      }
    }
    output += '\n';
  }

  if (list.priorities.longTerm.length > 0) {
    output += `🟢 LONG TERM (Medium/Low Priority)\n`;
    for (const slot of list.priorities.longTerm) {
      const item = list.items.find((i: any) => i.slot === slot);
      if (item) {
        output += formatShoppingItem(item, selectedBudget, false);
      }
    }
  }

  output += `\n💡 TIP: Use the 'search_trade_items' or 'find_item_upgrades' tools to find specific items`;

  return output;
}

/**
 * Format individual shopping item
 */
function formatShoppingItem(item: any, budget: BudgetTier, detailed: boolean): string {
  let output = `\n${item.slot}`;

  if (item.currentItem) {
    output += ` (Current: ${item.currentItem.rarity} ${item.currentItem.name})`;
  } else {
    output += ` (EMPTY)`;
  }
  output += '\n';

  // Show reasons
  if (item.reason.length > 0) {
    output += `  Why: ${item.reason.join(', ')}\n`;
  }

  // Show selected budget tier recommendation
  const rec = item.recommendations[budget];
  output += `  Target: ${rec.searchCriteria}\n`;
  output += `  Est. Cost: ${rec.estimatedPrice.min}-${rec.estimatedPrice.max} ${rec.estimatedPrice.currency}\n`;

  if (detailed) {
    output += `  Look for: ${rec.keyStats.join(', ')}\n`;

    // Show estimated NET impact (accounts for losing current item)
    if (item.estimatedImpact) {
      const impacts = [];
      if (item.estimatedImpact.life) impacts.push(`+${item.estimatedImpact.life} Life`);
      if (item.estimatedImpact.es) impacts.push(`+${item.estimatedImpact.es} ES`);
      if (item.estimatedImpact.resistances) impacts.push(`+${item.estimatedImpact.resistances}% Res`);
      if (item.estimatedImpact.dps) impacts.push(`+${(item.estimatedImpact.dps / 1000).toFixed(0)}k DPS`);

      if (impacts.length > 0) {
        output += `  Net Gain: ${impacts.join(', ')} (after replacing current)\n`;
      }
    }

    if (rec.notes) {
      output += `  Note: ${rec.notes}\n`;
    }
  }

  return output;
}
