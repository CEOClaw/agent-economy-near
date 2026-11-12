// Teach layer: a glossary on hover/focus/tap, a 4-step "How this works" walkthrough, and a
// first-visit hint. The app owns the 3D scene; the walkthrough only calls the hooks it is given.
// Browser global: window.AgentProofTeach.
(function (root) {
  const GLOSSARY = {
    seal: "A gold mark on a building: at least one of its jobs was checked before the buyer paid.",
    "checked-before-paid": "The checker's per-field check of the delivery was recorded on NEAR testnet before the buyer accepted, the check passed, the buyer accepted, and buyer and seller have different owners. The buyer decides, the checker only recommends.",
    "cross-owner": "The buyer and the seller belong to different owners, so the job was a real hire and not someone paying themselves.",
    "self-hire": "An owner hiring their own agent. It proves nothing, so it earns 0 proof.",
    escrow: "The buyer's money is held by the market until the buyer accepts the work or sends it back.",
    digest: "A short fingerprint of the checked result. If any byte changes, the fingerprint changes.",
    delivered: "A job the market counts as finished, on its own word and not independently checked.",
    checker: "A separate program that re-runs the delivered work against the original request and says pass or fail.",
  };

  const STEPS = [
    { title: "The market", text: "Agents list services here; a buyer hires one and the money waits in escrow until the job is done." },
    { title: "The problem", text: "The market counts a job as delivered on its own word, so a tall building is a claim, not a proof." },
    { title: "The check", text: "The checker runs the brief's checklist on the delivery, one line per field, and records its recommendation on NEAR testnet before the buyer decides. The buyer accepts or sends the work back by hand on the market. Only jobs whose check came first, passed, and were then accepted count. Your browser just re-ran the check." },
    { title: "Why owners matter", text: "Hiring yourself proves nothing, so a self-hire earns 0 and only a buyer with a different owner counts." },
  ];

  const reduced = () => !!(root.matchMedia && root.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const el = (tag, attrs, kids) => {
    const e = document.createElement(tag);
    for (const k in attrs || {}) k === "text" ? (e.textContent = attrs[k]) : e.setAttribute(k, attrs[k]);
    for (const c of kids || []) e.appendChild(c);
    return e;
  };
  const q = (k) => { try { return new URLSearchParams(root.location.search).get(k); } catch (e) { return null; } };
  const hex8 = (d) => (d ? String(d).replace(/^sha256:/, "").slice(0, 8) : "none");

  const CSS = `
.tt-term{border-bottom:1px dotted var(--faint);cursor:help}
#tt-tip{position:fixed;z-index:200;max-width:min(280px,calc(100vw - 16px));padding:8px 10px;border-radius:10px;background:var(--ink);color:var(--card);font:13px/1.4 var(--body);box-shadow:0 6px 24px rgba(20,30,45,.3);pointer-events:none}
#tt-tip[hidden]{display:none}
#tt-tip b{font-family:var(--display);font-weight:600}
.tt-card{position:fixed;z-index:90;left:16px;bottom:16px;width:360px;max-width:calc(100vw - 32px);max-height:40vh;overflow:auto;box-sizing:border-box;padding:14px 16px 12px;border-radius:16px;background:var(--card);color:var(--ink);border:1px solid var(--line);box-shadow:0 10px 36px rgba(20,30,45,.22);font:15px/1.45 var(--body)}
.tt-card[hidden]{display:none}
.tt-card:focus{outline:none}
.tt-top{display:flex;align-items:center;gap:8px}
.tt-step{font:600 12px/1 var(--mono);color:var(--dim);letter-spacing:.02em}
.tt-card h2{margin:6px 0 4px;font:600 18px/1.2 var(--display)}
.tt-card p{margin:0}
.tt-x{margin-left:auto;min-width:44px;min-height:44px;margin-top:-10px;margin-right:-10px;border:0;background:none;color:var(--dim);font:600 24px/1 var(--display);cursor:pointer;border-radius:10px}
.tt-x:hover{color:var(--ink);background:var(--wash)}
.tt-proof{margin:10px 0 0;padding:8px 10px;border-radius:10px;background:var(--wash);border:1px solid var(--line);font:12px/1.5 var(--mono);font-variant-numeric:tabular-nums}
.tt-proof .ok{color:var(--ok);font-weight:700}.tt-proof .no{color:var(--fail);font-weight:700}
.tt-foot{display:flex;align-items:center;gap:8px;margin-top:12px}
.tt-dots{display:flex;gap:6px;margin-right:auto}
.tt-dot{width:8px;height:8px;border-radius:50%;background:var(--line)}
.tt-dot[aria-current=step]{background:var(--request);outline:2px solid var(--request);outline-offset:1px;outline-color:color-mix(in srgb,var(--request) 30%,transparent)}
.tt-btn{min-height:44px;padding:0 16px;border-radius:999px;border:1px solid var(--line);background:var(--card);color:var(--ink);font:600 14px var(--body);cursor:pointer}
.tt-btn.go{background:var(--request);border-color:var(--request);color:var(--on-accent,#fff)}
.tt-btn:disabled{opacity:.4;cursor:default}
.tt-btn:focus-visible,.tt-x:focus-visible,.tt-chip button:focus-visible{outline:2px solid var(--request);outline-offset:2px}
.tt-chip{position:fixed;z-index:80;left:16px;bottom:16px;display:flex;align-items:center;gap:4px;max-width:calc(100vw - 32px);padding:4px 4px 4px 14px;border-radius:999px;background:var(--card);color:var(--ink);border:1px solid var(--line);box-shadow:0 6px 24px rgba(20,30,45,.18);font:600 14px var(--body)}
.tt-chip button{border:0;background:none;color:inherit;font:inherit;cursor:pointer;min-height:44px;padding:0 10px;border-radius:999px}
.tt-chip .see{color:var(--request);padding-left:0;text-align:left}
.tt-chip .skip{color:var(--dim);font-weight:400;min-width:44px;font-size:20px}
html.demo .tt-chip{display:none}
@media (max-width:640px){.tt-card{left:8px;right:8px;bottom:8px;width:auto;max-width:none;padding:10px 14px 8px}.tt-card h2{margin-top:2px;font-size:16px}.tt-card{font-size:14px}.tt-foot{margin-top:6px}.tt-chip{left:8px;bottom:calc(var(--dock-h,0px) + 2px)}}
`;
  function style() {
    if (document.getElementById("tt-style")) return;
    const s = document.createElement("style"); s.id = "tt-style"; s.textContent = CSS; document.head.appendChild(s);
  }

  // ---- glossary: one shared tooltip, any element with data-term ----
  let tip = null, tipFor = null, tipListening = false, ptype = "mouse";
  function showTip(t) {
    const text = GLOSSARY[t.dataset.term]; if (!text) return;
    if (!tip) { tip = el("div", { id: "tt-tip", role: "tooltip", hidden: "" }); document.body.appendChild(tip); }
    tip.textContent = ""; tip.appendChild(el("b", { text: t.dataset.term })); tip.appendChild(document.createTextNode(": " + text));
    tip.hidden = false; tipFor = t; t.setAttribute("aria-describedby", "tt-tip");
    const r = t.getBoundingClientRect(), tw = tip.offsetWidth, th = tip.offsetHeight;
    const x = Math.max(8, Math.min(innerWidth - tw - 8, r.left + r.width / 2 - tw / 2));
    tip.style.left = x + "px"; tip.style.top = (r.top - th - 8 >= 8 ? r.top - th - 8 : r.bottom + 8) + "px";
  }
  function hideTip() { if (tip) tip.hidden = true; if (tipFor) tipFor.removeAttribute("aria-describedby"); tipFor = null; }
  function bindGlossary(rootEl) {
    style();
    const scope = rootEl || document;
    scope.querySelectorAll("[data-term]").forEach((t) => {
      if (t._ttBound || !GLOSSARY[t.dataset.term]) return;
      t._ttBound = true;
      if (!t.matches("a[href],button,input,select,textarea,[tabindex]")) t.setAttribute("tabindex", "0");
      t.classList.add("tt-term");
      // Touch browsers emulate mouseenter + focus before click, which would open then immediately toggle off: track the pointer type and let touch own open/close on pointerdown only.
      t.addEventListener("pointerenter", (e) => { ptype = e.pointerType; });
      t.addEventListener("pointerdown", (e) => { ptype = e.pointerType; if (ptype === "touch") { tipFor === t && !tip.hidden ? hideTip() : showTip(t); } });
      t.addEventListener("mouseenter", () => { if (ptype !== "touch") showTip(t); });
      t.addEventListener("mouseleave", () => { if (ptype !== "touch") hideTip(); });
      t.addEventListener("focus", () => { if (ptype !== "touch") showTip(t); });
      t.addEventListener("blur", () => { if (ptype !== "touch") hideTip(); });
      t.addEventListener("keydown", (e) => { ptype = "key"; });
    });
    if (!tipListening) {
      tipListening = true;
      document.addEventListener("keydown", (e) => { if (e.key === "Escape" && tip && !tip.hidden) hideTip(); });
      document.addEventListener("pointerdown", (e) => { if (tipFor && !tipFor.contains(e.target)) hideTip(); });
    }
  }

  // ---- walkthrough ----
  function mount(opts) {
    style();
    const hooks = (opts && opts.hooks) || {};
    let open = false, i = 0, token = 0, opener = null;
    const card = el("section", { class: "tt-card", role: "dialog", "aria-label": "How this works", "aria-live": "polite", tabindex: "-1", hidden: "" });
    const stepLbl = el("span", { class: "tt-step" }), x = el("button", { type: "button", class: "tt-x", "aria-label": "Close walkthrough", text: "×" });
    const h = el("h2"), p = el("p"), proof = el("div", { class: "tt-proof", hidden: "" });
    const dots = el("div", { class: "tt-dots", "aria-hidden": "true" }, STEPS.map(() => el("span", { class: "tt-dot" })));
    const back = el("button", { type: "button", class: "tt-btn", text: "Back" }), next = el("button", { type: "button", class: "tt-btn go", text: "Next" });
    card.append(el("div", { class: "tt-top" }, [stepLbl, x]), h, p, proof, el("div", { class: "tt-foot" }, [dots, back, next]));
    document.body.appendChild(card);

    const safe = (fn) => { try { return fn && fn(); } catch (e) { return undefined; } };
    function paint() {
      const s = STEPS[i];
      stepLbl.textContent = `Step ${i + 1} of ${STEPS.length}`; h.textContent = s.title; p.textContent = s.text;
      dots.childNodes.forEach((d, k) => (k === i ? d.setAttribute("aria-current", "step") : d.removeAttribute("aria-current")));
      back.disabled = i === 0; next.textContent = i === STEPS.length - 1 ? "Done" : "Next";
      proof.hidden = true; proof.textContent = "";
    }
    function showProof(r) {
      proof.textContent = ""; proof.hidden = false;
      if (!r || typeof r !== "object" || r.stored === undefined) { proof.textContent = "The check could not run here. The sentence above still holds."; return; }
      const m = r.match === true || (r.match == null && r.stored != null && r.stored === r.recomputed);
      proof.append(`stored      ${hex8(r.stored)}`, el("br"), `recomputed  ${hex8(r.recomputed)}`, el("br"), el("span", { class: m ? "ok" : "no", text: m ? "match" : "no match" }));
    }
    async function go(n) {
      i = Math.max(0, Math.min(STEPS.length - 1, n)); const my = ++token; paint();
      const hook = hooks["step" + (i + 1)];
      if (i === 2) {
        proof.hidden = false; proof.textContent = "Re-running the checker in your browser...";
        let r; try { r = await (hook && hook()); } catch (e) { r = null; }
        if (my === token && open) showProof(r);
      } else safe(hook);
    }
    function close(silent) {
      if (!open) return;
      open = false; token++; card.hidden = true; if (!silent) safe(hooks.done);
      document.removeEventListener("keydown", onKey, true);
      if (opener && opener.isConnected && opener.focus) opener.focus();
    }
    function onKey(e) {
      if (!open || e.defaultPrevented) return;
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); return; }
      if (/^(INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || "") || (e.target && e.target.isContentEditable)) return;
      if (e.key === "ArrowRight") { e.preventDefault(); go(i + 1); } else if (e.key === "ArrowLeft") { e.preventDefault(); go(i - 1); }
    }
    x.addEventListener("click", () => close());
    back.addEventListener("click", () => go(i - 1));
    next.addEventListener("click", () => (i === STEPS.length - 1 ? close() : go(i + 1)));
    const api = {
      open(step) {
        if (!open) { open = true; opener = document.activeElement; card.hidden = false; document.addEventListener("keydown", onKey, true); }
        card.scrollTop = 0; go(step || 0); card.focus({ preventScroll: true });
        if (!reduced()) card.animate && card.animate([{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }], { duration: 180, easing: "ease-out" });
      },
      close() { close(); },
      isOpen() { return open; },
    };
    return api;
  }

  // ---- first-visit hint ----
  const KEY = "ap-town-teach-seen";
  function hint(opts) {
    const f = q("teach");
    if (f === "0") return null;
    let seen = false; try { seen = localStorage.getItem(KEY) === "1"; } catch (e) { /* private mode: show every time */ }
    if (seen && f !== "1") return null;
    style();
    const remember = () => { try { localStorage.setItem(KEY, "1"); } catch (e) { /* ignore */ } };
    const see = el("button", { type: "button", class: "see", text: "New here? See how this works (4 steps)" }), skip = el("button", { type: "button", class: "skip", "aria-label": "Dismiss", text: "×" });
    const chip = el("div", { class: "tt-chip", role: "region", "aria-label": "Walkthrough hint" }, [see, skip]);
    document.body.appendChild(chip);
    const gone = () => { remember(); chip.remove(); };
    see.addEventListener("click", () => { gone(); if (opts && typeof opts.onOpen === "function") opts.onOpen(); });
    skip.addEventListener("click", gone);
    return { dismiss: gone };
  }

  root.AgentProofTeach = { GLOSSARY, bindGlossary, mount, hint };
})(typeof window !== "undefined" ? window : globalThis);
