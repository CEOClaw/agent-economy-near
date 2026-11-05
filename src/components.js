// AgentProof web components. One script tag, no framework, shadow DOM.
//   <script src="src/components.js"></script>
//   <agentproof-portfolio agent="ohwow-agent"></agentproof-portfolio>
//   <agentproof-badge agent="web-research"></agentproof-badge>
// Market numbers come from src/market.js (snapshot fallback off market.near.ai).
// Receipts come from data/manifest.json + data/runs, and the checker re-runs
// on each one in this browser before anything renders as proof.
//
// Attributes (both elements):
//   agent     market handle
//   receipts  optional comma-separated run URLs that replace the manifest
//   theme     "light" | "dark"; default follows prefers-color-scheme
//   flip      (portfolio only) first show "Market says N delivered", then after
//             ~900 ms count down to the proven number; reduced motion skips it
// Theme tokens (set on the element or any ancestor):
//   --ap-bg --ap-paper --ap-ink --ap-muted --ap-line
//   --ap-proof (verified) --ap-market (market numbers) --ap-warn (failed check)
//   --ap-void (not observed) --ap-display --ap-body --ap-mono (font stacks)
// Events: "agentproof:ready" with detail { portfolio, receipts, market, owner };
//   "agentproof:flipped" (same detail) once the flip has landed on the proven number.
(function () {
  const SELF = document.currentScript && document.currentScript.src;
  const SRC = new URL(".", SELF || location.href);
  const DATA = new URL("../data/", SRC);
  const NEUTRAL = "#8a94a3";
  const FONTS = "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700;12..96,800&family=IBM+Plex+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;600&display=swap";

  // Fonts declared inside a shadow root do not load, so the document gets them.
  if (!document.querySelector('link[href*="Bricolage+Grotesque"]')) {
    const l = document.createElement("link"); l.rel = "stylesheet"; l.href = FONTS; document.head.appendChild(l);
  }

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const getJson = async (url) => { const r = await fetch(url); if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`); return r.json(); };
  const loadScript = (name, global) => window[global] ? Promise.resolve() : new Promise((ok, bad) => {
    const s = document.createElement("script"); s.src = new URL(name, SRC).href; s.onload = ok; s.onerror = () => bad(new Error("could not load " + name)); document.head.appendChild(s);
  });
  const deps = Promise.all([loadScript("checker.js", "AgentProofChecker"), loadScript("market.js", "AgentProofMarket"), loadScript("portfolio.js", "AgentProofPortfolio")]);

  // Shared across every element on the page: one market read, one cast read.
  let base;
  function loadBase() {
    return base || (base = deps.then(async () => {
      const [market, cast] = await Promise.all([
        window.AgentProofMarket.fetchAgents({ snapshotUrl: new URL("market-snapshot.json", DATA).href }),
        getJson(new URL("agents.json", DATA)).then((o) => o.agents || [], () => []),
      ]);
      return { market, byHandle: new Map(market.agents.map((a) => [a.handle, a])), cast };
    }));
  }

  // One receipt set per source (the manifest, or a `receipts` list). count resolves
  // as soon as the bundles are fetched, checked once every checker run is done.
  const sets = new Map();
  function loadReceipts(list) {
    const key = list || "manifest";
    if (sets.has(key)) return sets.get(key);
    const urls = list
      ? Promise.resolve(list.split(",").map((u) => new URL(u.trim(), location.href).href))
      : getJson(new URL("manifest.json", DATA)).then((m) => m.runs.map((r) => new URL(r.file, DATA).href));
    const runs = Promise.all([deps, urls]).then(([, us]) => Promise.all(us.map((u) => getJson(u).then((run) => ({ u, run }))))).then((xs) => xs.filter((x) => x.run && x.run.job_ref));
    const set = {
      count: runs.then((xs) => xs.length),
      checked: runs.then((xs) => Promise.all(xs.map(async ({ u, run }) => {
        const r = await window.AgentProofPortfolio.checkReceipt(run, window.AgentProofChecker);
        return r && Object.assign(r, { file: u.split("/").pop() });
      }))).then((rs) => rs.filter(Boolean)),
    };
    sets.set(key, set);
    return set;
  }

  // Owner look: agents.json when the handle is one of its executor_ids, else a letter tile.
  function ownerFor(handle, marketAgent, cast) {
    const a = cast.find((c) => (c.executor_ids || []).includes(handle));
    const name = (a && a.name) || (marketAgent && marketAgent.name) || handle;
    return {
      name,
      color: (a && a.color) || NEUTRAL,
      letter: (a && a.mono) || (name.match(/[a-z0-9]/i) || ["?"])[0].toUpperCase(),
      logo: a && a.logo ? new URL(a.logo, DATA).href : null,
    };
  }

  const TOKENS = `
:host{--bg:var(--ap-bg,#f3f5f9);--paper:var(--ap-paper,#fff);--ink:var(--ap-ink,#16202e);--muted:var(--ap-muted,#5d6878);--line:var(--ap-line,#dde2ea);
  --proof:var(--ap-proof,#0f9b82);--market:var(--ap-market,#3b78de);--warn:var(--ap-warn,#cf4870);--void:var(--ap-void,#b8c0cc);
  --display:var(--ap-display,"Bricolage Grotesque",ui-sans-serif,system-ui,sans-serif);--body:var(--ap-body,"IBM Plex Sans",ui-sans-serif,system-ui,sans-serif);--mono:var(--ap-mono,"JetBrains Mono",ui-monospace,Menlo,monospace)}
@media (prefers-color-scheme:dark){:host(:not([theme="light"])){--bg:var(--ap-bg,#0f141b);--paper:var(--ap-paper,#18202b);--ink:var(--ap-ink,#e8edf4);--muted:var(--ap-muted,#9aa6b6);--line:var(--ap-line,#2a3441);--proof:var(--ap-proof,#2fc4a7);--market:var(--ap-market,#6b9cf0);--warn:var(--ap-warn,#ec6f95);--void:var(--ap-void,#4a5566)}}
:host([theme="dark"]){--bg:var(--ap-bg,#0f141b);--paper:var(--ap-paper,#18202b);--ink:var(--ap-ink,#e8edf4);--muted:var(--ap-muted,#9aa6b6);--line:var(--ap-line,#2a3441);--proof:var(--ap-proof,#2fc4a7);--market:var(--ap-market,#6b9cf0);--warn:var(--ap-warn,#ec6f95);--void:var(--ap-void,#4a5566)}
*{box-sizing:border-box}.num{font-variant-numeric:tabular-nums}.nil{color:var(--void)}`;

  const CARD_CSS = TOKENS + `
:host{display:block;max-width:440px;color:var(--ink);font-family:var(--body);font-size:15px;line-height:1.5}
.A{background:var(--paper);border-radius:22px;padding:26px;border:1px solid var(--line);box-shadow:0 20px 50px -30px rgba(20,30,50,.35)}
.who{display:flex;gap:12px;align-items:center;min-width:0}
.who>div:last-child{min-width:0}
.logo{width:44px;height:44px;border-radius:12px;display:grid;place-items:center;font:800 20px var(--display);color:#fff;flex:none;background-size:cover;background-position:center}
.nm{font:700 18px var(--display);line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.hd{font:400 12px var(--mono);color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.row{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap}
.big{font:800 76px/0.9 var(--display);margin:22px 0 4px}
.big small{font:600 15px var(--body);color:var(--muted);display:block;margin-top:8px;white-space:nowrap}
.big .bn{display:inline-block;transition:color .4s}
.big.mk .bn{color:var(--market)}
.st{margin-top:24px;font:600 11px var(--mono);border-radius:999px;padding:4px 9px;white-space:nowrap;color:var(--muted);background:var(--bg)}
.st.ok{color:var(--proof)}.st.bad{color:#fff;background:var(--warn)}
.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:18px}
.stats div{border-top:2px solid var(--line);padding-top:8px;min-width:0}
.stats b{font:700 20px var(--display);display:block}
.stats span{font-size:12px;color:var(--muted)}
.stats b.sm{font:600 14px/30px var(--body)}
.vs{margin-top:18px;display:flex;justify-content:space-between;gap:10px;font-size:13px;background:var(--bg);border-radius:12px;padding:10px 12px}
.vs b{color:var(--market)}
.why{margin:14px 0 0;font-size:13px;line-height:1.45;color:var(--muted)}
.foot{display:flex;justify-content:space-between;align-items:center;margin-top:16px;font:400 11px var(--mono);color:var(--muted);gap:10px;flex-wrap:wrap}`;

  // Everything the card shows, as plain values. The canvas export draws from this too.
  function cardModel(p, owner, receipts, marketAgent) {
    const q = p.proof, m = p.market;
    const mine = receipts.filter((r) => r.seller_handle === p.handle);
    const last = q.last_verified_at ? "last verified " + q.last_verified_at.slice(0, 10)
      : q.self_hires.length ? "self-hire, " + ((mine.find((r) => r.self_hire) || {}).verified_at || "").slice(0, 10).replace(/^$/, "date not observed")
      : mine.length ? "no counted receipts" : "no receipts yet";
    const earned = q.verified_jobs && q.earned_usdc != null ? "$" + q.earned_usdc : null;
    return {
      owner, handle: p.handle,
      big: q.verified_jobs,
      owners: q.distinct_owners,
      earned,
      // Zero proof is "none", not a pending state; a counted job with no payout seen is "not observed".
      earnedText: q.verified_jobs ? earned || "not observed" : "none",
      why: q.verified_jobs ? null : (q.self_hires.length ? "Its self-hire does not count. " : "") + "To get a proof-backed job: a buyer with a different owner hires this agent, and the checker passes the delivery.",
      foot: mine.length ? "AgentProof · re-checked in your browser" : "AgentProof · no receipts to re-check",
      self: q.self_hires.length,
      listed: !!marketAgent,
      delivered: m.delivered_jobs, rate: m.success_rate,
      status: q.failed_checks ? { kind: "bad", text: "receipt failed check" } : mine.length ? { kind: "ok", text: "✓ verified in your browser" } : { kind: "", text: "no receipts to check" },
      last,
    };
  }

  class Base extends HTMLElement {
    static get observedAttributes() { return ["agent", "receipts"]; }
    constructor() { super(); this.attachShadow({ mode: "open" }); this._n = 0; }
    connectedCallback() { this._run(); }
    attributeChangedCallback() { if (this.isConnected) this._run(); }
    get handle() { return (this.getAttribute("agent") || "").trim(); }
    async _run() {
      const n = ++this._n, handle = this.handle;
      if (!handle) return;
      try {
        const set = loadReceipts(this.getAttribute("receipts"));
        const count = await set.count;
        if (n !== this._n) return;
        this._checking(count);
        const [b, receipts] = await Promise.all([loadBase(), set.checked]);
        if (n !== this._n) return;
        const marketAgent = b.byHandle.get(handle) || null;
        const portfolio = window.AgentProofPortfolio.buildPortfolio(handle, marketAgent, receipts);
        const owner = ownerFor(handle, marketAgent, b.cast);
        const mine = receipts.filter((r) => r.seller_handle === handle);
        this.data = { portfolio, receipts: mine, market: { source: b.market.source, fetched_at: b.market.fetched_at, agent: marketAgent }, owner };
        this._render(cardModel(portfolio, owner, receipts, marketAgent));
        this.dispatchEvent(new CustomEvent("agentproof:ready", { detail: this.data, bubbles: true }));
      } catch (e) {
        if (n !== this._n) return;
        console.warn("agentproof:", e);
        this._error(String(e && e.message || e));
      }
    }
  }

  class Portfolio extends Base {
    _shell(inner) { clearTimeout(this._ft); cancelAnimationFrame(this._fr); this.shadowRoot.innerHTML = `<style>${CARD_CSS}</style>${inner}`; }
    _checking(count) {
      this._shell(`<article class="A" aria-busy="true"><div class="who"><div class="logo" style="background:${NEUTRAL}"></div><div><div class="nm">${esc(this.handle)}</div><div class="hd">${esc(this.handle)} · market.near.ai</div></div></div>
<div class="row"><div class="big num nil">&nbsp;<small>re-checking ${count} ${count === 1 ? "receipt" : "receipts"}</small></div><span class="st">re-checking</span></div></article>`);
    }
    _error(msg) { this._shell(`<article class="A"><div class="nm">${esc(this.handle)}</div><p class="hd">Could not load: ${esc(msg)}</p></article>`); }
    _render(c) {
      this.model = c;
      const o = c.owner, nil = (v, t = "not observed") => v == null ? `<span class="nil">${t}</span>` : `<b class="num">${esc(v)}</b>`;
      const logo = o.logo ? `style="background-color:${esc(o.color)};background-image:url('${esc(o.logo)}')"` : `style="background:${esc(o.color)}"`;
      const market = c.listed ? `<span>${nil(c.delivered)} delivered · ${c.rate == null ? nil(null) : `<b class="num">${esc(c.rate)}%</b>`} success</span>` : `<span class="nil">not listed</span>`;
      this._shell(`<article class="A" part="card"><div class="who"><div class="logo" ${logo}>${o.logo ? "" : esc(o.letter)}</div><div><div class="nm" title="${esc(o.name)}">${esc(o.name)}</div><div class="hd">${esc(c.handle)} · market.near.ai</div></div></div>
<div class="row"><div class="big num"><span class="bn">${c.big}</span><small>proof-backed ${c.big === 1 ? "job" : "jobs"}</small></div><span class="st ${c.status.kind}" data-status="${c.status.kind || "none"}">${esc(c.status.text)}</span></div>
<div class="stats"><div><b class="num">${c.owners}</b><span>${c.owners === 1 ? "outside owner" : "outside owners"}</span></div><div>${c.earned == null ? `<b class="nil${c.earnedText === "not observed" ? " sm" : ""}">${esc(c.earnedText)}</b>` : `<b class="num">${esc(c.earned)}</b>`}<span>earned, verified</span></div><div><b class="num">${c.self}</b><span>${c.self === 1 ? "self-hire" : "self-hires"}, 0 pts</span></div></div>
<div class="vs"><span>Market says</span>${market}</div>${c.why ? `<p class="why">${esc(c.why)}</p>` : ""}
<div class="foot"><span>${esc(c.foot)}</span><span>${esc(c.last)}</span></div></article>`);
      this._flip(c);
    }

    // `flip`: the big number starts as the market's own claim and lands on the proven count.
    _flip(c) {
      clearTimeout(this._ft); cancelAnimationFrame(this._fr);
      const done = () => this.dispatchEvent(new CustomEvent("agentproof:flipped", { detail: this.data, bubbles: true }));
      if (!this.hasAttribute("flip")) return;
      const root = this.shadowRoot, big = root.querySelector(".big"), bn = root.querySelector(".bn"), lab = root.querySelector(".big small");
      const proven = () => { big.classList.remove("mk"); bn.textContent = c.big; lab.textContent = "Proven · proof-backed " + (c.big === 1 ? "job" : "jobs"); big.dataset.flip = "proven"; };
      if (!c.listed || c.delivered == null || matchMedia("(prefers-reduced-motion: reduce)").matches) { proven(); done(); return; }
      big.classList.add("mk"); big.dataset.flip = "market"; bn.textContent = c.delivered; lab.textContent = "Market says " + c.delivered + " delivered";
      this._ft = setTimeout(() => {
        const from = Number(c.delivered), t0 = performance.now(), D = 700;
        big.dataset.flip = "flipping"; big.classList.remove("mk"); lab.textContent = "Proven · proof-backed " + (c.big === 1 ? "job" : "jobs");
        const tick = (now) => {
          const k = from === c.big ? 1 : Math.min(1, (now - t0) / D);
          bn.textContent = Math.round(from + (c.big - from) * (1 - Math.pow(1 - k, 3)));
          if (k < 1) this._fr = requestAnimationFrame(tick); else { proven(); done(); }
        };
        this._fr = requestAnimationFrame(tick);
      }, 900);
    }

    // Draws the same layout to a canvas (2x) for "Save image". -> HTMLCanvasElement
    async toCanvas(scale = 2) {
      const c = this.model; if (!c) throw new Error("card not ready");
      const card = this.shadowRoot.querySelector(".A"), cs = getComputedStyle(card);
      const t = (k) => cs.getPropertyValue(k).trim();
      const F = { display: t("--display"), body: t("--body"), mono: t("--mono") };
      await Promise.all(["800 76px", "700 20px", "700 18px"].map((w) => document.fonts.load(`${w} ${F.display}`)).concat(document.fonts.load(`600 15px ${F.body}`), document.fonts.load(`400 12px ${F.mono}`), document.fonts.load(`600 11px ${F.mono}`)));
      const M = 24, W = 440, P = 26, FOOT = c.foot, WHY_LH = 19, WHY_GAP = 14;
      // The footer wraps to two lines when both halves do not fit, as it does in the DOM.
      const mx = document.createElement("canvas").getContext("2d"); mx.font = `400 11px ${F.mono}`;
      const wrap = mx.measureText(FOOT).width + 10 + mx.measureText(c.last).width > W - 2 * P;
      // The explainer wraps by measured width, so the card grows by exactly the lines it needs.
      mx.font = `400 13px ${F.body}`;
      const whyLines = [];
      if (c.why) { let cur = ""; for (const w of c.why.split(" ")) { const nx = cur ? cur + " " + w : w; if (cur && mx.measureText(nx).width > W - 2 * P) { whyLines.push(cur); cur = w; } else cur = nx; } whyLines.push(cur); }
      const whyH = whyLines.length ? WHY_GAP + whyLines.length * WHY_LH : 0;
      const H = 384 + (wrap ? 17 : 0) + whyH;
      const cv = document.createElement("canvas"); cv.width = (W + 2 * M) * scale; cv.height = (H + 2 * M) * scale;
      const x = cv.getContext("2d"); x.scale(scale, scale);
      const rr = (X, Y, w, h, r) => { x.beginPath(); x.roundRect(X, Y, w, h, r); };
      const text = (s, X, Y, font, color, align = "left", maxW) => {
        x.font = font; x.fillStyle = color; x.textAlign = align; s = String(s);
        if (maxW) while (s.length > 1 && x.measureText(s).width > maxW) s = s.slice(0, -2) + "…";
        x.fillText(s, X, Y); return x.measureText(s).width;
      };
      x.fillStyle = t("--bg"); x.fillRect(0, 0, W + 2 * M, H + 2 * M);
      x.translate(M, M);
      x.save(); x.shadowColor = "rgba(20,30,50,.18)"; x.shadowBlur = 40; x.shadowOffsetY = 16;
      rr(0, 0, W, H, 22); x.fillStyle = t("--paper"); x.fill(); x.restore();
      x.strokeStyle = t("--line"); x.lineWidth = 1; rr(0.5, 0.5, W - 1, H - 1, 22); x.stroke();
      const inner = W - 2 * P;
      // who
      rr(P, P, 44, 44, 12); x.fillStyle = c.owner.color; x.fill();
      if (c.owner.logo) {
        const im = await new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = c.owner.logo; });
        if (im) { x.save(); rr(P, P, 44, 44, 12); x.clip(); const k = Math.max(44 / im.width, 44 / im.height); x.drawImage(im, P + 22 - im.width * k / 2, P + 22 - im.height * k / 2, im.width * k, im.height * k); x.restore(); }
      } else { x.textBaseline = "middle"; text(c.owner.letter, P + 22, P + 23, `800 20px ${F.display}`, "#fff", "center"); }
      x.textBaseline = "alphabetic";
      text(c.owner.name, P + 56, P + 19, `700 18px ${F.display}`, t("--ink"), "left", inner - 56);
      text(c.handle + " · market.near.ai", P + 56, P + 37, `400 12px ${F.mono}`, t("--muted"), "left", inner - 56);
      // big number + status pill
      const bigTop = P + 44 + 22;
      text(c.big, P, bigTop + 60, `800 76px ${F.display}`, t("--ink"));
      text(c.big === 1 ? "proof-backed job" : "proof-backed jobs", P, bigTop + 68 + 8 + 10, `600 15px ${F.body}`, t("--muted"));
      x.font = `600 11px ${F.mono}`; const sw = x.measureText(c.status.text).width + 18;
      rr(P + inner - sw, bigTop + 2, sw, 23, 12); x.fillStyle = c.status.kind === "bad" ? t("--warn") : t("--bg"); x.fill();
      text(c.status.text, P + inner - 9, bigTop + 18, `600 11px ${F.mono}`, c.status.kind === "bad" ? "#fff" : c.status.kind === "ok" ? t("--proof") : t("--muted"), "right");
      // stats
      const sTop = bigTop + 68 + 8 + 22 + 18, cw = (inner - 20) / 3;
      [[c.owners, c.owners === 1 ? "outside owner" : "outside owners"], [c.earnedText, "earned, verified"], [c.self, (c.self === 1 ? "self-hire" : "self-hires") + ", 0 pts"]].forEach(([v, label], i) => {
        const X = P + i * (cw + 10);
        x.fillStyle = t("--line"); x.fillRect(X, sTop, cw, 2);
        text(v, X, sTop + 31, v === "not observed" ? `600 14px ${F.body}` : `700 20px ${F.display}`, i === 1 && c.earned == null ? t("--void") : t("--ink"));
        text(label, X, sTop + 50, `400 12px ${F.body}`, t("--muted"));
      });
      // market strip
      const vTop = sTop + 58 + 18;
      rr(P, vTop, inner, 40, 12); x.fillStyle = t("--bg"); x.fill();
      text("Market says", P + 12, vTop + 25, `400 13px ${F.body}`, t("--ink"));
      const parts = !c.listed ? [["not listed", "--void"]] : [
        [c.delivered == null ? "not observed" : c.delivered, c.delivered == null ? "--void" : "--market", 600], [" delivered · ", "--ink"],
        [c.rate == null ? "not observed" : c.rate + "%", c.rate == null ? "--void" : "--market", 600], [" success", "--ink"]];
      let X = P + inner - 12;
      for (const [s, col, w] of parts.reverse()) { x.font = `${w || 400} 13px ${F.body}`; X -= x.measureText(String(s)).width; text(s, X, vTop + 25, x.font, t(col)); }
      whyLines.forEach((l, i) => text(l, P, vTop + 40 + WHY_GAP + 13 + i * WHY_LH, `400 13px ${F.body}`, t("--muted")));
      // foot
      const fY = vTop + 40 + whyH + 16 + 12;
      text(FOOT, P, fY, `400 11px ${F.mono}`, t("--muted"));
      if (wrap) text(c.last, P, fY + 17, `400 11px ${F.mono}`, t("--muted"));
      else text(c.last, P + inner, fY, `400 11px ${F.mono}`, t("--muted"), "right");
      return cv;
    }
  }

  const BADGE_CSS = TOKENS + `
:host{display:inline-block;vertical-align:middle}
.b{display:inline-flex;align-items:center;gap:6px;font:600 12px/1 var(--body);padding:5px 10px;border-radius:999px;white-space:nowrap;border:1px solid var(--line);color:var(--muted);background:var(--paper)}
.b i{width:7px;height:7px;border-radius:50%;background:var(--void)}
.b.ok{color:var(--proof);border-color:currentColor}.b.ok i{background:var(--proof)}
.b.bad{color:var(--warn);border-color:currentColor}.b.bad i{background:var(--warn)}`;

  class Badge extends Base {
    _pill(kind, label) { this.shadowRoot.innerHTML = `<style>${BADGE_CSS}</style><span class="b ${kind}" part="badge" data-status="${kind || "none"}"><i></i>${esc(label)}</span>`; }
    _checking() { this._pill("", "checking proof"); }
    _error() { this._pill("bad", "proof unavailable"); }
    _render(c) {
      const n = c.big, m = c.owners;
      if (n) this._pill("ok", `proof-backed: ${n} from ${m} ${m === 1 ? "owner" : "owners"}`);
      else if (c.status.kind === "bad") this._pill("bad", "receipt failed check");
      else this._pill("", "no proof yet");
    }
  }

  if (!customElements.get("agentproof-portfolio")) customElements.define("agentproof-portfolio", Portfolio);
  if (!customElements.get("agentproof-badge")) customElements.define("agentproof-badge", Badge);
  // For host pages that want the market list (the picker, the embed demo).
  window.AgentProof = { loadMarket: () => loadBase().then((b) => b.market) };
})();
