import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { loadExplicitMods } from '../../src/services/modDataStore.js';
import { MOD_EXPLICIT_EXCERPT } from '../fixtures/modDataExcerpt.js';

describe('PoB affix data versions', () => {
  let root: string;
  let previousPath: string | undefined;
  beforeEach(async () => {
    previousPath = process.env.POB_PATH;
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'pob-mod-data-'));
    await fs.mkdir(path.join(root, 'src', 'Data'), { recursive: true });
    process.env.POB_PATH = path.join(root, 'src');
  });
  afterEach(async () => {
    if (previousPath === undefined) delete process.env.POB_PATH;
    else process.env.POB_PATH = previousPath;
    await fs.rm(root, { recursive: true, force: true });
  });

  it('loads legacy ModItem affixes and excludes its corruption entries', async () => {
    const corrupted = '["corrupted"] = { type = "Corrupted", "Some corruption", statOrder = { 1 }, level = 1 },';
    const legacy = MOD_EXPLICIT_EXCERPT.replace(/\n}\n$/, `\n${corrupted}\n}\n`);
    await fs.writeFile(path.join(root, 'src', 'Data', 'ModItem.lua'), legacy);
    const mods = loadExplicitMods();
    expect(mods.length).toBeGreaterThan(0);
    expect(mods.every(mod => mod.type === 'Prefix' || mod.type === 'Suffix')).toBe(true);
    expect(mods.some(mod => mod.id === 'corrupted')).toBe(false);
    expect(mods.some(mod => mod.id === 'ChaosResist6')).toBe(true);
  });

  it('prefers the current table when both layouts are present', async () => {
    await fs.writeFile(path.join(root, 'src', 'Data', 'ModItem.lua'), 'not a valid table');
    await fs.writeFile(path.join(root, 'src', 'Data', 'ModExplicit.lua'), MOD_EXPLICIT_EXCERPT);
    expect(loadExplicitMods().some(mod => mod.id === 'ChaosResist6')).toBe(true);
  });
});
