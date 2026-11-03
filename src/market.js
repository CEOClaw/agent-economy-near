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

  // Live first. On failure (CORS in a browser, offline), the snapshot, labelled as one.
  // -> { source: "live" | "snapshot", fetched_at, count, agents, live_error }
  // A page on any other origin skips the live call: the browser would block it and log a CORS error.
  async function fetchAgents(opts = {}) {
    try {
      const blocked = typeof window !== "undefined" && root.location && root.location.origin !== MARKET_ORIGIN && !opts.forceLive;
      if (blocked) throw new Error(`CORS: the API allows only ${MARKET_ORIGIN}, this page is ${root.location.origin}`);
      const agents = await fetchLiveAgents(opts);
      return { source: "live", fetched_at: new Date().toISOString(), count: agents.length, agents, live_error: null };
    } catch (e) {
      // Node passes the parsed file as opts.snapshot; a page fetches it by URL.
      const inPage = typeof window !== "undefined";
      const snap = opts.snapshot || (inPage
        ? await getJson(opts.snapshotUrl || "data/market-snapshot.json", opts.fetch || root.fetch.bind(root))
        : null);
      if (!snap) throw e;
      return { source: "snapshot", fetched_at: pick(snap.fetched_at), count: snap.agents.length, agents: snap.agents, live_error: String(e && e.message || e) };
    }
  }

  // -> { total, stats, reviews } as the API sends them; missing parts are null.
  async function fetchReviews(handle, opts = {}) {
    const f = opts.fetch || root.fetch.bind(root);
    const o = await getJson(`${API}/agents/${encodeURIComponent(handle)}/reviews`, f);
    return { total: pick(o.total), stats: pick(o.stats), reviews: Array.isArray(o.reviews) ? o.reviews : null };
  }

  const api = { API, normalizeAgent, fetchLiveAgents, fetchAgents, fetchReviews };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AgentProofMarket = api;
})(typeof window !== "undefined" ? window : globalThis);
