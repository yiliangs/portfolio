// Checks the Development sheet against the drawing grid it is supposed to be set on.
//
// A Development project sheet is the isMono branch of the Chapter screen. It has to read like the
// Development landing: one 22-column, 44px-row hairline grid where every module is placed by an
// explicit column and row span, heights come from row counts rather than aspect ratios, and no
// margin pushes anything off a drawn line. The Research chapter keeps its prose layout, so the
// isSerif branch must still be the two-column body and must not have grown a drawing grid.
//
// Placement lives in SHEET_WIDE and SHEET_NARROW in the logic class, not in the markup, so the
// template must name a module and read its span back. That is what most of this file guards: a
// module added to the template without an entry in both tables, an entry that falls off the grid,
// and two modules laid over one another are all failures here rather than in the browser.
//
// Run with `npm run check`. Exits non-zero and prints every failure it found.

import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const SRC = 'design/Portfolio.dc.html';
const COLUMNS = 22; // grid lines run 1..COLUMNS+1
const RESERVED = ['heroReadout', 'detailReadout']; // renderVals puts these on the same object
// Modules the template names that no table places by hand: renderVals works each one out from the
// modules it stands in for. `detail` is the single plate an entry may carry instead of the
// detailA/detailB pair, and it takes the columns the pair spanned and the rows its picture needs.
// tools/check-dev-plates.mjs holds the geometry that comes out; this file holds the relationship.
const DERIVED = { detail: ['detailA', 'detailB'] };

const failures = [];
const fail = (msg) => failures.push(msg);

const src = readFileSync(SRC, 'utf8');
const openMatch = /<x-dc(?:\s[^>]*)?>/.exec(src);
const closeAt = src.lastIndexOf('</x-dc>');
if (!openMatch || closeAt < 0) {
  console.error('check-sheet-grid: no <x-dc> block in ' + SRC);
  process.exit(1);
}
const templateSrc = src.slice(openMatch.index + openMatch[0].length, closeAt);
const logicSrc = src.slice(closeAt);

const dom = new JSDOM('<!doctype html><body></body>');
const tpl = dom.window.document.createElement('template');
tpl.innerHTML = templateSrc;

// ---------------------------------------------------------------- style helpers

const declarations = (style) =>
  String(style || '').split(';').map((d) => d.trim()).filter(Boolean).map((d) => {
    const i = d.indexOf(':');
    return i < 0 ? [d.toLowerCase(), ''] : [d.slice(0, i).trim().toLowerCase(), d.slice(i + 1).trim()];
  });
const styleOf = (el) => el.getAttribute('style') || '';
const declares = (el, prop) => declarations(styleOf(el)).some(([p]) => p === prop);
const declared = (el, prop) => {
  const hit = declarations(styleOf(el)).filter(([p]) => p === prop).pop();
  return hit ? hit[1] : null;
};
const tight = (s) => String(s || '').replace(/\s+/g, '');
const where = (el) => {
  const name = el.tagName.toLowerCase();
  const mark = el.getAttribute('data-morph') || el.getAttribute('data-shape') ||
    (declared(el, 'grid-column') ? 'grid-column:' + declared(el, 'grid-column') : '');
  return mark ? name + ' [' + mark + ']' : name;
};

// ---------------------------------------------------------------- placement tables

// The tables are plain literals on purpose, so they can be read without running the logic class.
function readTable(name) {
  const at = logicSrc.indexOf('  ' + name + ' = {');
  if (at < 0) { fail('the logic class has no ' + name + ' placement table'); return null; }
  const end = logicSrc.indexOf('\n  };', at);
  if (end < 0) { fail(name + ' is not closed with "  };" so it cannot be read'); return null; }
  const body = logicSrc.slice(at, end);
  const table = {};
  const entry = /^\s*([A-Za-z_$][\w$]*):\s*\{\s*col:\s*'([^']*)',\s*row:\s*'([^']*)'\s*\},?\s*$/;
  for (const line of body.split('\n').slice(1)) {
    if (!line.trim()) continue;
    const m = entry.exec(line);
    if (!m) { fail(name + ' has a line this check cannot read, so a module could hide in it: ' + line.trim()); continue; }
    if (table[m[1]]) fail(name + ' names ' + m[1] + ' twice');
    table[m[1]] = { col: m[2], row: m[3] };
  }
  if (!Object.keys(table).length) fail(name + ' is empty');
  return table;
}

const span = (s) => {
  const m = /^\s*(\d+)\s*\/\s*(\d+)\s*$/.exec(s);
  return m ? [parseInt(m[1], 10), parseInt(m[2], 10)] : null;
};

function validateTable(name, table) {
  if (!table) return;
  const boxes = [];
  for (const [mod, at] of Object.entries(table)) {
    if (RESERVED.includes(mod)) fail(name + '.' + mod + ' uses a name renderVals reserves on the same object (' + RESERVED.join(', ') + ')');
    const c = span(at.col), r = span(at.row);
    if (!c) { fail(name + '.' + mod + ' has a column span this check cannot read: ' + JSON.stringify(at.col)); continue; }
    if (!r) { fail(name + '.' + mod + ' has a row span this check cannot read: ' + JSON.stringify(at.row)); continue; }
    if (c[0] < 1 || c[1] > COLUMNS + 1) fail(name + '.' + mod + ' runs off the ' + COLUMNS + ' column grid: columns ' + at.col);
    if (c[0] >= c[1]) fail(name + '.' + mod + ' has an empty or reversed column span: ' + at.col);
    if (r[0] < 1) fail(name + '.' + mod + ' starts above row 1: ' + at.row);
    if (r[0] >= r[1]) fail(name + '.' + mod + ' has an empty or reversed row span: ' + at.row);
    boxes.push([mod, c, r]);
  }
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const [a, ac, ar] = boxes[i], [b, bc, br] = boxes[j];
      if (ac[0] < bc[1] && bc[0] < ac[1] && ar[0] < br[1] && br[0] < ar[1]) {
        fail(name + ' lays ' + a + ' and ' + b + ' over the same cells (' + a + ' at ' + ac.join('/') + ' x ' + ar.join('/') + ')');
      }
    }
  }
}

const wide = readTable('SHEET_WIDE');
const narrow = readTable('SHEET_NARROW');
validateTable('SHEET_WIDE', wide);
validateTable('SHEET_NARROW', narrow);

// ---------------------------------------------------------------- locate the two chapter bodies

const chapterBlock = (cond) =>
  [...tpl.content.querySelectorAll('sc-if')].find(
    (el) => tight(el.getAttribute('value')) === '{{' + cond + '}}' &&
      el.querySelector('main[data-screen-label="Chapter"]'));

const mono = chapterBlock('isMono');
const serif = chapterBlock('isSerif');

if (!mono) fail('no <sc-if value="{{ isMono }}"> block holding a main[data-screen-label="Chapter"]: the Development sheet is still sharing the Research chapter markup');
if (!serif) fail('no <sc-if value="{{ isSerif }}"> block holding a main[data-screen-label="Chapter"]: the Research chapter body is missing');

// ---------------------------------------------------------------- the sheet's grid

const bound = new Set();

if (mono) {
  const main = mono.querySelector('main[data-screen-label="Chapter"]');
  if (main.getAttribute('key') !== '{{ chapterKey }}') fail('the sheet main lost key="{{ chapterKey }}"');

  const grid = [...main.querySelectorAll('*')].find((el) => tight(styleOf(el)).includes('repeat(22,1fr)'));
  if (!grid) {
    fail('the sheet has no 22-column grid: no element under the isMono main declares grid-template-columns:repeat(22,1fr)');
  } else {
    const g = tight(styleOf(grid));
    if (!g.includes('grid-auto-rows:44px')) fail('the sheet grid does not set grid-auto-rows:44px');
    if (!g.includes('gap:0')) fail('the sheet grid does not set gap:0');
    if (!g.includes('position:relative')) fail('the sheet grid is not positioned, so nothing laid over it could measure against it');

    // Grid items are the placed modules. sc-if / sc-for only wrap them, so look through those; an
    // absolutely positioned child would be an overlay, not a module, and would take no cell.
    const items = [], overlays = [];
    const collect = (parent) => {
      for (const child of parent.children) {
        const tag = child.tagName.toLowerCase();
        if (tag === 'sc-if' || tag === 'sc-for') collect(child);
        else if (tight(styleOf(child)).includes('position:absolute')) overlays.push(child);
        else items.push(child);
      }
    };
    collect(grid);
    if (!items.length) fail('the sheet grid has no modules');

    const BIND = /^\{\{\s*sheet\.([A-Za-z_$][\w$]*)\.(col|row|delay)\s*\}\}$/;
    for (const item of items) {
      const col = declared(item, 'grid-column'), row = declared(item, 'grid-row');
      const mc = col && BIND.exec(col), mr = row && BIND.exec(row);
      if (!col) fail('module without grid-column: ' + where(item));
      else if (!mc || mc[2] !== 'col') fail('module places itself instead of naming a placement entry: grid-column is ' + JSON.stringify(col) + ', expected {{ sheet.<name>.col }} on ' + where(item));
      if (!row) fail('module without grid-row: ' + where(item));
      else if (!mr || mr[2] !== 'row') fail('module places itself instead of naming a placement entry: grid-row is ' + JSON.stringify(row) + ', expected {{ sheet.<name>.row }} on ' + where(item));
      if (mc && mr && mc[1] !== mr[1]) fail('module reads its column from sheet.' + mc[1] + ' and its row from sheet.' + mr[1]);
      const name = mc ? mc[1] : mr ? mr[1] : null;
      if (name) {
        bound.add(name);
        const from = DERIVED[name];
        if (from) {
          // a derived module is not placed by hand: renderVals works it out from the modules it
          // stands in for, so it must not be in the tables and they must be
          for (const table of [['SHEET_WIDE', wide], ['SHEET_NARROW', narrow]]) {
            if (!table[1]) continue;
            if (table[1][name]) fail(table[0] + ' places ' + name + ', which renderVals derives from ' + from.join(' and '));
            for (const src of from) if (!table[1][src]) fail('the template binds the derived sheet.' + name + ' but ' + table[0] + ' has no ' + src + ' to derive it from');
          }
        } else {
          if (wide && !wide[name]) fail('the template binds sheet.' + name + ' but SHEET_WIDE has no entry for it');
          if (narrow && !narrow[name]) fail('the template binds sheet.' + name + ' but SHEET_NARROW has no entry for it');
        }
      }

      const margin = declared(item, 'margin');
      if (margin !== null && !/^0(px)?$/.test(margin)) {
        fail('module with a margin other than 0 (modules are separated by empty cells, not margins): ' + where(item) + ' has margin:' + margin);
      }
      // a tag the user-agent gives a margin has to zero it, or the module floats off its cell
      const UA_MARGIN = ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'figure', 'ol', 'ul', 'dl', 'blockquote', 'pre', 'hr'];
      if (UA_MARGIN.includes(item.tagName.toLowerCase()) && margin === null && !tight(styleOf(item)).includes('all:unset')) {
        fail('module carries the user-agent margin for its tag and never zeroes it: ' + where(item));
      }

      const cls = (item.getAttribute('class') || '').split(/\s+/);
      if (!cls.includes('sheet-mod')) fail('module is not a sheet-mod, so it draws no hairline frame: ' + where(item));
      // a frame that lights up says "click me". Only the controls are allowed to say it
      if (cls.includes('sheet-ctl') && item.tagName.toLowerCase() !== 'button') {
        fail('sheet-ctl brings the frame to full ink on hover, so it belongs on a control, not on ' + where(item));
      }
      if (!cls.includes('sheet-ctl') && item.tagName.toLowerCase() === 'button') {
        fail('control without sheet-ctl, so it gives no hover feedback: ' + where(item));
      }

      // the plot-in: data-enter is what the IntersectionObserver watches, --d is the module's stagger
      if (item.getAttribute('data-enter') !== '') fail('module is not plotted in (needs data-enter=""): ' + where(item));
      const d = declared(item, '--d');
      const md = d && BIND.exec(d);
      if (!d) fail('module has no --d, so it plots in with no stagger: ' + where(item));
      else if (!md || md[2] !== 'delay') fail('module sets --d to ' + JSON.stringify(d) + ' instead of {{ sheet.<name>.delay }} on ' + where(item));
      else if (name && md[1] !== name) fail('module places itself from sheet.' + name + ' but takes its stagger from sheet.' + md[1]);
    }

    // Every pane of the sheet's own text answers the cursor. TextRippling flattens the markup it is
    // handed, so a pane must be an element whose whole content is one colour and one binding, and it
    // must be keyed to the sheet or the effect would survive a change of sheet holding stale glyphs.
    const PANES = [
      ['kicker', '{{ current.kickerWord }}'], ['title', '{{ current.title }}'], ['lede', '{{ current.subtitle }}'],
      ['spec sheet', '{{ current.ghost }}'], ['spec role', '{{ current.role }}'], ['spec with', '{{ current.with }}'],
      ['spec status', '{{ current.status }}'], ['spec rev', '{{ current.year }} · 1:1'],
      ['hero caption', '{{ current.caption }}'], ['detail caption', '{{ current.detailCaptionText }}'],
      ['note 01', '{{ current.body1Full }}'], ['note 02', '{{ current.body2 }}'], ['note 03', '{{ current.body3 }}'],
      ['marginalia', '{{ current.margin }}'], ['stack', '{{ current.stack }}'], ['status', '{{ current.status }}'],
      ['pages', '{{ current.pages }}'], ['link', '{{ current.link }}'], ['next title', '{{ next.title }}'],
    ];
    const KEYED = /\{\{\s*(current|next)\.(figNo|numeral)\s*\}\}/;
    const trEls = [...grid.querySelectorAll('[data-tr]')];
    for (const el of trEls) {
      if (el.getAttribute('data-reg') !== 'mono') fail('a text pane asks for the serif effect on a mono sheet: data-reg is ' + JSON.stringify(el.getAttribute('data-reg')) + ' on ' + where(el));
      const k = el.getAttribute('key');
      if (!k || !KEYED.test(k)) fail('a text pane is not keyed to the sheet, so its glyphs would outlive it: key is ' + JSON.stringify(k) + ' on "' + el.textContent.trim().slice(0, 30) + '"');
      if (el.children.length > 1) fail('a text pane holds more than one run, and the effect would flatten the rest away: "' + el.innerHTML.trim().slice(0, 60) + '"');
      // the effect reads a pane's resting colour back off the computed style with a regex, and Chrome
      // serialises any color-mix as "color(srgb 0.95 ...)", which that regex reads as black. A pane
      // whose nearest colour is a color-mix renders its own text almost invisible away from the wave.
      for (let n = el; n && n !== grid; n = n.parentElement) {
        const c = declared(n, 'color');
        if (c === null) continue;
        if (/color-mix/.test(c)) fail('a text pane takes its colour from a color-mix (' + c + '), which the effect reads as black: "' + el.textContent.trim().slice(0, 30) + '"');
        break;
      }
    }
    for (const [label, needle] of PANES) {
      if (!trEls.some((el) => el.textContent.includes(needle) || el.innerHTML.includes(needle))) {
        fail('the ' + label + ' pane has no data-tr, so the cursor passes over it: expected a data-tr element holding ' + JSON.stringify(needle));
      }
    }
    // the readout is live state, not the sheet's ink: rippling it would fight its own updates
    for (const el of trEls) {
      if (/sheet\.(hero|detail)Readout/.test(el.innerHTML)) fail('the coordinate readout carries data-tr; it changes per cell and the effect would rebuild under it');
    }

    // nothing sits out of the grid's flow: the full-sheet guide lines the plate hover once threw were
    // dropped because they read as a stray boundary through the text, and a hover lights only its own frame
    for (const o of overlays) fail('an absolutely positioned child sits over the grid out of flow: ' + where(o));

    for (const el of [grid, ...grid.querySelectorAll('*')]) {
      if (declares(el, 'aspect-ratio')) {
        fail('aspect-ratio inside the sheet grid (figure heights come from row spans): ' + where(el));
      }
    }
  }

  // the transitions from the Development landing find the sheet through these hooks
  const html = main.outerHTML;
  const hooks = [
    ['data-morph="title-{{ current.figNo }}"', 'title morph'],
    ['data-morph="lede-{{ current.figNo }}"', 'lede morph'],
    ['data-tr="wake"', 'text-rippling wake'],
    ['data-reg="mono"', 'text-rippling register'],
    ['data-shape="frame-{{ current.figNo }}"', 'hero frame shape'],
    ['id="{{ current.heroSlotId }}"', 'hero image slot'],
    ['id="{{ current.detailSlotA }}"', 'detail slot A'],
    ['id="{{ current.detailSlotB }}"', 'detail slot B'],
    ['{{ goPageCurrent }}', 'back binding'],
    ['{{ openNext }}', 'next binding'],
    ['{{ sheet.hero.move }}', 'hero plate pointer readout'],
    ['{{ sheet.detailA.move }}', 'detail A pointer readout'],
    ['{{ sheet.detailB.move }}', 'detail B pointer readout'],
    ['{{ sheet.heroReadout }}', 'hero caption readout'],
    ['{{ sheet.detailReadout }}', 'detail caption readout'],
  ];
  for (const [needle, label] of hooks) {
    if (!html.includes(needle)) fail('the sheet lost its ' + label + ' hook (' + needle + ')');
  }
}

// a placement entry nothing binds is a module that was deleted and left behind
for (const [name, table] of [['SHEET_WIDE', wide], ['SHEET_NARROW', narrow]]) {
  if (!table) continue;
  for (const mod of Object.keys(table)) {
    if (!bound.has(mod)) fail(name + '.' + mod + ' places a module the template never binds');
  }
}

// ---------------------------------------------------------------- the chapter keeps its prose

if (serif) {
  const html = tight(serif.innerHTML);
  if (!html.includes('columns:2')) fail('the Research chapter lost its two-column body (columns:2)');
  if (html.includes('repeat(22,1fr)')) fail('the Research chapter grew the drawing grid; it keeps the prose layout');
}

// ---------------------------------------------------------------- report

if (failures.length) {
  console.error('check-sheet-grid: ' + failures.length + ' failure' + (failures.length === 1 ? '' : 's'));
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
console.log('check-sheet-grid: ' + bound.size + ' modules, both placement tables agree, and the Research chapter is untouched');
