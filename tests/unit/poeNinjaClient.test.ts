import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { PoeNinjaClient, normalizeCurrencyOverview } from '../../src/services/poeNinjaClient';

const currentFormat = {
  core: { items: [], rates: {}, primary: 'chaos', secondary: 'divine' },
  items: [
    { id: 'chaos', name: 'Chaos Orb', image: '', category: 'Currency', detailsId: 'chaos-orb' },
    { id: 'divine', name: 'Divine Orb', image: '', category: 'Currency', detailsId: 'divine-orb' },
    { id: 'exalted', name: 'Exalted Orb', image: '', category: 'Currency', detailsId: 'exalted-orb' },
  ],
  lines: [
    { id: 'chaos', primaryValue: 1 },
    { id: 'divine', primaryValue: 120 },
    { id: 'exalted', primaryValue: 18.5 },
  ],
};

describe('normalizeCurrencyOverview', () => {
  it('normalizes the current poe.ninja item/rate response into chaos equivalents', () => {
    const result = normalizeCurrencyOverview(currentFormat);
    expect(result.lines).toEqual(expect.arrayContaining([
      expect.objectContaining({ currencyTypeName: 'Chaos Orb', chaosEquivalent: 1 }),
      expect.objectContaining({ currencyTypeName: 'Divine Orb', chaosEquivalent: 120 }),
      expect.objectContaining({ currencyTypeName: 'Exalted Orb', chaosEquivalent: 18.5 }),
    ]));
  });

  it('preserves the legacy response shape', () => {
    const legacy = { lines: [{ currencyTypeName: 'Divine Orb', chaosEquivalent: 120, detailsId: 'divine-orb' }], currencyDetails: [] };
    expect(normalizeCurrencyOverview(legacy)).toBe(legacy);
  });

  it('rejects current-format responses without a Chaos Orb reference rate', () => {
    expect(() => normalizeCurrencyOverview({ items: [], lines: [] })).toThrow('Chaos Orb rate');
  });

  it('uses the chaos primary currency when fragment responses omit a Chaos Orb line', () => {
    const result = normalizeCurrencyOverview({
      core: { items: [], rates: {}, primary: 'chaos', secondary: 'divine' },
      items: [{ id: 'fragment', name: 'Test Fragment', image: '', category: 'Fragments', detailsId: 'test-fragment' }],
      lines: [{ id: 'fragment', primaryValue: 41.43 }],
    });
    expect(result.lines).toEqual([expect.objectContaining({ currencyTypeName: 'Test Fragment', chaosEquivalent: 41.43 })]);
  });
});

describe('PoeNinjaClient', () => {
  let fetchSpy: any;

  beforeEach(() => {
    fetchSpy = jest.spyOn(global, 'fetch' as any).mockResolvedValue({ ok: true, json: async () => currentFormat } as any);
  });

  afterEach(() => fetchSpy.mockRestore());

  it('uses normalized current-format rates for the exchange map', async () => {
    const rates = await new PoeNinjaClient().getCurrencyExchangeMap('Standard');
    expect(rates.get('Chaos Orb')).toBe(1);
    expect(rates.get('Divine Orb')).toBe(120);
    expect(rates.get('Exalted Orb')).toBe(18.5);
  });
});
