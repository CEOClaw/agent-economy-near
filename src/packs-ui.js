// Check Packs UI. Loaded only by `?packs=1` (one dynamic import at the end of app.js and in portfolio.html), so with the switch off nothing here exists.
// Everything is mock backtest data read from data/backtest/. Reputation lives in this file's own sections: it never touches a card or data-panel number.
const DATA = new URL("../data/", import.meta.url), SRC = new URL("./", import.meta.url);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const $ = (s, r = document) => r.querySelector(s);
const ORIGIN = { real: "MOCK, real input", "derived-from-real": "MOCK, input derived from a real one", synthetic: "MOCK, synthetic input" };
const originLabel = (o) => ORIGIN[o] || "MOCK";
const STATUS = { pass: "pass", fail: "FAIL", contested: "CONTESTED: judges differ by 2 or more", no_quorum: "NO QUORUM: fewer than 2 valid scores", not_run: "NOT RUN: no judge has scored this", not_applicable: "not applicable", not_checkable: "NOT CHECKABLE: fails closed" };
const VERDICT_NOTE = { pass: "Every gate held.", fail: "A gate failed.", contested: "Judges disagree on a gated rubric.", incomplete: "Something that gates the verdict was not run or could not be checked." };
const gateText = (g) => (g === "hard" ? "hard gate" : g && g.min != null ? `needs median ${g.min}+` : "no gate");

const css = `
.ap-packs{--bg:#fff;--ink:#1c2128;--dim:#5b6570;--line:#d5dbe2;--wash:#f3f5f7;--ok:#0f7a4b;--bad:#c2352e;--warn-bg:#ffe08a;--warn-ink:#3a2a00;--accent:#2f64c4;--r:12px;
  font:400 13.5px/1.45 var(--body,system-ui,sans-serif);color:var(--ink);text-align:left}
.ap-packs.ap-dark{--bg:#1a212b;--ink:#e8edf4;--dim:#a3adba;--line:#344050;--wash:#202833;--ok:#2fc48a;--bad:#ef6b62;--warn-bg:#6b4e00;--warn-ink:#fff0c2;--accent:#8db0f5}
.ap-packs *{box-sizing:border-box;overflow-wrap:anywhere}
.ap-packs button{font:600 12.5px/1.2 inherit;font-family:inherit;color:var(--ink);background:var(--bg);border:1.5px solid var(--ink);border-radius:9px;padding:7px 11px;cursor:pointer}
.ap-packs button:focus-visible,.ap-packs summary:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.ap-packs button[disabled]{opacity:.55;cursor:default}
.ap-packs h2,.ap-packs h3,.ap-packs h4{margin:0;font-family:var(--display,inherit);line-height:1.2}
.ap-packs h2{font-size:18px}.ap-packs h3{font-size:15px}.ap-packs h4{font-size:13px}
.ap-packs code,.ap-packs .mono{font-family:var(--mono,ui-monospace,monospace);font-size:12px}
.ap-packs .dim{color:var(--dim)}
.ap-mock{background:var(--warn-bg);color:var(--warn-ink);border:2px solid var(--warn-ink);border-radius:9px;padding:8px 11px;font-weight:700}
.ap-mock small{display:block;font-weight:400;margin-top:2px}
.ap-tag{display:inline-block;background:var(--warn-bg);color:var(--warn-ink);border:1.5px solid var(--warn-ink);border-radius:6px;padding:1px 6px;font:700 11px/1.4 var(--mono,monospace);letter-spacing:.04em;white-space:nowrap}
.ap-panel{position:fixed;z-index:70;top:0;right:0;bottom:0;width:min(520px,100vw);background:var(--bg);border-left:1px solid var(--line);box-shadow:-12px 0 40px rgba(30,40,50,.25);display:flex;flex-direction:column}
.ap-panel[hidden]{display:none}
.ap-head{display:flex;gap:8px;align-items:center;justify-content:space-between;padding:calc(10px + env(safe-area-inset-top,0px)) 14px 10px;border-bottom:1px solid var(--line)}
.ap-body{flex:1;overflow:auto;overscroll-behavior:contain;padding:12px 14px calc(24px + env(safe-area-inset-bottom,0px));display:grid;gap:14px;align-content:start}
.ap-box{border:1px solid var(--line);border-radius:var(--r);padding:11px 12px;background:var(--bg);display:grid;gap:8px}
.ap-box.rep{border-left:5px solid var(--accent)}.ap-box.rc{border-left:5px solid var(--ok)}.ap-box.jd{border-left:5px solid var(--accent);border-left-style:dashed}.ap-box.wt{border-left:5px dotted var(--dim)}
.ap-list{list-style:none;margin:0;padding:0;display:grid;gap:6px}
.ap-row{display:grid;gap:3px;width:100%;text-align:left;border:1px solid var(--line)!important;border-radius:10px!important;padding:9px 11px!important;background:var(--wash)!important}
.ap-row .l1{display:flex;flex-wrap:wrap;gap:6px;align-items:center;justify-content:space-between}
.ap-pill{display:inline-block;border:1.5px solid var(--ink);border-radius:999px;padding:1px 9px;font-weight:700;font-size:12px}
.ap-two{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.ap-two>div{border:1px solid var(--line);border-radius:10px;padding:8px 10px;background:var(--wash);display:grid;gap:4px;align-content:start}
.ap-two .cap{font:600 11px/1.2 var(--mono,monospace);text-transform:uppercase;letter-spacing:.05em;color:var(--dim)}
.ap-two .dim{display:block}.ap-int{display:block;border:2px solid var(--dim);border-radius:4px;padding:2px 8px;font-weight:700;width:fit-content}
.ap-int.ok{border-color:var(--ok);color:var(--ok)}.ap-int.bad{border-color:var(--bad);color:var(--bad);background:color-mix(in srgb,var(--bad) 14%,transparent)}
.ap-crit{border-top:1px solid var(--line);padding-top:7px;display:grid;gap:3px}
.ap-crit:first-of-type{border-top:0;padding-top:0}
.ap-crit .meta{display:flex;flex-wrap:wrap;gap:4px 10px;color:var(--dim);font:500 11.5px/1.3 var(--mono,monospace)}
.ap-st{font-weight:700}.ap-st.pass{color:var(--ok)}.ap-st.fail,.ap-st.contested,.ap-st.bad{color:var(--bad)}
.ap-judge{border-left:3px solid var(--line);padding-left:9px;margin-top:4px;display:grid;gap:2px}
.ap-judge q{quotes:"\\201C" "\\201D";font-style:italic}
.ap-judge.void del{color:var(--dim)}
.ap-void{font-weight:700;color:var(--bad)}
.ap-acts{display:flex;flex-wrap:wrap;gap:6px}
.ap-res li{display:flex;gap:7px;align-items:baseline}.ap-res .m{flex:none;width:2.6em;font:700 11px/1.4 var(--mono,monospace)}
.ap-res .m.ok{color:var(--ok)}.ap-res .m.bad{color:var(--bad)}
.ap-packs details>summary{cursor:pointer;font-weight:600}
.ap-packs dl{margin:0;display:grid;grid-template-columns:max-content 1fr;gap:3px 10px}.ap-packs dd{margin:0}
.ap-sk{min-height:84px;border-radius:var(--r);background:var(--wash)}
.ap-sec{margin:14px 0 0;padding:0}
.ap-sec .ap-box{margin:0}
.ap-packs section{border-top:0;padding-top:0}
@media (max-width:560px){.ap-two{grid-template-columns:1fr}.ap-panel{width:100vw;border-left:0}}
@media (prefers-reduced-motion:reduce){.ap-packs *{transition:none!important;animation:none!important}}
`;

// ---- data ----
const state = { idx: null, recs: new Map(), loading: null, err: null };
const need = (src, ok) => ok() ? Promise.resolve() : new Promise((res, rej) => { const s = document.createElement("script"); s.src = new URL(src, SRC).href; s.onload = res; s.onerror = () => rej(new Error("could not load " + src)); document.head.append(s); });
const loadBytes = async (path) => { const r = await fetch(new URL(path, DATA)); if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`); return new Uint8Array(await r.arrayBuffer()); };
const getJson = async (path) => { const r = await fetch(new URL(path, DATA)); if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`); return r.json(); };
// One shared load: scripts in order (checker before packs), then the index, then every receipt it lists. A receipt that fails stays in the list as an error row.
function ensure() {
  if (state.loading) return state.loading;
  return (state.loading = (async () => {
    try {
      await need("checker.js", () => window.AgentProofChecker); await need("packs.js", () => window.AgentProofPacks);
      state.idx = await getJson("backtest/index.json"); state.err = null;
      await Promise.all((state.idx.receipts || []).map(async (e) => { try { state.recs.set(e.id, { e, r: await getJson(e.file) }); } catch (x) { state.recs.set(e.id, { e, err: String(x.message || x) }); } }));
    } catch (x) { state.err = String(x.message || x); state.loading = null; }
  })());
}
const loaded = () => [...state.recs.values()].filter((x) => x.r).map((x) => x.r);
const forAgent = (rs, h) => rs.filter((r) => r.agent && (r.agent.handle === h || r.agent.label === h));

// ---- shared bits ----
let dark = false;
const isDark = () => document.documentElement.dataset.theme === "dark" || (!!$("agentproof-portfolio#card") && document.documentElement.dataset.theme !== "light" && matchMedia("(prefers-color-scheme:dark)").matches);
const syncTheme = () => { dark = isDark(); document.querySelectorAll(".ap-packs").forEach((n) => n.classList.toggle("ap-dark", dark)); };
const MOCKBOX = (extra = "") => `<div class="ap-mock" role="note">Mock backtest. Not market evidence.<small>${extra || "No market hire, no payment. Scores here are test data and do not count toward any proof number."}</small></div>`;

function repHtml(rows) {
  return rows.map((p) => `<div><strong>${esc(p.agent)}</strong> <span class="ap-tag">MOCK</span><br>${p.jobs} ${p.jobs === 1 ? "job" : "jobs"} under <code>${esc(p.pack)}</code> v${esc(p.version)}, ${p.distinct_buyers} distinct ${p.distinct_buyers === 1 ? "buyer" : "buyers"}, ${p.pass_rate}% passed (${p.passed} of ${p.jobs}).<br><span class="dim">pass ${p.verdicts.pass}, fail ${p.verdicts.fail}, contested ${p.verdicts.contested}, incomplete ${p.verdicts.incomplete}. Inputs: ${p.input_origins.map(esc).join(", ")}.</span></div>`).join("");
}

// ---- panel ----
let panel, bodyEl, titleEl, view = { name: "list", agent: null }, opener = null;
function mountPanel() {
  if (panel) return;
  panel = document.createElement("aside"); panel.className = "ap-packs ap-panel"; panel.hidden = true; panel.setAttribute("role", "dialog"); panel.setAttribute("aria-label", "Check Packs, mock backtest");
  panel.innerHTML = `<div class="ap-head"><h2 id="apTitle" tabindex="-1">Check Packs</h2><span class="ap-tag">MOCK</span><span style="flex:1"></span><button type="button" data-act="close">Close</button></div><div class="ap-body" aria-live="polite"></div>`;
  document.body.append(panel); bodyEl = $(".ap-body", panel); titleEl = $("#apTitle", panel);
  panel.addEventListener("click", onClick);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !panel.hidden) { e.stopPropagation(); closePanel(); } }, true);
  syncTheme();
}
function openPanel(v, from) {
  mountPanel(); view = v || { name: "list", agent: null }; opener = from || document.activeElement; panel.hidden = false; render(true);
}
function closePanel() { if (!panel || panel.hidden) return; panel.hidden = true; if (opener && opener.isConnected) opener.focus(); }

async function render(focusTitle) {
  const top = bodyEl.scrollTop, act = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.act : null;
  if (!state.idx && !state.err) bodyEl.innerHTML = `${MOCKBOX()}<div class="ap-sk" aria-busy="true">Loading the backtest...</div>`;
  await ensure();
  if (view.name === "receipt") bodyEl.innerHTML = receiptHtml(view.id); else bodyEl.innerHTML = listHtml();
  bodyEl.scrollTop = focusTitle ? 0 : top;
  if (focusTitle) { titleEl.textContent = view.name === "receipt" ? "Check Packs: receipt" : "Check Packs"; titleEl.focus(); }
  else if (act) { const b = $(`[data-act="${act}"]`, bodyEl); if (b) b.focus(); }
}

function listHtml() {
  if (state.err) return `${MOCKBOX()}<div class="ap-box" role="alert"><strong>Could not load the backtest.</strong><span class="dim">${esc(state.err)}</span><div class="ap-acts"><button type="button" data-act="retry">Try again</button></div></div>`;
  const ents = state.idx.receipts || [];
  if (!ents.length) return `${MOCKBOX()}<div class="ap-box">No receipts in the backtest index yet.</div>`;
  const filt = view.agent, rs = loaded(), rep = window.AgentProofPacks.reputation(filt ? forAgent(rs, filt) : rs);
  const groups = new Map();
  for (const e of ents) { if (filt && !(e.agent === filt || (state.recs.get(e.id).r && forAgent([state.recs.get(e.id).r], filt).length))) continue; const k = e.pack || "unknown pack"; (groups.get(k) || groups.set(k, []).get(k)).push(e); }
  return `${MOCKBOX("Every receipt below is a test of the checker on stored or made-up work. Nothing here was hired or paid on the market.")}
  ${filt ? `<div class="ap-box"><div>Showing agent <strong>${esc(filt)}</strong> only.</div><div class="ap-acts"><button type="button" data-act="all">Show all receipts</button></div></div>` : ""}
  ${rep.length ? `<section class="ap-box rep" aria-label="Reputation, mock"><h3>Reputation per pack <span class="ap-tag">MOCK</span></h3>${repHtml(rep)}<span class="dim">Per agent and pack, never one overall number. Not market evidence.</span></section>` : ""}
  ${[...groups].map(([pk, es]) => `<section><h3>${esc(pk)} <span class="dim">(${es.length})</span></h3><ul class="ap-list">${es.map((e) => { const s = state.recs.get(e.id), r = s && s.r;
    if (!r) return `<li><div class="ap-row" role="group"><div class="l1"><strong>${esc(e.id)}</strong><span class="ap-tag">MOCK</span></div><span class="ap-st bad">Could not load: ${esc((s && s.err) || "unknown")}</span></div></li>`;
    return `<li><button type="button" class="ap-row" data-act="open" data-id="${esc(e.id)}"><span class="l1"><strong>${esc(e.id)}</strong><span class="ap-tag">${esc(originLabel(r.input_origin))}</span></span><span class="l1"><span>${esc(r.agent.label)}</span><span class="ap-pill">verdict: ${esc(r.verdict)}</span></span></button></li>`; }).join("")}</ul></section>`).join("")}`;
}

// ---- receipt view ----
const rs = new Map(); // per-receipt view state: { cur, tamper, res }
const rstate = (id) => { if (!rs.has(id)) rs.set(id, { cur: structuredClone(state.recs.get(id).r), tamper: null, res: null, busy: false }); return rs.get(id); };

function critHtml(c) {
  const st = c.status, cls = st === "pass" ? "pass" : st === "fail" || st === "contested" ? st : st === "not_checkable" || st === "no_quorum" ? "bad" : "";
  let h = `<div class="ap-crit"><strong>${esc(c.label)}</strong><div class="meta"><span>${esc(c.id)}</span><span>${esc(c.type)}</span><span>${esc(gateText(c.gate))}</span>${c.weight != null ? `<span>weight ${c.weight}</span>` : ""}</div>`;
  if (c.type === "witness") return h + `<div>${c.statement ? `“${esc(c.statement)}”` : '<span class="dim">No statement recorded.</span>'}</div><div class="dim">${c.by ? `by ${esc(c.by)}` : "no named witness"}${c.at ? `, ${esc(c.at)}` : ""}${c.ref ? `, ref: ${esc(c.ref)}` : ""}. Recorded as given: not recomputed.</div></div>`;
  h += `<div><span class="ap-st ${cls}">${esc(STATUS[st] || st)}</span>${c.detail ? ` <span class="dim">${esc(c.detail)}</span>` : ""}</div>`;
  if (c.type === "rubric") {
    h += `<div class="mono">median ${c.median ?? "none"}, spread ${c.spread ?? "none"}, valid scores ${c.valid_n ?? 0}${c.contested ? ' <span class="ap-st bad">CONTESTED: judges differ by 2 or more</span>' : ""}</div>`;
    h += (c.scores || []).map((s) => { const v = s.void || s.quote_found === false;
      return `<div class="ap-judge${v ? " void" : ""}"><div><strong>${esc(s.judge)}</strong> <span class="mono">${esc(s.model || "model unknown")}</span>: score ${v ? `<del>${esc(s.score)}</del> <span class="ap-void">VOID, not counted${s.quote_found === false ? ": quote not found in the judged text" : ""}</span>` : `<strong>${esc(s.score)}</strong>`}</div>${s.quote ? (v ? `<del><q>${esc(s.quote)}</q></del>` : `<q>${esc(s.quote)}</q>`) : '<span class="dim">no quote</span>'}${s.reason ? `<span class="dim">${esc(s.reason)}</span>` : ""}</div>`; }).join("");
  }
  return h + "</div>";
}

function receiptHtml(id) {
  const s = state.recs.get(id); if (!s || !s.r) return `${MOCKBOX()}<div class="ap-box" role="alert">Receipt ${esc(id)} could not be loaded: ${esc(s && s.err)}</div><div class="ap-acts"><button type="button" data-act="back">Back to the list</button></div>`;
  const st = rstate(id), r = st.cur, res = st.res, rep = r.criteria.filter((c) => c.type === "program" || c.type === "source_replay"), jd = r.criteria.filter((c) => c.type === "rubric"), wt = r.criteria.filter((c) => c.type === "witness"), t = r.trust || {}, c = r.commitment || {};
  let integ = `<span class="ap-int">NOT RE-CHECKED YET</span><span class="dim">Press Re-check to recompute it here.</span>`;
  if (st.busy) integ = `<span class="ap-int" aria-busy="true">Re-checking...</span>`;
  else if (res) { const n = res.recomputed.length, okn = res.recomputed.filter((x) => x.ok).length; integ = res.ok ? `<span class="ap-int ok">INTACT</span><span class="dim">${okn} of ${n} recomputed checks match.</span>` : `<span class="ap-int bad">BROKEN: ${n - okn} of ${n} do not match</span><span class="dim">The receipt no longer matches its own files.</span>`; }
  const j = t.judged || {};
  return `${MOCKBOX((r.evidence_note || "").replace(/^Mock backtest\. Not market evidence\.\s*/, ""))}
  <div><h3>${esc(r.id)} <span class="ap-tag">${esc(originLabel(r.input_origin))}</span></h3><div class="dim">agent ${esc(r.agent.label)}${r.agent.handle ? ` (${esc(r.agent.handle)})` : ""}, buyer ${esc(r.buyer_label)}, pack <code>${esc(r.pack.id)}</code> v${esc(r.pack.version)}</div></div>
  <div class="ap-two" role="group" aria-label="Integrity and verdict, two separate things"><div><span class="cap">Receipt integrity</span><div aria-live="polite">${integ}</div><span class="dim">Do the hashes and recomputed checks match.</span></div>
  <div><span class="cap">Verdict on the work</span><span class="ap-pill" style="width:fit-content">${esc(r.verdict)}</span><span class="dim">${esc(r.verdict_reason || VERDICT_NOTE[r.verdict] || "")}</span><span class="dim">A fail can be fully intact.</span></div></div>
  ${st.tamper ? `<div class="ap-mock" role="status">Tampered copy, in memory only: ${esc(st.tamper)}. Files on disk are unchanged.</div>` : ""}
  <section class="ap-box" aria-label="Commitment"><h4>Commitment</h4><dl><dt>Before delivery</dt><dd><strong>${c.before_delivery ? "yes" : "NO"}</strong></dd><dt>Note</dt><dd>${esc(c.note)}</dd><dt>Committed</dt><dd>${esc(c.committed_at)} (self-asserted)</dd><dt>Delivered</dt><dd>${esc(c.delivered_at || "not on record")}</dd></dl><span class="dim">Nothing here is anchored outside this file. Someone who rewrote every hash at once would not be caught.</span></section>
  <section class="ap-box rc" aria-label="Reproduced"><h4>Reproduced <span class="dim">program and source checks, same answer for anyone</span></h4><div class="mono">${t.reproduced ? `${t.reproduced.passed} of ${t.reproduced.total} passed${t.reproduced.hard_failed && t.reproduced.hard_failed.length ? `, hard gate failed: ${t.reproduced.hard_failed.map(esc).join(", ")}` : ""}` : ""}</div>${rep.map(critHtml).join("") || '<span class="dim">No reproduced checks.</span>'}</section>
  <section class="ap-box jd" aria-label="Judged"><h4>Judged <span class="dim">model opinions against written anchors, stored</span></h4><div class="mono">${j.rated ? `weighted median ${j.weighted_median} over ${j.rated} rated rubric${j.rated === 1 ? "" : "s"} (rubrics only, not an overall score)` : "no rubric rated"}, contested ${j.contested ?? 0}, void scores ${j.void ?? 0}, not run ${j.not_run ?? 0}</div>${jd.map(critHtml).join("") || '<span class="dim">No rubrics.</span>'}${r.panel ? `<span class="dim">Panel: ${r.panel.judges.map((x) => esc(x.label + " " + x.model)).join("; ")}. Prompt ${esc(r.panel.prompt_version)}.</span>` : '<span class="dim">No judge panel ran for this receipt.</span>'}</section>
  <section class="ap-box wt" aria-label="Witnessed"><h4>Witnessed <span class="dim">a person's statement, as given</span></h4>${wt.map(critHtml).join("") || '<span class="dim">No witness statements.</span>'}</section>
  <section class="ap-box" aria-label="Injection scan"><h4>Injection scan</h4>${r.injection && r.injection.flagged ? `<span class="ap-st bad">FLAGGED: instruction-like text in the delivery</span><ul class="ap-list">${(r.injection.matches || []).map((m) => `<li class="mono">${esc(m.pattern)}: ${esc(m.excerpt)}</li>`).join("")}</ul>${r.injection.judges_flagged != null ? `<span class="dim">Judges that also flagged it: ${esc(r.injection.judges_flagged)}.</span>` : ""}` : '<span>Nothing flagged by the program scan.</span>'}</section>
  ${(r.sources || []).length ? `<section class="ap-box" aria-label="Sources"><h4>Sources</h4><ul class="ap-list">${r.sources.map((x) => `<li class="mono">${esc(x.id)} ${esc(x.url)}<br><span class="dim">origin ${esc(x.origin)}, HTTP ${esc(x.http_status ?? "none")}, ${x.archive_file ? "archived" : "NO archive record"}</span></li>`).join("")}</ul></section>` : ""}
  <section class="ap-box" aria-label="Re-check"><h4>Re-check in this browser</h4>
    <div class="ap-acts"><button type="button" data-act="recheck" ${st.busy ? "disabled" : ""}>Re-check</button></div>
    <span class="dim">Tamper tests: change one thing in memory, re-run, watch integrity go red. Reset restores it.</span>
    <div class="ap-acts"><button type="button" data-act="t-deliverable">Flip a byte of the deliverable</button><button type="button" data-act="t-rubric">Flip a byte of the rubric (pack file)</button><button type="button" data-act="t-verdict">Change a stored score or verdict</button><button type="button" data-act="reset" ${st.tamper || st.res ? "" : "disabled"}>Reset</button></div>
    ${res ? `<div class="ap-two" style="grid-template-columns:1fr"><div><span class="cap">Receipt integrity</span>${integ}</div></div>${resHtml(res)}` : ""}</section>
  <details class="ap-box"><summary>Hashes</summary><dl class="mono"><dt>pack</dt><dd>${esc(r.pack.hash)}</dd><dt>job</dt><dd>${esc(r.job.hash)}</dd><dt>rubric</dt><dd>${esc(c.rubric_hash)}</dd><dt>deliverable</dt><dd>${esc(r.deliverable.sha256)}</dd><dt>receipt</dt><dd>${esc(r.receipt_hash)}</dd></dl></details>
  <div class="ap-acts"><button type="button" data-act="back">Back to the list</button></div>`;
}

function resHtml(res) {
  return `<h4>Recomputed in this browser</h4><ul class="ap-list ap-res">${[...res.recomputed].sort((a, b) => a.ok - b.ok).map((x) => `<li><span class="m ${x.ok ? "ok" : "bad"}">${x.ok ? "OK" : "FAIL"}</span><span>${esc(x.label)}${x.detail ? ` <span class="dim">${esc(x.detail)}</span>` : ""}</span></li>`).join("")}</ul>
  <h4>Judge opinions: stored, cannot be rerun here</h4><div class="dim">${res.opinions.length ? `${res.opinions.length} stored score${res.opinions.length === 1 ? "" : "s"}. Only the quote match and the arithmetic were recomputed above.` : "No judge scores in this receipt."}</div>
  <h4>Not recomputed</h4><ul class="ap-list">${res.not_recomputed.map((x) => `<li><strong>${esc(x.label)}</strong> <span class="dim">${esc(x.detail)}</span></li>`).join("") || '<li class="dim">none</li>'}</ul>`;
}

// Tampering touches only copies: the receipt object and bytes handed to recheck. Disk is never written.
const flip = (b, from) => { const o = new Uint8Array(b); let i = Math.floor(o.length * from); for (; i < o.length; i++) if (o[i] >= 48 && o[i] <= 57) break; if (i >= o.length) i = Math.floor(o.length / 2); o[i] = o[i] >= 48 && o[i] <= 57 ? 48 + ((o[i] - 47) % 10) : o[i] ^ 1; return o; };
async function runRecheck(id) {
  const st = rstate(id); st.busy = true; render(); const mutate = st.tamper && st.tamperFile;
  const load = async (p) => { const b = await loadBytes(p); return mutate && p === st.tamperFile ? flip(b, .5) : b; };
  try { st.res = await window.AgentProofPacks.recheck(st.cur, load); } catch (x) { st.res = { ok: false, recomputed: [{ id: "recheck-error", label: "Re-check could not run", ok: false, detail: String(x.message || x) }], not_recomputed: [], opinions: [] }; }
  st.busy = false; render();
}
function tamper(id, kind) {
  const st = rstate(id), orig = state.recs.get(id).r; st.cur = structuredClone(orig); st.tamperFile = null;
  if (kind === "deliverable") { st.tamper = "one byte of the deliverable file"; st.tamperFile = orig.deliverable.file; }
  else if (kind === "rubric") { st.tamper = "one byte of the pack file that holds the rubric"; st.tamperFile = orig.pack.file; }
  else { const sc = st.cur.criteria.flatMap((c) => c.scores || []).find((s) => typeof s.score === "number"); if (sc) { sc.score = sc.score % 5 + 1; st.tamper = `a stored judge score (${sc.judge}) changed to ${sc.score}`; } else { st.cur.verdict = st.cur.verdict === "pass" ? "fail" : "pass"; st.tamper = `the stored verdict changed to ${st.cur.verdict}`; } }
  runRecheck(id);
}

function onClick(e) {
  const b = e.target.closest("[data-act]"); if (!b) return; const a = b.dataset.act, id = view.id;
  if (a === "close") closePanel();
  else if (a === "retry") { state.loading = null; render(); }
  else if (a === "all") { view = { name: "list", agent: null }; render(true); }
  else if (a === "open") { view = { name: "receipt", id: b.dataset.id, agent: view.agent }; render(true); }
  else if (a === "back") { view = { name: "list", agent: view.agent }; render(true); }
  else if (a === "recheck") runRecheck(id);
  else if (a === "reset") { rs.delete(id); render(); }
  else if (a.startsWith("t-")) tamper(id, a.slice(2));
}

// ---- entry points ----
const repSection = async (handle) => {
  await ensure(); if (state.err) return null;
  const mine = forAgent(loaded(), handle); if (!mine.length) return null;
  const s = document.createElement("section"); s.className = "ap-packs ap-sec"; s.dataset.apAgent = handle; s.setAttribute("aria-label", "Check Packs reputation, mock backtest");
  s.innerHTML = `<div class="ap-box rep"><h3>Check Packs <span class="ap-tag">MOCK</span></h3>${MOCKBOX("Test data. These receipts do not change the proof numbers on the card above.")}${repHtml(window.AgentProofPacks.reputation(mine))}<div class="ap-acts"><button type="button" data-act="see">See receipts</button></div></div>`;
  $("[data-act=see]", s).addEventListener("click", (e) => openPanel({ name: "list", agent: handle }, e.currentTarget));
  return s;
};

function initTown() {
  const tools = $("#tools"), pb = $("#panelBody");
  const btn = document.createElement("button"); btn.type = "button"; btn.className = "chip ap-chip"; btn.textContent = "Check Packs (mock)"; btn.setAttribute("aria-haspopup", "dialog");
  btn.addEventListener("click", () => openPanel({ name: "list", agent: null }, btn)); const after = $("#analysisBtn"); (after ? after.after(btn) : tools.append(btn));
  // The card is replaced on every select(): add our section after it, once per card, without editing select().
  let busy = false;
  const attach = async () => {
    const card = pb.querySelector("agentproof-portfolio"); if (!card || busy || pb.querySelector(".ap-sec")) return; busy = true; const h = card.getAttribute("agent");
    try { const s = await repSection(h); const now = pb.querySelector("agentproof-portfolio"); if (s && now && now.getAttribute("agent") === h && !pb.querySelector(".ap-sec")) { pb.append(s); syncTheme(); } } finally { busy = false; }
    const c2 = pb.querySelector("agentproof-portfolio"); if (c2 && c2.getAttribute("agent") !== h) attach();
  };
  new MutationObserver(attach).observe(pb, { childList: true }); attach();
}

function initPortfolio() {
  const host = document.createElement("div"); host.className = "ap-packs-host"; const anchor = $("#src");
  anchor.after(host);
  const paint = async () => {
    const h = decodeURIComponent(location.hash.slice(1)).trim() || "ohwow-agent"; host.replaceChildren();
    const s = await repSection(h); const open = document.createElement("div"); open.className = "ap-packs"; open.innerHTML = `<div class="ap-acts"><button type="button" data-act="all">Open Check Packs (mock backtest)</button></div>`;
    if (location.hash.slice(1).trim() !== "" && decodeURIComponent(location.hash.slice(1)).trim() !== h) return;
    host.append(...(s ? [s] : []), open); $("button", open).addEventListener("click", (e) => openPanel({ name: "list", agent: null }, e.currentTarget)); syncTheme();
  };
  paint(); addEventListener("hashchange", paint);
}

function init() {
  const st = document.createElement("style"); st.textContent = css; document.head.append(st);
  syncTheme(); matchMedia("(prefers-color-scheme:dark)").addEventListener("change", syncTheme);
  if ($("#tools") && $("#panelBody")) initTown(); else if ($("#src") && $("agentproof-portfolio")) initPortfolio();
}
init();
