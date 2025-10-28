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

class PoBMCPServer {
  private server: Server;
  private parser: XMLParser;
  private pobDirectory: string;

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
      await this.server.close();
      process.exit(0);
    });
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
    const buildPath = path.join(this.pobDirectory, buildName);
    const content = await fs.readFile(buildPath, "utf-8");
    const parsed = this.parser.parse(content);
    return parsed.PathOfBuilding;
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

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Path of Building MCP Server running on stdio");
  }
}

// Start the server
const server = new PoBMCPServer();
server.run().catch(console.error);
