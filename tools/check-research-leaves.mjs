// Checks the Research margins against the register they are supposed to carry.
//
// The Research landing is one screen: a centred title column with a gutter either side, each gutter
// a two-column grid of leaves, one leaf per chapter of the serif register. The governing invariant
// is that every chapter of a register stands on that register's landing page. It was broken once by
// a hand-cut table of exactly six slots and a `.slice(0, 6)` in front of it, which dropped the
// seventh and eighth chapters with no warning anywhere; this file exists so that cannot recur.
//
// The geometry lives in LEAF_SPREADS, LEAF_PAIRS, leafCapacity, leafRows and leafSlots on the logic
// class, which is copied through the build verbatim. That makes it runnable, so most of this check
// executes it rather than reading it: it walks every register size from one chapter to forty and
// asserts that each leaf gets a slot of its own, that no two leaves are laid in the same grid cell,
// and that the rows only ever grow. The rest guards the two ends the layout is reached through, the
// markup that binds the row count and the call site that hands the stage to the gutters.
//
// One case is frozen deliberately. At three rows the generated slots must still be the composition
// the page was tuned at, plate for plate, because that is what makes the adaptive rule safe to
// apply to a register that has not grown: the six leaves the page already had must not move.
//
// Run with `npm run check`. Exits non-zero and prints every failure it found.

import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const SRC = 'design/Portfolio.dc.html';
const MIN_ROWS = 3;      // the composition the page was tuned at, and the floor
const MIN_STAGE = 6;     // a thinner register is topped up with forthcoming placeholders
const MAX_REGISTER = 40; // far past anything plausible; the invariant has to hold there too

const failures = [];
const fail = (msg) => failures.push(msg);

// the working tree is CRLF on Windows and LF elsewhere; every marker below is written with LF
const src = readFileSync(SRC, 'utf8').replace(/\r\n/g, '\n');
const openMatch = /<x-dc(?:\s[^>]*)?>/.exec(src);
const closeAt = src.lastIndexOf('</x-dc>');
if (!openMatch || closeAt < 0) {
  console.error('check-research-leaves: no <x-dc> block in ' + SRC);
  process.exit(1);
}
const templateSrc = src.slice(openMatch.index + openMatch[0].length, closeAt);
const logicSrc = src.slice(closeAt);

// ---------------------------------------------------------------- lift the geometry out and run it

// The five members are consecutive in the class, from the first field to the close of leafSlots.
// Slicing them out and evaluating them is what makes this an executable check rather than a reading
// of the source; if any of them is renamed or moved, the slice fails here rather than in the browser.
function loadGeometry() {
  const from = logicSrc.indexOf('\n  LEAF_SPREADS = {');
  if (from < 0) { fail('the logic class has no LEAF_SPREADS field, so the margins are placed by something this check cannot run'); return null; }
  const tail = logicSrc.indexOf('\n  leafSlots(side, rows) {', from);
  if (tail < 0) { fail('the logic class has no leafSlots(side, rows) method'); return null; }
  const to = logicSrc.indexOf('\n  }\n', tail);
  if (to < 0) { fail('leafSlots is not closed with "  }" so it cannot be read'); return null; }
  const body = logicSrc.slice(from, to + 4);
  for (const name of ['LEAF_PAIRS', 'leafCapacity(side, rows)', 'leafRows(count)']) {
    if (!body.includes(name)) fail('the margin geometry is missing ' + name + ', or it no longer sits with the others');
  }
  try {
    // eslint-disable-next-line no-new-func
    return new Function('return new (class {' + body + '})()')();
  } catch (e) {
    fail('the margin geometry does not evaluate on its own: ' + e.message);
    return null;
  }
}

const geo = loadGeometry();

// ---------------------------------------------------------------- the composition, frozen at three rows

// Read left to right, top to bottom, in the order the gutters hand slots out. Every field a leaf
// takes its place from is here; a change to any of them moves a plate the page was composed around.
// offset carries the whole leaf and bleed carries the plate alone, so the two are frozen separately:
// the composition's only plate bleeds are the two anchors and the small right pair, and its only
// whole-leaf move is the 52px the left pair sits down by.
const TUNED = {
  left: [
      { row: '1', col: '1 / 3', selfY: 'start', selfX: 'start', imgH: 'min(55vh, 825px)', ratio: '4/3', maxW: '700px', titleSize: '26px', dir: 'row', alignItems: 'flex-end', align: 'left', px: '-18px', py: '-10px', dur: '7.5s', delay: '0s', offsetX: '-66.667px', offsetY: '-3.334px', bleedX: '0px', bleedY: '0px', beside: false },
      { row: '2', col: '1', selfY: 'center', selfX: 'start', imgH: 'min(35vh, 550px)', ratio: '1/1', maxW: '350px', titleSize: '17px', dir: 'column', alignItems: 'flex-start', align: 'left', px: '-14px', py: '-8px', dur: '8s', delay: '-5s', offsetX: '336.667px', offsetY: '112px', bleedX: '0px', bleedY: '0px', beside: false },
      { row: '3', col: '2', selfY: 'end', selfX: 'end', imgH: 'min(13.114vh, 218.566px)', ratio: '5/4', maxW: '163.925px', titleSize: '15px', dir: 'column', alignItems: 'flex-start', align: 'left', px: '-20px', py: '-9px', dur: '8.5s', delay: '-2s', offsetX: '-204.667px', offsetY: '27px', bleedX: '0px', bleedY: '0px', beside: true },
      { row: '2', col: '2', selfY: 'center', selfX: 'end', imgH: 'min(15.077vh, 239.688px)', ratio: '4/5', maxW: '148.452px', titleSize: '15px', dir: 'column', alignItems: 'flex-end', align: 'left', px: '-17px', py: '-12px', dur: '7.8s', delay: '-6s', offsetX: '-478px', offsetY: '149.333px', bleedX: '0px', bleedY: '0px', beside: false },
  ],
  right: [
      { row: '2', col: '1 / 3', selfY: 'center', selfX: 'end', imgH: 'min(54.977vh, 824.659px)', ratio: '3/4', maxW: '641.402px', titleSize: '26px', dir: 'row-reverse', alignItems: 'flex-end', align: 'right', px: '-26px', py: '-14px', dur: '9s', delay: '-3s', offsetX: '11.333px', offsetY: '23.334px', bleedX: '0px', bleedY: '0px', beside: false },
      { row: '1', col: '1 / 3', selfY: 'start', selfX: 'end', imgH: 'min(22.823vh, 329.662px)', ratio: '3/2', maxW: '342.341px', titleSize: '17px', dir: 'row-reverse', alignItems: 'flex-start', align: 'right', px: '-22px', py: '-12px', dur: '10s', delay: '-1.5s', offsetX: '-512.667px', offsetY: '-36.667px', bleedX: '0px', bleedY: '0px', stackH: 'min(16.483vh, 152.152px)', beside: false },
      { row: '3', col: '2', selfY: 'end', selfX: 'end', imgH: 'min(25.554vh, 408.869px)', ratio: '2/3', maxW: '170.362px', titleSize: '15px', dir: 'column', alignItems: 'flex-end', align: 'right', px: '-16px', py: '-11px', dur: '9.5s', delay: '-4s', offsetX: '-62.667px', offsetY: '-36.667px', bleedX: '0px', bleedY: '0px', beside: false },
      { row: '3', col: '1', selfY: 'end', selfX: 'start', imgH: 'min(27.449vh, 457.476px)', ratio: '1/1', maxW: '274.485px', titleSize: '15px', dir: 'column', alignItems: 'flex-start', align: 'right', px: '-19px', py: '-10px', dur: '8.2s', delay: '-2.5s', offsetX: '-162.667px', offsetY: '62px', bleedX: '0px', bleedY: '0px', beside: true },
  ],
};

if (geo) {
  for (const side of ['left', 'right']) {
    let slots;
    try {
      slots = geo.leafSlots(side, MIN_ROWS);
    } catch (e) {
      fail('leafSlots("' + side + '", ' + MIN_ROWS + ') threw: ' + e.message);
      continue;
    }
    if (slots.length < TUNED[side].length) {
      fail('the ' + side + ' gutter hands out only ' + slots.length + ' slots at ' + MIN_ROWS + ' rows, fewer than the ' + TUNED[side].length + ' the page was composed with');
      continue;
    }
    TUNED[side].forEach((want, i) => {
      const got = slots[i];
      for (const [k, v] of Object.entries(want)) {
        if (got[k] !== v) {
          fail('the tuned composition moved: ' + side + ' slot ' + i + ' has ' + k + ' ' + JSON.stringify(got[k]) + ', the page was set with ' + JSON.stringify(v));
        }
      }
      if (got.side !== side) fail(side + ' slot ' + i + ' reports side ' + JSON.stringify(got.side));
      if (want.stackH === undefined && got.stackH !== undefined) {
        fail(side + ' slot ' + i + ' grew a stackH the page was not composed with: ' + JSON.stringify(got.stackH));
      }
    });
  }
}

// ---------------------------------------------------------------- every chapter gets a cell of its own

// The stage is the register topped up to the minimum, and leaves alternate gutters, which is the one
// piece of the fill that lives at the call site rather than in the geometry. It is restated here
// because it is what decides how many slots each gutter is asked for; the call site is checked below.
if (geo) {
  const seenRows = [];
  for (let register = 1; register <= MAX_REGISTER; register++) {
    const stage = Math.max(register, MIN_STAGE);
    let rows;
    try {
      rows = geo.leafRows(stage);
    } catch (e) {
      fail('leafRows(' + stage + ') threw: ' + e.message);
      break;
    }
    if (!Number.isInteger(rows) || rows < MIN_ROWS) {
      fail('a register of ' + register + ' asks for ' + rows + ' rows, which is not a whole number at or above ' + MIN_ROWS);
      continue;
    }
    seenRows.push(rows);

    const gutters = { left: geo.leafSlots('left', rows), right: geo.leafSlots('right', rows) };
    const cells = new Map();
    for (let k = 0; k < stage; k++) {
      const side = k % 2 === 0 ? 'left' : 'right';
      const slot = gutters[side][Math.floor(k / 2)];
      if (!slot) {
        fail('a register of ' + register + ' (stage ' + stage + ', ' + rows + ' rows) leaves chapter ' + (k + 1) + ' without a slot in the ' + side + ' gutter: it holds ' + gutters[side].length + ' of the ' + (Math.floor(k / 2) + 1) + ' asked of it');
        continue;
      }
      const cell = side + ' r' + slot.row + ' c' + slot.col;
      if (cells.has(cell)) {
        fail('a register of ' + register + ' lays chapter ' + (k + 1) + ' over chapter ' + cells.get(cell) + ' in the same cell (' + cell + ')');
      }
      cells.set(cell, k + 1);
      const rowNo = Number(slot.row);
      if (!Number.isInteger(rowNo) || rowNo < 1 || rowNo > rows) {
        fail('a register of ' + register + ' places chapter ' + (k + 1) + ' on row ' + slot.row + ' of a ' + rows + '-row gutter');
      }
      if (slot.col !== '1 / 3' && slot.col !== '1' && slot.col !== '2') {
        fail('a register of ' + register + ' places chapter ' + (k + 1) + ' in column ' + JSON.stringify(slot.col) + ', which is neither a spread nor one of the two columns');
      }
      for (const k2 of ['imgH', 'ratio', 'maxW', 'titleSize', 'dir', 'alignItems', 'align', 'px', 'py', 'dur', 'delay', 'bleedX', 'bleedY', 'cover', 'selfX', 'selfY']) {
        if (slot[k2] === undefined || slot[k2] === null || slot[k2] === '') {
          fail('a register of ' + register + ' hands chapter ' + (k + 1) + ' a slot with no ' + k2);
        }
      }
      if (/NaN|undefined/.test(slot.imgH + ' ' + slot.delay + ' ' + (slot.stackH || ''))) {
        fail('a register of ' + register + ' hands chapter ' + (k + 1) + ' an unusable size or delay: imgH ' + slot.imgH + ', delay ' + slot.delay + ', stackH ' + slot.stackH);
      }
    }
  }
  for (let i = 1; i < seenRows.length; i++) {
    if (seenRows[i] < seenRows[i - 1]) {
      fail('the gutters shrink as the register grows: ' + (i) + ' chapters take ' + seenRows[i - 1] + ' rows and ' + (i + 1) + ' take ' + seenRows[i]);
    }
  }
  // the whole point of the rule: a register that has not grown past the tuned six keeps three rows
  if (geo.leafRows(MIN_STAGE) !== MIN_ROWS) {
    fail('a register of ' + MIN_STAGE + ' no longer sits on ' + MIN_ROWS + ' rows, so the tuned composition is being rescaled for nothing');
  }
}

// ---------------------------------------------------------------- the markup binds the row count

const dom = new JSDOM('<!doctype html><body></body>');
const tpl = dom.window.document.createElement('template');
tpl.innerHTML = templateSrc;

const gutterGrids = [...tpl.content.querySelectorAll('*')].filter((el) => {
  const s = (el.getAttribute('style') || '').replace(/\s+/g, '');
  return s.includes('grid-template-columns:repeat(2,minmax(0,1fr))') && el.querySelector('sc-for[as="lf"]');
});

if (gutterGrids.length !== 2) {
  fail('expected two leaf gutters in the Research hero, found ' + gutterGrids.length);
}
for (const grid of gutterGrids) {
  const s = (grid.getAttribute('style') || '').replace(/\s+/g, '');
  const m = /grid-template-rows:repeat\(([^,]+),/.exec(s);
  if (!m) fail('a leaf gutter declares no grid-template-rows');
  else if (m[1] !== '{{leafRows}}') {
    fail('a leaf gutter fixes its row count instead of taking it from the register: grid-template-rows:repeat(' + m[1] + ', ...), expected {{ leafRows }}');
  }
}

const lists = [...tpl.content.querySelectorAll('sc-for[as="lf"]')].map((el) => (el.getAttribute('list') || '').replace(/\s+/g, ''));
for (const want of ['{{leftLeaves}}', '{{rightLeaves}}']) {
  if (!lists.includes(want)) fail('the Research hero no longer iterates ' + want);
}

// ---------------------------------------------------------------- the call site hands over the whole register

const vals = logicSrc.slice(logicSrc.indexOf('\n  renderVals()'));
const callSite = vals.slice(vals.indexOf('const own = projects.filter'), vals.indexOf('const pageProjects'));
if (!callSite) {
  fail('renderVals no longer builds the leaves where this check can read it');
} else {
  if (/\.slice\(\s*0\s*,\s*\d+\s*\)/.test(callSite)) {
    fail('the leaf list is cut to a fixed length again: ' + /\.slice\(\s*0\s*,\s*\d+\s*\)/.exec(callSite)[0] + '. Every chapter of a register stands on its landing page');
  }
  if (!/this\.leafRows\(/.test(callSite)) fail('renderVals does not ask leafRows how many rows the register needs');
  if (!/this\.leafSlots\(\s*'left'/.test(callSite) || !/this\.leafSlots\(\s*'right'/.test(callSite)) {
    fail('renderVals does not build both gutters from leafSlots');
  }
  // leafRows has to reach the view model too, or the gutter grids bind nothing
  if (!/\bleafRows,/.test(vals)) fail('renderVals never puts leafRows on the view model, so the gutter grids bind nothing');
  if (!/leaves\.filter\(\(l\) => l\.side === 'left'\)/.test(vals) || !/leaves\.filter\(\(l\) => l\.side === 'right'\)/.test(vals)) {
    fail('renderVals no longer splits the leaves into the two gutters by side');
  }
}

// ---------------------------------------------------------------- report

if (failures.length) {
  console.error('check-research-leaves: ' + failures.length + ' failure' + (failures.length === 1 ? '' : 's'));
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
console.log('check-research-leaves: the composition is unmoved at ' + geo.leafRows(MIN_STAGE) +
  ' rows, and every register up to ' + MAX_REGISTER + ' chapters gets a cell of its own');
