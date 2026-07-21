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
  local ok, err = pcall(build.spec.ImportFromNodeList, build.spec, nil, tonumber(params.classId) or 0, tonumber(params.ascendClassId) or 0, tonumber(params.secondaryAscendClassId) or 0, nodes, {}, params.masteryEffects or {}, params.treeVersion)
  if not ok then return { ok = false, error = 'set_tree failed: ' .. tostring(err) } end
  output(); return tree()
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
  elseif action == 'get_capabilities' then reply({ ok = true, capabilities = { mode = 'vanilla', adapter = 'vanilla-stdio-v1', actions = { 'ping', 'get_capabilities', 'load_build_xml', 'get_stats', 'get_tree', 'set_tree', 'get_items', 'get_skills', 'get_build_info', 'quit' } } })
  elseif action == 'get_build_info' then
    if not build then reply({ ok = false, error = 'build not initialized' }) else reply({ ok = true, info = { name = build.buildName, level = build.characterLevel, className = build.spec and build.spec.curClassName, ascendClassName = build.spec and build.spec.curAscendClassName, treeVersion = build.targetVersion } }) end
  elseif action == 'quit' then reply({ ok = true, quit = true }); break
  else reply({ ok = false, error = 'unsupported by vanilla adapter: ' .. tostring(action) }) end
end
