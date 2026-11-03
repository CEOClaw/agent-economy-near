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
  pink: 0xcf4870, green: 0x169c5f, red: 0xd6423a, lamp_on: 0xffc94d,
};
const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
const hex = (c) => new THREE.Color(c);
const uncat = (c) => c || "uncategorized";
const height = (jobs) => (jobs > 0 ? T.hBase + T.hSpan * Math.min(T.hMax, Math.log1p(jobs) / Math.log1p(T.hRef)) : T.plinth);
const isOn = (a) => a.available_now === true || a.availability === "available" || a.availability === "available_now";
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
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
$("stage").appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 600); camera.position.set(0, 14, 18);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.maxPolarAngle = 1.3; controls.minDistance = 3; controls.maxDistance = 220;
scene.add(new THREE.HemisphereLight(0xeaf3ff, 0xb59a74, 1.25));
const sun = new THREE.DirectionalLight(0xfff4e0, 2.3); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0005; sun.shadow.radius = 5; scene.add(sun, sun.target);

const bumpTex = (() => { const c = document.createElement("canvas"); c.width = c.height = 256; const x = c.getContext("2d"); x.fillStyle = "#808080"; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) { const g = 110 + Math.random() * 40 | 0; x.fillStyle = `rgba(${g},${g},${g},.35)`; x.beginPath(); x.arc(Math.random() * 256, Math.random() * 256, Math.random() * 3 + .5, 0, 7); x.fill(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; })();
const clay = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: .9, metalness: 0, bumpMap: bumpTex, bumpScale: .5, ...o });

/* ---------- ground: a soft grid fading into the sky, nothing else ---------- */
(() => {
  const g = document.createElement("canvas"); g.width = g.height = 128; const x = g.getContext("2d");
  x.fillStyle = T.ground; x.fillRect(0, 0, 128, 128); x.strokeStyle = "rgba(60,70,80,.11)"; x.lineWidth = 2; x.strokeRect(0, 0, 128, 128);
  const grid = new THREE.CanvasTexture(g); grid.wrapS = grid.wrapT = THREE.RepeatWrapping; grid.repeat.set(120, 120); grid.anisotropy = 8; grid.colorSpace = THREE.SRGBColorSpace;
  const f = document.createElement("canvas"); f.width = f.height = 256; const y = f.getContext("2d");
  const rg = y.createRadialGradient(128, 128, 20, 128, 128, 128); rg.addColorStop(0, "#fff"); rg.addColorStop(.55, "#fff"); rg.addColorStop(1, "#000"); y.fillStyle = rg; y.fillRect(0, 0, 256, 256);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), new THREE.MeshStandardMaterial({ map: grid, alphaMap: new THREE.CanvasTexture(f), transparent: true, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
})();

/* ---------- labels (DOM, projected each frame) ---------- */
const labelsEl = $("labels"); const LABELS = [];
function label(cls, text, style, at) { const el = document.createElement("div"); el.className = cls; el.textContent = text; if (style) el.style.cssText = style; labelsEl.appendChild(el); const L = { el, at, size: null }; LABELS.push(L); return L; }
const dropLabel = (L) => { const k = LABELS.indexOf(L); if (k >= 0) LABELS.splice(k, 1); L.el.remove(); };
const tmpV = new THREE.Vector3();
function placeLabels() {
  const w = innerWidth, h = innerHeight;
  for (const L of LABELS) {
    if (!L.size) L.size = [L.el.offsetWidth, L.el.offsetHeight];
    L.at(tmpV); tmpV.project(camera);
    const vis = tmpV.z < 1 && Math.abs(tmpV.x) < 1.2 && Math.abs(tmpV.y) < 1.2;
    L.el.style.display = vis ? "" : "none";
    if (vis) L.el.style.transform = `translate3d(${Math.round((tmpV.x * .5 + .5) * w - L.size[0] / 2)}px,${Math.round((-tmpV.y * .5 + .5) * h - L.size[1] / 2)}px,0)`;
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

function makeMeshes(n) {
  const old = bodies && { b: bodies, l: lamps };
  bodies = new THREE.InstancedMesh(bodyGeo, bodyMat, n); lamps = new THREE.InstancedMesh(lampGeo, lampMat, n);
  for (const m of [bodies, lamps]) { m.frustumCulled = false; m.count = hw; m.castShadow = m.receiveShadow = true; m.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4); scene.add(m); }
  lamps.castShadow = false;
  cap = n; town.capacity = n;
  if (old) { scene.remove(old.b, old.l); old.b.dispose(); old.l.dispose(); for (let i = 0; i < hw; i++) { writeSlot(i); bodies.setColorAt(i, col.set(S[i].color)); } bodies.instanceColor.needsUpdate = true; }
}
function writeSlot(i) {
  const s = S[i]; if (!s) return;
  const grow = s.pulse0 != null ? 1 + .45 * Math.sin(Math.min(1, (performance.now() - s.pulse0) / T.pulse) * Math.PI) : 1;
  const h = Math.max(s.cur, 0), w = s.dead ? 0 : T.body * grow;
  bodies.setMatrixAt(i, dummy.compose(pv.set(s.x, 0, s.z), q, sv.set(w, h, w)));
  const on = !s.dead && s.on && h > T.plinth * .5;
  lamps.setMatrixAt(i, dummy.compose(pv.set(s.x, h, s.z), q, sv.set(on ? 1 : 0, on ? 1 : 0, on ? 1 : 0)));
}
let dirty = false;

/* ---------- districts ---------- */
const D = new Map();       // category -> { cat, x0, z0, s, n, used:Set, pad, label }
let extentMaxZ = 0, extentMinX = 0, extentMaxX = 0, extentMinZ = 0;
const padGeo = new THREE.BoxGeometry(1, .06, 1).translate(0, .03, 0), padMat = clay(T.pad);
const dimOf = (n) => Math.ceil(Math.sqrt(n + Math.max(3, T.headroom * n)));
const cellPos = (d, k) => [d.x0 + (k % d.s + .5) * T.pitch, d.z0 + (Math.floor(k / d.s) + .5) * T.pitch];
function addDistrict(cat, n, x0, z0) {
  const s = dimOf(n), size = s * T.pitch;
  const pad = new THREE.Mesh(padGeo, padMat); pad.scale.set(size + .3, REDUCED ? 1 : 0, size + .3); pad.position.set(x0 + size / 2, 0, z0 + size / 2); pad.receiveShadow = true; scene.add(pad);
  const d = { cat, x0, z0, s, size, n: 0, used: new Set(), pad, padT0: performance.now() };
  d.label = label("place", `${cat} \u00b7 0`, "", (v) => v.set(d.x0 + d.size / 2, 0.05, d.z0 + d.size + .7)); // reads d so a re-layout moves it
  D.set(cat, d); return d;
}
function dropDistrict(d) { scene.remove(d.pad); dropLabel(d.label); D.delete(d.cat); delete town.districts[d.cat]; }
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
function ownerColor(handle) { const o = ownerList.find((a) => (a.executor_ids || []).includes(handle)); return o ? o.color : T.neutral; }

function addBuilding(a, d, delay) {
  const i = FREE.length ? FREE.pop() : hw++;
  const k = cellOf(d), [x, z] = cellPos(d, k);
  const to = height(a.delivered_jobs), now = performance.now();
  S[i] = { handle: a.handle, agent: a, x, z, k, color: ownerColor(a.handle), on: isOn(a), cur: REDUCED ? to : 0, from: 0, to, t0: now + delay, dur: T.rise, kind: "rise", pulse0: null, dead: false, d };
  BY.set(a.handle, i); d.n++; bodies.count = lamps.count = hw;
  col.set(S[i].color); bodies.setColorAt(i, col); bodies.instanceColor.needsUpdate = true;
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
  frameShadow(); syncTown();
}

function update(agents) {
  const seen = new Set(), now = performance.now(), fresh = [];
  for (const a of agents) { if (!a.handle || seen.has(a.handle)) continue; seen.add(a.handle); if (!BY.has(a.handle)) fresh.push(a); }
  // Leavers sink first so they stop counting as district occupants below.
  for (const [h, i] of [...BY]) if (!seen.has(h) && S[i].kind !== "sink") { Object.assign(S[i], { from: S[i].cur, to: 0, t0: now, dur: T.sink, kind: "sink" }); ACTIVE.add(i); if (REDUCED) retire(i); }
  for (const a of agents) {
    const i = a.handle ? BY.get(a.handle) : null; if (i == null) continue;
    const s = S[i]; if (s.kind === "sink") continue;
    const to = height(a.delivered_jobs); s.agent = a; s.on = isOn(a);
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
  dirty = true; syncTown();
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
function arcOf(e) {
  const as = BY.get(e.seller), bs = e.buyer != null ? BY.get(e.buyer) : null; if (as == null) return;
  const a = S[as], b = bs != null ? S[bs] : null, sig = [a.x, a.z, a.cur.toFixed(2), b && b.x, b && b.z, b && b.cur.toFixed(2)].join();
  if (sig === e.sig) return; e.sig = sig;
  if (e.mesh) { scene.remove(e.mesh); e.mesh.geometry.dispose(); }
  if (b) { const mid = new THREE.Vector3((a.x + b.x) / 2, Math.max(a.cur, b.cur) + 2 + Math.hypot(a.x - b.x, a.z - b.z) * .3, (a.z + b.z) / 2);
    e.mesh = new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(new THREE.Vector3(b.x, b.cur + .3, b.z), mid, new THREE.Vector3(a.x, a.cur + .3, a.z)), 40, .06, 6), e.mat);
  } else { e.mesh = new THREE.Mesh(new THREE.CylinderGeometry(.07, .07, 6, 8), e.mat); e.mesh.position.set(a.x, a.cur + 3, a.z); }
  scene.add(e.mesh);
}
function drawReceipt(r) {
  const { rc, run } = r, sellerSlot = BY.get(rc.seller_handle); if (sellerSlot == null) return;
  const def = ownerList.find((a) => a.id === (run.requester && run.requester.agent));
  const buyerHandle = def && (def.executor_ids || [])[0], buyerSlot = buyerHandle != null ? BY.get(buyerHandle) : null;
  if (rc.self_hire) {
    const g = new THREE.Group(), m = new THREE.MeshStandardMaterial({ color: T.pink, roughness: .6, emissive: T.pink, emissiveIntensity: .25 });
    for (let k = 0; k < 18; k++) { const a = k / 18 * Math.PI * 2, b = new THREE.Mesh(new THREE.BoxGeometry(.2, .06, .09), m); b.position.set(Math.cos(a) * .85, 0, Math.sin(a) * .85); b.rotation.y = -a; g.add(b); }
    scene.add(g);
    const L = label("chiplab", "self-hire, 0 points", `background:#cf4870`, (v) => { const s = S[BY.get(rc.seller_handle)]; if (s) v.set(s.x, s.cur + 1.2, s.z); });
    RC.push({ kind: "self", seller: rc.seller_handle, g, L, loop: "self_hire", src: r }); r.drawn = true;
    town.loops.push({ handle: rc.seller_handle, kind: "self_hire", label: "self-hire, 0 points" });
    return;
  }
  const ok = rc.reproduced && rc.outcome === "pass", cross = rc.buyer_owner && rc.seller_owner && rc.buyer_owner !== rc.seller_owner;
  const color = ok && cross ? T.green : (!ok ? T.red : null); if (color == null) return;
  const mat = new THREE.MeshStandardMaterial({ color, roughness: .6, emissive: color, emissiveIntensity: .25 }), loop = ok && cross ? "verified" : "failed";
  const e = { kind: "arc", seller: rc.seller_handle, buyer: buyerSlot != null ? buyerHandle : null, mat, mesh: null, sig: "", loop, src: r };
  RC.push(e); r.drawn = true; arcOf(e);
  town.loops.push({ handle: rc.seller_handle, kind: loop });
}
const drawPending = () => { for (const r of RD) if (!r.drawn) drawReceipt(r); };
function removeReceipts(h) {
  for (const e of [...RC]) {
    if (e.seller !== h && e.buyer !== h) continue;
    RC.splice(RC.indexOf(e), 1); e.src.drawn = false;
    if (e.g) scene.remove(e.g); if (e.mesh) { scene.remove(e.mesh); e.mesh.geometry.dispose(); } if (e.L) dropLabel(e.L);
    const k = town.loops.findIndex((l) => l.handle === e.seller && l.kind === e.loop); if (k >= 0) town.loops.splice(k, 1);
  }
  drawPending(); // a buyer that left leaves a beam from the seller, a seller that left leaves nothing
}
async function loadReceipts() {
  const j = (u) => fetch(u).then((r) => { if (!r.ok) throw new Error(`${u}: HTTP ${r.status}`); return r.json(); });
  try {
    const man = await j("data/manifest.json"); let n = 0;
    for (const r of man.runs || []) {
      const run = await j(`data/${r.file}`);
      const rc = await P.checkReceipt(run, C); if (!rc) continue;
      n++; town.receipts = n; $("rcptChip").textContent = `receipts checked: ${n}`;
      const rd = { rc, run, drawn: false }; RD.push(rd); drawReceipt(rd);
    }
  } catch (e) { console.warn("receipts not loaded", e); }
  town.receiptsDone = true;
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
  const p = $("panel");
  if (selH == null) { p.hidden = true; $("panelBody").replaceChildren(); return; }
  const el = document.createElement("agentproof-portfolio"); el.setAttribute("agent", handle);
  $("panelBody").replaceChildren(el); $("panelLink").href = `portfolio.html#${encodeURIComponent(handle)}`; p.hidden = false;
}
function flyTo(i) {
  const s = S[i], to = new THREE.Vector3(s.x, s.cur / 2, s.z), dir = camera.position.clone().sub(controls.target).setLength(10);
  fly = { t0: performance.now(), from: controls.target.clone(), fromP: camera.position.clone(), to, toP: to.clone().add(dir) };
  if (REDUCED) { controls.target.copy(to); camera.position.copy(fly.toP); fly = null; }
}
let fly = null;
function frameAll(instant) {
  const R = Math.hypot(extentMaxX - extentMinX, extentMaxZ - extentMinZ) / 2, v = camera.fov * Math.PI / 360, hf = Math.atan(Math.tan(v) * camera.aspect);
  const dist = Math.min(200, R / Math.tan(Math.min(v, hf)) * .7 + 4), tilt = 55 * Math.PI / 180;
  const to = new THREE.Vector3((extentMinX + extentMaxX) / 2, 0, (extentMinZ + extentMaxZ) / 2);
  fly = { t0: performance.now(), from: controls.target.clone(), fromP: camera.position.clone(), to, toP: to.clone().add(new THREE.Vector3(0, Math.sin(tilt) * dist, Math.cos(tilt) * dist)) };
  if (instant || REDUCED) { controls.target.copy(to); camera.position.copy(fly.toP); fly = null; }
}
function frameShadow() {
  const r = Math.max(extentMaxX - extentMinX, extentMaxZ - extentMinZ) / 2 + 6, cx = (extentMinX + extentMaxX) / 2, cz = (extentMinZ + extentMaxZ) / 2;
  sun.position.set(cx - r * .5, r * 1.1, cz + r * .6); sun.target.position.set(cx, 0, cz);
  Object.assign(sun.shadow.camera, { left: -r * 1.3, right: r * 1.3, top: r * 1.3, bottom: -r * 1.3, near: 1, far: r * 4 }); sun.shadow.camera.updateProjectionMatrix();
}

let down = null;
renderer.domElement.addEventListener("pointerdown", (e) => (down = [e.clientX, e.clientY]));
renderer.domElement.addEventListener("pointerup", (e) => {
  if (!down || !bodies || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return; down = null;
  const i = pick(e); if (i != null) select(S[i].handle);
});
let hoverEv = null;
renderer.domElement.addEventListener("pointermove", (e) => { if (e.pointerType === "mouse" && e.buttons === 0) hoverEv = e; else { hoverEv = null; tip.hidden = true; } });
renderer.domElement.addEventListener("pointerleave", () => { hoverEv = null; tip.hidden = true; });
function hover() {
  if (!hoverEv || !bodies) return; const e = hoverEv; hoverEv = null;
  const i = pick(e); if (i == null) { tip.hidden = true; renderer.domElement.style.cursor = ""; return; }
  const a = S[i].agent; tip.hidden = false; renderer.domElement.style.cursor = "pointer";
  tip.replaceChildren(); const b = document.createElement("b"); b.textContent = a.name || a.handle; const sp = document.createElement("span");
  sp.textContent = `${uncat(a.category)}\ndelivered ${a.delivered_jobs ?? "n/a"} · success ${a.success_rate != null ? a.success_rate + "%" : "n/a"}`; sp.style.whiteSpace = "pre-line"; tip.append(b, sp);
  tip.style.left = Math.min(innerWidth - 250, e.clientX + 14) + "px"; tip.style.top = Math.min(innerHeight - 90, e.clientY + 14) + "px";
}
$("panelClose").addEventListener("click", () => select(null));
addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("panel").hidden) select(null); });
$("search").addEventListener("change", () => {
  const v = $("search").value.trim().toLowerCase(); if (!v) return;
  const i = BY.get($("search").value.trim()) ?? [...BY].find(([h, k]) => h.toLowerCase() === v || (S[k].agent.name || "").toLowerCase() === v)?.[1];
  if (i == null) return; flyTo(i); selH = S[i].handle; marker.visible = true;
});

/* ---------- header ---------- */
function header(res) {
  const when = res.fetched_at && !isNaN(Date.parse(res.fetched_at)) ? new Date(res.fetched_at).toISOString().slice(0, 16).replace("T", " ") + " UTC" : null;
  $("srcText").textContent = res.source === "relay" ? "live via relay" : res.source === "live" ? "live" : `snapshot from ${when || "an unknown time"}`;
  $("srcChip").classList.toggle("relay", res.source === "relay"); $("srcChip").classList.remove("stale"); $("srcChip").title = res.fetched_at ? `fetched ${res.fetched_at}` : "";
  $("countChip").hidden = $("rcptChip").hidden = $("search").hidden = false;
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
    loadReceipts();
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
window.__town.audit = () => { let out = 0, live = 0; for (const i of BY.values()) { const s = S[i]; if (s.kind === "sink" || s.ghost) continue; live++; const d = s.d; if (D.get(d.cat) !== d || s.x < d.x0 || s.x > d.x0 + d.size || s.z < d.z0 || s.z > d.z0 + d.size) out++; } return { live, out, pads: D.size, labels: [...LABELS].filter((L) => L.el.classList.contains("place")).length, rcLoops: RC.length }; };
$("connect").addEventListener("click", () => connect(false));
{ const relay = M.resolveRelay();
  // A dead relay is remembered for this page so Connect and the portfolio card do not each log a refused request.
  if (relay) M.probeRelay(relay).then((up) => { if (!up) document.documentElement.dataset.relay = "off"; if (up && !connected) { $("note").textContent = "connecting via relay"; $("connect").disabled = true; setTimeout(() => !connected && connect(true), T.autoDelay); } }); }

/* ---------- loop ---------- */
function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.fov = w < 600 ? 52 : 38; camera.updateProjectionMatrix(); }
addEventListener("resize", resize); resize();
let last = performance.now(), frames = 0, fpsAt = last;
const nowT = () => performance.now();
function frame() {
  const now = nowT(); frames++;
  if (now - fpsAt >= 1000) { town.fps = Math.round(frames * 1000 / (now - fpsAt)); frames = 0; fpsAt = now; }
  if (fly) { const t = Math.min(1, (now - fly.t0) / T.fly), k = ease(t); controls.target.lerpVectors(fly.from, fly.to, k); camera.position.lerpVectors(fly.fromP, fly.toP, k); if (t >= 1) fly = null; }
  if (bodies) {
    tick(now); hover();
    for (const r of RC) { const si = BY.get(r.seller); if (si == null) continue; if (r.kind === "self") { const s = S[si]; r.g.position.set(s.x, s.cur + .35, s.z); r.g.rotation.y = now / 4000; } else arcOf(r); }
    if (selH != null && BY.has(selH)) { const s = S[BY.get(selH)]; marker.position.set(s.x, 0, s.z); const pin = marker.getObjectByName("pin"); pin.position.y = s.cur + .9 + Math.sin(now / 300) * .08; }
  }
  controls.update(); renderer.render(scene, camera); placeLabels(); requestAnimationFrame(frame);
}
// Steps the same work as the rAF loop, for headless tests that never get a paint.
window.__forceFrame = () => { tick(nowT()); controls.update(); renderer.render(scene, camera); placeLabels(); };
requestAnimationFrame(frame);
