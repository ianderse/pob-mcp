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
  elseif action == 'get_build_info' then
    if not build then reply({ ok = false, error = 'build not initialized' }) else reply({ ok = true, info = { name = build.buildName, level = build.characterLevel, className = build.spec and build.spec.curClassName, ascendClassName = build.spec and build.spec.curAscendClassName, treeVersion = build.targetVersion } }) end
  elseif action == 'quit' then reply({ ok = true, quit = true }); break
  else reply({ ok = false, error = 'unsupported by vanilla adapter: ' .. tostring(action) }) end
end
