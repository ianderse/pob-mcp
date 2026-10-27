/**
 * Resolves printed item lines back to the affixes that produced them.
 *
 * The count that matters is affixes, not lines. One prefix can print a line that reads
 * like a suffix ("Pixie's" prints stun and block recovery under an energy shield roll),
 * and counting those lines separately turns "one open suffix" into "nothing possible".
 */

import type { ModEntry, AffixSlot } from "./modDataStore.js";

/** A number, or the (low-high) range PoB prints for an unrolled mod. */
interface NumericSpan {
  min: number;
  max: number;
}

const NUMERIC_TOKEN = /([+-]?)\((\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)\)|([+-]?\d+(?:\.\d+)?)/g;

/** PoB prefixes lines with tags like `{crafted}` or `{range:0.5}`. */
const stripTags = (line: string): string => line.replace(/^(\s*\{[^}]*\})+/, "").trim();

/**
 * Collapses every number to `#` so a rolled line and its data template compare equal.
 * "+9 to Strength" and "+(8-12) to Strength" both become "# to strength".
 */
export function statTemplate(line: string): string {
  return stripTags(line).replace(NUMERIC_TOKEN, "#").replace(/\s+/g, " ").trim().toLowerCase();
}

export function statValues(line: string): NumericSpan[] {
  return [...stripTags(line).matchAll(NUMERIC_TOKEN)].map((match) => {
    if (match[4] !== undefined) {
      const value = Number(match[4]);
      return { min: value, max: value };
    }
    // A descending range like -(35-25) means -35 to -25 once the sign is applied.
    const sign = match[1] === "-" ? -1 : 1;
    const bounds = [sign * Number(match[2]), sign * Number(match[3])];
    return { min: Math.min(...bounds), max: Math.max(...bounds) };
  });
}

const withinTier = (rolled: NumericSpan, tier: NumericSpan): boolean =>
  rolled.min >= tier.min - 1e-9 && rolled.max <= tier.max + 1e-9;

/** A rolled line fits a tier when its template matches and every value sits in range. */
function fitsTier(rolled: string, tierLine: string): boolean {
  if (statTemplate(rolled) !== statTemplate(tierLine)) return false;
  const rolledValues = statValues(rolled);
  const tierValues = statValues(tierLine);
  return rolledValues.length === tierValues.length && rolledValues.every((value, index) => withinTier(value, tierValues[index]));
}

export interface ResolvedAffix {
  /** The item lines this one affix accounts for. */
  lines: string[];
  type: AffixSlot;
  affix: string;
  group: string;
  source: ModEntry["source"];
  /** Every tier whose ranges contain the rolled values, lowest level first. */
  tiers: Array<{ id: string; affix: string; level: number; statLines: string[]; source: ModEntry["source"] }>;
  /** Lowest item level that can carry the matched tier, null when no tier matched. */
  minItemLevel: number | null;
  /** True when only the wording matched, so the tier and its ilvl are unknown. */
  valuesOutOfRange: boolean;
  /** Other affixes that could equally claim these lines. */
  alternatives: string[];
}

export interface AffixResolution {
  affixes: ResolvedAffix[];
  prefixCount: number;
  suffixCount: number;
  /** Remaining slots, or null when unmatched/ambiguous lines prevent a count. */
  openPrefixes: number | null;
  openSuffixes: number | null;
  /** Lines no listed affix explains; these may still occupy affix slots. */
  unmatched: string[];
  warnings: string[];
}

const MAX_AFFIXES_PER_SLOT = 3;

/** Templates index straight to candidates so we never scan five thousand entries per line. */
const templateIndexes = new WeakMap<ModEntry[], Map<string, ModEntry[]>>();

function indexByTemplate(entries: ModEntry[]): Map<string, ModEntry[]> {
  const cached = templateIndexes.get(entries);
  if (cached) return cached;

  const index = entries.reduce((built, entry) => {
    for (const template of new Set(entry.statLines.map(statTemplate))) {
      built.set(template, [...(built.get(template) ?? []), entry]);
    }
    return built;
  }, new Map<string, ModEntry[]>());

  templateIndexes.set(entries, index);
  return index;
}

interface Attempt {
  entry: ModEntry;
  /** Indices into the item's line list, in the entry's own line order. */
  consumed: number[];
}

/** Every line of the affix must be present and unclaimed, else the affix did not produce them. */
function attempt(entry: ModEntry, lines: string[], claimed: Set<number>, strict: boolean): Attempt | null {
  const consumed = entry.statLines.reduce<number[] | null>((taken, tierLine) => {
    if (taken === null) return null;
    const match = lines.findIndex(
      (line, index) =>
        !claimed.has(index) &&
        !taken.includes(index) &&
        (strict ? fitsTier(line, tierLine) : statTemplate(line) === statTemplate(tierLine))
    );
    return match === -1 ? null : [...taken, match];
  }, []);

  return consumed === null ? null : { entry, consumed };
}

/**
 * Hybrids first: a two-line affix and a one-line affix can both explain the energy
 * shield line, and only the hybrid also explains the stun recovery line beside it.
 */
const byHybridFirst = (a: ModEntry, b: ModEntry): number =>
  b.statLines.length - a.statLines.length || a.level - b.level || a.id.localeCompare(b.id);

function candidatesFor(line: string, index: Map<string, ModEntry[]>): ModEntry[] {
  return [...(index.get(statTemplate(line)) ?? [])].sort(byHybridFirst);
}

/** Tiers of the same affix that also explain the claimed lines, so the caller sees the ilvl band. */
function siblingTiers(chosen: Attempt, lines: string[], entries: ModEntry[], strict: boolean): ModEntry[] {
  return entries
    .filter((entry) => entry.group === chosen.entry.group && entry.type === chosen.entry.type)
    .filter((entry) => entry.statLines.length === chosen.consumed.length)
    .filter((entry) =>
      entry.statLines.every((tierLine, position) => {
        const line = lines[chosen.consumed[position]];
        return strict ? fitsTier(line, tierLine) : statTemplate(line) === statTemplate(tierLine);
      })
    )
    .sort((a, b) => a.level - b.level);
}

/** Affixes from another group that would explain exactly the same lines. */
function otherReadings(chosen: Attempt, lines: string[], index: Map<string, ModEntry[]>, strict: boolean): string[] {
  const rival = new Set(
    chosen.consumed
      .flatMap((lineIndex) => candidatesFor(lines[lineIndex], index))
      .filter((entry) => entry.group !== chosen.entry.group)
      .filter((entry) => attempt(entry, lines, new Set(), strict) !== null)
      .map((entry) => `${entry.type} "${entry.affix}" (${entry.group})`)
  );
  return [...rival];
}

function resolveAffix(chosen: Attempt, lines: string[], entries: ModEntry[], index: Map<string, ModEntry[]>, strict: boolean): ResolvedAffix {
  const tiers = siblingTiers(chosen, lines, entries, strict);
  return {
    lines: chosen.consumed.map((lineIndex) => lines[lineIndex]),
    type: chosen.entry.type,
    affix: chosen.entry.affix,
    group: chosen.entry.group,
    source: chosen.entry.source,
    tiers: tiers.map((tier) => ({ id: tier.id, affix: tier.affix, level: tier.level, statLines: tier.statLines, source: tier.source })),
    // A wording-only match sits in no tier, so any level we printed would be invented.
    minItemLevel: strict ? tiers[0]?.level ?? chosen.entry.level : null,
    valuesOutOfRange: !strict,
    alternatives: otherReadings(chosen, lines, index, strict),
  };
}

/**
 * Two passes. The first insists the rolled numbers fall inside a real tier, which is what
 * stops a hybrid from swallowing lines that merely share its wording. The second accepts a
 * wording-only match so an influenced or scaled roll still counts against a slot instead of
 * silently vanishing from the total.
 */
export function resolveAffixes(rawLines: string[], entries: ModEntry[]): AffixResolution {
  const lines = rawLines.map(stripTags).filter((line) => line.length > 0);
  const index = indexByTemplate(entries);
  const claimed = new Set<number>();

  const affixes = [true, false].flatMap((strict) =>
    lines.flatMap((line, lineIndex) => {
      if (claimed.has(lineIndex)) return [];
      const chosen = candidatesFor(line, index)
        .map((entry) => attempt(entry, lines, claimed, strict))
        .find((found): found is Attempt => found !== null);
      if (!chosen) return [];
      for (const consumed of chosen.consumed) claimed.add(consumed);
      return [resolveAffix(chosen, lines, entries, index, strict)];
    })
  );

  const prefixCount = affixes.filter((affix) => affix.type === "Prefix").length;
  const suffixCount = affixes.filter((affix) => affix.type === "Suffix").length;
  const overflow = [
    ...(prefixCount > MAX_AFFIXES_PER_SLOT ? [`Resolved ${prefixCount} prefixes; an item holds at most ${MAX_AFFIXES_PER_SLOT}. A hybrid was probably split, or the list mixes in implicit/unique/corrupted lines.`] : []),
    ...(suffixCount > MAX_AFFIXES_PER_SLOT ? [`Resolved ${suffixCount} suffixes; an item holds at most ${MAX_AFFIXES_PER_SLOT}. A hybrid was probably split, or the list mixes in implicit/unique/corrupted lines.`] : []),
  ];
  const unmatched = lines.filter((_line, lineIndex) => !claimed.has(lineIndex));
  const ambiguous = affixes.some((affix) => affix.alternatives.length > 0);
  const countsCertain = unmatched.length === 0 && !ambiguous && overflow.length === 0;

  return {
    affixes,
    prefixCount,
    suffixCount,
    openPrefixes: countsCertain ? Math.max(MAX_AFFIXES_PER_SLOT - prefixCount, 0) : null,
    openSuffixes: countsCertain ? Math.max(MAX_AFFIXES_PER_SLOT - suffixCount, 0) : null,
    unmatched,
    warnings: [
      ...overflow,
      ...(unmatched.length ? ['Unmatched explicit lines may occupy prefix or suffix slots, including several lines from one hybrid. Open slots are unknown.'] : []),
      ...(ambiguous ? ['Multiple affix readings are possible. Open slots are unknown.'] : []),
    ],
  };
}
