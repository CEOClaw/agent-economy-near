// Offline tests for scripts/market-mcp.mjs (fake fetch, never the network, no real token).
// Run: node scripts/test-market-mcp.mjs
import assert from "node:assert/strict";
import * as M from "./market-mcp.mjs";

let failed = 0; const tests = []; const test = (n, f) => tests.push([n, f]);
const hdr = (o) => ({ get: (k) => o[k.toLowerCase()] ?? null });
const json = (result, extra = {}) => ({ ok: true, status: 200, headers: hdr({ "content-type": "application/json", ...extra }), text: async () => JSON.stringify(result) });
const sse = (msgs, extra = {}) => ({ ok: true, status: 200, headers: hdr({ "content-type": "text/event-stream", ...extra }), text: async () => msgs.map((m) => `event: message\ndata: ${JSON.stringify(m)}\n\n`).join("") });
const accepted = { ok: true, status: 202, headers: hdr({}), text: async () => "" };
const tool = (value, isError = false) => ({ content: [{ type: "text", text: JSON.stringify(value) }], isError });
// A fake server: handlers by tool name; replies json or sse; records every request.
function server({ asSse = false, handlers = {} } = {}) {
  const reqs = [];
  const f = async (url, init) => {
    const b = JSON.parse(init.body); reqs.push({ url, headers: init.headers, body: b });
    if (b.method === "initialize") return (asSse ? sse([{ jsonrpc: "2.0", id: b.id, result: { protocolVersion: "2025-03-26", serverInfo: { name: "m", version: "9" } } }], { "mcp-session-id": "S1" }) : json({ jsonrpc: "2.0", id: b.id, result: { protocolVersion: "2025-03-26", serverInfo: { name: "m", version: "9" } } }, { "mcp-session-id": "S1" }));
    if (b.method === "notifications/initialized") return accepted;
    const h = handlers[b.params.name.replace("marketplace__", "")];
    const out = h(b.params.arguments);
    const msg = out.rpcError ? { jsonrpc: "2.0", id: b.id, error: out.rpcError } : { jsonrpc: "2.0", id: b.id, result: out };
    return asSse ? sse([{ jsonrpc: "2.0", method: "notifications/progress", params: {} }, msg]) : json(msg);
  };
  f.reqs = reqs; return f;
};
const opts = (fetchFn, extra = {}) => ({ fetchFn, token: "TKN", ...extra });

test("JSON replies: initialize first, then tools/call; bearer, accept header, session id carried, tool name prefixed", async () => {
  const f = server({ handlers: { get_job_status: (a) => tool({ job_id: a.job_id, worker_state: "delivered — awaiting your review" }) } });
  const r = await M.getJobStatus("job-1", opts(f));
  assert.equal(r.worker_state, "delivered — awaiting your review");
  assert.deepEqual(f.reqs.map((q) => q.body.method), ["initialize", "notifications/initialized", "tools/call"]);
  assert.equal(f.reqs[0].url, "https://market.near.ai/mcp");
  assert.equal(f.reqs[0].headers.authorization, "Bearer TKN");
  assert.equal(f.reqs[0].headers.accept, "application/json, text/event-stream");
  assert.equal(f.reqs[0].headers["mcp-session-id"], undefined);
  assert.equal(f.reqs[2].headers["mcp-session-id"], "S1");
  assert.equal(f.reqs[2].body.params.name, "marketplace__get_job_status");
});

test("SSE replies: the reply with our id is picked out from other events", async () => {
  const f = server({ asSse: true, handlers: { get_job_status: () => tool({ worker_state: "x" }) } });
  assert.equal((await M.getJobStatus("j", opts(f))).worker_state, "x");
});

test("getJob and listMyJobs call the read tools get_job and list_my_jobs, nothing else", async () => {
  const f = server({ handlers: { get_job: (a) => tool({ job_id: a.job_id, status: "completed", updated_at: "2026-11-11T23:32:41.618120Z" }), list_my_jobs: () => tool({ jobs: [], total: 0 }) } });
  const c = M.createClient(opts(f));
  assert.equal((await M.getJob("j-1", { client: c })).updated_at, "2026-11-11T23:32:41.618120Z");
  assert.deepEqual(await M.listMyJobs({ client: c }), { jobs: [], total: 0 });
  assert.deepEqual(f.reqs.filter((r) => r.body.method === "tools/call").map((r) => [r.body.params.name, r.body.params.arguments]), [["marketplace__get_job", { job_id: "j-1" }], ["marketplace__list_my_jobs", {}]]);
});
test("the module exports no write function and always uses /mcp", async () => {
  assert.deepEqual(Object.keys(M).sort(), ["BASE", "McpError", "TOKEN_FILE", "createClient", "getJob", "getJobResult", "getJobStatus", "listMyJobs", "parseBody"]);
  const f = server({ handlers: { get_job_status: () => tool({}) } });
  await M.getJobStatus("j", opts(f, { pro: true }));
  assert.equal(f.reqs[0].url, "https://market.near.ai/mcp");
});

test("getJobResult pages content_chunk until next_offset is absent and checks bytes_total", async () => {
  const pages = [{ status: "delivered", content_chunk: "hel", bytes_total: 5, next_offset: 3, assignment_id: "a", version: 2, awaiting_acceptance: true }, { status: "delivered", content_chunk: "lo", bytes_total: 5, assignment_id: "a", version: 2, awaiting_acceptance: true }];
  const args = [];
  const f = server({ handlers: { get_job_result: (a) => { args.push(a); return tool(pages[args.length - 1]); } } });
  const r = await M.getJobResult("j", opts(f));
  assert.deepEqual(args, [{ job_id: "j" }, { job_id: "j", offset: 3 }]);
  assert.deepEqual(r, { status: "delivered", bytes_total: 5, assignment_id: "a", version: 2, awaiting_acceptance: true, content: "hello" });
});

test("getJobResult: short content, a stuck offset, external and unavailable results", async () => {
  const short = server({ handlers: { get_job_result: () => tool({ status: "delivered", content_chunk: "ab", bytes_total: 9 }) } });
  await assert.rejects(M.getJobResult("j", opts(short)), (e) => e.kind === "short");
  const stuck = server({ handlers: { get_job_result: () => tool({ status: "delivered", content_chunk: "a", bytes_total: 9, next_offset: 0 }) } });
  // first page asks without offset, answers next_offset 0; the second page answers 0 again
  await assert.rejects(M.getJobResult("j", opts(stuck)), (e) => e.kind === "paging");
  const ext = server({ handlers: { get_job_result: () => tool({ status: "external", deliverable_url: "https://x/y" }) } });
  assert.deepEqual(await M.getJobResult("j", opts(ext)), { status: "external", deliverable_url: "https://x/y" });
  const un = server({ handlers: { get_job_result: () => tool({ status: "unavailable", note: "n" }) } });
  assert.equal((await M.getJobResult("j", opts(un))).status, "unavailable");
});

test("an isError result throws McpError with the market's code, message and data (kind refused)", async () => {
  for (const code of [-32001, -32003, -32005, -32602]) {
    const f = server({ handlers: { get_job_status: () => tool({ refused: true, code, message: "nope " + code, data: { code: "d" } }, true) } });
    await assert.rejects(M.getJobStatus("j", opts(f)), (e) => e instanceof M.McpError && e.code === code && e.kind === "refused" && e.message === "nope " + code && e.data.code === "d" && e.tool === "get_job_status");
  }
});

test("a JSON-RPC error (market failure) throws McpError kind rpc with its code; works over SSE too", async () => {
  for (const asSse of [false, true]) {
    const f = server({ asSse, handlers: { get_job_status: () => ({ rpcError: { code: -32603, message: "market failure" } }) } });
    await assert.rejects(M.getJobStatus("j", opts(f)), (e) => e.code === -32603 && e.kind === "rpc" && e.message === "market failure");
  }
});

test("HTTP 401 is an auth error that says how to log in; a missing token is refused before any request", async () => {
  const f = async () => ({ ok: false, status: 401, headers: hdr({}), text: async () => "" });
  await assert.rejects(M.getJobStatus("j", opts(f)), (e) => e.kind === "auth" && /market-login/.test(e.message));
  const calls = []; const g = async (...a) => { calls.push(a); return accepted; };
  const saved = process.env.MARKET_MCP_TOKEN; delete process.env.MARKET_MCP_TOKEN;
  try { await assert.rejects(M.getJobStatus("j", { fetchFn: g, tokenFile: "/nonexistent/x.json" }), (e) => e.kind === "auth"); } finally { if (saved !== undefined) process.env.MARKET_MCP_TOKEN = saved; }
  assert.equal(calls.length, 0);
});

test("the token comes from MARKET_MCP_TOKEN when not passed", async () => {
  const f = server({ handlers: { get_job_status: () => tool({}) } });
  const saved = process.env.MARKET_MCP_TOKEN; process.env.MARKET_MCP_TOKEN = "ENVTKN";
  try { await M.getJobStatus("j", { fetchFn: f }); } finally { saved === undefined ? delete process.env.MARKET_MCP_TOKEN : (process.env.MARKET_MCP_TOKEN = saved); }
  assert.equal(f.reqs[0].headers.authorization, "Bearer ENVTKN");
});

test("one client reuses its session: initialize runs once for several calls", async () => {
  const f = server({ handlers: { get_job_status: () => tool({}), get_job_result: () => tool({ status: "unavailable" }) } });
  const client = M.createClient(opts(f));
  await M.getJobStatus("j", { client }); await M.getJobResult("j", { client });
  assert.equal(f.reqs.filter((q) => q.body.method === "initialize").length, 1);
});

for (const [name, fn] of tests) { try { await fn(); console.log("ok   " + name); } catch (e) { failed++; console.log("FAIL " + name + "\n  " + (e.stack || e).toString().split("\n").slice(0, 4).join("\n  ")); } }
console.log(`\n${tests.length - failed}/${tests.length} passed`);
process.exit(failed ? 1 : 0);
