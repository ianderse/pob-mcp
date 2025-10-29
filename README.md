# Path of Building MCP Server

An MCP (Model Context Protocol) server that enables Claude to analyze and work with Path of Building builds.

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
- **What-If Analysis**: Preview stat changes before committing to tree modifications
- **Tree Comparison**: Compare stat differences between different passive tree allocations
- **Build Planning**: Get intelligent node recommendations for new builds
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
- Windows: `Documents/Path of Building/Builds`
- Mac/Linux: `~/Documents/Path of Building/Builds`

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
   git clone https://github.com/Dulluhan/pob-api.git
   cd pob-api
   # Note the path to the 'src' directory for POB_FORK_PATH
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

9. **Stop the bridge**:
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

#### `compare_trees`
Compare stat differences between different passive tree allocations.

**Parameters**:
- `current_nodes` (required): Array of current node IDs
- `new_nodes` (required): Array of new node IDs to compare
- `class_id` (optional): Class ID if different from current
- `ascend_class_id` (optional): Ascendancy ID if different

**Returns**:
- Current stats
- New stats
- Differences (with +/- indicators)

**Example**: "Compare my current tree with adding these defense nodes"

#### `preview_allocation`
Preview stat changes without modifying the loaded build (what-if analysis).

**Parameters**:
- `add_nodes` (optional): Array of node IDs to add
- `remove_nodes` (optional): Array of node IDs to remove
- `use_full_dps` (optional): Whether to use full DPS calculation

**Returns**:
- Base stats (current build)
- Modified stats (with changes)
- Differences

**Example**: "Preview what happens if I take Constitution and remove this STR node"

#### `plan_build`
Get intelligent passive node recommendations for a build archetype.

**Parameters**:
- `class_name` (required): Class name (e.g., "Witch", "Ranger")
- `ascendancy` (optional): Ascendancy name (e.g., "Occultist", "Deadeye")
- `focus` (required): Build focus (e.g., "Cold DoT", "crit bow", "max block")
- `level` (optional): Target level (default: 90)

**Returns**:
- Starting area suggestions
- Notable passive clusters to prioritize
- Keystone recommendations
- Pathing suggestions
- General build advice

**Example**: "Help me plan a Cold DoT Occultist build"

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
- What-if analysis (`preview_allocation`)
- Tree comparison (`compare_trees`)
- Build planning assistance (`plan_build`)

### Future Enhancements

Potential features to add:
- Item modification and crafting simulation
- Gem link optimization suggestions
- Skill selection and configuration
- Configuration profiles (bandit, pantheon, etc.)
- Budget vs premium build comparisons
- Integration with PoE Wiki for item/skill info
- Advanced tree pathing algorithms
- Export builds to different formats
- Build template library

## Contributing

Feel free to submit issues or pull requests!

## License

MIT
