// Checks that the standing parchment roll moves and that the landed platform does not.
//
// The roll's shape lives in one place: point(u, v, W, H, k, t) in parchment.js, which both the sheet mesh and the
// wireframe are filled from. Two things have to stay true of it at once. At rest (k = 0) it has to depend on t, or
// the roll is the rigid outline it was before the curls breathed and the span fluttered. At the platform pose
// (k = 1) it has to not depend on t at all: the home cube lands as that exact plate, so any motion left in the
// sheet would show as a twitch at the moment the cube hands over to it.
//
// The third check pins the flat sheet to the formula the platform was set out from, so its proportions cannot
// drift while someone tunes the breath or the flutter. The fourth holds point() and pointInto() to each other:
// what is on screen is filled through pointInto, everything that reads the shape reads it through point, and the
// two are one piece of arithmetic written twice.
//
// Run with `npm run check`. Exits non-zero and prints every failure it found.

import { point, pointInto } from '../parchment.js';

const W = 2.9, H = 1.55; // the roll's own sheet size, from mount()
const TIMES = [0, 3.7, 11.2];
const MOVED = 1e-4;  // world units a sample has to travel before it counts as having moved
const SHARE = 0.25;  // fraction of the samples that have to move while the roll stands
const SEEN = 0.01;   // the largest travel has to clear this, or the motion is there but invisible
const EXACT = 1e-12; // the flat sheet is arithmetic, not simulation, so it should match to the last bits

const failures = [];
const fail = (msg) => failures.push(msg);

const samples = [];
for (let i = 0; i <= 40; i++) for (let j = 0; j <= 8; j++) samples.push([i / 40, j / 8]);
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const at = (u, v, t) => 'u ' + u.toFixed(3) + ', v ' + v.toFixed(3) + ', t ' + t;

// ---------------------------------------------------------------- the standing roll moves

let moving = 0, most = 0;
for (const [u, v] of samples) {
  const d = dist(point(u, v, W, H, 0, TIMES[0]), point(u, v, W, H, 0, TIMES[1]));
  if (d > MOVED) moving++;
  if (d > most) most = d;
}
const wanted = Math.ceil(samples.length * SHARE);
if (moving < wanted) {
  fail('the standing roll is rigid: only ' + moving + ' of ' + samples.length + ' samples move between t = ' +
    TIMES[0] + ' and t = ' + TIMES[1] + ', and at least ' + wanted + ' should');
}
if (most < SEEN) {
  fail('the standing roll barely moves: the largest travel over that interval is ' + most.toFixed(6) +
    ' world units, too small to read against a sheet ' + W + ' across');
}

// ---------------------------------------------------------------- the landed platform is still

let stir = 0, stirAt = null;
for (const [u, v] of samples) {
  const rest = point(u, v, W, H, 1, TIMES[0]);
  for (const t of TIMES.slice(1)) {
    const d = dist(rest, point(u, v, W, H, 1, t));
    if (d > stir) { stir = d; stirAt = at(u, v, t); }
  }
}
if (stir !== 0) {
  fail('the landed platform is not still: ' + stirAt + ' moves ' + stir.toExponential(2) +
    ' world units off its resting place. Every motion term has to be scaled by 1 - k so it is exactly zero at k = 1');
}

// ---------------------------------------------------------------- the flat sheet keeps its proportions

// the sheet as it was before the roll was given any motion: a plane W by H carrying only the settled sag
const flatSag = (u, v) => Math.sin(u * Math.PI) * 0.03 * Math.cos((v - 0.5) * Math.PI);
let off = 0, offAt = null;
for (const [u, v] of samples) {
  for (const t of TIMES) {
    const d = dist(point(u, v, W, H, 1, t), [-W / 2 + u * W, (v - 0.5) * H, flatSag(u, v) * 0.25]);
    if (d > off) { off = d; offAt = at(u, v, t); }
  }
}
if (off > EXACT) {
  fail('the flat sheet has left the shape the platform is set out from: ' + offAt + ' sits ' + off.toExponential(2) +
    ' world units off x = -W/2 + uW, y = (v - 0.5)H, z = sag/4');
}

// ---------------------------------------------------------------- the buffer fill is the same shape

// The sheet and the wire are refilled vertex by vertex every frame the roll is not flat, so the fill writes
// straight into the position array through pointInto rather than returning a fresh pair of arrays per vertex.
// point() is the same arithmetic with an array around it, and the two have to stay the same arithmetic: the
// geometry builders and every check above read the shape through point, while what is on screen comes through
// pointInto. Equality is per component and exact, because the two are meant to be one function.
{
  const buf = new Float64Array(3);
  let apart = 0, apartAt = null;
  for (let i = 0; i <= 40; i++) for (let j = 0; j <= 8; j++) {
    // the curls at either end (u < 0.2, u > 0.8) are the branches worth naming; the sweep covers them and the span
    const u = i / 40, v = j / 8;
    for (const k of [0, 0.35, 1]) for (const t of TIMES) {
      const a = point(u, v, W, H, k, t);
      pointInto(u, v, W, H, k, t, buf, 0);
      for (let c = 0; c < 3; c++) if (a[c] !== buf[c]) { apart++; if (!apartAt) apartAt = at(u, v, t) + ', k ' + k + ', component ' + c + ': ' + a[c] + ' against ' + buf[c]; }
    }
  }
  if (apart) {
    fail('the fill and the shape have come apart at ' + apart + ' components (first at ' + apartAt + '). What is ' +
      'drawn comes through pointInto and everything that reads the roll comes through point; they are one piece ' +
      'of arithmetic and have to agree to the last bit');
  }
}

// ---------------------------------------------------------------- report

if (failures.length) {
  console.error('check-roll-motion: ' + failures.length + ' failure' + (failures.length === 1 ? '' : 's'));
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
console.log('check-roll-motion: ' + moving + ' of ' + samples.length + ' samples move while the roll stands (up to ' +
  most.toFixed(4) + ' world units), the landed platform is identical at every t, and the buffer fill is the shape ' +
  'to the last bit');
