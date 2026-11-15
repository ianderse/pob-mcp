--[[
Print a passive tree's node layout as JSON on stdout, for scripts/dossier-tree.mjs.

    luajit scripts/dossier-tree-layout.lua <PoB src>/TreeData/<version>

Reads only PoB's data files (tree.lua and sprites.lua), so it needs no PoB
runtime. Positions use PoB's own formula from Classes/PassiveTree.lua.
]]

local json = require("dkjson")

local treeDir = ...
assert(treeDir, "usage: dossier-tree-layout.lua <TreeData/version directory>")

local tree = dofile(treeDir .. "/tree.lua")

-- Sprite sheets, keyed by kind ("notableActive", ...). Trees from 3.25 ship them
-- in sprites.lua; 3.19 to 3.24 keep one per zoom level inside tree.lua, and the
-- images PoB ships locally belong to the largest zoom. Older trees use another
-- layout, so they get no icons.
local function loadSprites()
	local file = io.open(treeDir .. "/sprites.lua")
	if file then
		file:close()
		return dofile(treeDir .. "/sprites.lua").sprites
	end
	if not tree.sprites then return {} end
	local sheets = {}
	for kind, zooms in pairs(tree.sprites) do
		local largest
		for zoom in pairs(zooms) do
			if not largest or zoom > largest then largest = zoom end
		end
		sheets[kind] = zooms[largest]
	end
	return sheets
end
local sprites = loadSprites()

-- PassiveTreeClass:CalcOrbitAngles. Orbits of 16 and 40 nodes are not evenly
-- spaced, so 360 * i / n would put nodes in the wrong place.
local function orbitAngles(nodesInOrbit)
	local angles
	if nodesInOrbit == 16 then
		angles = { 0, 30, 45, 60, 90, 120, 135, 150, 180, 210, 225, 240, 270, 300, 315, 330 }
	elseif nodesInOrbit == 40 then
		angles = { 0, 10, 20, 30, 40, 45, 50, 60, 70, 80, 90, 100, 110, 120, 130, 135, 140, 150, 160, 170, 180, 190, 200, 210, 220, 225, 230, 240, 250, 260, 270, 280, 290, 300, 310, 315, 320, 330, 340, 350 }
	else
		angles = {}
		for i = 0, nodesInOrbit do
			angles[i + 1] = 360 * i / nodesInOrbit
		end
	end
	for i, degrees in ipairs(angles) do
		angles[i] = math.rad(degrees)
	end
	return angles
end

local anglesByOrbit = {}
-- Trees before 3.17 carry no orbit constants; PassiveTree.lua falls back to these.
local skillsPerOrbit = tree.constants.skillsPerOrbit or { 1, 6, 12, 12, 40 }
for orbit, count in ipairs(skillsPerOrbit) do
	anglesByOrbit[orbit] = orbitAngles(count)
end
local radii = tree.constants.orbitRadii or { 0, 82, 162, 335, 493 }

local function kindOf(node)
	if node.isKeystone then return "keystone" end
	if node.isMastery then return "mastery" end
	if node.isNotable then return "notable" end
	if node.isJewelSocket then return "jewel" end
	return "small"
end

local sheetByKind = {
	keystone = "keystoneActive",
	mastery = "masteryActiveSelected",
	notable = "notableActive",
	small = "normalActive",
}

-- Sheet filenames are CDN URLs; PoB ships the same image beside sprites.lua.
local function localSheetFile(url)
	return (url:gsub("%?.*$", ""):match("[^/]+$"))
end

local sheets = {}
local function spriteFor(node, kind)
	local sheetName = sheetByKind[kind]
	local sheet = sheetName and sprites[sheetName]
	-- An allocated mastery shows its activeIcon, as PassiveTree.lua draws it.
	local icon = kind == "mastery" and node.activeIcon or node.icon
	local cell = sheet and sheet.coords and icon and sheet.coords[icon]
	if not cell then return nil end
	local file = localSheetFile(sheet.filename)
	sheets[file] = { w = sheet.w, h = sheet.h }
	return { file = file, x = cell.x, y = cell.y, w = cell.w, h = cell.h }
end

local nodes = {}
for id, node in pairs(tree.nodes) do
	local group = node.group and tree.groups[node.group]
	local angles = node.orbit and anglesByOrbit[node.orbit + 1]
	local angle = angles and node.orbitIndex and angles[node.orbitIndex + 1]
	if group and angle then
		local radius = radii[node.orbit + 1]
		local kind = kindOf(node)
		local out = {}
		for i, target in ipairs(node.out or {}) do
			out[i] = tostring(target)
		end
		nodes[#nodes + 1] = {
			id = tostring(id),
			x = group.x + math.sin(angle) * radius,
			y = group.y - math.cos(angle) * radius,
			name = node.name,
			kind = kind,
			ascendancyName = node.ascendancyName,
			isAscendancyStart = node.isAscendancyStart or nil,
			out = out,
			sprite = spriteFor(node, kind),
		}
	end
end

local classes = {}
for i, class in ipairs(tree.classes) do
	local ascendancies = {}
	for j, ascendancy in ipairs(class.ascendancies or {}) do
		ascendancies[j] = { id = ascendancy.id, name = ascendancy.name }
	end
	classes[i] = { name = class.name, ascendancies = ascendancies }
end

io.write(json.encode({ classes = classes, nodes = nodes, sheets = sheets }))
