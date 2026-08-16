import { describe, it, expect } from '@jest/globals';
import { handleLuaSimulate } from '../../src/handlers/luaHandlers.js';

/** The stats every calculation reports, so a test only states what it cares about. */
const output = (over: Record<string, unknown> = {}) => ({
  CombinedDPS: 1_000_000,
  TotalEHP: 50_000,
  Life: 5_000,
  Str: 200,
  Dex: 150,
  Int: 400,
  ReqStr: 155,
  ReqDex: 111,
  ReqInt: 188,
  ...over,
});

const contextReturning = (result: { output: unknown; base: unknown }, calls: unknown[] = []) =>
  ({
    ensureLuaClient: async () => {},
    getLuaClient: () => ({
      calcWith: async (params: unknown) => {
        calls.push(params);
        return result;
      },
    }),
  }) as any;

const textOf = (result: any) => result.content[0].text as string;

describe('handleLuaSimulate', () => {
  it('reports the delta against the unmodified build', async () => {
    const text = textOf(
      await handleLuaSimulate(
        contextReturning({ output: output({ Life: 6_200, TotalEHP: 58_000 }), base: output() }),
        { itemText: 'Rarity: RARE\nBig Chest\nQuilted Jacket', slotName: 'Body Armour' },
      ),
    );

    expect(text).toContain('Life: 5,000 → 6,200  +1,200 (+24.0%)');
    expect(text).toContain('Effective HP: 50,000 → 58,000  +8,000 (+16.0%)');
    expect(text).toContain('swap Body Armour');
  });

  it('states the build was not changed', async () => {
    const text = textOf(
      await handleLuaSimulate(contextReturning({ output: output(), base: output() }), { toggleFlask: 2 }),
    );

    expect(text).toContain('The loaded build is unchanged');
    expect(text).toContain('toggle Flask 2');
  });

  it('passes the overrides to the engine under the names the calculator uses', async () => {
    const calls: unknown[] = [];
    await handleLuaSimulate(contextReturning({ output: output(), base: output() }, calls), {
      itemText: 'item text',
      slotName: 'Ring 1',
      toggleFlask: 3,
      addNodes: [123],
    });

    expect(calls[0]).toMatchObject({ repItem: 'item text', repSlotName: 'Ring 1', toggleFlask: 3, addNodes: [123] });
  });

  it('refuses a call with no override rather than reporting a zero delta', async () => {
    await expect(handleLuaSimulate(contextReturning({ output: output(), base: output() }), {})).rejects.toThrow(
      /nothing to simulate/,
    );
  });

  it('flags an unmet attribute requirement the swap introduced', async () => {
    const unusable = output({
      Str: 100,
      ReqStr: 155,
      ReqStrItem: { source: 'Gem', sourceGem: { nameSpec: 'Enduring Cry' } },
    });
    const text = textOf(
      await handleLuaSimulate(contextReturning({ output: unusable, base: output() }), {
        itemText: 'Rarity: RARE\nWeak Chest\nQuilted Jacket',
        slotName: 'Body Armour',
      }),
    );

    expect(text).toContain('would be disabled in game');
    expect(text).toContain('Strength: needs 155, has 100 (required by Enduring Cry)');
    expect(text).not.toContain('already unmet');
  });

  it('names the item when the requirement comes from gear', async () => {
    const unusable = output({
      Int: 100,
      ReqInt: 188,
      ReqIntItem: { source: 'Item', sourceItem: { name: 'Loath Sanctuary' } },
    });
    const text = textOf(
      await handleLuaSimulate(contextReturning({ output: unusable, base: output() }), { toggleFlask: 1 }),
    );

    expect(text).toContain('Intelligence: needs 188, has 100 (required by Loath Sanctuary)');
  });

  it('does not blame the simulated change for a requirement the build already failed', async () => {
    const alreadyUnusable = output({ Dex: 50 });
    const text = textOf(
      await handleLuaSimulate(contextReturning({ output: alreadyUnusable, base: alreadyUnusable }), {
        addNodes: [1, 2],
      }),
    );

    expect(text).toContain('Dexterity: needs 111, has 50');
    expect(text).toContain('already unmet before this change');
  });

  it('stays quiet when every requirement is met', async () => {
    const text = textOf(
      await handleLuaSimulate(contextReturning({ output: output(), base: output() }), { addNodes: [1] }),
    );

    expect(text).not.toContain('would be disabled in game');
  });

  it('does not call a stat unchanged when the engine reports it as met exactly', async () => {
    // PoB's own condFunc is a strict >, so a requirement equal to the attribute is met
    const exact = output({ Str: 155, ReqStr: 155 });
    const text = textOf(
      await handleLuaSimulate(contextReturning({ output: exact, base: output() }), { addNodes: [1] }),
    );

    expect(text).not.toContain('Strength: needs 155');
  });

  it('warns rather than reassures when nothing moved', async () => {
    const text = textOf(
      await handleLuaSimulate(contextReturning({ output: output(), base: output() }), {
        itemText: 'item text',
        slotName: 'Ring 2',
      }),
    );

    expect(text).toContain('No reported stat moved');
    expect(text).toContain('Combined DPS: 1,000,000 → 1,000,000  unchanged');
  });

  it('omits unchanged stats other than the headline pair', async () => {
    const text = textOf(
      await handleLuaSimulate(contextReturning({ output: output({ Life: 5_100 }), base: output() }), {
        addNodes: [1],
      }),
    );

    expect(text).toContain('Life: 5,000 → 5,100');
    expect(text).not.toContain('Strength: 200');
    expect(text).toContain('Combined DPS');
  });
});
