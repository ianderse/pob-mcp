/**
 * Tool Schemas
 *
 * Defines all MCP tool schemas for the PoB server.
 * These schemas describe the available tools, their parameters, and documentation.
 */

/**
 * Get all tool schemas for registration with the MCP server
 */
export function getToolSchemas(): any[] {
  return [
    {
      name: "continue",
      description: "Unlock the tool gate to allow calling more tools. The server locks after EVERY tool call to prevent automatic chaining. You MUST call this first before any other tool if the gate is locked. This tool exists to force you to pause and ask the user what they want before proceeding.",
      inputSchema: {
        type: "object",
        properties: {},
        required: [],
      },
    },
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
      name: "test_allocation",
      description: "Test allocating specific passive nodes to see their impact on build stats",
      inputSchema: {
        type: "object",
        properties: {
          build_name: {
            type: "string",
            description: "Build to test on",
          },
          node_ids: {
            type: "array",
            items: { type: "string" },
            description: "Array of node IDs to test allocating",
          },
        },
        required: ["build_name", "node_ids"],
      },
    },
    {
      name: "plan_tree",
      description: "Create a passive tree plan to reach a specific notable or keystone efficiently",
      inputSchema: {
        type: "object",
        properties: {
          build_name: {
            type: "string",
            description: "Build to plan for",
          },
          target_node_name: {
            type: "string",
            description: "Name of the target notable or keystone",
          },
        },
        required: ["build_name", "target_node_name"],
      },
    },
    {
      name: "get_nearby_nodes",
      description: "Find notable and keystone passives near your current tree allocation",
      inputSchema: {
        type: "object",
        properties: {
          build_name: {
            type: "string",
            description: "Build to analyze",
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
        required: ["build_name"],
      },
    },
    {
      name: "find_path_to_node",
      description: "Find the shortest path from your current tree to a specific passive node",
      inputSchema: {
        type: "object",
        properties: {
          build_name: {
            type: "string",
            description: "Build to analyze",
          },
          target_node_id: {
            type: "string",
            description: "ID of the target passive node",
          },
        },
        required: ["build_name", "target_node_id"],
      },
    },
    {
      name: "allocate_nodes",
      description: "Allocate specific passive nodes in a build (modifies the build file)",
      inputSchema: {
        type: "object",
        properties: {
          build_name: {
            type: "string",
            description: "Build to modify",
          },
          node_ids: {
            type: "array",
            items: { type: "string" },
            description: "Array of node IDs to allocate",
          },
        },
        required: ["build_name", "node_ids"],
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
      description: "Create a new blank build with specified class and ascendancy",
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
      name: "lua_load_build",
      description: "Load a build file into the PoB calculation engine. Required before using other lua_* tools.",
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
      name: "lua_get_stats",
      description: "Get comprehensive calculated stats from the currently loaded build (requires lua_load_build first)",
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
        properties: {},
      },
    },
    {
      name: "lua_set_tree",
      description: "Set passive tree allocation (modifies currently loaded build)",
      inputSchema: {
        type: "object",
        properties: {
          nodes: {
            type: "array",
            items: { type: "string" },
            description: "Array of node IDs to allocate",
          },
        },
        required: ["nodes"],
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
          },
        },
        required: ["item_text", "slot_name"],
      },
    },
    {
      name: "get_equipped_items",
      description: "Get all currently equipped items",
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
      description: "Get current skill gem setup",
      inputSchema: {
        type: "object",
        properties: {},
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
          gem_index: {
            type: "number",
            description: "Gem index within group (1-based, optional)",
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
      description: "Add a gem to a socket group",
      inputSchema: {
        type: "object",
        properties: {
          group_index: {
            type: "number",
            description: "Socket group index (1-based)",
          },
          gem_name: {
            type: "string",
            description: "Name of the gem",
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
      name: "setup_skill_with_gems",
      description: "Setup a complete skill with multiple support gems in one operation",
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
  ];
}

/**
 * Get optimization tool schemas
 */
export function getOptimizationToolSchemas(): any[] {
  return [
    {
      name: "analyze_defenses",
      description: "Analyze defensive layers and provide recommendations for improving survivability",
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
      description: "Analyze skill gem setups and suggest optimal support gems",
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
