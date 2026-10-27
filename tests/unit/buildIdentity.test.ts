import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { handleAnalyzeBuild } from '../../src/handlers/buildHandlers.js';
import { BOOTSTRAP_BUILD_NAME } from '../../src/server/bootstrapBuild.js';

describe('analyze_build state isolation', () => {
  let directory: string;
  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'pob-identity-'));
    await fs.writeFile(path.join(directory, 'target.xml'), '<PathOfBuilding/>');
  });
  afterEach(async () => { await fs.rm(directory, { recursive: true, force: true }); });

  function fixture(loaded: string, source?: string) {
    const build = { Build: { level: '99' }, Skills: { activeSkillSet: '2' }, Items: {}, Tree: {} };
    const client = {
      getBuildInfo: async () => ({ name: loaded }), getLoadedFilePath: () => source,
      loadBuildXml: jest.fn(async () => ({})), getStats: jest.fn(async () => ({ Life: 6000 })),
      listSpecs: jest.fn(async () => ({ specs: [{ active: true, index: 1 }] })),
      listItemSets: jest.fn(async () => ({ itemSets: [{ active: true, id: 1 }] })),
    };
    const generateBuildSummary = jest.fn((_build: any) => 'summary');
    const validateBuild = jest.fn((_build: any, _flasks: any, _stats: any) => ({}));
    return { client, generateBuildSummary, validateBuild, context: {
      pobDirectory: directory, getLuaClient: () => client, ensureLuaClient: async () => {},
      buildService: { readBuild: async () => build, generateBuildSummary,
        parseConfiguration: () => null, parseFlasks: () => null, parseJewels: () => null },
      treeService: { analyzePassiveTree: async () => null },
      validationService: { validateBuild, formatValidation: () => 'validated' },
    } };
  }

  it('loads the requested file when the bridge only holds the bootstrap', async () => {
    const f = fixture(BOOTSTRAP_BUILD_NAME);
    await handleAnalyzeBuild(f.context as any, 'target');
    expect(f.client.loadBuildXml).toHaveBeenCalledWith('<PathOfBuilding/>', 'target', path.join(directory, 'target.xml'));
    expect(f.client.getStats).toHaveBeenCalled();
  });

  it('does not borrow any live stats or selections from a different source', async () => {
    const f = fixture('target', path.join(directory, 'other', 'target.xml'));
    const result = await handleAnalyzeBuild(f.context as any, 'target');
    expect(f.client.loadBuildXml).not.toHaveBeenCalled();
    expect(f.client.getStats).not.toHaveBeenCalled();
    expect(f.client.listSpecs).not.toHaveBeenCalled();
    expect(f.client.listItemSets).not.toHaveBeenCalled();
    expect(f.validateBuild.mock.calls[0][2]).toBeUndefined();
    expect(result.content[0].text).toContain('requested saved file');
  });

  it('does not use the item-set ID as a skill-set ID', async () => {
    const f = fixture('target', path.join(directory, 'target.xml'));
    await handleAnalyzeBuild(f.context as any, 'target');
    expect(f.generateBuildSummary.mock.calls[0][0].Skills.activeSkillSet).toBe('2');
  });
});
