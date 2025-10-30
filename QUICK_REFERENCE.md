# PoB MCP Server Quick Reference

## Environment Variables Cheat Sheet

### Required
```bash
POB_DIRECTORY="/path/to/Path of Building/Builds"
```

### Lua Bridge (Optional)
```bash
POB_LUA_ENABLED="true"                              # Enable Lua bridge
POB_FORK_PATH="/path/to/pob-api-fork/src"         # PoB API fork location
POB_CMD="luajit"                                    # LuaJIT command
POB_TIMEOUT_MS="10000"                              # Request timeout (10s)
```

### TCP Mode (Optional)
```bash
POB_API_TCP="true"                                  # Use TCP instead of stdio
POB_API_TCP_HOST="127.0.0.1"                       # TCP host
POB_API_TCP_PORT="31337"                           # TCP port
```

## Tool Quick Reference

### XML Tools (Always Available)

| Tool | Purpose | Example |
|------|---------|---------|
| `list_builds` | List all builds | "Show me my builds" |
| `analyze_build` | Full build analysis | "Analyze MyBuild.xml" |
| `compare_builds` | Compare two builds | "Compare Build1.xml and Build2.xml" |
| `get_build_stats` | Get stats only | "What are the stats for MyBuild.xml?" |
| `start_watching` | Monitor for changes | "Start watching builds" |
| `stop_watching` | Stop monitoring | "Stop watching" |
| `watch_status` | Check watch status | "Watch status" |
| `get_recent_changes` | Show recent changes | "What changed recently?" |

### Lua Bridge Tools (When Enabled)

| Tool | Purpose | Example |
|------|---------|---------|
| `lua_start` | Initialize bridge | "Start the Lua bridge" |
| `lua_stop` | Stop bridge | "Stop the Lua bridge" |
| `lua_load_build` | Load build XML | "Load MyBuild.xml into Lua" |
| `lua_get_stats` | Get calculated stats | "Get stats from Lua" |
| `lua_get_tree` | Get tree data | "Show me the tree" |
| `lua_set_tree` | Update tree | "Set tree to nodes [list]" |

### Phase 3 Tools (Require Lua Bridge)

| Tool | Purpose | Example |
|------|---------|---------|
| `compare_trees` | Compare allocations | "Compare current tree vs adding nodes [list]" |
| `preview_allocation` | What-if analysis | "Preview adding nodes [list]" |
| `plan_build` | Get recommendations | "Help me plan a Cold DoT Occultist" |

### Phase 4 Tools (Require Lua Bridge)

| Tool | Purpose | Example |
|------|---------|---------|
| `add_item` | Add item from text | "Add this weapon: [item text]" |
| `get_equipped_items` | View equipped items | "What items do I have equipped?" |
| `toggle_flask` | Activate/deactivate flask | "Activate flask 1" |
| `get_skill_setup` | View skill configuration | "Show me my skill setup" |
| `set_main_skill` | Change main skill | "Set main skill to socket group 2" |

## Common Workflows

### Workflow 1: Quick Build Check
```
1. "Show me my builds"
2. "Analyze CritBow.xml"
```

### Workflow 2: High-Fidelity Stats
```
1. "Start Lua bridge"
2. "Load MyBuild.xml into Lua"
3. "Get stats from Lua"
4. "Stop Lua bridge"
```

### Workflow 3: Tree Optimization
```
1. "Start Lua bridge"
2. "Load MyBuild.xml"
3. "Get current tree"
4. "Preview adding nodes [defense nodes]"
5. "Preview adding nodes [offense nodes]"
6. "Compare both options"
7. "Stop bridge"
```

### Workflow 4: Build Planning
```
1. "Help me plan a [archetype] [class/ascendancy]"
2. [Review recommendations]
3. "Start Lua bridge"
4. "Load a template build"
5. "Set tree to recommended nodes"
6. "Get stats to verify"
```

### Workflow 5: Build Comparison with Modifications
```
1. "Start Lua bridge"
2. "Load BuildA.xml"
3. "Get stats"
4. "Compare tree with BuildB.xml's allocation"
5. "Preview the tree from BuildB"
6. "Stop bridge"
```

### Workflow 6: Test Gear Upgrade (Phase 4)
```
1. "Start bridge and load build"
2. "What items do I have equipped?"
3. "Get current DPS"
4. "Add this weapon: [item text from trade]"
5. "Activate diamond flask"
6. "Get new DPS"
7. "Calculate upgrade value"
```

### Workflow 7: Complete Build Creation (Phase 4)
```
1. "Start bridge, load template"
2. "Set tree to [optimized nodes]"
3. "Add items: [paste all gear]"
4. "Set main skill to group 1"
5. "Activate damage flasks"
6. "Get final stats"
7. "Export as [BuildName.xml]"
```

## Class and Ascendancy IDs

### Class IDs
- 0: Scion
- 1: Marauder
- 2: Ranger
- 3: Witch
- 4: Duelist
- 5: Templar
- 6: Shadow

### Ascendancy IDs (by Class)

#### Scion (0)
- 0: None
- 1: Ascendant

#### Marauder (1)
- 0: None
- 1: Juggernaut
- 2: Berserker
- 3: Chieftain

#### Ranger (2)
- 0: None
- 1: Deadeye
- 2: Raider
- 3: Pathfinder

#### Witch (3)
- 0: None
- 1: Necromancer
- 2: Elementalist
- 3: Occultist

#### Duelist (4)
- 0: None
- 1: Slayer
- 2: Gladiator
- 3: Champion

#### Templar (5)
- 0: None
- 1: Inquisitor
- 2: Hierophant
- 3: Guardian

#### Shadow (6)
- 0: None
- 1: Assassin
- 2: Trickster
- 3: Saboteur

## Notable Keystone Node IDs

Common keystones you might reference:

| Keystone | Node ID | Effect Summary |
|----------|---------|----------------|
| Acrobatics | 29017 | +30% Spell Dodge, -30% Armour/ES |
| Ancestral Bond | 26725 | +1 Totem, you deal no damage |
| Avatar of Fire | 58833 | 50% phys → fire, deal no non-fire |
| Blood Magic | 61259 | Spend life instead of mana |
| Chaos Inoculation | 61834 | 1 max life, immune to chaos |
| Conduit | 43988 | Share charges with party |
| Crimson Dance | 60783 | +100% bleed DPS, 8 stacks, no move multiplier |
| Eldritch Battery | 36949 | ES protects mana instead of life |
| Elemental Equilibrium | 54307 | -50% res to hit types, +25% others |
| Elemental Overload | 24970 | +40% ele damage, no crits |
| Ghost Reaver | 48410 | Leech to ES instead of life |
| Glancing Blows | 59585 | Double block, 65% damage taken when block |
| Iron Grip | 6910 | STR bonus to projectile attack damage |
| Iron Reflexes | 23852 | Evasion → armour |
| Mind Over Matter | 41536 | 30% damage taken from mana |
| Minion Instability | 43688 | Minions explode at low life |
| Pain Attunement | 37984 | 30% more spell damage on low life |
| Perfect Agony | 42148 | Crits don't multiply ailment damage, +50% multi as DoT multi |
| Phase Acrobatics | 31703 | +30% spell dodge |
| Point Blank | 33753 | More proj damage close, less far |
| Resolute Technique | 59859 | Never crit, always hit |
| Runebinder | 55503 | +1 Brand, brands attach to rare/unique |
| Unwavering Stance | 20551 | Cannot evade, cannot be stunned |
| Vaal Pact | 28127 | Instant leech, no regen |
| Zealot's Oath | 3655 | Regen to ES instead of life |

## Equipment Slot Names (Phase 4)

Use these exact slot names with `add_item`:

### Weapons & Shields
- `"Weapon 1"`, `"Weapon 2"` - Main hand / off hand
- `"Weapon 1 Swap"`, `"Weapon 2 Swap"` - Weapon swap set

### Armour
- `"Helmet"`
- `"Body Armour"`
- `"Gloves"`
- `"Boots"`

### Accessories
- `"Amulet"`
- `"Ring 1"`, `"Ring 2"`
- `"Belt"`

### Flasks
- `"Flask 1"` through `"Flask 5"`

### Jewels
- `"Jewel 1"`, `"Jewel 2"`, etc. (based on tree allocation)
- Abyssal sockets in items

### Example Usage
```
"Add this ring to Ring 2: [item text]"
"Add this flask to Flask 1: [item text]"
```

## Common Node Clusters

### Life/Defense Clusters

| Cluster | Starting Node | Notes |
|---------|---------------|-------|
| Constitution | 26725 | Major life wheel, Marauder area |
| Devotion | 2491 | Life wheel, Templar area |
| Heart of Oak | 36858 | Life/regen, Ranger area |
| Quick Recovery | 12613 | Life/regen, Scion area |
| Sanctity | 6230 | Life/ES, Templar area |
| Thick Skin | 18865 | Life/Evasion, Shadow area |

### Damage Clusters

| Cluster | Starting Node | Notes |
|---------|---------------|-------|
| Assassination | 43988 | Crit multi, Shadow area |
| Berserking | 32325 | Attack speed, Duelist area |
| Devastating Devices | 44169 | Trap/mine damage |
| Essence Surge | 11186 | ES/ES regen, Witch area |
| Force Shaper | 19968 | Weapon ele damage, Shadow area |
| Lava Lash | 58370 | Fire weapon damage, Marauder area |
| Twin Terrors | 56370 | Dual wield damage, Shadow area |

## Common Stat Field Names

Use these with `lua_get_stats` to request specific stats:

### Offense
- `TotalDPS` - Total damage per second
- `CombinedDPS` - Combined skill DPS
- `CritChance` - Critical strike chance
- `CritMultiplier` - Critical strike multiplier
- `HitChance` - Chance to hit
- `Speed` - Attack/cast speed
- `ManaCost` - Skill mana cost

### Defense
- `Life` - Maximum life
- `EnergyShield` - Maximum ES
- `Mana` - Maximum mana
- `Armour` - Armour rating
- `Evasion` - Evasion rating
- `Ward` - Maximum ward
- `LifeRegen` - Life regeneration per second
- `ManaRegen` - Mana regeneration per second
- `ESRegen` - ES regeneration per second

### Resistances
- `FireResist` - Fire resistance
- `ColdResist` - Cold resistance
- `LightningResist` - Lightning resistance
- `ChaosResist` - Chaos resistance
- `FireResistOverCap` - Fire resist over cap
- `ColdResistOverCap` - Cold resist over cap
- `LightningResistOverCap` - Lightning resist over cap

### Block/Dodge
- `BlockChance` - Attack block chance
- `SpellBlockChance` - Spell block chance
- `DodgeChance` - Attack dodge chance (if available)
- `SpellDodgeChance` - Spell dodge chance (if available)

### Misc
- `Str` - Strength
- `Dex` - Dexterity
- `Int` - Intelligence
- `EffectiveMovementSpeedMod` - Movement speed modifier

## Error Messages Quick Guide

| Error | Meaning | Solution |
|-------|---------|----------|
| "luajit command not found" | LuaJIT not installed | Install LuaJIT: `brew install luajit` |
| "Failed to find valid ready banner" | Fork path incorrect | Check POB_FORK_PATH setting |
| "Timed out waiting for response" | Process hung or slow | Increase POB_TIMEOUT_MS |
| "build not initialized" | No build loaded | Use lua_load_build first |
| "Process not started" | Bridge not running | Use lua_start first |
| "Concurrent request not supported" | Two requests at once | Wait for first request to complete |

## Tips and Best Practices

### Performance
- Lua bridge stays running between requests (faster)
- First stat calculation is slower (initializes)
- Subsequent calculations use cached data
- Stop bridge when done for long period

### Accuracy
- Lua bridge stats > XML parsed stats (always)
- Lua uses actual PoB calculation engine
- XML parsing is approximate/incomplete
- Use Lua for optimization decisions

### Workflow
- Use XML tools for quick checks
- Use Lua bridge for detailed work
- Preview before committing tree changes
- Stop bridge to free resources

### Debugging
- Check Claude Desktop logs for errors
- Test luajit manually: `luajit -v`
- Verify fork path: `ls $POB_FORK_PATH/HeadlessWrapper.lua`
- Test PoB fork manually: `cd $POB_FORK_PATH && luajit HeadlessWrapper.lua`

## Build Archetype Keywords

Use these when asking for build planning help:

### Damage Types
- Physical, Fire, Cold, Lightning, Chaos
- Elemental, Physical, Poison, Bleed, Ignite
- DoT (Damage over Time)

### Attack Types
- Melee, Ranged, Bow, Wand, Spell
- Totem, Trap, Mine, Brand
- Minion, Summoner

### Defense Styles
- Life, ES (Energy Shield), Hybrid (Life+ES)
- Armour, Evasion, Block, Dodge
- Leech, Regen, Gain on Hit

### Build Focuses
- Crit (Critical Strike)
- Non-crit, Resolute Technique
- Elemental, Physical
- Attack Speed, Slow hard-hitting
- Tankiness, Glass Cannon
- League Start, Budget, Endgame

### Example Queries
- "Cold DoT Occultist with ES and high cold res"
- "Physical bow crit Deadeye with evasion"
- "RF Chieftain with life and armour"
- "Max block spell suppression Gladiator"
- "CI ES recharge Trickster"
- "Minion necromancer with aura stacking"

## Quick Start Checklist

### First Time Setup
- [ ] Install Node.js
- [ ] Clone/download pob-mcp-server
- [ ] Run `npm install`
- [ ] Run `npm run build`
- [ ] Configure Claude Desktop with POB_DIRECTORY
- [ ] Restart Claude Desktop
- [ ] Test: "Show me my builds"

### Enable Lua Bridge (Optional)
- [ ] Install LuaJIT
- [ ] Clone pob-api-fork
- [ ] Add POB_LUA_ENABLED=true to config
- [ ] Add POB_FORK_PATH to config
- [ ] Restart Claude Desktop
- [ ] Test: "Start the Lua bridge"

## Support and Resources

- **GitHub**: https://github.com/yourusername/pob-mcp-server
- **Testing Guide**: See TESTING_GUIDE.md
- **Full Documentation**: See README.md
- **PoB API Fork**: https://github.com/Dulluhan/pob-api
- **MCP Protocol**: https://modelcontextprotocol.io

## Version Information

- **Current Version**: Phase 4 Complete
- **Total Tools**: 22 (8 XML + 6 Lua Bridge + 3 Phase 3 + 5 Phase 4)
- **MCP SDK**: @modelcontextprotocol/sdk
- **Node.js**: 14+ required
- **LuaJIT**: 2.0+ required (for bridge)
- **PoB Fork**: Compatible with LocalIdentity's fork

### What's New in Phase 4
- Item management (add items from PoE text)
- Equipment viewing
- Flask activation control
- Skill configuration
- Main skill selection
- Complete build modification workflows
