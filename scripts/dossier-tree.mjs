#!/usr/bin/env node
/**
 * Draw a build's allocated passive tree as SVG for a character dossier.
 *
 *   npm run build
 *   node scripts/dossier-tree.mjs --build <file.xml> [--spec <n>] [--out <dir>]
 *                                 [--planned <id,id,...>] [--icons]
 *
 * Everything comes from the build and the PoB installation: the tree version,
 * class, ascendancy and allocated nodes are read from the selected passive spec
 * (the build's active spec unless --spec names another), and the node layout
 * from that version's TreeData. PoB is resolved the way the server resolves
 * it: POB_PATH, else an installed app.
 *
 * Writes tree.svg, and ascendancy.svg when the spec has an ascendancy. --planned
 * marks ascendancy nodes the player intends to take, numbered in the given
 * order. --icons embeds PoB's passive icon sheets (about 2 MB) so notables and
 * keystones show their art.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import { parseArgs } from "node:util";
import { XMLParser } from "fast-xml-parser";
import { resolvePoBLayout } from "../build/utils/pobLayout.js";

// Beside this file, whatever directory the script is run from.
const LAYOUT_SCRIPT = fileURLToPath(new URL("./dossier-tree-layout.lua", import.meta.url));
const POB_CMD = process.env.POB_CMD ?? "luajit";

function fail(message) {
  console.error(`dossier-tree: ${message}`);
  process.exit(1);
}

const { values: args } = parseArgs({
  options: {
    build: { type: "string" },
    spec: { type: "string" },
    out: { type: "string", default: "." },
    planned: { type: "string" },
    icons: { type: "boolean", default: false },
  },
});
if (!args.build) fail("--build <file.xml> is required.");

const asArray = (value) => (value === undefined ? [] : [value].flat());
const escapeXml = (text) =>
  String(text).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const fixed = (n) => n.toFixed(0);

// ---- the selected spec ----------------------------------------------------

const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" })
  .parse(fs.readFileSync(args.build, "utf-8"));
const treeElement = xml.PathOfBuilding?.Tree;
const specs = asArray(treeElement?.Spec);
if (specs.length === 0) fail(`${args.build} has no passive spec.`);

const specNumber = Number(args.spec ?? treeElement.activeSpec ?? 1);
const spec = specs[specNumber - 1];
if (!spec) fail(`spec ${specNumber} does not exist; ${args.build} has ${specs.length}.`);
if (!spec.treeVersion) fail(`spec ${specNumber} records no treeVersion.`);

// The version comes from the build file and becomes a directory whose tree.lua
// is executed, so it must name a directory, not a path.
if (!/^\w+$/.test(spec.treeVersion)) fail(`spec ${specNumber} has an invalid treeVersion ${JSON.stringify(spec.treeVersion)}.`);

const allocated = new Set(String(spec.nodes ?? "").split(",").filter(Boolean));
const planned = (args.planned ?? "").split(",").map((id) => id.trim()).filter(Boolean);

// ---- the tree layout from PoB's data --------------------------------------

const pob = resolvePoBLayout(process.env.POB_PATH || process.env.POB_FORK_PATH);
const treeDir = path.join(pob.src, "TreeData", spec.treeVersion);
if (!fs.existsSync(path.join(treeDir, "tree.lua"))) {
  fail(`Path of Building at ${pob.src} has no passive tree ${spec.treeVersion}. Point POB_PATH at a PoB that has it.`);
}

const result = spawnSync(POB_CMD, [LAYOUT_SCRIPT, treeDir], {
  encoding: "utf-8",
  maxBuffer: 64 * 1024 * 1024,
  env: { ...process.env, LUA_PATH: `${pob.luaPath.join(";")};;` },
});
if (result.error) fail(`could not run ${POB_CMD}: ${result.error.message}. Set POB_CMD to a LuaJIT binary.`);
if (result.status !== 0) fail(`reading ${treeDir} failed:\n${result.stderr}`);
let layout;
try {
  layout = JSON.parse(result.stdout);
} catch (error) {
  fail(`${LAYOUT_SCRIPT} printed no valid layout for ${treeDir}: ${error.message}`);
}

const nodesById = new Map(layout.nodes.map((node) => [node.id, node]));
const missing = [...allocated].filter((id) => !nodesById.has(id));
const ascendancy = layout.classes[Number(spec.classId ?? 0)]
  ?.ascendancies[Number(spec.ascendClassId ?? 0) - 1]?.id;

// ---- drawing ----------------------------------------------------------------

const ACCENT = "var(--accent, #c8a24a)";
const GROUND = "var(--ground, #14120f)";

/** Each connection once, even where both nodes list the other in `out`. */
const edgesWithin = (nodes) => {
  const ids = new Set(nodes.map((node) => node.id));
  const firstListing = (from, to) => from < to || !nodesById.get(to).out.includes(from);
  return nodes.flatMap((node) =>
    node.out
      .filter((target) => ids.has(target) && firstListing(node.id, target))
      .map((target) => [node, nodesById.get(target)])
  );
};
const line = ([a, b]) => `<line x1="${fixed(a.x)}" y1="${fixed(a.y)}" x2="${fixed(b.x)}" y2="${fixed(b.y)}"/>`;

function boundsOf(nodes, pad) {
  const xs = nodes.map((node) => node.x);
  const ys = nodes.map((node) => node.y);
  const minX = Math.min(...xs) - pad;
  const minY = Math.min(...ys) - pad;
  return { minX, minY, width: Math.max(...xs) + pad - minX, height: Math.max(...ys) + pad - minY };
}
const inside = (bounds) => (node) =>
  node.x >= bounds.minX && node.x <= bounds.minX + bounds.width &&
  node.y >= bounds.minY && node.y <= bounds.minY + bounds.height;

/**
 * Each sheet is embedded once; a node shows its cell through a nested <svg>
 * whose viewBox crops the sheet, clipped to the node's circle. A <pattern>
 * fill would be simpler, but rsvg-convert draws nothing for it, and the skill
 * checks pages with rsvg-convert.
 */
function iconArt(nodes) {
  if (!args.icons) return { defs: "", art: () => "" };
  const withSprite = nodes.filter((node) => node.sprite);
  if (withSprite.length === 0) console.log(`  tree ${spec.treeVersion} has no sprite data PoB ships locally; drawing without icons`);
  const files = [...new Set(withSprite.map((node) => node.sprite.file))];
  const sheetId = (file) => `sheet-${files.indexOf(file)}`;
  const defs = files.map((file) => {
    const { w, h } = layout.sheets[file];
    const data = fs.readFileSync(path.join(treeDir, file)).toString("base64");
    const type = { ".png": "image/png", ".webp": "image/webp" }[path.extname(file)] ?? "image/jpeg";
    return `<image id="${sheetId(file)}" width="${w}" height="${h}" href="data:${type};base64,${data}"/>`;
  });
  const art = (node, r) => {
    if (!node.sprite) return "";
    const { file, x, y, w, h } = node.sprite;
    return `<clipPath id="clip-${node.id}"><circle cx="${fixed(node.x)}" cy="${fixed(node.y)}" r="${r}"/></clipPath>` +
      `<svg x="${fixed(node.x - r)}" y="${fixed(node.y - r)}" width="${r * 2}" height="${r * 2}" viewBox="${x} ${y} ${w} ${h}" clip-path="url(#clip-${node.id})">` +
      `<use href="#${sheetId(file)}"/></svg>`;
  };
  return { defs: defs.join("\n"), art };
}

function renderTree() {
  const mainNodes = layout.nodes.filter((node) => !node.ascendancyName);
  const taken = mainNodes.filter((node) => allocated.has(node.id));
  if (taken.length === 0) return null;

  const bounds = boundsOf(taken, 700);
  const visible = mainNodes.filter(inside(bounds));
  const big = taken.filter((node) => node.kind !== "small");
  const icons = iconArt(big);
  const radius = { keystone: 132, mastery: 104, notable: 112, jewel: 112 };
  const contextRadius = { keystone: 34, notable: 26, jewel: 22 };

  const bigNode = (node) => {
    const r = radius[node.kind];
    return [
      `<circle cx="${fixed(node.x)}" cy="${fixed(node.y)}" r="${r + 7}" fill="${GROUND}"/>`,
      icons.art(node, r),
      `<circle cx="${fixed(node.x)}" cy="${fixed(node.y)}" r="${r}" fill="none" stroke="${ACCENT}" stroke-width="${node.kind === "keystone" ? 16 : 11}"/>`,
    ].join("");
  };
  const label = (node) =>
    `<text x="${fixed(node.x)}" y="${fixed(node.y - 152)}">${escapeXml(node.name)}</text>`;

  return [
    `<svg viewBox="${fixed(bounds.minX)} ${fixed(bounds.minY)} ${fixed(bounds.width)} ${fixed(bounds.height)}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Allocated passive tree">`,
    `<defs><filter id="glow" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="26" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`,
    icons.defs,
    `</defs>`,
    `<g stroke="currentColor" stroke-opacity=".10" stroke-width="8" fill="none">`,
    ...edgesWithin(visible).map(line),
    `</g>`,
    `<g fill="currentColor" fill-opacity=".16">`,
    ...visible
      .filter((node) => !allocated.has(node.id))
      .map((node) => `<circle cx="${fixed(node.x)}" cy="${fixed(node.y)}" r="${contextRadius[node.kind] ?? 13}"/>`),
    `</g>`,
    `<g stroke="${ACCENT}" stroke-width="13" stroke-linecap="round" fill="none" filter="url(#glow)" stroke-opacity=".85">`,
    ...edgesWithin(taken).map(line),
    `</g>`,
    `<g>`,
    ...taken
      .filter((node) => node.kind === "small")
      .map((node) => `<circle cx="${fixed(node.x)}" cy="${fixed(node.y)}" r="22" fill="${ACCENT}"/>`),
    ...big.map(bigNode),
    `</g>`,
    `<g font-family="Avenir Next Condensed, Avenir Next, Futura, sans-serif" font-size="118" font-weight="600" fill="currentColor" fill-opacity=".95" text-anchor="middle" paint-order="stroke" stroke="${GROUND}" stroke-width="16" stroke-linejoin="round">`,
    ...taken.filter((node) => (node.kind === "notable" || node.kind === "keystone") && node.name).map(label),
    `</g>`,
    `</svg>`,
  ].join("\n");
}

function renderAscendancy() {
  if (!ascendancy) return null;
  const nodes = layout.nodes.filter((node) => node.ascendancyName === ascendancy);
  if (nodes.length === 0) return null;

  const route = new Set([...allocated, ...planned]);
  const order = new Map(planned.map((id, index) => [id, index + 1]));
  const bounds = boundsOf(nodes, 180);
  const radiusOf = (node) => (node.kind === "notable" ? 30 : 20);
  const at = (node) => `cx="${fixed(node.x)}" cy="${fixed(node.y)}" r="${radiusOf(node)}"`;

  const marker = (node) => {
    if (allocated.has(node.id)) return `<circle ${at(node)} fill="${ACCENT}" stroke="${GROUND}" stroke-width="5"/>`;
    if (order.has(node.id)) {
      return `<circle ${at(node)} fill="none" stroke="${ACCENT}" stroke-width="7" stroke-opacity=".8"/>` +
        `<text x="${fixed(node.x)}" y="${fixed(node.y)}" dy="10" font-size="30" font-weight="700" fill="${ACCENT}" text-anchor="middle">${order.get(node.id)}</text>`;
    }
    return `<circle ${at(node)} fill="currentColor" fill-opacity=".2"/>`;
  };

  return [
    `<svg viewBox="${fixed(bounds.minX)} ${fixed(bounds.minY)} ${fixed(bounds.width)} ${fixed(bounds.height)}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${escapeXml(ascendancy)} ascendancy">`,
    `<g stroke="currentColor" stroke-opacity=".22" stroke-width="6" fill="none">`,
    ...edgesWithin(nodes).map(line),
    `</g>`,
    `<g stroke="${ACCENT}" stroke-opacity=".45" stroke-width="9" stroke-dasharray="18 14" fill="none">`,
    ...edgesWithin(nodes.filter((node) => route.has(node.id))).map(line),
    `</g>`,
    `<g font-family="Avenir Next Condensed, Avenir Next, sans-serif">`,
    ...nodes.map(marker),
    `</g>`,
    `<g font-family="Avenir Next Condensed, Avenir Next, sans-serif" font-size="34" font-weight="600" text-anchor="middle" paint-order="stroke" stroke="${GROUND}" stroke-width="7" stroke-linejoin="round">`,
    ...nodes
      .filter((node) => node.kind === "notable" && node.name)
      .map((node) =>
        `<text x="${fixed(node.x)}" y="${fixed(node.y - 46)}" fill="currentColor" fill-opacity="${route.has(node.id) ? ".95" : ".38"}">${escapeXml(node.name)}</text>`
      ),
    `</g>`,
    `</svg>`,
  ].join("\n");
}

// ---- output -----------------------------------------------------------------

if (planned.length > 0 && !ascendancy) {
  fail(`--planned needs an ascendancy, and spec ${specNumber} has none.`);
}
if (new Set(planned).size !== planned.length) fail("--planned lists a node twice.");
const unknownPlanned = planned.filter((id) => nodesById.get(id)?.ascendancyName !== ascendancy);
if (unknownPlanned.length > 0) {
  fail(`--planned names nodes outside the ${ascendancy ?? "(no)"} ascendancy on tree ${spec.treeVersion}: ${unknownPlanned.join(", ")}`);
}

const tree = renderTree();
if (!tree) fail(`spec ${specNumber} allocates no nodes on tree ${spec.treeVersion}.`);
fs.mkdirSync(args.out, { recursive: true });
const written = [["tree.svg", tree], ["ascendancy.svg", renderAscendancy()]]
  .filter(([, svg]) => svg)
  .map(([file, svg]) => {
    const target = path.join(args.out, file);
    fs.writeFileSync(target, svg);
    return target;
  });

const counts = [...allocated]
  .map((id) => nodesById.get(id))
  .filter((node) => node && !node.ascendancyName)
  .reduce((tally, node) => ({ ...tally, [node.kind]: (tally[node.kind] ?? 0) + 1 }), {});

console.log(
  `dossier-tree: spec ${specNumber}${spec.title ? ` "${spec.title}"` : ""}, tree ${spec.treeVersion}, ` +
    `${layout.classes[Number(spec.classId ?? 0)]?.name ?? "unknown class"}${ascendancy ? ` / ${ascendancy}` : ""}`
);
console.log(`  allocated: ${Object.entries(counts).map(([kind, n]) => `${n} ${kind}`).join(", ")}`);
if (missing.length > 0) console.log(`  not on tree ${spec.treeVersion}, skipped: ${missing.join(", ")}`);
console.log(`  wrote ${written.join(", ")}`);
