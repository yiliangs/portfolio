// Checks how the home cube and the word inside it are turned.
//
// The figure has to stay where the reader left it. Its own turn is a slow roll about the axis pointing at the
// reader, and roll is the one turn of the three that takes nothing out of sight: pitch and yaw carry a face away
// behind the figure, roll only turns what is already facing you. So the cube's pose has to stay inside a bounded
// arc of the three-quarter view it is read from, forever, and it has to get there by rocking rather than by
// walking. A yaw that advances every frame breaks this within seconds even though no single frame looks wrong,
// which is what it used to do.
//
// The word is counter-rotated inside all that, and it has its own two claims. It must not keep a share of the
// cube's turn, or it tips off level by that share and is read at an angle. And it must not be brought back by a
// shortest-arc slerp against the cube's inverse, which flips to the other arc as soon as the dot product goes
// negative and shows as a jump.
//
// So this steps four minutes of the clock at 60 frames a second and asserts four things: the cube stays near the
// view it is read from, the cube never lurches between frames, the word never drifts far from facing the reader,
// and the word never jumps. Both poses come from home.js itself rather than being written out again here, because
// a copy of the cube's turn kept in this file would go on passing after the real one changed.
//
// Run with `npm run check`. Exits non-zero and prints every failure it found.

import * as THREE from '../vendor/three-0.160.0.module.min.js';
import { cubePose, wordPose } from '../home.js';

const SECONDS = 240, DT = 1 / 60;
const STEP_MAX = 0.01;   // rad a frame may turn the word
const AWAY_MAX = 0.15;   // rad the word may sit off facing the reader
const CUBE_ARC = 0.45;   // rad the cube may sit off the view it is read from, roll and cursor together
const CUBE_STEP = 0.01;  // and rad it may turn in one frame

const failures = [];
const fail = (msg) => failures.push(msg);

const cube = new THREE.Quaternion(), pushed = new THREE.Quaternion(), rest = new THREE.Quaternion();
const word = new THREE.Quaternion(), world = new THREE.Quaternion();
const prevWord = new THREE.Quaternion(), prevCube = new THREE.Quaternion();
const ident = new THREE.Quaternion();
const between = (p, q) => 2 * Math.acos(Math.min(1, Math.abs(p.dot(q))));

// the view the figure is read from, which is where its own turn stands at rest
cubePose(0, 0, 0, rest);

let worstStep = 0, worstStepAt = 0, worstAway = 0, worstAwayAt = 0;
let worstArc = 0, worstArcAt = 0, worstCubeStep = 0, worstCubeStepAt = 0;
for (let i = 0; i * DT <= SECONDS; i++) {
  const t = i * DT;
  // The arc is read with the cursor swept to its stops, since being pushed about is part of what the reader can put
  // the figure through. The word is read with the cursor centred, which leaves its own wobble as the only thing
  // between it and the reader, so any share of the cube's turn it kept would show at once instead of hiding under
  // the lean the cursor is allowed to give it.
  cubePose(t, Math.sin(t * 0.7) * 0.7, Math.cos(t * 0.5) * 0.7, pushed);
  cubePose(t, 0, 0, cube);
  wordPose(t, 0, 0, cube, word);
  world.copy(cube).multiply(word); // what the reader actually sees of the word

  const arc = between(pushed, rest);
  if (arc > worstArc) { worstArc = arc; worstArcAt = t; }
  const away = between(world, ident);
  if (away > worstAway) { worstAway = away; worstAwayAt = t; }
  if (i > 0) {
    const step = between(world, prevWord);
    if (step > worstStep) { worstStep = step; worstStepAt = t; }
    const cubeStep = between(pushed, prevCube);
    if (cubeStep > worstCubeStep) { worstCubeStep = cubeStep; worstCubeStepAt = t; }
  }
  prevWord.copy(world); prevCube.copy(pushed);
}

if (worstArc > CUBE_ARC) {
  fail('the figure wanders off the view it is read from: it reaches ' + worstArc.toFixed(3) + ' rad away at t = ' +
    worstArcAt.toFixed(1) + ' s, past the ' + CUBE_ARC + ' rad it is allowed. Its own turn has to rock about the ' +
    'axis facing the reader and come back, not advance: a turn that advances shows nothing wrong in one frame and ' +
    'has the figure round the back a minute later');
}
if (worstCubeStep > CUBE_STEP) {
  fail('the figure lurches: it turns ' + worstCubeStep.toFixed(4) + ' rad in one frame at t = ' +
    worstCubeStepAt.toFixed(1) + ' s, past the ' + CUBE_STEP + ' rad it is allowed');
}
if (worstAway > AWAY_MAX) {
  fail('the word turns away from the reader: it reaches ' + worstAway.toFixed(3) + ' rad off at t = ' +
    worstAwayAt.toFixed(1) + ' s, past the ' + AWAY_MAX + ' rad it is allowed. It is keeping a share of the cube\'s ' +
    'turn, so it is read at an angle whenever the figure is rolled over');
}
if (worstStep > STEP_MAX) {
  fail('the word jumps: it moves ' + worstStep.toFixed(4) + ' rad in one frame at t = ' + worstStepAt.toFixed(1) +
    ' s, past the ' + STEP_MAX + ' rad it is allowed. A shortest-arc slerp against the cube\'s inverse flips arc ' +
    'when the dot product goes negative');
}

if (failures.length) {
  console.error('check-home-pose: ' + failures.length + ' failure' + (failures.length === 1 ? '' : 's'));
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
console.log('check-home-pose: over ' + SECONDS + ' s the figure stays within ' + worstArc.toFixed(3) +
  ' rad of the view it is read from and never turns more than ' + worstCubeStep.toFixed(5) + ' rad in a frame, ' +
  'and the word stays within ' + worstAway.toFixed(3) + ' rad of the reader and never moves more than ' +
  worstStep.toFixed(5) + ' rad in a frame');
