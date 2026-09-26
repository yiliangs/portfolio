// Checks that a chapter's hero plate is cut to its picture, not to the mat around it.
//
// The serif chapter's hero sits in a figure of class plate, and the design system's .plate rule gives
// that figure a 6px surface mat under box-sizing:border-box. An aspect-ratio on the figure therefore
// governs the box outside the mat, and the box inside it, where the picture is drawn, comes out 12px
// short on each axis: no longer the picture's ratio. A landscape picture drawn there with
// object-fit:contain is limited by height and leaves a band of bare page on its left and right, about
// 6(r - 1) px a side for a picture of ratio r, with the mat alone above and below it (issue #84).
//
// The ratio belongs to the picture and the mat belongs to the figure. So the figure declares no
// aspect-ratio and sizes to what it holds; every picture inside it, the img and the placeholder
// image-slot alike, carries the entry's own ratio; and none of them is stretched to a height:100% that
// would need a figure height to stretch to.
//
// Run with `npm run check`. Exits non-zero and prints every failure it found.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'design', 'Portfolio.dc.html'), 'utf8');

const failures = [];
const fail = (msg) => failures.push(msg);

const open = '<figure class="plate" data-shape="frame-{{ current.figNo }}"';
const at = src.indexOf(open);
if (at < 0) {
  fail('the serif chapter hero figure (' + open + ') was not found in design/Portfolio.dc.html');
} else {
  const end = src.indexOf('</figure>', at);
  const figure = src.slice(at, end);
  const figTag = figure.slice(0, figure.indexOf('>') + 1);
  const styleOf = (tag) => (tag.match(/style="([^"]*)"/) || [, ''])[1];

  if (/aspect-ratio\s*:/.test(styleOf(figTag))) {
    fail('the hero figure declares an aspect-ratio; under the .plate mat that cuts the box outside the mat, not the picture');
  }

  const pictures = [...figure.matchAll(/<(img|image-slot)\b[^>]*>/g)];
  if (pictures.length === 0) fail('the hero figure holds no img or image-slot');
  for (const [tag, name] of pictures) {
    const style = styleOf(tag);
    if (!/aspect-ratio\s*:\s*\{\{\s*heroRatio\s*\}\}/.test(style)) {
      fail('the hero ' + name + ' does not declare aspect-ratio:{{ heroRatio }}');
    }
    if (/height\s*:\s*100%/.test(style)) {
      fail('the hero ' + name + ' declares height:100%, which needs a figure height the plate no longer has');
    }
  }
}

if (failures.length) {
  for (const f of failures) console.error('FAIL ' + f);
  console.error(failures.length + ' failure(s)');
  process.exit(1);
}
console.log('check-hero-plate: ok');
