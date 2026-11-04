import { toFiniteNumber, type ConfigValues, type PoBLuaApiClient } from "../pobLuaBridge.js";
import { noteIgnoredError } from '../utils/errorHandling.js';
import fs from 'fs/promises';
import path from 'path';
import { wrapHandler } from "../utils/errorHandling.js";
import { atomicWriteFile } from '../utils/atomicWrite.js';
import { sanitizeBuildName } from "../utils/pathSanitizer.js";

interface ConfigHandlerContext {
  getLuaClient: () => PoBLuaApiClient | null;
  ensureLuaClient: () => Promise<void>;
}

export interface ConfigPresetContext {
  getLuaClient: () => PoBLuaApiClient | null;
  ensureLuaClient: () => Promise<void>;
  pobDirectory: string;
}

const PRESET_DIR_NAME = '.pob-mcp-presets';

async function getPresetPath(pobDirectory: string, name: string): Promise<string> {
  const dir = path.join(pobDirectory, PRESET_DIR_NAME);
  await fs.mkdir(dir, { recursive: true });
  return sanitizeBuildName(`${name}.json`, dir);
}

export async function handleSaveConfigPreset(context: ConfigPresetContext, name: string) {
  return wrapHandler('save config preset', async () => {
  await context.ensureLuaClient();
  const luaClient = context.getLuaClient();
  if (!luaClient) throw new Error('Lua bridge not active. Use lua_load_build first.');

  const config = await luaClient.getConfig();
  const filePath = await getPresetPath(context.pobDirectory, name);
  // Atomic commit: re-saving a preset must never leave a truncated file that
  // loads as a corrupt preset on the next start.
  await atomicWriteFile(filePath, JSON.stringify(config, null, 2), true);

  return {
    content: [{
      type: 'text' as const,
      text: `✅ Config preset "${name}" saved with ${Object.keys(config).length} settings.\nPath: ${filePath}`,
    }],
  };
  });
}

export async function handleLoadConfigPreset(context: ConfigPresetContext, name: string) {
  return wrapHandler('load config preset', async () => {
  await context.ensureLuaClient();
  const luaClient = context.getLuaClient();
  if (!luaClient) throw new Error('Lua bridge not active. Use lua_load_build first.');

  const filePath = await getPresetPath(context.pobDirectory, name);
  let config: Record<string, string | number | boolean>;
  let raw: string;
  try {
    raw = await fs.readFile(filePath, 'utf-8');
  } catch {
    throw new Error(`Preset "${name}" not found. Use save_config_preset to create it first.`);
  }
  try {
    config = JSON.parse(raw) as Record<string, string | number | boolean>;
  } catch {
    // Distinct from "missing": telling the user to save the preset again would
    // overwrite — i.e. destroy — the file they actually have.
    throw new Error(`Preset "${name}" exists but is not valid JSON (corrupt?). Re-save it with save_config_preset.`);
  }

  await luaClient.setConfig(config);

  return {
    content: [{
      type: 'text' as const,
      text: `✅ Config preset "${name}" loaded (${Object.keys(config).length} settings applied).`,
    }],
  };
  });
}

export async function handleListConfigPresets(context: ConfigPresetContext) {
  return wrapHandler('list config presets', async () => {
  const dir = path.join(context.pobDirectory, PRESET_DIR_NAME);
  let files: string[] = [];
  try {
    files = await fs.readdir(dir);
  } catch (e) { noteIgnoredError("dir doesn't exist yet", e); }
  const presets = files.filter(f => f.endsWith('.json')).map(f => f.replace('.json', ''));

  return {
    content: [{
      type: 'text' as const,
      text: presets.length > 0
        ? `Available config presets:\n${presets.map((p, i) => `${i + 1}. ${p}`).join('\n')}`
        : 'No config presets saved yet. Use save_config_preset to create one.',
    }],
  };
  });
}

/**
 * Handle get_config tool call
 */
export async function handleGetConfig(context: ConfigHandlerContext) {
  return wrapHandler('get config', async () => {
  await context.ensureLuaClient();
  const luaClient = context.getLuaClient();
  if (!luaClient) {
    throw new Error("Lua bridge not active. Use lua_start and lua_load_build first.");
  }

  const config = await luaClient.getConfig();
  const labels = await luaClient.getConfigLabels().catch(() => ({}));
  const formatted = formatConfigOutput(config, labels);

  return {
    content: [
      {
        type: "text" as const,
        text: formatted,
      },
    ],
  };
  });
}

/**
 * Handle set_config tool call
 */
export async function handleSetConfig(
  context: ConfigHandlerContext,
  args: { config_name: string; value: boolean | number | string }
) {
  return wrapHandler('set config', async () => {
  await context.ensureLuaClient();
  const luaClient = context.getLuaClient();
  if (!luaClient) {
    throw new Error("Lua bridge not active. Use lua_start and lua_load_build first.");
  }

  // Get current config to show before/after
  const currentConfig = await luaClient.getConfig();
  const oldValue = currentConfig[args.config_name];

  // Set new value - build params object dynamically
  const params: Record<string, string | number | boolean> = { [args.config_name]: args.value };
  const result = await luaClient.setConfig(params);

  // Get updated stats
  const newStats = await luaClient.getStats(['TotalDPS', 'CombinedDPS', 'Life', 'EnergyShield']);

  // PoB reports per-key outcomes, so say what actually happened rather than
  // assuming the write landed.
  const rejection = result?.rejected?.[args.config_name];
  const appliedValue = result?.applied?.[args.config_name];

  let output = rejection
    ? `=== Configuration NOT Updated ===\n\n`
    : `=== Configuration Updated ===\n\n`;
  output += `${args.config_name}:\n`;
  if (oldValue !== undefined) {
    output += `  Old Value: ${formatValue(oldValue)}\n`;
  }

  if (rejection) {
    output += `  Requested:  ${formatValue(args.value)}\n\n`;
    output += `❌ Rejected by Path of Building: ${rejection}.\n`;
    output += `   The build is unchanged. Call get_config to see valid options.\n\n`;
  } else {
    output += `  New Value: ${formatValue(appliedValue !== undefined ? appliedValue : args.value)}\n\n`;
  }

  if (newStats.TotalDPS != null) {
    output += `=== Current Stats ===\n`;
    output += `Total DPS: ${formatNumber(toFiniteNumber(newStats.TotalDPS) ?? 0)}\n`;
    if (newStats.Life) output += `Life: ${formatNumber(toFiniteNumber(newStats.Life) ?? 0)}\n`;
    if (newStats.EnergyShield) output += `Energy Shield: ${formatNumber(toFiniteNumber(newStats.EnergyShield) ?? 0)}\n`;
  }

  return {
    content: [
      {
        type: "text" as const,
        text: output,
      },
    ],
  };
  });
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
  return wrapHandler('set enemy stats', async () => {
  await context.ensureLuaClient();
  const luaClient = context.getLuaClient();
  if (!luaClient) {
    throw new Error("Lua bridge not active. Use lua_start and lua_load_build first.");
  }

  // Get current DPS and config before changes
  const oldStats = await luaClient.getStats(['TotalDPS', 'CombinedDPS', 'Life', 'EnergyShield']);
  let currentConfig: ConfigValues = {};
  try {
    currentConfig = await luaClient.getConfig() ?? {};
  } catch (e) { noteIgnoredError("old values unavailable — omit them from output", e); }

  // Build config update params. `paramKey` is PoB's own config option name —
  // set_config rejects anything outside its whitelist, so these must match.
  const params: Record<string, string | number | boolean> = {};
  const changesSummary: Array<{ paramKey: string; label: string; old: unknown; new: unknown }> = [];

  if (args.level !== undefined) {
    changesSummary.push({ paramKey: "enemyLevel", label: "Enemy Level", old: currentConfig.enemyLevel, new: args.level });
    params.enemyLevel = args.level;
  }
  if (args.fire_resist !== undefined) {
    changesSummary.push({ paramKey: "enemyFireResist", label: "Fire Resist", old: currentConfig.enemyFireResist, new: args.fire_resist });
    params.enemyFireResist = args.fire_resist;
  }
  if (args.cold_resist !== undefined) {
    changesSummary.push({ paramKey: "enemyColdResist", label: "Cold Resist", old: currentConfig.enemyColdResist, new: args.cold_resist });
    params.enemyColdResist = args.cold_resist;
  }
  if (args.lightning_resist !== undefined) {
    changesSummary.push({ paramKey: "enemyLightningResist", label: "Lightning Resist", old: currentConfig.enemyLightningResist, new: args.lightning_resist });
    params.enemyLightningResist = args.lightning_resist;
  }
  if (args.chaos_resist !== undefined) {
    changesSummary.push({ paramKey: "enemyChaosResist", label: "Chaos Resist", old: currentConfig.enemyChaosResist, new: args.chaos_resist });
    params.enemyChaosResist = args.chaos_resist;
  }
  if (args.armor !== undefined) {
    changesSummary.push({ paramKey: "enemyArmour", label: "Armor", old: currentConfig.enemyArmour, new: args.armor });
    params.enemyArmour = args.armor;
  }
  if (args.evasion !== undefined) {
    changesSummary.push({ paramKey: "enemyEvasion", label: "Evasion", old: currentConfig.enemyEvasion, new: args.evasion });
    params.enemyEvasion = args.evasion;
  }

  // Apply changes — PoB reports per-key outcomes; a rejected key leaves the
  // build unchanged, so the header must reflect what actually landed.
  const result = await luaClient.setConfig(params);
  const rejected = new Map(Object.entries(result?.rejected ?? {}));

  // Get updated stats
  const newStats = await luaClient.getStats(['TotalDPS', 'CombinedDPS', 'Life', 'EnergyShield']);

  // Format output
  let output = rejected.size
    ? `=== Enemy Configuration Partially/NOT Updated ===\n\n`
    : `=== Enemy Configuration Updated ===\n\n`;

  for (const change of changesSummary) {
    const suffix = change.label.includes("Resist") ? "%" : "";
    const rejection = rejected.get(change.paramKey);
    if (rejection !== undefined) {
      output += `${change.label}: ❌ rejected by Path of Building (${rejection})\n`;
    } else if (change.old != null) {
      output += `${change.label}: ${change.old}${suffix} → ${change.new}${suffix}\n`;
    } else {
      output += `${change.label}: ${change.new}${suffix}\n`;
    }
  }

  output += `\n=== DPS Update ===\n`;
  const oldDPS = toFiniteNumber(oldStats.TotalDPS) ?? 0;
  const newDPS = toFiniteNumber(newStats.TotalDPS) ?? 0;
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
  });
}

/**
 * Format configuration output
 */
function formatConfigOutput(config: ConfigValues, labels: Record<string, string> = {}): string {
  if (!config || typeof config !== 'object') {
    return "=== Configuration State ===\n\nNo configuration data available.\n";
  }

  // Dropdowns store a val that differs from what PoB shows: the bandit quest
  // stores "None" but reads "Kill all", which makes a correct setting look unset.
  const shown = (key: string, fallback = 'None') => labels[key] ?? config[key] ?? fallback;

  let output = "=== Configuration State ===\n\n";

  // Build settings
  output += "=== Build Settings ===\n";
  output += `Bandit: ${shown('bandit')}\n`;
  output += `Pantheon Major God: ${shown('pantheonMajorGod')}\n`;
  output += `Pantheon Minor God: ${shown('pantheonMinorGod')}\n`;

  // Enemy settings
  output += "\n=== Enemy Settings ===\n";
  output += `Enemy Level: ${config.enemyLevel ?? 84}\n`;
  if (config.enemyFireResist != null)      output += `Fire Resist: ${config.enemyFireResist}%\n`;
  if (config.enemyColdResist != null)      output += `Cold Resist: ${config.enemyColdResist}%\n`;
  if (config.enemyLightningResist != null) output += `Lightning Resist: ${config.enemyLightningResist}%\n`;
  if (config.enemyChaosResist != null)     output += `Chaos Resist: ${config.enemyChaosResist}%\n`;
  if (config.enemyArmour != null)          output += `Armour: ${config.enemyArmour}\n`;
  if (config.enemyIsBoss != null)          output += `Is Boss: ${config.enemyIsBoss}\n`;

  // Charges
  const chargeFields = [
    ['usePowerCharges', 'Power Charges'],
    ['useFrenzyCharges', 'Frenzy Charges'],
    ['useEnduranceCharges', 'Endurance Charges'],
    ['useSiphoningCharges', 'Siphoning Charges'],
  ] as const;
  const activeCharges = chargeFields.filter(([key]) => config[key]);
  if (activeCharges.length > 0) {
    output += "\n=== Active Charges ===\n";
    for (const [, label] of activeCharges) {
      output += `${label}: enabled\n`;
    }
  }

  // Active conditions
  const conditionFields = Object.entries(config).filter(
    ([key, val]) => key.startsWith('condition') && val === true
  );
  if (conditionFields.length > 0) {
    output += "\n=== Active Conditions ===\n";
    for (const [key] of conditionFields) {
      output += `${key.replace('condition', '')}: true\n`;
    }
  }

  // Active buffs
  const buffFields = Object.entries(config).filter(
    ([key, val]) => key.startsWith('buff') && val === true
  );
  if (buffFields.length > 0) {
    output += "\n=== Active Buffs ===\n";
    for (const [key] of buffFields) {
      output += `${key.replace('buff', '')}: true\n`;
    }
  }

  // Any remaining non-null, non-false keys not already shown
  const knownKeys = new Set([
    'bandit', 'pantheonMajorGod', 'pantheonMinorGod',
    'enemyLevel', 'enemyFireResist', 'enemyColdResist', 'enemyLightningResist',
    'enemyChaosResist', 'enemyArmour', 'enemyIsBoss',
    'usePowerCharges', 'useFrenzyCharges', 'useEnduranceCharges', 'useSiphoningCharges',
  ]);
  const extra = Object.entries(config).filter(
    ([key, val]) =>
      !knownKeys.has(key) &&
      !key.startsWith('condition') &&
      !key.startsWith('buff') &&
      val != null && val !== false
  );
  if (extra.length > 0) {
    output += "\n=== Other Settings ===\n";
    for (const [key, val] of extra) {
      output += `${key}: ${val}\n`;
    }
  }

  output += "\n💡 Use set_config to modify values  |  set_enemy_stats to adjust enemy parameters\n";

  return output;
}

/**
 * Format a value for display. Input is any JSON value read off the wire
 * (config values are boolean/number/string on the PoB side).
 */
function formatValue(value: unknown): string {
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }
  if (typeof value === 'number') {
    return formatNumber(value);
  }
  if (value === null || value === undefined) return String(value);
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/**
 * Format a number with thousands separators
 */
function formatNumber(num: number): string {
  return Math.round(num).toLocaleString();
}
