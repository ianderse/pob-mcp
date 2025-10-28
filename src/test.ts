#!/usr/bin/env node

import { XMLParser } from "fast-xml-parser";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testParsing() {
  console.log("Testing Path of Building XML parsing...\n");
  
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "",
  });
  
  const examplePath = path.join(__dirname, "..", "example-build.xml");
  
  try {
    const content = await fs.readFile(examplePath, "utf-8");
    console.log("✓ Successfully read example-build.xml\n");
    
    const parsed = parser.parse(content);
    const build = parsed.PathOfBuilding;
    
    console.log("Build Information:");
    console.log("==================");
    console.log(`Class: ${build.Build?.className}`);
    console.log(`Ascendancy: ${build.Build?.ascendClassName}`);
    console.log(`Level: ${build.Build?.level}\n`);
    
    if (build.Build?.PlayerStat) {
      console.log("Stats:");
      const stats = Array.isArray(build.Build.PlayerStat) 
        ? build.Build.PlayerStat 
        : [build.Build.PlayerStat];
      
      for (const stat of stats) {
        console.log(`  ${stat.stat}: ${stat.value}`);
      }
      console.log();
    }
    
    console.log("✓ Parsing successful!");
    console.log("\nThe MCP server should work correctly with your Path of Building files.");
    
  } catch (error) {
    console.error("✗ Error:", error);
  }
}

testParsing();
