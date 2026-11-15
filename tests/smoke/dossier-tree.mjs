// scripts/dossier-tree.mjs must draw whatever the given build allocates, read
// from the build and PoB's own tree data, and refuse input it cannot honour.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { gearedBuildXml, smokePoBSrc } from './pobSource.mjs';

smokePoBSrc();
const out = mkdtempSync(join(tmpdir(), 'dossier-tree-'));
const run = (...args) =>
  spawnSync('node', ['scripts/dossier-tree.mjs', '--build', gearedBuildXml, '--out', out, ...args], { encoding: 'utf-8' });

const failures = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures.push(name);
};

try {
  const drawn = run('--icons');
  check('draws the fixture build', drawn.status === 0, drawn.stderr.trim());
  check('reads class, ascendancy and tree version from the build', /tree 3_13, Witch \/ Occultist/.test(drawn.stdout), drawn.stdout.split('\n')[0]);

  const tree = readFileSync(join(out, 'tree.svg'), 'utf-8');
  // Notables the fixture allocates; a hardcoded allocation would not name them.
  check('labels the build\'s own notables', ['Elemental Equilibrium', 'Constitution', 'Frost Walker'].every((name) => tree.includes(`>${name}</text>`)));
  const labels = tree.match(/<text /g)?.length ?? 0;
  const [, notables, keystones] = drawn.stdout.match(/(\d+) notable, (\d+) keystone/) ?? [];
  check('labels exactly the allocated notables and keystones', labels === Number(notables) + Number(keystones), `${labels} labels, ${notables} notables + ${keystones} keystones`);
  check('says when a tree has no local sprite data', /no sprite data PoB ships locally/.test(drawn.stdout));

  const ascendancy = readFileSync(join(out, 'ascendancy.svg'), 'utf-8');
  check('draws the build\'s ascendancy', ascendancy.includes('aria-label="Occultist ascendancy"') && ascendancy.includes('>Void Beacon</text>'));

  const missingSpec = run('--spec', '2');
  check('rejects a spec the build does not have', missingSpec.status === 1 && /spec 2 does not exist/.test(missingSpec.stderr), missingSpec.stderr.trim());

  const strayPlan = run('--planned', '7388');
  check('rejects a planned node outside the ascendancy', strayPlan.status === 1 && /outside the Occultist ascendancy/.test(strayPlan.stderr), strayPlan.stderr.trim());

  // From another directory the script must still find its layout helper.
  const elsewhere = spawnSync('node', [resolve('scripts/dossier-tree.mjs'), '--build', gearedBuildXml, '--out', out], { encoding: 'utf-8', cwd: tmpdir() });
  check('runs from outside the repo root', elsewhere.status === 0, elsewhere.stderr.trim());

  // A tree version comes from the build file, so it must not name a path.
  const hostile = join(out, 'hostile.xml');
  writeFileSync(hostile, readFileSync(gearedBuildXml, 'utf-8').replace('treeVersion="3_13"', 'treeVersion="../../../tmp"'));
  const traversal = spawnSync('node', ['scripts/dossier-tree.mjs', '--build', hostile, '--out', out], { encoding: 'utf-8' });
  check('rejects a tree version that is a path', traversal.status === 1 && /invalid treeVersion/.test(traversal.stderr), traversal.stderr.trim());
} finally {
  rmSync(out, { recursive: true, force: true });
}

if (failures.length > 0) {
  console.error(`dossier-tree smoke failed: ${failures.join('; ')}`);
  process.exit(1);
}
console.log('dossier-tree smoke passed');
