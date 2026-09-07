// Guards the CV page from both ends.
//
// index.html and app.js are generated from design/Portfolio.dc.html, so the first half of this file
// asks the shipped artefact whether the CV view is compiled in, whether it reads cv.json, and
// whether any placeholder contact or dead cv.pdf link survived into what the browser downloads.
//
// The second half exercises the typesetting itself. The rules in cvModel() are a port of
// templates/resume.typ and lib/style.typ from the private curriculum-vitae repository, and a port
// can drift silently: a broken date, an unbolded metric or a paper that starts reading as published
// all render as ordinary-looking text. The logic class is a plain class body inside the design
// source, which is how tools/check-sheet-grid.mjs and tools/build-dc.mjs already read it, so it can
// be evaluated here against the real cv.json without a DOM.
//
// Run with `npm test`, after `npm run build`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { sourcePath } from './export-cv.mjs';

const read = (name) => readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const app = read('app.js');
const html = read('index.html');
const built = { 'app.js': app, 'index.html': html };

// the logic class, lifted out of the design source and given the two globals it constructs against
function logic() {
  const src = read('design/Portfolio.dc.html');
  const body = /<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/.exec(src);
  assert.ok(body, 'design/Portfolio.dc.html has no logic script');
  const React = { createRef: () => ({ current: null }) };
  class DCLogic { constructor() { this.props = {}; this.state = {}; } setState() {} }
  const Component = new Function('React', 'DCLogic', body[1] + '\nreturn Component;')(React, DCLogic);
  return new Component();
}

const flatten = (parts) => parts.map((p) => p.t).join('');
const bolded = (parts) => parts.filter((p) => p.w === '600').map((p) => p.t);

test('the built site carries the CV view and reads cv.json', () => {
  assert.ok(app.includes("fetch('./cv.json')"), 'app.js never fetches cv.json');
  assert.ok(app.includes('"data-screen-label": "CV"'), 'app.js has no main labelled CV');
  assert.ok(app.includes('goCv'), 'app.js has no way into the CV view');
  assert.ok(existsSync(new URL('../cv.json', import.meta.url)), 'cv.json is not at the site root');
});

test('the built site carries the CV stylesheet the page needs', () => {
  assert.ok(html.includes('.cv-row'), 'index.html lost the CV entry-row rule');
  assert.ok(html.includes('@media print'), 'index.html lost the print rules');
  assert.ok(html.includes('[data-print="hide"]'), 'index.html lost the print hook for the fixed layers');
});

test('no placeholder contact and no dead CV download survive the build', () => {
  for (const [name, text] of Object.entries(built)) {
    assert.ok(!text.includes('hello@example.com'), name + ' still carries the placeholder address');
    assert.ok(!text.includes('cv.pdf'), name + ' still links to a cv.pdf that does not exist');
  }
});

// The real number is never written into this repository, so it is read back out of the private
// source when that source is reachable, and the check is skipped when it is not.
test('the built site does not carry the private phone number', (t) => {
  const src = sourcePath();
  if (!existsSync(src)) { t.skip('the private source is not reachable here'); return; }
  const phone = /^\s*phone:\s*"([^"]*)"/m.exec(readFileSync(src, 'utf8'));
  if (!phone) { t.skip('the source carries no phone number'); return; }
  const digits = phone[1].replace(/\D/g, '');
  assert.ok(digits.length >= 10, 'the phone number read back from the source looks wrong');
  for (const [name, text] of Object.entries(built)) {
    assert.ok(!text.includes(phone[1]), name + ' carries the phone number as written');
    assert.ok(!text.includes(digits), name + ' carries the bare phone digits');
    assert.ok(!text.includes(digits.slice(-10)), name + ' carries the phone digits without the country code');
  }
});

test('dates keep the one grammar style.typ gives them', () => {
  const c = logic();
  assert.equal(c.prettyDate('2025-11-08'), 'Nov 2025');
  assert.equal(c.prettyDate('2026-05'), 'May 2026');
  assert.equal(c.prettyDate('2025'), '2025');
  assert.equal(c.prettyDate('present'), 'present');
  assert.equal(c.prettyDate('ongoing'), 'ongoing');
  assert.equal(c.prettyDate('2024 – 2025'), '2024 – 2025');
  assert.equal(c.prettyRange('2022-02', 'present'), 'Feb 2022 – present');
  assert.equal(c.prettyRange('2021-07', ''), 'Jul 2021 – ');
});

test('only the metrics are set semibold', () => {
  const c = logic();
  assert.deepEqual(bolded(c.emphasizeMetrics('2.13M facade modules populated in one year.')), ['2.13M']);
  assert.deepEqual(bolded(c.emphasizeMetrics('reusing 1,450 ft at ~96% efficiency')), ['1,450 ft', '~96%']);
  // a bare year is a date and digits glued to a letter are part of a name: neither is a metric
  assert.deepEqual(bolded(c.emphasizeMetrics('under review at ACADIA 2026')), []);
  assert.deepEqual(bolded(c.emphasizeMetrics('a nominated cohort at Arch30')), []);
  // the runs put back together are the sentence that went in
  const s = 'Selected: 25 releases since 2023 (v0.5.0), 8 offices.';
  assert.equal(flatten(c.emphasizeMetrics(s)), s);
});

test('cvModel sets the real document the way resume.typ does', () => {
  if (!existsSync(new URL('../cv.json', import.meta.url))) throw new Error('cv.json is not at the site root');
  const c = logic();
  const cv = JSON.parse(read('cv.json'));
  const doc = c.cvModel(cv);

  assert.equal(doc.name, cv.basics.name);
  assert.deepEqual(doc.contact.map((x) => x.t), [cv.basics.email, 'github.com/yiliangs']);
  for (const flag of ['hasProfile', 'hasWork', 'hasResearch', 'hasRecognition', 'hasTalks', 'hasOss', 'hasEducation']) {
    assert.equal(doc[flag], true, 'the CV renders no ' + flag.slice(3) + ' section');
  }

  // the employer heads the entry, the current title sits under it, the prior ones run oldest to newest
  const som = doc.jobs[0];
  assert.equal(som.dates, 'Feb 2022 – present');
  assert.equal(som.titleDates, 'Oct 2025 – present');
  assert.match(som.prior, /^Junior Designer 2022 → .* → Designer 2024$/);
  assert.equal(som.projects.length, 0, 'the lab projects are hanging off the wrong job');

  // the lab's flagship projects belong to the job whose tenure scoped them, and carry no dates
  const psl = doc.jobs.find((j) => /Polyhedral/.test(j.units[0].t));
  assert.ok(psl.projects.length > 0, 'the lab projects never reached the lab job');
  assert.equal(psl.titleDates, 'part-time', 'a single-title job should put its employment on the rail');

  // reverse chronology, and nothing unpublished may show a year
  const years = doc.research.map((r) => r.right);
  assert.match(years[0], /^filed /, 'the patent should head the section');
  const pubs = cv.publications;
  assert.deepEqual(pubs.map((p) => p.year), ['2026', '2026', '2025', '2023']);
  for (let i = 0; i < pubs.length; i++) {
    const right = doc.research[i + 1].right;
    assert.equal(right, pubs[i].status === 'published' ? pubs[i].year : '',
      'a paper with status "' + pubs[i].status + '" is showing ' + JSON.stringify(right));
  }
  const review = doc.research.find((r) => flatten(r.parts).includes('(under review'));
  assert.ok(review, 'the under-review papers lost their status tag');

  // recognition and service merge into one strictly reverse-chronological list
  const rank = doc.recognition.map((r) => r.right);
  assert.deepEqual(rank, [...rank].sort().reverse(), 'Recognition & Service is not reverse-chronological');
  assert.ok(doc.recognition.some((r) => /Paper reviewer/.test(r.line)), 'review service never reached the section');

  assert.equal(doc.footer, cv.basics.name + ' · ' + c.prettyDate(cv.source_date));
});

test('the Development timeline is the same document, read as an index', () => {
  const c = logic();
  const cv = JSON.parse(read('cv.json'));
  const rows = c.cvTimeline(cv);
  assert.equal(rows.length, cv.work.length + cv.education.length);
  assert.equal(rows[0].role, cv.work[0].title_progression[0].title);
  assert.ok(rows[0].place.includes(cv.work[0].org));
  // a row with nothing to say drops its separator with its note
  assert.ok(rows.some((r) => r.hasNote === false), 'no row exercises the empty-note case');
  for (const r of rows) assert.equal(r.hasNote, !!r.note);
});
