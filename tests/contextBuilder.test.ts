import { describe, it, expect } from '@jest/globals';
import { ContextBuilder } from '../src/utils/contextBuilder';
import type { ContextDependencies } from '../src/utils/contextBuilder';

// Mock implementations — ContextBuilder only re-exposes what it is given, so
// empty objects suffice; they satisfy the declared dependency types.
const mock = <T,>() => ({}) as T;

const mockBuildService = mock<ContextDependencies['buildService']>();
const mockTreeService = mock<ContextDependencies['treeService']>();
const mockWatchService = mock<ContextDependencies['watchService']>();
const mockValidationService = mock<ContextDependencies['validationService']>();
const mockExportService = mock<ContextDependencies['exportService']>();
const mockSkillGemService = mock<ContextDependencies['skillGemService']>();
const mockLuaClient = mock<ReturnType<ContextDependencies['getLuaClient']>>();

const mockDeps: ContextDependencies = {
  buildService: mockBuildService,
  treeService: mockTreeService,
  watchService: mockWatchService,
  validationService: mockValidationService,
  exportService: mockExportService,
  skillGemService: mockSkillGemService,
  pobDirectory: '/test/pob',
  luaEnabled: true,
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
    });
  });

  describe('buildWatchContext', () => {
    it('should return context with buildService, treeService, and watchService', () => {
      const context = builder.buildWatchContext();

      expect(context.buildService).toBe(mockBuildService);
      expect(context.treeService).toBe(mockTreeService);
      expect(context.watchService).toBe(mockWatchService);
    });
  });


  describe('buildLuaContext', () => {
    it('should return context with Lua configuration and methods', () => {
      const context = builder.buildLuaContext();

      expect(context.pobDirectory).toBe('/test/pob');
      expect(context.luaEnabled).toBe(true);
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
    });
  });

  describe('buildExportContext', () => {
    it('should return context with buildService and exportService', () => {
      const context = builder.buildExportContext();

      expect(context.buildService).toBe(mockBuildService);
      expect(context.exportService).toBe(mockExportService);
      expect(context.luaClient).toBe(mockLuaClient);
    });
  });

  describe('buildSkillGemContext', () => {
    it('should return context with buildService and skillGemService', () => {
      const context = builder.buildSkillGemContext();

      expect(context.buildService).toBe(mockBuildService);
      expect(context.skillGemService).toBe(mockSkillGemService);
    });
  });

  describe('buildAdvancedOptimizationContext', () => {
    it('should return context with buildService and Lua methods', () => {
      const context = builder.buildAdvancedOptimizationContext();

      expect(context.buildService).toBe(mockBuildService);
      expect(context.getLuaClient()).toBe(mockLuaClient);
      expect(typeof context.ensureLuaClient).toBe('function');
    });
  });

  describe('buildValidationContext', () => {
    it('should return context with buildService, validationService, and Lua methods', () => {
      const context = builder.buildValidationContext();

      expect(context.buildService).toBe(mockBuildService);
      expect(context.validationService).toBe(mockValidationService);
      expect(context.getLuaClient()).toBe(mockLuaClient);
      expect(typeof context.ensureLuaClient).toBe('function');
    });
  });
});
