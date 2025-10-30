import { EventEmitter } from 'events';
import { MOCK_RESPONSES, MOCK_ERROR_RESPONSES } from './responses.mock.js';

/**
 * Mock PoB Lua process that simulates stdio communication
 */
export class MockPoBProcess extends EventEmitter {
  public stdout: MockStream;
  public stderr: MockStream;
  public stdin: MockStream;
  public killed = false;
  public exitCode: number | null = null;

  private responses: Map<string, any>;
  private pendingRequests: Array<{ action: string; params?: any }> = [];

  constructor() {
    super();
    this.stdout = new MockStream();
    this.stderr = new MockStream();
    this.stdin = new MockStream();
    this.responses = new Map(Object.entries(MOCK_RESPONSES));

    // Simulate ready banner on next tick
    process.nextTick(() => {
      this.sendToStdout('{"ready":true}\n');
    });
  }

  /**
   * Simulate stdin write (from client to process)
   */
  write(data: string) {
    try {
      const request = JSON.parse(data.trim());
      this.pendingRequests.push(request);

      // Automatically respond on next tick
      process.nextTick(() => {
        this.processRequest(request);
      });
    } catch (e) {
      // Invalid JSON, ignore or send error
    }
  }

  /**
   * Process a request and send response
   */
  private processRequest(request: { action: string; params?: any }) {
    const response = this.responses.get(request.action);

    if (response) {
      this.sendToStdout(JSON.stringify(response) + '\n');
    } else {
      // Unknown action
      this.sendToStdout(
        JSON.stringify({ ok: false, error: `Unknown action: ${request.action}` }) + '\n'
      );
    }
  }

  /**
   * Send data to stdout (simulating process output)
   */
  private sendToStdout(data: string) {
    this.stdout.emit('data', data);
  }

  /**
   * Send data to stderr
   */
  private sendToStderr(data: string) {
    this.stderr.emit('data', data);
  }

  /**
   * Register a custom response for an action
   */
  registerResponse(action: string, response: any) {
    this.responses.set(action, response);
  }

  /**
   * Register an error response
   */
  registerError(action: string, errorKey: keyof typeof MOCK_ERROR_RESPONSES) {
    this.responses.set(action, MOCK_ERROR_RESPONSES[errorKey]);
  }

  /**
   * Clear all custom responses (reset to defaults)
   */
  resetResponses() {
    this.responses = new Map(Object.entries(MOCK_RESPONSES));
  }

  /**
   * Simulate process exit
   */
  exit(code: number = 0) {
    this.exitCode = code;
    this.emit('exit', code, null);
  }

  /**
   * Simulate process crash
   */
  crash() {
    this.exit(1);
  }

  /**
   * Simulate process kill
   */
  kill() {
    this.killed = true;
    this.exit(1);
  }

  /**
   * Simulate hanging (never respond)
   */
  simulateHang() {
    // Override processRequest to do nothing
    this.processRequest = () => {
      // Hang forever
    };
  }

  /**
   * Simulate slow response
   */
  simulateSlowResponse(action: string, delayMs: number) {
    const originalResponse = this.responses.get(action);
    const slowResponse = () => {
      setTimeout(() => {
        if (originalResponse) {
          this.sendToStdout(JSON.stringify(originalResponse) + '\n');
        }
      }, delayMs);
    };
    // Store function to call later
    (this.responses as any).set(action, { _slow: true, _delay: delayMs, _response: originalResponse });
  }

  /**
   * Get last request made to the process
   */
  getLastRequest(): { action: string; params?: any } | undefined {
    return this.pendingRequests[this.pendingRequests.length - 1];
  }

  /**
   * Get all requests made
   */
  getAllRequests(): Array<{ action: string; params?: any }> {
    return [...this.pendingRequests];
  }

  /**
   * Clear request history
   */
  clearRequests() {
    this.pendingRequests = [];
  }
}

/**
 * Mock stream that implements minimal EventEmitter interface
 */
class MockStream extends EventEmitter {
  private encoding = 'utf8';

  setEncoding(enc: string) {
    this.encoding = enc;
  }

  write(data: string) {
    // For stdin, we don't emit, we let the parent handle it
    return true;
  }
}

/**
 * Factory function to create mock spawn
 */
export function createMockSpawn() {
  let lastProcess: MockPoBProcess | null = null;

  const mockSpawn = jest.fn().mockImplementation((cmd: string, args: string[], options: any) => {
    const process = new MockPoBProcess();
    lastProcess = process;

    // Wire up stdin.write to the process
    process.stdin.write = (data: string) => {
      process.write(data);
      return true;
    };

    return process;
  }) as jest.Mock & {
    getLastProcess: () => MockPoBProcess | null;
  };

  // Helper to get the last created process
  mockSpawn.getLastProcess = () => lastProcess;

  return mockSpawn;
}

/**
 * Helper to setup child_process mock for tests
 */
export function setupChildProcessMock() {
  const mockSpawn = createMockSpawn();

  jest.mock('child_process', () => ({
    spawn: mockSpawn,
  }));

  return mockSpawn;
}
