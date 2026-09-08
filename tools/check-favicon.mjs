// Checks that the site declares a favicon, and that the file behind the declaration is the solid black disc
// it is meant to be.
//
// Two rules, on either side of the build.
//
// The source rule is that the declaration lives in the <helmet> block of design/Portfolio.dc.html. Nothing
// else reaches the head: build-dc.mjs writes index.html from a fixed skeleton and copies the helmet into it
// verbatim, so a link typed into index.html survives exactly until the next `npm run build`. The check reads
// both files and requires the built head to carry what the source declares, which is the only way a forgotten
// rebuild shows up before the page does.
//
// The asset rule is what the icon has to be. A tab renders it at 16 CSS pixels, where a shape either reads at
// a glance or is noise, so the mark is one full-bleed disc: a square viewBox, a single circle centred in it
// with the radius of its half-width, painted solid black. Anything inset, hollowed, tinted or accompanied is
// a different mark and this check is where that gets said, because at 16px it is not something the eye
// reliably catches on the page.
//
// Declaring the icon at all is the point of the exercise: with no rel="icon" in the head a browser falls back
// to requesting /favicon.ico, which this site does not serve, and every page load takes a 404 for it.
//
// Run with `npm run check`. Exits non-zero and prints every failure it found.

import { existsSync, readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const SRC = 'design/Portfolio.dc.html';
const BUILT = 'index.html';

const failures = [];
const fail = (msg) => failures.push(msg);

// ---------------------------------------------------------------- the source rule: declared in the helmet

const src = readFileSync(SRC, 'utf8');
const helmet = src.match(/<helmet\s*>([\s\S]*?)<\/helmet\s*>/i);
if (!helmet) {
  console.error('check-favicon: no <helmet> block in ' + SRC + ', so nothing reaches the head at all');
  process.exit(1);
}

const dom = new JSDOM('<!doctype html><body></body>');
const parse = (html) => {
  const host = dom.window.document.createElement('div');
  host.innerHTML = html;
  return host;
};

// rel is a token list: rel="icon shortcut" and rel="shortcut icon" are the same declaration
const iconLinks = (host) => [...host.querySelectorAll('link[rel]')]
  .filter((el) => el.getAttribute('rel').toLowerCase().split(/\s+/).includes('icon'));

const declared = iconLinks(parse(helmet[1]));
if (!declared.length) {
  fail('the helmet block in ' + SRC + ' declares no <link rel="icon">, so every page load falls back to ' +
    'requesting /favicon.ico and takes the 404 for it');
}
if (declared.length > 1) {
  fail(declared.length + ' icon links are declared. One mark, one declaration: a browser picks among them by ' +
    'rules that differ between engines, so which icon the tab shows stops being something this repo decides');
}

const href = declared.length ? declared[0].getAttribute('href') : null;
if (declared.length && !href) fail('the icon link carries no href');
if (href && /^(https?:)?\/\//.test(href)) {
  fail('the icon is loaded from ' + href + '. Everything this site serves is its own file: vendor/ holds the ' +
    'pinned third-party code and nothing is fetched from a CDN');
}

// the head the build actually wrote. A link edited into index.html by hand survives until the next build, and
// this is what says so.
const built = iconLinks(parse(readFileSync(BUILT, 'utf8')));
if (declared.length && !built.length) {
  fail(BUILT + ' carries no icon link although the helmet declares one: the built pair is stale, run `npm run build`');
}
if (built.length && href && built[0].getAttribute('href') !== href) {
  fail(BUILT + ' points at ' + built[0].getAttribute('href') + ' but the helmet declares ' + href +
    ': the built pair is stale, run `npm run build`');
}

// ---------------------------------------------------------------- the asset rule: a solid black disc

const path = href ? href.replace(/^\.?\//, '').replace(/[?#].*$/, '') : null;
if (path && !existsSync(path)) {
  fail('the icon link points at ' + href + ', which is not a file in the repository');
} else if (path && path.endsWith('.svg')) {
  const doc = new dom.window.DOMParser().parseFromString(readFileSync(path, 'utf8'), 'image/svg+xml');
  const svg = doc.documentElement;
  if (svg.nodeName !== 'svg') {
    fail(path + ' does not parse as SVG');
  } else {
    // title, desc, metadata and defs paint nothing; everything else in the root is a mark on the tab
    const NOT_PAINTED = new Set(['title', 'desc', 'metadata', 'defs', 'style']);
    const painted = [...svg.children].filter((el) => !NOT_PAINTED.has(el.nodeName.toLowerCase()));
    const box = (svg.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);

    if (box.length !== 4 || box.some((n) => !Number.isFinite(n))) {
      fail(path + ' has no usable viewBox, so what the disc is full-bleed against is undefined');
    } else if (box[2] !== box[3]) {
      fail(path + ' has a ' + box[2] + ' by ' + box[3] + ' viewBox. A tab slot is square and a disc in a ' +
        'rectangle is scaled into it off-centre or short of the edges');
    }
    if (painted.length !== 1 || painted[0].nodeName.toLowerCase() !== 'circle') {
      fail(path + ' paints ' + (painted.length === 1 ? 'a <' + painted[0].nodeName + '>' : painted.length +
        ' shapes') + '. The mark is one circle and nothing else');
    } else if (box.length === 4 && box[2] === box[3]) {
      const disc = painted[0];
      const num = (name) => Number(disc.getAttribute(name));
      const [x, y, w] = box;
      const want = { cx: x + w / 2, cy: y + w / 2, r: w / 2 };
      for (const [name, value] of Object.entries(want)) {
        if (num(name) !== value) {
          fail(path + ' has ' + name + '="' + disc.getAttribute(name) + '" where a disc filling a ' + w +
            ' unit box wants ' + value + '. The mark is full bleed: at 16px an inset circle reads as a smudge');
        }
      }
      // an absent fill is black by the SVG initial value, so only a stated one can be wrong
      const fill = (disc.getAttribute('fill') || '#000000').trim().toLowerCase();
      if (!['#000', '#000000', 'black', 'rgb(0,0,0)', 'rgb(0, 0, 0)'].includes(fill)) {
        fail(path + ' fills the disc with ' + fill + ', not black');
      }
      for (const name of ['opacity', 'fill-opacity']) {
        const value = disc.getAttribute(name) ?? svg.getAttribute(name);
        if (value != null && Number(value) !== 1) {
          fail(path + ' sets ' + name + '="' + value + '". The disc is solid: a tab composites it over ' +
            'whatever chrome the browser is painting, which is not a ground this repo controls');
        }
      }
    }
  }
}

// ---------------------------------------------------------------- report

if (failures.length) {
  console.error('check-favicon: ' + failures.length + ' failure' + (failures.length === 1 ? '' : 's'));
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
console.log('check-favicon: the helmet and ' + BUILT + ' both declare ' + href + ', a solid black full-bleed disc');
