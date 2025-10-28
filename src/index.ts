#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { XMLParser } from "fast-xml-parser";
import fs from "fs/promises";
import path from "path";
import os from "os";
import chokidar from "chokidar";
import https from "https";

// Passive Tree Data Interfaces
interface PassiveTreeNode {
  skill: number;
  name?: string;
  icon?: string;
  stats?: string[];
  isKeystone?: boolean;
  isNotable?: boolean;
  isMastery?: boolean;
  isJewelSocket?: boolean;
  isAscendancyStart?: boolean;
  group?: number;
  orbit?: number;
  orbitIndex?: number;
  out?: string[];
  in?: string[];
  reminderText?: string[];
  flavourText?: string[];
}

interface PassiveTreeData {
  nodes: Map<string, PassiveTreeNode>;
  version: string;
  classes?: any[];
  groups?: any[];
}

interface TreeDataCache {
  data: PassiveTreeData;
  timestamp: number;
}

// Path of Building build interface
interface PoBBuild {
  Build?: {
    level?: string;
    className?: string;
    ascendClassName?: string;
    PlayerStat?: Array<{stat: string; value: string}> | {stat: string; value: string};
  };
  Tree?: {
    Spec?: {
      title?: string;
      URL?: string;
      nodes?: string;
      treeVersion?: string;
    };
  };
  Skills?: {
    SkillSet?: {
      Skill?: Array<{
        enabled?: string;
        Gem?: Array<{name?: string; level?: string; quality?: string}>;
      }>;
    };
  };
  Items?: {
    ItemSet?: {
      Slot?: Array<{
        name?: string;
        Item?: string;
      }>;
    };
  };
  Notes?: string;
}

// Build cache entry interface
interface CachedBuild {
  data: PoBBuild;
  timestamp: number;
}

// Tree Analysis Results
interface TreeAnalysisResult {
  totalPoints: number;
  availablePoints: number;
  allocatedNodes: PassiveTreeNode[];
  keystones: PassiveTreeNode[];
  notables: PassiveTreeNode[];
  jewels: PassiveTreeNode[];
  normalNodes: PassiveTreeNode[];
  archetype: string;
  archetypeConfidence: string;
  pathingEfficiency: string;
  buildVersion?: string;
  treeVersion: string;
  versionMismatch: boolean;
  invalidNodeIds: string[];
}

class PoBMCPServer {
  private server: Server;
  private parser: XMLParser;
  private pobDirectory: string;
  private watcher: ReturnType<typeof chokidar.watch> | null = null;
  private buildCache: Map<string, CachedBuild> = new Map();
  private treeDataCache: Map<string, TreeDataCache> = new Map();
  private recentChanges: Array<{file: string; timestamp: number; type: string}> = [];
  private watchEnabled: boolean = false;
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();

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
    this.pobDirectory = process.env.POB_DIRECTORY ||
      path.join(os.homedir(), "Documents", "Path of Building", "Builds");

    this.setupHandlers();

    // Error handling
    this.server.onerror = (error) => {
      console.error("[MCP Error]", error);
    };

    process.on("SIGINT", async () => {
      await this.stopWatching();
      await this.server.close();
      process.exit(0);
    });
  }

  // Tree Data Fetching
  private async fetchTreeData(version: string = "3_26"): Promise<PassiveTreeData> {
    console.error(`[Tree Data] Fetching tree data for version ${version}...`);

    const url = `https://raw.githubusercontent.com/PathOfBuildingCommunity/PathOfBuilding/master/src/TreeData/${version}/tree.lua`;

    return new Promise((resolve, reject) => {
      https.get(url, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`Failed to fetch tree data: HTTP ${response.statusCode}`));
          return;
        }

        let data = '';
        response.on('data', (chunk) => {
          data += chunk;
        });

        response.on('end', () => {
          try {
            const treeData = this.parseTreeLua(data, version);
            console.error(`[Tree Data] Successfully parsed ${treeData.nodes.size} nodes`);
            resolve(treeData);
          } catch (error) {
            reject(new Error(`Failed to parse tree data: ${error}`));
          }
        });
      }).on('error', (error) => {
        reject(new Error(`Network error fetching tree data: ${error.message}`));
      });
    });
  }

  private parseTreeLua(luaContent: string, version: string): PassiveTreeData {
    const nodes = new Map<string, PassiveTreeNode>();

    // Extract nodes section using regex
    // Nodes are defined like: [12345]= { ... }
    const nodePattern = /\[(\d+)\]=\s*\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/g;

    let match;
    while ((match = nodePattern.exec(luaContent)) !== null) {
      const nodeId = match[1];
      const nodeContent = match[2];

      try {
        const node = this.parseNodeContent(nodeId, nodeContent);
        if (node) {
          nodes.set(nodeId, node);
        }
      } catch (error) {
        // Skip malformed nodes
        continue;
      }
    }

    return {
      nodes,
      version,
    };
  }

  private parseNodeContent(nodeId: string, content: string): PassiveTreeNode | null {
    const node: PassiveTreeNode = {
      skill: parseInt(nodeId),
    };

    // Extract name
    const nameMatch = content.match(/\["name"\]=\s*"([^"]+)"/);
    if (nameMatch) node.name = nameMatch[1];

    // Extract icon
    const iconMatch = content.match(/\["icon"\]=\s*"([^"]+)"/);
    if (iconMatch) node.icon = iconMatch[1];

    // Extract stats (can be multiple)
    const stats: string[] = [];
    const statsMatch = content.match(/\["stats"\]=\s*\{([^}]+)\}/);
    if (statsMatch) {
      const statsContent = statsMatch[1];
      const statPattern = /"([^"]+)"/g;
      let statMatch;
      while ((statMatch = statPattern.exec(statsContent)) !== null) {
        stats.push(statMatch[1]);
      }
    }
    if (stats.length > 0) node.stats = stats;

    // Extract boolean flags
    if (content.includes('["isKeystone"]= true')) node.isKeystone = true;
    if (content.includes('["isNotable"]= true')) node.isNotable = true;
    if (content.includes('["isMastery"]= true')) node.isMastery = true;
    if (content.includes('["isJewelSocket"]= true')) node.isJewelSocket = true;
    if (content.includes('["isAscendancyStart"]= true')) node.isAscendancyStart = true;

    // Extract connections
    const outMatch = content.match(/\["out"\]=\s*\{([^}]+)\}/);
    if (outMatch) {
      const outContent = outMatch[1];
      node.out = outContent.match(/"(\d+)"/g)?.map(s => s.replace(/"/g, '')) || [];
    }

    const inMatch = content.match(/\["in"\]=\s*\{([^}]+)\}/);
    if (inMatch) {
      const inContent = inMatch[1];
      node.in = inContent.match(/"(\d+)"/g)?.map(s => s.replace(/"/g, '')) || [];
    }

    return node;
  }

  private async getTreeData(version: string = "3_26"): Promise<PassiveTreeData> {
    // Check cache first
    const cached = this.treeDataCache.get(version);
    if (cached) {
      console.error(`[Tree Cache] Hit for version ${version}`);
      return cached.data;
    }

    // Cache miss - fetch from source
    console.error(`[Tree Cache] Miss for version ${version}`);
    const treeData = await this.fetchTreeData(version);

    // Store in cache
    this.treeDataCache.set(version, {
      data: treeData,
      timestamp: Date.now(),
    });

    return treeData;
  }

  private async refreshTreeData(version?: string): Promise<void> {
    if (version) {
      this.treeDataCache.delete(version);
      console.error(`[Tree Cache] Cleared cache for version ${version}`);
    } else {
      this.treeDataCache.clear();
      console.error(`[Tree Cache] Cleared all cached tree data`);
    }
  }

  // Tree Analysis Methods
  private parseAllocatedNodes(build: PoBBuild): string[] {
    if (!build.Tree?.Spec?.nodes) {
      return [];
    }

    const nodesStr = build.Tree.Spec.nodes;
    return nodesStr.split(',').map(n => n.trim()).filter(n => n.length > 0);
  }

  private extractBuildVersion(build: PoBBuild): string {
    // Try to extract from Tree URL
    if (build.Tree?.Spec?.URL) {
      const urlMatch = build.Tree.Spec.URL.match(/version=([^&]+)/);
      if (urlMatch) {
        return urlMatch[1];
      }
    }

    // Try to extract from treeVersion field
    if (build.Tree?.Spec?.treeVersion) {
      return build.Tree.Spec.treeVersion;
    }

    return "Unknown";
  }

  private async mapNodesToDetails(
    nodeIds: string[],
    treeData: PassiveTreeData
  ): Promise<{ nodes: PassiveTreeNode[]; invalidIds: string[] }> {
    const nodes: PassiveTreeNode[] = [];
    const invalidIds: string[] = [];

    for (const nodeId of nodeIds) {
      const node = treeData.nodes.get(nodeId);
      if (!node) {
        invalidIds.push(nodeId);
      } else {
        nodes.push(node);
      }
    }

    return { nodes, invalidIds };
  }

  private categorizeNodes(nodes: PassiveTreeNode[]): {
    keystones: PassiveTreeNode[];
    notables: PassiveTreeNode[];
    jewels: PassiveTreeNode[];
    normal: PassiveTreeNode[];
  } {
    const keystones: PassiveTreeNode[] = [];
    const notables: PassiveTreeNode[] = [];
    const jewels: PassiveTreeNode[] = [];
    const normal: PassiveTreeNode[] = [];

    for (const node of nodes) {
      if (node.isKeystone) {
        keystones.push(node);
      } else if (node.isNotable || node.isMastery) {
        notables.push(node);
      } else if (node.isJewelSocket) {
        jewels.push(node);
      } else {
        normal.push(node);
      }
    }

    return { keystones, notables, jewels, normal };
  }

  private calculatePassivePoints(build: PoBBuild, allocatedCount: number): {
    total: number;
    available: number;
  } {
    const level = parseInt(build.Build?.level || "1");

    // Base points: 1 per level starting at level 2
    // Plus quest rewards: approximately 22-24 points
    const basePoints = Math.max(0, level - 1);
    const questPoints = 22; // Approximate
    const available = basePoints + questPoints;

    return {
      total: allocatedCount,
      available,
    };
  }

  private detectArchetype(keystones: PassiveTreeNode[], notables: PassiveTreeNode[]): {
    archetype: string;
    confidence: string;
  } {
    const archetypeMarkers: string[] = [];
    let confidence = "Low";

    // Keystone-based detection
    for (const keystone of keystones) {
      const name = keystone.name || "";
      const stats = keystone.stats?.join(" ") || "";

      if (name === "Resolute Technique") {
        archetypeMarkers.push("Attack-based (Non-crit)");
        confidence = "High";
      } else if (name === "Chaos Inoculation") {
        archetypeMarkers.push("Energy Shield");
        confidence = "High";
      } else if (name === "Acrobatics" || name === "Phase Acrobatics") {
        archetypeMarkers.push("Evasion/Dodge");
        confidence = "High";
      } else if (name === "Avatar of Fire") {
        archetypeMarkers.push("Fire Conversion");
        confidence = "High";
      } else if (name === "Elemental Overload") {
        archetypeMarkers.push("Elemental (Non-crit scaling)");
        confidence = "High";
      } else if (name === "Point Blank") {
        archetypeMarkers.push("Projectile Attack");
        confidence = "High";
      } else if (stats.includes("Critical")) {
        archetypeMarkers.push("Critical Strike");
        confidence = "Medium";
      } else if (name === "Pain Attunement") {
        archetypeMarkers.push("Low Life");
        confidence = "High";
      }
    }

    // Analyze life/ES focus from notables
    let lifeCount = 0;
    let esCount = 0;
    for (const notable of notables.slice(0, 20)) { // Check first 20 notables
      const stats = notable.stats?.join(" ") || "";
      if (stats.toLowerCase().includes("maximum life")) lifeCount++;
      if (stats.toLowerCase().includes("energy shield")) esCount++;
    }

    if (lifeCount > esCount + 2 && !archetypeMarkers.includes("Energy Shield")) {
      archetypeMarkers.push("Life-based");
      if (confidence === "Low") confidence = "Medium";
    } else if (esCount > lifeCount + 2 && !archetypeMarkers.includes("Energy Shield")) {
      archetypeMarkers.push("Hybrid Life/ES");
      if (confidence === "Low") confidence = "Medium";
    }

    if (archetypeMarkers.length === 0) {
      return { archetype: "Unspecified", confidence: "Low" };
    }

    return {
      archetype: archetypeMarkers.join(", "),
      confidence,
    };
  }

  private analyzePathingEfficiency(
    allocatedNodes: PassiveTreeNode[],
    keystones: PassiveTreeNode[],
    notables: PassiveTreeNode[],
    jewels: PassiveTreeNode[]
  ): string {
    const totalNodes = allocatedNodes.length;
    const destinationNodes = keystones.length + notables.length + jewels.length;
    const pathingNodes = totalNodes - destinationNodes;

    if (totalNodes === 0) return "No nodes allocated";

    const ratio = pathingNodes / destinationNodes;

    if (ratio < 1.5) {
      return "Excellent";
    } else if (ratio < 2.5) {
      return "Good";
    } else if (ratio < 3.5) {
      return "Moderate";
    } else {
      return "Inefficient";
    }
  }

  private async analyzePassiveTree(build: PoBBuild): Promise<TreeAnalysisResult | null> {
    try {
      // Extract allocated node IDs
      const nodeIds = this.parseAllocatedNodes(build);
      if (nodeIds.length === 0) {
        return null; // No tree data in build
      }

      // Get tree data (with caching)
      const treeData = await this.getTreeData("3_26");

      // Map node IDs to details
      const { nodes: allocatedNodes, invalidIds } = await this.mapNodesToDetails(nodeIds, treeData);

      // If there are invalid nodes, fail with error
      if (invalidIds.length > 0) {
        throw new Error(`Invalid passive tree data detected.\n\nThe following node IDs could not be found in the passive tree data:\n${invalidIds.map(id => `- Node ID: ${id}`).join('\n')}\n\nThis usually means:\n1. The build is from an outdated league/patch\n2. The build file is corrupted\n3. The passive tree data needs to be refreshed\n\nPlease verify the build is from the current league or use a build from the active league.`);
      }

      // Categorize nodes
      const { keystones, notables, jewels, normal } = this.categorizeNodes(allocatedNodes);

      // Calculate points
      const points = this.calculatePassivePoints(build, allocatedNodes.length);

      // Detect archetype
      const { archetype, confidence } = this.detectArchetype(keystones, notables);

      // Analyze pathing
      const pathingEfficiency = this.analyzePathingEfficiency(allocatedNodes, keystones, notables, jewels);

      // Version detection
      const buildVersion = this.extractBuildVersion(build);
      const treeVersion = treeData.version;
      const versionMismatch = buildVersion !== "Unknown" && !treeVersion.includes(buildVersion);

      return {
        totalPoints: points.total,
        availablePoints: points.available,
        allocatedNodes,
        keystones,
        notables,
        jewels,
        normalNodes: normal,
        archetype,
        archetypeConfidence: confidence,
        pathingEfficiency,
        buildVersion,
        treeVersion,
        versionMismatch,
        invalidNodeIds: [],
      };
    } catch (error) {
      throw error;
    }
  }

  private formatTreeAnalysis(analysis: TreeAnalysisResult): string {
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

    return output;
  }

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
        const builds = await this.listBuilds();
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
      const buildPath = path.join(this.pobDirectory, buildName);

      try {
        const content = await fs.readFile(buildPath, "utf-8");
        const parsed = this.parser.parse(content);
        const summary = this.generateBuildSummary(parsed.PathOfBuilding);

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
      return {
        tools: [
          {
            name: "analyze_build",
            description: "Analyze a Path of Building build file and extract detailed information including stats, skills, gear, and passive skill tree analysis with keystones, notables, jewel sockets, and build archetype detection",
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
        ],
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case "list_builds":
            return await this.handleListBuilds();

          case "analyze_build":
            if (!args) throw new Error("Missing arguments");
            return await this.handleAnalyzeBuild(args.build_name as string);

          case "compare_builds":
            if (!args) throw new Error("Missing arguments");
            return await this.handleCompareBuilds(
              args.build1 as string,
              args.build2 as string
            );

          case "get_build_stats":
            if (!args) throw new Error("Missing arguments");
            return await this.handleGetBuildStats(args.build_name as string);

          case "start_watching":
            return this.handleStartWatching();

          case "stop_watching":
            return await this.handleStopWatching();

          case "get_recent_changes":
            return this.handleGetRecentChanges(args?.limit as number | undefined);

          case "watch_status":
            return this.handleWatchStatus();

          case "refresh_tree_data":
            return await this.handleRefreshTreeData(args?.version as string | undefined);

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error: ${error}`,
            },
          ],
        };
      }
    });
  }

  private async listBuilds(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.pobDirectory);
      return files.filter((file) => file.endsWith(".xml"));
    } catch (error) {
      console.error("Could not read PoB directory:", error);
      return [];
    }
  }

  private async readBuild(buildName: string): Promise<PoBBuild> {
    // Check cache first
    const cached = this.buildCache.get(buildName);
    if (cached) {
      console.error(`[Cache] Hit for ${buildName}`);
      return cached.data;
    }

    // Cache miss - read from file
    console.error(`[Cache] Miss for ${buildName}`);
    const buildPath = path.join(this.pobDirectory, buildName);
    const content = await fs.readFile(buildPath, "utf-8");
    const parsed = this.parser.parse(content);
    const buildData = parsed.PathOfBuilding;

    // Store in cache
    this.buildCache.set(buildName, {
      data: buildData,
      timestamp: Date.now()
    });

    return buildData;
  }

  private generateBuildSummary(build: PoBBuild): string {
    let summary = "=== Path of Building Build Summary ===\n\n";

    // Basic info
    if (build.Build) {
      summary += `Class: ${build.Build.className || "Unknown"}\n`;
      summary += `Ascendancy: ${build.Build.ascendClassName || "None"}\n`;
      summary += `Level: ${build.Build.level || "Unknown"}\n\n`;

      // Stats
      if (build.Build.PlayerStat) {
        summary += "=== Stats ===\n";
        const stats = Array.isArray(build.Build.PlayerStat)
          ? build.Build.PlayerStat
          : [build.Build.PlayerStat];

        for (const stat of stats) {
          summary += `${stat.stat}: ${stat.value}\n`;
        }
        summary += "\n";
      }
    }

    // Skills
    if (build.Skills?.SkillSet?.Skill) {
      summary += "=== Skills ===\n";
      const skills = Array.isArray(build.Skills.SkillSet.Skill)
        ? build.Skills.SkillSet.Skill
        : [build.Skills.SkillSet.Skill];

      for (const skill of skills) {
        if (skill.Gem) {
          const gems = Array.isArray(skill.Gem) ? skill.Gem : [skill.Gem];
          summary += gems.map(g => `${g.name} (${g.level}/${g.quality})`).join(" - ");
          summary += "\n";
        }
      }
      summary += "\n";
    }

    // Items
    if (build.Items?.ItemSet?.Slot) {
      summary += "=== Items ===\n";
      const slots = Array.isArray(build.Items.ItemSet.Slot)
        ? build.Items.ItemSet.Slot
        : [build.Items.ItemSet.Slot];

      for (const slot of slots) {
        if (slot.Item) {
          const itemLines = slot.Item.split("\n");
          summary += `${slot.name}: ${itemLines[0]}\n`;
        }
      }
      summary += "\n";
    }

    // Notes
    if (build.Notes) {
      summary += "=== Notes ===\n";
      summary += build.Notes.trim() + "\n";
    }

    return summary;
  }

  private async handleListBuilds() {
    const builds = await this.listBuilds();
    return {
      content: [
        {
          type: "text",
          text: builds.length > 0
            ? `Available builds:\n${builds.map((b, i) => `${i + 1}. ${b}`).join("\n")}`
            : "No builds found in the Path of Building directory.",
        },
      ],
    };
  }

  private async handleAnalyzeBuild(buildName: string) {
    const build = await this.readBuild(buildName);
    let summary = this.generateBuildSummary(build);

    // Add tree analysis
    try {
      const treeAnalysis = await this.analyzePassiveTree(build);
      if (treeAnalysis) {
        summary += this.formatTreeAnalysis(treeAnalysis);
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
              type: "text",
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
          type: "text",
          text: summary,
        },
      ],
    };
  }

  private async handleCompareBuilds(build1Name: string, build2Name: string) {
    const build1 = await this.readBuild(build1Name);
    const build2 = await this.readBuild(build2Name);

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
          type: "text",
          text: comparison,
        },
      ],
    };
  }

  private async handleGetBuildStats(buildName: string) {
    const build = await this.readBuild(buildName);

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
          type: "text",
          text: statsText,
        },
      ],
    };
  }

  private handleStartWatching() {
    if (this.watchEnabled) {
      return {
        content: [
          {
            type: "text",
            text: "File watching is already enabled.",
          },
        ],
      };
    }

    this.startWatching();

    return {
      content: [
        {
          type: "text",
          text: `File watching started for: ${this.pobDirectory}\n\nYour builds will now be automatically reloaded when saved in Path of Building.`,
        },
      ],
    };
  }

  private async handleStopWatching() {
    if (!this.watchEnabled) {
      return {
        content: [
          {
            type: "text",
            text: "File watching is not currently enabled.",
          },
        ],
      };
    }

    await this.stopWatching();

    return {
      content: [
        {
          type: "text",
          text: "File watching stopped.",
        },
      ],
    };
  }

  private handleGetRecentChanges(limit?: number) {
    const maxChanges = limit || 10;
    const changes = this.recentChanges.slice(-maxChanges).reverse();

    if (changes.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: "No recent changes detected.\n\nMake sure file watching is enabled with 'start_watching'.",
          },
        ],
      };
    }

    let text = `=== Recent Build Changes (Last ${changes.length}) ===\n\n`;

    for (const change of changes) {
      const timeAgo = this.formatTimeAgo(Date.now() - change.timestamp);
      text += `[${change.type.toUpperCase()}] ${change.file} - ${timeAgo}\n`;
    }

    return {
      content: [
        {
          type: "text",
          text,
        },
      ],
    };
  }

  private handleWatchStatus() {
    const cacheSize = this.buildCache.size;
    const changeCount = this.recentChanges.length;
    const treeCacheSize = this.treeDataCache.size;

    let text = `=== File Watching Status ===\n\n`;
    text += `Status: ${this.watchEnabled ? "ENABLED" : "DISABLED"}\n`;
    text += `Directory: ${this.pobDirectory}\n`;
    text += `Cached builds: ${cacheSize}\n`;
    text += `Cached tree versions: ${treeCacheSize}\n`;
    text += `Recent changes tracked: ${changeCount}\n`;

    if (!this.watchEnabled) {
      text += `\nUse 'start_watching' to enable automatic build reloading.`;
    }

    return {
      content: [
        {
          type: "text",
          text,
        },
      ],
    };
  }

  private async handleRefreshTreeData(version?: string) {
    await this.refreshTreeData(version);

    return {
      content: [
        {
          type: "text",
          text: version
            ? `Passive tree data cache cleared for version ${version}.\n\nTree data will be re-fetched on next analysis.`
            : `All passive tree data caches cleared.\n\nTree data will be re-fetched on next analysis.`,
        },
      ],
    };
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
