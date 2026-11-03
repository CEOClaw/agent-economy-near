// Proof portfolio: what the market reports about an agent next to what its
// receipts prove. Works in the browser (window.AgentProofPortfolio) and in Node.
// A receipt is a market job run bundle (job_ref). It counts toward proof only if
// the checker, re-run here, reproduces the stored digest AND the buyer's owner
// differs from the seller's. Anything the record does not show is null, not 0.
(function (root) {
  const pick = (v) => (v === undefined ? null : v);

  // Re-runs the checker on one run bundle. -> receipt, or null if not a market job.
  // `checker` is src/checker.js. Only receipts made here are trusted by buildPortfolio.
  async function checkReceipt(run, checker) {
    const ref = run && run.job_ref;
    if (!ref) return null;
    let env = run.envelope || (run.extracted_input && run.extracted_input.envelope);
    if (typeof env === "string") env = JSON.parse(env);
    const out = ref.delivery && ref.delivery.output;
    const stored = pick(ref.delivery && ref.delivery.checker && ref.delivery.checker.evidence_digest);
    const result = env && out ? (await checker.check(env, out)).result : null;
    const owners = run.owners || {};
    return {
      id: pick((ref.job && ref.job.id) || (ref.hire && ref.hire.job_id)),
      seller_handle: pick((ref.executor && ref.executor.handle) || (out && out.executor_agent_id)),
      buyer_owner: pick(owners.buyer),
      seller_owner: pick(owners.seller),
      self_hire: run.self_hire === true,
      outcome: result ? result.outcome : null,
      stored_digest: stored,
      recomputed_digest: result ? pick(result.evidence_digest) : null,
      reproduced: !!(result && stored && result.evidence_digest === stored),
      verified_at: pick((ref.hire && ref.hire.accepted_at) || (ref.delivery && ref.delivery.checker && ref.delivery.checker.judged_at)),
      payout_usdc: run.settlement_observed && run.settlement_observed.payout_usdc != null ? Number(run.settlement_observed.payout_usdc) : null,
    };
  }

  const crossOwner = (r) => !r.self_hire && r.buyer_owner != null && r.seller_owner != null && r.buyer_owner !== r.seller_owner;
  const counts = (r) => r.reproduced && r.outcome === "pass" && crossOwner(r);
  const day = (iso) => iso.slice(0, 10);

  // Consecutive UTC days with at least one counted receipt, ending on the latest one.
  function streak(isoTimes) {
    const days = new Set(isoTimes.map(day));
    let n = 0;
    for (let d = new Date(day(isoTimes.sort().at(-1)) + "T00:00:00Z"); days.has(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() - 1)) n++;
    return n;
  }

  function buildPortfolio(handle, marketAgent, receipts) {
    const mine = (receipts || []).filter((r) => r && r.seller_handle === handle);
    const ok = mine.filter(counts);
    const times = ok.map((r) => r.verified_at).filter(Boolean);
    const m = marketAgent || {};
    return {
      handle,
      market: {
        delivered_jobs: pick(m.delivered_jobs),
        success_rate: pick(m.success_rate),
        median_s: pick(m.response_time_seconds_median),
      },
      proof: {
        verified_jobs: ok.length,
        distinct_owners: new Set(ok.map((r) => r.buyer_owner)).size,
        earned_usdc: ok.some((r) => r.payout_usdc == null) ? null : Math.round(ok.reduce((s, r) => s + r.payout_usdc, 0) * 1e6) / 1e6,
        failed_checks: mine.filter((r) => (r.outcome != null && r.outcome !== "pass") || (r.stored_digest != null && !r.reproduced)).length,
        self_hires: mine.filter((r) => r.self_hire).map((r) => r.id),
        last_verified_at: times.length ? times.sort().at(-1) : null,
        streak_days: times.length ? streak(times) : 0,
      },
      receipts: mine.map((r) => r.id),
    };
  }

  const api = { checkReceipt, buildPortfolio };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AgentProofPortfolio = api;
})(typeof window !== "undefined" ? window : globalThis);
