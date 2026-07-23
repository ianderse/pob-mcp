/**
 * Helpers for PoB's XML shape.
 *
 * fast-xml-parser collapses a repeated element to a bare object when it occurs
 * once, so every repeated node (`SkillSet`, `Skill`, `Gem`, ...) is either an
 * array or a single object depending on the build. Normalising at the read site
 * keeps that detail out of the callers.
 */
import type { PoBBuild, PoBSkillSet } from "../types.js";

export function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * The skill set the build actually has selected. Builds routinely carry several
 * (league starter, endgame, bossing), so reading the first one is wrong whenever
 * the user has switched.
 */
export function activeSkillSet(build: PoBBuild): PoBSkillSet | undefined {
  const sets = asArray<PoBSkillSet>(build.Skills?.SkillSet);
  const activeId = build.Skills?.activeSkillSet;
  return sets.find(s => String(s.id) === String(activeId)) ?? sets[0];
}
