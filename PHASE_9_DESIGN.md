# Phase 9: Configuration & Enemy Settings - Design Document

## Overview

Phase 9 exposes Path of Building's configuration system through MCP tools, allowing users to test builds against different scenarios, toggle conditional buffs, and configure enemy parameters for accurate DPS calculations.

## Architecture

### Core Components

1. **Configuration Handlers** (`src/handlers/configHandlers.ts`)
   - `get_config`: View current configuration state
   - `set_config`: Modify configuration inputs
   - `set_enemy_stats`: Configure enemy parameters

2. **Lua Bridge Integration**
   - Uses existing Lua bridge `get_config` and `set_config` actions
   - Direct manipulation of build configuration via Lua API

### Design Principles

1. **Read-Then-Modify**
   - Always show current state before changes
   - Clear feedback on what was modified

2. **Scenario Testing**
   - Enable "what-if" analysis
   - Quick toggling of buffs and debuffs
   - Enemy-specific testing (bosses, map mods, etc.)

3. **Safety**
   - Non-destructive (only affects Lua bridge session)
   - Easy to reset to defaults
   - Clear documentation of what each config does

## Tool Specifications

### 1. `get_config`

**Purpose**: View current configuration state

**Parameters**: None (uses currently loaded build in Lua bridge)

**Returns**:
- Active config set name
- All configuration inputs with current values
- Charge usage settings (power/frenzy/endurance)
- Enemy settings (level, resists, armor, evasion)
- Active conditions (is the enemy frozen?, is the enemy bleeding?, etc.)

**Example Output**:
```
=== Configuration State ===

Active Config Set: Default

=== Charge Usage ===
Power Charges: Yes (3 charges)
Frenzy Charges: Yes (3 charges)
Endurance Charges: No

=== Enemy Settings ===
Enemy Level: 84
Fire Resist: 40%
Cold Resist: 40%
Lightning Resist: 40%
Chaos Resist: 20%
Armor: 20000
Evasion: 5000

=== Active Conditions ===
Is the enemy a boss?: No
Is the enemy shocked?: Yes
Is the enemy frozen?: No
Is the enemy bleeding?: Yes
Are you leeching?: Yes
Do you have Fortify?: Yes
...
```

**Use Cases**:
- Check current build assumptions
- Verify which buffs are enabled
- See what enemy you're testing against
- Understand DPS calculation context

---

### 2. `set_config`

**Purpose**: Modify configuration inputs (buffs, debuffs, conditions)

**Parameters**:
- `config_name` (required): Name of config input to change
- `value` (required): New value (boolean, number, or string depending on input type)

**Common Configuration Options**:

**Charge Usage:**
- `usePowerCharges` (boolean)
- `useFrenzyCharges` (boolean)
- `useEnduranceCharges` (boolean)
- `powerCharges` (number) - override charge count
- `frenzyCharges` (number)
- `enduranceCharges` (number)

**Buffs & Auras:**
- `buffOnslaught` (boolean)
- `conditionFortify` (boolean)
- `conditionLeeching` (boolean)
- `conditionOnFullLife` (boolean)
- `conditionOnLowLife` (boolean)
- `conditionMoving` (boolean)
- `conditionStationary` (boolean)

**Enemy Conditions:**
- `enemyIsBoss` (boolean)
- `conditionEnemyShocked` (boolean)
- `conditionEnemyFrozen` (boolean)
- `conditionEnemyBleeding` (boolean)
- `conditionEnemyIgnited` (boolean)
- `conditionEnemyPoisoned` (boolean)
- `conditionEnemyOnFullLife` (boolean)
- `conditionEnemyOnLowLife` (boolean)

**Returns**:
- Confirmation of change
- Old value → New value
- Updated stats if significant (optional)

**Examples**:
```
"Enable power charges"
→ set_config(config_name="usePowerCharges", value=true)

"Set enemy as a boss"
→ set_config(config_name="enemyIsBoss", value=true)

"Assume I have Fortify"
→ set_config(config_name="conditionFortify", value=true)
```

**Use Cases**:
- Test conditional damage bonuses
- Toggle charges on/off
- Simulate boss fights
- Test map mod scenarios
- Enable/disable buffs

---

### 3. `set_enemy_stats`

**Purpose**: Configure enemy parameters for DPS calculations

**Parameters**:
- `level` (optional): Enemy level (default: 84)
- `fire_resist` (optional): Fire resistance % (default: 40)
- `cold_resist` (optional): Cold resistance %
- `lightning_resist` (optional): Lightning resistance %
- `chaos_resist` (optional): Chaos resistance % (default: 20)
- `armor` (optional): Enemy armor value
- `evasion` (optional): Enemy evasion value
- `max_hit_taken` (optional): For ehp calculations

**Returns**:
- Summary of enemy configuration
- Previous values → New values
- Updated DPS calculations

**Preset Scenarios** (implemented via specific parameter combinations):
- **Map Boss**: level=84, resists=40/40/40/20, armor=20000
- **Shaper/Elder**: level=84, resists=40/40/40/25, armor=50000
- **Maven**: level=84, resists=50/50/50/25, armor=80000
- **Standard Rare**: level=84, resists=30/30/30/15, armor=15000
- **Low Resist**: level=84, resists=0/0/0/0 (curse effectiveness test)

**Example Output**:
```
=== Enemy Configuration Updated ===

Level: 80 → 84
Fire Resist: 40% → 50%
Cold Resist: 40% → 50%
Lightning Resist: 40% → 50%
Armor: 20000 → 80000

=== DPS Update ===
Previous DPS: 2,500,000
New DPS: 1,800,000 (-28%)

Higher enemy resists and armor significantly reduced DPS.
```

**Use Cases**:
- Test against specific boss scenarios
- Calculate DPS with penetration vs high resist enemies
- Measure armor reduction effectiveness
- Compare map boss vs pinnacle boss DPS
- Verify damage scaling

---

## Implementation Details

### Configuration State Management

The Lua bridge maintains configuration state in memory. Changes only affect the current session and don't modify the saved build file unless explicitly saved.

**Workflow**:
1. User loads build with `lua_load_build`
2. Configuration starts with build's default config set
3. User modifies config with `set_config` or `set_enemy_stats`
4. Stats automatically recalculate
5. User can save changes to tree with `save_tree` (config not saved)

### Handler Implementation

```typescript
// src/handlers/configHandlers.ts

export async function handleGetConfig(context: ConfigHandlerContext) {
  const luaClient = context.getLuaClient();
  if (!luaClient) {
    throw new Error("Lua bridge not active. Use lua_start and lua_load_build first.");
  }

  const response = await luaClient.sendRequest({
    action: "get_config",
  });

  return formatConfigOutput(response);
}

export async function handleSetConfig(
  context: ConfigHandlerContext,
  args: { config_name: string; value: boolean | number | string }
) {
  const luaClient = context.getLuaClient();
  if (!luaClient) {
    throw new Error("Lua bridge not active");
  }

  // Get current value
  const currentConfig = await luaClient.sendRequest({
    action: "get_config",
  });

  const oldValue = currentConfig[args.config_name];

  // Set new value
  await luaClient.sendRequest({
    action: "set_config",
    [args.config_name]: args.value,
  });

  // Get updated stats
  const newStats = await luaClient.sendRequest({
    action: "get_stats",
  });

  return {
    message: `Updated ${args.config_name}: ${oldValue} → ${args.value}`,
    stats: newStats,
  };
}

export async function handleSetEnemyStats(
  context: ConfigHandlerContext,
  args: {
    level?: number;
    fire_resist?: number;
    cold_resist?: number;
    lightning_resist?: number;
    chaos_resist?: number;
    armor?: number;
    evasion?: number;
  }
) {
  const luaClient = context.getLuaClient();
  if (!luaClient) {
    throw new Error("Lua bridge not active");
  }

  // Get current enemy stats
  const currentConfig = await luaClient.sendRequest({
    action: "get_config",
  });

  const changes: any = {};

  if (args.level !== undefined) {
    changes.enemyLevel = args.level;
  }
  if (args.fire_resist !== undefined) {
    changes.enemyFireResist = args.fire_resist;
  }
  if (args.cold_resist !== undefined) {
    changes.enemyColdResist = args.cold_resist;
  }
  if (args.lightning_resist !== undefined) {
    changes.enemyLightningResist = args.lightning_resist;
  }
  if (args.chaos_resist !== undefined) {
    changes.enemyChaosResist = args.chaos_resist;
  }
  if (args.armor !== undefined) {
    changes.enemyArmour = args.armor;
  }
  if (args.evasion !== undefined) {
    changes.enemyEvasion = args.evasion;
  }

  // Apply changes
  await luaClient.sendRequest({
    action: "set_config",
    ...changes,
  });

  // Get updated DPS
  const newStats = await luaClient.sendRequest({
    action: "get_stats",
  });

  return formatEnemyStatsOutput(currentConfig, changes, newStats);
}
```

### Configuration Input Types

PoB has hundreds of configuration inputs. We'll support the most common ones:

**Boolean Inputs** (true/false):
- Charge usage flags
- Buff states
- Enemy conditions
- Combat conditions

**Number Inputs**:
- Charge counts (override)
- Enemy stats (level, resists, armor, evasion)
- Multipliers (enemies hit recently, etc.)

**String Inputs** (rare):
- Skill part selection
- Minion type

### Output Formatting

```typescript
function formatConfigOutput(config: any): string {
  let output = "=== Configuration State ===\n\n";

  // Charges
  output += "=== Charge Usage ===\n";
  output += `Power Charges: ${config.usePowerCharges ? 'Yes' : 'No'}`;
  if (config.powerCharges) output += ` (${config.powerCharges} charges)`;
  output += "\n";
  // ... similar for frenzy, endurance

  // Enemy settings
  output += "\n=== Enemy Settings ===\n";
  output += `Enemy Level: ${config.enemyLevel || 84}\n`;
  output += `Fire Resist: ${config.enemyFireResist || 40}%\n`;
  // ... other resists
  output += `Armor: ${config.enemyArmour || 0}\n`;
  output += `Evasion: ${config.enemyEvasion || 0}\n`;

  // Conditions
  output += "\n=== Active Conditions ===\n";
  output += `Is the enemy a boss?: ${config.enemyIsBoss ? 'Yes' : 'No'}\n`;
  output += `Is the enemy shocked?: ${config.conditionEnemyShocked ? 'Yes' : 'No'}\n`;
  // ... other conditions

  return output;
}
```

## Integration with Existing Tools

### Workflow Examples

**Scenario 1: Boss DPS Testing**
```
User: "Load my Lightning Arrow build"
→ lua_load_build(build_name="Lightning_Arrow.xml")

User: "What's my DPS against Shaper?"
→ set_enemy_stats(level=84, fire_resist=40, cold_resist=40, lightning_resist=40, armor=50000)
→ set_config(config_name="enemyIsBoss", value=true)
→ lua_get_stats()

Result: Shows DPS vs Shaper-like enemy
```

**Scenario 2: Conditional Damage Testing**
```
User: "How much DPS do I get with all charges?"
→ set_config(config_name="usePowerCharges", value=true)
→ set_config(config_name="useFrenzyCharges", value=true)
→ lua_get_stats()

User: "Now without frenzy charges"
→ set_config(config_name="useFrenzyCharges", value=false)
→ lua_get_stats()

Shows DPS difference
```

**Scenario 3: Map Mod Testing**
```
User: "Test my fire build against +50% fire resist enemies"
→ set_enemy_stats(fire_resist=90)
→ lua_get_stats()

Shows how penetration/exposure performs against high resist
```

## Error Handling

1. **Lua Bridge Not Active**:
   ```
   Error: Lua bridge not active. Use lua_start and lua_load_build first.
   ```

2. **Invalid Config Name**:
   ```
   Error: Unknown config input 'invalidName'.
   Use get_config to see available configuration options.
   ```

3. **Invalid Value Type**:
   ```
   Error: Config 'usePowerCharges' expects boolean, got number.
   ```

4. **Out of Range**:
   ```
   Warning: Enemy resist 150% exceeds cap of 100%. Using 100%.
   ```

## Testing Strategy

1. **Unit Tests**:
   - Config name validation
   - Value type checking
   - Output formatting

2. **Integration Tests**:
   - Set config and verify stats change
   - Set enemy stats and verify DPS updates
   - Toggle charges and measure impact

3. **Manual Testing**:
   - Common scenarios (boss DPS, charges, buffs)
   - Edge cases (high resists, zero armor)
   - Verify changes don't persist after reload

## Future Enhancements

1. **Config Presets**:
   - Save/load common configurations
   - "Maven", "Shaper", "Uber Elder" presets
   - User-defined scenarios

2. **Comparative Analysis**:
   - Test multiple scenarios in one call
   - Show DPS table across different enemy configs
   - "Best case vs worst case" comparison

3. **Smart Suggestions**:
   - "Your DPS is low against high fire resist enemies - consider fire penetration"
   - "Enabling Fortify increases your EHP by 25%"

4. **Config Discovery**:
   - `list_config_options` - Browse all available configs
   - Filtered by category (buffs, enemy, charges, etc.)
   - Documentation for each config option
