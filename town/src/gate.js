// The check-before-you-pay logic: what the checker's verdict recommends (the buyer decides by hand on the market), the per-field
// checklist, and whether a job was really CHECKED BEFORE PAID (its recommendation was on chain before the buyer paid). Works in the browser
// (window.AgentProofGate) and in Node. Pure: no network, the callers pass the checker, the portfolio module and the decisions.
(function (root) {
  const HEX64 = /^[0-9a-f]{64}$/, JOB = /^[0-9a-f-]{1,64}$/, VERSION = /^[A-Za-z0-9._:-]{1,64}$/, OWNER = /^[a-z0-9]{1,64}$/;
  // The rule the contract enforces on chain: which actions a verdict allows. The first one is what the checker recommends.
  const PAIRS = { pass: ["accept"], fail: ["request_changes", "cancel"], blocked: ["none", "cancel"] };
  // ACTION = the RECOMMENDED action per verdict. Nothing here moves money.
  const ACTION = { pass: "accept", fail: "request_changes", blocked: "none" };
  const SETTLED_MARKET = ["accepted", "completed", "cancelled", "canceled", "refunded"];

  const envelopeOf = (run) => {
    let env = run.envelope || (run.extracted_input && run.extracted_input.envelope);
    if (typeof env === "string") env = JSON.parse(env);
    return env;
  };
  // A market bundle keeps the delivery under job_ref; a fixture or an outside hire before its bundle exists, at the top.
  const deliveryOf = (run) => (run.job_ref ? run.job_ref.delivery && run.job_ref.delivery.output : run.delivery);
  const jobIdOf = (run) => (run.job_ref && ((run.job_ref.job && run.job_ref.job.id) || (run.job_ref.hire && run.job_ref.hire.job_id))) || run.job_id || null;

  // The checker's per-field view of one delivery. `checkOut` is checker.check()'s return ({result, steps, fieldResults}).
  // -> [{ item, ok: true|false|null, note: string|null }]   null = not checked
  function checklist(envelope, checkOut) {
    const required = (envelope && envelope.required_fields) || [], result = checkOut.result, fr = checkOut.fieldResults;
    const reason = result.failure_reason || result.blocked_reason || null;
    if (!fr) {
      const rows = [{ item: "delivery shape", ok: result.outcome === "blocked" ? null : false, note: reason }];
      for (const f of required) rows.push({ item: f, ok: null, note: null });
      rows.push({ item: "no extra fields", ok: null, note: null });
      return rows;
    }
    const rows = required.map((f) => {
      const r = fr.find((x) => x.f === f);
      return { item: f, ok: r ? r.ok : null, note: r && !r.ok ? reason : null };
    });
    const s6 = (checkOut.steps || []).find((x) => x.n === 6);
    rows.push({ item: "no extra fields", ok: result.outcome === "pass" ? true : s6 && s6.state === "fail" ? false : null, note: s6 && s6.state === "fail" ? reason : null });
    return rows;
  }

  // -> { ok, errors[], job_id, delivery_digest, checker_version, verdict, failure_reason, action, buyer_owner, seller_owner, checklist, recommended, input }
  // `input` is exactly the record_decision args, or null while anything stops it from being sent (errors says what).
  async function decisionFor(run, checker, portfolio) {
    const errors = [], env = envelopeOf(run || {}), delivery = run && deliveryOf(run);
    const out = { ok: false, errors, job_id: null, delivery_digest: null, checker_version: checker.CHECKER_REF, verdict: null, failure_reason: null, action: null, buyer_owner: null, seller_owner: null, checklist: null, recommended: null, input: null };
    if (!env || !delivery) { errors.push("the run has no envelope or no delivery to check"); return out; }
    const checkOut = await checker.check(env, delivery), result = checkOut.result;
    out.checklist = checklist(env, checkOut);
    out.verdict = result.outcome; out.failure_reason = result.failure_reason || result.blocked_reason || null; out.action = out.recommended = ACTION[result.outcome] || null;
    out.delivery_digest = await checker.sha256Hex(checker.canonicalJson(delivery));
    out.job_id = jobIdOf(run);
    const o = (run && run.owners) || {};
    out.buyer_owner = portfolio.ownerKey(o.buyer); out.seller_owner = portfolio.ownerKey(o.seller);
    if (out.job_id == null) errors.push("not a market job: it has no job id, so it can never be recorded");
    else if (!JOB.test(out.job_id)) errors.push(`job id "${out.job_id}" is not lowercase hex and dashes, which the contract needs`);
    if (!VERSION.test(out.checker_version)) errors.push("the checker version has characters the contract refuses");
    if (!PAIRS[out.verdict]) errors.push(`verdict "${out.verdict}" is not pass, fail or blocked`);
    for (const [who, k] of [["buyer", out.buyer_owner], ["seller", out.seller_owner]]) {
      if (k == null) errors.push(`the ${who} owner is not named`);
      else if (!OWNER.test(k)) errors.push(`the ${who} owner "${k}" is not plain a-z and 0-9 (up to 64), which the contract needs`);
    }
    if (errors.length) return out;
    out.input = { job_id: out.job_id, delivery_digest: out.delivery_digest, checker_version: out.checker_version, verdict: out.verdict, action: out.action, buyer_owner: out.buyer_owner, seller_owner: out.seller_owner };
    out.ok = true;
    return out;
  }

  // A decision that is really on chain, not a dry run. Chain records carry no `status`; snapshot entries say "recorded".
  // A resumed decision has no known tx (tx null), so the block time is what says it was recorded.
  const isRecorded = (d) => d.status !== "dry-run" && Number.isSafeInteger(d.block_timestamp_ms);
  const GAP = "No check for this job is recorded on chain.";

  // What happened to this receipt, check-wise. `rc` is a portfolio.checkReceipt result (it holds the recomputed delivery_digest, outcome,
  // accepted_at, market_accepted, owners, checker_version). `decisions` are chain records and/or data/decisions.json entries, any jobs mixed.
  // A decision counts only when `live_verified` is true: the caller read get_decisions from the chain and got a record equal to it.
  // Of several decisions for one delivery the latest (highest n) is the one that stands.
  // -> { counted, state, reason (plain English, always), decision (the one it looked at, or null) }
  function checkStatus(rc, decisions) {
    const res = (state, reason, decision = null, counted = false) => ({ counted, state, reason, decision });
    const no = (reason, decision = null) => res("not_counted", reason, decision);
    if (!rc || rc.id == null) return no("The receipt names no job id, so no decision can be matched to it.");
    // A dry-run entry says what the check WOULD recommend; it is not a decision, so it is not even looked at.
    const mine = (decisions || []).filter((d) => d && d.job_id === rc.id && d.status !== "dry-run");
    if (!mine.length) return rc.market_accepted ? res("paid_before_check", "Paid on the market before any check.") : res("no_check", GAP);
    const same = mine.filter((d) => d.delivery_digest === rc.delivery_digest);
    if (!rc.delivery_digest || !same.length) return no("A check was recorded for this job, but for a different delivery than the one checked here.", mine[mine.length - 1]);
    const d = same.reduce((a, b) => ((b.n ?? -1) >= (a.n ?? -1) ? b : a));
    if (!isRecorded(d)) return no("The check for this delivery has no chain block time, so it is not shown as on chain.", d);
    if (d.live_verified !== true) return no("Check recorded in the snapshot, not verified on chain.", d);
    if (d.checker_version !== rc.checker_version) return no(`The check was made with checker "${d.checker_version}", but this receipt was checked with "${rc.checker_version}".`, d);
    if (d.verdict !== rc.outcome) return no(`The chain says the verdict was "${d.verdict}", but the checker re-run here says "${rc.outcome}".`, d);
    if (d.verdict !== "pass") {
      if (rc.market_accepted) return res("accepted_although_failed", `The check said ${d.verdict} and was recorded on chain, but the buyer accepted although the check failed.`, d);
      if (!(d.buyer && d.buyer.action)) return res("waiting", `The check said ${d.verdict} and is recorded on chain. It recommends: ${d.action}. The buyer has not decided on the market.`, d);
      return no(`The recorded check said ${d.verdict}, so it does not count as checked before paid.`, d);
    }
    const bAct = d.buyer && d.buyer.action;
    if (bAct === "sent_back" || bAct === "cancelled") return res("sent_back_although_passed", `The check passed and was recorded on chain, but the buyer ${bAct === "cancelled" ? "cancelled" : "sent it back"} although it passed.`, d);
    if (!rc.market_accepted) return res("waiting", `The check passed and is recorded on chain. It recommends: ${d.action}. The buyer has not decided on the market.`, d);
    const at = Date.parse(rc.accepted_at);
    if (!Number.isFinite(at)) return no("The market's accept time is not recorded, so order cannot be shown.", d);
    if (!(d.block_timestamp_ms < at)) return res("checked_after_paid", "The check was recorded on chain after the buyer paid, so it was not checked before paid.", d);
    if (d.buyer_owner !== rc.buyer_owner || d.seller_owner !== rc.seller_owner) return no("The owners on the check are not the owners on the receipt.", d);
    return res("checked_before_paid", "The check passed and was recorded on chain before the buyer paid.", d, true);
  }

  // Sets rc.check on every receipt (what portfolio.counts reads).
  function attach(receipts, decisions) {
    for (const rc of receipts) if (rc) rc.check = checkStatus(rc, decisions);
    return receipts;
  }

  const api = { PAIRS, ACTION, SETTLED_MARKET, decisionFor, checklist, checkStatus, attach, isRecorded };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AgentProofGate = api;
})(typeof window !== "undefined" ? window : globalThis);
