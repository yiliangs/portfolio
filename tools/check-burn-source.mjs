// Checks what feeds the parchment roll's burn, and how densely the sim samples it.
//
// The roll standing behind the Research headline catches fire from the lit ink in front of it. Two rules make
// that work, and they live on opposite sides of one seam.
//
// The page's rule is which ink counts. feedParchment() asks every text effect standing in the hero column for the
// glyphs it has lit and reports each as an ink box in container fractions plus its glow. Every text pane in that
// column carries data-tr and glows the same way, so all of them feed the roll: the headline and the note beneath
// it alike. A pass narrowed to one pane leaves the sheet under the others permanently cold, which is what this
// check exists to catch, and nothing in the browser would say so.
//
// The lit glyphs come from the effects rather than out of the DOM, so the stand-ins below are effect instances
// rather than spans of markup, and the box the fractions are taken against is the one the sim keeps for its own
// projection rather than a rect measured off the layer. Both of those are cost decisions with a correctness edge:
// a rect read here is a document laid out again every breathing frame, and the two obvious substitutes for it,
// the layer's own rect and the viewport, are neither of them the box the sim projects out of. So the stand-in
// roll's rect fails the check if it is read at all, and so does any reach for the window.
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
// serif glow effect, plus a byline that carries no effect and must stay out of the heat. The panes are stand-in
// effect instances, because that is what feedParchment reads now: each one owns its element and reports the
// glyphs it has lit, in viewport pixels, with the glow that lit them.
const col = doc.createElement('div');
col.innerHTML = '<div><h1 data-tr="title"></h1><p data-morph="byline"></p></div><div><p data-tr="wake"></p></div>';
const glyphs = (x, y, w, h, n, step, glow) => {
  const out = [];
  for (let i = 0; i < n; i++) out.push({ x: x + i * step, y, w, h, glow });
  return out;
};
const pane = (el, lit) => ({ element: el, _destroyed: false, __lit: lit, litGlyphs(minGlow) { return lit.filter((g) => g.glow >= minGlow); } });

const headline = col.querySelector('[data-tr="title"]');
const byline = col.querySelector('[data-morph="byline"]');
const note = col.querySelector('[data-tr="wake"]');
const HEADLINE = glyphs(420, 300, 50, 86, 4, 52, 0.9);
// the note's own lit glyphs, and behind them the ones the cursor has left: the effect still has a glow on them,
// but too faint to be heat
const NOTE = glyphs(500, 560, 8, 15, 6, 9, 0.85);
const FAINT = glyphs(500, 600, 8, 15, 3, 9, 0.1);

// a pane outside the hero column: its ink is lit the same way and must not reach the roll
const outside = doc.createElement('p');
doc.body.appendChild(outside);

// a destroyed instance is still on the list until the next mount sweeps it, and its chars were measured against a
// layout that has gone; it must not feed the roll either
const stale = pane(byline, glyphs(480, 470, 40, 22, 1, 0, 0.93));
stale._destroyed = true;

const trInstances = [
  pane(headline, HEADLINE),
  pane(note, NOTE.concat(FAINT)),
  stale,
  pane(outside, glyphs(60, 60, 40, 22, 2, 44, 0.93)),
];

const VW = 1200, VH = 800;
rect(col, 0, 0, VW, VH);

// The box the ink boxes are fractions of is the one the sim keeps for its own projection, not one measured off
// the layer here. It is deliberately not the layer's rect below, and not the viewport either: a fixed layer
// inside the app root takes the root's box, so the two genuinely differ on the page, and a fraction taken
// against the wrong one puts every source somewhere else on the sheet. Measuring the layer is also the layout
// per frame this seam exists to avoid, so the rect is booby-trapped.
const roll = doc.createElement('div');
roll.getBoundingClientRect = () => {
  fail('feedParchment measured the roll layer. It runs every breathing frame, right after the text effect has ' +
    'written its styles, so that rect lays the whole document out again; the sim already keeps the size and ' +
    'hands it over for nothing');
  return { x: 0, y: 0, width: 600, height: 400, left: 0, top: 0, right: 600, bottom: 400 };
};

let reported = null;
const app = {
  parchLayerRef: { current: roll },
  heroTextRef: { current: col },
  trInstances,
  parch: { layerSize: () => ({ w: VW, h: VH }), setSources(list) { reported = list; } },
};
try {
  // a window the method has no business reading, so that reaching for the viewport is caught here rather than
  // in the browser, where a 15px error looks like nothing at all
  const window = new Proxy({}, { get(_, k) { fail('feedParchment read window.' + String(k) + '. The layer is not ' +
    'the viewport: it sits inside the app root and takes the root\'s box, so viewport pixels put every source ' +
    'about one percent off across the sheet'); return 0; } });
  new Function('window', body).call(app, window);
} catch (e) {
  console.error('check-burn-source: feedParchment threw when run against a stand-in hero column: ' + e.message);
  process.exit(1);
}

if (reported === null) {
  fail('feedParchment never handed the roll any sources');
} else {
  // a source is attributed to the glyph whose box it falls inside. Extent is read defensively so that a source
  // reported without one is diagnosed as the missing box it is, rather than as a pane gone cold
  const near = (box, g) => {
    const w = box.w > 0 ? box.w : 0, h = box.h > 0 ? box.h : 0;
    return box.x * VW >= g.x - 1 && box.y * VH >= g.y - 1 &&
      (box.x + w) * VW <= g.x + g.w + 1 && (box.y + h) * VH <= g.y + g.h + 1;
  };
  const from = (list) => reported.filter((box) => list.some((g) => near(box, g)));
  const fromHeadline = from(HEADLINE), fromNote = from(NOTE);

  if (!fromHeadline.length) fail('the headline feeds the roll no heat, so hovering the title no longer burns it');
  if (!fromNote.length) {
    fail('the note under the headline feeds the roll no heat: the sheet behind it stays cold however the cursor ' +
      'rakes it. Every [data-tr] pane in the hero column is lit ink and belongs to the heat source, not the title alone');
  }
  if (from(trInstances[trInstances.length - 1].__lit).length) {
    fail('a text pane standing outside the hero column fed the roll. Every pane on the page is lit the same way, ' +
      'so the sheet would take heat from ink that is nowhere near it');
  }
  if (from(stale.__lit).length) {
    fail('a destroyed instance fed the roll. Its chars were measured against a layout that has gone, so the boxes ' +
      'it reports land wherever that layout used to be');
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
