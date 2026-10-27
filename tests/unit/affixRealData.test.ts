/**
 * Runs against the Path of Building install on this machine, not a fixture, because the
 * point of these tools is to agree with the game data the player is actually looking at.
 * Skipped rather than failed where PoB is absent, so CI stays honest about what it checked.
 */

import { describe, it, expect } from '@jest/globals';
import { loadAllMods, loadExplicitMods, ModDataUnavailableError } from '../../src/services/modDataStore.js';
import { resolveAffixes } from '../../src/services/affixMatcher.js';
import { findAffixTiers, findCraftableMods } from '../../src/services/affixQuery.js';

const installed = ((): boolean => {
  try {
    loadExplicitMods();
    return true;
  } catch (error) {
    if (error instanceof ModDataUnavailableError) return false;
    throw error;
  }
})();

const withPoB = installed ? describe : describe.skip;

/** Midpoint of every range, so the generated line is a roll a real item could show. */
const rollMidpoint = (line: string): string =>
  line.replace(/([+-]?)\((\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)\)/g, (_match, sign, low, high) => {
    const bounds = [Number(low), Number(high)].sort((a, b) => a - b);
    const middle = (bounds[0] + bounds[1]) / 2;
    return `${sign}${Number.isInteger(bounds[0]) && Number.isInteger(bounds[1]) ? Math.round(middle) : middle.toFixed(1)}`;
  });

withPoB('the installed ModExplicit.lua', () => {
  it('reproduces of Bameth exactly as the affix guide states it', () => {
    const result = findAffixTiers({ search: 'Chaos Resistance', affixType: 'Suffix', limit: 5 });
    const chaos = result.groups.find((group) => group.group === 'ChaosResistance')!;
    const bameth = chaos.tiers[chaos.tiers.length - 1];

    expect(bameth.affix).toBe('of Bameth');
    expect(bameth.type).toBe('Suffix');
    expect(bameth.level).toBe(81);
    expect(bameth.statLines).toEqual(['+(31-35)% to Chaos Resistance']);
    expect(bameth.slotTags).toEqual(expect.arrayContaining(['ring', 'amulet', 'belt', 'armour']));
  });

  it('filters tiers by base tag and by item level', () => {
    const reachable = findAffixTiers({ search: 'Chaos Resistance', affixType: 'Suffix', slotTags: ['ring'], maxItemLevel: 65, limit: 5 });
    const affixes = reachable.groups.flatMap((group) => group.tiers.map((tier) => tier.affix));

    expect(affixes).toContain('of Exile');
    expect(affixes).not.toContain('of Bameth');
  });

  it('hides mods no base can roll unless they are asked for', () => {
    const hidden = findAffixTiers({ search: 'LocalBaseArmourEvasionRatingAndLife', limit: 5 });
    const shown = findAffixTiers({ search: 'LocalBaseArmourEvasionRatingAndLife', includeUnobtainable: true, limit: 5 });

    expect(hidden.totalGroups).toBe(0);
    expect(shown.totalGroups).toBeGreaterThan(0);
  });
});

withPoB('classifying against the installed data', () => {
  it("reads Pixie's two lines as a single prefix", () => {
    const result = resolveAffixes(
      ['9% increased Energy Shield', '6% increased Stun and Block Recovery', '+42 to maximum Life', '+34% to Fire Resistance'],
      loadAllMods()
    );

    expect(result.affixes.find((affix) => affix.affix === "Pixie's")!.lines).toHaveLength(2);
    expect(result.prefixCount).toBe(2);
    expect(result.suffixCount).toBe(1);
    expect(result.openSuffixes).toBe(2);
  });

  it('never splits a real hybrid into two affixes', () => {
    const hybrids = loadExplicitMods().filter((entry) => entry.statLines.length > 1 && entry.obtainable);
    const entries = loadAllMods();

    const split = hybrids.filter((hybrid) => {
      const resolved = resolveAffixes(hybrid.statLines.map(rollMidpoint), entries);
      return resolved.affixes.length !== 1 || resolved.affixes[0].type !== hybrid.type || resolved.unmatched.length > 0;
    });

    expect(hybrids.length).toBeGreaterThan(400);
    expect(split.map((entry) => entry.id)).toEqual([]);
  });

  it('resolves every rolled hybrid to the affix it came from, or says the reading is ambiguous', () => {
    const hybrids = loadExplicitMods().filter((entry) => entry.statLines.length > 1 && entry.obtainable);
    const entries = loadAllMods();

    const wrong = hybrids.filter((hybrid) => {
      const resolved = resolveAffixes(hybrid.statLines.map(rollMidpoint), entries);
      return resolved.affixes[0].group !== hybrid.group && resolved.affixes[0].alternatives.length === 0;
    });

    expect(wrong.map((entry) => entry.id)).toEqual([]);
  });
});

withPoB('the installed ModMaster.lua', () => {
  it('gates the bench by item level the way the affix guide describes', () => {
    const low = findCraftableMods({ itemClass: 'Body Armour', itemLevel: 45, affixType: 'Suffix', search: 'Fire Resistance' });
    const high = findCraftableMods({ itemClass: 'Body Armour', itemLevel: 50, affixType: 'Suffix', search: 'Fire Resistance' });

    const ranges = (result: typeof low) => result.mods.flatMap((mod) => mod.statLines);

    expect(ranges(low)).toContain('+(21-28)% to Fire Resistance');
    expect(ranges(low)).not.toContain('+(29-35)% to Fire Resistance');
    expect(low.lockedByItemLevel.flatMap((mod) => mod.statLines)).toContain('+(29-35)% to Fire Resistance');
    expect(ranges(high)).toContain('+(29-35)% to Fire Resistance');
  });

  it('offers no bench craft for a class the bench does not serve', () => {
    const result = findCraftableMods({ itemClass: 'Chest', itemLevel: 86 });

    expect(result.mods).toEqual([]);
    expect(result.knownItemClasses).toContain('Body Armour');
  });
});
