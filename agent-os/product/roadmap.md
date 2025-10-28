# Product Roadmap

## Executive Summary

This roadmap outlines the development path for Exile's AI Companion, progressing from foundational build file analysis to advanced real-time AI-powered optimization. The approach is deliberately incremental - each phase delivers standalone value while building toward the ultimate vision of an intelligent build optimization companion that works seamlessly with Path of Building.

**Completed Work:** Phases 0-1 establish the foundation with basic build reading and real-time file monitoring.

**Near-Term Focus:** Phases 2-4 complete comprehensive static analysis capabilities, enabling the AI to understand every aspect of a build and provide intelligent validation and optimization suggestions.

**Long-Term Vision:** Phase 5 integrates directly with Path of Building through Lua API, enabling real-time interaction, programmatic build modification, and automated optimization algorithms.

---

## Completed Phases

### Phase 0: Foundation (COMPLETE)
**Core MCP server infrastructure with basic build reading capabilities**

Established the foundation by implementing an MCP server that connects Claude Desktop to Path of Building files. Supports basic build reading, parsing XML structure, extracting stats, skills, and items, and providing summaries through natural language queries.

**Delivered:**
- MCP server with stdio transport
- XML parsing with fast-xml-parser
- Basic tools: list_builds, analyze_build, compare_builds, get_build_stats
- Build summary generation with class, level, stats, skills, items, and notes

### Phase 1: Real-Time File Monitoring (COMPLETE)
**Automatic build updates when saved in Path of Building**

Implemented intelligent file watching that detects changes within 2 seconds, provides recent change history, and automatically invalidates caches. Includes debouncing to handle Path of Building's multi-write save behavior gracefully.

**Delivered:**
- Chokidar-based file watching with configurable monitoring
- Intelligent build cache with automatic invalidation on file changes
- Tools: start_watching, stop_watching, watch_status, get_recent_changes
- 500ms debouncing for rapid successive saves
- Change history tracking (last 50 events)

---

## Development Roadmap

1. [ ] Enhanced Passive Tree Analysis - Complete passive skill tree parsing including allocated nodes, keystones, notable passives, jewel sockets, cluster jewel identification, and point investment analysis. Enables AI to understand build archetype and provide tree optimization suggestions. `M`

2. [ ] Comprehensive Jewel Parsing - Parse all jewel types (regular, abyss, cluster) with complete mod extraction, jewel socket placement analysis, and cluster jewel notable identification. Essential for understanding build power sources and optimization opportunities. `S`

3. [ ] Flask System Analysis - Extract flask types, mods, quality, and unique flask identification. Analyze flask synergies, uptime potential, and build-specific flask recommendations. Critical for defense and buff uptime validation. `S`

4. [ ] Configuration State Parsing - Parse active configuration settings (is enemy a boss, are flasks active, conditional buffs, etc.) to ensure DPS calculations reflect realistic scenarios. Required for accurate build validation. `XS`

5. [ ] Build Validation Engine - Implement intelligent validation that detects common mistakes including resistance gaps, insufficient life/ES pools, missing ailment immunities, accuracy problems, and mana sustain issues. Provide actionable fix suggestions with explanations. `M`

6. [ ] Optimization Suggestion System - AI-driven recommendations for gem link improvements, passive tree efficiency, defense layer additions, and stat priority guidance. Uses build context to provide relevant, prioritized suggestions. `L`

7. [ ] Advanced Item Mod Parsing - Deep item analysis including prefix/suffix identification, mod tier detection, influenced item recognition, corruption parsing, and crafted mod identification. Enables item upgrade recommendations. `M`

8. [ ] Item Valuation & Upgrade Paths - Identify valuable mod combinations, detect bottleneck gear slots, suggest crafting improvements, and provide tier-appropriate upgrade paths based on build goals and budget considerations. `M`

9. [ ] Build Scoring System - Comprehensive rating system that evaluates offense (DPS, clear speed), defense (EHP, mitigation layers, recovery), and quality-of-life (movement speed, flask uptime). Provides clear strengths/weaknesses analysis. `S`

10. [ ] Lua API Research & Design - Comprehensive research phase studying Path of Building's Lua plugin architecture, identifying extension points, designing IPC protocol (HTTP/WebSocket), and creating proof-of-concept plugin. Critical planning phase for live integration. `M`

11. [ ] Path of Building Lua Plugin - Develop companion PoB plugin that exposes live build data, calculation engine access, and build modification capabilities. Implements HTTP/WebSocket server for real-time communication with MCP server. `L`

12. [ ] Live Integration Bridge - Update MCP server to connect with PoB plugin, maintain connection state, provide fallback to file-based reading when PoB not running, and expose new tools for real-time interaction. `M`

> Notes
> - Items are ordered by technical dependencies and strategic path to mission achievement
> - Early items focus on comprehensive build understanding (read-only analysis)
> - Middle items add intelligent analysis and validation (AI-powered suggestions)
> - Later items enable real-time interaction and programmatic optimization (live integration)
> - Each item represents an end-to-end functional feature with both parsing and AI utilization

---

## Phase Dependencies & Rationale

### Why This Order?

**Items 1-4 (Enhanced Parsing):** Before the AI can provide intelligent suggestions, it needs complete visibility into all build aspects. These items work together to give Claude a comprehensive understanding of builds - passives, jewels, flasks, and configuration state. This is the foundation for all subsequent intelligence.

**Items 5-6 (Validation & Optimization):** With complete build data, we can now implement the core value proposition - intelligent analysis. Validation catches mistakes, optimization suggests improvements. These provide immediate value using only static file analysis.

**Items 7-9 (Advanced Analysis):** These items complete the static analysis capabilities with deep item understanding and comprehensive build scoring. At this point, Exile's AI Companion is a best-in-class build analysis tool even without live integration.

**Items 10-12 (Live Integration):** The final frontier - moving from read-only analysis to interactive optimization. This requires significant research and development but enables transformative features like real-time scenario testing and automated optimization algorithms.

### Strategic Milestones

**Milestone 1 (Items 1-4 Complete):** AI has complete build understanding
- Can see every aspect of a build including complex systems (cluster jewels, configuration)
- Ready to provide contextual, intelligent analysis
- Approximate timeline: 3-4 weeks from Phase 1

**Milestone 2 (Items 5-9 Complete):** Full-featured static analysis tool
- Detects common mistakes and provides optimization suggestions
- Scores builds comprehensively across multiple dimensions
- Identifies upgrade paths and item improvements
- Approximate timeline: 8-12 weeks from Phase 1

**Milestone 3 (Items 10-12 Complete):** Live interactive optimization
- Real-time connection with running Path of Building application
- Interactive build editing through conversation
- Automated optimization algorithms
- Scenario testing and what-if analysis
- Approximate timeline: 20-30 weeks from Phase 1

---

## Effort Estimates

- **XS (1 day):** Configuration parsing, simple data extraction
- **S (2-3 days):** Jewel parsing, flask analysis, build scoring
- **M (1 week):** Passive tree analysis, validation engine, item parsing, Lua research, live integration
- **L (2 weeks):** Optimization system, PoB plugin development
- **XL (3+ weeks):** Currently none - large efforts broken into smaller deliverables

**Total Estimated Effort:**
- Items 1-9 (Static Analysis Complete): 9-12 weeks
- Items 10-12 (Live Integration): 4-6 weeks
- **Full Roadmap: 13-18 weeks**

---

## Success Criteria

### Per-Phase Success

**Items 1-4 Success:**
- Parse 100% of PoB build data including complex nested structures
- Identify all keystones, cluster jewels, and configuration states
- Zero parsing errors on valid PoB build files
- AI can answer any question about build mechanics

**Items 5-9 Success:**
- Detect 90%+ of common build mistakes automatically
- Provide actionable suggestions for 95%+ of analyzed builds
- Build scores correlate with actual build viability
- Users report "helpful" suggestions at >85% rate

**Items 10-12 Success:**
- Live connection established in <1 second
- Build modifications reflect in PoB instantly
- Zero data corruption or crashes from plugin
- Users adopt live features at >50% rate

### Overall Product Success

- Active user base growing month-over-month
- Measurable improvements in build quality (DPS, EHP increases)
- Positive community reception and recommendations
- Technical performance meets targets (<3s response time, >70% cache hit rate)
- Foundation established for expansion to other gaming tools

---

## Risk Mitigation

**Technical Risks:**
- **Complex parsing requirements:** Incremental approach ensures each feature works before moving forward
- **PoB Lua API limitations:** Extensive research phase (item 10) validates feasibility before major investment
- **Performance degradation:** Caching, debouncing, and async operations designed in from the start
- **Cross-platform compatibility:** Early testing on Windows, Mac, Linux

**Product Risks:**
- **Feature creep:** Roadmap is locked; new ideas deferred to post-launch
- **User needs mismatch:** Each phase delivers value; user feedback collected continuously
- **Scope too ambitious:** Phases 1-9 deliver standalone value even if Phase 10-12 delayed

---

## Future Considerations (Beyond Current Roadmap)

Once the core roadmap is complete, potential expansions include:

- **Economy Integration:** Connect with poe.ninja for real-time item pricing and build cost estimation
- **Build Database:** Community build sharing platform with AI-powered search and recommendations
- **Meta Analysis:** Track popular builds, items, and passives across leagues with trend analysis
- **Guide Generation:** Automated build guide creation with leveling paths, gear progression, and detailed explanations
- **Multi-Build Portfolio:** Manage and compare entire build collections with portfolio-level analytics
- **League Starter Analysis:** Evaluate builds specifically for league start viability and SSF considerations

---

## Getting Started

**Current Status:** Phase 1 complete - file watching operational

**Next Action:** Begin Item 1 - Enhanced Passive Tree Analysis

**For Developers:**
```bash
# Verify current state
npm run build
npm test

# Start next feature branch
git checkout -b feature/passive-tree-analysis

# Implementation focuses on src/index.ts
# Add passive tree parsing to PoBBuild interface
# Implement passive node extraction and analysis
```

---

This roadmap represents a clear path from today's functional build reader to tomorrow's intelligent build optimization companion. Each phase builds on the previous, and each delivers value to users even if subsequent phases are delayed. The focus is relentlessly on enabling the AI to provide better, more intelligent assistance to Path of Exile players.
