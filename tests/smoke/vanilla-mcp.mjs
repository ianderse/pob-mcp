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
try {
  await request('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'vanilla-smoke', version: '1.0' } });
  notify('notifications/initialized', {});
  const listed = await request('tools/list', {});
  const names = new Set(listed.result.tools.map((tool) => tool.name));
  for (const name of ['lua_start', 'lua_stop', 'lua_load_build', 'lua_get_stats', 'lua_get_tree', 'lua_get_build_info']) {
    if (!names.has(name)) throw new Error(`missing vanilla MCP tool: ${name}`);
  }
  if (names.has('lua_set_tree') || names.has('add_item')) throw new Error('vanilla mode advertised an unsupported mutation');
  for (const [name, args] of [['lua_start', {}], ['lua_load_build', { build_name: 'example.xml' }], ['lua_get_stats', {}], ['lua_get_tree', {}], ['lua_get_build_info', {}]]) {
    const response = await request('tools/call', { name, arguments: args });
    if (response.error || response.result?.isError) throw new Error(`${name} failed: ${JSON.stringify(response.error ?? response.result)}`);
  }
  console.log('vanilla MCP passed: load, stats, tree, and build info all succeeded');
} finally {
  child.kill();
  await rm(buildsDir, { recursive: true, force: true });
}
