#!/usr/bin/env python3
"""The demo uses the first node on PATH."""
import os
import shutil
import subprocess
import sys
import tempfile

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
SCRIPT = os.path.join(ROOT, "scripts", "nov7-demo.sh")
OK = True


def check(name, cond):
    global OK
    print(("PASS: " if cond else "FAIL: ") + name)
    if not cond:
        OK = False


def main():
    real = shutil.which("node")
    check("node_on_path", bool(real))
    if not real:
        print("test_nov7_uses_path_node.py: FAIL")
        return 1
    home = tempfile.mkdtemp(prefix="nov7-home-")
    bin_dir = tempfile.mkdtemp(prefix="nov7-bin-")
    note = os.path.join(home, "node-used.txt")
    wrapper = os.path.join(bin_dir, "node")
    with open(wrapper, "w", encoding="utf-8") as handle:
        handle.write(
            "#!/bin/sh\n"
            "printf '%s\\n' used >> \"$NODE_USED_FILE\"\n"
            "exec \"$NODE_REAL\" \"$@\"\n"
        )
    os.chmod(wrapper, 0o755)
    env = os.environ.copy()
    for key in ("NEAR_PRIVATE_KEY", "NEAR_PUBLIC_KEY", "NEAR_ACCOUNT_ID", "NEARO_TESTNET_ACCOUNT"):
        env.pop(key, None)
    env.update({
        "HOME": home,
        "PATH": bin_dir + os.pathsep + os.environ.get("PATH", ""),
        "NODE_REAL": real,
        "NODE_USED_FILE": note,
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
        used = open(note, encoding="utf-8").read().strip() if os.path.exists(note) else ""
        check("dry_run_exit", result.returncode == 0)
        check("path_node_used", used == "used")
    finally:
        shutil.rmtree(home, ignore_errors=True)
        shutil.rmtree(bin_dir, ignore_errors=True)
    print("test_nov7_uses_path_node.py: " + ("PASS" if OK else "FAIL"))
    return 0 if OK else 1


if __name__ == "__main__":
    sys.exit(main())
