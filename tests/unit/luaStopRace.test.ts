import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// PoBLuaApiClient mock with a controllable stop(): the manager's stopClient()
// nulls this.client only after `await stop()`, so a concurrent ensureClient()
// could see the old (already killing) client and spawn a second one.
const instances: Array<object> = [];
const start = jest.fn(async () => {});
const stop = jest.fn(() => new Promise<void>((resolve) => { resolvers.push(resolve); }));
const isAlive = jest.fn(() => true);
const loadBuildXml = jest.fn(async () => ({}));
let resolvers: Array<() => void> = [];

jest.mock('../../src/pobLuaBridge.js', () => ({
  PoBLuaApiClient: jest.fn().mockImplementation(() => {
    const inst = { start, stop, isAlive, loadBuildXml };
    instances.push(inst);
    return inst;
  }),
}));

function resolveAllStops() {
  const pending = resolvers;
  resolvers = [];
  pending.forEach((r) => r());
}

import { LuaClientManager } from '../../src/server/luaClientManager.js';

function bridgeCtor(): jest.Mock {
  const { PoBLuaApiClient } = jest.requireMock('../../src/pobLuaBridge.js') as { PoBLuaApiClient: jest.Mock };
  return PoBLuaApiClient;
}

describe('LuaClientManager.stopClient', () => {
  beforeEach(() => {
    start.mockClear();
    stop.mockClear();
    isAlive.mockReturnValue(true);
    loadBuildXml.mockClear();
    resolvers = [];
    instances.length = 0;
  });

  it('holds ensureClient until an in-flight stop has drained', async () => {
    process.env.POB_REPO_ROOT = '/tmp/pob-test-root';
    const manager = new LuaClientManager(true);
    await manager.ensureClient();
    expect(start).toHaveBeenCalledTimes(1);

    const stopping = manager.stopClient(); // quit handshake pending, client dying

    let ensured = false;
    const ensuring = manager.ensureClient().then(() => { ensured = true; });
    await new Promise((r) => setImmediate(r));
    // The pre-fix manager resolved here and handed the caller a client the
    // still-pending stop was about to kill mid-use.
    expect(ensured).toBe(false);

    resolveAllStops();
    await ensuring;
    await stopping;

    expect(ensured).toBe(true);
    // Exactly one extra bridge: the fresh one the joined ensure started. The
    // dying client was fully stopped first, so no two processes ever coexist.
    expect(instances).toHaveLength(2);
    expect(manager.getClient()).toBe(instances[1]);
    expect(stop).toHaveBeenCalledTimes(1); // only the old one was stopped
    delete process.env.POB_REPO_ROOT;
  });
});
