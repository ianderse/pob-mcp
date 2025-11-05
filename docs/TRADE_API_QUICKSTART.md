# Trade API Quick Start Guide

## Overview

The Trade API integration enables Claude to search the Path of Exile trade site for items, check prices, and make upgrade recommendations based on your build requirements.

## Setup

### 1. Enable Trade API

Add the following environment variable to your Claude Desktop configuration:

```json
{
  "mcpServers": {
    "pob": {
      "command": "node",
      "args": ["/path/to/pob-mcp-server/build/index.js"],
      "env": {
        "POB_DIRECTORY": "/path/to/Path of Building/Builds",
        "POE_TRADE_ENABLED": "true"
      }
    }
  }
}
```

### 2. Optional Configuration

Fine-tune the Trade API behavior with these optional environment variables:

```json
{
  "env": {
    "POE_TRADE_ENABLED": "true",
    "POE_RATE_LIMIT_PER_SECOND": "4",
    "POE_CACHE_TTL": "300"
  }
}
```

**Environment Variables:**
- `POE_TRADE_ENABLED`: Set to "true" to enable Trade API (required)
- `POE_RATE_LIMIT_PER_SECOND`: Requests per second limit (default: 4)
- `POE_CACHE_TTL`: Cache time-to-live in seconds (default: 300)

### 3. Restart Claude Desktop

After updating the configuration, restart Claude Desktop for changes to take effect.

## Available Tools

### 1. `get_leagues`

Get list of available leagues for trade searches.

**Example:**
```
What leagues are available for trading?
```

**Response:**
- List of active leagues (Standard, Hardcore, current challenge league, etc.)
- Realm information (PC, Console)

---

### 2. `search_trade_items`

Search for items matching specific criteria.

**Parameters:**
- `league` (required): League name (e.g., "Standard", "Settlers")
- `item_name`: Specific item name (e.g., "Headhunter")
- `item_type`: Base type (e.g., "Corsair Sword")
- `min_price`, `max_price`: Price range in specified currency
- `price_currency`: Currency type (default: "chaos")
- `online_only`: Only show online sellers (default: true)
- `rarity`: Item rarity filter ("normal", "magic", "rare", "unique", "any")
- `min_links`: Minimum linked sockets (e.g., 6 for 6-link)
- `stats`: Array of stat requirements
- `sort`: Sort order ("price_asc" or "price_desc")
- `limit`: Maximum results (default: 10, max: 10 per request)

**Examples:**

Find cheap 6-links in Standard:
```
Search for 6-link body armour in Standard league under 20 chaos
```

Find unique item:
```
Search for Headhunter in Standard league
```

Find rare items with specific stats:
```
Search for rare helmets in Standard with at least 80 life and 40% fire resistance
```

**Response:**
- List of matching items with prices
- Item stats and mods
- Seller information
- Whisper commands for trade

---

### 3. `get_item_price`

Get current market price statistics for a specific item.

**Parameters:**
- `item_name` (required): Item to price check
- `league`: League to check (default: "Standard")
- `item_type`: Base type to narrow search
- `rarity`: Item rarity filter

**Examples:**

Check unique item price:
```
What's the current price of Headhunter in Standard?
```

Check rare base price:
```
How much do Astral Plates cost in Standard?
```

**Response:**
- Price statistics (low, median, average, high)
- Sample size
- Multiple currencies if applicable
- Total listing count

---

## Example Use Cases

### 1. Capping Resistances

```
I need to cap fire and cold resistance on my build.
Search for rings in Standard with at least +40% total fire resistance
and +40% total cold resistance under 50 chaos.
```

### 2. Finding Weapon Upgrades

```
Find rare bows in Standard with at least 300 physical DPS under 2 divine orbs.
```

### 3. Budget 6-Link Setup

```
Find the cheapest 6-link Astral Plate in Standard.
```

### 4. Price Checking Crafted Item

```
What's the price of rare Stygian Vise belts with 90+ life
and triple resistance in Standard?
```

### 5. Unique Item Shopping

```
Search for Taste of Hate flask in Standard, show me the 5 cheapest ones.
```

## Trade API Features

### Rate Limiting
- Automatically limits requests to 4 per second (configurable)
- Uses token bucket algorithm for smooth request distribution
- Respects API rate limit headers
- Automatic retry with exponential backoff

### Caching
- Results cached for 5 minutes (configurable)
- Stat definitions cached for 1 hour
- League list cached for 1 hour
- Reduces redundant API calls

### Error Handling
- Graceful handling of rate limits
- Clear error messages
- Validation of required parameters
- Fallback for missing data

## Troubleshooting

### "Trade API is not enabled"
**Solution:** Set `POE_TRADE_ENABLED=true` in your Claude Desktop config and restart.

### "Rate limited. Retry after Xms"
**Solution:** The API is rate limiting. Wait a few seconds and try again. Consider reducing `POE_RATE_LIMIT_PER_SECOND` if this happens frequently.

### "No items found"
**Possible causes:**
1. Typo in item name - try searching with just partial name
2. League doesn't exist - use `get_leagues` to see available leagues
3. Filters too restrictive - relax price or stat requirements
4. Item doesn't exist in that league

### "Failed to fetch items"
**Possible causes:**
1. Network connectivity issue
2. Trade site is down
3. Invalid query parameters

## Advanced Usage

### Using Stat IDs

For precise stat filtering, you can use Trade API stat IDs:

Common stat IDs:
- `pseudo.pseudo_total_life`: Total maximum life
- `pseudo.pseudo_total_energy_shield`: Total energy shield
- `pseudo.pseudo_total_fire_resistance`: Total fire resistance
- `pseudo.pseudo_total_cold_resistance`: Total cold resistance
- `pseudo.pseudo_total_lightning_resistance`: Total lightning resistance
- `pseudo.pseudo_total_chaos_resistance`: Total chaos resistance

**Example:**
```json
{
  "stats": [
    { "id": "pseudo.pseudo_total_life", "min": 80 },
    { "id": "pseudo.pseudo_total_fire_resistance", "min": 40 }
  ]
}
```

### Currency Conversion

The Trade API returns prices in the currency sellers specify. Common currencies:
- `chaos`: Chaos Orb (standard currency)
- `divine`: Divine Orb (high-value currency)
- `exalted`: Exalted Orb (legacy high-value)
- `mirror`: Mirror of Kalandra (extremely rare)

## Limitations

1. **No Authentication**: Currently only supports public searches (no account-specific features)
2. **Rate Limits**: Limited to ~4 requests/second (conservative)
3. **Search Results**: Maximum 10 items per request
4. **Cache Staleness**: Prices may be up to 5 minutes old
5. **Stat Mapping**: Some complex mods may not have direct stat IDs

## Future Enhancements

Planned features:
- **Item upgrade recommendations**: Automated suggestions based on build analysis
- **Resistance gap solver**: Find cheapest gear combination to cap resists
- **Budget build planner**: Create shopping lists within budget constraints
- **Price history tracking**: Trend analysis for items
- **Bulk search**: Search multiple item types at once

## Support

If you encounter issues:
1. Check Trade API is enabled in config
2. Verify Claude Desktop was restarted after config changes
3. Check console logs for error details
4. Ensure network connectivity to pathofexile.com
5. Report issues at https://github.com/ianderse/pob-mcp-server/issues

## References

- [Path of Exile Trade API Documentation](https://www.pathofexile.com/developer/docs)
- [pob-mcp-server README](../README.md)
- [Trade API Implementation Plan](../TRADE_API_IMPLEMENTATION_PLAN.md)
