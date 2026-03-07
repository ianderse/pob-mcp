# Path of Building MCP Server - Quick Start

🎮 **Analyze your Path of Exile builds with Claude!**

## What You've Built

An MCP server that lets Claude:
- Read and analyze your Path of Building builds
- Compare builds side-by-side
- Extract stats, skills, items, and more
- Help optimize your character builds

## Next Steps

### 1. Get Your Builds from PC → Mac

See `TRANSFER_GUIDE.md` for detailed instructions, but basically:
- Locate builds on PC: `C:\Users\<You>\Documents\Path of Building\Builds\`
- Copy all `.xml` files
- Put them on Mac: `~/Documents/Path of Building/Builds/`

Tip: If your builds are not detected, set `POB_DIRECTORY` in your Claude config to the exact folder path (the server’s default on macOS is `~/Path of Building/Builds`).

### 2. Configure Claude Desktop

Edit: `~/Library/Application Support/Claude/claude_desktop_config.json`

Use the example from `claude_desktop_config.example.json` and update:
- Path to this project's `build/index.js`
- Path to your builds directory

### 3. Restart Claude Desktop

After saving the config, completely quit and restart Claude Desktop.

### 4. Test It!

Try these prompts:
- "List my Path of Building builds"
- "Analyze my <build-name>.xml"
- "Compare <build1>.xml and <build2>.xml"
- "What's the life and DPS on my <build>?"

## Project Structure

```
pob-mcp/
├── src/
│   ├── index.ts              # Main MCP server entry point
│   ├── server/               # MCP server, tool routing, schemas
│   ├── handlers/             # Tool handler implementations
│   ├── services/             # Business logic services
│   └── types/                # TypeScript type definitions
├── tests/                    # Test suites
├── build/                    # Compiled JavaScript (after npm run build)
├── package.json              # Dependencies
├── tsconfig.json             # TypeScript config
└── README.md                 # Full documentation
```

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Watch mode for development
npm run dev
```

## How It Works

1. **MCP Protocol**: Uses the Model Context Protocol to expose tools to Claude
2. **XML Parsing**: Reads Path of Building's XML format
3. **Resources**: Exposes builds as readable resources
4. **Tools**: Provides analysis, comparison, and stat extraction tools

## Example Interactions

**You**: "Show me all my builds"
**Claude**: *calls list_builds tool* "You have 15 builds: Lightning Arrow Deadeye.xml, RF Chieftain.xml, ..."

**You**: "Analyze my Lightning Arrow build"
**Claude**: *calls analyze_build tool* "This is a Level 95 Ranger (Deadeye) with 4.2M DPS..."

**You**: "Compare my two Deadeye builds"
**Claude**: *calls compare_builds tool* "Build A has higher DPS (3.5M vs 2.8M) but Build B has better defenses..."

## Troubleshooting

- **No builds found**: Check `POB_DIRECTORY` path in config
- **Server not starting**: Verify path to `build/index.js` is absolute
- **Can't see the server**: Restart Claude Desktop completely
- **Parse errors**: Ensure builds are valid PoB XML files

## Future Ideas

- Parse passive skill tree data
- Analyze gem links and suggest alternatives
- Budget vs expensive gear comparisons
- Integration with PoE Wiki for item info
- Build optimization suggestions
- DPS calculations and breakpoints

Enjoy analyzing your builds! 🚀
