// Reads receipt anchors from the NEAR testnet contract in data/anchors.json, by a plain JSON-RPC
// view call (no key, no library). Works in the browser (window.AgentProofAnchors) and in Node.
// The chain is the evidence; the snapshot in data/anchors.json only says where to look and what it saw.
(function (root) {
  const b64 = (s) => { const bytes = new TextEncoder().encode(s); let bin = ""; for (const b of bytes) bin += String.fromCharCode(b); return btoa(bin); };
  const HEX64 = /^[0-9a-f]{64}$/;

  // The contract promises exactly this shape; anything else is a bad response, never a "missing".
  function validRecord(r, jobId) {
    return !!r && typeof r === "object" && r.job_id === jobId && HEX64.test(r.digest) && typeof r.checker_version === "string"
      && Number.isSafeInteger(r.block_height) && Number.isSafeInteger(r.block_timestamp_ms);
  }

  // One RPC. Throws on network error / timeout (-> unreachable), returns {bad:true} on a reply that is not a view result.
  async function viewOnce(url, contract, jobId, fetchImpl, timeoutMs) {
    const ctl = typeof AbortController === "function" ? new AbortController() : null;
    let timer;
    const timeout = new Promise((_, rej) => { timer = setTimeout(() => { if (ctl) ctl.abort(); rej(new Error("timeout")); }, timeoutMs); });
    try {
      const call = (async () => {
        const res = await fetchImpl(url, {
          method: "POST", headers: { "content-type": "application/json" }, signal: ctl ? ctl.signal : undefined,
          body: JSON.stringify({ jsonrpc: "2.0", id: "anchor", method: "query", params: { request_type: "call_function", finality: "final", account_id: contract, method_name: "get", args_base64: b64(JSON.stringify({ job_id: jobId })) } }),
        });
        if (!res || !res.ok) return { bad: true };
        let body; try { body = await res.json(); } catch { return { bad: true }; }
        const bytes = body && body.result && body.result.result;
        if (!Array.isArray(bytes) || body.result.error || !bytes.every((n) => Number.isInteger(n) && n >= 0 && n < 256)) return { bad: true };
        let parsed; try { parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(bytes))); } catch { return { bad: true }; }
        if (parsed === null) return { record: null };
        return validRecord(parsed, jobId) ? { record: parsed } : { bad: true };
      })();
      return await Promise.race([call, timeout]);
    } finally { clearTimeout(timer); }
  }

  // -> { ok: true, rpc, record | null } from the first RPC that answers, or { ok: false, reason: "unreachable" | "bad response" }.
  async function viewAnchor(snapshot, jobId, fetchImpl, timeoutMs = 6000) {
    let reason = "unreachable";
    for (const rpc of (snapshot && snapshot.rpc) || []) {
      try {
        const r = await viewOnce(rpc, snapshot.contract, jobId, fetchImpl, timeoutMs);
        if (r.bad) { reason = "bad response"; continue; }
        return { ok: true, rpc, record: r.record };
      } catch { /* network error or timeout: try the next RPC */ }
    }
    return { ok: false, reason };
  }

  // On-chain record vs the digest this page just recomputed from the receipt.
  const compareAnchor = (record, recomputedDigest) => (record == null ? "missing" : record.digest === recomputedDigest ? "match" : "mismatch");
  const txUrl = (snapshot, tx) => `${snapshot.explorer}/txns/${tx}`;
  const accountUrl = (snapshot) => `${snapshot.explorer}/address/${snapshot.contract}`;

  const api = { viewAnchor, compareAnchor, txUrl, accountUrl };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AgentProofAnchors = api;
})(typeof window !== "undefined" ? window : globalThis);
