// Market Town: every building is a real market.near.ai agent. The scene starts empty
// and fills only after M.fetchAgents() answers (relay -> snapshot). Receipts come from
// data/manifest.json and are re-checked in this browser before they are drawn.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const M = window.AgentProofMarket, P = window.AgentProofPortfolio, C = window.AgentProofChecker;
const $ = (id) => document.getElementById(id);

/* ---------- design tokens: every magic number lives here ---------- */
const T = {
  pitch: 0.8, body: 0.56, lamp: 0.24, gap: 2.4, headroom: 0.15, // layout: cell pitch, footprint, space between districts
  plinth: 0.1, hBase: 0.5, hSpan: 2.6, hRef: 50, hMax: 1.5,   // height: log1p(jobs)/log1p(hRef), capped at hMax
  neutral: "#c9c2b8", pad: "#ddd6c8", ground: "#f6f2ea",
  rise: 480, stagger: 2.5, pulse: 700, sink: 500, fly: 900, refresh: 60000, autoDelay: 1000,
  capHead: 1.5,
  pink: 0xcf4870, green: 0x169c5f, red: 0xd6423a, lamp_on: 0xffc94d, gold: 0xd4a52a,
  names: 5, // name labels on the busiest agents at the overview zoom
  // receipt tour (ms): overview hold, camera flight, arc draw, minimum "re-checking" time, result hold, card hold
  tourHold: 1200, tourFly: 1600, arcDraw: 1100, recheck: 800, result: 700, cardHold: 2200, flyHome: 1600,
};
const Q = new URLSearchParams(location.search), DEMO = Q.get("demo") === "1", DARK = document.documentElement.dataset.theme === "dark";
// ?demo=1 is paced for a ~30 s recording: connect, rise, receipts, card, then hold.
if (DEMO) Object.assign(T, { autoDelay: 1800, rise: 760, stagger: 6.5, tourHold: 2000, tourFly: 2200, arcDraw: 1500, recheck: 1100, result: 900, cardHold: 2800, flyHome: 2200 });
const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
// One muted hue per district. Unknown categories get a stable hash hue; "other" stays neutral.
const HUE = { research: 215, dev_tools: 268, automation: 168, creative: 345, data: 32, finance: 128, marketing: 300, legal_compliance: 190, travel: 55, operations: 240, events: 10, sales: 90, customer_support: 150 };
const hueOf = (cat) => { if (cat in HUE) return HUE[cat]; if (cat === "other" || cat === "uncategorized") return null; let h = 0; for (const ch of cat) h = (h * 31 + ch.charCodeAt(0)) % 360; return h; };
const TONE = DARK ? { tall: [34, 50], low: [14, 30], pad: [18, 20], label: [34, 34] } : { tall: [40, 60], low: [22, 83], pad: [32, 89], label: [34, 38] };
const tone = (cat, role) => { const h = hueOf(cat), [sat, l] = TONE[role]; return h == null ? `hsl(30,6%,${l}%)` : `hsl(${h},${sat}%,${l}%)`; };
const hex = (c) => new THREE.Color(c);
const uncat = (c) => c || "uncategorized";
const height = (jobs) => (jobs > 0 ? T.hBase + T.hSpan * Math.min(T.hMax, Math.log1p(jobs) / Math.log1p(T.hRef)) : T.plinth);
// available_now is the market's "right now" flag; availability ("available") is set on nearly every listing, so it only counts when available_now is absent.
const isOn = (a) => (a.available_now != null ? a.available_now === true : a.availability === "available" || a.availability === "available_now");
const ease = (t) => 1 - Math.pow(1 - t, 3);
const back = (t) => { const c = 1.4; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };

// Test hooks. count = buildings alive in the scene, kept equal to what the instances draw.
const town = (window.__town = { count: 0, capacity: 0, source: null, fetched_at: null, receipts: 0, loops: [], handles: [], fps: 0, districts: {}, ready: false, webgl: true });

/* ---------- renderer ---------- */
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
} catch (e) {
  town.webgl = false;
  $("connect").hidden = true;
  $("note").textContent = "WebGL is not available in this browser, so the town cannot be drawn. The guided replay and the portfolio page still work.";
  $("note").className = "err";
  throw e;
}
renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setClearColor(0x000000, 0);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = DARK ? 1.0 : 1.08;
$("stage").appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 600); camera.position.set(0, 14, 18);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.maxPolarAngle = 1.3; controls.minDistance = 3; controls.maxDistance = 220;
scene.add(DARK ? new THREE.HemisphereLight(0x9fb2cc, 0x2a2622, 1.0) : new THREE.HemisphereLight(0xeaf3ff, 0xb59a74, 1.25));
const sun = new THREE.DirectionalLight(0xfff4e0, DARK ? 1.4 : 2.3); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0005; sun.shadow.radius = 5; scene.add(sun, sun.target);

const bumpTex = (() => { const c = document.createElement("canvas"); c.width = c.height = 256; const x = c.getContext("2d"); x.fillStyle = "#808080"; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) { const g = 110 + Math.random() * 40 | 0; x.fillStyle = `rgba(${g},${g},${g},.35)`; x.beginPath(); x.arc(Math.random() * 256, Math.random() * 256, Math.random() * 3 + .5, 0, 7); x.fill(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; })();
const clay = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: .9, metalness: 0, bumpMap: bumpTex, bumpScale: .5, ...o });

/* ---------- ground: a soft grid fading into the sky, nothing else ---------- */
(() => {
  const g = document.createElement("canvas"); g.width = g.height = 128; const x = g.getContext("2d");
  x.fillStyle = DARK ? "#1b222c" : T.ground; x.fillRect(0, 0, 128, 128); x.strokeStyle = DARK ? "rgba(200,210,225,.07)" : "rgba(60,70,80,.08)"; x.lineWidth = 2; x.strokeRect(0, 0, 128, 128);
  const grid = new THREE.CanvasTexture(g); grid.wrapS = grid.wrapT = THREE.RepeatWrapping; grid.repeat.set(120, 120); grid.anisotropy = 8; grid.colorSpace = THREE.SRGBColorSpace;
  const f = document.createElement("canvas"); f.width = f.height = 256; const y = f.getContext("2d");
  const rg = y.createRadialGradient(128, 128, 20, 128, 128, 128); rg.addColorStop(0, "#fff"); rg.addColorStop(.55, "#fff"); rg.addColorStop(1, "#000"); y.fillStyle = rg; y.fillRect(0, 0, 256, 256);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), new THREE.MeshStandardMaterial({ map: grid, alphaMap: new THREE.CanvasTexture(f), transparent: true, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
})();

/* ---------- labels (DOM, projected each frame) ---------- */
const labelsEl = $("labels"); const LABELS = [];
// prio orders the declutter: a label that would overlap one placed before it is hidden for that frame.
const PRIO = { tag: 5, chiplab: 3, place: 2, nm: 1 };
function label(cls, text, style, at, when, prio = PRIO[cls] || 0) { const el = document.createElement("div"); el.className = cls; el.textContent = text; if (style) el.style.cssText = style; labelsEl.appendChild(el); const L = { el, at, when, prio, size: null }; LABELS.push(L); LABELS.sort((p, q2) => q2.prio - p.prio); return L; }
const dropLabel = (L) => { const k = LABELS.indexOf(L); if (k >= 0) LABELS.splice(k, 1); L.el.remove(); };
const tmpV = new THREE.Vector3(), chrome = [$("legend"), ...document.querySelectorAll("#top > *")];
function placeLabels() {
  const w = innerWidth, h = innerHeight, placed = [];
  for (const el of chrome) if (!el.hidden) { const r = el.getBoundingClientRect(); placed.push([r.left, r.top, r.right, r.bottom]); } // never under the header or legend
  for (const L of LABELS) {
    if (L.when && !L.when()) { L.el.style.display = "none"; continue; }
    if (!L.size) { L.el.style.display = ""; L.size = [L.el.offsetWidth, L.el.offsetHeight]; }
    L.at(tmpV); tmpV.project(camera);
    const vis = tmpV.z < 1 && Math.abs(tmpV.x) < 1.2 && Math.abs(tmpV.y) < 1.2;
    const x = Math.round((tmpV.x * .5 + .5) * w - L.size[0] / 2), y = Math.round((-tmpV.y * .5 + .5) * h - L.size[1] / 2);
    const clear = vis && !placed.some((r) => x < r[2] && x + L.size[0] > r[0] && y < r[3] && y + L.size[1] > r[1]);
    L.el.style.display = clear ? "" : "none";
    if (clear) { L.el.style.transform = `translate3d(${x}px,${y}px,0)`; placed.push([x - 2, y - 2, x + L.size[0] + 2, y + L.size[1] + 2]); }
  }
}

/* ---------- buildings: one InstancedMesh for bodies, one for window lamps ---------- */
const S = [];              // slot -> { handle, agent, x, z, color, cur, from, to, t0, dur, pulse0, state, district }
const BY = new Map();      // handle -> slot
const FREE = [];
let bodies, lamps, cap = 0, hw = 0;
const dummy = new THREE.Matrix4(), q = new THREE.Quaternion(), pv = new THREE.Vector3(), sv = new THREE.Vector3(), col = new THREE.Color();
const bodyMat = clay("#ffffff"), lampMat = new THREE.MeshStandardMaterial({ color: 0x3a3320, emissive: T.lamp_on, emissiveIntensity: 1.7, roughness: .5 });
const bodyGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, .5, 0), lampGeo = new THREE.BoxGeometry(T.lamp, .08, T.lamp);
let litAttr = null; // per instance: 1 = available now, its windows glow
// Windows in world units (so a tall tower gets more floors, not stretched ones), a darker foot
// for contact shadow, a lighter roof. Plinths (zero delivered jobs) are too low for windows.
bodyMat.onBeforeCompile = (sh) => {
  sh.uniforms.uLamp = { value: new THREE.Color(T.lamp_on) };
  const v = "varying float vLit; varying float vY; varying float vH; varying float vU; varying float vSide;";
  sh.vertexShader = sh.vertexShader.replace("#include <common>", `#include <common>\nattribute float aLit;\n${v}`)
    .replace("#include <begin_vertex>", "#include <begin_vertex>\nvLit = aLit; vH = length(instanceMatrix[1].xyz); vY = position.y * vH; vU = abs(normal.x) > .5 ? position.z + .5 : position.x + .5; vSide = 1. - abs(normal.y);");
  sh.fragmentShader = sh.fragmentShader.replace("#include <common>", `#include <common>\nuniform vec3 uLamp;\n${v}`)
    .replace("#include <color_fragment>", `#include <color_fragment>
      diffuseColor.rgb *= mix(1.07, mix(.6, 1., smoothstep(0., .5, vY)), vSide);
      float win = 0.;
      if (vSide > .5 && vH > .3) { float c = fract(vU * 3.), r = fract((vY - .2) / .22); win = step(.24, c) * step(c, .76) * step(.3, r) * step(r, .76) * step(.2, vY) * step(vY, vH - .14); }
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * mix(.48, .95, vLit), win);`)
    .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance += uLamp * win * vLit * .85;");
};

function makeMeshes(n) {
  const old = bodies && { b: bodies, l: lamps };
  const lit = new Float32Array(n); if (litAttr) lit.set(litAttr.array.subarray(0, Math.min(n, litAttr.array.length)));
  litAttr = new THREE.InstancedBufferAttribute(lit, 1); bodyGeo.setAttribute("aLit", litAttr);
  bodies = new THREE.InstancedMesh(bodyGeo, bodyMat, n); lamps = new THREE.InstancedMesh(lampGeo, lampMat, n);
  for (const m of [bodies, lamps]) { m.frustumCulled = false; m.count = hw; m.castShadow = m.receiveShadow = true; m.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4); scene.add(m); }
  lamps.castShadow = false;
  cap = n; town.capacity = n;
  if (old) { scene.remove(old.b, old.l); old.b.dispose(); old.l.dispose(); for (let i = 0; i < hw; i++) { writeSlot(i); bodies.setColorAt(i, col.set(S[i].color)); } bodies.instanceColor.needsUpdate = true; }
}
function writeSlot(i) {
  const s = S[i]; if (!s) return;
  const grow = s.pulse0 != null ? 1 + .45 * Math.sin(Math.min(1, (performance.now() - s.pulse0) / T.pulse) * Math.PI) : 1;
  const h = Math.max(s.cur, 0), w = s.dead ? 0 : T.body * (s.to > T.plinth ? 1 : .78) * grow;
  bodies.setMatrixAt(i, dummy.compose(pv.set(s.x, 0, s.z), q, sv.set(w, h, w)));
  // Towers show "available now" with lit windows; a plinth is too low for windows, so it gets a small roof light.
  const k = !s.dead && s.on && s.to <= T.plinth && h > T.plinth * .5 ? .32 : 0;
  lamps.setMatrixAt(i, dummy.compose(pv.set(s.x, h, s.z), q, sv.set(k, k, k)));
}
let dirty = false;

/* ---------- districts ---------- */
const D = new Map();       // category -> { cat, x0, z0, s, n, used:Set, pad, label }
let extentMaxZ = 0, extentMinX = 0, extentMaxX = 0, extentMinZ = 0;
const padGeo = new THREE.BoxGeometry(1, .06, 1).translate(0, .03, 0);
const dimOf = (n) => Math.ceil(Math.sqrt(n + Math.max(3, T.headroom * n)));
const cellPos = (d, k) => [d.x0 + (k % d.s + .5) * T.pitch, d.z0 + (Math.floor(k / d.s) + .5) * T.pitch];
function addDistrict(cat, n, x0, z0) {
  const s = dimOf(n), size = s * T.pitch;
  const pad = new THREE.Mesh(padGeo, clay(tone(cat, "pad"))); pad.scale.set(size + .3, REDUCED ? 1 : 0, size + .3); pad.position.set(x0 + size / 2, 0, z0 + size / 2); pad.receiveShadow = true; scene.add(pad);
  const d = { cat, x0, z0, s, size, n: 0, used: new Set(), pad, padT0: performance.now() };
  d.label = label("place", `${cat} \u00b7 0`, `background:${tone(cat, "label")}`, (v) => v.set(d.x0 + d.size / 2, 0.05, d.z0 + d.size + .7)); // reads d so a re-layout moves it
  D.set(cat, d); return d;
}
function dropDistrict(d) { scene.remove(d.pad); d.pad.material.dispose(); dropLabel(d.label); D.delete(d.cat); delete town.districts[d.cat]; }
const setLabel = (d) => { d.label.el.textContent = `${d.cat} \u00b7 ${d.n}`; d.label.size = null; town.districts[d.cat] = d.n; };
function cellOf(d) { let k = 0; while (d.used.has(k)) k++; d.used.add(k); return k; }
function layout(groups) {
  // Shelf packing: biggest district first, rows wrap near the width of a square of the same total area.
  if (!groups.length) { extentMinX = extentMaxX = extentMinZ = extentMaxZ = 0; return []; } // empty list must not Math.max() of nothing
  const sizes = groups.map((g) => dimOf(g.agents.length) * T.pitch);
  const rowW = Math.max(sizes[0] || 0, Math.sqrt(sizes.reduce((a, s) => a + (s + T.gap) * (s + T.gap), 0)) * 1.25);
  let x = 0, z = 0, rowH = 0; const at = [];
  sizes.forEach((s) => { if (x > 0 && x + s > rowW) { x = 0; z += rowH + T.gap; rowH = 0; } at.push([x, z]); x += s + T.gap; rowH = Math.max(rowH, s); });
  const maxX = Math.max(...at.map((p, i) => p[0] + sizes[i])), maxZ = z + rowH;
  extentMinX = -maxX / 2; extentMaxX = maxX / 2; extentMinZ = -maxZ / 2; extentMaxZ = maxZ / 2;
  return at.map((p) => [p[0] - maxX / 2, p[1] - maxZ / 2]);
}

/* ---------- filling and updating the town ---------- */
let owners = new Map(), ownerList = [];
function ownerColor(handle) { const o = ownerList.find((a) => (a.executor_ids || []).includes(handle)); return o ? o.color : null; }
// Color and window light for one slot, from its real numbers. Called on add and on every refresh.
function setLook(i) {
  const s = S[i], a = s.agent;
  s.color = ownerColor(a.handle) || tone(uncat(a.category), (a.delivered_jobs || 0) > 0 ? "tall" : "low");
  bodies.setColorAt(i, col.set(s.color)); bodies.instanceColor.needsUpdate = true;
  litAttr.array[i] = s.on ? 1 : 0; litAttr.needsUpdate = true;
}

function addBuilding(a, d, delay) {
  const i = FREE.length ? FREE.pop() : hw++;
  const k = cellOf(d), [x, z] = cellPos(d, k);
  const to = height(a.delivered_jobs), now = performance.now();
  S[i] = { handle: a.handle, agent: a, x, z, k, color: null, on: isOn(a), cur: REDUCED ? to : 0, from: 0, to, t0: now + delay, dur: T.rise, kind: "rise", pulse0: null, dead: false, d };
  BY.set(a.handle, i); d.n++; bodies.count = lamps.count = hw;
  setLook(i);
  writeSlot(i); bodies.instanceMatrix.needsUpdate = lamps.instanceMatrix.needsUpdate = true; if (!REDUCED) ACTIVE.add(i);
  return i;
}
const ACTIVE = new Set();
function ensureCap(extra) { if (hw + extra - FREE.length > cap) { makeMeshes(Math.ceil((hw + extra) * T.capHead)); } }

function syncTown() {
  town.count = [...BY.values()].length;
  town.handles = [...BY.keys()];
  if (connected) $("countChip").textContent = `${town.count} agents`; // a sunk building leaves after its animation
}

function fill(agents) {
  const groups = new Map();
  const dup = new Set();
  for (const a of agents) { if (!a.handle || dup.has(a.handle)) continue; dup.add(a.handle); const c = uncat(a.category); (groups.get(c) || groups.set(c, []).get(c)).push(a); }
  const list = [...groups].map(([cat, arr]) => ({ cat, agents: arr.sort((p, q2) => (q2.delivered_jobs || 0) - (p.delivered_jobs || 0)) })).sort((p, q2) => q2.agents.length - p.agents.length);
  const at = layout(list);
  ensureCap(agents.length + 8);
  let n = 0;
  list.forEach((g, gi) => {
    const d = addDistrict(g.cat, g.agents.length, at[gi][0], at[gi][1]);
    for (const a of g.agents) addBuilding(a, d, REDUCED ? 0 : 150 + n++ * T.stagger);
    setLabel(d);
  });
  frameShadow(); syncTown(); nameLabels();
}

function update(agents) {
  const seen = new Set(), now = performance.now(), fresh = [];
  for (const a of agents) { if (!a.handle || seen.has(a.handle)) continue; seen.add(a.handle); if (!BY.has(a.handle)) fresh.push(a); }
  // Leavers sink first so they stop counting as district occupants below.
  for (const [h, i] of [...BY]) if (!seen.has(h) && S[i].kind !== "sink") { Object.assign(S[i], { from: S[i].cur, to: 0, t0: now, dur: T.sink, kind: "sink" }); ACTIVE.add(i); if (REDUCED) retire(i); }
  for (const a of agents) {
    const i = a.handle ? BY.get(a.handle) : null; if (i == null) continue;
    const s = S[i]; if (s.kind === "sink") continue;
    const to = height(a.delivered_jobs); s.agent = a; s.on = isOn(a); setLook(i);
    if (to !== s.to) { Object.assign(s, { from: s.cur, to, t0: now, dur: T.rise, kind: "grow", pulse0: REDUCED ? null : now }); if (!REDUCED) ACTIVE.add(i); else { s.cur = to; } }
    writeSlot(i); dirty = true;
  }
  if (fresh.length) {
    ensureCap(fresh.length + 8);
    const want = new Map(); for (const a of fresh) want.set(uncat(a.category), (want.get(uncat(a.category)) || 0) + 1);
    // A new category or a full pad means the fixed grids no longer fit: re-lay the whole town.
    if ([...want].some(([c, k]) => { const d = D.get(c); return !d || d.used.size + k > d.s * d.s; })) relayout(fresh);
    else fresh.forEach((a, j) => { const d = D.get(uncat(a.category)); addBuilding(a, d, REDUCED ? 0 : j * 60); setLabel(d); });
    drawPending();
  }
  dirty = true; syncTown(); nameLabels();
}
function relayout(fresh) {
  const G = new Map(), grp = (c) => G.get(c) || G.set(c, { cat: c, slots: [], fresh: [], agents: [] }).get(c);
  for (const i of BY.values()) { const s = S[i]; if (s.kind === "sink") { s.ghost = true; continue; } const g = grp(s.d.cat); g.slots.push(i); g.agents.push(i); } // ghosts leave on their own, outside any grid
  for (const a of fresh) { const g = grp(uncat(a.category)); g.fresh.push(a); g.agents.push(a); }
  const list = [...G.values()].sort((p, q2) => q2.agents.length - p.agents.length), at = layout(list);
  for (const d of [...D.values()]) if (!G.has(d.cat)) dropDistrict(d);
  let n = 0;
  list.forEach((g, gi) => {
    const cnt = g.agents.length; let d = D.get(g.cat);
    if (!d) d = addDistrict(g.cat, cnt, at[gi][0], at[gi][1]);
    else { const s = dimOf(cnt), size = s * T.pitch; Object.assign(d, { s, size, x0: at[gi][0], z0: at[gi][1] }); d.pad.scale.set(size + .3, d.pad.scale.y, size + .3); d.pad.position.set(d.x0 + size / 2, 0, d.z0 + size / 2); }
    d.used = new Set(); d.n = 0; const moved = [];
    for (const i of g.slots) { const s = S[i]; s.d = d; if (s.k < d.s * d.s && !d.used.has(s.k)) d.used.add(s.k); else moved.push(i); d.n++; }
    for (const i of moved) S[i].k = cellOf(d);
    for (const i of g.slots) { const s = S[i]; [s.x, s.z] = cellPos(d, s.k); writeSlot(i); }
    d.n = g.slots.length;
    for (const a of g.fresh) addBuilding(a, d, REDUCED ? 0 : 150 + n++ * 60);
    setLabel(d);
  });
  dirty = true; bodies.instanceMatrix.needsUpdate = lamps.instanceMatrix.needsUpdate = true; frameShadow();
}
function retire(i) {
  const s = S[i]; s.dead = true; s.cur = 0; ACTIVE.delete(i); BY.delete(s.handle); FREE.push(i);
  if (!s.ghost) { s.d.used.delete(s.k); s.d.n--; if (s.d.n <= 0) dropDistrict(s.d); else setLabel(s.d); }
  writeSlot(i); removeReceipts(s.handle); if (selH === s.handle) select(null); dirty = true; syncTown();
}

function tick(now) {
  for (const i of ACTIVE) {
    const s = S[i]; const t = Math.min(1, Math.max(0, (now - s.t0) / s.dur));
    if (now < s.t0) continue;
    s.cur = s.from + (s.to - s.from) * (s.kind === "rise" ? back(t) : ease(t));
    if (s.pulse0 != null && now - s.pulse0 > T.pulse) s.pulse0 = null;
    writeSlot(i); dirty = true;
    if (t >= 1 && s.pulse0 == null) { s.cur = s.to; ACTIVE.delete(i); if (s.kind === "sink") retire(i); else writeSlot(i); }
  }
  for (const d of D.values()) if (d.padT0 != null) { const t = Math.min(1, (now - d.padT0) / 350); d.pad.scale.y = REDUCED ? 1 : ease(t); if (t >= 1) d.padT0 = null; }
  if (dirty) { bodies.instanceMatrix.needsUpdate = lamps.instanceMatrix.needsUpdate = true; dirty = false; }
}

/* ---------- receipts: drawn only from re-checked records ---------- */
const RC = [], RD = []; // RC: drawn receipts (keyed by handle, never slot); RD: every re-checked receipt, so one can come back with its agent
// RD.reveal (0..1) is how much of a receipt the tour has drawn: 0 until played, 1 after, or at once when the tour is skipped.
const counted = (rc) => rc.reproduced && rc.outcome === "pass" && !rc.self_hire && rc.buyer_owner != null && rc.seller_owner != null && rc.buyer_owner !== rc.seller_owner;
const norm = (v) => String(v || "").toLowerCase().replace(/[^a-z0-9]/g, "");

// The buyer is an owner in data/agents.json (run.requester.agent). Its building is one of its executor_ids
// when listed, else the market listing whose builder display_name (or handle, or name) is that owner's name.
// With no listing at all it is a labelled off-market marker at the town edge: the buyer is real, it just has no listing.
function buyerOf(run) {
  const id = run.requester && run.requester.agent; if (!id) return null;
  const def = ownerList.find((a) => a.id === id), name = (def && def.name) || id, key = norm(name);
  const exec = ((def && def.executor_ids) || []).find((h) => BY.has(h) && S[BY.get(h)].kind !== "sink");
  if (exec) return { handle: exec, name, via: "executor_ids" };
  const byBuilder = (s) => (norm(s.agent.builder && s.agent.builder.display_name) === key ? 0 : 1);
  const hits = key.length < 4 ? [] : [...BY.values()].map((i) => S[i]).filter((s) => s.kind !== "sink" && (byBuilder(s) === 0 || norm(s.handle).startsWith(key) || norm(s.agent.name).startsWith(key)))
    .sort((p, q2) => byBuilder(p) - byBuilder(q2) || (q2.agent.delivered_jobs || 0) - (p.agent.delivered_jobs || 0) || (p.handle < q2.handle ? -1 : 1));
  return hits.length ? { handle: hits[0].handle, name, via: byBuilder(hits[0]) === 0 ? "builder display_name" : "handle or name" } : { handle: null, name, via: "off-market" };
}
const OFF = new Map(); // owner name -> { g, L }: off-market buyers, west of the town
const offPos = (name) => [extentMinX - 2.4, (extentMinZ + extentMaxZ) / 2 + [...OFF.keys()].indexOf(name) * 2.2];
function offMarket(name) {
  if (OFF.has(name)) return OFF.get(name);
  const g = new THREE.Group(), m = clay(DARK ? "#56657a" : "#9aa7b8");
  const base = new THREE.Mesh(new THREE.CylinderGeometry(.42, .5, .5, 20).translate(0, .25, 0), m), roof = new THREE.Mesh(new THREE.ConeGeometry(.6, .4, 20).translate(0, .7, 0), m);
  base.castShadow = roof.castShadow = true; g.userData.off = name; g.add(base, roof); scene.add(g);
  const o = { g }; OFF.set(name, o);
  o.L = label("nm", `off-market buyer: ${name}`, "", (v) => { const [x, z] = offPos(name); v.set(x, 1.5, z); }, null, 4);
  return o;
}
function endB(e) { // the buyer end of an arc -> { x, z, cur } or null
  if (e.buyer != null) { const i = BY.get(e.buyer); return i != null ? S[i] : null; }
  if (e.off) { const [x, z] = offPos(e.off); OFF.get(e.off).g.position.set(x, 0, z); return { x, z, cur: .9 }; }
  return null;
}
function revealArc(e) {
  const k = e.src.reveal; e.mesh.visible = k > 0;
  if (e.curve) { const g = e.mesh.geometry.parameters; e.mesh.geometry.setDrawRange(0, Math.round(k * g.tubularSegments) * g.radialSegments * 6); }
  else e.mesh.scale.y = Math.max(k, 1e-3);
}
function arcOf(e) {
  const as = BY.get(e.seller); if (as == null) return;
  const a = S[as], b = endB(e), sig = [a.x, a.z, a.cur.toFixed(2), b && b.x, b && b.z, b && b.cur.toFixed(2)].join();
  if (sig !== e.sig) {
    e.sig = sig;
    if (e.mesh) { scene.remove(e.mesh); e.mesh.geometry.dispose(); }
    if (b) { const mid = new THREE.Vector3((a.x + b.x) / 2, Math.max(a.cur, b.cur) + 2 + Math.hypot(a.x - b.x, a.z - b.z) * .3, (a.z + b.z) / 2);
      e.curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(b.x, b.cur + .3, b.z), mid, new THREE.Vector3(a.x, a.cur + .3, a.z));
      e.mesh = new THREE.Mesh(new THREE.TubeGeometry(e.curve, 64, .075, 8), e.mat);
    } else { e.curve = null; e.mesh = new THREE.Mesh(new THREE.CylinderGeometry(.07, .07, 6, 8).translate(0, 3, 0), e.mat); e.mesh.position.set(a.x, a.cur, a.z); }
    scene.add(e.mesh);
  }
  revealArc(e);
}
function drawReceipt(r) {
  const { rc, run } = r, sellerSlot = BY.get(rc.seller_handle); if (sellerSlot == null) return;
  if (r.reveal == null) r.reveal = tour.state === "done" || tour.state === "skipped" ? 1 : 0;
  if (rc.self_hire) {
    const g = new THREE.Group(), m = new THREE.MeshStandardMaterial({ color: T.pink, roughness: .6, emissive: T.pink, emissiveIntensity: .25 });
    for (let k = 0; k < 18; k++) { const a = k / 18 * Math.PI * 2, b = new THREE.Mesh(new THREE.BoxGeometry(.2, .06, .09), m); b.position.set(Math.cos(a) * .85, 0, Math.sin(a) * .85); b.rotation.y = -a; g.add(b); }
    scene.add(g);
    const L = label("chiplab", "self-hire, 0 points", `background:#cf4870`, (v) => { const s = S[BY.get(rc.seller_handle)]; if (s) v.set(s.x, s.cur + .35, s.z + 1.3); }, () => r.reveal >= 1 && BY.has(rc.seller_handle));
    RC.push({ kind: "self", seller: rc.seller_handle, g, L, loop: "self_hire", src: r }); r.drawn = true;
    town.loops.push({ handle: rc.seller_handle, kind: "self_hire", label: "self-hire, 0 points" });
    return;
  }
  const ok = rc.reproduced && rc.outcome === "pass", cross = rc.buyer_owner && rc.seller_owner && rc.buyer_owner !== rc.seller_owner;
  const color = ok && cross ? T.green : (!ok ? T.red : null); if (color == null) return;
  const by = buyerOf(run), mat = new THREE.MeshStandardMaterial({ color, roughness: .5, emissive: color, emissiveIntensity: .35 }), loop = ok && cross ? "verified" : "failed";
  const e = { kind: "arc", seller: rc.seller_handle, buyer: by && by.handle, off: by && by.handle == null ? by.name : null, buyerName: by && by.name, via: by && by.via, mat, mesh: null, sig: "", loop, src: r };
  if (e.off) offMarket(e.off);
  RC.push(e); r.drawn = true; arcOf(e);
  town.loops.push({ handle: rc.seller_handle, kind: loop });
  town.buyers = RC.filter((x) => x.kind === "arc").map((x) => ({ seller: x.seller, buyer: x.buyer, off_market: x.off, owner: x.buyerName, via: x.via }));
}
const drawPending = () => { for (const r of RD) if (!r.drawn) drawReceipt(r); };
function removeReceipts(h) {
  for (const e of [...RC]) {
    if (e.seller !== h && e.buyer !== h) continue;
    RC.splice(RC.indexOf(e), 1); e.src.drawn = false;
    if (e.g) scene.remove(e.g); if (e.mesh) { scene.remove(e.mesh); e.mesh.geometry.dispose(); } if (e.L) dropLabel(e.L);
    const k = town.loops.findIndex((l) => l.handle === e.seller && l.kind === e.loop); if (k >= 0) town.loops.splice(k, 1);
  }
  drawPending(); refreshSeals(); nameLabels(); // a buyer that left is looked up again (another listing, or off-market); a seller that left leaves nothing
}
async function loadReceipts() {
  const j = (u) => fetch(u).then((r) => { if (!r.ok) throw new Error(`${u}: HTTP ${r.status}`); return r.json(); });
  try {
    const man = await j("data/manifest.json"); let n = 0;
    for (const r of man.runs || []) {
      const run = await j(`data/${r.file}`);
      const rc = await P.checkReceipt(run, C); if (!rc) continue;
      n++; town.receipts = n; $("rcptChip").textContent = `receipts checked: ${n}`;
      const rd = { rc, run, drawn: false, reveal: null }; RD.push(rd); drawReceipt(rd);
      town.crossOwner = RD.filter((x) => counted(x.rc)).length; $("crossChip").textContent = `verified cross-owner: ${town.crossOwner}`;
    }
  } catch (e) { console.warn("receipts not loaded", e); }
  town.receiptsDone = true; refreshSeals();
}

/* ---------- gold seals and name labels ---------- */
const SEALS = new Map(); // seller handle -> { g, t0 }: a proof-backed receipt (counted) that the tour has shown
const sealMat = new THREE.MeshStandardMaterial({ color: T.gold, metalness: .7, roughness: .3, emissive: T.gold, emissiveIntensity: .22 });
const sealGeo = new THREE.CylinderGeometry(.2, .2, .05, 28).rotateX(Math.PI / 2), rimGeo = new THREE.TorusGeometry(.21, .03, 8, 28);
function refreshSeals() {
  const want = new Set(RD.filter((r) => counted(r.rc) && r.reveal >= 1 && BY.has(r.rc.seller_handle)).map((r) => r.rc.seller_handle));
  for (const [h, o] of SEALS) if (!want.has(h)) { scene.remove(o.g); SEALS.delete(h); }
  for (const h of want) if (!SEALS.has(h)) { const g = new THREE.Group(), c = new THREE.Mesh(sealGeo, sealMat); c.castShadow = true; g.add(c, new THREE.Mesh(rimGeo, sealMat)); scene.add(g); SEALS.set(h, { g, t0: performance.now() }); }
  town.seals = [...SEALS.keys()];
}
const NAMES = new Map(); // handle -> label: the busiest few, plus both ends of every receipt the tour has shown
function nameLabels() {
  const live = [...BY.values()].map((i) => S[i]).filter((s) => s.kind !== "sink" && (s.agent.delivered_jobs || 0) > 0);
  const want = new Map(live.sort((p, q2) => q2.agent.delivered_jobs - p.agent.delivered_jobs || (p.handle < q2.handle ? -1 : 1)).slice(0, innerWidth < 600 ? 3 : T.names).map((s) => [s.handle, s.handle]));
  for (const e of RC) if (e.kind === "arc" && e.src.reveal >= 1) { want.set(e.seller, e.seller); if (e.buyer != null) want.set(e.buyer, `${e.buyerName} · buyer`); }
  for (const [h, L] of [...NAMES]) if (want.get(h) !== L.text) { dropLabel(L); NAMES.delete(h); }
  for (const [h, text] of want) if (!NAMES.has(h)) {
    const party = RC.some((e) => e.kind === "arc" && (e.seller === h || e.buyer === h));
    const L = label("nm", text, `border-left-color:${tone(uncat(S[BY.get(h)].agent.category), "tall")}`, (v) => { const k = BY.get(h); if (k != null) v.set(S[k].x, S[k].cur + 1.15, S[k].z); }, () => BY.has(h), party ? 4 : 1);
    L.text = text; NAMES.set(h, L);
  }
  town.names = [...NAMES.values()].map((L) => L.text);
}

/* ---------- the receipt tour: camera, buyer pulse, arc, live re-check, card ---------- */
const tour = (town.tour = { state: "idle", step: null, played: [], check: null, tag: null });
let tourRun = 0, tagAt = null, haloAt = null, sparkE = null;
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
const tween = (ms, fn, alive) => ms <= 0 ? (fn(1), Promise.resolve()) : new Promise((ok) => { const t0 = performance.now(); const go = () => { if (!alive()) return ok(); const k = Math.min(1, (performance.now() - t0) / ms); fn(ease(k)); if (k < 1) setTimeout(go, 16); else ok(); }; go(); });
const tagL = label("tag", "", "", (v) => { const i = BY.get(tagAt); if (i != null) v.set(S[i].x, S[i].cur + 2.1, S[i].z); }, () => tagAt != null && BY.has(tagAt));
function setTag(h, text, cls) { tagAt = h; tagL.el.textContent = text; tagL.el.className = "tag" + (cls ? " " + cls : ""); tagL.size = null; tour.tag = h == null ? null : text; }
const halo = new THREE.Mesh(new THREE.TorusGeometry(.62, .06, 8, 44), new THREE.MeshBasicMaterial({ color: T.green, transparent: true, opacity: .85 }));
halo.rotation.x = Math.PI / 2; halo.visible = false; scene.add(halo);
const spark = new THREE.Mesh(new THREE.SphereGeometry(.16, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffffff })); spark.visible = false; scene.add(spark);

// Eases the camera onto the points (with their heights), the arc seen side-on from the nearer side.
function frameOn(pts, dur) {
  const c = new THREE.Vector3(); let top = 0;
  for (const p of pts) { c.x += p.x / pts.length; c.z += p.z / pts.length; top = Math.max(top, p.cur); }
  const sep = pts.length > 1 ? Math.hypot(pts[0].x - pts[1].x, pts[0].z - pts[1].z) : 0;
  c.y = Math.min(top, 4) * .5 + (sep ? 1 + sep * .12 : .6);
  const now = Math.atan2(camera.position.x - controls.target.x, camera.position.z - controls.target.z), off = (x) => Math.abs(Math.atan2(Math.sin(x - now), Math.cos(x - now)));
  let az = now;
  if (sep > .01) { const side = Math.atan2(pts[0].x - pts[1].x, pts[0].z - pts[1].z) + Math.PI / 2; az = off(side) <= off(side + Math.PI) ? side : side + Math.PI; }
  const dist = Math.max(8.5, sep * 1.7 + 7 + top * .8), tilt = 30 * Math.PI / 180;
  fly = { t0: performance.now(), from: controls.target.clone(), fromP: camera.position.clone(), to: c, toP: c.clone().add(new THREE.Vector3(Math.sin(az) * Math.cos(tilt) * dist, Math.sin(tilt) * dist, Math.cos(az) * Math.cos(tilt) * dist)), dur, io: true };
  return sleep(dur);
}
const order = () => RC.filter((e) => BY.has(e.seller)).sort((p, q2) => rank(p) - rank(q2));
const rank = (e) => (e.loop === "verified" ? 0 : e.loop === "failed" ? 1 : 2); // the cross-owner receipt plays first
async function playTour() {
  const list = order(), run = ++tourRun, alive = () => run === tourRun;
  if (!list.length) { tour.state = "done"; return; }
  tour.state = "playing"; tour.played = []; tour.check = null; $("replayBtn").disabled = true;
  for (const r of RD) r.reveal = 0;
  refreshSeals(); nameLabels(); select(null);
  if (!REDUCED) frameAll(false, T.flyHome);
  await sleep(T.tourHold);
  for (const e of list) { if (!alive()) return; await playOne(e, alive); }
  if (!alive()) return;
  setTag(null, ""); haloAt = null;
  if (!REDUCED) frameAll(false, T.flyHome);
  if (innerWidth <= 700 && !DEMO) select(null); // a bottom sheet would hide the overview on a phone
  Object.assign(tour, { state: "done", step: null }); $("replayBtn").disabled = false;
}
async function playOne(e, alive) {
  const r = e.src, sl = () => S[BY.get(e.seller)], step = (tour.step = { id: r.rc.id, kind: e.loop, seller: e.seller, buyer: e.buyer ?? e.off ?? null, phase: "fly" });
  if (!sl()) return;
  if (!REDUCED) await frameOn(e.kind === "arc" && endB(e) ? [endB(e), sl()] : [sl()], T.tourFly);
  if (!alive() || !sl()) return;
  // Highlight the buyer (the seller itself on a self-hire) and pulse its building.
  step.phase = "pulse"; halo.material.color.setHex(e.loop === "verified" ? T.green : e.loop === "failed" ? T.red : T.pink);
  haloAt = () => (e.kind === "arc" ? endB(e) : sl());
  const bi = BY.get(e.buyer ?? e.seller);
  if (!REDUCED && bi != null && e.off == null) for (let k = 0; k < 2; k++) { S[bi].pulse0 = performance.now(); ACTIVE.add(bi); await sleep(T.pulse + 60); if (!alive()) return; }
  step.phase = "arc"; sparkE = e;
  await tween(REDUCED ? 0 : T.arcDraw, (k) => (r.reveal = k), alive); sparkE = null; if (!alive()) return;
  r.reveal = 1;
  // The tag is this browser's checker, run again now on the same record: nothing here is a stored string.
  step.phase = "check"; setTag(e.seller, "re-checking...", "");
  const t0 = performance.now(), rc2 = await P.checkReceipt(r.run, C);
  await sleep(Math.max(0, T.recheck - (performance.now() - t0))); if (!alive()) return;
  tour.check = { id: rc2.id, outcome: rc2.outcome, recomputed_digest: rc2.recomputed_digest, stored_digest: rc2.stored_digest, reproduced: rc2.reproduced };
  const d8 = (x) => String(x).slice(0, 8), good = rc2.reproduced && rc2.outcome === "pass";
  const text = rc2.outcome == null ? "nothing to re-check" : rc2.outcome !== "pass" && !rc2.recomputed_digest ? `re-check failed: checker says ${rc2.outcome}` : !rc2.reproduced ? `seal ${d8(rc2.recomputed_digest)} does not match ${rc2.stored_digest ? d8(rc2.stored_digest) : "a stored seal"}`
    : `seal ${d8(rc2.recomputed_digest)} matches${rc2.outcome !== "pass" ? `, checker says ${rc2.outcome}` : ""}${rc2.self_hire ? ", self-hire: 0 points" : ""}`;
  setTag(e.seller, text, !good ? "bad" : rc2.self_hire ? "self" : "ok");
  refreshSeals(); nameLabels();
  await sleep(T.result); if (!alive()) return;
  step.phase = "card"; select(e.seller);
  await sleep(T.cardHold); if (!alive()) return;
  tour.played.push({ id: r.rc.id, kind: e.loop, tag: tour.tag });
  setTag(null, ""); haloAt = null;
}
// Any hand on the town stops the tour and shows every receipt at once.
function skipTour(why) {
  if (tour.state !== "idle" && tour.state !== "playing") return;
  tourRun++; if (tour.state === "playing") fly = null;
  Object.assign(tour, { state: "skipped", step: null, skipped: why }); sparkE = null; haloAt = null; setTag(null, "");
  for (const r of RD) r.reveal = 1;
  refreshSeals(); nameLabels(); $("replayBtn").disabled = false;
}
async function autoTour() {
  $("replayBtn").hidden = !RC.length;
  while (ACTIVE.size && tour.state === "idle") await sleep(100); // let the town finish rising
  if (tour.state === "idle") playTour();
}

/* ---------- picking, tooltip, panel, search ---------- */
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), tip = $("tip");
function pick(ev) {
  const r = renderer.domElement.getBoundingClientRect(); ndc.set((ev.clientX - r.left) / r.width * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera); const hit = ray.intersectObject(bodies, false)[0];
  return hit && S[hit.instanceId] && !S[hit.instanceId].dead ? hit.instanceId : null;
}
const marker = new THREE.Group(); marker.visible = false; scene.add(marker);
{ const m = new THREE.MeshBasicMaterial({ color: 0x3b78de, transparent: true, opacity: .9 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(.6, .05, 8, 40), m); ring.rotation.x = Math.PI / 2; ring.position.y = .12;
  const pin = new THREE.Mesh(new THREE.ConeGeometry(.2, .4, 14), m); pin.rotation.x = Math.PI; pin.name = "pin"; marker.add(ring, pin); }
let selH = null; // selection is by handle: slots are recycled
function select(handle) {
  selH = handle != null && BY.has(handle) ? handle : null; marker.visible = selH != null;
  const p = $("panel"); document.body.classList.toggle("panel-open", selH != null);
  if (selH == null) { p.hidden = true; $("panelBody").replaceChildren(); return; }
  const el = document.createElement("agentproof-portfolio"); el.setAttribute("agent", handle); el.setAttribute("theme", DARK ? "dark" : "light");
  $("panelBody").replaceChildren(el); $("panelLink").href = `portfolio.html#${encodeURIComponent(handle)}`; p.hidden = false;
}
function flyTo(i) {
  const s = S[i], to = new THREE.Vector3(s.x, s.cur / 2, s.z), dir = camera.position.clone().sub(controls.target).setLength(10);
  fly = { t0: performance.now(), from: controls.target.clone(), fromP: camera.position.clone(), to, toP: to.clone().add(dir) };
  if (REDUCED) { controls.target.copy(to); camera.position.copy(fly.toP); fly = null; }
}
let fly = null;
function frameAll(instant, dur) {
  // With the card open on a wide screen, fit the town into the width the panel leaves.
  const aspect = !panelEl.hidden && innerWidth > 700 ? Math.max(.5, (innerWidth - Math.min(400, innerWidth)) / innerHeight) : camera.aspect;
  const minX = extentMinX - (OFF.size ? 3.4 : 0); // an off-market buyer stands west of the town and must stay in frame
  const R = Math.hypot(extentMaxX - minX, extentMaxZ - extentMinZ) / 2, v = camera.fov * Math.PI / 360, hf = Math.atan(Math.tan(v) * aspect);
  const dist = Math.min(200, R / Math.tan(Math.min(v, hf)) * .82 + 4), tilt = 55 * Math.PI / 180;
  const to = new THREE.Vector3((minX + extentMaxX) / 2, 0, (extentMinZ + extentMaxZ) / 2);
  fly = { t0: performance.now(), from: controls.target.clone(), fromP: camera.position.clone(), to, toP: to.clone().add(new THREE.Vector3(0, Math.sin(tilt) * dist, Math.cos(tilt) * dist)), dur, io: !!dur };
  if (instant || REDUCED) { controls.target.copy(to); camera.position.copy(fly.toP); fly = null; }
}
function frameShadow() {
  const r = Math.max(extentMaxX - extentMinX, extentMaxZ - extentMinZ) / 2 + 6, cx = (extentMinX + extentMaxX) / 2, cz = (extentMinZ + extentMaxZ) / 2;
  sun.position.set(cx - r * .5, r * 1.1, cz + r * .6); sun.target.position.set(cx, 0, cz);
  Object.assign(sun.shadow.camera, { left: -r * 1.3, right: r * 1.3, top: r * 1.3, bottom: -r * 1.3, near: 1, far: r * 4 }); sun.shadow.camera.updateProjectionMatrix();
}

let down = null;
renderer.domElement.addEventListener("pointerdown", (e) => { down = [e.clientX, e.clientY]; if (connected) skipTour("pointer"); });
renderer.domElement.addEventListener("wheel", () => connected && skipTour("wheel"), { passive: true });
renderer.domElement.addEventListener("pointerup", (e) => {
  if (!down || !bodies || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return; down = null;
  const i = pick(e); if (i != null) select(S[i].handle);
});
let hoverEv = null;
renderer.domElement.addEventListener("pointermove", (e) => { if (e.pointerType === "mouse" && e.buttons === 0) hoverEv = e; else { hoverEv = null; tip.hidden = true; } });
renderer.domElement.addEventListener("pointerleave", () => { hoverEv = null; tip.hidden = true; });
function hover() {
  if (!hoverEv || !bodies) return; const e = hoverEv; hoverEv = null;
  const i = pick(e), offHit = i == null && OFF.size ? ray.intersectObjects([...OFF.values()].map((o) => o.g), true)[0] : null;
  if (i == null && !offHit) { tip.hidden = true; renderer.domElement.style.cursor = ""; return; }
  tip.hidden = false; renderer.domElement.style.cursor = i == null ? "" : "pointer";
  tip.replaceChildren(); const b = document.createElement("b"), sp = document.createElement("span"); sp.style.whiteSpace = "pre-line";
  if (i == null) {
    const name = offHit.object.parent.userData.off; b.textContent = `off-market buyer: ${name}`;
    sp.textContent = `${name} is the buyer on a checked receipt. The buyer is real. It has no listing on market.near.ai, so it has no building.`;
  } else {
    const a = S[i].agent, bought = RC.filter((x) => x.kind === "arc" && x.buyer === a.handle), n = bought.length;
    b.textContent = a.name || a.handle;
    sp.textContent = `${uncat(a.category)}\ndelivered ${a.delivered_jobs ?? "n/a"} · success ${a.success_rate != null ? a.success_rate + "%" : "n/a"}`
      + (n ? `\nlisted by ${bought[0].buyerName}, the buyer on ${n} checked ${n === 1 ? "receipt" : "receipts"}` : "");
  }
  tip.append(b, sp);
  tip.style.left = Math.min(innerWidth - 250, e.clientX + 14) + "px"; tip.style.top = Math.min(innerHeight - 90, e.clientY + 14) + "px";
}
$("panelClose").addEventListener("click", () => select(null));
addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("panel").hidden) select(null); });
$("search").addEventListener("change", () => {
  skipTour("search");
  const v = $("search").value.trim().toLowerCase(); if (!v) return;
  const i = BY.get($("search").value.trim()) ?? [...BY].find(([h, k]) => h.toLowerCase() === v || (S[k].agent.name || "").toLowerCase() === v)?.[1];
  if (i == null) return; flyTo(i); selH = S[i].handle; marker.visible = true;
});

/* ---------- header ---------- */
function header(res) {
  const when = res.fetched_at && !isNaN(Date.parse(res.fetched_at)) ? new Date(res.fetched_at).toISOString().slice(0, 16).replace("T", " ") + " UTC" : null;
  $("srcText").textContent = res.source === "relay" ? "live via relay" : res.source === "live" ? "live" : `snapshot from ${when || "an unknown time"}`;
  $("srcChip").classList.toggle("relay", res.source === "relay"); $("srcChip").classList.remove("stale"); $("srcChip").title = res.fetched_at ? `fetched ${res.fetched_at}` : "";
  $("countChip").hidden = $("rcptChip").hidden = $("crossChip").hidden = $("search").hidden = $("legend").hidden = false;
  $("countChip").textContent = `${town.count} agents`;
  town.source = res.source; town.fetched_at = res.fetched_at;
}
let goodAt = null;
// A failed or implausible refresh keeps the buildings but says so; recovery comes from the next good header().
function stale(why) {
  const t = goodAt && !isNaN(Date.parse(goodAt)) ? new Date(goodAt).toISOString().slice(11, 16) + " UTC" : "an unknown time";
  $("srcText").textContent = `relay lost, data from ${t}`; $("srcChip").classList.remove("relay"); $("srcChip").classList.add("stale"); $("srcChip").title = why;
  town.source = "stale";
}
function searchList() { $("handles").replaceChildren(...town.handles.sort().map((h) => { const o = document.createElement("option"); o.value = h; o.label = S[BY.get(h)].agent.name || ""; return o; })); }

/* ---------- connect ---------- */
let connected = false, connecting = false, timer = null;
async function connect(auto) {
  if (connecting || connected) return; connecting = true; // the probe timer and a click can race
  const btn = $("connect"), note = $("note"); btn.disabled = true; note.className = ""; note.textContent = auto ? "connecting via relay" : "connecting...";
  try {
    const [res, ag] = await Promise.all([M.fetchAgents(), fetch("data/agents.json").then((r) => (r.ok ? r.json() : { agents: [] })).catch(() => ({ agents: [] }))]);
    // An automatic connect only counts when the relay answered; a silent snapshot would hide that it is not live.
    if (auto && res.source !== "relay") throw new Error("the relay did not answer");
    ownerList = ag.agents || [];
    makeMeshes(Math.ceil(res.agents.length * T.capHead) + 16);
    $("empty").hidden = true; connected = true;
    fill(res.agents); header(res); if (res.source === "relay") goodAt = res.fetched_at; searchList(); frameAll(); town.ready = true;
    loadReceipts().then(autoTour);
    if (res.source === "relay") timer = setInterval(refresh, T.refresh);
  } catch (e) {
    connecting = false; btn.disabled = false; note.className = "err"; note.textContent = `Could not connect: ${e.message || e}. Try again.`;
  }
}
let refreshing = false;
async function refresh() {
  if (document.hidden || refreshing) return; refreshing = true;
  try {
    const res = await M.fetchAgents();
    if (res.source !== "relay") return stale(`relay did not answer${res.live_error ? ": " + res.live_error : ""}`);
    const n = new Set(res.agents.map((a) => a.handle).filter(Boolean)).size;
    if (n === 0 || n < town.count * .5) return stale(`relay answered with ${n} agents, kept the ${town.count} already drawn`);
    update(res.agents); header(res); goodAt = res.fetched_at; searchList();
  } catch (e) { console.warn("refresh failed", e); stale(String(e.message || e)); } finally { refreshing = false; }
}
window.__refresh = refresh; // test hook: one refresh now
// test hook: live buildings whose cell lies outside their district pad, plus pad/label counts
window.__town.cam = () => camera.position.toArray().map((v) => v.toFixed(3)).join(); // test hook: reduced motion must never move it
window.__town.audit = () => { let out = 0, live = 0; for (const i of BY.values()) { const s = S[i]; if (s.kind === "sink" || s.ghost) continue; live++; const d = s.d; if (D.get(d.cat) !== d || s.x < d.x0 || s.x > d.x0 + d.size || s.z < d.z0 || s.z > d.z0 + d.size) out++; } return { live, out, pads: D.size, labels: [...LABELS].filter((L) => L.el.classList.contains("place")).length, rcLoops: RC.length }; };
$("connect").addEventListener("click", () => connect(false));
$("replayBtn").addEventListener("click", () => playTour());
{ const relay = M.resolveRelay();
  // A dead relay is remembered for this page so Connect and the portfolio card do not each log a refused request.
  if (relay) M.probeRelay(relay).then((up) => { if (!up) document.documentElement.dataset.relay = "off"; if (up && !connected) { $("note").textContent = "connecting via relay"; $("connect").disabled = true; setTimeout(() => !connected && connect(true), T.autoDelay); } else if (DEMO) setTimeout(() => connect(false), T.autoDelay); });
  else if (DEMO) setTimeout(() => connect(false), T.autoDelay); } // a recording with no relay still runs, from the labelled snapshot

/* ---------- loop ---------- */
function resize() { const w = innerWidth, h = innerHeight, v = camera.view; renderer.setSize(w, h, false); camera.aspect = w / h; camera.fov = w < 600 ? 52 : 38;
  if (v && v.enabled) camera.setViewOffset(w, h, v.offsetX, v.offsetY, w, h); else camera.updateProjectionMatrix(); }
addEventListener("resize", resize); resize();
let last = performance.now(), frames = 0, fpsAt = last;
const easeIO = (t) => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
// With the card open, shift the picture so the town centres in the space the panel leaves.
const panelEl = $("panel"); let vx = 0, vy = 0;
function viewOffset(dt) {
  const open = !panelEl.hidden, wide = innerWidth > 700, tx = open && wide ? Math.min(400, innerWidth) / 2 : 0, ty = open && !wide ? innerHeight * .3 : 0;
  const k = REDUCED ? 1 : Math.min(1, dt / 180), nx = vx + (tx - vx) * k, ny = vy + (ty - vy) * k;
  if (Math.abs(nx - vx) < .05 && Math.abs(ny - vy) < .05 && (camera.view ? camera.view.enabled : false) === !!(tx || ty)) return;
  vx = Math.abs(nx - tx) < .5 ? tx : nx; vy = Math.abs(ny - ty) < .5 ? ty : ny;
  if (!vx && !vy) camera.clearViewOffset(); else camera.setViewOffset(innerWidth, innerHeight, vx, vy, innerWidth, innerHeight);
}
const nowT = () => performance.now();
function frame() {
  const now = nowT(); frames++;
  if (now - fpsAt >= 1000) { town.fps = Math.round(frames * 1000 / (now - fpsAt)); frames = 0; fpsAt = now; }
  if (fly) { const t = Math.min(1, (now - fly.t0) / (fly.dur || T.fly)), k = fly.io ? easeIO(t) : ease(t); controls.target.lerpVectors(fly.from, fly.to, k); camera.position.lerpVectors(fly.fromP, fly.toP, k); if (t >= 1) fly = null; }
  // A slow drift while the demo holds on the overview; never during a flight or a receipt.
  controls.autoRotate = DEMO && !REDUCED && !fly && tour.step == null && connected; controls.autoRotateSpeed = .35;
  viewOffset(now - last); last = now;
  if (bodies) {
    tick(now); hover();
    for (const r of RC) { const si = BY.get(r.seller); if (si == null) continue;
      if (r.kind === "self") { const s = S[si], shown = Math.round(r.src.reveal * 18); r.g.position.set(s.x, s.cur + .35, s.z); if (!REDUCED) r.g.rotation.y = now / 4000; r.g.children.forEach((c, k) => (c.visible = k < shown)); } else arcOf(r); }
    for (const [h, o] of SEALS) { const i = BY.get(h); if (i == null) continue; const s = S[i], k = REDUCED ? 1 : back(Math.min(1, (now - o.t0) / 520)); o.g.position.set(s.x, s.cur + .62, s.z); o.g.scale.setScalar(Math.max(k, .001)); if (!REDUCED) o.g.rotation.y = now / 1400; }
    const hp = haloAt && haloAt(); halo.visible = !!hp; if (hp) { halo.position.set(hp.x, .1, hp.z); halo.scale.setScalar(REDUCED ? 1.1 : 1.05 + .12 * Math.sin(now / 220)); }
    spark.visible = !!(sparkE && sparkE.curve); if (spark.visible) spark.position.copy(sparkE.curve.getPoint(sparkE.src.reveal));
    if (selH != null && BY.has(selH)) { const s = S[BY.get(selH)]; marker.position.set(s.x, 0, s.z); const pin = marker.getObjectByName("pin"); pin.position.y = s.cur + (SEALS.has(selH) ? 1.45 : .9) + Math.sin(now / 300) * .08; }
  }
  controls.update(); renderer.render(scene, camera); placeLabels(); requestAnimationFrame(frame);
}
// Steps the same work as the rAF loop, for headless tests that never get a paint.
window.__forceFrame = () => { tick(nowT()); controls.update(); renderer.render(scene, camera); placeLabels(); };
requestAnimationFrame(frame);
