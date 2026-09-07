// Checks what feeds the parchment roll's burn, and how densely the sim samples it.
//
// The roll standing behind the Research headline catches fire from the lit ink in front of it. Two rules make
// that work, and they live on opposite sides of one seam.
//
// The page's rule is which ink counts. feedParchment() walks the hero column and reports every glyph the text
// effect has lit, as an ink box in container fractions plus its glow. Every text pane in that column carries
// data-tr and glows the same way, so all of them feed the roll: the headline and the note beneath it alike. A
// query narrowed to one pane leaves the sheet under the others permanently cold, which is what this check exists
// to catch, and nothing in the browser would say so.
//
// The sim's rule is how finely a reported box is sampled. That is boxSamples() in parchment.js, and it is the sim's
// business rather than the page's because it depends on the sim's grid. The heat kernel is an ellipse reaching
// HEAT.radius in v and radius/sqrt(3.5) in u, so points spaced closer than that land inside a neighbour's reach.
// The rule matters for cost, not only fidelity: the sources are stepped every frame, so a fixed six points per
// glyph would multiply the sim's per-frame work by the glyph count the moment a paragraph of body type became a
// heat source. A headline letterform spans several kernels and is traced around its profile; a glyph of body type
// is under one kernel and is a single point.
//
// The uv spans used below come from the Research hero: the sheet stands rotated, so its length runs down the
// anchor box (about 700px tall) and its width across it (about 437px, the 1/1.6 aspect). An 86px headline glyph
// is therefore about 0.12 of the sheet in u and 0.11 in v; a 15px glyph of the bio about 0.021 and 0.018. Only
// the side of the kernel each lands on matters, and both clear it with room to spare.
//
// Run with `npm run check`. Exits non-zero and prints every failure it found.

import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { boxSamples } from '../parchment.js';

const SRC = 'design/Portfolio.dc.html';

const failures = [];
const fail = (msg) => failures.push(msg);

// ---------------------------------------------------------------- the page's rule: which ink counts

// feedParchment is read out of the logic class and run for real, so this check cannot drift from a copy of it.
// Every member of that class sits at two-space indent, so `\n  }` closes the method.
function readMethod(src, name) {
  const at = src.indexOf('\n  ' + name + '(');
  if (at < 0) return null;
  const open = src.indexOf('{', at);
  const end = src.indexOf('\n  }', open);
  if (open < 0 || end < 0) return null;
  return src.slice(open + 1, end);
}

const src = readFileSync(SRC, 'utf8');
const closeAt = src.lastIndexOf('</x-dc>');
if (closeAt < 0) {
  console.error('check-burn-source: no <x-dc> block in ' + SRC);
  process.exit(1);
}
const body = readMethod(src.slice(closeAt), 'feedParchment');
if (body === null) {
  console.error('check-burn-source: the logic class has no feedParchment method, so the roll has no heat source');
  process.exit(1);
}

const dom = new JSDOM('<!doctype html><body></body>');
const doc = dom.window.document;
const rect = (el, x, y, w, h) => {
  el.getBoundingClientRect = () => ({ x, y, width: w, height: h, left: x, top: y, right: x + w, bottom: y + h });
};

// the hero column as the Research landing builds it: a headline and the bio note under it, both mounted with the
// serif glow effect, plus a byline that carries no data-tr and must stay out of the heat
const col = doc.createElement('div');
col.innerHTML = '<div><h1 data-tr="title"></h1><p data-morph="byline"></p></div><div><p data-tr="wake"></p></div>';
const lit = (parent, x, y, w, h, blur) => {
  const s = doc.createElement('span');
  // the browser serialises `0 0 Npx rgba(...)` back as `rgba(...) 0px 0px Npx`
  s.setAttribute('style', 'color: rgb(182, 130, 53); text-shadow: rgba(182, 130, 53, 0.7) 0px 0px ' + blur + 'px');
  parent.appendChild(s);
  rect(s, x, y, w, h);
  return s;
};

const headline = col.querySelector('[data-tr="title"]');
const byline = col.querySelector('[data-morph="byline"]');
const note = col.querySelector('[data-tr="wake"]');
const HEADLINE = [], NOTE = [];
for (let i = 0; i < 4; i++) HEADLINE.push(lit(headline, 420 + i * 52, 300, 50, 86, 12.6));
for (let i = 0; i < 6; i++) NOTE.push(lit(note, 500 + i * 9, 560, 8, 15, 11.9));
// glyphs the cursor has left behind: the effect still writes a shadow, but too faint to be heat
for (let i = 0; i < 3; i++) lit(note, 500 + i * 9, 600, 8, 15, 1.4);
lit(byline, 480, 470, 40, 22, 13.0);
rect(col, 0, 0, 1200, 800);

const roll = doc.createElement('div');
rect(roll, 0, 0, 1200, 800);

let reported = null;
const app = {
  parchLayerRef: { current: roll },
  heroTextRef: { current: col },
  parch: { setSources(glyphs) { reported = glyphs; } },
};
try {
  new Function(body).call(app);
} catch (e) {
  console.error('check-burn-source: feedParchment threw when run against a stand-in hero column: ' + e.message);
  process.exit(1);
}

if (reported === null) {
  fail('feedParchment never handed the roll any sources');
} else {
  // a source is attributed to the glyph whose span it falls inside. Extent is read defensively so that a source
  // reported without one is diagnosed as the missing box it is, rather than as a pane gone cold
  const near = (box, el) => {
    const b = el.getBoundingClientRect(), w = box.w > 0 ? box.w : 0, h = box.h > 0 ? box.h : 0;
    return box.x * 1200 >= b.left - 1 && box.y * 800 >= b.top - 1 &&
      (box.x + w) * 1200 <= b.right + 1 && (box.y + h) * 800 <= b.bottom + 1;
  };
  const from = (els) => reported.filter((g) => els.some((el) => near(g, el)));
  const fromHeadline = from(HEADLINE), fromNote = from(NOTE);

  if (!fromHeadline.length) fail('the headline feeds the roll no heat, so hovering the title no longer burns it');
  if (!fromNote.length) {
    fail('the note under the headline feeds the roll no heat: the sheet behind it stays cold however the cursor ' +
      'rakes it. Every [data-tr] pane in the hero column is lit ink and belongs to the heat source, not the title alone');
  }
  if (reported.length !== HEADLINE.length + NOTE.length) {
    fail('feedParchment reported ' + reported.length + ' sources for ' + (HEADLINE.length + NOTE.length) +
      ' lit glyphs. One box to a glyph: how finely a box is sampled is boxSamples() in parchment.js, and a page ' +
      'that pre-samples it multiplies the sim\'s per-frame work by the glyph count');
  }
  for (const g of reported) {
    if (!(g.w > 0) || !(g.h > 0)) { fail('a source has no extent (w ' + g.w + ', h ' + g.h + '): the sim samples an ink box, not a point'); break; }
    if (!(g.glow > 0)) { fail('a source has no glow, so the sim cannot tell kindling ink from a cold letter'); break; }
    if (g.x < 0 || g.y < 0 || g.x + g.w > 1 || g.y + g.h > 1) { fail('a source falls outside the roll container: boxes are container fractions 0..1'); break; }
  }
  if (reported.some((g) => g.glow < 0.2)) fail('a glyph too faint to kindle paper was reported as a source');
}

// ---------------------------------------------------------------- the sim's rule: how finely a box is sampled

const U_HEADLINE = 0.12, V_HEADLINE = 0.11; // an 86 by 50px letterform on the standing sheet
const U_NOTE = 0.021, V_NOTE = 0.018;       // a 15 by 8px glyph of the bio

const at = (u0, v0, du, dv) => boxSamples(u0, u0 + du, v0, v0 + dv);
const headSamples = at(0.4, 0.4, U_HEADLINE, V_HEADLINE);
const noteSamples = at(0.4, 0.6, U_NOTE, V_NOTE);

if (headSamples.length !== 6) {
  fail('a headline letterform samples to ' + headSamples.length + ' points, not the six its profile has always ' +
    'burned with');
}
if (noteSamples.length !== 1) {
  fail('a glyph of body type samples to ' + noteSamples.length + ' points. It is smaller than one heat kernel, so ' +
    'the extra points land inside each other\'s reach and only cost the sim a frame budget it spends every frame');
}
const huge = at(0.05, 0.05, 0.9, 0.9);
if (huge.length > 6) fail('a box the size of the sheet samples to ' + huge.length + ' points; six is the cap');
for (const [u, v] of [...headSamples, ...noteSamples, ...huge]) {
  if (!(u >= 0 && u <= 1 && v >= 0 && v <= 1)) { fail('a sample at u ' + u + ', v ' + v + ' fell outside the box it came from'); break; }
}
// a box that spans many kernels in one direction and none in the other is a rule of type, not an edge case:
// it is what a wide, short glyph looks like, and it must not collapse to a single point
const wide = at(0.4, 0.4, U_NOTE, V_HEADLINE);
if (wide.length < 3) fail('a wide, short box samples to only ' + wide.length + ' points; each axis counts kernels on its own');

// ---------------------------------------------------------------- report

if (failures.length) {
  console.error('check-burn-source: ' + failures.length + ' failure' + (failures.length === 1 ? '' : 's'));
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
console.log('check-burn-source: the hero column feeds the roll ' + reported.length + ' ink boxes across ' +
  'headline and note, sampled at ' + headSamples.length + ' points for a headline letterform and ' +
  noteSamples.length + ' for a glyph of body type');
