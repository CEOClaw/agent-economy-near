#!/usr/bin/env bash
# Run every Nov 7 demo test. The sign test is wrapped in a network namespace
# so it cannot broadcast. File counts are the suite verdict.
set -u
cd "$(dirname "$0")/.."

export PATH
export PYTHONDONTWRITEBYTECODE=1

echo "node $(node --version)"

pass_files=0
fail_files=0
run() {
  local name="$1"
  shift
  echo "---- ${name} ----"
  if "$@"; then
    pass_files=$((pass_files + 1))
    echo "FILE_PASS ${name}"
  else
    fail_files=$((fail_files + 1))
    echo "FILE_FAIL ${name}"
  fi
}

run test_near_testnet_demo.js node tests/test_near_testnet_demo.js
run test_near_testnet_demo_sign.js unshare --net --map-current-user node tests/test_near_testnet_demo_sign.js
run test_nov7_demo_one_command_dry_run.js node tests/test_nov7_demo_one_command_dry_run.js
run test_nov7_demo_hardening.js node tests/test_nov7_demo_hardening.js
run test_near_testnet_demo_refuses_mainnet.py python3 tests/test_near_testnet_demo_refuses_mainnet.py
run test_nov7_demo_one_command_dry_run.py python3 tests/test_nov7_demo_one_command_dry_run.py
run test_nov7_demo_hardening.py python3 tests/test_nov7_demo_hardening.py
run test_nov7_uses_path_node.py python3 tests/test_nov7_uses_path_node.py

echo "SUITE files_pass=${pass_files} files_fail=${fail_files}"
if [[ "${fail_files}" -eq 0 ]]; then
  exit 0
fi
exit 1
