/**
 * Tool Routing Module
 *
 * Routes MCP tool calls to their corresponding handlers with proper context.
 */

import type { OptimizationConstraints } from "../treeOptimizer.js";
import type { ToolGate } from "./toolGate.js";
import type { ContextBuilder } from "../utils/contextBuilder.js";
import type { TradeApiClient } from "../services/tradeClient.js";
import type { StatMapper } from "../services/statMapper.js";
import type { ItemRecommendationEngine } from "../services/itemRecommendationEngine.js";

// Import handlers
import { handleListBuilds, handleAnalyzeBuild, handleCompareBuilds, handleGetBuildStats } from "../handlers/buildHandlers.js";
import { handleStartWatching, handleStopWatching, handleGetRecentChanges, handleWatchStatus, handleRefreshTreeData } from "../handlers/watchHandlers.js";
import { handleCompareTrees, handleTestAllocation, handleGetNearbyNodes, handleFindPath, handleAllocateNodes, handlePlanTree } from "../handlers/treeHandlers.js";
import { handleLuaStart, handleLuaStop, handleLuaNewBuild, handleLuaLoadBuild, handleLuaGetStats, handleLuaGetTree, handleLuaSetTree, handleSearchTreeNodes } from "../handlers/luaHandlers.js";
import { handleAddItem, handleGetEquippedItems, handleToggleFlask, handleGetSkillSetup, handleSetMainSkill, handleCreateSocketGroup, handleAddGem, handleSetGemLevel, handleSetGemQuality, handleRemoveSkill, handleRemoveGem, handleSetupSkillWithGems, handleAddMultipleItems } from "../handlers/itemSkillHandlers.js";
import { handleAnalyzeDefenses, handleSuggestOptimalNodes, handleOptimizeTree } from "../handlers/optimizationHandlers.js";
import { handleAnalyzeItems, handleOptimizeSkillLinks, handleCreateBudgetBuild } from "../handlers/advancedOptimizationHandlers.js";
import { handleGetConfig, handleSetConfig, handleSetEnemyStats } from "../handlers/configHandlers.js";
import { handleValidateBuild } from "../handlers/validationHandlers.js";
import { handleExportBuild, handleSaveTree, handleSnapshotBuild, handleListSnapshots, handleRestoreSnapshot } from "../handlers/exportHandlers.js";
import { handleAnalyzeSkillLinks, handleSuggestSupportGems, handleCompareGemSetups, handleValidateGemQuality, handleFindOptimalLinks } from "../handlers/skillGemHandlers.js";
import { handleSearchTradeItems, handleGetItemPrice, handleGetLeagues, handleSearchStats, handleFindItemUpgrades, handleFindResistanceGear, handleCompareTradeItems } from "../handlers/tradeHandlers.js";

export interface ToolRouterDependencies {
  toolGate: ToolGate;
  contextBuilder: ContextBuilder;
  tradeClient: TradeApiClient | null;
  statMapper: StatMapper | null;
  recommendationEngine: ItemRecommendationEngine | null;
  getLuaClient: () => any;
  ensureLuaClient: () => Promise<any>;
}

export type ToolResponse = Promise<{
  content: Array<{
    type: string;
    text: string;
  }>;
}>;

/**
 * Routes a tool call to its handler with appropriate context
 */
export async function routeToolCall(
  name: string,
  args: Record<string, unknown> | undefined,
  deps: ToolRouterDependencies
): ToolResponse {
  // Check tool gate first
  deps.toolGate.checkGate(name);

  // Create handler contexts using contextBuilder
  const handlerContext = deps.contextBuilder.buildHandlerContext();
  const watchContext = deps.contextBuilder.buildWatchContext();
  const treeContext = deps.contextBuilder.buildTreeContext();
  const luaContext = deps.contextBuilder.buildLuaContext();
  const itemSkillContext = deps.contextBuilder.buildItemSkillContext();
  const optimizationContext = deps.contextBuilder.buildOptimizationContext();
  const exportContext = deps.contextBuilder.buildExportContext();
  const skillGemContext = deps.contextBuilder.buildSkillGemContext();

  switch (name) {
    case "list_builds":
      return await handleListBuilds(handlerContext);

    case "analyze_build":
      if (!args) throw new Error("Missing arguments");
      return await handleAnalyzeBuild(handlerContext, args.build_name as string);

    case "compare_builds":
      if (!args) throw new Error("Missing arguments");
      return await handleCompareBuilds(
        handlerContext,
        args.build1 as string,
        args.build2 as string
      );

    case "get_build_stats":
      if (!args) throw new Error("Missing arguments");
      return await handleGetBuildStats(handlerContext, args.build_name as string);

    case "start_watching":
      return handleStartWatching(watchContext);

    case "stop_watching":
      return await handleStopWatching(watchContext);

    case "get_recent_changes":
      return handleGetRecentChanges(watchContext, args?.limit as number | undefined);

    case "watch_status":
      return handleWatchStatus(watchContext);

    case "refresh_tree_data":
      return await handleRefreshTreeData(watchContext, args?.version as string | undefined);

    // Phase 3 tools
    case "compare_trees":
      if (!args) throw new Error("Missing arguments");
      return await handleCompareTrees(
        treeContext,
        args.build1 as string,
        args.build2 as string
      );

    case "test_allocation":
      if (!args) throw new Error("Missing arguments");
      return await handleTestAllocation(
        treeContext,
        args.build_name as string,
        args.changes as string
      );

    case "get_nearby_nodes":
      if (!args) throw new Error("Missing arguments");
      return await handleGetNearbyNodes(
        treeContext,
        args.build_name as string,
        args.max_distance as number | undefined,
        args.filter as string | undefined
      );

    case "find_path_to_node":
      if (!args) throw new Error("Missing arguments");
      return await handleFindPath(
        treeContext,
        args.build_name as string,
        args.target_node_id as string,
        args.show_alternatives as boolean | undefined
      );

    case "allocate_nodes":
      if (!args) throw new Error("Missing arguments");
      return await handleAllocateNodes(
        treeContext,
        args.build_name as string,
        args.node_ids as string[],
        args.show_full_stats as boolean | undefined
      );

    case "plan_tree":
      if (!args) throw new Error("Missing arguments");
      return await handlePlanTree(
        treeContext,
        args.build_name as string | undefined,
        args.goals as string
      );

    // Lua bridge tools
    case "lua_start":
      return await handleLuaStart(luaContext);

    case "lua_stop":
      return await handleLuaStop(luaContext);

    case "lua_new_build":
      return await handleLuaNewBuild(luaContext);

    case "lua_load_build":
      if (!args) throw new Error("Missing arguments");
      return await handleLuaLoadBuild(
        luaContext,
        args.build_name as string | undefined,
        args.build_xml as string | undefined,
        args.name as string | undefined
      );

    case "lua_get_stats":
      return await handleLuaGetStats(luaContext, args?.category as string | undefined);

    case "lua_get_tree":
      return await handleLuaGetTree(luaContext);

    // Phase 9: Configuration Tools
    case "get_config":
      const getConfigContext = {
        getLuaClient: deps.getLuaClient,
        ensureLuaClient: deps.ensureLuaClient,
      };
      return await handleGetConfig(getConfigContext);

    case "set_config":
      if (!args) throw new Error("Missing arguments");
      const setConfigContext = {
        getLuaClient: deps.getLuaClient,
        ensureLuaClient: deps.ensureLuaClient,
      };
      return await handleSetConfig(setConfigContext, {
        config_name: args.config_name as string,
        value: args.value as boolean | number | string,
      });

    case "set_enemy_stats":
      const setEnemyContext = {
        getLuaClient: deps.getLuaClient,
        ensureLuaClient: deps.ensureLuaClient,
      };
      return await handleSetEnemyStats(setEnemyContext, {
        level: args?.level as number | undefined,
        fire_resist: args?.fire_resist as number | undefined,
        cold_resist: args?.cold_resist as number | undefined,
        lightning_resist: args?.lightning_resist as number | undefined,
        chaos_resist: args?.chaos_resist as number | undefined,
        armor: args?.armor as number | undefined,
        evasion: args?.evasion as number | undefined,
      });

    case "lua_set_tree":
      if (!args) throw new Error("Missing arguments");
      return await handleLuaSetTree(luaContext, args);

    case "search_tree_nodes":
      if (!args) throw new Error("Missing arguments");
      return await handleSearchTreeNodes(
        luaContext,
        args.keyword as string,
        args.node_type as string | undefined,
        args.max_results as number | undefined,
        args.include_allocated as boolean | undefined
      );

    // Phase 4: Item & Skill tools
    case "add_item":
      if (!args) throw new Error("Missing arguments");
      return await handleAddItem(itemSkillContext, args.item_text as string, args.slot_name as string | undefined, args.no_auto_equip as boolean | undefined);

    case "get_equipped_items":
      return await handleGetEquippedItems(itemSkillContext);

    case "toggle_flask":
      if (!args) throw new Error("Missing arguments");
      return await handleToggleFlask(itemSkillContext, args.flask_number as number, args.active as boolean);

    case "get_skill_setup":
      return await handleGetSkillSetup(itemSkillContext);

    case "set_main_skill":
      if (!args) throw new Error("Missing arguments");
      return await handleSetMainSkill(itemSkillContext, args.socket_group as number, args.active_skill_index as number | undefined, args.skill_part as number | undefined);

    case "create_socket_group":
      return await handleCreateSocketGroup(itemSkillContext, args?.label as string | undefined, args?.slot as string | undefined, args?.enabled as boolean | undefined, args?.include_in_full_dps as boolean | undefined);

    case "add_gem":
      if (!args) throw new Error("Missing arguments");
      return await handleAddGem(itemSkillContext, args.group_index as number, args.gem_name as string, args.level as number | undefined, args.quality as number | undefined, args.quality_id as string | undefined, args.enabled as boolean | undefined);

    case "set_gem_level":
      if (!args) throw new Error("Missing arguments");
      return await handleSetGemLevel(itemSkillContext, args.group_index as number, args.gem_index as number, args.level as number);

    case "set_gem_quality":
      if (!args) throw new Error("Missing arguments");
      return await handleSetGemQuality(itemSkillContext, args.group_index as number, args.gem_index as number, args.quality as number, args.quality_id as string | undefined);

    case "remove_skill":
      if (!args) throw new Error("Missing arguments");
      return await handleRemoveSkill(itemSkillContext, args.group_index as number);

    case "remove_gem":
      if (!args) throw new Error("Missing arguments");
      return await handleRemoveGem(itemSkillContext, args.group_index as number, args.gem_index as number);

    case "setup_skill_with_gems":
      if (!args) throw new Error("Missing arguments");
      return await handleSetupSkillWithGems(
        itemSkillContext,
        args.gems as Array<{name: string; level?: number; quality?: number; quality_id?: string; enabled?: boolean}>,
        args.label as string | undefined,
        args.slot as string | undefined,
        args.enabled as boolean | undefined,
        args.include_in_full_dps as boolean | undefined
      );

    case "add_multiple_items":
      if (!args) throw new Error("Missing arguments");
      return await handleAddMultipleItems(
        itemSkillContext,
        args.items as Array<{item_text: string; slot_name?: string}>
      );

    // Phase 6: Build Optimization tools
    case "analyze_defenses":
      return await handleAnalyzeDefenses(optimizationContext, args?.build_name as string | undefined);

    case "suggest_optimal_nodes":
      if (!args) throw new Error("Missing arguments");
      return await handleSuggestOptimalNodes(
        optimizationContext,
        args.build_name as string,
        args.goal as string,
        args.max_points as number | undefined,
        args.max_distance as number | undefined,
        args.min_efficiency as number | undefined,
        args.include_keystones as boolean | undefined
      );

    case "optimize_tree":
      if (!args) throw new Error("Missing arguments");
      return await handleOptimizeTree(
        optimizationContext,
        args.build_name as string,
        args.goal as string,
        args.max_points as number | undefined,
        args.max_iterations as number | undefined,
        args.constraints as OptimizationConstraints | undefined
      );

    case "analyze_items":
      const advancedOptContext = deps.contextBuilder.buildAdvancedOptimizationContext();
      return await handleAnalyzeItems(
        advancedOptContext,
        args?.build_name as string | undefined
      );

    case "optimize_skill_links":
      const skillLinkContext = deps.contextBuilder.buildAdvancedOptimizationContext();
      return await handleOptimizeSkillLinks(
        skillLinkContext,
        args?.build_name as string | undefined
      );

    case "create_budget_build":
      if (!args) throw new Error("Missing arguments");
      const budgetBuildContext = deps.contextBuilder.buildAdvancedOptimizationContext();
      return await handleCreateBudgetBuild(
        budgetBuildContext,
        {
          class_name: args.class_name as string,
          ascendancy: args.ascendancy as string | undefined,
          main_skill: args.main_skill as string,
          budget_level: args.budget_level as 'low' | 'medium' | 'high',
          focus: args.focus as 'offense' | 'defense' | 'balanced' | undefined,
        }
      );

    // Phase 7: Build Validation
    case "validate_build":
      const validationContext = deps.contextBuilder.buildValidationContext();
      return await handleValidateBuild(validationContext, {
        build_name: args?.build_name as string | undefined,
      });

    // Phase 8: Export and Persistence Tools
    case "export_build":
      if (!args) throw new Error("Missing arguments");
      return await handleExportBuild(exportContext, {
        build_name: args.build_name as string,
        output_name: args.output_name as string,
        output_directory: args.output_directory as string | undefined,
        overwrite: args.overwrite as boolean | undefined,
        notes: args.notes as string | undefined,
      });

    case "save_tree":
      if (!args) throw new Error("Missing arguments");
      return await handleSaveTree(exportContext, {
        build_name: args.build_name as string,
        nodes: args.nodes as string[],
        mastery_effects: args.mastery_effects as Record<string, number> | undefined,
        backup: args.backup as boolean | undefined,
      });

    case "snapshot_build":
      if (!args) throw new Error("Missing arguments");
      return await handleSnapshotBuild(exportContext, {
        build_name: args.build_name as string,
        description: args.description as string | undefined,
        tag: args.tag as string | undefined,
      });

    case "list_snapshots":
      if (!args) throw new Error("Missing arguments");
      return await handleListSnapshots(exportContext, {
        build_name: args.build_name as string,
        limit: args.limit as number | undefined,
        tag_filter: args.tag_filter as string | undefined,
      });

    case "restore_snapshot":
      if (!args) throw new Error("Missing arguments");
      return await handleRestoreSnapshot(exportContext, {
        build_name: args.build_name as string,
        snapshot_id: args.snapshot_id as string,
        backup_current: args.backup_current as boolean | undefined,
      });

    // Skill Gem Analysis Tools (Phase 11)
    case "analyze_skill_links":
      return await handleAnalyzeSkillLinks(skillGemContext, args);

    case "suggest_support_gems":
      return await handleSuggestSupportGems(skillGemContext, args);

    case "compare_gem_setups":
      if (!args) throw new Error("Missing arguments");
      return await handleCompareGemSetups(skillGemContext, {
        build_name: args.build_name as string,
        skill_index: args.skill_index as number | undefined,
        setups: args.setups as Array<{ name: string; gems: string[] }>,
      });

    case "validate_gem_quality":
      return await handleValidateGemQuality(skillGemContext, args);

    case "find_optimal_links":
      if (!args) throw new Error("Missing arguments");
      return await handleFindOptimalLinks(skillGemContext, {
        build_name: args.build_name as string,
        skill_index: args.skill_index as number | undefined,
        link_count: args.link_count as number,
        budget: args.budget as "league_start" | "mid_league" | "endgame" | undefined,
        optimize_for: args.optimize_for as "dps" | "clear_speed" | "bossing" | "defense" | undefined,
      });

    // ========================================
    // Trade API Tools
    // ========================================
    case "search_trade_items": {
      if (!deps.tradeClient) {
        throw new Error("Trade API is not enabled. Set POE_TRADE_ENABLED=true to enable.");
      }
      if (!args || !args.league) {
        throw new Error("Missing required argument: league");
      }
      const tradeContext = { tradeClient: deps.tradeClient, statMapper: deps.statMapper || undefined };
      return await handleSearchTradeItems(tradeContext, args as any);
    }

    case "get_item_price": {
      if (!deps.tradeClient) {
        throw new Error("Trade API is not enabled. Set POE_TRADE_ENABLED=true to enable.");
      }
      const tradeContext = { tradeClient: deps.tradeClient, statMapper: deps.statMapper || undefined };
      if (!args) throw new Error("Missing arguments");
      return await handleGetItemPrice(tradeContext, {
        item_name: args.item_name as string,
        league: args.league as string | undefined,
        item_type: args.item_type as string | undefined,
        rarity: args.rarity as "unique" | "rare" | "magic" | "normal" | undefined,
      });
    }

    case "get_leagues": {
      if (!deps.tradeClient) {
        throw new Error("Trade API is not enabled. Set POE_TRADE_ENABLED=true to enable.");
      }
      const tradeContext = { tradeClient: deps.tradeClient, statMapper: deps.statMapper || undefined };
      return await handleGetLeagues(tradeContext);
    }

    case "search_stats": {
      if (!deps.tradeClient || !deps.statMapper) {
        throw new Error("Trade API is not enabled. Set POE_TRADE_ENABLED=true to enable.");
      }
      if (!args) throw new Error("Missing arguments");
      const tradeContext = { tradeClient: deps.tradeClient, statMapper: deps.statMapper };
      return await handleSearchStats(tradeContext, {
        query: args.query as string,
        limit: args.limit as number | undefined,
      });
    }

    case "find_item_upgrades": {
      if (!deps.tradeClient || !deps.recommendationEngine) {
        throw new Error("Trade API is not enabled. Set POE_TRADE_ENABLED=true to enable.");
      }
      if (!args) throw new Error("Missing arguments");
      const tradeContext = {
        tradeClient: deps.tradeClient,
        statMapper: deps.statMapper || undefined,
        recommendationEngine: deps.recommendationEngine
      };
      return await handleFindItemUpgrades(tradeContext, args as any);
    }

    case "find_resistance_gear": {
      if (!deps.tradeClient || !deps.recommendationEngine) {
        throw new Error("Trade API is not enabled. Set POE_TRADE_ENABLED=true to enable.");
      }
      if (!args) throw new Error("Missing arguments");
      const tradeContext = {
        tradeClient: deps.tradeClient,
        statMapper: deps.statMapper || undefined,
        recommendationEngine: deps.recommendationEngine
      };
      return await handleFindResistanceGear(tradeContext, args as any);
    }

    case "compare_trade_items": {
      if (!deps.tradeClient) {
        throw new Error("Trade API is not enabled. Set POE_TRADE_ENABLED=true to enable.");
      }
      if (!args) throw new Error("Missing arguments");
      const tradeContext = {
        tradeClient: deps.tradeClient,
        statMapper: deps.statMapper || undefined,
        recommendationEngine: deps.recommendationEngine || undefined
      };
      return await handleCompareTradeItems(tradeContext, args as any);
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
