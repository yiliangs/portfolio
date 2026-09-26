// Checks that a Research leaf keeps its own picture filter under the pointer.
//
// Each leaf on the Research landing carries a per-leaf `filter:{{ lf.filter }}`: a real render is
// shown as it is, and only the stock photographs wear the sepia mat. The build compiles a
// `style-hover` attribute into a `:hover` rule with `!important`, so any `filter` declared there
// replaces the leaf's own for as long as the pointer rests on it, which is the moment of every click.
// The click then carries that value into the morph, because the flight starts from the hovered
// computed style. It happened once: a sepia hover filter tinted every real render yellow on click.
// This file exists so the hover style of a leaf never declares a filter again.
//
// Run with `npm run check`. Exits non-zero and prints every failure it found.

import { readFileSync } from 'node:fs';

const SRC = 'design/Portfolio.dc.html';
const src = readFileSync(SRC, 'utf8');
const failures = [];

const buttons = [...src.matchAll(/<button\b[^>]*>/g)];
let leaves = 0;
for (const m of buttons) {
  const tag = m[0];
  if (!/data-shape="leaf-/.test(tag)) continue;
  const hover = tag.match(/style-hover="([^"]*)"/);
  if (!hover) continue;
  leaves++;
  const line = src.slice(0, m.index).split('\n').length;
  const decls = hover[1].split(';').map((d) => d.trim()).filter(Boolean);
  for (const d of decls) {
    if (/^filter\s*:/i.test(d)) failures.push(`${SRC}:${line}: leaf style-hover declares "${d}"`);
  }
}

if (leaves === 0) failures.push(`${SRC}: found no leaf button with a style-hover; the markup this check guards has moved`);

if (failures.length) {
  console.error(`check-leaf-hover: ${failures.length} failure(s)`);
  for (const f of failures) console.error('  ' + f);
  process.exit(1);
}
console.log(`check-leaf-hover: ok (${leaves} leaf hover styles, none declares a filter)`);
