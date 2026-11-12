#!/usr/bin/env node
// Checks data/decisions.json. Offline part: every entry's digest, verdict and action are recomputed from its run file with the
// checker (a dry-run entry must say exactly what the checker would recommend), and a bundle that is paid has no recorded decision after the fact.
// Live part (only once the gate contract is deployed, contract_has_decisions true): each recorded entry must be on chain,
// by the contract's own get_decisions, equal to the snapshot.
//   node scripts/verify-decisions.mjs
// Exit 0 all verified, 1 a mismatch, 2 testnet unreachable (live part not verified, never OK).
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const req = createRequire(import.meta.url);
const CHK = req(path.join(root, "src/checker.js")), PF = req(path.join(root, "src/portfolio.js")), G = req(path.join(root, "src/gate.js")), DEC = req(path.join(root, "src/decisions.js"));
globalThis.crypto ??= (await import("node:crypto")).webcrypto;
const snap = JSON.parse(await readFile(path.join(root, "data/decisions.json"), "utf8")), manifest = JSON.parse(await readFile(path.join(root, "data/manifest.json"), "utf8"));
const short = (s) => String(s).slice(0, 12);
let bad = 0, unreachable = 0;
const fail = (m) => { bad++; console.log("FAIL  " + m); };
if (snap.network !== "testnet" || !/\.testnet$/.test(snap.contract)) fail(`not a testnet contract (${snap.network}, ${snap.contract})`);
const recordedAny = snap.decisions.some((e) => e.status === "recorded");
if (recordedAny && snap.contract_has_decisions !== true) fail("an entry is recorded but contract_has_decisions is not true");

for (const e of snap.decisions) {
  const label = `${e.job_id ? e.job_id.slice(0, 8) : "no job"} (${e.run || "no run file"})`;
  if (!["dry-run", "recorded"].includes(e.status)) { fail(`${label}: unknown status ${e.status}`); continue; }
  if (e.run) {
    const d = await G.decisionFor(JSON.parse(await readFile(path.join(root, "data", e.run), "utf8")), CHK, PF);
    const got = { job_id: d.job_id, delivery_digest: d.delivery_digest, checker_version: d.checker_version, verdict: d.verdict, action: d.action };
    const off = Object.keys(got).filter((k) => got[k] !== e[k]);
    if (off.length) { fail(`${label}: ${off.join(", ")} differ from what the checker gives on ${e.run}`); continue; }
    if (JSON.stringify(e.checklist) !== JSON.stringify(d.checklist)) { fail(`${label}: the checklist differs from what the checker gives on ${e.run}`); continue; }
  }
  if ("market_action" in e || "market_state_after" in e) { fail(`${label}: carries market_action or market_state_after, which this repo no longer writes`); continue; }
  if (e.buyer != null && !(["accepted", "sent_back", "cancelled"].includes(e.buyer.action) && typeof e.buyer.followed === "boolean")) { fail(`${label}: the buyer field is malformed`); continue; }
  if (e.status === "dry-run") {
    if (e.tx || e.block_timestamp_ms || e.block_height) fail(`${label}: a dry-run entry carries chain fields`);
    else console.log(`OK    ${label}: dry run, ${e.verdict} -> ${e.action}, digest ${short(e.delivery_digest)}, never sent`);
    continue;
  }
  if (!Number.isSafeInteger(e.block_timestamp_ms)) { fail(`${label}: recorded but holds no block time`); continue; }
  const v = await DEC.viewDecisions(snap, e.job_id, fetch);
  if (!v.ok && v.reason === "unreachable") { unreachable++; continue; }
  if (!v.ok) { fail(`${label}: testnet answered but not with decisions (${v.reason})`); continue; }
  const c = DEC.decisionForDigest(v.decisions, e.delivery_digest);
  if (!c) fail(`${label}: not on chain (get_decisions has no decision for digest ${short(e.delivery_digest)})`);
  else if (["n", "verdict", "action", "checker_version", "buyer_owner", "seller_owner", "block_height", "block_timestamp_ms"].some((k) => c[k] !== e[k])) fail(`${label}: the chain record differs from data/decisions.json`);
  else {
    console.log(`OK    ${label}: on chain n=${c.n}, ${c.verdict} -> ${c.action}, block ${c.block_height}, tx ${e.tx ? short(e.tx) : "unknown"} via ${new URL(v.rpc).host}${e.tx ? "\n      " + DEC.txUrl(snap, e.tx) : ""}`);
    // The order that makes it count: the chain's block time against the accept time in the run bundle (src/gate.js checkStatus, live record).
    if (e.run) {
      const run = JSON.parse(await readFile(path.join(root, "data", e.run), "utf8")), listed = manifest.runs.find((r) => r.file === e.run);
      const rc = await PF.checkReceipt(run, CHK, listed ? "manifest" : e.run, listed && listed.bundle_digest), cs = G.checkStatus(rc, [{ ...c, live_verified: true }]);
      const at = rc.accepted_at && Date.parse(rc.accepted_at), gap = at ? ` (block ${new Date(c.block_timestamp_ms).toISOString()}, accepted ${rc.accepted_at}, ${((at - c.block_timestamp_ms) / 1000).toFixed(1)} s later)` : "";
      console.log(`      ${cs.state}: ${cs.reason}${gap}${rc.trusted ? "" : " [run not admitted by data/manifest.json]"}`);
    }
  }
}
if (!recordedAny) console.log(`NOTE  nothing recorded on chain yet (contract_has_decisions ${snap.contract_has_decisions}): no entry to read live, and no job counts as checked before paid`);
if (unreachable && !bad) { console.log(`SKIP  testnet unreachable (tried ${snap.rpc.join(", ")}), snapshot from ${snap.snapshot_at}, recorded entries not verified`); process.exit(2); }
process.exit(bad ? 1 : 0);
