// Home prairie: the page seen from above as open grassland, with the two home objects standing in ponds. A herd
// of cows grazes between them in bands that part and come back together behind a lead cow, a few of them pied
// with chestnut patches and a few calves keeping to their mothers; they walk from one grazing spot to the next along
// worn trails, trot to catch up, walk down to the ponds now and then to drink, and run for the trees when a fast
// cursor spooks them, as many under each canopy as it shelters and the rest round it, then drift back out to graze.
// No two cows ever overlap: each is a body on one ground plane. Wind runs over the grass in gusts that lay the blades over as they pass,
// tumbleweeds roll before it, wildflowers open through the visit, hares sit by their burrows and bolt from the cursor,
// and a press or a drag scatters apples the cows near it turn and trot to eat. The layer sits behind reading text, so the resting
// picture is calm: most of the herd has its head down most of the time.
//
// The simulation is kept apart from the drawing. createWorld() builds a state and step() advances it by dt with the
// world's own seeded random source, touching nothing else, so a seed fixes a run and tools/check-prairie.mjs drives it
// headless. The ponds are the kit's footprints (scenes/kit.js); `scene` at the foot of the file is the descriptor the
// kit's shell mounts, and the contract it fills is the head of scenes/kit.js.
import {
  FOOTPRINT, GROUND, rng, TAU, wrapAngle, pointRand, placeFootprints, updateFootprint,
  edge, edgeR, edgeGap, onEdge, edgeNormal, footprintAt, edgePath, pointer, pointTo, pointerSpeed, strokeOpen, strokeAlong, strokeClose,
  latticeMarks, curveThrough, tint,
} from './kit.js';

// Parameters by section: [default, min, max, step, label] or [value, 'toggle', label].
export const PARAMS = {
  herd: {
    count: [36, 1, 90, 1, 'cows on a fine pointer'],
    countTouch: [16, 1, 90, 1, 'cows on a coarse pointer'],
    calves: [4, 0, 12, 1, 'calves among them on a fine pointer'],
    calvesTouch: [2, 0, 12, 1, 'calves on a coarse pointer'],
    pied: [11, 0, 24, 1, 'pied cows, with chestnut patches, on a fine pointer'],
    piedTouch: [5, 0, 24, 1, 'pied cows on a coarse pointer'],
    spacing: [1.7, 0.8, 4, 0.05, 'room a grazing cow keeps from the next, body lengths'],
    keep: [24, 4, 120, 1, 'mean time a band grazes one spot before the lead cow moves on, s'],
    roam: [240, 60, 600, 10, 'how far the lead cow leads to the next spot, px'],
    split: [55, 10, 300, 5, 'mean time between one band parting in two, s'],
    rejoin: [28, 5, 120, 1, 'mean time a band that parted stays apart, s'],
    trail: [0.8, 0, 3, 0.05, 'pull of a worn trail on a walking cow'],
    girth: [0.25, 0.05, 0.6, 0.01, 'half the body\'s width, body lengths: the capsule no other cow may enter'],
    rump: [0.56, 0.1, 1, 0.01, 'the rump\'s distance behind the body\'s middle, body lengths'],
    room: [0.5, 0, 2, 0.05, 'least room a grazing cow leaves to its neighbours, body lengths'],
    crowd: [1.6, 0.5, 6, 0.1, 'room under a canopy per sheltering cow, square body lengths'],
    drink: [300, 10, 900, 5, 'mean time between one cow\'s walks to the water, s'],
    drinkers: [3, 0, 12, 1, 'cows at the water at once, at most'],
    sip: [4, 1, 20, 0.5, 'time a cow stands drinking, s'],
  },
  gait: {
    size: [26, 8, 40, 1, 'body length, rump to shoulder, px'],
    walk: [0.9, 0.2, 3, 0.05, 'walking speed, body lengths per s'],
    trot: [2.2, 0.5, 6, 0.05, 'trotting speed, body lengths per s'],
    run: [5.5, 1, 12, 0.1, 'running speed, body lengths per s'],
    turn: [2.2, 0.2, 8, 0.1, 'turn rate at a walk, rad/s'],
    horns: [0, 'toggle', 'horns: the longhorn\'s short pair beside the ears; off, polled'],
    alpha: [0.55, 0.05, 1, 0.01, 'ink opacity'],
    width: [1, 0.3, 3, 0.05, 'line width, px'],
  },
  study: {
    study: [0, 'toggle', 'pose study: one cow at large scale over the page'],
    sheet: [0, 'toggle', 'study sheet: every gait at eight phases instead of one cow'],
    studyGait: [1, 0, 3, 0.05, 'gait: 0 graze, 1 walk, 2 trot, 3 run'],
    studyPhase: [0, 0, 1, 0.01, 'stride phase'],
    studyRun: [1, 'toggle', 'run the stride at the gait\'s own pace'],
    studyTurn: [0, -1.5, 1.5, 0.05, 'turn, rad per body length'],
    studyScale: [8, 2, 12, 0.5, 'scale of the study over the herd\'s'],
    studyPied: [0, 'toggle', 'study a pied cow'],
  },
  ponds: {
    ...FOOTPRINT,
    shore: [10, 0, 60, 1, 'gap a cow keeps from a pond, px'],
    look: [60, 0, 300, 5, 'distance at which a cow starts to steer round, px'],
    edge: [50, 0, 300, 5, 'screen margin where cows turn back, px'],
    water: [0.12, 0, 0.6, 0.005, 'how far the water is taken from the page toward its blue-green'],
    markDensity: [1, 0, 3, 0.05, 'how close the hatch on the water is laid, dashes per area x this'],
    markJitter: [0.35, 0, 1, 0.05, 'how loosely the hatch\'s dashes are laid, 0 a strict lattice'],
    markAlpha: [0.1, 0, 1, 0.01, 'opacity of the hatch on the water'],
    edgeAlpha: [0.3, 0, 1, 0.01, 'opacity of a pond\'s shore line'],
    reeds: [0.28, 0, 1, 0.01, 'opacity of the reeds at the shore'],
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
    gustEvery: [8, 1, 30, 0.5, 'mean time between gusts, s'],
    gustSpeed: [150, 20, 600, 10, 'speed a gust runs over the grass, px/s'],
    gustWidth: [150, 40, 500, 10, 'width of a gust\'s front, px'],
    lean: [1, 0, 2, 0.05, 'how far a gust lays the grass over'],
    dust: [0.3, 0, 1, 0.01, 'opacity of the dust behind a running cow'],
  },
  feed: {
    sense: [320, 0, 900, 10, 'how far a cow notices an apple, px'],
    eat: [3, 0.5, 15, 0.5, 'time one cow takes over an apple, s'],
    last: [45, 5, 300, 5, 'seconds before an uneaten apple is gone'],
    max: [30, 1, 90, 1, 'apples down at once; the oldest goes first'],
    gap: [26, 4, 200, 1, 'gap between apples dropped along a drag, px'],
    startle: [800, 100, 4000, 50, 'cursor speed that spooks, px/s'],
    scare: [150, 0, 500, 5, 'spook radius, px'],
    alarm: [90, 0, 300, 5, 'how far a spooked cow spooks the next, px'],
    calm: [7, 1, 30, 0.5, 'time a spooked cow takes to settle, s'],
    lure: [0.5, 0, 1, 0.01, 'alarm under which a cow still goes for an apple; a press calms the cows near it to under this'],
  },
  land: {
    groves: [3, 0, 6, 1, 'stands of trees on a fine pointer'],
    grovesTouch: [2, 0, 6, 1, 'stands of trees on a coarse pointer'],
    boulders: [6, 0, 16, 1, 'boulders on a fine pointer'],
    bouldersTouch: [3, 0, 16, 1, 'boulders on a coarse pointer'],
    creek: [1, 'toggle', 'a dry creek bed'],
    landAlpha: [0.24, 0, 1, 0.01, 'opacity of the trails and the creek'],
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

// ----- the cow, seen from straight above -----
// A cow is posed on its own frame: x forward along the spine (the nose at +), y to its right, one unit the body's
// length from the pin bones to the point of the shoulder. Its spine bends with the turn: the body by `bend` radians per
// unit, the neck by half again that, so a turning cow leads with its head. A point (u, v) of the frame is put on the
// page by walking u along the bent spine from the body's middle and v along the normal there.
//
// The gait sets the legs. Each leg has a phase in its stride: in stance the hoof is on the ground and travels back
// under the body from +reach to -reach; in swing it lifts, folds in toward its root and swings forward again. From
// above a cow's legs are hidden under its wide body: what reads is a fore hoof reaching past the shoulder beside the
// neck and a hind hoof trailing past the rump, each in its turn. GAITS lists, for graze, walk, trot and run: the
// phase offset of each leg (left hind, left fore, right hind, right fore), the share of the cycle a hoof stands, the
// reach, the body lengths covered per stride, how far the neck carries the head, how long the head reads from above,
// the spine's flex, the head's nod, the tail's length and its swing. A gait between two of them is the blend of both.
export const GAITS = [
  // graze: a slow step now and then; the head dropped to the grass and stretched forward past a long neck, its face
  // foreshortened as it points down; the tail swishing at flies
  { name: 'graze', off: [0, 0.25, 0.5, 0.75], duty: 0.75, reach: 0.14, stride: 0.45, neck: 0.18, head: 0.22, flex: 0, nod: 0, tail: 0.3, swing: 0 },
  // walk: four beats, lateral sequence; the head tucked back against the shoulders, nodding with each fore step
  { name: 'walk', off: [0, 0.25, 0.5, 0.75], duty: 0.62, reach: 0.25, stride: 0.7, neck: 0.04, head: 0.27, flex: 0, nod: 0.02, tail: 0.3, swing: 0.1 },
  // trot: two beats, diagonal pairs, the head steady
  { name: 'trot', off: [0, 0.5, 0.5, 1], duty: 0.45, reach: 0.3, stride: 0.95, neck: 0.06, head: 0.27, flex: 0.01, nod: 0.01, tail: 0.34, swing: 0.45 },
  // run: heavy and transverse, the hinds then the fores; the head thrust out, the spine flexing, the tail up
  { name: 'run', off: [0, 0.62, 0.12, 0.5], duty: 0.32, reach: 0.37, stride: 1.4, neck: 0.1, head: 0.28, flex: 0.04, nod: 0.04, tail: 0.42, swing: 1 },
];
const GAIT_KEYS = ['duty', 'reach', 'stride', 'neck', 'head', 'flex', 'nod', 'tail', 'swing'];
// the neck leaves the shoulders at NB along the spine; past it the spine bends half again as hard
const NB = 0.5;
// [along the spine, side] of each leg's root: left hind, left fore, right hind, right fore, under the shoulder and the
// hip, so a fore hoof shows past the shoulder and a hind hoof past the rump on each stride
const LEGS = [[-0.4, -1], [0.36, -1], [-0.4, 1], [0.36, 1]];
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (t) => t * t * (3 - 2 * t);
// the blend of the two gaits either side of g (0 graze .. 3 run), written into out
export function gaitAt(g, out = {}) {
  const i = clamp(Math.floor(g), 0, 2), t = clamp(g - i, 0, 1), A = GAITS[i], B = GAITS[i + 1];
  for (const k of GAIT_KEYS) out[k] = lerp(A[k], B[k], t);
  if (!out.off) out.off = [0, 0, 0, 0];
  for (let j = 0; j < 4; j++) out.off[j] = lerp(A.off[j], B.off[j], t);
  return out;
}
// The frame of one draw, filled by poseCow and read by the figure.
const P = { G: {}, hx: 0, hy: 0, ca: 1, sa: 0, s: 1, bend: 0, neck: 0, head: 0, flex: 1, rx: 0, ry: 0, rt: 0, rc: 1, rs: 0, hoof: new Float32Array(8) };
const PT = { x: 0, y: 0 };
// a circular arc of curvature k, d along: [x, y, heading] from its start
const ARC = [0, 0, 0];
// (for the small bends a cow carries, k d under 0.6, a series to the fourth order stands in for the trig: the herd's
// drawing calls this some thousands of times a frame)
function arc(k, d) {
  const t = k * d;
  if (Math.abs(t) < 0.6) { const t2 = t * t; ARC[0] = d * (1 - t2 / 6 + (t2 * t2) / 120); ARC[1] = d * t * (0.5 - t2 / 24); }
  else { ARC[0] = Math.sin(t) / k; ARC[1] = (1 - Math.cos(t)) / k; }
  ARC[2] = t; return ARC;
}
// the page point of frame (u, v), into PT
function at(u, v) {
  const k = P.bend, w = NB;
  let px, py, th;
  if (u <= w) { arc(k, u); px = ARC[0]; py = ARC[1]; th = ARC[2]; }
  else {
    // the neck's root (the shoulders' point) is the same for every point of one pose: poseCow sets it
    arc(1.5 * k, u - w);
    const c = P.rc, s = P.rs; px = P.rx + c * ARC[0] - s * ARC[1]; py = P.ry + s * ARC[0] + c * ARC[1]; th = P.rt + ARC[2];
  }
  let sn, cs; if (Math.abs(th) < 0.6) { const t2 = th * th; sn = th * (1 - t2 / 6); cs = 1 - t2 / 2 + (t2 * t2) / 24; } else { sn = Math.sin(th); cs = Math.cos(th); }
  const lx = (px - sn * v) * P.s, ly = (py + cs * v) * P.s;
  PT.x = P.hx + P.ca * lx - P.sa * ly; PT.y = P.hy + P.sa * lx + P.ca * ly; return PT;
}
// A cow's draw state: { x, y, a (heading), bend (rad per unit), g (gait 0..3), ph (stride phase 0..1), t (its own
// clock, s), side (+-1, the side its calf keeps to), seed, patches (null or its coat's patches), size (px per unit) }.
export function poseCow(h) {
  const G = gaitAt(h.g, P.G);
  P.hx = h.x; P.hy = h.y; P.ca = Math.cos(h.a); P.sa = Math.sin(h.a); P.s = h.size; P.bend = h.bend;
  arc(h.bend, NB); P.rx = ARC[0]; P.ry = ARC[1]; P.rt = ARC[2]; P.rc = Math.cos(P.rt); P.rs = Math.sin(P.rt);
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
    const fold = 1 - lift * (ru > 0 ? 0.5 : 0.3);
    P.hoof[2 * j] = ru * P.flex + d * fold;
    P.hoof[2 * j + 1] = side * (0.13 + 0.02 * lift);
  }
  return P;
}
// The nose's distance ahead of the body's middle, in body units, for a gait: what a cow must keep clear ahead.
export const noseReach = (g) => { const G = gaitAt(g, NR); return NB + G.neck + G.head; };
const NR = {};

// The outline's half width along the frame, as [u, half width] stations. The body is a broad slab, its width near half
// its length: the rump square across the pin bones, the hips swelling into one lobe, a slight waist, the shoulders
// into the other, then narrowing hard into a short neck (stretched over P.neck). The head (over P.head) is a block set
// off from the neck by the throat, widest at the poll where the ears leave it, blunt at the muzzle. The body's
// stations stretch with the run's flex.
const BODY = [[-0.565, 0], [-0.555, 0.11], [-0.515, 0.19], [-0.44, 0.24], [-0.34, 0.252], [-0.24, 0.245], [-0.13, 0.224], [-0.02, 0.22], [0.1, 0.234], [0.22, 0.248], [0.33, 0.244], [0.41, 0.22], [0.465, 0.17], [0.5, 0.11]];
const NECK = [[0.3, 0.08], [0.8, 0.075]];
const HEAD = [[0, 0.078], [0.15, 0.105], [0.4, 0.1], [0.7, 0.085], [0.9, 0.072], [1, 0.05], [1.03, 0]];
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
// the body's half width at u (unflexed), between its stations
function girthAt(u) {
  for (let i = 1; i < BODY.length; i++) if (u <= BODY[i][0]) { const [u0, w0] = BODY[i - 1], [u1, w1] = BODY[i]; return lerp(w0, w1, (u - u0) / (u1 - u0)); }
  return BODY[BODY.length - 1][1];
}
function closedCurve(ctx, X, Y, n) {
  ctx.moveTo((X[n - 1] + X[0]) / 2, (Y[n - 1] + Y[0]) / 2);
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; ctx.quadraticCurveTo(X[i], Y[i], (X[i] + X[j]) / 2, (Y[i] + Y[j]) / 2); }
  ctx.closePath();
}
// a closed smooth path round body, neck and head: down the right side from rump to muzzle and back up the left
function silhouette(ctx) {
  const m = stations(); let k = 0;
  for (let i = 0; i < m; i++) { at(ST[2 * i], ST[2 * i + 1]); BX[k] = PT.x; BY[k] = PT.y; k++; }
  for (let i = m - 2; i >= 1; i--) { at(ST[2 * i], -ST[2 * i + 1]); BX[k] = PT.x; BY[k] = PT.y; k++; }
  BN = k; closedCurve(ctx, BX, BY, k);
}
// the last silhouette traced, replayed without tracing it again
const BX = new Float32Array(64), BY = new Float32Array(64);
let BN = 0;
const outline = (ctx) => closedCurve(ctx, BX, BY, BN);
const seg = (ctx, u0, v0, u1, v1) => { at(u0, v0); ctx.moveTo(PT.x, PT.y); at(u1, v1); ctx.lineTo(PT.x, PT.y); };
// the legs, root to hoof, drawn under the body: only the reach past the shoulder or the rump shows
function legs(ctx) {
  for (let j = 0; j < 4; j++) { const [ru, side] = LEGS[j]; seg(ctx, ru * P.flex, side * 0.08, P.hoof[2 * j], P.hoof[2 * j + 1]); }
}
// The ears: one leaf off each side of the poll, standing straight out, the strongest cue a cow from above gives; never
// shorter than 3 px so they survive at the herd's size.
function ears(ctx) {
  const u = NB * P.flex + P.neck + 0.15 * P.head;
  for (const sg of [-1, 1]) {
    // a leaf: from the front root out along its leading edge, round the tip and back in along its trailing edge
    at(u + 0.03, sg * 0.098); const ax = PT.x, ay = PT.y;
    at(u - 0.035, sg * 0.094); const bx = PT.x, by = PT.y, mx = (ax + bx) / 2, my = (ay + by) / 2;
    at(u + 0.008, sg * 0.245);
    const dx = PT.x - mx, dy = PT.y - my, L = Math.hypot(dx, dy) || 1, k = Math.max(L, 3) / L, tx = mx + dx * k, ty = my + dy * k;
    ctx.moveTo(ax, ay); ctx.quadraticCurveTo(ax + dx * 0.55, ay + dy * 0.55, tx, ty); ctx.quadraticCurveTo(bx + dx * 0.6, by + dy * 0.6, bx, by);
  }
}
// The longhorn's horns: a short pair off the poll just ahead of the ears, curving out and forward.
function horns(ctx) {
  const u = NB * P.flex + P.neck + 0.3 * P.head;
  for (const sg of [-1, 1]) { at(u, sg * 0.098); ctx.moveTo(PT.x, PT.y); at(u + 0.005, sg * 0.19); const cx = PT.x, cy = PT.y; at(u + 0.09, sg * 0.23); ctx.quadraticCurveTo(cx, cy, PT.x, PT.y); }
}
// The tail: a line off the rump ending in a tuft. It hangs at a walk and swishes at flies grazing; at a run it lifts
// and streams. The tuft is a small closed drop round the line's end, never under 1.8 px across.
function tail(ctx, h) {
  const G = P.G, L = G.tail, u0 = -0.55 * P.flex;
  const sw = (1 - Math.min(1, h.g)) * 0.55 * Math.sin(h.t * 1.9 + h.seed) + 0.2 * Math.sin(h.t * 0.7 + h.seed * 2) - 0.5 * h.bend * L;
  const wave = Math.sin(h.t * (4 + 7 * G.swing)) * 0.05 * (0.3 + G.swing);
  // a quadratic from the root through a waving middle to the end, in the frame
  const mu = u0 - L * 0.5, mv = sw * L * 0.4 + wave, eu = u0 - L, ev = sw * L - wave;
  at(u0, 0); ctx.moveTo(PT.x, PT.y);
  for (let i = 1; i <= 4; i++) { const t = i / 4, b = 2 * t * (1 - t), c = t * t; at((1 - t) * (1 - t) * u0 + b * mu + c * eu, b * mv + c * ev); ctx.lineTo(PT.x, PT.y); }
  const du = eu - mu, dv = ev - mv, n = Math.hypot(du, dv) || 1, tu = du / n, tv = dv / n;
  const len = Math.max(0.1, 2.6 / P.s), wd = Math.max(0.028, 0.9 / P.s);
  at(eu + tu * len * 0.35, ev + tv * len * 0.35); SX[0] = PT.x; SY[0] = PT.y;
  at(eu - tu * len * 0.25 - tv * wd, ev - tv * len * 0.25 + tu * wd); SX[1] = PT.x; SY[1] = PT.y;
  at(eu - tu * len * 0.65, ev - tv * len * 0.65); SX[2] = PT.x; SY[2] = PT.y;
  at(eu - tu * len * 0.25 + tv * wd, ev - tv * len * 0.25 - tu * wd); SX[3] = PT.x; SY[3] = PT.y;
  closedCurve(ctx, SX, SY, 4);
}
// The coat's patches: two or three large flat shapes over the hindquarters, the shoulders and the middle, from the
// patch seed alone: an irregular blob wide enough that it often runs out to the body's edge, where it is cut along the
// outline (no clip: a clip a cow cost the GPU more than the herd; the blob's points are held inside the half width).
export function coatPatches(seed) {
  const r = pointRand(seed), n = 2 + (r() < 0.5 ? 1 : 0), out = [], spots = [-0.32, 0.25, -0.04], m = 9;
  for (let k = 0; k < n; k++) {
    const cu = spots[k] + (r() - 0.5) * 0.12, cv = (r() < 0.5 ? -1 : 1) * (0.05 + r() * 0.15), ru = 0.13 + r() * 0.08, rv = 0.2 + r() * 0.12, U = [], V = [];
    for (let i = 0; i < m; i++) {
      const a = (i / m) * TAU, q = 0.55 + 0.7 * r(), u = clamp(cu + Math.cos(a) * ru * q, -0.5, 0.42), lim = 0.88 * girthAt(u);
      U.push(u); V.push(clamp(cv + Math.sin(a) * rv * q, -lim, lim));
    }
    out.push({ U, V });
  }
  return out;
}
function patches(ctx, h, colour) {
  ctx.fillStyle = colour; ctx.beginPath();
  for (const { U, V } of h.patches) {
    const m = U.length;
    for (let i = 0; i < m; i++) { at(U[i] * P.flex, V[i]); SX[i] = PT.x; SY[i] = PT.y; }
    closedCurve(ctx, SX, SY, m);
  }
  ctx.fill();
}
const ell = (ctx, x, y, a, rx, ry) => { ctx.moveTo(x + Math.cos(a) * rx, y + Math.sin(a) * rx); ctx.ellipse(x, y, rx, ry, a, 0, TAU); };

// One cow in ink over a paper fill; alpha is the ink's. The tail and the legs go down first, under the body, so a leg
// shows only where its hoof reaches past the shoulder or the rump; then the outline round body, neck and head over its
// paper, the coat's patches flat in the accent, and the ears (and a longhorn's horns) off the poll.
export function drawCow(ctx, h, horned, ink, paper, accent, alpha) {
  poseCow(h);
  ctx.strokeStyle = ink; ctx.globalAlpha = alpha;
  ctx.beginPath(); tail(ctx, h); legs(ctx); ctx.stroke();
  ctx.globalAlpha = 0.94; ctx.fillStyle = paper; ctx.beginPath(); silhouette(ctx); ctx.fill();
  if (h.patches && accent) { ctx.globalAlpha = 0.85; patches(ctx, h, accent); ctx.beginPath(); outline(ctx); }
  ears(ctx); if (horned) horns(ctx);
  ctx.globalAlpha = alpha; ctx.stroke();
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
    ponds: [], outlines: [], ptr: pointer(), stroke: null,
    cows: [], bands: [], nextBand: 1, splitT: 0, splits: 0, merges: 0,
    feed: [], puffs: [], eaten: 0, drops: 0, drinks: 0,
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
export function setSources(w, boxes) { placeFootprints(w.ponds, w.outlines, boxes, w.params, w.reduced, w.t); }
export function setOutlines(w, fns) { w.outlines = fns || []; }
export function setPointer(w, x, y, on) { pointTo(w.ptr, x, y, on); }
export function pondAt(w, x, y) { return footprintAt(w.ponds, x, y); }
// An apple dropped on open ground; one dropped on a boulder or a shrub rolls off it.
export function dropFeed(w, x, y) {
  if (footprintAt(w.ponds, x, y) >= 0) return;
  for (const b of blocksOf(w)) { const d = Math.hypot(x - b.x, y - b.y); if (d < b.r + 4) { const k = (b.r + 4) / Math.max(1e-6, d); x = b.x + (x - b.x) * k; y = b.y + (y - b.y) * k; } }
  w.feed.push({ x, y, left: 1, age: 0, eater: null }); w.drops++;
  // the rattle of an apple: a cow that hears it is calmed enough to come for it
  const p = w.params;
  for (const h of w.cows) if (h.alarm > p.lure * 0.8 && Math.hypot(h.x - x, h.y - y) < p.sense) h.alarm = p.lure * 0.8;
  while (w.feed.length > Math.max(1, w.params.max)) w.feed.shift();
}
const landAt = (w) => (x, y) => footprintAt(w.ponds, x, y), feedOn = (w) => (x, y) => dropFeed(w, x, y);
export function strokeStart(w, x, y) { w.stroke = strokeOpen(x, y, w.params.gap); }
export function strokeTo(w, x, y) { strokeAlong(w.stroke, x, y, w.params.gap, landAt(w), feedOn(w)); }
export function strokeEnd(w) { const s = w.stroke; w.stroke = null; strokeClose(s, feedOn(w)); }
export function strokeCancel(w) { w.stroke = null; }
function puff(w, x, y, size, life, kind = 0) { if (w.puffs.length < 160) w.puffs.push({ x, y, size, life, age: 0, kind, spin: w.rand() * TAU }); }

// ----- the land -----
// Everything that stands still: the stands of trees (canopies over a few shrubs), the boulders, the hares' burrows,
// the drifts of wildflowers, the dry creek and the trails worn between the ponds (the two footprints) and
// the trees. It is laid from the world's seed, the page size and where the ponds stand (to 60 px), so it is laid
// anew only when one of those changes, and the same inputs lay the same land. Its own random stream keeps the world's
// untouched. The blocks are what a cow walks round: the boulders and the shrubs.
const TOP = 80, MARGIN = 30;
export const blocksOf = (w) => (w.land ? w.land.blocks : []);
function landKey(w) {
  const p = w.params, k = w.ponds.map((o) => `${Math.round(o.bx / 60)},${Math.round(o.by / 60)}`).join(';');
  return `${Math.round(w.w / 40)} ${Math.round(w.h / 40)} ${k} ${pick2(w, 'groves')} ${pick2(w, 'boulders')} ${pick2(w, 'hares')} ${pick2(w, 'drifts')} ${p.creek}`;
}
const pondGap = (w, x, y) => { let g = Infinity; for (const o of w.ponds) g = Math.min(g, edgeGap(o, x, y, 0)); return g; };
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
  // the stands of trees: apart from the ponds and one another
  const nG = pick2(w, 'groves');
  for (let g = 0; g < nG; g++) {
    const at = best(60, 50, (x, y) => pondGap(w, x, y) > 90 && blockGap(x, y) > 70 && L.groves.every((q) => Math.hypot(q.x - x, q.y - y) > 260),
      (x, y) => Math.min(pondGap(w, x, y), 300) + Math.min(300, ...L.groves.map((q) => Math.hypot(q.x - x, q.y - y)), 300));
    if (!at) continue;
    const G = { x: at.x, y: at.y, r: 0, trees: [] }, nt = 2 + Math.floor(r() * 2.6);
    for (let t = 0; t < nt; t++) {
      const a = r() * TAU, d = t ? 18 + r() * 22 : 0, R = 19 + r() * 11, lobes = 8 + Math.floor(r() * 5);
      const tree = { x: G.x + Math.cos(a) * d, y: G.y + Math.sin(a) * d, r: R, lobes, ph: r() * TAU, bumps: wobble(lobes, 0.88, 1.06), clumps: Array.from({ length: 4 + Math.floor(r() * 3) }, () => ({ a: r() * TAU, d: r() * 0.6, s: 0.18 + r() * 0.12, t: r() * TAU })) };
      G.trees.push(tree); L.trees.push(tree); G.r = Math.max(G.r, d + R);
    }
    const ns = 2 + Math.floor(r() * 3);
    for (let s = 0; s < ns; s++) {
      const a = r() * TAU, R = 6 + r() * 5, d = G.r + R + 22 + r() * 22, x = G.x + Math.cos(a) * d, y = G.y + Math.sin(a) * d;
      if (!inside(x, y, R) || pondGap(w, x, y) < R + 30 || blockGap(x, y) < R + 14) continue;
      L.blocks.push({ x, y, r: R, kind: 'shrub', loops: wobble(4, 0.5, 1), ph: r() * TAU });
    }
    L.groves.push(G);
  }
  // the boulders: out on the grass
  const nR = pick2(w, 'boulders');
  for (let i = 0; i < nR; i++) {
    const R = 5 + r() * 10;
    let at = null;
    for (let k = 0; k < 40 && !at; k++) {
      const x = MARGIN + r() * (W - 2 * MARGIN), y = TOP + r() * (H - TOP - MARGIN);
      if (inside(x, y, R) && pondGap(w, x, y) > R + 50 && blockGap(x, y) > R + 16 && L.groves.every((g) => Math.hypot(g.x - x, g.y - y) > g.r + R + 24)) at = { x, y };
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
      if (!inside(x, y, 4) || pondGap(w, x, y) < 40 || blockGap(x, y) < 6 || L.burrows.some((b) => Math.hypot(b.x - x, b.y - y) < 30)) continue;
      L.burrows.push({ x, y, a: r() * TAU }); break;
    }
  }
  // the drifts of wildflowers: each a loose cloud, each flower opening on its own time through the visit
  const nD = pick2(w, 'drifts');
  for (let d = 0; d < nD; d++) {
    const at = best(30, 40, (x, y) => pondGap(w, x, y) > 70 && blockGap(x, y) > 40, () => 0);
    if (!at) continue;
    const n = 9 + Math.floor(r() * 8);
    for (let i = 0; i < n; i++) {
      const a = r() * TAU, rr = 30 * Math.sqrt(-2 * Math.log(1 - r() * 0.95)) * 0.6, x = at.x + Math.cos(a) * rr, y = at.y + Math.sin(a) * rr;
      if (!inside(x, y, 3) || pondGap(w, x, y) < 46 || blockGap(x, y) < 5) continue;
      const o1 = 3 + r() * 0.5 * p.bloom;
      L.flowers.push({ x, y, o1, o2: o1 + 4 + r() * 0.5 * p.bloom, rot: r() * TAU, s: 0.8 + r() * 0.5, drift: d });
    }
  }
  // the dry creek: a meander in from one side and out another, kept off the ponds and the water
  if (p.creek) {
    const xs = [], ys = [], fromLeft = r() < 0.5;
    let x = fromLeft ? -10 : W * (0.2 + r() * 0.6), y = fromLeft ? TOP + (H - TOP) * (0.3 + r() * 0.5) : H + 10, a = fromLeft ? (r() - 0.5) * 0.6 : -Math.PI / 2 + (r() - 0.5) * 0.6, turn = 0;
    const a0 = a;
    for (let i = 0; i < 400; i++) {
      xs.push(x); ys.push(y);
      if (x < -20 || x > W + 20 || y < TOP - 20 || y > H + 20) { if (i > 3) break; }
      turn = clamp(turn + (r() - 0.5) * 0.25, -0.12, 0.12); a += turn; a = a0 + clamp(wrapAngle(a - a0), -0.9, 0.9);
      x += Math.cos(a) * 14; y += Math.sin(a) * 14;
      for (const o of w.ponds) { const g = edgeGap(o, x, y, 70); if (g < 0) { onEdge(o, x, y, 70, OUTP); x = OUTP.x; y = OUTP.y; } }
    }
    L.creek = { xs, ys, wide: wobble(xs.length, 4, 8), pebbles: Array.from({ length: Math.floor(xs.length * 0.6) }, () => ({ i: Math.floor(r() * xs.length), o: (r() - 0.5) * 6, s: 0.6 + r() * 0.8 })) };
  }
  // the trails: from one pond to the other, and from each stand of trees to its nearest pond or stand
  const nodes = [];
  w.ponds.forEach((o) => nodes.push({ x: o.x, y: o.y, pond: o, name: `pond${o.i}` }));
  L.groves.forEach((g, i) => nodes.push({ x: g.x, y: g.y, r: 0, name: `grove${i}` }));
  const pairs = [];
  const nk = w.ponds.length;
  for (let i = 0; i + 1 < nk; i++) pairs.push([i, i + 1]);
  for (let g = nk; g < nodes.length; g++) {
    let bj = -1, bd = Infinity;
    for (let j = 0; j < nodes.length; j++) { if (j === g || (nodes[j].name.startsWith('grove') && j > g)) continue; const d = Math.hypot(nodes[j].x - nodes[g].x, nodes[j].y - nodes[g].y); if (d < bd) { bd = d; bj = j; } }
    if (bj >= 0) pairs.push([bj, g]);
  }
  for (const [i, j] of pairs) {
    const A = nodes[i], B = nodes[j], end = (N, toward) => {
      if (N.pond) { onEdge(N.pond, toward.x, toward.y, 20, OUTP); return { x: OUTP.x, y: OUTP.y }; }
      const d = Math.hypot(toward.x - N.x, toward.y - N.y) || 1; return { x: N.x + ((toward.x - N.x) / d) * N.r, y: N.y + ((toward.y - N.y) / d) * N.r };
    };
    const a = end(A, B), b = end(B, A), L0 = Math.hypot(b.x - a.x, b.y - a.y);
    if (L0 < 30) continue;
    const n = Math.max(4, Math.round(L0 / 10)), amp = (r() - 0.5) * 0.12 * L0, waves = 1 + Math.floor(r() * 2), nx = -(b.y - a.y) / L0, ny = (b.x - a.x) / L0;
    const pts = new Float32Array(2 * (n + 1));
    for (let k = 0; k <= n; k++) {
      const s = k / n, off = amp * Math.sin(Math.PI * waves * s) + 3 * Math.sin(s * 23 + i);
      let x = lerp(a.x, b.x, s) + nx * off, y = lerp(a.y, b.y, s) + ny * off;
      for (const q of L.blocks) { const d = Math.hypot(x - q.x, y - q.y), m = q.r + 6; if (d < m && d > 1e-6) { x = q.x + ((x - q.x) / d) * m; y = q.y + ((y - q.y) / d) * m; } }
      pts[2 * k] = x; pts[2 * k + 1] = y;
    }
    L.trails.push({ from: A.name, to: B.name, pts: resample(pts, 10) });
  }
  w.land = L; w.landKey = landKey(w);
}
// a polyline (x, y pairs) with points added along any step longer than most px, so a trail pushed round a boulder
// keeps its even step
function resample(P2, most) {
  const out = [P2[0], P2[1]];
  for (let k = 2; k < P2.length; k += 2) {
    const x0 = P2[k - 2], y0 = P2[k - 1], x1 = P2[k], y1 = P2[k + 1], m = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / most);
    for (let j = 1; j <= m; j++) out.push(lerp(x0, x1, j / m), lerp(y0, y1, j / m));
  }
  return Float32Array.from(out);
}
// the land is laid again only when the page or a pond has moved enough to matter, or a count has changed
function stepLand(w) { if (landKey(w) !== w.landKey) layLand(w); }

// ----- the herd -----
// A cow: { x, y, a, v (px/s), g (gait 0..3), want (the gait it is making for), ph, t, bend, om, seed, side, size,
// calf, dam (its mother's index, calves only), band, alarm (0..1), shelter ({ x, y, grove, ring, t } under or round a
// canopy, or null), food (the apple it is making for), drink ({ k (pond), t, off, x, y, left, at, walk } on its way to
// or at the water, or null), drinkT, stepT, stepping, stepA, dustT, chaffT, pied, patches, and from separate():
// crowd (the gap to its tightest neighbour, px), cx, cy (the way away from it), moved }.
// A band: { id, leader (index), gx, gy (where the leader is making for), keep (time left grazing there), away (time
// left apart, a band that parted; Infinity for the main band) }.
const SPEED = (p) => [0, p.walk, p.trot, p.run];
export function speedAt(p, g) { const S = SPEED(p), i = clamp(Math.floor(g), 0, 2), t = clamp(g - i, 0, 1); return lerp(S[i], S[i + 1], t); }
const STEP_SPEED = 0.35;
function freeFor(w, x, y, R) {
  if (x < MARGIN || x > w.w - MARGIN || y < MARGIN || y > w.h - MARGIN) return false;
  if (pondGap(w, x, y) < w.params.shore + R + 6) return false;
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
  const p = w.params, r = w.rand, n = herdTarget(w), S = p.size, nf = Math.min(pick2(w, 'calves'), Math.floor(n / 3)), na = n - nf;
  // the herd starts together somewhere open, nearer the middle of the page than its edges
  let cx = w.w / 2, cy = w.h / 2, bs = -Infinity;
  for (let k = 0; k < 40; k++) {
    const x = w.w * (0.2 + 0.6 * r()), y = Math.max(TOP + 40, w.h * (0.25 + 0.6 * r()));
    const s = Math.min(pondGap(w, x, y), 260) - 0.3 * Math.hypot(x - w.w / 2, y - w.h / 2);
    if (s > bs) { bs = s; cx = x; cy = y; }
  }
  const H = [], R = S * (1.6 + p.spacing * Math.sqrt(na) * 0.55);
  for (let i = 0; i < n; i++) {
    const calf = i >= na, dam = calf ? (i - na) * Math.max(1, Math.floor(na / Math.max(1, nf))) % na : -1;
    let x = cx, y = cy;
    for (let k = 0; k < 40; k++) {
      if (calf) { const m = H[dam], a = r() * TAU; x = m.x + Math.cos(a) * S * 1.2; y = m.y + Math.sin(a) * S * 1.2; }
      else { const a = r() * TAU, d = R * Math.sqrt(r()) * (1 + k / 20); x = cx + Math.cos(a) * d; y = cy + Math.sin(a) * d; }
      if (freeFor(w, x, y, S * 0.6) && H.every((o) => Math.hypot(o.x - x, o.y - y) > S * (calf ? 0.7 : 1.1))) break;
    }
    const size = S * (calf ? 0.62 : 0.92 + 0.16 * r());
    H.push({ i, x, y, a: r() * TAU, v: 0, g: 0, want: 0, ph: r(), t: r() * 100, bend: 0, om: 0, seed: r() * TAU, side: r() < 0.5 ? -1 : 1, size, calf, dam, band: 0, alarm: 0, shelter: null, food: null, stepT: 1 + r() * 8, stepping: 0, stepA: 0, dustT: 0, chaffT: 0, pied: 0, patches: null, drink: null, drinkT: p.drink * (0.1 + r()), crowd: Infinity, cx: 0, cy: 0, moved: false });
  }
  w.cows = H; w.calfN = nf;
  markPied(w);
  const lead = H[0], gl = pickGoal(w, lead.x, lead.y, r() * TAU, p.roam);
  w.bands = [{ id: 0, leader: 0, gx: gl.x, gy: gl.y, keep: p.keep * (0.3 + r()), away: Infinity }];
  w.nextBand = 1; w.splitT = p.split * (0.5 + r());
}
// The pied cows are the adults spread evenly through the herd (never the lead cow); their patches come from the index
// alone, so a pied cow looks the same on every visit.
function markPied(w) {
  const H = w.cows, adults = H.filter((h) => !h.calf), n = Math.min(pick2(w, 'pied'), Math.max(0, adults.length - 1));
  for (const h of H) { h.pied = 0; h.patches = null; }
  for (let k = 0; k < n; k++) { const h = adults[1 + Math.floor((k * (adults.length - 1)) / n)]; h.pied = 0x9e3779b9 ^ (h.i * 2654435761); h.patches = coatPatches(h.pied >>> 0); }
  w.piedN = n;
}
const bandOf = (w, id) => w.bands.find((b) => b.id === id) || w.bands[0];
function centroid(w, id, out) { let x = 0, y = 0, n = 0; for (const h of w.cows) if (h.band === id) { x += h.x; y += h.y; n++; } out.x = n ? x / n : 0; out.y = n ? y / n : 0; out.n = n; return out; }
const C0 = { x: 0, y: 0, n: 0 }, C1 = { x: 0, y: 0, n: 0 };
// The bands: each lead cow grazes a spot for a while and moves on; now and then a band parts in two, the smaller
// part following a lead cow of its own off to graze apart, and after a while it makes back for the main band and joins it.
function stepBands(w, dt) {
  const p = w.params, r = w.rand, H = w.cows, main = w.bands[0], calm = H.every((h) => h.alarm < 0.05);
  for (const h of H) if (h.calf) h.band = H[h.dam].band;
  for (const b of w.bands) {
    const L = H[b.leader];
    if (L.alarm > 0.05) { b.gx = L.x; b.gy = L.y; b.keep = p.keep * (0.5 + r()); continue; }
    // a spot the land has since covered (a pond moved onto it, the page shrank) is given up for one nearby
    if (!freeFor(w, b.gx, b.gy, 2 * p.size) && (b === main || b.away > 0)) { const g = pickGoal(w, L.x, L.y, L.a, p.roam * 0.6, Math.PI); b.gx = g.x; b.gy = g.y; }
    if (b !== main) {
      b.away -= dt;
      if (b.away <= 0) {
        // coming back: the main band holds its spot while this one makes for it
        const Lm = H[main.leader]; main.gx = Lm.x; main.gy = Lm.y; main.keep = Math.max(main.keep, 3);
        centroid(w, main.id, C0); centroid(w, b.id, C1);
        b.gx = C0.x; b.gy = C0.y;
        // joined once the two stand together: their middles as near as both bands' spreads allow (bodies never overlap,
        // so a band that has come back stands beside the main one rather than in it)
        if (Math.hypot(C0.x - C1.x, C0.y - C1.y) < 110 + 1.2 * p.size * (Math.sqrt(C0.n) + Math.sqrt(C1.n))) { for (const h of H) if (h.band === b.id) h.band = main.id; b.dead = true; w.merges++; }
        continue;
      }
    }
    // a lead cow that has walked half a minute without arriving (the way round a pond was longer than it looked) settles
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
    const adults = H.filter((h) => !h.calf && h.i !== main.leader);
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
// The canopy a spooked cow makes for: the nearest stand of trees that does not lie back toward the scare, a spot
// under it of its own; or, with no such stand, open ground straight away from the scare.
// A canopy holds only so many (canopyCap): when the stand it would make for is full, a cow makes for the next stand
// with room if one is near enough, and otherwise stands spaced out round the full one's edge, facing in.
function shelterFor(w, h, ux, uy, grove) {
  const G = w.land ? w.land.groves : [], r = w.rand, S = h.size;
  const ok = [];
  for (let i = 0; i < G.length; i++) { const g = G[i], dx = g.x - h.x, dy = g.y - h.y, d = Math.hypot(dx, dy); if (i !== grove && d > 1e-6 && (dx * ux + dy * uy) / d < -0.25) continue; ok.push([i === grove ? -1 : d, i]); }
  if (!ok.length) { const m = w.params.edge; return { x: clamp(h.x + ux * 260, m, w.w - m), y: clamp(h.y + uy * 260, Math.max(m, TOP), w.h - m), grove: null }; }
  ok.sort((a, b) => a[0] - b[0]);
  const under = (i) => { let k = 0; for (const o of w.cows) if (o !== h && o.shelter && o.shelter.grove === i && !o.shelter.ring) k++; return k; };
  for (const [d, i] of ok) {
    if (d > 400 && i !== ok[0][1]) break;
    const g = G[i];
    if (under(i) >= canopyCap(w, g)) continue;
    const a = r() * TAU, q = g.r * 0.65 * Math.sqrt(r());
    return { x: g.x + Math.cos(a) * q, y: g.y + Math.sin(a) * q, grove: i, ring: false };
  }
  // round the nearest full stand: the free place on a ring outside its edge nearest the way the cow comes from
  const gi = ok[0][1], g = G[gi], R = g.r + S * 1.1, step = (S * (2 * w.params.girth + w.params.room + 0.2)) / R, t0 = Math.atan2(h.y - g.y, h.x - g.x);
  const taken = []; for (const o of w.cows) if (o !== h && o.shelter && o.shelter.grove === gi && o.shelter.ring) taken.push(o.shelter.t);
  for (let k = 0; k < Math.PI / step; k++) {
    for (const sg of k ? [1, -1] : [1]) {
      const t = t0 + sg * k * step;
      if (taken.some((u) => Math.abs(wrapAngle(u - t)) < step * 0.95)) continue;
      return { x: g.x + Math.cos(t) * R, y: g.y + Math.sin(t) * R, grove: gi, ring: true, t };
    }
  }
  return { x: g.x + Math.cos(t0) * (R + S * 1.5), y: g.y + Math.sin(t0) * (R + S * 1.5), grove: gi, ring: true, t: t0 };
}
function spook(w, h, level, ux, uy, grove) {
  if (h.alarm >= level) return;
  h.alarm = level; h.food = null; h.drink = null; h.stepping = 0;
  h.shelter = shelterFor(w, h, ux, uy, grove);
}
// The water: a drinking cow stands at a place on a pond's shore (an angle round the pond, so the place follows the
// pond as its object moves), its nose just short of the water; no two drinkers closer along the shore than a body's
// width and some room. shoreFor picks the place, nearest the cow; shoreSpot puts it on the page.
function shoreFor(w, h) {
  const p = w.params, S = h.size; let best = -1, bg = 360;
  w.ponds.forEach((o, i) => { const g = edgeGap(o, h.x, h.y, 0); if (g < bg) { bg = g; best = i; } });
  if (best < 0) return null;
  const o = w.ponds[best], off = noseReach(0) * S + 3, t0 = Math.atan2(h.y - o.y, h.x - o.x), R = o.mean + off, step = (S * (2 * p.girth + p.room + 0.4)) / Math.max(1, R);
  const taken = []; for (const q of w.cows) if (q !== h && q.drink && q.drink.k === best) taken.push(q.drink.t);
  for (let k = 0; k < 12; k++) for (const sg of k ? [1, -1] : [1]) {
    const t = t0 + sg * k * step;
    if (taken.some((u) => Math.abs(wrapAngle(u - t)) < step * 0.95)) continue;
    const d = { k: best, t, off, x: 0, y: 0, left: p.sip * (0.75 + 0.5 * w.rand()), at: false, walk: 0 };
    shoreSpot(w, h, d);
    if (d.x < MARGIN || d.x > w.w - MARGIN || d.y < TOP || d.y > w.h - MARGIN || blocksOf(w).some((b) => Math.hypot(d.x - b.x, d.y - b.y) < b.r + S)) continue;
    return d;
  }
  return null;
}
function shoreSpot(w, h, d) { const o = w.ponds[d.k], R = edge(o, d.t) + d.off; d.x = o.x + Math.cos(d.t) * R; d.y = o.y + Math.sin(d.t) * R; }
// the nearest trail point ahead within reach of (x, y), as a direction to blend in: along the trail the way the cow
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
  const p = w.params, r = w.rand, H = w.cows, n = H.length, ptr = w.ptr, rm = w.reduced;
  // a fast cursor spooks the cows near it into a run for cover, and a spooked cow spooks those near it. A press
  // held down to lay apples is no threat, and a cow at an apple spooks only at half the range.
  if (startle && !w.stroke) for (const h of H) { const dx = h.x - ptr.x, dy = h.y - ptr.y, d = Math.hypot(dx, dy); if (d < p.scare * (h.food ? 0.5 : 1) && d > 1e-6) spook(w, h, 1, dx / d, dy / d, null); }
  if (!rm) for (const h of H) {
    if (h.alarm < 0.4) continue;
    for (const o of H) { if (o === h || o.food || o.alarm >= h.alarm * 0.88) continue; const d = Math.hypot(o.x - h.x, o.y - h.y); if (d < p.alarm) { const s = h.shelter; spook(w, o, h.alarm * 0.88, Math.cos(h.a), Math.sin(h.a), s ? s.grove : null); } }
  }
  // the apples: every cow that notices one and is not in a panic makes for the nearest, one nobody is eating before
  // one somebody is; an apple calms the cow that takes it. The first to reach an apple eats it; the rest wait round.
  if (w.feed.length) {
    for (const f of w.feed) { const e = f.eater; if (e && (e.food !== f || Math.hypot(f.x - e.x, f.y - e.y) > e.size * 1.8)) f.eater = null; }
    for (const h of H) {
      if (h.food && !w.feed.includes(h.food)) h.food = null;
      if (h.alarm > p.lure) { h.food = null; continue; }
      let bf = null, bd = p.sense;
      for (const f of w.feed) { const d = Math.hypot(f.x - h.x, f.y - h.y) + (f.eater && f.eater !== h ? 2.5 * h.size : 0); if (d < bd) { bd = d; bf = f; } }
      if (bf) { h.food = bf; h.alarm = 0; h.shelter = null; h.drink = null; }
    }
  } else for (const h of H) h.food = null;
  for (const h of H) {
    const S = h.size, band = bandOf(w, h.band), L = H[band.leader];
    h.t += dt;
    h.alarm = Math.max(0, h.alarm - dt / p.calm);
    if (rm) h.alarm = 0;
    if (h.alarm <= 0) h.shelter = null;
    // now and then a calm grazing cow (never a lead cow, never a calf) walks to the water
    if (!h.calf && h !== L && !h.food && !h.drink && h.alarm <= 0 && !rm && p.drinkers > 0 && (h.drinkT -= dt) <= 0) {
      h.drinkT = p.drink * (0.5 + r());
      let busy = 0; for (const o of H) if (o.drink) busy++;
      if (busy < p.drinkers) h.drink = shoreFor(w, h);
      if (!h.drink) h.drinkT = 8 + 12 * r();
    }
    let tx = h.x, ty = h.y, want = 0, eating = false, stand = false, fx = 0, fy = 0;
    if (h.food) {
      const f = h.food; tx = f.x; ty = f.y;
      const d = Math.hypot(tx - h.x, ty - h.y);
      if (d < S * 1.3 && (!f.eater || f.eater === h)) { f.eater = h; eating = true; f.left -= dt / p.eat; h.chaffT -= dt; if (h.chaffT <= 0) { h.chaffT = 0.6; puff(w, f.x, f.y, 3, 0.8, 1); } }
      // another got there first: wait a little way off, facing it
      else if (f.eater && f.eater !== h && d < S * 3) { stand = true; fx = tx - h.x; fy = ty - h.y; }
      else want = d > 3 * S ? 2 : 1;
    } else if (h.alarm > 0.02 && h.shelter) {
      const s = h.shelter; tx = s.x; ty = s.y;
      const d = Math.hypot(tx - h.x, ty - h.y);
      if (d < 10) { stand = true; if (s.ring) { const g = w.land.groves[s.grove]; fx = g.x - h.x; fy = g.y - h.y; } }
      else want = h.alarm > 0.5 ? 3 : h.alarm > 0.22 ? 2 : 1;
    } else if (h.drink) {
      const k = h.drink, o = w.ponds[k.k];
      if (!o) h.drink = null;
      else {
        shoreSpot(w, h, k); tx = k.x; ty = k.y;
        const d = Math.hypot(tx - h.x, ty - h.y);
        if (k.at || d < 6) {
          // at the water: head to it, still, until it has drunk; then back to the band
          k.at = true; stand = true; fx = o.x - h.x; fy = o.y - h.y; k.left -= dt;
          if (k.left <= 0) { h.drink = null; w.drinks++; }
        } else { want = d > 220 ? 2 : 1; if ((k.walk += dt) > 30) h.drink = null; }
      }
    } else if (h.calf) {
      const m = H[h.dam], ox = Math.cos(m.a), oy = Math.sin(m.a);
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
      const R = S * (2 + p.spacing * Math.sqrt(nb) * 0.55);
      want = d > 2 * R ? 2 : d > R ? 1 : 0;
      if (band.away <= 0 && d > R) want = Math.max(want, 1);
    }
    if (rm) want = Math.min(want, 1);
    h.want = want;
    // a grazing cow takes a step or two now and then: on toward the band when it has drifted out, else anywhere
    if (want === 0 && !eating && !stand) {
      if (h.stepping > 0) h.stepping -= dt;
      // crowded: a step away from the nearest body, along its own heading where that serves
      else if (h.crowd < p.room * S) { h.stepping = 0.5 + r() * 0.5; const away = Math.atan2(h.cy, h.cx), da = wrapAngle(away - h.a); h.stepA = Math.abs(da) < 1.2 ? h.a + da * 0.5 : away; }
      else if ((h.stepT -= dt) <= 0) { h.stepT = 3 + r() * 7; h.stepping = 0.8 + r() * 1.4; h.stepA = h.a + (r() - 0.5) * 1.8; }
    } else h.stepping = 0;
    // the direction it would go: its target, kept apart from the others, round the ponds and the blocks, off the
    // page's edge, and along a trail when one runs its way
    let dx = 0, dy = 0;
    if (want > 0) { const d = Math.hypot(tx - h.x, ty - h.y) || 1; dx = (tx - h.x) / d; dy = (ty - h.y) / d; }
    else if (h.stepping > 0) { dx = Math.cos(h.stepA); dy = Math.sin(h.stepA); }
    else if (eating) { dx = tx - h.x; dy = ty - h.y; }
    else if (stand) { dx = fx; dy = fy; }
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
      // a pond is steered round unless what the cow makes for lies by its shore (the water, an apple there): then it
      // walks straight in, and keepOut holds it at the edge
      for (const o of w.ponds) { const gap = edgeGap(o, h.x, h.y, p.shore); if (gap < look && edgeGap(o, tx, ty, p.shore) > look * 0.5) { edgeNormal(o, h.x, h.y, NRM); avoid(gap, NRM.x, NRM.y); } }
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
    if (h.calf) vt *= 1.15;
    if (eating || stand) vt = 0;
    else if (want > 0) { const d = Math.hypot(tx - h.x, ty - h.y); vt *= clamp(d / (2 * S), h.food ? 0.45 : 0.3, 1); }
    h.v += (vt * S - h.v) * Math.min(1, dt * (h.g > 2 ? 2.5 : 3));
    // the turn: a heading eased toward the wanted direction at the gait's turn rate; the spine bends with it
    const a0 = h.a;
    if (dx * dx + dy * dy > 1e-6) {
      // close to an apple or its shelter a cow turns on the spot rather than circling it
      const near = (h.food || h.shelter || h.drink) && Math.hypot(tx - h.x, ty - h.y) < 3 * S ? 2.5 : 1;
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
  for (const h of H) keepOut(w, h);
  separate(w, dt);
}

// ----- the bodies -----
// A cow's body, for keeping the herd apart, is a capsule along its heading: a segment from its rump to its nose (as
// far as the gait carries the head) swept by its girth. The numbers are the herd's, not the figure's, so another
// animal's figure can be laid over the same bodies.
const CAPS = [];
function capsule(h, p, c) {
  const S = h.size, r = p.girth * S, u = Math.cos(h.a), v = Math.sin(h.a), back = Math.max(0, p.rump * S - r), front = Math.max(0, noseReach(h.g) * S - r);
  c.ax = h.x - u * back; c.ay = h.y - v * back; c.bx = h.x + u * front; c.by = h.y + v * front; c.r = r; c.reach = Math.max(back, front) + r;
  return c;
}
const shift = (c, dx, dy) => { c.ax += dx; c.ay += dy; c.bx += dx; c.by += dy; };
// The closest points of segments ab and cd: their distance, the point on ab at (SS.px, SS.py) and on cd at (qx, qy).
const SS = { px: 0, py: 0, qx: 0, qy: 0 };
function segSeg(ax, ay, bx, by, cx, cy, dx, dy) {
  const ux = bx - ax, uy = by - ay, vx = dx - cx, vy = dy - cy, wx = ax - cx, wy = ay - cy;
  const a = ux * ux + uy * uy, e = vx * vx + vy * vy, f = vx * wx + vy * wy;
  let s, t;
  if (a < 1e-9 && e < 1e-9) { s = 0; t = 0; }
  else if (a < 1e-9) { s = 0; t = clamp(f / e, 0, 1); }
  else {
    const c = ux * wx + uy * wy;
    if (e < 1e-9) { t = 0; s = clamp(-c / a, 0, 1); }
    else {
      const b = ux * vx + uy * vy, den = a * e - b * b;
      s = den > 1e-9 ? clamp((b * f - c * e) / den, 0, 1) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = clamp(-c / a, 0, 1); } else if (t > 1) { t = 1; s = clamp((b - c) / a, 0, 1); }
    }
  }
  SS.px = ax + ux * s; SS.py = ay + uy * s; SS.qx = cx + vx * t; SS.qy = cy + vy * t;
  return Math.hypot(SS.px - SS.qx, SS.py - SS.qy);
}
// How many cows one canopy shelters: its area over the room each takes.
export const canopyCap = (w, g) => Math.max(1, Math.floor((g.r * g.r) / (w.params.size * w.params.size * w.params.crowd)));
// No two bodies overlap, ever: each pair that does is pushed apart along the line between their nearest points, half
// each (a cow eating or drinking gives way less), with its motion into the other damped away rather than bounced,
// and a few rounds of that, so a crowd settles in place. A canopy holding its cap lets no more in. Each cow also
// learns its tightest neighbour (crowd, and the way away from it, cx, cy), which a grazing cow steps away from.
function separate(w, dt) {
  const p = w.params, H = w.cows, n = H.length, SLOP = 0.3;
  while (CAPS.length < n) CAPS.push({});
  for (let i = 0; i < n; i++) { capsule(H[i], p, CAPS[i]); H[i].crowd = Infinity; H[i].cx = 0; H[i].cy = 0; H[i].moved = false; H[i].pinned = false; }
  for (let it = 0; it < 16; it++) {
    let worst = 0;
    for (let i = 0; i < n; i++) {
      const A = H[i], CA = CAPS[i];
      for (let j = i + 1; j < n; j++) {
        const B = H[j], CB = CAPS[j], room = it === 0 ? p.room * Math.max(A.size, B.size) : 0;
        if (Math.abs(B.x - A.x) > CA.reach + CB.reach + room || Math.abs(B.y - A.y) > CA.reach + CB.reach + room) continue;
        const d = segSeg(CA.ax, CA.ay, CA.bx, CA.by, CB.ax, CB.ay, CB.bx, CB.by), gap = d - CA.r - CB.r;
        let nx, ny;
        if (d > 1e-6) { nx = (SS.px - SS.qx) / d; ny = (SS.py - SS.qy) / d; }
        else { const ex = A.x - B.x, ey = A.y - B.y, m = Math.hypot(ex, ey); if (m > 1e-6) { nx = ex / m; ny = ey / m; } else { nx = -Math.sin(A.a); ny = Math.cos(A.a); } }
        if (it === 0) {
          if (gap < A.crowd) { A.crowd = gap; A.cx = nx; A.cy = ny; }
          if (gap < B.crowd) { B.crowd = gap; B.cx = -nx; B.cy = -ny; }
        }
        if (gap >= SLOP) continue;
        const give = (h) => (h.pinned ? 0.15 : h.drink?.at || (h.food && h.food.eater === h) ? 0.3 : 1), wa = give(A), wb = give(B), pen = SLOP - gap, s = pen / (wa + wb);
        A.x += nx * s * wa; A.y += ny * s * wa; shift(CA, nx * s * wa, ny * s * wa); A.moved = true;
        B.x -= nx * s * wb; B.y -= ny * s * wb; shift(CB, -nx * s * wb, -ny * s * wb); B.moved = true;
        // the push is damped: whatever of its speed carried a cow into the other is let go over a few frames
        const k = Math.min(1, dt * 8), ia = -(Math.cos(A.a) * nx + Math.sin(A.a) * ny), ib = Math.cos(B.a) * nx + Math.sin(B.a) * ny;
        if (ia > 0) A.v -= A.v * ia * k; if (ib > 0) B.v -= B.v * ib * k;
        worst = Math.max(worst, pen);
      }
    }
    worst = Math.max(worst, canopyWalls(w));
    for (let i = 0; i < n; i++) if (H[i].moved) { const h = H[i], x = h.x, y = h.y; keepOut(w, h); const m = Math.hypot(h.x - x, h.y - y); if (m > 0.01) h.pinned = true; worst = Math.max(worst, m); capsule(h, p, CAPS[i]); h.moved = false; }
    if (worst < 0.02) break;
  }
}
// A canopy at its cap: the cows under it beyond the cap (those not holding a place under it, the farthest first)
// are put back out at its edge. Returns the farthest any was moved.
const UNDER = [];
function canopyWalls(w) {
  const G = w.land ? w.land.groves : [], H = w.cows; let worst = 0;
  for (let gi = 0; gi < G.length; gi++) {
    const g = G[gi], cap = canopyCap(w, g);
    UNDER.length = 0;
    for (const h of H) { const d = Math.hypot(h.x - g.x, h.y - g.y); if (d < g.r + 0.5) UNDER.push(h); }
    if (UNDER.length <= cap) continue;
    const held = (h) => (h.shelter && h.shelter.grove === gi && !h.shelter.ring ? 0 : 1);
    UNDER.sort((a, b) => held(a) - held(b) || Math.hypot(a.x - g.x, a.y - g.y) - Math.hypot(b.x - g.x, b.y - g.y));
    for (let k = cap; k < UNDER.length; k++) {
      const h = UNDER[k], ex = h.x - g.x, ey = h.y - g.y, d = Math.hypot(ex, ey), ux = d > 1e-6 ? ex / d : 1, uy = d > 1e-6 ? ey / d : 0, m = g.r + 1;
      worst = Math.max(worst, m - d); h.x = g.x + ux * m; h.y = g.y + uy * m; h.moved = true; h.pinned = true; shed(h, ux, uy);
    }
  }
  return worst;
}
const GA = {};
// Pushes a cow clear: its middle, its nose and its rump each kept off every pond (by shore), every block and the
// page's edge; motion aimed inward is shed so it slides along.
function keepOut(w, h) {
  const p = w.params, S = h.size, ca = Math.cos(h.a), sa = Math.sin(h.a), nose = noseReach(h.g) * S, rump = p.rump * S;
  for (let pass = 0; pass < 3; pass++) {
    for (const [off, g] of [[0, p.shore], [nose, 2], [-rump, 2]]) {
      const x = h.x + ca * off, y = h.y + sa * off;
      for (const o of w.ponds) {
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
// the cursor when it comes within `bolt` px, or from a running cow; it stays down a few seconds and comes out
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
    // the bolt: from the cursor, or from a cow at a run close by
    if (!w.reduced && q.state !== 'down' && q.state !== 'bolt' && B.length) {
      let fx = 0, fy = 0, scared = false;
      if (ptr.on && Math.hypot(q.x - ptr.x, q.y - ptr.y) < p.bolt) { fx = q.x - ptr.x; fy = q.y - ptr.y; scared = true; }
      else for (const h of w.cows) if (h.g > 2.3 && Math.hypot(h.x - q.x, h.y - q.y) < 50) { fx = q.x - h.x; fy = q.y - h.y; scared = true; break; }
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
          if (x < 20 || x > w.w - 20 || y < TOP || y > w.h - 20 || pondGap(w, x, y) < 12 || blocksOf(w).some((b) => b.kind !== 'rock' && Math.hypot(b.x - x, b.y - y) < b.r + 4)) continue;
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
      for (const o of w.ponds) if (edgeR(o, q.x, q.y, 6) < 1) { onEdge(o, q.x, q.y, 6.5, OUTP); q.x = OUTP.x; q.y = OUTP.y; }
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
    for (const o of w.ponds) if (edgeR(o, q.x, q.y, q.r) < 1) { onEdge(o, q.x, q.y, q.r + 0.5, OUTP); q.x = OUTP.x; q.y = OUTP.y; }
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
  for (const o of w.ponds) updateFootprint(o, w.outlines[o.i], dt, p, w.reduced, w.t);
  stepLand(w);
  if (w.cows.length !== herdTarget(w) || w.calfN !== Math.min(pick2(w, 'calves'), Math.floor(herdTarget(w) / 3))) populate(w);
  else if (w.piedN !== Math.min(pick2(w, 'pied'), Math.max(0, w.cows.filter((h) => !h.calf).length - 1))) markPied(w);
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
// what the herd is doing, for the checks and the profiler: the share of cows at each gait, rounded
export function gaitShare(w) { const s = [0, 0, 0, 0]; for (const h of w.cows) s[clamp(Math.round(h.g), 0, 3)]++; return s.map((v) => v / Math.max(1, w.cows.length)); }

// ----- drawing: the static layer -----
// The grass: a blade at each point of the kit's lattice, seen from above. A standing blade is a short tick turned any
// way; the wind lays it over, turning it toward the wind, lengthening it and curving it, so the more it leans the more
// the field reads as combed one way. A blade is [x, y, angle, length share] in GRASS_STRIDE floats: where it stands,
// the way it is turned standing, and its length against `blade`, all from its own point's hash. The static layer holds
// the grass at the steady breeze's lean (LEAN0); a gust is drawn by laying copies painted at a stronger lean over the
// band it covers (drawGust), so a gust costs a few clipped copies a frame, never the blades one by one.
export const GRASS = { pitch: 11, period: 24, dash: 10, reach: 16 };
const GRASS_STRIDE = 4, LEAN0 = 0.12, LEANS = [LEAN0, 0.9], GUST_AT = [0, 0.5];
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
// Everything on the static layer at one lean: the grass, then the creek, the trails, the boulders, the
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
  // the boulders and the shrubs: paper under an outline, a crack across a boulder, a few loops in a shrub
  for (const b of L.blocks) {
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
// layer is), laid over the bands where the passing gusts lean the grass past GUST_AT, each band clipped on its own.
// One band is a convex clip, which the GPU applies as it draws; two bands in one clip made it a mask of the whole page
// every frame. Under its clip a band's copy is laid strip by strip down the page, each strip only as wide as the band
// crossing it (the wind runs within 0.45 rad of east, so a band crosses every strip), so a gust costs about its own
// area, not the page's. A strip starts and ends on whole pixels of the copy and lands where the whole copy would.
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
const GUST_STRIP = 64;
function drawGusts(ctx, w, layer) {
  const p = w.params, d = w.layerData, c = Math.cos(w.wind.a), s = Math.sin(w.wind.a), cx = w.w / 2, cy = w.h / 2, T = w.w + w.h;
  for (let k = 1; k < LEANS.length; k++) {
    for (const g of w.wind.gusts) {
      if (g.amp <= GUST_AT[k]) continue;
      const img = gustCopy(d, k, layer, p);
      if (!img) return;
      const half = p.gustWidth * (2 / Math.PI) * Math.acos(Math.sqrt(GUST_AT[k] / g.amp)), a = g.s - half, b = g.s + half;
      ctx.save(); ctx.beginPath();
      ctx.moveTo(cx + c * a + s * T, cy + s * a - c * T); ctx.lineTo(cx + c * b + s * T, cy + s * b - c * T); ctx.lineTo(cx + c * b - s * T, cy + s * b + c * T); ctx.lineTo(cx + c * a - s * T, cy + s * a + c * T); ctx.closePath();
      ctx.clip();
      const sx = layer.w / img.width, sy = layer.h / img.height;
      if (Math.abs(c) < 0.3) ctx.drawImage(img, 0, 0, layer.w, layer.h);
      else for (let y0 = 0, S = Math.max(1, Math.round(GUST_STRIP / sy)); y0 < img.height; y0 += S) {
        // the band's span across this strip, in CSS px, a px wider each side than its clip
        const y1 = Math.min(img.height, y0 + S), ya = y0 * sy - cy, yb = y1 * sy - cy;
        const xa = (a - ya * s) / c, xb = (a - yb * s) / c, xc = (b - ya * s) / c, xd = (b - yb * s) / c;
        const x0 = Math.max(0, Math.floor((cx + Math.min(xa, xb, xc, xd) - 2) / sx)), x1 = Math.min(img.width, Math.ceil((cx + Math.max(xa, xb, xc, xd) + 2) / sx));
        if (x1 > x0) ctx.drawImage(img, x0, y0, x1 - x0, y1 - y0, x0 * sx, y0 * sy, (x1 - x0) * sx, (y1 - y0) * sy);
      }
      ctx.restore();
    }
  }
}
// The ponds: the two footprints hold water. The water is the page taken toward the pond scene's blue-green (by
// `water`), hatched with the kit's lattice of level dashes as the pond's water is (the prairie's own seed and density),
// the dashes cut to the live outline a few px in from the shore; a shore line and a fainter lip just inside it; and a
// few clumps of reeds where the water meets the grass.
export const WATER = { light: [44, 74, 85], dark: [4, 10, 13] };
export const HATCH = { pitch: 14, period: 44, dash: 22, reach: 30 };
const LIP = 4;
// the lattice over the whole page, laid once per page size, density and jitter
function waterLattice(w) {
  const p = w.params, key = `${Math.ceil(w.w / 64)} ${Math.ceil(w.h / 64)} ${p.markDensity} ${p.markJitter}`;
  if (w.lattice && w.lattice.key === key) return w.lattice;
  const marks = latticeMarks((w.seed ^ 0x706f6e64) >>> 0, Math.ceil(w.w / 64) * 64, Math.ceil(w.h / 64) * 64, HATCH, p.markDensity, p.markJitter);
  const xy = new Float32Array(marks.length * 4);
  marks.forEach((m, k) => { xy.set(m.pts, k * 4); });
  return (w.lattice = { key, xy, n: marks.length });
}
// The dashes on pond i as the pond stands now: x0, y0, x1, y1 per dash, cut where they cross the line LIP px inside
// the shore. Kept until the pond or the lattice moves.
function waterDashes(w, i) {
  const o = w.ponds[i], L = waterLattice(w);
  w.dashes = w.dashes || [];
  let c = w.dashes[i];
  let Rmax = 0, sum = 0; for (let k = 0; k < o.C.length; k++) { Rmax = Math.max(Rmax, o.C[k]); sum += o.C[k] * (k + 1); }
  const key = `${o.x} ${o.y} ${sum} ${L.key}`;
  if (c && c.key === key) return c;
  const out = c && c.xy.length >= L.n * 4 ? c.xy : new Float32Array(Math.max(64, L.n * 4));
  let n = 0;
  const inside = (x, y) => edgeR(o, x, y, -LIP) < 1;
  const cut = (xi, xo, y) => { for (let k = 0; k < 7; k++) { const m = (xi + xo) / 2; if (inside(m, y)) xi = m; else xo = m; } return xi; };
  for (let k = 0; k < L.n; k++) {
    const x0 = L.xy[4 * k], y = L.xy[4 * k + 1], x1 = L.xy[4 * k + 2];
    if (Math.abs(y - o.y) > Rmax || x1 < o.x - Rmax || x0 > o.x + Rmax) continue;
    const a = inside(x0, y), b = inside(x1, y);
    if (!a && !b) continue;
    let u0 = x0, u1 = x1;
    if (!a) u0 = cut(x1, x0, y); else if (!b) u1 = cut(x0, x1, y);
    if (u1 - u0 < 2) continue;
    out[n++] = u0; out[n++] = y; out[n++] = u1; out[n++] = y;
  }
  return (w.dashes[i] = { key, xy: out, n: n >> 2 });
}
// The water marks drawn on pond i in the world's present state, as marks { pts: [x0, y0, x1, y1] } (for the checks).
export function pondMarks(w, i) {
  if (!w.ponds[i]) return [];
  const d = waterDashes(w, i), out = [];
  for (let k = 0; k < d.n; k++) out.push({ pts: Array.from(d.xy.subarray(4 * k, 4 * k + 4)) });
  return out;
}
// The reeds: a few clumps round each pond, each a fan of short ticks leaning out over the grass from the shore, at
// angles from the world's seed and the pond's index alone.
function reedPath(ctx, w, o) {
  const d = pointRand((w.seed ^ Math.imul(o.i + 1, 0x9e3779b1)) >>> 0), m = 4 + Math.floor(d() * 3), t0 = d() * TAU;
  for (let c = 0; c < m; c++) {
    const t = t0 + (c / m) * TAU + (d() - 0.5) * 0.7, k = 3 + Math.floor(d() * 3), R = edge(o, t);
    for (let j = 0; j < k; j++) {
      const tt = t + (j - (k - 1) / 2) * (5 / Math.max(20, R)), lean = (j - (k - 1) / 2) * 0.25 + (d() - 0.5) * 0.2, L = 4 + d() * 4;
      const ca = Math.cos(tt), sa = Math.sin(tt), x = o.x + ca * (R + 1), y = o.y + sa * (R + 1), a = tt + lean;
      ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * L, y + Math.sin(a) * L);
    }
  }
}
export function drawGround(ctx, w, colours, layer = { img: null, w: 0, h: 0, flat: colours.paper }) {
  const p = w.params, { ink, paper, ochre } = colours;
  ctx.globalAlpha = 1;
  if (!layer.img || layer.w < w.w || layer.h < w.h) { ctx.fillStyle = layer.flat; ctx.fillRect(0, 0, w.w, w.h); }
  if (layer.img) ctx.drawImage(layer.img, 0, 0, layer.w, layer.h);
  if (!w.reduced && w.wind.gusts.length && layer.img && w.layerData && w.layerData.colours) drawGusts(ctx, w, layer);
  // the ponds: the water, its hatch, the shore and its lip, the reeds
  if (w.ponds.length) {
    const tk = `${paper} ${p.water}`;
    if (w.waterTone !== tk) { w.waterTone = tk; w.waterFill = tint(paper, p.water, WATER.light, WATER.dark); }
    ctx.globalAlpha = 1; ctx.fillStyle = w.waterFill;
    for (const o of w.ponds) { edgePath(ctx, o, 0); ctx.fill(); }
    ctx.strokeStyle = ink; ctx.lineWidth = 1; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (p.markAlpha > 0) {
      ctx.globalAlpha = p.markAlpha; ctx.beginPath();
      for (let i = 0; i < w.ponds.length; i++) { const d = waterDashes(w, i), xy = d.xy; for (let k = 0; k < d.n; k++) { ctx.moveTo(xy[4 * k], xy[4 * k + 1]); ctx.lineTo(xy[4 * k + 2], xy[4 * k + 3]); } }
      ctx.stroke();
    }
    for (const o of w.ponds) {
      ctx.globalAlpha = p.edgeAlpha; edgePath(ctx, o, 0); ctx.stroke();
      ctx.globalAlpha = p.edgeAlpha * 0.45; edgePath(ctx, o, -LIP); ctx.stroke();
    }
    if (p.reeds > 0) { ctx.globalAlpha = p.reeds; ctx.beginPath(); for (const o of w.ponds) reedPath(ctx, w, o); ctx.stroke(); }
  }
  // the wildflowers: a bud, then three petals half open, then five open round the eye, swaying with a passing gust
  const F = w.land ? w.land.flowers : [];
  if (F.length) {
    const c = Math.cos(w.wind.a), s = Math.sin(w.wind.a), t = w.t;
    ctx.strokeStyle = ochre; ctx.globalAlpha = p.floraAlpha; ctx.beginPath();
    for (const f of F) {
      if (t < f.o1) continue;
      const sw = w.wind.gusts.length ? 1.5 * leanAt(w, f.x, f.y) : 0, x = f.x + c * sw, y = f.y + s * sw, open = t >= f.o2, m = open ? 5 : 3, R = (open ? 2.1 : 1.5) * f.s;
      for (let i = 0; i < m; i++) {
        const a = f.rot + (i / m) * TAU, px = x + Math.cos(a) * R, py = y + Math.sin(a) * R;
        ctx.moveTo(x + (px - x) * (open ? 0.35 : 0), y + (py - y) * (open ? 0.35 : 0)); ctx.lineTo(px, py);
      }
    }
    ctx.stroke();
    ctx.strokeStyle = ink; ctx.globalAlpha = p.floraAlpha * 0.7; ctx.beginPath();
    for (const f of F) { const r0 = t < f.o1 ? 0.9 : 0.5; ctx.moveTo(f.x - r0, f.y); ctx.lineTo(f.x + r0, f.y); }
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
  const p = w.params, { ink, paper, ochre, chestnut } = colours, horned = !!p.horns;
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
  // the herd: calves and all, a paper fill under each so crossing cows read one over the other
  for (const h of w.cows) drawCow(ctx, h, horned, ink, paper, chestnut, p.alpha);
  // dust behind a running cow, chaff where an apple is eaten
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
  // the canopies, over everything on the ground: a cow sheltering under one is hidden by its shade
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
// The pose study: one cow at studyScale times the herd's size in the middle of the page, or the sheet of every gait at
// eight phases, over a paper panel, posed from the study's sliders.
function drawStudy(ctx, w, colours) {
  const p = w.params, { ink, paper, chestnut } = colours, horned = !!p.horns;
  const patches = p.studyPied ? coatPatches(0x5eed1) : null, mk = (x, y, size, g, ph) => ({ x, y, a: 0, bend: p.studyTurn, g, ph, t: w.study.t, side: 1, seed: 1, size, patches });
  ctx.globalAlpha = 0.95; ctx.fillStyle = paper; ctx.fillRect(0, 0, w.w, w.h);
  ctx.fillStyle = ink; ctx.font = '11px ui-monospace, Menlo, monospace'; ctx.textBaseline = 'top';
  ctx.globalAlpha = 0.7; ctx.fillText(`pose study: ${horned ? 'longhorn' : 'polled'}; a still shows the pose, not the motion`, 24, 92);
  ctx.lineWidth = p.width;
  if (p.sheet) {
    const cols = 8, cw = (w.w - 140) / cols, rh = (w.h - 140) / 4, size = Math.min(cw / 2.3, rh / 1.1);
    for (let g = 0; g < 4; g++) {
      const y = 130 + rh * (g + 0.5);
      ctx.globalAlpha = 0.7; ctx.fillStyle = ink; ctx.fillText(GAITS[g].name, 24, y - 6);
      for (let k = 0; k < cols; k++) drawCow(ctx, mk(110 + cw * (k + 0.5), y, size, g, k / cols), horned, ink, paper, chestnut, p.alpha);
    }
  } else {
    const ph = p.studyRun ? w.study.ph : p.studyPhase, size = p.size * p.studyScale;
    drawCow(ctx, mk(w.w / 2 - size * 0.2, w.h / 2 + 30, size, p.studyGait, ph), horned, ink, paper, chestnut, p.alpha);
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
  hit: pondAt, drop: dropFeed,
  strokeStart, strokeTo, strokeEnd, strokeCancel,
  // clear the ground: every apple and every puff goes
  clear(w) { w.feed.length = 0; w.puffs.length = 0; for (const h of w.cows) h.food = null; },
  // the grass and the land: made anew for a new size, layout, density or jitter; repainted for a new look
  layer: {
    key: (w, p) => `${w.seed} ${w.landKey} ${p.grassDensity} ${p.grassJitter}`,
    make: (w, p, W, H) => { const d = { grass: grassMarks(w.seed, w.wind.a, W, H, p.grassDensity, p.grassJitter), wa: w.wind.a, land: w.land, version: 0, colours: null }; w.layerData = d; return d; },
    look: (p) => `${p.grassAlpha} ${p.blade} ${p.landAlpha} ${p.palette} ${p.lean}`,
    paint: (ctx, d, p, colours) => { paintLand(ctx, d, p, colours, LEAN0); d.colours = { ink: colours.ink, paper: colours.paper }; d.version++; },
  },
  drawGround, drawLive,
};
