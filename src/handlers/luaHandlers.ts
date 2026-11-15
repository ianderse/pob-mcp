import type { AilmentReport, BatchChange, PoBLuaApiClient } from "../pobLuaBridge.js";
import { noteIgnoredError } from '../utils/errorHandling.js';
import { handleGetBuildIssues } from "./buildGoalsHandlers.js";
import fs from "fs/promises";
import { wrapHandler } from "../utils/errorHandling.js";
import { buildFileName, resolveBuildFile } from "../utils/pathSanitizer.js";
import type { BuildService } from "../services/buildService.js";
import { computeStatWeights, type ProbeResult, type StatWeightReport, type WeightFocus } from "../services/statWeights.js";
import { parsePobShareInput, fetchPobShareCode } from "../services/pobShareFetch.js";

interface LuaHandlerContext {
  buildService?: Pick<BuildService, 'invalidateBuild'>;
  pobDirectory: string;
  luaEnabled: boolean;
  getLuaClient: () => PoBLuaApiClient | null;
  ensureLuaClient: () => Promise<void>;
  stopLuaClient: () => Promise<void>;
}

export async function handleLuaStart(context: LuaHandlerContext) {
  return wrapHandler('start Lua bridge', async () => {
    await context.ensureLuaClient();

    return {
      content: [
        {
          type: "text" as const,
          text: `PoB Lua Bridge started successfully.\n\nThe PoB calculation engine is now ready to load builds and compute stats.`,
        },
      ],
    };
  });
}

export async function handleLuaStop(context: LuaHandlerContext) {
  return wrapHandler('stop Lua bridge', async () => {
    await context.stopLuaClient();

    return {
      content: [
        {
          type: "text" as const,
          text: "PoB Lua Bridge stopped successfully.",
        },
      ],
    };
  });
}

export async function handleLuaNewBuild(context: LuaHandlerContext, className?: string, ascendancy?: string) {
  return wrapHandler('create new build', async () => {
    await context.ensureLuaClient();

    const luaClient = context.getLuaClient();
    if (!luaClient) {
      throw new Error('Lua client not initialized');
    }

    await luaClient.newBuild(className || ascendancy ? { className, ascendancy } : undefined);

    const classDesc = className ? ` (${className}${ascendancy ? `/${ascendancy}` : ''})` : '';
    return {
      content: [
        {
          type: "text" as const,
          text: `✅ New empty build created${classDesc}.`,
        },
      ],
    };
  });
}

export async function handleLuaSaveBuild(context: LuaHandlerContext, buildName: string, overwrite = false) {
  return wrapHandler('save build', async () => {
    await context.ensureLuaClient();

    const luaClient = context.getLuaClient();
    if (!luaClient) {
      throw new Error('Lua client not initialized');
    }

    if (!buildName || !buildName.trim()) {
      throw new Error('build_name is required');
    }

    const fileName = buildFileName(buildName);
    const filePath = resolveBuildFile(fileName, context.pobDirectory);
    const result = await luaClient.saveBuild(filePath, overwrite);
    context.buildService?.invalidateBuild(buildName);

    return {
      content: [
        {
          type: "text" as const,
          text: `✅ Build saved to "${fileName}" (${result?.size ?? '?'} bytes). File-based tools can now use this build.`,
        },
      ],
    };
  });
}

/**
 * Post-load summary shared by every "a build just got loaded into the Lua
 * bridge" handler: spec/item-set counts, core stats, and top issues.
 */
async function buildPostLoadSummary(context: LuaHandlerContext, luaClient: PoBLuaApiClient, name?: string): Promise<string> {
    // Check for multiple specs / item sets and inform the user (sequential — bridge is single-request)
    const extraLines: string[] = [];
    try {
      const specsResult = await luaClient.listSpecs();
      const itemSetsResult = await luaClient.listItemSets();
      if (specsResult?.specs?.length > 1) {
        extraLines.push('');
        extraLines.push(`📋 This build has ${specsResult.specs.length} passive tree specs:`);
        const maxNodes = Math.max(...specsResult.specs.map(s => s.nodeCount ?? 0));
        for (const s of specsResult.specs) {
          const isEndgame = s.nodeCount === maxNodes && !s.active ? ' ← likely endgame' : '';
          extraLines.push(`  ${s.active ? '▶' : ' '} [${s.index}] ${s.title} — ${s.className}/${s.ascendClassName}, ${s.nodeCount} nodes${isEndgame}`);
        }
        // Warn if active spec is not the one with the most nodes
        const activeSpec = specsResult.specs.find(s => s.active);
        if (activeSpec && activeSpec.nodeCount < maxNodes) {
          const endgameSpec = specsResult.specs.find(s => s.nodeCount === maxNodes);
          extraLines.push(`⚠️  Active spec is a leveling tree (${activeSpec.nodeCount} nodes). For endgame analysis, run: select_spec(${endgameSpec?.index})`);
        }
        extraLines.push('Use select_spec to switch specs.');
      }
      if (itemSetsResult?.itemSets?.length > 1) {
        extraLines.push('');
        extraLines.push(`🎒 This build has ${itemSetsResult.itemSets.length} item sets:`);
        for (const s of itemSetsResult.itemSets) {
          extraLines.push(`  ${s.active ? '▶' : ' '} [${s.id}] ${s.title}`);
        }
        extraLines.push('Use select_item_set to switch item sets.');
      }
    } catch (e) { noteIgnoredError("Non-fatal: spec/item set info is advisory only", e); }
    const extra = extraLines.length > 0 ? '\n' + extraLines.join('\n') : '';

    // Auto-context: fetch stats + top issues after successful load (sequential — bridge is single-request)
    const summaryLines: string[] = [];
    try {
      const info = await luaClient.getBuildInfo().catch(() => null);
      if (info) {
        summaryLines.push(`**${info.name || name}** | Level ${info.level} ${info.className ?? ''}${info.ascendClassName ? ` (${info.ascendClassName})` : ''}`);
      }

      // get_build_issues hands back the stats it fetched, and its field set already
      // covers this summary. Fetching them again here cost a second recalculation
      // (~24ms) over a bridge that can only serve one request at a time.
      const issuesResult = await handleGetBuildIssues(
        { getLuaClient: context.getLuaClient, ensureLuaClient: async () => {} }
      ).catch(() => null);

      const s = issuesResult?.stats ?? null;
      if (s) {
        const dps = Number(s.CombinedDPS || s.TotalDPS || s.MinionTotalDPS || 0);
        const dpsLabel = (s.MinionTotalDPS && !s.TotalDPS) ? 'Minion DPS' : 'DPS';
        summaryLines.push(`Life: ${Number(s.Life ?? 0).toLocaleString()} | ${dpsLabel}: ${Math.round(dps).toLocaleString()} | EHP: ${Number(s.TotalEHP ?? 0).toLocaleString()}`);
        summaryLines.push(`Resists: F${s.FireResist}% C${s.ColdResist}% L${s.LightningResist}% Ch${s.ChaosResist}%`);
      }

      if (issuesResult) {
        const { issues } = issuesResult;
        const topIssues = issues.filter(i => i.severity === 'error' || i.severity === 'warning').slice(0, 3);
        if (topIssues.length > 0) {
          summaryLines.push('');
          summaryLines.push('**Top Issues:**');
          for (const issue of topIssues) {
            const icon = issue.severity === 'error' ? '🔴' : '🟡';
            summaryLines.push(`  ${icon} ${issue.message}`);
          }
        } else {
          summaryLines.push('');
          summaryLines.push('✅ No critical issues detected.');
        }
      }
    } catch (e) { noteIgnoredError("auto-context is best-effort", e); }
    const summary = summaryLines.join('\n');

    return extra + (summary ? '\n---\n' + summary : '');
}

export async function handleLuaLoadBuild(
  context: LuaHandlerContext,
  buildName?: string,
  buildXml?: string,
  name?: string
) {
  return wrapHandler('load build', async () => {
    await context.ensureLuaClient();

    const luaClient = context.getLuaClient();
    if (!luaClient) {
      throw new Error('Lua client not initialized');
    }

    // If build_name is provided, read the file
    let xml = buildXml;
    let sourcePath: string | undefined;
    if (buildName) {
      const buildPath = resolveBuildFile(buildName, context.pobDirectory);
      sourcePath = buildPath;
      xml = await fs.readFile(buildPath, 'utf-8');
      // Use the build filename as the name if not specified
      if (!name) {
        name = buildName.replace(/\.xml$/i, '');
      }
    } else if (!xml) {
      throw new Error('Either build_name or build_xml must be provided');
    }

    await luaClient.loadBuildXml(xml, name, sourcePath);
    const summary = await buildPostLoadSummary(context, luaClient, name);

    return {
      content: [
        {
          type: "text" as const,
          text: `✅ Build "${name || 'MCP Build'}" loaded.${summary}`,
        },
      ],
    };
  });
}

export async function handleLuaImportCode(
  context: LuaHandlerContext,
  code: string,
  name?: string
) {
  return wrapHandler('import build code', async () => {
    await context.ensureLuaClient();

    const luaClient = context.getLuaClient();
    if (!luaClient) {
      throw new Error('Lua client not initialized');
    }

    if (!code || !code.trim()) {
      throw new Error('code is required');
    }

    await luaClient.importCode(code.trim(), name);
    const summary = await buildPostLoadSummary(context, luaClient, name);

    return {
      content: [
        {
          type: "text" as const,
          text: `✅ Build "${name || 'Imported Build'}" imported from code.${summary}\n\nUse lua_save_build to persist it to a file.`,
        },
      ],
    };
  });
}

/**
 * Fetch a build's export code from a pobb.in / poedb.tw link, then load it
 * through the same path as lua_import_code. Nothing is written to disk.
 */
export async function handleLuaImportPobb(
  context: LuaHandlerContext,
  urlOrId: string,
  name?: string
) {
  return wrapHandler('import build from share link', async () => {
    const target = parsePobShareInput(urlOrId);
    const code = await fetchPobShareCode(target);
    const result = await handleLuaImportCode(context, code, name || `${target.source} ${target.id}`);
    const first = result.content[0];
    if (first && first.type === "text") {
      first.text = `Fetched from ${target.pageUrl}\n${first.text}`;
    }
    return result;
  });
}

export async function handleLuaGetStats(context: LuaHandlerContext, category?: string) {
  return wrapHandler('get stats', async () => {
    await context.ensureLuaClient();

    const luaClient = context.getLuaClient();
    if (!luaClient) {
      throw new Error('Lua client not initialized');
    }

    // Map category to specific fields
    let fields: string[] | undefined;
    if (category === 'offense') {
      fields = [
        'TotalDPS', 'CombinedDPS', 'TotalDot', 'TotalDotDPS', 'WithBleedDPS', 'WithIgniteDPS',
        'WithPoisonDPS', 'IgniteDPS', 'BleedDPS', 'PoisonDPS', 'AverageDamage', 'AverageBurstDamage',
        'Speed', 'HitChance', 'CritChance', 'CritMultiplier', 'PreEffectiveCritChance',
        'EffectiveCritChance', 'MainHandAccuracy', 'OffHandAccuracy', 'ManaCost', 'ManaPerSecondCost',
        'LifeCost', 'LifePerSecondCost', 'ESCost', 'ESPerSecondCost', 'RageCost',
        // Minion stats (populated for summoner builds)
        'MinionTotalDPS', 'MinionCombinedDPS', 'MinionAverageDamage', 'MinionSpeed',
        'MinionLife', 'MinionArmour', 'MinionEnergyShield',
        'MinionFireResist', 'MinionColdResist', 'MinionLightningResist', 'MinionChaosResist',
      ];
    } else if (category === 'defense') {
      fields = [
        'Life', 'LifeRegen', 'LifeRegenRecovery', 'LifeLeechGainRate', 'LifeUnreserved',
        'Mana', 'ManaRegen', 'ManaRegenRecovery', 'ManaLeechGainRate', 'ManaUnreserved',
        'EnergyShield', 'EnergyShieldRegen', 'EnergyShieldRegenRecovery', 'EnergyShieldLeechGainRate',
        'Ward', 'Armour', 'Evasion', 'EvasionChance', 'PhysicalDamageReduction',
        'BlockChance', 'SpellBlockChance', 'AttackDodgeChance', 'SpellDodgeChance',
        'FireResist', 'ColdResist', 'LightningResist', 'ChaosResist',
        'FireResistOverCap', 'ColdResistOverCap', 'LightningResistOverCap', 'ChaosResistOverCap',
        'TotalEHP', 'PhysicalMaximumHitTaken', 'FireMaximumHitTaken', 'ColdMaximumHitTaken',
        'LightningMaximumHitTaken', 'ChaosMaximumHitTaken', 'EffectiveSpellSuppressionChance'
      ];
    }
    // If category is 'all' or undefined, get all stats (fields = undefined)

    const stats = await luaClient.getStats(fields);

    const textLines: string[] = ['=== PoB Calculated Stats ===', ''];

    if (stats && typeof stats === 'object') {
      // In 'all' mode filter out zero values to reduce noise; specific
      // categories keep zeros (e.g. ChaosResist 0 is meaningful)
      const isAllMode = !category || category === 'all';
      const keep = (v: unknown) =>
        v != null && (!isAllMode || (v !== 0 && v !== '0'));
      const entries = Object.entries(stats).filter(([, v]) => keep(v));

      // Group by offense/defense if showing all
      if (!category || category === 'all') {
        const offenseKeys = ['DPS', 'Damage', 'Speed', 'Crit', 'Hit', 'Accuracy', 'Cost'];
        const defenseKeys = ['Life', 'Mana', 'Energy', 'Shield', 'Resist', 'Block', 'Dodge', 'Evasion', 'Armour', 'Ward', 'EHP', 'Maximum', 'Regen', 'Leech', 'Recovery'];

        // Sort offense so DPS metrics appear first, then apply cap
        const offenseAll = entries.filter(([key]) => offenseKeys.some(ok => key.includes(ok)));
        offenseAll.sort(([keyA], [keyB]) => {
          const isDpsA = keyA.includes('TotalDPS') || keyA.includes('CombinedDPS') || keyA.includes('MinionTotalDPS') ? -1 : 0;
          const isDpsB = keyB.includes('TotalDPS') || keyB.includes('CombinedDPS') || keyB.includes('MinionTotalDPS') ? -1 : 0;
          return isDpsA - isDpsB;
        });
        const offense = offenseAll.slice(0, 15);
        const defenseAll = entries.filter(([key]) => defenseKeys.some(dk => key.includes(dk)));
        const defense = defenseAll.slice(0, 15);
        const other = entries.filter(([key]) => !offenseAll.some(([ok]) => ok === key) && !defenseAll.some(([dk]) => dk === key));

        if (offense.length > 0) {
          textLines.push('**Offense:**');
          for (const [key, value] of offense) {
            textLines.push(`${key}: ${value}`);
          }
          if (offenseAll.length > 15) {
            textLines.push(`  ... use category='offense' for full list (+${offenseAll.length - 15} more)`);
          }
          textLines.push('');
        }

        if (defense.length > 0) {
          textLines.push('**Defense:**');
          for (const [key, value] of defense) {
            textLines.push(`${key}: ${value}`);
          }
          if (defenseAll.length > 15) {
            textLines.push(`  ... use category='defense' for full list (+${defenseAll.length - 15} more)`);
          }
          textLines.push('');
        }

        if (other.length > 0 && other.length < 10) {
          textLines.push('**Other:**');
          for (const [key, value] of other) {
            textLines.push(`${key}: ${value}`);
          }
        }
      } else {
        // Just show the requested category (zeros included)
        const maxStats = 50;
        let shown = 0;
        for (const [key, value] of entries) {
          if (shown >= maxStats) break;
          textLines.push(`${key}: ${value}`);
          shown++;
        }

        if (entries.length > maxStats) {
          textLines.push('');
          textLines.push(`... and ${entries.length - maxStats} more stats`);
        }
      }
    } else {
      textLines.push('No stats available.');
    }
    const text = textLines.join('\n');

    return {
      content: [
        {
          type: "text" as const,
          text,
        },
      ],
    };
  });
}

const BATCH_HEADLINE_STATS = ['Life', 'EnergyShield', 'TotalEHP', 'CombinedDPS', 'TotalDPS', 'FullDPS', 'FireResist', 'ColdResist', 'LightningResist', 'ChaosResist'];
const BATCH_MAX_ROWS = 30;

/**
 * Apply several build edits atomically. The bridge snapshots the build, applies
 * the changes in order, and on the first failure restores the snapshot, so the
 * player's build is never left half-edited.
 */
export async function handleBatchModify(context: LuaHandlerContext, changes: BatchChange[] | undefined) {
  return wrapHandler('batch modify', async () => {
    if (!Array.isArray(changes) || changes.length === 0) {
      throw new Error('changes must be a non-empty array');
    }
    await context.ensureLuaClient();
    const luaClient = context.getLuaClient();
    if (!luaClient) {
      throw new Error('Lua client not initialized');
    }

    const { applied, delta } = await luaClient.batchModify(changes);
    const keys = Object.keys(delta);
    const headline = BATCH_HEADLINE_STATS.filter((k) => k in delta);
    const rest = keys
      .filter((k) => !headline.includes(k))
      .sort((a, b) => Math.abs(delta[b].percent ?? 0) - Math.abs(delta[a].percent ?? 0));
    const shown = [...headline, ...rest].slice(0, BATCH_MAX_ROWS);
    const rows = shown.map((k) => {
      const d = delta[k];
      const pct = d.percent === undefined ? '' : ` (${d.percent >= 0 ? '+' : ''}${d.percent.toFixed(1)}%)`;
      return `  ${k}: ${formatStat(d.before)} → ${formatStat(d.after)}${pct}`;
    });
    const lines = [
      `=== Batch applied: ${applied} change(s) ===`,
      '',
      'All changes were applied to the loaded build in memory (save_build / lua_save_build to persist).',
      '',
      keys.length === 0 ? 'No stat changed.' : `${keys.length} stat(s) changed${keys.length > shown.length ? `, showing ${shown.length}` : ''}:`,
      ...rows,
    ];
    return { content: [{ type: "text" as const, text: lines.join('\n') }] };
  });
}

/**
 * Every numeric stat the engine computed. lua_get_stats serves curated sets; this
 * is for a stat those sets never carried, so a `filter` substring keeps the
 * hundreds of keys from being dumped into the conversation when one is wanted.
 */
export async function handleExportFullStats(context: LuaHandlerContext, filter?: string) {
  return wrapHandler('export full stats', async () => {
    await context.ensureLuaClient();
    const luaClient = context.getLuaClient();
    if (!luaClient) {
      throw new Error('Lua client not initialized');
    }

    const all = await luaClient.exportFullStats();
    const needle = typeof filter === 'string' ? filter.trim().toLowerCase() : '';
    const picked: Record<string, unknown> = {};
    let total = 0;
    for (const [key, value] of Object.entries(all)) {
      if (key.startsWith('_')) {
        picked[key] = value;
        continue;
      }
      total += 1;
      if (!needle || key.toLowerCase().includes(needle)) picked[key] = value;
    }
    const shown = Object.keys(picked).filter((k) => !k.startsWith('_')).length;
    const header = needle
      ? `=== Full PoB stats matching "${needle}": ${shown} of ${total} ===`
      : `=== Full PoB stats: ${total} numeric values ===`;
    return {
      content: [{ type: "text" as const, text: `${header}\n\n${JSON.stringify(picked, null, 2)}` }],
    };
  });
}

/**
 * Timeless jewels as the engine applied them: seed, conqueror, lookup-table status
 * and every conquered passive with its post-conquest stats. The silent failure this
 * exposes is a jewel that is socketed but does nothing (no zlib in a headless engine,
 * an unallocated socket, or a table that failed to load).
 */
export async function handleLuaGetTimelessJewels(context: LuaHandlerContext, includeUnallocated = false) {
  return wrapHandler('get timeless jewels', async () => {
    await context.ensureLuaClient();
    const luaClient = context.getLuaClient();
    if (!luaClient) {
      throw new Error('Lua client not initialized');
    }

    const report = await luaClient.getTimelessJewels();
    const lines: string[] = ['=== Timeless Jewels ===', ''];

    if (!report.zlib) {
      lines.push('⚠️ This engine has no working Inflate (zlib), so NO timeless jewel can take effect.');
      lines.push('   Stats for any build with a timeless jewel are wrong until that is fixed.');
      lines.push('');
    }
    if (report.jewels.length === 0) {
      lines.push('No timeless jewels are socketed in the passive tree.');
      return { content: [{ type: "text" as const, text: lines.join('\n') }] };
    }

    for (const j of report.jewels) {
      const allocated = j.conquered.filter((n) => n.allocated);
      lines.push(`**${j.name}** in socket ${j.socketNodeId} (seed ${j.seed}, ${j.conqueror.type} #${j.conqueror.id})`);
      const problems: string[] = [];
      if (!j.socketAllocated) problems.push('socket not allocated, so the jewel has no effect');
      // PoB loads a lookup table lazily, on first use by an allocated socket, so an
      // unloaded table is only a fault once the socket is allocated.
      if (j.socketAllocated && !j.lutLoaded) problems.push('lookup table did not load, so conquered passives are vanilla');
      if (j.socketAllocated && j.conqueredCount === 0) problems.push('conquers nothing');
      for (const p of problems) lines.push(`  ⚠️ ${p}`);
      lines.push(`  Conquered passives in range: ${j.conqueredCount} (${allocated.length} allocated)`);
      const shown = includeUnallocated ? j.conquered : allocated;
      for (const n of shown) {
        const rename = n.originalName && n.originalName !== n.name ? `${n.originalName} → ${n.name}` : n.name;
        const stats = n.stats.filter((s) => s.trim() !== '').join('; ');
        lines.push(`  - [${n.nodeId}] ${rename}${n.allocated ? '' : ' (unallocated)'}: ${stats}`);
      }
      lines.push('');
    }
    return { content: [{ type: "text" as const, text: lines.join('\n') }] };
  });
}

/**
 * Validate an item text with PoB's own parser before anything is bought or
 * equipped. The item is parsed and never added to the build.
 */
export async function handleParseItem(context: LuaHandlerContext, text: string | undefined) {
  return wrapHandler('parse item', async () => {
    if (typeof text !== 'string' || text.trim() === '') {
      throw new Error('item text is required');
    }
    await context.ensureLuaClient();
    const luaClient = context.getLuaClient();
    if (!luaClient) {
      throw new Error('Lua client not initialized');
    }

    const item = await luaClient.parseItem(text);
    const lines = [`=== Parsed item: ${item.name ?? item.base} ===`, '', JSON.stringify(item, null, 2)];
    if (item.unparsed.length > 0) {
      lines.push(
        '',
        `WARNING: PoB could not turn ${item.unparsed.length} mod line(s) into modifiers, so they would calculate as nothing. Check the wording against the in-game text before relying on this item: ${item.unparsed.map((l) => JSON.stringify(l)).join(', ')}`,
      );
    }
    lines.push('', 'The loaded build is unchanged; this item was not added or equipped.');
    return { content: [{ type: "text" as const, text: lines.join('\n') }] };
  });
}

/**
 * Non-damaging ailments, showing what the DPS calculation is crediting next to
 * what the skill would actually inflict. Those two disagree for every
 * chance-based ailment, because PoB applies only guaranteed or hand-configured
 * ones, and nothing else in the tool surface makes that visible.
 */
export async function handleLuaGetAilments(context: LuaHandlerContext) {
  return wrapHandler('get ailments', async () => {
    await context.ensureLuaClient();
    const luaClient = context.getLuaClient();
    if (!luaClient) {
      throw new Error('Lua client not initialized');
    }

    const { ailments } = await luaClient.getAilments();
    const lines: string[] = ['=== Non-Damaging Ailments ===', ''];

    if (ailments.length === 0) {
      lines.push('This build inflicts no non-damaging ailments.');
      return { content: [{ type: "text" as const, text: lines.join('\n') }] };
    }

    const inflicts = (a: AilmentReport) => a.chanceOnHit + a.chanceOnCrit > 0;
    const uncredited = ailments.filter(
      (a) => !a.creditedInCalc && a.landsOnConfiguredEnemy,
    );
    // A missing calculatedEffect must not read as a healthy build. Without this
    // the row shows a real ailment chance next to 0% applied and says nothing,
    // which is the exact silent failure this tool exists to remove.
    const unreadable = ailments.filter(
      (a) => !a.creditedInCalc && a.calculatedEffect == null && inflicts(a),
    );

    for (const a of ailments) {
      lines.push(`**${a.name}**`);
      lines.push(`  Chance: ${a.chanceOnHit}% on hit, ${a.chanceOnCrit}% on crit`);
      if (a.effectMod != null) lines.push(`  Effect modifier: ${a.effectMod.toFixed(2)}x`);
      const ignoringSomethingReal = !a.creditedInCalc && a.landsOnConfiguredEnemy;
      lines.push(
        `  Applied by the calculation: ${a.appliedEffect}%` +
          (ignoringSomethingReal ? '  ← contributing nothing' : ''),
      );
      if (a.calculatedEffect != null) {
        const lands = a.landsOnConfiguredEnemy
          ? ''
          : `  (below the ${a.minimumEffect}% minimum, so it does not land)`;
        lines.push(`  Would inflict on the configured enemy: ${a.calculatedEffect}%${lands}`);
      } else if (unreadable.includes(a)) {
        lines.push('  Would inflict on the configured enemy: could not be read from the calculation');
      }
      if (a.thresholdTable?.length) {
        const cap = a.thresholdTable.find((r) => r.note === 'maximum');
        if (cap) {
          lines.push(
            `  Reaches the ${cap.effect}% maximum against an ailment threshold of ${cap.ailmentThreshold.toLocaleString()} or less`,
          );
        }
      }
      lines.push('');
    }

    // Two scope limits worth stating, because both invite a wrong reading:
    // magnitude is the main skill's alone, and it collapses as enemy life rises.
    if (ailments.some((a) => a.calculatedEffect != null)) {
      lines.push(
        'Magnitude is for your main skill against the enemy currently configured. ' +
          'Ailments from other socket groups are not included, and the value falls steeply ' +
          'as enemy life rises, so do not reuse one figure across bosses and map trash.',
      );
      lines.push('');
    }

    if (uncredited.length > 0 || unreadable.length > 0) {
      lines.push('⚠️  Not counted in your DPS');
      for (const a of uncredited) {
        lines.push(
          `  ${a.name} would land for ${a.calculatedEffect}% but the calculation is using ${a.appliedEffect}%.`,
        );
      }
      for (const a of unreadable) {
        lines.push(
          `  ${a.name} has a ${a.chanceOnHit}%/${a.chanceOnCrit}% chance to apply but the calculation is using ${a.appliedEffect}%, ` +
            'and its magnitude could not be read. Treat this build\'s damage as unverified until it is set by hand.',
        );
      }
      lines.push('');
      lines.push(
        'PoB only applies a chance-based ailment when you enter its magnitude yourself, ' +
          'so every downstream number stays understated until you do. To fix:',
      );
      for (const a of [...uncredited, ...unreadable]) {
        // PoB names these vars inconsistently per ailment, so the engine reports
        // them rather than the handler deriving them.
        const parts: string[] = [];
        if (a.enabledConfigVar && !a.enabledOnEnemy) parts.push(`${a.enabledConfigVar}: true`);
        if (a.effectConfigVar) {
          parts.push(`${a.effectConfigVar}: ${a.calculatedEffect ?? '<magnitude>'}`);
        }
        lines.push(
          parts.length > 0
            ? `  set_config ${parts.join(', ')}`
            : `  ${a.name}: no config var found for this ailment`,
        );
      }
    }

    return { content: [{ type: "text" as const, text: lines.join('\n').trimEnd() }] };
  });
}

/**
 * A compact, post-edit view of the loaded build. Requests are deliberately
 * sequential because both bridge implementations use a single stdio channel.
 */
export async function handleLuaGetBuildSnapshot(context: LuaHandlerContext) {
  return wrapHandler('get build snapshot', async () => {
    await context.ensureLuaClient();

    const luaClient = context.getLuaClient();
    if (!luaClient) {
      throw new Error('Lua client not initialized');
    }

    const info = await luaClient.getBuildInfo();
    const stats = await luaClient.getStats([
      'Life', 'EnergyShield', 'Mana', 'TotalDPS', 'CombinedDPS', 'MinionTotalDPS', 'TotalEHP',
      'FireResist', 'ColdResist', 'LightningResist', 'ChaosResist',
    ]);
    const tree = await luaClient.getTree();
    const items = await luaClient.getItems();
    const skills = await luaClient.getSkills();

    const lines: string[] = ['=== Current PoB Build Snapshot ===', ''];
    lines.push(`Build: ${info?.name || 'Unnamed'} | Level ${info?.level ?? 'Unknown'} | ${info?.className ?? 'Unknown'}${info?.ascendClassName ? ` (${info.ascendClassName})` : ''}`);
    lines.push(`Tree: ${tree?.nodes?.length ?? 0} allocated nodes | version ${tree?.treeVersion ?? info?.treeVersion ?? 'Unknown'}`);

    // _meta is a non-numeric block (strings); it must not print as a "[object Object]" stat row.
    const statEntries = Object.entries(stats || {}).filter(
      ([key, value]) => key !== '_meta' && value != null && value !== 0,
    );
    if (statEntries.length > 0) {
      lines.push('', '**Core Stats:**');
      lines.push(statEntries.map(([key, value]) => `${key}: ${value}`).join(' | '));
    }

    const equipped = (items || []).filter(item => item.id !== 0 && item.name);
    lines.push('', `**Equipped Items:** ${equipped.length}`);
    for (const item of equipped.slice(0, 12)) {
      lines.push(`- ${item.slot}: ${item.name}${item.baseName && item.baseName !== item.name ? ` (${item.baseName})` : ''}`);
    }
    if (equipped.length > 12) lines.push(`- … ${equipped.length - 12} more (use get_equipped_items for full details)`);

    const groups = Array.isArray(skills?.groups) ? skills.groups : [];
    lines.push('', `**Skills:** ${groups.length} socket group${groups.length === 1 ? '' : 's'} | Main group: ${skills?.mainSocketGroup ?? 'None'}`);
    const mainGroup = groups.find((group) => group.index === skills?.mainSocketGroup);
    if (mainGroup?.gems?.length) {
      lines.push(`Main gems: ${mainGroup.gems.map(gem => gem.name).filter(Boolean).join(', ')}`);
    }
    lines.push('Use lua_get_stats, lua_get_tree, get_equipped_items, or get_skill_setup for full detail.');

    return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
  });
}

const CLASS_NAMES: Record<number, string> = { 0:'Scion', 1:'Marauder', 2:'Ranger', 3:'Witch', 4:'Duelist', 5:'Templar', 6:'Shadow' };
const ASCENDANCY_NAMES: Record<number, Record<number, string>> = {
  0: {1:'Ascendant'},
  1: {1:'Juggernaut', 2:'Berserker', 3:'Chieftain'},
  2: {1:'Raider', 2:'Deadeye', 3:'Pathfinder'},
  3: {1:'Occultist', 2:'Elementalist', 3:'Necromancer'},
  4: {1:'Slayer', 2:'Gladiator', 3:'Champion'},
  5: {1:'Inquisitor', 2:'Hierophant', 3:'Guardian'},
  6: {1:'Assassin', 2:'Trickster', 3:'Saboteur'},
};

export async function handleLuaGetTree(context: LuaHandlerContext, includeNodeIds?: boolean) {
  return wrapHandler('get passive tree', async () => {
    await context.ensureLuaClient();

    const luaClient = context.getLuaClient();
    if (!luaClient) {
      throw new Error('Lua client not initialized');
    }

    const tree = await luaClient.getTree();

    const textLines: string[] = ['=== PoB Passive Tree ===', ''];

    if (tree && typeof tree === 'object') {
      textLines.push(`Tree Version: ${tree.treeVersion ?? 'Unknown'}`);
      const classId = tree.classId != null ? tree.classId : undefined;
      const className = classId != null ? CLASS_NAMES[classId] : undefined;
      textLines.push(`Class: ${className ?? 'Unknown'} (ID: ${classId ?? 'Unknown'})`);
      const ascId = tree.ascendClassId != null ? tree.ascendClassId : undefined;
      const ascName = classId != null && ascId != null && ascId > 0 ? ASCENDANCY_NAMES[classId]?.[ascId] : (ascId === 0 ? 'None' : undefined);
      textLines.push(`Ascendancy: ${ascName ?? 'Unknown'} (ID: ${ascId ?? 'Unknown'})`);

      if (tree.secondaryAscendClassId) {
        textLines.push(`Secondary Ascendancy ID: ${tree.secondaryAscendClassId}`);
      }

      if (tree.nodes && Array.isArray(tree.nodes)) {
        textLines.push(`\nAllocated Nodes: ${tree.nodes.length} nodes`);
        if (includeNodeIds) {
          textLines.push(`Node IDs: ${tree.nodes.join(', ')}`);
        } else {
          textLines.push(`Node IDs: [omitted — use include_node_ids=true to see full list]`);
        }
      }

      if (tree.masteryEffects && typeof tree.masteryEffects === 'object') {
        const effectCount = Object.keys(tree.masteryEffects).length;
        textLines.push(`\nMastery Effects: ${effectCount} selected`);
      }
    } else {
      textLines.push('No tree data available.');
    }
    const text = textLines.join('\n');

    return {
      content: [
        {
          type: "text" as const,
          text,
        },
      ],
    };
  });
}

export async function handleLuaSetTree(context: LuaHandlerContext, args: unknown) {
  return wrapHandler('set passive tree', async () => {
    await context.ensureLuaClient();

    const luaClient = context.getLuaClient();
    if (!luaClient) {
      throw new Error('Lua client not initialized');
    }

    const { nodes, classId: rawClassId, ascendClassId: rawAscendClassId, secondaryAscendClassId: rawSecondary, treeVersion: rawTreeVersion, masteryEffects } =
      (args ?? {}) as {
        nodes?: unknown;
        classId?: number;
        ascendClassId?: number;
        secondaryAscendClassId?: number;
        treeVersion?: string;
        masteryEffects?: Record<string, number>;
      };

    if (!Array.isArray(nodes)) {
      throw new Error('nodes must be an array');
    }

    // If classId/ascendClassId not provided, read them from current build to preserve class
    let classId = rawClassId;
    let ascendClassId = rawAscendClassId;
    let secondaryAscendClassId = rawSecondary;
    let treeVersion = rawTreeVersion;

    if (classId === undefined || ascendClassId === undefined) {
      const currentTree = await luaClient.getTree();
      classId = classId ?? (currentTree?.classId || 0);
      ascendClassId = ascendClassId ?? (currentTree?.ascendClassId || 0);
      secondaryAscendClassId = secondaryAscendClassId ?? (currentTree?.secondaryAscendClassId || 0);
      treeVersion = treeVersion ?? currentTree?.treeVersion;
    }

    // The Lua side (M.import_from_node_list) merges the build's existing
    // mastery selections underneath whatever we pass here, so an omitted
    // masteryEffects still preserves masteries already on the build.
    const tree = await luaClient.setTree({
      classId,
      ascendClassId,
      secondaryAscendClassId,
      nodes: (nodes as string[]).map(Number),
      masteryEffects,
      treeVersion,
    });

    const actualCount = (tree && Array.isArray(tree.nodes)) ? tree.nodes.length : nodes.length;
    const requested = nodes.length;
    const dropped = requested - actualCount;
    let text = `✅ Passive tree updated. Allocated ${actualCount} nodes.`;
    if (dropped > 0) {
      text += `\n⚠️  ${dropped} of ${requested} requested nodes were dropped (not connected to start or invalid IDs).`;
      text += `\nTip: Ensure the class is set correctly and nodes form a valid connected path from the starting node.`;
    }

    const ascUsed = tree?.ascendancyPointsUsed ?? 0;
    if (ascUsed > 8) {
      text += `\n🔴 ERROR: ${ascUsed} ascendancy points used (max 8). Remove ${ascUsed - 8} ascendancy node(s).`;
    }

    return {
      content: [
        {
          type: "text" as const,
          text,
        },
      ],
    };
  });
}

export async function handleLuaGetBuildInfo(context: LuaHandlerContext) {
  return wrapHandler('get build info', async () => {
    await context.ensureLuaClient();
    const luaClient = context.getLuaClient();
    if (!luaClient) throw new Error('Lua client not initialized');

    const info = await luaClient.getBuildInfo();

    if (!info) {
      return {
        content: [{ type: "text" as const, text: "No build currently loaded. Use lua_load_build or lua_new_build first." }],
      };
    }

    const text = [
      '=== Build Info ===',
      '',
      `Name: ${info.name || 'Unnamed'}`,
      `Level: ${info.level ?? 'Unknown'}`,
      `Class: ${info.className || 'Unknown'}`,
      `Ascendancy: ${info.ascendClassName || 'None'}`,
      `Tree Version: ${info.treeVersion || 'Unknown'}`,
    ].join('\n');

    return {
      content: [{ type: "text" as const, text }],
    };
  });
}

export async function handleLuaReloadBuild(context: LuaHandlerContext, buildName?: string) {
  return wrapHandler('reload build', async () => {
    await context.ensureLuaClient();
    const luaClient = context.getLuaClient();
    if (!luaClient) throw new Error('Lua client not initialized');

    let targetName: string = buildName ?? '';

    // If no name provided, get it from the currently loaded build
    if (!targetName) {
      const info = await luaClient.getBuildInfo();
      if (!info?.name) {
        throw new Error('No build is currently loaded and no build_name was provided. Use lua_load_build first.');
      }
      targetName = String(info.name);
    }

    const fileName = buildFileName(targetName);
    const buildPath = resolveBuildFile(fileName, context.pobDirectory);
    const xml = await fs.readFile(buildPath, 'utf-8');
    const name = fileName.replace(/\.xml$/i, '');
    await luaClient.loadBuildXml(xml, name, buildPath);

    return {
      content: [{ type: "text" as const, text: `✅ Build "${fileName}" reloaded from disk.` }],
    };
  });
}

export async function handleUpdateTreeDelta(context: LuaHandlerContext, addNodes?: string[], removeNodes?: string[], masteryEffects?: Record<string, number>) {
  return wrapHandler('update tree delta', async () => {
    await context.ensureLuaClient();
    const luaClient = context.getLuaClient();
    if (!luaClient) throw new Error('Lua client not initialized');

    if (!addNodes?.length && !removeNodes?.length) {
      throw new Error('At least one of add_nodes or remove_nodes must be provided.');
    }

    const params: { addNodes?: number[]; removeNodes?: number[]; masteryEffects?: Record<string, number> } = {};
    if (addNodes?.length)    params.addNodes    = addNodes.map(Number);
    if (removeNodes?.length) params.removeNodes = removeNodes.map(Number);
    if (masteryEffects && Object.keys(masteryEffects).length) params.masteryEffects = masteryEffects;

    const result = await luaClient.updateTreeDelta(params);
    const tree = result?.tree;

    const actualCount = Array.isArray(tree?.nodes) ? tree.nodes.length : '?';
    const addedCount  = addNodes?.length ?? 0;
    const removedCount = removeNodes?.length ?? 0;

    let text = `✅ Tree delta applied.\n`;
    if (addedCount)    text += `  Added: ${addedCount} node(s)\n`;
    if (removedCount)  text += `  Removed: ${removedCount} node(s)\n`;
    text += `  Total allocated: ${actualCount} nodes\n`;

    // PoB reports exactly which requested nodes it refused, so name them
    // instead of hedging about the total looking wrong.
    const dropped: number[] = result?.droppedNodes ?? [];
    if (dropped.length > 0) {
      text += `\n\n⚠️  ${dropped.length} requested node(s) were NOT allocated: ${dropped.join(', ')}.`;
      text += `\n   A node is dropped when it is not connected to your tree, when the ID is invalid,`;
      text += `\n   or when it is a Mastery node with no effect chosen — pass mastery_effects`;
      text += `\n   ({"<nodeId>": <effectId>}) to allocate a Mastery.`;
    }

    const ascUsed = tree?.ascendancyPointsUsed ?? 0;
    if (ascUsed > 8) {
      text += `\n🔴 ERROR: ${ascUsed} ascendancy points used (max 8). Remove ${ascUsed - 8} ascendancy node(s).`;
    }

    return {
      content: [{ type: "text" as const, text }],
    };
  });
}

export async function handleSearchTreeNodes(
  context: LuaHandlerContext,
  keyword: string,
  nodeType?: string,
  maxResults?: number,
  includeAllocated?: boolean
) {
  return wrapHandler('search tree nodes', async () => {
    await context.ensureLuaClient();

    const luaClient = context.getLuaClient();
    if (!luaClient) {
      throw new Error('Lua client not initialized. Use lua_start first.');
    }

    if (!keyword || String(keyword).trim().length === 0) {
      throw new Error(`keyword/query cannot be empty (received: ${JSON.stringify(keyword)})`);
    }

    // Limit results to prevent large responses
    const effectiveMaxResults = Math.min(maxResults || 20, 30); // Default 20, max 30

    // The schema and the Lua engine disagree on the undefined default unless
    // we resolve it here: Lua treats a missing includeAllocated as `~= false`
    // i.e. TRUE, which would contradict the documented default (false) and
    // pollute every default search with already-allocated nodes.
    const results = await luaClient.searchNodes({
      keyword: keyword.trim(),
      nodeType,
      maxResults: effectiveMaxResults,
      includeAllocated: includeAllocated ?? false,
    });

    const textLines: string[] = ['=== Passive Tree Node Search ===', ''];
    textLines.push(`Searching for: "${keyword}"`);
    if (nodeType) {
      textLines.push(`Node type filter: ${nodeType}`);
    }
    textLines.push('');

    if (!results.nodes || results.nodes.length === 0) {
      textLines.push('No matching nodes found.', '');
      textLines.push('Tips:');
      textLines.push('- Try a shorter or more general keyword');
      textLines.push('- Check spelling');
      textLines.push('- Remove the node type filter to see more results');
    } else {
      let countLine = `Found ${results.count} matching node${results.count === 1 ? '' : 's'}`;
      if (results.count >= effectiveMaxResults) {
        countLine += ` (showing top ${effectiveMaxResults})`;
      }
      countLine += ':';
      textLines.push(countLine, '');

      for (const node of results.nodes) {
        const allocatedTag = node.allocated ? " [ALLOCATED]" : "";
        const typeTag = node.type !== 'normal' ? ` [${node.type.toUpperCase()}]` : "";

        textLines.push(`**${node.name}**${typeTag}${allocatedTag}`);
        textLines.push(`  Node ID: ${node.id}`);

        if (node.ascendancyName) {
          textLines.push(`  Ascendancy: ${node.ascendancyName}`);
        }

        if (node.stats && node.stats.length > 0) {
          // Limit to first 3 stats to reduce response size
          const statsToShow = node.stats.slice(0, 3);
          textLines.push('  Stats:');
          for (const stat of statsToShow) {
            textLines.push(`    - ${stat}`);
          }
          if (node.stats.length > 3) {
            textLines.push(`    - ... and ${node.stats.length - 3} more`);
          }
        }

        textLines.push('');
      }
    }
    const text = textLines.join('\n');

    return {
      content: [
        {
          type: "text" as const,
          text,
        },
      ],
    };
  });
}

export async function handleCreateSpec(context: LuaHandlerContext, title?: string, copyFrom?: number, activate?: boolean) {
  return wrapHandler('create spec', async () => {
    await context.ensureLuaClient();
    const luaClient = context.getLuaClient();
    if (!luaClient) throw new Error('Lua client not initialized');
    const params: { title?: string; copyFrom?: number; activate?: boolean } = {};
    if (title != null) params.title = title;
    if (copyFrom != null) params.copyFrom = copyFrom;
    if (activate != null) params.activate = activate;
    const result = await luaClient.createSpec(params);
    if (!result || !Array.isArray(result.specs)) {
      return { content: [{ type: "text" as const, text: "Failed to create spec." }] };
    }
    const newSpec = result.specs[result.specs.length - 1];
    let text = newSpec
      ? `✅ Created new spec [${newSpec.index}] "${newSpec.title}" (${newSpec.className}/${newSpec.ascendClassName}, ${newSpec.nodeCount} nodes).`
      : `✅ Created new spec.`;
    if (newSpec?.active) text += '\nThis spec is now active.';
    text += `\n\nTotal specs: ${result.specs.length}. Use list_specs to see all, select_spec to switch.`;
    return { content: [{ type: "text" as const, text }] };
  });
}

export async function handleListSpecs(context: LuaHandlerContext) {
  return wrapHandler('list specs', async () => {
  await context.ensureLuaClient();
  const luaClient = context.getLuaClient();
  if (!luaClient) throw new Error('Lua client not initialized');
  const result = await luaClient.listSpecs();
  const specs = result?.specs ?? [];
  if (specs.length === 0) {
    return { content: [{ type: "text" as const, text: `No specs found. Load a build first.` }] };
  }
  const textLines: string[] = [`=== Passive Tree Specs (${specs.length} total) ===`, ''];
  for (const s of specs) {
    textLines.push(`${s.active ? '▶' : ' '} [${s.index}] ${s.title}`);
    textLines.push(`      Class: ${s.className || 'Unknown'} / ${s.ascendClassName || 'None'}`);
    textLines.push(`      Nodes: ${s.nodeCount}  |  Tree: ${s.treeVersion || 'Unknown'}`);
  }
  textLines.push(`\nActive: Spec ${result?.activeSpec}. Use select_spec to switch.`);
  const text = textLines.join('\n');
  return { content: [{ type: "text" as const, text }] };
  });
}

export async function handleSelectSpec(context: LuaHandlerContext, index: number) {
  return wrapHandler('select spec', async () => {
  await context.ensureLuaClient();
  const luaClient = context.getLuaClient();
  if (!luaClient) throw new Error('Lua client not initialized');
  const result = await luaClient.selectSpec(index);
  const active = result?.specs?.find(s => s.active);
  let text = `✅ Switched to Spec ${index}`;
  if (active) text += ` — ${active.title} (${active.className}/${active.ascendClassName}, ${active.nodeCount} nodes)`;
  text += `.\n\nStats have been recalculated for this spec.`;
  return { content: [{ type: "text" as const, text }] };
  });
}

export async function handleDeleteSpec(context: LuaHandlerContext, index: number) {
  return wrapHandler('delete spec', async () => {
    await context.ensureLuaClient();
    const luaClient = context.getLuaClient();
    if (!luaClient) throw new Error('Lua client not initialized');
    const result = await luaClient.deleteSpec(index);
    if (!result || !Array.isArray(result.specs)) {
      return { content: [{ type: "text" as const, text: "Failed to delete spec." }] };
    }
    let text = `✅ Deleted spec ${index}. ${result.specs.length} spec(s) remaining.`;
    text += `\n\nActive: Spec ${result.activeSpec}. Use list_specs to see all.`;
    return { content: [{ type: "text" as const, text }] };
  });
}

export async function handleRenameSpec(context: LuaHandlerContext, index: number, title: string) {
  return wrapHandler('rename spec', async () => {
    await context.ensureLuaClient();
    const luaClient = context.getLuaClient();
    if (!luaClient) throw new Error('Lua client not initialized');
    const result = await luaClient.renameSpec(index, title);
    if (!result || !Array.isArray(result.specs)) {
      return { content: [{ type: "text" as const, text: "Failed to rename spec." }] };
    }
    const renamed = result.specs.find(s => s.index === index);
    let text = `✅ Spec ${index} renamed to "${renamed?.title ?? title}".`;
    return { content: [{ type: "text" as const, text }] };
  });
}

export async function handleListItemSets(context: LuaHandlerContext) {
  return wrapHandler('list item sets', async () => {
  await context.ensureLuaClient();
  const luaClient = context.getLuaClient();
  if (!luaClient) throw new Error('Lua client not initialized');
  const result = await luaClient.listItemSets();
  const sets = result?.itemSets ?? [];
  if (sets.length === 0) {
    return { content: [{ type: "text" as const, text: "No item sets found. Load a build first." }] };
  }
  const textLines: string[] = [`=== Item Sets (${sets.length} total) ===`, ''];
  for (const s of sets) {
    let line = `${s.active ? '▶' : ' '} [${s.id}] ${s.title}`;
    if (s.useSecondWeaponSet) line += ` (swap weapon set)`;
    textLines.push(line);
  }
  textLines.push(`\nActive: Item Set ${result?.activeItemSetId}. Use select_item_set to switch.`);
  const text = textLines.join('\n');
  return { content: [{ type: "text" as const, text }] };
  });
}

export async function handleSelectItemSet(context: LuaHandlerContext, id: number) {
  return wrapHandler('select item set', async () => {
  await context.ensureLuaClient();
  const luaClient = context.getLuaClient();
  if (!luaClient) throw new Error('Lua client not initialized');
  const result = await luaClient.selectItemSet(id);
  const active = result?.itemSets?.find(s => s.active);
  let text = `✅ Switched to Item Set ${id}`;
  if (active) text += ` — ${active.title}`;
  text += `.\n\nStats have been recalculated for this item set.`;
  return { content: [{ type: "text" as const, text }] };
  });
}

/** Stats worth reporting for a hypothetical, in the order a reader wants them. */
const SIMULATED_STATS: Array<{ key: string; label: string }> = [
  { key: 'CombinedDPS', label: 'Combined DPS' },
  { key: 'TotalDPS', label: 'Total DPS' },
  { key: 'Minion.CombinedDPS', label: 'Minion Combined DPS' },
  { key: 'Minion.TotalDPS', label: 'Minion Total DPS' },
  { key: 'TotalEHP', label: 'Effective HP' },
  { key: 'Life', label: 'Life' },
  { key: 'EnergyShield', label: 'Energy Shield' },
  { key: 'Mana', label: 'Mana' },
  { key: 'Armour', label: 'Armour' },
  { key: 'Evasion', label: 'Evasion' },
  { key: 'FireResist', label: 'Fire Resistance' },
  { key: 'ColdResist', label: 'Cold Resistance' },
  { key: 'LightningResist', label: 'Lightning Resistance' },
  { key: 'ChaosResist', label: 'Chaos Resistance' },
  { key: 'Str', label: 'Strength' },
  { key: 'Dex', label: 'Dexterity' },
  { key: 'Int', label: 'Intelligence' },
];

/** Always shown, so a report never reads as "nothing to see" by omission. */
const HEADLINE_STATS = ['CombinedDPS', 'TotalEHP'];

/**
 * PoB reports a full set of stats for a character whose gear the game would
 * disable, so an attribute requirement it does not meet has to be read off the
 * same output the DPS came from.
 */
const ATTRIBUTE_REQUIREMENTS = [
  { label: 'Strength', have: 'Str', required: 'ReqStr', sourceKey: 'ReqStrItem' },
  { label: 'Dexterity', have: 'Dex', required: 'ReqDex', sourceKey: 'ReqDexItem' },
  { label: 'Intelligence', have: 'Int', required: 'ReqInt', sourceKey: 'ReqIntItem' },
];

/** `Minion.TotalDPS` reads a nested key: calcWith leaves minion stats under out.Minion. */
const statNumber = (out: any, key: string): number | undefined => {
  const value = key.split('.').reduce((node: any, part) => node?.[part], out);
  return typeof value === 'number' ? value : undefined;
};

const formatStat = (value: number): string =>
  Math.abs(value) >= 100 ? Math.round(value).toLocaleString() : Number(value.toFixed(2)).toString();

const formatDelta = (delta: number, before: number): string => {
  const sign = delta > 0 ? '+' : '';
  const percent = before !== 0 ? ` (${sign}${((delta / Math.abs(before)) * 100).toFixed(1)}%)` : '';
  return `${sign}${formatStat(delta)}${percent}`;
};

interface UnmetRequirement {
  label: string;
  required: number;
  have: number;
  source?: string;
  preExisting: boolean;
}

const requirementSource = (entry: any): string | undefined =>
  entry?.sourceItem?.name ?? entry?.sourceGem?.nameSpec ?? entry?.source;

const unmetRequirements = (output: any, base: any): UnmetRequirement[] =>
  ATTRIBUTE_REQUIREMENTS.flatMap((attr) => {
    // Both sides come from the simulated output: a swapped item moves the
    // attribute it grants and the requirement it imposes at the same time.
    const required = statNumber(output, attr.required);
    const have = statNumber(output, attr.have);
    if (required === undefined || have === undefined || required <= have) return [];
    const baseRequired = statNumber(base, attr.required) ?? 0;
    const baseHave = statNumber(base, attr.have) ?? 0;
    return [{
      label: attr.label,
      required,
      have,
      source: requirementSource(output?.[attr.sourceKey]),
      preExisting: baseRequired > baseHave,
    }];
  });

export async function handleLuaSimulate(
  context: LuaHandlerContext,
  args: {
    addNodes?: number[];
    removeNodes?: number[];
    masteryEffects?: Record<string, number>;
    itemText?: string;
    slotName?: string;
    toggleFlask?: number;
    useFullDPS?: boolean;
  },
) {
  return wrapHandler('simulate change', async () => {
    await context.ensureLuaClient();
    const luaClient = context.getLuaClient();
    if (!luaClient) throw new Error('Lua client not initialized');

    const hypothesis = {
      addNodes: args.addNodes,
      removeNodes: args.removeNodes,
      masteryEffects: args.masteryEffects,
      repItem: args.itemText,
      repSlotName: args.slotName,
      toggleFlask: args.toggleFlask,
    };
    // useFullDPS changes how the calculation reports, not what it assumes, so a
    // call carrying only that would report an honest zero delta as a failed
    // override — the very signal this tool exists to make trustworthy.
    if (Object.values(hypothesis).every((value) => value === undefined)) {
      throw new Error('nothing to simulate: pass at least one of itemText+slotName, toggleFlask, addNodes, removeNodes or masteryEffects');
    }

    const { output, base, unrecognisedLines } = await luaClient.calcWith({ ...hypothesis, useFullDPS: args.useFullDPS });

    const described = [
      args.itemText && args.slotName ? `swap ${args.slotName}` : undefined,
      args.toggleFlask ? `toggle Flask ${args.toggleFlask}` : undefined,
      args.addNodes?.length ? `allocate ${args.addNodes.length} node(s)` : undefined,
      args.removeNodes?.length ? `unallocate ${args.removeNodes.length} node(s)` : undefined,
      args.masteryEffects ? `${Object.keys(args.masteryEffects).length} mastery choice(s)` : undefined,
    ].filter((part): part is string => part !== undefined);

    const rows = SIMULATED_STATS.flatMap(({ key, label }) => {
      const before = statNumber(base, key);
      const after = statNumber(output, key);
      if (before === undefined || after === undefined) return [];
      const delta = after - before;
      if (delta === 0 && !HEADLINE_STATS.includes(key)) return [];
      const change = delta === 0 ? 'unchanged' : formatDelta(delta, before);
      return [`  ${label}: ${formatStat(before)} → ${formatStat(after)}  ${change}`];
    });

    const moved = SIMULATED_STATS.some(({ key }) => {
      const before = statNumber(base, key);
      const after = statNumber(output, key);
      return before !== undefined && after !== undefined && before !== after;
    });

    const lines = [
      `=== Simulated: ${described.join(', ')} ===`,
      '',
      'The loaded build is unchanged; this is a hypothetical calculation only.',
      '',
      ...rows,
    ];

    // A zero delta is the shape a silently rejected override takes, so say so
    // rather than let it read as a confirmed no-op.
    if (!moved) {
      lines.push('', 'None of the stats listed above moved. A change to something outside this list (block, suppression, crit, charges, ailments) would not show here, and a rejected override looks the same, so check before reporting this as no gain.');
    }

    if (unrecognisedLines && unrecognisedLines.length > 0) {
      lines.push('', 'PoB did not recognise these item lines, so they add nothing to the numbers above:');
      for (const line of unrecognisedLines) lines.push(`  ${line}`);
    }

    const unmet = unmetRequirements(output, base);
    if (unmet.length > 0) {
      lines.push('', 'Attribute requirements not met — this gear would be disabled in game, so the numbers above are unreachable:');
      for (const req of unmet) {
        const source = req.source ? ` (required by ${req.source})` : '';
        const blame = req.preExisting ? ' — already unmet before this change' : '';
        lines.push(`  ${req.label}: needs ${req.required}, has ${req.have}${source}${blame}`);
      }
    }

    return { content: [{ type: "text" as const, text: lines.join('\n') }] };
  });
}

const formatPct = (value: number): string => `${value >= 0 ? '+' : ''}${value.toFixed(value !== 0 && Math.abs(value) < 0.1 ? 3 : 2)}%`;

const weightRow = (r: ProbeResult): string =>
  `  ${r.label}  (roll ${r.roll}): DPS ${formatPct(r.dpsPct)}, EHP ${formatPct(r.ehpPct)}${r.status === 'nonlinear' ? '  [nonlinear]' : ''}${r.note ? `  — ${r.note}` : ''}`;

export function formatStatWeights(report: StatWeightReport): string {
  const lines = [
    `=== Stat weights (${report.focus}) ===`,
    '',
    `Measured by substituting ${report.slot} with a copy carrying one extra line, one calculation per line. The loaded build is unchanged.`,
    `Baseline: ${Math.round(report.baseDps).toLocaleString()} DPS, ${Math.round(report.baseEhp).toLocaleString()} EHP. Each row is the effect of ONE typical high-tier roll of that affix; they are not per-point values, so compare rows rather than scaling them.`,
    '',
  ];
  const offence = report.ranked.filter((r) => r.group === 'offence');
  const defence = report.ranked.filter((r) => r.group === 'defence');
  const section = (title: string, rows: ProbeResult[]) => {
    if (rows.length === 0) return;
    lines.push(`${title}:`, ...rows.map(weightRow), '');
  };
  if (report.focus === 'defence') { section('Defence', defence); section('Offence', offence); }
  else { section('Offence', offence); section('Defence', defence); }

  const unmeasured = report.inert.filter((r) => r.status === 'capped' || r.status === 'unrecognised');
  if (unmeasured.length > 0) {
    lines.push('Capped or not measurable:');
    for (const r of unmeasured) lines.push(`  ${r.label}${r.note ? `  — ${r.note}` : ''}`);
    lines.push('');
  }
  const irrelevant = report.inert.filter((r) => r.status === 'no_effect');
  if (irrelevant.length > 0) {
    lines.push(`No effect on this build (${irrelevant.length}): ${irrelevant.map((r) => r.label).join(', ')}.`);
    lines.push('A zero here means PoB parsed the line and DPS and EHP did not move: the build does not scale that affix, or something else already caps it. A stat outside DPS and EHP (movement speed, recovery, charges) would not show.');
  }
  return lines.join('\n').trimEnd();
}

export async function handleLuaStatWeights(
  context: LuaHandlerContext,
  args: { focus?: WeightFocus; slot?: string },
) {
  return wrapHandler('stat weights', async () => {
    await context.ensureLuaClient();
    const luaClient = context.getLuaClient();
    if (!luaClient) throw new Error('Lua client not initialized');
    if (args.focus !== undefined && !['dps', 'defence', 'both'].includes(args.focus)) {
      throw new Error("focus must be 'dps', 'defence' or 'both'");
    }
    const { report, note } = await computeStatWeights(luaClient, { focus: args.focus, slot: args.slot });
    if (!report) throw new Error(note ?? 'stat weights produced no result');
    return { content: [{ type: "text" as const, text: formatStatWeights(report) }] };
  });
}
