# Path of Building MCP Server

An MCP (Model Context Protocol) server that enables Claude to analyze and work with Path of Building builds.

---

**☕ If you find this project helpful, consider [buying me a coffee](https://buymeacoffee.com/ianderse)!**

---

## Features

### XML-Based Analysis (Always Available)
- **List Builds**: Browse all your Path of Building builds
- **Analyze Builds**: Extract detailed information from builds including stats, skills, items, and passive trees
- **Compare Builds**: Side-by-side comparison of two builds
- **Get Stats**: Quick access to build statistics
- **File Watching**: Real-time monitoring of build changes with automatic cache invalidation
- **Build Cache**: Intelligent caching for faster repeated analysis

### High-Fidelity Calculations (Lua Bridge - Optional)
- **Live Stat Calculation**: Use PoB's actual calculation engine for accurate stats
- **Tree Modification**: Add/remove passive nodes and see live stat updates
- **Optimal Node Suggestions**: Recommend high-efficiency nodes for goals like DPS, life, ES, and resists
- **Tree Optimization**: Automatically optimize entire passive trees by adding AND removing nodes
- **What-If Analysis**: Preview stat changes before committing to tree modifications
- **Tree Comparison**: Compare stat differences between different passive tree allocations
- **Build Planning**: Get intelligent node recommendations for new builds
- **Defensive Analysis**: Identify resist gaps, EHP issues, mitigation and sustain weaknesses
- **Interactive Sessions**: Load builds and modify them programmatically

## Installation

1. Install dependencies:
```bash
cd pob-mcp-server
npm install
```

2. Build the TypeScript code:
```bash
npm run build
```

## Configuration

### Basic Setup (XML Features Only)

By default, the server looks for builds in:
- macOS: `~/Path of Building/Builds`
- Windows/Linux: `~/Documents/Path of Building/Builds`

If your builds are in a different location (for example, `~/Documents/Path of Building/Builds` on some macOS setups), set `POB_DIRECTORY` explicitly.

To use a custom directory, set the `POB_DIRECTORY` environment variable.

### Claude Desktop Configuration

Add this to your Claude Desktop configuration file:

**Mac**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

#### Minimal Configuration (XML-only features)
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

#### Full Configuration (Including Lua Bridge)
```json
{
  "mcpServers": {
    "pob": {
      "command": "node",
      "args": ["/absolute/path/to/pob-mcp-server/build/index.js"],
      "env": {
        "POB_DIRECTORY": "/path/to/your/Path of Building/Builds",
        "POB_LUA_ENABLED": "true",
        "POB_FORK_PATH": "/path/to/pob-api-fork/src",
        "POB_CMD": "luajit",
        "POB_TIMEOUT_MS": "10000"
      }
    }
  }
}
```

### Environment Variables

#### Core Settings
- `POB_DIRECTORY`: Path to your PoB builds directory (required)
- `POB_LUA_ENABLED`: Set to `"true"` to enable Lua bridge features (default: `"false"`)

#### Lua Bridge Settings (when POB_LUA_ENABLED=true)
- `POB_FORK_PATH`: Path to pob-api-fork/src directory (default: `~/Projects/pob-api-fork/src`)
- `POB_CMD`: LuaJIT command (default: `"luajit"`)
- `POB_ARGS`: Lua script to run (default: `"HeadlessWrapper.lua"`)
- `POB_TIMEOUT_MS`: Request timeout in milliseconds (default: `"10000"`)

#### TCP Mode (For connecting to PoB GUI)
- `POB_API_TCP`: Set to `"true"` to use TCP instead of stdio (default: `"false"`)
- `POB_API_TCP_HOST`: TCP server host (default: `"127.0.0.1"`)
- `POB_API_TCP_PORT`: TCP server port (default: `"31337"`)

### Setting Up Lua Bridge (Optional)

The Lua bridge enables high-fidelity stat calculations using PoB's actual calculation engine.

#### Prerequisites
1. **Install LuaJIT**:
   ```bash
   # macOS
   brew install luajit

   # Ubuntu/Debian
   sudo apt-get install luajit

   # Windows
   # Download from https://luajit.org/ and add to PATH
   ```

2. **Clone PoB API Fork**:
   ```bash
   git clone [git@github.com:ianderse/PathOfBuilding.git]
   checkout branch api-stdio
   # Note the path to the 'src' directory for POB_FORK_PATH
   # Note that if this is eventually merged into Path Of Building official repo, you will not need this step
   ```

3. **Verify Installation**:
   ```bash
   # Test luajit is in PATH
   luajit -v

   # Test PoB fork structure
   ls /path/to/pob-api/src/HeadlessWrapper.lua
   ls /path/to/pob-api/src/Modules/
   ```

4. **Update Claude Desktop Config** with the full configuration shown above

5. **Restart Claude Desktop** to apply changes

## Usage

### XML-Based Features (Always Available)

Once connected to Claude, you can:

1. **List your builds**:
   - "Show me all my Path of Building builds"
   - "What builds do I have?"

2. **Analyze a specific build**:
   - "Analyze my 'Lightning Arrow Deadeye.xml' build"
   - "Tell me about my Tornado Shot build"

3. **Compare builds**:
   - "Compare my 'Build A.xml' and 'Build B.xml'"
   - "What's the difference between these two builds?"

4. **Get stats**:
   - "What are the stats for my RF Chieftain build?"
   - "Show me the DPS of my Lightning Strike build"

5. **Watch for changes**:
   - "Start watching my builds for changes"
   - "What changed recently?"
   - "Stop watching"

### Lua Bridge Features (When Enabled)

When `POB_LUA_ENABLED=true`, you gain access to high-fidelity calculations:

1. **Start the bridge**:
   - "Start the PoB Lua bridge"
   - Bridge initializes PoB calculation engine

2. **Load a build for calculation**:
   - "Load my 'Crit Bow Deadeye.xml' into the Lua bridge"
   - Build is parsed and ready for calculations

3. **Get accurate stats**:
   - "Get the calculated stats from the Lua bridge"
   - Returns stats from actual PoB engine (more accurate than XML parsing)

4. **View passive tree**:
   - "Get the passive tree from the Lua bridge"
   - Shows allocated nodes, masteries, class info

5. **Modify the tree**:
   - "Add nodes 65834, 65824 to the tree"
   - "Remove node 12345 from the tree"
   - Tree updates and stats recalculate automatically

6. **Compare tree allocations**:
   - "Compare my current tree with adding these defensive nodes [list]"
   - "Compare adding DPS nodes vs adding life nodes"
   - Shows stat differences between allocations

7. **Preview changes without committing**:
   - "Preview what happens if I allocate nodes [list]"
   - "What if I remove these nodes and add these others?"
   - See stat changes without modifying the loaded build

8. **Plan a new build**:
   - "Help me plan a Cold DoT Occultist build"
   - "Suggest passive nodes for a crit bow Deadeye"
   - "What nodes should I take for a max block Gladiator?"
   - Get intelligent node recommendations based on build archetype

9. **Manage items and gear**:
   - "What items do I have equipped?"
   - "Add this weapon: [paste item text from trade site]"
   - "Activate my Diamond Flask"
   - Test gear upgrades and flask combinations

10. **Configure skills**:
   - "Show me my skill setup"
   - "Set main skill to socket group 2"
   - Compare DPS between different skills

11. **Stop the bridge**:
   - "Stop the PoB Lua bridge"
   - Clean shutdown of calculation engine

## Available Tools

### XML-Based Tools (Always Available)

#### `list_builds`
Lists all `.xml` files in your Path of Building directory.

**Parameters**: None

**Returns**: List of build filenames with subdirectories

#### `analyze_build`
Provides a comprehensive summary of a build including:
- Character class and ascendancy
- Level
- Key statistics (Life, DPS, resistances, etc.)
- Active skills and support gems
- Equipped items
- Build notes

**Parameters**:
- `build_name` (required): Name of the build file (e.g., "MyBuild.xml")

**Returns**: Structured build analysis

#### `compare_builds`
Compares two builds side by side, highlighting differences in:
- Class and ascendancy
- Key statistics
- Gear choices

**Parameters**:
- `build1_name` (required): First build filename
- `build2_name` (required): Second build filename

**Returns**: Side-by-side comparison

#### `get_build_stats`
Quickly retrieves all statistics from a build.

**Parameters**:
- `build_name` (required): Name of the build file

**Returns**: All numerical stats from build XML

#### `start_watching`
Starts monitoring the builds directory for changes. When enabled:
- Changes are detected within 2 seconds
- Build cache is automatically invalidated
- Recent changes are tracked

**Parameters**: None

**Returns**: Confirmation message

#### `stop_watching`
Stops monitoring the builds directory.

**Parameters**: None

**Returns**: Confirmation message

#### `watch_status`
Shows current file watching status, including:
- Whether watching is enabled
- Directory being monitored
- Number of cached builds
- Number of recent changes tracked

**Parameters**: None

**Returns**: Status information

#### `get_recent_changes`
Lists recently modified builds with timestamps. Useful for seeing what builds have been updated in PoB.

**Parameters**: None

**Returns**: List of changed builds with timestamps

#### `refresh_tree_data`
Refresh the cached passive tree data.

**Parameters**:
- `version` (optional): Specific tree version string (e.g., "3_26"). If omitted, clears all cached versions and refetches on demand.

**Returns**: Confirmation message

#### `get_build_xml`
Return the raw XML content of a build file.

**Parameters**:
- `build_name` (required): Name of the build file (e.g., "MyBuild.xml")

**Returns**: Raw XML content

### Helper Tools

- `refresh_tree_data`: Refresh cached passive tree data. Use when PoB updates or if versions mismatch.
- `get_build_xml`: Return raw XML for a build file. Useful for debugging or piping to `lua_load_build`.

### Lua Bridge Tools (When POB_LUA_ENABLED=true)

#### `lua_start`
Initialize the PoB Lua bridge for high-fidelity calculations.

**Parameters**: None

**Returns**: Success message with mode info (stdio or TCP)

**Example**: "Start the PoB Lua bridge"

#### `lua_stop`
Stop the PoB Lua bridge and clean up resources.

**Parameters**: None

**Returns**: Success message

**Example**: "Stop the Lua bridge"

#### `lua_load_build`
Load a build XML into the PoB calculation engine.

**Parameters**:
- `build_xml` (required): Raw XML content of the build
- `name` (optional): Build name (default: "MCP Build")

**Returns**: Success message

**Example**: "Load my 'Deadeye.xml' into the Lua bridge"

#### `lua_get_stats`
Get calculated stats from PoB engine (more accurate than XML parsing).

**Parameters**:
- `fields` (optional): Array of specific stat names to retrieve

**Returns**: Calculated stats with metadata

**Example**: "Get the stats from the Lua bridge"

#### `lua_get_tree`
Get current passive tree data from loaded build.

**Parameters**: None

**Returns**:
- Tree version
- Class ID and ascendancy IDs
- All allocated node IDs
- Mastery effect selections

**Example**: "Show me the passive tree"

#### `lua_set_tree`
Update the passive tree and recalculate stats.

**Parameters**:
- `classId` (required): Class ID (0-6)
- `ascendClassId` (required): Ascendancy class ID
- `secondaryAscendClassId` (optional): Secondary ascendancy (for Scion)
- `nodes` (required): Array of node IDs to allocate
- `masteryEffects` (optional): Object mapping mastery node ID to effect ID
- `treeVersion` (optional): Tree version string

**Returns**: Success message

**Example**: "Set the tree to allocate nodes [65834, 65824]"

### Phase 3 Tools (Require Lua Bridge)

These planning tools help discover, path to, and test node allocations.

#### `compare_trees`
Compare passive tree differences between two builds.

**Parameters**:
- `build1` (required): First build filename
- `build2` (required): Second build filename

**Returns**: Differences in keystones/notables, point allocation, and stat comparison

#### `test_allocation`
What-if analysis: preview adding/removing nodes without modifying the loaded build.

**Parameters**:
- `build_name` (required): Base build filename
- `changes` (required): Natural language description (e.g., "allocate Point Blank", "remove Acrobatics")

**Returns**: Base vs simulated stats and differences

#### `plan_tree`
Plan passive tree allocation strategy based on goals.

**Parameters**:
- `goals` (required): Description of build goals (e.g., "crit bow Deadeye, get Point Blank")
- `build_name` (optional): Base build to plan from

**Returns**: Target keystones, notable suggestions, and planning guidance

#### `get_nearby_nodes`
List unallocated notables/keystones near the current allocation with distance and path cost.

**Parameters**:
- `build_name` (required)
- `max_distance` (optional): Travel nodes to search (default 5)
- `filter` (optional): Keyword filter (e.g., "life", "critical")

**Returns**: Candidates with stats, distance, and cost

#### `find_path_to_node`
Find shortest path to a target node ID, including intermediate nodes and total cost.

**Parameters**:
- `build_name` (required)
- `target_node_id` (required): Node ID string
- `show_alternatives` (optional): Show up to 3 alternatives

**Returns**: Path nodes and total point cost

#### `allocate_nodes`
Allocate specific node IDs and calculate exact before/after stats using PoB.

**Parameters**:
- `build_name` (required)
- `node_ids` (required): Array of node ID strings
- `show_full_stats` (optional)

**Returns**: Before/after stats and confirmation

### Phase 4 Tools (Require Lua Bridge)

#### `add_item`
Add an item to the build from PoE item text format.

**Parameters**:
- `item_text` (required): Item text in Path of Exile format (copied from game/trade site)
- `slot_name` (optional): Specific slot to equip to (e.g., "Weapon 1", "Body Armour")
- `no_auto_equip` (optional): If true, add to inventory without equipping

**Returns**:
- Item ID and name
- Slot equipped to
- Confirmation that stats were recalculated

**Example**: "Add this weapon: [paste item text]"

**Item Text Format**:
```
Rarity: Rare
Dragon Claw
Corsair Sword
--------
Quality: +20%
Physical Damage: 45-85
...
```

#### `get_equipped_items`
Get all currently equipped items with details.

**Parameters**: None

**Returns**:
- All equipment slots
- Item names and base types
- Item rarity
- Flask activation status

**Example**: "What items do I have equipped?"

#### `toggle_flask`
Activate or deactivate a flask and recalculate stats.

**Parameters**:
- `flask_number` (required): Flask slot (1-5)
- `active` (required): true to activate, false to deactivate

**Returns**:
- Confirmation of flask status
- Stats recalculated

**Example**: "Activate my Diamond Flask"

**Use Cases**:
- Test DPS with flasks active
- Compare buffed vs unbuffed stats
- Optimize flask selection

#### `get_skill_setup`
Get all skill socket groups and current selection.

**Parameters**: None

**Returns**:
- All socket groups with linked skills
- Main socket group selection
- Which skills are enabled
- Which skills contribute to DPS calculations

**Example**: "Show me my skill setup"

#### `set_main_skill`
Set which skill group to use for stat calculations.

**Parameters**:
- `socket_group` (required): Socket group index (1-based)
- `active_skill_index` (optional): Which skill in the group
- `skill_part` (optional): Which part of a multi-part skill

**Returns**:
- Confirmation of selection
- Stats recalculated

**Example**: "Set main skill to socket group 2"

**Use Cases**:
- Compare DPS between different skills
- Test different 6-links
- Switch between hit and DoT portions

### Phase 6 Tools (Require Lua Bridge)

#### `analyze_defenses`
Analyze defensive stats and identify weaknesses. Provides prioritized recommendations.

**Parameters**:
- `build_name` (required)

**Returns**: Defensive summary, gaps, and recommended fixes

#### `suggest_optimal_nodes`
Suggest the best nearby nodes to allocate for a goal (DPS, life, ES, resists, balanced, etc.). Ranks by efficiency and includes paths and projections.

**Parameters**:
- `build_name` (required)
- `goal` (required)
- `max_points`, `max_distance`, `min_efficiency`, `include_keystones` (optional)

**Returns**: Ranked recommendations with paths and projected stats

See `SUGGEST_OPTIMAL_NODES_GUIDE.md` for detailed guidance.

#### `optimize_tree`
Full tree optimizer that can add and remove nodes to meet a goal within constraints.

**Parameters**:
- `build_name` (required)
- `goal` (required)
- `max_points`, `max_iterations`, `constraints` (optional)

**Returns**: Optimized allocation and stat outcome

## Development

### Watch mode for development:
```bash
npm run dev
```

### Testing with example build:
The repository includes an `example-build.xml` file you can use for testing. Copy it to your PoB directory or adjust the `POB_DIRECTORY` to point to the repo folder.

## Path of Building File Structure

Path of Building stores builds as XML files with this general structure:
- `<Build>`: Character info and stats
- `<Tree>`: Passive skill tree
- `<Skills>`: Active skills and gem links
- `<Items>`: Equipped items
- `<Notes>`: Build notes and instructions

## Troubleshooting

### XML Features

#### No builds found
- Verify your `POB_DIRECTORY` path is correct
- Ensure the directory contains `.xml` files
- Check file permissions

#### Parse errors
- Ensure your Path of Building is up to date
- Try opening the build in PoB to verify it's not corrupted

#### Connection issues
- Restart Claude Desktop after configuration changes
- Check the Claude Desktop logs for errors
- Verify the path to `build/index.js` is absolute

### Lua Bridge Features

#### "luajit command not found"
**Solution**: Install LuaJIT and ensure it's in your PATH
```bash
# macOS
brew install luajit

# Ubuntu/Debian
sudo apt-get install luajit

# Windows: Download from https://luajit.org/
```

#### "Failed to find valid ready banner"
**Solution**: Check `POB_FORK_PATH` points to the correct directory
- Should contain `HeadlessWrapper.lua`
- Should contain `Modules/` directory with PoB code
- Verify path with: `ls $POB_FORK_PATH/HeadlessWrapper.lua`

#### "Timed out waiting for response"
**Solutions**:
1. Increase `POB_TIMEOUT_MS` (try 20000 for 20 seconds)
2. Verify PoB fork installation is complete
3. Check if `HeadlessWrapper.lua` has syntax errors
4. Test manually: `cd $POB_FORK_PATH && luajit HeadlessWrapper.lua`

#### Stats don't match PoB GUI
**Possible causes**:
- Different game version between fork and GUI
- Configuration differences (bandit, pantheon, enemy level)
- PoB fork out of date (pull latest changes)
- Different tree version selected

#### TCP connection fails
**Solutions**:
1. Verify PoB GUI launched with `POB_API_TCP=1` environment variable
2. Check if port 31337 is in use: `lsof -i :31337`
3. Test connection: `telnet 127.0.0.1 31337`
4. Check firewall settings
5. For remote connections, ensure SSH tunneling is set up correctly

#### Bridge becomes unresponsive
**Solution**: Stop and restart the bridge
1. "Stop the Lua bridge"
2. Wait a few seconds
3. "Start the Lua bridge"

If still unresponsive, restart Claude Desktop.

## Advanced Usage Examples

### Example 1: Optimizing a Build's Defenses

```
User: "Start the Lua bridge and load my 'Glass Cannon Deadeye.xml'"
Claude: [Starts bridge and loads build]

User: "Get the current stats"
Claude: [Shows stats - notices low life, no ES, mediocre resistances]

User: "Compare my current tree with adding Constitution (26725), Diamond Skin (3, 24, 25), and Constitution wheel"
Claude: [Shows +800 life, +30% all res, minor DPS loss]

User: "Preview those changes"
Claude: [Confirms the changes look good]

User: "That looks better! Stop the bridge"
```

### Example 2: Planning a New Build from Scratch

```
User: "Help me plan a physical impale champion build with sword and shield, focusing on block"
Claude: [Analyzes requirements]
- Class: Duelist/Champion
- Starting area: STR/DEX nodes near Duelist
- Priority clusters:
  - Block nodes near starting area
  - Sword damage clusters
  - Impale effect nodes
  - Life/armor nodes
- Keystones: Versatile Combatant (from Champion), potentially Resolute Technique
- Pathing: Recommend path through bottom-right tree
```

### Example 3: What-If Scenario Testing

```
User: "Start the bridge and load 'RF Chieftain.xml'"
Claude: [Loads build]

User: "I'm considering respeccing some damage nodes for more life. Preview removing these fire damage nodes [list] and adding life nodes [list]"
Claude: [Shows -15% DPS but +600 life]

User: "Hmm, too much DPS loss. Try instead removing just [smaller list] and adding life"
Claude: [Shows -8% DPS, +400 life]

User: "Better! What if I also add some regen nodes?"
Claude: [Shows final comparison with regen included]
```

### Example 4: Comparing Multiple Builds

```
User: "List my builds"
Claude: [Shows 10+ builds]

User: "Compare my 'League Start Build.xml' with 'Endgame Upgrade.xml'"
Claude: [Shows side-by-side comparison via XML]

User: "Now load 'League Start Build' into Lua and get accurate stats"
Claude: [Loads and shows calculated stats]

User: "Compare this tree with the tree from 'Endgame Upgrade'"
Claude: [Extracts tree from second build, shows stat differences]
```

### Example 5: Testing Gear Upgrades (Phase 4)

```
User: "Start the bridge and load my 'Trade League Deadeye.xml'"
Claude: [Loads build]

User: "What items do I have equipped?"
Claude: [Shows all equipped items]

User: "What's my current DPS?"
Claude: "Current DPS: 450,000"

User: "I found this bow on trade. Add it:
Rarity: Rare
Death Spiral
Thicket Bow
--------
Quality: +20%
Physical Damage: 78-145
Critical Strike Chance: 6.5%
Attacks per Second: 1.98
--------
+98 to Dexterity
Adds 15 to 28 Physical Damage
+35% to Global Critical Strike Multiplier
+18% to Attack Speed"

Claude: [Adds bow, recalculates]

User: "What's the new DPS?"
Claude: "New DPS: 625,000 (+175k, +39%)"

User: "Great! Now activate my Diamond Flask and Quicksilver"
Claude: [Activates flasks 1 and 5]

User: "Final DPS with flasks?"
Claude: "Buffed DPS: 810,000"

User: "Perfect! Export this as 'Deadeye_Upgraded_Bow.xml'"
```

### Example 6: Complete Build Modification Workflow

```
User: "Start bridge, load my template build"
Claude: [Initializes]

User: "Get current stats"
Claude: "Base stats: 3.2k life, 0 DPS (no gear)"

User: "Set the tree to allocate these nodes: [optimized 90-point tree]"
Claude: [Updates passive tree]

User: "Add these items:" [pastes 10 items from trade site]
Claude: [Adds all items one by one]

User: "Get skill setup"
Claude: [Shows socket groups]

User: "Set main skill to group 1"
Claude: [Configures main skill]

User: "Activate damage flasks 1, 2, and 3"
Claude: [Activates flasks]

User: "Show me the final stats"
Claude:
"=== Final Build Stats ===
Life: 4,850
DPS (unbuffed): 420,000
DPS (with flasks): 685,000
Crit Chance: 82%
All Resistances: 75% (capped)
..."

User: "Excellent! Save this as 'League_Start_Final.xml'"
```

## Testing

For comprehensive testing instructions, see [TESTING_GUIDE.md](TESTING_GUIDE.md).

Quick test checklist:
- [ ] XML features work without `POB_LUA_ENABLED`
- [ ] Bridge starts when `POB_LUA_ENABLED=true`
- [ ] Can load builds and get stats
- [ ] Tree modifications update stats correctly
- [ ] What-if previews work without changing loaded build
- [ ] Build planning provides relevant suggestions
- [ ] Bridge stops cleanly

## Project Status

### Phase 1: XML Analysis ✅
- Build listing, analysis, comparison
- Stat extraction from XML
- File watching

### Phase 2: Passive Tree Parsing ✅
- Node allocation extraction
- Jewel socket identification
- Tree metadata parsing

### Phase 3: Lua Bridge Integration ✅
- High-fidelity stat calculation
- Tree modification with recalculation
- What-if analysis (`test_allocation`)
- Tree comparison (`compare_trees`)
- Build planning assistance (`plan_tree`)

### Phase 4: Item & Skill Management ✅
- Item addition from PoE text format (`add_item`)
- Equipment viewing (`get_equipped_items`)
- Flask activation control (`toggle_flask`)
- Skill setup inspection (`get_skill_setup`)
- Main skill selection (`set_main_skill`)
- Complete build modification workflow support

### Phase 5: Automated Testing ⏸️
- Unit test suite with mocked PoB process
- Integration tests for all tools
- Snapshot testing for outputs
- CI/CD pipeline integration
- *Status: Deferred for future development*

### Phase 6: Build Optimization ✅
- ✅ Defensive layer analysis (`analyze_defenses`)
- ✅ Nearby node discovery with reachability checking (`get_nearby_nodes`)
- ✅ Pathfinding to target nodes (`find_path_to_node`)
- ✅ Direct node allocation with stat calculations (`allocate_nodes`)
- ✅ **Intelligent node recommendations** (`suggest_optimal_nodes`) 🎯
- ✅ Full reallocation optimizer (`optimize_tree`)
- ✅ Fixed Lua bridge timeless jewel data loading (Glorious Vanity, etc.)
- ✅ Fixed passive tree connection parsing for proper graph traversal
- ⏸️ Item upgrade recommendations
- ⏸️ Skill link optimization suggestions
- ⏸️ Budget build creation from requirements
- ⏸️ Trade site integration for finding upgrades

**Total Tools**: 27 (8 XML + 6 Lua Bridge + 3 Phase 3 + 5 Phase 4 + 5 Phase 6)

### Complete Passive Tree Optimization Workflow 🎯

The MCP server now provides end-to-end tree optimization:

1. **Intelligent Recommendations**: `suggest_optimal_nodes` ⭐ **NEW**
   - AI-powered analysis finds the best nodes for your goal
   - Scores nodes by efficiency (stat gain per point spent)
   - Tests actual stat impact using PoB's calculation engine
   - Supports multiple goals: DPS, life, defense, crit, balanced, etc.
   - Returns top 10 recommendations with paths and projections

2. **Discovery**: `get_nearby_nodes` shows reachable notables/keystones within N nodes
   - Uses Dijkstra's algorithm to ensure nodes are actually reachable
   - Filters by stat keywords (e.g., "evasion", "life", "damage")
   - Only shows nodes accessible from your current tree (no other ascendancies)

3. **Pathfinding**: `find_path_to_node` finds shortest path to any target
   - Shows every intermediate node needed
   - Displays stats for each node along the path
   - Calculates total point cost
   - Provides ready-to-use command for testing

4. **Validation**: `allocate_nodes` calculates real stat impact
   - Uses PoB Lua engine for accurate calculations
   - Shows before/after for all important stats
   - Calculates percentage changes
   - Identifies travel nodes with no stats

5. **Analysis**: `analyze_defenses` identifies weaknesses
   - Checks resistances, life pool, physical mitigation, sustain
   - Provides prioritized recommendations
   - Works with actual calculated stats from Lua bridge

**Example Workflow (Simple - AI Recommendations)**:
```
User: "Suggest nodes to maximize my life"

suggest_optimal_nodes(build_name="Deadeye.xml", goal="maximize_life")
   → Top 3 recommendations:
   1. Constitution [26725] - +180 life/point (4 nodes, +720 life)
   2. Sentinel [2491] - +150 life/point (3 nodes, +450 life)
   3. Thick Skin [24970] - +110 life/point (5 nodes, +550 life)
   → Projected total: 4,200 → 5,920 life (+41%)
```

**Example Workflow (Manual - Discovery)**:
```
User: "I need more evasion"

1. get_nearby_nodes(filter="evasion")
   → Shows "Revenge of the Hunted" [36542] at 5 nodes away

2. find_path_to_node(target="36542")
   → Path: 5 nodes, costs 5 points
   → Shows: node1 (travel), node2 (+Dex), node3 (+Eva), node4 (travel), target

3. allocate_nodes(node_ids=["node1", "node2", "node3", "node4", "36542"])
   → Evasion: 1754 → 2204 (+450, +25.7%)
   → Dexterity: 104 → 134 (+30, +28.8%)
   → Damage: slight increase from Dex scaling
```

### Technical Achievements

**Lua Bridge Enhancements**:
- Implemented `NewFileSearch`, `Inflate`, `Deflate`, `GetScriptPath` in headless mode
- Enables loading of split timeless jewel data files (`.part0` through `.part4`)
- Fixed JSON response parsing to skip non-JSON console output
- Added comprehensive debug logging for troubleshooting

**Passive Tree Parsing**:
- Fixed brace-counting algorithm for nested Lua table structures
- Proper extraction of node connections (`out` and `in` arrays)
- Handles complex tree data with 3,800+ nodes

**Pathfinding & Graph Algorithms**:
- Dijkstra's algorithm for shortest path finding
- BFS with reachability checking for nearby node discovery
- Fixed JavaScript falsy value bug (`0 || Infinity` → `0 ?? Infinity`)
- Efficient distance calculations across entire passive tree

### Future Enhancements

#### Phase 7: Advanced Optimization
- Multi-path comparison (show top 3 alternative paths)
- Automated "best N nodes for X stat" finder
- Point efficiency analysis (stat gain per point spent)
- Jewel socket optimization

#### Phase 8: Build Export & Persistence
- Export modified builds to XML files
- Save optimized trees back to PoB directory
- Build version management
- Snapshot and rollback support

#### Later Phases
- Item crafting simulation (fossil/essence/etc.)
- Gem level/quality modification
- Configuration templates (bandit, pantheon presets)
- Build template library
- Integration with PoE Wiki for tooltips
- Trade site integration for upgrade recommendations

## Contributing

Feel free to submit issues or pull requests!

## License

MIT
