#!/usr/bin/env node
// Account refusal, missing near, and an existing keychain file.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.join(__dirname, "..");
const script = path.join(root, "scripts", "nov7-demo.sh");
const demo = require(path.join(root, "contracts", "near_testnet_demo.js"));
const marker = "test-only-not-a-key";
let ok = true;
const check = (name, cond) => {
  console.log(`${cond ? "PASS" : "FAIL"}: ${name}`);
  if (!cond) ok = false;
};

function baseEnv(extra) {
  const env = Object.assign({}, process.env);
  delete env.NEAR_PRIVATE_KEY;
  delete env.NEAR_PUBLIC_KEY;
  delete env.NEAR_ACCOUNT_ID;
  delete env.NEARO_TESTNET_ACCOUNT;
  return Object.assign(env, extra);
}

check("accepts_testnet_account", demo.isTestnetAccount("demo.testnet") === true);
check("refuses_other_network", demo.isTestnetAccount("alice.near") === false);
check("refuses_empty_account", demo.isTestnetAccount("") === false);
check("plan_submits_nothing", demo.planDemo().submitted === false && demo.planDemo().actions.length === 0);

const home = fs.mkdtempSync(path.join(os.tmpdir(), "nov7-home-"));
const bin = fs.mkdtempSync(path.join(os.tmpdir(), "nov7-bin-"));
const argvFile = path.join(home, "argv.txt");
fs.writeFileSync(
  path.join(bin, "near"),
  "#!/bin/sh\nprintf '%s\\n' \"$@\" >> \"$ARGV_FILE\"\nprintf '%s\\n' sent\n",
  { mode: 0o755 }
);

function run(args, extra) {
  return spawnSync("bash", [script].concat(args), {
    cwd: root,
    env: baseEnv(Object.assign({
      HOME: home,
      PATH: bin + path.delimiter + (process.env.PATH || ""),
      ARGV_FILE: argvFile,
    }, extra)),
    encoding: "utf8",
    timeout: 20000,
  });
}

const refused = run([], { NEAR_ACCOUNT_ID: "alice.near", NEAR_PRIVATE_KEY: marker });
check("other_network_exits", refused.status === 1);
check("other_network_code", String(refused.stderr || "").indexOf("refusing_network") !== -1);
check("other_network_silent", String(refused.stdout || "").indexOf(marker) === -1 && String(refused.stderr || "").indexOf(marker) === -1);
check("other_network_no_near", fs.existsSync(argvFile) === false);

const missing = run(["--dry-run"], {});
check("missing_account_exits", missing.status === 1);
check("missing_account_code", String(missing.stderr || "").indexOf("account_missing") !== -1);

const noNearBin = fs.mkdtempSync(path.join(os.tmpdir(), "nov7-none-"));
const nodeDir = path.dirname(process.execPath);
const absent = spawnSync("bash", [script], {
  cwd: root,
  env: baseEnv({
    HOME: home,
    PATH: [noNearBin, nodeDir, "/usr/bin", "/bin"].join(path.delimiter),
    NEAR_ACCOUNT_ID: "demo.testnet",
    NEAR_PRIVATE_KEY: marker,
  }),
  encoding: "utf8",
  timeout: 20000,
});
const absentText = String(absent.stdout || "") + String(absent.stderr || "");
check("near_missing_exits", absent.status === 1);
check("near_missing_code", String(absent.stderr || "").indexOf("near_missing") !== -1);
check("near_missing_silent", absentText.indexOf(marker) === -1);

const account = "demo.testnet";
const dir = path.join(home, ".near-credentials", "testnet");
fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
const existing = path.join(dir, account + ".json");
fs.writeFileSync(existing, JSON.stringify({ account_id: account, private_key: marker }), { mode: 0o600 });
const before = fs.readFileSync(existing, "utf8");
const live = run([], { NEAR_ACCOUNT_ID: account });
const after = fs.readFileSync(existing, "utf8");
const argv = fs.existsSync(argvFile) ? fs.readFileSync(argvFile, "utf8") : "";
check("existing_keychain_exit", live.status === 0);
check("existing_keychain_unchanged", after === before);
check("existing_keychain_argv", argv.indexOf("sign-with-keychain") !== -1 && argv.indexOf(marker) === -1);
check("existing_keychain_silent", (String(live.stdout || "") + String(live.stderr || "")).indexOf(marker) === -1);

fs.rmSync(home, { recursive: true, force: true });
fs.rmSync(bin, { recursive: true, force: true });
fs.rmSync(noNearBin, { recursive: true, force: true });

console.log(ok ? "test_nov7_demo_hardening: PASS" : "test_nov7_demo_hardening: FAIL");
process.exit(ok ? 0 : 1);
