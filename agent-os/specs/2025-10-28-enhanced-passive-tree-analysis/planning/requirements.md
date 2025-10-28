# Spec Requirements: Enhanced Passive Tree Analysis

## Initial Description
Enable the AI to parse, understand, and analyze Path of Building passive skill trees including allocated nodes, keystones, notables, build archetypes, and optimization suggestions.

## Requirements Discussion

### First Round Questions

**Q1: Where will passive tree data (node names, descriptions, connections) come from?**
**Answer:** Fetch from the official PoE API if possible, or from the PoB GitHub repository (https://github.com/PathOfBuildingCommunity/PathOfBuilding) if the data is stored there. Prefer fetching from PoB codebase if that's where it lives.

**Q2: How should build archetype detection work?**
**Answer:** AI should detect archetypes automatically, but with user prompting to ensure accuracy (confirmation/validation step).

**Q3: What level of detail should the passive tree analysis provide?**
**Answer:** Yes to all - include: (a) allocated keystones with descriptions, (b) notable passives and effects, (c) jewel socket locations, (d) total passive points invested, (e) pathing inefficiencies.

**Q4: Should optimization suggestions be algorithmic or AI-driven?**
**Answer:** Both approaches - implement algorithmic suggestions (like shortest path calculations) AND allow AI to generate contextual suggestions based on the data we provide.

**Q5: Should cluster jewel socket parsing be included in this feature?**
**Answer:** Yes, parse which cluster jewels are equipped in sockets as part of this feature (don't defer to separate jewel parsing feature).

**Q6: Should ascendancy class passive analysis be fully part of this feature?**
**Answer:** Yes, ascendancy analysis is fully part of this feature.

**Q7: How should this integrate with the existing analyze_build tool?**
**Answer:** Option A - Integrate with existing `analyze_build` tool by adding passive tree analysis as a section. When users ask Claude to "analyze my build", they get stats, skills, gear, AND passive tree info all in one response.

**Q8: What should explicitly be excluded from this feature?**
**Answer:** None - include everything: passive tree comparison between builds, "what-if" passive allocation testing, build-from-scratch tree planning.

### Existing Code to Reference

No similar existing features identified for reference. This is the first deep passive tree parsing feature in the codebase.

### Follow-up Questions

**Follow-up 1: Performance & Caching Strategy**
Given that passive tree data will be fetched from external sources (PoE API or PoB GitHub), how should we handle caching and performance?

**Answer:**
- YES to manual "refresh passive tree data" option for users
- Cache tree data locally after first fetch
- Auto-update after PoB updates (monitor PoB repository for changes)
- Acceptable load time: Not specified (use reasonable defaults - assume sub-second is ideal, 2-3 seconds acceptable for first fetch)

**Follow-up 2: Error Handling for Invalid Tree Data**
What should happen when the build file contains invalid or non-existent passive nodes?

**Answer:**
- Fail the entire analysis if invalid/non-existent nodes are found
- Return clear "invalid data error" message to user
- Do NOT attempt auto-fix of outdated node IDs
- Provide clear error details about which nodes were invalid

**Follow-up 3: League/Version Compatibility**
Path of Exile's passive tree changes between leagues and major patches.

**Answer:**
- YES detect which PoE version/league the build was created for (if possible from build XML)
- Create a SEPARATE feature/option for analyzing builds between current and previous leagues
- Cross-league analysis should give a basic overview of major changes between patches
- Assertion: Tree data should NOT change after a league starts
- YES warn users when analyzing a build from a previous league

**Follow-up 4: Implementation Priority & Phasing**
Should we implement this feature in phases or all at once?

**Answer:**
- **Option B - Phased Approach Selected:**
  - **Phase 1 (Week 1):** Basic tree parsing + integration with analyze_build
    - Parse keystones, notables, jewel sockets, ascendancy
    - Calculate total points invested
    - Detect basic pathing
    - Integrate into existing `analyze_build` tool
  - **Phase 2 (Week 2):** Optimization suggestions
    - Implement algorithmic shortest path calculations
    - Add AI contextual suggestions based on build data
    - Point efficiency recommendations
  - **Phase 3 (Week 2-3):** Advanced features
    - Tree comparison between builds
    - What-if passive allocation testing
    - Build-from-scratch tree planning

**Follow-up 5: Data Source Investigation**
Should we investigate the data source structure before implementation?

**Answer:**
- YES investigate the PoB GitHub repository (https://github.com/PathOfBuildingCommunity/PathOfBuilding) structure first
- Find where passive tree data lives in the repository
- YES parse/extract data from PoB's Lua data files if needed
- Any data format is acceptable (JSON, Lua tables, etc.)
- Check if PoE has an official passive tree API as backup option

## Visual Assets

### Files Provided:
No visual assets provided.

### Visual Insights:
N/A - No visual files found in planning/visuals/ folder.

## Requirements Summary

### Functional Requirements

**Core Parsing (Phase 1):**
- Parse allocated passive tree nodes from PoB XML build files
- Identify and extract keystone passives with full descriptions
- Extract notable passives with their effects
- Track jewel socket locations (regular and cluster jewel sockets)
- Calculate total passive points invested
- Analyze pathing efficiency and identify inefficiencies
- Parse ascendancy class passives fully
- Detect which cluster jewels are equipped in sockets

**Build Archetype Detection (Phase 1):**
- Automatically detect build archetypes (crit vs RT, life vs ES, attack vs spell, etc.)
- Implement user confirmation/validation step for detected archetype
- Use archetype context for tailored suggestions

**Optimization Suggestions (Phase 2):**
- Implement algorithmic suggestions (shortest path calculations, point efficiency)
- Enable AI to generate contextual optimization suggestions
- Combine both approaches for comprehensive recommendations

**Advanced Features (Phase 3):**
- Support passive tree comparison between builds
- Enable "what-if" passive allocation testing
- Support build-from-scratch tree planning

**League Compatibility (Phase 1):**
- Detect which PoE version/league the build was created for from XML metadata
- Warn users when analyzing a build from a previous league
- NOTE: Cross-league build comparison is a SEPARATE future feature

**Integration (Phase 1):**
- Add passive tree analysis as a section within existing `analyze_build` tool
- Present tree analysis alongside stats, skills, and gear in unified response

**Data Management (Phase 1):**
- Investigate and fetch passive tree data from PoB GitHub repository structure
- Fallback to PoE API if available and suitable
- Parse node connections, descriptions, and attributes
- Cache tree data locally after first successful fetch
- Provide manual "refresh passive tree data" option
- Monitor PoB repository for updates and auto-refresh cache

**Error Handling (Phase 1):**
- Fail entire analysis if invalid/non-existent nodes are detected
- Return clear "invalid data error" with specific node details
- Do NOT auto-fix outdated node IDs
- Provide actionable error messages to help users resolve issues

### Reusability Opportunities

**Existing Tools to Extend:**
- `analyze_build` tool - Add passive tree section to existing comprehensive analysis
- Existing XML parsing infrastructure (fast-xml-parser)
- Existing caching strategy (in-memory Map cache with file-change invalidation)

**Patterns to Follow:**
- Follow established MCP tool pattern for new functionality
- Use existing TypeScript build data structure interfaces
- Maintain consistency with current error handling and response formatting
- Leverage existing file watching and cache invalidation system

### Scope Boundaries

**Phase 1 - In Scope:**
- Complete passive tree parsing from build XML
- Keystone, notable, and ascendancy passive identification
- Jewel socket location tracking
- Cluster jewel socket parsing
- Point investment calculation
- Pathing efficiency analysis
- Build archetype detection with validation
- Integration with analyze_build tool
- League/version detection and warnings
- Data source investigation and implementation
- Local caching with manual refresh option
- Strict error handling for invalid nodes

**Phase 2 - In Scope:**
- Algorithmic optimization (shortest path, efficiency)
- AI-driven contextual optimization suggestions
- Point efficiency recommendations

**Phase 3 - In Scope:**
- Passive tree comparison between builds
- What-if passive allocation testing
- Build-from-scratch tree planning

**Out of Scope (All Phases):**
- Cross-league build comparison (separate future feature)
- Deep jewel mod parsing (separate roadmap item: "Comprehensive Jewel Parsing")
- Flask analysis (separate roadmap item: "Flask System Analysis")
- Configuration state analysis (separate roadmap item: "Configuration State Parsing")
- Build validation warnings (separate roadmap item: "Build Validation Engine")
- Live build editing via Lua API (future Phase 5 feature)
- Auto-fixing outdated passive node IDs

### Technical Considerations

**Data Source Strategy:**
- Primary: Path of Building GitHub repository (https://github.com/PathOfBuildingCommunity/PathOfBuilding)
  - Investigation required to locate passive tree data files
  - Parse Lua data files if necessary
  - Accept any format found (JSON, Lua tables, etc.)
- Fallback: Official PoE API if available and suitable
- Preference for PoB codebase data as authoritative source

**Caching Strategy:**
- Cache passive tree data locally in-memory after first successful fetch
- Provide manual "refresh passive tree data" user option/command
- Monitor PoB repository for updates (webhook, polling, or manual trigger)
- Auto-refresh cache when PoB repository updates are detected
- Invalidate cache on manual refresh request
- Reasonable performance targets: sub-second ideal, 2-3 seconds acceptable for first fetch

**Error Handling Approach:**
- Fail fast: Fail entire analysis if ANY invalid/non-existent nodes found
- Return structured error with:
  - Clear "invalid data error" message
  - List of invalid node IDs
  - Suggestion to check if build is from outdated league
- Do NOT attempt automatic fixes or partial analysis
- Follow existing error handling patterns for user-friendly messaging

**League/Version Compatibility:**
- Detect league/version from PoB XML metadata fields
- Compare detected version against current league/patch
- Warn users if analyzing build from previous league
- Display detected league/version in analysis output
- Assumption: Tree data does NOT change mid-league (can assert this)
- Cross-league comparison is out of scope (separate future feature)

**Integration Points:**
- Extend existing `analyze_build` tool with new passive tree section
- Use existing XML parsing with fast-xml-parser
- Leverage current caching and file watching infrastructure
- Maintain stdio-based MCP transport
- Add new section to analyze_build response structure

**Technology Stack Alignment:**
- Node.js + TypeScript (existing stack)
- fast-xml-parser for build file reading
- In-memory caching with automatic invalidation
- MCP SDK for tool definition and responses
- May require Lua parser library if tree data is in Lua format

**Performance Requirements:**
- Target: Sub-second response for cached tree data
- Acceptable: 2-3 seconds for first fetch from external source
- Cache invalidation should be near-instantaneous
- Manual refresh should complete within 5 seconds

**Implementation Phasing:**
1. **Phase 1 (Week 1) - Core Parsing & Integration**
   - Data source investigation and implementation
   - Basic tree parsing (keystones, notables, jewel sockets, ascendancy)
   - Point calculation and basic pathing analysis
   - Build archetype detection
   - Integration with analyze_build tool
   - Caching implementation
   - Error handling for invalid nodes
   - League detection and warnings

2. **Phase 2 (Week 2) - Optimization**
   - Algorithmic shortest path calculations
   - Point efficiency analysis
   - AI contextual suggestion framework
   - Optimization recommendations in analyze_build output

3. **Phase 3 (Week 2-3) - Advanced Features**
   - Tree comparison between builds
   - What-if allocation testing
   - Build-from-scratch planning mode
   - Potentially new MCP tools for these advanced features

**Data Format Flexibility:**
- Accept JSON if available from source
- Parse Lua tables if tree data stored in Lua files
- Convert to normalized internal JSON structure
- Handle both node-by-node and graph representations
- Support both numeric node IDs and string identifiers

**Dependencies to Investigate:**
- PoB GitHub repository structure and data location
- Potential Lua parsing library (if needed)
- PoE official API documentation (as fallback)
- Tree data update frequency and versioning approach
