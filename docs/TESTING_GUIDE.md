# PoB MCP Server Testing Guide

This guide provides comprehensive test cases for all features of the Path of Building MCP server, with special focus on Phase 3 features (Lua bridge integration).

## Prerequisites

### For XML-Only Features
- Path of Building Community Fork installed
- At least 2-3 test builds in your PoB directory
- MCP server configured in Claude Desktop

### For Lua Bridge Features (Phase 3)
- LuaJIT installed and in PATH (`luajit` command available)
- PoB API Fork cloned locally: https://github.com/Dulluhan/pob-api
- Environment variables configured (see Configuration section below)

## Configuration for Testing

### Basic Configuration (XML Features Only)
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

### Full Configuration (Including Lua Bridge)
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

### TCP Mode Configuration (For Testing with PoB GUI)
```json
{
  "mcpServers": {
    "pob": {
      "command": "node",
      "args": ["/absolute/path/to/pob-mcp-server/build/index.js"],
      "env": {
        "POB_DIRECTORY": "/path/to/your/Path of Building/Builds",
        "POB_LUA_ENABLED": "true",
        "POB_API_TCP": "true",
        "POB_API_TCP_HOST": "127.0.0.1",
        "POB_API_TCP_PORT": "31337"
      }
    }
  }
}
```

## Phase 1: XML-Based Features

### Test 1.1: List Builds
**Objective**: Verify build listing functionality

**Steps**:
1. Open Claude Desktop
2. Ask: "List all my Path of Building builds"

**Expected Results**:
- Returns list of all .xml files in POB_DIRECTORY
- Shows file names and subdirectories
- Response is formatted clearly

**Test Variations**:
- "Show me my PoE builds"
- "What builds do I have?"

### Test 1.2: Analyze Single Build
**Objective**: Verify comprehensive build analysis

**Steps**:
1. Ask: "Analyze my [BuildName.xml] build"
2. Review all sections of the output

**Expected Results**:
- Character class and ascendancy shown
- Level displayed
- Key stats extracted (Life, ES, DPS, resistances)
- Skills listed with support gems
- Items shown per slot
- Build notes included if present

**Test Variations**:
- Try with different build types (melee, caster, bow, minion)
- Test with builds at different levels
- Test with incomplete builds

### Test 1.3: Compare Two Builds
**Objective**: Verify side-by-side build comparison

**Steps**:
1. Ask: "Compare [Build1.xml] and [Build2.xml]"
2. Review comparison output

**Expected Results**:
- Both builds analyzed
- Key differences highlighted
- Stats compared numerically
- Class/ascendancy differences noted

**Test Variations**:
- Compare similar builds (same class, different gear)
- Compare different builds (different classes)

### Test 1.4: Get Build Stats
**Objective**: Quick stat retrieval

**Steps**:
1. Ask: "What are the stats for [BuildName.xml]?"

**Expected Results**:
- All numerical stats returned
- Formatted clearly
- No unnecessary parsing errors

### Test 1.5: File Watching
**Objective**: Real-time build change detection

**Steps**:
1. Ask: "Start watching my PoB builds"
2. Modify a build in Path of Building
3. Save the build
4. Ask: "What changed recently?"
5. Ask: "Stop watching"

**Expected Results**:
- Watch status confirms monitoring started
- Changes detected within 2 seconds
- Cache invalidated for changed builds
- Recent changes list shows modified files with timestamps
- Stop command cleanly ends monitoring

## Phase 2: Passive Tree Analysis

### Test 2.1: Node Extraction
**Objective**: Verify passive tree data extraction

**Steps**:
1. Ask: "Show me the passive tree from [BuildName.xml]"

**Expected Results**:
- All allocated node IDs listed
- Jewel slots identified
- Keystones extracted
- Tree metadata (class, ascendancy) shown

### Test 2.2: Jewel Information
**Objective**: Extract jewel data from tree

**Steps**:
1. Use a build with jewels
2. Ask: "What jewels are in [BuildName.xml]?"

**Expected Results**:
- Jewel slots identified
- Jewel names and mods listed
- Position in tree shown

## Phase 3: Lua Bridge Features

### Setup: Initialize Lua Bridge

Before testing Phase 3 features, initialize the bridge:

**Steps**:
1. Ensure `POB_LUA_ENABLED=true` in config
2. Ask: "Start the PoB Lua bridge"
3. Verify connection

**Expected Results**:
- Success message indicating stdio or TCP mode
- No errors about missing luajit or fork path

**Common Issues**:
- `ENOENT`: luajit not found in PATH → Install LuaJIT
- `Timed out waiting for response`: Fork path incorrect → Check POB_FORK_PATH
- `Module not found`: Missing PoB modules → Ensure complete fork clone

### Test 3.1: Load Build into Lua Engine
**Objective**: Load XML build for calculation

**Steps**:
1. Ensure bridge is started
2. Ask: "Load my [BuildName.xml] into the Lua bridge"

**Expected Results**:
- Build loads successfully
- Calculation engine initializes
- No parsing errors

**Test Variations**:
- Load builds with different item configurations
- Load builds with cluster jewels
- Load builds with unique items

### Test 3.2: Get Calculated Stats
**Objective**: Retrieve high-fidelity stats from PoB engine

**Steps**:
1. Load a build (Test 3.1)
2. Ask: "Get the calculated stats from the Lua bridge"

**Expected Results**:
- Comprehensive stat list returned
- Values match what PoB GUI shows
- Includes defensive, offensive, and utility stats

**Test Variations**:
- Request specific stats: "Get Life and DPS stats"
- Request all stats
- Compare with XML-parsed stats (should be more accurate)

### Test 3.3: Get Passive Tree
**Objective**: Extract tree data from loaded build

**Steps**:
1. Load a build
2. Ask: "Get the passive tree from the Lua bridge"

**Expected Results**:
- Tree version returned
- Class ID and ascendancy ID shown
- All allocated node IDs listed
- Mastery effects included
- Format matches `get_tree` Lua API

### Test 3.4: Modify Passive Tree
**Objective**: Update tree and recalculate stats

**Steps**:
1. Load a build
2. Get current tree
3. Ask: "Add nodes [65834, 65824] to the tree"
4. Get stats again

**Expected Results**:
- Tree updates successfully
- Stats recalculated
- Changes reflected in stat output
- Original XML file NOT modified

**Test Variations**:
- Add defensive nodes, verify life/ES increases
- Add damage nodes, verify DPS increases
- Add keystones, verify major stat changes

### Test 3.5: Compare Trees (Phase 3 Feature)
**Objective**: Compare stat differences between tree allocations

**Steps**:
1. Load a build
2. Get current node list
3. Ask: "Compare my current tree with adding nodes [list] and removing nodes [list]"

**Expected Results**:
- Both trees calculated
- Stat differences shown (before → after)
- Clear indication of stat gains/losses
- Formatted as readable comparison

**Test Scenarios**:

#### Scenario A: Defensive Upgrade
```
Prompt: "Compare what happens if I add Constitution node (26725) and remove a 10 STR node"
Expected: +Life increase shown, minimal other changes
```

#### Scenario B: Offensive Upgrade
```
Prompt: "Compare adding these damage nodes [list] vs current tree"
Expected: DPS increase shown, possible defensive losses
```

#### Scenario C: Keystone Test
```
Prompt: "Compare adding Resolute Technique (59859) to my tree"
Expected: Accuracy changes, crit chance zeroed, hit chance 100%
```

### Test 3.6: What-If Allocation Testing
**Objective**: Preview stat changes without persisting

**Steps**:
1. Load a build
2. Ask: "Preview allocating nodes [65834, 65824, 65826] without changing my build"
3. Review stats
4. Ask: "Get current stats" (verify build unchanged)

**Expected Results**:
- Preview shows modified stats
- Original build remains unchanged
- Can preview multiple scenarios sequentially
- No side effects on loaded build

**Test Scenarios**:

#### Scenario A: Life vs DPS Trade-off
```
Prompt: "Preview removing these damage nodes [list] and adding these life nodes [list]"
Expected: Shows life gain and DPS loss clearly
```

#### Scenario B: Resistance Capping
```
Prompt: "Preview adding these resistance nodes to cap my resists"
Expected: Shows before/after resistance values
```

#### Scenario C: Chain Multiple Previews
```
1. "Preview adding nodes [set A]"
2. "Preview adding nodes [set B]"
3. "Which preview gives more DPS?"
Expected: Can compare multiple what-if scenarios
```

### Test 3.7: Build Planning from Scratch
**Objective**: Get node recommendations for new builds

**Steps**:
1. Ask: "Help me plan a Berserker build focusing on two-handed axes and rage"
2. Review recommendations

**Expected Results**:
- Class and ascendancy identified (Marauder/Berserker)
- Starting nodes suggested
- Relevant notable clusters identified
- Path suggestions provided
- Keystones relevant to archetype recommended

**Test Scenarios**:

#### Scenario A: Spell Caster
```
Prompt: "Plan a Cold DoT Occultist build"
Expected:
- Witch/Occultist
- Cold damage clusters
- DoT multiplier nodes
- ES/life nodes
- Cursed nodes
```

#### Scenario B: Attack Build
```
Prompt: "Plan a Crit Bow Deadeye build"
Expected:
- Ranger/Deadeye
- Bow damage nodes
- Crit multiplier
- Attack speed
- Projectile nodes
```

#### Scenario C: Tanky Build
```
Prompt: "Plan a max block Gladiator"
Expected:
- Duelist/Gladiator
- Block chance nodes
- Life nodes
- Armor clusters
- Notable block nodes highlighted
```

### Test 3.8: End-to-End Integration Test
**Objective**: Test complete workflow from load to optimize

**Complete Workflow**:
1. **Start**: "Start the PoB Lua bridge"
2. **Load**: "Load my [BuildName.xml]"
3. **Analyze**: "Get the current stats"
4. **Identify**: "Show me the passive tree"
5. **Plan**: "Compare adding these defensive nodes [list]"
6. **Preview**: "Preview those changes"
7. **Compare**: "Compare that with adding offensive nodes [list] instead"
8. **Decide**: "Which option gives better EHP?"
9. **Stop**: "Stop the Lua bridge"

**Expected Results**:
- All steps complete without errors
- Stats remain consistent across calls
- Comparisons are accurate
- Clean shutdown

### Test 3.9: Error Handling
**Objective**: Verify graceful error handling

**Test Cases**:

#### Test 3.9a: Invalid Node IDs
```
Prompt: "Add node 999999999 to the tree"
Expected: Clear error message about invalid node
```

#### Test 3.9b: Lua Bridge Not Started
```
1. Ensure bridge is stopped
2. Ask: "Get stats from Lua bridge"
Expected: Error message prompting to start bridge first
```

#### Test 3.9c: Build Not Loaded
```
1. Start bridge
2. Don't load a build
3. Ask: "Get stats"
Expected: Error indicating no build loaded
```

#### Test 3.9d: Timeout Recovery
```
1. Cause a timeout (e.g., very large tree operation)
Expected:
- Timeout error message
- Process killed
- Can restart bridge with lua_start
```

### Test 3.10: TCP Mode Testing
**Objective**: Test connection to PoB GUI

**Prerequisites**:
- Windows machine with PoB GUI installed
- Environment variable `POB_API_TCP=1` set before launching PoB
- TCP server running in PoB (status bar shows "API: Listening on port 31337")

**Steps**:
1. Configure MCP server with TCP settings
2. Ask: "Start the PoB Lua bridge"
3. Verify connection to TCP server
4. Perform operations (load build, get stats, etc.)

**Expected Results**:
- Connection established to PoB GUI
- Operations work identically to stdio mode
- Can interact with build currently open in GUI

## Phase 4: Item & Skill Management Tests

### Test 4.1: Add Item
**Objective**: Verify item addition from PoE text format

**Steps**:
1. Start bridge and load a build
2. Get current DPS: "Get stats"
3. Ask: "Add this weapon: [paste item text]"
4. Get new DPS

**Item Text Example**:
```
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
+18% to Attack Speed
```

**Expected Results**:
- Item added successfully
- Item ID and name returned
- Slot identified (e.g., "Weapon 1")
- Stats recalculated
- DPS changes reflected

**Test Variations**:
- Add item without specifying slot (auto-equip)
- Add item with specific slot: "Add to Weapon 2"
- Add item with `no_auto_equip`: "Add to inventory without equipping"
- Try adding invalid item text (should error gracefully)

### Test 4.2: Get Equipped Items
**Objective**: View all equipped items

**Steps**:
1. Load a build with items
2. Ask: "What items do I have equipped?"

**Expected Results**:
- All equipment slots listed
- Empty slots shown as "(empty)"
- Item names displayed
- Base types shown
- Rarity indicated
- Flask activation status shown

**Test Variations**:
- Build with full equipment
- Build with no equipment
- Build with only partial equipment
- Build with flasks (check activation status)

### Test 4.3: Toggle Flask
**Objective**: Activate/deactivate flasks and verify stat changes

**Steps**:
1. Load a build with flasks
2. Get current crit chance
3. Ask: "Activate flask 1" (Diamond Flask)
4. Get new crit chance
5. Ask: "Deactivate flask 1"
6. Verify crit chance returns to original

**Expected Results**:
- Flask toggles successfully
- Confirmation message clear
- Stats recalculate
- Stat changes match flask effects
- Can activate multiple flasks
- Can deactivate flasks

**Test Variations**:
- Activate all 5 flasks
- Deactivate all flasks
- Toggle same flask multiple times
- Try invalid flask number (0, 6, -1) - should error
- Test with different flask types (life, mana, utility)

### Test 4.4: Get Skill Setup
**Objective**: View skill configuration

**Steps**:
1. Load a build with multiple socket groups
2. Ask: "Show me my skill setup"

**Expected Results**:
- All socket groups listed
- Main socket group indicated
- Skills within each group shown
- Group labels displayed (if present)
- Slot locations shown (e.g., "Body Armour")
- Enabled status shown
- "Contributes to Full DPS" flag shown
- Skills listed with proper names

**Test Variations**:
- Build with 1 socket group
- Build with multiple socket groups
- Build with labeled groups
- Build with disabled groups

### Test 4.5: Set Main Skill
**Objective**: Change main skill and verify DPS recalculation

**Steps**:
1. Load a build with multiple skills
2. Get skill setup to see available groups
3. Get current DPS (main skill)
4. Ask: "Set main skill to socket group 2"
5. Get new DPS (should be different skill's DPS)
6. Switch back: "Set main skill to socket group 1"

**Expected Results**:
- Main skill switches successfully
- Confirmation message shows new selection
- Stats recalculate for new skill
- DPS reflects active skill
- Can switch between groups freely

**Test Variations**:
- Switch between 3+ different skills
- Set specific active skill index within group
- Try invalid socket group number - should error
- Test with multi-part skills (set skill_part parameter)

### Test 4.6: Item + Flask Workflow
**Objective**: Test combined item and flask operations

**Complete Workflow**:
1. "Start bridge and load build"
2. "What items do I have equipped?"
3. "Get current stats"
4. "Add this weapon: [item text]"
5. "Activate diamond flask"
6. "Activate quicksilver flask"
7. "Get stats"
8. "What's the DPS increase?"

**Expected Results**:
- All operations succeed in sequence
- Stats update after each change
- Final stats reflect all modifications
- Can calculate DPS delta

### Test 4.7: Complete Build Modification
**Objective**: End-to-end build modification test

**Complete Workflow**:
1. "Start bridge"
2. "Load template build"
3. "Set tree to [node list]"
4. "Add weapon: [item]"
5. "Add body armour: [item]"
6. "Add helmet: [item]"
7. "Get skill setup"
8. "Set main skill to group 1"
9. "Activate flasks 1, 2, 3"
10. "Get final stats"

**Expected Results**:
- All modifications succeed
- Stats update progressively
- Final build reflects all changes
- No state corruption
- Can get comprehensive stats at end

### Test 4.8: Error Handling - Items
**Objective**: Verify graceful error handling for item operations

**Test Cases**:

#### Test 4.8a: Invalid Item Text
```
Prompt: "Add this item: not valid item text"
Expected: Clear error message about invalid format
```

#### Test 4.8b: Bridge Not Started
```
1. Don't start bridge
2. Ask: "Add this item: [text]"
Expected: Error prompting to start bridge first
```

#### Test 4.8c: No Build Loaded
```
1. Start bridge
2. Don't load build
3. Ask: "Get equipped items"
Expected: Error indicating no build loaded
```

#### Test 4.8d: Invalid Slot Name
```
Prompt: "Add item to InvalidSlot: [text]"
Expected: Error or warning about invalid slot
```

### Test 4.9: Error Handling - Skills & Flasks
**Objective**: Verify error handling for skill/flask operations

**Test Cases**:

#### Test 4.9a: Invalid Flask Number
```
Prompt: "Activate flask 6"
Expected: Error that flask_number must be 1-5
```

#### Test 4.9b: Invalid Socket Group
```
Prompt: "Set main skill to socket group 99"
Expected: Error about invalid socket group
```

#### Test 4.9c: Bridge Not Started
```
1. Don't start bridge
2. Ask: "Get skill setup"
Expected: Error prompting to start bridge
```

### Test 4.10: Integration with Phase 3
**Objective**: Verify Phase 4 tools work with Phase 3 features

**Complete Workflow**:
1. Start bridge, load build
2. Get baseline stats
3. Modify passive tree (Phase 3)
4. Add items (Phase 4)
5. Toggle flasks (Phase 4)
6. Preview additional tree changes (Phase 3)
7. Compare with/without flask activation
8. Set different main skill (Phase 4)
9. Compare DPS across all variations

**Expected Results**:
- Phase 3 and Phase 4 tools work together seamlessly
- Stats remain consistent
- No conflicts between tree and item modifications
- Can combine all features in single session

## Phase 6: Optimization Tests

### Test 6.1: Defensive Analysis
**Objective**: Identify defensive gaps and recommended fixes

**Steps**:
1. Start bridge and load a build with low resists/life
2. Ask: "Analyze defenses for [BuildName.xml]"

**Expected Results**:
- Summary of resistances, life/ES, mitigation, sustain
- Prioritized recommendations with actionable guidance

### Test 6.2: Suggest Optimal Nodes
**Objective**: Get ranked node recommendations for a goal

**Steps**:
1. Load a build
2. Ask: "Suggest nodes to maximize life for [BuildName.xml]"

**Expected Results**:
- Top recommendations ranked by efficiency (gain per point)
- Path nodes and target ID shown
- Projected stat improvements

### Test 6.3: Full Tree Optimization
**Objective**: Optimize allocation under constraints

**Steps**:
1. Load a build
2. Ask: "Optimize tree for balanced goals on [BuildName.xml] with minLife 4000"

**Expected Results**:
- Optimized allocation returned
- Constraints respected (e.g., min life/resists)
- Clear description of changes and outcomes

## Performance Testing

### Test P.1: Build Load Time
**Objective**: Measure load time for builds

**Steps**:
1. Load small build (< 10 items)
2. Load medium build (full gear)
3. Load large build (many cluster jewels)
4. Note timestamps

**Expected Results**:
- Small: < 500ms
- Medium: < 1s
- Large: < 2s

### Test P.2: Stat Calculation Time
**Objective**: Measure calculation overhead

**Steps**:
1. Load a build
2. Request stats 5 times in succession
3. Note timestamps

**Expected Results**:
- First call: Calculation time
- Subsequent calls: Should use cached output (< 100ms)

### Test P.3: What-If Scenarios
**Objective**: Measure preview calculation time

**Steps**:
1. Load a build
2. Test 10 different node additions (what-if)
3. Measure each

**Expected Results**:
- Each preview: < 500ms
- No memory leaks
- Consistent performance

## Integration Testing

### Test I.1: Multi-Tool Workflow
**Objective**: Test tools working together

**Workflow**:
1. List builds (XML)
2. Analyze build (XML)
3. Start Lua bridge
4. Load same build into Lua
5. Compare XML stats vs Lua stats
6. Stop bridge

**Expected Results**:
- Both XML and Lua modes work
- Stats are comparable (Lua should be more accurate)
- No conflicts between modes

### Test I.2: Build Comparison with What-If
**Objective**: Compare two builds with modifications

**Workflow**:
1. Load Build A into Lua
2. Get Build A stats
3. Compare Build A with modified tree
4. Load Build B into Lua
5. Get Build B stats
6. Compare stats between builds

**Expected Results**:
- Can switch between builds
- Stats update correctly
- Comparisons remain accurate

## Regression Testing

After any code changes, verify:

### XML Features Still Work
- [ ] list_builds
- [ ] analyze_build
- [ ] compare_builds
- [ ] get_build_stats
- [ ] File watching

### Lua Features Still Work
- [ ] lua_start
- [ ] lua_load_build
- [ ] lua_get_stats
- [ ] lua_get_tree
- [ ] lua_set_tree
- [ ] lua_stop

### Phase 3 Features Still Work
- [ ] compare_trees
- [ ] test_allocation
- [ ] plan_tree
- [ ] get_nearby_nodes
- [ ] find_path_to_node
- [ ] allocate_nodes
- [ ] get_build_xml
- [ ] refresh_tree_data

### Phase 4 Features Still Work
- [ ] add_item
- [ ] get_equipped_items
- [ ] toggle_flask
- [ ] get_skill_setup
- [ ] set_main_skill

### Phase 6 Features Still Work
- [ ] analyze_defenses
- [ ] suggest_optimal_nodes
- [ ] optimize_tree

### Build Process
- [ ] `npm run build` completes without errors
- [ ] No TypeScript errors
- [ ] No linting errors

## Troubleshooting Guide

### Issue: "luajit command not found"
**Solution**: Install LuaJIT and ensure it's in PATH
```bash
# macOS
brew install luajit

# Ubuntu
sudo apt-get install luajit

# Windows
# Download from luajit.org and add to PATH
```

### Issue: "Failed to find valid ready banner"
**Solution**: Check POB_FORK_PATH points to correct directory
- Should contain HeadlessWrapper.lua
- Should contain Modules/ directory with PoB code

### Issue: "Timed out waiting for response"
**Solution**:
- Increase POB_TIMEOUT_MS (default 10000ms)
- Verify PoB fork installation is complete
- Check if HeadlessWrapper.lua has syntax errors

### Issue: Stats don't match PoB GUI
**Solution**:
- Verify same game version
- Check configuration (bandit, pantheon, enemy level)
- Ensure PoB fork is up-to-date

### Issue: TCP connection fails
**Solution**:
- Verify PoB GUI launched with POB_API_TCP=1
- Check firewall settings
- Verify port 31337 not in use
- Try telnet 127.0.0.1 31337 to test connection

## Test Result Template

Use this template to document test results:

```markdown
## Test Run: [Date]

**Configuration**:
- POB_LUA_ENABLED: [true/false]
- Node Version: [version]
- OS: [platform]

**Phase 1 Tests**: [Pass/Fail]
- 1.1 List Builds: [result]
- 1.2 Analyze Build: [result]
- 1.3 Compare Builds: [result]
- 1.4 Get Stats: [result]
- 1.5 File Watching: [result]

**Phase 2 Tests**: [Pass/Fail]
- 2.1 Node Extraction: [result]
- 2.2 Jewel Info: [result]

**Phase 3 Tests**: [Pass/Fail]
- 3.1 Load Build: [result]
- 3.2 Get Calculated Stats: [result]
- 3.3 Get Tree: [result]
- 3.4 Modify Tree: [result]
- 3.5 Compare Trees: [result]
- 3.6 What-If Testing: [result]
- 3.7 Build Planning: [result]
- 3.8 Integration: [result]
- 3.9 Error Handling: [result]

**Phase 4 Tests**: [Pass/Fail]
- 4.1 Add Item: [result]
- 4.2 Get Equipped Items: [result]
- 4.3 Toggle Flask: [result]
- 4.4 Get Skill Setup: [result]
- 4.5 Set Main Skill: [result]
- 4.6 Item + Flask Workflow: [result]
- 4.7 Complete Build Modification: [result]
- 4.8 Error Handling (Items): [result]
- 4.9 Error Handling (Skills/Flasks): [result]
- 4.10 Integration with Phase 3: [result]

**Issues Found**:
- [List any issues]

**Notes**:
- [Additional observations]
```

## Automated Testing (Future)

Currently, all tests are manual. Future enhancements could include:

1. Unit tests for XML parsing
2. Mock PoB process for Lua bridge tests
3. Snapshot testing for stat outputs
4. Performance benchmarking suite
5. CI/CD integration

## Contributing Test Cases

When adding new features:
1. Add test cases to this guide
2. Document expected behavior
3. Include error scenarios
4. Provide test data if needed
