// Checks the Research leaf tuning panel against the source it is supposed to write back into.
//
// The panel behind ?dev adjusts LEAF_SPREADS and LEAF_PAIRS in place and then offers to write them
// out as a block to paste into design/Portfolio.dc.html. The failure that costs the most is a block
// that cannot be pasted back: a dropped key, a number emitted as a string, an apostrophe that closes
// the literal early. So the round trip is the substance of this file. It reads the two tables out of
// the design source, hands them to the panel's own serializer, parses what comes back, and compares
// the two deeply, then does it again over a mutated copy so the check cannot pass on the untouched
// case alone.
//
// The rest guards the arrangement that keeps the panel out of the shipped page: the module is
// imported from exactly one place, that place is behind the ?dev flag, and every leaf carries the
// binding key the panel needs in order to know which entry placed it.
//
// Run with `npm run check`. Exits non-zero and prints every failure it found.

import { readFileSync } from 'node:fs';
import { serialize } from '../leaves-dev.js';

const SRC = 'design/Portfolio.dc.html';
const MODULE = './leaves-dev.js';

const failures = [];
const fail = (msg) => failures.push(msg);

// the working tree is CRLF on Windows and LF elsewhere; every marker below is written with LF
const src = readFileSync(SRC, 'utf8').replace(/\r\n/g, '\n');
const closeAt = src.lastIndexOf('</x-dc>');
if (closeAt < 0) {
  console.error('check-leaf-tuner: no <x-dc> block in ' + SRC);
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
  if (end < 0) { fail(name + ' is not closed with "  };" so it cannot be read'); return null; }
  // `at` is the newline before the field, so the body starts past newline + two spaces + name + ' = {'
  const body = logicSrc.slice(at + name.length + 7, end);
  try {
    // eslint-disable-next-line no-new-func
    return new Function('return {' + body + '}')();
  } catch (e) {
    fail(name + ' does not parse on its own: ' + e.message);
    return null;
  }
}

const spreads = readTable('LEAF_SPREADS');
const pairs = readTable('LEAF_PAIRS');

// ---------------------------------------------------------------- the round trip

const parseBack = (text) => {
  // what the panel writes is two class fields; read them back the way the class would
  const grab = (name) => {
    const at = text.indexOf(name + ' = {');
    const end = text.indexOf('\n  };', at);
    if (at < 0 || end < 0) throw new Error('the emitted block has no readable ' + name);
    // eslint-disable-next-line no-new-func
    return new Function('return {' + text.slice(at + name.length + 4, end) + '}')();
  };
  return { spreads: grab('LEAF_SPREADS'), pairs: grab('LEAF_PAIRS') };
};

const same = (a, b, path, note) => {
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
      fail(note + ': ' + path + ' has ' + (a || []).length + ' entries and comes back with ' + (b || []).length);
      return;
    }
    a.forEach((x, i) => same(x, b[i], path + '[' + i + ']', note));
    return;
  }
  if (a && typeof a === 'object') {
    const ka = Object.keys(a), kb = Object.keys(b || {});
    for (const k of ka) if (!kb.includes(k)) fail(note + ': ' + path + ' loses ' + k);
    for (const k of kb) if (!ka.includes(k)) fail(note + ': ' + path + ' gains ' + k);
    // key order is what makes the emitted entry read like the one in the source
    if (ka.join() !== kb.join() && ka.length === kb.length) {
      fail(note + ': ' + path + ' comes back with its keys reordered, so the block no longer reads like the source');
    }
    for (const k of ka) if (kb.includes(k)) same(a[k], b[k], path + '.' + k, note);
    return;
  }
  if (a !== b || typeof a !== typeof b) {
    fail(note + ': ' + path + ' is ' + JSON.stringify(a) + ' (' + typeof a + ') and comes back as ' + JSON.stringify(b) + ' (' + typeof b + ')');
  }
};

function roundTrip(sp, pr, note) {
  let back;
  try {
    back = parseBack(serialize(sp, pr));
  } catch (e) {
    fail(note + ': what the panel writes does not parse back: ' + e.message);
    return;
  }
  same(sp, back.spreads, 'LEAF_SPREADS', note);
  same(pr, back.pairs, 'LEAF_PAIRS', note);
}

if (spreads && pairs) {
  roundTrip(spreads, pairs, 'the tables as the source holds them');

  // and again over values the panel actually produces: a moved leaf, a scaled one, and the awkward
  // characters a person can end up with in a caption or a URL
  const tuned = JSON.parse(JSON.stringify({ spreads, pairs }));
  tuned.spreads.left[0].bleedX = '-137.5px';
  tuned.spreads.left[0].bleedY = '42px';
  tuned.spreads.left[0].h = 49.5;
  tuned.spreads.left[0].w = 742.5;
  tuned.spreads.left[0].maxW = '210px';
  tuned.pairs.right[0].bleedY = '-0.25px';
  tuned.pairs.right[0].cover = "https://example.test/it's/a\\path";
  roundTrip(tuned.spreads, tuned.pairs, 'the tables after tuning');

  // a size is a number in the source and has to stay one, or `min(h/rows vh, ...)` builds "NaNvh"
  for (const [name, t] of [['LEAF_SPREADS', spreads], ['LEAF_PAIRS', pairs]]) {
    for (const side of ['left', 'right']) {
      (t[side] || []).forEach((e, i) => {
        for (const k of ['h', 'w', 'stackH', 'stackW']) {
          if (e[k] !== undefined && typeof e[k] !== 'number') {
            fail(name + '.' + side + '[' + i + '].' + k + ' is ' + JSON.stringify(e[k]) + ', not a number');
          }
        }
        for (const k of ['bleedX', 'bleedY', 'maxW']) {
          if (e[k] !== undefined && !/^-?\d*\.?\d+px$/.test(e[k])) {
            fail(name + '.' + side + '[' + i + '].' + k + ' is ' + JSON.stringify(e[k]) + ', which the panel cannot read as a pixel length');
          }
        }
      });
    }
  }
}

// ---------------------------------------------------------------- the panel stays out of the page

const imports = [...src.matchAll(/import\((['"])\.\/leaves-dev\.js\1\)/g)];
if (imports.length !== 1) {
  fail('expected exactly one import of ' + MODULE + ' in the design source, found ' + imports.length);
} else {
  const before = src.slice(Math.max(0, imports[0].index - 400), imports[0].index);
  if (!/URLSearchParams\(location\.search\)\.has\('dev'\)/.test(before)) {
    fail(MODULE + ' is imported without the ?dev flag guarding it, so the panel ships to every visitor');
  }
}
if (!/this\.leafTuner\.destroy\(\)/.test(logicSrc)) {
  fail('componentWillUnmount never destroys the tuning panel, so its listeners outlive the component');
}

// ---------------------------------------------------------------- every leaf says what placed it

if (!/const slot = \(st, row, col, wrap, tune\) =>/.test(logicSrc)) {
  fail('leafSlots no longer gives each slot the binding key the panel identifies it by');
}
for (const table of ['spreads', 'pairs']) {
  if (!new RegExp("'" + table + "\\.' \\+ side").test(logicSrc)) {
    fail('leafSlots does not build a ' + table + ' binding key, so those leaves bind to nothing');
  }
}
const leafDivs = [...src.matchAll(/<div data-leaf="\{\{ lf\.side \}\}"([^>]*)>/g)];
if (leafDivs.length !== 2) {
  fail('expected two leaf blocks in the Research hero, found ' + leafDivs.length);
}
for (const m of leafDivs) {
  if (!/data-slot="\{\{ lf\.tune \}\}"/.test(m[1])) {
    fail('a leaf block does not carry data-slot, so the panel cannot tell which entry placed it');
  }
}

// the binding keys the panel builds have to name entries that exist
if (spreads && pairs) {
  for (const side of ['left', 'right']) {
    if (!spreads[side] || !spreads[side].length) fail('LEAF_SPREADS.' + side + ' is empty, so that gutter has no anchor to bind to');
    if (!pairs[side] || !pairs[side].length) fail('LEAF_PAIRS.' + side + ' is empty, so a pair cell would bind to nothing');
  }
}

// ---------------------------------------------------------------- report

if (failures.length) {
  console.error('check-leaf-tuner: ' + failures.length + ' failure' + (failures.length === 1 ? '' : 's'));
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
const count = ['left', 'right'].reduce((n, s) => n + spreads[s].length + pairs[s].length, 0);
console.log('check-leaf-tuner: ' + count + ' style entries survive the panel\'s paste-back block unchanged, tuned and untuned, ' +
  'and the panel is reachable only behind ?dev');
