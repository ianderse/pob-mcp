import { describe, it, expect } from '@jest/globals';
import { handleAnalyzeDefenses } from '../../src/handlers/optimizationHandlers.js';
import { runResistanceSweep, type SweepClient } from '../../src/services/resistanceSweep.js';

/** Measured on tests/fixtures/occ-vortex.xml against a real PoB engine. */
const OCC_VORTEX: Record<string, number> = {
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

const RING = {
  slot: 'Ring 1',
  raw: 'Rarity: RARE\nHate Band\nPaua Ring\n+78 to maximum Life',
};

const textOf = (result: any) => result.content[0].text as string;

interface FakeClientOptions {
  /** Max hit for the swept element keyed by the added resistance, in percent. */
  chaosByDelta?: Record<number, { maxHit: number; resist: number }>;
  items?: any[];
  carrierDrifts?: boolean;
}

function fakeClient(options: FakeClientOptions = {}) {
  const requestedFields: string[][] = [];
  const simulated: string[] = [];

  const withOverrides = (extra: { maxHit: number; resist: number } | null) => ({
    ...OCC_VORTEX,
    ...(extra ? { ChaosMaximumHitTaken: extra.maxHit, ChaosResist: extra.resist } : {}),
  });

  const client = {
    getBuildInfo: async () => ({ name: 'occ-vortex' }),
    listSpecs: async () => ({ specs: [] }),
    listItemSets: async () => ({ itemSets: [] }),
    getItems: async () => options.items ?? [RING],
    // A mutating sweep would reach for these. Leaving them off the fake means a
    // regression to the carrier trick fails loudly instead of quietly working.
    calcWith: async ({ repItem, repSlotName }: { repItem?: string; repSlotName?: string }) => {
      simulated.push(`${repSlotName}:${repItem}`);
      const match = repItem?.match(/\+(\d+)% to Chaos Resistance/);
      const extra = match
        ? options.chaosByDelta?.[Number(match[1])] ?? null
        : options.carrierDrifts ? { maxHit: 1, resist: 68 } : null;
      return { output: withOverrides(extra), base: withOverrides(null) };
    },
    getStats: async (fields?: string[]) => {
      requestedFields.push(fields ?? []);
      const all = withOverrides(null);
      // PoB serves only what it was asked for, and its no-field default set
      // carries no *MaximumHitTaken at all. Reproduce that here, or a handler
      // that forgets the field list still looks like it works.
      const served = fields ?? Object.keys(all).filter((key) => !key.endsWith('MaximumHitTaken'));
      return Object.fromEntries(served.filter((key) => key in all).map((key) => [key, all[key as keyof typeof all]]));
    },
  };

  return { client, requestedFields, simulated };
}

const context = (client: unknown) => ({
  buildService: {} as any,
  treeService: {} as any,
  pobDirectory: '/nonexistent',
  getLuaClient: () => client as any,
  ensureLuaClient: async () => {},
});

describe('handleAnalyzeDefenses', () => {
  it('asks PoB for the per-type max hits, which no default stat set carries', async () => {
    const { client, requestedFields } = fakeClient();

    await handleAnalyzeDefenses(context(client), 'occ-vortex');

    expect(requestedFields.length).toBeGreaterThan(0);
    for (const field of [
      'PhysicalMaximumHitTaken', 'FireMaximumHitTaken', 'ColdMaximumHitTaken',
      'LightningMaximumHitTaken', 'ChaosMaximumHitTaken',
    ]) {
      expect(requestedFields[0]).toContain(field);
    }
  });

  it('reports the binding damage type instead of ranking on averaged EHP', async () => {
    const { client } = fakeClient();

    const text = textOf(await handleAnalyzeDefenses(context(client), 'occ-vortex'));

    expect(text).toContain('Binding Constraint');
    expect(text).toContain('Physical    18,642  ← BINDING');
    expect(text).toContain('Chaos       39,580');
  });

  it('does not sweep unless asked', async () => {
    const { client, simulated } = fakeClient();

    const text = textOf(await handleAnalyzeDefenses(context(client), 'occ-vortex'));

    expect(simulated).toHaveLength(0);
    expect(text).not.toContain('Resistance Sweep');
  });

  it('sweeps the weakest resisted type and stops it at the cap', async () => {
    const { client, simulated } = fakeClient({
      chaosByDelta: {
        5: { maxHit: 46910, resist: 73 },
        10: { maxHit: 50663, resist: 75 },
        15: { maxHit: 50663, resist: 75 },
      },
    });

    const text = textOf(await handleAnalyzeDefenses(context(client), 'occ-vortex', true));

    expect(text).toContain('Chaos Resistance Sweep');
    expect(text).toContain('Stop at +10%');
    expect(text).toContain('+11,083 to the lowest resisted max hit');
    // Physical is still the overall floor, and no resistance touches it.
    expect(text).toContain('Physical still owns the overall floor at 18,642');
    expect(simulated.length).toBeGreaterThan(1);
  });

  it('measures the sweep without equipping anything', async () => {
    // The sweep used to append the probe modifier to a real item and restore the
    // build from a snapshot afterwards. A failed restore left the probe in the
    // user's live session, which is the silent corruption this tool exists to avoid.
    const { client, simulated } = fakeClient({
      chaosByDelta: { 5: { maxHit: 46910, resist: 73 }, 10: { maxHit: 50663, resist: 75 } },
    });
    const mutationAttempted: string[] = [];
    const guarded = {
      ...client,
      addItem: async () => { mutationAttempted.push('addItem'); return { ok: true }; },
      loadBuildXml: async () => { mutationAttempted.push('loadBuildXml'); return { ok: true }; },
      exportBuildXml: async () => { mutationAttempted.push('exportBuildXml'); return ''; },
    };

    const text = textOf(await handleAnalyzeDefenses(context(guarded), 'occ-vortex', true));

    expect(text).toContain('Chaos Resistance Sweep');
    expect(simulated.length).toBeGreaterThan(1);
    expect(mutationAttempted).toEqual([]);
  });
});

describe('runResistanceSweep', () => {
  const sweepClient = (options: FakeClientOptions) => fakeClient(options);

  it('leaves nothing behind when a step throws', async () => {
    const { client } = sweepClient({});
    const exploding: SweepClient = {
      ...client,
      calcWith: async (params) => {
        if (params.repItem?.includes('Resistance')) throw new Error('engine blew up');
        return client.calcWith(params);
      },
    };

    // Nothing to unwind: a simulation that dies mid-flight never touched the build.
    await expect(runResistanceSweep(exploding, 'Chaos')).rejects.toThrow('engine blew up');
  });

  it('declines to measure through a carrier that moves the floor by itself', async () => {
    const { client } = sweepClient({ carrierDrifts: true });

    const result = await runResistanceSweep(client, 'Chaos');

    expect(result.summary).toBeUndefined();
    expect(result.note).toContain('substituting Ring 1 unmodified changed the floor');
  });

  it('declines when no equipped item can carry a test modifier', async () => {
    const { client } = sweepClient({ items: [{ slot: 'Weapon 1', raw: 'a wand' }] });

    const result = await runResistanceSweep(client, 'Chaos');

    expect(result.summary).toBeUndefined();
    expect(result.note).toContain('no equipped ring, amulet, belt or armour piece');
  });
});
