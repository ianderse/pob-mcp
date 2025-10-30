# Getting Your Path of Building Files from PC

## Where to Find Your Builds on Windows

Your Path of Building builds are stored in:

```
C:\Users\<YourUsername>\Documents\Path of Building\Builds
```

Or alternatively:
```
C:\Users\<YourUsername>\AppData\Roaming\Path of Building\Builds
```

## Steps to Transfer

### Option 1: Direct Copy (Recommended)

1. **On your PC**, navigate to the builds folder
2. Copy all `.xml` files (these are your builds)
3. Transfer them to your Mac via:
   - USB drive
   - Cloud storage (Dropbox, Google Drive, OneDrive)
   - Network share
   - Email (if just a few files)

4. **On your Mac**, place them in:
   ```
   ~/Documents/Path of Building/Builds/
   ```
   
   Create the directory if it doesn't exist:
   ```bash
   mkdir -p ~/Documents/Path\ of\ Building/Builds
   ```

### Option 2: Cloud Sync (Ongoing)

Set up your Path of Building Builds folder on PC to sync with a cloud service, then sync to the same folder on Mac.

1. Move your Windows builds folder to a synced location
2. In Path of Building on PC, change the builds directory (if possible) or use symbolic links
3. On Mac, point the `POB_DIRECTORY` environment variable to your synced folder

## Configuring the MCP Server

Once you have the builds on your Mac, update the Claude Desktop configuration:

**Mac Configuration File**: `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "pob": {
      "command": "node",
      "args": ["/absolute/path/to/pob-mcp-server/build/index.js"],
      "env": {
        "POB_DIRECTORY": "/Users/yourusername/Documents/Path of Building/Builds"
      }
    }
  }
}
```

Replace `/absolute/path/to/pob-mcp-server` with the actual path where you cloned/built this project.

## Testing the Setup

1. Copy the builds to your Mac
2. Verify the files are in the correct location:
   ```bash
   ls -la ~/Documents/Path\ of\ Building/Builds/
   ```

3. Update your Claude Desktop config
4. Restart Claude Desktop
5. Try asking Claude: "List my Path of Building builds"

## File Format

Path of Building saves builds as `.xml` files. Each file contains:
- Character class and ascendancy
- Passive skill tree
- Skill gems and links
- Equipment and items
- Configuration options
- Calculated stats

The XML files are human-readable (if you open them in a text editor) but are much easier to work with through this MCP server!

## Quick Test

Once configured, try these commands in Claude:

- "Show me all my PoB builds"
- "Analyze my [BuildName].xml"
- "Compare [Build1].xml and [Build2].xml"
- "What's the DPS on my [BuildName]?"
