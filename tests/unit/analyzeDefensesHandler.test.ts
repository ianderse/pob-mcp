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
  const equipped: string[] = [];
  const loaded: string[] = [];
  let extra: { maxHit: number; resist: number } | null = null;

  const client = {
    getBuildInfo: async () => ({ name: 'occ-vortex' }),
    listSpecs: async () => ({ specs: [] }),
    listItemSets: async () => ({ itemSets: [] }),
    getItems: async () => options.items ?? [RING],
    exportBuildXml: async () => '<PathOfBuilding>snapshot</PathOfBuilding>',
    loadBuildXml: async (xml: string) => {
      loaded.push(xml);
      extra = null;
      return { ok: true };
    },
    addItem: async (itemText: string, slotName?: string) => {
      equipped.push(`${slotName}:${itemText}`);
      const match = itemText.match(/\+(\d+)% to Chaos Resistance/);
      if (!match) {
        extra = options.carrierDrifts ? { maxHit: 1, resist: 68 } : null;
        return { ok: true };
      }
      extra = options.chaosByDelta?.[Number(match[1])] ?? null;
      return { ok: true };
    },
    getStats: async (fields?: string[]) => {
      requestedFields.push(fields ?? []);
      const overrides: Record<string, number> = extra
        ? { ChaosMaximumHitTaken: extra.maxHit, ChaosResist: extra.resist }
        : {};
      const all: Record<string, number> = { ...OCC_VORTEX, ...overrides };
      // PoB serves only what it was asked for, and its no-field default set
      // carries no *MaximumHitTaken at all. Reproduce that here, or a handler
      // that forgets the field list still looks like it works.
      const served = fields ?? Object.keys(all).filter((key) => !key.endsWith('MaximumHitTaken'));
      return Object.fromEntries(served.filter((key) => key in all).map((key) => [key, all[key]]));
    },
  };

  return { client, requestedFields, equipped, loaded };
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
    const { client, equipped } = fakeClient();

    const text = textOf(await handleAnalyzeDefenses(context(client), 'occ-vortex'));

    expect(equipped).toHaveLength(0);
    expect(text).not.toContain('Resistance Sweep');
  });

  it('sweeps the weakest resisted type and stops it at the cap', async () => {
    const { client, equipped, loaded } = fakeClient({
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
    expect(equipped.length).toBeGreaterThan(1);
    expect(loaded).toContain('<PathOfBuilding>snapshot</PathOfBuilding>');
  });
});

describe('runResistanceSweep', () => {
  const sweepClient = (options: FakeClientOptions) => fakeClient(options);

  it('restores the build from a snapshot even when a step throws', async () => {
    const { client, loaded } = sweepClient({});
    const exploding: SweepClient = {
      ...client,
      addItem: async (itemText: string, slotName?: string) => {
        if (itemText.includes('Resistance')) throw new Error('engine blew up');
        return client.addItem(itemText, slotName);
      },
    };

    await expect(runResistanceSweep(exploding, 'Chaos')).rejects.toThrow('engine blew up');
    expect(loaded).toContain('<PathOfBuilding>snapshot</PathOfBuilding>');
  });

  it('declines to measure through a carrier that moves the floor by itself', async () => {
    const { client } = sweepClient({ carrierDrifts: true });

    const result = await runResistanceSweep(client, 'Chaos');

    expect(result.summary).toBeUndefined();
    expect(result.note).toContain('re-equipping Ring 1 unmodified changed the floor');
  });

  it('declines when no equipped item can carry a test modifier', async () => {
    const { client } = sweepClient({ items: [{ slot: 'Weapon 1', raw: 'a wand' }] });

    const result = await runResistanceSweep(client, 'Chaos');

    expect(result.summary).toBeUndefined();
    expect(result.note).toContain('no equipped ring, amulet, belt or armour piece');
  });
});
