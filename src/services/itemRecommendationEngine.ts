/**
 * Item Recommendation Engine
 *
 * Analyzes builds and recommends item upgrades from the trade site
 * Provides cost/benefit analysis and prioritized suggestions
 */

import { TradeApiClient } from './tradeClient.js';
import { TradeQueryBuilder } from './tradeQueryBuilder.js';
import {
  ItemListing,
  TradeItem,
  BudgetConstraints,
  ItemRecommendation,
  ResistanceRequirements,
} from '../types/tradeTypes.js';

interface UpgradeContext {
  currentItem?: {
    name: string;
    slot: string;
    life?: number;
    es?: number;
    resistances?: {
      fire?: number;
      cold?: number;
      lightning?: number;
      chaos?: number;
    };
    dps?: number;
  };
  buildNeeds: {
    resistanceGaps?: ResistanceRequirements;
    lifeNeeded?: number;
    esNeeded?: number;
    dpsTarget?: number;
  };
  budget: BudgetConstraints;
  league: string;
}

function getModText(mod: unknown): string {
  if (typeof mod === 'string') return mod;
  if (mod && typeof mod === 'object') {
    const record = mod as { description?: unknown; text?: unknown };
    if (typeof record.description === 'string') return record.description;
    if (typeof record.text === 'string') return record.text;
  }
  return '';
}

export class ItemRecommendationEngine {
  constructor(
    private tradeClient: TradeApiClient
  ) {}

  /**
   * Find gear to cap resistances
   */
  async findResistanceGear(
    resistanceGaps: ResistanceRequirements,
    budget: BudgetConstraints,
    league: string,
    slots?: string[]
  ): Promise<ItemRecommendation[]> {
    const searchSlots = slots || ['Ring 1', 'Ring 2', 'Amulet', 'Belt', 'Gloves', 'Boots', 'Helmet'];
    const allRecommendations: ItemRecommendation[] = [];

    // Search each slot
    for (const slot of searchSlots) {
      const query = this.buildResistanceQuery(slot, resistanceGaps, budget);

      const searchResult = await this.tradeClient.searchItems(league, query);

      if (!searchResult.result || searchResult.result.length === 0) {
        continue;
      }

      const itemIdsToFetch = searchResult.result.slice(0, 10);
      const items = await this.tradeClient.fetchItems(itemIdsToFetch, searchResult.id);

      const context: UpgradeContext = {
        buildNeeds: {
          resistanceGaps,
        },
        budget,
        league,
      };

      const slotRecs = items.map((item, index) =>
        this.scoreResistanceItem(item, index, resistanceGaps, context, searchResult.id)
      );

      allRecommendations.push(...slotRecs);
    }

    // Sort by efficiency (resistance per chaos)
    allRecommendations.sort((a, b) => b.score - a.score);

    // Assign ranks
    allRecommendations.forEach((rec, index) => {
      rec.rank = index + 1;
    });

    return allRecommendations.slice(0, 20); // Top 20 recommendations
  }

  /**
   * Calculate cost/benefit score for resistance items
   */
  private scoreResistanceItem(
    listing: ItemListing,
    index: number,
    resistanceGaps: ResistanceRequirements,
    context: UpgradeContext,
    searchId: string
  ): ItemRecommendation {
    const item = listing.item;
    const price = listing.listing.price?.amount || 0;

    // Extract resistances from mods
    const resistances = this.extractResistances(item);

    // Calculate total needed resistance provided
    let totalResistanceProvided = 0;
    const resistGain: { fire?: number; cold?: number; lightning?: number; chaos?: number } = {};

    if (resistanceGaps.fire > 0 && resistances.fire > 0) {
      const provided = Math.min(resistances.fire, resistanceGaps.fire);
      totalResistanceProvided += provided;
      resistGain.fire = provided;
    }
    if (resistanceGaps.cold > 0 && resistances.cold > 0) {
      const provided = Math.min(resistances.cold, resistanceGaps.cold);
      totalResistanceProvided += provided;
      resistGain.cold = provided;
    }
    if (resistanceGaps.lightning > 0 && resistances.lightning > 0) {
      const provided = Math.min(resistances.lightning, resistanceGaps.lightning);
      totalResistanceProvided += provided;
      resistGain.lightning = provided;
    }
    if (resistanceGaps.chaos && resistanceGaps.chaos > 0 && resistances.chaos > 0) {
      const provided = Math.min(resistances.chaos, resistanceGaps.chaos);
      totalResistanceProvided += provided;
      resistGain.chaos = provided;
    }

    // Calculate efficiency (resistance per chaos)
    const efficiency = price > 0 ? (totalResistanceProvided / price) * 10 : totalResistanceProvided;

    // Calculate score (0-100)
    let score = 0;

    // Base score from total resistance provided (0-50 points)
    score += Math.min(50, totalResistanceProvided);

    // Efficiency bonus (0-30 points)
    score += Math.min(30, efficiency * 3);

    // Price bonus (0-20 points) - cheaper is better
    if (price <= context.budget.maxPricePerItem) {
      score += 20 * (1 - (price / context.budget.maxPricePerItem));
    }

    // Priority based on score
    let priority: 'high' | 'medium' | 'low' = 'low';
    if (score >= 70) priority = 'high';
    else if (score >= 50) priority = 'medium';

    // Generate reasons
    const reasons: string[] = [];
    if (totalResistanceProvided >= 80) {
      reasons.push('Provides excellent total resistances');
    } else if (totalResistanceProvided >= 50) {
      reasons.push('Provides good total resistances');
    }

    if (efficiency > 5) {
      reasons.push('Excellent efficiency (resistance per chaos)');
    }

    if (price <= context.budget.maxPricePerItem * 0.5) {
      reasons.push('Budget-friendly option');
    }

    const resistanceList = [];
    if (resistGain.fire) resistanceList.push(`${resistGain.fire}% Fire`);
    if (resistGain.cold) resistanceList.push(`${resistGain.cold}% Cold`);
    if (resistGain.lightning) resistanceList.push(`${resistGain.lightning}% Lightning`);
    if (resistGain.chaos) resistanceList.push(`${resistGain.chaos}% Chaos`);

    if (resistanceList.length > 0) {
      reasons.push(`Fills gaps: ${resistanceList.join(', ')}`);
    }

    return {
      listing,
      searchId,
      score,
      rank: index + 1,
      reasons,
      priority,
      costBenefit: {
        price,
        currency: listing.listing.price?.currency || 'chaos',
        resistGain,
        efficiency,
        pointsPerChaos: efficiency,
      },
    };
  }

  /**
   * Build a query for resistance gear
   */
  private buildResistanceQuery(
    slot: string,
    resistanceGaps: ResistanceRequirements,
    budget: BudgetConstraints
  ) {
    const builder = new TradeQueryBuilder();

    // Set item type
    const slotTypeMap: Record<string, string> = {
      'Ring 1': 'Ring',
      'Ring 2': 'Ring',
      'Amulet': 'Amulet',
      'Belt': 'Belt',
      'Gloves': 'Gloves',
      'Boots': 'Boots',
      'Helmet': 'Helmet',
      'Body Armour': 'Body Armour',
    };

    if (slotTypeMap[slot]) {
      builder.withType(slotTypeMap[slot]);
    }

    // Add resistance requirements
    builder.withResistances(resistanceGaps);

    // Apply budget
    builder.withPriceRange(undefined, budget.maxPricePerItem);

    builder.withOnlineStatus('available');
    builder.withSort('price', 'asc');

    return builder.build();
  }

  // ========================================
  // Helper Methods
  // ========================================

  private extractResistances(item: TradeItem): {
    fire: number;
    cold: number;
    lightning: number;
    chaos: number;
  } {
    const resistances = {
      fire: 0,
      cold: 0,
      lightning: 0,
      chaos: 0,
    };

    const allMods = [
      ...(item.explicitMods || []),
      ...(item.implicitMods || []),
      ...(item.craftedMods || []),
    ];

    for (const rawMod of allMods) {
      const mod = getModText(rawMod);
      const lowerMod = mod.toLowerCase();

      // Look for specific resistances
      if (lowerMod.includes('fire resistance')) {
        const match = mod.match(/\+?(\d+)%/);
        if (match) resistances.fire += parseInt(match[1], 10);
      }
      if (lowerMod.includes('cold resistance')) {
        const match = mod.match(/\+?(\d+)%/);
        if (match) resistances.cold += parseInt(match[1], 10);
      }
      if (lowerMod.includes('lightning resistance')) {
        const match = mod.match(/\+?(\d+)%/);
        if (match) resistances.lightning += parseInt(match[1], 10);
      }
      if (lowerMod.includes('chaos resistance')) {
        const match = mod.match(/\+?(\d+)%/);
        if (match) resistances.chaos += parseInt(match[1], 10);
      }

      // Handle "all elemental resistances"
      if (lowerMod.includes('all elemental resistances') || lowerMod.includes('to all resistances')) {
        const match = mod.match(/\+?(\d+)%/);
        if (match) {
          const value = parseInt(match[1], 10);
          resistances.fire += value;
          resistances.cold += value;
          resistances.lightning += value;
        }
      }
    }

    return resistances;
  }
}
