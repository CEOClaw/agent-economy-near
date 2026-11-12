// Reads gate decisions from the NEAR testnet contract in data/decisions.json, by a plain JSON-RPC
// `get_decisions` view call (no key, no library). Works in the browser (window.AgentProofDecisions) and in Node.
// Same robustness as anchors.js: unreachable (network) is told apart from a bad response, and both from "no decisions" ([]).
(function (root) {
  const b64 = (s) => { const bytes = new TextEncoder().encode(s); let bin = ""; for (const b of bytes) bin += String.fromCharCode(b); return btoa(bin); };
  const HEX64 = /^[0-9a-f]{64}$/, ENUM = { verdict: ["pass", "fail", "blocked"], action: ["accept", "request_changes", "cancel", "none"] };
  const str = (v) => typeof v === "string" && v.length > 0;

  // The contract promises exactly this shape; anything else is a bad response, never "no decisions".
  function validDecision(r, jobId, n) {
    return !!r && typeof r === "object" && r.job_id === jobId && r.n === n && HEX64.test(r.delivery_digest) && str(r.checker_version)
      && ENUM.verdict.includes(r.verdict) && ENUM.action.includes(r.action) && str(r.buyer_owner) && str(r.seller_owner)
      && Number.isSafeInteger(r.block_height) && Number.isSafeInteger(r.block_timestamp_ms);
  }

  async function viewOnce(url, contract, jobId, fetchImpl, timeoutMs) {
    const ctl = typeof AbortController === "function" ? new AbortController() : null;
    let timer;
    const timeout = new Promise((_, rej) => { timer = setTimeout(() => { if (ctl) ctl.abort(); rej(new Error("timeout")); }, timeoutMs); });
    try {
      const call = (async () => {
        const res = await fetchImpl(url, {
          method: "POST", headers: { "content-type": "application/json" }, signal: ctl ? ctl.signal : undefined,
          body: JSON.stringify({ jsonrpc: "2.0", id: "decisions", method: "query", params: { request_type: "call_function", finality: "final", account_id: contract, method_name: "get_decisions", args_base64: b64(JSON.stringify({ job_id: jobId })) } }),
        });
        if (!res || !res.ok) return { bad: true };
        let body; try { body = await res.json(); } catch { return { bad: true }; }
        const bytes = body && body.result && body.result.result;
        if (!Array.isArray(bytes) || body.result.error || !bytes.every((n) => Number.isInteger(n) && n >= 0 && n < 256)) return { bad: true };
        let parsed; try { parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(bytes))); } catch { return { bad: true }; }
        return Array.isArray(parsed) && parsed.every((d, i) => validDecision(d, jobId, i)) ? { decisions: parsed } : { bad: true };
      })();
      return await Promise.race([call, timeout]);
    } finally { clearTimeout(timer); }
  }

  // -> { ok: true, rpc, decisions } (oldest first, [] when none) from the first RPC that answers, or { ok: false, reason: "unreachable" | "bad response" }.
  // A contract without get_decisions (not yet redeployed) answers with an error result: that is a bad response, not [].
  async function viewDecisions(snapshot, jobId, fetchImpl, timeoutMs = 6000) {
    let reason = "unreachable";
    for (const rpc of (snapshot && snapshot.rpc) || []) {
      try {
        const r = await viewOnce(rpc, snapshot.contract, jobId, fetchImpl, timeoutMs);
        if (r.bad) { reason = "bad response"; continue; }
        return { ok: true, rpc, decisions: r.decisions };
      } catch { /* network error or timeout: try the next RPC */ }
    }
    return { ok: false, reason };
  }

  // The chain's decision for exactly this delivery, or null.
  const decisionForDigest = (decisions, digest) => (decisions || []).find((d) => d.delivery_digest === digest) || null;
  // Every field the gate relies on; a snapshot entry matches the chain only when all are equal.
  const RECORD_KEYS = ["job_id", "n", "delivery_digest", "checker_version", "verdict", "action", "buyer_owner", "seller_owner", "block_timestamp_ms"];
  const sameRecord = (a, b) => !!a && !!b && RECORD_KEYS.every((k) => a[k] === b[k]);
  // Sets live_verified on each snapshot entry: true only when get_decisions just returned a record equal to it.
  async function verifyEntries(snapshot, entries, fetchImpl) {
    const chain = new Map();
    for (const e of entries) if (e.status !== "dry-run" && !chain.has(e.job_id)) chain.set(e.job_id, await viewDecisions(snapshot, e.job_id, fetchImpl));
    return entries.map((e) => { const v = chain.get(e.job_id); return v && v.ok && v.decisions.some((c) => sameRecord(c, e)) ? { ...e, live_verified: true } : e; });
  }
  const txUrl = (snapshot, tx) => `${snapshot.explorer}/txns/${tx}`;

  const api = { viewDecisions, decisionForDigest, sameRecord, verifyEntries, validDecision, txUrl };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AgentProofDecisions = api;
})(typeof window !== "undefined" ? window : globalThis);
