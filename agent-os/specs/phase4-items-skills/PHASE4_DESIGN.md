# Phase 4: Item Modification & Skill Configuration API

## Overview

Phase 4 extends the PoB MCP server to support comprehensive item and skill manipulation, completing the build modification toolkit alongside the existing passive tree features.

## Goals

1. **Item Management**: Add, modify, remove, and equip items programmatically
2. **Skill Configuration**: Select main skill, configure skill parts, manage socket groups
3. **Flask Control**: Activate/deactivate flasks and see stat impact
4. **Configuration Options**: Set bandits, pantheons, enemy level, etc.
5. **Complete Build Manipulation**: Enable full build editing through MCP

## PoB API Fork Support

The following functions are already available in `BuildOps.lua`:

### Items
- `get_items()` - ✅ Already exposed in bridge
- `add_item_text(params)` - NEW: Add item from PoE text format
- `set_flask_active(params)` - NEW: Toggle flask activation

### Skills
- `get_skills()` - NEW: Get all skill groups and selections
- `set_main_selection(params)` - NEW: Set main skill group and active skill

### Configuration
- `get_config()` - ✅ Already exposed in bridge
- `set_config(params)` - ✅ Already exposed in bridge

## New MCP Tools Design

### 1. Item Management Tools

#### `add_item`
Add an item from PoE item text (copied from game or PoB).

**Parameters**:
- `item_text` (required): Item text in PoE format
- `slot_name` (optional): Specific slot to equip to (e.g., "Weapon 1", "Body Armour")
- `no_auto_equip` (optional): If true, don't auto-equip (just add to inventory)

**Returns**:
- Item ID
- Item name
- Slot it was equipped to

**Example**:
```
"Add this item to my build:
Rarity: Rare
Steel Blade
Corsair Sword
...item text..."
```

**PoE Item Text Format**:
```
Rarity: Rare/Unique/Magic/Normal
[Item Name]
[Base Type]
[Modifiers]
[Requirements]
[etc.]
```

#### `remove_item`
Remove an item from a specific slot.

**Parameters**:
- `slot_name` (required): Slot to clear (e.g., "Weapon 1", "Ring 1")

**Returns**:
- Success confirmation
- Stats recalculated

**Example**: "Remove my amulet and recalculate"

#### `equip_item`
Equip an item from inventory to a slot.

**Parameters**:
- `item_id` (required): ID of item in inventory
- `slot_name` (required): Slot to equip to

**Returns**:
- Success confirmation
- Updated slot info

**Example**: "Equip item 123 to Ring 2"

#### `get_equipped_items`
Get all currently equipped items (wrapper around lua_get_items with better formatting).

**Parameters**: None

**Returns**:
- List of all slots with equipped items
- Item details (name, base, rarity, mods)
- Flask activation status

**Example**: "What items do I have equipped?"

#### `toggle_flask`
Activate or deactivate a flask.

**Parameters**:
- `flask_number` (required): Flask index (1-5)
- `active` (required): true to activate, false to deactivate

**Returns**:
- Success confirmation
- Recalculated stats

**Example**: "Activate my Diamond Flask and show me the new crit chance"

### 2. Skill Configuration Tools

#### `get_skill_setup`
Get all skill groups and current selection.

**Parameters**: None

**Returns**:
- All socket groups with skills
- Main socket group selection
- Main active skill selection
- Skill part selection (for skills with parts)
- Which skills are enabled
- Which contribute to Full DPS

**Example**: "What's my skill setup?"

**Response Format**:
```json
{
  "mainSocketGroup": 1,
  "groups": [
    {
      "index": 1,
      "label": "Main 6L",
      "slot": "Body Armour",
      "enabled": true,
      "includeInFullDPS": true,
      "mainActiveSkill": 1,
      "skills": ["Lightning Arrow", "Greater Multiple Projectiles", "Elemental Damage with Attacks", ...]
    },
    ...
  ]
}
```

#### `set_main_skill`
Set which skill group and skill to use for calculations.

**Parameters**:
- `socket_group` (required): Socket group index (1-based)
- `active_skill_index` (optional): Which skill in the group (1-based)
- `skill_part` (optional): Which part of the skill (for multi-part skills)

**Returns**:
- Success confirmation
- New main skill selection
- Recalculated stats

**Example**: "Set my main skill to socket group 2"

**Use Cases**:
- Switch between main attack and secondary skill
- Compare DPS between different 6-links
- Test different skill parts (e.g., Blade Vortex hit vs DoT)

### 3. Build Configuration Tools

Already implemented in bridge:
- ✅ `lua_get_config` - Get current config
- ✅ `lua_set_config` - Set bandit, pantheon, enemy level

**Enhancement**: Create user-friendly wrapper tools

#### `set_bandit`
Set bandit quest reward.

**Parameters**:
- `bandit` (required): "Oak", "Kraityn", "Alira", or "None"

**Returns**:
- Confirmation
- Stat changes

**Example**: "What if I took Alira instead of killing all bandits?"

#### `set_pantheon`
Set pantheon choices.

**Parameters**:
- `major_god` (optional): Major pantheon choice
- `minor_god` (optional): Minor pantheon choice

**Returns**:
- Confirmation
- Stat changes

**Example**: "Set my pantheon to Soul of Solaris and Soul of Shakari"

#### `set_enemy_level`
Set the enemy level for damage calculations.

**Parameters**:
- `level` (required): Enemy level (1-100)

**Returns**:
- Confirmation
- Recalculated stats (effective DPS may change)

**Example**: "Calculate my stats against a level 85 enemy"

### 4. Build Export/Import Tools

#### `export_build`
Export current build as XML (already in bridge as `exportBuildXml`).

**Parameters**: None

**Returns**: Complete build XML

**Example**: "Export this modified build as XML"

**Use Case**: After making modifications via MCP, export to save as new build file

#### `save_modified_build`
Save current bridge state to a new build file.

**Parameters**:
- `filename` (required): Name for the new build file
- `overwrite` (optional): Whether to overwrite if exists

**Returns**:
- Success confirmation
- Path to saved file

**Example**: "Save this modified build as 'Optimized_Deadeye_v2.xml'"

## Implementation Plan

### Step 1: Extend Lua Bridge (pobLuaBridge.ts)

Add missing methods to both `PoBLuaApiClient` and `PoBLuaTcpClient`:

```typescript
// Items
async getItems(): Promise<any[]> // Already exists
async addItem(itemText: string, slotName?: string, noAutoEquip?: boolean): Promise<any>
async setFlaskActive(flaskIndex: number, active: boolean): Promise<void>

// Skills
async getSkills(): Promise<any>
async setMainSelection(params: {
  mainSocketGroup?: number;
  mainActiveSkill?: number;
  skillPart?: number;
}): Promise<void>

// Already exists:
// async getConfig()
// async setConfig(params)
// async exportBuildXml()
```

### Step 2: Add MCP Tools (index.ts)

Register new tools (when `POB_LUA_ENABLED=true`):

**Item Tools**:
- `add_item` → `bridge.addItem()`
- `toggle_flask` → `bridge.setFlaskActive()`
- `get_equipped_items` → `bridge.getItems()` (enhanced formatting)

**Skill Tools**:
- `get_skill_setup` → `bridge.getSkills()`
- `set_main_skill` → `bridge.setMainSelection()`

**Config Tools** (wrappers for better UX):
- `set_bandit` → `bridge.setConfig({ bandit })`
- `set_pantheon` → `bridge.setConfig({ pantheonMajorGod, pantheonMinorGod })`
- `set_enemy_level` → `bridge.setConfig({ enemyLevel })`

**Export Tools**:
- `export_modified_build` → `bridge.exportBuildXml()`
- `save_build` → Export XML + write to file

### Step 3: Tool Descriptions

Each tool needs:
- Clear description of purpose
- Parameter documentation
- Example prompts
- Use case explanations

### Step 4: Testing

Test each tool with:
- Valid inputs
- Invalid inputs (error handling)
- Edge cases (empty slots, missing skills)
- Stat recalculation verification
- Integration with existing tools

## User Workflows

### Workflow 1: Test Gear Upgrade
```
User: "Start the Lua bridge and load my Deadeye.xml"
Claude: [Loads build]

User: "What items do I have equipped?"
Claude: [Shows current gear]

User: "Add this bow: [item text from trade site]"
Claude: [Adds bow, recalculates]

User: "What's my new DPS?"
Claude: [Shows improved stats]

User: "Perfect! Export this as 'Deadeye_Upgraded_Bow.xml'"
```

### Workflow 2: Skill Comparison
```
User: "Load my build and show me my skill setup"
Claude: [Shows socket groups]

User: "Set my main skill to socket group 2"
Claude: [Switches to movement skill 6L]

User: "What's the DPS now?"
Claude: [Shows movement skill DPS]

User: "Switch back to group 1"
Claude: [Back to main skill]
```

### Workflow 3: Flask Optimization
```
User: "Load my build"
Claude: [Ready]

User: "Activate all my flasks and show me the stats"
Claude: [Activates flasks 1-5, shows buffed stats]

User: "What's the difference in crit chance?"
Claude: [Compares with/without flasks]

User: "Deactivate the diamond flask, try activating the quicksilver instead"
Claude: [Swaps flask activation, recalculates]
```

### Workflow 4: Configuration Testing
```
User: "Load my build"
Claude: [Ready]

User: "What if I took Alira instead of killing all bandits?"
Claude: [Sets bandit to Alira, shows stat changes]

User: "And what if I set the enemy level to 84?"
Claude: [Adjusts enemy level, shows effective DPS changes]

User: "Interesting! Revert to kill all bandits"
Claude: [Reverts configuration]
```

### Workflow 5: Complete Build Creation
```
User: "Start with my league starter template"
Claude: [Loads template]

User: "Set the tree to [optimized node list]"
Claude: [Updates tree]

User: "Add these items: [paste 10 items]"
Claude: [Adds all items]

User: "Set main skill to group 1, activate damage flasks"
Claude: [Configures skills and flasks]

User: "Show me the final stats"
Claude: [Comprehensive stat summary]

User: "Perfect! Save this as 'League_Start_Day_3.xml'"
Claude: [Exports and saves]
```

## Item Text Format Reference

### Example Rare Item
```
Rarity: Rare
Dragon Paw
Titan Gauntlets
--------
Quality: +20% (augmented)
Armour: 276 (augmented)
--------
Requirements:
Level: 69
Str: 106
--------
Sockets: R-R R-R
--------
Item Level: 86
--------
+76 to maximum Life
+45% to Fire Resistance
+43% to Cold Resistance
+32% to Lightning Resistance
```

### Example Unique Item
```
Rarity: Unique
Astramentis
Onyx Amulet
--------
Requirements:
Level: 60
--------
+16 to all Attributes
--------
+116 to all Attributes
-4 to all Attributes
```

### Example Flask
```
Rarity: Magic
Chemist's Diamond Flask of the Order
--------
Lasts 5.00 Seconds
Consumes 20 of 60 Charges on use
Currently has 0 Charges
--------
+24% to Quality
Your Critical Strike Chance is Lucky
28% reduced Charges used
Gains 6 Charges when you are Hit by an Enemy
```

## Slot Names Reference

Standard equipment slots:
- `"Weapon 1"`, `"Weapon 2"` (or `"Weapon 1 Swap"`, `"Weapon 2 Swap"`)
- `"Helmet"`
- `"Body Armour"`
- `"Gloves"`
- `"Boots"`
- `"Amulet"`
- `"Ring 1"`, `"Ring 2"`
- `"Belt"`
- `"Flask 1"`, `"Flask 2"`, `"Flask 3"`, `"Flask 4"`, `"Flask 5"`
- `"Jewel 1"`, `"Jewel 2"`, ... (depends on tree allocation)

## Success Criteria

- [ ] All item operations work (add, remove, equip)
- [ ] Flask activation/deactivation works
- [ ] Skill group selection works
- [ ] Configuration changes work (bandit, pantheon, enemy level)
- [ ] Stats recalculate correctly after each change
- [ ] Build export works
- [ ] All tools have clear documentation
- [ ] Error handling for invalid inputs
- [ ] Integration tests pass
- [ ] Real-world workflow testing successful

## Future Enhancements (Phase 5+)

- Item crafting simulation (add/remove mods)
- Gem level/quality modification
- Automatic item optimization ("find best rare ring for my build")
- Currency cost calculation
- Trade site integration (search for upgrades)
- Cluster jewel manipulation
- Skill tree + gear co-optimization
- Budget vs endgame build comparison

## Notes

- All item/skill operations should trigger stat recalculation
- Bridge maintains build state between operations
- Original XML files are never modified (only in-memory changes)
- Users must explicitly export/save to persist changes
- Error messages should guide users on correct formats
- Consider rate limiting for bulk operations
