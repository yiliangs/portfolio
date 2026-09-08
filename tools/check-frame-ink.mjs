// Checks that the Development register draws its module boundaries in an ink of their own, on a layer
// above the module's own content.
//
// The mono register is set on a 22-column, 44px-row drawing grid, and every module standing on that
// grid closes itself with a four-stroke hairline frame: left and top drawn inside the module, right
// and bottom outside, so two neighbours put their shared line in the same place.
//
// Two things about that frame have gone wrong in turn, and this file holds both.
//
// The ink. The frame was drawn in the same colour as the grid rule behind it, which made a module
// boundary and a ruled cell edge the same mark. There are two named inks now, declared once on the
// root element beside the theme's own colours: --hair, the grid's rule, and --frame, the resting ink
// of a boundary, well above it. Full var(--color-text) is the third step, for a boundary the cursor
// is on or the graph has lit. Three steps, and it reads as a ladder only while every boundary is on
// it.
//
// The layer. Raising the ink changed nothing on the landing, because the landing drew its frame as an
// inset box-shadow on the module itself. An inset shadow paints above the module's background and
// below its children, so a plate's picture covered the two strokes drawn inside it and a neighbour's
// opaque ground covered the two drawn outside: a module with a picture in it had no visible frame at
// all. The sheet had already solved this with a frame layer on ::after, and that is now the one
// mechanism for all three grids. Hence the rule this file exists to keep: the four-stroke shape lives
// in the style block, inside ::after rules, and never in an element's own style attribute.
//
// Run with `npm run check`. Exits non-zero and prints every failure it found.

import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const SRC = 'design/Portfolio.dc.html';
// the grid's own signature: an element ruled on the 22-column, 44px module is a drawing grid
const GRID_SIZE = /background-size\s*:\s*calc\(\s*100%\s*\/\s*22\s*\)\s*44px/g;
// the class every module on a drawing grid carries, and the two it may add
const MOD = 'mod', CTL = 'mod-ctl', SHEET = 'sheet-mod';

const failures = [];
const fail = (msg) => failures.push(msg);

const src = readFileSync(SRC, 'utf8');
const lineAt = (i) => src.slice(0, i).split('\n').length;
const tight = (s) => String(s || '').replace(/\s+/g, ' ').trim();

const openMatch = /<x-dc(?:\s[^>]*)?>/.exec(src);
const closeAt = src.lastIndexOf('</x-dc>');
if (!openMatch || closeAt < 0) {
  console.error('check-frame-ink: no <x-dc> block in ' + SRC);
  process.exit(1);
}
const templateSrc = src.slice(openMatch.index + openMatch[0].length, closeAt);

// The style block is the one place a frame may be written. It is inside the helmet, which build-dc
// copies into index.html verbatim.
const styleBlock = /<style[^>]*>([\s\S]*?)<\/style\s*>/i.exec(src);
const styleFrom = styleBlock ? styleBlock.index : -1;
const styleTo = styleBlock ? styleBlock.index + styleBlock[0].length : -1;
if (!styleBlock) fail('no <style> block in ' + SRC + ': there is nowhere for a frame rule to live');

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
function shadows(text, from = 0) {
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
    out.push({ at: from + m.index, value: text.slice(start, i) });
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

// the frame is drawn by a rule, so the rule that draws it has to be readable: back up to the brace
// this declaration sits in and read the selector in front of it
function selectorBefore(i) {
  const open = src.lastIndexOf('{', i);
  if (open < 0) return '';
  const head = src.slice(Math.max(0, open - 400), open);
  const cut = Math.max(head.lastIndexOf('}'), head.lastIndexOf('{'), head.lastIndexOf('*/'));
  return (cut < 0 ? head : head.slice(cut + 1)).replace(/^\//, '').trim().replace(/\s+/g, ' ');
}

const inks = (value) => {
  const parts = commas(value);
  if (parts.length !== STROKES.length) return null;
  const out = [];
  for (let i = 0; i < STROKES.length; i++) {
    const m = STROKES[i].exec(parts[i]);
    if (!m) return null;
    out.push(tight(m[1]));
  }
  return out;
};

let frames = 0;
const drawnBy = new Map(); // selector -> the inks it draws in
for (const shadow of shadows(src)) {
  const ink = inks(shadow.value);
  if (!ink) continue; // not the frame shape: a lift, a rule, a single edge
  frames++;
  if (shadow.at < styleFrom || shadow.at > styleTo) {
    fail('the four-stroke frame on line ' + lineAt(shadow.at) + ' is written into an element rather than ' +
      'into a rule. An inset box-shadow on the module paints under the module\'s own children, so the ' +
      'frame disappears behind a picture: a module frames itself by carrying class="' + MOD + '"');
    continue;
  }
  const sel = selectorBefore(shadow.at);
  if (!/::after\b/.test(sel)) {
    fail('the four-stroke frame on line ' + lineAt(shadow.at) + ' is drawn by "' + sel + '", which is not ' +
      'an ::after rule: the frame is a layer above the module\'s content, not a shadow on the module');
    continue;
  }
  drawnBy.set(sel, ink);
}
if (!frames) fail('no four-stroke frame in ' + SRC + ': the register draws no module boundaries at all');

// two rules, one per state the ladder has above the grid rule
const resting = [...drawnBy].find(([sel]) => /^\.mod::after$/.test(sel));
if (!resting) fail('no ".mod::after" rule: nothing draws a resting module boundary');
else for (const ink of new Set(resting[1])) {
  if (ink !== 'var(--frame)') fail('.mod::after draws a stroke in ' + ink + '; a module rests at var(--frame)');
}
const full = [...drawnBy].find(([sel]) => sel.includes('.' + CTL + ':hover::after'));
if (!full) fail('no ".' + CTL + ':hover::after" rule: a control gives no hover feedback');
else {
  if (!full[0].includes('[data-lit]::after')) {
    fail('the full-ink rule (' + full[0] + ') does not carry [data-lit]::after, so a plate the graph lit ' +
      'has no way to say so without an ink string of its own');
  }
  for (const ink of new Set(full[1])) {
    if (ink !== 'var(--color-text)') fail('the full-ink rule draws a stroke in ' + ink + ', not var(--color-text)');
  }
}

// the ink a plate rests in is not the model's business any more: the model says lit or not, the rule
// says what that looks like
for (const m of src.matchAll(/frameInk/g)) {
  fail('frameInk survives on line ' + lineAt(m.index) + '; a plate carries data-lit and the three inks ' +
    'live in the two ::after rules');
}

// ---------------------------------------------------------------- every module carries the class

const dom = new JSDOM('<!doctype html><body></body>');
const tpl = dom.window.document.createElement('template');
tpl.innerHTML = templateSrc;
const flat = (s) => String(s || '').replace(/\s+/g, '');
const classesOf = (el) => (el.getAttribute('class') || '').split(/\s+/).filter(Boolean);
const where = (el) => {
  const name = el.tagName.toLowerCase();
  const mark = el.getAttribute('data-mod') || el.getAttribute('data-morph') || el.getAttribute('ref') || '';
  return mark ? name + ' [' + mark + ']' : name;
};

// A sheet module adds the plot-in to a module; it is not a module on its own. Carrying only sheet-mod
// would plot a module in and leave it with no frame to plot.
for (const el of tpl.content.querySelectorAll('.' + SHEET)) {
  if (!classesOf(el).includes(MOD)) {
    fail('a sheet module carries ' + SHEET + ' without ' + MOD + ', so it plots in with no frame: ' + where(el));
  }
}

// The two Development landings. Every cell of their grids is a module and frames itself the same way
// the sheet's do; the exceptions are the zero-height anchors the transitions reach for and the graph
// overlay, neither of which takes a cell.
let modules = 0;
const landings = [...tpl.content.querySelectorAll('main[data-screen-label="Development"]')];
if (landings.length !== 2) fail('expected the stacked and the desktop Development landing, found ' + landings.length);
for (const main of landings) {
  const grid = [...main.querySelectorAll('*')].find((el) => flat(el.getAttribute('style')).includes('repeat(22,1fr)'));
  if (!grid) { fail('a Development landing has no 22-column grid to stand modules on'); continue; }
  const items = [];
  const collect = (parent) => {
    for (const child of parent.children) {
      const tag = child.tagName.toLowerCase();
      if (tag === 'sc-if' || tag === 'sc-for') collect(child);
      else items.push(child);
    }
  };
  collect(grid);
  for (const item of items) {
    const style = flat(item.getAttribute('style'));
    if (style.includes('position:absolute')) continue; // an overlay, out of the grid's flow
    // an anchor a transition reaches for, no cell of its own. Matched at a declaration boundary, or
    // every module that holds itself to min-height:0 reads as one
    if (/(^|;)height:0(;|$)/.test(style)) continue;
    modules++;
    const cls = classesOf(item);
    if (!cls.includes(MOD)) {
      fail('a landing module does not carry class="' + MOD + '", so it draws no frame: ' + where(item));
    }
    const clickable = item.hasAttribute('onclick') || item.hasAttribute('href');
    if (clickable && !cls.includes(CTL)) {
      fail('a landing module answers a click but does not carry ' + CTL + ', so it gives no hover feedback: ' + where(item));
    }
    if (!clickable && cls.includes(CTL)) {
      fail(CTL + ' brings the frame to full ink on hover, which invites a click: it belongs on a control, not on ' + where(item));
    }
  }
}
if (!modules) fail('no modules found on either Development landing');

// A module that clips its content clips its own frame layer with it, and the two strokes drawn outside
// the box are the ones that go. overflow:clip with a 1px margin clips the content and keeps them.
for (const el of tpl.content.querySelectorAll('.' + MOD)) {
  const style = flat(el.getAttribute('style'));
  if (/overflow(-x|-y)?:hidden/.test(style)) {
    fail('a module clips with overflow:hidden, which clips away the two strokes its frame draws outside ' +
      'its own box: use overflow:clip with overflow-clip-margin:1px. ' + where(el));
  }
  if (/overflow:clip/.test(style) && !/overflow-clip-margin:/.test(style)) {
    fail('a module clips with overflow:clip and names no clip margin, so its outer strokes are clipped ' +
      'away: overflow-clip-margin:1px is the width they stand in. ' + where(el));
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
  'rule themselves in --hair, ' + modules + ' landing modules and every sheet module frame themselves on ' +
  MOD + ', and all ' + frames + ' four-stroke frames are drawn by ::after rules in the style block');
