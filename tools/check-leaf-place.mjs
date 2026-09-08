// Checks that a margin caption is placed from where its leaf lands, not from where a slide has it at the instant
// of a render.
//
// placeLeafText pulls a caption back inside the hero when its box would leave it, and it measures that box with
// getBoundingClientRect. It runs from componentDidUpdate, which is to say on every render, and a render can land
// anywhere.
//
// A register change slides every leaf in from off-page over 760ms with a stagger. getBoundingClientRect reports
// the animated box, so a render during the slide measures a leaf in mid-flight and writes a correction for where
// the leaf is rather than for where it will be. Nothing re-runs the pass when the slide ends, so the wrong
// correction stands until some later render happens to fall after the slide: a scroll, a typing tick, the next
// glitch beat up to 3.4s away. That is why the fault is intermittent and why the captions read as cut off by the
// page edge on one arrival and correct on the next.
//
// So the pass waits while a leaf slide is running and runs once when the slide finishes. Every other arrival is
// unchanged: a fresh load, a same-register arrival and a resize have no slide in flight and are measured on the
// spot, and a running animation that is not a leaf slide (the drifting CSS transforms the leaves carry) does not
// hold the pass either, or nothing would ever be placed at all.
//
// The method is read out of the logic class and run for real against a stub `this`, so this check cannot drift
// from a copy of it. The stubbed caption box moves with the slide, the way the real one does, so a measurement
// taken mid-flight is visibly the wrong one.
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
  console.error('check-leaf-place: no <x-dc> block in ' + SRC);
  process.exit(1);
}
const logicSrc = src.slice(closeAt);
const placeBody = readMethod(logicSrc, 'placeLeafText');
if (placeBody === null) {
  console.error('check-leaf-place: the logic class has no placeLeafText method, so nothing places the captions');
  process.exit(1);
}

// The factor between the two pixel spaces a scaled collage has, read out of the class beside the method that
// uses it: the pull is measured between two rects, which are in the viewport's pixels, and written into a
// transform inside the collage, which is read in the collage's own (see landingScale). Undivided, a hero read
// at two thirds would be given two thirds of the pull it asked for and the caption would still hang off the
// page edge, which is the fault this pass exists to fix.
const zoomBody = /\n {2}zoomOf\(el\) \{ return ([^\n]+?); \}/.exec(logicSrc);
if (!zoomBody) {
  fail('the logic class has no one line zoomOf(el), so this check cannot run placeLeafText against a scaled hero');
}

// the slide the guard has to recognise is written in morphTexts, and it is only findable there by the id the
// animation is given. A rename on one side and not the other would leave the guard matching nothing and the
// captions placed mid-flight again, with every check still green.
const morphBody = readMethod(logicSrc, 'morphTexts');
if (morphBody === null || !/data-leaf/.test(morphBody)) {
  fail('morphTexts no longer slides the leaves, or no longer exists; the rest of this check is measuring a ' +
    'transition that is not there');
} else if (!/leaf-slide/.test(morphBody)) {
  fail('the leaf slide animations in morphTexts carry no leaf-slide id, so placeLeafText cannot tell a slide in ' +
    'flight from any other running animation and will measure the captions mid-slide');
}

// ---------------------------------------------------------------- a browser enough for the method to run in

const dom = new JSDOM('<!doctype html><body></body>');
const doc = dom.window.document;
globalThis.window = dom.window;
globalThis.document = doc;
dom.window.innerWidth = 1440;
dom.window.innerHeight = 900;

const HERO = { left: 0, right: 1440, top: 0, bottom: 900 };
const PAD = 14;
// where the caption sits once the leaf has landed: 30px past the hero's left edge, so the pass owes it a pull of
// 0 + 14 - (-30) = 44px back inside
const LANDED = { left: -30, width: 200 };
// where the slide has it partway through: still travelling in from off-page to the left
const MIDSLIDE = -400;

function stage(zoom) {
  const hero = doc.createElement('section');
  if (zoom) hero.currentCSSZoom = zoom;
  const leaf = doc.createElement('div');
  leaf.setAttribute('data-leaf', 'left');
  const text = doc.createElement('div');
  text.setAttribute('data-leaf-text', '');
  leaf.appendChild(text);
  hero.appendChild(leaf);
  doc.body.appendChild(hero);

  const state = { slide: 0, list: [] };
  const rect = (o) => ({ ...o, x: o.left, y: o.top, width: o.right - o.left, height: o.bottom - o.top });
  hero.getBoundingClientRect = () => rect(HERO);
  // the caption's box moves with the slide, which is the whole point: a measurement taken while the slide runs is
  // a measurement of a place the caption is only passing through
  text.getBoundingClientRect = () => {
    const left = LANDED.left + state.slide;
    return rect({ left, right: left + LANDED.width, top: 300, bottom: 340 });
  };
  hero.getAnimations = () => state.list;
  text.style.transform = 'none';

  const app = { heroRef: { current: hero } };
  // eslint-disable-next-line no-new-func
  app.zoomOf = zoomBody ? new Function('el', 'return ' + zoomBody[1] + ';') : () => 1;
  const place = new Function(placeBody);
  app.placeLeafText = () => place.call(app);
  return { app, hero, text, state };
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

// ---------------------------------------------------------------- a scaled hero: the pull is in the collage's pixels

{
  const { app, text } = stage(0.667);
  app.placeLeafText();
  // 44px of page is 66px of a collage read at two thirds, and the transform is written inside the collage
  if (text.style.transform !== 'translateX(66px)') {
    fail('on a collage read at 0.667 the caption was pulled back by ' + JSON.stringify(text.style.transform) +
      ' rather than translateX(66px). The distance is measured on the page and written inside the drawing, so a ' +
      'pull that is not divided by the factor the drawing is read at lands short and the caption is still cut off');
  }
}

// ---------------------------------------------------------------- no slide in flight: measured on the spot

{
  const { app, text } = stage();
  app.placeLeafText();
  if (text.style.transform !== 'translateX(44px)') {
    fail('with no slide running the caption was left at transform ' + JSON.stringify(text.style.transform) +
      ' rather than translateX(44px). A fresh load, a same-register arrival and a resize all take this path, and ' +
      'a caption that is not pulled back inside the hero is cut off by the page edge');
  }
}

// ---------------------------------------------------------------- a leaf slide in flight is waited out

{
  const { app, text, state } = stage();
  let land;
  const finished = new Promise((resolve) => { land = resolve; });
  state.slide = MIDSLIDE;
  state.list = [{ id: 'leaf-slide', playState: 'running', finished }];

  app.placeLeafText();
  const written = text.style.transform;
  if (written !== 'none') {
    fail('a render during the leaf slide wrote transform ' + JSON.stringify(written) + '. The leaf was still ' +
      '400px out from where it lands, so that correction is for a place the caption is only passing through, and ' +
      'nothing re-runs the pass when the slide ends: it stands until some later render happens to fall after it');
  }

  // the slide ends and the leaves are where they belong
  state.slide = 0;
  state.list = [];
  land();
  await tick();
  await tick();

  if (text.style.transform !== 'translateX(44px)') {
    fail('the caption was left at transform ' + JSON.stringify(text.style.transform) + ' after the slide finished ' +
      'rather than translateX(44px). Deferring the pass is only half of it: something has to run it once the ' +
      'slide has landed the leaves');
  }
  if (app.leafPlaceWait) {
    fail('the pass is still marked as waiting after the slide finished, so every later render is deferred against ' +
      'a slide that is over');
  }
}

// ---------------------------------------------------------------- some other running animation does not hold it

{
  const { app, text, state } = stage();
  state.list = [{ id: '', playState: 'running', finished: Promise.resolve() }];
  app.placeLeafText();
  if (text.style.transform !== 'translateX(44px)') {
    fail('a running animation that is not a leaf slide held the placement back (the caption was left at ' +
      JSON.stringify(text.style.transform) + '). The leaves carry drifting transforms of their own that never ' +
      'finish, so a guard that waits on any running animation never places anything');
  }
}

// ---------------------------------------------------------------- a cancelled slide does not strand the pass

{
  const { app, text, state } = stage();
  state.slide = MIDSLIDE;
  // an element removed mid-slide cancels its animation, and a cancelled animation rejects its finished promise
  const finished = Promise.reject(new Error('cancelled'));
  finished.catch(() => {});   // so a tree that never attaches its own handler fails this check rather than the process
  state.list = [{ id: 'leaf-slide', playState: 'running', finished }];
  app.placeLeafText();
  state.slide = 0;
  state.list = [];
  await tick();
  await tick();
  if (text.style.transform !== 'translateX(44px)') {
    fail('a slide that was cancelled rather than finished left the caption at transform ' +
      JSON.stringify(text.style.transform) + '. The rejection has to be caught, or a leaf removed mid-slide ' +
      'strands the placement for good');
  }
}

// ---------------------------------------------------------------- report

if (failures.length) {
  console.error('check-leaf-place: ' + failures.length + ' failure' + (failures.length === 1 ? '' : 's'));
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
console.log('check-leaf-place: the captions are placed on the spot when nothing is sliding, and once the slide ' +
  'has landed the leaves when one is');
