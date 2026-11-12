// Proof portfolio: what the market reports about an agent next to what its
// receipts prove. Works in the browser (window.AgentProofPortfolio) and in Node.
// A receipt is a market job run bundle (job_ref). It counts toward proof only if
// it is one of the site's own runs (data/manifest.json lists it and holds its hash), the checker,
// re-run here, reproduces the stored digest AND the buyer's owner differs from the
// seller's. Owners, seller handle and payout are written inside the file itself, so
// a run from anywhere else (a dropped file, a ?receipts= URL) is unverified: shown
// with its source, never counted, never a failed check against the agent either.
// Reputation needs one more thing: the receipt must be CHECKED BEFORE PAID (src/gate.js): the checker's recommendation for this
// delivery was on chain before the buyer paid. The caller sets receipt.check (gate.attach); without it nothing counts.
// A proven receipt that was not checked before paid is shown as proven, never counted toward reputation.
// Anything the record does not show is null, not 0.
(function (root) {
  const pick = (v) => (v === undefined ? null : v);
  // One owner written two ways ("owner-x", "Owner_X", " owner x ") must stay one owner, so owners
  // compare by letters and digits only. -> the key, or null when nothing is left.
  const ownerKey = (v) => (typeof v === "string" && v.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "")) || null;

  // Re-runs the checker on one run bundle. -> receipt, or null if not a market job.
  // `checker` is src/checker.js. `source` is where the caller loaded the run from:
  // "manifest" only for a run listed in data/manifest.json; anything else is unverified.
  // `admitted` is the bundle_digest the manifest holds for that run: a listed file with any other hash is unverified too.
  async function checkReceipt(run, checker, source, admitted) {
    const ref = run && run.job_ref;
    if (!ref) return null;
    let env = run.envelope || (run.extracted_input && run.extracted_input.envelope);
    if (typeof env === "string") env = JSON.parse(env);
    const out = ref.delivery && ref.delivery.output;
    const stored = pick(ref.delivery && ref.delivery.checker && ref.delivery.checker.evidence_digest);
    const result = env && out ? (await checker.check(env, out)).result : null;
    const owners = run.owners || {};
    const hire = ref.hire || {};
    // Whole-file fingerprint: two copies with one job id but different contents differ here.
    const bundle_digest = await checker.sha256Hex(checker.canonicalJson(run));
    const listed = source === "manifest", trusted = listed && bundle_digest === admitted;
    const src = listed && !trusted ? "a changed copy of a manifest run" : source || "unknown source";
    return {
      source: src,
      trusted,
      bundle_digest,
      id: pick((ref.job && ref.job.id) || (ref.hire && ref.hire.job_id)),
      seller_handle: pick((ref.executor && ref.executor.handle) || (out && out.executor_agent_id)),
      buyer_owner: ownerKey(owners.buyer),
      seller_owner: ownerKey(owners.seller),
      buyer_owner_label: pick(owners.buyer),
      seller_owner_label: pick(owners.seller),
      self_hire: run.self_hire === true,
      outcome: result ? result.outcome : null,
      failure_reason: result ? pick(result.failure_reason || result.blocked_reason) : null,
      stored_digest: stored,
      recomputed_digest: result ? pick(result.evidence_digest) : null,
      reproduced: !!(result && stored && result.evidence_digest === stored),
      checker_version: checker.CHECKER_REF,
      delivery_digest: out ? await checker.sha256Hex(checker.canonicalJson(out)) : null,
      accepted_at: pick(hire.accepted_at),
      market_accepted: hire.state === "accepted" || hire.market_status === "accepted",
      verified_at: pick((ref.hire && ref.hire.accepted_at) || (ref.delivery && ref.delivery.checker && ref.delivery.checker.judged_at)),
      payout_usdc: run.settlement_observed && run.settlement_observed.payout_usdc != null ? Number(run.settlement_observed.payout_usdc) : null,
    };
  }

  const crossOwner = (r) => !r.self_hire && r.buyer_owner != null && r.seller_owner != null && r.buyer_owner !== r.seller_owner;
  // proven = the old rule: a site run, reproduced, pass, two owners. counts = proven AND checked before paid (reputation).
  const proven = (r) => r.trusted === true && r.reproduced && r.outcome === "pass" && crossOwner(r);
  const counts = (r) => proven(r) && !!r.check && r.check.counted === true;
  const day = (iso) => iso.slice(0, 10);

  // Consecutive UTC days with at least one counted receipt, ending on the latest one.
  function streak(isoTimes) {
    const days = new Set(isoTimes.map(day));
    let n = 0;
    for (let d = new Date(day(isoTimes.sort().at(-1)) + "T00:00:00Z"); days.has(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() - 1)) n++;
    return n;
  }

  function buildPortfolio(handle, marketAgent, receipts) {
    const all = (receipts || []).filter((r) => r && r.seller_handle === handle);
    const mine = all.filter((r) => r.trusted === true), unverified = all.filter((r) => r.trusted !== true);
    const pv = mine.filter(proven), ok = mine.filter(counts);
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
        checked_before_paid: ok.length,
        proven_receipts: pv.length,
        distinct_owners: new Set(ok.map((r) => r.buyer_owner)).size,
        earned_usdc: ok.length === 0 || ok.some((r) => r.payout_usdc == null) ? null : Math.round(ok.reduce((s, r) => s + r.payout_usdc, 0) * 1e6) / 1e6,
        failed_checks: mine.filter((r) => (r.outcome != null && r.outcome !== "pass") || (r.stored_digest != null && !r.reproduced)).length,
        self_hires: mine.filter((r) => r.self_hire).map((r) => r.id),
        last_verified_at: times.length ? times.sort().at(-1) : null,
        streak_days: times.length ? streak(times) : 0,
        unverified: unverified.length,
        overrides: mine.filter((r) => r.check && (r.check.state === "accepted_although_failed" || r.check.state === "sent_back_although_passed")).map((r) => ({ id: r.id, state: r.check.state })),
      },
      receipts: mine.map((r) => r.id),
      unverified: unverified.map((r) => ({ id: r.id, source: r.source })),
    };
  }

  const api = { checkReceipt, buildPortfolio, counts, proven, ownerKey };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AgentProofPortfolio = api;
})(typeof window !== "undefined" ? window : globalThis);
