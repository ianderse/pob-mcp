# Tree Optimizer Guide

## Overview

The `optimize_tree` tool is a powerful passive tree optimizer that can both **add** and **remove** nodes to find the best overall allocation for your build goal.

## Basic Usage

```
optimize_tree(
  build_name: "MyBuild.xml",
  goal: "maximize_dps"
)
```

## Optimization Goals

### Offense
- **`maximize_dps`**: Maximum total damage per second
- Prioritizes: Damage, crit, attack/cast speed nodes

### Defense
- **`maximize_life`**: Maximum life pool
- **`maximize_es`**: Maximum energy shield
- **`maximize_ehp`**: Maximum effective HP (Life + ES combined)
- Prioritizes: Life%, ES%, hybrid life/ES nodes

### Balanced
- **`balanced`**: Balance offense and defense
- Uses geometric mean (punishes extremes)
- Good for all-around builds

- **`league_start`**: Prioritize survivability (60/40 split)
- Emphasizes defense over offense early game

## Constraints

### Defensive Minimums

Specify minimum thresholds to maintain:

```typescript
constraints: {
  minLife: 4000,              // Minimum life pool
  minES: 0,                   // Minimum energy shield
  minEHP: 4000,               // Minimum total EHP (Life + ES)
  minFireResist: 75,          // Fire resistance
  minColdResist: 75,          // Cold resistance
  minLightningResist: 75,     // Lightning resistance
  minChaosResist: 0           // Chaos resistance
}
```

### Protected Nodes

Prevent specific nodes from being removed:

```typescript
constraints: {
  protectedNodes: ["26725", "48768", "61834"]  // Node IDs to keep
}
```

Use this to protect:
- Critical keystones (Point Blank, Avatar of Fire, etc.)
- Ascendancy nodes
- Jewel sockets with valuable jewels
- Travel nodes you need for pathing

## Build Type Considerations

### Life-Based Builds

Use `minLife` to ensure adequate life pool:

```typescript
optimize_tree(
  build_name: "MyLifeBuild.xml",
  goal: "maximize_dps",
  constraints: {
    minLife: 4500,
    minFireResist: 75,
    minColdResist: 75,
    minLightningResist: 75
  }
)
```

### Energy Shield Builds

Use `minES` for CI/ES-based builds:

```typescript
optimize_tree(
  build_name: "MyESBuild.xml",
  goal: "maximize_dps",
  constraints: {
    minES: 6000,
    minFireResist: 75,
    minColdResist: 75,
    minLightningResist: 75
  }
)
```

### Low-Life Builds ⚠️

**IMPORTANT**: Low-life builds (Pain Attunement, Prism Guardian, etc.) run at ~35% life by design.

**Use `minEHP` instead of `minLife`**:

```typescript
// ❌ Wrong for low-life:
constraints: {
  minLife: 4000  // Impossible! Low-life is ~1500 life
}

// ✅ Correct for low-life:
constraints: {
  minEHP: 7000,   // Total EHP (1500 life + 5500 ES)
  minES: 5000     // Ensure adequate ES pool
}
```

The optimizer will **auto-detect low-life builds** and:
- Skip `minLife` constraints automatically
- Log a warning: `"⚠️ Low-life build detected! minLife constraint will be ignored"`
- Add result warning: `"Low-life build detected: minLife constraint was ignored. Use minEHP for low-life builds."`

### Hybrid Life/ES Builds

Use `minEHP` for combined pool:

```typescript
optimize_tree(
  build_name: "MyHybridBuild.xml",
  goal: "maximize_ehp",
  constraints: {
    minLife: 3000,  // Some life
    minES: 2000,    // Some ES
    minEHP: 5500    // Combined minimum
  }
)
```

## Advanced Options

### Point Budget

Control maximum passive points to use:

```typescript
optimize_tree(
  build_name: "MyBuild.xml",
  goal: "maximize_dps",
  max_points: 95  // Optimize up to 95 points (level 88)
)
```

**Default**: Current allocation + 5 points

**Use when**:
- Planning for a specific level
- Respeccing to a different point budget
- Comparing efficiency at different levels

### Max Iterations

Control how long optimization runs:

```typescript
optimize_tree(
  build_name: "MyBuild.xml",
  goal: "maximize_dps",
  max_iterations: 30  // More iterations = more thorough
)
```

**Default**: 20 iterations

**Guidelines**:
- 10-15: Quick optimization (~30-60 seconds)
- 20-25: Standard (default, ~60-90 seconds)
- 30+: Thorough (~90-150 seconds)

**Note**: Optimization stops early if no improvements found.

## Example Workflows

### 1. Max DPS with Safe Defenses

```typescript
optimize_tree(
  build_name: "Elementalist_Wander.xml",
  goal: "maximize_dps",
  max_points: 95,
  constraints: {
    minLife: 4000,
    minFireResist: 75,
    minColdResist: 75,
    minLightningResist: 75,
    protectedNodes: ["26725"]  // Keep Point Blank
  }
)
```

### 2. Respec to Tankier Tree

```typescript
optimize_tree(
  build_name: "GlassCannon.xml",
  goal: "maximize_ehp",
  max_points: 92,
  constraints: {
    minLife: 5000
  }
)
```

### 3. League Start Optimization

```typescript
optimize_tree(
  build_name: "LeagueStarter.xml",
  goal: "league_start",
  max_points: 70,
  constraints: {
    minLife: 3000,
    minFireResist: 75,
    minColdResist: 75,
    minLightningResist: 75
  }
)
```

### 4. Low-Life Build (Correct)

```typescript
optimize_tree(
  build_name: "LowLife_SpellCaster.xml",
  goal: "maximize_dps",
  constraints: {
    minEHP: 7000,   // Use EHP, not minLife!
    minES: 5500,    // Adequate ES
    minFireResist: 75,
    minColdResist: 75,
    minLightningResist: 75,
    protectedNodes: ["48768"]  // Pain Attunement
  }
)
```

### 5. Protect Jewel Sockets

```typescript
optimize_tree(
  build_name: "JewelStackBuild.xml",
  goal: "maximize_dps",
  constraints: {
    minLife: 4200,
    protectedNodes: [
      "26725",   // Jewel socket 1
      "36634",   // Jewel socket 2
      "61834",   // Jewel socket 3
      "2491"     // Jewel socket 4
    ]
  }
)
```

## Understanding Results

### Output Format

```
=== Tree Optimization Result ===

Goal: Maximize Total DPS
Build: Elementalist Wander.xml
Iterations: 12

**Starting Stats:**
- Target Value: 450000
- Life: 4200
- ES: 0
- DPS: 450000
- Points: 85

**Final Stats:**
- Target Value: 523000
- Life: 3950
- ES: 0
- DPS: 523000
- Points: 87

**Improvements:**
- Target: +73000 (+16.2%)
- Life: -250
- ES: +0
- DPS: +73000
- Points: +2

**Tree Changes:**
Removed 3 nodes: 12345, 67890, 23456
Added 5 nodes: 78901, 34567, 89012, 45678, 90123
```

### Applying Results

Use `lua_set_tree` to apply the optimized tree:

```typescript
lua_set_tree(
  classId: 3,
  ascendClassId: 1,
  nodes: [optimized node array]
)
```

**IMPORTANT**: Save your build before applying! You can't easily undo.

## Algorithm Details

### How It Works

Each iteration has two phases:

**Phase A: Add beneficial nodes**
1. Find nearby unallocated nodes (distance: 3)
2. Test top 30 candidates
3. Apply best addition if found

**Phase B: Remove inefficient nodes**
1. Find removable nodes (not required for pathing)
2. Test top 20 candidates
3. Accept removal if score stays within 1% (saves points!)

Stops when no improvements found or max iterations reached.

### Performance

- **Per iteration**: 2-5 seconds
- **Full optimization**: 30-120 seconds
- **Candidates tested**: Up to 50 per iteration (30 adds + 20 removes)

### Search Distance

Fixed at 3 nodes for performance. This means:
- ✅ Finds nearby optimizations efficiently
- ✅ Good for local improvements
- ❌ Won't find distant optimal branches

For long-range planning, use `suggest_optimal_nodes` with higher `max_distance`.

## Tips & Best Practices

### 1. Start Conservative
```typescript
// First run: Safe constraints
optimize_tree(
  build_name: "MyBuild.xml",
  goal: "maximize_dps",
  constraints: { minLife: 4500 }  // Higher than needed
)

// If good: Relax constraints
optimize_tree(
  build_name: "MyBuild.xml",
  goal: "maximize_dps",
  constraints: { minLife: 4000 }  // Lower
)
```

### 2. Protect Critical Nodes

Always protect:
- Build-defining keystones
- Ascendancy nodes (automatic)
- Jewel sockets with expensive jewels
- Unique pathing nodes

### 3. Multiple Runs

Run optimizer multiple times:
1. First run with one goal (e.g., DPS)
2. Apply results
3. Second run with different goal (e.g., EHP)
4. Compare and choose

### 4. Verify Before Applying

- Check removed nodes aren't critical
- Verify added nodes make sense
- Review stat changes carefully
- Save build before applying

### 5. Iteration Count

- Quick check: 10 iterations
- Normal use: 20 iterations (default)
- Thorough: 30+ iterations
- More isn't always better (diminishing returns)

## Troubleshooting

### "Tree is already optimal"

**Cause**: No improvements found within search distance.

**Solutions**:
- Increase `max_iterations`
- Relax constraints
- Use different goal
- Try `suggest_optimal_nodes` for longer-range planning

### "Reached maximum iterations"

**Cause**: Hit iteration limit before converging.

**Solutions**:
- Increase `max_iterations` (try 30-40)
- Current result is still valid (just not fully optimized)

### "Final tree does not meet all constraints"

**Cause**: Bug or impossible constraint combination.

**Solutions**:
- Review constraints (are they achievable?)
- Check for conflicts (minLife + minES + minDPS may be impossible)
- Report as bug if constraints seem reasonable

### Low-Life Warning

**Message**: `"Low-life build detected: minLife constraint was ignored"`

**Cause**: Build detected as low-life (life < 50% of max).

**Solution**: Use `minEHP` instead of `minLife`:
```typescript
constraints: {
  minEHP: 7000,  // Instead of minLife
  minES: 5500
}
```

## Limitations

1. **Local Optimum**: May not find global best
   - Greedy algorithm finds local improvements
   - Multiple runs may find different results

2. **Search Distance**: Fixed at 3 nodes
   - Won't find distant branches
   - Use `suggest_optimal_nodes` for long-range

3. **Sequential Testing**: One change at a time
   - Takes 30-120 seconds
   - Necessary for accurate stats

4. **Pathing Analysis**: Simplified
   - May be overly conservative
   - Prevents tree breakage

## Comparison with suggest_optimal_nodes

| Feature | optimize_tree | suggest_optimal_nodes |
|---------|--------------|----------------------|
| Add nodes | ✅ | ✅ |
| Remove nodes | ✅ | ❌ |
| Reallocate points | ✅ | ❌ |
| Full tree optimization | ✅ | ❌ |
| Search distance | Fixed (3) | Configurable |
| Constraints | Full system | Limited |
| Protected nodes | ✅ | ❌ |
| Runtime | 30-120s | 10-30s |
| Best for | Complete optimization | Quick suggestions |

## Future Enhancements

- [ ] Configurable search distance
- [ ] Multi-start optimization (escape local optima)
- [ ] Branch swapping (replace entire paths)
- [ ] Cluster jewel optimization
- [ ] Parallel candidate testing
- [ ] Better path analysis (full graph traversal)

## See Also

- `suggest_optimal_nodes` - Quick node recommendations
- `get_nearby_nodes` - Discover reachable nodes
- `allocate_nodes` - Test specific allocations
- `test_allocation` - What-if analysis
- `analyze_defenses` - Identify defensive weaknesses
