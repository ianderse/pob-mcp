import { BuildXml } from "../utils/buildXml.js";
import { atomicWriteFile } from "../utils/atomicWrite.js";
import { randomUUID } from "crypto";
import fs from "fs/promises";
import path from "path";
import type { PoBBuild, SnapshotMetadata } from "../types.js";
import { buildFileName, resolveBuildFile, sanitizeBuildName } from "../utils/pathSanitizer.js";

export interface ExportOptions {
  outputName: string;
  outputDirectory?: string;
  overwrite?: boolean;
  notes?: string;
}

export interface SaveTreeOptions {
  buildName: string;
  nodes: string[];
  masteryEffects?: Record<string, number>;
  backup?: boolean;
}

export interface SnapshotOptions {
  buildName: string;
  description?: string;
  tag?: string;
}

export interface RestoreOptions {
  buildName: string;
  snapshotId: string;
  backupCurrent?: boolean;
}

export class BuildExportService {
  private pobDirectory: string;
  private snapshotDirectory: string;
  private exportDirectory: string;

  constructor(pobDirectory: string) {
    this.pobDirectory = pobDirectory;
    this.snapshotDirectory = path.join(pobDirectory, '.pob-mcp', 'snapshots');
    this.exportDirectory = path.join(pobDirectory, '.pob-mcp', 'exports');
  }

  /**
   * Export a complete build to XML file
   */
  async exportBuild(buildData: PoBBuild, options: ExportOptions, sourceXml: string): Promise<{ filePath: string; message: string }> {
    // Ensure export directory exists
    const targetDir = options.outputDirectory || this.exportDirectory;
    await fs.mkdir(targetDir, { recursive: true });

    await this.validateBuildData(buildData);
    const document = new BuildXml(sourceXml);
    if (options.notes) document.appendNotes(options.notes);
    const xmlContent = document.toString();

    // Determine output path (sanitized to prevent path traversal outside targetDir)
    const fileName = options.outputName.endsWith('.xml')
      ? options.outputName
      : `${options.outputName}.xml`;
    const filePath = sanitizeBuildName(fileName, targetDir);

    // Check if file exists and handle overwrite
    await this.safeWrite(filePath, xmlContent, options.overwrite || false);

    return {
      filePath,
      message: `Build exported successfully to: ${filePath}`,
    };
  }

  /**
   * Update only the passive tree in an existing build file
   */
  async saveTree(buildService: any, options: SaveTreeOptions): Promise<{ message: string; backupPath?: string }> {
    const buildPath = resolveBuildFile(options.buildName, this.pobDirectory);

    const original = await fs.readFile(buildPath, 'utf8');
    const document = new BuildXml(original);
    const oldNodes = document.setTree(options.nodes, options.masteryEffects);
    let backupPath: string | undefined;
    if (options.backup !== false) backupPath = await this.createBackup(options.buildName);
    await atomicWriteFile(buildPath, document.toString(), true);
    buildService.invalidateBuild(options.buildName);

    const nodesAdded = options.nodes.filter((n: string) => !oldNodes.includes(n)).length;
    const nodesRemoved = oldNodes.filter((n: string) => !options.nodes.includes(n)).length;

    return {
      message: `Tree updated successfully. Nodes added: ${nodesAdded}, removed: ${nodesRemoved}`,
      backupPath,
    };
  }

  /**
   * Create a versioned snapshot of a build
   */
  async snapshotBuild(
    buildService: any,
    options: SnapshotOptions
  ): Promise<{ snapshotId: string; snapshotPath: string }> {
    // Create snapshot directory for this build
    const buildSnapshotDir = sanitizeBuildName(buildFileName(options.buildName), this.snapshotDirectory);
    await fs.mkdir(buildSnapshotDir, { recursive: true });

    // Keep retries and multiple writes in the same millisecond distinct.
    const timestamp = new Date();
    const snapshotId = timestamp.toISOString().replace(/[:.]/g, '-') + '-' + randomUUID().slice(0, 8);

    // Create tag-based filename
    const tag = options.tag || 'snapshot';
    const snapshotFileName = `${snapshotId}_${this.sanitizeFileName(tag)}.xml`;
    const snapshotPath = path.join(buildSnapshotDir, snapshotFileName);

    // Read and copy build
    const buildPath = resolveBuildFile(options.buildName, this.pobDirectory);
    const buildContent = await fs.readFile(buildPath, 'utf-8');
    await atomicWriteFile(snapshotPath, buildContent, false);

    // Create metadata
    const build = await buildService.readBuild(options.buildName);
    const nodes = buildService.parseAllocatedNodes(build);

    const metadata: SnapshotMetadata = {
      timestamp: timestamp.toISOString(),
      originalBuild: options.buildName,
      description: options.description || '',
      tag,
      statsSnapshot: {
        life: this.extractStat(build, 'Life'),
        dps: this.extractStat(build, 'TotalDPS'),
        allocatedNodes: nodes.length,
      },
    };

    // Write metadata
    const metadataPath = path.join(buildSnapshotDir, `${snapshotId}_metadata.json`);
    await atomicWriteFile(metadataPath, JSON.stringify(metadata, null, 2), false);

    return {
      snapshotId,
      snapshotPath,
    };
  }

  /**
   * List all snapshots for a build
   */
  async listSnapshots(
    buildName: string,
    options: { limit?: number; tagFilter?: string } = {}
  ): Promise<{
    snapshots: Array<{ id: string; metadata: SnapshotMetadata; filePath: string }>;
    total: number;
    diskSpace: number;
  }> {
    const names = [buildFileName(buildName), buildFileName(buildName).replace(/\.xml$/i, '')];
    const directories = [...new Set(names.map(name => sanitizeBuildName(name, this.snapshotDirectory)))];
    let snapshots: Array<{ id: string; metadata: SnapshotMetadata; filePath: string }> = [];
    let totalSize = 0;

    for (const buildSnapshotDir of directories) {
      let entries;
      try { entries = await fs.readdir(buildSnapshotDir, { withFileTypes: true }); }
      catch (error: any) { if (error.code === 'ENOENT') continue; throw error; }
      const metadataFiles = entries.filter(e => e.isFile() && e.name.endsWith('_metadata.json'));
      for (const file of metadataFiles) {
        const metadataPath = path.join(buildSnapshotDir, file.name);
        const metadataContent = await fs.readFile(metadataPath, 'utf-8');
        const metadata: SnapshotMetadata = JSON.parse(metadataContent);

        // Apply tag filter if provided
        if (options.tagFilter && metadata.tag !== options.tagFilter) {
          continue;
        }

        // Extract snapshot ID from filename
        const snapshotId = file.name.replace('_metadata.json', '');
        const xmlFileName = `${snapshotId}_${this.sanitizeFileName(metadata.tag)}.xml`;
        const xmlFilePath = path.join(buildSnapshotDir, xmlFileName);

        // Get file size
        try {
          const stats = await fs.stat(xmlFilePath);
          totalSize += stats.size;
        } catch {
          // File may not exist, skip
          continue;
        }

        snapshots.push({
          id: snapshotId,
          metadata,
          filePath: xmlFilePath,
        });
      }
    }

    // Sort by timestamp (newest first)
    snapshots.sort((a, b) =>
      new Date(b.metadata.timestamp).getTime() - new Date(a.metadata.timestamp).getTime()
    );

    // Apply limit
    const total = snapshots.length;
    if (options.limit && options.limit > 0) {
      snapshots = snapshots.slice(0, options.limit);
    }

    return {
      snapshots,
      total,
      diskSpace: totalSize,
    };
  }

  /**
   * Restore a build from a snapshot
   */
  async restoreSnapshot(options: RestoreOptions): Promise<{ message: string; backupId?: string; restoredXml: string }> {
    // List snapshots and find matching one
    const { snapshots } = await this.listSnapshots(options.buildName);

    const snapshot = snapshots.find(s =>
      s.id === options.snapshotId ||
      s.metadata.tag === options.snapshotId
    );

    if (!snapshot) {
      throw new Error(
        `Snapshot not found: ${options.snapshotId}. ` +
        `Available snapshots: ${snapshots.map(s => `${s.id} [${s.metadata.tag}]`).join(', ')}`
      );
    }

    const buildSnapshotDir = path.dirname(snapshot.filePath);

    // Create backup of current build if requested
    let backupId: string | undefined;
    if (options.backupCurrent !== false) {
      const timestamp = new Date();
      backupId = timestamp.toISOString().replace(/[:.]/g, '-') + '-' + randomUUID().slice(0, 8);

      const backupPath = path.join(buildSnapshotDir, `${backupId}_before-restore.xml`);
      const buildPath = resolveBuildFile(options.buildName, this.pobDirectory);
      const currentContent = await fs.readFile(buildPath, 'utf-8');
      await atomicWriteFile(backupPath, currentContent, false);
    }

    // Restore from snapshot
    const buildPath = resolveBuildFile(options.buildName, this.pobDirectory);
    const snapshotContent = await fs.readFile(snapshot.filePath, 'utf-8');
    await atomicWriteFile(buildPath, snapshotContent, true);

    return {
      message: `Build restored from snapshot: ${snapshot.metadata.tag} (${snapshot.id})`,
      backupId,
      restoredXml: snapshotContent,
    };
  }

  /**
   * Validate build data before export
   */
  private async validateBuildData(build: PoBBuild): Promise<void> {
    if (!build.Build) {
      throw new Error("Invalid build: Missing Build section");
    }

    if (!build.Tree) {
      throw new Error("Invalid build: Missing Tree section");
    }
  }

  /**
   * Safely write file with overwrite protection
   */
  private async safeWrite(filePath: string, content: string, overwrite: boolean): Promise<void> {
    try {
      await atomicWriteFile(filePath, content, overwrite);
    } catch (error: any) {
      if (error.code === 'EEXIST') throw new Error(`File already exists: ${filePath}. Set overwrite=true to replace it.`);
      throw error;
    }
  }

  /**
   * Create a timestamped backup of a build
   */
  private async createBackup(buildName: string): Promise<string> {
    const buildPath = resolveBuildFile(buildName, this.pobDirectory);
    const buildSnapshotDir = sanitizeBuildName(buildFileName(buildName), this.snapshotDirectory);
    await fs.mkdir(buildSnapshotDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-') + '-' + randomUUID().slice(0, 8);
    const backupFileName = `${timestamp}_backup.xml`;
    const backupPath = path.join(buildSnapshotDir, backupFileName);

    const content = await fs.readFile(buildPath, 'utf-8');
    await atomicWriteFile(backupPath, content, false);

    return backupPath;
  }

  /**
   * Sanitize filename by removing invalid characters
   */
  private sanitizeFileName(name: string): string {
    return name
      .replace(/[^a-zA-Z0-9-_]/g, '-')
      .replace(/-+/g, '-')
      .toLowerCase();
  }

  /**
   * Extract a stat value from build data
   */
  private extractStat(build: PoBBuild, statName: string): number {
    if (!build.Build?.PlayerStat) {
      return 0;
    }

    const stats = Array.isArray(build.Build.PlayerStat)
      ? build.Build.PlayerStat
      : [build.Build.PlayerStat];

    const stat = stats.find(s => s.stat === statName);
    return stat ? parseFloat(stat.value) : 0;
  }

  /**
   * Format snapshot list for display
   */
  formatSnapshotList(result: {
    snapshots: Array<{ id: string; metadata: SnapshotMetadata; filePath: string }>;
    total: number;
    diskSpace: number;
  }): string {
    if (result.snapshots.length === 0) {
      return "No snapshots found for this build.";
    }

    let output = `=== Snapshots (Showing ${result.snapshots.length} of ${result.total}) ===\n\n`;

    for (let i = 0; i < result.snapshots.length; i++) {
      const { id, metadata } = result.snapshots[i];
      const date = new Date(metadata.timestamp);
      const formattedDate = date.toLocaleString();

      output += `${i + 1}. ${formattedDate}`;
      if (metadata.tag) {
        output += ` [${metadata.tag}]`;
      }
      output += '\n';

      if (metadata.description) {
        output += `   Description: ${metadata.description}\n`;
      }

      if (metadata.statsSnapshot) {
        const stats = metadata.statsSnapshot;
        output += `   Stats: Life: ${stats.life?.toLocaleString() || 'N/A'} | `;
        output += `DPS: ${stats.dps?.toLocaleString() || 'N/A'} | `;
        output += `Nodes: ${stats.allocatedNodes || 'N/A'}\n`;
      }

      output += `   ID: ${id}\n\n`;
    }

    const sizeInMB = (result.diskSpace / (1024 * 1024)).toFixed(2);
    output += `Total: ${result.total} snapshots | Disk space: ${sizeInMB} MB\n`;

    return output;
  }
}
