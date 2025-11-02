#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import path from "path";
import os from "os";
import fs from "fs/promises";
import https from "https";
import { PoBLuaApiClient, PoBLuaTcpClient } from "./pobLuaBridge.js";
import { XMLParser } from "fast-xml-parser";
import { analyzeDefenses, formatDefensiveAnalysis } from "./defensiveAnalyzer.js";
import {
  type NodeScore,
  type OptimalNodesResult,
  type BuildGoal,
  parseGoal,
  getStatExtractor,
  getGoalDescription,
  formatOptimalNodesResult,
  getNodeType,
  extractSecondaryBenefits,
} from "./nodeOptimizer.js";
import {
  type OptimizationConstraints,
  type OptimizationResult,
  type OptimizationGoal,
  calculateScore,
  meetsConstraints,
  isLowLifeBuild,
  getGoalDescription as getOptGoalDescription,
  findRemovableNodes,
  formatOptimizationResult,
  parseOptimizationGoal,
} from "./treeOptimizer.js";

// Import services
import { BuildService } from "./services/buildService.js";
import { TreeService } from "./services/treeService.js";
import { WatchService } from "./services/watchService.js";
import { ValidationService } from "./services/validationService.js";
import { BuildExportService } from "./services/buildExportService.js";

// Import types
import type {
  PassiveTreeNode,
  PassiveTreeData,
  PoBBuild,
  TreeAnalysisResult,
  TreeComparison,
  AllocationChange,
  PathOptimization,
  EfficiencyScore,
  OptimizationSuggestion,
} from "./types.js";

// Import utilities
import { ContextBuilder } from "./utils/contextBuilder.js";

// Import server modules
import { ToolGate } from "./server/toolGate.js";
import { LuaClientManager } from "./server/luaClientManager.js";
import { getToolSchemas, getLuaToolSchemas, getOptimizationToolSchemas, getExportToolSchemas } from "./server/toolSchemas.js";

// Import handlers
import { handleListBuilds, handleAnalyzeBuild, handleCompareBuilds, handleGetBuildStats } from "./handlers/buildHandlers.js";
import { handleStartWatching, handleStopWatching, handleGetRecentChanges, handleWatchStatus, handleRefreshTreeData } from "./handlers/watchHandlers.js";
import { handleCompareTrees, handleTestAllocation, handleGetNearbyNodes, handleFindPath, handleAllocateNodes, handlePlanTree } from "./handlers/treeHandlers.js";
import { handleLuaStart, handleLuaStop, handleLuaNewBuild, handleLuaLoadBuild, handleLuaGetStats, handleLuaGetTree, handleLuaSetTree, handleSearchTreeNodes } from "./handlers/luaHandlers.js";
import { handleAddItem, handleGetEquippedItems, handleToggleFlask, handleGetSkillSetup, handleSetMainSkill, handleCreateSocketGroup, handleAddGem, handleSetGemLevel, handleSetGemQuality, handleRemoveSkill, handleRemoveGem, handleSetupSkillWithGems, handleAddMultipleItems } from "./handlers/itemSkillHandlers.js";
import { handleAnalyzeDefenses, handleSuggestOptimalNodes, handleOptimizeTree } from "./handlers/optimizationHandlers.js";
import { handleAnalyzeItems, handleOptimizeSkillLinks, handleCreateBudgetBuild } from "./handlers/advancedOptimizationHandlers.js";
import { handleExportBuild, handleSaveTree, handleSnapshotBuild, handleListSnapshots, handleRestoreSnapshot } from "./handlers/exportHandlers.js";

class PoBMCPServer {
  private server: Server;
  private pobDirectory: string;
  private parser: XMLParser;

  // Services
  private buildService: BuildService;
  private treeService: TreeService;
  private watchService: WatchService;
  private validationService: ValidationService;
  private exportService: BuildExportService;

  // Context builder
  private contextBuilder: ContextBuilder;

  // Server modules
  private toolGate: ToolGate;
  private luaClientManager: LuaClientManager;

  constructor() {
    this.server = new Server(
      {
        name: "pob-mcp-server",
        version: "1.0.0",
      },
      {
        capabilities: {
          resources: {},
          tools: {},
        },
      }
    );

    // Initialize XML parser
    this.parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "",
    });

    // Default Path of Building directory (can be customized)
    // Auto-detect based on platform
    const defaultPoBPath = process.platform === 'darwin'
      ? path.join(os.homedir(), "Path of Building", "Builds")  // macOS
      : path.join(os.homedir(), "Documents", "Path of Building", "Builds");  // Windows/Linux

    this.pobDirectory = process.env.POB_DIRECTORY || defaultPoBPath;

    // Initialize services
    this.buildService = new BuildService(this.pobDirectory);
    this.treeService = new TreeService(this.buildService);
    this.watchService = new WatchService(this.pobDirectory, this.buildService);
    this.validationService = new ValidationService();
    this.exportService = new BuildExportService(this.pobDirectory);

    // Initialize server modules
    this.toolGate = new ToolGate();

    const luaEnabled = process.env.POB_LUA_ENABLED === 'true';
    const useTcpMode = process.env.POB_API_TCP === 'true';
    this.luaClientManager = new LuaClientManager(luaEnabled, useTcpMode);

    // Initialize context builder
    this.contextBuilder = new ContextBuilder({
      buildService: this.buildService,
      treeService: this.treeService,
      watchService: this.watchService,
      validationService: this.validationService,
      exportService: this.exportService,
      pobDirectory: this.pobDirectory,
      luaEnabled: luaEnabled,
      useTcpMode: useTcpMode,
      getLuaClient: () => this.luaClientManager.getClient(),
      ensureLuaClient: () => this.luaClientManager.ensureClient(),
      stopLuaClient: () => this.luaClientManager.stopClient(),
    });

    if (luaEnabled) {
      console.error('[MCP Server] PoB Lua Bridge enabled');
      if (useTcpMode) {
        console.error('[MCP Server] Using TCP mode for GUI integration');
      } else {
        console.error('[MCP Server] Using stdio mode for headless integration');
      }
    }

    this.setupHandlers();

    // Error handling
    this.server.onerror = (error) => {
      console.error("[MCP Error]", error);
    };

    // Handle EPIPE errors (broken pipe) gracefully
    process.stdout.on('error', (err: any) => {
      if (err.code === 'EPIPE') {
        // Client disconnected, exit gracefully
        process.exit(0);
      } else {
        console.error('stdout error:', err);
      }
    });

    process.stderr.on('error', (err: any) => {
      if (err.code === 'EPIPE') {
        // Client disconnected, exit gracefully
        process.exit(0);
      }
    });

    process.on("SIGINT", async () => {
      await this.watchService.stopWatching();
      await this.luaClientManager.stopClient();
      await this.server.close();
      process.exit(0);
    });
  }

  // Delegate to tool gate module
  private checkToolGate(toolName: string): void {
    this.toolGate.checkGate(toolName);
  }

  private unlockToolGate(): void {
    this.toolGate.unlock();
  }

  // Tree Data Fetching
  private async getTreeData(version: string = "3_26"): Promise<PassiveTreeData> {
    // Delegate to TreeService
    return await this.treeService.getTreeData(version);
  }

  // Tree Analysis Methods
  private getActiveSpec(build: PoBBuild): any {
    // Delegate to BuildService
    return this.buildService.getActiveSpec(build);
  }

  private parseAllocatedNodes(build: PoBBuild): string[] {
    // Delegate to BuildService
    return this.buildService.parseAllocatedNodes(build);
  }

  private extractBuildVersion(build: PoBBuild): string {
    // Delegate to BuildService
    return this.buildService.extractBuildVersion(build);
  }


  private async analyzePassiveTree(build: PoBBuild): Promise<TreeAnalysisResult | null> {
    // Delegate to TreeService
    return await this.treeService.analyzePassiveTree(build);
  }

  private setupHandlers() {
    // List available resources (build files)
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      try {
        const builds = await this.buildService.listBuilds();
        return {
          resources: builds.map((build) => ({
            uri: `pob://build/${encodeURIComponent(build)}`,
            name: build,
            mimeType: "application/xml",
            description: `Path of Building build: ${build}`,
          })),
        };
      } catch (error) {
        console.error("Error listing resources:", error);
        return { resources: [] };
      }
    });

    // Read a specific build file
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const uri = request.params.uri;
      const match = uri.match(/^pob:\/\/build\/(.+)$/);

      if (!match) {
        throw new Error(`Invalid URI: ${uri}`);
      }

      const buildName = decodeURIComponent(match[1]);

      try {
        const build = await this.buildService.readBuild(buildName);
        const summary = this.buildService.generateBuildSummary(build);

        return {
          contents: [
            {
              uri,
              mimeType: "text/plain",
              text: summary,
            },
          ],
        };
      } catch (error) {
        throw new Error(`Failed to read build: ${error}`);
      }
    });

    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      // Get base tools
      const tools: any[] = getToolSchemas();

      // Add Lua tools if enabled
      if (this.luaClientManager.isEnabled()) {
        tools.push(...getLuaToolSchemas());
      }

      // Add optimization tools
      tools.push(...getOptimizationToolSchemas());

      // Add export and persistence tools
      tools.push(...getExportToolSchemas());

      return { tools };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        // Check tool gate first
        this.checkToolGate(name);

        // Create handler contexts using contextBuilder
        const handlerContext = this.contextBuilder.buildHandlerContext();
        const watchContext = this.contextBuilder.buildWatchContext();
        const treeContext = this.contextBuilder.buildTreeContext();
        const luaContext = this.contextBuilder.buildLuaContext();
        const itemSkillContext = this.contextBuilder.buildItemSkillContext();
        const optimizationContext = this.contextBuilder.buildOptimizationContext();
        const exportContext = this.contextBuilder.buildExportContext();

        switch (name) {
          case "continue":
            this.unlockToolGate();
            return {
              content: [
                {
                  type: "text" as const,
                  text: "✅ Tool gate unlocked. You may now call ONE more tool.\n\nRemember: The gate will lock again after the next tool call, so use it wisely and then ask the user what to do next.",
                },
              ],
            };

          case "list_builds":
            return await handleListBuilds(handlerContext);

          case "analyze_build":
            if (!args) throw new Error("Missing arguments");
            return this.wrapWithTruncation(
              await handleAnalyzeBuild(handlerContext, args.build_name as string)
            );

          case "compare_builds":
            if (!args) throw new Error("Missing arguments");
            return await handleCompareBuilds(
              handlerContext,
              args.build1 as string,
              args.build2 as string
            );

          case "get_build_stats":
            if (!args) throw new Error("Missing arguments");
            return await handleGetBuildStats(handlerContext, args.build_name as string);

          case "start_watching":
            return handleStartWatching(watchContext);

          case "stop_watching":
            return await handleStopWatching(watchContext);

          case "get_recent_changes":
            return handleGetRecentChanges(watchContext, args?.limit as number | undefined);

          case "watch_status":
            return handleWatchStatus(watchContext);

          case "refresh_tree_data":
            return await handleRefreshTreeData(watchContext, args?.version as string | undefined);

          // Phase 3 tools
          case "compare_trees":
            if (!args) throw new Error("Missing arguments");
            return await handleCompareTrees(
              treeContext,
              args.build1 as string,
              args.build2 as string
            );

          case "test_allocation":
            if (!args) throw new Error("Missing arguments");
            return await handleTestAllocation(
              treeContext,
              args.build_name as string,
              args.changes as string
            );

          case "get_nearby_nodes":
            if (!args) throw new Error("Missing arguments");
            return await handleGetNearbyNodes(
              treeContext,
              args.build_name as string,
              args.max_distance as number | undefined,
              args.filter as string | undefined
            );

          case "find_path_to_node":
            if (!args) throw new Error("Missing arguments");
            return await handleFindPath(
              treeContext,
              args.build_name as string,
              args.target_node_id as string,
              args.show_alternatives as boolean | undefined
            );

          case "allocate_nodes":
            if (!args) throw new Error("Missing arguments");
            return await handleAllocateNodes(
              treeContext,
              args.build_name as string,
              args.node_ids as string[],
              args.show_full_stats as boolean | undefined
            );

          case "plan_tree":
            if (!args) throw new Error("Missing arguments");
            return await handlePlanTree(
              treeContext,
              args.build_name as string | undefined,
              args.goals as string
            );

          // Lua bridge tools
          case "lua_start":
            return await handleLuaStart(luaContext);

          case "lua_stop":
            return await handleLuaStop(luaContext);

          case "lua_new_build":
            return await handleLuaNewBuild(luaContext);

          case "lua_load_build":
            if (!args) throw new Error("Missing arguments");
            return await handleLuaLoadBuild(
              luaContext,
              args.build_name as string | undefined,
              args.build_xml as string | undefined,
              args.name as string | undefined
            );

          case "lua_get_stats":
            return await handleLuaGetStats(luaContext, args?.fields as string[] | undefined);

          case "lua_get_tree":
            return await handleLuaGetTree(luaContext);

          case "lua_set_tree":
            if (!args) throw new Error("Missing arguments");
            return await handleLuaSetTree(luaContext, args);

          case "search_tree_nodes":
            if (!args) throw new Error("Missing arguments");
            return await handleSearchTreeNodes(
              luaContext,
              args.keyword as string,
              args.node_type as string | undefined,
              args.max_results as number | undefined,
              args.include_allocated as boolean | undefined
            );

          // Phase 4: Item & Skill tools
          case "add_item":
            if (!args) throw new Error("Missing arguments");
            return await handleAddItem(itemSkillContext, args.item_text as string, args.slot_name as string | undefined, args.no_auto_equip as boolean | undefined);

          case "get_equipped_items":
            return await handleGetEquippedItems(itemSkillContext);

          case "toggle_flask":
            if (!args) throw new Error("Missing arguments");
            return await handleToggleFlask(itemSkillContext, args.flask_number as number, args.active as boolean);

          case "get_skill_setup":
            return await handleGetSkillSetup(itemSkillContext);

          case "set_main_skill":
            if (!args) throw new Error("Missing arguments");
            return await handleSetMainSkill(itemSkillContext, args.socket_group as number, args.active_skill_index as number | undefined, args.skill_part as number | undefined);

          case "create_socket_group":
            return await handleCreateSocketGroup(itemSkillContext, args?.label as string | undefined, args?.slot as string | undefined, args?.enabled as boolean | undefined, args?.include_in_full_dps as boolean | undefined);

          case "add_gem":
            if (!args) throw new Error("Missing arguments");
            return await handleAddGem(itemSkillContext, args.group_index as number, args.gem_name as string, args.level as number | undefined, args.quality as number | undefined, args.quality_id as string | undefined, args.enabled as boolean | undefined);

          case "set_gem_level":
            if (!args) throw new Error("Missing arguments");
            return await handleSetGemLevel(itemSkillContext, args.group_index as number, args.gem_index as number, args.level as number);

          case "set_gem_quality":
            if (!args) throw new Error("Missing arguments");
            return await handleSetGemQuality(itemSkillContext, args.group_index as number, args.gem_index as number, args.quality as number, args.quality_id as string | undefined);

          case "remove_skill":
            if (!args) throw new Error("Missing arguments");
            return await handleRemoveSkill(itemSkillContext, args.group_index as number);

          case "remove_gem":
            if (!args) throw new Error("Missing arguments");
            return await handleRemoveGem(itemSkillContext, args.group_index as number, args.gem_index as number);

          case "setup_skill_with_gems":
            if (!args) throw new Error("Missing arguments");
            return await handleSetupSkillWithGems(
              itemSkillContext,
              args.gems as Array<{name: string; level?: number; quality?: number; quality_id?: string; enabled?: boolean}>,
              args.label as string | undefined,
              args.slot as string | undefined,
              args.enabled as boolean | undefined,
              args.include_in_full_dps as boolean | undefined
            );

          case "add_multiple_items":
            if (!args) throw new Error("Missing arguments");
            return await handleAddMultipleItems(
              itemSkillContext,
              args.items as Array<{item_text: string; slot_name?: string}>
            );

          // Phase 6: Build Optimization tools
          case "analyze_defenses":
            return this.wrapWithTruncation(
              await handleAnalyzeDefenses(optimizationContext, args?.build_name as string | undefined)
            );

          case "suggest_optimal_nodes":
            if (!args) throw new Error("Missing arguments");
            return this.wrapWithTruncation(
              await handleSuggestOptimalNodes(
                optimizationContext,
                args.build_name as string,
                args.goal as string,
                args.max_points as number | undefined,
                args.max_distance as number | undefined,
                args.min_efficiency as number | undefined,
                args.include_keystones as boolean | undefined
              )
            );

          case "optimize_tree":
            if (!args) throw new Error("Missing arguments");
            return this.wrapWithTruncation(
              await handleOptimizeTree(
                optimizationContext,
                args.build_name as string,
                args.goal as string,
                args.max_points as number | undefined,
                args.max_iterations as number | undefined,
                args.constraints as OptimizationConstraints | undefined
              )
            );

          case "analyze_items":
            const advancedOptContext = {
              buildService: this.buildService,
              getLuaClient: () => this.luaClientManager.getClient(),
              ensureLuaClient: () => this.luaClientManager.ensureClient(),
            };
            return this.wrapWithTruncation(
              await handleAnalyzeItems(
                advancedOptContext,
                args?.build_name as string | undefined
              )
            );

          case "optimize_skill_links":
            const skillLinkContext = {
              buildService: this.buildService,
              getLuaClient: () => this.luaClientManager.getClient(),
              ensureLuaClient: () => this.luaClientManager.ensureClient(),
            };
            return this.wrapWithTruncation(
              await handleOptimizeSkillLinks(
                skillLinkContext,
                args?.build_name as string | undefined
              )
            );

          case "create_budget_build":
            if (!args) throw new Error("Missing arguments");
            const budgetBuildContext = {
              buildService: this.buildService,
              getLuaClient: () => this.luaClientManager.getClient(),
              ensureLuaClient: () => this.luaClientManager.ensureClient(),
            };
            return this.wrapWithTruncation(
              await handleCreateBudgetBuild(
                budgetBuildContext,
                {
                  class_name: args.class_name as string,
                  ascendancy: args.ascendancy as string | undefined,
                  main_skill: args.main_skill as string,
                  budget_level: args.budget_level as 'low' | 'medium' | 'high',
                  focus: args.focus as 'offense' | 'defense' | 'balanced' | undefined,
                }
              )
            );

          // Phase 8: Export and Persistence Tools
          case "export_build":
            if (!args) throw new Error("Missing arguments");
            return await handleExportBuild(exportContext, {
              build_name: args.build_name as string,
              output_name: args.output_name as string,
              output_directory: args.output_directory as string | undefined,
              overwrite: args.overwrite as boolean | undefined,
              notes: args.notes as string | undefined,
            });

          case "save_tree":
            if (!args) throw new Error("Missing arguments");
            return await handleSaveTree(exportContext, {
              build_name: args.build_name as string,
              nodes: args.nodes as string[],
              mastery_effects: args.mastery_effects as Record<string, number> | undefined,
              backup: args.backup as boolean | undefined,
            });

          case "snapshot_build":
            if (!args) throw new Error("Missing arguments");
            return await handleSnapshotBuild(exportContext, {
              build_name: args.build_name as string,
              description: args.description as string | undefined,
              tag: args.tag as string | undefined,
            });

          case "list_snapshots":
            if (!args) throw new Error("Missing arguments");
            return await handleListSnapshots(exportContext, {
              build_name: args.build_name as string,
              limit: args.limit as number | undefined,
              tag_filter: args.tag_filter as string | undefined,
            });

          case "restore_snapshot":
            if (!args) throw new Error("Missing arguments");
            return await handleRestoreSnapshot(exportContext, {
              build_name: args.build_name as string,
              snapshot_id: args.snapshot_id as string,
              backup_current: args.backup_current as boolean | undefined,
            });

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: "text",
              text: `Error: ${errorMsg}`,
            },
          ],
        };
      }
    });
  }

  private formatTimeAgo(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (seconds < 60) return `${seconds}s ago`;
    if (minutes < 60) return `${minutes}m ago`;
    return `${hours}h ago`;
  }

  /**
   * Truncate response text if it exceeds a reasonable limit for Claude Desktop.
   * This prevents timeouts when responses are too large.
   */
  private truncateResponse(text: string, maxLength: number = 8000): string {
    if (text.length <= maxLength) {
      return text;
    }

    const truncated = text.substring(0, maxLength);
    const lastNewline = truncated.lastIndexOf('\n');
    const safeText = lastNewline > 0 ? truncated.substring(0, lastNewline) : truncated;

    const remaining = text.length - safeText.length;
    const remainingLines = text.substring(safeText.length).split('\n').length;

    return safeText + `\n\n[Response truncated: ${remaining} characters, ~${remainingLines} lines remaining]\n` +
           `[Use more specific queries to see detailed information]`;
  }

  /**
   * Wrap handler result with truncation for large responses
   */
  private wrapWithTruncation(result: { content: Array<{ type: string; text: string }> }, maxLength: number = 8000): typeof result {
    if (result.content[0] && result.content[0].type === 'text') {
      result.content[0].text = this.truncateResponse(result.content[0].text, maxLength);
    }
    return result;
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Path of Building MCP Server running on stdio");
  }
}

// Start the server
const server = new PoBMCPServer();
server.run().catch(console.error);
