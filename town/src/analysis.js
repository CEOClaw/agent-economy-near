// Analysis panel: what the market's own numbers say, next to what the receipts prove.
// compute() is pure and Node-safe (scripts/check-analysis.mjs runs it); render() draws
// plain DOM + SVG into a container. No chart library. Browser global: window.AgentProofAnalysis.
(function (root) {
  const isOn = (a) => (a.available_now != null ? a.available_now === true : a.availability === "available" || a.availability === "available_now");
  const num = (v) => (typeof v === "number" && isFinite(v) ? v : null);
  const crossOwner = (r) => !r.self_hire && r.buyer_owner != null && r.seller_owner != null && r.buyer_owner !== r.seller_owner;
  // trusted: the run is one of the site's own (data/manifest.json); a dropped file never counts.
  const counted = (r) => !!(r.trusted === true && r.reproduced && r.outcome === "pass" && crossOwner(r));
  const BINS = [["0", 0, 0], ["1", 1, 1], ["2-3", 2, 3], ["4-7", 4, 7], ["8-15", 8, 15], ["16-31", 16, 31], ["32-63", 32, 63], ["64+", 64, null]];

  function median(xs) {
    const s = xs.slice().sort((a, b) => a - b), m = s.length >> 1;
    return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : null;
  }

  function compute(agentsIn, receiptsIn) {
    const seen = new Set(), agents = [];
    for (const a of agentsIn || []) if (a && a.handle != null && !seen.has(a.handle)) { seen.add(a.handle); agents.push(a); }
    const rcs = (receiptsIn || []).filter(Boolean), n = agents.length;
    const del = (a) => num(a.delivered_jobs) || 0;
    const delivered_total = agents.reduce((s, a) => s + del(a), 0);
    const zeroN = agents.filter((a) => del(a) === 0).length, onN = agents.filter(isOn).length;
    const share = (k) => (n ? k / n : 0);
    const histogram = BINS.map(([label, lo, hi]) => ({ label, lo, hi, count: agents.filter((a) => del(a) >= lo && (hi == null || del(a) <= hi)).length }));
    const top10 = agents.map(del).sort((a, b) => b - a).slice(0, 10).reduce((s, v) => s + v, 0);
    const catOf = new Map(agents.map((a) => [a.handle, a.category || "uncategorized"]));
    const cats = new Map();
    for (const a of agents) {
      const c = a.category || "uncategorized";
      if (!cats.has(c)) cats.set(c, { category: c, agents: 0, delivered: 0, proven: 0, resp: [] });
      const o = cats.get(c); o.agents++; o.delivered += del(a);
      if (num(a.response_time_seconds_median) != null) o.resp.push(a.response_time_seconds_median);
    }
    const receipts = rcs.map((r) => ({
      id: r.id ?? null, seller_handle: r.seller_handle ?? null, buyer_owner: r.buyer_owner ?? null, seller_owner: r.seller_owner ?? null,
      buyer_owner_label: r.buyer_owner_label ?? null, seller_owner_label: r.seller_owner_label ?? null,
      self_hire: r.self_hire === true, price_usdc: num(r.price_usdc), outcome: r.outcome ?? null,
      stored_digest: r.stored_digest ?? null, recomputed_digest: r.recomputed_digest ?? null, reproduced: !!r.reproduced, counted: counted(r),
      trusted: r.trusted === true, source: r.source ?? null,
    }));
    for (const r of receipts) if (r.counted && catOf.has(r.seller_handle)) cats.get(catOf.get(r.seller_handle)).proven++;
    const list = [...cats.values()];
    return {
      n, delivered_total,
      zero: { count: zeroN, share: share(zeroN) },
      available: { count: onN, share: share(onN) },
      histogram,
      top_share: { top10_delivered: top10, share: delivered_total ? top10 / delivered_total : 0 },
      categories: list.map(({ category, agents: k, delivered, proven }) => ({ category, agents: k, delivered, proven })).sort((a, b) => b.delivered - a.delivered || a.category.localeCompare(b.category)),
      scatter: agents.filter((a) => num(a.success_rate) != null).map((a) => ({ handle: a.handle, delivered: del(a), success_rate: a.success_rate })),
      response_by_category: list.filter((c) => c.resp.length).map((c) => ({ category: c.category, median_s: median(c.resp), n: c.resp.length })).sort((a, b) => a.median_s - b.median_s),
      proven_total: receipts.filter((r) => r.counted).length,
      receipts,
    };
  }

  // ---- text the panel shows (check-analysis.mjs prints these so QA can compare) ----
  const fmt = (v) => Number(v).toLocaleString("en-US");
  const pct = (x) => Math.round(x * 100) + "%";
  const nice = (c) => String(c).replace(/_/g, " ");
  const utc = (iso) => { const d = new Date(iso); return isNaN(d) ? null : d.toISOString().slice(0, 16).replace("T", " ") + " UTC"; };
  function dur(s) {
    if (s == null) return "not observed";
    if (s < 90) return Math.round(s) + " s";
    if (s < 5400) return Math.round(s / 60) + " min";
    if (s < 172800) return (s / 3600).toFixed(1).replace(/\.0$/, "") + " h";
    return (s / 86400).toFixed(1).replace(/\.0$/, "") + " days";
  }
  function sourceLine(source, fetched_at) {
    const t = fetched_at ? utc(fetched_at) : null;
    if (source === "relay" || source === "live") return "source: live via relay" + (t ? ", " + t : "");
    if (source === "snapshot" || source === "stale-snapshot") return "source: snapshot from " + (t || "an unknown time");
    return "source: " + (source || "unknown") + (t ? ", " + t : "");
  }
  function headline(s) {
    return {
      n: fmt(s.n),
      delivered_total: fmt(s.delivered_total),
      zero: `${fmt(s.zero.count)} of ${fmt(s.n)} (${pct(s.zero.share)})`,
      available: `${fmt(s.available.count)} of ${fmt(s.n)} (${pct(s.available.share)})`,
      proven_total: fmt(s.proven_total),
      top10: `${pct(s.top_share.share)} (${fmt(s.top_share.top10_delivered)} of ${fmt(s.delivered_total)})`,
    };
  }

  // ---- drawing ----
  const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const short = (d) => (d ? String(d).replace(/^sha256:/, "").slice(0, 8) : "none");
  const hash = (str) => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return ((h >>> 0) % 1000) / 1000; };

  const CSS = `
#analysis{--an-pad:20px;position:fixed;top:0;right:0;bottom:0;width:min(720px,100vw);z-index:60;overflow-y:auto;overscroll-behavior:contain;background:var(--card);color:var(--ink);border-left:1px solid var(--line);box-shadow:-12px 0 40px rgba(20,30,45,.18);font-family:var(--body);font-size:15px;line-height:1.45;-webkit-overflow-scrolling:touch}
#analysis{--an-mk:var(--request);--an-pv:var(--ok)}
:root[data-theme="dark"] #analysis{--an-mk:#3987e5;--an-pv:#26a874}
#analysis[hidden]{display:none}
@media (max-width:640px){#analysis{border-left:0;top:0;height:100dvh}}
#analysis .an-head{position:sticky;top:0;z-index:2;display:flex;align-items:flex-start;gap:12px;padding:16px var(--an-pad) 12px;background:var(--card);border-bottom:1px solid var(--line)}
#analysis .an-head h2{margin:0;font:600 22px/1.2 var(--display)}
#analysis .an-head p{margin:2px 0 0;color:var(--dim);font-size:13px}
#analysis .an-x{margin-left:auto;flex:none;min-width:44px;min-height:44px;margin-top:-6px;margin-right:-10px;border:0;background:none;color:var(--dim);font:600 26px/1 var(--display);cursor:pointer;border-radius:10px}
#analysis .an-x:hover,#analysis .an-x:focus-visible{color:var(--ink);background:var(--wash);outline:2px solid var(--request);outline-offset:-2px}
#analysis .an-body{padding:6px var(--an-pad) 40px}
#analysis section{padding:20px 0 22px;border-bottom:1px solid var(--line)}
#analysis section:last-of-type{border-bottom:0}
#analysis h3{margin:0 0 2px;font:600 18px/1.25 var(--display)}
#analysis .an-sub{margin:0 0 12px;color:var(--dim);font-size:13px}
#analysis .an-src{margin:10px 0 0;color:var(--faint);font:12px/1.4 var(--mono)}
#analysis .an-num{font-variant-numeric:tabular-nums}
#analysis .an-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:0}
#analysis .an-kpi{background:var(--wash);border:1px solid var(--line);border-radius:12px;padding:10px 12px}
#analysis .an-kpi dt{font-size:12px;color:var(--dim);margin:0}
#analysis .an-kpi dd{margin:2px 0 0;font:600 20px/1.2 var(--display);font-variant-numeric:tabular-nums}
#analysis .an-kpi dd small{display:block;font:400 12px/1.3 var(--body);color:var(--dim)}
#analysis .an-kpi.ok dd{color:var(--ok)}
#analysis .an-hist{display:grid;grid-template-columns:repeat(8,1fr);gap:6px;align-items:end;height:190px;margin:8px 0 0;padding:0;list-style:none;border-bottom:1px solid var(--line)}
#analysis .an-hist li{display:flex;flex-direction:column;justify-content:flex-end;height:100%;text-align:center;min-width:0}
#analysis .an-hist .v{font-size:12px;font-variant-numeric:tabular-nums;color:var(--ink);padding-bottom:2px}
#analysis .an-hist .b{background:var(--an-mk);border-radius:4px 4px 0 0;min-height:2px}
#analysis .an-hist .z .b{background:var(--faint);background-image:repeating-linear-gradient(135deg,transparent 0 5px,rgba(255,255,255,.35) 5px 7px)}
#analysis .an-hist-x{display:grid;grid-template-columns:repeat(8,1fr);gap:6px;margin:4px 0 0;padding:0;list-style:none;text-align:center;font-size:12px;color:var(--dim);font-variant-numeric:tabular-nums}
#analysis .an-axis{margin:4px 0 0;text-align:center;font-size:12px;color:var(--faint)}
#analysis .an-call{margin:12px 0 0;padding:8px 12px;border-left:3px solid var(--faint);background:var(--wash);border-radius:0 8px 8px 0;font-size:14px}
#analysis .an-call b{font-variant-numeric:tabular-nums}
#analysis .an-key{display:flex;flex-wrap:wrap;gap:6px 16px;margin:0 0 10px;font-size:13px;color:var(--dim)}
#analysis .an-key i{display:inline-block;width:12px;height:12px;border-radius:3px;vertical-align:-1px;margin-right:6px}
#analysis .an-rows{display:grid;grid-template-columns:minmax(0,max-content) 1fr;gap:8px 12px;align-items:center;margin:0;padding:0;list-style:none}
#analysis .an-rows>li{display:contents}
#analysis .an-rows .an-nm{font-size:13px;white-space:nowrap}
#analysis .an-rows .an-few .an-nm,#analysis .an-rows .an-few .an-pair{opacity:.55}
#analysis .an-rows .an-nm small{color:var(--faint);font-variant-numeric:tabular-nums}
#analysis .an-pair{display:grid;gap:3px;min-width:0}
#analysis .an-bar{display:flex;align-items:center;gap:6px;height:14px;font-size:12px;font-variant-numeric:tabular-nums;color:var(--dim)}
#analysis .an-bar s{display:block;height:100%;min-width:2px;border-radius:0 4px 4px 0;text-decoration:none}
#analysis .an-bar.m s{background:var(--an-mk)}
#analysis .an-bar.p s{background:var(--an-pv)}
#analysis .an-bar.r s{background:var(--an-mk)}
#analysis .an-bar.p.zero{color:var(--faint)}
#analysis svg.an-sc{display:block;width:100%;height:auto;overflow:visible}
#analysis svg.an-sc text{font-family:var(--body);fill:var(--dim);font-size:15px;font-variant-numeric:tabular-nums}
#analysis svg.an-sc .ln{stroke:var(--line);stroke-width:1}
#analysis svg.an-sc .pt{fill:var(--an-mk);fill-opacity:.7;stroke:var(--card);stroke-width:1.5}
#analysis svg.an-sc .ring{fill:none;stroke:var(--fail);stroke-width:2.5;stroke-dasharray:6 4}
#analysis svg.an-sc .cap{fill:var(--ink);font-weight:700}
@media (max-width:640px){#analysis svg.an-sc text{font-size:24px}}
#analysis .an-stack{display:flex;height:26px;border-radius:8px;overflow:hidden;border:1px solid var(--line);margin:6px 0 6px}
#analysis .an-stack i{display:block;height:100%}
#analysis .an-stack .on{background:var(--an-mk);box-shadow:2px 0 0 var(--card)}
#analysis .an-stack .off{background:var(--wash);background-image:repeating-linear-gradient(135deg,transparent 0 5px,var(--line) 5px 7px)}
#analysis .an-twrap{overflow-x:auto;margin:0 calc(var(--an-pad) * -1);padding:0 var(--an-pad)}
#analysis table{border-collapse:collapse;width:100%;min-width:600px;font-size:13px}
#analysis th{text-align:left;font-weight:600;color:var(--dim);font-size:12px;padding:6px 10px 6px 0;border-bottom:1px solid var(--line);white-space:nowrap}
#analysis td{padding:8px 10px 8px 0;border-bottom:1px solid var(--line);vertical-align:top}
#analysis td.mono,#analysis .mono{font-family:var(--mono);font-size:12px;font-variant-numeric:tabular-nums}
#analysis .an-tag{display:inline-block;padding:1px 8px;border-radius:999px;font-size:12px;font-weight:600;border:1px solid currentColor;white-space:nowrap}
#analysis .an-tag.ok{color:var(--ok)}
#analysis .an-tag.rep{color:var(--rep)}
#analysis .an-tag.fail{color:var(--fail)}
#analysis .an-tag.nil{color:var(--dim)}
#analysis .an-empty{color:var(--dim);font-size:14px}
`;

  function style() {
    if (document.getElementById("an-style")) return;
    const s = document.createElement("style"); s.id = "an-style"; s.textContent = CSS; document.head.appendChild(s);
  }

  const sec = (title, sub, body, src, label) => `<section${label ? ` aria-label="${esc(label)}"` : ""}><h3>${esc(title)}</h3><p class="an-sub">${esc(sub)}</p>${body}<p class="an-src">${esc(src)}</p></section>`;

  function histogram(s, src) {
    const max = Math.max(1, ...s.histogram.map((b) => b.count));
    const lis = s.histogram.map((b) => `<li class="${b.lo === 0 ? "z" : ""}" title="${esc(`${b.label} jobs: ${fmt(b.count)} agents`)}"><span class="v">${fmt(b.count)}</span><span class="b" style="height:${(b.count / max) * 150}px"></span></li>`).join("");
    const xs = s.histogram.map((b) => `<li>${esc(b.label)}</li>`).join("");
    const alt = s.histogram.map((b) => `${b.label} jobs: ${b.count} agents`).join("; ");
    const h = headline(s);
    return sec(`${pct(s.zero.share)} of agents have never delivered a job`, "Agents by jobs the market says they delivered. Bins double in size, so this is a log scale on the x axis.",
      `<ul class="an-hist" role="img" aria-label="${esc(alt)}">${lis}</ul><ul class="an-hist-x" aria-hidden="true">${xs}</ul><p class="an-axis">jobs delivered per agent (log bins)</p>
      <p class="an-call"><b>${esc(h.zero)}</b> sit in the first bar: zero deliveries. The 10 busiest agents hold <b>${esc(h.top10)}</b> of all delivered jobs, a long tail.</p>`, src);
  }

  function categories(s, src) {
    const max = Math.max(1, ...s.categories.map((c) => c.delivered));
    const w = (v) => (v / max) * 100;
    const rows = s.categories.map((c) => `<li><span class="an-nm">${esc(nice(c.category))} <small>${fmt(c.agents)}</small></span><span class="an-pair">
      <span class="an-bar m"><s style="width:calc(${w(c.delivered)}% * .82)"></s>${fmt(c.delivered)}</span>
      <span class="an-bar p${c.proven ? "" : " zero"}"><s style="width:${c.proven ? `max(3px,calc(${w(c.proven)}% * .82))` : "2px"}"></s>${fmt(c.proven)} proven</span></span></li>`).join("");
    const alt = s.categories.map((c) => `${nice(c.category)}: ${c.delivered} delivered, ${c.proven} proven`).join("; ");
    return sec(s.proven_total ? `Only ${fmt(s.proven_total)} of ${fmt(s.delivered_total)} delivered jobs is proof-backed` : `None of ${fmt(s.delivered_total)} delivered jobs is proof-backed yet`,
      "Per category: jobs the market says were delivered (blue) next to jobs with a re-checked receipt from a different owner (green). The small number is the agent count.",
      `<div class="an-key"><span><i style="background:var(--an-mk)"></i>delivered, on the market's word</span><span><i style="background:var(--an-pv)"></i>proven, re-checked here</span></div><ul class="an-rows" role="img" aria-label="${esc(alt)}">${rows}</ul>`, src);
  }

  function scatter(s, src) {
    const W = 640, H = 340, L = 56, R = 16, T = 40, B = 52, pw = W - L - R, ph = H - T - B;
    const maxD = Math.max(10, ...s.scatter.map((p) => p.delivered));
    const lo = Math.log10(0.3), hi = Math.log10(maxD * 1.3);
    const X = (d) => L + ((Math.log10(d || 0.5) - lo) / (hi - lo)) * pw, Y = (r) => T + ph - (r / 100) * ph;
    const grid = [0, 50, 100].map((v) => `<line class="ln" x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${L - 8}" y="${Y(v) + 6}" text-anchor="end">${v}%</text>`).join("");
    const ticks = [0, 1, 10, 100, 1000].filter((t) => t <= maxD * 1.3).map((t) => `<text x="${X(t)}" y="${H - B + 24}" text-anchor="middle">${t}</text>`).join("");
    const pts = s.scatter.map((p) => `<circle class="pt" cx="${(X(p.delivered) * (1 + (hash(p.handle) - 0.5) * 0.03) + (p.delivered <= 1 ? (hash(p.handle + "x") - 0.5) * 18 : 0)).toFixed(1)}" cy="${(Y(p.success_rate) + (hash(p.handle + "y") - 0.5) * 9).toFixed(1)}" r="5"><title>${esc(`${p.handle}: ${p.success_rate}% on ${fmt(p.delivered)} delivered`)}</title></circle>`).join("");
    const cl = s.scatter.filter((p) => p.delivered === 1 && p.success_rate === 100).length;
    const note = cl ? `<ellipse class="ring" cx="${X(1)}" cy="${Y(100)}" rx="30" ry="18"/><line class="ln" style="stroke:var(--fail)" x1="${X(1)}" x2="${X(1)}" y1="${Y(100) - 18}" y2="${T - 16}"/><text class="cap" x="${L}" y="${T - 20}">${cl} agents: 100% on 1 job</text>` : "";
    const alt = `${s.scatter.length} agents with a success rate. ${cl} of them show 100% on exactly 1 delivered job.`;
    return sec("A 100% success rate on 1 job is not evidence", `Success rate the market reports (up) against jobs delivered (across, log scale, zero shown at the left edge). ${fmt(s.scatter.length)} of ${fmt(s.n)} agents report a rate at all.`,
      `<svg class="an-sc" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(alt)}">${grid}<line class="ln" x1="${L}" x2="${L}" y1="${T}" y2="${T + ph}"/>${pts}${note}${ticks}<text x="${L + pw / 2}" y="${H - 6}" text-anchor="middle">jobs delivered (log scale)</text></svg>`, src);
  }

  function response(s, src) {
    const lg = (v) => Math.log10(1 + v), max = Math.max(1, ...s.response_by_category.map((c) => lg(c.median_s)));
    const rows = s.response_by_category.map((c) => `<li${c.n < 3 ? ' class="an-few" title="too few to rank"' : ""}><span class="an-nm">${esc(nice(c.category))} <small>${fmt(c.n)}${c.n < 3 ? ", too few to rank" : ""}</small></span><span class="an-pair"><span class="an-bar r"><s style="width:calc(${(lg(c.median_s) / max) * 100}% * .8)"></s>${esc(dur(c.median_s))}</span></span></li>`).join("");
    const alt = s.response_by_category.map((c) => `${nice(c.category)}: ${dur(c.median_s)} (${c.n} agents)`).join("; ");
    // A category with one or two agents is an anecdote, so the headline only compares ones with 3 or more.
    const big = s.response_by_category.filter((c) => c.n >= 3), f = big[0], l = big[big.length - 1];
    return sec(f ? `${nice(f.category)} answers fastest (${dur(f.median_s)}), ${nice(l.category)} slowest (${dur(l.median_s)})` : "Not enough response times reported",
      "Median of each agent's own median response time, by category. Bar length is log scale, so a few seconds and a few hours both show. The small number is how many agents report one. Categories with fewer than 3 reporting agents are listed but not ranked.",
      s.response_by_category.length ? `<ul class="an-rows" role="img" aria-label="${esc(alt)}">${rows}</ul>` : `<p class="an-empty">not observed</p>`, src);
  }

  function availability(s, src) {
    const on = s.available.share * 100, h = headline(s);
    return sec(`${pct(s.available.share)} of agents say they can take a job right now`, "Agents whose listing says available now.",
      `<div class="an-stack" role="img" aria-label="${esc(`${h.available} available now`)}"><i class="on" style="width:${on}%"></i><i class="off" style="width:${100 - on}%"></i></div>
      <div class="an-key"><span><i style="background:var(--an-mk)"></i>available now: <b class="an-num">${esc(h.available)}</b></span><span><i style="background:var(--wash);border:1px solid var(--line)"></i>not available: <b class="an-num">${fmt(s.n - s.available.count)}</b></span></div>`, src);
  }

  function receiptsTable(s) {
    if (!s.receipts.length) return sec("No receipts to re-check", "Run files give the proof side of every number above.", `<p class="an-empty">none yet</p>`, "source: run files in this repo");
    const rows = s.receipts.map((r) => {
      const own = r.self_hire ? `<span class="an-tag rep">self-hire</span>` : r.buyer_owner != null && r.seller_owner != null && r.buyer_owner !== r.seller_owner ? `<span class="an-tag ok">cross-owner</span>` : `<span class="an-tag nil">owner unknown</span>`;
      const v = r.counted ? `<span class="an-tag ok">counted</span>` : !r.trusted ? `<span class="an-tag fail">unverified</span><br><span style="color:var(--dim)">from ${esc(r.source || "unknown source")}</span>` : !r.reproduced ? `<span class="an-tag fail">digest differs</span>` : r.outcome !== "pass" ? `<span class="an-tag fail">${esc(r.outcome || "no outcome")}</span>` : `<span class="an-tag rep">not counted</span>`;
      const same = r.stored_digest && r.recomputed_digest && r.stored_digest === r.recomputed_digest;
            // An unverified row's owners and price are only what its file claims: greyed and labelled, not stated as fact.
      const cl = (x) => (r.trusted ? x : `<span style="color:var(--faint)">claims ${x}</span>`);
      return `<tr><td class="mono">${esc(String(r.id || "").slice(0, 8) || "none")}</td><td>${cl(esc(r.buyer_owner_label ?? "not observed"))}</td><td>${esc(r.seller_handle ?? "not observed")}<br><span class="mono" style="color:var(--dim)">${cl(esc(r.seller_owner_label ?? "not observed"))}</span></td><td>${r.trusted ? own : cl(own.replace("an-tag ok", "an-tag nil"))}</td><td class="mono">${cl(r.price_usdc == null ? "not observed" : "$" + r.price_usdc)}</td><td>${v}<br><span style="color:var(--dim)">checker: ${esc(r.outcome ?? "none")}</span></td><td class="mono">${esc(short(r.stored_digest))}<br>${esc(short(r.recomputed_digest))}<br><span style="color:${same ? "var(--ok)" : "var(--fail)"}">${same ? "match" : "no match"}</span></td></tr>`;
    }).join("");
    return sec(s.proven_total ? `${fmt(s.proven_total)} receipt${s.proven_total === 1 ? "" : "s"} survive${s.proven_total === 1 ? "s" : ""} the checker and the owner test` : "No receipt survives the checker and the owner test",
      "A receipt counts only if it is one of this site's runs, the checker re-run here gives the stored digest, the outcome is pass, and the buyer's owner differs from the seller's. A dropped file is unverified: its owners are only what it says.",
      `<div class="an-twrap"><table><thead><tr><th>Job</th><th>Buyer owner</th><th>Seller</th><th>Owners</th><th>Price</th><th>Verdict</th><th title="first 8 hex">Digest: stored, recomputed</th></tr></thead><tbody>${rows}</tbody></table></div>`,
      "source: run files in this repo, re-checked in your browser when the page loaded");
  }

  function render(container, data) {
    style();
    const d = data || {}, s = compute(d.agents, d.receipts), src = sourceLine(d.source, d.fetched_at), h = headline(s);
    container.classList.add("an-root");
    container.setAttribute("aria-label", "Analysis: the market's numbers next to the proof");
    const kpi = (k, v, sub, cls) => `<div class="an-kpi ${cls || ""}"><dt>${k}</dt><dd>${esc(v)}${sub ? `<small>${esc(sub)}</small>` : ""}</dd></div>`;
    container.innerHTML = `<div class="an-head"><div><h2 id="an-title">What the numbers say</h2><p>${esc(src)}</p></div><button type="button" class="an-x" aria-label="Close analysis">&times;</button></div>
    <div class="an-body" role="region" aria-labelledby="an-title"><section><dl class="an-kpis">${kpi("agents listed", h.n)}${kpi("delivered, market's word", h.delivered_total)}${kpi("never delivered", pct(s.zero.share), `${fmt(s.zero.count)} of ${fmt(s.n)}`)}${kpi("available now", pct(s.available.share), `${fmt(s.available.count)} of ${fmt(s.n)}`)}${kpi("proven, re-checked", h.proven_total, "from different owners", "ok")}</dl><p class="an-src">${esc(src)}</p></section>
    ${histogram(s, src)}${categories(s, src)}${scatter(s, src)}${response(s, src)}${availability(s, src)}${receiptsTable(s)}</div>`;
    // Hiding is the host's job; this only tells it the viewer asked to close.
    container.querySelector(".an-x").addEventListener("click", () => { container.hidden = true; container.dispatchEvent(new CustomEvent("analysis:close", { bubbles: true })); });
    return s;
  }

  const api = { compute, render, headline, sourceLine };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AgentProofAnalysis = api;
})(typeof window !== "undefined" ? window : globalThis);
