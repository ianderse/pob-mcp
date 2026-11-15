import { describe, it, expect } from '@jest/globals';
import {
  DEFENSIVE_STAT_FIELDS,
  analyzeDefenses,
  analyzeMaxHits,
  formatDefensiveAnalysis,
  formatResistanceSweep,
  summariseResistanceSweep,
} from '../../src/defensiveAnalyzer.js';

/**
 * Every number here was measured against a real Path of Building engine on
 * tests/fixtures/occ-vortex.xml (level 99 Occultist), so the analyzer is
 * checked against what PoB actually says rather than an invented shape.
 */
const OCC_VORTEX = {
  Life: 6728,
  EnergyShield: 1611,
  Armour: 2438,
  LifeRegen: 724.5,
  PhysicalDamageReduction: 36,
  EnduranceChargesMax: 3,
  BlockChance: 24,
  TotalEHP: 54887.631577226,
  FireResist: 75, ColdResist: 75, LightningResist: 75, ChaosResist: 68,
  FireResistOverCap: 9, ColdResistOverCap: 30, LightningResistOverCap: 11, ChaosResistOverCap: 0,
  PhysicalMaximumHitTaken: 18642,
  FireMaximumHitTaken: 63711,
  ColdMaximumHitTaken: 63711,
  LightningMaximumHitTaken: 63711,
  ChaosMaximumHitTaken: 39580,
};

/** Same build with fire at 44% and lightning at 46% (measured, via a ring mod). */
const OCC_VORTEX_WEAK_FIRE = {
  ...OCC_VORTEX,
  TotalEHP: 40655.014,
  FireResist: 44, LightningResist: 46,
  FireResistOverCap: 0, LightningResistOverCap: 0,
  FireMaximumHitTaken: 30236,
  LightningMaximumHitTaken: 31297,
};

describe('analyzeMaxHits', () => {
  it('names the damage type that kills the character first', () => {
    const maxHits = analyzeMaxHits(OCC_VORTEX);

    expect(maxHits.binding?.type).toBe('Physical');
    expect(maxHits.binding?.maxHit).toBe(18642);
    expect(maxHits.entries.map((entry) => entry.type)).toEqual([
      'Physical', 'Chaos', 'Fire', 'Cold', 'Lightning',
    ]);
    expect(maxHits.headroomRatio).toBeCloseTo(39580 / 18642, 4);
  });

  it('points a resistance purchase at the weakest resisted type, not at physical', () => {
    expect(analyzeMaxHits(OCC_VORTEX).resistedBinding?.type).toBe('Chaos');
    expect(analyzeMaxHits(OCC_VORTEX_WEAK_FIRE).resistedBinding?.type).toBe('Fire');
  });

  it('marks a resistance at its cap, where further purchases are credited as zero', () => {
    const capped = analyzeMaxHits(OCC_VORTEX).entries.filter((entry) => entry.atCap);

    expect(capped.map((entry) => entry.type)).toEqual(['Fire', 'Cold', 'Lightning']);
    expect(analyzeMaxHits(OCC_VORTEX_WEAK_FIRE).entries.find((e) => e.type === 'Fire')?.atCap).toBe(false);
  });

  it('reports unavailable rather than guessing when PoB sent no max hits', () => {
    const maxHits = analyzeMaxHits({ Life: 5000, FireResist: 75 });

    expect(maxHits.available).toBe(false);
    expect(maxHits.binding).toBeUndefined();
  });
});

describe('binding constraint versus TotalEHP', () => {
  // Measured pair on the fire-44 / lightning-46 build: +20% fire and +20%
  // lightning land on the same TotalEHP to nine decimal places. Only fire
  // moves the floor. TotalEHP calls it a tie; the binding constraint does not.
  const plusFire20 = {
    ...OCC_VORTEX_WEAK_FIRE,
    TotalEHP: 44504.051025416,
    FireResist: 64,
    FireMaximumHitTaken: 45741,
  };
  const plusLightning20 = {
    ...OCC_VORTEX_WEAK_FIRE,
    TotalEHP: 44504.051025416,
    LightningResist: 66,
    LightningMaximumHitTaken: 48214,
  };

  const floorOf = (stats: Record<string, number>) => analyzeMaxHits(stats).resistedBinding?.maxHit;

  it('separates two options TotalEHP ranks as identical', () => {
    expect(plusFire20.TotalEHP).toBe(plusLightning20.TotalEHP);

    expect(floorOf(OCC_VORTEX_WEAK_FIRE)).toBe(30236);
    expect(floorOf(plusFire20)).toBe(31297);
    expect(floorOf(plusLightning20)).toBe(30236);
  });
});

describe('analyzeDefenses', () => {
  it('leads its recommendations with the binding constraint', () => {
    const analysis = analyzeDefenses(OCC_VORTEX);
    const binding = analysis.recommendations.find((rec) => rec.category === 'binding');

    expect(binding?.issue).toContain('Physical at 18,642 max hit');
    expect(binding?.solutions.join(' ')).toContain('no amount of it moves the physical max hit');
    expect(binding?.solutions.join(' ')).toContain('Chaos is the weakest of them at 39,580');
  });

  it('tells a build to raise the resistance that owns the floor', () => {
    const chaosFloor = { ...OCC_VORTEX, PhysicalMaximumHitTaken: 99999 };
    const binding = analyzeDefenses(chaosFloor).recommendations.find((rec) => rec.category === 'binding');

    expect(binding?.issue).toContain('Chaos at 39,580 max hit');
    expect(binding?.solutions.join(' ')).toContain('+7% Chaos resistance reaches the 75% cap');
    expect(binding?.solutions.join(' ')).toContain('stops paying once it passes Fire at 63,711');
  });

  it('prints the per-type table and explains why capped types tie', () => {
    const text = formatDefensiveAnalysis(analyzeDefenses(OCC_VORTEX));

    expect(text).toContain('Physical    18,642  ← BINDING');
    expect(text).toContain('Chaos       39,580 [68% resist]  2.12x the floor');
    expect(text).toContain('+30% overcap credited as nothing');
    expect(text).toContain('Fire, Cold, Lightning sit at the resistance cap');
    expect(text).toContain('averaged across damage types');
  });
});

describe('summariseResistanceSweep', () => {
  // Measured fire sweep from the fire-44 / lightning-46 build.
  const handoffSteps = [
    { delta: 5, resist: 49, floor: 31297, bindingType: 'Lightning' as const },
  ];

  it('stops the recommendation where the floor changes hands', () => {
    const summary = summariseResistanceSweep(
      'Fire',
      { resist: 44, floor: 30236, bindingType: 'Fire' },
      handoffSteps
    );

    expect(summary.handsOverTo).toBe('Lightning');
    expect(summary.stopAt?.delta).toBe(5);
    expect(summary.floorGain).toBe(1061);
    expect(formatResistanceSweep(summary)).toContain('Stop at +5%');
    expect(formatResistanceSweep(summary)).toContain('more Fire resistance moves it by nothing');
  });

  // Measured chaos sweep from the unmodified fixture.
  const cappingSteps = [
    { delta: 5, resist: 73, floor: 46910, bindingType: 'Chaos' as const },
    { delta: 10, resist: 75, floor: 50663, bindingType: 'Chaos' as const },
    { delta: 15, resist: 75, floor: 50663, bindingType: 'Chaos' as const },
  ];

  it('stops at the cap when the resistance runs out of room before handing over', () => {
    const summary = summariseResistanceSweep(
      'Chaos',
      { resist: 68, floor: 39580, bindingType: 'Chaos' },
      cappingSteps
    );

    expect(summary.handsOverTo).toBeUndefined();
    expect(summary.cappedAt).toBe(75);
    expect(summary.lastImprovingDelta).toBe(10);
    expect(summary.floorGain).toBe(11083);
    expect(formatResistanceSweep(summary)).toContain('Stop at +10%');
    expect(formatResistanceSweep(summary)).toContain('caps at 75%');
  });

  it('says every step still paid when the sweep never changes hands', () => {
    const summary = summariseResistanceSweep(
      'Fire',
      { resist: 20, floor: 10000, bindingType: 'Fire' },
      [
        { delta: 5, resist: 25, floor: 11000, bindingType: 'Fire' },
        { delta: 10, resist: 30, floor: 12000, bindingType: 'Fire' },
      ]
    );

    expect(summary.stopAt).toBeUndefined();
    expect(summary.floorGain).toBe(2000);
    expect(formatResistanceSweep(summary)).toContain('still the binding constraint across the whole sweep');
  });
});

describe('DEFENSIVE_STAT_FIELDS', () => {
  it('asks for every per-type max hit, which the default stat set omits', () => {
    for (const field of [
      'PhysicalMaximumHitTaken', 'FireMaximumHitTaken', 'ColdMaximumHitTaken',
      'LightningMaximumHitTaken', 'ChaosMaximumHitTaken',
    ]) {
      expect(DEFENSIVE_STAT_FIELDS).toContain(field);
    }
  });
});


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
