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
 *   POB_PATH  PathOfBuilding checkout's src/ directory (default ../PathOfBuilding/src)
 *   POB_CMD   LuaJIT binary. Must accept PoB's compound assignment operators
 *             (`count += 1` in Modules/Main.lua) — stock LuaJIT cannot parse
 *             them and fails before any path resolution happens.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const POB_SRC = process.env.POB_PATH ?? path.resolve("..", "PathOfBuilding", "src");
const POB_CMD = process.env.POB_CMD ?? "luajit";
const ORACLE = path.resolve("scripts", "pob-item-oracle.lua");
const OUT = path.resolve("tests", "fixtures", "item-oracle.json");
const checkOnly = process.argv.includes("--check");

function fail(msg) {
  console.error(`generate-item-oracle: ${msg}`);
  process.exit(1);
}

if (!fs.existsSync(path.join(POB_SRC, "HeadlessWrapper.lua"))) {
  fail(
    `no HeadlessWrapper.lua under ${POB_SRC}.\n` +
      `Set POB_PATH to a PathOfBuilding checkout's src/ directory.`
  );
}

const baseDir = POB_SRC.replace(/[/\\]src[/\\]?$/, "");
const runtimeDir = path.join(baseDir, "runtime");
const runtimeLua = path.join(runtimeDir, "lua");
const luaRocks = path.join(os.homedir(), ".luarocks", "lib", "lua", "5.1");
const ext = process.platform === "win32" ? "dll" : "so";
const sep = ";"; // Lua's path separator, on every platform

fs.mkdirSync(path.dirname(OUT), { recursive: true });
const tmp = path.join(os.tmpdir(), `pob-item-oracle-${process.pid}.json`);

const result = spawnSync(POB_CMD, [ORACLE, tmp], {
  cwd: POB_SRC,
  encoding: "utf-8",
  env: {
    ...process.env,
    LUA_PATH: `${runtimeLua}${path.sep}?.lua${sep}${runtimeLua}${path.sep}?${path.sep}init.lua${sep}${sep}`,
    LUA_CPATH: `${runtimeDir}${path.sep}?.${ext}${sep}${luaRocks}${path.sep}?.${ext}${sep}${sep}`,
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
  spawnSync("git", ["-C", baseDir, ...args], { encoding: "utf-8" }).stdout?.trim();
const branch = rev(["rev-parse", "--abbrev-ref", "HEAD"]);
const commit = rev(["rev-parse", "--short", "HEAD"]);
if (branch && commit) oracle.pobRevision = `${branch} @ ${commit}`;

// Re-serialise rather than pass the capture through, so check mode is not
// sensitive to formatting or line endings.
const normalised = JSON.stringify(oracle, null, 2) + "\n";

if (checkOnly) {
  const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf-8") : "";
  if (current !== normalised) {
    fail(
      "tests/fixtures/item-oracle.json is out of date.\n" +
        "PoB now parses these items differently. Run: node scripts/generate-item-oracle.mjs"
    );
  }
  console.log("generate-item-oracle: up to date.");
} else {
  fs.writeFileSync(OUT, normalised);
  const { pobVersion, samples } = JSON.parse(normalised);
  const where = oracle.pobRevision ? ` (${oracle.pobRevision})` : "";
  console.log(
    `generate-item-oracle: wrote ${OUT}\n` +
      `  PoB ${pobVersion}${where}: ${samples.length} samples`
  );
}
