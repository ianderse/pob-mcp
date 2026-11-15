import fs from "fs";
import path from "path";
import type {
  PassiveTreeNode,
  PassiveTreeData,
  TreeDataCache,
  PoBBuild,
  TreeAnalysisResult,
  PathOptimization,
  EfficiencyScore,
  OptimizationSuggestion,
} from "../types.js";
import { BuildService } from "./buildService.js";
import { resolveConfiguredPoBLayout } from "../utils/pobLayout.js";

export class TreeService {
  private treeDataCache: Map<string, TreeDataCache> = new Map();
  private buildService: BuildService;

  constructor(buildService: BuildService) {
    this.buildService = buildService;
  }

  /** A build without a tree version reads as the newest tree the configured PoB has. */
  async getTreeData(version?: string): Promise<PassiveTreeData> {
    const resolvedVersion = version && version !== "Unknown" ? version : this.latestTreeVersion();

    const cached = this.treeDataCache.get(resolvedVersion);
    if (cached) {
      console.error(`[Tree Cache] Hit for version ${resolvedVersion}`);
      return cached.data;
    }

    console.error(`[Tree Cache] Miss for version ${resolvedVersion}`);
    const treeData = this.readTreeData(resolvedVersion);

    this.treeDataCache.set(resolvedVersion, {
      data: treeData,
      timestamp: Date.now(),
    });

    return treeData;
  }

  async refreshTreeData(version?: string): Promise<void> {
    if (version) {
      this.treeDataCache.delete(version);
      console.error(`[Tree Cache] Cleared cache for version ${version}`);
    } else {
      this.treeDataCache.clear();
      console.error(`[Tree Cache] Cleared all cached tree data`);
    }
  }

  /**
   * Tree data comes from the same PoB the Lua bridge runs. A new league's tree
   * reaches PoB's dev branch weeks before master, so a version this PoB lacks
   * is an error: another league's nodes would answer with the wrong tree.
   */
  private readTreeData(version: string): PassiveTreeData {
    const treeDataDir = path.join(resolveConfiguredPoBLayout().src, "TreeData");
    const treeFile = path.join(treeDataDir, version, "tree.lua");
    if (!fs.existsSync(treeFile)) {
      throw new Error(
        `Path of Building has no passive tree ${version} at ${treeFile}. ` +
        `It has: ${this.availableTreeVersions(treeDataDir).join(", ")}. ` +
        `Point POB_PATH at a PoB checkout that has ${version}.`
      );
    }

    const treeData = this.parseTreeLua(fs.readFileSync(treeFile, "utf8"), version);
    if (treeData.nodes.size === 0) {
      throw new Error(`Parsed no passive nodes from ${treeFile}; its format may have changed.`);
    }
    console.error(`[Tree Data] Parsed ${treeData.nodes.size} nodes from ${treeFile}`);
    return treeData;
  }

  private availableTreeVersions(treeDataDir: string): string[] {
    return fs.existsSync(treeDataDir)
      ? fs.readdirSync(treeDataDir).filter((name) => fs.existsSync(path.join(treeDataDir, name, "tree.lua")))
      : [];
  }

  /** PoB's own latestTreeVersion: the last entry of treeVersionList. */
  private latestTreeVersion(): string {
    const gameVersionsFile = path.join(resolveConfiguredPoBLayout().src, "GameVersions.lua");
    const treeVersionList = fs.readFileSync(gameVersionsFile, "utf8").match(/treeVersionList\s*=\s*\{([^}]*)\}/);
    const latest = treeVersionList?.[1].match(/"[^"]+"/g)?.at(-1)?.slice(1, -1);
    if (!latest) throw new Error(`Could not read treeVersionList from ${gameVersionsFile}`);
    return latest;
  }

  private parseTreeLua(luaContent: string, version: string): PassiveTreeData {
    const nodes = new Map<string, PassiveTreeNode>();

    // Extract nodes with brace counting for proper nesting
    const nodeStartPattern = /\[(\d+)\]\s*=\s*\{/g;

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
    const nameMatch = content.match(/\["name"\]\s*=\s*"([^"]+)"/);
    if (nameMatch) node.name = nameMatch[1];

    // Extract icon
    const iconMatch = content.match(/\["icon"\]\s*=\s*"([^"]+)"/);
    if (iconMatch) node.icon = iconMatch[1];

    // Extract stats (can be multiple)
    const stats: string[] = [];
    const statsMatch = content.match(/\["stats"\]\s*=\s*\{([^}]+)\}/);
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
    const isTrue = (key: string) => new RegExp(`\\["${key}"\\]\\s*=\\s*true`).test(content);
    if (isTrue("isKeystone")) node.isKeystone = true;
    if (isTrue("isNotable")) node.isNotable = true;
    if (isTrue("isMastery")) node.isMastery = true;
    if (isTrue("isJewelSocket")) node.isJewelSocket = true;
    if (isTrue("isAscendancyStart")) node.isAscendancyStart = true;

    // Extract ascendancy name if present
    const ascendancyNameMatch = content.match(/\["ascendancyName"\]\s*=\s*"([^"]+)"/);
    if (ascendancyNameMatch) {
      node.ascendancyName = ascendancyNameMatch[1];
    }

    // Extract connections (allowing for multiline and nested content)
    const outMatch = content.match(/\["out"\]\s*=\s*\{([^}]*)\}/);
    if (outMatch) {
      const outContent = outMatch[1];
      // Match quoted numbers: "12345"
      const matches = outContent.match(/"(\d+)"/g);
      if (matches) {
        node.out = matches.map(s => s.replace(/"/g, ''));
      }
    }

    const inMatch = content.match(/\["in"\]\s*=\s*\{([^}]*)\}/);
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

  async mapNodesToDetails(
    nodeIds: string[],
    treeData: PassiveTreeData
  ): Promise<{ nodes: PassiveTreeNode[]; invalidIds: string[] }> {
    const nodes: PassiveTreeNode[] = [];
    const invalidIds: string[] = [];

    for (const nodeId of nodeIds) {
      const numericId = parseInt(nodeId, 10);

      // Skip cluster jewel socket nodes (IDs >= 65536)
      // These are dynamically generated by PoB and won't be in static tree data
      if (numericId >= 65536) {
        continue;
      }

      const node = treeData.nodes.get(nodeId);
      if (!node) {
        invalidIds.push(nodeId);
      } else {
        nodes.push(node);
      }
    }

    return { nodes, invalidIds };
  }

  categorizeNodes(nodes: PassiveTreeNode[]): {
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

  calculatePassivePoints(build: PoBBuild, allocatedCount: number): {
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

  detectArchetype(keystones: PassiveTreeNode[], notables: PassiveTreeNode[]): {
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

  findNearbyNodes(
    allocatedNodes: Set<string>,
    treeData: PassiveTreeData,
    maxDistance: number,
    filter?: string
  ): Array<{ node: PassiveTreeNode; nodeId: string; distance: number; pathCost: number }> {
    const results: Array<{ node: PassiveTreeNode; nodeId: string; distance: number; pathCost: number }> = [];

    // BFS from all allocated nodes simultaneously (multi-source BFS).
    // This is O(V+E) — correct and optimal for unit-weight graphs, and avoids
    // the O(V²) linear scan of the previous Dijkstra implementation.
    // Uses bidirectional edges (both `out` and `in`) for consistency with findShortestPaths.
    const visited = new Set<string>();
    const distance = new Map<string, number>();
    const queue: Array<{ nodeId: string; dist: number }> = [];

    // Seed BFS with all currently allocated nodes at distance 0
    for (const nodeId of allocatedNodes) {
      if (treeData.nodes.has(nodeId)) {
        visited.add(nodeId);
        distance.set(nodeId, 0);
        queue.push({ nodeId, dist: 0 });
      }
    }

    const filterLower = filter?.toLowerCase();

    let head = 0;
    while (head < queue.length) {
      const { nodeId: currentId, dist } = queue[head++];

      // Prune: don't explore beyond maxDistance
      if (dist >= maxDistance) continue;

      const currentNode = treeData.nodes.get(currentId);
      if (!currentNode) continue;

      // Traverse both directions — PoB tree edges are bidirectional
      const neighbors = [...(currentNode.out || []), ...(currentNode.in || [])];
      for (const neighborId of neighbors) {
        if (visited.has(neighborId)) continue;
        visited.add(neighborId);

        const neighborDist = dist + 1;
        distance.set(neighborId, neighborDist);

        const neighborNode = treeData.nodes.get(neighborId);
        if (!neighborNode) continue;

        // Collect unallocated notables/keystones within range
        if ((neighborNode.isNotable || neighborNode.isKeystone) && !allocatedNodes.has(neighborId)) {
          if (filterLower) {
            const statsText = (neighborNode.stats || []).join(' ').toLowerCase();
            const nameText = (neighborNode.name || '').toLowerCase();
            if (statsText.includes(filterLower) || nameText.includes(filterLower)) {
              results.push({ node: neighborNode, nodeId: neighborId, distance: neighborDist, pathCost: neighborDist });
            }
          } else {
            results.push({ node: neighborNode, nodeId: neighborId, distance: neighborDist, pathCost: neighborDist });
          }
        }

        queue.push({ nodeId: neighborId, dist: neighborDist });
      }
    }

    results.sort((a, b) => a.distance - b.distance);
    return results;
  }

  findShortestPaths(
    allocatedNodes: Set<string>,
    targetNodeId: string,
    treeData: PassiveTreeData,
    maxPaths: number = 1
  ): Array<{ nodes: string[]; cost: number }> {
    // Multi-source BFS from all allocated nodes toward the target.
    // O(V+E) — correct and optimal for unit-weight graphs.
    // Bidirectional edges: PoB tree edges are traversable both ways.
    const visited = new Set<string>();
    const previous = new Map<string, string | null>();
    const queue: string[] = [];

    for (const nodeId of allocatedNodes) {
      if (treeData.nodes.has(nodeId)) {
        visited.add(nodeId);
        previous.set(nodeId, null);
        queue.push(nodeId);
      }
    }

    let head = 0;
    let found = false;

    while (head < queue.length) {
      const currentId = queue[head++];
      if (currentId === targetNodeId) { found = true; break; }

      const currentNode = treeData.nodes.get(currentId);
      if (!currentNode) continue;

      const neighbors = [...(currentNode.out || []), ...(currentNode.in || [])];
      for (const neighborId of neighbors) {
        if (visited.has(neighborId)) continue;
        visited.add(neighborId);
        previous.set(neighborId, currentId);
        queue.push(neighborId);
      }
    }

    if (!found && !visited.has(targetNodeId)) return [];

    // Reconstruct the path from target back to the closest allocated node
    const path: string[] = [];
    let current: string | null = targetNodeId;
    while (current !== null && !allocatedNodes.has(current)) {
      path.unshift(current);
      current = previous.get(current) ?? null;
    }

    return [{ nodes: path, cost: path.length }];
  }

  calculatePathingEfficiency(
    allocatedNodes: PassiveTreeNode[],
    keystones: PassiveTreeNode[],
    notables: PassiveTreeNode[],
    jewels: PassiveTreeNode[]
  ): string {
    const totalNodes = allocatedNodes.length;
    const destinationNodes = keystones.length + notables.length + jewels.length;
    const pathingNodes = totalNodes - destinationNodes;

    if (totalNodes === 0) return "No nodes allocated";
    if (destinationNodes === 0) return "No keystones, notables, or jewel sockets allocated";

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

  // Helper methods for optimization
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

  async analyzePassiveTree(build: PoBBuild): Promise<TreeAnalysisResult | null> {
    try {
      // Extract allocated node IDs
      const nodeIds = this.buildService.parseAllocatedNodes(build);
      if (nodeIds.length === 0) {
        return null; // No tree data in build
      }

      const treeData = await this.getTreeData(this.buildService.extractBuildVersion(build));

      // Map node IDs to details
      const { nodes: allocatedNodes, invalidIds } = await this.mapNodesToDetails(nodeIds, treeData);

      // If there are invalid nodes, fail with error
      if (invalidIds.length > 0) {
        throw new Error(
          `Invalid passive tree data detected.\n\nThe following node IDs could not be found in the ${treeData.version} passive tree data:\n${invalidIds.map(id => `- Node ID: ${id}`).join('\n')}\n\n` +
          `This usually means:\n1. The build is from an outdated league/patch\n2. The build file is corrupted\n3. The passive tree data needs to be refreshed\n\nPlease verify the build is from the current league or use a build from the active league.`
        );
      }

      // Categorize nodes
      const { keystones, notables, jewels, normal } = this.categorizeNodes(allocatedNodes);

      // Calculate points (exclude ascendancy nodes - they use separate point pool)
      const nonAscendancyNodes = allocatedNodes.filter(node => !node.ascendancyName);
      const points = this.calculatePassivePoints(build, nonAscendancyNodes.length);

      // Detect archetype
      const { archetype, confidence } = this.detectArchetype(keystones, notables);

      // Analyze pathing
      const pathingEfficiency = this.calculatePathingEfficiency(allocatedNodes, keystones, notables, jewels);

      // Version detection
      const buildVersion = this.buildService.extractBuildVersion(build);
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
        optimizationSuggestions,
      };
    } catch (error) {
      console.error('[Tree Analysis] Error:', error);
      throw error;
    }
  }
}
