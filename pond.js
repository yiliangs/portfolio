// Home pond: the page seen from above as still water, with the two home objects standing in it as islands. A few
// dozen line-drawn fish swim between them in groups that form, merge and part on their own, a few of them koi with gold
// patches, water laps inward at each shore, reeds stand in the shallows, water striders skate, lily pads drift, a lotus
// or two among them, on the open water and give a frightened fish somewhere to
// hide, and a click drops a treat the fish race for and eat. The layer sits behind reading text, so the resting
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
    shallows: [0.6, 0, 1, 0.05, 'how far the shallows lighten back toward the land'],
    coastRes: [1.5, 1, 2, 0.25, 'resolution of the coasts on a dense screen: 1 CSS px, 2 the full backing store'],
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
    floraAlpha: [0.55, 0, 1, 0.01, 'opacity of the green things on the surface'],
    shadow: [0.08, 0, 0.4, 0.005, 'opacity of the shadow a thing on the surface casts on the water'],
    reeds: [3, 0, 8, 1, 'reed clumps in each island\'s shallows on a fine pointer'],
    reedsTouch: [2, 0, 8, 1, 'reed clumps per island on a coarse pointer'],
    sway: [4.5, 0, 12, 0.5, 'mean sway of a reed\'s tip, px'],
    bend: [12, 0, 30, 1, 'most a passing fish or the cursor bends a reed\'s tip, px'],
    flowers: [2, 0, 8, 1, 'lotus flowers on the pads on a fine pointer'],
    flowersTouch: [1, 0, 8, 1, 'lotus flowers on a coarse pointer'],
    striders: [4, 0, 16, 1, 'water striders on a fine pointer'],
    stridersTouch: [2, 0, 16, 1, 'water striders on a coarse pointer'],
    dart: [80, 10, 300, 5, 'a water strider\'s dart speed, px/s'],
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
}
// the swell at bearing t, within -1..1
export function swell(o, t) {
  let g = 0;
  for (let i = 0; i < SWELL.length; i++) g += SWELL_W[i] * Math.cos(SWELL[i] * t + o.ph[i] + o.om[i] * o.time) * (0.7 + 0.3 * Math.sin(o.br[i] * o.time + o.ph[i]));
  return g;
}
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
    seed: opts.seed == null ? 1 : opts.seed, reeds: [], flowers: [], bloomRand: null, striders: [], srand: null,
    pads: [], padSeed: ((opts.seed == null ? 1 : opts.seed) ^ 0x9ad5eed) >>> 0, padIsl: 0, prand: null, flow: null,
  };
  populate(w);
  spawnPads(w);
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
export function resizeWorld(w, width, height) { w.w = Math.max(1, width); w.h = Math.max(1, height); }
// The islands follow the boxes by index: an island keeps its shape and swell when its box moves, and a new one is
// shaped at once. The outline functions, one per island by index, are read every step.
export function setIslands(w, boxes) {
  const list = boxes || [];
  w.islands.length = Math.min(w.islands.length, list.length);
  list.forEach((b, i) => { if (w.islands[i]) placeBox(w.islands[i], b); else { const o = makeIsland(i, b); updateIsland(o, w.outlines[i], 0, w.params, w.reduced, w.t); w.islands.push(o); } });
  // pads laid out before the page had any islands are laid out again round the first ones, while the pond is new
  if (!w.padIsl && w.islands.length && w.t < 1) spawnPads(w);
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

// ----- lily pads -----
// A pad is a disc with a slit cut toward its own heading, floating on open water. The pads start in two or three loose
// clusters, drift on a slow flow that turns over the page and over time (nearby pads share it, so a cluster keeps
// roughly together while it drifts and rearranges), turn a little as they go, nudge each other apart, keep off the
// islands and the screen edges, and take a push outward from each ripple ring that passes under them. Everything here
// runs on the pads' own seeded source (prand), apart from the fishes', so pads never change how the fish draw theirs.
// pad: { x, y, r, a (heading of the notch), vx, vy (the push still carried from ripples), va, ph, since (s since a push) }
const padTarget = (w) => Math.max(0, Math.round(w.coarse ? w.params.padsTouch : w.params.pads));
const RIPPLE_FULL = 34, PAD_GAP = 4, PAD_COAST = 30, PAD_EDGE = 30, PAD_MAX = 5, PAD_DRAG = 0.6;
// Whether a pad of radius r at (x,y) may be laid there: clear of the edges, the coasts and the other pads.
function padFree(w, x, y, r, coastGap, edgeGap) {
  if (x < edgeGap + r || x > w.w - edgeGap - r || y < edgeGap + r || y > w.h - edgeGap - r) return false;
  for (const o of w.islands) if (shoreGap(o, x, y, coastGap + r) < 0) return false;
  for (const q of w.pads) if (Math.hypot(q.x - x, q.y - y) < q.r + r + PAD_GAP) return false;
  return true;
}
// Lays the pads out afresh from the pads' seed: two or three cluster centres on open water, then each pad by rejection
// round its centre, on open water anywhere should the cluster be full.
function spawnPads(w) {
  w.prand = rng(w.padSeed); w.pads = []; w.padIsl = w.islands.length;
  for (const f of w.fish) f.pad = null;
  const r = w.prand;
  w.flow = { a0: r() * TAU, p1: r() * TAU, p2: r() * TAU };
  const k = 2 + Math.floor(r() * 2);
  w.padCl = [];
  for (let c = 0; c < k; c++) {
    let best = null;
    for (let t = 0; t < 40 && !best; t++) { const x = (0.1 + 0.8 * r()) * w.w, y = (0.1 + 0.8 * r()) * w.h; if (padFree(w, x, y, 50, 40, PAD_EDGE)) best = { x, y }; }
    w.padCl.push(best || { x: (0.2 + 0.6 * r()) * w.w, y: (0.2 + 0.6 * r()) * w.h });
  }
  addPads(w, padTarget(w));
}
function addPads(w, n) {
  const r = w.prand;
  for (let i = 0; i < n; i++) {
    const rad = 10 + 12 * r(), c = w.padCl[w.pads.length % w.padCl.length];
    let x = c.x, y = c.y, ok = false;
    for (let t = 0; t < 120 && !ok; t++) {
      if (t < 60) { const d = Math.sqrt(r()) * 90, b = r() * TAU; x = c.x + Math.cos(b) * d; y = c.y + Math.sin(b) * d; }
      else { x = (0.05 + 0.9 * r()) * w.w; y = (0.05 + 0.9 * r()) * w.h; }
      ok = padFree(w, x, y, rad, 40, PAD_EDGE);
    }
    w.pads.push({ x, y, r: rad, a: r() * TAU, vx: 0, vy: 0, va: 0, ph: r() * TAU, since: Infinity });
  }
}
// The drift of the water at (x,y): a heading that turns slowly over the page and over time.
function flowAt(w, x, y) {
  const f = w.flow, t = w.t;
  return f.a0 + 0.03 * t + 1.1 * Math.sin(0.0035 * x + 0.05 * t + f.p1) + 1.1 * Math.sin(0.0041 * y - 0.04 * t + f.p2);
}
function stepPads(w, dt) {
  const p = w.params, P = w.pads, r = w.prand;
  const n = padTarget(w);
  if (P.length < n) addPads(w, n - P.length);
  else if (P.length > n) { P.length = n; for (const f of w.fish) f.pad = null; }
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
      let ux = Math.cos(h) * s, uy = Math.sin(h) * s;
      for (const o of P) {
        if (o === q) continue;
        const dx = q.x - o.x, dy = q.y - o.y, d = Math.hypot(dx, dy) || 1e-6, room = d - q.r - o.r;
        if (room < 12) { const k = Math.min(1.5, (12 - room) / 12) * 4; ux += (dx / d) * k; uy += (dy / d) * k; }
      }
      for (const o of w.islands) {
        const gap = shoreGap(o, q.x, q.y, PAD_COAST);
        if (gap < 30) { shoreNormal(o, q.x, q.y, NRM); const k = Math.min(1.5, 1 - gap / 30) * 6; ux += NRM.x * k; uy += NRM.y * k; }
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
  // then hard limits, which the soft pushes above keep from ever acting in calm water: apart, off the land, on screen.
  // They also carry the pads through a resize or an island that moves under them, reduced motion or not
  for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) {
    const a = P[i], b = P[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), need = a.r + b.r;
    if (d >= need) continue;
    const ux = d > 1e-6 ? dx / d : 1, uy = d > 1e-6 ? dy / d : 0, k = (need - d) / 2;
    a.x -= ux * k; a.y -= uy * k; b.x += ux * k; b.y += uy * k;
  }
  for (const q of P) {
    for (const o of w.islands) if (shoreGap(o, q.x, q.y, q.r) < 0) { onShore(o, q.x, q.y, q.r, PT); q.x = PT.x; q.y = PT.y; }
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

// ----- reeds -----
// A few clumps of reeds stand in each island's shallows. A clump roots at its own bearing from the island's centre, a
// few px past the coast, and every step finds its roots again from the coast, so the reeds ride the swell and follow
// the island when its object moves. Seen from above a stem is a short curve from its root, leaning outward. Each stem
// sways on its own slow beat, and a fish swimming past its root or the cursor near it bends the tip away, easing back
// after; the fish do not steer round the reeds. Each island's reeds come from a seeded source of their own, so an
// island keeps its reeds whatever else changes, and nothing else in the world moves differently for them.
// clump: { b (bearing), stems: [{ j (root along the coast, px), off (root past the coast, px), h, lean, hz, amp, ph,
//   bx, by (the bend now), rx, ry, cx, cy, tx, ty (root, control point and tip this step) }] }
const reedTarget = (w) => Math.max(0, Math.round(w.coarse ? w.params.reedsTouch : w.params.reeds));
const REED_FISH = 24, REED_PTR = 40, REED_IN = 0.08, REED_BACK = 0.5, BEND = { x: 0, y: 0 };
function growReeds(w, i, n) {
  const r = rng(((w.seed ^ 0x2eed5) + i * 7919) >>> 0), base = r() * TAU, out = [];
  for (let c = 0; c < n; c++) {
    const b = base + ((c + 0.6 * (r() - 0.5)) / n) * TAU, off = 8 + 12 * r(), stems = [];
    for (let k = 3 + Math.floor(r() * 5); k > 0; k--) stems.push({
      j: (r() - 0.5) * 10, off: Math.min(21, Math.max(7, off + (r() - 0.5) * 6)), h: 18 + 30 * r(), lean: (r() - 0.5) * 1.1,
      hz: 0.3 + 0.3 * r(), amp: 0.67 + 0.66 * r(), ph: r() * TAU, bx: 0, by: 0, rx: 0, ry: 0, cx: 0, cy: 0, tx: 0, ty: 0,
    });
    out.push({ b, stems });
  }
  return out;
}
// adds to BEND the push away from (x,y) a stem's root feels within reach: 1 at the root, 0 at reach
function bendAway(s, x, y, reach) {
  const dx = s.rx - x, dy = s.ry - y, d = Math.hypot(dx, dy);
  if (d < reach && d > 1e-6) { const k = 1 - d / reach; BEND.x += (dx / d) * k; BEND.y += (dy / d) * k; }
}
function stepReeds(w, dt) {
  const p = w.params, n = reedTarget(w), R = w.reeds, still = w.reduced, ptr = w.ptr, box = REED_FISH + 16;
  R.length = Math.min(R.length, w.islands.length);
  w.islands.forEach((o, i) => {
    if (!R[i] || R[i].length !== n) R[i] = growReeds(w, i, n);
    for (const c of R[i]) {
      // the fish near the clump at all; each stem then asks only these
      const near = [];
      if (!still) {
        const d0 = coast(o, c.b) + 14, x0 = o.x + Math.cos(c.b) * d0, y0 = o.y + Math.sin(c.b) * d0;
        for (const f of w.fish) if (Math.abs(f.x - x0) < box && Math.abs(f.y - y0) < box) near.push(f);
      }
      for (const s of c.stems) {
        const t = c.b + s.j / Math.max(20, coast(o, c.b)), d = coast(o, t) + s.off;
        s.rx = o.x + Math.cos(t) * d; s.ry = o.y + Math.sin(t) * d;
        const a = t + s.lean, ux = Math.cos(a), uy = Math.sin(a), sw = still ? 0 : p.sway * s.amp * Math.sin(TAU * s.hz * w.t + s.ph);
        BEND.x = 0; BEND.y = 0;
        if (!still) { for (const f of near) bendAway(s, f.x, f.y, REED_FISH); if (ptr.on) bendAway(s, ptr.x, ptr.y, REED_PTR); }
        const m = Math.hypot(BEND.x, BEND.y), g = m > 1 ? p.bend / m : p.bend, gx = BEND.x * g, gy = BEND.y * g;
        if (still) { s.bx = 0; s.by = 0; }
        else {
          // a push bends the tip at once; it eases back slowly once the push is gone
          const k = 1 - Math.exp(-dt / (Math.hypot(gx, gy) > Math.hypot(s.bx, s.by) ? REED_IN : REED_BACK));
          s.bx += (gx - s.bx) * k; s.by += (gy - s.by) * k;
        }
        s.tx = s.rx + ux * s.h - uy * sw + s.bx; s.ty = s.ry + uy * s.h + ux * sw + s.by;
        s.cx = s.rx + ux * s.h * 0.55 - uy * sw * 0.3 + s.bx * 0.3; s.cy = s.ry + uy * s.h * 0.55 + ux * sw * 0.3 + s.by * 0.3;
      }
    }
  });
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
  const r = rng((w.seed ^ 0xf10e5) >>> 0), P = w.pads, k = Math.max(1, (w.padCl || []).length), taken = new Set();
  w.flowers = []; w.bloomRand = r;
  for (let j = 0; j < n; j++) {
    // a pad from the next cluster (addPads deals pad i to cluster i % k), or any free pad once that cluster runs out
    let can = P.filter((q, i) => i % k === j % k && !taken.has(q));
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
    // hard limits, reduced motion or not: off the pads, off the land, on screen
    for (const q of w.pads) {
      const dx = s.x - q.x, dy = s.y - q.y, d = Math.hypot(dx, dy), need = q.r + STR_HARD;
      if (d < need) { const ux = d > 1e-6 ? dx / d : 1, uy = d > 1e-6 ? dy / d : 0; s.x = q.x + ux * need; s.y = q.y + uy * need; }
    }
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
      if (d < p.scare && d > 1e-6) { f.flee = 0.7; f.fx = dx / d; f.fy = dy / d; f.en = 1; if (!f.pad) seekPad(w, f, p.shelterChance); }
    }
    // and a calm fish now and then goes to rest under one on its own
    else if (!f.pad && !(f.idle > 0) && f.en < 0.05 && !f.food && w.pads.length && w.prand() < p.rest * dt) seekPad(w, f, 1);
    if (f.flee > 0) { f.flee -= dt; sx += f.fx * 5 * Math.max(0, f.flee); sy += f.fy * 5 * Math.max(0, f.flee); }
    // islands: inside the look zone the part of the heading aimed at the shore is turned along it
    for (const o of w.islands) {
      const gap = shoreGap(o, f.x, f.y, p.shore);
      if (gap > p.look) continue;
      shoreNormal(o, f.x, f.y, NRM); const gx = NRM.x, gy = NRM.y;
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
  // move, then hold every head out of the islands and inside the page
  for (let i = 0; i < n; i++) {
    const f = F[i];
    f.x += Math.cos(f.h) * f.sp * dt; f.y += Math.sin(f.h) * f.sp * dt;
    for (const o of w.islands) {
      if (shoreR(o, f.x, f.y, p.shore) >= 1) continue;
      onShore(o, f.x, f.y, p.shore, PT); f.x = PT.x; f.y = PT.y;
      // shed the motion aimed inward: the fish slides along the shore
      shoreNormal(o, f.x, f.y, NRM); const gx = NRM.x, gy = NRM.y;
      let vx = Math.cos(f.h), vy = Math.sin(f.h); const into = vx * gx + vy * gy;
      if (into < 0) { vx -= into * gx; vy -= into * gy; if (Math.hypot(vx, vy) > 1e-6) f.h = Math.atan2(vy, vx); }
    }
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
    }
    // the first mouth to reach a treat takes it
    const bite = f.len * 0.3 + 4;
    for (let k = 0; k < w.treats.length; k++) {
      const t = w.treats[k];
      if (Math.hypot(t.x - f.x, t.y - f.y) < bite) { w.treats.splice(k, 1); ripple(w, t.x, t.y, 14, 0.9); w.eaten++; remember(w, t); if (!w.reduced) f.en = Math.max(f.en, 0.5); break; }
    }
  }
  // the surface, after the fish, so a reed bends from where a fish is now
  stepReeds(w, dt);
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
// bands of shallows round each island, far to near: grown by px, strength of the land colour laid over the water
const SHALLOWS = [[36, 0.16], [20, 0.2], [9, 0.28]];

// Draws the world onto ctx (already scaled to CSS px). ink and paper are CSS colours (paper is the land); water is the
// pond's colour and defaults to the land's; gold is the treats' and the koi's colour. The world is two layers, drawn in order: the
// coasts (opaque: the water, the land, the shores and the waves lapping at them) and the live layer over them (the
// fish, the ripples and the treats, then the things on the surface). The shell may draw the coasts at a lower resolution than the live layer.
export function draw(ctx, w, ink, paper, gold, water = paper) {
  drawCoasts(ctx, w, ink, paper, water);
  drawLive(ctx, w, ink, paper, gold);
}
// The coast layer: covers the whole canvas, so it needs nothing under it.
export function drawCoasts(ctx, w, ink, paper, water = paper) {
  const p = w.params, still = w.reduced;
  // the water, then each island as land with shallows lightening toward its coast
  ctx.globalAlpha = 1; ctx.fillStyle = water; ctx.fillRect(0, 0, w.w, w.h);
  ctx.fillStyle = paper;
  for (const o of w.islands) {
    for (const [g, a] of SHALLOWS) { ctx.globalAlpha = p.shallows * a; coastPath(ctx, o, g); ctx.fill(); }
    ctx.globalAlpha = 1; coastPath(ctx, o, 0); ctx.fill();
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
// over a paper fill. The surface layer (pads, flowers, reeds, striders) is flat translucent flora with no outline, and
// what lies flat on the water casts a shadow: the same shape in ink, offset down and to the right, unblurred (a blur
// costs the GPU far more than the offset, which reads as a shadow on its own). The air layer, the dragonfly, is an ink
// line with paper wings, its shadow further off while it flies.
export const FLORA = '#5f7f66';
const SHADOW_X = 2, SHADOW_Y = 3, SLIT = (18 / 180) * Math.PI;
// A pad: a disc with a narrow slit cut toward its heading, the slit ending short of the centre in a rounded end.
function padPath(ctx, q, ox, oy) {
  const x = q.x + ox, y = q.y + oy, a = q.a, h = SLIT / 2, d0 = 0.18 * q.r, rr = 0.05 * q.r + 0.4;
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
let petalFor = '', petal = '';
// A lotus: a bud is a small pointed ellipse in paper with a gold tip; open, six petals of paper tinted toward gold
// round a gold centre, spreading with the open fraction.
const bloomR = (f) => 2.4 + 4.6 * f.open;
function drawFlower(ctx, f, paper, gold) {
  const o = f.open, a = f.rot + f.q.a;
  ctx.globalAlpha = 0.9;
  if (o < 0.12) {
    const c = Math.cos(a), s = Math.sin(a), L = 3, H = 1.9;
    ctx.fillStyle = paper; ctx.beginPath();
    ctx.moveTo(f.x - c * L, f.y - s * L);
    ctx.quadraticCurveTo(f.x - s * H * 2, f.y + c * H * 2, f.x + c * L, f.y + s * L);
    ctx.quadraticCurveTo(f.x + s * H * 2, f.y - c * H * 2, f.x - c * L, f.y - s * L);
    ctx.fill();
    ctx.fillStyle = gold; ctx.beginPath(); ctx.arc(f.x + c * (L - 1), f.y + s * (L - 1), 0.9, 0, TAU); ctx.fill();
    return;
  }
  const rl = 2.2 + 3.6 * o, rw = 1.3 + 0.8 * o, d = 0.6 + 2.6 * o;
  ctx.fillStyle = petal; ctx.beginPath();
  for (let k = 0; k < 6; k++) {
    const b = a + (k * TAU) / 6, cx = f.x + Math.cos(b) * d, cy = f.y + Math.sin(b) * d;
    ctx.moveTo(cx + Math.cos(b) * rl, cy + Math.sin(b) * rl); ctx.ellipse(cx, cy, rl, rw, b, 0, TAU);
  }
  ctx.fill();
  ctx.fillStyle = gold; ctx.beginPath(); ctx.arc(f.x, f.y, 1.1 + 0.5 * o, 0, TAU); ctx.fill();
}
// The live layer, over the coasts: the fish, the ripples and treats in the water, then the surface over them.
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
  // the surface: every shadow first, so no shadow falls across a pad, then the pads over the fish, hiding a fish that
  // swims under one
  ctx.fillStyle = ink; ctx.globalAlpha = p.shadow;
  ctx.beginPath(); for (const q of w.pads) padPath(ctx, q, SHADOW_X, SHADOW_Y); ctx.fill();
  if (w.flowers.length) { ctx.beginPath(); for (const f of w.flowers) { ctx.moveTo(f.x + SHADOW_X + bloomR(f), f.y + SHADOW_Y); ctx.arc(f.x + SHADOW_X, f.y + SHADOW_Y, bloomR(f), 0, TAU); } ctx.fill(); }
  ctx.fillStyle = FLORA; ctx.globalAlpha = p.floraAlpha;
  ctx.beginPath(); for (const q of w.pads) padPath(ctx, q, 0, 0); ctx.fill();
  if (w.flowers.length) {
    if (petalFor !== paper + gold) { petalFor = paper + gold; petal = mixOf(paper, gold, 0.25); }
    for (const f of w.flowers) drawFlower(ctx, f, paper, gold);
    ctx.globalAlpha = p.floraAlpha;
  }
  // the reeds: a flora line each, too thin to cast a shadow worth drawing
  ctx.strokeStyle = FLORA; ctx.lineWidth = 1.5; ctx.beginPath();
  for (const C of w.reeds) if (C) for (const c of C) for (const s of c.stems) { ctx.moveTo(s.rx, s.ry); ctx.quadraticCurveTo(s.cx, s.cy, s.tx, s.ty); }
  ctx.stroke();
  // the striders: four legs and a short thick body, no shadow; their dimples are the ripples above
  if (w.striders.length) {
    ctx.lineWidth = 0.8; ctx.beginPath();
    for (const s of w.striders) for (const b of LEGS) { const a = s.a + b; ctx.moveTo(s.x, s.y); ctx.lineTo(s.x + Math.cos(a) * 6, s.y + Math.sin(a) * 6); }
    ctx.stroke();
    ctx.lineWidth = 2; ctx.beginPath();
    for (const s of w.striders) { const c = Math.cos(s.a) * 1.5, d = Math.sin(s.a) * 1.5; ctx.moveTo(s.x - c, s.y - d); ctx.lineTo(s.x + c, s.y + d); }
    ctx.stroke();
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
  let ink = '#201f1d', paper = '#f3f2f2', inkAge = Infinity, water = paper, waterFor = null, waterDepth = NaN;
  const readInk = () => { const css = getComputedStyle(container); ink = css.getPropertyValue('--color-text').trim() || ink; paper = css.getPropertyValue('--color-bg').trim() || paper; inkAge = 0; };
  let vw = 1, vh = 1;
  const resize = () => {
    vw = container.clientWidth || 1; vh = container.clientHeight || 1;
    canvas.width = Math.round(vw * dpr); canvas.height = Math.round(vh * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    resizeWorld(world, vw, vh);
  };
  const ro = new ResizeObserver(resize); ro.observe(container); resize();
  // On a dense screen the coasts are drawn into a copy at coastRes backing pixels per CSS px (1.5 by default) and scaled
  // up onto the canvas: their big soft paths cost the GPU by the pixel. At 1 the faint shoreline and waves visibly
  // soften, so the default keeps some of the resolution back. The live layer is drawn over them at full resolution. At coastRes >= dpr they go straight on.
  let coastCanvas = null, coastCtx = null;
  const paint = () => {
    const res = Math.min(dpr, Math.max(1, params.coastRes || 1));
    if (res >= dpr) drawCoasts(ctx, world, ink, paper, water);
    else {
      if (!coastCtx) { coastCanvas = document.createElement('canvas'); coastCtx = coastCanvas.getContext('2d', { alpha: false }); }
      const cw = Math.max(1, Math.round(vw * res)), ch = Math.max(1, Math.round(vh * res));
      if (coastCanvas.width !== cw || coastCanvas.height !== ch) { coastCanvas.width = cw; coastCanvas.height = ch; }
      coastCtx.setTransform(res, 0, 0, res, 0, 0);
      drawCoasts(coastCtx, world, ink, paper, water);
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
    if (paper !== waterFor || params.water !== waterDepth) { waterFor = paper; waterDepth = params.water; water = waterOf(paper, waterDepth); }
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
      canvas.width = canvas.height = 0; if (coastCanvas) coastCanvas.width = coastCanvas.height = 0; if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    },
  };
  if (new URLSearchParams(location.search).has('dev')) import('./pond-dev.js').then((m) => { if (alive) dev = m.mount(api); }).catch((e) => console.error('pond-dev', e));
  return api;
}
