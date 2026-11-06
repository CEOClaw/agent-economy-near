// Offline analysis of stored judge runs: used by scripts/backtest.mjs (writes calibration.json) and scripts/test-packs.mjs (recomputes it). No LLM, no network.
// Every number is rebuilt from data/backtest/judge-runs/<id>/run-N.json through the same receipt code (quote matching, aggregation) the browser re-check uses.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { runFixture, DATA } from "./pack-run.mjs";

export const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));
// labels.json is frozen; labels-addendum.json (if present) only adds fixtures and pairs and is dated after the first run.
export const labels = () => {
  const L = readJson(join(DATA, "backtest/labels.json")), ap = join(DATA, "backtest/labels-addendum.json");
  if (!existsSync(ap)) return L;
  const A = readJson(ap);
  return { ...L, fixtures: { ...L.fixtures, ...A.fixtures }, injection_pairs: [...L.injection_pairs, ...A.injection_pairs],
    injection_flagged: { yes: [...L.injection_flagged.yes, ...A.injection_flagged.yes], no: [...L.injection_flagged.no, ...A.injection_flagged.no] } };
};
export const fixtureDir = (id) => join(DATA, "backtest/fixtures", id);
export const runFiles = (id) => { const d = join(DATA, "backtest/judge-runs", id); return existsSync(d) ? readdirSync(d).filter((f) => /^run-\d+\.json$/.test(f)).sort((a, b) => parseInt(a.slice(4)) - parseInt(b.slice(4))).map((f) => join(d, f)) : []; };
export const BAND = { lt3: (v) => v < 3, ge3: (v) => v >= 3, ge4: (v) => v >= 4 };
const frac = (a, b) => (b ? Math.round(a / b * 1000) / 1000 : null);

// For each fixture with judge runs: one receipt per run (in memory). Returns {id: [{run, receipt, file, raw}]}.
export async function loadAll() {
  const out = {};
  for (const id of Object.keys(labels().fixtures)) {
    const files = runFiles(id); if (!files.length) continue;
    out[id] = [];
    for (const f of files) out[id].push({ run: parseInt(f.split("run-")[1]), file: f, raw: readJson(f), receipt: await runFixture(fixtureDir(id), { judgeRunPath: f }) });
  }
  return out;
}

export async function analyze() {
  const L = labels(), all = await loadAll(), matrix = {}, judges = {};
  const J = (l) => (judges[l] ??= { label: l, models: new Set(), scores_total: 0, scores_void: 0, labeled_valid: 0, labeled_ok: 0, per_pair: {}, inj_yes_seen: 0, inj_yes_total: 0, inj_no_seen: 0, inj_no_total: 0, calls_failed: 0, cost_usd: 0 });
  for (const [id, runs] of Object.entries(all)) {
    matrix[id] = {};
    for (const { run, receipt, raw } of runs) {
      for (const j of raw.judges) { const s = J(j.label); if (j.model) s.models.add(j.model); if (!j.ok) s.calls_failed++; s.cost_usd += j.usd || 0; }
      for (const j of raw.judges) {
        const yes = L.injection_flagged.yes.includes(id), no = L.injection_flagged.no.includes(id), s = J(j.label);
        if (yes && j.ok) { s.inj_yes_total++; if (j.injection_seen) s.inj_yes_seen++; }
        if (no && j.ok) { s.inj_no_total++; if (j.injection_seen) s.inj_no_seen++; }
      }
      for (const c of receipt.criteria.filter((x) => x.type === "rubric" && x.status !== "not_applicable" && x.status !== "not_run")) {
        const m = (matrix[id][c.id] ??= { runs: [] });
        m.runs.push({ run, median: c.median, spread: c.spread, valid_n: c.valid_n, status: c.status, scores: Object.fromEntries(c.scores.map((s) => [s.judge, s.void ? null : s.score])), void: Object.fromEntries(c.scores.map((s) => [s.judge, s.void])) });
        const band = (L.fixtures[id].rubrics || {})[c.id];
        for (const s of c.scores) {
          const st = J(s.judge); st.scores_total++; if (s.void) st.scores_void++;
          if (band && !s.void) { st.labeled_valid++; const ok = BAND[band](s.score); if (ok) st.labeled_ok++; const p = (st.per_pair[`${id}/${c.id}`] ??= { band, valid: 0, ok: 0 }); p.valid++; if (ok) p.ok++; }
        }
      }
    }
  }
  // Stability: for each (fixture, criterion), do the reruns stay within one level? Panel level (median of the panel per run) and per judge.
  const pairs = [], perJudgeStab = {};
  for (const [id, cs] of Object.entries(matrix)) for (const [cid, m] of Object.entries(cs)) {
    const med = m.runs.map((r) => r.median).filter((x) => x != null);
    if (med.length >= 2) pairs.push({ fixture: id, criterion: cid, runs: med.length, min: Math.min(...med), max: Math.max(...med), within1: Math.max(...med) - Math.min(...med) <= 1 });
    for (const l of Object.keys(judges)) { const v = m.runs.map((r) => r.scores[l]).filter((x) => x != null); if (v.length >= 2) { const p = (perJudgeStab[l] ??= { pairs: 0, within1: 0 }); p.pairs++; if (Math.max(...v) - Math.min(...v) <= 1) p.within1++; } }
  }
  const stability = { pairs: pairs.length, within1: pairs.filter((p) => p.within1).length, fraction: frac(pairs.filter((p) => p.within1).length, pairs.length), outside: pairs.filter((p) => !p.within1), per_judge: Object.fromEntries(Object.entries(perJudgeStab).map(([l, p]) => [l, { ...p, fraction: frac(p.within1, p.pairs) }])) };
  // Panel against labels: each (fixture, labeled rubric, run) panel median must fall in the band. A contested or no-quorum run has no median and counts as a miss.
  let pp = 0, pok = 0; const panel_pairs = [];
  for (const [id, f] of Object.entries(L.fixtures)) for (const [cid, band] of Object.entries(f.rubrics || {})) {
    const runs = (matrix[id] && matrix[id][cid] && matrix[id][cid].runs) || [], ok = runs.filter((r) => r.median != null && BAND[band](r.median)).length;
    pp += runs.length; pok += ok; panel_pairs.push({ fixture: id, criterion: cid, band, runs: runs.length, in_band: ok, medians: runs.map((r) => r.median) });
  }
  const verdicts = {};
  for (const [id, f] of Object.entries(L.fixtures)) {
    const got = all[id] ? all[id].map((r) => r.receipt.verdict) : null;
    verdicts[id] = { expected: f.verdict, by_run: got, match_runs: got ? got.filter((v) => v === f.verdict).length : null, runs: got ? got.length : 0 };
  }
  const jout = Object.fromEntries(Object.entries(judges).map(([l, s]) => [l, { models: [...s.models], scores: s.scores_total, void: s.scores_void, void_rate: frac(s.scores_void, s.scores_total), labeled_valid: s.labeled_valid, labeled_in_band: s.labeled_ok, band_accuracy: frac(s.labeled_ok, s.labeled_valid),
    injection_seen_on_injected: `${s.inj_yes_seen}/${s.inj_yes_total}`, injection_seen_on_clean: `${s.inj_no_seen}/${s.inj_no_total}`, failed_calls: s.calls_failed, cost_usd: Math.round(s.cost_usd * 1e6) / 1e6, stability_within1: stability.per_judge[l] || null, per_pair: s.per_pair }]));
  return { schema: "agentproof-backtest-calibration-v1", mock: true, note: "Judge accuracy against labels registered before any judge ran (labels.json). Mock backtest, not market evidence. Rebuilt from the stored judge-run files.",
    runs_per_fixture: Object.fromEntries(Object.entries(all).map(([k, v]) => [k, v.length])), judges: jout, panel: { band_pairs: pp, in_band: pok, band_accuracy: frac(pok, pp), pairs: panel_pairs }, stability, verdicts, matrix };
}
