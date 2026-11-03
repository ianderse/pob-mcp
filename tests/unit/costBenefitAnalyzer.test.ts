import { describe, it, expect } from '@jest/globals';
import { CostBenefitAnalyzer } from '../../src/services/costBenefitAnalyzer';

function listing(mods: string[]) {
  return {
    id: 'x',
    item: { name: 'Test', explicitMods: mods, implicitMods: [], craftedMods: [] },
    listing: { price: { currency: 'chaos', count: 100 } },
  } as never;
}

describe('CostBenefitAnalyzer all-resistance extraction', () => {
  it('credits "to all Elemental Resistances" against the three elemental caps', () => {
    const analysis = new CostBenefitAnalyzer().analyzeItem(listing(['+70% to all Elemental Resistances']));
    expect(analysis.stats.fireResist).toBe(70);
    expect(analysis.stats.coldResist).toBe(70);
    expect(analysis.stats.lightningResist).toBe(70);
    expect(analysis.stats.chaosResist).toBe(0);
    expect(analysis.stats.totalResist).toBe(210);
  });

  it('credits "to all Resistances" against all four including chaos', () => {
    const analysis = new CostBenefitAnalyzer().analyzeItem(
      listing(['+30% to all Resistances', '+10% to Fire Resistance'])
    );
    expect(analysis.stats.fireResist).toBe(40); // explicit 10 + all-resist 30
    expect(analysis.stats.coldResist).toBe(30);
    expect(analysis.stats.lightningResist).toBe(30);
    expect(analysis.stats.chaosResist).toBe(30);
    expect(analysis.stats.totalResist).toBe(130);
  });
});
