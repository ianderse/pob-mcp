import { XMLParser } from "fast-xml-parser";
import fs from "fs/promises";
import path from "path";
import type { PoBBuild, CachedBuild } from "../types.js";

export class BuildService {
  private parser: XMLParser;
  private pobDirectory: string;
  private buildCache: Map<string, CachedBuild> = new Map();

  constructor(pobDirectory: string) {
    this.parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "",
    });
    this.pobDirectory = pobDirectory;
  }

  async listBuilds(): Promise<string[]> {
    try {
      const builds: string[] = [];

      // Recursive function to find XML files
      const findXmlFiles = async (dir: string, relativePath: string = "") => {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          // Skip hidden files and temp files
          if (entry.name.startsWith('.') || entry.name.startsWith('~~temp~~')) {
            continue;
          }

          const fullPath = path.join(dir, entry.name);
          const relPath = relativePath ? path.join(relativePath, entry.name) : entry.name;

          if (entry.isDirectory()) {
            // Recursively search subdirectories
            await findXmlFiles(fullPath, relPath);
          } else if (entry.isFile() && entry.name.endsWith('.xml')) {
            builds.push(relPath);
          }
        }
      };

      await findXmlFiles(this.pobDirectory);
      return builds;
    } catch (error) {
      console.error("Could not read PoB directory:", error);
      return [];
    }
  }

  async readBuild(buildName: string): Promise<PoBBuild> {
    // Check cache first
    const cached = this.buildCache.get(buildName);
    if (cached) {
      console.error(`[Cache] Hit for ${buildName}`);
      return cached.data;
    }

    // Cache miss - read from file
    console.error(`[Cache] Miss for ${buildName}`);
    const buildPath = path.join(this.pobDirectory, buildName);
    const content = await fs.readFile(buildPath, "utf-8");
    const parsed = this.parser.parse(content);
    const buildData = parsed.PathOfBuilding;

    // Store in cache
    this.buildCache.set(buildName, {
      data: buildData,
      timestamp: Date.now()
    });

    return buildData;
  }

  generateBuildSummary(build: PoBBuild): string {
    let summary = "=== Path of Building Build Summary ===\n\n";

    // Basic info
    if (build.Build) {
      summary += `Class: ${build.Build.className || "Unknown"}\n`;
      summary += `Ascendancy: ${build.Build.ascendClassName || "None"}\n`;
      summary += `Level: ${build.Build.level || "Unknown"}\n\n`;

      // Stats
      if (build.Build.PlayerStat) {
        summary += "=== Stats ===\n";
        const stats = Array.isArray(build.Build.PlayerStat)
          ? build.Build.PlayerStat
          : [build.Build.PlayerStat];

        for (const stat of stats) {
          summary += `${stat.stat}: ${stat.value}\n`;
        }
        summary += "\n";
      }
    }

    // Skills
    if (build.Skills?.SkillSet?.Skill) {
      summary += "=== Skills ===\n";
      const skills = Array.isArray(build.Skills.SkillSet.Skill)
        ? build.Skills.SkillSet.Skill
        : [build.Skills.SkillSet.Skill];

      for (const skill of skills) {
        if (skill.Gem) {
          const gems = Array.isArray(skill.Gem) ? skill.Gem : [skill.Gem];
          summary += gems.map(g => `${g.name} (${g.level}/${g.quality})`).join(" - ");
          summary += "\n";
        }
      }
      summary += "\n";
    }

    // Items
    if (build.Items?.ItemSet?.Slot) {
      summary += "=== Items ===\n";
      const slots = Array.isArray(build.Items.ItemSet.Slot)
        ? build.Items.ItemSet.Slot
        : [build.Items.ItemSet.Slot];

      for (const slot of slots) {
        if (slot.Item) {
          const itemLines = slot.Item.split("\n");
          summary += `${slot.name}: ${itemLines[0]}\n`;
        }
      }
      summary += "\n";
    }

    // Notes
    if (build.Notes) {
      summary += "=== Notes ===\n";
      summary += build.Notes.trim() + "\n";
    }

    return summary;
  }

  getActiveSpec(build: PoBBuild): any {
    if (!build.Tree) {
      return null;
    }

    const specs = build.Tree.Spec;
    if (!specs) {
      return null;
    }

    // If Spec is an array (multiple specs), find the active one
    if (Array.isArray(specs)) {
      const activeSpecIndex = parseInt(build.Tree.activeSpec || "0", 10);
      // activeSpec is 1-indexed in PoB, array is 0-indexed
      return specs[activeSpecIndex] || specs[specs.length - 1];
    }

    // Single spec - return it directly
    return specs;
  }

  parseAllocatedNodes(build: PoBBuild): string[] {
    const spec = this.getActiveSpec(build);
    if (!spec?.nodes) {
      return [];
    }

    const nodesStr = spec.nodes;
    return nodesStr.split(',').map((n: string) => n.trim()).filter((n: string) => n.length > 0);
  }

  extractBuildVersion(build: PoBBuild): string {
    const spec = this.getActiveSpec(build);

    if (!spec) {
      return "Unknown";
    }

    // Try to extract from Tree URL
    if (spec.URL) {
      const urlMatch = spec.URL.match(/version=([^&]+)/);
      if (urlMatch) {
        return urlMatch[1];
      }
    }

    // Try to extract from treeVersion field
    if (spec.treeVersion) {
      return spec.treeVersion;
    }

    return "Unknown";
  }

  clearCache(): void {
    this.buildCache.clear();
  }

  invalidateBuild(buildName: string): void {
    this.buildCache.delete(buildName);
  }
}
