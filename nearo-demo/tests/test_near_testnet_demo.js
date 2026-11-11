#!/usr/bin/env node
// test_near_testnet_demo_refuses_mainnet
// Exits 0 only when contracts/near_testnet_demo.js names testnet, names no
// other network, contains no secret literal, and its view plan submits nothing.
"use strict";
const fs = require("fs");
const path = require("path");

const file = path.join(__dirname, "..", "contracts", "near_testnet_demo.js");
let ok = true;
const check = (name, cond, why) => {
  console.log(`${cond ? "PASS" : "FAIL"}: ${name}${cond ? "" : " (" + why + ")"}`);
  if (!cond) ok = false;
};

const src = fs.readFileSync(file, "utf8");
const mainWord = ["main", "net"].join("");
const secretPattern = /(?:ed25519:|secp256k1:)[1-9A-HJ-NP-Za-km-z]{20,}|-----BEGIN [A-Z]|0x[0-9a-fA-F]{64}|"[0-9a-fA-F]{64}"/;

check("names_testnet", /\btestnet\b/.test(src), "testnet not named");
check("no_main_network", !new RegExp(mainWord, "i").test(src), "main network named");
check("no_secret_literals", !secretPattern.test(src), "secret literal found");

const c = require(file);
const plan = c.planDemo();
check("selects_testnet", c.selectNetwork().networkId === "testnet", "network is not testnet");
check("submits_nothing", plan.submitted === false && plan.actions.length === 0, "plan submits actions");

console.log(ok ? "test_near_testnet_demo_refuses_mainnet: PASS" : "test_near_testnet_demo_refuses_mainnet: FAIL");
process.exit(ok ? 0 : 1);
