// Checks that the text effect pays for the wake it draws and for nothing else.
//
// The effect writes an inline style to every character it lights, so anything it reads back from the
// browser in the same breath is read against a dirty layout and pays for a whole document to be laid
// out again. Four habits cost the page far more than the arithmetic they serve, and none of them is
// visible in a frame: the wake looks the same either way, so only a check can hold them.
//
//   1. The crossing from viewport coordinates into page coordinates used to read window.scrollX, once
//      per coalesced pointer sample and once per instance per frame. The offset it wants changes only
//      when the page scrolls, and a scroll event is dispatched at a rendering opportunity with layout
//      already clean, so the offset is cached and the crossing reads nothing. What the count proves is
//      that the reads do not grow with pointer events or with frames; what the coordinate assertion
//      after it proves is that the cached offset is the live one, so a stamp still lands where the
//      cursor was on the page rather than where it was in the window.
//
//   2. Every character span used to ask for will-change: transform, which promotes it to a compositor
//      layer of its own. A chapter's panes run to hundreds of glyphs, so the compositor rebuilt
//      hundreds of layers every frame while nothing moved, and every colour write repainted and
//      rasterised its own layer. The transform animates as well without it, inside the layer its
//      parent already has.
//
//   3. The parchment roll behind the Research headline burns where the ink in front of it is lit, so
//      the page reads which glyphs are lit, how brightly, and where, once a frame. It used to read
//      that back off the elements, an attribute query and a rect per glyph. The effect holds all
//      three already, so litGlyphs hands them over: the boxes _measure took, and the glow
//      writeLitColor computed on its way to the shadow. Checked for the reads it does not make, for
//      the box and the glow it reports, and for clearing the glow when the wake has gone, since a
//      glow left behind is a sheet that keeps burning under a glyph that is no longer lit.
//
//   4. Ripple.compute used to take a square root and an exponential for every stamp in the buffer and
//      then throw away any whose amplitude at the character fell under the floor. Those are exactly
//      the stamps further off than the floor's distance, which a squared distance answers for nothing.
//      Both properties are checked: that the cheap rejection actually happens, and that it decides no
//      stamp differently from the floor it stands in front of. The second is the one that matters,
//      because the wake is the output of this function and it must come back bit for bit the same.
//
// Run with `npm run check`. Exits non-zero and prints every failure it found.

import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const SRC = 'src/text-rippling.js';

const failures = [];
const fail = (msg) => failures.push(msg);

// ---------------------------------------------------------------- a window the library can be read into

const dom = new JSDOM('<!doctype html><body></body>', { runScripts: 'outside-only' });
const { window } = dom;
const doc = window.document;

// The animation loop is driven by hand so a frame is a call rather than a wait.
let rafQueue = [], rafSeq = 1;
window.requestAnimationFrame = (fn) => { const id = rafSeq++; rafQueue.push([id, fn]); return id; };
window.cancelAnimationFrame = (id) => { rafQueue = rafQueue.filter(([i]) => i !== id); };
let clock = 1000;
const frame = () => { clock += 16; const due = rafQueue; rafQueue = []; for (const [, fn] of due) fn(clock); };

// jsdom has no PointerEvent, and the pointer path is the one the browser takes and the one that
// carries the coalesced samples, so give the library the constructor it tests for.
window.PointerEvent = window.MouseEvent;

// Every way the library can ask the window where the page is scrolled to, counted as one.
let sx = 0, sy = 0, offsetReads = 0;
for (const [name, get] of [['scrollX', () => sx], ['pageXOffset', () => sx],
                           ['scrollY', () => sy], ['pageYOffset', () => sy]]) {
  Object.defineProperty(window, name, { configurable: true, get() { offsetReads++; return get(); } });
}

window.eval(readFileSync(SRC, 'utf8'));

const TextRippling = window.TextRippling;
if (!TextRippling) {
  console.error('check-text-rippling-cost: ' + SRC + ' did not put TextRippling on the window');
  process.exit(1);
}

const mount = (text, opts) => {
  const el = doc.createElement('p');
  el.textContent = text;
  doc.body.appendChild(el);
  return new TextRippling(el, opts || {});
};

const pointerAt = (x, y, coalesced) => {
  const e = new window.MouseEvent('pointermove', { clientX: x, clientY: y });
  if (coalesced) e.getCoalescedEvents = () => coalesced.map(([cx, cy]) => ({ clientX: cx, clientY: cy, timeStamp: e.timeStamp }));
  window.dispatchEvent(e);
};

// ---------------------------------------------------------------- 1. the page offset is cached, not read

const inst = mount('crossing the coordinate boundary');
const stamps = TextRippling.cursor.state.stamps;

const afterMount = offsetReads;
let px = 200, py = 120;
for (let i = 0; i < 24; i++) {
  // alternate the two shapes the handler has to cope with: a plain move, and one carrying the
  // browser's sub-frame samples
  px += 11; py += 7;
  if (i % 2 === 0) pointerAt(px, py);
  else pointerAt(px, py, [[px - 6, py - 4], [px, py]]);
  frame();
}
const grew = offsetReads - afterMount;
if (grew > 0) {
  fail('the crossing into page space read the window\'s scroll offset ' + grew + ' times across 24 pointer ' +
    'events and 24 frames. Every one of those reads is taken after the effect has written its inline styles ' +
    'for the frame, so every one of them lays the whole document out again. The offset changes when the page ' +
    'scrolls and at no other time');
}

// The cache has to be the live offset, or a stamp lands where the cursor was in the window rather
// than where it was on the page, and the wake tears away from the text as the reader scrolls.
sx = 100; sy = 40;
window.dispatchEvent(new window.Event('scroll'));
const before = stamps.length;
pointerAt(10, 5);
if (stamps.length !== before + 1) {
  fail('a pointer move after a scroll dropped no stamp, so the coordinate assertion below has nothing to read');
} else {
  const s = stamps[stamps.length - 1];
  if (s.x !== 110 || s.y !== 45) {
    fail('after the page scrolled to 100, 40 a pointer at client 10, 5 stamped page ' + s.x + ', ' + s.y +
      ' instead of 110, 45: the cached offset did not follow the scroll');
  }
}

// ---------------------------------------------------------------- 2. a glyph is not a compositor layer

const promoted = Array.from(inst.element.querySelectorAll('span'))
  .filter((s) => /will-change/i.test(s.getAttribute('style') || ''));
if (promoted.length) {
  fail(promoted.length + ' of the ' + inst.element.querySelectorAll('span').length + ' spans under one text ' +
    'pane ask for will-change, so each is a compositor layer of its own. A chapter carries hundreds of them ' +
    'and the compositor rebuilds every one of them every frame while nothing moves. The transform animates ' +
    'inside the layer the pane already has');
}

// ---------------------------------------------------------------- 3. the lit ink is readable without the DOM

// The parchment roll behind the Research headline burns where the ink is lit, so the page has to know which
// glyphs are lit, how brightly and where. Reading that back off the elements is a query and a rect per glyph
// taken after the effect wrote the frame's styles, so it costs a whole document layout every breath; the effect
// already holds all three, and litGlyphs hands them over without touching the DOM.
{
  const lit = mount('lit ink');
  const chars = lit._chars;
  // jsdom measures everything at zero, so give the chars boxes and re-measure against them
  chars.forEach((c, i) => {
    const box = { x: 40 + i * 12, y: 300, width: 10, height: 20 };
    c.el.getBoundingClientRect = () => ({ ...box, left: box.x, top: box.y, right: box.x + box.width, bottom: box.y + box.height });
  });
  sx = 100; sy = 40;
  window.dispatchEvent(new window.Event('scroll'));
  lit.remeasure();

  // one char lit, the rest dark. Its brightness decays from here, so the frame below writes the shadow for it
  // and nothing for its neighbours
  chars[2].bright = 0.9;
  frame();

  let rects = 0;
  const patched = chars.map((c) => {
    const real = c.el.getBoundingClientRect;
    c.el.getBoundingClientRect = function () { rects++; return real.call(this); };
    return c;
  });
  const glyphsBefore = offsetReads;
  const reported = lit.litGlyphs(0.2);
  if (rects > 0 || offsetReads !== glyphsBefore) {
    fail('reading the lit glyphs took ' + rects + ' rects and ' + (offsetReads - glyphsBefore) + ' scroll reads. ' +
      'It is called once a frame from the breathing loop, right after the effect wrote its styles, so each of ' +
      'those lays the document out again. The effect measured these boxes already');
  }
  patched.forEach((c, i) => {
    const box = { x: 40 + i * 12, y: 300, width: 10, height: 20 };
    c.el.getBoundingClientRect = () => ({ ...box, left: box.x, top: box.y, right: box.x + box.width, bottom: box.y + box.height });
  });

  if (reported.length !== 1) {
    fail('one char of the pane is lit and litGlyphs reported ' + reported.length + ' of them. A dark glyph is not ' +
      'a heat source, and every one that is reported is stepped by the sim every frame');
  } else {
    const g = reported[0];
    if (g.x !== 64 || g.y !== 300 || g.w !== 10 || g.h !== 20) {
      fail('the lit glyph came back at ' + g.x + ', ' + g.y + ' by ' + g.w + ' by ' + g.h + ' rather than at its ' +
        'own box, 64, 300 by 10 by 20, in viewport pixels');
    }
    if (!(g.glow > 0.2)) fail('the lit glyph came back with glow ' + g.glow + ', which is not the brightness that lit it');
  }

  // the boxes are viewport pixels, so a scroll moves them even though the chars have not been measured again
  sy = 140;
  window.dispatchEvent(new window.Event('scroll'));
  const scrolled = lit.litGlyphs(0.2);
  if (scrolled.length === 1 && scrolled[0].y !== 200) {
    fail('after the page scrolled 100px further down the lit glyph came back at y ' + scrolled[0].y + ' rather ' +
      'than 200: the boxes are viewport pixels, which is the frame the roll is drawn in');
  }
  sy = 40;
  window.dispatchEvent(new window.Event('scroll'));

  // once the wake has decayed the effect clears the shadow, and the glow has to go with it or the roll keeps
  // burning under a glyph that is no longer lit
  for (let i = 0; i < 400 && chars[2].glow > 0; i++) frame();
  if (chars[2].glow !== 0) {
    fail('the wake decayed and the char\'s glow stayed at ' + chars[2].glow + '. Every branch that clears the ' +
      'shadow has to clear the glow beside it, or the two disagree about what is lit');
  }
  if (lit.litGlyphs(0.2).length !== 0) fail('a pane whose wake has fully decayed still reports lit ink');
  lit.destroy();
}

// ---------------------------------------------------------------- 4. the ripple rejects a far stamp cheaply

const Ripple = TextRippling.ripple;
const D = Ripple.DEFAULTS;

// The old loop, kept verbatim, so the two can be compared rather than reasoned about.
function computeBefore(charX, charY, time, stampList, speed, spatial, postHit, edge) {
  if (!stampList || stampList.length === 0) return null;

  let brightness = 0;
  let frontierAmp = 0;
  let interior = false;

  for (let i = 0; i < stampList.length; i++) {
    const s = stampList[i];
    const ddx = charX - s.x;
    const ddy = charY - s.y;
    const dd = Math.sqrt(ddx * ddx + ddy * ddy);

    const amplAtHit = Math.exp(-dd / spatial);
    if (amplAtHit < 0.02) continue;

    const timeFromHit = time - (s.t0 + dd / speed);

    if (timeFromHit >= 0) {
      const contrib = amplAtHit * Math.exp(-timeFromHit / postHit);
      if (contrib > brightness) brightness = contrib;
    }

    const edgeDist = Math.abs(timeFromHit) * speed;
    if (edgeDist < edge) {
      const es = (1 - edgeDist / edge) * amplAtHit;
      if (es > frontierAmp) frontierAmp = es;
    } else if (timeFromHit > 0) {
      interior = true;
    }
  }

  const scramble = interior ? 0 : frontierAmp;
  return { brightness, scramble, interior };
}

// The floor discards a stamp once exp(-dd / spatial) falls under 0.02, which is the distance below.
const floorDist = (spatial) => spatial * Math.log(50);

{
  // A hundred stamps, every one of them well past the floor's distance: the transcendentals are the
  // whole cost of the call and none of them buys anything.
  const far = [];
  for (let i = 0; i < 100; i++) far.push({ x: 9000 + i * 7, y: 9000 - i * 3, t0: 0 });
  const M = window.Math;
  const realExp = M.exp, realSqrt = M.sqrt;
  let exps = 0, sqrts = 0;
  M.exp = (v) => { exps++; return realExp(v); };
  M.sqrt = (v) => { sqrts++; return realSqrt(v); };
  try {
    Ripple.compute(0, 0, 500, far, D.speed, D.spatial, D.postHit, D.edge);
  } finally {
    M.exp = realExp; M.sqrt = realSqrt;
  }
  if (exps > 0 || sqrts > 0) {
    fail('a character with 100 stamps all beyond ' + Math.round(floorDist(D.spatial)) + 'px took ' + sqrts +
      ' square roots and ' + exps + ' exponentials to decide that none of them reaches it. A squared distance ' +
      'answers that, and the buffer holds a hundred stamps against every character of every lit pane');
  }
}

{
  // The rejection must decide no stamp differently from the floor it stands in front of, including
  // the stamps sitting on the boundary, where the two tests are closest to disagreeing.
  let rng = 20260907;
  const rand = () => { rng = (rng * 1103515245 + 12345) & 0x7fffffff; return rng / 0x7fffffff; };
  let mismatches = 0, worst = '';
  for (let trial = 0; trial < 4000; trial++) {
    const spatial = [D.spatial, 60, 400][trial % 3];
    const speed = [D.speed, 0.2, 1.4][trial % 3];
    const postHit = [D.postHit, 120, 900][trial % 3];
    const edge = [D.edge, 8, 40][trial % 3];
    const cut = floorDist(spatial);
    const list = [];
    for (let i = 0; i < 12; i++) {
      // half the stamps are placed straddling the cutoff to within a whisker of it, the rest anywhere
      const th = rand() * Math.PI * 2;
      const r = i % 2 === 0 ? cut * (1 + (rand() - 0.5) * 1e-6) : rand() * cut * 2.2;
      list.push({ x: Math.cos(th) * r, y: Math.sin(th) * r, t0: rand() * 2000 });
    }
    const time = rand() * 3000;
    const a = Ripple.compute(0, 0, time, list, speed, spatial, postHit, edge);
    const b = computeBefore(0, 0, time, list, speed, spatial, postHit, edge);
    if (a.brightness !== b.brightness || a.scramble !== b.scramble || a.interior !== b.interior) {
      mismatches++;
      if (!worst) worst = 'brightness ' + a.brightness + ' vs ' + b.brightness + ', scramble ' + a.scramble +
        ' vs ' + b.scramble + ', interior ' + a.interior + ' vs ' + b.interior;
    }
  }
  if (mismatches) {
    fail('the ripple came back different for ' + mismatches + ' of 4000 stamp fields once the cheap rejection ' +
      'was in front of the amplitude floor (' + worst + '). The wake is this function\'s output; it has to ' +
      'return the same bits it did');
  }
}

// ---------------------------------------------------------------- report

inst.destroy();

if (failures.length) {
  console.error('check-text-rippling-cost: ' + failures.length + ' failure' + (failures.length === 1 ? '' : 's'));
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
console.log('check-text-rippling-cost: the page offset is cached across pointer events and frames and follows a ' +
  'scroll, no glyph asks for a compositor layer, the lit ink reads back without a rect, and the ripple rejects a ' +
  'far stamp without a square root and returns the same wake it did');
