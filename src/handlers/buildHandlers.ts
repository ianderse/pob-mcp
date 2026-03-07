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

  // Try to get live Lua stats — only load from file if the same build is already loaded
  // or if no build is loaded. Never replace a *different* in-memory build (data-loss risk).
  let luaStats: any = null;
  let luaSkipped = false;
  try {
    await context.ensureLuaClient();
    const luaClient = context.getLuaClient();

    if (luaClient) {
      let shouldLoad = true;
      try {
        const info = await luaClient.getBuildInfo();
        const loadedName: string = info?.name ?? '';
        // Strip .xml suffix for comparison since PoB may omit it
        const requested = buildName.replace(/\.xml$/i, '');
        const loaded    = loadedName.replace(/\.xml$/i, '');
        if (loaded && loaded !== requested) {
          // A different build is in memory — skip loading to avoid destroying unsaved work
          shouldLoad = false;
          luaSkipped = true;
        }
      } catch { /* no build loaded yet — safe to load */ }

      if (shouldLoad) {
        const buildPath = sanitizeBuildName(buildName, context.pobDirectory);
        const buildXml = await fs.readFile(buildPath, 'utf-8');
        await luaClient.loadBuildXml(buildXml);
        luaStats = await luaClient.getStats();
      } else {
        // Still try to get stats from the currently-loaded build for reference
        try { luaStats = await luaClient.getStats(); } catch { /* best effort */ }
      }
    }
  } catch (error) {
    // Continue with XML-only analysis
  }

  const summaryParts: string[] = [context.buildService.generateBuildSummary(build)];

  if (luaSkipped) {
    summaryParts.push(
      "\n⚠️  Note: A different build is loaded in the Lua bridge. Stats shown are from that build.\n" +
      "    Use lua_load_build to load this build for accurate live stats."
    );
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

  // Add tree analysis
  try {
    const treeAnalysis = await context.treeService.analyzePassiveTree(build);
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
  const build1 = await context.buildService.readBuild(build1Name);
  const build2 = await context.buildService.readBuild(build2Name);

  const compLines: string[] = [
    '=== Build Comparison ===',
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
    const statsArray1 = Array.isArray(stats1) ? stats1 : [stats1];
    const statsArray2 = Array.isArray(stats2) ? stats2 : [stats2];

    const statMap1 = new Map(statsArray1.map(s => [s.stat, s.value]));
    const statMap2 = new Map(statsArray2.map(s => [s.stat, s.value]));

    for (const [stat, value1] of statMap1) {
      const value2 = statMap2.get(stat);
      if (value2) {
        compLines.push(`${stat}: ${value1} vs ${value2}`);
      }
    }
  }

  return {
    content: [
      {
        type: "text" as const,
        text: compLines.join('\n'),
      },
    ],
  };
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
