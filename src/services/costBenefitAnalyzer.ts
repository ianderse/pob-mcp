/**
 * Cost/Benefit Analysis for Trade Items
 *
 * Provides comprehensive value analysis for items based on:
 * - Life/ES efficiency (stat per chaos)
 * - Resistance efficiency
 * - DPS efficiency
 * - Overall value score
 */

import { ItemListing } from '../types/tradeTypes.js';

export interface StatExtraction {
  life: number;
  es: number;
  armour: number;
  evasion: number;
  fireResist: number;
  coldResist: number;
  lightningResist: number;
  chaosResist: number;
  totalResist: number;
  strength: number;
  dexterity: number;
  intelligence: number;
  physicalDPS?: number;
  elementalDPS?: number;
  totalDPS?: number;
}

export interface CostBenefitMetrics {
  // Efficiency metrics (stat per chaos)
  lifePerChaos: number;
  esPerChaos: number;
  totalResistPerChaos: number;
  armourPerChaos: number;
  evasionPerChaos: number;
  dpsPerChaos?: number;

  // Composite scores
  ehpPerChaos: number; // Effective HP (life + ES/2) per chaos
  defensiveValuePerChaos: number; // Combined defensive stats
  offensiveValuePerChaos: number; // Combined offensive stats

  // Overall value score (0-100)
  valueScore: number;

  // Value tier
  valueTier: 'excellent' | 'good' | 'average' | 'poor';

  // Budget efficiency
  isBudgetPick: boolean; // Great value for price
  isPremiumPick: boolean; // High stats, higher price

  // Warnings
  warnings: string[];
}

export interface ItemValueAnalysis {
  listing: ItemListing;
  stats: StatExtraction;
  metrics: CostBenefitMetrics;
  priceInChaos: number;
  rank?: number;
}

/**
 * Cost/Benefit Analyzer for trade items
 */
export class CostBenefitAnalyzer {
  /**
   * Analyze a single item's cost/benefit
   */
  analyzeItem(listing: ItemListing, currencyRates?: Map<string, number>): ItemValueAnalysis {
    const stats = this.extractStats(listing);
    const priceInChaos = this.convertToChaos(listing, currencyRates);
    const metrics = this.calculateMetrics(stats, priceInChaos);

    return {
      listing,
      stats,
      metrics,
      priceInChaos,
    };
  }

  /**
   * Analyze and rank multiple items by value
   */
  analyzeAndRank(listings: ItemListing[], currencyRates?: Map<string, number>): ItemValueAnalysis[] {
    const analyses = listings.map(listing => this.analyzeItem(listing, currencyRates));

    // Sort by value score descending
    analyses.sort((a, b) => b.metrics.valueScore - a.metrics.valueScore);

    // Assign ranks
    analyses.forEach((analysis, index) => {
      analysis.rank = index + 1;
    });

    return analyses;
  }

  /**
   * Extract all relevant stats from an item
   */
  private extractStats(listing: ItemListing): StatExtraction {
    const item = listing.item;
    const allMods = [
      ...(item.implicitMods || []),
      ...(item.explicitMods || []),
      ...(item.craftedMods || [])
    ].join('\n');

    const stats: StatExtraction = {
      life: this.extractStat(allMods, ['to maximum Life', 'maximum Life']),
      es: this.extractStat(allMods, ['to maximum Energy Shield', 'maximum Energy Shield']),
      armour: this.extractStat(allMods, ['to Armour', 'Armour']),
      evasion: this.extractStat(allMods, ['to Evasion', 'Evasion Rating']),
      fireResist: this.extractStat(allMods, ['to Fire Resistance', 'Fire Resistance']),
      coldResist: this.extractStat(allMods, ['to Cold Resistance', 'Cold Resistance']),
      lightningResist: this.extractStat(allMods, ['to Lightning Resistance', 'Lightning Resistance']),
      chaosResist: this.extractStat(allMods, ['to Chaos Resistance', 'Chaos Resistance']),
      totalResist: 0,
      strength: this.extractStat(allMods, ['to Strength']),
      dexterity: this.extractStat(allMods, ['to Dexterity']),
      intelligence: this.extractStat(allMods, ['to Intelligence']),
    };

    // Calculate total resist
    stats.totalResist = stats.fireResist + stats.coldResist + stats.lightningResist + stats.chaosResist;

    // Extract DPS for weapons
    if (item.properties) {
      for (const prop of item.properties) {
        if (prop.name === 'Physical Damage') {
          stats.physicalDPS = this.calculateDPS(prop, item);
        } else if (prop.name === 'Elemental Damage') {
          stats.elementalDPS = this.calculateElementalDPS(item);
        }
      }

      if (stats.physicalDPS || stats.elementalDPS) {
        stats.totalDPS = (stats.physicalDPS || 0) + (stats.elementalDPS || 0);
      }
    }

    return stats;
  }

  /**
   * Extract a stat value from mods text
   */
  private extractStat(modsText: string, patterns: string[]): number {
    for (const pattern of patterns) {
      const regex = new RegExp(`\\+(\\d+)(?:%)?\\s*${pattern}`, 'i');
      const match = modsText.match(regex);
      if (match) {
        return parseInt(match[1], 10);
      }
    }
    return 0;
  }

  /**
   * Calculate physical DPS from weapon properties
   */
  private calculateDPS(prop: any, item: any): number {
    let physDPS = 0;
    let aps = 1.0;

    // Extract attacks per second
    if (item.properties) {
      for (const p of item.properties) {
        if (p.name === 'Attacks per Second') {
          aps = parseFloat(p.values?.[0]?.[0] || '1.0');
        } else if (p.name === 'Physical Damage') {
          // Parse "X-Y" format
          const damageStr = p.values?.[0]?.[0] || '0-0';
          const match = damageStr.match(/(\d+)-(\d+)/);
          if (match) {
            const min = parseFloat(match[1]);
            const max = parseFloat(match[2]);
            const avgDamage = (min + max) / 2;
            physDPS = avgDamage * aps;
          }
        }
      }
    }

    return physDPS;
  }

  /**
   * Calculate elemental DPS
   */
  private calculateElementalDPS(item: any): number {
    let eleDPS = 0;
    let aps = 1.0;

    // Extract attacks per second
    if (item.properties) {
      for (const p of item.properties) {
        if (p.name === 'Attacks per Second') {
          aps = parseFloat(p.values?.[0]?.[0] || '1.0');
        } else if (p.name === 'Elemental Damage') {
          // Parse elemental damage ranges
          const damageStr = p.values?.[0]?.[0] || '0-0';
          const match = damageStr.match(/(\d+)-(\d+)/);
          if (match) {
            const min = parseFloat(match[1]);
            const max = parseFloat(match[2]);
            const avgDamage = (min + max) / 2;
            eleDPS += avgDamage * aps;
          }
        }
      }
    }

    // Also check for added elemental damage in explicit mods
    if (item.explicitMods) {
      for (const mod of item.explicitMods) {
        // Match patterns like "Adds 20-30 Fire Damage"
        const addedMatch = mod.match(/Adds (\d+)-(\d+) (\w+) Damage/);
        if (addedMatch) {
          const min = parseFloat(addedMatch[1]);
          const max = parseFloat(addedMatch[2]);
          const avgDamage = (min + max) / 2;
          eleDPS += avgDamage * aps;
        }
      }
    }

    return eleDPS;
  }

  /**
   * Convert item price to chaos equivalent
   */
  private convertToChaos(listing: ItemListing, currencyRates?: Map<string, number>): number {
    const price = listing.listing.price;
    if (!price) return 0;

    const amount = price.amount;
    const currency = price.currency;

    // Standard conversions (these should be dynamic in production)
    const defaultRates: Record<string, number> = {
      'chaos': 1,
      'divine': 180, // Example rate
      'exalted': 20, // Example rate
      'mirror': 100000, // Example rate
      'vaal': 0.5,
      'fusing': 0.4,
      'alchemy': 0.3,
      'chisel': 0.2,
    };

    const rate = currencyRates?.get(currency) || defaultRates[currency] || 1;
    return amount * rate;
  }

  /**
   * Calculate all cost/benefit metrics
   */
  private calculateMetrics(stats: StatExtraction, priceInChaos: number): CostBenefitMetrics {
    const price = priceInChaos || 1; // Avoid division by zero
    const warnings: string[] = [];

    // Calculate efficiency metrics
    const lifePerChaos = stats.life / price;
    const esPerChaos = stats.es / price;
    const totalResistPerChaos = stats.totalResist / price;
    const armourPerChaos = stats.armour / price;
    const evasionPerChaos = stats.evasion / price;
    const dpsPerChaos = stats.totalDPS ? stats.totalDPS / price : undefined;

    // Composite metrics
    const ehpPerChaos = (stats.life + stats.es / 2) / price;
    const defensiveValuePerChaos = (
      lifePerChaos * 2 +
      esPerChaos +
      totalResistPerChaos * 0.5 +
      armourPerChaos * 0.01 +
      evasionPerChaos * 0.01
    );
    const offensiveValuePerChaos = dpsPerChaos || 0;

    // Calculate overall value score (0-100)
    let valueScore = 0;

    // Life efficiency (0-25 points)
    valueScore += Math.min(25, lifePerChaos * 2.5);

    // ES efficiency (0-15 points)
    valueScore += Math.min(15, esPerChaos * 1.5);

    // Resist efficiency (0-30 points)
    valueScore += Math.min(30, totalResistPerChaos * 3);

    // Defense efficiency (0-15 points)
    const defenseScore = (armourPerChaos + evasionPerChaos) * 0.01;
    valueScore += Math.min(15, defenseScore);

    // DPS efficiency (0-15 points)
    if (dpsPerChaos) {
      valueScore += Math.min(15, dpsPerChaos * 0.05);
    }

    // Determine value tier
    let valueTier: 'excellent' | 'good' | 'average' | 'poor';
    if (valueScore >= 70) valueTier = 'excellent';
    else if (valueScore >= 50) valueTier = 'good';
    else if (valueScore >= 30) valueTier = 'average';
    else valueTier = 'poor';

    // Budget/Premium classification
    const isBudgetPick = valueScore >= 60 && priceInChaos < 50;
    const isPremiumPick = valueScore >= 70 && priceInChaos >= 100;

    // Generate warnings
    if (priceInChaos === 0) {
      warnings.push('No price listed - value metrics unavailable');
    }
    if (stats.life === 0 && stats.es === 0) {
      warnings.push('No life or ES - poor survivability');
    }
    if (stats.totalResist < 40 && stats.totalResist > 0) {
      warnings.push('Low total resistances');
    }

    return {
      lifePerChaos,
      esPerChaos,
      totalResistPerChaos,
      armourPerChaos,
      evasionPerChaos,
      dpsPerChaos,
      ehpPerChaos,
      defensiveValuePerChaos,
      offensiveValuePerChaos,
      valueScore,
      valueTier,
      isBudgetPick,
      isPremiumPick,
      warnings,
    };
  }

  /**
   * Format cost/benefit analysis for display
   */
  formatAnalysis(analysis: ItemValueAnalysis): string {
    const { stats, metrics, priceInChaos, listing } = analysis;
    let output = '';

    // Value tier indicator
    const tierEmoji = {
      'excellent': '💎',
      'good': '✨',
      'average': '➖',
      'poor': '⚠️'
    }[metrics.valueTier];

    output += `${tierEmoji} Value Score: ${metrics.valueScore.toFixed(1)}/100 (${metrics.valueTier})\n`;

    if (metrics.isBudgetPick) {
      output += `   💰 Budget Pick - Excellent value for price\n`;
    }
    if (metrics.isPremiumPick) {
      output += `   👑 Premium Pick - High-end stats\n`;
    }

    output += `\n   Cost/Benefit Ratios:\n`;

    if (stats.life > 0) {
      output += `   • Life: ${metrics.lifePerChaos.toFixed(2)} per chaos (+${stats.life} total)\n`;
    }
    if (stats.es > 0) {
      output += `   • ES: ${metrics.esPerChaos.toFixed(2)} per chaos (+${stats.es} total)\n`;
    }
    if (stats.totalResist > 0) {
      output += `   • Resist: ${metrics.totalResistPerChaos.toFixed(2)} per chaos (+${stats.totalResist}% total)\n`;
    }
    if (stats.armour > 0) {
      output += `   • Armour: ${metrics.armourPerChaos.toFixed(1)} per chaos (${stats.armour} total)\n`;
    }
    if (stats.evasion > 0) {
      output += `   • Evasion: ${metrics.evasionPerChaos.toFixed(1)} per chaos (${stats.evasion} total)\n`;
    }
    if (metrics.dpsPerChaos) {
      output += `   • DPS: ${metrics.dpsPerChaos.toFixed(2)} per chaos (${stats.totalDPS?.toFixed(0)} total)\n`;
    }

    output += `\n   Overall Efficiency:\n`;
    output += `   • EHP per chaos: ${metrics.ehpPerChaos.toFixed(2)}\n`;
    output += `   • Defensive value: ${metrics.defensiveValuePerChaos.toFixed(2)}\n`;

    if (metrics.warnings.length > 0) {
      output += `\n   ⚠️  Warnings:\n`;
      for (const warning of metrics.warnings) {
        output += `   • ${warning}\n`;
      }
    }

    return output;
  }
}
