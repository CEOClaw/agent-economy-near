#!/usr/bin/env bash
# run_tests.sh — AgentProof TASK-002 test runner
#
# Runs 3 demo scenarios and prints PASS / FAIL / BLOCKED for each.
# Exit code 0 = all scenarios produced the expected checker outcome.
# Exit code 1 = at least one scenario produced an unexpected outcome.
#
# Env var:
#   AGENTPROOF_FIXTURES_DIR  — override base dir for test-inputs/ and
#                              expected-outputs/  (default: dir of this script)

set -euo pipefail

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHECKER="$SCRIPT_DIR/checker.py"
FIXTURES_DIR="${AGENTPROOF_FIXTURES_DIR:-$SCRIPT_DIR}"
INPUTS="$FIXTURES_DIR/test-inputs"
OUTPUTS="$FIXTURES_DIR/expected-outputs"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
PASS_COUNT=0
FAIL_COUNT=0

extract_outcome() {
    python3 -c "import sys,json; print(json.load(sys.stdin).get('outcome',''))" 2>/dev/null
}

run_scenario() {
    local num="$1"
    local label="$2"
    local envelope="$3"
    local delivery="$4"
    local expected="$5"

    printf "Scenario %s: %-44s" "$num" "$label"

    local raw
    raw=$(python3 "$CHECKER" "$envelope" "$delivery" 2>/dev/null)
    local outcome
    outcome=$(echo "$raw" | extract_outcome)

    if [[ "$outcome" == "$expected" ]]; then
        echo "✅ $outcome"
        PASS_COUNT=$((PASS_COUNT + 1))
    else
        echo "❌  expected '$expected', got '$outcome'"
        echo ""
        echo "    Full checker output:"
        echo "$raw" | sed 's/^/    /'
        FAIL_COUNT=$((FAIL_COUNT + 1))
    fi
}

# ---------------------------------------------------------------------------
# Suite
# ---------------------------------------------------------------------------
echo ""
echo "=== AgentProof TASK-002 Test Suite ==="
echo ""

# Scenario 1 — correct extraction (expect: pass)
run_scenario \
    "1/3" \
    "sample-01 correct extraction      (expect PASS)" \
    "$INPUTS/envelope-01.json" \
    "$OUTPUTS/sample-01-pass.json" \
    "pass"

# Scenario 2 — wrong CONTACT_EMAIL (expect: fail)
run_scenario \
    "2/3" \
    "sample-01 wrong CONTACT_EMAIL     (expect FAIL)" \
    "$INPUTS/envelope-01.json" \
    "$OUTPUTS/sample-01-fail.json" \
    "fail"

# Scenario 3 — spend gate exceeded (expect: blocked)
run_scenario \
    "3/3" \
    "sample-02 spend gate 5.00 > 0.25  (expect BLOCKED)" \
    "$INPUTS/envelope-02.json" \
    "$OUTPUTS/sample-02-blocked.json" \
    "blocked"

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
echo "=== Results: $PASS_COUNT passed, $FAIL_COUNT failed ==="
echo ""

if [[ $FAIL_COUNT -eq 0 ]]; then
    echo "ALL SCENARIOS CORRECT ✅"
    exit 0
else
    echo "SOME SCENARIOS FAILED ❌"
    exit 1
fi
