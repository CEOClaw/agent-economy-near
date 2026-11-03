import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const CHK = window.AgentProofChecker;
const DATA = new URL("../data/", import.meta.url);
const getJSON = async (p) => { const r = await fetch(new URL(p, DATA)); if (!r.ok) throw new Error(`${p}: HTTP ${r.status}`); return r.json(); };
const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const short = (h) => h ? h.slice(0, 8) + "…" + h.slice(-4) : "none";
const fmtT = (t) => { if (!t) return ""; const d = new Date(t); return isNaN(d) ? t : d.toISOString().replace("T", " ").replace(/\.\d+Z$/, "").replace("Z", "") + " UTC"; };
const secs = (a, b) => Math.round((new Date(b) - new Date(a)) / 100) / 10;

/* ---------- stations: the generic pipeline every proof passes through ---------- */
const ICON = {
  request: '<path d="M4 3h8v10H4z M6 6h4 M6 9h4"/>', policy: '<path d="M8 2l5 2v4c0 3-2.2 5-5 6-2.8-1-5-3-5-6V4z"/>',
  work: '<circle cx="8" cy="8" r="3"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.4 1.4M11.6 11.6L13 13M3 13l1.4-1.4M11.6 4.4L13 3"/>',
  verify: '<path d="M3 8.5l3 3L13 4.5"/>', settle: '<rect x="2" y="5" width="5" height="5" rx="1"/><rect x="9" y="5" width="5" height="5" rx="1"/><path d="M7 7.5h2"/>',
  rep: '<path d="M8 2l1.8 3.8 4.2.5-3.1 2.9.8 4.1L8 11.3 4.3 13.3l.8-4.1L2 6.3l4.2-.5z"/>',
};
const ST = {
  request: { name: "Request", c: "#3b78de", hint: "Someone posts a job with a budget." },
  policy: { name: "Policy", c: "#de6a2a", hint: "Spend limits are checked before anything runs." },
  work: { name: "AI work", c: "#7458f0", hint: "An AI agent does the task." },
  verify: { name: "Verify", c: "#c98a06", hint: "A neutral checker tests the result and seals it." },
  settle: { name: "Settle", c: "#0f9b82", hint: "Money moves only after the proof, on-chain or in escrow." },
  rep: { name: "Reputation", c: "#cf4870", hint: "Only checked work counts toward an agent's record." },
};
const stChip = (k, label) => `<span class="st" style="background:${ST[k].c}"><svg viewBox="0 0 16 16">${ICON[k]}</svg>${esc(label || ST[k].name)}</span>`;

/* ---------- world layout ---------- */
const PL = {
  board: [0, -6.6], boardFront: [1.0, -5.0], policy: [-4.8, -3.2], guard: [-3.4, -2.0], policyIn: [-4.0, -1.8],
  workshop: [-7.4, 1.6], workshopFront: [-5.6, 1.8], checker: [0, 0], checkerFront: [0, 1.6], seal: [-2.9, 3.0],
  vault: [4.6, -4.4], vaultFront: [3.6, -3.0], fee: [3.0, -5.9], tower: [7.0, -5.2], shop: [7.4, 0.8], shopFront: [5.6, 1.2],
  scoreboard: [-8.0, -4.6], scoreFront: [-6.9, -3.0], gateIn: [-5.0, 6.0], requesterSpot: [-1.0, -4.6], center: [0, 0],
};
const SPAWN = [[-2.6, 6.6], [2.0, 7.2], [-8.4, -1.6], [8.6, -2.0], [0.6, 8.4], [-1.8, -8.4]];
const AGENTS = (await getJSON("agents.json")).agents;
const AG = {}, EXEC = {}; AGENTS.forEach((a) => { AG[a.id] = a; (a.executor_ids || []).forEach((x) => (EXEC[x] = a.id)); });
const pos = (k) => Array.isArray(k) ? k : PL[k] || (AG[k] && PL[AG[k].home]);

/* ---------- renderer ---------- */
const stage = $("stage");
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setClearColor(0x000000, 0);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
stage.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200); camera.position.set(0, 14, 18);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.maxPolarAngle = 1.3; controls.minDistance = 6; controls.maxDistance = 40; controls.enablePan = false;
let userAt = -1e9; controls.addEventListener("start", () => (userAt = performance.now()));
scene.add(new THREE.HemisphereLight(0xeaf3ff, 0xb59a74, 1.25));
const sun = new THREE.DirectionalLight(0xfff4e0, 2.3); sun.position.set(-8, 18, 10); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 2, far: 50 }); sun.shadow.bias = -0.0005; sun.shadow.radius = 5;
scene.add(sun);

const bumpTex = (() => { const c = document.createElement("canvas"); c.width = c.height = 256; const x = c.getContext("2d"); x.fillStyle = "#808080"; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) { const g = 110 + Math.random() * 40 | 0; x.fillStyle = `rgba(${g},${g},${g},.35)`; x.beginPath(); x.arc(Math.random() * 256, Math.random() * 256, Math.random() * 3 + .5, 0, 7); x.fill(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; })();
const clay = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: .9, metalness: 0, bumpMap: bumpTex, bumpScale: .5, ...o });
function mesh(geo, mat, x = 0, y = 0, z = 0, parent = scene) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; parent.add(m); return m; }

/* ---------- labels ---------- */
const labelsEl = $("labels"); const LABELS = [];
function label(obj, cls, html, dy = 0, style = "") { const el = document.createElement("div"); el.className = cls; el.innerHTML = html; if (style) el.style.cssText = style; labelsEl.appendChild(el); const L = { obj, el, dy, show: true }; LABELS.push(L); return L; }
const tmpV = new THREE.Vector3();
function placeLabels() { const w = innerWidth, h = innerHeight;
  for (const L of LABELS) { if (!L.show || !L.obj.visible) { L.el.style.display = "none"; continue; } L.obj.getWorldPosition(tmpV); tmpV.y += L.dy; tmpV.project(camera); if (tmpV.z > 1) { L.el.style.display = "none"; continue; } L.el.style.display = ""; L.el.style.left = ((tmpV.x + 1) / 2 * w) + "px"; L.el.style.top = ((1 - tmpV.y) / 2 * h) + "px"; } }
const anchorAt = (k, dy) => { const o = new THREE.Object3D(); o.position.set(pos(k)[0], dy, pos(k)[1]); scene.add(o); return o; };
const STLAB = {};
const stationLabel = (key, at, dy) => (STLAB[key] = label(anchorAt(at, dy), "place", ST[key].name, 0, `background:${ST[key].c}`));

/* ---------- ground ---------- */
mesh(new THREE.CylinderGeometry(11, 11.4, 1.2, 72), clay("#e9dcc3"), 0, -.6, 0);
mesh(new THREE.CylinderGeometry(11.45, 10.6, 1.4, 72), clay("#b9a07c"), 0, -1.8, 0);
const grass = clay("#a9c77f"); [[-8.6, 4.6, 2.2], [8.4, 3.6, 1.8], [-2.4, -8.8, 1.8], [-8.8, -4.2, 1.6]].forEach(([x, z, r]) => { const m = mesh(new THREE.CylinderGeometry(r, r, .06, 32), grass, x, .02, z); m.castShadow = false; });
const pathMat = clay("#dbc9a7");
[["checker", "board"], ["checker", "policy"], ["checker", "vault"], ["checker", "shop"], ["checker", "workshop"], ["checker", "scoreboard"], ["checker", "gateIn"]].forEach(([a, b]) => {
  const A = pos(a), B = pos(b), dx = B[0] - A[0], dz = B[1] - A[1], L = Math.hypot(dx, dz); const m = mesh(new THREE.BoxGeometry(1.1, .04, L), pathMat, (A[0] + B[0]) / 2, .01, (A[1] + B[1]) / 2); m.rotation.y = Math.atan2(dx, dz); m.castShadow = false; });
function tree(x, z, s) { mesh(new THREE.CylinderGeometry(.08 * s, .12 * s, .6 * s, 8), clay("#8a6a4a"), x, .3 * s, z); mesh(new THREE.SphereGeometry(.45 * s, 14, 10), clay(Math.random() > .5 ? "#86b25c" : "#9cc46c"), x, .85 * s, z); }
[[-9.4, 3.2], [-9.6, -6.6], [-3.6, -9.6], [3.2, -9.6], [9.8, 3.4], [-1.4, 9.8], [6.4, 8.2], [-9.9, -.6], [9.4, -6.6], [-7.6, 7.4]].forEach(([x, z], i) => tree(x, z, .8 + (i % 3) * .25));

/* request board */
{ const [x, z] = PL.board, wood = clay("#9a7152");
  mesh(new THREE.BoxGeometry(.16, 2.2, .16), wood, x - 1.1, 1.1, z); mesh(new THREE.BoxGeometry(.16, 2.2, .16), wood, x + 1.1, 1.1, z);
  mesh(new THREE.BoxGeometry(2.5, 1.3, .14), clay("#c99f74"), x, 1.5, z); mesh(new THREE.BoxGeometry(2.7, .16, .3), clay(ST.request.c), x, 2.25, z);
  stationLabel("request", "board", 2.7); }
const scroll = mesh(new THREE.BoxGeometry(.9, .62, .04), clay("#fffaf0"), PL.board[0], 1.5, PL.board[1] + .1); scroll.visible = false;
const scrollLab = label(scroll, "chiplab", "", .5, `background:${ST.request.c}`);
/* policy gate */
const gate = {};
{ const [x, z] = PL.policy, stone = clay("#cfc6b8");
  mesh(new THREE.BoxGeometry(.4, 1.8, .4), stone, x - 1, .9, z); mesh(new THREE.BoxGeometry(.4, 1.8, .4), stone, x + 1, .9, z);
  gate.bar = mesh(new THREE.BoxGeometry(1.8, .16, .16), clay(ST.policy.c), x, 1.2, z);
  gate.m = new THREE.MeshStandardMaterial({ color: 0xd9d4cc, emissive: 0, roughness: .4 }); gate.lamp = mesh(new THREE.SphereGeometry(.2, 16, 12), gate.m, x, 2.05, z);
  stationLabel("policy", "policy", 2.6); }
/* workshop (worker home 1) */
{ const [x, z] = PL.workshop; mesh(new THREE.BoxGeometry(1.8, 1.4, 1.6), clay("#9eb0c9"), x, .7, z); const r = mesh(new THREE.BoxGeometry(2.1, .14, 1.9), clay("#5f739a"), x, 1.5, z); r.rotation.z = .12;
  mesh(new THREE.BoxGeometry(.16, 2.8, .16), clay("#e2b04a"), x + .9, 1.4, z + 1); mesh(new THREE.BoxGeometry(1.8, .14, .14), clay("#e2b04a"), x + 1.6, 2.8, z + 1); }
/* shop (worker home 2) */
const awning = [];
{ const [x, z] = PL.shop; mesh(new THREE.BoxGeometry(2.2, 1, 1), clay("#b08a63"), x, .5, z); mesh(new THREE.BoxGeometry(2.4, .12, 1.2), clay("#dcbd94"), x, 1.05, z);
  [-1.05, 1.05].forEach((dx) => mesh(new THREE.BoxGeometry(.12, 2.3, .12), clay("#9a7152"), x + dx, 1.15, z - .4));
  for (let i = 0; i < 6; i++) { const m = mesh(new THREE.BoxGeometry(.4, .08, 1.3), clay(i % 2 ? "#fffaf0" : AG.ohwow.color), x - 1 + i * .4, 2.25, z + .15); m.rotation.x = .35; awning.push(m); } }
/* verifier arch + step lamps */
const LAMPS = [];
{ const [x, z] = PL.checker, stone = clay("#d8d0c2");
  mesh(new THREE.BoxGeometry(.45, 2.6, .55), stone, x - 1.5, 1.3, z); mesh(new THREE.BoxGeometry(.45, 2.6, .55), stone, x + 1.5, 1.3, z); mesh(new THREE.BoxGeometry(3.6, .5, .65), clay(ST.verify.c), x, 2.8, z);
  for (let i = 0; i < 8; i++) { const m = new THREE.MeshStandardMaterial({ color: 0xf2eee6, emissive: 0, roughness: .4 }); const s = mesh(new THREE.SphereGeometry(.15, 14, 10), m, x - 1.4 + i * .4, 2.8, z + .36); s.castShadow = false; LAMPS.push({ m, state: "" }); }
  stationLabel("verify", "checker", 3.4); }
/* field tiles that fly into the checker */
const TILES = []; for (let i = 0; i < 8; i++) { const m = mesh(new THREE.BoxGeometry(.26, .26, .26), clay("#ffffff"), 0, 0, 0); m.visible = false; TILES.push(m); }
/* two seals: stored vs recomputed */
function sealObj(name) { const c = document.createElement("canvas"); c.width = c.height = 256; const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: .15, roughness: .55, transparent: true });
  const d = mesh(new THREE.CircleGeometry(.72, 48), m, 0, 0, 0); d.castShadow = false; d.visible = false; const L = label(d, "chiplab", name, -1.05, "background:#5b6570;transform:translate(-50%,0)"); return { c, t, m, d, L, key: "" }; }
const SEALS = { stored: sealObj("stored by the worker"), live: sealObj("recomputed in your browser") };
{ const [x, z] = PL.seal; mesh(new THREE.CylinderGeometry(.9, 1.05, .5, 24), clay("#d8d0c2"), x, .25, z); }
function drawSeal(S, digest, ring, frac) {
  const key = (digest || "x") + ring + Math.round(frac * 64); if (S.key === key) return; S.key = key; const x = S.c.getContext("2d"); x.clearRect(0, 0, 256, 256);
  x.fillStyle = "#fffdf8"; x.beginPath(); x.arc(128, 128, 126, 0, 7); x.fill(); x.lineWidth = 10; x.strokeStyle = ring; x.beginPath(); x.arc(128, 128, 116, 0, 7); x.stroke();
  if (digest) { const bits = digest.match(/../g).map((h) => parseInt(h, 16).toString(2).padStart(8, "0")).join(""); const n = Math.floor(256 * frac);
    for (let i = 0; i < 256; i++) { const cx = 38 + (i % 16) * 12, cy = 38 + Math.floor(i / 16) * 12; if (Math.hypot(cx - 128, cy - 128) > 102) continue; x.fillStyle = i < n ? (bits[i] === "1" ? ring : "#ece6da") : "#f3efe7"; x.beginPath(); x.arc(cx, cy, 4.3, 0, 7); x.fill(); } }
  else { x.fillStyle = "#8b949e"; x.font = "600 30px Fredoka, sans-serif"; x.textAlign = "center"; x.fillText("no digest", 128, 138); }
  S.t.needsUpdate = true; }
/* settlement: escrow vault + fee jar + on-chain block tower */
const vault = {};
{ const [x, z] = PL.vault; vault.body = mesh(new THREE.BoxGeometry(1.5, 1, 1.1), clay("#5b7f86"), x, .5, z);
  vault.lidPivot = new THREE.Group(); vault.lidPivot.position.set(x, 1, z - .55); scene.add(vault.lidPivot); vault.lid = mesh(new THREE.BoxGeometry(1.56, .22, 1.16), clay(ST.settle.c), 0, .11, .58, vault.lidPivot);
  vault.lockM = new THREE.MeshStandardMaterial({ color: 0xe6b54a, roughness: .4, emissive: 0 }); vault.lock = mesh(new THREE.BoxGeometry(.3, .34, .08), vault.lockM, x, .68, z + .57);
  label(anchorAt("vault", 1.7), "place", "Escrow", 0, "background:#5b7f86");
  const [fx, fz] = PL.fee; mesh(new THREE.CylinderGeometry(.32, .28, .7, 18), clay("#b8ccd0", { roughness: .35 }), fx, .35, fz); label(anchorAt("fee", 1.05), "place", "Market fee", 0, "background:#8b949e");
  stationLabel("settle", "vaultFront", 2.6); }
const BLOCKS = [];
{ const [x, z] = PL.tower; mesh(new THREE.CylinderGeometry(.9, 1, .3, 6), clay("#c7d8d4"), x, .15, z);
  for (let i = 0; i < 5; i++) { const m = mesh(new THREE.BoxGeometry(.9, .62, .9), clay(ST.settle.c, { emissive: new THREE.Color(ST.settle.c), emissiveIntensity: .12 }), x, .62 + i * .72, z); m.rotation.y = i * .35; m.visible = false; BLOCKS.push({ m, L: label(m, "chiplab", "", .55, `background:${ST.settle.c}`) }); }
  const ghost = mesh(new THREE.BoxGeometry(.9, .62, .9), new THREE.MeshStandardMaterial({ color: ST.settle.c, transparent: true, opacity: .18 }), x, .62, z); ghost.castShadow = false; vault.ghost = ghost;
  label(anchorAt("tower", -.1), "place", "On-chain", 0, `background:${ST.settle.c}`); }
/* reputation board */
const boardCanvas = document.createElement("canvas"); boardCanvas.width = 640; boardCanvas.height = 400; const boardTex = new THREE.CanvasTexture(boardCanvas); boardTex.colorSpace = THREE.SRGBColorSpace;
{ const [x, z] = PL.scoreboard; mesh(new THREE.BoxGeometry(.16, 1.4, .16), clay("#9a7152"), x - 1.3, .7, z); mesh(new THREE.BoxGeometry(.16, 1.4, .16), clay("#9a7152"), x + 1.3, .7, z);
  mesh(new THREE.BoxGeometry(3.2, 2.1, .16), clay(ST.rep.c), x, 2.35, z - .02);
  const f = new THREE.Mesh(new THREE.PlaneGeometry(3, 1.875), new THREE.MeshStandardMaterial({ map: boardTex, roughness: .9 })); f.position.set(x, 2.35, z + .07); scene.add(f);
  stationLabel("rep", "scoreboard", 3.7); }
/* AI orb (thinking) */
const orb = new THREE.Group(); orb.visible = false; scene.add(orb);
{ orb.add(new THREE.Mesh(new THREE.IcosahedronGeometry(.55, 1), new THREE.MeshBasicMaterial({ color: ST.work.c, wireframe: true, transparent: true, opacity: .55 })));
  orb.core = new THREE.Mesh(new THREE.SphereGeometry(.28, 20, 16), new THREE.MeshStandardMaterial({ color: ST.work.c, emissive: new THREE.Color(ST.work.c), emissiveIntensity: 1.1 })); orb.add(orb.core);
  const g = new THREE.BufferGeometry(), N = 90, arr = new Float32Array(N * 3); for (let i = 0; i < N; i++) { const a = Math.random() * 6.28, b = Math.acos(2 * Math.random() - 1), r = .7 + Math.random() * .5; arr.set([r * Math.sin(b) * Math.cos(a), r * Math.cos(b), r * Math.sin(b) * Math.sin(a)], i * 3); }
  g.setAttribute("position", new THREE.BufferAttribute(arr, 3)); orb.pts = new THREE.Points(g, new THREE.PointsMaterial({ color: ST.work.c, size: .07 })); orb.add(orb.pts);
  orb.L = label(orb, "chiplab", "", .95, `background:${ST.work.c}`); }
/* focus ring */
const ring = new THREE.Mesh(new THREE.RingGeometry(1.15, 1.4, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .8, side: THREE.DoubleSide })); ring.rotation.x = -Math.PI / 2; ring.position.y = .05; scene.add(ring);

/* ---------- robots ---------- */
function drawFace(ctx, mood) { const W = 128, H = 96; ctx.clearRect(0, 0, W, H); ctx.fillStyle = "#1d2430"; ctx.beginPath(); ctx.roundRect(4, 4, W - 8, H - 8, 26); ctx.fill();
  const eye = mood === "alarm" ? "#ffb2a6" : "#dff7ff"; ctx.fillStyle = eye; ctx.strokeStyle = eye; ctx.lineWidth = 7; ctx.lineCap = "round"; const L = [42, 46], R = [86, 46];
  if (mood === "happy") [L, R].forEach(([x, y]) => { ctx.beginPath(); ctx.arc(x, y + 6, 12, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); });
  else if (mood === "think") { [L, R].forEach(([x, y]) => { ctx.beginPath(); ctx.arc(x + 5, y - 5, 7, 0, 7); ctx.fill(); }); [52, 64, 76].forEach((x) => { ctx.beginPath(); ctx.arc(x, 74, 3.5, 0, 7); ctx.fill(); }); }
  else if (mood === "alarm") { [L, R].forEach(([x, y]) => { ctx.beginPath(); ctx.arc(x, y, 12, 0, 7); ctx.stroke(); }); ctx.beginPath(); ctx.arc(64, 74, 6, 0, 7); ctx.fill(); }
  else { [L, R].forEach(([x, y]) => { ctx.beginPath(); ctx.arc(x, y, 9, 0, 7); ctx.fill(); }); ctx.beginPath(); ctx.arc(64, 68, 9, Math.PI * .15, Math.PI * .85); ctx.stroke(); } }
function chestDraw(r) { const x = r.chest.getContext("2d"), S = 256; x.clearRect(0, 0, S, S); x.fillStyle = "#ffffff"; x.beginPath(); x.arc(128, 128, 124, 0, 7); x.fill(); x.lineWidth = 14; x.strokeStyle = r.color; x.stroke();
  if (r.logoImg) { const im = r.logoImg, k = Math.min(150 / im.width, 150 / im.height); x.drawImage(im, 128 - im.width * k / 2, 128 - im.height * k / 2, im.width * k, im.height * k); }
  else { x.fillStyle = r.color; x.font = `700 ${r.def.mono.length > 1 ? 92 : 120}px Fredoka, system-ui, sans-serif`; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(r.def.mono, 128, 134); }
  r.chestTex.needsUpdate = true; }
const ROBOTS = {};
function makeRobot(id, def) {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body); scene.add(root); const mat = clay(def.color), dark = clay("#4a4f58"), light = clay("#f7f3ec");
  mesh(new THREE.CapsuleGeometry(.42, .42, 8, 18), mat, 0, .98, 0, body);
  const head = new THREE.Group(); head.position.y = 1.78; body.add(head); mesh(new THREE.SphereGeometry(.44, 24, 18), mat, 0, 0, 0, head);
  const fc = document.createElement("canvas"); fc.width = 128; fc.height = 96; const fctx = fc.getContext("2d"); const ftex = new THREE.CanvasTexture(fc); ftex.colorSpace = THREE.SRGBColorSpace;
  const scr = mesh(new THREE.PlaneGeometry(.56, .42), new THREE.MeshStandardMaterial({ map: ftex, emissiveMap: ftex, emissive: 0xffffff, emissiveIntensity: .7, transparent: true }), 0, .02, .43, head); scr.castShadow = false;
  mesh(new THREE.CylinderGeometry(.025, .025, .3, 6), dark, 0, .55, 0, head); const bulbM = clay(def.color, { emissive: new THREE.Color(def.color), emissiveIntensity: .5 }); mesh(new THREE.SphereGeometry(.07, 10, 8), bulbM, 0, .72, 0, head);
  const chest = document.createElement("canvas"); chest.width = chest.height = 256; const chestTex = new THREE.CanvasTexture(chest); chestTex.colorSpace = THREE.SRGBColorSpace;
  const plate = mesh(new THREE.CircleGeometry(.24, 32), new THREE.MeshStandardMaterial({ map: chestTex, roughness: .8 }), 0, 1.02, .425, body); plate.castShadow = false;
  const armL = new THREE.Group(), armR = new THREE.Group(); armL.position.set(-.5, 1.22, 0); armR.position.set(.5, 1.22, 0); body.add(armL, armR);
  mesh(new THREE.CapsuleGeometry(.11, .38, 6, 10), mat, 0, -.25, 0, armL); mesh(new THREE.SphereGeometry(.13, 12, 10), light, 0, -.52, 0, armL); mesh(new THREE.CapsuleGeometry(.11, .38, 6, 10), mat, 0, -.25, 0, armR);
  if (id === "ceoclaw") [-.07, .07].forEach((dx) => { const c = mesh(new THREE.ConeGeometry(.06, .3, 8), clay("#e2b04a"), dx, -.6, 0, armR); c.rotation.x = Math.PI; c.rotation.z = dx * 3; });
  else mesh(new THREE.SphereGeometry(.13, 12, 10), light, 0, -.52, 0, armR);
  armL.rotation.z = -.18; armR.rotation.z = .18; [-.18, .18].forEach((dx) => mesh(new THREE.CapsuleGeometry(.12, .2, 6, 10), dark, dx, .28, 0, body));
  let flagMat = null;
  if (id === "patriot") { mesh(new THREE.CylinderGeometry(.025, .025, 1.3, 6), dark, -.2, 1.7, -.38, body); flagMat = clay(def.color); mesh(new THREE.BoxGeometry(.45, .3, .03), flagMat, .03, 2.2, -.38, body); }
  if (id === "nearo") { const sh = mesh(new THREE.CylinderGeometry(.32, .32, .07, 22), clay("#f4efe4"), -.2, -.35, .12, armL); sh.rotation.z = Math.PI / 2; sh.rotation.y = .3; flagMat = clay(def.color); const em = mesh(new THREE.CylinderGeometry(.2, .2, .08, 18), flagMat, -.24, -.35, .12, armL); em.rotation.z = Math.PI / 2; em.rotation.y = .3; }
  if (id === "ohwow") mesh(new THREE.CylinderGeometry(.3, .32, .22, 18), clay("#fffaf0"), 0, .42, 0, head);
  if (id === "goblin") [-1, 1].forEach((s) => { const e = mesh(new THREE.ConeGeometry(.12, .5, 10), mat, s * .45, .12, 0, head); e.rotation.z = -s * 1.2; });
  if (id === "buyer") mesh(new THREE.BoxGeometry(.5, .55, .26), clay("#7d858f"), 0, 1.05, -.48, body);
  const parcel = mesh(new THREE.BoxGeometry(.4, .3, .3), clay("#f1dcae"), 0, 1.0, .62, body); parcel.visible = false;
  root.scale.setScalar(def.small ? .74 : 1); const home = pos(def.home) || def.at; root.position.set(home[0], 0, home[1]);
  const r = { id, def, root, body, head, mat, bulbM, flagMat, fctx, ftex, chest, chestTex, parcel, mood: "", color: def.color, logoImg: null, phase: Math.random() * 6 };
  r.setMood = (m) => { if (r.mood === m) return; r.mood = m; drawFace(fctx, m); ftex.needsUpdate = true; };
  r.setColor = (c) => { r.color = c; mat.color.set(c); bulbM.color.set(c); bulbM.emissive.set(c); if (flagMat) flagMat.color.set(c); if (id === "ohwow") awning.forEach((m, i) => i % 2 || m.material.color.set(c)); chestDraw(r); r.tagDot.style.background = c; };
  r.setMood("idle"); const a = new THREE.Object3D(); a.position.y = -.12; root.add(a);
  r.tag = label(a, "tag", `<i></i><span>${esc(def.role)}</span><small>${esc(def.name)}</small>`); r.tagDot = r.tag.el.querySelector("i"); r.tagDot.style.background = def.color; r.tagSmall = r.tag.el.querySelector("small");
  const ha = new THREE.Object3D(); ha.position.y = 2.75; root.add(ha); r.headAnchor = ha; chestDraw(r); ROBOTS[id] = r; return r; }
Object.entries(AG).forEach(([id, d]) => makeRobot(id, d));

const COINS = {};
function coin(id, color = "#e9b440") { if (COINS[id]) return COINS[id]; const g = new THREE.Group(); scene.add(g);
  const m = mesh(new THREE.CylinderGeometry(.3, .3, .09, 28), clay(color, { metalness: .3, roughness: .45 }), 0, 0, 0, g); m.rotation.x = Math.PI / 2; g.visible = false; return (COINS[id] = { g, L: label(g, "chiplab", "", .45, "background:#b5860f") }); }
let bubbleEl = null;
function bubble(r, text) { if (!bubbleEl) { bubbleEl = document.createElement("div"); bubbleEl.className = "bubble"; labelsEl.appendChild(bubbleEl); } if (!r) { bubbleEl.style.display = "none"; bubbleEl._r = null; return; } bubbleEl._r = r; if (bubbleEl.textContent !== text) bubbleEl.textContent = text; bubbleEl.style.display = ""; }
const LAMPC = { ok: 0x2fbf73, fail: 0xe5483f, blocked: 0xf08a2c };
function setLamps(steps, frac) { const n = steps ? Math.ceil(frac * steps.length) : 0;
  LAMPS.forEach((L, i) => { const st = steps && i < n ? (steps.find((s) => s.n === i) || { state: "skip" }).state : ""; if (L.state === st) return; L.state = st; const c = LAMPC[st]; L.m.color.setHex(c || 0xf2eee6); L.m.emissive.setHex(c || 0); L.m.emissiveIntensity = c ? 1 : 0; }); }
function setGate(st) { const c = st === "block" ? 0xe5483f : st === "pass" ? 0x2fbf73 : 0; gate.m.color.setHex(c || 0xd9d4cc); gate.m.emissive.setHex(c); gate.m.emissiveIntensity = c ? 1.2 : 0; gate.bar.rotation.z = st === "pass" ? .9 : 0; gate.bar.position.x = PL.policy[0] + (st === "pass" ? -.35 : 0); }
let boardKey = "";
function drawBoard(snap) { const k = JSON.stringify(snap); if (k === boardKey) return; boardKey = k; const x = boardCanvas.getContext("2d"), W = 640, H = 400;
  x.fillStyle = "#fffaf4"; x.fillRect(0, 0, W, H); x.fillStyle = "#1c2128"; x.font = "700 28px Fredoka, sans-serif"; x.fillText("Only checked work counts", 24, 44);
  x.font = "500 14px JetBrains Mono, monospace"; x.fillStyle = "#8b949e"; const cols = [["agent", 24], ["jobs", 230], ["verified", 300], ["caught", 390], ["blocked", 468], ["paid", 556]]; cols.forEach(([t, cx]) => x.fillText(t, cx, 80));
  const ids = Object.keys(snap.rows).sort((a, b) => snap.rows[b].rec - snap.rows[a].rec); let y = 114;
  ids.slice(0, 7).forEach((id) => { const r = snap.rows[id], R = ROBOTS[id]; x.fillStyle = r.rec ? "#1c2128" : "#b4bac1"; x.font = "700 18px Nunito Sans, sans-serif"; x.fillText(R ? R.def.name : id, 24, y);
    x.font = "500 18px JetBrains Mono, monospace"; [r.rec, r.pass, r.caught, r.blocked].forEach((v, i) => x.fillText(String(v), cols[i + 1][1] + 10, y)); x.fillText(r.paid ? r.paid.toFixed(2) : "-", 556, y); y += 33; });
  x.fillStyle = "#cf4870"; x.font = "700 18px Nunito Sans, sans-serif"; x.fillText(`Reputation points: ${snap.rep}`, 24, H - 22); boardTex.needsUpdate = true; }

/* ---------- runs from records (generic: any record that matches a known shape) ---------- */
const TOT = {}; Object.keys(AG).forEach((id) => (TOT[id] = { rec: 0, pass: 0, caught: 0, blocked: 0, paid: 0 }));
let REP = 0; const snapNow = () => ({ rows: JSON.parse(JSON.stringify(TOT)), rep: REP });
const bump = (id, f, n = 1) => ((TOT[id] ||= { rec: 0, pass: 0, caught: 0, blocked: 0, paid: 0 })[f] += n);
const canon = (o) => CHK.canonicalJson(o);
const homeOf = (id) => ROBOTS[id].def.home || ROBOTS[id].def.at;
function provLabel(p) { if (!p) return "your file"; if (typeof p === "string") return p; if (p.source) return p.source; if (p.path) return `${p.repo ? p.repo + " " : ""}${p.ref || ""}@${String(p.commit || "").slice(0, 7)} · ${p.path}`; const first = Object.values(p)[0]; return first && typeof first === "object" ? provLabel(first) : "your file"; }
function agentFor(execId, role = "Worker") { if (EXEC[execId]) return EXEC[execId]; if (ROBOTS[execId]) return execId; const id = "x_" + String(execId || "unknown").replace(/[^a-z0-9]/gi, "_").slice(0, 30);
  if (!ROBOTS[id]) { const spot = SPAWN[Object.keys(ROBOTS).length % SPAWN.length]; let h = 0; for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    makeRobot(id, { name: execId || "unknown agent", role, color: `hsl(${h % 360}, 50%, 58%)`, at: spot, mono: (execId || "?").slice(0, 2).toUpperCase() }); TOT[id] ||= { rec: 0, pass: 0, caught: 0, blocked: 0, paid: 0 }; applyCustom(id); } return id; }
const verdictOf = (res) => res.outcome === "pass" ? ["v-ok", "Pass"] : res.outcome === "blocked" ? ["v-block", "Blocked"] : ["v-fail", "Fail"];
const RUNS = [];

function verifyBeats(ex, env, out, live, stored, from) {
  const res = live.result, match = stored ? res.evidence_digest === stored : null; const fails = live.steps.find((s) => s.state === "fail" || s.state === "blocked");
  const fr = (live.fieldResults || []).map((f) => f.ok);
  const beats = [{ station: "verify", title: res.outcome === "pass" ? "The checker tests every field" : res.outcome === "blocked" ? `The checker stops it at step ${fails.n}` : "The checker catches a wrong field", focus: "checker", actors: [ex], dur: 4.2, verdict: verdictOf(res),
    line: res.outcome === "pass" ? `All ${env.required_fields.length} fields match the job. Your browser just ran this check itself.` : (res.failure_reason || res.blocked_reason),
    detail: "The checker is the same code everyone can run. It reads the job, reads the delivery, and returns pass, fail or blocked with a reason. Your browser re-ran it on the delivered data when this page opened.", source: "src/checker.js, run live in your browser", raw: { delivery: out, result: res },
    ops: [{ k: "walk", a: ex, from, to: "checkerFront", w: [0, .3] }, { k: "tiles", ok: fr, w: [.25, .8] }, { k: "lamps", steps: live.steps, w: [.3, .9] }, { k: "mood", a: ex, m: res.outcome === "pass" ? "happy" : "alarm", at: .85 }] }];
  if (res.outcome === "pass" && res.evidence_digest) beats.push({ station: "verify", title: match === null ? "The result is sealed as a fingerprint" : match ? "Two fingerprints, one proof" : "The fingerprints do not match", focus: "seal", actors: [], dur: 4.4, verdict: match === false ? ["v-fail", "Mismatch"] : ["v-ok", match ? "Match" : "Sealed"],
    line: match === null ? `The checker hashes the job and the answer into ${short(res.evidence_digest)}. Change one letter and it changes completely.` : match ? `The worker stored ${short(stored)}. Your browser computed the same. Anyone can repeat this.` : `Stored ${short(stored)}, computed ${short(res.evidence_digest)}. This run is not proven.`,
    detail: "The fingerprint is a SHA-256 digest of the job id, the worker id, the input and the extracted fields. The 256 dots are its 256 bits.", source: "SHA-256 in your browser" + (stored ? " vs the stored record" : ""), raw: { computed: res.evidence_digest, stored: stored || null },
    ops: [{ k: "seals", stored, live: res.evidence_digest, match }] });
  return { beats, match, res };
}

/* A market job: job_ref (agentproof-market-job-ref-v1) + envelope, optionally events, tasks, chain, settlement_observed. */
async function runMarket(B, entry) {
  const jr = B.job_ref; let env = B.envelope; if (typeof env === "string") env = JSON.parse(env);
  const out = jr.delivery?.output, stored = jr.delivery?.checker?.evidence_digest; const ex = agentFor(jr.executor?.executor_agent_id || out?.executor_agent_id);
  const rq = B.requester?.agent ? agentFor(B.requester.agent, "Requester") : agentFor("requester " + String(jr.job?.id || "").slice(0, 6), "Requester");
  const ev = (n) => (B.events || []).find((e) => e.event === n), tk = B.tasks || [], so = B.settlement_observed;
  const live = env && out ? await CHK.check(env, out) : null; const pass = live?.result.outcome === "pass";
  const src = provLabel(B.provenance); const amt = `${jr.hire?.amount ?? jr.job?.budget_amount ?? "?"} ${jr.hire?.token || jr.job?.budget_token || ""}`.trim();
  const accepted = jr.hire?.accepted_at || ev("hire.accepted")?.received_at; const paid = so ? parseFloat(so.payout_usdc) : accepted ? parseFloat(jr.hire?.amount) || 0 : 0;
  const points = accepted && pass && !B.self_hire ? 1 : 0;
  const start = snapNow(); bump(ex, "rec"); if (live) bump(ex, pass ? "pass" : "caught"); if (accepted) bump(ex, "paid", paid); bump(rq, "rec"); REP += points; const end = snapNow();
  const eh = homeOf(ex), rh = homeOf(rq); const nf = env?.required_fields?.length; const beats = [];
  (B.chain || []).slice(0, 5).forEach((c, i) => beats.push({ station: "settle", chip: "On-chain", t: c.at, tApprox: c.at_approx, title: c.kind === "deposit" ? "The requester funds a wallet on-chain" : "An on-chain step", focus: "tower", actors: [rq],
    line: c.kind === "deposit" ? `${c.credited_usdc || c.amount_in} USDC arrive in the requester's wallet through a chain deposit${c.network ? " (" + c.network + ")" : ""}.` : (c.note || c.kind), detail: "Transaction hashes are kept out of this page.", source: src, raw: c,
    ops: [{ k: "block", i, label: `+${c.credited_usdc || c.amount_in || ""} USDC · ${c.kind}` }] }));
  beats.push({ station: "request", t: jr.job?.created_at, title: "A requester posts a job", focus: "board", actors: [rq], line: `${nf ? `Extract ${nf} fields from a short text. ` : ""}Budget: ${amt}.${jr.dry_run ? " This record is a dry run." : ""}`, detail: `Job "${jr.job?.title || jr.job?.id}". The job contract (envelope) lists what to deliver and the most the requester will pay.`, source: src, raw: { job: jr.job, envelope: env },
    ops: [{ k: "walk", a: rq, from: rh, to: "requesterSpot", w: [0, .6] }, { k: "scroll", label: `${nf ? nf + " fields · " : ""}${amt}`, w: [.5, 1] }] });
  const escrowSeen = jr.escrow?.read_ok === true;
  beats.push({ station: "settle", t: jr.job?.created_at, title: escrowSeen ? "The money waits in escrow" : "The market says it holds the money", focus: "vault", actors: [rq], line: escrowSeen ? `The record shows ${jr.escrow.amount} ${jr.escrow.token || ""} held by the market until the work is accepted.` : `The ${amt} goes into the market's escrow. This record could not read the escrow itself, so it is shown as not observed.`, detail: escrowSeen ? "Escrow read from the market by the worker's token." : `Not observed: ${jr.escrow?.missing || "no escrow data in this record"}.`, source: src, raw: jr.escrow || jr.hire,
    ops: [{ k: "coin", c: entry.id + "pay", from: "requesterSpot", to: "vault" }, { k: "vault", v: "lock", at: .9 }] });
  const hc = ev("hire.created");
  beats.push({ station: "work", t: hc?.received_at || jr.hire?.started_at, title: "A worker agent picks up the job", focus: eh, actors: [ex], line: "The market signals the worker. The job becomes a task for its AI.", detail: hc ? "hire.created reached the worker's webhook with a signed request." : "The worker acknowledged the hire.", source: hc ? "marketplace_events · hire.created" : src, raw: hc || jr.hire,
    ops: [{ k: "coin", c: entry.id + "ping", color: "#ffffff", from: "vault", to: eh, label: "hire", vanish: true }, { k: "mood", a: ex, m: "think" }] });
  const workBeat = (task, title, word) => ({ station: "work", t: task?.completed_at, title, focus: eh, actors: [ex], line: task ? `Done in ${secs(task.started_at, task.completed_at)} seconds, for ${task.cost_cents} cents of AI budget.` : "This record does not say how long the AI worked.", detail: "The AI work happens off-chain. What matters for proof is what it delivered, which the checker tests.", source: task ? "agent_workforce_tasks · " + task.id : src, raw: task || null,
    ops: [{ k: "orb", a: ex, label: task ? `${word} · ${secs(task.started_at, task.completed_at)} s · ${task.cost_cents}¢` : word, w: [0, .85] }, { k: "parcel", a: ex, v: true, at: .85 }, { k: "mood", a: ex, m: "happy", at: .85 }] });
  beats.push(workBeat(tk[0], "The AI does the task", "AI task"));
  const cr = ev("hire.changes_requested");
  if (cr) { beats.push({ station: "request", t: cr.received_at, title: "The requester asks for one change", focus: "board", actors: [rq, ex], line: "Requesters can push back. The worker has to deliver again.", detail: B.first_submit ? `The first delivery went out at ${fmtT(B.first_submit.at)}; ${B.first_submit.note}.` : "The requester asked for a change.", source: "marketplace_events · hire.changes_requested", raw: { first_submit: B.first_submit || null, changes_requested: cr },
      ops: [{ k: "say", a: rq, text: "Close. One change, please." }, { k: "mood", a: ex, m: "think" }, { k: "parcel", a: ex, v: false }] });
    beats.push(workBeat(tk[1], "The AI reworks it", "AI rework")); }
  let V = { beats: [], match: null };
  if (live) { V = verifyBeats(ex, env, out, live, stored, eh); V.beats.forEach((b) => (b.t = jr.delivery?.checker?.judged_at || b.t)); beats.push(...V.beats); }
  if (accepted) { const fee = so?.fee_usdc;
    beats.push({ station: "settle", t: accepted, title: "Accepted, so the escrow opens", focus: "vault", actors: [ex, rq], dur: 4.2, verdict: ["v-ok", `Paid ${so ? so.payout_usdc : jr.hire?.amount} ${jr.hire?.token || ""}`.trim()], line: so ? `${so.payout_usdc} goes to the worker. ${fee} goes to the market as its fee.` : `${amt} is released to the worker (before any market fee).`, detail: so?.note || "Accepted by the requester.", source: src, raw: { accepted: ev("hire.accepted") || accepted, settlement: jr.settlement?.ours || null, observed: so || null },
      ops: [{ k: "walk", a: ex, from: live ? "checkerFront" : eh, to: "vaultFront", w: [0, .3] }, { k: "parcel", a: ex, v: false, at: .3 }, { k: "vault", v: "open", at: .3 }, { k: "coin", c: entry.id + "pay", from: "vault", to: eh, label: so ? so.payout_usdc + " USDC" : amt, w: [.4, 1] }, ...(fee ? [{ k: "coin", c: entry.id + "fee", color: "#c9d6da", from: "vault", to: "fee", label: fee + " fee", w: [.45, .9] }] : []), { k: "walk", a: ex, from: "vaultFront", to: eh, w: [.4, 1] }] }); }
  beats.push({ station: "rep", t: accepted, title: B.self_hire ? "Paid and proven, but no reputation yet" : points ? "One reputation point earned" : "No reputation for this one", focus: "scoreboard", actors: ["goblin"], line: B.self_hire ? "The requester and the worker belong to the same owner, so this job earns 0 points." : points ? "Checked, paid work for a different owner. That is what reputation is made of." : "Only accepted work that passed the checker counts.", detail: "The scorekeeper reads verdicts. It never decides them.", source: B.self_hire ? "self_hire: true in the record" : "scorekeeper rule", raw: { self_hire: !!B.self_hire, points },
    ops: [{ k: "board", snap: end }, { k: "say", a: "goblin", text: B.self_hire ? "You hired yourself. Proven, but zero points!" : points ? "Proof in, point out!" : "No proof? No points!" }, { k: "mood", a: "goblin", m: "happy" }] });
  return { id: entry.id, title: entry.title || "Job " + String(jr.job?.id || "").slice(0, 8), meta: entry.meta || "From your file", verdict: live ? (pass ? ["v-ok", V.match === false ? "Mismatch" : "Proven"] : verdictOf(live.result)) : ["v-block", "Unchecked"], startSnap: start, beats,
    proved: [...(live ? [[pass, pass ? `The work matched all ${nf} fields of the job.` : "The delivery failed the check."]] : [[false, "The record has no envelope, so it could not be checked."]]), ...(stored && live ? [[V.match, V.match ? "The fingerprint your browser computed equals the one the worker stored." : "The fingerprints do not match."]] : []), ...(accepted ? [[escrowSeen ? true : null, escrowSeen ? `The ${amt} left escrow only after the requester accepted.` : so ? `A ${so.payout_usdc} payout was seen in the worker's wallet after acceptance. The escrow itself was not observed.` : "Accepted. The escrow and payout were not observed in this record."]] : []), [points ? true : false, B.self_hire ? "Reputation: the requester and worker share an owner." : points ? "It earned one reputation point." : "Reputation: nothing earned."]] };
}
/* A checker run: { envelope, delivery, result? } */
async function runCheck(B, entry) {
  const envelope = B.envelope, delivery = B.delivery, committed = B.result || null; const pv = B.provenance || {};
  const envSrc = provLabel(pv.envelope || pv), delSrc = provLabel(pv.delivery || pv), resSrc = committed ? provLabel(pv.result || pv) : null;
  const who = entry.work || { title: `${delivery.executor_agent_id || "A worker"} delivers`, line: delivery.blocked ? "The worker reports the job as blocked." : "The delivery goes to the checker." };
  const ex = agentFor(delivery.executor_agent_id); const live = await CHK.check(envelope, delivery); const res = live.result; const same = committed ? canon(committed) === canon(res) : null;
  const start = snapNow(); bump(ex, "rec"); bump(ex, res.outcome === "pass" ? "pass" : res.outcome === "blocked" ? "blocked" : "caught"); const end = snapNow();
  const home = homeOf(ex); const V = verifyBeats(ex, envelope, delivery, live, null, home);
  const beats = [
    { station: "request", title: "A job is posted", focus: "board", actors: [], line: `Extract ${envelope.required_fields?.length} fields. The most it may cost: ${envelope.max_spend_usdc} USDC.`, detail: `Job ${envelope.task_id}.`, source: envSrc, raw: envelope, ops: [{ k: "scroll", label: `${envelope.required_fields?.length} fields · ${envelope.max_spend_usdc} USDC` }] },
    { station: "work", title: who.title, focus: home, actors: [ex], line: who.line, detail: "The delivery as recorded in the file.", source: delSrc, raw: delivery,
      ops: [{ k: "mood", a: ex, m: "think" }, ...(delivery.blocked ? [] : [{ k: "orb", a: ex, label: "AI task (not timed in this record)", w: [0, .8] }]), { k: "parcel", a: ex, v: true, at: .8 }, ...(who.say ? [{ k: "say", a: ex, text: who.say }] : [])] },
    ...V.beats.map((b) => same === null ? b : { ...b, line: b.line + (same ? " Same result as the committed file." : " Differs from the committed file!"), source: b.source + " vs " + resSrc, raw: { ...b.raw, committed } }),
    { station: res.outcome === "pass" ? "settle" : "rep", title: res.outcome === "pass" ? "Ready to be paid" : "No proof, so no money moves", focus: res.outcome === "pass" ? "vault" : "scoreboard", actors: ["goblin"], line: res.outcome === "pass" ? "A pass with a fingerprint is what escrow waits for." : "Without a passing check there is nothing to pay against.", detail: "The scorekeeper only reads verdicts. It never decides them.", source: "scorekeeper rule", raw: end.rows[ex],
      ops: [{ k: "parcel", a: ex, v: false }, { k: "walk", a: ex, from: "checkerFront", to: home }, { k: "board", snap: end }, { k: "say", a: "goblin", text: res.outcome === "pass" ? "Checked and sealed. That counts!" : res.outcome === "blocked" ? "Over budget. Stopped before any work." : "Caught! No proof, no points." }] },
  ];
  return { id: entry.id, title: entry.title || "Check " + String(envelope.task_id || "").slice(0, 10), meta: entry.meta || "From your file", verdict: verdictOf(res), startSnap: start, beats,
    proved: res.outcome === "pass" ? [[true, "The delivery passed every check."], [true, "It produced a fingerprint anyone can recompute."], ...(same === false ? [[null, "But it differs from the committed result."]] : [])] : res.outcome === "blocked" ? [[true, "The worker refused a price over the job's budget."], [same !== false, same ? "Your browser's verdict equals the committed result exactly." : same === false ? "It differs from the committed result." : "Checked live in your browser."], [true, "No money moved."]] : [[true, `The checker rejected it: ${res.failure_reason}.`], [true, "No fingerprint, so nothing could be paid."]] };
}
/* A spend-policy record: { governance_record, control_run?, ... } */
function runPolicy(sc, entry) {
  const g = sc.governance_record, ctl = sc.control_run, ex = agentFor(g.executor_id); const blocked = g.decision !== "allowed"; const srcLabel = provLabel(sc.provenance);
  const start = snapNow(); bump(ex, "rec"); bump(ex, blocked ? "blocked" : "pass"); const end = snapNow(); const home = homeOf(ex);
  const beats = [
    { station: "policy", t: g.timestamp_iso, title: `An agent tries to spend $${g.requested_usdc}`, focus: "policy", actors: [ex, "nearo"], line: `Its owner set a limit of $${g.permitted_max_usdc} per task. Every spend must pass this gate first.`, detail: `Policy ${g.policy_version}. The gate runs before any market call.`, source: srcLabel, raw: g,
      ops: [{ k: "coin", c: entry.id + "big", color: "#f19a83", from: home, to: "policy", bounce: blocked, label: `$${g.requested_usdc}` }, { k: "gate", v: blocked ? "block" : "pass", at: .45 }, { k: "mood", a: ex, m: blocked ? "alarm" : "happy", at: .5 }] },
  ];
  if (blocked) beats.push({ station: "policy", t: g.timestamp_iso, title: "Blocked. Nothing was spent", focus: "policy", actors: [ex], verdict: ["v-block", "Blocked"], line: `${sc.market_calls_made ?? 0} market calls, ${sc.committed_cents_from_blocked_request ?? 0} cents committed. The agent's owner keeps control.`, detail: `${g.reason}.${sc.user_facing_message ? ` The agent was told: "${sc.user_facing_message}"` : ""}${sc.money_rail ? " Money rail: " + sc.money_rail + "." : ""}`, source: srcLabel, raw: { ledger_entry: sc.ledger_entry, gate: sc.gate },
    ops: [{ k: "gate", v: "block" }, { k: "say", a: "goblin", text: `$${g.requested_usdc}? The limit is $${g.permitted_max_usdc}. Stopped!` }, { k: "board", snap: end }] });
  if (ctl) beats.push({ station: "policy", t: ctl.governance_record.timestamp_iso, title: `A $${ctl.requested_usdc} spend goes through`, focus: "policy", actors: [ex], verdict: ["v-ok", "Allowed"], line: "Same gate, under the limit. The control run proves the gate is not just always closed.", detail: `Decision ${ctl.governance_record.decision}, ${ctl.market_calls_made} market call made.`, source: srcLabel, raw: ctl,
    ops: [{ k: "gate", v: "pass" }, { k: "coin", c: entry.id + "small", from: home, to: "vaultFront", label: `$${ctl.requested_usdc}` }, { k: "mood", a: ex, m: "happy" }] });
  return { id: entry.id, title: entry.title || "Spend policy check", meta: entry.meta || "From your file", verdict: blocked ? ["v-block", "Blocked"] : ["v-ok", "Allowed"], startSnap: start, beats,
    proved: [[true, blocked ? `A $${g.requested_usdc} spend was stopped before any market call.` : `A $${g.requested_usdc} spend was within the limit.`], ...(ctl ? [[true, `A $${ctl.requested_usdc} spend under the limit went through.`]] : []), [true, "The owner's limit, not the agent, decided."]] };
}
async function fromAny(o, entry = {}) {
  if (Array.isArray(o)) { const out = []; for (const [i, x] of o.entries()) out.push(...await fromAny(x, { ...entry, id: (entry.id || "file") + "-" + i })); return out; }
  if (!o || typeof o !== "object") return []; entry = { id: entry.id || "run-" + RUNS.length + "-" + Math.random().toString(36).slice(2, 6), ...entry };
  if (o.job_ref || o.schema === "agentproof-market-job-ref-v1") { const B = o.job_ref ? { ...o } : { job_ref: o, envelope: o.envelope }; B.envelope ||= o.extracted_input?.envelope || B.job_ref.envelope; return [await runMarket(B, entry)]; }
  if (o.envelope && o.delivery) return [await runCheck(o, entry)];
  if (o.governance_record) return [runPolicy(o, entry)];
  return [];
}

/* ---------- playback ---------- */
let ri = 0, bi = 0, prog = 1, animating = false, auto = false, atEnd = false;
const ease = (p) => p < .5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
const win = (op, p) => { const [a, b] = op.w || [0, 1]; return Math.min(1, Math.max(0, (p - a) / (b - a || 1))); };
function resetWorld(run) {
  Object.values(ROBOTS).forEach((r) => { const h = pos(r.def.home) || r.def.at; r.root.position.set(h[0], 0, h[1]); r.root.rotation.y = 0; r.parcel.visible = false; r.setMood("idle"); });
  Object.values(COINS).forEach((k) => (k.g.visible = false)); scroll.visible = false; setLamps(null, 0); setGate(""); drawBoard(run.startSnap); bubble(null); orb.visible = false; TILES.forEach((t) => (t.visible = false));
  Object.values(SEALS).forEach((S) => (S.d.visible = false)); BLOCKS.forEach((b) => (b.m.visible = false)); vault.lidPivot.rotation.x = 0; vault.lockM.emissive.setHex(0); vault.ghost.visible = true;
  Object.entries(ROBOTS).forEach(([id, r]) => { const n = (run.startSnap.rows[id] || {}).rec || 0; r.tagSmall.textContent = r.def.name + ((id === "patriot" || id === "nearo") && !n ? " · no records yet" : ""); });
}
function applyOp(op, p, current) {
  const q = win(op, p), R = op.a && ROBOTS[op.a]; const after = (t) => q >= (op.at ?? 0) && q > 0;
  switch (op.k) {
    case "walk": { const A = pos(op.from), B = pos(op.to), e = ease(q); R.root.position.set(A[0] + (B[0] - A[0]) * e, 0, A[1] + (B[1] - A[1]) * e); R.walking = q > 0 && q < 1; if (q > 0 && q < 1) R.root.rotation.y = Math.atan2(B[0] - A[0], B[1] - A[1]); else if (q >= 1) R.root.rotation.y = 0; break; }
    case "mood": if (after()) R.setMood(op.m); break;
    case "parcel": if (after()) R.parcel.visible = op.v; break;
    case "coin": { const k = coin(op.c, op.color); if (q <= 0) return; if (op.vanish && q >= 1) { k.g.visible = false; return; } const A = pos(op.from), B = pos(op.to); const t = op.bounce ? (q < .5 ? q * 2 : 2 - q * 2) : q, e = ease(t);
      k.g.visible = true; k.g.position.set(A[0] + (B[0] - A[0]) * e, 1.3 + Math.sin(Math.PI * t) * 1.6, A[1] + (B[1] - A[1]) * e); k.L.el.textContent = op.label || ""; k.L.show = !!op.label; break; }
    case "scroll": scroll.visible = q > 0; scrollLab.el.textContent = op.label; break;
    case "lamps": setLamps(op.steps, q); break;
    case "gate": if (after()) setGate(op.v); break;
    case "board": if (q > 0) drawBoard(op.snap); break;
    case "say": if (current && q > .1) bubble(R, op.text); break;
    case "vault": if (after()) { vault.lidPivot.rotation.x = op.v === "open" ? -1.1 : 0; vault.lockM.emissive.setHex(op.v === "lock" ? 0xe6b54a : 0); vault.lockM.emissiveIntensity = .8; } break;
    case "block": { const B = BLOCKS[op.i]; if (q <= 0) return; B.m.visible = true; vault.ghost.visible = false; B.m.position.y = .62 + op.i * .72 + (1 - ease(q)) * 3; B.L.el.textContent = op.label; break; }
    case "orb": { if (!current) { orb.visible = false; return; } orb.visible = q > 0; if (!orb.visible) return; R.headAnchor.getWorldPosition(tmpV); orb.position.set(tmpV.x, tmpV.y + .5, tmpV.z); orb.L.el.textContent = op.label; break; }
    case "tiles": { const n = op.ok.length; const [cx, cz] = PL.checker;
      TILES.forEach((t, i) => { if (!current || i >= n) { t.visible = false; return; } const s = i / n * .7, f = Math.min(1, Math.max(0, (q - s) / .3)); t.visible = f > 0 && f < 1; if (!t.visible) return;
        const fx = cx - .7 + (i % 4) * .45, fz = PL.checkerFront[1] + .3; t.position.set(fx + (cx - fx) * ease(f), 1.1 + Math.sin(Math.PI * f) * 1.2, fz + (cz - fz) * ease(f)); t.rotation.set(f * 4, f * 5, 0); t.material.color.set(f > .7 ? (op.ok[i] ? "#2fbf73" : "#e5483f") : "#ffffff"); }); break; }
    case "seals": { const [x, z] = PL.seal; const okc = op.match === false ? "#e5483f" : "#c98a06";
      const sp = Math.min(1, q / .55), merge = op.match ? ease(Math.max(0, (q - .6) / .4)) : 0; const gap = 1.0 * (1 - merge);
      const S1 = SEALS.stored, S2 = SEALS.live;
      if (op.stored) { S1.d.visible = q > 0; drawSeal(S1, op.stored, op.match === false ? "#8b949e" : okc, sp); S1.d.position.set(x - gap, 1.35 + merge * .2, z + .02); S1.d.lookAt(S1.d.position.x, S1.d.position.y, z + 10); S1.L.show = merge < .5; }
      S2.d.visible = q > 0; drawSeal(S2, op.live, okc, sp); S2.d.position.set(op.stored ? x + gap : x, 1.35 + merge * .2, z + .04); S2.d.lookAt(S2.d.position.x, S2.d.position.y, z + 10); S2.L.el.textContent = merge > .5 ? "same fingerprint" : "recomputed in your browser"; S2.m.emissiveIntensity = .15 + merge * .5; break; }
  }
}
function prepBeat(i) { const run = RUNS[ri]; bi = Math.max(0, Math.min(run.beats.length - 1, i)); resetWorld(run); for (let j = 0; j < bi; j++) run.beats[j].ops.forEach((op) => applyOp(op, 1, false)); }
function play(i) { atEnd = false; prepBeat(i); prog = 0; animating = true; renderGuide(); userAt = -1e9; }
function show(i) { atEnd = false; prepBeat(i); prog = 1; animating = false; RUNS[ri].beats[bi].ops.forEach((op) => applyOp(op, 1, true)); renderGuide(); userAt = -1e9; }
function startRun(i) { ri = i; $("runName").textContent = RUNS[ri].title; play(0); }
function next() { const run = RUNS[ri]; if (atEnd) { if (ri < RUNS.length - 1) startRun(ri + 1); else openRuns(); return; } if (bi < run.beats.length - 1) play(bi + 1); else { atEnd = true; renderGuide(); } }
function back() { if (atEnd) { atEnd = false; show(bi); return; } if (bi > 0) show(bi - 1); }

/* ---------- guided caption ---------- */
function renderGuide() {
  const g = $("guide"), run = RUNS[ri]; g.hidden = false; const n = run.beats.length;
  if (atEnd) {
    g.innerHTML = `<div class="meta">${esc(run.title)} · what this run proved</div><ul class="proved">${run.proved.map(([ok, t]) => `<li class="${ok === false ? "no" : ok ? "" : "bad"}">${esc(t)}</li>`).join("")}</ul>
      <div class="acts"><button class="btn" id="gBack">Back</button><span class="spacer"></span><button class="btn go" id="gNext">${ri < RUNS.length - 1 ? "Next run: " + esc(RUNS[ri + 1].title) : "Pick a run"}</button></div>`;
  } else {
    const b = run.beats[bi];
    g.innerHTML = `<div class="dots">${run.beats.map((_, i) => `<i class="${i <= bi ? "on" : ""}"></i>`).join("")}</div>
      <div class="meta">${stChip(b.station, b.chip)}<span>Step ${bi + 1} of ${n}</span>${b.t ? `<span>· ${esc(fmtT(b.t).slice(11, 19))}${b.tApprox ? " approx." : ""}</span>` : ""}</div>
      <h2>${esc(b.title)}</h2>${b.verdict && prog >= 1 ? `<span class="verdict ${b.verdict[0]}">${esc(b.verdict[1])}</span>` : ""}<p>${esc(b.line)}</p>
      <div class="acts"><button class="btn" id="gBack" ${bi === 0 ? "disabled" : ""}>Back</button><button class="link" id="gRec">See the record</button><span class="spacer"></span><button class="btn go" id="gNext">${bi === n - 1 ? "Finish" : "Next"}</button></div>`;
    $("gRec").onclick = () => { $("recTitle").textContent = b.title; $("recDetail").textContent = b.detail || b.line; $("recSrc").textContent = "Source: " + b.source + (b.t ? " · " + fmtT(b.t) : ""); $("recRaw").textContent = JSON.stringify(b.raw, null, 2); $("recordSheet").hidden = false; };
  }
  $("gNext").onclick = next; $("gBack").onclick = back;
}
addEventListener("keydown", (e) => { if (e.target.closest("textarea,input,button") || document.querySelector(".sheet:not([hidden])")) return; if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); next(); } if (e.key === "ArrowLeft") back(); });

/* ---------- menu, sheets, intro ---------- */
const menu = $("menu"); $("menuBtn").onclick = () => { menu.hidden = !menu.hidden; $("menuBtn").setAttribute("aria-expanded", String(!menu.hidden)); };
addEventListener("pointerdown", (e) => { if (!menu.hidden && !e.target.closest("#menu,#menuBtn")) menu.hidden = true; });
menu.addEventListener("click", (e) => { const a = e.target.closest("button")?.dataset.act; if (!a) return; menu.hidden = true;
  if (a === "runs") openRuns(); if (a === "add") { $("addSheet").hidden = false; $("addMsg").textContent = ""; } if (a === "agents") openAgents(); if (a === "intro") openIntro(0);
  if (a === "auto") { auto = !auto; $("autoState").textContent = auto ? "on" : "off"; } });
$("runChip").onclick = openRuns;
document.querySelectorAll("[data-close]").forEach((b) => (b.onclick = () => (b.closest(".sheet").hidden = true)));
document.querySelectorAll(".sheet").forEach((s) => s.addEventListener("click", (e) => { if (e.target === s && s.id !== "intro") s.hidden = true; }));
function runCard(r, i) { return `<button class="run" data-i="${i}"><b>${esc(r.title)}</b><small>${esc(r.meta)}</small><span class="verdict ${r.verdict[0]}">${esc(r.verdict[1])}</span></button>`; }
function openRuns() { $("runList").innerHTML = RUNS.map(runCard).join(""); $("runsSheet").hidden = false; }
$("runList").addEventListener("click", (e) => { const b = e.target.closest(".run"); if (b) { $("runsSheet").hidden = true; startRun(+b.dataset.i); } });
let introOn = true;
function openIntro(step) {
  introOn = true; const s = $("intro"); s.hidden = false; const body = $("introBody"); $("guide").hidden = true;
  const dots = (k) => `<div class="dots" style="max-width:90px">${[0, 1, 2].map((i) => `<i class="${i <= k ? "on" : ""}"></i>`).join("")}</div>`;
  if (step === 0) body.innerHTML = `${dots(0)}<h3>Watch AI agents do real work, and see the proof.</h3><p>Every robot is an AI agent. Every step you will see comes from a real record, and your browser checks it again while you watch.</p><div class="row" style="justify-content:flex-end"><button class="btn go" id="iNext">Show me how</button></div>`;
  if (step === 1) body.innerHTML = `${dots(1)}<h3>Every job passes six stations</h3><div class="stations">${Object.keys(ST).map((k) => `<div class="stn">${stChip(k)}<small>${esc(ST[k].hint)}</small></div>`).join("")}</div><div class="row" style="justify-content:space-between"><button class="btn" id="iBack">Back</button><button class="btn go" id="iNext">Next</button></div>`;
  if (step === 2) body.innerHTML = `${dots(2)}<h3>Pick a run to replay</h3><p>Start with the first one. You move forward one step at a time.</p><div class="runs">${RUNS.map(runCard).join("")}</div><div class="row"><button class="btn" id="iBack">Back</button></div>`;
  $("iNext") && ($("iNext").onclick = () => openIntro(step + 1)); $("iBack") && ($("iBack").onclick = () => openIntro(step - 1));
  body.querySelectorAll(".run").forEach((b) => (b.onclick = () => { s.hidden = true; introOn = false; startRun(+b.dataset.i); }));
  Object.values(STLAB).forEach((L) => (L.show = true));
}

/* ---------- agent customization ---------- */
let db = null, assets = null, canEdit = false; const CUSTOM = {};
const loadImg = (url) => new Promise((res, rej) => { const im = new Image(); im.crossOrigin = "anonymous"; im.onload = () => res(im); im.onerror = rej; im.src = url; });
async function applyCustom(id) { const r = ROBOTS[id], c = CUSTOM[id]; if (!r) return; r.setColor(c?.color || r.def.color); r.logoImg = null; if (c?.logo) { try { r.logoImg = await loadImg(c.logo); } catch {} } chestDraw(r); renderAgentRows(); }
const toHex = (c) => "#" + new THREE.Color(c).getHexString();
function renderAgentRows() { if ($("agentsSheet").hidden) return;
  $("agentRows").innerHTML = Object.entries(ROBOTS).map(([id, r]) => `<div class="agentrow" data-id="${id}"><div class="av" style="background-color:${esc(r.color)};${CUSTOM[id]?.logo ? `background-image:url('${esc(CUSTOM[id].logo)}')` : ""}">${CUSTOM[id]?.logo ? "" : esc(r.def.mono)}</div><div><b>${esc(r.def.name)}</b><small>${esc(r.def.role)}</small></div><input type="color" aria-label="${esc(r.def.name)} color" value="${toHex(r.color)}"><label class="file">Logo<input type="file" accept="image/*"></label></div>`).join(""); }
function openAgents() { $("agentsSheet").hidden = false; $("agentsNote").textContent = canEdit ? "Give each robot its owner's logo and one color. It saves for everyone who opens this town." : "Try a logo and a color here. To keep them, set color and logo for the agent in data/agents.json."; renderAgentRows(); }
$("agentRows").addEventListener("change", async (e) => { const row = e.target.closest(".agentrow"); if (!row) return; const id = row.dataset.id, cur = { ...(CUSTOM[id] || {}) };
  if (e.target.type === "color") cur.color = e.target.value;
  if (e.target.type === "file" && e.target.files[0]) { const f = e.target.files[0]; if (canEdit && assets) { try { const a = await assets.upload(f); cur.logo = a.url; cur.logoId = a.id; } catch (err) { $("agentsNote").textContent = "Upload failed: " + (err.code || "error"); cur.logo = URL.createObjectURL(f); } } else cur.logo = URL.createObjectURL(f); }
  CUSTOM[id] = cur; await applyCustom(id);
  if (canEdit && db) { try { await db.doc("agents/" + id).set({ color: cur.color || null, logo: cur.logo?.startsWith("blob:") ? null : cur.logo || null, logoId: cur.logoId || null }); $("agentsNote").textContent = "Saved " + ROBOTS[id].def.name + "."; } catch (err) { $("agentsNote").textContent = "Could not save: " + (err.code || "error"); } } });

/* ---------- add your own proof ---------- */
$("addFile").onchange = async (e) => { const f = e.target.files[0]; if (f) $("addText").value = await f.text(); };
$("addGo").onclick = async () => { const msg = $("addMsg"); msg.className = "msg"; let o; try { o = JSON.parse($("addText").value); } catch (err) { msg.className = "msg err"; msg.textContent = "That is not valid JSON."; return; }
  try { const made = await fromAny(o, { title: undefined }); if (!made.length) throw new Error("This file has no proof shape the town knows yet. Open \"What can I paste?\"."); made.forEach((r) => RUNS.push(r)); $("addSheet").hidden = true; startRun(RUNS.length - made.length); }
  catch (err) { msg.className = "msg err"; msg.textContent = err.message; } };
/* ---------- loop ---------- */
const clock = new THREE.Clock(), camTarget = new THREE.Vector3(), tmp = new THREE.Vector3(); let autoWait = 0;
function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.fov = w < 600 ? 52 : 38; camera.setViewOffset(w, h, 0, Math.round(h * (w < 600 ? .2 : .13)), w, h); camera.updateProjectionMatrix(); }
addEventListener("resize", resize); resize();
function frame() {
  const dt = Math.min(clock.getDelta(), .05), t = clock.elapsedTime; const run = RUNS[ri];
  Object.values(ROBOTS).forEach((r) => (r.walking = false));
  let focusKey = "center", actors = null, stKey = null;
  if (run && !introOn) { const b = run.beats[bi];
    if (animating) { prog += dt / (b.dur || 3.4); if (prog >= 1) { prog = 1; animating = false; renderGuide(); autoWait = 1.6; } }
    else if (auto && !atEnd) { autoWait -= dt; if (autoWait <= 0) next(); }
    b.ops.forEach((op) => applyOp(op, prog, true)); focusKey = b.focus; actors = b.actors; stKey = b.station; }
  const f = pos(focusKey) || PL.center; camTarget.set(f[0], .6, f[1]);
  ring.position.set(f[0], .05, f[1]); ring.visible = !introOn && !!run; if (stKey) ring.material.color.set(ST[stKey].c); ring.scale.setScalar(1 + (REDUCED ? 0 : Math.sin(t * 3) * .05));
  Object.entries(ROBOTS).forEach(([id, r]) => (r.tag.show = introOn || !actors || actors.includes(id)));
  Object.entries(STLAB).forEach(([k, L]) => (L.show = introOn || k === stKey));
  Object.values(ROBOTS).forEach((r) => { const w = r.walking; r.body.position.y = REDUCED ? 0 : w ? Math.abs(Math.sin(t * 9 + r.phase)) * .12 : Math.sin(t * 2 + r.phase) * .03; r.head.rotation.z = REDUCED ? 0 : Math.sin(t * 1.3 + r.phase) * .05; });
  Object.values(COINS).forEach((k) => (k.g.rotation.y += dt * 3)); orb.rotation.y += dt * 1.4; orb.pts.rotation.y -= dt * 2.4; orb.pts.rotation.x += dt * .7; orb.core.scale.setScalar(1 + Math.sin(t * 6) * .12);
  if (bubbleEl && bubbleEl._r) { bubbleEl._r.headAnchor.getWorldPosition(tmpV); tmpV.project(camera); bubbleEl.style.left = ((tmpV.x + 1) / 2 * innerWidth) + "px"; bubbleEl.style.top = ((1 - tmpV.y) / 2 * innerHeight) + "px"; }
  if (introOn && !REDUCED && performance.now() - userAt > 3500) { tmp.copy(camera.position).sub(controls.target).applyAxisAngle(new THREE.Vector3(0, 1, 0), dt * .06); camera.position.copy(controls.target).add(tmp); }
  if (performance.now() - userAt > 4000) { const k = REDUCED ? 1 : 1 - Math.pow(.03, dt); tmp.subVectors(camTarget, controls.target).multiplyScalar(k); controls.target.add(tmp); camera.position.add(tmp);
    const want = introOn ? 25 : innerWidth < 600 ? 17 : 18.5; const d = camera.position.distanceTo(controls.target); tmp.subVectors(camera.position, controls.target).setLength(d + (want - d) * k * .5); camera.position.copy(controls.target).add(tmp); }
  controls.update(); renderer.render(scene, camera); placeLabels(); requestAnimationFrame(frame);
}

/* ---------- boot ---------- */
(async () => {
  const only = new URLSearchParams(location.search).get("run");
  const manifest = await getJSON("manifest.json"); const entries = only ? [{ file: only }] : manifest.runs;
  for (const [i, entry] of entries.entries()) { try { (await fromAny(await getJSON(entry.file), { id: "m" + i, ...entry })).forEach((r) => RUNS.push(r)); } catch (err) { console.error("Could not load run", entry.file, err); } }
  AGENTS.forEach((a) => { if (a.logo) { CUSTOM[a.id] = { logo: new URL(a.logo, DATA).href }; applyCustom(a.id); } });
  if (!RUNS.length) { $("loading").textContent = "No runs loaded. Check data/manifest.json and the browser console."; return; }
  document.fonts?.ready.then(() => { Object.values(ROBOTS).forEach(chestDraw); boardKey = ""; drawBoard(RUNS[ri].startSnap); });
  resetWorld(RUNS[0]); $("loading").remove(); openIntro(0); requestAnimationFrame(frame);
  try { db = await window.claude?.use?.("db"); assets = await window.claude?.use?.("assets"); const user = await window.claude?.use?.("user"); canEdit = !!(user && (await user.canEdit?.()));
    if (db) db.collection("agents").onSnapshot((snap) => snap.docs.forEach((d) => { const v = d.data(); if (!v) return; CUSTOM[d.id] = { color: v.color || undefined, logo: v.logo || undefined, logoId: v.logoId || undefined }; applyCustom(d.id); }), () => {}); } catch {}
})();

/* drop a JSON record anywhere to replay it */
addEventListener("dragover", (e) => e.preventDefault());
addEventListener("drop", async (e) => { e.preventDefault(); const f = e.dataTransfer?.files?.[0]; if (!f) return; try { const made = await fromAny(JSON.parse(await f.text()), { meta: "Dropped file: " + f.name }); if (!made.length) throw new Error("unknown shape"); made.forEach((r) => RUNS.push(r)); $("intro").hidden = true; introOn = false; startRun(RUNS.length - made.length); } catch (err) { alert("Could not read " + f.name + ": " + err.message); } });
