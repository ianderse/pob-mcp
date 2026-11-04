import { describe, it, expect } from '@jest/globals';
import { analyzeEquippedItems, isEquippableGearSlot } from '../../src/itemAnalyzer.js';
import { handleGetBuildIssues } from '../../src/handlers/buildGoalsHandlers.js';

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
    { slot: 'Ring 3', name: '' },            // empty on a current-PoB build
    { slot: 'Graft 1', name: '' },           // empty, also current-PoB-only
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

  const item = (slot: string, id: number, name?: string) => ({ slot, id, name });

  it('flags an empty Ring 3 that the frozen list could never see', async () => {
    const res = await handleGetBuildIssues(context([
      item('Weapon 1', 1, 'W'), item('Weapon 2', 2, 'W2'), item('Helmet', 3, 'H'),
      item('Body Armour', 4, 'B'), item('Gloves', 5, 'G'), item('Boots', 6, 'Bo'),
      item('Amulet', 7, 'A'), item('Ring 1', 8, 'R1'), item('Ring 2', 9, 'R2'),
      item('Belt', 10, 'Be'), item('Ring 3', 0),
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
