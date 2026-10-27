/**
 * Reader for Path of Building's generated affix tables.
 *
 * `Data/ModExplicit.lua` and `Data/ModMaster.lua` are the ground truth for whether a
 * stat line is a prefix or a suffix, what tier it is and where it can roll. They are
 * plain Lua literals with no runtime dependencies, so we read them here rather than in
 * the Lua bridge: the bridge serves one request at a time, and a two-megabyte parse
 * there would stall every other call for data that never depends on the loaded build.
 */

import fs from "fs";
import path from "path";
import { resolvePoBLayout } from "../utils/pobLayout.js";

export type AffixSlot = "Prefix" | "Suffix";

export interface ModEntry {
  /** ModExplicit table key, or `master:<index>` for bench crafts, which are unkeyed. */
  id: string;
  source: "explicit" | "master";
  type: AffixSlot;
  /** The name the affix contributes to the item, e.g. "of Bameth". */
  affix: string;
  /** Every line this one affix prints. More than one means a hybrid. */
  statLines: string[];
  /** Minimum item level that can carry this tier. */
  level: number;
  /** Tiers of the same affix share a group; one group occupies one slot. */
  group: string;
  modTags: string[];
  /** ModExplicit base tags with a non-zero spawn weight. Empty for bench crafts. */
  slotTags: string[];
  /** Every ModExplicit base tag listed, including the zero-weight ones. */
  allSlotTags: string[];
  /** ModMaster item classes the bench can apply this to. Empty for explicit mods. */
  itemClasses: string[];
  /** False when every spawn weight is zero, so nothing can roll it. */
  obtainable: boolean;
}

type LuaValue = string | number | boolean | LuaTable;

interface LuaTable {
  array: LuaValue[];
  fields: Map<string, LuaValue>;
}

class LuaLiteralParser {
  private pos = 0;

  constructor(private readonly text: string) {}

  parseTable(): LuaTable {
    this.skipSpace();
    this.expect("{");
    const table: LuaTable = { array: [], fields: new Map() };

    while (true) {
      this.skipSpace();
      if (this.peek() === "}") {
        this.pos += 1;
        return table;
      }
      const key = this.tryReadKey();
      const value = this.parseValue();
      if (key === null) table.array.push(value);
      else table.fields.set(key, value);
      this.skipSpace();
      if (this.peek() === ",") this.pos += 1;
    }
  }

  /** A key is only a key if an `=` follows it, so anything else rewinds to a value. */
  private tryReadKey(): string | null {
    const start = this.pos;
    const key = this.peek() === "[" ? this.readBracketKey() : this.readIdentifier();
    if (key === null) return null;
    this.skipSpace();
    if (this.peek() === "=") {
      this.pos += 1;
      return key;
    }
    this.pos = start;
    return null;
  }

  private readBracketKey(): string | null {
    const match = /^\[\s*(?:"((?:[^"\\]|\\.)*)"|(-?\d+))\s*\]/.exec(this.text.slice(this.pos));
    if (!match) return null;
    this.pos += match[0].length;
    return match[1] === undefined ? match[2] : unescapeLua(match[1]);
  }

  private readIdentifier(): string | null {
    const match = /^[A-Za-z_][A-Za-z0-9_]*/.exec(this.text.slice(this.pos));
    if (!match) return null;
    this.pos += match[0].length;
    return match[0];
  }

  private parseValue(): LuaValue {
    this.skipSpace();
    const char = this.peek();
    if (char === "{") return this.parseTable();
    if (char === '"') return this.readString();

    const literal = /^(true|false|nil|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(this.text.slice(this.pos));
    if (!literal) throw new Error(`unparsable Lua value at offset ${this.pos}: ${this.text.slice(this.pos, this.pos + 40)}`);
    this.pos += literal[0].length;
    if (literal[0] === "true") return true;
    if (literal[0] === "false" || literal[0] === "nil") return false;
    return Number(literal[0]);
  }

  private readString(): string {
    const match = /^"((?:[^"\\]|\\.)*)"/.exec(this.text.slice(this.pos));
    if (!match) throw new Error(`unterminated Lua string at offset ${this.pos}`);
    this.pos += match[0].length;
    return unescapeLua(match[1]);
  }

  private skipSpace(): void {
    while (this.pos < this.text.length && /\s/.test(this.text[this.pos])) this.pos += 1;
  }

  private peek(): string {
    return this.text[this.pos] ?? "";
  }

  private expect(char: string): void {
    if (this.peek() !== char) throw new Error(`expected ${char} at offset ${this.pos}`);
    this.pos += 1;
  }
}

const unescapeLua = (raw: string): string => raw.replace(/\\(.)/g, "$1");

const strings = (value: LuaValue | undefined): string[] =>
  value && typeof value === "object" ? value.array.filter((item): item is string => typeof item === "string") : [];

const numbers = (value: LuaValue | undefined): number[] =>
  value && typeof value === "object" ? value.array.filter((item): item is number => typeof item === "number") : [];

const keysOf = (value: LuaValue | undefined): string[] =>
  value && typeof value === "object" ? [...value.fields.keys()] : [];

const readString = (table: LuaTable, key: string): string => {
  const value = table.fields.get(key);
  return typeof value === "string" ? value : "";
};

const readNumber = (table: LuaTable, key: string): number => {
  const value = table.fields.get(key);
  return typeof value === "number" ? value : 0;
};

/** Only tags that can actually spawn the mod; a zero weight means "never here". */
const positiveTags = (tags: string[], weights: number[]): string[] =>
  tags.filter((_tag, index) => (weights[index] ?? 0) > 0);

function projectEntry(table: LuaTable, id: string, source: ModEntry["source"]): ModEntry {
  const type = readString(table, "type");
  if (type !== "Prefix" && type !== "Suffix") throw new Error(`${id}: unexpected affix type "${type}"`);

  const statLines = table.array.filter((item): item is string => typeof item === "string");
  const statOrder = numbers(table.fields.get("statOrder"));
  // statOrder is emitted one entry per printed line, so a mismatch means the positional
  // strings were mis-split and every downstream affix count would be wrong.
  if (statOrder.length !== statLines.length) {
    throw new Error(`${id}: ${statLines.length} stat lines but ${statOrder.length} statOrder entries`);
  }

  const allSlotTags = strings(table.fields.get("weightKey"));
  const slotTags = positiveTags(allSlotTags, numbers(table.fields.get("weightVal")));

  return {
    id,
    source,
    type,
    affix: readString(table, "affix"),
    statLines,
    level: readNumber(table, "level"),
    group: readString(table, "group"),
    modTags: strings(table.fields.get("modTags")),
    slotTags,
    allSlotTags,
    itemClasses: keysOf(table.fields.get("types")),
    obtainable: source === "master" || slotTags.length > 0,
  };
}

/**
 * Both files emit exactly one entry per line, so we parse line by line and keep only the
 * projection. Parsing the file as one literal would hold every tradeHash in memory at once.
 */
export function parseModFile(text: string, source: ModEntry["source"]): ModEntry[] {
  return text.split("\n").reduce<ModEntry[]>((entries, line, index) => {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("--") || trimmed === "return {" || trimmed === "}") return entries;

    const keyed = /^\["((?:[^"\\]|\\.)*)"\]\s*=\s*/.exec(trimmed);
    const id = keyed ? unescapeLua(keyed[1]) : `master:${entries.length}`;
    const body = keyed ? trimmed.slice(keyed[0].length) : trimmed;
    const table = new LuaLiteralParser(body.replace(/,$/, "")).parseTable();

    return [...entries, projectEntry(table, id, source)];
  }, []);
}

interface CachedFile {
  mtimeMs: number;
  size: number;
  entries: ModEntry[];
}

const cache = new Map<string, CachedFile>();

export class ModDataUnavailableError extends Error {}

/**
 * Cached on mtime and size: PoB updates its data files on its own schedule, and the
 * server outlives those updates, so a stale parse would quietly answer last patch's
 * questions. Nothing is read until a tool actually asks for it.
 */
function loadFile(fileName: string, source: ModEntry["source"]): ModEntry[] {
  const layout = resolvePoBLayout(process.env.POB_PATH || process.env.POB_FORK_PATH);
  const filePath = path.join(layout.src, "Data", fileName);

  const stat = ((): fs.Stats => {
    try {
      return fs.statSync(filePath);
    } catch {
      throw new ModDataUnavailableError(
        `Path of Building's ${fileName} was not found at ${filePath}. Affix data needs an installed Path of Building or a checkout; point POB_PATH at one.`
      );
    }
  })();

  const cached = cache.get(filePath);
  if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) return cached.entries;

  const entries = parseModFile(fs.readFileSync(filePath, "utf8"), source);
  cache.set(filePath, { mtimeMs: stat.mtimeMs, size: stat.size, entries });
  return entries;
}

export const loadExplicitMods = (): ModEntry[] => loadFile("ModExplicit.lua", "explicit");

export const loadMasterMods = (): ModEntry[] => loadFile("ModMaster.lua", "master");

let combined: { explicit: ModEntry[]; master: ModEntry[]; all: ModEntry[] } | null = null;

/**
 * Rolled and bench-crafted mods in one list, with a stable array identity so callers that
 * index it can memoise on that identity. A reparse of either file yields a fresh array.
 */
export function loadAllMods(): ModEntry[] {
  const explicit = loadExplicitMods();
  const master = loadMasterMods();
  if (combined && combined.explicit === explicit && combined.master === master) return combined.all;

  combined = { explicit, master, all: [...explicit, ...master] };
  return combined.all;
}
