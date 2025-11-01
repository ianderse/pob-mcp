import type { PoBLuaApiClient, PoBLuaTcpClient } from "../pobLuaBridge.js";

export interface ItemSkillHandlerContext {
  getLuaClient: () => PoBLuaApiClient | PoBLuaTcpClient | null;
  ensureLuaClient: () => Promise<void>;
}

export async function handleAddItem(
  context: ItemSkillHandlerContext,
  itemText: string,
  slotName?: string,
  noAutoEquip?: boolean
) {
  try {
    await context.ensureLuaClient();

    const luaClient = context.getLuaClient();
    if (!luaClient) {
      throw new Error('Lua client not initialized. Use lua_start first.');
    }

    if (!itemText || itemText.trim().length === 0) {
      throw new Error('item_text cannot be empty');
    }

    const result = await luaClient.addItem(itemText, slotName, noAutoEquip);

    let text = "=== Item Added ===\n\n";
    text += `Successfully added item to build.\n\n`;
    text += `Item: ${result.name || 'Unknown'}\n`;
    text += `Item ID: ${result.id}\n`;
    text += `Slot: ${result.slot || 'Not equipped'}\n\n`;
    text += `⚠️ **STOP HERE** ⚠️\n\n`;
    text += `Do NOT add more items automatically. Ask the user if they want to:\n`;
    text += `- Add another item\n`;
    text += `- View stats with lua_get_stats\n`;
    text += `- View all items with lua_get_items`;

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
    throw new Error(`Failed to add item: ${errorMsg}`);
  }
}

export async function handleGetEquippedItems(context: ItemSkillHandlerContext) {
  try {
    await context.ensureLuaClient();

    const luaClient = context.getLuaClient();
    if (!luaClient) {
      throw new Error('Lua client not initialized. Use lua_start first.');
    }

    const items = await luaClient.getItems();

    let text = "=== Equipped Items ===\n\n";

    if (!items || items.length === 0) {
      text += "No items equipped.\n";
    } else {
      for (const item of items) {
        text += `**${item.slot}**\n`;
        if (item.id === 0 || !item.name) {
          text += "  (empty)\n";
        } else {
          text += `  ${item.name}`;
          if (item.baseName && item.baseName !== item.name) {
            text += ` (${item.baseName})`;
          }
          text += `\n`;
          if (item.rarity) {
            text += `  Rarity: ${item.rarity}\n`;
          }
          if (item.active !== undefined) {
            text += `  Active: ${item.active ? 'Yes' : 'No'}\n`;
          }
        }
        text += "\n";
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
    throw new Error(`Failed to get equipped items: ${errorMsg}`);
  }
}

export async function handleToggleFlask(
  context: ItemSkillHandlerContext,
  flaskNumber: number,
  active: boolean
) {
  try {
    await context.ensureLuaClient();

    const luaClient = context.getLuaClient();
    if (!luaClient) {
      throw new Error('Lua client not initialized. Use lua_start first.');
    }

    if (flaskNumber < 1 || flaskNumber > 5) {
      throw new Error('flask_number must be between 1 and 5');
    }

    await luaClient.setFlaskActive(flaskNumber, active);

    let text = "=== Flask Status Updated ===\n\n";
    text += `Flask ${flaskNumber} is now ${active ? 'activated' : 'deactivated'}.\n\n`;
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
    throw new Error(`Failed to toggle flask: ${errorMsg}`);
  }
}

export async function handleGetSkillSetup(context: ItemSkillHandlerContext) {
  try {
    await context.ensureLuaClient();

    const luaClient = context.getLuaClient();
    if (!luaClient) {
      throw new Error('Lua client not initialized. Use lua_start first.');
    }

    const skillData = await luaClient.getSkills();

    if (!skillData || typeof skillData !== 'object') {
      throw new Error('No build loaded. Use lua_load_build or lua_new_build first.');
    }

    let text = "=== Skill Setup ===\n\n";
    text += `Main Socket Group: ${skillData.mainSocketGroup || 'None'}\n\n`;

    if (!skillData.groups || skillData.groups.length === 0) {
      text += "No skill groups found.\n";
    } else {
      for (const group of skillData.groups) {
        const isMain = group.index === skillData.mainSocketGroup;
        text += `**Group ${group.index}${isMain ? ' (MAIN)' : ''}**\n`;
        if (group.label) {
          text += `  Label: ${group.label}\n`;
        }
        if (group.slot) {
          text += `  Slot: ${group.slot}\n`;
        }
        text += `  Enabled: ${group.enabled ? 'Yes' : 'No'}\n`;
        text += `  Contributes to Full DPS: ${group.includeInFullDPS ? 'Yes' : 'No'}\n`;
        if (group.mainActiveSkill) {
          text += `  Main Active Skill Index: ${group.mainActiveSkill}\n`;
        }
        if (group.skills && group.skills.length > 0) {
          text += `  Skills: ${group.skills.join(', ')}\n`;
        }
        text += "\n";
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
    throw new Error(`Failed to get skill setup: ${errorMsg}`);
  }
}

export async function handleSetMainSkill(
  context: ItemSkillHandlerContext,
  socketGroup: number,
  activeSkillIndex?: number,
  skillPart?: number
) {
  try {
    await context.ensureLuaClient();

    const luaClient = context.getLuaClient();
    if (!luaClient) {
      throw new Error('Lua client not initialized. Use lua_start first.');
    }

    if (socketGroup < 1) {
      throw new Error('socket_group must be >= 1');
    }

    await luaClient.setMainSelection({
      mainSocketGroup: socketGroup,
      mainActiveSkill: activeSkillIndex,
      skillPart,
    });

    let text = "=== Main Skill Updated ===\n\n";
    text += `Successfully set main socket group to ${socketGroup}.\n`;
    if (activeSkillIndex !== undefined) {
      text += `Active skill index set to ${activeSkillIndex}.\n`;
    }
    if (skillPart !== undefined) {
      text += `Skill part set to ${skillPart}.\n`;
    }
    text += `\nStats have been recalculated. Use lua_get_stats to see updated values.`;

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
    throw new Error(`Failed to set main skill: ${errorMsg}`);
  }
}

export async function handleCreateSocketGroup(
  context: ItemSkillHandlerContext,
  label?: string,
  slot?: string,
  enabled?: boolean,
  includeInFullDPS?: boolean
) {
  try {
    await context.ensureLuaClient();

    const luaClient = context.getLuaClient();
    if (!luaClient) {
      throw new Error('Lua client not initialized. Use lua_start first.');
    }

    const result = await luaClient.createSocketGroup({
      label,
      slot,
      enabled,
      includeInFullDPS,
    });

    let text = "=== Socket Group Created ===\n\n";
    text += `Successfully created socket group at index ${result.index}.\n`;
    if (label) {
      text += `Label: ${label}\n`;
    }
    if (slot) {
      text += `Slot: ${slot}\n`;
    }
    text += `Enabled: ${enabled !== false ? 'Yes' : 'No'}\n`;
    text += `Contributes to Full DPS: ${includeInFullDPS === true ? 'Yes' : 'No'}\n\n`;
    text += `⚠️ **STOP HERE** ⚠️\n\n`;
    text += `Do NOT automatically add gems. Ask the user which gems they want to add to this socket group.`;

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
    throw new Error(`Failed to create socket group: ${errorMsg}`);
  }
}

export async function handleAddGem(
  context: ItemSkillHandlerContext,
  groupIndex: number,
  gemName: string,
  level?: number,
  quality?: number,
  qualityId?: string,
  enabled?: boolean
) {
  try {
    await context.ensureLuaClient();

    const luaClient = context.getLuaClient();
    if (!luaClient) {
      throw new Error('Lua client not initialized. Use lua_start first.');
    }

    if (groupIndex < 1) {
      throw new Error('group_index must be >= 1');
    }

    if (!gemName || gemName.trim().length === 0) {
      throw new Error('gem_name cannot be empty');
    }

    const result = await luaClient.addGem({
      groupIndex,
      gemName,
      level,
      quality,
      qualityId,
      enabled,
    });

    let text = "=== Gem Added ===\n\n";
    text += `Successfully added gem to socket group ${groupIndex}.\n\n`;
    text += `Gem: ${result.name}\n`;
    text += `Gem Index: ${result.gemIndex}\n`;
    text += `Level: ${level || 20}\n`;
    text += `Quality: ${quality || 0}\n`;
    if (qualityId && qualityId !== 'Default') {
      text += `Quality Type: ${qualityId}\n`;
    }
    text += `Enabled: ${enabled !== false ? 'Yes' : 'No'}\n\n`;
    text += `⚠️ **STOP HERE** ⚠️\n\n`;
    text += `Do NOT add more gems automatically. Ask the user if they want to:\n`;
    text += `- Add another gem to this socket group\n`;
    text += `- View the current setup with lua_get_skill_setup\n`;
    text += `- Check stats with lua_get_stats`;

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
    throw new Error(`Failed to add gem: ${errorMsg}`);
  }
}

export async function handleSetGemLevel(
  context: ItemSkillHandlerContext,
  groupIndex: number,
  gemIndex: number,
  level: number
) {
  try {
    await context.ensureLuaClient();

    const luaClient = context.getLuaClient();
    if (!luaClient) {
      throw new Error('Lua client not initialized. Use lua_start first.');
    }

    if (groupIndex < 1) {
      throw new Error('group_index must be >= 1');
    }

    if (gemIndex < 1) {
      throw new Error('gem_index must be >= 1');
    }

    if (level < 1 || level > 40) {
      throw new Error('level must be between 1 and 40');
    }

    await luaClient.setGemLevel({ groupIndex, gemIndex, level });

    let text = "=== Gem Level Updated ===\n\n";
    text += `Successfully set gem level to ${level}.\n`;
    text += `Socket Group: ${groupIndex}\n`;
    text += `Gem Index: ${gemIndex}\n\n`;
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
    throw new Error(`Failed to set gem level: ${errorMsg}`);
  }
}

export async function handleSetGemQuality(
  context: ItemSkillHandlerContext,
  groupIndex: number,
  gemIndex: number,
  quality: number,
  qualityId?: string
) {
  try {
    await context.ensureLuaClient();

    const luaClient = context.getLuaClient();
    if (!luaClient) {
      throw new Error('Lua client not initialized. Use lua_start first.');
    }

    if (groupIndex < 1) {
      throw new Error('group_index must be >= 1');
    }

    if (gemIndex < 1) {
      throw new Error('gem_index must be >= 1');
    }

    if (quality < 0 || quality > 23) {
      throw new Error('quality must be between 0 and 23');
    }

    await luaClient.setGemQuality({ groupIndex, gemIndex, quality, qualityId });

    let text = "=== Gem Quality Updated ===\n\n";
    text += `Successfully set gem quality to ${quality}.\n`;
    text += `Socket Group: ${groupIndex}\n`;
    text += `Gem Index: ${gemIndex}\n`;
    if (qualityId && qualityId !== 'Default') {
      text += `Quality Type: ${qualityId}\n`;
    }
    text += `\nStats have been recalculated. Use lua_get_stats to see updated values.`;

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
    throw new Error(`Failed to set gem quality: ${errorMsg}`);
  }
}

export async function handleRemoveSkill(
  context: ItemSkillHandlerContext,
  groupIndex: number
) {
  try {
    await context.ensureLuaClient();

    const luaClient = context.getLuaClient();
    if (!luaClient) {
      throw new Error('Lua client not initialized. Use lua_start first.');
    }

    if (groupIndex < 1) {
      throw new Error('group_index must be >= 1');
    }

    await luaClient.removeSkill({ groupIndex });

    let text = "=== Socket Group Removed ===\n\n";
    text += `Successfully removed socket group ${groupIndex}.\n\n`;
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
    throw new Error(`Failed to remove socket group: ${errorMsg}`);
  }
}

export async function handleRemoveGem(
  context: ItemSkillHandlerContext,
  groupIndex: number,
  gemIndex: number
) {
  try {
    await context.ensureLuaClient();

    const luaClient = context.getLuaClient();
    if (!luaClient) {
      throw new Error('Lua client not initialized. Use lua_start first.');
    }

    if (groupIndex < 1) {
      throw new Error('group_index must be >= 1');
    }

    if (gemIndex < 1) {
      throw new Error('gem_index must be >= 1');
    }

    await luaClient.removeGem({ groupIndex, gemIndex });

    let text = "=== Gem Removed ===\n\n";
    text += `Successfully removed gem from socket group ${groupIndex}.\n`;
    text += `Gem Index: ${gemIndex}\n\n`;
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
    throw new Error(`Failed to remove gem: ${errorMsg}`);
  }
}
