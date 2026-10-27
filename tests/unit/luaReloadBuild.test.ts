import { describe, it, expect, beforeEach } from '@jest/globals';

const readFile = jest.fn(async (..._args: unknown[]) => '<?xml version="1.0"?><PathOfBuilding/>');
jest.mock('fs/promises', () => ({ __esModule: true, default: { readFile } }));

import { handleLuaReloadBuild } from '../../src/handlers/luaHandlers.js';

describe('handleLuaReloadBuild', () => {
  const loadBuildXml = jest.fn(async (..._args: unknown[]) => ({}));

  const context = {
    pobDirectory: '/builds',
    getLuaClient: () => ({ loadBuildXml, getBuildInfo: async () => ({ name: 'whatever' }) }),
    ensureLuaClient: async () => {},
  } as any;

  beforeEach(() => {
    readFile.mockClear();
    loadBuildXml.mockClear();
  });

  it('appends the suffix when the name lacks one', async () => {
    await handleLuaReloadBuild(context, 'Luminary');

    expect(readFile).toHaveBeenCalledTimes(1);
    expect(String(readFile.mock.calls[0][0])).toBe('/builds/Luminary.xml');
  });

  // The suffix check has to be case-insensitive, matching buildFileName and the
  // display-name strip on the next line. A case-sensitive endsWith produces
  // "Luminary.XML.xml", which then fails to read.
  it('treats an uppercase suffix as already present', async () => {
    await handleLuaReloadBuild(context, 'Luminary.XML');

    expect(String(readFile.mock.calls[0][0])).toBe('/builds/Luminary.XML');
  });

  it('strips the suffix for the name handed to the bridge', async () => {
    await handleLuaReloadBuild(context, 'Luminary.XML');

    expect(loadBuildXml).toHaveBeenCalledWith(expect.any(String), 'Luminary');
  });
});
