// Checks the link graph the Development register draws between its sheets.
//
// The register carries one relation and two readings of it. The relation is LINKS, a plain literal
// naming the forward edges by entry id; the graph everything reads is its symmetric closure, so a
// pair is authored once and answered from both ends. That is the invariant this file exists for: a
// backlink is never written down, and an edge written twice, in both directions, is an error rather
// than a duplicate the closure quietly swallows.
//
// The two readings:
//
//   1. The desktop landing. Every plate's cell comes from placeLanding before the browser lays the
//      grid out, so the line between two linked plates is computed from those cells rather than
//      measured: x as a share of the sheet's 22 columns, y as a count of 44px rows. Each line runs
//      centre to centre and the plates are opaque, so the plates themselves clip it back to the run
//      between them. This file runs the real placement over the viewports and seeds the page is used
//      at and holds every line to landing inside the grid, on the centres of the two plates it joins.
//
//   2. The sheet. `links` is a module of the drawing grid like any other, so it is placed from
//      SHEET_WIDE, SHEET_NARROW and SHEET_PHONE; unlike the others its row count follows its content, one row of
//      label and one row per linked sheet. It grows the way the portrait hero and the single detail
//      grow, and the issue line under it moves down by what it gained. A table that left it no room
//      to grow into would put the module over the issue line, which is what the growth rules below
//      guard.
//
// Run with `npm run check`. Exits non-zero and prints every failure it found.

import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { placeLanding } from '../landing-grid.js';
import { DC_SOURCE, readLogicSource, readEntries, readTable, readNumber, readLiteral, registerOf } from './dc-data.mjs';

const BUILT = 'app.js';
const COLUMNS = 22; // grid lines run 1..COLUMNS+1
const HEADER = 57; // the sticky header, so the first visible row starts under it
const ROW = 44;

const failures = [];
const fail = (msg) => failures.push(msg);

const logicSrc = readLogicSource();
const src = readFileSync(DC_SOURCE, 'utf8');

let entries = [];
let links = null;
try {
  entries = readEntries(logicSrc);
  links = readLiteral('LINKS', logicSrc);
} catch (e) {
  console.error('check-backlinks: ' + e.message);
  process.exit(1);
}
const mono = entries.filter((d) => registerOf(d) === 'mono');

// ---------------------------------------------------------------- the ids

// An id is how one entry names another, so every entry the graph can reach needs one and no two may
// answer to the same name. The Development register is where the graph is read from both ends, so
// every mono entry carries one whether or not it has an edge yet.
const byId = new Map();
for (const d of entries) {
  if (d.id === undefined) continue;
  if (typeof d.id !== 'string' || !d.id.trim()) { fail('the ' + d.title + ' entry has an id that is not a name: ' + JSON.stringify(d.id)); continue; }
  if (byId.has(d.id)) fail("two entries answer to the id '" + d.id + "': " + byId.get(d.id).title + ' and ' + d.title);
  else byId.set(d.id, d);
}
for (const d of mono) {
  if (!d.id) fail('the ' + d.title + ' sheet has no id, so nothing in the register can link to it');
}

// slugOf spells an entry's address out of its id, falling back to its title, so an id is a live URL
// and two entries that spell the same one make one of them unreachable
const slugOf = (d) => d.id || d.title.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const bySlug = new Map();
for (const d of entries) {
  const s = slugOf(d);
  if (bySlug.has(s)) fail('two entries answer to the address #/' + s + ': ' + bySlug.get(s).title + ' and ' + d.title);
  else bySlug.set(s, d);
}

// ---------------------------------------------------------------- the forward edges

if (links === null || typeof links !== 'object' || Array.isArray(links)) {
  fail('LINKS is not an object of id to ids');
  links = {};
}

const authored = new Set(); // 'a|b' for every pair as it was written
for (const [from, list] of Object.entries(links)) {
  if (!byId.has(from)) { fail("LINKS names '" + from + "', which is not the id of any entry"); continue; }
  if (!Array.isArray(list)) { fail('LINKS.' + from + ' is not a list of ids'); continue; }
  const seen = new Set();
  for (const to of list) {
    if (!byId.has(to)) { fail("LINKS." + from + " links to '" + to + "', which is not the id of any entry"); continue; }
    if (to === from) { fail('LINKS.' + from + ' links to itself'); continue; }
    if (seen.has(to)) fail('LINKS.' + from + " names '" + to + "' twice");
    seen.add(to);
    if (authored.has(to + '|' + from)) {
      fail("the pair " + from + " and " + to + ' is authored in both directions; the graph is the ' +
        'symmetric closure of LINKS, so the backlink is derived and writing it makes the relation two things');
    }
    authored.add(from + '|' + to);
  }
}

// ---------------------------------------------------------------- the closure

// The graph the register reads. Built here the way the logic class builds it, so the properties the
// two readings depend on are checked rather than assumed: it is symmetric, it holds no entry against
// itself, and it lists in data order, which is what makes a sheet's linked list and the landing's
// lines name the same sheets in the same sequence.
const order = new Map(entries.map((d, i) => [d.id, i]));
const adj = new Map();
for (const key of authored) {
  const [a, b] = key.split('|');
  if (!adj.has(a)) adj.set(a, new Set());
  if (!adj.has(b)) adj.set(b, new Set());
  adj.get(a).add(b);
  adj.get(b).add(a);
}
const related = new Map([...adj].map(([id, set]) =>
  [id, [...set].sort((a, b) => order.get(a) - order.get(b))]));

for (const [id, list] of related) {
  for (const other of list) {
    if (!(related.get(other) || []).includes(id)) fail(id + ' stands next to ' + other + ' but not the other way round');
  }
  if (list.includes(id)) fail(id + ' stands next to itself');
}

const isolated = mono.filter((d) => d.id && !related.has(d.id));

// ---------------------------------------------------------------- the landing's lines

// A plate's centre in the coordinates the overlay is drawn in: x is a share of the sheet's width
// because the columns are 1fr, y is a count of rows because they are a fixed 44px. The rule is read
// off the logic class rather than copied, so the two cannot drift.
let SHEET_COLS = COLUMNS, SHEET_ROW = ROW;
try { SHEET_COLS = readNumber('SHEET_COLS', logicSrc); SHEET_ROW = readNumber('SHEET_ROW', logicSrc); }
catch (e) { fail('the logic class no longer states the grid the overlay is drawn on: ' + e.message); }
if (SHEET_COLS !== COLUMNS) fail('the logic class draws the overlay on ' + SHEET_COLS + ' columns, not the ' + COLUMNS + ' the landing is ruled on');
if (SHEET_ROW !== ROW) fail('the logic class draws the overlay on a ' + SHEET_ROW + 'px row, not the ' + ROW + 'px the landing is ruled on');

const cx = (b) => (b.col - 1 + b.w / 2) * 100 / SHEET_COLS;
const cy = (b) => (b.row - 1 + b.h / 2) * SHEET_ROW;

// the plates of the landing are the mono entries in data order, which is the order landingPlates
// hands placeLanding's answer back in
const kByIdx = new Map(mono.map((d, k) => [d.id, k]));
const edges = [];
for (const key of authored) {
  const [a, b] = key.split('|');
  const ka = kByIdx.get(a), kb = kByIdx.get(b);
  if (ka === undefined || kb === undefined) continue; // one end is a Research chapter: no plate, no line
  edges.push([Math.min(ka, kb), Math.max(ka, kb), a, b]);
}

const VIEWPORTS = [[1000, 700], [1280, 720], [1366, 768], [1440, 900], [1920, 1080], [2560, 1440]];
const SEEDS = Array.from({ length: 50 }, (_, i) => i);
const STATEMENT_ROWS = [8, 10, 12, 14];

const wideLanding = (() => { try { return readTable('LANDING_WIDE', logicSrc); } catch (e) { fail(e.message); return null; } })();
const span = (s) => { const m = /^\s*(\d+)\s*\/\s*(\d+)\s*$/.exec(s); return m ? [parseInt(m[1], 10), parseInt(m[2], 10)] : null; };
const corner = wideLanding && wideLanding.statement && wideLanding.platform
  ? { col: span(wideLanding.statement.col)[0], w: span(wideLanding.platform.col)[1] - span(wideLanding.statement.col)[0] }
  : { col: 1, w: 17 };
const contactSpec = wideLanding && wideLanding.contactEmail && wideLanding.contactCv
  ? { col: span(wideLanding.contactEmail.col)[0], w: span(wideLanding.contactCv.col)[1] - span(wideLanding.contactEmail.col)[0] }
  : { col: 17, w: 6 };

let drawn = 0;
for (const [w, h] of VIEWPORTS) {
  const rows = Math.max(6, Math.floor((h - HEADER) / ROW));
  for (const stRows of STATEMENT_ROWS) {
    for (const seed of SEEDS) {
      let out;
      try {
        out = placeLanding({ seed, cols: COLUMNS, rows, count: mono.length,
          reserved: [{ col: corner.col, row: 1, w: corner.w, h: stRows }], contact: contactSpec });
      } catch (e) { continue; } // check-landing-grid owns the placement itself
      const at = w + 'x' + h + ' statement ' + stRows + ' rows, seed ' + seed + ': ';
      for (const [ka, kb, ida, idb] of edges) {
        const a = out.plates[ka], b = out.plates[kb];
        if (!a || !b) { fail(at + 'the placement gave no plate for ' + (a ? idb : ida) + ', so its lines have no end'); continue; }
        for (const [id, box] of [[ida, a], [idb, b]]) {
          const x = cx(box), y = cy(box);
          if (!(x > 0 && x < 100)) fail(at + "the line end on " + id + ' falls outside the sheet: x is ' + x + '%');
          if (!(y > 0 && y < out.rows * SHEET_ROW)) fail(at + 'the line end on ' + id + ' falls outside the sheet: y is ' + y + 'px of ' + (out.rows * SHEET_ROW));
          // centre to centre is what lets the opaque plates clip the line back to the run between
          // them; an end that missed its own plate would leave the line hanging in the grid
          const inX = x >= (box.col - 1) * 100 / SHEET_COLS && x <= (box.col - 1 + box.w) * 100 / SHEET_COLS;
          const inY = y >= (box.row - 1) * SHEET_ROW && y <= (box.row - 1 + box.h) * SHEET_ROW;
          if (!inX || !inY) fail(at + 'the line end on ' + id + ' is not inside its own plate');
        }
        drawn++;
      }
    }
  }
}

// ---------------------------------------------------------------- the sheet's module

const wide = (() => { try { return readTable('SHEET_WIDE', logicSrc); } catch (e) { fail(e.message); return null; } })();
const narrow = (() => { try { return readTable('SHEET_NARROW', logicSrc); } catch (e) { fail(e.message); return null; } })();
const phone = (() => { try { return readTable('SHEET_PHONE', logicSrc); } catch (e) { fail(e.message); return null; } })();

// One row of label and one row per linked sheet, and never fewer than two rows: a sheet nothing
// links to says so on a row of its own rather than collapsing the module away.
const linkRows = (n) => 1 + Math.max(1, n);
const worst = Math.max(...mono.map((d) => (related.get(d.id) || []).length), 0);

for (const [name, table] of [['SHEET_WIDE', wide], ['SHEET_NARROW', narrow], ['SHEET_PHONE', phone]]) {
  if (!table) continue;
  if (!table.links) { fail(name + ' has no links entry, so the sheet has nowhere to list what it stands next to'); continue; }
  const s = span(table.links.row);
  if (!s) { fail(name + '.links has a row span this check cannot read: ' + JSON.stringify(table.links.row)); continue; }
  // the table holds the module at its smallest, so growth is never negative and the modules under it
  // never move up
  if (s[1] - s[0] !== linkRows(0)) {
    fail(name + '.links is written ' + (s[1] - s[0]) + ' rows tall; the table has to hold it at its ' +
      'smallest, ' + linkRows(0) + ' rows, or a sheet with no links would pull the issue line up into it');
  }
  const nav = ['navBack', 'navNext'].map((k) => table[k] && span(table[k].row)).filter(Boolean);
  if (nav.length !== 2) { fail(name + ' lost one of its issue line modules, which is what the links module grows into'); continue; }
  const navTop = Math.min(...nav.map((r) => r[0]));
  if (navTop <= s[1]) {
    fail(name + ' leaves no empty row between links (ending ' + s[1] + ') and the issue line (starting ' +
      navTop + '): modules are separated by empty cells, and the grown module would run into it');
  }
  // the issue line moves down by what the module gained, so the gap holds at every link count
  const grew = linkRows(worst) - (s[1] - s[0]);
  if (s[0] + linkRows(worst) >= navTop + grew) {
    fail(name + ' puts the issue line over the links module at ' + worst + ' links: the module would end ' +
      'on row ' + (s[0] + linkRows(worst)) + ' and the issue line would start on row ' + (navTop + grew));
  }
  const detail = table.detailCaption && span(table.detailCaption.row);
  if (detail && s[0] < detail[1]) fail(name + ' places links above the detail caption; it closes the sheet, under the account');
}

// the growth has to be wired into the sheet's own shift, or the module grows and nothing moves
if (!/grewLinks/.test(logicSrc)) fail('the logic class works out no grewLinks, so the links module grows and the issue line stays where it was');
if (!/shiftAt[\s\S]{0,240}grewLinks/.test(logicSrc)) fail('shiftAt does not carry the links growth, so the issue line does not move down by what the module gained');

// ---------------------------------------------------------------- the markup

const dom = new JSDOM('<!doctype html><body></body>');
const tpl = dom.window.document.createElement('template');
const openMatch = /<x-dc(?:\s[^>]*)?>/.exec(src);
const closeAt = src.lastIndexOf('</x-dc>');
tpl.innerHTML = src.slice(openMatch.index + openMatch[0].length, closeAt);
const tight = (s) => String(s || '').replace(/\s+/g, '');

const landing = [...tpl.content.querySelectorAll('sc-if')].find(
  (el) => tight(el.getAttribute('value')) === '{{isLandingWide}}' && el.querySelector('main[data-screen-label="Development"]'));
if (!landing) fail('no desktop Development landing to lay the lines over');
else {
  const grid = [...landing.querySelectorAll('*')].find((el) => tight(el.getAttribute('style') || '').includes('repeat(22,1fr)'));
  if (!grid) fail('the desktop landing has no 22-column grid');
  else {
    if (!tight(grid.getAttribute('style') || '').includes('position:relative')) {
      fail('the desktop landing grid is not positioned, so an overlay laid over it would measure against the page instead');
    }
    const svg = grid.querySelector('svg');
    if (!svg) fail('the desktop landing carries no <svg> overlay, so there is nothing to draw a line on');
    else {
      const s = tight(svg.getAttribute('style') || '');
      if (!s.includes('position:absolute')) fail('the lines overlay is a grid item rather than an overlay, so it takes cells of its own');
      if (!s.includes('pointer-events:none')) fail('the lines overlay is not click-through, so it covers the plates it joins');
      // the plates are opaque and paint over the lines, which is what clips each line back to the run
      // between the two it joins. An overlay above them would draw straight across both pictures.
      const z = /z-index:(-?\d+)/.exec(s);
      if (!z) fail('the lines overlay states no z-index, so whether it draws over the plates is painting order rather than a decision');
      else if (parseInt(z[1], 10) >= 1) fail('the lines overlay draws above the plates (z-index ' + z[1] + '), so a line crosses the pictures it joins instead of ending at them');
      const each = [...svg.querySelectorAll('sc-for')].find((el) => tight(el.getAttribute('list') || '') === '{{landingLines}}');
      if (!each) fail('the overlay has no <sc-for list="{{ landingLines }}">, so the lines are written in the markup rather than worked out from the placement');
      else {
        const html = each.outerHTML;
        for (const needle of ['x1="{{ l.x1 }}"', 'y1="{{ l.y1 }}"', 'x2="{{ l.x2 }}"', 'y2="{{ l.y2 }}"', 'opacity="{{ l.on }}"']) {
          if (!html.includes(needle)) fail('a line does not read ' + needle + ' back from the model');
        }
      }
    }
    // Hovering a plate brings the plates it links to up to full ink as well as revealing the lines, so
    // whether a plate is lit is the model's call. It says so as a state rather than as a colour: the
    // three inks of a frame live in one CSS rule (see .mod in the style block) and a plate carries
    // data-lit or does not.
    const plate = [...grid.querySelectorAll('sc-for')].find((el) => tight(el.getAttribute('list') || '') === '{{landingPlates}}');
    if (!plate) fail('the desktop landing has no plates to join');
    else {
      if (!plate.outerHTML.includes('data-lit="{{ p.lit }}"')) {
        fail('a plate does not read data-lit="{{ p.lit }}" back from the model, so hovering one cannot bring the plates it links to up to full ink');
      }
      const box = plate.firstElementChild;
      if (box && /box-shadow/.test(box.getAttribute('style') || '')) {
        fail('a plate writes a frame into its own style attribute, so the model cannot light the plates a hovered one links to: the frame is .mod::after and the lit state is data-lit');
      }
    }
  }
}

const sheet = [...tpl.content.querySelectorAll('sc-if')].find(
  (el) => tight(el.getAttribute('value')) === '{{isMono}}' && el.querySelector('main[data-screen-label="Chapter"]'));
if (!sheet) fail('no Development sheet to close with a linked sheets module');
else {
  const html = sheet.innerHTML;
  if (!html.includes('{{ sheet.links.row }}')) fail('the sheet has no module reading sheet.links.row, so it lists nothing it stands next to');
  const each = [...sheet.querySelectorAll('sc-for')].find((el) => tight(el.getAttribute('list') || '') === '{{sheetLinks}}');
  if (!each) fail('the sheet has no <sc-for list="{{ sheetLinks }}">, so the linked sheets are written in the markup');
  else if (!each.outerHTML.includes('{{ l.open }}')) fail('a linked sheet row does not open the sheet it names');
  // the module reads as a register index, so it is ruled on the sheet's own 44px row rather than
  // flowing: one row of label and one row per sheet, which is the row count the growth counts
  const mod = [...sheet.querySelectorAll('*')].find((el) => (el.getAttribute('style') || '').includes('{{ sheet.links.row }}'));
  if (mod && !tight(mod.getAttribute('style') || '').includes('grid-auto-rows:44px')) {
    fail('the links module is not ruled on the 44px row its growth is counted in, so its rows and its span disagree');
  }
  const order = [html.indexOf('{{ sheet.detailCaption.row }}'), html.indexOf('{{ sheet.links.row }}'), html.indexOf('{{ sheet.navBack.row }}')];
  if (order.every((i) => i >= 0) && !(order[0] < order[1] && order[1] < order[2])) {
    fail('the links module is out of reading order between the detail caption and the issue line, so the modules double their shared seams');
  }
}

// ---------------------------------------------------------------- the build

let built = '';
try { built = readFileSync(BUILT, 'utf8'); } catch (e) { fail('there is no ' + BUILT + ' to check the source against'); }
if (built) {
  if (!/landingLines/.test(built)) fail(BUILT + ' carries no landingLines, so the source was edited and never rebuilt');
  if (!/sheetLinks/.test(built)) fail(BUILT + ' carries no sheetLinks, so the source was edited and never rebuilt');
  // React reads an SVG child by tag name, so the compiled line has to survive as an element rather
  // than as the text the parser would leave behind if it never opened the foreign content
  if (!/"line"/.test(built)) fail(BUILT + ' holds no compiled <line>, so the overlay compiled to nothing');
}

// ---------------------------------------------------------------- report

if (failures.length) {
  console.error('check-backlinks: ' + failures.length + ' failure' + (failures.length === 1 ? '' : 's'));
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
console.log('check-backlinks: ' + authored.size + ' authored edges close to a symmetric graph over ' +
  related.size + ' entries; ' + drawn + ' line ends land inside their own plate over ' +
  VIEWPORTS.length + ' viewports and ' + SEEDS.length + ' seeds; the sheet module holds its ' +
  'gap to the issue line at up to ' + worst + ' links' +
  (isolated.length ? ' (' + isolated.length + ' sheet' + (isolated.length === 1 ? '' : 's') +
    ' draw no line yet: ' + isolated.map((d) => d.id).join(', ') + ')' : ''));
