// Checks the Development landing's desktop composition against the drawing grid it is set on.
//
// At 1000px and above the landing is a full-bleed 22-column, 44px-row sheet: the statement and the
// platform take the top left corner, the three contact cells take the bottom right, and every
// project is a plate drawn onto a random whole-cell position by landing-grid.js. Nothing about a
// plate's position is written in the markup, so the browser is the only place a bad placement would
// show. This check is the earlier place: it runs the real placement over the viewport sizes the page
// is used at, reads the hand-placed corner blocks out of LANDING_WIDE, and holds the template to
// carrying both landings.
//
// A plate answers to one of two authorities here, and which one is the whole of the difference
// between a drawn plate and a pinned one. A drawn plate is the draw's to place and the draw's to
// size, so it is held to the sizes the draw may choose from: PLATE_VOCAB, and FIRST_PLATE for the
// platform's own plate. A pinned plate is held to its pin instead, all four numbers of it, position
// and size alike. The vocabulary is deliberately not asked of a pin: LANDING_PINS is composed in the
// tuning panel behind ?dev, a plate is resized there by dragging its handles, and what that writes is
// the pin's own span. Holding a pin to the four drawn sizes would refuse every composition the panel
// exists to make, while checking nothing the pin comparison does not already check.
//
// Run with `npm run check`. Exits non-zero and prints every failure it found.

import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { placeLanding, PLATE_VOCAB, FIRST_PLATE } from '../landing-grid.js';
import { monoEntries, slugOf, readKeyedTable } from './dc-data.mjs';

const SRC = 'design/Portfolio.dc.html';
const COLUMNS = 22; // grid lines run 1..COLUMNS+1
const HEADER = 57; // the sticky header, so the first visible row starts under it
const ROW = 44;
const SLUGS = monoEntries().map(slugOf); // the plates in the order the register lists them
const PLATES = SLUGS.length; // the entries that route to the mono register

const failures = [];
const fail = (msg) => failures.push(msg);

const src = readFileSync(SRC, 'utf8');
const openMatch = /<x-dc(?:\s[^>]*)?>/.exec(src);
const closeAt = src.lastIndexOf('</x-dc>');
if (!openMatch || closeAt < 0) {
  console.error('check-landing-grid: no <x-dc> block in ' + SRC);
  process.exit(1);
}
const templateSrc = src.slice(openMatch.index + openMatch[0].length, closeAt);
const logicSrc = src.slice(closeAt);

// ---------------------------------------------------------------- the placement table

// LANDING_WIDE is a plain literal for the same reason SHEET_WIDE is: it can be read without running
// the logic class. One of its rows is not a span but a word: the three contact cells read 'last', the
// grid's final row, known only once the placement has grown the sheet to hold every plate. Every
// other row here is a span chosen like any other, the corner block included.
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

const wide = readTable('LANDING_WIDE');
const NEEDED = ['statement', 'platform', 'contactEmail', 'contactGithub', 'contactCv'];
let corner = null;

if (wide) {
  for (const name of NEEDED) if (!wide[name]) fail('LANDING_WIDE has no ' + name + ' entry');
  for (const [name, at] of Object.entries(wide)) {
    if (!NEEDED.includes(name)) fail('LANDING_WIDE places ' + name + ', which the desktop landing does not know about');
    const c = span(at.col);
    if (!c) { fail('LANDING_WIDE.' + name + ' has a column span this check cannot read: ' + JSON.stringify(at.col)); continue; }
    if (c[0] < 1 || c[1] > COLUMNS + 1) fail('LANDING_WIDE.' + name + ' runs off the ' + COLUMNS + ' column grid: columns ' + at.col);
    if (c[0] >= c[1]) fail('LANDING_WIDE.' + name + ' has an empty or reversed column span: ' + at.col);
  }

  // the corner blocks: the statement opens the sheet at its first cell and the platform stands
  // beside it on the same rows, with no empty column between the two
  const st = wide.statement && span(wide.statement.col);
  const pf = wide.platform && span(wide.platform.col);
  if (st && st[0] !== 1) fail('the statement does not open the sheet at column 1: ' + wide.statement.col);
  // The corner block is a fixed span, and the two modules that make it are the same span: it opens at
  // row 1 and it is as deep as the table says, on every screen. That is what a pin can be composed
  // against. A depth measured off the reader's own type would be a different block per browser, and a
  // pin clear of it on one screen would stand on it on the next.
  const sr = wide.statement && span(wide.statement.row);
  const pr = wide.platform && span(wide.platform.row);
  for (const [name, r] of [['statement', sr], ['platform', pr]]) {
    const e = wide[name]; if (!e) continue;
    if (!r) fail('LANDING_WIDE.' + name + ' has a row span this check cannot read: ' + JSON.stringify(e.row) +
      '; the corner block is a fixed span now, not a word the page measures');
    else if (r[0] !== 1) fail('LANDING_WIDE.' + name + ' does not open the sheet at row 1: ' + e.row);
    else if (r[1] <= r[0]) fail('LANDING_WIDE.' + name + ' has an empty or reversed row span: ' + e.row);
  }
  if (sr && pr && (sr[0] !== pr[0] || sr[1] !== pr[1])) {
    fail('the statement and the platform are not the same depth (' + wide.statement.row + ' and ' + wide.platform.row +
      '); they are one block to the placement and a plate keeps its empty cell from the pair');
  }
  if (st && pf && pf[0] !== st[1]) fail('the platform does not take the column the statement leaves off at: statement ends at ' + st[1] + ', platform starts at ' + pf[0]);
  if (st && pf && sr) corner = { col: st[0], w: pf[1] - st[0], row: sr[0], h: sr[1] - sr[0] };

  // the contact cells close the sheet in the bottom right corner, three two-column cells running to
  // the last grid line, each on the row the placement ends on
  const CONTACT = [['contactEmail', '17 / 19'], ['contactGithub', '19 / 21'], ['contactCv', '21 / 23']];
  for (const [name, want] of CONTACT) {
    const e = wide[name];
    if (!e) continue;
    if (e.col.replace(/\s+/g, ' ').trim() !== want) fail('LANDING_WIDE.' + name + ' is not in the bottom right corner: columns ' + e.col + ', expected ' + want);
    if (e.row !== 'last') fail('LANDING_WIDE.' + name + " takes a fixed row (" + e.row + "); the contact band sits on the grid's last row, written 'last'");
  }
}

// ---------------------------------------------------------------- the pins

// A plate is normally drawn onto a free cell, and LANDING_PINS is the table that says which plates
// are not: an entry named there, by the slug its address uses, takes those cells exactly and the draw
// arranges what is left around it. Two things about a pin are worth guarding here rather than in the
// browser. A pin names an entry, and an entry can be renamed or removed, at which point the pin
// silently stops applying; and a pin takes cells away from the draw, so a set of them can leave the
// remaining plates nowhere to go, which the page shows only as a landing with no plates on it.
let shipped = {};
try {
  const pins = readKeyedTable('LANDING_PINS', logicSrc);
  for (const [slug, at] of Object.entries(pins)) {
    const i = SLUGS.indexOf(slug);
    if (i < 0) { fail('LANDING_PINS pins ' + slug + ', which is not a Development entry: the pin applies to nothing'); continue; }
    const c = span(at.col), r = span(at.row);
    if (!c || !r) { fail('LANDING_PINS.' + slug + ' has a span this check cannot read: ' + JSON.stringify(at)); continue; }
    shipped[i] = { col: c[0], row: r[0], w: c[1] - c[0], h: r[1] - r[0] };
  }
} catch (e) {
  fail('LANDING_PINS cannot be read: ' + e.message);
}

// ---------------------------------------------------------------- the placement itself

const VIEWPORTS = [[1000, 700], [1280, 720], [1366, 768], [1440, 900], [1920, 1080], [2560, 1440]];
const SEEDS = Array.from({ length: 50 }, (_, i) => i);
// The corner block's depth is the span LANDING_WIDE writes, so there is one of it and this check runs
// that one rather than a range. It used to be the statement's measured type, which is why there was a
// range at all: the block was a different depth on every width, and the sweep had to cover every
// depth it might measure out to. A fixed block is the same block everywhere, so the only thing left
// varying across the viewports below is how many rows the screen shows.
const STATEMENT_ROWS = corner ? corner.h : 8;

const contactSpec = wide && wide.contactEmail && wide.contactCv
  ? { col: span(wide.contactEmail.col)[0], w: span(wide.contactCv.col)[1] - span(wide.contactEmail.col)[0] }
  : { col: 17, w: 6 };
const cornerAt = (h) => (corner ? { col: corner.col, row: corner.row, w: corner.w, h } : { col: 1, row: 1, w: 17, h });
let reserved = [cornerAt(STATEMENT_ROWS)];

const boxes = (out) => {
  const all = out.plates.map((p, i) => ['plate ' + i, p]);
  for (const r of reserved) all.push(['reserved', r]);
  if (out.contact) all.push(['contact', { col: out.contact.col, row: out.contact.row, w: out.contact.w, h: 1 }]);
  return all;
};
const gapped = (a, b) => // true when the two boxes are apart by at least one empty cell
  a.col + a.w < b.col || b.col + b.w < a.col || a.row + a.h < b.row || b.row + b.h < a.row;
const overlaps = (a, b) =>
  a.col < b.col + b.w && b.col < a.col + a.w && a.row < b.row + b.h && b.row < a.row + a.h;

let worst = 0, checked = 0;
for (const [w, h] of VIEWPORTS) {
  const rows = Math.max(6, Math.floor((h - HEADER) / ROW));
  const stRows = STATEMENT_ROWS;
  reserved = [cornerAt(stRows)];
  for (const seed of SEEDS) {
    const args = { seed, cols: COLUMNS, rows, count: PLATES, reserved, contact: contactSpec, pins: shipped };
    let out;
    try { out = placeLanding(args); } catch (e) {
      fail(w + 'x' + h + ' statement ' + stRows + ' rows, seed ' + seed + ': the placement gave up (' + e.message + ')');
      continue;
    }
    checked++;
    const at = w + 'x' + h + ' statement ' + stRows + ' rows, seed ' + seed + ': ';
    // A pin is a claim on cells, so a pinned plate that came back anywhere else is the whole point of
    // pinning gone, not a near miss. All four numbers are compared, size as well as position, and
    // this is the only place a pinned plate's size is held to anything: its span is the whole of what
    // that plate is allowed to be.
    for (const [i, p] of Object.entries(shipped)) {
      const got = out.plates[i];
      if (!got) { fail(at + 'plate ' + i + ' is pinned and was not placed at all'); continue; }
      if (got.col !== p.col || got.row !== p.row || got.w !== p.w || got.h !== p.h) {
        fail(at + SLUGS[i] + ' is pinned to ' + p.col + ',' + p.row + ' ' + p.w + 'x' + p.h + ' and came back at ' + got.col + ',' + got.row + ' ' + got.w + 'x' + got.h);
      }
      if (!got.pinned) fail(at + SLUGS[i] + ' came back from the draw rather than from its pin');
    }
    if (out.rows < rows) fail(at + 'the placement returned fewer rows (' + out.rows + ') than the screen shows (' + rows + ')');
    worst = Math.max(worst, out.rows - rows);
    if (out.plates.length !== PLATES) fail(at + 'placed ' + out.plates.length + ' plates, not ' + PLATES);
    // The vocabulary is what the draw may choose from, so it is asked only of the plates the draw
    // placed. A pinned plate carries its own size on purpose: the tuning panel resizes a plate by
    // dragging its handles, and what that writes is the pin's own span. Holding a pin to the four
    // drawn sizes would refuse every composition made with the panel, which is the opposite of the
    // point. The size of a pinned plate is checked all the same, against its pin, a few lines above.
    const [fw, fh] = FIRST_PLATE;
    if (out.plates[0] && !out.plates[0].pinned && (out.plates[0].w !== fw || out.plates[0].h !== fh)) {
      fail(at + 'the first plate is ' + out.plates[0].w + 'x' + out.plates[0].h + ', not the ' + fw + 'x' + fh + ' the platform sheet takes');
    }
    for (let i = 1; i < out.plates.length; i++) {
      const p = out.plates[i];
      if (p.pinned) continue;
      if (!PLATE_VOCAB.some(([vw, vh]) => vw === p.w && vh === p.h)) {
        fail(at + 'plate ' + i + ' is ' + p.w + 'x' + p.h + ', a size the vocabulary does not carry');
      }
    }
    for (const [name, b] of boxes(out)) {
      for (const v of ['col', 'row', 'w', 'h']) {
        if (!Number.isInteger(b[v])) fail(at + name + ' has a fractional ' + v + ': ' + b[v]);
      }
      if (b.col < 1 || b.col + b.w > COLUMNS + 1) fail(at + name + ' runs off the ' + COLUMNS + ' column grid: ' + b.col + ' / ' + (b.col + b.w));
      if (b.row < 1 || b.row + b.h > out.rows + 1) fail(at + name + ' runs off the ' + out.rows + ' row grid: ' + b.row + ' / ' + (b.row + b.h));
    }
    if (out.contact && out.contact.row !== out.rows) fail(at + 'the contact band is on row ' + out.contact.row + ', not the last row (' + out.rows + ')');
    const all = boxes(out);
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const [an, a] = all[i], [bn, b] = all[j];
        if (an === 'reserved' && bn === 'reserved') continue; // the corner blocks stand shoulder to shoulder
        if (overlaps(a, b)) fail(at + an + ' and ' + bn + ' lie over the same cells');
        else if (!gapped(a, b)) fail(at + an + ' and ' + bn + ' touch: modules are separated by at least one empty cell');
      }
    }
    const again = placeLanding(args);
    if (JSON.stringify(again) !== JSON.stringify(out)) fail(at + 'the placement is not deterministic: two runs of the same seed differ');
  }
}

// ---------------------------------------------------------------- pinning, exercised

// LANDING_PINS ships empty, so the sweep above proves nothing about pinning until the day someone
// pins a plate. These run the pin path on purpose: what a pin is supposed to do, and what the four
// ways of writing a bad one are supposed to say. The last of them is the property the tuning panel's
// "pin all" leans on, that claiming every plate exactly where the draw has just left it changes
// nothing, which is what lets a person compose against ground that holds still.
{
  const rows = Math.max(6, Math.floor((900 - HEADER) / ROW));
  // boxes() reads the corner block off the same module-level `reserved` the sweep above was moving,
  // so this block sets it rather than keeping a second one: comparing a placement against a corner it
  // was not placed around reports touches that are not there
  const held = [cornerAt(STATEMENT_ROWS)];
  reserved = held;
  const run = (pins, note) => {
    const args = { seed: 7, cols: COLUMNS, rows, count: PLATES, reserved: held, contact: contactSpec, pins };
    try { return placeLanding(args); } catch (e) { fail('pinning, ' + note + ': ' + e.message); return null; }
  };
  const refuses = (pins, note, needle) => {
    try {
      placeLanding({ seed: 7, cols: COLUMNS, rows, count: PLATES, reserved: held, contact: contactSpec, pins });
      fail('pinning, ' + note + ': the placement took it without complaint');
    } catch (e) {
      if (!e.message.includes(needle)) fail('pinning, ' + note + ': said "' + e.message + '", which does not mention ' + JSON.stringify(needle));
    }
  };

  // a pin is honoured exactly, and the draw arranges the rest around it
  const two = { 2: { col: 2, row: 15, w: 3, h: 3 }, 5: { col: 8, row: 15, w: 4, h: 3 } };
  const out = run(two, 'two plates pinned low on the sheet');
  if (out) {
    for (const [i, p] of Object.entries(two)) {
      const got = out.plates[i];
      if (!got || got.col !== p.col || got.row !== p.row || got.w !== p.w || got.h !== p.h || !got.pinned) {
        fail('pinning: plate ' + i + ' was pinned to ' + p.col + ',' + p.row + ' and came back as ' + JSON.stringify(got));
      }
    }
    if (out.plates.filter(Boolean).length !== PLATES) fail('pinning: the draw placed ' + out.plates.filter(Boolean).length + ' of ' + PLATES + ' plates around two pins');
    const all = boxes(out);
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const [an, a] = all[i], [bn, b] = all[j];
        if (an === 'reserved' && bn === 'reserved') continue;
        if (overlaps(a, b)) fail('pinning: ' + an + ' and ' + bn + ' lie over the same cells');
        else if (!gapped(a, b)) fail('pinning: ' + an + ' and ' + bn + ' touch with no empty cell between them');
      }
    }
  }

  // the four ways of writing a pin nobody can draw. Each has to be named rather than left to grow
  // the sheet eighty rows and give up, because the landing renders no plates when it does and that
  // looks like a page that failed to load
  refuses({ 2: { col: 2, row: 15, w: 3, h: 3 }, 5: { col: 3, row: 16, w: 3, h: 3 } }, 'two pins over the same cells', 'claim the same cells');
  refuses({ 2: { col: 2, row: 15, w: 3, h: 3 }, 5: { col: 5, row: 15, w: 3, h: 3 } }, 'two pins touching', 'claim the same cells');
  refuses({ 3: { col: 2, row: 2, w: 3, h: 3 } }, 'a pin on the statement block', 'statement block');
  refuses({ 99: { col: 2, row: 15, w: 3, h: 3 } }, 'a pin naming a plate that is not there', 'and there are');
  refuses({ 2: { col: 21, row: 15, w: 4, h: 3 } }, 'a pin off the right edge', 'off the ' + COLUMNS + ' column grid');

  // a pin below the sheet grows it, and the contact band stays on the last row
  const deep = run({ 4: { col: 2, row: rows + 12, w: 3, h: 3 } }, 'a pin below the fold');
  if (deep) {
    if (deep.rows < rows + 14) fail('pinning: a pin at row ' + (rows + 12) + ' left the sheet ' + deep.rows + ' rows tall, with no room for it and the contact band');
    if (deep.contact && deep.contact.row !== deep.rows) fail('pinning: the contact band is on row ' + deep.contact.row + ', not the last row (' + deep.rows + ')');
  }

  // pin all: every plate claimed where the draw left it draws the same sheet back
  const drawn = run({}, 'nothing pinned');
  if (drawn) {
    const every = {};
    drawn.plates.forEach((p, i) => { every[i] = { col: p.col, row: p.row, w: p.w, h: p.h }; });
    const again = run(every, 'every plate pinned where it was drawn');
    if (again) {
      const shape = (o) => JSON.stringify(o.plates.map((p) => [p.col, p.row, p.w, p.h]));
      if (shape(again) !== shape(drawn)) fail('pinning: claiming every plate where the draw left it moved the composition');
      if (again.rows !== drawn.rows) fail('pinning: claiming every plate changed the sheet from ' + drawn.rows + ' rows to ' + again.rows);
      if (!again.plates.every((p) => p.pinned)) fail('pinning: a plate pinned to its own cell still came back from the draw');
    }
  }
}

// ---------------------------------------------------------------- dev mode: a frozen sheet

// The tuning panel behind ?dev pins every plate where the draw has just left it, the moment it
// mounts, so that composing moves the pin and nothing else on the sheet. From there a drag crosses a
// neighbour on the way to wherever it is going, and under the strict reading that is a composition
// nobody can draw: placeLanding throws, the landing renders no plates, and the plate under the cursor
// disappears mid-move. So the page asks for strict: false while it is being tuned. A pin is still
// read for what is true of any pin, whole cells and on the grid, and is then taken as written,
// overlaps and all. The licence stops there: the plates still left to the draw keep their empty cell
// from everything already on the sheet.
{
  const rows = Math.max(6, Math.floor((900 - HEADER) / ROW));
  const held = [cornerAt(STATEMENT_ROWS)];
  reserved = held;
  // plate 5 lies over plate 2, and plate 9 touches plate 7 with no empty cell between them: the two
  // shapes the strict reading refuses by name
  const crossed = {
    2: { col: 2, row: 15, w: 3, h: 3 },
    5: { col: 3, row: 16, w: 3, h: 3 },
    7: { col: 8, row: 15, w: 4, h: 3 },
    9: { col: 12, row: 15, w: 3, h: 3 },
  };
  const args = { seed: 7, cols: COLUMNS, rows, count: PLATES, reserved: held, contact: contactSpec, pins: crossed };
  try {
    placeLanding({ ...args });
    fail('dev mode: the strict reading took four crossed pins without complaint');
  } catch (e) {
    if (!e.message.includes('claim the same cells')) {
      fail('dev mode: the strict reading refused four crossed pins with "' + e.message + '", which does not name the overlap');
    }
  }
  let loose = null;
  try { loose = placeLanding({ ...args, strict: false }); } catch (e) {
    fail('dev mode: strict: false still refused the crossed pins (' + e.message + '), so the landing goes blank under the panel');
  }
  if (loose) {
    for (const [i, p] of Object.entries(crossed)) {
      const got = loose.plates[i];
      if (!got || got.col !== p.col || got.row !== p.row || got.w !== p.w || got.h !== p.h || !got.pinned) {
        fail('dev mode: plate ' + i + ' was pinned to ' + p.col + ',' + p.row + ' and came back as ' + JSON.stringify(got));
      }
    }
    if (loose.plates.length !== PLATES || loose.plates.some((p) => !p)) {
      fail('dev mode: ' + loose.plates.filter(Boolean).length + ' of ' + PLATES + ' plates came back around four crossed pins');
    }
    const drawn = loose.plates.map((p, i) => ['plate ' + i, p]).filter(([, p]) => !p.pinned);
    const rest = [...loose.plates.filter((p) => p.pinned), ...held];
    for (const [name, a] of drawn) {
      for (const b of [...rest, ...drawn.map(([, x]) => x).filter((x) => x !== a)]) {
        if (!gapped(a, b)) fail('dev mode: ' + name + ' was drawn onto a cell something else already holds');
      }
    }
  }
  // strict: false is a licence to overlap and not a licence to write nonsense, so a pin off the grid
  // is refused either way: the panel can show that message, and cannot show a pin it cannot reach
  try {
    placeLanding({ ...args, strict: false, pins: { 2: { col: 21, row: 15, w: 4, h: 3 } } });
    fail('dev mode: strict: false took a pin running off the right edge');
  } catch (e) {
    if (!e.message.includes('off the ' + COLUMNS + ' column grid')) {
      fail('dev mode: strict: false refused an off-grid pin with "' + e.message + '", which does not name the edge');
    }
  }
}

// ---------------------------------------------------------------- the two landings

const dom = new JSDOM('<!doctype html><body></body>');
const tpl = dom.window.document.createElement('template');
tpl.innerHTML = templateSrc;
const tight = (s) => String(s || '').replace(/\s+/g, '');

const landing = [...tpl.content.querySelectorAll('sc-if')].find(
  (el) => tight(el.getAttribute('value')) === '{{isMonoPage}}');
if (!landing) fail('no <sc-if value="{{ isMonoPage }}"> block: the Development landing is gone');
else {
  const branch = (cond) => [...landing.querySelectorAll('sc-if')].find(
    (el) => tight(el.getAttribute('value')) === '{{' + cond + '}}' &&
      el.querySelector('main[data-screen-label="Development"]'));
  const narrowBranch = branch('isLandingNarrow');
  const wideBranch = branch('isLandingWide');
  if (!narrowBranch) fail('no <sc-if value="{{ isLandingNarrow }}"> branch holding a main[data-screen-label="Development"]: the stacked landing below 1000px is gone');
  if (!wideBranch) fail('no <sc-if value="{{ isLandingWide }}"> branch holding a main[data-screen-label="Development"]: the desktop landing was never placed');

  if (wideBranch) {
    const main = wideBranch.querySelector('main[data-screen-label="Development"]');
    const html = main.outerHTML;
    const grid = [...main.querySelectorAll('*')].find((el) => tight(el.getAttribute('style') || '').includes('repeat(22,1fr)'));
    if (!grid) fail('the desktop landing has no 22-column grid');
    else {
      const g = tight(grid.getAttribute('style') || '');
      if (!g.includes('grid-auto-rows:44px')) fail('the desktop landing grid does not set grid-auto-rows:44px');
      if (!g.includes('min-height:calc(100vh-57px)')) fail('the desktop landing grid does not stand at least calc(100vh - 57px) tall, so the hairlines stop short of the bottom edge');
      if (!g.includes('background-size:calc(100%/22)44px')) fail('the desktop landing grid does not rule itself on the 22 column, 44px module');
    }
    const mainStyle = tight(main.getAttribute('style') || '');
    if (/max-width:(?!none)/.test(mainStyle)) fail('the desktop landing main keeps a max-width, so the sheet does not run to the viewport edges: ' + main.getAttribute('style'));
    if (/padding:(?!0;|0$)/.test(mainStyle)) fail('the desktop landing main keeps padding, so the sheet does not run to the viewport edges: ' + main.getAttribute('style'));

    const plate = [...main.querySelectorAll('sc-for')].find((el) => tight(el.getAttribute('list') || '') === '{{landingPlates}}');
    if (!plate) fail('the desktop landing has no <sc-for list="{{ landingPlates }}">, so the plates are placed in the markup rather than by landing-grid.js');
    else {
      const hooks = [
        ['data-shape="card-{{ p.shapeIdx }}"', 'card shape'],
        ['data-shape="{{ p.frameShape }}"', 'frame shape'],
        ['data-shape-alt="frame-{{ p.figNo }}"', 'frame shape alt'],
        ['data-morph="{{ p.morphName }}"', 'title morph'],
        ['data-morph-alt="title-{{ p.figNo }}"', 'title morph alt'],
        ['id="{{ p.plateSlotId }}"', 'plate image slot'],
        ['{{ p.open }}', 'open binding'],
        ['{{ p.type }}', 'typewriter on hover'],
        ['{{ p.untype }}', 'typewriter off hover'],
        ['{{ p.typed }}', 'typed description'],
        // the typed panel hangs off the plate instead of covering it, so the picture and the title
        // stay readable under the cursor; which edge it hangs from is the model's call
        ['top:{{ p.whyTop }}', 'typed panel top edge'],
        ['bottom:{{ p.whyBottom }}', 'typed panel bottom edge'],
      ];
      const ph = plate.outerHTML;
      for (const [needle, label] of hooks) {
        if (!ph.includes(needle)) fail('the desktop plate lost its ' + label + ' hook (' + needle + ')');
      }
      if (!/grid-column:\{\{p\.col\}\}/.test(tight(ph))) fail('the desktop plate writes its own grid-column instead of reading it back from the placement');
      if (!/grid-row:\{\{p\.row\}\}/.test(tight(ph))) fail('the desktop plate writes its own grid-row instead of reading it back from the placement');

      // An element the transition finds no partner for is faded in from nothing for half a second, and
      // an animation's keyframes outrank the inline style while they run. So a data-morph element left
      // invisible on purpose does not stay invisible: it recites itself on the way in and snaps out
      // when the animation ends. Nothing on a plate may be both.
      for (const el of plate.querySelectorAll('[data-morph]')) {
        const s = tight(el.getAttribute('style') || '');
        if (/opacity:0[;:]?/.test(s) || /visibility:hidden/.test(s)) {
          fail('a plate holds a data-morph element it also hides (' + el.tagName.toLowerCase() + ' [' + el.getAttribute('data-morph') +
            ']): with no partner the transition fades it in anyway, so it would be read out over the plate on the way in');
        }
      }
    }

    for (const [needle, label] of [['{{ platformRef }}', 'platform box'], ['{{ contentsRef }}', 'contents anchor'], ['{{ platesRef }}', 'plates anchor'], ['{{ notesRef }}', 'notes anchor'], ['{{ landingStatementRef }}', 'statement measuring ref']]) {
      if (!html.includes(needle)) fail('the desktop landing lost its ' + label + ' (' + needle + ')');
    }
    // The module is a fixed block and the type is fitted into it, so the type has to be able to use
    // the whole of it: a measure cap would leave the block wider than its own type, and the lines
    // that no longer fit would be clamped away to leave an empty column beside them.
    const statement = main.querySelector('section');
    if (statement) {
      for (const el of [statement, ...statement.querySelectorAll('*')]) {
        const s = tight(el.getAttribute('style') || '');
        if (/max-width:\d/.test(s)) fail('the desktop statement caps its measure (' + el.tagName.toLowerCase() + ' has ' + /max-width:[^;]*/.exec(el.getAttribute('style'))[0] + '), so its type cannot fill the block it is fitted into');
      }
    }
  }
}

// ---------------------------------------------------------------- the morph namespaces

// The transition pairs an outgoing element with an incoming one by matching data-shape names, so
// every name is a key in one shared namespace. A chapter names its figure 'frame-<figNo>', the
// entry's global index zero-padded to two digits; a landing plate names its own frame for k, its
// position in the register. Those are different numbers, and while k stayed single-digit the padding
// kept them apart by accident: 'frame-2' is not 'frame-02'. At k = 10 the accident runs out and the
// twelfth plate spells 'frame-11', which is the figure name of the eleventh entry, so opening the
// Development landing made that entry's chapter plate fly into an unrelated plate. The stacked
// landing hid it because those cards sit far below the fold and the engine culls what it cannot see;
// the desktop landing puts all twelve on one screen. Hence this: a plate's own frame name stays out
// of the namespaces the engine already owns, and the entry-to-chapter pairing rides on the alt.
const frameShape = /frameShape:\s*([^,}]+)/.exec(logicSrc);
if (!frameShape) fail('the logic class no longer builds a frameShape for the landing plates');
else {
  const expr = frameShape[1];
  if (/'frame-'/.test(expr)) {
    fail("the landing plate's frame name is built in the 'frame-' namespace (" + expr.trim() +
      "), which chapters use for 'frame-<figNo>': at k >= 10 the two spell the same string and the " +
      'transition pairs a chapter figure with an unrelated plate');
  }
  if (/'card-'/.test(expr)) {
    fail("the landing plate's frame name is built in the 'card-' namespace (" + expr.trim() +
      '), which the morph engine reserves for its rule-to-card fallback bucket');
  }
}
if (!/data-shape-alt="frame-\{\{ p\.figNo \}\}"/.test(src)) {
  fail('a landing plate no longer carries data-shape-alt="frame-{{ p.figNo }}", which is how it pairs with its own chapter');
}

// ---------------------------------------------------------------- the roll's arrival

// The roll travels into the platform opening on the way to this landing, and two lines in
// syncParchment keep that travel from stuttering. The clip to the opening must wait for a travel that
// is pending as well as one in the air, or the frame between the two is one where the roll, still out
// in the page, is clipped to a cell it has not reached and blinks out. And a travel must land on its
// anchor exactly: bez() is a bisection that answers 0.99999 at t = 1, so a pose left a hair short read
// as a different anchor on the next sync and started the whole travel over, a second time, every time.
const clipLine = /layer\.style\.clipPath\s*=\s*(k === 1[\s\S]{0,240}?);/.exec(logicSrc);
if (!clipLine) fail('syncParchment no longer clips the layer to the platform opening');
else if (!/!this\.parchTravel/.test(clipLine[1])) {
  fail('the platform clip does not wait for a pending travel (' + clipLine[1].trim() +
    '): the roll would be clipped to the opening it is still flying towards');
}
if (!/place\(\{\s*\.\.\.dest\s*\}\)/.test(logicSrc)) {
  fail("the roll's travel does not land on its anchor exactly (place({ ...dest })), so a pose short of " +
    'the anchor reads as a register change and runs the travel again');
}

// ---------------------------------------------------------------- report

if (failures.length) {
  console.error('check-landing-grid: ' + failures.length + ' failure' + (failures.length === 1 ? '' : 's'));
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
console.log('check-landing-grid: ' + checked + ' placements over ' + VIEWPORTS.length + ' viewports, a ' +
  STATEMENT_ROWS + ' row corner block and ' + SEEDS.length + ' seeds hold the grid (worst growth ' +
  worst + ' rows), ' + Object.keys(shipped).length + ' of ' + PLATES + ' plates pinned, a pin is honoured to the cell ' +
  'and five ways of writing a bad one are refused by name, crossed pins are drawn as written under ' +
  'strict: false and refused without it, and both landings are in the template');
