import type { BuildService } from "../services/buildService.js";
import type { TreeService } from "../services/treeService.js";
import type { ValidationService } from "../services/validationService.js";
import type { TreeAnalysisResult } from "../types.js";
import type { HandlerContext } from "../utils/contextBuilder.js";
import path from "path";
import fs from "fs/promises";
import { wrapHandler } from "../utils/errorHandling.js";
import { sanitizeBuildName } from "../utils/pathSanitizer.js";
export type { HandlerContext } from "../utils/contextBuilder.js";

export async function handleListBuilds(context: HandlerContext) {
  return wrapHandler('list builds', async () => {
    const builds = await context.buildService.listBuilds();
    return {
      content: [
        {
          type: "text" as const,
          text: builds.length > 0
            ? `Available builds:\n${builds.map((b, i) => `${i + 1}. ${b}`).join("\n")}`
            : "No builds found in the Path of Building directory.",
        },
      ],
    };
  });
}

export async function handleAnalyzeBuild(context: HandlerContext, buildName: string) {
  return wrapHandler('analyze build', async () => {
  const build = await context.buildService.readBuild(buildName);

  // Try to get live Lua stats — only load from file if no build is loaded.
  // If the same build is already loaded, preserve current spec/item set selection.
  // Never replace a *different* in-memory build (data-loss risk).
  let luaStats: any = null;
  let luaSkipped = false;
  let luaActiveSpecIndex: number | null = null;
  let luaActiveItemSetId: string | null = null;
  const specContextLines: string[] = [];
  try {
    await context.ensureLuaClient();
    const luaClient = context.getLuaClient();

    if (luaClient) {
      const basename = (n: string) => n.split(/[/\\]/).pop() ?? n;
      let shouldLoad = true;
      try {
        const info = await luaClient.getBuildInfo();
        const loadedName: string = info?.name ?? '';
        // Strip .xml suffix for comparison since PoB may omit it
        const requested = buildName.replace(/\.xml$/i, '');
        const loaded    = loadedName.replace(/\.xml$/i, '');
        if (loaded) {
          const sameExact = loaded === requested;
          const sameBase  = basename(loaded) === basename(requested);
          if (!sameExact && !sameBase) {
            // A different build is in memory — skip loading to avoid destroying unsaved work
            shouldLoad = false;
            luaSkipped = true;
          } else {
            // Same build already loaded — preserve current spec/item set selection
            shouldLoad = false;
          }
        }
      } catch { /* no build loaded yet — safe to load */ }

      if (shouldLoad) {
        const buildPath = sanitizeBuildName(buildName, context.pobDirectory);
        const buildXml = await fs.readFile(buildPath, 'utf-8');
        await luaClient.loadBuildXml(buildXml);
      }
      try { luaStats = await luaClient.getStats(); } catch { /* best effort */ }

      // Query active spec/item set for context and to guide tree analysis
      try {
        const specsResult = await luaClient.listSpecs();
        const itemSetsResult = await luaClient.listItemSets();
        const activeSpec = specsResult?.specs?.find((s: any) => s.active);
        const activeItemSet = itemSetsResult?.itemSets?.find((s: any) => s.active);
        if (activeSpec) luaActiveSpecIndex = activeSpec.index;
        if (activeItemSet) luaActiveItemSetId = String(activeItemSet.id);
        const numSpecs = specsResult?.specs?.length ?? 0;
        const numSets = itemSetsResult?.itemSets?.length ?? 0;
        if (numSpecs > 1 || numSets > 1) {
          const parts: string[] = [];
          if (activeSpec && numSpecs > 1) {
            parts.push(`Spec ${activeSpec.index}/${numSpecs}: "${activeSpec.title}" (${activeSpec.nodeCount} nodes)`);
          }
          if (activeItemSet && numSets > 1) {
            parts.push(`Item Set ${activeItemSet.id}/${numSets}: "${activeItemSet.title}"`);
          }
          if (parts.length > 0) {
            specContextLines.push(`[Analyzing: ${parts.join(' | ')}]`);
            specContextLines.push('Use select_spec / select_item_set to switch before re-analyzing.');
          }
        }
      } catch { /* advisory only */ }
    }
  } catch (error) {
    // Continue with XML-only analysis
  }

  // Build an override object that reflects the Lua-selected spec/item set/skill set,
  // so generateBuildSummary and analyzePassiveTree read from the correct sets (not disk defaults).
  const buildForAnalysis: typeof build = {
    ...build,
    ...(luaActiveSpecIndex !== null && build.Tree
      ? { Tree: { ...build.Tree, activeSpec: String(luaActiveSpecIndex) } }
      : {}),
    ...(luaActiveItemSetId !== null && build.Items
      ? { Items: { ...(build.Items as any), activeItemSet: luaActiveItemSetId } }
      : {}),
    ...(luaActiveItemSetId !== null && build.Skills
      ? { Skills: { ...(build.Skills as any), activeSkillSet: luaActiveItemSetId } }
      : {}),
  };

  const summaryParts: string[] = [context.buildService.generateBuildSummary(buildForAnalysis)];

  if (luaSkipped) {
    summaryParts.push(
      "\n⚠️  Note: A different build is loaded in the Lua bridge. Stats shown are from that build.\n" +
      "    Use lua_load_build to load this build for accurate live stats."
    );
  }

  // Show active spec/item set context when multiple exist
  if (specContextLines.length > 0) {
    summaryParts.push('\n' + specContextLines.join('\n'));
  }

  // If we have Lua stats, add them
  if (luaStats) {
    summaryParts.push([
      '\n=== Live Calculated Stats (from Lua) ===',
      '',
      `Total DPS: ${luaStats.TotalDPS || 'N/A'}`,
      `Combined DPS: ${luaStats.CombinedDPS || 'N/A'}`,
      `Life: ${luaStats.Life || 'N/A'}`,
      `Energy Shield: ${luaStats.EnergyShield || 'N/A'}`,
      `Effective Life Pool: ${luaStats.TotalEHP || 'N/A'}`,
      '',
    ].join('\n'));
  }

  // Add configuration analysis
  try {
    const config = context.buildService.parseConfiguration(build);
    if (config) {
      summaryParts.push("\n" + context.buildService.formatConfiguration(config));
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    summaryParts.push(`\n=== Configuration ===\n\nConfiguration parsing error: ${errorMsg}`);
  }

  // Add flask analysis
  try {
    const flaskAnalysis = context.buildService.parseFlasks(build);
    if (flaskAnalysis) {
      summaryParts.push("\n" + context.buildService.formatFlaskAnalysis(flaskAnalysis));
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    summaryParts.push(`\n=== Flask Setup ===\n\nFlask parsing error: ${errorMsg}`);
  }

  // Add jewel analysis
  try {
    const jewelAnalysis = context.buildService.parseJewels(build);
    if (jewelAnalysis) {
      summaryParts.push("\n" + context.buildService.formatJewelAnalysis(jewelAnalysis));
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    summaryParts.push(`\n=== Jewel Setup ===\n\nJewel parsing error: ${errorMsg}`);
  }

  // Add tree analysis — buildForAnalysis already has the Lua-selected spec overridden
  try {
    const treeAnalysis = await context.treeService.analyzePassiveTree(buildForAnalysis);
    if (treeAnalysis) {
      summaryParts.push(formatTreeAnalysis(treeAnalysis));
    } else {
      summaryParts.push("\n=== Passive Tree ===\n\nNo passive tree data found in this build.");
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    if (errorMsg.includes("Invalid passive tree data detected")) {
      // Return the full error message for invalid nodes
      return {
        content: [
          {
            type: "text" as const,
            text: `Error: ${errorMsg}`,
          },
        ],
      };
    } else {
      // For other errors, show notice but continue with other sections
      summaryParts.push([
        '\n=== Passive Tree ===',
        '',
        `Passive tree analysis unavailable: ${errorMsg}`,
        'Other build sections are still available above.',
      ].join('\n'));
    }
  }

  // Add build validation (at the end, after all data sections)
  try {
    const flaskAnalysis = context.buildService.parseFlasks(build);
    const validation = context.validationService.validateBuild(build, flaskAnalysis, luaStats ?? undefined);
    summaryParts.push("\n" + context.validationService.formatValidation(validation));
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    summaryParts.push(`\n=== Build Validation ===\n\nValidation error: ${errorMsg}`);
  }

  return {
    content: [
      {
        type: "text" as const,
        text: summaryParts.join('\n'),
      },
    ],
  };
  });
}

export async function handleCompareBuilds(context: HandlerContext, build1Name: string, build2Name: string) {
  return wrapHandler('compare builds', async () => {

  // Load a build into Lua using its saved active spec and item set.
  // We deliberately do NOT override spec/item set with heuristics — using the
  // saved state matches what the user sees in PoB and avoids reporting wrong stats
  // (e.g. resistances from a different gear set than the one the user expects).
  const loadEndgame = async (luaClient: any, buildName: string) => {
    const buildPath = path.join(context.pobDirectory, buildName);
    const buildXml = await fs.readFile(buildPath, 'utf-8');
    const displayName = buildName.replace(/\.xml$/i, '').split(/[/\\]/).pop() ?? buildName;
    await luaClient.loadBuildXml(buildXml, displayName);

    let selectedSpec: any = null;
    let selectedItemSet: any = null;

    // Report which spec/item set is active (informational only — no override)
    try {
      const specsResult = await luaClient.listSpecs();
      if (specsResult?.specs?.length > 0) {
        selectedSpec = specsResult.specs.find((s: any) => s.active) ?? specsResult.specs[0];
      }
    } catch { /* ignore */ }

    try {
      const itemSetsResult = await luaClient.listItemSets();
      if (itemSetsResult?.itemSets?.length > 0) {
        selectedItemSet = itemSetsResult.itemSets.find((s: any) => s.active) ?? itemSetsResult.itemSets[0];
      }
    } catch { /* ignore */ }

    const stats = await luaClient.getStats();
    return { stats, selectedSpec, selectedItemSet, displayName };
  };

  // Try Lua-based live comparison
  let luaOk = false;
  let r1: any = null;
  let r2: any = null;
  try {
    await context.ensureLuaClient();
    const luaClient = context.getLuaClient();
    if (luaClient) {
      r1 = await loadEndgame(luaClient, build1Name);
      r2 = await loadEndgame(luaClient, build2Name);
      luaOk = true;
    }
  } catch { /* fall through to XML */ }

  if (luaOk && r1 && r2) {
    const fmtNum = (n: any) =>
      n != null && !isNaN(Number(n)) && Number(n) !== 0
        ? Math.round(Number(n)).toLocaleString()
        : 'N/A';

    const row = (label: string, v1: any, v2: any, higherIsBetter = true) => {
      const n1 = Number(v1 || 0);
      const n2 = Number(v2 || 0);
      const winner = n1 === n2 ? '  ='
        : (n1 > n2) === higherIsBetter ? '  ▲1' : '  ▲2';
      return `  ${label.padEnd(22)}${fmtNum(v1).padStart(12)}  vs  ${fmtNum(v2).padStart(12)}${winner}`;
    };

    const s1 = r1.stats;
    const s2 = r2.stats;

    const lines: string[] = [
      '=== Build Comparison (Live Stats) ===',
      '',
      `Build 1: ${r1.displayName}`,
      r1.selectedSpec
        ? `  Spec:     "${r1.selectedSpec.title}" (${r1.selectedSpec.nodeCount} nodes, saved active)`
        : '  Spec:     N/A',
      r1.selectedItemSet
        ? `  Item Set: "${r1.selectedItemSet.title}" (saved active)`
        : '  Item Set: N/A',
      '',
      `Build 2: ${r2.displayName}`,
      r2.selectedSpec
        ? `  Spec:     "${r2.selectedSpec.title}" (${r2.selectedSpec.nodeCount} nodes, saved active)`
        : '  Spec:     N/A',
      r2.selectedItemSet
        ? `  Item Set: "${r2.selectedItemSet.title}" (saved active)`
        : '  Item Set: N/A',
      '',
      `${'Stat'.padEnd(24)}${'Build 1'.padStart(12)}       ${'Build 2'.padStart(12)}`,
      '-'.repeat(60),
    ];

    // Defenses
    lines.push(row('Life', s1.Life, s2.Life));
    lines.push(row('Energy Shield', s1.EnergyShield, s2.EnergyShield));
    lines.push(row('Total EHP', s1.TotalEHP, s2.TotalEHP));
    lines.push(row('Mana', s1.Mana, s2.Mana));
    lines.push('');

    // Offense
    const dps1 = s1.CombinedDPS || s1.TotalDPS || s1.MinionTotalDPS;
    const dps2 = s2.CombinedDPS || s2.TotalDPS || s2.MinionTotalDPS;
    lines.push(row('DPS (combined)', dps1, dps2));
    lines.push(row('Crit Chance %', s1.CritChance, s2.CritChance));
    lines.push(row('Crit Multi %', s1.CritMultiplier, s2.CritMultiplier));
    lines.push('');

    // Resists
    lines.push(row('Fire Resist %', s1.FireResist, s2.FireResist));
    lines.push(row('Cold Resist %', s1.ColdResist, s2.ColdResist));
    lines.push(row('Lightning Res %', s1.LightningResist, s2.LightningResist));
    lines.push(row('Chaos Resist %', s1.ChaosResist, s2.ChaosResist));
    lines.push('');

    lines.push(`Note: "${r2.displayName}" is now active in the Lua bridge.`);

    return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
  }

  // XML fallback (no Lua available)
  const build1 = await context.buildService.readBuild(build1Name);
  const build2 = await context.buildService.readBuild(build2Name);

  const compLines: string[] = [
    '=== Build Comparison (XML / saved stats) ===',
    '',
    `Build 1: ${build1Name}`,
    `Build 2: ${build2Name}`,
    '',
    `Class: ${build1.Build?.className} vs ${build2.Build?.className}`,
    `Ascendancy: ${build1.Build?.ascendClassName} vs ${build2.Build?.ascendClassName}`,
    '',
    '=== Key Stats Comparison ===',
  ];

  const stats1 = build1.Build?.PlayerStat;
  const stats2 = build2.Build?.PlayerStat;
  if (stats1 && stats2) {
    const arr1 = Array.isArray(stats1) ? stats1 : [stats1];
    const arr2 = Array.isArray(stats2) ? stats2 : [stats2];
    const map2 = new Map(arr2.map(s => [s.stat, s.value]));
    for (const { stat, value } of arr1) {
      const v2 = map2.get(stat);
      if (v2) compLines.push(`${stat}: ${value} vs ${v2}`);
    }
  }

  return { content: [{ type: 'text' as const, text: compLines.join('\n') }] };
  });
}

export async function handleGetBuildStats(context: HandlerContext, buildName: string) {
  return wrapHandler('get build stats', async () => {
  const build = await context.buildService.readBuild(buildName);

  const statsLines: string[] = [`=== Stats for ${buildName} ===`, ''];

  if (build.Build?.PlayerStat) {
    const stats = Array.isArray(build.Build.PlayerStat)
      ? build.Build.PlayerStat
      : [build.Build.PlayerStat];

    for (const stat of stats) {
      statsLines.push(`${stat.stat}: ${stat.value}`);
    }
  } else {
    statsLines.push('No stats found in build.');
  }

  return {
    content: [
      {
        type: "text" as const,
        text: statsLines.join('\n'),
      },
    ],
  };
  });
}

export async function handleGetBuildNotes(context: HandlerContext, buildName: string) {
  return wrapHandler('get build notes', async () => {
    const build = await context.buildService.readBuild(buildName);
    const notes = build.Notes ?? '';
    return {
      content: [{
        type: 'text' as const,
        text: notes
          ? `=== Notes: ${buildName} ===\n\n${notes}`
          : `No notes found in ${buildName}.`,
      }],
    };
  });
}

export async function handleSetBuildNotes(context: HandlerContext, buildName: string, notes: string) {
  return wrapHandler('set build notes', async () => {
    const buildPath = sanitizeBuildName(buildName, context.pobDirectory);
    let xml = await fs.readFile(buildPath, 'utf-8');

    // XML-escape the notes content so special characters don't corrupt the build file
    const escaped = notes
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    if (xml.includes('<Notes>')) {
      xml = xml.replace(/<Notes>[\s\S]*?<\/Notes>/, `<Notes>${escaped}</Notes>`);
    } else if (xml.includes('<Notes/>')) {
      xml = xml.replace('<Notes/>', `<Notes>${escaped}</Notes>`);
    } else {
      xml = xml.replace('</PathOfBuilding>', `  <Notes>${escaped}</Notes>\n</PathOfBuilding>`);
    }

    await fs.writeFile(buildPath, xml, 'utf-8');
    // Invalidate the build cache so a subsequent get_build_notes reads the updated file
    context.buildService.invalidateBuild(buildName);
    return {
      content: [{
        type: 'text' as const,
        text: `✅ Notes updated in ${buildName} (${notes.length} characters).`,
      }],
    };
  });
}

function formatTreeAnalysis(analysis: TreeAnalysisResult): string {
  const lines: string[] = ['', '=== Passive Tree ==='];

  // Version warning
  if (analysis.versionMismatch) {
    lines.push(
      `\nWARNING: This build is from version ${analysis.buildVersion}.`,
      `Current passive tree data is from version ${analysis.treeVersion}.`,
      'The passive tree may have changed between these versions.'
    );
  }

  lines.push(`\nTree Version: ${analysis.treeVersion}`);
  lines.push(`Total Points: ${analysis.totalPoints} / ${analysis.availablePoints} available`);

  if (analysis.totalPoints > analysis.availablePoints) {
    lines.push(
      '\nWARNING: This build has more points allocated than available at this level.',
      'This is not possible in the actual game.'
    );
  }

  // Ascendancy nodes (separate from regular keystones/notables)
  const ascendancyNodes = analysis.allocatedNodes.filter(n => n.ascendancyName);
  if (ascendancyNodes.length > 0) {
    const ascendancyName = ascendancyNodes[0].ascendancyName;
    lines.push(`\n=== Ascendancy: ${ascendancyName} (${ascendancyNodes.length} points) ===`);
    for (const node of ascendancyNodes) {
      let line = `- ${node.name}`;
      if (node.stats && node.stats.length > 0) {
        line += `: ${node.stats.join('; ')}`;
      }
      lines.push(line);
    }
  }

  // Keystones (regular tree only)
  const regularKeystones = analysis.keystones.filter(k => !k.ascendancyName);
  if (regularKeystones.length > 0) {
    lines.push(`\nAllocated Keystones (${regularKeystones.length}):`);
    for (const keystone of regularKeystones) {
      let line = `- ${keystone.name}`;
      if (keystone.stats && keystone.stats.length > 0) {
        line += `: ${keystone.stats.join('; ')}`;
      }
      lines.push(line);
    }
  }

  // Notable passives (regular tree only)
  const regularNotables = analysis.notables.filter(n => !n.ascendancyName);
  if (regularNotables.length > 0) {
    lines.push(`\nKey Notable Passives (${regularNotables.length} total):`);
    // Show first 10 notables
    const displayNotables = regularNotables.slice(0, 10);
    for (const notable of displayNotables) {
      let line = `- ${notable.name || 'Unnamed'}`;
      if (notable.stats && notable.stats.length > 0) {
        const statSummary = notable.stats.join('; ').substring(0, 80);
        line += `: ${statSummary}`;
      }
      lines.push(line);
    }
    if (regularNotables.length > 10) {
      lines.push(`... and ${regularNotables.length - 10} more notables`);
    }
  }

  // Jewel sockets
  if (analysis.jewels.length > 0) {
    lines.push(`\nJewel Sockets: ${analysis.jewels.length} allocated`);
  }

  // Archetype
  lines.push(
    `\nDetected Archetype: ${analysis.archetype}`,
    `Confidence: ${analysis.archetypeConfidence}`,
    '[Pending user confirmation]'
  );

  // Pathing efficiency
  lines.push(
    `\nPathing Efficiency: ${analysis.pathingEfficiency}`,
    `- Total pathing nodes: ${analysis.normalNodes.length}`
  );

  // Phase 2: Optimization Suggestions
  if (analysis.optimizationSuggestions && analysis.optimizationSuggestions.length > 0) {
    lines.push('\n=== Optimization Suggestions ===');

    const highPriority = analysis.optimizationSuggestions.filter(s => s.priority === 'high');
    const mediumPriority = analysis.optimizationSuggestions.filter(s => s.priority === 'medium');
    const lowPriority = analysis.optimizationSuggestions.filter(s => s.priority === 'low');

    if (highPriority.length > 0) {
      lines.push('\nHigh Priority:');
      for (const suggestion of highPriority) {
        lines.push(`- ${suggestion.title}`);
        lines.push(`  ${suggestion.description}`);
        if (suggestion.pointsSaved) {
          lines.push(`  Potential savings: ${suggestion.pointsSaved} points`);
        }
        if (suggestion.potentialGain) {
          lines.push(`  Potential gain: ${suggestion.potentialGain}`);
        }
      }
    }

    if (mediumPriority.length > 0) {
      lines.push('\nMedium Priority:');
      for (const suggestion of mediumPriority) {
        lines.push(`- ${suggestion.title}`);
        lines.push(`  ${suggestion.description}`);
        if (suggestion.pointsSaved) {
          lines.push(`  Potential savings: ${suggestion.pointsSaved} points`);
        }
        if (suggestion.potentialGain) {
          lines.push(`  Potential gain: ${suggestion.potentialGain}`);
        }
      }
    }

    if (lowPriority.length > 0) {
      lines.push('\nAI Context for Advanced Suggestions:');
      for (const suggestion of lowPriority) {
        if (suggestion.type === 'ai-context') {
          lines.push(suggestion.description);
        }
      }
    }
  }

  return lines.join('\n');
}
