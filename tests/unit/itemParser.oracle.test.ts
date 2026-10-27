import fs from "fs";
import path from "path";
import { parseItem } from "../../src/services/itemParser.js";

/**
 * Check the item parser against Path of Building itself.
 *
 * The other suite proves the parser matches a reading of Item.lua. This one
 * proves it matches Item.lua's behaviour: the fixture is captured by running
 * PoB headless and recording, for each item, its own serialisation plus the mod
 * lines it considers live.
 *
 * Regenerate after a PoB update:
 *   POB_PATH=... POB_CMD=... node scripts/generate-item-oracle.mjs
 */
interface OracleSample {
  label: string;
  raw: string;
  usesVariantGroups: boolean;
  selectedVersion?: number;
  liveMods: string[];
}

const ORACLE = path.resolve(__dirname, "../fixtures/item-oracle.json");
const oracle: { pobVersion: string; pobRevision?: string; samples: OracleSample[] } = JSON.parse(
  fs.readFileSync(ORACLE, "utf-8")
);

/**
 * PoB stores a mod line with its `{...}` tags stripped but its rolled ranges
 * intact. Our parser resolves ranges for display, so compare on the unresolved
 * form — the question here is *which* mods are live, not the arithmetic.
 */
const comparable = (line: string) =>
  line
    .replace(/\{\w*(?::[^}]*)?\}/g, "")
    .replace(/\s+/g, " ")
    .trim();

describe(`itemParser vs Path of Building ${oracle.pobVersion}${oracle.pobRevision ? ` (${oracle.pobRevision})` : ""}`, () => {
  it("captured a fixture with something in it", () => {
    expect(oracle.samples.length).toBeGreaterThan(0);
  });

  it.each(oracle.samples.map((s) => [s.label, s] as const))(
    "agrees with PoB on which mods are live: %s",
    (_label, sample) => {
      const parsed = parseItem(sample.raw);
      expect(parsed.mods.map((m) => comparable(m.raw))).toEqual(
        sample.liveMods.map(comparable)
      );
    }
  );

  it.each(oracle.samples.map((s) => [s.label, s] as const))(
    "agrees with PoB on the selection scheme in use: %s",
    (_label, sample) => {
      const parsed = parseItem(sample.raw);
      expect(parsed.usesVariantGroups).toBe(sample.usesVariantGroups);
      expect(parsed.selectedVersion).toBe(sample.selectedVersion);
    }
  );

  it("covers the only unique that currently uses variant groups", () => {
    // Zana's Ingenuity, three groups over twelve variants. If PoB ever drops it
    // or the data moves, this fails rather than silently testing nothing.
    const grouped = oracle.samples.filter((s) => s.usesVariantGroups);
    expect(grouped.length).toBeGreaterThanOrEqual(3);
    for (const sample of grouped) {
      expect(sample.raw).toContain("Zana's Ingenuity");
      expect(sample.raw).toContain("Selected Variant Group:");
      // The scheme replaces the old keys rather than coexisting with them.
      expect(sample.raw).not.toContain("\nSelected Variant:");
      expect(sample.raw).not.toContain("Has Alt Variant");
    }
  });

  it("covers the legacy multi-slot scheme at one, two and three mods", () => {
    const watcher = oracle.samples.filter((s) => s.raw.includes("Watcher's Eye"));
    expect(watcher.map((s) => s.liveMods.length).sort()).toEqual([4, 5, 6]);
  });

  it("reports no unrecognised lines on any item PoB produced", () => {
    for (const sample of oracle.samples) {
      const parsed = parseItem(sample.raw);
      const hard = parsed.unknown.filter((u) => u.reason !== "approximated-catalyst");
      expect({ label: sample.label, unknown: hard }).toEqual({
        label: sample.label,
        unknown: [],
      });
    }
  });
});
