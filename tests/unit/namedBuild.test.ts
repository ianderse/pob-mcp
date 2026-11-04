import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { loadBuildIfDifferent, readNamedBuild } from '../../src/utils/namedBuild.js';
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
        buildService: { readBuild: async () => { throw new Error('ENOENT'); } },
        validationService: { validateBuild: () => ({}), formatValidation: () => '' },
        pobDirectory: dir,
        getLuaClient: () => luaClient,
        ensureLuaClient: async () => {},
      } as unknown as Parameters<typeof handleValidateBuild>[0],
      { build_name: 'NoSuchBuild' }
    );

    await expect(result).rejects.toThrow(/NoSuchBuild.*not found/s);
  });
});

describe('loadBuildIfDifferent', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pob-loadifdiff-'));
    await fs.writeFile(path.join(dir, 'Same.xml'), '<PathOfBuilding/>');
  });

  afterEach(async () => { await fs.rm(dir, { recursive: true, force: true }); });

  const makeClient = (loadedName: string | null) => {
    const calls: Array<[string, string]> = [];
    return {
      calls,
      getBuildInfo: async () => {
        if (loadedName === null) throw new Error('no build loaded');
        return { name: loadedName };
      },
      loadBuildXml: async (xml: string, name: string) => { calls.push([xml, name]); },
    };
  };

  it('keeps live Lua state when the same build is already loaded', async () => {
    const client = makeClient('Same');
    await loadBuildIfDifferent(client, 'Same', dir);
    expect(client.calls).toHaveLength(0);
  });

  it('matches by basename across path prefixes', async () => {
    const client = makeClient('league/Same.xml');
    await loadBuildIfDifferent(client, 'Same.xml', dir);
    expect(client.calls).toHaveLength(0);
  });

  it('loads the requested build when a different one (or none) is loaded', async () => {
    for (const loaded of ['Other', null] as const) {
      const client = makeClient(loaded);
      await loadBuildIfDifferent(client, 'Same', dir);
      expect(client.calls).toEqual([['<PathOfBuilding/>', 'Same']]);
    }
  });

  it('fails loudly for a missing file instead of keeping the wrong build', async () => {
    const client = makeClient('SomethingElse');
    await expect(loadBuildIfDifferent(client, 'Ghost', dir)).rejects.toThrow(/Ghost.*not found/s);
  });
});
