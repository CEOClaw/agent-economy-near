#!/usr/bin/env node
// Export one market job where ohwow is the BUYER (an outside hire) into a run bundle, from the buyer's side of the market.
// scripts/export-ohwow-market-job.sh is the seller-side export (ohwow's own database); this one reads only the market, read-only,
// with the buyer's MCP token (scripts/market-login.mjs): get_job, get_job_status, get_job_result, list_my_jobs. Nothing is written there.
// Only named fields are copied, so account ids (creator, worker agent ids) never enter the file. Review it before committing.
//   node scripts/export-market-hire.mjs <job_id> <envelope.json> <delivery.json> --buyer owner-ohwow --seller owner-<builder> [--out FILE]
// Refuses when the delivery file is not byte for byte the delivery on the market, or the market shows no single assignment.
// Exit 0 written, 1 refused.
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const CHK = createRequire(import.meta.url)(path.join(root, "src/checker.js"));
globalThis.crypto ??= (await import("node:crypto")).webcrypto;

export async function main(argv, deps = {}) {
  const out = deps.out || ((s) => console.log(s)), now = deps.now || (() => new Date().toISOString());
  const a = [...argv], opt = (n) => { const i = a.indexOf(n); return i < 0 ? undefined : a.splice(i, 2)[1]; };
  const buyer = opt("--buyer"), seller = opt("--seller"), outFile = opt("--out");
  const [jobId, envFile, delFile] = a;
  const refuse = (m) => { out("REFUSED  " + m); return 1; };
  if (!jobId || !envFile || !delFile || !buyer || !seller) return refuse("usage: export-market-hire.mjs <job_id> <envelope.json> <delivery.json> --buyer O --seller O [--out FILE]");
  if (!/^[0-9a-f-]{36}$/.test(jobId)) return refuse(`not a job id: ${jobId}`);
  const mk = deps.market || (await import("./market-mcp.mjs"));

  const [job, st, res, mine] = [await mk.getJob(jobId), await mk.getJobStatus(jobId), await mk.getJobResult(jobId), await mk.listMyJobs()];
  const listed = ((mine && mine.jobs) || []).find((j) => j.job_id === jobId);
  if (!job || job.job_id !== jobId) return refuse("get_job did not return this job");
  if (!listed) return refuse("the job is not in this buyer's list_my_jobs, so the token is not the buyer's");
  const asg = (st && st.assignments) || [];
  if (asg.length !== 1) return refuse(`the market shows ${asg.length} assignments; this export handles exactly one`);
  const as = asg[0];

  // The delivery file must be exactly what the market holds (the raw deliverable, saved before the buyer decided).
  const rawFile = await readFile(delFile, "utf8");
  if (!res || res.status !== "delivered" || typeof res.content !== "string") return refuse(`the market has no readable delivery (${res && res.status})`);
  if (res.content !== rawFile) return refuse("the delivery file differs from the delivery on the market");
  const output = JSON.parse(rawFile), envelope = JSON.parse(await readFile(envFile, "utf8"));

  // Accepted = job completed + its assignment accepted (scripts/gate.mjs --confirm, same rule). get_job.updated_at is the accept time:
  // the market reports no accept time on MCP, and on 8a20efe5 updated_at equals the REST assignment finalizedAt.
  const accepted = job.status === "completed" && as.status === "accepted";
  const acceptedAt = accepted && !(Date.parse(job.updated_at) < Date.parse(as.submitted_at)) ? job.updated_at : null;
  if (accepted && !acceptedAt) return refuse("the job is accepted but get_job gives no usable accept time");

  // The checker re-run here; judged_at is the block time of the check recorded on chain by gate.mjs --execute, when there is one.
  const r = (await CHK.check(envelope, output)).result, digest = await CHK.sha256Hex(CHK.canonicalJson(output));
  const snap = deps.decisions || JSON.parse(await readFile(path.join(root, "data/decisions.json"), "utf8"));
  const rec = snap.decisions.filter((e) => e.job_id === jobId && e.delivery_digest === digest && e.status === "recorded").reduce((x, y) => (!x || y.n >= x.n ? y : x), null);
  const handle = listed.worker && listed.worker.handle;
  if (!handle) return refuse("list_my_jobs names no worker handle");
  if (output.executor_agent_id && output.executor_agent_id !== handle) out(`note: the delivery says executor ${output.executor_agent_id}, the market says ${handle}; the market's handle is used`);

  const bundle = {
    schema: "agentproof-run-bundle-v0",
    envelope,
    job_ref: {
      schema: "agentproof-market-job-ref-v1",
      job: { id: job.job_id, kind: job.job_kind ?? null, title: job.title, source: "MCP get_job (buyer token)", status: job.status, created_at: job.created_at, updated_at: job.updated_at, budget_token: job.token ?? null, budget_amount: job.budget_amount ?? null, acceptance_window_days: job.acceptance_window_days ?? null },
      hire: {
        job_id: jobId, assignment_id: as.assignment_id, state: accepted ? "accepted" : as.status, market_status: as.status, token: job.token ?? null, amount: job.budget_amount ?? null,
        started_at: as.started_at ?? null, submitted_at: as.submitted_at ?? null, sla_deadline_at: as.sla_deadline_at ?? null, accepted_at: acceptedAt, accepted_at_source: acceptedAt ? "get_job.updated_at" : null,
        finished_at: listed.finished_at ?? null, source: "MCP get_job_status + list_my_jobs (buyer token)",
      },
      executor: { handle },
      delivery: {
        output, submitted_at: as.submitted_at ?? null, deliverable_bytes: Buffer.byteLength(rawFile), deliverable_sha256: createHash("sha256").update(rawFile).digest("hex"),
        checker: { outcome: r.outcome, evidence_digest: r.evidence_digest ?? null, checker_ref: CHK.CHECKER_REF, task_type: envelope.task_type, output_schema: envelope.output_schema, judged_at: rec ? new Date(rec.block_timestamp_ms).toISOString() : null },
      },
      phase: accepted ? "accepted" : as.status,
      terminal: accepted,
    },
    owners: { buyer, seller },
    requester: { agent: "ohwow" },
    self_hire: false,
    provenance: { source: "market.near.ai MCP, buyer side: get_job, get_job_status, get_job_result, list_my_jobs", read_at: now(), exported_by: "scripts/export-market-hire.mjs" },
  };
  const file = outFile || path.join(root, "data/runs", `market-${jobId.slice(0, 8)}.json`);
  await writeFile(file, JSON.stringify(bundle, null, 2) + "\n");
  out(`wrote ${path.relative(root, file)}: ${r.outcome}, delivery digest ${digest.slice(0, 12)}, ${accepted ? "accepted at " + acceptedAt : "not accepted (" + as.status + ")"}, check ${rec ? "block " + rec.block_height : "none recorded"}`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then((c) => process.exit(c), (e) => { console.error("ERROR  " + e.message); process.exit(1); });
}
