// Smoke test for the repo-owned adapter against an unmodified PoB.
// Usage: node tests/smoke/bridge.mjs   (set POB_PATH only to force a checkout)
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import zlib from 'node:zlib';
import { PoBLuaApiClient } from '../../build/pobLuaBridge.js';
import { gearedBuildXml, smokePoBSrc } from './pobSource.mjs';

const cwd = smokePoBSrc();

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
    'create_spec', 'delete_spec', 'rename_spec', 'set_socket_group_enabled', 'set_gem_enabled',
    'get_ailments']) {
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
  // Real PoB import/export codes are zlib-deflated then URL-safe base64 — exercise the
  // decode against the same build XML rather than only the mocked unit tests.
  const exampleXml = await readFile(resolve('example-build.xml'), 'utf8');
  const importCode = zlib.deflateSync(exampleXml).toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
  await client.importCode(importCode, 'import-code-smoke');
  const importedInfo = await client.getBuildInfo();
  if (importedInfo?.className !== info.className || importedInfo?.ascendClassName !== info.ascendClassName) {
    throw new Error(`import_code produced an unexpected build: ${JSON.stringify(importedInfo)}`);
  }
  // Seven handlers call getStats() with no field list, so the default set decides
  // what they can report. It carried no damage stat at all, which made every one
  // of them describe a build as if it dealt none.
  await client.createSocketGroup({ label: 'dps', slot: 'Weapon 1' });
  const dpsGroup = (await client.getSkills()).groups.length;
  await client.addGem({ groupIndex: dpsGroup, gemName: 'Arc', level: 20, quality: 0 });
  await client.setMainSelection({ mainSocketGroup: dpsGroup });
  const defaults = await client.getStats();
  for (const field of ['TotalDPS', 'CombinedDPS', 'AverageDamage']) {
    if (typeof defaults[field] !== 'number') {
      throw new Error(`getStats() with no fields must include ${field}: ${JSON.stringify(defaults)}`);
    }
  }
  if (!(defaults.TotalDPS > 0)) throw new Error(`expected a positive TotalDPS, got ${defaults.TotalDPS}`);
  if (typeof defaults.Life !== 'number') throw new Error('the defensive defaults must survive too');

  const changed = await client.setTree({ ...tree, ascendClassId: 0, nodes: [] });
  // Upstream keeps the class start allocated even when given an empty node list.
  if (changed.ascendClassId !== 0 || changed.nodes.length >= tree.nodes.length) throw new Error('tree mutation was not applied');
  const restored = await client.setTree(tree);
  if (restored.ascendClassId !== tree.ascendClassId || restored.nodes.join(',') !== tree.nodes.join(',')) {
    throw new Error('tree mutation did not restore the original allocation');
  }
  // A chance-based ailment is never applied to the enemy by PoB unless the
  // "Effect of Shock" config is filled in, so a shock build silently reads as
  // dealing no shock at all. get_ailments has to expose both halves: what the
  // calculation is crediting, and what the skill would actually inflict.
  await client.loadBuildXml(await readFile(resolve('example-build.xml'), 'utf8'), 'ailment-smoke');
  await client.createSocketGroup({ label: 'shock', slot: 'Weapon 1' });
  const shockGroup = (await client.getSkills()).groups.length;
  await client.addGem({ groupIndex: shockGroup, gemName: 'Arc', level: 20, quality: 0 });
  await client.setMainSelection({ mainSocketGroup: shockGroup });
  const ailments = await client.getAilments();
  const shock = ailments?.ailments?.find((a) => a.name === 'Shock');
  if (!shock) throw new Error(`get_ailments returned no Shock entry: ${JSON.stringify(ailments)}`);
  // critical strikes always inflict the non-damaging ailment for their damage
  // type, so a lightning spell has a shock chance even with no chance-to-shock
  if (!(shock.chanceOnHit + shock.chanceOnCrit > 0)) {
    throw new Error(`Arc should have a shock chance, got ${shock.chanceOnHit}/${shock.chanceOnCrit}`);
  }
  if (!(shock.calculatedEffect > 0)) {
    throw new Error(`calculated shock effect should be above zero, got ${JSON.stringify(shock)}`);
  }
  if (shock.appliedEffect !== 0) {
    throw new Error(`unconfigured shock should be credited at zero, got ${shock.appliedEffect}`);
  }
  if (!shock.creditedInCalc === false || shock.creditedInCalc !== false) {
    throw new Error('creditedInCalc must report that the calculation is ignoring this shock');
  }
  if (!Array.isArray(shock.thresholdTable) || shock.thresholdTable.length === 0) {
    throw new Error('thresholdTable should carry the effect-by-enemy-threshold curve');
  }
  // and once configured, the calculation must actually credit it
  await client.setConfig({ conditionEnemyShocked: true, conditionShockEffect: 25 });
  const configured = (await client.getAilments()).ailments.find((a) => a.name === 'Shock');
  if (configured.appliedEffect !== 25 || configured.creditedInCalc !== true) {
    throw new Error(`configured shock should be credited: ${JSON.stringify(configured)}`);
  }

  await client.loadBuildXml(await readFile(gearedBuildXml, 'utf8'), 'weighted-query-smoke');
  const weighted = await client.generateWeightedTradeQuery('Amulet');
  const query = weighted.query;
  if (!query || typeof query !== 'object' || query.query?.status?.option !== 'available' || query.query?.filters?.type_filters?.filters?.category?.option !== 'accessory.amulet' || !Array.isArray(query.query?.stats?.[0]?.filters) || query.query.stats[0].filters.length === 0) {
    throw new Error(`unexpected upstream weighted trade query: ${JSON.stringify(query)}`);
  }
  console.log(`adapter bridge passed: ${info.className}/${info.ascendClassName}, ${tree.nodes.length} nodes, ${items.length} item slots, ${skillSetup.groups.length} skill groups`);
} finally {
  await client.stop();
}
