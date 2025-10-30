# Phase 6: Build Optimization (AI Features)

## Overview

Phase 6 adds intelligent build optimization capabilities to the PoB MCP Server. These "AI" features analyze builds and make data-driven recommendations for improvements.

## Goals

1. **Automated Tree Optimization**: Find optimal passive tree allocations
2. **Item Recommendations**: Suggest gear upgrades based on build goals
3. **Skill Link Optimization**: Recommend best support gem combinations
4. **Stat Analysis**: Identify weaknesses and suggest improvements
5. **Goal-Oriented Optimization**: Optimize for specific metrics (DPS, EHP, etc.)

## Philosophy

### Data-Driven, Not Magic
- Use PoB's actual calculation engine (via Lua bridge)
- Test real allocations and measure results
- No guessing - every recommendation is verified

### Iterative Improvement
- Start with current build state
- Make small, measurable changes
- Verify improvements with real stats
- Continue until goals met or diminishing returns

### User-Guided
- User specifies optimization goals
- User sets constraints (budget, level, etc.)
- System provides options, user decides

## Phase 6 Features

### Feature 1: Passive Tree Optimization

**Goal**: Find better passive tree allocations that improve target stats.

**Algorithm**: Greedy optimization with look-ahead

**Process**:
1. Load current build
2. Get baseline stats
3. For each unallocated node nearby:
   - Preview allocation (use `calc_with`)
   - Measure stat improvement
4. Allocate best node
5. Repeat until points exhausted or no improvement

**Constraints**:
- Maximum level (points available)
- Class/ascendancy (starting location)
- Must maintain path connections
- Can specify "protected" nodes (don't remove)

**Optimization Targets**:
- Maximum DPS
- Maximum EHP (Life + ES + mitigation)
- Balanced (DPS + EHP)
- Custom weighted formula

**Example**:
```
User: "Optimize my tree for maximum DPS with 90 points"
System:
1. Current: 450k DPS, 4.2k life (85 points allocated)
2. Testing 20 nearby nodes...
3. Best option: Node 26725 (Constitution) -> 455k DPS, 4.8k life
4. Allocating...
5. Testing next iteration...
6. Final: 480k DPS, 4.5k life (90 points)
Recommendations: +30k DPS (+6.7%), -0.3k life
```

### Feature 2: Node Replacement Analysis

**Goal**: Identify inefficient nodes and suggest better alternatives.

**Process**:
1. For each allocated node:
   - Remove it (preview)
   - Test alternative nearby nodes
   - Compare stat changes
2. If alternative is better, suggest swap
3. Present top 5 swap recommendations

**Example**:
```
User: "Find inefficient nodes in my tree"
System:
1. Analyzing 92 allocated nodes...
2. Found 5 potential improvements:
   - Replace node 1234 (+10 STR) with 5678 (+12% life): +180 life
   - Replace node 9012 (+8% damage) with 3456 (+10% damage): +2% DPS
   ...
```

### Feature 3: Item Upgrade Recommendations

**Goal**: Suggest stat priorities for item upgrades.

**Process**:
1. Analyze current items
2. Identify stat gaps (uncapped resists, low life, etc.)
3. For each item slot:
   - Simulate +X to target stat
   - Measure impact on build
4. Rank stat priorities

**Example**:
```
User: "What stats should I look for on a new amulet?"
System:
Analyzing amulet slot...
Priority stats:
1. +90 to maximum Life -> +90 life (+2.1% EHP)
2. +45% Critical Strike Multiplier -> +35k DPS (+7.8%)
3. +35% to Lightning Resistance -> caps resist (+0% EHP but important)
4. Adds 15-28 Physical Damage -> +12k DPS (+2.7%)
```

### Feature 4: Defensive Analysis

**Goal**: Identify defensive weaknesses and suggest fixes.

**Checks**:
- ✓ Resistances capped?
- ✓ Enough life/ES?
- ✓ Any mitigation? (armour/evasion/block)
- ✓ Life regen / ES recharge?
- ✓ Ailment immunity?

**Suggestions**:
- Uncapped resists → suggest resist nodes/items
- Low life → suggest life nodes (with DPS cost)
- No mitigation → suggest defensive mechanics
- No sustain → suggest regen/leech nodes

**Example**:
```
User: "Analyze my defenses"
System:
⚠️  Defensive Issues Found:
1. Lightning Resistance: 62% (needs +13% to cap)
   → Allocate Diamond Skin nodes (3, 24, 25)
   → Or find +13% lightning res on gear
2. Life: 3,800 (low for level 85)
   → Suggested nodes: Constitution wheel (+300 life)
   → Cost: -2% DPS (worth it!)
3. No physical mitigation
   → Consider: Grace aura, Determination, or armor on gear
```

### Feature 5: DPS Optimization

**Goal**: Maximize DPS while maintaining defensive thresholds.

**Algorithm**:
1. Set defensive minimums (e.g., 4k life, capped resists)
2. Test DPS-focused nodes
3. Allocate if defensive minimums maintained
4. Suggest items with offensive stats

**Example**:
```
User: "Maximize DPS but keep at least 4k life and capped resists"
System:
Current: 380k DPS, 4.2k life, resists capped
Testing optimizations...

Passive Tree Changes:
- Remove: 2 life nodes (-200 life)
- Add: 3 crit multi nodes (+25% multi)
Result: 445k DPS (+17%), 4.0k life (meets minimum)

Item Suggestions:
- Weapon: Prioritize +physical damage, crit chance
- Amulet: +crit multi, +damage
- Rings: +damage, +attack speed

Final: 445k DPS (+17%), 4.0k life, resists capped
```

### Feature 6: Budget Build Optimizer

**Goal**: Optimize for league start / budget scenarios.

**Constraints**:
- No unique items (or only cheap ones)
- Focus on easy-to-cap resists
- Emphasize life/ES (cheaper than damage on gear)
- Tree provides most of damage

**Example**:
```
User: "Optimize for league start budget"
System:
Budget-friendly optimization:

Passive Tree:
- Prioritize: Life nodes, damage nodes, resist nodes
- Avoid: Nodes that require specific unique items
- Result: 4.5k life, 250k DPS (all rares)

Gear Strategy:
1. Weapon: Craft with essences (easy +damage)
2. Body Armour: Prioritize life + resists (cheap)
3. Rings/Amulet: Life + resists (ignore DPS stats early)
4. Focus: Cap resists with gear, get DPS from tree

Estimated cost: < 10 chaos total
```

## Implementation Strategy

### Phase 6.1: Tree Optimizer (Core)

**New MCP Tool**: `optimize_tree`

**Parameters**:
- `target` (required): "dps", "ehp", "balanced"
- `max_points` (optional): Point budget (default: current level)
- `constraints` (optional): Defensive minimums
- `protected_nodes` (optional): Nodes to keep

**Implementation**:
```typescript
async optimizeTree(params: {
  target: 'dps' | 'ehp' | 'balanced';
  maxPoints?: number;
  constraints?: {
    minLife?: number;
    minResists?: number;
  };
  protectedNodes?: number[];
}): Promise<OptimizationResult>
```

**Algorithm**:
```typescript
function optimizeTree(currentTree, target, maxPoints) {
  let bestTree = currentTree;
  let bestScore = evaluateTree(currentTree, target);

  while (bestTree.nodes.length < maxPoints) {
    const candidates = getNearbyUnallocatedNodes(bestTree);
    let bestCandidate = null;
    let bestCandidateScore = bestScore;

    for (const node of candidates) {
      const testTree = { ...bestTree, nodes: [...bestTree.nodes, node] };
      const score = evaluateTree(testTree, target);

      if (score > bestCandidateScore && meetsConstraints(testTree)) {
        bestCandidate = node;
        bestCandidateScore = score;
      }
    }

    if (!bestCandidate) break; // No improvement found

    bestTree.nodes.push(bestCandidate);
    bestScore = bestCandidateScore;
  }

  return { tree: bestTree, score: bestScore };
}
```

### Phase 6.2: Defensive Analyzer

**New MCP Tool**: `analyze_defenses`

**Returns**:
- Resistance status (capped/uncapped)
- Life/ES levels (with recommendations)
- Mitigation assessment
- Vulnerability warnings

**Implementation**:
```typescript
async analyzeDefenses(): Promise<DefensiveAnalysis> {
  const stats = await this.luaClient.getStats();

  const analysis = {
    resists: analyzeResistances(stats),
    lifePool: analyzeLifePool(stats),
    mitigation: analyzeMitigation(stats),
    recommendations: []
  };

  // Generate recommendations based on findings
  if (analysis.resists.uncapped.length > 0) {
    analysis.recommendations.push({
      priority: 'high',
      issue: 'Uncapped resistances',
      solutions: suggestResistFixes(stats)
    });
  }

  return analysis;
}
```

### Phase 6.3: Item Stat Prioritizer

**New MCP Tool**: `prioritize_item_stats`

**Parameters**:
- `slot` (required): Item slot to analyze
- `goal` (optional): "dps", "defense", "balanced"

**Returns**:
- Ranked list of stats with impact values
- Specific roll ranges to look for
- Estimated value per stat

**Implementation**:
```typescript
async prioritizeItemStats(slot: string, goal: string): Promise<StatPriority[]> {
  const currentStats = await this.luaClient.getStats();
  const testStats = ['+life', '+crit_multi', '+damage', '+resist'];

  const priorities = [];

  for (const stat of testStats) {
    const impact = await testStatImpact(slot, stat, goal);
    priorities.push({ stat, impact });
  }

  return priorities.sort((a, b) => b.impact - a.impact);
}
```

## Scoring Functions

### DPS Score
```typescript
function calculateDPSScore(stats: any): number {
  return stats.TotalDPS || 0;
}
```

### EHP Score (Effective Hit Points)
```typescript
function calculateEHPScore(stats: any): number {
  const rawHP = (stats.Life || 0) + (stats.EnergyShield || 0);

  // Factor in mitigation
  const armourMitigation = Math.min(stats.Armour / 10000, 0.3); // ~30% max
  const evasionMitigation = Math.min(stats.Evasion / 20000, 0.25); // ~25% max
  const blockMitigation = (stats.BlockChance || 0) / 200; // 75% block = 37.5% mitigation

  const totalMitigation = 1 - (1 - armourMitigation) * (1 - evasionMitigation) * (1 - blockMitigation);

  return rawHP / (1 - totalMitigation);
}
```

### Balanced Score
```typescript
function calculateBalancedScore(stats: any): number {
  const dps = calculateDPSScore(stats);
  const ehp = calculateEHPScore(stats);

  // Geometric mean (punishes extremes)
  return Math.sqrt(dps * ehp / 1000); // Normalize
}
```

## User Interface

### Tool Outputs

**optimize_tree**:
```
=== Tree Optimization ===

Target: Maximum DPS
Budget: 95 points
Constraints: Min 4k life, capped resists

Starting Stats:
- DPS: 380,000
- Life: 4,200
- Resists: 75/75/75/20

Optimization Progress:
[1/10] Testing 25 candidates... Best: +15k DPS
[2/10] Testing 24 candidates... Best: +12k DPS
...
[10/10] No further improvements found

Final Stats:
- DPS: 465,000 (+85k, +22.4%)
- Life: 4,050 (-150, -3.6%)
- Resists: 75/75/75/20

Nodes Added: [12345, 67890, 23456, 78901, 34567]
Nodes Removed: [11111, 22222]

To apply: Use 'lua_set_tree' with the optimized node list
```

**analyze_defenses**:
```
=== Defensive Analysis ===

✓ Fire Resistance: 75% (capped)
✓ Cold Resistance: 75% (capped)
✓ Lightning Resistance: 75% (capped)
⚠️  Chaos Resistance: 8% (very low)

✓ Life: 5,200 (good for level 88)
✓ Life Regen: 450/sec (8.7% of max)

⚠️  No Physical Mitigation:
  - Armour: 1,200 (~3% mitigation vs big hits)
  - Evasion: 800 (negligible)
  - Block: 0%

Recommendations:
1. [HIGH] Add chaos resistance
   → Allocate node 43688 (+15% chaos res)
   → Or upgrade ring/amulet
2. [MEDIUM] Add physical mitigation
   → Consider: Determination aura (+armour)
   → Or: Grace aura (+evasion)
```

## Success Criteria

- [ ] Tree optimization algorithm implemented
- [ ] Can optimize for DPS, EHP, or balanced
- [ ] Defensive analysis tool working
- [ ] Item stat prioritizer functional
- [ ] All optimizations verified with real stats (via Lua bridge)
- [ ] Documentation complete
- [ ] Example workflows tested

## Future Enhancements (Phase 7+)

- **Machine Learning**: Train on successful builds to suggest optimal paths
- **Build Templates**: Library of proven tree structures
- **Trade Site Integration**: Find actual items matching priorities
- **Gem Link Optimizer**: Test support gem combinations
- **Flask Setup Optimizer**: Suggest flask combinations
- **Anoint Optimizer**: Best notable passives to anoint
- **Cluster Jewel Optimizer**: Suggest cluster jewel setups
- **Currency Investment Advisor**: "Spend 50c to get biggest upgrade"

## Technical Considerations

### Performance
- Each optimization iteration requires PoB calculation (~50-100ms)
- Testing 20 nodes = ~2 seconds
- Full optimization might take 10-30 seconds
- Show progress to user

### Accuracy
- All recommendations based on real PoB calculations
- No estimates or formulas - actual verified stats
- User can preview before applying

### Constraints
- Respect user-specified limits
- Never break tree pathing
- Maintain defensive minimums
- Consider level/point budget

## Dependencies

- Phase 3 (Lua Bridge) - REQUIRED
- Phase 4 (Item/Skill Management) - REQUIRED
- Access to PoB fork with `calc_with` API

## Timeline Estimate

- **Phase 6.1** (Tree Optimizer): 8-12 hours
- **Phase 6.2** (Defensive Analyzer): 4-6 hours
- **Phase 6.3** (Item Prioritizer): 4-6 hours
- **Testing & Polish**: 4-6 hours
- **Total**: 20-30 hours

## Notes

- Start with tree optimizer (most impact)
- Defensive analyzer is quickest win
- Item prioritizer requires understanding of mod pools (complex)
- All features should provide actionable recommendations
- User always has final say on changes
