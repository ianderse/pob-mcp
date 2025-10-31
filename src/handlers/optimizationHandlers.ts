import type { PoBLuaApiClient, PoBLuaTcpClient } from "../pobLuaBridge.js";
import type { BuildService } from "../services/buildService.js";
import type { TreeService } from "../services/treeService.js";
import type { OptimizationConstraints } from "../treeOptimizer.js";
import path from "path";
import fs from "fs/promises";
import { analyzeDefenses, formatDefensiveAnalysis } from "../defensiveAnalyzer.js";
import {
  parseGoal,
  formatOptimalNodesResult,
} from "../nodeOptimizer.js";
import {
  parseOptimizationGoal,
  formatOptimizationResult,
  calculateScore,
  isLowLifeBuild,
} from "../treeOptimizer.js";

export interface OptimizationHandlerContext {
  buildService: BuildService;
  treeService: TreeService;
  pobDirectory: string;
  getLuaClient: () => PoBLuaApiClient | PoBLuaTcpClient | null;
  ensureLuaClient: () => Promise<void>;
}

export async function handleAnalyzeDefenses(
  context: OptimizationHandlerContext,
  buildName?: string
) {
  try {
    if (!buildName) {
      throw new Error('build_name is required. Please specify which build to analyze.');
    }

    await context.ensureLuaClient();

    const luaClient = context.getLuaClient();
    if (!luaClient) {
      throw new Error('Lua client not initialized.');
    }

    const targetBuild = buildName;

    // Load the build into the Lua bridge
    const buildPath = path.join(context.pobDirectory, targetBuild);
    const buildXml = await fs.readFile(buildPath, 'utf-8');
    const loadResult = await luaClient.loadBuildXml(buildXml, 'Defense Analysis');

    // Capture debug info if available
    let debugInfo = '';
    if (loadResult && typeof loadResult === 'object') {
      const debug = (loadResult as any).debug;
      if (debug) {
        debugInfo = `\n[DEBUG] Load diagnostics:\n`;
        debugInfo += `  - Build exists: ${debug.buildExists}\n`;
        debugInfo += `  - Spec exists: ${debug.specExists}\n`;
        debugInfo += `  - Allocated nodes: ${debug.allocatedNodes || 0}\n`;
        debugInfo += `  - Class ID: ${debug.classId || 'unknown'}\n`;
        debugInfo += `  - Ascendancy ID: ${debug.ascendClassId || 'unknown'}\n`;

        // Display debug messages if available
        if (debug.messages && Array.isArray(debug.messages) && debug.messages.length > 0) {
          debugInfo += `\n[DEBUG] Load messages:\n`;
          for (const msg of debug.messages) {
            debugInfo += `  ${msg}\n`;
          }
        }
        debugInfo += '\n';
      }
    }

    // Get stats from PoB
    const stats = await luaClient.getStats();

    // Validate that we have meaningful stats (not empty/default state)
    const life = stats.Life || 0;
    if (life <= 60) {
      throw new Error(
        `Build "${targetBuild}" appears to be in default/empty state. The build may not have loaded correctly.${debugInfo}`
      );
    }

    // Analyze defenses
    const analysis = analyzeDefenses(stats);

    // Format for output
    let text = `Analyzing: ${targetBuild}\n\n`;
    if (debugInfo) {
      text += debugInfo;
    }
    text += formatDefensiveAnalysis(analysis);

    return {
      content: [
        {
          type: "text" as const,
          text,
        },
      ],
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to analyze defenses: ${errorMsg}`);
  }
}

export async function handleSuggestOptimalNodes(
  context: OptimizationHandlerContext,
  buildName: string,
  goalString: string,
  maxPoints?: number,
  maxDistance?: number,
  minEfficiency?: number,
  includeKeystones?: boolean
) {
  try {
    // This requires complex refactoring of findNearbyNodes and other methods
    throw new Error(
      'suggest_optimal_nodes requires further refactoring. ' +
      'The findNearbyNodes and scoring methods need to be moved to TreeService.'
    );
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: "text" as const,
          text: `Error: ${errorMsg}`,
        },
      ],
    };
  }
}

export async function handleOptimizeTree(
  context: OptimizationHandlerContext,
  buildName: string,
  goalString: string,
  maxPoints?: number,
  maxIterations?: number,
  constraints?: OptimizationConstraints
) {
  try {
    // This requires complex refactoring and Lua bridge integration
    throw new Error(
      'optimize_tree requires further refactoring. ' +
      'The tree optimization logic needs to be moved to TreeService and requires Lua bridge integration.'
    );
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: "text" as const,
          text: `Error: ${errorMsg}`,
        },
      ],
    };
  }
}
