/**
 * Searches over PoB's affix tables: which bench crafts a base can take, and what tiers
 * of a stat exist. Both answer "can the player have this affix", which is a different
 * question from "does the item already have it" (see affixMatcher).
 */

import type { ModEntry, AffixSlot } from "./modDataStore.js";
import { loadExplicitMods, loadMasterMods } from "./modDataStore.js";

const matchesText = (entry: ModEntry, needle: string): boolean => {
  const lowered = needle.toLowerCase();
  return (
    entry.statLines.some((line) => line.toLowerCase().includes(lowered)) ||
    entry.affix.toLowerCase().includes(lowered) ||
    entry.group.toLowerCase().includes(lowered) ||
    entry.modTags.some((tag) => tag.includes(lowered))
  );
};

export interface CraftableQuery {
  itemClass: string;
  itemLevel: number;
  affixType?: AffixSlot;
  search?: string;
}

export interface CraftableResult {
  /** Bench crafts the base can take at this item level. */
  mods: ModEntry[];
  /** Crafts for this class that the item level locks out, so the caller can say why. */
  lockedByItemLevel: ModEntry[];
  /** Item classes the file knows, returned when the requested one matched nothing. */
  knownItemClasses: string[];
}

/**
 * Bench crafts are keyed by item class ("Body Armour"), not by the base tags explicit
 * mods use, so the two vocabularies never mix.
 */
export function findCraftableMods(query: CraftableQuery): CraftableResult {
  const entries = loadMasterMods();
  const knownItemClasses = [...new Set(entries.flatMap((entry) => entry.itemClasses))].sort();

  const forClass = entries
    .filter((entry) => entry.itemClasses.includes(query.itemClass))
    .filter((entry) => !query.affixType || entry.type === query.affixType)
    .filter((entry) => !query.search || matchesText(entry, query.search));

  return {
    mods: forClass.filter((entry) => entry.level <= query.itemLevel).sort(byGroupThenLevel),
    lockedByItemLevel: forClass.filter((entry) => entry.level > query.itemLevel).sort(byGroupThenLevel),
    knownItemClasses,
  };
}

const byGroupThenLevel = (a: ModEntry, b: ModEntry): number =>
  a.group.localeCompare(b.group) || a.level - b.level;

export interface TierQuery {
  search: string;
  affixType?: AffixSlot;
  /** Base tags from `weightKey`, e.g. "ring" or "int_armour". Matches any of them. */
  slotTags?: string[];
  maxItemLevel?: number;
  includeUnobtainable?: boolean;
  limit: number;
}

export interface TierResult {
  /** Matching tiers grouped by affix group, highest tier last. */
  groups: Array<{ group: string; type: AffixSlot; tiers: ModEntry[] }>;
  totalGroups: number;
  /** Every base tag in the file, offered when a slot filter matched nothing. */
  knownSlotTags: string[];
}

/**
 * Tier lookup over rollable (explicit) mods. Filtering is exact on the base tag because
 * the vocabulary is not a slot list: body armour carries `str_armour`/`int_armour`/… and
 * an influenced variant carries `body_armour_elder`, so a guessed expansion would quietly
 * mix mods the player cannot obtain into the answer.
 */
export function findAffixTiers(query: TierQuery): TierResult {
  const entries = loadExplicitMods();
  const knownSlotTags = [...new Set(entries.flatMap((entry) => entry.allSlotTags))].sort();

  const matched = entries
    .filter((entry) => matchesText(entry, query.search))
    .filter((entry) => !query.affixType || entry.type === query.affixType)
    .filter((entry) => query.includeUnobtainable || entry.obtainable)
    .filter((entry) => query.maxItemLevel === undefined || entry.level <= query.maxItemLevel)
    .filter((entry) => !query.slotTags?.length || entry.slotTags.some((tag) => query.slotTags?.includes(tag)));

  const grouped = matched.reduce((groups, entry) => {
    const key = `${entry.type}:${entry.group}`;
    return groups.set(key, [...(groups.get(key) ?? []), entry]);
  }, new Map<string, ModEntry[]>());

  const ordered = [...grouped.values()].map((tiers) => ({
    group: tiers[0].group,
    type: tiers[0].type,
    tiers: [...tiers].sort((a, b) => a.level - b.level),
  }));

  return {
    groups: ordered.slice(0, query.limit),
    totalGroups: ordered.length,
    knownSlotTags,
  };
}
