import { describe, it, expect } from '@jest/globals';
import { resolveAffixes, statTemplate, statValues } from '../../src/services/affixMatcher.js';
import { parseModFile } from '../../src/services/modDataStore.js';
import { MOD_EXPLICIT_EXCERPT, MOD_MASTER_EXCERPT } from '../fixtures/modDataExcerpt.js';

const entries = [
  ...parseModFile(MOD_EXPLICIT_EXCERPT, 'explicit'),
  ...parseModFile(MOD_MASTER_EXCERPT, 'master'),
];

describe('statTemplate', () => {
  it('collapses a rolled value and its data range to the same shape', () => {
    expect(statTemplate('9% increased Energy Shield')).toBe(statTemplate('(6-13)% increased Energy Shield'));
    expect(statTemplate('+11 to Strength')).toBe(statTemplate('+(8-12) to Strength'));
  });

  it('strips the tags PoB writes in front of a mod line', () => {
    expect(statTemplate('{crafted}+18% to Chaos Resistance')).toBe('#% to chaos resistance');
  });
});

describe('statValues', () => {
  it('applies the sign to both ends of a descending range', () => {
    expect(statValues('-(35-25) Physical Damage taken from Attack Hits')).toEqual([{ min: -35, max: -25 }]);
  });

  it('reads each value of a multi-value line', () => {
    expect(statValues('+(8-10) to Armour')).toEqual([{ min: 8, max: 10 }]);
    expect(statValues('+9 to Armour')).toEqual([{ min: 9, max: 9 }]);
  });
});

describe('resolveAffixes', () => {
  it('counts a hybrid as one prefix rather than a prefix and a suffix', () => {
    const result = resolveAffixes(
      ['9% increased Energy Shield', '6% increased Stun and Block Recovery'],
      entries
    );

    expect(result.affixes).toHaveLength(1);
    expect(result.affixes[0].affix).toBe("Pixie's");
    expect(result.affixes[0].type).toBe('Prefix');
    expect(result.prefixCount).toBe(1);
    expect(result.suffixCount).toBe(0);
    expect(result.openSuffixes).toBe(3);
  });

  it('leaves the standalone affix to claim the line when its partner is absent', () => {
    const result = resolveAffixes(['20% increased Energy Shield'], entries);

    expect(result.affixes).toHaveLength(1);
    expect(result.affixes[0].group).toBe('LocalEnergyShieldPercent');
  });

  it('stays silent when the rolled value rules the rival affix out', () => {
    const result = resolveAffixes(
      ['9% increased Energy Shield', '7% increased Stun and Block Recovery'],
      entries
    );

    expect(result.affixes[0].affix).toBe("Pixie's");
    expect(result.affixes[0].alternatives).toEqual([]);
  });

  it('reports the rival reading when both affixes could have rolled these values', () => {
    const result = resolveAffixes(
      ['12% increased Energy Shield', '7% increased Stun and Block Recovery'],
      entries
    );

    expect(result.affixes[0].affix).toBe("Pixie's");
    expect(result.affixes[0].alternatives).toContain('Prefix "Protective" (LocalEnergyShieldPercent)');
  });

  it('reports the tier and the item level it needs', () => {
    const result = resolveAffixes(['+33% to Chaos Resistance'], entries);

    expect(result.affixes[0].affix).toBe('of Bameth');
    expect(result.affixes[0].minItemLevel).toBe(81);
    expect(result.affixes[0].valuesOutOfRange).toBe(false);
  });

  it('still occupies a slot when the roll sits outside every listed tier', () => {
    const result = resolveAffixes(['+99% to Chaos Resistance'], entries);

    expect(result.suffixCount).toBe(1);
    expect(result.affixes[0].valuesOutOfRange).toBe(true);
  });

  it('invents no item level for a roll that sits in no tier', () => {
    const result = resolveAffixes(['+99% to Chaos Resistance'], entries);

    expect(result.affixes[0].minItemLevel).toBeNull();
  });

  it('makes open slots unknown when an explicit line has no matching affix', () => {
    const result = resolveAffixes(['Trigger a Socketed Spell when you Attack'], entries);

    expect(result.unmatched).toEqual(['Trigger a Socketed Spell when you Attack']);
    expect(result.prefixCount).toBe(0);
    expect(result.suffixCount).toBe(0);
    expect(result.openPrefixes).toBeNull();
    expect(result.openSuffixes).toBeNull();
    expect(result.warnings.join(' ')).toContain('may occupy prefix or suffix slots');
  });

  it('does not treat matched affixes as a complete inventory when unknown lines remain', () => {
    const result = resolveAffixes(['+33% to Chaos Resistance', 'An unlisted explicit modifier'], entries);

    expect(result.suffixCount).toBe(1);
    expect(result.openPrefixes).toBeNull();
    expect(result.openSuffixes).toBeNull();
  });

  it('withholds open-slot counts for ambiguous readings', () => {
    const result = resolveAffixes(['12% increased Energy Shield', '7% increased Stun and Block Recovery'], entries);

    expect(result.affixes[0].alternatives.length).toBeGreaterThan(0);
    expect(result.openPrefixes).toBeNull();
    expect(result.openSuffixes).toBeNull();
  });

  it('warns when the resolved count exceeds what an item can hold', () => {
    const result = resolveAffixes(
      ['+9% to Chaos Resistance', '+13% to Chaos Resistance', '+18% to Chaos Resistance', '+23% to Chaos Resistance'],
      entries
    );

    expect(result.suffixCount).toBe(4);
    expect(result.warnings.join(' ')).toContain('Resolved 4 suffixes');
  });

  it('warns on the prefix side too', () => {
    const result = resolveAffixes(
      ['20% increased Energy Shield', '21% increased Energy Shield', '22% increased Energy Shield', '23% increased Energy Shield'],
      entries
    );

    expect(result.prefixCount).toBe(4);
    expect(result.warnings.join(' ')).toContain('Resolved 4 prefixes');
  });
});
