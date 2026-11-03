# Ideas backlog (deferred)
- ToolGate is a permanent no-op placeholder threaded through router deps — remove entirely or make real. Decide with owner; removal reduces plumbing.
- `optimizationHandlers.optimize_tree` either enforce constraints (real node-filtering) or drop params — behavior change to advertise in tool description.
- Replace hand-rolled smoke transports with mcpClient.mjs; wire state-truthfulness.mjs into package.json.
- treeService.analyzePathOptimizations stub ("Same for now") — implement or remove output line that implies it works.
- itemParser `{corruptedRange}` parsed but never consumed — wire into applyRange or stop storing.
- CI workflow (finding 24): jest-only workflow (smoke needs PoB). Build + jest --coverage.
- keystones section (finding 17): exportHandlers renders `tree.keystones` — bridge get_tree has no names. Needs either TS-side derivation from fetched tree.lua (TreeService.mapNodesToDetails exists) or Lua return. Smoke-only verification here; low confidence offline.
- empty_catch pool (50): many are legit `catch {}` around best-effort console error paths; need per-site triage with `catch (e) { /* reason */ }` — the counter may only count truly empty `{}` blocks; check detector semantics before mass-editing.
- tradeQueryBuilder.fromItemRequirements: dead AND stubbed (slot filter no-op) — verify whether purge removed it; if present, delete unless slot-filter-from-item is wanted.
