// Home prairie: the page seen from above as open grassland, with the two home objects standing on bare knolls. A herd
// of horses grazes between them in bands that part and come back together behind a lead mare, a few of them pintos
// with chestnut patches and a few foals keeping to their mothers; they walk from one grazing spot to the next along
// worn trails, trot to catch up, and gallop for the trees when a fast cursor spooks them, then settle under the
// canopies and drift back out to graze. Wind runs over the grass in gusts that lay the blades over as they pass,
// tumbleweeds roll before it, wildflowers open through the visit, hares sit by their burrows and bolt from the cursor,
// and a press or a drag scatters apples the horses come to eat. The layer sits behind reading text, so the resting
// picture is calm: most of the herd has its head down most of the time.
//
// The simulation is kept apart from the drawing. createWorld() builds a state and step() advances it by dt with the
// world's own seeded random source, touching nothing else, so a seed fixes a run and tools/check-prairie.mjs drives it
// headless. The knolls are the kit's footprints (scenes/kit.js); `scene` at the foot of the file is the descriptor the
// kit's shell mounts, and the contract it fills is the head of scenes/kit.js.
import {
  FOOTPRINT, GROUND, rng, TAU, wrapAngle, pointRand, placeFootprints, updateFootprint,
  edgeR, edgeGap, onEdge, edgeNormal, footprintAt, edgePath, pointer, pointTo, pointerSpeed, strokeOpen, strokeAlong, strokeClose,
  latticeMarks, curveThrough,
} from './kit.js';

// Parameters by section: [default, min, max, step, label] or [value, 'toggle', label].
export const PARAMS = {
  herd: {
    count: [36, 1, 90, 1, 'horses on a fine pointer'],
    countTouch: [16, 1, 90, 1, 'horses on a coarse pointer'],
    foals: [4, 0, 12, 1, 'foals among them on a fine pointer'],
    foalsTouch: [2, 0, 12, 1, 'foals on a coarse pointer'],
    pintos: [6, 0, 24, 1, 'pintos, the horses with chestnut patches, on a fine pointer'],
    pintosTouch: [3, 0, 24, 1, 'pintos on a coarse pointer'],
    spacing: [1.5, 0.8, 4, 0.05, 'room a grazing horse keeps from the next, body lengths'],
    keep: [24, 4, 120, 1, 'mean time a band grazes one spot before the mare moves on, s'],
    roam: [240, 60, 600, 10, 'how far the mare leads to the next spot, px'],
    split: [55, 10, 300, 5, 'mean time between one band parting in two, s'],
    rejoin: [28, 5, 120, 1, 'mean time a band that parted stays apart, s'],
    trail: [0.8, 0, 3, 0.05, 'pull of a worn trail on a walking horse'],
  },
  gait: {
    size: [18, 8, 40, 1, 'body length, rump to chest, px'],
    walk: [0.9, 0.2, 3, 0.05, 'walking speed, body lengths per s'],
    trot: [2.2, 0.5, 6, 0.05, 'trotting speed, body lengths per s'],
    gallop: [5.5, 1, 12, 0.1, 'galloping speed, body lengths per s'],
    turn: [2.2, 0.2, 8, 0.1, 'turn rate at a walk, rad/s'],
    figure: [0, 0, 2, 1, 'figure: 0 silhouette, 1 parts, 2 gesture'],
    alpha: [0.55, 0.05, 1, 0.01, 'ink opacity'],
    width: [1, 0.3, 3, 0.05, 'line width, px'],
  },
  study: {
    study: [0, 'toggle', 'pose study: one horse at large scale over the page'],
    sheet: [0, 'toggle', 'study sheet: every gait at eight phases instead of one horse'],
    studyGait: [1, 0, 3, 0.05, 'gait: 0 graze, 1 walk, 2 trot, 3 gallop'],
    studyPhase: [0, 0, 1, 0.01, 'stride phase'],
    studyRun: [1, 'toggle', 'run the stride at the gait\'s own pace'],
    studyTurn: [0, -1.5, 1.5, 0.05, 'turn, rad per body length'],
    studyScale: [8, 2, 12, 0.5, 'scale of the study over the herd\'s'],
    studyPinto: [0, 'toggle', 'study a pinto'],
  },
  knolls: {
    ...FOOTPRINT,
    shore: [10, 0, 60, 1, 'gap a horse keeps from a knoll, px'],
    look: [60, 0, 300, 5, 'distance at which a horse starts to steer round, px'],
    edge: [50, 0, 300, 5, 'screen margin where horses turn back, px'],
    thin: [40, 0, 120, 1, 'width of the bands where the grass thins toward a knoll, px'],
    worn: [0.22, 0, 1, 0.01, 'opacity of the trampled ring round a knoll'],
    edgeAlpha: [0.2, 0, 1, 0.01, 'opacity of a knoll\'s edge'],
    palette: [0, 0, 2, 1, 'ground tint: 0 straw, 1 wheat, 2 ochre'],
    straw: [0.07, 0, 0.4, 0.005, 'how far the grass is taken from the page toward its tint'],
    ...GROUND,
  },
  grass: {
    grassDensity: [1, 0, 3, 0.05, 'how close the blades are laid, ticks per area x this'],
    grassJitter: [0.6, 0, 1, 0.05, 'how loosely the blades are laid, 0 a strict lattice'],
    grassAlpha: [0.2, 0, 1, 0.01, 'opacity of the grass'],
    blade: [3.2, 1, 10, 0.1, 'length of a standing blade seen from above, px'],
  },
  wind: {
    gustEvery: [6, 1, 30, 0.5, 'mean time between gusts, s'],
    gustSpeed: [150, 20, 600, 10, 'speed a gust runs over the grass, px/s'],
    gustWidth: [150, 40, 500, 10, 'width of a gust\'s front, px'],
    lean: [1, 0, 2, 0.05, 'how far a gust lays the grass over'],
    dust: [0.3, 0, 1, 0.01, 'opacity of the dust behind a gallop'],
  },
  feed: {
    sense: [320, 0, 900, 10, 'how far a horse notices an apple, px'],
    eat: [3, 0.5, 15, 0.5, 'time one horse takes over an apple, s'],
    last: [45, 5, 300, 5, 'seconds before an uneaten apple is gone'],
    max: [30, 1, 90, 1, 'apples down at once; the oldest goes first'],
    gap: [26, 4, 200, 1, 'gap between apples dropped along a drag, px'],
    startle: [800, 100, 4000, 50, 'cursor speed that spooks, px/s'],
    scare: [150, 0, 500, 5, 'spook radius, px'],
    alarm: [90, 0, 300, 5, 'how far a spooked horse spooks the next, px'],
    calm: [7, 1, 30, 0.5, 'time a spooked horse takes to settle, s'],
  },
  land: {
    groves: [3, 0, 6, 1, 'stands of trees on a fine pointer'],
    grovesTouch: [2, 0, 6, 1, 'stands of trees on a coarse pointer'],
    boulders: [6, 0, 16, 1, 'boulders on a fine pointer'],
    bouldersTouch: [3, 0, 16, 1, 'boulders on a coarse pointer'],
    waterhole: [1, 'toggle', 'a waterhole'],
    creek: [1, 'toggle', 'a dry creek bed'],
    landAlpha: [0.24, 0, 1, 0.01, 'opacity of trails, the creek and the waterhole\'s rings'],
    canopy: [0.4, 0, 1, 0.01, 'opacity of a canopy\'s outline'],
    shade: [0.86, 0, 1, 0.01, 'how fully a canopy hides what is under it'],
  },
  life: {
    hares: [4, 0, 12, 1, 'hares on a fine pointer'],
    haresTouch: [2, 0, 12, 1, 'hares on a coarse pointer'],
    bolt: [90, 10, 300, 5, 'how near the cursor comes before a hare bolts, px'],
    drifts: [4, 0, 10, 1, 'drifts of wildflowers on a fine pointer'],
    driftsTouch: [3, 0, 10, 1, 'drifts on a coarse pointer'],
    bloom: [150, 10, 900, 10, 'time over which the flowers open, s'],
    weeds: [2, 0, 8, 1, 'tumbleweeds'],
    floraAlpha: [0.5, 0, 1, 0.01, 'opacity of the flowers'],
  },
};

// ----- the prairie's colour -----
// The grass is the page taken a little toward a warm straw; a dark page toward a dark warm olive. Three candidates,
// picked live by params.palette; the light targets sit so the grass reads faintly yellow beside the pond's water at the
// same depth, never as a yellow page.
export const CANDIDATES = [
  { name: 'straw', light: [176, 142, 46], dark: [46, 40, 14] },
  { name: 'wheat', light: [168, 128, 70], dark: [42, 34, 20] },
  { name: 'ochre', light: [184, 124, 30], dark: [50, 36, 10] },
];
export const PALETTE = {
  pick: 0,
  get light() { return CANDIDATES[this.pick].light; },
  get dark() { return CANDIDATES[this.pick].dark; },
  depth: 'straw',
  accents: { ochre: '#b08a3e', chestnut: '#94532e' },
};
const pickPalette = (p) => { PALETTE.pick = Math.max(0, Math.min(CANDIDATES.length - 1, Math.round(p.palette) || 0)); };

// ----- the horse, seen from straight above -----
// A horse is posed on its own frame: x forward along the spine (the nose at +), y to its right, one unit the barrel's
// length from rump to chest. Its spine bends with the turn: the barrel by `bend` radians per unit, the neck by half again
// that, so a turning horse leads with its head. A point (u, v) of the frame is put on the page by walking u along the
// bent spine from the barrel's middle and v along the normal there.
//
// The gait sets the legs. Each leg has a phase in its stride: in stance the hoof is on the ground and travels back
// under the body from +reach to -reach; in swing it lifts, folds in toward its root and swings forward again. From
// above most of a leg is hidden under the body: what reads is a fore hoof reaching past the chest beside the neck and
// a hind hoof trailing past the rump, and how often and how far they do. GAITS lists, for graze, walk, trot and
// gallop: the phase offset of each leg (left hind, left fore, right hind, right fore), the share of the cycle a hoof
// stands, the reach, the body lengths covered per stride, how far the neck carries the head, how long the head reads
// from above (a head held high or down is foreshortened), the spine's flex, the head's nod, the tail's length and the
// mane's stream. A gait between two of them is the blend of both.
export const GAITS = [
  // graze: a slow lateral step now and then, head down at the grass, tail swishing
  { name: 'graze', off: [0, 0.25, 0.5, 0.75], duty: 0.75, reach: 0.16, stride: 0.5, neck: 0.3, head: 0.24, flex: 0, nod: 0, tail: 0.16, mane: 0 },
  // walk: four beats, lateral sequence, the head nodding with each fore step
  { name: 'walk', off: [0, 0.25, 0.5, 0.75], duty: 0.62, reach: 0.25, stride: 0.75, neck: 0.34, head: 0.32, flex: 0, nod: 0.035, tail: 0.18, mane: 0.1 },
  // trot: two beats, diagonal pairs, the head steady
  { name: 'trot', off: [0, 0.5, 0.5, 1], duty: 0.45, reach: 0.31, stride: 1.05, neck: 0.37, head: 0.33, flex: 0.012, nod: 0.01, tail: 0.28, mane: 0.45 },
  // gallop: transverse, the hinds then the fores, a moment in the air; the neck pumps and the spine flexes
  { name: 'gallop', off: [0, 0.62, 0.12, 0.5], duty: 0.3, reach: 0.42, stride: 1.7, neck: 0.44, head: 0.36, flex: 0.05, nod: 0.05, tail: 0.46, mane: 1 },
];
const GAIT_KEYS = ['duty', 'reach', 'stride', 'neck', 'head', 'flex', 'nod', 'tail', 'mane'];
// [along the spine, side] of each leg's root: left hind, left fore, right hind, right fore
// the neck leaves the shoulders at NB along the spine; past it the spine bends half again as hard
const NB = 0.4;
const LEGS = [[-0.38, -1], [0.32, -1], [-0.38, 1], [0.32, 1]];
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (t) => t * t * (3 - 2 * t);
// the blend of the two gaits either side of g (0 graze .. 3 gallop), written into out
export function gaitAt(g, out = {}) {
  const i = clamp(Math.floor(g), 0, 2), t = clamp(g - i, 0, 1), A = GAITS[i], B = GAITS[i + 1];
  for (const k of GAIT_KEYS) out[k] = lerp(A[k], B[k], t);
  if (!out.off) out.off = [0, 0, 0, 0];
  for (let j = 0; j < 4; j++) out.off[j] = lerp(A.off[j], B.off[j], t);
  return out;
}
// The frame of one draw, filled by poseHorse and read by the figures.
const P = { G: {}, hx: 0, hy: 0, ca: 1, sa: 0, s: 1, bend: 0, neck: 0, head: 0, flex: 1, hoof: new Float32Array(8), lift: new Float32Array(4) };
const PT = { x: 0, y: 0 };
// a circular arc of curvature k, d along: [x, y, heading] from its start
const ARC = [0, 0, 0];
function arc(k, d) { if (Math.abs(k) < 1e-6) { ARC[0] = d; ARC[1] = 0; ARC[2] = 0; } else { ARC[0] = Math.sin(k * d) / k; ARC[1] = (1 - Math.cos(k * d)) / k; ARC[2] = k * d; } return ARC; }
// the page point of frame (u, v), into PT
function at(u, v) {
  const k = P.bend, w = NB;
  let px, py, th;
  if (u <= w) { arc(k, u); px = ARC[0]; py = ARC[1]; th = ARC[2]; }
  else {
    arc(k, w); const x0 = ARC[0], y0 = ARC[1], t0 = ARC[2]; arc(1.5 * k, u - w);
    const c = Math.cos(t0), s = Math.sin(t0); px = x0 + c * ARC[0] - s * ARC[1]; py = y0 + s * ARC[0] + c * ARC[1]; th = t0 + ARC[2];
  }
  const lx = (px - Math.sin(th) * v) * P.s, ly = (py + Math.cos(th) * v) * P.s;
  PT.x = P.hx + P.ca * lx - P.sa * ly; PT.y = P.hy + P.sa * lx + P.ca * ly; return PT;
}
// A horse's draw state: { x, y, a (heading), bend (rad per unit), g (gait 0..3), ph (stride phase 0..1), t (its own
// clock, s), side (+-1, the side its mane falls), seed, pinto (0 or a patch seed), size (px per unit) }.
export function poseHorse(h) {
  const G = gaitAt(h.g, P.G);
  P.hx = h.x; P.hy = h.y; P.ca = Math.cos(h.a); P.sa = Math.sin(h.a); P.s = h.size; P.bend = h.bend;
  P.flex = 1 + G.flex * Math.sin(h.ph * TAU);
  P.neck = G.neck + G.nod * Math.sin(h.ph * TAU * 2 + 0.6);
  P.head = G.head;
  for (let j = 0; j < 4; j++) {
    let u = (h.ph + G.off[j]) % 1; if (u < 0) u += 1;
    let d, lift;
    if (u < G.duty) { d = G.reach * (1 - 2 * (u / G.duty)); lift = 0; }
    else { const q = (u - G.duty) / (1 - G.duty); d = G.reach * (-1 + 2 * smooth(q)); lift = Math.sin(Math.PI * q); }
    const [ru, side] = LEGS[j];
    // a lifted leg folds: the hoof draws in toward its root, a fore more than a hind (the knee folds back)
    const fold = 1 - lift * (ru > 0 ? 0.55 : 0.35);
    P.hoof[2 * j] = ru * P.flex + d * fold;
    P.hoof[2 * j + 1] = side * (ru > 0 ? 0.15 : 0.15) + side * 0.025 * lift;
    P.lift[j] = lift;
  }
  return P;
}
// The nose's distance ahead of the barrel's middle, in body units, for a gait: what a horse must keep clear ahead.
export const noseReach = (g) => { const G = gaitAt(g, NR); return NB + G.neck + G.head; };
const NR = {};

// The silhouette's half width along the frame, as [u, half width] stations: the rump rounding off at the tail's root,
// the hips, the barrel, the shoulders narrowing into the chest; then the neck (stretched over P.neck) and the head
// (over P.head), its cheeks wider than its muzzle. The barrel's stations stretch with the gallop's flex.
// The rump starts in the notch where the tail leaves it and swells back and out into the two round lobes of the
// hindquarters, so the rear reads blunt (a fish's tapers to a point). The neck leaves the chest as a narrow column, and
// the head is set off from it by the throat, wider at the jowls than the neck and rounding off at the muzzle.
const BODY = [[-0.52, 0.03], [-0.555, 0.09], [-0.545, 0.15], [-0.5, 0.188], [-0.42, 0.2], [-0.3, 0.19], [-0.18, 0.182], [-0.04, 0.2], [0.1, 0.198], [0.22, 0.17], [0.32, 0.14], [0.4, 0.105]];
const NECK = [[0.15, 0.078], [0.6, 0.066], [0.97, 0.05]];
const HEAD = [[0.1, 0.085], [0.3, 0.08], [0.6, 0.056], [0.86, 0.05], [0.97, 0.04], [1, 0.02]];
const ST = new Float32Array(64), SX = new Float32Array(64), SY = new Float32Array(64);
function stations() {
  let n = 0;
  for (const [u, w] of BODY) { ST[n++] = u * P.flex; ST[n++] = w; }
  const n0 = NB * P.flex;
  for (const [f, w] of NECK) { ST[n++] = n0 + f * P.neck; ST[n++] = w; }
  const h0 = n0 + P.neck;
  for (const [f, w] of HEAD) { ST[n++] = h0 + f * P.head; ST[n++] = w; }
  return n >> 1;
}
function closedCurve(ctx, X, Y, n) {
  ctx.moveTo((X[n - 1] + X[0]) / 2, (Y[n - 1] + Y[0]) / 2);
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; ctx.quadraticCurveTo(X[i], Y[i], (X[i] + X[j]) / 2, (Y[i] + Y[j]) / 2); }
  ctx.closePath();
}
// a closed smooth path round the silhouette: down the right side from rump to nose and back up the left
function silhouette(ctx) {
  const m = stations(); let k = 0;
  for (let i = 0; i < m; i++) { at(ST[2 * i], ST[2 * i + 1]); SX[k] = PT.x; SY[k] = PT.y; k++; }
  for (let i = m - 2; i >= 1; i--) { at(ST[2 * i], -ST[2 * i + 1]); SX[k] = PT.x; SY[k] = PT.y; k++; }
  closedCurve(ctx, SX, SY, k);
}
const seg = (ctx, u0, v0, u1, v1) => { at(u0, v0); ctx.moveTo(PT.x, PT.y); at(u1, v1); ctx.lineTo(PT.x, PT.y); };
// the legs, root to hoof; out roots them at the body's edge (the gesture has no body to hide the roots)
function legs(ctx, out) {
  for (let j = 0; j < 4; j++) { const [ru, side] = LEGS[j]; seg(ctx, ru * P.flex, side * (out ? 0.16 : 0.09), P.hoof[2 * j], P.hoof[2 * j + 1]); }
}
// The mane: the crest, a line from the withers to the poll a little to the side the mane falls, and at speed a few
// strands lifting off it and streaming back.
function mane(ctx, side, t) {
  const m = P.G.mane, n0 = 0.3 * P.flex, n1 = NB * P.flex + P.neck - 0.01, off = side * 0.022;
  at(n0, off * 0.5); ctx.moveTo(PT.x, PT.y);
  for (let i = 1; i <= 6; i++) { const u = lerp(n0, n1, i / 6); at(u, off + Math.sin(t * 9 + i) * 0.006 * m); ctx.lineTo(PT.x, PT.y); }
  if (m > 0.2) for (let i = 0; i < 4; i++) {
    const u = lerp(n0 + 0.1, n1, i / 3), w = Math.sin(t * 15 + i * 1.7) * 0.02;
    seg(ctx, u, off, u - 0.07 * m, off + side * 0.035 * m + w);
  }
}
// the ears: two ticks at the poll, pricked forward and out; the forelock between them
function ears(ctx) {
  const u = NB * P.flex + P.neck + 0.015;
  seg(ctx, u, 0.04, u + 0.075, 0.085); seg(ctx, u, -0.04, u + 0.075, -0.085);
}
// The back: the spine from the withers to the croup and the groove parting the hindquarters at the tail, the two lines
// that tell a horse's back from any other long body seen from above.
function back(ctx) {
  at(0.28 * P.flex, 0); ctx.moveTo(PT.x, PT.y);
  for (let i = 1; i <= 5; i++) { at(lerp(0.28, -0.36, i / 5) * P.flex, 0); ctx.lineTo(PT.x, PT.y); }
  seg(ctx, -0.55 * P.flex, 0, -0.43 * P.flex, 0);
}
// The tail: three strands off the rump. Hanging at a walk it reads short from above; lifted at a gallop it streams
// long and waves; grazing it swishes at flies.
function tail(ctx, h) {
  const G = P.G, L = G.tail, u0 = -0.52 * P.flex;
  const sw = (1 - Math.min(1, h.g)) * 0.6 * Math.sin(h.t * 1.9 + h.seed) + 0.25 * Math.sin(h.t * 0.7 + h.seed * 2) - 0.6 * h.bend * L;
  for (let i = -1; i <= 1; i++) {
    const wave = Math.sin(h.t * (4 + 7 * G.mane) + i * 0.9) * 0.05 * (0.3 + G.mane);
    at(u0, i * 0.02); ctx.moveTo(PT.x, PT.y);
    at(u0 - L * 0.5, sw * L * 0.4 + i * 0.03 + wave); const cx = PT.x, cy = PT.y;
    at(u0 - L * (0.9 + 0.08 * i * i), sw * L + i * 0.06 - wave); ctx.quadraticCurveTo(cx, cy, PT.x, PT.y);
  }
}
// The pinto's patches: two or three soft blobs on the barrel and quarters from its patch seed alone, filled in the
// accent and clipped to the body so a patch never spills over the outline.
export function pintoPatches(seed) {
  const r = pointRand(seed), n = 2 + (r() < 0.5 ? 1 : 0), out = [];
  for (let k = 0; k < n; k++) { const pts = []; const cu = -0.4 + r() * 0.72, cv = (r() - 0.5) * 0.26, rad = 0.07 + r() * 0.08; for (let i = 0; i < 9; i++) pts.push(rad * (0.75 + 0.5 * r())); out.push({ cu, cv, pts }); }
  return out;
}
function patches(ctx, h, colour, clipPath) {
  ctx.save(); ctx.beginPath(); clipPath(); ctx.clip();
  ctx.fillStyle = colour; ctx.beginPath();
  for (const { cu, cv, pts } of h.patches) {
    const m = pts.length;
    for (let i = 0; i < m; i++) { const a = (i / m) * TAU; at(cu + Math.cos(a) * pts[i], cv + Math.sin(a) * pts[i] * 0.8); SX[i] = PT.x; SY[i] = PT.y; }
    closedCurve(ctx, SX, SY, m);
  }
  ctx.fill(); ctx.restore();
}
const ell = (ctx, x, y, a, rx, ry) => { ctx.moveTo(x + Math.cos(a) * rx, y + Math.sin(a) * rx); ctx.ellipse(x, y, rx, ry, a, 0, TAU); };
// the spine's heading at u, from two points along it
function headingAt(u) { at(u - 0.01, 0); const x = PT.x, y = PT.y; at(u + 0.01, 0); return Math.atan2(PT.y - y, PT.x - x); }

// The three figures, each one posed horse in ink over a paper fill; alpha is the ink's. 0, silhouette: one closed
// outline round barrel, neck and head, so the legs under it show only where a hoof reaches past the chest or the rump.
// 1, parts: the barrel and the neck-and-head as two ellipses, the second laid over the first and bent with the turn.
// 2, gesture: no outline, a spine line with a shoulder bar and a hip bar and the legs off their ends.
export const FIGURES = ['silhouette', 'parts', 'gesture'];
export function drawHorse(ctx, h, figure, ink, paper, accent, alpha) {
  poseHorse(h);
  ctx.strokeStyle = ink;
  ctx.globalAlpha = alpha; ctx.beginPath(); tail(ctx, h); if (figure !== 2) legs(ctx, false); ctx.stroke();
  if (figure === 0) {
    ctx.globalAlpha = 0.94; ctx.fillStyle = paper; ctx.beginPath(); silhouette(ctx); ctx.fill();
    if (h.patches && accent) { ctx.globalAlpha = 0.85; patches(ctx, h, accent, () => silhouette(ctx)); }
    ctx.globalAlpha = alpha; ctx.beginPath(); silhouette(ctx); ears(ctx); mane(ctx, h.side, h.t); ctx.stroke();
    ctx.globalAlpha = alpha * 0.55; ctx.beginPath(); back(ctx); ctx.stroke();
  } else if (figure === 1) {
    const b = NB * P.flex, n = P.neck + P.head, s = P.s;
    at(0, 0); const bx = PT.x, by = PT.y, ba = headingAt(0);
    const mid = b + n / 2; at(mid, 0); const nx = PT.x, ny = PT.y, na = headingAt(mid);
    const body = () => ell(ctx, bx, by, ba, 0.52 * P.flex * s, 0.19 * s), neck = () => ell(ctx, nx, ny, na, (n / 2 + 0.05) * s, 0.07 * s);
    ctx.globalAlpha = 0.94; ctx.fillStyle = paper; ctx.beginPath(); body(); ctx.fill();
    if (h.patches && accent) { ctx.globalAlpha = 0.85; patches(ctx, h, accent, body); }
    ctx.globalAlpha = alpha; ctx.beginPath(); body(); ctx.stroke();
    ctx.globalAlpha = 0.94; ctx.fillStyle = paper; ctx.beginPath(); neck(); ctx.fill();
    ctx.globalAlpha = alpha; ctx.beginPath(); neck(); ears(ctx); mane(ctx, h.side, h.t); ctx.stroke();
    ctx.globalAlpha = alpha * 0.55; ctx.beginPath(); back(ctx); ctx.stroke();
  } else {
    ctx.beginPath(); legs(ctx, true);
    const m = stations(); at(-0.5 * P.flex, 0); ctx.moveTo(PT.x, PT.y);
    for (let i = 3; i < m - 2; i++) { at(ST[2 * i], 0); ctx.lineTo(PT.x, PT.y); }
    const sh = 0.3 * P.flex, hp = -0.36 * P.flex;
    seg(ctx, sh, -0.16, sh, 0.16); seg(ctx, hp, -0.16, hp, 0.16);
    // the head: an open wedge from the cheeks to the muzzle
    const h0 = NB * P.flex + P.neck;
    at(h0, 0.065); ctx.moveTo(PT.x, PT.y); at(h0 + P.head, 0); ctx.lineTo(PT.x, PT.y); at(h0, -0.065); ctx.lineTo(PT.x, PT.y);
    ears(ctx); mane(ctx, h.side, h.t); ctx.stroke();
    if (h.patches && accent) { ctx.strokeStyle = accent; ctx.beginPath(); for (const q of h.patches) seg(ctx, q.cu - 0.1, q.cv - 0.06, q.cu + 0.1, q.cv + 0.06); ctx.stroke(); ctx.strokeStyle = ink; }
  }
  ctx.globalAlpha = 1;
}

// ----- the world -----
const NRM = { x: 0, y: 0 }, OUTP = { x: 0, y: 0 };
const pick2 = (w, k) => Math.max(0, Math.round(w.coarse ? w.params[k + 'Touch'] : w.params[k]));
const herdTarget = (w) => Math.max(1, pick2(w, 'count'));
// A world: the prairie's whole state. opts: { w, h, seed, coarse, reduced }.
export function createWorld(params, opts = {}) {
  const seed = (opts.seed == null ? 1 : opts.seed) >>> 0, wr = rng((seed ^ 0x77196d) >>> 0);
  const w = {
    params, w: opts.w || 1, h: opts.h || 1, t: 0, seed, rand: rng(seed), coarse: !!opts.coarse, reduced: !!opts.reduced,
    knolls: [], outlines: [], ptr: pointer(), stroke: null,
    horses: [], bands: [], nextBand: 1, splitT: 0, splits: 0, merges: 0,
    feed: [], puffs: [], eaten: 0, drops: 0,
    // the wind blows toward angle a, roughly from the west, all visit long; gusts run along it
    wind: { a: (wr() - 0.5) * 0.9, phase: 0, gusts: [], next: 2 + wr() * 3, rand: wr },
    land: null, landKey: '', hares: [], hrand: rng((seed ^ 0x4a5e) >>> 0), weeds: [],
    study: { ph: 0, t: 0 }, layerData: null,
  };
  layLand(w);
  populate(w);
  return w;
}
export function resizeWorld(w, width, height) { w.w = width; w.h = height; }
export function setSources(w, boxes) { placeFootprints(w.knolls, w.outlines, boxes, w.params, w.reduced, w.t); }
export function setOutlines(w, fns) { w.outlines = fns || []; }
export function setPointer(w, x, y, on) { pointTo(w.ptr, x, y, on); }
export function knollAt(w, x, y) { return footprintAt(w.knolls, x, y); }
// An apple dropped on open ground; one dropped on a boulder or the waterhole rolls off it.
export function dropFeed(w, x, y) {
  if (footprintAt(w.knolls, x, y) >= 0) return;
  for (const b of blocksOf(w)) { const d = Math.hypot(x - b.x, y - b.y); if (d < b.r + 4) { const k = (b.r + 4) / Math.max(1e-6, d); x = b.x + (x - b.x) * k; y = b.y + (y - b.y) * k; } }
  w.feed.push({ x, y, left: 1, age: 0 }); w.drops++;
  while (w.feed.length > Math.max(1, w.params.max)) w.feed.shift();
}
const landAt = (w) => (x, y) => footprintAt(w.knolls, x, y), feedOn = (w) => (x, y) => dropFeed(w, x, y);
export function strokeStart(w, x, y) { w.stroke = strokeOpen(x, y, w.params.gap); }
export function strokeTo(w, x, y) { strokeAlong(w.stroke, x, y, w.params.gap, landAt(w), feedOn(w)); }
export function strokeEnd(w) { const s = w.stroke; w.stroke = null; strokeClose(s, feedOn(w)); }
export function strokeCancel(w) { w.stroke = null; }
function puff(w, x, y, size, life, kind = 0) { if (w.puffs.length < 160) w.puffs.push({ x, y, size, life, age: 0, kind, spin: w.rand() * TAU }); }

// ----- the land -----
// Everything that stands still: the waterhole, the stands of trees (canopies over a few shrubs), the boulders, the
// hares' burrows, the drifts of wildflowers, the dry creek and the trails worn between the knolls, the waterhole and
// the trees. It is laid from the world's seed, the page size and where the knolls stand (to 60 px), so it is laid
// anew only when one of those changes, and the same inputs lay the same land. Its own random stream keeps the world's
// untouched. The blocks are what a horse walks round: the waterhole, the boulders and the shrubs.
const TOP = 80, MARGIN = 30;
export const blocksOf = (w) => (w.land ? w.land.blocks : []);
function landKey(w) {
  const p = w.params, k = w.knolls.map((o) => `${Math.round(o.bx / 60)},${Math.round(o.by / 60)}`).join(';');
  return `${Math.round(w.w / 40)} ${Math.round(w.h / 40)} ${k} ${pick2(w, 'groves')} ${pick2(w, 'boulders')} ${pick2(w, 'hares')} ${pick2(w, 'drifts')} ${p.waterhole} ${p.creek}`;
}
const knollGap = (w, x, y) => { let g = Infinity; for (const o of w.knolls) g = Math.min(g, edgeGap(o, x, y, 0)); return g; };
function layLand(w) {
  const p = w.params, W = w.w, H = w.h, r = rng((w.seed ^ 0x1a7d5eed) >>> 0);
  const L = { water: null, groves: [], trees: [], rocks: [], burrows: [], flowers: [], trails: [], creek: null, blocks: [] };
  const inside = (x, y, rad) => x > MARGIN + rad && x < W - MARGIN - rad && y > TOP + rad && y < H - MARGIN - rad;
  const blockGap = (x, y) => { let g = Infinity; for (const b of L.blocks) g = Math.min(g, Math.hypot(x - b.x, y - b.y) - b.r); return g; };
  const best = (tries, rad, ok, score) => {
    let bx = 0, by = 0, bs = -Infinity;
    for (let i = 0; i < tries; i++) { const x = MARGIN + rad + r() * (W - 2 * (MARGIN + rad)), y = TOP + rad + r() * (H - TOP - MARGIN - 2 * rad); if (!inside(x, y, rad) || !ok(x, y)) continue; const s = score(x, y) + r() * 20; if (s > bs) { bs = s; bx = x; by = y; } }
    return bs > -Infinity ? { x: bx, y: by } : null;
  };
  const wobble = (n, lo, hi) => Array.from({ length: n }, () => lo + r() * (hi - lo));
  // the waterhole: well away from the knolls, a wobbled ring
  if (p.waterhole) {
    const rad = clamp(Math.min(W, H) * 0.04, 22, 42);
    const at = best(60, rad, (x, y) => knollGap(w, x, y) > rad + 70, (x, y) => Math.min(knollGap(w, x, y), 320) - 0.2 * Math.abs(x - W / 2));
    if (at) { L.water = { x: at.x, y: at.y, r: rad, rim: wobble(11, 0.86, 1.08) }; L.blocks.push({ x: at.x, y: at.y, r: rad + 3, kind: 'water' }); }
  }
  // the stands of trees: apart from the knolls, the water and one another
  const nG = pick2(w, 'groves');
  for (let g = 0; g < nG; g++) {
    const at = best(60, 50, (x, y) => knollGap(w, x, y) > 90 && blockGap(x, y) > 70 && L.groves.every((q) => Math.hypot(q.x - x, q.y - y) > 260),
      (x, y) => Math.min(knollGap(w, x, y), 300) + Math.min(300, ...L.groves.map((q) => Math.hypot(q.x - x, q.y - y)), 300));
    if (!at) continue;
    const G = { x: at.x, y: at.y, r: 0, trees: [] }, nt = 2 + Math.floor(r() * 2.6);
    for (let t = 0; t < nt; t++) {
      const a = r() * TAU, d = t ? 18 + r() * 22 : 0, R = 19 + r() * 11, lobes = 8 + Math.floor(r() * 5);
      const tree = { x: G.x + Math.cos(a) * d, y: G.y + Math.sin(a) * d, r: R, lobes, ph: r() * TAU, bumps: wobble(lobes, 0.88, 1.06), clumps: Array.from({ length: 4 + Math.floor(r() * 3) }, () => ({ a: r() * TAU, d: r() * 0.6, s: 0.18 + r() * 0.12, t: r() * TAU })) };
      G.trees.push(tree); L.trees.push(tree); G.r = Math.max(G.r, d + R);
    }
    const ns = 2 + Math.floor(r() * 3);
    for (let s = 0; s < ns; s++) {
      const a = r() * TAU, d = G.r + 10 + r() * 22, x = G.x + Math.cos(a) * d, y = G.y + Math.sin(a) * d, R = 6 + r() * 5;
      if (!inside(x, y, R) || knollGap(w, x, y) < R + 30 || blockGap(x, y) < R + 14) continue;
      L.blocks.push({ x, y, r: R, kind: 'shrub', loops: wobble(4, 0.5, 1), ph: r() * TAU });
    }
    L.groves.push(G);
  }
  // the boulders: some by the water, the rest out on the grass
  const nR = pick2(w, 'boulders');
  for (let i = 0; i < nR; i++) {
    const R = 5 + r() * 10, near = L.water && i < nR / 2;
    let at = null;
    for (let k = 0; k < 40 && !at; k++) {
      const x = near ? L.water.x + Math.cos(r() * TAU) * (L.water.r + R + 8 + r() * 50) : MARGIN + r() * (W - 2 * MARGIN);
      const y = near ? L.water.y + Math.sin(r() * TAU) * (L.water.r + R + 8 + r() * 50) : TOP + r() * (H - TOP - MARGIN);
      if (inside(x, y, R) && knollGap(w, x, y) > R + 50 && blockGap(x, y) > R + 16 && L.trees.every((t) => Math.hypot(t.x - x, t.y - y) > t.r + R + 6)) at = { x, y };
    }
    if (!at) continue;
    const q = { x: at.x, y: at.y, r: R, kind: 'rock', rim: wobble(7, 0.74, 1), ph: r() * TAU, crack: r() };
    L.rocks.push(q); L.blocks.push(q);
  }
  // the burrows: by the boulders when there are any, else out on the grass
  const nB = Math.max(3, pick2(w, 'hares') * 2);
  for (let i = 0; i < nB; i++) {
    for (let k = 0; k < 40; k++) {
      const base = L.rocks.length && r() < 0.7 ? L.rocks[Math.floor(r() * L.rocks.length)] : null, a = r() * TAU;
      const x = base ? base.x + Math.cos(a) * (base.r + 10 + r() * 22) : MARGIN + r() * (W - 2 * MARGIN), y = base ? base.y + Math.sin(a) * (base.r + 10 + r() * 22) : TOP + r() * (H - TOP - MARGIN);
      if (!inside(x, y, 4) || knollGap(w, x, y) < 40 || blockGap(x, y) < 6 || L.burrows.some((b) => Math.hypot(b.x - x, b.y - y) < 30)) continue;
      L.burrows.push({ x, y, a: r() * TAU }); break;
    }
  }
  // the drifts of wildflowers: each a loose cloud, each flower opening on its own time through the visit
  const nD = pick2(w, 'drifts');
  for (let d = 0; d < nD; d++) {
    const at = best(30, 40, (x, y) => knollGap(w, x, y) > 70 && blockGap(x, y) > 40, () => 0);
    if (!at) continue;
    const n = 9 + Math.floor(r() * 8);
    for (let i = 0; i < n; i++) {
      const a = r() * TAU, rr = 30 * Math.sqrt(-2 * Math.log(1 - r() * 0.95)) * 0.6, x = at.x + Math.cos(a) * rr, y = at.y + Math.sin(a) * rr;
      if (!inside(x, y, 3) || knollGap(w, x, y) < p.thin + 6 || blockGap(x, y) < 5) continue;
      const o1 = 3 + r() * 0.5 * p.bloom;
      L.flowers.push({ x, y, o1, o2: o1 + 4 + r() * 0.5 * p.bloom, rot: r() * TAU, s: 0.8 + r() * 0.5, drift: d });
    }
  }
  // the dry creek: a meander in from one side and out another, kept off the knolls and the water
  if (p.creek) {
    const xs = [], ys = [], fromLeft = r() < 0.5;
    let x = fromLeft ? -10 : W * (0.2 + r() * 0.6), y = fromLeft ? TOP + (H - TOP) * (0.3 + r() * 0.5) : H + 10, a = fromLeft ? (r() - 0.5) * 0.6 : -Math.PI / 2 + (r() - 0.5) * 0.6, turn = 0;
    const a0 = a;
    for (let i = 0; i < 400; i++) {
      xs.push(x); ys.push(y);
      if (x < -20 || x > W + 20 || y < TOP - 20 || y > H + 20) { if (i > 3) break; }
      turn = clamp(turn + (r() - 0.5) * 0.25, -0.12, 0.12); a += turn; a = a0 + clamp(wrapAngle(a - a0), -0.9, 0.9);
      x += Math.cos(a) * 14; y += Math.sin(a) * 14;
      for (const o of w.knolls) { const g = edgeGap(o, x, y, 70); if (g < 0) { onEdge(o, x, y, 70, OUTP); x = OUTP.x; y = OUTP.y; } }
      if (L.water) { const d = Math.hypot(x - L.water.x, y - L.water.y), m = L.water.r + 40; if (d < m) { x = L.water.x + ((x - L.water.x) / d) * m; y = L.water.y + ((y - L.water.y) / d) * m; } }
    }
    L.creek = { xs, ys, wide: wobble(xs.length, 4, 8), pebbles: Array.from({ length: Math.floor(xs.length * 0.6) }, () => ({ i: Math.floor(r() * xs.length), o: (r() - 0.5) * 6, s: 0.6 + r() * 0.8 })) };
  }
  // the trails: from each knoll to the waterhole, and from each stand of trees to its nearest knoll, water or stand
  const nodes = [];
  w.knolls.forEach((o) => nodes.push({ x: o.x, y: o.y, knoll: o, name: `knoll${o.i}` }));
  if (L.water) nodes.push({ x: L.water.x, y: L.water.y, r: L.water.r + 4, name: 'water' });
  L.groves.forEach((g, i) => nodes.push({ x: g.x, y: g.y, r: 0, name: `grove${i}` }));
  const pairs = [];
  const nk = w.knolls.length, wi = L.water ? nk : -1;
  for (let i = 0; i < nk; i++) { if (wi >= 0) pairs.push([i, wi]); else if (i + 1 < nk) pairs.push([i, i + 1]); }
  for (let g = (L.water ? nk + 1 : nk); g < nodes.length; g++) {
    let bj = -1, bd = Infinity;
    for (let j = 0; j < nodes.length; j++) { if (j === g || (nodes[j].name.startsWith('grove') && j > g)) continue; const d = Math.hypot(nodes[j].x - nodes[g].x, nodes[j].y - nodes[g].y); if (d < bd) { bd = d; bj = j; } }
    if (bj >= 0) pairs.push([bj, g]);
  }
  for (const [i, j] of pairs) {
    const A = nodes[i], B = nodes[j], end = (N, toward) => {
      if (N.knoll) { onEdge(N.knoll, toward.x, toward.y, 0.5 * p.thin, OUTP); return { x: OUTP.x, y: OUTP.y }; }
      const d = Math.hypot(toward.x - N.x, toward.y - N.y) || 1; return { x: N.x + ((toward.x - N.x) / d) * N.r, y: N.y + ((toward.y - N.y) / d) * N.r };
    };
    const a = end(A, B), b = end(B, A), L0 = Math.hypot(b.x - a.x, b.y - a.y);
    if (L0 < 30) continue;
    const n = Math.max(4, Math.round(L0 / 10)), amp = (r() - 0.5) * 0.12 * L0, waves = 1 + Math.floor(r() * 2), nx = -(b.y - a.y) / L0, ny = (b.x - a.x) / L0;
    const pts = new Float32Array(2 * (n + 1));
    for (let k = 0; k <= n; k++) {
      const s = k / n, off = amp * Math.sin(Math.PI * waves * s) + 3 * Math.sin(s * 23 + i);
      let x = lerp(a.x, b.x, s) + nx * off, y = lerp(a.y, b.y, s) + ny * off;
      for (const q of L.blocks) { if (q.kind === 'water' && (k === 0 || k === n)) continue; const d = Math.hypot(x - q.x, y - q.y), m = q.r + 6; if (d < m && d > 1e-6) { x = q.x + ((x - q.x) / d) * m; y = q.y + ((y - q.y) / d) * m; } }
      pts[2 * k] = x; pts[2 * k + 1] = y;
    }
    L.trails.push({ from: A.name, to: B.name, pts });
  }
  w.land = L; w.landKey = landKey(w);
}
// the land is laid again only when the page or a knoll has moved enough to matter, or a count has changed
function stepLand(w) { if (landKey(w) !== w.landKey) layLand(w); }

// ----- the herd -----
// A horse: { x, y, a, v (px/s), g (gait 0..3), want (the gait it is making for), ph, t, bend, om, seed, side, size,
// foal, mare (its mother's index, foals only), band, alarm (0..1), shelter ({ x, y } under a canopy, or null), food
// (the apple it is making for), stepT, stepping, stepA, dustT, chaffT, pinto, patches }.
// A band: { id, leader (index), gx, gy (where the leader is making for), keep (time left grazing there), away (time
// left apart, a band that parted; Infinity for the main band) }.
const SPEED = (p) => [0, p.walk, p.trot, p.gallop];
export function speedAt(p, g) { const S = SPEED(p), i = clamp(Math.floor(g), 0, 2), t = clamp(g - i, 0, 1); return lerp(S[i], S[i + 1], t); }
const STEP_SPEED = 0.35;
function freeFor(w, x, y, R) {
  if (x < MARGIN || x > w.w - MARGIN || y < MARGIN || y > w.h - MARGIN) return false;
  if (knollGap(w, x, y) < w.params.shore + R + 6) return false;
  for (const b of blocksOf(w)) if (Math.hypot(x - b.x, y - b.y) < b.r + R + 4) return false;
  return true;
}
// a point to make for: dist px from (x, y), about along dir, on open ground and inside the page's margins
function pickGoal(w, x, y, dir, dist, spread = 1.2) {
  const r = w.rand, m = w.params.edge + 20;
  for (let k = 0; k < 24; k++) {
    const a = dir + (r() - 0.5) * 2 * spread * (1 + k / 12), d = dist * (0.6 + 0.6 * r());
    const gx = clamp(x + Math.cos(a) * d, m, w.w - m), gy = clamp(y + Math.sin(a) * d, Math.max(m, TOP), w.h - m);
    if (freeFor(w, gx, gy, 2 * w.params.size)) return { x: gx, y: gy };
  }
  return { x, y };
}
function populate(w) {
  const p = w.params, r = w.rand, n = herdTarget(w), S = p.size, nf = Math.min(pick2(w, 'foals'), Math.floor(n / 3)), na = n - nf;
  // the herd starts together somewhere open, nearer the middle of the page than its edges
  let cx = w.w / 2, cy = w.h / 2, bs = -Infinity;
  for (let k = 0; k < 40; k++) {
    const x = w.w * (0.2 + 0.6 * r()), y = Math.max(TOP + 40, w.h * (0.25 + 0.6 * r()));
    const s = Math.min(knollGap(w, x, y), 260) - 0.3 * Math.hypot(x - w.w / 2, y - w.h / 2);
    if (s > bs) { bs = s; cx = x; cy = y; }
  }
  const H = [], R = S * (1.6 + p.spacing * Math.sqrt(na) * 0.55);
  for (let i = 0; i < n; i++) {
    const foal = i >= na, mare = foal ? (i - na) * Math.max(1, Math.floor(na / Math.max(1, nf))) % na : -1;
    let x = cx, y = cy;
    for (let k = 0; k < 40; k++) {
      if (foal) { const m = H[mare], a = r() * TAU; x = m.x + Math.cos(a) * S * 1.2; y = m.y + Math.sin(a) * S * 1.2; }
      else { const a = r() * TAU, d = R * Math.sqrt(r()) * (1 + k / 20); x = cx + Math.cos(a) * d; y = cy + Math.sin(a) * d; }
      if (freeFor(w, x, y, S * 0.6) && H.every((o) => Math.hypot(o.x - x, o.y - y) > S * (foal ? 0.7 : 1.1))) break;
    }
    const size = S * (foal ? 0.62 : 0.92 + 0.16 * r());
    H.push({ i, x, y, a: r() * TAU, v: 0, g: 0, want: 0, ph: r(), t: r() * 100, bend: 0, om: 0, seed: r() * TAU, side: r() < 0.5 ? -1 : 1, size, foal, mare, band: 0, alarm: 0, shelter: null, food: null, stepT: 1 + r() * 8, stepping: 0, stepA: 0, dustT: 0, chaffT: 0, pinto: 0, patches: null });
  }
  w.horses = H; w.foalN = nf;
  markPintos(w);
  const lead = H[0], gl = pickGoal(w, lead.x, lead.y, r() * TAU, p.roam);
  w.bands = [{ id: 0, leader: 0, gx: gl.x, gy: gl.y, keep: p.keep * (0.3 + r()), away: Infinity }];
  w.nextBand = 1; w.splitT = p.split * (0.5 + r());
}
// The pintos are the adults spread evenly through the herd (never the lead mare); their patches come from the index
// alone, so a pinto looks the same on every visit.
function markPintos(w) {
  const H = w.horses, adults = H.filter((h) => !h.foal), n = Math.min(pick2(w, 'pintos'), Math.max(0, adults.length - 1));
  for (const h of H) { h.pinto = 0; h.patches = null; }
  for (let k = 0; k < n; k++) { const h = adults[1 + Math.floor((k * (adults.length - 1)) / n)]; h.pinto = 0x9e3779b9 ^ (h.i * 2654435761); h.patches = pintoPatches(h.pinto >>> 0); }
  w.pintoN = n;
}
const bandOf = (w, id) => w.bands.find((b) => b.id === id) || w.bands[0];
function centroid(w, id, out) { let x = 0, y = 0, n = 0; for (const h of w.horses) if (h.band === id) { x += h.x; y += h.y; n++; } out.x = n ? x / n : 0; out.y = n ? y / n : 0; out.n = n; return out; }
const C0 = { x: 0, y: 0, n: 0 }, C1 = { x: 0, y: 0, n: 0 };
// The bands: each lead mare grazes a spot for a while and moves on; now and then a band parts in two, the smaller
// part following a mare of its own off to graze apart, and after a while it makes back for the main band and joins it.
function stepBands(w, dt) {
  const p = w.params, r = w.rand, H = w.horses, main = w.bands[0], calm = H.every((h) => h.alarm < 0.05);
  for (const h of H) if (h.foal) h.band = H[h.mare].band;
  for (const b of w.bands) {
    const L = H[b.leader];
    if (L.alarm > 0.05) { b.gx = L.x; b.gy = L.y; b.keep = p.keep * (0.5 + r()); continue; }
    // a spot the land has since covered (a knoll moved onto it, the page shrank) is given up for one nearby
    if (!freeFor(w, b.gx, b.gy, 2 * p.size) && (b === main || b.away > 0)) { const g = pickGoal(w, L.x, L.y, L.a, p.roam * 0.6, Math.PI); b.gx = g.x; b.gy = g.y; }
    if (b !== main) {
      b.away -= dt;
      if (b.away <= 0) {
        // coming back: the main band holds its spot while this one makes for it
        const Lm = H[main.leader]; main.gx = Lm.x; main.gy = Lm.y; main.keep = Math.max(main.keep, 3);
        centroid(w, main.id, C0); centroid(w, b.id, C1);
        b.gx = C0.x; b.gy = C0.y;
        if (Math.hypot(C0.x - C1.x, C0.y - C1.y) < 110 + 2 * p.size * Math.sqrt(C1.n)) { for (const h of H) if (h.band === b.id) h.band = main.id; b.dead = true; w.merges++; }
        continue;
      }
    }
    // a mare that has walked half a minute without arriving (the way round a knoll was longer than it looked) settles
    // for where she is
    if (Math.hypot(L.x - b.gx, L.y - b.gy) >= 30) { b.walkT = (b.walkT || 0) + dt; if (b.walkT > 30) { b.gx = L.x; b.gy = L.y; b.walkT = 0; } }
    else b.walkT = 0;
    if (Math.hypot(L.x - b.gx, L.y - b.gy) < 30) {
      b.keep -= dt;
      if (b.keep <= 0) {
        // the next spot: onward, or back toward the page's middle when near an edge; a band apart keeps off the main one
        let dir = L.a;
        if (b !== main) { centroid(w, main.id, C0); dir = Math.atan2(L.y - C0.y, L.x - C0.x); }
        const toMid = Math.atan2(w.h / 2 - L.y, w.w / 2 - L.x), edge = Math.min(L.x, w.w - L.x, L.y - TOP, w.h - L.y) < 160;
        const g = pickGoal(w, L.x, L.y, edge ? toMid : dir, p.roam);
        b.gx = g.x; b.gy = g.y; b.keep = p.keep * (0.5 + r());
      }
    }
  }
  if (w.bands.some((b) => b.dead)) w.bands = w.bands.filter((b) => !b.dead);
  // a parting: only in a calm herd that is one band
  w.splitT -= dt;
  if (w.splitT <= 0 && calm && w.bands.length === 1) {
    w.splitT = p.split * (0.6 + 0.8 * r());
    const adults = H.filter((h) => !h.foal && h.i !== main.leader);
    if (adults.length >= 6) {
      const sub = adults[Math.floor(r() * adults.length)], k = Math.max(3, Math.round(adults.length * 0.35));
      adults.sort((a, b) => Math.hypot(a.x - sub.x, a.y - sub.y) - Math.hypot(b.x - sub.x, b.y - sub.y));
      const id = w.nextBand++;
      for (let j = 0; j < k; j++) adults[j].band = id;
      centroid(w, main.id, C0);
      const g = pickGoal(w, sub.x, sub.y, Math.atan2(sub.y - C0.y, sub.x - C0.x), p.roam * 1.1, 0.6);
      w.bands.push({ id, leader: sub.i, gx: g.x, gy: g.y, keep: p.keep * (0.5 + r()), away: p.rejoin * (0.6 + 0.8 * r()) });
      w.splits++;
    }
  }
}
// The canopy a spooked horse makes for: the nearest stand of trees that does not lie back toward the scare, a spot
// under it of its own; or, with no such stand, open ground straight away from the scare.
function shelterFor(w, h, ux, uy, grove) {
  const G = w.land ? w.land.groves : [], r = w.rand;
  let best = grove, bd = Infinity;
  if (best == null) for (let i = 0; i < G.length; i++) { const g = G[i], dx = g.x - h.x, dy = g.y - h.y, d = Math.hypot(dx, dy); if (d > 1e-6 && (dx * ux + dy * uy) / d < -0.25) continue; if (d < bd) { bd = d; best = i; } }
  if (best == null || !G[best]) { const m = w.params.edge; return { x: clamp(h.x + ux * 260, m, w.w - m), y: clamp(h.y + uy * 260, Math.max(m, TOP), w.h - m), grove: null }; }
  const g = G[best], a = r() * TAU, d = g.r * 0.65 * Math.sqrt(r());
  return { x: g.x + Math.cos(a) * d, y: g.y + Math.sin(a) * d, grove: best };
}
function spook(w, h, level, ux, uy, grove) {
  if (h.alarm >= level) return;
  h.alarm = level; h.food = null; h.stepping = 0;
  h.shelter = shelterFor(w, h, ux, uy, grove);
}
// the nearest trail point ahead within reach of (x, y), as a direction to blend in: along the trail the way the horse
// is heading, and in toward it when off it. Writes to out and returns its weight, 0 when there is no trail near.
function trailPull(w, h, tx, ty, out) {
  const T = w.land ? w.land.trails : [];
  let best = Infinity, bt = null, bk = 0;
  for (const t of T) { const P2 = t.pts; for (let k = 0; k < P2.length; k += 2) { const d = (P2[k] - h.x) ** 2 + (P2[k + 1] - h.y) ** 2; if (d < best) { best = d; bt = P2; bk = k; } } }
  if (!bt || best > 55 * 55) return 0;
  const k0 = Math.max(0, bk - 2), k1 = Math.min(bt.length - 2, bk + 2), ex = bt[k1] - bt[k0], ey = bt[k1 + 1] - bt[k0 + 1], m = Math.hypot(ex, ey) || 1;
  let ux = ex / m, uy = ey / m; const gx = tx - h.x, gy = ty - h.y, gm = Math.hypot(gx, gy) || 1;
  let al = (ux * gx + uy * gy) / gm; if (al < 0) { ux = -ux; uy = -uy; al = -al; }
  if (al < 0.35) return 0;
  const d = Math.sqrt(best), ix = (bt[bk] - h.x) / Math.max(1, d), iy = (bt[bk + 1] - h.y) / Math.max(1, d), k = Math.min(1, d / 25);
  out.x = ux + ix * k; out.y = uy + iy * k; return al;
}
const TP = { x: 0, y: 0 };
function stepHerd(w, dt, startle) {
  const p = w.params, r = w.rand, H = w.horses, n = H.length, ptr = w.ptr, rm = w.reduced;
  // a fast cursor spooks the horses near it into a run for cover, and a spooked horse spooks those near it
  if (startle) for (const h of H) { const dx = h.x - ptr.x, dy = h.y - ptr.y, d = Math.hypot(dx, dy); if (d < p.scare && d > 1e-6) spook(w, h, 1, dx / d, dy / d, null); }
  if (!rm) for (const h of H) {
    if (h.alarm < 0.4) continue;
    for (const o of H) { if (o === h || o.alarm >= h.alarm * 0.88) continue; const d = Math.hypot(o.x - h.x, o.y - h.y); if (d < p.alarm) { const s = h.shelter; spook(w, o, h.alarm * 0.88, Math.cos(h.a), Math.sin(h.a), s ? s.grove : null); } }
  }
  // the apples: a calm horse makes for the nearest it notices, three to an apple at most
  if (w.feed.length) {
    for (const f of w.feed) f.claims = 0;
    for (const h of H) if (h.food) { if (w.feed.includes(h.food)) h.food.claims++; else h.food = null; }
    for (const h of H) {
      if (h.food || h.alarm > 0.05) continue;
      let bf = null, bd = p.sense;
      for (const f of w.feed) { const d = Math.hypot(f.x - h.x, f.y - h.y); if (d < bd && f.claims < 3) { bd = d; bf = f; } }
      if (bf) { h.food = bf; bf.claims++; }
    }
  } else for (const h of H) h.food = null;
  for (const h of H) {
    const S = h.size, band = bandOf(w, h.band), L = H[band.leader];
    h.t += dt;
    h.alarm = Math.max(0, h.alarm - dt / p.calm);
    if (rm) h.alarm = 0;
    if (h.alarm <= 0) h.shelter = null;
    let tx = h.x, ty = h.y, want = 0, eating = false, stand = false;
    if (h.alarm > 0.02 && h.shelter) {
      tx = h.shelter.x; ty = h.shelter.y;
      const d = Math.hypot(tx - h.x, ty - h.y);
      if (d < 10) stand = true;
      else want = h.alarm > 0.5 ? 3 : h.alarm > 0.22 ? 2 : 1;
    } else if (h.food) {
      tx = h.food.x; ty = h.food.y;
      const d = Math.hypot(tx - h.x, ty - h.y);
      if (d < S * 1.3) { eating = true; h.food.left -= dt / p.eat; h.chaffT -= dt; if (h.chaffT <= 0) { h.chaffT = 0.7; puff(w, h.food.x, h.food.y, 3, 0.8, 1); } }
      else want = d > 200 ? 2 : 1;
    } else if (h.foal) {
      const m = H[h.mare], ox = Math.cos(m.a), oy = Math.sin(m.a);
      tx = m.x - ox * S * 0.3 - oy * S * 0.9 * m.side; ty = m.y - oy * S * 0.3 + ox * S * 0.9 * m.side;
      const d = Math.hypot(tx - h.x, ty - h.y);
      want = d > 9 * S ? 2 : d > 2.5 * S ? 1 : Math.round(m.g) >= 1 ? Math.round(m.g) : 0;
    } else if (h === L) {
      tx = band.gx; ty = band.gy;
      const d = Math.hypot(tx - h.x, ty - h.y);
      want = d > 30 ? (band.away <= 0 && d > 200 ? 2 : 1) : 0;
    } else {
      tx = L.x; ty = L.y;
      const d = Math.hypot(tx - h.x, ty - h.y), nb = Math.max(1, centroid(w, band.id, C1).n);
      const R = S * (2 + p.spacing * Math.sqrt(nb) * 0.9);
      want = d > 2.6 * R ? 2 : d > R ? 1 : 0;
      if (band.away <= 0 && d > R) want = Math.max(want, 1);
    }
    if (rm) want = Math.min(want, 1);
    h.want = want;
    // a grazing horse takes a step or two now and then: on toward the band when it has drifted out, else anywhere
    if (want === 0 && !eating && !stand) {
      if (h.stepping > 0) h.stepping -= dt;
      else if ((h.stepT -= dt) <= 0) { h.stepT = 3 + r() * 7; h.stepping = 0.8 + r() * 1.4; h.stepA = h.a + (r() - 0.5) * 1.8; }
    } else h.stepping = 0;
    // the direction it would go: its target, kept apart from the others, round the knolls and the blocks, off the
    // page's edge, and along a trail when one runs its way
    let dx = 0, dy = 0;
    if (want > 0) { const d = Math.hypot(tx - h.x, ty - h.y) || 1; dx = (tx - h.x) / d; dy = (ty - h.y) / d; }
    else if (h.stepping > 0) { dx = Math.cos(h.stepA); dy = Math.sin(h.stepA); }
    else if (eating) { dx = tx - h.x; dy = ty - h.y; }
    const moving = want > 0 || h.stepping > 0;
    if (moving) {
      const sep = S * (h.alarm > 0.3 || h.food ? 1.1 : p.spacing);
      for (const o of H) { if (o === h) continue; const ex = h.x - o.x, ey = h.y - o.y, d = Math.hypot(ex, ey); if (d < sep && d > 1e-6) { const k = (1 - d / sep) * 1.6; dx += (ex / d) * k; dy += (ey / d) * k; } }
      const hx = Math.cos(h.a), hy = Math.sin(h.a), look = p.look + S;
      const avoid = (gap, gx, gy) => {
        if (gap > look) return;
        const kk = clamp(1 - gap / Math.max(1, look), 0, 1), toward = -(hx * gx + hy * gy);
        if (toward > -0.2) { const side = hx * -gy + hy * gx >= 0 ? 1 : -1; dx += (-gy * side * 3 + gx * 2 * kk) * kk; dy += (gx * side * 3 + gy * 2 * kk) * kk; }
      };
      for (const o of w.knolls) { const gap = edgeGap(o, h.x, h.y, p.shore); if (gap < look) { edgeNormal(o, h.x, h.y, NRM); avoid(gap, NRM.x, NRM.y); } }
      for (const b of blocksOf(w)) { const ex = h.x - b.x, ey = h.y - b.y, d = Math.hypot(ex, ey) || 1, gap = d - b.r - S * 0.5; if (gap < look * 0.6) avoid(gap / 0.6, ex / d, ey / d); }
      const m = p.edge;
      if (h.x < m) dx += 2 * (1 - h.x / m); if (h.x > w.w - m) dx -= 2 * (1 - (w.w - h.x) / m);
      if (h.y < m) dy += 2 * (1 - h.y / m); if (h.y > w.h - m) dy -= 2 * (1 - (w.h - h.y) / m);
      if (want === 1 && h.alarm < 0.05 && p.trail > 0) { const k = trailPull(w, h, tx, ty, TP); if (k > 0) { dx += TP.x * p.trail * k; dy += TP.y * p.trail * k; } }
    }
    // the gait eases toward the one wanted: up quickly, down more slowly; the speed follows the gait
    const up = want > h.g;
    h.g = clamp(h.g + clamp(want - h.g, -(up ? 1.8 : 1.1) * dt, (up ? 1.8 : 1.1) * dt), 0, 3);
    let vt = h.g < 1 ? lerp(h.stepping > 0 ? STEP_SPEED : 0, p.walk, h.g) : speedAt(p, h.g);
    if (h.foal) vt *= 1.15;
    if (eating || stand) vt = 0;
    else if (want > 0) { const d = Math.hypot(tx - h.x, ty - h.y); vt *= clamp(d / (2 * S), h.food ? 0.15 : 0.3, 1); }
    h.v += (vt * S - h.v) * Math.min(1, dt * (h.g > 2 ? 2.5 : 3));
    // the turn: a heading eased toward the wanted direction at the gait's turn rate; the spine bends with it
    const a0 = h.a;
    if (dx * dx + dy * dy > 1e-6) {
      // close to an apple or its shelter a horse turns on the spot rather than circling it
      const near = (h.food || h.shelter) && Math.hypot(tx - h.x, ty - h.y) < 3 * S ? 2.5 : 1;
      const aim = wrapAngle(Math.atan2(dy, dx) - h.a), rate = near * p.turn * (h.g < 1 ? 0.7 : 1 + 0.35 * (h.g - 1)) * dt;
      h.a = wrapAngle(h.a + clamp(aim, -rate, rate));
    }
    h.om += (wrapAngle(h.a - a0) / dt - h.om) * Math.min(1, dt * 8);
    const curv = clamp(h.om / Math.max(h.v / S, 0.9), -0.7, 0.7) + 0.12 * Math.sin(h.t * 0.45 + h.seed) * (1 - Math.min(1, h.g));
    h.bend += (curv - h.bend) * Math.min(1, dt * 6);
    h.ph = (h.ph + (h.v / (S * gaitAt(h.g, GA).stride)) * dt) % 1;
    h.x += Math.cos(h.a) * h.v * dt; h.y += Math.sin(h.a) * h.v * dt;
    if (h.g > 2.4 && !rm) { h.dustT -= dt; if (h.dustT <= 0) { h.dustT = 0.09 + 0.06 * r(); puff(w, h.x - Math.cos(h.a) * S * 0.6, h.y - Math.sin(h.a) * S * 0.6, 3 + 2 * r(), 1.1, 0); } }
  }
  // no two bodies on one spot, then nothing inside a knoll, a boulder, a shrub or the water
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const A = H[i], B = H[j], ex = B.x - A.x, ey = B.y - A.y, d = Math.hypot(ex, ey), m = 0.36 * (A.size + B.size);
    if (d < m && d > 1e-6) { const k = (m - d) / (2 * d); A.x -= ex * k; A.y -= ey * k; B.x += ex * k; B.y += ey * k; }
  }
  for (const h of H) keepOut(w, h);
}
const GA = {};
// Pushes a horse clear: its middle, its nose and its rump each kept off every knoll (by shore), every block and the
// page's edge; motion aimed inward is shed so it slides along.
function keepOut(w, h) {
  const p = w.params, S = h.size, ca = Math.cos(h.a), sa = Math.sin(h.a), nose = noseReach(h.g) * S, rump = 0.6 * S;
  for (let pass = 0; pass < 3; pass++) {
    for (const [off, g] of [[0, p.shore], [nose, 2], [-rump, 2]]) {
      const x = h.x + ca * off, y = h.y + sa * off;
      for (const o of w.knolls) {
        if (edgeR(o, x, y, g) >= 1) continue;
        onEdge(o, x, y, g + 0.5, OUTP); h.x += OUTP.x - x; h.y += OUTP.y - y;
        edgeNormal(o, OUTP.x, OUTP.y, NRM); shed(h, NRM.x, NRM.y);
      }
      for (const b of blocksOf(w)) {
        const ex = x - b.x, ey = y - b.y, d = Math.hypot(ex, ey), m = b.r + (off === 0 ? S * 0.3 : 1.5);
        if (d >= m) continue;
        const ux = d > 1e-6 ? ex / d : 1, uy = d > 1e-6 ? ey / d : 0;
        h.x += ux * (m - d + 0.5); h.y += uy * (m - d + 0.5); shed(h, ux, uy);
      }
    }
  }
  h.x = clamp(h.x, 4, w.w - 4); h.y = clamp(h.y, 4, w.h - 4);
}
function shed(h, gx, gy) {
  let vx = Math.cos(h.a), vy = Math.sin(h.a); const into = vx * gx + vy * gy;
  if (into < 0 && h.v > 1) { vx -= into * gx; vy -= into * gy; if (Math.hypot(vx, vy) > 1e-3) h.a = Math.atan2(vy, vx); }
}

// ----- wind, apples, dust -----
// The wind blows along w.wind.a. A gust is a front across it, running downwind at gustSpeed: { s (its middle, px along
// the wind from the page's centre), amp }. The lean it puts on the grass at a point is amp x cos^2 across gustWidth.
function windSpan(w) { const c = Math.cos(w.wind.a), s = Math.sin(w.wind.a), hw = w.w / 2, hh = w.h / 2, e = Math.abs(c) * hw + Math.abs(s) * hh; return e; }
export function leanAt(w, x, y) {
  const c = Math.cos(w.wind.a), s = Math.sin(w.wind.a), u = (x - w.w / 2) * c + (y - w.h / 2) * s, W = w.params.gustWidth;
  let l = 0; for (const g of w.wind.gusts) { const d = Math.abs(u - g.s) / W; if (d < 1) l += g.amp * Math.cos((Math.PI / 2) * d) ** 2; }
  return l;
}
function stepWind(w, dt) {
  const p = w.params, wd = w.wind, e = windSpan(w);
  if (w.reduced) { wd.gusts.length = 0; return; }
  wd.phase += dt;
  for (const g of wd.gusts) g.s += p.gustSpeed * dt;
  wd.gusts = wd.gusts.filter((g) => g.s < e + p.gustWidth);
  if ((wd.next -= dt) <= 0) { wd.next = p.gustEvery * (0.5 + wd.rand()); wd.gusts.push({ s: -e - p.gustWidth, amp: 0.7 + 0.6 * wd.rand() }); }
}
function stepFeed(w, dt) {
  const p = w.params;
  for (const f of w.feed) f.age += dt;
  w.feed = w.feed.filter((f) => {
    if (f.left <= 0) { w.eaten++; puff(w, f.x, f.y, 4, 0.9, 1); return false; }
    return f.age < p.last;
  });
  const c = Math.cos(w.wind.a), s = Math.sin(w.wind.a), drift = w.reduced ? 0 : 8;
  for (const q of w.puffs) { q.age += dt; q.x += c * drift * dt; q.y += s * drift * dt; }
  w.puffs = w.puffs.filter((q) => q.age < q.life);
}

// ----- hares -----
// A hare sits by the boulders and burrows, hops a little way now and then, and bolts for the nearest burrow away from
// the cursor when it comes within `bolt` px, or from a galloping horse; it stays down a few seconds and comes out
// again. Under reduced motion it neither bolts nor hops far. { x, y, a, state: sit | hop | bolt | down, timer, tx, ty,
// ph (the hop's phase) }
const HARE_HOP = 46, HARE_RUN = 230;
const hareTarget = (w) => pick2(w, 'hares');
function stepHares(w, dt) {
  const p = w.params, r = w.hrand, L = w.land, ptr = w.ptr, B = L ? L.burrows : [];
  if (w.hares.length !== hareTarget(w)) {
    w.hares = [];
    for (let i = 0; i < hareTarget(w) && B.length; i++) { const b = B[i % B.length]; w.hares.push({ x: b.x + 6, y: b.y + 4, a: r() * TAU, state: 'sit', timer: 1 + r() * 5, tx: 0, ty: 0, ph: 0, bolts: 0 }); }
  }
  for (const q of w.hares) {
    // the bolt: from the cursor, or from a horse at a gallop close by
    if (!w.reduced && q.state !== 'down' && q.state !== 'bolt' && B.length) {
      let fx = 0, fy = 0, scared = false;
      if (ptr.on && Math.hypot(q.x - ptr.x, q.y - ptr.y) < p.bolt) { fx = q.x - ptr.x; fy = q.y - ptr.y; scared = true; }
      else for (const h of w.horses) if (h.g > 2.3 && Math.hypot(h.x - q.x, h.y - q.y) < 50) { fx = q.x - h.x; fy = q.y - h.y; scared = true; break; }
      if (scared) {
        const fm = Math.hypot(fx, fy) || 1; let bb = null, bd = Infinity;
        for (const b of B) { const dx = b.x - q.x, dy = b.y - q.y, d = Math.hypot(dx, dy); const away = d < 1e-6 ? 1 : (dx * fx + dy * fy) / (d * fm); if (away < -0.3) continue; if (d < bd) { bd = d; bb = b; } }
        if (!bb) bb = { x: clamp(q.x + (fx / fm) * 120, 10, w.w - 10), y: clamp(q.y + (fy / fm) * 120, 10, w.h - 10) };
        q.state = 'bolt'; q.tx = bb.x; q.ty = bb.y; q.bolts++;
      }
    }
    if (q.state === 'sit') {
      if ((q.timer -= dt) <= 0) {
        for (let k = 0; k < 12; k++) {
          const a = r() * TAU, d = 20 + r() * 50, near = B.length && r() < 0.4 ? B[Math.floor(r() * B.length)] : null;
          const x = near ? near.x + Math.cos(a) * 12 : q.x + Math.cos(a) * d, y = near ? near.y + Math.sin(a) * 12 : q.y + Math.sin(a) * d;
          if (x < 20 || x > w.w - 20 || y < TOP || y > w.h - 20 || knollGap(w, x, y) < 12 || blocksOf(w).some((b) => b.kind !== 'rock' && Math.hypot(b.x - x, b.y - y) < b.r + 4)) continue;
          q.tx = x; q.ty = y; q.state = 'hop'; break;
        }
        q.timer = 2 + r() * 6;
      }
    } else if (q.state === 'hop' || q.state === 'bolt') {
      const run = q.state === 'bolt', sp = run ? HARE_RUN : HARE_HOP * (w.reduced ? 0.5 : 1);
      const dx = q.tx - q.x, dy = q.ty - q.y, d = Math.hypot(dx, dy);
      q.ph = (q.ph + dt * (run ? 6 : 2.5)) % 1;
      if (d < sp * dt + 1) { q.x = q.tx; q.y = q.ty; q.ph = 0; if (run) { q.state = 'down'; q.timer = 2.5 + r() * 3; } else { q.state = 'sit'; q.timer = 2 + r() * 6; } }
      else { q.a = Math.atan2(dy, dx); q.x += (dx / d) * sp * dt; q.y += (dy / d) * sp * dt; }
      for (const o of w.knolls) if (edgeR(o, q.x, q.y, 6) < 1) { onEdge(o, q.x, q.y, 6.5, OUTP); q.x = OUTP.x; q.y = OUTP.y; }
    } else if (q.state === 'down') {
      if ((q.timer -= dt) <= 0 && !(ptr.on && Math.hypot(q.x - ptr.x, q.y - ptr.y) < p.bolt)) { q.state = 'sit'; q.timer = 2 + r() * 5; q.a = r() * TAU; }
    }
  }
}

// ----- tumbleweeds -----
function stepWeeds(w, dt) {
  const p = w.params, wd = w.wind, r = wd.rand, c = Math.cos(wd.a), s = Math.sin(wd.a), n = Math.max(0, Math.round(p.weeds)), e = windSpan(w);
  const spawn = (q, anywhere) => {
    const u = anywhere ? (r() - 0.5) * 2 * e : -e - 20, v = (r() - 0.5) * (w.w + w.h);
    q.x = w.w / 2 + c * u - s * v; q.y = w.h / 2 + s * u + c * v; q.r = 4.5 + r() * 3; q.rot = r() * TAU; q.bob = r() * TAU; q.sp = 16 + r() * 14;
  };
  while (w.weeds.length < n) { const q = {}; spawn(q, true); w.weeds.push(q); }
  w.weeds.length = n;
  for (const q of w.weeds) {
    const v = (q.sp + 70 * leanAt(w, q.x, q.y)) * (w.reduced ? 0.3 : 1), side = Math.sin(w.t * 0.8 + q.bob) * 6;
    q.x += (c * v - s * side) * dt; q.y += (s * v + c * side) * dt; q.rot += (v / q.r) * dt;
    for (const o of w.knolls) if (edgeR(o, q.x, q.y, q.r) < 1) { onEdge(o, q.x, q.y, q.r + 0.5, OUTP); q.x = OUTP.x; q.y = OUTP.y; }
    const u = (q.x - w.w / 2) * c + (q.y - w.h / 2) * s, vv = -(q.x - w.w / 2) * s + (q.y - w.h / 2) * c;
    if (u > e + 30 || Math.abs(vv) > (w.w + w.h) / 2 + 30) spawn(q, false);
  }
}

// Advances the world by dt seconds. Deterministic: the only randomness is the world's own sources.
export function step(w, dt) {
  if (!(dt > 0)) return;
  const p = w.params;
  pickPalette(p);
  w.t += dt;
  for (const o of w.knolls) updateFootprint(o, w.outlines[o.i], dt, p, w.reduced, w.t);
  stepLand(w);
  if (w.horses.length !== herdTarget(w) || w.foalN !== Math.min(pick2(w, 'foals'), Math.floor(herdTarget(w) / 3))) populate(w);
  else if (w.pintoN !== Math.min(pick2(w, 'pintos'), Math.max(0, w.horses.filter((h) => !h.foal).length - 1))) markPintos(w);
  const startle = pointerSpeed(w.ptr, dt) > p.startle && !w.reduced;
  stepWind(w, dt);
  stepBands(w, dt);
  stepHerd(w, dt, startle);
  stepFeed(w, dt);
  stepHares(w, dt);
  stepWeeds(w, dt);
  if (p.study && p.studyRun) { const G = gaitAt(p.studyGait, GA), v = p.studyGait < 1 ? lerp(STEP_SPEED, p.walk, p.studyGait) : speedAt(p, p.studyGait); w.study.ph = (w.study.ph + (v / G.stride) * dt) % 1; }
  w.study.t += dt;
}
// what the herd is doing, for the checks and the profiler: the share of horses at each gait, rounded
export function gaitShare(w) { const s = [0, 0, 0, 0]; for (const h of w.horses) s[clamp(Math.round(h.g), 0, 3)]++; return s.map((v) => v / Math.max(1, w.horses.length)); }

// ----- drawing: the static layer -----
// The grass: a blade at each point of the kit's lattice, seen from above. A standing blade is a short tick turned any
// way; the wind lays it over, turning it toward the wind, lengthening it and curving it, so the more it leans the more
// the field reads as combed one way. A blade is [x, y, angle, length share] in GRASS_STRIDE floats: where it stands,
// the way it is turned standing, and its length against `blade`, all from its own point's hash. The static layer holds
// the grass at the steady breeze's lean (LEAN0); a gust is drawn by laying copies painted at a stronger lean over the
// band it covers (drawGust), so a gust costs a few clipped copies a frame, never the blades one by one.
export const GRASS = { pitch: 11, period: 24, dash: 10, reach: 16 };
const GRASS_STRIDE = 4, LEAN0 = 0.12, LEANS = [LEAN0, 0.55, 1.1], GUST_AT = [0, 0.3, 0.75];
export function grassMarks(seed, wa, W, H, density = 1, jitter = 0.6) {
  const marks = latticeMarks((seed ^ 0x67726173) >>> 0, W, H, GRASS, density, jitter), out = new Float32Array(marks.length * GRASS_STRIDE);
  marks.forEach((m, i) => {
    const [x0, y, x1] = m.pts, d = pointRand(((Math.round(m.x * 8) * 73856093) ^ (Math.round(m.y * 8) * 19349663) ^ seed) >>> 0);
    out[i * 4] = (x0 + x1) / 2; out[i * 4 + 1] = y; out[i * 4 + 2] = wa + (d() - 0.5) * 2.6; out[i * 4 + 3] = (x1 - x0) / GRASS.dash;
  });
  return out;
}
function paintGrass(ctx, G, wa, blade, lean) {
  ctx.beginPath();
  const k = Math.min(1, lean);
  for (let i = 0; i < G.length; i += GRASS_STRIDE) {
    const x = G[i], y = G[i + 1], a = G[i + 2] + wrapAngle(wa - G[i + 2]) * k, L = blade * G[i + 3] * (1 + 1.4 * lean), c = Math.cos(a), s = Math.sin(a);
    ctx.moveTo(x, y);
    if (lean < 0.2) ctx.lineTo(x + c * L, y + s * L);
    else { const b = (i & 4 ? 1 : -1) * 0.22 * L * lean; ctx.quadraticCurveTo(x + c * L * 0.5 - s * b, y + s * L * 0.5 + c * b, x + c * L, y + s * L); }
  }
  ctx.stroke();
}
// Everything on the static layer at one lean: the grass, then the creek, the trails, the waterhole, the boulders, the
// shrubs and the burrows, in ink at their own opacities.
function paintLand(ctx, d, p, colours, lean) {
  const { ink, paper } = colours, L = d.land, la = p.landAlpha;
  ctx.strokeStyle = ink; ctx.lineWidth = 1; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.globalAlpha = p.grassAlpha; paintGrass(ctx, d.grass, d.wa, p.blade, lean);
  if (!L) { ctx.globalAlpha = 1; return; }
  // the dry creek: two banks a few px apart and the pebbles between them
  if (L.creek) {
    const { xs, ys, wide } = L.creek, n = xs.length, BX = new Float32Array(n), BY = new Float32Array(n);
    ctx.globalAlpha = la;
    for (const sgn of [-1, 1]) {
      for (let i = 0; i < n; i++) { const j0 = Math.max(0, i - 1), j1 = Math.min(n - 1, i + 1), ex = xs[j1] - xs[j0], ey = ys[j1] - ys[j0], m = Math.hypot(ex, ey) || 1; BX[i] = xs[i] - (ey / m) * wide[i] * sgn; BY[i] = ys[i] + (ex / m) * wide[i] * sgn; }
      ctx.beginPath(); ctx.moveTo(BX[0], BY[0]); curveThrough(ctx, BX, BY, n); ctx.stroke();
    }
    ctx.globalAlpha = la * 0.8; ctx.beginPath();
    for (const q of L.creek.pebbles) { const x = xs[q.i], y = ys[q.i] + q.o; ctx.moveTo(x + q.s, y); ctx.arc(x, y, q.s, 0, TAU); }
    ctx.stroke();
  }
  // the trails: a pair of worn ruts, dashed
  ctx.globalAlpha = la;
  for (const [off, dash] of [[-1.8, [6, 5]], [1.8, [3, 7]]]) {
    ctx.setLineDash(dash); ctx.beginPath();
    for (const t of L.trails) {
      const P2 = t.pts, n = P2.length >> 1;
      for (let k = 0; k < n; k++) {
        const j0 = Math.max(0, k - 1), j1 = Math.min(n - 1, k + 1), ex = P2[2 * j1] - P2[2 * j0], ey = P2[2 * j1 + 1] - P2[2 * j0 + 1], m = Math.hypot(ex, ey) || 1;
        const x = P2[2 * k] - (ey / m) * off, y = P2[2 * k + 1] + (ex / m) * off;
        if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
    }
    ctx.stroke();
  }
  ctx.setLineDash([]);
  // the waterhole: its rim, a faint flat of water, and two rings in toward the middle
  if (L.water) {
    const q = L.water, path = (k) => { const m = q.rim.length; for (let i = 0; i < m; i++) { const a = (i / m) * TAU; SX[i] = q.x + Math.cos(a) * q.r * k * q.rim[i]; SY[i] = q.y + Math.sin(a) * q.r * k * q.rim[i]; } closedCurve(ctx, SX, SY, m); };
    ctx.fillStyle = ink; ctx.globalAlpha = 0.045; ctx.beginPath(); path(1); ctx.fill();
    ctx.globalAlpha = Math.min(1, la * 1.6); ctx.beginPath(); path(1); ctx.stroke();
    ctx.globalAlpha = la * 0.6; ctx.beginPath(); path(0.72); ctx.stroke(); ctx.beginPath(); path(0.45); ctx.stroke();
  }
  // the boulders and the shrubs: paper under an outline, a crack across a boulder, a few loops in a shrub
  for (const b of L.blocks) {
    if (b.kind === 'water') continue;
    ctx.beginPath();
    if (b.kind === 'rock') { const m = b.rim.length; for (let i = 0; i < m; i++) { const a = (i / m) * TAU + b.ph; SX[i] = b.x + Math.cos(a) * b.r * b.rim[i]; SY[i] = b.y + Math.sin(a) * b.r * b.rim[i]; } closedCurve(ctx, SX, SY, m); }
    else for (let i = 0; i < b.loops.length; i++) { const a = b.ph + (i / b.loops.length) * TAU, x = b.x + Math.cos(a) * b.r * 0.4, y = b.y + Math.sin(a) * b.r * 0.4, R = b.r * (0.4 + 0.3 * b.loops[i]); ctx.moveTo(x + R, y); ctx.arc(x, y, R, 0, TAU); }
    ctx.globalAlpha = 1; ctx.fillStyle = paper; ctx.fill();
    ctx.globalAlpha = Math.min(1, la * 1.8); ctx.stroke();
    if (b.kind === 'rock') { ctx.globalAlpha = la; ctx.beginPath(); const a = b.ph + b.crack * 2; ctx.moveTo(b.x - Math.cos(a) * b.r * 0.4, b.y - Math.sin(a) * b.r * 0.4); ctx.lineTo(b.x + Math.cos(a + 0.4) * b.r * 0.2, b.y + Math.sin(a + 0.4) * b.r * 0.2); ctx.stroke(); }
  }
  // the burrows: a mound's arc and the dark of the hole
  ctx.globalAlpha = la * 1.4; ctx.beginPath();
  for (const b of L.burrows) { ctx.moveTo(b.x + Math.cos(b.a - 1.4) * 6, b.y + Math.sin(b.a - 1.4) * 6); ctx.arc(b.x, b.y, 6, b.a - 1.4, b.a + 1.4); }
  ctx.stroke();
  ctx.fillStyle = ink; ctx.globalAlpha = la * 1.2; ctx.beginPath();
  for (const b of L.burrows) { ctx.moveTo(b.x + 2.2, b.y); ctx.ellipse(b.x, b.y, 2.2, 1.6, b.a, 0, TAU); }
  ctx.fill();
  ctx.globalAlpha = 1;
}

// ----- drawing: the ground -----
// A gust: the layer painted again at a stronger lean, in a copy kept beside the static layer (painted anew when the
// layer is), laid over the bands where the passing gusts lean the grass past GUST_AT, clipped to them.
function gustCopy(d, k, layer, p) {
  if (!d.copies) d.copies = [];
  let c = d.copies[k];
  if (c && c.version === d.version && c.canvas.width === layer.img.width) return c.canvas;
  if (typeof document === 'undefined') return null;
  if (!c) c = d.copies[k] = { canvas: document.createElement('canvas'), version: -1 };
  c.canvas.width = layer.img.width; c.canvas.height = layer.img.height;
  const g = c.canvas.getContext('2d', { alpha: false }), res = layer.img.width / layer.w;
  g.setTransform(res, 0, 0, res, 0, 0); g.fillStyle = layer.flat; g.fillRect(0, 0, layer.w, layer.h);
  paintLand(g, d, p, d.colours, LEANS[k] * p.lean);
  c.version = d.version; return c.canvas;
}
function drawGusts(ctx, w, layer) {
  const p = w.params, d = w.layerData, c = Math.cos(w.wind.a), s = Math.sin(w.wind.a), cx = w.w / 2, cy = w.h / 2, T = w.w + w.h;
  for (let k = 1; k < LEANS.length; k++) {
    let any = false;
    for (const g of w.wind.gusts) {
      if (g.amp <= GUST_AT[k]) continue;
      const half = p.gustWidth * (2 / Math.PI) * Math.acos(Math.sqrt(GUST_AT[k] / g.amp)), a = g.s - half, b = g.s + half;
      if (!any) { ctx.save(); ctx.beginPath(); any = true; }
      ctx.moveTo(cx + c * a + s * T, cy + s * a - c * T); ctx.lineTo(cx + c * b + s * T, cy + s * b - c * T); ctx.lineTo(cx + c * b - s * T, cy + s * b + c * T); ctx.lineTo(cx + c * a - s * T, cy + s * a + c * T); ctx.closePath();
    }
    if (!any) continue;
    const img = gustCopy(d, k, layer, p);
    if (img) { ctx.clip(); ctx.drawImage(img, 0, 0, layer.w, layer.h); }
    ctx.restore();
  }
}
// The knolls: bands of paper laid over the grass so it thins toward the knoll, the bare ground inside its edge, a
// trampled ring of hoofprints round it, and its edge.
export function drawGround(ctx, w, colours, layer = { img: null, w: 0, h: 0, flat: colours.paper }) {
  const p = w.params, { ink, paper, ochre } = colours;
  ctx.globalAlpha = 1;
  if (!layer.img || layer.w < w.w || layer.h < w.h) { ctx.fillStyle = layer.flat; ctx.fillRect(0, 0, w.w, w.h); }
  if (layer.img) ctx.drawImage(layer.img, 0, 0, layer.w, layer.h);
  if (!w.reduced && w.wind.gusts.length && layer.img && w.layerData && w.layerData.colours) drawGusts(ctx, w, layer);
  ctx.fillStyle = paper;
  for (const o of w.knolls) {
    ctx.globalAlpha = 0.3; edgePath(ctx, o, p.thin); ctx.fill();
    ctx.globalAlpha = 0.4; edgePath(ctx, o, p.thin * 0.45); ctx.fill();
    ctx.globalAlpha = 1; edgePath(ctx, o, 0); ctx.fill();
  }
  ctx.strokeStyle = ink; ctx.lineWidth = 1; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const o of w.knolls) {
    ctx.globalAlpha = p.worn; ctx.setLineDash([1.5, 4.5]); edgePath(ctx, o, 7); ctx.stroke();
    ctx.globalAlpha = p.worn * 0.6; ctx.setLineDash([1, 8]); edgePath(ctx, o, 15); ctx.stroke();
    ctx.setLineDash([]); ctx.globalAlpha = p.edgeAlpha; edgePath(ctx, o, 0); ctx.stroke();
  }
  // the wildflowers: a bud, then three petals half open, then five open, swaying with a passing gust
  const F = w.land ? w.land.flowers : [];
  if (F.length) {
    const c = Math.cos(w.wind.a), s = Math.sin(w.wind.a), t = w.t;
    ctx.strokeStyle = ochre; ctx.globalAlpha = p.floraAlpha; ctx.beginPath();
    for (const f of F) {
      if (t < f.o1) continue;
      const sw = w.wind.gusts.length ? 1.5 * leanAt(w, f.x, f.y) : 0, x = f.x + c * sw, y = f.y + s * sw, open = t >= f.o2, m = open ? 5 : 3, R = (open ? 2.1 : 1.5) * f.s;
      for (let i = 0; i < m; i++) {
        const a = f.rot + (i / m) * TAU, px = x + Math.cos(a) * R, py = y + Math.sin(a) * R;
        if (open) { const q = 1.1 * f.s; ctx.moveTo(px + q, py); ctx.arc(px, py, q, 0, TAU); } else { ctx.moveTo(x, y); ctx.lineTo(px, py); }
      }
    }
    ctx.stroke();
    ctx.strokeStyle = ink; ctx.globalAlpha = p.floraAlpha * 0.7; ctx.beginPath();
    for (const f of F) { const r0 = t < f.o1 ? 0.9 : 0.5; ctx.moveTo(f.x + r0, f.y); ctx.arc(f.x, f.y, r0, 0, TAU); }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

// ----- drawing: what moves -----
function drawHare(ctx, q) {
  const c = Math.cos(q.a), s = Math.sin(q.a), moving = q.state === 'hop' || q.state === 'bolt', st = moving ? 1 + 0.35 * Math.sin(Math.PI * q.ph) : 1;
  const hx = q.x + c * 4.4 * st, hy = q.y + s * 4.4 * st;
  ctx.beginPath(); ell(ctx, q.x, q.y, q.a, 4.2 * st, 2.6); ctx.moveTo(hx + 1.7, hy); ctx.arc(hx, hy, 1.7, 0, TAU);
  ctx.globalAlpha = 0.94; ctx.fill(); ctx.globalAlpha = HARE_ALPHA; ctx.stroke();
  // the ears: laid back along the body at a run, up and a little apart sitting
  ctx.beginPath();
  const ea = moving ? 0.12 : 0.5, el = moving ? 4.6 : 2.6;
  for (const sg of [-1, 1]) { const a = q.a + Math.PI + sg * ea; ctx.moveTo(hx - c * 0.6, hy - s * 0.6); ctx.lineTo(hx + Math.cos(a) * el, hy + Math.sin(a) * el); }
  ctx.stroke();
}
const HARE_ALPHA = 0.55;
function drawCanopy(ctx, t, ox, oy) {
  const m = t.lobes;
  for (let i = 0; i < m; i++) { const a = t.ph + (i / m) * TAU, R = t.r * t.bumps[i]; SX[i] = t.x + ox + Math.cos(a) * R; SY[i] = t.y + oy + Math.sin(a) * R; }
  // scallops: each lobe's tip as the control point, the halfway points pulled in, so the edge reads as leaf clumps
  ctx.beginPath();
  const mid = (i) => { const j = (i + 1) % m, mx = (SX[i] + SX[j]) / 2, my = (SY[i] + SY[j]) / 2; return [t.x + ox + (mx - t.x - ox) * 0.9, t.y + oy + (my - t.y - oy) * 0.9]; };
  let [mx, my] = mid(m - 1); ctx.moveTo(mx, my);
  for (let i = 0; i < m; i++) { [mx, my] = mid(i); ctx.quadraticCurveTo(SX[i] + (SX[i] - t.x - ox) * 0.12, SY[i] + (SY[i] - t.y - oy) * 0.12, mx, my); }
  ctx.closePath();
}
export function drawLive(ctx, w, colours) {
  const p = w.params, { ink, paper, ochre, chestnut } = colours, fig = clamp(Math.round(p.figure), 0, 2);
  ctx.lineWidth = p.width; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  // the apples: paper under a chestnut ring, shrinking as they are eaten and fading at the end
  if (w.feed.length) {
    ctx.fillStyle = paper; ctx.strokeStyle = chestnut;
    for (const f of w.feed) {
      const r0 = 1.4 + 1.8 * clamp(f.left, 0, 1), fade = clamp((p.last - f.age) / 3, 0, 1);
      ctx.globalAlpha = fade; ctx.beginPath(); ctx.arc(f.x, f.y, r0, 0, TAU); ctx.fill(); ctx.globalAlpha = 0.8 * fade; ctx.stroke();
    }
  }
  // the hares: paper under an ink outline
  ctx.fillStyle = paper; ctx.strokeStyle = ink;
  for (const q of w.hares) if (q.state !== 'down') drawHare(ctx, q);
  // the herd: foals and all, a paper fill under each so crossing horses read one over the other
  for (const h of w.horses) drawHorse(ctx, h, fig, ink, paper, chestnut, p.alpha);
  // dust behind a gallop, chaff where an apple is eaten
  if (w.puffs.length) {
    ctx.lineWidth = 1;
    for (const kind of [0, 1]) {
      ctx.strokeStyle = kind ? ochre : ink;
      for (const q of w.puffs) {
        if (q.kind !== kind) continue;
        const u = q.age / q.life, R = q.size + u * (kind ? 7 : 12);
        ctx.globalAlpha = (kind ? p.floraAlpha : p.dust) * (1 - u) * (1 - u); ctx.beginPath();
        for (let i = 0; i < 5; i++) { const a = q.spin + (i / 5) * TAU; if (kind) { ctx.moveTo(q.x + Math.cos(a) * R * 0.5, q.y + Math.sin(a) * R * 0.5); ctx.lineTo(q.x + Math.cos(a) * R, q.y + Math.sin(a) * R); } else { ctx.moveTo(q.x + Math.cos(a) * R, q.y + Math.sin(a) * R); ctx.arc(q.x, q.y, R, a, a + 0.5); } }
        ctx.stroke();
      }
    }
    ctx.lineWidth = p.width;
  }
  // the canopies, over everything on the ground: a horse sheltering under one is hidden by its shade
  const T = w.land ? w.land.trees : [];
  if (T.length) {
    const c = Math.cos(w.wind.a), s = Math.sin(w.wind.a), gust = w.wind.gusts.length > 0;
    ctx.fillStyle = paper; ctx.strokeStyle = ink;
    for (const t of T) {
      const l = gust ? 1.6 * leanAt(w, t.x, t.y) : 0, ox = c * l, oy = s * l;
      drawCanopy(ctx, t, ox, oy);
      ctx.globalAlpha = p.shade; ctx.fill(); ctx.globalAlpha = p.canopy; ctx.stroke();
      ctx.globalAlpha = p.canopy * 0.55; ctx.beginPath();
      for (const q of t.clumps) { const x = t.x + ox + Math.cos(q.a) * q.d * t.r, y = t.y + oy + Math.sin(q.a) * q.d * t.r, R = q.s * t.r; ctx.moveTo(x + Math.cos(q.t) * R, y + Math.sin(q.t) * R); ctx.arc(x, y, R, q.t, q.t + 2.2); }
      ctx.stroke();
    }
  }
  // the tumbleweeds: a ring and three chords turning as it rolls
  if (w.weeds.length) {
    ctx.strokeStyle = ink; ctx.globalAlpha = p.alpha * 0.7; ctx.beginPath();
    for (const q of w.weeds) {
      ctx.moveTo(q.x + q.r, q.y); ctx.arc(q.x, q.y, q.r, 0, TAU);
      for (let i = 0; i < 3; i++) { const a = q.rot + i * 2.1; ctx.moveTo(q.x + Math.cos(a) * q.r, q.y + Math.sin(a) * q.r); ctx.lineTo(q.x + Math.cos(a + 2.4) * q.r, q.y + Math.sin(a + 2.4) * q.r); }
    }
    ctx.stroke();
  }
  if (p.study) drawStudy(ctx, w, colours);
  ctx.globalAlpha = 1;
}
// The pose study: one horse at studyScale times the herd's size in the middle of the page, or the sheet of every gait at
// eight phases, over a paper panel, posed from the study's sliders.
function drawStudy(ctx, w, colours) {
  const p = w.params, { ink, paper, chestnut } = colours, fig = clamp(Math.round(p.figure), 0, 2);
  const patches = p.studyPinto ? pintoPatches(0x5eed1) : null, mk = (x, y, size, g, ph) => ({ x, y, a: 0, bend: p.studyTurn, g, ph, t: w.study.t, side: 1, seed: 1, size, patches });
  ctx.globalAlpha = 0.95; ctx.fillStyle = paper; ctx.fillRect(0, 0, w.w, w.h);
  ctx.fillStyle = ink; ctx.font = '11px ui-monospace, Menlo, monospace'; ctx.textBaseline = 'top';
  ctx.globalAlpha = 0.7; ctx.fillText(`pose study: ${FIGURES[fig]}; a still shows the pose, not the motion`, 24, 92);
  ctx.lineWidth = p.width;
  if (p.sheet) {
    const cols = 8, cw = (w.w - 140) / cols, rh = (w.h - 140) / 4, size = Math.min(cw / 2.3, rh / 1.1);
    for (let g = 0; g < 4; g++) {
      const y = 130 + rh * (g + 0.5);
      ctx.globalAlpha = 0.7; ctx.fillStyle = ink; ctx.fillText(GAITS[g].name, 24, y - 6);
      for (let k = 0; k < cols; k++) drawHorse(ctx, mk(110 + cw * (k + 0.5), y, size, g, k / cols), fig, ink, paper, chestnut, p.alpha);
    }
  } else {
    const ph = p.studyRun ? w.study.ph : p.studyPhase, size = p.size * p.studyScale;
    drawHorse(ctx, mk(w.w / 2 - size * 0.2, w.h / 2 + 30, size, p.studyGait, ph), fig, ink, paper, chestnut, p.alpha);
    ctx.globalAlpha = 0.7; ctx.fillStyle = ink; ctx.fillText(`gait ${p.studyGait.toFixed(2)}  phase ${ph.toFixed(2)}  turn ${p.studyTurn}`, 24, 110);
  }
  ctx.globalAlpha = 1;
}

// ----- the scene -----
export const scene = {
  PARAMS,
  palette: PALETTE,
  createWorld, resizeWorld, step,
  setSources, setOutlines, setPointer,
  hit: knollAt, drop: dropFeed,
  strokeStart, strokeTo, strokeEnd, strokeCancel,
  // clear the ground: every apple and every puff goes
  clear(w) { w.feed.length = 0; w.puffs.length = 0; for (const h of w.horses) h.food = null; },
  // the grass and the land: made anew for a new size, layout, density or jitter; repainted for a new look
  layer: {
    key: (w, p) => `${w.seed} ${w.landKey} ${p.grassDensity} ${p.grassJitter}`,
    make: (w, p, W, H) => { const d = { grass: grassMarks(w.seed, w.wind.a, W, H, p.grassDensity, p.grassJitter), wa: w.wind.a, land: w.land, version: 0, colours: null }; w.layerData = d; return d; },
    look: (p) => `${p.grassAlpha} ${p.blade} ${p.landAlpha} ${p.palette} ${p.lean}`,
    paint: (ctx, d, p, colours) => { paintLand(ctx, d, p, colours, LEAN0); d.colours = { ink: colours.ink, paper: colours.paper }; d.version++; },
  },
  drawGround, drawLive,
};
