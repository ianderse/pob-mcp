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
          text: "✅ New empty build created.",
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
          text: `✅ Build "${name || 'MCP Build'}" loaded.`,
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
      const entries = Object.entries(stats);
      const maxStats = 50; // Limit to 50 stats to prevent huge responses

      for (let i = 0; i < Math.min(entries.length, maxStats); i++) {
        const [key, value] = entries[i];
        text += `${key}: ${value}\n`;
      }

      if (entries.length > maxStats) {
        text += `\n... and ${entries.length - maxStats} more stats (use 'fields' parameter to get specific stats)\n`;
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

    let text = `✅ Passive tree updated. Allocated ${args.nodes.length} nodes.`;

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

export async function handleSearchTreeNodes(
  context: LuaHandlerContext,
  keyword: string,
  nodeType?: string,
  maxResults?: number,
  includeAllocated?: boolean
) {
  try {
    await context.ensureLuaClient();

    const luaClient = context.getLuaClient();
    if (!luaClient) {
      throw new Error('Lua client not initialized. Use lua_start first.');
    }

    if (!keyword || keyword.trim().length === 0) {
      throw new Error('keyword cannot be empty');
    }

    // Limit results to prevent large responses
    const effectiveMaxResults = Math.min(maxResults || 20, 30); // Default 20, max 30

    const results = await luaClient.searchNodes({
      keyword: keyword.trim(),
      nodeType,
      maxResults: effectiveMaxResults,
      includeAllocated,
    });

    let text = "=== Passive Tree Node Search ===\n\n";
    text += `Searching for: "${keyword}"\n`;
    if (nodeType) {
      text += `Node type filter: ${nodeType}\n`;
    }
    text += `\n`;

    if (!results.nodes || results.nodes.length === 0) {
      text += "No matching nodes found.\n\n";
      text += "Tips:\n";
      text += "- Try a shorter or more general keyword\n";
      text += "- Check spelling\n";
      text += "- Remove the node type filter to see more results\n";
    } else {
      text += `Found ${results.count} matching node${results.count === 1 ? '' : 's'}`;
      if (results.count >= effectiveMaxResults) {
        text += ` (showing top ${effectiveMaxResults})`;
      }
      text += `:\n\n`;

      for (const node of results.nodes) {
        const allocatedTag = node.allocated ? " [ALLOCATED]" : "";
        const typeTag = node.type !== 'normal' ? ` [${node.type.toUpperCase()}]` : "";

        text += `**${node.name}**${typeTag}${allocatedTag}\n`;
        text += `  Node ID: ${node.id}\n`;

        if (node.ascendancyName) {
          text += `  Ascendancy: ${node.ascendancyName}\n`;
        }

        if (node.stats && node.stats.length > 0) {
          // Limit to first 3 stats to reduce response size
          const statsToShow = node.stats.slice(0, 3);
          text += `  Stats:\n`;
          for (const stat of statsToShow) {
            text += `    - ${stat}\n`;
          }
          if (node.stats.length > 3) {
            text += `    - ... and ${node.stats.length - 3} more\n`;
          }
        }

        text += `\n`;
      }
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
    throw new Error(`Failed to search nodes: ${errorMsg}`);
  }
}
