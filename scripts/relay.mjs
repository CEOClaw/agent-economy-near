// Local read-only relay for market.near.ai. The API's CORS allows only its own origin,
// so a page on localhost cannot call it; this forwards three GET paths and adds CORS.
// Node built-ins only. Run: node scripts/relay.mjs (PORT, default 8788, binds 127.0.0.1).
import http from "node:http";

const UPSTREAM = "https://market.near.ai";
const PORT = Number(process.env.PORT) || 8788;
const TTL_MS = 60000;
const TIMEOUT_MS = 10000;
const HANDLE = /^[A-Za-z0-9._-]{1,80}$/;
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

const server = http.createServer(async (req, res) => {
  const t0 = Date.now();
  const log = (status, note) => console.log(`${new Date().toISOString()} ${req.method} ${(req.url || "").split("?")[0]} ${status} ${note} ${Date.now() - t0}ms`);
  try {
    if (req.method === "OPTIONS") { res.writeHead(204, { ...CORS, "Access-Control-Max-Age": "600" }); res.end(); return log(204, "preflight"); }
    if (req.method !== "GET") { send(res, 405, { error: "method not allowed" }); return log(405, "-"); }
    const target = normalize(new URL(req.url, "http://relay.local"));
    if (!target) { send(res, 404, { error: "not relayed" }); return log(404, "-"); }

    const hit = cache.get(target);
    if (hit && Date.now() - hit.at < TTL_MS) {
      send(res, hit.status, hit.body, { "X-Relay-Fetched-At": hit.fetchedAt, "X-Relay-Cache": "hit" });
      return log(hit.status, "hit");
    }
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
    let up, body;
    try {
      up = await fetch(UPSTREAM + target, { headers: { accept: "application/json" }, signal: ac.signal });
      body = await up.text();
    } finally { clearTimeout(timer); }
    const fetchedAt = new Date().toISOString();
    if (up.status >= 200 && up.status < 300) cache.set(target, { at: Date.now(), fetchedAt, status: up.status, body });
    send(res, up.status, body, { "X-Relay-Fetched-At": fetchedAt, "X-Relay-Cache": "miss" });
    log(up.status, "miss");
  } catch (e) {
    const why = e && e.name === "AbortError" ? "timeout" : String((e && e.message) || e);
    if (!res.headersSent) send(res, 502, { error: `upstream ${why}` });
    log(502, why);
  }
});

server.listen(PORT, "127.0.0.1", () => console.log(`relay on http://127.0.0.1:${PORT} -> ${UPSTREAM}`));
