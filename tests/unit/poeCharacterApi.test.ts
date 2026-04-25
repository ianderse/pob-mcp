import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import {
  fetchCharacterList,
  fetchPassiveSkills,
  fetchItems,
} from '../../src/services/poeCharacterApi.js';

/**
 * Build a minimal Response-like object that satisfies the production code's
 * usage: `.ok`, `.status`, `.statusText`, `.json()`, `.text()`.
 */
function makeResponse(opts: {
  status: number;
  body?: unknown;
  text?: string;
  statusText?: string;
}): Response {
  const status = opts.status;
  const ok = status >= 200 && status < 300;
  const statusText = opts.statusText ?? (ok ? 'OK' : 'Error');
  const bodyText =
    opts.text !== undefined
      ? opts.text
      : opts.body !== undefined
        ? JSON.stringify(opts.body)
        : '';
  return {
    ok,
    status,
    statusText,
    json: async () => {
      if (opts.body !== undefined) return opts.body;
      try {
        return JSON.parse(bodyText);
      } catch {
        throw new Error('not json');
      }
    },
    text: async () => bodyText,
  } as unknown as Response;
}

describe('poeCharacterApi', () => {
  let fetchSpy: jest.SpiedFunction<typeof fetch>;
  let originalSessionId: string | undefined;

  beforeEach(() => {
    fetchSpy = jest.spyOn(globalThis, 'fetch') as jest.SpiedFunction<typeof fetch>;
    originalSessionId = process.env.POE_SESSION_ID;
    delete process.env.POE_SESSION_ID;
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    if (originalSessionId === undefined) {
      delete process.env.POE_SESSION_ID;
    } else {
      process.env.POE_SESSION_ID = originalSessionId;
    }
  });

  describe('fetchCharacterList', () => {
    const SAMPLE_LIST = [
      { name: 'Char1', class: 'Saboteur', league: 'Standard', level: 92 },
      { name: 'Char2', class: 'Ranger', league: 'Standard', level: 80 },
    ];

    it('returns parsed array on 200 with valid JSON', async () => {
      fetchSpy.mockResolvedValueOnce(makeResponse({ status: 200, body: SAMPLE_LIST }));

      const result = await fetchCharacterList('account#1234');

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Char1');
    });

    it('throws private-profile message on HTTP 403', async () => {
      fetchSpy.mockResolvedValueOnce(makeResponse({ status: 403, text: 'Forbidden' }));

      await expect(fetchCharacterList('account#1234')).rejects.toThrow(
        'Profile is private. Set POE_SESSION_ID env var or make profile public.'
      );
    });

    it('throws character-not-found message on HTTP 404', async () => {
      fetchSpy.mockResolvedValueOnce(makeResponse({ status: 404, text: 'Not Found' }));

      await expect(fetchCharacterList('account#1234')).rejects.toThrow(/Character not found/);
    });

    it('throws rate-limit message on HTTP 429', async () => {
      fetchSpy.mockResolvedValueOnce(makeResponse({ status: 429, text: 'Too Many' }));

      await expect(fetchCharacterList('account#1234')).rejects.toThrow(
        'Rate limited by PoE API. Wait a few seconds and retry.'
      );
    });

    it('throws on non-array response body', async () => {
      fetchSpy.mockResolvedValueOnce(
        makeResponse({ status: 200, body: { error: 'not an array' } })
      );

      await expect(fetchCharacterList('account#1234')).rejects.toThrow(
        /expected array/
      );
    });

    it('throws when accountName is empty or whitespace', async () => {
      await expect(fetchCharacterList('')).rejects.toThrow('accountName is required');
      await expect(fetchCharacterList('   ')).rejects.toThrow('accountName is required');
      // No fetch call should have been made.
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('includes status and body snippet in generic non-2xx errors', async () => {
      fetchSpy.mockResolvedValueOnce(
        makeResponse({
          status: 500,
          text: 'Internal Server Boom',
          statusText: 'Internal Server Error',
        })
      );

      await expect(fetchCharacterList('account#1234')).rejects.toThrow(
        /HTTP 500.*Internal Server Boom/
      );
    });

    it('URL-encodes the # in account name as %23', async () => {
      fetchSpy.mockResolvedValueOnce(makeResponse({ status: 200, body: [] }));

      await fetchCharacterList('account#1234');

      const url = fetchSpy.mock.calls[0][0] as string;
      expect(url).toContain('accountName=account%231234');
      expect(url).not.toContain('account#1234');
    });

    it('sends Cookie header when sessionId argument is provided', async () => {
      fetchSpy.mockResolvedValueOnce(makeResponse({ status: 200, body: [] }));

      await fetchCharacterList('account#1234', 'pc', 'abc123sess');

      const init = fetchSpy.mock.calls[0][1] as RequestInit;
      const headers = init.headers as Record<string, string>;
      expect(headers.Cookie).toBe('POESESSID=abc123sess');
    });

    it('sends Cookie header from POE_SESSION_ID env when sessionId arg is omitted', async () => {
      process.env.POE_SESSION_ID = 'env-session-xyz';
      fetchSpy.mockResolvedValueOnce(makeResponse({ status: 200, body: [] }));

      await fetchCharacterList('account#1234');

      const init = fetchSpy.mock.calls[0][1] as RequestInit;
      const headers = init.headers as Record<string, string>;
      expect(headers.Cookie).toBe('POESESSID=env-session-xyz');
    });

    it('omits Cookie header when neither arg nor env is set', async () => {
      fetchSpy.mockResolvedValueOnce(makeResponse({ status: 200, body: [] }));

      await fetchCharacterList('account#1234');

      const init = fetchSpy.mock.calls[0][1] as RequestInit;
      const headers = init.headers as Record<string, string>;
      expect(headers.Cookie).toBeUndefined();
    });

    it('always sends User-Agent and Accept headers', async () => {
      fetchSpy.mockResolvedValueOnce(makeResponse({ status: 200, body: [] }));

      await fetchCharacterList('account#1234');

      const init = fetchSpy.mock.calls[0][1] as RequestInit;
      const headers = init.headers as Record<string, string>;
      expect(headers['User-Agent']).toMatch(/^pob-mcp\//);
      expect(headers.Accept).toBe('application/json');
    });

    it('defaults the realm to pc when not specified', async () => {
      fetchSpy.mockResolvedValueOnce(makeResponse({ status: 200, body: [] }));

      await fetchCharacterList('account#1234');

      const url = fetchSpy.mock.calls[0][0] as string;
      expect(url).toContain('realm=pc');
    });

    it('aborts the request via AbortController when fetch never resolves', async () => {
      jest.useFakeTimers();

      // Capture the signal so we can verify abort propagates.
      let capturedSignal: AbortSignal | undefined;
      fetchSpy.mockImplementationOnce((_url: any, init?: any) => {
        capturedSignal = init?.signal as AbortSignal;
        return new Promise((_resolve, reject) => {
          // Reject when aborted to mimic real fetch semantics.
          capturedSignal?.addEventListener('abort', () => {
            const err = new Error('aborted');
            (err as Error & { name: string }).name = 'AbortError';
            reject(err);
          });
        });
      });

      const promise = fetchCharacterList('account#1234');
      // Advance past the 15s timeout.
      jest.advanceTimersByTime(15001);

      await expect(promise).rejects.toThrow(/timed out/);
      expect(capturedSignal?.aborted).toBe(true);

      jest.useRealTimers();
    });
  });

  describe('fetchPassiveSkills', () => {
    it('returns the raw text body unparsed', async () => {
      const raw = '{"hashes":[1,2,3],"items":[]}';
      fetchSpy.mockResolvedValueOnce(makeResponse({ status: 200, text: raw }));

      const result = await fetchPassiveSkills('account#1234', 'CharName');

      // Returned exactly as-is — not parsed.
      expect(result).toBe(raw);
      expect(typeof result).toBe('string');
    });

    it('throws when accountName or characterName is empty', async () => {
      await expect(fetchPassiveSkills('', 'Char')).rejects.toThrow(
        'accountName is required'
      );
      await expect(fetchPassiveSkills('account#1234', '')).rejects.toThrow(
        'characterName is required'
      );
      await expect(fetchPassiveSkills('account#1234', '   ')).rejects.toThrow(
        'characterName is required'
      );
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('URL-encodes the character name (special chars / spaces)', async () => {
      fetchSpy.mockResolvedValueOnce(makeResponse({ status: 200, text: '{}' }));

      await fetchPassiveSkills('account#1234', 'My Char #2');

      const url = fetchSpy.mock.calls[0][0] as string;
      // Spaces become %20 (encodeURIComponent), # becomes %23.
      expect(url).toContain('character=My%20Char%20%232');
    });

    it('maps HTTP 403 to private-profile error', async () => {
      fetchSpy.mockResolvedValueOnce(makeResponse({ status: 403, text: 'Forbidden' }));

      await expect(fetchPassiveSkills('account#1234', 'Char')).rejects.toThrow(
        /Profile is private/
      );
    });
  });

  describe('fetchItems', () => {
    it('returns the raw text body unparsed', async () => {
      const raw = '{"items":[{"name":"x"}]}';
      fetchSpy.mockResolvedValueOnce(makeResponse({ status: 200, text: raw }));

      const result = await fetchItems('account#1234', 'CharName');

      expect(result).toBe(raw);
    });

    it('throws when characterName is empty', async () => {
      await expect(fetchItems('account#1234', '')).rejects.toThrow(
        'characterName is required'
      );
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('maps HTTP 429 to rate-limit error', async () => {
      fetchSpy.mockResolvedValueOnce(makeResponse({ status: 429, text: 'rate limited' }));

      await expect(fetchItems('account#1234', 'Char')).rejects.toThrow(
        /Rate limited by PoE API/
      );
    });
  });
});
