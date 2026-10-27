---
name: analyzing-pob-builds
description: Use when analyzing a Path of Exile build through the pob MCP server, comparing upgrades, or verifying changes to items, gems, passives, and configuration.
---

# Analyzing PoB Builds

Verify the state PoB calculated before recommending a change. Keep saved-file
stats, live engine stats, and assumptions separate.

## Choose the right read path

| Need | Tool or source |
|---|---|
| Saved XML PlayerStat values | `get_build_stats(build_name)` |
| Current engine stats | `lua_get_stats(category="offense" or "defense")` |
| Current resistance, pool, reservation, and damage issues | `get_build_issues` |
| Compact current build, items, skills, and tree count | `lua_get_build_snapshot` |
| Elemental and physical maximum hits | `lua_get_stats(category="defense")` |
| Exact fields missing from a formatted response | `PoBLuaApiClient.getStats(fields)` in an isolated script |

`get_build_stats` reads XML through BuildService and its file cache. A live edit
does not update that saved XML until the build is saved. `get_build_issues` reads
live Lua stats; it is not an XML-cache reader. Its checks cover a selected field
list, so it is not a substitute for every detailed analysis.

The default `lua_get_stats` category uses a bounded default field list, omits
zeros, and limits displayed rows. Missing output is not proof of a zero stat.
Request the relevant category or exact bridge fields before drawing conclusions.
Two identical reads can be legitimate. Compare the state the change was supposed
to affect before diagnosing a cache or a failed mutation.

Source: `src/handlers/buildHandlers.ts`, `src/handlers/buildGoalsHandlers.ts`,
`src/handlers/luaHandlers.ts`, and `lua/pob_ops.lua`.

## Establish the baseline

1. Identify the requested build, active passive spec, item set, and main skill.
   Use `list_specs`, `list_item_sets`, and `get_skill_setup` when selection matters.
2. Load the intended file, or inspect the current in-memory build if the user is
   working there. Starting the bridge alone does not load the user's character.
3. Read configuration and record the enemy scenario. A default value does not
   establish what the user intends to model.
4. Read relevant keystones and attribute requirements before proposing gear.
5. Record the live fields needed for the comparison. Use the same scenario,
   selections, and field list on both sides.

Reloading discards live edits. Use `lua_reload_build` only when the disk file is
the intended source and any unsaved state has been preserved. An explicitly named
missing file must raise an error; do not substitute the build already in memory.

## Verify mutations against their intended effect

```text
before = read the relevant live state
apply one change
read the changed item, gem, node, or config value back
read the same live stats again
compare against the expected effect
```

A stat can stay unchanged after a valid edit. For example, a condition may be
inactive or another constraint may bind. Read back the changed state before
calling the operation a no-op. A snapshot's node count alone cannot distinguish
two allocations containing the same number of nodes; use `lua_get_tree` when IDs
or mastery selections matter.

Use parameter names from the current tool schema. Examples: `add_item` uses
`slot_name`, `set_gem_level` uses `group_index` and `gem_index`, and `set_config`
uses `config_name` and `value`. Do not infer names from another tool.

`set_config` validates keys and values against the loaded PoB's ConfigOptions.
Read whether it reports Updated or NOT Updated, then verify the effect. The bridge
returns per-key `applied` and `rejected` results. An MCP response without `isError`
alone does not prove that a config write was accepted.

`customMods` is not categorically unsupported. When the loaded ConfigOptions
contains it, the current bridge accepts its text and includes it in config reads.
Test the modifier on a scratch build and confirm both the readback and live delta.
A syntactically accepted string may still contain a modifier PoB does not parse.
Do not replace an existing custom-mod block without preserving its full contents.

`remove_gem` renumbers later gems. Find each target by name again after a removal
or process known indices in descending order. Read the socket group back afterward.
For multi-step comparisons, confirm the baseline before each variant.

## Classify items before recommending crafts

Use `classify_item_affixes`, `list_craftable_mods`, and `find_affix_tiers` when they
are advertised by the connected server. Otherwise inspect the corresponding data
from the same PoB installation as the engine. Do not assume an unadvertised tool
exists. Some PoB versions use `Data/ModExplicit.lua`; older versions use
`Data/ModItem.lua`. Bench entries are in `Data/ModMaster.lua`.

1. Pass only explicit lines to the classifier. Keep implicits, enchants, and
   unique-item text separate.
2. Group hybrids before counting slots. Several printed lines can be one affix.
3. Treat unmatched or ambiguous lines as incomplete knowledge. They may occupy
   slots; they do not establish room for a craft. Verify the item in game when
   the tool cannot give a complete classification.
4. Match the craft's prefix/suffix type, item class, required item level, and
   existing mod-group conflicts. A list of crafts for a base does not certify
   that a specific equipped item can accept every entry.
5. Inspect the affix name, value range, required level, and base restrictions.
   A filtered list's first or last entry is not evidence of its in-game T-number.
6. Recheck attributes after a swap. For exact live requirement fields not exposed
   by the tool output, request `Str`, `Dex`, `Int`, `ReqStr`, `ReqDex`, and `ReqInt`
   through the bridge. A calculated gain is not usable if equipment requirements
   are unmet in game.

Multiple saved item sets do not all contribute simultaneously. Check the active
set and any minion-specific equipment settings before asserting what an Animate
Guardian or another minion contributes. A set title alone does not prove that its
gear is modeled as a minion loadout.

Price specific rare affixes as well as uniques when shopping is requested. Keep
league, price date, listing assumptions, and measured build deltas alongside the
recommendation. Do not assume a rare is cheaper without checking.

## Compare defensive changes for the relevant damage

For a resistance comparison, inspect the individual elemental maximum hits in
addition to TotalEHP:

```text
min(FireMaximumHitTaken, ColdMaximumHitTaken, LightningMaximumHitTaken)
```

This measures the weakest elemental hit the configured model survives. It is not
a complete survival score: physical damage, chaos damage, recovery, damage over
time, and the chosen enemy scenario can change the priority.

Sweep candidate values and combinations using the real calculator when a result
is sensitive to a threshold. Increasing a resistance may still improve other
metrics after another element becomes the weakest one. State which metric stops
improving and which damage types the comparison excludes.

Replacing a weapon while retaining a shield is a different comparison from
switching to dual wield. Measure the full intended equipment change.

## Check passive reachability and mastery effects

Lower-level `calc_with` results measure a hypothetical allocation; they do not
establish a legal path or a point cost. Current upgrade suggestions filter some
foreign ascendancy and anoint-only candidates, but still verify the actual path.
Use `find_path_to_node` and inspect the resulting allocation before recommending
points. Blight notables without tree connections require anointing.

Match masteries by selected effect ID as well as node ID. When adding one, supply
`mastery_effects` and inspect the returned tree. Read any dropped-node report.
A reported simulation delta is not proof that a subsequent allocation succeeded.

## Use PoB's ailment report

`lua_get_ailments` reports the main skill's calculated non-damaging ailments for
the currently configured enemy. It distinguishes `appliedEffect` from
`calculatedEffect`, reports the minimum magnitude needed to land, and exposes a
threshold table when available. Freeze is outside this magnitude report.

A chance-based ailment can have zero effect credited in DPS until its magnitude
and enemy condition are configured. Use the exact enable/effect config keys the
report names; their spelling differs across ailments. Check that the calculated
magnitude can land, apply the intended scenario, then read the report and stats
again. Say when the magnitude could not be read.

Recheck after gear or enemy changes. Do not supply a universal shock fixed-point
formula or reuse one percentage across maps, bosses, skills, and minions. The tool
reports the main skill only; other groups or minions need their own evidence.

## Preserve the user's work

Run experiments in a separate bridge process or a uniquely named scratch copy.
Check `list_builds` before choosing the name. `lua_save_build` permits saving to
its known source file; replacing another existing file requires `overwrite: true`.
Preserve any unsaved state before loading another build. Snapshot restore reloads
the matching live source. If its response reports a
failed reload or a different live source, load the restored file before reading
live stats.

After an experiment, restore selections and configuration and compare the live
baseline. Keep the original file unchanged unless the user requested persistence.
Delete only scratch files created for this run. Label results as measured in the
engine, inferred from saved XML, or dependent on an explicit assumption.
