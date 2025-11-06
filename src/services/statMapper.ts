/**
 * Stat Mapping System
 *
 * Maps Path of Building stat names to Trade API stat IDs
 * Provides fuzzy matching and search capabilities
 */

export interface StatMapping {
  pobName: string;
  tradeId: string;
  category: 'pseudo' | 'explicit' | 'implicit' | 'enchant' | 'crafted' | 'fractured';
  aliases: string[];
  description?: string;
}

/**
 * Comprehensive stat mappings between PoB and Trade API
 */
export const STAT_MAPPINGS: StatMapping[] = [
  // ========================================
  // Pseudo Stats (most commonly used)
  // ========================================
  {
    pobName: 'Life',
    tradeId: 'pseudo.pseudo_total_life',
    category: 'pseudo',
    aliases: ['maximum life', 'max life', 'total life', '+# to maximum life'],
    description: 'Total maximum life from all sources',
  },
  {
    pobName: 'EnergyShield',
    tradeId: 'pseudo.pseudo_total_energy_shield',
    category: 'pseudo',
    aliases: ['energy shield', 'es', 'maximum energy shield', 'total es'],
    description: 'Total maximum energy shield',
  },
  {
    pobName: 'Mana',
    tradeId: 'pseudo.pseudo_total_mana',
    category: 'pseudo',
    aliases: ['maximum mana', 'max mana', 'total mana', '+# to maximum mana'],
    description: 'Total maximum mana',
  },

  // Resistances
  {
    pobName: 'FireResist',
    tradeId: 'pseudo.pseudo_total_fire_resistance',
    category: 'pseudo',
    aliases: ['fire resistance', 'fire resist', 'fire res', '+#% to fire resistance'],
    description: 'Total fire resistance',
  },
  {
    pobName: 'ColdResist',
    tradeId: 'pseudo.pseudo_total_cold_resistance',
    category: 'pseudo',
    aliases: ['cold resistance', 'cold resist', 'cold res', '+#% to cold resistance'],
    description: 'Total cold resistance',
  },
  {
    pobName: 'LightningResist',
    tradeId: 'pseudo.pseudo_total_lightning_resistance',
    category: 'pseudo',
    aliases: ['lightning resistance', 'lightning resist', 'lightning res', '+#% to lightning resistance'],
    description: 'Total lightning resistance',
  },
  {
    pobName: 'ChaosResist',
    tradeId: 'pseudo.pseudo_total_chaos_resistance',
    category: 'pseudo',
    aliases: ['chaos resistance', 'chaos resist', 'chaos res', '+#% to chaos resistance'],
    description: 'Total chaos resistance',
  },
  {
    pobName: 'ElementalResist',
    tradeId: 'pseudo.pseudo_total_elemental_resistance',
    category: 'pseudo',
    aliases: ['elemental resistance', 'all elemental resistances', 'all res', 'tri-res'],
    description: 'Total elemental resistances (fire + cold + lightning)',
  },
  {
    pobName: 'AllResist',
    tradeId: 'pseudo.pseudo_total_all_resistances',
    category: 'pseudo',
    aliases: ['all resistances', 'total resistances'],
    description: 'Total all resistances including chaos',
  },

  // Attributes
  {
    pobName: 'Str',
    tradeId: 'pseudo.pseudo_total_strength',
    category: 'pseudo',
    aliases: ['strength', 'str', '+# to strength'],
    description: 'Total strength',
  },
  {
    pobName: 'Dex',
    tradeId: 'pseudo.pseudo_total_dexterity',
    category: 'pseudo',
    aliases: ['dexterity', 'dex', '+# to dexterity'],
    description: 'Total dexterity',
  },
  {
    pobName: 'Int',
    tradeId: 'pseudo.pseudo_total_intelligence',
    category: 'pseudo',
    aliases: ['intelligence', 'int', '+# to intelligence'],
    description: 'Total intelligence',
  },
  {
    pobName: 'AllAttributes',
    tradeId: 'pseudo.pseudo_total_all_attributes',
    category: 'pseudo',
    aliases: ['all attributes', '+# to all attributes'],
    description: 'Total to all attributes',
  },

  // Damage
  {
    pobName: 'PhysicalDamage',
    tradeId: 'pseudo.pseudo_adds_physical_damage',
    category: 'pseudo',
    aliases: ['added physical damage', 'adds # to # physical damage', 'phys damage'],
    description: 'Added physical damage to attacks',
  },
  {
    pobName: 'FireDamage',
    tradeId: 'pseudo.pseudo_adds_fire_damage',
    category: 'pseudo',
    aliases: ['added fire damage', 'adds # to # fire damage'],
    description: 'Added fire damage to attacks',
  },
  {
    pobName: 'ColdDamage',
    tradeId: 'pseudo.pseudo_adds_cold_damage',
    category: 'pseudo',
    aliases: ['added cold damage', 'adds # to # cold damage'],
    description: 'Added cold damage to attacks',
  },
  {
    pobName: 'LightningDamage',
    tradeId: 'pseudo.pseudo_adds_lightning_damage',
    category: 'pseudo',
    aliases: ['added lightning damage', 'adds # to # lightning damage'],
    description: 'Added lightning damage to attacks',
  },
  {
    pobName: 'ChaosDamage',
    tradeId: 'pseudo.pseudo_adds_chaos_damage',
    category: 'pseudo',
    aliases: ['added chaos damage', 'adds # to # chaos damage'],
    description: 'Added chaos damage to attacks',
  },
  {
    pobName: 'ElementalDamage',
    tradeId: 'pseudo.pseudo_adds_elemental_damage',
    category: 'pseudo',
    aliases: ['added elemental damage', 'elemental damage'],
    description: 'Added elemental damage (fire, cold, lightning)',
  },

  // Increased Damage
  {
    pobName: 'IncreasedPhysicalDamage',
    tradeId: 'pseudo.pseudo_increased_physical_damage',
    category: 'pseudo',
    aliases: ['increased physical damage', '#% increased physical damage'],
    description: 'Increased physical damage',
  },
  {
    pobName: 'IncreasedElementalDamage',
    tradeId: 'pseudo.pseudo_increased_elemental_damage',
    category: 'pseudo',
    aliases: ['increased elemental damage', '#% increased elemental damage'],
    description: 'Increased elemental damage',
  },
  {
    pobName: 'IncreasedSpellDamage',
    tradeId: 'pseudo.pseudo_increased_spell_damage',
    category: 'pseudo',
    aliases: ['increased spell damage', '#% increased spell damage'],
    description: 'Increased spell damage',
  },
  {
    pobName: 'IncreasedLightningDamage',
    tradeId: 'pseudo.pseudo_increased_lightning_damage',
    category: 'pseudo',
    aliases: ['increased lightning damage', '#% increased lightning damage'],
    description: 'Increased lightning damage',
  },
  {
    pobName: 'IncreasedColdDamage',
    tradeId: 'pseudo.pseudo_increased_cold_damage',
    category: 'pseudo',
    aliases: ['increased cold damage', '#% increased cold damage'],
    description: 'Increased cold damage',
  },
  {
    pobName: 'IncreasedFireDamage',
    tradeId: 'pseudo.pseudo_increased_fire_damage',
    category: 'pseudo',
    aliases: ['increased fire damage', '#% increased fire damage'],
    description: 'Increased fire damage',
  },

  // Attack/Cast Speed
  {
    pobName: 'AttackSpeed',
    tradeId: 'pseudo.pseudo_increased_attack_speed',
    category: 'pseudo',
    aliases: ['increased attack speed', '#% increased attack speed', 'attack speed'],
    description: 'Increased attack speed',
  },
  {
    pobName: 'CastSpeed',
    tradeId: 'pseudo.pseudo_increased_cast_speed',
    category: 'pseudo',
    aliases: ['increased cast speed', '#% increased cast speed', 'cast speed'],
    description: 'Increased cast speed',
  },

  // Critical Strike
  {
    pobName: 'CritChance',
    tradeId: 'pseudo.pseudo_critical_strike_chance',
    category: 'pseudo',
    aliases: ['increased critical strike chance', 'crit chance', '#% increased critical strike chance'],
    description: 'Increased critical strike chance',
  },
  {
    pobName: 'CritMultiplier',
    tradeId: 'pseudo.pseudo_critical_strike_multiplier',
    category: 'pseudo',
    aliases: ['critical strike multiplier', 'crit multi', '+#% to critical strike multiplier'],
    description: 'Critical strike multiplier',
  },
  {
    pobName: 'GlobalCritChance',
    tradeId: 'pseudo.pseudo_critical_strike_chance',
    category: 'pseudo',
    aliases: ['global critical strike chance', '#% to global critical strike chance'],
    description: 'Global critical strike chance',
  },
  {
    pobName: 'GlobalCritMultiplier',
    tradeId: 'pseudo.pseudo_critical_strike_multiplier',
    category: 'pseudo',
    aliases: ['global critical strike multiplier', '+#% to global critical strike multiplier'],
    description: 'Global critical strike multiplier',
  },

  // Defenses
  {
    pobName: 'Armour',
    tradeId: 'pseudo.pseudo_total_armour',
    category: 'pseudo',
    aliases: ['armour', 'armor', 'total armour', '+# to armour'],
    description: 'Total armour',
  },
  {
    pobName: 'Evasion',
    tradeId: 'pseudo.pseudo_total_evasion',
    category: 'pseudo',
    aliases: ['evasion', 'total evasion', '+# to evasion rating'],
    description: 'Total evasion rating',
  },
  {
    pobName: 'IncreasedArmour',
    tradeId: 'pseudo.pseudo_increased_armour',
    category: 'pseudo',
    aliases: ['increased armour', '#% increased armour'],
    description: 'Increased armour',
  },
  {
    pobName: 'IncreasedEvasion',
    tradeId: 'pseudo.pseudo_increased_evasion',
    category: 'pseudo',
    aliases: ['increased evasion', '#% increased evasion rating'],
    description: 'Increased evasion rating',
  },
  {
    pobName: 'IncreasedEnergyShield',
    tradeId: 'pseudo.pseudo_increased_energy_shield',
    category: 'pseudo',
    aliases: ['increased energy shield', '#% increased energy shield'],
    description: 'Increased energy shield',
  },

  // Movement
  {
    pobName: 'MovementSpeed',
    tradeId: 'pseudo.pseudo_increased_movement_speed',
    category: 'pseudo',
    aliases: ['increased movement speed', 'movement speed', '#% increased movement speed', 'move speed'],
    description: 'Increased movement speed',
  },

  // Rarity/Quantity
  {
    pobName: 'ItemRarity',
    tradeId: 'pseudo.pseudo_increased_rarity',
    category: 'pseudo',
    aliases: ['increased item rarity', 'item rarity', '#% increased rarity of items found'],
    description: 'Increased rarity of items found',
  },
  {
    pobName: 'ItemQuantity',
    tradeId: 'pseudo.pseudo_increased_quantity',
    category: 'pseudo',
    aliases: ['increased item quantity', 'item quantity', '#% increased quantity of items found'],
    description: 'Increased quantity of items found',
  },

  // Accuracy
  {
    pobName: 'Accuracy',
    tradeId: 'pseudo.pseudo_total_accuracy',
    category: 'pseudo',
    aliases: ['accuracy rating', '+# to accuracy rating', 'accuracy'],
    description: 'Total accuracy rating',
  },

  // Mana/Life Regeneration
  {
    pobName: 'LifeRegen',
    tradeId: 'pseudo.pseudo_total_life_regeneration',
    category: 'pseudo',
    aliases: ['life regeneration', 'life regen', '# life regenerated per second'],
    description: 'Life regenerated per second',
  },
  {
    pobName: 'ManaRegen',
    tradeId: 'pseudo.pseudo_total_mana_regeneration',
    category: 'pseudo',
    aliases: ['mana regeneration', 'mana regen', '# mana regenerated per second'],
    description: 'Mana regenerated per second',
  },
  {
    pobName: 'PercentLifeRegen',
    tradeId: 'pseudo.pseudo_percent_life_regeneration',
    category: 'pseudo',
    aliases: ['#% of life regenerated per second', 'life regen %'],
    description: 'Percent of life regenerated per second',
  },

  // Leech
  {
    pobName: 'LifeLeech',
    tradeId: 'pseudo.pseudo_life_leech',
    category: 'pseudo',
    aliases: ['life leech', '#% of physical attack damage leeched as life'],
    description: 'Life leech from attacks',
  },
  {
    pobName: 'ManaLeech',
    tradeId: 'pseudo.pseudo_mana_leech',
    category: 'pseudo',
    aliases: ['mana leech', '#% of physical attack damage leeched as mana'],
    description: 'Mana leech from attacks',
  },

  // Flask
  {
    pobName: 'FlaskCharges',
    tradeId: 'pseudo.pseudo_flask_charges_gained',
    category: 'pseudo',
    aliases: ['flask charges gained', '#% increased flask charges gained'],
    description: 'Increased flask charges gained',
  },
  {
    pobName: 'FlaskDuration',
    tradeId: 'pseudo.pseudo_flask_duration',
    category: 'pseudo',
    aliases: ['flask duration', '#% increased flask effect duration'],
    description: 'Increased flask effect duration',
  },
  {
    pobName: 'FlaskEffect',
    tradeId: 'pseudo.pseudo_flask_effect',
    category: 'pseudo',
    aliases: ['flask effect', '#% increased effect of flasks'],
    description: 'Increased effect of flasks',
  },

  // Gem levels
  {
    pobName: 'GemLevel',
    tradeId: 'pseudo.pseudo_gem_level',
    category: 'pseudo',
    aliases: ['+# to level of all skill gems', 'gem level'],
    description: 'Level of socketed gems',
  },
  {
    pobName: 'SpellGemLevel',
    tradeId: 'pseudo.pseudo_spell_gem_level',
    category: 'pseudo',
    aliases: ['+# to level of all spell skill gems', 'spell gem level'],
    description: 'Level of socketed spell gems',
  },

  // Minion stats
  {
    pobName: 'MinionLife',
    tradeId: 'pseudo.pseudo_minion_life',
    category: 'pseudo',
    aliases: ['minions have #% increased maximum life', 'minion life'],
    description: 'Minion maximum life',
  },
  {
    pobName: 'MinionDamage',
    tradeId: 'pseudo.pseudo_minion_damage',
    category: 'pseudo',
    aliases: ['minions deal #% increased damage', 'minion damage'],
    description: 'Minion damage',
  },
];

/**
 * Service for mapping between PoB stats and Trade API stat IDs
 */
export class StatMapper {
  private mappingsByPobName: Map<string, StatMapping>;
  private mappingsByTradeId: Map<string, StatMapping>;
  private allAliases: Map<string, StatMapping>;
  private allStats: StatMapping[] = [];
  private loaded: boolean = false;

  constructor() {
    this.mappingsByPobName = new Map();
    this.mappingsByTradeId = new Map();
    this.allAliases = new Map();

    // Initialize with static mappings as fallback
    this.loadStaticMappings();
  }

  /**
   * Load static stat mappings (used as fallback)
   */
  private loadStaticMappings(): void {
    for (const mapping of STAT_MAPPINGS) {
      this.addMapping(mapping);
    }
    this.allStats = [...STAT_MAPPINGS];
    this.loaded = true;
  }

  /**
   * Load stats dynamically from official PoE trade API data
   */
  async loadFromTradeAPI(statData: any): Promise<void> {
    // Clear existing mappings
    this.mappingsByPobName.clear();
    this.mappingsByTradeId.clear();
    this.allAliases.clear();
    this.allStats = [];

    // Process each stat category from the API
    if (statData && statData.result) {
      for (const category of statData.result) {
        const categoryType = this.getCategoryType(category.label);

        for (const entry of category.entries || []) {
          const mapping: StatMapping = {
            pobName: entry.id, // Use the ID as the PoB name for now
            tradeId: entry.id,
            category: categoryType,
            aliases: [entry.text, entry.id],
            description: entry.text,
          };

          this.addMapping(mapping);
          this.allStats.push(mapping);
        }
      }
    }

    this.loaded = true;
    console.error(`[StatMapper] Loaded ${this.allStats.length} stats from trade API`);
  }

  /**
   * Determine category type from API label
   */
  private getCategoryType(label: string): 'pseudo' | 'explicit' | 'implicit' | 'enchant' | 'crafted' | 'fractured' {
    const lowerLabel = label.toLowerCase();
    if (lowerLabel.includes('pseudo')) return 'pseudo';
    if (lowerLabel.includes('explicit')) return 'explicit';
    if (lowerLabel.includes('implicit')) return 'implicit';
    if (lowerLabel.includes('enchant')) return 'enchant';
    if (lowerLabel.includes('crafted')) return 'crafted';
    if (lowerLabel.includes('fractured')) return 'fractured';
    return 'explicit'; // Default
  }

  /**
   * Add a mapping to the indexes
   */
  private addMapping(mapping: StatMapping): void {
    this.mappingsByPobName.set(mapping.pobName.toLowerCase(), mapping);
    this.mappingsByTradeId.set(mapping.tradeId.toLowerCase(), mapping);

    // Add aliases
    for (const alias of mapping.aliases) {
      this.allAliases.set(alias.toLowerCase(), mapping);
    }
  }

  /**
   * Get Trade API stat ID from PoB stat name
   */
  getTradeId(pobStatName: string): string | null {
    const mapping = this.mappingsByPobName.get(pobStatName.toLowerCase());
    return mapping ? mapping.tradeId : null;
  }

  /**
   * Get PoB stat name from Trade API ID
   */
  getPobName(tradeId: string): string | null {
    const mapping = this.mappingsByTradeId.get(tradeId.toLowerCase());
    return mapping ? mapping.pobName : null;
  }

  /**
   * Search for stats by fuzzy matching
   * Returns matching stat mappings sorted by relevance
   */
  fuzzySearch(query: string, limit: number = 10): StatMapping[] {
    const queryLower = query.toLowerCase();
    const results: Array<{ mapping: StatMapping; score: number }> = [];

    // Check all mappings and aliases
    for (const mapping of this.allStats) {
      let score = 0;

      // Exact match on PoB name
      if (mapping.pobName.toLowerCase() === queryLower) {
        score = 100;
      }
      // Contains match on PoB name
      else if (mapping.pobName.toLowerCase().includes(queryLower)) {
        score = 80;
      }
      // Exact match on trade ID
      else if (mapping.tradeId.toLowerCase() === queryLower) {
        score = 90;
      }
      // Contains match on trade ID
      else if (mapping.tradeId.toLowerCase().includes(queryLower)) {
        score = 70;
      }

      // Check aliases
      for (const alias of mapping.aliases) {
        const aliasLower = alias.toLowerCase();
        if (aliasLower === queryLower) {
          score = Math.max(score, 95);
        } else if (aliasLower.includes(queryLower)) {
          score = Math.max(score, 75);
        }
      }

      // Word-by-word matching
      const queryWords = queryLower.split(/\s+/);
      const nameWords = mapping.pobName.toLowerCase().split(/\s+/);
      const aliasWords = mapping.aliases.flatMap(a => a.toLowerCase().split(/\s+/));

      let wordMatches = 0;
      for (const qWord of queryWords) {
        if (nameWords.some(w => w.includes(qWord)) || aliasWords.some(w => w.includes(qWord))) {
          wordMatches++;
        }
      }

      if (wordMatches > 0) {
        score = Math.max(score, (wordMatches / queryWords.length) * 60);
      }

      if (score > 0) {
        results.push({ mapping, score });
      }
    }

    // Sort by score descending
    results.sort((a, b) => b.score - a.score);

    return results.slice(0, limit).map(r => r.mapping);
  }

  /**
   * Get all mappings in a category
   */
  getByCategory(category: StatMapping['category']): StatMapping[] {
    return STAT_MAPPINGS.filter(m => m.category === category);
  }

  /**
   * Get all mappings
   */
  getAllMappings(): StatMapping[] {
    return [...STAT_MAPPINGS];
  }

  /**
   * Convert a PoB stat requirement to Trade API stat filter
   */
  pobStatToTradeFilter(pobStatName: string, min?: number, max?: number): { id: string; min?: number; max?: number } | null {
    const tradeId = this.getTradeId(pobStatName);
    if (!tradeId) {
      return null;
    }

    return {
      id: tradeId,
      min,
      max,
    };
  }

  /**
   * Batch convert multiple PoB stats to Trade API filters
   */
  pobStatsToTradeFilters(
    stats: Array<{ name: string; min?: number; max?: number }>
  ): Array<{ id: string; min?: number; max?: number }> {
    const results: Array<{ id: string; min?: number; max?: number }> = [];

    for (const stat of stats) {
      const filter = this.pobStatToTradeFilter(stat.name, stat.min, stat.max);
      if (filter) {
        results.push(filter);
      }
    }

    return results;
  }
}
