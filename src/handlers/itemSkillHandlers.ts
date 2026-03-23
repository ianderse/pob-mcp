import type { PoBLuaApiClient } from "../pobLuaBridge.js";
import { wrapHandler } from "../utils/errorHandling.js";

export interface ItemSkillHandlerContext {
  getLuaClient: () => PoBLuaApiClient | null;
  ensureLuaClient: () => Promise<void>;
}

export async function handleAddItem(
  context: ItemSkillHandlerContext,
  itemText: string,
  slotName?: string,
  noAutoEquip?: boolean
) {
  return wrapHandler('add item', async () => {
    await context.ensureLuaClient();

    const luaClient = context.getLuaClient();
    if (!luaClient) {
      throw new Error('Lua client not initialized. Use lua_start first.');
    }

    if (!itemText || itemText.trim().length === 0) {
      throw new Error('item_text cannot be empty');
    }

    const result = await luaClient.addItem(itemText, slotName, noAutoEquip);

    const text = `✅ Item added: ${result.name || 'Unknown'} → ${result.slot || 'Not equipped'}`;

    return {
      content: [
        {
          type: "text" as const,
          text,
        },
      ],
    };
  });
}

export async function handleGetEquippedItems(context: ItemSkillHandlerContext) {
  return wrapHandler('get equipped items', async () => {
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
      const equipped = items.filter((item: any) => item.id !== 0 && item.name);
      if (equipped.length === 0) {
        text += "No items equipped.\n";
      } else {
        for (const item of equipped) {
          text += `**${item.slot}**\n`;
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
          text += "\n";
        }
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
  });
}

export async function handleToggleFlask(
  context: ItemSkillHandlerContext,
  flaskNumber: number,
  active: boolean
) {
  return wrapHandler('toggle flask', async () => {
    await context.ensureLuaClient();

    const luaClient = context.getLuaClient();
    if (!luaClient) {
      throw new Error('Lua client not initialized. Use lua_start first.');
    }

    if (flaskNumber < 1 || flaskNumber > 5) {
      throw new Error('flask_number must be between 1 and 5');
    }

    await luaClient.setFlaskActive(flaskNumber, active);

    let text = `✅ Flask ${flaskNumber} ${active ? 'activated' : 'deactivated'}.`;

    // Return updated key defensive stats so the effect is visible immediately
    try {
      const stats = await luaClient.getStats([
        'Life', 'Armour', 'Evasion', 'EnergyShield',
        'FireResist', 'ColdResist', 'LightningResist', 'ChaosResist',
        'PhysicalDamageReduction', 'ManaUnreserved',
      ]);
      const fmt = (v: any) => v != null ? String(v) : '-';
      text += `\n\nUpdated stats:\n`;
      text += `  Life: ${fmt(stats.Life)}  |  Armour: ${fmt(stats.Armour)}  |  Evasion: ${fmt(stats.Evasion)}\n`;
      text += `  Fire: ${fmt(stats.FireResist)}%  Cold: ${fmt(stats.ColdResist)}%  Lightning: ${fmt(stats.LightningResist)}%  Chaos: ${fmt(stats.ChaosResist)}%\n`;
      if (stats.PhysicalDamageReduction != null) {
        text += `  PDR: ${fmt(stats.PhysicalDamageReduction)}%\n`;
      }
    } catch {}

    return {
      content: [
        {
          type: "text" as const,
          text,
        },
      ],
    };
  });
}

export async function handleGetSkillSetup(context: ItemSkillHandlerContext, mainOnly: boolean = true) {
  return wrapHandler('get skill setup', async () => {
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
      const totalGroups = skillData.groups.length;
      const groups = mainOnly
        ? skillData.groups.filter((g: any) => g.index === skillData.mainSocketGroup)
        : skillData.groups;

      if (mainOnly && totalGroups > 1) {
        text += `(Showing main skill group only. Use main_only=false to see all ${totalGroups} groups.)\n\n`;
      }

      for (const group of groups) {
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
          text += `  Active Skills: ${group.skills.join(', ')}\n`;
        }
        if (group.gems && group.gems.length > 0) {
          text += `  Gems (${group.gems.length}):\n`;
          for (const gem of group.gems) {
            const lvlQual = `${gem.level}/${gem.quality}`;
            text += `    ${gem.index}. ${gem.name} (${lvlQual})${gem.enabled === false ? ' [disabled]' : ''}\n`;
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
  });
}

export async function handleSetMainSkill(
  context: ItemSkillHandlerContext,
  socketGroup: number,
  activeSkillIndex?: number,
  skillPart?: number
) {
  return wrapHandler('set main skill', async () => {
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

    let text = `✅ Main skill set to group ${socketGroup}`;
    if (activeSkillIndex !== undefined) {
      text += `, skill ${activeSkillIndex}`;
    }
    if (skillPart !== undefined) {
      text += `, part ${skillPart}`;
    }
    text += `.`;

    return {
      content: [
        {
          type: "text" as const,
          text,
        },
      ],
    };
  });
}

export async function handleCreateSocketGroup(
  context: ItemSkillHandlerContext,
  label?: string,
  slot?: string,
  enabled?: boolean,
  includeInFullDPS?: boolean
) {
  return wrapHandler('create socket group', async () => {
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

    let text = `✅ Socket group ${result.index} created`;
    if (label) {
      text += ` (${label})`;
    }
    text += `.`;

    return {
      content: [
        {
          type: "text" as const,
          text,
        },
      ],
    };
  });
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
  return wrapHandler('add gem', async () => {
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

    let text = `✅ Added ${result.name} (L${level || 20}, Q${quality || 0}) to group ${groupIndex}.`;

    return {
      content: [
        {
          type: "text" as const,
          text,
        },
      ],
    };
  });
}

export async function handleSetGemLevel(
  context: ItemSkillHandlerContext,
  groupIndex: number,
  gemIndex: number,
  level: number
) {
  return wrapHandler('set gem level', async () => {
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

    let text = `✅ Set gem level to ${level} (group ${groupIndex}, gem ${gemIndex}).`;

    return {
      content: [
        {
          type: "text" as const,
          text,
        },
      ],
    };
  });
}

export async function handleSetGemQuality(
  context: ItemSkillHandlerContext,
  groupIndex: number,
  gemIndex: number,
  quality: number,
  qualityId?: string
) {
  return wrapHandler('set gem quality', async () => {
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

    if (quality < 0 || quality > 30) {
      throw new Error('quality must be between 0 and 30');
    }

    await luaClient.setGemQuality({ groupIndex, gemIndex, quality, qualityId });

    let text = `✅ Set gem quality to ${quality}${qualityId && qualityId !== 'Default' ? ` (${qualityId})` : ''} (group ${groupIndex}, gem ${gemIndex}).`;

    return {
      content: [
        {
          type: "text" as const,
          text,
        },
      ],
    };
  });
}

export async function handleRemoveSkill(
  context: ItemSkillHandlerContext,
  groupIndex: number
) {
  return wrapHandler('remove skill group', async () => {
    await context.ensureLuaClient();

    const luaClient = context.getLuaClient();
    if (!luaClient) {
      throw new Error('Lua client not initialized. Use lua_start first.');
    }

    if (groupIndex < 1) {
      throw new Error('group_index must be >= 1');
    }

    await luaClient.removeSkill({ groupIndex });

    let text = `✅ Removed socket group ${groupIndex}.`;

    return {
      content: [
        {
          type: "text" as const,
          text,
        },
      ],
    };
  });
}

export async function handleRemoveGem(
  context: ItemSkillHandlerContext,
  groupIndex: number,
  gemIndex: number
) {
  return wrapHandler('remove gem', async () => {
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

    let text = `✅ Removed gem ${gemIndex} from group ${groupIndex}.`;

    return {
      content: [
        {
          type: "text" as const,
          text,
        },
      ],
    };
  });
}

export async function handleSetSocketGroupEnabled(
  context: ItemSkillHandlerContext,
  groupIndex: number,
  enabled: boolean
) {
  return wrapHandler('set socket group enabled', async () => {
    await context.ensureLuaClient();

    const luaClient = context.getLuaClient();
    if (!luaClient) {
      throw new Error('Lua client not initialized. Use lua_start first.');
    }

    if (groupIndex < 1) {
      throw new Error('group_index must be >= 1');
    }

    const result = await luaClient.setSocketGroupEnabled({ groupIndex, enabled });

    const label = result?.label ? ` (${result.label})` : '';
    const state = enabled ? 'enabled' : 'disabled';
    const text = `✅ Group ${groupIndex}${label} ${state}.`;

    return {
      content: [{ type: "text" as const, text }],
    };
  });
}

export async function handleSetGemEnabled(
  context: ItemSkillHandlerContext,
  groupIndex: number,
  gemIndex: number,
  enabled: boolean
) {
  return wrapHandler('set gem enabled', async () => {
    await context.ensureLuaClient();

    const luaClient = context.getLuaClient();
    if (!luaClient) {
      throw new Error('Lua client not initialized. Use lua_start first.');
    }

    if (groupIndex < 1) throw new Error('group_index must be >= 1');
    if (gemIndex < 1) throw new Error('gem_index must be >= 1');

    await luaClient.setGemEnabled({ groupIndex, gemIndex, enabled });

    const state = enabled ? 'enabled' : 'disabled';
    const text = `✅ Gem ${gemIndex} in group ${groupIndex} ${state}.`;

    return {
      content: [{ type: "text" as const, text }],
    };
  });
}

export async function handleSetupSkillWithGems(
  context: ItemSkillHandlerContext,
  gems: Array<{
    name: string;
    level?: number;
    quality?: number;
    quality_id?: string;
    enabled?: boolean;
  }>,
  label?: string,
  slot?: string,
  enabled?: boolean,
  includeInFullDPS?: boolean
) {
  return wrapHandler('setup skill with gems', async () => {
    await context.ensureLuaClient();

    const luaClient = context.getLuaClient();
    if (!luaClient) {
      throw new Error('Lua client not initialized. Use lua_start first.');
    }

    if (!gems || gems.length === 0) {
      throw new Error('gems array cannot be empty');
    }

    // Create socket group
    const groupResult = await luaClient.createSocketGroup({
      label,
      slot,
      enabled,
      includeInFullDPS,
    });

    // Add all gems to the group
    const addedGems: string[] = [];
    for (const gem of gems) {
      if (!gem.name || gem.name.trim().length === 0) {
        throw new Error('gem name cannot be empty');
      }

      const result = await luaClient.addGem({
        groupIndex: groupResult.index,
        gemName: gem.name,
        level: gem.level,
        quality: gem.quality,
        qualityId: gem.quality_id,
        enabled: gem.enabled,
      });

      addedGems.push(`${result.name} (L${gem.level || 20}, Q${gem.quality || 0})`);
    }

    let text = `✅ Created socket group ${groupResult.index}`;
    if (label) {
      text += ` "${label}"`;
    }
    text += ` with ${addedGems.length} gem${addedGems.length > 1 ? 's' : ''}:\n`;
    text += addedGems.map(g => `  - ${g}`).join('\n');

    return {
      content: [
        {
          type: "text" as const,
          text,
        },
      ],
    };
  });
}

export async function handleAddMultipleItems(
  context: ItemSkillHandlerContext,
  items: Array<{
    item_text: string;
    slot_name?: string;
  }>
) {
  return wrapHandler('add multiple items', async () => {
    await context.ensureLuaClient();

    const luaClient = context.getLuaClient();
    if (!luaClient) {
      throw new Error('Lua client not initialized. Use lua_start first.');
    }

    if (!items || items.length === 0) {
      throw new Error('items array cannot be empty');
    }

    const addedItems: string[] = [];
    for (const item of items) {
      if (!item.item_text || item.item_text.trim().length === 0) {
        throw new Error('item_text cannot be empty');
      }

      const result = await luaClient.addItem(item.item_text, item.slot_name);
      addedItems.push(`${result.name || 'Unknown'} → ${result.slot || 'Not equipped'}`);
    }

    let text = `✅ Added ${addedItems.length} item${addedItems.length > 1 ? 's' : ''}:\n`;
    text += addedItems.map(i => `  - ${i}`).join('\n');

    return {
      content: [
        {
          type: "text" as const,
          text,
        },
      ],
    };
  });
}
