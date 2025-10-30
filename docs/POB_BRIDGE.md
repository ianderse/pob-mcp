# PoB Headless Bridge Plan

This document outlines how we will integrate the forked Path of Building (PoB) headless API into this MCP server to power high‑fidelity calculations and live tree edits.

## Overview
- Goal: Use the forked PoB headless API to load builds, compute stats, and edit passive trees from MCP tools.
- Fork location: `~/Projects/pob-api-fork` (API server runs from `~/Projects/pob-api-fork/src`).
- Transport: stdio JSON lines (one line per request/response), long‑lived process. Optional TCP (embedded in GUI) on 127.0.0.1:POB_API_TCP_PORT.
- Bridge: `src/pobLuaBridge.ts` spawns and talks to the PoB API.
- Rollout: Feature‑flagged; graceful fallback to current XML‑only analysis if headless is unavailable.

## Architecture
- Process model: One long‑lived PoB Lua process per MCP server instance (stdio), or embedded in the GUI (TCP).
  - Start: On first “lua_*” tool call (or explicit `lua_start`).
  - Stop: On MCP shutdown (or explicit `lua_stop`).
- Node bridge (already added): `src/pobLuaBridge.ts`
  - Spawns `luajit HeadlessWrapper.lua` in `~/Projects/pob-api-fork/src` with `POB_API_STDIO=1`.
  - Methods: `start()`, `stop()`, `ping()`, `loadBuildXml()`, `getStats()`, `getTree()`, `setTree()`.
- Fork API (implemented): `load_build_xml`, `get_stats`, `get_tree`, `set_tree`, `quit`.

TCP (GUI) mode
- Enable with `POB_API_TCP=1` (and optional `POB_API_TCP_PORT`, default 31337) when launching PoB GUI.
- Server is embedded via `src/API/TcpServer.lua` and pumped from `Modules/Main.lua` each frame.
- Same JSON actions as stdio server (ping, load_build_xml, get_stats, get_tree, set_tree, update_tree_delta, calc_with, export_build_xml, get_build_info, set_level, get_config, set_config).

### Enabling TCP mode (Windows GUI)
- Start PoB from a PowerShell where the env var is set:
  ```powershell
  # Optional: pick a custom port
  $env:POB_API_TCP_PORT = 31337
  # Required to enable the embedded TCP server
  $env:POB_API_TCP = 1
  & "C:\\Path\\To\\Path of Building\\Path of Building.exe"
  ```
- Binding: the server binds to `127.0.0.1` only (loopback). It is not reachable over LAN by design.
- Default port: `31337` unless overridden by `POB_API_TCP_PORT`.
- Ready banner: on connect, the first line is JSON like:
  ```json
  { "ok": true, "ready": true, "version": { "number": "x.y.z", "branch": "...", "platform": "..." } }
  ```

### Functional smoke tests (same Windows PC)
Run these while the PoB GUI is open (with a build loaded) and TCP mode enabled.

1) PowerShell using TcpClient
```powershell
$c = New-Object System.Net.Sockets.TcpClient("127.0.0.1", 31337)
$s = $c.GetStream()
$r = New-Object IO.StreamReader($s)
$w = New-Object IO.StreamWriter($s); $w.AutoFlush = $true

$banner = $r.ReadLine(); Write-Host "Banner: $banner"

$w.WriteLine('{"action":"ping"}')
$resp1 = $r.ReadLine(); Write-Host "Ping:   $resp1"

$w.WriteLine('{"action":"get_build_info"}')
$resp2 = $r.ReadLine(); Write-Host "Info:   $resp2"

$w.WriteLine('{"action":"get_stats","params":{"fields":["Life","EnergyShield","TotalDPS"]}}')
$resp3 = $r.ReadLine(); Write-Host "Stats:  $resp3"

$c.Close()
```

2) Node.js test (no extra deps)
```js
// save as tcp_test.js and run: node tcp_test.js
import net from 'node:net';

const host = '127.0.0.1', port = 31337;
const sock = net.createConnection({ host, port });
sock.setEncoding('utf8');

let buf = '';
sock.on('data', c => buf += c);

const readLine = () => new Promise((res, rej) => {
  const deadline = Date.now() + 5000;
  const tick = () => {
    const i = buf.indexOf('\n');
    if (i >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); res(line); return; }
    if (Date.now() > deadline) return rej(new Error('timeout'));
    setTimeout(tick, 10);
  };
  tick();
});

const send = obj => sock.write(JSON.stringify(obj) + '\n');

(async () => {
  const banner = await readLine(); console.log('Banner:', banner);
  send({ action: 'ping' });           console.log('Ping:', await readLine());
  send({ action: 'get_build_info' }); console.log('Info:', await readLine());
  send({ action: 'get_stats', params: { fields: ['Life','EnergyShield','TotalDPS'] } });
  console.log('Stats:', await readLine());
  sock.end();
})().catch(e => { console.error(e); try { sock.destroy(); } catch {} });
```

3) Optional mutation tests
- Change level (safe): `{"action":"set_level","params":{"level":90}}`
- Export XML: `{"action":"export_build_xml"}`
- Tree diff (changes current build): `{"action":"update_tree_delta","params":{"addNodes":[12345]}}` then `get_tree` to verify.

Notes
- `load_build_xml` may not be available in GUI TCP context; prefer interacting with the build currently open in the GUI.
- Actions supported in TCP mode include: `ping`, `version`, `get_build_info`, `get_stats`, `get_tree`, `update_tree_delta`, `calc_with`, `export_build_xml`, `set_level`, `get_config`, `set_config`.

### Diagnostics
- Port check (Windows): `Test-NetConnection localhost -Port 31337`
- Listener check (Windows): `netstat -ano | findstr :31337` then `Get-Process -Id <PID>`
- If the TCP test fails but PoB is running, verify the env vars were set in the same shell that launched PoB.

### Remote testing from macOS (SSH tunnel)
Because the server binds to `127.0.0.1` on the Windows PC, it is not reachable across the network. Use SSH port forwarding:
1) From macOS, create a tunnel to Windows (replace IP and user):
```bash
ssh -L 31337:127.0.0.1:31337 iande@192.168.x.x
```
2) On macOS, point your client to `127.0.0.1:31337` (traffic tunnels to Windows PoB).

Tip: You can also use the bundled Node client in this repo (`PoBLuaTcpClient` in `build/pobLuaBridge.js`):
```js
import { PoBLuaTcpClient } from './build/pobLuaBridge.js';
const api = new PoBLuaTcpClient({ host: '127.0.0.1', port: 31337 });
await api.start();
console.log('ping:', await api.ping());
console.log('info:', await api.getBuildInfo());
console.log('stats:', await api.getStats(['Life','EnergyShield','TotalDPS']));
await api.stop();
```

### Common issues
- Hostname resolution (SSH): On macOS, `ssh iande@IanPC` may fail if `IanPC` isn’t in DNS. Use the Windows IP or add an `/etc/hosts` entry.
- `TcpTestSucceeded: false`: Indicates nothing is listening on the tested port. Ensure PoB GUI was launched with `POB_API_TCP=1` and that you’re testing `localhost:31337` on the Windows machine (or via an SSH tunnel).
- Remote access: Changing `TcpServer.lua` to bind `0.0.0.0` would expose the port, but is not recommended. Prefer tunneling for safety.

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



Node TCP client
- Use `PoBLuaTcpClient` from `src/pobLuaBridge.ts` when talking to a live GUI instance:
  - `const api = new PoBLuaTcpClient({ host: '127.0.0.1', port: 31337 });`
  - `await api.start();`
  - Then call `loadBuildXml`, `getStats`, `getTree`, `setTree`, etc.
  - `await api.stop();`
