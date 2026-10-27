/**
 * Affix and crafting intelligence, read straight out of Path of Building's own mod tables.
 *
 * These three answer the questions the item recipe used to make an agent answer by hand:
 * what affixes an item already carries, what the bench can add, and what a stat is worth.
 */

import type { AffixSlot } from "../services/modDataStore.js";
import { loadAllMods } from "../services/modDataStore.js";
import { resolveAffixes } from "../services/affixMatcher.js";
import { findAffixTiers, findCraftableMods } from "../services/affixQuery.js";
import { wrapHandler } from "../utils/errorHandling.js";

const text = (lines: string[]) => ({ content: [{ type: "text" as const, text: lines.join("\n") }] });

const affixType = (value: string | undefined): AffixSlot | undefined =>
  value === "Prefix" || value === "Suffix" ? value : undefined;

const tierRange = (statLines: string[]): string => statLines.join(" / ");

export async function handleClassifyItemAffixes(args: { mod_lines: string[] }) {
  return wrapHandler("classify item affixes", async () => {
    const lines = args.mod_lines ?? [];
    if (!lines.length) throw new Error("mod_lines was empty. Pass the item's explicit mod lines, one per entry.");

    const resolution = resolveAffixes(lines, loadAllMods());

    const body = resolution.affixes.flatMap((affix) => {
      const tierList = affix.tiers.length
        ? affix.tiers.map((tier) => `ilvl ${tier.level} "${tier.affix}" ${tierRange(tier.statLines)}${tier.source === "master" ? " [bench craft]" : ""}`)
        : ["no tier in the data covers these values"];

      return [
        `${affix.type} "${affix.affix}" (${affix.group})${affix.valuesOutOfRange ? " [wording matched, values outside every tier]" : ""}`,
        ...affix.lines.map((line) => `    ${line}`),
        `    Minimum item level: ${affix.minItemLevel ?? "unknown, the values match no tier"}`,
        ...(affix.lines.length > 1 ? [`    Hybrid: these ${affix.lines.length} lines are ONE ${affix.type.toLowerCase()}, not ${affix.lines.length}.`] : []),
        ...tierList.map((tier) => `    tier: ${tier}`),
        ...(affix.alternatives.length ? [`    Ambiguous: these lines could also be ${affix.alternatives.join("; ")}`] : []),
        "",
      ];
    });

    return text([
      "=== Affix Classification ===",
      "",
      ...(resolution.openPrefixes === null || resolution.openSuffixes === null
        ? [`Matched prefixes: ${resolution.prefixCount}/3   Matched suffixes: ${resolution.suffixCount}/3`,
          'Open affix slots: unknown. Verify the item in game before recommending a craft.']
        : [`Prefixes: ${resolution.prefixCount}/3 (${resolution.openPrefixes} open)   Suffixes: ${resolution.suffixCount}/3 (${resolution.openSuffixes} open)`]),
      "",
      ...body,
      ...(resolution.unmatched.length
        ? ["Unmatched lines (affix type and slot occupancy unknown):", ...resolution.unmatched.map((line) => `  ${line}`), ""]
        : []),
      ...resolution.warnings.map((warning) => `WARNING: ${warning}`),
    ]);
  });
}

export async function handleListCraftableMods(args: {
  item_class: string;
  item_level: number;
  affix_type?: string;
  search?: string;
}) {
  return wrapHandler("list craftable mods", async () => {
    const result = findCraftableMods({
      itemClass: args.item_class,
      itemLevel: args.item_level,
      affixType: affixType(args.affix_type),
      search: args.search,
    });

    if (!result.mods.length && !result.lockedByItemLevel.length) {
      return text([
        `No bench crafts found for item class "${args.item_class}".`,
        "",
        `Known item classes: ${result.knownItemClasses.join(", ")}`,
      ]);
    }

    const render = (mods: typeof result.mods) =>
      mods.map((mod) => `  [${mod.type}] ilvl ${mod.level} "${mod.affix}" ${mod.statLines.join(" / ")}${mod.statLines.length > 1 ? "  (hybrid: one affix)" : ""}`);

    return text([
      `=== Bench Crafts for ${args.item_class} at item level ${args.item_level} ===`,
      "",
      "A craft occupies a slot of its own type, so a prefix craft cannot fill an open suffix.",
      "",
      `Available (${result.mods.length}):`,
      ...render(result.mods),
      "",
      ...(result.lockedByItemLevel.length
        ? [`Locked by item level (${result.lockedByItemLevel.length}), listed so you can say what a higher base would buy:`, ...render(result.lockedByItemLevel)]
        : []),
    ]);
  });
}

export async function handleFindAffixTiers(args: {
  search: string;
  affix_type?: string;
  slot_tags?: string[];
  max_item_level?: number;
  include_unobtainable?: boolean;
  max_results?: number;
}) {
  return wrapHandler("find affix tiers", async () => {
    if (!args.search) throw new Error("search was empty. Pass the stat wording you need, e.g. 'Chaos Resistance'.");

    const result = findAffixTiers({
      search: args.search,
      affixType: affixType(args.affix_type),
      slotTags: args.slot_tags,
      maxItemLevel: args.max_item_level,
      includeUnobtainable: args.include_unobtainable ?? false,
      limit: args.max_results ?? 10,
    });

    if (!result.groups.length) {
      const suggestions = args.slot_tags?.length
        ? result.knownSlotTags.filter((tag) => args.slot_tags?.some((wanted) => tag.includes(wanted.toLowerCase())))
        : [];
      return text([
        `No rollable affix matched "${args.search}"${args.slot_tags?.length ? ` on ${args.slot_tags.join(", ")}` : ""}.`,
        ...(suggestions.length ? ["", `Related base tags in the data: ${suggestions.join(", ")}`] : []),
        "",
        "Base tags are PoB's own vocabulary, not slot names. Body armour bases carry str_armour / dex_armour / int_armour and their hybrids; influenced variants add a suffix such as _elder.",
      ]);
    }

    const body = result.groups.flatMap((group) => [
      `${group.type} — ${group.group}`,
      ...group.tiers.map(
        (tier) =>
          `  ilvl ${tier.level} "${tier.affix}" ${tier.statLines.join(" / ")}` +
          `${tier.statLines.length > 1 ? " (hybrid: one affix)" : ""}` +
          `\n      rolls on: ${tier.slotTags.length ? tier.slotTags.join(", ") : "nothing (every spawn weight is zero)"}`
      ),
      "",
    ]);

    return text([
      `=== Affix Tiers matching "${args.search}" ===`,
      "",
      `${result.groups.length} of ${result.totalGroups} matching affix groups. ilvl is the minimum item level.`,
      'Entries are ordered by required item level. T1/T2 labels are not inferred from result order; these tables provide no authoritative tier-number field.',
      "",
      ...body,
    ]);
  });
}
