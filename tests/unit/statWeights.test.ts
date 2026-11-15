import { computeStatWeights, PROBES, type StatWeightClient } from '../../src/services/statWeights.js';

const BASE = { CombinedDPS: 1000, TotalEHP: 2000, MissingFireResist: 0, MissingChaosResist: 7 };
const CARRIER = 'Rarity: RARE\nBand\nRuby Ring';

/** Scores the appended probe line through `effect`, so each test states only what differs. */
function fakeClient(
  effect: (probeLine: string) => { dps?: number; ehp?: number; unparsed?: boolean },
  options: { roundTrips?: boolean } = {},
): StatWeightClient & { lines: string[] } {
  const lines: string[] = [];
  return {
    lines,
    getItems: async () => [{ slot: 'Ring 2', raw: CARRIER }],
    calcWith: async ({ repItem }) => {
      const probeLine = (repItem ?? '').slice(CARRIER.length + 1);
      if (!probeLine) {
        const drift = options.roundTrips === false ? 1.5 : 1;
        return { output: { CombinedDPS: BASE.CombinedDPS * drift, TotalEHP: BASE.TotalEHP }, base: BASE, unrecognisedLines: [] };
      }
      lines.push(probeLine);
      const e = effect(probeLine);
      return {
        output: { CombinedDPS: BASE.CombinedDPS * (1 + (e.dps ?? 0)), TotalEHP: BASE.TotalEHP * (1 + (e.ehp ?? 0)) },
        base: BASE,
        unrecognisedLines: e.unparsed ? [probeLine] : [],
      };
    },
  };
}

const find = (report: any, id: string) => [...report.ranked, ...report.inert].find((r: any) => r.id === id);

describe('computeStatWeights', () => {
  it('ranks measured affixes and reports percentage effects', async () => {
    const client = fakeClient((line) => (line.includes('maximum Life') && line.startsWith('+') ? { ehp: 0.05 } : {}));
    const { report } = await computeStatWeights(client, { focus: 'defence' });
    expect(report!.ranked[0].id).toBe('life-flat');
    expect(report!.ranked[0].ehpPct).toBeCloseTo(5);
  });

  it('marks a line PoB could not parse instead of reporting it as no effect', async () => {
    const client = fakeClient((line) => ({ unparsed: line.includes('Suppress') }));
    const { report } = await computeStatWeights(client);
    expect(find(report, 'suppression').status).toBe('unrecognised');
    expect(find(report, 'life-flat').status).toBe('no_effect');
  });

  it('does not probe a resistance with no room, and limits one with little room', async () => {
    const client = fakeClient((line) => (line.includes('Chaos Resistance') ? { ehp: 0.02 } : {}));
    const { report } = await computeStatWeights(client);
    expect(find(report, 'res-fire').status).toBe('capped');
    expect(client.lines.some((line) => line.includes('to Fire Resistance'))).toBe(false);
    const chaos = find(report, 'res-chaos');
    expect(chaos.roll).toBe(7);
    expect(client.lines).toContain('+7% to Chaos Resistance');
    // A clamped probe is at the edge of its range, so it is not doubled.
    expect(client.lines.filter((line) => line.includes('Chaos Resistance'))).toHaveLength(1);
  });

  it('flags an affix whose per-unit value changes with size', async () => {
    const client = fakeClient((line) => (line.startsWith('+40 to Dexterity') ? { ehp: 0.01 } : line.startsWith('+80 to Dexterity') ? { ehp: 0.05 } : {}));
    const { report } = await computeStatWeights(client);
    expect(find(report, 'dex').status).toBe('nonlinear');
  });

  it('weights the score by focus', async () => {
    const client = () => fakeClient((line) => (line.startsWith('+90 to maximum Life') ? { dps: 0.1, ehp: 0.02 } : {}));
    const dps = (await computeStatWeights(client(), { focus: 'dps' })).report!;
    const ehp = (await computeStatWeights(client(), { focus: 'defence' })).report!;
    expect(find(dps, 'life-flat').score).toBeCloseTo(10);
    expect(find(ehp, 'life-flat').score).toBeCloseTo(2);
  });

  it('refuses to measure through a carrier that does not reproduce the build', async () => {
    const { report, note } = await computeStatWeights(fakeClient(() => ({}), { roundTrips: false }));
    expect(report).toBeUndefined();
    expect(note).toMatch(/unmodified changed/);
  });

  it('says so when no slot can carry a probe', async () => {
    const client: StatWeightClient = { getItems: async () => [], calcWith: async () => { throw new Error('unreachable'); } };
    expect((await computeStatWeights(client)).note).toMatch(/no equipped/);
    expect((await computeStatWeights(client, { slot: 'Ring 1' })).note).toMatch(/nothing is equipped in Ring 1/);
  });

  it('has unique probe ids', () => {
    expect(new Set(PROBES.map((p) => p.id)).size).toBe(PROBES.length);
  });
});
