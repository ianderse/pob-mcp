import type { PoBLuaApiClient, PoBLuaTcpClient } from "../pobLuaBridge.js";
import fs from "fs/promises";
import path from "path";

export interface LuaHandlerContext {
  pobDirectory: string;
  luaEnabled: boolean;
  useTcpMode: boolean;
  getLuaClient: () => PoBLuaApiClient | PoBLuaTcpClient | null;
  ensureLuaClient: () => Promise<void>;
  stopLuaClient: () => Promise<void>;
}

export async function handleLuaStart(context: LuaHandlerContext) {
  try {
    await context.ensureLuaClient();

    return {
      content: [
        {
          type: "text" as const,
          text: context.useTcpMode
            ? `PoB Lua Bridge started successfully in TCP mode.\n\nConnected to PoB GUI at ${process.env.POB_API_TCP_HOST || '127.0.0.1'}:${process.env.POB_API_TCP_PORT || '31337'}`
            : `PoB Lua Bridge started successfully in headless mode.\n\nThe PoB calculation engine is now ready to load builds and compute stats.`,
        },
      ],
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    throw new Error(errorMsg);
  }
}

export async function handleLuaStop(context: LuaHandlerContext) {
  await context.stopLuaClient();

  return {
    content: [
      {
        type: "text" as const,
        text: "PoB Lua Bridge stopped successfully.",
      },
    ],
  };
}

export async function handleLuaNewBuild(context: LuaHandlerContext) {
  try {
    await context.ensureLuaClient();

    const luaClient = context.getLuaClient();
    if (!luaClient) {
      throw new Error('Lua client not initialized');
    }

    await luaClient.newBuild();

    return {
      content: [
        {
          type: "text" as const,
          text: "New empty build created successfully.\n\nYou can now use add_item, set_main_skill, lua_set_tree, and other tools to configure this build.",
        },
      ],
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to create new build: ${errorMsg}`);
  }
}

export async function handleLuaLoadBuild(
  context: LuaHandlerContext,
  buildName?: string,
  buildXml?: string,
  name?: string
) {
  try {
    await context.ensureLuaClient();

    const luaClient = context.getLuaClient();
    if (!luaClient) {
      throw new Error('Lua client not initialized');
    }

    // If build_name is provided, read the file
    let xml = buildXml;
    if (buildName) {
      const buildPath = path.join(context.pobDirectory, buildName);
      xml = await fs.readFile(buildPath, 'utf-8');
      // Use the build filename as the name if not specified
      if (!name) {
        name = buildName.replace(/\.xml$/i, '');
      }
    } else if (!xml) {
      throw new Error('Either build_name or build_xml must be provided');
    }

    await luaClient.loadBuildXml(xml, name);

    return {
      content: [
        {
          type: "text" as const,
          text: `Build "${name || 'MCP Build'}" loaded successfully into PoB.\n\nYou can now use lua_get_stats, lua_get_tree, and lua_set_tree to interact with this build.`,
        },
      ],
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to load build: ${errorMsg}`);
  }
}

export async function handleLuaGetStats(context: LuaHandlerContext, fields?: string[]) {
  try {
    await context.ensureLuaClient();

    const luaClient = context.getLuaClient();
    if (!luaClient) {
      throw new Error('Lua client not initialized');
    }

    const stats = await luaClient.getStats(fields);

    let text = "=== PoB Calculated Stats ===\n\n";

    if (stats && typeof stats === 'object') {
      for (const [key, value] of Object.entries(stats)) {
        text += `${key}: ${value}\n`;
      }
    } else {
      text += "No stats available.\n";
    }

    return {
      content: [
        {
          type: "text" as const,
          text,
        },
      ],
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to get stats: ${errorMsg}`);
  }
}

export async function handleLuaGetTree(context: LuaHandlerContext) {
  try {
    await context.ensureLuaClient();

    const luaClient = context.getLuaClient();
    if (!luaClient) {
      throw new Error('Lua client not initialized');
    }

    const tree = await luaClient.getTree();

    let text = "=== PoB Passive Tree ===\n\n";

    if (tree && typeof tree === 'object') {
      text += `Tree Version: ${tree.treeVersion || 'Unknown'}\n`;
      text += `Class ID: ${tree.classId || 'Unknown'}\n`;
      text += `Ascendancy ID: ${tree.ascendClassId || 'Unknown'}\n`;

      if (tree.secondaryAscendClassId) {
        text += `Secondary Ascendancy ID: ${tree.secondaryAscendClassId}\n`;
      }

      if (tree.nodes && Array.isArray(tree.nodes)) {
        text += `\nAllocated Nodes: ${tree.nodes.length} nodes\n`;
        text += `Node IDs: ${tree.nodes.slice(0, 20).join(', ')}`;
        if (tree.nodes.length > 20) {
          text += ` ... and ${tree.nodes.length - 20} more`;
        }
        text += '\n';
      }

      if (tree.masteryEffects && typeof tree.masteryEffects === 'object') {
        const effectCount = Object.keys(tree.masteryEffects).length;
        text += `\nMastery Effects: ${effectCount} selected\n`;
      }
    } else {
      text += "No tree data available.\n";
    }

    return {
      content: [
        {
          type: "text" as const,
          text,
        },
      ],
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to get tree: ${errorMsg}`);
  }
}

export async function handleLuaSetTree(context: LuaHandlerContext, args: any) {
  try {
    await context.ensureLuaClient();

    const luaClient = context.getLuaClient();
    if (!luaClient) {
      throw new Error('Lua client not initialized');
    }

    // Validate required fields
    if (typeof args.classId !== 'number') {
      throw new Error('classId must be a number');
    }
    if (typeof args.ascendClassId !== 'number') {
      throw new Error('ascendClassId must be a number');
    }
    if (!Array.isArray(args.nodes)) {
      throw new Error('nodes must be an array');
    }

    const tree = await luaClient.setTree({
      classId: args.classId,
      ascendClassId: args.ascendClassId,
      secondaryAscendClassId: args.secondaryAscendClassId,
      nodes: args.nodes,
      masteryEffects: args.masteryEffects,
      treeVersion: args.treeVersion,
    });

    let text = "=== Passive Tree Updated ===\n\n";
    text += `Successfully updated passive tree in PoB.\n`;
    text += `Allocated ${args.nodes.length} nodes.\n\n`;
    text += `Stats have been recalculated. Use lua_get_stats to see updated values.`;

    return {
      content: [
        {
          type: "text" as const,
          text,
        },
      ],
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to set tree: ${errorMsg}`);
  }
}
