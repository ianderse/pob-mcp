# Path of Building MCP Server

An MCP (Model Context Protocol) server that enables Claude to analyze and work with Path of Building builds.

---

**☕ If you find this project helpful, consider [buying me a coffee](https://buymeacoffee.com/ianderse)!**

---

## 🚀 Optimized for Claude Desktop

This server is specifically optimized to prevent timeouts in Claude Desktop:
- **Tool Gate System**: Prevents excessive tool chaining - 27 high-impact tools require explicit "continue" command
- **Response Truncation**: Automatically limits responses to 8000 characters with helpful summaries
- **Batch Operations**: Combines multiple operations (e.g., `setup_skill_with_gems`, `add_multiple_items`)
- **Concise Responses**: Streamlined output focusing on actionable information

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
- **Optimal Node Suggestions**: AI-powered recommendations for high-efficiency nodes based on goals (DPS, life, ES, defense, etc.)
- **Tree Optimization**: Automatically optimize entire passive trees by intelligently adding and removing nodes
- **Pathfinding**: Find shortest paths to target nodes with distance and cost analysis
- **Nearby Node Discovery**: List reachable notables/keystones within specified distance using Dijkstra's algorithm
- **What-If Analysis**: Preview stat changes before committing to tree modifications
- **Tree Comparison**: Compare stat differences between different passive tree allocations
- **Build Planning**: Get intelligent node recommendations for new builds
- **Defensive Analysis**: Identify resist gaps, EHP issues, mitigation and sustain weaknesses with prioritized recommendations
- **Item Analysis**: Analyze equipped gear and get upgrade recommendations based on build goals
- **Skill Link Optimization**: Detect missing support gems, anti-synergies, and get gem recommendations
- **Budget Build Creation**: Generate comprehensive build plans from requirements with skill links, gearing strategy, and passive tree priorities
- **Item Management**: Add items from PoE text format, manage flasks, and test gear upgrades
- **Skill Configuration**: View and modify skill setups, compare DPS between different socket groups
- **Interactive Sessions**: Load builds and modify them programmatically with immediate stat recalculation

### Build Validation (Phase 7)
- **Comprehensive Validation**: Check resistances, defenses, mana, accuracy, and immunities
- **Severity Classification**: Critical issues, warnings, and recommendations
- **Build Scoring**: Overall health score (0-10) based on issue severity
- **Actionable Suggestions**: Specific fixes for each problem (gear, tree, flasks)
- **Smart Context**: Different thresholds for life/ES builds, attack/spell builds, character level

### Configuration & Enemy Settings (Phase 9)
- **View Configuration**: See current charge usage, enemy settings, and active conditions
- **Modify Settings**: Toggle buffs, charges, and combat conditions
- **Enemy Parameters**: Configure enemy level, resistances, armor, and evasion
- **Scenario Testing**: Test DPS against bosses (Shaper, Maven, map bosses)
- **Impact Analysis**: Before/after DPS comparison with change percentage

### Build Export & Persistence (Phase 8)
- **Export Builds**: Create copies/variants of builds to XML files with optional notes
- **Save Tree**: Update passive tree in existing builds without affecting gear or skills
- **Snapshot Management**: Create versioned snapshots with metadata tracking stats and changes
- **Snapshot History**: List all snapshots for a build with timestamps, tags, and stat comparisons
- **Rollback Support**: Restore builds from snapshots with automatic backup of current state

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

The server provides 39 tools organized into functional categories. All tools are accessible through natural language conversation with Claude.

### Tool Categories

**XML-Based Tools (8 tools)** - Always available, no Lua bridge required:
- Build listing and file watching
- Build analysis and comparison
- Stat extraction from XML
- Raw XML access and tree data management

**Lua Bridge Core Tools (9 tools)** - Require `POB_LUA_ENABLED=true`:
- Bridge lifecycle management (start/stop)
- Build loading into calculation engine
- High-fidelity stat calculation
- Passive tree viewing and modification
- Configuration state viewing and modification
- Enemy parameter configuration
- Scenario testing (boss DPS, charge impact, etc.)

**Tree Planning Tools (3 tools)** - Require Lua bridge:
- Tree comparison between builds
- What-if analysis for node changes
- Build planning assistance

**Item & Skill Tools (5 tools)** - Require Lua bridge:
- Item management (add items, view equipment)
- Flask activation control
- Skill setup configuration

**Build Optimization Tools (8 tools)** - Require Lua bridge:
- Defensive analysis with recommendations
- Intelligent node suggestions by efficiency
- Full tree optimization with constraints
- Pathfinding to target nodes
- Nearby node discovery with reachability
- Direct node allocation with stat calculations
- Item upgrade recommendations
- Skill link optimization
- Budget build creation from requirements

**Build Validation Tools (1 tool)** - Works with or without Lua bridge:
- Comprehensive build validation (resistances, defenses, mana, accuracy, immunities)
- Severity-based issue classification
- Overall build health scoring
- Actionable recommendations

**Build Export & Persistence Tools (5 tools)** - Always available:
- Export builds to XML files with optional notes
- Update passive tree without affecting gear/skills
- Create versioned snapshots with metadata
- View snapshot history with stats
- Rollback to previous snapshots

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

### Tree Planning Tools (Require Lua Bridge)

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

### Item & Skill Management Tools (Require Lua Bridge)

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

### Build Optimization Tools (Require Lua Bridge)

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
- `goal` (required): Optimization goal (e.g., "maximize_dps", "maximize_life", "maximize_defense", "balanced")
- `max_points` (optional): Maximum passive points to use
- `max_iterations` (optional): Maximum optimization iterations
- `constraints` (optional): Additional constraints for optimization

**Returns**: Optimized allocation and stat outcome

#### `get_nearby_nodes`
List unallocated notables/keystones near the current allocation with distance and path cost using Dijkstra's algorithm.

**Parameters**:
- `build_name` (required)
- `max_distance` (optional): Travel nodes to search (default 5)
- `filter` (optional): Keyword filter (e.g., "life", "critical", "evasion")

**Returns**: Reachable candidates with stats, distance, and cost

#### `find_path_to_node`
Find shortest path to a target node ID, including intermediate nodes and total cost.

**Parameters**:
- `build_name` (required)
- `target_node_id` (required): Node ID string
- `show_alternatives` (optional): Show up to 3 alternative paths

**Returns**: Path nodes and total point cost

#### `allocate_nodes`
Allocate specific node IDs and calculate exact before/after stats using PoB's calculation engine.

**Parameters**:
- `build_name` (required)
- `node_ids` (required): Array of node ID strings
- `show_full_stats` (optional): Show complete stat comparison

**Returns**: Before/after stats with percentage changes and confirmation

#### `analyze_items`
Analyze all equipped items and suggest upgrades based on build goals. Identifies empty slots, resistance gaps, and item quality issues.

**Parameters**:
- `build_name` (optional): Build file to analyze. If omitted and Lua bridge is active, analyzes currently loaded build.

**Returns**:
- Item analysis with priority rankings (high/medium/low)
- Resistance cap status
- Life/ES pool warnings
- Slot-by-slot upgrade recommendations

**Example**: "Analyze my items for upgrade opportunities"

**Use Cases**:
- Identify gear weaknesses
- Cap elemental resistances
- Find empty item slots
- Optimize defensive layers

#### `optimize_skill_links`
Analyze skill gem setups and suggest link optimizations. Detects missing support gems, low-level gems, anti-synergies, and provides gem recommendations.

**Parameters**:
- `build_name` (optional): Build file to analyze. If omitted and Lua bridge is active, analyzes currently loaded build.

**Returns**:
- Skill group analysis for all socket groups
- Missing link warnings
- Support gem recommendations by skill type
- Low level/quality gem alerts
- Anti-synergy detection (e.g., Elemental Focus + Ignite supports)

**Example**: "Optimize my skill links for maximum DPS"

**Use Cases**:
- Maximize damage from 6-link setups
- Find missing support gems
- Detect conflicting support gems
- Ensure gems are properly leveled and quality'd

#### `create_budget_build`
Generate a comprehensive budget build plan based on requirements. Provides skill link recommendations, gearing strategy, defensive layers, passive tree priorities, and leveling tips.

**Parameters**:
- `class_name` (required): Character class (e.g., 'Ranger', 'Witch', 'Marauder')
- `ascendancy` (optional): Ascendancy class (e.g., 'Deadeye', 'Occultist')
- `main_skill` (required): Main skill gem (e.g., 'Lightning Arrow', 'Detonate Dead')
- `budget_level` (required): 'low' (<50c), 'medium' (50-500c), 'high' (500c+)
- `focus` (optional): 'offense', 'defense', or 'balanced' (default: 'balanced')

**Returns**:
- Budget breakdown and guidelines
- Recommended skill links for budget tier
- Defensive layer priorities
- Gearing strategy by slot
- Passive tree priorities
- Leveling tips and next steps

**Example**: "Create a budget Lightning Arrow Deadeye build for league start"

**Use Cases**:
- Plan league starter builds
- Create budget builds for new players
- Get comprehensive build guidance
- Understand gearing priorities for your budget

### Build Validation Tools (Works with or without Lua Bridge)

#### `validate_build`
Comprehensive build validation - checks resistances, defenses, mana, accuracy, and immunities. Provides prioritized recommendations with severity levels.

**Parameters**:
- `build_name` (required): Build to validate

**Returns**:
- Overall build score (0-10)
- Critical issues (must fix immediately)
- Warnings (should address soon)
- Recommendations (nice to have improvements)
- Actionable suggestions for each issue

**Validation Categories**:
1. **Resistances**: Fire/Cold/Lightning/Chaos resistance caps
2. **Defenses**: Life/ES pool validation with level-appropriate thresholds
3. **Mana Management**: Unreserved mana and regeneration checking
4. **Accuracy**: Hit chance validation for attack builds
5. **Immunities**: Bleed/freeze/poison immunity detection

**Example**: "Validate my Deadeye build"

**Use Cases**:
- Check build readiness before mapping
- Identify critical gaps in defenses
- Get specific suggestions for improvements
- Verify resistance caps after gear changes
- Ensure adequate mana for skills

**Smart Features**:
- Prefers Lua bridge stats (more accurate), falls back to XML parsing
- Context-aware (different thresholds for life vs ES builds, attack vs spell)
- Level-appropriate validation (league start vs endgame)
- Severity-weighted scoring

**Output Example**:
```
=== Build Validation Report ===
Overall Score: 7.0/10
Status: Build is solid but has some issues to address.

❌ Critical Issues (2):
- Fire Resistance Too Low (45% → need 75%)
- Life Pool Too Low (3450 → need 4500+)

⚠️  Warnings (2):
- No Bleed Immunity
- Low Unreserved Mana (85 mana)

💡 Recommendations (1):
- Consider Poison Immunity
```

### Build Export & Persistence Tools (Always Available)

#### `export_build`
Export a copy of a build to an XML file. Creates variants/copies from existing build files with optional notes.

**Parameters**:
- `build_name` (required): Source build filename (e.g., 'MyBuild.xml')
- `output_name` (required): Output filename (without .xml extension)
- `output_directory` (optional): Target directory (defaults to POB_DIRECTORY/.pob-mcp/exports)
- `overwrite` (optional): Allow overwriting existing file (default: false)
- `notes` (optional): Additional notes to append to build notes

**Returns**:
- Full path to exported file
- Confirmation message
- Brief build summary (class, ascendancy, level)

**Example**: "Export my Deadeye build as 'Deadeye_Variant'"

**Use Cases**:
- Create build variations before making changes
- Duplicate builds for different strategies
- Export to different locations
- Add notes to build copies

**Note**: This does NOT export from Lua bridge - use `save_tree` to apply Lua bridge modifications.

#### `save_tree`
Update only the passive tree in an existing build file. Use this to apply tree optimizations or Lua bridge modifications back to the original build.

**Parameters**:
- `build_name` (required): Target build filename to update
- `nodes` (required): Array of node IDs to allocate
- `mastery_effects` (optional): Mastery selections (object mapping node ID to effect ID)
- `backup` (optional): Create backup before modifying (default: true)

**Returns**:
- Confirmation message
- Backup file path (if created)
- Summary of changes (nodes added/removed)

**Example**: "Save these nodes to my Deadeye build: [1234, 5678, 9012]"

**Use Cases**:
- Apply tree optimizations to existing builds
- Update passive tree without touching gear/gems
- Quick tree modifications
- Persist Lua bridge tree changes to files

#### `snapshot_build`
Create a versioned snapshot of a build for easy rollback. Snapshots are stored separately with metadata tracking stats and changes.

**Parameters**:
- `build_name` (required): Build to snapshot
- `description` (optional): Description of this snapshot
- `tag` (optional): User-friendly tag (e.g., 'before-respec', 'league-start')

**Returns**:
- Snapshot ID (timestamp-based)
- Snapshot filename and storage location
- Instructions for restoration

**Example**: "Create a snapshot of my build before tree respec"

**Use Cases**:
- Save build state before major changes
- Track build progression over time
- Easy rollback if changes don't work out
- Build history management

**Snapshot Format**:
```
.pob-mcp/snapshots/BuildName.xml/
  2025-01-15_143052_before-respec.xml
  2025-01-15_143052_metadata.json
```

#### `list_snapshots`
List all snapshots for a build with metadata and stats.

**Parameters**:
- `build_name` (required): Build to list snapshots for
- `limit` (optional): Maximum number of snapshots to return
- `tag_filter` (optional): Filter by tag

**Returns**:
- Array of snapshots with timestamps, tags, and descriptions
- Stat snapshots (life, DPS, allocated nodes)
- Total snapshot count and disk space used

**Example**: "Show me all snapshots for my Deadeye build"

**Use Cases**:
- Review build history
- Find specific snapshots by tag
- Monitor disk space usage
- Track stat progression

#### `restore_snapshot`
Restore a build from a snapshot. Optionally creates a backup of current state before restoring.

**Parameters**:
- `build_name` (required): Build to restore
- `snapshot_id` (required): Snapshot ID (timestamp) or tag to restore from
- `backup_current` (optional): Create snapshot of current state before restore (default: true)

**Returns**:
- Confirmation message
- Backup snapshot ID (if created)
- Summary of restored build

**Example**: "Restore my build from the 'before-respec' snapshot"

**Use Cases**:
- Rollback unwanted changes
- Compare different build versions
- Restore to known-good state
- A/B testing different strategies

**Safety Features**:
- Automatic backup before restoration
- Validation of snapshot file
- Build cache invalidation after restore

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

**Current Version**: 1.0.0 - All Core Features Complete ✅

### Implemented Features

**Phase 1: XML Analysis** ✅
- Build listing, analysis, and comparison
- Stat extraction from XML
- File watching with automatic cache invalidation
- 8 XML-based tools

**Phase 2: Passive Tree Parsing** ✅
- Node allocation extraction
- Jewel socket identification
- Tree metadata parsing
- Support for all tree versions

**Phase 3: Lua Bridge Integration** ✅
- High-fidelity stat calculation using PoB's calculation engine
- Tree modification with live recalculation
- What-if analysis for node changes
- Tree comparison between builds
- Build planning assistance
- 3 tree planning tools

**Phase 4: Item & Skill Management** ✅
- Item addition from PoE text format
- Equipment viewing and management
- Flask activation control
- Skill setup inspection and configuration
- Main skill selection
- Complete build modification workflow
- 5 item & skill tools

**Phase 5: Automated Testing** ⏸️
- Deferred for future development

**Phase 6: Build Optimization** ✅
- AI-powered intelligent node recommendations (`suggest_optimal_nodes`)
- Full tree optimizer with add/remove capability (`optimize_tree`)
- Defensive analysis with prioritized recommendations (`analyze_defenses`)
- Pathfinding to target nodes with Dijkstra's algorithm (`find_path_to_node`)
- Nearby node discovery with reachability checking (`get_nearby_nodes`)
- Direct node allocation with stat calculations (`allocate_nodes`)
- Item upgrade recommendations (`analyze_items`)
- Skill link optimization (`optimize_skill_links`)
- Budget build creation from requirements (`create_budget_build`)
- 8 optimization tools

**Phase 7: Build Validation** ✅
- Comprehensive build validation (`validate_build`)
- Resistance, defense, mana, accuracy, and immunity checking
- Severity-based issue classification (critical/warning/info)
- Overall build health scoring (0-10)
- Actionable recommendations with specific suggestions
- Works with Lua bridge (accurate) or XML fallback
- 1 validation tool

**Phase 8: Build Export & Persistence** ✅
- Export builds to XML files (`export_build`)
- Update passive tree without affecting gear/skills (`save_tree`)
- Create versioned snapshots with metadata (`snapshot_build`)
- View snapshot history with stats (`list_snapshots`)
- Rollback to previous snapshots (`restore_snapshot`)
- 5 export and persistence tools

**Phase 9: Configuration & Enemy Settings** ✅
- View configuration state (`get_config`)
- Modify configuration inputs (`set_config`)
- Configure enemy parameters (`set_enemy_stats`)
- Toggle charges, buffs, and conditions
- Test DPS against different enemy types
- Before/after impact analysis
- 3 configuration tools

**Total Available Tools**: 39 tools across 7 categories

### Technical Achievements

**Lua Bridge Enhancements**:
- Implemented `NewFileSearch`, `Inflate`, `Deflate`, `GetScriptPath` for headless mode
- Full support for split timeless jewel data files (`.part0` through `.part4`)
- Robust JSON response parsing with non-JSON output filtering
- Comprehensive debug logging system

**Passive Tree Parsing**:
- Advanced brace-counting algorithm for nested Lua table structures
- Accurate extraction of node connections (`out` and `in` arrays)
- Full support for 3,800+ node passive tree data

**Pathfinding & Graph Algorithms**:
- Dijkstra's algorithm for shortest path calculations
- BFS with reachability validation for node discovery
- Efficient distance calculations across entire passive tree graph
- Optimized performance for real-time recommendations

### Future Enhancements

**Phase 7: Advanced Tree Analysis**
- Multi-path comparison showing alternative routes
- Jewel socket optimization and placement recommendations
- Cluster jewel integration and analysis

**Phase 8: Build Export & Persistence**
- Export modified builds to XML files
- Save optimized trees back to PoB directory
- Build version management and snapshots
- Rollback and comparison history

**Later Enhancements**
- Item crafting simulation (fossil/essence/harvest)
- Gem level/quality modification tools
- Configuration templates (bandit, pantheon, enemy presets)
- Build template library and sharing
- PoE Wiki integration for detailed tooltips
- Trade site integration for real-time upgrade recommendations
- Automated testing suite (Phase 5)

## Contributing

Feel free to submit issues or pull requests!

## License

MIT
