#!/bin/bash
# WM 2026 Test Runner
# Usage: ./tests/run_tests.sh

set -e
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "🧪 WM 2026 — Test Suite"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

PASS=0
FAIL=0

run() {
  local label="$1"
  shift
  echo ""
  echo "▶ $label"
  if "$@"; then
    PASS=$((PASS + 1))
  else
    FAIL=$((FAIL + 1))
    echo "  ❌ FAILED: $label"
  fi
}

# 1. JS smoke tests (model logic + data integrity + path checks)
run "Simulation unit tests" node tests/test_simulation.js

# 2. Python QA test (group model logic)
run "Group model QA (Python)" python3 tests/qa_worldcup_group_model.py

# 3. Check app is reachable (requires server running on port 8000)
run "HTTP server reachable" bash -c \
  'curl -sf "http://localhost:8000/New%20project/app/" -o /dev/null && echo "  ✅ App responds at http://localhost:8000/New%20project/app/"'

# 4. Check data files are present and non-empty
run "Data files present" bash -c '
  for f in data/wm_2026_simulation_data.json data/wm_2026_matches_fifa.json \
            data/fifa_mens_ranking_latest.json data/wm_2026_odds_snapshot.json; do
    [ -s "$f" ] && echo "  ✅ $f" || { echo "  ❌ MISSING: $f"; exit 1; }
  done
'

# 5. Check no stale paths remain in app JS
run "No stale paths in app JS" bash -c '
  if grep -q "\"../wm_2026_" app/simulation.js app/app.js 2>/dev/null; then
    echo "  ❌ Stale root-level data paths found"
    grep "\"../wm_2026_" app/simulation.js app/app.js
    exit 1
  fi
  echo "  ✅ All data paths use ../data/"
'

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Results: ${PASS} passed, ${FAIL} failed"
if [ "$FAIL" -eq 0 ]; then
  echo "🎉 All tests passed!"
  exit 0
else
  echo "💥 ${FAIL} test(s) failed"
  exit 1
fi
