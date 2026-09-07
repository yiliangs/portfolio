// Checks the tesseract the home cube is made of.
//
// hypercube(a, b, pos, wt) in home.js is the whole object: the cube has no wireframe of its own any more, so these
// 32 edges are the only thing drawing it. Two claims have to hold at once and neither shows in a still frame.
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
// Run with `npm run check`. Exits non-zero and prints every failure it found.

import { hypercube } from '../home.js';

const Q = Math.PI / 2;
const POSES = [[0, 0], [0.7, 1.9], [2.4, 0.3], [5.1, 4.4]];
const SETTLED = [[0, 0], [Q, Math.PI]];
const EDGES = 32;
const HALF = 0.5;    // the cube's half side: the projection is refitted to exactly this
const SLACK = 1e-9;  // the refit lands on HALF, so this only absorbs the last bit of the float32 store
const BOX = 1e-6;    // how far a settled near-cell corner may sit off the box
const MOVED = 1e-4;  // units an endpoint has to travel between poses before it counts as having moved

const failures = [];
const fail = (msg) => failures.push(msg);

const at = (a, b, fold = 0) => {
  const pos = new Float32Array(EDGES * 6), wt = new Float32Array(EDGES * 2);
  hypercube(a, b, fold, pos, wt);
  return { pos, wt };
};
const name = ([a, b]) => '(' + a.toFixed(3) + ', ' + b.toFixed(3) + ')';

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

// ---------------------------------------------------------------- report

if (failures.length) {
  console.error('check-hypercube: ' + failures.length + ' failure' + (failures.length === 1 ? '' : 's'));
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
console.log('check-hypercube: ' + EDGES + ' edges meeting four to a vertex inside ' + HALF + ' at ' +
  (POSES.length + SETTLED.length) + ' poses, the near cell exactly on the box at both settled ones, and turning (up to ' +
  most.toFixed(4) + ')');
