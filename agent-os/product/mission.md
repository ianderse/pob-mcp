# Product Mission

## Pitch

**Exile's AI Companion** is an intelligent build assistant that helps Path of Exile players using Claude Desktop optimize, analyze, and fix their Path of Building builds through conversational AI-powered analysis. By seamlessly connecting Path of Building with Claude's advanced reasoning capabilities, players can receive expert-level build feedback, optimization suggestions, and error detection without leaving their natural workflow.

## Users

### Primary Customers

- **Path of Exile Players**: Players who use Path of Building (PoB) to plan and optimize character builds
- **Claude Desktop Users**: Technical users who want AI assistance integrated into their gaming tools
- **Build Theorycrafters**: Players who spend significant time creating and testing optimal builds

### User Personas

**Alex - The Competitive Player** (25-35)
- **Role:** Active PoE player pushing endgame content
- **Context:** Plays multiple builds per league, constantly optimizing for efficiency
- **Pain Points:**
  - Struggles to identify weak points in builds without extensive testing
  - Spends hours comparing gear options and passive tree paths
  - Misses subtle build errors that lead to deaths in difficult content
  - Difficult to validate if resistance caps and defense layers are sufficient
- **Goals:**
  - Quickly identify and fix build weaknesses before investing currency
  - Get expert-level optimization suggestions without consulting multiple wikis
  - Compare multiple build variations efficiently
  - Validate build viability for specific content types

**Sam - The Casual Optimizer** (30-45)
- **Role:** Weekend Path of Exile player with limited time
- **Context:** Follows build guides but wants to understand and improve them
- **Pain Points:**
  - Build guides are often outdated or incomplete
  - Doesn't understand why certain passive nodes or items are chosen
  - Makes mistakes when adapting builds to personal playstyle
  - Limited time to research optimal gem links and item combinations
- **Goals:**
  - Understand build mechanics through conversational explanations
  - Adapt existing builds to budget or playstyle preferences
  - Catch common mistakes before wasting currency
  - Learn build theory through AI-guided optimization

**Jordan - The Build Creator** (22-35)
- **Role:** Content creator and build designer
- **Context:** Creates original builds and publishes guides for the community
- **Pain Points:**
  - Testing multiple build variations is time-intensive
  - Difficult to calculate optimal DPS configurations without extensive testing
  - Needs to document build reasoning and trade-offs clearly
  - Wants to validate builds across different gear tiers and scenarios
- **Goals:**
  - Rapidly prototype and test build variations
  - Generate comprehensive build documentation and guides
  - Identify optimal passive tree paths algorithmically
  - Compare builds across multiple metrics simultaneously

## The Problem

### Build Optimization is Complex and Time-Consuming

Path of Exile builds involve hundreds of interconnected decisions - passive skill trees with over 1,300 nodes, dozens of gem combinations, complex item interactions, and multiple defense layers. Even experienced players struggle to identify optimal configurations or catch critical errors. Players spend hours manually comparing options in Path of Building, often missing non-obvious interactions or making suboptimal choices that only become apparent after significant currency investment.

**Traditional Approach:** Players must manually test every variation, consult wikis and spreadsheets, ask for help in forums, and learn through expensive trial-and-error in-game. Path of Building provides calculation capabilities but no intelligent analysis or guidance.

**Impact:** Players waste currency on flawed builds, abandon characters due to preventable issues, and miss opportunities to optimize their builds. New players are overwhelmed by complexity, and experienced players spend excessive time on tedious manual optimization.

**Our Solution:** Exile's AI Companion brings Claude's reasoning capabilities directly into the build planning process. Through natural conversation, players can ask "What's wrong with my defenses?", "How can I improve my DPS?", or "Compare these two passive tree options" and receive expert-level analysis instantly. The AI understands build context, recognizes common mistakes, suggests optimizations, and explains trade-offs in plain language.

### Build Errors Are Hard to Detect

Path of Building shows raw numbers but doesn't explain WHY a build might fail or identify subtle configuration errors. Players often discover problems only after investing significant time and currency into a character.

**Our Solution:** Automated validation detects common mistakes like insufficient resistances, missing defense layers, accuracy problems, and mana sustain issues. The AI provides actionable fix suggestions with clear explanations of why each issue matters.

### No Way to Test "What-If" Scenarios Efficiently

Testing different gear, passive tree allocations, or gem configurations requires manually making changes, checking stats, undoing changes, and repeating. Comparing multiple options is tedious and error-prone.

**Our Solution:** Conversational build comparisons allow players to ask "What if I used item X instead?" or "How much DPS would I gain from this passive cluster?" and receive instant analysis without manual reconfiguration.

## Differentiators

### AI-Powered Contextual Analysis

Unlike traditional build tools that only display numbers, Exile's AI Companion understands build context and provides intelligent analysis. The AI recognizes build archetypes (crit vs RT, life vs ES, etc.), identifies synergies and anti-synergies, and provides advice tailored to the specific build style and goals. This results in more relevant suggestions and faster optimization iterations.

### Natural Language Interface

Unlike spreadsheets and manual calculators, players interact through natural conversation. Instead of learning complex tool interfaces or build theory notation, players ask questions in plain English and receive clear explanations. This dramatically lowers the learning curve and makes advanced optimization accessible to casual players.

### Real-Time Build Monitoring

Unlike static build guides or one-time analysis tools, Exile's AI Companion watches your builds directory and automatically updates analysis when you save changes in Path of Building. Make a change, save, and immediately ask "Is this better?" without any manual export or import steps. This tight feedback loop accelerates the optimization process.

### Comprehensive Build Understanding

Future integration with Path of Building's Lua API will enable the AI to not just read builds but actively modify them, test variations programmatically, and perform optimization algorithms that would take humans hours to execute manually. The AI will be able to "try" hundreds of passive tree variations in seconds and recommend the optimal configuration for specific goals.

## Key Features

### Core Features

- **Intelligent Build Analysis:** Extract and analyze all aspects of a PoB build including stats, skills, passives, items, and configuration, providing comprehensive summaries with contextual insights

- **Build Comparison:** Side-by-side comparison of two builds with clear highlighting of differences in stats, gear, and passives to help players make informed decisions

- **Real-Time File Monitoring:** Automatically detect when builds are saved in Path of Building and invalidate caches to ensure analysis always uses the latest data (sub-2-second update times)

- **Build Validation:** Detect common mistakes like resistance gaps, low life pools, missing accuracy, and insufficient defense layers with actionable fix suggestions

### Advanced Parsing Features (Phase 2)

- **Passive Tree Analysis:** Deep analysis of allocated nodes, keystones, notable passives, and efficient pathing with point investment recommendations

- **Jewel Intelligence:** Parse and analyze regular jewels, cluster jewels, and jewel socket placements to identify valuable combinations and synergies

- **Flask Optimization:** Analyze flask setup including types, mods, and synergies with recommendations for build archetype

- **Configuration Understanding:** Parse active configuration settings (boss vs trash, conditional buffs, etc.) to ensure calculations reflect realistic scenarios

### Optimization Engine (Phase 3)

- **Smart Suggestions:** AI-driven recommendations for gem links, gear upgrades, passive tree improvements, and flask setup based on build goals

- **Build Scoring:** Comprehensive rating system for offense, defense, and quality-of-life aspects with clear explanations of strengths and weaknesses

- **Bottleneck Detection:** Identify the weakest aspects of a build (gear slot, defense layer, DPS component) and provide prioritized upgrade paths

### Live Integration Features (Phase 5)

- **Interactive Build Editing:** Modify builds directly through conversation - add passive nodes, swap items, change gem links - and see results instantly in Path of Building

- **Scenario Testing:** Run what-if analyses like "test this at level 90" or "compare boss DPS vs clear DPS" with instant calculations

- **Automated Optimization:** AI-powered passive tree optimization that tests hundreds of variations to find the best configuration for specific goals (max DPS, max EHP, etc.)

- **Build Import/Export:** Import builds from URLs, generate optimized versions, and create comprehensive build guides with AI-generated explanations

## Strategic Vision

### Short-Term (3-6 months)
Build the foundation for AI-powered build analysis by completing static file analysis capabilities. Enable players to get instant, intelligent feedback on any Path of Building build through natural conversation. Establish Exile's AI Companion as the go-to tool for build validation and optimization suggestions.

### Medium-Term (6-12 months)
Integrate directly with Path of Building through Lua API to enable real-time interaction and programmatic build modification. Allow the AI to not just analyze but actively optimize builds by testing variations automatically. Enable "what-if" scenario testing and interactive build editing.

### Long-Term (12+ months)
Become the intelligent layer on top of Path of Building, making advanced build optimization accessible to all players regardless of experience level. Build a knowledge base of meta builds, common patterns, and optimization strategies. Potentially expand to include economy integration (item pricing), build sharing platform, and automated build generation from player goals.

## Success Metrics

### User Engagement
- **Active Users:** Monthly active users interacting with builds through Claude Desktop
- **Session Frequency:** Average number of build analysis sessions per user per week
- **Query Volume:** Number of build-related questions asked per session

### Product Value
- **Build Issues Detected:** Number of common mistakes caught per build analysis
- **Optimization Impact:** Measurable improvements in build stats after applying suggestions
- **Time Saved:** Reduction in time spent manually comparing options (self-reported)

### User Satisfaction
- **Recommendation Rate:** Percentage of users who would recommend to other PoE players
- **Repeat Usage:** Percentage of users who return for multiple builds/leagues
- **Feedback Quality:** Positive sentiment in user feedback about suggestion quality

### Technical Performance
- **Analysis Speed:** Time from user query to AI response (target: <3 seconds)
- **Cache Hit Rate:** Percentage of build reads served from cache (target: >70%)
- **Update Latency:** Time from PoB save to detected change (target: <2 seconds)
- **Accuracy:** Percentage of suggestions deemed "helpful" by users (target: >85%)

### Adoption Milestones
- **Phase 1 Success:** 100 active users providing build feedback
- **Phase 2 Success:** 500 active users with 80% reporting improved builds
- **Phase 3 Success:** 2,000 active users with measurable DPS/EHP improvements
- **Phase 5 Success:** 10,000 active users with live PoB integration adoption >50%

## Why This Matters

Path of Exile's complexity is both its greatest strength and its highest barrier to entry. Build planning should be accessible, collaborative, and iterative - not a solo research project requiring spreadsheets and wiki-diving. By making Claude understand Path of Building, we transform build optimization from a tedious technical task into a natural conversation. This doesn't just save time; it makes the deep complexity of PoE builds approachable for casual players while giving experienced players superhuman optimization capabilities.

This product represents a new category: AI-powered gaming tool companions that understand domain-specific complexity and provide expert-level assistance through natural language. If successful, this model can expand to other complex gaming systems where optimization and theorycrafting are core to the player experience.
