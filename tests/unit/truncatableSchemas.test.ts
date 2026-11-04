import { describe, it, expect } from '@jest/globals';
import {
  getToolSchemas, getLuaToolSchemas, getOptimizationToolSchemas, getConfigToolSchemas,
  getValidationToolSchemas, getExportToolSchemas, getSkillGemToolSchemas, getTradeToolSchemas,
  getPoeNinjaToolSchemas, getBuildGoalsToolSchemas,
} from '../../src/server/toolSchemas.js';
import { shouldTruncate } from '../../src/server/responseUtils.js';

// Truncation policy now lives on the tool schema (ToolSchema.truncatable).
// Before this, index.ts kept a hand-maintained name list that silently rotted:
// unbounded-output tools added later were never covered by it.

const allTools = () => [
  ...getToolSchemas(),
  ...getLuaToolSchemas(),
  ...getOptimizationToolSchemas(),
  ...getConfigToolSchemas(),
  ...getValidationToolSchemas(),
  ...getExportToolSchemas(),
  ...getSkillGemToolSchemas(),
  ...getTradeToolSchemas(),
  ...getPoeNinjaToolSchemas(),
  ...getBuildGoalsToolSchemas(),
];

describe('truncatable schema flags', () => {
  it('keeps every tool the old index.ts allowlist covered (no regressions lost in the move)', () => {
    const legacy = ['analyze_build', 'analyze_defenses', 'suggest_optimal_nodes',
      'optimize_tree', 'analyze_items', 'optimize_skill_links', 'create_budget_build',
      'search_trade_items', 'find_item_upgrades', 'find_resistance_gear', 'compare_trade_items',
      'search_cluster_jewels', 'generate_shopping_list', 'validate_build', 'get_passive_upgrades',
      'analyze_skill_links', 'suggest_support_gems', 'find_optimal_links', 'compare_gem_setups',
      'lua_get_stats', 'suggest_masteries'];
    const tools = allTools();
    for (const name of legacy) {
      expect(shouldTruncate(name, tools)).toBe(true);
    }
  });

  it('covers the unbounded-output tools the frozen allowlist had silently missed', () => {
    // Each emits one block per result (candidates / levels / issues / jewels /
    // node ids) with a user- or build-bounded count, i.e. unbounded length.
    const leaks = ['find_best_anointment', 'plan_leveling', 'get_build_issues',
      'analyze_build_cluster_jewels', 'lua_get_tree'];
    const tools = allTools();
    for (const name of leaks) {
      expect(shouldTruncate(name, tools)).toBe(true);
    }
  });

  it('never marks raw build-data tools truncatable (truncated XML is corrupt data)', () => {
    const dataTools = allTools().filter((t) => /xml|snapshot/i.test(t.name));
    expect(dataTools.length).toBeGreaterThan(0);
    for (const t of dataTools) {
      expect(t.truncatable).toBeUndefined();
    }
  });

  it('shouldTruncate matches name and flag together', () => {
    const tools = [{ name: 'a', truncatable: true }, { name: 'b' }];
    expect(shouldTruncate('a', tools)).toBe(true);
    expect(shouldTruncate('b', tools)).toBe(false);
    expect(shouldTruncate('missing', tools)).toBe(false);
  });
});
