import type { PoBLuaApiClient } from "../pobLuaBridge.js";
import type { BuildIssue } from "../types.js";

export interface BuildGoalsHandlerContext {
  getLuaClient: () => PoBLuaApiClient | null;
  ensureLuaClient: () => Promise<void>;
}

const ISSUES_FIELDS = [
  'Life', 'LifeUnreserved', 'EnergyShield', 'Mana', 'ManaUnreserved',
  'FireResist', 'ColdResist', 'LightningResist', 'ChaosResist',
  'FireResistOverCap', 'ColdResistOverCap', 'LightningResistOverCap',
  'SpellSuppressionChance',
  // DPS fields needed by handleGetPassiveUpgrades for baseDPS scoring
  'TotalDPS', 'CombinedDPS', 'MinionTotalDPS',
  // EHP field needed by handleGetPassiveUpgrades for baseEHP scoring
  'TotalEHP',
];

export async function handleGetBuildIssues(context: BuildGoalsHandlerContext) {
  await context.ensureLuaClient();
  const luaClient = context.getLuaClient();
  if (!luaClient) throw new Error('Lua bridge not active. Use lua_start and lua_load_build first.');

  const stats = await luaClient.getStats(ISSUES_FIELDS);
  const issues: BuildIssue[] = [];

  // Elemental resistances
  for (const r of ['Fire', 'Cold', 'Lightning'] as const) {
    const val = (stats[`${r}Resist`] as number) ?? 0;
    if (val < 0) {
      issues.push({ severity: 'error', category: 'resistance', message: `${r} resist is ${val}% (negative)` });
    } else if (val < 75) {
      issues.push({ severity: 'warning', category: 'resistance', message: `${r} resist ${val}% — ${75 - val}% short of cap` });
    }
    const over = (stats[`${r}ResistOverCap`] as number) ?? 0;
    if (over > 0) {
      issues.push({ severity: 'info', category: 'resistance', message: `${r} resist ${over}% over max cap (wasted)` });
    }
  }

  const chaos = (stats.ChaosResist as number) ?? 0;
  if (chaos < 0) {
    issues.push({ severity: 'warning', category: 'resistance', message: `Chaos resist is ${chaos}%` });
  }

  // Health pools
  const life = (stats.Life as number) ?? 0;
  const es = (stats.EnergyShield as number) ?? 0;
  if (life < 500 && es < 500) {
    issues.push({ severity: 'warning', category: 'survivability', message: `Low health pool — Life: ${life}, ES: ${es}` });
  }

  // Reservation checks
  const lifeUnreserved = (stats.LifeUnreserved as number) ?? life;
  if (lifeUnreserved <= 0) {
    issues.push({ severity: 'error', category: 'reservation', message: 'Unreserved life is 0 or negative' });
  }

  const manaUnreserved = (stats.ManaUnreserved as number) ?? 0;
  if (manaUnreserved < 0) {
    issues.push({ severity: 'error', category: 'reservation', message: `Mana over-reserved by ${Math.abs(manaUnreserved)}` });
  }

  // Spell suppression (only flag if build has any invested)
  const supp = (stats.SpellSuppressionChance as number) ?? 0;
  if (supp > 0 && supp < 100) {
    issues.push({ severity: 'info', category: 'defence', message: `Spell suppression ${supp}% — not capped at 100%` });
  }

  return { issues, stats };
}

export function formatIssuesResponse(issues: BuildIssue[], stats: Record<string, any>) {
  const errors = issues.filter(i => i.severity === 'error');
  const warnings = issues.filter(i => i.severity === 'warning');
  const infos = issues.filter(i => i.severity === 'info');

  let text = '=== Build Issues ===\n\n';

  if (issues.length === 0) {
    text += '✅ No issues found. Build looks healthy!\n';
  } else {
    if (errors.length > 0) {
      text += `**Errors (${errors.length}):**\n`;
      for (const issue of errors) {
        text += `  ❌ [${issue.category}] ${issue.message}\n`;
      }
      text += '\n';
    }
    if (warnings.length > 0) {
      text += `**Warnings (${warnings.length}):**\n`;
      for (const issue of warnings) {
        text += `  ⚠️  [${issue.category}] ${issue.message}\n`;
      }
      text += '\n';
    }
    if (infos.length > 0) {
      text += `**Info (${infos.length}):**\n`;
      for (const issue of infos) {
        text += `  ℹ️  [${issue.category}] ${issue.message}\n`;
      }
      text += '\n';
    }
  }

  text += '=== Current Defensive Stats ===\n';
  text += `Life: ${stats.Life ?? 'N/A'}  |  ES: ${stats.EnergyShield ?? 'N/A'}  |  Mana: ${stats.Mana ?? 'N/A'}\n`;
  text += `Fire: ${stats.FireResist ?? 0}%  |  Cold: ${stats.ColdResist ?? 0}%  |  Lightning: ${stats.LightningResist ?? 0}%  |  Chaos: ${stats.ChaosResist ?? 0}%\n`;

  return {
    content: [{ type: 'text' as const, text }],
  };
}
