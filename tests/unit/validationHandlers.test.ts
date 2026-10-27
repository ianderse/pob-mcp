import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { handleValidateBuild } from '../../src/handlers/validationHandlers.js';

describe('validate_build named-build isolation', () => {
  let directory: string;

  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'pob-validation-'));
    await fs.writeFile(path.join(directory, 'target.xml'), '<PathOfBuilding/>');
  });

  afterEach(async () => {
    await fs.rm(directory, { recursive: true, force: true });
  });

  it.each([
    ['other.xml', false],
    ['target.xml', true],
  ])('uses flask data only when the bridge holds %s', async (loadedName, useLiveData) => {
    const build = { Build: { className: 'Witch' } };
    const xmlFlasks = { hasFreezeImmunity: false };
    const stats = { Life: 4000 };
    const luaClient = {
      getBuildInfo: jest.fn(async () => ({ name: loadedName })),
      loadBuildXml: jest.fn(async () => ({})),
      getStats: jest.fn(async () => stats),
      getItems: jest.fn(async () => [{ slot: 'Flask 1', raw: 'Immune to Freeze' }]),
    };
    const validateBuild = jest.fn((_build: any, _flasks: any, _stats: any) => ({}));
    const context = {
      pobDirectory: directory,
      buildService: {
        readBuild: async () => build,
        parseFlasks: () => xmlFlasks,
      },
      validationService: { validateBuild, formatValidation: () => 'validated' },
      getLuaClient: () => luaClient,
    };

    await handleValidateBuild(context as any, { build_name: 'target.xml' });

    expect(validateBuild).toHaveBeenCalledWith(
      build,
      expect.objectContaining({ hasFreezeImmunity: useLiveData }),
      useLiveData ? stats : undefined,
    );
    expect(luaClient.getItems).toHaveBeenCalledTimes(useLiveData ? 1 : 0);
    expect(luaClient.getStats).toHaveBeenCalledTimes(useLiveData ? 1 : 0);
    expect(luaClient.loadBuildXml).toHaveBeenCalledTimes(useLiveData ? 1 : 0);
  });
});
