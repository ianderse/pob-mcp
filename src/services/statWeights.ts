/**
 * What is a typical roll of each affix worth to THIS build, measured by the
 * calculator rather than guessed from a generic weighting.
 *
 * PoB has no API for injecting a bare modifier, so each probe appends one line
 * to an equipped item and asks the calculator to substitute that item for a
 * single calculation (the same technique as the resistance sweep). Nothing is
 * equipped and the loaded build never changes.
 *
 * The risk in this method is the silent zero: a capped resistance, an affix the
 * build does not scale and a line PoB cannot parse all report a delta of zero.
 * So every probe is classified instead of reported as a bare number:
 *  - unparsed lines come back from the bridge and mark the probe `unrecognised`;
 *  - resistances are clamped to the headroom below their cap, or marked `capped`;
 *  - a probe that moved something is repeated at twice the size, and one whose
 *    per-unit value shifts by more than 10% is marked `nonlinear`.
 */
import type { CalcWithParams } from "../pobLuaBridge.js";
import { pickCarrier, type CarrierItem } from "./carrier.js";

/** Only the bridge surface the weights use, so a test can supply a plain object. */
export interface StatWeightClient {
  getItems(): Promise<any[]>;
  calcWith(params: CalcWithParams): Promise<{ output: any; base: any; unrecognisedLines?: string[] }>;
}

export type WeightFocus = 'dps' | 'defence' | 'both';
type ProbeGroup = 'offence' | 'defence';

export interface Probe {
  id: string;
  label: string;
  group: ProbeGroup;
  /** A typical high-tier roll of this affix, in the unit the line uses. */
  roll: number;
  line(n: number): string;
  /** Resistances only: the element whose headroom below the cap limits the roll. */
  resistElement?: 'Fire' | 'Cold' | 'Lightning' | 'Chaos';
}

const DAMAGE_TYPES = ['Physical', 'Fire', 'Cold', 'Lightning', 'Chaos'] as const;
const ELEMENTS = ['Fire', 'Cold', 'Lightning', 'Chaos'] as const;

const flatAdded = (type: string, target: 'Attacks' | 'Spells'): Probe => ({
  id: `added-${type.toLowerCase()}-${target.toLowerCase()}`,
  label: `Adds ${type} Damage to ${target}`,
  group: 'offence',
  roll: 15,
  line: (n) => `Adds ${n} to ${n * 2} ${type} Damage to ${target}`,
});

export const PROBES: readonly Probe[] = [
  // Defence.
  { id: 'life-flat', label: '+ maximum Life', group: 'defence', roll: 90, line: (n) => `+${n} to maximum Life` },
  { id: 'life-inc', label: '% increased maximum Life', group: 'defence', roll: 10, line: (n) => `${n}% increased maximum Life` },
  { id: 'es-flat', label: '+ maximum Energy Shield', group: 'defence', roll: 80, line: (n) => `+${n} to maximum Energy Shield` },
  { id: 'es-inc', label: '% increased maximum Energy Shield', group: 'defence', roll: 15, line: (n) => `${n}% increased maximum Energy Shield` },
  { id: 'armour-flat', label: '+ Armour', group: 'defence', roll: 300, line: (n) => `+${n} to Armour` },
  { id: 'armour-inc', label: '% increased Armour', group: 'defence', roll: 40, line: (n) => `${n}% increased Armour` },
  { id: 'evasion-flat', label: '+ Evasion Rating', group: 'defence', roll: 300, line: (n) => `+${n} to Evasion Rating` },
  { id: 'evasion-inc', label: '% increased Evasion Rating', group: 'defence', roll: 40, line: (n) => `${n}% increased Evasion Rating` },
  ...ELEMENTS.map((element): Probe => ({
    id: `res-${element.toLowerCase()}`,
    label: `+% ${element} Resistance`,
    group: 'defence',
    roll: 45,
    line: (n) => `+${n}% to ${element} Resistance`,
    resistElement: element,
  })),
  { id: 'max-res', label: '+1% all maximum Resistances', group: 'defence', roll: 1, line: (n) => `+${n}% to all maximum Resistances` },
  { id: 'block-attack', label: '+% Chance to Block Attack Damage', group: 'defence', roll: 8, line: (n) => `+${n}% Chance to Block Attack Damage` },
  { id: 'suppression', label: '+% chance to Suppress Spell Damage', group: 'defence', roll: 15, line: (n) => `+${n}% chance to Suppress Spell Damage` },
  { id: 'str', label: '+ Strength', group: 'defence', roll: 40, line: (n) => `+${n} to Strength` },
  { id: 'dex', label: '+ Dexterity', group: 'defence', roll: 40, line: (n) => `+${n} to Dexterity` },
  { id: 'int', label: '+ Intelligence', group: 'defence', roll: 40, line: (n) => `+${n} to Intelligence` },

  // Offence.
  { id: 'inc-damage', label: '% increased Damage', group: 'offence', roll: 25, line: (n) => `${n}% increased Damage` },
  { id: 'inc-spell', label: '% increased Spell Damage', group: 'offence', roll: 30, line: (n) => `${n}% increased Spell Damage` },
  { id: 'inc-attack', label: '% increased Attack Damage', group: 'offence', roll: 30, line: (n) => `${n}% increased Attack Damage` },
  { id: 'inc-elemental', label: '% increased Elemental Damage', group: 'offence', roll: 25, line: (n) => `${n}% increased Elemental Damage` },
  { id: 'inc-dot', label: '% increased Damage over Time', group: 'offence', roll: 30, line: (n) => `${n}% increased Damage over Time` },
  ...DAMAGE_TYPES.map((type): Probe => ({
    id: `inc-${type.toLowerCase()}`,
    label: `% increased ${type} Damage`,
    group: 'offence',
    roll: 25,
    line: (n) => `${n}% increased ${type} Damage`,
  })),
  { id: 'attack-speed', label: '% increased Attack Speed', group: 'offence', roll: 15, line: (n) => `${n}% increased Attack Speed` },
  { id: 'cast-speed', label: '% increased Cast Speed', group: 'offence', roll: 15, line: (n) => `${n}% increased Cast Speed` },
  { id: 'crit-chance', label: '% increased Global Critical Strike Chance', group: 'offence', roll: 40, line: (n) => `${n}% increased Global Critical Strike Chance` },
  { id: 'crit-multi', label: '+% Global Critical Strike Multiplier', group: 'offence', roll: 30, line: (n) => `+${n}% to Global Critical Strike Multiplier` },
  ...DAMAGE_TYPES.map((type) => flatAdded(type, 'Attacks')),
  ...DAMAGE_TYPES.map((type) => flatAdded(type, 'Spells')),
  ...(['Fire', 'Cold', 'Lightning'] as const).map((element): Probe => ({
    id: `pen-${element.toLowerCase()}`,
    label: `Damage Penetrates ${element} Resistance`,
    group: 'offence',
    roll: 10,
    line: (n) => `Damage Penetrates ${n}% ${element} Resistance`,
  })),
];

export type ProbeStatus =
  | 'ok'
  /** Moved neither DPS nor EHP: irrelevant to this build, or capped out. */
  | 'no_effect'
  /** A resistance with no room left below its cap. */
  | 'capped'
  /** PoB could not parse the probe line, so the zero says nothing about the build. */
  | 'unrecognised'
  /** Per-unit value changes with size, so the figure is only good near this roll. */
  | 'nonlinear';

export interface ProbeResult {
  id: string;
  label: string;
  group: ProbeGroup;
  /** The roll actually measured; below the typical roll when a cap limited it. */
  roll: number;
  status: ProbeStatus;
  /** Percentage change of the DPS and EHP figures for this roll. */
  dpsPct: number;
  ehpPct: number;
  /** Weighted blend of the two according to the requested focus. */
  score: number;
  note?: string;
}

export interface StatWeightReport {
  slot: string;
  focus: WeightFocus;
  baseDps: number;
  baseEhp: number;
  /** Probes that moved something, best first. */
  ranked: ProbeResult[];
  /** Probes that measured nothing, with why. */
  inert: ProbeResult[];
  probeCount: number;
}

interface StatWeightResult {
  report?: StatWeightReport;
  /** Why no weights were produced. */
  note?: string;
}

const NONLINEAR_TOLERANCE = 0.1;
/** Below this an effect is rounding noise rather than a result. */
const EPSILON = 1e-9;

const dpsOf = (stats: Record<string, any>): number => Number(stats?.CombinedDPS ?? stats?.TotalDPS ?? 0) || 0;
const ehpOf = (stats: Record<string, any>): number => Number(stats?.TotalEHP ?? 0) || 0;
const pct = (after: number, before: number): number => (before > 0 ? ((after - before) / before) * 100 : 0);

const FOCUS_WEIGHTS: Record<WeightFocus, { dps: number; ehp: number }> = {
  dps: { dps: 1, ehp: 0 },
  defence: { dps: 0, ehp: 1 },
  both: { dps: 0.5, ehp: 0.5 },
};

export async function computeStatWeights(
  client: StatWeightClient,
  options: { focus?: WeightFocus; slot?: string } = {}
): Promise<StatWeightResult> {
  const focus = options.focus ?? 'both';
  const weights = FOCUS_WEIGHTS[focus];

  const items = await client.getItems();
  const carrier: CarrierItem | undefined = pickCarrier(items, options.slot);
  if (!carrier) {
    return {
      note: options.slot
        ? `Stat weights skipped: nothing is equipped in ${options.slot}.`
        : 'Stat weights skipped: no equipped ring, amulet, belt or armour piece to carry a test modifier.',
    };
  }

  // Substituting the carrier unmodified must reproduce the build exactly. If it
  // does not, the item text did not round-trip and every probe would be
  // measuring the carrier rather than the affix.
  const control = await client.calcWith({ repItem: carrier.raw, repSlotName: carrier.slot, useFullDPS: false });
  const baseDps = dpsOf(control.base);
  const baseEhp = ehpOf(control.base);
  if (baseDps <= 0 && baseEhp <= 0) {
    return { note: 'Stat weights skipped: PoB reported neither DPS nor EHP for this build.' };
  }
  if (Math.abs(dpsOf(control.output) - baseDps) > baseDps * 1e-6 || Math.abs(ehpOf(control.output) - baseEhp) > baseEhp * 1e-6) {
    return {
      note: `Stat weights skipped: substituting ${carrier.slot} unmodified changed DPS or EHP, ` +
        'so nothing measured through it would be trustworthy.',
    };
  }
  // Lines the carrier already carries that PoB cannot parse are not the probe's fault.
  const carrierUnparsed = new Set(control.unrecognisedLines ?? []);

  const measure = async (probe: Probe, roll: number) => {
    const { output, unrecognisedLines } = await client.calcWith({
      repItem: `${carrier.raw}\n${probe.line(roll)}`,
      repSlotName: carrier.slot,
      useFullDPS: false,
    });
    const unparsed = (unrecognisedLines ?? []).filter((line) => !carrierUnparsed.has(line));
    return { dpsPct: pct(dpsOf(output), baseDps), ehpPct: pct(ehpOf(output), baseEhp), unparsed };
  };

  const results: ProbeResult[] = [];
  for (const probe of PROBES) {
    let roll = probe.roll;
    const result: ProbeResult = {
      id: probe.id, label: probe.label, group: probe.group, roll,
      status: 'ok', dpsPct: 0, ehpPct: 0, score: 0,
    };

    let clamped = false;
    if (probe.resistElement) {
      const headroom = Math.max(0, Number(control.base?.[`Missing${probe.resistElement}Resist`]) || 0);
      if (headroom <= 0) {
        result.status = 'capped';
        result.roll = 0;
        result.note = `${probe.resistElement} resistance is already at its cap`;
        results.push(result);
        continue;
      }
      if (headroom < roll) {
        roll = headroom;
        clamped = true;
        result.roll = roll;
        result.note = `only ${headroom}% of headroom below the cap`;
      }
    }

    const first = await measure(probe, roll);
    if (first.unparsed.length > 0) {
      result.status = 'unrecognised';
      result.note = `PoB did not recognise: ${first.unparsed.join('; ')}`;
      results.push(result);
      continue;
    }
    result.dpsPct = first.dpsPct;
    result.ehpPct = first.ehpPct;
    result.score = weights.dps * first.dpsPct + weights.ehp * first.ehpPct;

    if (Math.abs(first.dpsPct) < EPSILON && Math.abs(first.ehpPct) < EPSILON) {
      result.status = 'no_effect';
      result.note = result.note ?? 'does not change DPS or EHP on this build';
      results.push(result);
      continue;
    }

    // A rolled-back roll is already at the edge of its range, so doubling it would
    // measure past the cap and mislabel a hard stop as curvature.
    if (!clamped) {
      const second = await measure(probe, roll * 2);
      const drifted = (single: number, doubled: number): boolean =>
        Math.abs(doubled / 2 - single) > Math.max(Math.abs(single), Math.abs(doubled / 2)) * NONLINEAR_TOLERANCE;
      if (second.unparsed.length === 0 && (drifted(first.dpsPct, second.dpsPct) || drifted(first.ehpPct, second.ehpPct))) {
        result.status = 'nonlinear';
        result.note = `doubling it gives ${second.dpsPct.toFixed(1)}% DPS / ${second.ehpPct.toFixed(1)}% EHP, ` +
          'not twice this roll, so the figure holds only near this size';
      }
    }
    results.push(result);
  }

  const moved = results.filter((r) => r.status === 'ok' || r.status === 'nonlinear');
  return {
    report: {
      slot: carrier.slot,
      focus,
      baseDps,
      baseEhp,
      ranked: moved.sort((a, b) => b.score - a.score),
      inert: results.filter((r) => !moved.includes(r)),
      probeCount: results.length,
    },
  };
}
