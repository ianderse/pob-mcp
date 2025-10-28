# Path of Building Lua Bridge Implementation Tasks

## Overview
Implementation of the PoB Lua Bridge to enable high-fidelity calculations and passive tree editing through the MCP server.

## Completed Tasks

### 1. Create src/pobLuaBridge.ts
- [x] PoBLuaStdioClient class for stdio communication
- [x] PoBLuaTcpClient class for TCP communication (GUI mode)
- [x] Methods: start(), stop(), ping(), loadBuildXml(), getStats(), getTree(), setTree()
- [x] Spawn luajit HeadlessWrapper.lua in the PoB fork directory
- [x] JSON line-based protocol (one JSON object per line)
- [x] Timeout handling (default 10s)
- [x] Process lifecycle management
- [x] Type interfaces for all API responses

### 2. Add MCP Tools in src/index.ts
- [x] lua_start - Start the PoB headless API process
- [x] lua_load_build - Load a build from XML into PoB session
- [x] lua_get_stats - Get computed stats from PoB calc engine
- [x] lua_get_tree - Get current passive tree data
- [x] lua_set_tree - Set class/ascendancy and allocated nodes, recalc
- [x] lua_stop - Stop the PoB headless API process

### 3. Add Feature Flag & Configuration
- [x] POB_LUA_ENABLED (default: false) - Gates registration of lua_* tools
- [x] POB_FORK_PATH (default: ~/Projects/pob-api-fork/src)
- [x] POB_CMD (default: luajit)
- [x] POB_ARGS (default: HeadlessWrapper.lua)
- [x] POB_TIMEOUT_MS (default: 10000)
- [x] POB_API_TCP (default: false) - Use TCP mode instead of stdio
- [x] POB_API_TCP_HOST (default: 127.0.0.1)
- [x] POB_API_TCP_PORT (default: 31337)

### 4. Integration
- [x] Create singleton PoBLuaApiClient in MCP server
- [x] Auto-start on first lua_* tool call (via ensureLuaClient)
- [x] Graceful fallback: XML-only tools remain unaffected if bridge fails
- [x] Clear error messages (not stack traces)
- [x] Tool registration only when POB_LUA_ENABLED=true

### 5. Error Handling
- [x] Startup failure: Clear error, suggest prerequisites (luajit installation, fork path)
- [x] Request timeouts: Kill process, report error, allow retry
- [x] Invalid inputs: Validate before calling bridge
- [x] Process exits: Surface error with exit code, allow restart
- [x] Helpful error messages for common issues (ENOENT, EACCES, connection failures)

## Technical Implementation Details

### Architecture
- **Stdio Mode**: Spawns luajit process with stdio pipes for communication
- **TCP Mode**: Connects to PoB GUI with embedded TCP server
- **Protocol**: Line-buffered JSON (one JSON object per line)
- **State Management**: Singleton client instance per MCP server
- **Lifecycle**: Auto-start on demand, cleanup on SIGINT

### Key Files Modified
- `/Users/ianderse/Projects/pob-mcp-server/src/pobLuaBridge.ts` - Bridge implementation
- `/Users/ianderse/Projects/pob-mcp-server/src/index.ts` - MCP tool integration

### Success Criteria
- [x] Code compiles with TypeScript (npm run build)
- [x] lua_* tools registered when POB_LUA_ENABLED=true
- [x] Can spawn luajit process and communicate
- [x] JSON protocol works (ping, load_build_xml, get_stats, get_tree, set_tree)
- [x] Graceful degradation when disabled
- [x] Clear error messages for common failure scenarios

## Next Steps / Future Enhancements
- [ ] Add unit tests for bridge communication
- [ ] Add integration tests with actual PoB fork
- [ ] Implement lua_calc_with for what-if scenarios
- [ ] Add getBuildInfo() tool for build metadata
- [ ] Document environment variable setup in README
- [ ] Add example usage documentation

## Notes
- Bridge is feature-gated and disabled by default
- Existing XML-only tools continue to work regardless of bridge status
- Error messages guide users through prerequisite installation
- Both stdio (headless) and TCP (GUI) modes are supported
