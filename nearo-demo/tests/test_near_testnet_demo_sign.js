#!/usr/bin/env node
// Live path, with a stand-in near command. No broadcast.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.join(__dirname, "..");
const demo = path.join(root, "contracts", "near_testnet_demo.js");
const account = "demo.testnet";
const marker = "test-only-not-a-key";
const pub = "test-only-public";
let ok = true;
const check = (name, cond) => {
  console.log(`${cond ? "PASS" : "FAIL"}: ${name}`);
  if (!cond) ok = false;
};

const home = fs.mkdtempSync(path.join(os.tmpdir(), "nov7-home-"));
const bin = fs.mkdtempSync(path.join(os.tmpdir(), "nov7-bin-"));
const argvFile = path.join(home, "argv.txt");
const namesFile = path.join(home, "env-names.txt");
const stub = path.join(bin, "near");
fs.writeFileSync(
  stub,
  "#!/bin/sh\n" +
    "for a in \"$@\"; do printf '%s\\n' \"$a\" >> \"$ARGV_FILE\"; done\n" +
    "env | awk -F= '{print $1}' >> \"$ENV_NAMES_FILE\"\n" +
    "printf '%s\\n' sent\n",
  { mode: 0o755 }
);

const env = Object.assign({}, process.env);
delete env.NEAR_PRIVATE_KEY;
delete env.NEAR_PUBLIC_KEY;
delete env.NEAR_ACCOUNT_ID;
delete env.NEARO_TESTNET_ACCOUNT;
env.HOME = home;
env.PATH = bin + path.delimiter + (process.env.PATH || "");
env.ARGV_FILE = argvFile;
env.ENV_NAMES_FILE = namesFile;
env.NEAR_ACCOUNT_ID = account;
env.NEAR_PRIVATE_KEY = marker;
env.NEAR_PUBLIC_KEY = pub;

const result = spawnSync(process.execPath, [demo, "--sign"], {
  cwd: root,
  env,
  encoding: "utf8",
  timeout: 20000,
});
const out = String(result.stdout || "");
const err = String(result.stderr || "");
const argv = fs.existsSync(argvFile) ? fs.readFileSync(argvFile, "utf8") : "";
const names = fs.existsSync(namesFile) ? fs.readFileSync(namesFile, "utf8").split(/\n/) : [];
const cred = path.join(home, ".near-credentials", "testnet", account + ".json");
let mode = -1;
let stored = false;
if (fs.existsSync(cred)) {
  mode = fs.statSync(cred).mode & 0o777;
  stored = fs.readFileSync(cred, "utf8").indexOf(marker) !== -1;
}

check("exit_zero", result.status === 0);
check("argv_is_keychain_send", argv === [
  "tokens",
  account,
  "send-near",
  account,
  "1 yoctoNEAR",
  "network-config",
  "testnet",
  "sign-with-keychain",
  "send",
  "",
].join("\n"));
check("marker_not_on_argv", argv.indexOf(marker) === -1);
check("marker_not_in_output", out.indexOf(marker) === -1 && err.indexOf(marker) === -1);
check("child_has_no_key_env", names.indexOf("NEAR_PRIVATE_KEY") === -1 && names.indexOf("NEAR_PUBLIC_KEY") === -1);
check("keychain_mode_600", mode === 0o600);
check("keychain_holds_marker", stored);
check("stdout_key_scan_zero", out.indexOf("\"key_scan\":0") !== -1 && out.indexOf(account) !== -1);

fs.rmSync(home, { recursive: true, force: true });
fs.rmSync(bin, { recursive: true, force: true });

console.log(ok ? "test_near_testnet_demo_sign: PASS" : "test_near_testnet_demo_sign: FAIL");
process.exit(ok ? 0 : 1);
