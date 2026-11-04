#!/bin/bash
# Correctness gate: build compiles + every test passes + coverage holds at floor.
# Hard invariant: >=414 tests must PASS (baseline 2026-11-03) — test deletion/removal
# is impossible. Coverage % floors are composition-sensitive (deleting COVERED dead
# code lowers global %); they anchor to the latest honest baseline and only move
# when a reviewer-justified removal explains the shift. RAISE them as coverage grows.
set -euo pipefail
cd "$(dirname "$0")/.."

export MIN_TESTS=430
# Honest all-files floors 2026-11-03. Previous "50.06%" readings were bogus:
# roots:['tests'] kept src/ out of the haste map, so untested files never
# entered coverage. roots now includes src; real numbers are ~40/30/41/46.
export FLOOR_ST=39.8 FLOOR_BR=29.5 FLOOR_LN=41.2 FLOOR_FN=46.0

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
