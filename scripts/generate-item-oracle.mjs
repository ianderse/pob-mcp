#!/usr/bin/env node
/**
 * Capture how Path of Building itself parses a set of items, into
 * tests/fixtures/item-oracle.json.
 *
 * Hand-written fixtures only prove the parser matches the author's reading of
 * Item.lua. This runs the real thing headless and records its answers, so the
 * item parser is checked against PoB's behaviour instead.
 *
 *   node scripts/generate-item-oracle.mjs [--check]
 *
 * Environment, matching the Lua bridge's own configuration:
 *   POB_PATH  src/ of a checkout. Unset, an installed PoB is used.
 *   POB_CMD   LuaJIT binary. Must accept PoB's compound assignment operators
 *             (`count += 1` in Modules/Main.lua) — stock LuaJIT cannot parse
 *             them and fails before any path resolution happens.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
// The server's own resolver, from the compiled output.
const { resolvePoBLayout } = await import("../build/utils/pobLayout.js").catch((error) => {
  console.error(`generate-item-oracle: cannot load build/utils/pobLayout.js (${error.code ?? error.message}). Run: npm run build`);
  process.exit(1);
});

const LAYOUT = resolvePoBLayout(process.env.POB_PATH || process.env.POB_FORK_PATH);
const POB_SRC = LAYOUT.src;
const POB_CMD = process.env.POB_CMD ?? "luajit";
const ORACLE = path.resolve("scripts", "pob-item-oracle.lua");
const OUT = path.resolve("tests", "fixtures", "item-oracle.json");
const checkOnly = process.argv.includes("--check");

function fail(msg) {
  console.error(`generate-item-oracle: ${msg}`);
  process.exit(1);
}

// An installed release predates the variant groups the oracle records, so writing
// from it would replace the fixture with older data and drop its revision stamp.
if (!checkOnly && LAYOUT.kind !== "checkout") {
  fail("regenerating the fixture needs a PathOfBuilding dev checkout. Set POB_PATH to its src/. --check works on an installed PoB.");
}

if (!fs.existsSync(path.join(POB_SRC, "HeadlessWrapper.lua"))) {
  fail(
    `no HeadlessWrapper.lua under ${POB_SRC}.\n` +
      `Install Path of Building, or set POB_PATH to the src directory of a checkout.`
  );
}

// An installed app keeps its Lua modules somewhere quite different from a
// checkout's runtime/, so take the search paths from the same resolver the
// bridge uses rather than rebuilding the checkout layout here.
const sep = ";"; // Lua's path separator, on every platform
const searchPath = (roots) => `${roots.join(sep)}${sep}${sep}`;

fs.mkdirSync(path.dirname(OUT), { recursive: true });
const tmp = path.join(os.tmpdir(), `pob-item-oracle-${process.pid}.json`);

const result = spawnSync(POB_CMD, [ORACLE, tmp], {
  cwd: POB_SRC,
  encoding: "utf-8",
  env: {
    ...process.env,
    LUA_PATH: searchPath(LAYOUT.luaPath),
    LUA_CPATH: searchPath(LAYOUT.luaCPath),
  },
});

if (result.error) {
  fail(`could not run ${POB_CMD}: ${result.error.message}\nSet POB_CMD to a PoB-compatible LuaJIT.`);
}
if (!fs.existsSync(tmp)) {
  const stderr = (result.stderr ?? "").trim();
  if (/'=' expected near/.test(stderr)) {
    fail(
      `${POB_CMD} cannot parse PoB's compound assignment operators.\n` +
        `Point POB_CMD at a patched LuaJIT (see README).\n\n${stderr}`
    );
  }
  fail(`the oracle produced no output.\n\n${stderr || result.stdout}`);
}

const captured = fs.readFileSync(tmp, "utf-8");
fs.rmSync(tmp, { force: true });
// PoB reports only its release number, which understates a dev checkout that can
// be well ahead of it. Stamp the revision so the fixture says which PoB made it.
const oracle = JSON.parse(captured);
const rev = (args) =>
  spawnSync("git", ["-C", POB_SRC, ...args], { encoding: "utf-8" }).stdout?.trim();
const branch = rev(["rev-parse", "--abbrev-ref", "HEAD"]);
const commit = rev(["rev-parse", "--short", "HEAD"]);
// An installed app sits in no git tree of its own, and an ancestor's would mislabel it.
if (LAYOUT.kind === "checkout" && branch && commit) oracle.pobRevision = `${branch} @ ${commit}`;

// Re-serialise rather than pass the capture through, so check mode is not
// sensitive to formatting or line endings.
const normalised = JSON.stringify(oracle, null, 2) + "\n";

if (checkOnly) {
  // Provenance stamps (release number, git revision) move with every checkout
  // bump while parsing behaviour can be identical; comparing them made --check
  // fail on any machine at a different commit with a message blaming PoB's
  // parsing. The samples are what the parser tests actually consume, so those
  // decide pass/fail here — a stamp mismatch is reported, not fatal.
  const { pobRevision: _rev, pobVersion: _ver, samples } = oracle;
  const withoutStamps = JSON.stringify({ samples }, null, 2) + "\n";
  const stripStamps = (text) => {
    try {
      const { pobRevision: _r, pobVersion: _v, samples: s } = JSON.parse(text);
      return JSON.stringify({ samples: s }, null, 2) + "\n";
    } catch {
      return text;
    }
  };
  const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf-8") : "";
  if (stripStamps(current) !== withoutStamps) {
    fail(
      "tests/fixtures/item-oracle.json is out of date.\n" +
        "PoB now parses these items differently, or this PoB predates the variant groups the oracle records\n" +
        "(a release does; a PathOfBuilding dev checkout does not). Run against a dev checkout: node scripts/generate-item-oracle.mjs"
    );
  }
  let recordedStamp = null;
  try {
    const recorded = JSON.parse(current);
    recordedStamp = recorded.pobRevision ?? recorded.pobVersion ?? null;
  } catch {
    /* fall through to the mismatch note below */
  }
  const stamp = oracle.pobRevision ?? oracle.pobVersion ?? null;
  if (recordedStamp !== stamp) {
    console.log(
      `generate-item-oracle: samples match; provenance differs (fixture: ${recordedStamp ?? 'unstamped'}, this run: ${stamp ?? 'unstamped'}). ` +
        `PoB parses identically here, so this passes; run the generator to refresh the stamp.`
    );
  } else {
    console.log("generate-item-oracle: up to date.");
  }
} else {
  fs.writeFileSync(OUT, normalised);
  const { pobVersion, samples } = JSON.parse(normalised);
  const where = oracle.pobRevision ? ` (${oracle.pobRevision})` : "";
  console.log(
    `generate-item-oracle: wrote ${OUT}\n` +
      `  PoB ${pobVersion}${where}: ${samples.length} samples`
  );
}
