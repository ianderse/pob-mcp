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

  const config = await luaClient.getConfig();
  const formatted = formatConfigOutput(config);

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

  // Get current config to show before/after
  const currentConfig = await luaClient.getConfig();
  const oldValue = currentConfig[args.config_name];

  // Set new value - build params object dynamically
  const params: Record<string, any> = {};
  params[args.config_name] = args.value;
  const newConfig = await luaClient.setConfig(params);

  // Get updated stats
  const newStats = await luaClient.getStats(['TotalDPS', 'CombinedDPS', 'Life', 'EnergyShield']);

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

  // Get current DPS before changes
  const oldStats = await luaClient.getStats(['TotalDPS', 'CombinedDPS', 'Life', 'EnergyShield']);

  // Build config update params
  const params: Record<string, any> = {};
  const changesSummary: Array<{key: string; old: any; new: any}> = [];

  if (args.level !== undefined) {
    changesSummary.push({ key: "Enemy Level", old: 84, new: args.level });
    params.enemyLevel = args.level;
  }
  if (args.fire_resist !== undefined) {
    changesSummary.push({ key: "Fire Resist", old: 40, new: args.fire_resist });
    params.enemyFireResist = args.fire_resist;
  }
  if (args.cold_resist !== undefined) {
    changesSummary.push({ key: "Cold Resist", old: 40, new: args.cold_resist });
    params.enemyColdResist = args.cold_resist;
  }
  if (args.lightning_resist !== undefined) {
    changesSummary.push({ key: "Lightning Resist", old: 40, new: args.lightning_resist });
    params.enemyLightningResist = args.lightning_resist;
  }
  if (args.chaos_resist !== undefined) {
    changesSummary.push({ key: "Chaos Resist", old: 20, new: args.chaos_resist });
    params.enemyChaosResist = args.chaos_resist;
  }
  if (args.armor !== undefined) {
    changesSummary.push({ key: "Armor", old: 0, new: args.armor });
    params.enemyArmour = args.armor;
  }
  if (args.evasion !== undefined) {
    changesSummary.push({ key: "Evasion", old: 0, new: args.evasion });
    params.enemyEvasion = args.evasion;
  }

  // Apply changes
  await luaClient.setConfig(params);

  // Get updated stats
  const newStats = await luaClient.getStats(['TotalDPS', 'CombinedDPS', 'Life', 'EnergyShield']);

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

  // Build settings
  output += "=== Build Settings ===\n";
  output += `Bandit: ${config.bandit || 'None'}\n`;
  output += `Pantheon Major God: ${config.pantheonMajorGod || 'None'}\n`;
  output += `Pantheon Minor God: ${config.pantheonMinorGod || 'None'}\n`;

  // Enemy settings
  output += "\n=== Enemy Settings ===\n";
  output += `Enemy Level: ${config.enemyLevel || 84}\n`;

  output += "\n💡 Use set_config to modify configuration values (bandit, pantheonMajorGod, pantheonMinorGod, enemyLevel)\n";
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
