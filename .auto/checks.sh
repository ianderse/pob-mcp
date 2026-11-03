#!/bin/bash
# Correctness gate: build compiles + full jest suite passes + coverage stays at/above
# the measured baseline floor (prevents deleting tests/coverage to game anything).
# NOTE: jest.config.cjs declares 80/80/75/85 thresholds — never achieved (repo has no CI);
# actual baseline 2026-11-03: st 51.87 br 39.90 ln 53.28 fn 58.94. RAISE floors as coverage improves.
set -euo pipefail
cd "$(dirname "$0")/.."

export FLOOR_ST=50.8 FLOOR_BR=38.9 FLOOR_LN=52.2 FLOOR_FN=57.9

npx tsc --noEmit
npx jest --coverage --coverageThreshold='{}' --coverageReporters=json-summary --silent --reporters=summary 2>&1 | tail -5
node -e '
const t = require("./coverage/coverage-summary.json").total;
const floors = { statements: +process.env.FLOOR_ST, branches: +process.env.FLOOR_BR, lines: +process.env.FLOOR_LN, functions: +process.env.FLOOR_FN };
let bad = 0;
for (const [k, v] of Object.entries(floors)) if (t[k].pct < v) { console.log(`COVERAGE FLOOR FAIL ${k}: ${t[k].pct} < ${v}`); bad = 1; }
process.exit(bad);
'
