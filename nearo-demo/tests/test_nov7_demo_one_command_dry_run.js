#!/usr/bin/env node
// Dry run exits 0, does not call near, and does not name another network.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.join(__dirname, "..");
const script = path.join(root, "scripts", "nov7-demo.sh");
const mainWord = ["main", "net"].join("");
let ok = true;
const check = (name, cond) => {
  console.log(`${cond ? "PASS" : "FAIL"}: ${name}`);
  if (!cond) ok = false;
};

const home = fs.mkdtempSync(path.join(os.tmpdir(), "nov7-home-"));
const bin = fs.mkdtempSync(path.join(os.tmpdir(), "nov7-bin-"));
const argvFile = path.join(home, "argv.txt");
fs.writeFileSync(path.join(bin, "near"), "#!/bin/sh\nprintf '%s\\n' called >> \"$ARGV_FILE\"\n", { mode: 0o755 });

const env = Object.assign({}, process.env);
delete env.NEAR_PRIVATE_KEY;
delete env.NEAR_PUBLIC_KEY;
delete env.NEAR_ACCOUNT_ID;
delete env.NEARO_TESTNET_ACCOUNT;
env.HOME = home;
env.PATH = bin + path.delimiter + (process.env.PATH || "");
env.ARGV_FILE = argvFile;
env.NEAR_ACCOUNT_ID = "demo.testnet";

const result = spawnSync("bash", [script, "--dry-run"], {
  cwd: root,
  env,
  encoding: "utf8",
  timeout: 20000,
});
const out = String(result.stdout || "");
const err = String(result.stderr || "");
const code = fs.readFileSync(script, "utf8").split("\n").map((line) => line.replace(/#.*$/, "")).join("\n");

check("script_exists", fs.existsSync(script));
check("dry_run_exits_zero", result.status === 0);
check("dry_run_complete", out.indexOf("=== DRY RUN COMPLETE ===") !== -1);
check("no_transaction", out.indexOf("No transaction sent.") !== -1);
check("near_not_called", fs.existsSync(argvFile) === false);
check("names_testnet", out.indexOf("testnet") !== -1);
check("no_other_network", !new RegExp(mainWord, "i").test(code) && !new RegExp(mainWord, "i").test(out + err));

fs.rmSync(home, { recursive: true, force: true });
fs.rmSync(bin, { recursive: true, force: true });

console.log(ok ? "test_nov7_demo_one_command_dry_run: PASS" : "test_nov7_demo_one_command_dry_run: FAIL");
process.exit(ok ? 0 : 1);
