import { XMLBuilder } from "fast-xml-parser";
import fs from "fs/promises";
import path from "path";
import type { PoBBuild, SnapshotMetadata } from "../types.js";

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
  private xmlBuilder: XMLBuilder;

  constructor(pobDirectory: string) {
    this.pobDirectory = pobDirectory;
    this.snapshotDirectory = path.join(pobDirectory, '.pob-mcp', 'snapshots');
    this.exportDirectory = path.join(pobDirectory, '.pob-mcp', 'exports');

    this.xmlBuilder = new XMLBuilder({
      ignoreAttributes: false,
      attributeNamePrefix: "",
      format: true,
      indentBy: "  ",
      suppressEmptyNode: false,
      suppressBooleanAttributes: false,
    });
  }

  /**
   * Export a complete build to XML file
   */
  async exportBuild(buildData: PoBBuild, options: ExportOptions): Promise<{ filePath: string; message: string }> {
    // Ensure export directory exists
    const targetDir = options.outputDirectory || this.exportDirectory;
    await fs.mkdir(targetDir, { recursive: true });

    // Append notes if provided
    if (options.notes) {
      const existingNotes = buildData.Notes || "";
      const separator = existingNotes ? "\n\n---\n\n" : "";
      buildData.Notes = existingNotes + separator + options.notes;
    }

    // Validate build data before export
    await this.validateBuildData(buildData);

    // Generate XML
    const xmlContent = this.buildToXML(buildData);

    // Determine output path
    const fileName = options.outputName.endsWith('.xml')
      ? options.outputName
      : `${options.outputName}.xml`;
    const filePath = path.join(targetDir, fileName);

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
    const buildPath = path.join(this.pobDirectory, options.buildName);

    // Create backup if requested
    let backupPath: string | undefined;
    if (options.backup !== false) {
      backupPath = await this.createBackup(options.buildName);
    }

    // Read existing build
    const build = await buildService.readBuild(options.buildName);

    // Update tree nodes
    const spec = buildService.getActiveSpec(build);
    if (!spec) {
      throw new Error("No active spec found in build");
    }

    // Update nodes
    const oldNodes = spec.nodes ? spec.nodes.split(',').map((n: string) => n.trim()).filter((n: string) => n.length > 0) : [];
    spec.nodes = options.nodes.join(',');

    // Update mastery effects if provided
    if (options.masteryEffects) {
      // Remove existing mastery effects
      if (spec.MasteryEffect) {
        delete spec.MasteryEffect;
      }

      // Add new mastery effects
      const masteryEffects = Object.entries(options.masteryEffects).map(([nodeId, effectId]) => ({
        node: nodeId,
        effect: effectId.toString(),
      }));

      if (masteryEffects.length > 0) {
        spec.MasteryEffect = masteryEffects;
      }
    }

    // Generate updated XML
    const xmlContent = this.buildToXML(build);

    // Write to file
    await fs.writeFile(buildPath, xmlContent, 'utf-8');

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
    const buildSnapshotDir = path.join(this.snapshotDirectory, options.buildName);
    await fs.mkdir(buildSnapshotDir, { recursive: true });

    // Generate snapshot ID (timestamp-based)
    const timestamp = new Date();
    const snapshotId = timestamp.toISOString().replace(/[:.]/g, '-').split('.')[0];

    // Create tag-based filename
    const tag = options.tag || 'snapshot';
    const snapshotFileName = `${snapshotId}_${this.sanitizeFileName(tag)}.xml`;
    const snapshotPath = path.join(buildSnapshotDir, snapshotFileName);

    // Read and copy build
    const buildPath = path.join(this.pobDirectory, options.buildName);
    const buildContent = await fs.readFile(buildPath, 'utf-8');
    await fs.writeFile(snapshotPath, buildContent, 'utf-8');

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
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');

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
    const buildSnapshotDir = path.join(this.snapshotDirectory, buildName);

    // Check if snapshot directory exists
    try {
      await fs.access(buildSnapshotDir);
    } catch {
      return { snapshots: [], total: 0, diskSpace: 0 };
    }

    // Read all metadata files
    const entries = await fs.readdir(buildSnapshotDir, { withFileTypes: true });
    const metadataFiles = entries.filter(e => e.isFile() && e.name.endsWith('_metadata.json'));

    let snapshots: Array<{ id: string; metadata: SnapshotMetadata; filePath: string }> = [];
    let totalSize = 0;

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
  async restoreSnapshot(options: RestoreOptions): Promise<{ message: string; backupId?: string }> {
    // Find snapshot by ID or tag
    const buildSnapshotDir = path.join(this.snapshotDirectory, options.buildName);

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

    // Create backup of current build if requested
    let backupId: string | undefined;
    if (options.backupCurrent !== false) {
      const timestamp = new Date();
      backupId = timestamp.toISOString().replace(/[:.]/g, '-').split('.')[0];

      const backupPath = path.join(buildSnapshotDir, `${backupId}_before-restore.xml`);
      const buildPath = path.join(this.pobDirectory, options.buildName);
      const currentContent = await fs.readFile(buildPath, 'utf-8');
      await fs.writeFile(backupPath, currentContent, 'utf-8');
    }

    // Restore from snapshot
    const buildPath = path.join(this.pobDirectory, options.buildName);
    const snapshotContent = await fs.readFile(snapshot.filePath, 'utf-8');
    await fs.writeFile(buildPath, snapshotContent, 'utf-8');

    return {
      message: `Build restored from snapshot: ${snapshot.metadata.tag} (${snapshot.id})`,
      backupId,
    };
  }

  /**
   * Convert build data to XML string
   */
  private buildToXML(build: PoBBuild): string {
    const xmlObj = { PathOfBuilding: build };
    let xmlContent = this.xmlBuilder.build(xmlObj);

    // Add XML declaration if not present
    if (!xmlContent.startsWith('<?xml')) {
      xmlContent = '<?xml version="1.0" encoding="UTF-8"?>\n' + xmlContent;
    }

    return xmlContent;
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

    // Validate that we can generate XML
    try {
      const xml = this.buildToXML(build);
      if (!xml || xml.length === 0) {
        throw new Error("Failed to generate XML");
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`XML generation failed: ${errorMsg}`);
    }
  }

  /**
   * Safely write file with overwrite protection
   */
  private async safeWrite(filePath: string, content: string, overwrite: boolean): Promise<void> {
    if (!overwrite) {
      try {
        await fs.access(filePath);
        throw new Error(
          `File already exists: ${filePath}\n` +
          `Set overwrite=true to replace the existing file.`
        );
      } catch (error: any) {
        // File doesn't exist, safe to write
        if (error.code !== 'ENOENT') {
          throw error;
        }
      }
    }

    await fs.writeFile(filePath, content, 'utf-8');
  }

  /**
   * Create a timestamped backup of a build
   */
  private async createBackup(buildName: string): Promise<string> {
    const buildPath = path.join(this.pobDirectory, buildName);
    const buildSnapshotDir = path.join(this.snapshotDirectory, buildName);
    await fs.mkdir(buildSnapshotDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('.')[0];
    const backupFileName = `${timestamp}_backup.xml`;
    const backupPath = path.join(buildSnapshotDir, backupFileName);

    const content = await fs.readFile(buildPath, 'utf-8');
    await fs.writeFile(backupPath, content, 'utf-8');

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
