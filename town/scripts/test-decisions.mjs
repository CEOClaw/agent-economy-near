// Offline tests for src/decisions.js (fake fetch, never the network).
// Run: node scripts/test-decisions.mjs
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const D = createRequire(import.meta.url)(path.join(root, "src/decisions.js"));
let failed = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

const JOB = "7a1c9e52-3b4d-4f60-8a21-5d0e6b9c1f34";
const snap = { network: "testnet", contract: "agentproof-town.testnet", rpc: ["https://a.example", "https://b.example"], explorer: "https://testnet.nearblocks.io" };
const rec = (n, o = {}) => ({ job_id: JOB, n, delivery_digest: String(n + 1).repeat(64), checker_version: "structured-field-extraction-v1:1.0.0", verdict: "fail", action: "request_changes", buyer_owner: "ownerohwow", seller_owner: "ownercitrus", block_height: 100 + n, block_timestamp_ms: 1794000000000 + n, ...o });
const bytes = (v) => Array.from(Buffer.from(JSON.stringify(v)));
const reply = (result, status = 200) => ({ ok: status === 200, status, json: async () => ({ jsonrpc: "2.0", id: "decisions", result }) });
const view = (v) => reply({ result: bytes(v), logs: [], block_height: 1, block_hash: "x" });
const fake = (byUrl) => { const calls = []; const f = async (url, init) => { calls.push({ url, init }); const h = byUrl[url]; if (typeof h === "function") return h(init); if (h instanceof Error) throw h; return h; }; f.calls = calls; return f; };

test("the view call is a final call_function get_decisions with the job id; the history comes back oldest first", async () => {
  const hist = [rec(0), rec(1, { verdict: "pass", action: "accept" })];
  const f = fake({ "https://a.example": view(hist) });
  const r = await D.viewDecisions(snap, JOB, f);
  assert.deepEqual(r, { ok: true, rpc: "https://a.example", decisions: hist });
  const body = JSON.parse(f.calls[0].init.body);
  assert.equal(body.params.request_type, "call_function"); assert.equal(body.params.finality, "final");
  assert.equal(body.params.account_id, "agentproof-town.testnet"); assert.equal(body.params.method_name, "get_decisions");
  assert.deepEqual(JSON.parse(Buffer.from(body.params.args_base64, "base64").toString()), { job_id: JOB });
  assert.equal(D.decisionForDigest(r.decisions, "2".repeat(64)).n, 1);
  assert.equal(D.decisionForDigest(r.decisions, "f".repeat(64)), null);
});
test("[] is a good answer: no decisions yet, which is not a failure to reach the contract", async () => {
  assert.deepEqual(await D.viewDecisions(snap, JOB, fake({ "https://a.example": view([]) })), { ok: true, rpc: "https://a.example", decisions: [] });
});
test("unreachable: every RPC throws or times out", async () => {
  const f = fake({ "https://a.example": new Error("down"), "https://b.example": () => new Promise(() => {}) });
  assert.deepEqual(await D.viewDecisions(snap, JOB, f, 20), { ok: false, reason: "unreachable" });
  assert.equal(f.calls.length, 2);
});
test("fallback: first RPC down, the second answers; a bad answer from one does not hide a good one", async () => {
  assert.equal((await D.viewDecisions(snap, JOB, fake({ "https://a.example": new Error("down"), "https://b.example": view([rec(0)]) }))).rpc, "https://b.example");
  assert.equal((await D.viewDecisions(snap, JOB, fake({ "https://a.example": reply({}, 500), "https://b.example": view([]) }))).ok, true);
});
test("bad response: HTTP error, error result (contract has no get_decisions yet), non-JSON, a single object, wrong job, wrong n, bad enum, missing owner, string height", async () => {
  const cases = [
    reply({}, 502), reply({}), reply({ error: "MethodNotFound: get_decisions", logs: [] }),
    reply({ result: Array.from(Buffer.from("not json")) }), reply({ result: [300, -1] }),
    view(rec(0)), view("x"), view(null), view([1]),
    view([rec(0, { job_id: "ffff" })]), view([rec(1)]), view([rec(0), rec(0)]),
    view([rec(0, { verdict: "maybe" })]), view([rec(0, { action: "pay" })]), view([rec(0, { delivery_digest: "abc" })]),
    view([rec(0, { buyer_owner: "" })]), view([rec(0, { block_height: "12" })]), view([rec(0, { block_timestamp_ms: 1.5 })]),
    { ok: true, status: 200, json: async () => { throw new Error("bad json"); } },
    { ok: true, status: 200, json: async () => ({ error: { code: -32000 } }) },
  ];
  for (const c of cases) assert.deepEqual(await D.viewDecisions(snap, JOB, fake({ "https://a.example": c, "https://b.example": c })), { ok: false, reason: "bad response" });
});
test("no RPCs listed is unreachable", async () => {
  assert.deepEqual(await D.viewDecisions({ ...snap, rpc: [] }, JOB, fake({})), { ok: false, reason: "unreachable" });
});
test("links and exports", () => {
  assert.equal(D.txUrl(snap, "abc"), "https://testnet.nearblocks.io/txns/abc");
  assert.deepEqual(Object.keys(D).sort(), ["decisionForDigest", "sameRecord", "txUrl", "validDecision", "verifyEntries", "viewDecisions"]);
});

for (const [name, fn] of tests) {
  try { await fn(); console.log("ok   " + name); } catch (e) { failed++; console.log("FAIL " + name + "\n" + (e && e.stack || e)); }
}
console.log(failed ? `${failed} of ${tests.length} failed` : `all ${tests.length} passed`);
process.exit(failed ? 1 : 0);
