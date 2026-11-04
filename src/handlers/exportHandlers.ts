import type { BuildService } from "../services/buildService.js";
import { noteIgnoredError } from '../utils/errorHandling.js';
import type { BuildExportService } from "../services/buildExportService.js";
import type { BuildInfo, PoBLuaApiClient, SkillsOutput, StatsExport, TreeState } from "../pobLuaBridge.js";
import type { ExportContext } from "../utils/contextBuilder.js";
import { wrapHandler } from "../utils/errorHandling.js";

interface ExportHandlerContext {
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
  }, await buildService.readBuildXml(args.build_name));

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

  const result = await exportService.saveTree({
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
  const { exportService } = context;

  const result = await exportService.snapshotBuild({
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

  let reloadFailed = false;
  if (context.luaClient) {
    const buildPath = buildService.resolveBuildPath(args.build_name);
    if (context.luaClient.getLoadedFilePath() === buildPath) {
      try {
        await context.luaClient.loadBuildXml(result.restoredXml, args.build_name.replace(/\.xml$/i, ''), buildPath);
        message += '\n\nLive PoB build reloaded from the restored snapshot.';
      } catch (error) {
        reloadFailed = true;
        message += `\n\nThe file was restored, but the live reload FAILED: ${error instanceof Error ? error.message : String(error)}. Reload this build before using live stats.`;
      }
    } else {
      message += '\n\nThe live build has a different or unknown source and was left unchanged. Use lua_load_build to analyze the restored file.';
    }
  }

  return {
    isError: reloadFailed,
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
  let info: BuildInfo | null = null;
  let stats: StatsExport = {};
  let skills: SkillsOutput | null = null;
  let tree: TreeState | null = null;

  try { info = await luaClient.getBuildInfo(); } catch (e) { noteIgnoredError("build info for export template (fields fall back to Unknown)", e); }
  try {
    stats = await luaClient.getStats([
      'Life', 'EnergyShield', 'Mana', 'ManaUnreserved',
      'TotalDPS', 'CombinedDPS', 'MinionTotalDPS',
      'FireResist', 'ColdResist', 'LightningResist', 'ChaosResist',
      'Armour', 'Evasion', 'PhysicalDamageReduction', 'TotalEHP',
      'LifeRegen', 'SpellSuppressionChance', 'BlockChance',
    ]) ?? {};
  } catch (e) { noteIgnoredError("defensive stats for export template (rows omitted)", e); }
  try { skills = await luaClient.getSkills(); } catch (e) { noteIgnoredError("skill groups for export template (section omitted)", e); }
  try { tree = await luaClient.getTree(); } catch (e) { noteIgnoredError("tree summary for export template (class falls back to build info)", e); }

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
  const mainGroup = skills?.groups?.find(g => g.index === skills.mainSocketGroup) || skills?.groups?.[0];
  if (mainGroup) {
    const gemNames = (mainGroup.gems || []).map(g => g.name || g).filter(Boolean);
    output += `## Main Skill\n\n`;
    output += `**${mainGroup.label || 'Main'}:** ${gemNames.join(' + ')}\n\n`;
  }

  // Keystones: get_tree reports node IDs only, so names are derived from the
  // same passive-tree data the tree tools use. Fetch/parse failures degrade
  // like every other optional section here (omitted, logged) rather than
  // failing the export.
  try {
    if (tree) {
      // get_tree failing entirely means UNKNOWN, not 'no keystones' - only
      // render when the tree state was actually retrieved.
      const nodeIds = (tree.nodes ?? []).map((id) => String(id));
      let keystoneNames: string[] = [];
      if (nodeIds.length > 0) {
        const treeData = await context.treeService.getTreeData(tree.treeVersion);
        const { nodes } = await context.treeService.mapNodesToDetails(nodeIds, treeData);
        keystoneNames = nodes.filter((n) => n.isKeystone).map((n) => n.name || `Node ${n.skill}`);
      }
      output += `## Keystones\n\n${keystoneNames.length > 0 ? keystoneNames.map((k) => `- ${k}`).join('\n') : '_None allocated_'}\n\n`;
    }
  } catch (e) {
    noteIgnoredError("keystone derivation for export summary (section omitted)", e);
  }

  output += `---\n_Generated with pob-mcp-server_\n`;

  return { content: [{ type: 'text' as const, text: output }] };
  });
}
