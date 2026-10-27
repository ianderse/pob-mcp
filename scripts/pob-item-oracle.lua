--[[
Dump how Path of Building itself parses a set of items, as JSON on stdout.

This is the oracle `tests/unit/itemParser.oracle.test.ts` checks our TypeScript
parser against. Fixtures written by hand only prove the parser agrees with the
author's reading of Item.lua; this proves it agrees with Item.lua.

For each item it emits PoB's own serialisation (`BuildRaw`) plus the mod lines
PoB considers live, so the comparison is against behaviour rather than against
a transcription of the format.

Run it through the generator wrapper, which sets the paths and picks the
patched interpreter:

    node scripts/generate-item-oracle.mjs

Requires a LuaJIT that accepts PoB's compound assignment operators — stock
LuaJIT fails to parse Modules/Main.lua with a syntax error. Point POB_CMD at a
LuaJIT built against the lua51.dll Path of Building ships.
]]

if not GetVirtualScreenSize then
	function GetVirtualScreenSize() return 1920, 1080 end
end

local outPath = ...
assert(outPath, "usage: pob-item-oracle.lua <output.json>")

-- HeadlessWrapper chatters over stdout; keep it out of the JSON.
dofile("HeadlessWrapper.lua")

local json = require("dkjson")

--- Find a unique's raw text in PoB's own data by name.
local function findUnique(category, name)
	for _, raw in ipairs(data.uniques[category] or {}) do
		if raw:match(name:gsub("%p", "%%%0")) then
			return "Rarity: UNIQUE\n" .. raw
		end
	end
	error("unique not found in data." .. category .. ": " .. name)
end

--- The mod lines PoB treats as present, in the order it stores them.
local function liveModLines(item)
	local live = {}
	for _, list in ipairs({ item.enchantModLines, item.implicitModLines, item.explicitModLines }) do
		for _, modLine in ipairs(list or {}) do
			local count = item:GetModLineVariantCount(modLine)
			for _ = 1, count do
				table.insert(live, (modLine.line:gsub("^%s+", "")))
			end
		end
	end
	return live
end

--- Apply a selection and report what PoB then considers live.
local function sample(label, item, apply)
	apply(item)
	-- Re-parse so the selection is reflected in the serialised text as well.
	item:ParseRaw(item:BuildRaw())
	apply(item)
	return {
		label = label,
		raw = item:BuildRaw(),
		usesVariantGroups = item.usesVariantGroups or false,
		selectedVersion = item.selectedVersion,
		liveMods = liveModLines(item),
	}
end

local samples = {}

-- Zana's Ingenuity is the only unique in PoB's data using variant groups: three
-- groups over twelve variants, which is exactly the case hand-written fixtures
-- are least able to get right.
local zanaRaw = findUnique("ring", "Zana's Ingenuity")
for _, selection in ipairs({
	{ label = "zana-life-reflect-burning", groups = { [1] = 1, [2] = 4, [3] = 9 } },
	{ label = "zana-es-nocrit-chilled", groups = { [1] = 2, [2] = 5, [3] = 12 } },
	{ label = "zana-mana-pen-shocked", groups = { [1] = 3, [2] = 7, [3] = 10 } },
}) do
	local item = new("Item"):Item(zanaRaw)
	table.insert(samples, sample(selection.label, item, function(it)
		it.variantGroupSelections = {}
		for groupId, variantId in pairs(selection.groups) do
			it.variantGroupSelections[groupId] = variantId
		end
	end))
end

-- Watcher's Eye exercises the legacy multi-slot scheme it replaced.
local watcherRaw = findUnique("generated", "Watcher's Eye")
for _, selection in ipairs({
	{ label = "watchers-eye-three-mods", variant = 46, alts = { 27, 2 } },
	{ label = "watchers-eye-two-mods", variant = 46, alts = { 27 } },
	{ label = "watchers-eye-one-mod", variant = 46, alts = {} },
}) do
	local item = new("Item"):Item(watcherRaw)
	table.insert(samples, sample(selection.label, item, function(it)
		it.variant = selection.variant
		it.hasAltVariant = selection.alts[1] ~= nil
		it.variantAlt = selection.alts[1]
		it.hasAltVariant2 = selection.alts[2] ~= nil
		it.variantAlt2 = selection.alts[2]
	end))
end

-- A catalysed rare, so the scaling rule is checked against PoB's arithmetic.
for _, catalyst in ipairs({ "Intrinsic", "Prismatic" }) do
	local raw = table.concat({
		"Rarity: RARE",
		"Oracle Ring",
		"Ruby Ring",
		"Catalyst: " .. catalyst,
		"CatalystQuality: 20",
		"Implicits: 1",
		"{tags:elemental,fire,resistance}{range:1}+(20-30)% to Fire Resistance",
		"{tags:attribute}{range:1}+(10-13) to all Attributes",
		"{tags:resistance}{range:0.5}+(20-40)% to Chaos Resistance",
	}, "\n")
	local item = new("Item"):Item(raw)
	table.insert(samples, sample("catalyst-" .. catalyst:lower(), item, function() end))
end

local handle = assert(io.open(outPath, "wb"))
handle:write(json.encode({ pobVersion = launch.versionNumber, samples = samples }, { indent = true }))
handle:close()
ConPrintf("oracle: wrote %d samples", #samples)
