# PoB Headless Bridge Plan

This document outlines how we will integrate the forked Path of Building (PoB) headless API into this MCP server to power high‑fidelity calculations and live tree edits.

## Overview
- Goal: Use the forked PoB headless API to load builds, compute stats, and edit passive trees from MCP tools.
- Fork location: `~/Projects/pob-api-fork` (API server runs from `~/Projects/pob-api-fork/src`).
- Transport: stdio JSON lines (one line per request/response), long‑lived process.
- Bridge: `src/pobLuaBridge.ts` spawns and talks to the PoB API.
- Rollout: Feature‑flagged; graceful fallback to current XML‑only analysis if headless is unavailable.

## Architecture
- Process model: One long‑lived PoB Lua process per MCP server instance.
  - Start: On first “lua_*” tool call (or explicit `lua_start`).
  - Stop: On MCP shutdown (or explicit `lua_stop`).
- Node bridge (already added): `src/pobLuaBridge.ts`
  - Spawns `luajit HeadlessWrapper.lua` in `~/Projects/pob-api-fork/src` with `POB_API_STDIO=1`.
  - Methods: `start()`, `stop()`, `ping()`, `loadBuildXml()`, `getStats()`, `getTree()`, `setTree()`.
- Fork API (implemented): `load_build_xml`, `get_stats`, `get_tree`, `set_tree`, `quit`.

## MCP Tools (to add)
Expose atomic tools that map to the PoB API. Names prefixed `lua_` to avoid confusion with XML‑only tools.

- `lua_start`
  - Description: Start the PoB headless API process (no‑op if already running).
  - Input: `{}`
  - Output: status text.

- `lua_load_build`
  - Description: Load a PoB build from raw XML into the headless PoB session.
  - Input: `{ build_xml: string, name?: string }`
  - Output: status text.

- `lua_get_stats`
  - Description: Return computed stats from PoB calc engine.
  - Input: `{ fields?: string[] } // optional field whitelist`
  - Output: `{ stats: Record<string, number|string> }`

- `lua_get_tree`
  - Description: Return current passive tree data.
  - Input: `{}`
  - Output: `{ treeVersion, classId, ascendClassId, secondaryAscendClassId, nodes: number[], masteryEffects: Record<number,number> }`

- `lua_set_tree`
  - Description: Set class/ascendancy and allocated nodes (and mastery selections), then recalc.
  - Input: `{ classId: number, ascendClassId: number, secondaryAscendClassId?: number, nodes: number[], masteryEffects?: Record<number,number>, treeVersion?: string }`
  - Output: `{ tree: ... } // same shape as get_tree`

- `lua_stop`
  - Description: Stop the PoB headless API process.
  - Input: `{}`
  - Output: status text.

Notes
- We can later add `lua_calc_with` for what‑if diffs without persisting tree changes using PoB’s `GetMiscCalculator()`.

## Integration Steps
1. Add feature flag
   - Env `POB_LUA_ENABLED=true` gates registration of `lua_*` tools.
   - Default: disabled; XML‑only tools remain unaffected.

2. Wire lifecycle
   - Add a singleton `PoBLuaApiClient` in MCP server scope.
   - `lua_start`: calls `client.start()`.
   - `lua_stop`: calls `client.stop()`.
   - All other `lua_*` tools: auto‑start if not started.

3. Implement tools (src/index.ts)
   - Register new tools in `ListToolsRequestSchema` handler when `POB_LUA_ENABLED`.
   - Add a `CallToolRequestSchema` handler branch that:
     - Validates input
     - Calls bridge methods
     - Formats text responses consistently with existing tools
     - Wraps errors with actionable messages, not stack traces

4. Add configuration
   - Env vars (with defaults):
     - `POB_LUA_ENABLED` (default: false)
     - `POB_FORK_PATH` (default: `~/Projects/pob-api-fork/src`)
     - `POB_CMD` (default: `luajit`)
     - `POB_ARGS` (default: `HeadlessWrapper.lua`)
     - `POB_TIMEOUT_MS` (default: `10000`)

5. Update docs
   - README: add “Headless PoB Integration” section with prerequisites and usage.
   - API_README link: refer to `~/Projects/pob-api-fork/API_README.md` for fork usage.

## Error Handling & Fallbacks
- Startup failure (binary missing, bad path):
  - Return clear error and suggest `brew install luajit` or verify `POB_FORK_PATH`.
  - Keep XML‑only tools available; do not crash MCP.
- Request timeouts:
  - Per‑request timeout (default 10s). On timeout: kill process, report error, advise retry.
- Invalid inputs:
  - Validate JSON schema before calling bridge; return explicit field errors.
- Process exits mid‑request:
  - Surface a succinct error with exit code; allow auto‑restart on next call.

## Security & Performance
- Local only: process runs on user’s machine; no external network calls required.
- Resource usage: keep a single hot process; teardown on MCP exit.
- Large XML: avoid logging full XML; truncate or hash for logs.

## Testing Plan
- Unit
  - Bridge pings and banner parsing
  - Timeouts and restart behavior
- Integration
  - `lua_start` → `lua_load_build` (sample XML) → `lua_get_stats`
  - `lua_get_tree` → `lua_set_tree` → `lua_get_stats` (ensure values change)
  - `lua_stop` idempotency
- Manual
  - Verify on macOS with `luajit` installed
  - Verify graceful fallback when `POB_LUA_ENABLED` is false

## Rollout
- Phase 1 (opt‑in): ship the tools behind `POB_LUA_ENABLED`; keep defaults off.
- Phase 2 (default‑on beta): enable by default for users with validated `luajit` and fork path.
- Phase 3: expand to what‑if diffs (`lua_calc_with`) and gem/item edits.

## Future Enhancements
- What‑if APIs: temporary allocation testing without persisting changes.
- Items/skills ops: structured import and calculation.
- Stats contract: publish a curated, stable schema for MCP consumers.
- PoB fork collaboration: upstream an official headless API mode.

## Prerequisites
- `luajit` in PATH (`brew install luajit` on macOS).
- PoB fork present at `~/Projects/pob-api-fork` (with the headless API scaffold).
- Set `POB_LUA_ENABLED=true` to expose the new tools.

