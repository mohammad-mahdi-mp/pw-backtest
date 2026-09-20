#!/usr/bin/env bash
# P0-T02 gate: while the pw-engine broker is a stub, the parity harness must
# report EXACTLY 50 expected failures — proving the harness and all fixtures
# are wired. P3-T01 (broker 1:1 port) replaces this with a strict green gate.
set -euo pipefail
cd "$(dirname "$0")/../core"

count_fixtures="$(ls tests/fixtures/*.json | wc -l | tr -d ' ')"
if [ "$count_fixtures" -ne 50 ]; then
  echo "FAIL: expected exactly 50 fixture files, found $count_fixtures"
  exit 1
fi

log="$(mktemp)"
if cargo test -p pw-engine --test parity >"$log" 2>&1; then
  echo "FAIL: parity harness is green but the broker should still be a stub"
  echo "(after P3-T01, replace this script with a plain 'cargo test -p pw-engine' gate)"
  exit 1
fi

failed="$(grep -oE '[0-9]+ failed' "$log" | grep -oE '[0-9]+' | head -1 || true)"
if [ "$failed" != "50" ]; then
  echo "FAIL: expected exactly 50 failing parity tests, got '${failed:-0}'"
  echo "--- last lines ---"
  tail -n 15 "$log"
  exit 1
fi

echo "OK: harness wired, 50 expected parity failures (broker stub until P3-T01)"
