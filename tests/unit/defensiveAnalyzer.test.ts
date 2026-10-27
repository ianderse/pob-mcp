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
