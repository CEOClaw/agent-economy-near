// SPDX-License-Identifier: Apache-2.0
// NEAR testnet demo. planDemo() submits nothing.
// A live run asks the near binary to sign one testnet transfer.
// The key is never placed on the command line and never printed.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const NETWORK_ID = "testnet";
const DEMO_CONTRACT = "contracts/testnet_demo.rs";

function fail(code, status) {
  process.stderr.write(String(code) + "\n");
  process.exit(status || 1);
}

function isTestnetAccount(id) {
  return /^[a-z0-9]([a-z0-9_-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9_-]*[a-z0-9])?)*\.testnet$/.test(
    String(id || "")
  );
}

function accountFromEnv() {
  const raw = process.env.NEAR_ACCOUNT_ID;
  if (raw === undefined || String(raw).trim() === "") {
    return { ok: false, code: "account_missing" };
  }
  const account = String(raw).trim();
  if (!isTestnetAccount(account)) return { ok: false, code: "refusing_network" };
  return { ok: true, account };
}

function credentialsPath(account) {
  return path.join(os.homedir(), ".near-credentials", NETWORK_ID, account + ".json");
}

function nearArgs(account) {
  return [
    "tokens",
    account,
    "send-near",
    account,
    "1 yoctoNEAR",
    "network-config",
    NETWORK_ID,
    "sign-with-keychain",
    "send",
  ];
}

function selectNetwork() {
  return { networkId: NETWORK_ID, contract: DEMO_CONTRACT };
}

function planDemo() {
  const net = selectNetwork();
  if (net.networkId !== NETWORK_ID) {
    throw new Error("refusing: this demo runs on testnet only");
  }
  return { network: net, actions: [], submitted: false };
}

function containsValue(text, value) {
  return Boolean(value) && String(text).indexOf(value) !== -1;
}

function ensureCredentials(account) {
  const file = credentialsPath(account);
  const key = process.env.NEAR_PRIVATE_KEY;
  if (key === undefined || String(key) === "") {
    if (!fs.existsSync(file)) fail("credentials_missing");
    return file;
  }
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.chmodSync(path.dirname(dir), 0o700);
  fs.chmodSync(dir, 0o700);
  const body = {
    account_id: account,
    private_key: String(key),
  };
  const pub = process.env.NEAR_PUBLIC_KEY;
  if (pub !== undefined && String(pub).trim() !== "") body.public_key = String(pub).trim();
  const tmp = file + ".tmp";
  const fd = fs.openSync(tmp, "w", 0o600);
  try {
    fs.writeFileSync(fd, JSON.stringify(body));
  } finally {
    fs.closeSync(fd);
  }
  fs.chmodSync(tmp, 0o600);
  fs.renameSync(tmp, file);
  fs.chmodSync(file, 0o600);
  return file;
}

function signAndSend(account) {
  if (NETWORK_ID !== "testnet") fail("refusing_network");
  const held = process.env.NEAR_PRIVATE_KEY || "";
  ensureCredentials(account);
  const childEnv = Object.assign({}, process.env);
  delete childEnv.NEAR_PRIVATE_KEY;
  delete childEnv.NEAR_PUBLIC_KEY;
  const proc = spawnSync("near", nearArgs(account), {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: childEnv,
  });
  const combined = String(proc.stdout || "") + String(proc.stderr || "");
  if (containsValue(combined, held)) fail("key_scan_fail", 3);
  if (proc.error && proc.error.code === "ENOENT") fail("near_missing");
  if (proc.error || proc.status !== 0) fail("sign_failed");
  const hashMatch = String(proc.stdout || "").match(/\b([1-9A-HJ-NP-Za-km-z]{43,44})\b/);
  const record = {
    network_id: NETWORK_ID,
    account_id: account,
    submitted: true,
    tx_hash: hashMatch ? hashMatch[1] : null,
    key_scan: 0,
  };
  const line = JSON.stringify(record);
  if (containsValue(line, held)) fail("key_scan_fail", 3);
  process.stdout.write(line + "\n");
}

function main() {
  const args = process.argv.slice(2);
  let mode = "plan";
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--sign") mode = "sign";
    else if (args[i] === "--dry-run") mode = "dry-run";
    else fail("bad_args");
  }
  if (mode === "plan") {
    process.stdout.write(JSON.stringify(planDemo()) + "\n");
    return;
  }
  const found = accountFromEnv();
  if (!found.ok) fail(found.code);
  if (mode === "dry-run") {
    const plan = planDemo();
    plan.account_id = found.account;
    process.stdout.write(JSON.stringify(plan) + "\n");
    return;
  }
  signAndSend(found.account);
}

module.exports = {
  NETWORK_ID,
  DEMO_CONTRACT,
  isTestnetAccount,
  accountFromEnv,
  credentialsPath,
  nearArgs,
  selectNetwork,
  planDemo,
  ensureCredentials,
};

if (require.main === module) {
  try {
    main();
  } catch (_err) {
    fail("sign_failed");
  }
}
