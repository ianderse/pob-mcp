import type { PoBLuaApiClient } from "../pobLuaBridge.js";
import { noteIgnoredError } from '../utils/errorHandling.js';
import { isEquippableGearSlot, isGearSlotVisible } from '../itemAnalyzer.js';
import type { BuildIssue } from "../types.js";
import { wrapHandler } from "../utils/errorHandling.js";

interface BuildGoalsHandlerContext {
  getLuaClient: () => PoBLuaApiClient | null;
  ensureLuaClient: () => Promise<void>;
}

const ISSUES_FIELDS = [
  'Life', 'LifeUnreserved', 'EnergyShield', 'Mana', 'ManaUnreserved',
  'FireResist', 'ColdResist', 'LightningResist', 'ChaosResist',
  'FireResistOverCap', 'ColdResistOverCap', 'LightningResistOverCap',
  'SpellSuppressionChance', 'EffectiveSpellSuppressionChance',
  // DPS fields needed by handleGetPassiveUpgrades for baseDPS scoring
  'TotalDPS', 'CombinedDPS', 'MinionTotalDPS',
  // EHP field needed by handleGetPassiveUpgrades for baseEHP scoring
  'TotalEHP',
];

export async function handleGetBuildIssues(context: BuildGoalsHandlerContext) {
  return wrapHandler('get build issues', async () => {
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
    // Get build level for tiered severity
    let buildLevel = 1;
    try {
      const buildInfo = await luaClient.getBuildInfo();
      buildLevel = buildInfo?.level ?? 1;
    } catch (e) { noteIgnoredError('build level lookup (issues checked against level 1)', e); }

    if (buildLevel >= 80 && chaos < -20) {
      issues.push({ severity: 'error', category: 'resistance', message: `Chaos resist is ${chaos}% at level ${buildLevel} — critically low for endgame. Aim for at least 0%, ideally 20%+.` });
    } else if (buildLevel >= 70 && chaos < -30) {
      issues.push({ severity: 'error', category: 'resistance', message: `Chaos resist is ${chaos}% at level ${buildLevel} — dangerously low for maps. Aim for at least -20%.` });
    } else if (chaos < 0) {
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

    // Spell suppression (only flag if build has any invested; use effective value for cap check)
    const supp = (stats.EffectiveSpellSuppressionChance as number) ?? (stats.SpellSuppressionChance as number) ?? 0;
    if (supp > 0 && supp < 100) {
      issues.push({ severity: 'info', category: 'defence', message: `Spell suppression ${supp}% — not capped at 100%` });
    }

    // Zero DPS check
    const totalDPS = (stats.TotalDPS as number) ?? 0;
    const combinedDPS = (stats.CombinedDPS as number) ?? 0;
    const minionDPS = (stats.MinionTotalDPS as number) ?? 0;
    if (totalDPS === 0 && combinedDPS === 0 && minionDPS === 0) {
      issues.push({ severity: 'error', category: 'gems', message: 'Build does 0 DPS — no main skill selected, gems not linked, or skill not dealing damage. Check skill setup.' });
    }

    // Unspent passive points check
    try {
      const tree = await luaClient.getTree();
      if (tree?.nodes && buildLevel > 1) {
        const totalAllocated = tree.nodes.length;
        const ascNodes = tree.ascendancyPointsUsed ?? 0;
        // Subtract: 1 class start + ascendancy start (if ascendancy allocated) + ascendancy nodes
        const regularNodes = totalAllocated - 1 - (ascNodes > 0 ? 1 : 0) - ascNodes;
        // Expected passive points: (level - 1) from leveling + quest rewards
        // Quest rewards: ~24 total by end of Act 10 (level ~68+), scale roughly before that
        const questPoints = buildLevel >= 68 ? 24 : Math.min(24, Math.floor(buildLevel / 3));
        const expectedPoints = (buildLevel - 1) + questPoints;
        const unspent = expectedPoints - regularNodes;
        if (unspent >= 15) {
          issues.push({ severity: 'error', category: 'defence', message: `~${unspent} passive points appear unspent (${regularNodes} regular nodes allocated, ~${expectedPoints} expected at level ${buildLevel}). Allocate remaining points.` });
        } else if (unspent >= 5) {
          issues.push({ severity: 'warning', category: 'defence', message: `~${unspent} passive points appear unspent (${regularNodes} regular nodes allocated, ~${expectedPoints} expected at level ${buildLevel}).` });
        }
      }
    } catch (e) { noteIgnoredError("tree check is best-effort", e); }

    // Unequipped items & jewels check
    try {
      const items = await luaClient.getItems();
      if (Array.isArray(items)) {
        // Find jewel slots that are empty (id === 0)
        const jewelSlots = items.filter(it => it.slot && /jewel/i.test(it.slot));
        const emptyJewelSlots = jewelSlots.filter(it => !it.id || it.id === 0);
        if (emptyJewelSlots.length > 0) {
          issues.push({
            severity: 'warning',
            category: 'items',
            message: `${emptyJewelSlots.length} jewel socket(s) empty: ${emptyJewelSlots.map((j) => j.slot).join(', ')}. Jewels provide significant stats.`,
          });
        }

        // Check for unequipped gear slots. The engine's own slot output is
        // the truth (this picks up Ring 3/Grafts on current PoB versions);
        // empty flasks have their own check below and jewel sockets are
        // covered by the emptyJewelSlots check, so both are excluded here.
        // shown=false means PoB hides the slot for this build (not an empty).
        for (const it of items) {
          if ((it.id ?? 0) !== 0) continue;
          if (!it.slot || !isEquippableGearSlot(it.slot)) continue;
          if (!isGearSlotVisible(it.slot, { shown: it.shown })) continue;
          if (/flask/i.test(it.slot)) continue;
          issues.push({
            severity: 'warning',
            category: 'items',
            message: `${it.slot} slot is empty — equip an item for more stats.`,
          });
        }

        // Check for empty flask slots
        const flaskSlots = items.filter(it => it.slot && /flask/i.test(it.slot));
        const emptyFlasks = flaskSlots.filter(it => !it.id || it.id === 0);
        if (emptyFlasks.length > 0) {
          issues.push({
            severity: emptyFlasks.length >= 3 ? 'error' : 'warning',
            category: 'items',
            message: `${emptyFlasks.length}/5 flask slot(s) empty. Flasks are a major source of defense and offense.`,
          });
        }
      }
    } catch (e) { noteIgnoredError("items check is best-effort", e); }

    // Gem coherence check - detect mixed damage scaling
    try {
      const skillsData = await luaClient.getSkills();
      if (skillsData?.groups) {
        for (const group of skillsData.groups) {
          if (!group.enabled || !group.gems || group.gems.length < 2) continue;
          const gems = group.gems.filter(g => g.enabled);
          const supports = gems.filter(g => g.isSupport);
          if (supports.length < 2) continue;

          const supportNames = supports.map(g => (g.name || '').toLowerCase());

          // Check for Brutality + elemental/chaos supports (direct conflict)
          const hasBrutality = supportNames.some((n) => n.includes('brutality'));
          if (hasBrutality) {
            const eleOrChaos = supportNames.filter((n) =>
              n.includes('elemental') || n.includes('fire') || n.includes('cold') ||
              n.includes('lightning') || n.includes('chaos') || n.includes('void manipulation') ||
              n.includes('added fire') || n.includes('added cold') || n.includes('added lightning')
            );
            if (eleOrChaos.length > 0) {
              issues.push({
                severity: 'error',
                category: 'gems',
                message: `Skill group "${group.label || `#${group.index}`}": Brutality prevents all elemental/chaos damage, but has ${eleOrChaos.join(', ')} — these supports do nothing.`,
              });
            }
          }

          // Check for Elemental Damage with Attacks + Melee Physical Damage (mixed scaling, not a hard conflict but suboptimal)
          const hasEleDmgAtk = supportNames.some((n: string) => n.includes('elemental damage with attacks'));
          const hasMeleePhys = supportNames.some((n: string) => n.includes('melee physical'));
          if (hasEleDmgAtk && hasMeleePhys) {
            issues.push({
              severity: 'info',
              category: 'gems',
              message: `Skill group "${group.label || `#${group.index}`}": Has both "Elemental Damage with Attacks" and "Melee Physical Damage" — these scale different damage types. Consider focusing on one scaling direction.`,
            });
          }
        }
      }
    } catch (e) { noteIgnoredError("gem check is best-effort", e); }

    return { issues, stats };
  });
}

export function formatIssuesResponse(issues: BuildIssue[], stats: Record<string, unknown>) {
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

  text += '=== Current Stats ===\n';
  text += `Life: ${stats.Life ?? 'N/A'}  |  ES: ${stats.EnergyShield ?? 'N/A'}  |  Mana: ${stats.Mana ?? 'N/A'}\n`;
  text += `Fire: ${stats.FireResist ?? 0}%  |  Cold: ${stats.ColdResist ?? 0}%  |  Lightning: ${stats.LightningResist ?? 0}%  |  Chaos: ${stats.ChaosResist ?? 0}%\n`;
  const dps = stats.CombinedDPS ?? stats.TotalDPS ?? 0;
  const minionDps = Number(stats.MinionTotalDPS ?? 0);
  text += `DPS: ${Number(dps).toLocaleString()}${minionDps > 0 ? `  |  Minion DPS: ${Number(minionDps).toLocaleString()}` : ''}\n`;

  return {
    content: [{ type: 'text' as const, text }],
  };
}
