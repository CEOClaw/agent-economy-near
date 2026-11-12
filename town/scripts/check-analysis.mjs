#!/usr/bin/env node
// Cross-checks src/analysis.js against data/market-snapshot.json + the manifest's runs.
// Prints the Stats summary and the exact strings the panel shows for the headline numbers
// (QA compares them with the DOM), and exits 1 if a known number is off.
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const req = createRequire(import.meta.url);
const CHK = req(path.join(root, "src/checker.js")), PF = req(path.join(root, "src/portfolio.js")), AN = req(path.join(root, "src/analysis.js")), GATE = req(path.join(root, "src/gate.js")), DEC = req(path.join(root, "src/decisions.js"));
globalThis.crypto ??= (await import("node:crypto")).webcrypto;
const json = async (f) => JSON.parse(await readFile(path.join(root, f), "utf8"));

const snap = await json("data/market-snapshot.json");
// The page attaches the gate the same way: a recorded entry counts only after the chain's own get_decisions returns an equal record.
const decSnap = await json("data/decisions.json");
const decisions = decSnap.contract_has_decisions === true ? await DEC.verifyEntries(decSnap, decSnap.decisions, fetch) : decSnap.decisions;
console.log(`decisions read live from ${decSnap.contract}: ${decisions.filter((d) => d.live_verified === true).length} of ${decSnap.decisions.filter((d) => d.status === "recorded").length} recorded entries equal on chain`);
const receipts = [];
for (const r of (await json("data/manifest.json")).runs) {
  const run = await json("data/" + r.file), rc = await PF.checkReceipt(run, CHK, "manifest", r.bundle_digest);
  if (rc) GATE.attach([rc], decisions);
  if (rc) receipts.push({ ...rc, file: r.file, price_usdc: run.job_ref?.hire?.amount != null ? Number(run.job_ref.hire.amount) : null });
}
const s = AN.compute(snap.agents, receipts), h = AN.headline(s);

console.log(`source line: ${AN.sourceLine("snapshot", snap.fetched_at)}`);
console.log(`n=${s.n} delivered_total=${s.delivered_total} zero=${s.zero.count} (${(s.zero.share * 100).toFixed(1)}%) available=${s.available.count} (${(s.available.share * 100).toFixed(1)}%) checked_total=${s.checked_total} proven_total=${s.proven_total}`);
console.log(`top10: ${s.top_share.top10_delivered} delivered, share ${(s.top_share.share * 100).toFixed(1)}%`);
console.log("histogram: " + s.histogram.map((b) => `${b.label}=${b.count}`).join("  "));
console.log("categories (delivered/checked/agents): " + s.categories.map((c) => `${c.category} ${c.delivered}/${c.checked}/${c.agents}`).join(", "));
console.log("response median by category: " + s.response_by_category.map((c) => `${c.category} ${c.median_s}s(n=${c.n})`).join(", "));
console.log(`scatter: ${s.scatter.length} points, ${s.scatter.filter((p) => p.delivered === 1 && p.success_rate === 100).length} at 100% on 1 job`);
for (const r of s.receipts) console.log(`receipt ${String(r.id).slice(0, 8)} ${r.seller_handle} ${r.buyer_owner_label}->${r.seller_owner_label} self_hire=${r.self_hire} price=${r.price_usdc} ${r.outcome} stored=${String(r.stored_digest).slice(0, 8)} recomputed=${String(r.recomputed_digest).slice(0, 8)} proven=${r.proven} checked_before_paid=${r.counted} check_state=${r.check_state}`);
console.log("panel strings: " + JSON.stringify(h));

// Expected values come straight from the snapshot, so a refresh cannot leave them stale.
const raw = snap.agents, jobs = (a) => Number(a.delivered_jobs) || 0;
const on = (a) => (a.available_now != null ? a.available_now === true : a.availability === "available" || a.availability === "available_now");
const want = [["n", s.n, snap.count], ["delivered_total", s.delivered_total, raw.reduce((t, a) => t + jobs(a), 0)], ["zero.count", s.zero.count, raw.filter((a) => jobs(a) === 0).length], ["available.count", s.available.count, raw.filter(on).length], ["proven_total (2d17e4c8, 8a20efe5, 34d0f7a5)", s.proven_total, 3], ["checked_total (8a20efe5 and 34d0f7a5 checked before paid; 2d17e4c8 was paid before any check)", s.checked_total, 2]];
const histSum = s.histogram.reduce((a, b) => a + b.count, 0);
want.push(["histogram sums to n", histSum, s.n], ["histogram[0] equals zero.count", s.histogram[0].count, s.zero.count]);
let bad = 0;
for (const [name, got, exp] of want) { const ok = got === exp; bad += !ok; console.log(`${ok ? "OK  " : "FAIL"}  ${name}: ${got}${ok ? "" : ` (expected ${exp})`}`); }
process.exit(bad ? 1 : 0);
