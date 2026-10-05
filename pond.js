// Home pond: the page seen from above as still water, with the two home objects standing in it as islands. A few
// dozen line-drawn fish swim between them in groups that form, merge and part on their own, a few of them koi with gold
// patches, water laps inward at each shore, a branch and leaves lie on the bottom, stones stand in the water, water
// striders skate, lily pads drift, a lotus or two among them, on the open water and give a frightened fish somewhere
// to hide, and a click drops a treat the fish race for and eat. The layer sits behind reading text, so the resting
// picture is calm: the fish swim in easy beats and glides and only burst into speed for a reason (a treat, a fast
// cursor, or now and then on their own) before they settle again.
//
// The simulation is kept apart from the drawing. createWorld() builds a state, step() advances it by dt with the
// world's own seeded random source and touches nothing else, so a run from a seed is the same run every time and
// tools/check-pond.mjs drives it headless. mount() is the browser shell around it: canvas, clock, colours, lifecycle.
//
// mount(container) -> { setSources([{x,y,w,h}]), setOutlines([(out) => count]), setPointer(x,y,active), hit(x,y), drop(x,y), strokeStart(x,y), strokeTo(x,y),
//   strokeEnd(), strokeCancel(), params, clear(), destroy() }
// With ?dev in the URL the parameters open in a panel (pond-dev.js) and can be tuned live; `params` is that object.
// Parameters by section: [default, min, max, step, label].
export const PARAMS = {
  school: {
    count: [36, 1, 120, 1, 'fish on a fine pointer'],
    countTouch: [16, 1, 120, 1, 'fish on a coarse pointer'],
    repel: [16, 0, 120, 1, 'zone of repulsion, px'],
    orient: [60, 0, 300, 1, 'zone of orientation, px'],
    vision: [5, 1, 30, 0.5, 'how far a fish sees its neighbours, body lengths'],
    near: [4, 1, 16, 1, 'nearest visible neighbours a fish attends to'],
    fov: [300, 90, 360, 5, 'field of view, degrees; the rest is blind behind'],
    far: [200, 0, 1200, 10, 'how far a fish that sees no one looks for company, px'],
    wander: [0.35, 0, 3, 0.05, 'weight of each fish\'s own meander'],
  },
  lead: {
    share: [0.4, 0, 0.95, 0.01, 'share of fish carrying a destination of their own'],
    will: [1.2, 0, 5, 0.05, 'pull of a destination against the pull of the group'],
    keep: [12, 2, 120, 1, 'mean time a fish keeps a destination, s'],
  },
  swim: {
    coast: [1.4, 0.2, 5, 0.05, 'glide drag time constant, s'],
    kick: [2.5, 0.2, 10, 0.1, 'thrust acceleration, per s'],
    over: [1.3, 1, 2.5, 0.05, 'a thrust aims this far above the wanted speed'],
    low: [0.6, 0.1, 0.95, 0.01, 'a glide ends when speed falls to this share of the wanted speed'],
    beats: [3, 1, 8, 1, 'most tail beats in a cruising thrust'],
    maxHz: [4, 1, 8, 0.1, 'fastest tail beat, per s'],
    hover: [0.12, 0, 2, 0.01, 'single holding beats per s while hovering'],
    idle: [0.015, 0, 0.5, 0.005, 'chance per s that a calm fish stops to hover'],
    idleFor: [6, 0, 30, 0.5, 'longest hover, s'],
  },
  motion: {
    cruise: [42, 2, 120, 1, 'wanted swimming speed, px/s'],
    burst: [3.2, 1, 10, 0.1, 'burst speed as a multiple of cruise'],
    turn: [2.4, 0.1, 8, 0.1, 'turn rate when calm, rad/s'],
    turnBurst: [5, 0, 15, 0.1, 'extra turn rate at full burst, rad/s'],
    calm: [1.1, 0.2, 6, 0.1, 'burst decay, s'],
    whim: [0.05, 0, 0.5, 0.005, 'spontaneous darts per fish per s'],
    reduced: [0.25, 0.05, 0.95, 0.05, 'speed under reduced motion, of cruise'],
  },
  body: {
    length: [24, 10, 60, 1, 'mean fish length, px'],
    amp: [0.11, 0, 0.4, 0.01, 'tail sweep, of body length'],
    stride: [1.5, 0.2, 4, 0.05, 'body lengths a thrust aims to cover per beat'],
    alpha: [0.5, 0.05, 1, 0.01, 'ink opacity'],
    width: [1, 0.3, 3, 0.05, 'line width, px'],
    koi: [4, 0, 24, 1, 'koi, the fish with gold patches, on a fine pointer'],
    koiTouch: [2, 0, 24, 1, 'koi on a coarse pointer'],
  },
  islands: {
    shoreGap: [26, 0, 120, 1, 'land beyond the object\'s silhouette, px'],
    rough: [0.25, 0, 0.6, 0.01, 'swell on the coast, share of the island\'s mean radius'],
    blur: [28, 2, 90, 1, 'how widely the silhouette is blurred round the coast, deg'],
    follow: [0.3, 0.02, 3, 0.01, 'time the coast takes to follow its object, s'],
    floor: [6, 0, 40, 1, 'least land between the object and the coast, px'],
    shore: [14, 0, 80, 1, 'gap a fish keeps from an island, px'],
    look: [70, 0, 300, 5, 'distance at which a fish starts to steer around, px'],
    edge: [60, 0, 300, 5, 'screen margin where fish turn back, px'],
    rings: [3, 0, 6, 1, 'waves lapping at each island'],
    reach: [46, 4, 200, 1, 'how far out a wave starts, px'],
    lap: [0.12, 0, 1, 0.01, 'waves per s'],
    ringAlpha: [0.13, 0, 1, 0.01, 'wave opacity'],
    shoreAlpha: [0.16, 0, 1, 0.01, 'shoreline opacity'],
    water: [0.08, 0, 0.4, 0.005, 'how much darker the water is than the land'],
    marks: [1, 1, 4, 1, 'style of the marks on the water: 1 dashes, 2 wavelets, 3 current, 4 rings (candidates)'],
    markDensity: [1, 0, 3, 0.05, 'how many marks the water holds, x the style\'s own'],
    markAlpha: [0.16, 0, 1, 0.01, 'opacity of the marks on the water'],
    shallows: [0.6, 0, 1, 0.05, 'how far the shallows lighten back toward the land'],
    coastRes: [1.5, 1, 2, 0.25, 'resolution of the ground (water, land, floor, shores) on a dense screen: 1 CSS px, 2 the full backing store'],
  },
  treats: {
    sense: [240, 0, 800, 10, 'how far a fish notices a treat, px'],
    sink: [8, 1, 30, 0.5, 'seconds before an uneaten treat sinks away'],
    max: [48, 1, 120, 1, 'live treats at once; the oldest goes first'],
    spacing: [22, 4, 200, 1, 'gap between treats dropped along a drag, px'],
    startle: [800, 100, 4000, 50, 'cursor speed that startles, px/s'],
    scare: [110, 0, 400, 5, 'startle radius, px'],
  },
  pads: {
    pads: [8, 0, 24, 1, 'lily pads on a fine pointer'],
    padsTouch: [5, 0, 24, 1, 'lily pads on a coarse pointer'],
    drift: [3, 0, 12, 0.5, 'mean drift of a pad, px/s'],
    push: [10, 0, 40, 1, 'push a passing ripple gives a pad, px/s'],
    shelter: [220, 0, 600, 10, 'how far a startled fish looks for a pad to hide under, px'],
    shelterChance: [0.6, 0, 1, 0.05, 'chance a startled fish hides under a pad'],
    rest: [0.01, 0, 0.2, 0.005, 'chance per s that a calm fish goes to rest under a pad'],
  },
  surface: {
    floraAlpha: [0.08, 0, 1, 0.01, 'opacity of the film filling a stone, pad or flower'],
    surfaceStroke: [0.4, 0, 1, 0.01, 'opacity of the outline of a stone, pad or flower'],
    rocks: [7, 0, 16, 1, 'stones standing in the water on a fine pointer'],
    rocksTouch: [4, 0, 16, 1, 'stones on a coarse pointer'],
    flowers: [2, 0, 8, 1, 'lotus flowers on the pads on a fine pointer'],
    flowersTouch: [1, 0, 8, 1, 'lotus flowers on a coarse pointer'],
    striders: [4, 0, 16, 1, 'water striders on a fine pointer'],
    stridersTouch: [2, 0, 16, 1, 'water striders on a coarse pointer'],
    dart: [80, 10, 300, 5, 'a water strider\'s dart speed, px/s'],
  },
  floor: {
    leaves: [3, 0, 8, 1, 'sunken leaves on a fine pointer'],
    leavesTouch: [2, 0, 8, 1, 'sunken leaves on a coarse pointer'],
    branch: [1, 0, 1, 1, 'a sunken branch'],
    floorAlpha: [0.22, 0, 1, 0.01, 'opacity of the things on the pond floor'],
  },
};
export const defaults = () => Object.fromEntries(Object.values(PARAMS).flatMap((section) => Object.entries(section).map(([k, v]) => [k, v[0]])));

// ----- the seeded random source -----
// mulberry32: small, fast, and good enough for motion. The world owns one, so a run is fixed by its seed.
export function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ----- the swimming stroke -----
export const SPINE = 8;          // points down the body, head first
export const BODY = 0.78;        // share of the length the spine covers; the tail fin is the rest
const WAVE_K = Math.PI * 2 * 0.9; // a little under one wavelength along the body
// Lateral amplitude down the body, s from 0 at the head to 1 at the tail, as a share of the tail's. Carangiform: the
// head yaws a little, the neck barely moves, and the sweep grows toward the tail.
export const envelope = (s) => 0.2 - 0.6 * s + 1.4 * s * s;
// Tail beats per second of a thrust that aims at speed `top`: a fish covers about `stride` body lengths per beat, so
// an urgent thrust beats faster. Fixed when the thrust starts, never read off the speed frame by frame.
export const thrustHz = (top, len, p) => Math.min(p.maxHz, Math.max(0.5, top / (len * p.stride)));
// The lateral offset of spine point s at the given phase, for a fish whose tail sweeps `amp` px.
export const lateral = (s, phase, amp) => amp * envelope(s) * Math.sin(phase - WAVE_K * s);
// The body's half-width at spine position u (0 head, 1 where the tail fin starts), as a share of HALF body lengths:
// a blunt head, the widest point a third of the way back, and a narrow wrist at the tail.
export const HALF = 0.12;
export const bodyWidth = (u) => 0.25 * u + 0.75 * Math.sin(Math.PI * Math.min(1, Math.max(0, u) ** 0.62));

const TAU = Math.PI * 2;

// ----- koi -----
// The first `koi` fish carry gold patches. A patch is an ellipse in the body's own frame: u its place down the spine
// (0.15 to 0.85), lat its offset across the body as a share of the half-width there (so its centre is always inside
// the body), rx and ry its radii in body lengths, tilt its turn off the spine. Seeded from the fish's index, so a koi
// wears the same patches across reloads and whatever the world's seed.
export function koiPatches(i) {
  const r = rng(0xc0e1 + i * 7919), n = 1 + Math.floor(r() * 3), out = [];
  for (let k = 0; k < n; k++) {
    const rx = 0.12 + 0.13 * r();
    out.push({ u: 0.15 + 0.7 * r(), lat: (2 * r() - 1) * 0.7, rx, ry: rx * (0.5 + 0.3 * r()), tilt: (r() - 0.5) * 0.8 });
  }
  return out;
}
const koiTarget = (w) => Math.max(0, Math.round(w.coarse ? w.params.koiTouch : w.params.koi));
// Marks the first koiTarget fish as koi and the rest as plain; cheap enough to run whenever the count may have changed.
function markKoi(w) {
  const n = koiTarget(w);
  w.fish.forEach((f, i) => { if (i < n) { if (!f.koi) f.koi = koiPatches(i); } else f.koi = null; });
  w.koiN = n; w.koiOf = w.fish.length;
}

// ----- the islands -----
// An island is the land round one of the home objects, shaped each frame from the object's silhouette as it stands on
// screen. The island reads its object's outline points (or, when the object has nothing to show, its box's corners
// and edge midpoints) and, seen from a centre that eases toward their centroid, takes at each of BEARINGS bearings the
// distance out to the points' convex hull, so the profile moves only as fast as the object's own points do. That profile is
// widened a few bearings, blurred wide round the circle so no corner or edge of the object reads through, and grown by
// shoreGap, with a broad cape blurred out over any narrow end the blur falls short of, and never let closer than floor px
// to the hull. The displayed profile S eases toward that target with time
// constant follow, so a turning object moves its coast without shimmer. On top of S lies a swell that only ever pushes
// outward: harmonics 2..9 weighted 1/k, each drifting round the coast at its own slow rate and breathing on its own
// slower cycle, stretched each frame to span rough times the island's mean radius. Phases and rates come from the island's index, so an
// island moves the same way across reloads; its clock is the world's, frozen under reduced motion.
// The coast is tabulated once a frame at the BEARINGS bearings (C) and read between them. This is the one representation of
// an island: containment, push-out, steering, treats, the land and the waves all read it.
export const BEARINGS = 96;
const SWELL = [2, 3, 4, 5, 6, 7, 8, 9], SWELL_W = (() => { const w = SWELL.map((k) => 1 / k), s = w.reduce((a, b) => a + b, 0); return w.map((v) => v / s); })();
const WIDEN = 2; // bins either side the hull is widened by before the blur
export function makeIsland(i, box) {
  const r = rng(0x5eed + i * 7919), ph = SWELL.map(() => r() * TAU);
  const om = SWELL.map(() => (r() < 0.5 ? -1 : 1) * (0.03 + r() * 0.09)), br = SWELL.map(() => 0.02 + r() * 0.05);
  const o = { i, x: 0, y: 0, bx: 0, by: 0, dx: 0, dy: 0, S: new Float32Array(BEARINGS), C: new Float32Array(BEARINGS), mean: 0, ph, om, br, time: 0, fresh: true };
  placeBox(o, box); return o;
}
function placeBox(o, b) { o.box = b; o.bx = b.x + b.w / 2; o.by = b.y + b.h / 2; o.x = o.bx + o.dx; o.y = o.by + o.dy; }
const OUT = new Float32Array(512), HULL = new Float32Array(BEARINGS), WIDE = new Float32Array(BEARINGS), BLUR = new Float32Array(BEARINGS), SW = new Float32Array(BEARINGS), CAPE = new Float32Array(BEARINGS);
let KERNEL = null, kernelFor = NaN;
function kernel(deg) {
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
// One frame of an island: its outline from fn (or its box), then centre, profile, easing and the tabulated coast.
export function updateIsland(o, fn, dt, p, reduced, time) {
  let n = fn ? fn(OUT) | 0 : 0;
  if (n <= 0) n = boxPoints(o.box, OUT);
  n = Math.min(n, OUT.length >> 1);
  const tau = reduced ? Math.max(1.5, p.follow) : p.follow, e = o.fresh ? 1 : 1 - Math.exp(-dt / Math.max(1e-3, tau));
  let sx = 0, sy = 0; for (let j = 0; j < n; j++) { sx += OUT[2 * j]; sy += OUT[2 * j + 1]; }
  o.dx += (sx / n - o.bx - o.dx) * e; o.dy += (sy / n - o.by - o.dy) * e; o.x = o.bx + o.dx; o.y = o.by + o.dy;
  // the convex hull round the centre. Binning the points themselves by bearing notched the profile wherever an inner
  // point (a hypercube's near vertex) held a bearing alone and popped it back out when the point moved on, and the floor
  // below passes a pop straight to the coast; the hull's edges move only as fast as the points do.
  const m = convexHull(OUT, n);
  for (let j = 0; j < BEARINGS; j++) HULL[j] = hullReach(o.x, o.y, (j / BEARINGS) * TAU, m);
  // widened, blurred, grown; never inside the hull plus floor
  for (let j = 0; j < BEARINGS; j++) { let v = 0; for (let d = -WIDEN; d <= WIDEN; d++) v = Math.max(v, HULL[(j + d + BEARINGS) % BEARINGS]); WIDE[j] = v; }
  const K = kernel(p.blur), h = K.length >> 1;
  for (let j = 0; j < BEARINGS; j++) { let v = 0; for (let d = -h; d <= h; d++) v += K[d + h] * WIDE[(j + d + BEARINGS) % BEARINGS]; BLUR[j] = v; }
  // where the blur falls short of a narrow end (a thin scroll seen end on), the shortfall is blurred too and raised
  // to its own peak, so the end gets a broad round cape instead of a point
  let dmax = 0, bmax = 0;
  for (let j = 0; j < BEARINGS; j++) { const d = (SW[j] = Math.max(0, WIDE[j] + p.floor + 0.5 * p.shoreGap - BLUR[j] - p.shoreGap)); dmax = Math.max(dmax, d); }
  for (let j = 0; j < BEARINGS; j++) { let v = 0; for (let d = -h; d <= h; d++) v += K[d + h] * SW[(j + d + BEARINGS) % BEARINGS]; CAPE[j] = v; bmax = Math.max(bmax, v); }
  const lift = bmax > 1e-6 ? dmax / bmax : 0;
  let mean = 0;
  for (let j = 0; j < BEARINGS; j++) {
    const lo = WIDE[j] + p.floor, T = Math.max(BLUR[j] + p.shoreGap + CAPE[j] * lift, lo);
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
// The calm line at bearing t: the coast halfway through the swell's span, where the water's edge stands on average.
// The swell carries the coast a quarter of the island's mean radius out and back; the calm line plus half that span
// is the coast at the top of the swell, which the stones and the pads are kept off (outerCoast).
export function calmCoast(o, t) {
  let u = (t / TAU) * BEARINGS; u -= Math.floor(u / BEARINGS) * BEARINGS;
  const i = Math.floor(u), f = u - i, S = o.S;
  return S[i % BEARINGS] * (1 - f) + S[(i + 1) % BEARINGS] * f + (o.calm || 0);
}
// The distance from (x,y) out past the calm line grown by g px, along the bearing from the island's centre.
export function calmGap(o, x, y, g) { return Math.hypot(x - o.x, y - o.y) - calmCoast(o, Math.atan2(y - o.y, x - o.x)) - g; }
// the coast's distance from the island's centre at bearing t
export function coast(o, t) {
  let u = (t / TAU) * BEARINGS; u -= Math.floor(u / BEARINGS) * BEARINGS;
  const i = Math.floor(u), f = u - i, C = o.C;
  return C[i % BEARINGS] * (1 - f) + C[(i + 1) % BEARINGS] * f;
}
// Normalised radius of (x,y) against the coast grown by g px: 1 on it, below 1 inside. g is added, not scaled, so a
// gap is the same width all the way round.
export function shoreR(o, x, y, g) { const dx = x - o.x, dy = y - o.y; return Math.hypot(dx, dy) / (coast(o, Math.atan2(dy, dx)) + g); }
// Distance in px from (x,y) out to the coast grown by g, along the ray from the centre; negative inside.
export function shoreGap(o, x, y, g) { const dx = x - o.x, dy = y - o.y; return Math.hypot(dx, dy) - coast(o, Math.atan2(dy, dx)) - g; }
// The point on the coast grown by g along the ray through (x,y), written to out.
export function onShore(o, x, y, g, out) {
  let dx = x - o.x, dy = y - o.y; const d = Math.hypot(dx, dy);
  if (d < 1e-6) { dx = 0; dy = -1; } else { dx /= d; dy /= d; }
  const R = coast(o, Math.atan2(dy, dx)) + g; out.x = o.x + dx * R; out.y = o.y + dy * R; return out;
}
// The coast's outward unit normal at the bearing of (x,y), written to out: the radial direction tilted by the slope
// of the coast, so a fish reads a lobe's flank as a flank and not as a circle.
export function shoreNormal(o, x, y, out) {
  const t = Math.atan2(y - o.y, x - o.x), h = 0.01, R = coast(o, t), dR = (coast(o, t + h) - coast(o, t - h)) / (2 * h);
  const c = Math.cos(t), s = Math.sin(t), nx = R * c + dR * s, ny = R * s - dR * c, m = Math.hypot(nx, ny) || 1;
  out.x = nx / m; out.y = ny / m; return out;
}
const NRM = { x: 0, y: 0 }, PT = { x: 0, y: 0 };
const wrapAngle = (a) => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };

// ----- company and destinations -----
// There are no shoals as objects: every fish follows the same rule, and the groups are whatever that rule makes. A fish
// attends to its `near` nearest neighbours that it can see, within `vision` body lengths and outside the blind sector
// behind it. Too close, it turns away; near, it lines up; further, it closes in. Counting neighbours instead of
// taking everyone within a radius means a crowd never pulls on a fish as one mass, so a group can be drawn apart.
// What moves the groups is an informed minority (Couzin et al. 2005): at any time about `share` of the fish carry a
// destination of their own (a point off an island's shore, along the rim, in open water, or where food was found)
// and weigh it against the pull of their neighbours. A few informed fish steer the group they swim in, two that
// disagree pull it apart, and a destination lapses after tens of seconds or when it is reached while other fish take
// up new ones. No fish leads for long, so groups wander the pond, meet, merge and part. Food makes a fish informed at
// once and strongly, which gathers groups at a feeding spot.
// Moves (out.x, out.y) into open water on the page, clear of the islands.
function settle(w, out) {
  for (const q of w.islands) if (shoreGap(q, out.x, out.y, 0) < 50) onShore(q, out.x, out.y, 50, out);
  const m = 70;
  out.x = Math.min(Math.max(out.x, Math.min(m, w.w / 2)), Math.max(w.w - m, w.w / 2));
  out.y = Math.min(Math.max(out.y, Math.min(m, w.h / 2)), Math.max(w.h - m, w.h / 2));
  return out;
}
// Gives f a destination of its own, spread over the pond so that groups patrol different parts and cross paths.
function inform(w, f) {
  const r = w.rand, p = w.params, q = r(), g = { x: 0, y: 0 };
  if (w.fed.length && q < 0.15) { const s = w.fed[Math.floor(r() * w.fed.length)]; g.x = s.x + (r() - 0.5) * 80; g.y = s.y + (r() - 0.5) * 80; }
  else if (w.islands.length && q < 0.5) {
    const o = w.islands[Math.floor(r() * w.islands.length)], t = r() * TAU, R = coast(o, t) + 50 + r() * 50;
    g.x = o.x + Math.cos(t) * R; g.y = o.y + Math.sin(t) * R;
  } else if (q < 0.75) {
    // somewhere along the rim, 80 px in
    const iw = Math.max(0, w.w - 160), ih = Math.max(0, w.h - 160); let s = r() * 2 * (iw + ih);
    if (s < iw) { g.x = 80 + s; g.y = 80; } else if ((s -= iw) < ih) { g.x = w.w - 80; g.y = 80 + s; }
    else if ((s -= ih) < iw) { g.x = w.w - 80 - s; g.y = w.h - 80; } else { g.x = 80; g.y = w.h - 80 - (s - iw); }
  } else { g.x = (0.1 + 0.8 * r()) * w.w; g.y = (0.1 + 0.8 * r()) * w.h; }
  f.goal = settle(w, g); f.keep = p.keep * (0.5 + r()); f.will = 0.6 + 0.8 * r(); f.food = false;
}
// The last few places food was eaten, which a fish may later take as its destination.
function remember(w, t) {
  const near = w.fed.find((s) => Math.hypot(s.x - t.x, s.y - t.y) < 80);
  if (near) { near.x = t.x; near.y = t.y; return; }
  w.fed.push({ x: t.x, y: t.y }); if (w.fed.length > 4) w.fed.shift();
}
// the k nearest neighbours of the fish being steered, by squared distance and index
const NB = 16, ND = new Float64Array(NB), NJ = new Int32Array(NB);
function spawnFish(w, f, x, y) {
  const r = w.rand, p = w.params;
  f.len = p.length * (0.75 + 0.5 * r());
  f.pace = 0.85 + 0.3 * r();                      // each fish's own cruise, so a group does not move as one block
  f.x = x + (r() - 0.5) * 70; f.y = y + (r() - 0.5) * 70;
  for (const o of w.islands) if (shoreR(o, f.x, f.y, p.shore) < 1) { onShore(o, f.x, f.y, p.shore, PT); f.x = PT.x; f.y = PT.y; }
  f.h = r() * TAU;
  f.sp = p.cruise * (w.reduced ? p.reduced : f.pace) * (0.6 + 0.6 * r()); f.en = 0; f.flee = 0; f.fx = 0; f.fy = 0;
  f.phase = r() * TAU; f.fin = r() * TAU; f.wa = 0; f.idle = 0; f.cs = -2;
  f.left = 0; f.top = 0; f.hz = 0; f.sweep = 0; f.amp = r() * 0.5; f.low = p.low * (0.85 + 0.3 * r());
  f.goal = null; f.keep = 0; f.will = 1; f.food = false;
  f.pad = null; f.hide = 0; f.under = false; f.seek = 0; // the pad it is making for or hiding under
  f.rope = new Float32Array(SPINE * 2);
  const seg = (f.len * BODY) / (SPINE - 1), cx = Math.cos(f.h), cy = Math.sin(f.h);
  for (let i = 0; i < SPINE; i++) { f.rope[i * 2] = f.x - cx * seg * i; f.rope[i * 2 + 1] = f.y - cy * seg * i; }
  return f;
}

// A world: the pond's whole state. opts: { w, h, seed, coarse, reduced }.
export function createWorld(params, opts = {}) {
  const w = {
    params, w: opts.w || 1, h: opts.h || 1, t: 0, rand: rng(opts.seed == null ? 1 : opts.seed),
    coarse: !!opts.coarse, reduced: !!opts.reduced,
    fish: [], islands: [], outlines: [], treats: [], ripples: [], stroke: null, fed: [],
    ptr: { x: 0, y: 0, on: false, px: 0, py: 0, seen: false, speed: 0 },
    eaten: 0,
    seed: opts.seed == null ? 1 : opts.seed, rocks: [], floor: [], flowers: [], bloomRand: null, striders: [], srand: null,
    pads: [], padSeed: ((opts.seed == null ? 1 : opts.seed) ^ 0x9ad5eed) >>> 0, prand: null, flow: null, laidIsl: 0, laidFor: '', relay: 0,
  };
  populate(w);
  layPond(w);
  return w;
}
const target = (w) => Math.max(0, Math.round(w.coarse ? w.params.countTouch : w.params.count));
// The first fish start in a few loose knots about the page; a later newcomer turns up beside a fish already there,
// and a surplus leaves from the end.
function populate(w) {
  const n = target(w), r = w.rand;
  if (!w.fish.length && n > 0) {
    const knots = []; for (let k = 4 + Math.floor(r() * 3); k > 0; k--) knots.push(settle(w, { x: (0.1 + 0.8 * r()) * w.w, y: (0.1 + 0.8 * r()) * w.h }));
    for (let i = 0; i < n; i++) { const c = knots[Math.floor(r() * knots.length)]; w.fish.push(spawnFish(w, {}, c.x, c.y)); }
  }
  while (w.fish.length < n) { const g = w.fish[Math.floor(r() * w.fish.length)]; w.fish.push(spawnFish(w, {}, g ? g.x : r() * w.w, g ? g.y : r() * w.h)); }
  if (w.fish.length > n) w.fish.length = n;
  markKoi(w);
}
// A resize lays the stones and the pads out again a moment later, once the islands have followed their objects.
export function resizeWorld(w, width, height) {
  const W = Math.max(1, width), H = Math.max(1, height);
  if (W !== w.w || H !== w.h) w.relay = RELAY;
  w.w = W; w.h = H;
}
// The islands follow the boxes by index: an island keeps its shape and swell when its box moves, and a new one is
// shaped at once. The outline functions, one per island by index, are read every step.
export function setIslands(w, boxes) {
  const list = boxes || [];
  w.islands.length = Math.min(w.islands.length, list.length);
  list.forEach((b, i) => { if (w.islands[i]) placeBox(w.islands[i], b); else { const o = makeIsland(i, b); updateIsland(o, w.outlines[i], 0, w.params, w.reduced, w.t); w.islands.push(o); } });
  // stones and pads laid out before the page had any islands are laid out again round the first ones, while the pond is new
  if (!w.laidIsl && w.islands.length && w.t < 1) layPond(w);
}
export function setOutlines(w, fns) { w.outlines = fns || []; }
export function setPointer(w, x, y, on) { w.ptr.x = x; w.ptr.y = y; w.ptr.on = !!on; }
// The island whose coast holds (x,y), by index, or -1 on open water. The same coast the fish keep off, so the land a
// pointer lands on is the land drawn on screen, whatever shape the island has taken this frame.
export function islandAt(w, x, y) {
  let best = -1, low = 1;
  for (const o of w.islands) { const r = shoreR(o, x, y, 0); if (r < low) { low = r; best = o.i; } }
  return best;
}
// A treat that lands on an island rolls off into the water at the nearest shore.
export function dropTreat(w, x, y) {
  const g = w.params.shore + 4;
  for (const o of w.islands) if (shoreR(o, x, y, g) < 1) { onShore(o, x, y, g, PT); x = PT.x; y = PT.y; }
  for (const q of w.rocks) if (discGap(q, x, y, g, NRM) < 0) { x = q.x + NRM.x * (q.r + g); y = q.y + NRM.y * (q.r + g); }
  if (w.treats.length >= w.params.max) w.treats.splice(0, w.treats.length - w.params.max + 1);
  w.treats.push({ x, y, age: 0 });
  ripple(w, x, y, 34, 1.6);
}
// A feed stroke: pressing starts one, dragging drops a treat every `spacing` px along the pointer's path (the first
// where the press began), and letting go of a press that never moved drops one where it was. Cancelling ends it with
// no further drop.
export function strokeStart(w, x, y) { w.stroke = { x, y, sx: x, sy: y, need: w.params.spacing, dropped: 0 }; }
export function strokeTo(w, x, y) {
  const s = w.stroke; if (!s) return;
  let ax = s.x, ay = s.y; const L = Math.hypot(x - ax, y - ay);
  if (L < 1e-9) return;
  const ux = (x - ax) / L, uy = (y - ay) / L;
  let left = L;
  while (left >= s.need) {
    ax += ux * s.need; ay += uy * s.need; left -= s.need; s.need = Math.max(1, w.params.spacing);
    // a stroke that crosses an island lays nothing on the land; it picks up again on the far water
    if (!s.dropped) { if (islandAt(w, s.sx, s.sy) < 0) dropTreat(w, s.sx, s.sy); s.dropped++; }
    if (islandAt(w, ax, ay) < 0) dropTreat(w, ax, ay);
    s.dropped++;
  }
  s.need -= left; s.x = x; s.y = y;
}
export function strokeEnd(w) { const s = w.stroke; w.stroke = null; if (s && !s.dropped) dropTreat(w, s.sx, s.sy); }
export function strokeCancel(w) { w.stroke = null; }
// A ripple ring: size is how far it spreads, life how long it lasts, k its strength (how dark it is), 1 for a treat's.
// The push it gives a pad scales with both its strength and its size, a treat's ring (34 px) pushing in full.
function ripple(w, x, y, size, life, k = 1) {
  if (w.ripples.length >= 64) w.ripples.shift();
  w.ripples.push({ x, y, age: 0, size, life, k });
}
// A ripple's ring radius at a given age.
const rippleR = (q, age) => 2 + q.size * Math.sqrt(Math.min(1, Math.max(0, age) / q.life));

// ----- rocks -----
// A few stones stand in the water. Seen from above a stone is a worn, faceted lump: 5 to 7 seeded vertices round its
// centre at unequal bearings and 0.6 to 1 of its size, one or two of them drawn in toward the chord of their
// neighbours so the outline runs nearly flat there, the whole drawn as a curve through the vertices' midpoints. A
// stone laid against another turns a full vertex toward it, and the other bulges a vertex back, so the two meet.
// Stones do not move; they are fixed circles of radius r (the size, so the whole lump lies inside) that the fish steer
// round like a shore, the striders skate round and the pads are pushed off. Where they stand is the layout's (below).
// rock: { x, y, r (size, px), t (bearing of each vertex), k (radius of each vertex, of r), grp (0 the outcrop, 1 the
//   group in open water) }
const rockTarget = (w) => Math.max(0, Math.round(w.coarse ? w.params.rocksTouch : w.params.rocks));
// A fish keeps ROCK_SHORE px off a stone, less than the `shore` it keeps off an island: a stone is small enough to slip
// round, and the full shore margin round the larger stones made the fish bunch.
const ROCK_EDGE = 30, ROCK_OVER = 0.35, ROCK_FULL = 0.95, ROCK_SHORE = 6;
// Nothing laid in the water (a stone or a pad) comes within CLEAR px of an island's outermost drawn extent: the coast
// at the top of the swell (the low-swell coast S plus the swell's full span), then the widest band of shallows, then
// the reach of the lapping rings. The stones and the pads stand away from the island at every point of the swell.
const CLEAR = 24;
// The outcrop stands OUTCROP_NEAR to OUTCROP_FAR px off that extent: near enough to belong to that shore, with a
// channel between wide enough for the school to pass without funnelling. Its main stone's edge is laid in that span and
// the stones leaning on it keep OUTCROP_NEAR off the extent, so the outcrop's nearest edge stays in it.
const OUTCROP_NEAR = 60, OUTCROP_FAR = 100;
// The island's outermost drawn extent at bearing t, from its centre: the coast at the top of the swell, then the wider
// of the shallows' outer band and the lapping rings' outermost ring (3 + reach px out; the two overlap, not stack).
export function outerCoast(o, t, p) { return calmCoast(o, t) + (o.calm || 0) + Math.max(SHALLOWS[0][0], 3 + p.reach); }
// The distance from (x,y) out past that extent grown by g px, along the bearing from the island's centre.
export function outerGap(o, x, y, g, p) { return Math.hypot(x - o.x, y - o.y) - outerCoast(o, Math.atan2(y - o.y, x - o.x), p) - g; }
// The distance from (x,y) to the circle g px outside the disc q, a stone or a pad (negative inside it); the unit
// normal out of the disc at (x,y) goes to out.
function discGap(q, x, y, g, out) {
  const dx = x - q.x, dy = y - q.y, d = Math.hypot(dx, dy);
  if (d > 1e-6) { out.x = dx / d; out.y = dy / d; } else { out.x = 1; out.y = 0; }
  return d - q.r - g;
}
// Holds (x,y) 2 px out of every stone, into out. Where that would put it on the land (a coast swollen against a stone
// by the shore closes the gap between them) it goes to the stone's seaward side instead, straight out from the island.
const OFF = { x: 0, y: 0 };
function offStones(w, x, y, out) {
  out.x = x; out.y = y;
  for (const q of w.rocks) {
    if (discGap(q, out.x, out.y, 2, NRM) >= 0) continue;
    let nx = q.x + NRM.x * (q.r + 2), ny = q.y + NRM.y * (q.r + 2);
    for (const o of w.islands) {
      if (shoreR(o, nx, ny, 0) >= 1) continue;
      const dx = q.x - o.x, dy = q.y - o.y, d = Math.hypot(dx, dy) || 1;
      nx = q.x + (dx / d) * (q.r + 2); ny = q.y + (dy / d) * (q.r + 2);
    }
    out.x = nx; out.y = ny;
  }
}
// A stone of the given size at (x,y); with a bearing `face`, its first vertex points that way at full size.
function makeRock(r, x, y, size, face) {
  const n = 5 + Math.floor(r() * 3), a = face == null ? r() * TAU : face, t = [], k = [];
  for (let i = 0; i < n; i++) { t.push(a + ((i + (i ? 0.35 * (r() - 0.5) : 0)) / n) * TAU); k.push(0.72 + 0.28 * r()); }
  if (face != null) k[0] = ROCK_FULL + (1 - ROCK_FULL) * r();
  // the flatter facets: a vertex drawn most of the way in to the chord between its neighbours, never below 0.6
  const free = [];
  for (let i = face == null ? 0 : 1; i < n; i++) free.push(i);
  for (let f = r() < 0.5 ? 2 : 1; f > 0; f--) {
    const i = free.splice(Math.floor(r() * free.length), 1)[0], p = (i + n - 1) % n, q = (i + 1) % n;
    const px = k[p] * Math.cos(t[p]), py = k[p] * Math.sin(t[p]), dx = k[q] * Math.cos(t[q]) - px, dy = k[q] * Math.sin(t[q]) - py;
    const ux = Math.cos(t[i]), uy = Math.sin(t[i]), den = ux * dy - uy * dx, s = den > 1e-6 ? (px * dy - py * dx) / den : k[i];
    if (s < k[i]) k[i] = Math.max(0.6, k[i] + 0.85 * (s - k[i]));
  }
  return { x, y, r: size, t, k };
}
// Turns the vertex of stone q nearest bearing b out to full size, so a stone laid against it there meets it.
function bulge(q, b) {
  let j = 0, bd = Infinity;
  q.t.forEach((t, i) => { const d = Math.abs(Math.atan2(Math.sin(t - b), Math.cos(t - b))); if (d < bd) { bd = d; j = i; } });
  q.k[j] = Math.max(q.k[j], ROCK_FULL);
}
// Whether a stone of size r may stand at (x,y): open water, its edge `clear` px (CLEAR by default) off every island's
// outermost drawn extent, ROCK_EDGE inside the screen, and overlapping no stone by more than ROCK_OVER of the smaller:
// the lumps draw inside their circles, so two that touch must overlap as circles.
function rockFree(w, x, y, r, list = w.rocks, clear = CLEAR) {
  if (x < ROCK_EDGE + r || x > w.w - ROCK_EDGE - r || y < ROCK_EDGE + r || y > w.h - ROCK_EDGE - r) return false;
  for (const o of w.islands) if (outerGap(o, x, y, r + clear, w.params) < 0) return false;
  for (const q of list) if (Math.hypot(q.x - x, q.y - y) < q.r + r - ROCK_OVER * Math.min(q.r, r)) return false;
  return true;
}
const ROCK_N = 7, RX = new Float32Array(ROCK_N), RY = new Float32Array(ROCK_N);
// A stone's outline, offset by (ox,oy), added to the current path as a closed curve through the vertices' midpoints.
function rockPath(ctx, q) {
  const n = q.k.length;
  for (let i = 0; i < n; i++) { const t = q.t[i], R = q.r * q.k[i]; RX[i] = q.x + Math.cos(t) * R; RY[i] = q.y + Math.sin(t) * R; }
  ctx.moveTo((RX[n - 1] + RX[0]) / 2, (RY[n - 1] + RY[0]) / 2);
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; ctx.quadraticCurveTo(RX[i], RY[i], (RX[i] + RX[j]) / 2, (RY[i] + RY[j]) / 2); }
  ctx.closePath();
}

// ----- lily pads -----
// A pad is a disc with a slit cut toward its own heading, floating on open water. The pads are laid out in clusters by
// the layout below, each tethered to its planned spot by a weak spring, so a cluster keeps its composition while its
// pads drift a little on a slow flow that turns over the page and over time, turn a little as they go, nudge each
// other apart, keep off the islands, the stones and the screen edges, and take a push outward from each ripple ring
// that passes under them. Everything here
// runs on the pads' own seeded source (prand), apart from the fishes', so pads never change how the fish draw theirs.
// pad: { x, y, r, hx, hy (its planned spot), cl (its cluster, 0 the main one), a (heading of the notch), vx, vy (the push
//   still carried from ripples), va, ph, since (s since a push) }
const padTarget = (w) => Math.max(0, Math.round(w.coarse ? w.params.padsTouch : w.params.pads));
const RIPPLE_FULL = 34, PAD_EDGE = 30, PAD_MAX = 5, PAD_DRAG = 0.6, PAD_TETHER = 0.25, PAD_APART = 0.3;
// ----- the layout of the stones and the pads -----
// The stones and the pads are laid out together from one seeded plan, so the pond reads as a composed scene rather
// than things strewn at random. The screen is split at its middle across its longer side; the stones take one half
// and the pads the other. No stone and no pad comes within CLEAR px of an island's outermost drawn extent (outerCoast:
// the coast at high swell, its shallows and its lapping rings). The stones: an outcrop of 3 to 5 standing off the shore
// of the island on their side at a seeded bearing: a main stone (30 to 40 px), its edge CLEAR to CLEAR + OUTCROP_SEAT
// px past that extent; one or two supports (16 to 26 px) trailing seaward against it, off the line to alternate sides by their own amounts; and satellites (8 to 14 px) against any of them. Each stone touches the one it
// leans on, overlapping it as circles by 10 to 35 percent of the smaller radius, so the group reads as one outcrop
// and never a row. The rest stand as a smaller group in open water on the same side, built the same way at 0.6 of the
// size. The pads: a main cluster of 5 or 6 (one or two large, the rest medium and small, 0.3 to 0.8 of a radius
// apart) and a satellite of 2 or 3 further along, each centred PAD_CENTRE px or more inside the screen.
// No pad comes within PLAN_ROCK px of a stone, no cluster centre within PLAN_COAST px of an island's outermost drawn
// extent (bar the outcrop's), nothing within PLAN_EDGE px of the screen's edge. The pads
// get some room on top of those limits for their wander.
// Where the screen is too small for all of that, the composition gives way in order: the open-water stone group is
// dropped (its stones are not placed), then the pads may cross the middle when their half has no room for a cluster
// centre, still PLAN_ROCK off the stones and CLEAR off the islands; the satellite's pads join the main cluster, and a
// pad with no room in its cluster takes any open water. plan.gaveWay records that it had to. Whatever still finds no
// room is left out: the counts shrink rather than the rules bend. A cluster centre keeps PAD_CENTRE off the screen's
// edge on a screen PAD_WIDE px wide or more, PAD_CENTRE_NARROW below that.
// The plan is laid again when the islands first arrive, a moment after a resize, and when a count changes. It has a
// seeded source of its own; the pads' drift keeps theirs (prand), and the fish's is untouched.
const PLAN_ROCK = 90 + 20, PLAN_COAST = CLEAR + 30, PLAN_EDGE = 30, PAD_CENTRE = 90 + 30, PAD_CENTRE_NARROW = 90, PAD_WIDE = 1600, RELAY = 0.6;
// Where (x,y) lies against the screen's middle, across its longer side: below 0 on the left (or the top).
const sideOf = (w, x, y) => (w.w >= w.h ? x - w.w / 2 : y - w.h / 2);
function landClear(w, x, y) { let c = Infinity; for (const o of w.islands) c = Math.min(c, outerGap(o, x, y, 0, w.params)); return c; }
const edgeClear = (w, x, y) => Math.min(x, w.w - x, y, w.h - y);
function rockClear(w, x, y) { let c = Infinity; for (const q of w.rocks) c = Math.min(c, Math.hypot(q.x - x, q.y - y) - q.r); return c; }
// Whether a pad of radius r may be laid at (x,y) among the pads P: open water, clear of the stones by PLAN_ROCK and of
// the other pads by the cluster's closest spacing.
function padOk(w, P, x, y, r) {
  if (edgeClear(w, x, y) < PLAN_EDGE + r) return false;
  for (const o of w.islands) if (outerGap(o, x, y, r + CLEAR, w.params) < 0) return false;
  if (rockClear(w, x, y) < PLAN_ROCK + r) return false;
  for (const q of P) if (Math.hypot(q.x - x, q.y - y) < q.r + r + PAD_APART * Math.min(q.r, r)) return false;
  return true;
}
function layPond(w) {
  const r = rng((w.seed ^ 0x1a7d5ca) >>> 0), nr = rockTarget(w), np = padTarget(w), rs = r() < 0.5 ? -1 : 1;
  w.laidIsl = w.islands.length; w.laidFor = planKey(w); w.relay = 0;
  // the stones: sizes first, largest to smallest
  const nOut = nr < 3 ? nr : Math.min(5, Math.max(3, Math.round(nr * 0.6))), nSup = nOut >= 4 && r() < 0.5 ? 2 : 1;
  const sizes = (n, sup, k) => { const L = []; for (let i = 0; i < n; i++) L.push(k * (i === 0 ? 30 + 10 * r() : i <= sup ? 16 + 10 * r() : 8 + 6 * r())); return L; };
  const out = sizes(nOut, nSup, 1), grp = sizes(nr - nOut, 1, 0.6);
  w.rocks = [];
  // plan.gaveWay: the screen had no room for the whole composition, and the open-water group was dropped or the pads
  // crossed the middle
  const plan = (w.plan = { gaveWay: false });
  layOutcrop(w, r, rs, out, nSup);
  if (grp.length && !layGroup(w, r, rs, grp)) plan.gaveWay = true;
  // the pads, on the other side
  const nSat = np >= 8 ? 2 + (r() < 0.5 ? 1 : 0) : np >= 5 ? 2 : 0, nMain = np - nSat, nBig = nMain >= 4 && r() < 0.5 ? 2 : 1;
  const main = [], sat = [];
  for (let i = 0; i < nMain; i++) main.push(i < nBig ? 18 + 4 * r() : r() < 0.55 ? 13 + 4 * r() : 10 + 2 * r());
  for (let i = 0; i < nSat; i++) sat.push(r() < 0.5 ? 13 + 4 * r() : 10 + 2 * r());
  const P = [], c0 = padCentre(w, r, -rs, null);
  cluster(w, r, P, c0, main, 0);
  const c1 = nSat ? padCentre(w, r, -rs, c0) : null;
  cluster(w, r, P, c1 || c0, sat, c1 ? 1 : 0);
  // the pads' drift keeps its own source; a relaid plan with as many pads keeps the same pads, so the flowers and the
  // fish hiding under them keep theirs
  w.prand = rng(w.padSeed);
  const pr = w.prand;
  w.flow = { a0: pr() * TAU, p1: pr() * TAU, p2: pr() * TAU };
  if (w.pads.length === P.length) P.forEach((q, i) => Object.assign(w.pads[i], q));
  else { w.pads = P; for (const f of w.fish) f.pad = null; }
  // the pond floor, last, in the water the stones and pads leave open
  layFloor(w, r);
}
// What the plan was laid for: the counts of everything it places. A change in any of them lays it again.
const planKey = (w) => [rockTarget(w), padTarget(w), ...floorTarget(w)].join(':');

// ----- the pond floor -----
// Things resting on the bottom: a sunken branch and sunken leaves. They are static, laid with the plan, and
// drawn with the ground as faint ink strokes. Each keeps its centre (x,y), its shape relative to that centre, and r, the
// radius of a disc round the centre holding every point of the shape (control points included). Each stands
// FLOOR_LAND px off every island's outermost drawn extent, FLOOR_NEAR px off every stone and every pad's home, and
// FLOOR_EDGE px inside the screen, and clear of the header band (FLOOR_TOP) and the footer band (FLOOR_FOOT).
const FLOOR_LAND = 12, FLOOR_NEAR = 30, FLOOR_EDGE = 30, FLOOR_TOP = 80, FLOOR_FOOT = 100;
// [leaves, branches]
const floorTarget = (w) => { const p = w.params; return [Math.max(0, Math.round(w.coarse ? p.leavesTouch : p.leaves)), p.branch >= 0.5 ? 1 : 0]; };
function floorOk(w, x, y, r) {
  if (x - r < FLOOR_EDGE || w.w - x - r < FLOOR_EDGE || y - r < Math.max(FLOOR_EDGE, FLOOR_TOP) || w.h - y - r < Math.max(FLOOR_EDGE, FLOOR_FOOT)) return false;
  if (landClear(w, x, y) < r + FLOOR_LAND) return false;
  for (const q of w.rocks) if (Math.hypot(q.x - x, q.y - y) - q.r - r < FLOOR_NEAR) return false;
  for (const q of w.pads) if (Math.hypot(q.hx - x, q.hy - y) - q.r - r < FLOOR_NEAR) return false;
  return true;
}
// A sunken leaf: a pointed ellipse 10 to 16 px long with a midrib running on a little past one tip as its stalk.
function makeLeaf(r) {
  const L = 10 + 6 * r();
  return { kind: 'leaf', L, wd: L * (0.32 + 0.1 * r()), t: r() * TAU, r: 0.65 * L };
}
// A sunken branch, a chunk of driftwood: a slightly bent limb 50 to 90 px long (k scales the part over 50 px), 14 to 22
// px wide at its thick end tapering to 5 to 8 px at the other (never below 5), both sides weathered with seeded bumps and
// hollows of 1 to 2 px every 8 to 12 px; one end broken off in a jagged cut, the other worn round; one or two stubby
// forks, each 0.5 of the local width where it leaves and 4 to 8 px long past the limb's edge, worn round at a 2 to 3 px
// tip. It keeps its skeleton, lines ([x0, y0, cx, cy, x1, y1] quadratics relative to the centre, the limb first, then
// the forks), and what is drawn: outline, one closed polyline walked round the limb with each fork's lobe taken in
// along the way, so no line crosses the wood; grain, three or four runs along the long axis; and a knot. r holds every
// point of the outline.
function makeBranch(r, k = 1) {
  const L = 50 + 40 * k * r(), t = r() * TAU, c = Math.cos(t), s = Math.sin(t), bend = (r() < 0.5 ? -1 : 1) * (0.04 + 0.08 * r()) * L;
  const main = [-c * L / 2, -s * L / 2, -s * bend, c * bend, c * L / 2, s * L / 2], lines = [main];
  const at = (u, k) => (1 - u) * (1 - u) * main[k] + 2 * u * (1 - u) * main[k + 2] + u * u * main[k + 4];
  const dat = (u, k) => 2 * (1 - u) * (main[k + 2] - main[k]) + 2 * u * (main[k + 4] - main[k + 2]);
  // the thick end at u = 0
  const w0 = 14 + 8 * r(), w1 = 5 + 3 * r(), width = (u) => w0 + (w1 - w0) * u;
  // weathering along one side: a seeded offset every 8 to 12 px, mostly alternating bump and hollow, eased between
  const wear = () => {
    const K = [];
    for (let a = 0, v = r() < 0.5 ? -1 : 1; a < L + 12; a += 8 + 4 * r(), v = r() < 0.75 ? -v : v) K.push([a / L, Math.sign(v) * (1 + r())]);
    return (u) => {
      let i = 0;
      while (i < K.length - 2 && K[i + 1][0] < u) i++;
      const [ua, va] = K[i], [ub, vb] = K[i + 1], f = Math.min(1, Math.max(0, (u - ua) / (ub - ua)));
      return va + ((vb - va) * (1 - Math.cos(f * Math.PI))) / 2;
    };
  };
  const wl = wear(), wr = wear(), brokeThick = r() < 0.5;
  // the worn end is trimmed by its half width so its round cap ends where the limb does
  const u0 = brokeThick ? 0 : w0 / 2 / L, u1 = brokeThick ? 1 - w1 / 2 / L : 1, N = Math.ceil(L / 2);
  const S = [];
  for (let i = 0; i <= N; i++) {
    const u = u0 + ((u1 - u0) * i) / N, tx = dat(u, 0), ty = dat(u, 1), m = Math.hypot(tx, ty) || 1;
    // the two half widths, each at least 2.5 so the wood is never under 5 px
    S.push({ u, x: at(u, 0), y: at(u, 1), tx: tx / m, ty: ty / m, nx: -ty / m, ny: tx / m, hl: Math.max(2.5, width(u) / 2 + wl(u)), hr: Math.max(2.5, width(u) / 2 + wr(u)) });
  }
  const side = (s, k) => (k > 0 ? [s.x + s.nx * s.hl, s.y + s.ny * s.hl] : [s.x - s.nx * s.hr, s.y - s.ny * s.hr]);
  // how far a point lies inside the limb: that side's half width at the nearest sample less the distance to it
  const inside = (x, y) => {
    let best = Infinity, j = 0;
    S.forEach((s, i) => { const e = Math.hypot(x - s.x, y - s.y); if (e < best) { best = e; j = i; } });
    const s = S[j], h = (x - s.x) * s.nx + (y - s.y) * s.ny >= 0 ? s.hl : s.hr;
    return { depth: h - best, j };
  };
  // a worn end round centre (x, y), from the side point a (half width ha) through the direction (fx, fy) to the side
  // point b (half width hb)
  const round = (x, y, nx, ny, ha, hb, fx, fy, out) => {
    for (let j = 1; j < 8; j++) { const a = (j / 8) * Math.PI, cs = Math.cos(a), sn = Math.sin(a), h = (ha * (1 + cs) + hb * (1 - cs)) / 2; out.push([x + (nx * cs + fx * sn) * h, y + (ny * cs + fy * sn) * h]); }
  };
  // a broken end: from side point a to side point b in two or three short segments, the corners bitten in 1 to 4 px
  const jag = (a, b, ix, iy, out) => {
    const n = 2 + (r() < 0.5 ? 1 : 0);
    for (let j = 1; j < n; j++) { const f = (j + (r() - 0.5) * 0.4) / n, dd = 1 + 3 * r(); out.push([a[0] + (b[0] - a[0]) * f + ix * dd, a[1] + (b[1] - a[1]) * f + iy * dd]); }
  };
  // the limb's two edges, left (+1) and right (-1), each walked from the thick end, with the forks' lobes taken in
  const edges = { 1: S.map((s) => ({ u: s.u, p: side(s, 1) })), '-1': S.map((s) => ({ u: s.u, p: side(s, -1) })) };
  const nf = 1 + (r() < 0.5 ? 1 : 0), k0 = r() < 0.5 ? 1 : -1;
  for (let i = 0; i < nf; i++) {
    const uf = 0.3 + 0.4 * ((i + r()) / nf), P = S.reduce((b, s) => (Math.abs(s.u - uf) < Math.abs(b.u - uf) ? s : b), S[0]);
    const kk = i % 2 ? -k0 : k0, h = kk > 0 ? P.hl : P.hr, len = 4 + 4 * r(), bw = 0.5 * (P.hl + P.hr), bt = 2 + r();
    // the stub leans 0.4 to 1 rad off square toward the thin end
    const b = 0.4 + 0.6 * r(), dx = Math.cos(b) * kk * P.nx + Math.sin(b) * P.tx, dy = Math.cos(b) * kk * P.ny + Math.sin(b) * P.ty;
    const reach = h / Math.cos(b) + len, end = reach - bt / 2;
    lines.push([P.x, P.y, P.x + dx * reach / 2, P.y + dy * reach / 2, P.x + dx * reach, P.y + dy * reach]);
    const wd = (e) => (e <= reach - len ? bw : bw + ((bt - bw) * (e - reach + len)) / len);
    const B = [];
    for (let j = 0; j <= 16; j++) { const e = (end * j) / 16; B.push({ x: P.x + dx * e, y: P.y + dy * e, nx: -dy, ny: dx, h: wd(e) / 2 }); }
    const bside = (q, m) => [q.x + m * q.nx * q.h, q.y + m * q.ny * q.h];
    // each side of the lobe leaves the limb where it first stands outside the limb's outline
    const out = (m) => { for (let j = 0; j < B.length; j++) { const p = bside(B[j], m), o = inside(p[0], p[1]); if (o.depth < 0) return { j, at: o.j }; } return { j: B.length - 1, at: inside(...bside(B[B.length - 1], m)).j }; };
    const A = out(1), C = out(-1), [first, fm] = A.at <= C.at ? [A, 1] : [C, -1], [last, lm] = A.at <= C.at ? [C, -1] : [A, 1];
    const loop = [], tip = B[B.length - 1];
    for (let j = first.j; j < B.length; j++) loop.push(bside(B[j], fm));
    round(tip.x, tip.y, fm * tip.nx, fm * tip.ny, tip.h, tip.h, dx, dy, loop);
    for (let j = B.length - 1; j >= last.j; j--) loop.push(bside(B[j], lm));
    const lo = S[Math.min(first.at, last.at)].u, hi = S[Math.max(first.at, last.at)].u, e = edges[kk].filter((v) => v.lobe || v.u < lo || v.u > hi);
    const ins = e.findIndex((v) => !v.lobe && v.u > hi);
    e.splice(ins < 0 ? e.length : ins, 0, ...loop.map((p) => ({ u: P.u, p, lobe: true })));
    edges[kk] = e;
  }
  const a = S[0], z = S[N], pts = edges[1].map((v) => v.p);
  if (brokeThick) round(z.x, z.y, z.nx, z.ny, z.hl, z.hr, z.tx, z.ty, pts); else jag(side(z, 1), side(z, -1), -z.tx, -z.ty, pts);
  pts.push(...edges[-1].map((v) => v.p).reverse());
  if (brokeThick) jag(side(a, -1), side(a, 1), a.tx, a.ty, pts); else round(a.x, a.y, -a.nx, -a.ny, a.hr, a.hl, -a.tx, -a.ty, pts);
  // grain: three or four runs along the long axis spread across the width, each over a seeded stretch of the limb
  const grain = [], ng = 3 + (r() < 0.5 ? 1 : 0);
  for (let g = 0; g < ng; g++) {
    const f = -0.62 + (1.24 * (g + 0.5)) / ng + (r() - 0.5) * 0.12, ua = u0 + 0.04 + 0.4 * r() * (u1 - u0), ub = Math.min(u1 - 0.04, ua + (0.3 + 0.35 * r()) * (u1 - u0)), run = [];
    for (const s of S) if (s.u >= ua && s.u <= ub) { const o = f * (f > 0 ? s.hl : s.hr); run.push([s.x + s.nx * o, s.y + s.ny * o]); }
    if (run.length > 1) grain.push(run);
  }
  // the knot: a small oval along the grain at a seeded place inside the limb
  const K = S[Math.round((0.2 + 0.6 * r()) * N)], ko = (r() - 0.5) * 0.5 * (K.hl + K.hr) / 2;
  const knot = { x: K.x + K.nx * ko, y: K.y + K.ny * ko, a: 1.5, b: 1, t: Math.atan2(K.ty, K.tx) };
  const R = Math.max(...pts.map((p) => Math.hypot(p[0], p[1])));
  return { kind: 'branch', lines, outline: pts, grain, knot, r: R };
}
// Lays the floor, largest first: each thing where the best of its seeded tries keeps it furthest from the others and
// from the land, so the floor spreads over the open water. A thing with no room is made again, a branch shorter each
// time (three rounds); one with no room still is left out.
function layFloor(w, r) {
  const [nl, nr] = floorTarget(w), makers = [];
  for (let i = 0; i < nr; i++) makers.push((k) => makeBranch(r, k));
  for (let i = 0; i < nl; i++) makers.push(() => makeLeaf(r));
  const F = (w.floor = []);
  for (const make of makers) for (const k of [1, 0.5, 0]) {
    const q = make(k);
    let best = null, bs = -Infinity;
    for (let t = 0; t < 80; t++) {
      const x = r() * w.w, y = r() * w.h;
      if (!floorOk(w, x, y, q.r)) continue;
      let apart = 300;
      for (const o of F) apart = Math.min(apart, Math.hypot(o.x - x, o.y - y) - o.r - q.r);
      const sc = apart + Math.min(landClear(w, x, y) - q.r, 200) / 2 + 30 * r();
      if (sc > bs) { bs = sc; best = { x, y }; }
    }
    if (best) { F.push(Object.assign(q, best)); break; }
  }
}
function floorPath(ctx, q) {
  const { x, y } = q;
  if (q.kind === 'leaf') {
    const c = Math.cos(q.t), s = Math.sin(q.t), h = q.L / 2, ax = x - c * h, ay = y - s * h, bx = x + c * h, by = y + s * h;
    ctx.moveTo(ax, ay); ctx.quadraticCurveTo(x - s * q.wd, y + c * q.wd, bx, by); ctx.quadraticCurveTo(x + s * q.wd, y - c * q.wd, ax, ay);
    ctx.moveTo(x + c * 0.65 * q.L, y + s * 0.65 * q.L); ctx.lineTo(ax, ay);
  } else {
    q.outline.forEach((p, i) => (i ? ctx.lineTo(x + p[0], y + p[1]) : ctx.moveTo(x + p[0], y + p[1])));
    ctx.closePath();
  }
}
// The branch's grain and knot, drawn after its outline: the grain at half the floor's opacity, the knot at full.
function drawGrain(ctx, q, alpha) {
  ctx.globalAlpha = alpha / 2;
  for (const g of q.grain) { ctx.beginPath(); g.forEach((p, i) => (i ? ctx.lineTo(q.x + p[0], q.y + p[1]) : ctx.moveTo(q.x + p[0], q.y + p[1]))); ctx.stroke(); }
  ctx.globalAlpha = alpha;
  if (q.knot) { const k = q.knot; ctx.beginPath(); ctx.ellipse(q.x + k.x, q.y + k.y, k.a, k.b, k.t, 0, TAU); ctx.stroke(); }
}
// The outcrop: the island on the stones' side (the one furthest that way), and the first bearing from a seeded start
// round which the whole outcrop fits; failing that, the bearing that fits the most.
function layOutcrop(w, r, rs, sizes, nSup) {
  if (!sizes.length) return;
  const o = w.islands.slice().sort((a, b) => rs * (sideOf(w, b.x, b.y) - sideOf(w, a.x, a.y)))[0], b0 = r() * TAU;
  let best = [];
  for (let t = 0; t < 24 && best.length < sizes.length; t++) {
    const b = b0 + (t / 24) * TAU, L = [], s0 = sizes[0];
    // the main stone off the shore, its edge OUTCROP_NEAR to OUTCROP_FAR px past the island's outermost drawn extent;
    // with no island yet, in open water on its side
    let x, y;
    if (o) { const d = outerCoast(o, b, w.params) + OUTCROP_NEAR + (OUTCROP_FAR - OUTCROP_NEAR) * r() + s0; x = o.x + Math.cos(b) * d; y = o.y + Math.sin(b) * d; } else { x = w.w / 2 + rs * (0.25 + 0.1 * r()) * (w.w >= w.h ? w.w : 0); y = w.h / 2 + rs * (0.25 + 0.1 * r()) * (w.w >= w.h ? 0 : w.h); }
    if (!(sideOf(w, x, y) * rs > 0) || !rockFree(w, x, y, s0, L, OUTCROP_NEAR)) continue;
    L.push(Object.assign(makeRock(r, x, y, s0), { grp: 0 }));
    trail(w, r, L, sizes.slice(1), b, rs, nSup, OUTCROP_NEAR);
    if (L.length > best.length) best = L;
  }
  w.rocks.push(...best);
}
// Adds stones of the given sizes to the group L, whose first stone is its main one, trailing along bearing b: the
// first nSup (the supports) against the main stone, 0.3 to 1.1 rad off the line to alternate sides; the rest (the
// satellites) against any stone of the group, within 1.8 rad of the line. Each overlaps the stone it leans on, as
// circles, by 10 to 35 percent of the smaller radius (its centre 0.85 to 1 of the two radii summed away), and the two
// turn a full vertex to each other. A stone that finds no room is left out.
function trail(w, r, L, sizes, b, rs, nSup, clear = CLEAR) {
  let side = r() < 0.5 ? -1 : 1;
  const grp = L[0] ? L[0].grp : 0;
  sizes.forEach((s, i) => {
    let ok = null;
    for (let t = 0; t < 40 && !ok && L.length; t++) {
      const sup = i < nSup, par = sup ? L[0] : L[Math.floor(r() * L.length)];
      const a = sup ? b + side * (0.3 + 0.8 * r()) : b + (2 * r() - 1) * 1.8, S = par.r + s;
      const d = Math.max(0.85 * S, S - (0.1 + 0.25 * r()) * Math.min(par.r, s)), x = par.x + Math.cos(a) * d, y = par.y + Math.sin(a) * d;
      if (sideOf(w, x, y) * rs > 0 && rockFree(w, x, y, s, L === w.rocks ? w.rocks : [...w.rocks, ...L], clear)) ok = { x, y, par, a };
    }
    if (!ok) return;
    L.push(Object.assign(makeRock(r, ok.x, ok.y, s, ok.a + Math.PI), { grp }));
    bulge(ok.par, ok.a);
    if (i < nSup) side = -side;
  });
}
// The second group: a centre on open water on the stones' side, PLAN_COAST off the coasts and 120 px clear of the
// outcrop, as near 240 px from it as the seeded tries find; its main stone there and the rest built against it as the
// outcrop's are, trailing away from the nearest island within 0.8 rad, so the group's middle lies off its main stone. False if there is no such centre.
function layGroup(w, r, rs, sizes) {
  const R = w.rocks, ox = R.length ? R.reduce((a, q) => a + q.x, 0) / R.length : w.w / 2, oy = R.length ? R.reduce((a, q) => a + q.y, 0) / R.length : w.h / 2;
  let c = null, cs = -Infinity;
  for (let t = 0; t < 120; t++) {
    const x = (0.05 + 0.9 * r()) * w.w, y = (0.05 + 0.9 * r()) * w.h;
    if (!(sideOf(w, x, y) * rs > 0) || landClear(w, x, y) < PLAN_COAST || edgeClear(w, x, y) < PLAN_EDGE + 60 || rockClear(w, x, y) < 120) continue;
    const sc = -Math.abs(Math.hypot(x - ox, y - oy) - 240) + 40 * r();
    if (sc > cs) { cs = sc; c = { x, y }; }
  }
  if (!c || !rockFree(w, c.x, c.y, sizes[0])) return false;
  // the group trails away from the nearest island, so its middle lies further from the coast than its main stone
  const o = w.islands.reduce((a, q) => (!a || shoreGap(q, c.x, c.y, 0) < shoreGap(a, c.x, c.y, 0) ? q : a), null);
  const b = (o ? Math.atan2(c.y - o.y, c.x - o.x) : 0) + (o ? 0.8 * (2 * r() - 1) : r() * TAU), L = [Object.assign(makeRock(r, c.x, c.y, sizes[0]), { grp: 1 })];
  trail(w, r, L, sizes.slice(1), b, rs, 1);
  R.push(...L);
  return true;
}
// A pad cluster's centre on open water on side ps (the main one), or 150 to 280 px along from the main one (a
// satellite, from): PLAN_COAST off the coasts, PLAN_ROCK and a cluster's reach off the stones, PAD_CENTRE (PAD_CENTRE_NARROW on a narrower screen) off the screen's edge. The
// main one takes the openest of the seeded tries, a satellite the nearest to 210 px along; failing the side, anywhere, and the plan gives way.
function padCentre(w, r, ps, from) {
  let c = null, cs = -Infinity;
  const margin = w.w >= PAD_WIDE ? PAD_CENTRE : PAD_CENTRE_NARROW;
  for (let pass = 0; pass < 2 && !c; pass++) for (let t = 0; t < 120; t++) {
    const x = (0.05 + 0.9 * r()) * w.w, y = (0.05 + 0.9 * r()) * w.h, land = landClear(w, x, y);
    if ((pass === 0 && !(sideOf(w, x, y) * ps > 0)) || land < PLAN_COAST || edgeClear(w, x, y) < margin || rockClear(w, x, y) < PLAN_ROCK + 45) continue;
    const d = from ? Math.hypot(x - from.x, y - from.y) : 0;
    if (from && (d < 150 || d > 280)) continue;
    const sc = (from ? -Math.abs(d - 210) : Math.min(land, 160) + Math.min(rockClear(w, x, y), 300) / 4) + 40 * r();
    if (sc > cs) { cs = sc; c = { x, y }; }
  }
  if (c && !(sideOf(w, c.x, c.y) * ps > 0)) w.plan.gaveWay = true;
  if (c || from) return c;
  w.plan.gaveWay = true;
  return { x: w.w / 2 + ps * (w.w >= w.h ? w.w / 4 : 0), y: w.h / 2 + ps * (w.w >= w.h ? 0 : w.h / 4) };
}
// Lays pads of the given sizes round centre c as cluster cl: each the nearest to c of a dozen seeded spots against a
// pad of the cluster already laid, 0.3 to 0.8 of the smaller radius apart; one with no room there takes open water
// anywhere, and one with none at all is left out.
function cluster(w, r, P, c, sizes, cl) {
  for (const s of sizes) {
    const mine = P.filter((q) => q.cl === cl);
    let ok = null, od = Infinity;
    for (let t = 0; t < 12 * 5; t++) {
      let x, y;
      if (!mine.length) { const a = r() * TAU, d = 8 * r(); x = c.x + Math.cos(a) * d; y = c.y + Math.sin(a) * d; }
      else { const par = mine[Math.floor(r() * mine.length)], a = r() * TAU, d = par.r + s + (PAD_APART + 0.5 * r()) * Math.min(par.r, s); x = par.x + Math.cos(a) * d; y = par.y + Math.sin(a) * d; }
      if (!padOk(w, P, x, y, s)) continue;
      const dc = Math.hypot(x - c.x, y - c.y);
      if (dc < od) { od = dc; ok = { x, y }; }
      if (t >= 11 && ok) break;
    }
    for (let t = 0; t < 120 && !ok; t++) { const x = (0.05 + 0.9 * r()) * w.w, y = (0.05 + 0.9 * r()) * w.h; if (padOk(w, P, x, y, s)) ok = { x, y }; }
    if (!ok) continue;
    P.push({ x: ok.x, y: ok.y, hx: ok.x, hy: ok.y, r: s, cl, a: r() * TAU, vx: 0, vy: 0, va: 0, ph: r() * TAU, since: Infinity });
  }
}
function stepLayout(w, dt) {
  if (w.laidFor !== planKey(w) ||(w.relay > 0 && (w.relay -= dt) <= 0)) layPond(w);
}
function flowAt(w, x, y) {
  const f = w.flow, t = w.t;
  return f.a0 + 0.03 * t + 1.1 * Math.sin(0.0035 * x + 0.05 * t + f.p1) + 1.1 * Math.sin(0.0041 * y - 0.04 * t + f.p2);
}
function stepPads(w, dt) {
  const p = w.params, P = w.pads, r = w.prand;
  if (!w.reduced) {
    const drag = Math.exp(-dt / PAD_DRAG);
    for (const q of P) {
      // a ripple ring that passed under the pad's centre this step pushes it outward and gives it a turn
      for (const g of w.ripples) {
        const dx = q.x - g.x, dy = q.y - g.y, d = Math.hypot(dx, dy);
        if (d > 1e-6 && d <= rippleR(g, g.age) && (g.age - dt <= 0 || d > rippleR(g, g.age - dt))) {
          const k = g.k * Math.min(1, g.size / RIPPLE_FULL);
          q.vx += (dx / d) * p.push * k; q.vy += (dy / d) * p.push * k; q.va += (r() - 0.5) * 0.8 * k; q.since = 0;
        }
      }
      // rings that follow close on each other (a treat dropped, then eaten) do not stack past one push
      const m = Math.hypot(q.vx, q.vy), cap = p.push; if (m > cap) { q.vx *= cap / m; q.vy *= cap / m; }
      // the drift and the soft pushes, bounded together so a pad never hurries on its own account
      const h = flowAt(w, q.x, q.y), s = p.drift * (1 + 0.33 * Math.sin(0.13 * w.t + q.ph));
      // the tether: about 12 px of wander at the mean drift before the spring holds the pad to its spot
      let ux = Math.cos(h) * s + (q.hx - q.x) * PAD_TETHER, uy = Math.sin(h) * s + (q.hy - q.y) * PAD_TETHER;
      for (const o of P) {
        if (o === q) continue;
        const dx = q.x - o.x, dy = q.y - o.y, d = Math.hypot(dx, dy) || 1e-6, room = d - q.r - o.r, want = PAD_APART * Math.min(q.r, o.r);
        if (room < want) { const k = Math.min(1.5, (want - room) / want) * 4; ux += (dx / d) * k; uy += (dy / d) * k; }
      }
      for (const o of w.islands) {
        const gap = outerGap(o, q.x, q.y, q.r + CLEAR, w.params);
        if (gap < 30) { shoreNormal(o, q.x, q.y, NRM); const k = Math.min(1.5, 1 - gap / 30) * 6; ux += NRM.x * k; uy += NRM.y * k; }
      }
      for (const o of w.rocks) {
        const gap = discGap(o, q.x, q.y, q.r, NRM);
        if (gap < 30) { const k = Math.min(1.5, 1 - gap / 30) * 6; ux += NRM.x * k; uy += NRM.y * k; }
      }
      const e = PAD_EDGE + q.r + 30;
      if (q.x < e) ux += ((e - q.x) / 30) * 3; else if (q.x > w.w - e) ux -= ((q.x - (w.w - e)) / 30) * 3;
      if (q.y < e) uy += ((e - q.y) / 30) * 3; else if (q.y > w.h - e) uy -= ((q.y - (w.h - e)) / 30) * 3;
      const um = Math.hypot(ux, uy); if (um > PAD_MAX) { ux *= PAD_MAX / um; uy *= PAD_MAX / um; }
      q.x += (ux + q.vx) * dt; q.y += (uy + q.vy) * dt;
      q.a += (0.06 * Math.sin(0.07 * w.t + q.ph) + q.va) * dt;
      q.vx *= drag; q.vy *= drag; q.va *= drag; q.since += dt;
    }
  }
  // then hard limits, which the soft pushes above keep from ever acting in calm water: apart, off the land and the
  // stones, on screen.
  // They also carry the pads through a resize or an island that moves under them, reduced motion or not
  for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) {
    const a = P[i], b = P[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), need = a.r + b.r;
    if (d >= need) continue;
    const ux = d > 1e-6 ? dx / d : 1, uy = d > 1e-6 ? dy / d : 0, k = (need - d) / 2;
    a.x -= ux * k; a.y -= uy * k; b.x += ux * k; b.y += uy * k;
  }
  for (const q of P) {
    for (const o of w.islands) {
      if (outerGap(o, q.x, q.y, q.r + CLEAR, w.params) >= 0) continue;
      const dx = q.x - o.x, dy = q.y - o.y, d = Math.hypot(dx, dy) || 1e-6, t = Math.atan2(dy, dx), g = outerCoast(o, t, w.params) + q.r + CLEAR;
      q.x = o.x + (dx / d) * g; q.y = o.y + (dy / d) * g;
    }
    for (const o of w.rocks) if (discGap(o, q.x, q.y, q.r, NRM) < 0) { q.x = o.x + NRM.x * (o.r + q.r); q.y = o.y + NRM.y * (o.r + q.r); }
    q.x = Math.min(Math.max(q.x, Math.min(q.r, w.w / 2)), Math.max(w.w - q.r, w.w / 2));
    q.y = Math.min(Math.max(q.y, Math.min(q.r, w.h / 2)), Math.max(w.h - q.r, w.h / 2));
  }
}
// Sends f to hide under the nearest pad within shelter px, with the given chance; true if it went.
function seekPad(w, f, chance) {
  const p = w.params, r = w.prand;
  let best = null, bd = p.shelter;
  for (const q of w.pads) { const d = Math.hypot(q.x - f.x, q.y - f.y); if (d < bd) { bd = d; best = q; } }
  if (!best || !(r() < chance)) return false;
  f.pad = best; f.hide = 3 + 5 * r(); f.under = false; f.seek = 10; f.idle = 0;
  return true;
}

// ----- lotus flowers -----
// A few pads carry a lotus flower, each on a pad from a different cluster, a little off the pad's centre on the side
// away from its slit, so it rides and turns with the pad. A flower lives a slow seeded cycle: a bud for 90 to 180 s,
// opening over 30 s, open for 120 to 240 s, closing over 30 s, then a bud again. The flowers draw from a seeded source
// of their own; when a flower's pad goes (the pads laid out again, or fewer asked for) the flowers are laid again.
// flower: { q (its pad), u, v (offset from the pad's centre in the pad's frame), rot, stage (0 bud, 1 opening, 2 open,
//   3 closing), left, of (s left in the stage, and its length), open (0 bud .. 1 open), x, y }
const flowerTarget = (w) => Math.max(0, Math.round(w.coarse ? w.params.flowersTouch : w.params.flowers));
const stageLen = (r, s) => (s === 0 ? 90 + 90 * r() : s === 2 ? 120 + 120 * r() : 30);
function layFlowers(w, n) {
  const r = rng((w.seed ^ 0xf10e5) >>> 0), P = w.pads, k = 1 + P.reduce((m, q) => Math.max(m, q.cl), 0), taken = new Set();
  w.flowers = []; w.bloomRand = r;
  for (let j = 0; j < n; j++) {
    // a pad from the next cluster, or any free pad once that cluster runs out
    let can = P.filter((q) => q.cl === j % k && !taken.has(q));
    if (!can.length) can = P.filter((q) => !taken.has(q));
    if (!can.length) break;
    const q = can[Math.floor(r() * can.length)], b = Math.PI + (r() - 0.5) * 1.2, d = (0.25 + 0.15 * r()) * q.r;
    taken.add(q);
    const stage = r() < 0.5 ? 0 : 2, of = stageLen(r, stage);
    w.flowers.push({ q, u: Math.cos(b) * d, v: Math.sin(b) * d, rot: r() * TAU, stage, of, left: of * (0.2 + 0.8 * r()), open: stage === 2 ? 1 : 0, x: q.x, y: q.y });
  }
}
function stepFlowers(w, dt) {
  const n = Math.min(flowerTarget(w), w.pads.length);
  if (w.flowers.length !== n || w.flowers.some((f) => !w.pads.includes(f.q))) layFlowers(w, n);
  const r = w.bloomRand;
  for (const f of w.flowers) {
    f.left -= dt;
    while (f.left <= 0) { f.stage = (f.stage + 1) % 4; f.of = stageLen(r, f.stage); f.left += f.of; }
    const u = f.stage === 1 ? 1 - f.left / f.of : f.stage === 3 ? f.left / f.of : f.stage === 2 ? 1 : 0;
    f.open = u * u * (3 - 2 * u);
    const q = f.q, c = Math.cos(q.a), s = Math.sin(q.a);
    f.x = q.x + f.u * c - f.v * s; f.y = q.y + f.u * s + f.v * c;
  }
}

// ----- water striders -----
// A few water striders skate the open water in glides and stops: a dart of 20 to 60 px at `dart` px/s, then a pause of
// 0.5 to 3 s. Each dart starts with a dimple, a small faint ripple that the pads take like any other, scaled down. A
// strider keeps to open water: a dart ends clear of the pads, 20 px off the land and 20 px inside the screen, and a pad
// drifting onto it or a coast swelling under it pushes it aside, so it skates round them. The cursor within 60 px
// sends it darting away. Under reduced motion they stay still. They draw from a seeded source of their own.
// strider: { x, y, a (heading), dart (true while darting), tx, ty (where the dart ends), len, left (s of pause left), darts }
const striderTarget = (w) => Math.max(0, Math.round(w.coarse ? w.params.stridersTouch : w.params.striders));
const STR_LAND = 20, STR_EDGE = 20, STR_PAD = 6, STR_HARD = 4, STR_FLEE = 60;
function striderFree(w, x, y) {
  if (x < STR_EDGE || x > w.w - STR_EDGE || y < STR_EDGE || y > w.h - STR_EDGE) return false;
  for (const o of w.islands) if (shoreGap(o, x, y, STR_LAND) < 0) return false;
  for (const q of w.pads) if (Math.hypot(q.x - x, q.y - y) < q.r + STR_PAD) return false;
  for (const q of w.rocks) if (Math.hypot(q.x - x, q.y - y) < q.r + STR_PAD) return false;
  return true;
}
// Starts a dart along a clear line, away from a heading if one is given; true if one started.
function startDart(w, s, away) {
  const r = w.srand;
  for (let t = 0; t < 16; t++) {
    const a = away == null ? r() * TAU : away + (r() - 0.5) * 1.4, L = 20 + 40 * r(), tx = s.x + Math.cos(a) * L, ty = s.y + Math.sin(a) * L;
    let ok = true;
    for (let k = 1; k <= 4 && ok; k++) ok = striderFree(w, s.x + ((tx - s.x) * k) / 4, s.y + ((ty - s.y) * k) / 4);
    if (!ok) continue;
    s.dart = true; s.a = a; s.tx = tx; s.ty = ty; s.len = L; s.darts++;
    ripple(w, s.x, s.y, 8, 0.7, 0.5);
    return true;
  }
  return false;
}
function stepStriders(w, dt) {
  const p = w.params, n = striderTarget(w), S = w.striders, ptr = w.ptr;
  if (!w.srand) w.srand = rng((w.seed ^ 0x5717de5) >>> 0);
  const r = w.srand;
  for (let t = 0; S.length < n && t < 40; t++) {
    const x = (0.05 + 0.9 * r()) * w.w, y = (0.05 + 0.9 * r()) * w.h;
    if (striderFree(w, x, y)) S.push({ x, y, a: r() * TAU, dart: false, tx: x, ty: y, len: 0, left: 0.5 + 2.5 * r(), darts: 0 });
  }
  if (S.length > n) S.length = n;
  for (const s of S) {
    if (!w.reduced) {
      if (!s.dart && ptr.on && Math.hypot(s.x - ptr.x, s.y - ptr.y) < STR_FLEE) startDart(w, s, Math.atan2(s.y - ptr.y, s.x - ptr.x));
      if (s.dart) {
        // a dart whose end a pad has drifted over stops where it is
        const dx = s.tx - s.x, dy = s.ty - s.y, d = Math.hypot(dx, dy), go = p.dart * dt;
        if (d <= go || !striderFree(w, s.tx, s.ty)) { if (d <= go) { s.x = s.tx; s.y = s.ty; } s.dart = false; s.left = 0.5 + 2.5 * r(); }
        else { s.x += (dx / d) * go; s.y += (dy / d) * go; }
      } else if ((s.left -= dt) <= 0 && !startDart(w, s)) s.left = 0.5 + 2.5 * r();
    }
    // hard limits, reduced motion or not: off the pads and the stones, off the land, on screen
    for (const q of w.pads) if (discGap(q, s.x, s.y, STR_HARD, NRM) < 0) { s.x = q.x + NRM.x * (q.r + STR_HARD); s.y = q.y + NRM.y * (q.r + STR_HARD); }
    for (const q of w.rocks) if (discGap(q, s.x, s.y, STR_HARD, NRM) < 0) { s.x = q.x + NRM.x * (q.r + STR_HARD); s.y = q.y + NRM.y * (q.r + STR_HARD); }
    for (const o of w.islands) if (shoreGap(o, s.x, s.y, STR_LAND) < 0) { onShore(o, s.x, s.y, STR_LAND, PT); s.x = PT.x; s.y = PT.y; }
    s.x = Math.min(Math.max(s.x, Math.min(STR_EDGE, w.w / 2)), Math.max(w.w - STR_EDGE, w.w / 2));
    s.y = Math.min(Math.max(s.y, Math.min(STR_EDGE, w.h / 2)), Math.max(w.h - STR_EDGE, w.h / 2));
  }
}

// ----- beat and glide -----
// A pond fish does not beat its tail all the time. It swims in bouts: a thrust of a few beats that lifts it a little
// above the speed it wants, then a glide with the tail still and the body straightening while drag bleeds the speed
// away, and the next thrust once it has slowed to `low` of what it wants (each fish's own threshold, redrawn every
// glide, so neighbours do not beat in step). The beat rate is fixed for the whole thrust from the speed it aims at,
// through the stride; urgency raises the aim and so the rate, up to maxHz. With nothing wanted the fish hovers,
// sculling with its pectoral fins and giving one slow beat now and then to hold its place.
// A startled fish bursts away along (ux,uy), a unit vector, and may make for the nearest pad to hide under.
function scare(w, f, ux, uy) { f.flee = 0.7; f.fx = ux; f.fy = uy; f.en = 1; if (!f.pad) seekPad(w, f, w.params.shelterChance); }
// Starts a thrust of n beats at hz aiming at speed top, with the tail sweeping `sweep` of its full amplitude.
function kick(w, f, top, n, hz, sweep) { f.top = top; f.left = n; f.hz = hz; f.sweep = sweep; }
function swim(w, f, want, dt) {
  const p = w.params, r = w.rand;
  // sudden urgency (a treat seen, a fright) does not wait for the thrust under way to finish: it speeds that one up
  if (f.left > 0 && want * p.over > f.top * 1.3) { f.top = want * p.over; f.hz = w.reduced ? Math.min(1, thrustHz(f.top, f.len, p)) : thrustHz(f.top, f.len, p); f.left = Math.max(f.left, 2); }
  if (f.left > 0) {
    f.sp += (f.top - f.sp) * (1 - Math.exp(-dt * p.kick));
    const beats = Math.min(f.left, f.hz * dt);
    f.phase = (f.phase + TAU * beats) % TAU; f.left -= beats;
    f.amp += (f.sweep - f.amp) * Math.min(1, dt * 8);
    if (f.left <= 1e-9) { f.left = 0; f.low = p.low * (0.85 + 0.3 * r()); }
  } else {
    // the glide: drag, and the body relaxing toward straight
    f.sp *= Math.exp(-dt / p.coast);
    f.amp *= Math.exp(-dt / 0.35);
    if (want > 1 && f.sp < want * f.low) {
      const urgent = f.en > 0.3, top = want * p.over;
      let n = urgent ? 2 + Math.floor(r() * 3) : 1 + Math.floor(r() * Math.max(1, Math.round(p.beats)));
      if (f.sp < want * 0.4) n++; // from near stillness it takes an extra beat to get going
      kick(w, f, top, n, w.reduced ? Math.min(1, thrustHz(top, f.len, p)) : thrustHz(top, f.len, p), 0.8 + 0.4 * Math.min(1, f.en));
    } else if (want <= 1 && r() < p.hover * dt) kick(w, f, Math.min(p.cruise * 0.25, 8), 1, 0.8, 0.5); // a holding beat
  }
  // the pectoral fins scull all the time, harder the slower the fish
  f.fin = (f.fin + TAU * (0.5 + 0.9 * Math.max(0, 1 - f.sp / Math.max(1, p.cruise))) * dt) % TAU;
}

// Advances the world by dt seconds. Deterministic: the only randomness is the world's own source.
export function step(w, dt) {
  if (!(dt > 0)) return;
  const p = w.params, r = w.rand, F = w.fish, n = F.length;
  w.t += dt;
  // the coasts follow their objects; the swell runs on the world's clock and holds still under reduced motion
  for (const o of w.islands) updateIsland(o, w.outlines[o.i], dt, p, w.reduced, w.t);
  if (n !== target(w)) populate(w);
  else if (w.koiN !== koiTarget(w) || w.koiOf !== n) markKoi(w);
  // the cursor's speed over this step; a still or slow cursor startles nothing
  const ptr = w.ptr;
  if (ptr.on && ptr.seen) { const d = Math.hypot(ptr.x - ptr.px, ptr.y - ptr.py); ptr.speed = d / dt; } else ptr.speed = 0;
  ptr.px = ptr.x; ptr.py = ptr.y; ptr.seen = ptr.on;
  const startle = !w.reduced && ptr.speed > p.startle;

  // treats age and sink; ripples spread
  for (let i = w.treats.length - 1; i >= 0; i--) { const t = w.treats[i]; t.age += dt; if (t.age > p.sink) w.treats.splice(i, 1); }
  for (let i = w.ripples.length - 1; i >= 0; i--) { const q = w.ripples[i]; q.age += dt; if (q.age > q.life) w.ripples.splice(i, 1); }
  stepLayout(w, dt);
  stepPads(w, dt);

  const cosFov = Math.cos((p.fov * Math.PI) / 360);
  const zr2 = p.repel * p.repel, zo2 = p.orient * p.orient, far2 = p.far * p.far;
  const decay = Math.exp(-dt / p.calm), k = Math.max(1, Math.min(NB, Math.round(p.near)));
  // the rate of taking up a destination that keeps about `share` of the fish informed, each for about `keep` s
  const curious = p.share >= 1 ? Infinity : p.share / Math.max(1e-6, 1 - p.share) / Math.max(1, p.keep);
  for (let i = 0; i < n; i++) {
    const f = F[i], hx = Math.cos(f.h), hy = Math.sin(f.h), V2 = (p.vision * f.len) ** 2;
    // everyone too close is avoided; of the rest, the k nearest it can see count; the nearest of all is company to
    // head for when it sees no one
    let rx = 0, ry = 0, nr = 0, m = 0, lone = -1, ld2 = far2;
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      const g = F[j], dx = g.x - f.x, dy = g.y - f.y, d2 = dx * dx + dy * dy;
      if (d2 < 1e-9) continue;
      if (d2 < zr2) { const d = Math.sqrt(d2); rx -= dx / d; ry -= dy / d; nr++; continue; }
      if (d2 < ld2) { ld2 = d2; lone = j; }
      if (d2 > V2 || (dx * hx + dy * hy) / Math.sqrt(d2) < cosFov) continue;
      if (m === k && d2 >= ND[k - 1]) continue;
      let q = m < k ? m++ : k - 1;
      while (q > 0 && ND[q - 1] > d2) { ND[q] = ND[q - 1]; NJ[q] = NJ[q - 1]; q--; }
      ND[q] = d2; NJ[q] = j;
    }
    let sx = hx, sy = hy; // momentum: with nothing to react to, a fish carries on
    if (nr > 0) { const mm = Math.hypot(rx, ry) || 1; sx += (rx / mm) * 1.6; sy += (ry / mm) * 1.6; }
    else if (m > 0) {
      let ox = 0, oy = 0, no = 0, ax = 0, ay = 0, na = 0;
      for (let q = 0; q < m; q++) {
        const g = F[NJ[q]];
        if (ND[q] < zo2) { ox += Math.cos(g.h); oy += Math.sin(g.h); no++; }
        else { const d = Math.sqrt(ND[q]); ax += (g.x - f.x) / d; ay += (g.y - f.y) / d; na++; }
      }
      if (no > 0) { sx += (ox / no) * 1.4; sy += (oy / no) * 1.4; }
      if (na > 0) { sx += (ax / na) * 0.5; sy += (ay / na) * 0.5; }
    } else if (lone >= 0) { const g = F[lone], d = Math.sqrt(ld2); sx += ((g.x - f.x) / d) * 0.6; sy += ((g.y - f.y) / d) * 0.6; }
    // its own destination, if it has one: kept until reached or until it loses interest
    if (f.goal) {
      f.keep -= dt;
      const dx = f.goal.x - f.x, dy = f.goal.y - f.y, d = Math.hypot(dx, dy);
      if (f.keep <= 0 || d < 40) f.goal = null;
      else { const kk = p.will * f.will * (f.food ? 2.5 : 1); sx += (dx / d) * kk; sy += (dy / d) * kk; }
    } else if (!(f.idle > 0) && !f.pad && r() < curious * dt) inform(w, f);
    // its own meander: a slow random walk of a preferred bearing
    f.wa += (r() - 0.5) * 3 * Math.sqrt(dt); if (f.wa > 1.2) f.wa = 1.2; else if (f.wa < -1.2) f.wa = -1.2;
    sx += Math.cos(f.h + f.wa) * p.wander; sy += Math.sin(f.h + f.wa) * p.wander;
    // screen edges turn a fish back in; nothing wraps
    const e = Math.max(1, p.edge);
    if (f.x < e) sx += ((e - f.x) / e) * 3; else if (f.x > w.w - e) sx -= ((f.x - (w.w - e)) / e) * 3;
    if (f.y < e) sy += ((e - f.y) / e) * 3; else if (f.y > w.h - e) sy -= ((f.y - (w.h - e)) / e) * 3;
    // the nearest treat it can sense draws it in, harder the closer it is, sets it bursting, and becomes its
    // destination for a while, so it keeps looking where the food was
    let tb = -1, tbd = p.sense;
    for (let q = 0; q < w.treats.length; q++) { const t = w.treats[q], d = Math.hypot(t.x - f.x, t.y - f.y); if (d < tbd) { tbd = d; tb = q; } }
    if (tb >= 0) {
      const t = w.treats[tb], d = tbd || 1;
      sx += ((t.x - f.x) / d) * 4; sy += ((t.y - f.y) / d) * 4;
      if (!w.reduced) f.en = Math.max(f.en, 1 - 0.5 * (d / Math.max(1, p.sense)));
      if (!f.goal) f.goal = { x: 0, y: 0 };
      f.goal.x = t.x; f.goal.y = t.y; f.keep = 6; f.will = 1; f.food = true; f.idle = 0; f.pad = null;
    }
    // a fast cursor through the pond scatters the fish near it, and some of them make for the nearest pad to hide
    if (startle) {
      const dx = f.x - ptr.x, dy = f.y - ptr.y, d = Math.hypot(dx, dy);
      if (d < p.scare && d > 1e-6) scare(w, f, dx / d, dy / d);
    }
    // and a calm fish now and then goes to rest under one on its own
    else if (!f.pad && !(f.idle > 0) && f.en < 0.05 && !f.food && w.pads.length && w.prand() < p.rest * dt) seekPad(w, f, 1);
    if (f.flee > 0) { f.flee -= dt; sx += f.fx * 5 * Math.max(0, f.flee); sy += f.fy * 5 * Math.max(0, f.flee); }
    // islands and stones: inside the look zone the part of the heading aimed at the shore is turned along it
    for (let j = 0, ni = w.islands.length, nj = ni + w.rocks.length; j < nj; j++) {
      let gap;
      if (j < ni) { const o = w.islands[j]; gap = shoreGap(o, f.x, f.y, p.shore); if (gap > p.look) continue; shoreNormal(o, f.x, f.y, NRM); }
      else gap = discGap(w.rocks[j - ni], f.x, f.y, ROCK_SHORE, NRM);
      if (gap > p.look) continue;
      const gx = NRM.x, gy = NRM.y;
      const kk = Math.min(1, Math.max(0, 1 - gap / Math.max(1, p.look))), toward = -(hx * gx + hy * gy);
      if (toward > -0.2) {
        const side = hx * -gy + hy * gx >= 0 ? 1 : -1; // go round on whichever side it already leans to
        sx += -gy * side * 4 * kk + gx * 2 * kk * kk; sy += gx * side * 4 * kk + gy * 2 * kk * kk;
      }
    }
    // now and then a fish darts off on its own
    if (!w.reduced && !(f.idle > 0) && r() < p.whim * dt) { f.en = Math.max(f.en, 0.3 + 0.3 * r()); f.wa = (r() - 0.5) * 2.4; }
    if (w.reduced) f.en = 0;
    // a calm fish now and then stops to hover a few seconds; anything urgent wakes it
    if (f.idle > 0) { f.idle -= dt; if (f.en > 0.2) f.idle = 0; }
    else if (f.en < 0.05 && !f.goal && !f.pad && r() < p.idle * dt) f.idle = p.idleFor * (0.3 + 0.7 * r());
    // shelter: a fish making for a pad heads straight for it (giving up after `seek` s); once its head is under the pad
    // it holds there for `hide` s, easing back toward the middle should the pad drift off it, then rejoins
    let hold = -1;
    if (f.pad) {
      const q = f.pad, dx = q.x - f.x, dy = q.y - f.y, d = Math.hypot(dx, dy) || 1e-6;
      if (!f.under) { f.seek -= dt; if (d < q.r) f.under = true; else if (f.seek <= 0) f.pad = null; }
      else if ((f.hide -= dt) <= 0) f.pad = null;
      if (f.pad && f.under) { sx = hx; sy = hy; if (d > q.r * 0.5) { sx += (dx / d) * 3; sy += (dy / d) * 3; hold = 10; } else hold = 0; }
      else if (f.pad) { sx += (dx / d) * 4; sy += (dy / d) * 4; }
    }
    const aim = wrapAngle(Math.atan2(sy, sx) - f.h);
    // a sharp turn from a glide or a hover is one strong stroke, a C-start: the head whips round and a single beat
    // drives it out of the turn. A slow turn is just a curve, taken whether the tail is beating or not
    if (!w.reduced && !(f.idle > 0) && Math.abs(aim) > 2 && f.cs <= -2 && f.left <= 0) { f.cs = 0.3; kick(w, f, Math.max(f.sp, p.cruise * f.pace) * p.over, 1, Math.min(p.maxHz, 3), 1.3); }
    f.cs -= dt;
    const turn = (w.reduced ? p.turn * 0.6 : p.turn + p.turnBurst * (f.en + (f.cs > 0 ? 2 : 0))) * dt;
    const dh = aim > turn ? turn : aim < -turn ? -turn : aim;
    f.h = wrapAngle(f.h + dh);
    // the speed it wants: its own pace, raised by urgency, nothing while it hovers
    const want = hold >= 0 ? Math.min(hold, p.cruise) : f.idle > 0 ? 0 : w.reduced ? p.cruise * p.reduced : p.cruise * f.pace * (1 + f.en * (p.burst - 1));
    swim(w, f, want, dt);
    f.en *= decay;
  }
  // move, then hold every head out of the stones and the islands and inside the page. Where the swell brings a coast
  // close to a stone by the shore there is no room for both margins: the coast's wins, and then the stone itself
  for (let i = 0; i < n; i++) {
    const f = F[i];
    f.x += Math.cos(f.h) * f.sp * dt; f.y += Math.sin(f.h) * f.sp * dt;
    for (let j = 0, nr = w.rocks.length, nj = nr + w.islands.length; j < nj; j++) {
      if (j < nr) {
        const q = w.rocks[j];
        if (discGap(q, f.x, f.y, ROCK_SHORE, NRM) >= 0) continue;
        f.x = q.x + NRM.x * (q.r + ROCK_SHORE); f.y = q.y + NRM.y * (q.r + ROCK_SHORE);
      } else {
        const o = w.islands[j - nr];
        if (shoreR(o, f.x, f.y, p.shore) >= 1) continue;
        onShore(o, f.x, f.y, p.shore, PT); f.x = PT.x; f.y = PT.y;
        shoreNormal(o, f.x, f.y, NRM);
      }
      // shed the motion aimed inward: the fish slides along the shore
      const gx = NRM.x, gy = NRM.y;
      let vx = Math.cos(f.h), vy = Math.sin(f.h); const into = vx * gx + vy * gy;
      if (into < 0) { vx -= into * gx; vy -= into * gy; if (Math.hypot(vx, vy) > 1e-6) f.h = Math.atan2(vy, vx); }
    }
    offStones(w, f.x, f.y, OFF); f.x = OFF.x; f.y = OFF.y;
    if (f.x < 0) f.x = 0; else if (f.x > w.w) f.x = w.w;
    if (f.y < 0) f.y = 0; else if (f.y > w.h) f.y = w.h;
    // the body trails the head like a rope, which is what bends it through a turn
    const rope = f.rope, seg = (f.len * BODY) / (SPINE - 1);
    rope[0] = f.x; rope[1] = f.y;
    for (let k = 1; k < SPINE; k++) {
      let dx = rope[k * 2] - rope[k * 2 - 2], dy = rope[k * 2 + 1] - rope[k * 2 - 1];
      const d = Math.hypot(dx, dy);
      if (d < 1e-6) { dx = -Math.cos(f.h); dy = -Math.sin(f.h); } else { dx /= d; dy /= d; }
      rope[k * 2] = rope[k * 2 - 2] + dx * seg; rope[k * 2 + 1] = rope[k * 2 - 1] + dy * seg;
      // the body stays in the water too: an island that moves under a fish (the page scrolled) pushes it aside
      for (const o of w.islands) {
        if (shoreR(o, rope[k * 2], rope[k * 2 + 1], 2) < 1) { onShore(o, rope[k * 2], rope[k * 2 + 1], 2, PT); rope[k * 2] = PT.x; rope[k * 2 + 1] = PT.y; }
      }
      offStones(w, rope[k * 2], rope[k * 2 + 1], OFF); rope[k * 2] = OFF.x; rope[k * 2 + 1] = OFF.y;
    }
    // the first mouth to reach a treat takes it
    const bite = f.len * 0.3 + 4;
    for (let k = 0; k < w.treats.length; k++) {
      const t = w.treats[k];
      if (Math.hypot(t.x - f.x, t.y - f.y) < bite) { w.treats.splice(k, 1); ripple(w, t.x, t.y, 14, 0.9); w.eaten++; remember(w, t); if (!w.reduced) f.en = Math.max(f.en, 0.5); break; }
    }
  }
  // the surface, after the fish
  stepFlowers(w, dt);
  stepStriders(w, dt);
}

// ----- drawing -----
const PX = new Float32Array(SPINE), PY = new Float32Array(SPINE), NX = new Float32Array(SPINE), NY = new Float32Array(SPINE);
const WIDTH = Float32Array.from({ length: SPINE }, (_, i) => bodyWidth(i / (SPINE - 1)));
// smooth a run of points by curving through their midpoints
function curveThrough(ctx, xs, ys, count) {
  for (let i = 1; i < count - 1; i++) ctx.quadraticCurveTo(xs[i], ys[i], (xs[i] + xs[i + 1]) / 2, (ys[i] + ys[i + 1]) / 2);
  ctx.lineTo(xs[count - 1], ys[count - 1]);
}
const LX = new Float32Array(SPINE), LY = new Float32Array(SPINE);
// the body's outline from the waved spine in PX/PY and its normals in NX/NY, as the current path
function bodyPath(ctx, len) {
  const hw = len * HALF;
  ctx.beginPath();
  ctx.moveTo(PX[0] + (PX[0] - PX[1]) * 0.25, PY[0] + (PY[0] - PY[1]) * 0.25); // a rounded snout just ahead of the head point
  for (let i = 0; i < SPINE; i++) { LX[i] = PX[i] + NX[i] * WIDTH[i] * hw; LY[i] = PY[i] + NY[i] * WIDTH[i] * hw; }
  LX[0] = PX[0] + (PX[0] - PX[1]) * 0.25; LY[0] = PY[0] + (PY[0] - PY[1]) * 0.25;
  curveThrough(ctx, LX, LY, SPINE);
  // the forked tail, off the end of the spine along its last segment
  const e = SPINE - 1;
  let dx = PX[e] - PX[e - 1], dy = PY[e] - PY[e - 1]; const dm = Math.hypot(dx, dy) || 1; dx /= dm; dy /= dm;
  const tl = len * 0.26, sp = len * 0.14;
  ctx.lineTo(PX[e] + dx * tl + NX[e] * sp, PY[e] + dy * tl + NY[e] * sp);
  ctx.lineTo(PX[e] + dx * tl * 0.45, PY[e] + dy * tl * 0.45);
  ctx.lineTo(PX[e] + dx * tl - NX[e] * sp, PY[e] + dy * tl - NY[e] * sp);
  for (let i = 0; i < SPINE; i++) { LX[i] = PX[e - i] - NX[e - i] * WIDTH[e - i] * hw; LY[i] = PY[e - i] - NY[e - i] * WIDTH[e - i] * hw; }
  LX[e] = PX[0] + (PX[0] - PX[1]) * 0.25; LY[e] = PY[0] + (PY[0] - PY[1]) * 0.25;
  ctx.lineTo(LX[0], LY[0]);
  curveThrough(ctx, LX, LY, SPINE);
  ctx.closePath();
}
// A koi's patches, clipped to its body: each ellipse sits on the waved spine, so it swims with the body's wave.
function drawPatches(ctx, f, gold) {
  const hw = f.len * HALF;
  ctx.save(); ctx.clip();
  ctx.beginPath();
  for (const q of f.koi) {
    const k = q.u * (SPINE - 1), i = Math.min(SPINE - 2, Math.floor(k)), t = k - i;
    const px = PX[i] + (PX[i + 1] - PX[i]) * t, py = PY[i] + (PY[i + 1] - PY[i]) * t;
    const nx = NX[i] + (NX[i + 1] - NX[i]) * t, ny = NY[i] + (NY[i + 1] - NY[i]) * t, off = q.lat * bodyWidth(q.u) * hw;
    const cx = px + nx * off, cy = py + ny * off, rot = Math.atan2(PY[i] - PY[i + 1], PX[i] - PX[i + 1]) + q.tilt;
    ctx.moveTo(cx + Math.cos(rot) * q.rx * f.len, cy + Math.sin(rot) * q.rx * f.len);
    ctx.ellipse(cx, cy, q.rx * f.len, q.ry * f.len, rot, 0, TAU);
  }
  ctx.fillStyle = gold; ctx.globalAlpha = 0.75; ctx.fill();
  ctx.restore();
}
function drawFish(ctx, f, p, swim, gold) {
  const amp = f.len * p.amp * f.amp * swim;
  const rope = f.rope;
  for (let i = 0; i < SPINE; i++) {
    const a = Math.max(0, i - 1), b = Math.min(SPINE - 1, i + 1);
    let tx = rope[a * 2] - rope[b * 2], ty = rope[a * 2 + 1] - rope[b * 2 + 1];
    const m = Math.hypot(tx, ty) || 1; tx /= m; ty /= m;
    NX[i] = -ty; NY[i] = tx;
    const off = lateral(i / (SPINE - 1), f.phase, amp);
    PX[i] = rope[i * 2] + NX[i] * off; PY[i] = rope[i * 2 + 1] + NY[i] * off;
  }
  // the normals again, from the waved spine, so the outline follows the bend the wave makes
  for (let i = 0; i < SPINE; i++) {
    const a = Math.max(0, i - 1), b = Math.min(SPINE - 1, i + 1);
    let tx = PX[a] - PX[b], ty = PY[a] - PY[b]; const m = Math.hypot(tx, ty) || 1; tx /= m; ty /= m;
    NX[i] = -ty; NY[i] = tx;
  }
  const hw = f.len * HALF;
  bodyPath(ctx, f.len);
  ctx.globalAlpha = 0.92; ctx.fill();
  // a koi's patches go over the paper and under the outline; the clip is paid by the koi alone
  if (f.koi) { drawPatches(ctx, f, gold); bodyPath(ctx, f.len); }
  ctx.globalAlpha = p.alpha; ctx.stroke();
  // pectoral fins, sculling wider when the fish is slow
  const flap = (0.2 + 0.25 * Math.max(0, 1 - f.sp / Math.max(1, p.cruise))) * Math.sin(f.fin) * swim, fl = f.len * 0.13, k = 2;
  let bx = PX[k] - PX[k + 1], by = PY[k] - PY[k + 1]; const bm = Math.hypot(bx, by) || 1; bx /= bm; by /= bm;
  ctx.beginPath();
  for (const side of [1, -1]) {
    const ex = PX[k] + NX[k] * WIDTH[k] * hw * side, ey = PY[k] + NY[k] * WIDTH[k] * hw * side;
    const ang = 0.9 + flap * side, c = Math.cos(ang), s = Math.sin(ang);
    // rotate the backward direction out toward this side
    const ox = -bx * c + NX[k] * side * s, oy = -by * c + NY[k] * side * s;
    ctx.moveTo(ex, ey); ctx.lineTo(ex + ox * fl, ey + oy * fl);
  }
  ctx.stroke();
}

// A closed smooth path round an island's coast grown by off px: 96 samples, curved through their midpoints.
const COAST_N = 96, CX = new Float32Array(COAST_N), CY = new Float32Array(COAST_N);
function coastPath(ctx, o, off) {
  for (let i = 0; i < COAST_N; i++) { const t = (i / COAST_N) * TAU, R = coast(o, t) + off; CX[i] = o.x + Math.cos(t) * R; CY[i] = o.y + Math.sin(t) * R; }
  ctx.beginPath(); ctx.moveTo((CX[COAST_N - 1] + CX[0]) / 2, (CY[COAST_N - 1] + CY[0]) / 2);
  for (let i = 0; i < COAST_N; i++) { const j = (i + 1) % COAST_N; ctx.quadraticCurveTo(CX[i], CY[i], (CX[i] + CX[j]) / 2, (CY[i] + CY[j]) / 2); }
  ctx.closePath();
}

// The water's colour: the land's (the page background) taken toward a deep cool slate by `depth`. On a light page the
// slate darkens it; on a dark page a near-black slate does, so the water sits below the land in both themes.
// Accepts #rgb, #rrggbb and rgb()/rgba(); anything else leaves the water the colour of the land.
// The [r, g, b] of a CSS colour, or null.
function rgbOf(css) {
  const s = String(css).trim(); let c = null;
  if (s[0] === '#') { const h = s.length === 4 ? s.slice(1).split('').map((d) => d + d).join('') : s.slice(1, 7); if (/^[0-9a-f]{6}$/i.test(h)) c = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); }
  else { const m = s.match(/rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i); if (m) c = [+m[1], +m[2], +m[3]]; }
  return c;
}
export function waterOf(paper, depth) {
  const c = rgbOf(paper); if (!c) return String(paper).trim();
  const light = (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255 > 0.5, deep = light ? [44, 74, 85] : [4, 10, 13];
  // a dark page has little room below it, so the same depth pulls three times as far to read as the same step
  const k = light ? depth : Math.min(1, depth * 3), mix = c.map((v, i) => Math.round(v + (deep[i] - v) * k));
  return `rgb(${mix[0]}, ${mix[1]}, ${mix[2]})`;
}
// Marks on the water: a few thin ink strokes over the flat water, the same single-weight line as the fish, the floor and
// the shores, so the pond reads as one drawing. A mark is { x, y, pts }: its anchor and its polyline [x0, y0, x1, y1,
// ...], world CSS px. Each style makes the marks of one lattice cell from that cell's own hash, cells anchored at the
// world's corner, so which marks exist and where depends on the seed and the position alone (never a running stream,
// never the page size): a larger page holds a smaller page's marks and a resize reveals more of the same picture. The
// seed is the world's on its own derivation, so the simulation draws exactly what it drew without them.
const hashCell = (x, y, s) => { let h = Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1) ^ s; h = Math.imul(h ^ (h >>> 15), 0x85ebca6b); h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35); return (h ^ (h >>> 16)) >>> 0; };
// smooth value noise in [0, 1): the drifts the marks gather in, and the current's flow
function smoothNoise(x, y, s) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hashCell(ix, iy, s), b = hashCell(ix + 1, iy, s), c = hashCell(ix, iy + 1, s), d = hashCell(ix + 1, iy + 1, s);
  return ((a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v) / 4294967296;
}
// a cell's own stream of numbers in [0, 1), from its hash (mulberry32)
const cellRand = (h) => () => { h = (h + 0x6d2b79f5) | 0; let t = Math.imul(h ^ (h >>> 15), 1 | h); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
// The drifts: a slow noise squeezed to [0, 1], 0 over the calm stretches between drifts, so the marks gather in loose
// patches with open water round them rather than tiling the page. sx, sy are its scale across and down, px.
const drift = (x, y, s, sx, sy, lo) => Math.min(1, Math.max(0, (smoothNoise(x / sx, y / sy, s) - lo) / 0.25));
// The candidate styles, by the number the `marks` parameter picks (a prototype: the owner keeps one). Each gives its
// lattice cell, px; its reach (no point of a mark lies farther than this from its anchor, so a page draws the marks
// anchored within reach of it); the band a stroke's length keeps to, and the band of strokes on a 1440x900 page at
// density 1, both for the checks; and make(r, x, y, C, k, s, out), which pushes the marks of the cell with corner x, y
// and size C, drawing on the cell's stream r; k is the density there and s the marks' seed.
export const MARK_STYLES = {
  1: { name: 'dashes', cell: 64, reach: 30, len: [6, 28], count: [250, 800], make: dashes },
  2: { name: 'wavelets', cell: 48, reach: 12, len: [10, 28], count: [80, 450], make: wavelets },
  3: { name: 'current', cell: 44, reach: 21, len: [14, 40], count: [50, 400], make: current },
  4: { name: 'rings', cell: 150, reach: 26, len: [14, 123], count: [25, 160], make: rings },
};
// 1. Dashes, the engraver's calm water: a stack of 3 to 7 short level strokes 4 to 6 px apart, each 6 to 28 px long
// and centred up to 8 px either side of the stack's anchor, so the ends stagger; fuller stacks where the drift is thick.
function dashes(r, x, y, C, k, s, out) {
  const d = drift(x + C / 2, y + C / 2, s, 340, 190, 0.45) * k;
  if (r() >= d * 0.75) return;
  const ax = x + r() * C, ay = y + r() * C, n = 3 + Math.floor(r() * (2 + 3 * d)), gap = 4 + r() * 2, top = ay - ((n - 1) * gap) / 2;
  for (let i = 0; i < n; i++) { const L = 6 + 22 * r() * (1 - 0.4 * Math.abs(i / (n - 1) - 0.5)), cx = ax + (r() - 0.5) * 16, yy = Math.round(top + i * gap) + 0.5; out.push({ x: ax, y: ay, pts: [cx - L / 2, yy, cx + L / 2, yy] }); }
}
// 2. Wavelets: shallow wave marks, 10 to 22 px wide, each a single low arch or a two-hump tilde 1.5 to 3 px high,
// tilted a little off level; none where the drift is calm and up to two to a cell where it is thick, so they gather.
function wavelets(r, x, y, C, k, s, out) {
  const n = Math.min(2, Math.floor(drift(x + C / 2, y + C / 2, s, 320, 200, 0.52) * k * 1.5 + r() * 0.85));
  for (let j = 0; j < n; j++) {
    const ax = x + r() * C, ay = y + r() * C, wd = 10 + 12 * r(), amp = 1.5 + 1.5 * r(), tilt = (r() - 0.5) * 0.3, humps = r() < 0.5 ? 1 : 2, ca = Math.cos(tilt), sa = Math.sin(tilt), pts = [];
    for (let i = 0, m = 6 * humps + 2; i <= m; i++) { const t = i / m, u = (t - 0.5) * wd, v = -amp * Math.sin(Math.PI * humps * t); pts.push(ax + u * ca - v * sa, ay + u * sa + v * ca); }
    out.push({ x: ax, y: ay, pts });
  }
}
// 3. Current: strokes 14 to 40 px long that follow a slow flow field for their length, half each way from the anchor,
// so neighbours agree in direction; the drift is stretched across the flow's mean heading into long streams with still
// water between them. The flow keeps within about 45 degrees of level, mostly far less: a\n// steep stroke reads as a scratch, not water.
const flowAngle = (x, y, s) => ((s & 0xff) / 255 - 0.5) * 0.4 + 0.7 * (smoothNoise(x / 260, y / 260, s ^ 0x51) - 0.5) + 0.9 * (smoothNoise(x / 80, y / 80, s ^ 0x52) - 0.5);
function current(r, x, y, C, k, s, out) {
  if (r() >= drift(x + C / 2, y + C / 2, s, 520, 110, 0.52) * k * 0.75) return;
  const ax = x + r() * C, ay = y + r() * C, half = Math.round((14 + 26 * r()) / 4), a = [], b = [];
  let px = ax, py = ay; for (let i = 0; i < half; i++) { const t = flowAngle(px, py, s); px += 2 * Math.cos(t); py += 2 * Math.sin(t); a.push(px, py); }
  px = ax; py = ay; for (let i = 0; i < half; i++) { const t = flowAngle(px, py, s); px -= 2 * Math.cos(t); py -= 2 * Math.sin(t); b.push(py, px); }
  out.push({ x: ax, y: ay, pts: [...b.reverse(), ax, ay, ...a] });
}
// 4. Rings: a still ripple group, 2 or 3 concentric arcs 6 to 26 px across in radius, each broken, 40 to 75 percent of
// its circle from its own start, as a pen lifts off a ring drawn fast.
function rings(r, x, y, C, k, s, out) {
  if (r() >= drift(x + C / 2, y + C / 2, s, 380, 300, 0.38) * k * 0.85) return;
  const ax = x + r() * C, ay = y + r() * C, m = 2 + (r() < 0.5 ? 1 : 0), r0 = 6 + 5 * r(), dr = Math.min(5 + 4 * r(), (26 - r0) / (m - 1));
  for (let j = 0; j < m; j++) {
    const R = r0 + j * dr, span = (0.4 + 0.35 * r()) * 2 * Math.PI, a0 = r() * 2 * Math.PI, n = Math.ceil((span * R) / 3), pts = [];
    for (let i = 0; i <= n; i++) { const t = a0 + (span * i) / n; pts.push(ax + R * Math.cos(t), ay + R * Math.sin(t)); }
    out.push({ x: ax, y: ay, pts });
  }
}
// The marks of a W x H page in a style: those of every cell anchored within the style's reach of the page.
export function waterMarks(seed, W, H, style, density = 1) {
  const st = MARK_STYLES[style], out = []; if (!st) return out;
  const s = (seed ^ 0x6d61726b) >>> 0, C = st.cell, R = st.reach, all = [];
  for (let iy = Math.floor(-R / C); iy * C < H + R; iy++) for (let ix = Math.floor(-R / C); ix * C < W + R; ix++) st.make(cellRand(hashCell(ix, iy, s)), ix * C, iy * C, C, density, s, all);
  for (const m of all) if (m.x >= -R && m.x < W + R && m.y >= -R && m.y < H + R) out.push(m);
  return out;
}
// Strokes marks onto ctx (already scaled to CSS px) in the ink: one weight, round ends, one alpha, nothing filled.
export function drawMarks(ctx, marks, ink, alpha) {
  ctx.globalAlpha = alpha; ctx.strokeStyle = ink; ctx.lineWidth = 1; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath();
  for (const { pts } of marks) { ctx.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]); }
  ctx.stroke(); ctx.globalAlpha = 1;
}
// bands of shallows round each island, far to near: grown by px, strength of the land colour laid over the water
const SHALLOWS = [[36, 0.16], [20, 0.2], [9, 0.28]];

// Draws the world onto ctx (already scaled to CSS px). ink and paper are CSS colours (paper is the land); water is the
// pond's layer, { img, w, h, flat }: the flat water and its marks pre-rendered into an image drawn at w x h CSS px from
// the corner, and the flat water colour under whatever it does not cover (all of the pond when img is null); it
// defaults to bare land.
// gold is the treats' and the koi's colour. The world is two layers, drawn in order: the
// ground (opaque: the water, the land, the things on the pond floor, the shores and the waves lapping at them) and the live layer over them (the
// fish, the ripples and the treats, then the things on the surface). The shell may draw the ground at a lower resolution than the live layer.
export function draw(ctx, w, ink, paper, gold, water) {
  drawGround(ctx, w, ink, paper, water);
  drawLive(ctx, w, ink, paper, gold);
}
// The ground: covers the whole canvas, so it needs nothing under it.
export function drawGround(ctx, w, ink, paper, water = { img: null, w: 0, h: 0, flat: paper }) {
  const p = w.params, still = w.reduced;
  // the water (the flat colour only where the layer falls short, as for a moment after a resize), then each island as land with shallows lightening toward its coast
  ctx.globalAlpha = 1; if (!water.img || water.w < w.w || water.h < w.h) { ctx.fillStyle = water.flat; ctx.fillRect(0, 0, w.w, w.h); } if (water.img) { ctx.imageSmoothingEnabled = true; ctx.drawImage(water.img, 0, 0, water.w, water.h); }
  ctx.fillStyle = paper;
  for (const o of w.islands) {
    for (const [g, a] of SHALLOWS) { ctx.globalAlpha = p.shallows * a; coastPath(ctx, o, g); ctx.fill(); }
    ctx.globalAlpha = 1; coastPath(ctx, o, 0); ctx.fill();
  }
  // the pond floor: a branch and leaves resting on the bottom, in ink stroke only, fainter than the fish, each its own
  // path; drawn with the ground, so at its resolution
  if (w.floor.length) {
    ctx.globalAlpha = p.floorAlpha; ctx.strokeStyle = ink; ctx.lineWidth = 1; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    for (const q of w.floor) { ctx.beginPath(); floorPath(ctx, q); ctx.stroke(); if (q.kind === 'branch') drawGrain(ctx, q, p.floorAlpha); }
  }
  ctx.strokeStyle = ink; ctx.lineWidth = p.width; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  // the shores and the water lapping in toward them
  for (const o of w.islands) {
    ctx.globalAlpha = p.shoreAlpha;
    coastPath(ctx, o, 0); ctx.stroke();
    const m = Math.round(p.rings);
    for (let i = 0; i < m; i++) {
      const u = still ? (i + 0.5) / m : ((w.t * p.lap + i / m) % 1); // 0 far out, 1 at the shore
      const a = still ? 0.6 : Math.min(1, u * 4) * (1 - u);
      if (a <= 0.001) continue;
      const g = 3 + p.reach * (1 - u);
      ctx.globalAlpha = p.ringAlpha * a;
      coastPath(ctx, o, g); ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}
// The surface. Each thing is drawn in the hand of the layer it lives in. The water layer, the fish, is an ink outline
// over a paper fill. The surface layer (stones, pads, flowers, striders) is drawn light, so the fish stay the moving
// core of the picture: a stone, pad or flower is a thin outline in its own tone over a faint film of the same tone,
// through which a fish beneath stays visible, and casts no shadow.
export const FLORA = '#5f7f66';
const SLIT = (18 / 180) * Math.PI;
// A stone's tone: the ink mixed this far toward the paper, so it holds on any page colours.
const STONE = 0.55;
// A strider is already a few thin strokes, so it keeps the stronger alpha the surface had before it went light.
const STRIDER_ALPHA = 0.55;
let stone = null, stoneFor = null;
// a thing on the surface: its film, then its outline, in the current fill and stroke style
function film(ctx, p) {
  ctx.globalAlpha = p.floraAlpha; ctx.fill();
  ctx.globalAlpha = p.surfaceStroke; ctx.stroke();
}
// A pad: a disc with a narrow slit cut toward its heading, the slit ending short of the centre in a rounded end.
function padPath(ctx, q) {
  const x = q.x, y = q.y, a = q.a, h = SLIT / 2, d0 = 0.18 * q.r, rr = 0.05 * q.r + 0.4;
  const cx = x + Math.cos(a) * d0, cy = y + Math.sin(a) * d0, nx = -Math.sin(a), ny = Math.cos(a);
  ctx.moveTo(x + Math.cos(a + h) * q.r, y + Math.sin(a + h) * q.r);
  ctx.arc(x, y, q.r, a + h, a + TAU - h);
  ctx.lineTo(cx - nx * rr, cy - ny * rr);
  ctx.arc(cx, cy, rr, a - Math.PI / 2, a + Math.PI / 2, true);
  ctx.closePath();
}
// a mix of two CSS colours, k of the way from a to b
function mixOf(a, b, k) {
  const A = rgbOf(a), B = rgbOf(b); if (!A || !B) return a;
  const m = A.map((v, i) => Math.round(v + (B[i] - v) * k));
  return `rgb(${m[0]}, ${m[1]}, ${m[2]})`;
}
// A lotus: a bud is a small pointed ellipse with a gold tip; open, six petals round a gold centre, spreading with the
// open fraction. The bud and the petals are outlined over a film in FLORA (the caller's styles); the gold is solid.
function drawFlower(ctx, f, p, gold) {
  const o = f.open, a = f.rot + f.q.a;
  if (o < 0.12) {
    const c = Math.cos(a), s = Math.sin(a), L = 3, H = 1.9;
    ctx.beginPath();
    ctx.moveTo(f.x - c * L, f.y - s * L);
    ctx.quadraticCurveTo(f.x - s * H * 2, f.y + c * H * 2, f.x + c * L, f.y + s * L);
    ctx.quadraticCurveTo(f.x + s * H * 2, f.y - c * H * 2, f.x - c * L, f.y - s * L);
    film(ctx, p);
    ctx.fillStyle = gold; ctx.globalAlpha = 0.9;
    ctx.beginPath(); ctx.arc(f.x + c * (L - 1), f.y + s * (L - 1), 0.9, 0, TAU); ctx.fill();
    ctx.fillStyle = FLORA;
    return;
  }
  const rl = 2.2 + 3.6 * o, rw = 1.3 + 0.8 * o, d = 0.6 + 2.6 * o;
  ctx.beginPath();
  for (let k = 0; k < 6; k++) {
    const b = a + (k * TAU) / 6, cx = f.x + Math.cos(b) * d, cy = f.y + Math.sin(b) * d;
    ctx.moveTo(cx + Math.cos(b) * rl, cy + Math.sin(b) * rl); ctx.ellipse(cx, cy, rl, rw, b, 0, TAU);
  }
  film(ctx, p);
  ctx.fillStyle = gold; ctx.globalAlpha = 0.9;
  ctx.beginPath(); ctx.arc(f.x, f.y, 1.1 + 0.5 * o, 0, TAU); ctx.fill();
  ctx.fillStyle = FLORA;
}
// The live layer, over the ground: the fish, the ripples and treats in the water, then the surface over them.
export function drawLive(ctx, w, ink, paper, gold) {
  const p = w.params, still = w.reduced;
  // the school: a paper fill under each outline, so crossing fish read as one over the other
  ctx.strokeStyle = ink; ctx.lineWidth = p.width; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.fillStyle = paper;
  for (const f of w.fish) drawFish(ctx, f, p, still ? 0.4 : 1, gold);
  // ripples, then the treats, in the water under whatever floats
  for (const q of w.ripples) {
    const k = q.age / q.life;
    ctx.globalAlpha = p.ringAlpha * 2 * (1 - k) * q.k;
    ctx.beginPath(); ctx.arc(q.x, q.y, 2 + q.size * Math.sqrt(k), 0, TAU); ctx.stroke();
  }
  ctx.fillStyle = gold;
  for (const t of w.treats) {
    const k = t.age / p.sink;
    ctx.globalAlpha = 0.9 * (1 - k * k);
    ctx.beginPath(); ctx.arc(t.x, t.y, 2.4 * (1 - 0.55 * k), 0, TAU); ctx.fill();
  }
  // the surface: the stones, then the pads over the fish, a film a fish swimming under one still shows through, then
  // the flowers on the pads. Every thing on the surface is its own path: one path gathering things spread over the page
  // has bounds as big as the page, and the GPU process pays for an antialiased path by its bounds (at 1440p2 the surface
  // drawn as a few page-wide paths cost the GPU process about 6 ms a frame; drawn thing by thing, within its noise)
  ctx.lineWidth = 1;
  if (w.rocks.length) {
    if (stoneFor !== ink + paper) { stoneFor = ink + paper; stone = mixOf(ink, paper, STONE); }
    ctx.fillStyle = stone; ctx.strokeStyle = stone;
    for (const q of w.rocks) { ctx.beginPath(); rockPath(ctx, q); film(ctx, p); }
  }
  ctx.fillStyle = FLORA; ctx.strokeStyle = FLORA;
  for (const q of w.pads) { ctx.beginPath(); padPath(ctx, q); film(ctx, p); }
  for (const f of w.flowers) drawFlower(ctx, f, p, gold);
  // the striders: four legs and a short thick body; their dimples are the ripples above
  ctx.globalAlpha = STRIDER_ALPHA;
  for (const s of w.striders) {
    ctx.lineWidth = 0.8; ctx.beginPath();
    for (const b of LEGS) { const a = s.a + b; ctx.moveTo(s.x, s.y); ctx.lineTo(s.x + Math.cos(a) * 6, s.y + Math.sin(a) * 6); }
    ctx.stroke();
    const c = Math.cos(s.a) * 1.5, d = Math.sin(s.a) * 1.5;
    ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(s.x - c, s.y - d); ctx.lineTo(s.x + c, s.y + d); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
const LEGS = [0.7, -0.7, 2.3, -2.3];

// ----- the browser shell -----
const GOLD = '#b68235'; // the treats keep gold in both themes; the dark theme's accent is the text colour
export function mount(container) {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;';
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const params = defaults();
  const mq = (q) => (window.matchMedia ? window.matchMedia(q) : null);
  const coarseQ = mq('(pointer: coarse)'), reducedQ = mq('(prefers-reduced-motion: reduce)');
  const world = createWorld(params, { w: container.clientWidth || 1, h: container.clientHeight || 1, seed: (Math.random() * 2 ** 32) >>> 0, coarse: !!coarseQ?.matches, reduced: !!reducedQ?.matches });
  const onReduced = () => { world.reduced = !!reducedQ.matches; };
  reducedQ?.addEventListener?.('change', onReduced);
  // the tokens live on the root div, not on <html>, so read them off the layer itself; and read them again every
  // second, so a change of theme reaches the ink without any hook into how the theme is switched
  let ink = '#201f1d', paper = '#f3f2f2', inkAge = Infinity;
  const readInk = () => { const css = getComputedStyle(container); ink = css.getPropertyValue('--color-text').trim() || ink; paper = css.getPropertyValue('--color-bg').trim() || paper; inkAge = 0; };
  // backing pixels per CSS px of the ground (see paint)
  const groundRes = () => Math.min(dpr, Math.max(1, params.coastRes || 1));
  // The water: the marks are generated once and drawn once, over the flat water colour, into their own canvas at the
  // ground's resolution, so they are as crisp as the floor's branch; the ground blits it each frame. The marks are kept
  // apart from their colour, so a theme, depth or alpha change only redraws them, and only a change of size, style or
  // density makes new ones. A resize regenerates 200 ms after the last one; until then the old layer is drawn at its
  // own size, never stretched, with the flat water under what it misses.
  let water = { img: null, w: 0, h: 0, flat: paper }, marks = null, marksKey = '', layerKey = '', waterCanvas = null, resizedAt = -Infinity;
  const relayWater = (now) => {
    const mk = `${world.seed} ${vw} ${vh} ${params.marks} ${params.markDensity}`;
    if (mk !== marksKey && (!marks || now - resizedAt > 200)) { marks = { w: vw, h: vh, list: waterMarks(world.seed, vw, vh, params.marks, params.markDensity) }; marksKey = mk; }
    const res = groundRes(), lk = `${marksKey} ${res} ${paper} ${ink} ${params.water} ${params.markAlpha}`;
    if (lk === layerKey) return;
    layerKey = lk;
    const flat = waterOf(paper, params.water);
    if (!waterCanvas) waterCanvas = document.createElement('canvas');
    waterCanvas.width = Math.max(1, Math.round(marks.w * res)); waterCanvas.height = Math.max(1, Math.round(marks.h * res));
    const c = waterCanvas.getContext('2d', { alpha: false }); c.setTransform(res, 0, 0, res, 0, 0);
    c.fillStyle = flat; c.fillRect(0, 0, marks.w, marks.h); drawMarks(c, marks.list, ink, params.markAlpha);
    water = { img: waterCanvas, w: marks.w, h: marks.h, flat };
  };
  let vw = 1, vh = 1;
  const resize = () => {
    resizedAt = performance.now();
    vw = container.clientWidth || 1; vh = container.clientHeight || 1;
    canvas.width = Math.round(vw * dpr); canvas.height = Math.round(vh * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    resizeWorld(world, vw, vh);
  };
  const ro = new ResizeObserver(resize); ro.observe(container); resize();
  // On a dense screen the ground is drawn into a copy at coastRes backing pixels per CSS px (1.5 by default) and scaled
  // up onto the canvas: their big soft paths cost the GPU by the pixel. At 1 the faint shoreline and waves visibly
  // soften, so the default keeps some of the resolution back. The live layer is drawn over them at full resolution. At coastRes >= dpr they go straight on.
  let coastCanvas = null, coastCtx = null;
  const paint = () => {
    const res = groundRes();
    if (res >= dpr) drawGround(ctx, world, ink, paper, water);
    else {
      if (!coastCtx) { coastCanvas = document.createElement('canvas'); coastCtx = coastCanvas.getContext('2d', { alpha: false }); }
      const cw = Math.max(1, Math.round(vw * res)), ch = Math.max(1, Math.round(vh * res));
      if (coastCanvas.width !== cw || coastCanvas.height !== ch) { coastCanvas.width = cw; coastCanvas.height = ch; }
      coastCtx.setTransform(res, 0, 0, res, 0, 0);
      drawGround(coastCtx, world, ink, paper, water);
      ctx.imageSmoothingEnabled = true; ctx.drawImage(coastCanvas, 0, 0, vw, vh);
    }
    drawLive(ctx, world, ink, paper, GOLD);
  };
  let alive = true, raf = 0, last = performance.now();
  const tick = (now) => {
    raf = 0;
    if (!alive || document.hidden) return;
    raf = requestAnimationFrame(tick);
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now;
    inkAge += dt; if (inkAge > 1) readInk();
    step(world, dt);
    relayWater(now);
    paint();
  };
  // a hidden tab runs nothing; on return the clock restarts rather than jumping by the time away
  const onVisible = () => { if (!alive) return; if (document.hidden) { if (raf) cancelAnimationFrame(raf); raf = 0; } else if (!raf) { last = performance.now(); raf = requestAnimationFrame(tick); } };
  document.addEventListener('visibilitychange', onVisible);
  raf = requestAnimationFrame(tick);
  let dev = null;
  const api = {
    setSources(list) { setIslands(world, list); },
    setOutlines(fns) { setOutlines(world, fns); },
    setPointer(x, y, on) { setPointer(world, x, y, on); },
    hit(x, y) { return islandAt(world, x, y); },
    drop(x, y) { dropTreat(world, x, y); },
    strokeStart(x, y) { strokeStart(world, x, y); },
    strokeTo(x, y) { strokeTo(world, x, y); },
    strokeEnd() { strokeEnd(world); },
    strokeCancel() { strokeCancel(world); },
    params,
    // clear the water: every treat and ripple goes
    clear() { world.treats.length = 0; world.ripples.length = 0; },
    // shrinking the canvas to nothing hands the backing store back now rather than at the next collection
    destroy() {
      alive = false; if (raf) cancelAnimationFrame(raf); ro.disconnect();
      document.removeEventListener('visibilitychange', onVisible); reducedQ?.removeEventListener?.('change', onReduced);
      if (dev) dev.destroy();
      canvas.width = canvas.height = 0; if (coastCanvas) coastCanvas.width = coastCanvas.height = 0; if (waterCanvas) waterCanvas.width = waterCanvas.height = 0; if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    },
  };
  if (new URLSearchParams(location.search).has('dev')) import('./pond-dev.js').then((m) => { if (alive) dev = m.mount(api); }).catch((e) => console.error('pond-dev', e));
  return api;
}
