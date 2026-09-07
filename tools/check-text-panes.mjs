// Checks that every text pane on a Research chapter declares the effect it runs.
//
// A pane is an element carrying data-tr. mountTextEffects reads data-reg for the register and
// data-fx for the effect family, and looks the pair up in the TEXT_FX table in the logic class; a
// pane naming no family takes its register's default. This file guards three things:
//
//   1. Every pane the Research chapter is supposed to carry is still there, still on the serif
//      register, and still asking for the ripple. A pane loses its effect silently in the browser,
//      so the seam has to be the template.
//   2. Nothing anywhere in the template names an effect family the table has no row for, and
//      nothing declares data-fx without data-tr, which would read as configured and do nothing.
//   3. The chapter's justified two-column body still carries no pane. TextRippling flattens the
//      element it is given and sets every word inline-block, which drops the drop cap and stops
//      hyphenation, so issue #28 rules that body out. It is prose a future edit would reach for.
//
// The blocks renderPaper builds (byline, keywords, h2, h3) are React.createElement calls in the
// logic class, not template markup, so they have no static seam here and are covered in the
// browser instead.
//
// Run with `npm run check`. Exits non-zero and prints every failure it found.

import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const SRC = 'design/Portfolio.dc.html';

const failures = [];
const fail = (msg) => failures.push(msg);

const src = readFileSync(SRC, 'utf8');
const openMatch = /<x-dc(?:\s[^>]*)?>/.exec(src);
const closeAt = src.lastIndexOf('</x-dc>');
if (!openMatch || closeAt < 0) {
  console.error('check-text-panes: no <x-dc> block in ' + SRC);
  process.exit(1);
}
const templateSrc = src.slice(openMatch.index + openMatch[0].length, closeAt);
const logicSrc = src.slice(closeAt);

const dom = new JSDOM('<!doctype html><body></body>');
const tpl = dom.window.document.createElement('template');
tpl.innerHTML = templateSrc;

const tight = (s) => String(s || '').replace(/\s+/g, '');
const styleOf = (el) => el.getAttribute('style') || '';

// ---------------------------------------------------------------- the effect table

// TEXT_FX is a plain literal on purpose, so the rows can be read without running the logic class.
// Its keys are '<register>/<family>', which is exactly the pair a pane declares.
function readEffectTable() {
  const at = logicSrc.indexOf('  TEXT_FX = {');
  if (at < 0) { fail('the logic class has no TEXT_FX table, so no pane can be checked against it'); return null; }
  const end = logicSrc.indexOf('\n  };', at);
  if (end < 0) { fail('TEXT_FX is not closed with "  };" so it cannot be read'); return null; }
  const body = logicSrc.slice(at, end);
  const rows = new Set();
  const entry = /^\s*'([a-z]+)\/([a-z]+)':\s*\{/;
  for (const line of body.split('\n').slice(1)) {
    if (!line.trim()) continue;
    if (/^\s*\/\//.test(line)) continue;
    const m = entry.exec(line);
    if (!m) { fail('TEXT_FX has a line this check cannot read, so a row could hide in it: ' + line.trim()); continue; }
    const key = m[1] + '/' + m[2];
    if (rows.has(key)) fail('TEXT_FX names ' + key + ' twice');
    rows.add(key);
  }
  if (!rows.size) fail('TEXT_FX is empty');
  return rows;
}

const rows = readEffectTable();
const families = rows ? new Set([...rows].map((k) => k.split('/')[1])) : null;

// ---------------------------------------------------------------- every pane in the template

for (const el of tpl.content.querySelectorAll('[data-fx]')) {
  const fx = el.getAttribute('data-fx');
  const reg = el.getAttribute('data-reg');
  const name = el.tagName.toLowerCase() + (el.getAttribute('key') ? ' [key=' + el.getAttribute('key') + ']' : '');
  if (!el.hasAttribute('data-tr')) {
    fail(name + ' declares data-fx="' + fx + '" without data-tr, so mountTextEffects never sees it');
  }
  if (families && !families.has(fx)) {
    fail(name + ' names an effect family TEXT_FX has no row for: data-fx="' + fx + '" (known: ' + [...families].sort().join(', ') + ')');
  }
  if (rows && reg && fx && !rows.has(reg + '/' + fx)) {
    fail(name + ' asks for ' + reg + '/' + fx + ', which TEXT_FX has no row for (rows: ' + [...rows].sort().join(', ') + ')');
  }
  if (!reg) fail(name + ' declares data-fx="' + fx + '" but no data-reg, so it cannot name a row');
}

// ---------------------------------------------------------------- the Research chapter's panes

const chapterBlock = (cond) =>
  [...tpl.content.querySelectorAll('sc-if')].find(
    (el) => tight(el.getAttribute('value')) === '{{' + cond + '}}' &&
      el.querySelector('main[data-screen-label="Chapter"]'));

const serif = chapterBlock('isSerif');
if (!serif) fail('no <sc-if value="{{ isSerif }}"> block holding a main[data-screen-label="Chapter"]: the Research chapter body is missing');

// Every pane the chapter is supposed to carry, named by the key prefix it is keyed to the chapter
// with. `least` is how many of that pane the branch holds: the aside is written twice, once for a
// chapter whose body is a paper module and once for a chapter that carries body1..3 instead.
const PANES = [
  { key: 'kicker', least: 1, what: 'the kicker line above the chapter title' },
  { key: 'title', least: 1, what: 'the chapter title' },
  { key: 'lede', least: 1, what: 'the lede under the title' },
  { key: 'spec-role', least: 1, what: 'the Role value in the title block' },
  { key: 'spec-with', least: 1, what: 'the With value in the title block' },
  { key: 'spec-status', least: 1, what: 'the Status value in the title block' },
  { key: 'spec-pages', least: 1, what: 'the Pages value in the title block' },
  { key: 'cap-hero', least: 1, what: 'the text of the hero plate caption' },
  { key: 'margin', least: 2, what: 'the margin quote in the aside' },
  { key: 'stack', least: 2, what: 'the Made with value in the aside' },
  { key: 'link', least: 2, what: 'the Further link in the aside' },
  { key: 'next', least: 1, what: 'the next-chapter title in the chapter nav' },
];

if (serif) {
  const main = serif.querySelector('main[data-screen-label="Chapter"]');
  if (main.getAttribute('key') !== '{{ chapterKey }}') fail('the Research chapter main lost key="{{ chapterKey }}"');

  const keyed = [...main.querySelectorAll('[key]')];
  const named = (prefix) => keyed.filter((el) => tight(el.getAttribute('key')).startsWith(prefix + '-{{'));

  for (const pane of PANES) {
    const found = named(pane.key);
    if (found.length < pane.least) {
      fail('the Research chapter is missing a pane: ' + pane.what + ' (expected ' + pane.least +
        ' element(s) keyed "' + pane.key + '-{{ ... }}", found ' + found.length + ')');
      continue;
    }
    for (const el of found) {
      const at = el.tagName.toLowerCase() + ' [key=' + el.getAttribute('key') + '] (' + pane.what + ')';
      if (el.getAttribute('data-tr') !== 'wake') fail(at + ' carries no data-tr="wake", so the cursor does not reach it');
      if (el.getAttribute('data-reg') !== 'serif') fail(at + ' is not on the serif register: data-reg=' + JSON.stringify(el.getAttribute('data-reg')));
      if (el.getAttribute('data-fx') !== 'ripple') fail(at + ' does not ask for the ripple: data-fx=' + JSON.stringify(el.getAttribute('data-fx')));
    }
  }

  // The two-column justified body stays plain. TextRippling would flatten the drop cap out of the
  // first paragraph and stop hyphenation in all three, which issue #28 rules out.
  for (const col of main.querySelectorAll('*')) {
    const s = tight(styleOf(col));
    if (!s.includes('columns:2') || !s.includes('text-align:justify')) continue;
    for (const el of [col, ...col.querySelectorAll('*')]) {
      if (el.hasAttribute('data-tr')) {
        fail('the chapter\'s justified two-column body carries a pane on <' + el.tagName.toLowerCase() +
          '>: flattening it drops the drop cap and stops hyphenation, which issue #28 rules out');
      }
    }
  }
}

// ---------------------------------------------------------------- report

if (failures.length) {
  console.error('check-text-panes: ' + failures.length + ' failure(s)');
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
console.log('check-text-panes: ok');
