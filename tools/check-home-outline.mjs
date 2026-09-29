// Checks the on-screen outlines the two home objects report of themselves.
//
// The tesseract (home.js) and the scroll (parchment.js) each answer outline(out) with the points of their current
// silhouette in viewport px, so something drawn around them can follow the shape the reader actually sees rather
// than the anchor box it was placed in. The api methods only compose the camera and the object's world matrix and
// decide when there is nothing to show; the geometry is in two pure functions, hyperOutline and sheetOutline, which
// is what this steps through without a renderer.
//
// For the tesseract: all 16 vertices come back, every one lands inside the anchor box the cube is fitted to (allowed
// 1.6 times its size, since the fit is taken on the orthographic footprint and the view is in perspective), and the
// points move as the figure turns in the fourth dimension, which is the whole reason to read them every frame.
//
// For the scroll: the edge of the sheet comes back as a closed ring of more than 40 points, finite and spanning a
// real box, at several points of the resting motion; turning the sheet moves the ring; and an unrolled sheet
// (k > 0.5, the platform) reports nothing, since it is no longer the scroll standing on the home page.
import * as THREE from '../vendor/three-0.160.0.module.min.js';

const failures = [];
const fail = (msg) => failures.push(msg);

const home = await import('../home.js');
const parchment = await import('../parchment.js');
if (typeof home.hyperOutline !== 'function') fail('home.js exports no hyperOutline(matrix, vw, vh, out)');
if (typeof parchment.sheetOutline !== 'function') fail('parchment.js exports no sheetOutline(k, t, matrix, vw, vh, out)');
if (failures.length) {
  for (const f of failures) console.error('  ' + f);
  console.error('check-home-outline: FAILED, ' + failures.length + ' problem(s)');
  process.exit(1);
}
const { hypercube, cubePose, hyperOutline } = home;
const { sheetOutline } = parchment;

// the page's own camera: fov 24 at the distance home.js's project(0) puts it, on a 1440 x 900 viewport
const VW = 1440, VH = 900;
const camera = new THREE.PerspectiveCamera(24, VW / VH, 0.1, 200);
const VIS_H = 2 * 6 * Math.tan(12 * Math.PI / 180);
camera.position.set(0, 0, VIS_H / (2 * Math.tan(12 * Math.PI / 180)));
camera.lookAt(0, 0, 0); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
const view = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
const pxw = VIS_H / VH; // world units per px at the origin's depth

// ----- the tesseract -----
// fitted the way home.js fit() fits it: the turned unit box's footprint, times 1.08, into a 300 px anchor box at the
// viewport's centre
const BOX = 300;
const q = cubePose(0, 0, 0, new THREE.Quaternion());
let mx = 0, my = 0;
for (const sx of [-0.5, 0.5]) for (const sy of [-0.5, 0.5]) for (const sz of [-0.5, 0.5]) {
  const c = new THREE.Vector3(sx, sy, sz).applyQuaternion(q);
  mx = Math.max(mx, Math.abs(c.x)); my = Math.max(my, Math.abs(c.y));
}
const as = Math.min(BOX * pxw / (2 * mx * 1.08), BOX * pxw / (2 * my * 1.08));
const cubeWorld = new THREE.Matrix4().compose(new THREE.Vector3(), q, new THREE.Vector3(as, as, as));
const cubeClip = new THREE.Matrix4().multiplyMatrices(view, cubeWorld);

const pos = new Float32Array(192), wt = new Float32Array(64), wpos = new Float32Array(864), wnd = new Float32Array(192);
const out = new Float32Array(512);
const HYPER_XW = 0.245, SLACK = 1.6;
const half = BOX * SLACK / 2;
const at = (sec) => {
  hypercube(HYPER_XW * sec, 0, 0, pos, wt, wpos, wnd);
  const n = hyperOutline(cubeClip, VW, VH, out);
  return { n, pts: Array.from(out.subarray(0, n * 2)) };
};
let worst = 0;
for (let sec = 0; sec <= 6.5; sec += 0.25) {
  const { n, pts } = at(sec);
  if (n !== 16) { fail('tesseract at ' + sec + ' s: ' + n + ' points, not 16'); continue; }
  for (let i = 0; i < n; i++) {
    const dx = Math.abs(pts[i * 2] - VW / 2), dy = Math.abs(pts[i * 2 + 1] - VH / 2);
    worst = Math.max(worst, dx, dy);
    if (!(dx <= half && dy <= half)) fail('tesseract at ' + sec + ' s: vertex ' + i + ' at (' + pts[i * 2].toFixed(1) + ', ' + pts[i * 2 + 1].toFixed(1) + ') outside the anchor box x' + SLACK);
  }
}
const a0 = at(0).pts, a2 = at(2).pts;
let hyperMove = 0;
for (let i = 0; i < 16; i++) hyperMove = Math.max(hyperMove, Math.hypot(a2[i * 2] - a0[i * 2], a2[i * 2 + 1] - a0[i * 2 + 1]));
if (!(hyperMove > 2)) fail('tesseract outline moved only ' + hyperMove.toFixed(2) + ' px over 2 s of turning');

// ----- the scroll -----
// the roll's standing pose (group.rotation (-0.12, 0, PI / 2)) at half a world unit per sheet unit, then the same
// turned 0.3 rad about y, the way the cursor tilts it
const sheetAt = (tiltY) => {
  const r = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.12, tiltY, Math.PI / 2));
  return new THREE.Matrix4().multiplyMatrices(view, new THREE.Matrix4().compose(new THREE.Vector3(), r, new THREE.Vector3(0.5, 0.5, 0.5)));
};
const still = sheetAt(0), tilted = sheetAt(0.3);
let ringN = 0, sheetMove = 0;
for (const t of [0, 3.7, 11.2]) {
  const n = sheetOutline(0, t, still, VW, VH, out);
  ringN = n;
  if (!(n > 40 && n <= 256)) { fail('scroll at t = ' + t + ': ' + n + ' points'); continue; }
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < n * 2; i++) if (!Number.isFinite(out[i])) { fail('scroll at t = ' + t + ': non-finite coordinate at ' + i); break; }
  for (let i = 0; i < n; i++) { x0 = Math.min(x0, out[i * 2]); x1 = Math.max(x1, out[i * 2]); y0 = Math.min(y0, out[i * 2 + 1]); y1 = Math.max(y1, out[i * 2 + 1]); }
  if (!(x1 - x0 > 10 && y1 - y0 > 10)) fail('scroll at t = ' + t + ': outline spans a degenerate ' + (x1 - x0).toFixed(1) + ' x ' + (y1 - y0).toFixed(1) + ' px box');
  const before = Array.from(out.subarray(0, n * 2));
  const m = sheetOutline(0, t, tilted, VW, VH, out);
  if (m !== n) { fail('scroll at t = ' + t + ': tilting changed the point count'); continue; }
  for (let i = 0; i < n; i++) sheetMove = Math.max(sheetMove, Math.hypot(out[i * 2] - before[i * 2], out[i * 2 + 1] - before[i * 2 + 1]));
}
if (!(sheetMove > 2)) fail('scroll outline moved only ' + sheetMove.toFixed(2) + ' px under a 0.3 rad tilt');
const flatN = sheetOutline(0.8, 0, still, VW, VH, out);
if (flatN !== 0) fail('an unrolled sheet (k = 0.8) reported ' + flatN + ' points, not 0');

if (failures.length) {
  for (const f of failures) console.error('  ' + f);
  console.error('check-home-outline: FAILED, ' + failures.length + ' problem(s)');
  process.exit(1);
}
console.log('check-home-outline: the tesseract reports its 16 vertices inside the anchor box (farthest ' + worst.toFixed(1) +
  ' px from centre, allowed ' + half.toFixed(0) + ') and they move up to ' + hyperMove.toFixed(1) + ' px over 2 s; the scroll ' +
  'reports a ring of ' + ringN + ' edge points at three times, moving up to ' + sheetMove.toFixed(1) + ' px under a tilt, and ' +
  'nothing once unrolled');
