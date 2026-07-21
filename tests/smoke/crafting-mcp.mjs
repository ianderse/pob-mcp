// Opt-in live MCP smoke test for crafting advice data sources.
// Usage: npm run build && npm run test:smoke:crafting
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const child = spawn('node', [resolve('build/index.js')], {
  env: { ...process.env, POB_LUA_ENABLED: 'true' },
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

try {
  await request('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'crafting-smoke', version: '1.0' } });
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }) + '\n');
  const listed = await request('tools/list', {});
  if (!listed.result.tools.some((tool) => tool.name === 'suggest_crafting')) throw new Error('suggest_crafting was not advertised with the Lua integration enabled');
  const response = await request('tools/call', { name: 'suggest_crafting', arguments: {
    slot: 'helmet', base: 'Hubris Circlet', desired_mods: ['+# to maximum Energy Shield'], ilvl: 84, budget: 'medium', league: 'Standard',
  } });
  if (response.error || response.result?.isError) throw new Error(`suggest_crafting failed: ${JSON.stringify(response.error ?? response.result)}`);
  const text = response.result?.content?.[0]?.text || '';
  if (!text.includes('=== Crafting Advisor: Hubris Circlet (helmet) ===') || text.includes('Could not fetch poedb data')) {
    throw new Error(`crafting advice did not include live base-mod data: ${text}`);
  }
  console.log('crafting MCP passed: tool discovery plus live poe.ninja and PoEDB-backed crafting advice succeeded');
} finally {
  child.kill();
}
