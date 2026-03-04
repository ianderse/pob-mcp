/**
 * Tool Gate
 *
 * Placeholder for future rate-limiting of high-impact tool calls.
 * MCP tools are invoked as separate requests, so in-process gating
 * cannot meaningfully prevent rapid chaining within a single LLM turn.
 * The class is kept for API compatibility; checkGate is a no-op.
 */
export class ToolGate {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  checkGate(_toolName: string): void { /* intentionally a no-op */ }
  unlock(): void { /* intentionally a no-op */ }
  isLocked(): boolean { return false; }
  getLastToolCalled(): string { return ''; }
}
