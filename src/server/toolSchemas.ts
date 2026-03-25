/**
 * Tool Schemas
 *
 * Defines all MCP tool schemas for the PoB server.
 * These schemas describe the available tools, their parameters, and documentation.
 */

export interface ToolSchema {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, { type: string; description?: string; enum?: string[]; items?: { type: string }; default?: unknown }>;
    required?: string[];
  };
}

/**
 * Get all tool schemas for registration with the MCP server
 */
export function getToolSchemas(): ToolSchema[] {
  return [
    {
      name: "analyze_build",
      description: "Analyze a Path of Building build file and extract detailed information including stats, skills, gear, passive skill tree analysis with keystones, notables, jewel sockets, build archetype detection, and optimization suggestions",
      inputSchema: {
        type: "object",
        properties: {
          build_name: {
            type: "string",
            description: "Name of the build file (e.g., 'MyBuild.xml')",
          },
        },
        required: ["build_name"],
      },
    },
    {
      name: "compare_builds",
      description: "Compare two Path of Building builds side by side",
      inputSchema: {
        type: "object",
        properties: {
          build1: {
            type: "string",
            description: "First build file name",
          },
          build2: {
            type: "string",
            description: "Second build file name",
          },
        },
        required: ["build1", "build2"],
      },
    },
    {
      name: "list_builds",
      description: "List all available Path of Building builds",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "get_build_stats",
      description: "Extract specific stats from a build (Life, DPS, resistances, etc.)",
      inputSchema: {
        type: "object",
        properties: {
          build_name: {
            type: "string",
            description: "Name of the build file",
          },
        },
        required: ["build_name"],
      },
    },
    {
      name: "start_watching",
      description: "Start monitoring the builds directory for changes. Builds will be auto-reloaded when saved in PoB.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "stop_watching",
      description: "Stop monitoring the builds directory for changes.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "get_recent_changes",
      description: "Get a list of recently changed build files.",
      inputSchema: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Maximum number of recent changes to return (default: 10)",
          },
        },
      },
    },
    {
      name: "watch_status",
      description: "Check if file watching is currently enabled.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "refresh_tree_data",
      description: "Force refresh the passive skill tree data cache. Use this if tree data seems outdated.",
      inputSchema: {
        type: "object",
        properties: {
          version: {
            type: "string",
            description: "Specific tree version to refresh (optional, defaults to all versions)",
          },
        },
      },
    },
    {
      name: "compare_trees",
      description: "Compare passive skill trees between two builds, showing differences in allocated nodes",
      inputSchema: {
        type: "object",
        properties: {
          build1: {
            type: "string",
            description: "First build file name",
          },
          build2: {
            type: "string",
            description: "Second build file name",
          },
        },
        required: ["build1", "build2"],
      },
    },
    {
      name: "get_nearby_nodes",
      description: "Find notable and keystone passives near your current tree allocation. Uses loaded Lua bridge build when no build_name is provided.",
      inputSchema: {
        type: "object",
        properties: {
          build_name: {
            type: "string",
            description: "Build file to analyze (optional if a build is loaded via lua_load_build)",
          },
          max_distance: {
            type: "number",
            description: "Maximum path distance to search (default: 5)",
          },
          filter: {
            type: "string",
            description: "Optional text filter for node names/stats",
          },
        },
      },
    },
    {
      name: "find_path_to_node",
      description: "Find the shortest path from your current tree to a specific passive node. Uses loaded Lua bridge build when no build_name is provided.",
      inputSchema: {
        type: "object",
        properties: {
          build_name: {
            type: "string",
            description: "Build to analyze (optional if a build is loaded via lua_load_build)",
          },
          target_node_id: {
            type: "string",
            description: "ID of the target passive node",
          },
          show_alternatives: {
            type: "boolean",
            description: "Return up to 3 alternative paths instead of just the shortest (default: false)",
          },
        },
        required: ["target_node_id"],
      },
    },
    {
      name: "get_build_notes",
      description: "Read the notes/documentation from a PoB build file",
      inputSchema: {
        type: "object",
        properties: {
          build_name: { type: "string", description: "Name of the build file (e.g., 'MyBuild.xml')" },
        },
        required: ["build_name"],
      },
    },
    {
      name: "set_build_notes",
      description: "Write notes/documentation into a PoB build file (overwrites existing notes)",
      inputSchema: {
        type: "object",
        properties: {
          build_name: { type: "string", description: "Name of the build file" },
          notes: { type: "string", description: "Notes content to write (plain text or markdown)" },
        },
        required: ["build_name", "notes"],
      },
    },
  ];
}

/**
 * Get Lua-specific tool schemas (only included if Lua is enabled)
 */
export function getLuaToolSchemas(): any[] {
  return [
    {
      name: "lua_start",
      description: "Start the PoB headless API process. This will spawn the LuaJIT process that can load builds and compute stats using the actual PoB calculation engine.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "lua_stop",
      description: "Stop the PoB headless API process and clean up resources.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "lua_new_build",
      description: "Create a new blank build with specified class and ascendancy. Auto-starts the Lua bridge if needed (no need to call lua_start first). Classes and ascendancies (PoE1): Scion: Ascendant | Marauder: Juggernaut, Berserker, Chieftain | Ranger: Raider, Deadeye, Pathfinder | Witch: Occultist, Elementalist, Necromancer | Duelist: Slayer, Gladiator, Champion | Templar: Inquisitor, Hierophant, Guardian | Shadow: Assassin, Trickster, Saboteur",
      inputSchema: {
        type: "object",
        properties: {
          class_name: { type: "string", description: "Class name (e.g., 'Witch', 'Marauder')" },
          ascendancy: { type: "string", description: "Ascendancy class name (optional)" },
        },
        required: ["class_name"],
      },
    },
    {
      name: "lua_save_build",
      description: "Save the currently loaded in-memory Lua bridge build to a file. Required before using file-based tools (validate_build, analyze_build, etc.) on an in-memory build.",
      inputSchema: {
        type: "object",
        properties: {
          build_name: {
            type: "string",
            description: "Output filename (e.g., 'MyBuild.xml'). .xml extension added automatically if missing.",
          },
        },
        required: ["build_name"],
      },
    },
    {
      name: "lua_load_build",
      description: "Load a build file into the PoB calculation engine. Required before using other lua_* tools. AUTO-RETURNS a brief summary (life, DPS, EHP, resistances, top issues) — do NOT immediately follow with lua_get_stats or get_build_issues just to get basic numbers. Call additional tools only when you need details beyond the summary.",
      inputSchema: {
        type: "object",
        properties: {
          build_name: {
            type: "string",
            description: "Name of the build file to load",
          },
        },
        required: ["build_name"],
      },
    },
    {
      name: "list_specs",
      description: "List all passive tree specs in the currently loaded build. Each spec can have a different tree allocation, class, and ascendancy.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "select_spec",
      description: "Switch the active passive tree spec in the currently loaded build. Recalculates all stats with the selected spec.",
      inputSchema: {
        type: "object",
        properties: {
          index: { type: "number", description: "Spec index (1-based, use list_specs to see available specs)" },
        },
        required: ["index"],
      },
    },
    {
      name: "create_spec",
      description: "Create a new passive tree spec in the current build. Use for leveling guides: create specs titled 'Level 10', 'Level 20', etc. with different tree allocations. Use copyFrom to start from an existing spec and modify.",
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string", description: "Title for the new spec (e.g. 'Level 40 Tree')" },
          copyFrom: { type: "number", description: "Spec index (1-based) to copy class/ascendancy/nodes from" },
          activate: { type: "boolean", description: "Whether to switch to the new spec (default: true)" },
        },
      },
    },
    {
      name: "delete_spec",
      description: "Delete a passive tree spec from the current build. Cannot delete the last remaining spec or the currently active spec (switch first with select_spec).",
      inputSchema: {
        type: "object",
        properties: {
          index: { type: "number", description: "Spec index to delete (1-based, use list_specs to see available specs)" },
        },
        required: ["index"],
      },
    },
    {
      name: "rename_spec",
      description: "Rename a passive tree spec in the current build.",
      inputSchema: {
        type: "object",
        properties: {
          index: { type: "number", description: "Spec index to rename (1-based)" },
          title: { type: "string", description: "New title for the spec" },
        },
        required: ["index", "title"],
      },
    },
    {
      name: "list_item_sets",
      description: "List all item sets in the currently loaded build. Each item set can have different gear equipped.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "select_item_set",
      description: "Switch the active item set in the currently loaded build. Recalculates all stats with the selected item set.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "number", description: "Item set ID (use list_item_sets to see available item sets)" },
        },
        required: ["id"],
      },
    },
    {
      name: "set_character_level",
      description: "Set the character level for the currently loaded build. Recalculates all stats.",
      inputSchema: {
        type: "object",
        properties: {
          level: {
            type: "number",
            description: "Character level (1-100)",
          },
        },
        required: ["level"],
      },
    },
    {
      name: "lua_get_stats",
      description: "Get comprehensive calculated stats from the currently loaded build (requires lua_load_build first). Use category='offense' for DPS details, category='defense' for survivability, category='all' only when you need everything at once. Avoid calling multiple times with different categories — pick the right one.",
      inputSchema: {
        type: "object",
        properties: {
          category: {
            type: "string",
            description: "Stat category: 'offense', 'defense', 'all' (default: all)",
          },
        },
      },
    },
    {
      name: "lua_get_tree",
      description: "Get passive tree allocation from currently loaded build",
      inputSchema: {
        type: "object",
        properties: {
          include_node_ids: {
            type: "boolean",
            description: "Include the full list of allocated node IDs in the response (default: false). Omit unless you need to pass node IDs to another tool.",
          },
        },
      },
    },
    {
      name: "lua_set_tree",
      description: "Set passive tree allocation (modifies currently loaded build). IMPORTANT: (1) All nodes must form a connected path from the class start node — any node not reachable through other allocated nodes back to the start will be silently dropped. Use find_path_to_node first to discover the intermediate travel nodes needed to reach your target. (2) Maximum 8 ascendancy points — do not allocate more than 8 ascendancy nodes (excluding the ascendancy start node).",
      inputSchema: {
        type: "object",
        properties: {
          nodes: {
            type: "array",
            items: { type: "string" },
            description: "Array of node IDs to allocate",
          },
          classId: {
            type: "number",
            description: "Class ID (0=Scion, 1=Marauder, 2=Ranger, 3=Witch, 4=Duelist, 5=Templar, 6=Shadow). If omitted, preserves current class.",
          },
          ascendClassId: {
            type: "number",
            description: "Ascendancy class ID (0=None, 1-3 class-specific). Scion: 1=Ascendant | Marauder: 1=Juggernaut, 2=Berserker, 3=Chieftain | Ranger: 1=Raider, 2=Deadeye, 3=Pathfinder | Witch: 1=Occultist, 2=Elementalist, 3=Necromancer | Duelist: 1=Slayer, 2=Gladiator, 3=Champion | Templar: 1=Inquisitor, 2=Hierophant, 3=Guardian | Shadow: 1=Assassin, 2=Trickster, 3=Saboteur",
          },
        },
        required: ["nodes"],
      },
    },
    {
      name: "update_tree_delta",
      description: "Incrementally add or remove specific passive nodes from the current tree allocation. Automatically finds and includes intermediate path nodes when adding nodes that aren't directly adjacent to the current tree. Safer than lua_set_tree because you only specify the nodes to change, not the entire tree. Note: max 8 ascendancy points allowed.",
      inputSchema: {
        type: "object",
        properties: {
          add_nodes: {
            type: "array",
            items: { type: "string" },
            description: "Node IDs to add to the current allocation",
          },
          remove_nodes: {
            type: "array",
            items: { type: "string" },
            description: "Node IDs to remove from the current allocation",
          },
        },
      },
    },
    {
      name: "lua_get_build_info",
      description: "Get metadata about the currently loaded build: name, character level, class, ascendancy, and tree version. Useful to confirm which build is active after lua_load_build or lua_new_build. Classes and ascendancies (PoE1): Scion: Ascendant | Marauder: Juggernaut, Berserker, Chieftain | Ranger: Raider, Deadeye, Pathfinder | Witch: Occultist, Elementalist, Necromancer | Duelist: Slayer, Gladiator, Champion | Templar: Inquisitor, Hierophant, Guardian | Shadow: Assassin, Trickster, Saboteur",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "lua_reload_build",
      description: "Reload the current build from disk, picking up any changes made in PoB GUI or via direct XML editing. If build_name is omitted, reloads the build that is currently loaded (determined via lua_get_build_info).",
      inputSchema: {
        type: "object",
        properties: {
          build_name: {
            type: "string",
            description: "Name of the build file to reload (e.g., 'MyBuild.xml'). If omitted, reloads the currently loaded build.",
          },
        },
      },
    },
    {
      name: "search_tree_nodes",
      description: "Search passive tree for nodes matching specific criteria",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search query for node names or stats",
          },
          node_type: {
            type: "string",
            description: "Filter by type: 'keystone', 'notable', 'jewel', or 'any' (default)",
          },
          limit: {
            type: "number",
            description: "Maximum results to return (default: 20)",
          },
        },
        required: ["query"],
      },
    },
    {
      name: "add_item",
      description: "Add an item to the build from item text (paste from game)",
      inputSchema: {
        type: "object",
        properties: {
          item_text: {
            type: "string",
            description: "Full item text from clipboard",
          },
          slot_name: {
            type: "string",
            description: "Slot to equip in: Weapon 1, Weapon 2, Helmet, Body Armour, Gloves, Boots, Amulet, Ring 1, Ring 2, Belt, Flask 1-5",
            enum: ["Weapon 1", "Weapon 2", "Helmet", "Body Armour", "Gloves", "Boots", "Amulet", "Ring 1", "Ring 2", "Belt", "Flask 1", "Flask 2", "Flask 3", "Flask 4", "Flask 5"],
          },
        },
        required: ["item_text", "slot_name"],
      },
    },
    {
      name: "get_equipped_items",
      description: "Get all currently equipped items (empty slots are omitted). Returns name, base, rarity, and all mod lines (implicit, explicit, crafted, enchant) for each equipped item. Use when you need to evaluate gear choices or read specific affixes.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "toggle_flask",
      description: "Toggle a flask on/off",
      inputSchema: {
        type: "object",
        properties: {
          flask_number: {
            type: "number",
            description: "Flask slot number (1-5)",
          },
          active: {
            type: "boolean",
            description: "true to activate, false to deactivate",
          },
        },
        required: ["flask_number", "active"],
      },
    },
    {
      name: "get_skill_setup",
      description: "Get current skill gem setup. Default main_only=true shows only the main DPS socket group — use this first. Set main_only=false only if you need to see all utility/aura/movement groups too.",
      inputSchema: {
        type: "object",
        properties: {
          main_only: {
            type: "boolean",
            description: "Only show the main socket group (default: true). Set to false to see all socket groups.",
          },
        },
      },
    },
    {
      name: "set_main_skill",
      description: "Set which skill group is the main skill for DPS calculations",
      inputSchema: {
        type: "object",
        properties: {
          group_index: {
            type: "number",
            description: "Socket group index (1-based)",
          },
          active_skill_index: {
            type: "number",
            description: "Active skill index within group (1-based, optional). Selects which active skill in the group to use for DPS calculation — relevant when a group has multiple active skills.",
          },
        },
        required: ["group_index"],
      },
    },
    {
      name: "create_socket_group",
      description: "Create a new socket group for skill gems",
      inputSchema: {
        type: "object",
        properties: {
          label: {
            type: "string",
            description: "Label for the socket group (e.g., 'Main Skill', 'Auras')",
          },
          slot: {
            type: "string",
            description: "Item slot for sockets (e.g., 'Weapon 1', 'Body Armour')",
            enum: ["Weapon 1", "Weapon 2", "Helmet", "Body Armour", "Gloves", "Boots", "Amulet", "Ring 1", "Ring 2", "Belt", "Flask 1", "Flask 2", "Flask 3", "Flask 4", "Flask 5"],
          },
          enabled: {
            type: "boolean",
            description: "Whether group is enabled (default: true)",
          },
        },
        required: ["label"],
      },
    },
    {
      name: "add_gem",
      description: "Add a gem to a socket group. IMPORTANT: Use the gem's base name WITHOUT 'Support' suffix — e.g. 'Brutality' not 'Brutality Support', 'Concentrated Effect' not 'Concentrated Effect Support', 'Melee Physical Damage' not 'Melee Physical Damage Support'. The server will auto-resolve names but correct names ensure proper matching.",
      inputSchema: {
        type: "object",
        properties: {
          group_index: {
            type: "number",
            description: "Socket group index (1-based)",
          },
          gem_name: {
            type: "string",
            description: "Gem name WITHOUT 'Support' suffix (e.g. 'Brutality', 'Concentrated Effect', 'Multistrike')",
          },
          level: {
            type: "number",
            description: "Gem level (default: 20)",
          },
          quality: {
            type: "number",
            description: "Gem quality % (default: 0)",
          },
          enabled: {
            type: "boolean",
            description: "Whether gem is enabled (default: true)",
          },
        },
        required: ["group_index", "gem_name"],
      },
    },
    {
      name: "set_gem_level",
      description: "Set the level of a gem",
      inputSchema: {
        type: "object",
        properties: {
          group_index: {
            type: "number",
            description: "Socket group index (1-based)",
          },
          gem_index: {
            type: "number",
            description: "Gem index within group (1-based)",
          },
          level: {
            type: "number",
            description: "New gem level",
          },
        },
        required: ["group_index", "gem_index", "level"],
      },
    },
    {
      name: "set_gem_quality",
      description: "Set the quality of a gem",
      inputSchema: {
        type: "object",
        properties: {
          group_index: {
            type: "number",
            description: "Socket group index (1-based)",
          },
          gem_index: {
            type: "number",
            description: "Gem index within group (1-based)",
          },
          quality: {
            type: "number",
            description: "Quality percentage (0-23 for normal, up to 30+ for corrupted)",
          },
          quality_type: {
            type: "string",
            description: "Type: 'Default', 'Anomalous', 'Divergent', 'Phantasmal' (optional)",
          },
        },
        required: ["group_index", "gem_index", "quality"],
      },
    },
    {
      name: "remove_skill",
      description: "Remove an entire socket group",
      inputSchema: {
        type: "object",
        properties: {
          group_index: {
            type: "number",
            description: "Socket group index to remove (1-based)",
          },
        },
        required: ["group_index"],
      },
    },
    {
      name: "remove_gem",
      description: "Remove a specific gem from a socket group",
      inputSchema: {
        type: "object",
        properties: {
          group_index: {
            type: "number",
            description: "Socket group index (1-based)",
          },
          gem_index: {
            type: "number",
            description: "Gem index to remove (1-based)",
          },
        },
        required: ["group_index", "gem_index"],
      },
    },
    {
      name: "toggle_socket_group",
      description: "Enable or disable an entire socket group (e.g. turn off a mana reservation aura to test its effect on stats)",
      inputSchema: {
        type: "object",
        properties: {
          group_index: {
            type: "number",
            description: "Socket group index (1-based)",
          },
          enabled: {
            type: "boolean",
            description: "true to enable the group, false to disable it",
          },
        },
        required: ["group_index", "enabled"],
      },
    },
    {
      name: "toggle_gem",
      description: "Enable or disable a specific gem within a socket group",
      inputSchema: {
        type: "object",
        properties: {
          group_index: {
            type: "number",
            description: "Socket group index (1-based)",
          },
          gem_index: {
            type: "number",
            description: "Gem index within group (1-based)",
          },
          enabled: {
            type: "boolean",
            description: "true to enable the gem, false to disable it",
          },
        },
        required: ["group_index", "gem_index", "enabled"],
      },
    },
    {
      name: "setup_skill_with_gems",
      description: "Setup a complete skill with multiple support gems in one operation. Does NOT auto-set as main skill for DPS. Call set_main_skill with the returned group_index afterward if this should be the primary DPS skill.",
      inputSchema: {
        type: "object",
        properties: {
          label: {
            type: "string",
            description: "Label for skill group",
          },
          active_gem: {
            type: "string",
            description: "Active skill gem name",
          },
          support_gems: {
            type: "array",
            items: { type: "string" },
            description: "Array of support gem names",
          },
          slot: {
            type: "string",
            description: "Item slot (optional)",
            enum: ["Weapon 1", "Weapon 2", "Helmet", "Body Armour", "Gloves", "Boots", "Amulet", "Ring 1", "Ring 2", "Belt", "Flask 1", "Flask 2", "Flask 3", "Flask 4", "Flask 5"],
          },
        },
        required: ["label", "active_gem", "support_gems"],
      },
    },
    {
      name: "add_multiple_items",
      description: "Add multiple items at once (efficient bulk operation)",
      inputSchema: {
        type: "object",
        properties: {
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                item_text: { type: "string" },
                slot_name: { type: "string" },
              },
              required: ["item_text", "slot_name"],
            },
            description: "Array of items to add",
          },
        },
        required: ["items"],
      },
    },
    {
      name: "suggest_masteries",
      description: "Analyze all allocated mastery nodes and suggest the best effect choices by simulating each option's DPS/EHP impact. Requires a build to be loaded via lua_load_build.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "plan_leveling",
      description: "Generate an act-by-act leveling progression guide for a build, including skill gem progression, lab timing, and passive tree priority order",
      inputSchema: {
        type: "object",
        properties: {
          build_name: { type: "string", description: "Build file to read class/skill from (optional if build loaded in Lua bridge)" },
          class_name: { type: "string", description: "Override class name (e.g. 'Witch', 'Ranger')" },
          main_skill: { type: "string", description: "Override main skill name" },
          ascendancy: { type: "string", description: "Override ascendancy name" },
        },
      },
    },
    {
      name: "find_item_upgrades",
      description: "Generate a shopping spec for a gear slot — describes what item type, base, and mods to look for based on the build's current gaps (resistances, life, ES, DPS). Works with a loaded build in the Lua bridge. No trade API required.",
      inputSchema: {
        type: "object",
        properties: {
          slot: {
            type: "string",
            description: "Gear slot to get a shopping spec for (e.g., 'Helmet', 'Body Armour', 'Boots', 'Gloves', 'Belt', 'Amulet', 'Ring 1', 'Ring 2', 'Weapon 1', 'Weapon 2')",
          },
          build_name: {
            type: "string",
            description: "Build file to analyze (optional if a build is loaded via lua_load_build)",
          },
          priority: {
            type: "string",
            description: "What to optimize for: 'dps', 'defense', 'resistance', or 'balanced' (default: 'balanced')",
            enum: ["dps", "defense", "resistance", "balanced"],
          },
        },
        required: ["slot"],
      },
    },
  ];
}

/**
 * Get optimization tool schemas
 */
export function getOptimizationToolSchemas(): any[] {
  return [
    {
      name: "analyze_defenses",
      description: "Deep-dive into defensive layers (avoidance/mitigation/recovery): EHP, spell suppression, evasion, block, armour/PDR, life regen, leech. Use this when you specifically want detailed defense breakdown. validate_build already covers this — only call analyze_defenses separately if you need more defensive detail than validate_build provides.",
      inputSchema: {
        type: "object",
        properties: {
          build_name: {
            type: "string",
            description: "Build to analyze",
          },
        },
        required: ["build_name"],
      },
    },
    {
      name: "suggest_optimal_nodes",
      description: "AI-powered suggestion of optimal passive nodes based on build goals",
      inputSchema: {
        type: "object",
        properties: {
          build_name: {
            type: "string",
            description: "Build to optimize",
          },
          goal: {
            type: "string",
            description: "Optimization goal: 'damage', 'defense', 'life', 'es', or stat name",
          },
          points_available: {
            type: "number",
            description: "Number of passive points to spend (default: 10)",
          },
        },
        required: ["build_name", "goal"],
      },
    },
    {
      name: "optimize_tree",
      description: "Full passive tree optimization - removes inefficient nodes and reallocates to better options",
      inputSchema: {
        type: "object",
        properties: {
          build_name: {
            type: "string",
            description: "Build to optimize",
          },
          goal: {
            type: "string",
            description: "Primary optimization goal: 'damage', 'defense', 'balanced'",
          },
          constraints: {
            type: "object",
            description: "Constraints like minimum life, required keystones, etc.",
          },
          preserve_keystones: {
            type: "boolean",
            description: "Whether to preserve allocated keystones (default: true)",
          },
        },
        required: ["build_name", "goal"],
      },
    },
    {
      name: "analyze_items",
      description: "Analyze equipped items and suggest upgrades or improvements",
      inputSchema: {
        type: "object",
        properties: {
          build_name: {
            type: "string",
            description: "Build to analyze",
          },
        },
        required: ["build_name"],
      },
    },
    {
      name: "optimize_skill_links",
      description: "Analyze skill gem setups for 'more' multipliers, penetration, and support gem synergies. Flags missing multiplicative damage supports and suggests clear-speed vs bossing balance.",
      inputSchema: {
        type: "object",
        properties: {
          build_name: {
            type: "string",
            description: "Build to analyze",
          },
        },
        required: ["build_name"],
      },
    },
    {
      name: "create_budget_build",
      description: "Create a league-start/budget-friendly version of a build",
      inputSchema: {
        type: "object",
        properties: {
          build_name: {
            type: "string",
            description: "Build to create budget version of",
          },
          budget_tier: {
            type: "string",
            description: "Budget tier: 'league-start', 'low', 'medium' (default: league-start)",
          },
        },
        required: ["build_name"],
      },
    },
  ];
}

/**
 * Get configuration tool schemas (Phase 9)
 */
export function getConfigToolSchemas(): any[] {
  return [
    {
      name: "get_config",
      description: "View current configuration state including charge usage, enemy settings, and active conditions. Requires Lua bridge with a loaded build.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "set_config",
      description: "Modify configuration inputs. Common keys — Charges: usePowerCharges, useFrenzyCharges, useEnduranceCharges | Conditions: conditionFortify, conditionLeeching, conditionOnFullLife, conditionOnFullEnergyShield | Buffs: buffOnslaught | Enemy: enemyIsBoss ('Shaper'/'Pinnacle'/false), enemyLevel | Build: bandit ('None'/'Oak'/'Alira'/'Kraityn'), pantheonMajorGod, pantheonMinorGod. Call get_config to see all current values.",
      inputSchema: {
        type: "object",
        properties: {
          config_name: {
            type: "string",
            description: "Name of configuration input to change (e.g., 'usePowerCharges', 'enemyIsBoss', 'conditionFortify')",
          },
          value: {
            description: "New value (boolean for most flags, number for counts)",
          },
        },
        required: ["config_name", "value"],
      },
    },
    {
      name: "set_enemy_stats",
      description: "Configure enemy parameters for DPS calculations. Test against different enemy types (map boss, Shaper, Maven). Requires Lua bridge.",
      inputSchema: {
        type: "object",
        properties: {
          level: {
            type: "number",
            description: "Enemy level (default: 84)",
          },
          fire_resist: {
            type: "number",
            description: "Fire resistance % (default: 40)",
          },
          cold_resist: {
            type: "number",
            description: "Cold resistance % (default: 40)",
          },
          lightning_resist: {
            type: "number",
            description: "Lightning resistance % (default: 40)",
          },
          chaos_resist: {
            type: "number",
            description: "Chaos resistance % (default: 20)",
          },
          armor: {
            type: "number",
            description: "Enemy armor value",
          },
          evasion: {
            type: "number",
            description: "Enemy evasion value",
          },
        },
      },
    },
    {
      name: "save_config_preset",
      description: "Save the current configuration (charges, conditions, enemy settings) as a named preset for quick reuse",
      inputSchema: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Preset name (e.g. 'bossing', 'mapping', 'full-charges')",
          },
        },
        required: ["name"],
      },
    },
    {
      name: "load_config_preset",
      description: "Load a previously saved configuration preset, restoring all charge, condition, and enemy settings at once",
      inputSchema: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Preset name to load",
          },
        },
        required: ["name"],
      },
    },
    {
      name: "list_config_presets",
      description: "List all saved configuration presets",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
  ];
}

/**
 * Get build validation tool schemas (Phase 7)
 */
export function getValidationToolSchemas(): any[] {
  return [
    {
      name: "validate_build",
      description: "Comprehensive build validation: resistances, life pool, defensive layers (avoidance/mitigation/recovery), mana sustain, accuracy, flask immunities, damage scaling. Provides prioritized critical/warning/info recommendations. PREFER this over get_build_issues + analyze_defenses — it covers both in one call. Do not call all three.",
      inputSchema: {
        type: "object",
        properties: {
          build_name: {
            type: "string",
            description: "Build to validate. If omitted and Lua bridge is active, validates currently loaded build.",
          },
        },
      },
    },
  ];
}

/**
 * Get skill gem analysis tool schemas (Phase 11)
 */
export function getSkillGemToolSchemas(): any[] {
  return [
    {
      name: "analyze_skill_links",
      description: "Analyze skill gem setup and evaluate support gem choices. Detects build archetype, rates each support gem, and identifies issues with current setup.",
      inputSchema: {
        type: "object",
        properties: {
          build_name: {
            type: "string",
            description: "Build to analyze",
          },
          skill_index: {
            type: "number",
            description: "Which skill to analyze (0 = main skill, default: 0)",
          },
        },
        required: ["build_name"],
      },
    },
    {
      name: "suggest_support_gems",
      description: "Get intelligent support gem recommendations based on build archetype. Provides ranked suggestions with DPS estimates, cost, and reasoning.",
      inputSchema: {
        type: "object",
        properties: {
          build_name: {
            type: "string",
            description: "Build to analyze",
          },
          skill_index: {
            type: "number",
            description: "Which skill to optimize (0 = main skill, default: 0)",
          },
          count: {
            type: "number",
            description: "Number of suggestions to return (default: 5)",
          },
          include_exceptional: {
            type: "boolean",
            description: "Include Exceptional gem recommendations (default: true)",
          },
          budget: {
            type: "string",
            description: "Budget tier: 'league_start', 'mid_league', or 'endgame' (default: 'endgame')",
          },
        },
        required: ["build_name"],
      },
    },
    {
      name: "compare_gem_setups",
      description: "Compare multiple gem configurations side-by-side to evaluate different options. NOTE: Full DPS comparison requires Lua bridge integration (future enhancement).",
      inputSchema: {
        type: "object",
        properties: {
          build_name: {
            type: "string",
            description: "Build to test",
          },
          skill_index: {
            type: "number",
            description: "Which skill to test (default: 0)",
          },
          setups: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                gems: {
                  type: "array",
                  items: { type: "string" },
                },
              },
              required: ["name", "gems"],
            },
            description: "Array of gem setups to compare (minimum 2)",
          },
        },
        required: ["build_name", "setups"],
      },
    },
    {
      name: "validate_gem_quality",
      description: "Check all gems for quality and level improvements. Identifies missing quality, Exceptional upgrade opportunities, and corruption targets.",
      inputSchema: {
        type: "object",
        properties: {
          build_name: {
            type: "string",
            description: "Build to validate",
          },
          include_corrupted: {
            type: "boolean",
            description: "Include corruption recommendations for 21/23 gems (default: true)",
          },
        },
        required: ["build_name"],
      },
    },
    {
      name: "find_optimal_links",
      description: "Auto-generate the best support gem combination for a skill based on budget and optimization goal. Provides step-by-step upgrade path.",
      inputSchema: {
        type: "object",
        properties: {
          build_name: {
            type: "string",
            description: "Build to optimize",
          },
          skill_index: {
            type: "number",
            description: "Which skill to optimize (default: 0)",
          },
          link_count: {
            type: "number",
            description: "Number of links (4, 5, or 6)",
          },
          budget: {
            type: "string",
            description: "Budget tier: 'league_start', 'mid_league', or 'endgame' (default: 'endgame')",
          },
          optimize_for: {
            type: "string",
            description: "Optimization target: 'dps', 'clear_speed', 'bossing', or 'defense' (default: 'dps')",
          },
        },
        required: ["build_name", "link_count"],
      },
    },
    {
      name: "gem_upgrade_path",
      description: "Generate a prioritized gem upgrade shopping list showing which gems to level, quality, and upgrade to Exceptional versions, ordered by impact and budget",
      inputSchema: {
        type: "object",
        properties: {
          build_name: {
            type: "string",
            description: "Build file (optional if loaded in Lua bridge)",
          },
          budget: {
            type: "string",
            description: "Budget tier: 'league_start', 'mid_league', 'endgame' (default: endgame)",
          },
        },
      },
    },
  ];
}

/**
 * Get export and persistence tool schemas (Phase 8)
 */
export function getExportToolSchemas(): any[] {
  return [
    {
      name: "export_build",
      description: "Export a copy of a build to an XML file. Creates a variant/copy from an existing build file. NOTE: This does NOT export from Lua bridge - use save_tree to apply Lua bridge modifications back to files.",
      inputSchema: {
        type: "object",
        properties: {
          build_name: {
            type: "string",
            description: "Source build filename (e.g., 'MyBuild.xml')",
          },
          output_name: {
            type: "string",
            description: "Output filename (without .xml extension)",
          },
          output_directory: {
            type: "string",
            description: "Target directory (optional, defaults to POB_DIRECTORY/.pob-mcp/exports)",
          },
          overwrite: {
            type: "boolean",
            description: "Allow overwriting existing file (default: false)",
          },
          notes: {
            type: "string",
            description: "Additional notes to append to build notes",
          },
        },
        required: ["build_name", "output_name"],
      },
    },
    {
      name: "save_tree",
      description: "Update only the passive tree in an existing build file. Use this to apply tree optimizations or Lua bridge modifications back to the original build.",
      inputSchema: {
        type: "object",
        properties: {
          build_name: {
            type: "string",
            description: "Target build filename to update",
          },
          nodes: {
            type: "array",
            items: { type: "string" },
            description: "Array of node IDs to allocate",
          },
          mastery_effects: {
            type: "object",
            description: "Mastery selections as object mapping node ID to effect ID (optional)",
          },
          backup: {
            type: "boolean",
            description: "Create backup before modifying (default: true)",
          },
        },
        required: ["build_name", "nodes"],
      },
    },
    {
      name: "snapshot_build",
      description: "Create a versioned snapshot of a build for easy rollback. Snapshots are stored separately with metadata tracking stats and changes.",
      inputSchema: {
        type: "object",
        properties: {
          build_name: {
            type: "string",
            description: "Build to snapshot",
          },
          description: {
            type: "string",
            description: "Description of this snapshot (optional)",
          },
          tag: {
            type: "string",
            description: "User-friendly tag (e.g., 'before-respec', 'league-start') (optional)",
          },
        },
        required: ["build_name"],
      },
    },
    {
      name: "list_snapshots",
      description: "List all snapshots for a build with metadata and stats",
      inputSchema: {
        type: "object",
        properties: {
          build_name: {
            type: "string",
            description: "Build to list snapshots for",
          },
          limit: {
            type: "number",
            description: "Maximum number of snapshots to return (optional)",
          },
          tag_filter: {
            type: "string",
            description: "Filter by tag (optional)",
          },
        },
        required: ["build_name"],
      },
    },
    {
      name: "restore_snapshot",
      description: "Restore a build from a snapshot. Optionally creates a backup of current state before restoring.",
      inputSchema: {
        type: "object",
        properties: {
          build_name: {
            type: "string",
            description: "Build to restore",
          },
          snapshot_id: {
            type: "string",
            description: "Snapshot ID (timestamp) or tag to restore from",
          },
          backup_current: {
            type: "boolean",
            description: "Create snapshot of current state before restore (default: true)",
          },
        },
        required: ["build_name", "snapshot_id"],
      },
    },
    {
      name: "export_build_summary",
      description: "Generate a clean markdown summary of the loaded build suitable for sharing on Reddit, Discord, or as build documentation",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
  ];
}

/**
 * Get Trade API tool schemas (require POE_TRADE_ENABLED=true)
 */
export function getTradeToolSchemas(): any[] {
  return [
    {
      name: "search_trade_items",
      description: "Search the Path of Exile trade site for items with filters. Returns matching items with prices, stats, and seller information. Default limit is 5 items to minimize token usage. REQUIRES: POE_TRADE_ENABLED environment variable set to true.",
      inputSchema: {
        type: "object",
        properties: {
          league: {
            type: "string",
            description: "EXACT league name as specified by user (e.g., 'Standard', 'Settlers', 'Keepers', 'Hardcore'). Use get_leagues to see available leagues. Do not substitute or change the league name.",
          },
          item_name: {
            type: "string",
            description: "Specific item name to search for (e.g., 'Headhunter', 'Taste of Hate')",
          },
          item_type: {
            type: "string",
            description: "Base item type (e.g., 'Corsair Sword', 'Astral Plate')",
          },
          min_price: {
            type: "number",
            description: "Minimum price in the specified currency",
          },
          max_price: {
            type: "number",
            description: "Maximum price in the specified currency",
          },
          price_currency: {
            type: "string",
            description: "Currency for price filter (default: 'chaos'). Options: 'chaos', 'divine', 'exalted'",
          },
          item_rarity: {
            type: "string",
            description: "Item rarity filter: 'unique', 'rare', 'magic', 'normal'",
          },
          min_links: {
            type: "number",
            description: "Minimum number of links (for weapons/armor)",
          },
          corrupted: {
            type: "boolean",
            description: "Filter by corruption status (true/false/undefined for any)",
          },
          identified: {
            type: "boolean",
            description: "Filter by identification status",
          },
          mods: {
            type: "array",
            items: {
              type: "object",
              properties: {
                stat_id: { type: "string" },
                min: { type: "number" },
                max: { type: "number" },
              },
              required: ["stat_id"],
            },
            description: "List of stat filters with min/max values",
          },
          limit: {
            type: "number",
            description: "Maximum results (default: 5, max: 10)",
          },
        },
        required: ["league"],
      },
    },
    {
      name: "get_item_price",
      description: "Quick price check for a specific item by name. Returns current market price and recent sales. REQUIRES: POE_TRADE_ENABLED environment variable set to true. IMPORTANT: Use the EXACT league name the user specifies.",
      inputSchema: {
        type: "object",
        properties: {
          item_name: {
            type: "string",
            description: "Name of the item to price check",
          },
          league: {
            type: "string",
            description: "EXACT league name as specified by user",
          },
          item_type: {
            type: "string",
            description: "Item base type for more accurate results (optional)",
          },
          rarity: {
            type: "string",
            description: "Item rarity: 'unique', 'rare', 'magic', 'normal' (optional)",
            enum: ["unique", "rare", "magic", "normal"],
          },
        },
        required: ["item_name"],
      },
    },
    {
      name: "get_leagues",
      description: "Get list of currently active Path of Exile leagues. Use this to find the correct league name before searching trade or prices. REQUIRES: POE_TRADE_ENABLED environment variable set to true.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "search_stats",
      description: "Search for item stat/mod IDs to use in trade searches. Use this to find the correct stat_id values for mods you want to filter by. REQUIRES: POE_TRADE_ENABLED environment variable set to true.",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search query for stat names (e.g., 'life', 'fire resistance')",
          },
          limit: {
            type: "number",
            description: "Maximum results to return (default: 10)",
          },
        },
        required: ["query"],
      },
    },
    {
      name: "compare_trade_items",
      description: "Compare two trade items side by side with DPS/defense calculations. REQUIRES: POE_TRADE_ENABLED environment variable set to true.",
      inputSchema: {
        type: "object",
        properties: {
          item1_name: {
            type: "string",
            description: "First item name to compare",
          },
          item2_name: {
            type: "string",
            description: "Second item name to compare",
          },
          league: {
            type: "string",
            description: "EXACT league name as specified by user",
          },
          slot: {
            type: "string",
            description: "Gear slot for context-aware comparison",
          },
        },
        required: ["item1_name", "item2_name", "league"],
      },
    },
    {
      name: "search_cluster_jewels",
      description: "Search for cluster jewels with specific enchants and notables. REQUIRES: POE_TRADE_ENABLED environment variable set to true.",
      inputSchema: {
        type: "object",
        properties: {
          league: {
            type: "string",
            description: "EXACT league name as specified by user",
          },
          jewel_size: {
            type: "string",
            description: "Cluster jewel size: 'large', 'medium', or 'small'",
            enum: ["large", "medium", "small"],
          },
          enchant: {
            type: "string",
            description: "Enchant modifier name (e.g., 'Added Small Passive Skills grant: 10% increased Fire Damage')",
          },
          notables: {
            type: "array",
            items: { type: "string" },
            description: "Notable passives to search for (e.g., ['Doryani\\'s Lesson', 'Prismatic Heart'])",
          },
          max_price: {
            type: "number",
            description: "Maximum price in Chaos Orbs",
          },
          limit: {
            type: "number",
            description: "Maximum results to return (default: 5)",
          },
        },
        required: ["league", "jewel_size"],
      },
    },
    {
      name: "generate_shopping_list",
      description: "Generate a prioritized shopping list of items to upgrade for a build within a budget. REQUIRES: POE_TRADE_ENABLED environment variable set to true.",
      inputSchema: {
        type: "object",
        properties: {
          build_name: {
            type: "string",
            description: "Build to generate shopping list for",
          },
          league: {
            type: "string",
            description: "EXACT league name as specified by user",
          },
          budget: {
            type: "number",
            description: "Total budget in Chaos Orbs",
          },
          budget_tier: {
            type: "string",
            description: "Budget tier for recommendations (default: 'medium')",
            enum: ["budget", "medium", "endgame"],
          },
        },
        required: ["build_name", "league"],
      },
    },
  ];
}

/**
 * Get build goals/diagnostics tool schemas (require Lua bridge, no Trade API dependency)
 */
export function getBuildGoalsToolSchemas(): any[] {
  return [
    {
      name: "get_build_issues",
      description: "Quick issue scan: uncapped resistances, low life, over-reserved mana, incomplete spell suppression. Lighter than validate_build. Use this for a fast check; use validate_build when you want full analysis including flask immunities and damage scaling. Do NOT call both.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "get_passive_upgrades",
      description: "Find the best unallocated notable passives to pick up next, ranked by their actual stat impact. Uses calcWith to simulate each candidate and scores by relative DPS/EHP gain.",
      inputSchema: {
        type: "object",
        properties: {
          focus: {
            type: "string",
            description: "What to optimize for (default: 'both')",
            enum: ["dps", "defence", "both"],
          },
          max_results: {
            type: "number",
            description: "Maximum number of upgrade suggestions to return (default: 10)",
          },
        },
      },
    },
    {
      name: "analyze_build_cluster_jewels",
      description: "Analyze the cluster jewels currently equipped in the build, evaluate which notables synergize with the build archetype, and flag wasted notables",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "suggest_watchers_eye",
      description: "Recommend valuable Watcher's Eye jewel mods based on the build's active auras, ranked by tier (S/A/B) with best combo suggestions",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "check_boss_readiness",
      description: "Check if the loaded build meets the recommended thresholds for a specific endgame boss (Shaper, Elder, Sirus, Maven, Uber Elder, Eater of Worlds, Searing Exarch)",
      inputSchema: {
        type: "object",
        properties: {
          boss: {
            type: "string",
            description: "Boss name: 'shaper', 'elder', 'sirus', 'maven', 'uber_elder', 'eater', 'exarch', or 'pinnacle' for generic endgame",
          },
        },
        required: ["boss"],
      },
    },
    {
      name: "suggest_crafting",
      description: "Recommend the best crafting method for an item. Provide a gear slot and optionally a base type and desired mods. If a build is loaded, auto-detects the equipped base and build gaps.",
      inputSchema: {
        type: "object",
        properties: {
          slot: {
            type: "string",
            description: "Gear slot: helmet, chest, gloves, boots, weapon, offhand, ring, amulet, belt",
            enum: ["helmet", "chest", "gloves", "boots", "weapon", "offhand", "ring", "amulet", "belt"],
          },
          base: {
            type: "string",
            description: "Base item type (e.g. 'Hubris Circlet'). Auto-detected from equipped item if a build is loaded.",
          },
          desired_mods: {
            type: "array",
            items: { type: "string" },
            description: "List of desired mod descriptions (e.g. ['maximum life', 'cold resistance', 'spell damage'])",
          },
          budget: {
            type: "string",
            enum: ["low", "medium", "high"],
            description: "Crafting budget: low (<50c), medium (50-500c), high (500c+)",
          },
          ilvl: {
            type: "number",
            description: "Item level — determines which mod tiers are reachable. 84+ for top tiers on most bases.",
          },
          league: {
            type: "string",
            description: "League name for currency prices (default: Standard)",
          },
        },
        required: ["slot"],
      },
    },
  ];
}

/**
 * Get poe.ninja API tool schemas
 */
export function getPoeNinjaToolSchemas(): any[] {
  return [
    {
      name: "get_currency_rates",
      description: "Get current currency exchange rates from poe.ninja. Returns real-time market prices for all currencies in Chaos Orb equivalent. Updated every 5 minutes from live trading data. IMPORTANT: Use the EXACT league name the user specifies - do not substitute or guess.",
      inputSchema: {
        type: "object",
        properties: {
          league: {
            type: "string",
            description: "EXACT league name as specified by user (e.g., 'Standard', 'Settlers', 'Keepers', 'Hardcore'). Do not substitute or change this value.",
          },
        },
        required: ["league"],
      },
    },
    {
      name: "find_arbitrage",
      description: "Find currency arbitrage opportunities - profitable trading loops where you can trade currencies in a circle and end up with more than you started. Uses real-time poe.ninja rates to identify market inefficiencies. Perfect for making passive income through currency trading. IMPORTANT: Use the EXACT league name the user specifies - do not substitute or guess.",
      inputSchema: {
        type: "object",
        properties: {
          league: {
            type: "string",
            description: "EXACT league name as specified by user (e.g., 'Standard', 'Settlers', 'Keepers', 'Hardcore'). Do not substitute or change this value.",
          },
          min_profit_percent: {
            type: "number",
            description: "Minimum profit percentage to show (default: 1.0). Lower values find more opportunities but with smaller profits.",
          },
        },
        required: ["league"],
      },
    },
    {
      name: "calculate_trading_profit",
      description: "Calculate the profit/loss from a specific trading chain. Useful for testing your own trading strategies or validating arbitrage opportunities before executing them. Shows step-by-step conversion rates. IMPORTANT: Use the EXACT league name the user specifies - do not substitute or guess.",
      inputSchema: {
        type: "object",
        properties: {
          league: {
            type: "string",
            description: "EXACT league name as specified by user (e.g., 'Standard', 'Settlers', 'Keepers', 'Hardcore'). Do not substitute or change this value.",
          },
          currency_chain: {
            type: "array",
            description: "Array of currency names in trading order (e.g., ['Divine Orb', 'Chaos Orb', 'Exalted Orb', 'Divine Orb'])",
            items: {
              type: "string",
            },
          },
          start_amount: {
            type: "number",
            description: "Amount of first currency to start with (default: 1)",
          },
        },
        required: ["league", "currency_chain"],
      },
    },
  ];
}
