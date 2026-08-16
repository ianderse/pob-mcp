/**
 * Measure what a resistance purchase is actually worth, one PoB calculation
 * per step.
 *
 * A resistance stops paying the moment it is no longer the lowest max hit, and
 * no closed form predicts that point: PoB's max hit is not a clean 1/(1-res)
 * curve, so a fitted model puts the crossover several resistance points off.
 * The engine is cheap here (about half a second per step), so the sweep asks it
 * instead of modelling it.
 *
 * PoB has no API for injecting a modifier, so the sweep appends the resistance
 * line to an equipped item and re-equips it — the carrier trick. The carrier is
 * verified against the baseline before any step is trusted, and the whole build
 * is restored from an exported snapshot afterwards.
 */
import {
  DEFENSIVE_STAT_FIELDS,
  analyzeMaxHits,
  summariseResistanceSweep,
  type DamageType,
  type ResistanceSweepSummary,
  type SweepStep,
} from "../defensiveAnalyzer.js";

/** Only the bridge surface the sweep uses, so a test can supply a plain object. */
export interface SweepClient {
  getItems(): Promise<any[]>;
  addItem(itemText: string, slotName?: string, noAutoEquip?: boolean): Promise<any>;
  getStats(fields?: string[]): Promise<Record<string, any>>;
  exportBuildXml(): Promise<string>;
  loadBuildXml(xml: string, name?: string): Promise<any>;
}

export interface SweepResult {
  summary?: ResistanceSweepSummary;
  /** Why no sweep ran, or what went wrong while restoring the build. */
  note?: string;
}

/**
 * Slots whose item can carry an extra modifier. Rings first: they are the
 * least likely to be the build's damage source, so a re-equip disturbs least.
 */
const CARRIER_SLOTS: readonly string[] = [
  'Ring 2', 'Ring 1', 'Amulet', 'Belt', 'Gloves', 'Boots', 'Helmet', 'Body Armour',
];

const DEFAULT_STEP = 5;
const DEFAULT_MAX_DELTA = 60;

const fieldList = [...DEFENSIVE_STAT_FIELDS];

interface Measurement {
  floor: number;
  bindingType: DamageType;
  resist: number;
}

/**
 * The floor a resistance purchase can move, i.e. the lowest max hit among the
 * resisted types. Physical is excluded deliberately: it is often the overall
 * floor and no resistance touches it, so measuring against it would report
 * every step as worthless and hide the ranking between resistances.
 */
async function measure(client: SweepClient, element: DamageType): Promise<Measurement | null> {
  const stats = await client.getStats(fieldList);
  const resistedBinding = analyzeMaxHits(stats).resistedBinding;
  if (!resistedBinding) return null;
  return {
    floor: resistedBinding.maxHit,
    bindingType: resistedBinding.type,
    resist: Math.round(parseFloat(stats[`${element}Resist`]) || 0),
  };
}

/**
 * Step `element` resistance upward until it stops owning the floor.
 *
 * The bridge is single-request by design, so every call here is sequential.
 */
export async function runResistanceSweep(
  client: SweepClient,
  element: DamageType,
  options: { step?: number; maxDelta?: number; buildName?: string } = {}
): Promise<SweepResult> {
  const step = options.step ?? DEFAULT_STEP;
  const maxDelta = options.maxDelta ?? DEFAULT_MAX_DELTA;

  const baseline = await measure(client, element);
  if (!baseline) {
    return { note: 'Sweep skipped: PoB reported no max hit stats to sweep against.' };
  }

  const items = await client.getItems();
  const carrier = CARRIER_SLOTS
    .map((slot) => items.find((item) => item?.slot === slot && typeof item?.raw === 'string'))
    .find((item) => item !== undefined);
  if (!carrier) {
    return {
      note: `Sweep skipped: no equipped ring, amulet, belt or armour piece to carry a test modifier (tried ${CARRIER_SLOTS.join(', ')}).`,
    };
  }

  const snapshot = await client.exportBuildXml();
  let result: SweepResult;

  try {
    // Re-equip the carrier unmodified first. If that alone moves the floor, the
    // sweep would be measuring the carrier rather than the resistance.
    await client.addItem(carrier.raw, carrier.slot);
    const control = await measure(client, element);
    if (!control || control.floor !== baseline.floor) {
      result = {
        note: `Sweep skipped: re-equipping ${carrier.slot} unmodified changed the floor ` +
          `(${Math.round(baseline.floor).toLocaleString()} → ${control ? Math.round(control.floor).toLocaleString() : 'unavailable'}), ` +
          'so nothing measured through it would be trustworthy.',
      };
    } else {
      const steps: SweepStep[] = [];
      for (let delta = step; delta <= maxDelta; delta += step) {
        await client.addItem(`${carrier.raw}\n+${delta}% to ${element} Resistance`, carrier.slot);
        const measured = await measure(client, element);
        if (!measured) break;

        steps.push({ delta, resist: measured.resist, floor: measured.floor, bindingType: measured.bindingType });

        const previousResist = steps.length > 1 ? steps[steps.length - 2].resist : baseline.resist;
        // Handing the floor over, or capping out, both end the useful range.
        if (measured.bindingType !== element || measured.resist === previousResist) break;
      }

      result = steps.length === 0
        ? { note: 'Sweep produced no measurements.' }
        : {
          summary: summariseResistanceSweep(
            element,
            { resist: baseline.resist, floor: baseline.floor, bindingType: baseline.bindingType },
            steps
          ),
        };
    }
  } finally {
    await client.loadBuildXml(snapshot, options.buildName ?? 'restored build');
  }

  // Read the build back after the restore. A probe modifier left behind in the
  // user's live session is exactly the silent corruption this tool exists to
  // avoid, and only a measurement can tell whether the reload landed.
  const restored = await measure(client, element);
  if (restored && restored.floor === baseline.floor) return result;

  const warning = `WARNING: the build did not restore cleanly after the sweep (floor ${
    restored ? Math.round(restored.floor).toLocaleString() : 'unavailable'
  }, expected ${Math.round(baseline.floor).toLocaleString()}). Reload the build before trusting any further reading.`;

  return { ...result, note: [result.note, warning].filter(Boolean).join('\n\n') };
}
