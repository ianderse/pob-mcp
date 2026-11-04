import { describe, it, expect } from '@jest/globals';
import { XMLParser } from 'fast-xml-parser';
import { handleAnalyzeClusterJewels } from '../../src/handlers/clusterJewelHandlers.js';

// Shape matches BuildService.readBuild output: the PathOfBuilding element
// itself (already unwrapped), as produced by fast-xml-parser.
const buildXml = `<?xml version="1.0"?>
<PathOfBuilding>
  <Build level="100" className="Marauder">
    <Spec title="S" treeVersion="3_27" activeSkillSet="1"/>
  </Build>
  <Items activeItemSet="1">
    <Item id="1">Rarity: MAGIC
Time-Locked Cluster Jewel
----
Item Level: 75
----
Adds 10 Passive Skills
Added Small Passive Skills grant: 15% increased Strength
----
Additional Small Passive Skills grant: 8% increased maximum Life</Item>
    <Item id="2">Rarity: RARE
Headhunter
----
Item Level: 83</Item>
    <ItemSet id="1" name="X">
      <Slot name="Weapon 1" itemId="2"/>
    </ItemSet>
  </Items>
</PathOfBuilding>`;

const parse = (xml: string) =>
  new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' }).parse(xml).PathOfBuilding;

describe('handleAnalyzeClusterJewels', () => {
  it('finds tree-socketed cluster jewels in the unwrapped build shape', async () => {
    const context = { buildService: { readBuild: async () => parse(buildXml) } };
    const result = await handleAnalyzeClusterJewels(context, { build_name: 'x' });
    const text = result.content.map((c) => c.text).join('');
    expect(text).toContain('Found 1 cluster jewel');
    expect(text).toContain('Time-Locked Cluster Jewel');
    expect(text).not.toContain('No cluster jewels found');
  });

  it('still reports absence for jewelry-free builds', async () => {
    const withoutJewel = parse(buildXml.replace(/Rarity: MAGIC[\s\S]*?Life<\/Item>/, 'Rarity: RARE\nPlain Ring\n----\nItem Level: 1</Item>'));
    const context = { buildService: { readBuild: async () => withoutJewel } };
    const result = await handleAnalyzeClusterJewels(context, { build_name: 'x' });
    expect(result.content[0].text).toContain('No cluster jewels found');
  });
});

describe('handleAnalyzeBuildClusterJewels (live bridge)', () => {
  // get_items yields `baseName` (PoB it.baseName), not `base` — a filter on
  // item.base matched nothing and the tool always reported "No cluster
  // jewels detected" for every build.
  // Socketed jewels reach get_items under PoB's *passive-tree* slot names
  // (Socket13, …) — Ring slots carry normal rings.
  const equipped = [
    { slot: 'Ammo1', id: 0 },
    { slot: 'Weapon 1', id: 1, name: "Axe", type: "Weapon", baseName: "Victaria's Attempt" },
    // Socketed jewels reach get_items under PoB's *passive-tree* slot names
    // (Socket13, …) — Ring slots carry normal rings. Name has PoB's
    // socketed-jewel form ("Amber Watcher [Large Cluster Jewel]").
    { slot: 'Socket13', id: 2, name: 'Amber Watcher [Large Cluster Jewel]', type: 'Ring', baseName: 'Perfect Large Cluster Jewel', raw: 'Rarity: RARE\nPerfect Large Cluster Jewel\n----\nAdds 15 Passive Skills\nAllocates Feasting Fiends' },
    { slot: 'Ring 2', id: 3, name: 'Plain', type: 'Ring', baseName: 'Simple Robe' },
  ];

  const context = {
    ensureLuaClient: async () => {},
    getLuaClient: () => ({
      getItems: async () => equipped,
      getSkills: async () => ({ groups: [{ index: 1, label: 'S', main: true, gems: [{ name: 'Vortex', level: 20, quality: 20 }] }] }),
    }),
  } as unknown as Parameters<typeof import('../../src/handlers/clusterJewelHandlers.js').handleAnalyzeBuildClusterJewels>[0];

  it('detects socketed cluster jewels from baseName', async () => {
    const { handleAnalyzeBuildClusterJewels } = await import('../../src/handlers/clusterJewelHandlers.js');
    const result = await handleAnalyzeBuildClusterJewels(context);
    const text = result.content.map((c) => c.text).join('');

    expect(text).toContain('Perfect Large Cluster Jewel');
    expect(text).toContain('Feasting Fiends');
    expect(text).not.toContain('No cluster jewels detected');
  });
});
