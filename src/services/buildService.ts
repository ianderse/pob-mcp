import { XMLParser } from "fast-xml-parser";
import fs from "fs/promises";
import path from "path";
import type { PoBBuild, CachedBuild, ParsedConfiguration, ConfigInput, ConfigSet } from "../types.js";

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

  /**
   * Parse configuration state from a PoB build
   * Extracts active config set, charges, conditions, enemy settings, and multipliers
   */
  parseConfiguration(build: PoBBuild): ParsedConfiguration | null {
    if (!build.Config) {
      return null;
    }

    const activeConfigSetId = build.Config.activeConfigSet || "1";

    // Get the active ConfigSet
    let activeConfigSet: ConfigSet | undefined;
    if (Array.isArray(build.Config.ConfigSet)) {
      activeConfigSet = build.Config.ConfigSet.find(cs => cs.id === activeConfigSetId) || build.Config.ConfigSet[0];
    } else {
      activeConfigSet = build.Config.ConfigSet;
    }

    if (!activeConfigSet) {
      return null;
    }

    const activeConfigSetTitle = activeConfigSet.title || "Default";

    // Normalize inputs to array
    const inputs = activeConfigSet.Input ?
      (Array.isArray(activeConfigSet.Input) ? activeConfigSet.Input : [activeConfigSet.Input]) : [];

    const placeholders = activeConfigSet.Placeholder ?
      (Array.isArray(activeConfigSet.Placeholder) ? activeConfigSet.Placeholder : [activeConfigSet.Placeholder]) : [];

    // Combine all inputs
    const allInputsArray = [...inputs, ...placeholders];
    const allInputs = new Map<string, ConfigInput>();

    for (const input of allInputsArray) {
      allInputs.set(input.name, input);
    }

    // Parse charge usage
    const chargeUsage = {
      powerCharges: this.getBooleanInput(allInputs, 'usePowerCharges'),
      frenzyCharges: this.getBooleanInput(allInputs, 'useFrenzyCharges'),
      enduranceCharges: this.getBooleanInput(allInputs, 'useEnduranceCharges'),
    };

    // Parse conditions (all keys starting with "condition")
    const conditions: { [key: string]: boolean } = {};
    for (const [name, input] of allInputs) {
      if (name.startsWith('condition') && input.boolean !== undefined) {
        conditions[name] = this.parseBoolean(input.boolean);
      }
    }

    // Parse custom mods
    const customMods = this.getStringInput(allInputs, 'customMods');

    // Parse enemy settings
    const enemySettings: ParsedConfiguration['enemySettings'] = {
      level: this.getNumberInput(allInputs, 'enemyLevel'),
      lightningResist: this.getNumberInput(allInputs, 'enemyLightningResist'),
      coldResist: this.getNumberInput(allInputs, 'enemyColdResist'),
      fireResist: this.getNumberInput(allInputs, 'enemyFireResist'),
      chaosResist: this.getNumberInput(allInputs, 'enemyChaosResist'),
      armour: this.getNumberInput(allInputs, 'enemyArmour'),
      evasion: this.getNumberInput(allInputs, 'enemyEvasion'),
    };

    // Add all enemy-related settings
    for (const [name, input] of allInputs) {
      if (name.startsWith('enemy') && !enemySettings[name]) {
        enemySettings[name] = this.getInputValue(input);
      }
    }

    // Parse multipliers (all keys starting with "multiplier")
    const multipliers: { [key: string]: number } = {};
    for (const [name, input] of allInputs) {
      if (name.startsWith('multiplier') && input.number !== undefined) {
        const num = this.parseNumber(input.number);
        if (num !== undefined) {
          multipliers[name] = num;
        }
      }
    }

    // Parse bandit choice
    const bandit = this.getStringInput(allInputs, 'bandit') ||
                   build.Build?.bandit;

    return {
      activeConfigSetId,
      activeConfigSetTitle,
      chargeUsage,
      conditions,
      customMods,
      enemySettings,
      multipliers,
      bandit,
      allInputs,
    };
  }

  private parseBoolean(value: string | boolean | undefined): boolean {
    if (value === undefined) return false;
    if (typeof value === 'boolean') return value;
    return value === 'true';
  }

  private parseNumber(value: string | number | undefined): number | undefined {
    if (value === undefined) return undefined;
    if (typeof value === 'number') return value;
    const num = parseFloat(value);
    return isNaN(num) ? undefined : num;
  }

  private getInputValue(input: ConfigInput): any {
    if (input.boolean !== undefined) return this.parseBoolean(input.boolean);
    if (input.number !== undefined) return this.parseNumber(input.number);
    if (input.string !== undefined) return input.string;
    return undefined;
  }

  private getBooleanInput(inputs: Map<string, ConfigInput>, name: string): boolean {
    const input = inputs.get(name);
    if (!input) return false;
    return this.parseBoolean(input.boolean);
  }

  private getStringInput(inputs: Map<string, ConfigInput>, name: string): string {
    const input = inputs.get(name);
    if (!input || input.string === undefined) return '';
    return input.string;
  }

  private getNumberInput(inputs: Map<string, ConfigInput>, name: string): number | undefined {
    const input = inputs.get(name);
    if (!input) return undefined;
    return this.parseNumber(input.number);
  }

  /**
   * Format configuration for display
   */
  formatConfiguration(config: ParsedConfiguration): string {
    let output = `=== Configuration: ${config.activeConfigSetTitle} ===\n\n`;

    // Charges
    output += "=== Charges ===\n";
    output += `Power Charges: ${config.chargeUsage.powerCharges ? 'Active' : 'Inactive'}\n`;
    output += `Frenzy Charges: ${config.chargeUsage.frenzyCharges ? 'Active' : 'Inactive'}\n`;
    output += `Endurance Charges: ${config.chargeUsage.enduranceCharges ? 'Active' : 'Inactive'}\n\n`;

    // Conditions
    if (Object.keys(config.conditions).length > 0) {
      output += "=== Active Conditions ===\n";
      for (const [name, value] of Object.entries(config.conditions)) {
        if (value) {
          // Format condition name to be more readable
          const readable = name
            .replace('condition', '')
            .replace(/([A-Z])/g, ' $1')
            .trim();
          output += `✓ ${readable}\n`;
        }
      }
      output += "\n";
    }

    // Enemy Settings
    output += "=== Enemy Settings ===\n";
    if (config.enemySettings.level) output += `Level: ${config.enemySettings.level}\n`;
    if (config.enemySettings.fireResist !== undefined) output += `Fire Resist: ${config.enemySettings.fireResist}%\n`;
    if (config.enemySettings.coldResist !== undefined) output += `Cold Resist: ${config.enemySettings.coldResist}%\n`;
    if (config.enemySettings.lightningResist !== undefined) output += `Lightning Resist: ${config.enemySettings.lightningResist}%\n`;
    if (config.enemySettings.chaosResist !== undefined) output += `Chaos Resist: ${config.enemySettings.chaosResist}%\n`;
    if (config.enemySettings.armour) output += `Armour: ${config.enemySettings.armour}\n`;
    if (config.enemySettings.evasion) output += `Evasion: ${config.enemySettings.evasion}\n`;
    output += "\n";

    // Multipliers
    if (Object.keys(config.multipliers).length > 0) {
      output += "=== Multipliers ===\n";
      for (const [name, value] of Object.entries(config.multipliers)) {
        const readable = name
          .replace('multiplier', '')
          .replace(/([A-Z])/g, ' $1')
          .trim();
        output += `${readable}: ${value}\n`;
      }
      output += "\n";
    }

    // Custom Mods
    if (config.customMods) {
      output += "=== Custom Mods ===\n";
      output += config.customMods + "\n\n";
    }

    // Bandit
    if (config.bandit) {
      output += `=== Bandit Choice ===\n${config.bandit}\n\n`;
    }

    return output;
  }
}
