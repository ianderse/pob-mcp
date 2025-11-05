import {
  TradeQuery,
  StatFilterGroup,
  ItemRequirements,
  ResistanceRequirements,
  SearchOptions,
} from '../types/tradeTypes.js';

/**
 * Builder class for constructing Path of Exile Trade API queries
 *
 * Provides a fluent API for building complex trade queries with:
 * - Item type and name filtering
 * - Price ranges
 * - Stat requirements
 * - Socket/link requirements
 * - Resistance requirements
 * - Online-only filtering
 */
export class TradeQueryBuilder {
  private query: TradeQuery = {
    query: {
      status: { option: 'online' },
      filters: {},
    },
  };

  /**
   * Set item name filter
   */
  withName(name: string): this {
    this.query.query.name = name;
    return this;
  }

  /**
   * Set item type filter (base type or category)
   */
  withType(type: string): this {
    // Map generic categories to trade API categories
    const categoryMap: Record<string, string> = {
      'boots': 'armour.boots',
      'gloves': 'armour.gloves',
      'helmet': 'armour.helmet',
      'body armour': 'armour.chest',
      'chest': 'armour.chest',
      'shield': 'armour.shield',
      'quiver': 'armour.quiver',
      'ring': 'accessory.ring',
      'amulet': 'accessory.amulet',
      'belt': 'accessory.belt',
      'jewel': 'jewel',
      'flask': 'flask',
      'bow': 'weapon.bow',
      'claw': 'weapon.claw',
      'dagger': 'weapon.dagger',
      'wand': 'weapon.wand',
      'one hand sword': 'weapon.onesword',
      'two hand sword': 'weapon.twosword',
      'one hand axe': 'weapon.oneaxe',
      'two hand axe': 'weapon.twoaxe',
      'one hand mace': 'weapon.onemace',
      'two hand mace': 'weapon.twomace',
      'sceptre': 'weapon.sceptre',
      'staff': 'weapon.staff',
      'warstaff': 'weapon.warstaff',
    };

    const typeLower = type.toLowerCase();
    const category = categoryMap[typeLower];

    if (category) {
      // Use category filter for generic types
      this.withCategory(category);
    } else {
      // Use specific base type
      this.query.query.type = type;
    }

    return this;
  }

  /**
   * Set item category filter
   */
  withCategory(category: string): this {
    if (!this.query.query.filters) {
      this.query.query.filters = {};
    }
    if (!this.query.query.filters.type_filters) {
      this.query.query.filters.type_filters = {};
    }
    if (!this.query.query.filters.type_filters.filters) {
      this.query.query.filters.type_filters.filters = {};
    }

    this.query.query.filters.type_filters.filters.category = {
      option: category,
    };

    return this;
  }

  /**
   * Set search term (generic search)
   */
  withTerm(term: string): this {
    this.query.query.term = term;
    return this;
  }

  /**
   * Filter by online status
   */
  withOnlineStatus(status: 'online' | 'onlineleague' | 'any'): this {
    this.query.query.status = { option: status };
    return this;
  }

  /**
   * Set price range filter
   */
  withPriceRange(min?: number, max?: number, currency: string = 'chaos'): this {
    if (!this.query.query.filters) {
      this.query.query.filters = {};
    }
    if (!this.query.query.filters.trade_filters) {
      this.query.query.filters.trade_filters = {};
    }
    if (!this.query.query.filters.trade_filters.filters) {
      this.query.query.filters.trade_filters.filters = {};
    }

    this.query.query.filters.trade_filters.filters.price = {
      min,
      max,
    };

    return this;
  }

  /**
   * Set item rarity filter
   */
  withRarity(rarity: 'normal' | 'magic' | 'rare' | 'unique' | 'any'): this {
    if (!this.query.query.filters) {
      this.query.query.filters = {};
    }
    if (!this.query.query.filters.type_filters) {
      this.query.query.filters.type_filters = {};
    }
    if (!this.query.query.filters.type_filters.filters) {
      this.query.query.filters.type_filters.filters = {};
    }

    this.query.query.filters.type_filters.filters.rarity = {
      option: rarity,
    };

    return this;
  }

  /**
   * Set item level range
   */
  withItemLevel(min?: number, max?: number): this {
    if (!this.query.query.filters) {
      this.query.query.filters = {};
    }
    if (!this.query.query.filters.type_filters) {
      this.query.query.filters.type_filters = {};
    }
    if (!this.query.query.filters.type_filters.filters) {
      this.query.query.filters.type_filters.filters = {};
    }

    this.query.query.filters.type_filters.filters.ilvl = {
      min,
      max,
    };

    return this;
  }

  /**
   * Set link requirement
   */
  withLinks(min?: number, max?: number): this {
    if (!this.query.query.filters) {
      this.query.query.filters = {};
    }
    if (!this.query.query.filters.socket_filters) {
      this.query.query.filters.socket_filters = {};
    }
    if (!this.query.query.filters.socket_filters.filters) {
      this.query.query.filters.socket_filters.filters = {};
    }

    this.query.query.filters.socket_filters.filters.links = {
      min,
      max,
    };

    return this;
  }

  /**
   * Set socket color requirements
   */
  withSockets(r?: number, g?: number, b?: number, w?: number): this {
    if (!this.query.query.filters) {
      this.query.query.filters = {};
    }
    if (!this.query.query.filters.socket_filters) {
      this.query.query.filters.socket_filters = {};
    }
    if (!this.query.query.filters.socket_filters.filters) {
      this.query.query.filters.socket_filters.filters = {};
    }

    this.query.query.filters.socket_filters.filters.sockets = {
      r,
      g,
      b,
      w,
    };

    return this;
  }

  /**
   * Set weapon DPS requirement
   */
  withDPS(min?: number, max?: number): this {
    if (!this.query.query.filters) {
      this.query.query.filters = {};
    }
    if (!this.query.query.filters.weapon_filters) {
      this.query.query.filters.weapon_filters = {};
    }
    if (!this.query.query.filters.weapon_filters.filters) {
      this.query.query.filters.weapon_filters.filters = {};
    }

    this.query.query.filters.weapon_filters.filters.dps = {
      min,
      max,
    };

    return this;
  }

  /**
   * Set physical DPS requirement
   */
  withPDPS(min?: number, max?: number): this {
    if (!this.query.query.filters) {
      this.query.query.filters = {};
    }
    if (!this.query.query.filters.weapon_filters) {
      this.query.query.filters.weapon_filters = {};
    }
    if (!this.query.query.filters.weapon_filters.filters) {
      this.query.query.filters.weapon_filters.filters = {};
    }

    this.query.query.filters.weapon_filters.filters.pdps = {
      min,
      max,
    };

    return this;
  }

  /**
   * Set elemental DPS requirement
   */
  withEDPS(min?: number, max?: number): this {
    if (!this.query.query.filters) {
      this.query.query.filters = {};
    }
    if (!this.query.query.filters.weapon_filters) {
      this.query.query.filters.weapon_filters = {};
    }
    if (!this.query.query.filters.weapon_filters.filters) {
      this.query.query.filters.weapon_filters.filters = {};
    }

    this.query.query.filters.weapon_filters.filters.edps = {
      min,
      max,
    };

    return this;
  }

  /**
   * Add armour/evasion/ES requirements
   */
  withDefenses(armour?: { min?: number; max?: number }, evasion?: { min?: number; max?: number }, es?: { min?: number; max?: number }): this {
    if (!this.query.query.filters) {
      this.query.query.filters = {};
    }
    if (!this.query.query.filters.armour_filters) {
      this.query.query.filters.armour_filters = {};
    }
    if (!this.query.query.filters.armour_filters.filters) {
      this.query.query.filters.armour_filters.filters = {};
    }

    if (armour) {
      this.query.query.filters.armour_filters.filters.ar = armour;
    }
    if (evasion) {
      this.query.query.filters.armour_filters.filters.ev = evasion;
    }
    if (es) {
      this.query.query.filters.armour_filters.filters.es = es;
    }

    return this;
  }

  /**
   * Add stat requirements (uses stat IDs from Trade API)
   */
  withStats(stats: Array<{ id: string; min?: number; max?: number }>): this {
    const statFilters: StatFilterGroup = {
      type: 'and',
      filters: stats.map(stat => ({
        id: stat.id,
        value: {
          min: stat.min,
          max: stat.max,
        },
      })),
    };

    if (!this.query.query.stats) {
      this.query.query.stats = [];
    }

    this.query.query.stats.push(statFilters);
    return this;
  }

  /**
   * Add resistance requirements
   * Uses pseudo stats for total resistances
   */
  withResistances(resists: ResistanceRequirements): this {
    const resistStats: Array<{ id: string; min?: number }> = [];

    if (resists.fire > 0) {
      resistStats.push({
        id: 'pseudo.pseudo_total_fire_resistance',
        min: resists.fire,
      });
    }
    if (resists.cold > 0) {
      resistStats.push({
        id: 'pseudo.pseudo_total_cold_resistance',
        min: resists.cold,
      });
    }
    if (resists.lightning > 0) {
      resistStats.push({
        id: 'pseudo.pseudo_total_lightning_resistance',
        min: resists.lightning,
      });
    }
    if (resists.chaos && resists.chaos > 0) {
      resistStats.push({
        id: 'pseudo.pseudo_total_chaos_resistance',
        min: resists.chaos,
      });
    }

    return this.withStats(resistStats);
  }

  /**
   * Set sort order
   */
  withSort(field: 'price', order: 'asc' | 'desc'): this {
    this.query.sort = {
      [field]: order,
    };
    return this;
  }

  /**
   * Build query from ItemRequirements
   */
  static fromItemRequirements(requirements: ItemRequirements): TradeQueryBuilder {
    const builder = new TradeQueryBuilder();

    // Set type/base filter if specified
    if (requirements.slot) {
      // Map slot names to item categories
      const slotToType: Record<string, string> = {
        'Weapon 1': 'weapon',
        'Weapon 2': 'weapon',
        'Body Armour': 'armour.chest',
        'Helmet': 'armour.helmet',
        'Gloves': 'armour.gloves',
        'Boots': 'armour.boots',
        'Amulet': 'accessory.amulet',
        'Ring 1': 'accessory.ring',
        'Ring 2': 'accessory.ring',
        'Belt': 'accessory.belt',
      };
      // Note: Type filtering needs category option in type_filters
      // This is simplified - actual implementation would need category support
    }

    // Links
    if (requirements.links) {
      builder.withLinks(requirements.links);
    }

    // Sockets
    if (requirements.sockets) {
      builder.withSockets(
        requirements.sockets.r,
        requirements.sockets.g,
        requirements.sockets.b,
        requirements.sockets.w
      );
    }

    // Weapon DPS
    if (requirements.minDPS) {
      builder.withDPS(requirements.minDPS);
    }
    if (requirements.minPDPS) {
      builder.withPDPS(requirements.minPDPS);
    }
    if (requirements.minEDPS) {
      builder.withEDPS(requirements.minEDPS);
    }

    // Defenses
    if (requirements.minArmour || requirements.minEvasion || requirements.minES) {
      builder.withDefenses(
        requirements.minArmour ? { min: requirements.minArmour } : undefined,
        requirements.minEvasion ? { min: requirements.minEvasion } : undefined,
        requirements.minES ? { min: requirements.minES } : undefined
      );
    }

    // Resistances
    if (requirements.fireResist || requirements.coldResist || requirements.lightningResist) {
      builder.withResistances({
        fire: requirements.fireResist || 0,
        cold: requirements.coldResist || 0,
        lightning: requirements.lightningResist || 0,
        chaos: requirements.chaosResist || 0,
      });
    }

    // Life/ES (using pseudo stats)
    const lifeESStats: Array<{ id: string; min?: number }> = [];
    if (requirements.minLife) {
      lifeESStats.push({
        id: 'pseudo.pseudo_total_life',
        min: requirements.minLife,
      });
    }
    if (requirements.minES) {
      lifeESStats.push({
        id: 'pseudo.pseudo_total_energy_shield',
        min: requirements.minES,
      });
    }
    if (lifeESStats.length > 0) {
      builder.withStats(lifeESStats);
    }

    // Custom stats
    if (requirements.stats && requirements.stats.length > 0) {
      builder.withStats(requirements.stats);
    }

    return builder;
  }

  /**
   * Apply common search options
   */
  applyOptions(options: SearchOptions): this {
    if (options.onlineOnly !== false) {
      this.withOnlineStatus('online');
    }

    if (options.minPrice !== undefined || options.maxPrice !== undefined) {
      this.withPriceRange(options.minPrice, options.maxPrice, options.priceCurrency);
    }

    if (options.sort) {
      const [field, order] = options.sort.split('_') as ['price', 'asc' | 'desc'];
      this.withSort(field, order);
    }

    return this;
  }

  /**
   * Build and return the final query
   */
  build(): TradeQuery {
    return JSON.parse(JSON.stringify(this.query)); // Deep clone
  }

  /**
   * Reset the builder to start fresh
   */
  reset(): this {
    this.query = {
      query: {
        status: { option: 'online' },
        filters: {},
      },
    };
    return this;
  }
}
