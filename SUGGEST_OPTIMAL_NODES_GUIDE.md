# Quick Start Guide: suggest_optimal_nodes

## What It Does

Intelligently analyzes your build and recommends the **best passive tree nodes** to allocate based on your goal. Uses actual PoB calculations to rank nodes by efficiency (stat gain per point spent).

## Basic Usage

```
suggest_optimal_nodes(
  build_name: "MyBuild.xml",
  goal: "maximize_life"
)
```

**Result:** Top 10 life nodes ranked by efficiency, with paths and stat projections.

## Supported Goals

### Offense
- `maximize_dps` - Total DPS
- `maximize_hit_dps` - Hit damage only
- `maximize_dot_dps` - DoT damage only
- `crit_chance` - Crit chance
- `crit_multi` - Crit multiplier
- `attack_speed` - Attack speed
- `cast_speed` - Cast speed

### Defense
- `maximize_life` - Life pool
- `maximize_es` - Energy shield
- `maximize_ehp` - Life + ES
- `resistances` - Lowest resistance
- `armour` - Armour rating
- `evasion` - Evasion rating
- `block` - Block chance
- `spell_block` - Spell block chance

### Utility
- `movement_speed` - Movement speed
- `mana_regen` - Mana regen
- `life_regen` - Life regen
- `attributes` - Total STR/DEX/INT

### Balanced
- `balanced` - Mix of offense/defense
- `league_start` - Leveling priorities (60% life, 40% DPS)

## Natural Language Support

You can also use natural language:
- "increase life" → `maximize_life`
- "more damage" → `maximize_dps`
- "get tankier" → `maximize_ehp`
- "crit multi" → `crit_multi`

## Advanced Parameters

```
suggest_optimal_nodes(
  build_name: "MyBuild.xml",
  goal: "maximize_dps",
  max_points: 15,        // Max points to spend (default: 10)
  max_distance: 7,       // Max search distance (default: 5)
  min_efficiency: 100,   // Min DPS/point (default: 0)
  include_keystones: true // Include keystones (default: true)
)
```

### When to Adjust Parameters

**Increase `max_points`:**
- You have many unallocated points
- Willing to invest heavily in one direction

**Increase `max_distance`:**
- Not finding good recommendations
- Want to explore further from current tree

**Increase `min_efficiency`:**
- Only want the very best nodes
- Filter out mediocre options

**Disable `include_keystones`:**
- Don't want major build-changing nodes
- Only want incremental improvements

## Example Workflows

### 1. Simple DPS Boost
```
User: "Suggest nodes to increase my DPS"

suggest_optimal_nodes(build_name="Deadeye.xml", goal="maximize_dps")

→ Returns: Top DPS nodes
→ Pick: #1 recommendation
→ Use: allocate_nodes(build_name="Deadeye.xml", node_ids=[...])
```

### 2. Defensive Improvements
```
User: "I'm too squishy, need more life"

suggest_optimal_nodes(build_name="GlassCannon.xml", goal="maximize_life", max_points=15)

→ Returns: Life nodes
→ Current: 3,200 life
→ Projected: 5,100 life (+59% with top 3)
```

### 3. Crit Build Optimization
```
User: "Where can I get more crit multi?"

suggest_optimal_nodes(build_name="CritBow.xml", goal="crit_multi", max_distance=7)

→ Searches further from tree
→ Returns: Crit multi nodes ranked by efficiency
→ Shows secondary benefits (DPS, accuracy, etc.)
```

### 4. League Start Character
```
User: "Best nodes for leveling a new Witch?"

suggest_optimal_nodes(build_name="Witch_L50.xml", goal="league_start")

→ Prioritizes survivability (60%) and damage (40%)
→ Suggests efficient leveling nodes
```

### 5. Resistance Fixing
```
User: "Need to cap my resistances"

suggest_optimal_nodes(build_name="MyBuild.xml", goal="resistances")

→ Targets lowest resistance
→ Shows resistance nodes ranked by efficiency
```

### 6. Balanced Growth
```
User: "Help me balance offense and defense"

suggest_optimal_nodes(build_name="MyBuild.xml", goal="balanced")

→ Scores nodes on combined DPS + Life benefit
→ Returns well-rounded recommendations
```

## Understanding the Output

### Top Recommendation Example
```
1. ⭐ Constitution [26725] (NOTABLE) - EFFICIENCY: +180 life/point
   Path: 4 nodes to allocate
   Stat Gain: +720 (+17.1% increase)
   Bonus: +30 STR
   → Use: allocate_nodes(build_name="Deadeye.xml", node_ids=["12345", "23456", "34567", "26725"])
```

**Breakdown:**
- `⭐` = Top pick (best efficiency)
- `Constitution` = Node name
- `[26725]` = Node ID
- `(NOTABLE)` = Node type (keystone/notable/small)
- `+180 life/point` = **Efficiency score** (key metric!)
- `Path: 4 nodes` = Total passive points needed
- `Stat Gain: +720` = Total life increase
- `+17.1% increase` = Percentage improvement
- `Bonus: +30 STR` = Secondary benefits
- `→ Use: allocate_nodes(...)` = Ready-to-run command

### Summary Section
```
**SUMMARY:**
Best Pick: Constitution (+180 life/point)
Top 3 picks would give +1,720 life for 12 points (143 life/point average)
Current: 4,200 → Projected: 5,920 (+41% increase)
```

**Shows:**
- Single best node
- Combined value of top 3
- Total point cost
- Projected new stat value

### Tip
```
**TIP:** Allocate the top pick first, then re-run this tool to find the next best options.
```

**Why?** After allocating nodes, the tree changes. Re-running finds the new best options based on updated tree.

## Iterative Optimization

**Best Practice:**
1. Run `suggest_optimal_nodes`
2. Pick top recommendation
3. Run `allocate_nodes` to test it
4. If good, keep it
5. Re-run `suggest_optimal_nodes` to find next best
6. Repeat until satisfied

This ensures each allocation is optimal given the current tree.

## Common Questions

### Q: How does it rank nodes?
**A:** By **efficiency** (stat gain per point spent). A node giving +720 life for 4 points (180/point) ranks higher than +100 life for 1 point (100/point).

### Q: Are these actual PoB calculations?
**A:** Yes! The tool loads your build into PoB's Lua engine, allocates each path, and measures real stat changes.

### Q: Why do some nodes show "Bonus" stats?
**A:** Secondary benefits. E.g., a life node might also give +30 STR, which improves melee damage if you scale with STR.

### Q: What if I get "No recommendations found"?
**A:** Try:
- Increasing `max_distance` (default is 5)
- Lowering `min_efficiency` (default is 0)
- Enabling keystones if disabled
- Choosing a different goal

### Q: Can I use this for keystones?
**A:** Yes! Keystones are included by default. Set `include_keystones: false` to exclude them.

### Q: How long does it take?
**A:** Typically 20-30 seconds for ~20 candidates. Each candidate requires pathfinding + Lua stat calculation (~1s each).

### Q: Does it consider travel nodes?
**A:** Yes. The "Path" includes all nodes needed (travel + target). Efficiency accounts for total point cost.

### Q: Can it suggest multiple nodes at once?
**A:** Currently suggests individual nodes. For combining multiple nodes, use the top 3 summary as guidance.

## Tips & Tricks

### 1. Start Broad, Then Narrow
```
# First pass: See all options
suggest_optimal_nodes(build="MyBuild.xml", goal="maximize_dps")

# Second pass: Only the best
suggest_optimal_nodes(build="MyBuild.xml", goal="maximize_dps", min_efficiency=200)
```

### 2. Compare Goals
```
# What gives more DPS?
suggest_optimal_nodes(build="MyBuild.xml", goal="crit_chance")
suggest_optimal_nodes(build="MyBuild.xml", goal="crit_multi")

# Compare top recommendations
```

### 3. Budget Planning
```
# I have 20 points total, plan in chunks
suggest_optimal_nodes(build="MyBuild.xml", goal="maximize_life", max_points=7)
# Allocate top 2-3
suggest_optimal_nodes(build="MyBuild.xml", goal="maximize_dps", max_points=7)
# Allocate top 2-3
# etc.
```

### 4. Distant Exploration
```
# See what's 8-10 nodes away
suggest_optimal_nodes(build="MyBuild.xml", goal="maximize_dps", max_distance=10)
# Might find very efficient clusters further out
```

### 5. League Start Optimization
```
# Level 30-50: Focus survivability
suggest_optimal_nodes(build="MyBuild.xml", goal="league_start")

# Level 50-70: Shift to damage
suggest_optimal_nodes(build="MyBuild.xml", goal="balanced")

# Level 70+: Pure damage
suggest_optimal_nodes(build="MyBuild.xml", goal="maximize_dps")
```

## Troubleshooting

### "Lua bridge required"
**Solution:** Enable `POB_LUA_ENABLED=true` in your config. This tool requires the Lua bridge for accurate stat calculations.

### "No candidate nodes found"
**Solutions:**
- Increase `max_distance` (try 7 or 10)
- Enable keystones if disabled
- Check if build has room to expand (not fully optimized)

### "No nodes met minimum efficiency threshold"
**Solutions:**
- Lower `min_efficiency` to 0
- Increase `max_distance` to find better options
- Consider a different goal

### Recommendations seem wrong
**Check:**
- Is the goal correct? ("maximize_dps" vs "maximize_hit_dps")
- Is the build loaded correctly? (verify with `lua_get_stats`)
- Are you comparing efficiency or absolute gain? (efficiency is key)

## Performance Notes

- **Fast:** 20-30 seconds for typical search
- **Scalable:** Adjusting `max_distance` increases search space exponentially
- **Memory:** Uses PoB Lua bridge (requires ~100MB RAM)
- **Optimal:** `max_distance=5`, `max_points=10` balances thoroughness vs speed

## Related Tools

**Discovery Workflow:**
1. `suggest_optimal_nodes` ← **AI recommendations (start here!)**
2. `get_nearby_nodes` ← Manual discovery
3. `find_path_to_node` ← Manual pathfinding
4. `allocate_nodes` ← Testing stat impact

**Analysis Workflow:**
1. `analyze_defenses` ← Identify weaknesses
2. `suggest_optimal_nodes(goal="maximize_life")` ← Fix low life
3. `suggest_optimal_nodes(goal="resistances")` ← Fix resists
4. `analyze_defenses` ← Verify improvements

---

**Ready to optimize your build?**

Start with: `suggest_optimal_nodes(build_name="YourBuild.xml", goal="maximize_dps")`
