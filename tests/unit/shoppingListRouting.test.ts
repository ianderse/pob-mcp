import { describe, it, expect } from '@jest/globals';
import { routeToolCall } from '../../src/server/toolRouter.js';

// Minimal fake build in the fast-xml-parser shape readBuild returns.
const fakeBuild = {
  Build: { '@_level': '90', '@_className': 'Witch' },
  Items: {
    activeItemSet: '1',
    ItemSet: {
      '@_id': '1',
      Slot: [
        { '@_name': 'Amulet' },
        { '@_name': 'Ring 1' },
      ],
    },
  },
};

function makeDeps() {
  const contextBuilder = {
    buildHandlerContext: () => ({ buildService: { readBuild: async () => fakeBuild } }),
    buildWatchContext: () => ({}),
    buildLuaContext: () => ({}),
    buildItemSkillContext: () => ({}),
    buildOptimizationContext: () => ({}),
    buildExportContext: () => ({}),
    buildSkillGemContext: () => ({}),
    buildValidationContext: () => ({}),
  };
  return {
    contextBuilder,
    tradeClient: {}, // router only gates on presence here; the service itself doesn't call it
    statMapper: null,
    recommendationEngine: null,
    ninjaClient: {},
    getLuaClient: () => null,
    ensureLuaClient: async () => {},
  };
}

import { textOf } from '../helpers/response.js';

describe('routeToolCall generate_shopping_list budget contract', () => {
  it('accepts a numeric budget (legacy schema callers) without crashing', async () => {
    // Pre-fix the router forwarded this number as the budget TIER, so
    // item.recommendations[200] was undefined and the formatter threw.
    const result = await routeToolCall(
      'generate_shopping_list',
      { build_name: 'x', league: 'Settled', budget: 200 },
      makeDeps() as never
    );
    const text = textOf(result);
    expect(text).not.toContain('TypeError');
    expect(result.content.length).toBeGreaterThan(0);
  });

  it('honors budget_tier instead of ignoring it', async () => {
    const withTier = await routeToolCall(
      'generate_shopping_list',
      { build_name: 'x', league: 'Settled', budget_tier: 'endgame' },
      makeDeps() as never
    );
    const fallback = await routeToolCall(
      'generate_shopping_list',
      { build_name: 'x', league: 'Settled' },
      makeDeps() as never
    );
    const tierText = textOf(withTier);
    const fbText = textOf(fallback);
    expect(tierText).not.toContain('TypeError');
    // tier selection must visibly change recommendation rendering
    expect(tierText).not.toBe(fbText);
  });
});
