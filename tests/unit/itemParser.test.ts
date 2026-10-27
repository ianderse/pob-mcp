import {
  parseItem,
  itemLabel,
  stripColourCodes,
} from "../../src/services/itemParser.js";

/** Trim the leading indentation off a template literal fixture. */
const item = (s: string) => s.replace(/^[ \t]+/gm, "").trim();

describe("itemParser — identity", () => {
  it("reads name and base from a rare, not the Rarity line", () => {
    const parsed = parseItem(
      item(`
        Rarity: RARE
        Vengeance Clasp
        Stygian Vise
        Implicits: 0
        +46 to maximum Energy Shield
      `)
    );
    expect(parsed.rarity).toBe("RARE");
    expect(parsed.name).toBe("Vengeance Clasp");
    expect(parsed.base).toBe("Stygian Vise");
    expect(itemLabel(parsed)).toBe("[RARE] Vengeance Clasp (Stygian Vise)");
  });

  it("folds the base into the name for magic items", () => {
    // Magic items have no separate base line — line 3 is metadata, and reading
    // it as a base type yields nonsense like `baseType: "Crafted: true"`.
    const parsed = parseItem(
      item(`
        Rarity: MAGIC
        Masochist's Quartz Flask of the Lynx
        Crafted: true
        Implicits: 0
        Gain 2 Charges when you are Hit by an Enemy
      `)
    );
    expect(parsed.name).toBe("Masochist's Quartz Flask of the Lynx");
    expect(parsed.base).toBe("");
    expect(parsed.mods.map((m) => m.text)).toEqual([
      "Gain 2 Charges when you are Hit by an Enemy",
    ]);
  });

  it("consumes a leading Item Class line from game-copied text", () => {
    const parsed = parseItem(
      item(`
        Item Class: Rings
        Rarity: RARE
        Doom Loop
        Topaz Ring
        Implicits: 0
        +40% to Lightning Resistance
      `)
    );
    expect(parsed.itemClass).toBe("Rings");
    expect(parsed.name).toBe("Doom Loop");
    expect(parsed.base).toBe("Topaz Ring");
  });
});

describe("itemParser — variant selection", () => {
  // Watcher's Eye rolls two or three independent aura mods. PoB stores each in
  // its own slot: `Selected Variant`, `Selected Alt Variant`, and
  // `Selected Alt Variant Two`. Reading only the first drops the rest.
  const watchersEye = item(`
    Rarity: UNIQUE
    Watcher's Eye
    Prismatic Jewel
    Variant: None
    Variant: Discipline: Energy Shield Regeneration
    Variant: Malevolence: Damage over Time Multiplier
    Variant: Wrath: Lightning Penetration
    Selected Variant: 3
    Has Alt Variant: true
    Selected Alt Variant: 2
    Has Alt Variant Two: true
    Selected Alt Variant Two: 1
    Limited to: 1
    Implicits: 0
    {range:0.5}(4-6)% increased maximum Energy Shield
    {variant:2}{range:0.5}Regenerate (1.5-2.5)% of Energy Shield per Second while affected by Discipline
    {variant:3}{range:0.5}+(18-22)% to Damage over Time Multiplier while affected by Malevolence
    {variant:4}{range:0.5}Damage Penetrates (10-15)% Lightning Resistance while affected by Wrath
  `);

  it("collects every selected variant slot", () => {
    const parsed = parseItem(watchersEye);
    expect(parsed.selectedVariants).toEqual([1, 2, 3]);
  });

  it("keeps mods from the base slot and the alt slots, and drops the rest", () => {
    const parsed = parseItem(watchersEye);
    const texts = parsed.mods.map((m) => m.text);
    expect(texts).toContain("5% increased maximum Energy Shield");
    expect(texts).toContain(
      "Regenerate 2% of Energy Shield per Second while affected by Discipline"
    );
    expect(texts).toContain(
      "+20% to Damage over Time Multiplier while affected by Malevolence"
    );
    // Wrath was never selected.
    expect(texts.some((t) => t.includes("Wrath"))).toBe(false);
    expect(parsed.mods).toHaveLength(3);
  });

  it("treats the None sentinel as an empty slot", () => {
    // Variant 1 is PoB's "None"; no mod line carries {variant:1}, so a slot
    // pointing at it contributes nothing rather than needing a special case.
    const parsed = parseItem(watchersEye);
    expect(parsed.variantNames[0]).toBe("None");
    expect(parsed.mods.every((m) => !m.variantIds.includes(1))).toBe(true);
  });

  it("ignores an alt selection whose Has Alt Variant gate is false", () => {
    const parsed = parseItem(watchersEye.replace("Has Alt Variant: true", "Has Alt Variant: false"));
    expect(parsed.selectedVariants).toEqual([1, 3]);
    expect(parsed.mods.some((m) => m.text.includes("Discipline"))).toBe(false);
  });

  it("matches a mod listing several variant ids", () => {
    // `{variant:46,27}` — an exact-match test finds nothing on items like
    // Forbidden Flame and Impossible Escape, where every mod is multi-tagged.
    const parsed = parseItem(
      item(`
        Rarity: UNIQUE
        Forbidden Flame
        Crimson Jewel
        Variant: None
        Variant: Chieftain
        Variant: Guardian
        Selected Variant: 3
        Implicits: 0
        {variant:2,3}Allocates Ancestral Bond if you have the matching modifier on Forbidden Flesh
      `)
    );
    expect(parsed.mods).toHaveLength(1);
    expect(parsed.mods[0].variantIds).toEqual([2, 3]);
  });
});

describe("itemParser — variant groups", () => {
  // PoB's newer selection scheme. It *replaces* the six-slot one: an item using
  // groups has no `Selected Variant` and no `Has Alt Variant*` lines at all
  // (Item.lua:1940-1975), so a parser keyed on those sees an empty selection
  // and — if it skips filtering when nothing is selected — reports every
  // variant mod on the item instead of the two or three that are live.
  const grouped = item(`
    Rarity: UNIQUE
    Watcher's Eye
    Prismatic Jewel
    Variant: None
    Variant: Discipline ES Regen
    Variant: Malevolence DoT
    Variant: Wrath Pen
    Selected Variant Group: 1=3
    Selected Variant Group: 2=2
    Implicits: 0
    {variant:2}{group:1}Regenerate 2% of Energy Shield per Second while affected by Discipline
    {variant:3}{group:1}+20% to Damage over Time Multiplier while affected by Malevolence
    {variant:4}{group:1}Damage Penetrates 12% Lightning Resistance while affected by Wrath
    {variant:2}{group:2}Regenerate 2% of Energy Shield per Second while affected by Discipline
    {variant:3}{group:2}+20% to Damage over Time Multiplier while affected by Malevolence
  `);

  it("resolves one mod per group, with no duplicates", () => {
    const parsed = parseItem(grouped);
    expect(parsed.usesVariantGroups).toBe(true);
    expect([...parsed.variantGroupSelections]).toEqual([
      [1, 3],
      [2, 2],
    ]);
    // Each line names exactly one group, and only the line whose group selected
    // its variant survives. Mods come out in file order.
    expect(parsed.mods.map((m) => m.text)).toEqual([
      "+20% to Damage over Time Multiplier while affected by Malevolence",
      "Regenerate 2% of Energy Shield per Second while affected by Discipline",
    ]);
    expect(parsed.unknown).toHaveLength(0);
  });

  it("handles a line offered by more than one group", () => {
    // The format allows `{group:1,2}` (makeIdSpec joins ids with commas, the
    // same way `{variant:46,27}` already does), even though Zana's Ingenuity —
    // the only unique using groups today — puts one group on each line.
    const parsed = parseItem(
      item(`
        Rarity: UNIQUE
        Test Ring
        Prismatic Ring
        Variant: None
        Variant: A
        Variant: B
        Selected Variant Group: 1=3
        Selected Variant Group: 2=2
        Implicits: 0
        {variant:2}{group:1,2}Shared mod
        {variant:3}{group:1,2}Other mod
      `)
    );
    // Group 2 selected variant 2 and group 1 selected variant 3, so both lines
    // are live — but each only once, since group mode never allows duplicates.
    expect(parsed.mods.map((m) => m.text)).toEqual(["Shared mod", "Other mod"]);
    expect(parsed.mods[0].groupIds).toEqual([1, 2]);
  });

  it("drops a variant mod that belongs to no group", () => {
    // Item.lua:2137 — in group mode an ungrouped line survives only if it has
    // no variant list at all. The legacy path would have kept this one.
    const parsed = parseItem(
      grouped.replace(
        "{group:1}{variant:4}Damage Penetrates",
        "{variant:3}Damage Penetrates"
      )
    );
    expect(parsed.mods.some((m) => m.text.includes("Penetrates"))).toBe(false);
  });

  it("keeps an untagged mod in group mode", () => {
    const parsed = parseItem(grouped.replace("Implicits: 0", "Implicits: 0\n5% increased maximum Energy Shield"));
    expect(parsed.mods.map((m) => m.text)).toContain("5% increased maximum Energy Shield");
  });

  it("gates a versioned mod on Selected Version", () => {
    const versioned = item(`
      Rarity: UNIQUE
      Bound by Destiny
      Prismatic Jewel
      Version: 3.28
      Version: 3.29
      Selected Version: 2
      Variant: None
      Variant: Old Wording
      Variant: New Wording
      Selected Variant Group: 1=2
      Selected Variant Group: 2=3
      Implicits: 0
      {group:1}{variant:2}{version:1}+10% to all Elemental Resistances
      {group:2}{variant:3}{version:2}+15% to all Elemental Resistances
    `);
    const parsed = parseItem(versioned);
    expect(parsed.selectedVersion).toBe(2);
    expect(parsed.versionNames).toEqual(["3.28", "3.29"]);
    // The 3.28 wording is filtered out even though its group selected it.
    expect(parsed.mods.map((m) => m.text)).toEqual(["+15% to all Elemental Resistances"]);
  });

  it("reports a grouped mod that carries no variant", () => {
    const parsed = parseItem(
      item(`
        Rarity: UNIQUE
        Broken Jewel
        Prismatic Jewel
        Variant: None
        Variant: Something
        Selected Variant Group: 1=2
        Implicits: 0
        {group:1}+10 to Strength
      `)
    );
    expect(parsed.unknown).toEqual([
      expect.objectContaining({ reason: "unresolved-variant-group" }),
    ]);
  });

  it("counts a variant selected in two slots twice", () => {
    // Mageblood sets Allow Duplicate Variants — the same flask effect chosen in
    // two slots applies twice (Item.lua:GetModLineVariantCount).
    const parsed = parseItem(
      item(`
        Rarity: UNIQUE
        Mageblood
        Heavy Belt
        Variant: None
        Variant: Utility Flask Effect
        Selected Variant: 2
        Has Alt Variant: true
        Selected Alt Variant: 2
        Allow Duplicate Variants: true
        Implicits: 0
        {variant:2}Utility Flasks applied to you have 100% increased Effect
      `)
    );
    expect(parsed.allowDuplicateVariants).toBe(true);
    expect(parsed.mods).toHaveLength(2);
    expect(parsed.mods[0].text).toBe(parsed.mods[1].text);
  });
});

describe("itemParser — catalysts", () => {
  const ring = (catalystLine: string) =>
    item(`
      Rarity: RARE
      Attribute Ring
      Ruby Ring
      ${catalystLine}
      CatalystQuality: 20
      Implicits: 1
      {tags:elemental,fire,resistance}{range:1}+(20-30)% to Fire Resistance
      {tags:attribute}{range:1}+(10-13) to all Attributes
    `);

  it("scales only the mods whose tags the catalyst covers", () => {
    // Intrinsic is the attribute catalyst — it must not touch the fire res
    // implicit, which carries resistance/elemental tags instead.
    const parsed = parseItem(ring("Catalyst: Intrinsic"));
    const [fireRes, attributes] = parsed.mods;
    expect(fireRes.catalystScalar).toBe(1);
    expect(fireRes.text).toBe("+30% to Fire Resistance");
    expect(attributes.catalystScalar).toBeCloseTo(1.2);
    // 13 x 1.2 = 15.6, floored to 15 — formatValue uses floorSymmetric for the
    // catalyst, not rounding.
    expect(attributes.text).toBe("+15 to all Attributes");
  });

  it("resolves the game's Quality (X Modifiers) wording too", () => {
    const parsed = parseItem(
      item(`
        Rarity: RARE
        Attribute Ring
        Ruby Ring
        Quality (Attribute Modifiers): +20%
        Implicits: 0
        {tags:attribute}{range:1}+(10-13) to all Attributes
      `)
    );
    expect(parsed.catalyst).toBe("Attribute");
    expect(parsed.catalystQuality).toBe(20);
    expect(parsed.mods[0].catalystScalar).toBeCloseTo(1.2);
  });

  it("does not scale an untagged mod", () => {
    // Trade-imported values are already final; PoB leaves them alone.
    const parsed = parseItem(
      item(`
        Rarity: RARE
        Attribute Ring
        Ruby Ring
        Catalyst: Intrinsic
        CatalystQuality: 20
        Implicits: 0
        +62 to Strength
      `)
    );
    expect(parsed.mods[0].catalystScalar).toBe(1);
    expect(parsed.mods[0].text).toBe("+62 to Strength");
  });

  it("floors the scaled value rather than rounding it", () => {
    // ItemTools.lua:formatValue applies the catalyst with floorSymmetric. On
    // Pohx's Turquoise Amulet, +24 to Dexterity and Intelligence with Intrinsic
    // reads +28 in PoB, not +28.8 — rounding would report a value the item
    // does not have.
    const parsed = parseItem(
      item(`
        Rarity: RARE
        Endgame Amulet
        Turquoise Amulet
        Catalyst: Intrinsic
        CatalystQuality: 20
        Implicits: 0
        {tags:jewellery_attribute}{range:1}+(20-24) to Dexterity and Intelligence
      `)
    );
    expect(parsed.mods[0].text).toBe("+28 to Dexterity and Intelligence");
  });

  it("keeps decimals on a roll that has them", () => {
    // A range written with decimals is treated as a high-precision mod, so the
    // value is not flattened to a whole number.
    //
    // This is the one place the parser knowingly approximates. PoB takes display
    // precision from `data.modScalability` / `data.highPrecisionMods`, which need
    // its mod parser and are not available offline, so we infer it from the roll:
    // here that gives one decimal place and 1.3, where PoB shows 1.25. Exact
    // values are a Lua bridge job; the digit that matters for the catalyst rule
    // — whole-number mods flooring correctly — is covered above.
    const parsed = parseItem(
      item(`
        Rarity: UNIQUE
        Leech Jewel
        Cobalt Jewel
        Implicits: 0
        {range:0.5}(1-1.5)% of Damage Leeched as Life
      `)
    );
    expect(parsed.mods[0].text).toBe("1.3% of Damage Leeched as Life");
  });

  it("reports an unrecognised catalyst instead of silently not scaling", () => {
    const parsed = parseItem(ring("Catalyst: Antimatter"));
    expect(parsed.unknown).toContainEqual(
      expect.objectContaining({ reason: "unrecognised-key" })
    );
    expect(parsed.unknown[0].detail).toContain("Antimatter");
  });
});

describe("itemParser — mod classification", () => {
  it("splits implicits from explicits using the Implicits count", () => {
    const parsed = parseItem(
      item(`
        Rarity: RARE
        Doom Loop
        Topaz Ring
        Implicits: 1
        +30% to Lightning Resistance
        +80 to maximum Life
        {crafted}+20 to Dexterity
      `)
    );
    expect(parsed.implicits.map((m) => m.text)).toEqual(["+30% to Lightning Resistance"]);
    expect(parsed.explicits.map((m) => m.type)).toEqual(["explicit", "crafted"]);
  });

  it("rejoins a mod PoB wrapped onto a second line", () => {
    const parsed = parseItem(
      item(`
        Rarity: UNIQUE
        Watcher's Eye
        Prismatic Jewel
        Selected Variant: 2
        Implicits: 0
        {variant:2}{range:0.5}(50-75)% of Elemental Damage from your Hits cannot be Reflected while
        {variant:2}affected by Purity of Elements
      `)
    );
    expect(parsed.mods).toHaveLength(1);
    expect(parsed.mods[0].text).toBe(
      "63% of Elemental Damage from your Hits cannot be Reflected while affected by Purity of Elements"
    );
  });

  it("records whole-line flags rather than treating them as mods", () => {
    const parsed = parseItem(
      item(`
        Rarity: RARE
        Doom Loop
        Topaz Ring
        Implicits: 0
        +80 to maximum Life
        Corrupted
      `)
    );
    expect(parsed.itemFlags).toContain("corrupted");
    expect(parsed.mods.map((m) => m.text)).toEqual(["+80 to maximum Life"]);
  });
});

describe("itemParser — notes and metadata", () => {
  it("surfaces Note lines separately with colour codes stripped", () => {
    const parsed = parseItem(
      item(`
        Rarity: RARE
        New Item
        Vaal Gauntlets
        Note: ^6If you have Fan the Flames you don't need the Ignite spread on gloves.
        Implicits: 0
        +80 to maximum Life
      `)
    );
    expect(parsed.notes).toEqual([
      "If you have Fan the Flames you don't need the Ignite spread on gloves.",
    ]);
    expect(parsed.mods.map((m) => m.text)).toEqual(["+80 to maximum Life"]);
  });

  it("keeps crafting bookkeeping out of the mod list", () => {
    // Intangibility and Memory Strands are crafting metadata — they cap or fuel
    // craft attempts and have no effect on the item's stats.
    const parsed = parseItem(
      item(`
        Rarity: RARE
        Dusk Idol
        Focused Amulet
        Intangibility: 61%
        Memory Strands: 7
        ArmourBasePercentile: 0.9912
        Implicits: 0
        +80 to maximum Life
      `)
    );
    expect(parsed.mods.map((m) => m.text)).toEqual(["+80 to maximum Life"]);
    expect(parsed.meta.get("Intangibility")).toBe("61%");
    expect(parsed.meta.get("Memory Strands")).toBe("7");
    expect(parsed.meta.get("ArmourBasePercentile")).toBe("0.9912");
    expect(parsed.unknown).toHaveLength(0);
  });
});

describe("itemParser — the unknown channel", () => {
  it("reports a metadata key it does not recognise", () => {
    const parsed = parseItem(
      item(`
        Rarity: RARE
        Doom Loop
        Topaz Ring
        Sanctified: 3
        Implicits: 0
        +80 to maximum Life
      `)
    );
    expect(parsed.unknown).toEqual([
      { line: "Sanctified: 3", reason: "unrecognised-key", detail: "Sanctified" },
    ]);
  });

  it("reports a mod-line tag it does not recognise", () => {
    const parsed = parseItem(
      item(`
        Rarity: RARE
        Doom Loop
        Topaz Ring
        Implicits: 0
        {sanctum:4}+80 to maximum Life
      `)
    );
    expect(parsed.unknown).toEqual([
      expect.objectContaining({ reason: "unrecognised-tag", detail: "{sanctum}" }),
    ]);
    // The mod itself still comes through — an unknown tag is not a reason to
    // lose the line.
    expect(parsed.mods.map((m) => m.text)).toEqual(["+80 to maximum Life"]);
  });

  it("flags grouped mods that have no group selection to resolve them", () => {
    // PoB always writes `Selected Variant Group` alongside `{group:}` mods. An
    // item carrying only the legacy `Selected Variant` cannot be resolved, and
    // every grouped mod would drop out — so say so rather than return a short
    // mod list that looks complete.
    const parsed = parseItem(
      item(`
        Rarity: UNIQUE
        Impossible Escape
        Viridian Jewel
        Selected Variant: 2
        Implicits: 0
        {group:1}{variant:2}Passives in Radius of Avatar of Fire can be Allocated without being connected
      `)
    );
    expect(parsed.unknown).toEqual([
      expect.objectContaining({ reason: "unresolved-variant-group" }),
    ]);
    expect(parsed.mods).toHaveLength(0);
  });
});

describe("stripColourCodes", () => {
  it("removes both numeric and hex colour codes", () => {
    expect(stripColourCodes("^xE05030WARNING^7 text")).toBe("WARNING text");
  });
});
