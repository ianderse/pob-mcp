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
import chokidar from "chokidar";
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
  TreeDataCache,
  CachedBuild,
} from "./types.js";

// Import handlers
import { handleListBuilds, handleAnalyzeBuild, handleCompareBuilds, handleGetBuildStats } from "./handlers/buildHandlers.js";
import { handleStartWatching, handleStopWatching, handleGetRecentChanges, handleWatchStatus, handleRefreshTreeData } from "./handlers/watchHandlers.js";
import { handleCompareTrees, handleTestAllocation, handleGetNearbyNodes, handleFindPath, handleAllocateNodes, handlePlanTree } from "./handlers/treeHandlers.js";
import { handleLuaStart, handleLuaStop, handleLuaNewBuild, handleLuaLoadBuild, handleLuaGetStats, handleLuaGetTree, handleLuaSetTree, handleSearchTreeNodes } from "./handlers/luaHandlers.js";
import { handleAddItem, handleGetEquippedItems, handleToggleFlask, handleGetSkillSetup, handleSetMainSkill, handleCreateSocketGroup, handleAddGem, handleSetGemLevel, handleSetGemQuality, handleRemoveSkill, handleRemoveGem } from "./handlers/itemSkillHandlers.js";
import { handleAnalyzeDefenses, handleSuggestOptimalNodes, handleOptimizeTree } from "./handlers/optimizationHandlers.js";

class PoBMCPServer {
  private server: Server;
  private pobDirectory: string;
  private parser: XMLParser;

  // Services
  private buildService: BuildService;
  private treeService: TreeService;
  private watchService: WatchService;

  // Legacy properties (still used by methods not yet refactored)
  private watcher: ReturnType<typeof chokidar.watch> | null = null;
  private buildCache: Map<string, CachedBuild> = new Map();
  private treeDataCache: Map<string, TreeDataCache> = new Map();
  private recentChanges: Array<{file: string; timestamp: number; type: string}> = [];
  private watchEnabled: boolean = false;
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();

  // PoB Lua Bridge
  private luaClient: PoBLuaApiClient | PoBLuaTcpClient | null = null;
  private luaEnabled: boolean = false;
  private useTcpMode: boolean = false;

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

    // Check if Lua bridge is enabled
    this.luaEnabled = process.env.POB_LUA_ENABLED === 'true';
    this.useTcpMode = process.env.POB_API_TCP === 'true';

    if (this.luaEnabled) {
      console.error('[MCP Server] PoB Lua Bridge enabled');
      if (this.useTcpMode) {
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

    process.on("SIGINT", async () => {
      await this.watchService.stopWatching();
      await this.stopLuaClient();
      await this.server.close();
      process.exit(0);
    });
  }

  // Lua Bridge Methods
  private async ensureLuaClient(): Promise<void> {
    if (!this.luaEnabled) {
      throw new Error('PoB Lua Bridge is not enabled. Set POB_LUA_ENABLED=true to use lua_* tools.');
    }

    if (this.luaClient) {
      return; // Already initialized
    }

    console.error('[Lua Bridge] Initializing client...');

    try {
      if (this.useTcpMode) {
        const tcpClient = new PoBLuaTcpClient({
          host: process.env.POB_API_TCP_HOST,
          port: process.env.POB_API_TCP_PORT ? parseInt(process.env.POB_API_TCP_PORT) : undefined,
          timeoutMs: process.env.POB_TIMEOUT_MS ? parseInt(process.env.POB_TIMEOUT_MS) : undefined,
        });
        await tcpClient.start();
        this.luaClient = tcpClient;
      } else {
        const stdioClient = new PoBLuaApiClient({
          cwd: process.env.POB_FORK_PATH,
          cmd: process.env.POB_CMD,
          args: process.env.POB_ARGS ? [process.env.POB_ARGS] : undefined,
          timeoutMs: process.env.POB_TIMEOUT_MS ? parseInt(process.env.POB_TIMEOUT_MS) : undefined,
        });
        await stdioClient.start();
        this.luaClient = stdioClient;
      }

      console.error('[Lua Bridge] Client initialized successfully');

      // Wait for HeadlessWrapper to be fully ready (loadBuildFromXML available)
      console.error('[Lua Bridge] Waiting for HeadlessWrapper to finish loading...');
      const testXml = '<?xml version="1.0" encoding="UTF-8"?><PathOfBuilding><Build level="1" className="Witch"/></PathOfBuilding>';
      let attempts = 0;
      const maxAttempts = 5;

      while (attempts < maxAttempts) {
        try {
          await this.luaClient.loadBuildXml(testXml, 'Init Test');
          console.error('[Lua Bridge] HeadlessWrapper fully initialized');
          break;
        } catch (loadError) {
          attempts++;
          if (attempts >= maxAttempts) {
            throw new Error(`HeadlessWrapper did not initialize after ${maxAttempts} attempts. Error: ${loadError instanceof Error ? loadError.message : String(loadError)}`);
          }
          console.error(`[Lua Bridge] HeadlessWrapper not ready (attempt ${attempts}/${maxAttempts}), waiting 2s...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error('[Lua Bridge] Failed to initialize:', errorMsg);
      throw new Error(`Failed to start PoB Lua Bridge: ${errorMsg}`);
    }
  }

  private async stopLuaClient(): Promise<void> {
    if (this.luaClient) {
      console.error('[Lua Bridge] Stopping client...');
      try {
        await this.luaClient.stop();
      } catch (error) {
        console.error('[Lua Bridge] Error stopping client:', error);
      }
      this.luaClient = null;
    }
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

  // Phase 3: Tree Comparison
  private startWatching() {
    if (this.watcher) {
      console.error("[File Watcher] Already watching directory");
      return;
    }

    console.error(`[File Watcher] Starting to watch: ${this.pobDirectory}`);

    this.watcher = chokidar.watch(this.pobDirectory, {
      ignored: /(^|[\/\\])\../, // ignore dotfiles
      persistent: true,
      ignoreInitial: true, // don't trigger for existing files
      awaitWriteFinish: {
        stabilityThreshold: 500, // wait for file writes to finish
        pollInterval: 100
      }
    });

    this.watcher
      .on("add", (filePath: string) => this.handleFileChange(filePath, "added"))
      .on("change", (filePath: string) => this.handleFileChange(filePath, "modified"))
      .on("unlink", (filePath: string) => this.handleFileChange(filePath, "deleted"))
      .on("error", (error: unknown) => console.error("[File Watcher] Error:", error));

    this.watchEnabled = true;
  }

  private async stopWatching() {
    if (this.watcher) {
      console.error("[File Watcher] Stopping watch");
      await this.watcher.close();
      this.watcher = null;
      this.watchEnabled = false;
    }
  }

  private handleFileChange(filePath: string, changeType: string) {
    const fileName = path.basename(filePath);

    // Only process .xml files
    if (!fileName.endsWith(".xml")) {
      return;
    }

    // Clear any existing debounce timer for this file
    const existingTimer = this.debounceTimers.get(fileName);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Set new debounce timer (500ms)
    const timer = setTimeout(() => {
      this.processFileChange(fileName, changeType);
      this.debounceTimers.delete(fileName);
    }, 500);

    this.debounceTimers.set(fileName, timer);
  }

  private processFileChange(fileName: string, changeType: string) {
    console.error(`[File Watcher] Build ${changeType}: ${fileName}`);

    // Invalidate cache for this build
    this.buildCache.delete(fileName);

    // Track recent change
    this.recentChanges.push({
      file: fileName,
      timestamp: Date.now(),
      type: changeType
    });

    // Keep only last 50 changes
    if (this.recentChanges.length > 50) {
      this.recentChanges = this.recentChanges.slice(-50);
    }
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
      const tools: any[] = [
        {
          name: "analyze_build",
          description: "Analyze a Path of Building build file and extract detailed information including stats, skills, gear, passive skill tree analysis with keystones, notables, jewel sockets, build archetype detection, and optimization suggestions",
          inputSchema: {
            type: "object",
            properties: {
              build_name: {
                type: "string",
                description: "Name of the build file (e.g., 'MyBuild.xml')",
              },
            },
            required: ["build_name"],
          },
        },
        {
          name: "compare_builds",
          description: "Compare two Path of Building builds side by side",
          inputSchema: {
            type: "object",
            properties: {
              build1: {
                type: "string",
                description: "First build file name",
              },
              build2: {
                type: "string",
                description: "Second build file name",
              },
            },
            required: ["build1", "build2"],
          },
        },
        {
          name: "list_builds",
          description: "List all available Path of Building builds",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
        {
          name: "get_build_stats",
          description: "Extract specific stats from a build (Life, DPS, resistances, etc.)",
          inputSchema: {
            type: "object",
            properties: {
              build_name: {
                type: "string",
                description: "Name of the build file",
              },
            },
            required: ["build_name"],
          },
        },
        {
          name: "start_watching",
          description: "Start monitoring the builds directory for changes. Builds will be auto-reloaded when saved in PoB.",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
        {
          name: "stop_watching",
          description: "Stop monitoring the builds directory for changes.",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
        {
          name: "get_recent_changes",
          description: "Get a list of recently changed build files.",
          inputSchema: {
            type: "object",
            properties: {
              limit: {
                type: "number",
                description: "Maximum number of recent changes to return (default: 10)",
              },
            },
          },
        },
        {
          name: "watch_status",
          description: "Check if file watching is currently enabled.",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
        {
          name: "refresh_tree_data",
          description: "Manually refresh the cached passive skill tree data from the PoB repository. Use this if you know PoB has updated or if tree data seems outdated.",
          inputSchema: {
            type: "object",
            properties: {
              version: {
                type: "string",
                description: "Optional: Specific tree version to refresh (e.g., '3_26'). If omitted, refreshes all cached versions.",
              },
            },
          },
        },
        {
          name: "compare_trees",
          description: "Compare passive skill trees between two builds, highlighting differences in keystones, notables, and point allocation efficiency",
          inputSchema: {
            type: "object",
            properties: {
              build1: {
                type: "string",
                description: "First build file name",
              },
              build2: {
                type: "string",
                description: "Second build file name",
              },
            },
            required: ["build1", "build2"],
          },
        },
        {
          name: "test_allocation",
          description: "Test hypothetical passive tree changes and see stat impacts without modifying the build file. Supports natural language descriptions like 'allocate Point Blank' or 'remove Acrobatics'. When PoB Lua Bridge is enabled, provides real stat calculations; otherwise provides simulated analysis.",
          inputSchema: {
            type: "object",
            properties: {
              build_name: {
                type: "string",
                description: "Base build file name",
              },
              changes: {
                type: "string",
                description: "Natural language description of changes (e.g., 'allocate Point Blank keystone' or 'remove Acrobatics and reallocate to life nodes')",
              },
            },
            required: ["build_name", "changes"],
          },
        },
        {
          name: "plan_tree",
          description: "Plan passive tree allocation strategy. Recommend efficient paths to desired keystones, suggest notable clusters based on build goals, and provide leveling allocation recommendations. Can work from scratch or modify an existing build.",
          inputSchema: {
            type: "object",
            properties: {
              build_name: {
                type: "string",
                description: "Optional: Base build file to modify. If omitted, plans from scratch.",
              },
              goals: {
                type: "string",
                description: "Description of build goals (e.g., 'crit bow build, get Point Blank and crit nodes' or 'tanky life-based melee with resolute technique')",
              },
            },
            required: ["goals"],
          },
        },
        {
          name: "get_nearby_nodes",
          description: "Get unallocated notable and keystone nodes near the current passive tree allocation. Shows nodes within a specified distance (travel nodes away), including their stats, position, and the path cost to reach them. Essential for making informed pathing decisions.",
          inputSchema: {
            type: "object",
            properties: {
              build_name: {
                type: "string",
                description: "Build file to analyze",
              },
              max_distance: {
                type: "number",
                description: "Maximum distance in travel nodes (default: 5). Higher values show more distant options.",
              },
              filter: {
                type: "string",
                description: "Optional: Filter by stat keywords (e.g., 'life', 'evasion', 'critical'). Shows nodes whose stats contain these keywords.",
              },
            },
            required: ["build_name"],
          },
        },
        {
          name: "find_path_to_node",
          description: "Find the shortest path from the current passive tree to a target node. Shows all intermediate nodes that need to be allocated, the total point cost, and stats for each node along the way. Essential for planning tree expansions.",
          inputSchema: {
            type: "object",
            properties: {
              build_name: {
                type: "string",
                description: "Build file to analyze",
              },
              target_node_id: {
                type: "string",
                description: "Node ID to path to (e.g., '12345')",
              },
              show_alternatives: {
                type: "boolean",
                description: "If true, show up to 3 alternative paths if they exist (default: false)",
              },
            },
            required: ["build_name", "target_node_id"],
          },
        },
        {
          name: "allocate_nodes",
          description: "Allocate specific passive nodes by their IDs and calculate the exact stat changes using the PoB Lua engine. Shows before/after comparison with accurate DPS, life, defense calculations. Use this after finding a path with find_path_to_node to see the real impact.",
          inputSchema: {
            type: "object",
            properties: {
              build_name: {
                type: "string",
                description: "Build file to load and modify",
              },
              node_ids: {
                type: "array",
                items: { type: "string" },
                description: "Array of node IDs to allocate (e.g., ['12345', '23456', '34567']). Get these from get_nearby_nodes or find_path_to_node.",
              },
              show_full_stats: {
                type: "boolean",
                description: "If true, show all stats. If false, only show changed stats (default: false)",
              },
            },
            required: ["build_name", "node_ids"],
          },
        },
      ];

      // Add lua_* tools if enabled
      if (this.luaEnabled) {
        tools.push(
          {
            name: "lua_start",
            description: "Start the PoB headless API process. This will spawn the LuaJIT process that can load builds and compute stats using the actual PoB calculation engine.",
            inputSchema: {
              type: "object",
              properties: {},
            },
          },
          {
            name: "lua_stop",
            description: "Stop the PoB headless API process.",
            inputSchema: {
              type: "object",
              properties: {},
            },
          },
          {
            name: "lua_new_build",
            description: "Create a new empty build in the PoB headless session. This creates a blank build that you can then populate with items, skills, and passive tree selections.",
            inputSchema: {
              type: "object",
              properties: {},
              required: [],
            },
          },
          {
            name: "lua_load_build",
            description: "Load a Path of Building build into the PoB headless session. The build will be parsed and ready for stat calculations. Can load from a build name (recommended) or raw XML.",
            inputSchema: {
              type: "object",
              properties: {
                build_name: {
                  type: "string",
                  description: "Name of the build file to load (e.g., 'MyBuild.xml'). Recommended - avoids passing large XML through conversation.",
                },
                build_xml: {
                  type: "string",
                  description: "Raw XML content of the PoB build file. Only use if you have XML from another source (not a file in POB_DIRECTORY).",
                },
                name: {
                  type: "string",
                  description: "Optional name for the build (default: 'MCP Build')",
                },
              },
              required: [],
            },
          },
          {
            name: "lua_get_stats",
            description: "Get computed stats from the PoB calculation engine. Returns actual calculated values like Life, ES, DPS, resistances, etc.",
            inputSchema: {
              type: "object",
              properties: {
                fields: {
                  type: "array",
                  items: { type: "string" },
                  description: "Optional array of specific stat fields to return. If omitted, returns all available stats.",
                },
              },
            },
          },
          {
            name: "lua_get_tree",
            description: "Get the current passive tree data from PoB, including allocated nodes, class, ascendancy, and mastery selections.",
            inputSchema: {
              type: "object",
              properties: {},
            },
          },
          {
            name: "lua_set_tree",
            description: "Set the passive tree in PoB (class, ascendancy, allocated nodes, mastery effects). This will recalculate all stats based on the new tree.",
            inputSchema: {
              type: "object",
              properties: {
                classId: {
                  type: "number",
                  description: "Class ID (0=Scion, 1=Marauder, 2=Ranger, 3=Witch, 4=Duelist, 5=Templar, 6=Shadow)",
                },
                ascendClassId: {
                  type: "number",
                  description: "Ascendancy class ID",
                },
                secondaryAscendClassId: {
                  type: "number",
                  description: "Optional secondary ascendancy class ID (for Scion)",
                },
                nodes: {
                  type: "array",
                  items: { type: "number" },
                  description: "Array of allocated passive node IDs",
                },
                masteryEffects: {
                  type: "object",
                  description: "Optional object mapping mastery node IDs to selected effect IDs",
                },
                treeVersion: {
                  type: "string",
                  description: "Optional tree version string (e.g., '3_26')",
                },
              },
              required: ["classId", "ascendClassId", "nodes"],
            },
          },
          {
            name: "search_tree_nodes",
            description: "Search the passive tree for nodes by keyword. Returns node IDs, names, stats, types, and allocation status. Very useful for finding specific nodes like 'wand', 'herald', 'life', etc. You can filter by node type (notable, keystone, normal) and control whether to show already-allocated nodes. Use the returned node IDs with lua_set_tree or suggest_optimal_nodes.",
            inputSchema: {
              type: "object",
              properties: {
                keyword: {
                  type: "string",
                  description: "Keyword to search for in node names and stats (e.g., 'wand', 'herald', 'elemental damage', 'life')",
                },
                node_type: {
                  type: "string",
                  description: "Optional filter by node type: 'normal', 'notable', 'keystone', 'jewel', 'mastery', 'ascendancy'",
                  enum: ["normal", "notable", "keystone", "jewel", "mastery", "ascendancy"],
                },
                max_results: {
                  type: "number",
                  description: "Maximum number of results to return (default: 50)",
                },
                include_allocated: {
                  type: "boolean",
                  description: "Whether to include already-allocated nodes in results (default: true). Set to false to only see unallocated nodes.",
                },
              },
              required: ["keyword"],
            },
          }
        );

        // Phase 4: Item & Skill Tools
        tools.push(
          {
            name: "add_item",
            description: "Add an item to the build from PoE item text format (copied from game or trade site). The item will be added to the build and stats will be recalculated. Optionally specify a slot to equip it to.",
            inputSchema: {
              type: "object",
              properties: {
                item_text: {
                  type: "string",
                  description: "Item text in Path of Exile format (Rarity, name, mods, etc.)",
                },
                slot_name: {
                  type: "string",
                  description: "Optional slot to equip to (e.g., 'Weapon 1', 'Body Armour', 'Ring 1')",
                },
                no_auto_equip: {
                  type: "boolean",
                  description: "If true, add to inventory without auto-equipping (default: false)",
                },
              },
              required: ["item_text"],
            },
          },
          {
            name: "get_equipped_items",
            description: "Get all currently equipped items from the loaded build, including item details, mods, and flask activation status.",
            inputSchema: {
              type: "object",
              properties: {},
            },
          },
          {
            name: "toggle_flask",
            description: "Activate or deactivate a flask and recalculate stats. Flask number is 1-5 corresponding to flask slots.",
            inputSchema: {
              type: "object",
              properties: {
                flask_number: {
                  type: "number",
                  description: "Flask slot number (1-5)",
                },
                active: {
                  type: "boolean",
                  description: "true to activate, false to deactivate",
                },
              },
              required: ["flask_number", "active"],
            },
          },
          {
            name: "get_skill_setup",
            description: "Get all skill socket groups and current skill selection from the loaded build. Shows which skills are linked, which is the main skill, and which skills contribute to DPS calculations.",
            inputSchema: {
              type: "object",
              properties: {},
            },
          },
          {
            name: "set_main_skill",
            description: "Set which skill group and skill to use for stat calculations. This affects DPS calculations and shown stats. Useful for comparing different skills or skill parts.",
            inputSchema: {
              type: "object",
              properties: {
                socket_group: {
                  type: "number",
                  description: "Socket group index (1-based) to set as main",
                },
                active_skill_index: {
                  type: "number",
                  description: "Optional: which skill within the group to set as main (1-based)",
                },
                skill_part: {
                  type: "number",
                  description: "Optional: which part of a multi-part skill to use",
                },
              },
              required: ["socket_group"],
            },
          },
          {
            name: "create_socket_group",
            description: "Create a new empty socket group in the build. After creation, use add_gem to add gems to this group. This enables building skill setups from scratch.",
            inputSchema: {
              type: "object",
              properties: {
                label: {
                  type: "string",
                  description: "Optional label for the socket group (e.g., 'Main Skill', '6-Link')",
                },
                slot: {
                  type: "string",
                  description: "Optional item slot where skills are socketed (e.g., 'Body Armour', 'Helmet', 'Weapon 1')",
                },
                enabled: {
                  type: "boolean",
                  description: "Whether the skill group is enabled (default: true)",
                },
                include_in_full_dps: {
                  type: "boolean",
                  description: "Whether to include this skill in full DPS calculations (default: false)",
                },
              },
            },
          },
          {
            name: "add_gem",
            description: "Add a gem to an existing socket group. This allows you to build complete skill setups by adding active gems and support gems one by one. Gem names must match Path of Exile gem names exactly.",
            inputSchema: {
              type: "object",
              properties: {
                group_index: {
                  type: "number",
                  description: "Socket group index (1-based) to add the gem to. Use get_skill_setup to see group indices.",
                },
                gem_name: {
                  type: "string",
                  description: "Name of the gem to add (must match PoE gem name exactly, e.g., 'Fireball', 'Greater Multiple Projectiles Support')",
                },
                level: {
                  type: "number",
                  description: "Gem level (1-40, default: 20)",
                },
                quality: {
                  type: "number",
                  description: "Gem quality (0-23, default: 0)",
                },
                quality_id: {
                  type: "string",
                  description: "Quality type: 'Default', 'Alternate1' (Anomalous), 'Alternate2' (Divergent), 'Alternate3' (Phantasmal). Default: 'Default'",
                },
                enabled: {
                  type: "boolean",
                  description: "Whether the gem is enabled (default: true)",
                },
              },
              required: ["group_index", "gem_name"],
            },
          },
          {
            name: "set_gem_level",
            description: "Set the level of a gem in a socket group. Useful for comparing gem performance at different levels or testing level requirements.",
            inputSchema: {
              type: "object",
              properties: {
                group_index: {
                  type: "number",
                  description: "Socket group index (1-based)",
                },
                gem_index: {
                  type: "number",
                  description: "Gem index within the group (1-based). Use get_skill_setup to see gem order.",
                },
                level: {
                  type: "number",
                  description: "New gem level (1-40)",
                },
              },
              required: ["group_index", "gem_index", "level"],
            },
          },
          {
            name: "set_gem_quality",
            description: "Set the quality and quality type of a gem. Allows testing different quality levels and alternate quality types (Anomalous, Divergent, Phantasmal).",
            inputSchema: {
              type: "object",
              properties: {
                group_index: {
                  type: "number",
                  description: "Socket group index (1-based)",
                },
                gem_index: {
                  type: "number",
                  description: "Gem index within the group (1-based)",
                },
                quality: {
                  type: "number",
                  description: "Quality value (0-23)",
                },
                quality_id: {
                  type: "string",
                  description: "Quality type: 'Default', 'Alternate1' (Anomalous), 'Alternate2' (Divergent), 'Alternate3' (Phantasmal)",
                },
              },
              required: ["group_index", "gem_index", "quality"],
            },
          },
          {
            name: "remove_skill",
            description: "Remove an entire socket group from the build. Cannot remove special groups granted by items or passive tree nodes. Use get_skill_setup to see which groups can be removed.",
            inputSchema: {
              type: "object",
              properties: {
                group_index: {
                  type: "number",
                  description: "Socket group index (1-based) to remove",
                },
              },
              required: ["group_index"],
            },
          },
          {
            name: "remove_gem",
            description: "Remove a specific gem from a socket group. Useful for testing different support gem combinations or removing unwanted gems.",
            inputSchema: {
              type: "object",
              properties: {
                group_index: {
                  type: "number",
                  description: "Socket group index (1-based)",
                },
                gem_index: {
                  type: "number",
                  description: "Gem index within the group (1-based) to remove",
                },
              },
              required: ["group_index", "gem_index"],
            },
          }
        );

        // Phase 6: Build Optimization Tools
        tools.push(
          {
            name: "analyze_defenses",
            description: "Analyze defensive stats and identify weaknesses. Checks resistances, life pool, physical mitigation, and sustain. Provides prioritized recommendations for improvements. Automatically loads the specified build into the Lua bridge.",
            inputSchema: {
              type: "object",
              properties: {
                build_name: {
                  type: "string",
                  description: "Name of the build file to analyze (e.g., 'MyBuild.xml' or '3.27/MyBuild.xml'). Required.",
                },
              },
              required: ["build_name"],
            },
          },
          {
            name: "suggest_optimal_nodes",
            description: "Intelligently suggest the best passive tree nodes to allocate based on a specific goal. Analyzes reachable nodes, calculates actual stat impact using PoB's engine, and ranks by efficiency (stat gain per point). Goals: 'maximize_dps', 'maximize_life', 'maximize_es', 'resistances', 'armour', 'evasion', 'block', 'crit_chance', 'balanced', etc. Returns top recommendations with paths and stat projections.",
            inputSchema: {
              type: "object",
              properties: {
                build_name: {
                  type: "string",
                  description: "Name of the build file to optimize (e.g., 'MyBuild.xml')",
                },
                goal: {
                  type: "string",
                  description: "Optimization goal: 'maximize_dps', 'maximize_life', 'maximize_es', 'maximize_ehp', 'resistances', 'armour', 'evasion', 'block', 'spell_block', 'crit_chance', 'crit_multi', 'attack_speed', 'movement_speed', 'balanced', 'league_start', etc. Can also use natural language like 'increase life' or 'more damage'.",
                },
                max_points: {
                  type: "number",
                  description: "Maximum passive points willing to spend on a single allocation (default: 10). Paths longer than this are excluded.",
                },
                max_distance: {
                  type: "number",
                  description: "Maximum travel distance from current tree to search for nodes (default: 5). Increase to find more distant options.",
                },
                min_efficiency: {
                  type: "number",
                  description: "Minimum efficiency score to include in results (default: 0). Higher values filter out low-value nodes.",
                },
                include_keystones: {
                  type: "boolean",
                  description: "Include keystones in recommendations (default: true). Set false to only see notables.",
                },
              },
              required: ["build_name", "goal"],
            },
          },
          {
            name: "optimize_tree",
            description: "Full passive tree optimization that can both add AND remove nodes to find the best overall allocation. More powerful than suggest_optimal_nodes because it can reallocate existing points. Supports constraints (min life, min resists, etc.) and protected nodes. Goals: 'maximize_dps', 'maximize_life', 'maximize_es', 'maximize_ehp', 'balanced', 'league_start'. Uses iterative greedy algorithm with node swapping to maximize target stat while respecting constraints.",
            inputSchema: {
              type: "object",
              properties: {
                build_name: {
                  type: "string",
                  description: "Name of the build file to optimize (e.g., 'MyBuild.xml')",
                },
                goal: {
                  type: "string",
                  description: "Optimization goal: 'maximize_dps', 'maximize_life', 'maximize_es', 'maximize_ehp', 'balanced', 'league_start'. Use 'balanced' to optimize both offense and defense, or 'league_start' to prioritize survivability.",
                },
                max_points: {
                  type: "number",
                  description: "Maximum total passive points to use (default: current allocation + 5). Set this to your target level's point budget.",
                },
                max_iterations: {
                  type: "number",
                  description: "Maximum optimization iterations (default: 20). Higher values may find better results but take longer.",
                },
                constraints: {
                  type: "object",
                  description: "Defensive constraints that must be maintained (e.g., {minLife: 4000, minFireResist: 75})",
                  properties: {
                    minLife: { type: "number" },
                    minES: { type: "number" },
                    minEHP: { type: "number" },
                    minFireResist: { type: "number" },
                    minColdResist: { type: "number" },
                    minLightningResist: { type: "number" },
                    minChaosResist: { type: "number" },
                    protectedNodes: {
                      type: "array",
                      items: { type: "string" },
                      description: "Node IDs that cannot be removed during optimization",
                    },
                  },
                },
              },
              required: ["build_name", "goal"],
            },
          }
        );
      }

      return { tools };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        // Create handler contexts
        const handlerContext = {
          buildService: this.buildService,
          treeService: this.treeService,
        };

        const watchContext = {
          buildService: this.buildService,
          treeService: this.treeService,
          watchService: this.watchService,
        };

        const treeContext = {
          buildService: this.buildService,
          treeService: this.treeService,
        };

        const luaContext = {
          pobDirectory: this.pobDirectory,
          luaEnabled: this.luaEnabled,
          useTcpMode: this.useTcpMode,
          getLuaClient: () => this.luaClient,
          ensureLuaClient: () => this.ensureLuaClient(),
          stopLuaClient: () => this.stopLuaClient(),
        };

        const itemSkillContext = {
          getLuaClient: () => this.luaClient,
          ensureLuaClient: () => this.ensureLuaClient(),
        };

        const optimizationContext = {
          buildService: this.buildService,
          treeService: this.treeService,
          pobDirectory: this.pobDirectory,
          getLuaClient: () => this.luaClient,
          ensureLuaClient: () => this.ensureLuaClient(),
        };

        switch (name) {
          case "list_builds":
            return await handleListBuilds(handlerContext);

          case "analyze_build":
            if (!args) throw new Error("Missing arguments");
            return await handleAnalyzeBuild(handlerContext, args.build_name as string);

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

          // Phase 6: Build Optimization tools
          case "analyze_defenses":
            return await handleAnalyzeDefenses(optimizationContext, args?.build_name as string | undefined);

          case "suggest_optimal_nodes":
            if (!args) throw new Error("Missing arguments");
            return await handleSuggestOptimalNodes(
              optimizationContext,
              args.build_name as string,
              args.goal as string,
              args.max_points as number | undefined,
              args.max_distance as number | undefined,
              args.min_efficiency as number | undefined,
              args.include_keystones as boolean | undefined
            );

          case "optimize_tree":
            if (!args) throw new Error("Missing arguments");
            return await handleOptimizeTree(
              optimizationContext,
              args.build_name as string,
              args.goal as string,
              args.max_points as number | undefined,
              args.max_iterations as number | undefined,
              args.constraints as OptimizationConstraints | undefined
            );

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

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Path of Building MCP Server running on stdio");
  }
}

// Start the server
const server = new PoBMCPServer();
server.run().catch(console.error);
