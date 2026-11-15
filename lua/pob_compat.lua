-- What differs between the PoB versions and LuaJIT builds this server runs on,
-- kept in one place for every Lua entry point that loads PoB.

local M = {}

-- PoB's launcher files open with a `#@` line that PoB's own runtime skips.
-- LuaJIT since c41d727d (Oct 2026) parses a leading `#` as a line number
-- directive and skips only `#!`, so the header becomes a comment here. The
-- replacement keeps the line count, so error line numbers stay correct.
-- Call before the first dofile('HeadlessWrapper.lua').
function M.accept_launcher_headers()
  local loadfileWithHashLine = loadfile
  local dofileWithHashLine = dofile

  function loadfile(path)
    if path == nil then return loadfileWithHashLine() end
    local file = io.open(path, 'rb')
    if not file then return nil, 'cannot open ' .. path end
    local source = file:read('*a')
    file:close()
    return loadstring((source:gsub('^#', '--', 1)), '@' .. path)
  end

  function dofile(path)
    if path == nil then return dofileWithHashLine() end
    return assert(loadfile(path))()
  end
end

-- PoB 2.67 and older construct with new("Item", raw). PoB dev (3.30) splits
-- this into new("Item"):Item(raw) and its new() takes no constructor
-- arguments, so only the old new() is variadic.
function M.construct(className, ...)
  if debug.getinfo(new, 'u').isvararg then return new(className, ...) end
  local object = new(className)
  return object[className](object, ...)
end

return M
