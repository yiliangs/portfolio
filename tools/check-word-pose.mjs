// Checks that the word inside the home cube stays facing the reader, and gets there smoothly.
//
// The cube's yaw grows without bound: tick() turns it by 0.5 + t * 0.16 radians, so it passes PI about every twenty
// seconds and keeps going. The word is counter-rotated inside it. Any scheme that leaves the word a fixed share of
// the cube's turn therefore walks it right around over a couple of minutes until it is read from behind, and taking
// that share with a shortest-arc slerp is worse still: a slerp flips to the other arc as soon as the dot product
// goes negative, so at every PI crossing the residual snaps to the opposite side and the word visibly jumps.
//
// So this steps four minutes of the clock at 60 frames a second and asserts two things about the word's orientation
// in world space, which is the cube's turn composed with the word's own: it never drifts far from facing the reader,
// and it never moves much between one frame and the next. The first rules out the walk, the second the jump.
//
// Run with `npm run check`. Exits non-zero and prints every failure it found.

import * as THREE from '../vendor/three-0.160.0.module.min.js';
import { wordPose } from '../home.js';

const SECONDS = 240, DT = 1 / 60;
const STEP_MAX = 0.01;  // rad a frame may turn the word
const AWAY_MAX = 0.15;  // rad the word may sit off facing the reader

const failures = [];
const fail = (msg) => failures.push(msg);

const eul = new THREE.Euler(), cubeQ = new THREE.Quaternion();
const word = new THREE.Quaternion(), world = new THREE.Quaternion(), prev = new THREE.Quaternion();
const ident = new THREE.Quaternion();
const between = (p, q) => 2 * Math.acos(Math.min(1, Math.abs(p.dot(q))));

// the cube's free pose, exactly as tick() builds it, with the cursor centred
const cubeAt = (t) => {
  eul.set(-0.22 + Math.sin(t * 0.42) * 0.05, 0.5 + t * 0.16, 0);
  return cubeQ.setFromEuler(eul);
};

let worstStep = 0, worstStepAt = 0, worstAway = 0, worstAwayAt = 0;
for (let i = 0; i * DT <= SECONDS; i++) {
  const t = i * DT;
  wordPose(t, 0, 0, cubeAt(t), word);
  world.copy(cubeAt(t)).multiply(word); // what the reader actually sees
  const away = between(world, ident);
  if (away > worstAway) { worstAway = away; worstAwayAt = t; }
  if (i > 0) {
    const step = between(world, prev);
    if (step > worstStep) { worstStep = step; worstStepAt = t; }
  }
  prev.copy(world);
}

if (worstAway > AWAY_MAX) {
  fail('the word turns away from the reader: it reaches ' + worstAway.toFixed(3) + ' rad off at t = ' +
    worstAwayAt.toFixed(1) + ' s, past the ' + AWAY_MAX + ' rad it is allowed. It is keeping a share of the cube\'s ' +
    'yaw, which grows without bound, so given long enough the word is read from behind');
}
if (worstStep > STEP_MAX) {
  fail('the word jumps: it moves ' + worstStep.toFixed(4) + ' rad in one frame at t = ' + worstStepAt.toFixed(1) +
    ' s, past the ' + STEP_MAX + ' rad it is allowed. A shortest-arc slerp against the cube\'s inverse flips arc ' +
    'when the dot product goes negative, which happens every time the yaw passes PI');
}

if (failures.length) {
  console.error('check-word-pose: ' + failures.length + ' failure' + (failures.length === 1 ? '' : 's'));
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
console.log('check-word-pose: over ' + SECONDS + ' s the word stays within ' + worstAway.toFixed(3) +
  ' rad of the reader and never moves more than ' + worstStep.toFixed(5) + ' rad in a frame');
