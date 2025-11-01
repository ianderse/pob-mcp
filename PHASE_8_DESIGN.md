# Phase 8: Build Export & Persistence - Design Document

## Overview

Phase 8 adds the ability to export modified builds back to XML files, enabling users to save their changes made through the MCP server back to Path of Building.

## Architecture

### Core Components

1. **BuildExportService** (`src/services/buildExportService.ts`)
   - XML generation from build data
   - Tree synchronization (update tree in existing builds)
   - Snapshot management (versioning system)
   - File system operations with safety checks

2. **Export Handlers** (`src/handlers/exportHandlers.ts`)
   - `export_build`: Save entire modified build to new XML file
   - `save_tree`: Update only the passive tree in an existing build
   - `snapshot_build`: Create versioned snapshot of current build
   - `list_snapshots`: List all snapshots for a build
   - `restore_snapshot`: Restore a build from a snapshot

### Design Principles

1. **Safety First**
   - Never overwrite original files without explicit user confirmation
   - All exports go to a dedicated directory by default
   - Snapshots stored separately from main builds
   - Validation before write operations

2. **Data Integrity**
   - Preserve all build data not modified through MCP
   - Maintain XML structure and formatting
   - Validate XML before writing
   - Support for both Lua bridge modifications and manual changes

3. **Version Management**
   - Timestamp-based snapshot naming
   - Metadata tracking (what changed, when, why)
   - Easy rollback mechanism
   - Snapshot cleanup utilities

## Tool Specifications

### 1. `export_build`

**Purpose**: Create a copy/variant of an existing build file

**Parameters**:
- `build_name` (required): Source build filename
- `output_name` (required): Output filename (without .xml extension)
- `output_directory` (optional): Target directory (default: `POB_DIRECTORY/.pob-mcp/exports`)
- `overwrite` (optional): Allow overwriting existing file (default: false)
- `notes` (optional): Additional notes to append to build notes

**Returns**:
- Full path to exported file
- Confirmation message
- Brief build summary

**Use Cases**:
- Create variations of existing builds
- Duplicate a build before making major changes
- Export to a different location
- Add notes to a build copy

**Example**:
```
"Export my Deadeye build as 'Deadeye_Variant.xml'"
```

**Note**: This tool reads from existing build files only. It does NOT export from Lua bridge to avoid "message too long" errors in Claude Desktop. Use `save_tree` instead to apply Lua bridge modifications back to the source file.

### 2. `save_tree`

**Purpose**: Update only the passive tree in an existing build file

**Parameters**:
- `build_name` (required): Target build filename
- `nodes` (required): Array of node IDs to allocate
- `mastery_effects` (optional): Mastery selections
- `backup` (optional): Create backup before modifying (default: true)

**Returns**:
- Confirmation message
- Backup file path (if created)
- Summary of changes (nodes added/removed)

**Use Cases**:
- Apply tree optimizations to existing builds
- Update passive tree without touching gear/gems
- Quick tree modifications
- Test tree changes without Lua bridge

**Example**:
```
"Save these nodes to my 'Deadeye.xml' build: [1234, 5678, 9012]"
```

### 3. `snapshot_build`

**Purpose**: Create a versioned snapshot of a build

**Parameters**:
- `build_name` (required): Build to snapshot
- `description` (optional): Description of this snapshot
- `tag` (optional): User-friendly tag (e.g., "before-tree-respec", "league-start")

**Returns**:
- Snapshot ID (timestamp-based)
- Snapshot filename
- Storage location

**Snapshot Format**:
```
snapshots/
  Deadeye.xml/
    2025-01-15_143052_before-tree-respec.xml
    2025-01-15_143052_metadata.json
    2025-01-16_091234_after-optimization.xml
    2025-01-16_091234_metadata.json
```

**Metadata JSON**:
```json
{
  "timestamp": "2025-01-15T14:30:52.123Z",
  "original_build": "Deadeye.xml",
  "description": "Before tree respec",
  "tag": "before-tree-respec",
  "stats_snapshot": {
    "life": 4500,
    "dps": 2500000,
    "allocated_nodes": 95
  }
}
```

**Use Cases**:
- Save build state before major changes
- Track build progression over time
- Easy rollback if changes don't work out
- Build history management

### 4. `list_snapshots`

**Purpose**: List all snapshots for a build

**Parameters**:
- `build_name` (required): Build to list snapshots for
- `limit` (optional): Maximum number of snapshots to return
- `tag_filter` (optional): Filter by tag

**Returns**:
- Array of snapshots with metadata
- Total snapshot count
- Disk space used

**Example Output**:
```
=== Snapshots for Deadeye.xml ===

1. 2025-01-16 09:12:34 - "after-optimization" [after-optimization]
   Life: 5200 | DPS: 3,200,000 | Nodes: 92

2. 2025-01-15 14:30:52 - "Before tree respec" [before-tree-respec]
   Life: 4500 | DPS: 2,500,000 | Nodes: 95

3. 2025-01-14 18:45:12 - "league-start-version" [league-start]
   Life: 3800 | DPS: 1,200,000 | Nodes: 80

Total: 3 snapshots | Disk space: 2.4 MB
```

### 5. `restore_snapshot`

**Purpose**: Restore a build from a snapshot

**Parameters**:
- `build_name` (required): Build to restore
- `snapshot_id` (required): Snapshot ID (timestamp) or tag
- `backup_current` (optional): Create snapshot of current state before restore (default: true)

**Returns**:
- Confirmation message
- Backup snapshot ID (if created)
- Summary of restored build

**Safety**:
- Always creates backup before restoration (unless disabled)
- Shows diff between current and snapshot before confirming
- Validation of snapshot file before restoration


## Implementation Details

### XML Generation

Use `fast-xml-builder` for XML generation:

```typescript
import { XMLBuilder } from "fast-xml-parser";

const builder = new XMLBuilder({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  format: true,
  indentBy: "  ",
});

const xmlContent = builder.build({ PathOfBuilding: buildData });
```

### Tree Synchronization

When updating tree in existing build:

1. Read existing build XML
2. Parse to JSON structure
3. Update only `<Tree>` section
   - Update `nodes` attribute in `<Spec>`
   - Update `<MasteryEffect>` elements
   - Preserve `<URL>`, `<Sockets>`, and other metadata
4. Validate updated structure
5. Write back to file (or create backup)

### Snapshot Storage

Directory structure:
```
POB_DIRECTORY/
  Builds/
    Deadeye.xml          # Original build
    RF_Chieftain.xml     # Original build
  .pob-mcp/
    snapshots/
      Deadeye.xml/
        2025-01-15_143052_before-respec.xml
        2025-01-15_143052_metadata.json
      RF_Chieftain.xml/
        2025-01-14_091234_league-start.xml
        2025-01-14_091234_metadata.json
    exports/
      Deadeye_Optimized.xml
      RF_Chieftain_Budget.xml
```

### Safety Mechanisms

1. **Pre-write Validation**
   ```typescript
   async validateBeforeWrite(buildData: PoBBuild): Promise<void> {
     // Validate required fields
     if (!buildData.Build) throw new Error("Missing Build section");
     if (!buildData.Tree) throw new Error("Missing Tree section");

     // Validate tree data
     const nodes = this.parseAllocatedNodes(buildData);
     if (nodes.length === 0) throw new Error("No nodes allocated");

     // Validate XML can be generated
     const xml = this.buildToXML(buildData);
     if (!xml) throw new Error("Failed to generate valid XML");
   }
   ```

2. **Backup Creation**
   ```typescript
   async createBackup(buildName: string): Promise<string> {
     const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
     const backupName = `${buildName}_backup_${timestamp}.xml`;
     // Copy original to backup location
     return backupPath;
   }
   ```

3. **Overwrite Protection**
   ```typescript
   async safeWrite(filePath: string, content: string, overwrite: boolean = false): Promise<void> {
     if (!overwrite && await fs.access(filePath).then(() => true).catch(() => false)) {
       throw new Error(`File ${filePath} already exists. Set overwrite=true to replace.`);
     }
     await fs.writeFile(filePath, content, 'utf-8');
   }
   ```

## Integration with Existing Tools

### Tree Optimizer Integration

The most common workflow for applying tree optimizations:

```
User: "Start Lua bridge and load my Deadeye build"
Assistant: [Starts bridge and loads build]

User: "Suggest nodes to maximize my life"
Assistant: [Uses suggest_optimal_nodes, returns top recommendations with node IDs]

User: "Allocate those nodes"
Assistant: [Uses allocate_nodes via Lua bridge, shows before/after stats]

User: "Perfect! Save that tree back to my build file"
Assistant: [Uses save_tree to update the passive tree in Deadeye.xml]
```

### Snapshot Workflow

Create safety checkpoints before major changes:

```
User: "Create a snapshot of my build before I respec"
Assistant: [Uses snapshot_build with tag "before-respec"]

User: [Makes various changes through Lua bridge...]

User: "Actually, I don't like these changes. Restore my snapshot"
Assistant: [Uses restore_snapshot to rollback]
```

### Export Workflow

Create build variations:

```
User: "I want to try a different approach with this build"
Assistant: "I can help you create a variation"

User: "Export my Deadeye build as 'Deadeye_Life_Variant'"
Assistant: [Uses export_build to create a copy]

User: "Now optimize that variant's tree for maximum life"
Assistant: [Loads variant, optimizes, uses save_tree to update it]
```

## Error Handling

1. **File System Errors**
   - Permission denied: Suggest POB_DIRECTORY permissions
   - Disk full: Cleanup snapshots suggestion
   - Path not found: Create directory or fail gracefully

2. **XML Validation Errors**
   - Invalid structure: Detailed error with section name
   - Missing required fields: List missing fields
   - Malformed data: Point to problematic section

3. **Snapshot Errors**
   - Snapshot not found: List available snapshots
   - Corrupt snapshot: Skip and suggest manual recovery
   - Version mismatch: Warn user about compatibility

## Performance Considerations

1. **Snapshot Limits**
   - Default: Keep last 10 snapshots per build
   - Configurable via environment variable: `POB_MAX_SNAPSHOTS`
   - Auto-cleanup of old snapshots

2. **Export Directory Management**
   - Separate exports from main builds
   - User can specify custom export location
   - No automatic cleanup of exports (user controls)

3. **File Operations**
   - Async file I/O for all operations
   - Stream large files instead of loading into memory
   - Parallel snapshot operations where safe

## Testing Strategy

1. **Unit Tests**
   - XML generation from build data
   - Tree update logic
   - Snapshot creation and restoration
   - Validation functions

2. **Integration Tests**
   - Export build from Lua bridge
   - Save tree to existing build
   - Snapshot lifecycle (create, list, restore)
   - Error handling scenarios

3. **Manual Testing**
   - Export modified build and import in PoB GUI
   - Verify tree changes appear correctly
   - Snapshot restore maintains build integrity
   - Overwrite protection works

## Documentation Updates

1. **README.md**
   - Add Phase 8 to features list
   - Document all 6 new tools
   - Add export/snapshot workflow examples

2. **Tool Schemas**
   - Add detailed parameter descriptions
   - Include examples for each tool
   - Document safety features

3. **Troubleshooting**
   - Common export errors
   - Snapshot recovery procedures
   - XML validation issues

## Future Enhancements

1. **Cloud Sync** (Phase 9)
   - Sync snapshots to cloud storage
   - Share builds with community
   - Import builds from URLs

2. **Diff Viewer** (Phase 9)
   - Visual comparison between snapshots
   - Highlight changes in tree, items, skills
   - Stats comparison

3. **Auto-snapshot** (Phase 9)
   - Automatically snapshot before destructive operations
   - Configurable auto-snapshot rules
   - Retention policies
