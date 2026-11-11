// Builds a pack receipt: commitment, program + source-replay checks, and rubric results merged from a STORED judge run file.
// No LLM here. scripts/pack-judge.mjs writes the judge run file; this script only reads it.
//   node scripts/pack-run.mjs --fixture data/backtest/fixtures/site-v3 [--judge-run data/backtest/judge-runs/site-v3/run-1.json] [--out data/backtest/receipts/site-v3.json]
// Fixture dir: job.json, meta.json (input_origin, committed_at, delivered_at, before_delivery, note, evidence_note, agent, deliverable{file,media_type}, sources[{id,url}], witnesses), the deliverable.
// Judge run file (agentproof-judge-run-v1): {schema, job, prompt_version, judges:[{label, model, ok, injection_seen, scores:[{criterion, score, quote, reason}]}]}
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Packs = require("../src/packs.js");
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const DATA = join(ROOT, "data");
const rel = (abs) => { const r = relative(DATA, resolve(abs)); if (r.startsWith("..")) throw new Error(`${abs} is outside data/`); return r.split(sep).join("/"); };
const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));
const u8 = (p) => new Uint8Array(readFileSync(p));

// Loader the browser's recheck also uses: path relative to data/.
export const loadFromData = async (path) => u8(join(DATA, path));

export async function runFixture(fixtureDir, { judgeRunPath = null } = {}) {
  const dir = resolve(fixtureDir), job = readJson(join(dir, "job.json")), meta = readJson(join(dir, "meta.json"));
  const packFile = `packs/${job.pack}.json`, pack = readJson(join(DATA, packFile));
  const dFile = rel(join(dir, meta.deliverable.file)), bytes = u8(join(DATA, dFile));
  const archive = existsSync(join(DATA, "backtest/archive/index.json")) ? readJson(join(DATA, "backtest/archive/index.json")) : {};
  const sources = (meta.sources || []).map((s) => {
    const r = archive[s.url];
    if (!r) return { id: s.id, url: s.url, archive_file: null, sha256: null, fetched_at: null, http_status: null, origin: null, bytes: null };
    return { id: s.id, url: s.url, archive_file: r.file, sha256: r.sha256, fetched_at: r.fetched_at, http_status: r.http_status, origin: r.origin, bytes: u8(join(DATA, r.file)) };
  });
  const input = job.params && job.params.input_file ? u8(join(DATA, job.params.input_file)) : null;
  let judgeRun = null, judgeRunSha256 = null, judgeRunFile = null;
  if (judgeRunPath) {
    const raw = u8(resolve(judgeRunPath)); judgeRun = JSON.parse(new TextDecoder().decode(raw));
    if (judgeRun.schema !== Packs.JUDGE_RUN_SCHEMA) throw new Error(`${judgeRunPath}: not an ${Packs.JUDGE_RUN_SCHEMA} file`);
    if (judgeRun.job !== job.id) throw new Error(`${judgeRunPath}: judge run is for job ${judgeRun.job}, not ${job.id}`);
    judgeRunSha256 = await Packs.sha256(raw); judgeRunFile = rel(judgeRunPath);
  }
  return Packs.withHash(await Packs.buildReceipt({ pack, packFile, job, jobFile: rel(join(dir, "job.json")), bytes, deliverable: { file: dFile, media_type: meta.deliverable.media_type },
    sources, input, judgeRun, judgeRunFile, judgeRunSha256, meta }));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2), opt = (k) => (a.includes(k) ? a[a.indexOf(k) + 1] : null);
  const fx = opt("--fixture");
  if (!fx) { console.error("usage: node scripts/pack-run.mjs --fixture <dir> [--judge-run <file>] [--out <file>]"); process.exit(2); }
  const r = await runFixture(fx, { judgeRunPath: opt("--judge-run") });
  const out = opt("--out") || join(DATA, "backtest/receipts", r.id + ".json");
  writeFileSync(out, JSON.stringify(r, null, 2) + "\n");
  const rc = await Packs.recheck(JSON.parse(readFileSync(out, "utf8")), loadFromData);
  console.log(`${r.id}: verdict ${r.verdict} (${r.verdict_reason}); re-check ${rc.ok ? "green" : "RED"}; wrote ${relative(ROOT, out)}`);
  if (!rc.ok) { for (const x of rc.recomputed.filter((x) => !x.ok)) console.error("  FAIL", x.id, x.detail); process.exit(1); }
}
