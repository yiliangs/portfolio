// The mountain: a home scene seen straight down, drawn as a mapmaker draws high ground. The two objects stand on the
// plateaus of two summits whose top contours follow their live outlines; a height field of the summits, the ridge
// between them, the spurs running out from them, satellite crags and dips under the tarns is drawn one of three ways
// (hachures lit from the upper left, old-map hill signs in profile, or a two-tone woodcut; see the static layer), with
// snow above a snowline; tarns lie in the hollows, a stream runs down a valley to one, and scree, rock strata and a
// treeline of conifers are drawn fainter. Bald eagles soar in loose kettles: they glide between thermals, bank into their turns (the wings
// foreshorten and the body rolls), circle and climb in lift, peel off from the top of a thermal and sink on the glide to
// the next; the height they fly at is read from their drawn size. A press raises a thermal, a drag lays a line of ridge
// lift; eagles glide to either, climb in it, and leave as it is spent. A fast cursor is a gust: the eagles are tossed
// and go to cover, under a cloud or onto a crag, then soar again. Clouds drift with the wind and hide what flies under
// them; goats hop ledge to ledge and bolt from the cursor; edelweiss opens in stages on the meadow shelves.
// Everything is one weight of ink line varied only by alpha, over the page taken a little toward slate blue. The scene
// contract is the header of scenes/kit.js; this module is the descriptor `scene` at its foot.
import {
  FOOTPRINT, GROUND, BEARINGS, rng, hashPoint, pointRand, TAU, wrapAngle, placeFootprints, updateFootprint,
  edge, edgeGap, onEdge, edgeNormal, footprintAt, edgePath, pointer, pointTo, pointerSpeed,
  strokeOpen, strokeAlong, latticeMarks, drawMarks, rgbOf,
} from './kit.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const DEG = Math.PI / 180;

// Parameters by section: [default, min, max, step, label], or [value, 'toggle', label].
export const PARAMS = {
  ground: {
    slate: [0.07, 0, 0.4, 0.005, 'how far the page is taken toward the candidate\'s ground tone'],
    palette: [0, 0, 2, 1, 'tint candidate: 0 slate, 1 glacier, 2 dusk'],
    relief: [1, 0, 2, 1, 'how the mountain is drawn: 0 hachures, 1 hill signs, 2 woodcut'],
    ...GROUND,
  },
  summits: {
    ...FOOTPRINT,
    apron: [90, 0, 300, 5, 'open ground round each summit kept clear of crags, tarns and trees, px'],
    topAlpha: [0.3, 0, 1, 0.01, 'opacity of the top contour'],
    ridgeAlpha: [0.2, 0, 1, 0.01, 'opacity of the hachured saddle between the summits (hachure relief)'],
    clear: [14, 0, 80, 1, 'gap an eagle keeps from a summit\'s top contour, px'],
  },
  relief: {
    snow: [0.86, 0.5, 1, 0.01, 'snowline: the share of the ground off the plateaus that lies below it'],
    shade: [0.13, 0, 0.5, 0.01, 'woodcut: the flat tint of ink on the slopes facing away from the light'],
    lineAlpha: [0.42, 0, 1, 0.01, 'opacity of ridgelines, valley lines and the hill signs\' outlines'],
    density: [1, 0, 3, 0.05, 'how close the hachures are laid, strokes per area x this'],
    jitter: [0.35, 0, 1, 0.05, 'how loosely the hachures are laid, 0 a strict lattice, 1 hand-laid'],
    hachureAlpha: [0.22, 0, 1, 0.01, 'opacity of the hachures'],
    short: [4, 1, 20, 0.5, 'hachure length on a gentle slope, px'],
    long: [13, 2, 30, 0.5, 'hachure length on the steepest slope, px'],
    flat: [0.16, 0, 1, 0.01, 'slope, of a summit\'s steepest, below which ground is flat'],
    sparse: [0.35, 0, 1, 0.01, 'share of hachures kept on flat ground'],
  },
  floor: {
    crags: [6, 0, 14, 1, 'crags and satellite peaks on a fine pointer'],
    cragsTouch: [4, 0, 14, 1, 'crags on a coarse pointer'],
    tarns: [3, 1, 6, 1, 'tarns in the hollows'],
    trees: [1, 0, 3, 0.05, 'conifers on the low slopes, of the default'],
    floorAlpha: [0.2, 0, 1, 0.01, 'opacity of scree, strata, conifers and the crags\' rings'],
    waterAlpha: [0.5, 0, 1, 0.01, 'opacity of the tarns\' shores and the stream'],
  },
  eagles: {
    count: [36, 1, 120, 1, 'eagles on a fine pointer'],
    countTouch: [16, 1, 120, 1, 'eagles on a coarse pointer'],
    length: [13, 6, 50, 1, 'eagle length at mid height, px; the span is 2.45 of it, beak to tail 0.85'],
    glide: [70, 10, 200, 1, 'gliding speed, px/s'],
    circle: [40, 10, 200, 1, 'circling speed in lift, px/s'],
    orbit: [78, 20, 200, 1, 'mean radius an eagle circles in lift at, px'],
    turn: [1.5, 0.2, 5, 0.05, 'fastest turn, rad/s'],
    repel: [44, 0, 120, 1, 'room an eagle keeps from another, px'],
    climb: [0.12, 0, 1, 0.005, 'climb in full lift, of the height range per s'],
    sink: [0.035, 0, 1, 0.005, 'sink on the glide, of the height range per s'],
    flaps: [0.05, 0, 1, 0.01, 'chance per s of a flap series on the glide'],
    alpha: [0.55, 0.05, 1, 0.01, 'ink opacity'],
    width: [1, 0.3, 3, 0.05, 'line width, px'],
    reduced: [0.45, 0.05, 1, 0.05, 'speed under reduced motion, of circling'],
  },
  lift: {
    kettles: [7, 1, 30, 1, 'eagles per natural thermal, roughly'],
    life: [14, 2, 60, 1, 'seconds a raised thermal lasts with nothing circling in it'],
    use: [0.012, 0, 0.2, 0.001, 'share of a raised thermal one circling eagle spends per s'],
    pull: [420, 50, 1500, 10, 'how far raised lift draws eagles from, px'],
    spacing: [34, 8, 200, 1, 'gap between lift points along a drag, px'],
    most: [6, 1, 20, 1, 'raised thermals and ridges at once; the oldest goes'],
    liftAlpha: [0.3, 0, 1, 0.01, 'opacity of a thermal\'s spiral and a ridge\'s lift'],
  },
  gust: {
    gust: [850, 100, 4000, 50, 'cursor speed that is a gust, px/s'],
    reach: [150, 0, 500, 5, 'gust radius, px'],
    cover: [5, 0.5, 30, 0.5, 'seconds an eagle stays in cover'],
  },
  sky: {
    clouds: [4, 0, 12, 1, 'clouds on a fine pointer'],
    cloudsTouch: [3, 0, 12, 1, 'clouds on a coarse pointer'],
    size: [50, 20, 220, 1, 'mean cloud radius, px'],
    wind: [200, 0, 360, 5, 'where the wind blows toward, deg (0 right, 90 down)'],
    drift: [7, 0, 60, 0.5, 'wind speed at cloud height, px/s'],
    cloudAlpha: [0.3, 0, 1, 0.01, 'cloud outline opacity'],
    streaks: [7, 0, 30, 1, 'wind streaks over the high ground at once'],
    streakAlpha: [0.16, 0, 1, 0.01, 'wind streak opacity'],
  },
  life: {
    goats: [6, 0, 20, 1, 'goats on a fine pointer'],
    goatsTouch: [3, 0, 20, 1, 'goats on a coarse pointer'],
    bolt: [80, 0, 300, 5, 'how near the cursor comes before a goat bolts, px'],
    flowers: [12, 0, 40, 1, 'edelweiss on a fine pointer'],
    flowersTouch: [6, 0, 40, 1, 'edelweiss on a coarse pointer'],
    bloom: [48, 5, 300, 1, 'seconds from bud to open and back to bud'],
  },
  study: {
    study: [0, 'toggle', 'pose study: one eagle at eight times flight scale in the middle of the page'],
    bank: [0, -70, 70, 1, 'bank, deg; right wing down is positive'],
    flap: [0, 0, 1, 0.01, 'wingbeat phase'],
    beat: [0, 0, 1, 0.05, 'how much of a wingbeat, 0 gliding'],
    rise: [0.5, 0, 1, 0.01, 'height, 0 low and small to 1 high and large'],
    heading: [270, 0, 360, 1, 'heading, deg (270 up the page)'],
    fan: [0, 0, 1, 0.05, 'tail spread'],
  },
};

// ----- colour -----
// Three candidate ground tones, a light and a dark target each, switched live by the `palette` parameter. The kit
// reads palette.light and palette.dark when it repaints the static layer; layer.look() picks the candidate just before,
// and names it in what the paint depends on, so a switch repaints.
export const CANDIDATES = [
  { name: 'slate', light: [70, 96, 140], dark: [10, 22, 62] },
  { name: 'glacier', light: [86, 128, 150], dark: [4, 32, 50] },
  { name: 'dusk', light: [64, 74, 132], dark: [20, 14, 66] },
];
let shown = 0;
export const pickCandidate = (p) => (shown = clamp(Math.round(p.palette) | 0, 0, CANDIDATES.length - 1));
export const PALETTE = {
  get light() { return CANDIDATES[shown].light; },
  get dark() { return CANDIDATES[shown].dark; },
  depth: 'slate',
  accents: { water: '#4f7698' },
};

// ----- the eagle -----
// An eagle seen from straight above, built in its own frame and projected. Units are the eagle's length L (beak to
// tail tip about 0.8 of it, the span 2.3); x runs forward, y to the eagle's right, z up toward the viewer. A pose is
// { bank, flap, beat, fan }:
//   bank  roll in radians, positive with the right wing down (a turn to the right). The roll carries the wings round the
//         body's axis: the low wing shortens and shrinks, the high wing, swung toward the viewer, shortens and grows
//         under a weak perspective; the tail twists against the turn and the head looks into it.
//   flap  the wingbeat's phase, 0..1; beat how much of a beat (0 gliding, 1 a full stroke). The wings sweep through
//         their dihedral and foreshorten; on the upstroke the hand folds back at the wrist and draws in.
//   fan   how far the tail is spread, 0..1 (an eagle circling slow in lift spreads it).
// Points are given for the right side; the left is the mirror.
// The figure is a bald eagle's, read from above by what marks one at a glance: a dark body and dark wings against a
// white head and a white tail; at each wingtip the long primaries spread apart like fingers; plank wings, broad and of
// nearly one chord from the body to the hand, the leading edge almost straight and swept a little forward, the trailing
// edge bowing out before the fingers and fringed there by a few shallow feather ends; a short, wide, square-cut tail;
// a large head jutting forward with a hooked beak. The dark is one flat tint of ink on paper, the white the paper.
// The leading edge, shoulder out to the hand, then the hand's front corner where the first finger springs.
const LEAD = [0.13, 0.07, 0.17, 0.3, 0.2, 0.6, 0.205, 0.8];
const HAND_FRONT = [0.18, 0.9], HAND_BACK = [-0.17, 0.84];
// The fingers fan from a centre in the hand, each FINGER_R long from it (the middle ones longest by FINGER_BULGE),
// slotted down to SLOT_R between them, so each reaches about a third of the chord past the hand. Their tips stand
// FINGER_PITCH px apart on the drawn arc, 4 to 7 a wing: the fan opens from FAN_SPREAD[0] radians up to
// FAN_SPREAD[1] round FAN_MID (off the span, forward positive) to keep a small eagle's four fingers parted by paper.
const FAN_C = [0, 0.8], FAN_MID = -0.09, FAN_SPREAD = [1.5, 2.1], FINGER_R = 0.38, FINGER_BULGE = 0.05, SLOT_R = 0.18;
const FINGER_PITCH = 3.5;
// The trailing edge, the hand's back corner to the wing's root; laid out by EDGE below.
const TRAIL = [-0.17, 0.84, -0.27, 0.68, -0.32, 0.45, -0.31, 0.22, -0.26, 0.08];
// The dark body between the wings as x, y, sharp from the neck back to the tail's root; the wings' roots join it.
const NECK = [0.16, 0.055, 0], RUMP = [-0.28, 0.06, 0, -0.31, 0.04, 0];
// The white head from its crown on the axis round the right side to the nape, then mirrored; the beak's hooked tick
// an open run; the square tail fan from its root to a corner and across its end to the axis, then mirrored.
const HEAD = [0.335, 0, 0, 0.318, 0.05, 0, 0.26, 0.09, 0, 0.17, 0.092, 0, 0.1, 0.062, 0];
const BEAK = [0.33, 0.014, 1, 0.39, 0.004, 1, 0.377, -0.026, 1];
const TAIL = [-0.24, 0.055, 0, -0.47, 0.15, 1, -0.495, 0.08, 0], TAIL_END = -0.5;
// Perched, the wings folded along the back and seen from above: the dark folded wings from the neck to their crossed
// tips, a fringe notch or two down each side; the white head ahead and the white tail's tip showing past the wings.
const PERCHED = [
  0.16, 0.07, 0, 0.02, 0.16, 0, -0.14, 0.18, 0, -0.28, 0.165, 0, -0.26, 0.115, 1, -0.4, 0.125, 0, -0.38, 0.075, 1,
  -0.5, 0.07, 0, -0.55, 0.03, 0,
];
const PERCHED_TIP = -0.57, PERCHED_TAIL = [-0.48, 0.06, 0, -0.62, 0.085, 1], PERCHED_TAIL_END = -0.64;
const WRIST = [0.2, 0.5], SHOULDER_Y = 0.08, HEAD_PIVOT = 0.13, TAIL_PIVOT = -0.28;
// The perspective is weaker at flight size than in the study: a stronger one was tried to make a bank read at 40 px
// across, and in flight it made a banked eagle a lopsided cross, the far wing all but gone.
const DIHEDRAL = 0.1, FLAP_AMP = 0.62, FOLD = 0.7, PERSP = 0.38, FLIGHT_PERSP = 0.3;
// An eagle's drawn length for its height (0 low, 1 high), of the nominal length: 0.65 to 1.4, more than twice as large
// at the top of a thermal as skimming low, so height reads without tone.
export const sizeAt = (alt) => 0.65 + 0.75 * alt;

// The pose in force, set by poseEagle and read by the point functions: where the eagle stands, its heading's cos and
// sin, its drawn length, the roll and the wingbeat.
const P = { x: 0, y: 0, c: 1, s: 0, L: 10, cb: 1, sb: 0, th: 0, fold: 0, hc: 1, hs: 0, tc: 1, ts: 0, fan: 0, k: PERSP };
function poseEagle(x, y, heading, L, pose, persp = PERSP) {
  P.x = x; P.y = y; P.c = Math.cos(heading); P.s = Math.sin(heading); P.L = L; P.k = persp;
  P.cb = Math.cos(pose.bank); P.sb = Math.sin(pose.bank);
  const ph = TAU * pose.flap;
  P.th = FLAP_AMP * pose.beat * Math.sin(ph);
  P.fold = FOLD * pose.beat * Math.max(0, Math.cos(ph)); // the upstroke, when the wing is rising
  const hd = 0.5 * pose.bank, tl = -0.4 * pose.bank;
  P.hc = Math.cos(hd); P.hs = Math.sin(hd); P.tc = Math.cos(tl); P.ts = Math.sin(tl); P.fan = pose.fan;
}
// Q holds projected points as x, y pairs; SH marks how a path meets each: 0 smooth, curved past through the midpoints;
// 1 sharp, a notch between feather ends, met with a straight line; 2 a feather end's control point, a single curve
// from the notch before it to the notch after it, so a feather end costs one verb.
const Q = new Float32Array(512), SH = new Uint8Array(256);
let qn = 0;
// roll about the body's axis, the weak perspective, the heading, the page
function put(x, y, z, sharp) {
  const yr = y * P.cb + z * P.sb, zr = -y * P.sb + z * P.cb, f = P.L / (1 - P.k * zr);
  const lx = x * f, ly = yr * f;
  Q[2 * qn] = P.x + lx * P.c - ly * P.s; Q[2 * qn + 1] = P.y + lx * P.s + ly * P.c; SH[qn] = sharp === 2 ? 2 : sharp ? 1 : 0; qn++;
}
// a wing point: folded about the wrist on the upstroke, flapped and lifted about the shoulder, then put
function wingPt(side, x, y, sharp) {
  if (y > WRIST[1] && P.fold > 0) {
    const a = -P.fold, dx = x - WRIST[0], dy = y - WRIST[1], c = Math.cos(a), s = Math.sin(a), k = 1 - (0.3 * P.fold) / FOLD;
    x = WRIST[0] + (dx * c - dy * s) * k; y = WRIST[1] + (dx * s + dy * c) * k;
  }
  const r = y - SHOULDER_Y, a = DIHEDRAL + P.th * (0.55 + 0.45 * Math.min(1, r / WRIST[1]));
  put(x, side * (SHOULDER_Y + r * Math.cos(a)), r * Math.sin(a), sharp);
}
// a body point; ahead of the neck the head turns into the bank
function bodyPt(x, y, sharp) {
  if (x > HEAD_PIVOT) { const dx = x - HEAD_PIVOT; x = HEAD_PIVOT + dx * P.hc - y * P.hs; y = dx * P.hs + y * P.hc; }
  put(x, y, 0.04, sharp);
}
// a tail point: spread by the fan and twisted against the bank
function tailPt(x, y, sharp) {
  y *= 1 + 0.9 * P.fan; const dx = x - TAIL_PIVOT;
  put(TAIL_PIVOT + dx * P.tc - y * P.ts, dx * P.ts + y * P.tc, 0, sharp);
}
// The trailing edge laid out once: a Catmull-Rom spline through TRAIL, resampled at EM + 1 even steps of its length,
// each as x, y and the unit normal pointing into the wing. EDGE_LEN is its length in body lengths.
const EM = 96, EDGE = new Float32Array(4 * (EM + 1));
let EDGE_LEN = 0;
{
  const n = TRAIL.length / 2, X = (i) => TRAIL[2 * clamp(i, 0, n - 1)], Y = (i) => TRAIL[2 * clamp(i, 0, n - 1) + 1], s = [];
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < 12; j++) {
    const u = j / 12, u2 = u * u, u3 = u2 * u;
    const b0 = -0.5 * u3 + u2 - 0.5 * u, b1 = 1.5 * u3 - 2.5 * u2 + 1, b2 = -1.5 * u3 + 2 * u2 + 0.5 * u, b3 = 0.5 * u3 - 0.5 * u2;
    s.push(b0 * X(i - 1) + b1 * X(i) + b2 * X(i + 1) + b3 * X(i + 2), b0 * Y(i - 1) + b1 * Y(i) + b2 * Y(i + 1) + b3 * Y(i + 2));
  }
  s.push(X(n - 1), Y(n - 1));
  const m = s.length / 2, cum = [0];
  for (let i = 1; i < m; i++) cum.push(cum[i - 1] + Math.hypot(s[2 * i] - s[2 * i - 2], s[2 * i + 1] - s[2 * i - 1]));
  EDGE_LEN = cum[m - 1];
  for (let k = 0, j = 1; k <= EM; k++) {
    const d = (EDGE_LEN * k) / EM;
    while (j < m - 1 && cum[j] < d) j++;
    const tx = s[2 * j] - s[2 * j - 2], ty = s[2 * j + 1] - s[2 * j - 1], tl = Math.hypot(tx, ty), f = (d - cum[j - 1]) / Math.max(1e-9, cum[j] - cum[j - 1]);
    EDGE[4 * k] = s[2 * j - 2] + tx * f; EDGE[4 * k + 1] = s[2 * j - 1] + ty * f; EDGE[4 * k + 2] = -ty / tl; EDGE[4 * k + 3] = tx / tl;
  }
}
// The fringe along the trailing edge, secondary to the fingers: a shallow feather end every FEATHER px of the drawn
// edge, 2 to 9 of them a wing, each one curve between two notches cut in by CUT of a feather's width and never less
// than LEAST_CUT px. Below FRINGE_SPAN px across it is only fuzz, and the edge is drawn plain.
const FEATHER = 4.5, CUT = 0.3, LEAST_CUT = 0.8, FRINGE_SPAN = 36, SPAN = 2.45;
// the curve's control that carries it from (ax, ay) to (bx, by) through (tx, ty), put as a control point
function through(side, ax, ay, tx, ty, bx, by) { wingPt(side, 2 * tx - (ax + bx) / 2, 2 * ty - (ay + by) / 2, 2); }
// One wing round from the shoulder: the leading edge out to the hand, the fingers fanned round its tip, the fringe of
// the trailing edge back to the root. Each finger is one curve from the slot before it to the slot after it.
function wingRun(side) {
  const L = P.L, nf = clamp(Math.round((FINGER_R * FAN_SPREAD[0] * L) / FINGER_PITCH) + 1, 4, 7);
  const spread = clamp((FINGER_PITCH * (nf - 1)) / (FINGER_R * L), FAN_SPREAD[0], FAN_SPREAD[1]);
  const FAN = [FAN_MID + spread / 2, FAN_MID - spread / 2], slot = Math.min(SLOT_R, FINGER_R - 2 / L);
  wingPt(side, LEAD[0], LEAD[1], 1);
  for (let i = 2; i < LEAD.length; i += 2) wingPt(side, LEAD[i], LEAD[i + 1], false);
  let px = HAND_FRONT[0], py = HAND_FRONT[1];
  wingPt(side, px, py, 1);
  for (let i = 0; i < nf; i++) {
    const u = i / (nf - 1), a = FAN[0] + (FAN[1] - FAN[0]) * u, R = FINGER_R + FINGER_BULGE * Math.sin(Math.PI * u);
    const tx = FAN_C[0] + R * Math.sin(a), ty = FAN_C[1] + R * Math.cos(a);
    let nx = HAND_BACK[0], ny = HAND_BACK[1];
    if (i < nf - 1) { const b = a + (FAN[1] - FAN[0]) / (nf - 1) / 2; nx = FAN_C[0] + slot * Math.sin(b); ny = FAN_C[1] + slot * Math.cos(b); }
    through(side, px, py, tx, ty, nx, ny); wingPt(side, nx, ny, 1); px = nx; py = ny;
  }
  if (SPAN * L < FRINGE_SPAN) { const m = 4 * (EM >> 1); wingPt(side, EDGE[m], EDGE[m + 1], false); wingPt(side, EDGE[4 * EM], EDGE[4 * EM + 1], 1); return; }
  const n = clamp(Math.round((EDGE_LEN * L) / FEATHER), 2, 9), d = Math.max((CUT * EDGE_LEN) / n, LEAST_CUT / L);
  for (let k = 0; k < n; k++) {
    const e = 4 * Math.round(((k + 1) / n) * EM), cut = k < n - 1 ? d : 0;
    const nx = EDGE[e] + EDGE[e + 2] * cut, ny = EDGE[e + 1] + EDGE[e + 3] * cut, f = 4 * Math.round(((k + 0.5) / n) * EM);
    through(side, px, py, EDGE[f], EDGE[f + 1], nx, ny); wingPt(side, nx, ny, 1); px = nx; py = ny;
  }
}
// reverse the run of Q from a to qn in place: the left wing is laid out shoulder first and joined root first
function reverse(a) {
  for (let i = a, j = qn - 1; i < j; i++, j--) {
    let t = Q[2 * i]; Q[2 * i] = Q[2 * j]; Q[2 * j] = t; t = Q[2 * i + 1]; Q[2 * i + 1] = Q[2 * j + 1]; Q[2 * j + 1] = t;
    t = SH[i]; SH[i] = SH[j]; SH[j] = t;
  }
}
// a run of Q from a to b, open or closed: curved through the midpoints of smooth points, straight to sharp ones, and
// from a control point on to the point after it in one curve
function trace(ctx, a, b, closed) {
  const n = b - a, X = (i) => Q[2 * (a + ((i % n) + n) % n)], Y = (i) => Q[2 * (a + ((i % n) + n) % n) + 1], S = (i) => SH[a + ((i % n) + n) % n];
  if (closed) ctx.moveTo((X(-1) + X(0)) / 2, (Y(-1) + Y(0)) / 2); else ctx.moveTo(X(0), Y(0));
  const last = closed ? n : n - 1;
  for (let i = closed ? 0 : 1; i < last; i++) {
    if (S(i) === 2) { ctx.quadraticCurveTo(X(i), Y(i), X(i + 1), Y(i + 1)); i++; } else if (S(i)) ctx.lineTo(X(i), Y(i)); else ctx.quadraticCurveTo(X(i), Y(i), (X(i) + X(i + 1)) / 2, (Y(i) + Y(i + 1)) / 2);
  }
  if (closed) ctx.closePath(); else ctx.lineTo(X(n - 1), Y(n - 1));
}
// The run of Q from a to qn thinned: a smooth point that lies within THIN px of the line from the last point kept to
// the next is dropped, and qn moves back by the points dropped. The curve through such a point moves by less than that
// distance, well inside the one-px line, so a small eagle is drawn through fewer points than a large one and looks the
// same. The sharp points, the fringe's notches, are always kept, and so are the run's ends. A path's points are
// what its stroke costs the GPU process, and the eagles' strokes are most of the scene's.
const THIN = 0.2;
function thin(a) {
  if (qn - a < 3) return;
  let k = a + 1;
  for (let i = a + 1; i < qn - 1; i++) {
    if (!SH[i]) {
      const lx = Q[2 * k - 2], ly = Q[2 * k - 1], dx = Q[2 * i + 2] - lx, dy = Q[2 * i + 3] - ly, ex = Q[2 * i] - lx, ey = Q[2 * i + 1] - ly;
      if (Math.abs(dx * ey - dy * ex) < THIN * Math.hypot(dx, dy)) continue;
    }
    Q[2 * k] = Q[2 * i]; Q[2 * k + 1] = Q[2 * i + 1]; SH[k] = SH[i]; k++;
  }
  Q[2 * k] = Q[2 * qn - 2]; Q[2 * k + 1] = Q[2 * qn - 1]; SH[k] = SH[qn - 1]; qn = k + 1;
}
// the triples [x, y, sharp] of A from triple i0 on, through f on side (1 the right, -1 the mirror), forward or reversed
const run = (A, f, side, rev, i0 = 0) => { const n = A.length / 3; for (let j = i0; j < n; j++) { const i = rev ? n - 1 - (j - i0) : j; f(A[3 * i], side * A[3 * i + 1], A[3 * i + 2] === 1); } };
// The two flat tones of the figure for a page's ink and paper: the dark of body and wings, and the white of head and
// tail. On a light page the white is the paper and the dark a mix of ink into it; on a dark page the ink is the light
// one, so the white is nearly the ink and the dark stays near the paper: the white head reads as white on either.
const TONE_DARK = 0.58, TONE_DARK_NIGHT = 0.28, TONE_WHITE_NIGHT = 0.88;
let toneKey = '', tones = { dark: '#7a7978', white: '#f3f2f2' };
export function eagleTones(ink, paper) {
  const k = ink + '|' + paper; if (k === toneKey) return tones;
  const a = rgbOf(paper), b = rgbOf(ink); toneKey = k;
  if (!a || !b) return (tones = { dark: ink, white: paper });
  const light = (0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2]) / 255 > 0.5;
  const mix = (t) => `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(', ')})`;
  return (tones = light ? { dark: mix(TONE_DARK), white: paper } : { dark: mix(TONE_DARK_NIGHT), white: mix(TONE_WHITE_NIGHT) });
}
function fillStroke(ctx, fill, alpha) { ctx.fillStyle = fill; ctx.globalAlpha = 1; ctx.fill(); ctx.globalAlpha = alpha; ctx.stroke(); }
// The white marks never shrink below what reads as paper on the dark at flight size: the head is held at least
// HEAD_PX across and the tail at least TAIL_PX long, each grown about where it joins the body.
const HEAD_PX = 3.5, TAIL_PX = 3, HEAD_BACK = 0.1, HEAD_W = 0.184, TAIL_ROOT = -0.24, TAIL_LEN = 0.26;
let kh = 1, kt = 1;
const headPt = (x, y, s) => bodyPt(HEAD_BACK + (x - HEAD_BACK) * kh, y * kh, s);
const tailGrown = (x, y, s) => tailPt(TAIL_ROOT + (x - TAIL_ROOT) * kt, y * kt, s);
function whiteScale() { kh = Math.max(1, HEAD_PX / (HEAD_W * P.L)); kt = Math.max(1, TAIL_PX / (TAIL_LEN * P.L)); }
// the white head (with the beak's tick) and tail fan as one path
function whitePath(ctx) {
  whiteScale();
  qn = 0; run(HEAD, headPt, 1, false); run(HEAD, headPt, -1, true, 1); thin(0); ctx.beginPath(); trace(ctx, 0, qn, true);
  qn = 0; run(BEAK, headPt, 1, false); trace(ctx, 0, qn, false);
  qn = 0; run(TAIL, tailGrown, 1, false); tailGrown(TAIL_END, 0, false); run(TAIL, tailGrown, -1, true); trace(ctx, 0, qn, true);
}

// One eagle in flight at (x, y), heading in radians, L px long, in pose, its line at alpha; tone from eagleTones();
// persp the perspective factor (FLIGHT_PERSP in the scene). The caller sets strokeStyle and lineWidth. Two paths, each
// a flat fill under its outline: the dark one, a single outline round both wings and the body between them; then the
// white head and tail over its ends.
export function drawEagle(ctx, x, y, heading, L, pose, alpha, tone, persp = PERSP) {
  poseEagle(x, y, heading, L, pose, persp);
  qn = 0; run(NECK, bodyPt, 1, false); wingRun(1); run(RUMP, bodyPt, 1, false); run(RUMP, bodyPt, -1, true);
  const a = qn; wingRun(-1); reverse(a); run(NECK, bodyPt, -1, false); thin(0);
  ctx.beginPath(); trace(ctx, 0, qn, true); fillStroke(ctx, tone.dark, alpha);
  whitePath(ctx); fillStroke(ctx, tone.white, alpha);
  ctx.globalAlpha = 1;
}
// An eagle perched on a crag, its wings folded along the back: the white head and tail's tip, then the dark wings over
// them with the line where they meet down the middle.
const FLAT = { bank: 0, flap: 0, beat: 0, fan: 0 };
export function drawPerched(ctx, x, y, heading, L, alpha, tone) {
  poseEagle(x, y, heading, L, FLAT);
  whiteScale(); qn = 0; run(HEAD, headPt, 1, false); run(HEAD, headPt, -1, true, 1); ctx.beginPath(); trace(ctx, 0, qn, true);
  qn = 0; run(PERCHED_TAIL, bodyPt, 1, false); bodyPt(PERCHED_TAIL_END, 0, false); run(PERCHED_TAIL, bodyPt, -1, true); trace(ctx, 0, qn, true);
  fillStroke(ctx, tone.white, alpha);
  qn = 0; run(PERCHED, bodyPt, 1, false); bodyPt(PERCHED_TIP, 0, false); run(PERCHED, bodyPt, -1, true); ctx.beginPath(); trace(ctx, 0, qn, true);
  const b = qn; bodyPt(0.02, 0, true); bodyPt(-0.46, 0, true); fillStroke(ctx, tone.dark, alpha);
  ctx.beginPath(); trace(ctx, b, qn, false); ctx.globalAlpha = alpha * 0.7; ctx.stroke();
  ctx.globalAlpha = 1;
}

// ----- the height field -----
// relief: summit and crag peaks (gaussian), a broad ridge between the summits, dips under the tarns, and a slow swell
// of waves; height() and slope() read it. It is laid when the page's size or the objects' places change (plan()), with
// everything that stands on it: crags, tarns, the stream, ledges, meadow shelves.
export function height(R, x, y) {
  let z = 0;
  for (const k of R.peaks) { const dx = x - k.x, dy = y - k.y; z += k.h * Math.exp(-(dx * dx + dy * dy) / (k.r * k.r)); }
  const g = R.ridge;
  if (g) {
    const ex = g.bx - g.ax, ey = g.by - g.ay, u = clamp(((x - g.ax) * ex + (y - g.ay) * ey) / (ex * ex + ey * ey || 1), 0, 1);
    const dx = x - g.ax - ex * u, dy = y - g.ay - ey * u; z += g.h * Math.exp(-(dx * dx + dy * dy) / (g.r * g.r));
  }
  for (const s of R.spurs) {
    const ex = s.bx - s.ax, ey = s.by - s.ay, u = clamp(((x - s.ax) * ex + (y - s.ay) * ey) / s.l2, 0, 1);
    const dx = x - s.ax - ex * u, dy = y - s.ay - ey * u; z += (s.h0 + (s.h1 - s.h0) * u) * Math.exp(-(dx * dx + dy * dy) / (s.r * s.r));
  }
  for (const k of R.dips) { const dx = x - k.x, dy = y - k.y; z -= k.h * Math.exp(-(dx * dx + dy * dy) / (k.r * k.r)); }
  for (const v of R.waves) z += v[3] * Math.sin(v[0] * x + v[1] * y + v[2]);
  return z;
}
export function slope(R, x, y, out = { x: 0, y: 0 }) {
  const e = 1.5;
  out.x = (height(R, x + e, y) - height(R, x - e, y)) / (2 * e); out.y = (height(R, x, y + e) - height(R, x, y - e)) / (2 * e);
  return out;
}
// The ground a summit's rings may cover, by bearing from the summit's centre: no hachure is laid inside it.
const zoneR = (z, t) => { let u = (t / TAU) * BEARINGS; u -= Math.floor(u / BEARINGS) * BEARINGS; const i = Math.floor(u), f = u - i; return z.R[i % BEARINGS] * (1 - f) + z.R[(i + 1) % BEARINGS] * f; };
export const inZone = (R, x, y, g = 0) => R.zones.some((z) => Math.hypot(x - z.x, y - z.y) < zoneR(z, Math.atan2(y - z.y, x - z.x)) + g);
// The plateau a summit's footprint covers, as the zone without the apron: the relief is drawn up to it.
export const inCore = (R, x, y, g = 0) => R.cores.some((z) => Math.hypot(x - z.x, y - z.y) < zoneR(z, Math.atan2(y - z.y, x - z.x)) + g);
const near = (list, x, y, f, g) => list.some((k) => Math.hypot(x - k.x, y - k.y) < k.r * f + g);
const TOP = 110; // the header band: nothing laid above it but hachures

function layRelief(w) {
  const p = w.params, W = w.w, H = w.h, r = rng((w.seed ^ 0x6d6f756e) >>> 0);
  const R = {
    peaks: [], spurs: [], ridges: [], valleys: [], dips: [], ridge: null, waves: [], zones: [], cores: [], crags: [], tarns: [], stream: null,
    ledges: [], shelves: [], gref: 0.0025, snow: 1, q: [0, 0, 0, 0, 0],
  };
  for (const o of w.summits) {
    // the core: the edge's widest reach over a broad window of bearings and a margin; the zone, the apron beyond it
    const Z = new Float32Array(BEARINGS), K = new Float32Array(BEARINGS), win = BEARINGS >> 4;
    let mean = 0, km = 0;
    for (let j = 0; j < BEARINGS; j++) { let m = 0; for (let d = -win; d <= win; d++) m = Math.max(m, o.C[(j + d + BEARINGS) % BEARINGS]); K[j] = m + 4; Z[j] = m + p.apron + 0.1 * o.mean; mean += Z[j]; km += K[j]; }
    mean /= BEARINGS; km /= BEARINGS;
    R.zones.push({ x: o.x, y: o.y, R: Z, mean });
    R.cores.push({ x: o.x, y: o.y, R: K, mean: km });
    R.peaks.push({ x: o.x, y: o.y, r: mean * 1.3, h: 1 });
  }
  if (R.zones.length >= 2) { const [a, b] = R.zones; R.ridge = { ax: a.x, ay: a.y, bx: b.x, by: b.y, r: 0.4 * Math.min(a.mean, b.mean), h: 0.45 }; }
  for (let i = 0; i < 3; i++) { const a = r() * TAU, k = TAU / (500 + 500 * r()); R.waves.push([Math.cos(a) * k, Math.sin(a) * k, r() * TAU, 0.05]); }
  // crags and satellite peaks, clear of the zones and of each other
  const nc = Math.round(w.coarse ? p.cragsTouch : p.crags);
  for (let i = 0, tries = 0; R.crags.length < nc && tries < nc * 60; tries++) {
    const cr = 36 + r() * 40, x = 60 + r() * (W - 120), y = TOP + 20 + r() * (H - TOP - 70);
    if (inZone(R, x, y, cr * 0.9) || near(R.crags, x, y, 1, cr + 36)) continue;
    const c = { x, y, r: cr, h: 0.4 + 0.3 * r(), ph: [r() * TAU, r() * TAU, r() * TAU], perched: 0, ledges: [] };
    R.crags.push(c); R.peaks.push({ x, y, r: cr, h: c.h });
  }
  laySpurs(R, rng((w.seed ^ 0x73707572) >>> 0));
  // the spread of heights, for the treeline, the meadows and the high ground the wind streaks over; and of slopes, so
  // the steepest open ground (the 85th percentile) is the hachures' full length and the rest is read against it
  const hs = [], gs = [], sg = { x: 0, y: 0 };
  for (let i = 0; i < 600; i++) { const x = r() * W, y = TOP + r() * (H - TOP); if (inZone(R, x, y)) continue; hs.push(height(R, x, y)); slope(R, x, y, sg); gs.push(Math.hypot(sg.x, sg.y)); }
  hs.sort((a, b) => a - b); gs.sort((a, b) => a - b);
  const q = (A, f) => (A.length ? A[Math.min(A.length - 1, Math.floor(f * A.length))] : 0);
  R.q = [q(hs, 0.1), q(hs, 0.3), q(hs, 0.5), q(hs, 0.7), q(hs, 0.9)];
  R.gref = Math.max(1e-5, q(gs, 0.85));
  // the snowline: read over all the ground off the plateaus, the aprons with their high shoulders included
  const hz = []; for (let i = 0; i < 900; i++) { const x = r() * W, y = TOP + r() * (H - TOP); if (!inCore(R, x, y)) hz.push(height(R, x, y)); }
  hz.sort((a, b) => a - b); R.snow = q(hz, p.snow);
  // tarns in the lowest hollows, apart from each other
  const cand = [];
  for (let y = TOP + 40; y < H - 50; y += 32) for (let x = 60; x < W - 60; x += 32) {
    const jx = x + (r() - 0.5) * 20, jy = y + (r() - 0.5) * 20;
    if (!inZone(R, jx, jy, 50) && !near(R.crags, jx, jy, 1.1, 24)) cand.push([height(R, jx, jy), jx, jy]);
  }
  cand.sort((a, b) => a[0] - b[0]);
  for (const [, x, y] of cand) {
    if (R.tarns.length >= p.tarns) break;
    if (near(R.tarns, x, y, 0, 190)) continue;
    const tr = 15 + r() * 13;
    R.tarns.push({ x, y, r: tr, ph: [r() * TAU, r() * TAU, r() * TAU], rot: r() * TAU });
    R.dips.push({ x, y, r: tr * 2.4, h: 0.14 });
  }
  layStream(w, R, r);
  // ledges round the crags, for the goats, linked to every ledge within a hop
  for (const c of R.crags) {
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * TAU + (r() - 0.5) * 0.6, d = c.r * (0.55 + 0.3 * r()), x = c.x + Math.cos(a) * d, y = c.y + Math.sin(a) * d;
      if (inZone(R, x, y, 6) || near(R.tarns, x, y, 1, 8) || y < TOP) continue;
      const l = { x, y, c, links: [], i: R.ledges.length }; R.ledges.push(l); c.ledges.push(l);
    }
  }
  for (const a of R.ledges) for (const b of R.ledges) if (a !== b && Math.hypot(a.x - b.x, a.y - b.y) < 78) a.links.push(b);
  // meadow shelves: gentle ground at middling height, where the edelweiss grows
  const sl = { x: 0, y: 0 };
  for (let i = 0; i < 400 && R.shelves.length < 14; i++) {
    const x = 50 + r() * (W - 100), y = TOP + 20 + r() * (H - TOP - 60), z = height(R, x, y);
    if (z < R.q[1] || z > R.q[4] || inZone(R, x, y, 14) || near(R.crags, x, y, 1, 12) || near(R.tarns, x, y, 1, 20) || near(R.shelves, x, y, 0, 70)) continue;
    slope(R, x, y, sl);
    if (Math.hypot(sl.x, sl.y) / R.gref > 2 * p.flat) continue;
    R.shelves.push({ x, y, r: 0 });
  }
  w.relief = R;
}
// Spurs: ridges running out from each summit and crag, as capsules of height falling away along them, so the ground
// between them is valleys and the massif has a skeleton to read. Up to SPURS from each summit, none toward the other summit
// (the main ridge runs there), three from each crag. Their axes past the plateau are the drawn ridgelines, with the
// main ridge between the two plateaus; a valley line starts between each two neighbouring spurs.
const SPURS = 8;
function laySpurs(R, r) {
  const add = (x, y, a, from, len, w, h0, list, start) => {
    const bx = x + Math.cos(a) * len, by = y + Math.sin(a) * len;
    R.spurs.push({ ax: x, ay: y, bx, by, l2: len * len, r: w, h0, h1: 0.03 });
    list.push(a);
    R.ridges.push({ ax: x + Math.cos(a) * from, ay: y + Math.sin(a) * from, bx: x + Math.cos(a) * len * start, by: y + Math.sin(a) * len * start });
  };
  const valleys = (x, y, as, from, skip) => {
    as.sort((a, b) => a - b);
    for (let i = 0; i < as.length; i++) {
      const a0 = as[i], a1 = i + 1 < as.length ? as[i + 1] : as[0] + TAU, m = (a0 + a1) / 2;
      if (skip != null && Math.abs(wrapAngle(skip - m)) < (a1 - a0) / 2) continue;
      const rr = from(m); R.valleys.push([x + Math.cos(m) * rr, y + Math.sin(m) * rr]);
    }
  };
  R.cores.forEach((o, i) => {
    const other = R.cores[1 - i], toward = other ? Math.atan2(other.y - o.y, other.x - o.x) : null, base = r() * TAU, as = [];
    for (let k = 0; k < SPURS; k++) {
      const a = base + (k * TAU) / SPURS + (r() - 0.5) * 0.4;
      if (toward != null && Math.abs(wrapAngle(a - toward)) < 0.5) continue;
      const from = zoneR(o, a) + 3, len = from + o.mean * (0.6 + 0.6 * r());
      add(o.x, o.y, a, from, len, 0.15 * o.mean, 0.8, as, 0.82);
    }
    valleys(o.x, o.y, as, (a) => zoneR(o, a) + 6, toward);
  });
  if (R.cores.length >= 2) {
    const [a, b] = R.cores, t = Math.atan2(b.y - a.y, b.x - a.x), ra = zoneR(a, t) + 3, rb = zoneR(b, t + Math.PI) + 3;
    R.ridges.push({ ax: a.x + Math.cos(t) * ra, ay: a.y + Math.sin(t) * ra, bx: b.x - Math.cos(t) * rb, by: b.y - Math.sin(t) * rb });
  }
  for (const c of R.crags) {
    const base = r() * TAU, as = [];
    for (let k = 0; k < 3; k++) add(c.x, c.y, base + (k * TAU) / 3 + (r() - 0.5) * 0.7, c.r * 0.1, c.r * (1.2 + 0.6 * r()), 0.32 * c.r, 0.55 * c.h, as, 0.75);
    valleys(c.x, c.y, as, () => c.r * 0.35, null);
  }
}
// The stream: from the highest crag's flank (or a summit's zone), down the slope toward a tarn, meandering; it ends on
// the tarn's shore.
function layStream(w, R, r) {
  if (!R.tarns.length) return;
  // the source: of every crag (or, with none, a point at the foot of each summit's rings) and every tarn, the pair
  // whose run is nearest 380 px, so the stream crosses a good stretch of the valley
  const srcs = R.crags.length ? R.crags : R.zones.map((z) => ({ x: z.x, y: z.y + z.mean, r: 0 }));
  if (!srcs.length) return;
  let src = null, tarn = null, best = Infinity;
  for (const c of srcs) for (const t of R.tarns) { const d = Math.abs(Math.hypot(t.x - c.x, t.y - c.y) - 380); if (d < best) { best = d; src = c; tarn = t; } }
  const u0 = Math.atan2(tarn.y - src.y, tarn.x - src.x);
  let x = src.x + Math.cos(u0) * src.r * 0.5, y = src.y + Math.sin(u0) * src.r * 0.5;
  const pts = [x, y], sl = { x: 0, y: 0 }, ph = r() * TAU, st = 4;
  for (let i = 0; i < 900; i++) {
    const tx = tarn.x - x, ty = tarn.y - y, td = Math.hypot(tx, ty);
    if (td < tarn.r * 0.95) break;
    slope(R, x, y, sl); const g = Math.hypot(sl.x, sl.y) || 1;
    const pull = 0.35 + 0.65 * clamp(i / 500, 0, 1), m = 0.35 * Math.sin(i * 0.07 + ph);
    let dx = (-sl.x / g) * (1 - pull) + (tx / td) * pull, dy = (-sl.y / g) * (1 - pull) + (ty / td) * pull;
    const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
    x += (dx - dy * m) * st; y += (dy + dx * m) * st;
    for (const z of R.zones) { const a = Math.atan2(y - z.y, x - z.x), rr = zoneR(z, a) + 4; if (Math.hypot(x - z.x, y - z.y) < rr) { x = z.x + Math.cos(a) * rr; y = z.y + Math.sin(a) * rr; } }
    pts.push(x, y);
  }
  // end on the shore
  const a = Math.atan2(y - tarn.y, x - tarn.x), sr = tarnR(tarn, a);
  pts.push(tarn.x + Math.cos(a) * sr, tarn.y + Math.sin(a) * sr);
  const len = new Float32Array(pts.length / 2);
  for (let i = 1; i < len.length; i++) len[i] = len[i - 1] + Math.hypot(pts[2 * i] - pts[2 * i - 2], pts[2 * i + 1] - pts[2 * i - 1]);
  R.stream = { pts: Float32Array.from(pts), len, tarn };
}
// a tarn's shore at bearing a
export const tarnR = (t, a) => t.r * (1 + 0.12 * Math.sin(2 * a + t.ph[0]) + 0.07 * Math.sin(3 * a + t.ph[1]) + 0.04 * Math.sin(5 * a + t.ph[2]));

// ----- the static layer -----
// The relief is drawn three ways, switched by `relief`, each laid and painted once into the static layer:
//   0 hachures, the cartographer's way: strokes falling downslope, close and long on the slopes turned away from the
//     light (the upper left) and sparse on the lit ones, so the massif is modelled in light and shade; a firm line down
//     each ridge with the hachures fanning off both sides; a mark on each crag's top; snow left paper above a ragged
//     snowline; a dense treeline of conifers on the low slopes.
//   1 hill signs, the old mapmakers' way: over the plan ground each massif and crag is drawn in profile, seen from the
//     south, its peaks rising up the page from a base line, the flank away from the light hatched and the lit one left
//     open, snow on the tops, pines at the foot. The two summits are the plateaus of the two great massifs: the crest
//     runs along each one's upper edge and the flanks hang below and beside it.
//   2 woodcut: every slope facing away from the light one flat ink tint, the lit ones paper, traced from the height
//     field on a grid as a few merged outlines; firm ridgelines and valley lines, snow paper above the snowline, and
//     hachures only in the shade.
const reliefMode = (p) => clamp(Math.round(p.relief) | 0, 0, 2);
const LIGHT_X = -Math.SQRT1_2, LIGHT_Y = -Math.SQRT1_2; // toward the light: the upper left
// how far ground of slope (sx, sy), g its steepness, faces the light: 1 straight toward it, -1 straight away
const facing = (sx, sy, g) => (-sx * LIGHT_X - sy * LIGHT_Y) / g;
// distance from (x, y) to the nearest drawn ridgeline's axis
function ridgeDist(R, x, y) {
  let best = Infinity;
  for (const s of R.ridges) {
    const ex = s.bx - s.ax, ey = s.by - s.ay, u = clamp(((x - s.ax) * ex + (y - s.ay) * ey) / (ex * ex + ey * ey || 1), 0, 1);
    best = Math.min(best, Math.hypot(x - s.ax - ex * u, y - s.ay - ey * u));
  }
  return best;
}

// Hachures: the kit's lattice of level dashes, each turned to run downslope from the height field's gradient at its
// anchor, longer where the ground is steeper. How many are kept, and where, is the relief's: in 0 by steepness and by
// how far the ground is turned from the light, in 1 a sparse scatter on the plan ground between the hill signs, in 2
// only in the shade. A mark's pts run from its upper end to its lower; dark marks are drawn stronger. None is laid on a
// summit's plateau, a crag's top or in a tarn, and none crosses a ridgeline.
export const HACHURE = { pitch: 11, period: 26, dash: 8, reach: 20 };
const DENSITY = [2.3, 0.45, 0.9];
export function hachures(w, W, H, p) {
  const R = w.relief, out = []; if (!R) return out;
  const mode = reliefMode(p), dens = p.density * DENSITY[mode], sl = { x: 0, y: 0 };
  const marks = latticeMarks((w.seed ^ 0x68616368) >>> 0, W, H, HACHURE, dens, p.jitter);
  const norm = Math.min(HACHURE.dash, (0.7 * HACHURE.period) / Math.sqrt(dens));
  for (const m of marks) {
    const cx = (m.pts[0] + m.pts[2]) / 2, cy = m.pts[1];
    if (inCore(R, cx, cy, 2) || near(R.crags, cx, cy, mode === 1 ? 0.7 : 0.1, 0) || near(R.tarns, cx, cy, 1, 5)) continue;
    slope(R, cx, cy, sl);
    const g = Math.hypot(sl.x, sl.y); if (g < 1e-9) continue;
    const steep = clamp(g / R.gref, 0, 1), c = facing(sl.x, sl.y, g), shade = (1 - c) / 2;
    const rnd = pointRand(hashPoint(Math.round(m.x), Math.round(m.y), 0x5a7))();
    // the lattice's own jitter of a dash's length carries over to the hachure's
    let L = (p.short + (p.long - p.short) * steep) * ((m.pts[2] - m.pts[0]) / norm), keep = 0, dark = false;
    if (mode === 0) {
      if (c > -0.3 && height(R, cx, cy) > R.snow) continue; // lit snow stays paper
      keep = clamp(0.1 + 1.25 * steep * (0.25 + 0.75 * shade), 0, 1) * (steep < p.flat ? p.sparse : 1);
      L *= 0.7 + 0.6 * shade; dark = c < -0.2;
    } else if (mode === 1) keep = steep < p.flat ? 0.5 * p.sparse : 0.6;
    else { if (c > -0.25 || steep < p.flat) continue; keep = 0.85; dark = true; }
    if (rnd > keep) continue;
    if (mode !== 1) { const d = ridgeDist(R, cx, cy); if (d < L / 2 + 1.5) { L = 2 * (d - 1.5); if (L < 2.5) continue; } }
    const ux = -sl.x / g, uy = -sl.y / g;
    out.push({ x: m.x, y: m.y, dark, pts: [cx - (ux * L) / 2, cy - (uy * L) / 2, cx + (ux * L) / 2, cy + (uy * L) / 2] });
  }
  return out;
}

// The outlines of where F (nx by ny nodes, cell px apart) reaches lev, by marching squares, as closed runs of x, y;
// the grid's border counts as below, so every outline closes. Filled even-odd, they are the region itself.
function isoLoops(F, nx, ny, cell, lev) {
  const v = (i, j) => (i < 0 || j < 0 || i >= nx || j >= ny ? -1e9 : F[j * nx + i] - lev);
  const W2 = nx + 2, pts = new Map(), adj = new Map();
  const cross = (i, j, vert) => {
    const k = 2 * ((j + 1) * W2 + i + 1) + vert;
    if (!pts.has(k)) { const a = v(i, j), b = vert ? v(i, j + 1) : v(i + 1, j), t = clamp(a / (a - b), 0, 1); pts.set(k, vert ? [i * cell, (j + t) * cell] : [(i + t) * cell, j * cell]); }
    return k;
  };
  const link = (a, b) => { (adj.get(a) || adj.set(a, []).get(a)).push(b); (adj.get(b) || adj.set(b, []).get(b)).push(a); };
  for (let j = -1; j < ny; j++) for (let i = -1; i < nx; i++) {
    const a = v(i, j) >= 0, b = v(i + 1, j) >= 0, c = v(i + 1, j + 1) >= 0, d = v(i, j + 1) >= 0;
    const code = (a ? 8 : 0) | (b ? 4 : 0) | (c ? 2 : 0) | (d ? 1 : 0);
    if (code === 0 || code === 15) continue;
    const T = () => cross(i, j, 0), B = () => cross(i, j + 1, 0), L = () => cross(i, j, 1), R = () => cross(i + 1, j, 1);
    const mid = (v(i, j) + v(i + 1, j) + v(i + 1, j + 1) + v(i, j + 1)) / 4 >= 0;
    switch (code) {
      case 1: case 14: link(L(), B()); break;
      case 2: case 13: link(B(), R()); break;
      case 3: case 12: link(L(), R()); break;
      case 4: case 11: link(T(), R()); break;
      case 6: case 9: link(T(), B()); break;
      case 7: case 8: link(T(), L()); break;
      case 5: if (mid) { link(T(), L()); link(B(), R()); } else { link(T(), R()); link(L(), B()); } break;
      case 10: if (mid) { link(T(), R()); link(L(), B()); } else { link(T(), L()); link(B(), R()); } break;
    }
  }
  const loops = [], seen = new Set();
  for (const k0 of adj.keys()) {
    if (seen.has(k0)) continue;
    const loop = []; let prev = -1, k = k0;
    while (k !== undefined && !seen.has(k)) {
      seen.add(k); const q = pts.get(k); loop.push(q[0], q[1]);
      const n = adj.get(k), next = n[0] !== prev ? n[0] : n[1]; prev = k; k = next;
    }
    if (loop.length >= 6) loops.push(loop);
  }
  return loops;
}
// The height field and how far the ground is turned from the light, sampled on a grid GRID px apart over the page.
const GRID = 6;
function reliefGrid(R, W, H) {
  const nx = Math.ceil(W / GRID) + 1, ny = Math.ceil(H / GRID) + 1, Z = new Float32Array(nx * ny), S = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) Z[j * nx + i] = height(R, i * GRID, j * GRID);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const i0 = Math.max(0, i - 1), i1 = Math.min(nx - 1, i + 1), j0 = Math.max(0, j - 1), j1 = Math.min(ny - 1, j + 1);
    const sx = (Z[j * nx + i1] - Z[j * nx + i0]) / ((i1 - i0) * GRID), sy = (Z[j1 * nx + i] - Z[j0 * nx + i]) / ((j1 - j0) * GRID);
    S[j * nx + i] = (sx * LIGHT_X + sy * LIGHT_Y) / R.gref; // the shade: steepness turned away from the light
  }
  return { nx, ny, Z, S };
}
// a loop's points shaken by up to amp px, so a snowline is ragged
function ragged(loops, seed, amp) {
  for (const L of loops) for (let i = 0; i < L.length; i += 2) {
    const d = pointRand(hashPoint(Math.round(L[i]), Math.round(L[i + 1]), seed));
    L[i] += (d() - 0.5) * 2 * amp; L[i + 1] += (d() - 0.5) * 2 * amp;
  }
  return loops;
}
// a straight ridge axis as a line that wavers a little, a point every 8 px
function wavering(s, seed) {
  const L = Math.hypot(s.bx - s.ax, s.by - s.ay), n = Math.max(2, Math.round(L / 8)), nx = -(s.by - s.ay) / (L || 1), ny = (s.bx - s.ax) / (L || 1), pts = [];
  const d = pointRand(hashPoint(Math.round(s.ax), Math.round(s.ay), seed));
  for (let i = 0; i <= n; i++) { const u = i / n, o = i && i < n ? (d() - 0.5) * 2.2 : 0; pts.push(s.ax + (s.bx - s.ax) * u + nx * o, s.ay + (s.by - s.ay) * u + ny * o); }
  return pts;
}
// a valley line: steepest descent from (x, y) in steps of 4 px until the ground flattens, leaves the page or meets a tarn
function valleyFrom(R, x, y, W, H) {
  const pts = [x, y], sl = { x: 0, y: 0 };
  for (let i = 0; i < 90; i++) {
    slope(R, x, y, sl); const g = Math.hypot(sl.x, sl.y);
    if (g < 0.12 * R.gref) break;
    x -= (sl.x / g) * 4; y -= (sl.y / g) * 4;
    if (x < 0 || y < 0 || x > W || y > H || inCore(R, x, y, 0) || near(R.tarns, x, y, 1, 2)) break;
    pts.push(x, y);
  }
  return pts.length >= 8 ? pts : null;
}

// ----- hill signs -----
const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
// One hill sign: crest is its skyline from the left shoulder to the right, peaks marked pk; the flanks fall from the
// shoulders to the base line at yb between xl and xr. Each peak's snow cap is a ragged line `snow` px under its tip,
// and its face away from the light, from the cap down to the base, is a hatched region; pines stand along the foot.
function hillSign(r, R, crest, xl, xr, yb, snow) {
  const c0 = crest[0], cn = crest[crest.length - 1];
  const jl = { x: (xl + c0.x) / 2 - 3 - 4 * r(), y: (yb + c0.y) / 2 + (r() - 0.5) * 8 };
  const jr = { x: (xr + cn.x) / 2 + 3 + 4 * r(), y: (yb + cn.y) / 2 + (r() - 0.5) * 8 };
  const outline = [{ x: xl, y: yb }, jl, ...crest, jr, { x: xr, y: yb }], faces = [], caps = [], pines = [];
  const foot = (q, k) => ({ x: q.x + (yb - q.y) * k, y: yb });
  let top = Infinity;
  for (let k = 1; k < crest.length - 1; k++) {
    const P = crest[k]; if (!P.pk) continue;
    top = Math.min(top, P.y);
    const A = crest[k - 1], B = crest[k + 1];
    const left = lerp(P, A, Math.min(0.7, snow / Math.max(1, A.y - P.y))), right = lerp(P, B, Math.min(0.7, snow / Math.max(1, B.y - P.y)));
    const mid = { x: P.x + (r() - 0.5) * 2, y: P.y + snow * (0.95 + 0.35 * r()) };
    const j1 = { x: (left.x + mid.x) / 2, y: (left.y + mid.y) / 2 - snow * 0.28 }, j2 = { x: (mid.x + right.x) / 2, y: (mid.y + right.y) / 2 - snow * 0.22 };
    caps.push([left, j1, mid, j2, right]);
    // the outermost peak's shade runs down the whole flank; an inner peak's only a little below its crest, as the
    // mapmakers shaded the near side of each top
    const last = k + 1 === crest.length - 1, depth = last ? 1 : Math.min(1, (Math.max(B.y, P.y + snow * 4) + snow * 2.5 - P.y) / (yb - P.y));
    const fp = lerp(mid, foot(P, 0.06), last ? 1 : depth), face = [right, B];
    if (last) face.push(jr, { x: xr, y: yb }); else face.push(lerp(B, foot(B, 0.14), depth));
    face.push(fp, mid, j2);
    const ux = fp.x - mid.x, uy = fp.y - mid.y, ul = Math.hypot(ux, uy) || 1;
    faces.push({ pts: face, ux: ux / ul, uy: uy / ul });
  }
  // pines along the foot, on the lowest part of the flanks and just below the base
  const band = Math.min(26, (yb - top) * 0.22);
  for (let x = xl + 8; x < xr - 8; x += 6.5) {
    if (r() > 0.62) continue;
    const y = yb - r() * band + (r() < 0.3 ? 6 * r() : 0), s = 0.8 + 0.4 * r(), px = x + (r() - 0.5) * 3;
    if (inCore(R, px, y - 4, 2)) continue;
    pines.push([px, y, px, y - 4.5 * s], [px - 2 * s, y - 1.6 * s, px, y - 7 * s, px + 2 * s, y - 1.6 * s]);
  }
  return { yb, outline, faces, caps, pines };
}
// The hill signs: a great massif under each summit, its crest along the footprint's upper edge rising in three or four
// peaks, the tallest in the middle, and a smaller sign of two or three peaks on each crag; drawn far to near (by base).
function hillSigns(w, R) {
  const r = rng((w.seed ^ 0x68696c6c) >>> 0), signs = [];
  for (const o of w.summits) {
    let xl = Infinity, xr = -Infinity, yt = Infinity, yb = -Infinity;
    for (let j = 0; j < BEARINGS; j++) {
      const a = (j / BEARINGS) * TAU, e = edge(o, a), x = o.x + Math.cos(a) * e, y = o.y + Math.sin(a) * e;
      xl = Math.min(xl, x); xr = Math.max(xr, x); yt = Math.min(yt, y); yb = Math.max(yb, y);
    }
    const wd = xr - xl, ht = yb - yt;
    const E = (a, up) => { const e = edge(o, a) + 3, y = o.y + Math.sin(a) * e; return { x: o.x + Math.cos(a) * e, y: y - Math.min(up, y - (TOP - 20)) }; };
    const k = wd > 380 ? 4 : 3, a0 = Math.PI + 0.12, span = Math.PI - 0.24, crest = [E(a0, 0)];
    for (let i = 0; i < k; i++) {
      const u = (i + 0.5) / k, a = a0 + u * span + (r() - 0.5) * 0.12, mid = 1 - Math.abs(u - 0.5) * 1.6;
      crest.push({ ...E(a, wd * (0.08 + 0.12 * mid + 0.04 * r())), pk: true });
      if (i < k - 1) crest.push(E(a0 + ((i + 1) / k) * span, 4 + 6 * r()));
    }
    crest.push(E(a0 + span, 0));
    signs.push(hillSign(r, R, crest, xl - wd * 0.2, xr + wd * 0.2, Math.min(w.h - 12, yb + ht * 0.16), 16));
  }
  for (const c of R.crags) {
    const s = c.r, x = c.x, y = c.y, h = s * (1 + 0.3 * r()), crest = [{ x: x - s * 0.62, y: y + s * 0.05 }];
    if (r() < 0.7) crest.push({ x: x - s * 0.36, y: y - h * (0.45 + 0.15 * r()), pk: true }, { x: x - s * 0.17, y: y - h * 0.2 });
    crest.push({ x: x + s * 0.02, y: y - h, pk: true });
    if (r() < 0.7) crest.push({ x: x + s * 0.28, y: y - h * 0.28 }, { x: x + s * 0.46, y: y - h * (0.5 + 0.15 * r()), pk: true });
    crest.push({ x: x + s * 0.64, y: y + s * 0.05 });
    signs.push(hillSign(r, R, crest, x - s * 0.95, x + s * 0.95, y + s * 0.5, s * 0.22));
  }
  return signs.sort((a, b) => a.yb - b.yb);
}

// What the relief draws beyond the hachures and the floor, by mode: snowfields, the shade, ridgelines, valley lines,
// crag tops; or the hill signs.
function reliefLines(w, p, W, H) {
  const R = w.relief, mode = reliefMode(p), out = { mode, snow: [], shade: [], ridges: [], valleys: [], tops: [], signs: [] };
  if (!R) return out;
  if (mode === 1) { out.signs = hillSigns(w, R); return out; }
  const G = reliefGrid(R, W, H);
  out.snow = ragged(isoLoops(G.Z, G.nx, G.ny, GRID, R.snow), (w.seed ^ 0x736e6f77) >>> 0, 1.3);
  out.ridges = R.ridges.map((s) => wavering(s, (w.seed ^ 0x72696467) >>> 0));
  if (mode === 0) out.tops = R.crags.map((c) => [c.x, c.y]);
  else {
    out.shade = isoLoops(G.S, G.nx, G.ny, GRID, SHADE);
    for (const [x, y] of R.valleys) { const v = valleyFrom(R, x, y, W, H); if (v) out.valleys.push(v); }
  }
  return out;
}
const SHADE = 0.4; // the woodcut's shade: ground turned from the light more steeply than this, of the reference slope

// Everything else the static layer draws, as polylines grouped by how they are drawn. Under hill signs the conifers
// are pines in profile, and the crags' strata and scree are left to the signs.
function floorLines(w, mode) {
  const R = w.relief, strata = [], scree = [], trees = [], tarns = []; if (!R) return { strata, scree, trees, tarns, stream: null };
  const r = rng((w.seed ^ 0x666c6f6f) >>> 0);
  for (const c of R.crags) {
    if (mode === 1) break;
    // the cliff faces the lowest side: strata along it, scree fanning out below it
    let lo = Infinity, face = 0;
    for (let k = 0; k < 16; k++) { const a = (k / 16) * TAU, z = height(R, c.x + Math.cos(a) * c.r * 0.9, c.y + Math.sin(a) * c.r * 0.9); if (z < lo) { lo = z; face = a; } }
    for (let k = 0; k < 5; k++) {
      const rr = c.r * (0.4 + 0.035 * k), a0 = face + (r() - 0.5) * 0.9, span = 0.25 + r() * 0.3, pts = [];
      for (let i = 0; i <= 6; i++) { const a = a0 - span / 2 + (span * i) / 6; pts.push(c.x + Math.cos(a) * rr, c.y + Math.sin(a) * rr); }
      strata.push(pts);
    }
    for (let k = 0; k < 44; k++) {
      const u = r(), d = c.r * (0.6 + 0.75 * Math.pow(u, 0.8)), a = face + (r() - 0.5) * (0.5 + 0.7 * u), x = c.x + Math.cos(a) * d, y = c.y + Math.sin(a) * d;
      if (inZone(R, x, y) || near(R.tarns, x, y, 1, 3)) continue;
      scree.push([x, y, x + Math.cos(a) * 1.2, y + Math.sin(a) * 1.2]);
    }
  }
  // the treeline: conifers on the low slopes, thinning as the ground rises toward the line; twice as close under the
  // hachures, where it is the relief's lowest band
  const treeTop = R.q[2], base = R.q[0], sl = { x: 0, y: 0 }, S = R.stream, close = mode === 0 ? 2 : 1;
  for (let y = TOP; y < w.h - 8; y += 19) for (let x = 8; x < w.w - 8; x += 19) {
    const d = pointRand(hashPoint(x, y, (w.seed ^ 0x74726565) >>> 0));
    for (let t = 0; t < close; t++) {
      const tx = x + (d() - 0.5) * 16, ty = y + (d() - 0.5) * 16, z = height(R, tx, ty);
      if (z > treeTop || inZone(R, tx, ty, 8) || near(R.crags, tx, ty, 0.75, 0) || near(R.tarns, tx, ty, 1, 7)) continue;
      const keep = 0.42 * w.params.trees * clamp(((treeTop - z) / Math.max(1e-6, treeTop - base)) * 1.6, 0, 1);
      if (d() > keep) continue;
      slope(R, tx, ty, sl); if (Math.hypot(sl.x, sl.y) / R.gref < 0.05) continue; // a dead-flat floor is meadow
      if (S) { let wet = false; for (let i = 0; i < S.pts.length && !wet; i += 4) wet = Math.hypot(S.pts[i] - tx, S.pts[i + 1] - ty) < 7; if (wet) continue; }
      const s = 2.6 + d() * 1.4, a = d() * TAU;
      if (mode === 1) { const k = s / 3.3; trees.push([tx, ty + 3 * k, tx, ty - 1.5 * k], [tx - 2 * k, ty + 1.4 * k, tx, ty - 3.5 * k, tx + 2 * k, ty + 1.4 * k]); }
      else for (let k = 0; k < 3; k++) { const b = a + (k * Math.PI) / 3; trees.push([tx - Math.cos(b) * s, ty - Math.sin(b) * s, tx + Math.cos(b) * s, ty + Math.sin(b) * s]); }
    }
  }
  for (const t of R.tarns) {
    const n = 48, shore = [], inner = [];
    for (let i = 0; i <= n; i++) { const a = (i / n) * TAU, k = tarnR(t, a); shore.push(t.x + Math.cos(a) * k, t.y + Math.sin(a) * k); inner.push(t.x + Math.cos(a) * k * 0.55, t.y + Math.sin(a) * k * 0.55); }
    tarns.push({ shore, inner });
  }
  return { strata, scree, trees, tarns, stream: S ? S.pts : null };
}
const polyline = (ctx, pts) => { ctx.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]); };
const loopPath = (ctx, loops) => { for (const L of loops) { polyline(ctx, L); ctx.closePath(); } };
const pointsPath = (ctx, P, closed) => { ctx.moveTo(P[0].x, P[0].y); for (let i = 1; i < P.length; i++) ctx.lineTo(P[i].x, P[i].y); if (closed) ctx.closePath(); };
function smoothLine(ctx, pts) {
  const n = pts.length / 2; ctx.moveTo(pts[0], pts[1]);
  for (let i = 1; i < n - 1; i++) ctx.quadraticCurveTo(pts[2 * i], pts[2 * i + 1], (pts[2 * i] + pts[2 * i + 2]) / 2, (pts[2 * i + 1] + pts[2 * i + 3]) / 2);
  ctx.lineTo(pts[2 * n - 2], pts[2 * n - 1]);
}
// a face's hatching: lines along the face's fall line, HATCH px apart, clipped to the face
const HATCH = 2.6;
function hatch(ctx, f) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const q of f.pts) { x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y); }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, half = Math.hypot(x1 - x0, y1 - y0) / 2 + 2, nx = -f.uy, ny = f.ux;
  ctx.save(); ctx.beginPath(); pointsPath(ctx, f.pts, true); ctx.clip(); ctx.beginPath();
  for (let s = -half; s <= half; s += HATCH) { const x = cx + nx * s, y = cy + ny * s; ctx.moveTo(x - f.ux * half, y - f.uy * half); ctx.lineTo(x + f.ux * half, y + f.uy * half); }
  ctx.stroke(); ctx.restore();
}
function paintSigns(ctx, signs, p, ink, paper) {
  for (const s of signs) {
    ctx.beginPath(); pointsPath(ctx, s.outline, true); ctx.fillStyle = paper; ctx.globalAlpha = 1; ctx.fill();
    ctx.save(); ctx.clip(); ctx.globalAlpha = p.lineAlpha * 0.75; for (const f of s.faces) hatch(ctx, f); ctx.restore();
    ctx.globalAlpha = p.lineAlpha; ctx.beginPath(); pointsPath(ctx, s.outline, false); ctx.stroke();
    ctx.globalAlpha = p.lineAlpha * 0.7; ctx.beginPath(); for (const c of s.caps) pointsPath(ctx, c, false); ctx.stroke();
    ctx.globalAlpha = Math.min(1, p.floorAlpha * 2); ctx.beginPath(); for (const pts of s.pines) polyline(ctx, pts); ctx.stroke();
  }
}
function paintLayer(ctx, data, p, colours) {
  const { ink, paper, water } = colours, f = data.floor, V = data.relief;
  ctx.strokeStyle = ink; ctx.lineWidth = 1; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  // snowfields paper, then the woodcut's shade over them as one flat tint
  if (V.snow.length) { ctx.fillStyle = paper; ctx.globalAlpha = 1; ctx.beginPath(); loopPath(ctx, V.snow); ctx.fill('evenodd'); }
  if (V.shade.length) { ctx.fillStyle = ink; ctx.globalAlpha = p.shade; ctx.beginPath(); loopPath(ctx, V.shade); ctx.fill('evenodd'); }
  drawMarks(ctx, data.marks.filter((m) => !m.dark), ink, p.hachureAlpha * (V.mode === 1 ? 0.7 : 0.85));
  drawMarks(ctx, data.marks.filter((m) => m.dark), ink, Math.min(1, p.hachureAlpha * (V.mode === 0 ? 2.3 : 1.7)));
  ctx.strokeStyle = ink; ctx.lineWidth = 1; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (V.valleys.length) { ctx.globalAlpha = p.lineAlpha * 0.55; ctx.beginPath(); for (const v of V.valleys) smoothLine(ctx, v); ctx.stroke(); }
  if (V.ridges.length) { ctx.globalAlpha = p.lineAlpha; ctx.beginPath(); for (const v of V.ridges) polyline(ctx, v); ctx.stroke(); }
  if (V.tops.length) { ctx.fillStyle = ink; ctx.globalAlpha = Math.min(1, p.lineAlpha * 1.3); ctx.beginPath(); for (const [x, y] of V.tops) { ctx.moveTo(x, y - 3.2); ctx.lineTo(x + 2.8, y + 1.8); ctx.lineTo(x - 2.8, y + 1.8); ctx.closePath(); } ctx.fill(); }
  ctx.globalAlpha = p.floorAlpha * 0.8; ctx.beginPath(); for (const pts of f.strata) polyline(ctx, pts); for (const pts of f.trees) polyline(ctx, pts); ctx.stroke();
  ctx.globalAlpha = p.floorAlpha * 1.2; ctx.beginPath(); for (const pts of f.scree) polyline(ctx, pts); ctx.stroke();
  ctx.strokeStyle = water; ctx.fillStyle = water;
  for (const t of f.tarns) { ctx.beginPath(); smoothLine(ctx, t.shore); ctx.globalAlpha = 0.08; ctx.fill(); ctx.globalAlpha = p.waterAlpha; ctx.stroke(); ctx.beginPath(); smoothLine(ctx, t.inner); ctx.globalAlpha = p.waterAlpha * 0.45; ctx.stroke(); }
  if (f.stream) { ctx.globalAlpha = p.waterAlpha * 0.85; ctx.beginPath(); smoothLine(ctx, f.stream); ctx.stroke(); }
  ctx.strokeStyle = ink;
  if (V.signs.length) paintSigns(ctx, V.signs, p, ink, paper);
  ctx.globalAlpha = 1;
}

// ----- the world -----
const SOARING = new Set(['glide', 'circle', 'ridge']), COVER = new Set(['toss', 'cover', 'hide', 'perch']);
export const soaring = (e) => SOARING.has(e.mode), inCover = (e) => COVER.has(e.mode);
const eagleTarget = (w) => Math.max(0, Math.round(w.coarse ? w.params.countTouch : w.params.count));
const kettleTarget = (w) => Math.max(1, Math.round(eagleTarget(w) / Math.max(1, w.params.kettles)));

// A world: the mountain's whole state. opts: { w, h, seed, coarse, reduced }.
export function createWorld(params, opts = {}) {
  const seed = opts.seed == null ? 1 : opts.seed >>> 0;
  const w = {
    params, w: opts.w || 1, h: opts.h || 1, t: 0, seed, rand: rng(seed), coarse: !!opts.coarse, reduced: !!opts.reduced,
    summits: [], outlines: [], boxes: [], ptr: pointer(), stroke: null, ridge: null,
    eagles: [], lifts: [], clouds: [], goats: [], streaks: [], flowers: [], order: [],
    relief: null, plan: '', cloudT: 0, bloomT: 0, flowT: 0,
    joins: 0, peels: 0, gusts: 0, bolts: 0,
  };
  plan(w);
  return w;
}
// Lays the relief anew when the page's size, the objects' places or the counts that stand on it change; the eagles,
// clouds and goats are topped up or trimmed to their counts.
function plan(w) {
  const p = w.params, key = `${Math.round(w.w)} ${Math.round(w.h)} ${w.boxes.map((b) => [b.x, b.y, b.w, b.h].map((v) => Math.round(v / 24)).join(',')).join(';')} ${w.coarse ? p.cragsTouch : p.crags} ${p.tarns} ${p.trees} ${p.apron} ${p.snow} ${w.coarse ? p.flowersTouch : p.flowers}`;
  if (key !== w.plan) {
    w.plan = key; layRelief(w);
    layFlowers(w); w.goats.length = 0;
    for (const e of w.eagles) if (e.perch) { e.perch = null; if (e.mode === 'perch' || e.mode === 'cover') takeOff(w, e); }
  }
  const ng = Math.round(w.coarse ? p.goatsTouch : p.goats);
  if (w.goats.length !== ng) layGoats(w, ng);
  const nc = Math.round(w.coarse ? p.cloudsTouch : p.clouds);
  while (w.clouds.length > nc) w.clouds.pop();
  while (w.clouds.length < nc) w.clouds.push(makeCloud(w, w.clouds.length));
  while (w.lifts.filter((k) => k.kind === 'kettle' && !k.dead).length < kettleTarget(w)) spawnKettle(w);
  const n = eagleTarget(w);
  if (w.eagles.length > n) w.eagles.length = n;
  while (w.eagles.length < n) w.eagles.push(spawnEagle(w));
}
export function resizeWorld(w, width, height) { w.w = width; w.h = height; plan(w); }
export function setSummits(w, boxes) {
  w.boxes = (boxes || []).map((b) => ({ x: b.x, y: b.y, w: b.w, h: b.h }));
  placeFootprints(w.summits, w.outlines, boxes, w.params, w.reduced, w.t);
  plan(w);
}
export function setOutlines(w, fns) { w.outlines = fns || []; }
export function setPointer(w, x, y, on) { pointTo(w.ptr, x, y, on); }
export function summitAt(w, x, y) { return footprintAt(w.summits, x, y); }

// ----- lift -----
// A lift is a natural thermal (a kettle: drifting with the wind, living a while, invisible but for the eagles circling
// in it), a raised thermal (a press: drawn as a rising spiral, spent as eagles climb in it) or a line of ridge lift (a
// drag: its points, which eagles fly back and forth along). Every eagle in lift circles it the same way round.
function lift(w, kind, x, y) {
  const r = w.rand, p = w.params;
  return { kind, x, y, R: p.orbit * (0.85 + 0.4 * r()), dir: r() < 0.5 ? 1 : -1, power: kind === 'kettle' ? 0.75 : 1, age: 0, life: 22 + 26 * r(), dead: false, n: 0, pts: null, vx: 0, vy: 0, user: kind !== 'kettle' };
}
function spawnKettle(w) {
  const r = w.rand, p = w.params; let k = null;
  for (let i = 0; i < 40; i++) {
    const c = lift(w, 'kettle', 0, 0), m = c.R * 1.4 + 30;
    c.x = m + r() * Math.max(1, w.w - 2 * m); c.y = TOP + m * 0.7 + r() * Math.max(1, w.h - TOP - 1.7 * m);
    k = c;
    if (w.summits.some((o) => edgeGap(o, c.x, c.y, c.R + p.clear + 24) < 0)) continue;
    if (w.lifts.some((o) => !o.dead && Math.hypot(o.x - c.x, o.y - c.y) < 2 * (o.R + c.R))) continue;
    break;
  }
  k.age = r() * 8; w.lifts.push(k); return k;
}
const userLifts = (w) => w.lifts.filter((k) => k.user && !k.dead);
function addUser(w, k) {
  w.lifts.push(k);
  const u = userLifts(w);
  while (u.length > Math.max(1, w.params.most)) u.shift().dead = true;
}
// a press, or a tap: a thermal rises where it was; eagles within reach glide to it
export function raiseThermal(w, x, y) {
  if (w.reduced || summitAt(w, x, y) >= 0) return null;
  const k = lift(w, 'thermal', x, y); k.R = w.params.orbit * 0.9; addUser(w, k); draw(w, k); return k;
}
function addRidgePoint(w, x, y) {
  const sp = w.params.spacing, g = w.ridge;
  if (!g || g.dead || Math.hypot(x - g.pts[g.pts.length - 2], y - g.pts[g.pts.length - 1]) > 1.6 * sp) {
    w.ridge = lift(w, 'ridge', x, y); w.ridge.pts = []; addUser(w, w.ridge);
  }
  const k = w.ridge; k.pts.push(x, y);
  let sx = 0, sy = 0; for (let i = 0; i < k.pts.length; i += 2) { sx += k.pts[i]; sy += k.pts[i + 1]; }
  k.x = sx / (k.pts.length / 2); k.y = sy / (k.pts.length / 2);
}
const onSummit = (w) => (x, y) => summitAt(w, x, y);
export function strokeStart(w, x, y) { w.stroke = w.reduced ? null : strokeOpen(x, y, w.params.spacing); w.ridge = null; }
export function strokeTo(w, x, y) { if (w.stroke) strokeAlong(w.stroke, x, y, w.params.spacing, onSummit(w), (a, b) => addRidgePoint(w, a, b)); }
export function strokeEnd(w) {
  const s = w.stroke; w.stroke = null;
  if (!s) return;
  if (!s.dropped) { raiseThermal(w, s.sx, s.sy); return; }
  // every ridge this drag laid draws eagles now; one of a single point is a thermal
  for (const k of w.lifts) if (k.kind === 'ridge' && !k.dead && !k.drawn) { if (k.pts.length < 4) { k.kind = 'thermal'; k.R = w.params.orbit * 0.9; k.pts = null; } draw(w, k); }
  w.ridge = null;
}
export function strokeCancel(w) { w.stroke = null; w.ridge = null; }
// eagles within reach and not in cover set off for new lift, the nearest first, up to a dozen
function draw(w, k) {
  k.drawn = true;
  const p = w.params, near = w.eagles.filter((e) => soaring(e) && Math.hypot(e.x - k.x, e.y - k.y) < p.pull).sort((a, b) => Math.hypot(a.x - k.x, a.y - k.y) - Math.hypot(b.x - k.x, b.y - k.y));
  for (const e of near.slice(0, 12)) { e.lift = k; e.mode = 'glide'; }
}
function stepLifts(w, dt) {
  const p = w.params, r = w.rand, still = w.reduced;
  for (const k of w.lifts) k.n = 0;
  for (const e of w.eagles) if (e.lift && (e.mode === 'circle' || e.mode === 'ridge')) e.lift.n++;
  if (!still) {
    const wa = p.wind * DEG, wx = Math.cos(wa) * p.drift, wy = Math.sin(wa) * p.drift;
    for (const k of w.lifts) {
      if (k.dead) continue;
      k.age += dt;
      if (k.kind === 'kettle') {
        // a natural thermal drifts downwind and wanders, and dies of age
        k.vx += ((r() - 0.5) * 8 - k.vx * 0.3) * dt; k.vy += ((r() - 0.5) * 8 - k.vy * 0.3) * dt;
        k.x += (wx * 0.35 + k.vx) * dt; k.y += (wy * 0.35 + k.vy) * dt;
        const m = k.R + 20; k.x = clamp(k.x, m, Math.max(m, w.w - m)); k.y = clamp(k.y, TOP + 20, Math.max(TOP + 20, w.h - m));
        for (const o of w.summits) { const g = edgeGap(o, k.x, k.y, k.R + p.clear + 10); if (g < 0) { const a = Math.atan2(k.y - o.y, k.x - o.x); k.x -= Math.cos(a) * g; k.y -= Math.sin(a) * g; } }
        if (k.age > k.life) k.dead = true;
      } else {
        // raised lift is spent: by time alone, and faster by every eagle climbing in it
        k.x += wx * 0.15 * dt; k.y += wy * 0.15 * dt;
        k.power -= dt / p.life / (k.kind === 'ridge' ? 1.5 : 1) + p.use * k.n * dt;
        if (k.power <= 0) { k.power = 0; k.dead = true; }
      }
    }
    // two natural kettles that drift together merge: the younger's eagles join the older
    const K = w.lifts.filter((k) => k.kind === 'kettle' && !k.dead);
    for (let i = 0; i < K.length; i++) for (let j = i + 1; j < K.length; j++) {
      const a = K[i], b = K[j]; if (a.dead || b.dead) continue;
      if (Math.hypot(a.x - b.x, a.y - b.y) < (a.R + b.R) * 0.7) { const [young, old] = a.age < b.age ? [a, b] : [b, a]; young.dead = true; for (const e of w.eagles) if (e.lift === young) e.lift = old; }
    }
  }
  for (let i = w.lifts.length - 1; i >= 0; i--) if (w.lifts[i].dead) w.lifts.splice(i, 1);
  if (!still) while (w.lifts.filter((k) => k.kind === 'kettle').length < kettleTarget(w)) spawnKettle(w);
}

// ----- the eagles -----
function spawnEagle(w) {
  const r = w.rand, K = w.lifts.filter((k) => !k.dead), k = K.length ? K[Math.floor(r() * K.length)] : null;
  const e = {
    x: r() * w.w, y: TOP + r() * (w.h - TOP), h: r() * TAU, v: w.params.circle, om: 0, bank: 0, alt: 0.15 + 0.7 * r(),
    flap: r(), beat: 0, flapFor: 0, fan: 0, mode: 'glide', lift: null, rr: 0.7 + 0.6 * r(), j: 0, jd: 1, timer: 0,
    cover: null, perch: null, fixed: null, wander: 0,
  };
  if (k) {
    const a = r() * TAU, R = k.R * e.rr;
    e.x = k.x + Math.cos(a) * R; e.y = k.y + Math.sin(a) * R; e.h = a + (k.dir * Math.PI) / 2; e.lift = k;
    e.mode = k.kind === 'ridge' ? 'glide' : 'circle';
  }
  return e;
}
// the lift an eagle goes to next: near, not crowded, raised lift first when it is within reach
function chooseLift(w, e, avoid) {
  const p = w.params, r = w.rand; let best = null, bc = Infinity;
  for (const k of w.lifts) {
    if (k.dead || k === avoid || k.power < 0.12) continue;
    const d = Math.hypot(k.x - e.x, k.y - e.y);
    const c = d + k.n * 50 + r() * 120 - (k.user && d < p.pull ? 800 : 0);
    if (c < bc) { bc = c; best = k; }
  }
  e.lift = best; e.mode = 'glide';
}
// leaving the top of its lift it beats a few times to set off on the glide
function peel(w, e) { e.lift = null; e.mode = 'glide'; e.wander = 0; e.flapFor = Math.max(e.flapFor, 1 + w.rand()); w.peels++; }
function takeOff(w, e) { e.mode = 'glide'; e.perch = null; e.cover = null; e.v = Math.max(e.v, 26); e.flapFor = 1.6; chooseLift(w, e, null); }
// a gust: the eagle is thrown off its line and banks hard, loses height, then makes for cover
function toss(w, e, ux, uy) {
  const r = w.rand;
  e.mode = 'toss'; e.timer = 0.6 + 0.3 * r(); e.lift = null; e.fixed = null;
  e.tossH = wrapAngle(Math.atan2(uy, ux) + (r() - 0.5) * 1.6); e.bank = clamp(e.bank + (r() < 0.5 ? -1 : 1) * (0.4 + 0.3 * r()), -55 * DEG, 55 * DEG);
  e.alt = Math.max(0, e.alt - 0.12); e.flapFor = 1.2; w.gusts++;
}
// cover: the nearest cloud within reach, else a free perch on the nearest crag, else open sky away from the gust
function seekCover(w, e) {
  const R = w.relief; let best = null, bd = 700;
  for (const c of w.clouds) { const d = Math.hypot(c.x - e.x, c.y - e.y); if (d < bd) { bd = d; best = { cloud: c }; } }
  if (!best && R) {
    bd = Infinity;
    for (const c of R.crags) { if (c.perched >= 2) continue; const d = Math.hypot(c.x - e.x, c.y - e.y); if (d < bd) { bd = d; best = { crag: c }; } }
    if (best) { const c = best.crag, a = (c.perched ? Math.PI : 0) + c.ph[0]; c.perched++; e.perch = { c, x: c.x + Math.cos(a) * c.r * 0.12, y: c.y + Math.sin(a) * c.r * 0.12 }; }
  }
  e.cover = best; e.mode = 'cover'; e.timer = best ? 12 : 2.5;
}
const V = { x: 0, y: 0 }, N = { x: 0, y: 0 };
function stepEagles(w, dt, gust) {
  const p = w.params, r = w.rand, E = w.eagles, n = E.length, still = w.reduced, ptr = w.ptr;
  const G = 80; // speed times turn rate, px/s^2, that a bank of 45 deg holds: circling in lift banks about 26 deg
  for (let i = 0; i < n; i++) {
    const e = E[i];
    if (e.lift && e.lift.dead) chooseLift(w, e, e.lift);
    // reduced motion: every eagle glides on a fixed slow circle of its own, no beats, no climbing, no gusts
    if (still) {
      if (e.mode === 'perch') continue;
      if (!e.fixed) { const R = p.orbit * e.rr, side = e.om >= 0 ? 1 : -1; e.fixed = { x: e.x - Math.sin(e.h) * R * side, y: e.y + Math.cos(e.h) * R * side, R, dir: side }; }
    } else if (e.fixed) { e.fixed = null; if (e.mode !== 'perch') chooseLift(w, e, null); }
    if (!still && gust && e.mode !== 'perch' && e.mode !== 'toss') {
      const dx = e.x - ptr.x, dy = e.y - ptr.y, d = Math.hypot(dx, dy);
      if (d < p.reach && d > 1e-6) toss(w, e, dx / d, dy / d);
    }
    if (e.mode === 'perch') { e.v = 0; e.beat = Math.max(0, e.beat - dt * 4); e.timer -= dt; if (e.timer <= 0) { if (e.perch) e.perch.c.perched = Math.max(0, e.perch.c.perched - 1); takeOff(w, e); } continue; }
    // where it wants to go, as a direction (tx, ty), and how fast
    let tx = Math.cos(e.h), ty = Math.sin(e.h), want = p.glide, orbit = null;
    if (still) { orbit = e.fixed; want = p.circle * p.reduced; }
    else if (e.mode === 'toss') { tx = Math.cos(e.tossH); ty = Math.sin(e.tossH); want = p.glide * 1.2; e.timer -= dt; if (e.timer <= 0) seekCover(w, e); }
    else if (e.mode === 'cover') {
      e.timer -= dt;
      const c = e.cover;
      if (c && c.cloud) { const dx = c.cloud.x - e.x, dy = c.cloud.y - e.y, d = Math.hypot(dx, dy); tx = dx / (d || 1); ty = dy / (d || 1); want = p.glide * 1.15; if (d < c.cloud.r * 0.45) { e.mode = 'hide'; e.timer = p.cover * (0.8 + 0.4 * r()); e.dir = r() < 0.5 ? 1 : -1; } }
      else if (e.perch) {
        const dx = e.perch.x - e.x, dy = e.perch.y - e.y, d = Math.hypot(dx, dy); tx = dx / (d || 1); ty = dy / (d || 1);
        want = Math.max(24, Math.min(p.glide, d * 1.2)); e.alt = Math.max(0, e.alt - dt * 0.25);
        if (d < 5) { e.mode = 'perch'; e.x = e.perch.x; e.y = e.perch.y; e.timer = p.cover * (0.8 + 0.5 * r()); e.alt = 0; continue; }
      } else { const dx = e.x - ptr.x, dy = e.y - ptr.y, d = Math.hypot(dx, dy) || 1; tx = dx / d; ty = dy / d; }
      if (e.timer <= 0) { if (e.perch) e.perch.c.perched = Math.max(0, e.perch.c.perched - 1); e.perch = null; e.cover = null; chooseLift(w, e, null); }
    } else if (e.mode === 'hide') {
      const c = e.cover && e.cover.cloud;
      e.timer -= dt;
      if (c) { orbit = { x: c.x, y: c.y, R: c.r * 0.3 * e.rr, dir: e.dir || 1 }; want = p.circle; }
      if (e.timer <= 0 || !c) { e.cover = null; chooseLift(w, e, null); }
    } else {
      const k = e.lift;
      if (!k) {
        // peeled off the top of a thermal: a straight glide out until it has sunk to where lift is worth finding
        if (e.alt < 0.7 || r() < dt * 0.05) chooseLift(w, e, null);
        e.wander += (r() - 0.5) * dt * 2; e.wander *= 1 - dt * 0.5; tx = Math.cos(e.h + e.wander); ty = Math.sin(e.h + e.wander);
      } else if (k.kind === 'ridge') {
        const P2 = k.pts, np = P2.length / 2;
        if (e.mode !== 'ridge') {
          let bi = 0, bd = Infinity; for (let j = 0; j < np; j++) { const d = Math.hypot(P2[2 * j] - e.x, P2[2 * j + 1] - e.y); if (d < bd) { bd = d; bi = j; } }
          tx = P2[2 * bi] - e.x; ty = P2[2 * bi + 1] - e.y; const d = Math.hypot(tx, ty) || 1; tx /= d; ty /= d;
          if (bd < 26) { e.mode = 'ridge'; e.j = bi; e.jd = bi < np / 2 ? 1 : -1; w.joins++; }
        } else {
          let dx = P2[2 * e.j] - e.x, dy = P2[2 * e.j + 1] - e.y;
          if (Math.hypot(dx, dy) < 20) { e.j += e.jd; if (e.j < 0 || e.j >= np) { e.jd = -e.jd; e.j = clamp(e.j + 2 * e.jd, 0, np - 1); } dx = P2[2 * e.j] - e.x; dy = P2[2 * e.j + 1] - e.y; }
          const d = Math.hypot(dx, dy) || 1; tx = dx / d; ty = dy / d; want = (p.glide + p.circle) / 2;
          e.alt = Math.min(1, e.alt + p.climb * k.power * dt);
          if (e.alt >= 0.98) peel(w, e);
        }
      } else if (e.mode !== 'circle') {
        tx = k.x - e.x; ty = k.y - e.y; const d = Math.hypot(tx, ty) || 1; tx /= d; ty /= d;
        if (d < k.R * e.rr * 1.4) { e.mode = 'circle'; w.joins++; }
      } else {
        orbit = { x: k.x, y: k.y, R: k.R * e.rr, dir: k.dir }; want = p.circle;
        e.alt = Math.min(1, e.alt + p.climb * k.power * dt);
        // at the top of the thermal, or now and then on a whim, it peels off for the next
        if (e.alt >= 0.98 || r() < dt * 0.008) peel(w, e);
      }
    }
    if (orbit) {
      let dx = e.x - orbit.x, dy = e.y - orbit.y; const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
      const pull = clamp((1.2 * (d - orbit.R)) / orbit.R, -1, 1);
      tx = -dy * orbit.dir - dx * pull; ty = dx * orbit.dir - dy * pull;
    }
    // room from the others
    if (p.repel > 0 && e.mode !== 'toss') {
      let sx = 0, sy = 0;
      for (let j = 0; j < n; j++) {
        if (j === i) continue; const o = E[j]; if (o.mode === 'perch') continue;
        const dx = e.x - o.x, dy = e.y - o.y, d2 = dx * dx + dy * dy;
        if (d2 < p.repel * p.repel && d2 > 1e-6) { const d = Math.sqrt(d2), f = 1 - d / p.repel; sx += (dx / d) * f; sy += (dy / d) * f; }
      }
      tx += sx * 0.9; ty += sy * 0.9;
    }
    // the summits: an eagle heading in turns along the slope and rides up over it, never in past the top contour
    let gapMin = Infinity;
    for (const o of w.summits) {
      const lx = e.x + Math.cos(e.h) * 46, ly = e.y + Math.sin(e.h) * 46, g = edgeGap(o, lx, ly, p.clear + 8);
      gapMin = Math.min(gapMin, edgeGap(o, e.x, e.y, 0));
      if (g < 0) {
        edgeNormal(o, e.x, e.y, N); let ax = -N.y, ay = N.x; if (ax * tx + ay * ty < 0) { ax = -ax; ay = -ay; }
        const f = clamp(-g / 46, 0, 1); tx = tx * (1 - f) + (ax + N.x * 0.6) * f; ty = ty * (1 - f) + (ay + N.y * 0.6) * f;
      }
    }
    // the page: turn back in from the margins
    const mx = 30, my = 64;
    if (e.x < mx || e.x > w.w - mx || e.y < my || e.y > w.h - mx) { const cx = w.w / 2 - e.x, cy = (w.h + TOP) / 2 - e.y, d = Math.hypot(cx, cy) || 1; tx += (cx / d) * 1.5; ty += (cy / d) * 1.5; }
    // turn toward it, no faster than the turn allows; the bank follows the turn
    const wantH = Math.atan2(ty, tx), turnMax = (e.mode === 'toss' ? 3 : 1) * p.turn * dt;
    const dh = clamp(wrapAngle(wantH - e.h), -turnMax, turnMax);
    e.h = wrapAngle(e.h + dh);
    const om = dh / dt; e.om += (om - e.om) * Math.min(1, dt * 5);
    const bankTo = clamp(Math.atan((e.v * e.om) / G), -45 * DEG, 45 * DEG);
    e.bank += (bankTo - e.bank) * Math.min(1, dt * (e.mode === 'toss' ? 1 : 3.5));
    e.v += clamp(want - e.v, -40 * dt, 40 * dt);
    e.x += Math.cos(e.h) * e.v * dt; e.y += Math.sin(e.h) * e.v * dt;
    if (orbit && still) { /* the fixed circles carry nothing else */ }
    else if (e.mode === 'hide' && e.cover && e.cover.cloud) { const c = e.cover.cloud; e.x += c.vx * dt; e.y += c.vy * dt; }
    // held out of every summit's top contour, whatever steered it
    for (const o of w.summits) if (edgeGap(o, e.x, e.y, p.clear) < 0) { onEdge(o, e.x, e.y, p.clear, V); e.x = V.x; e.y = V.y; }
    if (still) continue;
    // height: sinking on the glide, riding up near a summit, climbing in lift (above)
    if (e.mode === 'glide' || e.mode === 'cover' || e.mode === 'toss') e.alt = Math.max(0, e.alt - p.sink * dt);
    const floorAlt = clamp(1 - gapMin / 130, 0, 1) * 0.6;
    if (e.alt < floorAlt) e.alt += (floorAlt - e.alt) * Math.min(1, dt * 1.2);
    // An eagle soars on flat, still wings and beats rarely, in short series: now and then on a whim while it soars (one
    // series every 1 / flaps s on average), when low, on leaving a thermal's top or cover; a slow, deep beat.
    if (e.flapFor <= 0 && ((SOARING.has(e.mode) && r() < p.flaps * dt) || (e.alt < 0.05 && e.mode === 'glide'))) e.flapFor = 0.9 + 0.9 * r();
    e.flapFor -= dt;
    const beatTo = e.flapFor > 0 ? 1 : 0;
    e.beat += clamp(beatTo - e.beat, -dt * 3, dt * 3);
    if (e.beat > 0.01 || e.flapFor > 0) e.flap = (e.flap + dt * 2.4) % 1;
    const fanTo = e.mode === 'circle' || e.mode === 'hide' ? 0.75 : e.mode === 'ridge' ? 0.35 : 0.08;
    e.fan += (fanTo - e.fan) * Math.min(1, dt * 2);
  }
}

// ----- clouds -----
function makeCloud(w, i) {
  const r = w.rand, p = w.params;
  return { x: r() * w.w, y: TOP + r() * (w.h - TOP), r: p.size * (0.7 + 0.6 * r()), lobes: 5 + Math.floor(r() * 4), ph: [r() * TAU, r() * TAU, r() * TAU], vx: 0, vy: 0, i };
}
function stepClouds(w, dt) {
  const p = w.params, a = p.wind * DEG;
  for (const c of w.clouds) {
    c.vx = Math.cos(a) * p.drift; c.vy = Math.sin(a) * p.drift;
    if (w.reduced) continue;
    c.x += c.vx * dt; c.y += c.vy * dt;
    const m = c.r * 1.4;
    if (c.x < -m) c.x += w.w + 2 * m; else if (c.x > w.w + m) c.x -= w.w + 2 * m;
    if (c.y < -m) c.y += w.h + 2 * m; else if (c.y > w.h + m) c.y -= w.h + 2 * m;
  }
}
// a cumulus from above: puffs round the edge, the rim between two puffs pinched in; the puffs breathe slowly. The rim
// is sampled at 96 bearings and drawn straight from sample to sample, less every sample within THIN px of the line
// from the last one kept to the next (most of a puff's broad arc; never the pinches between puffs)
const CLOUD_N = 96, CX = new Float32Array(CLOUD_N), CY = new Float32Array(CLOUD_N);
function cloudPath(ctx, c, T) {
  const n = CLOUD_N;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU, puff = Math.abs(Math.sin((c.lobes * a) / 2 + c.ph[0] + 0.25 * Math.sin(T * 0.07 + c.ph[1])));
    const k = c.r * (0.8 + 0.22 * Math.sqrt(puff) + 0.07 * Math.sin(2 * a + c.ph[2] + T * 0.04));
    CX[i] = c.x + Math.cos(a) * k; CY[i] = c.y + Math.sin(a) * k;
  }
  ctx.beginPath(); ctx.moveTo(CX[0], CY[0]);
  let lx = CX[0], ly = CY[0];
  for (let i = 1; i < n; i++) {
    const j = (i + 1) % n, dx = CX[j] - lx, dy = CY[j] - ly, ex = CX[i] - lx, ey = CY[i] - ly;
    if (Math.abs(dx * ey - dy * ex) < THIN * Math.hypot(dx, dy)) continue;
    ctx.lineTo(CX[i], CY[i]); lx = CX[i]; ly = CY[i];
  }
  ctx.closePath();
}

// ----- goats -----
function layGoats(w, n) {
  const R = w.relief, r = w.rand; w.goats.length = 0;
  if (!R || !R.ledges.length) return;
  const free = R.ledges.slice();
  for (let i = 0; i < n && free.length; i++) {
    const l = free.splice(Math.floor(r() * free.length), 1)[0];
    w.goats.push({ at: l, from: l, to: l, x: l.x, y: l.y, h: r() * TAU, hop: -1, dur: 0.7, wait: 1 + r() * 5, bolting: false });
  }
}
function stepGoats(w, dt) {
  if (w.reduced) return;
  const p = w.params, r = w.rand, ptr = w.ptr;
  for (const g of w.goats) {
    if (g.hop >= 0) {
      g.hop += dt / g.dur;
      if (g.hop >= 1) { g.hop = -1; g.at = g.to; g.x = g.at.x; g.y = g.at.y; g.wait = g.bolting ? 0.05 : 2 + r() * 5; g.bolting = false; }
      else { const u = g.hop; g.x = g.from.x + (g.to.x - g.from.x) * u; g.y = g.from.y + (g.to.y - g.from.y) * u; }
      continue;
    }
    g.wait -= dt;
    const d = ptr.on ? Math.hypot(g.x - ptr.x, g.y - ptr.y) : Infinity;
    const taken = (l) => w.goats.some((o) => o !== g && (o.at === l || o.to === l));
    if (d < p.bolt) {
      // bolt: to the linked ledge farthest from the cursor, if that is farther than here
      let best = null, bd = d;
      for (const l of g.at.links) { const dl = Math.hypot(l.x - ptr.x, l.y - ptr.y); if (dl > bd && !taken(l)) { bd = dl; best = l; } }
      if (best) { hop(g, best, 0.3); g.bolting = true; w.bolts++; }
    } else if (g.wait <= 0) {
      const opts = g.at.links.filter((l) => !taken(l));
      if (opts.length) hop(g, opts[Math.floor(r() * opts.length)], 0.55 + 0.3 * r()); else g.wait = 1 + r() * 3;
    }
  }
}
function hop(g, l, dur) { g.from = g.at; g.to = l; g.hop = 0; g.dur = dur; g.h = Math.atan2(l.y - g.at.y, l.x - g.at.x); }
function drawGoat(ctx, g) {
  const s = g.hop >= 0 ? 1 + 0.45 * Math.sin(Math.PI * g.hop) : 1, c = Math.cos(g.h), sn = Math.sin(g.h);
  ctx.beginPath(); ctx.ellipse(g.x, g.y, 3.4 * s, 1.9 * s, g.h, 0, TAU); ctx.fill(); ctx.stroke();
  const hx = g.x + c * 4.4 * s, hy = g.y + sn * 4.4 * s;
  ctx.beginPath(); ctx.arc(hx, hy, 1.15 * s, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.beginPath();
  for (const side of [1, -1]) { const bx = hx - sn * side * 0.7 * s, by = hy + c * side * 0.7 * s; ctx.moveTo(bx, by); ctx.quadraticCurveTo(bx - c * 1.6 * s, by - sn * 1.6 * s, bx - c * 2.6 * s - sn * side * 1.1 * s, by - sn * 2.6 * s + c * side * 1.1 * s); }
  ctx.stroke();
}

// ----- edelweiss -----
// Clustered on the meadow shelves, each opening through bud, opening, open and closing on a cycle of its own phase.
function layFlowers(w) {
  const R = w.relief, n = Math.round(w.coarse ? w.params.flowersTouch : w.params.flowers), r = rng((w.seed ^ 0x65646c77) >>> 0);
  w.flowers = [];
  if (!R || !R.shelves.length) return;
  for (let i = 0; i < n; i++) {
    const s = R.shelves[Math.floor(i / 3) % R.shelves.length], a = r() * TAU, d = 3 + r() * 10;
    w.flowers.push({ x: s.x + Math.cos(a) * d, y: s.y + Math.sin(a) * d, ph: (Math.floor(i / 3) * 0.29 + r() * 0.12) % 1, rot: r() * TAU, size: 0.8 + 0.4 * r() });
  }
}
export function openness(w, f) {
  const s = (((w.bloomT / w.params.bloom + f.ph) % 1) + 1) % 1;
  return s < 0.35 ? 0 : s < 0.5 ? (s - 0.35) / 0.15 : s < 0.85 ? 1 : (1 - s) / 0.15;
}
function drawFlower(ctx, f, o) {
  const k = f.size, inner = 1.1 * k;
  ctx.moveTo(f.x + inner, f.y); ctx.arc(f.x, f.y, inner, 0, TAU);
  if (o <= 0.02) return;
  for (let i = 0; i < 6; i++) {
    const a = f.rot + (i / 6) * TAU, L = inner + (1 + 3.4 * o) * k, wd = 0.5 * o * k, c = Math.cos(a), s = Math.sin(a);
    ctx.moveTo(f.x + c * inner - s * wd, f.y + s * inner + c * wd); ctx.lineTo(f.x + c * L, f.y + s * L); ctx.lineTo(f.x + c * inner + s * wd, f.y + s * inner - c * wd);
  }
}

// ----- wind streaks -----
function stepStreaks(w, dt) {
  const p = w.params, R = w.relief, r = w.rand, S = w.streaks;
  if (w.reduced) return;
  const a = p.wind * DEG, vx = Math.cos(a) * p.drift * 3.2, vy = Math.sin(a) * p.drift * 3.2;
  for (let i = S.length - 1; i >= 0; i--) { const s = S[i]; s.age += dt; s.x += vx * dt; s.y += vy * dt; if (s.age > s.life) S.splice(i, 1); }
  if (R && S.length < p.streaks && r() < dt * 3) {
    for (let t = 0; t < 8; t++) {
      const x = r() * w.w, y = TOP + r() * (w.h - TOP);
      if (height(R, x, y) < R.q[3] || summitAt(w, x, y) >= 0) continue;
      S.push({ x, y, age: 0, life: 2.2 + 2 * r(), len: 22 + 30 * r(), bow: (r() - 0.5) * 6 }); break;
    }
  }
}

// ----- the step -----
export function step(w, dt) {
  if (!(dt > 0)) return;
  const p = w.params;
  w.t += dt;
  // the summits follow their objects; the swell runs on the world's clock and holds still under reduced motion
  for (const o of w.summits) updateFootprint(o, w.outlines[o.i], dt, p, w.reduced, w.t);
  plan(w);
  const fast = pointerSpeed(w.ptr, dt) > p.gust, gust = !w.reduced && fast;
  if (!w.reduced) { w.cloudT += dt; w.bloomT += dt; w.flowT += dt; }
  stepLifts(w, dt);
  stepEagles(w, dt, gust);
  stepClouds(w, dt);
  stepGoats(w, dt);
  stepStreaks(w, dt);
}

// ----- drawing -----
export function drawGround(ctx, w, colours, layer = { img: null, w: 0, h: 0, flat: colours.paper }) {
  const p = w.params, still = w.reduced, { ink, paper, water } = colours;
  ctx.globalAlpha = 1;
  if (!layer.img || layer.w < w.w || layer.h < w.h) { ctx.fillStyle = layer.flat; ctx.fillRect(0, 0, w.w, w.h); }
  if (layer.img) { ctx.imageSmoothingEnabled = true; ctx.drawImage(layer.img, 0, 0, layer.w, layer.h); }
  // each summit's plateau, paper inside its top contour, which follows the object live
  ctx.fillStyle = paper;
  for (const o of w.summits) { edgePath(ctx, o, 0); ctx.fill(); }
  ctx.strokeStyle = ink; ctx.lineWidth = 1; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.globalAlpha = p.topAlpha; for (const o of w.summits) { edgePath(ctx, o, 0); ctx.stroke(); }
  // the ridgeline from top to top, drawn as a map draws a crest: no line, only short hachures falling away from it on
  // both sides, staggered, longest midway where the saddle is steepest across (under the hachure relief only)
  if (w.summits.length >= 2 && p.ridgeAlpha > 0 && reliefMode(p) === 0) {
    const [a, b] = w.summits, A = onEdge(a, b.x, b.y, 0, V), ax = A.x, ay = A.y, B = onEdge(b, a.x, a.y, 0, N);
    const dx = B.x - ax, dy = B.y - ay, L = Math.hypot(dx, dy);
    if (L > 20) {
      const nx = -dy / L, ny = dx / L, sag = 0.05 * L * Math.sin(w.seed % 7), n = Math.max(2, Math.floor(L / 7));
      ctx.globalAlpha = p.ridgeAlpha; ctx.beginPath();
      for (let i = 1; i < n; i++) {
        const u = i / n, s = 4 * u * (1 - u) * sag, x = ax + dx * u + nx * s, y = ay + dy * u + ny * s, t = 2 + 3 * Math.sin(Math.PI * u);
        const side = i & 1 ? 1 : -1, o = 1.2 + (i % 3) * 0.6;
        ctx.moveTo(x + nx * side * o, y + ny * side * o); ctx.lineTo(x + nx * side * (o + t), y + ny * side * (o + t));
      }
      ctx.stroke();
    }
  }
  // the stream's marks shimmer downstream
  const R = w.relief;
  if (R && R.stream) {
    const S = R.stream, total = S.len[S.len.length - 1], gap = 18, off = (w.flowT * 14) % gap;
    ctx.strokeStyle = water; ctx.globalAlpha = p.waterAlpha * 0.6; ctx.beginPath();
    let j = 1;
    for (let s = off; s < total - 3; s += gap) {
      while (j < S.len.length - 1 && S.len[j] < s) j++;
      const i = j - 1, f = (s - S.len[i]) / Math.max(1e-6, S.len[j] - S.len[i]), x = S.pts[2 * i] + (S.pts[2 * j] - S.pts[2 * i]) * f, y = S.pts[2 * i + 1] + (S.pts[2 * j + 1] - S.pts[2 * i + 1]) * f;
      const ux = (S.pts[2 * j] - S.pts[2 * i]) / Math.max(1e-6, S.len[j] - S.len[i]), uy = (S.pts[2 * j + 1] - S.pts[2 * i + 1]) / Math.max(1e-6, S.len[j] - S.len[i]);
      const side = (Math.floor(s / gap) & 1 ? 1 : -1) * 2;
      ctx.moveTo(x - uy * side, y + ux * side); ctx.lineTo(x - uy * side + ux * 3, y + ux * side + uy * 3);
    }
    ctx.stroke(); ctx.strokeStyle = ink;
  }
  // edelweiss
  if (w.flowers.length) { ctx.globalAlpha = Math.min(1, p.floorAlpha * 2.2); ctx.beginPath(); for (const f of w.flowers) drawFlower(ctx, f, openness(w, f)); ctx.stroke(); }
  // wind streaks over the high ground
  if (!still && w.streaks.length) {
    const a = p.wind * DEG, ux = Math.cos(a), uy = Math.sin(a);
    for (const s of w.streaks) {
      ctx.globalAlpha = p.streakAlpha * Math.sin((Math.PI * s.age) / s.life); ctx.beginPath();
      ctx.moveTo(s.x - (ux * s.len) / 2, s.y - (uy * s.len) / 2); ctx.quadraticCurveTo(s.x - uy * s.bow, s.y + ux * s.bow, s.x + (ux * s.len) / 2, s.y + (uy * s.len) / 2); ctx.stroke();
    }
  }
  // raised lift: a thermal's rising spiral, turning, smaller as it is spent, with a ring spreading where it rose; a
  // ridge's lift as a line of dashes running along it
  for (const k of w.lifts) {
    if (!k.user) continue;
    const a = p.liftAlpha * Math.min(1, k.power * 1.5 + 0.1);
    if (k.kind === 'thermal') {
      const Rr = 8 + 20 * k.power, rot = w.t * 1.4 * k.dir, n = 44;
      ctx.globalAlpha = a; ctx.beginPath();
      for (let i = 0; i <= n; i++) { const u = i / n, an = rot + k.dir * u * 2.25 * TAU, rr = Rr * (0.12 + 0.88 * u); const x = k.x + Math.cos(an) * rr, y = k.y + Math.sin(an) * rr; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
      ctx.stroke();
      if (k.age < 1.4) { ctx.globalAlpha = p.liftAlpha * (1 - k.age / 1.4); ctx.beginPath(); ctx.arc(k.x, k.y, 6 + 34 * k.age, 0, TAU); ctx.stroke(); }
    } else if (k.pts && k.pts.length >= 4) {
      ctx.globalAlpha = a; ctx.setLineDash([5, 9]); ctx.lineDashOffset = -w.t * 18; ctx.beginPath(); smoothLine(ctx, k.pts); ctx.stroke(); ctx.setLineDash([]);
    }
  }
  ctx.globalAlpha = 1;
}
export function drawLive(ctx, w, colours) {
  const p = w.params, { ink, paper } = colours, tone = eagleTones(ink, paper);
  ctx.strokeStyle = ink; ctx.fillStyle = paper; ctx.lineWidth = p.width; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  // goats on their ledges
  ctx.globalAlpha = Math.min(1, p.alpha * 1.1);
  for (const g of w.goats) drawGoat(ctx, g);
  if (p.study) { drawStudy(ctx, w, colours); return; }
  // perched eagles, then the flying ones from the lowest to the highest, then the clouds over them
  const O = w.order; O.length = 0;
  for (const e of w.eagles) if (e.mode === 'perch') drawPerched(ctx, e.x, e.y, e.h, p.length * 0.72, p.alpha, tone); else O.push(e);
  O.sort((a, b) => a.alt - b.alt);
  // one at a time, lowest first, so the higher reads over the lower. (Every uncrossed eagle in one shared fill and
  // stroke was tried: one large self-overlapping path cost the GPU process half again what 36 small ones do.)
  for (const e of O) drawEagle(ctx, e.x, e.y, e.h, p.length * sizeAt(e.alt), e, p.alpha, tone, FLIGHT_PERSP);
  // the clouds, over everything that flies under them
  ctx.fillStyle = paper;
  for (const c of w.clouds) {
    cloudPath(ctx, c, w.cloudT); ctx.globalAlpha = 0.95; ctx.fill(); ctx.globalAlpha = p.cloudAlpha; ctx.stroke();
    ctx.globalAlpha = p.cloudAlpha * 0.55; ctx.beginPath();
    // two inner puffs, a short arc each
    for (let i = 0; i < 2; i++) { const a = c.ph[i] * 3, rr = c.r * (0.3 + 0.08 * i), cx = c.x + Math.cos(a) * c.r * 0.3, cy = c.y + Math.sin(a) * c.r * 0.3, a0 = a + 0.6 + i; ctx.moveTo(cx + Math.cos(a0) * rr, cy + Math.sin(a0) * rr); ctx.arc(cx, cy, rr, a0, a0 + 1.4); }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
// the pose study: one eagle at eight times its flight length, posed by the study sliders, in the middle of the page
function drawStudy(ctx, w, colours) {
  const p = w.params, L = p.length * 8 * sizeAt(p.rise);
  ctx.lineWidth = p.width;
  drawEagle(ctx, w.w / 2, w.h / 2, p.heading * DEG, L, { bank: p.bank * DEG, flap: p.flap, beat: p.beat, fan: p.fan }, Math.max(p.alpha, 0.7), eagleTones(colours.ink, colours.paper));
}

export const scene = {
  PARAMS,
  palette: PALETTE,
  createWorld, resizeWorld, step,
  setSources: setSummits, setOutlines, setPointer,
  hit: summitAt, drop: raiseThermal,
  strokeStart, strokeTo, strokeEnd, strokeCancel,
  // clear the sky of what the visitor raised: every thermal and ridge goes, and the eagles in it find other lift
  clear(w) { for (const k of w.lifts) if (k.user) k.dead = true; w.ridge = null; },
  // the relief: made anew for a new plan, relief or hachure setting; repainted for a new candidate or alpha
  layer: {
    key: (w, p) => `${w.seed} ${w.plan} ${reliefMode(p)} ${p.density} ${p.jitter} ${p.short} ${p.long} ${p.flat} ${p.sparse}`,
    make: (w, p, W, H) => ({ marks: hachures(w, W, H, p), floor: floorLines(w, reliefMode(p)), relief: reliefLines(w, p, W, H) }),
    look: (p) => `${pickCandidate(p)} ${p.hachureAlpha} ${p.floorAlpha} ${p.waterAlpha} ${p.shade} ${p.lineAlpha}`,
    paint: paintLayer,
  },
  drawGround, drawLive,
};
