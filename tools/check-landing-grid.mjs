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
// Run with `npm run check`. Exits non-zero and prints every failure it found.

import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { placeLanding, PLATE_VOCAB, FIRST_PLATE } from '../landing-grid.js';

const SRC = 'design/Portfolio.dc.html';
const COLUMNS = 22; // grid lines run 1..COLUMNS+1
const HEADER = 57; // the sticky header, so the first visible row starts under it
const ROW = 44;
const PLATES = 12; // the entries that route to the mono register

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
// the logic class. Two of its rows are measured rather than chosen and so are written as words: the
// statement and the platform read 'fit', the rows the statement's own type takes at this viewport
// width, and the contact cells read 'last', the grid's final row, known only once the placement has
// grown the sheet to hold every plate.
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
  // beside it on the same rows, with no empty column between the two. Both take their height from the
  // statement's measured type, so neither may write a row span of its own.
  const st = wide.statement && span(wide.statement.col);
  const pf = wide.platform && span(wide.platform.col);
  if (st && st[0] !== 1) fail('the statement does not open the sheet at column 1: ' + wide.statement.col);
  for (const name of ['statement', 'platform']) {
    const e = wide[name];
    if (e && e.row !== 'fit') fail('LANDING_WIDE.' + name + " takes a fixed row (" + e.row + "); the corner block is as tall as the statement's own type, written 'fit'");
  }
  if (st && pf && pf[0] !== st[1]) fail('the platform does not take the column the statement leaves off at: statement ends at ' + st[1] + ', platform starts at ' + pf[0]);
  if (st && pf) corner = { col: st[0], w: pf[1] - st[0] };

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

// ---------------------------------------------------------------- the placement itself

const VIEWPORTS = [[1000, 700], [1280, 720], [1366, 768], [1440, 900], [1920, 1080], [2560, 1440]];
const SEEDS = Array.from({ length: 50 }, (_, i) => i);
// the corner block's height is the statement's measured type, so the check runs the range that
// measures out across the widths the page is used at, from the floor measureLandingStatement holds
// to two rows past the tallest reading
const STATEMENT_ROWS = [8, 10, 12, 14];

const contactSpec = wide && wide.contactEmail && wide.contactCv
  ? { col: span(wide.contactEmail.col)[0], w: span(wide.contactCv.col)[1] - span(wide.contactEmail.col)[0] }
  : { col: 17, w: 6 };
const cornerAt = (h) => (corner ? { col: corner.col, row: 1, w: corner.w, h } : { col: 1, row: 1, w: 17, h });
let reserved = [cornerAt(12)];

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
  for (const stRows of STATEMENT_ROWS) {
  reserved = [cornerAt(stRows)];
  for (const seed of SEEDS) {
    const args = { seed, cols: COLUMNS, rows, count: PLATES, reserved, contact: contactSpec };
    let out;
    try { out = placeLanding(args); } catch (e) {
      fail(w + 'x' + h + ' statement ' + stRows + ' rows, seed ' + seed + ': the placement gave up (' + e.message + ')');
      continue;
    }
    checked++;
    const at = w + 'x' + h + ' statement ' + stRows + ' rows, seed ' + seed + ': ';
    if (out.rows < rows) fail(at + 'the placement returned fewer rows (' + out.rows + ') than the screen shows (' + rows + ')');
    worst = Math.max(worst, out.rows - rows);
    if (out.plates.length !== PLATES) fail(at + 'placed ' + out.plates.length + ' plates, not ' + PLATES);
    const [fw, fh] = FIRST_PLATE;
    if (out.plates[0] && (out.plates[0].w !== fw || out.plates[0].h !== fh)) {
      fail(at + 'the first plate is ' + out.plates[0].w + 'x' + out.plates[0].h + ', not the ' + fw + 'x' + fh + ' the platform sheet takes');
    }
    for (let i = 1; i < out.plates.length; i++) {
      const p = out.plates[i];
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
        ['data-morph="why-{{ p.figNo }}"', 'why morph'],
        ['data-morph-alt="lede-{{ p.figNo }}"', 'why morph alt'],
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
    }

    for (const [needle, label] of [['{{ platformRef }}', 'platform box'], ['{{ contentsRef }}', 'contents anchor'], ['{{ platesRef }}', 'plates anchor'], ['{{ notesRef }}', 'notes anchor'], ['{{ landingStatementRef }}', 'statement measuring ref']]) {
      if (!html.includes(needle)) fail('the desktop landing lost its ' + label + ' (' + needle + ')');
    }
    // a measure cap would leave the block wider than its type while its rows are cut to that type,
    // which is the empty half the 'fit' row was meant to remove
    const statement = main.querySelector('section');
    if (statement) {
      for (const el of [statement, ...statement.querySelectorAll('*')]) {
        const s = tight(el.getAttribute('style') || '');
        if (/max-width:\d/.test(s)) fail('the desktop statement caps its measure (' + el.tagName.toLowerCase() + ' has ' + /max-width:[^;]*/.exec(el.getAttribute('style'))[0] + '), so its type cannot fill the module its rows are measured from');
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

// ---------------------------------------------------------------- report

if (failures.length) {
  console.error('check-landing-grid: ' + failures.length + ' failure' + (failures.length === 1 ? '' : 's'));
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
console.log('check-landing-grid: ' + checked + ' placements over ' + VIEWPORTS.length + ' viewports, ' +
  STATEMENT_ROWS.length + ' statement heights and ' + SEEDS.length + ' seeds hold the grid (worst growth ' +
  worst + ' rows), and both landings are in the template');
