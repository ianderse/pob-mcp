// End-to-end smoke test against the live trade API on a real build.
// Spawns PoB headless once, loads the build, then iterates through 8 slots
// generating + executing weighted searches and printing a compact summary.
//
// Requires:
//   POB_FORK_PATH    — path to a PoB checkout with generate_weighted_trade_query handler
//   POE_SESSION_ID   — POESESSID cookie (anonymous trade API rejects weighted stats)
//   luajit on PATH
//
// Usage:
//   POB_FORK_PATH=/path/to/PathOfBuilding POE_SESSION_ID=... \
//     node tests/smoke/weighted-trade-e2e.mjs <build.xml> [<league>]

import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const POB_PATH = process.env.POB_FORK_PATH;
if (!POB_PATH) {
  console.error('POB_FORK_PATH env var is required.');
  process.exit(1);
}
const SRC_DIR  = path.join(POB_PATH, 'src');
const BUILD_PATH = process.argv[2];
const LEAGUE  = process.argv[3] || 'Standard';
const SLOTS = ['Belt', 'Body Armour', 'Helmet', 'Gloves', 'Boots', 'Amulet', 'Ring 1', 'Weapon 1'];

if (!BUILD_PATH) {
  console.error('Usage: node tests/smoke/weighted-trade-e2e.mjs <build.xml> [<league>]');
  process.exit(1);
}

const SESSION_ID = process.env.POE_SESSION_ID;
console.log(`[e2e] PoB:   ${SRC_DIR}`);
console.log(`[e2e] build: ${BUILD_PATH}`);
console.log(`[e2e] league: ${LEAGUE}`);
console.log(`[e2e] auth:  ${SESSION_ID ? 'POESESSID set' : 'anonymous (will fail)'}\n`);

const xml = readFileSync(BUILD_PATH, 'utf8');
const baseHeaders = {
  'User-Agent': 'pob-mcp-weighted-trade-smoke/0.1',
  ...(SESSION_ID ? { Cookie: `POESESSID=${SESSION_ID}` } : {}),
};

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
    let msg; try { msg = JSON.parse(line); } catch { continue; }
    if (resolveNext) { const r = resolveNext; resolveNext = null; r(msg); }
    else queue.push(msg);
  }
});
proc.stderr.on('data', () => {});

function nextMsg(timeoutMs = 60000) {
  if (queue.length) return Promise.resolve(queue.shift());
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), timeoutMs);
    resolveNext = (m) => { clearTimeout(t); resolve(m); };
  });
}
function send(action, params) {
  proc.stdin.write(JSON.stringify({ action, params: params || {} }) + '\n');
}

async function tradeSearch(league, queryObj) {
  const url = `https://www.pathofexile.com/api/trade/search/${encodeURIComponent(league)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { ...baseHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify(queryObj),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  return JSON.parse(text);
}

async function tradeFetch(ids, queryId) {
  const url = `https://www.pathofexile.com/api/trade/fetch/${ids.join(',')}?query=${queryId}`;
  const res = await fetch(url, { headers: baseHeaders });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  return JSON.parse(text);
}

async function main() {
  await nextMsg(); // ready
  send('load_build_xml', { xml, name: 'e2e-smoke' });
  const loadRes = await nextMsg();
  if (!loadRes.ok) { console.error('load failed:', loadRes); proc.kill(); process.exit(1); }
  console.log('[e2e] build loaded\n');

  const summary = [];
  for (const slot of SLOTS) {
    const row = { slot, ok: false, modCount: 0, total: 0, top: null, error: null };
    try {
      send('generate_weighted_trade_query', { slot });
      const gen = await nextMsg(180000);
      if (!gen.ok) { row.error = `gen: ${gen.error}`; summary.push(row); continue; }
      const q = JSON.parse(gen.query);
      row.modCount = q.query?.stats?.[0]?.filters?.length || 0;
      row.category = q.query?.filters?.type_filters?.filters?.category?.option;

      const searchRes = await tradeSearch(LEAGUE, q);
      row.total = searchRes.total;
      row.searchId = searchRes.id;
      if (searchRes.result?.length) {
        const top1 = await tradeFetch(searchRes.result.slice(0, 1), searchRes.id);
        const it = top1.result?.[0];
        if (it) {
          const p = it.listing?.price;
          row.top = `${it.item.name || it.item.typeLine} (${it.item.typeLine})${p ? ` — ${p.amount} ${p.currency}` : ''}`;
        }
      }
      row.ok = true;
    } catch (e) {
      row.error = e.message;
    }
    summary.push(row);
    // Light pacing to avoid rate-limit on the trade API
    await new Promise((r) => setTimeout(r, 1500));
  }

  send('quit'); proc.stdin.end();

  console.log(`\n=== Weighted BIS — ${LEAGUE} ===\n`);
  const pad = (s, n) => String(s).padEnd(n);
  console.log(pad('SLOT', 14) + pad('CAT', 17) + pad('MODS', 6) + pad('MATCHES', 9) + 'TOP1');
  console.log('-'.repeat(110));
  for (const r of summary) {
    if (!r.ok) {
      console.log(pad(r.slot, 14) + pad('—', 17) + pad('—', 6) + pad('—', 9) + `ERROR: ${r.error}`);
      continue;
    }
    console.log(pad(r.slot, 14) + pad(r.category, 17) + pad(r.modCount, 6) + pad(r.total, 9) + (r.top || '(no listings)'));
  }
  console.log();
}

main().catch((e) => { console.error('error:', e); proc.kill(); process.exit(1); });
