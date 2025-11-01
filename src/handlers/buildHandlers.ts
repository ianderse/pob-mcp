import type { BuildService } from "../services/buildService.js";
import type { TreeService } from "../services/treeService.js";
import type { TreeAnalysisResult } from "../types.js";

export interface HandlerContext {
  buildService: BuildService;
  treeService: TreeService;
}

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
  let summary = context.buildService.generateBuildSummary(build);

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

  // Keystones
  if (analysis.keystones.length > 0) {
    output += `\nAllocated Keystones (${analysis.keystones.length}):\n`;
    for (const keystone of analysis.keystones) {
      output += `- ${keystone.name}`;
      if (keystone.stats && keystone.stats.length > 0) {
        output += `: ${keystone.stats.join('; ')}`;
      }
      output += '\n';
    }
  }

  // Notable passives
  if (analysis.notables.length > 0) {
    output += `\nKey Notable Passives (${analysis.notables.length} total):\n`;
    // Show first 10 notables
    const displayNotables = analysis.notables.slice(0, 10);
    for (const notable of displayNotables) {
      output += `- ${notable.name || 'Unnamed'}`;
      if (notable.stats && notable.stats.length > 0) {
        const statSummary = notable.stats.join('; ').substring(0, 80);
        output += `: ${statSummary}`;
      }
      output += '\n';
    }
    if (analysis.notables.length > 10) {
      output += `... and ${analysis.notables.length - 10} more notables\n`;
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
