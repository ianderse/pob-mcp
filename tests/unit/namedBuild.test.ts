import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { readNamedBuild } from '../../src/utils/namedBuild.js';
import { handleValidateBuild } from '../../src/handlers/validationHandlers.js';

describe('readNamedBuild', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pob-named-'));
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('should return the build contents', async () => {
    await fs.writeFile(path.join(dir, 'Mine.xml'), '<PathOfBuilding/>');

    await expect(readNamedBuild('Mine.xml', dir)).resolves.toBe('<PathOfBuilding/>');
  });

  it('should name the build, the directory, and the in-memory route it did not take', async () => {
    await expect(readNamedBuild('Ghost', dir)).rejects.toThrow(/Ghost.*not found in.*omit build_name/s);
  });
});

describe('handleValidateBuild with a name that does not exist', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pob-validate-'));
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  // Previously the failed read was swallowed and the bridge's build was reported
  // under the requested name, so a wrong name produced a confident wrong report
  it('should fail rather than report on whatever the bridge holds', async () => {
    const luaClient = {
      getBuildInfo: async () => ({ name: 'SomethingElse', level: 93 }),
      getStats: async () => ({ Life: 3283 }),
      getItems: async () => [],
      loadBuildXml: async () => undefined,
    };

    const result = handleValidateBuild(
      {
        buildService: { readBuild: async () => { throw new Error('ENOENT'); } } as any,
        validationService: { validateBuild: () => ({}), formatValidation: () => '' } as any,
        pobDirectory: dir,
        getLuaClient: () => luaClient as any,
        ensureLuaClient: async () => {},
      },
      { build_name: 'NoSuchBuild' }
    );

    await expect(result).rejects.toThrow(/NoSuchBuild.*not found/s);
  });
});
