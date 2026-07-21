import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { buildCraftingResponse, handleSuggestCrafting } from '../../src/handlers/craftingAdvisorHandler';

describe('buildCraftingResponse', () => {
  it('includes base name in output', () => {
    const result = buildCraftingResponse({
      base: 'Hubris Circlet',
      slot: 'helmet',
      desiredMods: ['maximum life', 'cold resistance'],
      modData: '=== poedb data ===\nsome mod info',
      currencyRates: { chaos: 1, divine: 200 },
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
      currencyRates: { chaos: 1, divine: 200 },
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
      currencyRates: { chaos: 1, divine: 200 },
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
      currencyRates: { chaos: 1, divine: 200 },
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

  const baseContext = {
    getLuaClient: () => null,
    ninjaClient: mockNinjaClient as any,
  };

  let fetchSpy: any;

  beforeEach(() => {
    fetchSpy = jest.spyOn(global, 'fetch' as any);
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
    fetchSpy.mockResolvedValue({ ok: true, text: async () => '<html>mods</html>' } as any);

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
    fetchSpy.mockResolvedValue({ ok: true, text: async () => '<html>mods</html>' } as any);
    const getItems = jest.fn(async () => [{ slot: 'Helmet', id: 1, name: 'Rare Helmet', baseName: 'Hubris Circlet' }]);
    const context = {
      getLuaClient: () => ({ getStats: async () => ({ Life: 4000 }), getItems }),
      ninjaClient: mockNinjaClient as any,
    };

    const result = await handleSuggestCrafting(context as any, { slot: 'helmet' });

    expect(getItems).toHaveBeenCalled();
    expect(result.content[0].text).toContain('Crafting Advisor: Hubris Circlet (helmet)');
  });
});
