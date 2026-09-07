// Checks that the parchment roll only travels between two poses the reader actually saw.
//
// The roll is a fixed, full-viewport canvas anchored to whatever box the current view offers it: the word on Home,
// the standing sheet behind the Research headline, the plate on the Development landing. A register change moves it
// from one of those to the next by flying it there, which is the whole trick: one object, carried across the page
// turn, so the two screens read as two views of the same room.
//
// A chapter and the CV offer it no anchor at all. syncParchment fades the layer away for those, and the pose it was
// last placed at has to go with it. If the pose survives the fade, the next tab click finds a stale pose and a live
// anchor and takes the travel branch: the roll is lifted to the body at full opacity and flown in over 900ms from a
// place the reader was never shown. Nothing in the browser reports that; it just looks like a model arriving from
// nowhere. The same gap runs the other way, where a travel already in flight keeps ticking after the anchor it was
// heading for has left the page, and the tick that finishes it writes the layer's opacity back over the fade-out.
//
// So this drives the real syncParchment through three itineraries and reads what it did to the layer and to the
// sim's anchor. The second one is the counterweight: the fix must not be "never travel", so a page-to-page register
// change with the roll on screen the whole way has to still fly.
//
// Run with `npm run check`. Exits non-zero and prints every failure it found.

import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const SRC = 'design/Portfolio.dc.html';

const failures = [];
const fail = (msg) => failures.push(msg);

// the methods are read out of the logic class and run for real, so this check cannot drift from a copy of them.
// Every member of that class sits at two-space indent, so `\n  }` closes the method.
function readMethod(src, name) {
  const at = src.indexOf('\n  ' + name + '(');
  if (at < 0) return null;
  const open = src.indexOf('{', at);
  const end = src.indexOf('\n  }', open);
  if (open < 0 || end < 0) return null;
  return src.slice(open + 1, end);
}

const src = readFileSync(SRC, 'utf8');
const closeAt = src.lastIndexOf('</x-dc>');
if (closeAt < 0) {
  console.error('check-roll-return: no <x-dc> block in ' + SRC);
  process.exit(1);
}
const logicSrc = src.slice(closeAt);
const syncBody = readMethod(logicSrc, 'syncParchment');
if (syncBody === null) {
  console.error('check-roll-return: the logic class has no syncParchment method, so nothing places the roll');
  process.exit(1);
}
// the pose may be dropped by a helper or inline in syncParchment; this check reads behaviour, not shape
const dropBody = readMethod(logicSrc, 'dropParchPose');

// ---------------------------------------------------------------- a browser enough for the method to run in

const dom = new JSDOM('<!doctype html><body></body>');
const doc = dom.window.document;
globalThis.window = dom.window;
globalThis.document = doc;
dom.window.innerWidth = 1440;
dom.window.innerHeight = 900;

let nextFrame = 1;
const frames = new Map();
globalThis.requestAnimationFrame = (fn) => { const id = nextFrame++; frames.set(id, fn); return id; };
globalThis.cancelAnimationFrame = (id) => { frames.delete(id); };
const runFrames = (now) => { const due = [...frames.values()]; frames.clear(); for (const fn of due) fn(now); };

const anchor = (x, y, w, h) => {
  const el = doc.createElement('div');
  el.getBoundingClientRect = () => ({ x, y, width: w, height: h, left: x, top: y, right: x + w, bottom: y + h });
  el.box = { x, y, w, h };
  return el;
};

// the three boxes the roll is ever anchored to, at the sizes the page gives them
const HOME = anchor(520, 180, 400, 400);
const SCRIPT = anchor(500, 120, 437, 700);
const PLATFORM = anchor(880, 158, 508, 440);

function stage() {
  const root = doc.createElement('div');
  const layer = doc.createElement('div');
  root.appendChild(layer);
  doc.body.appendChild(root);
  frames.clear();
  const placed = [];
  const app = {
    state: { view: 'home' },
    rootRef: { current: root },
    parchLayerRef: { current: layer },
    homeRollRef: { current: null },
    scriptRef: { current: null },
    platformRef: { current: null },
    CUBE_COLLAPSE_MS: 760,
    bez: (t) => t,
    parch: {
      setAnchor(p) { placed.push({ ...p }); },
      setUnroll() {},
      quench() {},
    },
  };
  const sync = new Function(syncBody);
  app.syncParchment = () => sync.call(app);
  const drop = dropBody === null ? null : new Function(dropBody);
  app.dropParchPose = drop === null ? () => {} : () => drop.call(app);
  // the view the reader is looking at, with the anchors that view renders and the stamp transition() leaves
  const go = (view, el) => {
    app.state.view = view;
    app.homeRollRef.current = el === HOME ? HOME : null;
    app.scriptRef.current = el === SCRIPT ? SCRIPT : null;
    app.platformRef.current = el === PLATFORM ? PLATFORM : null;
    app.parchTravel = true;
    app.parchT0 = 1000;
    app.syncParchment();
  };
  return { app, root, layer, placed, go };
}

const at = (p) => 'x ' + Math.round(p.x) + ', y ' + Math.round(p.y) + ', w ' + Math.round(p.w) + ', k ' + p.k;
const on = (p, el) => p && p.x === el.box.x && p.y === el.box.y && p.w === el.box.w && p.h === el.box.h;

// ---------------------------------------------------------------- a sheet hands off to the other tab

{
  const { app, root, layer, placed, go } = stage();
  go('page', SCRIPT);                       // the Research landing: the roll stands behind the headline
  const settled = placed.length;
  go('chapter', null);                      // a sheet under that tab: no anchor, the layer fades away
  if (layer.style.opacity !== '0') {
    fail('a chapter left the roll at opacity ' + layer.style.opacity + '; a view with no anchor has to fade it away');
  }
  const hidden = placed.length;
  go('page', PLATFORM);                     // the other tab

  if (app.parchTween) {
    fail('clicking a tab from a sheet armed a travel from ' + at(app.parchPose || {}) + '. The roll was not on ' +
      'screen on the sheet, so there is no pose to fly out of: a view with no anchor has to drop the pose along ' +
      'with the layer');
  }
  if (layer.parentNode !== root) {
    fail('clicking a tab from a sheet lifted the roll layer out to the body for a trip it should not be taking');
  }
  if (frames.size) {
    fail('clicking a tab from a sheet scheduled ' + frames.size + ' animation frame(s) of travel');
  }
  const landed = placed[placed.length - 1];
  if (placed.length === hidden) {
    fail('clicking a tab from a sheet never placed the roll on the new landing at all');
  } else if (!on(landed, PLATFORM) || landed.k !== 1) {
    fail('clicking a tab from a sheet placed the roll at ' + at(landed) + ' rather than on the Development plate ' +
      'at ' + at({ ...PLATFORM.box, k: 1 }) + ': it is flying in from the pose the previous landing left behind');
  }
  if (layer.style.opacity !== '0.8') {
    fail('the roll arrived on the new landing at opacity ' + layer.style.opacity + ' rather than fading up to its ' +
      'resting 0.8');
  }
  if (settled === 0) fail('the roll was never placed on the Research landing to begin with');
}

// ---------------------------------------------------------------- landing to landing still flies

{
  const { app, root, layer, placed, go } = stage();
  go('page', SCRIPT);
  go('page', PLATFORM);                     // both views show the roll: this one is a real trip

  if (!app.parchTween) {
    fail('Research landing to Development landing no longer travels. The roll is on screen on both, so it has to ' +
      'fly between them: that trip is the reason the roll exists');
  }
  if (layer.parentNode !== doc.body) {
    fail('a travelling roll was left inside the page root; it rides above the page-morph snapshot on the body');
  }
  runFrames(1000 + 900);                    // the far end of the 900ms tween
  const landed = placed[placed.length - 1];
  if (!on(landed, PLATFORM) || landed.k !== 1) {
    fail('the travel ended at ' + at(landed) + ' rather than on the Development plate at ' +
      at({ ...PLATFORM.box, k: 1 }));
  }
  if (layer.parentNode !== root) fail('the finished travel never put the roll layer back into the page root');
}

// ---------------------------------------------------------------- a travel in flight is dropped, not finished

{
  const { app, root, layer, placed, go } = stage();
  go('page', SCRIPT);
  go('page', PLATFORM);
  runFrames(1000 + 200);                    // a fifth of the way across
  if (!app.parchTween) {
    fail('the travel was already over 200ms in; the rest of this check cannot say anything');
  }
  const flying = placed.length;
  go('chapter', null);                      // the reader opens a sheet mid-flight

  if (app.parchTween) {
    fail('opening a sheet mid-travel left the tween running. The anchor it is heading for is off the page, and the ' +
      'tick that finishes it writes the layer opacity back over the fade-out');
  }
  if (frames.size) {
    fail('opening a sheet mid-travel left ' + frames.size + ' animation frame(s) queued for a trip with no destination');
  }
  if (layer.style.opacity !== '0') {
    fail('opening a sheet mid-travel left the roll at opacity ' + layer.style.opacity);
  }
  if (layer.parentNode !== root) {
    fail('opening a sheet mid-travel left the roll layer parked on the body above the page');
  }
  runFrames(1000 + 900);
  if (placed.length !== flying) {
    fail('a dropped travel kept placing the roll after the sheet had opened: ' + (placed.length - flying) +
      ' further placement(s)');
  }
}

// ---------------------------------------------------------------- report

if (failures.length) {
  console.error('check-roll-return: ' + failures.length + ' failure' + (failures.length === 1 ? '' : 's'));
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
console.log('check-roll-return: a view with no anchor drops the roll\'s pose and any travel in flight, and the ' +
  'trip between the two landings still flies');
