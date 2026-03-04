import type { BuildService } from "../services/buildService.js";
import type { TreeService } from "../services/treeService.js";
import type { ValidationService } from "../services/validationService.js";
import type { TreeAnalysisResult } from "../types.js";
import type { HandlerContext } from "../utils/contextBuilder.js";
import path from "path";
import fs from "fs/promises";
export type { HandlerContext } from "../utils/contextBuilder.js";

export async function handleListBuilds(context: HandlerContext) {
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
}

export async function handleAnalyzeBuild(context: HandlerContext, buildName: string) {
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
        const buildPath = path.join(context.pobDirectory, buildName);
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

  let summary = context.buildService.generateBuildSummary(build);

  if (luaSkipped) {
    summary += "\n⚠️  Note: A different build is loaded in the Lua bridge. Stats shown are from that build.\n" +
               "    Use lua_load_build to load this build for accurate live stats.\n";
  }

  // If we have Lua stats, add them
  if (luaStats) {
    summary += "\n=== Live Calculated Stats (from Lua) ===\n\n";
    summary += `Total DPS: ${luaStats.TotalDPS || 'N/A'}\n`;
    summary += `Combined DPS: ${luaStats.CombinedDPS || 'N/A'}\n`;
    summary += `Life: ${luaStats.Life || 'N/A'}\n`;
    summary += `Energy Shield: ${luaStats.EnergyShield || 'N/A'}\n`;
    summary += `Effective Life Pool: ${luaStats.TotalEHP || 'N/A'}\n\n`;
  }

  // Add configuration analysis
  try {
    const config = context.buildService.parseConfiguration(build);
    if (config) {
      summary += "\n" + context.buildService.formatConfiguration(config);
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    summary += "\n=== Configuration ===\n\n";
    summary += `Configuration parsing error: ${errorMsg}\n`;
  }

  // Add flask analysis
  try {
    const flaskAnalysis = context.buildService.parseFlasks(build);
    if (flaskAnalysis) {
      summary += "\n" + context.buildService.formatFlaskAnalysis(flaskAnalysis);
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    summary += "\n=== Flask Setup ===\n\n";
    summary += `Flask parsing error: ${errorMsg}\n`;
  }

  // Add jewel analysis
  try {
    const jewelAnalysis = context.buildService.parseJewels(build);
    if (jewelAnalysis) {
      summary += "\n" + context.buildService.formatJewelAnalysis(jewelAnalysis);
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    summary += "\n=== Jewel Setup ===\n\n";
    summary += `Jewel parsing error: ${errorMsg}\n`;
  }

  // Add tree analysis
  try {
    const treeAnalysis = await context.treeService.analyzePassiveTree(build);
    if (treeAnalysis) {
      summary += formatTreeAnalysis(treeAnalysis);
    } else {
      summary += "\n=== Passive Tree ===\n\nNo passive tree data found in this build.\n";
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
      summary += "\n=== Passive Tree ===\n\n";
      summary += `Passive tree analysis unavailable: ${errorMsg}\n`;
      summary += "Other build sections are still available above.\n";
    }
  }

  // Add build validation (at the end, after all data sections)
  try {
    const flaskAnalysis = context.buildService.parseFlasks(build);
    const validation = context.validationService.validateBuild(build, flaskAnalysis, luaStats ?? undefined);
    summary += "\n" + context.validationService.formatValidation(validation);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    summary += "\n=== Build Validation ===\n\n";
    summary += `Validation error: ${errorMsg}\n`;
  }

  return {
    content: [
      {
        type: "text" as const,
        text: summary,
      },
    ],
  };
}

export async function handleCompareBuilds(context: HandlerContext, build1Name: string, build2Name: string) {
  const build1 = await context.buildService.readBuild(build1Name);
  const build2 = await context.buildService.readBuild(build2Name);

  let comparison = `=== Build Comparison ===\n\n`;
  comparison += `Build 1: ${build1Name}\n`;
  comparison += `Build 2: ${build2Name}\n\n`;

  // Compare classes
  comparison += `Class: ${build1.Build?.className} vs ${build2.Build?.className}\n`;
  comparison += `Ascendancy: ${build1.Build?.ascendClassName} vs ${build2.Build?.ascendClassName}\n\n`;

  // Compare key stats
  comparison += `=== Key Stats Comparison ===\n`;
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
        comparison += `${stat}: ${value1} vs ${value2}\n`;
      }
    }
  }

  return {
    content: [
      {
        type: "text" as const,
        text: comparison,
      },
    ],
  };
}

export async function handleGetBuildStats(context: HandlerContext, buildName: string) {
  const build = await context.buildService.readBuild(buildName);

  let statsText = `=== Stats for ${buildName} ===\n\n`;

  if (build.Build?.PlayerStat) {
    const stats = Array.isArray(build.Build.PlayerStat)
      ? build.Build.PlayerStat
      : [build.Build.PlayerStat];

    for (const stat of stats) {
      statsText += `${stat.stat}: ${stat.value}\n`;
    }
  } else {
    statsText += "No stats found in build.\n";
  }

  return {
    content: [
      {
        type: "text" as const,
        text: statsText,
      },
    ],
  };
}

export async function handleGetBuildNotes(context: HandlerContext, buildName: string) {
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
}

export async function handleSetBuildNotes(context: HandlerContext, buildName: string, notes: string) {
  const buildPath = path.join(context.pobDirectory, buildName);
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
}

function formatTreeAnalysis(analysis: TreeAnalysisResult): string {
  let output = "\n=== Passive Tree ===\n";

  // Version warning
  if (analysis.versionMismatch) {
    output += `\nWARNING: This build is from version ${analysis.buildVersion}.\n`;
    output += `Current passive tree data is from version ${analysis.treeVersion}.\n`;
    output += `The passive tree may have changed between these versions.\n`;
  }

  output += `\nTree Version: ${analysis.treeVersion}\n`;
  output += `Total Points: ${analysis.totalPoints} / ${analysis.availablePoints} available\n`;

  if (analysis.totalPoints > analysis.availablePoints) {
    output += `\nWARNING: This build has more points allocated than available at this level.\n`;
    output += `This is not possible in the actual game.\n`;
  }

  // Ascendancy nodes (separate from regular keystones/notables)
  const ascendancyNodes = analysis.allocatedNodes.filter(n => n.ascendancyName);
  if (ascendancyNodes.length > 0) {
    const ascendancyName = ascendancyNodes[0].ascendancyName;
    output += `\n=== Ascendancy: ${ascendancyName} (${ascendancyNodes.length} points) ===\n`;
    for (const node of ascendancyNodes) {
      output += `- ${node.name}`;
      if (node.stats && node.stats.length > 0) {
        output += `: ${node.stats.join('; ')}`;
      }
      output += '\n';
    }
  }

  // Keystones (regular tree only)
  const regularKeystones = analysis.keystones.filter(k => !k.ascendancyName);
  if (regularKeystones.length > 0) {
    output += `\nAllocated Keystones (${regularKeystones.length}):\n`;
    for (const keystone of regularKeystones) {
      output += `- ${keystone.name}`;
      if (keystone.stats && keystone.stats.length > 0) {
        output += `: ${keystone.stats.join('; ')}`;
      }
      output += '\n';
    }
  }

  // Notable passives (regular tree only)
  const regularNotables = analysis.notables.filter(n => !n.ascendancyName);
  if (regularNotables.length > 0) {
    output += `\nKey Notable Passives (${regularNotables.length} total):\n`;
    // Show first 10 notables
    const displayNotables = regularNotables.slice(0, 10);
    for (const notable of displayNotables) {
      output += `- ${notable.name || 'Unnamed'}`;
      if (notable.stats && notable.stats.length > 0) {
        const statSummary = notable.stats.join('; ').substring(0, 80);
        output += `: ${statSummary}`;
      }
      output += '\n';
    }
    if (regularNotables.length > 10) {
      output += `... and ${regularNotables.length - 10} more notables\n`;
    }
  }

  // Jewel sockets
  if (analysis.jewels.length > 0) {
    output += `\nJewel Sockets: ${analysis.jewels.length} allocated\n`;
  }

  // Archetype
  output += `\nDetected Archetype: ${analysis.archetype}\n`;
  output += `Confidence: ${analysis.archetypeConfidence}\n`;
  output += `[Pending user confirmation]\n`;

  // Pathing efficiency
  output += `\nPathing Efficiency: ${analysis.pathingEfficiency}\n`;
  const pathingCount = analysis.normalNodes.length;
  output += `- Total pathing nodes: ${pathingCount}\n`;

  // Phase 2: Optimization Suggestions
  if (analysis.optimizationSuggestions && analysis.optimizationSuggestions.length > 0) {
    output += `\n=== Optimization Suggestions ===\n`;

    const highPriority = analysis.optimizationSuggestions.filter(s => s.priority === 'high');
    const mediumPriority = analysis.optimizationSuggestions.filter(s => s.priority === 'medium');
    const lowPriority = analysis.optimizationSuggestions.filter(s => s.priority === 'low');

    if (highPriority.length > 0) {
      output += `\nHigh Priority:\n`;
      for (const suggestion of highPriority) {
        output += `- ${suggestion.title}\n`;
        output += `  ${suggestion.description}\n`;
        if (suggestion.pointsSaved) {
          output += `  Potential savings: ${suggestion.pointsSaved} points\n`;
        }
        if (suggestion.potentialGain) {
          output += `  Potential gain: ${suggestion.potentialGain}\n`;
        }
      }
    }

    if (mediumPriority.length > 0) {
      output += `\nMedium Priority:\n`;
      for (const suggestion of mediumPriority) {
        output += `- ${suggestion.title}\n`;
        output += `  ${suggestion.description}\n`;
        if (suggestion.pointsSaved) {
          output += `  Potential savings: ${suggestion.pointsSaved} points\n`;
        }
        if (suggestion.potentialGain) {
          output += `  Potential gain: ${suggestion.potentialGain}\n`;
        }
      }
    }

    if (lowPriority.length > 0) {
      output += `\nAI Context for Advanced Suggestions:\n`;
      for (const suggestion of lowPriority) {
        if (suggestion.type === 'ai-context') {
          output += `${suggestion.description}\n`;
        }
      }
    }
  }

  return output;
}
