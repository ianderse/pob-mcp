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
  'add_multiple_items',
  // Phase 7: Build validation (comprehensive analysis)
  'validate_build',
  // Phase 8: Export and persistence tools (file-modifying)
  'export_build',
  'save_tree',
  'snapshot_build',
  'restore_snapshot'
];

export class ToolGate {
  private locked: boolean = false;
  private lastToolCalled: string = '';

  /**
   * Check if a tool call should be allowed based on gate status
   * Auto-unlocks when a new tool call arrives (user has responded)
   */
  checkGate(toolName: string): void {
    // Skip gate for non-high-impact tools
    if (!HIGH_IMPACT_TOOLS.includes(toolName)) {
      return;
    }

    // If gate is locked, a new tool call means user has responded - auto-unlock
    if (this.locked) {
      this.locked = false;
      // Continue normally - no error thrown
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
