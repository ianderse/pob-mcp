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
import { PoBLuaApiClient, PoBLuaTcpClient } from "./pobLuaBridge.js";
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
  getGoalDescription as getOptGoalDescription,
  findRemovableNodes,
  formatOptimizationResult,
  parseOptimizationGoal,
} from "./treeOptimizer.js";

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
  ascendancyName?: string;
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

// Phase 2: Optimization Suggestion Interfaces
interface PathOptimization {
  destination: string;
  currentLength: number;
  optimalLength: number;
  pointsSaved: number;
  suggestion: string;
}

interface EfficiencyScore {
  nodeId: string;
  nodeName: string;
  statsPerPoint: number;
  isLowValue: boolean;
}

interface OptimizationSuggestion {
  type: 'path' | 'efficiency' | 'reachable' | 'ai-context';
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  pointsSaved?: number;
  potentialGain?: string;
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
  optimizationSuggestions?: OptimizationSuggestion[];
}

// Phase 3: Tree Comparison Interface
interface TreeComparison {
  build1: {
    name: string;
    analysis: TreeAnalysisResult;
  };
  build2: {
    name: string;
    analysis: TreeAnalysisResult;
  };
  differences: {
    uniqueToBuild1: PassiveTreeNode[];
    uniqueToBuild2: PassiveTreeNode[];
    sharedNodes: PassiveTreeNode[];
    pointDifference: number;
    archetypeDifference: string;
  };
}

// Phase 3: Allocation Change Interface
interface AllocationChange {
  type: 'allocate' | 'remove';
  nodeIdentifier: string;
  node?: PassiveTreeNode;
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
      await this.stopWatching();
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
  private async fetchTreeData(version: string = "3_26"): Promise<PassiveTreeData> {
    console.error(`[Tree Data] Fetching tree data for version ${version}...`);

    const url = `https://raw.githubusercontent.com/PathOfBuildingCommunity/PathOfBuilding/master/src/TreeData/${version}/tree.lua`;

    return new Promise((resolve, reject) => {
      https.get(url, (response) => {
        if (response.statusCode === 404) {
          // Version not found, try fallback to 3_26
          console.error(`[Tree Data] Version ${version} not found, falling back to 3_26`);
          if (version !== "3_26") {
            this.fetchTreeData("3_26").then(resolve).catch(reject);
            return;
          }
          reject(new Error(`Failed to fetch tree data: HTTP ${response.statusCode}`));
          return;
        }
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

    // Extract nodes with brace counting for proper nesting
    const nodeStartPattern = /\[(\d+)\]=\s*\{/g;

    let match;
    while ((match = nodeStartPattern.exec(luaContent)) !== null) {
      const nodeId = match[1];
      const startPos = match.index + match[0].length;

      // Count braces to find the matching closing brace
      let braceCount = 1;
      let endPos = startPos;

      while (braceCount > 0 && endPos < luaContent.length) {
        if (luaContent[endPos] === '{') {
          braceCount++;
        } else if (luaContent[endPos] === '}') {
          braceCount--;
        }
        endPos++;
      }

      if (braceCount === 0) {
        const nodeContent = luaContent.substring(startPos, endPos - 1);

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

    // Extract ascendancy name if present
    const ascendancyNameMatch = content.match(/\["ascendancyName"\]=\s*"([^"]+)"/);
    if (ascendancyNameMatch) {
      node.ascendancyName = ascendancyNameMatch[1];
    }

    // Extract connections (allowing for multiline and nested content)
    const outMatch = content.match(/\["out"\]=\s*\{([^}]*)\}/);
    if (outMatch) {
      const outContent = outMatch[1];
      // Match quoted numbers: "12345"
      const matches = outContent.match(/"(\d+)"/g);
      if (matches) {
        node.out = matches.map(s => s.replace(/"/g, ''));
      }
    }

    const inMatch = content.match(/\["in"\]=\s*\{([^}]*)\}/);
    if (inMatch) {
      const inContent = inMatch[1];
      // Match quoted numbers: "12345"
      const matches = inContent.match(/"(\d+)"/g);
      if (matches) {
        node.in = matches.map(s => s.replace(/"/g, ''));
      }
    }

    // Debug: Log first few nodes with connections
    if (node.out && node.out.length > 0) {
      if (parseInt(nodeId) < 100) {
        console.error(`[Parse Node] Node ${nodeId} has ${node.out.length} out connections: ${node.out.slice(0, 3).join(', ')}`);
      }
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

  private findNearbyNodes(
    allocatedNodes: Set<string>,
    treeData: PassiveTreeData,
    maxDistance: number,
    filter?: string
  ): Array<{ node: PassiveTreeNode; nodeId: string; distance: number; pathCost: number }> {
    const results: Array<{ node: PassiveTreeNode; nodeId: string; distance: number; pathCost: number }> = [];

    // Debug info
    console.error(`[findNearbyNodes] Starting search with ${allocatedNodes.size} allocated nodes, maxDistance=${maxDistance}`);
    console.error(`[findNearbyNodes] Total nodes in tree: ${treeData.nodes.size}`);

    // Use Dijkstra to find reachable nodes with proper distance calculation
    const distances = new Map<string, number>();
    const unvisited = new Set<string>();

    // Initialize: allocated nodes have distance 0, all others have infinity
    let allocatedCount = 0;
    const sampleAllocatedNodes = Array.from(allocatedNodes).slice(0, 5);
    const sampleTreeNodes = Array.from(treeData.nodes.keys()).slice(0, 5);

    console.error(`[findNearbyNodes] Sample allocated nodes: ${sampleAllocatedNodes.join(', ')}`);
    console.error(`[findNearbyNodes] Sample tree nodes: ${sampleTreeNodes.join(', ')}`);

    // Check if allocated nodes exist in tree
    for (const nodeId of sampleAllocatedNodes) {
      const exists = treeData.nodes.has(nodeId);
      console.error(`[findNearbyNodes] Tree has node ${nodeId} (type: ${typeof nodeId}): ${exists}`);
    }

    // Check sample tree node types
    for (const nodeId of sampleTreeNodes) {
      console.error(`[findNearbyNodes] Tree node ${nodeId} has type: ${typeof nodeId}`);
    }

    for (const [nodeId] of treeData.nodes) {
      if (allocatedNodes.has(nodeId)) {
        distances.set(nodeId, 0);
        allocatedCount++;
      } else {
        distances.set(nodeId, Infinity);
      }
      unvisited.add(nodeId);
    }

    console.error(`[findNearbyNodes] Initialized ${allocatedCount} allocated nodes at distance 0 (expected ${allocatedNodes.size})`);

    // Check if any of the allocated nodes are in unvisited
    let allocatedInUnvisited = 0;
    for (const nodeId of allocatedNodes) {
      if (unvisited.has(nodeId)) {
        allocatedInUnvisited++;
        if (allocatedInUnvisited <= 3) {
          console.error(`[findNearbyNodes] Allocated node ${nodeId} IS in unvisited, distance: ${distances.get(nodeId)}`);
        }
      } else {
        if (allocatedInUnvisited <= 3) {
          console.error(`[findNearbyNodes] Allocated node ${nodeId} NOT in unvisited`);
        }
      }
    }
    console.error(`[findNearbyNodes] ${allocatedInUnvisited}/${allocatedNodes.size} allocated nodes are in unvisited set`);

    let nodesExplored = 0;
    let notablesFound = 0;
    let nodesWithFiniteDistance = 0;

    // Dijkstra's main loop
    while (unvisited.size > 0) {
      // Find node with minimum distance
      let currentNodeId: string | null = null;
      let minDistance = Infinity;

      let loopCount = 0;
      let foundZeroDistance = false;
      for (const nodeId of unvisited) {
        const dist = distances.get(nodeId) ?? Infinity;

        // Debug first few iterations
        if (nodesExplored === 0 && loopCount < 10) {
          console.error(`[findNearbyNodes] Checking unvisited node ${nodeId}, distance: ${dist}`);
        }

        // Special check for node 40483
        if (nodesExplored === 0 && nodeId === "40483") {
          console.error(`[findNearbyNodes] !!! Found node 40483 in iteration! Distance: ${dist}, distances.get: ${distances.get(nodeId)}, distances.has: ${distances.has(nodeId)}`);
        }

        if (dist === 0) {
          foundZeroDistance = true;
        }

        if (dist < minDistance) {
          minDistance = dist;
          currentNodeId = nodeId;
        }
        loopCount++;
      }

      // Debug first iteration
      if (nodesExplored === 0) {
        console.error(`[findNearbyNodes] Checked ${loopCount} unvisited nodes, found zero distance: ${foundZeroDistance}`);
        console.error(`[findNearbyNodes] First node to process: ${currentNodeId}, distance: ${minDistance}, unvisited: ${unvisited.size}`);
      }

      // If we can't find a reachable node, stop
      if (!currentNodeId || minDistance === Infinity) {
        console.error(`[findNearbyNodes] Stopping: currentNodeId=${currentNodeId}, minDistance=${minDistance}`);
        break;
      }

      // If we've exceeded max distance, we can stop (all remaining nodes are farther)
      if (minDistance > maxDistance) {
        console.error(`[findNearbyNodes] Stopping: exceeded maxDistance (${minDistance} > ${maxDistance})`);
        break;
      }

      unvisited.delete(currentNodeId);
      nodesExplored++;

      const currentNode = treeData.nodes.get(currentNodeId);
      if (!currentNode) continue;

      // Track nodes with finite distance (reachable)
      if (minDistance < Infinity) {
        nodesWithFiniteDistance++;
      }

      // Debug: Log first few explored nodes
      if (nodesExplored <= 5) {
        console.error(`[findNearbyNodes] Exploring node ${currentNodeId} at distance ${minDistance}, neighbors: ${(currentNode.out || []).length}`);
      }

      // If this is an unallocated notable/keystone within range, add to results
      if ((currentNode.isNotable || currentNode.isKeystone) &&
          !allocatedNodes.has(currentNodeId) &&
          minDistance > 0 &&
          minDistance <= maxDistance) {

        notablesFound++;

        // Apply filter if specified
        if (filter) {
          const statsText = (currentNode.stats || []).join(" ").toLowerCase();
          const nameText = (currentNode.name || "").toLowerCase();
          const filterLower = filter.toLowerCase();

          if (!statsText.includes(filterLower) && !nameText.includes(filterLower)) {
            // Continue exploring from this node even if filtered out
            for (const neighborId of currentNode.out || []) {
              if (!unvisited.has(neighborId)) continue;
              const newDistance = minDistance + 1;
              const oldDistance = distances.get(neighborId) ?? Infinity;
              if (newDistance < oldDistance) {
                distances.set(neighborId, newDistance);
              }
            }
            continue;
          }
        }

        if (results.length < 5) {
          console.error(`[findNearbyNodes] Found notable: ${currentNode.name} at distance ${minDistance}`);
        }

        results.push({
          node: currentNode,
          nodeId: currentNodeId,
          distance: minDistance,
          pathCost: minDistance, // In Dijkstra, distance = path cost
        });
      }

      // Check all neighbors and update distances
      for (const neighborId of currentNode.out || []) {
        if (!unvisited.has(neighborId)) continue;

        const newDistance = minDistance + 1;
        const oldDistance = distances.get(neighborId) ?? Infinity;

        if (newDistance < oldDistance) {
          distances.set(neighborId, newDistance);
        }
      }
    }

    console.error(`[findNearbyNodes] Explored ${nodesExplored} nodes (${nodesWithFiniteDistance} reachable), found ${notablesFound} notables (${results.length} after filter)`);

    // Sort by distance, then by path cost
    results.sort((a, b) => {
      if (a.distance !== b.distance) return a.distance - b.distance;
      return a.pathCost - b.pathCost;
    });

    return results;
  }

  private findShortestPaths(
    allocatedNodes: Set<string>,
    targetNodeId: string,
    treeData: PassiveTreeData,
    maxPaths: number = 1
  ): Array<{ nodes: string[]; cost: number }> {
    // Dijkstra's algorithm to find shortest path(s)
    interface PathNode {
      nodeId: string;
      distance: number;
      previous: string | null;
    }

    const distances = new Map<string, number>();
    const previous = new Map<string, string | null>();
    const unvisited = new Set<string>();

    // Initialize: allocated nodes have distance 0, all others have infinity
    for (const [nodeId] of treeData.nodes) {
      if (allocatedNodes.has(nodeId)) {
        distances.set(nodeId, 0);
        previous.set(nodeId, null);
      } else {
        distances.set(nodeId, Infinity);
        previous.set(nodeId, null);
      }
      unvisited.add(nodeId);
    }

    // Dijkstra's main loop
    while (unvisited.size > 0) {
      // Find node with minimum distance
      let currentNodeId: string | null = null;
      let minDistance = Infinity;

      for (const nodeId of unvisited) {
        const dist = distances.get(nodeId) ?? Infinity;
        if (dist < minDistance) {
          minDistance = dist;
          currentNodeId = nodeId;
        }
      }

      // If we can't find a reachable node, or we've reached the target, stop
      if (!currentNodeId || minDistance === Infinity) break;
      if (currentNodeId === targetNodeId) break;

      unvisited.delete(currentNodeId);

      const currentNode = treeData.nodes.get(currentNodeId);
      if (!currentNode) continue;

      // Check all neighbors
      for (const neighborId of currentNode.out || []) {
        if (!unvisited.has(neighborId)) continue;

        const newDistance = minDistance + 1;
        const oldDistance = distances.get(neighborId) ?? Infinity;

        if (newDistance < oldDistance) {
          distances.set(neighborId, newDistance);
          previous.set(neighborId, currentNodeId);
        }
      }
    }

    // Check if target is reachable
    const targetDistance = distances.get(targetNodeId);
    if (!targetDistance || targetDistance === Infinity) {
      return [];
    }

    // Reconstruct the path
    const path: string[] = [];
    let current: string | null = targetNodeId;

    while (current && !allocatedNodes.has(current)) {
      path.unshift(current);
      current = previous.get(current) || null;
    }

    const result = [{ nodes: path, cost: path.length }];

    // TODO: For multiple paths, we'd need to implement k-shortest paths algorithm
    // For now, just return the single shortest path
    return result;
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

  // Phase 2: Shortest Path Algorithm (BFS)
  private buildNodeGraph(allocatedNodes: PassiveTreeNode[], allTreeNodes: Map<string, PassiveTreeNode>): Map<string, string[]> {
    const graph = new Map<string, string[]>();
    const allocatedIds = new Set(allocatedNodes.map(n => String(n.skill)));

    for (const node of allocatedNodes) {
      const nodeId = String(node.skill);
      const neighbors: string[] = [];

      // Add outgoing connections that are also allocated
      if (node.out) {
        for (const outId of node.out) {
          if (allocatedIds.has(outId)) {
            neighbors.push(outId);
          }
        }
      }

      // Add incoming connections that are also allocated
      if (node.in) {
        for (const inId of node.in) {
          if (allocatedIds.has(inId)) {
            neighbors.push(inId);
          }
        }
      }

      graph.set(nodeId, neighbors);
    }

    return graph;
  }

  private findShortestPath(graph: Map<string, string[]>, start: string, end: string): string[] | null {
    if (start === end) return [start];

    const queue: Array<{node: string; path: string[]}> = [{node: start, path: [start]}];
    const visited = new Set<string>([start]);

    while (queue.length > 0) {
      const current = queue.shift()!;

      const neighbors = graph.get(current.node) || [];
      for (const neighbor of neighbors) {
        if (visited.has(neighbor)) continue;

        const newPath = [...current.path, neighbor];
        if (neighbor === end) {
          return newPath;
        }

        visited.add(neighbor);
        queue.push({node: neighbor, path: newPath});
      }
    }

    return null; // No path found
  }

  private analyzePathOptimizations(
    allocatedNodes: PassiveTreeNode[],
    keystones: PassiveTreeNode[],
    notables: PassiveTreeNode[],
    jewels: PassiveTreeNode[],
    allTreeNodes: Map<string, PassiveTreeNode>
  ): PathOptimization[] {
    const optimizations: PathOptimization[] = [];
    const graph = this.buildNodeGraph(allocatedNodes, allTreeNodes);
    const allocatedIds = new Set(allocatedNodes.map(n => String(n.skill)));

    // Find starting node (usually ascendancy start or class start)
    const startNode = allocatedNodes.find(n => n.isAscendancyStart) || allocatedNodes[0];
    if (!startNode) return optimizations;

    const startId = String(startNode.skill);
    const destinations = [...keystones, ...notables, ...jewels];

    // For each destination, compare actual path length vs optimal
    for (const dest of destinations) {
      const destId = String(dest.skill);
      const shortestPath = this.findShortestPath(graph, startId, destId);

      if (shortestPath && shortestPath.length > 1) {
        // Calculate optimal length (this is already the shortest in allocated nodes)
        const optimalLength = shortestPath.length - 1; // Subtract 1 for node count

        // For now, we can't calculate "true optimal" without pathfinding through unallocated nodes
        // So we flag paths that seem long relative to destination value
        if (optimalLength > 6) {
          optimizations.push({
            destination: dest.name || `Node ${destId}`,
            currentLength: optimalLength,
            optimalLength: optimalLength, // Same for now
            pointsSaved: 0, // Would need advanced analysis
            suggestion: `Path to ${dest.name || `Node ${destId}`} is ${optimalLength} points long. Consider checking if there's a more efficient route.`
          });
        }
      }
    }

    return optimizations;
  }

  // Phase 2: Point Efficiency Scoring
  private calculateEfficiencyScores(
    allocatedNodes: PassiveTreeNode[],
    keystones: PassiveTreeNode[],
    notables: PassiveTreeNode[],
    normalNodes: PassiveTreeNode[]
  ): EfficiencyScore[] {
    const scores: EfficiencyScore[] = [];

    // Score normal nodes (pathing nodes)
    for (const node of normalNodes) {
      const statsCount = node.stats?.length || 0;
      const statsPerPoint = statsCount; // Simple metric: number of stats

      scores.push({
        nodeId: String(node.skill),
        nodeName: node.name || `Node ${node.skill}`,
        statsPerPoint,
        isLowValue: statsCount === 0 // Pure pathing node with no stats
      });
    }

    return scores;
  }

  private identifyLowEfficiencyNodes(scores: EfficiencyScore[]): EfficiencyScore[] {
    return scores.filter(s => s.isLowValue || s.statsPerPoint < 1);
  }

  private findReachableHighValueNotables(
    allocatedNodes: PassiveTreeNode[],
    allTreeNodes: Map<string, PassiveTreeNode>
  ): PassiveTreeNode[] {
    const reachable: PassiveTreeNode[] = [];
    const allocatedIds = new Set(allocatedNodes.map(n => String(n.skill)));

    // Find nodes that are 1-2 steps away from allocated nodes
    for (const allocNode of allocatedNodes) {
      const neighbors = [...(allocNode.out || []), ...(allocNode.in || [])];

      for (const neighborId of neighbors) {
        if (allocatedIds.has(neighborId)) continue;

        const neighbor = allTreeNodes.get(neighborId);
        if (neighbor && (neighbor.isNotable || neighbor.isKeystone)) {
          // Check if not already in reachable list
          if (!reachable.find(n => n.skill === neighbor.skill)) {
            reachable.push(neighbor);
          }
        }
      }
    }

    return reachable.slice(0, 5); // Return top 5
  }

  // Phase 2: Generate Optimization Suggestions
  private generateOptimizationSuggestions(
    pathOptimizations: PathOptimization[],
    efficiencyScores: EfficiencyScore[],
    reachableNotables: PassiveTreeNode[],
    archetype: string,
    keystones: PassiveTreeNode[],
    notables: PassiveTreeNode[]
  ): OptimizationSuggestion[] {
    const suggestions: OptimizationSuggestion[] = [];

    // Path optimization suggestions
    for (const opt of pathOptimizations.slice(0, 3)) { // Top 3
      suggestions.push({
        type: 'path',
        priority: opt.currentLength > 8 ? 'high' : 'medium',
        title: `Long path to ${opt.destination}`,
        description: opt.suggestion,
        pointsSaved: opt.pointsSaved
      });
    }

    // Efficiency suggestions
    const lowEfficiencyNodes = this.identifyLowEfficiencyNodes(efficiencyScores);
    if (lowEfficiencyNodes.length > 3) {
      suggestions.push({
        type: 'efficiency',
        priority: 'medium',
        title: 'Multiple low-efficiency pathing nodes detected',
        description: `Found ${lowEfficiencyNodes.length} nodes with minimal stats. Consider reviewing your tree pathing for potential point savings.`,
        potentialGain: `Could potentially save ${Math.floor(lowEfficiencyNodes.length * 0.3)} points`
      });
    }

    // Reachable notables suggestions
    if (reachableNotables.length > 0) {
      const notableNames = reachableNotables.map(n => n.name || `Node ${n.skill}`).slice(0, 3);
      suggestions.push({
        type: 'reachable',
        priority: 'medium',
        title: 'High-value notables within reach',
        description: `Consider allocating these nearby notables: ${notableNames.join(', ')}. They align with your build direction.`,
        potentialGain: `1-3 additional points for significant stat gains`
      });
    }

    // AI-contextual suggestions (data structure for AI to reason about)
    suggestions.push({
      type: 'ai-context',
      priority: 'low',
      title: 'AI Analysis Available',
      description: this.buildAIContextData(archetype, keystones, notables, reachableNotables),
      potentialGain: 'AI can provide contextual suggestions based on build goals'
    });

    return suggestions;
  }

  // Phase 2: Build AI Context Data
  private buildAIContextData(
    archetype: string,
    keystones: PassiveTreeNode[],
    notables: PassiveTreeNode[],
    reachableNotables: PassiveTreeNode[]
  ): string {
    let context = `Build Archetype: ${archetype}\n\n`;
    context += `Allocated Keystones: ${keystones.map(k => k.name).join(', ')}\n\n`;
    context += `Notable Passives (count): ${notables.length}\n\n`;
    context += `Reachable High-Value Notables:\n`;

    for (const notable of reachableNotables) {
      context += `- ${notable.name}: ${notable.stats?.join('; ') || 'No stats'}\n`;
    }

    context += `\n[AI can analyze this data to provide build-specific recommendations based on player goals and meta knowledge]`;

    return context;
  }

  private async analyzePassiveTree(build: PoBBuild): Promise<TreeAnalysisResult | null> {
    try {
      // Extract allocated node IDs
      const nodeIds = this.parseAllocatedNodes(build);
      if (nodeIds.length === 0) {
        return null; // No tree data in build
      }

      // Determine tree version from build
      let treeVersion = build.Tree?.Spec?.treeVersion || "3_26";

      // Get tree data (with caching)
      const treeData = await this.getTreeData(treeVersion);

      // Map node IDs to details
      const { nodes: allocatedNodes, invalidIds } = await this.mapNodesToDetails(nodeIds, treeData);

      // If there are invalid nodes, fail with error
      if (invalidIds.length > 0) {
        const requestedVersion = treeVersion;
        const actualVersion = treeData.version;
        let errorMsg = `Invalid passive tree data detected.\n\nThe following node IDs could not be found in the passive tree data:\n${invalidIds.map(id => `- Node ID: ${id}`).join('\n')}\n\n`;

        if (requestedVersion !== actualVersion) {
          errorMsg += `Build tree version: ${requestedVersion}\n`;
          errorMsg += `Available tree data: ${actualVersion} (fell back because ${requestedVersion} data not available yet)\n\n`;
          errorMsg += `This means your build uses passive tree nodes from PoE ${requestedVersion} that don't exist in ${actualVersion}.\n`;
          errorMsg += `Path of Building Community hasn't released tree data for ${requestedVersion} yet.\n\n`;
          errorMsg += `Options:\n`;
          errorMsg += `1. Wait for PoB to release ${requestedVersion} tree data\n`;
          errorMsg += `2. Use a build from an earlier patch (${actualVersion} or earlier)\n`;
          errorMsg += `3. The analysis may work partially - some stats will be shown but tree analysis will fail\n`;
        } else {
          errorMsg += `This usually means:\n1. The build is from an outdated league/patch\n2. The build file is corrupted\n3. The passive tree data needs to be refreshed\n\nPlease verify the build is from the current league or use a build from the active league.`;
        }

        throw new Error(errorMsg);
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
      const treeDataVersion = treeData.version;
      const versionMismatch = buildVersion !== "Unknown" && !treeDataVersion.includes(buildVersion);

      // Phase 2: Generate optimization suggestions
      let optimizationSuggestions: OptimizationSuggestion[] = [];
      try {
        const pathOptimizations = this.analyzePathOptimizations(
          allocatedNodes,
          keystones,
          notables,
          jewels,
          treeData.nodes
        );

        const efficiencyScores = this.calculateEfficiencyScores(
          allocatedNodes,
          keystones,
          notables,
          normal
        );

        const reachableNotables = this.findReachableHighValueNotables(
          allocatedNodes,
          treeData.nodes
        );

        optimizationSuggestions = this.generateOptimizationSuggestions(
          pathOptimizations,
          efficiencyScores,
          reachableNotables,
          archetype,
          keystones,
          notables
        );
      } catch (error) {
        console.error('[Optimization] Failed to generate suggestions:', error);
        // Continue without optimization suggestions
      }

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
        treeVersion: treeDataVersion,
        versionMismatch,
        invalidNodeIds: [],
        optimizationSuggestions
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

  // Phase 3: Tree Comparison
  private async compareTrees(build1Name: string, build2Name: string): Promise<TreeComparison> {
    const build1 = await this.readBuild(build1Name);
    const build2 = await this.readBuild(build2Name);

    const analysis1 = await this.analyzePassiveTree(build1);
    const analysis2 = await this.analyzePassiveTree(build2);

    if (!analysis1 || !analysis2) {
      throw new Error('One or both builds lack passive tree data');
    }

    // Calculate differences
    const nodes1Ids = new Set(analysis1.allocatedNodes.map(n => String(n.skill)));
    const nodes2Ids = new Set(analysis2.allocatedNodes.map(n => String(n.skill)));

    const uniqueToBuild1 = analysis1.allocatedNodes.filter(n => !nodes2Ids.has(String(n.skill)));
    const uniqueToBuild2 = analysis2.allocatedNodes.filter(n => !nodes1Ids.has(String(n.skill)));
    const sharedNodes = analysis1.allocatedNodes.filter(n => nodes2Ids.has(String(n.skill)));

    const pointDifference = analysis1.totalPoints - analysis2.totalPoints;

    let archetypeDifference = '';
    if (analysis1.archetype !== analysis2.archetype) {
      archetypeDifference = `Build 1: ${analysis1.archetype} vs Build 2: ${analysis2.archetype}`;
    } else {
      archetypeDifference = `Both builds: ${analysis1.archetype}`;
    }

    return {
      build1: { name: build1Name, analysis: analysis1 },
      build2: { name: build2Name, analysis: analysis2 },
      differences: {
        uniqueToBuild1,
        uniqueToBuild2,
        sharedNodes,
        pointDifference,
        archetypeDifference
      }
    };
  }

  private formatTreeComparison(comparison: TreeComparison): string {
    let output = `=== Passive Tree Comparison ===\n\n`;
    output += `Build 1: ${comparison.build1.name}\n`;
    output += `Build 2: ${comparison.build2.name}\n\n`;

    // Point allocation
    output += `=== Point Allocation ===\n`;
    output += `Build 1: ${comparison.build1.analysis.totalPoints} points\n`;
    output += `Build 2: ${comparison.build2.analysis.totalPoints} points\n`;
    output += `Difference: ${Math.abs(comparison.differences.pointDifference)} points `;
    output += comparison.differences.pointDifference > 0 ? '(Build 1 has more)\n' : '(Build 2 has more)\n';

    // Archetype comparison
    output += `\n=== Archetype Comparison ===\n`;
    output += `${comparison.differences.archetypeDifference}\n`;

    // Keystones comparison
    output += `\n=== Keystones Comparison ===\n`;
    output += `Build 1 Keystones: ${comparison.build1.analysis.keystones.map(k => k.name).join(', ') || 'None'}\n`;
    output += `Build 2 Keystones: ${comparison.build2.analysis.keystones.map(k => k.name).join(', ') || 'None'}\n`;

    // Unique keystones
    const uniqueKeystones1 = comparison.differences.uniqueToBuild1.filter(n => n.isKeystone);
    const uniqueKeystones2 = comparison.differences.uniqueToBuild2.filter(n => n.isKeystone);

    if (uniqueKeystones1.length > 0) {
      output += `\nUnique to Build 1:\n`;
      for (const ks of uniqueKeystones1) {
        output += `- ${ks.name}\n`;
      }
    }

    if (uniqueKeystones2.length > 0) {
      output += `\nUnique to Build 2:\n`;
      for (const ks of uniqueKeystones2) {
        output += `- ${ks.name}\n`;
      }
    }

    // Notables comparison
    output += `\n=== Notable Passives Comparison ===\n`;
    output += `Build 1: ${comparison.build1.analysis.notables.length} notables\n`;
    output += `Build 2: ${comparison.build2.analysis.notables.length} notables\n`;

    const uniqueNotables1 = comparison.differences.uniqueToBuild1.filter(n => n.isNotable);
    const uniqueNotables2 = comparison.differences.uniqueToBuild2.filter(n => n.isNotable);

    if (uniqueNotables1.length > 0) {
      output += `\nTop 5 Unique Notables to Build 1:\n`;
      for (const notable of uniqueNotables1.slice(0, 5)) {
        output += `- ${notable.name || 'Unnamed'}\n`;
      }
    }

    if (uniqueNotables2.length > 0) {
      output += `\nTop 5 Unique Notables to Build 2:\n`;
      for (const notable of uniqueNotables2.slice(0, 5)) {
        output += `- ${notable.name || 'Unnamed'}\n`;
      }
    }

    // Pathing efficiency
    output += `\n=== Pathing Efficiency ===\n`;
    output += `Build 1: ${comparison.build1.analysis.pathingEfficiency}\n`;
    output += `Build 2: ${comparison.build2.analysis.pathingEfficiency}\n`;

    // Shared nodes
    output += `\n=== Shared Nodes ===\n`;
    output += `${comparison.differences.sharedNodes.length} nodes are allocated in both builds\n`;

    return output;
  }

  // Phase 3: Test Allocation (What-If Analysis)
  private parseAllocationChanges(changesText: string, treeData: PassiveTreeData): AllocationChange[] {
    const changes: AllocationChange[] = [];
    const lines = changesText.split(/[,;\n]/);

    for (const line of lines) {
      const trimmed = line.trim().toLowerCase();
      if (!trimmed) continue;

      // Parse "allocate X" or "add X"
      const allocateMatch = trimmed.match(/(?:allocate|add|take)\s+(.+)/);
      if (allocateMatch) {
        const nodeIdentifier = allocateMatch[1].trim();
        changes.push({ type: 'allocate', nodeIdentifier });
        continue;
      }

      // Parse "remove X" or "unallocate X"
      const removeMatch = trimmed.match(/(?:remove|unallocate|drop)\s+(.+)/);
      if (removeMatch) {
        const nodeIdentifier = removeMatch[1].trim();
        changes.push({ type: 'remove', nodeIdentifier });
        continue;
      }
    }

    return changes;
  }

  private findNodeByName(nodeName: string, treeData: PassiveTreeData): PassiveTreeNode | null {
    const normalizedName = nodeName.toLowerCase().trim();
    for (const [nodeId, node] of treeData.nodes) {
      const nodeNameLower = (node.name || '').toLowerCase();
      if (nodeNameLower === normalizedName || nodeNameLower.includes(normalizedName)) {
        return node;
      }
    }
    return null;
  }

  private async testAllocation(buildName: string, changesText: string): Promise<string> {
    const build = await this.readBuild(buildName);
    const currentAnalysis = await this.analyzePassiveTree(build);

    if (!currentAnalysis) {
      throw new Error('Build has no passive tree data');
    }

    const treeData = await this.getTreeData(currentAnalysis.treeVersion);
    const changes = this.parseAllocationChanges(changesText, treeData);

    let output = `=== What-If Allocation Testing ===\n\n`;
    output += `Base Build: ${buildName}\n`;
    output += `Proposed Changes: ${changesText}\n\n`;

    // Check if PoB Lua Bridge is enabled
    if (this.luaEnabled) {
      output += `[PoB Lua Bridge Enabled: Real stat calculations available]\n\n`;

      try {
        // Load the build into PoB
        const buildPath = path.join(this.pobDirectory, buildName);
        const buildXml = await fs.readFile(buildPath, 'utf-8');
        await this.ensureLuaClient();
        if (!this.luaClient) throw new Error('Lua client not initialized');

        await this.luaClient.loadBuildXml(buildXml, 'WhatIf Test');

        // Get current stats
        const beforeStats = await this.luaClient.getStats();
        output += `=== Current Stats ===\n`;
        if (beforeStats && typeof beforeStats === 'object') {
          const statsKeys = Object.keys(beforeStats).slice(0, 10);
          for (const key of statsKeys) {
            output += `${key}: ${beforeStats[key]}\n`;
          }
        }

        // Apply changes (simplified - would need tree modification logic)
        output += `\n[Note: Full tree modification via Lua bridge would require allocating/deallocating specific node IDs]\n`;
        output += `[This is a complex operation that requires pathfinding to intermediate nodes]\n\n`;

        // For now, provide analysis without actual modification
        output += `=== Proposed Changes Analysis ===\n`;
        for (const change of changes) {
          const node = this.findNodeByName(change.nodeIdentifier, treeData);
          if (node) {
            output += `\n${change.type === 'allocate' ? 'ALLOCATE' : 'REMOVE'}: ${node.name}\n`;
            if (node.stats) {
              output += `Stats: ${node.stats.join('; ')}\n`;
            }
            output += `Point Cost: 1 point\n`;
          } else {
            output += `\n${change.type === 'allocate' ? 'ALLOCATE' : 'REMOVE'}: ${change.nodeIdentifier}\n`;
            output += `[Node not found in tree data]\n`;
          }
        }

      } catch (error) {
        output += `\nError using PoB Lua Bridge: ${error instanceof Error ? error.message : String(error)}\n`;
        output += `Falling back to simulated analysis...\n\n`;

        // Fallback to simulated analysis
        output += this.simulateAllocationChanges(changes, currentAnalysis, treeData);
      }
    } else {
      // Simulated analysis when PoB bridge not enabled
      output += `[PoB Lua Bridge Disabled: Providing simulated analysis]\n`;
      output += `[Enable with POB_LUA_ENABLED=true for real stat calculations]\n\n`;

      output += this.simulateAllocationChanges(changes, currentAnalysis, treeData);
    }

    return output;
  }

  private simulateAllocationChanges(changes: AllocationChange[], currentAnalysis: TreeAnalysisResult, treeData: PassiveTreeData): string {
    let output = `=== Simulated Changes Analysis ===\n\n`;

    let pointsAllocated = 0;
    let pointsFreed = 0;

    for (const change of changes) {
      const node = this.findNodeByName(change.nodeIdentifier, treeData);

      if (!node) {
        output += `- ${change.type === 'allocate' ? 'ALLOCATE' : 'REMOVE'}: "${change.nodeIdentifier}" [Node not found]\n`;
        continue;
      }

      output += `- ${change.type === 'allocate' ? 'ALLOCATE' : 'REMOVE'}: ${node.name}\n`;

      if (node.isKeystone) {
        output += `  Type: Keystone\n`;
      } else if (node.isNotable) {
        output += `  Type: Notable\n`;
      } else if (node.isJewelSocket) {
        output += `  Type: Jewel Socket\n`;
      } else {
        output += `  Type: Small Passive\n`;
      }

      if (node.stats && node.stats.length > 0) {
        output += `  Stats: ${node.stats.join('; ')}\n`;
      } else {
        output += `  Stats: None (pathing node)\n`;
      }

      if (change.type === 'allocate') {
        pointsAllocated++;
        output += `  Point Cost: 1 point\n`;
      } else {
        pointsFreed++;
        output += `  Points Freed: 1 point\n`;
      }

      output += `\n`;
    }

    output += `=== Summary ===\n`;
    output += `Current Points: ${currentAnalysis.totalPoints}\n`;
    output += `Points to Allocate: ${pointsAllocated}\n`;
    output += `Points to Free: ${pointsFreed}\n`;
    output += `Net Change: ${pointsFreed - pointsAllocated} points\n`;
    output += `Final Points: ${currentAnalysis.totalPoints + pointsAllocated - pointsFreed}\n\n`;

    output += `Note: This is a simplified simulation. Actual point costs may vary if intermediate\n`;
    output += `nodes need to be allocated to reach the desired nodes. Use PoB Lua Bridge for\n`;
    output += `accurate stat calculations.\n`;

    return output;
  }

  // Phase 3: Build Planning Assistant
  private async planTree(buildName: string | undefined, goals: string): Promise<string> {
    let output = `=== Passive Tree Planning Assistant ===\n\n`;

    // Parse goals
    output += `Build Goals: ${goals}\n\n`;

    // Get tree data for analysis
    const treeData = await this.getTreeData("3_26");

    // Parse goals to identify target keystones and archetypes
    const goalsLower = goals.toLowerCase();
    const targetKeystones: PassiveTreeNode[] = [];
    const recommendedNotables: PassiveTreeNode[] = [];

    // Identify mentioned keystones
    for (const [nodeId, node] of treeData.nodes) {
      if (!node.isKeystone || !node.name) continue;

      const nodeName = node.name.toLowerCase();
      if (goalsLower.includes(nodeName) || goalsLower.includes(nodeName.replace(/\s+/g, ''))) {
        targetKeystones.push(node);
      }
    }

    // Suggest keystones based on common patterns
    if (goalsLower.includes('crit') && !targetKeystones.find(k => k.name?.includes('Critical'))) {
      const precisionNode = this.findNodeByName('Precision', treeData);
      if (precisionNode) recommendedNotables.push(precisionNode);
    }

    if (goalsLower.includes('bow') || goalsLower.includes('projectile')) {
      const pointBlank = this.findNodeByName('Point Blank', treeData);
      if (pointBlank && !targetKeystones.includes(pointBlank)) {
        targetKeystones.push(pointBlank);
      }
    }

    if (goalsLower.includes('energy shield') || goalsLower.includes('es')) {
      const ci = this.findNodeByName('Chaos Inoculation', treeData);
      if (ci && !targetKeystones.includes(ci)) {
        targetKeystones.push(ci);
      }
    }

    if (goalsLower.includes('life') && !goalsLower.includes('low life')) {
      // Recommend life-based notables
      output += `=== Recommended Direction ===\n`;
      output += `Life-based build detected. Focus on:\n`;
      output += `- Life notable clusters near your starting class\n`;
      output += `- % increased maximum life nodes\n`;
      output += `- Life regeneration for sustain\n\n`;
    }

    // Display target keystones
    if (targetKeystones.length > 0) {
      output += `=== Target Keystones ===\n`;
      for (const ks of targetKeystones) {
        output += `\n${ks.name}\n`;
        if (ks.stats) {
          output += `Stats: ${ks.stats.join('; ')}\n`;
        }
        output += `Node ID: ${ks.skill}\n`;
      }
      output += `\n`;
    }

    // If base build provided, show current tree
    if (buildName) {
      try {
        const build = await this.readBuild(buildName);
        const analysis = await this.analyzePassiveTree(build);

        if (analysis) {
          output += `=== Current Tree (Base Build: ${buildName}) ===\n`;
          output += `Total Points: ${analysis.totalPoints}\n`;
          output += `Current Keystones: ${analysis.keystones.map(k => k.name).join(', ') || 'None'}\n`;
          output += `Current Archetype: ${analysis.archetype}\n\n`;

          // Suggest additions
          const allocatedIds = new Set(analysis.allocatedNodes.map(n => String(n.skill)));
          const unallocatedTargets = targetKeystones.filter(ks => !allocatedIds.has(String(ks.skill)));

          if (unallocatedTargets.length > 0) {
            output += `=== Recommended Additions ===\n`;
            for (const ks of unallocatedTargets) {
              output += `- ${ks.name} (not yet allocated)\n`;
            }
            output += `\n`;
          }
        }
      } catch (error) {
        output += `Could not load base build: ${error instanceof Error ? error.message : String(error)}\n\n`;
      }
    }

    // General recommendations
    output += `=== Planning Recommendations ===\n\n`;

    if (goalsLower.includes('crit')) {
      output += `Critical Strike Build:\n`;
      output += `- Prioritize crit chance and crit multiplier notables\n`;
      output += `- Allocate Precision or Assassination clusters\n`;
      output += `- Consider Power Charge nodes for sustain\n\n`;
    }

    if (goalsLower.includes('attack')) {
      output += `Attack Build:\n`;
      output += `- Focus on weapon-specific damage nodes\n`;
      output += `- Allocate attack speed for faster clear\n`;
      output += `- Consider Resolute Technique if not going crit\n\n`;
    }

    if (goalsLower.includes('spell') || goalsLower.includes('cast')) {
      output += `Spell Build:\n`;
      output += `- Prioritize spell damage and cast speed\n`;
      output += `- Consider Elemental Overload for non-crit\n`;
      output += `- Allocate elemental penetration notables\n\n`;
    }

    output += `=== Leveling Path Suggestion ===\n`;
    output += `1. Level 1-30: Focus on damage nodes near starting area\n`;
    output += `2. Level 30-50: Path toward first major keystone or jewel socket\n`;
    output += `3. Level 50-70: Allocate defensive layers (life/ES clusters)\n`;
    output += `4. Level 70+: Optimize pathing and reach secondary keystones\n\n`;

    output += `Note: Use the test_allocation tool to simulate specific node allocations\n`;
    output += `and see their impact before committing points in-game.\n`;

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

      // Add get_build_xml helper tool
      tools.push({
        name: "get_build_xml",
        description: "Get the raw XML content of a build file. Useful for passing to lua_load_build or debugging.",
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
      });

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
            name: "lua_load_build",
            description: "Load a Path of Building build from XML into the PoB headless session. The build will be parsed and ready for stat calculations.",
            inputSchema: {
              type: "object",
              properties: {
                build_xml: {
                  type: "string",
                  description: "Raw XML content of the PoB build file",
                },
                name: {
                  type: "string",
                  description: "Optional name for the build (default: 'MCP Build')",
                },
              },
              required: ["build_xml"],
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

          // Phase 3 tools
          case "compare_trees":
            if (!args) throw new Error("Missing arguments");
            return await this.handleCompareTrees(
              args.build1 as string,
              args.build2 as string
            );

          case "test_allocation":
            if (!args) throw new Error("Missing arguments");
            return await this.handleTestAllocation(
              args.build_name as string,
              args.changes as string
            );

          case "get_nearby_nodes":
            if (!args) throw new Error("Missing arguments");
            return await this.handleGetNearbyNodes(
              args.build_name as string,
              args.max_distance as number | undefined,
              args.filter as string | undefined
            );

          case "find_path_to_node":
            if (!args) throw new Error("Missing arguments");
            return await this.handleFindPath(
              args.build_name as string,
              args.target_node_id as string,
              args.show_alternatives as boolean | undefined
            );

          case "allocate_nodes":
            if (!args) throw new Error("Missing arguments");
            return await this.handleAllocateNodes(
              args.build_name as string,
              args.node_ids as string[],
              args.show_full_stats as boolean | undefined
            );

          case "plan_tree":
            if (!args) throw new Error("Missing arguments");
            return await this.handlePlanTree(
              args.build_name as string | undefined,
              args.goals as string
            );

          case "get_build_xml":
            if (!args) throw new Error("Missing arguments");
            return await this.handleGetBuildXml(args.build_name as string);

          // Lua bridge tools
          case "lua_start":
            return await this.handleLuaStart();

          case "lua_stop":
            return await this.handleLuaStop();

          case "lua_load_build":
            if (!args) throw new Error("Missing arguments");
            return await this.handleLuaLoadBuild(
              args.build_xml as string,
              args.name as string | undefined
            );

          case "lua_get_stats":
            return await this.handleLuaGetStats(args?.fields as string[] | undefined);

          case "lua_get_tree":
            return await this.handleLuaGetTree();

          case "lua_set_tree":
            if (!args) throw new Error("Missing arguments");
            return await this.handleLuaSetTree(args);

          // Phase 4: Item & Skill tools
          case "add_item":
            if (!args) throw new Error("Missing arguments");
            return await this.handleAddItem(args.item_text as string, args.slot_name as string | undefined, args.no_auto_equip as boolean | undefined);

          case "get_equipped_items":
            return await this.handleGetEquippedItems();

          case "toggle_flask":
            if (!args) throw new Error("Missing arguments");
            return await this.handleToggleFlask(args.flask_number as number, args.active as boolean);

          case "get_skill_setup":
            return await this.handleGetSkillSetup();

          case "set_main_skill":
            if (!args) throw new Error("Missing arguments");
            return await this.handleSetMainSkill(args.socket_group as number, args.active_skill_index as number | undefined, args.skill_part as number | undefined);

          // Phase 6: Build Optimization tools
          case "analyze_defenses":
            return await this.handleAnalyzeDefenses(args?.build_name as string | undefined);

          case "suggest_optimal_nodes":
            if (!args) throw new Error("Missing arguments");
            return await this.handleSuggestOptimalNodes(
              args.build_name as string,
              args.goal as string,
              args.max_points as number | undefined,
              args.max_distance as number | undefined,
              args.min_efficiency as number | undefined,
              args.include_keystones as boolean | undefined
            );

          case "optimize_tree":
            if (!args) throw new Error("Missing arguments");
            return await this.handleOptimizeTree(
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

  private async listBuilds(): Promise<string[]> {
    try {
      const builds: string[] = [];

      // Recursive function to find XML files
      const findXmlFiles = async (dir: string, relativePath: string = "") => {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          // Skip hidden files and temp files
          if (entry.name.startsWith('.') || entry.name.startsWith('~~temp~~')) {
            continue;
          }

          const fullPath = path.join(dir, entry.name);
          const relPath = relativePath ? path.join(relativePath, entry.name) : entry.name;

          if (entry.isDirectory()) {
            // Recursively search subdirectories
            await findXmlFiles(fullPath, relPath);
          } else if (entry.isFile() && entry.name.endsWith('.xml')) {
            builds.push(relPath);
          }
        }
      };

      await findXmlFiles(this.pobDirectory);
      return builds;
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

  // Phase 3 Tool Handlers
  private async handleCompareTrees(build1Name: string, build2Name: string) {
    try {
      const comparison = await this.compareTrees(build1Name, build2Name);
      const output = this.formatTreeComparison(comparison);

      return {
        content: [
          {
            type: "text",
            text: output,
          },
        ],
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to compare trees: ${errorMsg}`);
    }
  }

  private async handleTestAllocation(buildName: string, changes: string) {
    try {
      const output = await this.testAllocation(buildName, changes);

      return {
        content: [
          {
            type: "text",
            text: output,
          },
        ],
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to test allocation: ${errorMsg}`);
    }
  }

  private async handleFindPath(
    buildName: string,
    targetNodeId: string,
    showAlternatives?: boolean
  ) {
    try {
      const build = await this.readBuild(buildName);

      if (!build.Tree?.Spec) {
        throw new Error("Build has no passive tree data");
      }

      const allocatedNodeIds = this.parseAllocatedNodes(build);
      const allocatedNodes = new Set<string>(allocatedNodeIds);
      const treeVersion = this.extractBuildVersion(build);
      const treeData = await this.getTreeData(treeVersion);

      // Check if target node exists
      const targetNode = treeData.nodes.get(targetNodeId);
      if (!targetNode) {
        throw new Error(`Node ${targetNodeId} not found in tree data`);
      }

      // Check if target is already allocated
      if (allocatedNodes.has(targetNodeId)) {
        return {
          content: [
            {
              type: "text",
              text: `Node ${targetNodeId} (${targetNode.name || "Unknown"}) is already allocated in this build.`,
            },
          ],
        };
      }

      // Find shortest path(s)
      const paths = this.findShortestPaths(
        allocatedNodes,
        targetNodeId,
        treeData,
        showAlternatives ? 3 : 1
      );

      if (paths.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No path found to node ${targetNodeId} (${targetNode.name || "Unknown"}).\nThis node may be unreachable from your current tree (e.g., different class starting area or ascendancy nodes).`,
            },
          ],
        };
      }

      // Format output
      let text = `=== Path to ${targetNode.name || "Node " + targetNodeId} ===\n\n`;
      text += `Build: ${buildName}\n`;
      text += `Target: ${targetNode.name || "Unknown"} [${targetNodeId}]\n`;
      if (targetNode.isKeystone) text += `Type: KEYSTONE\n`;
      else if (targetNode.isNotable) text += `Type: Notable\n`;
      text += `\n`;

      for (let i = 0; i < paths.length; i++) {
        const path = paths[i];
        const pathLabel = paths.length > 1 ? `Path ${i + 1} (Alternative ${i === 0 ? "- Shortest" : i})` : "Shortest Path";

        text += `**${pathLabel}**\n`;
        text += `Total Cost: ${path.cost} passive points\n`;
        text += `Nodes to Allocate: ${path.nodes.length}\n\n`;

        text += `Allocation Order:\n`;
        for (let j = 0; j < path.nodes.length; j++) {
          const nodeId = path.nodes[j];
          const node = treeData.nodes.get(nodeId);
          if (!node) continue;

          const isTarget = nodeId === targetNodeId;
          const prefix = isTarget ? "→ TARGET: " : `  ${j + 1}. `;

          text += `${prefix}${node.name || "Travel Node"} [${nodeId}]\n`;

          if (node.stats && node.stats.length > 0) {
            for (const stat of node.stats) {
              text += `      ${stat}\n`;
            }
          } else if (!isTarget) {
            text += `      (Travel node - no stats)\n`;
          }

          if (j < path.nodes.length - 1) text += `\n`;
        }

        if (i < paths.length - 1) text += `\n${"=".repeat(50)}\n\n`;
      }

      text += `\n**Next Steps:**\n`;
      text += `Use test_allocation to preview stat changes:\n`;
      text += `  test_allocation with changes="allocate nodes ${paths[0].nodes.join(", ")}"\n`;

      return {
        content: [
          {
            type: "text",
            text,
          },
        ],
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to find path: ${errorMsg}`);
    }
  }

  private async handleAllocateNodes(
    buildName: string,
    nodeIds: string[],
    showFullStats?: boolean
  ) {
    try {
      await this.ensureLuaClient();

      if (!this.luaClient) {
        throw new Error('Lua client not initialized. Enable POB_LUA_ENABLED to use this feature.');
      }

      if (!nodeIds || nodeIds.length === 0) {
        throw new Error('No node IDs provided');
      }

      // Load the build
      const buildPath = path.join(this.pobDirectory, buildName);
      const buildXml = await fs.readFile(buildPath, 'utf-8');
      await this.luaClient.loadBuildXml(buildXml, 'Node Allocation Test');

      // Get current stats
      const statsBefore = await this.luaClient.getStats();

      // Get current tree
      const treeBefore = await this.luaClient.getTree();
      const currentNodes = new Set(treeBefore.nodes || []);

      // Add new nodes to the set
      const newNodes = [...currentNodes, ...nodeIds].map(n => parseInt(String(n)));

      // Update tree with new nodes
      await this.luaClient.setTree({
        classId: treeBefore.classId,
        ascendClassId: treeBefore.ascendClassId,
        secondaryAscendClassId: treeBefore.secondaryAscendClassId,
        nodes: newNodes,
        masteryEffects: treeBefore.masteryEffects,
        treeVersion: treeBefore.treeVersion,
      });

      // Get new stats
      const statsAfter = await this.luaClient.getStats();

      // Calculate changes
      const changes: Array<{ stat: string; before: any; after: any; change: string }> = [];

      const importantStats = [
        'Life', 'EnergyShield', 'Mana', 'Evasion', 'Armour',
        'FireResist', 'ColdResist', 'LightningResist', 'ChaosResist',
        'BlockChance', 'SpellBlockChance', 'AttackDodgeChance', 'SpellDodgeChance',
        'Str', 'Dex', 'Int',
        'TotalDPS', 'TotalDot', 'CombinedDPS',
        'Speed', 'HitChance', 'CritChance', 'CritMultiplier'
      ];

      for (const stat of importantStats) {
        const before = statsBefore[stat];
        const after = statsAfter[stat];

        if (before !== after) {
          let change = '';
          if (typeof before === 'number' && typeof after === 'number') {
            const diff = after - before;
            const sign = diff > 0 ? '+' : '';
            change = `${sign}${diff.toFixed(2)}`;

            if (before > 0) {
              const pct = ((diff / before) * 100).toFixed(1);
              change += ` (${sign}${pct}%)`;
            }
          } else {
            change = `${before} → ${after}`;
          }

          changes.push({ stat, before, after, change });
        }
      }

      // Format output
      let text = `=== Node Allocation Results ===\n\n`;
      text += `Build: ${buildName}\n`;
      text += `Allocated Nodes: ${nodeIds.join(', ')}\n`;
      text += `Points Spent: ${nodeIds.length}\n`;
      text += `Total Tree Points: ${newNodes.length} (was ${currentNodes.size})\n\n`;

      if (changes.length === 0) {
        text += `**No Stat Changes Detected**\n`;
        text += `This might indicate:\n`;
        text += `- The nodes are travel nodes with no stats\n`;
        text += `- The nodes were already allocated\n`;
        text += `- The stats are conditional and not active\n`;
      } else {
        text += `**Stat Changes (${changes.length})**:\n\n`;

        for (const { stat, before, after, change } of changes) {
          text += `${stat}: ${typeof before === 'number' ? before.toFixed(2) : before} → ${typeof after === 'number' ? after.toFixed(2) : after}\n`;
          text += `  Change: ${change}\n\n`;
        }
      }

      if (showFullStats) {
        text += `\n**All Stats After Allocation**:\n`;
        for (const [key, value] of Object.entries(statsAfter)) {
          if (key !== '_meta') {
            text += `${key}: ${value}\n`;
          }
        }
      }

      return {
        content: [
          {
            type: "text",
            text,
          },
        ],
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to allocate nodes: ${errorMsg}`);
    }
  }

  private async handleGetNearbyNodes(
    buildName: string,
    maxDistance?: number,
    filter?: string
  ) {
    try {
      const distance = maxDistance || 5;
      const build = await this.readBuild(buildName);

      if (!build.Tree?.Spec) {
        throw new Error("Build has no passive tree data");
      }

      const spec = build.Tree.Spec;
      const allocatedNodeIds = this.parseAllocatedNodes(build);
      const allocatedNodes = new Set<string>(allocatedNodeIds);
      const treeVersion = this.extractBuildVersion(build);
      const treeData = await this.getTreeData(treeVersion);

      // Find all unallocated notables and keystones within distance
      const nearbyNodes = this.findNearbyNodes(
        allocatedNodes,
        treeData,
        distance,
        filter
      );

      // Format output
      let text = `=== Nearby Unallocated Nodes ===\n\n`;
      text += `Build: ${buildName}\n`;
      text += `Current Allocation: ${allocatedNodes.size} nodes\n`;
      text += `Search Distance: ${distance} travel nodes\n`;
      if (filter) {
        text += `Filter: ${filter}\n`;
      }
      text += `\n`;

      if (nearbyNodes.length === 0) {
        text += `No notable/keystone nodes found within ${distance} nodes.\n`;
        text += `Try increasing max_distance or removing filters.\n`;
      } else {
        text += `Found ${nearbyNodes.length} nodes:\n\n`;

        // Group by type
        const keystones = nearbyNodes.filter((n) => n.node.isKeystone);
        const notables = nearbyNodes.filter(
          (n) => n.node.isNotable && !n.node.isKeystone
        );

        if (keystones.length > 0) {
          text += `**KEYSTONES** (${keystones.length}):\n`;
          for (const item of keystones.slice(0, 10)) {
            text += `\n${item.node.name} [Node: ${item.nodeId}]\n`;
            text += `  Distance: ${item.distance} nodes (${item.pathCost} points)\n`;
            if (item.node.stats && item.node.stats.length > 0) {
              text += `  Stats:\n`;
              for (const stat of item.node.stats) {
                text += `    - ${stat}\n`;
              }
            }
          }
          text += `\n`;
        }

        if (notables.length > 0) {
          text += `**NOTABLES** (${notables.length}):\n`;
          for (const item of notables.slice(0, 20)) {
            text += `\n${item.node.name} [Node: ${item.nodeId}]\n`;
            text += `  Distance: ${item.distance} nodes (${item.pathCost} points)\n`;
            if (item.node.stats && item.node.stats.length > 0) {
              text += `  Stats:\n`;
              for (const stat of item.node.stats) {
                text += `    - ${stat}\n`;
              }
            }
          }
        }

        text += `\n\n**Usage:**\n`;
        text += `Use test_allocation with the node ID to see stat impacts:\n`;
        text += `  Example: test_allocation with changes="allocate node 12345"\n`;
      }

      return {
        content: [
          {
            type: "text",
            text,
          },
        ],
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to get nearby nodes: ${errorMsg}`);
    }
  }

  private async handlePlanTree(buildName: string | undefined, goals: string) {
    try {
      const output = await this.planTree(buildName, goals);

      return {
        content: [
          {
            type: "text",
            text: output,
          },
        ],
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to plan tree: ${errorMsg}`);
    }
  }

  private async handleGetBuildXml(buildName: string) {
    try {
      const buildPath = path.join(this.pobDirectory, buildName);
      const xml = await fs.readFile(buildPath, "utf-8");

      return {
        content: [
          {
            type: "text",
            text: xml,
          },
        ],
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to read build XML: ${errorMsg}`);
    }
  }

  // Lua Bridge Tool Handlers
  private async handleLuaStart() {
    try {
      await this.ensureLuaClient();

      return {
        content: [
          {
            type: "text",
            text: this.useTcpMode
              ? `PoB Lua Bridge started successfully in TCP mode.\n\nConnected to PoB GUI at ${process.env.POB_API_TCP_HOST || '127.0.0.1'}:${process.env.POB_API_TCP_PORT || '31337'}`
              : `PoB Lua Bridge started successfully in headless mode.\n\nThe PoB calculation engine is now ready to load builds and compute stats.`,
          },
        ],
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      throw new Error(errorMsg);
    }
  }

  private async handleLuaStop() {
    await this.stopLuaClient();

    return {
      content: [
        {
          type: "text",
          text: "PoB Lua Bridge stopped successfully.",
        },
      ],
    };
  }

  private async handleLuaLoadBuild(buildXml: string, name?: string) {
    try {
      await this.ensureLuaClient();

      if (!this.luaClient) {
        throw new Error('Lua client not initialized');
      }

      await this.luaClient.loadBuildXml(buildXml, name);

      return {
        content: [
          {
            type: "text",
            text: `Build "${name || 'MCP Build'}" loaded successfully into PoB.\n\nYou can now use lua_get_stats, lua_get_tree, and lua_set_tree to interact with this build.`,
          },
        ],
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to load build: ${errorMsg}`);
    }
  }

  private async handleLuaGetStats(fields?: string[]) {
    try {
      await this.ensureLuaClient();

      if (!this.luaClient) {
        throw new Error('Lua client not initialized');
      }

      const stats = await this.luaClient.getStats(fields);

      let text = "=== PoB Calculated Stats ===\n\n";

      if (stats && typeof stats === 'object') {
        for (const [key, value] of Object.entries(stats)) {
          text += `${key}: ${value}\n`;
        }
      } else {
        text += "No stats available.\n";
      }

      return {
        content: [
          {
            type: "text",
            text,
          },
        ],
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to get stats: ${errorMsg}`);
    }
  }

  private async handleLuaGetTree() {
    try {
      await this.ensureLuaClient();

      if (!this.luaClient) {
        throw new Error('Lua client not initialized');
      }

      const tree = await this.luaClient.getTree();

      let text = "=== PoB Passive Tree ===\n\n";

      if (tree && typeof tree === 'object') {
        text += `Tree Version: ${tree.treeVersion || 'Unknown'}\n`;
        text += `Class ID: ${tree.classId || 'Unknown'}\n`;
        text += `Ascendancy ID: ${tree.ascendClassId || 'Unknown'}\n`;

        if (tree.secondaryAscendClassId) {
          text += `Secondary Ascendancy ID: ${tree.secondaryAscendClassId}\n`;
        }

        if (tree.nodes && Array.isArray(tree.nodes)) {
          text += `\nAllocated Nodes: ${tree.nodes.length} nodes\n`;
          text += `Node IDs: ${tree.nodes.slice(0, 20).join(', ')}`;
          if (tree.nodes.length > 20) {
            text += ` ... and ${tree.nodes.length - 20} more`;
          }
          text += '\n';
        }

        if (tree.masteryEffects && typeof tree.masteryEffects === 'object') {
          const effectCount = Object.keys(tree.masteryEffects).length;
          text += `\nMastery Effects: ${effectCount} selected\n`;
        }
      } else {
        text += "No tree data available.\n";
      }

      return {
        content: [
          {
            type: "text",
            text,
          },
        ],
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to get tree: ${errorMsg}`);
    }
  }

  private async handleLuaSetTree(args: any) {
    try {
      await this.ensureLuaClient();

      if (!this.luaClient) {
        throw new Error('Lua client not initialized');
      }

      // Validate required fields
      if (typeof args.classId !== 'number') {
        throw new Error('classId must be a number');
      }
      if (typeof args.ascendClassId !== 'number') {
        throw new Error('ascendClassId must be a number');
      }
      if (!Array.isArray(args.nodes)) {
        throw new Error('nodes must be an array');
      }

      const tree = await this.luaClient.setTree({
        classId: args.classId,
        ascendClassId: args.ascendClassId,
        secondaryAscendClassId: args.secondaryAscendClassId,
        nodes: args.nodes,
        masteryEffects: args.masteryEffects,
        treeVersion: args.treeVersion,
      });

      let text = "=== Passive Tree Updated ===\n\n";
      text += `Successfully updated passive tree in PoB.\n`;
      text += `Allocated ${args.nodes.length} nodes.\n\n`;
      text += `Stats have been recalculated. Use lua_get_stats to see updated values.`;

      return {
        content: [
          {
            type: "text",
            text,
          },
        ],
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to set tree: ${errorMsg}`);
    }
  }

  // Phase 4: Item & Skill Handlers

  private async handleAddItem(itemText: string, slotName?: string, noAutoEquip?: boolean) {
    try {
      await this.ensureLuaClient();

      if (!this.luaClient) {
        throw new Error('Lua client not initialized. Use lua_start first.');
      }

      if (!itemText || itemText.trim().length === 0) {
        throw new Error('item_text cannot be empty');
      }

      const result = await this.luaClient.addItem(itemText, slotName, noAutoEquip);

      let text = "=== Item Added ===\n\n";
      text += `Successfully added item to build.\n\n`;
      text += `Item: ${result.name || 'Unknown'}\n`;
      text += `Item ID: ${result.id}\n`;
      text += `Slot: ${result.slot || 'Not equipped'}\n\n`;
      text += `Stats have been recalculated. Use lua_get_stats to see updated values.`;

      return {
        content: [
          {
            type: "text",
            text,
          },
        ],
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to add item: ${errorMsg}`);
    }
  }

  private async handleGetEquippedItems() {
    try {
      await this.ensureLuaClient();

      if (!this.luaClient) {
        throw new Error('Lua client not initialized. Use lua_start first.');
      }

      const items = await this.luaClient.getItems();

      let text = "=== Equipped Items ===\n\n";

      if (!items || items.length === 0) {
        text += "No items equipped.\n";
      } else {
        for (const item of items) {
          text += `**${item.slot}**\n`;
          if (item.id === 0 || !item.name) {
            text += "  (empty)\n";
          } else {
            text += `  ${item.name}`;
            if (item.baseName && item.baseName !== item.name) {
              text += ` (${item.baseName})`;
            }
            text += `\n`;
            if (item.rarity) {
              text += `  Rarity: ${item.rarity}\n`;
            }
            if (item.active !== undefined) {
              text += `  Active: ${item.active ? 'Yes' : 'No'}\n`;
            }
          }
          text += "\n";
        }
      }

      return {
        content: [
          {
            type: "text",
            text,
          },
        ],
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to get equipped items: ${errorMsg}`);
    }
  }

  private async handleToggleFlask(flaskNumber: number, active: boolean) {
    try {
      await this.ensureLuaClient();

      if (!this.luaClient) {
        throw new Error('Lua client not initialized. Use lua_start first.');
      }

      if (flaskNumber < 1 || flaskNumber > 5) {
        throw new Error('flask_number must be between 1 and 5');
      }

      await this.luaClient.setFlaskActive(flaskNumber, active);

      let text = "=== Flask Status Updated ===\n\n";
      text += `Flask ${flaskNumber} is now ${active ? 'activated' : 'deactivated'}.\n\n`;
      text += `Stats have been recalculated. Use lua_get_stats to see updated values.`;

      return {
        content: [
          {
            type: "text",
            text,
          },
        ],
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to toggle flask: ${errorMsg}`);
    }
  }

  private async handleGetSkillSetup() {
    try {
      await this.ensureLuaClient();

      if (!this.luaClient) {
        throw new Error('Lua client not initialized. Use lua_start first.');
      }

      const skillData = await this.luaClient.getSkills();

      let text = "=== Skill Setup ===\n\n";
      text += `Main Socket Group: ${skillData.mainSocketGroup || 'None'}\n\n`;

      if (!skillData.groups || skillData.groups.length === 0) {
        text += "No skill groups found.\n";
      } else {
        for (const group of skillData.groups) {
          const isMain = group.index === skillData.mainSocketGroup;
          text += `**Group ${group.index}${isMain ? ' (MAIN)' : ''}**\n`;
          if (group.label) {
            text += `  Label: ${group.label}\n`;
          }
          if (group.slot) {
            text += `  Slot: ${group.slot}\n`;
          }
          text += `  Enabled: ${group.enabled ? 'Yes' : 'No'}\n`;
          text += `  Contributes to Full DPS: ${group.includeInFullDPS ? 'Yes' : 'No'}\n`;
          if (group.mainActiveSkill) {
            text += `  Main Active Skill Index: ${group.mainActiveSkill}\n`;
          }
          if (group.skills && group.skills.length > 0) {
            text += `  Skills: ${group.skills.join(', ')}\n`;
          }
          text += "\n";
        }
      }

      return {
        content: [
          {
            type: "text",
            text,
          },
        ],
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to get skill setup: ${errorMsg}`);
    }
  }

  private async handleSetMainSkill(socketGroup: number, activeSkillIndex?: number, skillPart?: number) {
    try {
      await this.ensureLuaClient();

      if (!this.luaClient) {
        throw new Error('Lua client not initialized. Use lua_start first.');
      }

      if (socketGroup < 1) {
        throw new Error('socket_group must be >= 1');
      }

      await this.luaClient.setMainSelection({
        mainSocketGroup: socketGroup,
        mainActiveSkill: activeSkillIndex,
        skillPart,
      });

      let text = "=== Main Skill Updated ===\n\n";
      text += `Successfully set main socket group to ${socketGroup}.\n`;
      if (activeSkillIndex !== undefined) {
        text += `Active skill index set to ${activeSkillIndex}.\n`;
      }
      if (skillPart !== undefined) {
        text += `Skill part set to ${skillPart}.\n`;
      }
      text += `\nStats have been recalculated. Use lua_get_stats to see updated values.`;

      return {
        content: [
          {
            type: "text",
            text,
          },
        ],
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to set main skill: ${errorMsg}`);
    }
  }

  // Phase 6: Build Optimization Handlers

  private async handleAnalyzeDefenses(buildName?: string) {
    try {
      if (!buildName) {
        throw new Error('build_name is required. Please specify which build to analyze.');
      }

      await this.ensureLuaClient();

      if (!this.luaClient) {
        throw new Error('Lua client not initialized.');
      }

      const targetBuild = buildName;

      // Load the build into the Lua bridge
      const buildPath = path.join(this.pobDirectory, targetBuild);
      const buildXml = await fs.readFile(buildPath, 'utf-8');
      const loadResult = await this.luaClient.loadBuildXml(buildXml, 'Defense Analysis');

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
      const stats = await this.luaClient.getStats();

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
            type: "text",
            text,
          },
        ],
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to analyze defenses: ${errorMsg}`);
    }
  }

  private async handleSuggestOptimalNodes(
    buildName: string,
    goalString: string,
    maxPoints?: number,
    maxDistance?: number,
    minEfficiency?: number,
    includeKeystones?: boolean
  ) {
    try {
      // Parse parameters
      const goal = parseGoal(goalString);
      const pointsLimit = maxPoints || 10;
      const searchDistance = maxDistance || 5;
      const efficiencyThreshold = minEfficiency || 0;
      const allowKeystones = includeKeystones !== false;  // Default true

      console.error(`[SuggestOptimalNodes] Build: ${buildName}, Goal: ${goal}, MaxPoints: ${pointsLimit}, MaxDist: ${searchDistance}`);

      // Step 1: Load build and get tree data
      const build = await this.readBuild(buildName);
      if (!build.Tree?.Spec) {
        throw new Error("Build has no passive tree data");
      }

      const allocatedNodeIds = this.parseAllocatedNodes(build);
      const allocatedNodes = new Set<string>(allocatedNodeIds);
      const treeVersion = this.extractBuildVersion(build);
      const treeData = await this.getTreeData(treeVersion);

      // Get build's ascendancy for filtering
      const buildAscendancy = build.Build?.ascendClassName;
      console.error(`[SuggestOptimalNodes] Build ascendancy: ${buildAscendancy}`);

      console.error(`[SuggestOptimalNodes] Allocated nodes: ${allocatedNodes.size}, Tree version: ${treeVersion}`);

      // Step 2: Discover candidate nodes within distance
      const candidates = this.findNearbyNodes(
        allocatedNodes,
        treeData,
        searchDistance
      );

      console.error(`[SuggestOptimalNodes] Found ${candidates.length} candidates within ${searchDistance} nodes`);

      // Filter by type and ascendancy
      let filteredCandidates = candidates;

      // First filter: Remove ascendancy nodes that don't match build's ascendancy
      if (buildAscendancy) {
        const beforeAscFilter = filteredCandidates.length;
        filteredCandidates = filteredCandidates.filter(c => {
          // If node has an ascendancy, it must match the build's ascendancy
          if (c.node.ascendancyName) {
            return c.node.ascendancyName === buildAscendancy;
          }
          // Non-ascendancy nodes are always allowed
          return true;
        });
        const removedCount = beforeAscFilter - filteredCandidates.length;
        if (removedCount > 0) {
          console.error(`[SuggestOptimalNodes] Removed ${removedCount} wrong-ascendancy nodes`);
        }
      }

      // Second filter: Keystones (optional)
      if (!allowKeystones) {
        filteredCandidates = filteredCandidates.filter(c => !c.node.isKeystone);
        console.error(`[SuggestOptimalNodes] After keystone filter: ${filteredCandidates.length} candidates`);
      } else {
        console.error(`[SuggestOptimalNodes] After ascendancy filter: ${filteredCandidates.length} candidates`);
      }

      if (filteredCandidates.length === 0) {
        return {
          content: [{
            type: "text",
            text: `No candidate nodes found within ${searchDistance} nodes.\nTry increasing max_distance or enabling keystones.`
          }]
        };
      }

      // Step 3: Initialize Lua bridge and get baseline stats
      await this.ensureLuaClient();
      if (!this.luaClient) {
        throw new Error('Lua bridge required for optimal node suggestions. Enable POB_LUA_ENABLED.');
      }

      console.error('[SuggestOptimalNodes] Lua bridge ready');

      const buildPath = path.join(this.pobDirectory, buildName);
      const buildXml = await fs.readFile(buildPath, 'utf-8');
      await this.luaClient.loadBuildXml(buildXml, 'Optimization Analysis');

      const baselineStats = await this.luaClient.getStats();
      const baselineTree = await this.luaClient.getTree();

      const statExtractor = getStatExtractor(goal);
      const baselineValue = statExtractor(baselineStats);

      console.error(`[SuggestOptimalNodes] Baseline ${goal}: ${baselineValue}`);

      // Step 4: Score each candidate
      const scores: NodeScore[] = [];
      let scoredCount = 0;

      for (let i = 0; i < filteredCandidates.length; i++) {
        const candidate = filteredCandidates[i];

        // Find shortest path to this node
        const paths = this.findShortestPaths(
          allocatedNodes,
          candidate.nodeId,
          treeData,
          1
        );

        if (paths.length === 0) {
          console.error(`[SuggestOptimalNodes] No path to node ${candidate.nodeId}`);
          continue;
        }

        const path = paths[0];

        // Skip if exceeds point budget
        if (path.cost > pointsLimit) {
          continue;
        }

        // Allocate path and measure stat gain
        const newNodes = [...baselineTree.nodes, ...path.nodes.map(n => parseInt(n))];

        try {
          await this.luaClient.setTree({
            ...baselineTree,
            nodes: newNodes
          });

          const newStats = await this.luaClient.getStats();
          const newValue = statExtractor(newStats);
          const gain = newValue - baselineValue;

          // Calculate efficiency
          const efficiency = gain / path.cost;

          // Only include if meets minimum efficiency
          if (efficiency >= efficiencyThreshold) {
            const percentIncrease = baselineValue > 0 ? (gain / baselineValue) * 100 : 0;

            scores.push({
              nodeId: candidate.nodeId,
              nodeName: candidate.node.name || 'Unknown',
              nodeType: getNodeType(candidate.node),
              pathNodes: path.nodes,
              pathCost: path.cost,
              statGain: gain,
              efficiency: efficiency,
              currentValue: baselineValue,
              newValue: newValue,
              percentIncrease: percentIncrease,
              secondaryBenefits: extractSecondaryBenefits(baselineStats, newStats, goal),
              notes: candidate.node.isKeystone ? 'Keystone - may have major effects' : undefined
            });

            scoredCount++;
          }

          // Reset tree for next test
          await this.luaClient.setTree(baselineTree);

        } catch (error) {
          console.error(`[SuggestOptimalNodes] Error testing node ${candidate.nodeId}:`, error);
          // Reset and continue
          await this.luaClient.setTree(baselineTree);
          continue;
        }

        // Progress logging every 5 nodes
        if ((i + 1) % 5 === 0) {
          console.error(`[SuggestOptimalNodes] Progress: ${i + 1}/${filteredCandidates.length} candidates evaluated`);
        }
      }

      console.error(`[SuggestOptimalNodes] Scored ${scoredCount} nodes out of ${filteredCandidates.length} candidates`);

      // Step 5: Sort by efficiency and prepare result
      scores.sort((a, b) => b.efficiency - a.efficiency);

      const topScores = scores.slice(0, 10);

      // Calculate summary
      const top3 = topScores.slice(0, 3);
      const totalGain = top3.reduce((sum, s) => sum + s.statGain, 0);
      const totalCost = top3.reduce((sum, s) => sum + s.pathCost, 0);
      const avgEfficiency = totalCost > 0 ? totalGain / totalCost : 0;

      const warnings: string[] = [];
      if (scoredCount === 0 && filteredCandidates.length > 0) {
        warnings.push(`No nodes met minimum efficiency threshold (${efficiencyThreshold})`);
      }
      if (filteredCandidates.length < 5) {
        warnings.push(`Limited candidates found. Consider increasing max_distance.`);
      }

      const result: OptimalNodesResult = {
        goal: goal,
        goalDescription: getGoalDescription(goal),
        buildName: buildName,
        currentValue: baselineValue,
        pointsAvailable: pointsLimit,
        maxDistance: searchDistance,
        candidatesEvaluated: filteredCandidates.length,
        candidatesScored: scoredCount,
        recommendations: topScores,
        summary: {
          topPick: topScores[0],
          totalStatGain: totalGain,
          totalPointCost: totalCost,
          averageEfficiency: avgEfficiency,
          projectedValue: baselineValue + totalGain,
          projectedIncrease: baselineValue > 0 ? (totalGain / baselineValue) * 100 : 0
        },
        warnings: warnings
      };

      // Format and return
      const formattedText = formatOptimalNodesResult(result);

      return {
        content: [{
          type: "text",
          text: formattedText
        }]
      };

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to suggest optimal nodes: ${errorMsg}`);
    }
  }

  /**
   * Full passive tree optimization with node addition AND removal
   */
  private async handleOptimizeTree(
    buildName: string,
    goalString: string,
    maxPoints?: number,
    maxIterations?: number,
    constraints?: OptimizationConstraints
  ) {
    try {
      // Parse parameters
      const goal = parseOptimizationGoal(goalString);
      const iterationLimit = maxIterations || 20;
      const constraintsObj = constraints || {};

      console.error(`[OptimizeTree] Build: ${buildName}, Goal: ${goal}, MaxIter: ${iterationLimit}`);

      // Step 1: Load build and tree data
      const build = await this.readBuild(buildName);
      if (!build.Tree?.Spec) {
        throw new Error("Build has no passive tree data");
      }

      const allocatedNodeIds = this.parseAllocatedNodes(build);
      const treeVersion = this.extractBuildVersion(build);
      const treeData = await this.getTreeData(treeVersion);
      const buildAscendancy = build.Build?.ascendClassName;

      console.error(`[OptimizeTree] Starting with ${allocatedNodeIds.length} allocated nodes`);

      // Step 2: Initialize Lua bridge
      await this.ensureLuaClient();
      if (!this.luaClient) {
        throw new Error('Lua bridge required for tree optimization. Enable POB_LUA_ENABLED.');
      }

      const buildPath = path.join(this.pobDirectory, buildName);
      const buildXml = await fs.readFile(buildPath, 'utf-8');
      await this.luaClient.loadBuildXml(buildXml, 'Tree Optimization');

      // Get baseline
      const baselineStats = await this.luaClient.getStats();
      const baselineTree = await this.luaClient.getTree();
      const baselineScore = calculateScore(baselineStats, goal);

      // Determine point budget
      const pointBudget = maxPoints || (baselineTree.nodes.length + 5);
      console.error(`[OptimizeTree] Point budget: ${pointBudget}, Baseline score: ${baselineScore.toFixed(0)}`);

      // Step 3: Iterative optimization
      let currentTree = baselineTree;
      let currentScore = baselineScore;
      let currentStats = baselineStats;
      let iteration = 0;
      let improvementFound = true;

      const nodesAdded: string[] = [];
      const nodesRemoved: string[] = [];

      while (iteration < iterationLimit && improvementFound) {
        iteration++;
        improvementFound = false;

        console.error(`[OptimizeTree] Iteration ${iteration}/${iterationLimit}, Score: ${currentScore.toFixed(0)}, Points: ${currentTree.nodes.length}/${pointBudget}`);

        // Phase A: Try adding beneficial nodes (if under budget)
        if (currentTree.nodes.length < pointBudget) {
          const allocatedNodes = new Set<string>(currentTree.nodes.map((n: number) => String(n)));

          // Find nearby candidates
          const candidates = this.findNearbyNodes(allocatedNodes, treeData, 3); // Search distance: 3

          // Filter by ascendancy
          const filteredCandidates = candidates.filter(c => {
            if (c.node.ascendancyName && buildAscendancy) {
              return c.node.ascendancyName === buildAscendancy;
            }
            return true;
          });

          console.error(`[OptimizeTree]   Testing ${filteredCandidates.length} add candidates...`);

          let bestAddNode: string | null = null;
          let bestAddScore = currentScore;
          let bestAddPath: string[] = [];

          for (const candidate of filteredCandidates.slice(0, 30)) { // Limit to 30 for performance
            // Find path to this node
            const paths = this.findShortestPaths(allocatedNodes, candidate.nodeId, treeData, 1);
            if (paths.length === 0) continue;

            const path = paths[0];

            // Skip if exceeds budget
            if (currentTree.nodes.length + path.cost > pointBudget) continue;

            // Test allocation
            try {
              const testNodes = [...currentTree.nodes, ...path.nodes.map(n => parseInt(n))];
              await this.luaClient.setTree({ ...currentTree, nodes: testNodes });

              const testStats = await this.luaClient.getStats();

              // Check constraints
              if (!meetsConstraints(testStats, constraintsObj)) {
                await this.luaClient.setTree(currentTree);
                continue;
              }

              const testScore = calculateScore(testStats, goal);

              if (testScore > bestAddScore) {
                bestAddNode = candidate.nodeId;
                bestAddScore = testScore;
                bestAddPath = path.nodes;
              }

              await this.luaClient.setTree(currentTree);
            } catch (error) {
              console.error(`[OptimizeTree] Error testing add ${candidate.nodeId}:`, error);
              await this.luaClient.setTree(currentTree);
              continue;
            }
          }

          // Apply best addition if found
          if (bestAddNode) {
            currentTree = { ...currentTree, nodes: [...currentTree.nodes, ...bestAddPath.map(n => parseInt(n))] };
            await this.luaClient.setTree(currentTree);
            currentStats = await this.luaClient.getStats();
            currentScore = bestAddScore;
            nodesAdded.push(...bestAddPath);
            improvementFound = true;
            console.error(`[OptimizeTree]   ✓ Added node ${bestAddNode} (+${(bestAddScore - currentScore).toFixed(0)} score)`);
          }
        }

        // Phase B: Try removing inefficient nodes
        const allocatedSet = new Set<string>(currentTree.nodes.map((n: number) => String(n)));
        const removableCandidates = findRemovableNodes(allocatedSet, treeData, constraintsObj);

        console.error(`[OptimizeTree]   Testing ${removableCandidates.length} remove candidates...`);

        let bestRemoveNode: string | null = null;
        let bestRemoveScore = currentScore;

        for (const nodeId of removableCandidates.slice(0, 20)) { // Limit to 20 for performance
          try {
            const testNodes = currentTree.nodes.filter((n: number) => String(n) !== nodeId);
            await this.luaClient.setTree({ ...currentTree, nodes: testNodes });

            const testStats = await this.luaClient.getStats();

            // Check constraints
            if (!meetsConstraints(testStats, constraintsObj)) {
              await this.luaClient.setTree(currentTree);
              continue;
            }

            const testScore = calculateScore(testStats, goal);

            // Accept removal if score doesn't drop much (within 1% is OK for saving a point)
            if (testScore >= currentScore * 0.99) {
              bestRemoveNode = nodeId;
              bestRemoveScore = testScore;
            }

            await this.luaClient.setTree(currentTree);
          } catch (error) {
            console.error(`[OptimizeTree] Error testing remove ${nodeId}:`, error);
            await this.luaClient.setTree(currentTree);
            continue;
          }
        }

        // Apply best removal if found
        if (bestRemoveNode) {
          currentTree = { ...currentTree, nodes: currentTree.nodes.filter((n: number) => String(n) !== bestRemoveNode) };
          await this.luaClient.setTree(currentTree);
          currentStats = await this.luaClient.getStats();
          currentScore = bestRemoveScore;
          nodesRemoved.push(bestRemoveNode);
          improvementFound = true;
          console.error(`[OptimizeTree]   ✓ Removed node ${bestRemoveNode} (saved point, score: ${bestRemoveScore.toFixed(0)})`);
        }

        // If no improvement in this iteration, stop
        if (!improvementFound) {
          console.error(`[OptimizeTree] No improvements found, stopping.`);
          break;
        }
      }

      // Step 4: Build result
      const finalStats = await this.luaClient.getStats();
      const finalScore = calculateScore(finalStats, goal);

      const result: OptimizationResult = {
        goal: goal,
        goalDescription: getOptGoalDescription(goal),
        buildName: buildName,
        startingStats: {
          targetValue: baselineScore,
          life: parseFloat(baselineStats.Life || 0),
          es: parseFloat(baselineStats.EnergyShield || 0),
          dps: parseFloat(baselineStats.TotalDPS || 0),
          pointsAllocated: baselineTree.nodes.length
        },
        finalStats: {
          targetValue: finalScore,
          life: parseFloat(finalStats.Life || 0),
          es: parseFloat(finalStats.EnergyShield || 0),
          dps: parseFloat(finalStats.TotalDPS || 0),
          pointsAllocated: currentTree.nodes.length
        },
        improvements: {
          targetValueGain: finalScore - baselineScore,
          targetValuePercent: baselineScore > 0 ? ((finalScore - baselineScore) / baselineScore) * 100 : 0,
          lifeChange: parseFloat(finalStats.Life || 0) - parseFloat(baselineStats.Life || 0),
          esChange: parseFloat(finalStats.EnergyShield || 0) - parseFloat(baselineStats.EnergyShield || 0),
          dpsChange: parseFloat(finalStats.TotalDPS || 0) - parseFloat(baselineStats.TotalDPS || 0),
          pointsChange: currentTree.nodes.length - baselineTree.nodes.length
        },
        iterations: iteration,
        nodesAdded: [...new Set(nodesAdded)], // Deduplicate
        nodesRemoved: [...new Set(nodesRemoved)],
        constraintsMet: meetsConstraints(finalStats, constraintsObj),
        warnings: [],
        formattedTree: {
          classId: currentTree.classId,
          ascendClassId: currentTree.ascendClassId,
          nodes: currentTree.nodes
        }
      };

      // Add warnings
      if (iteration >= iterationLimit) {
        result.warnings.push(`Reached maximum iterations (${iterationLimit}). Further optimizations may be possible.`);
      }
      if (nodesAdded.length === 0 && nodesRemoved.length === 0) {
        result.warnings.push(`Tree is already optimal for the given goal and constraints.`);
      }
      if (!result.constraintsMet) {
        result.warnings.push(`Final tree does not meet all constraints! Review carefully.`);
      }

      // Format and return
      const formattedText = formatOptimizationResult(result);

      return {
        content: [{
          type: "text",
          text: formattedText
        }]
      };

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to optimize tree: ${errorMsg}`);
    }
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
