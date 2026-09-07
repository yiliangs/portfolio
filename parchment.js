// Parchment roll drawn as gold profile lines over a faint sheet, burned by a heat simulation (after
// text-rippling's BurnReveal): cursor heats the cells under it; past the kindling point a cell self-sustains
// and radiates to neighbours, so the front creeps on by itself. Burned cells are gone until the whole sheet
// has gone, then it slowly re-forms. mount(container) -> { setTilt(nx, ny, over), destroy() }.
import * as THREE from './vendor/three-0.160.0.module.min.js';

// ----- geometry -----
// k = unroll 0..1: the rolled fraction a shrinks and the turns unwind, so the sheet genuinely unrolls rather than fading flat
function profile(u, W, k = 0) {
  const a = 0.17 * (1 - k), r0 = 0.085 * (1 - 0.35 * k), turns = 1.35 * (1 - k);
  if (a < 0.003) return [-W / 2 + u * W, 0];
  if (u < a) { const t = (a - u) / a, th = t * turns * Math.PI * 2, r = r0 * (1 - 0.32 * t); const x0 = -W / 2 + a * W; return [x0 - Math.sin(th) * r, r - Math.cos(th) * r]; }
  if (u > 1 - a) { const t = (u - (1 - a)) / a, th = t * turns * Math.PI * 2, r = r0 * (1 - 0.32 * t); const x0 = W / 2 - a * W; return [x0 + Math.sin(th) * r, r - Math.cos(th) * r]; }
  return [-W / 2 + u * W, 0];
}
const sag = (u, v) => Math.sin(u * Math.PI) * 0.03 * Math.cos((v - 0.5) * Math.PI);
// k = unroll 0..1: 0 is the curled scroll, 1 a flat sheet (the curls straighten out, the sag settles)
function point(u, v, W, H, k = 0) { const [x, z] = profile(u, W, k); return [x, (v - 0.5) * H, z + sag(u, v) * (1 - 0.75 * k)]; }
function refill(geom, W, H, k) { const uv = geom.attributes.uv.array, p = geom.attributes.position.array; for (let i = 0, n = uv.length / 2; i < n; i++) { const q = point(uv[i * 2], uv[i * 2 + 1], W, H, k); p[i * 3] = q[0]; p[i * 3 + 1] = q[1]; p[i * 3 + 2] = q[2]; } geom.attributes.position.needsUpdate = true; geom.computeBoundingSphere(); }

function sheetGeometry(W, H, nu, nv) {
  const pos = [], uv = [], idx = [];
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) { const u = i / nu, v = j / nv; pos.push(...point(u, v, W, H)); uv.push(u, v); }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  return g;
}
// wireframe: outline at full weight, plus an iso-curve lattice (explicit u and v lines) at a lighter weight
function edgeGeometry(W, H, N, vLines, uLines) {
  const pos = [], uv = [], wt = [];
  const seg = (u0, v0, u1, v1, w) => { pos.push(...point(u0, v0, W, H), ...point(u1, v1, W, H)); uv.push(u0, v0, u1, v1); wt.push(w, w); };
  for (let i = 0; i < N; i++) { seg(i / N, 0, (i + 1) / N, 0, 1); seg(i / N, 1, (i + 1) / N, 1, 1); }
  const M = 24;
  for (let j = 0; j < M; j++) { seg(0, j / M, 0, (j + 1) / M, 1); seg(1, j / M, 1, (j + 1) / M, 1); }
  for (const v of vLines) for (let i = 0; i < N; i++) seg(i / N, v, (i + 1) / N, v, 0.45);
  for (const u of uLines) for (let j = 0; j < M; j++) seg(u, j / M, u, (j + 1) / M, 0.45);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('aW', new THREE.Float32BufferAttribute(wt, 1));
  return g;
}

// ----- heat field on a coarse uv grid, uploaded as a texture the shaders sample -----
const GW = 96, GH = 64; // sim grid; display upsamples with noise-jittered bilinear sampling
const HEAT = {
  glyphMin: 0.55,  // glyph glow intensity below which a glyph only warms the paper, never kindles it
  radius: 0.035,  // uv units — a glyph edge's ignition reach (tight: the char starts on the letterform)
  rate: 3.2,      // heat/s at a fully lit glyph edge
  smolderRate: 0.6,// heat/s self-burn past ignition; scales radiation. Sets how fast the front creeps
  reach: 1.8,       // cells — radiation reach
  ignite: 0.22,     // kindling point: below it warmth cools; at/above it self-sustains
  coolRate: 0.5,    // heat/s — sub-kindling cooling
  emberS: 1.0,      // seconds a burned cell keeps radiating (the ember)
  idleS: 1.2,       // seconds after the sheet is fully burned before the burn reverses
  rewind: 4.4,      // playback speed of the reversed burn (1 = the burn's own timing)
  unburnRate: 3.0,  // heat/s the un-burned cells lose as they cool back to paper
};

const FRAG_COMMON = `
  uniform sampler2D uHeat; uniform vec3 uGold; uniform float uHeal;
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
  float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
    return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
  float fbm(vec2 p){ return vnoise(p) * 0.5 + vnoise(p * 2.3 + 17.0) * 0.3 + vnoise(p * 5.1 + 43.0) * 0.2; }
  // bicubic-ish (smoothstep-weighted) interpolation of the coarse sim grid so the front is a continuous curve, not cells
  uniform vec2 uGrid;
  vec3 sampleSmooth(vec2 uv){
    vec2 p = uv * uGrid - 0.5; vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
    vec2 t = (i + 0.5) / uGrid, d = 1.0 / uGrid;
    vec3 a = texture2D(uHeat, t).rgb, b = texture2D(uHeat, t + vec2(d.x, 0.0)).rgb, c = texture2D(uHeat, t + vec2(0.0, d.y)).rgb, e = texture2D(uHeat, t + d).rgb;
    return mix(mix(a, b, f.x), mix(c, e, f.x), f.y);
  }
  // heat texture: r = heat 0..1, g = burned 0..1 (linearly sampled), b = ember 0..1 (fresh burn glow)
  // Real paper burns in bands: a wide amber scorch ahead of the front, a thin black char lip, a hair of orange ember
  // right at the lip, then nothing. The bands are displaced by multi-octave noise so the edge rags at several scales.
  vec4 shade(vec2 uv, float baseA){
    vec2 jit = (vec2(fbm(uv * vec2(18.0, 30.0)), fbm(uv * vec2(18.0, 30.0) + 31.0)) - 0.5) * vec2(0.02, 0.035);
    vec3 h = sampleSmooth(uv + jit);
    float rag = (fbm(uv * vec2(40.0, 70.0)) - 0.5);
    float f = h.r + rag * 0.12, ember = h.b; // r: continuous front field — heat, 1 once burned
    float burned = smoothstep(0.86, 0.9, f);            // gone
    float lip = smoothstep(0.62, 0.86, f) * (1.0 - burned); // thin black char at the torn edge
    float scorch = smoothstep(0.12, 0.62, f) * (1.0 - lip) * (1.0 - burned); // amber browning ahead
    vec3 amber = vec3(0.45, 0.24, 0.08), char = vec3(0.06, 0.05, 0.045), glow = vec3(1.0, 0.42, 0.08);
    vec3 col = mix(uGold, amber, scorch);
    col = mix(col, char, lip);
    col = mix(col, glow, clamp(ember * lip * 1.6 + ember * 0.25, 0.0, 1.0));
    float a = baseA * (1.0 - burned);
    a = max(a, scorch * baseA * 1.4);
    a = max(a, lip * 0.75);
    a = max(a, ember * lip * 0.95);
    return vec4(col, a);
  }
`;
const VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const VERT_W = `attribute float aW; varying vec2 vUv; varying float vW; void main(){ vUv = uv; vW = aW; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

export function mount(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); renderer.setClearColor(0x000000, 0);
  renderer.domElement.style.cssText = 'width:100%;height:100%;display:block;';
  container.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 200); camera.lookAt(0, 0, 0);

  const W = 2.9, H = 1.55;
  // the platform's iso-curve lattice: 3 × 4 square cells (cell = H/3), centred along the sheet; each cell carries a
  // column of 0–3 identical cubes, so the field reads as terraces rather than a scatter
  const ROWS = 3, COLS = 4, CELL = H / ROWS, LAT_W = CELL * COLS;
  const vLines = [1 / 3, 2 / 3], uLines = [0, 1, 2, 3, 4].map((c) => 0.5 + (c - COLS / 2) * CELL / W);
  const LEVELS = [[1, 0, 2, 1], [0, 3, 1, 0], [2, 1, 0, 1]];
  const halfTan = Math.tan((camera.fov / 2) * Math.PI / 180);
  let visH = 1, visW = 1; // world extents visible at z = 0
  const heat = new Float32Array(GW * GH), burnedAt = new Float32Array(GW * GH).fill(-1);
  // per-cell flammability: paper is not uniform, so the front runs ahead in some grain and lags in others
  const flam = new Float32Array(GW * GH); for (let k = 0; k < flam.length; k++) flam[k] = 0.55 + Math.random() * 0.9;
  const tex = new THREE.DataTexture(new Uint8Array(GW * GH * 4), GW, GH, THREE.RGBAFormat); tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.needsUpdate = true;
  const uniforms = { uHeat: { value: tex }, uGrid: { value: new THREE.Vector2(GW, GH) }, uGold: { value: new THREE.Color(0xb68235) }, uHeal: { value: 0 }, uSheetA: { value: 0.06 }, uIso: { value: 0 } };
  const common = { uniforms, transparent: true, depthWrite: false, side: THREE.DoubleSide, vertexShader: VERT };
  const sheetMat = new THREE.ShaderMaterial({ ...common, fragmentShader: FRAG_COMMON + `varying vec2 vUv; uniform float uSheetA; void main(){ vec4 c = shade(vUv, uSheetA); if (c.a < 0.002) discard; gl_FragColor = c; }` });
  const lineMat = new THREE.ShaderMaterial({ ...common, vertexShader: VERT_W, fragmentShader: FRAG_COMMON + `varying vec2 vUv; varying float vW; uniform float uIso; void main(){ float w = vW > 0.99 ? 1.0 : vW * uIso; vec4 c = shade(vUv, 0.62 * w); if (c.a < 0.002) discard; gl_FragColor = c; }` });
  const sheet = new THREE.Mesh(sheetGeometry(W, H, 110, 12), sheetMat);
  const wire = new THREE.LineSegments(edgeGeometry(W, H, 240, vLines, uLines), lineMat);
  const group = new THREE.Group(); group.add(sheet, wire); group.rotation.set(-0.12, 0, Math.PI / 2); scene.add(group);
  const GOLD = new THREE.Color(0xb68235), PAPER = new THREE.Color(0xf3f2f2);
  // ----- cubes: each cell is a column that cycles like a conveyor. Every few seconds the top cube dissolves, the cubes
  // below step up one pitch, and a fresh cube emerges through the platform at the bottom. Column heights never change.
  const cubes = [], columns = [], CS = CELL * 0.86; // one cube size for all
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const colH = LEVELS[r][c]; if (!colH) continue;
    const col = { colH, p: 0, advancing: false, wait: Math.random() * 0.5, stagger: (r * COLS + c) / (ROWS * COLS) * 0.6 + Math.random() * 0.2 };
    // random modular clearances between the cubes of a column: the stack reads taller without more cubes
    col.gap = [0]; for (let l = 1; l <= colH; l++) col.gap.push(col.gap[l - 1] + (Math.random() < 0.5 ? CELL * 0.55 : 0));
    columns.push(col);
    // colH + 1 slots: slot 0 is the cube waiting under the platform, slot colH the top cube about to dissolve
    for (let l = 0; l <= colH; l++) cubes.push({ x: -LAT_W / 2 + (c + 0.5) * CELL, y: -H / 2 + (r + 0.5) * CELL, s: CS, slot: l, col });
  }
  const ADVANCE_S = 1.6, EMERGE_S = ADVANCE_S, EMERGE_SPREAD = 1.8, EMERGE_HOLD = 0; // the first rise is an ordinary step at the ordinary cadence — it just starts without a hold
  let landedAt = -1; // sim time the platform finished unrolling
  const NC = cubes.length;
  // ----- dissolve = container + content. The top cube of a stepping column is a container (ink faces, paper outline)
  // holding content (a 3³ grid of faint paper voxels). The container is un-drawn: faces fade, then the twelve edges
  // retract one by one (top ring, verticals, base). The content evaporates: voxels drift straight up in voxel-sized
  // steps, top and exposed ones first, while the whole cloud fades to nothing.
  const VN = 3, VPC = VN * VN * VN, NVOX = columns.length * VPC;
  for (const col of columns) { const set = []; for (let xi = 0; xi < VN; xi++) for (let yi = 0; yi < VN; yi++) for (let zi = 0; zi < VN; zi++) {
    const outer = ((xi === 0 || xi === VN - 1) + (yi === 0 || yi === VN - 1) + (zi === VN - 1)) / 3;
    set.push({ xi, yi, zi, delay: 0.14 + (1 - zi / (VN - 1)) * 0.14 + (1 - outer) * 0.1 + Math.random() * 0.12 }); } col.vox = set; }
  const cubeFaces = new THREE.BufferGeometry(), cubeEdges = new THREE.BufferGeometry(), voxFaces = new THREE.BufferGeometry(), voxBody = new THREE.BufferGeometry(), dissFaces = new THREE.BufferGeometry();
  // a dissolving container's faces: drawn separately without depth write so the content shows through as they thin top-down
  dissFaces.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(columns.length * 24), 3));
  dissFaces.setAttribute('aA', new THREE.Float32BufferAttribute(new Float32Array(columns.length * 8), 1));
  cubeFaces.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(NC * 24), 3));
  cubeFaces.setAttribute('aA', new THREE.Float32BufferAttribute(new Float32Array(NC * 8).fill(1), 1));
  // edges own their endpoints (12 segments × 2 verts per cube) so a container can be un-drawn edge by edge
  cubeEdges.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(NC * 72), 3));
  // content voxels: ink bodies (8 corners) + strokes (12 edges × 2 verts, own endpoints)
  voxFaces.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(NVOX * 72), 3));
  voxFaces.setAttribute('aA', new THREE.Float32BufferAttribute(new Float32Array(NVOX * 24), 1));
  voxBody.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(NVOX * 24), 3));
  voxBody.setAttribute('aA', new THREE.Float32BufferAttribute(new Float32Array(NVOX * 8), 1));
  const E = [0,1,1,2,2,3,3,0,4,5,5,6,6,7,7,4,0,4,1,5,2,6,3,7];
  const UNDRAW = [4,5,6,7,8,9,10,11,0,1,2,3]; // edge retract order: top ring, verticals, base ring
  const F = [0,1,2, 0,2,3, 4,6,5, 4,7,6, 0,4,5, 0,5,1, 1,5,6, 1,6,2, 2,6,7, 2,7,3, 3,7,4, 3,4,0];
  { const fi = []; for (let i = 0; i < NC; i++) for (const f of F) fi.push(i * 8 + f); cubeFaces.setIndex(fi); }
  { const fi = []; for (let i = 0; i < NVOX; i++) for (const f of F) fi.push(i * 8 + f); voxBody.setIndex(fi); }
  { const fi = []; for (let i = 0; i < columns.length; i++) for (const f of F) fi.push(i * 8 + f); dissFaces.setIndex(fi); }
  // per-vertex alpha
  const alphaHook = (m) => { m.onBeforeCompile = (sh) => { sh.vertexShader = sh.vertexShader.replace('#include <common>', 'attribute float aA; varying float vA;\n#include <common>').replace('#include <begin_vertex>', '#include <begin_vertex>\nvA = aA;'); sh.fragmentShader = sh.fragmentShader.replace('#include <common>', 'varying float vA;\n#include <common>').replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vA;'); }; return m; };
  // cubes are clipped at the sheet plane, so they rise through the platform rather than from a point above it
  const clipPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0); renderer.localClippingEnabled = true;
  const cubeFaceMat = alphaHook(new THREE.MeshBasicMaterial({ color: 0x1a1918, transparent: true, opacity: 0.85, depthWrite: true, side: THREE.BackSide, clippingPlanes: [clipPlane] }));
  const cubeEdgeMat = new THREE.LineBasicMaterial({ color: PAPER, transparent: true, opacity: 0.7, clippingPlanes: [clipPlane] });
  // voxel strokes at half the container stroke's brightness; bodies in the same ink
  const voxMat = alphaHook(new THREE.LineBasicMaterial({ color: PAPER, transparent: true, opacity: 0.35, clippingPlanes: [clipPlane] }));
  // content bodies and dissolving container faces never write depth: they thin out rather than block what is behind them
  const voxBodyMat = alphaHook(new THREE.MeshBasicMaterial({ color: 0x1a1918, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.BackSide, clippingPlanes: [clipPlane] }));
  const dissMat = alphaHook(new THREE.MeshBasicMaterial({ color: 0x1a1918, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.BackSide, clippingPlanes: [clipPlane] }));
  const cubeMesh = new THREE.Mesh(cubeFaces, cubeFaceMat), cubeLines = new THREE.LineSegments(cubeEdges, cubeEdgeMat), voxMesh = new THREE.LineSegments(voxFaces, voxMat), voxBodyMesh = new THREE.Mesh(voxBody, voxBodyMat), dissMesh = new THREE.Mesh(dissFaces, dissMat);
  cubeMesh.visible = cubeLines.visible = voxMesh.visible = voxBodyMesh.visible = dissMesh.visible = false;
  // positions are rewritten every frame (hidden boxes parked far away), so never trust a once-computed bounding sphere
  cubeMesh.frustumCulled = cubeLines.frustumCulled = voxMesh.frustumCulled = voxBodyMesh.frustumCulled = dissMesh.frustumCulled = false;
  // ink bodies draw before strokes so strokes behind a body are hidden by its depth, not blended through it.
  // The cube index winding reads inside-out under this group transform, so the ink faces cull with BackSide
  cubeMesh.renderOrder = 0; voxBodyMesh.renderOrder = 1; voxMesh.renderOrder = 2; dissMesh.renderOrder = 3; cubeLines.renderOrder = 4;
  const CORNERS = [[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]];
  const ease = (x) => x * x * (3 - 2 * x);
  const goff = (col, L) => { const g = col.gap; if (!g) return 0; const i = Math.max(0, Math.min(g.length - 1, Math.floor(L))), j = Math.min(g.length - 1, i + 1), f = Math.max(0, Math.min(1, L - i)); return g[i] + (g[j] - g[i]) * f; };
  const cubicOut = (x) => 1 - Math.pow(1 - x, 3), cubicInOut = (x) => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  const VOX_TRAVEL = 0.5, VOX_RISE = CELL * 1.1; // a voxel's travel time as a fraction of the step; how far it rises before it is gone
  function stepCubes(dt, now) {
    const P = cubeFaces.attributes.position.array, PA = cubeFaces.attributes.aA.array, Q = cubeEdges.attributes.position.array, V = voxFaces.attributes.position.array, VA = voxFaces.attributes.aA.array, VB = voxBody.attributes.position.array, VBA = voxBody.attributes.aA.array, DF = dissFaces.attributes.position.array, DFA = dissFaces.attributes.aA.array, k = unroll;
    const hide = (i) => { for (let j = 0; j < 24; j++) P[i * 24 + j] = -9; for (let j = 0; j < 72; j++) Q[i * 72 + j] = -9; };
    const corners = (arr, i, cx0, cy0, cz0, hs) => { for (let j = 0; j < 8; j++) { const o = (i * 8 + j) * 3; arr[o] = cx0 + CORNERS[j][0] * hs; arr[o + 1] = cy0 + CORNERS[j][1] * hs; arr[o + 2] = cz0 + CORNERS[j][2] * hs; } };
    // container: faces at alpha fa; edge n drawn from its first corner out to fraction kk[n] of its length
    const box = (i, cx0, cy0, cz0, hs, fa, kk) => { corners(P, i, cx0, cy0, cz0, hs); for (let j = 0; j < 8; j++) PA[i * 8 + j] = fa; if (fa <= 0.01) for (let j = 0; j < 24; j++) P[i * 24 + j] = -9;
      for (let n = 0; n < 12; n++) { const e = UNDRAW[n], o = i * 72 + e * 6, kx = kk ? kk[n] : 1; if (kx <= 0.001) { for (let j = 0; j < 6; j++) Q[o + j] = -9; continue; }
        const a = E[e * 2], b = E[e * 2 + 1]; for (let c = 0; c < 3; c++) { const A = cx0 * (c === 0) + cy0 * (c === 1) + cz0 * (c === 2) + CORNERS[a][c] * hs, B = cx0 * (c === 0) + cy0 * (c === 1) + cz0 * (c === 2) + CORNERS[b][c] * hs; Q[o + c] = A; Q[o + 3 + c] = A + (B - A) * kx; } } };
    if (k > 0.5) { if (landedAt < 0) landedAt = t; } else landedAt = -1;
    const since = landedAt < 0 ? 0 : t - landedAt;
    let anyVisible = false;
    // column clocks run only once every column is up
    if (landedAt >= 0) for (const col of columns) {
      // a column's clock only starts once that column has finished rising
      if (since < EMERGE_HOLD + col.stagger / 0.8 * EMERGE_SPREAD + EMERGE_S) continue;
      if (col.advancing) { col.p += dt / ADVANCE_S; if (col.p >= 1) { col.p = 0; col.advancing = false; col.wait = 2.5 + Math.random() * 6; } }
      else { col.wait -= dt; if (col.wait <= 0) col.advancing = true; }
    }
    for (let j = 0; j < NVOX * 72; j++) V[j] = -9;
    for (let j = 0; j < NVOX * 24; j++) VB[j] = -9;
    for (let j = 0; j < columns.length * 24; j++) DF[j] = -9;
    // a content voxel: ink body + 12 strokes, both at alpha a
    const wirebox = (i, cx0, cy0, cz0, hs, a) => { corners(VB, i, cx0, cy0, cz0, hs); for (let j = 0; j < 8; j++) VBA[i * 8 + j] = a * a; for (let e = 0; e < 12; e++) { const ca = CORNERS[E[e * 2]], cb = CORNERS[E[e * 2 + 1]], o = i * 72 + e * 6; V[o] = cx0 + ca[0] * hs; V[o + 1] = cy0 + ca[1] * hs; V[o + 2] = cz0 + ca[2] * hs; V[o + 3] = cx0 + cb[0] * hs; V[o + 4] = cy0 + cb[1] * hs; V[o + 5] = cz0 + cb[2] * hs; VA[i * 24 + e * 2] = VA[i * 24 + e * 2 + 1] = a; } };
    const kk = [];
    for (let i = 0; i < NC; i++) {
      const q = cubes[i], col = q.col;
      const e = landedAt < 0 ? 0 : Math.max(0, Math.min(1, (since - EMERGE_HOLD - col.stagger / 0.8 * EMERGE_SPREAD) / EMERGE_S)), ee = cubicInOut(e);
      if (ee <= 0) { hide(i); continue; }
      anyVisible = true;
      const p = col.advancing ? cubicInOut(col.p) : 0;
      // the waiting cube under the sheet only exists while a step is in progress; while the column is still rising it
      // would otherwise crest the plane half-clipped
      if (q.slot === 0 && !col.advancing) { hide(i); continue; }
      // display level: slot 0 waits 1.5 pitches under the sheet and rises to level 0; slot l sits at level l−1 and steps up
      const L = q.slot === 0 ? -1.5 + 1.5 * p : q.slot - 1 + p;
      const top = q.slot === col.colH, d = top ? col.p : 0;
      const stack = col.colH * CELL + goff(col, col.colH);
      const hs = q.s * 0.5, lift = -(stack + GAP) * (1 - ee) + GAP;
      const cx0 = q.x, cy0 = q.y, cz0 = lift + L * CELL + goff(col, L) + hs;
      if (!top) { box(i, cx0, cy0, cz0, hs, 1, null); continue; }
      // container: once the step starts its faces move to the non-depth-writing dissolve mesh and thin out top to
      // bottom (top corners over 0–20%, bottom corners 12–32%), revealing the content beneath; edges retract over
      // 5%–65%, one after another
      const ep = Math.max(0, Math.min(1, (d - 0.05) / 0.6));
      for (let n = 0; n < 12; n++) kk[n] = cubicInOut(1 - Math.max(0, Math.min(1, (ep - n / 12 * 0.7) / 0.3)));
      box(i, cx0, cy0, cz0, hs, d > 0 ? 0 : 1, kk);
      const ci = columns.indexOf(col);
      if (d > 0) { const aTop = 1 - Math.min(1, d / 0.2), aBot = 1 - Math.max(0, Math.min(1, (d - 0.12) / 0.2)); if (aBot > 0.01) { corners(DF, ci, cx0, cy0, cz0, hs); for (let j = 0; j < 8; j++) DFA[ci * 8 + j] = CORNERS[j][2] > 0 ? aTop : aBot; } }
      // content: 3³ ink voxels, revealed as the container's faces go. Each leaves on its own cadence (top and exposed
      // first), accelerating upward and losing opacity along its travel until it is gone; nothing remains at the step's end
      if (!col.advancing || d <= 0) continue;
      // each voxel layer is revealed as the container thins past it, top layer first
      const vs = q.s / VN, hv = vs * 0.5, base = ci * VPC;
      for (let v = 0; v < VPC; v++) { const w = col.vox[v], pv = Math.max(0, Math.min(1, (d - w.delay) / VOX_TRAVEL)); if (pv >= 1) continue;
        const reveal = Math.max(0, Math.min(1, (d - (VN - 1 - w.zi) / (VN - 1) * 0.12) / 0.14)); if (reveal <= 0) continue;
        const rise = pv * pv * VOX_RISE, a = reveal * (1 - pv) * (1 - pv);
        wirebox(base + v, cx0 - hs + (w.xi + 0.5) * vs, cy0 - hs + (w.yi + 0.5) * vs, cz0 - hs + (w.zi + 0.5) * vs + rise, hv * 0.9, a); }
    }
    cubeFaces.attributes.position.needsUpdate = true; cubeFaces.attributes.aA.needsUpdate = true; cubeEdges.attributes.position.needsUpdate = true; voxFaces.attributes.position.needsUpdate = true; voxFaces.attributes.aA.needsUpdate = true; voxBody.attributes.position.needsUpdate = true; voxBody.attributes.aA.needsUpdate = true; dissFaces.attributes.position.needsUpdate = true; dissFaces.attributes.aA.needsUpdate = true;
    cubeMesh.visible = cubeLines.visible = voxMesh.visible = voxBodyMesh.visible = dissMesh.visible = anyVisible;
  }
  let unroll = 0, shownUnroll = -1; // 0 scroll standing behind the essay title; 1 flat platform lying beside the tooling title
  // the canvas covers the whole viewport and never resizes mid-flight (a WebGL resize clears the buffer, which is what
  // made the roll vanish while it travelled). The roll is placed in world space to match a viewport-px anchor box.
  let anchor = { x: 0, y: 0, w: 1, h: 1 }, ax = 0, ay = 0, as = 1;

  let over = false, tx = 0, ty = 0, cx = 0, cy = 0, raf, alive = true, last = performance.now(), t = 0;
  // drag orbit on the platform: turn (about the sheet normal) and elevation offsets, with inertia, decaying back home
  let dTurn = 0, dTilt = 0, vTurn = 0, vTilt = 0, dragging = false;
  let sources = []; // [{u, v, w}] glowing glyphs projected onto the roll; w = intensity 0..1
  let allGoneAt = -1, reversing = false, rewindT = 0;
  const px = tex.image.data;

  // reverse burn: the film runs backwards along the burn's own path. Every cell remembers when it ignited; rewindT
  // runs from the latest ignition back to the earliest, and a cell un-burns the moment the clock passes its ignition
  // time, so the front retraces exactly the route it took out and closes on the glyphs where it started.
  let rewindMul = 1; // 10 while the roll travels between registers: the burn is undone before it lands
  function stepUnburn(dt) {
    rewindT -= HEAT.rewind * rewindMul * dt;
    let any = false;
    for (let k = 0; k < GW * GH; k++) {
      if (burnedAt[k] >= 0) { any = true; if (burnedAt[k] > rewindT) { burnedAt[k] = -1; heat[k] = 0.999; } }
      else if (heat[k] > 0) { any = true; heat[k] = Math.max(0, heat[k] - HEAT.unburnRate * dt); }
    }
    if (!any) reversing = false;
  }
  function stepHeat(dt) {
    const R2 = HEAT.radius * HEAT.radius, reach = HEAT.reach | 0, reachSq = HEAT.reach * HEAT.reach;
    // radiators: burning (>= ignite) or fresh embers
    const rad = [];
    for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) { const k = j * GW + i; const burned = burnedAt[k] >= 0; if (burned ? t - burnedAt[k] < HEAT.emberS : heat[k] >= HEAT.ignite) rad.push(k); }
    const radGrid = new Set(rad);
    let remaining = 0;
    for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
      const k = j * GW + i; if (burnedAt[k] >= 0) continue; remaining++;
      let input = 0;
      // glowing glyphs are the heat: each lit glyph radiates into the sheet with its intensity; only the brightest
      // (past HEAT.glyphMin) can actually kindle paper, dimmer ones merely warm it
      for (let s = 0; s < sources.length; s++) { const g = sources[s]; const du = (i + 0.5) / GW - g.u, dv = (j + 0.5) / GH - g.v; const d2 = du * du * 3.5 + dv * dv; if (d2 < R2) { const prox = 1 - Math.sqrt(d2) / HEAT.radius; input += HEAT.rate * g.w * g.w * prox * prox * dt; } }
      if (rad.length) {
        let s = 0;
        for (let gy = -reach; gy <= reach; gy++) for (let gx = -reach; gx <= reach; gx++) { const ii = i + gx, jj = j + gy; if (ii < 0 || jj < 0 || ii >= GW || jj >= GH || (gx === 0 && gy === 0)) continue; const kk = jj * GW + ii; if (!radGrid.has(kk)) continue; const d2 = gx * gx + gy * gy; if (d2 > reachSq) continue; s += 1 - Math.sqrt(d2) / HEAT.reach; }
        if (s > 0) input += HEAT.smolderRate * Math.min(s, 2.2) * dt;
      }
      if (heat[k] >= HEAT.ignite) input += HEAT.smolderRate * dt;
      input *= flam[k];
      if (input > 0) { heat[k] += input; if (heat[k] >= 1) { heat[k] = 1; burnedAt[k] = t; } }
      else if (heat[k] > 0) { heat[k] = Math.max(0, heat[k] - HEAT.coolRate * dt); }
    }
    if (remaining === 0 && allGoneAt < 0) allGoneAt = t;
  }
  function uploadHeat() {
    for (let k = 0; k < GW * GH; k++) { const b = burnedAt[k] >= 0; const ember = b ? Math.max(0, 1 - (t - burnedAt[k]) / HEAT.emberS) : 0; const o = k * 4; px[o] = (b ? 1 : heat[k]) * 255; px[o + 1] = b ? 255 : 0; px[o + 2] = ember * ember * 255; px[o + 3] = 255; }
    tex.needsUpdate = true;
  }
  // the roll stands on end (rotated 90°), so its length W runs down the container; back the camera off until the
  // whole profile — both curls included — fits with a margin, whatever the container's aspect
  let vw = 1, vh = 1;
  // axonometric (dimetric) view: the sheet turned 30° in plane and seen from a 42° elevation, so the top faces stay
  // rectangular and the three visible faces of a cube read at three different weights instead of the isometric hexagon
  // home pose: a low axonometric — 22° elevation, 20° turn — so the cubes read tall and the platform stays a thin ground
  const ISO_TILT = -(Math.PI / 2 - 22 * Math.PI / 180), ISO_TURN = 20 * Math.PI / 180;
  const MAX_STACK = columns.reduce((m, c) => Math.max(m, c.colH * CELL + c.gap[c.colH]), 0);
  const GAP = CS * 0.4; // clearance between the platform and the seated columns — nothing ever touches the sheet
  const fit = () => {
    // world position + scale so the (rotated, possibly flat) sheet fills the anchor box on screen
    const k = unroll, rz = Math.PI / 2 * (1 - k) + ISO_TURN * k, tilt = -0.12 * (1 - k) + ISO_TILT * k;
    const s = Math.abs(Math.sin(rz)), c = Math.abs(Math.cos(rz));
    const ex = W * c + H * s, ey = (W * s + H * c) * Math.abs(Math.cos(tilt)) + (MAX_STACK + GAP) * Math.abs(Math.sin(tilt)) * k, pxw = visW / vw;
    as = Math.min(anchor.w * pxw / (ex * 1.08), anchor.h * pxw / (ey * 1.08));
    ax = (anchor.x + anchor.w / 2 - vw / 2) * pxw; ay = -(anchor.y + anchor.h / 2 - vh / 2) * pxw;
    ay -= 0.5 * (MAX_STACK + GAP) * Math.abs(Math.sin(tilt)) * k * as;
  };
  const VIS_H = 2 * 6 * halfTan;
  // the scroll is seen in perspective; the platform in parallel projection (an axonometric plane): the fov closes toward
  // 3° as the sheet unrolls while the camera backs off to keep the same visible height
  const project = () => {
    const fov = 28 * (1 - unroll) + 3 * unroll, ht = Math.tan(fov / 2 * Math.PI / 180), d = VIS_H / (2 * ht);
    camera.fov = fov; camera.position.set(0, 0, d); camera.lookAt(0, 0, 0); camera.updateProjectionMatrix();
    visH = VIS_H; visW = visH * camera.aspect;
  };
  const resize = () => { vw = container.clientWidth || 1; vh = container.clientHeight || 1; renderer.setSize(vw, vh, false); camera.aspect = vw / vh; project(); fit(); };
  const ro = new ResizeObserver(resize); ro.observe(container); resize();
  group.add(cubeMesh, cubeLines, voxBodyMesh, voxMesh, dissMesh);
  const tick = (now) => {
    if (!alive) return; raf = requestAnimationFrame(tick);
    const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
    // once lit, the sheet burns to completion whether or not the glyphs stay hot; only a fully burned sheet rewinds
    if (!reversing && allGoneAt >= 0 && t - allGoneAt > HEAT.idleS) { reversing = true; rewindT = -1; for (let k = 0; k < GW * GH; k++) if (burnedAt[k] > rewindT) rewindT = burnedAt[k]; }
    if (reversing) { stepUnburn(dt); if (!reversing) { allGoneAt = -1; rewindMul = 1; } } else stepHeat(dt);
    uploadHeat();
    cx += (tx - cx) * 0.06; cy += (ty - cy) * 0.06;
    if (unroll !== shownUnroll) { shownUnroll = unroll; refill(sheet.geometry, W, H, unroll); refill(wire.geometry, W, H, unroll); uniforms.uGold.value.lerpColors(GOLD, PAPER, unroll); uniforms.uSheetA.value = 0.06 + 0.08 * unroll; uniforms.uIso.value = Math.max(0, (unroll - 0.3) / 0.7); project(); }
    fit();
    const k = unroll, flat = 1 - k;
    group.scale.setScalar(as);
    // let go: inertia carries on briefly, then the platform parks wherever it landed
    // drag spins only about the sheet normal (the vertical axis); elevation stays at the home pose
    if (!dragging) { const d = Math.exp(-2.5 * dt); vTurn *= d; dTurn += vTurn * dt; }
    dTilt = 0;
    // the platform never follows the cursor — only drag turns it; the standing roll keeps its cursor tilt
    const cxe = dragging ? 0 : cx * flat, cye = dragging ? 0 : cy * flat;
    group.rotation.z = Math.PI / 2 * flat + (ISO_TURN + dTurn) * k;
    group.rotation.y = cxe * (0.9 - 0.75 * k) + Math.sin(now / 4200) * 0.03 * flat;
    group.rotation.x = -0.12 * flat + ISO_TILT * k + cye * (0.6 - 0.5 * k) + Math.cos(now / 5100) * 0.02 * flat;
    group.position.x = ax - cxe * (0.3 - 0.2 * k) * as; group.position.y = ay + (-cye * (0.2 - 0.14 * k) + Math.sin(now / 3600) * 0.012) * as;
    stepCubes(dt, now);
    group.updateMatrixWorld(); { const n = new THREE.Vector3(0, 0, 1).transformDirection(group.matrixWorld); clipPlane.setFromNormalAndCoplanarPoint(n, group.position.clone().addScaledVector(n, 0.004 * as)); }
    renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(tick);
  return {
    setTilt(nx, ny, isOver) { tx = Math.max(-0.6, Math.min(0.6, nx)); ty = Math.max(-0.6, Math.min(0.6, ny)); over = !!isOver; },
    setCursor() {},
    // drag on the platform: dx/dy in px since the last event
    dragStart() { dragging = true; vTurn = vTilt = 0; },
    drag(dx, dy) { if (!dragging) return; const kT = 0.008; dTurn += dx * kT; vTurn = dx * kT * 12; },
    dragEnd() { dragging = false; },
    isPlatform() { return unroll > 0.95; },
    // the platform's sheet size, column head-room and pose — so the home cube can land as this exact plate
    platformFrame() { return { W, H, stack: MAX_STACK + GAP, tilt: ISO_TILT, turn: ISO_TURN }; },
    // glyphs: [{x, y, w}] with x,y in container fractions (0..1) and w the glyph's glow intensity 0..1.
    // container -> world at z≈0 -> the roll's local frame (rotated +90° about z: local x = world y, local y = -world x) -> uv
    setSources(glyphs) {
      sources = [];
      if (reversing) return;
      for (const g of glyphs) {
        if (g.w < HEAT.glyphMin) continue;
        const wx = ((g.x - 0.5) * visW - group.position.x) / as, wy = ((0.5 - g.y) * visH - group.position.y) / as;
        const rz = group.rotation.z, lx = wx * Math.cos(rz) + wy * Math.sin(rz), ly = -wx * Math.sin(rz) + wy * Math.cos(rz);
        const u = 0.5 + lx / W, v = 0.5 + ly / H;
        if (u < -0.05 || u > 1.05 || v < -0.05 || v > 1.05) continue;
        sources.push({ u, v, w: (g.w - HEAT.glyphMin) / (1 - HEAT.glyphMin) });
      }
      // many nearby points would stack heat; normalise so a fully lit glyph outline burns at ~rate
      if (sources.length > 24) { const k = 24 / sources.length; for (const s of sources) s.w *= Math.sqrt(k); }
    },
    setUnroll(k) { unroll = Math.max(0, Math.min(1, k)); },
    // a register change: whatever state the burn is in, rewind it at 10x so the roll arrives unburned
    quench() { sources = []; let any = false; for (let k = 0; k < GW * GH; k++) if (burnedAt[k] >= 0 || heat[k] > 0) { any = true; break; } if (!any) return; if (!reversing) { reversing = true; rewindT = -1; for (let k = 0; k < GW * GH; k++) if (burnedAt[k] > rewindT) rewindT = burnedAt[k]; if (rewindT < 0) rewindT = t; } rewindMul = 10; },
    // viewport-px box the roll should occupy
    setAnchor(a) { anchor = a; },
    destroy() { alive = false; cancelAnimationFrame(raf); ro.disconnect(); [sheet, wire, cubeMesh, cubeLines, voxMesh, voxBodyMesh, dissMesh].forEach((m) => { m.geometry.dispose(); m.material.dispose(); }); tex.dispose(); renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove(); },
  };
}
