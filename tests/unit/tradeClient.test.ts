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
