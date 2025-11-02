# Phase 11: Skill Gem Recommendations - Design Document

## Overview

Phase 11 provides intelligent skill gem analysis and recommendations, helping users optimize their support gem combinations, validate gem setups, and discover better alternatives based on their build archetype.

## Architecture

### Core Components

1. **SkillGemService** (`src/services/skillGemService.ts`)
   - Gem database with tags, mechanics, and archetypes
   - Support gem ranking algorithms
   - Link analysis and validation
   - Damage calculation integration

2. **Skill Gem Handlers** (`src/handlers/skillGemHandlers.ts`)
   - `analyze_skill_links`: Evaluate current gem setup
   - `suggest_support_gems`: Recommend better supports
   - `compare_gem_setups`: Test different gem combinations
   - `validate_gem_quality`: Check for quality/level/awakened improvements
   - `find_optimal_links`: Auto-generate best 6-link

3. **Gem Database**
   - Support gem metadata (tags, multipliers, mechanics)
   - Synergy rules (e.g., "Elemental Focus disables ignite")
   - Archetype templates (attack, spell, DoT, minion, etc.)

### Design Principles

1. **Build-Aware Recommendations**
   - Detect build archetype from active skill
   - Consider existing gear and tree modifiers
   - Prioritize realistic upgrades (availability, cost)

2. **Data-Driven Analysis**
   - Use Lua bridge for accurate damage calculations
   - Compare actual DPS, not theoretical multipliers
   - Account for conditional effects

3. **Actionable Feedback**
   - Specific gem swap suggestions
   - Explain *why* a gem is better
   - Show DPS impact of changes

## Tool Specifications

### 1. `analyze_skill_links`

**Purpose**: Evaluate current skill gem setup and identify issues

**Parameters**:
- `build_name` (optional): Build to analyze (uses loaded build if omitted)
- `skill_index` (optional): Which skill to analyze (default: main skill)

**Returns**:
- Active skill name and tags
- Support gems with effectiveness ratings
- Link quality (number of links used/available)
- Detected issues (incompatible supports, wasted links)
- Build archetype classification

**Example Output**:
```
=== Skill Analysis: Lightning Arrow ===

Active Skill: Lightning Arrow (Level 21/20)
Tags: Attack, Projectile, AoE, Lightning, Bow
Archetype: Physical Bow Attack → Lightning Conversion

=== Support Gems (6-Link) ===
1. ✓ Awakened Elemental Damage with Attacks (5/5) - Excellent
2. ✓ Inspiration Support (4/0) - Good (consider quality)
3. ⚠ Added Lightning Damage (1/0) - Suboptimal
   → Recommendation: Replace with Awakened Added Lightning Damage
4. ✓ Mirage Archer Support (20/20) - Excellent
5. ⚠ Faster Attacks Support (20/20) - Weak
   → Recommendation: Replace with Awakened Lightning Penetration
6. ✓ Elemental Focus Support (20/20) - Good

=== Issues Detected ===
⚠ Using normal Added Lightning Damage instead of Awakened variant
⚠ Faster Attacks provides minimal DPS increase for this build
💡 Missing critical support: Lightning Penetration

=== Archetype Match: 85% ===
Strong alignment with "Elemental Bow Attack" archetype
```

**Use Cases**:
- "Are my support gems optimal?"
- "Why is my DPS low?"
- "Check my 6-link setup"

---

### 2. `suggest_support_gems`

**Purpose**: Recommend better support gem alternatives

**Parameters**:
- `build_name` (optional): Build to analyze
- `skill_index` (optional): Which skill to optimize
- `count` (optional): Number of suggestions (default: 5)
- `include_awakened` (optional): Include awakened gems (default: true)
- `budget` (optional): "league_start", "mid_league", "endgame" (affects rarity)

**Returns**:
- Ranked list of support gem recommendations
- DPS increase estimate for each
- Synergy explanation
- Cost/availability estimate

**Example Output**:
```
=== Support Gem Recommendations for Lightning Arrow ===

Current DPS: 2,450,000

Top 5 Recommendations:

1. Awakened Lightning Penetration Support (20/20)
   Replaces: Faster Attacks Support
   New DPS: 3,100,000 (+26.5%)
   Why: Enemy has 40% lightning resist. Penetration is highly effective.
   Cost: ~50 Divine Orbs (endgame)

2. Awakened Added Lightning Damage Support (5/0)
   Replaces: Added Lightning Damage Support
   New DPS: 2,680,000 (+9.4%)
   Why: Higher flat damage and additional multiplier at level 5
   Cost: ~15 Divine Orbs (endgame)

3. Hypothermia Support (20/20)
   Replaces: Faster Attacks Support
   New DPS: 2,750,000 (+12.2%)
   Requires: Enemies are chilled (not currently active)
   Why: Strong more multiplier if you can chill enemies
   Cost: ~5 Chaos Orbs (common)

4. Inspiration Support (21/20)
   Upgrade: Quality to 20%
   New DPS: 2,520,000 (+2.9%)
   Why: Quality provides reduced mana cost
   Cost: ~10 Chaos Orbs (Gemcutter's Prism)

5. Trinity Support (20/20)
   Replaces: Elemental Focus Support
   New DPS: 2,850,000 (+16.3%)
   Requires: Gain resonance from all 3 elements
   Why: Provides penetration and elemental damage
   Cost: ~2 Chaos Orbs (common)
   ⚠ Conflicts: Elemental Focus prevents ailments (blocks resonance)

💡 Best Bang-for-Buck: Trinity Support (+16.3% for 2 chaos)
💡 Endgame Priority: Awakened Lightning Penetration (+26.5%)
```

**Use Cases**:
- "What support gems should I use?"
- "How can I increase my DPS?"
- "Best budget gem upgrades?"

---

### 3. `compare_gem_setups`

**Purpose**: Compare multiple gem configurations side-by-side

**Parameters**:
- `build_name` (optional): Build to test
- `skill_index` (optional): Which skill
- `setups` (required): Array of gem setup configurations
  - Each setup: `{name: string, gems: string[]}`

**Returns**:
- Side-by-side comparison table
- DPS for each setup
- Pros/cons of each
- Best setup recommendation

**Example Output**:
```
=== Gem Setup Comparison for Lightning Arrow ===

Setup A: "Current Build"
Gems: [EDWA, Inspiration, Added Lightning, Mirage Archer, Faster Attacks, Elemental Focus]
DPS: 2,450,000
Pros: Solid all-around damage
Cons: Missing penetration, using non-awakened gems

Setup B: "Penetration Focus"
Gems: [Awakened EDWA, Inspiration, Awakened Added Lightning, Mirage Archer, Awakened Lightning Pen, Elemental Focus]
DPS: 3,280,000 (+33.9%)
Pros: High damage against resistant enemies, awakened gem synergy
Cons: Very expensive (~80 Divine Orbs total)

Setup C: "Budget Trinity"
Gems: [EDWA, Inspiration, Added Cold Damage, Mirage Archer, Trinity, Added Fire Damage]
DPS: 2,920,000 (+19.2%)
Pros: Cheap (~10 chaos total), good DPS increase
Cons: Requires balancing 3 elements, more complex to gear

=== Recommendation ===
🏆 Best Overall: Setup B (+33.9% DPS)
💰 Best Budget: Setup C (+19.2% for 10 chaos)
⚠ Setup C requires careful gearing to maintain Trinity resonance
```

**Use Cases**:
- "Which 6-link is better?"
- "Test awakened gems vs budget setup"
- "Compare different build variants"

---

### 4. `validate_gem_quality`

**Purpose**: Check for gem level and quality improvements

**Parameters**:
- `build_name` (optional): Build to validate
- `include_corrupted` (optional): Suggest 21/23 corrupted gems (default: true)

**Returns**:
- List of gems with upgrade potential
- Missing quality gems
- Awakened gem opportunities
- Corruption targets

**Example Output**:
```
=== Gem Quality Validation ===

⚠ 3 gems need quality improvement:
1. Lightning Arrow: 21/0 → 21/20 (+20% area of effect)
   Priority: High (main skill)

2. Inspiration Support: 4/0 → 20/20 (+20% reduced mana cost)
   Priority: Medium

3. Added Lightning Damage: 1/0 → 20/20 (+10% lightning damage)
   Priority: Low (recommend replacing with Awakened version)

✓ 3 gems are already 20/20

💎 Corruption Opportunities:
- Lightning Arrow (21/20) → 21/23 corrupt (+3% area of effect)
  Risk: Could brick to 20/20, value ~2 Divine Orbs

⭐ Awakened Gem Upgrades Available:
1. Elemental Damage with Attacks → Awakened EDWA
   DPS Gain: ~8% at level 5

2. Added Lightning Damage → Awakened Added Lightning
   DPS Gain: ~9% at level 5

3. Lightning Penetration → Awakened Lightning Penetration
   DPS Gain: ~12% at level 5 (if added to build)

💡 Priority: Quality your Lightning Arrow first (highest impact)
```

**Use Cases**:
- "Should I quality my gems?"
- "Which gems need corruption?"
- "Are awakened gems worth it?"

---

### 5. `find_optimal_links`

**Purpose**: Auto-generate the best support gem combination

**Parameters**:
- `build_name` (optional): Build to optimize
- `skill_index` (optional): Which skill
- `link_count` (required): Number of links (4, 5, or 6)
- `budget` (optional): "league_start", "mid_league", "endgame"
- `optimize_for` (optional): "dps", "clear_speed", "bossing", "defense"

**Returns**:
- Optimal gem combination
- Step-by-step upgrade path
- DPS comparison vs current setup
- Total cost estimate

**Example Output**:
```
=== Optimal 6-Link for Lightning Arrow ===

Optimization Target: DPS (Bossing)
Budget: Endgame

🏆 Optimal Setup:
1. Lightning Arrow (21/20)
2. Awakened Elemental Damage with Attacks Support (5/20)
3. Awakened Added Lightning Damage Support (5/20)
4. Awakened Lightning Penetration Support (5/20)
5. Inspiration Support (21/20)
6. Elemental Focus Support (21/20)

Projected DPS: 3,450,000
Current DPS: 2,450,000
Increase: +40.8%

=== Upgrade Path ===

Step 1: Add Awakened Lightning Penetration (remove Faster Attacks)
Cost: ~50 Divine Orbs
DPS: 2,450,000 → 3,100,000 (+26.5%)

Step 2: Replace Added Lightning with Awakened version
Cost: ~15 Divine Orbs
DPS: 3,100,000 → 3,280,000 (+5.8%)

Step 3: Upgrade EDWA to Awakened EDWA level 5
Cost: ~30 Divine Orbs
DPS: 3,280,000 → 3,450,000 (+5.2%)

Step 4: Quality gems to 21/20 (if not already)
Cost: ~5 Divine Orbs
DPS: Marginal increase

Total Cost: ~100 Divine Orbs
Total Gain: +40.8% DPS

💡 If budget is limited, do Step 1 first (best value: +26.5% for 50 Divine)
```

**Use Cases**:
- "What's my best 6-link?"
- "Optimize my main skill"
- "Show me upgrade path"

---

## Implementation Details

### Gem Database Structure

```typescript
interface GemData {
  name: string;
  type: "active" | "support";
  tags: string[]; // "Attack", "Projectile", "Lightning", etc.
  level_scaling?: {
    damage_multiplier?: number;
    added_damage?: {min: number, max: number};
    // ... other scaling
  };
  quality_bonus?: string; // "1% increased Lightning Damage per 1% Quality"
  awakened?: {
    base_gem: string;
    max_level: number;
    bonus_at_5: string;
  };
  synergies?: string[]; // Tags this gem synergizes with
  anti_synergies?: string[]; // Conflicts (e.g., "Elemental Focus" + "Ignite")
}

interface ArchetypeTemplate {
  name: string;
  description: string;
  required_tags: string[];
  recommended_supports: {
    gem: string;
    priority: number;
    reasoning: string;
  }[];
  avoid_supports: string[];
}
```

### Support Gem Ranking Algorithm

```typescript
function rankSupportGem(
  gem: GemData,
  activeSkill: GemData,
  buildStats: any,
  currentSupports: GemData[]
): number {
  let score = 0;

  // Tag synergy (highest priority)
  const matchingTags = gem.synergies?.filter(tag =>
    activeSkill.tags.includes(tag)
  ).length || 0;
  score += matchingTags * 20;

  // Anti-synergies (penalties)
  const conflicts = gem.anti_synergies?.filter(anti =>
    currentSupports.some(s => s.tags.includes(anti))
  ).length || 0;
  score -= conflicts * 50;

  // DPS multiplier (if calculable)
  const dpsIncrease = calculateDPSImpact(gem, buildStats);
  score += dpsIncrease * 10;

  // Availability/cost (budget consideration)
  const costPenalty = gem.awakened ? 10 : 0;
  score -= costPenalty;

  return score;
}
```

### DPS Calculation Integration

```typescript
async function calculateGemSetupDPS(
  luaClient: any,
  buildName: string,
  skillIndex: number,
  gems: string[]
): Promise<number> {
  // This would require new Lua bridge action: "test_gem_setup"
  // For Phase 11, we'll estimate based on multipliers

  // Future enhancement: Lua bridge integration
  const response = await luaClient.sendRequest({
    action: "test_gem_setup",
    build_name: buildName,
    skill_index: skillIndex,
    gems: gems,
  });

  return response.TotalDPS;
}
```

### Archetype Detection

```typescript
function detectArchetype(
  activeSkill: GemData,
  buildStats: any
): ArchetypeTemplate {
  const tags = activeSkill.tags;

  // Attack vs Spell
  if (tags.includes("Attack")) {
    // Physical, Elemental, or Conversion?
    if (buildStats.PhysicalDamagePercent > 60) {
      return ARCHETYPE_PHYSICAL_ATTACK;
    } else if (buildStats.ElementalDamagePercent > 60) {
      return ARCHETYPE_ELEMENTAL_ATTACK;
    }
  } else if (tags.includes("Spell")) {
    // DoT, Hit, or Crit?
    if (tags.includes("Duration") && buildStats.DamageOverTime > 0) {
      return ARCHETYPE_DOT_SPELL;
    } else if (buildStats.CritChance > 50) {
      return ARCHETYPE_CRIT_SPELL;
    }
  }

  // Minion
  if (tags.includes("Minion")) {
    return ARCHETYPE_MINION;
  }

  return ARCHETYPE_GENERIC;
}
```

### Gem Database (Partial)

```typescript
const SUPPORT_GEM_DATABASE: GemData[] = [
  {
    name: "Elemental Damage with Attacks Support",
    type: "support",
    tags: ["Attack", "Support"],
    synergies: ["Attack", "Elemental"],
    anti_synergies: ["Spell"],
    awakened: {
      base_gem: "Elemental Damage with Attacks Support",
      max_level: 5,
      bonus_at_5: "+1% to all Elemental Resistances per 1% Quality"
    }
  },
  {
    name: "Elemental Focus Support",
    type: "support",
    tags: ["Support"],
    synergies: ["Elemental", "Fire", "Cold", "Lightning"],
    anti_synergies: ["Ignite", "Freeze", "Shock", "Ailment"],
  },
  {
    name: "Lightning Penetration Support",
    type: "support",
    tags: ["Lightning", "Support"],
    synergies: ["Lightning"],
    awakened: {
      base_gem: "Lightning Penetration Support",
      max_level: 5,
      bonus_at_5: "Penetrate 6% Lightning Resistance"
    }
  },
  {
    name: "Trinity Support",
    type: "support",
    tags: ["Support"],
    synergies: ["Fire", "Cold", "Lightning", "Elemental"],
    anti_synergies: ["Elemental Focus", "Avatar of Fire"],
  },
  // ... hundreds more
];

const ARCHETYPES: ArchetypeTemplate[] = [
  {
    name: "Elemental Bow Attack",
    description: "Bow attack with elemental conversion",
    required_tags: ["Attack", "Bow"],
    recommended_supports: [
      {
        gem: "Elemental Damage with Attacks Support",
        priority: 1,
        reasoning: "Core multiplier for elemental attacks"
      },
      {
        gem: "Lightning Penetration Support", // or fire/cold
        priority: 2,
        reasoning: "Penetration is crucial against resistant enemies"
      },
      {
        gem: "Inspiration Support",
        priority: 3,
        reasoning: "More damage and reduced mana cost"
      },
      {
        gem: "Mirage Archer Support",
        priority: 4,
        reasoning: "Additional damage uptime"
      },
    ],
    avoid_supports: [
      "Melee Physical Damage Support",
      "Brutality Support",
      "Spell Echo Support"
    ]
  },
  // ... more archetypes
];
```

## Error Handling

1. **Skill Not Found**:
   ```
   Error: Could not find active skill at index 0.
   Use lua_get_stats or analyze_build to see available skills.
   ```

2. **Incompatible Gem**:
   ```
   Error: Trinity Support is incompatible with Elemental Focus Support.
   Elemental Focus prevents ailments, which Trinity requires for resonance.
   ```

3. **Lua Bridge Required**:
   ```
   Error: Accurate DPS calculations require Lua bridge.
   Use lua_start and lua_load_build first for best results.
   ```

4. **Invalid Gem Name**:
   ```
   Error: Unknown gem 'Lightning Penatration'.
   Did you mean 'Lightning Penetration Support'?
   ```

## Testing Strategy

1. **Unit Tests**:
   - Archetype detection logic
   - Gem ranking algorithm
   - Synergy/anti-synergy validation

2. **Integration Tests**:
   - Analyze real build skill links
   - Compare DPS with different gem setups
   - Validate awakened gem recommendations

3. **Manual Testing**:
   - Test with attack, spell, DoT, and minion builds
   - Verify budget vs endgame recommendations
   - Check edge cases (very niche builds)

## Future Enhancements

1. **Machine Learning Recommendations**:
   - Train on poe.ninja builds
   - Learn meta support gem combinations
   - Predict effectiveness for unique builds

2. **Gem Color Optimization**:
   - Account for socket color constraints
   - Suggest off-color solutions
   - Chromatic orb probability calculator

3. **Vaal Gem Integration**:
   - Analyze Vaal skill effectiveness
   - Recommend Vaal vs normal variants

4. **Cluster Jewel Support Gems**:
   - Support for unique cluster jewel support gems
   - Build-specific jewel recommendations

## Integration with Existing Tools

### Workflow Examples

**Scenario 1: Optimize Main Skill**
```
User: "Optimize my Lightning Arrow setup"
→ analyze_skill_links()
→ suggest_support_gems(count=5, budget="endgame")
→ User selects Awakened Lightning Penetration
→ compare_gem_setups({
    setups: [
      {name: "Current", gems: [...]},
      {name: "With Awakened Pen", gems: [...]}
    ]
  })
```

**Scenario 2: Budget League Start**
```
User: "Best 4-link for league start Lightning Arrow?"
→ find_optimal_links(link_count=4, budget="league_start")
Returns: Budget-friendly common gems
```

**Scenario 3: Validate All Gems**
```
User: "Check my gem quality"
→ validate_gem_quality(include_corrupted=true)
Shows: Missing quality, corruption targets, awakened upgrades
```

## Lua Bridge Extensions (Future)

To enable accurate DPS calculations, we'd need new Lua bridge actions:

```lua
-- Test a gem setup without modifying build
{
  action = "test_gem_setup",
  skill_index = 0,
  gems = {"Lightning Arrow", "EDWA Support", ...}
}

-- Returns: {TotalDPS = 3100000, ...}
```

For Phase 11 MVP, we'll estimate DPS impact using multipliers and avoid Lua bridge dependency. Phase 12 can add Lua integration.
