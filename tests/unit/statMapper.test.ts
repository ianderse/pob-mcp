import { describe, it, expect } from '@jest/globals';
import { StatMapper } from '../../src/services/statMapper.js';

describe('StatMapper static catalog', () => {
  // Regression for the old startup bootstrap: it replaced the curated catalog
  // with the raw trade-API /data/stats dump keyed by hashed IDs, so every
  // English-phrase search stopped matching. The static catalog is now the only
  // source; its English aliases MUST stay resolvable through fuzzySearch.
  const mapper = new StatMapper();

  const topHitNames = (query: string) =>
    mapper.fuzzySearch(query, 5).map((m) => m.pobName);

  it('matches life through a lowercase English alias', () => {
    expect(topHitNames('+10 to maximum life')[0]).toBe('Life');
  });

  it('matches energy shield phrasing', () => {
    expect(topHitNames('energy shield')[0]).toBe('EnergyShield');
  });

  it('matches resistance phrasing', () => {
    expect(topHitNames('fire resistance')[0]).toBe('FireResist');
  });

  it('ranks exact pob names above loose contains matches', () => {
    const names = topHitNames('Life');
    // 'Life' exact/alias hits must beat unrelated contains-noise entries.
    expect(names.length).toBeGreaterThan(0);
    expect(/life/i.test(names[0])).toBe(true);
  });

  it('returns nothing for gibberish instead of noise', () => {
    expect(mapper.fuzzySearch('zzqqxx unlikely stat', 5)).toEqual([]);
  });
});
