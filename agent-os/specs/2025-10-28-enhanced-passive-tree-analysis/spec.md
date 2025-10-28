# Specification: Enhanced Passive Tree Analysis

## Goal

Enable the AI to parse, understand, and analyze Path of Building passive skill trees by extracting allocated nodes, keystones, notables, ascendancy passives, jewel sockets, and build archetypes from PoB build files, then integrating this analysis into the existing analyze_build tool to provide comprehensive build insights.

## User Stories

- As a PoE player, I want Claude to identify which keystones I've allocated so that I can understand my build's core mechanics at a glance
- As a build optimizer, I want to see my total passive points invested and pathing efficiency so that I can identify wasted points
- As a new player, I want the AI to detect my build archetype (crit vs RT, life vs ES, etc.) and confirm it with me so that I receive relevant optimization advice
- As an experienced player, I want to see which notable passives I've taken and their effects so that I can evaluate my defensive and offensive choices
- As a build planner, I want to know my jewel socket locations and which cluster jewels are equipped so that I can optimize my jewel investments
- As a league player, I want to be warned when analyzing a build from a previous league so that I know if the passive tree data might be outdated

## Core Requirements

### Phase 1: Core Parsing & Integration (Week 1)

**Passive Tree Data Extraction:**
- Parse allocated passive tree nodes from PoB build XML (Tree element with nodes attribute)
- Identify and extract keystone passives with their full descriptions
- Extract notable passives with their effects and stat bonuses
- Track jewel socket locations (both regular jewel sockets and cluster jewel sockets)
- Calculate total passive skill points invested across the tree
- Analyze ascendancy class passives as part of passive tree analysis
- Detect which cluster jewels are equipped in cluster jewel sockets

**Build Archetype Detection:**
- Automatically detect build archetypes from allocated keystones and notables
- Detect archetype indicators: Critical Strike vs Resolute Technique, Life-based vs Energy Shield, Attack vs Spell, Elemental vs Physical
- Implement user confirmation step where AI asks user to validate detected archetype
- Use confirmed archetype context for future analysis and suggestions

**Pathing Analysis:**
- Calculate total passive points spent on the tree
- Identify pathing nodes (small passives taken only to reach destinations)
- Detect potential pathing inefficiencies (long routes, redundant paths)
- Count points invested in defensive vs offensive nodes

**League/Version Detection:**
- Extract PoE version/league information from build XML metadata
- Compare detected version against current league (if determinable)
- Display detected league/version in analysis output
- Warn users when analyzing builds from previous leagues

**Data Source & Caching:**
- Investigate Path of Building GitHub repository structure to locate passive tree data files
- Parse passive tree data from PoB repository (handle JSON, Lua, or other formats found)
- Fallback to official PoE API if PoB data unavailable
- Cache passive tree data locally in-memory after first successful fetch
- Provide manual "refresh passive tree data" capability (via new MCP tool or parameter)
- Monitor PoB repository for updates and auto-refresh cache when changes detected

**Integration with analyze_build:**
- Extend existing analyze_build tool to include passive tree analysis section
- Present passive tree data alongside existing stats, skills, and gear analysis
- Maintain consistent formatting and structure with current analyze_build output
- Return unified response containing all build information in one tool call

**Error Handling:**
- Fail entire analysis if invalid or non-existent passive nodes detected in build
- Return clear error message: "Invalid passive tree data detected"
- List specific invalid node IDs in error details
- Suggest checking if build is from an outdated league
- Do NOT attempt automatic fixes or partial analysis with invalid data

### Phase 2: Optimization Suggestions (Week 2)

**Algorithmic Optimization:**
- Implement shortest path calculations between allocated nodes
- Identify inefficient pathing (longer than necessary routes)
- Calculate point efficiency metrics (stats gained per point invested)
- Recommend alternative paths that save points while maintaining same nodes

**AI-Driven Contextual Suggestions:**
- Enable AI to generate contextual optimization suggestions based on parsed tree data
- Combine algorithmic suggestions with AI reasoning about build goals
- Provide recommendations tailored to detected build archetype
- Suggest notable clusters that align with build direction

**Point Efficiency Recommendations:**
- Highlight low-value nodes that could be unallocated
- Suggest high-value notable clusters within reach
- Recommend defensive/offensive balance adjustments based on build type

### Phase 3: Advanced Features (Week 2-3)

**Tree Comparison:**
- Support passive tree comparison between two different builds
- Highlight differences in allocated nodes between builds
- Show point efficiency differences between builds
- Compare keystone and notable choices

**What-If Allocation Testing:**
- Allow users to ask "what if I allocated X node instead of Y"
- Calculate stat changes from hypothetical passive reallocations
- Preview point cost for adding new notable clusters
- Test removing inefficient pathing and reallocating points

**Build-from-Scratch Tree Planning:**
- Support planning passive tree allocation from scratch
- Recommend efficient pathing to reach desired keystones
- Suggest notable clusters based on build goals
- Provide level-by-level allocation recommendations

## Visual Design

No visual assets provided. Output will be text-based analysis integrated into analyze_build tool response.

## Reusable Components

### Existing Code to Leverage

**XML Parsing Infrastructure:**
- fast-xml-parser already configured for PoB build parsing (src/index.ts lines 81-84)
- PoBBuild interface extensible for Tree data structure (lines 18-48)
- readBuild() method with caching (lines 393-415)

**Caching System:**
- In-memory Map cache with timestamp tracking (line 61, buildCache)
- Cache invalidation on file changes (lines 166-167)
- Pattern: Map<string, CachedBuild> with {data, timestamp} structure

**MCP Tool Pattern:**
- Server setup with tool registration (lines 233-329)
- Tool handler dispatch pattern (lines 332-380)
- Response format with text content type (lines 500-507)

**File Watching System:**
- Chokidar already configured and working for build file changes
- Debouncing and stabilization logic (lines 140-180)
- Recent changes tracking (lines 162-179)

**Error Handling Pattern:**
- Try-catch with error response structure (lines 371-379)
- User-friendly error messages in text responses

### New Components Required

**Passive Tree Data Fetcher:**
- New service to fetch tree data from PoB GitHub repository
- Cannot reuse existing XML parsing (tree data likely in different format)
- Needs HTTP client for repository file fetching (consider node-fetch or native Node.js https)
- Must handle JSON, Lua, or other formats based on investigation findings

**Tree Data Cache:**
- Separate cache for passive tree data (distinct from build cache)
- Longer TTL than build cache (tree data changes infrequently)
- Manual refresh capability
- Version tracking for tree data to detect PoB updates

**Tree Node Parser:**
- Parse node IDs from build XML Tree element
- Map node IDs to node details (name, type, stats) from tree data
- Categorize nodes: keystone, notable, small passive, jewel socket, ascendancy
- Cannot reuse existing build parsing logic

**Build Archetype Detector:**
- Analyze allocated keystones to infer build type
- Rule-based detection logic for common archetypes
- New component with no existing equivalent

**Pathing Analyzer:**
- Graph traversal logic to analyze passive tree pathing
- Calculate path lengths and efficiency metrics
- Identify redundant or inefficient paths
- New algorithm implementation required

## Technical Approach

### Data Source Strategy

**Primary Source: PoB GitHub Repository**
- Target: https://github.com/PathOfBuildingCommunity/PathOfBuilding
- Investigation required to locate passive tree data files in repository structure
- Likely locations: /data, /Data, /TreeData, or Lua files in /src or /Modules
- Parse data format as found (JSON preferred, Lua tables acceptable)
- Extract node graph, node details, connections, and ascendancy data

**Fallback Source: PoE Official API**
- Investigate if official passive tree API exists
- Only use if PoB data unavailable or insufficient
- Official API may lack PoB-specific node metadata

**Data Structure Requirements:**
- Node ID to node details mapping
- Node connections/edges for pathing analysis
- Keystone/notable classification
- Stat bonuses per node
- Ascendancy node data separate from main tree
- Jewel socket node identification

### Passive Tree Data Structure

Extend PoBBuild interface with Tree structure:

```typescript
interface PassiveTreeNode {
  id: string | number;
  name: string;
  type: 'keystone' | 'notable' | 'normal' | 'jewel' | 'ascendancy';
  stats: string[];
  connections: (string | number)[];
}

interface PassiveTreeData {
  nodes: Map<string | number, PassiveTreeNode>;
  version: string;
  league?: string;
}

interface PoBBuild {
  // ... existing fields
  Tree?: {
    Spec?: {
      title?: string;
      URL?: string;
      nodes?: string; // Comma-separated node IDs
      ascendancy?: string;
    };
  };
}
```

### Parsing Implementation

**Build XML Tree Element Parsing:**
- Extract nodes attribute from Tree > Spec element
- Split comma-separated node ID string into array
- Parse ascendancy class if present
- Extract tree title and PoB URL if present

**Node Lookup and Classification:**
- Load passive tree data from cache
- Map each allocated node ID to node details from tree data
- Categorize nodes by type (keystone, notable, normal, jewel, ascendancy)
- Collect stats from all allocated nodes

**Archetype Detection Logic:**
- Scan keystones for archetype indicators:
  - Resolute Technique = Attack-based, no crit
  - Critical Strike keystones = Crit-based
  - Chaos Inoculation = Energy Shield
  - Life keystones (not CI) = Life-based
  - Elemental Overload = Elemental, no crit scaling
- Combine keystone analysis with notable patterns
- Generate archetype description for user confirmation

**Point Calculation:**
- Count total allocated nodes
- Subtract starting class passive points (varies by class)
- Calculate points available at character level
- Compare allocated vs available to detect over-allocation

**Pathing Analysis:**
- Build graph of allocated nodes using connection data
- Identify leaf nodes (keystones, notables, jewel sockets as destinations)
- Find paths from start node to each destination
- Flag long paths with many small passives as potentially inefficient

### Caching Strategy

**Passive Tree Data Cache:**
- Separate Map cache: `Map<version, PassiveTreeData>`
- Keyed by tree version/league to support multiple versions
- Persist in-memory for server lifetime
- No automatic expiration (only manual refresh)

**Cache Loading:**
- On first analyze_build call requiring tree data:
  - Check if tree data cached for build's league version
  - If not cached: fetch from PoB repository, parse, and cache
  - Return cached data for subsequent requests

**Manual Refresh:**
- New MCP tool: refresh_tree_data or parameter on analyze_build
- Clear tree data cache and force re-fetch from source
- Use case: User knows PoB updated passive tree data

**Automatic Update Detection:**
- Optional: Poll PoB repository for changes (check commit SHA)
- Or: Provide notification that tree data may be stale
- Do NOT auto-refresh during active analysis sessions (stability)

### Error Handling Approach

**Invalid Node ID Detection:**
- During node lookup, if node ID not found in tree data:
  - Collect all invalid node IDs
  - Halt analysis immediately (fail-fast principle)
  - Return error response with details

**Error Response Format:**
```typescript
{
  content: [{
    type: "text",
    text: `Error: Invalid passive tree data detected in build.

The following node IDs could not be found in the passive tree data:
- Node ID: 12345
- Node ID: 67890

This usually means:
1. The build is from an outdated league/patch
2. The build file is corrupted
3. The passive tree data needs to be refreshed

Detected build league: Sentinel (3.18)
Current tree data version: Crucible (3.21)

Please verify the build is from the current league or use a build from the active league.`
  }]
}
```

**Data Fetch Failures:**
- If tree data fetch fails from PoB repository:
  - Return clear error: "Unable to fetch passive tree data from PoB repository"
  - Include URL attempted and error details
  - Suggest manual refresh or checking network connectivity
  - Do NOT fail analyze_build for other sections (gear, stats still work)

**Graceful Degradation:**
- If tree data unavailable but build XML is valid:
  - Analyze other sections (stats, gear, skills) normally
  - Include notice: "Passive tree analysis unavailable - tree data not loaded"
  - Do NOT crash entire analyze_build tool

### League Compatibility Detection

**Metadata Extraction:**
- Check PoB build XML for version/league metadata
- Common locations: Build element attributes, Notes field
- Parse PoB URL if present (contains tree version)

**Version Comparison:**
- Compare detected build version with cached tree data version
- If mismatch: Add warning to analysis output
- Warning text: "This build was created for [League Name] league. Passive tree may have changed since then."

**Current League Detection:**
- Hardcode current league in constants (manual update per league)
- Or: Fetch current league from PoE API if available
- Or: Use tree data version as "current" by default

**Tree Data Version Assertion:**
- Confirm assumption: Passive tree data does NOT change mid-league
- Only major patches (new leagues) require tree data updates
- Minor patches may add/change specific nodes (monitor PoB repository)

### Integration with analyze_build Tool

**Extend analyze_build Response:**
- Add new section after Skills section: "=== Passive Tree ==="
- Include:
  - Character level and total points available
  - Total points allocated
  - Allocated keystones (names and brief descriptions)
  - Notable passives count and key notables
  - Jewel sockets (count and locations)
  - Cluster jewel sockets and equipped jewels
  - Detected build archetype (with confidence level)
  - Pathing efficiency summary
  - League/version information with warnings if applicable

**Example Output Structure:**
```
=== Path of Building Build Summary ===

Class: Ranger
Ascendancy: Deadeye
Level: 95

=== Stats ===
[... existing stats ...]

=== Passive Tree ===
League: Crucible (3.21)
Total Points: 121 / 121 available
Ascendancy Points: 8 / 8

Allocated Keystones:
- Point Blank: Projectile attacks deal up to 50% more damage to close targets and up to 50% less damage to far targets
- Acrobatics: 40% chance to dodge attacks, -30% to armor and ES

Key Notable Passives (15 total):
- Aspect of the Eagle: +24% projectile damage, +15% accuracy
- Disciple of the Slaughter: 10% increased attack speed, frenzy charge bonuses
- Soul of Steel: +5% physical damage reduction, Cannot be stunned if on full life
[... additional notables ...]

Jewel Sockets: 4 allocated
- 3 regular jewel sockets
- 1 cluster jewel socket (equipped: Large Cluster Jewel)

Detected Archetype: Critical Strike Bow Attack (Life-based)
Confidence: High
[Pending user confirmation]

Pathing Efficiency: Good
- Efficient path to Point Blank (3 points)
- Slightly inefficient path to Acrobatics (5 points, could save 1)
- Total pathing nodes: 28

=== Skills ===
[... existing skills ...]
```

**No New Tools Required:**
- Passive tree analysis integrated into existing analyze_build tool
- Optional: Add refresh_tree_data tool for manual cache refresh
- Optional: Add compare_trees tool for Phase 3 tree comparison

## Implementation Phases

### Phase 1: Core Parsing & Integration (Week 1)

**Milestone 1.1: Data Source Investigation (Days 1-2)**
- Research PoB GitHub repository structure
- Locate passive tree data files
- Determine data format (JSON, Lua, etc.)
- Test parsing sample tree data locally
- Document data structure and access method
- Decide on fetch strategy (raw GitHub files vs git clone)

**Milestone 1.2: Tree Data Fetcher (Days 2-3)**
- Implement tree data fetching from PoB repository
- Parse tree data into normalized TypeScript structure
- Implement tree data caching with version tracking
- Add manual refresh capability
- Test with current league tree data

**Milestone 1.3: Build Tree Parsing (Days 3-4)**
- Extend PoBBuild interface with Tree types
- Parse allocated node IDs from build XML
- Map node IDs to node details from tree data
- Categorize nodes by type (keystone, notable, etc.)
- Calculate total points invested
- Handle missing or invalid node IDs with proper errors

**Milestone 1.4: Archetype Detection (Day 4)**
- Implement keystone-based archetype detection
- Add rule-based logic for common archetypes
- Generate archetype description with confidence level
- Format for user confirmation in output

**Milestone 1.5: Pathing Analysis (Day 5)**
- Build allocated node graph from connections
- Identify pathing vs destination nodes
- Calculate basic pathing efficiency metrics
- Detect redundant or long paths

**Milestone 1.6: League Detection (Day 5)**
- Extract league/version from build metadata
- Compare with tree data version
- Generate warnings for version mismatches
- Display league info in output

**Milestone 1.7: Integration (Days 6-7)**
- Extend analyze_build handler with tree analysis
- Format tree analysis output section
- Add error handling for tree-related failures
- Ensure graceful degradation if tree data unavailable
- Test with multiple real builds
- Update tool description if needed

**Deliverables:**
- Passive tree data fetcher with caching
- Complete tree parsing from build XML
- Archetype detection with user confirmation
- Pathing efficiency analysis
- League/version detection and warnings
- Integrated into analyze_build tool
- Comprehensive error handling

### Phase 2: Optimization Suggestions (Week 2)

**Milestone 2.1: Shortest Path Algorithm (Days 8-9)**
- Implement graph shortest path algorithm (Dijkstra or BFS)
- Calculate shortest paths between start node and all destinations
- Compare actual paths vs optimal paths
- Identify points that could be saved with better pathing

**Milestone 2.2: Point Efficiency Scoring (Days 9-10)**
- Calculate stats gained per point for each allocated node
- Identify low-efficiency nodes (mostly pathing, minimal stats)
- Score overall tree efficiency
- Recommend high-value notables within reach

**Milestone 2.3: AI Contextual Suggestions (Days 10-11)**
- Structure tree data for AI reasoning
- Provide context about build archetype and goals
- Enable AI to generate optimization suggestions
- Combine algorithmic and AI-driven recommendations

**Milestone 2.4: Recommendation Formatting (Days 11-12)**
- Format optimization suggestions in analyze_build output
- Include actionable recommendations
- Prioritize suggestions by impact
- Test with various build types

**Deliverables:**
- Algorithmic optimization suggestions
- Point efficiency metrics
- AI-driven contextual recommendations
- Formatted suggestions in tool output

### Phase 3: Advanced Features (Week 2-3)

**Milestone 3.1: Tree Comparison (Days 13-15)**
- Create compare_trees tool (or extend compare_builds)
- Parse passive trees from both builds
- Calculate differences in allocations
- Highlight unique keystones and notables per build
- Compare point efficiency between builds
- Format side-by-side comparison output

**Milestone 3.2: What-If Testing (Days 15-17)**
- Design syntax for what-if queries (natural language or structured)
- Parse hypothetical allocation changes from user query
- Calculate stat impacts of changes
- Estimate point costs for adding new nodes
- Display before/after stat comparison

**Milestone 3.3: Build Planning (Days 17-19)**
- Support tree planning from scratch or partial tree
- Recommend efficient paths to desired keystones
- Suggest notable clusters based on build goals
- Provide leveling allocation recommendations
- Create new tool or mode in analyze_build

**Deliverables:**
- Tree comparison tool with detailed diff analysis
- What-if allocation testing with stat previews
- Build-from-scratch planning assistant
- Complete Phase 3 feature set

## API/Interface Design

### Existing Tool Extension: analyze_build

**Current Signature:**
```typescript
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
}
```

**Enhanced Description (Phase 1):**
```typescript
description: "Analyze a Path of Building build file and extract detailed information including stats, skills, gear, and passive skill tree analysis with keystones, notables, jewel sockets, and build archetype detection"
```

**No Parameter Changes Required** - Tree analysis automatically included in response

### Optional New Tool: refresh_tree_data

**Purpose:** Manually refresh cached passive tree data

**Signature:**
```typescript
{
  name: "refresh_tree_data",
  description: "Manually refresh the cached passive skill tree data from the PoB repository. Use this if you know PoB has updated or if tree data seems outdated.",
  inputSchema: {
    type: "object",
    properties: {
      version: {
        type: "string",
        description: "Optional: Specific tree version/league to refresh (e.g., 'Crucible'). If omitted, refreshes current version.",
      },
    },
  },
}
```

**Response:**
```typescript
{
  content: [{
    type: "text",
    text: "Passive tree data refreshed successfully.\n\nVersion: Crucible (3.21)\nLast Updated: 2024-04-07\nTotal Nodes: 2847\n\nTree data is now up to date."
  }]
}
```

### Phase 3 New Tool: compare_trees

**Purpose:** Compare passive trees between two builds

**Signature:**
```typescript
{
  name: "compare_trees",
  description: "Compare the passive skill trees between two builds, highlighting differences in keystones, notables, and point allocation efficiency",
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
}
```

### Phase 3 New Tool: test_allocation

**Purpose:** What-if testing for passive allocations

**Signature:**
```typescript
{
  name: "test_allocation",
  description: "Test hypothetical passive tree changes and see stat impacts without modifying the build file",
  inputSchema: {
    type: "object",
    properties: {
      build_name: {
        type: "string",
        description: "Base build file name",
      },
      changes: {
        type: "string",
        description: "Natural language description of changes (e.g., 'allocate Point Blank keystone' or 'remove Acrobatics and reallocate to life nodes')",
      },
    },
    required: ["build_name", "changes"],
  },
}
```

## Testing Strategy

### Unit Tests

**Tree Data Fetcher Tests:**
- Test fetching tree data from PoB repository
- Test parsing different data formats (JSON, Lua)
- Test caching with version tracking
- Test manual refresh clears cache
- Mock HTTP responses for reliability

**Tree Parser Tests:**
- Test parsing node IDs from build XML
- Test mapping node IDs to node details
- Test handling invalid node IDs
- Test categorizing node types
- Test with builds from different leagues
- Use sample build XMLs and mock tree data

**Archetype Detection Tests:**
- Test detection of common archetypes
- Test confidence scoring
- Test with edge case builds (hybrid archetypes)
- Test with minimal passive allocation
- Verify detection based on specific keystones

**Pathing Analysis Tests:**
- Test path length calculation
- Test efficiency scoring
- Test identifying inefficient paths
- Test with various tree layouts
- Test edge cases (minimal trees, fully allocated trees)

**Error Handling Tests:**
- Test invalid node ID error handling
- Test tree data fetch failures
- Test graceful degradation when tree data unavailable
- Test error message formatting
- Verify fail-fast behavior

### Integration Tests

**analyze_build with Tree Analysis:**
- Test full analyze_build call returns tree section
- Test tree section format matches specification
- Test with real PoB build files
- Test with builds from different leagues
- Verify all subsections present (keystones, notables, sockets, archetype)

**Cache Integration:**
- Test tree data cached after first fetch
- Test cache hit on subsequent calls
- Test cache invalidation on manual refresh
- Test cache keyed by version
- Verify performance improvement with caching

**Error Integration:**
- Test analyze_build with invalid tree data
- Test partial failure (tree fails, other sections succeed)
- Verify error messages reach user correctly
- Test fallback behavior when tree data unavailable

### Edge Cases

**Minimal Build:**
- Build with only starting nodes allocated
- Should handle gracefully with minimal tree analysis

**Empty Tree:**
- Build with no nodes allocated (edge case, may not be valid PoB file)
- Should detect and handle appropriately

**Over-Allocated Tree:**
- Build with more points allocated than available at level
- Should detect and warn user about impossible allocation

**Outdated League Build:**
- Build from 2+ leagues ago with changed passive tree
- Should detect version mismatch and warn clearly
- May have invalid node IDs - test error handling

**Corrupted Build File:**
- XML with malformed Tree element
- Should fail with clear error message
- Should not crash server

**Cluster Jewel Heavy Build:**
- Build with many cluster jewel sockets
- Should correctly identify cluster jewel nodes
- Test with nested cluster jewel setups

**Ascendancy-Focused Build:**
- Build with minimal passive tree, mostly ascendancy
- Should handle ascendancy nodes separately
- Should calculate ascendancy points correctly

### Performance Testing

**Tree Data Fetch Performance:**
- Measure time to fetch and parse tree data first time
- Target: <3 seconds for first fetch
- Verify acceptable on slow connections

**Cached Analysis Performance:**
- Measure analyze_build with tree analysis on cached tree data
- Target: <500ms additional time vs without tree analysis
- Compare cached vs uncached performance

**Large Build Performance:**
- Test with fully allocated passive tree (121 points)
- Measure parsing and analysis time
- Target: <1 second for full tree analysis

**Memory Usage:**
- Measure memory footprint of cached tree data
- Typical tree data: ~2-5MB
- Verify acceptable with multiple versions cached

## Performance Requirements

### Latency Targets

**First Tree Data Fetch:**
- Target: Sub-second ideal, 2-3 seconds acceptable
- Acceptable: Up to 5 seconds on slow connection
- User Experience: Show loading/fetching message during first fetch

**Cached Tree Analysis:**
- Target: <500ms additional time added to analyze_build
- Tree parsing from build XML: <100ms
- Node lookup and categorization: <200ms
- Archetype detection and analysis: <200ms

**Manual Tree Data Refresh:**
- Target: <5 seconds total
- Clear old cache: <10ms
- Fetch and parse new data: 2-5 seconds
- Update cache: <10ms

**Subsequent Analysis (Cached):**
- analyze_build with tree analysis: <1 second total
- Tree data already in cache, build parsing dominates time

### Memory Usage

**Tree Data Cache:**
- Single tree version: ~2-5MB (estimated based on node count and details)
- Multiple versions cached: ~5-15MB for 3 versions
- Acceptable: Tree data is static and infrequently updated
- Tradeoff: Memory for speed (avoid repeated fetches)

**Build Parsing:**
- Per-build memory: ~10-50KB for parsed tree data
- Cached in existing buildCache Map
- Build cache and tree cache are separate

**Total Server Footprint:**
- Base server: ~10MB
- With tree data: ~15-20MB
- With 10 builds cached: ~25-30MB
- Acceptable for modern systems

### Throughput

**Concurrent Requests:**
- MCP stdio transport is serial (one request at a time)
- No concurrency concerns
- Each request handled sequentially

**Multiple Builds:**
- analyze_build scales linearly with cached data
- No performance degradation with 100+ builds
- Tree data cached once, reused for all builds of same version

### Optimization Techniques

**Lazy Loading:**
- Only fetch tree data when first needed (first tree analysis request)
- Do NOT preload tree data on server startup

**Selective Parsing:**
- Parse only allocated nodes from tree data (not entire 2800+ node tree)
- Skip unallocated node details to reduce processing time

**Memoization:**
- Cache archetype detection results per build
- Cache pathing analysis results (keyed by allocated node set)
- Reuse calculations when same build analyzed multiple times

**Incremental Updates:**
- Phase 2+: Only recalculate changed paths for optimization suggestions
- Reuse graph structure between what-if scenarios

## Error Handling

### Invalid Passive Node IDs

**Scenario:** Build contains node IDs not found in tree data

**Detection:**
- During node lookup, collect all invalid IDs
- Check after parsing all nodes

**Response:**
```
Error: Invalid passive tree data detected

The build contains passive nodes that do not exist in the passive tree data.

Invalid Node IDs: 12345, 67890, 54321

This typically indicates:
- Build is from an outdated league (passive tree has changed)
- Build file is corrupted or manually edited incorrectly
- Passive tree data version mismatch

Build League: Sentinel (3.18)
Tree Data Version: Crucible (3.21)

Recommendation: Use a build from the current league or refresh the tree data if you believe it's outdated.

To refresh tree data, ask: "Refresh passive tree data"
```

**User Action:**
- Update build in Path of Building to current league
- Or use a different build file
- Or manually refresh tree data if confident it's a cache issue

### Tree Data Fetch Failure

**Scenario:** Cannot fetch tree data from PoB repository (network error, repo changed, etc.)

**Detection:**
- HTTP fetch fails with error
- Repository structure changed and data not found
- Data parsing fails due to format change

**Response:**
```
Error: Unable to load passive tree data

Failed to fetch passive tree data from Path of Building repository.

Error Details: [HTTP error message or parse error]
Repository: https://github.com/PathOfBuildingCommunity/PathOfBuilding
Attempted Path: [file path in repo]

The passive tree analysis feature is unavailable until tree data can be loaded.

Other build analysis features (stats, skills, gear) are still available.

Possible Solutions:
- Check your internet connection
- Try again in a few minutes (temporary network issue)
- Report this issue if problem persists (PoB repository may have changed)
```

**Graceful Degradation:**
- analyze_build continues to work for other sections
- Tree section shows: "Passive tree analysis unavailable - tree data not loaded"
- Do NOT fail entire analysis

### Tree Data Parse Failure

**Scenario:** Tree data fetched but cannot be parsed (format changed, corrupted data)

**Response:**
```
Error: Unable to parse passive tree data

Passive tree data was fetched successfully but could not be parsed.

This likely indicates:
- Path of Building repository changed data format
- Corrupted data in repository
- Bug in passive tree parser

Please report this issue with the error details:
[Parse error stack trace]

Other build analysis features remain available.
```

**Fallback:**
- Log detailed error for debugging
- Disable tree analysis temporarily
- Other analyze_build sections continue working

### Build XML Missing Tree Data

**Scenario:** Build file has no Tree element or malformed Tree data

**Response:**
```
Notice: No passive tree data found in build

This build file does not contain passive skill tree information.

This may indicate:
- Build was not saved properly in Path of Building
- Build file is corrupted
- This is an older build format (pre-tree export)

Other analysis (stats, skills, gear) is available.
```

**Behavior:**
- Tree section omitted from analyze_build output
- No error thrown (this may be valid for some edge case builds)
- Other sections analyzed normally

### League Version Mismatch Warning

**Scenario:** Build from old league, tree may have changed

**Response (as part of tree analysis section):**
```
=== Passive Tree ===

WARNING: This build is from Sentinel league (3.18).
Current passive tree data is from Crucible league (3.21).
The passive tree has changed between these versions.
Some nodes may have moved, changed, or been removed.

[Rest of tree analysis continues normally...]
```

**Behavior:**
- Warning displayed prominently at top of tree section
- Analysis continues with available tree data
- If nodes are invalid (removed), falls back to invalid node error handling

### Over-Allocated Points

**Scenario:** Build has more points allocated than possible at character level

**Response (in tree analysis section):**
```
Total Points: 135 / 121 available

WARNING: This build has more points allocated than available at level 95.
This is not possible in the actual game.

Possible reasons:
- Build file edited manually
- Path of Building calculation error
- Testing/theoretical build

[Rest of tree analysis continues with data as-is]
```

**Behavior:**
- Flag as warning but continue analysis
- Show actual vs available points clearly
- May indicate testing build or PoB bug

### Cache Corruption

**Scenario:** Cached tree data is corrupted or invalid

**Detection:**
- Cache hit but data structure invalid
- Type checks fail on cached data

**Response:**
- Clear corrupted cache entry
- Re-fetch tree data from source
- Log error for debugging
- Transparent to user (automatic recovery)

**User Message (if automatic recovery fails):**
```
Tree data cache error detected. Attempting to reload...

[If recovery successful: continues normally]
[If recovery fails: falls back to tree data fetch failure error]
```

## Future Considerations

### Cross-League Build Comparison (Separate Feature)

**Out of scope for current feature, planned as standalone:**
- Compare same build across multiple leagues
- Highlight passive tree changes between leagues
- Show how specific nodes changed
- Recommend updates to old builds for new leagues
- Requires multiple tree versions cached simultaneously

**Why Separate:**
- Different use case (league transitions vs current build analysis)
- More complex UI/output requirements
- Requires league history database
- Lower priority than current build analysis

### Deep Jewel Mod Parsing (Roadmap Item 2.2)

**Deferred to dedicated feature:**
- Parse regular jewel mods (Abyss, Prismatic, Searching Eye)
- Parse cluster jewel notables and passives
- Analyze jewel mod synergies with build
- Recommend jewel upgrades

**Current Feature Scope:**
- Identify jewel socket locations
- Detect which cluster jewels are equipped
- Do NOT parse jewel mods or stats deeply

### Ascendancy Optimization Suggestions

**Phase 2/3 consideration:**
- Suggest alternative ascendancy class choices
- Compare ascendancy passive benefits
- Recommend ascendancy point allocation order

**Current Phase 1:**
- Parse and display allocated ascendancy passives
- Count ascendancy points used
- No recommendations yet

### Flask and Configuration Integration

**Future integration (Roadmap Phase 2.3-2.4):**
- Consider flask effects when analyzing passive tree synergies
- Account for configuration state (Onslaught, Frenzy Charges) in archetype detection
- Unified build archetype considering passives + config + flasks

**Current Feature:**
- Passive tree analysis independent of flask/config state
- Archetype detection based solely on passives

### Live Build Editing via Lua API

**Long-term (Roadmap Phase 5):**
- Modify passive tree allocations directly in PoB
- Real-time stat updates from allocation changes
- AI-driven automatic tree optimization
- Interactive what-if testing with instant PoB feedback

**Current Feature:**
- Read-only analysis of saved build files
- No modification of PoB builds
- What-if testing (Phase 3) is simulation only

### Build Validation Warnings

**Roadmap Phase 3 feature, some overlap:**
- Detect missing life/ES nodes for survivability
- Flag resistance gaps related to passive choices
- Warn about missing pathing to important clusters

**Current Feature:**
- Archetype detection and confirmation
- Pathing efficiency analysis
- No deep validation or warnings yet

### Optimization Algorithm Improvements

**Continuous improvement beyond Phase 2:**
- Machine learning-based tree optimization
- Multi-objective optimization (offense + defense + QoL)
- Community build database for meta comparison
- Monte Carlo simulation for optimal point allocation

**Phase 2 Scope:**
- Algorithmic shortest path
- Basic point efficiency metrics
- Simple AI-driven suggestions

### Multiple Passive Tree Specs

**Current PoB supports multiple tree specs per build:**
- User can have different passive allocations saved as specs
- Current feature: Analyze default/active spec only
- Future: Support analyzing and comparing multiple specs within same build

---

## Success Criteria

### Phase 1 Success Metrics

**Functional Completeness:**
- Successfully fetch and cache passive tree data from PoB repository
- Parse all allocated passives from any valid PoB build XML
- Correctly identify keystones and notables by type
- Calculate accurate total points invested
- Detect build archetype with >80% accuracy on common builds
- Display league/version with warnings for outdated builds
- Integrate seamlessly into analyze_build output

**Reliability:**
- Handle invalid node IDs with clear error messages
- Gracefully degrade if tree data unavailable
- No crashes or unhandled exceptions on edge case builds
- Cache operates correctly with proper invalidation

**Performance:**
- First tree data fetch completes in <5 seconds
- Cached tree analysis adds <500ms to analyze_build
- Memory usage remains under 30MB with tree data cached

**User Experience:**
- Tree analysis output is clear and well-formatted
- Archetype detection provides actionable insights
- Error messages are understandable and include resolution steps
- Users report: "I can now see my keystones and understand my tree layout"

### Phase 2 Success Metrics

**Optimization Quality:**
- Identify genuine pathing inefficiencies (not false positives)
- Suggestions save at least 1-2 points on average builds
- AI suggestions are contextually relevant to build archetype
- Users report: "The optimization suggestions improved my build"

**Accuracy:**
- Shortest path calculations are mathematically correct
- Point efficiency scores correlate with manual analysis
- Recommendations respect build archetype and goals

### Phase 3 Success Metrics

**Feature Completeness:**
- Tree comparison highlights meaningful differences
- What-if testing accurately previews stat changes
- Build planning provides viable leveling paths
- Users report: "These advanced features help me plan and compare builds"

**Usability:**
- What-if syntax is intuitive and natural language-friendly
- Comparison output is easy to understand
- Planning recommendations are practical and implementable

### Overall Success

**User Adoption:**
- Feature is used regularly by active users
- Positive feedback on tree analysis quality
- Requests for additional tree-related features (indicates value)

**Technical Success:**
- No major bugs or reliability issues in production
- Performance meets or exceeds targets
- Code is maintainable and extensible for future enhancements

**Product Impact:**
- Tree analysis becomes a core part of build workflow
- Users trust AI build advice due to deep tree understanding
- Feature differentiates product from basic PoB export tools

---

## Dependencies & Risks

### External Dependencies

**Path of Building GitHub Repository:**
- Risk: Repository structure changes, breaking tree data fetch
- Mitigation: Abstract data fetching behind interface, support multiple fetch strategies
- Monitoring: Periodic checks of repository structure, version tree data files

**PoB Tree Data Format:**
- Risk: Data format changes (JSON to Lua, schema changes)
- Mitigation: Version tree data parser, support legacy formats
- Fallback: Manual tree data input or user-provided data files

**Network Availability:**
- Risk: Users without internet cannot fetch tree data
- Mitigation: Bundle tree data with server for offline use (future consideration)
- Alternative: Prompt user to fetch manually and provide file path

### Technical Risks

**Node ID Mapping Complexity:**
- Risk: Node IDs don't match between PoB versions or tree data source
- Mitigation: Version-aware node lookups, clear error messages for mismatches
- Testing: Validate with builds from multiple leagues

**Performance with Large Trees:**
- Risk: Fully allocated trees (121 points) take too long to analyze
- Mitigation: Optimize node lookup (Map/Set for O(1)), lazy evaluation
- Testing: Performance test with max-size trees

**Archetype Detection Accuracy:**
- Risk: Edge case builds (hybrid archetypes) not detected correctly
- Mitigation: Confidence scoring, user confirmation step, allow manual override
- Iteration: Improve detection rules based on user feedback

**Cache Memory Growth:**
- Risk: Multiple tree versions cached consume excessive memory
- Mitigation: LRU eviction policy (future), limit cached versions to 3 most recent
- Monitoring: Track cache size, alert if exceeds threshold

### Project Risks

**Scope Creep:**
- Risk: Feature expands beyond Phase 1 timeline due to complexity
- Mitigation: Strict adherence to phased approach, defer Phase 2/3 features
- Checkpoint: Review scope after Milestone 1.4, adjust if behind schedule

**PoB Repository Investigation Unknowns:**
- Risk: Tree data not easily accessible or in unusable format
- Mitigation: Allocate full 2 days for investigation, have fallback plans
- Fallback: Manual tree data input, community-provided data files, scrape from PoB website

**Integration Complexity:**
- Risk: Adding tree analysis to analyze_build disrupts existing functionality
- Mitigation: Thorough testing of integration, graceful degradation if tree fails
- Safeguard: Tree analysis is additive, existing sections remain unchanged

### Mitigation Strategies

**Robust Error Handling:**
- Fail fast with clear errors
- Graceful degradation for non-critical failures
- User-friendly error messages with resolution steps

**Incremental Development:**
- Deliver Phase 1 as MVP
- Gather user feedback before Phase 2
- Adjust priorities based on actual usage patterns

**Community Involvement:**
- Engage PoE community for testing with diverse builds
- Crowdsource edge case builds for testing
- Gather feedback on archetype detection accuracy

**Documentation:**
- Document tree data source and format for future maintainers
- Create troubleshooting guide for common issues
- Maintain changelog for tree data version compatibility

---

This specification provides a comprehensive blueprint for implementing enhanced passive tree analysis in the PoB MCP Server, with clear phases, success criteria, and risk mitigation strategies to ensure successful delivery of a valuable feature for Path of Exile players.
