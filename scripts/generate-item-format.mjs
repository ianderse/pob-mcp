#!/usr/bin/env node
/**
 * Derive the PoB item-text format tables from Path of Building's own source.
 *
 * The shape of the format is stable, but its vocabulary is not: a league
 * mechanic brings a new metadata key, and it is dropped again once the mechanic
 * ends. A hand-maintained copy of that list is how a parser silently starts
 * reporting metadata as mods. Instead we scrape the tables out of
 * `src/Classes/Item.lua` and commit the result, so a change shows up as a
 * reviewable diff in `src/data/itemFormat.generated.ts`.
 *
 *   node scripts/generate-item-format.mjs [--check]
 *
 * Reads POB_PATH, the same variable the Lua bridge uses: a PathOfBuilding
 * checkout's src/ directory.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

// POB_PATH points at the checkout's src/ directory; POB_FORK_PATH is the
// legacy alias the bridge still accepts. Everything here wants src/, so unlike
// pobLuaBridge there is no need to strip back to the checkout root.
const POB_SRC =
  process.env.POB_PATH ??
  process.env.POB_FORK_PATH ??
  path.resolve("..", "PathOfBuilding", "src");
const ITEM_LUA = path.join(POB_SRC, "Classes", "Item.lua");
const OUT = path.resolve("src", "data", "itemFormat.generated.ts");
const checkOnly = process.argv.includes("--check");

function fail(msg) {
  console.error(`generate-item-format: ${msg}`);
  process.exit(1);
}

if (!fs.existsSync(ITEM_LUA)) {
  fail(`cannot find ${ITEM_LUA}.\nSet POB_PATH to a PathOfBuilding checkout's src/ directory.`);
}
const lua = fs.readFileSync(ITEM_LUA, "utf-8");

/** Every `specName == "X"` branch: the metadata keys PoB recognises. */
function specKeys() {
  const keys = new Set();
  for (const m of lua.matchAll(/specName\s*==\s*"([^"]+)"/g)) keys.add(m[1]);
  if (keys.size < 40) fail(`only found ${keys.size} spec keys — Item.lua layout changed?`);
  return [...keys].sort();
}

/**
 * Translate a Lua pattern to a JS regex source, refusing anything ambiguous.
 *
 * Only the constructs PoB actually uses on spec names are supported. Bailing out
 * loudly beats guessing: a pattern we mistranslate would silently misclassify
 * metadata as mods, which is the whole failure mode this file guards against.
 */
function luaPatternToRegex(pattern) {
  // Inside a `[...]` set the class shorthands expand without their own brackets,
  // otherwise `[%a%s]` would nest into `[[A-Za-z]\s]` and match literal brackets.
  const bare = { a: "A-Za-z", d: "0-9", s: "\\s", w: "A-Za-z0-9" };
  const wrapped = { a: "[A-Za-z]", d: "[0-9]", s: "\\s", w: "[A-Za-z0-9]" };
  let out = "";
  let inSet = false;
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === "[") {
      inSet = true;
      out += c;
    } else if (c === "]") {
      inSet = false;
      out += c;
    } else if (c === "%") {
      const n = pattern[++i];
      const classes = inSet ? bare : wrapped;
      if (classes[n]) out += classes[n];
      else if ("().%+-*?[]^$".includes(n)) out += `\\${n}`;
      else fail(`unsupported Lua class %${n} in spec pattern ${JSON.stringify(pattern)}`);
    } else if (c === "-" && !inSet) {
      fail(
        `spec pattern ${JSON.stringify(pattern)} uses Lua's lazy '-' quantifier; ` +
          `translate it by hand in scripts/generate-item-format.mjs`
      );
    } else if ("^$().{}|\\/".includes(c)) {
      out += `\\${c}`;
    } else {
      out += c;
    }
  }
  return out;
}

/**
 * Spec keys PoB matches by pattern rather than equality — the `*BasePercentile`
 * family and the game's `Quality (X Modifiers)` catalyst wording. A literal
 * `specName == "X"` scrape misses these entirely.
 */
function specKeyPatterns() {
  const seen = new Set();
  const out = [];
  for (const m of lua.matchAll(/specName:match\("([^"]+)"\)/g)) {
    // Capture groups inside the pattern are used to extract a value, not to
    // change what matches; strip them so both forms collapse to one rule.
    const pattern = m[1].replace(/\((\[[^\]]*\][+*?]?)\)/g, "$1");
    if (seen.has(pattern)) continue;
    seen.add(pattern);
    out.push({ lua: pattern, regex: luaPatternToRegex(pattern) });
  }
  if (out.length === 0) fail("found no specName patterns — Item.lua layout changed?");
  return out;
}

/** Tags understood inside a `{key:value}` mod-line prefix. */
function modLineTags() {
  const at = lua.indexOf('line:gsub("{(%a*):?([^}]*)}"');
  if (at === -1) fail("could not locate the mod-line tag handler");
  const tags = new Set();
  for (const m of lua.slice(at, at + 2000).matchAll(/k\s*==\s*"([^"]+)"/g)) tags.add(m[1]);
  if (tags.size < 5) fail(`only found ${tags.size} mod-line tags — Item.lua layout changed?`);
  return [...tags].sort();
}

/** Boolean `{flag}` markers on a mod line. */
function lineFlags() {
  const m = lua.match(/local lineFlags = \{([\s\S]*?)\n\}/);
  if (!m) fail("could not locate lineFlags");
  return [...m[1].matchAll(/\["([^"]+)"\]\s*=\s*true/g)].map((x) => x[1]).sort();
}

/**
 * Catalyst item names — what `Catalyst: Intrinsic` actually holds. Parallel to
 * catalystDescriptors, which is the mod-group wording the game uses instead
 * (`Quality (Attribute Modifiers)`). Both index the same catalystTags row.
 */
function catalystNames() {
  const m = lua.match(/local catalystList = \{([^}]*)\}/);
  if (!m) fail("could not locate catalystList");
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}

/** Catalyst display names, in the index order PoB stores them by. */
function catalystDescriptors() {
  const m = lua.match(/local catalystDescriptorList = \{([^}]*)\}/);
  if (!m) fail("could not locate catalystDescriptorList");
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}

/** Mod tags each catalyst scales, parallel to catalystDescriptors. */
function catalystTags() {
  const m = lua.match(/local catalystTags = \{([\s\S]*?)\n\}/);
  if (!m) fail("could not locate catalystTags");
  return [...m[1].matchAll(/\{([^}]*)\}/g)].map((row) =>
    [...row[1].matchAll(/"([^"]+)"/g)].map((x) => x[1])
  );
}

/** Lines that are a bare flag rather than a mod, e.g. `Corrupted`. */
function standaloneFlags() {
  const flags = [];
  for (const m of lua.matchAll(/elseif line == "([^"]+)" then\s*\n\s*self\.(\w+) = true/g)) {
    flags.push([m[1], m[2]]);
  }
  if (flags.length < 3) fail(`only found ${flags.length} standalone flags — Item.lua layout changed?`);
  return flags;
}

/**
 * The sentence each timeless jewel writes its seed into, e.g.
 * `Denoted service of 1738 dekhara in the akhara of Nasima`. Scraped from
 * TimelessJewelListControl.lua so a new jewel family cannot be missed — 3.29's
 * `Remembrancing` Abyss jewels were added this way.
 */
function timelessSeedPhrases() {
  const file = path.join(POB_SRC, "Classes", "TimelessJewelListControl.lua");
  if (!fs.existsSync(file)) fail(`cannot find ${file}`);
  const src = fs.readFileSync(file, "utf-8");
  const phrases = new Set();
  for (const m of src.matchAll(/\{variant:\d+\}([A-Za-z][A-Za-z ]*?) \]\] \.\. data\.seed/g)) {
    phrases.add(m[1].trim());
  }
  if (phrases.size < 5) {
    fail(`only found ${phrases.size} timeless seed phrases — TimelessJewelListControl.lua changed?`);
  }
  return [...phrases].sort();
}

const names = catalystNames();
const descriptors = catalystDescriptors();
const tags = catalystTags();
// All three are parallel arrays indexed by catalyst. If they ever diverge, the
// scalar would be looked up against the wrong mod tags — fail rather than guess.
if (names.length !== descriptors.length || descriptors.length !== tags.length) {
  fail(
    `catalyst tables disagree: catalystList ${names.length}, ` +
      `catalystDescriptorList ${descriptors.length}, catalystTags ${tags.length}`
  );
}

const version = (() => {
  // manifest.xml sits at the checkout root, one level above src/.
  const manifest = path.join(POB_SRC, "..", "manifest.xml");
  if (!fs.existsSync(manifest)) return "unknown";
  const xml = fs.readFileSync(manifest, "utf-8");
  const number = xml.match(/number="([^"]+)"/)?.[1] ?? "unknown";
  // A checkout's manifest carries only the release number; the branch and commit
  // suffix are added by PoB's updater in an installed copy. That understates a
  // dev checkout, which can be well ahead of the release it names — variant
  // groups, for one, exist there before any released version writes them. Record
  // the revision when the checkout is a git working tree.
  const root = path.dirname(manifest);
  const git = (args) =>
    spawnSync("git", ["-C", root, ...args], { encoding: "utf-8" }).stdout?.trim();
  const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]);
  const commit = git(["rev-parse", "--short", "HEAD"]);
  return branch && commit ? `${number} (${branch} @ ${commit})` : number;
})();

const data = {
  specKeys: specKeys(),
  specKeyPatterns: specKeyPatterns(),
  modLineTags: modLineTags(),
  lineFlags: lineFlags(),
  catalystNames: names,
  catalystDescriptors: descriptors,
  catalystTags: tags,
  standaloneFlags: standaloneFlags(),
  timelessSeedPhrases: timelessSeedPhrases(),
};

const lit = (v) => JSON.stringify(v, null, 2).replace(/^(\s*)"([A-Za-z_]\w*)":/gm, '$1$2:');

const out = `// GENERATED FILE — do not edit by hand.
// Produced by scripts/generate-item-format.mjs from Path of Building's
// src/Classes/Item.lua (PoB ${version}).
//
// Regenerate after updating the PoB checkout:  node scripts/generate-item-format.mjs
// A diff here is usually a metadata key coming or going with a league mechanic;
// see src/services/itemParser.ts.

/** Path of Building version these tables were derived from. */
export const POB_VERSION = ${JSON.stringify(version)};

/** Metadata keys PoB recognises on a \`Key: value\` item line. */
export const SPEC_KEYS: readonly string[] = ${lit(data.specKeys)};

/**
 * Metadata keys PoB matches by pattern rather than equality, as regex sources.
 * \`lua\` is kept alongside so a diff points back at the line in Item.lua.
 */
export const SPEC_KEY_PATTERNS: readonly { lua: string; regex: string }[] = ${lit(
  data.specKeyPatterns
)};

/** Keys understood inside a \`{key:value}\` mod-line prefix. */
export const MOD_LINE_TAGS: readonly string[] = ${lit(data.modLineTags)};

/** Boolean \`{flag}\` markers on a mod line. */
export const LINE_FLAGS: readonly string[] = ${lit(data.lineFlags)};

/**
 * Catalyst item names, as written to \`Catalyst: X\` in a saved build.
 * Indexed in step with CATALYST_DESCRIPTORS and CATALYST_TAGS.
 */
export const CATALYST_NAMES: readonly string[] = ${lit(data.catalystNames)};

/**
 * Catalyst mod-group wording, as the game writes it in
 * \`Quality (Attribute Modifiers): +20%\`. Parallel to CATALYST_NAMES.
 */
export const CATALYST_DESCRIPTORS: readonly string[] = ${lit(data.catalystDescriptors)};

/** Mod tags each catalyst scales, parallel to CATALYST_DESCRIPTORS. */
export const CATALYST_TAGS: readonly (readonly string[])[] = ${lit(data.catalystTags)};

/** Whole-line flags such as \`Corrupted\`, mapped to the property they set. */
export const STANDALONE_FLAGS: readonly (readonly [string, string])[] = ${lit(data.standaloneFlags)};

/**
 * Opening words of the line a timeless jewel stores its seed in. The seed is the
 * first number after the phrase; the conqueror is the last word on the line.
 */
export const TIMELESS_SEED_PHRASES: readonly string[] = ${lit(data.timelessSeedPhrases)};
`;

if (checkOnly) {
  const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf-8") : "";
  if (current !== out) {
    console.error(
      "generate-item-format: src/data/itemFormat.generated.ts is out of date.\n" +
        "The PoB item format has changed. Run: node scripts/generate-item-format.mjs"
    );
    process.exit(1);
  }
  console.log("generate-item-format: up to date.");
} else {
  fs.writeFileSync(OUT, out);
  console.log(
    `generate-item-format: wrote ${OUT}\n` +
      `  PoB ${version}: ${data.specKeys.length} spec keys, ${data.modLineTags.length} mod tags, ` +
      `${data.lineFlags.length} line flags, ${names.length} catalysts, ` +
      `${data.specKeyPatterns.length} pattern keys`
  );
}
