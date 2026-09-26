// Checks that a publication's With line names collaborators, not the people its paper thanks.
//
// The chapter header's With item renders the hand-written `with` string of a register entry. For a
// publication that string sits beside a paper module under content/, whose byline says who wrote it
// and whose Acknowledgments say who helped. An acknowledged helper is not a collaborator, so a With
// line that repeats the acknowledgments presents helpers as co-workers (issue #85). A co-author stays
// on the With line even when some other statement in the paper names them, such as a Funding item
// naming the grant holder: only the Acknowledgments are read, and the byline authors are exempt.
//
// Person names are read out of the acknowledgment text as runs of two or three capitalised words (a
// hyphen may join a word, as in An-Tai). That also picks up institutions, so a run holding one of
// the organisational words below is not taken for a person. A run that is part of an author's name,
// or holds one, is dropped. What is left must not appear in the entry's With string.
//
// Run with `npm run check`. Exits non-zero and prints every failure it found.

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readEntries } from './dc-data.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const ORG_WORDS = new Set(['School', 'Design', 'University', 'Laboratory', 'Lab', 'Research', 'Innovation',
  'Foundation', 'Science', 'National', 'Institute', 'Department', 'College', 'Center', 'Centre', 'Studio',
  'Award', 'Council', 'Society', 'Program', 'Office', 'Group']);

// Every string a run array carries, whether bare or inside a {b}, {i}, {t} or nested run.
function textOf(x) {
  if (typeof x === 'string') return x;
  if (Array.isArray(x)) return x.map(textOf).join('');
  if (x && typeof x === 'object') return ['b', 'i', 't', 'r'].map((k) => (k in x ? textOf(x[k]) : '')).join('');
  return '';
}

// The text of every acknowledgment: a fold titled Acknowledgments, or an item whose first bold run
// is "Acknowledgments." inside some other fold (a Funding item next to it is skipped).
function acknowledgments(blocks) {
  const out = [];
  for (const b of blocks) {
    if (!b || b.k !== 'fold' || !Array.isArray(b.items)) continue;
    if (/^Acknowledg/i.test(b.t || '')) { b.items.forEach((it) => out.push(textOf(it))); continue; }
    for (const it of b.items) {
      const first = Array.isArray(it) ? it.find((r) => r && typeof r === 'object') : null;
      if (first && typeof first.b === 'string' && /^Acknowledg/i.test(first.b)) out.push(textOf(it));
    }
  }
  return out.join(' ');
}

function candidateNames(text) {
  const names = new Set();
  const runs = text.match(/[A-Z][a-z]+(?:-[A-Z]?[a-z]+)?(?:\s+[A-Z][a-z]+(?:-[A-Z]?[a-z]+)?)+/g) || [];
  for (const run of runs) {
    const words = run.split(/\s+/);
    for (let n = 2; n <= 3; n++) {
      for (let i = 0; i + n <= words.length; i++) {
        const w = words.slice(i, i + n);
        if (w.some((x) => ORG_WORDS.has(x))) continue;
        names.add(w.join(' '));
      }
    }
  }
  return names;
}

const failures = [];
let checked = 0;
for (const entry of readEntries()) {
  if (!entry.paper) continue;
  const mod = (await import(pathToFileURL(path.join(ROOT, entry.paper)).href)).default;
  const blocks = (mod && mod.blocks) || [];
  const authors = blocks.filter((b) => b && b.k === 'byline')
    .flatMap((b) => (b.authors || []).map((a) => String(a.t || '')));
  const helpers = [...candidateNames(acknowledgments(blocks))]
    .filter((n) => !authors.some((a) => a.includes(n) || n.includes(a)));
  const withLine = String(entry.with || '');
  const named = helpers.filter((n) => new RegExp('\\b' + n.replace(/[-]/g, '\\-') + '\\b').test(withLine));
  checked++;
  if (named.length) failures.push(entry.id + ': the With line names ' + named.join(', ') +
    ', acknowledged in ' + entry.paper + ' but not a byline author');
}

if (!checked) failures.push('no register entry names a paper module, so nothing was checked');
if (failures.length) {
  failures.forEach((f) => console.error('FAIL ' + f));
  process.exit(1);
}
console.log('check-with-line: ' + checked + ' publications, no acknowledged helper on a With line');
