// Checks the laptop tier: the factor the two wide landings are read at, the state it is written
// into, and every length in the template that has to be read in the same pixel space as the zoom.
//
// The site had three tiers, all decided on the window: wide, stacked and phone. A laptop fails none
// of the narrow terms, so it takes the wide compositions, and both of those are one-screen drawings
// in fixed pixels: the Research collage lays a 900px title column between two 280px margins and
// hangs its leaves off tuned offsets, the Development landing rules 22 columns and 44px rows and
// pins its statement to eight of them. Nothing in either follows the width, so between the stacked
// tier and desk width the drawing is simply too big for the page it is on: at 1280 by 720 a leaf
// lands on the headline and the statement's description runs into its byline.
//
// The fourth term is not a fourth composition. The two wide roots are scaled with CSS zoom, so every
// module keeps its place and its proportion and only the size it is read at changes. That buys the
// fix at the cost of a second pixel space: inside a zoomed root a length is written in the drawing's
// own pixels and drawn at that many times the factor, so anything that has to line up with the page
// rather than with the drawing has to be divided back out. The three that do are the two roots'
// one-screen heights and the manuscript sheet behind the headline, all of which are viewport units
// standing for the screen itself.
//
// What this file guards:
//
//   1. landingScale is a plain expression, so a check can read the rule back rather than restate it,
//      and it answers the way the issue says over a table of real viewports: 1 at the reference and
//      above, the binding term's share of it below, never under SCALE_MIN, and never anything but 1
//      on a page that is stacked, which has its own composition drawn to the width it is given.
//   2. state.scale is written in both places state.narrow is written, the first paint and onResize,
//      and only ever from landingScale, so the window and the factor cannot disagree.
//   3. Exactly the two wide landing roots carry the zoom, they carry it off one binding, and the
//      lengths that stand for the screen inside them are divided by the same factor. The sheet's row
//      count is taken in that space too, or the Development landing would rule a screen's worth of
//      grid and end its contact band two thirds of the way up it.
//
// Run with `npm run check`. Exits non-zero and prints every failure it found.

import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { DC_SOURCE, readLogicSource } from './dc-data.mjs';

const failures = [];
const fail = (msg) => failures.push(msg);

const src = readFileSync(DC_SOURCE, 'utf8');
const openMatch = /<x-dc(?:\s[^>]*)?>/.exec(src);
const closeAt = src.lastIndexOf('</x-dc>');
if (!openMatch || closeAt < 0) {
  console.error('check-laptop-scale: no <x-dc> block in ' + DC_SOURCE);
  process.exit(1);
}
const templateSrc = src.slice(openMatch.index + openMatch[0].length, closeAt);
const logicSrc = readLogicSource();

const dom = new JSDOM('<!doctype html><body></body>');
const tpl = dom.window.document.createElement('template');
tpl.innerHTML = templateSrc;
const tight = (s) => String(s || '').replace(/\s+/g, '');

// ---------------------------------------------------------------- the factor

// Lifted out of the class and run, the way tools/check-phone-layout.mjs lifts the tier predicates:
// the rule is written once, in the logic class, and read back here rather than copied. landingScale
// asks isStacked, so the stacked terms come along.
function lift() {
  const grab = (name, re) => {
    const m = re.exec(logicSrc);
    if (!m) { fail('the logic class has no ' + name + ', so the factor the wide landings are read at is decided by something this check cannot run'); return null; }
    return m[0].trim();
  };
  const parts = [
    grab('STACK_W', /\n {2}STACK_W = [^;]+;/),
    grab('STACK_RATIO', /\n {2}STACK_RATIO = [^;]+;/),
    grab('isStacked', /\n {2}isStacked\(w = window\.innerWidth, h = window\.innerHeight\) \{ return [^\n]+\}/),
    grab('SCALE_REF_W', /\n {2}SCALE_REF_W = [^;]+;/),
    grab('SCALE_REF_H', /\n {2}SCALE_REF_H = [^;]+;/),
    grab('SCALE_MIN', /\n {2}SCALE_MIN = [^;]+;/),
    grab('landingScale', /\n {2}landingScale\(w = window\.innerWidth, h = window\.innerHeight\) \{ return [^\n]+\}/),
  ];
  if (parts.some((p) => p === null)) return null;
  try {
    // eslint-disable-next-line no-new-func
    return new Function('return new (class {\n' + parts.join('\n') + '\n})()')();
  } catch (e) {
    fail('the scale rule does not evaluate on its own: ' + e.message);
    return null;
  }
}

const geo = lift();

if (geo) {
  if (!(geo.SCALE_MIN > 0 && geo.SCALE_MIN < 1)) {
    fail('SCALE_MIN is ' + geo.SCALE_MIN + ', which is not a factor a page can be read at');
  }
  // A drawing composed at the reference is read whole there and set back by whichever term of a
  // smaller page ran out first. The 16:9 laptops answer on their height and their width at once,
  // since the reference is 16:9 as well; the 16:10 ones answer on their width.
  const cases = [
    [2560, 1440, 1, 'a large desk monitor'],
    [1920, 1080, 1, 'the page both compositions were composed on'],
    [1680, 1050, 0.875, 'a 16:10 desk monitor'],
    [1536, 864, 0.8, 'a laptop at the top of the range'],
    [1440, 900, 0.75, 'a 16:10 laptop'],
    [1366, 768, 0.711, 'the commonest laptop page'],
    [1280, 800, 0.667, 'a 16:10 laptop at the bottom of the range'],
    [1280, 720, 0.667, 'the page the issue was measured on'],
    [1024, 768, null, 'a page small enough that the floor binds'],
  ];
  for (const [w, h, want, what] of cases) {
    const got = geo.landingScale(w, h);
    const expect = want === null ? geo.SCALE_MIN : want;
    if (Math.abs(got - expect) > 0.0005) {
      fail(what + ' at ' + w + ' by ' + h + ' is read at ' + got + ', not ' + expect);
    }
  }
  // A stacked page is never scaled: the narrow tiers are compositions of their own, drawn to the
  // width they are given, and scaling one would be shrinking a drawing that already fits.
  for (const [w, h, what] of [[768, 1024, 'a tablet held upright'], [844, 390, 'a phone held on its side'],
    [1024, 1366, 'an iPad Pro held upright'], [390, 844, 'a phone held upright'], [999, 700, 'the widest stacked page']]) {
    const got = geo.landingScale(w, h);
    if (got !== 1) fail(what + ' at ' + w + ' by ' + h + ' is stacked and still scaled, by ' + got);
  }
  // and the factor never grows a composition past the page it was drawn for
  for (const [w, h] of [[3840, 2160], [2560, 1080], [1920, 1200]]) {
    if (geo.landingScale(w, h) > 1) fail(w + ' by ' + h + ' reads the wide composition at ' + geo.landingScale(w, h) + ', which is larger than it was drawn');
  }
}

// ---------------------------------------------------------------- the state

// state.narrow is written in exactly two places, the state initializer and onResize.
// tools/check-phone-layout.mjs holds the two flags beside it to their own predicates; the factor
// answers to the same rule, since a factor read at one size and a composition laid out at another
// is the fault this whole tier exists to fix.
const writes = logicSrc.match(/narrow: this\.isStacked\(\), landingRows: this\.visibleRows\(\)([^\n]{0,160})/g) || [];
if (writes.length < 2) {
  fail('state.narrow is written in fewer than the two places it has to be (the first paint and onResize), '
    + 'so the factor beside it cannot be checked against it');
}
for (const w of writes) {
  if (!/scale: this\.landingScale\(\)/.test(w)) fail('a place that writes state.narrow does not write state.scale from landingScale(): ' + w.trim());
}
// A quoted value is skipped: renderVals hands a hovered leaf its own scale as a CSS string, and that
// is a length in a transform rather than a page's factor. Every unquoted one is a number, which is
// what a write into state looks like.
for (const m of logicSrc.matchAll(/\bscale:\s*([^,\n}]+)/g)) {
  if (/['"`]/.test(m[1])) continue;
  if (!/this\.landingScale\(\)|state\.scale/.test(m[1])) fail('state.scale is written by hand rather than from landingScale(): scale: ' + m[1].trim());
}

// The sheet's rows are counted in the same pixel space the sheet is laid out in. The Development
// landing rules 44px rows and closes on the row the screen ends on; scaled, the screen holds more of
// those rows, and a count taken off the bare window would end the sheet, and its contact band, part
// of the way up the page.
{
  const rows = /\n {2}visibleRows\(\) \{ return ([^\n]+)\}/.exec(logicSrc);
  if (!rows) fail('the logic class no longer has a one line visibleRows() this check can read');
  else if (!/landingScale\(\)/.test(rows[1])) {
    fail('visibleRows counts the screen\'s rows without asking landingScale, so a scaled landing rules '
      + 'more rows than it places modules on: ' + rows[1].trim());
  }
}

// ---------------------------------------------------------------- what renderVals hands the template

{
  const renderVals = logicSrc.slice(logicSrc.indexOf('\n  renderVals('));
  const m = /\blandingZoom: ([^,\n]+)/.exec(renderVals);
  if (!m) fail('renderVals hands the template no landingZoom, so the two wide roots cannot read the factor back');
  else if (!/state\.scale/.test(m[1])) fail('landingZoom is not state.scale: ' + m[1].trim());
}

// ---------------------------------------------------------------- the roots that carry the zoom

// One binding, read twice: the factor is written into a custom property on the root and the zoom is
// that property, so the lengths inside the root that have to be divided by it can name the same
// value rather than a second copy of it.
const ZOOM_DECL = '--s:{{landingZoom}}';
const ZOOM_USE = 'zoom:var(--s)';
const mains = [...tpl.content.querySelectorAll('main')];
const zoomed = mains.filter((el) => tight(el.getAttribute('style')).includes(ZOOM_USE));
const keyOf = (el) => el.getAttribute('key') || el.getAttribute('data-screen-label') || '(unnamed)';
if (zoomed.length !== 2) {
  fail('expected exactly the two wide landings to carry the zoom, found ' + zoomed.length + ': '
    + zoomed.map(keyOf).join(', '));
}
for (const el of zoomed) {
  if (!tight(el.getAttribute('style')).includes(ZOOM_DECL)) {
    fail('the ' + keyOf(el) + ' root sets a zoom without declaring --s from landingZoom, so nothing inside it '
      + 'can be read in the same pixel space');
  }
}
{
  const want = new Set(['writing', 'tooling']);
  for (const el of zoomed) if (!want.has(el.getAttribute('key'))) fail('a main that is not a landing carries the zoom: ' + keyOf(el));
  // and the two that carry it are the wide readings, not the stacked ones
  const branch = (cond) => [...tpl.content.querySelectorAll('sc-if')].find((el) => tight(el.getAttribute('value')) === '{{' + cond + '}}');
  for (const [cond, key] of [['isHeroWide', 'writing'], ['isLandingWide', 'tooling']]) {
    const blk = branch(cond);
    if (!blk) { fail('no <sc-if value="{{ ' + cond + ' }}"> block: the wide landing is gone'); continue; }
    const main = blk.querySelector('main[key="' + key + '"]');
    if (!main) fail('the ' + cond + ' block no longer holds a main keyed ' + key);
    else if (!tight(main.getAttribute('style')).includes(ZOOM_USE)) {
      fail('the wide ' + key + ' landing does not read the zoom back, so a laptop still takes the composition at desk size');
    }
  }
}

// ---------------------------------------------------------------- the lengths that stand for the screen

// A viewport unit inside a zoomed root is read in the drawing's pixels and then drawn at that many
// times the factor, so a box asking for the screen gets the factor's share of it. The three below
// are the ones that stand for the screen itself rather than for a size inside the drawing, so each
// divides the unit back out. Every other clamp in these compositions is a size in the drawing and is
// left to shrink with it.
{
  const heroWide = [...tpl.content.querySelectorAll('sc-if')].find((el) => tight(el.getAttribute('value')) === '{{isHeroWide}}');
  const hero = heroWide && heroWide.querySelector('section[ref]');
  if (!hero) fail('the wide Research hero is gone');
  else if (!tight(hero.getAttribute('style')).includes('height:calc((100vh-57px)/var(--s))')) {
    fail('the wide Research hero does not divide its one screen height by the factor it is read at, so the '
      + 'collage stands on a fraction of the page: ' + (/height:[^;]+/.exec(String(hero.getAttribute('style'))) || [''])[0]);
  }
  const landWide = [...tpl.content.querySelectorAll('sc-if')].find((el) => tight(el.getAttribute('value')) === '{{isLandingWide}}');
  const grid = landWide && landWide.querySelector('main > div');
  if (!grid) fail('the wide Development landing grid is gone');
  else if (!tight(grid.getAttribute('style')).includes('min-height:calc((100vh-57px)/var(--s))')) {
    fail('the wide Development landing does not divide its one screen height by the factor it is read at, so the '
      + 'sheet ends part of the way up the page: ' + (/min-height:[^;]+/.exec(String(grid.getAttribute('style'))) || [''])[0]);
  }
}
{
  const sheet = /\n {2}HERO_SHEET = '([^']+)';/.exec(logicSrc);
  if (!sheet) fail('the logic class no longer states HERO_SHEET as a literal this check can read');
  else {
    const terms = sheet[1].match(/[\d.]+vh/g) || [];
    if (!terms.length) fail('HERO_SHEET no longer measures the manuscript sheet off the screen: ' + sheet[1]);
    for (const t of terms) {
      const re = new RegExp(t.replace('.', '\\.') + '\\s*/\\s*var\\(--s\\)');
      if (!re.test(sheet[1])) {
        fail('the ' + t + ' term of HERO_SHEET is not divided by the factor the hero is read at, so the sheet '
          + 'behind the headline is drawn smaller than the type it stands behind: ' + sheet[1]);
      }
    }
  }
}

// ---------------------------------------------------------------- report

if (failures.length) {
  console.error('check-laptop-scale: ' + failures.length + ' failure' + (failures.length === 1 ? '' : 's'));
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
console.log('check-laptop-scale: the wide compositions are read at their own share of the reference page over 9 '
  + 'viewports and never scaled on a stacked one, the factor is written from landingScale in both places '
  + 'state.narrow is written, exactly the two wide landing roots carry it as one binding, and the three lengths '
  + 'that stand for the screen inside them are divided back out of it');
