# Path of Building MCP Server

An MCP (Model Context Protocol) server that enables Claude to analyze, modify, and optimize Path of Building builds using PoB's actual calculation engine.

Uses an **unmodified [PathOfBuildingCommunity](https://github.com/PathOfBuildingCommunity/PathOfBuilding) source tree** with a compatible LuaJIT interpreter. The server ships its own stdio adapter that loads PoB's `HeadlessWrapper.lua` as a library and drives the calculation engine. It can also locate the engine and Lua modules from a supported macOS PoB installation. Some PoB revisions require a patched interpreter; see [Lua bridge setup](#setting-up-the-lua-bridge).

> **PoE 3.29 compatibility:** This release targets Path of Building data and builds for the 3.29 league. Use a current PoB checkout for the matching tree, skills, and item data. Trade calls should always use `get_leagues` instead of hard-coding a challenge-league name.

---

**☕ If you find this project helpful, consider [buying me a coffee](https://buymeacoffee.com/ianderse)!**

---

## Features

### Build Analysis (Always Available)
- **List & Analyze Builds**: Browse builds and extract stats, skills, items, passive trees, and notes from XML
- **Compare Builds**: Side-by-side build comparison
- **File Watching**: Real-time detection of builds saved from PoB with automatic cache invalidation
- **Tree Analysis**: Compare passive trees, find paths to nodes, and discover nearby notables from saved builds

### High-Fidelity Calculations (Lua Bridge)
- **Live Stats**: Calculate stats using PoB's own engine; compare with the GUI using the same engine version, build, spec, item set, skill, and configuration
- **Build Loading & Creation**: Load existing builds or create new ones from scratch by class/ascendancy
- **Passive Tree Editing**: Set full tree allocation and see immediate stat recalculation
- **Tree Specs**: List, switch, create, copy, rename, and delete passive tree specs
- **Node Search**: Search the passive tree for nodes by name or stat text
- **Character Level**: Set level and watch all stats update accordingly
- **Anointment Ranking**: Simulate every anointable notable through PoB's live calculator and rank by DPS/EHP impact

### Item & Skill Management (Lua Bridge)
- **Items**: Add items from PoE clipboard text, view all equipped gear
- **Flasks**: Toggle flasks active/inactive with immediate stat feedback
- **Skills**: Full gem management — create socket groups, add/remove/level/quality gems
- **Batch Operations**: `setup_skill_with_gems` and `add_multiple_items` for efficient workflows

### Build Optimization
- **Defensive Analysis**: 3-layer framework (avoidance / mitigation / recovery) — evaluates EHP, spell suppression, armour/PDR, evasion, block, life regen, and leech
- **Node Suggestions**: Archetype-aware suggestions by goal (damage, life, ES, defense, resist)
- **Passive Simulations**: Rank passive upgrades and mastery choices by live stat impact
- **Tree Optimization**: Recommend nodes within reach of the current allocation
- **Item Upgrade Analysis**: Slot-by-slot upgrade recommendations based on live stats
- **Shopping Specs**: Describe bases and mods to look for based on the loaded build's gaps, without requiring the Trade API
- **Skill Link Optimization**: Detect missing "more" multipliers, penetration gaps, anti-synergies
- **Budget Build Creation**: Generate starter build plans with skill links, gearing strategy, and passive priorities

### Build Validation
- **Comprehensive Checks**: Resistances, life pool, defensive layers, mana, flask immunities, accuracy, damage scaling
- **Severity Classification**: Critical / Warning / Info with actionable suggestions
- **Dual Source**: Uses Lua bridge stats when available, falls back to XML parsing
- **Overall Score**: 0–10 build health score for named saved builds

### Configuration & Scenario Testing (Lua Bridge)
- **Config State**: View bandit, pantheon, enemy settings
- **Toggle Conditions**: Charges, buffs (Onslaught, Fortify, Leeching), boss mode
- **Enemy Tuning**: Set enemy level, resistances, armour, evasion for boss DPS testing

### Skill Gem Analysis
- **Archetype Detection**: Classify builds (Elemental Bow Attack, Summoner, Critical Spell, etc.)
- **Support Gem Recommendations**: Ranked suggestions with DPS estimates and cost context
- **Quality Validation**: Identify missing quality, awakened upgrade paths, corruption targets
- **Optimal Links**: Auto-generate best support gem combinations for 4/5/6-link setups
- **Budget Tiers**: League-start, mid-league, and endgame recommendations

### Build Export & Persistence
- **Export**: Copy builds to XML files with optional notes
- **Save Tree**: Write optimized passive tree back to an existing build file
- **Snapshots**: Versioned build history with tags, cached stat metadata, and a restore tool; restoring the active source also reloads the engine

### Affix Data (No Lua Bridge Required)
- **Affix Classification**: Match explicit mod lines to prefixes, suffixes, and hybrid affixes
- **Bench Crafts**: Find crafts allowed for an item class and item level
- **Affix Tiers**: Look up roll ranges, required item levels, and base tags from PoB data

These tools need the corresponding data files from a PoB installation or checkout.

### Currency & Market Data (poe.ninja)
- **Exchange Rates**: Real-time currency prices in Chaos Orb equivalent
- **Arbitrage Detection**: Find profitable currency trading loops
- **Trade Profit Calculator**: Evaluate custom trading chains

### Trade API (Optional, `POE_TRADE_ENABLED=true`)
- **Item Search**: Search trade with stat filters, price range, link count
- **Weighted BIS Search**: Build-specific best-in-slot listings using PoB's native TradeQueryGenerator stat weights (requires `POE_SESSION_ID`)
- **Price Checking**: Min/max/median/average from recent listings
- **Resistance Gear**: Find affordable gear to cap resistances
- **Cluster Jewels**: Search trade listings by size, passives, and notables
- **Shopping List**: Generate a prioritized shopping list from build analysis

---

## Installation

Use Node.js 20 or later. CI runs on Node.js 20.

```bash
git clone https://github.com/ianderse/pob-mcp.git
cd pob-mcp
npm install
npm run build
```

## Configuration

### Claude Desktop Configuration

**Mac**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

#### XML-Only (No Lua Bridge)
```json
{
  "mcpServers": {
    "pob": {
      "command": "node",
      "args": ["/absolute/path/to/pob-mcp-server/build/index.js"],
      "env": {
        "POB_DIRECTORY": "/path/to/your/Path of Building/Builds"
      }
    }
  }
}
```

#### With the Lua Bridge

On macOS, supported PoB app locations and common builds directories are detected.
The interpreter is a separate executable: `POB_CMD` defaults to `luajit` on `PATH`.
Set it to an absolute path when needed, and ensure it supports your PoB revision.

```json
{
  "mcpServers": {
    "pob": {
      "command": "node",
      "args": ["/absolute/path/to/pob-mcp-server/build/index.js"],
      "env": {
        "POB_LUA_ENABLED": "true",
        "POB_CMD": "/absolute/path/to/pob-compatible/luajit"
      }
    }
  }
}
```

For a checkout or a nonstandard engine location, also set `POB_PATH` in that
`env` object. Override `POB_DIRECTORY` if your builds use another location:

```json
{
  "POB_PATH": "/path/to/PathOfBuilding/src",
  "POB_DIRECTORY": "/path/to/your/Path of Building/Builds"
}
```

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `POB_DIRECTORY` | detected Builds dir | Path to your PoB builds directory |
| `POB_LUA_ENABLED` | `false` | Set `"true"` to enable Lua bridge |
| `POB_PATH` | installed PoB app, else `~/Projects/PathOfBuilding/src` | `src/` of a stock PathOfBuilding checkout. Usually unnecessary: an installed PoB is detected automatically (`POB_FORK_PATH` is a legacy alias) |
| `POB_CMD` | `luajit` | Compatible LuaJIT executable; resolved through `PATH` unless an absolute path is supplied. Not detected from the app. |
| `POB_TIMEOUT_MS` | `30000` | Lua request timeout (ms) |
| `POB_DEBUG` | `false` | Set `"true"` for verbose Lua bridge logging |
| `POB_ARGS` | (none) | Space-separated arguments passed to the Lua process (overrides the default adapter arguments) |
| `POE_TRADE_ENABLED` | `false` | Enable Trade API tools |
| `POE_SESSION_ID` | (none) | Your POESESSID cookie value; required for the `find_weighted_trade_items` tool |
| `POE_CACHE_TTL` | `300` | Trade API response cache TTL in seconds |
| `POE_RATE_LIMIT_PER_SECOND` | `4` | Trade API requests per second |

### Saving and restoring builds

`lua_save_build` writes atomically. Saving back to the file loaded into the bridge
is allowed. To replace a different existing file, pass `overwrite: true` explicitly;
otherwise choose a new name. Saved-file stats are invalidated immediately, and names
with or without `.xml` share the same cache entry.

`save_tree` preserves unrelated XML elements and writes mastery selections in PoB's
native format. Snapshot restore reloads the engine when that exact source file is
active. If the reload fails, the response states that the file was restored but
live stats are not yet synchronized. Another active build is left untouched.

Affix tools support both current `Data/ModExplicit.lua` and legacy `Data/ModItem.lua`
installations. Unmatched or ambiguous explicit lines leave remaining slots unknown.

### Setting Up the Lua Bridge

#### 1. Locate the PoB engine

On macOS, the server recognizes `Path of Building.app` and `PathOfBuilding.app`
in `/Applications` or `~/Applications`. It prefers the app's writable engine
under `~/Library/Application Support/PathOfBuildingMac/src`, falling back to the
bundle's `Contents/Resources/src`. It also uses the app's Lua modules.

For a checkout, clone PoB and set `POB_PATH` to its `src/` directory:

```bash
git clone https://github.com/PathOfBuildingCommunity/PathOfBuilding.git
export POB_PATH="/absolute/path/to/PathOfBuilding/src"
```

With no detected app and no explicit path, the fallback is
`~/Projects/PathOfBuilding/src`. Set `POB_DIRECTORY` separately to your builds folder.

#### 2. Choose a compatible LuaJIT interpreter

The server launches a command-line LuaJIT executable. It does not discover an
interpreter inside the PoB app or bundle one with this repository.

For PoB revisions that use standard Lua syntax, system packages are sufficient:

```bash
# macOS
brew install luajit

# Ubuntu/Debian
sudo apt-get install luajit
```

Newer PoB sources can use compound assignment such as `count += 1`, which standard
LuaJIT cannot parse. The revision recorded by this repo's item-format fixtures
(`ed354c2`) uses that syntax in
[`Modules/Main.lua`](https://github.com/PathOfBuildingCommunity/PathOfBuilding/blob/ed354c2/src/Modules/Main.lua).
For those sources, supply a patched, PoB-compatible command-line interpreter and
set `POB_CMD` to its path. This repository does not provide an installer for it.
On Windows, a CLI executable is still required; PoB's `lua51.dll` alone is not a
command-line interpreter.

Check the chosen interpreter against your engine before configuring the server:

```bash
export POB_CMD="/absolute/path/to/pob-compatible/luajit"
"$POB_CMD" -v
"$POB_CMD" -bl "$POB_PATH/Modules/Main.lua" > /dev/null
```

The second command only compiles the file. An error such as `'=' expected near '+'`
means the interpreter cannot parse that PoB revision. Passing this check establishes
syntax support; the smoke checks below exercise initialization and calculations.
For a detected macOS app, use its resolved `src/` path as `POB_PATH` in this check.

#### 3. Supply Lua modules for a checkout

A recognized macOS app supplies its own Lua modules. A standalone checkout may need
native modules built for the chosen interpreter and platform. PoB's bundled Windows
DLLs cannot serve as macOS or Linux modules.

For example, install `lua-utf8` locally with LuaRocks configured for your LuaJIT:

```bash
luarocks --lua-version=5.1 --lua-dir=/path/to/your/luajit-prefix --local install luautf8
```

The bridge searches the checkout's `runtime/` and `~/.luarocks/lib/lua/5.1`.
Follow any missing-module diagnostic for additional dependencies. Windows checkouts
can use the bundled DLLs with a compatible interpreter and architecture.

The adapter uses the upstream `HeadlessWrapper.lua` without changing PoB source.
It runs over stdio in a separate headless process. Use `lua_get_capabilities` for
the loaded bridge's action list.

#### 4. Verify and configure your MCP client

After building this project, run:

```bash
npm run test:smoke
```

The smoke tests resolve the engine the same way the server does. They exercise the
adapter and MCP stdio transport: discovery, capabilities, build loading, snapshots,
stats, items, skills, reversible tree mutation, configuration, and anointment ranking.
Some smoke helpers invoke `luajit` by name, including the adapter check in this
suite. Make the compatible interpreter available as `luajit` on `PATH` as well as
setting `POB_CMD` for the server.

The additional suites are:

| Command | Checks | Requirements |
|---|---|---|
| `npm run test:smoke:offline` | Bridge lifecycle race, persistence, and state truthfulness, including a passive-removal simulation that must change Life | Compatible PoB engine and interpreter; no GUI or live Trade API required |
| `npm run test:smoke:full` | Blank-build gem editing, file persistence, level changes, tree search, validation, config/snapshot restore, defense and boss readiness | Compatible PoB engine and interpreter |
| `npm run test:smoke:persistence` | Overwrite protection, cache refresh, snapshot reload, XML notes/masteries, and rejected incomplete imports | Compatible PoB engine and interpreter |
| `npm run test:smoke:trade` | Live league, stat, item-search, price, resistance-gear, currency-rate, and trading-profit requests through MCP | Network access |
| `npm run test:smoke:crafting` | Live currency rates and base-mod data through MCP | Compatible PoB engine and interpreter, plus network access |

For the authenticated weighted trade smoke, set your `POE_SESSION_ID` in the shell
and run:

```bash
npm run test:smoke:weighted
```

This also requires a compatible PoB engine, interpreter, and network access.

Finally, update the Claude Desktop configuration above and restart Claude Desktop.

---

## Available Tools

With `POB_LUA_ENABLED=true`, `POE_TRADE_ENABLED=true`, and `POE_SESSION_ID` set,
the server advertises **104 tools**. It advertises **39** with Lua and Trade disabled,
and **95** with Lua enabled and Trade disabled. Tool discovery is not a guarantee
that the required engine, data files, credentials, or network service are usable.

### XML-Based Tools (Always Available)

| Tool | Description |
|---|---|
| `list_builds` | List all `.xml` build files |
| `analyze_build` | Full build summary: class, stats, skills, items, tree |
| `compare_builds` | Side-by-side build comparison |
| `get_build_stats` | Extract raw stats from build XML |
| `get_build_notes` | Get build notes from XML |
| `set_build_notes` | Set build notes in XML |
| `start_watching` | Monitor builds directory for changes |
| `stop_watching` | Stop file monitoring |
| `watch_status` | Show watching status and cache info |
| `get_recent_changes` | List recently modified builds |
| `refresh_tree_data` | Clear passive tree data cache |

### Tree Analysis Tools (Always Available)

| Tool | Description |
|---|---|
| `compare_trees` | Show node differences between two builds |
| `get_nearby_nodes` | Find notables/keystones reachable from current allocation |
| `find_path_to_node` | Shortest path to a target node ID |

### Affix Data (Always Advertised)

These tools read PoB data files without starting the Lua bridge. They require a
PoB installation or checkout containing the relevant mod tables.

| Tool | Description |
|---|---|
| `classify_item_affixes` | Match explicit lines to prefixes, suffixes, and hybrid affixes; report uncertainty for unmatched or ambiguous lines |
| `list_craftable_mods` | List bench crafts for an item class and level; does not check an equipped item's existing conflicts |
| `find_affix_tiers` | Look up affix ranges, minimum item levels, and base tags |

### Lua Bridge — Core (Require `POB_LUA_ENABLED=true`)

| Tool | Description |
|---|---|
| `lua_start` | Start a separate headless PoB process over stdio |
| `lua_stop` | Stop the engine and free resources |
| `lua_get_capabilities` | Report the bridge adapter and supported actions |
| `lua_get_build_snapshot` | Compact current-state view: core stats, tree count, equipped items, and main gems |
| `lua_new_build` | Create a blank build for a given class/ascendancy |
| `lua_load_build` | Load a build file into the engine |
| `lua_import_code` | Decode a PoB import/export code (e.g. from pobb.in or the desktop app's Generate button) and load it into the engine |
| `lua_save_build` | Save the current in-memory build to a `.xml` file |
| `lua_reload_build` | Reload the current build from disk |
| `lua_get_build_info` | Get current build metadata (class, level, etc.) |
| `set_character_level` | Set level and recalculate all stats |
| `lua_get_stats` | Get calculated stats (`category`: `offense`/`defense`/`all`) |
| `lua_get_ailments` | Non-damaging ailment magnitude, and whether the DPS calc is crediting it |
| `lua_get_tree` | View passive tree: class, ascendancy, all allocated node IDs |
| `lua_set_tree` | Replace passive tree allocation (preserves class if omitted) |
| `update_tree_delta` | Add/remove individual nodes without replacing entire tree |
| `search_tree_nodes` | Search passive tree by name or stat text |
| `list_specs` | List all tree specs in the current build |
| `select_spec` | Switch active tree spec |
| `create_spec` | Create a new tree spec, optionally copying an existing one |
| `rename_spec` | Rename a tree spec |
| `delete_spec` | Delete a tree spec |
| `list_item_sets` | List all item sets in the current build |
| `select_item_set` | Switch active item set |
| `plan_leveling` | Generate a leveling plan for a build |

**`lua_set_tree` class IDs**: 0=Scion, 1=Marauder, 2=Ranger, 3=Witch, 4=Duelist, 5=Templar, 6=Shadow

**Witch ascendancy IDs**: 1=Occultist, 2=Elementalist, 3=Necromancer

Use `lua_save_build` before reading live edits through saved-file tools such as
`analyze_build` or `get_build_stats`. `validate_build` without `build_name` can
check the current in-memory build directly.

### Lua Bridge — Item & Skill Management

| Tool | Description |
|---|---|
| `add_item` | Add item from PoE clipboard text to a slot |
| `add_multiple_items` | Add multiple items in one operation |
| `get_equipped_items` | List all equipped gear with name, base, and rarity |
| `toggle_flask` | Activate/deactivate flask 1–5; returns updated stats |
| `get_skill_setup` | Show all socket groups with gems, levels, and quality |
| `set_main_skill` | Set which group/gem is used for DPS calculations |
| `create_socket_group` | Create a new socket group (label, slot, enabled) |
| `add_gem` | Add a gem to a socket group (name, level, quality) |
| `set_gem_level` | Set gem level by group + gem index |
| `set_gem_quality` | Set gem quality (Default/Anomalous/Divergent/Phantasmal) |
| `remove_gem` | Remove a gem by group + gem index |
| `remove_skill` | Remove an entire socket group |
| `toggle_socket_group` | Enable/disable an entire socket group |
| `toggle_gem` | Enable/disable a single gem within a group |
| `setup_skill_with_gems` | Create a socket group with active gem + supports in one call |
| `find_item_upgrades` | Generate a shopping spec from the loaded build's gaps; no Trade API required |

**Common equipment slot names**: `Weapon 1`, `Weapon 2`, `Helmet`, `Body Armour`,
`Gloves`, `Boots`, `Amulet`, `Ring 1`, `Ring 2`, `Belt`, `Flask 1`–`Flask 5`.
PoB versions and builds may expose additional slots such as `Ring 3` and `Graft 1/2`.
`get_equipped_items` reports equipped slot names; it omits empty slots. Skill groups
use their own slot list in the tool schema.

### Build Optimization (Always Advertised)

| Tool | Description | Runtime requirements |
|---|---|---|
| `analyze_defenses` | 3-layer defensive audit: avoidance / mitigation / recovery | Lua bridge |
| `suggest_optimal_nodes` | Archetype-aware node suggestions by goal | Lua bridge |
| `optimize_tree` | Recommend nearby nodes to allocate for a goal; does not apply changes | Lua bridge |
| `analyze_items` | Slot-by-slot item analysis with upgrade priorities | Lua bridge, or saved XML fallback |
| `optimize_skill_links` | Audit supports: "more" multipliers, penetration, anti-synergies | Lua bridge, or saved XML fallback |
| `create_budget_build` | Generate a starter build plan from a named saved build and budget tier | Saved XML |

### Lua Bridge — Diagnostics and Advice

These tools are advertised when `POB_LUA_ENABLED=true`. They do not require the
Trade API. `analyze_cluster_jewels` reads saved XML; the other diagnostic tools use
the loaded engine build. `suggest_crafting` can use an explicit base without a
loaded build and fetches crafting/currency context from network services.

| Tool | Description |
|---|---|
| `get_build_issues` | Get prioritized list of build problems and suggestions |
| `get_passive_upgrades` | Rank unallocated notables by simulated DPS/EHP impact |
| `suggest_masteries` | Rank effects available on allocated mastery nodes by live stat impact |
| `check_boss_readiness` | Evaluate readiness for specific boss encounters |
| `suggest_watchers_eye` | Suggest Watcher's Eye mods for the build's auras |
| `find_best_anointment` | Rank anointable notables by live DPS/EHP impact (Amulet or anointable Belt) |
| `analyze_cluster_jewels` | Analyze a cluster jewel setup from a build file |
| `analyze_build_cluster_jewels` | Analyze cluster jewels equipped in the loaded build |
| `suggest_crafting` | Suggest crafting methods using a slot, base, desired mods, and available build context |

**`suggest_optimal_nodes` goals**: `damage`, `defense`, `life`, `es`, `resist`, `speed`

**Defensive layers**:
- **Avoidance** — evasion, spell suppression, dodge, block
- **Mitigation** — armour/PDR, endurance charges
- **Recovery** — life regen (≥1%/s), leech, ES recharge

A build with all 3 layers is considered exceptional.

### Configuration & Enemy Settings

| Tool | Description |
|---|---|
| `get_config` | View bandit, pantheon, and enemy settings |
| `set_config` | Toggle charges, buffs, conditions (e.g. `usePowerCharges`, `enemyIsBoss`) |
| `set_enemy_stats` | Set enemy level, resistances, armour, evasion for DPS scenarios |
| `save_config_preset` | Save current config as a named preset |
| `load_config_preset` | Load a saved config preset |
| `list_config_presets` | List all saved config presets |

### Build Validation

| Tool | Description |
|---|---|
| `validate_build` | Check resistances, life, defensive layers, mana, immunities, accuracy, damage scaling |

For a named saved build, returns critical issues, warnings, and recommendations
with an overall 0–10 health score. Uses matching Lua stats when available and falls
back to XML. Omitting `build_name` checks the currently loaded Lua build with a
smaller set of live-stat checks; that path does not produce the full XML validation
or its health score.

### Skill Gem Analysis

| Tool | Description |
|---|---|
| `analyze_skill_links` | Evaluate support gems and detect build archetype |
| `suggest_support_gems` | Ranked support gem recommendations with DPS estimates |
| `validate_gem_quality` | Find gems needing quality, awakened upgrades, or corruption |
| `compare_gem_setups` | Side-by-side structural comparison of gem configurations |
| `find_optimal_links` | Auto-generate best support combo for a 4/5/6-link and budget |
| `gem_upgrade_path` | Show upgrade path for a gem (awakened, quality variants) |

`gem_upgrade_path` requires a loaded Lua bridge build. The other tools read a
named saved build; their DPS estimates are heuristic rather than live simulations.

**Budget tiers**: `league_start`, `mid_league`, `endgame`

### Build Export & Persistence

| Tool | Description |
|---|---|
| `export_build` | Copy a build to a new XML file with optional notes |
| `save_tree` | Write passive tree back to an existing build file |
| `snapshot_build` | Create a versioned snapshot with description and tag |
| `list_snapshots` | List all snapshots for a build |
| `restore_snapshot` | Restore from a snapshot (auto-backs up current state) |
| `export_build_summary` | Export a human-readable build summary |

Snapshots are stored in `POB_DIRECTORY/.pob-mcp/snapshots/`.
Their stat metadata comes from cached `<PlayerStat>` entries in the saved XML.
Missing cached stats display as `N/A`. `export_build_summary` requires a loaded
Lua bridge build.

**Note**: `export_build` copies from the XML file, not from the Lua bridge. Use `lua_save_build` first if you want to export in-memory changes.

### Currency & Market Data (poe.ninja)

| Tool | Description |
|---|---|
| `get_currency_rates` | Live exchange rates for all currencies (Chaos Orb equivalent) |
| `find_arbitrage` | Detect profitable currency trading loops |
| `calculate_trading_profit` | Evaluate a specific trading chain |

Rates are fetched on demand and cached for 5 minutes. Pass the **exact** league
name returned by `get_leagues` when Trade is enabled, or use `Standard` explicitly.

### Trade API Tools (Require `POE_TRADE_ENABLED=true`)

| Tool | Description |
|---|---|
| `search_trade_items` | Search trade with stat filters, price range, link count |
| `find_weighted_trade_items` | Build-specific BIS search via PoB's TradeQueryGenerator stat weights (requires `POE_SESSION_ID` and the Lua bridge) |
| `get_item_price` | Price statistics (min/max/median/average) for an item |
| `get_leagues` | List available leagues |
| `search_stats` | Look up Trade API stat IDs |
| `find_resistance_gear` | Find affordable gear to cap specific resistances |
| `compare_trade_items` | Compare multiple trade listings side by side |
| `search_cluster_jewels` | Search for cluster jewels by notable |
| `generate_shopping_list` | Generate a prioritized shopping list from build analysis |

---

## Typical Workflows

### Analyze an existing build
```text
1. lua_start
2. lua_load_build (build_name: "MyBuild.xml")
3. validate_build (build_name: "MyBuild.xml")
4. lua_get_stats (category: "offense")
```

For a fast live issue scan instead of full validation, use `get_build_issues`.
Use `analyze_defenses` separately when you need the detailed defensive breakdown.

### Build from scratch
```text
1. lua_start
2. lua_new_build (class_name: "Witch", ascendancy: "Necromancer")
3. setup_skill_with_gems (label: "Skeletons", active_gem: "Summon Skeletons", support_gems: ["Minion Damage Support", "Melee Physical Damage Support"])
4. set_main_skill (group_index: the index returned by step 3)
5. lua_get_tree, then lua_set_tree with your complete connected node list and any mastery_effects
6. lua_get_stats (category: "offense")
7. lua_save_build (build_name: "MySummoner.xml")
```

### Optimize passive tree
```text
1. lua_load_build (build_name: "MyBuild.xml")
2. suggest_optimal_nodes (build_name: "MyBuild.xml", goal: "life", points_available: 5)
3. search_tree_nodes (query: "maximum life")
4. lua_get_tree   ← copy current node list
5. lua_set_tree   ← add new nodes to the list
6. lua_get_stats  ← verify improvement
7. lua_save_build (build_name: "MyBuild.xml") ← persist
```

Check reachability and point cost before applying a suggestion. Simulated stat
gains alone do not establish a legal allocation.

### Test DPS against Shaper
```text
1. lua_load_build (build_name: "MyBuild.xml")
2. set_enemy_stats (level: 84, fire_resist: 40, cold_resist: 40, lightning_resist: 40)
3. set_config (config_name: "enemyIsBoss", value: "Pinnacle")
4. lua_get_stats (category: "offense")
```

`enemyIsBoss` is a dropdown value, not a boolean. The bridge also maps the legacy
name `"Shaper"` to `"Pinnacle"`. Check whether configuration writes were accepted
before interpreting the stats.

### Find the best anointment and shop for upgrades
```
1. lua_load_build (build_name: "MyBuild.xml")
2. find_best_anointment (slot: "Amulet", focus: "both")
3. find_weighted_trade_items (league: "Standard", slot: "Amulet")   ← requires POE_TRADE_ENABLED + POE_SESSION_ID
```

---

## Troubleshooting

### XML Features

**No builds found**
- Verify `POB_DIRECTORY` is correct and contains `.xml` files
- Check file permissions

**Parse errors**
- Open the build in PoB GUI to verify it isn't corrupted
- Ensure PoB is up to date

### Lua Bridge

**`luajit command not found`**
Set `POB_CMD` to the absolute path of a compatible command-line LuaJIT executable.
Check the [interpreter requirements](#2-choose-a-compatible-luajit-interpreter)
before using a system package; some PoB revisions require patched syntax support.

**`'=' expected near '+'` (or another compound-assignment operator)**
The interpreter cannot parse the chosen PoB source. Increasing the timeout or
installing a Lua module will not add syntax support. Use a compatible interpreter
and verify it with the compile-only command in the setup section.

**`Failed to find valid ready banner`**
`POB_PATH` must point to the directory containing `HeadlessWrapper.lua`:
```bash
ls "$POB_PATH/HeadlessWrapper.lua"   # must exist
ls "$POB_PATH/Modules/"              # must exist
```

**`Timed out waiting for response`**
- If startup is slow, increase `POB_TIMEOUT_MS` above its default (try `60000`).
- Check the server's stderr for missing-module or syntax errors.
- Run `npm run test:smoke:truthfulness` to exercise the repo-owned adapter against
  the resolved engine using `POB_CMD`. Run commands from this project's directory.

**Stats don't match PoB GUI**
- Check bandit/pantheon/enemy settings with `get_config`
- Ensure the correct tree spec is active in the XML
- Make sure your PathOfBuilding checkout is up to date

**Bridge becomes unresponsive**
```
lua_stop → wait a moment → lua_start
```
If still unresponsive, restart Claude Desktop.

**Nodes dropped after `lua_set_tree`**
Nodes must form a valid connected path from the class starting node. Disconnected nodes are silently dropped by PoB. Ensure all intermediate nodes are included.

---

## Development

```bash
npm run build   # compile TypeScript
npm run dev     # watch mode
```

## Path of Building XML Structure

PoB builds are XML files with:
- `<Build>`: Character info and stats
- `<Tree>`: Passive skill tree node allocations
- `<Skills>`: Socket groups and gem links
- `<Items>`: Equipped items
- `<Notes>`: Build notes

## Contributing

Issues and pull requests are welcome!

## Contributors

<!-- readme: collaborators,contributors -start -->
<table>
  <tbody>
    <tr>
      <td align="center"><a href="https://github.com/ianderse"><img src="https://avatars.githubusercontent.com/u/5242189?v=4" width="100" alt="ianderse"/><br /><sub><b>Ian</b></sub></a></td>
      <td align="center"><a href="https://github.com/rchasman"><img src="https://avatars.githubusercontent.com/u/1267219?v=4" width="100" alt="rchasman"/><br /><sub><b>Roey D. Chasman</b></sub></a></td>
      <td align="center"><a href="https://github.com/notquitedrdeath"><img src="https://avatars.githubusercontent.com/u/890462?v=4" width="100" alt="notquitedrdeath"/><br /><sub><b>Tim Death</b></sub></a></td>
      <td align="center"><a href="https://github.com/J-Gierend"><img src="https://avatars.githubusercontent.com/u/39157646?v=4" width="100" alt="J-Gierend"/><br /><sub><b>J-Gierend</b></sub></a></td>
      <td align="center"><a href="https://github.com/gonzodamus"><img src="https://avatars.githubusercontent.com/u/219195895?v=4" width="100" alt="gonzodamus"/><br /><sub><b>gonzodamus</b></sub></a></td>
      <td align="center"><a href="https://github.com/Kloggzer"><img src="https://avatars.githubusercontent.com/u/19823711?v=4" width="100" alt="Kloggzer"/><br /><sub><b>Marius K</b></sub></a></td>
    </tr>
    <tr>
      <td align="center"><a href="https://github.com/mcagnion"><img src="https://avatars.githubusercontent.com/u/22574458?v=4" width="100" alt="mcagnion"/><br /><sub><b>Mickael Cagnion</b></sub></a></td>
      <td align="center"><a href="https://github.com/exception0x876"><img src="https://avatars.githubusercontent.com/u/676813?v=4" width="100" alt="exception0x876"/><br /><sub><b>exception0x876</b></sub></a></td>
    </tr>
  </tbody>
</table>
<!-- readme: collaborators,contributors -end -->

## License

GPL-3.0
