import type { PoBLuaApiClient } from "../pobLuaBridge.js";
import fs from "fs/promises";
import path from "path";

export interface LuaHandlerContext {
  pobDirectory: string;
  luaEnabled: boolean;
  getLuaClient: () => PoBLuaApiClient | null;
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
          text: `PoB Lua Bridge started successfully.\n\nThe PoB calculation engine is now ready to load builds and compute stats.`,
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

export async function handleLuaNewBuild(context: LuaHandlerContext, className?: string, ascendancy?: string) {
  try {
    await context.ensureLuaClient();

    const luaClient = context.getLuaClient();
    if (!luaClient) {
      throw new Error('Lua client not initialized');
    }

    await luaClient.newBuild(className || ascendancy ? { className, ascendancy } : undefined);

    const classDesc = className ? ` (${className}${ascendancy ? `/${ascendancy}` : ''})` : '';
    return {
      content: [
        {
          type: "text" as const,
          text: `✅ New empty build created${classDesc}.`,
        },
      ],
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to create new build: ${errorMsg}`);
  }
}

export async function handleLuaSaveBuild(context: LuaHandlerContext, buildName: string) {
  try {
    await context.ensureLuaClient();

    const luaClient = context.getLuaClient();
    if (!luaClient) {
      throw new Error('Lua client not initialized');
    }

    if (!buildName || !buildName.trim()) {
      throw new Error('build_name is required');
    }

    const fileName = buildName.endsWith('.xml') ? buildName : `${buildName}.xml`;
    const filePath = path.join(context.pobDirectory, fileName);
    const result = await luaClient.saveBuild(filePath);

    return {
      content: [
        {
          type: "text" as const,
          text: `✅ Build saved to "${fileName}" (${result?.size ?? '?'} bytes). File-based tools can now use this build.`,
        },
      ],
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to save build: ${errorMsg}`);
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

    // Check for multiple specs / item sets and inform the user
    let extra = '';
    try {
      const [specsResult, itemSetsResult] = await Promise.all([
        luaClient.listSpecs(),
        luaClient.listItemSets(),
      ]);
      if (specsResult?.specs?.length > 1) {
        extra += `\n\n📋 This build has ${specsResult.specs.length} passive tree specs:`;
        for (const s of specsResult.specs) {
          extra += `\n  ${s.active ? '▶' : ' '} [${s.index}] ${s.title} — ${s.className}/${s.ascendClassName}, ${s.nodeCount} nodes`;
        }
        extra += `\n\nUse select_spec to switch specs.`;
      }
      if (itemSetsResult?.itemSets?.length > 1) {
        extra += `\n\n🎒 This build has ${itemSetsResult.itemSets.length} item sets:`;
        for (const s of itemSetsResult.itemSets) {
          extra += `\n  ${s.active ? '▶' : ' '} [${s.id}] ${s.title}`;
        }
        extra += `\n\nUse select_item_set to switch item sets.`;
      }
    } catch {
      // Non-fatal: spec/item set info is advisory only
    }

    return {
      content: [
        {
          type: "text" as const,
          text: `✅ Build "${name || 'MCP Build'}" loaded.${extra}`,
        },
      ],
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to load build: ${errorMsg}`);
  }
}

export async function handleLuaGetStats(context: LuaHandlerContext, category?: string) {
  try {
    await context.ensureLuaClient();

    const luaClient = context.getLuaClient();
    if (!luaClient) {
      throw new Error('Lua client not initialized');
    }

    // Map category to specific fields
    let fields: string[] | undefined;
    if (category === 'offense') {
      fields = [
        'TotalDPS', 'CombinedDPS', 'TotalDot', 'TotalDotDPS', 'WithBleedDPS', 'WithIgniteDPS',
        'WithPoisonDPS', 'IgniteDPS', 'BleedDPS', 'PoisonDPS', 'AverageDamage', 'AverageBurstDamage',
        'Speed', 'HitChance', 'CritChance', 'CritMultiplier', 'PreEffectiveCritChance',
        'EffectiveCritChance', 'MainHandAccuracy', 'OffHandAccuracy', 'ManaCost', 'ManaPerSecondCost',
        'LifeCost', 'LifePerSecondCost', 'ESCost', 'ESPerSecondCost', 'RageCost',
        // Minion stats (populated for summoner builds)
        'MinionTotalDPS', 'MinionCombinedDPS', 'MinionAverageDamage', 'MinionSpeed',
        'MinionLife', 'MinionArmour', 'MinionEnergyShield',
        'MinionFireResist', 'MinionColdResist', 'MinionLightningResist', 'MinionChaosResist',
      ];
    } else if (category === 'defense') {
      fields = [
        'Life', 'LifeRegen', 'LifeRegenRecovery', 'LifeLeechGainRate', 'LifeUnreserved',
        'Mana', 'ManaRegen', 'ManaRegenRecovery', 'ManaLeechGainRate', 'ManaUnreserved',
        'EnergyShield', 'EnergyShieldRegen', 'EnergyShieldRegenRecovery', 'EnergyShieldLeechGainRate',
        'Ward', 'Armour', 'Evasion', 'EvasionChance', 'PhysicalDamageReduction',
        'BlockChance', 'SpellBlockChance', 'AttackDodgeChance', 'SpellDodgeChance',
        'FireResist', 'ColdResist', 'LightningResist', 'ChaosResist',
        'FireResistOverCap', 'ColdResistOverCap', 'LightningResistOverCap', 'ChaosResistOverCap',
        'TotalEHP', 'PhysicalMaximumHitTaken', 'FireMaximumHitTaken', 'ColdMaximumHitTaken',
        'LightningMaximumHitTaken', 'ChaosMaximumHitTaken', 'EffectiveSpellSuppressionChance'
      ];
    }
    // If category is 'all' or undefined, get all stats (fields = undefined)

    const stats = await luaClient.getStats(fields);

    let text = "=== PoB Calculated Stats ===\n\n";

    if (stats && typeof stats === 'object') {
      // Filter out zero/null/undefined values to reduce noise
      const nonZero = (v: unknown) => v != null && v !== 0 && v !== '0';
      const entries = Object.entries(stats).filter(([, v]) => nonZero(v));

      // Group by offense/defense if showing all
      if (!category || category === 'all') {
        const offenseKeys = ['DPS', 'Damage', 'Speed', 'Crit', 'Hit', 'Accuracy', 'Cost'];
        const defenseKeys = ['Life', 'Mana', 'Energy', 'Shield', 'Resist', 'Block', 'Dodge', 'Evasion', 'Armour', 'Ward', 'EHP', 'Maximum', 'Regen', 'Leech', 'Recovery'];

        // Sort offense so DPS metrics appear first, then apply cap
        const offenseAll = entries.filter(([key]) => offenseKeys.some(ok => key.includes(ok)));
        offenseAll.sort(([keyA], [keyB]) => {
          const isDpsA = keyA.includes('TotalDPS') || keyA.includes('CombinedDPS') || keyA.includes('MinionTotalDPS') ? -1 : 0;
          const isDpsB = keyB.includes('TotalDPS') || keyB.includes('CombinedDPS') || keyB.includes('MinionTotalDPS') ? -1 : 0;
          return isDpsA - isDpsB;
        });
        const offense = offenseAll.slice(0, 15);
        const defenseAll = entries.filter(([key]) => defenseKeys.some(dk => key.includes(dk)));
        const defense = defenseAll.slice(0, 15);
        const other = entries.filter(([key]) => !offenseAll.some(([ok]) => ok === key) && !defenseAll.some(([dk]) => dk === key));

        if (offense.length > 0) {
          text += "**Offense:**\n";
          for (const [key, value] of offense) {
            text += `${key}: ${value}\n`;
          }
          if (offenseAll.length > 15) {
            text += `  ... use category='offense' for full list (+${offenseAll.length - 15} more)\n`;
          }
          text += '\n';
        }

        if (defense.length > 0) {
          text += "**Defense:**\n";
          for (const [key, value] of defense) {
            text += `${key}: ${value}\n`;
          }
          if (defenseAll.length > 15) {
            text += `  ... use category='defense' for full list (+${defenseAll.length - 15} more)\n`;
          }
          text += '\n';
        }

        if (other.length > 0 && other.length < 10) {
          text += "**Other:**\n";
          for (const [key, value] of other) {
            text += `${key}: ${value}\n`;
          }
        }
      } else {
        // Just show the requested category, skip zeros
        const maxStats = 50;
        let shown = 0;
        for (const [key, value] of entries) {
          if (shown >= maxStats) break;
          text += `${key}: ${value}\n`;
          shown++;
        }

        if (entries.length > maxStats) {
          text += `\n... and ${entries.length - maxStats} more stats\n`;
        }
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

export async function handleLuaGetTree(context: LuaHandlerContext, includeNodeIds?: boolean) {
  try {
    await context.ensureLuaClient();

    const luaClient = context.getLuaClient();
    if (!luaClient) {
      throw new Error('Lua client not initialized');
    }

    const tree = await luaClient.getTree();

    let text = "=== PoB Passive Tree ===\n\n";

    if (tree && typeof tree === 'object') {
      text += `Tree Version: ${tree.treeVersion ?? 'Unknown'}\n`;
      text += `Class ID: ${tree.classId != null ? tree.classId : 'Unknown'}\n`;
      text += `Ascendancy ID: ${tree.ascendClassId != null ? tree.ascendClassId : 'Unknown'}\n`;

      if (tree.secondaryAscendClassId) {
        text += `Secondary Ascendancy ID: ${tree.secondaryAscendClassId}\n`;
      }

      if (tree.nodes && Array.isArray(tree.nodes)) {
        text += `\nAllocated Nodes: ${tree.nodes.length} nodes\n`;
        if (includeNodeIds) {
          text += `Node IDs: ${tree.nodes.join(', ')}\n`;
        } else {
          text += `Node IDs: [omitted — use include_node_ids=true to see full list]\n`;
        }
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

    if (!Array.isArray(args.nodes)) {
      throw new Error('nodes must be an array');
    }

    // If classId/ascendClassId not provided, read them from current build to preserve class
    let classId = args.classId;
    let ascendClassId = args.ascendClassId;
    let secondaryAscendClassId = args.secondaryAscendClassId;
    let treeVersion = args.treeVersion;

    if (classId === undefined || ascendClassId === undefined) {
      const currentTree = await luaClient.getTree();
      classId = classId ?? (currentTree?.classId || 0);
      ascendClassId = ascendClassId ?? (currentTree?.ascendClassId || 0);
      secondaryAscendClassId = secondaryAscendClassId ?? (currentTree?.secondaryAscendClassId || 0);
      treeVersion = treeVersion ?? currentTree?.treeVersion;
    }

    const tree = await luaClient.setTree({
      classId,
      ascendClassId,
      secondaryAscendClassId,
      nodes: args.nodes,
      masteryEffects: args.masteryEffects,
      treeVersion,
    });

    const actualCount = (tree && Array.isArray(tree.nodes)) ? tree.nodes.length : args.nodes.length;
    const requested = args.nodes.length;
    const dropped = requested - actualCount;
    let text = `✅ Passive tree updated. Allocated ${actualCount} nodes.`;
    if (dropped > 0) {
      text += `\n⚠️  ${dropped} of ${requested} requested nodes were dropped (not connected to start or invalid IDs).`;
      text += `\nTip: Ensure the class is set correctly and nodes form a valid connected path from the starting node.`;
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
    throw new Error(`Failed to set tree: ${errorMsg}`);
  }
}

export async function handleLuaGetBuildInfo(context: LuaHandlerContext) {
  try {
    await context.ensureLuaClient();
    const luaClient = context.getLuaClient();
    if (!luaClient) throw new Error('Lua client not initialized');

    const info = await luaClient.getBuildInfo();

    if (!info) {
      return {
        content: [{ type: "text" as const, text: "No build currently loaded. Use lua_load_build or lua_new_build first." }],
      };
    }

    let text = "=== Build Info ===\n\n";
    text += `Name: ${info.name || 'Unnamed'}\n`;
    text += `Level: ${info.level ?? 'Unknown'}\n`;
    text += `Class: ${info.className || 'Unknown'}\n`;
    text += `Ascendancy: ${info.ascendClassName || 'None'}\n`;
    text += `Tree Version: ${info.treeVersion || 'Unknown'}\n`;

    return {
      content: [{ type: "text" as const, text }],
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to get build info: ${errorMsg}`);
  }
}

export async function handleLuaReloadBuild(context: LuaHandlerContext, buildName?: string) {
  try {
    await context.ensureLuaClient();
    const luaClient = context.getLuaClient();
    if (!luaClient) throw new Error('Lua client not initialized');

    let targetName: string = buildName ?? '';

    // If no name provided, get it from the currently loaded build
    if (!targetName) {
      const info = await luaClient.getBuildInfo();
      if (!info?.name) {
        throw new Error('No build is currently loaded and no build_name was provided. Use lua_load_build first.');
      }
      targetName = String(info.name);
    }

    const fileName = targetName.endsWith('.xml') ? targetName : `${targetName}.xml`;
    const buildPath = path.join(context.pobDirectory, fileName);
    const xml = await fs.readFile(buildPath, 'utf-8');
    const name = fileName.replace(/\.xml$/i, '');
    await luaClient.loadBuildXml(xml, name);

    return {
      content: [{ type: "text" as const, text: `✅ Build "${fileName}" reloaded from disk.` }],
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to reload build: ${errorMsg}`);
  }
}

export async function handleUpdateTreeDelta(context: LuaHandlerContext, addNodes?: string[], removeNodes?: string[]) {
  try {
    await context.ensureLuaClient();
    const luaClient = context.getLuaClient();
    if (!luaClient) throw new Error('Lua client not initialized');

    if (!addNodes?.length && !removeNodes?.length) {
      throw new Error('At least one of add_nodes or remove_nodes must be provided.');
    }

    const params: { addNodes?: number[]; removeNodes?: number[] } = {};
    if (addNodes?.length)    params.addNodes    = addNodes.map(Number);
    if (removeNodes?.length) params.removeNodes = removeNodes.map(Number);

    const tree = await luaClient.updateTreeDelta(params);

    const actualCount = Array.isArray(tree?.nodes) ? tree.nodes.length : '?';
    const addedCount  = addNodes?.length ?? 0;
    const removedCount = removeNodes?.length ?? 0;

    let text = `✅ Tree delta applied.\n`;
    if (addedCount)    text += `  Added: ${addedCount} node(s)\n`;
    if (removedCount)  text += `  Removed: ${removedCount} node(s)\n`;
    text += `  Total allocated: ${actualCount} nodes\n`;

    const dropped = addedCount - (Array.isArray(tree?.nodes) ? tree.nodes.length - (actualCount as number - addedCount + removedCount) : 0);
    if (dropped > 0) {
      text += `\n⚠️  Some added nodes may have been dropped (not connected or invalid IDs).`;
    }

    return {
      content: [{ type: "text" as const, text }],
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to apply tree delta: ${errorMsg}`);
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

    if (!keyword || String(keyword).trim().length === 0) {
      throw new Error(`keyword/query cannot be empty (received: ${JSON.stringify(keyword)})`);
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

export async function handleListSpecs(context: LuaHandlerContext) {
  await context.ensureLuaClient();
  const luaClient = context.getLuaClient();
  if (!luaClient) throw new Error('Lua client not initialized');
  const result = await luaClient.listSpecs();
  if (!result?.specs?.length) {
    return { content: [{ type: "text" as const, text: "No specs found. Load a build first." }] };
  }
  let text = `=== Passive Tree Specs (${result.specs.length} total) ===\n\n`;
  for (const s of result.specs) {
    text += `${s.active ? '▶' : ' '} [${s.index}] ${s.title}\n`;
    text += `      Class: ${s.className || 'Unknown'} / ${s.ascendClassName || 'None'}\n`;
    text += `      Nodes: ${s.nodeCount}  |  Tree: ${s.treeVersion || 'Unknown'}\n`;
  }
  text += `\nActive: Spec ${result.activeSpec}. Use select_spec to switch.`;
  return { content: [{ type: "text" as const, text }] };
}

export async function handleSelectSpec(context: LuaHandlerContext, index: number) {
  await context.ensureLuaClient();
  const luaClient = context.getLuaClient();
  if (!luaClient) throw new Error('Lua client not initialized');
  const result = await luaClient.selectSpec(index);
  const active = result?.specs?.find((s: any) => s.active);
  let text = `✅ Switched to Spec ${index}`;
  if (active) text += ` — ${active.title} (${active.className}/${active.ascendClassName}, ${active.nodeCount} nodes)`;
  text += `.\n\nStats have been recalculated for this spec.`;
  return { content: [{ type: "text" as const, text }] };
}

export async function handleListItemSets(context: LuaHandlerContext) {
  await context.ensureLuaClient();
  const luaClient = context.getLuaClient();
  if (!luaClient) throw new Error('Lua client not initialized');
  const result = await luaClient.listItemSets();
  if (!result?.itemSets?.length) {
    return { content: [{ type: "text" as const, text: "No item sets found. Load a build first." }] };
  }
  let text = `=== Item Sets (${result.itemSets.length} total) ===\n\n`;
  for (const s of result.itemSets) {
    text += `${s.active ? '▶' : ' '} [${s.id}] ${s.title}`;
    if (s.useSecondWeaponSet) text += ` (swap weapon set)`;
    text += `\n`;
  }
  text += `\nActive: Item Set ${result.activeItemSetId}. Use select_item_set to switch.`;
  return { content: [{ type: "text" as const, text }] };
}

export async function handleSelectItemSet(context: LuaHandlerContext, id: number) {
  await context.ensureLuaClient();
  const luaClient = context.getLuaClient();
  if (!luaClient) throw new Error('Lua client not initialized');
  const result = await luaClient.selectItemSet(id);
  const active = result?.itemSets?.find((s: any) => s.active);
  let text = `✅ Switched to Item Set ${id}`;
  if (active) text += ` — ${active.title}`;
  text += `.\n\nStats have been recalculated for this item set.`;
  return { content: [{ type: "text" as const, text }] };
}
