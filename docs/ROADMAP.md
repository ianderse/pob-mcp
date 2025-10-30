# Path of Building MCP Server - Development Roadmap

## Overview

This roadmap outlines the development plan for enhancing the PoB MCP Server from basic build file reading to advanced real-time integration with the Path of Building application.

---

## Phase 1: File Watching (Near-term)

**Goal:** Enable real-time updates when builds are saved in PoB

### Features
- Monitor the builds directory for file changes
- Auto-reload builds when PoB saves changes
- Notify Claude when builds are updated
- Cache parsed builds for performance

### Technical Implementation
- Use Node.js `fs.watch()` or `chokidar` library
- Implement file change debouncing (PoB may write multiple times)
- Add build cache with invalidation on file changes
- Add MCP notification system for build updates

### New Tools/Capabilities
- `watch_builds` - Start monitoring builds directory
- `get_recent_changes` - List recently modified builds
- Auto-notification to Claude when active build changes

### Success Criteria
- ✅ Changes in PoB reflect in Claude within 2 seconds
- ✅ No performance degradation with 100+ builds
- ✅ Proper handling of rapid successive saves

**Estimated Effort:** 2-3 days

---

## Phase 2: Enhanced Parsing (Near-term)

**Goal:** Parse complex build data beyond basic stats

### 2.1 Passive Skill Tree Parsing

**Features:**
- Extract allocated passive nodes
- Parse jewel sockets and socketed jewels
- Identify keystones and notable passives
- Calculate total passive points spent
- Detect Cluster Jewel setups

**Data to Extract:**
```xml
<Tree>
  <Spec nodes="1234,5678,9012,...">
  <URL>https://www.pathofexile.com/passive-skill-tree/...</URL>
```

**New Capabilities:**
- Identify build archetype from keystones (crit, RT, CI, etc.)
- Count points in defensive vs offensive nodes
- Detect common passive clusters (life wheel, crit multi, etc.)

### 2.2 Jewel Parsing

**Features:**
- Parse regular jewels (Abyss, Prismatic, etc.)
- Parse Cluster Jewels (small, medium, large)
- Extract jewel mods and notables
- Detect valuable jewel combinations

### 2.3 Flask Parsing

**Features:**
- Extract flask types and rarities
- Parse flask mods and quality
- Identify unique flasks
- Detect flask synergies (uptime, charges, etc.)

### 2.4 Configuration Parsing

**Features:**
- Extract active configuration settings (Flasks up, Full Life, etc.)
- Parse enemy configuration (Boss, Map Boss, etc.)
- Identify conditional modifiers

### Success Criteria
- ✅ Full passive tree analysis with keystones identified
- ✅ All jewels parsed with mods extracted
- ✅ Flask setup completely analyzed
- ✅ Configuration state properly captured

**Estimated Effort:** 5-7 days

---

## Phase 3: Validation & Optimization (Near-term)

**Goal:** Provide intelligent build analysis and suggestions

### 3.1 Build Validation

**Features:**
- Detect common mistakes:
  - Resistance gaps (< 75% in maps)
  - Low life/ES pool for content level
  - Missing ailment immunities
  - Insufficient accuracy
  - Mana sustain issues
- Flag dangerous configurations:
  - No life/ES regeneration
  - Missing defense layers
  - Single-element damage (no penetration)

### 3.2 Optimization Suggestions

**Features:**
- Gem link optimization:
  - Suggest better support gems
  - Identify gem level breakpoints
  - Recommend quality priorities
- Gear upgrade paths:
  - Identify weak item slots
  - Suggest stat priorities
  - Flag missing key uniques
- Passive tree optimization:
  - Suggest efficient pathing
  - Identify wasted points
  - Recommend better notable clusters
- Flask optimization:
  - Suggest flask types for build archetype
  - Identify missing utility flasks
  - Recommend flask mods

### 3.3 Build Scoring

**Features:**
- Calculate build completeness score
- Offense rating (DPS, clear speed)
- Defense rating (EHP, mitigation layers)
- QoL rating (movement speed, flask uptime)

### New Tools
- `validate_build` - Run validation checks
- `suggest_improvements` - Get optimization suggestions
- `score_build` - Get comprehensive build scoring
- `compare_to_archetype` - Compare against meta builds

### Success Criteria
- ✅ Catches 90%+ of common build mistakes
- ✅ Provides actionable optimization suggestions
- ✅ Scoring system correlates with build viability
- ✅ Suggestions are appropriate for build archetype

**Estimated Effort:** 7-10 days

---

## Phase 4: Advanced Item Parsing (Near-term)

**Goal:** Deep item analysis with mod parsing and value assessment

### 4.1 Item Mod Parsing

**Features:**
- Parse all item mods (prefix/suffix)
- Extract mod tiers and ranges
- Identify crafted mods
- Detect influenced items (Shaper, Elder, etc.)
- Parse corruption implicits

**Example Item Format:**
```xml
<Item>
Rare Helmet
Hubris Circlet
+90 to maximum Life
+45% to Fire Resistance
+38% to Cold Resistance
+12% to Chaos Resistance
</Item>
```

### 4.2 Item Valuation

**Features:**
- Identify valuable mod combinations
- Detect mirror-tier items
- Flag items needing upgrades
- Suggest crafting improvements
- Identify missing key stats

### 4.3 Unique Item Analysis

**Features:**
- Parse unique item special mods
- Identify build-enabling uniques
- Detect unique item synergies
- Flag incorrect unique choices for build type

### 4.4 Item Set Analysis

**Features:**
- Detect item set bonuses (influenced items)
- Identify gear synergies
- Calculate total stats from all items
- Flag conflicting mods

### New Tools
- `analyze_item` - Deep dive into specific item
- `suggest_upgrades` - Recommend item upgrades
- `find_bottleneck` - Identify weakest gear slot
- `calculate_gear_value` - Estimate gear investment level

### Success Criteria
- ✅ All item mods correctly parsed and categorized
- ✅ Accurate identification of upgrade priorities
- ✅ Valuable mod combinations detected
- ✅ Crafting suggestions are reasonable

**Estimated Effort:** 5-7 days

---

## Near-Term Summary

**Total Estimated Effort:** 19-27 days (4-6 weeks)

**Phases 1-4 Deliverables:**
- Real-time build monitoring
- Complete build data extraction (passives, jewels, flasks, items)
- Intelligent validation and optimization system
- Advanced item analysis and recommendations

**At this point, the MCP server will be a comprehensive PoB analysis tool working with static build files.**

---

## Phase 5: Lua API Integration (Long-term)

**Goal:** Enable direct communication with running Path of Building application

### 5.1 Research & Design

**Tasks:**
- Study PoB's Lua API and plugin architecture
- Analyze PoB's file structure (`/lua`, `/src`, `/runtime`)
- Identify extension points for plugins
- Design IPC mechanism (HTTP, WebSocket, or named pipes)
- Plan data serialization format (JSON)

**Key Questions to Answer:**
- How do PoB plugins load and initialize?
- Can we hook into build calculation events?
- What data is accessible from Lua context?
- How to handle PoB versioning?

**Deliverables:**
- Technical design document
- Proof-of-concept PoB plugin
- IPC protocol specification

**Estimated Effort:** 5-7 days

### 5.2 PoB Plugin Development

**Goal:** Create a companion PoB plugin that exposes live data

**Features:**
- Load current build data in real-time
- Expose build calculations via API
- Trigger PoB calculations on demand
- Listen for build change events
- Export data in structured format

**Plugin Capabilities:**
```lua
-- Example plugin API
PoBMCP.getCurrentBuild()
PoBMCP.getCalculatedStats()
PoBMCP.getSkillDPS(skillIndex)
PoBMCP.onBuildChanged(callback)
PoBMCP.modifyBuild(changes)
```

**Communication Layer:**
- Option A: HTTP server in PoB (lightweight, cross-platform)
- Option B: WebSocket server (real-time, bidirectional)
- Option C: Named pipes (fast, local-only)

**Recommended:** HTTP server (easiest to implement and debug)

**Plugin Structure:**
```
pob-mcp-plugin/
├── manifest.xml         # Plugin metadata
├── init.lua            # Plugin initialization
├── server.lua          # HTTP server (using LuaSocket)
├── api.lua             # API endpoints
└── utils.lua           # Helper functions
```

**Estimated Effort:** 10-14 days

### 5.3 MCP Server Integration

**Goal:** Update MCP server to consume live PoB data

**Features:**
- Connect to PoB plugin HTTP server
- Poll for build updates or use webhooks
- Maintain connection state
- Fallback to file-based reading if PoB not running
- Handle multiple PoB instances

**New Architecture:**
```
MCP Server
├── File Reader (existing)
├── PoB Client (new)
│   ├── HTTP client
│   ├── Connection manager
│   └── Data transformer
└── Unified Build Provider
    └── Returns build data from either source
```

**New Capabilities:**
- Real-time DPS calculations
- Instant build modifications
- Live stat previews
- "What-if" scenario testing

**New Tools:**
- `pob_status` - Check if PoB is running and connected
- `get_live_build` - Get currently open build in PoB
- `calculate_dps` - Trigger DPS calculation in PoB
- `modify_build` - Make changes in PoB programmatically
- `test_item_swap` - Preview stats with different item

**Estimated Effort:** 7-10 days

### 5.4 Advanced Live Features

**Goal:** Leverage real-time PoB connection for powerful features

**Features:**

1. **Interactive Build Editing**
   - Modify passive tree from Claude
   - Swap items and see impact
   - Test gem link variations
   - Preview gear upgrades

2. **Build Optimization Engine**
   - Automated passive tree optimization
   - Find best DPS gem links
   - Simulate item upgrades
   - Test defense layer effectiveness

3. **Scenario Testing**
   - Compare boss DPS vs clear DPS
   - Test build at different levels
   - Simulate different gear budgets
   - Compare map mod resistance

4. **Build Import/Export**
   - Import builds from PoB URLs
   - Export optimized builds
   - Share builds via Claude
   - Generate build guides

**New Tools:**
- `optimize_tree` - AI-driven passive tree optimization
- `test_scenario` - Run what-if scenarios
- `find_best_gems` - Brute-force best gem links
- `import_build_url` - Import from pobb.in or PoB URL
- `generate_guide` - Create build guide from current state

**Estimated Effort:** 14-21 days

### 5.5 Testing & Documentation

**Tasks:**
- End-to-end testing with real PoB
- Performance testing (response times, CPU usage)
- Error handling and recovery
- Cross-platform testing (Windows, Mac, Linux)
- User documentation
- Plugin installation guide
- Troubleshooting guide

**Estimated Effort:** 5-7 days

---

## Phase 5 Summary

**Total Estimated Effort:** 41-59 days (8-12 weeks)

**Phase 5 Deliverables:**
- PoB Lua plugin for live data exposure
- MCP server with real-time PoB integration
- Interactive build editing capabilities
- Advanced optimization and testing features
- Comprehensive documentation

---

## Complete Roadmap Timeline

| Phase | Focus | Duration | Cumulative |
|-------|-------|----------|------------|
| 1 | File Watching | 2-3 days | 2-3 days |
| 2 | Enhanced Parsing | 5-7 days | 7-10 days |
| 3 | Validation & Optimization | 7-10 days | 14-20 days |
| 4 | Advanced Item Parsing | 5-7 days | 19-27 days |
| 5 | Lua API Integration | 41-59 days | 60-86 days |

**Total Project Timeline:** 60-86 days (3-4 months)

---

## Implementation Order Rationale

1. **File Watching First** - Quick win, immediate UX improvement
2. **Enhanced Parsing** - Builds foundation for validation
3. **Validation & Optimization** - Provides value with existing data
4. **Item Parsing** - Completes static analysis capabilities
5. **Lua Integration** - Major undertaking, but enables transformative features

---

## Success Metrics

### Near-term (Phases 1-4)
- ✅ Real-time build updates < 2 seconds
- ✅ 100% of PoB data extracted and parsed
- ✅ 90%+ accuracy on build validation
- ✅ Actionable suggestions for 95% of builds
- ✅ User satisfaction: "This is useful!"

### Long-term (Phase 5)
- ✅ Live PoB connection established in < 1 second
- ✅ Build modifications reflect instantly in PoB
- ✅ Optimization suggestions improve builds measurably
- ✅ Zero crashes or data corruption
- ✅ User satisfaction: "This is game-changing!"

---

## Risk Mitigation

### Technical Risks
- **PoB updates breaking plugin:** Version detection and compatibility checks
- **Lua API limitations:** Extensive research phase to validate feasibility
- **Performance issues:** Caching, debouncing, and async operations
- **Cross-platform issues:** Test on all platforms early

### Product Risks
- **Feature creep:** Stick to roadmap, defer nice-to-haves
- **Scope too large:** Each phase delivers standalone value
- **User needs mismatch:** Gather feedback after each phase

---

## Future Considerations (Beyond Phase 5)

- Integration with poe.ninja for item pricing
- Integration with PoE Wiki for item/skill info
- Build sharing platform (save builds to cloud)
- AI-powered build generation from scratch
- Meta build database and comparisons
- Economy tracking (gear costs over league)
- Build analytics (most popular skills, items, etc.)

---

## Getting Started

**Current Status:** Phase 0 complete (basic MCP server working)

**Next Action:** Begin Phase 1 - File Watching

**To start development:**
```bash
# Create feature branch
git checkout -b feature/file-watching

# Install additional dependencies (if needed)
npm install chokidar --save

# Begin implementation in src/index.ts
```

---

**Let's build something amazing! 🚀**
