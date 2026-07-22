# Crafting Advisor Design

## Overview

A `suggest_crafting` MCP tool that helps users craft items by combining PoB build context, live mod weight data from poedb, and Claude's crafting strategy knowledge to produce method recommendations and step-by-step instructions.

## Tool: `suggest_crafting`

### Inputs

| Parameter | Type | Required | Description |
|---|---|---|---|
| `slot` | string | yes | Gear slot: helmet, chest, gloves, boots, weapon, offhand, ring, amulet, belt |
| `base` | string | no | Specific base type (e.g. "Hubris Circlet"). Falls back to equipped item in slot if build loaded |
| `desired_mods` | string[] | no | Desired mod descriptions (e.g. ["life", "cold res"]). Auto-detected from build gaps if build loaded |
| `budget` | "low" \| "medium" \| "high" | no | Crafting budget tier. Default: any |
| `ilvl` | number | no | Item level — determines reachable mod tiers |

### Data Sources

- **poedb WebFetch** — mod weights, fossil tags, essence mod guarantees per base type
- **PoB Lua bridge** — current build stats to auto-detect what mods are needed for the slot
- **poe.ninja** (already integrated) — currency prices for cost estimation

### Output (structured, for Claude to synthesize)

- Available mods on the base with weights and tier ranges
- Fossil combinations that bias toward desired mods
- Essence options that guarantee specific mods
- Bench craft options for desired mods
- Ranked crafting methods by: probability of success, cost efficiency, accessibility

### Claude synthesis layer

Claude receives the structured data and produces:
- Recommended crafting method with reasoning
- Step-by-step instructions
- Estimated cost range in chaos/divines
- Fallback strategy if the item bricks

## Crafting Methods (Always-Available Scope)

- Chaos/alt spam
- Alt/aug/regal
- Essence (guaranteed mod anchor)
- Fossil/resonator (biased mod pools)
- Bench crafting (deterministic suffix/prefix)
- Scour + annul
- Exalt slam
- Meta-crafting (cannot roll X, prefixes/suffixes cannot be changed)

## Architecture

```
User request
    │
    ▼
suggest_crafting tool
    ├── PoB Lua bridge → current build stats (if build loaded)
    ├── poedb WebFetch → mod weights, fossil tags, essence mods for base
    └── poe.ninja → currency prices
    │
    ▼
Structured mod/method data
    │
    ▼
Claude synthesizes → method recommendation + step-by-step guide
```

## Build Integration

If a build is loaded, the tool reads equipped item stats per slot and identifies gaps (e.g. low life, uncapped resists) to auto-populate `desired_mods`. This makes the tool feel native to the PoB workflow — "help me craft a better helmet for this build" is enough input.

## Out of Scope (v1)

- League-specific mechanics (Harvest, Eldritch orbs, Recombinators, Crucible)
- Influenced item crafting (Elder/Shaper/Conqueror mods)
- Probability simulation (CraftOfExile-style hit-rate charts)
- Item acquisition recommendations (that's the existing trade tools)
