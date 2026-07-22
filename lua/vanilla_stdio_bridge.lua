-- JSON-lines adapter for an unmodified PathOfBuildingCommunity checkout.
-- Run with cwd set to its src/ directory: luajit /path/to/vanilla_stdio_bridge.lua
local json = require('dkjson')

-- The upstream wrapper initializes PoB and exposes loadBuildFromXML plus `build`.
dofile('HeadlessWrapper.lua')

local function reply(value)
  io.write(json.encode(value), '\n')
  io.flush()
end

local function output()
  if not build or not build.calcsTab then return nil, 'build not initialized' end
  if build.calcsTab.BuildOutput then build.calcsTab:BuildOutput() end
  return build.calcsTab.mainOutput or {}, nil
end

local function stats(params)
  local out, err = output()
  if err then return { ok = false, error = err } end
  local fields = params.fields or { 'Life', 'EnergyShield', 'Armour', 'Evasion', 'FireResist', 'ColdResist', 'LightningResist', 'ChaosResist', 'TotalDPS', 'CombinedDPS', 'TotalEHP' }
  local result = {}
  for _, key in ipairs(fields) do if out[key] ~= nil then result[key] = out[key] end end
  return { ok = true, stats = result }
end

local function tree()
  if not build or not build.spec then return { ok = false, error = 'build/spec not initialized' } end
  local spec, nodes = build.spec, {}
  for id in pairs(spec.allocNodes or {}) do table.insert(nodes, tonumber(id) or id) end
  table.sort(nodes)
  return { ok = true, tree = { treeVersion = spec.treeVersion, classId = tonumber(spec.curClassId) or 0, ascendClassId = tonumber(spec.curAscendClassId) or 0, secondaryAscendClassId = tonumber(spec.curSecondaryAscendClassId) or 0, nodes = nodes, masteryEffects = spec.masterySelections or {} } }
end

local function items()
  if not build or not build.itemsTab then return { ok = false, error = 'items not initialized' } end
  local tab, result, seen = build.itemsTab, {}, {}
  local function add(slotName)
    if seen[slotName] then return end; seen[slotName] = true
    local control = tab.slots and tab.slots[slotName]; if not control then return end
    local id = control.selItemId or 0; local entry = { slot = slotName, id = id }
    local item = id > 0 and tab.items[id] or nil
    if item then entry.name = item.name; entry.baseName = item.baseName; entry.type = item.type; entry.rarity = item.rarity; entry.raw = item.raw end
    local active = tab.activeItemSet and tab.activeItemSet[slotName]
    if active and active.active ~= nil then entry.active = active.active and true or false end
    table.insert(result, entry)
  end
  for _, slot in ipairs(tab.orderedSlots or {}) do if slot.slotName then add(slot.slotName) end end
  for slotName in pairs(tab.slots or {}) do add(slotName) end
  return { ok = true, items = result }
end

local function skills()
  if not build or not build.skillsTab then return { ok = false, error = 'skills not initialized' } end
  local groups = {}
  for index, group in ipairs(build.skillsTab.socketGroupList or {}) do
    local gems, names = {}, {}
    for gemIndex, gem in ipairs(group.gemList or {}) do table.insert(gems, { index = gemIndex, name = gem.nameSpec or gem.name or '', level = gem.level or 1, quality = gem.quality or 0, enabled = gem.enabled ~= false }) end
    for _, effect in ipairs(group.displaySkillList or {}) do if effect.activeEffect and effect.activeEffect.grantedEffect then table.insert(names, effect.activeEffect.grantedEffect.name) end end
    table.insert(groups, { index = index, label = group.label, slot = group.slot, enabled = group.enabled, includeInFullDPS = group.includeInFullDPS, mainActiveSkill = group.mainActiveSkill, skills = names, gems = gems })
  end
  return { ok = true, skills = { mainSocketGroup = build.mainSocketGroup, groups = groups } }
end

local function set_tree(params)
  if not build or not build.spec then return { ok = false, error = 'build/spec not initialized' } end
  if type(params.nodes) ~= 'table' then return { ok = false, error = 'nodes must be an array' } end
  local nodes = {}; for _, id in ipairs(params.nodes) do table.insert(nodes, tonumber(id)) end
  local ok, err = pcall(build.spec.ImportFromNodeList, build.spec, tonumber(params.classId) or 0, tonumber(params.ascendClassId) or 0, tonumber(params.secondaryAscendClassId) or 0, nodes, {}, params.masteryEffects or {}, params.treeVersion)
  if not ok then return { ok = false, error = 'set_tree failed: ' .. tostring(err) } end
  output(); return tree()
end

-- Evaluate upstream PoB's native anoint simulation without altering the loaded build.
-- This follows NotableDBControl's MiscCalculator approach, while restoring the UI
-- selection even if a candidate calculation fails.
local function evaluate_anoint_candidates(params)
  if not build or not build.itemsTab or not build.spec or not build.spec.tree then return { ok = false, error = 'build not initialized' } end
  local slotName = params.slot
  if type(slotName) ~= 'string' or slotName == '' then return { ok = false, error = 'slot is required (for example, Amulet)' } end
  local control = build.itemsTab.slots and build.itemsTab.slots[slotName]
  local item = control and control.selItemId and build.itemsTab.items[control.selItemId] or nil
  if not item then return { ok = false, error = 'no equipped item in ' .. slotName } end
  if slotName ~= 'Amulet' and not item.canBeAnointed then return { ok = false, error = slotName .. ' is not an anointable item slot' } end

  local tab, previousItem, previousEnchantSlot = build.itemsTab, build.itemsTab.displayItem, build.itemsTab.anointEnchantSlot
  local ok, result = pcall(function()
    tab:SetDisplayItem(item)
    tab.anointEnchantSlot = 1
    local calc = build.calcsTab:GetMiscCalculator()
    local repSlotName = item.base and item.base.type or slotName
    local base = calc({ repSlotName = repSlotName, repItem = tab:anointItem(nil) })
    local baseDps = tonumber(base.CombinedDPS or base.TotalDPS or 0) or 0
    local baseEhp = tonumber(base.TotalEHP or 0) or 0
    local candidates, evaluated, skipped = {}, 0, 0
    for id, node in pairs(build.spec.tree.nodes or {}) do
      if node.recipe and node.dn and node.modKey ~= '' and not build.spec.allocNodes[id] then
        local candidateOk, output = pcall(calc, { repSlotName = repSlotName, repItem = tab:anointItem(node) })
        if candidateOk and output then
          local dps = (tonumber(output.CombinedDPS or output.TotalDPS or 0) or 0) - baseDps
          local ehp = (tonumber(output.TotalEHP or 0) or 0) - baseEhp
          local focus = params.focus or 'both'
          local score = focus == 'dps' and dps or (focus == 'defence' and ehp or (dps / math.max(baseDps, 1) + 0.5 * ehp / math.max(baseEhp, 1)))
          local recipe = {}; for _, oil in ipairs(node.recipe or {}) do table.insert(recipe, tostring(oil)) end
          table.insert(candidates, { nodeId = tonumber(id) or id, name = node.dn, dpsDelta = dps, ehpDelta = ehp, score = score, recipe = recipe })
          evaluated = evaluated + 1
        else skipped = skipped + 1 end
      end
    end
    table.sort(candidates, function(a, b) return a.score > b.score end)
    local limit = math.min(math.max(tonumber(params.limit) or 50, 1), 500)
    while #candidates > limit do table.remove(candidates) end
    return { ok = true, candidates = candidates, base = { CombinedDPS = baseDps, TotalEHP = baseEhp }, evaluated = evaluated, skipped = skipped, slot = slotName, baseType = item.baseName or repSlotName, focus = params.focus or 'both' }
  end)
  tab:SetDisplayItem(previousItem); tab.anointEnchantSlot = previousEnchantSlot
  if not ok then return { ok = false, error = 'anoint evaluation failed: ' .. tostring(result) } end
  return result
end

-- Drive upstream TradeQueryGenerator directly, avoiding its interactive dialog.
-- The generator is a normal PoB class; its coroutine is advanced synchronously
-- here and the generated JSON is returned to Node for the actual Trade API call.
local function generate_weighted_trade_query(params)
  if not build or not build.itemsTab or not build.itemsTab.tradeQuery then return { ok = false, error = 'build/items not initialized' } end
  local slotName = params.slot
  local slot = type(slotName) == 'string' and build.itemsTab.slots and build.itemsTab.slots[slotName] or nil
  if not slot then return { ok = false, error = 'unknown equipment slot: ' .. tostring(slotName) } end
  local options = params.options or {}
  options.includeMirrored = options.includeMirrored == true
  options.includeCorrupted = options.includeCorrupted ~= false
  options.includeScourge = options.includeScourge == true
  options.includeEldritch = options.includeEldritch == true
  options.influence1 = tonumber(options.influence1) or 1
  options.influence2 = tonumber(options.influence2) or 1
  options.jewelType = options.jewelType or 'Any'
  options.statWeights = options.statWeights or build.itemsTab.tradeQuery.statSortSelectionList
  if not options.statWeights or #options.statWeights == 0 then options.statWeights = { { label = 'Full DPS', stat = 'FullDPS', weightMult = 1.0 }, { label = 'Effective Hit Pool', stat = 'TotalEHP', weightMult = 0.5 } } end
  local ok, result = pcall(function()
    local generator = new('TradeQueryGenerator', build.itemsTab.tradeQuery)
    local query, warning
    generator.requesterCallback = function(_, generated, err) query, warning = generated, err end
    generator.requesterContext = {}
    generator.tradeTypeIndex = 2 -- available listings, matching the MCP default
    generator:StartQuery(slot, options)
    local frames = 0
    while generator.calcContext and generator.calcContext.co and frames < 100000 do generator:OnFrame(); frames = frames + 1 end
    if generator.calcContext and generator.calcContext.co then error('TradeQueryGenerator did not complete after 100000 frames') end
    if not query then error(warning or 'PoB generated no trade query') end
    return { ok = true, query = query, warning = warning, frames = frames }
  end)
  if not ok then return { ok = false, error = 'weighted trade query failed: ' .. tostring(result) } end
  return result
end

reply({ ok = true, ready = true, version = { adapter = 'vanilla-stdio-v1' } })
for line in io.lines() do
  local request = json.decode(line)
  local action, params = request and request.action, request and request.params or {}
  if action == 'ping' then reply({ ok = true, pong = true })
  elseif action == 'load_build_xml' then
    local ok, err = pcall(loadBuildFromXML, params.xml, params.name)
    reply(ok and { ok = true } or { ok = false, error = tostring(err) })
  elseif action == 'get_stats' then reply(stats(params))
  elseif action == 'get_tree' then reply(tree())
  elseif action == 'set_tree' then reply(set_tree(params))
  elseif action == 'get_items' then reply(items())
  elseif action == 'get_skills' then reply(skills())
  elseif action == 'evaluate_anoint_candidates' then reply(evaluate_anoint_candidates(params))
  elseif action == 'generate_weighted_trade_query' then reply(generate_weighted_trade_query(params))
  elseif action == 'get_capabilities' then reply({ ok = true, capabilities = { mode = 'vanilla', adapter = 'vanilla-stdio-v1', actions = { 'ping', 'get_capabilities', 'load_build_xml', 'get_stats', 'get_tree', 'set_tree', 'get_items', 'get_skills', 'get_build_info', 'evaluate_anoint_candidates', 'generate_weighted_trade_query', 'quit' } } })
  elseif action == 'get_build_info' then
    if not build then reply({ ok = false, error = 'build not initialized' }) else reply({ ok = true, info = { name = build.buildName, level = build.characterLevel, className = build.spec and build.spec.curClassName, ascendClassName = build.spec and build.spec.curAscendClassName, treeVersion = build.targetVersion } }) end
  elseif action == 'quit' then reply({ ok = true, quit = true }); break
  else reply({ ok = false, error = 'unsupported by vanilla adapter: ' .. tostring(action) }) end
end
