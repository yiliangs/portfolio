// Checks that leaving the home view hides the home cube's layer, and that the one path that carries the cube off
// the home page is not hidden with it.
//
// The cube is drawn into a fixed, full-viewport canvas layer at z-index 2, above the page. Leaving home used to
// ask only the model to fade: `this.home.setOpacity(0)`. That fade is a number the render loop walks toward once
// per frame, so its length is a frame count and not a time. At sixty frames a second it is about eight tenths of
// a second, and on a slow frame budget it is however long the frames take. For all of it the layer itself is at
// CSS opacity 1 across the whole viewport, so the tesseract with its word is drawn over a register landing that
// has nothing to do with it. The layer is only taken down by homeKillTimer, 2200ms later.
//
// So the exit hides the layer, on a wall-clock transition, the moment the view stops being home. The model fade
// still runs underneath, and the kill timer still does the teardown.
//
// The counterweight is the handoff. Clicking the cube on the home page takes the same non-home path, and there
// the cube has to stay visible: it travels into the Development platform's box and presses flat into the plate.
// A fix that hides the layer on every non-home render would delete that trip, which is the reason the cube is
// modelled at all. So the cubeLead branch has to leave the layer visible, and has to say so rather than relying
// on the opacity a previous exit happened to leave behind.
//
// The methods are read out of the logic class and run for real against a stub `this`, so this check cannot drift
// from a copy of them. Only the synchronous writes are read; the timers are not fired.
//
// Run with `npm run check`. Exits non-zero and prints every failure it found.

import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const SRC = 'design/Portfolio.dc.html';

const failures = [];
const fail = (msg) => failures.push(msg);

// every member of the logic class sits at two-space indent, so `\n  }` closes the method
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
  console.error('check-home-exit: no <x-dc> block in ' + SRC);
  process.exit(1);
}
const logicSrc = src.slice(closeAt);
const syncBody = readMethod(logicSrc, 'syncHome');
if (syncBody === null) {
  console.error('check-home-exit: the logic class has no syncHome method, so nothing places the home cube');
  process.exit(1);
}

// ---------------------------------------------------------------- a browser enough for the method to run in

const dom = new JSDOM('<!doctype html><body></body>');
const doc = dom.window.document;
globalThis.window = dom.window;
globalThis.document = doc;
dom.window.innerWidth = 1440;
dom.window.innerHeight = 900;

// the timers are the teardown and the landing beat, not the writes under test: record them and let nothing fire,
// so the check reads only what the call itself did and the process does not sit waiting on a 2200ms timeout
const timers = [];
globalThis.setTimeout = (fn, ms) => { timers.push({ fn, ms }); return timers.length; };
globalThis.clearTimeout = () => {};
let nextFrame = 1;
const frames = new Map();
globalThis.requestAnimationFrame = (fn) => { const id = nextFrame++; frames.set(id, fn); return id; };
globalThis.cancelAnimationFrame = (id) => { frames.delete(id); };

const anchor = (x, y, w, h) => {
  const el = doc.createElement('div');
  el.getBoundingClientRect = () => ({ x, y, width: w, height: h, left: x, top: y, right: x + w, bottom: y + h });
  el.box = { x, y, w, h };
  return el;
};

const CUBE = anchor(940, 200, 360, 360);      // the cube's cell on the home page
const PLATFORM = anchor(880, 158, 508, 440);  // the plate it presses into on the Development landing

function stage() {
  const root = doc.createElement('div');
  const layer = doc.createElement('div');
  const parchLayer = doc.createElement('div');
  root.appendChild(layer);
  root.appendChild(parchLayer);
  doc.body.appendChild(root);
  timers.length = 0;
  frames.clear();
  const calls = [];
  const app = {
    state: { view: 'home' },
    rootRef: { current: root },
    homeLayerRef: { current: layer },
    homeCubeRef: { current: null },
    platformRef: { current: null },
    parchLayerRef: { current: parchLayer },
    CUBE_COLLAPSE_MS: 1500,
    syncFog() {},
    home: {
      setOpacity(a) { calls.push(['setOpacity', a]); },
      busy() { return false; },
      reset() { calls.push(['reset']); },
      setAnchor() { calls.push(['setAnchor']); },
      setInk() { calls.push(['setInk']); },
      setPlatformFrame() { calls.push(['setPlatformFrame']); },
      collapse() { calls.push(['collapse']); },
      expand() { calls.push(['expand']); },
    },
  };
  const sync = new Function(syncBody);
  app.syncHome = () => sync.call(app);
  return { app, root, layer, calls };
}

const lastOpacityCall = (calls) => {
  const c = [...calls].reverse().find((x) => x[0] === 'setOpacity');
  return c ? c[1] : null;
};

// ---------------------------------------------------------------- leaving home hides the layer

{
  const { app, layer, calls } = stage();
  app.homeCubeRef.current = CUBE;
  app.syncHome();                              // on the home page, with the cube drawn
  const opened = layer.style.opacity;
  app.state.view = 'page';                     // the reader clicks a register tab
  app.homeCubeRef.current = null;
  app.syncHome();

  if (opened !== '1') {
    fail('the home view left the cube layer at opacity ' + JSON.stringify(opened) + ' rather than 1, so the rest ' +
      'of this check cannot say the exit did anything');
  }
  if (layer.style.opacity !== '0') {
    fail('leaving home left the cube layer at CSS opacity ' + JSON.stringify(layer.style.opacity) + '. The layer ' +
      'covers the whole viewport at z-index 2, so until it is hidden the cube is drawn over the landing the ' +
      'reader asked for. Fading only the model does not do it: that fade is a per-frame lerp, so its length is a ' +
      'frame count rather than a time');
  }
  if (!/opacity/.test(layer.style.transition || '')) {
    fail('leaving home hid the cube layer with no opacity transition on it (transition is ' +
      JSON.stringify(layer.style.transition) + '), so the cube is cut off the page rather than faded off it');
  }
  if (lastOpacityCall(calls) !== 0) {
    fail('leaving home last asked the model for opacity ' + lastOpacityCall(calls) + ' rather than 0. The layer ' +
      'has to come back for the return home, and it comes back to whatever the model was left drawing');
  }
}

// ---------------------------------------------------------------- the cube-click handoff still travels

{
  const { app, layer, calls } = stage();
  app.homeCubeRef.current = CUBE;
  app.syncHome();
  app.state.view = 'page';                     // a first exit, which leaves the layer hidden
  app.homeCubeRef.current = null;
  app.syncHome();
  const hidden = layer.style.opacity;
  // the reader goes home again and this time clicks the cube itself: the trip into the platform
  app.state.view = 'home';
  app.homeCubeRef.current = CUBE;
  app.syncHome();
  app.state.view = 'page';
  app.homeCubeRef.current = null;
  app.platformRef.current = PLATFORM;
  app.cubeLead = true;
  const before = calls.length;
  app.syncHome();
  const after = calls.slice(before);

  if (hidden !== '0') {
    fail('the first exit did not hide the layer, so this check cannot say whether the handoff recovers from it');
  }
  if (layer.style.opacity === '0') {
    fail('the cube-click handoff ran with the layer still hidden at opacity 0 from the earlier exit. The cube has ' +
      'to be seen travelling into the platform and pressing flat into the plate, so this branch has to say the ' +
      'layer is visible rather than inherit whatever the last exit left');
  }
  if (layer.parentNode !== doc.body) {
    fail('the cube-click handoff left the layer inside the page root; it rides above the page-morph snapshot on ' +
      'the body for the trip');
  }
  if (layer.style.zIndex !== '4') {
    fail('the travelling cube layer is at z-index ' + JSON.stringify(layer.style.zIndex) + ' rather than 4, so the ' +
      'page-morph snapshot is drawn over the trip');
  }
  if (!after.some((c) => c[0] === 'collapse')) {
    fail('the cube-click handoff never asked the model to collapse, so the cube never travels into the platform');
  }
  if (lastOpacityCall(after) !== 1) {
    fail('the cube-click handoff last asked the model for opacity ' + lastOpacityCall(after) + ' rather than 1');
  }
}

// ---------------------------------------------------------------- the home view still shows the cube

{
  const { app, root, layer, calls } = stage();
  app.state.view = 'page';
  app.syncHome();                              // leave first, so the return has a hidden layer to undo
  app.state.view = 'home';
  app.homeCubeRef.current = CUBE;
  const before = calls.length;
  app.syncHome();
  const after = calls.slice(before);

  if (layer.style.opacity !== '1') {
    fail('returning home left the cube layer at opacity ' + JSON.stringify(layer.style.opacity) + ' rather than 1, ' +
      'so the home page has an invisible cube in its cell');
  }
  if (layer.style.zIndex !== '2') {
    fail('returning home left the cube layer at z-index ' + JSON.stringify(layer.style.zIndex) + ' rather than 2');
  }
  if (layer.parentNode !== root) {
    fail('returning home left the cube layer parked on the body rather than back in the page root');
  }
  if (lastOpacityCall(after) !== 1) {
    fail('returning home last asked the model for opacity ' + lastOpacityCall(after) + ' rather than 1');
  }
}

// ---------------------------------------------------------------- report

if (failures.length) {
  console.error('check-home-exit: ' + failures.length + ' failure' + (failures.length === 1 ? '' : 's'));
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
console.log('check-home-exit: leaving home hides the cube layer on a timed fade, the cube-click handoff still ' +
  'travels above the page, and returning home brings the layer back');
