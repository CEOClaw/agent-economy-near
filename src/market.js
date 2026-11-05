// Read-only client for NEAR's public Agent Market API (market.near.ai, no login).
// Works in the browser (window.AgentProofMarket) and in Node (module.exports).
// The API only allows the market.near.ai origin (CORS), so a browser elsewhere
// falls back to data/market-snapshot.json, written by scripts/market-snapshot.mjs.
// Fields the API does not send stay null; nothing here invents a value.
(function (root) {
  const API = "https://market.near.ai/v1";
  const PAGE = 50;
  const MARKET_ORIGIN = "https://market.near.ai";

  const pick = (v) => (v === undefined ? null : v);
  // currentScript is only set while this file runs, so grab it now for data-relay.
  const selfScript = typeof document !== "undefined" ? document.currentScript : null;
  const clean = (u) => String(u).replace(/\/+$/, "");
  const LOCAL = ["localhost", "127.0.0.1", "[::1]", "::1"];

  // Explicit relay choice, if any. -> undefined (no choice), null (off), or a URL string.
  function explicitRelay(opts = {}) {
    const norm = (v) => (v == null || v === "" || v === "off" ? null : clean(v));
    if (typeof opts.relay === "string") return norm(opts.relay);
    if (typeof window === "undefined" || !root.location) return undefined;
    const q = new URLSearchParams(root.location.search).get("relay");
    if (q !== null) return norm(q);
    const attr = (document.documentElement.dataset.relay) || (selfScript && selfScript.dataset.relay);
    if (attr) return norm(attr);
    if (typeof root.AGENTPROOF_RELAY === "string" && root.AGENTPROOF_RELAY) return norm(root.AGENTPROOF_RELAY);
    return undefined;
  }
  const isLocal = () => typeof window !== "undefined" && !!root.location && LOCAL.includes(root.location.hostname);
  // scripts/relay.mjs walks 8788 -> 8790 when a port is taken, so a local page tries all three.
  const LOCAL_RELAYS = ["http://127.0.0.1:8788", "http://127.0.0.1:8789", "http://127.0.0.1:8790"];

  // The relay (scripts/relay.mjs) is the only way a page off market.near.ai reads the live API.
  // -> URL string without trailing slash, or null.
  function resolveRelay(opts = {}) {
    const e = explicitRelay(opts);
    if (e !== undefined) return e;
    return isLocal() ? LOCAL_RELAYS[0] : null;
  }

  // -> relay URLs worth probing: the explicit choice alone, else the local trio on localhost, else none.
  function relayCandidates(opts = {}) {
    const e = explicitRelay(opts);
    if (e !== undefined) return e ? [e] : [];
    return isLocal() ? LOCAL_RELAYS.slice() : [];
  }

  const bound = (f) => f || root.fetch.bind(root);
  // fetch + deadline; the race also covers a fetch that ignores its abort signal.
  async function fetchWithTimeout(f, url, ms) {
    const ac = new AbortController();
    let timer;
    const dead = new Promise((_, rej) => { timer = setTimeout(() => { ac.abort(); rej(new Error("timeout")); }, ms); });
    try {
      return await Promise.race([f(url, { headers: { accept: "application/json" }, signal: ac.signal }), dead]);
    } finally { clearTimeout(timer); }
  }

  // Probes /health on the first candidate, then the rest at once only if it misses: each refused
  // probe prints a network line in the browser console, and the relay almost always sits on the first.
  // The first one in list order that is a real relay wins. -> URL or null. Never throws.
  async function findRelay(opts = {}) {
    const f = bound(opts.fetch);
    const ms = opts.timeoutMs || 1500;
    const probe = async (c) => {
      try {
        const r = await fetchWithTimeout(f, `${c}/health`, ms);
        if (!r.ok) return null;
        const j = await r.json();
        return j && j.ok === true && j.service === "agentproof-relay" ? c : null;
      } catch (e) { return null; }
    };
    const [first, ...rest] = relayCandidates(opts);
    if (!first) return null;
    if (await probe(first)) return first;
    const probes = rest.map(probe);
    for (const p of probes) { const hit = await p; if (hit) return hit; }
    return null;
  }

  // One cheap GET; true when the relay answers 2xx within 2 s.
  async function probeRelay(url, opts = {}) {
    const f = bound(opts.fetch);
    try {
      return (await fetchWithTimeout(f, `${clean(url)}/v1/agents?limit=1&offset=0`, 2000)).ok;
    } catch (e) {
      return false;
    }
  }

  // The bundled snapshot, labelled as one. Node passes the parsed file as opts.snapshot.
  async function fetchSnapshot(opts = {}) {
    let snap = opts.snapshot;
    if (!snap) {
      if (typeof window === "undefined" && !opts.fetch) throw new Error("no snapshot given");
      snap = await getJson(opts.snapshotUrl || "data/market-snapshot.json", bound(opts.fetch));
    }
    const agents = Array.isArray(snap.agents) ? snap.agents : [];
    return { source: "snapshot", fetched_at: pick(snap.fetched_at), count: agents.length, agents, relay: null };
  }

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const RETRY_STATUS = (s) => s === 429 || s >= 500;

  // One page with a deadline and up to 2 retries (network error, timeout, 5xx, 429 only).
  async function fetchPage(f, url, opts) {
    const delays = opts.backoffMs || [400, 1200];
    let why = "";
    for (let i = 0; i <= delays.length; i++) {
      try {
        const r = await fetchWithTimeout(f, url, opts.timeoutMs || 8000);
        if (r.ok) return { page: (await r.json()).agents || [], at: r.headers.get("X-Relay-Fetched-At") };
        why = `HTTP ${r.status}`;
        if (!RETRY_STATUS(r.status)) break;
      } catch (e) {
        why = e && e.message === "timeout" ? "timed out" : String((e && e.message) || e);
      }
      if (i < delays.length) await wait(delays[i]);
    }
    throw new Error(why);
  }

  // Pages the relay in parallel batches. fetched_at is the oldest cached page, not "now".
  async function fetchRelayAgents(relay, opts = {}) {
    const f = bound(opts.fetch);
    const conc = Math.max(1, opts.concurrency || 4);
    const MAX_PAGES = 100;
    const seen = new Set(), agents = [];
    let oldest = null, done = false;
    try {
      for (let k = 0; !done && k < MAX_PAGES; k += conc) {
        const ks = [];
        for (let j = k; j < Math.min(k + conc, MAX_PAGES); j++) ks.push(j);
        const got = await Promise.all(ks.map((j) => fetchPage(f, `${relay}/v1/agents?limit=${PAGE}&offset=${j * PAGE}`, opts)));
        for (const { page, at } of got) {
          if (at && (!oldest || Date.parse(at) < Date.parse(oldest))) oldest = at;
          if (page.length < PAGE) done = true;
          for (const a of page) {
            const n = normalizeAgent(a);
            if (n.handle != null && seen.has(n.handle)) continue;
            if (n.handle != null) seen.add(n.handle);
            agents.push(n);
          }
        }
      }
    } catch (e) {
      throw new Error(`The relay at ${relay} did not answer (${String((e && e.message) || e)}).`);
    }
    return { source: "relay", fetched_at: oldest || new Date().toISOString(), count: agents.length, agents, relay };
  }

  const isOn = (a) => (a.available_now != null ? !!a.available_now : ["available", "available_now"].includes(a.availability));

  // What changed between two agent lists, by handle. Pure.
  function diffAgents(prev, next) {
    const before = new Map((prev || []).map((a) => [a.handle, a]));
    const after = new Map((next || []).map((a) => [a.handle, a]));
    const out = { added: [], removed: [], delivered: [], availability: [] };
    for (const [h, n] of after) {
      const p = before.get(h);
      if (!p) { out.added.push(h); continue; }
      const from = p.delivered_jobs || 0, to = n.delivered_jobs || 0;
      if (from !== to) out.delivered.push({ handle: h, from, to });
      if (isOn(p) !== isOn(n)) out.availability.push({ handle: h, from: isOn(p), to: isOn(n) });
    }
    for (const h of before.keys()) if (!after.has(h)) out.removed.push(h);
    return out;
  }

  // Only these fields leave this module: no agent ids, owner or builder account ids.
  function normalizeAgent(a) {
    const b = a.builder || null;
    return {
      handle: pick(a.handle),
      name: pick(a.name),
      category: pick(a.category),
      tags: Array.isArray(a.tags) ? a.tags : null,
      delivered_jobs: pick(a.delivered_jobs),
      success_rate: pick(a.success_rate),
      response_time_seconds_median: pick(a.response_time_seconds_median),
      availability: pick(a.availability),
      available_now: pick(a.available_now),
      builder: b ? { display_name: pick(b.display_name), verification: pick(b.verification) } : null,
      payable_with: Array.isArray(a.payable_with) ? a.payable_with : null,
    };
  }

  async function getJson(url, fetchImpl) {
    const r = await fetchImpl(url, { headers: { accept: "application/json" } });
    if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
    return r.json();
  }

  // Pages /v1/agents until a page comes back empty.
  async function fetchLiveAgents(opts = {}) {
    const f = opts.fetch || root.fetch.bind(root);
    const agents = [];
    for (let offset = 0; ; offset += PAGE) {
      const page = (await getJson(`${API}/agents?limit=${PAGE}&offset=${offset}`, f)).agents || [];
      if (!page.length) break;
      agents.push(...page.map(normalizeAgent));
      if (offset > 100000) throw new Error("agents pager did not end");
    }
    return agents;
  }

  // Relay first (when one resolves), then live, then the snapshot, labelled as one.
  // -> { source: "relay" | "live" | "snapshot", fetched_at, count, agents, live_error, relay }
  // A page on any other origin skips the live call: the browser would block it and log a CORS error.
  async function fetchAgents(opts = {}) {
    const relay = resolveRelay(opts);
    let relayError = null;
    if (relay) {
      try {
        // One cheap /health first: paging a dead relay with retries prints a dozen refused lines in the console.
        if (!(await findRelay({ ...opts, relay }))) throw new Error(`The relay at ${relay} did not answer (no /health reply).`);
        const r = await fetchRelayAgents(relay, opts);
        return { source: "relay", fetched_at: r.fetched_at, count: r.agents.length, agents: r.agents, live_error: null, relay };
      } catch (e) {
        relayError = String(e && e.message || e);
      }
    }
    try {
      const blocked = typeof window !== "undefined" && root.location && root.location.origin !== MARKET_ORIGIN && !opts.forceLive;
      if (blocked) throw new Error(`CORS: the API allows only ${MARKET_ORIGIN}, this page is ${root.location.origin}`);
      const agents = await fetchLiveAgents(opts);
      return { source: "live", fetched_at: new Date().toISOString(), count: agents.length, agents, live_error: null, relay: null };
    } catch (e) {
      // Node passes the parsed file as opts.snapshot; a page fetches it by URL.
      const inPage = typeof window !== "undefined";
      const snap = opts.snapshot || (inPage
        ? await getJson(opts.snapshotUrl || "data/market-snapshot.json", opts.fetch || root.fetch.bind(root))
        : null);
      if (!snap) throw e;
      const why = String(e && e.message || e);
      return { source: "snapshot", fetched_at: pick(snap.fetched_at), count: snap.agents.length, agents: snap.agents, live_error: relayError ? `${relayError}; ${why}` : why, relay: null };
    }
  }

  // -> { total, stats, reviews } as the API sends them; missing parts are null.
  async function fetchReviews(handle, opts = {}) {
    const f = opts.fetch || root.fetch.bind(root);
    const relay = resolveRelay(opts);
    const o = await getJson(`${relay ? relay + "/v1" : API}/agents/${encodeURIComponent(handle)}/reviews`, f);
    return { total: pick(o.total), stats: pick(o.stats), reviews: Array.isArray(o.reviews) ? o.reviews : null };
  }

  const api = { API, normalizeAgent, fetchLiveAgents, fetchAgents, fetchReviews, resolveRelay, probeRelay, relayCandidates, findRelay, fetchSnapshot, fetchRelayAgents, diffAgents };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AgentProofMarket = api;
})(typeof window !== "undefined" ? window : globalThis);
