/**
 * Item Recommendation Engine
 *
 * Analyzes builds and recommends item upgrades from the trade site
 * Provides cost/benefit analysis and prioritized suggestions
 */

import { TradeApiClient } from './tradeClient.js';
import { TradeQueryBuilder } from './tradeQueryBuilder.js';
import { StatMapper } from './statMapper.js';
import {
  ItemListing,
  ItemRequirements,
  BuildRequirements,
  BudgetConstraints,
  ItemRecommendation,
  ResistanceRequirements,
} from '../types/tradeTypes.js';

export interface UpgradeContext {
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

export class ItemRecommendationEngine {
  constructor(
    private tradeClient: TradeApiClient,
    private statMapper: StatMapper
  ) {}

  /**
   * Find item upgrades for a specific slot
   */
  async findUpgrades(
    slot: string,
    context: UpgradeContext
  ): Promise<ItemRecommendation[]> {
    const query = this.buildUpgradeQuery(slot, context);

    // Search for items
    const searchResult = await this.tradeClient.searchItems(context.league, query);

    if (!searchResult.result || searchResult.result.length === 0) {
      return [];
    }

    // Fetch up to 20 items for analysis
    const itemIdsToFetch = searchResult.result.slice(0, Math.min(20, searchResult.result.length));
    const items = await this.tradeClient.fetchItems(itemIdsToFetch, searchResult.id);

    // Score and rank items
    const recommendations = items.map((item, index) =>
      this.scoreItem(item, index, context)
    );

    // Sort by score descending
    recommendations.sort((a, b) => b.score - a.score);

    // Assign ranks
    recommendations.forEach((rec, index) => {
      rec.rank = index + 1;
    });

    return recommendations;
  }

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
        this.scoreResistanceItem(item, index, resistanceGaps, context)
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
    context: UpgradeContext
  ): ItemRecommendation {
    const item = listing.item;
    const price = listing.listing.price?.amount || 0;

    // Extract resistances from mods
    const resistances = this.extractResistances(item);

    // Calculate total needed resistance provided
    let totalResistanceProvided = 0;
    let resistGain: any = {};

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
   * Score an item for upgrade potential
   */
  private scoreItem(
    listing: ItemListing,
    index: number,
    context: UpgradeContext
  ): ItemRecommendation {
    const item = listing.item;
    const price = listing.listing.price?.amount || 0;

    let score = 0;
    const reasons: string[] = [];
    let priority: 'high' | 'medium' | 'low' = 'medium';

    // Extract item stats
    const life = this.extractStat(item, 'life');
    const es = this.extractStat(item, 'energy shield');
    const resistances = this.extractResistances(item);

    // Score based on build needs
    if (context.buildNeeds.lifeNeeded && life > 0) {
      const lifeGain = life - (context.currentItem?.life || 0);
      if (lifeGain > 0) {
        score += Math.min(30, lifeGain / 2);
        reasons.push(`+${lifeGain} life over current item`);
      }
    }

    if (context.buildNeeds.esNeeded && es > 0) {
      const esGain = es - (context.currentItem?.es || 0);
      if (esGain > 0) {
        score += Math.min(30, esGain / 3);
        reasons.push(`+${esGain} ES over current item`);
      }
    }

    // Resistance scoring
    if (context.buildNeeds.resistanceGaps) {
      const totalResistGain = this.calculateResistanceGain(
        resistances,
        context.currentItem?.resistances || {},
        context.buildNeeds.resistanceGaps
      );
      score += Math.min(40, totalResistGain);
      if (totalResistGain > 0) {
        reasons.push(`Improves resistances by ${totalResistGain}%`);
      }
    }

    // Price factor
    if (price <= context.budget.maxPricePerItem) {
      score += 10;
      reasons.push('Within budget');
    } else {
      score -= 20;
      reasons.push('Over budget');
    }

    // Online seller bonus
    if (listing.listing.account.online) {
      score += 5;
    }

    // Determine priority
    if (score >= 70) priority = 'high';
    else if (score >= 50) priority = 'medium';
    else priority = 'low';

    const efficiency = price > 0 ? score / price : score;

    return {
      listing,
      score,
      rank: index + 1,
      reasons,
      priority,
      costBenefit: {
        price,
        currency: listing.listing.price?.currency || 'chaos',
        lifeGain: life - (context.currentItem?.life || 0),
        esGain: es - (context.currentItem?.es || 0),
        resistGain: resistances,
        efficiency,
        pointsPerChaos: efficiency,
      },
    };
  }

  /**
   * Build a trade query for item upgrades
   */
  private buildUpgradeQuery(slot: string, context: UpgradeContext) {
    const builder = new TradeQueryBuilder();

    // Map slot to item type
    const slotTypeMap: Record<string, string> = {
      'Weapon 1': 'Weapon',
      'Weapon 2': 'Weapon',
      'Body Armour': 'Body Armour',
      'Helmet': 'Helmet',
      'Gloves': 'Gloves',
      'Boots': 'Boots',
      'Amulet': 'Amulet',
      'Ring 1': 'Ring',
      'Ring 2': 'Ring',
      'Belt': 'Belt',
    };

    const itemType = slotTypeMap[slot];
    if (itemType && itemType !== 'Weapon') {
      builder.withType(itemType);
    }

    // Apply budget
    builder.withPriceRange(undefined, context.budget.maxPricePerItem);

    // Add stat requirements
    const stats: Array<{ id: string; min?: number }> = [];

    if (context.buildNeeds.lifeNeeded) {
      stats.push({
        id: 'pseudo.pseudo_total_life',
        min: Math.max(60, context.currentItem?.life || 0),
      });
    }

    if (context.buildNeeds.esNeeded) {
      stats.push({
        id: 'pseudo.pseudo_total_energy_shield',
        min: Math.max(40, context.currentItem?.es || 0),
      });
    }

    if (stats.length > 0) {
      builder.withStats(stats);
    }

    builder.withOnlineStatus('online');
    builder.withSort('price', 'asc');

    return builder.build();
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

    builder.withOnlineStatus('online');
    builder.withSort('price', 'asc');

    return builder.build();
  }

  // ========================================
  // Helper Methods
  // ========================================

  private extractStat(item: any, statName: string): number {
    // This is a simplified extraction - in real implementation,
    // you'd parse the mods more carefully
    const allMods = [
      ...(item.explicitMods || []),
      ...(item.implicitMods || []),
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

  private extractResistances(item: any): {
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

    for (const mod of allMods) {
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

  private calculateResistanceGain(
    newResists: { fire: number; cold: number; lightning: number; chaos: number },
    currentResists: { fire?: number; cold?: number; lightning?: number; chaos?: number },
    gaps: ResistanceRequirements
  ): number {
    let totalGain = 0;

    if (gaps.fire > 0) {
      const gain = newResists.fire - (currentResists.fire || 0);
      totalGain += Math.max(0, Math.min(gain, gaps.fire));
    }

    if (gaps.cold > 0) {
      const gain = newResists.cold - (currentResists.cold || 0);
      totalGain += Math.max(0, Math.min(gain, gaps.cold));
    }

    if (gaps.lightning > 0) {
      const gain = newResists.lightning - (currentResists.lightning || 0);
      totalGain += Math.max(0, Math.min(gain, gaps.lightning));
    }

    if (gaps.chaos && gaps.chaos > 0) {
      const gain = newResists.chaos - (currentResists.chaos || 0);
      totalGain += Math.max(0, Math.min(gain, gaps.chaos));
    }

    return totalGain;
  }
}
