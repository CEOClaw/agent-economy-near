#!/usr/bin/env node
// Checks the NEAR testnet anchors in data/anchors.json against the live chain. No key, no install: Node 18+ and its fetch.
// For each anchor: the run must be one the manifest admits and counts, the checker re-run here gives the digest,
// and the contract's own `get` view call must return that same digest. Also: the contract's on-chain code hash
// must equal sha256(contract/agentproof_anchor.wasm).
//   node scripts/verify-anchors.mjs
// Exit 0 all verified live, 1 a mismatch / missing / bad answer, 2 testnet unreachable (nothing verified, never OK).
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const req = createRequire(import.meta.url);
const CHK = req(path.join(root, "src/checker.js")), PF = req(path.join(root, "src/portfolio.js")), AN = req(path.join(root, "src/anchors.js"));
globalThis.crypto ??= (await import("node:crypto")).webcrypto;
const snap = JSON.parse(await readFile(path.join(root, "data/anchors.json"), "utf8"));
const manifest = JSON.parse(await readFile(path.join(root, "data/manifest.json"), "utf8"));
const admitted = new Map(manifest.runs.map((r) => [r.file, r.bundle_digest]));
const short = (s) => String(s).slice(0, 12);
let bad = 0, unreachable = 0;
const fail = (m) => { bad++; console.log("FAIL  " + m); };

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function b58hex(s) {
  let n = 0n; for (const c of s) n = n * 58n + BigInt(B58.indexOf(c));
  let hex = n.toString(16); if (hex.length % 2) hex = "0" + hex;
  return "00".repeat([...s].findIndex((c) => c !== "1") === -1 ? s.length : [...s].findIndex((c) => c !== "1")) + (n ? hex : "");
}
// On-chain code hash of the contract account, from the first RPC that answers.
async function liveCodeHash() {
  for (const rpc of snap.rpc) {
    try {
      const res = await fetch(rpc, { method: "POST", headers: { "content-type": "application/json" }, signal: AbortSignal.timeout(8000),
        body: JSON.stringify({ jsonrpc: "2.0", id: "code", method: "query", params: { request_type: "view_account", finality: "final", account_id: snap.contract } }) });
      const code = (await res.json())?.result?.code_hash;
      if (typeof code === "string") return b58hex(code);
    } catch { /* next rpc */ }
  }
  return null;
}

const wasm = await readFile(path.join(root, "contract/agentproof_anchor.wasm"));
const localCode = (await import("node:crypto")).createHash("sha256").update(wasm).digest("hex");
if (snap.network !== "testnet" || !/\.testnet$/.test(snap.contract)) fail(`data/anchors.json is not a testnet contract (${snap.network}, ${snap.contract})`);

const jobs = [];
for (const a of snap.anchors) {
  const label = a.job_id.slice(0, 8);
  const file = path.join(root, "data", a.run);
  const run = JSON.parse(await readFile(file, "utf8"));
  const rc = await PF.checkReceipt(run, CHK, admitted.has(a.run) ? "manifest" : a.run, admitted.get(a.run));
  if (!rc || !PF.proven(rc)) { fail(`anchor ${label}: ${a.run} is not a proven receipt (admitted by the manifest, reproduced, pass, cross-owner)`); continue; }
  if (rc.id !== a.job_id) { fail(`anchor ${label}: ${a.run} is job ${rc.id}, not ${a.job_id}`); continue; }
  if (rc.recomputed_digest !== a.digest) { fail(`anchor ${label}: snapshot ${short(a.digest)} != recomputed ${short(rc.recomputed_digest)}`); continue; }
  jobs.push({ a, label, recomputed: rc.recomputed_digest });
}

const code = await liveCodeHash();
if (code === null) { unreachable++; }
else if (code === localCode && code === snap.code_sha256) console.log(`OK    contract ${snap.contract}: code sha256 ${short(code)} = contract/agentproof_anchor.wasm`);
else fail(`contract ${snap.contract}: on chain code ${short(code)}, contract/agentproof_anchor.wasm ${short(localCode)}, snapshot ${short(snap.code_sha256)}`);

for (const { a, label, recomputed } of jobs) {
  const v = await AN.viewAnchor(snap, a.job_id, fetch);
  if (!v.ok && v.reason === "unreachable") { unreachable++; continue; }
  if (!v.ok) { fail(`anchor ${label}: testnet answered but not with a record (${v.reason})`); continue; }
  const cmp = AN.compareAnchor(v.record, recomputed);
  if (cmp === "missing") fail(`anchor ${label}: not on chain (${snap.contract} has no record for it)`);
  else if (cmp === "mismatch") fail(`anchor ${label}: on chain ${short(v.record.digest)} != recomputed ${short(recomputed)}`);
  else if (v.record.digest !== a.digest || v.record.block_height !== a.block_height) fail(`anchor ${label}: on chain record (${short(v.record.digest)}, block ${v.record.block_height}) differs from data/anchors.json snapshot (${short(a.digest)}, block ${a.block_height})`);
  else console.log(`OK    anchor ${label}: on chain ${short(v.record.digest)} = recomputed (block ${v.record.block_height}, tx ${short(a.tx)}) via ${new URL(v.rpc).host}`);
  console.log(`      ${AN.txUrl(snap, a.tx)}`);
}
if (!bad && !unreachable) console.log(`      ${AN.accountUrl(snap)}`);

if (unreachable && !bad) {
  const a = snap.anchors[0];
  console.log(`SKIP  testnet unreachable (tried ${snap.rpc.join(", ")}); snapshot says ${a ? short(a.digest) : "no anchors"} from ${snap.snapshot_at}, not verified`);
  process.exit(2);
}
process.exit(bad ? 1 : 0);
