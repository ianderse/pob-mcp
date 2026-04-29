/**
 * Character Import Handlers
 *
 * Bridge between the official PoE character API (HTTP, on the Node side) and
 * the Lua import handlers (`import_passive_tree`, `import_items_skills`).
 *
 * PoB headless cannot make HTTP requests itself (lcurl is disabled), so this
 * module fetches the JSON bodies from pathofexile.com and forwards them to
 * the Lua side for the actual import.
 */

import type { LuaHandlerContext } from "./luaHandlers.js";
import {
  fetchCharacterList,
  fetchPassiveSkills,
  fetchItems,
  type PoeRealm,
  type PoeCharacterListEntry,
} from "../services/poeCharacterApi.js";
import { wrapHandler } from "../utils/errorHandling.js";

/** Options accepted by `handleImportCharacter`, mirroring the PoB GUI defaults. */
export interface ImportCharacterOptions {
  clearJewels?: boolean;
  clearItems?: boolean;
  clearSkills?: boolean;
  ignoreWeaponSwap?: boolean;
}

/** Subset of the LuaHandlerContext that import handlers actually need. */
export type ImportHandlerContext = Pick<
  LuaHandlerContext,
  "getLuaClient" | "ensureLuaClient"
>;

const CLASS_NAMES: Record<number, string> = {
  0: "Scion",
  1: "Marauder",
  2: "Ranger",
  3: "Witch",
  4: "Duelist",
  5: "Templar",
  6: "Shadow",
};

const ASCENDANCY_NAMES: Record<number, Record<number, string>> = {
  0: { 1: "Ascendant" },
  1: { 1: "Juggernaut", 2: "Berserker", 3: "Chieftain" },
  2: { 1: "Raider", 2: "Deadeye", 3: "Pathfinder" },
  3: { 1: "Occultist", 2: "Elementalist", 3: "Necromancer" },
  4: { 1: "Slayer", 2: "Gladiator", 3: "Champion" },
  5: { 1: "Inquisitor", 2: "Hierophant", 3: "Guardian" },
  6: { 1: "Assassin", 2: "Trickster", 3: "Saboteur" },
};

// Reverse-map the API's `class` field (which is the ascendancy name) to the
// base class. The PoE get-characters endpoint does NOT return classId.
const ASCENDANCY_TO_BASE_CLASS: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const [classIdStr, ascObj] of Object.entries(ASCENDANCY_NAMES)) {
    const baseClass = CLASS_NAMES[Number(classIdStr)];
    if (!baseClass) continue;
    for (const ascName of Object.values(ascObj)) {
      map[ascName] = baseClass;
    }
  }
  // Also include base-class names so an unascended character maps to itself.
  for (const baseClass of Object.values(CLASS_NAMES)) {
    map[baseClass] = baseClass;
  }
  return map;
})();

function classLabel(entry: PoeCharacterListEntry): string {
  if (typeof entry.class === "string" && entry.class) return entry.class;
  if (typeof entry.classId === "number") return CLASS_NAMES[entry.classId] ?? `Class ${entry.classId}`;
  return "Unknown";
}

function baseClassFor(entry: PoeCharacterListEntry): string {
  const ascOrClass = classLabel(entry);
  return ASCENDANCY_TO_BASE_CLASS[ascOrClass] ?? "Unknown";
}

function ascendancyLabel(entry: PoeCharacterListEntry): string {
  const ascOrClass = classLabel(entry);
  const base = ASCENDANCY_TO_BASE_CLASS[ascOrClass];
  if (!base) return "Unknown";
  // If `class` IS a base class, the character has no ascendancy yet.
  if (base === ascOrClass) return "None";
  return ascOrClass;
}

function resolveAccountName(accountName: string | undefined): string {
  const explicit = accountName?.trim();
  if (explicit) return explicit;

  const fromEnv = process.env.POE_ACCOUNT_NAME?.trim();
  if (fromEnv) return fromEnv;

  throw new Error(
    "account_name is required (with discriminator, e.g. account#1234), or set POE_ACCOUNT_NAME"
  );
}

function formatLastLogin(unixSeconds: number | undefined, nowMs: number): string {
  if (typeof unixSeconds !== "number" || !Number.isFinite(unixSeconds)) return "?";
  const ms = unixSeconds * 1000;
  const date = new Date(ms);
  const iso = date.toISOString().slice(0, 16).replace("T", " ");
  const deltaMs = nowMs - ms;
  if (deltaMs < 0) return `${iso} UTC (future?)`;
  const deltaMin = Math.floor(deltaMs / 60_000);
  let rel: string;
  if (deltaMin < 60) rel = `${deltaMin}m ago`;
  else if (deltaMin < 60 * 24) rel = `${Math.floor(deltaMin / 60)}h ago`;
  else rel = `${Math.floor(deltaMin / (60 * 24))}d ago`;
  return `${iso} UTC (${rel})`;
}

/**
 * List all characters on a PoE account.
 * Does NOT require the Lua bridge to be running — purely an HTTP call.
 */
export async function handleListCharacters(
  _context: ImportHandlerContext,
  accountName?: string,
  realm?: string
) {
  return wrapHandler("list characters", async () => {
    const accountTrimmed = resolveAccountName(accountName);

    const effectiveRealm = (realm ?? "pc") as PoeRealm;
    const characters = await fetchCharacterList(accountTrimmed, effectiveRealm);

    if (characters.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text:
              `No characters found on account "${accountTrimmed}" (realm: ${effectiveRealm}).\n\n` +
              `Tips:\n` +
              `- Make sure the account name includes the discriminator (e.g. account#1234).\n` +
              `- If the profile is private, set POE_SESSION_ID env var.`,
          },
        ],
      };
    }

    // Sort by last-login descending so the active character is on top.
    const sorted = [...characters].sort((a, b) => {
      const ta = typeof a.lastLoginTime === "number" ? a.lastLoginTime : 0;
      const tb = typeof b.lastLoginTime === "number" ? b.lastLoginTime : 0;
      return tb - ta;
    });

    // Render a markdown table with all fields the API actually returns.
    const lines: string[] = [];
    lines.push(`=== Characters on ${accountTrimmed} ===`);
    lines.push("");
    lines.push(`| Name | Level | Class | Ascendancy | League | Realm | Last Login | Pinnable |`);
    lines.push(`|------|-------|-------|------------|--------|-------|------------|----------|`);
    const nowMs = Date.now();
    for (const c of sorted) {
      const level = typeof c.level === "number" ? String(c.level) : "?";
      const base = baseClassFor(c);
      const asc = ascendancyLabel(c);
      const league = typeof c.league === "string" ? c.league : "?";
      const realm = typeof c.realm === "string" ? c.realm : "?";
      const lastLogin = formatLastLogin(c.lastLoginTime, nowMs);
      let pinnable: string = "?";
      if (typeof c.pinnable === "boolean") pinnable = c.pinnable ? "yes" : "no";
      lines.push(`| ${c.name} | ${level} | ${base} | ${asc} | ${league} | ${realm} | ${lastLogin} | ${pinnable} |`);
    }
    lines.push("");
    lines.push(`Total: ${characters.length} character(s). Sorted by most recent login.`);
    lines.push(
      `Use lua_import_character with account_name + character_name to import one into the loaded build.`
    );

    return {
      content: [{ type: "text" as const, text: lines.join("\n") }],
    };
  });
}

/**
 * A snapshot of the build state captured before/after import so we can
 * compute a diff and show the user what actually changed.
 */
interface BuildSnapshot {
  level: number | null;
  className: string | null;
  ascendClassName: string | null;
  treeNodeCount: number;
  stats: Record<string, number>;
  // slot name → item summary
  itemsBySlot: Record<string, { name: string; baseName?: string; rarity?: string }>;
  socketGroups: Array<{
    index: number;
    label: string;
    slot: string;
    gems: Array<{ name: string; level: number; quality: number }>;
  }>;
}

/** Stat keys we surface in the diff — kept short, focused on actionable numbers. */
const DIFF_STATS: ReadonlyArray<{ key: string; label: string; pct?: boolean }> = [
  { key: "Life", label: "Life" },
  { key: "EnergyShield", label: "ES" },
  { key: "Mana", label: "Mana" },
  { key: "TotalEHP", label: "EHP" },
  { key: "Armour", label: "Armour" },
  { key: "Evasion", label: "Evasion" },
  { key: "FireResist", label: "Fire Res", pct: true },
  { key: "ColdResist", label: "Cold Res", pct: true },
  { key: "LightningResist", label: "Light Res", pct: true },
  { key: "ChaosResist", label: "Chaos Res", pct: true },
  { key: "BlockChance", label: "Block", pct: true },
  { key: "EffectiveSpellSuppressionChance", label: "Spell Supp", pct: true },
];

async function captureBuildSnapshot(
  luaClient: import("../pobLuaBridge.js").PoBLuaApiClient
): Promise<BuildSnapshot> {
  // The bridge does not support concurrent requests (single-threaded stdio),
  // so we MUST call these sequentially, not via Promise.all.
  const info = await luaClient.getBuildInfo().catch(() => null);
  const stats = await luaClient.getStats().catch(() => ({}));
  const items = await luaClient.getItems().catch(() => []);
  const skills = await luaClient.getSkills().catch(() => null);
  const tree = await luaClient.getTree().catch(() => null);

  const itemsBySlot: BuildSnapshot["itemsBySlot"] = {};
  if (Array.isArray(items)) {
    for (const it of items) {
      if (!it || typeof it !== "object") continue;
      const slot = typeof it.slot === "string" ? it.slot : null;
      const name = typeof it.name === "string" ? it.name : null;
      if (!slot || !name) continue;
      // PoB returns id=0 for empty slot entries.
      if (it.id === 0) continue;
      itemsBySlot[slot] = {
        name,
        baseName: typeof it.baseName === "string" ? it.baseName : undefined,
        rarity: typeof it.rarity === "string" ? it.rarity : undefined,
      };
    }
  }

  const socketGroups: BuildSnapshot["socketGroups"] = [];
  if (skills && Array.isArray(skills.groups)) {
    for (const g of skills.groups) {
      if (!g || typeof g !== "object") continue;
      const gemList: BuildSnapshot["socketGroups"][number]["gems"] = [];
      if (Array.isArray(g.gems)) {
        for (const gem of g.gems) {
          if (!gem || typeof gem.name !== "string") continue;
          gemList.push({
            name: gem.name,
            level: typeof gem.level === "number" ? gem.level : 0,
            quality: typeof gem.quality === "number" ? gem.quality : 0,
          });
        }
      }
      socketGroups.push({
        index: typeof g.index === "number" ? g.index : 0,
        label: typeof g.label === "string" ? g.label : "",
        slot: typeof g.slot === "string" ? g.slot : "",
        gems: gemList,
      });
    }
  }

  return {
    level: info && typeof info.level === "number" ? info.level : null,
    className: info && typeof info.className === "string" ? info.className : null,
    ascendClassName:
      info && typeof info.ascendClassName === "string" ? info.ascendClassName : null,
    treeNodeCount: tree && Array.isArray(tree.nodes) ? tree.nodes.length : 0,
    stats: (stats as Record<string, number>) || {},
    itemsBySlot,
    socketGroups,
  };
}

function fmtNum(n: number, pct: boolean | undefined): string {
  if (!Number.isFinite(n)) return "?";
  if (pct) return `${Math.round(n)}%`;
  if (Math.abs(n) >= 1000) return Math.round(n).toLocaleString("en-US");
  return Math.round(n * 10) / 10 + "";
}

function fmtDelta(delta: number, pct: boolean | undefined): string {
  if (delta === 0) return "—";
  const sign = delta > 0 ? "+" : "";
  return `${sign}${fmtNum(delta, pct)}`;
}

function buildStatsDiff(before: BuildSnapshot, after: BuildSnapshot): string[] {
  const lines: string[] = [];
  lines.push(`| Stat | Before | After | Δ |`);
  lines.push(`|------|--------|-------|---|`);
  for (const { key, label, pct } of DIFF_STATS) {
    const b = Number(before.stats[key] ?? 0);
    const a = Number(after.stats[key] ?? 0);
    if (b === 0 && a === 0) continue;
    const delta = a - b;
    const indicator = delta > 0 ? "▲" : delta < 0 ? "▼" : "=";
    lines.push(
      `| ${label} | ${fmtNum(b, pct)} | ${fmtNum(a, pct)} | ${indicator} ${fmtDelta(delta, pct)} |`
    );
  }
  return lines;
}

function buildItemsDiff(before: BuildSnapshot, after: BuildSnapshot): string[] {
  const lines: string[] = [];
  const slots = new Set<string>([
    ...Object.keys(before.itemsBySlot),
    ...Object.keys(after.itemsBySlot),
  ]);
  const orderedSlots = Array.from(slots).sort((a, b) => a.localeCompare(b));

  const added: string[] = [];
  const removed: string[] = [];
  const replaced: string[] = [];
  const unchanged: string[] = [];

  for (const slot of orderedSlots) {
    const b = before.itemsBySlot[slot];
    const a = after.itemsBySlot[slot];
    if (!b && a) added.push(`+ **${slot}**: ${a.name}${a.rarity ? ` (${a.rarity})` : ""}`);
    else if (b && !a) removed.push(`- **${slot}**: ${b.name}${b.rarity ? ` (${b.rarity})` : ""}`);
    else if (b && a) {
      if (b.name !== a.name || b.baseName !== a.baseName) {
        replaced.push(`~ **${slot}**: ${b.name} → ${a.name}`);
      } else {
        unchanged.push(slot);
      }
    }
  }

  lines.push(`Items: ${added.length} added, ${removed.length} removed, ${replaced.length} replaced, ${unchanged.length} unchanged.`);
  if (added.length || removed.length || replaced.length) {
    lines.push("");
    if (added.length) {
      lines.push("**Added:**");
      lines.push(...added);
    }
    if (removed.length) {
      if (added.length) lines.push("");
      lines.push("**Removed:**");
      lines.push(...removed);
    }
    if (replaced.length) {
      if (added.length || removed.length) lines.push("");
      lines.push("**Replaced (same slot):**");
      lines.push(...replaced);
    }
  }
  return lines;
}

function gemSignature(g: { name: string; level: number; quality: number }): string {
  return `${g.name} ${g.level}/${g.quality}`;
}

function buildSkillsDiff(before: BuildSnapshot, after: BuildSnapshot): string[] {
  const lines: string[] = [];
  const totalBefore = before.socketGroups.length;
  const totalAfter = after.socketGroups.length;
  const totalGemsBefore = before.socketGroups.reduce((acc, g) => acc + g.gems.length, 0);
  const totalGemsAfter = after.socketGroups.reduce((acc, g) => acc + g.gems.length, 0);

  lines.push(
    `Socket groups: ${totalBefore} → ${totalAfter} (${fmtDelta(totalAfter - totalBefore, false)}). ` +
      `Gems total: ${totalGemsBefore} → ${totalGemsAfter} (${fmtDelta(totalGemsAfter - totalGemsBefore, false)}).`
  );

  // Try to match groups by label+slot. If too noisy, just show overall.
  const beforeKeys = new Set(before.socketGroups.map((g) => `${g.label}|${g.slot}`));
  const afterKeys = new Set(after.socketGroups.map((g) => `${g.label}|${g.slot}`));
  const removedGroups = before.socketGroups.filter((g) => !afterKeys.has(`${g.label}|${g.slot}`));
  const addedGroups = after.socketGroups.filter((g) => !beforeKeys.has(`${g.label}|${g.slot}`));

  if (removedGroups.length || addedGroups.length) {
    lines.push("");
    if (removedGroups.length) {
      lines.push(`**Removed groups (${removedGroups.length}):**`);
      for (const g of removedGroups) {
        lines.push(`- ${g.label || "(no label)"} [${g.slot}]: ${g.gems.map(gemSignature).join(", ") || "no gems"}`);
      }
    }
    if (addedGroups.length) {
      if (removedGroups.length) lines.push("");
      lines.push(`**Added groups (${addedGroups.length}):**`);
      for (const g of addedGroups) {
        lines.push(`+ ${g.label || "(no label)"} [${g.slot}]: ${g.gems.map(gemSignature).join(", ") || "no gems"}`);
      }
    }
  }
  return lines;
}

/**
 * Import a character from the official PoE API into the currently loaded
 * Lua-bridge build. Replaces tree, jewels, items, and skill gems.
 *
 * Captures a before/after snapshot and reports stat deltas + item/gem changes
 * so the user can verify the import did what they expected.
 */
export async function handleImportCharacter(
  context: ImportHandlerContext,
  accountName: string | undefined,
  characterName: string,
  realm?: string,
  options?: ImportCharacterOptions
) {
  return wrapHandler("import character", async () => {
    const accountTrimmed = resolveAccountName(accountName);
    if (!characterName || !characterName.trim()) {
      throw new Error("character_name is required");
    }

    const effectiveRealm = (realm ?? "pc") as PoeRealm;
    const charTrimmed = characterName.trim();

    // 1. Bridge required — must have a build loaded for items/tree to attach to.
    await context.ensureLuaClient();
    const luaClient = context.getLuaClient();
    if (!luaClient) {
      throw new Error("Lua client not initialized");
    }

    const buildInfo = await luaClient.getBuildInfo().catch(() => null);
    if (!buildInfo) {
      throw new Error("No build loaded. Use lua_load_build or lua_new_build first.");
    }

    // Resolve defaults to match the PoB GUI behavior.
    const clearJewels = options?.clearJewels ?? true;
    const clearItems = options?.clearItems ?? true;
    const clearSkills = options?.clearSkills ?? true;
    const ignoreWeaponSwap = options?.ignoreWeaponSwap ?? false;

    // 2. Fetch passive skills + items + character list in parallel.
    //    The list is needed only for `name`, `level`, `league`, and the
    //    ascendancy name (returned in `class`); the actual classId / ascendId
    //    come from the passive-skills JSON itself, not from this list.
    //    See ImportTab.lua:709 for the canonical contract — `charData` only
    //    needs `name`, `level`, `class`, and `league`.
    const [passiveJson, itemsJson, characters] = await Promise.all([
      fetchPassiveSkills(accountTrimmed, charTrimmed, effectiveRealm),
      fetchItems(accountTrimmed, charTrimmed, effectiveRealm),
      fetchCharacterList(accountTrimmed, effectiveRealm),
    ]);

    // 3. Find this character in the list to build char_data.
    const charMeta = characters.find(
      (c) => typeof c.name === "string" && c.name === charTrimmed
    );
    if (!charMeta) {
      throw new Error(
        `Character "${charTrimmed}" not found on account "${accountTrimmed}" (realm: ${effectiveRealm}). ` +
          `Use lua_list_characters to see available characters.`
      );
    }

    const charDataForLua = {
      name: charMeta.name,
      level: typeof charMeta.level === "number" ? charMeta.level : 1,
      class: classLabel(charMeta),
      league: typeof charMeta.league === "string" ? charMeta.league : "Standard",
    };

    // 4. Snapshot the build state BEFORE applying the import.
    const before = await captureBuildSnapshot(luaClient);

    // 5. Apply imports — sequential because the Lua bridge is single-request.
    //    A failure between the tree and items calls leaves the build in a
    //    partial state (new tree, old items). Surface that explicitly so the
    //    user knows they should `lua_reload_build` to revert.
    try {
      await luaClient.importPassiveTree({
        json: passiveJson,
        char_data: charDataForLua,
        clear_jewels: clearJewels,
      });
    } catch (err) {
      throw new Error(
        `import_passive_tree failed: ${(err as Error).message}. The build is unchanged — no rollback needed.`
      );
    }

    try {
      await luaClient.importItemsSkills({
        json: itemsJson,
        clear_items: clearItems,
        clear_skills: clearSkills,
        ignore_weapon_swap: ignoreWeaponSwap,
      });
    } catch (err) {
      throw new Error(
        `import_items_skills failed after the passive tree was already imported: ${(err as Error).message}. ` +
          `The build is in a PARTIAL state (new tree, old items). Run lua_reload_build to revert to the on-disk state, ` +
          `or lua_save_build to a new filename to keep the partial state.`
      );
    }

    // 6. Snapshot AFTER and compute the diff.
    const after = await captureBuildSnapshot(luaClient);

    // 7. Format the report.
    const ascLabel = ascendancyLabel(charMeta);
    const baseClass = baseClassFor(charMeta);
    const importedParts: string[] = ["passive tree"];
    if (clearJewels) importedParts.push("jewels");
    if (clearItems) importedParts.push("items");
    if (clearSkills) importedParts.push("skill gems");
    if (ignoreWeaponSwap) importedParts.push("(ignored weapon swap items)");

    const lines: string[] = [];
    lines.push(`# Import: "${charDataForLua.name}"`);
    lines.push("");
    lines.push(
      `Level ${charDataForLua.level} ${baseClass}${ascLabel !== "None" ? ` (${ascLabel})` : ""} — ${charDataForLua.league} (${effectiveRealm})`
    );
    lines.push("");
    lines.push(`Replaced from PoE API: ${importedParts.join(", ")}.`);

    // Class / ascendancy / level deltas (most often unchanged but worth showing).
    if (
      before.level !== after.level ||
      before.className !== after.className ||
      before.ascendClassName !== after.ascendClassName
    ) {
      lines.push("");
      lines.push(`## Build identity`);
      lines.push(
        `Level: ${before.level ?? "?"} → ${after.level ?? "?"} (${fmtDelta((after.level ?? 0) - (before.level ?? 0), false)})`
      );
      lines.push(
        `Class: ${before.className ?? "?"} → ${after.className ?? "?"}`
      );
      lines.push(
        `Ascendancy: ${before.ascendClassName ?? "?"} → ${after.ascendClassName ?? "?"}`
      );
    }

    // Tree node count.
    const treeDelta = after.treeNodeCount - before.treeNodeCount;
    lines.push("");
    lines.push(`## Passive tree`);
    lines.push(
      `Allocated nodes: ${before.treeNodeCount} → ${after.treeNodeCount} (${fmtDelta(treeDelta, false)})`
    );

    // Stats diff.
    lines.push("");
    lines.push(`## Stats`);
    lines.push(...buildStatsDiff(before, after));

    // Items diff.
    lines.push("");
    lines.push(`## Items`);
    lines.push(...buildItemsDiff(before, after));

    // Skills diff.
    lines.push("");
    lines.push(`## Skills`);
    lines.push(...buildSkillsDiff(before, after));

    // What's preserved (informational footer).
    lines.push("");
    lines.push(`## Preserved (NOT touched by import)`);
    lines.push(
      `- Configuration (bandit, pantheon, enemy stats, charge toggles)`
    );
    lines.push(`- Build notes`);
    lines.push(`- Other tree specs (only the active spec was replaced)`);
    lines.push(`- Other item sets (only the active set was replaced)`);
    lines.push(`- pob-mcp snapshots/history`);
    lines.push("");
    lines.push(
      `Run \`lua_save_build\` to persist these changes to disk, or \`validate_build\` for a full health audit.`
    );

    return {
      content: [{ type: "text" as const, text: lines.join("\n") }],
    };
  });
}
