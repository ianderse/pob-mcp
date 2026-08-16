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
 * PoB has no API for injecting a bare modifier, so each step appends the
 * resistance line to an equipped item and asks the calculator to substitute it
 * for one calculation. Nothing is equipped and the loaded build never changes,
 * so this tool cannot leave a probe modifier behind in the user's session.
 */
import {
  analyzeMaxHits,
  summariseResistanceSweep,
  type DamageType,
  type ResistanceSweepSummary,
  type SweepStep,
} from "../defensiveAnalyzer.js";
import type { CalcWithParams } from "../pobLuaBridge.js";

/** Only the bridge surface the sweep uses, so a test can supply a plain object. */
export interface SweepClient {
  getItems(): Promise<any[]>;
  calcWith(params: CalcWithParams): Promise<{ output: any; base: any }>;
}

export interface SweepResult {
  summary?: ResistanceSweepSummary;
  /** Why no sweep ran. */
  note?: string;
}

/**
 * Slots whose item can carry an extra modifier. Rings first: they are the
 * least likely to be the build's damage source, so substituting one disturbs least.
 */
const CARRIER_SLOTS: readonly string[] = [
  'Ring 2', 'Ring 1', 'Amulet', 'Belt', 'Gloves', 'Boots', 'Helmet', 'Body Armour',
];

const DEFAULT_STEP = 5;
const DEFAULT_MAX_DELTA = 60;

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
function readFloor(output: Record<string, any>, element: DamageType): Measurement | null {
  const resistedBinding = analyzeMaxHits(output).resistedBinding;
  if (!resistedBinding) return null;
  return {
    floor: resistedBinding.maxHit,
    bindingType: resistedBinding.type,
    resist: Math.round(parseFloat(output[`${element}Resist`]) || 0),
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
  options: { step?: number; maxDelta?: number } = {}
): Promise<SweepResult> {
  const step = options.step ?? DEFAULT_STEP;
  const maxDelta = options.maxDelta ?? DEFAULT_MAX_DELTA;

  const items = await client.getItems();
  const carrier = CARRIER_SLOTS
    .map((slot) => items.find((item) => item?.slot === slot && typeof item?.raw === 'string'))
    .find((item) => item !== undefined);
  if (!carrier) {
    return {
      note: `Sweep skipped: no equipped ring, amulet, belt or armour piece to carry a test modifier (tried ${CARRIER_SLOTS.join(', ')}).`,
    };
  }

  // Substituting the carrier unmodified must reproduce the build exactly. If it
  // does not, the item text did not round-trip and every step measured through
  // it would be reporting the carrier rather than the resistance.
  const control = await client.calcWith({ repItem: carrier.raw, repSlotName: carrier.slot });
  const baseline = readFloor(control.base, element);
  const controlFloor = readFloor(control.output, element);
  if (!baseline) {
    return { note: 'Sweep skipped: PoB reported no max hit stats to sweep against.' };
  }
  if (!controlFloor || controlFloor.floor !== baseline.floor) {
    return {
      note: `Sweep skipped: substituting ${carrier.slot} unmodified changed the floor ` +
        `(${Math.round(baseline.floor).toLocaleString()} → ${controlFloor ? Math.round(controlFloor.floor).toLocaleString() : 'unavailable'}), ` +
        'so nothing measured through it would be trustworthy.',
    };
  }

  const steps: SweepStep[] = [];
  for (let delta = step; delta <= maxDelta; delta += step) {
    const { output } = await client.calcWith({
      repItem: `${carrier.raw}\n+${delta}% to ${element} Resistance`,
      repSlotName: carrier.slot,
    });
    const measured = readFloor(output, element);
    if (!measured) break;

    steps.push({ delta, resist: measured.resist, floor: measured.floor, bindingType: measured.bindingType });

    const previousResist = steps.length > 1 ? steps[steps.length - 2].resist : baseline.resist;
    // Handing the floor over, or capping out, both end the useful range.
    if (measured.bindingType !== element || measured.resist === previousResist) break;
  }

  if (steps.length === 0) return { note: 'Sweep produced no measurements.' };

  return {
    summary: summariseResistanceSweep(
      element,
      { resist: baseline.resist, floor: baseline.floor, bindingType: baseline.bindingType },
      steps
    ),
  };
}
