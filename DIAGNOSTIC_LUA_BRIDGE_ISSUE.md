# Lua Bridge Diagnostic: Empty Stats Issue

## Problem

When running `analyze_defenses`, the tool returns empty/default stats instead of actual build stats:

```
Life: 60 (should be ~4,500+)
All Resistances: -60% (should be 75%)
Armour: 0
Evasion: 16
```

These are clearly default/uninitialized character stats, not from a loaded build.

## Possible Causes

### 1. Build Not Loaded
**Symptom**: `lua_load_build` succeeded but build isn't actually in memory

**Test**: After loading build, call `lua_get_tree` to see if tree data is present

**Fix**: Verify `load_build_xml` actually parses and loads the build in PoB

### 2. Stats Not Calculated
**Symptom**: Build loaded but `BuildOutput()` not called

**Check**: In `BuildOps.lua`, `get_stats()` should call `M.get_main_output()` which calls `build.calcsTab:BuildOutput()`

**Current Code** (from earlier read):
```lua
function M.get_main_output()
  if not build or not build.calcsTab then
    return nil, "build not initialized"
  end
  if build.calcsTab.BuildOutput then
    build.calcsTab:BuildOutput()  -- This should recalculate
  end
  local output = build.calcsTab and build.calcsTab.mainOutput or nil
  if not output then
    return nil, "no output available"
  end
  return output
end
```

### 3. Wrong Stats Being Read
**Symptom**: Reading from wrong build state or default character

**Check**: Verify `build.calcsTab.mainOutput` exists and has calculated values

### 4. PoB Fork API Branch Mismatch
**Symptom**: Our code expects certain API responses that don't match actual fork

**Check**: Confirm pob-api-fork is on `api-stdio` branch and has all required functions

## Diagnostic Steps

### Step 1: Verify Build Loading

Add logging to see if build actually loads:

```typescript
// In lua_load_build handler
const result = await this.luaClient.loadBuildXml(buildXml, name);
console.error('[DEBUG] Load result:', result);

// Immediately after loading, get build info
const buildInfo = await this.luaClient.getBuildInfo();
console.error('[DEBUG] Build info:', buildInfo);
```

**Expected**: Build info should show character name, level, class

### Step 2: Verify Calc Output Exists

Add to `get_stats`:

```lua
function M.export_stats(fields)
  local output, err = M.get_main_output()
  if not output then
    return nil, err
  end

  -- DEBUG: Log what output contains
  print("DEBUG: output exists, keys:", next(output) and "yes" or "no")
  if output.Life then
    print("DEBUG: Life =", output.Life)
  end

  -- ... rest of function
end
```

### Step 3: Check api-stdio Branch

```bash
cd /Users/ianderse/Projects/pob-api-fork
git branch
# Should show: * api-stdio

git log -1 --oneline
# Check if recent commits include stdio support
```

### Step 4: Test Minimal Case

Create minimal test that loads build and gets ONE stat:

```lua
-- In HeadlessWrapper.lua or test script
function test_load_and_stats()
  local xml = [[<Build>...</Build>]]

  -- Load
  local ok = loadBuildXML(xml)
  print("Load success:", ok)

  -- Force calc
  if build and build.calcsTab and build.calcsTab.BuildOutput then
    build.calcsTab:BuildOutput()
    print("Calc called")
  end

  -- Check output
  if build and build.calcsTab and build.calcsTab.mainOutput then
    local output = build.calcsTab.mainOutput
    print("Life:", output.Life)
    print("DPS:", output.TotalDPS or output.CombinedDPS)
  else
    print("ERROR: No output!")
  end
end
```

## Quick Fix Attempt

### Option 1: Force Recalculation

In `pobLuaBridge.ts`, after loading build, explicitly call BuildOutput:

```typescript
async loadBuildXml(xml: string, name = "API Build"): Promise<void> {
  const res = await this.send({ action: "load_build_xml", params: { xml, name } });
  if (!res.ok) throw new Error(res.error || "load_build_xml failed");

  // FORCE recalculation
  await this.send({ action: "rebuild_calcs" }); // If this action exists
}
```

### Option 2: Verify Build State After Load

```typescript
async loadBuildXml(xml: string, name = "API Build"): Promise<void> {
  const res = await this.send({ action: "load_build_xml", params: { xml, name } });
  if (!res.ok) throw new Error(res.error || "load_build_xml failed");

  // Verify build loaded
  const info = await this.getBuildInfo();
  if (!info || info.level < 1) {
    throw new Error("Build loaded but has invalid state");
  }
}
```

### Option 3: Check PoB Fork Version

The api-stdio branch might not have latest build loading code. Try:

```bash
cd /Users/ianderse/Projects/pob-api-fork
git fetch origin
git log origin/api-stdio --oneline | head -20
```

Look for commits related to:
- Build loading
- Stat calculation
- BuildOutput calls

## Recommended Action Plan

1. **Verify pob-api-fork branch**: Ensure on `api-stdio` and up-to-date
2. **Test manually**: Run `luajit HeadlessWrapper.lua` manually and test load_build_xml
3. **Add debug logging**: Temporarily add console.error() to see what's happening
4. **Check PoB fork issue tracker**: See if others have this problem

## Workaround

Until fixed, the XML-based tools still work fine:
- `analyze_build` - Parse stats from XML (less accurate but works)
- `compare_builds` - XML-based comparison
- `get_build_stats` - XML stats

The defensive analyzer LOGIC is perfect (we tested it). The issue is purely in getting stats from PoB Lua.

## Impact

**Phase 6.2 (Defensive Analyzer)**: ✅ Code complete, ⚠️ blocked by bridge issue
**Phase 4 (Items/Skills)**: ⚠️ Also affected
**Phase 3 (Tree optimization)**: ⚠️ Also affected

All Lua-based tools are impacted until bridge issue resolved.

## Next Steps

**Option A**: Debug the bridge issue now (find root cause)
**Option B**: Note the issue, move forward with documentation
**Option C**: Create XML-based version of defensive analyzer as fallback

What would you prefer?
