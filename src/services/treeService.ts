import https from "https";
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

export class TreeService {
  private treeDataCache: Map<string, TreeDataCache> = new Map();
  private buildService: BuildService;

  constructor(buildService: BuildService) {
    this.buildService = buildService;
  }

  async getTreeData(version: string = "3_26"): Promise<PassiveTreeData> {
    // Check cache first
    const cached = this.treeDataCache.get(version);
    if (cached) {
      console.error(`[Tree Cache] Hit for version ${version}`);
      return cached.data;
    }

    // Cache miss - fetch from source
    console.error(`[Tree Cache] Miss for version ${version}`);
    const treeData = await this.fetchTreeDataFromRepo(version);

    // Store in cache
    this.treeDataCache.set(version, {
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

  async fetchTreeDataFromRepo(version: string = "3_26"): Promise<PassiveTreeData> {
    console.error(`[Tree Data] Fetching tree data for version ${version}...`);

    const url = `https://raw.githubusercontent.com/PathOfBuildingCommunity/PathOfBuilding/master/src/TreeData/${version}/tree.lua`;

    return new Promise((resolve, reject) => {
      https.get(url, (response) => {
        if (response.statusCode === 404) {
          // Version not found, try fallback to 3_26
          console.error(`[Tree Data] Version ${version} not found, falling back to 3_26`);
          if (version !== "3_26") {
            this.fetchTreeDataFromRepo("3_26").then(resolve).catch(reject);
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

  findShortestPaths(
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

      // Determine tree version from build
      let treeVersion = this.buildService.extractBuildVersion(build);
      if (treeVersion === "Unknown") {
        treeVersion = "3_26";
      }

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
