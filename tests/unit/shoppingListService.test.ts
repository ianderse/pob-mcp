import { describe, it, expect } from '@jest/globals';
import { XMLParser } from 'fast-xml-parser';
import { ShoppingListService } from '../../src/services/shoppingListService';
import { activeSpecTreeVersion } from '../../src/utils/pobXml';

// Two gear sets: fast-xml-parser yields ItemSet as an ARRAY here, with the
// equipped belt only in the ACTIVE set 2. (Attribute names unprefixed, as
// BuildService's parser is configured.)
const beltText = `Item Class: Belts
Rarity: UNIQUE
Kaom's Sign
Simple Belt
----
Level: 62
----
+(90-100) to maximum Life
Requirements Level 62`;

const build = {
  Build: { level: '100', className: 'Chieftain' },
  Items: {
    activeItemSet: '2',
    Item: [{ id: '7', '#text': beltText }],
    ItemSet: [
      { id: '1', name: 'Set 1', Slot: [{ name: 'Belt' }] },
      { id: '2', name: 'Set 2', Slot: [{ name: 'Belt', itemId: '7' }] },
    ],
  },
} as never;

describe('ShoppingListService multi gear-set extraction', () => {
  it('reads the active ItemSet from an array and names items without Item Class', async () => {
    const list = await new ShoppingListService().generateShoppingList(build, 'b', 'league');
    const belt = list.items.find((i) => i.slot === 'Belt');
    expect(belt).toBeDefined();
    expect(belt!.currentItem).toBeDefined();
    expect(belt!.currentItem!.name).toBe("Kaom's Sign");
    expect(belt!.currentItem!.name).not.toMatch(/^Item Class:/);
  });
});

describe('ShoppingListService slot coverage from the build itself', () => {
  // Built through the SAME parser config BuildService uses (attributes
  // unprefixed), because treeVersion lives on <Spec> (not <Tree>) and
  // hand-shaped fixtures cannot catch attribute-placement mistakes.
  // A current-PoB layout: empty Ring 3, empty Graft, swap/abyssal sub-slots
  // and a flask - PoB's serializer writes every slot regardless of
  // visibility, so the version gates in isGearSlotVisible decide what applies.
  const parse = (xml: string) =>
    (new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' }).parse(xml).PoB.PathOfBuilding) as never;

  const modernXml = (treeVersion: string, graftItemId = '0') => `<?xml version="1.0" encoding="UTF-8"?>
<PoB version="2.8.0">
<PathOfBuilding>
<Build level="100" className="Chieftain"/>
<Tree activeSpec="1">
<Spec title="Main Build" treeVersion="${treeVersion}"/>
<TreeView/>
</Tree>
<Items activeItemSet="1">
<Item id="7">
${beltText}
</Item>
<ItemSet id="1" title="Set 1" useSecondWeaponSet="false">
<Slot name="Belt" itemId="7"/>
<Slot name="Ring 3" itemId="0"/>
<Slot name="Graft 1" itemId="${graftItemId}"/>
<Slot name="Weapon 1 Swap" itemId="0"/>
<Slot name="Weapon 1Swap Abyssal Socket 5" itemId="0"/>
<Slot name="Small Jewel Socket 1" itemId="0"/>
<Slot name="Flask 1" itemId="0"/>
</ItemSet>
</Items>
</PathOfBuilding>
</PoB>`;

  it('covers version-specific slots and skips sub-slot noise entirely', async () => {
    const list = await new ShoppingListService().generateShoppingList(parse(modernXml('3_27')), 'b', 'league');
    const slots = list.items.map((i) => i.slot);
    expect(slots).toContain('Belt');
    expect(slots).toContain('Graft 1'); // tree 3_27 -> grafts exist
    expect(slots).not.toContain('Ring 3'); // gate is a runtime mod flag; without the engine, an unknown Ring 3 must not demand a critical buy
    expect(slots).not.toContain('Weapon 1 Swap');
    expect(slots).not.toContain('Weapon 1Swap Abyssal Socket 5');
    expect(slots).not.toContain('Small Jewel Socket 1');
    expect(slots).not.toContain('Flask 1');
    const graft = list.items.find((i) => i.slot === 'Graft 1')!;
    expect(graft.priority).toBe('critical'); // itemId 0 = empty slot
  });

  it('excludes graft slots on pre-3_27 trees (PoB hides them)', async () => {
    const list = await new ShoppingListService().generateShoppingList(parse(modernXml('3_13')), 'b', 'league');
    const slots = list.items.map((i) => i.slot);
    expect(slots).toContain('Belt');
    expect(slots).not.toContain('Graft 1');
    expect(slots).not.toContain('Ring 3');
  });

  it('keeps an EQUIPPED graft even on a pre-3_27 tree (filled beats unknown gate)', async () => {
    const list = await new ShoppingListService().generateShoppingList(parse(modernXml('3_13', '7')), 'b', 'league');
    const graft = list.items.find((i) => i.slot === 'Graft 1');
    expect(graft).toBeDefined();
    expect(graft!.currentItem).toBeDefined();
  });

  it('reads treeVersion from the ACTIVE Spec (attribute placement regression)', async () => {
    // treeVersion is a <Spec> attribute (PassiveSpec.lua); activeSpec is
    // 1-based. Spec 2 (active) is 3_27, spec 1 is 3_13 -> grafts apply.
    const twoSpec = `<?xml version="1.0" encoding="UTF-8"?>
<PoB version="2.8.0">
<PathOfBuilding>
<Build level="100" className="Chieftain"/>
<Tree activeSpec="2">
<Spec title="Old" treeVersion="3_13"/>
<Spec title="Current" treeVersion="3_27"/>
<TreeView/>
</Tree>
<Items activeItemSet="1">
<ItemSet id="1" title="Set 1">
<Slot name="Graft 1" itemId="0"/>
</ItemSet>
</Items>
</PathOfBuilding>
</PoB>`;
    expect(activeSpecTreeVersion(parse(twoSpec))).toBe('3_27');
    const list = await new ShoppingListService().generateShoppingList(parse(twoSpec), 'b', 'league');
    expect(list.items.map((i) => i.slot)).toContain('Graft 1');
  });
});
