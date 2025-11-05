# Trade API - Phase 2 Complete! 🎉

## Overview

Phase 2 enhances the Trade API with intelligent stat mapping, making it much easier to search for items with specific stats without needing to know the exact Trade API stat IDs.

## What's New in Phase 2

### 1. **Comprehensive Stat Mapping System** ✨

Created a complete stat mapping database (`src/services/statMapper.ts`) with:

- **100+ mapped stats** covering all common PoB stats
- **Categories**: pseudo, explicit, implicit, enchant, crafted, fractured
- **Multiple aliases** per stat for flexible matching
- **Fuzzy search** for discovering the right stat

#### Example Mappings:

| PoB Stat Name | Trade API ID | Aliases |
|--------------|--------------|---------|
| `Life` | `pseudo.pseudo_total_life` | maximum life, max life, total life, +# to maximum life |
| `FireResist` | `pseudo.pseudo_total_fire_resistance` | fire resistance, fire resist, fire res |
| `CritChance` | `pseudo.pseudo_increased_critical_strike_chance` | increased critical strike chance, crit chance |
| `MovementSpeed` | `pseudo.pseudo_increased_movement_speed` | increased movement speed, move speed |

### 2. **New Tool: `search_stats`** 🔍

Find stat IDs by name using intelligent fuzzy matching.

**Parameters:**
- `query` (required): Stat name to search for
- `limit` (optional): Max results (default: 10)

**Example Queries:**
```
Search for "life" stat
Search for "fire resistance"
Search for "crit"
Search for "movement"
```

**Response includes:**
- PoB stat name
- Trade API ID (for use in searches)
- Category
- Description
- Aliases

**Sample Output:**
```
=== Stat Search Results for "crit" ===

Found 4 matching stats:

1. CritChance
   Trade ID: pseudo.pseudo_increased_critical_strike_chance
   Category: pseudo
   Description: Increased critical strike chance
   Aliases: increased critical strike chance, crit chance, ...

2. CritMultiplier
   Trade ID: pseudo.pseudo_total_critical_strike_multiplier
   Category: pseudo
   Description: Critical strike multiplier
   Aliases: critical strike multiplier, crit multi, ...
```

### 3. **StatMapper Service**

New service class with powerful features:

#### Methods:

**`getTradeId(pobStatName)`**
```typescript
const tradeId = statMapper.getTradeId('Life');
// Returns: 'pseudo.pseudo_total_life'
```

**`getPobName(tradeId)`**
```typescript
const pobName = statMapper.getPobName('pseudo.pseudo_total_life');
// Returns: 'Life'
```

**`fuzzySearch(query, limit)`**
```typescript
const results = statMapper.fuzzySearch('fire res', 5);
// Returns top 5 matches for "fire res"
```

**`pobStatToTradeFilter(name, min, max)`**
```typescript
const filter = statMapper.pobStatToTradeFilter('Life', 80);
// Returns: { id: 'pseudo.pseudo_total_life', min: 80 }
```

**`pobStatsToTradeFilters(stats[])`**
```typescript
const filters = statMapper.pobStatsToTradeFilters([
  { name: 'Life', min: 80 },
  { name: 'FireResist', min: 40 }
]);
// Returns array of trade filters
```

## Stat Categories Covered

### ✅ Defenses
- Life, Energy Shield, Mana
- Armour, Evasion
- All resistances (Fire, Cold, Lightning, Chaos, Elemental, All)

### ✅ Attributes
- Strength, Dexterity, Intelligence
- All Attributes

### ✅ Damage
- Physical, Fire, Cold, Lightning, Chaos, Elemental damage
- Increased damage by type
- Spell damage, Attack damage

### ✅ Attack & Cast Speed
- Attack speed
- Cast speed

### ✅ Critical Strike
- Crit chance (local and global)
- Crit multiplier (local and global)

### ✅ Movement & Utility
- Movement speed
- Item rarity/quantity
- Accuracy rating

### ✅ Regeneration & Leech
- Life/Mana regeneration (flat and %)
- Life/Mana leech

### ✅ Flask Stats
- Flask charges gained
- Flask duration
- Flask effect

### ✅ Gem Levels
- All skill gems
- Spell gems specifically

### ✅ Minion Stats
- Minion life
- Minion damage

## Usage Examples

### Example 1: Finding the Right Stat ID

**User:** "I want to search for items with high life, but I don't know the stat ID"

**Claude:** Uses `search_stats` tool:
```
search_stats query="life"
```

**Result:**
```
1. Life
   Trade ID: pseudo.pseudo_total_life
   Description: Total maximum life from all sources
```

### Example 2: Using Discovered Stat in Search

**User:** "Now search for rings with at least 80 life in Standard under 50 chaos"

**Claude:** Uses `search_trade_items`:
```json
{
  "league": "Standard",
  "item_type": "Ring",
  "max_price": 50,
  "stats": [
    {
      "id": "pseudo.pseudo_total_life",
      "min": 80
    }
  ]
}
```

### Example 3: Complex Multi-Stat Search

**User:** "Find boots with 80+ life, 30% movement speed, and 40+ fire resistance"

**Claude:**
1. Uses `search_stats` to find:
   - Life → `pseudo.pseudo_total_life`
   - Movement speed → `pseudo.pseudo_increased_movement_speed`
   - Fire resistance → `pseudo.pseudo_total_fire_resistance`

2. Searches with all stats:
```json
{
  "stats": [
    { "id": "pseudo.pseudo_total_life", "min": 80 },
    { "id": "pseudo.pseudo_increased_movement_speed", "min": 30 },
    { "id": "pseudo.pseudo_total_fire_resistance", "min": 40 }
  ]
}
```

## Fuzzy Matching Examples

The stat search is very forgiving:

| User Query | Top Matches |
|-----------|-------------|
| "life" | Life, MinionLife, LifeRegen, PercentLifeRegen, LifeLeech |
| "fire" | FireResist, FireDamage, IncreasedFireDamage |
| "crit" | CritChance, CritMultiplier, GlobalCritChance, GlobalCritMultiplier |
| "res" | All resistance stats |
| "movement" | MovementSpeed |
| "es" | EnergyShield, IncreasedEnergyShield |

## Technical Implementation

### Architecture

```
src/services/
  ├── statMapper.ts         # Stat mapping service
  ├── tradeClient.ts        # API client (Phase 1)
  └── tradeQueryBuilder.ts  # Query builder (Phase 1)

src/handlers/
  └── tradeHandlers.ts      # Added handleSearchStats

src/types/
  └── tradeTypes.ts         # Type definitions (Phase 1)
```

### Stat Mapping Data Structure

```typescript
interface StatMapping {
  pobName: string;          // PoB stat name
  tradeId: string;          // Trade API stat ID
  category: 'pseudo' | 'explicit' | 'implicit' | 'enchant' | 'crafted' | 'fractured';
  aliases: string[];        // Alternative names
  description?: string;     // Human-readable description
}
```

### Fuzzy Search Algorithm

The fuzzy search uses a weighted scoring system:
- **100 points**: Exact match on PoB name
- **95 points**: Exact match on alias
- **90 points**: Exact match on Trade ID
- **80 points**: Contains match on PoB name
- **75 points**: Contains match on alias
- **70 points**: Contains match on Trade ID
- **Up to 60 points**: Word-by-word partial matching

Results are sorted by score and returned.

## Benefits

### For Users 👥
- **No need to memorize stat IDs** - Just search by name
- **Natural language queries** - "life", "fire res", "crit" all work
- **Discover related stats** - Fuzzy search shows similar stats
- **Better search experience** - Less friction, more results

### For Developers 🛠️
- **Extensible design** - Easy to add more stat mappings
- **Type-safe** - Full TypeScript support
- **Tested patterns** - Reuses existing error handling
- **Well-documented** - Clear examples and usage

## What's Next: Phase 3 Preview

Phase 3 will focus on the **Recommendation Engine**:

### Planned Features:
- `find_item_upgrades`: Analyze build and suggest upgrades
- `find_resistance_gear`: Solve resistance cap problems
- Cost/benefit analysis for upgrades
- Integration with existing `analyze_items` tool
- Budget-aware recommendations

### Example Use Case:
```
User: "My build is missing fire resistance, what items should I buy?"

Claude:
1. Analyzes build (validates resistances)
2. Identifies resistance gaps (e.g., -25% fire res)
3. Uses trade API to find items filling the gap
4. Ranks by cost/benefit ratio
5. Suggests best upgrade path
```

## Migration & Compatibility

### Breaking Changes
- None! Phase 2 is fully backward compatible.

### New Environment Variables
- None required (Phase 1 config sufficient)

### New Dependencies
- None (uses existing dependencies)

## Performance

- **Stat lookup**: O(1) for direct lookups
- **Fuzzy search**: O(n) where n = number of mapped stats (~100)
- **Memory**: Negligible (<1MB for all mappings)
- **Caching**: Stat mapper initialized once at startup

## Future Enhancements

Potential improvements for future phases:
- **Dynamic stat fetching**: Fetch stats from Trade API `/data/stats`
- **More mappings**: Expand to 200+ stats
- **Implicit/explicit separation**: Better filtering by mod source
- **Weighted items**: Some items don't have certain stats
- **Tier information**: Map to specific mod tiers

## Summary

Phase 2 delivers a powerful stat mapping system that makes the Trade API much more accessible. Users no longer need to know obscure stat IDs - they can just search naturally and get results.

**Status**: ✅ Complete
**Build**: ✅ Passing
**Tools Added**: 1 (`search_stats`)
**Services Added**: 1 (`StatMapper`)
**Stat Mappings**: 100+

Ready for Phase 3! 🚀
