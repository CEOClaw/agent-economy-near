#!/usr/bin/env bash
# Syntax check for the Nov 7 demo. This repo has no compile step.
set -eu
cd "$(dirname "$0")/.."

export PATH
export PYTHONPYCACHEPREFIX="${TMPDIR:-/tmp}/nearo-pyc-$$"
mkdir -p "${PYTHONPYCACHEPREFIX}"

node --check contracts/near_testnet_demo.js
for f in tests/*.js; do
  node --check "${f}"
done
bash -n scripts/nov7-demo.sh
bash -n tests/run-nov7-suite.sh
bash -n tests/build-nov7.sh
python3 -m py_compile tests/*.py
rm -rf "${PYTHONPYCACHEPREFIX}"
echo BUILD_OK
