import type { BuildService } from "../services/buildService.js";
import type { ValidationService } from "../services/validationService.js";
import type { PoBLuaApiClient } from "../pobLuaBridge.js";
import fs from "fs/promises";
import path from "path";

export interface ValidationHandlerContext {
  buildService: BuildService;
  validationService: ValidationService;
  pobDirectory?: string;
  getLuaClient?: () => PoBLuaApiClient | null;
  ensureLuaClient?: () => Promise<void>;
}

/**
 * Handle validate_build tool call
 */
export async function handleValidateBuild(
  context: ValidationHandlerContext,
  args?: { build_name?: string }
) {
  const { buildService, validationService, getLuaClient, ensureLuaClient } = context;

  let buildData;
  let luaStats;
  const buildName = args?.build_name;

  // Try to get Lua bridge stats (works for both file-loaded and in-memory builds)
  let luaFlaskImmunities: { bleed: boolean; freeze: boolean; poison: boolean; curse: boolean } | null = null;
  if (getLuaClient) {
    const luaClient = getLuaClient();
    if (luaClient) {
      try {
        // If a build name is provided and file exists, load it first
        if (buildName && context.pobDirectory) {
          try {
            const buildPath = path.join(context.pobDirectory, buildName);
            const buildXml = await fs.readFile(buildPath, 'utf-8');
            await luaClient.loadBuildXml(buildXml, buildName);
          } catch {
            // File doesn't exist — use already-loaded in-memory build
          }
        }
        luaStats = await luaClient.getStats();

        // Get flask immunities from Lua bridge (more reliable than XML slot parsing)
        try {
          const items = await (luaClient as any).getItems();
          if (Array.isArray(items)) {
            const flaskItems = items.filter((it: any) =>
              it.slot && it.slot.startsWith('Flask') && it.raw
            );
            const allFlaskText = flaskItems.map((it: any) => (it.raw || '').toLowerCase()).join(' ');
            luaFlaskImmunities = {
              bleed: allFlaskText.includes('bleed') || allFlaskText.includes('corrupted blood'),
              freeze: allFlaskText.includes('freeze') || allFlaskText.includes('chill'),
              poison: allFlaskText.includes('poison'),
              curse: allFlaskText.includes('curse'),
            };
          }
        } catch {
          // Flask immunity check via Lua unavailable — fall back to XML parsing
        }
      } catch {
        // Lua stats unavailable
      }
    }
  }

  // If build name given, also load XML for full validation
  if (buildName) {
    try {
      buildData = await buildService.readBuild(buildName);
    } catch {
      // File not found — fall back to Lua-only validation below
    }
  }

  // If no build data and no lua stats, we can't do anything useful
  if (!buildData && !luaStats) {
    throw new Error(
      buildName
        ? `Build file "${buildName}" not found and no active Lua bridge build. Use lua_save_build to save the current in-memory build first.`
        : "No build_name provided and no active Lua bridge build loaded. Provide build_name or use lua_load_build first."
    );
  }

  let formattedOutput: string;

  if (buildData) {
    // Full XML-based validation
    let flaskAnalysis = buildService.parseFlasks(buildData);
    // Override flask immunities with Lua bridge data when available (more reliable)
    if (luaFlaskImmunities && flaskAnalysis) {
      flaskAnalysis = {
        ...flaskAnalysis,
        hasBleedImmunity: luaFlaskImmunities.bleed,
        hasFreezeImmunity: luaFlaskImmunities.freeze,
        hasPoisonImmunity: luaFlaskImmunities.poison,
        hasCurseImmunity: luaFlaskImmunities.curse,
      };
    } else if (luaFlaskImmunities && !flaskAnalysis) {
      // No XML flask data but we have Lua data — construct minimal analysis
      flaskAnalysis = {
        totalFlasks: 0,
        activeFlasks: 0,
        flasks: [],
        flaskTypes: { life: 0, mana: 0, hybrid: 0, utility: 0 },
        hasBleedImmunity: luaFlaskImmunities.bleed,
        hasFreezeImmunity: luaFlaskImmunities.freeze,
        hasPoisonImmunity: luaFlaskImmunities.poison,
        hasCurseImmunity: luaFlaskImmunities.curse,
        uniqueFlasks: [],
        warnings: [],
        recommendations: [],
      };
    }
    const validation = validationService.validateBuild(buildData, flaskAnalysis, luaStats);
    formattedOutput = validationService.formatValidation(validation);
  } else {
    // Lua-stats-only validation (in-memory build, no file)
    formattedOutput = formatLuaOnlyValidation(luaStats!);
  }

  return {
    content: [
      {
        type: "text" as const,
        text: formattedOutput,
      },
    ],
  };
}

/**
 * Lightweight validation using only Lua bridge stats (no build XML available).
 */
function formatLuaOnlyValidation(stats: Record<string, any>): string {
  const lines: string[] = ['=== Build Validation (Lua Bridge Stats) ===\n'];
  const issues: string[] = [];
  const warnings: string[] = [];
  const info: string[] = [];

  const life = Number(stats.Life ?? 0);
  const fireRes = Number(stats.FireResist ?? -60);
  const coldRes = Number(stats.ColdResist ?? -60);
  const lightRes = Number(stats.LightningResist ?? -60);
  const chaosRes = Number(stats.ChaosResist ?? -60);
  const manaUnreserved = Number(stats.ManaUnreserved ?? stats.Mana ?? 0);
  const block = Number(stats.BlockChance ?? 0);
  const spellBlock = Number(stats.SpellBlockChance ?? 0);

  if (life < 3000) issues.push(`🔴 CRITICAL: Life is very low (${life}). Aim for 4000+ for endgame.`);
  else if (life < 5000) warnings.push(`🟡 WARNING: Life could be higher (${life}). Aim for 5000+.`);
  else info.push(`✅ Life: ${life}`);

  for (const [name, val] of [['Fire', fireRes], ['Cold', coldRes], ['Lightning', lightRes]] as const) {
    if (val < 75) issues.push(`🔴 CRITICAL: ${name} resist uncapped (${val}%, need 75%).`);
    else info.push(`✅ ${name} Resist: ${val}%`);
  }
  if (chaosRes < 0) warnings.push(`🟡 WARNING: Chaos resist is negative (${chaosRes}%).`);
  else info.push(`✅ Chaos Resist: ${chaosRes}%`);

  if (manaUnreserved <= 0) issues.push(`🔴 CRITICAL: No unreserved mana (${manaUnreserved}). Cannot cast skills.`);
  else if (manaUnreserved < 50) warnings.push(`🟡 WARNING: Very low unreserved mana (${manaUnreserved}).`);

  if (block < 30) info.push(`ℹ️  Block: ${block}% (consider increasing for a Guardian).`);
  else info.push(`✅ Block: ${block}%`);
  if (spellBlock < 30) info.push(`ℹ️  Spell Block: ${spellBlock}% (consider investing more).`);

  if (issues.length > 0) {
    lines.push('**Critical Issues:**');
    issues.forEach(i => lines.push(`  ${i}`));
    lines.push('');
  }
  if (warnings.length > 0) {
    lines.push('**Warnings:**');
    warnings.forEach(w => lines.push(`  ${w}`));
    lines.push('');
  }
  if (info.length > 0) {
    lines.push('**Info:**');
    info.forEach(i => lines.push(`  ${i}`));
    lines.push('');
  }

  lines.push('_Note: Full validation requires a saved build file. Use lua_save_build to enable complete validation._');
  return lines.join('\n');
}
