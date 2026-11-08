// Node tests for src/market.js (fake fetch, no network) and scripts/relay.mjs (real processes on 18788-18790).
// Run: npm test
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const M = createRequire(import.meta.url)(path.join(root, "src/market.js"));
let failed = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

const agent = (i, extra = {}) => ({ handle: "a" + i, name: "A" + i, delivered_jobs: 0, availability: "unavailable", available_now: false, ...extra });
const agents = (from, n) => Array.from({ length: n }, (_, i) => agent(from + i));
const res = (status, body, headers = {}) => ({ ok: status >= 200 && status < 300, status, headers: { get: (k) => headers[k] ?? null }, json: async () => body });
// Fake relay serving `total` agents; `hook(offset, attempt)` may return a response/throw/hang to override.
function fakeRelay(total, hook) {
  const log = { calls: [], inflight: 0, maxInflight: 0, attempts: new Map() };
  const fetch = async (url, init = {}) => {
    const u = new URL(url), offset = Number(u.searchParams.get("offset"));
    if (u.pathname === "/health") return res(200, { ok: true, service: "agentproof-relay" });
    const attempt = (log.attempts.get(offset) || 0) + 1;
    log.attempts.set(offset, attempt);
    log.calls.push(offset);
    log.inflight++; log.maxInflight = Math.max(log.maxInflight, log.inflight);
    try {
      await new Promise((r) => setTimeout(r, 15));
      const over = hook && (await hook(offset, attempt, init));
      if (over) return over;
      return res(200, { agents: agents(offset, Math.max(0, Math.min(50, total - offset))) }, { "X-Relay-Fetched-At": new Date(Date.UTC(2026, 10, 5, 12, 0, offset / 50)).toISOString() });
    } finally { log.inflight--; }
  };
  return { fetch, log };
}
const FAST = { backoffMs: [5, 5] };

test("pages fetched in parallel batches, bound respected, stops after the short page", async () => {
  const { fetch, log } = fakeRelay(430, null); // pages 0..8, page 8 is short
  const r = await M.fetchRelayAgents("http://x", { fetch, concurrency: 4, ...FAST });
  assert.equal(r.count, 430);
  assert.equal(r.source, "relay");
  assert.equal(r.relay, "http://x");
  assert.ok(log.maxInflight > 1 && log.maxInflight <= 4, "maxInflight " + log.maxInflight);
  // short page is #9 (offset 400), in batch 3 (offsets 400..550): batch 4 never starts.
  assert.equal(Math.max(...log.calls), 550);
  assert.equal(r.fetched_at, "2026-11-05T12:00:00.000Z"); // oldest of the pages
});

test("exact multiple of 50: one more empty page ends it", async () => {
  const { fetch } = fakeRelay(100, null);
  const r = await M.fetchRelayAgents("http://x", { fetch, ...FAST });
  assert.equal(r.count, 100);
});

test("a 5xx is retried then succeeds; a timeout is retried then succeeds", async () => {
  const a = fakeRelay(60, (off, att) => (off === 0 && att < 3 ? res(503, {}) : null));
  assert.equal((await M.fetchRelayAgents("http://x", { fetch: a.fetch, ...FAST })).count, 60);
  assert.equal(a.log.attempts.get(0), 3);
  const b = fakeRelay(60, (off, att, init) => (off === 50 && att === 1 ? new Promise(() => {}) : null)); // hangs, ignores abort
  assert.equal((await M.fetchRelayAgents("http://x", { fetch: b.fetch, timeoutMs: 60, ...FAST })).count, 60);
  assert.equal(b.log.attempts.get(50), 2);
  const c = fakeRelay(60, (off, att) => { if (off === 0 && att === 1) throw new TypeError("fetch failed"); return null; });
  assert.equal((await M.fetchRelayAgents("http://x", { fetch: c.fetch, ...FAST })).count, 60);
  const d = fakeRelay(60, (off, att) => (off === 0 && att === 1 ? res(429, {}) : null));
  assert.equal((await M.fetchRelayAgents("http://x", { fetch: d.fetch, ...FAST })).count, 60);
});

test("failure after retries throws a plain message; a 404 is not retried", async () => {
  const a = fakeRelay(60, () => res(500, {}));
  await assert.rejects(M.fetchRelayAgents("http://x", { fetch: a.fetch, ...FAST }), (e) => {
    assert.match(e.message, /^The relay at http:\/\/x did not answer \(HTTP 500\)\.$/);
    return true;
  });
  assert.equal(a.log.attempts.get(0), 3); // 1 try + 2 retries
  const b = fakeRelay(60, () => res(404, {}));
  await assert.rejects(M.fetchRelayAgents("http://x", { fetch: b.fetch, ...FAST }), /HTTP 404/);
  assert.equal(b.log.attempts.get(0), 1);
  const c = fakeRelay(60, () => new Promise(() => {}));
  await assert.rejects(M.fetchRelayAgents("http://x", { fetch: c.fetch, timeoutMs: 30, ...FAST }), /timed out/);
});

test("dedupes by handle, keeping order", async () => {
  const f = async (url) => {
    const off = Number(new URL(url).searchParams.get("offset"));
    const page = off === 0 ? agents(0, 50) : [agent(3), agent(900), agent(901)];
    return res(200, { agents: page });
  };
  const r = await M.fetchRelayAgents("http://x", { fetch: f, ...FAST });
  assert.equal(r.count, 52);
  assert.deepEqual(r.agents.slice(-2).map((a) => a.handle), ["a900", "a901"]);
});

test("hard cap of 100 pages", async () => {
  const f = async (url) => { const off = Number(new URL(url).searchParams.get("offset")); return res(200, { agents: agents(off, 50) }); };
  const r = await M.fetchRelayAgents("http://x", { fetch: f, ...FAST });
  assert.equal(r.count, 5000);
});

test("fetchAgents still falls back relay -> snapshot with the old shape", async () => {
  const f = async () => { throw new TypeError("fetch failed"); };
  const r = await M.fetchAgents({ relay: "http://x", fetch: f, snapshot: { fetched_at: "t", agents: agents(0, 3) }, forceLive: true, ...FAST });
  assert.equal(r.source, "snapshot");
  assert.equal(r.count, 3);
  assert.match(r.live_error, /did not answer/);
  const ok = await M.fetchAgents({ relay: "http://x", fetch: fakeRelay(70).fetch, ...FAST });
  assert.deepEqual(Object.keys(ok).sort(), ["agents", "count", "fetched_at", "live_error", "relay", "source"]);
  assert.equal(ok.source, "relay");
});

test("fetchSnapshot shape", async () => {
  const r = await M.fetchSnapshot({ snapshot: { fetched_at: "2026-11-03T20:56:39Z", agents: agents(0, 2) } });
  assert.deepEqual(r, { source: "snapshot", fetched_at: "2026-11-03T20:56:39Z", count: 2, agents: agents(0, 2), relay: null });
});

test("diffAgents: added, removed, delivered, availability", () => {
  const prev = [agent(1), agent(2, { delivered_jobs: 1 }), agent(3, { available_now: null, availability: "available" }), agent(4)];
  const next = [agent(1), agent(2, { delivered_jobs: 3 }), agent(3, { available_now: null, availability: "busy" }), agent(5), agent(4, { available_now: true })];
  assert.deepEqual(M.diffAgents(prev, next), {
    added: ["a5"], removed: [],
    delivered: [{ handle: "a2", from: 1, to: 3 }],
    availability: [{ handle: "a3", from: true, to: false }, { handle: "a4", from: false, to: true }],
  });
  assert.deepEqual(M.diffAgents(next, prev).removed, ["a5"]);
  assert.deepEqual(M.diffAgents([], []), { added: [], removed: [], delivered: [], availability: [] });
});

test("relayCandidates: override, off, localhost, elsewhere", () => {
  assert.deepEqual(M.relayCandidates({ relay: "http://r:1/" }), ["http://r:1"]);
  assert.deepEqual(M.relayCandidates({ relay: "off" }), []);
  assert.deepEqual(M.relayCandidates({ relay: "" }), []);
  assert.deepEqual(M.relayCandidates({}), []); // Node has no window: not a localhost page
  const g = globalThis;
  g.window = g; g.document = { documentElement: { dataset: {} } };
  try {
    g.location = { hostname: "localhost", search: "", origin: "http://localhost:8787" };
    assert.deepEqual(M.relayCandidates(), ["http://127.0.0.1:8788", "http://127.0.0.1:8789", "http://127.0.0.1:8790"]);
    g.location = { hostname: "127.0.0.1", search: "?relay=http://127.0.0.1:9000", origin: "x" };
    assert.deepEqual(M.relayCandidates(), ["http://127.0.0.1:9000"]);
    g.location = { hostname: "127.0.0.1", search: "?relay=off", origin: "x" };
    assert.deepEqual(M.relayCandidates(), []);
    g.location = { hostname: "example.com", search: "", origin: "https://example.com" };
    assert.deepEqual(M.relayCandidates(), []);
    assert.equal(M.resolveRelay(), null);
  } finally { delete g.window; delete g.document; delete g.location; }
});

test("findRelay: first real relay in list order, ignores impostors and failures, never throws", async () => {
  const health = (map) => async (url) => {
    const v = map[url.replace("/health", "")];
    if (v === "throw") throw new TypeError("fetch failed");
    if (v === "hang") return new Promise(() => {});
    return res(200, v);
  };
  const good = { ok: true, service: "agentproof-relay" };
  const opts = (m) => ({ fetch: health(m), timeoutMs: 80 });
  const c = ["http://127.0.0.1:8788", "http://127.0.0.1:8789", "http://127.0.0.1:8790"];
  const withLocal = async (fn) => { const g = globalThis; g.window = g; g.document = { documentElement: { dataset: {} } }; g.location = { hostname: "localhost", search: "" }; try { return await fn(); } finally { delete g.window; delete g.document; delete g.location; } };
  await withLocal(async () => {
    assert.equal(await M.findRelay(opts({ [c[0]]: "throw", [c[1]]: good, [c[2]]: good })), c[1]);
    assert.equal(await M.findRelay(opts({ [c[0]]: { ok: true, service: "other" }, [c[1]]: "hang", [c[2]]: good })), c[2]);
    assert.equal(await M.findRelay(opts({ [c[0]]: "throw", [c[1]]: "throw", [c[2]]: "hang" })), null);
  });
  assert.equal(await M.findRelay({ fetch: health({}), relay: "off" }), null);
});

// ---- real processes -------------------------------------------------------------------------
const relayPath = path.join(root, "scripts/relay.mjs");
const started = [];
function startRelay(port) {
  const p = spawn(process.execPath, [relayPath], { env: { ...process.env, PORT: String(port) }, stdio: ["ignore", "pipe", "pipe"] });
  started.push(p);
  const o = { p, out: "", exited: new Promise((r) => p.on("exit", (code) => r(code))) };
  p.stdout.on("data", (d) => (o.out += d)); p.stderr.on("data", (d) => (o.out += d));
  return o;
}
async function until(o, re, ms = 5000) {
  const t0 = Date.now();
  while (!re.test(o.out)) {
    if (Date.now() - t0 > ms) throw new Error(`timed out waiting for ${re} in:\n${o.out}`);
    await new Promise((r) => setTimeout(r, 30));
  }
}

test("relay process: port walk, /health, all-ports-taken exit 1", async () => {
  const a = startRelay(18788);
  await until(a, /relay on http:\/\/127\.0\.0\.1:18788/);
  const h = await (await fetch("http://127.0.0.1:18788/health")).json();
  assert.equal(h.ok, true); assert.equal(h.service, "agentproof-relay"); assert.equal(h.port, 18788);
  assert.equal(h.upstream, "https://market.near.ai"); assert.equal(h.cache_entries, 0); assert.ok(h.started_at);
  const hr = await fetch("http://127.0.0.1:18788/health");
  assert.equal(hr.headers.get("access-control-allow-origin"), "*");

  const b = startRelay(18788);
  await until(b, /relay on http:\/\/127\.0\.0\.1:18789/);
  assert.match(b.out, /relay: port 18788 is in use \(maybe another relay\)\. Trying 18789\./);
  assert.equal((await (await fetch("http://127.0.0.1:18789/health")).json()).port, 18789);

  const c = startRelay(18788);
  await until(c, /relay on http:\/\/127\.0\.0\.1:18790/);
  assert.match(c.out, /port 18789 is in use .* Trying 18790\./);
  // Only the bound port is announced: a walk must not print the ports it gave up on.
  for (const [o, port] of [[a, 18788], [b, 18789], [c, 18790]]) assert.deepEqual(o.out.match(/relay on \S+/g), [`relay on http://127.0.0.1:${port}`]);

  const d = startRelay(18788);
  assert.equal(await d.exited, 1);
  assert.match(d.out, /relay: ports 18788-18790 are all in use\. Stop the other process or run PORT=<free port> npm run relay, then open the town with \?relay=http:\/\/127\.0\.0\.1:<port>/);
  assert.doesNotMatch(d.out, /at .*\.mjs:\d+/); // no stack trace
});

for (const [name, fn] of tests) {
  try { await fn(); console.log("ok   " + name); } catch (e) { failed++; console.log("FAIL " + name + "\n" + (e && e.stack || e)); }
}
for (const p of started) if (p.exitCode === null) p.kill();
console.log(failed ? `${failed} of ${tests.length} failed` : `all ${tests.length} passed`);
process.exit(failed ? 1 : 0);
