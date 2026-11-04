import { describe, it, expect } from '@jest/globals';
import { ShoppingListService } from '../../src/services/shoppingListService';

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
  // Active set uses a current-PoB layout: Ring 3 present (empty), Graft slot,
  // swap/abyssal sub-slots, and a flask - none of which the frozen 10-name
  // list could see.
  const modern = {
    Build: { level: '100', className: 'Chieftain' },
    Items: {
      activeItemSet: '1',
      Item: [{ id: '7', '#text': beltText }],
      ItemSet: [{
        id: '1',
        name: 'Set 1',
        Slot: [
          { name: 'Belt', itemId: '7' },
          { name: 'Ring 3', itemId: '0' },
          { name: 'Graft 1', itemId: '0' },
          { name: 'Weapon 1 Swap', itemId: '0' },
          { name: 'Weapon 1Swap Abyssal Socket 5', itemId: '0' },
          { name: 'Small Jewel Socket 1', itemId: '0' },
          { name: 'Flask 1', itemId: '0' },
        ],
      }],
    },
  } as never;

  it('covers version-specific slots and skips sub-slot noise entirely', async () => {
    const list = await new ShoppingListService().generateShoppingList(modern, 'b', 'league');
    const slots = list.items.map((i) => i.slot);
    expect(slots).toContain('Belt');
    expect(slots).toContain('Ring 3');
    expect(slots).toContain('Graft 1');
    expect(slots).not.toContain('Weapon 1 Swap');
    expect(slots).not.toContain('Weapon 1Swap Abyssal Socket 5');
    expect(slots).not.toContain('Small Jewel Socket 1');
    expect(slots).not.toContain('Flask 1');
    const ring3 = list.items.find((i) => i.slot === 'Ring 3')!;
    expect(ring3.priority).toBe('critical'); // itemId 0 = empty slot
  });
});
