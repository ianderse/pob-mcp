// Deep end-to-end MCP smoke test: full tool surface against a stock PoB checkout.
// Usage: POB_PATH=/path/to/PathOfBuilding/src node tests/smoke/mcp-full.mjs
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

if (!process.env.POB_PATH && !process.env.POB_FORK_PATH) throw new Error('POB_PATH must point to a stock PoB src directory.');
const buildsDir = await mkdtemp(join(tmpdir(), 'pob-mcp-full-'));
await cp(resolve('example-build.xml'), join(buildsDir, 'example.xml'));
const child = spawn('node', [resolve('build/index.js')], {
  env: { ...process.env, POB_DIRECTORY: buildsDir, POB_LUA_ENABLED: 'true' },
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
const call = async (name, args = {}) => {
  const response = await request('tools/call', { name, arguments: args });
  if (response.error || response.result?.isError) throw new Error(`${name} failed: ${JSON.stringify(response.error ?? response.result)}`);
  return response.result?.content?.[0]?.text || '';
};

try {
  await request('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'full-smoke', version: '1.0' } });
  notify('notifications/initialized', {});
  const listed = await request('tools/list', {});
  const names = new Set(listed.result.tools.map((tool) => tool.name));
  for (const name of ['lua_start', 'lua_load_build', 'lua_get_build_snapshot', 'set_character_level', 'lua_set_tree', 'list_specs', 'select_spec', 'suggest_masteries', 'add_item', 'get_equipped_items']) {
    if (!names.has(name)) throw new Error(`missing MCP tool: ${name}`);
  }

  const rejected = await request('tools/call', { name: 'not_a_real_tool', arguments: {} });
  if (rejected.result?.isError !== true) throw new Error(`MCP errors must set isError: ${JSON.stringify(rejected)}`);

  await call('lua_start');
  await call('lua_new_build', { class_name: 'Witch' });
  await call('create_socket_group', { label: 'Smoke Gems', slot: 'Body Armour' });
  await call('add_gem', { group_index: 1, gem_name: 'Fireball', level: 1, quality: 0 });
  await call('set_gem_level', { group_index: 1, gem_index: 1, level: 2 });
  await call('set_gem_quality', { group_index: 1, gem_index: 1, quality: 5 });
  const editedSkills = await call('get_skill_setup');
  if (!editedSkills.includes('Fireball (2/5)')) throw new Error(`gem edit workflow was incomplete: ${editedSkills}`);
  await call('remove_gem', { group_index: 1, gem_index: 1 });
  await call('remove_skill', { group_index: 1 });
  const buildList = await call('list_builds');
  if (!buildList.includes('example.xml')) throw new Error(`build discovery was incomplete: ${buildList}`);
  const buildStats = await call('get_build_stats', { build_name: 'example.xml' });
  if (!buildStats.includes('=== Stats for example.xml ===')) throw new Error(`file build stats were incomplete: ${buildStats}`);
  await call('set_build_notes', { build_name: 'example.xml', notes: 'MCP smoke note' });
  const notes = await call('get_build_notes', { build_name: 'example.xml' });
  if (!notes.includes('MCP smoke note')) throw new Error(`build notes were not persisted: ${notes}`);
  await call('lua_load_build', { build_name: 'example.xml' });
  const before = await call('lua_get_build_snapshot');
  if (!before.includes('Level 90')) throw new Error(`unexpected initial snapshot: ${before}`);
  await call('set_character_level', { level: 89 });
  const changed = await call('lua_get_build_snapshot');
  if (!changed.includes('Level 89')) throw new Error(`snapshot did not reflect level edit: ${changed}`);
  await call('set_character_level', { level: 90 });
  const restored = await call('lua_get_build_snapshot');
  if (!restored.includes('Level 90')) throw new Error(`snapshot did not reflect level restoration: ${restored}`);
  const specs = await call('list_specs');
  if (!specs.includes('[1] Main Build')) throw new Error(`spec listing was incomplete: ${specs}`);
  await call('select_spec', { index: 1 });
  const skills = await call('get_skill_setup');
  if (!skills.includes('Skill Setup')) throw new Error(`skill setup was incomplete: ${skills}`);
  const nodeSearch = await call('search_tree_nodes', { query: 'life', limit: 3 });
  if (!nodeSearch.includes('Passive Tree Node Search')) throw new Error(`tree search was incomplete: ${nodeSearch}`);
  const masteries = await call('suggest_masteries', {});
  if (!masteries.includes('Mastery Suggestions')) throw new Error(`mastery suggestion response was incomplete: ${masteries}`);
  const issues = await call('get_build_issues');
  if (!issues.includes('Build Issues')) throw new Error(`build issue analysis was incomplete: ${issues}`);
  const validation = await call('validate_build', { build_name: 'example.xml' });
  if (!validation.includes('Build Validation')) throw new Error(`build validation was incomplete: ${validation}`);
  const defenses = await call('analyze_defenses', { build_name: 'example.xml' });
  if (!defenses.includes('Defensive Analysis')) throw new Error(`defence analysis was incomplete: ${defenses}`);
  const config = await call('get_config');
  if (!config.includes('Configuration')) throw new Error(`config retrieval was incomplete: ${config}`);
  await call('save_config_preset', { name: 'smoke' });
  const presets = await call('list_config_presets');
  if (!presets.includes('smoke')) throw new Error(`config preset was not persisted: ${presets}`);
  await call('load_config_preset', { name: 'smoke' });
  const snapshot = await call('snapshot_build', { build_name: 'example.xml', tag: 'smoke' });
  const snapshotId = snapshot.match(/Snapshot ID: ([^\n]+)/)?.[1];
  if (!snapshotId) throw new Error(`snapshot did not return an ID: ${snapshot}`);
  const snapshots = await call('list_snapshots', { build_name: 'example.xml', tag_filter: 'smoke' });
  if (!snapshots.includes(snapshotId)) throw new Error(`snapshot listing omitted the new snapshot: ${snapshots}`);
  await call('restore_snapshot', { build_name: 'example.xml', snapshot_id: snapshotId, backup_current: false });
  const boss = await call('check_boss_readiness', { boss: 'shaper' });
  if (!boss.includes('Boss Readiness: The Shaper')) throw new Error(`boss readiness was incomplete: ${boss}`);
  console.log('full MCP smoke passed: blank-build gem editing, file/build persistence, load, snapshot, level edit/restore, specs, skills/tree search, mastery/issue/defence analysis, validation, configuration presets, and boss readiness all succeeded');
} finally {
  child.kill();
  await rm(buildsDir, { recursive: true, force: true });
}
