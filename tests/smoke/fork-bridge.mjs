// Smoke test for the default JSON-lines bridge supplied by the project fork.
// Usage: POB_FORK_PATH=/path/to/PathOfBuilding/src node tests/smoke/fork-bridge.mjs
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PoBLuaApiClient } from '../../build/pobLuaBridge.js';

const cwd = process.env.POB_FORK_PATH;
if (!cwd) throw new Error('POB_FORK_PATH must point to the fork PathOfBuilding src directory.');

// Do not pass args: this verifies the documented default, HeadlessWrapper.lua
// with POB_API_STDIO supplied by PoBLuaApiClient.
const client = new PoBLuaApiClient({ cwd, timeoutMs: 60_000 });

try {
  await client.start();
  if (!await client.ping()) throw new Error('fork bridge did not respond to ping');
  await client.loadBuildXml(await readFile(resolve('example-build.xml'), 'utf8'), 'fork-smoke');

  // Keep bridge calls serial: the stdio protocol intentionally permits one request at a time.
  const info = await client.getBuildInfo();
  const stats = await client.getStats(['Life', 'TotalDPS']);
  const tree = await client.getTree();
  const items = await client.getItems();
  const skills = await client.getSkills();
  if (!info?.className || typeof stats.Life !== 'number' || !Array.isArray(tree?.nodes) || !Array.isArray(items) || !Array.isArray(skills?.groups)) {
    throw new Error('unexpected fork bridge response shape');
  }

  console.log(`fork bridge passed: ${info.className}/${info.ascendClassName}, ${tree.nodes.length} nodes, ${items.length} item slots, ${skills.groups.length} skill groups`);
} finally {
  await client.stop();
}
