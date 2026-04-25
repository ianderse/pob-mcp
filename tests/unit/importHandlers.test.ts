import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import {
  handleListCharacters,
  handleImportCharacter,
  type ImportHandlerContext,
} from '../../src/handlers/importHandlers.js';

/**
 * Minimal Response-like factory used to drive the global fetch mock.
 */
function makeResponse(opts: {
  status: number;
  body?: unknown;
  text?: string;
  statusText?: string;
}): Response {
  const status = opts.status;
  const ok = status >= 200 && status < 300;
  const statusText = opts.statusText ?? (ok ? 'OK' : 'Error');
  const bodyText =
    opts.text !== undefined
      ? opts.text
      : opts.body !== undefined
        ? JSON.stringify(opts.body)
        : '';
  return {
    ok,
    status,
    statusText,
    json: async () => {
      if (opts.body !== undefined) return opts.body;
      try {
        return JSON.parse(bodyText);
      } catch {
        throw new Error('not json');
      }
    },
    text: async () => bodyText,
  } as unknown as Response;
}

/**
 * Tracks the call order of bridge methods (with timestamps) so tests can
 * verify sequential vs concurrent invocation.
 */
interface CallLog {
  method: string;
  startedAt: number;
  finishedAt?: number;
  args: unknown[];
}

interface FakeBridgeOptions {
  buildInfo?: unknown; // null/undefined = "no build loaded"
  importPassiveTreeImpl?: () => Promise<unknown>;
  importItemsSkillsImpl?: () => Promise<unknown>;
  // Snapshot data — getStats etc. are called twice (before + after).
  // Allow distinct values for each pass to make diff assertions meaningful.
  statsBefore?: Record<string, number>;
  statsAfter?: Record<string, number>;
  itemsBefore?: unknown[];
  itemsAfter?: unknown[];
  skillsBefore?: unknown;
  skillsAfter?: unknown;
  treeBefore?: unknown;
  treeAfter?: unknown;
}

function createFakeBridge(opts: FakeBridgeOptions = {}) {
  const log: CallLog[] = [];

  // Snapshot calls happen twice (once before, once after the imports).
  // We need to alternate between the "before" and "after" payloads.
  let statsCallCount = 0;
  let itemsCallCount = 0;
  let skillsCallCount = 0;
  let treeCallCount = 0;
  let buildInfoCallCount = 0;

  const record = async <T>(method: string, args: unknown[], result: T): Promise<T> => {
    const entry: CallLog = { method, startedAt: Date.now(), args };
    log.push(entry);
    // Yield to the microtask queue so concurrent calls (if any) interleave.
    await Promise.resolve();
    entry.finishedAt = Date.now();
    return result;
  };

  const client = {
    getBuildInfo: jest.fn(async () => {
      buildInfoCallCount++;
      const info = opts.buildInfo === undefined
        ? { name: 'TestBuild', level: 1, className: 'Ranger', ascendClassName: '' }
        : opts.buildInfo;
      return record('getBuildInfo', [], info);
    }),
    getStats: jest.fn(async () => {
      statsCallCount++;
      const stats = statsCallCount === 1
        ? (opts.statsBefore ?? { Life: 100 })
        : (opts.statsAfter ?? { Life: 200 });
      return record('getStats', [], stats);
    }),
    getItems: jest.fn(async () => {
      itemsCallCount++;
      const items = itemsCallCount === 1
        ? (opts.itemsBefore ?? [])
        : (opts.itemsAfter ?? []);
      return record('getItems', [], items);
    }),
    getSkills: jest.fn(async () => {
      skillsCallCount++;
      const skills = skillsCallCount === 1
        ? (opts.skillsBefore ?? { groups: [] })
        : (opts.skillsAfter ?? { groups: [] });
      return record('getSkills', [], skills);
    }),
    getTree: jest.fn(async () => {
      treeCallCount++;
      const tree = treeCallCount === 1
        ? (opts.treeBefore ?? { nodes: [] })
        : (opts.treeAfter ?? { nodes: [] });
      return record('getTree', [], tree);
    }),
    importPassiveTree: jest.fn(async (params: unknown) => {
      const entry: CallLog = {
        method: 'importPassiveTree',
        startedAt: Date.now(),
        args: [params],
      };
      log.push(entry);
      const result = opts.importPassiveTreeImpl
        ? await opts.importPassiveTreeImpl()
        : { ok: true };
      entry.finishedAt = Date.now();
      return result;
    }),
    importItemsSkills: jest.fn(async (params: unknown) => {
      const entry: CallLog = {
        method: 'importItemsSkills',
        startedAt: Date.now(),
        args: [params],
      };
      log.push(entry);
      const result = opts.importItemsSkillsImpl
        ? await opts.importItemsSkillsImpl()
        : { ok: true };
      entry.finishedAt = Date.now();
      return result;
    }),
  };

  return { client, log };
}

function makeContext(client: ReturnType<typeof createFakeBridge>['client']): ImportHandlerContext {
  return {
    getLuaClient: () => client as unknown as import('../../src/pobLuaBridge.js').PoBLuaApiClient,
    ensureLuaClient: jest.fn(async () => undefined) as unknown as () => Promise<void>,
  };
}

describe('importHandlers', () => {
  let fetchSpy: jest.SpiedFunction<typeof fetch>;
  let originalSessionId: string | undefined;

  beforeEach(() => {
    fetchSpy = jest.spyOn(globalThis, 'fetch') as jest.SpiedFunction<typeof fetch>;
    originalSessionId = process.env.POE_SESSION_ID;
    delete process.env.POE_SESSION_ID;
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    if (originalSessionId === undefined) {
      delete process.env.POE_SESSION_ID;
    } else {
      process.env.POE_SESSION_ID = originalSessionId;
    }
  });

  describe('handleListCharacters', () => {
    const { client } = createFakeBridge();
    const ctx = makeContext(client);

    it('errors when accountName is empty/whitespace and mentions discriminator', async () => {
      await expect(handleListCharacters(ctx, '')).rejects.toThrow(/discriminator/);
      await expect(handleListCharacters(ctx, '   ')).rejects.toThrow(/discriminator/);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('returns "No characters found" with a POE_SESSION_ID tip on empty list', async () => {
      fetchSpy.mockResolvedValueOnce(makeResponse({ status: 200, body: [] }));

      const result = await handleListCharacters(ctx, 'account#1234');

      expect(result.content[0].text).toContain('No characters found');
      expect(result.content[0].text).toContain('POE_SESSION_ID');
    });

    it('renders a markdown table with the expected columns', async () => {
      fetchSpy.mockResolvedValueOnce(
        makeResponse({
          status: 200,
          body: [
            {
              name: 'Char1',
              class: 'Saboteur',
              league: 'Standard',
              level: 92,
              realm: 'pc',
              lastLoginTime: 1700000000,
              pinnable: true,
            },
          ],
        })
      );

      const result = await handleListCharacters(ctx, 'account#1234');
      const text = result.content[0].text;

      expect(text).toContain(
        '| Name | Level | Class | Ascendancy | League | Realm | Last Login | Pinnable |'
      );
      expect(text).toContain(
        '|------|-------|-------|------------|--------|-------|------------|----------|'
      );
    });

    it('sorts characters by lastLoginTime descending', async () => {
      fetchSpy.mockResolvedValueOnce(
        makeResponse({
          status: 200,
          body: [
            { name: 'Old', class: 'Ranger', level: 50, lastLoginTime: 1000 },
            { name: 'Newest', class: 'Ranger', level: 90, lastLoginTime: 3000 },
            { name: 'Middle', class: 'Ranger', level: 70, lastLoginTime: 2000 },
          ],
        })
      );

      const text = (await handleListCharacters(ctx, 'account#1234')).content[0].text;
      const idxNewest = text.indexOf('Newest');
      const idxMiddle = text.indexOf('Middle');
      const idxOld = text.indexOf('Old');

      expect(idxNewest).toBeGreaterThan(0);
      expect(idxMiddle).toBeGreaterThan(idxNewest);
      expect(idxOld).toBeGreaterThan(idxMiddle);
    });

    it('resolves Saboteur to base class Shadow with ascendancy Saboteur', async () => {
      fetchSpy.mockResolvedValueOnce(
        makeResponse({
          status: 200,
          body: [
            {
              name: 'SabChar',
              class: 'Saboteur',
              league: 'Standard',
              level: 92,
              realm: 'pc',
            },
          ],
        })
      );

      const text = (await handleListCharacters(ctx, 'account#1234')).content[0].text;
      // The row should have Shadow in the Class column and Saboteur in the Ascendancy column.
      expect(text).toMatch(/\| SabChar \| 92 \| Shadow \| Saboteur \|/);
    });

    it('shows base class with Ascendancy "None" for unascended characters', async () => {
      fetchSpy.mockResolvedValueOnce(
        makeResponse({
          status: 200,
          body: [
            {
              name: 'Fresh',
              class: 'Ranger',
              league: 'Standard',
              level: 5,
              realm: 'pc',
            },
          ],
        })
      );

      const text = (await handleListCharacters(ctx, 'account#1234')).content[0].text;
      expect(text).toMatch(/\| Fresh \| 5 \| Ranger \| None \|/);
    });

    it('shows Unknown for unknown ascendancy names (forward-compat edge case)', async () => {
      // "Ancestral Commander" is hypothetical; the map won't have it.
      fetchSpy.mockResolvedValueOnce(
        makeResponse({
          status: 200,
          body: [
            {
              name: 'NewClass',
              class: 'Ancestral Commander',
              league: 'Standard',
              level: 50,
              realm: 'pc',
            },
          ],
        })
      );

      const text = (await handleListCharacters(ctx, 'account#1234')).content[0].text;
      // Class column = Unknown, Ascendancy column = Unknown.
      expect(text).toMatch(/\| NewClass \| 50 \| Unknown \| Unknown \|/);
    });

    it('handles missing/null fields gracefully (renders ?)', async () => {
      fetchSpy.mockResolvedValueOnce(
        makeResponse({
          status: 200,
          body: [
            {
              name: 'Minimal',
              class: 'Ranger',
              // level, league, realm, lastLoginTime, pinnable all missing
            },
          ],
        })
      );

      const text = (await handleListCharacters(ctx, 'account#1234')).content[0].text;
      // The row should contain ? placeholders for missing scalar fields.
      // Pattern: | Minimal | ? | Ranger | None | ? | ? | ? | ? |
      expect(text).toMatch(
        /\| Minimal \| \? \| Ranger \| None \| \? \| \? \| \? \| \? \|/
      );
    });
  });

  describe('handleImportCharacter', () => {
    /** Stub the three HTTP endpoints in the order they are awaited (Promise.all order doesn't matter to a queue, mockResolvedValueOnce handles them by call order). */
    function stubImportFetches(opts: {
      passiveBody?: string;
      itemsBody?: string;
      characters?: unknown[];
    } = {}) {
      const passiveBody = opts.passiveBody ?? '{"hashes":[1,2,3]}';
      const itemsBody = opts.itemsBody ?? '{"items":[]}';
      const characters = opts.characters ?? [
        { name: 'Hero', class: 'Saboteur', league: 'Standard', level: 90 },
      ];

      // Resolver based on URL — order in Promise.all isn't guaranteed.
      fetchSpy.mockImplementation(async (input: any) => {
        const url = String(input);
        if (url.includes('get-passive-skills')) {
          return makeResponse({ status: 200, text: passiveBody });
        }
        if (url.includes('get-items')) {
          return makeResponse({ status: 200, text: itemsBody });
        }
        if (url.includes('get-characters')) {
          return makeResponse({ status: 200, body: characters });
        }
        return makeResponse({ status: 404, text: 'unknown route' });
      });
    }

    it('throws when accountName is empty', async () => {
      const { client } = createFakeBridge();
      const ctx = makeContext(client);

      await expect(handleImportCharacter(ctx, '', 'Hero')).rejects.toThrow(
        /account_name is required/
      );
    });

    it('throws when characterName is empty', async () => {
      const { client } = createFakeBridge();
      const ctx = makeContext(client);

      await expect(handleImportCharacter(ctx, 'account#1234', '')).rejects.toThrow(
        /character_name is required/
      );
    });

    it('throws "No build loaded" when getBuildInfo returns null', async () => {
      const { client } = createFakeBridge({ buildInfo: null });
      const ctx = makeContext(client);

      await expect(
        handleImportCharacter(ctx, 'account#1234', 'Hero')
      ).rejects.toThrow(/No build loaded/);
    });

    it('throws "No build loaded" when getBuildInfo throws', async () => {
      const { client } = createFakeBridge();
      // Override getBuildInfo to reject — production code wraps with .catch(() => null).
      (client.getBuildInfo as jest.Mock).mockImplementation(async () => {
        throw new Error('bridge crashed');
      });
      const ctx = makeContext(client);

      await expect(
        handleImportCharacter(ctx, 'account#1234', 'Hero')
      ).rejects.toThrow(/No build loaded/);
    });

    it('throws "Character ... not found" when name is not in the list', async () => {
      stubImportFetches({
        characters: [{ name: 'OtherHero', class: 'Saboteur', level: 90 }],
      });
      const { client } = createFakeBridge();
      const ctx = makeContext(client);

      await expect(
        handleImportCharacter(ctx, 'account#1234', 'Hero')
      ).rejects.toThrow(/Character "Hero" not found/);
    });

    it('CRITICAL: calls importPassiveTree before importItemsSkills sequentially', async () => {
      stubImportFetches();

      // Make importPassiveTree take measurable time so we can verify
      // importItemsSkills truly waits.
      let passiveResolveAt = 0;
      let itemsStartAt = 0;
      const { client, log } = createFakeBridge({
        importPassiveTreeImpl: async () => {
          // Spin a few microtask ticks so any concurrent call would interleave.
          await new Promise((r) => setTimeout(r, 10));
          passiveResolveAt = Date.now();
          return { ok: true };
        },
        importItemsSkillsImpl: async () => {
          itemsStartAt = Date.now();
          return { ok: true };
        },
      });
      const ctx = makeContext(client);

      await handleImportCharacter(ctx, 'account#1234', 'Hero');

      // importItemsSkills must have started AT OR AFTER importPassiveTree finished.
      expect(itemsStartAt).toBeGreaterThanOrEqual(passiveResolveAt);

      // Verify call order in the log.
      const ordering = log.map((l) => l.method);
      const treeIdx = ordering.indexOf('importPassiveTree');
      const itemsIdx = ordering.indexOf('importItemsSkills');
      expect(treeIdx).toBeGreaterThan(-1);
      expect(itemsIdx).toBeGreaterThan(treeIdx);

      // captureBuildSnapshot is called twice (before + after), so getStats should
      // be invoked twice — once before importPassiveTree, once after importItemsSkills.
      const statsCalls = log
        .map((l, i) => ({ method: l.method, i }))
        .filter((x) => x.method === 'getStats');
      expect(statsCalls.length).toBe(2);
      expect(statsCalls[0].i).toBeLessThan(treeIdx);
      expect(statsCalls[1].i).toBeGreaterThan(itemsIdx);
    });

    it('forwards clear_jewels, clear_items, clear_skills, ignore_weapon_swap flags', async () => {
      stubImportFetches();
      const { client } = createFakeBridge();
      const ctx = makeContext(client);

      await handleImportCharacter(ctx, 'account#1234', 'Hero', 'pc', {
        clearJewels: false,
        clearItems: false,
        clearSkills: false,
        ignoreWeaponSwap: true,
      });

      expect(client.importPassiveTree).toHaveBeenCalledWith(
        expect.objectContaining({ clear_jewels: false })
      );
      expect(client.importItemsSkills).toHaveBeenCalledWith(
        expect.objectContaining({
          clear_items: false,
          clear_skills: false,
          ignore_weapon_swap: true,
        })
      );
    });

    it('uses defaults (clear*=true, ignoreWeaponSwap=false) when options is omitted', async () => {
      stubImportFetches();
      const { client } = createFakeBridge();
      const ctx = makeContext(client);

      await handleImportCharacter(ctx, 'account#1234', 'Hero');

      expect(client.importPassiveTree).toHaveBeenCalledWith(
        expect.objectContaining({ clear_jewels: true })
      );
      expect(client.importItemsSkills).toHaveBeenCalledWith(
        expect.objectContaining({
          clear_items: true,
          clear_skills: true,
          ignore_weapon_swap: false,
        })
      );
    });

    it('reports "build is unchanged — no rollback needed" when importPassiveTree fails', async () => {
      stubImportFetches();
      const { client } = createFakeBridge({
        importPassiveTreeImpl: async () => {
          throw new Error('bad json');
        },
      });
      const ctx = makeContext(client);

      await expect(
        handleImportCharacter(ctx, 'account#1234', 'Hero')
      ).rejects.toThrow(/build is unchanged.*no rollback needed/);
    });

    it('reports PARTIAL state and lua_reload_build hint when importItemsSkills fails after a successful tree import', async () => {
      stubImportFetches();
      const { client } = createFakeBridge({
        importItemsSkillsImpl: async () => {
          throw new Error('items boom');
        },
      });
      const ctx = makeContext(client);

      const promise = handleImportCharacter(ctx, 'account#1234', 'Hero');
      await expect(promise).rejects.toThrow(/PARTIAL state/);
      await expect(
        handleImportCharacter(ctx, 'account#1234', 'Hero')
      ).rejects.toThrow(/lua_reload_build/);
    });

    it('output includes ## Stats, ## Items, ## Skills, ## Preserved sections', async () => {
      stubImportFetches();
      const { client } = createFakeBridge();
      const ctx = makeContext(client);

      const result = await handleImportCharacter(ctx, 'account#1234', 'Hero');
      const text = result.content[0].text;

      expect(text).toContain('## Stats');
      expect(text).toContain('## Items');
      expect(text).toContain('## Skills');
      expect(text).toContain('## Preserved');
    });

    it('output includes the character info line "Level <N> <baseClass>(<asc>) — <league> (<realm>)"', async () => {
      stubImportFetches({
        characters: [
          { name: 'Hero', class: 'Saboteur', league: 'Settlers', level: 92 },
        ],
      });
      const { client } = createFakeBridge();
      const ctx = makeContext(client);

      const result = await handleImportCharacter(ctx, 'account#1234', 'Hero', 'pc');
      const text = result.content[0].text;

      // Format: "Level 92 Shadow (Saboteur) — Settlers (pc)"
      expect(text).toContain('Level 92 Shadow (Saboteur) — Settlers (pc)');
    });
  });
});
