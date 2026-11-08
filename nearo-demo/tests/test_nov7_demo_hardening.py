#!/usr/bin/env python3
"""Account refusal and a dry run that does not call near."""
import os
import shutil
import subprocess
import sys
import tempfile

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
SCRIPT = os.path.join(ROOT, "scripts", "nov7-demo.sh")
MARKER = "test-only-not-a-key"
OK = True


def check(name, cond):
    global OK
    print(("PASS: " if cond else "FAIL: ") + name)
    if not cond:
        OK = False


def base_env(extra):
    env = os.environ.copy()
    for key in ("NEAR_PRIVATE_KEY", "NEAR_PUBLIC_KEY", "NEAR_ACCOUNT_ID", "NEARO_TESTNET_ACCOUNT"):
        env.pop(key, None)
    env.update(extra)
    return env


def run(args, extra):
    return subprocess.run(
        ["bash", SCRIPT, *args],
        cwd=ROOT,
        env=base_env(extra),
        text=True,
        capture_output=True,
        timeout=20,
    )


def main():
    home = tempfile.mkdtemp(prefix="nov7-home-")
    bin_dir = tempfile.mkdtemp(prefix="nov7-bin-")
    argv_file = os.path.join(home, "argv.txt")
    stub = os.path.join(bin_dir, "near")
    with open(stub, "w", encoding="utf-8") as handle:
        handle.write("#!/bin/sh\nprintf '%s\\n' \"$@\" >> \"$ARGV_FILE\"\nprintf '%s\\n' sent\n")
    os.chmod(stub, 0o755)
    common = {
        "HOME": home,
        "PATH": bin_dir + os.pathsep + os.environ.get("PATH", ""),
        "ARGV_FILE": argv_file,
    }
    try:
        dry = run(["--dry-run"], dict(common, NEAR_ACCOUNT_ID="demo.testnet", NEAR_PRIVATE_KEY=MARKER))
        text = (dry.stdout or "") + (dry.stderr or "")
        check("dry_run_exit", dry.returncode == 0)
        check("dry_run_complete", "=== DRY RUN COMPLETE ===" in (dry.stdout or ""))
        check("dry_run_no_send", "No transaction sent." in (dry.stdout or ""))
        check("dry_run_no_near", not os.path.exists(argv_file))
        check("dry_run_silent", MARKER not in text)

        refused = run([], dict(common, NEAR_ACCOUNT_ID="alice.near"))
        check("refuse_exit", refused.returncode == 1)
        check("refuse_code", "refusing_network" in (refused.stderr or ""))
        check("refuse_no_near", not os.path.exists(argv_file))

        missing = run(["--dry-run"], common)
        check("missing_exit", missing.returncode == 1)
        check("missing_code", "account_missing" in (missing.stderr or ""))
    finally:
        shutil.rmtree(home, ignore_errors=True)
        shutil.rmtree(bin_dir, ignore_errors=True)
    print("test_nov7_demo_hardening.py: " + ("PASS" if OK else "FAIL"))
    return 0 if OK else 1


if __name__ == "__main__":
    sys.exit(main())
