import { describe, it, expect } from '@jest/globals';
import { parsePobShareInput, fetchPobShareCode, POB_SHARE_MAX_BYTES } from '../../src/services/pobShareFetch.js';

const text = (body: string, init: ResponseInit = {}) => new Response(body, init);

describe('parsePobShareInput', () => {
  it('parses pobb.in URLs, user URLs and bare IDs', () => {
    expect(parsePobShareInput('https://pobb.in/kpRns1vROvV3').rawUrl).toBe('https://pobb.in/kpRns1vROvV3/raw');
    expect(parsePobShareInput('https://pobb.in/u/someone/kpRns1vROvV3').id).toBe('kpRns1vROvV3');
    expect(parsePobShareInput('kpRns1vROvV3').source).toBe('pobb.in');
  });

  it('parses poedb.tw URLs of any locale', () => {
    const t = parsePobShareInput('https://poedb.tw/pt/PathOfBuilding?id=E22R8MtObaQv');
    expect(t.source).toBe('poedb.tw');
    expect(t.rawUrl).toBe('https://poedb.tw/pob/E22R8MtObaQv/raw');
  });

  it('rejects other hosts, http, lookalikes and credentials', () => {
    for (const bad of [
      'https://evil.example/abcdef',
      'http://pobb.in/abcdef',
      'https://pobb.in.evil.example/abcdef',
      'https://evil.example/?x=pobb.in/abcdef',
      'https://user:pw@pobb.in/abcdef',
      'https://pobb.in:8443/abcdef',
      'https://poedb.tw/us/PathOfBuilding',
      '',
    ]) {
      expect(() => parsePobShareInput(bad)).toThrow();
    }
  });
});

describe('fetchPobShareCode', () => {
  const target = parsePobShareInput('https://pobb.in/abcdef');

  it('returns the code and follows allowed redirects', async () => {
    const calls: string[] = [];
    const impl = (async (u: string) => {
      calls.push(u);
      return calls.length === 1
        ? new Response(null, { status: 302, headers: { location: 'https://poedb.tw/x' } })
        : text('eJzLSM3JyQcABiwCFQ==\n');
    }) as unknown as typeof fetch;
    expect(await fetchPobShareCode(target, impl)).toBe('eJzLSM3JyQcABiwCFQ==');
    expect(calls).toHaveLength(2);
  });

  it('refuses redirects to other hosts', async () => {
    const impl = (async () =>
      new Response(null, { status: 302, headers: { location: 'https://evil.example/x' } })) as unknown as typeof fetch;
    await expect(fetchPobShareCode(target, impl)).rejects.toThrow(/Refusing/);
  });

  it('rejects oversized and non-code responses', async () => {
    const big = (async () => text('A'.repeat(POB_SHARE_MAX_BYTES + 1))) as unknown as typeof fetch;
    await expect(fetchPobShareCode(target, big)).rejects.toThrow(/too large/);
    const html = (async () => text('<html>nope</html>')) as unknown as typeof fetch;
    await expect(fetchPobShareCode(target, html)).rejects.toThrow(/valid PoB export code/);
  });
});
