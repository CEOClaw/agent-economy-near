// Section 6 tests of the Check Packs rethink, printed with numbers from STORED data. Offline, deterministic, no LLM, no network. Exit 1 if any test fails.
//   node scripts/test-packs.mjs
// Everything is rebuilt from data/backtest/ (fixtures, labels, judge-runs, receipts). Mock backtest: none of this is market evidence.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { createRequire } from "node:module";
import { loadFromData, DATA } from "./pack-run.mjs";
import { analyze, labels, readJson } from "./backtest-lib.mjs";

const Packs = createRequire(import.meta.url)("../src/packs.js"), ROOT = join(DATA, "..");
const L = labels(), ids = Object.keys(L.fixtures), rcp = (id) => readJson(join(DATA, "backtest/receipts", id + ".json"));
const R = Object.fromEntries(ids.map((id) => [id, rcp(id)]));
let failed = 0; const out = (s = "") => console.log(s), q = (s, n = 90) => { s = s.replace(/\s+/g, " "); return s.length > n ? s.slice(0, n - 3) + "..." : s; };
const result = (n, title, ok) => { out(`${ok ? "PASS" : "FAIL"} test ${n}: ${title}\n`); if (!ok) failed++; };
const crit = (r, id) => r.criteria.find((c) => c.id === id);
const failing = (r) => r.criteria.filter((c) => (c.gate === "hard" && c.status === "fail") || (c.type === "rubric" && c.status === "fail")).map((c) => `${c.id}${c.type === "rubric" ? ` (median ${c.median} < ${c.gate.min})` : ""}`);
const goodQuote = (r) => { for (const c of r.criteria.filter((x) => x.type === "rubric")) for (const s of c.scores || []) if (!s.void && s.quote_found) return { criterion: c.id, ...s }; return null; };

out("Check Packs: Section 6 tests. Mock backtest, not market evidence. Numbers below are read from data/backtest/.\n");
const cal = await analyze();

// ---- 1. hand verdicts ----
{
  out("Test 1: hand verdicts (site v1 fail, v2 fail, v3 pass, field-extraction job 2d17e4c8 pass)");
  let ok = true;
  for (const [id, want, hand] of [["site-v1", "fail", "hand review FAIL"], ["site-v2", "fail", "hand review FAIL"], ["site-v3", "pass", "hand review PASS"], ["fe-market", "pass", "buyer accepted on the market (separate record)"]]) {
    const r = R[id], gq = goodQuote(r), match = r.verdict === want && !!gq;
    out(`  ${id.padEnd(10)} hand: ${want} (${hand}); receipt: ${r.verdict}; failing: ${failing(r).join(", ") || "none"}; judges ${(r.panel ? r.panel.judges.map((j) => j.model).join(", ") : "none")}`);
    out(`             verified judge quote: ${gq ? `${gq.judge} on ${gq.criterion}, score ${gq.score}: "${q(gq.quote)}"` : "NONE"}${match ? "" : "   <-- mismatch"}`);
    ok = ok && match;
  }
  result(1, "receipt verdicts equal the hand verdicts and each carries a verified judge quote", ok);
}

// ---- 2. stability ----
{
  const s = cal.stability, runs = [...new Set(Object.values(cal.runs_per_fixture))].join("/");
  out(`Test 2: stability: reruns of the panel stay within one level (${runs} reruns per fixture, panel median per run)`);
  out(`  ${s.within1} of ${s.pairs} (fixture, criterion) pairs within one level = ${(s.fraction * 100).toFixed(1)}% (need >= 90%)`);
  for (const [l, p] of Object.entries(s.per_judge)) out(`  single judge ${l}: ${p.within1} of ${p.pairs} = ${(p.fraction * 100).toFixed(1)}%`);
  for (const p of s.outside) out(`  outside one level: ${p.fixture}/${p.criterion}: panel medians ranged ${p.min} to ${p.max} over ${p.runs} runs`);
  result(2, "panel stability >= 90%", s.pairs > 0 && s.fraction >= 0.9);
}

// ---- 3. injection ----
{
  out("Test 3: injection: the injected deliverable must not score above its clean twin on any criterion (median over reruns of the panel median), and must be flagged");
  const med = (xs) => { const v = xs.filter((x) => x != null).sort((a, b) => a - b); return v.length ? (v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2) : null; };
  let ok = true, blocked = 0, scored = 0;
  for (const { injected, clean } of L.injection_pairs) {
    if (!Object.keys(cal.matrix[injected] || {}).length) { out(`  ${injected} vs ${clean}: NOT SCORED: every judge call was refused by the provider route (HTTP 403 prompt-injection classifier), so there is no median to compare. Not counted as a pass.`); blocked++; continue; }
    for (const cid of Object.keys(cal.matrix[clean] || {})) {
      const ci = cal.matrix[injected][cid].runs, cc = cal.matrix[clean][cid].runs, mi = med(ci.map((r) => r.median)), mc = med(cc.map((r) => r.median));
      const perRun = ci.filter((r) => { const c = cc.find((x) => x.run === r.run); return r.median != null && c && c.median != null && r.median <= c.median; }).length;
      scored++; const holds = mi != null && mc != null && mi <= mc; ok = ok && holds;
      out(`  ${injected} vs ${clean} on ${cid}: injected ${mi} <= clean ${mc}: ${holds ? "yes" : "NO"}   (run by run: ${perRun} of ${ci.length} runs hold)`);
    }
    const ri = R[injected], rc = R[clean];
    const f = ri.injection.flagged && !rc.injection.flagged; ok = ok && f;
    out(`  ${injected}: flagged by program scan ${ri.injection.flagged ? "yes" : "NO"} (${ri.injection.matches.map((m) => m.pattern).join(", ")}); judges that reported it in run 1: ${ri.injection.judges_flagged} of ${ri.panel ? ri.panel.judges.length : 0}; clean twin ${clean} flagged: ${rc.injection.flagged ? "YES" : "no"}`);
  }
  out(`  pairs: ${L.injection_pairs.length - blocked} scored, ${blocked} refused by the route and unscored`);
  ok = ok && scored > 0 && L.injection_pairs.length - blocked >= 3;
  for (const id of L.injection_flagged.yes) ok = ok && R[id].injection.flagged;
  for (const id of L.injection_flagged.no) ok = ok && !R[id].injection.flagged;
  out(`  program flags: ${L.injection_flagged.yes.filter((id) => R[id].injection.flagged).length} of ${L.injection_flagged.yes.length} injected flagged, ${L.injection_flagged.no.filter((id) => R[id].injection.flagged).length} of ${L.injection_flagged.no.length} clean flagged`);
  for (const [l, j] of Object.entries(cal.judges)) out(`  judge ${l} (${j.models.join(", ")}): reported injection on ${j.injection_seen_on_injected} injected calls, ${j.injection_seen_on_clean} clean calls`);
  result(3, "injection did not raise any median and every injected deliverable is flagged", ok);
}

// ---- 4. fabricated citation and fake URL caught by program ----
{
  out("Test 4: fabricated citation and fake URL are caught by program, with no judge involved");
  const { runFixture } = await import("./pack-run.mjs");
  let ok = true;
  for (const [id, cid] of [["research-fabricated", "quotes-in-source"], ["research-fakeurl", "urls-resolve"]]) {
    const r = R[id], c = crit(r, cid), bare = await runFixture(join(DATA, "backtest/fixtures", id)), cb = crit(bare, cid);
    const good = r.verdict === "fail" && c.status === "fail" && c.trust === "Reproduced" && cb.status === "fail" && cb.detail === c.detail && r.trust.reproduced.hard_failed.includes(cid);
    ok = ok && good;
    out(`  ${id}: verdict ${r.verdict}; ${cid} (${c.type}, ${c.trust}) ${c.status}: ${q(c.detail, 120)}`);
    out(`             same result rebuilt with no judge run: ${cb.status}, detail identical: ${cb.detail === c.detail}`);
  }
  result(4, "both are hard failures decided by program", ok);
}

// ---- 5. tamper ----
{
  out("Test 5: tamper: every stored receipt re-checks green; one-byte tampering in memory turns it red");
  let ok = true;
  const reds = [];
  for (const id of ids) { const rc = await Packs.recheck(R[id], loadFromData); if (!rc.ok) reds.push(id); }
  out(`  untampered: ${ids.length - reds.length} of ${ids.length} receipts green${reds.length ? "; RED: " + reds.join(", ") : ""}`);
  ok = ok && reds.length === 0;
  const viaLoad = (r, edit) => async (p) => edit(p, await loadFromData(p));
  for (const id of ["site-v3", "research-good"]) {
    const r = R[id], base = await Packs.recheck(r, loadFromData);
    const t1 = await Packs.recheck(r, viaLoad(r, (p, b) => { if (p === r.deliverable.file) { b = b.slice(); b[Math.floor(b.length / 2)] ^= 1; } return b; }));
    const t2 = await Packs.recheck(r, viaLoad(r, (p, b) => { if (p === r.pack.file) { const s = new TextDecoder().decode(b).replace(/"min": 3/, '"min": 2'); if (s === new TextDecoder().decode(b)) throw new Error("rubric tamper did not apply"); return new TextEncoder().encode(s); } return b; }));
    const m = structuredClone(r), sc = m.criteria.find((c) => c.type === "rubric" && c.scores.some((s) => !s.void)).scores.find((s) => !s.void); sc.score = sc.score === 1 ? 5 : 1;
    const t3 = await Packs.recheck(m, loadFromData);
    const failedIds = (x) => x.recomputed.filter((y) => !y.ok).map((y) => y.id).slice(0, 4).join(", ");
    const good = base.ok && !t1.ok && !t2.ok && !t3.ok; ok = ok && good;
    out(`  ${id}: untampered ${base.ok ? "green" : "RED"}; one byte of deliverable flipped: ${t1.ok ? "GREEN" : "red"} (${failedIds(t1)}); rubric changed in the pack file: ${t2.ok ? "GREEN" : "red"} (${failedIds(t2)}); one stored score changed: ${t3.ok ? "GREEN" : "red"} (${failedIds(t3)})`);
  }
  result(5, "untampered green, each tamper red", ok);
}

// ---- 6. mock label and grep gate ----
{
  out("Test 6: every receipt is mock and makes no market claim; grep gate over new files");
  let ok = true;
  const bad = ids.filter((id) => !(R[id].mock === true && /Not market evidence/.test(R[id].evidence_note) && R[id].commitment.before_delivery === false));
  const idx = readJson(join(DATA, "backtest/index.json"));
  ok = ok && bad.length === 0 && idx.mock === true && idx.receipts.length === ids.length && cal.mock === true;
  out(`  receipts with mock:true and "Not market evidence" and before_delivery false: ${ids.length - bad.length} of ${ids.length}${bad.length ? "; bad: " + bad.join(", ") : ""}; index.json mock ${idx.mock}, ${idx.receipts.length} entries; calibration mock ${cal.mock}`);
  const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
  const files = [...walk(join(DATA, "backtest")), ...walk(join(DATA, "packs")), join(ROOT, "docs/check-pack-spec.md"), join(ROOT, "src/packs.js"), ...walk(join(ROOT, "scripts")).filter((p) => /scripts\/(pack-|backtest|make-fixtures|test-packs)/.test(p))];
  try { files.push(join(ROOT, "src/packs-ui.js")); readFileSync(join(ROOT, "src/packs-ui.js")); } catch { files.pop(); }
  // Third-party and seller text (archived pages, fixtures, model output, receipts quoting them) may contain ordinary words like "first"; they are exempt from the word list only.
  const quoted = /data\/backtest\/(archive|fixtures|judge-runs|receipts|calibration)/;
  const W = ["patent" + " pending", "\\b(?:" + ["no" + "vel", "fir" + "st", "uni" + "que", "paten" + "ted", "propri" + "etary", "unprece" + "dented"].join("|") + ")\\b(?!-)", "0x[0-9a-fA-F]{40}", "0x[0-9a-fA-F]{64}", "\\.near\\b"];
  const hits = [];
  for (const f of files) {
    const rel = relative(ROOT, f), t = readFileSync(f, "utf8");
    if (rel === "scripts/test-packs.mjs") continue; // holds the patterns themselves, in pieces
    for (const [i, w] of W.entries()) { if (i === 1 && quoted.test(rel)) continue; const m = new RegExp(w, "i").exec(t); if (m) hits.push(`${rel}: "${m[0]}"`); }
  }
  out(`  scanned ${files.length} files for: the patent-pending phrase, novelty words (authored files only), 0x+40 hex, 0x+64 hex, .near account names: ${hits.length} hits${hits.length ? "\n    " + hits.join("\n    ") : ""}`);
  ok = ok && hits.length === 0;
  result(6, "all mock, no market claim, grep gate clean", ok);
}

out(`${failed ? failed + " test(s) FAILED" : "all 6 tests passed"}`);
process.exit(failed ? 1 : 0);
