#!/bin/bash
# Correctness gate: build compiles + every test passes + coverage holds at floor.
# Hard invariant: >=414 tests must PASS (baseline 2026-11-03) — test deletion/removal
# is impossible. Coverage % floors are composition-sensitive (deleting COVERED dead
# code lowers global %); they anchor to the latest honest baseline and only move
# when a reviewer-justified removal explains the shift. RAISE them as coverage grows.
set -euo pipefail
cd "$(dirname "$0")/.."

export MIN_TESTS=414
# Re-anchored 2026-11-03 after dead-code wave (see log_experiment #2 asi)
export FLOOR_ST=49.8 FLOOR_BR=38.5 FLOOR_LN=51.2 FLOOR_FN=56.0

npx tsc --noEmit
OUT=$(npx jest --coverage --coverageThreshold='{}' --coverageReporters=json-summary --silent --reporters=summary 2>&1 | tail -5)
echo "$OUT"
export JEST_OUT="$OUT"
node -e '
const out = process.env.JEST_OUT || "";
const m = out.match(/Tests:\s+(\d+) passed/);
const passed = m ? +m[1] : 0;
let bad = 0;
if (passed < +process.env.MIN_TESTS) { console.log(`TEST FLOOR FAIL: ${passed} < ${process.env.MIN_TESTS}`); bad = 1; }
const t = require("./coverage/coverage-summary.json").total;
const floors = { statements: +process.env.FLOOR_ST, branches: +process.env.FLOOR_BR, lines: +process.env.FLOOR_LN, functions: +process.env.FLOOR_FN };
for (const [k, v] of Object.entries(floors)) if (t[k].pct < v) { console.log(`COVERAGE FLOOR FAIL ${k}: ${t[k].pct} < ${v}`); bad = 1; }
process.exit(bad);
'
