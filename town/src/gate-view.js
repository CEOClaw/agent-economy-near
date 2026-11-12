// What the pages say about the check before you pay, in plain words. One place, so the card, the receipts list and
// the Data table never tell it differently. Works in the browser (window.AgentProofGateView) and in Node.
// It only reads: data/decisions.json (the snapshot), data/anchors.json, and, when the snapshot says the contract
// holds decisions, the chain itself through src/decisions.js. The counting rule is src/gate.js, not here.
(function (root) {
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const monthDay = (iso) => { const d = new Date(iso); return iso && !isNaN(d) ? `${MON[d.getUTCMonth()]} ${d.getUTCDate()}` : null; };
    const cache = new Map();

  // The snapshot and the anchors for one data folder (an absolute URL). A missing file is an empty snapshot, never a crash.
  function load(dataBase, fetchFn) {
    if (cache.has(dataBase)) return cache.get(dataBase);
    const f = fetchFn || ((u, o) => root.fetch(u, o));
    const get = async (name) => { try { const r = await f(new URL(name, dataBase).href); return r.ok ? await r.json() : null; } catch { return null; } };
    const p = Promise.all([get("decisions.json"), get("anchors.json")]).then(([snap, anchors]) => makeCtx(snap, anchors, f));
    cache.set(dataBase, p);
    return p;
  }

  function makeCtx(snap, anchors, f) {
    const ctx = { snap, anchors, decisions: ((snap && snap.decisions) || []).map((d) => ({ ...d, via: "snapshot" })), liveJobs: new Map(), anchorRead: new Map(), liveAnchor: new Map() };
    // When the snapshot says the contract holds decisions, the chain's answer for a job replaces the snapshot's recorded entries for it.
    // Unreachable keeps the snapshot entries, unverified: they never count as checked before paid.
    ctx.readLive = async (ids) => {
      if (!snap || snap.contract_has_decisions !== true || !root.AgentProofDecisions) return;
      await Promise.all([...new Set((ids || []).filter(Boolean))].map(async (id) => {
        if (ctx.liveJobs.has(id)) return;
        const r = await root.AgentProofDecisions.viewDecisions(snap, id, f);
        ctx.liveJobs.set(id, r.ok ? "live" : r.reason);
        if (!r.ok) return;
        const had = ctx.decisions.filter((d) => d.job_id === id && d.status !== "dry-run");
        for (const d of had) ctx.decisions.splice(ctx.decisions.indexOf(d), 1);
        for (const c of r.decisions) {
          const s = had.find((d) => d.n === c.n && d.delivery_digest === c.delivery_digest);
          // A snapshot entry that disagrees with the chain stays as the unverified snapshot entry; it never counts as checked before paid.
          if (s && !root.AgentProofDecisions.sameRecord(s, c)) ctx.decisions.push(s);
          else ctx.decisions.push({ ...c, tx: s ? s.tx : null, buyer: s ? s.buyer ?? null : null, checklist: s ? s.checklist ?? null : null, via: "live", live_verified: true });
        }
      }));
    };
    // The anchor stored for a receipt, read back from the chain and compared with the digest this page recomputed.
    ctx.verifyAnchor = (rc) => {
      const A = root.AgentProofAnchors;
      if (!rc || !anchors || !A || !(anchors.anchors || []).some((a) => a.job_id === rc.id)) return Promise.resolve(null);
      if (!ctx.anchorRead.has(rc.id)) ctx.anchorRead.set(rc.id, A.viewAnchor(anchors, rc.id, f).then((r) => { const st = r.ok ? A.compareAnchor(r.record, rc.recomputed_digest) : r.reason; ctx.liveAnchor.set(rc.id, st); return st; }));
      return ctx.anchorRead.get(rc.id);
    };
    return ctx;
  }

  // One receipt -> what the check did with it: { job, verdict, recommended, buyer, state, stateKind, paidBefore, counted, checkState, why, tx, txUrl, anchor, parts[], line }
  // The checker recommends, the buyer decides by hand on the market. Nothing here says code moved money.
  function describe(rc, ctx) {
    const G = root.AgentProofGate, mine = ((ctx && ctx.decisions) || []).filter((d) => rc.id != null && d.job_id === rc.id);
    const recs = mine.filter((d) => d.status !== "dry-run" && G.isRecorded(d)), rec = recs.filter((d) => d.delivery_digest === rc.delivery_digest).reduce((a, b) => (!a || (b.n ?? -1) >= (a.n ?? -1) ? b : a), null) || recs[recs.length - 1] || null;
    const dry = mine.find((d) => d.status === "dry-run") || null;
    const chk = rc.check || G.checkStatus(rc, mine), when = monthDay(rc.accepted_at), on = when ? " on " + when : "";
    const verdict = rc.outcome == null ? "not checked" : rc.outcome + (rc.outcome !== "pass" && rc.failure_reason ? `: ${rc.failure_reason}` : "");
    const rec1 = (d) => (d.action === "accept" ? "accept" : d.action === "request_changes" ? "send back for changes" : "nothing (blocked)");
    let recommended;
    if (rec) recommended = rec1(rec) + (rec.live_verified === true ? "" : " (snapshot, not verified on chain)");
    else if (dry) recommended = rec1(dry) + " (dry run, not recorded)";
    else recommended = "none recorded";
    // The chain never holds what the buyer did on the market: that comes from the snapshot, written by `gate.mjs --confirm`.
    const bd = rec && rec.buyer && rec.buyer.action ? rec.buyer : null, readOn = bd && monthDay(bd.read_at), fromMarket = bd ? ` (read from market.near.ai${readOn ? " on " + readOn : ""})` : "";
    const bWord = bd ? { accepted: "accepted", sent_back: "sent back", cancelled: "cancelled" }[bd.action] || bd.action : null;
    let buyer;
    switch (chk.state) {
      case "checked_before_paid": buyer = `accepted${on}, after the check was on chain`; break;
      case "paid_before_check": buyer = `paid${on}, before any check`; break;
      case "accepted_although_failed": buyer = "accepted although the check failed"; break;
      case "sent_back_although_passed": buyer = `${bWord || "sent back"} although it passed${fromMarket}`; break;
      case "checked_after_paid": buyer = `paid${on}, before the check was on chain`; break;
      default:
        if (bd) buyer = `${bWord}${bd.followed === true ? ", as the check recommended" : ""}${fromMarket}`;
        else if (/^The chain says|^The check was made with checker/.test(chk.reason || "")) buyer = rc.market_accepted ? `accepted${on}` : "has not decided yet";
        else buyer = rc.market_accepted ? `accepted${on}, but the check is not verified on chain` : "has not decided yet";
    }
    let state, stateKind;
    if (rec) {
      const live = rec.via === "live" && rec.live_verified === true;
      state = live ? "on NEAR testnet, read live" : "on NEAR testnet (snapshot, not verified live)"; stateKind = live ? "live" : "snapshot";
    } else if (dry) { state = "dry run, not on chain"; stateKind = "dry"; }
    else { state = "no check recorded"; stateKind = "none"; }
    const sn = ctx && ctx.snap, tx = rec && rec.tx || null, txUrl = tx && sn ? `${sn.explorer}/txns/${tx}` : null;
    const a = ctx && ctx.anchors && (ctx.anchors.anchors || []).find((x) => x.job_id === rc.id), seen = ctx && ctx.liveAnchor && ctx.liveAnchor.get(rc.id);
    const anchor = a ? { tx: a.tx, url: `${ctx.anchors.explorer}/txns/${a.tx}`, label: seen === "match" ? "receipt anchored on NEAR testnet, read live" : "receipt anchored on NEAR testnet (snapshot, not verified live)", live: seen === "match", note: "the anchor holds the evidence digest, not a check" } : null;
    const job = String(rc.id || "no id").slice(0, 8);
    const paidBefore = chk.state === "paid_before_check";
    const parts = [{ k: "verdict", v: verdict }, { k: "recommended", v: recommended }, { k: "buyer", v: buyer }, { k: "check", v: state, href: txUrl, link: tx ? `tx ${tx.slice(0, 8)}` : null }];
    if (anchor) parts.push({ k: "anchor", v: anchor.label, href: anchor.url, link: `tx ${anchor.tx.slice(0, 8)}` });
    const line = `${job}: ${verdict}. Recommended: ${recommended}. Buyer: ${buyer}. Check: ${state}.${anchor ? " " + anchor.label[0].toUpperCase() + anchor.label.slice(1) + "." : ""}`;
    return { job, verdict, recommended, buyer, state, stateKind, paidBefore, counted: !!chk.counted, checkState: chk.state, why: chk.reason, tx, txUrl, anchor, parts, line };
  }

  const api = { load, describe, monthDay };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AgentProofGateView = api;
})(typeof window !== "undefined" ? window : globalThis);
