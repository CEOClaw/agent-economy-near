#!/usr/bin/env python3
"""One-command dry run: exit 0, testnet named, near not called."""
import os
import shutil
import subprocess
import sys
import tempfile

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
SCRIPT = os.path.join(ROOT, "scripts", "nov7-demo.sh")
OTHER = "main" + "net"
OK = True


def check(name, cond):
    global OK
    print(("PASS: " if cond else "FAIL: ") + name)
    if not cond:
        OK = False


def main():
    home = tempfile.mkdtemp(prefix="nov7-home-")
    bin_dir = tempfile.mkdtemp(prefix="nov7-bin-")
    argv_file = os.path.join(home, "argv.txt")
    stub = os.path.join(bin_dir, "near")
    with open(stub, "w", encoding="utf-8") as handle:
        handle.write("#!/bin/sh\nprintf '%s\\n' called >> \"$ARGV_FILE\"\n")
    os.chmod(stub, 0o755)
    env = os.environ.copy()
    for key in ("NEAR_PRIVATE_KEY", "NEAR_PUBLIC_KEY", "NEAR_ACCOUNT_ID", "NEARO_TESTNET_ACCOUNT"):
        env.pop(key, None)
    env.update({
        "HOME": home,
        "PATH": bin_dir + os.pathsep + os.environ.get("PATH", ""),
        "ARGV_FILE": argv_file,
        "NEAR_ACCOUNT_ID": "demo.testnet",
    })
    try:
        result = subprocess.run(
            ["bash", SCRIPT, "--dry-run"],
            cwd=ROOT,
            env=env,
            text=True,
            capture_output=True,
            timeout=20,
        )
        text = (result.stdout or "") + (result.stderr or "")
        with open(SCRIPT, encoding="utf-8") as handle:
            code = "\n".join(line.split("#", 1)[0] for line in handle.read().splitlines())
        check("dry_run_exit", result.returncode == 0)
        check("dry_run_complete", "=== DRY RUN COMPLETE ===" in (result.stdout or ""))
        check("no_transaction", "No transaction sent." in (result.stdout or ""))
        check("near_not_called", not os.path.exists(argv_file))
        check("names_testnet", "testnet" in (result.stdout or ""))
        check("no_other_network", OTHER not in code and OTHER not in text)
    finally:
        shutil.rmtree(home, ignore_errors=True)
        shutil.rmtree(bin_dir, ignore_errors=True)
    print("test_nov7_demo_one_command_dry_run.py: " + ("PASS" if OK else "FAIL"))
    return 0 if OK else 1


if __name__ == "__main__":
    sys.exit(main())
