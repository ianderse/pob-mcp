import { describe, it, expect } from '@jest/globals';
import { parseModFile } from '../../src/services/modDataStore.js';
import { MOD_EXPLICIT_EXCERPT, MOD_MASTER_EXCERPT } from '../fixtures/modDataExcerpt.js';

const explicit = parseModFile(MOD_EXPLICIT_EXCERPT, 'explicit');
const master = parseModFile(MOD_MASTER_EXCERPT, 'master');
const byId = (id: string) => explicit.find((entry) => entry.id === id)!;

describe('parseModFile on ModExplicit', () => {
  it('keeps every line of a hybrid on one affix', () => {
    const pixies = byId('LocalIncreasedEnergyShieldPercentAndStunRecovery1');

    expect(pixies.type).toBe('Prefix');
    expect(pixies.affix).toBe("Pixie's");
    expect(pixies.statLines).toEqual([
      '(6-13)% increased Energy Shield',
      '(6-7)% increased Stun and Block Recovery',
    ]);
    expect(pixies.level).toBe(3);
  });

  it('drops zero-weight base tags from the rollable slot list', () => {
    const bameth = byId('ChaosResist6');

    expect(bameth.slotTags).toEqual(['armour', 'ring', 'amulet', 'belt', 'quiver']);
    expect(bameth.allSlotTags).toContain('default');
    expect(bameth.obtainable).toBe(true);
  });

  it('marks a mod nothing can roll as unobtainable', () => {
    expect(byId('LocalBaseArmourAndEvasionRatingAndLife1').obtainable).toBe(false);
  });

  it('reads a descending negative range as one stat line', () => {
    const shaping = byId('PhysicalAttackDamageTakenUber1_');

    expect(shaping.statLines).toEqual(['-(35-25) Physical Damage taken from Attack Hits']);
    expect(shaping.type).toBe('Suffix');
  });

  it('rejects an entry whose stat lines and statOrder disagree', () => {
    const doctored = MOD_EXPLICIT_EXCERPT.replace('statOrder = { 1585, 1928 }', 'statOrder = { 1585 }');

    expect(() => parseModFile(doctored, 'explicit')).toThrow(/2 stat lines but 1 statOrder/);
  });
});

describe('parseModFile on ModMaster', () => {
  it('does not mistake the leading modTags for stat lines', () => {
    const life = master[0];

    expect(life.modTags).toEqual(['resource', 'life']);
    expect(life.statLines).toEqual(['+(15-25) to maximum Life']);
    expect(life.itemClasses).toContain('Body Armour');
  });

  it('reads the bench hybrid as one prefix printing two lines', () => {
    const poison = master.find((entry) => entry.statLines.some((line) => line.includes('chance to Poison on Hit')))!;

    expect(poison.type).toBe('Prefix');
    expect(poison.statLines).toHaveLength(2);
    expect(poison.modTags).toContain('unveiled_mod');
  });
});
