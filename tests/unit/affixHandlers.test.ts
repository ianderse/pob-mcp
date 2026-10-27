import { describe, it, expect } from '@jest/globals';
import { handleClassifyItemAffixes, handleFindAffixTiers, handleListCraftableMods } from '../../src/handlers/affixHandlers.js';
import { loadExplicitMods, ModDataUnavailableError } from '../../src/services/modDataStore.js';

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
const textOf = (result: { content: Array<{ text: string }> }) => result.content[0].text;

withPoB('affix tools', () => {
  it('tells the caller a hybrid is one affix, and how many slots stay open', async () => {
    const text = textOf(await handleClassifyItemAffixes({
      mod_lines: ['9% increased Energy Shield', '6% increased Stun and Block Recovery'],
    }));

    expect(text).toContain('Prefixes: 1/3 (2 open)   Suffixes: 0/3 (3 open)');
    expect(text).toContain('Hybrid: these 2 lines are ONE prefix, not 2.');
  });

  it('refuses an empty classification rather than reporting three open slots', async () => {
    await expect(handleClassifyItemAffixes({ mod_lines: [] })).rejects.toThrow('mod_lines was empty');
  });

  it('names the affix and its item level when pricing a stat', async () => {
    const text = textOf(await handleFindAffixTiers({ search: 'Chaos Resistance', affix_type: 'Suffix', slot_tags: ['ring'], max_results: 1 }));

    expect(text).toContain('ilvl 81 "of Bameth" +(31-35)% to Chaos Resistance');
    expect(text).toContain('rolls on: armour, ring, amulet, belt, quiver');
  });

  it('points at the base tag vocabulary when a slot filter matches nothing', async () => {
    const text = textOf(await handleFindAffixTiers({ search: 'Chaos Resistance', slot_tags: ['chest'] }));

    expect(text).toContain('Base tags are PoB\'s own vocabulary');
  });

  it('separates the crafts an item level locks out from the ones it can take', async () => {
    const text = textOf(await handleListCraftableMods({ item_class: 'Body Armour', item_level: 45, affix_type: 'Suffix', search: 'Fire Resistance' }));

    expect(text).toMatch(/Available \(2\):[\s\S]*\+\(21-28\)% to Fire Resistance/);
    expect(text).toMatch(/Locked by item level[\s\S]*\+\(29-35\)% to Fire Resistance/);
  });
});
