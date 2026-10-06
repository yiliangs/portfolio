// The scene kit: what every home scene shares. A home scene is an animated drawing seen straight down, in one weight of
// ink line, that sits behind the home page's two objects (the Research scroll and the Development cube) and takes the
// page's pointer. Each object stands in the scene on a footprint: ground grown from the object's live outline on
// screen. A scene module brings its own world (what lives in it, how it moves, how it is drawn); this kit brings the
// browser shell round it and the pieces that are the same in every scene.
//
// ----- the contract -----
// A scene module, scenes/<name>.js, exports `scene`, the descriptor mountScene() takes:
//
//   export const scene = {
//     PARAMS,                               // the scene's tunables, by section: { section: { key: spec } }, where spec is
//                                           //   [default, min, max, step, label] or [value, 'toggle', label]. Spread
//                                           //   FOOTPRINT (the footprint's own five) and GROUND (the ground's resolution)
//                                           //   into a section: the kit reads those keys from the same params object.
//     palette: {                            // the scene's own colour; the kit holds none
//       light: [r, g, b],                   //   the ground tone a light page is taken toward
//       dark: [r, g, b],                    //   the ground tone a dark page is taken toward
//       depth: 'key',                       //   the PARAMS key giving how far (0..1), see tint()
//       accents: { name: css, ... },        //   fixed colours, passed to the draw calls by name in `colours`
//     },
//     createWorld(params, opts) -> world,   // opts { w, h, seed, coarse, reduced }. The world carries at least
//                                           //   seed (a uint32) and reduced (a boolean the shell rewrites when the
//                                           //   visitor's reduced-motion setting changes); everything else is the scene's.
//     resizeWorld(world, w, h),             // the page is now w x h CSS px
//     step(world, dt),                      // advance dt seconds; touches nothing but the world, so a seed fixes a run
//     setSources(world, boxes),             // the two objects' boxes, [{ x, y, w, h }], in page CSS px
//     setOutlines(world, fns),              // per object, fn(out) writes its outline as x, y pairs into the
//                                           //   Float32Array out and returns the point count (0: use its box)
//     setPointer(world, x, y, on),          // the cursor, every move; on false when it leaves
//     hit(world, x, y) -> index | -1,       // the object whose footprint holds (x, y), or -1 on open ground
//     drop(world, x, y),                    // a press on open ground that never moved (a touch tap)
//     strokeStart(world, x, y), strokeTo(world, x, y), strokeEnd(world), strokeCancel(world),
//                                           // a mouse or pen press-and-drag on open ground
//     clear(world),                         // empty the scene of what the visitor added
//     layer: {                              // the static layer: generated once, painted once, blitted every frame
//       key(world, params) -> string,       //   what the content depends on besides the page size
//       make(world, params, w, h) -> data,  //   generate it for a w x h page (a 200 ms pause after a resize first)
//       look(params) -> string,             //   what its paint depends on besides the colours
//       paint(ctx, data, params, colours),  //   draw it, over the ground tone the kit has filled
//     },
//     drawGround(ctx, world, colours, layer),   // opaque, covers the page; drawn at the ground's resolution.
//                                               //   layer: { img, w, h, flat }, the static layer's image drawn at w x h
//                                               //   CSS px and the flat ground tone under whatever it misses
//     drawLive(ctx, world, colours),        // over the ground, at full resolution: what moves
//   };
//
// ctx is always already scaled to CSS px. colours is { ink, paper, ...palette.accents }: ink and paper are the page's
// text and background, read off the layer's --color-text and --color-bg every second so a theme change reaches them.
// The shell calls the descriptor's functions through the object every frame, so a profiler may wrap them in place.
//
// What the kit gives a scene, beyond the shell: the seeded random source (rng, hashPoint, pointRand), PARAMS defaults
// (paramDefaults), angles (TAU, wrapAngle), the footprint and its reads (makeFootprint ... edgePath), pointer speed
// (pointer, pointTo, pointerSpeed), the press-and-drag stroke (strokeOpen, strokeAlong, strokeClose), the lattice of
// ink marks (latticeMarks, drawMarks), smooth curves (curveThrough), and colour (rgbOf, tint). Each is described where
// it is defined.
//
// mountScene(container, scene, host) -> { setSources, setOutlines, setPointer, hit, drop, strokeStart, strokeTo,
//   strokeEnd, strokeCancel, clear, destroy, params, PARAMS, name }
// host: { name, scenes: [names], pick(name) } from the page; with ?dev in the URL the shell opens the panel in
// scenes/dev.js, which tunes `params` live and lists `scenes` for pick().

// ----- parameters -----
export const paramDefaults = (PARAMS) => Object.fromEntries(Object.values(PARAMS).flatMap((section) => Object.entries(section).map(([k, v]) => [k, v[0]])));
// The footprint's own tunables, read by updateFootprint from the scene's params.
export const FOOTPRINT = {
  grow: [26, 0, 120, 1, 'ground beyond the object\'s silhouette, px'],
  rough: [0.25, 0, 0.6, 0.01, 'swell on the edge, share of the footprint\'s mean radius'],
  blur: [28, 2, 90, 1, 'how widely the silhouette is blurred round the edge, deg'],
  follow: [0.3, 0.02, 3, 0.01, 'time the edge takes to follow its object, s'],
  floor: [6, 0, 40, 1, 'least ground between the object and the edge, px'],
};
// The ground's resolution, read by the shell.
export const GROUND = {
  groundRes: [1.5, 1, 2, 0.25, 'resolution of the ground layer on a dense screen: 1 CSS px, 2 the full backing store'],
};

// ----- the seeded random source -----
// mulberry32: small, fast, and good enough for motion. A world owns one, so a run is fixed by its seed.
export function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
// A hash of an integer lattice point and a seed, for things that must depend on their position alone.
export const hashPoint = (x, y, s) => { let h = Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1) ^ s; h = Math.imul(h ^ (h >>> 15), 0x85ebca6b); h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35); return (h ^ (h >>> 16)) >>> 0; };
// a stream of numbers in [0, 1) from a hash (mulberry32)
export const pointRand = (h) => () => { h = (h + 0x6d2b79f5) | 0; let t = Math.imul(h ^ (h >>> 15), 1 | h); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

export const TAU = Math.PI * 2;
export const wrapAngle = (a) => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };

// ----- footprints -----
// A footprint is the ground round one of the home objects, shaped each frame from the object's silhouette as it stands
// on screen. It reads its object's outline points (or, when the object has nothing to show, its box's corners and edge
// midpoints) and, seen from a centre that eases toward their centroid, takes at each of BEARINGS bearings the distance
// out to the points' convex hull, so the profile moves only as fast as the object's own points do. That profile is
// widened a few bearings, blurred wide round the circle so no corner or edge of the object reads through, and grown by
// grow, with a broad cape blurred out over any narrow end the blur falls short of, and never let closer than floor px
// to the hull. The displayed profile S eases toward that target with time constant follow, so a turning object moves
// its edge without shimmer. On top of S lies a swell that only ever pushes outward: harmonics 2..9 weighted 1/k, each
// drifting round the edge at its own slow rate and breathing on its own slower cycle, stretched each frame to span
// rough times the footprint's mean radius. Phases and rates come from the footprint's index, so a footprint moves the
// same way across reloads; its clock is the world's, frozen under reduced motion.
// The edge is tabulated once a frame at the BEARINGS bearings (C) and read between them. This is the one representation
// of a footprint: containment, push-out, steering, the ground and its outline all read it. Anything else with a
// { x, y, C } (and, for calmEdge, S and calm) radius-per-bearing profile reads the same way.
// footprint: { i, x, y (its centre), box, S, C (Float32Array(BEARINGS)), mean, calm, ... }
export const BEARINGS = 96;
const SWELL = [2, 3, 4, 5, 6, 7, 8, 9], SWELL_W = (() => { const w = SWELL.map((k) => 1 / k), s = w.reduce((a, b) => a + b, 0); return w.map((v) => v / s); })();
const WIDEN = 2; // bins either side the hull is widened by before the blur
export function makeFootprint(i, box) {
  const r = rng(0x5eed + i * 7919), ph = SWELL.map(() => r() * TAU);
  const om = SWELL.map(() => (r() < 0.5 ? -1 : 1) * (0.03 + r() * 0.09)), br = SWELL.map(() => 0.02 + r() * 0.05);
  const o = { i, x: 0, y: 0, bx: 0, by: 0, dx: 0, dy: 0, S: new Float32Array(BEARINGS), C: new Float32Array(BEARINGS), mean: 0, ph, om, br, time: 0, fresh: true };
  placeFootprint(o, box); return o;
}
// moves a footprint onto a new box, keeping its shape and swell
export function placeFootprint(o, b) { o.box = b; o.bx = b.x + b.w / 2; o.by = b.y + b.h / 2; o.x = o.bx + o.dx; o.y = o.by + o.dy; }
// The footprints follow the boxes by index: a footprint keeps its shape and swell when its box moves, and a new one is
// shaped at once from outlines[i]. list is the scene's array of footprints, changed in place.
export function placeFootprints(list, outlines, boxes, p, reduced, time) {
  const bs = boxes || [];
  list.length = Math.min(list.length, bs.length);
  bs.forEach((b, i) => { if (list[i]) placeFootprint(list[i], b); else { const o = makeFootprint(i, b); updateFootprint(o, outlines[i], 0, p, reduced, time); list.push(o); } });
}
const OUT = new Float32Array(512), HULL = new Float32Array(BEARINGS), WIDE = new Float32Array(BEARINGS), BLUR = new Float32Array(BEARINGS), SW = new Float32Array(BEARINGS), CAPE = new Float32Array(BEARINGS);
let KERNEL = null, kernelFor = NaN;
// A normalised gaussian over bearings, deg wide (its standard deviation), cached for the last width asked.
export function kernel(deg) {
  if (deg === kernelFor) return KERNEL;
  const sg = Math.max(0.3, (deg / 360) * BEARINGS), half = Math.min(BEARINGS >> 1, Math.ceil(3 * sg)), k = new Float32Array(2 * half + 1);
  let s = 0; for (let j = -half; j <= half; j++) s += k[j + half] = Math.exp(-(j * j) / (2 * sg * sg));
  for (let j = 0; j < k.length; j++) k[j] /= s;
  kernelFor = deg; return (KERNEL = k);
}
// the box's corners and edge midpoints, as outline points
function boxPoints(b, out) {
  const x0 = b.x, y0 = b.y, x1 = b.x + b.w, y1 = b.y + b.h, xm = (x0 + x1) / 2, ym = (y0 + y1) / 2;
  const q = [x0, y0, xm, y0, x1, y0, x1, ym, x1, y1, xm, y1, x0, y1, x0, ym];
  for (let j = 0; j < 16; j++) out[j] = q[j];
  return 8;
}
// The convex hull of the n points in P (x, y pairs) into HX/HY, counter-clockwise; returns its vertex count.
const IDX = new Uint16Array(256), HX = new Float32Array(514), HY = new Float32Array(514);
const turn = (ax, ay, bx, by, cx, cy) => (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
function convexHull(P, n) {
  for (let i = 0; i < n; i++) {
    const v = i, x = P[2 * v], y = P[2 * v + 1]; let j = i - 1;
    while (j >= 0 && (P[2 * IDX[j]] > x || (P[2 * IDX[j]] === x && P[2 * IDX[j] + 1] > y))) { IDX[j + 1] = IDX[j]; j--; }
    IDX[j + 1] = v;
  }
  let k = 0;
  for (let i = 0; i < n; i++) {
    const x = P[2 * IDX[i]], y = P[2 * IDX[i] + 1];
    while (k >= 2 && turn(HX[k - 2], HY[k - 2], HX[k - 1], HY[k - 1], x, y) <= 0) k--;
    HX[k] = x; HY[k] = y; k++;
  }
  for (let i = n - 2, t = k + 1; i >= 0; i--) {
    const x = P[2 * IDX[i]], y = P[2 * IDX[i] + 1];
    while (k >= t && turn(HX[k - 2], HY[k - 2], HX[k - 1], HY[k - 1], x, y) <= 0) k--;
    HX[k] = x; HY[k] = y; k++;
  }
  return Math.max(1, k - 1); // the walk ends on its first point again
}
// How far the hull of m vertices reaches from (cx, cy) at bearing t: the farthest crossing of the ray with its edges,
// or, should the centre lag outside the hull, how far the hull reaches along the bearing.
function hullReach(cx, cy, t, m) {
  const ux = Math.cos(t), uy = Math.sin(t);
  let r = -1, h = 0;
  for (let i = 0; i < m; i++) {
    const ax = HX[i] - cx, ay = HY[i] - cy, j = (i + 1) % m, ex = HX[j] - HX[i], ey = HY[j] - HY[i];
    h = Math.max(h, ax * ux + ay * uy);
    const den = ux * ey - uy * ex;
    if (Math.abs(den) < 1e-9) continue;
    const s = (ax * uy - ay * ux) / den, d = (ax * ey - ay * ex) / den;
    if (s >= 0 && s <= 1 && d >= 0 && d > r) r = d;
  }
  return r >= 0 ? r : h;
}
// One frame of a footprint: its outline from fn (or its box), then centre, profile, easing and the tabulated edge.
// p is the scene's params, read for the FOOTPRINT keys.
export function updateFootprint(o, fn, dt, p, reduced, time) {
  let n = fn ? fn(OUT) | 0 : 0;
  if (n <= 0) n = boxPoints(o.box, OUT);
  n = Math.min(n, OUT.length >> 1);
  const tau = reduced ? Math.max(1.5, p.follow) : p.follow, e = o.fresh ? 1 : 1 - Math.exp(-dt / Math.max(1e-3, tau));
  let sx = 0, sy = 0; for (let j = 0; j < n; j++) { sx += OUT[2 * j]; sy += OUT[2 * j + 1]; }
  o.dx += (sx / n - o.bx - o.dx) * e; o.dy += (sy / n - o.by - o.dy) * e; o.x = o.bx + o.dx; o.y = o.by + o.dy;
  // the convex hull round the centre. Binning the points themselves by bearing notched the profile wherever an inner
  // point (a hypercube's near vertex) held a bearing alone and popped it back out when the point moved on, and the floor
  // below passes a pop straight to the edge; the hull's edges move only as fast as the points do.
  const m = convexHull(OUT, n);
  for (let j = 0; j < BEARINGS; j++) HULL[j] = hullReach(o.x, o.y, (j / BEARINGS) * TAU, m);
  // widened, blurred, grown; never inside the hull plus floor
  for (let j = 0; j < BEARINGS; j++) { let v = 0; for (let d = -WIDEN; d <= WIDEN; d++) v = Math.max(v, HULL[(j + d + BEARINGS) % BEARINGS]); WIDE[j] = v; }
  const K = kernel(p.blur), h = K.length >> 1;
  for (let j = 0; j < BEARINGS; j++) { let v = 0; for (let d = -h; d <= h; d++) v += K[d + h] * WIDE[(j + d + BEARINGS) % BEARINGS]; BLUR[j] = v; }
  // where the blur falls short of a narrow end (a thin scroll seen end on), the shortfall is blurred too and raised
  // to its own peak, so the end gets a broad round cape instead of a point
  let dmax = 0, bmax = 0;
  for (let j = 0; j < BEARINGS; j++) { const d = (SW[j] = Math.max(0, WIDE[j] + p.floor + 0.5 * p.grow - BLUR[j] - p.grow)); dmax = Math.max(dmax, d); }
  for (let j = 0; j < BEARINGS; j++) { let v = 0; for (let d = -h; d <= h; d++) v += K[d + h] * SW[(j + d + BEARINGS) % BEARINGS]; CAPE[j] = v; bmax = Math.max(bmax, v); }
  const lift = bmax > 1e-6 ? dmax / bmax : 0;
  let mean = 0;
  for (let j = 0; j < BEARINGS; j++) {
    const lo = WIDE[j] + p.floor, T = Math.max(BLUR[j] + p.grow + CAPE[j] * lift, lo);
    o.S[j] = Math.max(o.S[j] + (T - o.S[j]) * e, lo); mean += o.S[j];
  }
  o.mean = mean / BEARINGS; o.fresh = false;
  if (!reduced) o.time = time;
  // the swell, stretched round the ring to run from 0 to 1, so rough is the share of the radius it spans
  let lo = Infinity, hi = -Infinity;
  for (let j = 0; j < BEARINGS; j++) { const g = (SW[j] = swell(o, (j / BEARINGS) * TAU)); lo = Math.min(lo, g); hi = Math.max(hi, g); }
  const amp = (p.rough * o.mean) / Math.max(1e-6, hi - lo);
  for (let j = 0; j < BEARINGS; j++) o.C[j] = o.S[j] + amp * (SW[j] - lo);
  o.calm = (p.rough * o.mean) / 2;
}
// the swell at bearing t, within -1..1
export function swell(o, t) {
  let g = 0;
  for (let i = 0; i < SWELL.length; i++) g += SWELL_W[i] * Math.cos(SWELL[i] * t + o.ph[i] + o.om[i] * o.time) * (0.7 + 0.3 * Math.sin(o.br[i] * o.time + o.ph[i]));
  return g;
}
// The calm line at bearing t: the edge halfway through the swell's span, where the edge stands on average. The swell
// carries the edge a quarter of the footprint's mean radius out and back; the calm line plus half that span is the
// edge at the top of the swell.
export function calmEdge(o, t) {
  let u = (t / TAU) * BEARINGS; u -= Math.floor(u / BEARINGS) * BEARINGS;
  const i = Math.floor(u), f = u - i, S = o.S;
  return S[i % BEARINGS] * (1 - f) + S[(i + 1) % BEARINGS] * f + (o.calm || 0);
}
// The distance from (x,y) out past the calm line grown by g px, along the bearing from the footprint's centre.
export function calmGap(o, x, y, g) { return Math.hypot(x - o.x, y - o.y) - calmEdge(o, Math.atan2(y - o.y, x - o.x)) - g; }
// the edge's distance from the footprint's centre at bearing t
export function edge(o, t) {
  let u = (t / TAU) * BEARINGS; u -= Math.floor(u / BEARINGS) * BEARINGS;
  const i = Math.floor(u), f = u - i, C = o.C;
  return C[i % BEARINGS] * (1 - f) + C[(i + 1) % BEARINGS] * f;
}
// Normalised radius of (x,y) against the edge grown by g px: 1 on it, below 1 inside. g is added, not scaled, so a
// gap is the same width all the way round.
export function edgeR(o, x, y, g) { const dx = x - o.x, dy = y - o.y; return Math.hypot(dx, dy) / (edge(o, Math.atan2(dy, dx)) + g); }
// Distance in px from (x,y) out to the edge grown by g, along the ray from the centre; negative inside.
export function edgeGap(o, x, y, g) { const dx = x - o.x, dy = y - o.y; return Math.hypot(dx, dy) - edge(o, Math.atan2(dy, dx)) - g; }
// The point on the edge grown by g along the ray through (x,y), written to out.
export function onEdge(o, x, y, g, out) {
  let dx = x - o.x, dy = y - o.y; const d = Math.hypot(dx, dy);
  if (d < 1e-6) { dx = 0; dy = -1; } else { dx /= d; dy /= d; }
  const R = edge(o, Math.atan2(dy, dx)) + g; out.x = o.x + dx * R; out.y = o.y + dy * R; return out;
}
// The edge's outward unit normal at the bearing of (x,y), written to out: the radial direction tilted by the slope of
// the edge, so a lobe's flank reads as a flank and not as a circle.
export function edgeNormal(o, x, y, out) {
  const t = Math.atan2(y - o.y, x - o.x), h = 0.01, R = edge(o, t), dR = (edge(o, t + h) - edge(o, t - h)) / (2 * h);
  const c = Math.cos(t), s = Math.sin(t), nx = R * c + dR * s, ny = R * s - dR * c, m = Math.hypot(nx, ny) || 1;
  out.x = nx / m; out.y = ny / m; return out;
}
// The footprint in list whose edge holds (x,y), by index, or -1 on open ground: the edge drawn on screen this frame.
export function footprintAt(list, x, y) {
  let best = -1, low = 1;
  for (const o of list) { const r = edgeR(o, x, y, 0); if (r < low) { low = r; best = o.i; } }
  return best;
}
// A closed smooth path round a footprint's edge grown by off px: 96 samples, curved through their midpoints.
const EDGE_N = 96, EX = new Float32Array(EDGE_N), EY = new Float32Array(EDGE_N);
export function edgePath(ctx, o, off) {
  for (let i = 0; i < EDGE_N; i++) { const t = (i / EDGE_N) * TAU, R = edge(o, t) + off; EX[i] = o.x + Math.cos(t) * R; EY[i] = o.y + Math.sin(t) * R; }
  ctx.beginPath(); ctx.moveTo((EX[EDGE_N - 1] + EX[0]) / 2, (EY[EDGE_N - 1] + EY[0]) / 2);
  for (let i = 0; i < EDGE_N; i++) { const j = (i + 1) % EDGE_N; ctx.quadraticCurveTo(EX[i], EY[i], (EX[i] + EX[j]) / 2, (EY[i] + EY[j]) / 2); }
  ctx.closePath();
}

// ----- the pointer -----
// The cursor as a scene sees it: where it is, whether it is on the page, and how fast it moved over the last step.
export const pointer = () => ({ x: 0, y: 0, on: false, px: 0, py: 0, seen: false, speed: 0 });
export function pointTo(ptr, x, y, on) { ptr.x = x; ptr.y = y; ptr.on = !!on; }
// Once a step: the cursor's speed over it in px/s, 0 for a cursor that was not on the page at both ends.
export function pointerSpeed(ptr, dt) {
  if (ptr.on && ptr.seen) { const d = Math.hypot(ptr.x - ptr.px, ptr.y - ptr.py); ptr.speed = d / dt; } else ptr.speed = 0;
  ptr.px = ptr.x; ptr.py = ptr.y; ptr.seen = ptr.on;
  return ptr.speed;
}

// ----- the press-and-drag stroke -----
// Pressing opens a stroke; dragging calls drop(x, y) every `spacing` px along the pointer's path (the first where the
// press began), skipping points where at(x, y) finds a footprint, so a stroke across a footprint lays nothing on it and
// picks up again beyond; letting go of a press that never moved drops once where it was. A cancelled stroke is simply
// forgotten. spacing is read at every step, so a live change takes effect along the way.
export const strokeOpen = (x, y, spacing) => ({ x, y, sx: x, sy: y, need: spacing, dropped: 0 });
export function strokeAlong(s, x, y, spacing, at, drop) {
  if (!s) return;
  let ax = s.x, ay = s.y; const L = Math.hypot(x - ax, y - ay);
  if (L < 1e-9) return;
  const ux = (x - ax) / L, uy = (y - ay) / L;
  let left = L;
  while (left >= s.need) {
    ax += ux * s.need; ay += uy * s.need; left -= s.need; s.need = Math.max(1, spacing);
    if (!s.dropped) { if (at(s.sx, s.sy) < 0) drop(s.sx, s.sy); s.dropped++; }
    if (at(ax, ay) < 0) drop(ax, ay);
    s.dropped++;
  }
  s.need -= left; s.x = x; s.y = y;
}
export function strokeClose(s, drop) { if (s && !s.dropped) drop(s.sx, s.sy); }

// ----- the lattice of ink marks -----
// Level dashes on rows `pitch` apart at `period` along each row (both at density 1), each row shifted half a period
// from the last, evenly over the whole page. Density shrinks pitch and period together by its square root, so dashes
// per area follow it, while a dash keeps `dash` px (never more than 0.7 of the period). A mark is { x, y, pts }: its
// anchor, the dash's lattice point, and its polyline [x0, y0, x1, y1], world CSS px. The lattice is anchored at the
// world's corner with a phase from the seed, and each dash is drawn from its own point's hash, so which dashes exist
// and where depends on the seed and the position alone (never a running stream, never the page size): two loads differ
// even when the lattice is strict, a larger page holds a smaller page's marks, and a resize reveals more of the same
// picture. Give it a seed of its own derivation, so a world's stream draws exactly what it drew without it.
// The jitter j loosens the lattice from a printed one toward a hand-laid one: from its hash each dash takes a length up
// to j x 50 percent off `dash` either way, a shift along its row up to j x a quarter period, a shift off its row up to
// j x 2 px (to whole pixels, so every dash stays crisp) and a j x 15 percent chance of being left out; at 0 it is a
// strict lattice of equal dashes. Every dash draws all four numbers whatever j is, so moving the slider loosens one
// field rather than dealing a new one.
// spec: { pitch, period, dash, reach }, reach being how far past the page an anchor may lie and still be kept (no
// point of a dash lies farther than half of 1.5 dashes plus a quarter period from its anchor).
export function latticeMarks(seed, W, H, spec, density = 1, jitter = 0.35) {
  const out = []; if (!(density > 0)) return out;
  const s = seed >>> 0, j = jitter, R = spec.reach, f = 1 / Math.sqrt(density);
  const P = spec.pitch * f, T = spec.period * f, ph = pointRand(s), oy = ph() * P, ox = ph() * T;
  const L0 = Math.min(spec.dash, 0.7 * T), along = 0.25 * Math.min(T, spec.period), off = 2 * Math.min(1, P / spec.pitch);
  for (let iy = Math.ceil((-R - oy) / P); oy + iy * P < H + R; iy++) {
    const ay = oy + iy * P, x0 = ox + ((iy & 1) * T) / 2;
    for (let ix = Math.ceil((-R - x0) / T); x0 + ix * T < W + R; ix++) {
      const ax = x0 + ix * T, d = pointRand(hashPoint(ix, iy, s)), gone = d() < 0.15 * j, L = L0 * (1 + j * (d() - 0.5)), cx = ax + j * (d() - 0.5) * 2 * along, yy = Math.round(ay + j * (d() - 0.5) * 2 * off) + 0.5;
      if (!gone) out.push({ x: ax, y: ay, pts: [cx - L / 2, yy, cx + L / 2, yy] });
    }
  }
  return out;
}
// Strokes marks onto ctx in the ink: one weight, round ends, one alpha, nothing filled.
export function drawMarks(ctx, marks, ink, alpha) {
  ctx.globalAlpha = alpha; ctx.strokeStyle = ink; ctx.lineWidth = 1; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath();
  for (const { pts } of marks) { ctx.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]); }
  ctx.stroke(); ctx.globalAlpha = 1;
}

// smooth a run of points by curving through their midpoints
export function curveThrough(ctx, xs, ys, count) {
  for (let i = 1; i < count - 1; i++) ctx.quadraticCurveTo(xs[i], ys[i], (xs[i] + xs[i + 1]) / 2, (ys[i] + ys[i + 1]) / 2);
  ctx.lineTo(xs[count - 1], ys[count - 1]);
}

// ----- colour -----
// The [r, g, b] of a CSS colour (#rgb, #rrggbb, rgb(), rgba()), or null.
export function rgbOf(css) {
  const s = String(css).trim(); let c = null;
  if (s[0] === '#') { const h = s.length === 4 ? s.slice(1).split('').map((d) => d + d).join('') : s.slice(1, 7); if (/^[0-9a-f]{6}$/i.test(h)) c = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); }
  else { const m = s.match(/rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i); if (m) c = [+m[1], +m[2], +m[3]]; }
  return c;
}
// A ground tone: the page colour taken toward `light` (on a light page) or `dark` (on a dark page) by depth. A dark
// page has little room below it, so the same depth pulls three times as far there to read as the same step. A colour
// rgbOf cannot read is returned as it is.
export function tint(paper, depth, light, dark) {
  const c = rgbOf(paper); if (!c) return String(paper).trim();
  const isLight = (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255 > 0.5, deep = isLight ? light : dark;
  const k = isLight ? depth : Math.min(1, depth * 3), mix = c.map((v, i) => Math.round(v + (deep[i] - v) * k));
  return `rgb(${mix[0]}, ${mix[1]}, ${mix[2]})`;
}

// ----- the browser shell -----
export function mountScene(container, scene, host = {}) {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;';
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const params = paramDefaults(scene.PARAMS), pal = scene.palette;
  const mq = (q) => (window.matchMedia ? window.matchMedia(q) : null);
  const coarseQ = mq('(pointer: coarse)'), reducedQ = mq('(prefers-reduced-motion: reduce)');
  // a `?seed=` in the page's address fixes the world's seed, so a look can be compared at the same draw
  const seedQ = new URLSearchParams(location.search).get('seed'), seed = seedQ != null && seedQ !== '' && Number.isFinite(+seedQ) ? +seedQ >>> 0 : (Math.random() * 2 ** 32) >>> 0;
  const world = scene.createWorld(params, { w: container.clientWidth || 1, h: container.clientHeight || 1, seed, coarse: !!coarseQ?.matches, reduced: !!reducedQ?.matches });
  const onReduced = () => { world.reduced = !!reducedQ.matches; };
  reducedQ?.addEventListener?.('change', onReduced);
  // the tokens live on the root div, not on <html>, so read them off the layer itself; and read them again every
  // second, so a change of theme reaches the ink without any hook into how the theme is switched
  const colours = { ink: '#201f1d', paper: '#f3f2f2', ...pal.accents };
  let inkAge = Infinity;
  const readInk = () => { const css = getComputedStyle(container); colours.ink = css.getPropertyValue('--color-text').trim() || colours.ink; colours.paper = css.getPropertyValue('--color-bg').trim() || colours.paper; inkAge = 0; };
  // backing pixels per CSS px of the ground (see paint)
  const groundRes = () => Math.min(dpr, Math.max(1, params.groundRes || 1));
  // The static layer is generated once and painted once, over the flat ground tone, into its own canvas at the
  // ground's resolution; the ground blits it each frame. Its content is kept apart from its colour, so a theme, depth
  // or look change only repaints it, and only a change of size or key makes it anew. A resize regenerates 200 ms after
  // the last one; until then the old layer is drawn at its own size, never stretched, with the flat tone under what it
  // misses.
  let layer = { img: null, w: 0, h: 0, flat: colours.paper }, data = null, dataKey = '', layerKey = '', layerCanvas = null, resizedAt = -Infinity;
  const relayer = (now) => {
    const L = scene.layer, dk = `${L.key(world, params)} ${vw} ${vh}`;
    if (dk !== dataKey && (!data || now - resizedAt > 200)) { data = { w: vw, h: vh, list: L.make(world, params, vw, vh) }; dataKey = dk; }
    const res = groundRes(), lk = `${dataKey} ${res} ${colours.paper} ${colours.ink} ${params[pal.depth]} ${L.look(params)}`;
    if (lk === layerKey) return;
    layerKey = lk;
    const flat = tint(colours.paper, params[pal.depth], pal.light, pal.dark);
    if (!layerCanvas) layerCanvas = document.createElement('canvas');
    layerCanvas.width = Math.max(1, Math.round(data.w * res)); layerCanvas.height = Math.max(1, Math.round(data.h * res));
    const c = layerCanvas.getContext('2d', { alpha: false }); c.setTransform(res, 0, 0, res, 0, 0);
    c.fillStyle = flat; c.fillRect(0, 0, data.w, data.h); L.paint(c, data.list, params, colours);
    layer = { img: layerCanvas, w: data.w, h: data.h, flat };
  };
  let vw = 1, vh = 1;
  const resize = () => {
    resizedAt = performance.now();
    vw = container.clientWidth || 1; vh = container.clientHeight || 1;
    canvas.width = Math.round(vw * dpr); canvas.height = Math.round(vh * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    scene.resizeWorld(world, vw, vh);
  };
  const ro = new ResizeObserver(resize); ro.observe(container); resize();
  // On a dense screen the ground is drawn into a copy at groundRes backing pixels per CSS px (1.5 by default) and
  // scaled up onto the canvas: its big soft paths cost the GPU by the pixel. At 1 faint lines visibly soften, so the
  // default keeps some of the resolution back. The live layer is drawn over it at full resolution. At groundRes >= dpr
  // the ground goes straight on.
  let groundCanvas = null, groundCtx = null;
  const paint = () => {
    const res = groundRes();
    if (res >= dpr) scene.drawGround(ctx, world, colours, layer);
    else {
      if (!groundCtx) { groundCanvas = document.createElement('canvas'); groundCtx = groundCanvas.getContext('2d', { alpha: false }); }
      const cw = Math.max(1, Math.round(vw * res)), ch = Math.max(1, Math.round(vh * res));
      if (groundCanvas.width !== cw || groundCanvas.height !== ch) { groundCanvas.width = cw; groundCanvas.height = ch; }
      groundCtx.setTransform(res, 0, 0, res, 0, 0);
      scene.drawGround(groundCtx, world, colours, layer);
      ctx.imageSmoothingEnabled = true; ctx.drawImage(groundCanvas, 0, 0, vw, vh);
    }
    scene.drawLive(ctx, world, colours);
  };
  let alive = true, raf = 0, last = performance.now();
  const tick = (now) => {
    raf = 0;
    if (!alive || document.hidden) return;
    raf = requestAnimationFrame(tick);
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now;
    inkAge += dt; if (inkAge > 1) readInk();
    scene.step(world, dt);
    relayer(now);
    paint();
  };
  // a hidden tab runs nothing; on return the clock restarts rather than jumping by the time away
  const onVisible = () => { if (!alive) return; if (document.hidden) { if (raf) cancelAnimationFrame(raf); raf = 0; } else if (!raf) { last = performance.now(); raf = requestAnimationFrame(tick); } };
  document.addEventListener('visibilitychange', onVisible);
  raf = requestAnimationFrame(tick);
  let dev = null;
  const api = {
    setSources(list) { scene.setSources(world, list); },
    setOutlines(fns) { scene.setOutlines(world, fns); },
    setPointer(x, y, on) { scene.setPointer(world, x, y, on); },
    hit(x, y) { return scene.hit(world, x, y); },
    drop(x, y) { scene.drop(world, x, y); },
    strokeStart(x, y) { scene.strokeStart(world, x, y); },
    strokeTo(x, y) { scene.strokeTo(world, x, y); },
    strokeEnd() { scene.strokeEnd(world); },
    strokeCancel() { scene.strokeCancel(world); },
    clear() { scene.clear(world); },
    params, PARAMS: scene.PARAMS, name: host.name,
    // shrinking the canvas to nothing hands the backing store back now rather than at the next collection
    destroy() {
      alive = false; if (raf) cancelAnimationFrame(raf); ro.disconnect();
      document.removeEventListener('visibilitychange', onVisible); reducedQ?.removeEventListener?.('change', onReduced);
      if (dev) dev.destroy();
      canvas.width = canvas.height = 0; if (groundCanvas) groundCanvas.width = groundCanvas.height = 0; if (layerCanvas) layerCanvas.width = layerCanvas.height = 0; if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    },
  };
  if (new URLSearchParams(location.search).has('dev')) import('./dev.js').then((m) => { if (alive) dev = m.mount(api, host); }).catch((e) => console.error('scene dev', e));
  return api;
}
