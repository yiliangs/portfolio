// The mountain: a home scene seen straight down, drawn as a cartographer draws high ground. The two objects stand on
// summits whose contour rings follow their live outlines and merge across the saddle between them, a ridgeline running
// from one top to the other; hachures fall downslope from a height field of the summits, satellite crags and a broad
// ridge; tarns lie in the hollows, a stream runs down a valley to one, and scree, rock strata and a treeline of conifers
// are drawn fainter. Golden eagles soar in loose kettles: they glide between thermals, bank into their turns (the wings
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
  strokeOpen, strokeAlong, latticeMarks, drawMarks,
} from './kit.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const DEG = Math.PI / 180;

// Parameters by section: [default, min, max, step, label], or [value, 'toggle', label].
export const PARAMS = {
  ground: {
    slate: [0.07, 0, 0.4, 0.005, 'how far the page is taken toward the candidate\'s ground tone'],
    palette: [0, 0, 2, 1, 'tint candidate: 0 slate, 1 glacier, 2 dusk'],
    bands: [0.5, 0, 1, 0.05, 'how far the summits lighten back toward the paper, band by band'],
    ...GROUND,
  },
  summits: {
    ...FOOTPRINT,
    rings: [5, 0, 12, 1,'contour rings below each summit\'s top contour; the fifth is an index contour'],
    interval: [15, 6, 40, 1, 'gap between contour rings, px'],
    saddle: [1, 0, 3, 0.05, 'how softly two summits\' rings merge across the saddle, in rings'],
    cell: [12, 3, 24, 1, 'grid the rings are traced on, px'],
    topAlpha: [0.3, 0, 1, 0.01, 'opacity of the top contour'],
    ringAlpha: [0.15, 0, 1, 0.01, 'opacity of the contour rings'],
    ridgeAlpha: [0.2, 0, 1, 0.01, 'opacity of the ridgeline between the summits'],
    clear: [14, 0, 80, 1, 'gap an eagle keeps from a summit\'s top contour, px'],
  },
  relief: {
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
    golden: [4, 0, 24, 1, 'eagles with a gold nape, on a fine pointer'],
    goldenTouch: [2, 0, 24, 1, 'gold-naped eagles on a coarse pointer'],
    length: [17, 8, 50, 1, 'body length at mid height, px; the span is 2.3 lengths'],
    variant: [0, 0, 2, 1,'figure: 0 parted outline, 1 a stroke per wing, 2 one silhouette'],
    glide: [70, 10, 200, 1, 'gliding speed, px/s'],
    circle: [48, 10, 200, 1, 'circling speed in lift, px/s'],
    orbit: [58, 20, 200, 1, 'mean radius an eagle circles in lift at, px'],
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
  accents: { water: '#4f7698', gold: '#b68235' },
};

// ----- the eagle -----
// An eagle seen from straight above, built in its own frame and projected. Units are the body's length (beak to tail
// tip = 1); x runs forward, y to the eagle's right, z up toward the viewer. The planform is a golden eagle's: a long
// broad arm, a hand ending in five splayed primaries, a short rounded tail, and a head that juts well ahead of the
// wings; the span is about 2.3 lengths. A pose is { bank, flap, beat, fan }:
//   bank  roll in radians, positive with the right wing down (a turn to the right). The roll carries the wings round the
//         body's axis: the low wing shortens and shrinks, the high wing, swung toward the viewer, shortens and grows
//         under a weak perspective; the tail twists against the turn and the head looks into it.
//   flap  the wingbeat's phase, 0..1; beat how much of a beat (0 gliding, 1 a full stroke). The wings sweep through
//         their dihedral and foreshorten; on the upstroke the hand folds back at the wrist and draws in.
//   fan   how far the tail is spread, 0..1 (an eagle circling slow in lift spreads it).
// Points are given for the right side; the left is the mirror.
// The proportions are a golden eagle's, 0.85 m long and 2 m across: the arm's chord about half the length, the head
// and neck a quarter of it ahead of the wing, the tail three tenths behind, six fingered primaries at the tip.
const HEAD = [0.5, 0, 0.47, 0.03, 0.42, 0.055, 0.34, 0.065, 0.27, 0.09];
// The wing is a plank: its edges run nearly parallel out to a broad hand, which ends square in six splayed fingers
// with slots between them.
const LEAD = [0.2, 0.1, 0.24, 0.3, 0.23, 0.55, 0.18, 0.82];
const FINGERS = [ // tip x, tip y, then the slot before the next tip
  0.13, 1.03, 0.041, 0.959,
  0.07, 1.12, 0.007, 1.013,
  0, 1.16, -0.037, 1.03,
  -0.07, 1.16, -0.081, 1.012,
  -0.14, 1.12, -0.119, 1.003,
  -0.21, 1.04,
];
const TRAIL = [-0.25, 0.9, -0.28, 0.62, -0.3, 0.36, -0.26, 0.12];
const BODY = [0.5, 0, 0.47, 0.03, 0.42, 0.055, 0.34, 0.065, 0.24, 0.1, 0.08, 0.12, -0.08, 0.11, -0.2, 0.09, -0.27, 0.075];
const TAIL = [-0.24, 0.08, -0.33, 0.09, -0.45, 0.12, -0.53, 0.14, -0.565, 0.075];
const TAIL_TIP = -0.575;
const NAPE = [0.4, 0.035, 0.34, 0.055, 0.28, 0.07];
const PERCHED = [0.42, 0, 0.39, 0.04, 0.32, 0.065, 0.22, 0.13, 0.02, 0.16, -0.22, 0.12, -0.4, 0.06, -0.52, 0.05, -0.56, 0];
const WRIST = [0.23, 0.55], SHOULDER_Y = 0.1, HEAD_PIVOT = 0.3, TAIL_PIVOT = -0.25;
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
// Q holds projected points as x, y pairs; SH flags the sharp ones (a primary's tip or notch), which a path meets with
// a straight line rather than curving past.
const Q = new Float32Array(512), SH = new Uint8Array(256);
let qn = 0;
// roll about the body's axis, the weak perspective, the heading, the page
function put(x, y, z, sharp) {
  const yr = y * P.cb + z * P.sb, zr = -y * P.sb + z * P.cb, f = P.L / (1 - P.k * zr);
  const lx = x * f, ly = yr * f;
  Q[2 * qn] = P.x + lx * P.c - ly * P.s; Q[2 * qn + 1] = P.y + lx * P.s + ly * P.c; SH[qn] = sharp ? 1 : 0; qn++;
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
// the wing from shoulder to trailing root, primaries as a tip-and-notch zigzag; reversed for the far run of a closed
// silhouette drawn round from one side to the other
function wingRun(side, reverse) {
  const pts = [];
  for (let i = 0; i < LEAD.length; i += 2) pts.push(LEAD[i], LEAD[i + 1], 0);
  for (let i = 0; i < FINGERS.length; i += 2) pts.push(FINGERS[i], FINGERS[i + 1], 1);
  for (let i = 0; i < TRAIL.length; i += 2) pts.push(TRAIL[i], TRAIL[i + 1], 0);
  const n = pts.length / 3;
  for (let j = 0; j < n; j++) { const i = reverse ? n - 1 - j : j; wingPt(side, pts[3 * i], pts[3 * i + 1], pts[3 * i + 2]); }
}
// a run of Q from a to b, open or closed: curved through the midpoints of smooth points, straight to sharp ones
function trace(ctx, a, b, closed) {
  const n = b - a, X = (i) => Q[2 * (a + ((i % n) + n) % n)], Y = (i) => Q[2 * (a + ((i % n) + n) % n) + 1], S = (i) => SH[a + ((i % n) + n) % n];
  if (closed) ctx.moveTo((X(-1) + X(0)) / 2, (Y(-1) + Y(0)) / 2); else ctx.moveTo(X(0), Y(0));
  const last = closed ? n : n - 1;
  for (let i = closed ? 0 : 1; i < last; i++) {
    if (S(i)) ctx.lineTo(X(i), Y(i)); else ctx.quadraticCurveTo(X(i), Y(i), (X(i) + X(i + 1)) / 2, (Y(i) + Y(i + 1)) / 2);
  }
  if (closed) ctx.closePath(); else ctx.lineTo(X(n - 1), Y(n - 1));
}
// The run of Q from a to qn thinned: a smooth point that lies within THIN px of the line from the last point kept to
// the next is dropped, and qn moves back by the points dropped. The curve through such a point moves by less than that
// distance, well inside the one-px line, so a small eagle is drawn through fewer points than a large one and looks the
// same. The sharp points, the fingers' tips and slots, are always kept, and so are the run's ends. A path's points are
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
const pairs = (A, f, rev, side) => { const n = A.length / 2; for (let j = 0; j < n; j++) { const i = rev ? n - 1 - j : j; f(A[2 * i], side * A[2 * i + 1], false); } };

// One eagle in flight at (x, y), heading in radians, L px long, in pose, in figure variant 0, 1 or 2; nape is a colour
// for the gold nape or null; persp the perspective factor (FLIGHT_PERSP in the scene). The caller sets strokeStyle,
// fillStyle (the paper) and lineWidth.
export function drawEagle(ctx, x, y, heading, L, pose, variant, alpha, nape, persp = PERSP) {
  poseEagle(x, y, heading, L, pose, persp);
  if (variant === 1) {
    // a stroke per wing, shoulder through wrist to the leading primary and back to the last; the body a dash; the tail
    // a shallow fan
    ctx.globalAlpha = alpha; ctx.beginPath();
    for (const side of [1, -1]) {
      qn = 0;
      for (let i = 0; i < LEAD.length; i += 2) wingPt(side, LEAD[i], LEAD[i + 1], false);
      wingPt(side, FINGERS[4], FINGERS[5], true);
      trace(ctx, 0, qn, false);
    }
    qn = 0; bodyPt(0.5, 0, true); bodyPt(-0.24, 0, true); trace(ctx, 0, 2, false);
    qn = 0; tailPt(-0.26, 0.05, true); tailPt(-0.52, 0.13, true); tailPt(TAIL_TIP, 0, false); tailPt(-0.52, -0.13, true); tailPt(-0.26, -0.05, true); trace(ctx, 0, 5, false);
    ctx.stroke();
    if (nape) { const s = ctx.strokeStyle; ctx.strokeStyle = nape; qn = 0; bodyPt(0.4, 0, true); bodyPt(0.28, 0, true); ctx.beginPath(); trace(ctx, 0, 2, false); ctx.stroke(); ctx.strokeStyle = s; }
    ctx.globalAlpha = 1; return;
  }
  if (variant === 0) {
    // parted: the tail, each wing and the body as outlines of their own, each over a paper fill, so the body's line
    // crosses the wing roots and the parts read like an engraving's
    // both wings in one path: they never overlap, and one fill and one stroke cost half of two
    qn = 0; wingRun(1, false); thin(0); const half = qn; wingRun(-1, false); thin(half);
    ctx.beginPath(); trace(ctx, 0, half, true); trace(ctx, half, qn, true); ctx.globalAlpha = 0.92; ctx.fill(); ctx.globalAlpha = alpha; ctx.stroke();
    // the body and the tail in one path over the wings, the tail's root showing as a short line across the body
    qn = 0; pairs(BODY, bodyPt, false, 1); pairs(BODY.slice(2), bodyPt, true, -1); thin(0); const body = qn;
    tailPt(TAIL[0], TAIL[1], false); pairs(TAIL.slice(2), tailPt, false, 1); tailPt(TAIL_TIP, 0, false); pairs(TAIL.slice(2), tailPt, true, -1); tailPt(TAIL[0], -TAIL[1], false); thin(body);
    ctx.beginPath(); trace(ctx, 0, body, true); trace(ctx, body, qn, true); ctx.globalAlpha = 0.92; ctx.fill(); ctx.globalAlpha = alpha; ctx.stroke();
  } else {
    // one silhouette: beak, the right side round wing and tail, the left side back
    qn = 0;
    pairs(HEAD, bodyPt, false, 1); wingRun(1, false); pairs(TAIL, tailPt, false, 1); tailPt(TAIL_TIP, 0, false);
    pairs(TAIL, tailPt, true, -1); wingRun(-1, true); pairs(HEAD.slice(2), bodyPt, true, -1);
    fillStroke(ctx, 0, qn, alpha);
  }
  if (nape) {
    qn = 0; pairs(NAPE, bodyPt, false, 1); pairs(NAPE, bodyPt, true, -1);
    const f = ctx.fillStyle; ctx.fillStyle = nape; ctx.globalAlpha = 0.85; ctx.beginPath(); trace(ctx, 0, qn, true); ctx.fill(); ctx.fillStyle = f;
  }
  ctx.globalAlpha = 1;
}
function fillStroke(ctx, a, b, alpha) { ctx.beginPath(); trace(ctx, a, b, true); ctx.globalAlpha = 0.92; ctx.fill(); ctx.globalAlpha = alpha; ctx.stroke(); }
// An eagle perched on a crag: wings folded along the back, seen from above as a narrow outline with the line where
// the wings meet down its middle.
const FLAT = { bank: 0, flap: 0, beat: 0, fan: 0 };
export function drawPerched(ctx, x, y, heading, L, alpha, nape) {
  poseEagle(x, y, heading, L, FLAT);
  qn = 0; pairs(PERCHED, bodyPt, false, 1); pairs(PERCHED.slice(2, -2), bodyPt, true, -1);
  fillStroke(ctx, 0, qn, alpha);
  qn = 0; bodyPt(0.14, 0, true); bodyPt(-0.4, 0, true); ctx.beginPath(); trace(ctx, 0, 2, false); ctx.globalAlpha = alpha * 0.7; ctx.stroke();
  if (nape) { qn = 0; pairs(NAPE, bodyPt, false, 1); pairs(NAPE, bodyPt, true, -1); const f = ctx.fillStyle; ctx.fillStyle = nape; ctx.globalAlpha = 0.85; ctx.beginPath(); trace(ctx, 0, qn, true); ctx.fill(); ctx.fillStyle = f; }
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
const near = (list, x, y, f, g) => list.some((k) => Math.hypot(x - k.x, y - k.y) < k.r * f + g);
const TOP = 110; // the header band: nothing laid above it but hachures

function layRelief(w) {
  const p = w.params, W = w.w, H = w.h, r = rng((w.seed ^ 0x6d6f756e) >>> 0);
  const R = { peaks: [], dips: [], ridge: null, waves: [], zones: [], crags: [], tarns: [], stream: null, trees: [], scree: [], strata: [], ledges: [], shelves: [], gref: 0.0025, q: [0, 0, 0, 0, 0] };
  const reach = (p.rings + 1) * p.interval;
  for (const o of w.summits) {
    // the zone: the edge's widest reach over a broad window of bearings, the rings beyond it and a margin
    const Z = new Float32Array(BEARINGS), win = BEARINGS >> 4;
    let mean = 0;
    for (let j = 0; j < BEARINGS; j++) { let m = 0; for (let d = -win; d <= win; d++) m = Math.max(m, o.C[(j + d + BEARINGS) % BEARINGS]); Z[j] = m + reach + 0.1 * o.mean; mean += Z[j]; }
    mean /= BEARINGS;
    R.zones.push({ x: o.x, y: o.y, R: Z, mean });
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
  // the spread of heights, for the treeline, the meadows and the high ground the wind streaks over; and of slopes, so
  // the steepest open ground (the 85th percentile) is the hachures' full length and the rest is read against it
  const hs = [], gs = [], sg = { x: 0, y: 0 };
  for (let i = 0; i < 600; i++) { const x = r() * W, y = TOP + r() * (H - TOP); if (inZone(R, x, y)) continue; hs.push(height(R, x, y)); slope(R, x, y, sg); gs.push(Math.hypot(sg.x, sg.y)); }
  hs.sort((a, b) => a - b); gs.sort((a, b) => a - b);
  const q = (A, f) => (A.length ? A[Math.min(A.length - 1, Math.floor(f * A.length))] : 0);
  R.q = [q(hs, 0.1), q(hs, 0.3), q(hs, 0.5), q(hs, 0.7), q(hs, 0.9)];
  R.gref = Math.max(1e-5, q(gs, 0.85));
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
// Hachures: the kit's lattice of level dashes, each turned to run downslope from the height field's gradient at its
// anchor, longer where the ground is steeper; on flat ground only a sparse share is kept. A mark's pts run from its
// upper end to its lower. None is laid in a summit's zone (the rings are drawn there), on a crag's top or in a tarn.
export const HACHURE = { pitch: 11, period: 26, dash: 8, reach: 20 };
export function hachures(w, W, H, p) {
  const R = w.relief, out = []; if (!R) return out;
  const marks = latticeMarks((w.seed ^ 0x68616368) >>> 0, W, H, HACHURE, p.density, p.jitter), sl = { x: 0, y: 0 };
  for (const m of marks) {
    const cx = (m.pts[0] + m.pts[2]) / 2, cy = m.pts[1];
    if (inZone(R, cx, cy) || near(R.crags, cx, cy, 0.62, 0) || near(R.tarns, cx, cy, 1, 5)) continue;
    slope(R, cx, cy, sl);
    const g = Math.hypot(sl.x, sl.y), steep = clamp(g / R.gref, 0, 1);
    if (g < 1e-9) continue;
    if (steep < p.flat && pointRand(hashPoint(Math.round(m.x), Math.round(m.y), 0x5a7))() > p.sparse) continue;
    // the lattice's own jitter of a dash's length carries over to the hachure's
    const L = (p.short + (p.long - p.short) * steep) * ((m.pts[2] - m.pts[0]) / Math.min(HACHURE.dash, 0.7 * HACHURE.period / Math.sqrt(p.density))), ux = -sl.x / g, uy = -sl.y / g;
    out.push({ x: m.x, y: m.y, pts: [cx - (ux * L) / 2, cy - (uy * L) / 2, cx + (ux * L) / 2, cy + (uy * L) / 2] });
  }
  return out;
}
// Everything else the static layer draws, as polylines grouped by how they are drawn.
function floorLines(w) {
  const R = w.relief, rings = [], strata = [], scree = [], trees = [], tarns = []; if (!R) return { rings, strata, scree, trees, tarns, stream: null };
  const r = rng((w.seed ^ 0x666c6f6f) >>> 0);
  for (const c of R.crags) {
    // a crag's own contours: three wavering rings round its top
    for (const f of [0.2, 0.38, 0.56]) {
      const n = 40, pts = [];
      for (let i = 0; i <= n; i++) { const a = (i / n) * TAU, k = c.r * f * (1 + 0.16 * Math.sin(2 * a + c.ph[0]) + 0.1 * Math.sin(3 * a + c.ph[1] + f * 4) + 0.05 * Math.sin(5 * a + c.ph[2])); pts.push(c.x + Math.cos(a) * k, c.y + Math.sin(a) * k); }
      rings.push(pts);
    }
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
  // the treeline: conifers on the low slopes, thinning as the ground rises toward the line
  const treeTop = R.q[2], base = R.q[0], sl = { x: 0, y: 0 };
  const S = R.stream;
  for (let y = TOP; y < w.h - 8; y += 19) for (let x = 8; x < w.w - 8; x += 19) {
    const d = pointRand(hashPoint(x, y, (w.seed ^ 0x74726565) >>> 0)), tx = x + (d() - 0.5) * 14, ty = y + (d() - 0.5) * 14, z = height(R, tx, ty);
    if (z > treeTop || inZone(R, tx, ty, 8) || near(R.crags, tx, ty, 0.75, 0) || near(R.tarns, tx, ty, 1, 7)) continue;
    const keep = 0.42 * w.params.trees * clamp(((treeTop - z) / Math.max(1e-6, treeTop - base)) * 1.6, 0, 1);
    if (d() > keep) continue;
    slope(R, tx, ty, sl); if (Math.hypot(sl.x, sl.y) / R.gref < 0.05) continue; // a dead-flat floor is meadow
    if (S) { let close = false; for (let i = 0; i < S.pts.length && !close; i += 4) close = Math.hypot(S.pts[i] - tx, S.pts[i + 1] - ty) < 7; if (close) continue; }
    const s = 2.6 + d() * 1.4, a = d() * TAU;
    for (let k = 0; k < 3; k++) { const b = a + (k * Math.PI) / 3; trees.push([tx - Math.cos(b) * s, ty - Math.sin(b) * s, tx + Math.cos(b) * s, ty + Math.sin(b) * s]); }
  }
  for (const t of R.tarns) {
    const n = 48, shore = [], inner = [];
    for (let i = 0; i <= n; i++) { const a = (i / n) * TAU, k = tarnR(t, a); shore.push(t.x + Math.cos(a) * k, t.y + Math.sin(a) * k); inner.push(t.x + Math.cos(a) * k * 0.55, t.y + Math.sin(a) * k * 0.55); }
    tarns.push({ shore, inner });
  }
  return { rings, strata, scree, trees, tarns, stream: S ? S.pts : null };
}
const polyline = (ctx, pts) => { ctx.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]); };
function smoothLine(ctx, pts) {
  const n = pts.length / 2; ctx.moveTo(pts[0], pts[1]);
  for (let i = 1; i < n - 1; i++) ctx.quadraticCurveTo(pts[2 * i], pts[2 * i + 1], (pts[2 * i] + pts[2 * i + 2]) / 2, (pts[2 * i + 1] + pts[2 * i + 3]) / 2);
  ctx.lineTo(pts[2 * n - 2], pts[2 * n - 1]);
}
function paintLayer(ctx, data, p, colours) {
  const { ink, water } = colours, f = data.floor;
  drawMarks(ctx, data.marks, ink, p.hachureAlpha);
  ctx.strokeStyle = ink; ctx.lineWidth = 1; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.globalAlpha = p.floorAlpha; ctx.beginPath(); for (const pts of f.rings) smoothLine(ctx, pts); ctx.stroke();
  ctx.globalAlpha = p.floorAlpha * 0.8; ctx.beginPath(); for (const pts of f.strata) polyline(ctx, pts); for (const pts of f.trees) polyline(ctx, pts); ctx.stroke();
  ctx.globalAlpha = p.floorAlpha * 1.2; ctx.beginPath(); for (const pts of f.scree) polyline(ctx, pts); ctx.stroke();
  ctx.strokeStyle = water; ctx.fillStyle = water;
  for (const t of f.tarns) { ctx.beginPath(); smoothLine(ctx, t.shore); ctx.globalAlpha = 0.08; ctx.fill(); ctx.globalAlpha = p.waterAlpha; ctx.stroke(); ctx.beginPath(); smoothLine(ctx, t.inner); ctx.globalAlpha = p.waterAlpha * 0.45; ctx.stroke(); }
  if (f.stream) { ctx.globalAlpha = p.waterAlpha * 0.85; ctx.beginPath(); smoothLine(ctx, f.stream); ctx.stroke(); }
  ctx.globalAlpha = 1;
}

// ----- the summits' rings -----
// Each summit's top contour is its footprint's edge, drawn smooth by the kit. Below it the rings are the level sets of
// one field over a grid anchored to the page: a node's level is its distance out past the nearer summit's edge in
// intervals, the two summits' levels joined by a soft minimum, so where two summits come close their rings neck and
// merge across a saddle as a map's do. The field is sampled only near the summits and traced by marching squares, each
// frame, so the rings follow the outlines as the edge does; the grid never moves, so a ring moves only as its field
// does and nothing pops. Each crossing lies on one edge of the grid, named by its index, so the cells' segments are
// chained end to end through the edges they share into whole contours, which are drawn curved through their points'
// midpoints: a few long paths rather than thousands of loose segments, which cost the GPU process ten times as much.
let GV = new Float32Array(0);
let SP = new Float32Array(8192), SE = new Int32Array(4096), SL = new Uint8Array(2048), sn = 0;
let EA = new Int32Array(0), EB = new Int32Array(0), ES = new Int32Array(0), USED = new Uint8Array(2048), stamp = 0;
let CH = new Float32Array(4096);
// the contours of the last ringField: { start, n, closed, level } over CH's x, y pairs
export const RINGS = { chains: [], pts: CH };
function seg(x0, y0, e0, x1, y1, e1, lev) {
  if (sn * 4 + 4 > SP.length) { const a = new Float32Array(SP.length * 2); a.set(SP); SP = a; const b = new Int32Array(SE.length * 2); b.set(SE); SE = b; const c = new Uint8Array(SL.length * 2); c.set(SL); SL = c; }
  SP[4 * sn] = x0; SP[4 * sn + 1] = y0; SP[4 * sn + 2] = x1; SP[4 * sn + 3] = y1; SE[2 * sn] = e0; SE[2 * sn + 1] = e1; SL[sn] = lev; sn++;
}
export function ringField(w) {
  const p = w.params, S = w.summits, cell = Math.max(3, p.cell), top = Math.max(0, Math.min(250, Math.round(p.rings)));
  sn = 0; RINGS.chains.length = 0;
  if (!S.length || !top) return RINGS;
  const reach = (top + 1.5) * p.interval, boxes = [];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const o of S) {
    let m = 0, n = Infinity; for (let j = 0; j < BEARINGS; j++) { m = Math.max(m, o.C[j]); n = Math.min(n, o.C[j]); }
    const b = [o.x - m - reach, o.y - m - reach, o.x + m + reach, o.y + m + reach, m, n]; boxes.push(b);
    x0 = Math.min(x0, b[0]); y0 = Math.min(y0, b[1]); x1 = Math.max(x1, b[2]); y1 = Math.max(y1, b[3]);
  }
  const gx = Math.floor(x0 / cell), gy = Math.floor(y0 / cell), nx = Math.ceil(x1 / cell) - gx + 1, ny = Math.ceil(y1 / cell) - gy + 1;
  if (GV.length < nx * ny) GV = new Float32Array(Math.ceil(nx * ny * 1.25));
  const k = Math.max(1e-3, p.saddle), iv = 1 / p.interval, far = top + 2, BN = BEARINGS / TAU;
  for (let j = 0; j < ny; j++) {
    const y = (gy + j) * cell;
    for (let i = 0; i < nx; i++) {
      const x = (gx + i) * cell;
      let a = far, b = far;
      for (let s = 0; s < S.length; s++) {
        const B = boxes[s]; if (x < B[0] || x > B[2] || y < B[1] || y > B[3]) continue;
        const o = S[s], dx = x - o.x, dy = y - o.y, d = Math.sqrt(dx * dx + dy * dy);
        // bounds first: past the farthest ring, or a node no ring of this summit can lie beyond, needs no bearing
        const lo = (d - B[4]) * iv; if (lo > far || lo > b + k) continue;
        if ((d - B[5]) * iv < 0.5) { const l = (d - B[5]) * iv; if (l < a) { b = a; a = l; } else if (l < b) b = l; continue; }
        // the edge at this bearing, read from the footprint's table between bins
        let u = fastAtan2(dy, dx) * BN; if (u < 0) u += BEARINGS;
        const i0 = u | 0, f = u - i0, C = o.C, e0 = C[i0 % BEARINGS], R = e0 + (C[(i0 + 1) % BEARINGS] - e0) * f;
        const l = (d - R) * iv;
        if (l < a) { b = a; a = l; } else if (l < b) b = l;
      }
      // the polynomial soft minimum: the plain minimum where the two differ by k or more
      const h = Math.max(0, k - (b - a)) / k;
      GV[j * nx + i] = a - h * h * k * 0.25;
    }
  }
  const per = 2 * nx * ny;
  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const v0 = GV[j * nx + i], v1 = GV[j * nx + i + 1], v2 = GV[(j + 1) * nx + i + 1], v3 = GV[(j + 1) * nx + i];
      const lo = Math.min(v0, v1, v2, v3), hi = Math.max(v0, v1, v2, v3);
      let m = Math.max(1, Math.ceil(lo)); const mt = Math.min(top, Math.floor(hi));
      if (m > mt) continue;
      const X = (gx + i) * cell, Y = (gy + j) * cell;
      for (; m <= mt; m++) {
        // the cell's four edges at this level: top, bottom, left, right
        const base = (m - 1) * per, eT = base + 2 * (j * nx + i), eB = base + 2 * ((j + 1) * nx + i), eL = eT + 1, eR = base + 2 * (j * nx + i + 1) + 1;
        march(X, Y, cell, v0 - m, v1 - m, v2 - m, v3 - m, eT, eR, eB, eL, m);
      }
    }
  }
  chain(top * per);
  return RINGS;
}
// The segments chained into contours through the grid edges they share: each edge holds at most two segments, the
// two cells either side of it. A walk from a segment runs forward through its end edge and back through its start,
// and a contour that comes round to where it began is closed.
function chain(edges) {
  if (ES.length < edges) { ES = new Int32Array(Math.ceil(edges * 1.25)); EA = new Int32Array(ES.length); EB = new Int32Array(ES.length); stamp = 0; }
  if (USED.length < sn) USED = new Uint8Array(sn * 2);
  stamp++;
  const reg = (e, s) => { if (ES[e] !== stamp) { ES[e] = stamp; EA[e] = s; EB[e] = -1; } else EB[e] = s; };
  for (let s = 0; s < sn; s++) { reg(SE[2 * s], s); reg(SE[2 * s + 1], s); USED[s] = 0; }
  const other = (e, s) => (EA[e] === s ? EB[e] : EA[e]);
  let n = 0;
  const put = (x, y) => { if (2 * n + 2 > CH.length) { const a = new Float32Array(CH.length * 2); a.set(CH); CH = a; RINGS.pts = CH; } CH[2 * n] = x; CH[2 * n + 1] = y; n++; };
  for (let s0 = 0; s0 < sn; s0++) {
    if (USED[s0]) continue;
    USED[s0] = 1;
    // back from the start edge first, into a run that is then reversed in place, so the contour reads in order
    const start = n;
    let cur = s0, e = SE[2 * s0], closed = false;
    for (;;) {
      const nx = other(e, cur); if (nx < 0) break; if (USED[nx]) { closed = nx === s0; break; }
      USED[nx] = 1;
      if (SE[2 * nx] === e) { put(SP[4 * nx + 2], SP[4 * nx + 3]); e = SE[2 * nx + 1]; } else { put(SP[4 * nx], SP[4 * nx + 1]); e = SE[2 * nx]; }
      cur = nx;
    }
    for (let a = start, b = n - 1; a < b; a++, b--) { const x = CH[2 * a], y = CH[2 * a + 1]; CH[2 * a] = CH[2 * b]; CH[2 * a + 1] = CH[2 * b + 1]; CH[2 * b] = x; CH[2 * b + 1] = y; }
    put(SP[4 * s0], SP[4 * s0 + 1]); put(SP[4 * s0 + 2], SP[4 * s0 + 3]);
    cur = s0; e = SE[2 * s0 + 1];
    for (;;) {
      const nx = other(e, cur); if (nx < 0) break; if (USED[nx]) { closed = closed || nx === s0; break; }
      USED[nx] = 1;
      if (SE[2 * nx] === e) { put(SP[4 * nx + 2], SP[4 * nx + 3]); e = SE[2 * nx + 1]; } else { put(SP[4 * nx], SP[4 * nx + 1]); e = SE[2 * nx]; }
      cur = nx;
    }
    if (closed) n--; // the last point is the first again
    RINGS.chains.push({ start, n: n - start, closed, level: SL[s0] });
  }
}
// strokes the contours whose level passes keep, each curved through its points' midpoints
function drawRings(ctx, keep, cell) {
  const P = RINGS.pts, every = Math.max(1, Math.round(24 / cell));
  ctx.beginPath();
  for (const c of RINGS.chains) {
    if (!keep(c.level) || c.n < 2) continue;
    // a long contour is curved through crossings about 24 px apart: the curve stays smooth and costs far fewer verbs
    const k = c.n > 8 * every ? every : 1, X = (i) => P[2 * (c.start + i * k)], Y = (i) => P[2 * (c.start + i * k) + 1], n = Math.floor(c.n / k);
    if (c.closed) {
      ctx.moveTo((X(n - 1) + X(0)) / 2, (Y(n - 1) + Y(0)) / 2);
      for (let i = 0; i < n; i++) { const j = (i + 1) % n; ctx.quadraticCurveTo(X(i), Y(i), (X(i) + X(j)) / 2, (Y(i) + Y(j)) / 2); }
    } else {
      ctx.moveTo(X(0), Y(0));
      for (let i = 1; i < n - 1; i++) ctx.quadraticCurveTo(X(i), Y(i), (X(i) + X(i + 1)) / 2, (Y(i) + Y(i + 1)) / 2);
      ctx.lineTo(X(n - 1), Y(n - 1));
    }
  }
  ctx.stroke();
}
// atan2 within about 0.004 rad, which at the edge's table resolution (one bin is 0.065 rad) moves nothing that shows
function fastAtan2(y, x) {
  const ax = Math.abs(x), ay = Math.abs(y), mx = Math.max(ax, ay);
  if (mx === 0) return 0;
  const t = Math.min(ax, ay) / mx, s = t * t;
  let r = ((-0.0464964749 * s + 0.15931422) * s - 0.327622764) * s * t + t;
  if (ay > ax) r = 1.57079637 - r;
  if (x < 0) r = 3.14159274 - r;
  return y < 0 ? -r : r;
}
// one cell of marching squares at a level: corners 0 (x, y), 1 (x + c, y), 2 (x + c, y + c), 3 (x, y + c), values
// already less the level; eT, eR, eB, eL name the cell's top, right, bottom and left edges at this level
function march(x, y, c, a, b, d, e, eT, eR, eB, eL, lev) {
  const code = (a > 0 ? 1 : 0) | (b > 0 ? 2 : 0) | (d > 0 ? 4 : 0) | (e > 0 ? 8 : 0);
  if (code === 0 || code === 15) return;
  // where the level crosses each side: top (0-1), right (1-2), bottom (3-2), left (0-3)
  const tx = a !== b ? x + (c * a) / (a - b) : x, ry = b !== d ? y + (c * b) / (b - d) : y;
  const bx = e !== d ? x + (c * e) / (e - d) : x, ly = a !== e ? y + (c * a) / (a - e) : y, X = x + c, Y = y + c;
  switch (code) {
    case 1: case 14: seg(x, ly, eL, tx, y, eT, lev); break;
    case 2: case 13: seg(tx, y, eT, X, ry, eR, lev); break;
    case 3: case 12: seg(x, ly, eL, X, ry, eR, lev); break;
    case 4: case 11: seg(X, ry, eR, bx, Y, eB, lev); break;
    case 6: case 9: seg(tx, y, eT, bx, Y, eB, lev); break;
    case 7: case 8: seg(x, ly, eL, bx, Y, eB, lev); break;
    default: {
      // a saddle cell: the centre's value says which pair of corners the level parts
      const up = ((a + b + d + e) / 4 > 0) === (code === 5);
      if (up) { seg(x, ly, eL, bx, Y, eB, lev); seg(tx, y, eT, X, ry, eR, lev); } else { seg(x, ly, eL, tx, y, eT, lev); seg(X, ry, eR, bx, Y, eB, lev); }
    }
  }
}

// ----- the world -----
const SOARING = new Set(['glide', 'circle', 'ridge']), COVER = new Set(['toss', 'cover', 'hide', 'perch']);
export const soaring = (e) => SOARING.has(e.mode), inCover = (e) => COVER.has(e.mode);
const eagleTarget = (w) => Math.max(0, Math.round(w.coarse ? w.params.countTouch : w.params.count));
const goldTarget = (w) => Math.max(0, Math.round(w.coarse ? w.params.goldenTouch : w.params.golden));
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
  const p = w.params, key = `${Math.round(w.w)} ${Math.round(w.h)} ${w.boxes.map((b) => [b.x, b.y, b.w, b.h].map((v) => Math.round(v / 24)).join(',')).join(';')} ${w.coarse ? p.cragsTouch : p.crags} ${p.tarns} ${p.trees} ${p.rings} ${p.interval} ${w.coarse ? p.flowersTouch : p.flowers}`;
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
  const g = goldTarget(w);
  w.eagles.forEach((e, i) => { e.gold = i < g; });
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
    cover: null, perch: null, fixed: null, gold: false, wander: 0,
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
function peel(w, e) { e.lift = null; e.mode = 'glide'; e.wander = 0; w.peels++; }
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
    // the occasional flap series: on a whim on the glide, when low, on leaving cover
    if (e.flapFor <= 0 && ((e.mode === 'glide' && r() < p.flaps * dt) || (e.alt < 0.05 && e.mode === 'glide'))) e.flapFor = 0.8 + 1.2 * r();
    e.flapFor -= dt;
    const beatTo = e.flapFor > 0 ? 1 : 0;
    e.beat += clamp(beatTo - e.beat, -dt * 3, dt * 3);
    if (e.beat > 0.01 || e.flapFor > 0) e.flap = (e.flap + dt * 3.1) % 1;
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
// a band: the summits lighten toward their tops in a flat band of paper, as a map's layer tints do (one band: each is
// a large fill a frame)
const BANDS = [[3, 0.3]];
export function drawGround(ctx, w, colours, layer = { img: null, w: 0, h: 0, flat: colours.paper }) {
  const p = w.params, still = w.reduced, { ink, paper, water } = colours;
  ctx.globalAlpha = 1;
  if (!layer.img || layer.w < w.w || layer.h < w.h) { ctx.fillStyle = layer.flat; ctx.fillRect(0, 0, w.w, w.h); }
  if (layer.img) { ctx.imageSmoothingEnabled = true; ctx.drawImage(layer.img, 0, 0, layer.w, layer.h); }
  ctx.fillStyle = paper;
  for (const o of w.summits) {
    for (const [k, a] of BANDS) { if (k > p.rings) continue; ctx.globalAlpha = p.bands * a; edgePath(ctx, o, k * p.interval); ctx.fill(); }
    ctx.globalAlpha = 1; edgePath(ctx, o, 0); ctx.fill();
  }
  ctx.strokeStyle = ink; ctx.lineWidth = 1; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  // the rings, the index contours half again as strong, and each summit's top contour
  // (the rings: traced and chained afresh each frame, the fifth an index contour half again as strong)
  ringField(w);
  ctx.globalAlpha = p.ringAlpha; drawRings(ctx, (m) => m % 5 !== 0, p.cell);
  ctx.globalAlpha = Math.min(1, p.ringAlpha * 1.6); drawRings(ctx, (m) => m % 5 === 0, p.cell);
  ctx.globalAlpha = p.topAlpha; for (const o of w.summits) { edgePath(ctx, o, 0); ctx.stroke(); }
  // the ridgeline from top to top, drawn as a map draws a crest: no line, only short hachures falling away from it on
  // both sides, staggered, longest midway where the saddle is steepest across
  if (w.summits.length >= 2 && p.ridgeAlpha > 0) {
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
  const p = w.params, { ink, paper, gold } = colours;
  ctx.strokeStyle = ink; ctx.fillStyle = paper; ctx.lineWidth = p.width; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  // goats on their ledges
  ctx.globalAlpha = Math.min(1, p.alpha * 1.1);
  for (const g of w.goats) drawGoat(ctx, g);
  if (p.study) { drawStudy(ctx, w, colours); return; }
  // perched eagles, then the flying ones from the lowest to the highest, then the clouds over them
  const v = Math.round(p.variant), O = w.order; O.length = 0;
  for (const e of w.eagles) if (e.mode === 'perch') drawPerched(ctx, e.x, e.y, e.h, p.length * 0.72, p.alpha, e.gold ? gold : null); else O.push(e);
  O.sort((a, b) => a.alt - b.alt);
  // one at a time, lowest first, so the higher reads over the lower. (Every uncrossed eagle in one shared fill and
  // stroke was tried: one large self-overlapping path cost the GPU process half again what 36 small ones do.)
  for (const e of O) drawEagle(ctx, e.x, e.y, e.h, p.length * sizeAt(e.alt), e, v, p.alpha, e.gold ? gold : null, FLIGHT_PERSP);
  // the clouds, over everything that flies under them
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
  drawEagle(ctx, w.w / 2, w.h / 2, p.heading * DEG, L, { bank: p.bank * DEG, flap: p.flap, beat: p.beat, fan: p.fan }, Math.round(p.variant), Math.max(p.alpha, 0.7), colours.gold);
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
  // the relief: made anew for a new plan or hachure setting; repainted for a new candidate or alpha
  layer: {
    key: (w, p) => `${w.seed} ${w.plan} ${p.density} ${p.jitter} ${p.short} ${p.long} ${p.flat} ${p.sparse}`,
    make: (w, p, W, H) => ({ marks: hachures(w, W, H, p), floor: floorLines(w) }),
    look: (p) => `${pickCandidate(p)} ${p.hachureAlpha} ${p.floorAlpha} ${p.waterAlpha}`,
    paint: paintLayer,
  },
  drawGround, drawLive,
};
