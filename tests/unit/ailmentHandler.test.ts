import { describe, it, expect } from '@jest/globals';
import { handleLuaGetAilments } from '../../src/handlers/luaHandlers.js';
import type { AilmentReport } from '../../src/pobLuaBridge.js';

const contextReturning = (ailments: AilmentReport[]) =>
  ({
    ensureLuaClient: async () => {},
    getLuaClient: () => ({ getAilments: async () => ({ ailments }) }),
  }) as any;

const textOf = (result: any) => result.content[0].text as string;

const shock = (over: Partial<AilmentReport> = {}): AilmentReport => ({
  name: 'Shock',
  chanceOnHit: 45,
  chanceOnCrit: 100,
  effectMod: 2.47,
  duration: 3.76,
  minimumEffect: 5,
  maximumEffect: 50,
  appliedEffect: 0,
  calculatedEffect: 6,
  landsOnConfiguredEnemy: true,
  creditedInCalc: false,
  effectConfigVar: 'conditionShockEffect',
  enabledConfigVar: 'conditionEnemyShocked',
  enabledOnEnemy: true,
  thresholdTable: [
    { ailmentThreshold: 6349995, effect: 6, isConfiguredEnemy: true },
    { ailmentThreshold: 39743, effect: 50, note: 'maximum' },
  ],
  ...over,
});

describe('handleLuaGetAilments', () => {
  it('warns when a landing ailment is credited at zero', async () => {
    const text = textOf(await handleLuaGetAilments(contextReturning([shock()])));

    expect(text).toContain('contributing nothing');
    expect(text).toContain('Not counted in your DPS');
    expect(text).toContain('Shock would land for 6% but the calculation is using 0%');
    expect(text).toContain('set_config conditionShockEffect: 6');
  });

  it('reports the threshold at which the ailment caps', async () => {
    const text = textOf(await handleLuaGetAilments(contextReturning([shock()])));

    expect(text).toContain('Reaches the 50% maximum against an ailment threshold of 39,743 or less');
  });

  it('stays quiet once the magnitude is configured', async () => {
    const configured = shock({ appliedEffect: 25, creditedInCalc: true });
    const text = textOf(await handleLuaGetAilments(contextReturning([configured])));

    expect(text).toContain('Applied by the calculation: 25%');
    expect(text).not.toContain('contributing nothing');
    expect(text).not.toContain('Not counted in your DPS');
  });

  it('does not nag about an ailment too weak to land', async () => {
    const tooWeak = shock({ calculatedEffect: 1, landsOnConfiguredEnemy: false });
    const text = textOf(await handleLuaGetAilments(contextReturning([tooWeak])));

    expect(text).toContain('below the 5% minimum, so it does not land');
    expect(text).not.toContain('Not counted in your DPS');
  });

  it('says so when the magnitude could not be read, rather than staying silent', async () => {
    const unreadable = shock({
      calculatedEffect: undefined,
      landsOnConfiguredEnemy: undefined,
      thresholdTable: undefined,
    });
    const text = textOf(await handleLuaGetAilments(contextReturning([unreadable])));

    expect(text).toContain('could not be read from the calculation');
    expect(text).toContain('Not counted in your DPS');
    expect(text).toContain('unverified');
    expect(text).toContain('conditionShockEffect');
  });

  it('does not flag an ailment the build cannot inflict at all', async () => {
    const cannotApply = shock({
      chanceOnHit: 0,
      chanceOnCrit: 0,
      calculatedEffect: undefined,
      landsOnConfiguredEnemy: undefined,
    });
    const text = textOf(await handleLuaGetAilments(contextReturning([cannotApply])));

    expect(text).not.toContain('Not counted in your DPS');
  });

  it('handles a build that inflicts nothing', async () => {
    const text = textOf(await handleLuaGetAilments(contextReturning([])));

    expect(text).toContain('inflicts no non-damaging ailments');
  });
});

describe('handleLuaGetAilments config guidance', () => {
  // PoB names these vars inconsistently, so the handler must print what the
  // engine reported rather than deriving them from the ailment name.
  it('uses the reported var names verbatim for a non-Shock ailment', async () => {
    const chill: AilmentReport = {
      name: 'Chill',
      chanceOnHit: 100,
      chanceOnCrit: 100,
      minimumEffect: 5,
      maximumEffect: 30,
      appliedEffect: 0,
      calculatedEffect: 12,
      landsOnConfiguredEnemy: true,
      creditedInCalc: false,
      effectConfigVar: 'conditionEnemyChilledEffect',
      enabledConfigVar: 'conditionEnemyChilled',
      enabledOnEnemy: false,
    };
    const text = textOf(await handleLuaGetAilments(contextReturning([chill])));

    // the naive derivation would have emitted "conditionChillEffect"
    expect(text).toContain('conditionEnemyChilledEffect: 12');
    expect(text).not.toContain('conditionChillEffect');
    // the enable flag is required too, and is currently off
    expect(text).toContain('conditionEnemyChilled: true');
  });

  it('omits the enable flag when it is already set', async () => {
    const text = textOf(await handleLuaGetAilments(contextReturning([shock()])));

    expect(text).toContain('set_config conditionShockEffect: 6');
    expect(text).not.toContain('conditionEnemyShocked: true');
  });

  it('states that magnitude covers only the main skill', async () => {
    const text = textOf(await handleLuaGetAilments(contextReturning([shock()])));

    expect(text).toContain('main skill');
    expect(text).toContain('not included');
  });
});
