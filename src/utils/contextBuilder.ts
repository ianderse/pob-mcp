/**
 * Context Builder
 *
 * Centralizes the creation of handler contexts to ensure consistency
 * and make it easier to extend or modify context structures.
 */

import type { BuildService } from '../services/buildService.js';
import type { TreeService } from '../services/treeService.js';
import type { WatchService } from '../services/watchService.js';
import type { ValidationService } from '../services/validationService.js';
import type { PoBLuaApiClient, PoBLuaTcpClient } from '../pobLuaBridge.js';

/**
 * Context for basic build and tree handlers
 */
export interface HandlerContext {
  buildService: BuildService;
  treeService: TreeService;
  validationService: ValidationService;
}

/**
 * Context for watch handlers (includes watchService)
 */
export interface WatchContext {
  buildService: BuildService;
  treeService: TreeService;
  watchService: WatchService;
}

/**
 * Context for Lua-related operations
 */
export interface LuaContext {
  pobDirectory: string;
  luaEnabled: boolean;
  useTcpMode: boolean;
  getLuaClient: () => PoBLuaApiClient | PoBLuaTcpClient | null;
  ensureLuaClient: () => Promise<void>;
  stopLuaClient: () => Promise<void>;
}

/**
 * Context for item and skill operations (subset of Lua operations)
 */
export interface ItemSkillContext {
  getLuaClient: () => PoBLuaApiClient | PoBLuaTcpClient | null;
  ensureLuaClient: () => Promise<void>;
}

/**
 * Context for optimization operations (combines build/tree services with Lua)
 */
export interface OptimizationContext {
  buildService: BuildService;
  treeService: TreeService;
  pobDirectory: string;
  getLuaClient: () => PoBLuaApiClient | PoBLuaTcpClient | null;
  ensureLuaClient: () => Promise<void>;
}

/**
 * Dependencies needed to build all context types
 */
export interface ContextDependencies {
  buildService: BuildService;
  treeService: TreeService;
  watchService: WatchService;
  validationService: ValidationService;
  pobDirectory: string;
  luaEnabled: boolean;
  useTcpMode: boolean;
  getLuaClient: () => PoBLuaApiClient | PoBLuaTcpClient | null;
  ensureLuaClient: () => Promise<void>;
  stopLuaClient: () => Promise<void>;
}

/**
 * ContextBuilder provides a centralized way to create handler contexts
 */
export class ContextBuilder {
  constructor(private deps: ContextDependencies) {}

  /**
   * Build context for basic handlers (build and tree operations)
   */
  buildHandlerContext(): HandlerContext {
    return {
      buildService: this.deps.buildService,
      treeService: this.deps.treeService,
      validationService: this.deps.validationService,
    };
  }

  /**
   * Build context for watch handlers
   */
  buildWatchContext(): WatchContext {
    return {
      buildService: this.deps.buildService,
      treeService: this.deps.treeService,
      watchService: this.deps.watchService,
    };
  }

  /**
   * Build context for tree operations (same as handler context currently)
   */
  buildTreeContext(): HandlerContext {
    return {
      buildService: this.deps.buildService,
      treeService: this.deps.treeService,
      validationService: this.deps.validationService,
    };
  }

  /**
   * Build context for Lua operations
   */
  buildLuaContext(): LuaContext {
    return {
      pobDirectory: this.deps.pobDirectory,
      luaEnabled: this.deps.luaEnabled,
      useTcpMode: this.deps.useTcpMode,
      getLuaClient: this.deps.getLuaClient,
      ensureLuaClient: this.deps.ensureLuaClient,
      stopLuaClient: this.deps.stopLuaClient,
    };
  }

  /**
   * Build context for item and skill operations
   */
  buildItemSkillContext(): ItemSkillContext {
    return {
      getLuaClient: this.deps.getLuaClient,
      ensureLuaClient: this.deps.ensureLuaClient,
    };
  }

  /**
   * Build context for optimization operations
   */
  buildOptimizationContext(): OptimizationContext {
    return {
      buildService: this.deps.buildService,
      treeService: this.deps.treeService,
      pobDirectory: this.deps.pobDirectory,
      getLuaClient: this.deps.getLuaClient,
      ensureLuaClient: this.deps.ensureLuaClient,
    };
  }
}
