# Refactoring & Optimization Opportunities

## Current State Analysis

**Codebase Size**: ~8,290 lines across 19 TypeScript files
**Test Coverage**: 55.43% (102 tests passing)
**Build Status**: ✅ All tests passing, no linting errors

## 🎯 Priority Recommendations

### HIGH PRIORITY

#### 1. Increase Test Coverage (Currently 55% → Target 80%)

**Current Coverage Gaps**:
- `pobLuaBridge.ts`: 34% coverage (66% untested)
- Other handlers: 0% coverage (not yet tested)
- Services: buildService 97%, treeService/watchService untested

**Action Items**:
- [ ] Add tests for `treeService.ts` (tree analysis, comparison)
- [ ] Add tests for `watchService.ts` (file watching, cache invalidation)
- [ ] Expand `pobLuaBridge.ts` tests (TCP mode, advanced features)
- [ ] Add tests for remaining handlers:
  - `treeHandlers.ts`
  - `optimizationHandlers.ts`
  - `itemSkillHandlers.ts`
  - `watchHandlers.ts`
  - `luaHandlers.ts`
  - `advancedOptimizationHandlers.ts`
- [ ] Add tests for new Phase 6 modules:
  - `itemAnalyzer.ts`
  - `skillLinkOptimizer.ts`

**Estimated Effort**: 2-3 days
**Impact**: High - Prevents regressions, improves reliability

#### 2. Refactor Large `index.ts` File (64KB → Multiple Files)

**Current Issues**:
- 64KB monolithic file with 1,600+ lines
- Mixes server setup, tool registration, and tool routing
- Difficult to maintain and test

**Proposed Structure**:
```
src/
  server/
    mcpServer.ts          # Server class and initialization
    toolRegistry.ts       # Tool schema registration
    toolRouter.ts         # Tool call routing/dispatch
    contextBuilder.ts     # Build handler contexts
    responseWrapper.ts    # Truncation, formatting utilities
```

**Benefits**:
- Easier to test individual components
- Better code organization
- Faster navigation and editing
- Reduced cognitive load

**Estimated Effort**: 1-2 days
**Impact**: High - Improves maintainability

#### 3. Extract Duplicate Error Handling Pattern

**Current Pattern** (repeated 81 times):
```typescript
try {
  // handler logic
} catch (error) {
  const errorMsg = error instanceof Error ? error.message : String(error);
  throw new Error(`Failed to [action]: ${errorMsg}`);
}
```

**Proposed Solution**:
```typescript
// src/utils/errorHandling.ts
export function wrapHandler<T>(
  action: string,
  handler: () => Promise<T>
): Promise<T> {
  try {
    return await handler();
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to ${action}: ${errorMsg}`);
  }
}

// Usage:
export async function handleAddItem(context, itemText, slotName) {
  return wrapHandler('add item', async () => {
    await context.ensureLuaClient();
    // actual logic here
  });
}
```

**Benefits**:
- DRY principle
- Consistent error messages
- Easier to add error telemetry later

**Estimated Effort**: 4-6 hours
**Impact**: Medium - Reduces boilerplate by ~200 lines

### MEDIUM PRIORITY

#### 4. Add TypeScript Strict Mode

**Current State**: Not using strict TypeScript checks
**Recommendation**: Enable progressively

```json
// tsconfig.json additions
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true
  }
}
```

**Why**:
- Catch more bugs at compile time
- Better IDE autocomplete
- Industry best practice
- Found 5 `any` types in handlers that could be typed

**Estimated Effort**: 1 day (fix existing issues)
**Impact**: Medium - Better type safety

#### 5. Consolidate Context Building

**Current Issue**: Context objects built in multiple places

```typescript
// In index.ts (repeated pattern):
const handlerContext = {
  buildService: this.buildService,
  treeService: this.treeService,
};

const luaContext = {
  pobDirectory: this.pobDirectory,
  luaEnabled: this.luaEnabled,
  // ...
};
```

**Proposed Solution**:
```typescript
// src/server/contextBuilder.ts
export class ContextBuilder {
  constructor(private server: PoBMCPServer) {}

  buildHandlerContext(): HandlerContext {
    return {
      buildService: this.server.buildService,
      treeService: this.server.treeService,
    };
  }

  buildLuaContext(): LuaContext {
    return {
      pobDirectory: this.server.pobDirectory,
      getLuaClient: () => this.server.luaClient,
      // ...
    };
  }
}
```

**Benefits**:
- Single source of truth
- Easier to extend contexts
- Better testability

**Estimated Effort**: 3-4 hours
**Impact**: Medium - Cleaner code structure

#### 6. Add Logging/Observability Layer

**Current State**: Some `console.error` statements, no structured logging
**Recommendation**: Add proper logging

```typescript
// src/utils/logger.ts
export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error'
}

export class Logger {
  constructor(private component: string) {}

  info(message: string, metadata?: object) {
    if (process.env.LOG_LEVEL !== 'silent') {
      console.error(JSON.stringify({
        level: 'info',
        component: this.component,
        message,
        ...metadata,
        timestamp: new Date().toISOString()
      }));
    }
  }

  // warn, error, debug methods...
}

// Usage:
const logger = new Logger('PoBLuaBridge');
logger.info('Build loaded', { buildName: 'MyBuild.xml' });
```

**Benefits**:
- Better debugging
- Production monitoring
- Structured logs for parsing
- Can disable in tests

**Estimated Effort**: 1 day
**Impact**: Medium - Better observability

### LOW PRIORITY

#### 7. Remove `test.ts` Development File

**Current State**: `src/test.ts` is a standalone test script
**Recommendation**: Move to proper test suite or remove

**Estimated Effort**: 15 minutes
**Impact**: Low - Cleanup

#### 8. Add Configuration Validation

**Current Issue**: Environment variables read without validation
**Recommendation**: Use Zod for config validation

```typescript
// src/config.ts
import { z } from 'zod';

const configSchema = z.object({
  pobDirectory: z.string().min(1),
  luaEnabled: z.boolean().default(false),
  useTcpMode: z.boolean().default(false),
  // ...
});

export const config = configSchema.parse({
  pobDirectory: process.env.POB_DIRECTORY || getDefaultPobDirectory(),
  luaEnabled: process.env.POB_ENABLE_LUA === 'true',
  useTcpMode: process.env.POB_USE_TCP === 'true',
});
```

**Benefits**:
- Fail fast on misconfiguration
- Type-safe config access
- Better error messages

**Estimated Effort**: 2-3 hours
**Impact**: Low - Better DX

#### 9. Add JSDoc Comments for Public APIs

**Current State**: Some functions documented, many aren't
**Recommendation**: Add JSDoc to all exported functions

```typescript
/**
 * Analyzes a Path of Building build and returns comprehensive analysis.
 *
 * @param buildName - Name of the build file (e.g., 'MyBuild.xml')
 * @returns Analysis including stats, tree, items, and optimization suggestions
 * @throws {Error} If build file doesn't exist or is invalid
 *
 * @example
 * ```typescript
 * const analysis = await handleAnalyzeBuild(context, 'MyBuild.xml');
 * console.log(analysis.content[0].text);
 * ```
 */
export async function handleAnalyzeBuild(...)
```

**Benefits**:
- Better IDE intellisense
- Self-documenting code
- Easier onboarding

**Estimated Effort**: 1 day
**Impact**: Low - Better DX

#### 10. Performance Profiling

**Recommendation**: Add benchmarks for heavy operations

```typescript
// src/utils/benchmark.ts
export async function benchmark<T>(
  name: string,
  fn: () => Promise<T>
): Promise<T> {
  const start = performance.now();
  const result = await fn();
  const duration = performance.now() - start;
  console.error(`[BENCHMARK] ${name}: ${duration.toFixed(2)}ms`);
  return result;
}
```

**Target Operations**:
- Tree analysis
- Build parsing
- Stat calculations
- Node optimization

**Estimated Effort**: 4 hours
**Impact**: Low - Identify bottlenecks

## 🚀 Quick Wins (< 2 hours each)

1. ✅ **Remove test.ts** - Move to proper test or delete
2. ✅ **Add .editorconfig** - Consistent code formatting
3. ✅ **Add CONTRIBUTING.md** - Contribution guidelines
4. ✅ **Update package.json scripts** - Add useful dev scripts
5. ✅ **Add pre-commit hooks** - Run tests before commit

## 📊 Suggested Implementation Order

### Sprint 1 (Week 1): Foundation ✅ COMPLETED
1. ✅ Remove test.ts cleanup
2. ✅ Add error handling utility (wrapHandler, wrapHandlerSync - 100% coverage)
3. ✅ Extract context builder (ContextBuilder class - 100% coverage)
4. ⏭️  Add logging layer (deferred - current console.error sufficient)

**Goal**: Cleaner foundation for future work
**Status**: COMPLETED (2025-11-01)
**Commits**:
- `debbac7` - Refactor: Extract reusable utilities and improve code organization
- `e4eea6d` - Add comprehensive tests for treeService and watchService

### Sprint 2 (Week 2): Testing 🚧 IN PROGRESS
1. ✅ Add treeService tests (28 tests, 27% coverage - complex service)
2. ✅ Add watchService tests (20 tests, 91% coverage)
3. ⏭️  Add handler tests (pick 2-3) - NEXT UP
4. ⏭️  Expand pobLuaBridge tests

**Goal**: 70%+ test coverage
**Status**: PARTIAL (50% complete)
**Progress**: 164 total tests (up from 102), new services tested

### Sprint 3 (Week 3): Refactoring 📋 PLANNED
1. ⏭️  Break up index.ts into modules (see detailed plan below)
2. ⏭️  Enable TypeScript strict mode
3. ⏭️  Add configuration validation
4. ⏭️  Add JSDoc comments

**Goal**: Better code organization and type safety

#### index.ts Refactoring Plan (1,646 lines → multiple modules)

**Current Structure**:
- Lines 1-75: Imports
- Lines 76-122: PoBMCPServer class properties (48 tool definitions)
- Lines 123-218: Constructor (initialization)
- Lines 220-260: Tool gate methods
- Lines 262-431: Lua client methods
- Lines 433-1285: setupHandlers() - Tool schemas (800+ lines!)
- Lines 1287-1641: Tool routing switch statement (350+ lines!)
- Lines 1642-1646: Server startup

**Proposed Structure**:
```
src/server/
  toolSchemas.ts       # 48 tool schema definitions (~800 lines)
  toolRouter.ts        # Tool routing logic (~350 lines)
  mcpServer.ts         # Main server class (~200 lines)
  toolGate.ts          # Tool gate/locking logic (~40 lines)
  luaClientManager.ts  # Lua client lifecycle (~170 lines)
```

**Benefits**:
- Each file < 1000 lines
- Clear separation of concerns
- Easier to test individual components
- Better git history (fewer conflicts)
- Easier onboarding for contributors

**Estimated Effort**: 4-6 hours
**Risk**: Medium (large refactor, needs careful testing)

### Sprint 4 (Week 4): Polish
1. Performance profiling
2. Remaining test coverage
3. Documentation updates
4. Code review and polish

**Goal**: 80%+ coverage, production-ready

## 🎯 Success Metrics

- [ ] Test coverage ≥ 80%
- [ ] No files > 500 lines
- [ ] TypeScript strict mode enabled
- [ ] All public APIs documented
- [ ] Consistent error handling
- [ ] Structured logging
- [ ] Performance baselines established

## 🔄 Alternatives to Consider

### Instead of Refactoring Now:
**Option A**: Wait until after Trade API implementation
- **Pro**: Don't interrupt feature velocity
- **Con**: Technical debt accumulates

**Option B**: Incremental refactoring during trade implementation
- **Pro**: Practical, test-driven refactoring
- **Con**: Slower feature delivery

**Option C**: Feature freeze for 2 weeks to refactor
- **Pro**: Clean slate for trade API
- **Con**: No new features for users

## 💡 Recommendation

**Best Approach**: Hybrid strategy

1. **This week (Quick wins)**:
   - Remove test.ts
   - Add error handling utility
   - Start test coverage expansion

2. **Next 2 weeks (Parallel with planning)**:
   - Continue test coverage
   - Extract smaller refactorings
   - Document APIs

3. **Before Trade API (Foundation)**:
   - Break up index.ts
   - Enable strict mode
   - Hit 70%+ coverage

4. **During Trade API (Incremental)**:
   - Apply learnings from refactoring
   - Keep new code well-tested
   - Extract patterns to utilities

This balances immediate wins, technical debt reduction, and feature velocity.

---

**Status**: Planning
**Last Updated**: 2025-11-01
**Next Review**: After Sprint 1 completion
