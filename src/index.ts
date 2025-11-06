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
import { SkillGemService } from "./services/skillGemService.js";
import { TradeApiClient } from "./services/tradeClient.js";
import { StatMapper } from "./services/statMapper.js";
import { PoeNinjaClient } from "./services/poeNinjaClient.js";
import { ItemRecommendationEngine } from "./services/itemRecommendationEngine.js";

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
import { getToolSchemas, getLuaToolSchemas, getOptimizationToolSchemas, getConfigToolSchemas, getValidationToolSchemas, getExportToolSchemas, getSkillGemToolSchemas, getTradeToolSchemas, getPoeNinjaToolSchemas } from "./server/toolSchemas.js";
import { routeToolCall, type ToolRouterDependencies } from "./server/toolRouter.js";
import { wrapWithTruncation } from "./server/responseUtils.js";

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
  private skillGemService: SkillGemService;
  private tradeClient: TradeApiClient | null = null;
  private statMapper: StatMapper | null = null;
  private recommendationEngine: ItemRecommendationEngine | null = null;
  private ninjaClient: PoeNinjaClient;

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
    this.skillGemService = new SkillGemService();

    // Initialize poe.ninja client (always available)
    this.ninjaClient = new PoeNinjaClient();
    console.error('[poe.ninja API] Client initialized');

    // Initialize Trade API client (if enabled)
    const tradeEnabled = process.env.POE_TRADE_ENABLED === 'true';
    if (tradeEnabled) {
      const requestsPerSecond = parseInt(process.env.POE_RATE_LIMIT_PER_SECOND || '4', 10);
      const cacheTTL = parseInt(process.env.POE_CACHE_TTL || '300', 10);
      this.tradeClient = new TradeApiClient({
        requestsPerSecond,
        cacheTTL,
      });
      this.statMapper = new StatMapper();
      this.recommendationEngine = new ItemRecommendationEngine(this.tradeClient, this.statMapper);
      console.error('[Trade API] Enabled with rate limit:', requestsPerSecond, 'req/s');
    } else {
      console.error('[Trade API] Disabled (set POE_TRADE_ENABLED=true to enable)');
    }

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
      skillGemService: this.skillGemService,
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
        tools.push(...getConfigToolSchemas()); // Phase 9: Config tools (require Lua)
      }

      // Add optimization tools
      tools.push(...getOptimizationToolSchemas());

      // Add validation tools
      tools.push(...getValidationToolSchemas());

      // Add export and persistence tools
      tools.push(...getExportToolSchemas());

      // Add skill gem analysis tools
      tools.push(...getSkillGemToolSchemas());

      // Add Trade API tools if enabled
      if (this.tradeClient) {
        tools.push(...getTradeToolSchemas());
      }

      // Add poe.ninja API tools (always available)
      tools.push(...getPoeNinjaToolSchemas());

      return { tools };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        // Build router dependencies
        const routerDeps: ToolRouterDependencies = {
          toolGate: this.toolGate,
          contextBuilder: this.contextBuilder,
          tradeClient: this.tradeClient,
          statMapper: this.statMapper,
          recommendationEngine: this.recommendationEngine,
          ninjaClient: this.ninjaClient,
          getLuaClient: () => this.luaClientManager.getClient(),
          ensureLuaClient: () => this.luaClientManager.ensureClient(),
        };

        // Route the tool call
        const result = await routeToolCall(name, args, routerDeps);

        // Apply truncation for specific tools that return large outputs
        const truncatedTools = ['analyze_build', 'analyze_defenses', 'suggest_optimal_nodes',
                                'optimize_tree', 'analyze_items', 'optimize_skill_links',
                                'create_budget_build'];

        if (truncatedTools.includes(name)) {
          return wrapWithTruncation(result);
        }

        return result;
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

  /**
   * Initialize async components
   */
  private async initialize() {
    // Load official stat data from PoE trade API (if enabled)
    if (this.tradeClient && this.statMapper) {
      try {
        console.error('[StatMapper] Loading stats from PoE trade API...');
        const statData = await this.tradeClient.getStatData();
        await this.statMapper.loadFromTradeAPI(statData);
        console.error('[StatMapper] Successfully loaded official stat data');
      } catch (error) {
        console.error('[StatMapper] Failed to load official stats, using static fallback:', error);
        // Static mappings already loaded in constructor as fallback
      }
    }
  }

  async run() {
    // Initialize async components first
    await this.initialize();

    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Path of Building MCP Server running on stdio");
  }
}

// Start the server
const server = new PoBMCPServer();
server.run().catch(console.error);
