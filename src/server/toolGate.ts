/**
 * Tool Gate
 *
 * Prevents automatic tool chaining by requiring explicit "continue" commands
 * between high-impact tool calls.
 */

const HIGH_IMPACT_TOOLS = [
  'optimize_tree',
  'suggest_optimal_nodes',
  'search_tree_nodes',
  'analyze_build',
  'compare_trees',
  'add_gem',
  'add_item',
  'create_socket_group',
  'lua_set_tree',
  'lua_new_build',
  'lua_load_build',
  'allocate_nodes',
  'analyze_defenses',
  'analyze_items',
  'optimize_skill_links',
  'create_budget_build',
  'get_nearby_nodes',
  'find_path_to_node',
  'plan_tree',
  'test_allocation',
  'setup_skill_with_gems',
  'add_multiple_items'
];

export class ToolGate {
  private locked: boolean = false;
  private lastToolCalled: string = '';

  /**
   * Check if a tool call should be allowed based on gate status
   * @throws {Error} If gate is locked and tool is high-impact
   */
  checkGate(toolName: string): void {
    // Skip gate for non-high-impact tools and the continue tool itself
    if (!HIGH_IMPACT_TOOLS.includes(toolName)) {
      return;
    }

    // If gate is locked, block the tool call
    if (this.locked) {
      throw new Error(
        `🚫 TOOL GATE LOCKED 🚫\n\n` +
        `The tool gate is locked after the previous tool call: "${this.lastToolCalled}"\n\n` +
        `You MUST stop making tool calls and ask the user what to do next.\n\n` +
        `DO NOT call any more tools. Instead:\n` +
        `1. Tell the user what you just did\n` +
        `2. Show them the results\n` +
        `3. Ask what they want to do next\n` +
        `4. Wait for their response\n\n` +
        `The user can unlock this by saying "continue" or making a new request.`
      );
    }

    // Lock the gate after this tool executes
    this.locked = true;
    this.lastToolCalled = toolName;
  }

  /**
   * Unlock the gate (called by continue tool or on new conversations)
   */
  unlock(): void {
    this.locked = false;
    this.lastToolCalled = '';
  }

  /**
   * Check if the gate is currently locked
   */
  isLocked(): boolean {
    return this.locked;
  }

  /**
   * Get the name of the last tool that was called
   */
  getLastToolCalled(): string {
    return this.lastToolCalled;
  }
}
