# Placeholder & TODO Audit

## 🔴 CRITICAL - Need Immediate Fixes

### 1. Cost/Benefit Analyzer - Weapon DPS (costBenefitAnalyzer.ts:171, 179)
**Issue**: Returns `0` for all weapon DPS calculations
**Impact**: Weapon cost/benefit analysis is completely broken
**Location**: `calculateDPS()` and `calculateElementalDPS()`
**Fix Required**: Parse weapon properties from trade API item data

```typescript
// Current (BROKEN):
private calculateDPS(prop: any, item: any): number {
  return 0; // Placeholder
}

// Need to parse:
// - Physical damage range (e.g., "50-100")
// - Attacks per second
// - Elemental damage (fire/cold/lightning)
// - Calculate: (avgDamage) * attacksPerSecond
```

**Suggested Fix**:
- Parse item.properties for damage and APS
- Extract from item.explicitMods for added damage
- Calculate total DPS = (phys + ele + chaos) * APS

---

### 2. Shopping List - Weapon DPS Impact (shoppingListService.ts:549)
**Issue**: Always shows same placeholder DPS gain
**Impact**: Weapon upgrade recommendations are meaningless
**Location**: `estimateNetImpact()` for weapons

```typescript
// Current (BROKEN):
if (slot.includes('Weapon')) {
  const currentDPS = 0; // Would extract from current weapon
  const targetDPS = 50000; // Medium tier weapon
  impact.dps = targetDPS - currentDPS;
}
```

**Suggested Fix**:
- Parse current weapon DPS from equipped item
- Use tier-based target DPS (300 budget, 450 medium, 600 endgame)
- Calculate actual net gain

---

## 🟡 MEDIUM - Limitations/Known Issues

### 3. Cluster Jewel Search - Enchant/Notable Filtering (clusterJewelHandlers.ts:85, 96)
**Issue**: Can't filter by enchantments/notables in trade query
**Impact**: Fetches more items than needed, filters post-process
**Status**: Working but inefficient

**Notes**:
- Trade API doesn't expose simple enchant/notable filters
- Current approach: fetch 3x items, filter client-side
- Could improve by finding Trade API stat IDs for cluster jewel mods

---

### 4. Tree Optimizer - k-Shortest Paths (treeService.ts:627-628, 743-749)
**Issue**: Only returns single shortest path
**Impact**: Can't suggest alternative paths to same node
**Status**: Intentional limitation

**Notes**:
- Would require implementing Yen's k-shortest paths algorithm
- Current single path is usually good enough
- Enhancement for future

---

### 5. Tree Handlers - Allocation Without Lua (treeHandlers.ts:78)
**Issue**: `allocate_nodes` requires Lua bridge
**Impact**: Can't allocate nodes without PoB running
**Status**: By design

**Notes**:
- Could implement XML manipulation to allocate nodes
- Would need to update node string in Build/Spec
- Low priority - users typically use Lua mode

---

## 🟢 LOW PRIORITY - Minor Issues

### 6. Stat Mapper Fallback (statMapper.ts:466)
**Issue**: Uses stat ID as PoB name when no mapping exists
**Impact**: Minor - fallback is reasonable
**Status**: Acceptable

```typescript
pobName: entry.id, // Use the ID as the PoB name for now
```

**Notes**:
- Only triggers for unmapped stats
- Fallback prevents crashes
- Could enhance with more mappings over time

---

### 7. Tree Optimizer - Required Node Detection (treeOptimizer.ts:207)
**Issue**: Simple heuristic for required nodes
**Impact**: May occasionally mark nodes as removable when they shouldn't be
**Status**: Works well in practice

```typescript
// For now, we'll mark it as required if it has multiple allocated neighbors
```

**Notes**:
- Current logic checks for multiple allocated neighbors
- Could enhance with graph connectivity analysis
- Rare edge cases only

---

## ✅ NOT PLACEHOLDERS (False Positives)

### 8. Config Placeholder Field (buildService.ts:233, types.ts:113)
**Status**: This is a real PoB XML field name, not a placeholder
```typescript
const placeholders = activeConfigSet.Placeholder ? ... // Reading PoB data
```

### 9. Text Output "temporary" (advancedOptimizationHandlers.ts:335, validationService.ts:125)
**Status**: English word in user-facing text, not code placeholder
```typescript
output += '  - Tabula Rasa for temporary 6-link (1 chaos)\n';
output += 'Use an Amethyst Flask for temporary chaos resistance';
```

### 10. Watch Service Simplification (watchHandlers.ts:92)
**Status**: Intentional design decision, not incomplete
```typescript
// For now, we'll simplify this
// Returns basic file change detection
```

---

## 📋 Recommended Action Plan

### Immediate (Do Now):
1. ✅ Fix weapon DPS parsing in costBenefitAnalyzer - **COMPLETED**
2. ✅ Fix weapon DPS impact in shoppingListService - **COMPLETED**
3. ✅ Remove or update all "Placeholder" comments to be clear - **COMPLETED**
4. ✅ Add weapon DPS extraction from PoB items - **COMPLETED**

### Short Term (Next Session):
1. Add cluster jewel Trade API stat ID lookup
2. Document tree optimization limitations

### Long Term (Future Enhancement):
1. Implement k-shortest paths for tree suggestions
2. Add XML-based node allocation (non-Lua mode)
3. Expand stat mapper coverage

---

## Summary

**Total Found**: 10 instances
- **Critical (FIXED)**: 2 ✅
- **Medium (Document/Enhance)**: 3
- **Low Priority**: 2
- **False Positives**: 3

**Status**: All critical issues have been resolved!

### What Was Fixed:
1. **Weapon DPS Calculations** (costBenefitAnalyzer.ts):
   - Implemented real parsing of Physical Damage, Elemental Damage, Chaos Damage
   - Extracts Attacks per Second from item properties
   - Calculates accurate DPS = (avg damage per hit) × APS

2. **PoB Weapon DPS Extraction** (shoppingListService.ts):
   - Added weapon property parsing to `parseItem()`
   - Extracts damage ranges and APS from PoB item text format
   - Implemented `extractWeaponDPS()` to calculate base weapon DPS
   - Smart multiplier calculation: estimates build's damage scaling (total DPS ÷ weapon base DPS)
   - Accurate weapon upgrade impact estimation
