// Smoke test for the repo-owned adapter against an unmodified PoB checkout.
// Usage: POB_PATH=/path/to/PathOfBuilding/src node tests/smoke/bridge.mjs
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PoBLuaApiClient } from '../../build/pobLuaBridge.js';

const cwd = process.env.POB_PATH || process.env.POB_FORK_PATH;
if (!cwd) throw new Error('POB_PATH must point to a stock PoB src directory.');

const client = new PoBLuaApiClient({
  cwd,
  args: [resolve('lua/vanilla_stdio_bridge.lua')],
  env: { POB_API_STDIO: '0' },
  timeoutMs: 60_000,
});

try {
  await client.start();
  if (!await client.ping()) throw new Error('adapter did not respond to ping');
  const capabilities = await client.getCapabilities();
  for (const action of ['get_capabilities', 'get_items', 'get_skills', 'set_tree', 'generate_weighted_trade_query',
    'add_gem', 'set_config', 'save_build', 'search_nodes', 'get_mastery_options', 'calc_with',
    'create_spec', 'delete_spec', 'rename_spec', 'set_socket_group_enabled', 'set_gem_enabled']) {
    if (!capabilities.actions?.includes(action)) throw new Error(`missing adapter capability: ${action}`);
  }
  await client.loadBuildXml(await readFile(resolve('example-build.xml'), 'utf8'), 'bridge-smoke');
  // The stdio bridge is deliberately single-request; keep these sequential.
  const info = await client.getBuildInfo();
  const tree = await client.getTree();
  const stats = await client.getStats(['Life', 'TotalEHP']);
  const items = await client.getItems();
  const skillSetup = await client.getSkills();
  if (!info?.className || !Array.isArray(tree?.nodes) || typeof stats.Life !== 'number' || !Array.isArray(items) || !Array.isArray(skillSetup?.groups)) {
    throw new Error('unexpected adapter response shape');
  }
  const changed = await client.setTree({ ...tree, ascendClassId: 0, nodes: [] });
  // Upstream keeps the class start allocated even when given an empty node list.
  if (changed.ascendClassId !== 0 || changed.nodes.length >= tree.nodes.length) throw new Error('tree mutation was not applied');
  const restored = await client.setTree(tree);
  if (restored.ascendClassId !== tree.ascendClassId || restored.nodes.join(',') !== tree.nodes.join(',')) {
    throw new Error('tree mutation did not restore the original allocation');
  }
  await client.loadBuildXml(await readFile(resolve(cwd, '../spec/TestBuilds/3.13/OccVortex.xml'), 'utf8'), 'weighted-query-smoke');
  const weighted = await client.generateWeightedTradeQuery('Amulet');
  const query = weighted.query;
  if (!query || typeof query !== 'object' || query.query?.status?.option !== 'available' || query.query?.filters?.type_filters?.filters?.category?.option !== 'accessory.amulet' || !Array.isArray(query.query?.stats?.[0]?.filters) || query.query.stats[0].filters.length === 0) {
    throw new Error(`unexpected upstream weighted trade query: ${JSON.stringify(query)}`);
  }
  console.log(`adapter bridge passed: ${info.className}/${info.ascendClassName}, ${tree.nodes.length} nodes, ${items.length} item slots, ${skillSetup.groups.length} skill groups`);
} finally {
  await client.stop();
}
