#!/usr/bin/env node
// The only way a run should enter data/manifest.json. A run counts on the site only if the manifest holds its
// hash (bundle_digest, the same value src/portfolio.js computes in the browser).
// A market run is admitted only after GET /v1/jobs/{id} shows the job exists and matches the file. That route needs
// a market token, and the API blocks other sites' browsers, so this check happens HERE, at admission. The page checks
// only the hash; it cannot see the market job. A 404 means the job is unknown, deleted, or private to other parties.
//   MARKET_TOKEN=aat_... node scripts/admit-run.mjs <run file>... [--title T] [--meta M]   admit or re-hash
//   MARKET_TOKEN=aat_... node scripts/admit-run.mjs --check   re-check every listed run, never changes a hash
//   node scripts/admit-run.mjs <run file>... --unchecked      no token: admit and record market_check not_run
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const CHK = createRequire(import.meta.url)(path.join(root, "src/checker.js"));
globalThis.crypto ??= (await import("node:crypto")).webcrypto;
const API = process.env.MARKET_API || "https://market.near.ai/v1", TOKEN = process.env.MARKET_TOKEN;
const MANIFEST = path.join(root, "data/manifest.json");
const argv = process.argv.slice(2), flag = (n) => { const i = argv.indexOf(n); return i < 0 ? false : argv.splice(i, 1).length > 0; };
const opt = (n) => { const i = argv.indexOf(n); return i < 0 ? undefined : argv.splice(i, 2)[1]; };
const CHECK = flag("--check"), UNCHECKED = flag("--unchecked"), title = opt("--title"), meta = opt("--meta");
const read = async (f) => JSON.parse(await readFile(f, "utf8"));
const hashOf = (run) => CHK.sha256Hex(CHK.canonicalJson(run));

// -> { market_check } to record, or { refuse } with the reason. Runs that are not market jobs have nothing to look up.
async function marketCheck(run) {
  if (!run.job_ref) return {};
  if (!TOKEN) return UNCHECKED ? { market_check: { status: "not_run", reason: "admitted without a market token" } } : { refuse: "MARKET_TOKEN is not set, so the job cannot be looked up" };
  const job = run.job_ref.job || {}, id = job.id || run.job_ref.hire?.job_id;
  if (!id) return { refuse: "the file names no job id" };
  const res = await fetch(`${API}/jobs/${encodeURIComponent(id)}`, { headers: { accept: "application/json", authorization: `Bearer ${TOKEN}` }, signal: AbortSignal.timeout(15000) });
  if (res.status === 404) return { refuse: `job ${id} not found (unknown, deleted, or private to other parties)` };
  if (!res.ok) return { refuse: `the market answered HTTP ${res.status}` };
  const v = await res.json();
  const same = [["jobId", v.jobId === id], ["createdAt", Date.parse(v.createdAt) === Date.parse(job.created_at)], ["title", v.title === job.title], ["budgetAmount", Number(v.budgetAmount) === Number(job.budget_amount)], ["budgetToken", v.budgetToken === job.budget_token]];
  const off = same.filter(([, ok]) => !ok).map(([k]) => k);
  if (off.length) return { refuse: `job ${id} exists but differs from the file on: ${off.join(", ")}` };
  return { market_check: { status: "found", checked_at: new Date().toISOString(), job_status: v.status ?? null } };
}

const m = await read(MANIFEST), results = [];
const targets = CHECK ? m.runs.map((r) => r.file) : argv.map((f) => path.relative(path.join(root, "data"), path.resolve(f)));
if (!targets.length) { console.error("usage: admit-run.mjs <run file>... [--title T] [--meta M] [--unchecked] | --check"); process.exit(2); }
let refused = 0;
for (const file of targets) {
  const run = await read(path.join(root, "data", file)), bundle_digest = await hashOf(run), entry = m.runs.find((r) => r.file === file);
  if (CHECK && entry.bundle_digest !== bundle_digest) { refused++; console.log(`REFUSED  ${file}: its hash is not the one the manifest admits`); continue; }
  const got = await marketCheck(run).catch((e) => ({ refuse: `the market could not be reached: ${e.message}` }));
  if (got.refuse) { refused++; console.log(`REFUSED  ${file}: ${got.refuse}`); continue; }
  results.push({ file, entry, bundle_digest, market_check: got.market_check });
  console.log(`${CHECK ? "CHECKED " : "ADMITTED"} ${file}: ${bundle_digest.slice(0, 12)}${got.market_check ? `, market ${got.market_check.status}` : ""}`);
}
if (refused) { console.log(`${refused} refused, manifest not changed`); process.exit(1); }
for (const { file, entry, bundle_digest, market_check } of results) {
  const e = entry || m.runs[m.runs.push({ file, title: title || file, meta: meta || "" }) - 1];
  e.bundle_digest = bundle_digest;
  if (market_check) e.market_check = market_check;
}
// Same bytes style as the committed file: ASCII only, no trailing newline.
await writeFile(MANIFEST, JSON.stringify(m, null, 2).replace(/[\u0080-￿]/g, (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0")));
