// Smoke test for the generate_weighted_trade_query Lua action.
// Spawns the PoB fork headless (no MCP server in the loop) and runs a fixed
// sequence covering: build defaults, explicit weights, different slot, error path.
//
// Requires:
//   POB_FORK_PATH — path to a PoB checkout that includes the
//                   generate_weighted_trade_query handler in src/API/Handlers.lua
//   luajit on PATH
//
// Usage:
//   POB_FORK_PATH=/path/to/PathOfBuilding node tests/smoke/weighted-trade-lua.mjs [<build.xml>] [<slot>]

import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const POB_PATH = process.env.POB_FORK_PATH;
if (!POB_PATH) {
  console.error('POB_FORK_PATH env var is required (path to a PoB fork with the new handler).');
  process.exit(1);
}
const SRC_DIR = path.join(POB_PATH, 'src');
const BUILD_PATH = process.argv[2] || path.join(import.meta.dirname, '..', '..', 'example-build.xml');
const SLOT = process.argv[3] || 'Belt';

console.log(`[test] PoB src dir: ${SRC_DIR}`);
console.log(`[test] build:       ${BUILD_PATH}`);
console.log(`[test] slot:        ${SLOT}`);

const xml = readFileSync(BUILD_PATH, 'utf8');

const proc = spawn('luajit', ['HeadlessWrapper.lua'], {
  cwd: SRC_DIR,
  env: { ...process.env, POB_API_STDIO: '1' },
  stdio: ['pipe', 'pipe', 'pipe'],
});

let buf = '';
const queue = [];
let resolveNext = null;

proc.stdout.on('data', (chunk) => {
  buf += chunk.toString('utf8');
  let nl;
  while ((nl = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); }
    catch { console.log('[stdout-raw]', line); continue; }
    if (resolveNext) { const r = resolveNext; resolveNext = null; r(msg); }
    else queue.push(msg);
  }
});

proc.stderr.on('data', (c) => process.stderr.write(`[lua] ${c}`));
proc.on('exit', (code) => console.log(`[test] PoB exited code=${code}`));

function nextMsg(timeoutMs = 60000) {
  if (queue.length) return Promise.resolve(queue.shift());
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout waiting for stdout')), timeoutMs);
    resolveNext = (m) => { clearTimeout(t); resolve(m); };
  });
}

function send(action, params) {
  const frame = JSON.stringify({ action, params: params || {} });
  console.log(`[test] >>>`, frame.length > 200 ? frame.slice(0, 200) + `… (${frame.length} bytes)` : frame);
  proc.stdin.write(frame + '\n');
}

async function main() {
  // 1. Wait for ready handshake
  const ready = await nextMsg();
  console.log('[test] <<< ready:', JSON.stringify(ready));

  // 2. Load build
  send('load_build_xml', { xml, name: 'smoke-test' });
  const loadRes = await nextMsg();
  console.log('[test] <<< load_build_xml:', JSON.stringify(loadRes));
  if (!loadRes.ok) { proc.kill(); process.exit(1); }

  // 3. Try without explicit weights first — exposes whether statSortSelectionList is initialized
  send('generate_weighted_trade_query', { slot: SLOT });
  const gen1 = await nextMsg(120000);
  console.log('[test] <<< generate_weighted_trade_query (no weights):');
  console.log(JSON.stringify(gen1, null, 2).slice(0, 2000));

  function summarizeQuery(label, res) {
    console.log(`\n[test] === ${label} ===`);
    console.log('  ok:', res.ok, ' warning:', res.warning ?? '(none)', ' error:', res.error ?? '(none)');
    if (!res.ok) return;
    const q = JSON.parse(res.query);
    const stats = q.query?.stats?.[0]?.filters || [];
    const cat   = q.query?.filters?.type_filters?.filters?.category?.option;
    console.log('  category:', cat, ' weighted-mod count:', stats.length);
    console.log('  top 5 weights:');
    for (const s of stats.slice(0, 5)) console.log(`    ${s.id.padEnd(35)} weight=${s.value.weight.toFixed(2)}`);
  }
  summarizeQuery(`slot=${SLOT} (build defaults)`, gen1);

  // 4. Same slot, explicit Life-only weighting — should re-rank toward life mods
  send('generate_weighted_trade_query', {
    slot: SLOT,
    options: {
      statWeights: [
        { label: 'Life', stat: 'Life', weightMult: 1.0 },
      ],
    },
  });
  const gen2 = await nextMsg(120000);
  summarizeQuery(`slot=${SLOT} (Life-only weights)`, gen2);

  // 5. Different slot — Helmet
  send('generate_weighted_trade_query', { slot: 'Helmet' });
  const gen3 = await nextMsg(120000);
  summarizeQuery('slot=Helmet (build defaults)', gen3);

  // 6. Bogus slot — error path
  send('generate_weighted_trade_query', { slot: 'Cape of Awesomeness' });
  const gen4 = await nextMsg(30000);
  summarizeQuery('slot=Cape of Awesomeness (error path)', gen4);

  send('quit');
  await nextMsg().catch(() => {});
  proc.kill();
}

main().catch((e) => { console.error('[test] error:', e); proc.kill(); process.exit(1); });
