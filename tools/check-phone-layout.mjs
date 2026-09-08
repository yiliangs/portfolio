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
//   3. Every composition the issue names reads the flag back through a binding rather than carrying
//      a phone value in the markup, and the value the binding hands back off a page that is not one
//      is the value the markup carried before, so the tablet and the desk are untouched.
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

// ---------------------------------------------------------------- what renderVals hands the template

// Every value the phone tier moves is a binding, so the phone value and the value every wider page
// keeps are written side by side in one expression rather than one being in the markup and the
// other nowhere. What is read back here is that expression: that it asks the flag at all, and that
// its other arm is the literal the markup carried before the tier existed.
const renderVals = logicSrc.slice(logicSrc.indexOf('\n  renderVals('));
// the expression a key is given, up to the comma that ends it: scanned rather than matched, since a
// value here is a ternary holding quoted CSS with commas of its own
function binding(name) {
  const at = new RegExp('[,{\\s]' + name + ': ').exec(renderVals);
  if (!at) return null;
  let i = at.index + at[0].length, depth = 0, quote = null;
  for (; i < renderVals.length; i++) {
    const c = renderVals[i];
    if (quote) { if (c === '\\') i++; else if (c === quote) quote = null; continue; }
    if (c === "'" || c === '"' || c === '`') { quote = c; continue; }
    if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) { if (depth === 0) break; depth--; }
    else if ((c === ',' || c === '\n') && depth === 0) break;
  }
  return renderVals.slice(at.index + at[0].length, i).trim();
}
// A two-armed choice split into its flag and its two arms. Scanned rather than matched for the
// reason above: both arms are quoted CSS carrying colons of their own, so only the first ? and the
// first : outside a quote or a bracket are the ones that divide the expression.
function arms(expr) {
  let depth = 0, quote = null, q = -1, colon = -1;
  for (let i = 0; i < expr.length; i++) {
    const c = expr[i];
    if (quote) { if (c === '\\') i++; else if (c === quote) quote = null; continue; }
    if (c === "'" || c === '"' || c === '`') { quote = c; continue; }
    if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) depth--;
    else if (depth === 0 && c === '?' && q < 0) q = i;
    else if (depth === 0 && c === ':' && q >= 0 && colon < 0) colon = i;
  }
  if (q < 0 || colon < 0) return null;
  const lit = (s) => s.trim().replace(/^'([\s\S]*)'$/, '$1');
  return { flag: expr.slice(0, q).trim(), on: lit(expr.slice(q + 1, colon)), off: lit(expr.slice(colon + 1)) };
}
function tier(name, flag, wide) {
  const expr = binding(name);
  if (expr === null) { fail('renderVals hands the template no ' + name + ', so the composition cannot read the ' + flag + ' tier back'); return null; }
  if (!new RegExp('state\\.' + flag).test(expr)) { fail(name + ' does not read state.' + flag + ': ' + expr); return null; }
  const two = arms(expr);
  if (two === null) { fail(name + ' is not written as a two-armed choice this check can read: ' + expr); return null; }
  if (two.off !== wide) fail(name + ' hands a page that is not a ' + flag + ' ' + JSON.stringify(two.off) + ', not the ' + JSON.stringify(wide) + ' the markup carried before');
  return two;
}

// The home stacks in portrait and stands exactly one screen tall. Not a minimum: a minimum is what
// lets a tall object grow the page, and the home is the one view that must never scroll.
tier('homeMainBox', 'portrait', 'min-height:calc(100vh - 57px);');
tier('homeGridCols', 'portrait', 'minmax(0,1.1fr) minmax(0,0.9fr)');
tier('homeGridRows', 'portrait', 'none');
tier('homeGridGap', 'portrait', 'clamp(16px,4vw,72px)');
tier('homeRollH', 'portrait', 'min(44vh,400px)');
tier('homeCubeH', 'portrait', 'min(40vh,360px)');
{
  const box = arms(binding('homeMainBox') || '');
  const upright = box ? box.on : '';
  if (!/100dvh/.test(upright)) fail('the home main does not stand on the dynamic viewport height in portrait, so the browser chrome pushes it off the screen: ' + JSON.stringify(upright));
  if (!/overflow:hidden/.test(upright)) fail('the home main does not close over its own content in portrait, so the home scrolls: ' + JSON.stringify(upright));
  if (/min-height/.test(upright)) fail('the home main takes a minimum rather than a height in portrait, so a tall object grows the page: ' + JSON.stringify(upright));
}
{
  const rows = arms(binding('homeGridRows') || '');
  if (!rows || !/1fr[\s\S]*1fr/.test(rows.on)) {
    fail('the home grid does not stand its two objects on two rows in portrait: ' + JSON.stringify(rows && rows.on));
  }
  const cols = arms(binding('homeGridCols') || '');
  if (!cols || /\s/.test(cols.on)) {
    fail('the home grid does not stand on one column in portrait: ' + JSON.stringify(cols && cols.on));
  }
  // both objects are sized off the same viewport unit the main is, or the pair could outgrow it
  for (const name of ['homeRollH', 'homeCubeH']) {
    const h = arms(binding(name) || '');
    if (!h || !/dvh/.test(h.on)) fail(name + ' does not size the object off the screen in portrait: ' + JSON.stringify(h && h.on));
  }
}

// The Research chapter is one column on a phone. The margin column is where the aside and every
// figure caption stand; at 390px it is 107px wide, which is not a margin, it is a gutter with words
// falling out of it.
tier('chapterCols', 'phone', 'minmax(0,8fr) minmax(0,4fr)');
tier('essayColumns', 'phone', '2');
tier('paperAsideCol', 'phone', '2');
{
  const cols = arms(binding('chapterCols') || '');
  if (!cols || /\s/.test(cols.on)) fail('the chapter body does not stand on one column on a phone: ' + JSON.stringify(cols && cols.on));
  const essay = arms(binding('essayColumns') || '');
  if (!essay || essay.on !== '1') fail('the essay body still sets more than one text column on a phone: ' + JSON.stringify(essay && essay.on));
  const aside = arms(binding('paperAsideCol') || '');
  if (!aside || aside.on !== '1') fail('the paper aside still stands in the margin column on a phone: ' + JSON.stringify(aside && aside.on));
}

// The running head. The keyboard hint is a 130px slot in a bar that has 305px of content box at
// 360, so it is the one thing on the header a phone cannot carry; there is no keyboard to hint at
// on one either.
tier('hintDisplay', 'phone', 'flex');
{
  const hint = arms(binding('hintDisplay') || '');
  if (!hint || hint.on !== 'none') fail('the keyboard hint is not taken off the running head on a phone: ' + JSON.stringify(hint && hint.on));
}

// ---------------------------------------------------------------- the markup carries no phone values

const branch = (cond) => [...tpl.content.querySelectorAll('sc-if')].find(
  (el) => tight(el.getAttribute('value')) === '{{' + cond + '}}');

{
  const home = branch('isHome');
  if (!home) fail('no <sc-if value="{{ isHome }}"> block: the home is gone');
  else {
    const main = home.querySelector('main[data-screen-label="Home"]');
    if (!tight(main && main.getAttribute('style')).includes('{{homeMainBox}}')) fail('the home main writes its own height instead of reading homeMainBox back');
    const grid = main && main.firstElementChild;
    const gs = tight(grid && grid.getAttribute('style'));
    if (!gs.includes('grid-template-columns:{{homeGridCols}}')) fail('the home grid writes its own columns instead of reading homeGridCols back');
    if (!gs.includes('grid-template-rows:{{homeGridRows}}')) fail('the home grid writes its own rows instead of reading homeGridRows back');
    if (!gs.includes('gap:{{homeGridGap}}')) fail('the home grid writes its own gap instead of reading homeGridGap back');
    const btns = main ? [...main.querySelectorAll('button')] : [];
    if (!tight(btns[0] && btns[0].getAttribute('style')).includes('height:{{homeRollH}}')) fail('the roll writes its own height instead of reading homeRollH back');
    if (!tight(btns[1] && btns[1].getAttribute('style')).includes('height:{{homeCubeH}}')) fail('the cube writes its own height instead of reading homeCubeH back');
  }
}

{
  const chapter = branch('isSerif');
  if (!chapter) fail('no <sc-if value="{{ isSerif }}"> block: the Research chapter is gone');
  else {
    const bodies = [...chapter.querySelectorAll('section')].filter((el) => tight(el.getAttribute('style')).includes('display:grid'));
    if (bodies.length !== 2) fail('expected the paper body and the essay body as the two grid sections of the chapter, found ' + bodies.length);
    for (const b of bodies) {
      if (!tight(b.getAttribute('style')).includes('grid-template-columns:{{chapterCols}}')) {
        fail('a chapter body writes its own columns instead of reading chapterCols back: ' + String(b.getAttribute('style')).slice(0, 90));
      }
    }
    const text = [...chapter.querySelectorAll('div')].find((el) => /(^|;)columns:/.test(tight(el.getAttribute('style'))));
    if (!text) fail('the essay body is gone');
    else if (!tight(text.getAttribute('style')).includes('columns:{{essayColumns}}')) {
      fail('the essay body writes its own text column count instead of reading essayColumns back');
    }
    const aside = [...chapter.querySelectorAll('aside')].find((el) => tight(el.getAttribute('style')).includes('{{paperAsideRow}}'));
    if (!aside) fail('the paper aside no longer reads paperAsideRow');
    else if (!tight(aside.getAttribute('style')).includes('grid-column:{{paperAsideCol}}')) {
      fail('the paper aside writes its own column instead of reading paperAsideCol back');
    }
  }
}
{
  const head = tpl.content.querySelector('header');
  if (!head) fail('the running head is gone');
  else {
    const hint = [...head.querySelectorAll('span')].find((el) => /t \/ e/.test(el.textContent || ''));
    if (!hint) fail('the running head no longer carries the keyboard hint');
    else if (!tight(hint.getAttribute('style')).includes('display:{{hintDisplay}}')) {
      fail('the keyboard hint writes its own display instead of reading hintDisplay back, so it cannot be taken off a phone');
    }
    // the brand and the bar's own side padding are clamps whose floor is a phone size and whose
    // value from PHONE_W up is what the head carried before; a fixed 18px brand is 123px of the 305
    // a 360px page has, and the head does not fit around it
    const brand = [...head.querySelectorAll('span')].find((el) => el.getAttribute('aria-label') === 'Yiliang Shao');
    if (!brand) fail('the running head no longer carries the brand');
    else if (!/font-size:clamp\([^)]*18px\)/.test(tight(brand.getAttribute('style')))) {
      fail('the brand sets a fixed size rather than a clamp that reaches 18px above a phone: ' + String(brand.getAttribute('style')).slice(0, 110));
    }
    const bar = head.firstElementChild;
    if (!/padding:0clamp\((\d+)px,5vw,72px\)/.test(tight(bar && bar.getAttribute('style')))) {
      fail('the running head bar no longer sets its side padding as a clamp of 5vw capped at 72px');
    } else if (Number(/padding:0clamp\((\d+)px,5vw,72px\)/.exec(tight(bar.getAttribute('style')))[1]) >= 20) {
      fail('the running head bar keeps a 20px padding floor, which is the tablet floor; a phone needs it lower');
    }
  }
}
// ---------------------------------------------------------------- report

if (failures.length) {
  console.error('check-phone-layout: ' + failures.length + ' failure' + (failures.length === 1 ? '' : 's'));
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
console.log('check-phone-layout: the phone tier is a refinement of the stacked one over 10 viewports, both flags '
  + 'are written only from their predicates in both places state.narrow is written, and the home reads the '
  + 'portrait tier back and the Research chapter the phone tier, each through a binding whose other arm is '
  + 'the composition the markup carried before');
