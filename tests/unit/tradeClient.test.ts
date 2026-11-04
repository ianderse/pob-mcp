import { describe, it, expect, jest } from '@jest/globals';
import { TradeApiClient } from '../../src/services/tradeClient';

interface MakeRequestShim {
  makeRequest(method: string, url: string, body?: unknown): Promise<unknown>;
}

describe('TradeApiClient.fetchItems batching', () => {
  it('splits lists above the 10-id API cap into sequential batched requests', async () => {
    const client = new TradeApiClient({ requestsPerSecond: 1000 });
    const urls: string[] = [];
    const shim = client as unknown as MakeRequestShim;
    jest.spyOn(shim, 'makeRequest').mockImplementation(async (_method: string, url: string) => {
      urls.push(url);
      const ids = new URL(url, 'https://x').pathname.replace('/api/trade/fetch/', '').split(',');
      return { result: ids.map((id: string) => ({ id })) };
    });

    const ids = Array.from({ length: 25 }, (_, i) => `id${i}`);
    const items = await client.fetchItems(ids, 'q1');

    expect(items).toHaveLength(25);
    expect(urls).toHaveLength(3);
    for (const u of urls) {
      const n = new URL(u, 'https://x').pathname.replace('/api/trade/fetch/', '').split(',').length;
      expect(n).toBeLessThanOrEqual(10);
    }
    // order preserved: consumers rank by position
    expect(items.map((i) => (i as { id: string }).id)).toEqual(ids);
  });

  it('passes short lists through as a single request', async () => {
    const client = new TradeApiClient({ requestsPerSecond: 1000 });
    const shim = client as unknown as MakeRequestShim;
    const spy = jest.spyOn(shim, 'makeRequest').mockImplementation(async (_m: string, url: string) => {
      const ids = new URL(url, 'https://x').pathname.replace('/api/trade/fetch/', '').split(',');
      return { result: ids.map((id: string) => ({ id })) };
    });
    const items = await client.fetchItems(['a', 'b', 'c']);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(items).toHaveLength(3);
  });
});

interface CacheShim {
  cache: Map<string, unknown>;
}

describe('TradeApiClient response cache bounds', () => {
  it('evicts oldest entries instead of growing without limit', async () => {
    const client = new TradeApiClient({ requestsPerSecond: 1000 });
    const shim = client as unknown as CacheShim;
    const put = (client as unknown as {
      putInCache(key: string, data: unknown, ttl: number): void;
    }).putInCache.bind(client);

    for (let i = 0; i < 260; i++) put(`k${i}`, i, 300_000);

    expect(shim.cache.size).toBe(200);
    // Oldest-by-insertion dropped first; newest retained.
    expect(shim.cache.has('k0')).toBe(false);
    expect(shim.cache.has('k259')).toBe(true);
  });

  it('a cache hit refreshes recency so hot entries survive eviction', async () => {
    const client = new TradeApiClient({ requestsPerSecond: 1000 });
    const shim = client as unknown as CacheShim;
    const internals = client as unknown as {
      putInCache(key: string, data: unknown, ttl: number): void;
      getFromCache<T>(key: string): T | null;
    };

    internals.putInCache('hot', 'value', 300_000);
    for (let i = 0; i < 199; i++) internals.putInCache(`k${i}`, i, 300_000);
    expect(internals.getFromCache<string>('hot')).toBe('value');
    internals.putInCache('push', 0, 300_000); // triggers one eviction
    internals.putInCache('push2', 0, 300_000);

    // Without the read-refresh, 'hot' (first inserted) would be the first
    // eviction victim; with it, the two pushes evict k0/k1 instead.
    expect(internals.getFromCache<string>('hot')).toBe('value');
    expect(shim.cache.has('k0')).toBe(false);
  });
});
