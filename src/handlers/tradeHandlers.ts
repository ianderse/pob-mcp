import { wrapHandler } from '../utils/errorHandling.js';
import { TradeApiClient } from '../services/tradeClient.js';
import { TradeQueryBuilder } from '../services/tradeQueryBuilder.js';
import { StatMapper } from '../services/statMapper.js';
import { ItemRecommendationEngine, UpgradeContext } from '../services/itemRecommendationEngine.js';
import { ItemListing, SearchOptions, ItemRecommendation, ResistanceRequirements, BudgetConstraints } from '../types/tradeTypes.js';

interface TradeContext {
  tradeClient: TradeApiClient;
  statMapper?: StatMapper;
  recommendationEngine?: ItemRecommendationEngine;
}

// ========================================
// Trade Site URL Helpers
// ========================================

function getTradeSearchUrl(league: string, searchId: string): string {
  return `https://www.pathofexile.com/trade/search/${encodeURIComponent(league)}/${searchId}`;
}

function getTradeItemUrl(league: string, searchId: string, itemId: string): string {
  // Individual items can be highlighted in the search results
  return `https://www.pathofexile.com/trade/search/${encodeURIComponent(league)}/${searchId}#${itemId}`;
}

/**
 * Search the Path of Exile trade site for items
 */
export async function handleSearchTradeItems(
  context: TradeContext,
  args: {
    league: string;
    item_name?: string;
    item_type?: string;
    min_price?: number;
    max_price?: number;
    price_currency?: string;
    online_only?: boolean;
    rarity?: 'normal' | 'magic' | 'rare' | 'unique' | 'any';
    min_links?: number;
    stats?: Array<{ id: string; min?: number; max?: number }>;
    sort?: 'price_asc' | 'price_desc';
    limit?: number;
  }
): Promise<{
  content: Array<{
    type: string;
    text: string;
  }>;
}> {
  return wrapHandler('search trade items', async () => {
    const {
      league,
      item_name,
      item_type,
      min_price,
      max_price,
      price_currency = 'chaos',
      online_only = true,
      rarity,
      min_links,
      stats,
      sort = 'price_asc',
      limit = 10,
    } = args;

    // Build the query
    const builder = new TradeQueryBuilder();

    if (item_name) {
      builder.withName(item_name);
    }

    if (item_type) {
      builder.withType(item_type);
    }

    if (rarity) {
      builder.withRarity(rarity);
    }

    if (min_links) {
      builder.withLinks(min_links);
    }

    if (stats && stats.length > 0) {
      builder.withStats(stats);
    }

    builder.applyOptions({
      league,
      onlineOnly: online_only,
      minPrice: min_price,
      maxPrice: max_price,
      priceCurrency: price_currency,
      sort,
      limit,
    });

    const query = builder.build();

    // Execute search
    const searchResult = await context.tradeClient.searchItems(league, query);

    if (!searchResult.result || searchResult.result.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `No items found matching your search criteria in ${league} league.`,
          },
        ],
      };
    }

    // Fetch first batch of items (up to limit)
    const itemIdsToFetch = searchResult.result.slice(0, Math.min(limit, 10));
    const items = await context.tradeClient.fetchItems(itemIdsToFetch, searchResult.id);

    // Format results
    const output = formatSearchResults(items, searchResult.total, league, searchResult.id);

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
 * Get current market price for an item
 */
export async function handleGetItemPrice(
  context: TradeContext,
  args: {
    item_name: string;
    league?: string;
    item_type?: string;
    rarity?: 'unique' | 'rare' | 'magic' | 'normal';
  }
): Promise<{
  content: Array<{
    type: string;
    text: string;
  }>;
}> {
  return wrapHandler('get item price', async () => {
    const { item_name, league = 'Standard', item_type, rarity } = args;

    // Build query
    const builder = new TradeQueryBuilder()
      .withName(item_name)
      .withOnlineStatus('online');

    if (item_type) {
      builder.withType(item_type);
    }

    if (rarity) {
      builder.withRarity(rarity);
    }

    builder.withSort('price', 'asc');

    const query = builder.build();

    // Search
    const searchResult = await context.tradeClient.searchItems(league, query);

    if (!searchResult.result || searchResult.result.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `No price data found for "${item_name}" in ${league}.`,
          },
        ],
      };
    }

    // Fetch first 10 items to get price range
    const itemIdsToFetch = searchResult.result.slice(0, Math.min(10, searchResult.result.length));
    const items = await context.tradeClient.fetchItems(itemIdsToFetch, searchResult.id);

    // Calculate price statistics
    const prices = items
      .map(item => item.listing.price)
      .filter(price => price !== undefined)
      .map(price => ({
        amount: price!.amount,
        currency: price!.currency,
      }));

    if (prices.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `No priced listings found for "${item_name}" in ${league}.`,
          },
        ],
      };
    }

    // Group by currency
    const byCurrency = new Map<string, number[]>();
    for (const price of prices) {
      if (!byCurrency.has(price.currency)) {
        byCurrency.set(price.currency, []);
      }
      byCurrency.get(price.currency)!.push(price.amount);
    }

    // Format output
    let output = `=== Price Check: ${item_name} ===\n`;
    output += `League: ${league}\n`;
    output += `Total Listings: ${searchResult.total}\n\n`;

    for (const [currency, amounts] of byCurrency.entries()) {
      amounts.sort((a, b) => a - b);
      const min = amounts[0];
      const max = amounts[amounts.length - 1];
      const median = amounts[Math.floor(amounts.length / 2)];
      const avg = amounts.reduce((sum, val) => sum + val, 0) / amounts.length;

      output += `${currency}:\n`;
      output += `  Low: ${min.toFixed(1)} ${currency}\n`;
      output += `  Median: ${median.toFixed(1)} ${currency}\n`;
      output += `  Average: ${avg.toFixed(1)} ${currency}\n`;
      output += `  High: ${max.toFixed(1)} ${currency}\n`;
      output += `  Sample Size: ${amounts.length} listings\n\n`;
    }

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
 * Get available leagues
 */
export async function handleGetLeagues(
  context: TradeContext
): Promise<{
  content: Array<{
    type: string;
    text: string;
  }>;
}> {
  return wrapHandler('get leagues', async () => {
    const leagueData = await context.tradeClient.getLeagues();

    if (!leagueData.result || leagueData.result.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: 'No leagues found.',
          },
        ],
      };
    }

    let output = '=== Available Leagues ===\n\n';

    for (const league of leagueData.result) {
      output += `- ${league.id}`;
      if (league.text) {
        output += ` (${league.text})`;
      }
      if (league.realm) {
        output += ` [${league.realm}]`;
      }
      output += '\n';
    }

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

// ========================================
// Helper Functions
// ========================================

function formatSearchResults(items: ItemListing[], totalResults: number, league: string, searchId: string): string {
  let output = `=== Trade Search Results ===\n`;
  output += `League: ${league}\n`;
  output += `Total Results: ${totalResults}\n`;
  output += `Showing: ${items.length} items\n`;
  output += `\n🔗 View full results: ${getTradeSearchUrl(league, searchId)}\n\n`;

  for (let i = 0; i < items.length; i++) {
    const listing = items[i];
    const item = listing.item;
    const price = listing.listing.price;
    const seller = listing.listing.account;

    output += `${i + 1}. ${item.name || item.typeLine}\n`;

    if (item.name && item.typeLine && item.name !== item.typeLine) {
      output += `   Base: ${item.typeLine}\n`;
    }

    if (price) {
      output += `   Price: ${price.amount} ${price.currency}\n`;
    } else {
      output += `   Price: Not listed\n`;
    }

    output += `   ilvl: ${item.ilvl}`;

    if (item.corrupted) {
      output += ' (Corrupted)';
    }

    output += '\n';

    // Links
    if (item.sockets && item.sockets.length > 0) {
      const maxLinks = getMaxLinks(item.sockets);
      if (maxLinks > 1) {
        output += `   Links: ${maxLinks}L\n`;
      }
    }

    // Key mods
    if (item.explicitMods && item.explicitMods.length > 0) {
      output += `   Mods:\n`;
      for (const mod of item.explicitMods.slice(0, 3)) {
        output += `     - ${mod}\n`;
      }
      if (item.explicitMods.length > 3) {
        output += `     ... and ${item.explicitMods.length - 3} more\n`;
      }
    }

    output += `   Seller: ${seller.name}`;
    if (seller.online) {
      output += ' (Online)';
    }
    output += '\n';

    output += `   Whisper: ${listing.listing.whisper}\n`;
    output += `   🔗 View item: ${getTradeItemUrl(league, searchId, listing.id)}\n`;
    output += '\n';
  }

  output += `\nNote: Use item IDs to fetch full details or compare items.`;

  return output;
}

function getMaxLinks(sockets: Array<{ group: number }>): number {
  const groups = new Map<number, number>();
  for (const socket of sockets) {
    const count = groups.get(socket.group) || 0;
    groups.set(socket.group, count + 1);
  }
  return Math.max(...groups.values());
}

/**
 * Search for stat IDs by name (fuzzy matching)
 */
export async function handleSearchStats(
  context: TradeContext,
  args: {
    query: string;
    limit?: number;
  }
): Promise<{
  content: Array<{
    type: string;
    text: string;
  }>;
}> {
  return wrapHandler('search stats', async () => {
    const { query, limit = 10 } = args;

    if (!context.statMapper) {
      return {
        content: [
          {
            type: 'text',
            text: 'Stat mapper not available.',
          },
        ],
      };
    }

    const results = context.statMapper.fuzzySearch(query, limit);

    if (results.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `No stats found matching "${query}".`,
          },
        ],
      };
    }

    let output = `=== Stat Search Results for "${query}" ===\n\n`;
    output += `Found ${results.length} matching stats:\n\n`;

    for (let i = 0; i < results.length; i++) {
      const stat = results[i];
      output += `${i + 1}. ${stat.pobName}\n`;
      output += `   Trade ID: ${stat.tradeId}\n`;
      output += `   Category: ${stat.category}\n`;

      if (stat.description) {
        output += `   Description: ${stat.description}\n`;
      }

      if (stat.aliases.length > 0) {
        output += `   Aliases: ${stat.aliases.slice(0, 3).join(', ')}`;
        if (stat.aliases.length > 3) {
          output += ` (+${stat.aliases.length - 3} more)`;
        }
        output += '\n';
      }

      output += '\n';
    }

    output += `\nTo use in searches, reference the Trade ID in the stats parameter.`;

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

// Phase 3: Recommendation Engine Handlers

export async function handleFindItemUpgrades(
  context: TradeContext,
  args: any
): Promise<{ content: Array<{ type: string; text: string }> }> {
  return wrapHandler('find item upgrades', async () => {
    const {
      slot,
      league,
      build_needs,
      current_item,
      max_price = 100,
      currency = 'chaos',
      limit = 10,
    } = args;

    if (!context.recommendationEngine) {
      return {
        content: [{ type: 'text', text: 'Recommendation engine not available.' }],
      };
    }

    const upgradeContext: UpgradeContext = {
      currentItem: current_item ? {
        name: current_item.name || 'Current Item',
        slot,
        life: current_item.life,
        es: current_item.es,
        resistances: {
          fire: current_item.fire_resist,
          cold: current_item.cold_resist,
          lightning: current_item.lightning_resist,
          chaos: current_item.chaos_resist,
        },
      } : undefined,
      buildNeeds: {
        lifeNeeded: build_needs?.life,
        esNeeded: build_needs?.es,
        dpsTarget: build_needs?.dps,
        resistanceGaps: (build_needs && (build_needs.fire_resist || build_needs.cold_resist || build_needs.lightning_resist)) ? {
          fire: build_needs.fire_resist || 0,
          cold: build_needs.cold_resist || 0,
          lightning: build_needs.lightning_resist || 0,
          chaos: build_needs.chaos_resist || 0,
        } : undefined,
      },
      budget: {
        maxPricePerItem: max_price,
        totalBudget: max_price * 2,
        currency,
      },
      league,
    };

    const recommendations = await context.recommendationEngine.findUpgrades(slot, upgradeContext);

    if (recommendations.length === 0) {
      return {
        content: [{ type: 'text', text: `No upgrade recommendations found for ${slot} in ${league} within budget.` }],
      };
    }

    const output = formatItemRecommendations(recommendations.slice(0, limit), slot, league);
    return { content: [{ type: 'text', text: output }] };
  });
}

export async function handleFindResistanceGear(
  context: TradeContext,
  args: any
): Promise<{ content: Array<{ type: string; text: string }> }> {
  return wrapHandler('find resistance gear', async () => {
    const {
      league,
      fire_resist_needed = 0,
      cold_resist_needed = 0,
      lightning_resist_needed = 0,
      chaos_resist_needed = 0,
      max_price_per_item = 50,
      total_budget = 200,
      currency = 'chaos',
      slots,
      limit = 15,
    } = args;

    if (!context.recommendationEngine) {
      return {
        content: [{ type: 'text', text: 'Recommendation engine not available.' }],
      };
    }

    const resistanceGaps: ResistanceRequirements = {
      fire: fire_resist_needed,
      cold: cold_resist_needed,
      lightning: lightning_resist_needed,
      chaos: chaos_resist_needed,
    };

    const budget: BudgetConstraints = {
      maxPricePerItem: max_price_per_item,
      totalBudget: total_budget,
      currency,
    };

    const recommendations = await context.recommendationEngine.findResistanceGear(
      resistanceGaps,
      budget,
      league,
      slots
    );

    if (recommendations.length === 0) {
      return {
        content: [{ type: 'text', text: `No resistance gear found in ${league} that matches your requirements within budget.` }],
      };
    }

    const output = formatResistanceRecommendations(recommendations.slice(0, limit), resistanceGaps, league, true);
    return { content: [{ type: 'text', text: output }] };
  });
}

function formatItemRecommendations(
  recommendations: ItemRecommendation[],
  slot: string,
  league: string,
  includeLinks: boolean = false
): string {
  let output = `=== Item Upgrade Recommendations: ${slot} ===\n`;
  output += `League: ${league}\n`;
  output += `Found ${recommendations.length} recommendations\n`;
  if (includeLinks) {
    output += `\n💡 Tip: Copy whisper commands below to contact sellers in-game\n`;
  }
  output += `\n`;

  for (const rec of recommendations) {
    const item = rec.listing.item;
    const price = rec.listing.listing.price;

    output += `${rec.rank}. ${item.name || item.typeLine}`;
    if (rec.priority === 'high') output += ' ⭐';
    output += `\n`;

    if (item.name && item.typeLine && item.name !== item.typeLine) {
      output += `   Base: ${item.typeLine}\n`;
    }

    output += `   Score: ${rec.score.toFixed(1)}/100 (${rec.priority} priority)\n`;

    if (price) {
      output += `   Price: ${price.amount} ${price.currency}\n`;
    }

    if (rec.costBenefit) {
      const cb = rec.costBenefit;
      if (cb.lifeGain && cb.lifeGain > 0) {
        output += `   Life Gain: +${cb.lifeGain}\n`;
      }
      if (cb.esGain && cb.esGain > 0) {
        output += `   ES Gain: +${cb.esGain}\n`;
      }
      if (cb.efficiency) {
        output += `   Efficiency: ${cb.efficiency.toFixed(2)} points per ${cb.currency}\n`;
      }
    }

    if (rec.reasons.length > 0) {
      output += `   Why:\n`;
      for (const reason of rec.reasons.slice(0, 3)) {
        output += `     - ${reason}\n`;
      }
    }

    output += `   Seller: ${rec.listing.listing.account.name}`;
    if (rec.listing.listing.account.online) {
      output += ' (Online)';
    }
    output += '\n';

    if (includeLinks && rec.listing.listing.whisper) {
      output += `   Whisper: ${rec.listing.listing.whisper}\n`;
    }

    output += `   🔗 View item: ${getTradeItemUrl(league, rec.searchId, rec.listing.id)}\n`;
    output += '\n';
  }

  return output;
}

function formatResistanceRecommendations(
  recommendations: ItemRecommendation[],
  resistanceGaps: ResistanceRequirements,
  league: string,
  includeLinks: boolean = false
): string {
  let output = `=== Resistance Gear Recommendations ===\n`;
  output += `League: ${league}\n`;
  output += `Target: `;

  const targets = [];
  if (resistanceGaps.fire > 0) targets.push(`${resistanceGaps.fire}% Fire`);
  if (resistanceGaps.cold > 0) targets.push(`${resistanceGaps.cold}% Cold`);
  if (resistanceGaps.lightning > 0) targets.push(`${resistanceGaps.lightning}% Lightning`);
  if (resistanceGaps.chaos && resistanceGaps.chaos > 0) targets.push(`${resistanceGaps.chaos}% Chaos`);

  output += targets.join(', ') + '\n';
  output += `Found ${recommendations.length} recommendations\n\n`;

  for (const rec of recommendations) {
    const item = rec.listing.item;
    const price = rec.listing.listing.price;

    output += `${rec.rank}. ${item.name || item.typeLine}`;
    if (rec.priority === 'high') output += ' ⭐';
    output += `\n`;

    if (item.typeLine && item.name !== item.typeLine) {
      output += `   Type: ${item.typeLine}\n`;
    }

    output += `   Score: ${rec.score.toFixed(1)}/100 (${rec.priority} priority)\n`;

    if (price) {
      output += `   Price: ${price.amount} ${price.currency}\n`;
    }

    if (rec.costBenefit.resistGain) {
      const gains = [];
      const rg = rec.costBenefit.resistGain;
      if (rg.fire) gains.push(`${rg.fire}% Fire`);
      if (rg.cold) gains.push(`${rg.cold}% Cold`);
      if (rg.lightning) gains.push(`${rg.lightning}% Lightning`);
      if (rg.chaos) gains.push(`${rg.chaos}% Chaos`);

      if (gains.length > 0) {
        output += `   Provides: ${gains.join(', ')}\n`;
      }
    }

    if (rec.costBenefit.efficiency) {
      output += `   Efficiency: ${rec.costBenefit.efficiency.toFixed(2)} resist per ${rec.costBenefit.currency}\n`;
    }

    if (rec.reasons.length > 0) {
      output += `   Why:\n`;
      for (const reason of rec.reasons.slice(0, 2)) {
        output += `     - ${reason}\n`;
      }
    }

    output += `   Seller: ${rec.listing.listing.account.name}`;
    if (rec.listing.listing.account.online) {
      output += ' (Online)';
    }
    output += '\n';

    if (includeLinks && rec.listing.listing.whisper) {
      output += `   Whisper: ${rec.listing.listing.whisper}\n`;
    }

    output += `   🔗 View item: ${getTradeItemUrl(league, rec.searchId, rec.listing.id)}\n`;
    output += '\n';
  }

  return output;
}

/**
 * Compare multiple trade items side-by-side
 */
export async function handleCompareTradeItems(
  context: TradeContext,
  args: {
    item_ids: string[];
    build_context?: {
      life_needed?: number;
      es_needed?: number;
      dps_target?: number;
      fire_resist_needed?: number;
      cold_resist_needed?: number;
      lightning_resist_needed?: number;
    };
  }
): Promise<{
  content: Array<{
    type: string;
    text: string;
  }>;
}> {
  return wrapHandler('compare trade items', async () => {
    const { item_ids, build_context } = args;

    if (!item_ids || item_ids.length === 0) {
      return {
        content: [{ type: 'text', text: 'No item IDs provided for comparison.' }],
      };
    }

    if (item_ids.length > 5) {
      return {
        content: [{ type: 'text', text: 'Can only compare up to 5 items at once.' }],
      };
    }

    const items = await context.tradeClient.fetchItems(item_ids);

    if (items.length === 0) {
      return {
        content: [{ type: 'text', text: 'No items found with the provided IDs.' }],
      };
    }

    const output = formatItemComparison(items, build_context);
    return { content: [{ type: 'text', text: output }] };
  });
}

function formatItemComparison(
  items: ItemListing[],
  buildContext?: {
    life_needed?: number;
    es_needed?: number;
    dps_target?: number;
    fire_resist_needed?: number;
    cold_resist_needed?: number;
    lightning_resist_needed?: number;
  }
): string {
  let output = '=== Trade Item Comparison ===\n';
  output += 'Comparing ' + items.length + ' items\n\n';

  const itemStats = items.map(listing => {
    const item = listing.item;
    const price = listing.listing.price;

    return {
      name: item.name || item.typeLine,
      typeLine: item.typeLine,
      price: price ? price.amount + ' ' + price.currency : 'No price',
      priceAmount: price?.amount || 0,
      ilvl: item.ilvl,
      corrupted: item.corrupted || false,
      links: item.sockets ? getMaxLinks(item.sockets) : 0,
      life: extractStatValue(item, 'life'),
      es: extractStatValue(item, 'energy shield'),
      armour: extractStatValue(item, 'armour'),
      evasion: extractStatValue(item, 'evasion'),
      fireResist: extractResistValue(item, 'fire'),
      coldResist: extractResistValue(item, 'cold'),
      lightningResist: extractResistValue(item, 'lightning'),
      chaosResist: extractResistValue(item, 'chaos'),
      seller: listing.listing.account.name,
      online: listing.listing.account.online,
    };
  });

  const maxLife = Math.max(...itemStats.map(i => i.life));
  const maxES = Math.max(...itemStats.map(i => i.es));
  const minPrice = Math.min(...itemStats.filter(i => i.priceAmount > 0).map(i => i.priceAmount));

  for (let i = 0; i < itemStats.length; i++) {
    const stats = itemStats[i];
    output += (i + 1) + '. ' + stats.name + '\n';

    if (stats.name !== stats.typeLine) {
      output += '   Base: ' + stats.typeLine + '\n';
    }

    output += '   Price: ' + stats.price;
    if (stats.priceAmount === minPrice && minPrice > 0) {
      output += ' 💰 (Best Value)';
    }
    output += '\n';

    output += '   ilvl: ' + stats.ilvl;
    if (stats.corrupted) output += ' (Corrupted)';
    output += '\n';

    if (stats.links > 0) {
      output += '   Links: ' + stats.links + 'L\n';
    }

    if (stats.life > 0) {
      output += '   Life: +' + stats.life;
      if (stats.life === maxLife) output += ' ⭐';
      if (buildContext?.life_needed && stats.life >= buildContext.life_needed) {
        output += ' ✓';
      }
      output += '\n';
    }

    if (stats.es > 0) {
      output += '   ES: +' + stats.es;
      if (stats.es === maxES) output += ' ⭐';
      if (buildContext?.es_needed && stats.es >= buildContext.es_needed) {
        output += ' ✓';
      }
      output += '\n';
    }

    if (stats.armour > 0) {
      output += '   Armour: ' + stats.armour + '\n';
    }

    if (stats.evasion > 0) {
      output += '   Evasion: ' + stats.evasion + '\n';
    }

    const resists = [];
    if (stats.fireResist > 0) {
      let resistStr = stats.fireResist + '% Fire';
      if (buildContext?.fire_resist_needed && stats.fireResist >= buildContext.fire_resist_needed) {
        resistStr += ' ✓';
      }
      resists.push(resistStr);
    }
    if (stats.coldResist > 0) {
      let resistStr = stats.coldResist + '% Cold';
      if (buildContext?.cold_resist_needed && stats.coldResist >= buildContext.cold_resist_needed) {
        resistStr += ' ✓';
      }
      resists.push(resistStr);
    }
    if (stats.lightningResist > 0) {
      let resistStr = stats.lightningResist + '% Lightning';
      if (buildContext?.lightning_resist_needed && stats.lightningResist >= buildContext.lightning_resist_needed) {
        resistStr += ' ✓';
      }
      resists.push(resistStr);
    }
    if (stats.chaosResist > 0) {
      resists.push(stats.chaosResist + '% Chaos');
    }

    if (resists.length > 0) {
      output += '   Resistances: ' + resists.join(', ') + '\n';
    }

    output += '   Seller: ' + stats.seller;
    if (stats.online) output += ' (Online)';
    output += '\n\n';
  }

  output += '=== Summary ===\n';
  output += '⭐ = Best value for that stat\n';
  output += '✓ = Meets build requirement\n';
  output += '💰 = Cheapest option\n';

  return output;
}

function extractStatValue(item: any, statName: string): number {
  const allMods = [
    ...(item.explicitMods || []),
    ...(item.implicitMods || []),
    ...(item.craftedMods || []),
  ];

  for (const mod of allMods) {
    if (mod.toLowerCase().includes(statName.toLowerCase())) {
      const match = mod.match(/(\d+)/);
      if (match) {
        return parseInt(match[1], 10);
      }
    }
  }

  return 0;
}

function extractResistValue(item: any, element: string): number {
  const allMods = [
    ...(item.explicitMods || []),
    ...(item.implicitMods || []),
    ...(item.craftedMods || []),
  ];

  let total = 0;

  for (const mod of allMods) {
    const lowerMod = mod.toLowerCase();

    if (lowerMod.includes(element + ' resistance')) {
      const match = mod.match(/\+?(\d+)%/);
      if (match) total += parseInt(match[1], 10);
    }

    if ((element === 'fire' || element === 'cold' || element === 'lightning') &&
        (lowerMod.includes('all elemental resistances') || lowerMod.includes('to all resistances'))) {
      const match = mod.match(/\+?(\d+)%/);
      if (match) total += parseInt(match[1], 10);
    }
  }

  return total;
}
