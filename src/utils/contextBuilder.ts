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
import type { BuildExportService } from '../services/buildExportService.js';
import type { SkillGemService } from '../services/skillGemService.js';
import type { PoBLuaApiClient, PoBLuaTcpClient } from '../pobLuaBridge.js';

/**
 * Context for basic build and tree handlers
 */
export interface HandlerContext {
  buildService: BuildService;
  treeService: TreeService;
  validationService: ValidationService;
  pobDirectory: string;
  getLuaClient: () => PoBLuaApiClient | PoBLuaTcpClient | null;
  ensureLuaClient: () => Promise<void>;
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
 * Context for export and persistence operations
 */
export interface ExportContext {
  buildService: BuildService;
  exportService: BuildExportService;
  luaClient?: PoBLuaApiClient | PoBLuaTcpClient;
}

/**
 * Context for skill gem analysis operations
 */
export interface SkillGemContext {
  buildService: BuildService;
  skillGemService: SkillGemService;
  pobDirectory: string;
  getLuaClient: () => PoBLuaApiClient | PoBLuaTcpClient | null;
  ensureLuaClient: () => Promise<void>;
}

/**
 * Context for advanced optimization operations (items, skill links, budget builds)
 */
export interface AdvancedOptimizationContext {
  buildService: BuildService;
  getLuaClient: () => PoBLuaApiClient | PoBLuaTcpClient | null;
  ensureLuaClient: () => Promise<void>;
}

/**
 * Context for validation operations
 */
export interface ValidationContext {
  buildService: BuildService;
  validationService: ValidationService;
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
  exportService: BuildExportService;
  skillGemService: SkillGemService;
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
      pobDirectory: this.deps.pobDirectory,
      getLuaClient: this.deps.getLuaClient,
      ensureLuaClient: this.deps.ensureLuaClient,
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
      pobDirectory: this.deps.pobDirectory,
      getLuaClient: this.deps.getLuaClient,
      ensureLuaClient: this.deps.ensureLuaClient,
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

  /**
   * Build context for export and persistence operations
   */
  buildExportContext(): ExportContext {
    return {
      buildService: this.deps.buildService,
      exportService: this.deps.exportService,
      luaClient: this.deps.getLuaClient() || undefined,
    };
  }

  /**
   * Build context for skill gem analysis operations
   */
  buildSkillGemContext(): SkillGemContext {
    return {
      buildService: this.deps.buildService,
      skillGemService: this.deps.skillGemService,
      pobDirectory: this.deps.pobDirectory,
      getLuaClient: this.deps.getLuaClient,
      ensureLuaClient: this.deps.ensureLuaClient,
    };
  }

  /**
   * Build context for advanced optimization operations
   */
  buildAdvancedOptimizationContext(): AdvancedOptimizationContext {
    return {
      buildService: this.deps.buildService,
      getLuaClient: this.deps.getLuaClient,
      ensureLuaClient: this.deps.ensureLuaClient,
    };
  }

  /**
   * Build context for validation operations
   */
  buildValidationContext(): ValidationContext {
    return {
      buildService: this.deps.buildService,
      validationService: this.deps.validationService,
      getLuaClient: this.deps.getLuaClient,
      ensureLuaClient: this.deps.ensureLuaClient,
    };
  }
}
