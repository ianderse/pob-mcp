import type { BuildService } from "../services/buildService.js";
import type { BuildExportService } from "../services/buildExportService.js";
import type { PoBLuaApiClient } from "../pobLuaBridge.js";
import type { ExportContext } from "../utils/contextBuilder.js";
import { wrapHandler } from "../utils/errorHandling.js";

export interface ExportHandlerContext {
  buildService: BuildService;
  exportService: BuildExportService;
  luaClient?: PoBLuaApiClient;
}

export async function handleExportBuild(
  context: ExportHandlerContext,
  args: {
    build_name: string;
    output_name: string;
    output_directory?: string;
    overwrite?: boolean;
    notes?: string;
  }
) {
  return wrapHandler('export build', async () => {
  const { exportService, buildService } = context;

  // Read the source build
  const buildData = await buildService.readBuild(args.build_name);

  // Export the build
  const result = await exportService.exportBuild(buildData, {
    outputName: args.output_name,
    outputDirectory: args.output_directory,
    overwrite: args.overwrite,
    notes: args.notes,
  });

  // Generate brief summary (not full build details to keep response small)
  const className = buildData.Build?.className || "Unknown";
  const ascendancy = buildData.Build?.ascendClassName || "None";
  const level = buildData.Build?.level || "Unknown";

  return {
    content: [
      {
        type: "text" as const,
        text:
          `${result.message}\n\n` +
          `Exported: ${className} (${ascendancy}) - Level ${level}\n` +
          `Source: ${args.build_name}\n` +
          `Output: ${args.output_name}`,
      },
    ],
  };
  });
}

export async function handleSaveTree(
  context: ExportHandlerContext,
  args: {
    build_name: string;
    nodes: string[];
    mastery_effects?: Record<string, number>;
    backup?: boolean;
  }
) {
  return wrapHandler('save tree', async () => {
  const { exportService, buildService } = context;

  const result = await exportService.saveTree(buildService, {
    buildName: args.build_name,
    nodes: args.nodes,
    masteryEffects: args.mastery_effects,
    backup: args.backup,
  });

  let message = result.message;
  if (result.backupPath) {
    message += `\n\nBackup created: ${result.backupPath}`;
  }

  // Invalidate cache for this build
  buildService.invalidateBuild(args.build_name);

  return {
    content: [
      {
        type: "text" as const,
        text: message,
      },
    ],
  };
  });
}

export async function handleSnapshotBuild(
  context: ExportHandlerContext,
  args: {
    build_name: string;
    description?: string;
    tag?: string;
  }
) {
  return wrapHandler('snapshot build', async () => {
  const { exportService, buildService } = context;

  const result = await exportService.snapshotBuild(buildService, {
    buildName: args.build_name,
    description: args.description,
    tag: args.tag,
  });

  return {
    content: [
      {
        type: "text" as const,
        text:
          `Snapshot created successfully!\n\n` +
          `Snapshot ID: ${result.snapshotId}\n` +
          `Tag: ${args.tag || 'snapshot'}\n` +
          `Location: ${result.snapshotPath}\n\n` +
          `You can restore this snapshot later using:\n` +
          `  restore_snapshot(build_name="${args.build_name}", snapshot_id="${result.snapshotId}")`,
      },
    ],
  };
  });
}

export async function handleListSnapshots(
  context: ExportHandlerContext,
  args: {
    build_name: string;
    limit?: number;
    tag_filter?: string;
  }
) {
  return wrapHandler('list snapshots', async () => {
  const { exportService } = context;

  const result = await exportService.listSnapshots(args.build_name, {
    limit: args.limit,
    tagFilter: args.tag_filter,
  });

  const formatted = exportService.formatSnapshotList(result);

  return {
    content: [
      {
        type: "text" as const,
        text: `=== Snapshots for ${args.build_name} ===\n\n${formatted}`,
      },
    ],
  };
  });
}

export async function handleRestoreSnapshot(
  context: ExportHandlerContext,
  args: {
    build_name: string;
    snapshot_id: string;
    backup_current?: boolean;
  }
) {
  return wrapHandler('restore snapshot', async () => {
  const { exportService, buildService } = context;

  const result = await exportService.restoreSnapshot({
    buildName: args.build_name,
    snapshotId: args.snapshot_id,
    backupCurrent: args.backup_current,
  });

  let message = result.message;
  if (result.backupId) {
    message += `\n\nCurrent build backed up with ID: ${result.backupId}`;
  }

  // Invalidate cache for this build
  buildService.invalidateBuild(args.build_name);

  return {
    content: [
      {
        type: "text" as const,
        text: message,
      },
    ],
  };
  });
}

export async function handleExportBuildSummary(context: ExportContext) {
  return wrapHandler('export build summary', async () => {
  const luaClient = context.luaClient;
  if (!luaClient) throw new Error('Lua bridge not active. Use lua_load_build first.');

  // Lua bridge only supports one request at a time — must be sequential
  let info: any = null;
  let stats: Record<string, any> = {};
  let skills: any = null;
  let tree: any = null;

  try { info = await luaClient.getBuildInfo(); } catch { /* best effort */ }
  try {
    stats = await luaClient.getStats([
      'Life', 'EnergyShield', 'Mana', 'ManaUnreserved',
      'TotalDPS', 'CombinedDPS', 'MinionTotalDPS',
      'FireResist', 'ColdResist', 'LightningResist', 'ChaosResist',
      'Armour', 'Evasion', 'PhysicalDamageReduction', 'TotalEHP',
      'LifeRegen', 'SpellSuppressionChance', 'BlockChance',
    ]) ?? {};
  } catch { /* best effort */ }
  try { skills = await luaClient.getSkills(); } catch { /* best effort */ }
  try { tree = await luaClient.getTree(); } catch { /* best effort */ }

  const classNames = ['Scion', 'Marauder', 'Ranger', 'Witch', 'Duelist', 'Templar', 'Shadow'];
  const className = (tree?.classId != null ? classNames[tree.classId] : null) || info?.className || 'Unknown';
  const buildName = info?.name || 'Unnamed Build';
  const level = info?.level || '?';
  const ascendancy = info?.ascendClassName || '';

  const dps = Number(stats.CombinedDPS || stats.TotalDPS || stats.MinionTotalDPS || 0);
  const dpsLabel = (stats.MinionTotalDPS && !stats.TotalDPS) ? 'Minion DPS' : 'DPS';

  let output = `# ${buildName}\n\n`;
  output += `**Class:** ${className}${ascendancy ? ` (${ascendancy})` : ''}  \n`;
  output += `**Level:** ${level}\n\n`;

  output += `## Key Stats\n\n`;
  output += `| Stat | Value |\n|------|-------|\n`;
  output += `| Life | ${Number(stats.Life ?? 0).toLocaleString()} |\n`;
  if (Number(stats.EnergyShield ?? 0) > 100) {
    output += `| Energy Shield | ${Number(stats.EnergyShield).toLocaleString()} |\n`;
  }
  output += `| ${dpsLabel} | ${Math.round(dps).toLocaleString()} |\n`;
  output += `| Total EHP | ${Number(stats.TotalEHP ?? 0).toLocaleString()} |\n`;
  output += `| Fire/Cold/Light Resist | ${stats.FireResist ?? '?'}% / ${stats.ColdResist ?? '?'}% / ${stats.LightningResist ?? '?'}% |\n`;
  output += `| Chaos Resist | ${stats.ChaosResist ?? '?'}% |\n`;
  if (Number(stats.Armour ?? 0) > 0) output += `| Armour | ${Number(stats.Armour).toLocaleString()} |\n`;
  if (Number(stats.Evasion ?? 0) > 0) output += `| Evasion | ${Number(stats.Evasion).toLocaleString()} |\n`;
  if (Number(stats.BlockChance ?? 0) > 0) output += `| Block | ${stats.BlockChance}% |\n`;
  if (Number(stats.SpellSuppressionChance ?? 0) > 0) output += `| Spell Suppression | ${stats.SpellSuppressionChance}% |\n`;
  output += '\n';

  // Main skill setup
  const mainGroup = skills?.groups?.find((g: any) => g.index === skills.mainSocketGroup) || skills?.groups?.[0];
  if (mainGroup) {
    const gemNames = (mainGroup.gems || []).map((g: any) => g.name || g).filter(Boolean);
    output += `## Main Skill\n\n`;
    output += `**${mainGroup.label || 'Main'}:** ${gemNames.join(' + ')}\n\n`;
  }

  // Keystone passives
  if (Array.isArray(tree?.keystones) && tree.keystones.length > 0) {
    output += `## Keystones\n\n`;
    output += tree.keystones.map((k: string) => `- ${k}`).join('\n') + '\n\n';
  }

  output += `---\n_Generated with pob-mcp-server_\n`;

  return { content: [{ type: 'text' as const, text: output }] };
  });
}
