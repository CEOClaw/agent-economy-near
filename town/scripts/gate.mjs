#!/usr/bin/env node
// Check before you pay. Runs the published checker on a delivery, prints a per-field checklist and a RECOMMENDED action, and can
// record that recommendation on NEAR testnet before the buyer decides. The buyer accepts or sends back BY HAND on market.near.ai.
// No code path here moves money: the market is only ever read (get_job_status, get_job_result, get_job).
//   node scripts/gate.mjs <job-id-prefix | run file | fixture name>        dry run on a local bundle, sends nothing
//   node scripts/gate.mjs <job-id> --envelope E.json [--delivery D.json] --buyer <owner> --seller <owner>
//                                       an outside hire before its bundle exists (no --delivery: read it from the market, needs a market token)
//   --write-snapshot                    upsert the dry-run entry into data/decisions.json
//   --execute [--key FILE]              record_decision on chain (action = the recommendation), read it back, print the checklist. Needs the signer key.
//   --confirm <job-id>                  after the buyer decided by hand: read the market (read-only) and store what the buyer did next to the recorded check
// --execute refuses a job the market already shows as settled, and a delivery on the market that is not the one checked.
// Exit 0 done (a dry run always), 1 refused or failed (--confirm: 1 also when the buyer has not decided yet).
import { readFile, writeFile, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const req = createRequire(import.meta.url);
const CHK = req(path.join(root, "src/checker.js")), PF = req(path.join(root, "src/portfolio.js")), G = req(path.join(root, "src/gate.js"));
globalThis.crypto ??= (await import("node:crypto")).webcrypto;
const json = async (f) => JSON.parse(await readFile(f, "utf8"));
const DEFAULT_KEY = (c) => path.join(process.env.HOME || "", ".near-credentials/testnet", c + ".json");

const marketSettled = (s) => s != null && G.SETTLED_MARKET.includes(String(s).toLowerCase());
// The market's real names (get_job_status read 2026-11-11 on 8a20efe5, 34d0f7a5, 11ff0a91): job status in_progress | completed;
// assignments[].status in_progress | submitted | accepted. An accepted assignment is the one the buyer paid, so it is the state shown.
const stateOf = (st) => {
  const list = st && Array.isArray(st.assignments) ? st.assignments : [], a = list.find((x) => x && x.status === "accepted") || list[list.length - 1];
  return { job_status: st && (st.status ?? st.job_status) || null, assignment_state: (a && a.status) || (st && (st.assignment_state ?? (st.assignment && st.assignment.status))) || null, assignment: a || (st && st.assignment) || null };
};
const CANCELLED = ["cancelled", "canceled", "refunded"];
const sameInput = (rec, input) => Object.keys(input).every((k) => rec[k] === input[k]);

export async function main(argv, deps = {}) {
  const outLines = deps.out || ((s) => console.log(s));
  const out = (s = "") => outLines(s);
  const a = [...argv], flag = (n) => { const i = a.indexOf(n); return i < 0 ? false : a.splice(i, 1).length > 0; };
  const opt = (n) => { const i = a.indexOf(n); return i < 0 ? undefined : a.splice(i, 2)[1]; };
  const EXECUTE = flag("--execute"), WRITE = flag("--write-snapshot");
  const confirmJob = opt("--confirm"), envFile = opt("--envelope"), delFile = opt("--delivery"), buyer = opt("--buyer"), seller = opt("--seller"), keyFile = opt("--key");
  const target = a.find((x) => !x.startsWith("--"));
  const decisionsPath = deps.decisionsPath || path.join(root, "data/decisions.json"), runsDir = deps.runsDir || path.join(root, "data/runs");
  const now = deps.now || (() => new Date().toISOString().replace(/\.\d+Z$/, "Z"));
  const readDecisions = async () => json(decisionsPath).catch(async () => {
    const an = await json(path.join(root, "data/anchors.json"));
    return { network: an.network, contract: an.contract, rpc: an.rpc, explorer: an.explorer, contract_has_decisions: false, snapshot_at: now(), decisions: [] };
  });
  const saveDecisions = async (snap, entry) => {
    const i = snap.decisions.findIndex((e) => e.delivery_digest === entry.delivery_digest && (entry.job_id != null ? e.job_id === entry.job_id : e.job_id == null && e.run === entry.run));
    // A dry run never overwrites a recorded entry.
    if (i >= 0 && snap.decisions[i].status === "recorded" && entry.status !== "recorded") return;
    if (i >= 0) snap.decisions[i] = entry; else snap.decisions.push(entry);
    snap.snapshot_at = now();
    await writeFile(decisionsPath, JSON.stringify(snap, null, 2) + "\n");
  };
  // Read-only: the only market calls this script makes. Tests inject a fake exposing just these two.
  const loadMarket = async () => {
    if (deps.market) return deps.market;
    const m = await import("./market-mcp.mjs");
    return { getJobStatus: (j) => m.getJobStatus(j), getJobResult: (j) => m.getJobResult(j), getJob: (j) => m.getJob(j) };
  };
  const loadNear = async () => deps.near || (await import("./near-tx.mjs"));

  // ---- --confirm: after the buyer decided by hand on market.near.ai, what did they do, next to what the check recommended? ----
  if (confirmJob) {
    const snap = await readDecisions(), e = snap.decisions.filter((x) => x.job_id === confirmJob && x.status === "recorded").reduce((a, b) => (!a || (b.n ?? -1) >= (a.n ?? -1) ? b : a), null);
    if (!e) { out(`REFUSED  no recorded check for ${confirmJob} in data/decisions.json`); return 1; }
    const mk = await loadMarket(), raw = (await mk.getJobStatus(confirmJob)) || {}, st = stateOf(raw);
    const js = String(st.job_status || "").toLowerCase(), as = String(st.assignment_state || "").toLowerCase();
    // Accepted = the job completed AND its assignment accepted (the names the market really uses). The sent-back and cancelled names
    // have not been seen on a job yet (a sent-back job that was redelivered reads in_progress + submitted again, so it is NOT YET).
    const action = js === "completed" && as === "accepted" ? "accepted"
      : CANCELLED.includes(js) || CANCELLED.includes(as) ? "cancelled"
      : /change|revision|redeliver/.test(as) ? "sent_back" : null;
    out(`job ${confirmJob}: recorded check ${e.verdict}, recommends ${e.action}; market now shows job ${st.job_status}, assignment ${st.assignment_state}`);
    if (!action) { out("NOT YET  the buyer has not decided on the market"); return 1; }
    // get_job_status carries no accept time. get_job's updated_at is when the job turned completed, i.e. the accept (equal to the REST
    // assignment finalizedAt on 8a20efe5). Anything that changes the job later (a review?) could move it, so run --confirm right after the accept.
    let at = raw.accepted_at ?? (st.assignment && st.assignment.accepted_at) ?? null, atFrom = at != null ? "get_job_status" : null;
    if (action === "accepted" && at == null && mk.getJob) {
      const job = (await mk.getJob(confirmJob)) || {}, sub = Date.parse(st.assignment && st.assignment.submitted_at);
      if (job.status === "completed" && Number.isFinite(Date.parse(job.updated_at)) && !(Date.parse(job.updated_at) < sub)) { at = job.updated_at; atFrom = "get_job.updated_at"; }
    }
    if (action === "accepted") out(at == null ? "note: the market did not report an accept time" : `accepted at     ${at} (${atFrom})`);
    e.buyer = { action, followed: (action === "accepted") === (e.verdict === "pass"), market_accepted_at: at, market_accepted_at_source: atFrom, read_at: now(), job_status: st.job_status, assignment_state: st.assignment_state };
    if (action === "accepted") e.note = `recorded on chain; the buyer accepted on market.near.ai${at ? " at " + at : ""}`;
    else e.note = `recorded on chain; the buyer ${action === "sent_back" ? "sent it back" : "cancelled"} on market.near.ai`;
    await saveDecisions(snap, e);
    out(e.buyer.followed ? "FOLLOWED" : `OVERRODE  ${action === "accepted" ? "accepted although the check failed" : "sent back although it passed"}`);
    return 0;
  }
  if (!target) { out("usage: node scripts/gate.mjs <job-id prefix | run file | fixture name> [--envelope E --delivery D --buyer O --seller O] [--write-snapshot | --execute | --confirm <job-id>]"); return 1; }

  // ---- load what to check ----
  let run, runRel = null, label;
  if (envFile) {
    const mk = deps.market || (process.env.MARKET_MCP_TOKEN ? await loadMarket() : null);
    let delivery;
    if (delFile) delivery = await json(delFile);
    else if (mk) delivery = await fetchDelivery(mk, target);
    else { out("REFUSED  no --delivery given and MARKET_MCP_TOKEN is not set, so the delivery cannot be read from the market"); return 1; }
    run = { envelope: await json(envFile), delivery, job_id: target, owners: { buyer, seller } };
    label = `outside hire ${target}`;
  } else {
    let file = null;
    for (const c of [target, path.join(runsDir, target), path.join(runsDir, target + ".json")]) if (await readFile(c).then(() => true, () => false) && !(await readdir(c).then(() => true, () => false))) { file = c; break; }
    if (!file) {
      const hits = (await readdir(runsDir)).filter((f) => f.endsWith(".json")).filter((f) => f.startsWith("market-" + target) || f.startsWith(target));
      if (hits.length !== 1) { out(`REFUSED  "${target}" matches ${hits.length} run files in data/runs`); return 1; }
      file = path.join(runsDir, hits[0]);
    }
    run = await json(file); runRel = "runs/" + path.basename(file); label = runRel;
  }

  // ---- the decision ----
  const d = await G.decisionFor(run, CHK, PF);
  const snap = await readDecisions();
  const hire = run.job_ref && run.job_ref.hire, bundleSettled = !!run.job_ref && (marketSettled(hire && hire.state) || marketSettled(hire && hire.market_status) || marketSettled(run.job_ref.job && run.job_ref.job.status));
  let rc = null;
  if (run.job_ref) {
    const manifest = await json(path.join(root, "data/manifest.json")).catch(() => ({ runs: [] })), m = manifest.runs.find((r) => r.file === runRel);
    rc = await PF.checkReceipt(run, CHK, m ? "manifest" : label, m && m.bundle_digest);
  }
  const cs = rc ? G.checkStatus(rc, snap.decisions) : null;
  const verdictText = d.verdict ? d.verdict.toUpperCase() + (d.failure_reason ? ` (${d.failure_reason})` : "") : "none";
  out(EXECUTE ? "CHECK RUN: records the check on NEAR testnet, never touches the money" : "DRY RUN: nothing is sent, signed or changed");
  out(`job              ${d.job_id || "none (not a market job)"}   [${label}]`);
  out(`delivery digest  ${d.delivery_digest}`);
  out(`checker version  ${d.checker_version}`);
  out("checklist");
  for (const r of d.checklist || []) out(r.ok === true ? `  ok    ${r.item}` : r.ok === false ? `  FAIL  ${r.item}${r.note ? ": " + r.note : ""}` : `  --    ${r.item} (not checked)`);
  out(`verdict          ${verdictText}`);
  out(`recommend        ${d.action || "nothing"} (the buyer decides on market.near.ai)`);
  out(`record_decision  ${d.input ? JSON.stringify(d.input) : "cannot be sent: " + d.errors.join("; ")}`);
  out(`market shows     ${hire ? `job ${run.job_ref.job && run.job_ref.job.status}, hire ${hire.state}${hire.accepted_at ? ", accepted at " + hire.accepted_at : ""}` : run.job_ref ? "no hire in the bundle" : envFile ? "not read (dry run is offline)" : "nothing: this is not a market job"}`);
  let checked;
  if (!run.job_ref) checked = envFile ? (d.verdict === "pass" ? "Yes, if --execute records the pass on chain before the buyer accepts." : "No: a " + d.verdict + " verdict is not a pass, so it can never count.") : "No: not a market job, it can never be checked before paid.";
  else if (cs.counted) checked = "Yes: " + cs.reason;
  // A dry run reads no chain, so a recorded check is never live-verified here; say what the snapshot holds and where the live read is.
  else if (cs.decision && cs.decision.live_verified !== true && G.checkStatus(rc, snap.decisions.map((x) => (x === cs.decision ? { ...x, live_verified: true } : x))).counted) checked = "Yes in data/decisions.json, not read live here (this run reads no chain): node scripts/verify-decisions.mjs reads it on NEAR.";
  else if (bundleSettled && !cs.decision) checked = `No: ${hire.state} on the market at ${hire.accepted_at}, before any check.`;
  else if (bundleSettled) checked = "No: " + cs.reason;
  else checked = d.verdict === "pass" ? "Yes, if --execute records the pass on chain before the buyer accepts." : "No: a " + d.verdict + " verdict is not a pass, so it can never count.";
  out(`checked before paid  ${checked}`);

  // ---- snapshot entry ----
  const entry = {
    run: runRel, job_id: d.job_id, n: 0, delivery_digest: d.delivery_digest, checker_version: d.checker_version, verdict: d.verdict, action: d.action,
    buyer_owner: d.buyer_owner, seller_owner: d.seller_owner, status: "dry-run", tx: null, block_height: null, block_timestamp_ms: null, checklist: d.checklist, buyer: null,
    note: !run.job_ref && !envFile ? "test fixture, not a market job, never recorded"
      : bundleSettled && cs && !cs.decision ? `paid on the market ${String(hire.accepted_at || "").slice(0, 10)}, before any check`
      : `dry run, not sent: the check recommends ${d.action}`,
  };
  if (WRITE && !EXECUTE) { await saveDecisions(snap, entry); out(`wrote the dry-run entry to ${path.relative(root, decisionsPath)}`); }
  if (!EXECUTE) return 0;

  // ---- --execute: refusals first, then the chain. The market is only read. ----
  const refuse = (m) => { out("REFUSED  " + m); return 1; };
  if (!d.ok) return refuse(d.errors.join("; "));
  if (bundleSettled) return refuse(`the bundle shows the market already ${hire.state} this job, so the money has moved; a check now would not be before paid`);
  const near = await loadNear(), mk = await loadMarket(), contract = snap.contract, rpc = snap.rpc;
  const st0 = await mk.getJobStatus(d.job_id);
  if (marketSettled(stateOf(st0).job_status)) return refuse(`the market shows job ${stateOf(st0).job_status}: it is settled`);
  const onMarket = await mk.getJobResult(d.job_id);
  if (!onMarket || onMarket.status !== "delivered") return refuse(`the market has no readable delivery for this job (${onMarket && onMarket.status})`);
  if (onMarket.awaiting_acceptance === false) return refuse("the market says nothing is awaiting a decision on this job");
  let marketDelivery; try { marketDelivery = JSON.parse(onMarket.content ?? onMarket.content_chunk); } catch { return refuse("the delivery on the market is not JSON, so it cannot be the one checked"); }
  if ((await CHK.sha256Hex(CHK.canonicalJson(marketDelivery))) !== d.delivery_digest) return refuse("the delivery on the market differs from the one that was checked; run the check again on the market's copy");

  const history = await near.viewMethod({ rpc, contract, method: "get_decisions", args: { job_id: d.job_id } });
  const last = history[history.length - 1];
  let record = history.find((x) => x.delivery_digest === d.delivery_digest && sameInput(x, d.input));
  if (history.some((x) => x.delivery_digest === d.delivery_digest) && !record) return refuse("a different decision for this delivery is already on chain");
  if (last && !record && (last.action === "accept" || last.action === "cancel")) return refuse(`the job is already settled on chain (${last.action})`);
  let tx = record ? null : undefined;
  if (record) out(`resuming: this exact decision is already on chain (n=${record.n}); going straight to the read-back`);
  else {
    try {
      const key = near.loadKey(keyFile || DEFAULT_KEY(contract), contract);
      const r = await near.callMethod({ rpc, key, contract, method: "record_decision", args: d.input });
      tx = r.tx;
      const after = await near.viewMethod({ rpc, contract, method: "get_decisions", args: { job_id: d.job_id } });
      record = after.find((x) => x.delivery_digest === d.delivery_digest && sameInput(x, d.input));
      if (!record) throw new Error("the read-back does not hold the decision just sent");
    } catch (e) { return refuse(`the decision was NOT confirmed on chain, so nothing was recorded (${e.message}); look at get_decisions before trying again`); }
    out(`on chain: tx ${tx}, block ${record.block_height}`);
  }
  const done = { ...entry, n: record.n, status: "recorded", tx, block_height: record.block_height, block_timestamp_ms: record.block_timestamp_ms, note: "recorded on chain; waiting for the buyer to decide on market.near.ai" };
  await saveDecisions(snap, done);
  out(`wrote the entry to ${path.relative(root, decisionsPath)}: ${done.note}`);
  out(`recommend        ${d.action} (the buyer decides on market.near.ai)`);
  out(`Next: the buyer accepts or sends back on market.near.ai, then run: node scripts/gate.mjs --confirm ${d.job_id}`);
  return 0;
}

// Reads the delivery a seller submitted, for a hire whose bundle does not exist yet.
async function fetchDelivery(mk, jobId) {
  const r = await mk.getJobResult(jobId);
  if (!r || r.status !== "delivered") throw new Error(`the market has no readable delivery for ${jobId} (${r && r.status})`);
  return JSON.parse(r.content ?? r.content_chunk);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then((c) => process.exit(c), (e) => { console.error("ERROR  " + e.message); process.exit(1); });
}
