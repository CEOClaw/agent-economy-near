// Check Packs: pure rules for packs, receipts, re-check and per-pack reputation.
// Spec: docs/check-pack-spec.md. Works in the browser (window.AgentProofPacks) and in Node (module.exports).
// Only web-platform APIs (crypto.subtle, TextEncoder/TextDecoder, DecompressionStream) so the browser
// and Node produce byte-identical judge text and hashes. No Buffer, no zlib, no DOM.
(function (root) {
  const C = typeof module !== "undefined" && module.exports ? require("./checker.js") : root.AgentProofChecker;
  const { canonicalJson } = C;
  const enc = new TextEncoder(), dec = new TextDecoder("utf-8");
  const PACK_SCHEMA = "agentproof-check-pack-v1", RECEIPT_SCHEMA = "agentproof-pack-receipt-v1";
  const JOB_SCHEMA = "agentproof-pack-job-v1", JUDGE_RUN_SCHEMA = "agentproof-judge-run-v1";
  const TRUST = { program: "Reproduced", source_replay: "Reproduced", rubric: "Judged", witness: "Witnessed" };
  const QUOTE_MIN = 12;

  // ---- hashing ----
  const hex = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
  const toBytes = (x) => (typeof x === "string" ? enc.encode(x) : x);
  const sha256 = async (x) => hex(await root.crypto.subtle.digest("SHA-256", toBytes(x)));
  const hashJson = (v) => sha256(canonicalJson(v));
  const text = (u8) => dec.decode(u8);
  const parseJson = (u8) => { try { return JSON.parse(text(u8)); } catch { return undefined; } };

  // ---- text normalisation, quote matching, judge text ----
  // Deterministic, case-sensitive; used for quote matching and copy matching alike.
  function normalize(s) {
    return String(s).normalize("NFKC")
      .replace(/[\u2018\u2019\u201A\u201B]/g, "'").replace(/[\u201C\u201D\u201E\u201F]/g, '"')
      .replace(/[\u2010-\u2015\u2212]/g, "-").replace(/\s+/g, " ").trim();
  }
  const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00a0", copy: "\u00a9", mdash: "\u2014", ndash: "\u2013", hellip: "\u2026", rarr: "\u2192", larr: "\u2190", lsquo: "\u2018", rsquo: "\u2019", ldquo: "\u201C", rdquo: "\u201D", middot: "\u00b7", bull: "\u2022", times: "\u00d7" };
  const cp = (n) => (n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : "");
  const decodeEntities = (s) => s.replace(/&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi, (m, d, h, n) =>
    d ? cp(+d) : h ? cp(parseInt(h, 16)) : (ENTITIES[n.toLowerCase()] ?? m));
  const TB = "(?:[^>\"']|\"[^\"]*\"|'[^']*')*"; // tag body: a > inside a quoted attribute does not end the tag
  const BLOCK = "p|div|section|article|header|footer|main|nav|aside|h[1-6]|li|ul|ol|br|tr|table|form|blockquote|pre|hr|button|label";
  function htmlToText(raw) {
    const s = raw.replace(/<!--[\s\S]*?-->/g, " ").replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, " ").replace(/<![^>]*>/g, " ")
      .replace(new RegExp("</?(?:" + BLOCK + ")\\b" + TB + ">", "gi"), "\n").replace(new RegExp("</?[a-zA-Z]" + TB + ">", "g"), " ");
    return decodeEntities(s).split("\n").map((l) => l.replace(/[ \t\f\r\u00a0]+/g, " ").trim()).filter(Boolean).join("\n");
  }
  const isHtml = (mt) => /^text\/html\b/i.test(mt || "");
  const isText = (mt) => isHtml(mt) || /^text\//i.test(mt || "") || /^application\/json\b/i.test(mt || "");
  const redact = (t, names) => (names || []).slice().sort((a, b) => b.length - a.length).reduce((acc, n) => (n ? acc.split(n).join("[seller]") : acc), t);
  // What the judges see, and what quotes are matched against. null = no text rendition.
  function judgeText(bytes, mediaType, job) {
    if (!isText(mediaType)) return null;
    const raw = text(bytes);
    const t = isHtml(mediaType) ? htmlToText(raw) : raw.replace(/\r\n?/g, "\n");
    return redact(t, job && job.params && job.params.redact);
  }
  const quoteFound = (quote, jt) => typeof quote === "string" && normalize(quote).length >= QUOTE_MIN && jt != null && normalize(jt).includes(normalize(quote));

  // ---- injection scan: instruction-like text in the raw deliverable (visible, hidden, comments) ----
  const INJECTION = [
    ["ignore-previous", /ignore\s+(?:all\s+|any\s+|the\s+)?(?:previous|prior|above|earlier)\s+(?:instructions?|prompts?|rules)/i],
    ["disregard", /disregard\s+(?:all\s+|any\s+|the\s+)?(?:previous|prior|above|earlier|your)\s+(?:instructions?|prompts?|rules)/i],
    ["system-prompt", /\b(?:system|developer)\s+(?:prompt|message|override)\b/i],
    ["role-reassign", /\byou\s+are\s+(?:now\s+)?(?:a\s+|an\s+|the\s+)?(?:judge|grader|evaluator|reviewer|assistant|language\s+model|ai)\b/i],
    ["score-demand", /\b(?:give|award|assign|rate|score)\b[^.\n]{0,40}\b(?:5|five)\s*(?:\/\s*5|out\s+of\s+5|stars?)/i],
    ["mark-perfect", /\b(?:mark|rate|score|grade)\s+this\s+(?:deliverable\s+|work\s+|submission\s+|page\s+)?(?:as\s+)?(?:perfect|excellent|the\s+highest|a\s+5)/i],
    ["new-instructions", /\bnew\s+instructions?\b/i],
    ["chat-markup", /<\|?(?:im_start|im_end|system)\|?>/i],
    ["addressed-to-judge", /\b(?:judges?|graders?|evaluators?)\s*[,:]\s*(?:you\s+)?(?:must|should|please|always)\b/i],
  ];
  function scanInjection(bytes, mediaType) {
    if (!isText(mediaType)) return { flagged: false, matches: [] };
    const raw = text(bytes), matches = [];
    for (const [pattern, re] of INJECTION) {
      const m = re.exec(raw);
      if (m) matches.push({ pattern, excerpt: normalize(raw.slice(Math.max(0, m.index - 30), m.index + m[0].length + 30)).slice(0, 100) });
    }
    return { flagged: matches.length > 0, matches };
  }

  // ---- rubric aggregation, trust block, verdict ----
  const validScore = (n) => Number.isInteger(n) && n >= 1 && n <= 5;
  function aggregate(scores, gate) {
    const v = scores.filter((s) => !s.void).map((s) => s.score).sort((a, b) => a - b), n = v.length;
    if (n < 2) return { median: null, spread: null, valid_n: n, contested: false, status: "no_quorum" };
    const median = n % 2 ? v[(n - 1) / 2] : (v[n / 2 - 1] + v[n / 2]) / 2, spread = v[n - 1] - v[0], contested = spread >= 2;
    const status = contested ? "contested" : gate && typeof gate === "object" && gate.min != null ? (median >= gate.min ? "pass" : "fail") : "pass";
    return { median, spread, valid_n: n, contested, status };
  }
  const gatedRubric = (c) => c.type === "rubric" && c.gate && typeof c.gate === "object";
  function trustBlock(criteria) {
    const rep = criteria.filter((c) => c.type === "program" || c.type === "source_replay"), rub = criteria.filter((c) => c.type === "rubric");
    const counted = rep.filter((c) => c.status !== "not_applicable"), rated = rub.filter((c) => c.status === "pass" || c.status === "fail");
    const w = rated.reduce((a, c) => a + c.weight, 0);
    return {
      reproduced: { passed: counted.filter((c) => c.status === "pass").length, total: counted.length, hard_failed: rep.filter((c) => c.gate === "hard" && c.status === "fail").map((c) => c.id) },
      judged: { weighted_median: w ? Math.round(rated.reduce((a, c) => a + c.weight * c.median, 0) / w * 100) / 100 : null, rated: rated.length,
        contested: rub.filter((c) => c.status === "contested").length, void: rub.reduce((a, c) => a + (c.scores || []).filter((s) => s.void).length, 0), not_run: rub.filter((c) => c.status === "not_run").length },
      witnessed: criteria.filter((c) => c.type === "witness" && c.statement).map((c) => ({ id: c.id, statement: c.statement })),
    };
  }
  // Fail closed: anything unscored or uncheckable on a gate is incomplete, never a pass.
  function decide(criteria) {
    const hardFail = criteria.filter((c) => c.gate === "hard" && c.status === "fail").map((c) => c.id);
    if (hardFail.length) return { verdict: "fail", verdict_reason: "hard gate failed: " + hardFail.join(", ") };
    const below = criteria.filter((c) => gatedRubric(c) && c.status === "fail");
    if (below.length) return { verdict: "fail", verdict_reason: "rubric below minimum: " + below.map((c) => `${c.id} (median ${c.median} < ${c.gate.min})`).join(", ") };
    const contested = criteria.filter((c) => gatedRubric(c) && c.status === "contested").map((c) => c.id);
    if (contested.length) return { verdict: "contested", verdict_reason: "judges disagree by 2 or more on a gated rubric: " + contested.join(", ") };
    const unchecked = criteria.filter((c) => c.gate === "hard" && c.status === "not_checkable").map((c) => c.id);
    const unscored = criteria.filter((c) => gatedRubric(c) && (c.status === "not_run" || c.status === "no_quorum"));
    if (unchecked.length || unscored.length)
      return { verdict: "incomplete", verdict_reason: [unchecked.length && "hard check not checkable: " + unchecked.join(", "), unscored.length && "gated rubric not scored: " + unscored.map((c) => `${c.id} (${c.status})`).join(", ")].filter(Boolean).join("; ") };
    return { verdict: "pass", verdict_reason: "every hard gate passed and every gated rubric met its minimum" };
  }

  // ---- shared parsing helpers ----
  const latin1 = (u8) => { let s = ""; for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode.apply(null, u8.subarray(i, i + 8192)); return s; };
  const concat = (parts) => { const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; };
  async function inflate(u8) {
    try {
      const ds = new DecompressionStream("deflate"), w = ds.writable.getWriter();
      w.write(u8).catch(() => {}); w.close().catch(() => {});
      const r = ds.readable.getReader(), parts = [];
      for (;;) { const { done, value } = await r.read(); if (done) break; parts.push(value); }
      return concat(parts);
    } catch { return null; }
  }
  const eq = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

  function parseCsv(s) {
    const rows = []; let row = [], f = "", q = false, any = false;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (q) { if (ch === '"') { if (s[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += ch; continue; }
      if (ch === '"') { q = true; any = true; } else if (ch === ",") { row.push(f); f = ""; any = true; }
      else if (ch === "\n" || ch === "\r") { if (ch === "\r" && s[i + 1] === "\n") i++; if (any || f) { row.push(f); rows.push(row); } row = []; f = ""; any = false; }
      else { f += ch; any = true; }
    }
    if (any || f) { row.push(f); rows.push(row); }
    return rows;
  }

  // PNG: chunk list with CRC check. Returns {chunks:[{type,data}]} or {error}.
  let crcTable;
  function crc32(u8) {
    if (!crcTable) crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
    let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = crcTable[(c ^ u8[i]) & 255] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }
  const SIG = [137, 80, 78, 71, 13, 10, 26, 10];
  function parsePng(u8) {
    if (u8.length < 33 || !SIG.every((b, i) => u8[i] === b)) return { error: "not a PNG: bad signature" };
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), chunks = [];
    let o = 8;
    while (o + 12 <= u8.length) {
      const len = dv.getUint32(o), type = latin1(u8.subarray(o + 4, o + 8));
      if (o + 12 + len > u8.length) return { error: `chunk ${type} runs past end of file` };
      const body = u8.subarray(o + 4, o + 8 + len);
      if (crc32(body) !== dv.getUint32(o + 8 + len)) return { error: `bad CRC in chunk ${type}` };
      chunks.push({ type, data: u8.subarray(o + 8, o + 8 + len) });
      o += 12 + len;
      if (type === "IEND") break;
    }
    if (!chunks.length || chunks[0].type !== "IHDR") return { error: "IHDR is not the opening chunk" };
    if (chunks[chunks.length - 1].type !== "IEND") return { error: "no IEND chunk" };
    if (!chunks.some((c) => c.type === "IDAT")) return { error: "no IDAT chunk" };
    return { chunks };
  }
  const PNG_META = ["tEXt", "iTXt", "zTXt", "eXIf", "tIME"];

  // PDF (uncompressed only). Anything needing a decompressor is not_checkable, never a guess.
  function pdfGuard(s) {
    if (!/^%PDF-/.test(s)) return "not a PDF: no %PDF- header";
    if (/\/ObjStm\b|\/FlateDecode\b|\/Filter\b|\/Encrypt\b/.test(s)) return "not checkable: PDF uses object streams, filters or encryption";
    return null;
  }
  function pdfPages(s) {
    const objs = new Map();
    for (const m of s.matchAll(/(\d+)\s+\d+\s+obj\b([\s\S]*?)\bendobj/g)) objs.set(+m[1], m[2]);
    const refs = (t) => [...t.matchAll(/(\d+)\s+\d+\s+R/g)].map((m) => +m[1]);
    const isPage = (b) => /\/Type\s*\/Page(?![A-Za-z])/.test(b), isNode = (b) => /\/Type\s*\/Pages(?![A-Za-z])/.test(b);
    const walk = (id, out, seen) => {
      const b = objs.get(id); if (b == null || seen.has(id)) return; seen.add(id);
      if (isPage(b)) out.push(id); else if (isNode(b)) { const k = /\/Kids\s*\[([^\]]*)\]/.exec(b); if (k) for (const r of refs(k[1])) walk(r, out, seen); }
    };
    const order = [], rootId = [...objs].find(([, b]) => isNode(b) && !/\/Parent\b/.test(b));
    if (rootId) walk(rootId[0], order, new Set());
    const ids = order.length ? order : [...objs].filter(([, b]) => isPage(b)).map(([id]) => id);
    return ids.map((id) => {
      const c = /\/Contents\s*(\[[^\]]*\]|\d+\s+\d+\s+R)/.exec(objs.get(id)), toks = [];
      for (const r of c ? refs(c[1]) : []) {
        const body = objs.get(r) || "", st = /stream\r?\n([\s\S]*?)\r?\nendstream|stream\r?\n([\s\S]*?)endstream/.exec(body), data = st ? (st[1] ?? st[2]) : "";
        for (const t of data.matchAll(/\(((?:\\[\s\S]|[^\\()])*)\)/g)) toks.push(t[1].replace(/\\([nrtbf()\\])/g, (_, k) => ({ n: "\n", r: "\r", t: "\t", b: "\b", f: "\f" }[k] ?? k)));
      }
      return normalize(toks.join(" "));
    });
  }
  const PDF_META = /\/(?:Author|Creator|Producer|Title|Subject|Keywords|CreationDate|ModDate|Metadata)\b/;

  // ---- site helpers ----
  function cssColor(v, vars, depth = 0) {
    if (depth > 4 || !v) return null;
    const vr = /var\(\s*(--[\w-]+)/.exec(v); if (vr) return cssColor(vars[vr[1]], vars, depth + 1);
    const h = /#([0-9a-f]{3}|[0-9a-f]{6})\b/i.exec(v);
    if (h) { let x = h[1]; if (x.length === 3) x = x.replace(/./g, "$&$&"); return [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16)); }
    const r = /rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(v); return r ? [+r[1], +r[2], +r[3]] : null;
  }
  const luminance = ([r, g, b]) => [r, g, b].map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }).reduce((a, x, i) => a + x * [0.2126, 0.7152, 0.0722][i], 0);
  function bodyBackground(html) {
    const css = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join("\n").replace(/\/\*[\s\S]*?\*\//g, ""), vars = {};
    let bg = null;
    for (const m of css.matchAll(/([^{}@]+)\{([^{}]*)\}/g)) {
      const sels = m[1].split(",").map((s) => s.trim()), decls = m[2];
      if (sels.some((s) => /^(?::root|html)$/.test(s))) for (const v of decls.matchAll(/(--[\w-]+)\s*:\s*([^;]+)/g)) vars[v[1]] = v[2].trim();
      if (sels.some((s) => /^(?:html|body|html\s*,\s*body)$/.test(s))) for (const d of decls.matchAll(/background(?:-color)?\s*:\s*([^;]+)/g)) bg = d[1].trim();
    }
    return bg ? cssColor(bg, vars) : null;
  }
  const attr = (tag, name) => { const m = new RegExp("\\b" + name + "\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)'|([^\\s>]+))", "i").exec(tag); return m ? decodeEntities(m[1] ?? m[2] ?? m[3]) : null; };
  const slug = (s) => normalize(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  // Wording that makes a claim a buyer never asked for: guarantees, prices, verification and audit claims.
  const CLAIMS = [/\bguarantee[sd]?\b/gi, /\bmoney[- ]back\b/gi, /\b(?:independently\s+|fully\s+|officially\s+)?(?:verified|certified|audited|accredited)\b/gi, /[$\u20ac\u00a3]\s?\d[\d,.]*/g,
    /\b\d+\s?%\s+(?:off|discount|guaranteed)/gi, /\bfrom\s+\d+\s+(?:USD|EUR|usd|eur)\b/g, /\baward[- ]winning\b/gi, /\b(?:ISO|SOC)\s?\d+/g, /\btrusted\s+by\b/gi, /#1\b/g];

  // ---- program and source_replay checks. Each returns {status, detail}; ctx = {pack, job, bytes, mediaType, sources, input} ----
  const ok = (detail) => ({ status: "pass", detail }), bad = (detail) => ({ status: "fail", detail });
  const na = (detail) => ({ status: "not_applicable", detail }), nc = (detail) => ({ status: "not_checkable", detail });
  const list = (a, n = 4) => a.slice(0, n).join("; ") + (a.length > n ? `; and ${a.length - n} more` : "");
  const P = (ctx) => ctx.job.params || {};
  const vtext = (ctx) => normalize(htmlToText(text(ctx.bytes)));

  const CHECKS = {
    async copy_present(ctx) {
      const need = P(ctx).required_copy || [], t = vtext(ctx), miss = need.filter((s) => !t.includes(normalize(s)));
      return miss.length ? bad(`${need.length - miss.length} of ${need.length} required copy strings present. Missing: ${list(miss.map((s) => JSON.stringify(s.slice(0, 50))))}`) : ok(`all ${need.length} required copy strings present`);
    },
    async cta_link(ctx) {
      const cta = P(ctx).cta; if (!cta) return na("no cta in job params");
      const html = text(ctx.bytes);
      for (const m of html.matchAll(new RegExp("<a\\b(" + TB + ")>([\\s\\S]*?)</a\\s*>", "gi")))
        if (attr(m[1], "href") === cta.href && normalize(htmlToText(m[2])).includes(normalize(cta.text))) return ok(`link with text "${cta.text}" points to ${cta.href}`);
      return bad(`no <a> with text "${cta.text}" and href ${cta.href}`);
    },
    // Ids and headings count. A bare run of the section names in prose or a comment does not.
    async sections_present(ctx) {
      const secs = P(ctx).sections || [], html = ctx.bytes ? text(ctx.bytes).replace(/<!--[\s\S]*?-->/g, " ") : "";
      const ids = new Set([...html.matchAll(new RegExp("<(?:section|div|header|main|article|footer|h[1-6])\\b(" + TB + ")>", "gi"))].map((m) => slug(attr(m[1], "id") || "")).filter(Boolean));
      const heads = new Set([...html.matchAll(new RegExp("<h[1-6]\\b" + TB + ">([\\s\\S]*?)</h[1-6]\\s*>", "gi"))].map((m) => slug(htmlToText(m[1]))));
      const miss = secs.filter((s) => !ids.has(slug(s)) && !heads.has(slug(s)));
      return miss.length ? bad(`sections without a matching heading or id: ${miss.join(", ")}`) : ok(`all ${secs.length} sections have a heading or id`);
    },
    async no_unbriefed_claims(ctx) {
      const brief = normalize(ctx.job.brief || "").toLowerCase(), t = vtext(ctx), found = [];
      for (const re of CLAIMS) for (const m of t.matchAll(re)) if (!brief.includes(m[0].toLowerCase())) found.push(m[0]);
      const all = [...new Set(found.map((s) => s.toLowerCase()))], uniq = all.filter((s) => !all.some((o) => o !== s && o.includes(s)));
      return uniq.length ? bad(`claims not in the brief: ${list(uniq.map((s) => JSON.stringify(s)))}`) : ok("no guarantee, price or verification claim outside the brief");
    },
    async style_match(ctx) {
      const want = P(ctx).style; if (want !== "dark" && want !== "light") return na("no dark or light style in job params");
      const rgb = bodyBackground(text(ctx.bytes)); if (!rgb) return nc("page background could not be resolved from its CSS");
      const L = luminance(rgb), good = want === "dark" ? L < 0.2 : L >= 0.6;
      return (good ? ok : bad)(`page background luminance ${L.toFixed(3)}: ${good ? "matches" : "does not match"} ${want}`);
    },
    async delivery_hash(ctx) {
      const d = P(ctx).declared_sha256;
      if (typeof d !== "string" || !/^[0-9a-f]{64}$/.test(d)) return bad(`declared sha256 is not 64 lowercase hex characters${typeof d === "string" ? ` (${d.length} characters)` : " (none declared)"}`);
      const h = await sha256(ctx.bytes);
      return h === d ? ok("delivered bytes hash to the declared sha256") : bad(`delivered bytes hash ${h.slice(0, 12)}... but the declared sha256 starts ${d.slice(0, 12)}...`);
    },

    // research-brief-v1
    async md_sections(ctx) {
      const s = parseResearch(text(ctx.bytes)), miss = ["Question", "Findings", "Sources"].filter((n) => s.sections[n] == null);
      if (miss.length) return bad("missing sections: " + miss.join(", "));
      if (!s.claims.length) return bad("Findings has no claims");
      if (!s.sources.length) return bad("Sources has no [S1] <url> \"quote\" lines");
      return ok(`Question, Findings (${s.claims.length} claims), Sources (${s.sources.length}) present`);
    },
    async claims_cited(ctx) {
      const s = parseResearch(text(ctx.bytes)), ids = new Set(s.sources.map((x) => x.id)), bad_ = [];
      if (!s.claims.length) return bad("Findings has no claims");
      s.claims.forEach((c, i) => {
        const m = /((?:\[S\d+\])+)[.;:]?\s*$/.exec(c);
        if (!m) bad_.push(`claim ${i + 1} has no citation: "${c.slice(0, 50)}"`);
        else { const u = [...m[1].matchAll(/\[(S\d+)\]/g)].map((x) => x[1]).filter((x) => !ids.has(x)); if (u.length) bad_.push(`claim ${i + 1} cites ${u.join(",")} which is not in Sources`); }
      });
      return bad_.length ? bad(`${bad_.length} of ${s.claims.length} claims fail: ${list(bad_, 2)}`) : ok(`all ${s.claims.length} claims end with a citation listed in Sources`);
    },
    async urls_resolve(ctx) {
      const s = parseResearch(text(ctx.bytes)); if (!s.sources.length) return bad("no sources listed");
      const miss = s.sources.filter((x) => { const r = ctx.sources.find((r) => r.url === x.url); return !r || !r.bytes || !(r.http_status >= 200 && r.http_status < 300); });
      return miss.length ? bad(`no archived 2xx record for ${list(miss.map((x) => `${x.id} ${x.url}`))}`) : ok(`all ${s.sources.length} URLs have an archived 2xx record`);
    },
    async quotes_in_source(ctx) {
      const s = parseResearch(text(ctx.bytes)); if (!s.sources.length) return bad("no sources listed");
      const miss = [];
      for (const x of s.sources) {
        const r = ctx.sources.find((r) => r.url === x.url);
        if (!r || !r.bytes) { miss.push(`${x.id} has no archived page`); continue; }
        const raw = text(r.bytes), page = normalize(/^\s*(?:<!doctype html|<html|<head|<body)/i.test(raw) ? htmlToText(raw) : raw), q = normalize(x.quote);
        if (q.length < QUOTE_MIN) miss.push(`${x.id} quote is shorter than ${QUOTE_MIN} characters`);
        else if (!page.includes(q)) miss.push(`${x.id} quote not found in the archived page: "${q.slice(0, 40)}"`);
      }
      return miss.length ? bad(`${miss.length} of ${s.sources.length} quotes fail: ${list(miss, 3)}`) : ok(`all ${s.sources.length} quotes found in their archived pages`);
    },

    // file-transform-v1, dispatched on params.transform
    async output_format(ctx) {
      const t = P(ctx).transform;
      if (t === "png-strip-metadata") { const p = parsePng(ctx.bytes); return p.error ? bad(p.error) : ok(`valid PNG, ${p.chunks.length} chunks, CRCs good`); }
      if (t === "csv-to-json") { const j = parseJson(ctx.bytes); return Array.isArray(j) && j.every((r) => r && typeof r === "object" && !Array.isArray(r)) ? ok(`JSON array of ${j.length} objects`) : bad("output is not a JSON array of objects"); }
      if (t === "pdf-extract-pages") {
        const s = latin1(ctx.bytes), g = pdfGuard(s); if (g) return g.startsWith("not checkable") ? nc(g) : bad(g);
        if (!/%%EOF\s*$/.test(s)) return bad("no %%EOF at the end");
        const n = pdfPages(s).length, want = P(ctx).expected_pages ?? (P(ctx).pages || []).length;
        return n === want ? ok(`PDF with ${n} pages`) : bad(`PDF has ${n} pages, expected ${want}`);
      }
      if (t === "field-extraction") { const j = parseJson(ctx.bytes); return j && typeof j === "object" && j.schema === "agentproof-extraction-v1" ? ok("delivery JSON with schema agentproof-extraction-v1") : bad("not a delivery JSON with schema agentproof-extraction-v1"); }
      return bad("unknown transform: " + t);
    },
    async size_target(ctx) {
      const max = P(ctx).max_bytes; if (max == null) return na("no size target in job params");
      return ctx.bytes.length <= max ? ok(`${ctx.bytes.length} bytes <= ${max}`) : bad(`${ctx.bytes.length} bytes > ${max}`);
    },
    async content_preserved(ctx) {
      const t = P(ctx).transform;
      if (t === "field-extraction") {
        const j = parseJson(ctx.bytes); if (!j || typeof j !== "object") return bad("delivery is not JSON");
        const r = (await C.check(P(ctx).envelope || {}, j)).result, want = P(ctx).expected_digest;
        if (r.outcome !== "pass") return bad(`${r.checker_ref}: ${r.outcome}: ${r.failure_reason || r.blocked_reason}`);
        if (want && r.evidence_digest !== want) return bad(`${r.checker_ref}: pass but digest ${r.evidence_digest.slice(0, 12)}... differs from the stored ${want.slice(0, 12)}...`);
        return ok(`${r.checker_ref}: pass, digest ${r.evidence_digest.slice(0, 12)}...${want ? " equals the stored digest" : ""}`);
      }
      if (!ctx.input) return nc("input file not available to compare");
      if (t === "png-strip-metadata") {
        const a = parsePng(ctx.input), b = parsePng(ctx.bytes); if (a.error || b.error) return bad("PNG unreadable: " + (a.error || b.error));
        const hd = (p) => Array.from(p.chunks[0].data), idat = (p) => concat(p.chunks.filter((c) => c.type === "IDAT").map((c) => c.data));
        if (!eq(hd(a), hd(b))) return bad("IHDR differs: dimensions, bit depth or color type changed");
        const [ia, ib] = [await inflate(idat(a)), await inflate(idat(b))]; if (!ia || !ib) return bad("IDAT could not be inflated");
        return eq(ia, ib) ? ok(`inflated pixel data identical (${ia.length} bytes)`) : bad("inflated pixel data differs");
      }
      if (t === "csv-to-json") {
        const rows = parseCsv(text(ctx.input)), j = parseJson(ctx.bytes); if (!rows.length || !Array.isArray(j)) return bad("cannot compare: no rows or output is not an array");
        const head = rows[0], body = rows.slice(1); if (j.length !== body.length) return bad(`${j.length} output rows, ${body.length} input rows`);
        for (let i = 0; i < body.length; i++) {
          const o = j[i]; if (!o || Object.keys(o).sort().join("\u0000") !== [...head].sort().join("\u0000")) return bad(`row ${i + 1} has different fields than the header`);
          for (let k = 0; k < head.length; k++) if (!["string", "number", "boolean"].includes(typeof o[head[k]]) || String(o[head[k]]) !== (body[i][k] ?? "")) return bad(`row ${i + 1} field ${head[k]} differs from the input`);
        }
        return ok(`${body.length} rows and ${head.length} fields preserved`);
      }
      if (t === "pdf-extract-pages") {
        const si = latin1(ctx.input), so = latin1(ctx.bytes), g = pdfGuard(si) || pdfGuard(so); if (g) return g.startsWith("not checkable") ? nc(g) : bad(g);
        const inp = pdfPages(si), out = pdfPages(so), pick = (P(ctx).pages || inp.map((_, i) => i + 1)).map((n) => inp[n - 1]);
        if (pick.some((p) => p == null)) return bad("requested page not in the input");
        return eq(pick, out) ? ok(`text of ${out.length} extracted pages equals the input pages`) : bad("page text differs from the requested input pages");
      }
      return bad("unknown transform: " + t);
    },
    async metadata_clean(ctx) {
      const t = P(ctx).transform;
      if (t === "png-strip-metadata") {
        const p = parsePng(ctx.bytes); if (p.error) return bad(p.error);
        const left = [...new Set(p.chunks.map((c) => c.type).filter((x) => PNG_META.includes(x)))];
        return left.length ? bad("metadata chunks left: " + left.join(", ")) : ok("no tEXt, iTXt, zTXt, eXIf or tIME chunk");
      }
      if (t === "pdf-extract-pages") {
        const s = latin1(ctx.bytes), g = pdfGuard(s); if (g) return g.startsWith("not checkable") ? nc(g) : bad(g);
        const m = PDF_META.exec(s); return m ? bad("metadata key left: " + m[0]) : ok("no Author, Creator, Producer, Title, Subject, Keywords, dates or XMP");
      }
      return na("no metadata to strip for transform " + t);
    },
  };

  function parseResearch(md) {
    const sections = {}; let cur = null;
    for (const line of md.replace(/\r\n?/g, "\n").split("\n")) {
      const h = /^##\s+(.+?)\s*$/.exec(line); if (h) { cur = h[1]; sections[cur] = []; continue; }
      if (/^#\s/.test(line)) { cur = null; continue; }
      if (cur != null && line.trim()) sections[cur].push(line.trim());
    }
    const claims = (sections.Findings || []).map((l) => l.replace(/^(?:[-*]|\d+[.)])\s+/, ""));
    const sources = [];
    for (const l of sections.Sources || []) { const m = /^(?:[-*]\s+)?\[(S\d+)\]\s+<?(https?:\/\/[^\s>]+)>?\s+["\u201C](.+)["\u201D]\s*$/.exec(l); if (m) sources.push({ id: m[1], url: m[2], quote: m[3] }); }
    return { sections, claims, sources };
  }

  async function runCheck(c, ctx) {
    const fn = CHECKS[c.check];
    if (!fn) return nc("unknown check: " + c.check);
    try { return await fn(ctx); } catch (e) { return nc("check crashed: " + e.message); }
  }

  // ---- receipt ----
  function effectiveWeight(c, job) {
    const w = job.weights && job.weights[c.id];
    return w != null && c.weight_adjustable ? w : c.weight;
  }
  function checkWeights(pack, job) {
    for (const k of Object.keys(job.weights || {})) {
      const c = pack.criteria.find((x) => x.id === k);
      if (!c || c.type !== "rubric" || !c.weight_adjustable) throw new Error(`weight for ${k} is not adjustable in ${pack.id}`);
      if (!(job.weights[k] >= 0 && job.weights[k] <= 10)) throw new Error(`weight for ${k} must be 0..10`);
    }
  }
  const rubricHash = (pack, job) => hashJson(pack.criteria.filter((c) => c.type === "rubric").map((c) => ({ ...c, weight: effectiveWeight(c, job) })));

  // Score one rubric from stored judge outputs. Opinion is data here: only the quote and arithmetic are checked.
  function scoreRubric(c, jt, judgeRun, job) {
    const base = { id: c.id, type: "rubric", trust: "Judged", gate: c.gate, weight: effectiveWeight(c, job), label: c.label };
    if (jt == null) return { ...base, scores: [], median: null, spread: null, valid_n: 0, contested: false, status: "not_applicable" };
    const judges = (judgeRun && judgeRun.judges) || [];
    if (!judges.some((j) => j.ok !== false && (j.scores || []).some((s) => s.criterion === c.id)))
      return { ...base, scores: [], median: null, spread: null, valid_n: 0, contested: false, status: "not_run" };
    const scores = judges.map((j) => {
      const s = j.ok === false ? null : (j.scores || []).find((x) => x.criterion === c.id);
      if (!s) return { judge: j.label, model: j.model, score: null, quote: "", reason: "", quote_found: false, void: true };
      const found = quoteFound(s.quote, jt), v = validScore(s.score);
      return { judge: j.label, model: j.model, score: v ? s.score : null, quote: String(s.quote ?? ""), reason: String(s.reason ?? ""), quote_found: found, void: !(found && v) };
    });
    return { ...base, scores, ...aggregate(scores, c.gate) };
  }

  // i: {pack, packFile, job, jobFile, bytes, deliverable:{file,media_type}, sources:[{id,url,archive_file,sha256,fetched_at,http_status,origin,bytes}],
  //     input (Uint8Array|null), judgeRun, judgeRunFile, judgeRunSha256, meta:{input_origin,committed_at,delivered_at,before_delivery,note,evidence_note,agent,witnesses}}
  async function buildReceipt(i) {
    const { pack, job, meta } = i;
    if (pack.schema !== PACK_SCHEMA) throw new Error("not a check pack");
    if (job.pack !== pack.id) throw new Error(`job is for pack ${job.pack}, not ${pack.id}`);
    checkWeights(pack, job);
    if (!["synthetic", "derived-from-real", "real"].includes(meta.input_origin)) throw new Error("meta.input_origin must be synthetic, derived-from-real or real");
    if (typeof meta.committed_at !== "string") throw new Error("meta.committed_at is required");
    const ctx = { pack, job, bytes: i.bytes, mediaType: i.deliverable.media_type, sources: i.sources || [], input: i.input || null };
    const jt = judgeText(i.bytes, i.deliverable.media_type, job), criteria = [];
    for (const c of pack.criteria) {
      const base = { id: c.id, type: c.type, trust: TRUST[c.type], gate: c.gate, label: c.label };
      if (c.type === "program" || c.type === "source_replay") criteria.push({ ...base, ...(await runCheck(c, ctx)) });
      else if (c.type === "rubric") criteria.push(scoreRubric(c, jt, i.judgeRun, job));
      else { const w = (meta.witnesses || {})[c.id] || {}; criteria.push({ ...base, statement: w.statement ?? null, by: w.by ?? null, at: w.at ?? null, ref: w.ref ?? null }); }
    }
    const packHash = await hashJson(pack), jobHash = await hashJson(job);
    const cm = { pack_hash: packHash, job_hash: jobHash, rubric_hash: await rubricHash(pack, job), committed_at: meta.committed_at, delivered_at: meta.delivered_at ?? null,
      before_delivery: !!meta.before_delivery, note: meta.note || "Pack written after this delivery: post-hoc backtest" };
    cm.hash = await hashJson(cm);
    const inj = scanInjection(i.bytes, i.deliverable.media_type), run = i.judgeRun;
    const r = {
      schema: RECEIPT_SCHEMA, id: job.id, mock: true, input_origin: meta.input_origin,
      evidence_note: meta.evidence_note || "Mock backtest. Not market evidence.",
      agent: meta.agent || { label: job.seller_label, handle: null }, buyer_label: job.buyer_label,
      pack: { id: pack.id, version: pack.version, file: i.packFile, hash: packHash }, job: { file: i.jobFile, hash: jobHash }, commitment: cm,
      deliverable: { file: i.deliverable.file, sha256: await sha256(i.bytes), bytes: i.bytes.length, media_type: i.deliverable.media_type },
      sources: (i.sources || []).map(({ id, url, archive_file, sha256: h, fetched_at, http_status, origin }) => ({ id, url, archive_file, sha256: h, fetched_at, http_status, origin })),
      criteria,
      panel: run ? { run: i.judgeRunFile, run_sha256: i.judgeRunSha256, prompt_version: run.prompt_version ?? null, judges: (run.judges || []).map((j) => ({ label: j.label, model: j.model })) } : null,
      injection: { flagged: inj.flagged, matches: inj.matches, judges_flagged: run ? (run.judges || []).filter((j) => j.injection_seen === true).length : 0 },
      trust: trustBlock(criteria), ...decide(criteria),
    };
    r.receipt_hash = await hashJson(r);
    return r;
  }
  const hashOf = (r) => { const { receipt_hash, ...rest } = r; return hashJson(rest); };
  const withHash = async (r) => ({ ...r, receipt_hash: await hashOf(r) });

  // ---- re-check ----
  async function recheck(r, load) {
    const rec = [], not = [], pass = (id, label, ok_, detail) => rec.push({ id, label, ok: !!ok_, detail });
    const get = async (path) => { try { return await load(path); } catch (e) { return null; } };
    const same = (a, b) => canonicalJson(a) === canonicalJson(b);
    try {
      pass("schema", "Receipt schema", r.schema === RECEIPT_SCHEMA, r.schema);
      pass("mock-label", "Labelled mock, not market evidence", r.mock === true && /Not market evidence/.test(r.evidence_note || ""), r.evidence_note);
      const packU8 = await get(r.pack.file), pack = packU8 && parseJson(packU8);
      const jobU8 = await get(r.job.file), job = jobU8 && parseJson(jobU8);
      const bytes = await get(r.deliverable.file);
      pass("pack-hash", "Pack file hash", pack && (await hashJson(pack)) === r.pack.hash && r.commitment.pack_hash === r.pack.hash, pack ? "sha256 of the canonical pack" : "pack file could not be loaded");
      pass("job-hash", "Job file hash", job && (await hashJson(job)) === r.job.hash && r.commitment.job_hash === r.job.hash, job ? "sha256 of the canonical job" : "job file could not be loaded");
      if (pack && job) {
        let rh = null; try { checkWeights(pack, job); rh = await rubricHash(pack, job); } catch (e) { rh = e.message; }
        pass("rubric-hash", "Rubric hash (criteria, anchors, effective weights)", rh === r.commitment.rubric_hash, "sha256 of the rubric criteria as committed");
      }
      const { hash: ch, ...cmRest } = r.commitment;
      pass("commitment-hash", "Commitment hash", (await hashJson(cmRest)) === ch, `before_delivery: ${r.commitment.before_delivery}`);
      pass("deliverable-hash", "Deliverable bytes", bytes && (await sha256(bytes)) === r.deliverable.sha256 && bytes.length === r.deliverable.bytes, bytes ? `${bytes.length} bytes` : "deliverable could not be loaded");
      const sources = [];
      for (const s of r.sources || []) {
        // A URL with no archive record is a recorded fact (urls-resolve fails on it by program), not a missing file.
        const b = s.archive_file ? await get(s.archive_file) : null;
        if (!s.archive_file) pass("archive:" + s.id, `Archived page ${s.id}`, s.sha256 == null, "no archive record for this URL, as recorded");
        else pass("archive:" + s.id, `Archived page ${s.id}`, b && (await sha256(b)) === s.sha256, b ? `${b.length} bytes archived` : "archive file could not be loaded");
        sources.push({ ...s, bytes: b });
        not.push({ id: "fetch:" + s.id, label: `URL ${s.id} resolved at fetch time`, detail: `recorded fact: HTTP ${s.http_status}, origin ${s.origin}` });
      }
      if (pack && job && bytes) {
        const inputU8 = job.params && job.params.input_file ? await get(job.params.input_file) : null;
        if (job.params && job.params.input_file) pass("input-hash", "Input file bytes", inputU8 && (await sha256(inputU8)) === job.params.input_sha256, inputU8 ? "sha256 of the input" : "input file could not be loaded");
        const ctx = { pack, job, bytes, mediaType: r.deliverable.media_type, sources, input: inputU8 }, jt = judgeText(bytes, r.deliverable.media_type, job);
        pass("criteria-match-pack", "Criteria are the pack's criteria", same(r.criteria.map((c) => [c.id, c.type, c.gate, c.label]), pack.criteria.map((c) => [c.id, c.type, c.gate, c.label])), `${pack.criteria.length} criteria in ${pack.id}`);
        for (const pc of pack.criteria) {
          const sc = r.criteria.find((c) => c.id === pc.id); if (!sc) continue;
          if (pc.type === "program" || pc.type === "source_replay") {
            const o = await runCheck(pc, ctx);
            pass("run:" + pc.id, `Re-ran ${pc.id}`, sc.status === o.status && sc.detail === o.detail, `${o.status}: ${o.detail}`);
          } else if (pc.type === "rubric") {
            const stored = (sc.scores || []).map((s) => ({ ...s })), q = stored.map((s) => { const f = quoteFound(s.quote, jt); return f === s.quote_found && s.void === !(f && validScore(s.score)); });
            pass("quotes:" + pc.id, `Quote matches for ${pc.id}`, q.every(Boolean) && (sc.status === "not_run" || sc.status === "not_applicable" ? !stored.length : true), `${stored.filter((s) => !s.void).length} of ${stored.length} quotes found in the judge text`);
            if (sc.status !== "not_run" && sc.status !== "not_applicable") {
              const a = aggregate(stored, pc.gate);
              pass("arith:" + pc.id, `Median, spread and status for ${pc.id}`, same({ ...a }, { median: sc.median, spread: sc.spread, valid_n: sc.valid_n, contested: sc.contested, status: sc.status }) && sc.weight === effectiveWeight(pc, job), `median ${a.median}, spread ${a.spread}, valid_n ${a.valid_n}, ${a.status}`);
            } else pass("arith:" + pc.id, `Status for ${pc.id}`, sc.status === (jt == null ? "not_applicable" : "not_run") && sc.median === null, sc.status);
            for (const s of stored) not.push({ id: `opinion:${pc.id}:${s.judge}`, label: `${s.judge} (${s.model}) on ${pc.id}`, detail: `stored opinion, cannot be re-run here: score ${s.score}${s.void ? " (void)" : ""}` });
          } else not.push({ id: "witness:" + pc.id, label: `Witness statement ${pc.id}`, detail: sc.statement ? `stated by ${sc.by}, recorded as given` : "no statement recorded" });
        }
        const inj = scanInjection(bytes, r.deliverable.media_type);
        pass("injection-scan", "Injection scan of the raw deliverable", r.injection.flagged === inj.flagged && same(r.injection.matches, inj.matches), inj.flagged ? `${inj.matches.length} patterns matched` : "no pattern matched");
        if (r.injection.judges_flagged) not.push({ id: "judges-flagged", label: "Judges that reported injection", detail: `${r.injection.judges_flagged} reported by the judges, stored` });
      }
      pass("trust-block", "Trust block recomputed from criteria", same(r.trust, trustBlock(r.criteria)), "Reproduced, Judged and Witnessed counted apart, never summed");
      const d = decide(r.criteria);
      pass("verdict", "Verdict follows the rule", r.verdict === d.verdict && r.verdict_reason === d.verdict_reason, `${d.verdict}: ${d.verdict_reason}`);
      if (r.panel) {
        const run = await get(r.panel.run);
        pass("panel-run-hash", "Stored judge run file", run && (await sha256(run)) === r.panel.run_sha256, run ? "sha256 of the judge run file" : "judge run file could not be loaded");
      }
      pass("receipt-hash", "Receipt hash", (await hashOf(r)) === r.receipt_hash, "sha256 of the canonical receipt without receipt_hash");
    } catch (e) { pass("recheck-error", "Re-check could not finish", false, e.message); }
    not.push({ id: "timestamps", label: "Timestamps", detail: "committed_at and delivered_at are self-asserted: nothing anchors them" });
    return { ok: rec.every((x) => x.ok), recomputed: rec, not_recomputed: not,
      opinions: (r.criteria || []).filter((c) => c.type === "rubric").flatMap((c) => (c.scores || []).map((s) => ({ criterion: c.id, ...s }))) };
  }

  // Per agent per pack. Never one global number. pass_rate is a whole percent.
  function reputation(receipts) {
    const g = new Map();
    for (const r of receipts) {
      const agent = r.agent.handle || r.agent.label, k = [agent, r.pack.id, r.pack.version].join("|");
      if (!g.has(k)) g.set(k, { agent, pack: r.pack.id, version: r.pack.version, rs: [] });
      g.get(k).rs.push(r);
    }
    return [...g.values()].map(({ rs, ...x }) => {
      const passed = rs.filter((r) => r.verdict === "pass").length;
      return { ...x, jobs: rs.length, distinct_buyers: new Set(rs.map((r) => r.buyer_label)).size, passed, pass_rate: Math.round(passed / rs.length * 100),
        verdicts: ["pass", "fail", "contested", "incomplete"].reduce((o, v) => ({ ...o, [v]: rs.filter((r) => r.verdict === v).length }), {}),
        mock: rs.every((r) => r.mock === true), input_origins: [...new Set(rs.map((r) => r.input_origin))].sort() };
    });
  }

  const api = { PACK_SCHEMA, RECEIPT_SCHEMA, JOB_SCHEMA, JUDGE_RUN_SCHEMA, QUOTE_MIN, sha256, hashJson, normalize, htmlToText, judgeText, quoteFound, scanInjection, aggregate, trustBlock, decide,
    parseCsv, parsePng, parseResearch, CHECKS, runCheck, effectiveWeight, rubricHash, scoreRubric, buildReceipt, withHash, recheck, reputation };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AgentProofPacks = api;
})(typeof window !== "undefined" ? window : globalThis);
