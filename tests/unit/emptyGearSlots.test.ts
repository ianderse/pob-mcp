import { describe, it, expect } from '@jest/globals';
import { XMLParser } from 'fast-xml-parser';
import { analyzeEquippedItems, isEquippableGearSlot } from '../../src/itemAnalyzer.js';
import { handleGetBuildIssues } from '../../src/handlers/buildGoalsHandlers.js';
import { handleAnalyzeItems } from '../../src/handlers/advancedOptimizationHandlers.js';

// PoB's slot set is version-dependent (current ItemsTab baseSlots include
// Ring 3 and Graft 1/2). Both equipment-slot consumers used to iterate a
// frozen 3.27-era name list: current-PoB empty slots went unreported while
// old builds got phantom empty-slot spam. The engine's own slot output is
// now the source of truth, filtered by isEquippableGearSlot.

describe('isEquippableGearSlot', () => {
  it('keeps real gear slots including version-specific ones', () => {
    for (const slot of ['Weapon 1', 'Weapon 2', 'Ring 3', 'Graft 1', 'Graft 2', 'Belt', 'Flask 2', 'Tincture']) {
      expect(isEquippableGearSlot(slot)).toBe(true);
    }
  });

  it('drops synthetic sub-slots', () => {
    for (const slot of ['Weapon 1 Swap', 'Weapon 1Swap Abyssal Socket 5', 'Weapon 2 Abyssal Socket 2', 'Small Jewel Socket 1', 'Notable Cluster Jewel Socket 2']) {
      expect(isEquippableGearSlot(slot)).toBe(false);
    }
  });
});

describe('analyzeEquippedItems derives slots from the reported items', () => {
  const items = [
    { slot: 'Weapon 1', name: 'Doombringer', rarity: 'Unique' },
    { slot: 'Helmet', name: 'Nullrune Hood', rarity: 'Unique' },
    { slot: 'Ring 3', name: '', shown: true },     // empty on a 3-ring build
    { slot: 'Graft 1', name: '', shown: true },    // empty, tree supports it
    { slot: 'Weapon 1 Swap', name: 'Legacy Wand' },
    { slot: 'Weapon 1Swap Abyssal Socket 5', name: 'Abyss Jewel' },
    { slot: 'Small Jewel Socket 1', name: 'Divergent Lineage' },
  ];

  const analyzed = analyzeEquippedItems(items, 'Scion', undefined, { life: 5000 });
  const slots = analyzed.slotAnalysis.map((s) => s.slot);

  it('reports slots that exist only on newer PoB versions', () => {
    expect(slots).toContain('Ring 3');
    expect(slots).toContain('Graft 1');
    const ring3 = analyzed.slotAnalysis.find((s) => s.slot === 'Ring 3')!;
    expect(ring3.issues).toContain('Slot is empty');
    expect(ring3.priority).toBe('high');
  });

  it('never analyzes synthetic sub-slots', () => {
    expect(slots).not.toContain('Weapon 1 Swap');
    expect(slots).not.toContain('Weapon 1Swap Abyssal Socket 5');
    expect(slots).not.toContain('Small Jewel Socket 1');
  });

  it('analyzes only what was reported - no phantom empties for absent slots', () => {
    // items above carry no Belt/Boots entries at all: the old fixed list
    // invented 'Slot is empty' issues for all 13 other names.
    expect(slots).not.toContain('Belt');
    expect(slots).not.toContain('Boots');
    expect(analyzed.slotAnalysis).toHaveLength(4); // Weapon1, Helmet, Ring3, Graft1
  });

  it('skips slots PoB hides for this build (shown=false)', () => {
    // get_items marks Ring 3 / Grafts shown=false unless the build actually
    // has the flag / tree; those are not applicable slots, not empties.
    const hidden = analyzeEquippedItems(
      [
        { slot: 'Weapon 1', name: 'Doombringer', shown: true },
        { slot: 'Ring 3', name: '', shown: false },
        { slot: 'Graft 1', name: '', shown: false },
        { slot: 'Graft 2', name: '', shown: false },
      ],
      'Scion', undefined, { life: 5000 },
    );
    const analyzed = hidden.slotAnalysis.map((s) => s.slot);
    expect(analyzed).toEqual(['Weapon 1']);
  });

  it('never hides a slot that HOLDS an item, whatever the gate says', () => {
    // An equipped item is data even if the UI gate hides its slot (or the
    // gate info is stale/absent): hiding it silently drops equipped gear.
    const held = analyzeEquippedItems(
      [
        { slot: 'Ring 3', name: 'Circle of Ambition', baseName: 'Ruby Ring', shown: false },
        { slot: 'Graft 1', name: 'Some Graft', shown: false },
      ],
      'Scion', undefined, { life: 5000 },
    );
    const analyzed = held.slotAnalysis.map((s) => s.slot);
    expect(analyzed).toContain('Ring 3');
    expect(analyzed).toContain('Graft 1');
  });

  it('keeps empty base weapon slots shown when the swap set is active', () => {
    // Weapon N with shown=false only means the active item set uses the swap
    // set (ItemsTab L129-131). The Swap slot itself is filtered as a
    // sub-slot, so hiding Weapon N would leave the build with no weapon
    // analysis at all; the pre-gate behavior (analyze it) is kept.
    const swapActive = analyzeEquippedItems(
      [
        { slot: 'Weapon 1', name: '', shown: false },
        { slot: 'Weapon 2', name: '', shown: false },
        { slot: 'Helmet', name: 'H', shown: true },
      ],
      'Scion', undefined, { life: 5000 },
    );
    const analyzed = swapActive.slotAnalysis.map((s) => s.slot);
    expect(analyzed).toContain('Weapon 1');
    expect(analyzed).toContain('Weapon 2');
  });
});

describe('handleGetBuildIssues empty-slot detection is version-agnostic', () => {
  const context = (items: Array<Record<string, unknown>>) => ({
    ensureLuaClient: async () => {},
    getLuaClient: () => ({
      getStats: async () => ({
        Life: 6000, EnergyShield: 0, Mana: 3000,
        FireResist: 75, ColdResist: 75, LightningResist: 75, ChaosResist: 20,
        FireResistOverCap: 0, ColdResistOverCap: 0, LightningResistOverCap: 0,
        SpellSuppressionChance: 100, TotalDPS: 2_000_000, CombinedDPS: 2_000_000, MinionTotalDPS: 0, TotalEHP: 40000,
      }),
      getBuildInfo: async () => ({ level: 100 }),
      getTree: async () => ({ nodes: Array.from({ length: 123 }, (_, i) => i), treeVersion: '2_0_0', ascendancyPointsUsed: 5 }),
      getItems: async () => items,
    }),
  }) as unknown as Parameters<typeof handleGetBuildIssues>[0];

  const item = (slot: string, id: number, name?: string, shown?: boolean) =>
    ({ slot, id, name, ...(shown === undefined ? {} : { shown }) });

  it('flags an empty Ring 3 that the frozen list could never see', async () => {
    const res = await handleGetBuildIssues(context([
      item('Weapon 1', 1, 'W'), item('Weapon 2', 2, 'W2'), item('Helmet', 3, 'H'),
      item('Body Armour', 4, 'B'), item('Gloves', 5, 'G'), item('Boots', 6, 'Bo'),
      item('Amulet', 7, 'A'), item('Ring 1', 8, 'R1'), item('Ring 2', 9, 'R2'),
      item('Belt', 10, 'Be'), item('Ring 3', 0, undefined, true),
      item('Flask 1', 11, 'F1'), item('Flask 2', 12, 'F2'), item('Flask 3', 13, 'F3'),
      item('Flask 4', 14, 'F4'), item('Flask 5', 15, 'F5'),
      item('Weapon 1 Swap', 1, 'W'),
      item('Weapon 1Swap Abyssal Socket 5', 0),
      item('Small Jewel Socket 1', 20, 'J'),
    ]));
    const messages = res.issues.filter((i) => i.category === 'items').map((i) => i.message);
    expect(messages.some((m) => m.includes('Ring 3 slot is empty'))).toBe(true);
    expect(messages.some((m) => /Swap|Abyssal/.test(m))).toBe(false);
  });

  it('does not demand gear for slots PoB hides for this build', async () => {
    // get_items reports EVERY slot control including hidden ones; PoB hides
    // Ring 3 without the AdditionalRingSlot flag and Grafts off the 3_27
    // tree. The base get_build_issues never warned about them and must not
    // start now: hidden is not empty.
    const res = await handleGetBuildIssues(context([
      item('Weapon 1', 1, 'W'), item('Weapon 2', 2, 'W2'), item('Helmet', 3, 'H'),
      item('Body Armour', 4, 'B'), item('Gloves', 5, 'G'), item('Boots', 6, 'Bo'),
      item('Amulet', 7, 'A'), item('Ring 1', 8, 'R1'), item('Ring 2', 9, 'R2'),
      item('Belt', 10, 'Be'),
      item('Ring 3', 0, undefined, false), item('Graft 1', 0, undefined, false),
      item('Graft 2', 0, undefined, false),
      item('Flask 1', 11, 'F1'), item('Flask 2', 12, 'F2'), item('Flask 3', 13, 'F3'),
      item('Flask 4', 14, 'F4'), item('Flask 5', 15, 'F5'),
    ]));
    const messages = res.issues.filter((i) => i.category === 'items').map((i) => i.message);
    expect(messages.some((m) => m.includes('slot is empty'))).toBe(false);
  });

  it('does not invent empties for slots the engine did not report', async () => {
    const res = await handleGetBuildIssues(context([
      item('Weapon 1', 1, 'W'), item('Weapon 2', 2, 'W2'), item('Helmet', 3, 'H'),
      item('Body Armour', 4, 'B'), item('Gloves', 5, 'G'), item('Boots', 6, 'Bo'),
      item('Amulet', 7, 'A'), item('Ring 1', 8, 'R1'), item('Ring 2', 9, 'R2'),
      item('Belt', 10, 'Be'),
      item('Flask 1', 11, 'F1'), item('Flask 2', 12, 'F2'), item('Flask 3', 13, 'F3'),
      item('Flask 4', 14, 'F4'), item('Flask 5', 15, 'F5'),
    ]));
    const messages = res.issues.filter((i) => i.category === 'items').map((i) => i.message);
    expect(messages.some((m) => m.includes('slot is empty'))).toBe(false);
  });
});

describe('handleAnalyzeItems passes the shown gate through to analysis', () => {
  // The wave-49 delta review caught this handler re-mapping engine items
  // WITHOUT shown, which silently dropped equipped Ring 3/Graft analysis
  // (undefined shown fell into the XML-only hidden rule).
  const context = (items: Array<Record<string, unknown>>) => ({
    buildService: {},
    pobDirectory: '',
    ensureLuaClient: async () => {},
    getLuaClient: () => ({
      getItems: async () => items,
      getStats: async () => ({
        Life: 5000, EnergyShield: 0, Evasion: 1000, Armour: 1000, TotalDPS: 1_000_000,
        FireResist: 75, ColdResist: 75, LightningResist: 75, ChaosResist: 75,
      }),
      getTree: async () => ({ classId: 0 }),
    }),
  }) as unknown as Parameters<typeof handleAnalyzeItems>[0];

  const gear = (ring3: Record<string, unknown>) => [
    { slot: 'Weapon 1', name: 'W', shown: true },
    { slot: 'Helmet', name: 'H', shown: true },
    ring3,
  ];

  it('analyzes an empty Ring 3 the build actually has (shown=true)', async () => {
    const res = await handleAnalyzeItems(context(gear({ slot: 'Ring 3', name: '', shown: true })), undefined);
    expect(res.content[0].text).toContain('**Ring 3**'); // empty gear = high priority, named
  });

  it('does not analyze a Ring 3 the engine says this build cannot use', async () => {
    const res = await handleAnalyzeItems(context(gear({ slot: 'Ring 3', name: '', shown: false })), undefined);
    expect(res.content[0].text).not.toContain('Ring 3');
    expect(res.content[0].text).toContain('across 2 equipment slots'); // Weapon 1 + Helmet only
  });

  it('still analyzes an EQUIPPED Ring 3 even when shown is dropped upstream', async () => {
    // filled beats an unknown gate everywhere, so a future mapping mistake
    // can at worst hide empty speculative slots, never real gear. The slot
    // is counted but not named (a good item raises no high-priority issue).
    const res = await handleAnalyzeItems(
      context(gear({ slot: 'Ring 3', name: 'Circle of Ambition', baseName: 'Ruby Ring' })),
      undefined,
    );
    expect(res.content[0].text).toContain('across 3 equipment slots');
  });
});

describe('handleAnalyzeItems XML fallback joins items by itemId', () => {
  // <Slot> elements carry no item text - the bodies live in Items/Item. The
  // pre-fix fallback read slot.Item (always empty) and mislabeled every
  // equipped slot as "Slot is empty" while the analyzer's filled rule hid
  // equipped version-gated slots (delta review N1).
  const parse = (xml: string) =>
    (new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' }).parse(xml).PoB.PathOfBuilding) as never;

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<PoB version="2.8.0">
<PathOfBuilding>
<Build level="100" className="Chieftain"/>
<Tree activeSpec="1">
<Spec title="Main" treeVersion="3_13"/>
</Tree>
<Items activeItemSet="1">
<Item id="5">
Item Class: Weapons
Rarity: UNIQUE
Doombringer
6-Link Corrupted Staff
</Item>
<Item id="7">
Item Class: Belts
Rarity: UNIQUE
Kaom's Sign
Simple Belt
</Item>
<Item id="9">
Item Class: Rings
Rarity: Rare
Circle of Ambition
Ruby Ring
</Item>
<Item id="11">
Item Class: Body Armours
Rarity: UNIQUE
Kaom's Heart
Velvet Regalia
</Item>
<ItemSet id="1" title="Set 1">
<Slot name="Weapon 1" itemId="5"/>
<Slot name="Helmet" itemId="0"/>
<Slot name="Body Armour" itemId="11"/>
<Slot name="Ring 3" itemId="9"/>
<Slot name="Graft 1" itemId="0"/>
</ItemSet>
</Items>
</PathOfBuilding>
</PoB>`;

  const fallbackContext = {
    buildService: { readBuild: async () => parse(xml) },
    pobDirectory: '',
    ensureLuaClient: async () => { throw new Error('no engine'); },
    getLuaClient: () => null,
  } as unknown as Parameters<typeof handleAnalyzeItems>[0];

  it('names equipped items, flags the visible empty, hides the pre-3_27 graft empty', async () => {
    const res = await handleAnalyzeItems(fallbackContext, 'some-build');
    const text = res.content[0].text;
    expect(text).toContain('Current: Circle of Ambition'); // item bodies joined by itemId
    expect(text).toContain('**Helmet**');           // empty + real slot -> named high priority
    expect(text).toContain('across 4 equipment slots'); // Weapon1 + Helmet + Body + filled Ring 3
    expect(text).toContain('unique body armour synergizes'); // Rarity: parsed from its own line, not lines[0]
    expect(text).not.toContain('Graft 1');          // empty graft on a 3_13 tree: hidden, not flagged
  });
});
