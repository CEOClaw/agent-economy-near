#!/usr/bin/env node
// Re-checks every run in data/manifest.json with src/checker.js (the same code the town runs in the browser).
// Exit code 1 if any stored digest or committed result disagrees with a fresh run.
//   node scripts/verify-runs.mjs            all runs in the manifest
//   node scripts/verify-runs.mjs <file>...  specific run files
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const CHK = createRequire(import.meta.url)(path.join(root, "src/checker.js"));
globalThis.crypto ??= (await import("node:crypto")).webcrypto;
const files = process.argv.slice(2).length ? process.argv.slice(2) : JSON.parse(await readFile(path.join(root, "data/manifest.json"), "utf8")).runs.map((r) => path.join(root, "data", r.file));
let bad = 0;
for (const f of files) {
  const o = JSON.parse(await readFile(f, "utf8")); const name = path.basename(f);
  if (o.job_ref) {
    let env = o.envelope || o.extracted_input?.envelope; if (typeof env === "string") env = JSON.parse(env);
    const out = o.job_ref.delivery?.output, stored = o.job_ref.delivery?.checker?.evidence_digest;
    if (!env || !out) { console.log(`SKIP  ${name}: no envelope or delivery output`); continue; }
    const r = (await CHK.check(env, out)).result; const ok = !stored || r.evidence_digest === stored; bad += !ok;
    console.log(`${ok ? "OK  " : "FAIL"}  ${name}: ${r.outcome}, digest ${r.evidence_digest?.slice(0, 12)}${stored ? (ok ? " = stored" : " != stored " + stored.slice(0, 12)) : ""}`);
  } else if (o.envelope && o.delivery) {
    const r = (await CHK.check(o.envelope, o.delivery)).result; const ok = !o.result || CHK.canonicalJson(r) === CHK.canonicalJson(o.result); bad += !ok;
    console.log(`${ok ? "OK  " : "FAIL"}  ${name}: ${r.outcome}${r.failure_reason ? " (" + r.failure_reason + ")" : ""}${r.blocked_reason ? " (" + r.blocked_reason + ")" : ""}${o.result ? (ok ? ", equals committed result" : ", DIFFERS from committed result") : ""}`);
  } else if (o.governance_record) {
    const g = o.governance_record; console.log(`OK    ${name}: policy record, ${g.decision} ($${g.requested_usdc} vs cap $${g.permitted_max_usdc}); not re-executable here, shown as recorded`);
  } else { console.log(`SKIP  ${name}: unknown shape`); }
}
process.exit(bad ? 1 : 0);
