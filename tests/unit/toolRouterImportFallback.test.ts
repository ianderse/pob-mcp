import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { routeToolCall } from '../../src/server/toolRouter.js';

function makeResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

function makeDeps() {
  const noopContext = {};
  return {
    toolGate: { checkGate: jest.fn() },
    contextBuilder: {
      buildHandlerContext: jest.fn(() => noopContext),
      buildWatchContext: jest.fn(() => noopContext),
      buildTreeContext: jest.fn(() => noopContext),
      buildLuaContext: jest.fn(() => ({
        getLuaClient: () => null,
        ensureLuaClient: async () => undefined,
      })),
      buildItemSkillContext: jest.fn(() => noopContext),
      buildOptimizationContext: jest.fn(() => noopContext),
      buildExportContext: jest.fn(() => noopContext),
      buildSkillGemContext: jest.fn(() => noopContext),
    },
    tradeClient: null,
    statMapper: null,
    recommendationEngine: null,
    ninjaClient: {},
    getLuaClient: () => null,
    ensureLuaClient: async () => undefined,
  } as any;
}

describe('toolRouter import account fallback', () => {
  let fetchSpy: jest.SpiedFunction<typeof fetch>;
  let originalAccountName: string | undefined;

  beforeEach(() => {
    originalAccountName = process.env.POE_ACCOUNT_NAME;
    process.env.POE_ACCOUNT_NAME = 'envAccount#1234';
    fetchSpy = jest.spyOn(globalThis, 'fetch') as jest.SpiedFunction<typeof fetch>;
    fetchSpy.mockResolvedValue(makeResponse([]));
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    if (originalAccountName === undefined) {
      delete process.env.POE_ACCOUNT_NAME;
    } else {
      process.env.POE_ACCOUNT_NAME = originalAccountName;
    }
  });

  it('does not reject lua_list_characters before the handler can use POE_ACCOUNT_NAME', async () => {
    const result = await routeToolCall('lua_list_characters', {}, makeDeps());

    expect(result.content[0].text).toContain('No characters found on account "envAccount#1234"');
    expect(String(fetchSpy.mock.calls[0][0])).toContain('envAccount%231234');
  });
});
