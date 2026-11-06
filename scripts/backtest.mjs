// Orchestrates the mock backtest: judge panel x up to 5 reruns on every fixture with a text deliverable, then receipts, index.json and calibration.json.
//   env-helper run --file ~/work/ohwow/ohwow.fun/.env.local -- node scripts/backtest.mjs [--reruns 5] [--receipts-only]
// Background it with a sentinel: node scripts/backtest.mjs > $LOG 2>&1; echo EXIT=$? >> $LOG. Silent until the end except the plan line.
// Resumable: a run file that exists is not re-judged (spend is recorded once). Stops at the spend cap and marks the rest not_run.
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { runFixture, loadFromData, DATA } from "./pack-run.mjs";
import { openLedger, pricing, credits, judgeFixture, estimateCall, MODELS, STOP_USD, CAP_USD, buildPrompt, rubricsOf } from "./pack-judge.mjs";
import { labels, fixtureDir, runFiles, analyze, readJson } from "./backtest-lib.mjs";

const Packs = createRequire(import.meta.url)("../src/packs.js");
const a = process.argv.slice(2), opt = (k, d) => (a.includes(k) ? a[a.indexOf(k) + 1] : d), RERUNS = +opt("--reruns", 5), receiptsOnly = a.includes("--receipts-only");
const L = labels(), ids = Object.keys(L.fixtures);

// Which fixtures get a judge: a text deliverable under a pack with rubrics.
const judged = ids.filter((id) => { const d = fixtureDir(id), job = readJson(join(d, "job.json")), meta = readJson(join(d, "meta.json")), pack = readJson(join(DATA, "packs", job.pack + ".json"));
  return rubricsOf(pack).length && Packs.judgeText(new Uint8Array(readFileSync(join(d, meta.deliverable.file))), meta.deliverable.media_type, job) != null; });

if (!receiptsOnly) {
  const ledger = openLedger(), prices = await pricing();
  if (!ledger.data.credits.before) { ledger.data.credits.before = await credits(); ledger.save(); }
  // Plan: estimate one full round (judged fixtures x 3 judges) from the prompt sizes, then fit as many rounds as the cap allows. Nothing is reduced silently.
  let round = 0;
  for (const id of judged) { const d = fixtureDir(id), job = readJson(join(d, "job.json")), meta = readJson(join(d, "meta.json")), pack = readJson(join(DATA, "packs", job.pack + ".json"));
    const jt = Packs.judgeText(new Uint8Array(readFileSync(join(d, meta.deliverable.file))), meta.deliverable.media_type, job), chars = buildPrompt(pack, job, jt, "0".repeat(16)).reduce((x, m) => x + m.content.length, 0);
    for (const m of MODELS) round += estimateCall(prices[m.slug], chars); }
  const room = STOP_USD - ledger.spent(), fit = Math.min(RERUNS, Math.floor(room / round));
  const smoke = ledger.data.calls.filter((c) => c.kind === "smoke"), measured = smoke.length ? smoke.reduce((x, c) => x + c.usd, 0) / smoke.length : null;
  console.log(`PLAN: ${judged.length} judged fixtures x ${MODELS.length} judges = ${judged.length * MODELS.length} calls per round. Conservative estimate ${round.toFixed(3)} USD per round, ${(round * RERUNS).toFixed(3)} USD for ${RERUNS} rounds` + (measured != null ? `; smoke test measured ${measured.toFixed(5)} USD per call, so ${(measured * judged.length * MODELS.length * RERUNS).toFixed(3)} USD for ${RERUNS} rounds` : "") + `. Spent so far ${ledger.spent().toFixed(4)} of cap ${CAP_USD} (hard stop ${STOP_USD}). Rounds that fit: ${fit} of ${RERUNS}.`);
  if (fit < RERUNS) console.log(`WARNING: only ${fit} of ${RERUNS} rounds fit under the cap by the conservative estimate. They run; the per-call hard stop still applies and anything not run is marked not_run.`);
  let inflight = 0; const q = [];
  const sem = (f) => new Promise((res, rej) => { const go = () => { inflight++; f().then(res, rej).finally(() => { inflight--; if (q.length) q.shift()(); }); }; inflight < 4 ? go() : q.push(go); });
  for (let run = 1; run <= RERUNS; run++) {
    const todo = judged.filter((id) => !existsSync(join(DATA, "backtest/judge-runs", id, `run-${run}.json`)));
    const outs = await Promise.all(todo.map(async (id) => { const r = await judgeFixture({ ledger, prices, fixtureDir: fixtureDir(id), run, sem }); return [id, r]; }));
    for (const [id, r] of outs) if (r && r.judges.length) { const d = join(DATA, "backtest/judge-runs", id); mkdirSync(d, { recursive: true }); writeFileSync(join(d, `run-${run}.json`), JSON.stringify(r, null, 2) + "\n"); }
    const skipped = outs.filter(([, r]) => r && r.not_run.length).length;
    console.log(`round ${run}: ${outs.length} fixtures judged, ${skipped} with judges skipped by the spend cap, spent ${ledger.spent().toFixed(4)} USD`);
  }
  ledger.data.credits.after = await credits();
  ledger.data.credits.delta_usd = Math.round((ledger.data.credits.after.total_usage - ledger.data.credits.before.total_usage) * 1e6) / 1e6;
  ledger.data.credits.note = "total_usage delta on the shared OpenRouter account: an upper bound, other jobs may have spent in the same window";
  ledger.save();
}

// Receipts: run-1 feeds each receipt. No run file: rubrics stay not_run (or not_applicable for binary deliverables).
mkdirSync(join(DATA, "backtest/receipts"), { recursive: true });
const index = [];
for (const id of ids) {
  const f = runFiles(id)[0] || null, r = await runFixture(fixtureDir(id), { judgeRunPath: f });
  const rc = await Packs.recheck(r, loadFromData);
  if (!rc.ok) { console.error(`RECHECK RED ${id}: ` + rc.recomputed.filter((x) => !x.ok).map((x) => x.id + " " + x.detail).join(" | ")); process.exitCode = 1; }
  writeFileSync(join(DATA, "backtest/receipts", id + ".json"), JSON.stringify(r, null, 2) + "\n");
  index.push({ id, file: `backtest/receipts/${id}.json`, pack: r.pack.id, agent: r.agent.handle || r.agent.label, input_origin: r.input_origin, verdict: r.verdict, receipt_hash: r.receipt_hash });
}
writeFileSync(join(DATA, "backtest/index.json"), JSON.stringify({ schema: "agentproof-backtest-index-v1", mock: true, note: "Mock backtest. Not market evidence.", receipts: index }, null, 2) + "\n");
const cal = await analyze();
writeFileSync(join(DATA, "backtest/calibration.json"), JSON.stringify(cal, null, 2) + "\n");
console.log(`receipts: ${index.length}; verdicts: ` + ["pass", "fail", "contested", "incomplete"].map((v) => `${v} ${index.filter((x) => x.verdict === v).length}`).join(", "));
console.log(`calibration: panel band accuracy ${cal.panel.in_band}/${cal.panel.band_pairs}, stability ${cal.stability.within1}/${cal.stability.pairs}`);
