// Checks the Development grid's tuning panel against the source it is supposed to write back into.
//
// The panel behind ?dev adjusts four tables in place, SHEET_WIDE and SHEET_NARROW for a project
// sheet and LANDING_WIDE and LANDING_PINS for the landing, and then offers to write them out as a
// block to paste into design/Portfolio.dc.html. The failure that costs the most is a block that
// cannot be pasted back: a dropped module, a span emitted in a shape nothing reads, a slug written
// as a bare key when it is not an identifier. So the round trip is the substance of this file. It
// reads the four tables out of the design source, hands them to the panel's own serializer, parses
// what comes back, and compares them deeply, then does it again over a moved, resized and freshly
// pinned copy so the check cannot pass on the untouched case alone.
//
// The block has two other readers. tools/check-sheet-grid.mjs and tools/check-landing-grid.mjs parse
// these tables line by line with a regex of their own, and a block that pastes cleanly but that they
// cannot read would take the grid's only structural guards away at the moment the composition
// changed. Every line the panel writes is put through that same regex here.
//
// The rest guards the arrangement that keeps the panel out of the shipped page: the module is
// imported from exactly one place, that place is behind the ?dev flag, the component destroys it,
// every module either drawing places carries the data-mod the panel binds it by, and neither this
// panel nor the Research one watches the whole document, since two that do lock the page up.
//
// Run with `npm run check`. Exits non-zero and prints every failure it found.

import { readFileSync } from 'node:fs';
import { serialize } from '../grid-dev.js';

const SRC = 'design/Portfolio.dc.html';
const MODULE = './grid-dev.js';
const COLUMNS = 22;
const NAMES = ['SHEET_WIDE', 'SHEET_NARROW', 'LANDING_WIDE', 'LANDING_PINS'];
const FIXED = ['SHEET_WIDE', 'SHEET_NARROW', 'LANDING_WIDE'];
const LANDING_KEYS = ['statement', 'platform', 'contactEmail', 'contactGithub', 'contactCv'];

const failures = [];
const fail = (msg) => failures.push(msg);

// the working tree is CRLF on Windows and LF elsewhere; every marker below is written with LF
const src = readFileSync(SRC, 'utf8').replace(/\r\n/g, '\n');
const closeAt = src.lastIndexOf('</x-dc>');
if (closeAt < 0) {
  console.error('check-grid-tuner: no <x-dc> block in ' + SRC);
  process.exit(1);
}
const logicSrc = src.slice(closeAt);

// ---------------------------------------------------------------- lift the four tables

// All four are plain literals on the class, which is what lets the panel mutate them in place and
// what lets this check read them without running the component.
function readTable(name) {
  const at = logicSrc.indexOf('\n  ' + name + ' = {');
  if (at < 0) { fail('the logic class has no ' + name + ' table, so the panel has nothing to tune'); return null; }
  const end = logicSrc.indexOf('\n  };', at);
  if (end < 0) { fail(name + ' is not closed with "  };" so neither the panel nor the checks can read it'); return null; }
  const body = logicSrc.slice(at + name.length + 7, end);
  try {
    // eslint-disable-next-line no-new-func
    return new Function('return {' + body + '}')();
  } catch (e) {
    fail(name + ' does not parse on its own: ' + e.message);
    return null;
  }
}

const tables = {};
for (const name of NAMES) tables[name] = readTable(name);
const ready = NAMES.every((n) => tables[n]);

// ---------------------------------------------------------------- the round trip

const parseBack = (text) => {
  const grab = (name) => {
    const at = text.indexOf(name + ' = {');
    const end = text.indexOf('\n  };', at);
    if (at < 0 || end < 0) throw new Error('the emitted block has no readable ' + name);
    // eslint-disable-next-line no-new-func
    return new Function('return {' + text.slice(at + name.length + 4, end) + '}')();
  };
  const out = {};
  for (const name of NAMES) out[name] = grab(name);
  return out;
};

const same = (a, b, path, note) => {
  const ka = Object.keys(a), kb = Object.keys(b || {});
  for (const k of ka) if (!kb.includes(k)) fail(note + ': ' + path + ' loses ' + k);
  for (const k of kb) if (!ka.includes(k)) fail(note + ': ' + path + ' gains ' + k);
  // key order is the reading order of the drawing, and on the sheet it is the painting order the
  // hairlines depend on: a block that comes back reordered would put two modules' shared line in two
  // places, and would shuffle which plate a pin belongs to on the landing
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

// the reader in tools/check-sheet-grid.mjs and tools/check-landing-grid.mjs, widened only by the
// quoted key a slug needs: what the panel writes has to survive it
const ENTRY = /^\s*(?:([A-Za-z_$][\w$]*)|'([^']*)'):\s*\{\s*col:\s*'([^']*)',\s*row:\s*'([^']*)'\s*\},?\s*$/;
const BARE = /^\s*([A-Za-z_$][\w$]*):\s*\{\s*col:\s*'([^']*)',\s*row:\s*'([^']*)'\s*\},?\s*$/;

const readableByTheGridChecks = (text, note) => {
  for (const name of NAMES) {
    const at = text.indexOf('  ' + name + ' = {');
    const end = text.indexOf('\n  };', at);
    if (at < 0 || end < 0) { fail(note + ': the emitted block has no readable ' + name); continue; }
    for (const line of text.slice(at, end).split('\n').slice(1)) {
      if (!line.trim()) continue;
      if (!ENTRY.exec(line)) fail(note + ': a line the panel wrote reads as nothing at all, so a module could hide in it: ' + JSON.stringify(line));
      // the two structural checks parse only bare keys, and both read tables the panel also writes,
      // so a module of theirs emitted with a quoted key would vanish from the guard
      else if (name !== 'LANDING_PINS' && !BARE.exec(line)) {
        fail(note + ': ' + name + ' has a line the structural checks cannot read, since they take bare keys only: ' + JSON.stringify(line));
      }
    }
  }
};

const SPAN = /^\d+ \/ \d+$/;
const WORD = /^(fit|last)$/;

function roundTrip(t, note) {
  let text, back;
  try {
    text = serialize(t);
    back = parseBack(text);
  } catch (e) {
    fail(note + ': what the panel writes does not parse back: ' + e.message);
    return;
  }
  for (const name of NAMES) same(t[name], back[name], name, note);
  readableByTheGridChecks(text, note);
}

if (ready) {
  roundTrip(tables, 'the tables as the source holds them');

  // and again over values the panel actually produces: a module moved, one resized to a single cell,
  // one taking the full width, one pushed far enough down to widen the row column, a landing module
  // whose row stays a word, and three plates pinned by slug
  const tuned = JSON.parse(JSON.stringify(tables));
  tuned.SHEET_WIDE.header = { col: '3 / 9', row: '5 / 14' };
  tuned.SHEET_WIDE.ghost = { col: '9 / 10', row: '5 / 6' };
  tuned.SHEET_WIDE.aside = { col: '1 / 23', row: '120 / 148' };
  tuned.SHEET_NARROW.body1 = { col: '2 / 22', row: '33 / 41' };
  tuned.LANDING_WIDE.platform = { col: '9 / 19', row: 'fit' };
  tuned.LANDING_PINS = {
    'rhino-worktree-launcher': { col: '3 / 7', row: '7 / 10' },
    'agent-usage-stat': { col: '14 / 18', row: '5 / 9' },
    'a-slug-with-an-apostrophe': { col: '1 / 4', row: '20 / 23' },
  };
  roundTrip(tuned, 'the tables after tuning');

  // an emptied LANDING_PINS is the ordinary state of the table, not an edge case: unpin all writes it
  const bare = JSON.parse(JSON.stringify(tables));
  bare.LANDING_PINS = {};
  roundTrip(bare, 'the tables with nothing pinned');

  // a span is two grid lines and has to stay two, or grid-column is set to a string the browser drops
  // and the module lands wherever auto-placement puts it. Two rows on the landing are words instead,
  // because nobody chooses them: they are measured off the page.
  for (const name of NAMES) {
    for (const [mod, at] of Object.entries(tables[name])) {
      const rowIsWord = name === 'LANDING_WIDE';
      if (!SPAN.test(String(at.col))) {
        fail(name + '.' + mod + '.col is ' + JSON.stringify(at.col) + ', which the panel cannot read as a pair of grid lines');
      } else if (Number(String(at.col).split(' / ')[1]) > COLUMNS + 1) {
        fail(name + '.' + mod + ' runs off the ' + COLUMNS + ' column grid: ' + at.col);
      }
      if (!SPAN.test(String(at.row)) && !(rowIsWord && WORD.test(String(at.row)))) {
        fail(name + '.' + mod + '.row is ' + JSON.stringify(at.row) + ', which is neither a pair of grid lines nor a row the page measures');
      }
    }
  }

  // both sheet tables place the same modules, or the sheet loses one the moment the window crosses
  // 1000px and the panel would offer a row that writes nothing
  const only = (a, b) => Object.keys(a).filter((k) => !(k in b));
  for (const k of only(tables.SHEET_WIDE, tables.SHEET_NARROW)) fail('SHEET_WIDE places ' + k + ' and SHEET_NARROW does not');
  for (const k of only(tables.SHEET_NARROW, tables.SHEET_WIDE)) fail('SHEET_NARROW places ' + k + ' and SHEET_WIDE does not');

  // the landing's five, no more and no less: the panel resolves a module name to LANDING_WIDE by
  // this list, so an entry outside it would be tuned as if it were a module of the sheet
  for (const k of LANDING_KEYS) if (!tables.LANDING_WIDE[k]) fail('LANDING_WIDE has no ' + k + ' entry');
  for (const k of Object.keys(tables.LANDING_WIDE)) {
    if (!LANDING_KEYS.includes(k)) fail('LANDING_WIDE places ' + k + ', which the panel would take for a module of the sheet');
    if (tables.SHEET_WIDE[k]) fail(k + ' is placed by both LANDING_WIDE and SHEET_WIDE, so the panel cannot tell which table it writes');
  }
}

// ---------------------------------------------------------------- the panel stays out of the page

const imports = [...src.matchAll(/import\((['"])\.\/grid-dev\.js\1\)/g)];
if (imports.length !== 1) {
  fail('expected exactly one import of ' + MODULE + ' in the design source, found ' + imports.length);
} else {
  const before = src.slice(Math.max(0, imports[0].index - 900), imports[0].index);
  // The flag is read once onto the instance now, because the landing reads it too: it draws strictly
  // for every visitor and loosely while the panel is up. So the import may be guarded by the field
  // rather than by the URL, as long as the field is that same reading of the URL and nothing else.
  if (!/URLSearchParams\(location\.search\)\.has\('dev'\)/.test(before) && !/if \(this\.dev\)/.test(before)) {
    fail(MODULE + ' is imported without the ?dev flag guarding it, so the panel ships to every visitor');
  }
  if (!/\n  dev = new URLSearchParams\(location\.search\)\.has\('dev'\);/.test(logicSrc)) {
    fail('the ?dev flag is not read once onto the instance, so the panel and the landing can disagree about whether the page is being tuned');
  }
}
// A tuning session pins every plate and then drags one over another, and the strict placement answers
// that by refusing the whole composition: the landing renders nothing and the plate under the cursor
// vanishes mid-move. The landing therefore draws loosely exactly while the panel is up.
if (!/strict: !this\.dev/.test(logicSrc)) {
  fail('the landing placement is not told whether the page is being tuned, so an overlap made with the panel takes every plate off the sheet');
}
if (!/this\.gridTuner\.destroy\(\)/.test(logicSrc)) {
  fail('componentWillUnmount never destroys the tuning panel, so its listeners outlive the component');
}
// the panel reads which sheet table the width is rendering off the component rather than repeating
// the breakpoint, or the two would drift and it would tune the table the page is not showing
if (!/sheetTable: \(\) => \(this\.state\.narrow \? 'SHEET_NARROW' : 'SHEET_WIDE'\)/.test(logicSrc)) {
  fail('the panel is not told which sheet table the width is rendering, so it could tune the other one');
}
// the landing memoises its placement on the tables it was drawn from, so a tuned pin has to drop that
// memo or the panel would move a plate and be handed the previous composition back
if (!/rerender: \(\) => \{ this\.landingCache = null;/.test(logicSrc)) {
  fail('the panel re-renders without clearing the landing placement cache, so a moved pin would show nothing');
}
if (!/landingError: \(\) => this\.landingError/.test(logicSrc)) {
  fail("the panel is not handed the placement's last complaint, so pins that leave the draw nowhere to go would show only as a landing with no plates");
}
// A landing plate types the reason it was built out of itself on hover, over its neighbours and over
// the panel's own mark, and the cursor is on a plate for the whole of a move. The panel holds that
// while it is up, through the one choke point both the plates and the Research leaves start from.
if (!/quiet: \(on\) => \{ this\.devQuiet = on;/.test(logicSrc)) {
  fail('the panel cannot hold the typewriter, so a plate types over the box being dragged');
}
if (!/startTyping\(key, len, patch\) \{ if \(this\.devQuiet\) return;/.test(logicSrc)) {
  fail('startTyping does not read devQuiet, so holding the typewriter would hold nothing');
}
{
  const mod = readFileSync('grid-dev.js', 'utf8');
  // a landing plate is positioned and carries z-index 1, so a mark left at auto is painted under the
  // very module it marks and only its overhang shows
  if (!/const mark = el\('div', `position:absolute; z-index:\d+;/.test(mod)) {
    fail('the selection mark takes no z-index, so the landing plates paint over the box being dragged');
  }
  if (!/typeOn\.onchange = \(\) => \{ typewriter = typeOn\.checked;/.test(mod)) {
    fail('the panel offers no way to let the plates type again while it is up');
  }
  // These three are greps and not behaviour: what they hold is that the code the browser check
  // exercised is still the code in the file, since none of the three can be run without a page.
  //
  // The sheet is frozen once, on the first rebuild that finds plates drawn on the landing, by
  // claiming every one of them where the draw left it. Without that, every pin reshuffles the plates
  // that are still drawn and a composition can never settle.
  if (!/frozen = true;/.test(mod) || !/initial\.LANDING_PINS = /.test(mod)) {
    fail('the panel does not freeze the landing where the draw left it and make that its reset target, so the plates move under every change');
  }
  // hide used to take the whole panel off the page, which reads as a crash; it folds down to its
  // handle instead, and the handle is what brings it back
  if (!/button\('collapse',/.test(mod)) {
    fail('the panel has no collapse button, so putting it out of the way means taking it off the page');
  }
  // copy writes the clipboard and says so. It used to print the whole block into the panel, which is
  // the one thing nobody needs to see at the moment they have just taken a copy of it.
  if (/out\.textContent = (?:text|serialize\()/.test(mod)) {
    fail('copy prints the serialized block into the panel, which is what the clipboard is for; __grid.dump() is where to read it');
  }
  if (!/out\.textContent = 'copied ' \+/.test(mod)) {
    fail('copy does not report what it put on the clipboard, so a failed write reads exactly like a successful one');
  }
}

// ---------------------------------------------------------------- two panels, one page

// The page carries two tuning panels behind ?dev, and a MutationObserver over the whole document
// makes them fight: each panel's redraw is a document mutation, the other panel answers it by
// redrawing, and because observer callbacks are microtasks the pair never yields the main thread
// again. The page under #dc-root is what a panel tunes and all either has to watch; both park
// outside it, so neither can see the other at all. And each hides itself where it has nothing to
// tune, so only one ever stands on a view.
const HIDES = { 'grid-dev.js': /root\.hidden = !s;/, 'leaves-dev.js': /root\.hidden = hidden \|\| !/ };
for (const file of ['grid-dev.js', 'leaves-dev.js']) {
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
  if (!/root\.dataset\.devPanel = '(grid|leaves)'/.test(mod)) {
    fail(file + ' does not say which panel it is, and with two on the page their controls are otherwise indistinguishable');
  }
  // The two panels put themselves away differently now and the line has to be read per file. The
  // Research panel still hides outright on the key that puts it away; the grid panel folds down to
  // its handle instead and so takes the view off that line, leaving it saying only what it always
  // said: a panel stands where there is something to tune.
  if (!HIDES[file].test(mod)) {
    fail(file + ' never hides itself on a view it has nothing to tune, so two panels stand side by side with one of them empty');
  }
  // A register change lifts a clone of the outgoing view into a morph layer beside #dc-root, and that
  // clone carries every binding attribute the live view had. A panel that asks the document for its
  // modules binds those dead copies for as long as the fade lasts.
  if (!/const page = \(\) => document\.getElementById\('dc-root'\)/.test(mod) || !/page\(\)\.querySelectorAll/.test(mod)) {
    fail(file + ' looks for what it tunes across the whole document, so it binds the morph layer\'s clone of the view the reader has just left');
  }
}
if (!/layer\.setAttribute\('data-morph-layer', ''\); layer\.appendChild\(wrap\); document\.body\.appendChild\(layer\)/.test(logicSrc)) {
  fail('the morph layer no longer stands outside #dc-root, so the panels\' page scoping may no longer exclude the outgoing clone');
}

// ---------------------------------------------------------------- every module says what placed it

// check-sheet-grid holds the other half of this for the sheet: that a data-mod matches the entry its
// module binds. Here it is the coverage that matters, on both drawings, since a module the panel
// cannot see is a module nobody can move.
const stamped = new Set([...src.matchAll(/data-mod="([A-Za-z_$][\w$]*)"/g)].map((m) => m[1]));
if (ready) {
  for (const mod of Object.keys(tables.SHEET_WIDE)) {
    if (!stamped.has(mod)) fail('SHEET_WIDE places ' + mod + ' but no module on the sheet carries data-mod="' + mod + '"');
  }
  for (const mod of LANDING_KEYS) {
    if (!stamped.has(mod)) fail('LANDING_WIDE places ' + mod + ' but no module on the landing carries data-mod="' + mod + '"');
  }
}
if (!stamped.has('detail')) {
  fail('the single detail plate carries no data-mod, so the one module that stands in for the pair cannot be tuned');
}
// a plate takes its name from the entry it shows, since that is what a pin is written against
if (!/data-mod="\{\{ p\.mod \}\}"/.test(src)) {
  fail('the landing plates carry no data-mod, so no plate can be pinned');
}
if (!/mod: 'plate\.' \+ p\.slug/.test(logicSrc)) {
  fail("a landing plate is not named for its entry's slug, so a pin would name a plate that moves when the register changes");
}

// ---------------------------------------------------------------- report

if (failures.length) {
  console.error('check-grid-tuner: ' + failures.length + ' failure' + (failures.length === 1 ? '' : 's'));
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
const count = NAMES.reduce((n, name) => n + Object.keys(tables[name]).length, 0);
console.log('check-grid-tuner: ' + count + ' placement entries over ' + NAMES.length + ' tables survive the panel\'s paste-back block ' +
  'unchanged, tuned, untuned and unpinned, every line still readable by the structural checks, and the panel is reachable only behind ?dev');
