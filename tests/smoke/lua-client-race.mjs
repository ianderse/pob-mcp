// Regression smoke test: ensureClient() must single-spawn when concurrent
// callers hit it while a dead client is being stopped (the pre-fix window
// orphaned a second PoB process per race). Needs NO PoB checkout — the
// spawn+handshake step is stubbed; only the reservation logic is exercised.
// Usage: npm run build && node tests/smoke/lua-client-race.mjs
import { LuaClientManager } from '../../build/server/luaClientManager.js';

const failures = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures.push(name);
};

function gate() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}

const origError = console.error;
console.error = () => {}; // the manager's progress logs are not the signal

const manager = new LuaClientManager(true);
let initCalls = 0;
const initGate = gate();
manager.initClient = async () => {
  initCalls++;
  await initGate.promise;
};
const stopGate = gate();
let stopped = false;
manager.client = {
  isAlive: () => false,
  stop: async () => { await stopGate.promise; stopped = true; },
};

const a = manager.ensureClient();
const b = manager.ensureClient(); // same read batch, mid-stop(): pre-fix this double-spawned
stopGate.resolve();
initGate.resolve();

const settles = await Promise.allSettled([a, b]);
console.error = origError;

check('bridge process spawned exactly once', initCalls === 1, `initCalls=${initCalls}`);
check('dead client was stopped', stopped);
for (const [i, s] of settles.entries()) {
  check(
    `caller ${i} told the build was lost`,
    s.status === 'rejected' && /crashed and was restarted/.test(String(s.reason)),
    s.status === 'fulfilled' ? 'resolved silently' : String(s.reason)
  );
}

if (failures.length) {
  console.log(`lua-client-race smoke FAILED: ${failures.join(', ')}`);
  process.exit(1);
}
console.log('lua-client-race smoke passed');
