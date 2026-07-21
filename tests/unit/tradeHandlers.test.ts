import { describe, it, expect } from '@jest/globals';
import { toStatFilters } from '../../src/handlers/tradeHandlers.js';

describe('toStatFilters', () => {
  it('returns an empty array when neither stats nor mods are provided', () => {
    expect(toStatFilters(undefined, undefined)).toEqual([]);
    expect(toStatFilters([], [])).toEqual([]);
  });

  it('returns stats[] as-is when only stats are provided (handler-native shape)', () => {
    const stats = [
      { id: 'explicit.stat_3372524247', min: 35 },
      { id: 'explicit.stat_3299347043', min: 90, max: 200 },
    ];
    expect(toStatFilters(stats, undefined)).toEqual(stats);
  });

  it('maps mods[].stat_id to stats[].id when only mods are provided (MCP-schema shape)', () => {
    const mods = [
      { stat_id: 'explicit.stat_3372524247', min: 35 },
      { stat_id: 'explicit.stat_3299347043', min: 90, max: 200 },
    ];
    expect(toStatFilters(undefined, mods)).toEqual([
      { id: 'explicit.stat_3372524247', min: 35 },
      { id: 'explicit.stat_3299347043', min: 90, max: 200 },
    ]);
  });

  it('prefers stats over mods when both are provided', () => {
    const stats = [{ id: 'explicit.stat_A', min: 1 }];
    const mods = [{ stat_id: 'explicit.stat_B', min: 2 }];
    expect(toStatFilters(stats, mods)).toEqual(stats);
  });

  it('preserves missing min/max when mapping mods to stats', () => {
    const mods = [{ stat_id: 'explicit.stat_X' }];
    expect(toStatFilters(undefined, mods)).toEqual([
      { id: 'explicit.stat_X', min: undefined, max: undefined },
    ]);
  });
});
