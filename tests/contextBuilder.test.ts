import { describe, it, expect } from '@jest/globals';
import { ContextBuilder } from '../src/utils/contextBuilder';
import type { ContextDependencies } from '../src/utils/contextBuilder';

// Mock implementations
const mockBuildService = {} as any;
const mockTreeService = {} as any;
const mockWatchService = {} as any;
const mockValidationService = {} as any;
const mockExportService = {} as any;
const mockSkillGemService = {} as any;
const mockLuaClient = {} as any;

const mockDeps: ContextDependencies = {
  buildService: mockBuildService,
  treeService: mockTreeService,
  watchService: mockWatchService,
  validationService: mockValidationService,
  exportService: mockExportService,
  skillGemService: mockSkillGemService,
  pobDirectory: '/test/pob',
  luaEnabled: true,
  useTcpMode: false,
  getLuaClient: () => mockLuaClient,
  ensureLuaClient: async () => {},
  stopLuaClient: async () => {},
};

describe('ContextBuilder', () => {
  const builder = new ContextBuilder(mockDeps);

  describe('buildHandlerContext', () => {
    it('should return context with buildService, treeService, and validationService', () => {
      const context = builder.buildHandlerContext();

      expect(context.buildService).toBe(mockBuildService);
      expect(context.treeService).toBe(mockTreeService);
      expect(context.validationService).toBe(mockValidationService);
      expect(Object.keys(context)).toHaveLength(3);
    });
  });

  describe('buildWatchContext', () => {
    it('should return context with buildService, treeService, and watchService', () => {
      const context = builder.buildWatchContext();

      expect(context.buildService).toBe(mockBuildService);
      expect(context.treeService).toBe(mockTreeService);
      expect(context.watchService).toBe(mockWatchService);
      expect(Object.keys(context)).toHaveLength(3);
    });
  });

  describe('buildTreeContext', () => {
    it('should return context with buildService, treeService, and validationService', () => {
      const context = builder.buildTreeContext();

      expect(context.buildService).toBe(mockBuildService);
      expect(context.treeService).toBe(mockTreeService);
      expect(context.validationService).toBe(mockValidationService);
      expect(Object.keys(context)).toHaveLength(3);
    });
  });

  describe('buildLuaContext', () => {
    it('should return context with Lua configuration and methods', () => {
      const context = builder.buildLuaContext();

      expect(context.pobDirectory).toBe('/test/pob');
      expect(context.luaEnabled).toBe(true);
      expect(context.useTcpMode).toBe(false);
      expect(context.getLuaClient()).toBe(mockLuaClient);
      expect(typeof context.ensureLuaClient).toBe('function');
      expect(typeof context.stopLuaClient).toBe('function');
    });
  });

  describe('buildItemSkillContext', () => {
    it('should return context with getLuaClient and ensureLuaClient', () => {
      const context = builder.buildItemSkillContext();

      expect(context.getLuaClient()).toBe(mockLuaClient);
      expect(typeof context.ensureLuaClient).toBe('function');
      expect(Object.keys(context)).toHaveLength(2);
    });
  });

  describe('buildOptimizationContext', () => {
    it('should return context with services and Lua methods', () => {
      const context = builder.buildOptimizationContext();

      expect(context.buildService).toBe(mockBuildService);
      expect(context.treeService).toBe(mockTreeService);
      expect(context.pobDirectory).toBe('/test/pob');
      expect(context.getLuaClient()).toBe(mockLuaClient);
      expect(typeof context.ensureLuaClient).toBe('function');
      expect(Object.keys(context)).toHaveLength(5);
    });
  });

  describe('buildExportContext', () => {
    it('should return context with buildService and exportService', () => {
      const context = builder.buildExportContext();

      expect(context.buildService).toBe(mockBuildService);
      expect(context.exportService).toBe(mockExportService);
      expect(context.luaClient).toBe(mockLuaClient);
      expect(Object.keys(context)).toHaveLength(3);
    });
  });

  describe('buildSkillGemContext', () => {
    it('should return context with buildService and skillGemService', () => {
      const context = builder.buildSkillGemContext();

      expect(context.buildService).toBe(mockBuildService);
      expect(context.skillGemService).toBe(mockSkillGemService);
      expect(Object.keys(context)).toHaveLength(2);
    });
  });

  describe('buildAdvancedOptimizationContext', () => {
    it('should return context with buildService and Lua methods', () => {
      const context = builder.buildAdvancedOptimizationContext();

      expect(context.buildService).toBe(mockBuildService);
      expect(context.getLuaClient()).toBe(mockLuaClient);
      expect(typeof context.ensureLuaClient).toBe('function');
      expect(Object.keys(context)).toHaveLength(3);
    });
  });

  describe('buildValidationContext', () => {
    it('should return context with buildService, validationService, and Lua methods', () => {
      const context = builder.buildValidationContext();

      expect(context.buildService).toBe(mockBuildService);
      expect(context.validationService).toBe(mockValidationService);
      expect(context.getLuaClient()).toBe(mockLuaClient);
      expect(typeof context.ensureLuaClient).toBe('function');
      expect(Object.keys(context)).toHaveLength(4);
    });
  });
});
