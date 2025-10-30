# Phase 5: Automated Testing Suite

## Overview

Phase 5 adds comprehensive automated testing to the PoB MCP Server, focusing on stdio mode first. Tests will mock the PoB Lua process to enable fast, reliable testing without dependencies.

## Goals

1. **Unit Tests**: Test individual bridge methods in isolation
2. **Integration Tests**: Test MCP tool handlers end-to-end
3. **Mock Strategy**: Mock stdio protocol without real PoB process
4. **Fast Execution**: Tests run in < 5 seconds
5. **CI/CD Ready**: Can run in automated pipelines
6. **Documentation**: Clear test documentation and examples

## Testing Framework Choice

**Selected: Jest**

**Reasons**:
- ✅ TypeScript support out of the box
- ✅ Built-in mocking capabilities
- ✅ Snapshot testing support
- ✅ Excellent async/await support
- ✅ Code coverage reporting
- ✅ Well-documented and widely used
- ✅ Watch mode for development

**Alternatives Considered**:
- Mocha + Chai: More setup required
- Vitest: Newer, less ecosystem support
- Node test runner: Less mature

## Test Structure

```
tests/
├── unit/
│   ├── pobLuaBridge.test.ts       # Bridge unit tests
│   ├── buildParser.test.ts        # XML parsing tests
│   └── treeParser.test.ts         # Tree parsing tests
├── integration/
│   ├── mcpTools.test.ts           # MCP tool integration tests
│   ├── workflows.test.ts          # Complete workflow tests
│   └── errorHandling.test.ts     # Error scenario tests
├── mocks/
│   ├── pobProcess.mock.ts         # Mock PoB stdio process
│   ├── buildData.mock.ts          # Sample build data
│   └── responses.mock.ts          # Mock API responses
└── helpers/
    ├── testUtils.ts               # Test utilities
    └── fixtures.ts                # Test fixtures
```

## Mock Strategy

### Mock PoB Stdio Process

The key challenge is mocking the stdio communication with the PoB Lua process.

**Approach**:
```typescript
class MockPoBProcess {
  private responses: Map<string, any>;

  constructor() {
    this.setupDefaultResponses();
  }

  // Simulate readline-style output
  mockStdout(data: string): void {
    // Simulate process.stdout.on('data')
  }

  // Register custom responses for specific actions
  registerResponse(action: string, response: any): void {
    this.responses.set(action, response);
  }

  // Get response for action
  getResponse(action: string): string {
    const response = this.responses.get(action);
    return JSON.stringify(response) + '\n';
  }
}
```

**Default Responses**:
- `ping` → `{ ok: true }`
- `load_build_xml` → `{ ok: true }`
- `get_stats` → `{ ok: true, stats: { Life: 5000, DPS: 100000, ... } }`
- `get_tree` → `{ ok: true, tree: { nodes: [...], classId: 2, ... } }`
- `get_items` → `{ ok: true, items: [...] }`
- `get_skills` → `{ ok: true, result: { groups: [...] } }`

### Mocking child_process.spawn

```typescript
jest.mock('child_process', () => ({
  spawn: jest.fn().mockImplementation(() => ({
    stdout: {
      setEncoding: jest.fn(),
      on: jest.fn((event, handler) => {
        if (event === 'data') {
          // Immediately send ready banner
          handler('{"ready":true}\n');
        }
      }),
    },
    stderr: {
      setEncoding: jest.fn(),
      on: jest.fn(),
    },
    stdin: {
      write: jest.fn(),
    },
    on: jest.fn(),
    kill: jest.fn(),
  })),
}));
```

## Unit Tests

### Test 1: PoBLuaApiClient Initialization

```typescript
describe('PoBLuaApiClient', () => {
  describe('start', () => {
    it('should spawn luajit process with correct arguments', async () => {
      const client = new PoBLuaApiClient({
        cwd: '/test/path',
        cmd: 'luajit',
      });

      await client.start();

      expect(spawn).toHaveBeenCalledWith(
        'luajit',
        ['HeadlessWrapper.lua'],
        expect.objectContaining({
          cwd: '/test/path',
          env: expect.objectContaining({ POB_API_STDIO: '1' }),
        })
      );
    });

    it('should wait for ready banner before resolving', async () => {
      const client = new PoBLuaApiClient();
      await expect(client.start()).resolves.toBeUndefined();
    });

    it('should timeout if ready banner not received', async () => {
      // Mock process that never sends ready
      const client = new PoBLuaApiClient({ timeoutMs: 100 });
      await expect(client.start()).rejects.toThrow('Timed out');
    });
  });
});
```

### Test 2: PoBLuaApiClient Methods

```typescript
describe('PoBLuaApiClient methods', () => {
  let client: PoBLuaApiClient;

  beforeEach(async () => {
    client = new PoBLuaApiClient();
    await client.start();
  });

  afterEach(async () => {
    await client.stop();
  });

  describe('ping', () => {
    it('should return true on successful ping', async () => {
      mockProcess.registerResponse('ping', { ok: true });
      const result = await client.ping();
      expect(result).toBe(true);
    });
  });

  describe('loadBuildXml', () => {
    it('should send load_build_xml action with XML', async () => {
      const xml = '<Build>...</Build>';
      mockProcess.registerResponse('load_build_xml', { ok: true });

      await client.loadBuildXml(xml);

      expect(mockProcess.lastAction).toEqual({
        action: 'load_build_xml',
        params: { xml, name: 'API Build' },
      });
    });

    it('should throw on error response', async () => {
      mockProcess.registerResponse('load_build_xml', {
        ok: false,
        error: 'Invalid XML',
      });

      await expect(client.loadBuildXml('<invalid>')).rejects.toThrow('Invalid XML');
    });
  });

  describe('getStats', () => {
    it('should return stats object', async () => {
      const expectedStats = { Life: 5000, DPS: 100000 };
      mockProcess.registerResponse('get_stats', {
        ok: true,
        stats: expectedStats,
      });

      const stats = await client.getStats();
      expect(stats).toEqual(expectedStats);
    });

    it('should request specific fields when provided', async () => {
      await client.getStats(['Life', 'DPS']);

      expect(mockProcess.lastAction).toEqual({
        action: 'get_stats',
        params: { fields: ['Life', 'DPS'] },
      });
    });
  });

  describe('addItem', () => {
    it('should send item text and return result', async () => {
      const itemText = 'Rarity: Rare\nSteel Blade\n...';
      mockProcess.registerResponse('add_item_text', {
        ok: true,
        result: { id: 123, name: 'Steel Blade', slot: 'Weapon 1' },
      });

      const result = await client.addItem(itemText);
      expect(result.name).toBe('Steel Blade');
    });
  });

  describe('setFlaskActive', () => {
    it('should toggle flask activation', async () => {
      mockProcess.registerResponse('set_flask_active', { ok: true });

      await client.setFlaskActive(1, true);

      expect(mockProcess.lastAction).toEqual({
        action: 'set_flask_active',
        params: { index: 1, active: true },
      });
    });
  });
});
```

### Test 3: Error Handling

```typescript
describe('Error handling', () => {
  it('should handle process crash', async () => {
    const client = new PoBLuaApiClient();
    await client.start();

    // Simulate process exit
    mockProcess.emit('exit', 1, null);

    await expect(client.ping()).rejects.toThrow('PoB API exited');
  });

  it('should handle invalid JSON response', async () => {
    mockProcess.sendRawResponse('not json\n');

    await expect(client.ping()).rejects.toThrow('Invalid JSON');
  });

  it('should handle concurrent request error', async () => {
    const client = new PoBLuaApiClient();
    await client.start();

    const promise1 = client.getStats();
    const promise2 = client.getStats();

    await expect(promise2).rejects.toThrow('Concurrent request not supported');
  });
});
```

## Integration Tests

### Test 1: MCP Tool Handlers

```typescript
describe('MCP Tool Handlers', () => {
  let server: PoBServer;

  beforeEach(() => {
    server = new PoBServer();
    // Mock luaClient
  });

  describe('add_item', () => {
    it('should add item and return formatted response', async () => {
      const itemText = 'Rarity: Rare\nSteel Blade\n...';

      const response = await server.handleAddItem(itemText);

      expect(response.content[0].text).toContain('Item Added');
      expect(response.content[0].text).toContain('Steel Blade');
    });

    it('should throw error if bridge not started', async () => {
      server.luaClient = null;

      await expect(server.handleAddItem('text')).rejects.toThrow(
        'Lua client not initialized'
      );
    });
  });

  describe('toggle_flask', () => {
    it('should validate flask number', async () => {
      await expect(server.handleToggleFlask(0, true)).rejects.toThrow(
        'flask_number must be between 1 and 5'
      );

      await expect(server.handleToggleFlask(6, true)).rejects.toThrow(
        'flask_number must be between 1 and 5'
      );
    });

    it('should toggle flask and return confirmation', async () => {
      const response = await server.handleToggleFlask(1, true);

      expect(response.content[0].text).toContain('Flask 1 is now activated');
    });
  });

  describe('get_skill_setup', () => {
    it('should format skill groups correctly', async () => {
      mockLuaClient.getSkills.mockResolvedValue({
        mainSocketGroup: 1,
        groups: [
          {
            index: 1,
            label: 'Main 6L',
            skills: ['Lightning Arrow', 'GMP', 'Elemental Damage with Attacks'],
            enabled: true,
          },
        ],
      });

      const response = await server.handleGetSkillSetup();

      expect(response.content[0].text).toContain('Group 1 (MAIN)');
      expect(response.content[0].text).toContain('Lightning Arrow');
    });
  });
});
```

### Test 2: Complete Workflows

```typescript
describe('Complete Workflows', () => {
  it('should handle complete build modification workflow', async () => {
    const server = new PoBServer();

    // 1. Start bridge
    await server.handleLuaStart();

    // 2. Load build
    await server.handleLuaLoadBuild('<Build>...</Build>');

    // 3. Get baseline stats
    const stats1 = await server.handleLuaGetStats();
    expect(stats1.content[0].text).toContain('Life:');

    // 4. Add item
    await server.handleAddItem('Rarity: Rare\n...');

    // 5. Toggle flask
    await server.handleToggleFlask(1, true);

    // 6. Set main skill
    await server.handleSetMainSkill(2);

    // 7. Get updated stats
    const stats2 = await server.handleLuaGetStats();
    expect(stats2).toBeDefined();

    // 8. Stop bridge
    await server.handleLuaStop();
  });

  it('should handle tree + item modifications together', async () => {
    const server = new PoBServer();
    await server.handleLuaStart();
    await server.handleLuaLoadBuild('<Build>...</Build>');

    // Modify tree
    await server.handleLuaSetTree({
      classId: 2,
      ascendClassId: 1,
      nodes: [1, 2, 3, 4, 5],
    });

    // Add items
    await server.handleAddItem('weapon text');
    await server.handleAddItem('armor text');

    // Activate flasks
    await server.handleToggleFlask(1, true);

    // Verify stats updated
    const stats = await server.handleLuaGetStats();
    expect(stats).toBeDefined();
  });
});
```

### Test 3: Error Scenarios

```typescript
describe('Error Scenarios', () => {
  it('should handle bridge timeout gracefully', async () => {
    mockProcess.simulateHang();

    const server = new PoBServer();
    await expect(server.handleLuaStart()).rejects.toThrow('Timed out');
  });

  it('should handle invalid build XML', async () => {
    const server = new PoBServer();
    await server.handleLuaStart();

    await expect(
      server.handleLuaLoadBuild('<invalid>')
    ).rejects.toThrow();
  });

  it('should handle PoB process crash during operation', async () => {
    const server = new PoBServer();
    await server.handleLuaStart();
    await server.handleLuaLoadBuild('<Build>...</Build>');

    // Simulate crash
    mockProcess.crash();

    await expect(server.handleLuaGetStats()).rejects.toThrow('PoB API exited');
  });
});
```

## Test Data & Fixtures

### Sample Build XML

```typescript
export const SAMPLE_BUILD_XML = `<?xml version="1.0" encoding="UTF-8"?>
<PathOfBuilding>
  <Build level="90" className="Ranger" ascendClassName="Deadeye">
    <PlayerStat stat="Life" value="5000"/>
    <PlayerStat stat="TotalDPS" value="1000000"/>
    <!-- ... -->
  </Build>
  <Tree>
    <Spec nodes="1,2,3,4,5" classId="2" ascendClassId="1"/>
  </Tree>
  <Items>
    <!-- Sample items -->
  </Items>
</PathOfBuilding>`;
```

### Sample API Responses

```typescript
export const MOCK_RESPONSES = {
  ready: { ready: true },
  ping: { ok: true },
  load_build_xml: { ok: true },
  get_stats: {
    ok: true,
    stats: {
      Life: 5000,
      EnergyShield: 0,
      TotalDPS: 1000000,
      CritChance: 75,
      Armour: 15000,
      FireResist: 75,
      ColdResist: 75,
      LightningResist: 75,
      ChaosResist: 20,
    },
  },
  get_tree: {
    ok: true,
    tree: {
      treeVersion: '3_26',
      classId: 2,
      ascendClassId: 1,
      nodes: [1, 2, 3, 4, 5],
      masteryEffects: {},
    },
  },
  get_items: {
    ok: true,
    items: [
      {
        slot: 'Weapon 1',
        id: 1,
        name: 'Death Bow',
        baseName: 'Thicket Bow',
        rarity: 'RARE',
      },
      {
        slot: 'Body Armour',
        id: 0,
      },
    ],
  },
  get_skills: {
    ok: true,
    result: {
      mainSocketGroup: 1,
      groups: [
        {
          index: 1,
          label: 'Main 6L',
          slot: 'Body Armour',
          enabled: true,
          includeInFullDPS: true,
          mainActiveSkill: 1,
          skills: ['Lightning Arrow', 'Greater Multiple Projectiles'],
        },
      ],
    },
  },
};
```

## Coverage Goals

### Target Coverage
- **Statements**: > 80%
- **Branches**: > 75%
- **Functions**: > 85%
- **Lines**: > 80%

### Critical Paths (100% Coverage Required)
- Bridge initialization and ready banner handling
- JSON protocol send/receive
- Error handling for bridge failures
- MCP tool parameter validation

### Nice-to-Have Coverage
- XML parsing edge cases
- Tree parsing variations
- Less common error scenarios

## Test Scripts

### package.json

```json
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "test:unit": "jest tests/unit",
    "test:integration": "jest tests/integration",
    "test:ci": "jest --ci --coverage --maxWorkers=2"
  }
}
```

## CI/CD Integration

### GitHub Actions Workflow

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm ci

      - name: Run tests
        run: npm run test:ci

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/lcov.info
```

## Documentation

### README Section

Add to main README.md:

```markdown
## Testing

This project includes comprehensive automated tests.

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode (development)
npm run test:watch

# Run tests with coverage report
npm run test:coverage

# Run only unit tests
npm run test:unit

# Run only integration tests
npm run test:integration
```

### Test Structure

- `tests/unit/` - Unit tests for individual modules
- `tests/integration/` - Integration tests for complete workflows
- `tests/mocks/` - Mock implementations and test data

### Writing Tests

See [TESTING.md](TESTING.md) for guidelines on writing new tests.
```

## Success Criteria

- [ ] Jest configured and working
- [ ] Mock PoB stdio process implemented
- [ ] Unit tests for all bridge methods (> 20 tests)
- [ ] Integration tests for all MCP tools (> 15 tests)
- [ ] Error handling tests (> 10 tests)
- [ ] Workflow tests (> 5 tests)
- [ ] Coverage > 80%
- [ ] All tests pass in < 5 seconds
- [ ] CI/CD workflow configured
- [ ] Documentation complete

## Future Enhancements (Phase 5.5)

- Snapshot testing for formatted outputs
- Performance benchmarking tests
- Stress testing (many concurrent operations)
- TCP client tests (when api-tcp branch ready)
- E2E tests with real PoB fork (optional)
- Visual regression testing (for formatted output)

## Dependencies

### Dev Dependencies to Add

```json
{
  "devDependencies": {
    "jest": "^29.7.0",
    "@types/jest": "^29.5.0",
    "ts-jest": "^29.1.0",
    "jest-mock-extended": "^3.0.0"
  }
}
```

## Timeline Estimate

- **Setup & Configuration**: 1-2 hours
- **Mock Implementation**: 2-3 hours
- **Unit Tests**: 3-4 hours
- **Integration Tests**: 2-3 hours
- **Documentation**: 1 hour
- **Total**: 9-13 hours of development time

## Notes

- Focus on stdio client first (api-stdio branch compatibility)
- TCP client tests can be added later when api-tcp branch is ready
- Tests should not require actual PoB fork installed
- Tests should run fast enough for TDD workflow
- Mock responses should match actual PoB API responses closely
