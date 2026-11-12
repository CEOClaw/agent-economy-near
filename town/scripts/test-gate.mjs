// Offline tests for src/gate.js, the check-before-paid reputation rule in src/portfolio.js, and scripts/gate.mjs (fakes only: no chain, no market).
// Run: node scripts/test-gate.mjs
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import { readFile, writeFile, mkdtemp } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const req = createRequire(import.meta.url);
const CHK = req(path.join(root, "src/checker.js")), PF = req(path.join(root, "src/portfolio.js")), G = req(path.join(root, "src/gate.js"));
globalThis.crypto ??= (await import("node:crypto")).webcrypto;
const { main } = await import("./gate.mjs");
const json = async (f) => JSON.parse(await readFile(path.join(root, f), "utf8"));
let failed = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

const JOB = "7a1c9e52-3b4d-4f60-8a21-5d0e6b9c1f34", FX = "scripts/fixtures/gate/";
const env = await json(FX + "outside-hire-envelope.json"), pass = await json(FX + "outside-hire-pass-delivery.json"), bad = await json(FX + "outside-hire-fail-delivery.json");
const outside = (delivery, owners = { buyer: "owner-ohwow", seller: "owner-citrus" }) => ({ envelope: env, delivery, job_id: JOB, owners });
const run2d = await json("data/runs/market-2d17e4c8.json");

test("decisionFor: pass -> accept, with the exact record_decision args", async () => {
  const d = await G.decisionFor(outside(pass), CHK, PF);
  assert.equal(d.ok, true); assert.equal(d.verdict, "pass"); assert.equal(d.action, "accept");
  assert.deepEqual(d.input, { job_id: JOB, delivery_digest: await CHK.sha256Hex(CHK.canonicalJson(pass)), checker_version: "structured-field-extraction-v1:1.0.0", verdict: "pass", action: "accept", buyer_owner: "ownerohwow", seller_owner: "ownercitrus" });
});
test("decisionFor: the cleaned 01.50 -> 1.50 delivery fails on MAX_TASK_SPEND_USDC -> request_changes", async () => {
  const d = await G.decisionFor(outside(bad), CHK, PF);
  assert.equal(d.verdict, "fail"); assert.equal(d.action, "request_changes");
  assert.match(d.failure_reason, /MAX_TASK_SPEND_USDC/); assert.match(d.failure_reason, /01\.50/);
  assert.notEqual(d.delivery_digest, (await G.decisionFor(outside(pass), CHK, PF)).delivery_digest);
});
test("decisionFor: blocked -> none (checker-blocked-budget)", async () => {
  const f = await json("data/runs/checker-blocked-budget.json");
  const d = await G.decisionFor({ ...f, job_id: JOB, owners: { buyer: "a", seller: "b" } }, CHK, PF);
  assert.equal(d.verdict, "blocked"); assert.equal(d.action, "none"); assert.equal(d.ok, true);
});
test("decisionFor: the market bundle 2d17e4c8 reads its delivery from job_ref and owners through ownerKey", async () => {
  const d = await G.decisionFor(run2d, CHK, PF);
  assert.equal(d.input.job_id, "2d17e4c8-0984-4a63-acac-91460f65cb8a");
  assert.equal(d.input.delivery_digest, await CHK.sha256Hex(CHK.canonicalJson(run2d.job_ref.delivery.output)));
  assert.equal(d.input.buyer_owner, "ownerceoclaw"); assert.equal(d.input.seller_owner, "ownerohwow");
});
test("decisionFor: a fixture with no job id or owners is never sendable, but still gives its verdict", async () => {
  const d = await G.decisionFor(await json("data/runs/fixture-wrong-delivery.json"), CHK, PF);
  assert.equal(d.input, null); assert.equal(d.ok, false); assert.equal(d.verdict, "fail"); assert.equal(d.job_id, null);
  assert.ok(d.errors.some((e) => /no job id/.test(e)) && d.errors.some((e) => /buyer owner/.test(e)));
});
test("decisionFor: owners the contract would refuse (non-ASCII, too long), and job ids that are not hex", async () => {
  assert.equal((await G.decisionFor(outside(pass, { buyer: "owner-ohwow", seller: "Équipe" }), CHK, PF)).input, null);
  assert.equal((await G.decisionFor(outside(pass, { buyer: "x".repeat(65), seller: "b" }), CHK, PF)).input, null);
  assert.equal((await G.decisionFor({ ...outside(pass), job_id: "Not-Hex" }, CHK, PF)).input, null);
  assert.equal((await G.decisionFor({ envelope: env }, CHK, PF)).ok, false);
});
test("PAIRS: the default action of every verdict is allowed by the contract's pairing", () => {
  for (const v of ["pass", "fail", "blocked"]) assert.ok(G.PAIRS[v].includes(G.ACTION[v]));
  assert.deepEqual(G.PAIRS.pass, ["accept"]);
});

test("decisionFor: carries the checklist and recommended, input unchanged", async () => {
  const d = await G.decisionFor(outside(pass), CHK, PF);
  assert.equal(d.recommended, "accept"); assert.ok(Array.isArray(d.checklist));
  assert.deepEqual(Object.keys(d.input), ["job_id", "delivery_digest", "checker_version", "verdict", "action", "buyer_owner", "seller_owner"]);
});
test("checklist: pass -> every required field ok in order, then no extra fields ok", async () => {
  const c = G.checklist(env, await CHK.check(env, pass));
  assert.deepEqual(c.map((r) => r.item), [...env.required_fields, "no extra fields"]);
  assert.ok(c.every((r) => r.ok === true && r.note === null));
});
test("checklist: a field fails -> earlier ok, the failing row carries the reason, later rows and extra fields are null", async () => {
  const o = await CHK.check(env, bad), c = G.checklist(env, o), i = c.findIndex((r) => r.ok === false);
  assert.ok(i > 0); assert.equal(c[i].item, "MAX_TASK_SPEND_USDC"); assert.equal(c[i].note, o.result.failure_reason);
  assert.ok(c.slice(0, i).every((r) => r.ok === true)); assert.ok(c.slice(i + 1).every((r) => r.ok === null && r.note === null));
  assert.equal(c.at(-1).item, "no extra fields");
});
test("checklist: an extra field -> all fields ok, no extra fields false with the step 6 reason", async () => {
  const o = await CHK.check(env, { ...pass, extracted: { ...pass.extracted, SURPRISE: "x" } }), c = G.checklist(env, o);
  assert.equal(o.result.outcome, "fail");
  assert.ok(c.slice(0, -1).every((r) => r.ok === true));
  assert.deepEqual(c.at(-1), { item: "no extra fields", ok: false, note: o.result.failure_reason }); assert.match(c.at(-1).note, /SURPRISE/);
});
test("checklist: wrong schema -> first row delivery shape false with the reason, every field row null", async () => {
  const o = await CHK.check(env, { ...pass, schema: "nope" }), c = G.checklist(env, o);
  assert.deepEqual(c[0], { item: "delivery shape", ok: false, note: "schema field missing or wrong value" });
  assert.equal(c.length, env.required_fields.length + 2); assert.ok(c.slice(1).every((r) => r.ok === null));
  const t = G.checklist(env, await CHK.check(env, { ...pass, task_id: "other" })); assert.equal(t[0].ok, false); assert.match(t[0].note, /task_id mismatch/);
  const x = G.checklist(env, await CHK.check(env, { ...pass, extracted: undefined })); assert.equal(x[0].ok, false);
});
test("checklist: blocked -> delivery shape row is null (not checked) with the blocked reason, all else null", async () => {
  const f = await json("data/runs/checker-blocked-budget.json"), e = f.envelope || f.extracted_input.envelope, dl = f.delivery;
  const o = await CHK.check(typeof e === "string" ? JSON.parse(e) : e, dl), c = G.checklist(typeof e === "string" ? JSON.parse(e) : e, o);
  assert.equal(o.result.outcome, "blocked"); assert.equal(c[0].item, "delivery shape"); assert.equal(c[0].ok, null); assert.equal(c[0].note, o.result.blocked_reason);
  assert.ok(c.slice(1).every((r) => r.ok === null));
});

// ---- checkStatus ----
const hex = "a".repeat(64);
const rc0 = { id: JOB, delivery_digest: hex, outcome: "pass", checker_version: "v", accepted_at: "2026-11-13T10:00:00.000+00:00", market_accepted: true, buyer_owner: "ownerohwow", seller_owner: "ownercitrus" };
const dec = (o = {}) => ({ job_id: JOB, n: 0, delivery_digest: hex, checker_version: "v", verdict: "pass", action: "accept", buyer_owner: "ownerohwow", seller_owner: "ownercitrus", live_verified: true, block_height: 5, block_timestamp_ms: Date.parse("2026-11-13T09:00:00Z"), ...o });
test("checkStatus: a chain record before the accept time, same digest, verdict, version, owners -> checked_before_paid, counted", () => {
  const g = G.checkStatus(rc0, [dec()]);
  assert.equal(g.counted, true); assert.equal(g.state, "checked_before_paid"); assert.ok(g.decision); assert.equal(g.reason, "The check passed and was recorded on chain before the buyer paid.");
});
test("checkStatus: every state and refusal, with its reason in plain English", () => {
  const sentBack = (action) => dec({ buyer: { action, followed: false } });
  const failDec = dec({ verdict: "fail", action: "request_changes" }), rcFail = { ...rc0, outcome: "fail" };
  const cases = [
    [rc0, [], "paid_before_check", /^Paid on the market before any check\.$/],
    [{ ...rc0, market_accepted: false }, [], "no_check", /No check/],
    [rc0, [dec({ job_id: "other" })], "paid_before_check", /before any check/],
    [rc0, [dec({ delivery_digest: "b".repeat(64) })], "not_counted", /different delivery/],
    [rc0, [dec({ status: "dry-run", tx: null, block_timestamp_ms: null })], "paid_before_check", /before any check/],
    [rc0, [dec({ status: "recorded", tx: null, block_timestamp_ms: null })], "not_counted", /no chain block time/],
    [rc0, [dec({ block_timestamp_ms: null })], "not_counted", /no chain block time/],
    [rc0, [dec({ status: "recorded", tx: "T", live_verified: undefined })], "not_counted", /not verified on chain/],
    [rc0, [dec({ checker_version: "other" })], "not_counted", /checker "other"/],
    [{ ...rc0, checker_version: null }, [dec()], "not_counted", /checker "v"/],
    [rc0, [dec({ verdict: "fail" })], "not_counted", /re-run here says "pass"/],
    [rcFail, [dec()], "not_counted", /re-run here says "fail"/],
    [rcFail, [failDec], "accepted_although_failed", /buyer accepted although the check failed/],
    [{ ...rcFail, market_accepted: false }, [failDec], "waiting", /recommends: request_changes/],
    [{ ...rc0, market_accepted: false }, [dec()], "waiting", /recommends: accept/],
    [{ ...rc0, accepted_at: null }, [dec()], "not_counted", /accept time is not recorded/],
    [rc0, [dec({ block_timestamp_ms: Date.parse("2026-11-13T10:00:00Z") })], "checked_after_paid", /after the buyer paid/],
    [rc0, [dec({ block_timestamp_ms: Date.parse("2026-11-14T10:00:00Z") })], "checked_after_paid", /after the buyer paid/],
    [rc0, [dec({ buyer_owner: "someoneelse" })], "not_counted", /owners on the check/],
    [rc0, [dec({ seller_owner: "someoneelse" })], "not_counted", /owners on the check/],
    [{ ...rc0, id: null }, [dec()], "not_counted", /no job id/],
    [{ ...rc0, delivery_digest: null }, [dec()], "not_counted", /different delivery/],
    [rc0, [sentBack("sent_back")], "sent_back_although_passed", /sent it back although it passed/],
    [{ ...rc0, market_accepted: false }, [sentBack("cancelled")], "sent_back_although_passed", /cancelled although it passed/],
  ];
  for (const [rc, ds, state, re] of cases) { const g = G.checkStatus(rc, ds); assert.equal(g.state, state, re.source); assert.equal(g.counted, false, re.source); assert.match(g.reason, re, re.source); }
  assert.equal(G.checkStatus(rc0, [dec({ buyer: { action: "accepted", followed: true } })]).state, "checked_before_paid");
});
test("checkStatus: no accepted_at, no recorded decision and not paid -> no_check; counted is true only for checked_before_paid", () => {
  assert.equal(G.checkStatus({ ...rc0, market_accepted: false }, null).state, "no_check");
  assert.equal(G.checkStatus(rc0, [dec()]).counted, true);
});
test("checkStatus: a recorded snapshot entry (status recorded + tx) with a live read counts; a dry run is not looked at", () => {
  assert.equal(G.checkStatus(rc0, [dec({ status: "recorded", tx: "T" })]).counted, true);
  assert.equal(G.checkStatus(rc0, [dec({ status: "dry-run", tx: null, block_timestamp_ms: null }), dec()]).counted, true);
});
test("checkStatus: several decisions for one delivery -> the latest (highest n) stands", () => {
  const first = dec({ n: 0 }), later = dec({ n: 1, verdict: "fail", action: "request_changes" });
  assert.equal(G.checkStatus(rc0, [first, later]).counted, false); assert.match(G.checkStatus(rc0, [first, later]).reason, /re-run here says "pass"/);
  assert.equal(G.checkStatus(rc0, [later, first]).decision.n, 1);
  assert.equal(G.checkStatus(rc0, [dec({ n: 0, verdict: "fail", action: "request_changes" }), dec({ n: 1 })]).counted, true);
});
test("checkStatus: a recorded snapshot entry with a tx but no live read is not counted; resumed (tx null) with a live read is", () => {
  const snapRec = dec({ status: "recorded", tx: "T", live_verified: undefined });
  assert.equal(G.checkStatus(rc0, [snapRec]).counted, false);
  assert.equal(G.checkStatus(rc0, [{ ...snapRec, tx: null, live_verified: true }]).counted, true);
});

// ---- the live read (browser path, src/gate-view.js, and the Node helper): only an equal chain record verifies ----
const DEC = req(path.join(root, "src/decisions.js")), GV = req(path.join(root, "src/gate-view.js"));
globalThis.AgentProofGate = G; globalThis.AgentProofDecisions = DEC;
const b64json = (v) => Array.from(Buffer.from(JSON.stringify(v)));
const chainFetch = (records) => async () => ({ ok: true, json: async () => ({ result: { result: b64json(records) } }) });
const SNAP = { network: "testnet", contract: "x.testnet", rpc: ["https://rpc.invalid"], explorer: "https://e", contract_has_decisions: true };
const chainRec = { job_id: JOB, n: 0, delivery_digest: hex, checker_version: "v", verdict: "pass", action: "accept", buyer_owner: "ownerohwow", seller_owner: "ownercitrus", block_height: 5, block_timestamp_ms: Date.parse("2026-11-13T09:00:00Z") };
const snapEntry = { ...chainRec, status: "recorded", tx: "TX" };
async function liveGate(fetchFn, entry = snapEntry) {
  const url = "https://x/" + Math.random() + "/data/";
  globalThis.AgentProofDecisions = DEC; globalThis.AgentProofGate = G;
  const ctx = await GV.load(url, async (u) => (/decisions\.json/.test(u) ? { ok: true, json: async () => ({ ...SNAP, decisions: [entry] }) } : /anchors/.test(u) ? { ok: false } : fetchFn(u)));
  await ctx.readLive([JOB]);
  const rc = { ...rc0 }; G.attach([rc], ctx.decisions);
  return { rc, ctx };
}
test("live read: recorded + before the accept + NO live read (flag false) -> not counted, and the card does not say 'after the check was on chain'", async () => {
  const url = "https://x/" + Math.random() + "/data/";
  const ctx = await GV.load(url, async (u) => (/decisions\.json/.test(u) ? { ok: true, json: async () => ({ ...SNAP, contract_has_decisions: false, decisions: [snapEntry] }) } : { ok: false }));
  await ctx.readLive([JOB]);
  const rc = { ...rc0 }; G.attach([rc], ctx.decisions);
  assert.equal(rc.check.counted, false); assert.match(rc.check.reason, /not verified on chain/);
  const row = GV.describe(rc, ctx); assert.equal(row.counted, false); assert.doesNotMatch(row.buyer, /after the check was on chain/); assert.match(row.buyer, /not verified on chain/);
});
test("live read: a bad response -> not counted", async () => {
  const { rc, ctx } = await liveGate(async () => ({ ok: false }));
  assert.equal(rc.check.counted, false); assert.doesNotMatch(GV.describe(rc, ctx).buyer, /after the check was on chain/);
});
test("live read: an equal chain record -> counted, buyer line says after the check was on chain", async () => {
  const { rc, ctx } = await liveGate(chainFetch([chainRec]));
  assert.equal(rc.check.counted, true); assert.match(GV.describe(rc, ctx).buyer, /after the check was on chain/);
});
test("live read: a chain record differing in any field the gate uses -> not counted", async () => {
  for (const [k, v] of [["verdict", "fail"], ["checker_version", "w"], ["buyer_owner", "zz"], ["seller_owner", "zz"], ["block_timestamp_ms", chainRec.block_timestamp_ms + 1]]) {
    const { rc } = await liveGate(chainFetch([{ ...chainRec, [k]: v }]));
    assert.equal(rc.check.counted, false, k);
  }
});
test("live read: the live entry carries buyer and checklist from the matching snapshot entry, so the override shows live", async () => {
  const buyer = { action: "sent_back", followed: false, market_accepted_at: null, read_at: "2026-11-13T11:00:00Z", job_status: "open", assignment_state: "in_progress" };
  const checklist = [{ item: "A", ok: true, note: null }];
  const { rc, ctx } = await liveGate(chainFetch([chainRec]), { ...snapEntry, buyer, checklist });
  assert.equal(rc.check.state, "sent_back_although_passed"); assert.equal(rc.check.counted, false);
  const live = ctx.decisions.find((d) => d.via === "live"); assert.deepEqual(live.buyer, buyer); assert.deepEqual(live.checklist, checklist);
  assert.equal(GV.describe(rc, ctx).counted, false); assert.equal(GV.describe(rc, ctx).buyer, "sent back although it passed (read from market.near.ai on Nov 13)");
});
test("describe: a live pass the buyer sent back says where it was read, and is not on the chain", async () => {
  const buyer = { action: "sent_back", followed: false, market_accepted_at: null, read_at: "2026-11-12T11:00:00Z", job_status: "open", assignment_state: "changes_requested" };
  const { rc, ctx } = await liveGate(chainFetch([chainRec]), { ...snapEntry, buyer });
  assert.equal(GV.describe(rc, ctx).buyer, "sent back although it passed (read from market.near.ai on Nov 12)");
});
test("describe: a live fail record against a pass re-run does not say the check is not verified", async () => {
  const fail = { ...chainRec, verdict: "fail", action: "request_changes" };
  const { rc, ctx } = await liveGate(chainFetch([fail]), { ...snapEntry, verdict: "fail", action: "request_changes" });
  const row = GV.describe(rc, ctx);
  assert.equal(row.counted, false); assert.doesNotMatch(row.buyer, /not verified/); assert.equal(row.buyer, "accepted on Nov 13"); assert.match(row.why, /The chain says the verdict was "fail"/);
});
test("describe: a followed fail shows the buyer action, not 'has not decided yet'", async () => {
  const fail = { ...chainRec, verdict: "fail", action: "request_changes" };
  const buyer = { action: "sent_back", followed: true, market_accepted_at: null, read_at: "2026-11-12T11:00:00Z", job_status: "open", assignment_state: "changes_requested" };
  const { rc, ctx } = await liveGate(chainFetch([fail]), { ...snapEntry, verdict: "fail", action: "request_changes", buyer });
  rc0.outcome = "fail"; const r2 = { ...rc0, market_accepted: false }; rc0.outcome = "pass"; G.attach([r2], ctx.decisions);
  const row = GV.describe(r2, ctx);
  assert.doesNotMatch(row.buyer, /has not decided yet/); assert.equal(row.buyer, "sent back, as the check recommended (read from market.near.ai on Nov 12)");
});
test("DEC.verifyEntries: only an equal record verifies; a dry run is never read", async () => {
  assert.equal((await DEC.verifyEntries(SNAP, [snapEntry], chainFetch([chainRec])))[0].live_verified, true);
  assert.equal((await DEC.verifyEntries(SNAP, [snapEntry], chainFetch([{ ...chainRec, n: 0, verdict: "fail" }])))[0].live_verified, undefined);
  assert.equal((await DEC.verifyEntries(SNAP, [snapEntry], async () => ({ ok: false })))[0].live_verified, undefined);
  assert.equal((await DEC.verifyEntries(SNAP, [{ ...snapEntry, status: "dry-run" }], async () => { throw new Error("no read"); }))[0].live_verified, undefined);
});

// ---- portfolio: reputation = proven AND checked before paid ----
async function receipt(run, file) {
  const m = await json("data/manifest.json"), e = m.runs.find((r) => r.file === file);
  return PF.checkReceipt(run, CHK, "manifest", e.bundle_digest);
}
test("2d17e4c8 is proven but NOT counted: state paid_before_check, checked_before_paid 0, proven_receipts 1", async () => {
  const rc = await receipt(run2d, "runs/market-2d17e4c8.json");
  assert.equal(rc.market_accepted, true); assert.equal(PF.proven(rc), true);
  G.attach([rc], (await json("data/decisions.json")).decisions);
  assert.equal(rc.check.state, "paid_before_check"); assert.equal(rc.check.reason, "Paid on the market before any check."); assert.equal(rc.gate, undefined);
  assert.equal(PF.counts(rc), false);
  const p = PF.buildPortfolio("ohwow-agent", null, [rc]).proof;
  assert.equal(p.checked_before_paid, 0); assert.equal(p.proven_receipts, 1); assert.equal(p.distinct_owners, 0); assert.equal(p.earned_usdc, null);
  assert.deepEqual(p.overrides, []); assert.equal("gated_jobs" in p, false); assert.equal("verified_jobs" in p, false);
});
test("8a20efe5 (outside hire, web-page-extractor): its recorded check counts once the chain read equals it, never from the snapshot alone", async () => {
  const run = await json("data/runs/market-8a20efe5.json"), rc = await receipt(run, "runs/market-8a20efe5.json"), snap = (await json("data/decisions.json")).decisions;
  assert.equal(rc.trusted, true); assert.equal(PF.proven(rc), true); assert.equal(rc.seller_handle, "web-page-extractor"); assert.equal(rc.accepted_at, "2026-11-11T23:32:41.618120Z");
  const e = snap.find((x) => x.job_id === rc.id && x.status === "recorded");
  assert.equal(e.delivery_digest, rc.delivery_digest); assert.equal(e.buyer_owner, rc.buyer_owner); assert.equal(e.seller_owner, rc.seller_owner);
  assert.ok(e.block_timestamp_ms < Date.parse(rc.accepted_at)); assert.equal(e.buyer.action, "accepted"); assert.equal(e.buyer.followed, true); assert.equal(e.buyer.market_accepted_at, rc.accepted_at);
  assert.equal(G.checkStatus(rc, snap).state, "not_counted"); // snapshot only: not verified on chain
  G.attach([rc], snap.map((x) => (x === e ? { ...x, live_verified: true } : x)));
  assert.equal(rc.check.state, "checked_before_paid"); assert.equal(PF.counts(rc), true);
  const p = PF.buildPortfolio("web-page-extractor", null, [rc]).proof;
  assert.equal(p.checked_before_paid, 1); assert.equal(p.distinct_owners, 1); assert.equal(p.last_verified_at, "2026-11-11T23:32:41.618120Z");
});
test("8a20efe5 bundle carries no account ids", async () => {
  const text = await readFile(path.join(root, "data/runs/market-8a20efe5.json"), "utf8");
  assert.doesNotMatch(text, /account_id|accountId|worker_agent_id|"agent_id"|"agentId"|creator/);
});
test("dry run of 8a20efe5: settled, and says the snapshot holds a counting check that this run does not read live", async () => {
  const r = rig(); const code = await main(["8a20efe5"], { ...r.deps, decisionsPath: path.join(root, "data/decisions.json") }), text = r.lines.join("\n");
  assert.equal(code, 0); assert.deepEqual(r.calls, []);
  assert.match(text, /^market shows +job completed, hire accepted, accepted at 2026-11-11T23:32:41\.618120Z$/m);
  assert.match(text, /^checked before paid  Yes in data\/decisions\.json, not read live here/m);
});
test("a checked-before-paid proven receipt counts: owners and last_verified follow the counted set", async () => {
  const rc = await receipt(run2d, "runs/market-2d17e4c8.json");
  G.attach([rc], [dec({ job_id: rc.id, delivery_digest: rc.delivery_digest, buyer_owner: rc.buyer_owner, seller_owner: rc.seller_owner, checker_version: rc.checker_version, block_timestamp_ms: Date.parse(rc.accepted_at) - 1000 })]); // dec() is live_verified
  assert.equal(PF.counts(rc), true);
  const p = PF.buildPortfolio("ohwow-agent", null, [rc]).proof;
  assert.equal(p.checked_before_paid, 1); assert.equal(p.proven_receipts, 1); assert.equal(p.distinct_owners, 1);
  assert.equal(p.last_verified_at, rc.verified_at);
});
test("overrides lists receipts whose check state is accepted_although_failed or sent_back_although_passed, and they never count", async () => {
  const rc = await receipt(run2d, "runs/market-2d17e4c8.json");
  const mk = (state) => ({ ...rc, check: { counted: false, state, reason: "r", decision: null } });
  const p = PF.buildPortfolio("ohwow-agent", null, [mk("sent_back_although_passed"), { ...mk("accepted_although_failed"), id: "z" }, { ...mk("waiting"), id: "w" }]).proof;
  assert.deepEqual(p.overrides, [{ id: rc.id, state: "sent_back_although_passed" }, { id: "z", state: "accepted_although_failed" }]); assert.equal(p.checked_before_paid, 0);
});
test("a self-hire stays 0 even with a check on it", async () => {
  const rc = { ...(await receipt(run2d, "runs/market-2d17e4c8.json")), self_hire: true, check: { counted: true } };
  assert.equal(PF.proven(rc), false); assert.equal(PF.counts(rc), false);
});
test("no check attached means not counted", async () => {
  const rc = await receipt(run2d, "runs/market-2d17e4c8.json");
  delete rc.check; assert.equal(PF.counts(rc), false);
});
test("an untrusted receipt is not proven, checked or not", async () => {
  const rc = { ...(await receipt(run2d, "runs/market-2d17e4c8.json")), trusted: false, check: { counted: true } };
  assert.equal(PF.counts(rc), false);
});

test("analysis compute: checked_total and per-category checked count only counted receipts, each receipt carries check_state", async () => {
  const AN = req(path.join(root, "src/analysis.js")), rc = await receipt(run2d, "runs/market-2d17e4c8.json");
  const agents = [{ handle: rc.seller_handle, delivered_jobs: 3, category: "c" }];
  G.attach([rc], (await json("data/decisions.json")).decisions);
  let s = AN.compute(agents, [rc]);
  assert.equal(s.checked_total, 0); assert.equal(s.categories[0].checked, 0); assert.equal(s.receipts[0].check_state, "paid_before_check"); assert.equal("gated_total" in s, false); assert.equal(s.proven_total, 1);
  rc.check = { counted: true, state: "checked_before_paid" }; s = AN.compute(agents, [rc]);
  assert.equal(s.checked_total, 1); assert.equal(s.categories[0].checked, 1); assert.equal(s.receipts[0].check_state, "checked_before_paid");
  assert.equal(AN.compute(agents, [{ ...rc, check: undefined }]).receipts[0].check_state, null);
});

// ---- gate.mjs: dry run and --execute ordering with injected fakes ----
const tmp = await mkdtemp(path.join(os.tmpdir(), "gate-test-"));
let tmpN = 0;
function rig({ delivery = pass, marketStatus = "open", result, chainHistory = [], callFails = false, readbackEmpty = false } = {}) {
  const calls = [], lines = [], chain = [...chainHistory];
  const near = {
    loadKey: () => ({ accountId: "agentproof-town.testnet" }),
    viewMethod: async ({ method, args }) => { calls.push("view:" + method); return method === "get_decisions" ? (readbackEmpty && calls.filter((c) => c === "view:get_decisions").length > 1 ? [] : chain.filter((x) => x.job_id === args.job_id)) : null; },
    callMethod: async ({ method, args }) => {
      calls.push("call:" + method); if (callFails) throw new Error("ERR panic: job settled");
      chain.push({ ...args, n: chain.length, block_height: 99, block_timestamp_ms: 1794999999999 }); return { tx: "TXHASH", block_height: 99, outcome: {} };
    },
  };
  // The fake market exposes ONLY the two read calls; touching anything else is recorded and throws.
  const reads = {
    getJobStatus: async () => { calls.push("market:status"); return typeof marketStatus === "object" ? marketStatus : { status: marketStatus }; },
    getJobResult: async () => { calls.push("market:result"); return result || { status: "delivered", content: JSON.stringify(delivery), assignment_id: "as-1", awaiting_acceptance: true }; },
  };
  const market = new Proxy(reads, { get: (t, k) => { if (k in t || k === "then") return t[k]; calls.push("market:WRITE:" + String(k)); throw new Error("market write attempted: " + String(k)); } });
  const decisionsPath = path.join(tmp, `d${tmpN++}.json`);
  return { calls, lines, market, deps: { near, market, out: (s) => lines.push(s), decisionsPath, now: () => "2026-11-12T10:00:00Z" }, decisionsPath };
}
const argvFor = (extra, delivery = "pass") => [JOB, "--envelope", path.join(root, FX, "outside-hire-envelope.json"), "--delivery", path.join(root, FX, `outside-hire-${delivery}-delivery.json`), "--buyer", "owner-ohwow", "--seller", "owner-citrus", ...extra];
const chainWrites = (calls) => calls.filter((c) => c.startsWith("call:"));
const marketWrites = (calls) => calls.filter((c) => c.startsWith("market:WRITE"));
const entryOf = async (r) => JSON.parse(await readFile(r.decisionsPath, "utf8")).decisions[0];

test("dry run touches nothing: no near, no market; prints the checklist and the recommendation", async () => {
  const r = rig(); const code = await main(argvFor([]), r.deps), text = r.lines.join("\n");
  assert.equal(code, 0); assert.deepEqual(r.calls, []); assert.equal(r.lines[0], "DRY RUN: nothing is sent, signed or changed");
  assert.match(text, /^checklist$/m); assert.match(text, /^  ok    MAX_TASK_SPEND_USDC$/m); assert.match(text, /^  ok    no extra fields$/m);
  assert.match(text, /^recommend        accept \(the buyer decides on market\.near\.ai\)$/m); assert.doesNotMatch(text, /would do|counts as gated/);
});
test("dry run of a failing delivery prints FAIL with the note and -- (not checked) for the rest", async () => {
  const r = rig(); await main(argvFor([], "fail"), r.deps); const text = r.lines.join("\n");
  assert.match(text, /^  FAIL  MAX_TASK_SPEND_USDC: field MAX_TASK_SPEND_USDC: expected/m); assert.match(text, /^  --    no extra fields \(not checked\)$/m);
  assert.match(text, /^recommend        request_changes /m);
});
test("dry run of the market bundle 2d17e4c8: PASS, recommends accept, and NOT checked before paid because already accepted", async () => {
  const r = rig(); const code = await main(["2d17e4c8"], r.deps); const text = r.lines.join("\n");
  assert.equal(code, 0); assert.match(text, /verdict +PASS/); assert.match(text, /recommend +accept/);
  assert.match(text, /^checked before paid  No: accepted on the market at 2026-11-04T00:07:02\.072\+00:00, before any check\.$/m);
});
test("--execute on 2d17e4c8 refuses a settled job and calls nothing", async () => {
  const r = rig(); const code = await main(["2d17e4c8", "--execute"], r.deps);
  assert.equal(code, 1); assert.deepEqual(r.calls, []); assert.match(r.lines.join("\n"), /REFUSED.*already accepted/);
});
test("--write-snapshot upserts a dry-run entry in the new shape and never claims chain fields", async () => {
  const r = rig(); await main(argvFor(["--write-snapshot"], "fail"), r.deps); await main(argvFor(["--write-snapshot"], "fail"), r.deps);
  const snap = JSON.parse(await readFile(r.decisionsPath, "utf8")), e = snap.decisions[0];
  assert.equal(snap.decisions.length, 1); assert.equal(e.status, "dry-run"); assert.equal(e.tx, null); assert.equal(snap.contract_has_decisions, false);
  assert.equal(e.buyer, null); assert.ok(Array.isArray(e.checklist)); assert.equal("market_action" in e, false); assert.equal("market_state_after" in e, false);
});
test("--execute pass: reads market, records on chain, reads back; NO market write; entry recorded with buyer null and a checklist", async () => {
  const r = rig(); const code = await main(argvFor(["--execute"]), r.deps), text = r.lines.join("\n");
  assert.equal(code, 0);
  assert.deepEqual(r.calls, ["market:status", "market:result", "view:get_decisions", "call:record_decision", "view:get_decisions"]);
  assert.equal(r.lines[0], "CHECK RUN: records the check on NEAR testnet, never touches the money");
  assert.match(text, /^recommend +accept /m); assert.match(text, /Next: the buyer accepts or sends back on market\.near\.ai, then run: node scripts\/gate\.mjs --confirm /);
  const e = await entryOf(r);
  assert.equal(e.status, "recorded"); assert.equal(e.tx, "TXHASH"); assert.equal(e.block_timestamp_ms, 1794999999999); assert.equal(e.buyer, null); assert.equal(e.action, "accept");
  assert.ok(e.checklist.length > 1); assert.equal("market_action" in e, false);
});
test("--execute makes zero market-write calls on pass, fail and blocked, and --pro is not an option any more", async () => {
  const blocked = await json(FX + "outside-hire-blocked-delivery.json");
  for (const [dl, name, action] of [[pass, "pass", "accept"], [bad, "fail", "request_changes"], [blocked, "blocked", "none"]]) {
    const r = rig({ delivery: dl }); assert.equal(await main(argvFor(["--execute"], name), r.deps), 0);
    assert.deepEqual(marketWrites(r.calls), []); assert.deepEqual(chainWrites(r.calls), ["call:record_decision"]); assert.equal((await entryOf(r)).action, action);
    assert.ok(r.calls.filter((c) => c.startsWith("market:")).every((c) => c === "market:status" || c === "market:result"));
  }
  const r = rig(); await main(argvFor(["--execute", "--pro"]), r.deps); assert.deepEqual(marketWrites(r.calls), []);
});
test("--execute: if the chain write fails nothing is recorded", async () => {
  const r = rig({ callFails: true }); const code = await main(argvFor(["--execute"]), r.deps);
  assert.equal(code, 1); assert.deepEqual(chainWrites(r.calls), ["call:record_decision"]); assert.match(r.lines.join("\n"), /NOT confirmed on chain/);
  assert.equal(await readFile(r.decisionsPath, "utf8").then(() => true, () => false), false);
});
test("--execute: a write whose read-back does not show the decision is refused and nothing is saved", async () => {
  const r = rig({ readbackEmpty: true }); assert.equal(await main(argvFor(["--execute"]), r.deps), 1);
  assert.equal(await readFile(r.decisionsPath, "utf8").then(() => true, () => false), false);
});
test("--execute refuses when the market already shows the job settled, before any chain call", async () => {
  const r = rig({ marketStatus: "completed" }); assert.equal(await main(argvFor(["--execute"]), r.deps), 1);
  assert.deepEqual(r.calls, ["market:status"]);
});
test("--execute refuses when the delivery on the market is not the one checked", async () => {
  const r = rig({ delivery: bad }); assert.equal(await main(argvFor(["--execute"], "pass"), r.deps), 1);
  assert.deepEqual(chainWrites(r.calls), []); assert.match(r.lines.join("\n"), /differs from the one that was checked/);
});
test("--execute refuses an unreadable, external or not-awaiting delivery", async () => {
  for (const result of [{ status: "external", deliverable_url: "x" }, { status: "unavailable" }, { status: "delivered", content: "not json", awaiting_acceptance: true }, { status: "delivered", content: JSON.stringify(pass), awaiting_acceptance: false }]) {
    const r = rig({ result }); assert.equal(await main(argvFor(["--execute"]), r.deps), 1); assert.deepEqual(chainWrites(r.calls), []);
  }
});
test("--execute refuses a job already settled on chain, and the same digest decided differently", async () => {
  const d = await G.decisionFor(outside(pass), CHK, PF);
  let r = rig({ chainHistory: [{ ...d.input, verdict: "fail", action: "request_changes", n: 0, delivery_digest: "c".repeat(64), block_height: 1, block_timestamp_ms: 1 }, { ...d.input, action: "cancel", verdict: "blocked", n: 1, delivery_digest: "d".repeat(64), block_height: 2, block_timestamp_ms: 2 }] });
  assert.equal(await main(argvFor(["--execute"]), r.deps), 1); assert.deepEqual(chainWrites(r.calls), []);
  r = rig({ chainHistory: [{ ...d.input, verdict: "fail", action: "request_changes", n: 0, block_height: 1, block_timestamp_ms: 1 }] });
  assert.equal(await main(argvFor(["--execute"]), r.deps), 1); assert.deepEqual(chainWrites(r.calls), []);
});
test("--execute resumes when this exact decision is already on chain: no second record_decision", async () => {
  const d = await G.decisionFor(outside(pass), CHK, PF);
  const r = rig({ chainHistory: [{ ...d.input, n: 0, block_height: 7, block_timestamp_ms: 1794000000000 }] });
  assert.equal(await main(argvFor(["--execute"]), r.deps), 0);
  assert.ok(!r.calls.includes("call:record_decision")); assert.deepEqual(marketWrites(r.calls), []);
  assert.equal((await entryOf(r)).tx, null); // tx of an earlier run is unknown, never invented
});

// ---- --confirm: read-only market read, stores what the buyer did ----
// The market's real shapes, as read on job 8a20efe5 on 2026-11-11 (get_job_status, get_job).
const SUB = "2026-11-12T09:00:00Z";
const realStatus = (job, asg) => ({ job_id: JOB, status: job, worker_state: "finished", assignments: [{ assignment_id: "as-1", status: asg, submitted_at: SUB, auto_accept_at: null }] });
const realJob = (status, updated_at) => ({ job_id: JOB, status, created_at: "2026-11-12T08:59:00Z", updated_at });
async function recorded(verdictKind, status, job = realJob("completed", "2026-11-13T10:00:00Z")) {
  const blocked = verdictKind === "pass" ? pass : bad;
  const r = rig({ delivery: blocked }); assert.equal(await main(argvFor(["--execute"], verdictKind === "pass" ? "pass" : "fail"), r.deps), 0);
  const reads = { getJobStatus: async () => { r.calls.push("confirm:status"); return status; }, getJobResult: async () => ({}), getJob: async () => { r.calls.push("confirm:job"); return job; } };
  const withStatus = { ...r.deps, market: new Proxy(reads, { get: (t, k) => { if (k in t || k === "then") return t[k]; r.calls.push("market:WRITE:" + String(k)); throw new Error("write"); } }) };
  return { r, run: (extra = []) => main(["--confirm", JOB, ...extra], withStatus) };
}
test("--confirm: job completed + assignment accepted (the real names) -> FOLLOWED, accept time from get_job.updated_at, only reads", async () => {
  const { r, run } = await recorded("pass", realStatus("completed", "accepted"));
  assert.equal(await run(), 0); assert.match(r.lines.join("\n"), /^FOLLOWED$/m); assert.match(r.lines.join("\n"), /^accepted at +2026-11-13T10:00:00Z \(get_job\.updated_at\)$/m);
  const e = await entryOf(r);
  assert.deepEqual(e.buyer, { action: "accepted", followed: true, market_accepted_at: "2026-11-13T10:00:00Z", market_accepted_at_source: "get_job.updated_at", read_at: "2026-11-12T10:00:00Z", job_status: "completed", assignment_state: "accepted" });
  assert.equal(e.note, "recorded on chain; the buyer accepted on market.near.ai at 2026-11-13T10:00:00Z");
  assert.deepEqual(r.calls.filter((c) => c.startsWith("confirm:")), ["confirm:status", "confirm:job"]); assert.deepEqual(marketWrites(r.calls), []);
});
test("--confirm: an accept time the market reports itself wins; get_job is not read", async () => {
  const st = { ...realStatus("completed", "accepted") }; st.assignments = [{ ...st.assignments[0], accepted_at: "2026-11-13T11:00:00Z" }];
  const c = await recorded("pass", st); assert.equal(await c.run(), 0);
  const b = (await entryOf(c.r)).buyer; assert.equal(b.market_accepted_at, "2026-11-13T11:00:00Z"); assert.equal(b.market_accepted_at_source, "get_job_status");
  assert.deepEqual(c.r.calls.filter((x) => x.startsWith("confirm:")), ["confirm:status"]);
});
test("--confirm: get_job not completed, or updated before the delivery -> no accept time, stored null and said", async () => {
  for (const job of [realJob("in_progress", "2026-11-13T10:00:00Z"), realJob("completed", "2026-11-12T08:00:00Z"), realJob("completed", null)]) {
    const c = await recorded("pass", realStatus("completed", "accepted"), job); assert.equal(await c.run(), 0);
    const b = (await entryOf(c.r)).buyer; assert.equal(b.market_accepted_at, null); assert.equal(b.market_accepted_at_source, null);
    assert.match(c.r.lines.join("\n"), /did not report an accept time/);
  }
});
test("--confirm: completed without an accepted assignment, or accepted while the job is not completed, is NOT YET (no guessing)", async () => {
  for (const st of [realStatus("completed", "submitted"), realStatus("in_progress", "accepted"), { status: "completed" }]) {
    const c = await recorded("pass", st); assert.equal(await c.run(), 1);
    assert.match(c.r.lines.join("\n"), /^NOT YET/m); assert.equal((await entryOf(c.r)).buyer, null);
  }
});
test("--confirm: buyer accepted although the check failed -> OVERRODE, followed false", async () => {
  const { r, run } = await recorded("fail", realStatus("completed", "accepted"));
  assert.equal(await run(), 0); assert.match(r.lines.join("\n"), /^OVERRODE  accepted although the check failed$/m);
  const b = (await entryOf(r)).buyer; assert.equal(b.action, "accepted"); assert.equal(b.followed, false);
});
test("--confirm: buyer sent back a passing check -> OVERRODE, sent back although it passed; cancelled is the same override", async () => {
  let c = await recorded("pass", { status: "open", assignment_state: "changes_requested" }); assert.equal(await c.run(), 0);
  assert.match(c.r.lines.join("\n"), /^OVERRODE  sent back although it passed$/m); assert.deepEqual([(await entryOf(c.r)).buyer.action, (await entryOf(c.r)).buyer.followed], ["sent_back", false]);
  c = await recorded("pass", { status: "cancelled" }); assert.equal(await c.run(), 0);
  assert.match(c.r.lines.join("\n"), /OVERRODE  sent back although it passed/); assert.equal((await entryOf(c.r)).buyer.action, "cancelled");
});
test("--confirm: buyer sent back a failing check -> FOLLOWED", async () => {
  const { r, run } = await recorded("fail", { status: "open", assignment_state: "changes_requested" });
  assert.equal(await run(), 0); assert.match(r.lines.join("\n"), /^FOLLOWED$/m); assert.equal((await entryOf(r)).buyer.followed, true);
});
test("--confirm: a job still in_progress is NOT YET, not an override", async () => {
  const { r, run } = await recorded("pass", { status: "open", assignment_state: "in_progress" });
  assert.equal(await run(), 1); assert.match(r.lines.join("\n"), /^NOT YET  the buyer has not decided on the market$/m); assert.equal((await entryOf(r)).buyer, null);
});
test("--confirm: nothing decided yet -> NOT YET, exit 1, buyer stays null", async () => {
  const { r, run } = await recorded("pass", realStatus("in_progress", "submitted"));
  assert.equal(await run(), 1); assert.match(r.lines.join("\n"), /^NOT YET  the buyer has not decided on the market$/m); assert.equal((await entryOf(r)).buyer, null);
});
test("--confirm: with two recorded entries for one job, the buyer lands on the latest n", async () => {
  const { r, run } = await recorded("pass", realStatus("completed", "accepted"));
  const snap = JSON.parse(await readFile(r.decisionsPath, "utf8")); snap.decisions.push({ ...snap.decisions[0], n: 1, delivery_digest: "e".repeat(64), buyer: null });
  await writeFile(r.decisionsPath, JSON.stringify(snap));
  assert.equal(await run(), 0);
  const after = JSON.parse(await readFile(r.decisionsPath, "utf8")).decisions;
  assert.equal(after.length, 2); assert.equal(after[0].buyer, null); assert.equal(after[1].buyer.action, "accepted");
});
test("--confirm: no recorded entry for the job is refused", async () => {
  const r = rig(); assert.equal(await main(["--confirm", "0000"], r.deps), 1);
});
test("dry run without --delivery reads the delivery from the market (fake client)", async () => {
  const r = rig(); const code = await main([JOB, "--envelope", path.join(root, FX, "outside-hire-envelope.json"), "--buyer", "owner-ohwow", "--seller", "owner-citrus"], r.deps);
  assert.equal(code, 0); assert.deepEqual(r.calls, ["market:result"]); assert.match(r.lines.join("\n"), /verdict +PASS/);
});
test("data/decisions.json entries are in the new shape", async () => {
  for (const e of (await json("data/decisions.json")).decisions) {
    assert.deepEqual(Object.keys(e), ["run", "job_id", "n", "delivery_digest", "checker_version", "verdict", "action", "buyer_owner", "seller_owner", "status", "tx", "block_height", "block_timestamp_ms", "checklist", "buyer", "note"]);
    assert.ok(Array.isArray(e.checklist));
    if (e.buyer !== null) assert.deepEqual(Object.keys(e.buyer), ["action", "followed", "market_accepted_at", "market_accepted_at_source", "read_at", "job_status", "assignment_state"]);
  }
});

for (const [name, fn] of tests) {
  try { await fn(); console.log("ok   " + name); } catch (e) { failed++; console.log("FAIL " + name + "\n" + (e && e.stack || e)); }
}
console.log(failed ? `${failed} of ${tests.length} failed` : `all ${tests.length} passed`);
process.exit(failed ? 1 : 0);
