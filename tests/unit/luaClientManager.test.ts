import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { existsSync } from 'node:fs';

// PoBLuaApiClient is the process-spawning collaborator; every lifecycle test
// drives the manager through this mock so no real PoB is ever started.
const start = jest.fn(async () => {});
const stop = jest.fn(async () => {});
const isAlive = jest.fn(() => true);
const loadBuildXml = jest.fn(async () => ({}));

jest.mock('../../src/pobLuaBridge.js', () => ({
  PoBLuaApiClient: jest.fn().mockImplementation(() => ({ start, stop, isAlive, loadBuildXml })),
}));

import { LuaClientManager } from '../../src/server/luaClientManager.js';

interface BridgeOptions {
  args: string[];
}

function bridgeCtor(): jest.Mock {
  const { PoBLuaApiClient } = jest.requireMock('../../src/pobLuaBridge.js') as {
    PoBLuaApiClient: jest.Mock;
  };
  return PoBLuaApiClient;
}

function mockCalls(): BridgeOptions[] {
  return bridgeCtor().mock.calls.map((c: unknown[]) => c[0] as BridgeOptions);
}

describe('LuaClientManager.ensureClient', () => {
  const savedPobArgs = process.env.POB_ARGS;

  beforeEach(() => {
    start.mockReset();
    start.mockImplementation(async () => {});
    stop.mockReset();
    stop.mockImplementation(async () => {});
    isAlive.mockReset();
    isAlive.mockReturnValue(true);
    loadBuildXml.mockReset();
    loadBuildXml.mockImplementation(async () => ({}));
    bridgeCtor().mockClear();
  });

  afterEach(() => {
    if (savedPobArgs === undefined) delete process.env.POB_ARGS;
    else process.env.POB_ARGS = savedPobArgs;
  });

  it('throws a clear error when the bridge is disabled', async () => {
    const manager = new LuaClientManager(false);
    await expect(manager.ensureClient()).rejects.toThrow(/not enabled/i);
    expect(start).not.toHaveBeenCalled();
  });

  it('restarts a dead bridge exactly once for two concurrent ensureClient() calls', async () => {
    // The spawn race: the old code awaited a dead client's stop() before
    // reserving `starting`, so two callers in one stdio read batch each saw
    // starting===null + a dead client and spawned their own process — the
    // second PoB was orphaned (nothing held its handle).
    const manager = new LuaClientManager(true);
    await manager.ensureClient(); // first healthy client
    expect(bridgeCtor()).toHaveBeenCalledTimes(1);

    isAlive.mockReturnValue(false); // bridge died
    const results = await Promise.allSettled([
      manager.ensureClient(),
      manager.ensureClient(),
    ]);

    expect(bridgeCtor()).toHaveBeenCalledTimes(2); // initial + a SINGLE restart
    expect(start).toHaveBeenCalledTimes(2);
    expect(stop).toHaveBeenCalledTimes(1); // dead client cleaned up once
    // Both joiners observe the same crashed-restart outcome...
    for (const r of results) expect(r.status).toBe('rejected');
    // ...and that outcome names the recovery action, not a generic failure.
    const reason = (results[0] as PromiseRejectedResult).reason as Error;
    expect(reason.message).toMatch(/crashed and was restarted/);
    expect(reason.message).toMatch(/lua_load_build/);
  });

  it('joins an in-flight start instead of spawning a second process', async () => {
    let release!: () => void;
    start.mockImplementationOnce(
      () =>
        new Promise<void>((res) => {
          release = res;
        }),
    );
    const manager = new LuaClientManager(true);
    const p1 = manager.ensureClient();
    const p2 = manager.ensureClient(); // while start is mid-flight
    release();
    await Promise.all([p1, p2]);
    expect(bridgeCtor()).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('stops the half-initialized process when the bridge never initializes', async () => {
    // Every probe fails -> the retry chain must run to exhaustion, then the
    // started-but-unverified process must be stopped, not leaked. The 5×2s
    // retry sleeps are real; keep them off the wall clock with fake timers.
    jest.useFakeTimers();
    loadBuildXml.mockImplementation(async () => {
      throw new Error('wrapper missing');
    });
    try {
      const manager = new LuaClientManager(true);
      const p = manager.ensureClient().catch((e: Error) => e);
      // The retry loop alternates probe (microtask) and 2s sleep (macrotask);
      // advancing repeatedly drains the whole chain.
      for (let i = 0; i < 8; i++) {
        await jest.advanceTimersByTimeAsync(2000);
      }
      const err = await p;
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toMatch(/did not initialize/i);
      expect(loadBuildXml).toHaveBeenCalledTimes(5);
      expect(stop).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('points the default launch at the repo-owned stdio bridge adapter', async () => {
    const manager = new LuaClientManager(true);
    await manager.ensureClient();
    const opts = mockCalls()[0];
    expect(opts.args).toHaveLength(1);
    expect(opts.args[0].endsWith('vanilla_stdio_bridge.lua')).toBe(true);
    // The path must resolve to the file actually shipped in the repo.
    expect(existsSync(opts.args[0])).toBe(true);
  });

  it('honors POB_ARGS over the built-in bridge path', async () => {
    process.env.POB_ARGS = 'one two';
    const manager = new LuaClientManager(true);
    await manager.ensureClient();
    expect(mockCalls()[0].args).toEqual(['one', 'two']);
  });
});
