// Checks that the parchment layer paints above the cell it is clipped into on the Development landing.
//
// The model is drawn on a fixed, full-viewport canvas that sits in the page root as its first child. On the
// Development landing syncParchment anchors that canvas to the platform cell and clips it to the cell's rect, so the
// roll reads as a model standing in one opening of the grid rather than a sheet lying over the whole page.
//
// The cell it is clipped into is opaque and, since the link graph went in behind the landing, positioned with a
// z-index of its own. Two boxes at the same z-index are settled by document order, and the cell comes later in the
// page than the layer: the cell won, and its background painted straight over the model. Nothing reports that. The
// canvas is there, the right size, in the right place, drawing every frame, and the reader sees an empty cell.
//
// So the layer has to be promoted above the cell for exactly the state in which it is clipped into it, and left at
// its resting height everywhere else, where it is a full-page canvas that must not climb over the page. That is the
// same rule syncHome already applies to the home cube's layer when the cube lands on the same cell.
//
// This drives the real syncParchment through the three states the layer can be in and reads the z-index it wrote,
// then reads the cell's own z-index out of the template so a later change to the cell's stacking cannot quietly put
// the model back underneath it.
//
// Run with `npm run check`. Exits non-zero and prints every failure it found.

import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const SRC = 'design/Portfolio.dc.html';

const failures = [];
const fail = (msg) => failures.push(msg);

// the method is read out of the logic class and run for real, so this check cannot drift from a copy of it.
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
  console.error('check-platform-stack: no <x-dc> block in ' + SRC);
  process.exit(1);
}
const markup = src.slice(0, closeAt);
const logicSrc = src.slice(closeAt);
const syncBody = readMethod(logicSrc, 'syncParchment');
if (syncBody === null) {
  console.error('check-platform-stack: the logic class has no syncParchment method, so nothing places the roll');
  process.exit(1);
}

// ---------------------------------------------------------------- the two stacking numbers the template declares

// the tag that carries a given ref or attribute, read back so the check compares the shipped numbers rather than
// two constants copied in here
function tagWith(needle) {
  const at = markup.indexOf(needle);
  if (at < 0) return null;
  const open = markup.lastIndexOf('<', at);
  const close = markup.indexOf('>', at);
  if (open < 0 || close < 0) return null;
  return markup.slice(open, close + 1);
}
function zOf(tag) {
  const m = tag && tag.match(/z-index:\s*(-?\d+)/);
  return m ? Number(m[1]) : null;
}

const layerTag = tagWith('ref="{{ parchLayerRef }}"');
const cellTag = tagWith('data-mod="platform"');
const restZ = zOf(layerTag);
const cellZ = zOf(cellTag);
if (restZ === null) {
  console.error('check-platform-stack: the parchment layer declares no z-index in the template');
  process.exit(1);
}
if (cellZ === null) {
  console.error('check-platform-stack: the wide landing has no positioned data-mod="platform" cell with a z-index; ' +
    'if the cell no longer stacks, this check has lost the thing it was guarding against');
  process.exit(1);
}

// ---------------------------------------------------------------- a browser enough for the method to run in

const dom = new JSDOM('<!doctype html><body></body>');
const doc = dom.window.document;
globalThis.window = dom.window;
globalThis.document = doc;
dom.window.innerWidth = 1440;
dom.window.innerHeight = 900;

globalThis.requestAnimationFrame = () => 1;
globalThis.cancelAnimationFrame = () => {};

const anchor = (x, y, w, h) => {
  const el = doc.createElement('div');
  el.getBoundingClientRect = () => ({ x, y, width: w, height: h, left: x, top: y, right: x + w, bottom: y + h });
  return el;
};

// the standing sheet behind the Research headline, and the plate on the Development landing
const SCRIPT = anchor(500, 120, 437, 700);
const PLATFORM = anchor(880, 158, 508, 440);

function stage() {
  const root = doc.createElement('div');
  const layer = doc.createElement('div');
  root.appendChild(layer);                  // the layer is the root's first child, as the template writes it
  layer.style.zIndex = String(restZ);       // and carries the resting height the template gives it
  doc.body.appendChild(root);
  const app = {
    state: { view: 'page' },
    rootRef: { current: root },
    parchLayerRef: { current: layer },
    homeRollRef: { current: null },
    scriptRef: { current: null },
    platformRef: { current: null },
    parchPose: null,
    CUBE_COLLAPSE_MS: 760,
    bez: (t) => t,
    parch: { setAnchor() {}, setUnroll() {}, quench() {} },
  };
  const sync = new Function(syncBody);
  app.syncParchment = () => sync.call(app);
  app.dropParchPose = () => {};
  return { app, root, layer };
}

const isInset = (v) => typeof v === 'string' && v.startsWith('inset(');

// ---------------------------------------------------------------- landed in the cell: above it

let landedZ = null;
{
  const { app, layer } = stage();
  app.platformRef.current = PLATFORM;
  app.syncParchment();

  if (!isInset(layer.style.clipPath)) {
    fail('the roll settled on the Development plate without being clipped to the cell (clip-path ' +
      (layer.style.clipPath || 'unset') + '); the rest of this case reads nothing');
  }
  landedZ = Number(layer.style.zIndex);
  if (!(landedZ > cellZ)) {
    fail('the layer rests at z-index ' + (layer.style.zIndex || 'unset') + ' while clipped into the platform cell, ' +
      'which is at z-index ' + cellZ + '. The cell comes later in the page, so at or below its height the cell wins ' +
      'and its opaque ground paints straight over the model');
  }
}

// ---------------------------------------------------------------- anchored anywhere else: back at rest

{
  const { app, layer } = stage();
  app.scriptRef.current = SCRIPT;
  app.syncParchment();

  if (layer.style.clipPath !== 'none') {
    fail('the roll on the Research landing was clipped to ' + layer.style.clipPath + '; it stands in the page ' +
      'there and takes no opening');
  }
  if (Number(layer.style.zIndex) !== restZ) {
    fail('the layer was left at z-index ' + (layer.style.zIndex || 'unset') + ' on the Research landing rather than ' +
      'its resting ' + restZ + '. Unclipped it covers the whole viewport, so climbing over the page there would put ' +
      'a full-screen canvas above the reading matter');
  }
}

// ---------------------------------------------------------------- a travel in flight: left alone

{
  const { app, layer } = stage();
  app.platformRef.current = PLATFORM;
  doc.body.appendChild(layer);              // lifted out of the root for the trip
  layer.style.zIndex = '4';                 // riding above the page-morph snapshot, below the header
  app.parchTween = { k: 1, to: {} };
  app.syncParchment();

  if (layer.style.zIndex !== '4') {
    fail('a sync during a travel rewrote the flying layer\'s z-index to ' + (layer.style.zIndex || 'unset') +
      '; while the layer is on the body it is riding at 4 and the resting rule has no say over it');
  }
  if (layer.style.clipPath !== 'none') {
    fail('a sync during a travel clipped the flying layer to ' + layer.style.clipPath + ', which would blink the ' +
      'roll away where it stands out in the page');
  }
}

// ---------------------------------------------------------------- report

if (failures.length) {
  console.error('check-platform-stack: ' + failures.length + ' failure' + (failures.length === 1 ? '' : 's'));
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
console.log('check-platform-stack: the roll clipped into the platform cell paints above it at z-index ' + landedZ +
  ' over the cell\'s ' + cellZ + ', and drops back to ' + restZ + ' everywhere else');
