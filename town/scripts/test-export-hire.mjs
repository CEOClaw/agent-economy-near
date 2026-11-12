// Offline tests for scripts/export-market-hire.mjs (fake market with the read calls only, never the network).
// Run: node scripts/test-export-hire.mjs
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import { readFile, writeFile, mkdtemp } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const { main } = await import("./export-market-hire.mjs");
let failed = 0; const tests = []; const test = (n, f) => tests.push([n, f]);

const JOB = "7a1c9e52-3b4d-4f60-8a21-5d0e6b9c1f34", FX = path.join(root, "scripts/fixtures/gate");
const raw = await readFile(path.join(FX, "outside-hire-pass-delivery.json"), "utf8");
const tmp = await mkdtemp(path.join(os.tmpdir(), "export-hire-"));
let n = 0;
// The shapes market.near.ai really returned on 2026-11-11 (job 8a20efe5), with account ids that must not reach the bundle.
function market({ jobStatus = "completed", asg = "accepted", updated = "2026-11-12T11:00:00Z", content = raw, listed = true, assignments } = {}) {
  const calls = [];
  const reads = {
    getJob: async () => { calls.push("get_job"); return { job_id: JOB, job_kind: "instant", title: "Hire: X", status: jobStatus, created_at: "2026-11-12T09:00:00Z", updated_at: updated, budget_amount: "0.5", token: "USDC", acceptance_window_days: 3, creator_account_id: "ACCOUNT-SECRET" }; },
    getJobStatus: async () => { calls.push("get_job_status"); return { job_id: JOB, status: jobStatus, assignments: assignments || [{ assignment_id: "as-1", status: asg, started_at: "2026-11-12T09:00:01Z", submitted_at: "2026-11-12T09:01:00Z", sla_deadline_at: "2026-11-12T09:30:00Z", worker_agent_id: "WORKER-SECRET" }] }; },
    getJobResult: async () => { calls.push("get_job_result"); return { status: "delivered", content, awaiting_acceptance: false }; },
    listMyJobs: async () => { calls.push("list_my_jobs"); return { jobs: listed ? [{ job_id: JOB, finished_at: "2026-11-12T11:00:20Z", worker: { agent_id: "WORKER-SECRET", handle: "citrus-extract", name: "C" } }] : [], total: 1 }; },
  };
  return { calls, mk: new Proxy(reads, { get: (t, k) => { if (k in t || k === "then") return t[k]; calls.push("WRITE:" + String(k)); throw new Error("write"); } }) };
}
async function run(opts = {}, extra = []) {
  const m = market(opts), lines = [], out = path.join(tmp, `b${n++}.json`);
  const decisions = { decisions: [{ job_id: JOB, n: 0, status: "recorded", delivery_digest: opts.digest || "x", block_height: 7, block_timestamp_ms: Date.parse("2026-11-12T10:00:00Z") }] };
  const code = await main([JOB, path.join(FX, "outside-hire-envelope.json"), path.join(FX, "outside-hire-pass-delivery.json"), "--buyer", "owner-ohwow", "--seller", "owner-citrus", "--out", out, ...extra], { market: m.mk, out: (s) => lines.push(s), now: () => "2026-11-12T12:00:00Z", decisions });
  return { code, lines, calls: m.calls, bundle: code === 0 ? JSON.parse(await readFile(out, "utf8")) : null, text: code === 0 ? await readFile(out, "utf8") : "" };
}

test("accepted hire: bundle shape, accept time from get_job.updated_at, owners as given, reads only", async () => {
  const r = await run();
  assert.equal(r.code, 0); assert.ok(r.calls.every((c) => !c.startsWith("WRITE")));
  const b = r.bundle;
  assert.equal(b.schema, "agentproof-run-bundle-v0"); assert.deepEqual(b.owners, { buyer: "owner-ohwow", seller: "owner-citrus" }); assert.deepEqual(b.requester, { agent: "ohwow" }); assert.equal(b.self_hire, false);
  assert.equal(b.job_ref.hire.state, "accepted"); assert.equal(b.job_ref.hire.accepted_at, "2026-11-12T11:00:00Z"); assert.equal(b.job_ref.hire.accepted_at_source, "get_job.updated_at");
  assert.equal(b.job_ref.executor.handle, "citrus-extract"); assert.equal(b.job_ref.delivery.checker.outcome, "pass"); assert.match(b.job_ref.delivery.checker.evidence_digest, /^[0-9a-f]{64}$/);
  assert.deepEqual(b.job_ref.delivery.output, JSON.parse(raw));
});
test("no account ids reach the file", async () => {
  const r = await run(); assert.doesNotMatch(r.text, /SECRET|account_id|worker_agent_id|"agent_id"/);
});
test("judged_at is the block time of the recorded check for this delivery, null when there is none", async () => {
  const CHK = (await import("node:module")).createRequire(import.meta.url)(path.join(root, "src/checker.js"));
  globalThis.crypto ??= (await import("node:crypto")).webcrypto;
  const digest = await CHK.sha256Hex(CHK.canonicalJson(JSON.parse(raw)));
  assert.equal((await run({ digest })).bundle.job_ref.delivery.checker.judged_at, "2026-11-12T10:00:00.000Z");
  assert.equal((await run()).bundle.job_ref.delivery.checker.judged_at, null);
});
test("not accepted yet: hire.state is the assignment's own status and there is no accept time", async () => {
  const b = (await run({ jobStatus: "in_progress", asg: "submitted" })).bundle;
  assert.equal(b.job_ref.hire.state, "submitted"); assert.equal(b.job_ref.hire.accepted_at, null); assert.equal(b.job_ref.terminal, false);
});
test("refusals: delivery differs from the market, not the buyer's job, two assignments, accept time before the delivery", async () => {
  for (const [o, re] of [[{ content: raw.replace("ops@", "x@") }, /differs from the delivery on the market/], [{ listed: false }, /not in this buyer's list_my_jobs/], [{ assignments: [{}, {}] }, /2 assignments/], [{ updated: "2026-11-12T08:00:00Z" }, /no usable accept time/]]) {
    const r = await run(o); assert.equal(r.code, 1); assert.match(r.lines.join("\n"), re);
  }
});

for (const [name, fn] of tests) { try { await fn(); console.log("ok   " + name); } catch (e) { failed++; console.log("FAIL " + name + "\n" + (e && e.stack || e)); } }
console.log(failed ? `${failed} of ${tests.length} failed` : `all ${tests.length} passed`);
process.exit(failed ? 1 : 0);
