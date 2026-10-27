// Reproduce the main-review failures through MCP and the real PoB JSON-lines adapter.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { XMLParser } from 'fast-xml-parser';
import { PoBLuaApiClient } from '../../build/pobLuaBridge.js';
import { smokePoBSrc, gearedBuildXml } from './pobSource.mjs';

const cwd = smokePoBSrc();
const directory = await mkdtemp(join(tmpdir(), 'pob-persistence-smoke-'));
const original = (await fs.readFile(gearedBuildXml, 'utf8'))
  .replace(/<Notes>[\s\S]*?<\/Notes>/, '<Notes>KEEP &amp; &lt;NOTES&gt;</Notes>');
const lean = original.replace(/<Build([^>]*)>[\s\S]*?<\/Build>/, '<Build$1><PlayerStat stat="Life" value="6728"/></Build>');
for (const name of ['fixture', 'snapshot', 'tree', 'victim']) await fs.writeFile(join(directory, `${name}.xml`), original);
await fs.writeFile(join(directory, 'lean.xml'), lean);
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' });
const readBuild = async name => parser.parse(await fs.readFile(join(directory, `${name}.xml`), 'utf8')).PathOfBuilding;
const client = new Client({ name: 'persistence-smoke', version: '1.0.0' });
const transport = new StdioClientTransport({
  command: process.execPath, args: [resolve('build/index.js')], cwd: process.cwd(),
  env: { ...process.env, POB_DIRECTORY: directory, POB_PATH: cwd, POB_LUA_ENABLED: 'true' }, stderr: 'pipe',
});
transport.stderr?.resume();
async function call(name, args = {}, expectError = false) {
  const result = await client.callTool({ name, arguments: args }, undefined, { timeout: 60000 });
  assert.equal(Boolean(result.isError), expectError, `${name}: ${JSON.stringify(result)}`);
  return result.content.map(part => part.text ?? '').join('\n');
}
const life = text => Number(text.match(/^Life: ([\d.]+)/m)?.[1]);
const engine = new PoBLuaApiClient({ cwd, cmd: process.env.POB_CMD,
  args: [resolve('lua/vanilla_stdio_bridge.lua')], env: { POB_API_STDIO: '0' }, timeoutMs: 60000 });
try {
  await client.connect(transport);
  await call('analyze_build', { build_name: 'lean' });
  assert.match(await call('lua_get_build_info'), /Name: lean\nLevel: 99/);
  console.log('ok: first analysis loads the requested build instead of bootstrap stats');

  await call('lua_load_build', { build_name: 'fixture.xml' });
  await call('get_build_stats', { build_name: 'fixture.xml' }); // Populate the file cache.
  await call('set_character_level', { level: 20 });
  const live = life(await call('lua_get_stats', { category: 'defense' }));
  await call('lua_save_build', { build_name: 'fixture' });
  assert.equal(life(await call('get_build_stats', { build_name: 'fixture.xml' })), live);
  assert.equal(life(await call('get_build_stats', { build_name: 'fixture' })), live);
  console.log('ok: saves invalidate both saved-stat cache aliases');

  await call('lua_new_build', { class_name: 'Witch' });
  assert.match(await call('lua_save_build', { build_name: 'victim' }, true), /overwrite: true/);
  assert.equal(await fs.readFile(join(directory, 'victim.xml'), 'utf8'), original);
  await call('lua_save_build', { build_name: 'victim', overwrite: true });
  assert.equal(Number((await readBuild('victim')).Build.level), 1);
  await call('lua_save_build', { build_name: 'victim' }); // Retry to the known source is safe.
  console.log('ok: unrelated builds are protected; explicit overwrite and repeat saves work');

  await call('lua_load_build', { build_name: 'snapshot' });
  const snapshot = await call('snapshot_build', { build_name: 'snapshot', tag: 'before-edit' });
  const id = snapshot.match(/Snapshot ID: ([^\n]+)/)?.[1];
  assert(id);
  await call('set_character_level', { level: 20 });
  await call('lua_save_build', { build_name: 'snapshot.xml' });
  await call('restore_snapshot', { build_name: 'snapshot.xml', snapshot_id: id });
  assert.match(await call('lua_get_build_info'), /Level: 99/);
  assert.equal(Number((await readBuild('snapshot')).Build.level), 99);
  await call('restore_snapshot', { build_name: 'snapshot', snapshot_id: id });
  assert.match(await call('lua_get_build_info'), /Level: 99/);
  console.log('ok: snapshot restore and retry synchronize the file and matching live engine');

  const before = await readBuild('tree');
  const spec = Array.isArray(before.Tree.Spec) ? before.Tree.Spec[0] : before.Tree.Spec;
  await call('save_tree', { build_name: 'tree', nodes: spec.nodes.split(',') });
  const treeXml = await fs.readFile(join(directory, 'tree.xml'), 'utf8');
  assert(treeXml.includes('<Notes>') && treeXml.includes('<URL>'));
  await call('lua_load_build', { build_name: 'tree' });
  await call('lua_save_build', { build_name: 'tree-roundtrip' });
  assert((await readBuild('tree-roundtrip')).Notes.includes('KEEP & <NOTES>'));
  const exported = await call('export_build', { build_name: 'tree', output_name: 'exported', notes: 'Added & <notes>' });
  assert(exported.includes('exported.xml'));
  const exportedXml = await fs.readFile(join(directory, '.pob-mcp/exports/exported.xml'), 'utf8');
  assert(parser.parse(exportedXml).PathOfBuilding.Notes.includes('Added & <notes>'));
  console.log('ok: tree edits and exports preserve XML elements through a real PoB reload');

  await call('set_config', { config_name: 'customMods', value: '50% chance to Suppress Spell Damage' });
  const defense = await call('analyze_defenses', { build_name: 'tree' });
  assert.match(defense, /Spell Suppression: 50% \(below 100% chance cap\)/);
  console.log('ok: 50% suppression is reported as partial');

  const affix = await call('classify_item_affixes', { mod_lines: ['+33% to Chaos Resistance'] });
  assert(affix.includes('of Bameth'));
  console.log('ok: affix lookup works with the engine installation, including legacy ModItem tables');

  // Read a real mastery and effect from this engine's tree data. No invented IDs.
  await engine.start();
  await engine.newBuild({ className: 'Witch' });
  const tree = await engine.getTree();
  const selection = execFileSync(process.env.POB_CMD || 'luajit', ['-', join(cwd, 'TreeData', tree.treeVersion, 'tree.lua'), String(tree.nodes[0])], {
    encoding: 'utf8', input: `local t = dofile(arg[1])
local start = tonumber(arg[2])
local queue, previous, index = {start}, {[start] = false}, 1
while queue[index] do
  local id = queue[index]; index = index + 1
  local node = t.nodes[tostring(id)] or t.nodes[id]
  if node.isMastery and node.masteryEffects and node.masteryEffects[1] then
    local path, current = {}, id
    while current do table.insert(path, current); current = previous[current] end
    print(id .. ':' .. node.masteryEffects[1].effect .. ':' .. table.concat(path, ',')); return
  end
  for _, direction in ipairs({'in', 'out'}) do
    for _, neighbor in ipairs(node[direction] or {}) do
      neighbor = tonumber(neighbor)
      local nextNode = t.nodes[tostring(neighbor)] or t.nodes[neighbor]
      if nextNode and previous[neighbor] == nil and not nextNode.ascendancyName and not nextNode.classStartIndex then
        previous[neighbor] = id; table.insert(queue, neighbor)
      end
    end
  end
end
error('No reachable mastery in engine tree data')`,
  }).trim().split(':');
  const [node, effect] = selection.slice(0, 2).map(Number);
  const nodes = selection[2].split(',');
  assert(Number.isInteger(node) && Number.isInteger(effect));
  await engine.saveBuild(join(directory, 'mastery.xml'));
  await call('save_tree', { build_name: 'mastery', nodes, mastery_effects: { [node]: effect } });
  await engine.loadBuildXml(await fs.readFile(join(directory, 'mastery.xml'), 'utf8'), 'mastery');
  const reloadedTree = await engine.getTree();
  assert.equal(reloadedTree.masteryEffects[node], effect, JSON.stringify({ node, effect, reloadedTree,
    savedTree: (await readBuild('mastery')).Tree }));
  console.log('ok: save_tree mastery selection survives native PoB XML import');
  assert(!(await fs.readdir(directory)).some(name => /^\.pob-(save|write)-/.test(name)));
  assert.match(await call('lua_load_build', { build_xml: '<Invalid/>', name: 'invalid' }, true), /did not initialize/);
  console.log('ok: a native import that closes the build is reported as a failure');
} finally {
  await engine.stop();
  await client.close();
  await fs.rm(directory, { recursive: true, force: true });
}
