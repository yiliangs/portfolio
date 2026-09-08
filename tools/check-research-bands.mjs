// Checks the stacked Research landing, the composition a portrait screen gets instead of the collage.
//
// The Research landing used to have one composition, the collage: a title column with a margin of loose
// leaves either side. It is a one-screen drawing laid out across the width, and a page that is not
// landscape has no screen to lay it across: the gutters fall to their minimum while the leaves' offsets,
// which are in pixels, do not follow them in, so the margins land on the title column and on the roll.
// The register is now read as a single column there instead, on the same state.narrow the Development
// landing has always been chosen off.
//
// Four things about that are decisions rather than consequences, and each is guarded here.
//
// The line between a column and a desk. Width alone does not draw it: an iPad Pro held upright is 1024
// wide, clears the width threshold, and still has no screen for the collage. isStacked carries both
// terms and both registers read it, so the two cannot part company.
//
// The order is declared. The collage places a chapter by the shape of its plate, so the sequence it is
// fed in barely shows; a column is read top to bottom and the sequence is the composition. BAND_ORDER
// names it, and the run below is the one that was asked for. A chapter the list does not name has to
// come out at the end rather than vanish, which is the case a new entry lands in.
//
// The bands interlock. Plate and caption swap halves every band, and the hairlines belong to the
// caption cell, so two plates meet corner to corner with no rule between them. Break the alternation
// and the page is a stack of identical rows; draw the rule across the whole band and the chain is cut.
//
// The roll keeps its anchor. parchment.js fits the model to whatever box setAnchor is handed, and on
// this register that box is scriptRef; the glyphs that burn it are read out of heroTextRef. A landing
// carrying neither leaves the roll with nothing to stand on, which is a blank screen, not a layout bug.
//
// Run with `npm run check`. Exits non-zero and prints every failure it found.

import { readFileSync } from 'node:fs';
import { readEntries, readLogicSource, registerOf, DC_SOURCE } from './dc-data.mjs';

// the run the stacked page was composed as: the four research chapters, Notra among them, then the essays
const ASKED = ['prototype-to-massing', 'floor-types', 'timber-stm', 'notra', 'canti-lever-house',
  'the-paved-world', 'everything-was-a-cache', 'the-eyeball-line'];
const NARROW_AT = 1000; // the width both landings are chosen off, in the logic class as state.narrow

const failures = [];
const fail = (msg) => failures.push(msg);

const src = readFileSync(DC_SOURCE, 'utf8').replace(/\r\n/g, '\n');
const closeAt = src.lastIndexOf('</x-dc>');
const openMatch = /<x-dc(?:\s[^>]*)?>/.exec(src);
if (!openMatch || closeAt < 0) {
  console.error('check-research-bands: no <x-dc> block in ' + DC_SOURCE);
  process.exit(1);
}
const templateSrc = src.slice(openMatch.index + openMatch[0].length, closeAt);
const logicSrc = readLogicSource(DC_SOURCE);

// ---------------------------------------------------------------- lift the band geometry and run it

// Two runs of consecutive members, sliced out of the class and evaluated, which is what makes this an
// executable check rather than a reading of the source. They are separate because they answer to
// different things: isStacked belongs with the state it is written into, since it governs both
// registers, and the band geometry belongs with the landing it lays out. If a member is renamed or
// moved away from its neighbours, it fails here rather than in the browser.
//
// isStacked's parameters default to the window, which Node has none of; every call below passes both,
// and a default is only evaluated for an argument that is missing.
function slice(what, first, last, ...members) {
  const from = logicSrc.indexOf('\n  ' + first);
  if (from < 0) { fail('the logic class has no ' + first.replace(/[ =({].*/, '') + ', so ' + what + ' is decided by something this check cannot run'); return null; }
  const tail = logicSrc.indexOf('\n  ' + last, from);
  if (tail < 0) { fail('the logic class has no ' + last.replace(/[ =({].*/, '') + ' after ' + first.replace(/[ =({].*/, '')); return null; }
  const to = logicSrc.indexOf('\n', tail + 1);
  if (to < 0) { fail(last.replace(/[ =({].*/, '') + ' is not closed on its own line so it cannot be read'); return null; }
  const body = logicSrc.slice(from, to);
  for (const name of members) {
    if (!body.includes(name)) fail(what + ' is missing ' + name + ', or it no longer sits with the others');
  }
  return body;
}
function loadGeometry() {
  const stack = slice('which composition renders', 'STACK_W = ', 'isStacked(', 'STACK_RATIO');
  const bands = slice('the stacked landing', 'BAND_ORDER = [', 'heroSheetH(narrow) {',
    'bandOrder(entries)', 'bandSide(k)', 'HERO_SHEET');
  if (!stack || !bands) return null;
  try {
    // eslint-disable-next-line no-new-func
    return new Function('return new (class {' + stack + '\n' + bands + '\n})()')();
  } catch (e) {
    fail('the geometry does not evaluate on its own: ' + e.message);
    return null;
  }
}

const geo = loadGeometry();
const serif = readEntries(logicSrc).filter((d) => registerOf(d) === 'serif');

// ---------------------------------------------------------------- the order the column is read in

if (geo) {
  const got = geo.bandOrder(serif).map((p) => p.id);
  if (got.join(' ') !== ASKED.join(' ')) {
    fail('the stacked Research landing runs its chapters in the wrong order\n'
      + '    asked: ' + ASKED.join(' → ') + '\n'
      + '    built: ' + got.join(' → '));
  }
  // every chapter of the register stands on the landing, exactly once: the invariant the collage is
  // held to by check-research-leaves, restated for the column, where dropping one is a slice away
  if (got.length !== serif.length) fail('the column holds ' + got.length + ' of the register\'s ' + serif.length + ' chapters');
  if (new Set(got).size !== got.length) fail('the column lays a chapter down twice');

  // an entry BAND_ORDER does not name follows the ones it does, in register order, so a chapter added
  // to the data appears at the foot of the column rather than disappearing off it
  const withNew = geo.bandOrder([...serif, { id: 'newly-written', kind: 'Research' }, { id: 'newer-still', kind: 'Essay' }]);
  const tail = withNew.slice(-2).map((p) => p.id);
  if (tail.join(' ') !== 'newly-written newer-still') {
    fail('a chapter BAND_ORDER does not name should follow the ones it does, in register order; the column ends ' + tail.join(' → '));
  }
}

// ---------------------------------------------------------------- the bands interlock

if (geo) {
  const rule = /inset 0 1px 0 0/;
  for (let k = 0; k < serif.length; k++) {
    const s = geo.bandSide(k), want = k % 2 === 0 ? '1' : '2';
    if (s.plateCol !== want) fail('band ' + (k + 1) + ' puts its plate in column ' + s.plateCol + ', not ' + want + ': the bands stop alternating');
    if (s.textCol === s.plateCol) fail('band ' + (k + 1) + ' lays its caption on top of its plate, both in column ' + s.plateCol);
    if (s.plateCol !== '1' && s.plateCol !== '2') fail('band ' + (k + 1) + ' places its plate outside the two half-page columns');
    // the caption reads outward, away from the page centre: right when it holds the right half
    const outward = s.textCol === '2' ? 'right' : 'left';
    if (s.align !== outward) fail('band ' + (k + 1) + ' reads its caption ' + s.align + ' from the ' + (s.textCol === '2' ? 'right' : 'left') + ' half, which is inward');
    // the hairlines belong to the caption cell: its top edge, and the edge it shares with the plate.
    // A rule drawn across the whole band would put one between two plates and cut the chain.
    if (!rule.test(s.edge)) fail('band ' + (k + 1) + ' draws no rule along the top of its caption');
    const shared = s.textCol === '2' ? 'inset 1px 0 0 0' : 'inset -1px 0 0 0';
    if (!s.edge.includes(shared)) fail('band ' + (k + 1) + ' draws no rule on the edge its caption shares with its plate');
  }
}

// ---------------------------------------------------------------- the scroll the headline stands on

// The size on screen is the anchor box's size, so the factor here is the one the reader sees. It is
// nine tenths of the expression the page was composed with, and a further fifth off once the page is
// stacked, which is what keeps the scroll inside the column rather than filling it.
if (geo) {
  const sheet = geo.HERO_SHEET;
  if (typeof sheet !== 'string' || !sheet.includes('74vh')) fail('HERO_SHEET is not the height expression the hero was composed with');
  for (const [narrow, factor] of [[false, 0.9], [true, 0.72]]) {
    const got = geo.heroSheetH(narrow);
    const want = 'calc(' + sheet + ' * ' + factor + ')';
    if (got !== want) fail('the hero scroll on the ' + (narrow ? 'stacked' : 'wide') + ' page reads "' + got + '", not "' + want + '"');
  }
}

// ---------------------------------------------------------------- both landings, and only one of them

// The template is the other end this reaches the page through: a geometry nothing renders is not a
// layout. Each landing has to be there, and each has to carry the refs the roll is placed against.
const blocks = {};
for (const flag of ['isHeroWide', 'isHeroNarrow']) {
  const at = templateSrc.indexOf('<sc-if value="{{ ' + flag + ' }}"');
  if (at < 0) { fail('the template has no ' + flag + ' block, so the Research page has only one composition'); continue; }
  const end = templateSrc.indexOf('</sc-if>', at);
  blocks[flag] = templateSrc.slice(at, end < 0 ? undefined : end);
}
if (templateSrc.includes('{{ isSerifPage }}')) {
  fail('the template still guards a Research landing with isSerifPage, which does not say which of the two it is');
}
for (const [flag, block] of Object.entries(blocks)) {
  for (const ref of ['scriptRef', 'heroTextRef', 'heroRef']) {
    if (!block.includes('{{ ' + ref + ' }}')) fail('the ' + flag + ' landing carries no ' + ref + ', so the roll has no ' + (ref === 'heroTextRef' ? 'heat source' : 'anchor') + ' there');
  }
  if (!block.includes('{{ heroSheetH }}')) fail('the ' + flag + ' landing sizes its manuscript sheet by hand rather than from heroSheetH');
}
if (blocks.isHeroNarrow) {
  const band = blocks.isHeroNarrow;
  if (!band.includes('{{ serifBands }}')) fail('the stacked landing renders no bands');
  if (band.includes('{{ leftLeaves }}') || band.includes('{{ rightLeaves }}')) {
    fail('the stacked landing still renders the collage margins');
  }
  // A plate takes its width from its half of the page and its height from the band. Put the square on
  // the plate cell as an aspect-ratio and it becomes the shape rather than a floor: the cell is stretched
  // to a caption taller than the square, the ratio then derives the width from that height, and the plate
  // runs off the page. The square belongs to a spacer inside the cell, with the picture laid over it.
  const plate = /<button data-shape="leaf-\{\{ b\.cardNo \}\}"[^>]*style="([^"]*)"/.exec(band);
  if (!plate) fail('the stacked landing has no plate cell this check can read');
  else {
    if (/aspect-ratio/.test(plate[1])) fail('the band plate carries an aspect-ratio of its own, so a tall caption drives its width and pushes it off the page');
    for (const rule of ['position:relative', 'overflow:hidden']) {
      if (!plate[1].includes(rule)) fail('the band plate is missing ' + rule + ', so the picture cannot be laid over the whole cell');
    }
    if (!/<span aria-hidden="true" style="[^"]*aspect-ratio:1\/1/.test(band)) fail('the band plate has no square spacer, so nothing sets the least tall a band may be');
    if (!/<image-slot[^>]*style="position:absolute; inset:0/.test(band)) fail('the band picture is not laid over the whole plate cell');
  }
}
if (blocks.isHeroWide && !blocks.isHeroWide.includes('{{ leftLeaves }}')) fail('the wide landing no longer renders the collage margins');

// the two are complements of one state, so the Research page always has exactly one landing
const vals = /isHeroWide: ([^,]+), isHeroNarrow: ([^,]+),/.exec(logicSrc);
if (!vals) fail('renderVals does not hand the template isHeroWide and isHeroNarrow as one pair');

// Both registers read one predicate, so neither can part company with the other, and state.narrow is
// written from it in both places it is written: the first paint and every resize after it.
const writes = logicSrc.match(/narrow: ([^,]+), landingRows:/g) || [];
const byHand = writes.filter((w) => !w.includes('this.isStacked()'));
if (writes.length < 2) fail('state.narrow is written in fewer than the two places it has to be, the first paint and onResize');
if (byHand.length) fail('state.narrow is written by hand rather than from isStacked(): ' + byHand.join(' '));

// The page is read as a column when it is too narrow for two margins and a measure, or when it is not
// clearly landscape. The second term is what a portrait tablet fails while passing the first: 1024 by
// 1366 is wider than the threshold and still has no screen to lay a one-screen drawing across.
if (geo && typeof geo.isStacked === 'function') {
  const cases = [
    [1024, 1366, true, 'an iPad Pro held upright'],
    [1030, 1310, true, 'the portrait page the collage was reported broken on'],
    [820, 1180, true, 'a tablet held upright'],
    [390, 844, true, 'a phone'],
    [1200, 1200, true, 'a square page'],
    [1280, 1024, false, 'a 5:4 desktop monitor'],
    [1112, 834, false, 'an iPad Pro held on its side'],
    [1440, 900, false, 'a laptop'],
    [1366, 768, false, 'a small laptop'],
    [1920, 1080, false, 'a desk monitor'],
  ];
  for (const [w, h, want, what] of cases) {
    const got = geo.isStacked(w, h);
    if (got !== want) fail(what + ' at ' + w + ' by ' + h + ' is read as ' + (got ? 'a column' : 'a desk') + ', not ' + (want ? 'a column' : 'a desk'));
  }
  if (geo.STACK_W !== NARROW_AT) fail('the width term is ' + geo.STACK_W + 'px, not the ' + NARROW_AT + 'px both registers share');
} else if (geo) {
  fail('the logic class has no isStacked(w, h), so the two compositions are chosen by something this check cannot run');
}

// ---------------------------------------------------------------- report

if (failures.length) {
  console.error('check-research-bands: ' + failures.length + ' problem' + (failures.length === 1 ? '' : 's'));
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
console.log('check-research-bands: ' + serif.length + ' chapters run the declared order, the bands alternate and interlock, '
  + 'the scroll reads at 0.9 wide and 0.72 stacked, and both landings carry the roll\'s anchor');
