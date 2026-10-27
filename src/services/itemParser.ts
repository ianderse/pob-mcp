/**
 * Path of Building item text parser.
 *
 * This is the offline half of the server: reading a build file must not depend
 * on the Lua bridge being configured. The format is PoB's own serialisation
 * (`Item.lua:BuildRaw`), which is close to but not identical to what the game
 * puts on the clipboard.
 *
 * The recognised-key, tag and catalyst tables are generated from PoB's source —
 * see scripts/generate-item-format.mjs. The structure of the format is stable.
 * What turns over is the vocabulary: a league mechanic adds a metadata key such
 * as `Intangibility`, and it is retired again when the mechanic goes away.
 * Generating the list keeps that case from needing a code change.
 *
 * Design rule: never drop a line on the floor. Anything this parser does not
 * understand lands in `unknown` with a reason, so an unfamiliar key surfaces as
 * a visible report rather than a quietly shorter mod list.
 */
import {
  SPEC_KEYS,
  SPEC_KEY_PATTERNS,
  MOD_LINE_TAGS,
  LINE_FLAGS,
  CATALYST_NAMES,
  CATALYST_DESCRIPTORS,
  CATALYST_TAGS,
  STANDALONE_FLAGS,
  POB_VERSION,
} from "../data/itemFormat.generated.js";

const SPEC_KEY_SET = new Set(SPEC_KEYS.map((k) => k.replace(/:$/, "")));
/** Keys PoB matches by pattern: the `*BasePercentile` family, `Quality (X Modifiers)`. */
const SPEC_KEY_REGEXES = SPEC_KEY_PATTERNS.map((p) => new RegExp(p.regex));

function isSpecKey(key: string): boolean {
  return SPEC_KEY_SET.has(key) || SPEC_KEY_REGEXES.some((re) => re.test(key));
}
const MOD_TAG_SET = new Set(MOD_LINE_TAGS);
const LINE_FLAG_SET = new Set(LINE_FLAGS);
const STANDALONE_FLAG_MAP = new Map(STANDALONE_FLAGS.map(([line, prop]) => [line, prop]));

/** `^7`, `^4`, `^xRRGGBB` — PoB's inline colour codes. */
const COLOUR_CODE = /\^(?:x[0-9A-Fa-f]{6}|\d)/g;
/** A `{key}` or `{key:value}` prefix on a mod line. */
const TAG = /\{(\w*)(?::([^}]*))?\}/g;
/** PoB's spec-line grammar, mirroring `^([%a %(%)]+:?): (.+)$`. */
const SPEC_LINE = /^([A-Za-z ()]+:?): (.+)$/;
/** The `Requires Level 68` shape, which has no colon. */
const REQUIRES_LINE = /^(Requires [A-Za-z]+) (.+)$/;
/** `Quality (Attribute Modifiers): +20%` — the game's catalyst wording. */
const GAME_CATALYST = /^Quality \(([A-Za-z ]+) Modifiers\)$/;
/** A rolled range such as `(1-1.5)` or `+(30-50)`. */
const RANGE_VALUE = /([+-]?)\((-?\d+\.?\d*)-(-?\d+\.?\d*)\)/g;

export type UnknownReason =
  | "unrecognised-key"
  | "unrecognised-tag"
  | "unresolved-variant-group"
  | "approximated-catalyst";

export interface UnknownLine {
  /** The line exactly as it appeared, colour codes intact. */
  line: string;
  reason: UnknownReason;
  /** What specifically was not understood — a key name, a tag name. */
  detail: string;
}

export interface ParsedModLine {
  /** Display text: tags stripped, ranges resolved, colour codes removed. */
  text: string;
  /** The line as stored, before tag stripping. */
  raw: string;
  /** implicit | explicit | enchant | crafted | fractured | scourge | crucible */
  type: string;
  /** `{crafted}`-style boolean markers present on the line. */
  flags: string[];
  /** `{tags:...}` — the join key catalyst scaling uses. */
  tags: string[];
  variantIds: number[];
  groupIds: number[];
  versionIds: number[];
  /** `{range:0.7}` — where in the roll this value sits, 0..1. */
  range?: number;
  corruptedRange?: number;
  /** Catalyst multiplier applied to this line; 1 when none applies. */
  catalystScalar: number;
}

export interface ParsedItem {
  rarity: string;
  name: string;
  base: string;
  itemClass?: string;
  /** Every `Key: value` line PoB recognises, keyed by name. */
  meta: Map<string, string>;
  quality?: number;
  /** Catalyst display name, e.g. "Attribute". */
  catalyst?: string;
  catalystQuality?: number;
  /** `Variant:` entries in file order; index 1 is PoB's "None" sentinel. */
  variantNames: string[];
  /** `Version:` entries in file order, for items carrying several mod pools. */
  versionNames: string[];
  /** The base `Selected Variant` slot on its own. */
  selectedVariant?: number;
  /** Every selected variant id across the base slot and the five alt slots. */
  selectedVariants: number[];
  /**
   * True when the item uses the group-based selection scheme. PoB then writes
   * `Selected Variant Group: g=v` *instead of* `Selected Variant`, and omits
   * every `Has Alt Variant*` line, so the two schemes never coexist.
   */
  usesVariantGroups: boolean;
  /** `Selected Variant Group: g=v` — group id to the variant it selected. */
  variantGroupSelections: Map<number, number>;
  /** `Selected Version:` — gates which `{version:}` mods are live. */
  selectedVersion?: number;
  /** Mageblood: the same variant may be selected in more than one slot. */
  allowDuplicateVariants: boolean;
  implicits: ParsedModLine[];
  explicits: ParsedModLine[];
  /** Implicits followed by explicits, in file order. */
  mods: ParsedModLine[];
  /** Whole-line markers: corrupted, mirrored, split, fractured, synthesised. */
  itemFlags: string[];
  /** `Note:` lines — author commentary, not mods. Colour codes stripped. */
  notes: string[];
  unknown: UnknownLine[];
  /** PoB build the format tables were derived from. */
  formatVersion: string;
}

export function stripColourCodes(s: string): string {
  return s.replace(COLOUR_CODE, "").trim();
}

/**
 * PoB's rule (`Item.lua:getCatalystScalar`): a catalyst scales a mod when any of
 * the catalyst's tags appears in the mod's `{tags:...}`. The `prefix`/`suffix`
 * line flags count as pseudo-tags so sinistral/dextral catalysts work.
 */
function catalystScalarFor(
  catalystIndex: number | undefined,
  quality: number,
  tags: string[],
  flags: string[]
): number {
  if (catalystIndex === undefined) return 1;
  if (flags.includes("unscalable")) return 1;
  const catalystTags = CATALYST_TAGS[catalystIndex];
  if (!catalystTags || tags.length === 0) return 1;
  const lookup = new Set(tags);
  for (const flag of ["prefix", "suffix"]) {
    if (flags.includes(flag)) lookup.add(flag);
  }
  return catalystTags.some((t) => lookup.has(t)) ? (100 + quality) / 100 : 1;
}

/**
 * How many decimal places a value is displayed to.
 *
 * PoB reads this from `data.modScalability`, keyed per mod. We do not have that
 * table offline, so we infer it from the roll itself: a range written with
 * decimals is a high-precision mod, one written with whole numbers is not. That
 * matches PoB for the ordinary case and is the single approximation in here —
 * see the note on `applyRange`.
 */
function inferredPrecision(min: string, max: string): number {
  const dp = (v: string) => (v.split(".")[1] ?? "").length;
  return Math.max(dp(min), dp(max));
}

const roundTo = (v: number, dp: number) => {
  const f = 10 ** dp;
  return Math.round(v * f) / f;
};

/**
 * Resolve `(min-max)` to the value at `range`, then apply the catalyst scalar.
 *
 * Mirrors `ItemTools.lua:formatValue`, which is order-sensitive and does *not*
 * round the two steps the same way:
 *
 *     value = roundSymmetric(value * precision)          -- resolve the roll
 *     value = floorSymmetric(value * valueScalar)        -- apply the catalyst
 *
 * The scalar is floored, not rounded, so Intrinsic on `+24 to Dexterity and
 * Intelligence` gives +28 rather than +28.8. Getting that backwards reports a
 * value the item does not have.
 *
 * The approximation: `precision` comes from PoB's per-mod scalability data,
 * which needs `data.modScalability`, `data.highPrecisionMods` and its mod
 * parser — none of them available offline. We infer it from the roll instead,
 * so a mod whose displayed precision differs from its written range can be out
 * in the last digit. Exact values are a Lua bridge job.
 */
function applyRange(line: string, range: number | undefined, scalar: number): string {
  let precision = 0;
  let out = line;
  if (range !== undefined) {
    out = out.replace(RANGE_VALUE, (_m, sign: string, min: string, max: string) => {
      precision = Math.max(precision, inferredPrecision(min, max));
      let value = roundTo(Number(min) + range * (Number(max) - Number(min)), precision);
      if (sign === "-") value *= -1;
      if (scalar !== 1) value = floorTo(value * scalar, precision);
      return sign === "+" && value > 0 ? `+${value}` : `${value}`;
    });
    return out;
  }
  // No roll on the line: the values are already final, so only the catalyst
  // applies. Whole numbers stay whole.
  if (scalar !== 1) {
    out = out.replace(/-?\d+\.?\d*/g, (m) =>
      `${floorTo(Number(m) * scalar, (m.split(".")[1] ?? "").length)}`
    );
  }
  return out;
}

/** `floorSymmetric` — truncates toward zero, unlike Math.floor. */
function floorTo(v: number, dp: number): number {
  const f = 10 ** dp;
  return Math.trunc(v * f) / f;
}

/**
 * Is this mod line live on the item? A faithful port of
 * `Item.lua:CheckModLineVariant`.
 *
 * Group mode is a replacement for the old six-slot scheme, not an addition, so
 * the two branches are exclusive. Three of its rules differ from the legacy
 * path and each one silently changes the mod list if missed:
 *
 *   - a `{version:}` mod needs `Selected Version` to match, or it is gone;
 *   - a `{group:}` mod with no `{variant:}` is dropped;
 *   - in group mode a `{variant:}` mod with *no* `{group:}` is dropped, where
 *     the legacy path would have kept it.
 */
function isModLineLive(
  item: ParsedItem,
  mod: Pick<TagResult, "variantIds" | "groupIds" | "versionIds">,
  legacySelections: Set<number>
): boolean {
  if (item.usesVariantGroups) {
    if (
      mod.versionIds.length > 0 &&
      (item.selectedVersion === undefined || !mod.versionIds.includes(item.selectedVersion))
    ) {
      return false;
    }
    if (mod.groupIds.length > 0) {
      if (mod.variantIds.length === 0) return false;
      return mod.groupIds.some((groupId) => {
        const selected = item.variantGroupSelections.get(groupId);
        return selected !== undefined && mod.variantIds.includes(selected);
      });
    }
    return mod.variantIds.length === 0;
  }
  return mod.variantIds.length === 0 || mod.variantIds.some((id) => legacySelections.has(id));
}

/**
 * How many times this mod applies — `Item.lua:GetModLineVariantCount`.
 *
 * Normally 0 or 1. Mageblood sets `Allow Duplicate Variants`, which lets more
 * than one slot pick the same variant; the mod then applies once per slot.
 */
function modLineVariantCount(
  item: ParsedItem,
  mod: Pick<TagResult, "variantIds" | "groupIds" | "versionIds">,
  legacySelections: Set<number>,
  slotSelections: number[] = []
): number {
  if (!item.allowDuplicateVariants || mod.variantIds.length === 0) {
    return isModLineLive(item, mod, legacySelections) ? 1 : 0;
  }
  return slotSelections.filter((id) => mod.variantIds.includes(id)).length;
}

interface TagResult {
  stripped: string;
  flags: string[];
  tags: string[];
  variantIds: number[];
  groupIds: number[];
  versionIds: number[];
  range?: number;
  corruptedRange?: number;
  unknownTags: string[];
}

function parseTags(line: string): TagResult {
  const r: TagResult = {
    stripped: "",
    flags: [],
    tags: [],
    variantIds: [],
    groupIds: [],
    versionIds: [],
    unknownTags: [],
  };
  const ids = (v: string) => (v.match(/\d+/g) ?? []).map(Number);
  r.stripped = line
    .replace(TAG, (_m, key: string, value: string | undefined) => {
      const val = value ?? "";
      if (key === "variant") r.variantIds = ids(val);
      else if (key === "group") r.groupIds = ids(val).filter((n) => n > 0);
      else if (key === "version") r.versionIds = ids(val);
      else if (key === "tags") r.tags = val.match(/[A-Za-z_]+/g) ?? [];
      else if (key === "range") r.range = Number(val);
      else if (key === "corruptedRange") r.corruptedRange = Number(val);
      else if (key === "modGroup") {
        /* grouping hint only — no effect on the mod */
      } else if (LINE_FLAG_SET.has(key)) r.flags.push(key);
      else if (!MOD_TAG_SET.has(key)) r.unknownTags.push(key);
      return "";
    })
    .trim();
  return r;
}

/**
 * Parse one item's raw text.
 *
 * `text` is the body of an `<Item>` element, or anything in PoB's item format.
 */
export function parseItem(text: string): ParsedItem {
  const lines = (text ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const item: ParsedItem = {
    rarity: "NORMAL",
    name: "?",
    base: "",
    meta: new Map(),
    variantNames: [],
    versionNames: [],
    selectedVariants: [],
    usesVariantGroups: false,
    variantGroupSelections: new Map(),
    allowDuplicateVariants: false,
    implicits: [],
    explicits: [],
    mods: [],
    itemFlags: [],
    notes: [],
    unknown: [],
    formatVersion: POB_VERSION,
  };

  let l = 0;
  if (lines[l]?.startsWith("Item Class:")) {
    item.itemClass = lines[l].slice("Item Class:".length).trim();
    l++;
  }
  const rarityMatch = lines[l]?.match(/^Rarity: (\w+)/);
  if (rarityMatch) {
    item.rarity = rarityMatch[1].toUpperCase();
    l++;
  }
  if (lines[l] === "--------") l++;

  const unidentified = lines.includes("Unidentified");
  if (lines[l]) {
    item.name = stripColourCodes(lines[l]);
    l++;
    // Magic and normal items fold the base into the name, so the next line is
    // metadata rather than a base type. Same for unidentified items.
    if (!(item.rarity === "NORMAL" || item.rarity === "MAGIC" || unidentified)) {
      if (lines[l] && !SPEC_LINE.test(lines[l]) && lines[l] !== "--------") {
        item.base = stripColourCodes(lines[l]);
        l++;
      }
    }
  }

  // Selection slots: the base variant plus five alternates, each gated by its
  // own `Has Alt Variant*` flag. Watcher's Eye, Megalomaniac, Militant Faith and
  // friends roll two or three independent mods this way.
  const altSuffixes = ["", " Two", " Three", " Four", " Five"];
  // PoB flips into group mode on the first `{group:}` / `{version:}` tag or
  // `Selected Variant Group` / `Selected Version` line. It parses in one pass;
  // we take two, so look ahead for the tags before reading the metadata.
  item.usesVariantGroups = lines.some((l) => /\{group:|\{version:/.test(l));
  const hasAlt = new Map<string, boolean>();
  const selectedAlt = new Map<string, number>();
  let selectedVariant: number | undefined;
  let implicitCount = 0;
  let modStart = -1;

  for (let i = l; i < lines.length; i++) {
    const line = lines[i];
    if (line === "--------") continue;
    if (STANDALONE_FLAG_MAP.has(line)) {
      item.itemFlags.push(STANDALONE_FLAG_MAP.get(line)!);
      continue;
    }
    const m = line.match(SPEC_LINE) ?? line.match(REQUIRES_LINE);
    if (!m) continue;
    const key = m[1].replace(/:$/, "");
    const value = m[2];

    if (key === "Variant") item.variantNames.push(stripColourCodes(value));
    else if (key === "Version") item.versionNames.push(stripColourCodes(value));
    else if (key === "Selected Variant") selectedVariant = Number(value);
    else if (key === "Selected Version") {
      item.selectedVersion = Number(value);
      item.usesVariantGroups = true;
    } else if (key === "Selected Variant Group") {
      // `Selected Variant Group: 1=3` — Item.lua:765.
      const pair = value.match(/^(\d+)\s*=\s*(\d+)$/);
      if (pair) {
        item.variantGroupSelections.set(Number(pair[1]), Number(pair[2]));
        item.usesVariantGroups = true;
      }
    } else if (key === "Allow Duplicate Variants") item.allowDuplicateVariants = value === "true";
    else if (key === "Note") item.notes.push(stripColourCodes(value));
    else if (key === "Quality") item.quality = Number(value);
    else if (key === "Catalyst") item.catalyst = value;
    else if (key === "CatalystQuality") item.catalystQuality = Number(value);
    else if (key === "Implicits") {
      implicitCount = Number(value);
      modStart = i + 1;
    } else {
      const gameCatalyst = key.match(GAME_CATALYST);
      if (gameCatalyst) {
        item.catalyst = gameCatalyst[1];
        item.catalystQuality = Number(value.match(/(\d+)%/)?.[1] ?? 20);
        continue;
      }
      let matchedAlt = false;
      for (const suffix of altSuffixes) {
        if (key === `Has Alt Variant${suffix}`) {
          hasAlt.set(suffix, value === "true");
          matchedAlt = true;
        } else if (key === `Selected Alt Variant${suffix}`) {
          selectedAlt.set(suffix, Number(value));
          matchedAlt = true;
        }
      }
      if (matchedAlt) continue;
      if (isSpecKey(key)) {
        if (!item.meta.has(key)) item.meta.set(key, value);
      } else if (modStart === -1 || i < modStart) {
        // A `Key: value` line above the mod section that PoB would recognise and
        // we do not. Almost certainly a new league's metadata.
        item.unknown.push({ line, reason: "unrecognised-key", detail: key });
      }
    }
  }

  // `active` answers "is this variant selected at all"; `slotSelections` keeps
  // one entry per slot so a variant chosen twice counts twice (Mageblood).
  const active = new Set<number>();
  const slotSelections: number[] = [];
  if (selectedVariant !== undefined) {
    active.add(selectedVariant);
    slotSelections.push(selectedVariant);
  }
  for (const suffix of altSuffixes) {
    if (hasAlt.get(suffix) && selectedAlt.has(suffix)) {
      active.add(selectedAlt.get(suffix)!);
      slotSelections.push(selectedAlt.get(suffix)!);
    }
  }
  item.selectedVariant = selectedVariant;
  item.selectedVariants = [...active].sort((a, b) => a - b);

  // A saved build stores the catalyst's item name (`Catalyst: Intrinsic`); the
  // game's clipboard text names the mod group instead (`Quality (Attribute
  // Modifiers)`). Both index the same CATALYST_TAGS row.
  const catalystIndex = item.catalyst
    ? Math.max(
        CATALYST_NAMES.indexOf(item.catalyst),
        CATALYST_DESCRIPTORS.indexOf(item.catalyst)
      )
    : -1;
  const catalystQuality = item.catalystQuality ?? 20;
  if (item.catalyst && item.catalyst !== "None" && catalystIndex < 0) {
    // A catalyst PoB knows and we don't — a new one was added. Say so rather
    // than silently reporting the item's mods at their unscaled values.
    item.unknown.push({
      line: `Catalyst: ${item.catalyst}`,
      reason: "unrecognised-key",
      detail: `unknown catalyst "${item.catalyst}"; mod values are not scaled`,
    });
  }

  if (modStart === -1) modStart = l;
  let seen = 0;
  let enchantCount = 0;
  /** The mod emitted by the previous line, once per copy, for rejoining wraps. */
  let previousCopies: ParsedModLine[] = [];

  for (let i = modStart; i < lines.length; i++) {
    const line = lines[i];
    if (line === "--------" || STANDALONE_FLAG_MAP.has(line)) continue;
    const specMatch = line.match(SPEC_LINE) ?? line.match(REQUIRES_LINE);
    if (specMatch && isSpecKey(specMatch[1].replace(/:$/, ""))) continue;

    const parsed = parseTags(line);
    for (const tag of parsed.unknownTags) {
      item.unknown.push({ line, reason: "unrecognised-tag", detail: `{${tag}}` });
    }
    // A grouped line must name the variants it belongs to, or PoB cannot place
    // it in any group (Item.lua:2126 returns false, and ConPrintf warns).
    if (item.usesVariantGroups && parsed.groupIds.length > 0) {
      if (parsed.variantIds.length === 0) {
        item.unknown.push({
          line,
          reason: "unresolved-variant-group",
          detail: "grouped mod line carries no {variant:} — PoB cannot place it either",
        });
      } else if (item.variantGroupSelections.size === 0) {
        // Grouped mods with nothing saying what each group picked. PoB always
        // writes both together, so this is a malformed or half-migrated item —
        // every grouped mod would drop out, and that must not happen quietly.
        item.unknown.push({
          line,
          reason: "unresolved-variant-group",
          detail: "item has {group:} mods but no `Selected Variant Group` line to resolve them",
        });
      }
    }
    const copies = modLineVariantCount(item, parsed, active, slotSelections);
    if (copies === 0) continue;
    const body = stripColourCodes(parsed.stripped);
    if (!body) continue;

    // PoB wraps a long mod onto a second physical line; the continuation starts
    // lowercase and repeats the variant tag.
    if (previousCopies.length > 0 && /^[a-z]/.test(body)) {
      for (const previous of previousCopies) {
        previous.text = `${previous.text} ${body}`;
        previous.raw = `${previous.raw} ${line}`;
      }
      continue;
    }

    const scalar = catalystScalarFor(
      catalystIndex >= 0 ? catalystIndex : undefined,
      catalystQuality,
      parsed.tags,
      parsed.flags
    );
    // Count values on the range-resolved text: `(27-30)% increased Fire Damage`
    // is one value expressed as a roll, not two.
    const unscaled = applyRange(body, parsed.range, 1);
    if (scalar !== 1 && (unscaled.match(/-?\d+\.?\d*/g) ?? []).length > 1) {
      // PoB restricts scaling to the values its scalability data marks; we scale
      // every number on the line, which can differ on multi-value mods.
      item.unknown.push({
        line,
        reason: "approximated-catalyst",
        detail: `catalyst scalar ${scalar} applied to every value on a multi-value mod`,
      });
    }

    const crafted = parsed.flags.includes("crafted");
    let type: string;
    if (crafted && enchantCount + seen < implicitCount) {
      type = "enchant";
      enchantCount++;
    } else if (seen < implicitCount) {
      type = "implicit";
      seen++;
    } else if (parsed.flags.includes("fractured")) type = "fractured";
    else if (parsed.flags.includes("scourge")) type = "scourge";
    else if (parsed.flags.includes("crucible")) type = "crucible";
    else if (crafted) type = "crafted";
    else type = "explicit";

    const mod: ParsedModLine = {
      text: applyRange(body, parsed.range, scalar),
      raw: line,
      type,
      flags: parsed.flags,
      tags: parsed.tags,
      variantIds: parsed.variantIds,
      groupIds: parsed.groupIds,
      versionIds: parsed.versionIds,
      range: parsed.range,
      corruptedRange: parsed.corruptedRange,
      catalystScalar: scalar,
    };
    previousCopies = [];
    for (let copy = 0; copy < copies; copy++) {
      const emitted = copy === 0 ? mod : { ...mod };
      previousCopies.push(emitted);
      item.mods.push(emitted);
      if (type === "implicit" || type === "enchant") item.implicits.push(emitted);
      else item.explicits.push(emitted);
    }
  }

  return item;
}

/** One-line identity, e.g. `[UNIQUE] Watcher's Eye (Prismatic Jewel)`. */
export function itemLabel(item: ParsedItem): string {
  const head = `[${item.rarity}] ${item.name}`;
  return item.base ? `${head} (${item.base})` : head;
}
