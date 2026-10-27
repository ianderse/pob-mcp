import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { XMLParser } from 'fast-xml-parser';
import { BuildService } from '../../src/services/buildService.js';
import { BuildExportService } from '../../src/services/buildExportService.js';
import { PoBLuaApiClient } from '../../src/pobLuaBridge.js';
import { atomicWriteFile } from '../../src/utils/atomicWrite.js';
import { handleRestoreSnapshot } from '../../src/handlers/exportHandlers.js';

const original = `<?xml version="1.0"?><PathOfBuilding>
<!--preserve--><Build level="90" className="Witch"><PlayerStat stat="Life" value="4000"/></Build>
<Tree activeSpec="2"><Spec nodes="1"/><Spec nodes="6338,123" masteryEffects="{6338,1}"><URL>https://example.com/?a=1&amp;b=2</URL></Spec></Tree>
<Notes><![CDATA[Original & <notes>]]></Notes><Items><Item id="1">Rarity: RARE\nExample</Item></Items>
<Skills activeSkillSet="2"><SkillSet id="2"/></Skills><Config><Input name="customMods" string="+10 to maximum Life"/></Config>
</PathOfBuilding>`;
const parse = (xml: string) => new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' }).parse(xml).PathOfBuilding;

describe('build persistence', () => {
  let directory: string;
  let builds: BuildService;
  let exports: BuildExportService;
  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'pob-persistence-'));
    await fs.writeFile(path.join(directory, 'fixture.xml'), original);
    builds = new BuildService(directory);
    exports = new BuildExportService(directory);
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    await fs.rm(directory, { recursive: true, force: true });
  });

  it('edits only the active spec, keeps XML semantics, and retries without drift', async () => {
    const options = { buildName: 'fixture', nodes: ['6338', '456'], masteryEffects: { 6338: 31556 } };
    const first = await exports.saveTree(builds, options);
    const saved = await fs.readFile(path.join(directory, 'fixture.xml'), 'utf8');
    const before = parse(original), after = parse(saved);
    for (const name of ['Build', 'Notes', 'Items', 'Skills', 'Config']) expect(after[name]).toEqual(before[name]);
    expect(saved).toContain('<Notes>');
    expect(saved).toContain('<!--preserve-->');
    expect(after.Tree.Spec[0]).toEqual(before.Tree.Spec[0]);
    expect(after.Tree.Spec[1].URL).toEqual(before.Tree.Spec[1].URL);
    expect(after.Tree.Spec[1]['@_masteryEffects']).toBe('{6338,31556}');
    expect(after.Tree.Spec[1].MasteryEffect).toBeUndefined();
    expect(await fs.readFile(first.backupPath!, 'utf8')).toBe(original);
    const second = await exports.saveTree(builds, options);
    expect(second.backupPath).not.toBe(first.backupPath);
    expect(await fs.readFile(path.join(directory, 'fixture.xml'), 'utf8')).toBe(saved);
    expect((await new BuildService(directory).readBuild('fixture')).Notes).toBe('Original & <notes>');
    await exports.saveTree(builds, { ...options, masteryEffects: {} });
    expect(parse(await builds.readBuildXml('fixture')).Tree.Spec[1]['@_masteryEffects']).toBe('');
  });

  it('exports from original XML and does not append notes to the source cache', async () => {
    const build = await builds.readBuild('fixture');
    const result = await exports.exportBuild(build, { outputName: 'copy', notes: 'Added & <extra>' }, original);
    const saved = await fs.readFile(result.filePath, 'utf8');
    expect(parse(saved).Notes).toContain('Original & <notes>');
    expect(parse(saved).Notes).toContain('Added & <extra>');
    expect(parse(saved).Tree).toEqual(parse(original).Tree);
    expect(build.Notes).toBe('Original & <notes>');
    expect(await builds.readBuildXml('fixture')).toBe(original);
  });

  it('canonicalizes cache aliases and invalidates both spellings', async () => {
    const first = await builds.readBuild('fixture');
    expect(await builds.readBuild('fixture.xml')).toBe(first);
    await fs.writeFile(path.join(directory, 'fixture.xml'), original.replace('4000', '5000'));
    builds.invalidateBuild('fixture.xml');
    expect((await builds.readBuild('fixture')).Build!.PlayerStat).toEqual({ stat: 'Life', value: '5000' });
  });

  it('preserves an existing file on collision or interrupted commit', async () => {
    const file = path.join(directory, 'fixture.xml');
    await expect(atomicWriteFile(file, 'replacement', false)).rejects.toMatchObject({ code: 'EEXIST' });
    jest.spyOn(fs, 'rename').mockRejectedValueOnce(new Error('interrupted commit'));
    await expect(atomicWriteFile(file, 'replacement', true)).rejects.toThrow('interrupted commit');
    expect(await fs.readFile(file, 'utf8')).toBe(original);
    expect(await fs.readdir(directory)).toEqual(['fixture.xml']);
  });

  it('keeps legacy snapshots discoverable after canonicalizing new names', async () => {
    const legacy = path.join(directory, '.pob-mcp', 'snapshots', 'fixture');
    await fs.mkdir(legacy, { recursive: true });
    await fs.writeFile(path.join(legacy, 'old_legacy.xml'), original);
    await fs.writeFile(path.join(legacy, 'old_metadata.json'), JSON.stringify({ tag: 'legacy', timestamp: '2020-01-01' }));
    const current = await exports.snapshotBuild(builds, { buildName: 'fixture.xml', tag: 'current' });
    expect((await exports.listSnapshots('fixture')).total).toBe(2);
    expect((await exports.listSnapshots('fixture.xml')).total).toBe(2);
    await exports.restoreSnapshot({ buildName: 'fixture.xml', snapshotId: 'old' });
    expect(await builds.readBuildXml('fixture')).toBe(original);
    expect(current.snapshotPath).toContain('fixture.xml');
  });

  it('forgets the old source when a native import fails', async () => {
    const client = new PoBLuaApiClient();
    const send = jest.spyOn(client as any, 'send').mockResolvedValue({ ok: true });
    await client.loadBuildXml(original, 'fixture', path.join(directory, 'fixture.xml'));
    expect(client.getLoadedFilePath()).toBeDefined();
    send.mockResolvedValueOnce({ ok: false, error: 'PoB did not initialize the build' });
    await expect(client.loadBuildXml('<invalid/>')).rejects.toThrow('did not initialize');
    expect(client.getLoadedFilePath()).toBeUndefined();
  });

  it.each([false, true])('reports the live reload outcome after restore (fails=%s)', async (fail) => {
    const snapshot = await exports.snapshotBuild(builds, { buildName: 'fixture' });
    await fs.writeFile(path.join(directory, 'fixture.xml'), original.replace('4000', '2000'));
    const loadBuildXml = jest.fn(async () => { if (fail) throw new Error('bridge unavailable'); });
    const context = { buildService: builds, exportService: exports, luaClient: {
      getLoadedFilePath: () => path.join(directory, 'fixture.xml'), loadBuildXml,
    } };
    const result = await handleRestoreSnapshot(context as any, { build_name: 'fixture', snapshot_id: snapshot.snapshotId });
    expect(result.isError).toBe(fail);
    expect(loadBuildXml).toHaveBeenCalledWith(original, 'fixture', path.join(directory, 'fixture.xml'));
    expect(await builds.readBuildXml('fixture')).toBe(original);
    if (fail) expect(result.content[0].text).toContain('file was restored, but the live reload FAILED');
  });

  it('does not replace another in-memory build while restoring a file', async () => {
    const snapshot = await exports.snapshotBuild(builds, { buildName: 'fixture' });
    const loadBuildXml = jest.fn();
    const result = await handleRestoreSnapshot({ buildService: builds, exportService: exports, luaClient: {
      getLoadedFilePath: () => path.join(directory, 'other.xml'), loadBuildXml,
    } } as any, { build_name: 'fixture', snapshot_id: snapshot.snapshotId });
    expect(loadBuildXml).not.toHaveBeenCalled();
    expect(result.content[0].text).toContain('left unchanged');
  });

  it('protects unrelated save targets, permits explicit replacement, and tracks source identity', async () => {
    const client = new PoBLuaApiClient();
    (client as any).send = jest.fn(async (request: any) => {
      if (request.action === 'save_build') {
        await fs.writeFile(request.params.path, original.replace('4000', '6000'));
        return { ok: true, result: { size: 123 } };
      }
      return { ok: true };
    });
    const target = path.join(directory, 'fixture.xml');
    await client.loadBuildXml(original, 'fixture'); // A display name does not establish a file source.
    await expect(client.saveBuild(target)).rejects.toThrow('overwrite: true');
    expect(await fs.readFile(target, 'utf8')).toBe(original);
    await client.saveBuild(target, true);
    expect(client.getLoadedFilePath()).toBe(target);
    await client.saveBuild(target); // Re-saving this source is now allowed.
    await client.newBuild();
    expect(client.getLoadedFilePath()).toBeUndefined();
    await expect(client.saveBuild(target)).rejects.toThrow('overwrite: true');
    await client.loadBuildXml(original, 'fixture', target);
    await client.saveBuild(target);
    expect((await fs.readdir(directory)).some(name => name.startsWith('.pob-'))).toBe(false);
  });
});
