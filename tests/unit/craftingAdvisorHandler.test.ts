import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { buildCraftingResponse, handleSuggestCrafting } from '../../src/handlers/craftingAdvisorHandler';
import type { PoeNinjaClient } from '../../src/services/poeNinjaClient';

type AdvisoredContext = Parameters<typeof handleSuggestCrafting>[0];
const asClient = (c: unknown): NonNullable<ReturnType<AdvisoredContext["getLuaClient"]>> => c as NonNullable<ReturnType<AdvisoredContext["getLuaClient"]>>;

describe('buildCraftingResponse', () => {
  it('includes base name in output', () => {
    const result = buildCraftingResponse({
      base: 'Hubris Circlet',
      slot: 'helmet',
      desiredMods: ['maximum life', 'cold resistance'],
      modData: '=== poedb data ===\nsome mod info',
      currencyRates: { chaos: 1, divine: 200, live: true },
      buildContext: null,
    });
    expect(result).toContain('Hubris Circlet');
  });

  it('includes desired mods in output', () => {
    const result = buildCraftingResponse({
      base: 'Hubris Circlet',
      slot: 'helmet',
      desiredMods: ['maximum life', 'cold resistance'],
      modData: '',
      currencyRates: { chaos: 1, divine: 200, live: true },
      buildContext: null,
    });
    expect(result).toContain('maximum life');
    expect(result).toContain('cold resistance');
  });

  it('includes build context when provided', () => {
    const result = buildCraftingResponse({
      base: 'Hubris Circlet',
      slot: 'helmet',
      desiredMods: [],
      modData: '',
      currencyRates: { chaos: 1, divine: 200, live: true },
      buildContext: { life: 3000, fireRes: 45, coldRes: 10 },
    });
    expect(result).toContain('Build context');
  });

  it('includes currency rates', () => {
    const result = buildCraftingResponse({
      base: 'Hubris Circlet',
      slot: 'helmet',
      desiredMods: [],
      modData: '',
      currencyRates: { chaos: 1, divine: 200, live: true },
      buildContext: null,
    });
    expect(result).toContain('200');
  });
});

describe('handleSuggestCrafting — graceful degradation', () => {
  const mockGetCurrencyExchangeMap = jest.fn<() => Promise<Map<string, number>>>();

  const mockNinjaClient = {
    getCurrencyExchangeMap: mockGetCurrencyExchangeMap,
  };

  const baseContext: AdvisoredContext = {
    getLuaClient: () => null,
    ninjaClient: mockNinjaClient as unknown as PoeNinjaClient,
  };

  let fetchSpy: jest.SpiedFunction<typeof fetch>;

  beforeEach(() => {
    fetchSpy = jest.spyOn(globalThis, 'fetch');
    jest.clearAllMocks();
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('returns helpful message when no base and no build loaded', async () => {
    const result = await handleSuggestCrafting(baseContext, { slot: 'helmet' });
    const text = result.content[0].text;
    expect(text).toContain('Please provide a base type');
    expect(text).toContain('helmet');
  });

  it('falls back to default currency rates when poe.ninja fails', async () => {
    mockGetCurrencyExchangeMap.mockRejectedValue(new Error('network error'));
    fetchSpy.mockResolvedValue(new Response('<html>mods</html>', { status: 200 }));

    const result = await handleSuggestCrafting(baseContext, {
      slot: 'helmet',
      base: 'Hubris Circlet',
    });
    const text = result.content[0].text;
    expect(text).toContain('200'); // fallback divine rate
  });

  it('includes error message in output when poedb fetch fails', async () => {
    mockGetCurrencyExchangeMap.mockResolvedValue(new Map([['Divine Orb', 200]]));
    fetchSpy.mockRejectedValue(new TypeError('Failed to fetch'));

    const result = await handleSuggestCrafting(baseContext, {
      slot: 'helmet',
      base: 'Hubris Circlet',
    });
    const text = result.content[0].text;
    expect(text).toContain('Could not fetch poedb data');
  });

  it('auto-detects an equipped baseName from either supported PoB bridge', async () => {
    mockGetCurrencyExchangeMap.mockResolvedValue(new Map([['Divine Orb', 200]]));
    fetchSpy.mockResolvedValue(new Response('<html>mods</html>', { status: 200 }));
    const getItems = jest.fn(async () => [{ slot: 'Helmet', id: 1, name: 'Rare Helmet', baseName: 'Hubris Circlet' }]);
    const context: AdvisoredContext = {
      getLuaClient: () => asClient({ getStats: async () => ({ Life: 4000 }), getItems }),
      ninjaClient: mockNinjaClient as unknown as PoeNinjaClient,
    };

    const result = await handleSuggestCrafting(context, { slot: 'helmet' });

    expect(getItems).toHaveBeenCalled();
    expect(result.content[0].text).toContain('Crafting Advisor: Hubris Circlet (helmet)');
  });
});

describe('fallback currency-rate disclosure', () => {
  it('labels placeholder rates as fallback instead of presenting them as live market data', () => {
    const text = buildCraftingResponse({
      base: 'Hyaline Ring',
      slot: 'Ring 1',
      desiredMods: ['+8% to Fire Resistance'],
      modData: '',
      currencyRates: { chaos: 1, divine: 200, live: false },
      buildContext: null,
    });
    expect(text).toContain('fallback rate');
  });
});
