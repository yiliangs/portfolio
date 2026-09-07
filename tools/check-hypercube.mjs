// Checks the tesseract the home cube is made of.
//
// hypercube(a, b, fold, pos, wt, wpos, wnd) in home.js is the whole object: the cube has no wireframe of its own any
// more, so these 32 edges and the 48 walls washed behind them are the only things drawing it. Several claims have to
// hold at once and none of them shows in a still frame.
//
// At any pose it has to be a tesseract, not a plausible tangle: 32 edges, every one of the 16 vertices meeting
// exactly four of them, and nothing reaching outside the box the projection is refitted into. A wrong edge list, or
// a projection that folds two vertices onto one point, both surface as a vertex of the wrong degree.
//
// At a pose that is a multiple of a quarter turn in both planes it has to be a plain cube: the near cell projects to
// exactly the box, the weights are a clean 1 on its twelve edges and 0 on the other twenty, and the collapse is
// built on that. It steers the pose there during the dissolve beat, and from then on the travel and the flatten act
// on a wireframe that is the box, exactly as they did before the cube was a tesseract. If that pose drifted off the
// box the landed plate would be the wrong size and the hand-over to the parchment platform would show.
//
// And the wash on the walls has to be steady. What makes the figure readable is that each of its eight cells is
// shaded on the three walls it turns away from the reader, and "away" is a direction the figure itself has to
// supply. Three rules for it have been tried and the first two blinked in motion while looking right in a still.
// Winding every face once and keeping one side of it put the whole wash out at some poses and doubled it at others,
// since the winding is arbitrary and nothing balances it. Taking the sign of the wall's normal against the step
// from the cell's centre turned a wall covering a fifth of the figure over between two frames, because a cell of a
// projected tesseract folds through itself and at that instant has no inside. Scaling by the cosine of that angle
// fixed the fold that turns the normal, and hid the fold that walks the centre through the wall instead: the step
// reverses through that one while its length stays put, so a quotient by its length is the same either side of it.
// What holds is the clearance itself, the distance from the cell's centre to the wall's plane in units of the
// cell's radius. It passes through zero both ways round, so the wash thins and returns rather than turning over.
//
// The check below is what catches any of the three coming back: a wall's outward vector may only move a long way at
// a pose where the wall has no area to show the move in. It is written as a refinement test rather than a ceiling,
// because a wall sweeping through a fold moves fast and is still sound.
//
// Run with `npm run check`. Exits non-zero and prints every failure it found.

import { hypercube } from '../home.js';

const Q = Math.PI / 2;
const POSES = [[0, 0], [0.7, 1.9], [2.4, 0.3], [5.1, 4.4]];
const SETTLED = [[0, 0], [Q, Math.PI]];
const EDGES = 32;
const FACES = 24;    // square faces, each of them a wall of two of the eight cells
const WALLS = 48;
const HALF = 0.5;    // the cube's half side: the projection is refitted to exactly this
const SLACK = 1e-9;  // the refit lands on HALF, so this only absorbs the last bit of the float32 store
const BOX = 1e-6;    // how far a settled near-cell corner may sit off the box
const MOVED = 1e-4;  // units an endpoint has to travel between poses before it counts as having moved
const FLAT = 1e-5;   // how far a wall's fourth corner may sit off the plane of its first three
const NOAREA = 0.01; // a wall covering less of the figure than this has folded to a line and is exempt
const STEP = 1 / 60; // seconds between the poses the sweep steps through: one frame, so a move it finds is a move seen
const SPAN = 250;    // and how many seconds of turning it walks, which is a dozen turns of the figure and more
const SHRINK = 2.5;  // refining the sweep fourfold has to shrink the worst move by at least this, or it is a flip
// The sweep walks both planes at once, at rates with no common measure, so the path never closes and covers far
// more of the function than the home cube itself takes: the cube turns in the xw plane alone. The single-plane path
// is walked as well, because it lies on a symmetry of the figure where cells fold through their own walls far more
// often than they do anywhere off it, and it is the path the reader actually sees.
const XW = 0.245, YW = 0.22;

const failures = [];
const fail = (msg) => failures.push(msg);

const at = (a, b, fold = 0) => {
  const pos = new Float32Array(EDGES * 6), wt = new Float32Array(EDGES * 2);
  const wpos = new Float32Array(WALLS * 18), wnd = new Float32Array(WALLS * 4);
  hypercube(a, b, fold, pos, wt, wpos, wnd);
  return { pos, wt, wpos, wnd };
};
const name = ([a, b]) => '(' + a.toFixed(3) + ', ' + b.toFixed(3) + ')';
// a wall arrives as two triangles cut along one diagonal, so its four corners are vertices 0, 1, 2 and 5
const corner = (wpos, w, i) => { const o = w * 18 + [0, 1, 2, 5][i] * 3; return [wpos[o], wpos[o + 1], wpos[o + 2]]; };
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const wallArea = (wpos, w) => {
  const c = [0, 1, 2, 3].map((i) => corner(wpos, w, i));
  return 0.5 * (len(cross(sub(c[1], c[0]), sub(c[2], c[0]))) + len(cross(sub(c[2], c[0]), sub(c[3], c[0]))));
};
const key = (p) => p.map((v) => v.toFixed(6)).join(',');

// ---------------------------------------------------------------- a tesseract at every pose

const first = at(...POSES[0]);
if (first.pos.length / 6 !== EDGES) {
  fail('the figure has ' + (first.pos.length / 6) + ' edges, and a tesseract has ' + EDGES);
}
for (const pose of [...POSES, ...SETTLED]) {
  const { pos } = at(...pose);
  let worst = 0;
  for (let i = 0; i < pos.length; i++) worst = Math.max(worst, Math.abs(pos[i]));
  if (worst > HALF + SLACK) {
    fail('at ' + name(pose) + ' the figure reaches ' + worst.toFixed(6) + ' from the centre, past the ' + HALF +
      ' it is refitted to, so it would stand outside the cube it is supposed to be');
  }

  const seen = new Map();
  for (let e = 0; e < EDGES; e++) {
    for (const o of [e * 6, e * 6 + 3]) {
      const key = pos[o].toFixed(6) + ',' + pos[o + 1].toFixed(6) + ',' + pos[o + 2].toFixed(6);
      seen.set(key, (seen.get(key) || 0) + 1);
    }
  }
  if (seen.size !== 16) {
    fail('at ' + name(pose) + ' the 32 edges meet at ' + seen.size + ' distinct points, and a tesseract has 16: the ' +
      'projection has folded two vertices onto one point or the edge list joins the wrong pairs');
  }
  const wrong = [...seen.values()].filter((d) => d !== 4).length;
  if (wrong) {
    fail('at ' + name(pose) + ' ' + wrong + ' vertices meet a number of edges other than four, so the figure is not ' +
      'a tesseract: every vertex of one differs from exactly four others in a single coordinate');
  }
}

// ---------------------------------------------------------------- a plain cube at a settled pose

for (const pose of SETTLED) {
  const { pos, wt } = at(...pose);
  const onBox = [], off = [];
  for (let e = 0; e < EDGES; e++) {
    if (wt[e * 2] !== wt[e * 2 + 1]) fail('at ' + name(pose) + ' edge ' + e + ' carries a different weight at each end');
    if (wt[e * 2] === 1) onBox.push(e);
    else if (wt[e * 2] === 0) off.push(e);
  }
  if (onBox.length !== 12 || off.length !== 20) {
    fail('at ' + name(pose) + ' the weights are not the clean split a settled pose has to give: ' + onBox.length +
      ' edges at 1 and ' + off.length + ' at 0, wanted 12 and 20 (the near cell against the far cell and the connectors)');
    continue;
  }
  let worst = 0;
  for (const e of onBox) {
    for (let i = 0; i < 6; i++) worst = Math.max(worst, Math.abs(Math.abs(pos[e * 6 + i]) - HALF));
  }
  if (worst > BOX) {
    fail('at ' + name(pose) + ' the near cell is not the box: a corner sits ' + worst.toExponential(2) +
      ' off ' + HALF + ' on some axis, so the plate the collapse presses would be the wrong size');
  }
}

// ---------------------------------------------------------------- folded shut it is a plain cube

for (const pose of SETTLED) {
  const { pos } = at(...pose, 1);
  let worst = 0;
  for (let i = 0; i < pos.length; i++) worst = Math.max(worst, Math.abs(Math.abs(pos[i]) - HALF));
  if (worst > BOX) {
    fail('folded shut at ' + name(pose) + ' the figure is not the box: an endpoint sits ' + worst.toExponential(2) +
      ' off ' + HALF + ' on some axis, so the cube the collapse hands to the flatten is the wrong size');
  }
  let longest = 0;
  for (let e = 0; e < EDGES; e++) {
    const o = e * 6;
    const len = Math.hypot(pos[o] - pos[o + 3], pos[o + 1] - pos[o + 4], pos[o + 2] - pos[o + 5]);
    if (len < HALF) longest = Math.max(longest, len); // a connector: shorter than a cell edge once folded
  }
  if (longest > BOX) {
    fail('folded shut at ' + name(pose) + ' a connector still has length ' + longest.toExponential(2) +
      ', so the two cells have not come together and the fold does not read as shutting');
  }
}
// the refit has to hold the figure inside the box at an unsettled pose too, or a fold mid-turn would burst it
for (const pose of POSES) {
  const { pos } = at(...pose, 1);
  let worst = 0;
  for (let i = 0; i < pos.length; i++) worst = Math.max(worst, Math.abs(pos[i]));
  if (worst > HALF + SLACK) {
    fail('folded shut at ' + name(pose) + ' the figure reaches ' + worst.toFixed(6) + ', past the ' + HALF +
      ' it is refitted to');
  }
}

// ---------------------------------------------------------------- it turns

const a = at(...POSES[0]).pos, b = at(...POSES[1]).pos;
let most = 0;
for (let i = 0; i < a.length; i++) most = Math.max(most, Math.abs(a[i] - b[i]));
if (most < MOVED) {
  fail('the figure is frozen: no endpoint moves more than ' + most.toExponential(2) + ' between ' + name(POSES[0]) +
    ' and ' + name(POSES[1]) + ', so it is a still projection rather than a rotation');
}

// ---------------------------------------------------------------- the walls are the tesseract's own

for (const pose of [...POSES, ...SETTLED]) {
  const { pos, wpos, wnd } = at(...pose);
  if (wpos.length / 18 !== WALLS) {
    fail('the figure has ' + (wpos.length / 18) + ' walls, and a tesseract has ' + WALLS + ': 24 square faces, each ' +
      'of them a wall of two of the eight cells');
    break;
  }
  // every wall is one of the 24 faces, and every face turns up twice, once from each cell that owns it
  const faces = new Map();
  for (let w = 0; w < WALLS; w++) {
    const c = [0, 1, 2, 3].map((i) => corner(wpos, w, i));
    if (new Set(c.map(key)).size !== 4) {
      fail('at ' + name(pose) + ' wall ' + w + ' does not have four distinct corners, so it is not a square face');
      continue;
    }
    const k = c.map(key).sort().join('|');
    faces.set(k, (faces.get(k) || 0) + 1);
    // the wall's four sides have to be edges of the figure
    const edges = new Set();
    for (let e = 0; e < EDGES; e++) edges.add([key([pos[e * 6], pos[e * 6 + 1], pos[e * 6 + 2]]), key([pos[e * 6 + 3], pos[e * 6 + 4], pos[e * 6 + 5]])].sort().join('|'));
    for (let i = 0; i < 4; i++) {
      const side = [key(c[i]), key(c[(i + 1) % 4])].sort().join('|');
      if (!edges.has(side)) {
        fail('at ' + name(pose) + ' a side of wall ' + w + ' is not an edge of the figure, so its corners are taken ' +
          'across the square rather than round it and the wall is drawn as a bowtie');
        break;
      }
    }
    // and it has to be flat, which is what lets one triangle's normal speak for the whole wall
    const n = cross(sub(c[1], c[0]), sub(c[2], c[0]));
    if (len(n) > 1e-9 && Math.abs(dot(n, sub(c[3], c[0]))) / len(n) > FLAT) {
      fail('at ' + name(pose) + ' the fourth corner of wall ' + w + ' sits off the plane of the first three, so the ' +
        'normal the wash is read from speaks for half the wall only');
    }
    // the outward vector is a unit normal scaled by a reading that cannot exceed one
    const o = w * 4, out = [wnd[o], wnd[o + 1], wnd[o + 2]];
    if (len(out) > 1 + 1e-5) {
      fail('at ' + name(pose) + ' wall ' + w + ' has an outward vector of length ' + len(out).toFixed(4) +
        ', past the 1 a unit normal scaled by a cosine can reach');
    }
    if (len(out) > 1e-3 && len(n) > 1e-9 && Math.abs(dot(out, n)) / (len(out) * len(n)) < 1 - 1e-3) {
      fail('at ' + name(pose) + ' wall ' + w + ' has an outward vector that is not along its own normal');
    }
    if (!(wnd[o + 3] >= 0 && wnd[o + 3] <= 1)) {
      fail('at ' + name(pose) + ' wall ' + w + ' reports a 4D depth of ' + wnd[o + 3] + ', outside 0..1');
    }
  }
  if (faces.size !== FACES || [...faces.values()].some((n) => n !== 2)) {
    fail('at ' + name(pose) + ' the walls cover ' + faces.size + ' distinct faces at counts ' +
      [...new Set(faces.values())].join('/') + ', and a tesseract has ' + FACES + ' faces each shared by two cells');
  }
}

// at a settled pose the near cell is the box, and both cells owning one of its faces sit inside it, so those walls
// have to face out of the figure. This is the only place the sign of the outward reading can be pinned from outside
for (const pose of SETTLED) {
  const { wpos, wnd } = at(...pose);
  let onBox = 0;
  for (let w = 0; w < WALLS; w++) {
    const c = [0, 1, 2, 3].map((i) => corner(wpos, w, i));
    if (!c.every((p) => p.every((v) => Math.abs(Math.abs(v) - HALF) < BOX))) continue;
    onBox++;
    const mid = [0, 1, 2].map((k) => (c[0][k] + c[1][k] + c[2][k] + c[3][k]) / 4);
    const out = [wnd[w * 4], wnd[w * 4 + 1], wnd[w * 4 + 2]];
    if (dot(out, mid) / (len(out) * len(mid)) < 0.9) {
      fail('at ' + name(pose) + ' wall ' + w + ' is a wall of the box and its outward vector points back into the ' +
        'figure, so the wash would land on the near side and veil the word instead of standing behind it');
    }
  }
  if (onBox !== 12) {
    fail('at ' + name(pose) + ' ' + onBox + ' walls lie on the box, wanted 12: the near cell has six faces and each ' +
      'is a wall of the near cell and of one connector');
  }
}

// ---------------------------------------------------------------- the wash does not blink

// A wall's outward vector can swing quickly and still be sound: it swings through zero as its cell flattens, and it
// is drawn at nothing while it does. What it may not do is arrive somewhere it was not on its way to. So the test is
// not a ceiling on the step, which a fast swing would trip, but whether the step shrinks when the sweep is refined.
// A vector that turns continuously moves a quarter as far over a quarter of the interval; one that flips moves the
// same distance however finely the sweep is cut, because the flip is between two samples wherever they are put.
// Both the path the cube takes and a denser one off it are walked: the single-plane path lies on a symmetry of the
// figure and folds cells through their own walls far more often than a generic path does, so a rule can be sound
// everywhere else and still flash ninety times a minute on the one path a reader ever sees.
// A wall that has folded to a line is exempt. Its normal is whatever three points in a row happen to say, so it does
// swing hard, but it is drawn across a few thousandths of the figure while it does and nothing of it can be seen.
const sweep = (step, span, yw) => {
  let worst = 0, at1 = null;
  let prev = at(0, 0), prevArea = [...Array(WALLS).keys()].map((w) => wallArea(prev.wpos, w));
  for (let s = 1; s * step < span; s++) {
    const t = s * step, cur = at(XW * t, yw * t);
    const area = [...Array(WALLS).keys()].map((w) => wallArea(cur.wpos, w));
    for (let w = 0; w < WALLS; w++) {
      if (Math.min(area[w], prevArea[w]) < NOAREA) continue;
      const o = w * 4;
      const moved = Math.hypot(cur.wnd[o] - prev.wnd[o], cur.wnd[o + 1] - prev.wnd[o + 1], cur.wnd[o + 2] - prev.wnd[o + 2]);
      if (moved > worst) { worst = moved; at1 = [t, w]; }
    }
    prev = cur; prevArea = area;
  }
  return { worst, at: at1 };
};
let shrink = Infinity;
for (const [path, yw] of [['the one plane the cube turns in', 0], ['both planes at once', YW]]) {
  const coarse = sweep(STEP, SPAN, yw), fine = sweep(STEP / 4, SPAN, yw);
  const ratio = fine.worst > 0 ? coarse.worst / fine.worst : Infinity;
  shrink = Math.min(shrink, ratio);
  if (ratio < SHRINK) {
    fail('sweeping ' + path + ', cutting the step from one frame to a quarter of one left the worst move in a ' +
      'wall\'s outward vector nearly where it was, ' + coarse.worst.toFixed(3) + ' against ' + fine.worst.toFixed(3) +
      ' (wall ' + coarse.at[1] + ' at t = ' + coarse.at[0].toFixed(2) + '). That is a flip between two frames, not a ' +
      'turn: the wash on that wall lands somewhere it was never on its way to, which reads as a flash. A cell of a ' +
      'projected tesseract folds through itself, and the reading that says which way is out has to pass through ' +
      'zero as it does. Dividing that reading by the length of the step from the cell\'s centre destroys exactly ' +
      'that, since the step reverses through the fold while its length stays put, and the quotient is the same ' +
      'either side');
  }
}

// folded shut at a settled pose the twelve faces that span w have come together onto nothing, and the other twelve
// lie two deep on the box's six
for (const pose of SETTLED) {
  const { wpos } = at(...pose, 1);
  const flat = [...Array(WALLS).keys()].filter((w) => wallArea(wpos, w) < 1e-6).length;
  if (flat !== 24) {
    fail('folded shut at ' + name(pose) + ' ' + flat + ' walls have come to nothing, wanted 24: the twelve faces ' +
      'that span w, each of them a wall of two cells');
  }
  let worstOff = 0;
  for (let i = 0; i < wpos.length; i++) worstOff = Math.max(worstOff, Math.abs(wpos[i]) - HALF);
  if (worstOff > BOX) {
    fail('folded shut at ' + name(pose) + ' a wall reaches ' + worstOff.toExponential(2) + ' past the box');
  }
}

// ---------------------------------------------------------------- report

if (failures.length) {
  console.error('check-hypercube: ' + failures.length + ' failure' + (failures.length === 1 ? '' : 's'));
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
console.log('check-hypercube: ' + EDGES + ' edges meeting four to a vertex inside ' + HALF + ' at ' +
  (POSES.length + SETTLED.length) + ' poses, the near cell exactly on the box at both settled ones, and turning (up to ' +
  most.toFixed(4) + '); ' + WALLS + ' flat walls over ' + FACES + ' faces, each face owned by two cells, the box\'s ' +
  'own walls facing out, and every outward vector turning rather than flipping (a quarter of the step left ' +
  shrink.toFixed(1) + ' times less of the worst move, against the ' + SHRINK + ' a turn has to manage)');
