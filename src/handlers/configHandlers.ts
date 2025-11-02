import type { PoBLuaApiClient, PoBLuaTcpClient } from "../pobLuaBridge.js";

export interface ConfigHandlerContext {
  getLuaClient: () => PoBLuaApiClient | PoBLuaTcpClient | null;
  ensureLuaClient: () => Promise<void>;
}

/**
 * Handle get_config tool call
 */
export async function handleGetConfig(context: ConfigHandlerContext) {
  const luaClient = context.getLuaClient();
  if (!luaClient) {
    throw new Error("Lua bridge not active. Use lua_start and lua_load_build first.");
  }

  const client = luaClient as any;
  const response = await client.sendRequest({
    action: "get_config",
  });

  const formatted = formatConfigOutput(response);

  return {
    content: [
      {
        type: "text" as const,
        text: formatted,
      },
    ],
  };
}

/**
 * Handle set_config tool call
 */
export async function handleSetConfig(
  context: ConfigHandlerContext,
  args: { config_name: string; value: boolean | number | string }
) {
  const luaClient = context.getLuaClient();
  if (!luaClient) {
    throw new Error("Lua bridge not active. Use lua_start and lua_load_build first.");
  }

  const client = luaClient as any;

  // Get current config to show before/after
  const currentConfig = await client.sendRequest({
    action: "get_config",
  });

  const oldValue = currentConfig[args.config_name];

  // Set new value
  const configUpdate: any = {
    action: "set_config",
  };
  configUpdate[args.config_name] = args.value;

  await client.sendRequest(configUpdate);

  // Get updated stats
  const newStats = await client.sendRequest({
    action: "get_stats",
  });

  // Format output
  let output = `=== Configuration Updated ===\n\n`;
  output += `${args.config_name}:\n`;
  output += `  Old Value: ${formatValue(oldValue)}\n`;
  output += `  New Value: ${formatValue(args.value)}\n\n`;

  // Show key stat changes if DPS affected
  if (newStats.TotalDPS) {
    output += `=== Current Stats ===\n`;
    output += `Total DPS: ${formatNumber(newStats.TotalDPS)}\n`;
    if (newStats.Life) output += `Life: ${formatNumber(newStats.Life)}\n`;
    if (newStats.EnergyShield) output += `Energy Shield: ${formatNumber(newStats.EnergyShield)}\n`;
  }

  return {
    content: [
      {
        type: "text" as const,
        text: output,
      },
    ],
  };
}

/**
 * Handle set_enemy_stats tool call
 */
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
    throw new Error("Lua bridge not active. Use lua_start and lua_load_build first.");
  }

  const client = luaClient as any;

  // Get current config
  const currentConfig = await client.sendRequest({
    action: "get_config",
  });

  // Get current DPS
  const oldStats = await client.sendRequest({
    action: "get_stats",
  });

  // Build config update
  const changes: any = {
    action: "set_config",
  };

  const changesSummary: Array<{key: string; old: any; new: any}> = [];

  if (args.level !== undefined) {
    changesSummary.push({
      key: "Enemy Level",
      old: currentConfig.enemyLevel || 84,
      new: args.level,
    });
    changes.enemyLevel = args.level;
  }
  if (args.fire_resist !== undefined) {
    changesSummary.push({
      key: "Fire Resist",
      old: currentConfig.enemyFireResist || 40,
      new: args.fire_resist,
    });
    changes.enemyFireResist = args.fire_resist;
  }
  if (args.cold_resist !== undefined) {
    changesSummary.push({
      key: "Cold Resist",
      old: currentConfig.enemyColdResist || 40,
      new: args.cold_resist,
    });
    changes.enemyColdResist = args.cold_resist;
  }
  if (args.lightning_resist !== undefined) {
    changesSummary.push({
      key: "Lightning Resist",
      old: currentConfig.enemyLightningResist || 40,
      new: args.lightning_resist,
    });
    changes.enemyLightningResist = args.lightning_resist;
  }
  if (args.chaos_resist !== undefined) {
    changesSummary.push({
      key: "Chaos Resist",
      old: currentConfig.enemyChaosResist || 20,
      new: args.chaos_resist,
    });
    changes.enemyChaosResist = args.chaos_resist;
  }
  if (args.armor !== undefined) {
    changesSummary.push({
      key: "Armor",
      old: currentConfig.enemyArmour || 0,
      new: args.armor,
    });
    changes.enemyArmour = args.armor;
  }
  if (args.evasion !== undefined) {
    changesSummary.push({
      key: "Evasion",
      old: currentConfig.enemyEvasion || 0,
      new: args.evasion,
    });
    changes.enemyEvasion = args.evasion;
  }

  // Apply changes
  await client.sendRequest(changes);

  // Get updated stats
  const newStats = await client.sendRequest({
    action: "get_stats",
  });

  // Format output
  let output = `=== Enemy Configuration Updated ===\n\n`;

  for (const change of changesSummary) {
    const suffix = change.key.includes("Resist") ? "%" : "";
    output += `${change.key}: ${change.old}${suffix} → ${change.new}${suffix}\n`;
  }

  output += `\n=== DPS Update ===\n`;
  const oldDPS = oldStats.TotalDPS || 0;
  const newDPS = newStats.TotalDPS || 0;
  const percentChange = oldDPS > 0 ? ((newDPS - oldDPS) / oldDPS * 100) : 0;

  output += `Previous DPS: ${formatNumber(oldDPS)}\n`;
  output += `New DPS: ${formatNumber(newDPS)}`;

  if (percentChange !== 0) {
    const sign = percentChange > 0 ? "+" : "";
    output += ` (${sign}${percentChange.toFixed(1)}%)\n`;
  } else {
    output += "\n";
  }

  // Add interpretation
  if (percentChange < -10) {
    output += `\n💡 Enemy configuration significantly reduced DPS. Consider:\n`;
    output += `   - Increasing penetration\n`;
    output += `   - Using exposure/curse\n`;
    output += `   - Checking resistance reduction effects\n`;
  } else if (percentChange > 10) {
    output += `\nDPS increased against this enemy configuration.\n`;
  }

  return {
    content: [
      {
        type: "text" as const,
        text: output,
      },
    ],
  };
}

/**
 * Format configuration output
 */
function formatConfigOutput(config: any): string {
  let output = "=== Configuration State ===\n\n";

  // Charges
  output += "=== Charge Usage ===\n";
  output += `Power Charges: ${config.usePowerCharges ? 'Yes' : 'No'}`;
  if (config.powerCharges) output += ` (${config.powerCharges} charges)`;
  output += "\n";

  output += `Frenzy Charges: ${config.useFrenzyCharges ? 'Yes' : 'No'}`;
  if (config.frenzyCharges) output += ` (${config.frenzyCharges} charges)`;
  output += "\n";

  output += `Endurance Charges: ${config.useEnduranceCharges ? 'Yes' : 'No'}`;
  if (config.enduranceCharges) output += ` (${config.enduranceCharges} charges)`;
  output += "\n";

  // Enemy settings
  output += "\n=== Enemy Settings ===\n";
  output += `Enemy Level: ${config.enemyLevel || 84}\n`;
  output += `Fire Resist: ${config.enemyFireResist || 40}%\n`;
  output += `Cold Resist: ${config.enemyColdResist || 40}%\n`;
  output += `Lightning Resist: ${config.enemyLightningResist || 40}%\n`;
  output += `Chaos Resist: ${config.enemyChaosResist || 20}%\n`;
  output += `Armor: ${formatNumber(config.enemyArmour || 0)}\n`;
  output += `Evasion: ${formatNumber(config.enemyEvasion || 0)}\n`;

  // Key conditions
  output += "\n=== Key Conditions ===\n";
  output += `Enemy is Boss: ${config.enemyIsBoss ? 'Yes' : 'No'}\n`;
  output += `Enemy is Shocked: ${config.conditionEnemyShocked ? 'Yes' : 'No'}\n`;
  output += `Enemy is Frozen: ${config.conditionEnemyFrozen ? 'Yes' : 'No'}\n`;
  output += `Enemy is Bleeding: ${config.conditionEnemyBleeding ? 'Yes' : 'No'}\n`;
  output += `Enemy is Ignited: ${config.conditionEnemyIgnited ? 'Yes' : 'No'}\n`;

  output += "\n=== Character Conditions ===\n";
  output += `Have Fortify: ${config.conditionFortify ? 'Yes' : 'No'}\n`;
  output += `Are Leeching: ${config.conditionLeeching ? 'Yes' : 'No'}\n`;
  output += `On Full Life: ${config.conditionOnFullLife ? 'Yes' : 'No'}\n`;
  output += `On Low Life: ${config.conditionOnLowLife ? 'Yes' : 'No'}\n`;
  output += `Have Onslaught: ${config.buffOnslaught ? 'Yes' : 'No'}\n`;

  output += "\n💡 Use set_config to modify any configuration value\n";
  output += "💡 Use set_enemy_stats to adjust enemy parameters\n";

  return output;
}

/**
 * Format a value for display
 */
function formatValue(value: any): string {
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }
  if (typeof value === 'number') {
    return formatNumber(value);
  }
  return String(value);
}

/**
 * Format a number with thousands separators
 */
function formatNumber(num: number): string {
  return Math.round(num).toLocaleString();
}
