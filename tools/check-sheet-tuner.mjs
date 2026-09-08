// Checks the Development sheet's tuning panel against the source it is supposed to write back into.
//
// The panel behind ?dev adjusts SHEET_WIDE and SHEET_NARROW in place and then offers to write them
// out as a block to paste into design/Portfolio.dc.html. The failure that costs the most is a block
// that cannot be pasted back: a dropped module, a span emitted in a shape nothing reads, an entry
// whose alignment ran into its own value. So the round trip is the substance of this file. It reads
// the two tables out of the design source, hands them to the panel's own serializer, parses what
// comes back, and compares the two deeply, then does it again over a moved and resized copy so the
// check cannot pass on the untouched case alone.
//
// The block has a second reader. tools/check-sheet-grid.mjs parses these tables line by line with a
// regex of its own, and a block that pastes cleanly but that check cannot read would take the sheet's
// only structural guard away at the moment the composition changed. Every line the panel writes is
// put through that same regex here.
//
// The rest guards the arrangement that keeps the panel out of the shipped page: the module is
// imported from exactly one place, that place is behind the ?dev flag, the component destroys it, and
// every module the tables place carries the data-mod the panel binds it by.
//
// Run with `npm run check`. Exits non-zero and prints every failure it found.

import { readFileSync } from 'node:fs';
import { serialize } from '../sheet-dev.js';

const SRC = 'design/Portfolio.dc.html';
const MODULE = './sheet-dev.js';
const COLUMNS = 22;

const failures = [];
const fail = (msg) => failures.push(msg);

// the working tree is CRLF on Windows and LF elsewhere; every marker below is written with LF
const src = readFileSync(SRC, 'utf8').replace(/\r\n/g, '\n');
const closeAt = src.lastIndexOf('</x-dc>');
if (closeAt < 0) {
  console.error('check-sheet-tuner: no <x-dc> block in ' + SRC);
  process.exit(1);
}
const logicSrc = src.slice(closeAt);

// ---------------------------------------------------------------- lift the two tables

// Both are plain literals on the class, which is what lets the panel mutate them in place and what
// lets this check read them without running the component.
function readTable(name) {
  const at = logicSrc.indexOf('\n  ' + name + ' = {');
  if (at < 0) { fail('the logic class has no ' + name + ' table, so the panel has nothing to tune'); return null; }
  const end = logicSrc.indexOf('\n  };', at);
  if (end < 0) { fail(name + ' is not closed with "  };" so neither the panel nor the check can read it'); return null; }
  const body = logicSrc.slice(at + name.length + 7, end);
  try {
    // eslint-disable-next-line no-new-func
    return new Function('return {' + body + '}')();
  } catch (e) {
    fail(name + ' does not parse on its own: ' + e.message);
    return null;
  }
}

const wide = readTable('SHEET_WIDE');
const narrow = readTable('SHEET_NARROW');

// ---------------------------------------------------------------- the round trip

const parseBack = (text) => {
  const grab = (name) => {
    const at = text.indexOf(name + ' = {');
    const end = text.indexOf('\n  };', at);
    if (at < 0 || end < 0) throw new Error('the emitted block has no readable ' + name);
    // eslint-disable-next-line no-new-func
    return new Function('return {' + text.slice(at + name.length + 4, end) + '}')();
  };
  return { wide: grab('SHEET_WIDE'), narrow: grab('SHEET_NARROW') };
};

const same = (a, b, path, note) => {
  const ka = Object.keys(a), kb = Object.keys(b || {});
  for (const k of ka) if (!kb.includes(k)) fail(note + ': ' + path + ' loses ' + k);
  for (const k of kb) if (!ka.includes(k)) fail(note + ': ' + path + ' gains ' + k);
  // key order is the reading order of the sheet, and the painting order the hairlines depend on:
  // a block that comes back reordered would put two modules' shared line in two places
  if (ka.join() !== kb.join() && ka.length === kb.length) {
    fail(note + ': ' + path + ' comes back with its modules reordered, so the block no longer reads like the source');
  }
  for (const k of ka) {
    if (!kb.includes(k)) continue;
    for (const axis of ['col', 'row']) {
      if (a[k][axis] !== (b[k] || {})[axis]) {
        fail(note + ': ' + path + '.' + k + '.' + axis + ' is ' + JSON.stringify(a[k][axis]) + ' and comes back as ' + JSON.stringify((b[k] || {})[axis]));
      }
    }
  }
};

// the reader in tools/check-sheet-grid.mjs, verbatim: what the panel writes has to survive it
const ENTRY = /^\s*([A-Za-z_$][\w$]*):\s*\{\s*col:\s*'([^']*)',\s*row:\s*'([^']*)'\s*\},?\s*$/;

const readableByTheGridCheck = (text, note) => {
  for (const name of ['SHEET_WIDE', 'SHEET_NARROW']) {
    const at = text.indexOf('  ' + name + ' = {');
    const end = text.indexOf('\n  };', at);
    if (at < 0 || end < 0) { fail(note + ': check-sheet-grid could not find ' + name + ' in the emitted block'); continue; }
    const body = text.slice(at, end);
    for (const line of body.split('\n').slice(1)) {
      if (!line.trim()) continue;
      if (!ENTRY.exec(line)) fail(note + ': check-sheet-grid cannot read a line the panel wrote, so a module could hide in it: ' + JSON.stringify(line));
    }
  }
};

const SPAN = /^\d+ \/ \d+$/;

function roundTrip(w, n, note) {
  let text, back;
  try {
    text = serialize(w, n);
    back = parseBack(text);
  } catch (e) {
    fail(note + ': what the panel writes does not parse back: ' + e.message);
    return;
  }
  same(w, back.wide, 'SHEET_WIDE', note);
  same(n, back.narrow, 'SHEET_NARROW', note);
  readableByTheGridCheck(text, note);
}

if (wide && narrow) {
  roundTrip(wide, narrow, 'the tables as the source holds them');

  // and again over values the panel actually produces: a module moved, one resized to a single cell,
  // one taking the full width, and one pushed far enough down the sheet to widen the row column
  const tuned = JSON.parse(JSON.stringify({ wide, narrow }));
  tuned.wide.header = { col: '3 / 9', row: '5 / 14' };
  tuned.wide.ghost = { col: '9 / 10', row: '5 / 6' };
  tuned.wide.aside = { col: '1 / 23', row: '120 / 148' };
  tuned.narrow.body1 = { col: '2 / 22', row: '33 / 41' };
  roundTrip(tuned.wide, tuned.narrow, 'the tables after tuning');

  // a span is two grid lines and has to stay two, or grid-column is set to a string the browser drops
  // and the module lands wherever auto-placement puts it
  for (const [name, t] of [['SHEET_WIDE', wide], ['SHEET_NARROW', narrow]]) {
    for (const [mod, at] of Object.entries(t)) {
      for (const axis of ['col', 'row']) {
        if (!SPAN.test(String(at[axis]))) {
          fail(name + '.' + mod + '.' + axis + ' is ' + JSON.stringify(at[axis]) + ', which the panel cannot read as a pair of grid lines');
        }
      }
      const c = String(at.col).split(' / ').map(Number);
      if (c[1] > COLUMNS + 1) fail(name + '.' + mod + ' runs off the ' + COLUMNS + ' column grid: ' + at.col);
    }
  }

  // both tables place the same modules, or the sheet loses one the moment the window crosses 1000px
  // and the panel would offer a row that writes nothing
  const only = (a, b) => Object.keys(a).filter((k) => !(k in b));
  for (const k of only(wide, narrow)) fail('SHEET_WIDE places ' + k + ' and SHEET_NARROW does not');
  for (const k of only(narrow, wide)) fail('SHEET_NARROW places ' + k + ' and SHEET_WIDE does not');
}

// ---------------------------------------------------------------- the panel stays out of the page

const imports = [...src.matchAll(/import\((['"])\.\/sheet-dev\.js\1\)/g)];
if (imports.length !== 1) {
  fail('expected exactly one import of ' + MODULE + ' in the design source, found ' + imports.length);
} else {
  const before = src.slice(Math.max(0, imports[0].index - 700), imports[0].index);
  if (!/URLSearchParams\(location\.search\)\.has\('dev'\)/.test(before)) {
    fail(MODULE + ' is imported without the ?dev flag guarding it, so the panel ships to every visitor');
  }
}
if (!/this\.sheetTuner\.destroy\(\)/.test(logicSrc)) {
  fail('componentWillUnmount never destroys the tuning panel, so its listeners outlive the component');
}
// the panel reads which table the width is rendering off the component rather than repeating the
// breakpoint, or the two would drift and it would tune the table the page is not showing
if (!/liveName: \(\) => \(this\.state\.narrow \? 'SHEET_NARROW' : 'SHEET_WIDE'\)/.test(logicSrc)) {
  fail('the panel is not told which placement table the width is rendering, so it could tune the other one');
}

// ---------------------------------------------------------------- two panels, one page

// The page carries two tuning panels behind ?dev now, and a MutationObserver over the whole document
// makes them fight: each panel's redraw is a document mutation, the other panel answers it by
// redrawing, and because observer callbacks are microtasks the pair never yields the main thread
// again. The page under #dc-root is what a panel tunes and all either has to watch; both park outside
// it, so neither can see the other at all.
for (const file of ['sheet-dev.js', 'leaves-dev.js']) {
  const mod = readFileSync(file, 'utf8');
  if (/observer\.observe\(document\.body/.test(mod)) {
    fail(file + ' watches the whole document, so it and the panel beside it would answer each other\'s redraws until the page stops');
  }
  if (!/observer\.observe\(document\.getElementById\('dc-root'\)/.test(mod)) {
    fail(file + ' does not watch the page it tunes, so it would not notice the view changing under it');
  }
  if (!/document\.body\.appendChild\(root\)/.test(mod)) {
    fail(file + ' does not park its panel outside the page, so its own redraws would come back to it as page changes');
  }
  if (!/root\.dataset\.devPanel = '(sheet|leaves)'/.test(mod)) {
    fail(file + ' does not say which panel it is, and with two on the page their controls are otherwise indistinguishable');
  }
}

// ---------------------------------------------------------------- every module says what placed it

// check-sheet-grid holds the other half of this: that a data-mod matches the entry its module binds.
// Here it is the coverage that matters, the derived single detail plate included, since a module the
// panel cannot see is a module nobody can move.
const stamped = new Set([...src.matchAll(/data-mod="([A-Za-z_$][\w$]*)"/g)].map((m) => m[1]));
if (wide) {
  for (const mod of Object.keys(wide)) {
    if (!stamped.has(mod)) fail('SHEET_WIDE places ' + mod + ' but no module on the sheet carries data-mod="' + mod + '"');
  }
}
if (!stamped.has('detail')) {
  fail('the single detail plate carries no data-mod, so the one module that stands in for the pair cannot be tuned');
}

// ---------------------------------------------------------------- report

if (failures.length) {
  console.error('check-sheet-tuner: ' + failures.length + ' failure' + (failures.length === 1 ? '' : 's'));
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
const count = Object.keys(wide).length + Object.keys(narrow).length;
console.log('check-sheet-tuner: ' + count + ' placement entries survive the panel\'s paste-back block unchanged, tuned and untuned, ' +
  'every line still readable by check-sheet-grid, and the panel is reachable only behind ?dev');
