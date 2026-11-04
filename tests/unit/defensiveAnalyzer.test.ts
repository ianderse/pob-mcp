import { describe, expect, it } from '@jest/globals';
import { analyzeDefenses, formatDefensiveAnalysis } from '../../src/defensiveAnalyzer.js';

describe('spell suppression reporting', () => {
  it.each([1, 49, 50, 99, 100])('reports the actual chance cap at %s%%', chance => {
    const analysis = analyzeDefenses({ Life: 6000, SpellSuppressionChance: chance });
    const output = formatDefensiveAnalysis(analysis);
    const line = output.split('\n').find(line => line.includes('Spell Suppression:'))!;
    if (chance === 100) expect(line).toContain('(capped)');
    else {
      expect(line).toContain('(below 100% chance cap)');
      expect(analysis.recommendations.flatMap(item => item.solutions).join(' ')).toContain('100%');
    }
    expect(output).not.toContain('50% cap');
  });
});

describe('resistance gap arithmetic (decimals)', () => {
  it('computes the gap from the numeric value, not the display string', () => {
    const analysis = analyzeDefenses({ FireResist: 62.5, ColdResist: 75, LightningResist: 75, ChaosResist: 75, Life: 5000 });
    const resistRec = analysis.recommendations.find((r) => r.category === 'resistance');
    expect(resistRec).toBeDefined();
    expect(resistRec!.solutions[0]).toBe('Need +12.5% total to cap all');
  });
});

describe('EHP approximation cap', () => {
  it('caps the PDR-based estimate at 5x total pool', () => {
    const analysis = analyzeDefenses({ Life: 1000, EnergyShield: 0, PhysicalDamageReduction: 95, FireResist: 75, ColdResist: 75, LightningResist: 75, ChaosResist: 75 });
    expect(analysis.lifePool.ehp).toBe(5000);
  });
});
