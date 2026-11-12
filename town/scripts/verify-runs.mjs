#!/usr/bin/env node
// Re-checks every run in data/manifest.json with src/checker.js (the same code the town runs in the browser).
// Exit code 1 if any stored digest or committed result disagrees with a fresh run.
// Then prints a proof portfolio per market handle in data/agents.json (executor_ids),
// market numbers from market.near.ai live, or data/market-snapshot.json if offline.
//   node scripts/verify-runs.mjs            all runs in the manifest
//   node scripts/verify-runs.mjs <file>...  specific run files
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const req = createRequire(import.meta.url);
const CHK = req(path.join(root, "src/checker.js")), MKT = req(path.join(root, "src/market.js")), PF = req(path.join(root, "src/portfolio.js")), G = req(path.join(root, "src/gate.js")), DEC = req(path.join(root, "src/decisions.js"));
globalThis.crypto ??= (await import("node:crypto")).webcrypto;
const own = new Map(JSON.parse(await readFile(path.join(root, "data/manifest.json"), "utf8")).runs.map((r) => [path.join(root, "data", r.file), r.bundle_digest]));
const files = process.argv.slice(2).length ? process.argv.slice(2).map((f) => path.resolve(f)) : [...own.keys()];
let bad = 0; const receipts = [];
for (const f of files) {
  const o = JSON.parse(await readFile(f, "utf8")); const name = path.basename(f);
  // Only a file the manifest admits by hash can count; any other file's owners are self-asserted.
  if (own.has(f) && own.get(f) !== await CHK.sha256Hex(CHK.canonicalJson(o))) { bad++; console.log(`FAIL  ${name}: its hash is not the one data/manifest.json admits`); }
  const rc = await PF.checkReceipt(o, CHK, own.has(f) ? "manifest" : f, own.get(f)); if (rc) receipts.push(rc);
  if (rc && !rc.trusted) console.log(`NOTE  ${name}: not admitted by data/manifest.json, so it is unverified and never counts toward a portfolio`);
  if (o.job_ref) {
    let env = o.envelope || o.extracted_input?.envelope; if (typeof env === "string") env = JSON.parse(env);
    const out = o.job_ref.delivery?.output, stored = o.job_ref.delivery?.checker?.evidence_digest;
    if (!env || !out) { console.log(`SKIP  ${name}: no envelope or delivery output`); continue; }
    const r = (await CHK.check(env, out)).result; const ok = !stored || r.evidence_digest === stored; bad += !ok;
    console.log(`${ok ? "OK  " : "FAIL"}  ${name}: ${r.outcome}${r.evidence_digest ? `, digest ${r.evidence_digest.slice(0, 12)}` : ` (${r.failure_reason || r.blocked_reason || "no reason given"}), no digest`}${stored ? (ok ? " = stored" : " != stored " + stored.slice(0, 12)) : ""}`);
  } else if (o.envelope && o.delivery) {
    const r = (await CHK.check(o.envelope, o.delivery)).result; const ok = !o.result || CHK.canonicalJson(r) === CHK.canonicalJson(o.result); bad += !ok;
    console.log(`${ok ? "OK  " : "FAIL"}  ${name}: ${r.outcome}${r.failure_reason ? " (" + r.failure_reason + ")" : ""}${r.blocked_reason ? " (" + r.blocked_reason + ")" : ""}${o.result ? (ok ? ", equals committed result" : ", DIFFERS from committed result") : ""}`);
  } else if (o.governance_record) {
    const g = o.governance_record; console.log(`OK    ${name}: policy record, ${g.decision} ($${g.requested_usdc} vs cap $${g.permitted_max_usdc}); not re-executable here, shown as recorded`);
  } else { console.log(`SKIP  ${name}: unknown shape`); }
}

// Reputation counts only receipts checked before paid: the recommendation for the delivery was on chain before the buyer paid (src/gate.js).
// This reads the recorded entries of data/decisions.json; dry-run entries are not decisions. verify-decisions.mjs checks them against the chain.
const decSnap = await readFile(path.join(root, "data/decisions.json"), "utf8").then(JSON.parse, () => ({ decisions: [] }));
// A recorded entry counts only when the chain's own get_decisions returns an equal record (src/decisions.js verifyEntries).
G.attach(receipts, decSnap.contract_has_decisions === true ? await DEC.verifyEntries(decSnap, decSnap.decisions, fetch) : decSnap.decisions);

const snapshot = await readFile(path.join(root, "data/market-snapshot.json"), "utf8").then(JSON.parse, () => null);
const mk = await MKT.fetchAgents({ snapshot });
console.log(`\nmarket: ${mk.count} agents, ${mk.source}${mk.source === "snapshot" ? " from " + mk.fetched_at + " (live failed: " + mk.live_error + ")" : ""}`);
const byHandle = new Map(mk.agents.map((a) => [a.handle, a]));
// The town's own agents, then every seller of an admitted receipt (an outside hire's seller is not in data/agents.json).
const handles = [...new Set(JSON.parse(await readFile(path.join(root, "data/agents.json"), "utf8")).agents.flatMap((a) => a.executor_ids || []).concat(receipts.filter((r) => r.trusted && r.seller_handle).map((r) => r.seller_handle)))];
const n = (v) => (v == null ? "null" : v);
for (const h of handles) {
  const p = PF.buildPortfolio(h, byHandle.get(h) || null, receipts), q = p.proof;
  console.log(`PORTFOLIO ${h}: market delivered ${n(p.market.delivered_jobs)} / success ${n(p.market.success_rate)} / median_s ${n(p.market.median_s)}${byHandle.has(h) ? "" : " (not listed on the market)"}; proof checked_before_paid ${q.checked_before_paid}, proven_receipts ${q.proven_receipts}, distinct_owners ${q.distinct_owners}, earned_usdc ${n(q.earned_usdc)}, failed_checks ${q.failed_checks}, overrides ${q.overrides.length}, self_hires ${q.self_hires.length}, last_verified_at ${n(q.last_verified_at)}, streak_days ${q.streak_days}; receipts ${p.receipts.length}${q.unverified ? `, unverified ${q.unverified} (not counted)` : ""}`);
}
process.exit(bad ? 1 : 0);
