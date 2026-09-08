// Prints the TUNED table that check-research-leaves freezes, read off the current composition.
//
// The freeze exists to catch a leaf moving by accident. When the composition is changed on purpose,
// in the tuning panel behind ?dev, the freeze has to be re-taken rather than edited by hand, or it
// records a layout nobody chose. Run `node tools/freeze-leaves.mjs` and paste the block over the
// TUNED literal in tools/check-research-leaves.mjs.

import { readFileSync } from 'node:fs';

const src = readFileSync('design/Portfolio.dc.html', 'utf8').replace(/\r\n/g, '\n');
const logicSrc = src.slice(src.lastIndexOf('</x-dc>'));

const from = logicSrc.indexOf('\n  LEAF_SPREADS = {');
const tail = logicSrc.indexOf('\n  leafSlots(side, rows) {', from);
const to = logicSrc.indexOf('\n  }\n', tail);
if (from < 0 || tail < 0 || to < 0) {
  console.error('freeze-leaves: could not lift the geometry out of the logic class');
  process.exit(1);
}
// eslint-disable-next-line no-new-func
const geo = new Function('return new (class {' + logicSrc.slice(from, to + 4) + '})()')();

const KEYS = ['row', 'col', 'selfY', 'selfX', 'imgH', 'ratio', 'maxW', 'titleSize', 'dir',
  'alignItems', 'align', 'px', 'py', 'dur', 'delay', 'offsetX', 'offsetY', 'bleedX', 'bleedY', 'stackH', 'beside', 'edge'];

// beside and edge are booleans, and quoting one would freeze the string "false" rather than the choice
const line = (s) => '    { ' + KEYS.filter((k) => s[k] !== undefined)
  .map((k) => k + ': ' + (typeof s[k] === 'boolean' ? String(s[k]) : "'" + s[k] + "'")).join(', ') + ' },';

const out = ['const TUNED = {'];
for (const side of ['left', 'right']) {
  const slots = geo.leafSlots(side, 3);
  // only the slots the register actually fills are part of the composition the page was set with
  const used = side === 'left' ? 4 : 4;
  out.push('  ' + side + ': [');
  slots.slice(0, used).forEach((s) => out.push('  ' + line(s)));
  out.push('  ],');
}
out.push('};');
console.log(out.join('\n'));
