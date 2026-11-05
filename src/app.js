// Market Town: every building is a real market.near.ai agent. The scene fills at once from the
// bundled snapshot (labelled as one), then upgrades to the live relay in the background when one
// answers. Receipts come from data/manifest.json (or a dropped run file) and are re-checked in this
// browser before they are drawn.
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
  capHead: 1.5, lens: 900, // lens: ms for the Market view <-> Proof view flip
  breathe: 1.7, breatheAmp: .2, // lit windows: radians per second, share of the glow that swings
  pink: 0xcf4870, blue: 0x3b78de, green: 0x169c5f, red: 0xd6423a, lamp_on: 0xffc94d, gold: 0xd4a52a,
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
const PROOF = new Map(); // seller handle -> counted receipts; the Proof view's height
let lens = "market";
const height = (jobs) => (jobs > 0 ? T.hBase + T.hSpan * Math.min(T.hMax, Math.log1p(jobs) / Math.log1p(T.hRef)) : T.plinth);
// available_now is the market's "right now" flag; availability ("available") is set on nearly every listing, so it only counts when available_now is absent.
const isOn = (a) => (a.available_now != null ? a.available_now === true : a.availability === "available" || a.availability === "available_now");
const targetH = (a) => (lens === "proof" ? (PROOF.get(a.handle) ? height(PROOF.get(a.handle)) : T.plinth) : height(a.delivered_jobs));
const ease = (t) => 1 - Math.pow(1 - t, 3);
const back = (t) => { const c = 1.4; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };

// Test hooks. count = buildings alive in the scene, kept equal to what the instances draw.
const town = (window.__town = { count: 0, capacity: 0, source: null, fetched_at: null, receipts: 0, loops: [], handles: [], fps: 0, districts: {}, ready: false, webgl: true, lens: "market", ticker: [], firstPaintMs: null, relay: null });

/* ---------- renderer ---------- */
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
} catch (e) {
  town.webgl = false;
  $("empty").hidden = false;
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
const tmpV = new THREE.Vector3(), CHROME = "#top > *, #top #tools > *, #dock > *, #dock #tools > *, #panel, #analysis, #toast";
function placeLabels() {
  const w = innerWidth, h = innerHeight, placed = [];
  for (const el of document.querySelectorAll(CHROME)) if (!el.hidden) { const r = el.getBoundingClientRect(); if (r.width && r.height) placed.push([r.left, r.top, r.right, r.bottom]); } // never under the header, dock or panels
  for (const L of LABELS) {
    if (L.when && !L.when()) { L.el.style.display = "none"; continue; }
    if (!L.size) { L.el.style.display = ""; L.size = [L.el.offsetWidth, L.el.offsetHeight]; }
    L.at(tmpV); tmpV.project(camera);
    const vis = tmpV.z < 1 && Math.abs(tmpV.x) < 1.2 && Math.abs(tmpV.y) < 1.2;
    const x = Math.round((tmpV.x * .5 + .5) * w - L.size[0] / 2), y = Math.round((-tmpV.y * .5 + .5) * h - L.size[1] / 2);
    const clear = vis && x >= 4 && y >= 4 && x + L.size[0] <= w - 4 && y + L.size[1] <= h - 4 && !placed.some((r) => x < r[2] && x + L.size[0] > r[0] && y < r[3] && y + L.size[1] > r[1]);
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
let bodyShader = null; // kept so one uniform (uTime) drives every lit window
bodyMat.onBeforeCompile = (sh) => {
  bodyShader = sh; sh.uniforms.uLamp = { value: new THREE.Color(T.lamp_on) }; sh.uniforms.uTime = { value: 0 }; sh.uniforms.uAmp = { value: T.breatheAmp };
  const v = "varying float vLit; varying float vY; varying float vH; varying float vU; varying float vSide; varying float vPh;";
  sh.vertexShader = sh.vertexShader.replace("#include <common>", `#include <common>\nattribute float aLit;\n${v}`)
    .replace("#include <begin_vertex>", "#include <begin_vertex>\nvLit = aLit; vH = length(instanceMatrix[1].xyz); vY = position.y * vH; vU = abs(normal.x) > .5 ? position.z + .5 : position.x + .5; vSide = 1. - abs(normal.y); vPh = instanceMatrix[3].x * .9 + instanceMatrix[3].z * 1.7;");
  sh.fragmentShader = sh.fragmentShader.replace("#include <common>", `#include <common>\nuniform vec3 uLamp; uniform float uTime; uniform float uAmp;\n${v}`)
    .replace("#include <color_fragment>", `#include <color_fragment>
      diffuseColor.rgb *= mix(1.07, mix(.6, 1., smoothstep(0., .5, vY)), vSide);
      float win = 0.;
      if (vSide > .5 && vH > .3) { float c = fract(vU * 3.), r = fract((vY - .2) / .22); win = step(.24, c) * step(c, .76) * step(.3, r) * step(r, .76) * step(.2, vY) * step(vY, vH - .14); }
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * mix(.48, .95, vLit), win);`)
    .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>\ntotalEmissiveRadiance += uLamp * win * vLit * .85 * (1. - uAmp + uAmp * sin(uTime * ${T.breathe.toFixed(2)} + vPh));`);
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
  const wide = Math.min(1.25, Math.max(.7, innerWidth / innerHeight * 1.1)); // a portrait phone gets a taller footprint so the town fills the screen
  const rowW = Math.max(sizes[0] || 0, Math.sqrt(sizes.reduce((a, s) => a + (s + T.gap) * (s + T.gap), 0)) * wide);
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
  const to = targetH(a), now = performance.now();
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
  if (connected) { $("countChip").textContent = `${town.count} agents`; tally(); } // a sunk building leaves after its animation
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
    const to = targetH(a); s.agent = a; s.on = isOn(a); setLook(i);
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
// when listed, else the market listing whose builder display_name (or handle, or name) equals that owner's name.
// With no listing at all it is a labelled off-market marker at the town edge: the buyer is real, it just has no listing.
function buyerOf(run) {
  const id = run.requester && run.requester.agent; if (!id) return null;
  const def = ownerList.find((a) => a.id === id), name = (def && def.name) || id, key = norm(name);
  const exec = ((def && def.executor_ids) || []).find((h) => BY.has(h) && S[BY.get(h)].kind !== "sink");
  if (exec) return { handle: exec, name, via: "executor_ids" };
  const byBuilder = (s) => (norm(s.agent.builder && s.agent.builder.display_name) === key ? 0 : 1);
  const hits = key.length < 4 ? [] : [...BY.values()].map((i) => S[i]).filter((s) => s.kind !== "sink" && (byBuilder(s) === 0 || norm(s.handle) === key || norm(s.agent.name) === key))
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
  const k = e.src.reveal; e.mesh.visible = k > 0 && !e.hide; if (e.ped) e.ped.visible = e.mesh.visible;
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
      e.curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(b.x, Math.max(b.cur, e.ped ? PED_H : 0) + .3, b.z), mid, new THREE.Vector3(a.x, a.cur + .3, a.z));
      e.mesh = new THREE.Mesh(new THREE.TubeGeometry(e.curve, 64, .075, 8), e.mat);
    } else { e.curve = null; e.mesh = new THREE.Mesh(new THREE.CylinderGeometry(.07, .07, 6, 8).translate(0, 3, 0), e.mat); e.mesh.position.set(a.x, a.cur, a.z); }
    scene.add(e.mesh);
  }
  if (e.ped && b) e.ped.position.set(b.x, 0, b.z);
  revealArc(e);
}
// A zero-job buyer is a flat tile; this blue pedestal gives the arc something to land on.
const PED_H = .26, pedMat = new THREE.MeshStandardMaterial({ color: T.blue, roughness: .55, emissive: T.blue, emissiveIntensity: .18 });
function makePed() {
  const g = new THREE.Group(), base = new THREE.Mesh(new THREE.CylinderGeometry(.5, .56, PED_H, 28).translate(0, PED_H / 2, 0), pedMat), ring = new THREE.Mesh(new THREE.TorusGeometry(.66, .045, 8, 36), pedMat);
  ring.rotation.x = Math.PI / 2; ring.position.y = .08; base.castShadow = true; g.add(base, ring); g.visible = false; scene.add(g); return g;
}
function drawReceipt(r) {
  const { rc, run } = r, sellerSlot = BY.get(rc.seller_handle); if (sellerSlot == null) return;
  if (r.reveal == null) r.reveal = tour.state === "idle" ? 0 : 1; // only a tour that has not started yet will play it
  if (rc.self_hire) {
    const g = new THREE.Group(), m = new THREE.MeshStandardMaterial({ color: T.pink, roughness: .6, emissive: T.pink, emissiveIntensity: .5 });
    for (let k = 0; k < 18; k++) { const a = k / 18 * Math.PI * 2, b = new THREE.Mesh(new THREE.BoxGeometry(.3, .1, .14), m); b.position.set(Math.cos(a) * 1.05, 0, Math.sin(a) * 1.05); b.rotation.y = -a; g.add(b); }
    scene.add(g);
    const L = label("chiplab", "self-hire: earns 0", `background:#cf4870;font-size:13px;padding:6px 9px`, (v) => { const s = S[BY.get(rc.seller_handle)]; if (s) v.set(s.x, s.cur + .35, s.z + 1.3); }, () => r.reveal >= 1 && BY.has(rc.seller_handle));
    RC.push({ kind: "self", seller: rc.seller_handle, g, L, loop: "self_hire", src: r }); r.drawn = true;
    town.loops.push({ handle: rc.seller_handle, kind: "self_hire", label: "self-hire, 0 points" });
    return;
  }
  const ok = rc.reproduced && rc.outcome === "pass", cross = rc.buyer_owner && rc.seller_owner && rc.buyer_owner !== rc.seller_owner;
  const color = ok && cross ? T.green : (!ok ? T.red : null); if (color == null) return;
  const by = buyerOf(run), mat = new THREE.MeshStandardMaterial({ color, roughness: .5, emissive: color, emissiveIntensity: .35 }), loop = ok && cross ? "verified" : "failed";
  const e = { kind: "arc", seller: rc.seller_handle, buyer: by && by.handle, off: by && by.handle == null ? by.name : null, buyerName: by && by.name, via: by && by.via, mat, mesh: null, sig: "", loop, src: r };
  if (e.off) offMarket(e.off); else if (e.buyer != null) e.ped = makePed();
  RC.push(e); r.drawn = true; arcOf(e);
  town.loops.push({ handle: rc.seller_handle, kind: loop });
  syncBuyers();
}
const syncBuyers = () => (town.buyers = RC.filter((x) => x.kind === "arc").map((x) => ({ seller: x.seller, buyer: x.buyer, off_market: x.off, owner: x.buyerName, via: x.via })));
const drawPending = () => { for (const r of RD) if (!r.drawn) drawReceipt(r); };
function removeReceipts(h) {
  for (const e of [...RC]) {
    if (e.seller !== h && e.buyer !== h) continue;
    RC.splice(RC.indexOf(e), 1); e.src.drawn = false;
    if (e.g) scene.remove(e.g); if (e.ped) scene.remove(e.ped); if (e.mesh) { scene.remove(e.mesh); e.mesh.geometry.dispose(); } if (e.L) dropLabel(e.L);
    const k = town.loops.findIndex((l) => l.handle === e.seller && l.kind === e.loop); if (k >= 0) town.loops.splice(k, 1);
  }
  drawPending(); refreshSeals(); nameLabels(); syncBuyers();
  for (const [name, o] of [...OFF]) if (!RC.some((e) => e.off === name)) { scene.remove(o.g); dropLabel(o.L); OFF.delete(name); }
  // a buyer that left is looked up again (another listing, or off-market); a seller that left leaves nothing
}
const getJ = (u) => fetch(u).then((r) => { if (!r.ok) throw new Error(`${u}: HTTP ${r.status}`); return r.json(); });
let MANIFEST = [], EXTRA = []; // EXTRA: blob URLs of dropped run files, so the card re-checks them too
let receiptsDone; const receiptsReady = new Promise((ok) => (receiptsDone = ok));
// Re-checks one run bundle in this browser and keeps it. -> { rd } | { dup } | null (not a market job record)
async function addRun(run, file) {
  const rc = await P.checkReceipt(run, C); if (!rc) return null;
  if (rc.id != null && RD.some((x) => x.rc.id === rc.id)) return { dup: rc };
  const rd = { rc, run, file, drawn: false, reveal: null }; RD.push(rd); return { rd };
}
// Counted receipts per seller drive the Proof view; call after any receipt is added.
function receiptsChanged() {
  PROOF.clear(); for (const r of RD) if (counted(r.rc)) PROOF.set(r.rc.seller_handle, (PROOF.get(r.rc.seller_handle) || 0) + 1);
  town.receipts = RD.length; town.crossOwner = RD.filter((x) => counted(x.rc)).length;
  $("rcptChip").textContent = `receipts checked: ${RD.length}`; $("crossChip").textContent = `verified cross-owner: ${town.crossOwner}`;
  retarget(); syncGlow(); tally(true); nameLabels(); refreshAnalysis();
}
async function loadReceipts() {
  try {
    const man = await getJ("data/manifest.json"); MANIFEST = (man.runs || []).map((r) => r.file);
    for (const r of man.runs || []) {
      const got = await addRun(await getJ(`data/${r.file}`), r.file); if (!got || !got.rd) continue;
      drawReceipt(got.rd); receiptsChanged();
    }
  } catch (e) { console.warn("receipts not loaded", e); }
  town.receiptsDone = true; refreshSeals(); receiptsChanged(); receiptsDone();
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
  const score = (s) => (lens === "proof" ? PROOF.get(s.handle) || 0 : s.agent.delivered_jobs || 0);
  const live = [...BY.values()].map((i) => S[i]).filter((s) => s.kind !== "sink" && score(s) > 0);
  const want = new Map(live.sort((p, q2) => score(q2) - score(p) || (p.handle < q2.handle ? -1 : 1)).slice(0, innerWidth < 600 ? 3 : T.names).map((s) => [s.handle, s.handle]));
  for (const e of RC) if (e.kind === "arc" && e.src.reveal >= 1 && !e.hide) { want.set(e.seller, e.seller); if (e.buyer != null) want.set(e.buyer, `${e.buyerName} · buyer`); }
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
// A self-hire tag has two lines in two colours: the checker's verdict, then what the owner rule does to it.
function setTag(h, text, cls) {
  tagAt = h; tagL.el.className = "tag" + (cls ? " " + cls : "");
  if (cls === "self" && text.includes("\n")) { const [a, b] = text.split("\n"), x = document.createElement("span"), y = document.createElement("span"); x.className = "ok"; x.textContent = a + "\n"; y.className = "self"; y.textContent = b; tagL.el.replaceChildren(x, y); }
  else tagL.el.textContent = text;
  tagL.size = null; tour.tag = h == null ? null : text.replace("\n", " | ");
}
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
const unhide = () => { for (const x of RC) x.hide = false; nameLabels(); };
async function playTour() {
  const list = order(), run = ++tourRun, alive = () => run === tourRun;
  if (!list.length) { tour.state = "done"; return; }
  tour.state = "playing"; tour.played = []; tour.check = null; $("replayBtn").disabled = true;
  for (const r of RD) r.reveal = 0;
  unhide(); refreshSeals(); nameLabels(); select(null);
  if (!REDUCED) frameAll(false, T.flyHome);
  await sleep(T.tourHold);
  for (const e of list) { if (!alive()) return; await playOne(e, alive); }
  if (!alive()) return;
  setTag(null, ""); haloAt = null; unhide();
  if (!REDUCED) frameAll(false, T.flyHome);
  if (innerWidth <= 700 && !DEMO) select(null); // a bottom sheet would hide the overview on a phone
  Object.assign(tour, { state: "done", step: null }); $("replayBtn").disabled = false;
}
async function playOne(e, alive) {
  const r = e.src, sl = () => S[BY.get(e.seller)], step = (tour.step = { id: r.rc.id, kind: e.loop, seller: e.seller, buyer: e.buyer ?? e.off ?? null, phase: "fly" });
  if (!sl()) return;
  if (e.kind === "self") { for (const x of RC) if (x.kind === "arc") x.hide = true; nameLabels(); } // the self-hire gets the stage alone
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
  if (!rc2) { setTag(e.seller, "nothing to re-check", "bad"); await sleep(T.result); setTag(null, ""); haloAt = null; return; }
  tour.check = { id: rc2.id, outcome: rc2.outcome, recomputed_digest: rc2.recomputed_digest, stored_digest: rc2.stored_digest, reproduced: rc2.reproduced };
  const d8 = (x) => String(x).slice(0, 8), good = rc2.reproduced && rc2.outcome === "pass";
  const text = rc2.outcome == null ? "nothing to re-check" : rc2.outcome !== "pass" && !rc2.recomputed_digest ? `re-check failed: checker says ${rc2.outcome}` : !rc2.reproduced ? `seal ${d8(rc2.recomputed_digest)} does not match ${rc2.stored_digest ? d8(rc2.stored_digest) : "a stored seal"}`
    : `seal ${d8(rc2.recomputed_digest)} matches${rc2.outcome !== "pass" ? `, checker says ${rc2.outcome}` : ""}`;
  setTag(e.seller, good && rc2.self_hire ? `checker passed, seal ${d8(rc2.recomputed_digest)} matches\nearns 0 reputation: same owner` : text, !good ? "bad" : rc2.self_hire ? "self" : "ok");
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
  unhide(); refreshSeals(); $("replayBtn").disabled = false;
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
function select(handle, still) {
  selH = handle != null && BY.has(handle) ? handle : null; marker.visible = selH != null;
  const p = $("panel"); document.body.classList.toggle("panel-open", selH != null);
  if (selH == null) { p.hidden = true; $("panelBody").replaceChildren(); return; }
  closeAnalysis();
  const el = document.createElement("agentproof-portfolio"); el.setAttribute("agent", handle); el.setAttribute("theme", DARK ? "dark" : "light"); if (!still) el.setAttribute("flip", ""); // still: a live refresh re-renders the open card without replaying the flip
  // A dropped run file is re-checked by the card too, next to the manifest runs.
  if (EXTRA.length) el.setAttribute("receipts", [...MANIFEST.map((f) => new URL(`data/${f}`, location.href).href), ...EXTRA].join(","));
  $("saveBtn").disabled = true; el.addEventListener("agentproof:ready", () => { if (selH === handle) $("saveBtn").disabled = false; });
  $("copyBtn").textContent = "Copy link"; $("saveBtn").textContent = "Save image";
  $("panelBody").replaceChildren(el); $("panelLink").href = `portfolio.html#${encodeURIComponent(handle)}`; p.hidden = false;
}
const toast = (msg, ms = 6500) => { const t = $("toast"); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), ms); };
$("saveBtn").addEventListener("click", async () => {
  const el = $("panelBody").firstElementChild, h = selH; if (!el || !h) return;
  try {
    const cv = await el.toCanvas(), blob = await new Promise((ok, no) => cv.toBlob((b) => (b ? ok(b) : no(new Error("empty image"))), "image/png"));
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `agentproof-${h}.png`; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    $("saveBtn").textContent = "Saved"; setTimeout(() => ($("saveBtn").textContent = "Save image"), 1600);
  } catch (e) { toast(`Could not make the image: ${e.message || e}`); }
});
$("copyBtn").addEventListener("click", async () => {
  if (!selH) return; const url = new URL(`portfolio.html#${encodeURIComponent(selH)}`, location.href).href; let ok = false;
  try { await navigator.clipboard.writeText(url); ok = true; } catch (e) {
    try { const t = document.createElement("textarea"); t.value = url; t.setAttribute("readonly", ""); t.style.cssText = "position:fixed;opacity:0"; document.body.append(t); t.select(); ok = document.execCommand("copy"); t.remove(); } catch (e2) { ok = false; }
  }
  town.copied = url;
  if (ok) { $("copyBtn").textContent = "Copied"; setTimeout(() => ($("copyBtn").textContent = "Copy link"), 1600); } else toast(`Copy this link: ${url}`, 12000);
});
function flyTo(i) {
  const s = S[i], to = new THREE.Vector3(s.x, s.cur / 2, s.z), dir = camera.position.clone().sub(controls.target).setLength(10);
  fly = { t0: performance.now(), from: controls.target.clone(), fromP: camera.position.clone(), to, toP: to.clone().add(dir) };
  if (REDUCED) { controls.target.copy(to); camera.position.copy(fly.toP); fly = null; }
}
let fly = null;
const sideW = () => (innerWidth <= 700 ? 0 : !anEl.hidden ? Math.min(720, innerWidth) : !panelEl.hidden ? Math.min(400, innerWidth) : 0);
function frameAll(instant, dur) {
  // With a side panel open on a wide screen, fit the town into the width it leaves.
  const aspect = sideW() ? Math.max(.5, (innerWidth - sideW()) / innerHeight) : camera.aspect;
  const minX = extentMinX - (OFF.size ? 3.4 : 0); // an off-market buyer stands west of the town and must stay in frame
  const tilt = (innerWidth <= 700 ? 62 : 55) * Math.PI / 180, v = camera.fov * Math.PI / 360, hf = Math.atan(Math.tan(v) * aspect);
  // The footprint is a rectangle: fit its width to the view's width and its foreshortened depth (plus tower height) to the height.
  const W = extentMaxX - minX, Dp = extentMaxZ - extentMinZ, usable = innerWidth <= 700 ? Math.max(.5, 1 - (dockH + topH) / innerHeight) : 1;
  const dist = Math.min(200, Math.max(W / 2 * 1.08 / Math.tan(hf), (Dp / 2 * Math.sin(tilt) + 1.6) * 1.12 / Math.tan(v) / usable) + 3);
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
/* ---------- find an agent: fuzzy over handle and name ---------- */
// Rank 0 exact, 1 prefix, 2 substring, 3 subsequence ("ceow" finds ceoclaw-web). Lower wins; ties go to the busier agent.
// Subsequence: the tightest window that holds the letters in order, so "ceow" prefers ceoclaw-web to a long name that happens to contain c, e, o, w.
const subseq = (t, q) => { let best = null; for (let a = t.indexOf(q[0]); a >= 0; a = t.indexOf(q[0], a + 1)) { let k = 1, i = a; while (k < q.length && (i = t.indexOf(q[k], i + 1)) >= 0) k++; if (k === q.length) { const w = i - a + 1, start = a === 0 ? 0 : /[-_. ]/.test(t[a - 1]) ? 1 : 2; if (best == null || start < best.start || (start === best.start && w < best.w)) best = { start, w }; } } return best; };
// Among subsequence hits: a match that starts the string beats one that starts a word beats one mid-word; then the tighter window.
const scoreOf = (t, q) => { if (t === q) return 0; if (t.startsWith(q)) return 1; if (t.includes(q)) return 2; const m = subseq(t, q); return m == null ? null : 3 + m.start + Math.min(.99, m.w / 100); };
function findAgents(text) {
  const q = text.trim().toLowerCase(), qn = norm(text); if (!qn) return [];
  const out = [];
  for (const [h, i] of BY) {
    const s = S[i]; if (s.kind === "sink" || s.dead) continue; const nm = (s.agent.name || "").toLowerCase();
    const r = [scoreOf(h.toLowerCase(), q), scoreOf(norm(h), qn), scoreOf(nm, q), scoreOf(norm(nm), qn)].filter((x) => x != null);
    if (r.length) out.push([Math.min(...r), -(s.agent.delivered_jobs || 0), h, s.agent]);
  }
  return out.sort((p, q2) => p[0] - q2[0] || p[1] - q2[1] || (p[2] < q2[2] ? -1 : 1)).slice(0, 6);
}
let hits = [], active = 0;
const searchEl = $("search"), listEl = $("results");
function closeList() { listEl.hidden = true; searchEl.setAttribute("aria-expanded", "false"); searchEl.removeAttribute("aria-activedescendant"); }
function paintList() {
  const text = searchEl.value; hits = findAgents(text); active = Math.min(active, Math.max(0, hits.length - 1));
  if (!text.trim()) return closeList();
  listEl.replaceChildren(...(hits.length ? hits.map(([, , h, a], k) => {
    const li = document.createElement("li"), n = document.createElement("span"), sm = document.createElement("small");
    li.id = `res${k}`; li.setAttribute("role", "option"); li.setAttribute("aria-selected", String(k === active)); li.dataset.h = h;
    n.textContent = h; sm.textContent = a.name && a.name !== h ? a.name : ""; li.append(n, sm); return li;
  }) : [Object.assign(document.createElement("li"), { className: "none", textContent: BY.size ? "No agent matches that" : "Agents are still loading" })]));
  listEl.hidden = false; searchEl.setAttribute("aria-expanded", "true");
  if (hits.length) searchEl.setAttribute("aria-activedescendant", `res${active}`); else searchEl.removeAttribute("aria-activedescendant");
}
function goTo(h) {
  const i = BY.get(h); if (i == null) return;
  skipTour("search"); closeList(); searchEl.value = h; if (innerWidth <= 700) searchEl.blur();
  flyTo(i); select(h);
}
searchEl.addEventListener("input", () => { active = 0; paintList(); });
searchEl.addEventListener("focus", () => searchEl.value.trim() && paintList());
searchEl.addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown" || e.key === "ArrowUp") { if (listEl.hidden) paintList(); if (!hits.length) return; e.preventDefault(); active = (active + (e.key === "ArrowDown" ? 1 : hits.length - 1)) % hits.length; paintList(); }
  else if (e.key === "Enter") { e.preventDefault(); if (listEl.hidden) paintList(); if (hits[active]) goTo(hits[active][2]); }
  else if (e.key === "Escape" && !listEl.hidden) { e.stopPropagation(); closeList(); }
});
listEl.addEventListener("pointerdown", (e) => { const li = e.target.closest("li[data-h]"); if (li) { e.preventDefault(); goTo(li.dataset.h); } }); // pointerdown, so the input's blur cannot eat the tap
document.addEventListener("pointerdown", (e) => { if (!e.target.closest(".finder")) closeList(); });

/* ---------- header ---------- */
const utc = (iso) => (iso && !isNaN(Date.parse(iso)) ? new Date(iso).toISOString().slice(0, 16).replace("T", " ") + " UTC" : null);
// cls: "calm" (snapshot), "relay" (live, green dot), "stale" (live paused, amber dot). Never red: a paused relay is not an error.
function setSrc(text, short, cls, title) {
  $("srcText").textContent = $("srcLine").textContent = text; $("srcShort").textContent = short; $("srcChip").className = "chip " + cls; $("srcChip").title = title || ""; layoutPhone();
}
function header(res) {
  const live = res.source === "relay" || res.source === "live", when = utc(res.fetched_at);
  setSrc(res.source === "relay" ? "live via relay" : res.source === "live" ? "live" : `snapshot from ${when || "an unknown time"}`, live ? "live" : "snapshot", live ? "relay" : "calm", res.fetched_at ? `fetched ${res.fetched_at}` : "");
  $("countChip").textContent = `${town.count} agents`; town.source = res.source; town.fetched_at = res.fetched_at;
}
function revealUI() {
  for (const id of ["tally", "countChip", "rcptChip", "crossChip", "legend", "soundBtn"]) $(id).hidden = false;
  if (window.AgentProofAnalysis) $("analysisBtn").hidden = false;
  tally(); layoutPhone();
}
// Phone: one header row (brand, source, lens, search); counts and buttons live in the dock above the legend.
const mqPhone = matchMedia("(max-width:700px)");
let dockH = 0, topH = 0;
function placeTools() { searchEl.placeholder = mqPhone.matches ? "Find agent" : "Find an agent by handle or name"; const t = $("tools"); if (mqPhone.matches) $("dock").insertBefore(t, $("legend")); else $("top").append(t); layoutPhone(); }
function layoutPhone() { dockH = $("dock").offsetHeight + 12; topH = $("top").offsetHeight + 8; document.documentElement.style.setProperty("--dock-h", dockH + "px"); } // --dock-h lets the first-visit hint sit above the dock
if (window.ResizeObserver) new ResizeObserver(() => layoutPhone()).observe($("dock")); // the dock grows as chips and notes arrive
mqPhone.addEventListener("change", placeTools); placeTools();

/* ---------- proof lens: Market view (delivered) <-> Proof view (counted receipts) ---------- */
let tShown = null, tRun = 0;
const deliveredTotal = () => { let n = 0; for (const i of BY.values()) if (S[i].kind !== "sink") n += S[i].agent.delivered_jobs || 0; return n; };
const provenTotal = () => RD.filter((x) => counted(x.rc)).length;
function tally(anim) {
  if (!connected) return;
  const mk = deliveredTotal(), pf = provenTotal(), to = lens === "proof" ? pf : mk, unit = lens === "proof" ? "proven" : "delivered (market's word)", el = $("tally");
  town.tally = { market: mk, proof: pf };
  const paint = (n, u) => { tShown = n; el.textContent = u ? `${n} ${u}` : String(n); }, run = ++tRun;
  if (!anim || REDUCED || tShown == null || tShown === to) return paint(to, unit);
  const from = tShown; // bare number while counting, so no half-way figure wears the wrong unit
  tween(T.lens, (k) => paint(Math.round(from + (to - from) * k)), () => run === tRun).then(() => run === tRun && paint(to, unit));
}
function retarget() {
  if (!bodies) return; const now = performance.now();
  for (const i of BY.values()) {
    const s = S[i]; if (s.kind === "sink" || s.dead) continue; const to = targetH(s.agent); if (to === s.to) continue;
    Object.assign(s, { from: s.cur, to, t0: now + (REDUCED ? 0 : (i % 9) * 30), dur: T.lens, kind: "lens" });
    if (REDUCED) { s.cur = to; writeSlot(i); } else ACTIVE.add(i);
  }
  dirty = true;
}
function setLens(l) {
  if ((l !== "market" && l !== "proof") || l === lens) return;
  lens = town.lens = l; document.documentElement.dataset.lens = l;
  for (const b of document.querySelectorAll(".lens button")) b.setAttribute("aria-pressed", String(b.dataset.lens === l));
  $("lgHeight").textContent = l === "proof" ? "height = proof-backed jobs" : "height = delivered jobs"; $("lgHeight").dataset.term = l === "proof" ? "proof-backed" : "delivered";
  retarget(); tally(true); nameLabels();
}
for (const b of document.querySelectorAll(".lens button")) b.addEventListener("click", () => setLens(b.dataset.lens));
// Proven buildings glow in the Proof view: a green ring and a faint beam, faded by lensK (0 market, 1 proof).
const GLOW = new Map(); let lensK = 0;
const beamMat = new THREE.MeshBasicMaterial({ color: T.green, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }), glowRingMat = new THREE.MeshBasicMaterial({ color: T.green, transparent: true, opacity: 0 });
const beamGeo = new THREE.CylinderGeometry(.55, .55, 4.4, 24, 1, true).translate(0, 2.2, 0), glowRingGeo = new THREE.TorusGeometry(.92, .07, 8, 44);
function syncGlow() {
  const want = new Set([...PROOF.keys()].filter((h) => BY.has(h)));
  for (const [h, g] of GLOW) if (!want.has(h)) { scene.remove(g); GLOW.delete(h); }
  for (const h of want) if (!GLOW.has(h)) {
    const g = new THREE.Group(), ring = new THREE.Mesh(glowRingGeo, glowRingMat); ring.rotation.x = Math.PI / 2; ring.position.y = .12;
    g.add(new THREE.Mesh(beamGeo, beamMat), ring); g.visible = false; scene.add(g); GLOW.set(h, g);
  }
  town.proven = [...GLOW.keys()];
}
// Teach highlights: rings on named buildings, cleared by the next step.
const HL = []; let pTimer = null;
function highlight(hs, color, keep) { if (!keep) clearHL(); for (const h of hs) { const m = new THREE.Mesh(new THREE.TorusGeometry(.75, .06, 8, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .9 })); m.rotation.x = Math.PI / 2; scene.add(m); HL.push({ h, m }); } }
function clearHL() { for (const o of HL) { scene.remove(o.m); o.m.geometry.dispose(); o.m.material.dispose(); } HL.length = 0; clearInterval(pTimer); }
function pulse(h) { const i = BY.get(h); if (i == null || REDUCED) return; S[i].pulse0 = performance.now(); ACTIVE.add(i); }

/* ---------- change ticker and sound ---------- */
let audio = null, soundOn = false;
function blip() {
  if (!soundOn || !audio) return; const t = audio.currentTime, o = audio.createOscillator(), g = audio.createGain();
  o.type = "sine"; o.frequency.value = 880; g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.05, t + .01); g.gain.exponentialRampToValueAtTime(.0001, t + .18);
  o.connect(g).connect(audio.destination); o.start(t); o.stop(t + .2);
}
$("soundBtn").addEventListener("click", () => {
  soundOn = !soundOn; if (soundOn && !audio) audio = new (window.AudioContext || window.webkitAudioContext)(); // created on the click, never before
  if (audio && audio.state === "suspended") audio.resume();
  $("soundBtn").textContent = soundOn ? "Sound on" : "Sound off"; $("soundBtn").setAttribute("aria-pressed", String(soundOn)); town.sound = soundOn; blip();
});
// Only differences the data really shows; an empty diff shows nothing.
function announce(d) {
  const lines = [...d.added.map((h) => `new agent: ${h}`), ...d.delivered.map((x) => `${x.handle} delivered ${x.from} -> ${x.to}`),
    ...d.availability.map((x) => (x.to ? `${x.handle} is now available` : `${x.handle} is no longer available`)), ...d.removed.map((h) => `${h} left the market`)];
  for (const x of [...d.delivered, ...d.availability]) pulse(x.handle);
  if (!lines.length) return;
  town.ticker = [...town.ticker, ...lines].slice(-5);
  $("ticker").replaceChildren(...town.ticker.map((t) => Object.assign(document.createElement("li"), { textContent: t }))); $("ticker").hidden = false; layoutPhone(); blip();
}

/* ---------- data: snapshot first, relay in the background, calm fallback ---------- */
let connected = false, curAgents = [], relayUrl = null, wasLive = false, goodAt = null, refreshing = false, fails = 0, refreshTimer = null, ownerLoaded = null;
// town.html?relay=... or <html data-relay> is the author's choice; otherwise this page pins what it found so the cards follow it.
const PINNED = Q.get("relay") !== null || !!document.documentElement.dataset.relay;
let pinMine = false;
function pinRelay(v) { if (PINNED) return; document.documentElement.dataset.relay = v; pinMine = true; town.relay = v === "off" ? null : v; }
async function probe(o) { if (pinMine) { delete document.documentElement.dataset.relay; pinMine = false; } return M.findRelay ? M.findRelay(o) : null; } // an "off" pin of ours would hide every candidate
function applyLive(res) {
  const first = !wasLive, d = M.diffAgents(curAgents, res.agents), pick = (l) => JSON.stringify(l.find((a) => a.handle === selH) || null), before = selH != null ? pick(curAgents) : null;
  update(res.agents); curAgents = res.agents; wasLive = true; goodAt = res.fetched_at; header(res); fails = 0;
  if (window.AgentProof && window.AgentProof.useMarket) window.AgentProof.useMarket(res);
  if (selH != null && !$("panel").hidden && pick(res.agents) !== before) select(selH, true); // the card read the old numbers
  if (!first) announce(d); // the jump from the snapshot is a different capture, not news
  searchRefresh(); tally(true); refreshAnalysis(); layoutPhone();
}
function paused(why) {
  if (!wasLive) return; // never was live: the snapshot label already says what this is
  const t = goodAt && utc(goodAt) ? utc(goodAt).slice(11) : "an unknown time";
  setSrc(`live paused, showing data from ${t}`, "paused", "stale", why); town.source = "stale";
}
const searchRefresh = () => { if (document.activeElement === searchEl && searchEl.value.trim()) paintList(); };
async function refresh() {
  if (refreshing) return; refreshing = true; let ok = false;
  try {
    if (!relayUrl) { relayUrl = await probe({ firstOnly: !wasLive && fails >= 1 && fails <= 3 }); pinRelay(relayUrl || "off"); if (!relayUrl) throw new Error("no relay answered"); }
    const res = await M.fetchRelayAgents(relayUrl), n = new Set(res.agents.map((a) => a.handle).filter(Boolean)).size;
    if (n === 0 || n < town.count * .5) throw new Error(`relay answered with ${n} agents, kept the ${town.count} already drawn`);
    applyLive(res); ok = true;
  } catch (e) { relayUrl = null; pinRelay("off"); paused(String((e && e.message) || e)); }
  finally { refreshing = false; schedule(ok); }
}
// After a miss the wait grows (live: 4 s, 12 s, 36 s, 60 s; never live: 5 s, 10 s, 20 s, then 30 s doubling up to 5 min, so a relay started after load is found fast).
// The fast never-live retries probe only the first relay port (each refused port is a console line); the other tiers probe all of them.
function schedule(ok) {
  clearTimeout(refreshTimer); if (ok) fails = 0; else fails++;
  const wait = ok ? T.refresh : wasLive ? Math.min(60000, 4000 * 3 ** (fails - 1)) : fails <= 3 ? 5000 * 2 ** (fails - 1) : Math.min(300000, 30000 * 2 ** (fails - 4));
  town.nextRefreshMs = wait; refreshTimer = setTimeout(() => (document.hidden ? schedule(true) : refresh()), wait);
}
async function boot() {
  const probing = probe(), agP = fetch("data/agents.json").then((r) => (r.ok ? r.json() : { agents: [] })).catch(() => ({ agents: [] }));
  let res = null;
  try { res = await M.fetchSnapshot(); } catch (e) {
    const relay = await probing; if (relay) { try { res = await M.fetchRelayAgents(relay); relayUrl = relay; } catch (e2) { res = null; } }
  }
  if (!res) { $("empty").hidden = false; $("note").className = ""; $("note").textContent = "The bundled snapshot did not load. Reload the page to try again."; return; }
  if (DEMO) await sleep(T.autoDelay);
  ownerList = (await agP).agents || [];
  makeMeshes(Math.ceil(res.agents.length * T.capHead) + 16);
  connected = true; fill(res.agents); curAgents = res.agents; header(res); frameAll(true);
  town.ready = true; town.firstPaintMs = Math.round(performance.now()); revealUI(); initTeach(); syncGlow();
  if (res.source === "relay") { wasLive = true; goodAt = res.fetched_at; }
  loadReceipts().then(autoTour);
  const relay = relayUrl || (await probing);
  if (relay) { relayUrl = relay; pinRelay(relay); refresh(); } else { pinRelay("off"); schedule(false); }
}

/* ---------- drop or paste a run file ---------- */
addEventListener("pagehide", () => { for (const u of EXTRA) URL.revokeObjectURL(u); });
async function takeRun(text, name) {
  let run; try { run = JSON.parse(text); } catch (e) { return toast(`${name} is not JSON, so there is nothing to check.`); }
  let got; try { got = await addRun(run, name); } catch (e) { return toast(`${name} looks like a run file but could not be checked: ${e.message || e}`); }
  if (!got) return toast(`${name} is not a market job record (it has no job_ref), so nothing was added.`);
  if (got.dup) return toast(`That receipt (${got.dup.id}) is already on the map.`);
  const rd = got.rd; EXTRA.push(URL.createObjectURL(new Blob([text], { type: "application/json" })));
  rd.reveal = 0; drawReceipt(rd); receiptsChanged();
  const e = RC.find((x) => x.src === rd), verdict = counted(rd.rc) ? "counts as proof" : rd.rc.self_hire ? "is a self-hire, so it earns 0" : !rd.rc.reproduced ? "did not reproduce its stored seal" : rd.rc.outcome !== "pass" ? `was judged ${rd.rc.outcome}` : "does not count (no two different owners)";
  if (!e) { rd.reveal = 1; return toast(`Checked ${name}: ${rd.rc.seller_handle || "its seller"} is not a building on this map, and the receipt ${verdict}.`); }
  skipTour("drop"); select(null); closeAnalysis(); rd.reveal = 0;
  const run2 = ++tourRun; await playOne(e, () => run2 === tourRun); if (run2 !== tourRun) return;
  rd.reveal = 1; tour.step = null; refreshSeals(); nameLabels();
  toast(`Checked ${name}: the receipt ${verdict}.`);
}
const hasFiles = (e) => e.dataTransfer && [...(e.dataTransfer.types || [])].includes("Files");
addEventListener("dragenter", (e) => { if (hasFiles(e)) { e.preventDefault(); document.body.classList.add("dropping"); } });
addEventListener("dragover", (e) => { if (hasFiles(e)) { e.preventDefault(); document.body.classList.add("dropping"); } });
addEventListener("dragleave", (e) => { if (!e.relatedTarget) document.body.classList.remove("dropping"); });
addEventListener("drop", async (e) => {
  document.body.classList.remove("dropping"); if (!e.dataTransfer) return; e.preventDefault();
  const files = [...(e.dataTransfer.files || [])];
  if (files.length) for (const f of files) await takeRun(await f.text(), f.name); else { const t = e.dataTransfer.getData("text"); if (t) await takeRun(t, "Dropped text"); }
});
addEventListener("paste", (e) => {
  if (e.target.closest && e.target.closest("input,textarea,[contenteditable]")) return;
  const t = e.clipboardData && e.clipboardData.getData("text"); if (t && t.trim().startsWith("{")) { e.preventDefault(); takeRun(t, "Pasted text"); }
});

/* ---------- data panel (slice 2's AgentProofAnalysis) ---------- */
const anEl = $("analysis");
const priceOf = (run) => { const v = Number(run && run.job_ref && run.job_ref.hire && run.job_ref.hire.amount); return Number.isFinite(v) ? v : undefined; };
function refreshAnalysis() {
  if (anEl.hidden || !window.AgentProofAnalysis) return;
  const stale = town.source === "stale";
  window.AgentProofAnalysis.render(anEl, {
    agents: curAgents, source: stale ? "relay" : town.source, fetched_at: stale ? goodAt : town.fetched_at,
    receipts: RD.map((r) => { const b = buyerOf(r.run); return { ...r.rc, file: r.file, buyer_handle: b ? b.handle : null, price_usdc: priceOf(r.run) }; }),
  });
}
function openAnalysis() { if (!window.AgentProofAnalysis) return; select(null); anEl.hidden = false; document.body.classList.add("analysis-open"); $("analysisBtn").setAttribute("aria-pressed", "true"); refreshAnalysis(); }
function closeAnalysis() { if (anEl.hidden) return; anEl.hidden = true; document.body.classList.remove("analysis-open"); $("analysisBtn").setAttribute("aria-pressed", "false"); }
$("analysisBtn").addEventListener("click", () => (anEl.hidden ? openAnalysis() : closeAnalysis()));
anEl.addEventListener("analysis:close", () => { anEl.hidden = true; document.body.classList.remove("analysis-open"); $("analysisBtn").setAttribute("aria-pressed", "false"); });

/* ---------- teach (slice 2's AgentProofTeach): the app owns the 3D for each step ---------- */
let teachUI = null, teachSaved = null, teachTok = 0; // every hook bumps teachTok: an async step that resumes after the user moved on must not touch the map
const d8 = (x) => (x == null ? "?" : String(x).slice(0, 8));
const hero = () => { const v = RC.find((x) => x.kind === "arc" && x.loop === "verified"); return { buyer: (v && v.buyer) || "ceoclaw-web", seller: (v && v.seller) || "ohwow-agent" }; };
function teachBegin() { teachTok++; skipTour("teach"); select(null); closeAnalysis(); if (!teachSaved) teachSaved = { lens }; setTag(null, ""); haloAt = null; clearHL(); unhide(); }
const focusOn = (hs, dur) => { const pts = hs.map((h) => BY.has(h) && S[BY.get(h)]).filter(Boolean); return pts.length ? frameOn(pts, REDUCED ? 1 : dur) : Promise.resolve(); };
const teachHooks = {
  step1() { teachBegin(); const { buyer, seller } = hero(); frameAll(false, REDUCED ? 1 : T.flyHome); highlight([buyer], T.blue); highlight([seller], T.green, true); let n = 0; const go = () => { pulse(buyer); pulse(seller); }; go(); pTimer = setInterval(() => (++n >= 3 ? clearInterval(pTimer) : go()), 900); },
  step2() { teachBegin(); setLens("market"); frameAll(false, REDUCED ? 1 : T.flyHome); const top = [...BY.values()].map((i) => S[i]).filter((s) => s.kind !== "sink").sort((p, q2) => (q2.agent.delivered_jobs || 0) - (p.agent.delivered_jobs || 0) || (p.handle < q2.handle ? -1 : 1)).slice(0, 5).map((s) => s.handle); highlight(top, T.blue); top.forEach(pulse); },
  async step3() {
    teachBegin(); const my = teachTok; await receiptsReady; if (my !== teachTok) return; const { seller } = hero(), rd = RD.find((x) => counted(x.rc) && x.rc.seller_handle === seller) || RD.find((x) => counted(x.rc));
    for (const r of RD) r.reveal = 1; refreshSeals(); nameLabels();
    await focusOn([seller], T.tourFly); if (my !== teachTok) return; highlight([seller], T.green);
    if (!rd) return { stored: null, recomputed: null, match: false };
    setTag(seller, "re-checking...", ""); const rc2 = await P.checkReceipt(rd.run, C); if (my !== teachTok) return;
    setTag(seller, rc2.reproduced ? `seal ${d8(rc2.recomputed_digest)} matches` : `seal ${d8(rc2.recomputed_digest)} does not match`, rc2.reproduced ? "ok" : "bad");
    return { stored: rc2.stored_digest, recomputed: rc2.recomputed_digest, match: !!rc2.reproduced };
  },
  async step4() {
    teachBegin(); setLens("proof"); for (const r of RD) r.reveal = 1; for (const x of RC) if (x.kind === "arc") x.hide = true; refreshSeals(); nameLabels();
    const my = teachTok, self = RC.find((x) => x.kind === "self"); if (!self) return; await focusOn([self.seller], T.tourFly); if (my !== teachTok) return; highlight([self.seller], T.pink);
    setTag(self.seller, "checker passed, but hiring yourself\nearns 0 reputation: same owner", "self");
  },
  done() { teachTok++; clearHL(); setTag(null, ""); haloAt = null; unhide(); const back = teachSaved; teachSaved = null; if (back) setLens(back.lens); frameAll(false, REDUCED ? 1 : T.flyHome); },
};
function initTeach() {
  const Tc = window.AgentProofTeach; if (!Tc) return;
  Tc.bindGlossary(); teachUI = Tc.mount({ hooks: teachHooks }); $("teachBtn").hidden = false;
  $("teachBtn").addEventListener("click", () => (teachUI.isOpen() ? teachUI.close() : teachUI.open(0)));
  Tc.hint({ onOpen: () => teachUI.open(0) });
}

window.__refresh = () => refresh(); // test hook: one refresh now
window.__town.cam = () => camera.position.toArray().map((v) => v.toFixed(3)).join(); // test hook: reduced motion must never move it
// test hook: live buildings whose cell lies outside their district pad, plus pad/label counts
window.__town.audit = () => { let out = 0, live = 0; for (const i of BY.values()) { const s = S[i]; if (s.kind === "sink" || s.ghost) continue; live++; const d = s.d; if (D.get(d.cat) !== d || s.x < d.x0 || s.x > d.x0 + d.size || s.z < d.z0 || s.z > d.z0 + d.size) out++; } return { live, out, pads: D.size, labels: [...LABELS].filter((L) => L.el.classList.contains("place")).length, rcLoops: RC.length }; };
Object.assign(window.__town, {
  setLens, select: (h) => select(h), goTo, find: (t) => findAgents(t).map((x) => x[2]),
  heights: (h) => (BY.has(h) ? { cur: S[BY.get(h)].cur, to: S[BY.get(h)].to } : null),
  feed: (agents) => applyLive({ source: "relay", fetched_at: new Date().toISOString(), agents }), // test hook: run the live path with agents of your choosing
  openAnalysis, closeAnalysis,
});
$("replayBtn").addEventListener("click", () => playTour());

/* ---------- loop ---------- */
function resize() { const w = innerWidth, h = innerHeight, v = camera.view; renderer.setSize(w, h, false); camera.aspect = w / h; camera.fov = w < 600 ? 52 : 38;
  if (v && v.enabled) camera.setViewOffset(w, h, v.offsetX, v.offsetY, w, h); else camera.updateProjectionMatrix(); }
addEventListener("resize", () => { resize(); layoutPhone(); }); resize();
let last = performance.now(), frames = 0, fpsAt = last;
const easeIO = (t) => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
// With the card open, shift the picture so the town centres in the space the panel leaves.
const panelEl = $("panel"); let vx = 0, vy = 0;
function viewOffset(dt) {
  const open = !panelEl.hidden, wide = innerWidth > 700, tx = sideW() / 2, ty = open && !wide ? innerHeight * .26 : !wide ? (dockH - topH) / 2 : 0; // phone: centre the town between header and dock
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
  const dt = now - last; viewOffset(dt); last = now;
  if (!REDUCED) { if (bodyShader) bodyShader.uniforms.uTime.value = now / 1000; lampMat.emissiveIntensity = 1.7 + .35 * Math.sin(now / 1000 * T.breathe); } // ambient: every lit window breathes from one uniform
  if (bodies) {
    tick(now); hover();
    for (const r of RC) { const si = BY.get(r.seller); if (si == null) continue;
      if (r.kind === "self") { const s = S[si], shown = Math.round(r.src.reveal * 18); r.g.position.set(s.x, s.cur + .35, s.z); if (!REDUCED) r.g.rotation.y = now / 4000; r.g.children.forEach((c, k) => (c.visible = k < shown)); } else arcOf(r); }
    for (const [h, o] of SEALS) { const i = BY.get(h); if (i == null) continue; const s = S[i], k = REDUCED ? 1 : back(Math.min(1, (now - o.t0) / 520)); o.g.position.set(s.x, s.cur + .62, s.z); o.g.scale.setScalar(Math.max(k, .001)); if (!REDUCED) o.g.rotation.y = now / 1400; }
    lensK += ((lens === "proof" ? 1 : 0) - lensK) * (REDUCED ? 1 : Math.min(1, dt / 220));
    beamMat.opacity = .2 * lensK * (REDUCED ? 1 : .85 + .15 * Math.sin(now / 420)); glowRingMat.opacity = .95 * lensK;
    const gk = Math.min(5, Math.max(1, camera.position.distanceTo(controls.target) / 16)); // the glow stays findable from the overview
    for (const [h, g] of GLOW) { const i = BY.get(h); g.visible = lensK > .01 && i != null; if (g.visible) { g.position.set(S[i].x, 0, S[i].z); g.scale.setScalar(gk); } }
    for (const o of HL) { const i = BY.get(o.h); o.m.visible = i != null; if (i != null) { o.m.position.set(S[i].x, .12, S[i].z); o.m.scale.setScalar(gk * (REDUCED ? 1 : 1 + .12 * Math.sin(now / 240))); } }
    const hp = haloAt && haloAt(); halo.visible = !!hp; if (hp) { halo.position.set(hp.x, .1, hp.z); halo.scale.setScalar(REDUCED ? 1.1 : 1.05 + .12 * Math.sin(now / 220)); }
    spark.visible = !!(sparkE && sparkE.curve); if (spark.visible) spark.position.copy(sparkE.curve.getPoint(sparkE.src.reveal));
    if (selH != null && BY.has(selH)) { const s = S[BY.get(selH)]; marker.position.set(s.x, 0, s.z); const pin = marker.getObjectByName("pin"); pin.position.y = s.cur + (SEALS.has(selH) ? 1.45 : .9) + Math.sin(now / 300) * .08; }
  }
  controls.update(); renderer.render(scene, camera); placeLabels(); requestAnimationFrame(frame);
}
// Steps the same work as the rAF loop, for headless tests that never get a paint.
window.__forceFrame = () => { tick(nowT()); controls.update(); renderer.render(scene, camera); placeLabels(); };
requestAnimationFrame(frame);
boot();
