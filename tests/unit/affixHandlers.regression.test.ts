import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { handleClassifyItemAffixes, handleFindAffixTiers } from '../../src/handlers/affixHandlers.js';
import * as store from '../../src/services/modDataStore.js';
import { MOD_EXPLICIT_EXCERPT, MOD_MASTER_EXCERPT } from '../fixtures/modDataExcerpt.js';

const explicit = store.parseModFile(MOD_EXPLICIT_EXCERPT, 'explicit');
const all = [...explicit, ...store.parseModFile(MOD_MASTER_EXCERPT, 'master')];

beforeEach(() => {
  jest.spyOn(store, 'loadExplicitMods').mockReturnValue(explicit);
  jest.spyOn(store, 'loadAllMods').mockReturnValue(all);
});

afterEach(() => { jest.restoreAllMocks(); });

describe('affix output with incomplete knowledge', () => {
  it('keeps known counts but refuses to promise slots for an unmatched explicit', async () => {
    const result = await handleClassifyItemAffixes({
      mod_lines: ['+33% to Chaos Resistance', 'An unlisted explicit modifier'],
    });
    const text = result.content[0].text;

    expect(text).toContain('Matched prefixes: 0/3   Matched suffixes: 1/3');
    expect(text).toContain('Open affix slots: unknown');
    expect(text).toContain('Unmatched lines (affix type and slot occupancy unknown)');
    expect(text).not.toMatch(/\(\d open\)|none of these occupy/);
  });

  it('still reports precise open slots for an unambiguous hybrid', async () => {
    const result = await handleClassifyItemAffixes({
      mod_lines: ['9% increased Energy Shield', '6% increased Stun and Block Recovery'],
    });

    expect(result.content[0].text).toContain('Prefixes: 1/3 (2 open)   Suffixes: 0/3 (3 open)');
  });

  it('does not relabel a lower affix when item-level filtering hides the highest one', async () => {
    const query = { search: 'Chaos Resistance', affix_type: 'Suffix', slot_tags: ['ring'] };
    const full = (await handleFindAffixTiers(query)).content[0].text;
    const limited = (await handleFindAffixTiers({ ...query, max_item_level: 65 })).content[0].text;
    const lower = '  ilvl 65 "of Exile" +(26-30)% to Chaos Resistance';

    expect(full).toContain(lower);
    expect(limited).toContain(lower);
    expect(full).toContain('ilvl 81 "of Bameth"');
    expect(limited).not.toContain('of Bameth');
    expect(full).not.toMatch(/T\d+ ilvl/);
    expect(limited).not.toMatch(/T\d+ ilvl/);
  });

  it('does not invent a top-tier label when searching for one lower affix by name', async () => {
    const text = (await handleFindAffixTiers({ search: 'of Exile' })).content[0].text;

    expect(text).toContain('ilvl 65 "of Exile"');
    expect(text).not.toMatch(/T\d+ ilvl/);
  });
});
