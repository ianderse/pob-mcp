// A JSON-RPC stdio client for the MCP smoke tests, so the transport lives in
// one place rather than once per test file.
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

/**
 * Spawn the built server and return { child, request, notify }.
 * `env` is merged over the parent environment; POB_LUA_ENABLED is on by default
 * because every caller so far drives the bridge.
 */
export function startMcpServer(env = {}) {
  const child = spawn('node', [resolve('build/index.js')], {
    env: { ...process.env, POB_LUA_ENABLED: 'true', ...env },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let buffer = '';
  let nextId = 1;
  const pending = new Map();

  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    for (;;) {
      const newline = buffer.indexOf('\n');
      if (newline < 0) return;
      const message = JSON.parse(buffer.slice(0, newline));
      buffer = buffer.slice(newline + 1);
      pending.get(message.id)?.(message);
      pending.delete(message.id);
    }
  });

  const request = (method, params) => new Promise((resolveRequest, reject) => {
    const id = nextId++;
    pending.set(id, resolveRequest);
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    setTimeout(() => { if (pending.delete(id)) reject(new Error(`timed out: ${method}`)); }, 60_000);
  });

  const notify = (method, params) =>
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');

  return { child, request, notify };
}
