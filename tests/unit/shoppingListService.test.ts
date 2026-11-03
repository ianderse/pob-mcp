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
