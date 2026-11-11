// Local read-only relay for market.near.ai. The API's CORS allows only its own origin,
// so a page on localhost cannot call it; this forwards three GET paths and adds CORS.
// Node built-ins only. Run: node scripts/relay.mjs (PORT, default 8788, binds 127.0.0.1).
import http from "node:http";

const UPSTREAM = "https://market.near.ai";
const PORT = Number(process.env.PORT) || 8788;
const TTL_MS = 60000;
const TIMEOUT_MS = 10000;
const HANDLE = /^[A-Za-z0-9._-]{1,80}$/;
const STARTED = new Date().toISOString();
let boundPort = PORT;
const cache = new Map(); // normalized url -> { at, fetchedAt, status, body }

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Expose-Headers": "X-Relay-Fetched-At, X-Relay-Cache",
};

function send(res, status, body, extra = {}) {
  res.writeHead(status, { ...CORS, "Content-Type": "application/json", ...extra });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

// -> normalized upstream path+query, or null when the path is not relayed.
function normalize(u) {
  const p = u.pathname.replace(/\/+$/, "");
  if (p === "/v1/agents") {
    const q = new URLSearchParams();
    for (const k of ["limit", "offset"]) {
      const v = u.searchParams.get(k);
      if (v === null || !/^\d{1,9}$/.test(v)) continue;
      q.set(k, k === "limit" ? String(Math.min(100, Math.max(1, Number(v)))) : String(Number(v)));
    }
    const s = q.toString();
    return p + (s ? "?" + s : "");
  }
  const m = p.match(/^\/v1\/agents\/([^/]+)(\/reviews)?$/);
  if (m && HANDLE.test(m[1])) return p;
  return null;
}

// One retry on a network error, timeout or 5xx before giving up.
async function fetchUpstream(target) {
  let last;
  for (let i = 0; i < 2; i++) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
    try {
      const up = await fetch(UPSTREAM + target, { headers: { accept: "application/json" }, signal: ac.signal });
      const body = await up.text();
      if (up.status < 500 || i === 1) return { up, body };
      last = new Error(`HTTP ${up.status}`);
    } catch (e) { last = e; } finally { clearTimeout(timer); }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw last;
}

const server = http.createServer(async (req, res) => {
  const t0 = Date.now();
  const log = (status, note) => console.log(`${new Date().toISOString()} ${req.method} ${(req.url || "").split("?")[0]} ${status} ${note} ${Date.now() - t0}ms`);
  try {
    if (req.method === "OPTIONS") { res.writeHead(204, { ...CORS, "Access-Control-Max-Age": "600" }); res.end(); return log(204, "preflight"); }
    if (req.method === "GET" && new URL(req.url, "http://relay.local").pathname === "/health") {
      send(res, 200, { ok: true, service: "agentproof-relay", port: boundPort, upstream: UPSTREAM, started_at: STARTED, cache_entries: cache.size });
      return log(200, "health");
    }
    if (req.method !== "GET") { send(res, 405, { error: "method not allowed" }); return log(405, "-"); }
    const target = normalize(new URL(req.url, "http://relay.local"));
    if (!target) { send(res, 404, { error: "not relayed" }); return log(404, "-"); }

    const hit = cache.get(target);
    if (hit && Date.now() - hit.at < TTL_MS) {
      send(res, hit.status, hit.body, { "X-Relay-Fetched-At": hit.fetchedAt, "X-Relay-Cache": "hit" });
      return log(hit.status, "hit");
    }
    let up, body;
    try {
      ({ up, body } = await fetchUpstream(target));
    } catch (e) {
      // Serve what we last had rather than a blank town when the upstream is down.
      if (hit) {
        send(res, hit.status, hit.body, { "X-Relay-Fetched-At": hit.fetchedAt, "X-Relay-Cache": "stale" });
        return log(hit.status, "stale");
      }
      throw e;
    }
    const fetchedAt = new Date().toISOString();
    if (up.status >= 200 && up.status < 300) cache.set(target, { at: Date.now(), fetchedAt, status: up.status, body });
    else if (hit && up.status >= 500) {
      send(res, hit.status, hit.body, { "X-Relay-Fetched-At": hit.fetchedAt, "X-Relay-Cache": "stale" });
      return log(hit.status, "stale");
    }
    send(res, up.status, body, { "X-Relay-Fetched-At": fetchedAt, "X-Relay-Cache": "miss" });
    log(up.status, "miss");
  } catch (e) {
    const why = e && e.name === "AbortError" ? "timeout" : String((e && e.message) || e);
    if (!res.headersSent) send(res, 502, { error: `upstream ${why}` });
    log(502, why);
  }
});

// Walk PORT, PORT+1, PORT+2 so a second relay (or a stale one) does not crash with a stack trace.
const LAST = PORT + 2;
// One "listening" handler for the whole walk: server.listen(port, host, cb) would add a callback per try,
// and the failed tries' callbacks would all fire on the final bind, announcing ports it is not on.
let trying = PORT;
function onError(e) {
  if (e.code !== "EADDRINUSE") { console.error(`relay: could not start (${e.message})`); process.exit(1); }
  if (trying < LAST) {
    console.log(`relay: port ${trying} is in use (maybe another relay). Trying ${trying + 1}.`);
    return listen(trying + 1);
  }
  console.log(`relay: ports ${PORT}-${LAST} are all in use. Stop the other process or run PORT=<free port> npm run relay, then open the town with ?relay=http://127.0.0.1:<port>`);
  process.exit(1);
}
server.on("error", onError);
server.once("listening", () => {
  server.off("error", onError);
  boundPort = server.address().port;
  console.log(`relay on http://127.0.0.1:${boundPort} -> ${UPSTREAM}`);
});
function listen(port) { trying = port; server.listen(port, "127.0.0.1"); }
listen(PORT);
