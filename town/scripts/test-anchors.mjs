// Offline tests for src/anchors.js (fake fetch, never the network).
// Run: node scripts/test-anchors.mjs
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const A = createRequire(import.meta.url)(path.join(root, "src/anchors.js"));
let failed = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

const JOB = "2d17e4c8-0984-4a63-acac-91460f65cb8a", DIGEST = "89c9b813f4a2277628957b658136d28e6da23cd209e63526e58f1423d3439e2e";
const snap = { network: "testnet", contract: "agentproof-town.testnet", rpc: ["https://a.example", "https://b.example"], explorer: "https://testnet.nearblocks.io" };
const record = { job_id: JOB, digest: DIGEST, checker_version: "structured-field-extraction-v1:1.0.0", block_height: 277269886, block_timestamp_ms: 1794432166342 };
const bytes = (v) => Array.from(Buffer.from(JSON.stringify(v)));
const reply = (result, status = 200) => ({ ok: status === 200, status, json: async () => ({ jsonrpc: "2.0", id: "anchor", result }) });
const view = (v) => reply({ result: bytes(v), logs: [], block_height: 1, block_hash: "x" });
// fetch that answers per-URL: a function, or a value returned as the response; records every call.
const fake = (byUrl) => { const calls = []; const f = async (url, init) => { calls.push({ url, init }); const h = byUrl[url]; if (typeof h === "function") return h(init); if (h instanceof Error) throw h; return h; }; f.calls = calls; return f; };

test("match: the view call is a final call_function get with the job id, and the record comes back", async () => {
  const f = fake({ "https://a.example": view(record) });
  const r = await A.viewAnchor(snap, JOB, f);
  assert.deepEqual(r, { ok: true, rpc: "https://a.example", record });
  const body = JSON.parse(f.calls[0].init.body);
  assert.equal(body.method, "query");
  assert.equal(body.params.request_type, "call_function");
  assert.equal(body.params.finality, "final");
  assert.equal(body.params.account_id, "agentproof-town.testnet");
  assert.equal(body.params.method_name, "get");
  assert.deepEqual(JSON.parse(Buffer.from(body.params.args_base64, "base64").toString()), { job_id: JOB });
  assert.equal(A.compareAnchor(r.record, DIGEST), "match");
});

test("mismatch: a record whose digest differs from the recomputed one", async () => {
  const r = await A.viewAnchor(snap, JOB, fake({ "https://a.example": view(record) }));
  assert.equal(A.compareAnchor(r.record, "0".repeat(64)), "mismatch");
});

test("missing: the contract answers null, which is not a failure to reach it", async () => {
  const r = await A.viewAnchor(snap, JOB, fake({ "https://a.example": reply({ result: Array.from(Buffer.from("null")) }) }));
  assert.deepEqual(r, { ok: true, rpc: "https://a.example", record: null });
  assert.equal(A.compareAnchor(r.record, DIGEST), "missing");
});

test("unreachable: every RPC throws or times out", async () => {
  const f = fake({ "https://a.example": new Error("network down"), "https://b.example": () => new Promise(() => {}) });
  const r = await A.viewAnchor(snap, JOB, f, 20);
  assert.deepEqual(r, { ok: false, reason: "unreachable" });
  assert.equal(f.calls.length, 2);
});

test("fallback: first RPC down, the second answers", async () => {
  const r = await A.viewAnchor(snap, JOB, fake({ "https://a.example": new Error("down"), "https://b.example": view(record) }));
  assert.equal(r.ok, true);
  assert.equal(r.rpc, "https://b.example");
});

test("bad response: HTTP error, no result, error result, non-JSON bytes, wrong shape, another job's record", async () => {
  const wrongJob = { ...record, job_id: "ffff" }, shortDigest = { ...record, digest: "abc" }, noHeight = { ...record, block_height: "12" };
  const cases = [
    reply({}, 502),
    reply({}),
    reply({ error: "wasm execution failed", logs: [] }),
    reply({ result: Array.from(Buffer.from("not json")) }),
    reply({ result: [300, -1] }),
    view([1, 2]), view("x"), view({}), view(wrongJob), view(shortDigest), view(noHeight),
    { ok: true, status: 200, json: async () => { throw new Error("bad json"); } },
    { ok: true, status: 200, json: async () => ({ error: { code: -32000 } }) },
  ];
  for (const c of cases) {
    const r = await A.viewAnchor(snap, JOB, fake({ "https://a.example": c, "https://b.example": c }));
    assert.deepEqual(r, { ok: false, reason: "bad response" });
  }
});

test("a bad answer from one RPC does not hide a good one from the next", async () => {
  const r = await A.viewAnchor(snap, JOB, fake({ "https://a.example": reply({}, 500), "https://b.example": view(record) }));
  assert.equal(r.ok, true);
  assert.equal(r.rpc, "https://b.example");
});

test("no RPCs listed is unreachable, never a match", async () => {
  assert.deepEqual(await A.viewAnchor({ ...snap, rpc: [] }, JOB, fake({})), { ok: false, reason: "unreachable" });
});

test("compareAnchor treats undefined like missing", () => {
  assert.equal(A.compareAnchor(undefined, DIGEST), "missing");
});

test("links", () => {
  assert.equal(A.txUrl(snap, "abc"), "https://testnet.nearblocks.io/txns/abc");
  assert.equal(A.accountUrl(snap), "https://testnet.nearblocks.io/address/agentproof-town.testnet");
});

test("exports are exactly the four functions", () => {
  assert.deepEqual(Object.keys(A).sort(), ["accountUrl", "compareAnchor", "txUrl", "viewAnchor"]);
});

for (const [name, fn] of tests) {
  try { await fn(); console.log("ok   " + name); } catch (e) { failed++; console.log("FAIL " + name + "\n" + (e && e.stack || e)); }
}
console.log(failed ? `${failed} of ${tests.length} failed` : `all ${tests.length} passed`);
process.exit(failed ? 1 : 0);
