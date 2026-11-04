# Ideas backlog (deferred)

Closed (do not re-add): ToolGate removal (wave 11) · optimize_tree enforcement (wave 8) ·
smoke transports → mcpClient.mjs + state-truthfulness runner (waves 20, 25) ·
analyzePathOptimizations real BFS-vs-optimal (wave 28) · {corruptedRange} wired (wave 29) ·
CI workflow (wave 8) · empty catches triaged + logged (wave 6) · generator stamp tolerance (wave 26).

Still open:
- keystones section (finding 17): exportHandlers renders `tree.keystones`, but the bridge
  `get_tree` returns ids without names. TS-side derivation from fetched tree.lua
  (TreeService.mapNodesToDetails) is possible offline; the LIVE path can only be verified
  with PoB running. Blocked-on-environment, low offline confidence.
- (verified 2026-11-03 wrap) tradeQueryBuilder.fromItemRequirements: purge DID catch it —
  no such symbol remains. Entry closed.
