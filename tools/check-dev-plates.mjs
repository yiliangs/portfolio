// Checks the plates a Development sheet is allowed to name, and the slots that show them.
//
// A Development entry may name its own pictures: `hero` for the sheet's large plate and for the two
// landing placements, `detailA` and `detailB` for the pair of small plates under the account. An
// entry that names none of them keeps the placeholder slot it has always had, so the register can
// carry a finished sheet and an unillustrated one side by side. That is the invariant this file
// guards, from both ends:
//
//   1. The data. A named plate has to be a file that is actually in the repository, and an entry
//      that declares its hero's pixel size has to declare the size the file really is: the Research
//      leaves cut their plate to heroW/heroH, so a wrong pair is a silently mis-shaped plate rather
//      than an error. Sizes are read out of the file's own header, not trusted from the entry.
//   2. The markup. Every plate slot on the Development side has to pass `src` as one whole binding
//      and keep its `id` and `placeholder`. A binding that is missing on an entry compiles to an
//      absent attribute, which is what makes image-slot fall back to the placeholder; a slot that
//      lost its placeholder would render an empty frame for every entry that names no picture.
//   3. The build. The same three attributes have to survive into app.js, so a source edit that was
//      never rebuilt is caught here rather than on the live page.
//
// Run with `npm run check`. Exits non-zero and prints every failure it found.

import { readFileSync, existsSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { DC_SOURCE, readLogicSource, readEntries, readTable, readNumber, registerOf } from './dc-data.mjs';

const BUILT = 'app.js';

// The two sheets issue #40 records. They are named here because their absence is the one failure
// this file cannot infer from anything else in the repository.
const REQUIRED_SHEETS = ['Rhino Worktree Launcher', 'Agent Usage Stat'];

// Every field the mono sheet or the Development landing reads off an entry. `summary` and
// `statusShort` are carried by the data and read by neither, so they are not required here.
const SHEET_FIELDS = ['title', 'subtitle', 'kind', 'year', 'page', 'pages', 'role', 'with', 'status',
  'stack', 'link', 'caption', 'placeholder', 'why', 'margin', 'body1', 'body2', 'body3'];

// The plate fields. `hero` and `detail` are cut to their own proportion and so must state their
// pixel size; the pair keeps the standard plate and states nothing.
const PLATE_FIELDS = ['hero', 'detail', 'detailA', 'detailB'];
const SIZED = { hero: ['heroW', 'heroH'], detail: ['detailW', 'detailH'] };

const failures = [];
const fail = (msg) => failures.push(msg);

// ---------------------------------------------------------------- the entries

let entries = [];
try {
  entries = readEntries(readLogicSource());
} catch (e) {
  console.error('check-dev-plates: ' + e.message);
  process.exit(1);
}
const mono = entries.filter((d) => registerOf(d) === 'mono');

for (const title of REQUIRED_SHEETS) {
  if (!mono.some((d) => d.title === title)) fail('the Development register has no ' + title + ' sheet');
}

for (const d of mono) {
  for (const f of SHEET_FIELDS) {
    if (d[f] === undefined || d[f] === '') fail('the ' + d.title + ' sheet has no ' + f + ', which the sheet reads');
  }
}

// num(i) indexes the romans list by the entry's position, so an entry past the end of that list
// prints its kicker as "Sheet undefined". This is the only check that reads the data array, which is
// why the guard sits here rather than in a file of its own.
const romans = /\n\s*romans = \[([^\]]*)\]/.exec(readLogicSource());
if (!romans) fail('the logic class has no romans list, so the register cannot be numbered');
else {
  const n = romans[1].split(',').filter((s) => s.trim()).length;
  if (n < entries.length) fail('the register has ' + entries.length + ' entries but only ' + n + ' roman numerals');
}

// ---------------------------------------------------------------- the plate files

// PNG carries its size in the IHDR chunk that always comes first: two big-endian 32-bit integers at
// byte 16 and byte 20. JPEG carries it in whichever SOF marker the encoder wrote, so the segments
// are walked until one turns up.
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const SOF = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

function imageSize(path) {
  const buf = readFileSync(path);
  if (buf.length >= 24 && buf.subarray(0, 8).equals(PNG_MAGIC)) {
    if (buf.toString('latin1', 12, 16) !== 'IHDR') return { error: 'its first PNG chunk is not IHDR' };
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  }
  if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) return { error: 'its JPEG segments do not line up' };
      const marker = buf[i + 1];
      const len = buf.readUInt16BE(i + 2);
      if (SOF.has(marker)) return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
      i += 2 + len;
    }
    return { error: 'its JPEG carries no frame header' };
  }
  return { error: 'this check reads PNG and JPEG headers only' };
}

for (const d of mono) {
  for (const f of PLATE_FIELDS.filter((x) => d[x])) {
    if (!existsSync(d[f])) { fail('the ' + d.title + ' sheet names ' + f + ' ' + d[f] + ', which is not in the repository'); continue; }
    const size = imageSize(d[f]);
    if (size.error) { fail(d[f] + ', named by the ' + d.title + ' sheet, cannot be measured: ' + size.error); continue; }
    const pair = SIZED[f];
    if (!pair) continue;
    if (!d[pair[0]] || !d[pair[1]]) {
      fail('the ' + d.title + ' sheet names a ' + f + ' but no ' + pair.join('/') + ', so its plate cannot be cut to the picture');
    } else if (d[pair[0]] !== size.w || d[pair[1]] !== size.h) {
      fail('the ' + d.title + ' sheet states its ' + f + ' is ' + d[pair[0]] + ' by ' + d[pair[1]] +
        '; ' + d[f] + ' is really ' + size.w + ' by ' + size.h);
    }
  }
  for (const [f, pair] of Object.entries(SIZED)) {
    if (!d[f] && (d[pair[0]] || d[pair[1]])) fail('the ' + d.title + ' sheet states a ' + f + ' size but names no ' + f);
  }
  // one arrangement or the other under the account, never both: the two would be laid over the
  // same cells, and the template would have to guess which the entry meant
  if (d.detail && (d.detailA || d.detailB)) {
    fail('the ' + d.title + ' sheet names both a single detail and the detailA/detailB pair; it may name one or the other');
  }
}

// The placeholder path has to stay live: if every entry ended up with a picture the slots would
// never be exercised and a broken placeholder would ship unnoticed.
if (!mono.some((d) => PLATE_FIELDS.every((f) => !d[f]))) {
  fail('every Development entry now names a plate, so nothing exercises the placeholder slot any more');
}

// ---------------------------------------------------------------- the plates cut to their picture

// Two plates on the Development sheet are cut to their picture's own proportion rather than taking
// the rows the placement table wrote for them: a hero taller than it is wide, which keeps the
// sheet's left edge and spans PORTRAIT_COLS of the twenty-two columns, and a single detail, which
// spans the columns the detailA/detailB pair spanned. Both take the rows rowsFor() asks for, and
// every module under their caption moves down by the rows they gained.
//
// The rule is written once, in the logic class, as two plain expressions; this reads those back
// rather than restating them, builds the table each entry produces at the widths the sheet is read
// at, and holds it to what check-sheet-grid holds the written tables to, plus the properties that
// are the point of the rule.
const COLUMNS = 22;
// the wide sheet runs from the narrow threshold up; the narrow sheet runs below it. A long sheet
// always carries a scrollbar, so the containing block is tested a scrollbar narrower than vw as well
// as flush with it.
const WIDE_AT = [1000, 1100, 1280, 1440, 1600, 1920, 2560];
const NARROW_AT = [420, 600, 768, 900, 999];
const SCROLLBAR = [0]; // the rule no longer reads a scrollbar-dependent width
let plateReport = 'none';

function readRule(logicSrc) {
  const body = (name, args) => {
    const m = new RegExp('\\n\\s*' + name + '\\(' + args + '\\)\\s*\\{\\s*return ([^;]+);\\s*\\}').exec(logicSrc);
    if (!m) throw new Error('the logic class has no ' + name + '(' + args + ') rule');
    return m[1].replace(/this\./g, 'self.');
  };
  const self = {
    PORTRAIT_COLS: readNumber('PORTRAIT_COLS', logicSrc),
    SHEET_COLS: readNumber('SHEET_COLS', logicSrc),
    SHEET_ROW: readNumber('SHEET_ROW', logicSrc),
    SHEET_MAX: readNumber('SHEET_MAX', logicSrc),
  };
  const colFn = new Function('self', 'vw', 'box', 'return ' + body('sheetCol', 'vw, box'));
  self.sheetCol = (vw, box) => colFn(self, vw, box);
  const rowsFn = new Function('self', 'window', 'document', 'cols', 'w', 'h', 'return ' + body('rowsFor', 'cols, w, h'));
  return {
    ...self,
    rowsFor: (vw, box, cols, w, h) =>
      rowsFn(self, { innerWidth: vw }, { documentElement: { clientWidth: box } }, cols, w, h),
  };
}

const at = (s) => s.split('/').map((v) => parseInt(v, 10));

// renderVals builds a sheet's table this way. The two plates are independent: an entry may cut one,
// the other, both or neither, and a module moves by whichever of them stands above it.
function cutTable(table, rule, entry, vw, box, narrow) {
  const heroSpan = at(table.hero.row);
  const portrait = !narrow && entry.heroW > 0 && entry.heroH > entry.heroW;
  const heroRows = portrait ? rule.rowsFor(vw, box, rule.PORTRAIT_COLS, entry.heroW, entry.heroH) : heroSpan[1] - heroSpan[0];
  const grewHero = heroRows - (heroSpan[1] - heroSpan[0]);

  const detailCol = [Math.min(at(table.detailA.col)[0], at(table.detailB.col)[0]),
    Math.max(at(table.detailA.col)[1], at(table.detailB.col)[1])];
  const detailTop = Math.min(at(table.detailA.row)[0], at(table.detailB.row)[0]);
  const detailFoot = Math.max(at(table.detailA.row)[1], at(table.detailB.row)[1]);
  const one = !!entry.detail && entry.detailW > 0 && entry.detailH > 0;
  const detailRows = one ? rule.rowsFor(vw, box, detailCol[1] - detailCol[0], entry.detailW, entry.detailH) : detailFoot - detailTop;
  const grewDetail = detailRows - (detailFoot - detailTop);

  const heroFrom = at(table.heroCaption.row)[0], detailFrom = at(table.detailCaption.row)[0];
  const shiftAt = (row) => (row >= heroFrom ? grewHero : 0) + (row >= detailFrom ? grewDetail : 0);
  const out = {};
  for (const [name, spot] of Object.entries(table)) {
    if (one && (name === 'detailA' || name === 'detailB')) continue; // replaced by the single figure
    const span = at(spot.row);
    const shift = shiftAt(span[0]);
    out[name] = {
      col: name === 'hero' && portrait ? '1 / ' + (1 + rule.PORTRAIT_COLS) : spot.col,
      row: name === 'hero' ? span[0] + ' / ' + (span[0] + heroRows) : (span[0] + shift) + ' / ' + (span[1] + shift),
    };
  }
  if (one) {
    const row = detailTop + shiftAt(detailTop);
    out.detail = { col: detailCol[0] + ' / ' + detailCol[1], row: row + ' / ' + (row + detailRows) };
  }
  return { table: out, portrait, one, heroRows, grewHero, detailRows, grewDetail, detailCols: detailCol[1] - detailCol[0], shiftAt };
}

function checkCut(where, rule, laid, table, entry, vw, box) {
  const { table: out, portrait, one } = laid;

  // whole cells, on the grid, and nothing laid over anything
  const boxes = [];
  for (const [name, spot] of Object.entries(out)) {
    const c = at(spot.col), r = at(spot.row);
    if (![...c, ...r].every(Number.isInteger)) { fail(where + ' leaves ' + name + ' on a span this check cannot read: ' + spot.col + ' x ' + spot.row); continue; }
    if (c[0] < 1 || c[1] > COLUMNS + 1 || c[0] >= c[1]) fail(where + ' puts ' + name + ' off the grid: columns ' + spot.col);
    if (r[0] < 1 || r[0] >= r[1]) fail(where + ' puts ' + name + ' off the grid: rows ' + spot.row);
    boxes.push([name, c, r]);
  }
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const [a, ac, ar] = boxes[i], [b, bc, br] = boxes[j];
      if (ac[0] < bc[1] && bc[0] < ac[1] && ar[0] < br[1] && br[0] < ar[1]) fail(where + ' lays ' + a + ' and ' + b + ' over the same cells');
    }
  }

  // a cut plate is the picture's proportion rounded up to whole rows: never shorter than the picture
  // needs at that width, and never a whole empty row taller
  const proportion = (name, cols, rows, w, h) => {
    const needed = cols * rule.sheetCol(vw, box) * h / w;
    const height = rows * rule.SHEET_ROW;
    if (height < needed) fail(where + "'s " + name + ' is ' + height.toFixed(0) + 'px for a picture that needs ' + needed.toFixed(1) + 'px at that width');
    if (height - needed >= rule.SHEET_ROW) fail(where + "'s " + name + ' is ' + (height - needed).toFixed(1) + 'px taller than the picture, which is a whole empty row or more');
  };
  if (portrait) {
    proportion('hero plate', rule.PORTRAIT_COLS, laid.heroRows, entry.heroW, entry.heroH);
    const c = at(out.hero.col);
    if (c[0] !== 1 || c[1] !== 1 + rule.PORTRAIT_COLS) fail(where + ' does not keep column 1 and span ' + rule.PORTRAIT_COLS + ' columns for the hero: ' + out.hero.col);
  }
  if (one) {
    proportion('detail plate', laid.detailCols, laid.detailRows, entry.detailW, entry.detailH);
    // The single plate takes the columns the pair spanned, which is how it is derived, so that much
    // is a construction rather than a claim. What is worth holding is that the pair spans the whole
    // sheet: a table that narrowed it would quietly narrow this plate with it.
    const c = at(out.detail.col);
    if (c[0] !== 1 || c[1] !== COLUMNS + 1) {
      fail(where + ' gives the single detail columns ' + out.detail.col + ', not the full width of the sheet: the pair it replaces runs ' + table.detailA.col + ' and ' + table.detailB.col);
    }
  }

  // every module moved by exactly what stands above it, and nothing changed columns but the hero
  for (const [name, spot] of Object.entries(table)) {
    if (name === 'hero' || !out[name]) continue;
    const was = at(spot.row), now = at(out[name].row), want = laid.shiftAt(was[0]);
    if (now[0] - was[0] !== want || now[1] - was[1] !== want) fail(where + ' moves ' + name + ' by ' + (now[0] - was[0]) + ' rows, not ' + want);
    if (spot.col !== out[name].col) fail(where + ' changes the columns of ' + name + ', which only the hero may do');
  }
  const heroWas = at(table.hero.row), heroNow = at(out.hero.row);
  if (heroNow[0] !== heroWas[0]) fail(where + ' does not start the hero where the standard plate starts');
  if (heroNow[1] - heroWas[1] !== laid.grewHero) fail(where + ' ends the hero ' + (heroNow[1] - heroWas[1]) + ' rows later, not ' + laid.grewHero);
}

try {
  const logicSrc = readLogicSource();
  const rule = readRule(logicSrc);
  const tables = { SHEET_WIDE: readTable('SHEET_WIDE', logicSrc), SHEET_NARROW: readTable('SHEET_NARROW', logicSrc) };
  if (rule.PORTRAIT_COLS < 1 || rule.PORTRAIT_COLS >= COLUMNS) {
    fail('PORTRAIT_COLS is ' + rule.PORTRAIT_COLS + ', which is not a span of the ' + COLUMNS + ' column grid');
  }
  if (rule.SHEET_COLS !== COLUMNS) fail('SHEET_COLS is ' + rule.SHEET_COLS + ', not the ' + COLUMNS + ' columns the sheet is drawn on');

  const cut = mono.filter((d) => (d.heroW > 0 && d.heroH > d.heroW) || d.detail);
  const seen = [];
  for (const d of cut) {
    for (const [name, table, widths, narrow] of [['SHEET_WIDE', tables.SHEET_WIDE, WIDE_AT, false],
      ['SHEET_NARROW', tables.SHEET_NARROW, NARROW_AT, true]]) {
      for (const vw of widths) {
        for (const bar of SCROLLBAR) {
          const laid = cutTable(table, rule, d, vw, vw - bar, narrow);
          checkCut('the ' + d.title + ' sheet on ' + name + ' at ' + vw + 'px', rule, laid, table, d, vw, vw - bar);
          if (vw === 1440 && bar === SCROLLBAR[0] && !narrow) {
            seen.push(d.title + ': ' + (laid.portrait ? 'hero ' + rule.PORTRAIT_COLS + ' by ' + laid.heroRows : 'hero standard') +
              ', ' + (laid.one ? 'detail ' + laid.detailCols + ' by ' + laid.detailRows : 'detail pair'));
          }
        }
      }
    }
  }
  if (!cut.length) fail('no Development entry cuts a plate to its picture, so the rule is never exercised');
  plateReport = seen.join('; ');
} catch (e) {
  fail('the cut plate rule cannot be read back: ' + e.message);
}

// ---------------------------------------------------------------- the slots in the template

const src = readFileSync(DC_SOURCE, 'utf8');
const openMatch = /<x-dc(?:\s[^>]*)?>/.exec(src);
const closeAt = src.lastIndexOf('</x-dc>');
if (!openMatch || closeAt < 0) {
  console.error('check-dev-plates: no <x-dc> block in ' + DC_SOURCE);
  process.exit(1);
}
const templateSrc = src.slice(openMatch.index + openMatch[0].length, closeAt);

const dom = new JSDOM('<!doctype html><body></body>');
const tpl = dom.window.document.createElement('template');
tpl.innerHTML = templateSrc;

// An attribute written as exactly one {{ }} passes its value through with its real type, which is
// what an absent field needs: the compiler emits the expression itself, React drops an undefined
// prop, and image-slot sees no src at all. An interpolated string would always be present.
const whole = (el, name) => {
  const raw = el.getAttribute(name);
  const m = raw && /^\s*\{\{([\s\S]+?)\}\}\s*$/.exec(raw);
  return m ? m[1].trim() : null;
};

// Which branch of the template a node stands in, read off the sc-if elements above it.
const branches = (el) => {
  const out = [];
  for (let p = el.parentElement; p; p = p.parentElement) {
    if (p.tagName.toLowerCase() === 'sc-if') { const v = whole(p, 'value'); if (v) out.push(v); }
  }
  return out;
};

const inSheetPlate = (el) => {
  for (let p = el.parentElement; p; p = p.parentElement) {
    if (p.tagName.toLowerCase() === 'figure' && (p.getAttribute('class') || '').split(/\s+/).includes('sheet-plate')) return true;
  }
  return false;
};

// The slots the Development side owns: the three on the sheet, and the one landing plate that is
// written twice, once for the stacked landing and once for the desktop one.
const slots = [...tpl.content.querySelectorAll('image-slot')].filter((el) =>
  inSheetPlate(el) || branches(el).includes('isMonoPage'));

// Each slot id and the fields it is allowed to show. detailSlotA carries two, because the single
// detail figure reuses it: the morph and the cell readout then find the same slot whichever
// arrangement the sheet is in.
const EXPECTED = {
  'current.heroSlotId': ['current.hero'],
  'current.detailSlotA': ['current.detailA', 'current.detail'],
  'current.detailSlotB': ['current.detailB'],
  'p.plateSlotId': ['p.hero'],
};

const seen = new Set();
const sources = new Set();
for (const el of slots) {
  const id = whole(el, 'id');
  if (!id) { fail('a Development plate slot names no id, so it cannot be identified or persisted'); continue; }
  const want = EXPECTED[id];
  if (!want) { fail('a Development plate slot has an id this check does not know about: ' + id); continue; }
  seen.add(id);
  const got = whole(el, 'src');
  if (!got) fail('the ' + id + ' slot passes no src as one whole binding, so a named plate cannot reach it');
  else if (!want.includes(got)) fail('the ' + id + ' slot reads its picture from ' + got + ', not ' + want.join(' or '));
  else sources.add(got);
  // the two detail slots word their own placeholder, the rest take the entry's, so only its
  // presence is the invariant here
  if (!el.getAttribute('placeholder')) fail('the ' + id + ' slot lost its placeholder, so an entry with no picture would show an empty frame');
}
for (const id of Object.keys(EXPECTED)) {
  if (!seen.has(id)) fail('the template carries no Development plate slot for ' + id);
}
// every plate field an entry may name has a slot that shows it
for (const want of Object.values(EXPECTED).flat()) {
  if (!sources.has(want)) fail('no Development plate slot shows ' + want + ', so an entry naming it would go unread');
}
// The landing plate is written twice, once per landing, and both have to take the picture.
const landing = slots.filter((el) => whole(el, 'id') === 'p.plateSlotId');
if (landing.length !== 2) fail('the Development landing plate is written ' + landing.length + ' times, not twice (stacked and desktop)');

// ---------------------------------------------------------------- the build

// The compiler writes a binding as the path itself, optionally chained and under whatever name the
// enclosing scope object took ("V.current?.hero", "Vi.p?.hero"), so a path is matched rather than
// spelled out. Everything before the style object's own brace is the slot's props.
const built = readFileSync(BUILT, 'utf8');
// the trailing guard matters: without it "current?.detail" would also match "current?.detailA"
const jsPath = (p) => '[A-Za-z_$][\\w$]*\\.' + p.split('.').join('\\?\\.') + '(?![\\w$])';
const calls = [...built.matchAll(/"image-slot",\s*\{([^}]*)\}/g)].map((m) => m[1]);
for (const [id, srcPaths] of Object.entries(EXPECTED)) {
  const mine = calls.filter((c) => new RegExp('id:\\s*' + jsPath(id)).test(c));
  if (!mine.length) { fail(BUILT + ' has no compiled image-slot for ' + id + ', so it is behind ' + DC_SOURCE); continue; }
  for (const srcPath of srcPaths) {
    const filled = mine.filter((c) => new RegExp('src:\\s*' + jsPath(srcPath)).test(c));
    if (!filled.length) fail(BUILT + "'s " + id + ' slot does not pass src: ' + srcPath + ', so it is behind ' + DC_SOURCE);
    for (const c of filled) if (!/placeholder:/.test(c)) fail(BUILT + "'s " + id + ' slot passes a src but no placeholder');
  }
}

// ---------------------------------------------------------------- report

if (failures.length) {
  console.error('check-dev-plates: ' + failures.length + ' failure' + (failures.length === 1 ? '' : 's'));
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
console.log('check-dev-plates: ' + mono.length + ' Development entries, ' +
  mono.filter((d) => d.hero).length + ' with a hero plate, ' + slots.length + ' slots checked; ' +
  'cut plates at 1440: ' + plateReport);
