#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { XMLParser } from "fast-xml-parser";
import fs from "fs/promises";
import path from "path";
import os from "os";
import chokidar from "chokidar";

// Path of Building build interface
interface PoBBuild {
  Build?: {
    level?: string;
    className?: string;
    ascendClassName?: string;
    PlayerStat?: Array<{stat: string; value: string}> | {stat: string; value: string};
  };
  Tree?: {
    Spec?: {
      title?: string;
      URL?: string;
    };
  };
  Skills?: {
    SkillSet?: {
      Skill?: Array<{
        enabled?: string;
        Gem?: Array<{name?: string; level?: string; quality?: string}>;
      }>;
    };
  };
  Items?: {
    ItemSet?: {
      Slot?: Array<{
        name?: string;
        Item?: string;
      }>;
    };
  };
  Notes?: string;
}

// Build cache entry interface
interface CachedBuild {
  data: PoBBuild;
  timestamp: number;
}

class PoBMCPServer {
  private server: Server;
  private parser: XMLParser;
  private pobDirectory: string;
  private watcher: ReturnType<typeof chokidar.watch> | null = null;
  private buildCache: Map<string, CachedBuild> = new Map();
  private recentChanges: Array<{file: string; timestamp: number; type: string}> = [];
  private watchEnabled: boolean = false;
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor() {
    this.server = new Server(
      {
        name: "pob-mcp-server",
        version: "1.0.0",
      },
      {
        capabilities: {
          resources: {},
          tools: {},
        },
      }
    );

    // Initialize XML parser
    this.parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "",
    });

    // Default Path of Building directory (can be customized)
    this.pobDirectory = process.env.POB_DIRECTORY || 
      path.join(os.homedir(), "Documents", "Path of Building", "Builds");

    this.setupHandlers();
    
    // Error handling
    this.server.onerror = (error) => {
      console.error("[MCP Error]", error);
    };
    
    process.on("SIGINT", async () => {
      await this.stopWatching();
      await this.server.close();
      process.exit(0);
    });
  }

  private startWatching() {
    if (this.watcher) {
      console.error("[File Watcher] Already watching directory");
      return;
    }

    console.error(`[File Watcher] Starting to watch: ${this.pobDirectory}`);

    this.watcher = chokidar.watch(this.pobDirectory, {
      ignored: /(^|[\/\\])\../, // ignore dotfiles
      persistent: true,
      ignoreInitial: true, // don't trigger for existing files
      awaitWriteFinish: {
        stabilityThreshold: 500, // wait for file writes to finish
        pollInterval: 100
      }
    });

    this.watcher
      .on("add", (filePath: string) => this.handleFileChange(filePath, "added"))
      .on("change", (filePath: string) => this.handleFileChange(filePath, "modified"))
      .on("unlink", (filePath: string) => this.handleFileChange(filePath, "deleted"))
      .on("error", (error: unknown) => console.error("[File Watcher] Error:", error));

    this.watchEnabled = true;
  }

  private async stopWatching() {
    if (this.watcher) {
      console.error("[File Watcher] Stopping watch");
      await this.watcher.close();
      this.watcher = null;
      this.watchEnabled = false;
    }
  }

  private handleFileChange(filePath: string, changeType: string) {
    const fileName = path.basename(filePath);

    // Only process .xml files
    if (!fileName.endsWith(".xml")) {
      return;
    }

    // Clear any existing debounce timer for this file
    const existingTimer = this.debounceTimers.get(fileName);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Set new debounce timer (500ms)
    const timer = setTimeout(() => {
      this.processFileChange(fileName, changeType);
      this.debounceTimers.delete(fileName);
    }, 500);

    this.debounceTimers.set(fileName, timer);
  }

  private processFileChange(fileName: string, changeType: string) {
    console.error(`[File Watcher] Build ${changeType}: ${fileName}`);

    // Invalidate cache for this build
    this.buildCache.delete(fileName);

    // Track recent change
    this.recentChanges.push({
      file: fileName,
      timestamp: Date.now(),
      type: changeType
    });

    // Keep only last 50 changes
    if (this.recentChanges.length > 50) {
      this.recentChanges = this.recentChanges.slice(-50);
    }
  }

  private setupHandlers() {
    // List available resources (build files)
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      try {
        const builds = await this.listBuilds();
        return {
          resources: builds.map((build) => ({
            uri: `pob://build/${encodeURIComponent(build)}`,
            name: build,
            mimeType: "application/xml",
            description: `Path of Building build: ${build}`,
          })),
        };
      } catch (error) {
        console.error("Error listing resources:", error);
        return { resources: [] };
      }
    });

    // Read a specific build file
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const uri = request.params.uri;
      const match = uri.match(/^pob:\/\/build\/(.+)$/);
      
      if (!match) {
        throw new Error(`Invalid URI: ${uri}`);
      }

      const buildName = decodeURIComponent(match[1]);
      const buildPath = path.join(this.pobDirectory, buildName);
      
      try {
        const content = await fs.readFile(buildPath, "utf-8");
        const parsed = this.parser.parse(content);
        const summary = this.generateBuildSummary(parsed.PathOfBuilding);
        
        return {
          contents: [
            {
              uri,
              mimeType: "text/plain",
              text: summary,
            },
          ],
        };
      } catch (error) {
        throw new Error(`Failed to read build: ${error}`);
      }
    });

    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: "analyze_build",
            description: "Analyze a Path of Building build file and extract detailed information",
            inputSchema: {
              type: "object",
              properties: {
                build_name: {
                  type: "string",
                  description: "Name of the build file (e.g., 'MyBuild.xml')",
                },
              },
              required: ["build_name"],
            },
          },
          {
            name: "compare_builds",
            description: "Compare two Path of Building builds side by side",
            inputSchema: {
              type: "object",
              properties: {
                build1: {
                  type: "string",
                  description: "First build file name",
                },
                build2: {
                  type: "string",
                  description: "Second build file name",
                },
              },
              required: ["build1", "build2"],
            },
          },
          {
            name: "list_builds",
            description: "List all available Path of Building builds",
            inputSchema: {
              type: "object",
              properties: {},
            },
          },
          {
            name: "get_build_stats",
            description: "Extract specific stats from a build (Life, DPS, resistances, etc.)",
            inputSchema: {
              type: "object",
              properties: {
                build_name: {
                  type: "string",
                  description: "Name of the build file",
                },
              },
              required: ["build_name"],
            },
          },
          {
            name: "start_watching",
            description: "Start monitoring the builds directory for changes. Builds will be auto-reloaded when saved in PoB.",
            inputSchema: {
              type: "object",
              properties: {},
            },
          },
          {
            name: "stop_watching",
            description: "Stop monitoring the builds directory for changes.",
            inputSchema: {
              type: "object",
              properties: {},
            },
          },
          {
            name: "get_recent_changes",
            description: "Get a list of recently changed build files.",
            inputSchema: {
              type: "object",
              properties: {
                limit: {
                  type: "number",
                  description: "Maximum number of recent changes to return (default: 10)",
                },
              },
            },
          },
          {
            name: "watch_status",
            description: "Check if file watching is currently enabled.",
            inputSchema: {
              type: "object",
              properties: {},
            },
          },
        ],
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case "list_builds":
            return await this.handleListBuilds();
          
          case "analyze_build":
            if (!args) throw new Error("Missing arguments");
            return await this.handleAnalyzeBuild(args.build_name as string);
          
          case "compare_builds":
            if (!args) throw new Error("Missing arguments");
            return await this.handleCompareBuilds(
              args.build1 as string,
              args.build2 as string
            );
          
          case "get_build_stats":
            if (!args) throw new Error("Missing arguments");
            return await this.handleGetBuildStats(args.build_name as string);

          case "start_watching":
            return this.handleStartWatching();

          case "stop_watching":
            return await this.handleStopWatching();

          case "get_recent_changes":
            return this.handleGetRecentChanges(args?.limit as number | undefined);

          case "watch_status":
            return this.handleWatchStatus();

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error: ${error}`,
            },
          ],
        };
      }
    });
  }

  private async listBuilds(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.pobDirectory);
      return files.filter((file) => file.endsWith(".xml"));
    } catch (error) {
      console.error("Could not read PoB directory:", error);
      return [];
    }
  }

  private async readBuild(buildName: string): Promise<PoBBuild> {
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

  private generateBuildSummary(build: PoBBuild): string {
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

  private async handleListBuilds() {
    const builds = await this.listBuilds();
    return {
      content: [
        {
          type: "text",
          text: builds.length > 0
            ? `Available builds:\n${builds.map((b, i) => `${i + 1}. ${b}`).join("\n")}`
            : "No builds found in the Path of Building directory.",
        },
      ],
    };
  }

  private async handleAnalyzeBuild(buildName: string) {
    const build = await this.readBuild(buildName);
    const summary = this.generateBuildSummary(build);
    
    return {
      content: [
        {
          type: "text",
          text: summary,
        },
      ],
    };
  }

  private async handleCompareBuilds(build1Name: string, build2Name: string) {
    const build1 = await this.readBuild(build1Name);
    const build2 = await this.readBuild(build2Name);
    
    let comparison = `=== Build Comparison ===\n\n`;
    comparison += `Build 1: ${build1Name}\n`;
    comparison += `Build 2: ${build2Name}\n\n`;
    
    // Compare classes
    comparison += `Class: ${build1.Build?.className} vs ${build2.Build?.className}\n`;
    comparison += `Ascendancy: ${build1.Build?.ascendClassName} vs ${build2.Build?.ascendClassName}\n\n`;
    
    // Compare key stats
    comparison += `=== Key Stats Comparison ===\n`;
    const stats1 = build1.Build?.PlayerStat;
    const stats2 = build2.Build?.PlayerStat;
    
    if (stats1 && stats2) {
      const statsArray1 = Array.isArray(stats1) ? stats1 : [stats1];
      const statsArray2 = Array.isArray(stats2) ? stats2 : [stats2];
      
      const statMap1 = new Map(statsArray1.map(s => [s.stat, s.value]));
      const statMap2 = new Map(statsArray2.map(s => [s.stat, s.value]));
      
      for (const [stat, value1] of statMap1) {
        const value2 = statMap2.get(stat);
        if (value2) {
          comparison += `${stat}: ${value1} vs ${value2}\n`;
        }
      }
    }
    
    return {
      content: [
        {
          type: "text",
          text: comparison,
        },
      ],
    };
  }

  private async handleGetBuildStats(buildName: string) {
    const build = await this.readBuild(buildName);

    let statsText = `=== Stats for ${buildName} ===\n\n`;

    if (build.Build?.PlayerStat) {
      const stats = Array.isArray(build.Build.PlayerStat)
        ? build.Build.PlayerStat
        : [build.Build.PlayerStat];

      for (const stat of stats) {
        statsText += `${stat.stat}: ${stat.value}\n`;
      }
    } else {
      statsText += "No stats found in build.\n";
    }

    return {
      content: [
        {
          type: "text",
          text: statsText,
        },
      ],
    };
  }

  private handleStartWatching() {
    if (this.watchEnabled) {
      return {
        content: [
          {
            type: "text",
            text: "File watching is already enabled.",
          },
        ],
      };
    }

    this.startWatching();

    return {
      content: [
        {
          type: "text",
          text: `File watching started for: ${this.pobDirectory}\n\nYour builds will now be automatically reloaded when saved in Path of Building.`,
        },
      ],
    };
  }

  private async handleStopWatching() {
    if (!this.watchEnabled) {
      return {
        content: [
          {
            type: "text",
            text: "File watching is not currently enabled.",
          },
        ],
      };
    }

    await this.stopWatching();

    return {
      content: [
        {
          type: "text",
          text: "File watching stopped.",
        },
      ],
    };
  }

  private handleGetRecentChanges(limit?: number) {
    const maxChanges = limit || 10;
    const changes = this.recentChanges.slice(-maxChanges).reverse();

    if (changes.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: "No recent changes detected.\n\nMake sure file watching is enabled with 'start_watching'.",
          },
        ],
      };
    }

    let text = `=== Recent Build Changes (Last ${changes.length}) ===\n\n`;

    for (const change of changes) {
      const timeAgo = this.formatTimeAgo(Date.now() - change.timestamp);
      text += `[${change.type.toUpperCase()}] ${change.file} - ${timeAgo}\n`;
    }

    return {
      content: [
        {
          type: "text",
          text,
        },
      ],
    };
  }

  private handleWatchStatus() {
    const cacheSize = this.buildCache.size;
    const changeCount = this.recentChanges.length;

    let text = `=== File Watching Status ===\n\n`;
    text += `Status: ${this.watchEnabled ? "ENABLED" : "DISABLED"}\n`;
    text += `Directory: ${this.pobDirectory}\n`;
    text += `Cached builds: ${cacheSize}\n`;
    text += `Recent changes tracked: ${changeCount}\n`;

    if (!this.watchEnabled) {
      text += `\nUse 'start_watching' to enable automatic build reloading.`;
    }

    return {
      content: [
        {
          type: "text",
          text,
        },
      ],
    };
  }

  private formatTimeAgo(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (seconds < 60) return `${seconds}s ago`;
    if (minutes < 60) return `${minutes}m ago`;
    return `${hours}h ago`;
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Path of Building MCP Server running on stdio");
  }
}

// Start the server
const server = new PoBMCPServer();
server.run().catch(console.error);
