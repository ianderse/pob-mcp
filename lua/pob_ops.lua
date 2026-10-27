-- Thin wrappers around PoB headless objects for programmatic operations

local M = {}

-- PoB's own config option table is the only authoritative list of valid config
-- vars and their types. Deriving from it means new upstream options work here
-- without a code change; a hand-maintained allowlist silently drifts instead.
local configVarIndex
local function getConfigVarIndex()
  if configVarIndex then return configVarIndex end
  local ok, varList = pcall(LoadModule, "Modules/ConfigOptions")
  if not ok or type(varList) ~= 'table' then return nil end
  configVarIndex = {}
  for _, varData in ipairs(varList) do
    if varData.var then
      configVarIndex[varData.var] = varData
    end
  end
  return configVarIndex
end

-- Coerce an incoming JSON value to what PoB's control for this var would store.
-- Returns value, err.
local function coerceConfigValue(varData, value)
  local t = varData.type
  if t == 'check' then
    if type(value) == 'boolean' then return value end
    if value == 'true' or value == 1 then return true end
    if value == 'false' or value == 0 then return false end
    return nil, 'expected boolean'
  elseif t == 'count' or t == 'countAllowZero' or t == 'integer' or t == 'float' then
    local n = tonumber(value)
    if not n then return nil, 'expected number' end
    return n
  elseif t == 'list' then
    -- Accept either the stored val or the human-facing label.
    for _, entry in ipairs(varData.list or {}) do
      if entry.val == value or tostring(entry.val) == tostring(value) then return entry.val end
      if entry.label and tostring(entry.label):lower() == tostring(value):lower() then return entry.val end
    end
    return nil, 'not a valid option for this list'
  end
  -- Unknown control type: store as-is rather than refusing.
  return value
end

-- Human-facing label for a stored config value, so callers see "Kill all"
-- rather than the raw "None" that PoB stores for the bandit quest.
function M.config_value_label(var, value)
  local index = getConfigVarIndex()
  local varData = index and index[var]
  if not varData or varData.type ~= 'list' then return nil end
  for _, entry in ipairs(varData.list or {}) do
    if entry.val == value or tostring(entry.val) == tostring(value) then return entry.label end
  end
  return nil
end

-- Upstream's PassiveSpec:ImportFromNodeList gained a leading className
-- parameter (9 params incl. self, up from 8). Detect which signature the
-- loaded checkout has so both old and current PoB versions work.
--
-- ImportFromNodeList also refuses to allocate a Mastery node that has no
-- effect selected in the `mastery` table, silently dropping it instead. Every
-- tree-mutation entry point (set_tree, update_tree_delta) funnels through
-- here, so the merge lives at this chokepoint: the spec's current selections
-- are merged underneath whatever the caller supplies, and caller-supplied
-- ids/effects are coerced to numbers. That way the invariant holds for every
-- caller, present and future, instead of each one having to re-implement it.
function M.import_from_node_list(spec, classId, ascendId, secondaryId, nodes, overrides, mastery, treeVersion)
  local mergedMastery = {}
  for k, v in pairs(spec.masterySelections or {}) do mergedMastery[k] = v end
  if type(mastery) == 'table' then
    for nodeId, effectId in pairs(mastery) do
      mergedMastery[tonumber(nodeId) or nodeId] = tonumber(effectId) or effectId
    end
  end

  local info = debug and debug.getinfo and debug.getinfo(spec.ImportFromNodeList, 'u')
  if info and info.nparams and info.nparams >= 9 then
    return spec:ImportFromNodeList(nil, classId, ascendId, secondaryId, nodes, overrides or {}, mergedMastery, treeVersion)
  end
  return spec:ImportFromNodeList(classId, ascendId, secondaryId, nodes, overrides or {}, mergedMastery, treeVersion)
end

local MIN_PLAYER_LEVEL = 1
local MAX_PLAYER_LEVEL = 100
local NUM_FLASK_SLOTS = 5
local MAX_ITEM_TEXT_LENGTH = 10240  -- 10KB

function M.get_main_output()
  if not build or not build.calcsTab then
    return nil, "build not initialized"
  end
  if build.calcsTab.BuildOutput then
    build.calcsTab:BuildOutput()
  end
  local output = build.calcsTab and build.calcsTab.mainOutput or nil
  if not output then
    return nil, "no output available"
  end
  return output
end

-- PoB colour codes are display-only: "^8" for grey, "^xRRGGBB" for literal.
local function stripColourCodes(text)
  if type(text) ~= 'string' then return text end
  return (text:gsub('%^[xX]%x%x%x%x%x%x', ''):gsub('%^%d', ''))
end

local function leadingNumber(text)
  return tonumber(tostring(stripColourCodes(text)):match('%-?%d+%.?%d*') or '')
end

-- PoB only *applies* a non-damaging ailment to the enemy when the source is
-- guaranteed (a ShockBase/Override/Minimum mod) or when the player has filled
-- in the matching "Effect of X" config. A chance-to-shock skill produces
-- neither, so output.CurrentShock stays 0 and every downstream number silently
-- ignores the ailment. The magnitude the skill would actually inflict is
-- computed in CalcOffence, but only into the CALCS-mode breakdown table, never
-- into output. Read it back out so callers can see both halves.
--
-- breakdown[<Ailment>DPS].rowList is an effect-by-enemy-threshold curve. The
-- one row whose threshold carries a colour-coded tag is the enemy currently
-- configured; the rest are reference points.
local function readAilmentBreakdown(breakdown, ailment)
  local rows = breakdown and breakdown[ailment .. 'DPS'] and breakdown[ailment .. 'DPS'].rowList
  if type(rows) ~= 'table' then return nil, nil end
  local table_, atConfiguredEnemy = {}, nil
  for _, row in ipairs(rows) do
    local threshold = leadingNumber(row.thresh)
    local effect = leadingNumber(row.effect)
    if threshold and effect then
      local isConfiguredEnemy = type(row.thresh) == 'string' and row.thresh:find('%^') ~= nil
      table_[#table_ + 1] = {
        ailmentThreshold = threshold,
        effect = effect,
        note = stripColourCodes(row.effect):match('%((.-)%)'),
        isConfiguredEnemy = isConfiguredEnemy or nil,
      }
      if isConfiguredEnemy then atConfiguredEnemy = effect end
    end
  end
  if #table_ == 0 then return nil, nil end
  return table_, atConfiguredEnemy
end

-- PoB names the enemy-ailment config vars five different ways
-- (conditionShockEffect but conditionEnemyChilledEffect but
-- conditionScorchedEffect...), so guessing them from the ailment name is wrong
-- for most of them. Derive both vars from the option list itself: the effect
-- control is a 'count' gated on the enemy condition it belongs to, and that
-- gate names the ailment.
local ailmentConfigIndex
local function getAilmentConfigIndex()
  if ailmentConfigIndex then return ailmentConfigIndex end
  ailmentConfigIndex = {}
  local ok, varList = pcall(LoadModule, "Modules/ConfigOptions")
  if not ok or type(varList) ~= 'table' then return ailmentConfigIndex end
  for _, varData in ipairs(varList) do
    local gate = varData.var and varData.type == 'count' and varData.ifOption
    local suffix = type(gate) == 'string' and gate:match('^conditionEnemy(%a+)$')
    -- More than one count control hangs off the same gate (ShockStacks shares
    -- conditionEnemyShocked with the effect field), so match the label too.
    local isEffectControl = suffix
      and stripColourCodes(varData.label or ''):match('^Effect of') ~= nil
    if isEffectControl then
      -- "Shocked" -> Shock, "Scorched" -> Scorch, "Brittle" -> Brittle.
      -- Longest match wins so a future ailment cannot shadow a shorter name.
      local best
      for name in pairs((data and data.nonDamagingAilment) or {}) do
        if suffix:sub(1, #name) == name and (not best or #name > #best) then best = name end
      end
      if best then
        ailmentConfigIndex[best] = { effectVar = varData.var, enabledVar = gate }
      end
    end
  end
  return ailmentConfigIndex
end

function M.get_ailments()
  local output, err = M.get_main_output()
  if not output then return nil, err end
  local configInput = build.configTab and build.configTab.input or {}
  local configIndex = getAilmentConfigIndex()
  -- BuildOutput populates two environments; the breakdown only exists in the
  -- CALCS-mode one, and get_main_output hands back the MAIN-mode output.
  local env = build.calcsTab.calcsEnv
  local breakdown = env and env.player and env.player.breakdown or nil

  -- Freeze is the one non-damaging ailment measured in seconds rather than as
  -- an effect magnitude, and CalcPerform's ailment loop skips it for that
  -- reason. It is also the only entry with no default magnitude, so filter on
  -- the data rather than hardcoding a list that would drift.
  local names = {}
  for name, ailment in pairs((data and data.nonDamagingAilment) or {}) do
    if ailment.default ~= nil then names[#names + 1] = name end
  end
  table.sort(names)

  local result = {}
  for _, name in ipairs(names) do
    local chanceOnHit = tonumber(output[name .. 'ChanceOnHit']) or 0
    local chanceOnCrit = tonumber(output[name .. 'ChanceOnCrit']) or 0
    if chanceOnHit > 0 or chanceOnCrit > 0 or (tonumber(output['Current' .. name]) or 0) > 0 then
      local thresholdTable, calculated = readAilmentBreakdown(breakdown, name)
      local applied = tonumber(output['Current' .. name]) or 0
      -- Below the game's minimum the ailment does not land at all, so a small
      -- calculatedEffect must not be read as "a small amount of shock".
      local minimum = data.nonDamagingAilment[name].min
      local config = configIndex[name] or {}
      result[#result + 1] = {
        name = name,
        chanceOnHit = chanceOnHit,
        chanceOnCrit = chanceOnCrit,
        effectMod = tonumber(output[name .. 'EffectMod']),
        duration = tonumber(output[name .. 'Duration']),
        minimumEffect = minimum,
        maximumEffect = tonumber(output['Maximum' .. name]),
        appliedEffect = applied,
        calculatedEffect = calculated,
        -- Scorch, Brittle and Sap have a minimum of 0, so a zero magnitude
        -- would otherwise read as "lands" and raise a warning about nothing.
        landsOnConfiguredEnemy = (calculated ~= nil and calculated > 0
          and calculated >= (minimum or 0)) or nil,
        creditedInCalc = applied > 0,
        effectConfigVar = config.effectVar,
        enabledConfigVar = config.enabledVar,
        enabledOnEnemy = config.enabledVar ~= nil
          and configInput[config.enabledVar] == true or nil,
        thresholdTable = thresholdTable,
      }
    end
  end
  return { ailments = result }
end

function M.export_stats(fields)
  local output, err = M.get_main_output()
  if not output then
    return nil, err
  end
  -- Callers that pass no field list get this set, so it has to answer "how is
  -- this build doing" on both axes. Damage was missing entirely, which made
  -- every such caller report a build as if it dealt none.
  local wanted = fields or {
    "TotalDPS", "CombinedDPS", "FullDPS", "AverageDamage", "Speed",
    "CritChance", "CritMultiplier",
    "Life", "EnergyShield", "Armour", "Evasion",
    "FireResist", "ColdResist", "LightningResist", "ChaosResist",
    "BlockChance", "SpellBlockChance",
    "LifeRegen", "Mana", "ManaRegen", "ManaUnreserved",
    "Ward", "DodgeChance", "SpellDodgeChance",
    "TotalEHP", "PhysicalDamageReduction",
    "AttackDodgeChance", "EffectiveMovementSpeedMod",
    "SpellSuppressionChance", "LifeLeechGainRate", "ManaLeechGainRate",
    "EnduranceChargesMax", "FrenzyChargesMax", "PowerChargesMax",
  }
  local result = {}
  for _, k in ipairs(wanted) do
    if type(output[k]) ~= 'nil' then
      result[k] = output[k]
    end
  end
  local minionOutput = output.Minion
  if minionOutput and type(minionOutput) == 'table' then
    local minionWanted = {
      "Life", "EnergyShield", "Armour", "Evasion",
      "TotalDPS", "CombinedDPS", "AverageDamage", "Speed",
      "FireResist", "ColdResist", "LightningResist", "ChaosResist",
      "BlockChance", "PhysicalDamageReduction",
    }
    for _, k in ipairs(minionWanted) do
      if type(minionOutput[k]) ~= 'nil' then
        result["Minion" .. k] = minionOutput[k]
      end
    end
  end
  result._meta = result._meta or {}
  if build and build.targetVersion then
    result._meta.treeVersion = tostring(build.targetVersion)
  end
  if build and build.characterLevel then
    result._meta.level = tonumber(build.characterLevel)
  end
  if build and build.buildName then
    result._meta.buildName = tostring(build.buildName)
  end
  return result
end

function M.get_tree()
  if not build or not build.spec then
    return nil, "build/spec not initialized"
  end
  local spec = build.spec
  local out = {
    treeVersion = spec.treeVersion,
    classId = tonumber(spec.curClassId) or 0,
    ascendClassId = tonumber(spec.curAscendClassId) or 0,
    secondaryAscendClassId = tonumber(spec.curSecondaryAscendClassId or 0) or 0,
    nodes = {},
    masteryEffects = {},
  }
  for id, _ in pairs(spec.allocNodes or {}) do
    table.insert(out.nodes, id)
  end
  for mastery, effect in pairs(spec.masterySelections or {}) do
    out.masteryEffects[mastery] = effect
  end
  table.sort(out.nodes)
  return out
end

-- params: { classId, ascendClassId, secondaryAscendClassId?, nodes:[int], masteryEffects?:{[id]=effect}, treeVersion? }
function M.set_tree(params)
  if not build or not build.spec then
    return nil, "build/spec not initialized"
  end
  if type(params) ~= 'table' then
    return nil, "invalid params"
  end
  local classId = tonumber(params.classId or 0) or 0
  local ascendId = tonumber(params.ascendClassId or 0) or 0
  local secondaryId = tonumber(params.secondaryAscendClassId or 0) or 0
  local nodes = {}
  if type(params.nodes) == 'table' then
    for _, v in ipairs(params.nodes) do
      table.insert(nodes, tonumber(v))
    end
  end
  local mastery = params.masteryEffects or {}
  local treeVersion = params.treeVersion
  M.import_from_node_list(build.spec, classId, ascendId, secondaryId, nodes, {}, mastery, treeVersion)
  M.get_main_output()
  return true
end

function M.export_build_xml()
  if not build or not build.SaveDB then
    return nil, 'build not initialized'
  end
  local xml = build:SaveDB('api-export')
  if not xml then return nil, 'failed to compose xml' end
  return xml
end

function M.set_level(level)
  if not build or not build.configTab then
    return nil, 'build/config not initialized'
  end
  local lvl = tonumber(level)
  if not lvl or lvl < MIN_PLAYER_LEVEL or lvl > MAX_PLAYER_LEVEL then
    return nil, string.format('invalid level (must be %d-%d)', MIN_PLAYER_LEVEL, MAX_PLAYER_LEVEL)
  end
  build.characterLevel = lvl
  build.characterLevelAutoMode = false
  if build.configTab and build.configTab.BuildModList then
    build.configTab:BuildModList()
  end
  M.get_main_output()
  return true
end

function M.get_build_info()
  if not build then return nil, 'build not initialized' end
  local info = {
    name = build.buildName,
    level = build.characterLevel,
    className = build.spec and build.spec.curClassName or nil,
    ascendClassName = build.spec and build.spec.curAscendClassName or nil,
    treeVersion = build.targetVersion or (build.spec and build.spec.treeVersion) or nil,
  }
  return info
end

function M.update_tree_delta(params)
  if not build or not build.spec then return nil, 'build/spec not initialized' end
  local current, err = M.get_tree()
  if not current then return nil, err end
  local set = {}
  for _, id in ipairs(current.nodes) do set[id] = true end
  if params and type(params.removeNodes) == 'table' then
    for _, id in ipairs(params.removeNodes) do set[tonumber(id)] = nil end
  end
  if params and type(params.addNodes) == 'table' then
    for _, id in ipairs(params.addNodes) do set[tonumber(id)] = true end
  end
  local nodes = {}
  for id,_ in pairs(set) do table.insert(nodes, id) end
  table.sort(nodes)

  local classId = params.classId or current.classId or 0
  local ascendId = params.ascendClassId or current.ascendClassId or 0
  local secId = params.secondaryAscendClassId or current.secondaryAscendClassId or 0
  local tv = params.treeVersion or current.treeVersion
  -- import_from_node_list merges the spec's existing mastery selections
  -- underneath params.masteryEffects itself, so a bare pass-through is enough.
  M.import_from_node_list(build.spec, tonumber(classId) or 0, tonumber(ascendId) or 0, tonumber(secId) or 0, nodes, {}, params and params.masteryEffects, tv)
  M.get_main_output()

  -- Report what PoB actually allocated. Requesting a node is not the same as
  -- getting it: disconnected nodes and effect-less masteries are dropped.
  local after = M.get_tree()
  local allocated = {}
  for _, id in ipairs(after and after.nodes or {}) do allocated[id] = true end
  local dropped = {}
  if params and type(params.addNodes) == 'table' then
    for _, id in ipairs(params.addNodes) do
      local n = tonumber(id)
      if n and not allocated[n] then table.insert(dropped, n) end
    end
  end
  return { tree = after, droppedNodes = dropped }
end


-- PoB's calculation output is a live object graph: actors link back to their
-- parents and to shared ModStores, so it contains reference cycles. Handing it
-- straight to json.encode raises "reference cycle", which is an uncaught error
-- that takes the whole bridge process down. Copy out a JSON-safe projection:
-- scalars only, cycles broken, depth bounded.
local SANITIZE_MAX_DEPTH = 4
local function sanitizeForJson(value, depth, seen)
  local t = type(value)
  if t == 'string' or t == 'boolean' then return value end
  if t == 'number' then
    -- dkjson also refuses NaN and +/-inf.
    if value ~= value or value == math.huge or value == -math.huge then return nil end
    return value
  end
  if t ~= 'table' then return nil end
  if depth >= SANITIZE_MAX_DEPTH then return nil end
  if seen[value] then return nil end
  seen[value] = true
  local out = nil
  for k, v in pairs(value) do
    local kt = type(k)
    if kt == 'string' or kt == 'number' then
      local clean = sanitizeForJson(v, depth + 1, seen)
      if clean ~= nil then
        out = out or {}
        out[k] = clean
      end
    end
  end
  seen[value] = nil
  return out
end

function M.sanitize_for_json(value)
  return sanitizeForJson(value, 0, {})
end

-- A node this build could actually take: on the passive tree proper, or in the
-- build's own ascendancy. Mastery nodes are excluded because allocating one
-- without an effect selection is a no-op (see PassiveSpec:ImportFromNodeList).
function M.is_allocatable(node)
  if type(node) ~= 'table' then return false end
  if node.type == 'Mastery' or node.isMastery then return false end
  if node.type == 'ClassStart' or node.classStartIndex then return false end
  if node.isProxy then return false end
  local asc = node.ascendancyName
  if asc and asc ~= '' then
    local own = build and build.spec and build.spec.curAscendClassName
    if not own or own == '' or asc ~= own then return false end
  end
  return true
end

-- params: { addNodes?: number[], removeNodes?: number[], masteryEffects?: {[nodeId]: effectId}, useFullDPS?: boolean }
function M.calc_with(params)
  if not build or not build.calcsTab then return nil, 'build not initialized' end
  local calcFunc, baseOut = build.calcsTab:GetMiscCalculator()
  local override = {}
  if params and type(params.addNodes) == 'table' then
    override.addNodes = {}
    for _, id in ipairs(params.addNodes) do
      local n = build.spec and build.spec.nodes and build.spec.nodes[tonumber(id)]
      -- spec.nodes holds every node on the tree, including other classes'
      -- ascendancies. Simulating one of those is not a meaningful "what if"
      -- and can take the calculator down, so only consider allocatable nodes.
      if n and M.is_allocatable(n) then override.addNodes[n] = true end
    end
  end
  if params and type(params.removeNodes) == 'table' then
    override.removeNodes = {}
    for _, id in ipairs(params.removeNodes) do
      local n = build.spec and build.spec.nodes and build.spec.nodes[tonumber(id)]
      if n then override.removeNodes[n] = true end
    end
  end
  -- Temporarily override mastery selections for simulation
  local origMastery = nil
  if params and type(params.masteryEffects) == 'table' then
    origMastery = {}
    for k, v in pairs(build.spec.masterySelections or {}) do
      origMastery[k] = v
    end
    build.spec.masterySelections = build.spec.masterySelections or {}
    for nodeId, effectId in pairs(params.masteryEffects) do
      build.spec.masterySelections[tonumber(nodeId)] = effectId
    end
  end
  local out = calcFunc(override, params and params.useFullDPS)
  -- Restore original mastery selections
  if origMastery then
    build.spec.masterySelections = origMastery
  end
  return M.sanitize_for_json(out), M.sanitize_for_json(baseOut)
end


function M.get_config()
  if not build or not build.configTab then return nil, 'build/config not initialized' end
  local input = build.configTab.input
  local cfg = {}
  -- Serialize the full config input table (JSON-encodable values only)
  if type(input) == 'table' then
    for k, v in pairs(input) do
      local vt = type(v)
      if type(k) == 'string' and (vt == 'string' or vt == 'number' or vt == 'boolean') then
        cfg[k] = v
      end
    end
  end
  -- Keep original keys for backward compatibility
  cfg.bandit = (input and input.bandit) or build.bandit
  cfg.pantheonMajorGod = (input and input.pantheonMajorGod) or build.pantheonMajorGod
  cfg.pantheonMinorGod = (input and input.pantheonMinorGod) or build.pantheonMinorGod
  cfg.enemyLevel = build.configTab.enemyLevel
  return cfg
end

-- Dropdown options store a val that often differs from what the UI shows: the
-- bandit quest stores "None" but reads "Kill all". Expose the labels so callers
-- can display what PoB displays instead of the raw stored value.
function M.get_config_labels()
  local cfg, err = M.get_config()
  if not cfg then return nil, err end
  local labels = {}
  for k, v in pairs(cfg) do
    local label = M.config_value_label(k, v)
    if label then labels[k] = label end
  end
  return labels
end

function M.set_config(params)
  if not build or not build.configTab then return nil, 'build/config not initialized' end
  if type(params) ~= 'table' then return nil, 'invalid params' end
  local input = build.configTab.input or {}
  build.configTab.input = input
  local index = getConfigVarIndex()
  if not index then return nil, 'could not load PoB config options' end

  local applied, rejected = {}, {}
  local changed = false
  for key, value in pairs(params) do
    -- enemyLevel lives on the tab itself, not in the input table.
    if key == 'enemyLevel' then
      local n = tonumber(value)
      if n then
        build.configTab.enemyLevel = n
        applied[key] = n
        changed = true
      else
        rejected[key] = 'expected number'
      end
    elseif index[key] then
      local coerced, err = coerceConfigValue(index[key], value)
      if err then
        rejected[key] = err
      else
        input[key] = coerced
        applied[key] = coerced
        changed = true
      end
    else
      rejected[key] = 'unknown config option'
    end
  end

  if changed and build.configTab.BuildModList then build.configTab:BuildModList() end
  M.get_main_output()
  return { applied = applied, rejected = rejected }
end


function M.get_skills()
  if not build or not build.skillsTab or not build.calcsTab then return nil, 'skills not initialized' end
  local groups = {}
  for idx, g in ipairs(build.skillsTab.socketGroupList or {}) do
    local names = {}
    if g.displaySkillList then
      for _, eff in ipairs(g.displaySkillList) do
        if eff and eff.activeEffect and eff.activeEffect.grantedEffect then
          table.insert(names, eff.activeEffect.grantedEffect.name)
        end
      end
    end
    local gems = {}
    if g.gemList then
      for gemIdx, gem in ipairs(g.gemList) do
        table.insert(gems, {
          index = gemIdx,
          name = gem.nameSpec or gem.name or '',
          level = gem.level or 1,
          quality = gem.quality or 0,
          qualityId = gem.qualityId or 'Default',
          enabled = gem.enabled ~= false,
          isSupport = gem.skillId and gem.skillId:find('Support') ~= nil or false,
        })
      end
    end
    table.insert(groups, {
      index = idx,
      label = g.label,
      slot = g.slot,
      enabled = g.enabled,
      includeInFullDPS = g.includeInFullDPS,
      mainActiveSkill = g.mainActiveSkill,
      skills = names,
      gems = gems,
    })
  end
  local result = {
    mainSocketGroup = build.mainSocketGroup,
    calcsSkillNumber = build.calcsTab.input and build.calcsTab.input.skill_number or nil,
    groups = groups,
  }
  return result
end

function M.set_main_selection(params)
  if not build or not build.skillsTab or not build.calcsTab then return nil, 'skills not initialized' end
  if type(params) ~= 'table' then return nil, 'invalid params' end
  if params.mainSocketGroup ~= nil then
    build.mainSocketGroup = tonumber(params.mainSocketGroup) or build.mainSocketGroup
  end
  local g = build.skillsTab.socketGroupList[build.mainSocketGroup]
  if not g then return nil, 'invalid mainSocketGroup' end
  if params.mainActiveSkill ~= nil then
    g.mainActiveSkill = tonumber(params.mainActiveSkill) or g.mainActiveSkill
  end
  if params.skillPart ~= nil then
    local idx = g.mainActiveSkill or 1
    local src = g.displaySkillList and g.displaySkillList[idx] and g.displaySkillList[idx].activeEffect and g.displaySkillList[idx].activeEffect.srcInstance
    if src then src.skillPart = tonumber(params.skillPart) end
  end
  -- Keep calcsTab in sync: use active group index
  build.calcsTab.input.skill_number = build.mainSocketGroup
  M.get_main_output()
  return true
end

function M.add_item_text(params)
  if not build or not build.itemsTab then return nil, 'items not initialized' end
  if type(params) ~= 'table' or type(params.text) ~= 'string' then return nil, 'missing text' end

  if #params.text == 0 then return nil, 'item text cannot be empty' end
  if #params.text > MAX_ITEM_TEXT_LENGTH then
    return nil, string.format('item text too long (max %d bytes)', MAX_ITEM_TEXT_LENGTH)
  end

  local ok, item = pcall(new, 'Item', params.text)
  if not ok then return nil, 'invalid item text: ' .. tostring(item) end
  if not item or not item.baseName then return nil, 'failed to parse item' end

  item:NormaliseQuality()
  build.itemsTab:AddItem(item, params.noAutoEquip == true)
  if params.slotName then
    local slot = tostring(params.slotName)
    if build.itemsTab.slots[slot] then
      build.itemsTab.slots[slot]:SetSelItemId(item.id)
      build.itemsTab:PopulateSlots()
    end
  end
  build.itemsTab:AddUndoState()
  build.buildFlag = true
  M.get_main_output()
  return { id = item.id, name = item.name, slot = params.slotName or item:GetPrimarySlot() }
end

function M.set_flask_active(params)
  if not build or not build.itemsTab then return nil, 'items not initialized' end
  if type(params) ~= 'table' then return nil, 'invalid params' end
  local idx = tonumber(params.index)
  local active = params.active == true
  if not idx or idx < 1 or idx > NUM_FLASK_SLOTS then
    return nil, string.format('invalid flask index (must be 1-%d)', NUM_FLASK_SLOTS)
  end
  local slotName = 'Flask ' .. tostring(idx)
  if not build.itemsTab.activeItemSet or not build.itemsTab.activeItemSet[slotName] then return nil, 'slot not found' end
  build.itemsTab.activeItemSet[slotName].active = active
  -- Re-populate slots so flask effects are applied before recalculating
  if build.itemsTab.PopulateSlots then
    build.itemsTab:PopulateSlots()
  end
  if build.configTab and build.configTab.BuildModList then
    build.configTab:BuildModList()
  end
  build.itemsTab:AddUndoState()
  build.buildFlag = true
  M.get_main_output()
  return true
end


function M.get_items()
  if not build or not build.itemsTab then return nil, 'items not initialized' end
  local itemsTab = build.itemsTab
  local result = { }
  -- Prefer orderedSlots for deterministic order
  local ordered = itemsTab.orderedSlots or {}
  local seen = {}
  local function add_slot(slotName)
    if seen[slotName] then return end
    seen[slotName] = true
    local slotCtrl = itemsTab.slots[slotName]
    if not slotCtrl then return end
    local selId = slotCtrl.selItemId or 0
    local entry = { slot = slotName, id = selId }
    if selId > 0 then
      local it = itemsTab.items[selId]
      if it then
        entry.name = it.name
        entry.baseName = it.baseName
        entry.type = it.type
        entry.rarity = it.rarity
        entry.raw = it.raw
      end
    end
    -- Flask/Tincture activation flag stored in activeItemSet
    local set = itemsTab.activeItemSet
    if set and set[slotName] and set[slotName].active ~= nil then
      entry.active = set[slotName].active and true or false
    end
    table.insert(result, entry)
  end
  for _, slot in ipairs(ordered) do
    if slot and slot.slotName then add_slot(slot.slotName) end
  end
  -- Add any remaining slots not in ordered list
  for slotName, _ in pairs(itemsTab.slots or {}) do add_slot(slotName) end
  return result
end


-- params: { label?: string, slot?: string, enabled?: boolean, includeInFullDPS?: boolean }
function M.create_socket_group(params)
  if not build or not build.skillsTab then return nil, 'skills not initialized' end
  if type(params) ~= 'table' then params = {} end

  local socketGroup = {
    label = params.label or '',
    slot = params.slot,
    enabled = params.enabled ~= false,
    includeInFullDPS = params.includeInFullDPS == true,
    gemList = {},
    mainActiveSkill = 1,
    mainActiveSkillCalcs = 1,
  }

  local skillSetId = build.skillsTab.activeSkillSetId or 1
  local skillSet = build.skillsTab.skillSets[skillSetId]
  if not skillSet then return nil, 'active skill set not found' end

  table.insert(skillSet.socketGroupList, socketGroup)
  local index = #skillSet.socketGroupList

  if build.skillsTab.ProcessSocketGroup then
    build.skillsTab:ProcessSocketGroup(socketGroup)
  end

  build.buildFlag = true
  M.get_main_output()

  return { index = index, label = socketGroup.label }
end

-- params: { groupIndex: number, gemName: string, level?: number, quality?: number, qualityId?: string, enabled?: boolean }
function M.add_gem(params)
  if not build or not build.skillsTab then return nil, 'skills not initialized' end
  if type(params) ~= 'table' then return nil, 'invalid params' end
  if not params.groupIndex or not params.gemName then return nil, 'missing groupIndex or gemName' end

  local skillSetId = build.skillsTab.activeSkillSetId or 1
  local skillSet = build.skillsTab.skillSets[skillSetId]
  if not skillSet then return nil, 'active skill set not found' end

  local groupIndex = tonumber(params.groupIndex)
  local socketGroup = skillSet.socketGroupList[groupIndex]
  if not socketGroup then return nil, 'socket group not found at index ' .. tostring(groupIndex) end

  local gemInstance = {
    nameSpec = tostring(params.gemName),
    level = tonumber(params.level) or 20,
    quality = tonumber(params.quality) or 0,
    qualityId = params.qualityId or 'Default',
    enabled = params.enabled ~= false,
    enableGlobal1 = true,
    enableGlobal2 = false,
    count = tonumber(params.count) or 1,
  }

  if build.data and build.data.gems then
    for _, gemData in pairs(build.data.gems) do
      if gemData.name == gemInstance.nameSpec or gemData.nameSpec == gemInstance.nameSpec then
        gemInstance.gemId = gemData.id
        if gemData.grantedEffect then
          gemInstance.skillId = gemData.grantedEffect.id
        elseif gemData.grantedEffectId then
          gemInstance.skillId = gemData.grantedEffectId
        end
        gemInstance.gemData = gemData
        break
      end
    end
  end

  table.insert(socketGroup.gemList, gemInstance)
  local gemIndex = #socketGroup.gemList

  if build.skillsTab.ProcessSocketGroup then
    build.skillsTab:ProcessSocketGroup(socketGroup)
  end

  build.buildFlag = true
  M.get_main_output()

  return { gemIndex = gemIndex, name = gemInstance.nameSpec }
end

-- params: { groupIndex: number, gemIndex: number, level: number }
function M.set_gem_level(params)
  if not build or not build.skillsTab then return nil, 'skills not initialized' end
  if type(params) ~= 'table' then return nil, 'invalid params' end
  if not params.groupIndex or not params.gemIndex or not params.level then
    return nil, 'missing groupIndex, gemIndex, or level'
  end

  local skillSetId = build.skillsTab.activeSkillSetId or 1
  local skillSet = build.skillsTab.skillSets[skillSetId]
  if not skillSet then return nil, 'active skill set not found' end

  local groupIndex = tonumber(params.groupIndex)
  local gemIndex = tonumber(params.gemIndex)
  local level = tonumber(params.level)

  local socketGroup = skillSet.socketGroupList[groupIndex]
  if not socketGroup then return nil, 'socket group not found' end

  local gemInstance = socketGroup.gemList[gemIndex]
  if not gemInstance then return nil, 'gem not found' end

  if level < 1 or level > 40 then return nil, 'invalid level (must be 1-40)' end

  gemInstance.level = level

  if build.skillsTab.ProcessSocketGroup then
    build.skillsTab:ProcessSocketGroup(socketGroup)
  end

  build.buildFlag = true
  M.get_main_output()

  return true
end

-- params: { groupIndex: number, gemIndex: number, quality: number, qualityId?: string }
function M.set_gem_quality(params)
  if not build or not build.skillsTab then return nil, 'skills not initialized' end
  if type(params) ~= 'table' then return nil, 'invalid params' end
  if not params.groupIndex or not params.gemIndex or not params.quality then
    return nil, 'missing groupIndex, gemIndex, or quality'
  end

  local skillSetId = build.skillsTab.activeSkillSetId or 1
  local skillSet = build.skillsTab.skillSets[skillSetId]
  if not skillSet then return nil, 'active skill set not found' end

  local groupIndex = tonumber(params.groupIndex)
  local gemIndex = tonumber(params.gemIndex)
  local quality = tonumber(params.quality)

  local socketGroup = skillSet.socketGroupList[groupIndex]
  if not socketGroup then return nil, 'socket group not found' end

  local gemInstance = socketGroup.gemList[gemIndex]
  if not gemInstance then return nil, 'gem not found' end

  if quality < 0 or quality > 23 then return nil, 'invalid quality (must be 0-23)' end

  gemInstance.quality = quality
  if params.qualityId then
    gemInstance.qualityId = tostring(params.qualityId)
  end

  if build.skillsTab.ProcessSocketGroup then
    build.skillsTab:ProcessSocketGroup(socketGroup)
  end

  build.buildFlag = true
  M.get_main_output()

  return true
end

-- params: { groupIndex: number }
function M.remove_skill(params)
  if not build or not build.skillsTab then return nil, 'skills not initialized' end
  if type(params) ~= 'table' then return nil, 'invalid params' end
  if not params.groupIndex then return nil, 'missing groupIndex' end

  local skillSetId = build.skillsTab.activeSkillSetId or 1
  local skillSet = build.skillsTab.skillSets[skillSetId]
  if not skillSet then return nil, 'active skill set not found' end

  local groupIndex = tonumber(params.groupIndex)
  local socketGroup = skillSet.socketGroupList[groupIndex]
  if not socketGroup then return nil, 'socket group not found' end

  -- Don't allow removing special groups with sources
  if socketGroup.source then
    return nil, 'cannot remove special socket groups (item/node granted skills)'
  end

  table.remove(skillSet.socketGroupList, groupIndex)

  build.buildFlag = true
  M.get_main_output()

  return true
end

-- params: { groupIndex: number, gemIndex: number }
function M.remove_gem(params)
  if not build or not build.skillsTab then return nil, 'skills not initialized' end
  if type(params) ~= 'table' then return nil, 'invalid params' end
  if not params.groupIndex or not params.gemIndex then
    return nil, 'missing groupIndex or gemIndex'
  end

  local skillSetId = build.skillsTab.activeSkillSetId or 1
  local skillSet = build.skillsTab.skillSets[skillSetId]
  if not skillSet then return nil, 'active skill set not found' end

  local groupIndex = tonumber(params.groupIndex)
  local gemIndex = tonumber(params.gemIndex)

  local socketGroup = skillSet.socketGroupList[groupIndex]
  if not socketGroup then return nil, 'socket group not found' end

  local gemInstance = socketGroup.gemList[gemIndex]
  if not gemInstance then return nil, 'gem not found' end

  table.remove(socketGroup.gemList, gemIndex)

  if build.skillsTab.ProcessSocketGroup then
    build.skillsTab:ProcessSocketGroup(socketGroup)
  end

  build.buildFlag = true
  M.get_main_output()

  return true
end


-- params: { path: string }
function M.save_build(params)
  if not build or not build.SaveDB then
    return nil, 'build not initialized'
  end
  if type(params) ~= 'table' or type(params.path) ~= 'string' or params.path == '' then
    return nil, 'missing or invalid path'
  end

  -- Sync curAscendClassName from the current ascendClassId so the Build XML
  -- element always reflects the live state (guards against stale names after
  -- set_tree or new_build with a different ascendancy).
  if build.spec and build.spec.curClass and build.spec.curClass.classes then
    local ascendId = build.spec.curAscendClassId or 0
    local ascendClass = build.spec.curClass.classes[ascendId] or build.spec.curClass.classes[0]
    if ascendClass and ascendClass.name then
      build.spec.curAscendClassName = ascendClass.name
    end
  end

  -- Re-process all socket groups so that gem modifications made via add_gem /
  -- set_gem_level / set_gem_quality are fully resolved before SaveDB serialises
  -- the skillsTab.  ProcessSocketGroup populates gemData / grantedEffect from
  -- the current gemId/nameSpec, ensuring accurate gemId and nameSpec values in
  -- the output XML.
  if build.skillsTab and build.skillsTab.socketGroupList then
    for _, socketGroup in ipairs(build.skillsTab.socketGroupList) do
      if build.skillsTab.ProcessSocketGroup then
        build.skillsTab:ProcessSocketGroup(socketGroup)
      end
    end
  end

  local xml = build:SaveDB('api-export')
  if not xml then return nil, 'failed to compose xml' end
  local f, ferr = io.open(params.path, 'w')
  if not f then return nil, 'failed to open file: ' .. tostring(ferr) end
  f:write(xml)
  f:close()
  return { path = params.path, size = #xml }
end

function M.list_specs()
  if not build or not build.treeTab then return nil, 'build/treeTab not initialized' end
  local specs = {}
  for i, spec in ipairs(build.treeTab.specList or {}) do
    local nodeCount = 0
    for _ in pairs(spec.allocNodes or {}) do nodeCount = nodeCount + 1 end
    table.insert(specs, {
      index = i,
      title = spec.title or ('Spec ' .. i),
      active = (i == build.treeTab.activeSpec),
      className = spec.curClassName,
      ascendClassName = spec.curAscendClassName,
      treeVersion = spec.treeVersion,
      nodeCount = nodeCount,
    })
  end
  return { specs = specs, activeSpec = build.treeTab.activeSpec }
end

function M.select_spec(params)
  if not build or not build.treeTab then return nil, 'build/treeTab not initialized' end
  if type(params) ~= 'table' then return nil, 'invalid params' end
  local index = tonumber(params.index)
  local specCount = #(build.treeTab.specList or {})
  if not index or not build.treeTab.specList[index] then
    return nil, string.format('spec index %s not found (valid range: 1-%d)', tostring(params.index), specCount)
  end
  build.treeTab:SetActiveSpec(index)
  M.get_main_output()
  return M.list_specs()
end

function M.list_item_sets()
  if not build or not build.itemsTab then return nil, 'build/itemsTab not initialized' end
  local sets = {}
  for _, id in ipairs(build.itemsTab.itemSetOrderList or {}) do
    local itemSet = build.itemsTab.itemSets[id]
    if itemSet then
      table.insert(sets, {
        id = id,
        title = itemSet.title or ('Item Set ' .. id),
        active = (id == build.itemsTab.activeItemSetId),
        useSecondWeaponSet = itemSet.useSecondWeaponSet == true,
      })
    end
  end
  return { itemSets = sets, activeItemSetId = build.itemsTab.activeItemSetId }
end

function M.select_item_set(params)
  if not build or not build.itemsTab then return nil, 'build/itemsTab not initialized' end
  if type(params) ~= 'table' then return nil, 'invalid params' end
  local id = tonumber(params.id)
  if not id or not build.itemsTab.itemSets[id] then
    return nil, string.format('item set id %s not found', tostring(params.id))
  end
  build.itemsTab:SetActiveItemSet(id)
  if build.itemsTab.PopulateSlots then
    build.itemsTab:PopulateSlots()
  end
  if build.configTab and build.configTab.BuildModList then
    build.configTab:BuildModList()
  end
  M.get_main_output()
  return M.list_item_sets()
end


-- params: { title?: string, copyFrom?: number (spec index), activate?: boolean }
function M.create_spec(params)
  if not build or not build.treeTab then return nil, 'build/treeTab not initialized' end
  params = type(params) == 'table' and params or {}
  local specList = build.treeTab.specList
  if not specList then return nil, 'spec list not available' end
  local source = nil
  if params.copyFrom ~= nil then
    source = specList[tonumber(params.copyFrom)]
    if not source then
      return nil, string.format('copyFrom spec index %s not found (valid range: 1-%d)', tostring(params.copyFrom), #specList)
    end
  end
  local version = (source and source.treeVersion) or (build.spec and build.spec.treeVersion) or latestTreeVersion
  local newSpec = new('PassiveSpec', build, version)
  if source then
    -- Same copy mechanism TreeTab uses for its spec management popup
    newSpec.jewels = copyTable(source.jewels)
    newSpec:RestoreUndoState(source:CreateUndoState(), version)
    if newSpec.BuildClusterJewelGraphs then newSpec:BuildClusterJewelGraphs() end
  end
  newSpec.title = params.title and tostring(params.title)
    or (source and source.title and (tostring(source.title) .. ' (copy)'))
    or ('Spec ' .. (#specList + 1))
  table.insert(specList, newSpec)
  build.modFlag = true
  if params.activate ~= false then
    build.treeTab:SetActiveSpec(#specList)
    M.get_main_output()
  end
  return M.list_specs()
end

-- params: { index: number }
function M.delete_spec(params)
  if not build or not build.treeTab then return nil, 'build/treeTab not initialized' end
  if type(params) ~= 'table' then return nil, 'invalid params' end
  local specList = build.treeTab.specList or {}
  local index = tonumber(params.index)
  if not index or not specList[index] then
    return nil, string.format('spec index %s not found (valid range: 1-%d)', tostring(params.index), #specList)
  end
  if #specList <= 1 then return nil, 'cannot delete the only remaining spec' end
  table.remove(specList, index)
  local active = build.treeTab.activeSpec or 1
  if active > index then
    build.treeTab:SetActiveSpec(active - 1)
  elseif active == index then
    build.treeTab:SetActiveSpec(math.min(index, #specList))
  end
  build.modFlag = true
  M.get_main_output()
  return M.list_specs()
end

-- params: { index: number, title: string }
function M.rename_spec(params)
  if not build or not build.treeTab then return nil, 'build/treeTab not initialized' end
  if type(params) ~= 'table' or params.title == nil then return nil, 'missing index or title' end
  local specList = build.treeTab.specList or {}
  local index = tonumber(params.index)
  local spec = index and specList[index]
  if not spec then
    return nil, string.format('spec index %s not found (valid range: 1-%d)', tostring(params.index), #specList)
  end
  spec.title = tostring(params.title)
  build.modFlag = true
  return M.list_specs()
end

-- params: { groupIndex: number, enabled: boolean }
function M.set_socket_group_enabled(params)
  if not build or not build.skillsTab then return nil, 'skills not initialized' end
  if type(params) ~= 'table' or params.groupIndex == nil or params.enabled == nil then
    return nil, 'missing groupIndex or enabled'
  end
  local skillSetId = build.skillsTab.activeSkillSetId or 1
  local skillSet = build.skillsTab.skillSets[skillSetId]
  if not skillSet then return nil, 'active skill set not found' end
  local groupIndex = tonumber(params.groupIndex)
  local socketGroup = groupIndex and skillSet.socketGroupList[groupIndex]
  if not socketGroup then return nil, 'socket group not found' end
  socketGroup.enabled = params.enabled == true
  if build.skillsTab.ProcessSocketGroup then
    build.skillsTab:ProcessSocketGroup(socketGroup)
  end
  build.buildFlag = true
  M.get_main_output()
  return {
    groupIndex = groupIndex,
    label = socketGroup.displayLabel or socketGroup.label or ('Group ' .. groupIndex),
    enabled = socketGroup.enabled == true,
  }
end

-- params: { groupIndex: number, gemIndex: number, enabled: boolean }
function M.set_gem_enabled(params)
  if not build or not build.skillsTab then return nil, 'skills not initialized' end
  if type(params) ~= 'table' or params.groupIndex == nil or params.gemIndex == nil or params.enabled == nil then
    return nil, 'missing groupIndex, gemIndex or enabled'
  end
  local skillSetId = build.skillsTab.activeSkillSetId or 1
  local skillSet = build.skillsTab.skillSets[skillSetId]
  if not skillSet then return nil, 'active skill set not found' end
  local groupIndex = tonumber(params.groupIndex)
  local socketGroup = groupIndex and skillSet.socketGroupList[groupIndex]
  if not socketGroup then return nil, 'socket group not found' end
  local gemIndex = tonumber(params.gemIndex)
  local gemInstance = gemIndex and socketGroup.gemList[gemIndex]
  if not gemInstance then return nil, 'gem not found' end
  gemInstance.enabled = params.enabled == true
  if build.skillsTab.ProcessSocketGroup then
    build.skillsTab:ProcessSocketGroup(socketGroup)
  end
  build.buildFlag = true
  M.get_main_output()
  return true
end

-- params: { keyword: string, nodeType?: string ('normal'|'notable'|'keystone'), maxResults?: number, includeAllocated?: boolean }
function M.search_nodes(params)
  if not build or not build.spec then return nil, 'build/spec not initialized' end
  if type(params) ~= 'table' or type(params.keyword) ~= 'string' then
    return nil, 'missing or invalid keyword'
  end

  local keyword = params.keyword:lower()
  local nodeType = params.nodeType and params.nodeType:lower() or nil
  local maxResults = tonumber(params.maxResults) or 50
  local includeAllocated = params.includeAllocated ~= false

  local results = {}
  local count = 0

  local allocatedSet = {}
  if build.spec.allocNodes then
    for id, _ in pairs(build.spec.allocNodes) do
      allocatedSet[id] = true
    end
  end

  for id, node in pairs(build.spec.nodes) do
    if count >= maxResults then break end

    if not includeAllocated and allocatedSet[id] then
      goto continue
    end

    if nodeType then
      local nType = 'normal'
      if node.isKeystone then nType = 'keystone'
      elseif node.isNotable then nType = 'notable'
      elseif node.isJewelSocket then nType = 'jewel'
      elseif node.isMultipleChoiceOption then nType = 'mastery'
      elseif node.ascendancyName then nType = 'ascendancy'
      end
      if nType ~= nodeType then goto continue end
    end

    local matches = false
    if node.name and node.name:lower():find(keyword, 1, true) then
      matches = true
    end

    if not matches and node.sd then
      for _, stat in ipairs(node.sd) do
        if type(stat) == 'string' and stat:lower():find(keyword, 1, true) then
          matches = true
          break
        end
      end
    end

    if not matches and node.modList then
      for _, mod in ipairs(node.modList) do
        local modStr = tostring(mod)
        if modStr:lower():find(keyword, 1, true) then
          matches = true
          break
        end
      end
    end

    if matches then
      local nodeType = 'normal'
      if node.isKeystone then nodeType = 'keystone'
      elseif node.isNotable then nodeType = 'notable'
      elseif node.isJewelSocket then nodeType = 'jewel'
      elseif node.isMultipleChoiceOption then nodeType = 'mastery'
      elseif node.ascendancyName then nodeType = 'ascendancy'
      end

      local stats = {}
      if node.sd then
        for _, stat in ipairs(node.sd) do
          if type(stat) == 'string' then
            table.insert(stats, stat)
          end
        end
      end

      table.insert(results, {
        id = id,
        name = node.name or 'Unnamed',
        type = nodeType,
        stats = stats,
        allocated = allocatedSet[id] == true,
        x = node.x,
        y = node.y,
        orbit = node.orbit,
        orbitIndex = node.orbitIndex,
        ascendancyName = node.ascendancyName,
        -- Blight notables sit off the tree and are reached by anointing, not by
        -- spending a point; callers need to tell them apart from real nodes.
        isBlighted = node.isBlighted == true,
      })
      count = count + 1
    end

    ::continue::
  end

  -- Sort results: keystones first, then notables, then normal
  table.sort(results, function(a, b)
    local typeOrder = { keystone = 1, notable = 2, jewel = 3, mastery = 4, ascendancy = 5, normal = 6 }
    local aOrder = typeOrder[a.type] or 99
    local bOrder = typeOrder[b.type] or 99
    if aOrder ~= bOrder then
      return aOrder < bOrder
    end
    return (a.name or '') < (b.name or '')
  end)

  return { nodes = results, count = #results }
end

-- Returns all allocated mastery nodes and the available effect options for each.
-- Output: { masteries: [ { nodeId, nodeName, allocatedEffect, availableEffects: [{effectId, stat}] } ] }
function M.get_mastery_options()
  if not build or not build.spec then
    return nil, 'build/spec not initialized'
  end
  local spec = build.spec
  local result = {}
  for nodeId, _ in pairs(spec.allocNodes or {}) do
    local node = spec.nodes[nodeId]
    if node and node.isMastery and node.masteryEffects then
      local allocated = spec.masterySelections and spec.masterySelections[nodeId]
      local available = {}
      -- node.masteryEffects is an array of { effect = <id>, stats = {...} }.
      for _, effectData in ipairs(node.masteryEffects) do
        local stat = effectData.stats and table.concat(effectData.stats, ', ') or tostring(effectData.effect)
        table.insert(available, { effectId = effectData.effect, stat = stat })
      end
      table.insert(result, {
        nodeId = nodeId,
        nodeName = node.name or 'Mastery',
        allocatedEffect = allocated,
        availableEffects = available,
      })
    end
  end
  return { masteries = result }
end


return M
