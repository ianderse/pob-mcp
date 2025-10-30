# Optimal Nodes Recommendation System - Design Document

## Overview

An intelligent system that analyzes a build and suggests the best passive tree nodes to allocate based on specified goals. This goes beyond simple discovery to provide **scored, prioritized recommendations** with efficiency metrics.

## System Architecture

### Input Parameters

```typescript
interface SuggestOptimalNodesParams {
  build_name: string;           // Build to analyze
  goal: string;                 // Goal (e.g., "maximize dps", "increase life", "more defenses")
  max_points?: number;          // Max passive points to spend (default: 10)
  max_distance?: number;        // Max travel distance from current tree (default: 5)
  min_efficiency?: number;      // Minimum efficiency score to include (default: 0)
  include_keystones?: boolean;  // Include keystones in recommendations (default: true)
}
```

### Goal Types

The system will support multiple goal categories:

1. **Offense Goals**
   - `maximize_dps` - Total DPS increase
   - `maximize_hit_dps` - Hit damage only
   - `maximize_dot_dps` - DoT damage only
   - `crit_chance` - Critical strike chance
   - `crit_multi` - Critical strike multiplier
   - `attack_speed` - Attacks per second
   - `cast_speed` - Cast speed

2. **Defense Goals**
   - `maximize_life` - Maximum life pool
   - `maximize_es` - Energy shield
   - `maximize_ehp` - Effective hit points (Life + ES)
   - `resistances` - Elemental resistances
   - `armour` - Armour rating
   - `evasion` - Evasion rating
   - `block` - Block chance
   - `spell_block` - Spell block chance

3. **Utility Goals**
   - `movement_speed` - Movement speed
   - `mana_regen` - Mana regeneration
   - `life_regen` - Life regeneration
   - `attributes` - STR/DEX/INT

4. **Balanced Goals**
   - `balanced_offense_defense` - Mix of DPS and survivability
   - `league_start` - Efficient leveling priorities

## Scoring Algorithm

### Core Concept: Stat Gain Per Point

Each node is scored based on **how much it improves the target stat per passive point spent**.

```
Efficiency = (Stat Gain) / (Points Required to Allocate)
```

### Multi-Step Process

#### Step 1: Discovery
- Use `findNearbyNodes()` to find all reachable notables/keystones within `max_distance`
- Filter by node type (keystones, notables, jewel sockets)
- Result: List of candidate nodes with their travel costs

#### Step 2: Path Calculation
- For each candidate node, use `findShortestPaths()` to get exact path
- Extract: path nodes, total cost, travel nodes vs stat nodes

#### Step 3: Stat Impact Calculation (via Lua Bridge)
- For each candidate:
  - Load build into Lua bridge
  - Get current stats (baseline)
  - Allocate the path (all nodes needed)
  - Get new stats
  - Calculate delta for target stat
  - Reset for next candidate

#### Step 4: Efficiency Scoring
```typescript
interface NodeScore {
  nodeId: string;
  nodeName: string;
  pathNodes: string[];        // All nodes in path (travel + target)
  pathCost: number;           // Total points needed
  statGain: number;           // Increase in target stat
  efficiency: number;         // statGain / pathCost
  secondaryBenefits?: object; // Other stats improved
}
```

#### Step 5: Ranking & Filtering
- Sort by efficiency (descending)
- Filter by `min_efficiency`
- Limit to top N results
- Group by type (keystones, notables, etc.)

## Stat Extraction Logic

Different goals require different stat fields:

```typescript
const STAT_MAPPINGS = {
  maximize_dps: 'TotalDPS',
  maximize_life: 'Life',
  maximize_es: 'EnergyShield',
  maximize_ehp: (stats) => stats.Life + stats.EnergyShield,
  resistances: (stats) => Math.min(stats.FireResist, stats.ColdResist, stats.LightningResist),
  armour: 'Armour',
  evasion: 'Evasion',
  // ... etc
};
```

### Complex Goals

Some goals combine multiple stats:

**balanced_offense_defense**:
```typescript
score = (dpsGain / avgDPS * 0.5) + (lifeGain / avgLife * 0.5)
```

**league_start**:
```typescript
// Prioritize life early, DPS later
score = (lifeGain / pathCost * 1.5) + (dpsGain / pathCost * 0.5)
```

## Optimization Strategies

### Caching
- Cache tree data per version
- Cache build stats (invalidate on modification)
- Cache discovered nearby nodes

### Batching
- Load build once
- Get baseline stats once
- Test allocations sequentially
- Restore baseline between tests

### Pruning
- Skip nodes with no relevant stats (pure travel)
- Skip nodes with negative impact
- Skip nodes beyond max_distance early
- Skip already-allocated nodes

### Performance
- Limit candidate search to `max_distance` nodes
- Limit Lua bridge calls to top N candidates (by distance)
- Use fast path for simple goals (single stat lookup)

## Output Format

```typescript
interface OptimalNodesSuggestion {
  goal: string;
  pointsAvailable: number;
  candidatesEvaluated: number;
  recommendations: NodeScore[];
  summary: {
    topPick: NodeScore;
    totalStatGain: number;
    totalPointCost: number;
    averageEfficiency: number;
  };
  warnings?: string[];  // e.g., "Limited by max_distance", "No keystones found"
}
```

### Formatted Text Output

```
=== Optimal Nodes for Goal: Maximize Life ===

Build: Deadeye.xml
Current Life: 4,200
Points Available: 10
Max Distance: 5 nodes
Candidates Evaluated: 24

**TOP RECOMMENDATIONS:**

1. ⭐ Constitution (26725) - EFFICIENCY: +180 life/point
   Path: 4 nodes (3 travel + target)
   Stat Gain: +720 Life (17.1% increase)
   → Use: allocate_nodes(build_name="Deadeye.xml", node_ids=["12345", "23456", "34567", "26725"])

2. ⭐ Sentinel (2491) - EFFICIENCY: +150 life/point
   Path: 3 nodes (2 travel + target)
   Stat Gain: +450 Life (10.7% increase)
   → Use: allocate_nodes(build_name="Deadeye.xml", node_ids=["45678", "56789", "2491"])

3. Thick Skin (24970) - EFFICIENCY: +110 life/point
   Path: 5 nodes (4 travel + target)
   Stat Gain: +550 Life (13.1% increase)
   → Use: allocate_nodes(build_name="Deadeye.xml", node_ids=[...])

**SUMMARY:**
Top 3 picks would give +1,720 Life for 12 points (143 life/point average)
Current Life: 4,200 → Projected: 5,920 (+41% increase)

**TIP:** Constitution offers best efficiency. Allocate it first, then re-run this tool to find next best options.
```

## Algorithm Pseudocode

```typescript
async function suggestOptimalNodes(params: SuggestOptimalNodesParams) {
  // 1. Load and parse build
  const build = await readBuild(params.build_name);
  const allocatedNodes = parseAllocatedNodes(build);
  const treeData = await getTreeData(extractBuildVersion(build));

  // 2. Discover candidate nodes
  const candidates = findNearbyNodes(
    allocatedNodes,
    treeData,
    params.max_distance
  );

  // Filter by type
  if (!params.include_keystones) {
    candidates = candidates.filter(c => !c.node.isKeystone);
  }

  // 3. Initialize Lua bridge and get baseline
  await ensureLuaClient();
  const buildXml = await readFile(buildPath);
  await luaClient.loadBuildXml(buildXml);
  const baselineStats = await luaClient.getStats();
  const baselineTree = await luaClient.getTree();

  const targetStatGetter = getStatExtractor(params.goal);
  const baselineValue = targetStatGetter(baselineStats);

  // 4. Score each candidate
  const scores: NodeScore[] = [];

  for (const candidate of candidates) {
    // Find path
    const paths = findShortestPaths(
      allocatedNodes,
      candidate.nodeId,
      treeData,
      1
    );

    if (paths.length === 0) continue;
    const path = paths[0];

    // Don't exceed point budget
    if (path.cost > params.max_points) continue;

    // Allocate and measure
    const newNodes = [...baselineTree.nodes, ...path.nodes];
    await luaClient.setTree({
      ...baselineTree,
      nodes: newNodes
    });

    const newStats = await luaClient.getStats();
    const newValue = targetStatGetter(newStats);
    const gain = newValue - baselineValue;

    // Calculate efficiency
    const efficiency = gain / path.cost;

    if (efficiency >= params.min_efficiency) {
      scores.push({
        nodeId: candidate.nodeId,
        nodeName: candidate.node.name,
        pathNodes: path.nodes,
        pathCost: path.cost,
        statGain: gain,
        efficiency: efficiency,
        secondaryBenefits: extractSecondaryStats(baselineStats, newStats)
      });
    }

    // Reset tree for next test
    await luaClient.setTree(baselineTree);
  }

  // 5. Sort and return top results
  scores.sort((a, b) => b.efficiency - a.efficiency);

  return {
    goal: params.goal,
    pointsAvailable: params.max_points,
    candidatesEvaluated: candidates.length,
    recommendations: scores.slice(0, 10),
    summary: calculateSummary(scores)
  };
}
```

## Edge Cases & Error Handling

1. **No Lua Bridge Available**
   - Fallback to stat estimation from XML (less accurate)
   - Warn user that results are approximate

2. **No Candidates Found**
   - Suggest increasing `max_distance`
   - Suggest removing filters

3. **All Candidates Below Min Efficiency**
   - Suggest lowering `min_efficiency`
   - Show best available even if below threshold

4. **Conflicting Stats**
   - Some keystones give/remove stats (e.g., CI sets life to 1)
   - Handle negative gains gracefully
   - Mark as "trade-off" in output

5. **Already-Optimal Build**
   - All nearby nodes already allocated
   - Suggest looking further or different goal

## Future Enhancements

### Phase 6.2: Multi-Node Optimization
- Find best **combination** of N nodes (not just individual nodes)
- Use combinatorial optimization
- E.g., "Best 5 nodes to maximize DPS given 10 points"

### Phase 6.3: Budget-Aware Planning
- Respect point budget across multiple allocations
- E.g., "I have 15 points total, how should I spend them?"

### Phase 6.4: Path-Aware Scoring
- Consider value of travel nodes in the path
- E.g., path through +10 STR nodes has hidden value

### Phase 6.5: Jewel Socket Optimization
- Recommend jewel sockets with estimated jewel value
- Suggest specific jewels from trade/stash

## Testing Strategy

### Unit Tests
- Test stat extraction for each goal type
- Test efficiency calculation accuracy
- Test path finding integration

### Integration Tests
- Test with real builds (glass cannon, tanky, balanced)
- Verify recommendations make sense
- Compare against manual optimization

### Performance Tests
- Measure time for 20 candidates @ 5 distance
- Target: < 30 seconds total
- Profile Lua bridge calls (biggest bottleneck)

## Success Metrics

1. **Accuracy**: Recommendations should actually improve the target stat
2. **Relevance**: Top picks should be noticeably better than random nodes
3. **Efficiency**: Should identify high-value nodes (not just closest)
4. **Usability**: Output should be clear and actionable
5. **Performance**: Complete within reasonable time (< 1 min for typical build)

## Implementation Plan

1. ✅ Design document (this file)
2. Create `nodeOptimizer.ts` module
3. Implement core scoring algorithm
4. Add stat extractor functions for each goal
5. Create MCP tool wrapper
6. Add formatting functions
7. Integration testing
8. Documentation updates
9. User testing & refinement

---

**Status**: Design Complete ✅
**Next**: Implementation
