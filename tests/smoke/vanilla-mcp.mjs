// End-to-end MCP smoke test against a vanilla PoB checkout.
// Usage: POB_FORK_PATH=/path/to/PathOfBuilding/src node tests/smoke/vanilla-mcp.mjs
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

if (!process.env.POB_FORK_PATH) throw new Error('POB_FORK_PATH must point to vanilla PoB src.');
const buildsDir = await mkdtemp(join(tmpdir(), 'pob-mcp-vanilla-'));
await cp(resolve('example-build.xml'), join(buildsDir, 'example.xml'));
const child = spawn('node', [resolve('build/index.js')], {
  env: { ...process.env, POB_DIRECTORY: buildsDir, POB_LUA_ENABLED: 'true', POB_VANILLA: 'true' },
  stdio: ['pipe', 'pipe', 'pipe'],
});
let buffer = ''; let nextId = 1; const pending = new Map();
child.stdout.setEncoding('utf8');
child.stdout.on('data', (chunk) => {
  buffer += chunk;
  for (;;) {
    const newline = buffer.indexOf('\n'); if (newline < 0) return;
    const message = JSON.parse(buffer.slice(0, newline)); buffer = buffer.slice(newline + 1);
    pending.get(message.id)?.(message); pending.delete(message.id);
  }
});
const request = (method, params) => new Promise((resolveRequest, reject) => {
  const id = nextId++; pending.set(id, resolveRequest);
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  setTimeout(() => { if (pending.delete(id)) reject(new Error(`timed out: ${method}`)); }, 60_000);
});
const notify = (method, params) => child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
let snapshotCount = 0;
try {
  await request('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'vanilla-smoke', version: '1.0' } });
  notify('notifications/initialized', {});
  const listed = await request('tools/list', {});
  const names = new Set(listed.result.tools.map((tool) => tool.name));
  const rejected = await request('tools/call', { name: 'not_a_real_tool', arguments: {} });
  if (rejected.result?.isError !== true) throw new Error(`MCP errors must set isError: ${JSON.stringify(rejected)}`);
  const invalidChain = await request('tools/call', { name: 'calculate_trading_profit', arguments: { league: 'Standard', currency_chain: ['Chaos Orb'] } });
  if (invalidChain.result?.isError !== true) throw new Error(`handler errors must set isError: ${JSON.stringify(invalidChain)}`);
  for (const name of ['lua_get_capabilities', 'lua_get_build_snapshot', 'lua_start', 'lua_stop', 'lua_load_build', 'lua_get_stats', 'lua_get_tree', 'lua_set_tree', 'lua_get_build_info', 'get_equipped_items', 'get_skill_setup']) {
    if (!names.has(name)) throw new Error(`missing vanilla MCP tool: ${name}`);
  }
  for (const name of ['add_item', 'toggle_flask', 'set_config']) {
    if (names.has(name)) throw new Error(`vanilla mode advertised an unsupported mutation: ${name}`);
  }
  for (const [name, args] of [
    ['lua_start', {}],
    ['lua_get_capabilities', {}],
    ['lua_load_build', { build_name: 'example.xml' }],
    ['lua_get_build_snapshot', {}],
    ['lua_get_stats', {}],
    ['get_equipped_items', {}],
    ['get_skill_setup', { main_only: false }],
    ['lua_get_tree', { include_node_ids: true }],
    ['lua_set_tree', { classId: 2, ascendClassId: 0, nodes: [] }],
    ['lua_get_build_snapshot', {}],
    ['lua_set_tree', { classId: 2, ascendClassId: 1, nodes: ['50459', '58427'] }],
    ['lua_get_build_snapshot', {}],
    ['lua_get_build_info', {}],
  ]) {
    const response = await request('tools/call', { name, arguments: args });
    if (response.error || response.result?.isError) throw new Error(`${name} failed: ${JSON.stringify(response.error ?? response.result)}`);
    if (name === 'lua_get_build_snapshot') {
      const text = response.result?.content?.[0]?.text || '';
      if (!text.includes('Current PoB Build Snapshot') || !text.includes('Equipped Items') || !text.includes('Skills')) {
        throw new Error(`lua_get_build_snapshot returned an incomplete response: ${text}`);
      }
      const expectedNodes = [2, 1, 2][snapshotCount++];
      if (!text.includes(`Tree: ${expectedNodes} allocated nodes`)) {
        throw new Error(`snapshot did not report the expected passive-tree state: ${text}`);
      }
    }
  }
  console.log('vanilla MCP passed: capabilities, snapshot, load, stats, items, skills, tree mutation/restore, and build info all succeeded');
} finally {
  child.kill();
  await rm(buildsDir, { recursive: true, force: true });
}
