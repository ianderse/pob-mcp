# Task Breakdown: Enhanced Passive Tree Analysis

## Overview
Total Estimated Tasks: 50-60
Phases: 3 (Phase 1 = MVP, Phase 2 = Optimization, Phase 3 = Advanced)

## Implementation Phases

### PHASE 1: CORE PARSING & INTEGRATION (Week 1) - HIGHEST PRIORITY

---

### Task Group 1: Data Source Investigation & Setup
**Phase:** 1
**Dependencies:** None
**Assigned To:** Backend Engineer
**Estimated Effort:** 2 days

- [ ] 1.0 Complete data source investigation
  - [ ] 1.1 Research PoB GitHub repository structure
    - Clone or inspect https://github.com/PathOfBuildingCommunity/PathOfBuilding
    - Identify directory structure (likely locations: /Data, /TreeData, /src/Data)
    - Document repository branch/tag strategy (stable vs development)
    - Take screenshots/notes of relevant directories
  - [ ] 1.2 Locate passive skill tree data files
    - Search for files containing node data (tree3.txt, tree.lua, treeData.json, etc.)
    - Identify format: JSON, Lua tables, or custom format
    - Download sample tree data file for local testing
    - Document exact file path and access method (raw GitHub URL)
  - [ ] 1.3 Analyze tree data structure
    - Parse sample tree data locally using appropriate parser
    - Document data schema: node IDs, names, types, stats, connections
    - Identify keystone/notable classification method
    - Map out jewel socket identification approach
    - Document ascendancy node data structure
  - [ ] 1.4 Write 2-8 focused tests for tree data fetcher
    - Limit to 2-8 highly focused tests maximum
    - Test HTTP fetch from GitHub raw URL (mock HTTP response)
    - Test parsing of tree data format (use sample data)
    - Test caching mechanism with version tracking
    - Test graceful failure when fetch fails
    - Skip exhaustive error scenarios and edge cases
  - [ ] 1.5 Determine optimal fetch strategy
    - Decide: raw GitHub files vs git clone vs PoE API
    - Test fetch performance (measure time to download and parse)
    - Plan fallback strategy if primary source fails
    - Document decision and rationale in spec folder

**Acceptance Criteria:**
- The 2-8 tests written in 1.4 pass
- Tree data source clearly identified and accessible
- Data structure fully documented with examples
- Fetch strategy decided and justified
- Sample tree data parsed successfully locally

**Technical Notes:**
- Likely URL pattern: `https://raw.githubusercontent.com/PathOfBuildingCommunity/PathOfBuilding/master/Data/tree.txt`
- May need to handle Lua parsing if data is in Lua format
- Consider using node-fetch or native Node.js https module
- Reference spec.md lines 174-194 for data source requirements

---

### Task Group 2: Tree Data Fetcher & Cache Implementation
**Phase:** 1
**Dependencies:** Task Group 1
**Assigned To:** Backend Engineer
**Estimated Effort:** 1.5 days

- [ ] 2.0 Complete tree data fetcher and caching layer
  - [ ] 2.1 Create passive tree data TypeScript interfaces
    - Define PassiveTreeNode interface (id, name, type, stats, connections)
    - Define PassiveTreeData interface (nodes Map, version, league)
    - Define TreeDataCache interface (similar to CachedBuild pattern)
    - Add interfaces to src/index.ts or new src/types/tree.ts
    - Reference spec.md lines 198-224 for data structure
  - [ ] 2.2 Implement tree data fetcher service
    - Create fetchTreeData() method in PoBMCPServer class
    - Use node-fetch or https module to fetch from GitHub
    - Parse data format (JSON/Lua) into PassiveTreeData structure
    - Extract version information from data or URL
    - Add error handling for network failures
    - Return normalized PassiveTreeData object
  - [ ] 2.3 Implement tree data caching system
    - Add treeDataCache: Map<version, PassiveTreeData> to class
    - Implement getTreeData(version?: string) method with cache-first logic
    - Cache data after first successful fetch
    - Add version-based cache key (support multiple versions)
    - Log cache hits/misses similar to build cache pattern
  - [ ] 2.4 Add manual refresh capability
    - Create refreshTreeData(version?: string) method
    - Clear cached tree data for specified version (or all)
    - Force re-fetch from source
    - Update cache with new data
    - Return success/failure response
  - [ ] 2.5 Run tree data fetcher tests
    - Run ONLY the 2-8 tests written in Task 1.4
    - Verify fetch, parse, and cache operations work
    - Do NOT run entire test suite at this stage

**Acceptance Criteria:**
- The 2-8 tests from Task 1.4 pass
- Tree data fetched successfully from PoB repository
- Data parsed into TypeScript interfaces correctly
- Caching works with version-based keys
- Manual refresh clears and reloads data
- Performance: <5 seconds for first fetch

**Technical Notes:**
- Reuse existing caching pattern from buildCache (lines 61, 393-415)
- Consider lazy loading: fetch only when first needed
- Add console.error logging for debugging (like existing cache logs)
- Reference spec.md lines 262-289 for caching strategy

---

### Task Group 3: Build Tree Parsing & Node Mapping
**Phase:** 1
**Dependencies:** Task Group 2
**Assigned To:** Backend Engineer
**Estimated Effort:** 2 days

- [ ] 3.0 Complete build passive tree parsing
  - [ ] 3.1 Write 2-8 focused tests for tree parsing
    - Limit to 2-8 highly focused tests maximum
    - Test extracting node IDs from build XML Tree element
    - Test mapping node IDs to tree data (mock tree data)
    - Test node categorization (keystone, notable, normal, jewel)
    - Test handling invalid node IDs (should collect and error)
    - Skip exhaustive coverage of all node types and edge cases
  - [ ] 3.2 Extend PoBBuild interface for Tree data
    - Update Tree interface in src/index.ts (lines 25-30)
    - Add nodes?: string field (comma-separated node IDs)
    - Add ascendancy?: string field
    - Add sockets?: string field for jewel sockets
    - Add treeVersion?: string field if available in XML
    - Reference spec.md lines 198-224 for structure
  - [ ] 3.3 Implement tree node ID extraction from build XML
    - Create parseAllocatedNodes(build: PoBBuild) method
    - Extract nodes attribute from Tree.Spec element
    - Split comma-separated string into array of node IDs
    - Handle missing or malformed Tree element gracefully
    - Return array of node IDs as strings or numbers
  - [ ] 3.4 Implement node ID to node details mapping
    - Create mapNodesToDetails(nodeIds: string[], treeData: PassiveTreeData) method
    - Look up each node ID in treeData.nodes Map
    - Collect invalid node IDs (not found in tree data)
    - Throw error if any invalid nodes found (fail-fast)
    - Return array of PassiveTreeNode objects for valid nodes
    - Reference spec.md lines 848-875 for invalid node handling
  - [ ] 3.5 Implement node categorization and extraction
    - Create categorizeNodes(nodes: PassiveTreeNode[]) method
    - Separate nodes by type: keystones, notables, normal, jewel, ascendancy
    - Count nodes in each category
    - Extract keystone names and descriptions
    - Extract notable names and key stats
    - Return categorized node structure
  - [ ] 3.6 Implement passive point calculations
    - Create calculatePassivePoints(build: PoBBuild, nodes: PassiveTreeNode[]) method
    - Count total allocated nodes (excluding ascendancy)
    - Calculate available points based on character level
    - Compare allocated vs available
    - Detect over-allocation (more points than possible)
    - Reference spec.md lines 250-256 for calculation logic
  - [ ] 3.7 Run tree parsing tests
    - Run ONLY the 2-8 tests written in Task 3.1
    - Verify node extraction and mapping work correctly
    - Do NOT run entire test suite at this stage

**Acceptance Criteria:**
- The 2-8 tests written in Task 3.1 pass
- Node IDs extracted correctly from build XML
- Nodes mapped to tree data details successfully
- Invalid nodes detected and error thrown with details
- Categorization separates keystones, notables, jewels correctly
- Point calculations accurate for various character levels

**Technical Notes:**
- Reuse existing XML parsing with this.parser (lines 81-84)
- Handle both string and number node ID formats
- Reference existing generateBuildSummary() for output patterns
- Ensure fail-fast on invalid nodes (spec.md lines 62-67, 848-875)

---

### Task Group 4: Build Archetype Detection
**Phase:** 1
**Dependencies:** Task Group 3
**Assigned To:** Backend Engineer
**Estimated Effort:** 1 day

- [ ] 4.0 Complete build archetype detection system
  - [ ] 4.1 Write 2-8 focused tests for archetype detection
    - Limit to 2-8 highly focused tests maximum
    - Test detection of common archetypes (crit, RT, CI, life-based)
    - Test confidence scoring logic
    - Test user confirmation message formatting
    - Skip testing all possible archetype combinations
  - [ ] 4.2 Implement keystone-based archetype detection
    - Create detectArchetype(keystones: PassiveTreeNode[], notables: PassiveTreeNode[]) method
    - Define archetype indicators as constants:
      - Resolute Technique = Attack, no crit
      - CI (Chaos Inoculation) = Energy Shield
      - Critical Strike keystones = Crit-based
      - Point Blank = Projectile attack
      - Elemental Overload = Elemental, no crit scaling
    - Scan allocated keystones for archetype markers
    - Analyze notable patterns for additional context
  - [ ] 4.3 Implement archetype confidence scoring
    - Assign confidence level: High, Medium, Low
    - High confidence: Clear keystone indicators (RT, CI)
    - Medium confidence: Multiple supporting notables
    - Low confidence: Minimal indicators or conflicting signals
    - Return archetype string and confidence level
  - [ ] 4.4 Format archetype for user confirmation
    - Create formatArchetypeConfirmation(archetype: string, confidence: string) method
    - Generate descriptive archetype text (e.g., "Critical Strike Bow Attack (Life-based)")
    - Include confidence level in output
    - Add "[Pending user confirmation]" prompt
    - Return formatted string for analyze_build output
    - Reference spec.md lines 398-401 for example format
  - [ ] 4.5 Run archetype detection tests
    - Run ONLY the 2-8 tests written in Task 4.1
    - Verify detection works for common build types
    - Do NOT run entire test suite at this stage

**Acceptance Criteria:**
- The 2-8 tests written in Task 4.1 pass
- Common archetypes detected correctly (>80% accuracy expected)
- Confidence scoring reflects detection certainty
- User confirmation message clear and actionable
- Edge case builds handled gracefully (low confidence)

**Technical Notes:**
- Reference spec.md lines 240-249 for archetype detection logic
- Start with simple rule-based system (can enhance with AI later)
- Store archetype constants in separate configuration object
- Consider hybrid archetypes (e.g., life/ES hybrid)

---

### Task Group 5: Pathing Analysis
**Phase:** 1
**Dependencies:** Task Group 3
**Assigned To:** Backend Engineer
**Estimated Effort:** 1.5 days

- [ ] 5.0 Complete passive tree pathing analysis
  - [ ] 5.1 Write 2-8 focused tests for pathing analysis
    - Limit to 2-8 highly focused tests maximum
    - Test building allocated node graph from connections
    - Test identifying pathing vs destination nodes
    - Test basic efficiency calculations
    - Skip testing all possible tree layouts
  - [ ] 5.2 Build allocated node graph
    - Create buildNodeGraph(allocatedNodes: PassiveTreeNode[]) method
    - Create adjacency list or graph structure from node connections
    - Include only allocated nodes in graph
    - Store node connections for traversal
    - Return graph data structure
  - [ ] 5.3 Identify destination vs pathing nodes
    - Create categorizeNodePurpose(nodes: PassiveTreeNode[]) method
    - Destination nodes: keystones, notables, jewel sockets
    - Pathing nodes: normal small passives with minimal stats
    - Count pathing nodes vs destinations
    - Return categorized lists
  - [ ] 5.4 Calculate basic pathing efficiency
    - Create analyzePathingEfficiency(graph, pathingNodes, destinations) method
    - Calculate total pathing nodes invested
    - Estimate average path length to destinations
    - Identify potentially long or inefficient paths (>6 points to single destination)
    - Generate efficiency summary: "Good", "Moderate", "Inefficient"
  - [ ] 5.5 Format pathing analysis for output
    - Create formatPathingAnalysis(efficiency) method
    - Include total pathing nodes count
    - Highlight any inefficient paths detected
    - Provide actionable summary
    - Return formatted text for analyze_build output
    - Reference spec.md lines 402-406 for example format
  - [ ] 5.6 Run pathing analysis tests
    - Run ONLY the 2-8 tests written in Task 5.1
    - Verify graph building and efficiency calculations
    - Do NOT run entire test suite at this stage

**Acceptance Criteria:**
- The 2-8 tests written in Task 5.1 pass
- Node graph built correctly from connections
- Pathing vs destination nodes categorized accurately
- Efficiency metrics calculated reasonably
- Analysis identifies obvious inefficiencies
- Output formatted clearly

**Technical Notes:**
- Keep Phase 1 analysis simple (detailed optimization in Phase 2)
- Use basic heuristics, not sophisticated pathfinding yet
- Reference spec.md lines 257-261 for pathing requirements
- Focus on actionable insights, not perfect optimization

---

### Task Group 6: League & Version Detection
**Phase:** 1
**Dependencies:** Task Group 3
**Assigned To:** Backend Engineer
**Estimated Effort:** 0.5 days

- [ ] 6.0 Complete league and version detection
  - [ ] 6.1 Write 2-8 focused tests for version detection
    - Limit to 2-8 highly focused tests maximum
    - Test extracting version from build XML metadata
    - Test version comparison and mismatch warnings
    - Skip testing all historical league versions
  - [ ] 6.2 Extract league/version from build metadata
    - Create extractBuildVersion(build: PoBBuild) method
    - Check Build element attributes for version field
    - Parse Tree.Spec.URL for version information if present
    - Extract from Notes field if version mentioned
    - Return version string or "Unknown"
  - [ ] 6.3 Compare build version with tree data version
    - Create compareVersions(buildVersion: string, treeVersion: string) method
    - Determine if versions match, mismatch, or unknown
    - Generate warning if mismatch detected
    - Return comparison result and warning text
  - [ ] 6.4 Format league detection for output
    - Add league/version info to tree analysis section
    - Include warning prominently if mismatch detected
    - Reference spec.md lines 968-983 for warning format
    - Return formatted text for analyze_build output
  - [ ] 6.5 Run league detection tests
    - Run ONLY the 2-8 tests written in Task 6.1
    - Verify version extraction and comparison work
    - Do NOT run entire test suite at this stage

**Acceptance Criteria:**
- The 2-8 tests written in Task 6.1 pass
- Build version extracted when available in XML
- Version comparison detects mismatches correctly
- Warning displayed clearly for outdated builds
- Graceful handling when version unknown

**Technical Notes:**
- Reference spec.md lines 331-353 for league detection requirements
- Version format may vary: "3.21", "Crucible", "3.21.0"
- Normalize version strings for comparison
- Missing version should not fail analysis

---

### Task Group 7: Integration with analyze_build Tool
**Phase:** 1
**Dependencies:** Task Groups 2-6
**Assigned To:** Backend Engineer
**Estimated Effort:** 2 days

- [ ] 7.0 Complete analyze_build integration
  - [ ] 7.1 Write 2-8 focused tests for integration
    - Limit to 2-8 highly focused tests maximum
    - Test full analyze_build with tree section included
    - Test tree section formatting matches spec
    - Test graceful degradation when tree data unavailable
    - Skip testing all possible build variations
  - [ ] 7.2 Create tree analysis orchestration method
    - Create analyzePassiveTree(build: PoBBuild) method
    - Coordinate all tree analysis sub-methods:
      - Fetch/get tree data (with caching)
      - Parse allocated nodes
      - Map nodes to details
      - Categorize nodes
      - Calculate points
      - Detect archetype
      - Analyze pathing
      - Detect league version
    - Handle errors at each step with graceful fallback
    - Return comprehensive tree analysis object
  - [ ] 7.3 Create tree analysis output formatter
    - Create formatTreeAnalysis(treeAnalysis) method
    - Generate "=== Passive Tree ===" section
    - Include all subsections:
      - League/version with warnings
      - Total points (allocated / available)
      - Ascendancy points
      - Allocated keystones with descriptions
      - Key notable passives (list top 5-10)
      - Jewel sockets count and types
      - Detected archetype with confirmation prompt
      - Pathing efficiency summary
    - Reference spec.md lines 368-409 for output structure
    - Return formatted text string
  - [ ] 7.4 Integrate into handleAnalyzeBuild method
    - Update handleAnalyzeBuild() in src/index.ts (lines 496-508)
    - Call analyzePassiveTree(build) after reading build
    - Append formatted tree section to existing summary
    - Handle tree analysis errors gracefully (log error, show notice)
    - Ensure other sections (stats, skills, items) still work if tree fails
  - [ ] 7.5 Update analyze_build tool description
    - Update tool description in ListToolsRequestSchema handler (lines 236-249)
    - Add mention of passive tree analysis features
    - Include: keystones, notables, jewel sockets, archetype detection
    - Keep description concise but informative
    - Reference spec.md lines 562-566 for enhanced description
  - [ ] 7.6 Implement comprehensive error handling
    - Handle tree data fetch failures (graceful degradation)
    - Handle invalid node IDs (fail with clear error message)
    - Handle missing tree element in build XML (skip tree section)
    - Handle parse errors (log and return error notice)
    - Reference spec.md lines 290-330, 848-1030 for error scenarios
  - [ ] 7.7 Run integration tests
    - Run ONLY the 2-8 tests written in Task 7.1
    - Verify full analyze_build works with tree section
    - Do NOT run entire test suite at this stage

**Acceptance Criteria:**
- The 2-8 tests written in Task 7.1 pass
- analyze_build returns tree section with all subsections
- Output formatting matches spec example (spec.md lines 368-409)
- Graceful degradation works when tree data unavailable
- Invalid nodes handled with clear error message
- Other build sections unaffected by tree failures
- Tool description updated accurately

**Technical Notes:**
- Reuse existing generateBuildSummary() pattern (lines 417-480)
- Insert tree section after Stats, before Skills
- Maintain consistent formatting with existing sections
- Log errors to console.error for debugging
- Reference spec.md lines 354-416 for integration requirements

---

### Task Group 8: Testing & Quality Assurance
**Phase:** 1
**Dependencies:** Task Group 7
**Assigned To:** QA / Test Engineer
**Estimated Effort:** 1.5 days

- [ ] 8.0 Review and fill critical testing gaps
  - [ ] 8.1 Review existing tests from Task Groups 1-7
    - Review 2-8 tests from Task 1.4 (tree data fetcher)
    - Review 2-8 tests from Task 3.1 (tree parsing)
    - Review 2-8 tests from Task 4.1 (archetype detection)
    - Review 2-8 tests from Task 5.1 (pathing analysis)
    - Review 2-8 tests from Task 6.1 (version detection)
    - Review 2-8 tests from Task 7.1 (integration)
    - Total existing tests: approximately 12-48 tests
  - [ ] 8.2 Analyze test coverage gaps for Phase 1 only
    - Identify critical user workflows lacking test coverage
    - Focus ONLY on gaps related to Phase 1 features
    - Do NOT assess entire application test coverage
    - Prioritize end-to-end workflows over unit test gaps
    - List top 3-5 critical gaps to address
  - [ ] 8.3 Write up to 10 additional strategic tests maximum
    - Add maximum of 10 new tests to fill identified critical gaps
    - Focus on integration points and end-to-end workflows:
      - Test complete analyze_build with real PoB file
      - Test handling builds from different leagues
      - Test over-allocated point detection
      - Test minimal tree builds (few nodes)
      - Test cluster jewel socket detection
      - Test graceful degradation scenarios
    - Do NOT write comprehensive coverage for all scenarios
    - Skip performance tests and accessibility tests
  - [ ] 8.4 Run Phase 1 feature-specific tests only
    - Run ONLY tests related to Phase 1 features
    - Expected total: approximately 22-58 tests maximum
    - Verify all critical workflows pass
    - Do NOT run entire application test suite
    - Document any failures and iterate until passing

**Acceptance Criteria:**
- All Phase 1 feature-specific tests pass (22-58 tests total)
- Critical user workflows for Phase 1 covered
- No more than 10 additional tests added when filling gaps
- Testing focused exclusively on Phase 1 features
- Integration tests verify end-to-end functionality

**Technical Notes:**
- Use sample PoB build files for testing (create test fixtures)
- Mock tree data for unit tests, use real data for integration tests
- Reference spec.md lines 654-748 for testing strategy
- Consider using tools like Jest or Mocha (add to package.json if needed)

---

### PHASE 1 COMPLETION CHECKPOINT

**Phase 1 Deliverables:**
- Passive tree data fetched and cached from PoB repository
- Build tree parsed with node details extracted
- Archetype detection with user confirmation
- Pathing efficiency analysis (basic)
- League/version detection with warnings
- Integrated into analyze_build tool output
- Comprehensive error handling
- All Phase 1 tests passing (22-58 tests)

**Success Criteria:**
- analyze_build tool returns complete tree analysis
- Invalid nodes handled with clear errors
- Performance: <500ms added to analyze_build (cached data)
- Output formatting matches spec example
- Feature ready for user testing

**Before Moving to Phase 2:**
- Gather user feedback on Phase 1 features
- Validate archetype detection accuracy with real builds
- Confirm error handling works for edge cases
- Ensure performance meets targets

---

### PHASE 2: OPTIMIZATION SUGGESTIONS (Week 2)

---

### Task Group 9: Shortest Path Algorithm Implementation
**Phase:** 2
**Dependencies:** Phase 1 Complete
**Assigned To:** Backend Engineer
**Estimated Effort:** 2 days

- [ ] 9.0 Complete shortest path optimization system
  - [ ] 9.1 Write 2-8 focused tests for shortest path
    - Limit to 2-8 highly focused tests maximum
    - Test shortest path calculation between two nodes
    - Test comparing actual vs optimal paths
    - Test point savings calculation
    - Skip exhaustive graph traversal scenarios
  - [ ] 9.2 Implement shortest path algorithm
    - Create findShortestPath(graph, startNode, endNode) method
    - Use Dijkstra's algorithm or BFS for unweighted graph
    - Handle disconnected nodes (no valid path)
    - Return path as array of node IDs
    - Optimize for performance (<100ms for typical trees)
  - [ ] 9.3 Calculate shortest paths to all destinations
    - Create calculateOptimalPaths(graph, startNode, destinations) method
    - Find shortest path from start to each keystone/notable/jewel
    - Store optimal path lengths for comparison
    - Return map of destination -> shortest path
  - [ ] 9.4 Compare actual paths vs optimal paths
    - Create comparePathEfficiency(actualPaths, optimalPaths) method
    - Calculate difference in points for each destination
    - Identify paths that could save points (>1 point difference)
    - Calculate total potential point savings
    - Return inefficiency report
  - [ ] 9.5 Run shortest path tests
    - Run ONLY the 2-8 tests written in Task 9.1
    - Verify algorithm correctness and performance
    - Do NOT run entire test suite at this stage

**Acceptance Criteria:**
- The 2-8 tests written in Task 9.1 pass
- Shortest path algorithm produces correct results
- Actual vs optimal comparison accurate
- Performance acceptable (<100ms per calculation)
- Point savings calculated correctly

**Technical Notes:**
- Reference spec.md lines 70-76 for algorithmic optimization
- Consider using existing graph libraries if available
- Passive tree is undirected graph (edges bidirectional)
- Handle edge case: multiple equally short paths

---

### Task Group 10: Point Efficiency Scoring
**Phase:** 2
**Dependencies:** Task Group 9
**Assigned To:** Backend Engineer
**Estimated Effort:** 1.5 days

- [ ] 10.0 Complete point efficiency analysis
  - [ ] 10.1 Write 2-8 focused tests for efficiency scoring
    - Limit to 2-8 highly focused tests maximum
    - Test calculating stats per point for nodes
    - Test identifying low-efficiency nodes
    - Test high-value notable recommendations
    - Skip exhaustive stat combinations
  - [ ] 10.2 Implement stats-per-point calculation
    - Create calculateNodeEfficiency(node: PassiveTreeNode) method
    - Parse node stats and assign value scores
    - Calculate efficiency metric (value per point = stats / 1)
    - Handle nodes with multiple stat types
    - Return efficiency score for each node
  - [ ] 10.3 Identify low-efficiency nodes
    - Create identifyLowEfficiencyNodes(allocatedNodes) method
    - Score each allocated node's efficiency
    - Flag nodes with minimal stats (pure pathing nodes)
    - Flag nodes with stats not aligned with build archetype
    - Return list of low-efficiency nodes with scores
  - [ ] 10.4 Recommend high-value notables within reach
    - Create recommendNearbyNotables(allocatedNodes, treeData, archetype) method
    - Find notables within 3-5 points of allocated nodes
    - Filter notables by archetype relevance
    - Score notables by efficiency and synergy
    - Return top 3-5 recommendations with point costs
  - [ ] 10.5 Run efficiency scoring tests
    - Run ONLY the 2-8 tests written in Task 10.1
    - Verify scoring logic and recommendations
    - Do NOT run entire test suite at this stage

**Acceptance Criteria:**
- The 2-8 tests written in Task 10.1 pass
- Efficiency scores calculated reasonably
- Low-efficiency nodes identified accurately
- Recommendations relevant to build archetype
- Point costs for recommendations accurate

**Technical Notes:**
- Reference spec.md lines 82-86 for efficiency recommendations
- Start with simple stat value heuristics (refine with feedback)
- Consider defensive vs offensive balance based on archetype
- Recommend only unallocated nodes

---

### Task Group 11: AI-Driven Contextual Suggestions
**Phase:** 2
**Dependencies:** Task Groups 9-10
**Assigned To:** Backend Engineer
**Estimated Effort:** 1.5 days

- [ ] 11.0 Complete AI contextual optimization suggestions
  - [ ] 11.1 Write 2-8 focused tests for AI suggestions
    - Limit to 2-8 highly focused tests maximum
    - Test suggestion generation format
    - Test integration with existing tree analysis
    - Skip testing AI reasoning quality (manual validation)
  - [ ] 11.2 Structure tree data for AI reasoning
    - Create prepareTreeDataForAI(treeAnalysis, algorithmic suggestions) method
    - Format tree data in AI-friendly structure
    - Include archetype context
    - Include algorithmic findings (inefficiencies, recommendations)
    - Include build goals if detectable from notes/config
    - Return structured prompt data
  - [ ] 11.3 Enable AI suggestion generation in output
    - Update formatTreeAnalysis() to include "Optimization Suggestions" subsection
    - Provide context to AI via structured data in response
    - Allow AI to generate suggestions based on:
      - Detected archetype
      - Inefficient pathing
      - Missing defensive/offensive nodes
      - Build goals
    - Format suggestions as bulleted recommendations
  - [ ] 11.4 Combine algorithmic and AI suggestions
    - Merge algorithmic point savings with AI contextual advice
    - Prioritize suggestions by impact and relevance
    - Remove duplicate or conflicting suggestions
    - Limit to top 5-7 actionable suggestions
    - Return formatted combined suggestions
  - [ ] 11.5 Run AI suggestion tests
    - Run ONLY the 2-8 tests written in Task 11.1
    - Verify suggestion formatting and integration
    - Do NOT run entire test suite at this stage

**Acceptance Criteria:**
- The 2-8 tests written in Task 11.1 pass
- Tree data structured for AI reasoning
- AI suggestions integrate with algorithmic findings
- Combined suggestions actionable and relevant
- Output clear and prioritized

**Technical Notes:**
- Reference spec.md lines 77-81 for AI-driven suggestions
- AI suggestions generated by Claude based on provided context
- MCP allows AI to reason over structured data in responses
- Focus on providing good context, not controlling AI output

---

### Task Group 12: Recommendation Formatting & Output
**Phase:** 2
**Dependencies:** Task Groups 9-11
**Assigned To:** Backend Engineer
**Estimated Effort:** 1 day

- [ ] 12.0 Complete optimization recommendation formatting
  - [ ] 12.1 Write 2-8 focused tests for recommendation formatting
    - Limit to 2-8 highly focused tests maximum
    - Test suggestion output format
    - Test prioritization logic
    - Skip testing all possible suggestion types
  - [ ] 12.2 Design optimization suggestions section format
    - Add "=== Optimization Suggestions ===" subsection to tree output
    - Include algorithmic suggestions (path savings)
    - Include AI contextual suggestions
    - Include high-value notable recommendations
    - Format as bulleted list with point costs
    - Reference spec example for formatting consistency
  - [ ] 12.3 Implement suggestion prioritization
    - Create prioritizeSuggestions(suggestions) method
    - Sort by impact: point savings > defensive gaps > offensive improvements
    - Limit to top 5-7 suggestions to avoid overwhelming user
    - Return prioritized list
  - [ ] 12.4 Add actionable details to suggestions
    - Include specific node names to allocate/remove
    - Include point costs for changes
    - Include expected stat impact if calculable
    - Make suggestions specific, not generic advice
  - [ ] 12.5 Integrate into tree analysis output
    - Update formatTreeAnalysis() to include optimization section
    - Place after pathing efficiency summary
    - Maintain consistent formatting with rest of output
  - [ ] 12.6 Run recommendation formatting tests
    - Run ONLY the 2-8 tests written in Task 12.1
    - Verify output formatting and prioritization
    - Do NOT run entire test suite at this stage

**Acceptance Criteria:**
- The 2-8 tests written in Task 12.1 pass
- Optimization section formatted clearly
- Suggestions actionable with specific details
- Prioritization logical and helpful
- Output integrates seamlessly with Phase 1 analysis

**Technical Notes:**
- Reference spec.md lines 498-503 for recommendation formatting
- Keep suggestions concise (1-2 sentences each)
- Use consistent bullet point formatting
- Test with various build types to ensure relevance

---

### Task Group 13: Phase 2 Testing & Quality Assurance
**Phase:** 2
**Dependencies:** Task Groups 9-12
**Assigned To:** QA / Test Engineer
**Estimated Effort:** 1 day

- [ ] 13.0 Review and fill critical Phase 2 testing gaps
  - [ ] 13.1 Review existing tests from Task Groups 9-12
    - Review 2-8 tests from Task 9.1 (shortest path)
    - Review 2-8 tests from Task 10.1 (efficiency scoring)
    - Review 2-8 tests from Task 11.1 (AI suggestions)
    - Review 2-8 tests from Task 12.1 (recommendation formatting)
    - Total new tests: approximately 8-32 tests
  - [ ] 13.2 Analyze test coverage gaps for Phase 2 only
    - Identify critical optimization workflows lacking coverage
    - Focus on integration of Phase 2 features with Phase 1
    - Prioritize end-to-end optimization suggestion workflows
  - [ ] 13.3 Write up to 10 additional strategic tests maximum
    - Test complete analyze_build with optimization suggestions
    - Test suggestion relevance for different archetypes
    - Test edge cases: minimal tree, fully optimized tree
    - Test performance with complex trees
    - Do NOT write comprehensive coverage for all scenarios
  - [ ] 13.4 Run Phase 2 feature-specific tests only
    - Run tests for Phase 2 features plus integration with Phase 1
    - Expected total new tests: approximately 18-42 tests
    - Verify optimization suggestions work end-to-end
    - Do NOT run entire application test suite

**Acceptance Criteria:**
- All Phase 2 feature-specific tests pass (18-42 new tests)
- Critical optimization workflows covered
- No more than 10 additional tests added
- Testing focused on Phase 2 features
- Integration with Phase 1 verified

**Technical Notes:**
- Use diverse build examples for testing (various archetypes)
- Validate suggestion quality manually with experienced players
- Test performance with large fully-allocated trees
- Ensure suggestions don't break with edge case builds

---

### PHASE 2 COMPLETION CHECKPOINT

**Phase 2 Deliverables:**
- Shortest path algorithm calculating optimal routes
- Point efficiency scoring identifying improvements
- AI-driven contextual suggestions
- Combined recommendation system
- Formatted optimization output in analyze_build

**Success Criteria:**
- Optimization suggestions save 1-2+ points on average builds
- Suggestions relevant to detected archetype
- No false positive recommendations (bad advice)
- Performance still acceptable (<1 second total for analysis)

**Before Moving to Phase 3:**
- Gather user feedback on optimization quality
- Validate suggestions with experienced players
- Refine prioritization based on feedback
- Confirm performance targets met

---

### PHASE 3: ADVANCED FEATURES (Week 2-3)

---

### Task Group 14: Tree Comparison Tool
**Phase:** 3
**Dependencies:** Phase 2 Complete
**Assigned To:** Backend Engineer
**Estimated Effort:** 2 days

- [ ] 14.0 Complete passive tree comparison feature
  - [ ] 14.1 Write 2-8 focused tests for tree comparison
    - Limit to 2-8 highly focused tests maximum
    - Test comparing two builds' passive trees
    - Test difference highlighting
    - Test efficiency comparison
    - Skip exhaustive comparison scenarios
  - [ ] 14.2 Create compare_trees MCP tool definition
    - Add new tool to ListToolsRequestSchema handler
    - Define inputSchema: build1, build2 parameters
    - Write clear tool description
    - Reference spec.md lines 605-624 for tool signature
  - [ ] 14.3 Implement tree comparison logic
    - Create handleCompareTrees(build1Name, build2Name) method
    - Parse passive trees from both builds
    - Calculate differences in allocated nodes
    - Identify unique keystones per build
    - Identify unique notables per build
    - Calculate point allocation differences
  - [ ] 14.4 Compare point efficiency between builds
    - Use efficiency scoring from Phase 2
    - Calculate overall efficiency score for each build
    - Compare pathing efficiency
    - Compare stats-per-point ratios
    - Identify which build is more optimized
  - [ ] 14.5 Format comparison output
    - Create formatTreeComparison() method
    - Show side-by-side summary:
      - Total points allocated
      - Keystones (unique and shared)
      - Notable count and key differences
      - Efficiency scores
      - Archetype differences
    - Highlight meaningful differences
    - Reference spec format for consistency
  - [ ] 14.6 Register tool handler
    - Add case in CallToolRequestSchema handler
    - Call handleCompareTrees() with build names
    - Return formatted comparison output
  - [ ] 14.7 Run tree comparison tests
    - Run ONLY the 2-8 tests written in Task 14.1
    - Verify comparison accuracy
    - Do NOT run entire test suite at this stage

**Acceptance Criteria:**
- The 2-8 tests written in Task 14.1 pass
- compare_trees tool registered and callable
- Comparison highlights meaningful differences
- Efficiency comparison accurate
- Output clear and easy to understand

**Technical Notes:**
- Reference spec.md lines 89-95 for comparison requirements
- Reuse tree analysis logic from Phase 1
- Consider using Set operations for node differences
- Keep output concise (focus on key differences)

---

### Task Group 15: What-If Allocation Testing
**Phase:** 3
**Dependencies:** Phase 2 Complete
**Assigned To:** Backend Engineer
**Estimated Effort:** 2.5 days

- [ ] 15.0 Complete what-if allocation testing feature
  - [ ] 15.1 Write 2-8 focused tests for what-if testing
    - Limit to 2-8 highly focused tests maximum
    - Test parsing hypothetical changes from natural language
    - Test stat impact calculations
    - Test point cost calculations
    - Skip testing all possible allocation scenarios
  - [ ] 15.2 Create test_allocation MCP tool definition
    - Add new tool to ListToolsRequestSchema handler
    - Define inputSchema: build_name, changes parameters
    - Support natural language changes description
    - Write clear tool description and examples
    - Reference spec.md lines 626-652 for tool signature
  - [ ] 15.3 Implement natural language change parsing
    - Create parseAllocationChanges(changes: string) method
    - Parse common patterns:
      - "allocate [keystone name]"
      - "remove [node name]"
      - "reallocate from [X] to [Y]"
      - "add [notable cluster name]"
    - Extract node names and actions
    - Handle ambiguous requests gracefully
    - Return structured change operations
  - [ ] 15.4 Calculate stat impacts of hypothetical changes
    - Create calculateStatImpact(build, changes) method
    - Add/remove nodes from temporary tree copy
    - Recalculate stats with changes applied
    - Compare before vs after stats
    - Calculate net change for key stats (life, DPS, resistances)
    - Return stat delta report
  - [ ] 15.5 Calculate point costs for changes
    - Estimate points needed for new allocations
    - Calculate shortest path to new nodes
    - Subtract points freed from removed nodes
    - Calculate net point cost
    - Flag if change exceeds available points
  - [ ] 15.6 Format what-if test results
    - Create formatWhatIfResults() method
    - Show before/after comparison:
      - Allocated points (before -> after)
      - Key stat changes (with +/- indicators)
      - Point cost breakdown
      - Feasibility (possible at current level?)
    - Include recommendations if change inefficient
  - [ ] 15.7 Register tool handler
    - Add case in CallToolRequestSchema handler
    - Call handleTestAllocation() with parameters
    - Return formatted what-if results
  - [ ] 15.8 Run what-if testing tests
    - Run ONLY the 2-8 tests written in Task 15.1
    - Verify parsing and calculations
    - Do NOT run entire test suite at this stage

**Acceptance Criteria:**
- The 2-8 tests written in Task 15.1 pass
- test_allocation tool registered and callable
- Natural language parsing handles common patterns
- Stat impact calculations accurate
- Point costs calculated correctly
- Output shows clear before/after comparison

**Technical Notes:**
- Reference spec.md lines 96-101 for what-if requirements
- Natural language parsing can be simple (keyword matching)
- Consider using AI to interpret complex change requests
- Stat calculation may require PoB stat formulas (simplified estimates acceptable)

---

### Task Group 16: Build-from-Scratch Planning
**Phase:** 3
**Dependencies:** Phase 2 Complete
**Assigned To:** Backend Engineer
**Estimated Effort:** 3 days

- [ ] 16.0 Complete build-from-scratch planning feature
  - [ ] 16.1 Write 2-8 focused tests for build planning
    - Limit to 2-8 highly focused tests maximum
    - Test pathing to desired keystones
    - Test level-by-level allocation recommendations
    - Test respecting point budgets
    - Skip testing all possible build paths
  - [ ] 16.2 Design build planning tool interface
    - Decide: extend existing tool or create new plan_tree tool
    - Define input parameters:
      - Starting class
      - Desired keystones
      - Build archetype (user-specified)
      - Target level
    - Plan natural language interface for build goals
  - [ ] 16.3 Implement efficient pathing to desired keystones
    - Create planPathToKeystones(startClass, keystones) method
    - Calculate shortest paths to all desired keystones
    - Optimize route to minimize total points
    - Consider picking up valuable notables along the way
    - Return recommended node allocation sequence
  - [ ] 16.4 Recommend notable clusters based on archetype
    - Create recommendNotablesForArchetype(archetype, pathNodes) method
    - Suggest high-value notables near planned path
    - Filter by archetype relevance
    - Prioritize defensive and offensive balance
    - Return list of recommended notable clusters
  - [ ] 16.5 Generate level-by-level allocation plan
    - Create generateLevelingPlan(plannedNodes, startLevel, targetLevel) method
    - Allocate points by priority:
      - Early levels: damage and survivability basics
      - Mid levels: core keystones
      - Late levels: optimization and jewel sockets
    - Show allocation order with level milestones
    - Return leveling plan text
  - [ ] 16.6 Format build planning output
    - Create formatBuildPlan() method
    - Show:
      - Target build summary (keystones, archetype)
      - Total point budget
      - Recommended pathing route
      - Notable clusters to take
      - Level-by-level allocation order
    - Make output actionable and easy to follow
  - [ ] 16.7 Implement and register tool handler
    - Add new tool or extend analyze_build with planning mode
    - Implement handlePlanTree() or similar
    - Return formatted build plan
  - [ ] 16.8 Run build planning tests
    - Run ONLY the 2-8 tests written in Task 16.1
    - Verify pathing and recommendations
    - Do NOT run entire test suite at this stage

**Acceptance Criteria:**
- The 2-8 tests written in Task 16.1 pass
- Build planning tool accessible via MCP
- Pathing to keystones efficient
- Notable recommendations relevant
- Leveling plan practical and prioritized
- Output clear and actionable

**Technical Notes:**
- Reference spec.md lines 102-106 for planning requirements
- Starting class determines initial node position on tree
- Consider popular build paths for common archetypes
- Leveling plan should be flexible, not rigid

---

### Task Group 17: Phase 3 Testing & Quality Assurance
**Phase:** 3
**Dependencies:** Task Groups 14-16
**Assigned To:** QA / Test Engineer
**Estimated Effort:** 1.5 days

- [ ] 17.0 Review and fill critical Phase 3 testing gaps
  - [ ] 17.1 Review existing tests from Task Groups 14-16
    - Review 2-8 tests from Task 14.1 (tree comparison)
    - Review 2-8 tests from Task 15.1 (what-if testing)
    - Review 2-8 tests from Task 16.1 (build planning)
    - Total new tests: approximately 6-24 tests
  - [ ] 17.2 Analyze test coverage gaps for Phase 3 only
    - Identify advanced feature workflows lacking coverage
    - Focus on integration of all three phases
    - Prioritize end-to-end advanced workflows
  - [ ] 17.3 Write up to 10 additional strategic tests maximum
    - Test compare_trees with significantly different builds
    - Test test_allocation with complex change requests
    - Test build planning for different classes/archetypes
    - Test integration of all features together
    - Do NOT write comprehensive coverage
  - [ ] 17.4 Run Phase 3 feature-specific tests only
    - Run tests for Phase 3 features plus integration with Phases 1-2
    - Expected total new tests: approximately 16-34 tests
    - Verify all advanced features work end-to-end
    - Do NOT run entire application test suite

**Acceptance Criteria:**
- All Phase 3 feature-specific tests pass (16-34 new tests)
- Advanced feature workflows covered
- No more than 10 additional tests added
- Integration across all phases verified
- Manual testing with real use cases completed

**Technical Notes:**
- Test with diverse build scenarios (various classes, archetypes)
- Validate tool outputs manually for quality
- Ensure performance acceptable even with advanced features
- Document any known limitations or edge cases

---

### Task Group 18: Documentation & Finalization
**Phase:** 3
**Dependencies:** Task Group 17
**Assigned To:** Technical Writer / Engineer
**Estimated Effort:** 1 day

- [ ] 18.0 Complete feature documentation and finalization
  - [ ] 18.1 Document new MCP tools in README
    - Update project README.md with Phase 3 tools
    - Document compare_trees tool usage
    - Document test_allocation tool usage
    - Document build planning tool usage (if separate tool)
    - Include example usage for each tool
  - [ ] 18.2 Create troubleshooting guide
    - Document common errors and solutions:
      - Tree data fetch failures
      - Invalid node ID errors
      - Version mismatch warnings
      - Performance issues
    - Include resolution steps for each
    - Add to spec folder or README
  - [ ] 18.3 Document tree data source and format
    - Record PoB GitHub repository URL and file paths
    - Document tree data structure and schema
    - Note version compatibility and update process
    - Add to spec folder for future maintainers
  - [ ] 18.4 Create usage examples and demos
    - Prepare example PoB build files for testing
    - Write example conversation flows showing features
    - Document expected outputs for common scenarios
    - Add examples to spec folder or README
  - [ ] 18.5 Final performance validation
    - Measure end-to-end analyze_build time (should be <1-2 seconds)
    - Measure tree data fetch time (should be <5 seconds first time)
    - Measure memory usage (should be <30MB with cache)
    - Document performance metrics
  - [ ] 18.6 Create feature changelog
    - Document all Phase 1, 2, 3 features added
    - Note breaking changes or behavioral changes
    - Include migration notes if applicable
    - Add to spec folder

**Acceptance Criteria:**
- All tools documented clearly in README
- Troubleshooting guide covers common issues
- Tree data source documented for maintainability
- Usage examples provided and tested
- Performance validated and documented
- Changelog complete and accurate

**Technical Notes:**
- Reference spec.md success criteria (lines 1131-1203)
- Include screenshots or output examples if helpful
- Keep documentation concise and practical
- Update ROADMAP.md if feature affects roadmap

---

### PHASE 3 COMPLETION CHECKPOINT

**Phase 3 Deliverables:**
- compare_trees tool for build comparisons
- test_allocation tool for what-if testing
- Build-from-scratch planning tool or feature
- Complete documentation
- All tests passing (all phases)

**Success Criteria:**
- All advanced features functional and tested
- User feedback positive on feature utility
- Performance targets met across all features
- Documentation complete and helpful
- Feature ready for production use

---

## Task Execution Guidelines

### General Principles

1. **Follow Phase Order Strictly:**
   - Complete Phase 1 fully before Phase 2
   - Complete Phase 2 fully before Phase 3
   - Each phase builds on previous phase foundations

2. **Minimal Test Writing During Development:**
   - Write only 2-8 focused tests per task group
   - Run ONLY the tests for current task group (not entire suite)
   - Add maximum 10 additional tests when filling gaps
   - Total tests per phase should be 20-60, not hundreds

3. **Incremental Integration:**
   - Integrate features into analyze_build as built
   - Test integration at each milestone
   - Maintain backward compatibility with existing features

4. **Performance Monitoring:**
   - Track analysis time at each phase
   - Optimize if exceeding targets (Phase 1: <500ms, Phase 2: <1s)
   - Memory usage should stay under 30MB

5. **User Feedback Loops:**
   - Gather feedback after Phase 1 before Phase 2
   - Adjust priorities based on user needs
   - Validate archetype detection and suggestions with real users

### Risk Mitigation

- **Data Source Changes:** Abstract data fetching behind interface to support multiple sources
- **Performance Issues:** Profile code if slow, optimize hot paths
- **Accuracy Concerns:** Validate suggestions with experienced players before release
- **Scope Creep:** Defer non-critical features to future phases or separate specs

### Communication

- Update spec folder with findings during implementation
- Document any deviations from spec with rationale
- Flag blockers or risks to team immediately
- Celebrate milestone completions (each phase checkpoint)

---

## Appendix

### Key Spec References

- **Data Source Strategy:** spec.md lines 172-194
- **Passive Tree Data Structure:** spec.md lines 198-224
- **Parsing Implementation:** spec.md lines 226-261
- **Caching Strategy:** spec.md lines 262-289
- **Error Handling:** spec.md lines 290-330, 848-1030
- **Integration with analyze_build:** spec.md lines 354-416
- **Testing Strategy:** spec.md lines 654-748
- **Performance Requirements:** spec.md lines 770-843
- **Success Criteria:** spec.md lines 1131-1203

### Existing Codebase References

- **XML Parsing:** src/index.ts lines 81-84
- **Build Cache Pattern:** src/index.ts lines 61, 393-415
- **Tool Registration:** src/index.ts lines 233-329
- **Tool Handlers:** src/index.ts lines 332-380
- **Output Formatting:** src/index.ts lines 417-480

### Testing Resources

- **Test Writing Standards:** agent-os/standards/testing/test-writing.md
- **Tech Stack:** agent-os/standards/global/tech-stack.md (needs completion)
- **User Instructions:** ~/.claude/CLAUDE.md (avoid running npm run dev yourself)

### Dependencies

- **Runtime:** Node.js with TypeScript
- **Existing Libraries:** fast-xml-parser, chokidar, @modelcontextprotocol/sdk
- **New Libraries (if needed):**
  - HTTP client (native Node.js https or node-fetch)
  - Lua parser (if tree data in Lua format)
  - Graph algorithms library (optional, can implement manually)
  - Test framework (Jest, Mocha - add to package.json if not present)

---

**End of Tasks Breakdown**

This comprehensive tasks list provides a strategic, phased approach to implementing Enhanced Passive Tree Analysis with clear dependencies, acceptance criteria, and guidance for successful execution.
