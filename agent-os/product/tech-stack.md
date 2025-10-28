# Tech Stack

## Overview

Exile's AI Companion is built as a Model Context Protocol (MCP) server that bridges Path of Building with Claude Desktop. The architecture prioritizes simplicity, performance, and reliability for real-time build analysis. The tech stack is deliberately minimal to reduce complexity while providing robust XML parsing, file watching, and AI integration capabilities.

---

## Core Technologies

### Runtime & Language
- **Runtime:** Node.js (v20+)
  - Chosen for excellent cross-platform support (Windows, Mac, Linux)
  - Native file system watching capabilities
  - Fast startup time for MCP server context
  - Strong ecosystem for XML parsing and file operations

- **Language:** TypeScript (v5.0+)
  - Type safety for complex build data structures
  - Better IDE support for development
  - Reduced runtime errors through compile-time checking
  - Clear interfaces for Path of Building XML schema

- **Module System:** ES Modules (type: "module")
  - Modern JavaScript module system
  - Native Node.js support
  - Better tree-shaking and optimization
  - Aligns with MCP SDK requirements

### Package Manager
- **npm**
  - Standard Node.js package manager
  - Reliable dependency resolution
  - Wide compatibility with CI/CD systems
  - Built-in to Node.js runtime

---

## MCP Integration

### Model Context Protocol
- **@modelcontextprotocol/sdk** (v1.0.0)
  - Official Anthropic SDK for building MCP servers
  - Provides server infrastructure, tool schemas, and resource handling
  - Handles stdio transport for Claude Desktop communication
  - Type-safe request/response handling

### Communication
- **Transport:** Stdio (Standard Input/Output)
  - Claude Desktop native integration method
  - Zero network configuration required
  - Secure local-only communication
  - Simple process spawning and lifecycle management

---

## Data Processing

### XML Parsing
- **fast-xml-parser** (v4.3.2)
  - High-performance XML to JavaScript object conversion
  - Handles Path of Building's complex nested structures
  - Attribute preservation for metadata
  - Configurable parsing options for PoB format specifics
  - ~50-100ms parse time for typical builds

**Why fast-xml-parser:**
- Path of Building builds are complex XML documents (5-50KB typical)
- Need to preserve attributes (enabled="true", level="20", etc.)
- Performance critical for real-time analysis
- Mature library with excellent TypeScript support

### File System Operations
- **fs/promises** (Node.js built-in)
  - Async file reading for non-blocking operations
  - Directory scanning for build listings
  - Native path handling across platforms

- **path** (Node.js built-in)
  - Cross-platform path construction
  - Safe path joining and resolution
  - Filename extraction and normalization

- **os** (Node.js built-in)
  - Home directory detection for default PoB path
  - Platform detection for OS-specific behavior

---

## Real-Time Monitoring

### File Watching
- **chokidar** (v4.0.3)
  - Robust cross-platform file watching
  - Handles Path of Building's multi-write save behavior
  - Configurable stabilization thresholds (500ms)
  - Efficient event debouncing
  - Ignores dotfiles and temporary files automatically

**Why chokidar:**
- Node.js fs.watch() has platform inconsistencies
- chokidar abstracts platform differences (Windows vs Mac vs Linux)
- Built-in file write stabilization critical for PoB's save behavior
- Industry standard used by webpack, vite, and other dev tools
- Excellent performance with 100+ files

### Caching Strategy
- **In-Memory Map Cache**
  - Simple Map<filename, {data, timestamp}> structure
  - Cache hit: ~0ms (instant) vs 50-100ms parse time
  - Automatic invalidation on file change events
  - Memory efficient (~5-10KB per cached build)
  - No external dependencies (Redis, Memcached) required

**Cache Design Rationale:**
- Build files change infrequently during analysis sessions
- Parsing is computationally expensive relative to memory storage
- Local in-process cache eliminates network latency
- Simple invalidation strategy (file change = cache clear)

---

## Development Tools

### TypeScript Compilation
- **TypeScript Compiler (tsc)**
  - Compiles TypeScript to JavaScript for Node.js execution
  - Type checking before runtime
  - Source maps for debugging
  - Watch mode for development (npm run dev)

### Build Process
```bash
npm run build    # Compile TypeScript to build/
npm run dev      # Watch mode for development
npm start        # Run compiled server
```

### Type Definitions
- **@types/node** (v20.0.0)
  - TypeScript definitions for Node.js APIs
  - Full type coverage for fs, path, os, process

- **@types/chokidar** (v1.7.5)
  - Type definitions for chokidar file watching
  - Proper event typing and callback signatures

---

## Path of Building Integration

### Current: File-Based Integration
- **Build Format:** XML files (.xml extension)
- **Default Location:**
  - Windows: `%USERPROFILE%/Documents/Path of Building/Builds`
  - Mac/Linux: `~/Documents/Path of Building/Builds`
- **Custom Location:** Configurable via `POB_DIRECTORY` environment variable

### Build Data Structure
```typescript
interface PoBBuild {
  Build?: {
    level?: string;
    className?: string;
    ascendClassName?: string;
    PlayerStat?: Array<{stat: string; value: string}>;
  };
  Tree?: { /* Passive tree data */ };
  Skills?: { /* Gem links */ };
  Items?: { /* Equipped items */ };
  Notes?: string;
}
```

### Planned: Lua API Integration
**Target Implementation:** Phase 5 (Long-term)

- **PoB Plugin Language:** Lua (Path of Building's scripting language)
- **Communication Protocol:** HTTP or WebSocket
  - Lightweight HTTP server in PoB plugin
  - JSON serialization for data exchange
  - RESTful endpoints or WebSocket events

- **Lua Libraries (Planned):**
  - LuaSocket or built-in HTTP for server
  - JSON encoding/decoding for data format
  - PoB API hooks for build data access

**Rationale:**
- Path of Building is a Lua application
- Plugin system allows extension via Lua scripts
- HTTP/WebSocket enables cross-process communication
- JSON provides language-agnostic data format
- Maintains separation between MCP server and PoB process

---

## Environment Configuration

### Environment Variables
- **POB_DIRECTORY:** Custom Path of Building builds directory
  - Optional: Defaults to standard PoB location
  - Allows testing with custom build sets
  - Configured in Claude Desktop config or shell

### Configuration Files
- **package.json:** Project dependencies and scripts
- **tsconfig.json:** TypeScript compiler configuration
- **claude_desktop_config.json:** User-specific Claude Desktop MCP server registration

### Claude Desktop Configuration
```json
{
  "mcpServers": {
    "pob": {
      "command": "node",
      "args": ["/absolute/path/to/build/index.js"],
      "env": {
        "POB_DIRECTORY": "/path/to/builds"
      }
    }
  }
}
```

---

## Data Flow Architecture

### Request Flow
1. User asks Claude a question about a PoB build
2. Claude Desktop sends MCP tool call to server via stdio
3. Server receives request, identifies tool and parameters
4. Server checks cache for build data (if applicable)
5. On cache miss: Read XML file, parse with fast-xml-parser, store in cache
6. Process data and generate response
7. Return response to Claude via stdio
8. Claude formats and presents to user

### File Change Flow
1. User saves build in Path of Building
2. Chokidar detects file change event (within 2 seconds)
3. Event enters debounce timer (500ms)
4. After stabilization: Process file change
5. Invalidate cache entry for modified build
6. Track change in recent changes list
7. Next analysis request gets fresh data

### Cache Strategy
- **Write-through:** Not applicable (read-only analysis)
- **Cache invalidation:** On file change events
- **Cache expiry:** None (invalidated by file watching)
- **Cache size:** Unbounded (limited by number of builds, typically <100)
- **Cache persistence:** None (in-memory only, cleared on server restart)

---

## Performance Characteristics

### Latency Targets
- **File change detection:** <2 seconds from PoB save to cache invalidation
- **Tool response time:** <3 seconds from user query to Claude response
- **XML parsing:** 50-100ms for typical build (5-50KB XML)
- **Cache hit response:** <10ms for cached builds

### Scalability
- **Build count:** Tested with 100+ builds without performance degradation
- **Concurrent requests:** Single-threaded (stdio transport is serial)
- **Memory usage:** ~5-10KB per cached build, ~10MB base server footprint
- **File watch overhead:** Negligible CPU usage in idle state

### Optimization Techniques
- **Debouncing:** 500ms delay prevents excessive processing during rapid saves
- **Lazy parsing:** Only parse builds when requested, not on file watch events
- **Selective caching:** Cache only recently accessed builds
- **Stabilization threshold:** Wait for file writes to complete (500ms) before processing

---

## Testing & Quality

### Current Testing Approach
- **Manual Testing:** test-watcher.sh script for file watching functionality
- **Example Build:** example-build.xml included for development testing
- **Integration Testing:** Test in Claude Desktop with real builds

### Planned Testing Infrastructure
- **Unit Testing:** Jest or Node's built-in test runner
  - Test XML parsing with various build structures
  - Test cache invalidation logic
  - Test file watching debouncing

- **Integration Testing:** End-to-end MCP tool invocations
  - Test each tool with realistic inputs
  - Verify correct responses for edge cases

- **Validation Testing:** Test with real Path of Building builds
  - Community build examples
  - Edge cases (minimal builds, complex cluster jewel setups)
  - Different PoB versions and formats

### Code Quality Tools
- **TypeScript:** Compile-time type checking
- **Future:** ESLint for code style consistency
- **Future:** Prettier for code formatting

---

## Deployment & Distribution

### Distribution Model
- **Source Distribution:** Git repository (currently)
- **Installation:** User clones repo, runs npm install, builds with npm run build
- **Configuration:** Manual Claude Desktop config.json editing

### Planned Distribution Improvements
- **npm Package:** Publish as installable npm package
- **Binary Distribution:** pkg or similar for standalone executables
- **Automated Setup:** CLI tool to configure Claude Desktop automatically

### Version Management
- **Current:** Manual version tracking in package.json
- **Planned:** Semantic versioning with changelog
- **Planned:** Automated release process with GitHub Actions

---

## Security & Privacy

### Data Privacy
- **Local-Only:** All processing happens on user's machine
- **No Network Calls:** No external API requests or telemetry
- **No Data Storage:** Builds stay in PoB directory, not copied or uploaded
- **No Secrets:** No API keys or authentication required

### Security Considerations
- **Path Traversal:** Validate build filenames to prevent directory traversal
- **XML Parsing:** fast-xml-parser handles malicious XML safely
- **Process Isolation:** MCP server runs in separate process from Claude Desktop
- **File Permissions:** Respects OS file permissions for PoB directory

---

## Dependencies Summary

### Production Dependencies
```json
{
  "@modelcontextprotocol/sdk": "^1.0.0",  // MCP server infrastructure
  "chokidar": "^4.0.3",                    // File watching
  "fast-xml-parser": "^4.3.2"              // XML parsing
}
```

### Development Dependencies
```json
{
  "@types/chokidar": "^1.7.5",            // Type definitions
  "@types/node": "^20.0.0",                // Node.js types
  "typescript": "^5.0.0"                   // TypeScript compiler
}
```

**Total Production Dependencies:** 3 packages + their transitive dependencies
**Bundle Size:** ~2-3MB for node_modules
**Install Time:** <30 seconds on typical connection

---

## Future Technology Considerations

### Phase 5: Lua Integration
- **Lua Plugin Development:**
  - Lua 5.1+ (PoB's Lua version)
  - LuaSocket or HTTP library for server
  - JSON encoding library (dkjson or similar)

- **IPC Options:**
  - HTTP REST API (simple, debuggable)
  - WebSocket (real-time, bidirectional)
  - Named Pipes (fast, local-only)

**Decision Criteria:**
- Cross-platform support (Windows, Mac, Linux)
- Ease of debugging and development
- Performance for rapid calculations
- Community familiarity for plugin contributors

### Potential Enhancements
- **Database:** SQLite for build history tracking (if build database feature added)
- **Testing:** Jest for comprehensive test suite
- **Monitoring:** Optional logging/metrics for performance tracking
- **Documentation:** JSDoc comments for API documentation

---

## Technology Selection Rationale

### Why Node.js + TypeScript?
- **Cross-platform:** PoE players on Windows, Mac, and Linux
- **MCP SDK:** Official TypeScript SDK from Anthropic
- **File operations:** Excellent fs and file watching libraries
- **Development speed:** Rapid prototyping and iteration
- **Type safety:** Catch errors before runtime with TypeScript

### Why NOT Other Options?
- **Python:** Slower startup time, less robust file watching, MCP SDK less mature
- **Go:** Compiled binary distribution harder, smaller ecosystem for XML parsing
- **Rust:** Steeper learning curve, longer development time, overkill for file I/O workload
- **Java:** Heavy runtime, slower startup, unnecessary complexity for this use case

### Architecture Philosophy
- **Simplicity over features:** Minimal dependencies reduce bugs and maintenance
- **Performance where it matters:** Cache aggressively, parse lazily, watch efficiently
- **Local-first:** No network dependencies = faster and more private
- **Extensible design:** Easy to add new tools and features incrementally

---

This tech stack provides a solid foundation for building an intelligent, performant, and reliable AI companion for Path of Building. The choices prioritize user experience (fast responses, real-time updates), developer experience (type safety, good tooling), and maintainability (simple architecture, minimal dependencies).
