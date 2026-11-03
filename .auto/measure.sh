#!/bin/bash
# Autoresearch benchmark: static debt-point counter for pob-mcp-server.
# Deterministic static analysis over src/ — no test execution (see checks.sh).
# OUTPUT CONTRACT: `METRIC name=value` lines. `debt_points` is primary.
# ANTI-GAMING: do NOT weaken detectors, add file exclusions, or rename signals.
set -euo pipefail
cd "$(dirname "$0")/.."

# 1. tsc strict probe: unused locals/params/imports (errors counted)
TSC_STRICT=$(npx tsc --noEmit --noUnusedLocals --noUnusedParameters 2>&1 | grep -c 'error TS' || true)

# 2-5. any / non-null / empty-catch / ts-ignore via TypeScript AST (shell-proof)
TOKENS=$(node .auto/count_tokens.mjs)
EXPLICIT_ANY=$(echo "$TOKENS" | awk -F= '/^ANY=/{print $2}')
NON_NULL=$(echo "$TOKENS" | awk -F= '/^NONNULL=/{print $2}')
EMPTY_CATCH=$(echo "$TOKENS" | awk -F= '/^EMPTYCATCH=/{print $2}')
TS_IGNORE=$(echo "$TOKENS" | awk -F= '/^TSIGNORE=/{print $2}')

# 6. dead exports via TypeScript import-graph
DEAD_EXPORTS=$(node .auto/dead_exports.mjs | awk '/DEAD_COUNT/{print $2}')

# 7. src LOC (secondary)
SRC_LOC=$(find src -name '*.ts' ! -name '*.d.ts' -exec cat {} + | wc -l | tr -d ' ')

DEBT=$((TSC_STRICT + EXPLICIT_ANY + NON_NULL + EMPTY_CATCH + TS_IGNORE + DEAD_EXPORTS))

echo "METRIC debt_points=$DEBT"
echo "METRIC tsc_strict_errors=$TSC_STRICT"
echo "METRIC explicit_any=$EXPLICIT_ANY"
echo "METRIC non_null_assert=$NON_NULL"
echo "METRIC empty_catch=$EMPTY_CATCH"
echo "METRIC ts_ignore=$TS_IGNORE"
echo "METRIC dead_exports=$DEAD_EXPORTS"
echo "METRIC src_loc=$SRC_LOC"
