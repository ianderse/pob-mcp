# Path of Exile Trade API Integration - Implementation Plan

## Executive Summary

Implementing trade site integration for the pob-mcp-server would enable Claude to search for and recommend item upgrades from the actual Path of Exile economy. This document outlines the requirements, challenges, and implementation strategy.

## Research Findings

### Official Trade API

**Base URL**: `https://www.pathofexile.com/api/trade`

**Key Endpoints**:
- `POST /search/{league}` - Search for items with filters
- `GET /fetch/{item_ids}` - Fetch full item details
- `GET /data/stats` - Get available stat filters
- `GET /data/static` - Get static data (item bases, mods, etc.)
- `GET /data/leagues` - Get available leagues

**Authentication**:
- OAuth 2.1 for private account data
- **Public trade searches require no authentication** ✅
- Rate limits apply based on IP, account, and client

**Rate Limits**:
- Public stash API: ~1 request/second
- Trade search API: ~4 requests/second (conservative estimate)
- Headers include rate limit info: `X-Rate-Limit-*`
- Must implement backoff/retry logic

## Architecture Design

### New Modules to Create

#### 1. `src/tradeClient.ts` - Trade API Client
```typescript
export class TradeApiClient {
  private baseUrl = 'https://www.pathofexile.com/api/trade';
  private rateLimit: RateLimiter;

  async searchItems(league: string, query: TradeQuery): Promise<SearchResult>
  async fetchItems(itemIds: string[]): Promise<ItemListing[]>
  async getStats(): Promise<StatDefinition[]>
  async getLeagues(): Promise<League[]>
  private handleRateLimit(response: Response): void
}
```

#### 2. `src/tradeQueryBuilder.ts` - Query Construction
```typescript
export class TradeQueryBuilder {
  buildItemQuery(slot: string, requirements: ItemRequirements): TradeQuery
  buildStatQuery(stats: StatFilter[]): TradeQuery
  buildPriceRange(min: number, max: number): PriceFilter
  buildResistanceQuery(fire: number, cold: number, lightning: number): TradeQuery
}
```

#### 3. `src/itemRecommendationEngine.ts` - Smart Recommendations
```typescript
export class ItemRecommendationEngine {
  async findUpgrades(
    currentItem: Item,
    buildRequirements: BuildRequirements,
    budget: BudgetConstraints
  ): Promise<ItemRecommendation[]>

  async findResistanceGear(
    neededResists: ResistanceRequirements,
    budget: number
  ): Promise<ItemListing[]>

  async findDPSUpgrades(
    currentWeapon: Item,
    budget: number
  ): Promise<WeaponRecommendation[]>
}
```

#### 4. `src/handlers/tradeHandlers.ts` - MCP Tool Handlers
```typescript
export async function handleSearchItems(context, args)
export async function handleFindUpgrades(context, args)
export async function handleFindResistGear(context, args)
export async function handleCompareTradeItems(context, args)
export async function handleGetItemPrice(context, args)
```

### New MCP Tools

#### 1. `search_trade_items`
Search the trade site for specific items with filters.

**Parameters**:
- `league` (required): e.g., "Standard", "Settlers"
- `item_name` (optional): Specific item name
- `item_type` (optional): Base type (e.g., "Body Armour")
- `min_price`, `max_price` (optional): Price range in chaos
- `stats` (optional): Array of stat requirements
- `online_only` (optional): Only online sellers

**Returns**: List of matching items with prices and seller info

#### 2. `find_item_upgrades`
AI-powered upgrade finder based on current build.

**Parameters**:
- `build_name` (required): Build to analyze
- `slot` (required): Which slot to upgrade
- `budget` (required): Max price in chaos
- `priorities` (optional): "damage", "defense", "resistance"

**Returns**: Ranked recommendations with cost/benefit analysis

#### 3. `find_resistance_gear`
Find items to cap resistances.

**Parameters**:
- `build_name` (required)
- `needed_fire_res`, `needed_cold_res`, `needed_lightning_res`
- `budget_per_item` (required)
- `slots` (optional): Limit search to specific slots

**Returns**: Items that provide needed resistances within budget

#### 4. `get_item_price`
Get current market price for an item.

**Parameters**:
- `item_text` (required): Item text from clipboard
- `league` (optional): Defaults to current league

**Returns**: Price range, average, and market analysis

#### 5. `compare_trade_items`
Compare multiple trade items side-by-side.

**Parameters**:
- `item_ids` (required): Array of trade listing IDs
- `build_name` (optional): Build for stat comparison

**Returns**: Detailed comparison table

## Technical Challenges & Solutions

### Challenge 1: Rate Limiting
**Problem**: API has strict rate limits (~4 req/s)
**Solution**:
- Implement token bucket rate limiter
- Queue requests with exponential backoff
- Cache results aggressively (5-15 minutes)
- Batch item fetches (up to 10 items per request)

### Challenge 2: Complex Query Construction
**Problem**: Trade queries are complex nested objects
**Solution**:
- Create builder pattern for query construction
- Pre-defined templates for common searches
- Map PoB stats to trade API stat IDs
- Validate queries before sending

### Challenge 3: Large Response Sizes
**Problem**: Trade results can be very large
**Solution**:
- Limit initial search to 20 results
- Truncate descriptions in summaries
- Provide "show more" functionality
- Stream results if needed

### Challenge 4: Stat Mapping
**Problem**: PoB stat names ≠ Trade API stat IDs
**Solution**:
- Build comprehensive mapping table
- Use fuzzy matching for stat names
- Cache stat definitions from `/data/stats`
- Handle implicit vs explicit stats

### Challenge 5: Price Volatility
**Problem**: Prices change rapidly, especially early league
**Solution**:
- Short cache TTL (5 minutes)
- Show price ranges instead of fixed prices
- Include timestamp on all price data
- Warn users about outdated data

### Challenge 6: League Detection
**Problem**: Need to know current active league
**Solution**:
- Fetch leagues from `/data/leagues`
- Cache league list (1 hour TTL)
- Allow manual league override
- Default to Standard if uncertain

## Implementation Phases

### Phase 7.1: Core Infrastructure (Week 1)
- [ ] Create `tradeClient.ts` with basic search
- [ ] Implement rate limiter
- [ ] Add response caching layer
- [ ] Create basic query builder
- [ ] Unit tests for client

### Phase 7.2: Search Tools (Week 2)
- [ ] Implement `search_trade_items` tool
- [ ] Add stat mapping system
- [ ] Implement `get_item_price` tool
- [ ] Create item result formatter
- [ ] Integration tests

### Phase 7.3: Recommendation Engine (Week 3)
- [ ] Build `itemRecommendationEngine.ts`
- [ ] Implement `find_item_upgrades` tool
- [ ] Implement `find_resistance_gear` tool
- [ ] Add cost/benefit scoring
- [ ] Connect to existing `analyze_items`

### Phase 7.4: Advanced Features (Week 4)
- [ ] Implement `compare_trade_items` tool
- [ ] Add bulk item search
- [ ] Price history tracking
- [ ] Market trend analysis
- [ ] Polish and optimization

## Data Structures

### TradeQuery
```typescript
interface TradeQuery {
  query: {
    status?: { option: 'online' | 'any' };
    name?: string;
    type?: string;
    stats?: Array<{
      type: 'and' | 'or' | 'not';
      filters: Array<{
        id: string;
        value?: { min?: number; max?: number };
      }>;
    }>;
    filters?: {
      trade_filters?: {
        price?: { min?: number; max?: number };
      };
      type_filters?: {
        rarity?: { option: string };
      };
    };
  };
  sort?: { price?: 'asc' | 'desc' };
}
```

### ItemListing
```typescript
interface ItemListing {
  id: string;
  item: {
    name: string;
    typeLine: string;
    baseType: string;
    rarity: string;
    ilvl: number;
    properties: Property[];
    requirements: Requirement[];
    sockets: Socket[];
    explicitMods: string[];
    implicitMods: string[];
  };
  listing: {
    price: {
      amount: number;
      currency: string;
    };
    account: {
      name: string;
      online: boolean;
    };
    whisper: string;
  };
}
```

### ItemRecommendation
```typescript
interface ItemRecommendation {
  listing: ItemListing;
  score: number;
  reasons: string[];
  statComparison: {
    current: Stats;
    upgraded: Stats;
    delta: Stats;
  };
  costBenefit: {
    price: number;
    dpsGain?: number;
    lifeGain?: number;
    resistGain?: number;
    pointsPerChaos: number;
  };
}
```

## Dependencies to Add

```json
{
  "dependencies": {
    "@types/node-fetch": "^2.6.11",
    "node-fetch": "^3.3.2",
    "bottleneck": "^2.19.5"  // Rate limiting library
  }
}
```

## Configuration

### Environment Variables
```bash
# Optional: OAuth credentials for private data
POE_OAUTH_CLIENT_ID=your_client_id
POE_OAUTH_CLIENT_SECRET=your_client_secret

# Optional: Custom rate limits
POE_RATE_LIMIT_PER_SECOND=4

# Optional: Cache TTL in seconds
POE_CACHE_TTL=300
```

## Testing Strategy

### Unit Tests
- Rate limiter behavior
- Query builder correctness
- Stat mapping accuracy
- Response parsing

### Integration Tests
- Real API calls (with mocks)
- End-to-end search flows
- Error handling
- Cache behavior

### Manual Testing Checklist
- [ ] Search for unique items
- [ ] Search with price filters
- [ ] Search with stat requirements
- [ ] Handle offline sellers
- [ ] Handle items with no price
- [ ] Test different leagues
- [ ] Test rate limit handling
- [ ] Verify resistance gear finder
- [ ] Test upgrade recommendations

## Cost/Benefit Analysis

### Benefits
✅ Real-time market data for upgrade suggestions
✅ Budget-aware build planning
✅ Automatic resistance cap solving
✅ Price checking for crafted items
✅ Complete build shopping lists
✅ Market trend insights

### Costs
⚠️ ~1-2 weeks development time
⚠️ Ongoing rate limit monitoring
⚠️ Additional API dependencies
⚠️ Cache management complexity
⚠️ Price data can be volatile
⚠️ League-specific maintenance

### Risks
🔴 API could change without notice
🔴 Rate limits could be tightened
🔴 OAuth may be required in future
🔴 Performance impact from API calls
🔴 Data staleness issues

## Alternatives Considered

### 1. Use poe.ninja API instead
**Pros**: Simpler, aggregated data, no rate limits
**Cons**: Less detailed, delayed data, only currency/uniques

### 2. Scrape poe.trade
**Pros**: More established
**Cons**: Against ToS, unreliable, no official support

### 3. Partner with third-party service
**Pros**: Outsource complexity
**Cons**: Dependency on external service, potential cost

## Recommendation

**Implement in Phase 7** with the following priorities:

1. **High Priority**:
   - Basic search functionality
   - Resistance gear finder
   - Simple upgrade recommendations

2. **Medium Priority**:
   - Advanced stat filtering
   - Cost/benefit analysis
   - Price checking

3. **Low Priority**:
   - Market trends
   - Bulk searching
   - Historical data

**Estimated Timeline**: 3-4 weeks for full implementation
**Complexity**: Medium-High
**Value**: High (most requested feature)

## Next Steps

1. Create proof-of-concept trade client
2. Test rate limiting with real API
3. Build stat mapping table
4. Implement basic search tool
5. Get user feedback
6. Iterate based on usage

---

**Status**: Planning
**Owner**: TBD
**Target Release**: Phase 7
**Dependencies**: None (public API)
