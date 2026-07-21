// Smoke test for the repo-owned adapter against an unmodified PoB checkout.
// Usage: POB_FORK_PATH=/path/to/PathOfBuilding/src node tests/smoke/vanilla-bridge.mjs
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PoBLuaApiClient } from '../../build/pobLuaBridge.js';

const cwd = process.env.POB_FORK_PATH;
if (!cwd) throw new Error('POB_FORK_PATH must point to a vanilla PoB src directory.');

const client = new PoBLuaApiClient({
  cwd,
  args: [resolve('lua/vanilla_stdio_bridge.lua')],
  timeoutMs: 60_000,
});

try {
  await client.start();
  if (!await client.ping()) throw new Error('vanilla adapter did not respond to ping');
  await client.loadBuildXml(await readFile(resolve('example-build.xml'), 'utf8'), 'vanilla-smoke');
  // The stdio bridge is deliberately single-request; keep these sequential.
  const info = await client.getBuildInfo();
  const tree = await client.getTree();
  const stats = await client.getStats(['Life', 'TotalEHP']);
  if (!info?.className || !Array.isArray(tree?.nodes) || typeof stats.Life !== 'number') {
    throw new Error('unexpected vanilla adapter response shape');
  }
  console.log(`vanilla adapter passed: ${info.className}/${info.ascendClassName}, ${tree.nodes.length} nodes, ${stats.Life} life`);
} finally {
  await client.stop();
}
