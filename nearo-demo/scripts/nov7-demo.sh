#!/usr/bin/env bash
# Testnet-only demo.
#   NEAR_ACCOUNT_ID=<account>.testnet bash scripts/nov7-demo.sh --dry-run
#   NEAR_ACCOUNT_ID=<account>.testnet bash scripts/nov7-demo.sh
# A live run asks near to sign. This script does not print key material.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

if [[ "${BASH_SOURCE[0]}" != "$0" ]]; then
    return 0
fi

echo "=== NEAR Demo — Nov 7 ==="
echo "Chain: testnet"
echo "Contract: contracts/testnet_demo.rs"

cd "$REPO_ROOT"

if [[ "$#" -eq 0 ]]; then
    MODE="sign"
elif [[ "$#" -eq 1 && "$1" == "--dry-run" ]]; then
    MODE="dry-run"
else
    echo "bad_args" >&2
    exit 1
fi

if ! command -v node >/dev/null 2>&1; then
    echo "node_missing" >&2
    exit 1
fi

if [[ "$MODE" == "dry-run" ]]; then
    node "$REPO_ROOT/contracts/near_testnet_demo.js" --dry-run
    echo ""
    echo "=== DRY RUN COMPLETE ==="
    echo "No transaction sent."
    exit 0
fi

echo ""
echo "=== LIVE RUN ==="
node "$REPO_ROOT/contracts/near_testnet_demo.js" --sign
exit 0
