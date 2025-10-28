# Path of Building MCP Server

An MCP (Model Context Protocol) server that enables Claude to analyze and work with Path of Building builds.

## Features

- **List Builds**: Browse all your Path of Building builds
- **Analyze Builds**: Extract detailed information from builds including stats, skills, items, and passive trees
- **Compare Builds**: Side-by-side comparison of two builds
- **Get Stats**: Quick access to build statistics

## Installation

1. Install dependencies:
```bash
cd pob-mcp-server
npm install
```

2. Build the TypeScript code:
```bash
npm run build
```

## Configuration

### Setting Your Path of Building Directory

By default, the server looks for builds in:
- Windows: `Documents/Path of Building/Builds`
- Mac/Linux: `~/Documents/Path of Building/Builds`

To use a custom directory, set the `POB_DIRECTORY` environment variable:

```bash
export POB_DIRECTORY="/path/to/your/builds"
```

### Adding to Claude Desktop

Add this to your Claude Desktop configuration file:

**Mac**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "pob": {
      "command": "node",
      "args": ["/absolute/path/to/pob-mcp-server/build/index.js"],
      "env": {
        "POB_DIRECTORY": "/path/to/your/Path of Building/Builds"
      }
    }
  }
}
```

## Usage

Once connected to Claude, you can:

1. **List your builds**:
   - "Show me all my Path of Building builds"
   - "What builds do I have?"

2. **Analyze a specific build**:
   - "Analyze my 'Lightning Arrow Deadeye.xml' build"
   - "Tell me about my Tornado Shot build"

3. **Compare builds**:
   - "Compare my 'Build A.xml' and 'Build B.xml'"
   - "What's the difference between these two builds?"

4. **Get stats**:
   - "What are the stats for my RF Chieftain build?"
   - "Show me the DPS of my Lightning Strike build"

## Available Tools

### `list_builds`
Lists all `.xml` files in your Path of Building directory.

### `analyze_build`
Provides a comprehensive summary of a build including:
- Character class and ascendancy
- Level
- Key statistics (Life, DPS, resistances, etc.)
- Active skills and support gems
- Equipped items
- Build notes

### `compare_builds`
Compares two builds side by side, highlighting differences in:
- Class and ascendancy
- Key statistics
- Gear choices

### `get_build_stats`
Quickly retrieves all statistics from a build.

## Development

### Watch mode for development:
```bash
npm run dev
```

### Testing with example build:
The repository includes an `example-build.xml` file you can use for testing. Copy it to your PoB directory or adjust the `POB_DIRECTORY` to point to the repo folder.

## Path of Building File Structure

Path of Building stores builds as XML files with this general structure:
- `<Build>`: Character info and stats
- `<Tree>`: Passive skill tree
- `<Skills>`: Active skills and gem links
- `<Items>`: Equipped items
- `<Notes>`: Build notes and instructions

## Troubleshooting

### No builds found
- Verify your `POB_DIRECTORY` path is correct
- Ensure the directory contains `.xml` files
- Check file permissions

### Parse errors
- Ensure your Path of Building is up to date
- Try opening the build in PoB to verify it's not corrupted

### Connection issues
- Restart Claude Desktop after configuration changes
- Check the Claude Desktop logs for errors
- Verify the path to `build/index.js` is absolute

## Future Enhancements

Potential features to add:
- Parse and analyze passive skill trees
- Calculate build optimization suggestions
- Export builds to different formats
- Integration with PoE Wiki for item/skill info
- Gem level/quality recommendations
- Budget vs premium build comparisons

## Contributing

Feel free to submit issues or pull requests!

## License

MIT
