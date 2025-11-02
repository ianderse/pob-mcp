# Phase 7: Build Validation Engine - Design Document

## Overview

Phase 7 implements a comprehensive build validation system that analyzes builds for common issues and provides prioritized, actionable recommendations. This complements the existing defensive analysis (Phase 6) by adding validation for resistances, mana, accuracy, and overall build health.

## Architecture

### Core Components

1. **ValidationService** (`src/services/validationService.ts`)
   - Already exists with basic structure
   - Extend with comprehensive validation rules
   - Severity classification (critical, warning, info)
   - Category-based validation (resistances, defenses, mana, accuracy, immunities)

2. **Validation Handler** (`src/handlers/validationHandlers.ts`)
   - `validate_build`: Main validation tool
   - Integrates with Lua bridge for accurate stats
   - Formatted output with severity indicators

### Design Principles

1. **Actionable Feedback**
   - Every issue includes specific suggestions
   - Prioritized by severity (critical > warning > info)
   - Clear thresholds and recommendations

2. **Context-Aware**
   - Different thresholds for different build types (life vs ES, attack vs spell)
   - Level-appropriate validation (league start vs endgame)
   - Ascendancy-specific considerations

3. **Non-Invasive**
   - Read-only analysis
   - No modifications to builds
   - Clear, concise output

## Validation Categories

### 1. Resistances (Critical Priority)

**Fire/Cold/Lightning Resistance:**
- **Critical**: Below 75% (standard cap)
- **Warning**: Below 100% (over-cap for maps with -max res)
- **Suggestions**:
  - List gear slots with low/no resists
  - Recommend passive nodes nearby
  - Suggest crafting opportunities

**Chaos Resistance:**
- **Warning**: Below 0% (taking extra chaos damage)
- **Info**: Below 75% (endgame recommendation)
- **Context**: Different importance for CI builds (immune to chaos)

### 2. Defenses (Critical Priority)

**Life Builds:**
- **Critical**: Below 3000 life at level 90+
- **Warning**: Below 4000 life at level 90+
- **Target**: 4500-5500 life for most builds
- **Suggestions**:
  - Count of unallocated life nodes nearby
  - Gear upgrade recommendations
  - Strength stacking opportunities

**Energy Shield Builds:**
- **Critical**: Below 4000 ES at level 90+
- **Warning**: Below 6000 ES at level 90+
- **Target**: 7000-10000 ES for CI builds
- **Detection**: CI keystone or 80%+ damage taken from ES

**Hybrid Builds:**
- **Combined EHP**: life + ES should meet thresholds
- **Warning**: Neither life nor ES is substantial (dangerous)

**Armor/Evasion:**
- **Info**: Below 10000 armor for armor builds
- **Info**: Below 15000 evasion for evasion builds
- **Context**: Only validate if build invests in armor/evasion nodes

### 3. Mana Management (High Priority)

**Unreserved Mana:**
- **Critical**: Below 50 unreserved mana (can't cast most skills)
- **Warning**: Below 100 unreserved mana (limited skill use)
- **Suggestions**:
  - Reduce aura reservation
  - Add Enlighten support
  - Consider -mana cost crafts

**Mana Reservation:**
- **Warning**: Over 100% reserved (impossible state)
- **Info**: 95-100% reserved (risky, no room for error)

**Mana Regeneration:**
- **Warning**: Below 50 mana/sec for caster builds
- **Context**: Only for builds with mana-costing main skill
- **Suggestions**:
  - Clarity aura
  - Mana regeneration nodes
  - Mana flask

### 4. Accuracy (Attack Builds Only)

**Hit Chance:**
- **Critical**: Below 85% chance to hit
- **Warning**: Below 90% chance to hit
- **Target**: 95-100% chance to hit
- **Detection**: Build uses attack skills (not spells)
- **Suggestions**:
  - Accuracy on gear
  - Precision aura
  - Accuracy passive nodes

### 5. Immunities (High Priority)

**Bleed Immunity:**
- **Warning**: No bleed immunity source found
- **Sources**: Flask suffix, ascendancy (Slayer, Champion), items
- **Suggestion**: "of Staunching" flask suffix

**Freeze Immunity:**
- **Warning**: No freeze immunity source found
- **Sources**: Flask suffix, ascendancy (Juggernaut), pantheon, items
- **Suggestion**: "of Heat" flask suffix or Brine King pantheon

**Ignite Immunity:**
- **Info**: No ignite immunity (less critical than freeze/bleed)
- **Sources**: Flask suffix, ascendancy, items

**Poison Immunity:**
- **Info**: No poison immunity (situational)
- **Sources**: Flask suffix, ascendancy, items

**Curse Immunity:**
- **Info**: No curse immunity (QoL improvement)
- **Sources**: Flask suffix "of Warding"

### 6. Overall Build Health

**Build Score (0-10):**
- **10**: All critical checks pass, most warnings resolved
- **7-9**: Critical checks pass, some warnings
- **4-6**: Some critical issues, multiple warnings
- **0-3**: Multiple critical issues

**Scoring Algorithm:**
```
Base score: 10
-3 points per critical issue
-1 point per warning
-0.25 points per info issue
Minimum: 0
```

## Implementation Details

### ValidationService Structure

```typescript
interface ValidationIssue {
  severity: 'critical' | 'warning' | 'info';
  category: 'resistances' | 'defenses' | 'mana' | 'accuracy' | 'immunities' | 'general';
  title: string;
  description: string;
  currentValue?: string | number;
  recommendedValue?: string | number;
  suggestions: string[];
  location?: string; // 'Gear', 'Passive Tree', 'Flasks', etc.
}

interface BuildValidation {
  isValid: boolean; // true if no critical issues
  overallScore: number; // 0-10
  criticalIssues: ValidationIssue[];
  warnings: ValidationIssue[];
  recommendations: ValidationIssue[]; // info-level
  summary: string;
}

class ValidationService {
  async validateBuild(
    build: PoBBuild,
    luaStats?: any
  ): Promise<BuildValidation>

  private validateResistances(stats: any): ValidationIssue[]
  private validateDefenses(stats: any, level: number): ValidationIssue[]
  private validateMana(stats: any): ValidationIssue[]
  private validateAccuracy(stats: any, build: PoBBuild): ValidationIssue[]
  private validateImmunities(build: PoBBuild): ValidationIssue[]
  private calculateScore(issues: ValidationIssue[]): number
  private generateSummary(validation: BuildValidation): string
}
```

### Stat Detection

**From Lua Bridge (Preferred):**
```typescript
const stats = await luaClient.sendRequest({ action: 'get_stats' });

// Available stats:
// - Life, EnergyShield, Armour, Evasion
// - FireResist, ColdResist, LightningResist, ChaosResist
// - Mana, ManaUnreserved, ManaRegen
// - HitChance (for attacks)
// - TotalDPS
```

**From XML (Fallback):**
```typescript
const stats = build.Build?.PlayerStat;
// Parse PlayerStat array for basic validation
// Less accurate but works without Lua bridge
```

### Build Type Detection

```typescript
interface BuildType {
  isLifeBased: boolean;
  isESBased: boolean;
  isLowLife: boolean; // <50% life reserved
  isChaosInoculation: boolean;
  isAttackBased: boolean;
  isSpellBased: boolean;
  mainDefense: 'armor' | 'evasion' | 'hybrid' | 'none';
}

function detectBuildType(build: PoBBuild, stats: any): BuildType {
  // Check for CI keystone
  const hasCIKeystone = build.Tree?.Spec?.nodes?.includes('CI_NODE_ID');

  // Check damage taken from ES vs Life
  const esPercent = stats.EnergyShield / (stats.Life + stats.EnergyShield);

  // Check main skill type
  const mainSkill = getMainSkill(build);
  const isAttack = mainSkill?.tags?.includes('attack');

  return {
    isLifeBased: !hasCIKeystone && esPercent < 0.5,
    isESBased: hasCIKeystone || esPercent > 0.8,
    isChaosInoculation: hasCIKeystone,
    isLowLife: stats.Life < (stats.Life + stats.LifeReserved) * 0.35,
    isAttackBased: isAttack,
    isSpellBased: !isAttack,
    mainDefense: detectMainDefense(build, stats),
  };
}
```

### Output Format

```
=== Build Validation Report ===

Overall Score: 7/10
Status: ⚠️  Build has some issues that should be addressed

🔴 CRITICAL ISSUES (2):

[Resistances] Fire Resistance Too Low
  Current: 45% | Target: 75%
  You are vulnerable to fire damage and will take significantly more damage.

  Suggestions:
  - Add fire resistance to Ring 1 (currently has none)
  - Add fire resistance to Belt (currently 12%)
  - Consider "Cloth and Chain" notable (3 points away)

⚠️  WARNINGS (3):

[Defenses] Low Life Pool
  Current: 3,450 | Recommended: 4,000+
  Your life pool is below recommended for level 90 content.

  Suggestions:
  - 5 unallocated life nodes within 3 points
  - Upgrade Body Armour for +life roll
  - Consider Thick Skin cluster (4 points)

[Immunities] No Bleed Immunity
  You are vulnerable to bleeding, which can be deadly.

  Suggestions:
  - Add "of Staunching" suffix to a utility flask
  - Consider Slayer ascendancy (if respeccing)

ℹ️  RECOMMENDATIONS (1):

[Mana] Low Mana Regeneration
  Current: 45 mana/s | Recommended: 100+ mana/s

  Suggestions:
  - Enable Clarity aura
  - Consider mana regeneration nodes near Witch

=== Summary ===
Fix critical resistance gaps and improve life pool for safer mapping.
Consider adding flask immunities for better quality of life.
```

## Tool Specification

### `validate_build`

**Purpose**: Comprehensive build validation with prioritized recommendations

**Parameters**:
- `build_name` (optional): Build to validate. If omitted and Lua bridge active, validates currently loaded build.

**Returns**:
- Overall build score (0-10)
- Critical issues (must fix)
- Warnings (should fix)
- Recommendations (nice to have)
- Summary and action items

**Behavior**:
- Prefers Lua bridge stats (more accurate)
- Falls back to XML parsing if Lua unavailable
- Context-aware validation based on build type
- Severity-based prioritization

**Integration with Existing Tools**:
- Complements `analyze_defenses` (which focuses on layer analysis)
- Uses same stats from Lua bridge
- Can suggest `suggest_optimal_nodes` for fixes

## Error Handling

1. **No Stats Available**:
   - Use XML-based validation (less accurate)
   - Warn user that Lua bridge would provide better results

2. **Incomplete Build**:
   - Skip validation categories that require missing data
   - Note in output what couldn't be validated

3. **Build Detection Failures**:
   - Use conservative thresholds
   - Provide info-level suggestions rather than critical

## Testing Strategy

1. **Unit Tests**:
   - Resistance validation logic
   - Defense threshold calculations
   - Score calculation
   - Build type detection

2. **Integration Tests**:
   - Various build archetypes (life, ES, hybrid, CI)
   - Different character levels
   - With/without Lua bridge

3. **Test Cases**:
   - Well-optimized build (score 9-10)
   - League starter build (score 6-7)
   - Broken build (score 0-3)
   - Edge cases (CI, low-life, max block)

## Future Enhancements

1. **Item-Specific Validation**:
   - Check for required uniques
   - Validate jewel placement
   - Cluster jewel combinations

2. **Skill Link Validation**:
   - More detailed than `optimize_skill_links`
   - Check for mandatory supports
   - Validate gem levels/quality

3. **Advanced Defense Validation**:
   - Block/spell block caps
   - Maximum resist values
   - Damage mitigation calculations

4. **Config Awareness**:
   - Validate based on active configuration
   - Boss vs mapping optimization
   - Conditional buffs validation
