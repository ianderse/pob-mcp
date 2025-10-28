-- API/TcpServer.lua
-- Lightweight TCP JSON API server embedded into the GUI process.
-- Uses LuaSocket; listens on 127.0.0.1:POB_API_TCP_PORT (default 31337).

local ok_socket, socket = pcall(require, 'socket')
if not ok_socket then
  ConPrintf('[API/TcpServer] LuaSocket not available; TCP API disabled')
  return
end

-- JSON
local ok_json, json = pcall(require, 'dkjson')
if not ok_json then
  local p = '../runtime/lua/dkjson.lua'
  local ok2, mod = pcall(dofile, p)
  if ok2 then json = mod else error('[API/TcpServer] dkjson not found') end
end

local function j_encode(tbl) return json.encode(tbl, { indent = false }) end
local function j_decode(txt) return json.decode(txt) end

local BuildOps = dofile('API/BuildOps.lua')

local handlers = {}
handlers.ping = function(params) return { ok = true, pong = true } end
handlers.version = function(params)
  return { ok = true, version = {
    number = _G.launch and launch.versionNumber or '?',
    branch = _G.launch and launch.versionBranch or '?',
    platform = _G.launch and launch.versionPlatform or '?',
  }}
end
handlers.load_build_xml = function(params)
  if not params or type(params.xml) ~= 'string' then return { ok = false, error = 'missing xml' } end
  local name = (params.name and tostring(params.name)) or 'API Build'
  if not _G.loadBuildFromXML then return { ok = false, error = 'headless wrapper not initialized' } end
  _G.loadBuildFromXML(params.xml, name)
  return { ok = true, build_id = 1 }
end
handlers.get_stats = function(params)
  local fields = params and params.fields or nil
  local stats, err = BuildOps.export_stats(fields)
  if not stats then return { ok = false, error = err or 'failed to get stats' } end
  return { ok = true, stats = stats }
end
handlers.get_tree = function(params)
  local tree, err = BuildOps.get_tree()
  if not tree then return { ok = false, error = err or 'failed to get tree' } end
  return { ok = true, tree = tree }
end
handlers.set_tree = function(params)
  local ok2, err = BuildOps.set_tree(params or {})
  if not ok2 then return { ok = false, error = err or 'failed to set tree' } end
  local tree = BuildOps.get_tree()
  return { ok = true, tree = tree }
end
handlers.update_tree_delta = function(params)
  local ok2, err = BuildOps.update_tree_delta(params or {})
  if not ok2 then return { ok = false, error = err or 'failed to update tree' } end
  local tree = BuildOps.get_tree()
  return { ok = true, tree = tree }
end
handlers.calc_with = function(params)
  local out, base = BuildOps.calc_with(params or {})
  if not out then return { ok = false, error = base or 'failed to calc' } end
  return { ok = true, output = out }
end
handlers.export_build_xml = function(params)
  local xml, err = BuildOps.export_build_xml()
  if not xml then return { ok = false, error = err or 'failed to export xml' } end
  return { ok = true, xml = xml }
end
handlers.get_build_info = function(params)
  local info, err = BuildOps.get_build_info()
  if not info then return { ok = false, error = err or 'failed to get info' } end
  return { ok = true, info = info }
end
handlers.set_level = function(params)
  if not params or params.level == nil then return { ok = false, error = 'missing level' } end
  local ok2, err = BuildOps.set_level(params.level)
  if not ok2 then return { ok = false, error = err or 'failed to set level' } end
  return { ok = true }
end
handlers.get_config = function(params)
  local cfg, err = BuildOps.get_config()
  if not cfg then return { ok = false, error = err or 'failed to get config' } end
  return { ok = true, config = cfg }
end
handlers.set_config = function(params)
  local ok2, err = BuildOps.set_config(params or {})
  if not ok2 then return { ok = false, error = err or 'failed to set config' } end
  local cfg = BuildOps.get_config()
  return { ok = true, config = cfg }
end

-- Server state
local srv
local clients = {}
local buffers = {}

local function sendLine(client, tbl)
  local ok, msg = pcall(j_encode, tbl)
  if not ok then msg = '{"ok":false,"error":"encode error"}' end
  client:send(msg .. "\n")
end

local function handleLine(client, line)
  local ok, req = pcall(j_decode, line)
  if not ok or type(req) ~= 'table' then
    sendLine(client, { ok = false, error = 'invalid json' })
    return
  end
  local action = req.action
  local params = req.params or {}
  local handler = handlers[action]
  if not handler then
    sendLine(client, { ok = false, error = 'unknown action: ' .. tostring(action) })
    return
  end
  local ok2, res = pcall(handler, params)
  if not ok2 then
    sendLine(client, { ok = false, error = 'exception: ' .. tostring(res) })
  else
    sendLine(client, res)
  end
end

function API_TCP_INIT()
  local port = tonumber(os.getenv('POB_API_TCP_PORT') or '31337') or 31337
  srv = assert(socket.tcp())
  assert(srv:setoption('reuseaddr', true))
  assert(srv:bind('127.0.0.1', port))
  assert(srv:listen(16))
  srv:settimeout(0)
  ConPrintf('[API/TcpServer] Listening on 127.0.0.1:%d', port)
end

function API_TCP_TICK()
  -- accept new client(s)
  local client = srv and srv:accept()
  while client do
    client:settimeout(0)
    table.insert(clients, client)
    buffers[client] = ''
    sendLine(client, { ok = true, ready = true, version = { number = launch.versionNumber, branch = launch.versionBranch, platform = launch.versionPlatform } })
    client = srv:accept()
  end

  if #clients == 0 then return end
  -- poll readable
  local readable = socket.select(clients, nil, 0)
  for _, c in ipairs(readable) do
    local line, err, partial = c:receive('*l')
    if line then
      handleLine(c, line)
    elseif err == 'closed' then
      -- cleanup
      buffers[c] = nil
      for i, cc in ipairs(clients) do if cc == c then table.remove(clients, i); break end end
    end
  end
end

