// Checks the phone tier: the predicates that name it, the state it is written into, and every
// place in the template that reads it back.
//
// The site adapted through one flag for a long time, state.narrow off isStacked(), which is tuned
// for a portrait tablet: a column with room for a measure beside it. A phone has no such room, and
// below PHONE_W the compositions are read again as one column with nothing at their side. That is a
// refinement of the stacked tier rather than a branch of its own, so PHONE_W has to sit under
// STACK_W and a phone has to be stacked as well; the home asks a second question, whether the page
// is portrait, because two objects standing side by side need width rather than a small width.
//
// What this file guards:
//
//   1. The predicates are plain expressions, so a check can read the rule back rather than restate
//      it, and they answer the way the issue says over a table of real viewports.
//   2. state.phone and state.portrait are written in both places state.narrow is written, the first
//      paint and onResize, and only ever from the predicates.
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
  console.error('check-phone-layout: no <x-dc> block in ' + DC_SOURCE);
  process.exit(1);
}
const templateSrc = src.slice(openMatch.index + openMatch[0].length, closeAt);
const logicSrc = readLogicSource();

const dom = new JSDOM('<!doctype html><body></body>');
const tpl = dom.window.document.createElement('template');
tpl.innerHTML = templateSrc;
const tight = (s) => String(s || '').replace(/\s+/g, '');

// ---------------------------------------------------------------- the predicates

// Lifted out of the class and run, the way tools/check-research-bands.mjs lifts isStacked: the rule
// is written once, in the logic class, and read back here rather than copied.
function lift() {
  const grab = (name, re) => {
    const m = re.exec(logicSrc);
    if (!m) { fail('the logic class has no ' + name + ', so the phone tier is decided by something this check cannot run'); return null; }
    return m[0].trim();
  };
  const parts = [
    grab('STACK_W', /\n {2}STACK_W = [^;]+;/),
    grab('STACK_RATIO', /\n {2}STACK_RATIO = [^;]+;/),
    grab('isStacked', /\n {2}isStacked\(w = window\.innerWidth, h = window\.innerHeight\) \{ return [^\n]+\}/),
    grab('PHONE_W', /\n {2}PHONE_W = [^;]+;/),
    grab('isPhone', /\n {2}isPhone\(w = window\.innerWidth\) \{ return [^\n]+\}/),
    grab('isPortrait', /\n {2}isPortrait\(w = window\.innerWidth, h = window\.innerHeight\) \{ return [^\n]+\}/),
  ];
  if (parts.some((p) => p === null)) return null;
  try {
    // eslint-disable-next-line no-new-func
    return new Function('return new (class {\n' + parts.join('\n') + '\n})()')();
  } catch (e) {
    fail('the phone predicates do not evaluate on their own: ' + e.message);
    return null;
  }
}

const geo = lift();

if (geo) {
  if (!(geo.PHONE_W < geo.STACK_W)) {
    fail('PHONE_W is ' + geo.PHONE_W + ' and STACK_W is ' + geo.STACK_W + ': the phone tier has to sit under the '
      + 'stacked one, or a phone would take a composition drawn for a screen');
  }
  // route, width, height, phone, portrait, stacked
  const cases = [
    [390, 844, true, true, true, 'a phone held upright'],
    [360, 780, true, true, true, 'a small phone held upright'],
    [430, 932, true, true, true, 'a large phone held upright'],
    [599, 900, true, true, true, 'the widest page still read as a phone'],
    [600, 900, false, true, true, 'the narrowest page read as a tablet'],
    [768, 1024, false, true, true, 'a tablet held upright'],
    [844, 390, false, false, true, 'a phone held on its side'],
    [1024, 1366, false, true, true, 'an iPad Pro held upright'],
    [1440, 900, false, false, false, 'a laptop'],
    [1920, 1080, false, false, false, 'a desk monitor'],
  ];
  for (const [w, h, phone, portrait, stacked, what] of cases) {
    const got = { phone: geo.isPhone(w), portrait: geo.isPortrait(w, h), stacked: geo.isStacked(w, h) };
    for (const [k, want] of [['phone', phone], ['portrait', portrait], ['stacked', stacked]]) {
      if (got[k] !== want) fail(what + ' at ' + w + ' by ' + h + ' is read as ' + (got[k] ? '' : 'not ') + k + ', not ' + (want ? '' : 'not ') + k);
    }
    if (got.phone && !got.stacked) fail(what + ' at ' + w + ' by ' + h + ' is a phone that is not stacked, so the phone tier is not a refinement of the stacked one');
  }
}

// ---------------------------------------------------------------- the state

// state.narrow is written in exactly two places, the state initializer and onResize, and
// tools/check-research-bands.mjs holds it to isStacked() in both. The two flags added beside it
// answer to the same rule: written where narrow is written, and never by hand.
const writes = logicSrc.match(/narrow: this\.isStacked\(\), landingRows: this\.visibleRows\(\)([^\n]{0,120})/g) || [];
if (writes.length < 2) {
  fail('state.narrow is written in fewer than the two places it has to be (the first paint and onResize), '
    + 'so the two flags beside it cannot be checked against it');
}
for (const w of writes) {
  if (!/phone: this\.isPhone\(\)/.test(w)) fail('a place that writes state.narrow does not write state.phone from isPhone(): ' + w.trim());
  if (!/portrait: this\.isPortrait\(\)/.test(w)) fail('a place that writes state.narrow does not write state.portrait from isPortrait(): ' + w.trim());
}
// nothing else may spell either flag into state, or the window and the flag could disagree
for (const m of logicSrc.matchAll(/\bphone:\s*([^,\n}]+)/g)) {
  if (!/this\.isPhone\(\)|state\.phone/.test(m[1])) fail('state.phone is written by hand rather than from isPhone(): phone: ' + m[1].trim());
}
for (const m of logicSrc.matchAll(/\bportrait:\s*([^,\n}]+)/g)) {
  if (!/this\.isPortrait\(\)|state\.portrait/.test(m[1])) fail('state.portrait is written by hand rather than from isPortrait(): portrait: ' + m[1].trim());
}

// ---------------------------------------------------------------- report

if (failures.length) {
  console.error('check-phone-layout: ' + failures.length + ' failure' + (failures.length === 1 ? '' : 's'));
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
console.log('check-phone-layout: the phone tier is a refinement of the stacked one over 10 viewports, and both flags '
  + 'are written only from their predicates in both places state.narrow is written');
