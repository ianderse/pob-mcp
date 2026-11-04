import type { PoBBuild, PoBItemEntry, PoBItemSet, PoBItemSetSlot } from "../types.js";

/**
 * Shared normalisation of PoB's fast-xml-parser build shape.
 *
 * fast-xml-parser turns a repeated element into an array only when it occurs
 * more than once — so `ItemSet`, `Slot`, `Item` etc. are each `T | T[]` in
 * every consumer. Several services grew near-identical unwrapping code (and
 * one divergent copy shipped a bug where multi-set builds read the wrong
 * set). These helpers are the single truth for that XML quirk.
 */

/** `T | T[] | undefined` → `T[]` (never mutates or copies elements). */
export function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

/** The item-set list of a build, array-normalised. */
export function itemSetsOf(build: PoBBuild): PoBItemSet[] {
  return asArray(build.Items?.ItemSet);
}

/**
 * The gear set PoB considers active: `Items.activeItemSet`, else the first
 * set that has slots, else the first — matching how the XML actually appears
 * for single-set builds (no activeItemSet attribute at all).
 */
export function activeItemSetOf(build: PoBBuild): PoBItemSet | undefined {
  const sets = itemSetsOf(build);
  if (sets.length === 0) return undefined;
  const activeId = build.Items?.activeItemSet;
  if (activeId !== undefined) {
    const match = sets.find((s) => String(s.id) === String(activeId));
    if (match) return match;
  }
  return sets.find((s) => s.Slot !== undefined) ?? sets[0];
}

/** Slots of the active gear set, array-normalised, order preserved. */
export function activeItemSlotsOf(build: PoBBuild): PoBItemSetSlot[] {
  return asArray(activeItemSetOf(build)?.Slot);
}

/** Map of item id → raw PoB item text for the whole build. */
export function itemTextMapOf(build: PoBBuild): Map<string, string> {
  const map = new Map<string, string>();
  for (const item of asArray<PoBItemEntry>(build.Items?.Item)) {
    if (item.id && item['#text']) map.set(item.id, item['#text']);
  }
  return map;
}

/**
 * treeVersion of the ACTIVE tree spec. In PoB XML treeVersion is an attribute
 * of <Spec>, NOT of <Tree> (PassiveSpec.lua writes it per spec). Selection
 * mirrors BuildService.getActiveSpec: activeSpec is 1-based.
 */
export function activeSpecTreeVersion(build: PoBBuild): string | undefined {
  const tree = build.Tree;
  if (!tree?.Spec) return undefined;
  const specs = asArray(tree.Spec);
  if (specs.length === 0) return undefined;
  const idx = parseInt(String(tree.activeSpec ?? "1"), 10) - 1;
  const spec = Number.isFinite(idx) ? specs[idx] ?? specs[specs.length - 1] : specs[0];
  return spec?.treeVersion;
}
