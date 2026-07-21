import { describe, expect, it } from '@jest/globals';
import { ItemRecommendationEngine } from '../../src/services/itemRecommendationEngine';

describe('ItemRecommendationEngine trade mod normalization', () => {
  const engine = new ItemRecommendationEngine({} as any, {} as any);

  it('extracts resistances from current structured Trade API mod entries', () => {
    const resistances = (engine as any).extractResistances({
      explicitMods: [
        { description: '+42% to Fire Resistance' },
        { description: '+30% to all Elemental Resistances' },
      ],
      implicitMods: [{ description: '+17% to Chaos Resistance' }],
    });

    expect(resistances).toEqual({ fire: 72, cold: 30, lightning: 30, chaos: 17 });
  });

  it('continues to support legacy string mod arrays', () => {
    const resistances = (engine as any).extractResistances({ explicitMods: ['+35% to Cold Resistance'] });
    expect(resistances.cold).toBe(35);
  });
});
