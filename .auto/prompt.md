# Autoresearch: pob-mcp-server repo cleanup + code-quality hardening

## Objective
Clean up this TypeScript MCP server (bridges Claude ↔ Path of Building via a Lua stdio
bridge + PoE trade/poe.ninja APIs). Reduce static debt points AND fix the verified
behavioral bugs found in the full-repo code review (below), each with a regression test.

## Metrics
- **Primary**: `debt_points` (issues, LOWER is better) =
  tsc_strict_errors(noUnusedLocals/Params) + explicit_any + non_null_assert + empty_catch + ts_ignore + dead_exports
- **Secondary**: tsc_strict_errors, explicit_any, non_null_assert, empty_catch, ts_ignore, dead_exports, src_loc
- Baseline (measured, AST detectors): **498** = tsc_strict 70 + explicit_any 251 + non_null 30 + empty_catch 50 + ts_ignore 0 + dead_exports 97. src_loc 25543, 64 files.
- Note: any/catch counts are AST-token-accurate (`.auto/count_tokens.mjs`), higher than grep estimates (comments excluded, nested counted).

## How to Run
`./.auto/measure.sh` — outputs `METRIC name=number` lines (~4s, deterministic).
`./.auto/checks.sh` — `tsc --noEmit` + full jest WITH coverage thresholds. Must pass.

## KEEP RULE (session-specific deviation — IMPORTANT)
Static cleanup (any/dead-exports/strict errors) → keep iff `debt_points` drops.
Behavioral bug fixes do NOT move debt_points. For those: keep iff
(a) a regression test fails-before/passes-after (write a throwaway repro first),
(b) checks.sh passes, (c) debt_points does NOT increase. Log them with asi `kind=bugfix`.
NEVER keep a run whose only effect is cosmetic. Simpler-is-better still applies.

## Files in Scope
- `src/**` — all server code (handlers/, services/, server/, utils/, data/ is GENERATED — see off-limits).
- `tests/**` — jest suites (35 files, 414 tests baseline), smoke tests (.mjs), mocks, fixtures.
- `lua/pob_ops.lua`, `lua/vanilla_stdio_bridge.lua` — PoB-side bridge.
- `scripts/**`, `run_crafting.mjs`, `package.json`, `tsconfig*.json`, `jest.config.cjs`, `.github/workflows/**`.

## Off Limits
- `src/data/itemFormat.generated.ts` and `tests/fixtures/item-oracle.json` — generated from a
  PoB checkout not present on this machine. Never hand-edit. `scripts/generate-*.mjs --check`
  cannot run here (needs PoB source); do not add them to checks.sh.
- `.auto/measure.sh`, `.auto/dead_exports.mjs` — detectors: NEVER weaken, exclude files, or
  special-case. If a detector is WRONG (false positive on a live symbol), fix the detector
  generically and re-baseline with `init_experiment` only if the baseline shifts.
- No new runtime dependencies. devDeps additions need a strong reason.
- `.claude/`, `agent-os/`, `docs/`, `README.md` — don't churn except where behavior changed.

## Constraints (anti-cheat)
- NEVER delete or weaken a test to make checks pass. Tautology/wiring tests (source-grep
  meta-tests, `typeof === 'function'` asserts, mock-identity passthrough) MAY be deleted
  when listed in the review below — note which in asi. Coverage thresholds backstop this.
- `any` removal must be REAL: concrete types, or `unknown` + actual narrowing. A blind
  `as unknown as X` cast is cosmetic — revert it.
- No `@ts-ignore`/`@ts-expect-error`, no flag downgrades, no `.eslint-disable` equivalents.
- Dead export fix = delete it, or un-export if used locally. Deleting a whole file requires
  zero references in src+tests (verify with grep before deleting).
- `console.log` in src stays 0. No TODO markers left behind.
- One logical change per experiment. Commit messages via log_experiment descriptions.

## Verified Review Findings (2026-11-03, 4 reviewers, full-repo read)
Fix these across the loop. Majors list = work queue; mark `[done @commit]` as fixed.

### Behavioral majors (fix-first queue, roughly risk-ordered)
1. `server/luaClientManager.ts:47-57` double-spawn race in `ensureClient()` — cleanup `await client.stop()` yields before `this.starting` assigned → two PoB processes spawn, one orphaned forever. Reserve slot BEFORE awaiting stop.
2. `services/buildExportService.ts:51-63` `output_directory` from tool args used verbatim as targetDir → arbitrary-directory write primitive (sanitizeBuildName only confines within it). Confine to pobDirectory/exports dir.
3. `pobLuaBridge.ts:174-177` PRODUCTION code branches on `process.env.JEST_WORKER_ID` (start-timeout backdoor) → real timeout path untested. Remove backdoor; fix test with fake timers.
4. `server/toolRouter.ts:665-670` `generate_shopping_list`: schema says numeric `budget` + separate `budget_tier`; router passes `args.budget` as the tier and drops `budget_tier` → TypeError crash + ignored param.
5. `services/tradeClient.ts:88` fetchItems >10 ids throws; callers pass 20-30 (`itemRecommendationEngine.ts:77`, `clusterJewelHandlers.ts:127`) → crash. Batch to ≤10.
6. `services/shoppingListService.ts:156-170` reads `items.ItemSet` as object; multi-gear-set builds have array (same fix exists at `buildService.ts:786`) → all slots report EMPTY/critical. Also its duplicate `parseItem` (:243) names items `Item Class: …`.
7. `handlers/configHandlers.ts:220-233` set_enemy_stats writes `...Resistance` keys; PoB whitelist wants `...Resist` (as read at :321) → always rejected; result discarded (:245) so reported as success. Fix keys + surface rejected.
8. `handlers/clusterJewelHandlers.ts:391-400` reads `build.PathOfBuilding.Build.Spec` but readBuild already unwrapped → "No cluster jewels" always. Also `activeSpec.activeItemSet` vs `build.Items.activeItemSet`.
9. `services/costBenefitAnalyzer.ts:120-123` misses "to all Elemental Resistances"/"all resistances" → totalResist 0 for tri-res items, mis-ranks every trade list.
10. No fetch/https.get timeouts in tradeClient, poeNinjaClient (:139/:165/:211), treeService (:59); tradeClient maxConcurrent=1 → one stall blocks all trade. Pattern exists: `AbortSignal.timeout(10000)` (craftingDataService.ts:36).
11. `services/tradeQueryBuilder.ts:180-188` forwards rare/magic/normal to rarity.option which only accepts any/nonunique/unique/... → API 400 on common input. Map to nonunique.
12. `services/statMapper.ts:435-477` startup loadFromTradeAPI clears static mappings, sets `pobName: entry.id` → `getTradeId('Life')` null after boot; `STAT_MAPPINGS`/`getAllMappings`/`getByCategory` go stale two-sources-of-truth. (Also: STAT_MAPPINGS export itself dead.)
13. `services/skillGemService.ts:424-429` anti_synergies data holds gem NAMES compared against tags → declared conflicts (Trinity/Elemental Focus) never fire. Compare against names too.
14. Fake parameters presented as applied: `find_optimal_links` `optimize_for` never reaches suggestions (skillGemHandlers.ts:384); `optimize_tree` constraints printed but unenforced (optimizationHandlers.ts:351). Remove params or honor them.
15. `handlers/itemShoppingHandler.ts:166` ignores advertised `build_name`; (:183-197) bridge-less path renders placeholder life=0/resist=75 as real "Build Gaps" analysis. Honor build_name or drop from schema; disclose unavailable data.
16. `handlers/craftingAdvisorHandler.ts:142-148` silent fallback `{chaos:1, divine:200}` rendered as live "1 Divine = 200 Chaos". Label fallback.
17. `handlers/exportHandlers.ts:273` keystones section never renders (`get_tree` returns no keystones).
18. `handlers/luaHandlers.ts:653,775` + `buildGoalsHandlers.ts:97` rely on `tree.ascendancyPointsUsed` which `pob_ops.lua get_tree` never returns → cap guard dead, unspent-points wrong. Return it from Lua or derive in TS.
19. `poeNinjaHandlers.ts:221-245` broken conversion chain still prints final `Result:` + profit verdict.
20. `lua/pob_ops.lua:1007` save_build ignores `f:write` result (reports success on failure); `:495-510` calc_with skips mastery restore if calcFunc raises → leaks mastery state into next get_tree/save.
21. `lua/vanilla_stdio_bridge.lua:278` JSON scalar line → index-on-scalar crash kills bridge. Type-check request.
22. `scripts/generate-item-format.mjs --check` + `generate-item-oracle.mjs --check` false-fail on any machine at a different PoB commit (revision stamp byte-compared). Compare data tables, ignore revision line. (CANNOT be verified here — no PoB checkout — fix by inspection only, note in asi.)
23. `defensiveAnalyzer.ts:199` EHP uncapped despite comment; `:426` resist-gap parses display strings, breaks on `62.5%` → wrong "need +75%".
24. `.github/workflows/` has NO test CI at all (only contributors bot). Add workflow running build+jest+coverage.
25. `jest.config.cjs:26-33` declares coverage thresholds 80/80/75/85 that the suite has NEVER met (actual: st 51.87 br 39.90 ln 53.28 fn 58.94) → `npm run test:coverage` and `test:ci` ALWAYS exit nonzero; declared contract is fiction. Fix thresholds to honest floor (keep raising as dead code goes).

### Static debt (what the metric counts)
- 70 tsc strict errors: unused locals/params/imports incl. `index.ts` 7 dead delegate methods + unused imports/parser field; `watchService.ts` unused TreeService import; treeService unused params; skillLinkOptimizer `buildArchetype` param.
- ~102 dead exports: 15 handler `*Context` interfaces (router builds inline literals — delete or start using); `tradeTypes.ts` types re-export-only (KEEP — reachable via ItemListing chain, detector treats `export type {}` consumer as use); truly dead service APIs: StatMapper.getTradeId/getPobName/getByCategory/getAllMappings/pobStatToTradeFilter(s), TradeApiClient.getStats/clearCache/clearCachePattern, PoeNinjaClient.getFragmentRates/clearCache, TradeQueryBuilder.fromItemRequirements/reset, ItemRecommendationEngine.findUpgrades (NOTE: called by itemShoppingHandler — verify before deleting), responseUtils.truncateResponse export, toolSchemas.ToolSchema, types.ts severity enums used only in-file, PoBLayout type.
- 216 explicit any (biggest pool; itemParser/build XML shapes), 30 non-null assertions, 9 empty catches.

### Duplication clusters (fix when touching the area)
- `defensiveAnalyzer.ts` getStat closure ×5 (:152,:185,:236,:290,:356) → one helper.
- Item-set normalization ×3 in buildService + broken 4th copy shoppingListService → shared util.
- `contextBuilder.buildTreeContext` verbatim dup of `buildHandlerContext`; toolRouter config-context ×3; buildHandlers/optimizationHandlers/advancedOptimization "load build if different" ×3.
- tradeHandlers formatItemRecommendations ≈ formatResistanceRecommendations; Ring1/Ring2 SLOT_KNOWLEDGE copies; flask/jewel Prefix: stripping ×2; getStats/getStatData dup.
- `ToolResponse` type defined twice (responseUtils.ts + toolRouter.ts:52).
- tests: PoB-installed guard ×2, textOf ×3, inline stdio transport in crafting/trade smoke vs shared mcpClient.mjs.

### Tautology/dead tests (deletable per anti-cheat rule, list-driven)
`pobLuaBridge.simple.test.ts:37-103` typeof block; `contextBuilder.test.ts` identity-passthrough; `pathTraversal.test.ts:20-48` source-grep meta-tests; mocks: setupChildProcessMock/simulateSlowResponse/registerResponse/resetResponses/clearRequests + MOCK_ERROR_RESPONSES.invalid_* ; unreferenced: run_crafting.mjs, state-truthfulness.mjs (has no runner — add script instead of deleting), mcpClient timeout handle never cleared (smoke hangs 60s post-pass — clear timer).

## What's Been Tried
(append after each experiment: what, result, why kept/discarded)
