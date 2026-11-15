// End-to-end MCP smoke test against an unmodified PoB.
// Usage: node tests/smoke/mcp.mjs   (set POB_PATH only to force a checkout)
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { startMcpServer } from './mcpClient.mjs';
import { gearedBuildXml, smokePoBSrc } from './pobSource.mjs';

// The server resolves the engine itself; fail here so a missing PoB reads as
// a missing PoB rather than as a tool call timing out.
smokePoBSrc();
const buildsDir = await mkdtemp(join(tmpdir(), 'pob-mcp-smoke-'));
const weightedSmoke = process.env.POE_WEIGHTED_SMOKE === 'true';
await cp(resolve('example-build.xml'), join(buildsDir, 'example.xml'));
await cp(gearedBuildXml, join(buildsDir, 'occ-vortex.xml'));
const { child, request, notify } = startMcpServer({
  POB_DIRECTORY: buildsDir,
  ...(weightedSmoke ? { POE_TRADE_ENABLED: 'true' } : {}),
});
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
  if (!names.has('lua_get_ailments')) throw new Error('missing MCP tool: lua_get_ailments');
  // The stock-checkout adapter supports the full tool surface
  for (const name of ['lua_get_capabilities', 'lua_get_build_snapshot', 'lua_start', 'lua_stop', 'lua_load_build', 'lua_get_stats', 'lua_get_tree', 'lua_set_tree', 'lua_get_build_info', 'get_equipped_items', 'get_skill_setup', 'find_best_anointment', 'add_item', 'toggle_flask', 'set_config', 'add_gem', 'create_spec', 'toggle_socket_group', 'suggest_masteries', 'lua_save_build']) {
    if (!names.has(name)) throw new Error(`missing MCP tool: ${name}`);
  }
  for (const [name, args] of [
    ['lua_start', {}],
    ['lua_get_capabilities', {}],
    ['lua_load_build', { build_name: 'example.xml' }],
    ['lua_get_build_snapshot', {}],
    ['lua_get_stats', {}],
    ['lua_get_ailments', {}],
    ['get_equipped_items', {}],
    ['get_skill_setup', { main_only: false }],
    ['lua_get_tree', { include_node_ids: true }],
    ['lua_set_tree', { classId: 2, ascendClassId: 0, nodes: [] }],
    ['lua_get_build_snapshot', {}],
    ['lua_set_tree', { classId: 2, ascendClassId: 1, nodes: ['50459', '58427'] }],
    ['lua_get_build_snapshot', {}],
    ['lua_get_build_info', {}],
    ['set_config', { config_name: 'enemyIsBoss', value: true }],
  ]) {
    const response = await request('tools/call', { name, arguments: args });
    if (response.error || response.result?.isError) throw new Error(`${name} failed: ${JSON.stringify(response.error ?? response.result)}`);
    if (name === 'lua_get_ailments' && !response.result.content?.[0]?.text?.includes('=== Non-Damaging Ailments ===')) {
      throw new Error(`lua_get_ailments returned an unexpected response: ${JSON.stringify(response.result)}`);
    }
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
  const anointLoad = await request('tools/call', { name: 'lua_load_build', arguments: { build_name: 'occ-vortex.xml' } });
  if (anointLoad.error || anointLoad.result?.isError) throw new Error(`anoint fixture load failed: ${JSON.stringify(anointLoad.error ?? anointLoad.result)}`);
  const anoints = await request('tools/call', { name: 'find_best_anointment', arguments: { slot: 'Amulet', focus: 'both', max_results: 3 } });
  if (anoints.error || anoints.result?.isError) throw new Error(`find_best_anointment failed: ${JSON.stringify(anoints.error ?? anoints.result)}`);
  const anointText = anoints.result?.content?.[0]?.text || '';
  if (!anointText.includes('=== Best Anointment') || !anointText.includes('Evaluated ')) throw new Error(`anoint response was incomplete: ${anointText}`);
  // The what-if tool has to reach the engine and come back with a real delta,
  // over MCP rather than only through the bridge client.
  const simulated = await request('tools/call', {
    name: 'lua_simulate',
    arguments: {
      slotName: 'Body Armour',
      itemText: ['Rarity: RARE', 'Smoke Jacket', 'Quilted Jacket', 'Item Level: 84', 'Quality: 20',
        'LevelReq: 72', 'Implicits: 0', '+500 to maximum Life', '+50% to Cold Resistance',
        '+50% to Lightning Resistance'].join('\n'),
    },
  });
  if (simulated.error || simulated.result?.isError) throw new Error(`lua_simulate failed: ${JSON.stringify(simulated.error ?? simulated.result)}`);
  const simulatedText = simulated.result?.content?.[0]?.text || '';
  if (!simulatedText.includes('The loaded build is unchanged') || !/Life: [\d,]+ → [\d,]+ {2}\+/.test(simulatedText)) {
    throw new Error(`lua_simulate did not report a life gain: ${simulatedText}`);
  }
  const badSlot = await request('tools/call', { name: 'lua_simulate', arguments: { slotName: 'Chest', itemText: 'Rarity: RARE\nX\nQuilted Jacket' } });
  if (badSlot.result?.isError !== true) throw new Error('lua_simulate must reject a slot name PoB does not know');
  if (weightedSmoke) {
    if (!process.env.POE_SESSION_ID) throw new Error('POE_SESSION_ID is required for the weighted smoke test.');
    const weighted = await request('tools/call', { name: 'find_weighted_trade_items', arguments: { league: 'Standard', slot: 'Amulet', limit: 1 } });
    if (weighted.error || weighted.result?.isError) throw new Error(`find_weighted_trade_items failed: ${JSON.stringify(weighted.error ?? weighted.result)}`);
    const weightedText = weighted.result?.content?.[0]?.text || '';
    if (!weightedText.includes('=== Weighted BIS Search (Standard, slot: Amulet) ===')) throw new Error(`weighted trade response was incomplete: ${weightedText}`);
  }
  console.log('MCP smoke passed: capabilities, snapshot, load, stats, items, skills, tree mutation/restore, config, anoint, and build info all succeeded');
} finally {
  child.kill();
  await rm(buildsDir, { recursive: true, force: true });
}
