// GENERATED FILE — do not edit by hand.
// Produced by scripts/generate-item-format.mjs from Path of Building's
// src/Classes/Item.lua (PoB 2.67.2 (dev @ ed354c2)).
//
// Regenerate after updating the PoB checkout:  node scripts/generate-item-format.mjs
// A diff here is usually a metadata key coming or going with a league mechanic;
// see src/services/itemParser.ts.

/** Path of Building version these tables were derived from. */
export const POB_VERSION = "2.67.2 (dev @ ed354c2)";

/** Metadata keys PoB recognises on a `Key: value` item line. */
export const SPEC_KEYS: readonly string[] = [
  "Allow Duplicate Variants",
  "Armour",
  "Attacks per Second",
  "Block chance",
  "Catalyst",
  "CatalystQuality",
  "Chance to Block",
  "Chaos Damage",
  "Class:",
  "Cluster Jewel Node Count",
  "Cluster Jewel Skill",
  "Crafted",
  "Critical Strike Chance",
  "Critical Strike Range",
  "Crucible",
  "Dex",
  "Dexterity",
  "Elemental Damage",
  "Energy Shield",
  "Evasion",
  "Evasion Rating",
  "Has Alt Variant",
  "Has Alt Variant Five",
  "Has Alt Variant Four",
  "Has Alt Variant Three",
  "Has Alt Variant Two",
  "Has Variants",
  "Implicit",
  "Implicits",
  "Int",
  "Intangibility",
  "Intelligence",
  "Item Level",
  "League",
  "Level",
  "LevelReq",
  "Limited to",
  "Memory Strands",
  "Note",
  "Physical Damage",
  "Prefix",
  "Quality",
  "Radius",
  "Requires Class",
  "Requires Level",
  "Scourge",
  "Selected Alt Variant",
  "Selected Alt Variant Five",
  "Selected Alt Variant Four",
  "Selected Alt Variant Three",
  "Selected Alt Variant Two",
  "Selected Variant",
  "Selected Variant Group",
  "Selected Variants",
  "Selected Version",
  "Sockets",
  "Source",
  "Str",
  "Strength",
  "Suffix",
  "Talisman Tier",
  "Unique ID",
  "Unreleased",
  "Upgrade",
  "Variant",
  "Version",
  "Ward",
  "Weapon Range"
];

/**
 * Metadata keys PoB matches by pattern rather than equality, as regex sources.
 * `lua` is kept alongside so a diff points back at the line in Item.lua.
 */
export const SPEC_KEY_PATTERNS: readonly { lua: string; regex: string }[] = [
  {
    lua: "Quality %([%a%s]+ Modifiers%)",
    regex: "Quality \\([A-Za-z\\s]+ Modifiers\\)"
  },
  {
    lua: "BasePercentile",
    regex: "BasePercentile"
  }
];

/** Keys understood inside a `{key:value}` mod-line prefix. */
export const MOD_LINE_TAGS: readonly string[] = [
  "corruptedRange",
  "group",
  "modGroup",
  "range",
  "tags",
  "variant",
  "version"
];

/** Boolean `{flag}` markers on a mod line. */
export const LINE_FLAGS: readonly string[] = [
  "crafted",
  "crucible",
  "custom",
  "disabled",
  "eater",
  "enchant",
  "exarch",
  "fractured",
  "implicit",
  "mutated",
  "prefix",
  "scourge",
  "suffix",
  "synthesis",
  "unscalable",
  "unveiled",
  "vestigial"
];

/**
 * Catalyst item names, as written to `Catalyst: X` in a saved build.
 * Indexed in step with CATALYST_DESCRIPTORS and CATALYST_TAGS.
 */
export const CATALYST_NAMES: readonly string[] = [
  "Abrasive",
  "Accelerating",
  "Dextral",
  "Fertile",
  "Imbued",
  "Intrinsic",
  "Noxious",
  "Prismatic",
  "Sinistral",
  "Tempering",
  "Turbulent",
  "Unstable"
];

/**
 * Catalyst mod-group wording, as the game writes it in
 * `Quality (Attribute Modifiers): +20%`. Parallel to CATALYST_NAMES.
 */
export const CATALYST_DESCRIPTORS: readonly string[] = [
  "Attack",
  "Speed",
  "Suffix",
  "Life and Mana",
  "Caster",
  "Attribute",
  "Physical and Chaos",
  "Resistance",
  "Prefix",
  "Defence",
  "Elemental",
  "Critical"
];

/** Mod tags each catalyst scales, parallel to CATALYST_DESCRIPTORS. */
export const CATALYST_TAGS: readonly (readonly string[])[] = [
  [
    "attack"
  ],
  [
    "speed"
  ],
  [
    "suffix"
  ],
  [
    "life",
    "mana",
    "resource"
  ],
  [
    "caster"
  ],
  [
    "jewellery_attribute",
    "attribute"
  ],
  [
    "physical_damage",
    "chaos_damage"
  ],
  [
    "jewellery_resistance",
    "resistance"
  ],
  [
    "prefix"
  ],
  [
    "jewellery_defense",
    "defences",
    "armour",
    "evasion",
    "energyshield"
  ],
  [
    "jewellery_elemental",
    "elemental_damage"
  ],
  [
    "critical"
  ]
];

/** Whole-line flags such as `Corrupted`, mapped to the property they set. */
export const STANDALONE_FLAGS: readonly (readonly [string, string])[] = [
  [
    "Split",
    "split"
  ],
  [
    "Mirrored",
    "mirrored"
  ],
  [
    "Corrupted",
    "corrupted"
  ],
  [
    "Fractured Item",
    "fractured"
  ],
  [
    "Synthesised Item",
    "synthesised"
  ]
];

/**
 * Opening words of the line a timeless jewel stores its seed in. The seed is the
 * first number after the phrase; the conqueror is the last word on the line.
 */
export const TIMELESS_SEED_PHRASES: readonly string[] = [
  "Bathed in the blood of",
  "Carved to glorify",
  "Commanded leadership over",
  "Commissioned",
  "Denoted service of",
  "Remembrancing"
];
