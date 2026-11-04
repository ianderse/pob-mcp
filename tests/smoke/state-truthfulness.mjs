// Regression smoke test: the adapter must report PoB's real state, and must not
// die on a response it cannot serialise.
// Usage: node tests/smoke/state-truthfulness.mjs   (set POB_PATH only to force a checkout)
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PoBLuaApiClient } from '../../build/pobLuaBridge.js';
import { gearedBuildXml, smokePoBSrc } from './pobSource.mjs';

const cwd = smokePoBSrc();

const client = new PoBLuaApiClient({
  cwd,
  cmd: process.env.POB_CMD,
  args: [resolve('lua/vanilla_stdio_bridge.lua')],
  env: { POB_API_STDIO: '0' },
  timeoutMs: 60_000,
});

const failures = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures.push(name);
};

try {
  await client.start();
  await client.loadBuildXml(await readFile(resolve('example-build.xml'), 'utf8'), 'truthfulness-smoke');

  // calc_with returns PoB's live object graph, which contains reference cycles.
  // Before the sanitiser this killed the process on the first call, taking the
  // caller's loaded build with it.
  const out = await client.calcWith({});
  check('calc_with returns a serialisable result', typeof out?.TotalDPS === 'number' || typeof out?.Life === 'number');
  check('bridge survives calc_with', client.isAlive());

  // The override must reach the calculator. When the success path read pcall's
  // first return (the ok-boolean) as the stats table, calc_with silently
  // returned the UNMODIFIED baseline for every "what if": a no-override call
  // still answered, so only an override that must move a stat can catch it.
  // Every sim tool (get_passive_upgrades, suggest_masteries, anoint ranking,
  // node-delta scoring) compared candidates against a wrong base.
  // Runs on the repo-owned geared fixture: example-build.xml has too few
  // allocated nodes for a life delta to be guaranteed there.
  await client.loadBuildXml(await readFile(gearedBuildXml, 'utf8'), 'truthfulness-smoke-geared');
  const baseline = await client.calcWith({});
  const allocatedForDrop = (await client.getTree()).nodes ?? [];
  // The fixture is repo-owned, so an empty allocation list is fixture damage,
  // not an environment condition worth skipping on.
  check('geared fixture has allocated nodes', allocatedForDrop.length > 0, `got ${allocatedForDrop.length}`);
  if (allocatedForDrop.length > 0) {
    const dropped = await client.calcWith({ removeNodes: allocatedForDrop });
    check(
      'calc_with applies removeNodes override',
      typeof dropped?.Life === 'number' && typeof baseline?.Life === 'number' && dropped.Life < baseline.Life,
      `Life ${baseline.Life} -> ${dropped?.Life} after dropping ${allocatedForDrop.length} nodes`,
    );
  }
  // get_items must carry PoB's own slot visibility gate (Control:IsShown):
  // this fixture is a 2-ring build saved on the 3_13 tree, so PoB's UI hides
  // Ring 3 (no AdditionalRingSlot flag) and the Graft slots (pre-3_27).
  // Consumers rely on shown=false to stop reporting "empty" for slots the
  // build cannot use.
  const gearedItems = await client.getItems();
  const bySlot = (n) => gearedItems.find((i) => i.slot === n);
  check(
    'get_items marks hidden slots shown=false',
    bySlot('Ring 3')?.shown === false && bySlot('Graft 1')?.shown === false && bySlot('Graft 2')?.shown === false,
    JSON.stringify(['Ring 3', 'Graft 1', 'Graft 2'].map((n) => [n, bySlot(n)?.shown])),
  );
  check(
    'get_items marks applicable slots shown=true',
    bySlot('Helmet')?.shown === true && bySlot('Ring 1')?.shown === true && bySlot('Weapon 1')?.shown === true,
    JSON.stringify(['Helmet', 'Ring 1', 'Weapon 1'].map((n) => [n, bySlot(n)?.shown])),
  );
  await client.loadBuildXml(await readFile(resolve('example-build.xml'), 'utf8'), 'truthfulness-smoke');

  // set_config drives off PoB's own ConfigOptions rather than a hardcoded
  // allowlist, so options outside the old list must now apply...
  const applied = await client.setConfig({ enemyIsBoss: 'Pinnacle' });
  check('known config option applies', applied.applied.enemyIsBoss === 'Pinnacle', JSON.stringify(applied.applied));

  // ...and anything PoB does not recognise must be reported, not silently swallowed.
  const bogus = await client.setConfig({ definitelyNotAConfigOption: 1 });
  check('unknown config option is rejected', Boolean(bogus.rejected.definitelyNotAConfigOption));

  const badValue = await client.setConfig({ bandit: 'NotABandit' });
  check('invalid dropdown value is rejected', Boolean(badValue.rejected.bandit));

  // Dropdowns store a val that differs from the UI label; callers need the label.
  await client.setConfig({ bandit: 'None' });
  const labels = await client.getConfigLabels();
  check('dropdown label is exposed', labels.bandit === 'Kill all', `bandit=${labels.bandit}`);

  // PassiveSpec:ImportFromNodeList silently refuses a Mastery with no effect
  // chosen, so update_tree_delta must both report the drop and offer a way to
  // supply the effect.
  const tree = await client.getTree();
  const masteryId = await findAllocatableMastery(client, tree);
  if (masteryId == null) {
    console.log('skip  mastery checks (no adjacent mastery node in example build)');
  } else {
    const withoutEffect = await client.updateTreeDelta({ addNodes: [masteryId] });
    check('mastery without an effect is reported as dropped',
      (withoutEffect.droppedNodes ?? []).includes(masteryId),
      `dropped=${JSON.stringify(withoutEffect.droppedNodes)}`);

    // set_tree passed masterySelections straight through with no fallback, so
    // any call that didn't re-specify every mastery's effect silently wiped
    // it — ImportFromNodeList only requires masterySelections[id] be truthy,
    // not a real effect id, so an arbitrary one is enough to allocate here.
    const withEffect = await client.updateTreeDelta({ addNodes: [masteryId], masteryEffects: { [masteryId]: 1 } });
    check('mastery with an effect is allocated',
      Object.prototype.hasOwnProperty.call(withEffect.tree?.masteryEffects ?? {}, masteryId),
      `masteryEffects=${JSON.stringify(withEffect.tree?.masteryEffects)}`);

    // get_mastery_options iterated node.masteryEffects (an array of
    // { effect, stats }) with pairs() and read a nonexistent `.sd` field, so
    // every option silently degraded to its array position (1, 2, 3...)
    // instead of the real stat text. A foreign-ascendancy mastery has no real
    // options for this character, so this needs a native one specifically.
    const nativeMasteryId = await findAllocatableMastery(client, tree, { ownAscendancyOnly: true });
    if (nativeMasteryId == null) {
      console.log('skip  mastery options check (no native mastery node in example build)');
    } else {
      await client.updateTreeDelta({ addNodes: [nativeMasteryId], masteryEffects: { [nativeMasteryId]: 1 } });
      const options = await client.getMasteryOptions();
      const thisMastery = (options?.masteries ?? []).find((m) => m.nodeId === nativeMasteryId);
      const optionStats = (thisMastery?.availableEffects ?? []).map((e) => e.stat);
      check('mastery options report real stat text, not array-index placeholders',
        optionStats.length > 0 && optionStats.every((s) => /[a-zA-Z]/.test(String(s))),
        `stats=${JSON.stringify(optionStats)}`);
    }

    const resetTree = await client.setTree({
      classId: withEffect.tree.classId,
      ascendClassId: withEffect.tree.ascendClassId,
      secondaryAscendClassId: withEffect.tree.secondaryAscendClassId,
      nodes: withEffect.tree.nodes,
      treeVersion: withEffect.tree.treeVersion,
    });
    check('set_tree preserves an already-allocated mastery with no masteryEffects arg',
      Object.prototype.hasOwnProperty.call(resetTree.masteryEffects ?? {}, masteryId),
      `masteryEffects=${JSON.stringify(resetTree.masteryEffects)}`);
  }
  if (failures.length) throw new Error(`${failures.length} check(s) failed: ${failures.join(', ')}`);
  console.log('\nstate-truthfulness smoke passed');
} finally {
  await client.stop?.();
}

// The example build's tree differs from any given user's, so discover a mastery
// node adjacent to it rather than hardcoding an ID.
async function findAllocatableMastery(c, tree, { ownAscendancyOnly = false } = {}) {
  const allocated = new Set(tree.nodes);
  const ownAscendancy = ownAscendancyOnly ? (await c.getBuildInfo())?.ascendClassName ?? '' : null;
  for (const keyword of ['mastery']) {
    try {
      const res = await c.searchNodes({ keyword, nodeType: 'mastery', maxResults: 30, includeAllocated: false });
      for (const node of res?.nodes ?? []) {
        // A mastery tagged with a foreign ascendancyName belongs to a class this
        // character isn't, so it has no real effect options for this build —
        // only reject those when the caller specifically needs a native one.
        const ascendancy = node.ascendancy ?? node.ascendancyName ?? '';
        const isForeignAscendancy = ownAscendancyOnly && ascendancy !== '' && ascendancy !== ownAscendancy;
        if (!isForeignAscendancy && !allocated.has(Number(node.id))) return Number(node.id);
      }
    } catch { /* search unavailable; skip the mastery checks */ }
  }
  return null;
}
