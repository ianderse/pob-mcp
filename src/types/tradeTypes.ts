// Path of Exile Trade API Type Definitions

// ========================================
// Trade Query Structures
// ========================================

interface StatFilter {
  id: string;
  value?: {
    min?: number;
    max?: number;
  };
  disabled?: boolean;
}

export interface StatFilterGroup {
  type: 'and' | 'or' | 'not' | 'count' | 'if' | 'weight';
  filters: StatFilter[];
  value?: {
    min?: number;
    max?: number;
  };
  disabled?: boolean;
}

interface TradeFilters {
  trade_filters?: {
    filters?: {
      price?: {
        min?: number;
        max?: number;
        option?: string;
      };
      indexed?: {
        option?: string; // e.g., "1day", "3days", "1week"
      };
      sale_type?: {
        option?: string; // e.g., "priced"
      };
      collapse?: {
        option?: boolean;
      };
    };
    disabled?: boolean;
  };
  type_filters?: {
    filters?: {
      rarity?: {
        option?: string; // "normal", "magic", "rare", "unique", "any"
      };
      category?: {
        option?: string;
      };
      ilvl?: {
        min?: number;
        max?: number;
      };
      links?: {
        min?: number;
        max?: number;
      };
      sockets?: {
        r?: number;
        g?: number;
        b?: number;
        w?: number;
      };
      quality?: {
        min?: number;
        max?: number;
      };
    };
    disabled?: boolean;
  };
  socket_filters?: {
    filters?: {
      links?: {
        min?: number;
        max?: number;
      };
      sockets?: {
        r?: number;
        g?: number;
        b?: number;
        w?: number;
      };
    };
    disabled?: boolean;
  };
  req_filters?: {
    filters?: {
      lvl?: {
        min?: number;
        max?: number;
      };
      str?: {
        min?: number;
        max?: number;
      };
      dex?: {
        min?: number;
        max?: number;
      };
      int?: {
        min?: number;
        max?: number;
      };
    };
    disabled?: boolean;
  };
  weapon_filters?: {
    filters?: {
      damage?: {
        min?: number;
        max?: number;
      };
      crit?: {
        min?: number;
        max?: number;
      };
      aps?: {
        min?: number;
        max?: number;
      };
      dps?: {
        min?: number;
        max?: number;
      };
      pdps?: {
        min?: number;
        max?: number;
      };
      edps?: {
        min?: number;
        max?: number;
      };
    };
    disabled?: boolean;
  };
  armour_filters?: {
    filters?: {
      ar?: {
        min?: number;
        max?: number;
      };
      es?: {
        min?: number;
        max?: number;
      };
      ev?: {
        min?: number;
        max?: number;
      };
      block?: {
        min?: number;
        max?: number;
      };
    };
    disabled?: boolean;
  };
}

export interface TradeQuery {
  query: {
    status?: {
      option: 'available' | 'online' | 'onlineleague' | 'securable' | 'any';
    };
    name?: string;
    type?: string;
    term?: string;
    stats?: StatFilterGroup[];
    filters?: TradeFilters;
  };
  sort?: {
    price?: 'asc' | 'desc';
  };
}

// ========================================
// Trade API Response Structures
// ========================================

export interface SearchResult {
  id: string; // Search ID for fetching results
  complexity: number;
  result: string[]; // Array of item IDs
  total: number;
  inexact?: boolean;
}

interface Property {
  name: string;
  values: Array<[string, number]>; // [value, type]
  displayMode: number;
  type?: number;
}

interface Requirement {
  name: string;
  values: Array<[string, number]>;
  displayMode: number;
  suffix?: string;
}

interface Socket {
  group: number;
  attr?: string; // S, D, I, G (Str, Dex, Int, General)
  sColour?: string; // R, G, B, W
}

interface ExtendedMod {
  name: string;
  tier: string;
  level: number;
  magnitudes: Array<{
    hash: string;
    min: number;
    max: number;
  }>;
}

interface TradeItem {
  verified: boolean;
  w: number;
  h: number;
  icon: string;
  league: string;
  id: string;
  name: string;
  typeLine: string;
  baseType: string;
  identified: boolean;
  ilvl: number;
  note?: string;

  // Rarity
  rarity?: string; // "NORMAL", "MAGIC", "RARE", "UNIQUE"
  frameType: number; // 0-5 (0=normal, 1=magic, 2=rare, 3=unique, 4=gem, 5=currency)

  // Properties and requirements
  properties?: Property[];
  requirements?: Requirement[];

  // Sockets
  sockets?: Socket[];
  socketedItems?: TradeItem[];

  // Mods
  implicitMods?: string[];
  explicitMods?: string[];
  craftedMods?: string[];
  enchantMods?: string[];
  fracturedMods?: string[];
  utilityMods?: string[];

  // Extended info
  extended?: {
    mods?: {
      explicit?: ExtendedMod[];
      implicit?: ExtendedMod[];
      crafted?: ExtendedMod[];
      enchant?: ExtendedMod[];
      fractured?: ExtendedMod[];
    };
    hashes?: {
      explicit?: Array<[string, number[]]>;
      implicit?: Array<[string, number[]]>;
      crafted?: Array<[string, number[]]>;
      enchant?: Array<[string, number[]]>;
      fractured?: Array<[string, number[]]>;
    };
    text?: string;
    category?: string;
    subcategories?: string[];
    prefixes?: number;
    suffixes?: number;
  };

  // Corruption/influence
  corrupted?: boolean;
  mirrored?: boolean;
  split?: boolean;
  synthesised?: boolean;
  replica?: boolean;
  elder?: boolean;
  shaper?: boolean;
  crusader?: boolean;
  hunter?: boolean;
  redeemer?: boolean;
  warlord?: boolean;

  // Other
  flavourText?: string[];
  descrText?: string;
  secDescrText?: string;
  stackSize?: number;
  maxStackSize?: number;
  duplicated?: boolean;
  foilVariation?: number;
}

interface TradeAccount {
  name: string;
  lastCharacterName?: string;
  online?: {
    league?: string;
    status?: string;
  };
  language?: string;
}

interface TradePrice {
  type: string; // "~price", "~b/o", etc.
  amount: number;
  currency: string; // "chaos", "divine", "exa", etc.
}

interface TradeListing {
  method: string;
  indexed: string;
  stash?: {
    name: string;
    x: number;
    y: number;
  };
  whisper: string;
  whisper_token?: string;
  account: TradeAccount;
  price?: TradePrice;
}

export interface ItemListing {
  id: string;
  listing: TradeListing;
  item: TradeItem;
}

export interface FetchResult {
  result: ItemListing[];
}

// ========================================
// Static Data Structures
// ========================================

interface StatDefinition {
  id: string;
  text: string;
  type: string;
  option?: {
    options?: Array<{
      id: number;
      text: string;
    }>;
  };
}

interface StatCategory {
  label: string;
  entries: StatDefinition[];
}

export interface StatData {
  result: StatCategory[];
}

interface League {
  id: string;
  realm?: string;
  text?: string;
}

export interface LeagueData {
  result: League[];
}

// ========================================
// Recommendation System Interfaces
// ========================================

export interface ResistanceRequirements {
  fire: number;
  cold: number;
  lightning: number;
  chaos?: number;
}

export interface BudgetConstraints {
  maxPricePerItem: number;
  totalBudget: number;
  currency: string; // "chaos", "divine", etc.
  preferredBudgetDistribution?: {
    [slot: string]: number; // percentage of total budget
  };
}

interface StatComparison {
  current: { [key: string]: number };
  upgraded: { [key: string]: number };
  delta: { [key: string]: number };
}

interface CostBenefit {
  price: number;
  currency: string;
  dpsGain?: number;
  lifeGain?: number;
  esGain?: number;
  resistGain?: {
    fire?: number;
    cold?: number;
    lightning?: number;
    chaos?: number;
  };
  defenseGain?: {
    armour?: number;
    evasion?: number;
  };
  pointsPerChaos?: number; // General value metric
  efficiency: number; // 0-100 score
}

export interface ItemRecommendation {
  listing: ItemListing;
  searchId: string; // Trade search ID for generating item URLs
  score: number; // 0-100
  rank: number;
  reasons: string[];
  statComparison?: StatComparison;
  costBenefit: CostBenefit;
  priority: 'high' | 'medium' | 'low';
  warnings?: string[];
}

// ========================================
// Rate Limiting & Caching
// ========================================

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  retryAfter?: number;
  resetTime?: number;
}

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

// ========================================
// Search Options
// ========================================

export interface SearchOptions {
  league: string;
  onlineOnly?: boolean;
  /** Optional override for the online-status filter (default: 'available'). Use 'securable' for instant-buyout-from-online-seller listings only. */
  onlineStatus?: 'available' | 'online' | 'onlineleague' | 'securable' | 'any';
  minPrice?: number;
  maxPrice?: number;
  priceCurrency?: string;
  sort?: 'price_asc' | 'price_desc';
  limit?: number; // Max results to fetch
}
