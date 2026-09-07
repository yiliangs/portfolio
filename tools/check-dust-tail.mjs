// Checks field.js's two pure helpers: the cut that gives every dust particle a tail of a set length, and the octave
// weighting that gives the landscape a continuous amount of detail.
//
// The tail used to be an accident of two settings: ink was left on the canvas and thinned a little each frame, so how
// far back a trail reached depended on the fade rate, the frame rate and how fast that particle happened to be
// moving. It is now a length in pixels, and tailPath() is what turns a particle's recorded path into it.
//
// Three things have to hold, and none of them is visible in a still frame because a trail that is somewhat too long
// or too short still looks like a trail. A path longer than the tail has to be cut at exactly the tail length, or
// the slider does not mean what it says. A path shorter than the tail has to be drawn whole rather than clipped or
// extrapolated, which is the case for a particle that has just spawned. And an empty path has to draw nothing at
// all, rather than a degenerate stroke at the origin.
//
// The band split is checked with it: the three alpha bands have to meet at shared points, or the taper shows seams.
//
// Run with `npm run check`. Exits non-zero and prints every failure it found.

import { tailPath, octaveWeights } from '../field.js';

const EPS = 1e-9;
const failures = [];
const fail = (msg) => failures.push(msg);

const out = new Float64Array(256), splits = new Int32Array(2);
// a straight path down the x axis, points one unit apart, head first
const straight = (n) => { const a = new Float64Array(n * 2); for (let i = 0; i < n; i++) { a[i * 2] = -i; a[i * 2 + 1] = 0; } return a; };
const length = (c) => { let L = 0; for (let i = 1; i < c; i++) L += Math.hypot(out[i * 2] - out[i * 2 - 2], out[i * 2 + 1] - out[i * 2 - 1]); return L; };

// ---------------------------------------------------------------- an empty path draws nothing

if (tailPath(new Float64Array(0), 0, 24, out, splits) !== 0) {
  fail('a particle with no recorded path still produced points to draw');
}
if (tailPath(straight(8), 8, 0, out, splits) !== 0) {
  fail('a tail length of zero still produced points to draw, so the slider cannot turn the tails off');
}

// ---------------------------------------------------------------- a long path is cut at the tail length

for (const tail of [1, 7, 24, 99.5, 200]) {
  const n = 260; // 259 units of path, longer than any tail asked for
  const c = tailPath(straight(n), n, tail, out, splits);
  const L = length(c);
  if (Math.abs(L - tail) > 1e-6) {
    fail('a path longer than the tail was not cut at the tail length: asked for ' + tail + ' px, drew ' + L.toFixed(9) +
      ' px. The slider then does not mean the length it says');
  }
  if (c < 2) fail('a path longer than the tail at ' + tail + ' px drew fewer than two points');
}

// ---------------------------------------------------------------- a short path is drawn whole

{
  const n = 5; // 4 units of path against a 24 px tail
  const c = tailPath(straight(n), n, 24, out, splits);
  if (c !== n) fail('a path shorter than the tail was not drawn whole: ' + n + ' points in, ' + c + ' out');
  const L = length(c);
  if (Math.abs(L - (n - 1)) > 1e-9) {
    fail('a path shorter than the tail changed length: ' + (n - 1) + ' px in, ' + L.toFixed(9) + ' px out');
  }
  if (splits[1] !== c - 1 || splits[0] !== c - 1) {
    fail('a path shorter than the tail should leave the two later bands empty at its end, but the splits are ' +
      splits[0] + ' and ' + splits[1] + ' of ' + (c - 1));
  }
}

// ---------------------------------------------------------------- the bands meet, and at the thirds

for (const tail of [9, 24, 200]) {
  const n = 260;
  const c = tailPath(straight(n), n, tail, out, splits);
  if (!(splits[0] > 0 && splits[0] <= splits[1] && splits[1] <= c - 1)) {
    fail('the band splits are out of order at tail ' + tail + ': 0 < ' + splits[0] + ' <= ' + splits[1] + ' <= ' + (c - 1) + ' does not hold');
    continue;
  }
  // the path runs down the x axis from 0, so a point's distance along it is just -x
  const at1 = -out[splits[0] * 2], at2 = -out[splits[1] * 2];
  if (Math.abs(at1 - tail / 3) > 1e-6) fail('the first band ends at ' + at1.toFixed(6) + ' px, not at a third of ' + tail);
  if (Math.abs(at2 - tail * 2 / 3) > 1e-6) fail('the second band ends at ' + at2.toFixed(6) + ' px, not at two thirds of ' + tail);
}

// ---------------------------------------------------------------- the octave count blends

// height() itself is a closure over params and the clock inside mount(), so it is not exported and not checked here.
// octaveWeights is the whole of what made the count continuous, and it is pure, so it is what this holds to account.
// The weights it returns at each whole number have to be the ones the old integer gates applied, or the landscape
// would change shape the moment the setting became a fraction rather than a count.
{
  const w = new Float64Array(4);
  const WHOLE = [[1, [1, 0, 0, 0]], [2, [1, 0.5, 0, 0]], [3, [1, 0.5, 0.25, 0]], [4, [1, 0.5, 0.25, 0.125]]];
  for (const [octaves, want] of WHOLE) {
    const sum = octaveWeights(octaves, w);
    for (let i = 0; i < 4; i++) {
      if (Math.abs(w[i] - want[i]) > EPS) {
        fail('at octaves ' + octaves + ' the weight on octave ' + (i + 1) + ' is ' + w[i] + ', and the integer gates it ' +
          'replaced gave ' + want[i] + ': the landscape would change shape as the setting became continuous');
      }
    }
    const wantSum = want.reduce((a, b) => a + b, 0);
    if (Math.abs(sum - wantSum) > EPS) fail('at octaves ' + octaves + ' the weight sum is ' + sum + ', not ' + wantSum);
  }
  // the map used to divide a height by 1.875, which is exactly the four octave sum; that has to still hold or the
  // shading and contour levels would sit at a different place on the scale
  if (Math.abs(octaveWeights(4, w) - 1.875) > EPS) {
    fail('the four octave sum is no longer 1.875, so the contour map normalisation has drifted off its old scale');
  }

  // a fraction has to sit between the whole numbers on either side, on every octave and on the sum
  const lo = new Float64Array(4), mid = new Float64Array(4), hi = new Float64Array(4);
  const sLo = octaveWeights(1, lo), sMid = octaveWeights(1.5, mid), sHi = octaveWeights(2, hi);
  for (let i = 0; i < 4; i++) {
    if (mid[i] < Math.min(lo[i], hi[i]) - EPS || mid[i] > Math.max(lo[i], hi[i]) + EPS) {
      fail('at octaves 1.5 the weight on octave ' + (i + 1) + ' is ' + mid[i] + ', outside the ' + lo[i] + ' to ' +
        hi[i] + ' the whole numbers on either side give, so the slider does not blend');
    }
  }
  if (!(sMid > sLo + EPS && sMid < sHi - EPS)) {
    fail('at octaves 1.5 the weight sum is ' + sMid + ', not strictly between ' + sLo + ' and ' + sHi + ': the ' +
      'setting is not doing anything between the whole numbers');
  }

  // and the whole slider has to climb, never step back
  let prev = -1, prevAt = 0;
  for (let o = 1; o <= 4.0001; o += 0.05) {
    const s = octaveWeights(o, w);
    if (s < prev - EPS) fail('the weight sum falls from ' + prev + ' at octaves ' + prevAt.toFixed(2) + ' to ' + s +
      ' at ' + o.toFixed(2) + ', so more detail can mean less amplitude');
    prev = s; prevAt = o;
  }
}

// ---------------------------------------------------------------- report

if (failures.length) {
  console.error('check-dust-tail: ' + failures.length + ' failure' + (failures.length === 1 ? '' : 's'));
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
console.log('check-dust-tail: an empty path draws nothing, a long path is cut to the tail length exactly, a short one ' +
  'is drawn whole, the three bands meet at the thirds, and the octave weights match the old integer gates at every ' +
  'whole number while blending between them');
