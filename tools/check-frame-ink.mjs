// Checks that the Development register draws its module boundaries in an ink of their own, above the
// drawing grid rather than in it.
//
// The mono register is set on a 22-column, 44px-row drawing grid, and every module standing on that
// grid closes itself with a four-stroke hairline frame: left and top drawn inside the module, right
// and bottom outside, so two neighbours put their shared line in the same place. For a while the
// frame was drawn in the same ink as the grid rule behind it, which made a module boundary and a
// ruled cell edge the same mark and left the composition unreadable: nothing said where a module
// began.
//
// The fix is two named inks, declared once on the root element and used everywhere:
//
//   --hair   the drawing grid's rule, the faintest mark on the page
//   --frame  the resting ink of a module boundary, well above the rule
//
// and full var(--color-text) for a boundary the cursor is on or the graph has lit. That is a ladder
// of three steps, and it only reads as one while every boundary is on it. This check holds the
// source to that: the two tokens exist and differ, the grid draws itself with the first, and no
// four-stroke frame anywhere in the file reaches for an ink outside the ladder, in particular not
// the grid's own colour-mix and not one of the neutral tokens a frame used to borrow.
//
// Run with `npm run check`. Exits non-zero and prints every failure it found.

import { readFileSync } from 'node:fs';

const SRC = 'design/Portfolio.dc.html';
// the grid's own signature: an element ruled on the 22-column, 44px module is a drawing grid
const GRID_SIZE = /background-size\s*:\s*calc\(\s*100%\s*\/\s*22\s*\)\s*44px/g;
// the ladder a module boundary is allowed to stand on. The binding is the landing plate's, which
// picks its own rung in the logic class and is checked there instead
const LADDER = ['var(--frame)', 'var(--color-text)', '{{ p.frameInk }}'];

const failures = [];
const fail = (msg) => failures.push(msg);

const src = readFileSync(SRC, 'utf8');
const lineAt = (i) => src.slice(0, i).split('\n').length;
const tight = (s) => String(s || '').replace(/\s+/g, ' ').trim();

// ---------------------------------------------------------------- the two inks, declared once

// The root element is where the theme's --color-* tokens are written, so it is where an ink derived
// from them belongs. Anything further in would scope the token to one branch of the page and leave
// the rest of the register drawing from whatever it inherited.
const root = /<div\s+ref="\{\{\s*rootRef\s*\}\}"[^>]*>/.exec(src);
let rootStyle = '';
if (!root) {
  fail('no <div ref="{{ rootRef }}"> element: the root the theme tokens are declared on is gone');
} else {
  const attr = /style="([^"]*)"/.exec(root[0]);
  if (!attr) fail('the root element carries no style attribute, so it declares no tokens at all');
  else rootStyle = attr[1];
}

const declaredOn = (style, name) => {
  const m = new RegExp('(?:^|;)\\s*' + name + '\\s*:\\s*([^;]+)').exec(style);
  return m ? m[1].trim() : null;
};

const hair = declaredOn(rootStyle, '--hair');
const frame = declaredOn(rootStyle, '--frame');
if (!hair) fail('the root element does not declare --hair, the drawing grid\'s rule');
if (!frame) fail('the root element does not declare --frame, the resting ink of a module boundary');
if (hair && frame && tight(hair) === tight(frame)) {
  fail('--hair and --frame are the same ink (' + tight(hair) + '), so a module boundary is still the ' +
    'grid rule behind it and the ladder has two rungs, not three');
}

// One declaration, at the root. A second one further in is how the sheet grid used to own the token,
// and it means two grids can drift apart without either looking wrong on its own.
for (const m of src.matchAll(/--hair\s*:/g)) {
  const at = m.index;
  if (root && at > root.index && at < root.index + root[0].length) continue;
  fail('--hair is declared again on line ' + lineAt(at) + '; the root owns it, and a second declaration ' +
    'scopes a different rule to part of the register');
}

// ---------------------------------------------------------------- every four-stroke frame

// A box-shadow value is read whole rather than by regex over the file, because an ink can be a
// colour-mix and carry commas of its own. Read to the end of the declaration, then split at the
// commas that are not inside brackets.
function shadows(text) {
  const out = [];
  for (const m of text.matchAll(/box-shadow\s*:/g)) {
    let i = m.index + m[0].length;
    const start = i;
    let depth = 0;
    for (; i < text.length; i++) {
      const c = text[i];
      if (c === '(') depth++;
      else if (c === ')') depth--;
      else if (depth === 0 && (c === ';' || c === '"' || c === '}')) break;
    }
    out.push({ at: m.index, value: text.slice(start, i) });
  }
  return out;
}

function commas(value) {
  const out = [];
  let depth = 0, cur = '';
  for (const c of value) {
    if (c === '(') { depth++; cur += c; }
    else if (c === ')') { depth--; cur += c; }
    else if (c === ',' && depth === 0) { out.push(cur.trim()); cur = ''; }
    else cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

// the four strokes, in the order the convention writes them: left and top inside, right and bottom out
const STROKES = [
  /^inset\s+1px\s+0\s+0\s+0\s+([\s\S]+)$/,
  /^inset\s+0\s+1px\s+0\s+0\s+([\s\S]+)$/,
  /^1px\s+0\s+0\s+0\s+([\s\S]+)$/,
  /^0\s+1px\s+0\s+0\s+([\s\S]+)$/,
];

let frames = 0;
for (const shadow of shadows(src)) {
  const strokes = commas(shadow.value);
  if (strokes.length !== STROKES.length) continue; // not the frame shape: a lift, a rule, a single edge
  const inks = [];
  for (let i = 0; i < STROKES.length; i++) {
    const m = STROKES[i].exec(strokes[i]);
    if (!m) break;
    inks.push(tight(m[1]));
  }
  if (inks.length !== STROKES.length) continue;
  frames++;
  for (const ink of new Set(inks)) {
    if (LADDER.includes(ink)) continue;
    fail('the four-stroke frame on line ' + lineAt(shadow.at) + ' is drawn in ' + ink + ', which is not on ' +
      'the ladder (' + LADDER.join(', ') + '): a module boundary rests at --frame and comes to full ink ' +
      'under the cursor');
  }
}
if (!frames) fail('no four-stroke frame in ' + SRC + ': the register draws no module boundaries at all');

// ---------------------------------------------------------------- the sheet's own frame layer

// A sheet module frames itself from a pseudo-element rather than from its own box-shadow, so that the
// frame lands above whatever the module holds. It is the same boundary and takes the same ink.
const after = /\.sheet-mod::after\s*\{([\s\S]*?)\}/.exec(src);
if (!after) fail('no .sheet-mod::after rule: the Development sheet draws no frame layer');
else {
  const shadow = shadows(after[1])[0];
  if (!shadow) fail('.sheet-mod::after declares no box-shadow, so a sheet module has no frame');
  else {
    for (const stroke of commas(shadow.value)) {
      const ink = tight(stroke.replace(/^(inset\s+)?(\S+\s+){4}/, ''));
      if (ink !== 'var(--frame)') {
        fail('.sheet-mod::after draws a stroke in ' + ink + '; a resting sheet module frames itself in ' +
          'var(--frame), and only .sheet-ctl:hover::after goes to full ink');
      }
    }
  }
}

// ---------------------------------------------------------------- the landing plate's rung

// A plate on the desktop landing is lit by the graph as well as by the cursor, so it picks its own
// rung in the logic class rather than in the markup. Both ends of that choice are on the ladder.
const ink = /frameInk:\s*([^\n]*)/.exec(src);
if (!ink) fail('the logic class no longer builds a frameInk for the landing plates');
else {
  const branches = /^lit\s*\?\s*'([^']*)'\s*:\s*'([^']*)'/.exec(ink[1].trim());
  if (!branches) {
    fail('frameInk is written in a shape this check cannot read (' + ink[1].trim() + '), so a plate could ' +
      "rest in an ink nothing here would see: expected lit ? '<full>' : '<resting>'");
  } else {
    if (branches[1] !== 'var(--color-text)') {
      fail('a lit landing plate frames itself in ' + branches[1] + ', not full var(--color-text)');
    }
    if (branches[2] !== 'var(--frame)') {
      fail('a resting landing plate frames itself in ' + branches[2] + ', not var(--frame): its boundary ' +
        'sits on a rung of its own or falls back into the grid');
    }
  }
}

// ---------------------------------------------------------------- every drawing grid

// Three elements are ruled on the 22-column module: the stacked landing, the desktop landing and the
// Development sheet. Each draws the rule twice, as the two gradients that make the cells and as the
// right and bottom borders that close the last of them, and all of it is the same faint ink.
let grids = 0;
for (const m of src.matchAll(GRID_SIZE)) {
  const open = src.lastIndexOf('style="', m.index);
  if (open < 0) { fail('a 22-column drawing grid on line ' + lineAt(m.index) + ' is not in a style attribute'); continue; }
  const close = src.indexOf('"', open + 'style="'.length);
  const style = src.slice(open + 'style="'.length, close);
  grids++;
  const at = 'the 22-column drawing grid on line ' + lineAt(open) + ' ';
  const image = declaredOn(style, 'background-image');
  if (!image) fail(at + 'draws no background-image, so its cells are not ruled');
  else if (!/var\(--hair\)/.test(image)) {
    fail(at + 'rules its cells in ' + tight(image) + ' rather than var(--hair)');
  }
  for (const side of ['border-right', 'border-bottom']) {
    const value = declaredOn(style, side);
    if (!value) fail(at + 'has no ' + side + ', so its last cell is left open');
    else if (!/var\(--hair\)/.test(value)) {
      fail(at + 'closes its ' + side + ' in ' + tight(value) + ' rather than var(--hair)');
    }
  }
}
if (!grids) fail('no element is ruled on the 22-column, 44px module: the drawing grid is gone');

// ---------------------------------------------------------------- report

if (failures.length) {
  console.error('check-frame-ink: ' + failures.length + ' failure' + (failures.length === 1 ? '' : 's'));
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
console.log('check-frame-ink: --hair and --frame are declared once at the root, ' + grids + ' drawing grids ' +
  'rule themselves in --hair, and ' + frames + ' four-stroke frames stand on the three-step ladder');
