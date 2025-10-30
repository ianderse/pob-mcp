# Testing Defensive Analyzer

## Test Build
**File**: `3.27/Elementalist Wander 3.27 - Test.xml`

## Steps to Test

Since we can't directly run the MCP server from here, here's how to test manually:

### Option 1: Via Claude Desktop (Recommended)

1. **Ensure Claude Desktop is running** with the pob-mcp-server configured

2. **In Claude Desktop, run these commands**:
   ```
   Start the Lua bridge
   ```

3. **Load the build**:
   ```
   Load the build "3.27/Elementalist Wander 3.27 - Test.xml"
   ```

4. **Run the defensive analyzer**:
   ```
   Analyze my defenses
   ```

5. **Expected Output**:
   - Overall defensive score (excellent/good/fair/poor/critical)
   - Resistance analysis (capped/uncapped)
   - Life pool analysis
   - Mitigation analysis (armour/evasion/block)
   - Sustain analysis (regen/recharge)
   - Prioritized recommendations

### Option 2: Manual Test with Node

If you want to test the analyzer logic directly:

```bash
cd /Users/ianderse/Projects/pob-mcp-server

# Create a test script
cat > test-analyzer.js << 'EOF'
import { analyzeDefenses, formatDefensiveAnalysis } from './build/defensiveAnalyzer.js';

// Mock stats from a typical wander build
const mockStats = {
  Life: 3800,
  EnergyShield: 1200,
  Mana: 800,
  TotalDPS: 450000,
  FireResist: 75,
  ColdResist: 75,
  LightningResist: 62,  // Uncapped!
  ChaosResist: -15,
  Armour: 1200,
  Evasion: 15000,
  BlockChance: 0,
  SpellBlockChance: 0,
  LifeRegen: 200,
  ManaRegen: 120,
  ESRecharge: 400,
};

const analysis = analyzeDefenses(mockStats);
const formatted = formatDefensiveAnalysis(analysis);

console.log(formatted);
EOF

# Run it
node test-analyzer.js
```

## What to Look For

### Good Defense Detection
- ✅ Should recognize capped fire/cold resists
- ✅ Should recognize decent ES for a wander
- ✅ Should acknowledge good evasion

### Issue Detection
- ⚠️ Should flag uncapped lightning resist as CRITICAL
- ⚠️ Should flag low/negative chaos resist as HIGH
- ⚠️ Should note low life pool (3800 is adequate but could be better)
- ⚠️ Should note low armour

### Recommendations
- Should suggest capping lightning resist
- Should suggest improving chaos resist
- Should mention evasion is decent (15k = good)
- Should prioritize recommendations properly

## Expected Analysis Output

```
=== Defensive Analysis ===

Overall: ⚠️ FAIR

**Resistances:**
✓ Fire: 75%
✓ Cold: 75%
✗ Lightning: 62%
  Chaos: -15% (dangerous)

**Life Pool:**
Life: 3,800
Energy Shield: 1,200
Total: 5,000 (good)

**Physical Mitigation:**
Armour: 1,200 - minimal (~3-8% phys reduction)
Evasion: 15,000 - good (~35-45% evade chance)
Block: 0% - none
Overall: fair

**Sustain:**
Life Regen: 200.0/sec (5.3% of max) - excellent
ES Recharge: 400/sec - adequate
Overall: good

**Recommendations:**

1. 🚨 [CRITICAL] Uncapped resistances: Lightning (62%)
   → Need +13% total to cap all
   → Check gear for resistance upgrades
   → Consider passive tree nodes (Diamond Skin, prismatic nodes)
   → Use Purity auras if desperate
   Impact: Uncapped resists = taking significantly more elemental damage

2. ⚠️ [HIGH] Chaos Resistance: -15% (negative or very low)
   → Not critical but helpful against chaos damage
   → Allocate chaos resist nodes if convenient
   → Upgrade gear with chaos resist when possible
   → Amethyst flask can help in chaos damage zones
   Impact: Low priority unless facing chaos damage enemies
```

## Success Criteria

- [ ] Tool executes without errors
- [ ] Correctly identifies uncapped lightning resist
- [ ] Flags chaos resist as dangerous
- [ ] Recognizes evasion as decent mitigation
- [ ] Provides actionable recommendations
- [ ] Recommendations are prioritized correctly (critical first)

## Follow-Up Tests

Once basic test works, try:

1. **Glass Cannon Build** (high DPS, low defenses)
   - Should get many critical/high priority recommendations

2. **Tank Build** (juggernaut with high armour/life)
   - Should get excellent overall score
   - Few or no recommendations

3. **CI Build** (Chaos Inoculation - 1 life, all ES)
   - Should recognize ES as primary defense
   - Should not complain about low life (it's intentional)

4. **Edge Cases**
   - Build with no mitigation at all
   - Build with overcapped resistances
   - Build with very high life regen
