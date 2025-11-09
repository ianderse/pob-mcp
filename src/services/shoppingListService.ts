/**
 * Shopping List Service
 *
 * Generates prioritized shopping lists from PoB builds with price estimates
 */

import { PoBBuild } from '../types.js';
import { TradeApiClient } from './tradeClient.js';
import { StatMapper } from './statMapper.js';
import { PoeNinjaClient } from './poeNinjaClient.js';
import { TradeQueryBuilder } from './tradeQueryBuilder.js';

export type UpgradePriority = 'critical' | 'high' | 'medium' | 'low';
export type BudgetTier = 'budget' | 'medium' | 'endgame';

export interface ShoppingListItem {
  slot: string;
  priority: UpgradePriority;
  reason: string[];
  currentItem?: {
    name: string;
    rarity: string;
    issues: string[];
  };
  recommendations: {
    budget: ItemRecommendation;
    medium: ItemRecommendation;
    endgame: ItemRecommendation;
  };
  estimatedImpact: {
    life?: number;
    es?: number;
    dps?: number;
    resistances?: number;
  };
}

export interface ItemRecommendation {
  searchCriteria: string;
  estimatedPrice: {
    min: number;
    max: number;
    currency: string;
  };
  keyStats: string[];
  notes?: string;
}

export interface ShoppingList {
  buildName: string;
  league: string;
  summary: {
    totalItems: number;
    criticalUpgrades: number;
    totalBudgetCost: number;
    totalMediumCost: number;
    totalEndgameCost: number;
    currency: string;
  };
  items: ShoppingListItem[];
  priorities: {
    immediate: string[]; // Slots that need urgent upgrades
    shortTerm: string[]; // Next upgrades
    longTerm: string[]; // Luxury upgrades
  };
  buildNeeds: {
    lifeNeeded: number;
    esNeeded: number;
    resistanceGaps: {
      fire: number;
      cold: number;
      lightning: number;
      chaos: number;
    };
    currentDPS: number; // Current total build DPS
  };
}

export class ShoppingListService {
  constructor(
    private tradeClient?: TradeApiClient,
    private statMapper?: StatMapper,
    private ninjaClient?: PoeNinjaClient
  ) {}

  /**
   * Generate a shopping list from a PoB build
   */
  async generateShoppingList(
    build: PoBBuild,
    buildName: string,
    league: string,
    budget: BudgetTier = 'medium'
  ): Promise<ShoppingList> {
    // Extract build info
    const equippedItems = this.extractEquippedItems(build);
    const buildStats = this.analyzeBuildStats(build);
    const buildNeeds = this.calculateBuildNeeds(buildStats);

    // Analyze each slot
    const shoppingItems: ShoppingListItem[] = [];
    const slots = [
      'Weapon 1',
      'Weapon 2',
      'Helmet',
      'Body Armour',
      'Gloves',
      'Boots',
      'Amulet',
      'Ring 1',
      'Ring 2',
      'Belt',
    ];

    for (const slot of slots) {
      const currentItem = equippedItems[slot];
      const analysis = await this.analyzeSlot(slot, currentItem, buildNeeds, league);

      if (analysis) {
        shoppingItems.push(analysis);
      }
    }

    // Sort by priority
    shoppingItems.sort((a, b) => {
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });

    // Calculate totals
    const summary = this.calculateSummary(shoppingItems);

    // Categorize priorities
    const priorities = this.categorizePriorities(shoppingItems);

    return {
      buildName,
      league,
      summary,
      items: shoppingItems,
      priorities,
      buildNeeds,
    };
  }

  /**
   * Extract equipped items from build
   */
  private extractEquippedItems(build: PoBBuild): Record<string, any> {
    const equipped: Record<string, any> = {};

    const items = (build as any).Items;
    if (!items || !items.ItemSet) return equipped;

    const itemSet = items.ItemSet;
    if (!itemSet.Slot) return equipped;

    // Build item map
    const itemMap = new Map<string, string>();
    if (items.Item) {
      const itemList = Array.isArray(items.Item) ? items.Item : [items.Item];
      for (const item of itemList) {
        if (item.id && item['#text']) {
          itemMap.set(item.id, item['#text']);
        }
      }
    }

    // Get slots
    const slots = Array.isArray(itemSet.Slot) ? itemSet.Slot : [itemSet.Slot];

    for (const slot of slots) {
      if (!slot.name || !slot.itemId) continue;

      const itemText = itemMap.get(slot.itemId);
      if (!itemText) continue;

      const normalizedSlot = this.normalizeSlotName(slot.name);
      const parsedItem = this.parseItem(itemText);

      equipped[normalizedSlot] = parsedItem;
    }

    return equipped;
  }

  /**
   * Normalize slot names to consistent format
   */
  private normalizeSlotName(slotId: string): string {
    const slotMap: Record<string, string> = {
      Weapon1: 'Weapon 1',
      Weapon2: 'Weapon 2',
      Helmet: 'Helmet',
      'Body Armour': 'Body Armour',
      Gloves: 'Gloves',
      Boots: 'Boots',
      Amulet: 'Amulet',
      Ring1: 'Ring 1',
      Ring2: 'Ring 2',
      Belt: 'Belt',
    };

    return slotMap[slotId] || slotId;
  }

  /**
   * Parse item text from PoB format
   */
  private parseItem(itemText: string): any {
    const lines = itemText.split('\n');
    const item: any = {
      rarity: 'Unknown',
      name: '',
      baseType: '',
      life: 0,
      es: 0,
      resistances: { fire: 0, cold: 0, lightning: 0, chaos: 0 },
      mods: [],
      issues: [],
      // Weapon properties
      weapon: {
        physicalDamageMin: 0,
        physicalDamageMax: 0,
        fireDamageMin: 0,
        fireDamageMax: 0,
        coldDamageMin: 0,
        coldDamageMax: 0,
        lightningDamageMin: 0,
        lightningDamageMax: 0,
        chaosDamageMin: 0,
        chaosDamageMax: 0,
        attacksPerSecond: 0,
      },
    };

    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed.startsWith('Rarity:')) {
        item.rarity = trimmed.replace('Rarity:', '').trim();
      } else if (!item.name && trimmed && !trimmed.startsWith('Rarity:')) {
        item.name = trimmed;
      } else if (trimmed.match(/\+\d+ to maximum Life/)) {
        const match = trimmed.match(/\+(\d+) to maximum Life/);
        if (match) item.life = parseInt(match[1], 10);
      } else if (trimmed.match(/\+\d+ to maximum Energy Shield/)) {
        const match = trimmed.match(/\+(\d+) to maximum Energy Shield/);
        if (match) item.es = parseInt(match[1], 10);
      } else if (trimmed.match(/\+\d+% to (\w+) Resistance/)) {
        const match = trimmed.match(/\+(\d+)% to (\w+) Resistance/);
        if (match) {
          const element = match[2].toLowerCase() as 'fire' | 'cold' | 'lightning' | 'chaos';
          item.resistances[element] = parseInt(match[1], 10);
        }
      }

      // Parse weapon damage properties
      if (trimmed.startsWith('Physical Damage:')) {
        // Format: "Physical Damage: 50-100" or "Physical Damage: 50-100 (augmented)"
        const match = trimmed.match(/Physical Damage:\s*(\d+)-(\d+)/);
        if (match) {
          item.weapon.physicalDamageMin = parseInt(match[1], 10);
          item.weapon.physicalDamageMax = parseInt(match[2], 10);
        }
      } else if (trimmed.startsWith('Elemental Damage:')) {
        // Format: "Elemental Damage: 10-20 (augmented)" - typically fire/cold/lightning combined
        // For simplicity, we'll treat this as fire damage
        const match = trimmed.match(/Elemental Damage:\s*(\d+)-(\d+)/);
        if (match) {
          item.weapon.fireDamageMin = parseInt(match[1], 10);
          item.weapon.fireDamageMax = parseInt(match[2], 10);
        }
      } else if (trimmed.match(/Adds \d+-\d+ Fire Damage/)) {
        const match = trimmed.match(/Adds (\d+)-(\d+) Fire Damage/);
        if (match) {
          item.weapon.fireDamageMin += parseInt(match[1], 10);
          item.weapon.fireDamageMax += parseInt(match[2], 10);
        }
      } else if (trimmed.match(/Adds \d+-\d+ Cold Damage/)) {
        const match = trimmed.match(/Adds (\d+)-(\d+) Cold Damage/);
        if (match) {
          item.weapon.coldDamageMin += parseInt(match[1], 10);
          item.weapon.coldDamageMax += parseInt(match[2], 10);
        }
      } else if (trimmed.match(/Adds \d+-\d+ Lightning Damage/)) {
        const match = trimmed.match(/Adds (\d+)-(\d+) Lightning Damage/);
        if (match) {
          item.weapon.lightningDamageMin += parseInt(match[1], 10);
          item.weapon.lightningDamageMax += parseInt(match[2], 10);
        }
      } else if (trimmed.match(/Adds \d+-\d+ Chaos Damage/)) {
        const match = trimmed.match(/Adds (\d+)-(\d+) Chaos Damage/);
        if (match) {
          item.weapon.chaosDamageMin += parseInt(match[1], 10);
          item.weapon.chaosDamageMax += parseInt(match[2], 10);
        }
      } else if (trimmed.startsWith('Attacks per Second:')) {
        const match = trimmed.match(/Attacks per Second:\s*([\d.]+)/);
        if (match) {
          item.weapon.attacksPerSecond = parseFloat(match[1]);
        }
      }

      if (trimmed.startsWith('+') || trimmed.startsWith('-')) {
        item.mods.push(trimmed);
      }
    }

    // Identify issues
    if (item.rarity === 'Normal') {
      item.issues.push('White item - needs upgrade');
    }
    if (item.rarity === 'Magic' && !item.name.includes('Flask')) {
      item.issues.push('Blue item - needs rare upgrade');
    }

    return item;
  }

  /**
   * Analyze build stats from PoB PlayerStat values
   */
  private analyzeBuildStats(build: PoBBuild): any {
    const stats = {
      life: 0,
      es: 0,
      resistances: { fire: 0, cold: 0, lightning: 0, chaos: 0 },
      dps: 0,
    };

    // Parse PlayerStat entries
    if (build.Build?.PlayerStat) {
      const playerStats = Array.isArray(build.Build.PlayerStat)
        ? build.Build.PlayerStat
        : [build.Build.PlayerStat];

      for (const stat of playerStats) {
        const statName = stat.stat;
        const value = parseFloat(stat.value);

        // Life
        if (statName === 'Life') {
          stats.life = value;
        }
        // Energy Shield
        else if (statName === 'EnergyShield') {
          stats.es = value;
        }
        // Resistances (these are the final, calculated resistances)
        else if (statName === 'FireResist') {
          stats.resistances.fire = value;
        } else if (statName === 'ColdResist') {
          stats.resistances.cold = value;
        } else if (statName === 'LightningResist') {
          stats.resistances.lightning = value;
        } else if (statName === 'ChaosResist') {
          stats.resistances.chaos = value;
        }
        // Total DPS
        else if (statName === 'TotalDPS') {
          stats.dps = value;
        }
      }
    }

    return stats;
  }

  /**
   * Calculate what the build needs
   */
  private calculateBuildNeeds(buildStats: any): ShoppingList['buildNeeds'] {
    // Target: 75% all res, 4500+ life or 6000+ ES
    const lifeTarget = 4500;
    const resTarget = 75;

    return {
      lifeNeeded: Math.max(0, lifeTarget - buildStats.life),
      esNeeded: 0, // Could calculate ES needed if ES build
      resistanceGaps: {
        fire: Math.max(0, resTarget - buildStats.resistances.fire),
        cold: Math.max(0, resTarget - buildStats.resistances.cold),
        lightning: Math.max(0, resTarget - buildStats.resistances.lightning),
        chaos: Math.max(0, 0 - buildStats.resistances.chaos), // Chaos target is 0%
      },
      currentDPS: buildStats.dps, // Current total build DPS
    };
  }

  /**
   * Analyze a specific item slot
   */
  private async analyzeSlot(
    slot: string,
    currentItem: any | undefined,
    buildNeeds: ShoppingList['buildNeeds'],
    league: string
  ): Promise<ShoppingListItem | null> {
    // Determine if slot needs upgrade
    const issues: string[] = currentItem?.issues || [];
    let priority: UpgradePriority = 'low';
    const reasons: string[] = [];

    if (!currentItem) {
      priority = 'critical';
      reasons.push('Empty slot - no item equipped');
    } else if (issues.length > 0) {
      priority = 'high';
      reasons.push(...issues);
    } else if (this.isDefensiveSlot(slot)) {
      // Check if defensive slot contributes to needs
      const totalRes =
        (currentItem.resistances?.fire || 0) +
        (currentItem.resistances?.cold || 0) +
        (currentItem.resistances?.lightning || 0);

      if (totalRes < 60) {
        priority = 'medium';
        reasons.push('Low resistances - needs improvement');
      }

      if (currentItem.life < 60 && buildNeeds.lifeNeeded > 0) {
        priority = 'medium';
        reasons.push('Low life - needs improvement');
      }
    }

    // Generate recommendations (accounting for replacement)
    const recommendations = this.generateRecommendations(slot, currentItem, buildNeeds);

    // Estimate NET impact (accounting for what we lose)
    const estimatedImpact = this.estimateNetImpact(slot, currentItem, buildNeeds);

    return {
      slot,
      priority,
      reason: reasons.length > 0 ? reasons : ['Consider upgrade for better stats'],
      currentItem: currentItem
        ? {
            name: currentItem.name,
            rarity: currentItem.rarity,
            issues,
          }
        : undefined,
      recommendations,
      estimatedImpact,
    };
  }

  /**
   * Check if slot is defensive (armor/jewelry)
   */
  private isDefensiveSlot(slot: string): boolean {
    return [
      'Helmet',
      'Body Armour',
      'Gloves',
      'Boots',
      'Ring 1',
      'Ring 2',
      'Belt',
      'Amulet',
    ].includes(slot);
  }

  /**
   * Generate tier-based recommendations
   * Now accounts for current item stats to calculate replacement + gap contribution
   */
  private generateRecommendations(
    slot: string,
    currentItem: any,
    buildNeeds: ShoppingList['buildNeeds']
  ): ShoppingListItem['recommendations'] {
    // Budget recommendation
    const budget: ItemRecommendation = {
      searchCriteria: `${slot} with life and resistances`,
      estimatedPrice: { min: 5, max: 20, currency: 'chaos' },
      keyStats: this.getKeyStatsForSlot(slot, buildNeeds, 'budget', currentItem),
    };

    // Medium recommendation
    const medium: ItemRecommendation = {
      searchCriteria: `${slot} with high life/ES and tri-res`,
      estimatedPrice: { min: 20, max: 100, currency: 'chaos' },
      keyStats: this.getKeyStatsForSlot(slot, buildNeeds, 'medium', currentItem),
    };

    // Endgame recommendation
    const endgame: ItemRecommendation = {
      searchCriteria: `${slot} with T1 life, tri-res, and offensive mods`,
      estimatedPrice: { min: 100, max: 500, currency: 'chaos' },
      keyStats: this.getKeyStatsForSlot(slot, buildNeeds, 'endgame', currentItem),
      notes: 'Consider influenced items or corruptions',
    };

    return { budget, medium, endgame };
  }

  /**
   * Get key stats recommendations for a slot based on budget tier
   * This now accounts for what we're losing from current item
   */
  private getKeyStatsForSlot(
    slot: string,
    buildNeeds: ShoppingList['buildNeeds'],
    tier: BudgetTier,
    currentItem?: any
  ): string[] {
    const stats: string[] = [];

    // Defensive slots get life/res
    if (this.isDefensiveSlot(slot)) {
      // Calculate what we need on this slot
      // We lose current stats, plus need to contribute to gap
      const currentLife = currentItem?.life || 0;
      const currentTotalRes =
        (currentItem?.resistances?.fire || 0) +
        (currentItem?.resistances?.cold || 0) +
        (currentItem?.resistances?.lightning || 0);

      // Divide the gap across defensive slots (8 total: helm, body, gloves, boots, 2 rings, belt, amulet)
      const defensiveSlots = 8;
      const lifeContribution = Math.ceil(buildNeeds.lifeNeeded / defensiveSlots);
      const totalResGap = buildNeeds.resistanceGaps.fire + buildNeeds.resistanceGaps.cold + buildNeeds.resistanceGaps.lightning;
      const resContribution = Math.ceil(totalResGap / defensiveSlots);

      // Target = what we need to replace + our share of the gap
      const targetLife = currentLife + lifeContribution;
      const targetRes = currentTotalRes + resContribution;

      if (tier === 'budget') {
        // Budget: aim for 60+ life and 60+ total res, or current + contribution, whichever is higher
        const budgetLife = Math.max(60, targetLife);
        const budgetRes = Math.max(60, targetRes);
        stats.push(`+${budgetLife} Life`);
        stats.push(`+${budgetRes}% Total Resistances`);
      } else if (tier === 'medium') {
        // Medium: aim for 80+ life and 90+ total res, or target, whichever is higher
        const mediumLife = Math.max(80, targetLife);
        const mediumRes = Math.max(90, targetRes);
        stats.push(`+${mediumLife} Life`);
        stats.push(`+${mediumRes}% Total Resistances`);
      } else {
        // Endgame: aim for 100+ life and 110+ total res, or target + buffer, whichever is higher
        const endgameLife = Math.max(100, targetLife + 20);
        const endgameRes = Math.max(110, targetRes + 20);
        stats.push(`+${endgameLife} Life`);
        stats.push(`+${endgameRes}% Total Resistances`);
        stats.push('Offensive mod (crit, attack speed, etc.)');
      }
    }

    // Weapon slots get DPS stats
    if (slot.includes('Weapon')) {
      if (tier === 'budget') {
        stats.push('300+ DPS');
      } else if (tier === 'medium') {
        stats.push('450+ DPS');
      } else {
        stats.push('600+ DPS');
        stats.push('Good crit chance/multiplier');
      }
    }

    return stats;
  }

  /**
   * Estimate NET impact of upgrading a slot
   * Shows what we GAIN after accounting for what we LOSE from current item
   */
  private estimateNetImpact(
    slot: string,
    currentItem: any,
    buildNeeds: ShoppingList['buildNeeds']
  ): ShoppingListItem['estimatedImpact'] {
    const impact: ShoppingListItem['estimatedImpact'] = {};

    if (this.isDefensiveSlot(slot)) {
      const currentLife = currentItem?.life || 0;
      const currentTotalRes =
        (currentItem?.resistances?.fire || 0) +
        (currentItem?.resistances?.cold || 0) +
        (currentItem?.resistances?.lightning || 0);

      // Divide gap across defensive slots
      const defensiveSlots = 8;
      const lifeContribution = Math.ceil(buildNeeds.lifeNeeded / defensiveSlots);
      const totalResGap = buildNeeds.resistanceGaps.fire + buildNeeds.resistanceGaps.cold + buildNeeds.resistanceGaps.lightning;
      const resContribution = Math.ceil(totalResGap / defensiveSlots);

      // Target for medium tier
      const targetLife = Math.max(80, currentLife + lifeContribution);
      const targetRes = Math.max(90, currentTotalRes + resContribution);

      // NET gain = new item - current item
      const lifeGain = targetLife - currentLife;
      const resGain = targetRes - currentTotalRes;

      if (lifeGain > 0) {
        impact.life = lifeGain;
      }

      if (resGain > 0) {
        impact.resistances = resGain;
      }
    }

    if (slot.includes('Weapon')) {
      // Extract current weapon base DPS from equipped item
      const currentWeaponBaseDPS = this.extractWeaponDPS(currentItem);

      // Target weapon base DPS based on tier (medium tier for estimation)
      const targetWeaponBaseDPS = 300; // Base weapon DPS

      // Estimate build's damage multiplier from total DPS vs weapon DPS
      // If we have both values, we can estimate the build's scaling
      const buildTotalDPS = buildNeeds.currentDPS || 0;
      let buildMultiplier = 1;

      if (currentWeaponBaseDPS > 0 && buildTotalDPS > 0) {
        // Multiplier = total DPS / weapon base DPS
        buildMultiplier = buildTotalDPS / currentWeaponBaseDPS;
      } else {
        // Default assumption: ~20x multiplier from passives/gems/gear
        buildMultiplier = 20;
      }

      // Estimate total DPS gain = (new weapon - old weapon) × build multiplier
      const weaponDPSGain = targetWeaponBaseDPS - currentWeaponBaseDPS;
      const estimatedTotalDPSGain = weaponDPSGain * buildMultiplier;

      if (estimatedTotalDPSGain > 0) {
        impact.dps = Math.round(estimatedTotalDPSGain);
      }
    }

    return impact;
  }

  /**
   * Extract weapon DPS from parsed item properties
   */
  private extractWeaponDPS(item: any): number {
    if (!item || !item.weapon) return 0;

    const weapon = item.weapon;
    const aps = weapon.attacksPerSecond;

    // If no APS, not a weapon
    if (!aps || aps === 0) return 0;

    // Calculate average damage for each type
    const avgPhysical = (weapon.physicalDamageMin + weapon.physicalDamageMax) / 2;
    const avgFire = (weapon.fireDamageMin + weapon.fireDamageMax) / 2;
    const avgCold = (weapon.coldDamageMin + weapon.coldDamageMax) / 2;
    const avgLightning = (weapon.lightningDamageMin + weapon.lightningDamageMax) / 2;
    const avgChaos = (weapon.chaosDamageMin + weapon.chaosDamageMax) / 2;

    // Total average damage per hit
    const avgDamagePerHit = avgPhysical + avgFire + avgCold + avgLightning + avgChaos;

    // DPS = average damage per hit × attacks per second
    const totalDPS = avgDamagePerHit * aps;

    return totalDPS;
  }

  /**
   * Calculate summary statistics
   */
  private calculateSummary(items: ShoppingListItem[]): ShoppingList['summary'] {
    let budgetCost = 0;
    let mediumCost = 0;
    let endgameCost = 0;
    let criticalCount = 0;

    for (const item of items) {
      budgetCost += (item.recommendations.budget.estimatedPrice.max + item.recommendations.budget.estimatedPrice.min) / 2;
      mediumCost += (item.recommendations.medium.estimatedPrice.max + item.recommendations.medium.estimatedPrice.min) / 2;
      endgameCost += (item.recommendations.endgame.estimatedPrice.max + item.recommendations.endgame.estimatedPrice.min) / 2;

      if (item.priority === 'critical') criticalCount++;
    }

    return {
      totalItems: items.length,
      criticalUpgrades: criticalCount,
      totalBudgetCost: Math.round(budgetCost),
      totalMediumCost: Math.round(mediumCost),
      totalEndgameCost: Math.round(endgameCost),
      currency: 'chaos',
    };
  }

  /**
   * Categorize items by priority
   */
  private categorizePriorities(items: ShoppingListItem[]): ShoppingList['priorities'] {
    return {
      immediate: items.filter((i) => i.priority === 'critical').map((i) => i.slot),
      shortTerm: items.filter((i) => i.priority === 'high').map((i) => i.slot),
      longTerm: items.filter((i) => i.priority === 'medium' || i.priority === 'low').map((i) => i.slot),
    };
  }
}
