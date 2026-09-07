// Guards the privacy invariant of tools/export-cv.mjs.
//
// The curriculum-vitae repository is private and holds material that must never reach this site:
// a phone number, drafting guardrails, unrendered credential chips, entries marked public: false.
// The exporter is an allowlist, so the test is written as one too: every object in cv.json is
// checked against the exact set of keys its position is allowed to carry, and anything else is a
// failure. A denied-name sweep runs beside it, so a leak that happens to reuse an allowed position
// is still caught.
//
// The fixture is inline on purpose. Reading the real file here would put private strings in this
// repository, which is the thing the exporter exists to prevent.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { publicCv, sourcePath } from './export-cv.mjs';

// Keys that may not appear at any depth of the output. Names an allowed position also uses
// (title, role, org, links, location, work) are left to the shape check below.
const DENIED = [
  '_guardrails', 'phone', 'headline_facts', 'linkedin_headline', 'linkedin', 'summary',
  'summary_pool', 'bios', 'one_liner', 'short', 'medium', 'employer', 'languages', 'tech',
  'authors', 'author_note', 'natalie_linked', 'submitted', 'doi', 'citations', 'inventors',
  'confirmation_no', 'projected_publication', 'foreign_filing_license', 'assignee', 'independent',
  'notes', 'note', 'media', 'exhibitions', 'exhibitions_extra', 'skills', 'teaching', 'public',
  'evidence', 'press', 'framing', 'team', 'role_note', 'aka', 'membership', 'scope', 'funded',
  'years', 'event', 'compensation', 'co_panelists', 'format', 'outlet', 'about', 'urls', 'url',
  'c3_strength', 'website', 'orcid', 'scholar', 'research_initiatives',
];

// The allowlist, position by position. __keys is the complete set a node at that position may
// carry; a nested object or list of objects names its own entry.
const SHAPE = {
  __keys: ['source_commit', 'source_date', 'basics', 'profile', 'work', 'projects', 'patents',
    'publications', 'awards', 'service', 'talks', 'education'],
  basics: { __keys: ['name', 'email', 'links'], links: { __keys: ['github'] } },
  work: {
    __keys: ['org', 'org_units', 'location', 'start', 'end', 'role', 'employment', 'funding',
      'title_progression', 'highlights', 'blocks'],
    title_progression: { __keys: ['title', 'start', 'end'] },
    blocks: {
      __keys: ['heading', 'role', 'period', 'intro', 'entries'],
      entries: { __keys: ['name', 'desc'] },
    },
  },
  projects: { __keys: ['name', 'category', 'resume_desc'] },
  patents: {
    __keys: ['title', 'role', 'application_no', 'claims', 'status', 'filed'],
    claims: { __keys: ['total'] },
  },
  publications: {
    __keys: ['title', 'position', 'venue', 'venue_short', 'volume', 'year', 'status', 'type'],
  },
  awards: { __keys: ['resume_line', 'year'] },
  service: { __keys: ['role', 'org', 'detail', 'year'] },
  talks: { __keys: ['resume_line', 'date'] },
  education: { __keys: ['institution', 'degree', 'field', 'start', 'end'] },
};

const SECTIONS = ['work', 'projects', 'patents', 'publications', 'awards', 'service', 'talks', 'education'];

function walk(node, visit, path = '$') {
  if (Array.isArray(node)) { node.forEach((v, i) => walk(v, visit, path + '[' + i + ']')); return; }
  if (node === null || typeof node !== 'object') return;
  for (const [k, v] of Object.entries(node)) { visit(k, v, path); walk(v, visit, path + '.' + k); }
}

function checkShape(node, shape, path) {
  if (Array.isArray(node)) { node.forEach((v, i) => checkShape(v, shape, path + '[' + i + ']')); return; }
  if (node === null || typeof node !== 'object') return;
  assert.ok(shape, path + ' is an object the schema does not describe');
  for (const k of Object.keys(node)) {
    assert.ok(shape.__keys.includes(k), 'key outside the allowlist: ' + path + '.' + k);
    checkShape(node[k], shape[k], path + '.' + k);
  }
}

function assertNoDeniedKeys(doc, label) {
  walk(doc, (k, _v, path) => {
    assert.ok(!DENIED.includes(k), label + ' carries a denied key: ' + path + '.' + k);
  });
}

// A phone number in any of the shapes a person writes one in. Runs on the exported document, whose
// only digits are dates, claim counts and metrics, so a hit is a leak rather than a coincidence.
const PHONE_SHAPED = /\+?\d?[\s.\-]?\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}/;

const FIXTURE = {
  _guardrails: ['Never claim the award that belongs to someone else.'],
  basics: {
    name: 'Test Person',
    title: 'A Job Title That Must Not Ship',
    employer: 'A Firm',
    location: 'Chicago, IL',
    languages: ['English'],
    email: 'test@example.org',
    phone: '+1 555-867-5309',
    headline_facts: ['A chip that must not ship'],
    linkedin_headline: 'A headline that must not ship',
    summary: 'A summary that must not ship',
    links: {
      github: 'https://github.com/testperson',
      linkedin: 'https://www.linkedin.com/in/test/',
      website: 'https://example.org',
      orcid: 'https://orcid.org/0000',
    },
  },
  bios: {
    cv_profile: 'A short profile that does ship.',
    one_liner: 'A one liner that must not ship.',
    medium: 'A medium bio that must not ship.',
  },
  work: [
    {
      org: 'A Firm',
      org_units: ['A Firm,', 'Chicago Studio'],
      role: 'Senior Something',
      location: 'Chicago, IL',
      start: '2022-02',
      end: 'present',
      employment: 'full-time',
      funding: 'Funded in part by a grant.',
      tech: ['C#', 'React'],
      highlights: ['A highlight that ships.'],
      title_progression: [
        { title: 'Senior Something', start: '2025-10', end: 'present' },
        { title: 'Something', start: '2022-02', end: '2025-09' },
      ],
      blocks: [
        {
          heading: 'A Platform',
          role: 'Creator',
          period: '2023 - present',
          intro: 'An intro that ships.',
          entries: [
            { name: 'Shipped entry', desc: 'Moved 2.13M things in one year.' },
            { name: 'Hidden entry', desc: 'Must not ship.', public: false },
          ],
        },
        { heading: 'A Hidden Block', period: '2024', public: false, entries: [{ name: 'x', desc: 'y' }] },
      ],
    },
    { org: 'A Hidden Employer', role: 'Nobody', start: '2019', end: '2020', public: false },
  ],
  education: [
    {
      institution: 'A University',
      degree: 'Master of Science',
      field: 'A Field',
      start: '2020-08',
      end: '2021-12',
      notes: 'A note that must not ship.',
    },
  ],
  patents: [
    {
      title: 'A Patent',
      role: 'First-named inventor',
      inventors: ['Test Person', 'Someone Else'],
      status: 'pending',
      application_no: 'US 19/305,030',
      confirmation_no: '3090',
      filed: '2025-08-20',
      projected_publication: '2027-02-25',
      assignee: 'A Holdings, LLC',
      claims: { total: 22, independent: 4 },
      foreign_filing_license: '2025-08-27',
    },
  ],
  publications: [
    {
      title: 'An Older Published Paper',
      position: 'Co-author',
      authors: ['Someone', 'Test Person'],
      venue: 'A Journal',
      volume: '13(12), 2946',
      year: '2023',
      type: 'journal',
      status: 'published',
      doi: '10.0000/x',
      citations: 6,
    },
    {
      title: 'A Newer Paper Under Review',
      position: 'Sole author',
      authors: ['Test Person'],
      venue: 'A Conference',
      venue_short: 'CONF 2026',
      year: '2026',
      type: 'conference',
      status: 'under review',
      submitted: '2026-07-01',
      note: 'A note that must not ship.',
    },
    {
      title: 'A Withheld Paper',
      position: 'Sole author',
      venue: 'Somewhere',
      year: '2026',
      status: 'in preparation',
      public: false,
    },
  ],
  service: [
    { role: 'Paper reviewer', org: 'A Conference', detail: '(8 papers).', year: '2026', membership: 'A member.' },
  ],
  projects: [
    { name: 'A Proprietary Thing', category: 'SOM', resume_desc: 'Must not ship.', tech: ['C#'] },
    { name: 'A Lab Project', category: 'UPenn / PSL', resume_desc: 'Ships, 1,450 ft of it.', team: ['Someone'] },
    { name: 'A Public Plugin', category: 'Personal', resume_desc: 'Ships too.', links: ['https://example.org'] },
    { name: 'A Bare Personal Project', category: 'Personal', resume_desc: '', years: '2018' },
    { name: 'A Withheld Lab Project', category: 'UPenn / PSL', resume_desc: 'Must not ship.', public: false },
  ],
  awards: [
    { title: 'Selected', org: 'A Cohort', year: '2026', scope: 'regional', resume_line: 'Selected, A Cohort.' },
    { title: 'Judges Choice', org: 'A Competition', year: '2022', work: 'A Project' },
  ],
  talks: [
    { title: 'A Talk', event: 'Somewhere', role: 'Presenter', date: '2026-05-13', resume_line: 'Featured presenter, A Talk.', evidence: 'strong' },
    { title: 'An Unlisted Talk', event: 'Elsewhere', date: '2026-07-15', evidence: 'strong' },
  ],
  media: [{ outlet: 'A Magazine', about: 'The work', url: 'https://example.org' }],
  exhibitions: [{ title: 'A Show', venue: 'A Museum' }],
  skills: { languages: ['C#', 'Python'] },
  teaching: [],
};

const META = { source_commit: 'abc1234', source_date: '2026-07-07' };

test('publicCv exports only the allowlisted shape', () => {
  const out = publicCv(FIXTURE, META);
  checkShape(out, SHAPE, '$');
  assertNoDeniedKeys(out, 'the exported document');
  for (const key of SECTIONS) assert.ok(Array.isArray(out[key]), key + ' is missing or not a list');
});

test('publicCv drops the phone number and every private basics field', () => {
  const json = JSON.stringify(publicCv(FIXTURE, META));
  assert.ok(!json.includes('555-867-5309'), 'the punctuated phone number survived the export');
  assert.ok(!json.includes('5558675309'), 'the bare phone digits survived the export');
  assert.ok(!PHONE_SHAPED.test(json), 'the export carries a phone-shaped digit run');
  for (const gone of ['A Job Title That Must Not Ship', 'A chip that must not ship',
    'A headline that must not ship', 'A summary that must not ship', 'linkedin.com/in/test',
    'orcid.org', 'https://example.org']) {
    assert.ok(!json.includes(gone), 'a private basics value survived: ' + gone);
  }
  const out = publicCv(FIXTURE, META);
  assert.deepEqual(out.basics, {
    name: 'Test Person', email: 'test@example.org',
    links: { github: 'https://github.com/testperson' },
  });
  assert.equal(out.profile, 'A short profile that does ship.');
});

test('publicCv drops every entry marked public: false, at every depth', () => {
  const out = publicCv(FIXTURE, META);
  const json = JSON.stringify(out);
  assert.ok(!json.includes('Must not ship'), 'a withheld entry survived the export');
  assert.equal(out.work.length, 1, 'the withheld employer survived');
  assert.equal(out.work[0].blocks.length, 1, 'the withheld block survived');
  assert.deepEqual(out.work[0].blocks[0].entries, [
    { name: 'Shipped entry', desc: 'Moved 2.13M things in one year.' },
  ]);
  assert.deepEqual(out.publications.map((p) => p.title), [
    'A Newer Paper Under Review', 'An Older Published Paper',
  ], 'publications are not year-descending, or a withheld paper survived');
});

test('publicCv filters projects to the two public categories carrying a description', () => {
  const out = publicCv(FIXTURE, META);
  assert.deepEqual(out.projects, [
    { name: 'A Lab Project', category: 'UPenn / PSL', resume_desc: 'Ships, 1,450 ft of it.' },
    { name: 'A Public Plugin', category: 'Personal', resume_desc: 'Ships too.' },
  ]);
});

test('publicCv keeps only the lines the resume renders, verbatim', () => {
  const out = publicCv(FIXTURE, META);
  assert.deepEqual(out.awards, [{ resume_line: 'Selected, A Cohort.', year: '2026' }]);
  assert.deepEqual(out.talks, [{ resume_line: 'Featured presenter, A Talk.', date: '2026-05-13' }]);
  assert.deepEqual(out.service, [
    { role: 'Paper reviewer', org: 'A Conference', detail: '(8 papers).', year: '2026' },
  ]);
  assert.deepEqual(out.education, [{
    institution: 'A University', degree: 'Master of Science', field: 'A Field',
    start: '2020-08', end: '2021-12',
  }]);
  assert.deepEqual(out.patents, [{
    title: 'A Patent', role: 'First-named inventor', application_no: 'US 19/305,030',
    claims: { total: 22 }, status: 'pending', filed: '2025-08-20',
  }]);
  const job = out.work[0];
  assert.equal(job.org, 'A Firm');
  assert.deepEqual(job.org_units, ['A Firm,', 'Chicago Studio']);
  assert.deepEqual(job.highlights, ['A highlight that ships.']);
  assert.equal(job.funding, 'Funded in part by a grant.');
  assert.deepEqual(job.title_progression[0], { title: 'Senior Something', start: '2025-10', end: 'present' });
  assert.equal(out.source_commit, 'abc1234');
  assert.equal(out.source_date, '2026-07-07');
});

test('publicCv omits empty values rather than exporting blanks', () => {
  const out = publicCv({ basics: { name: 'N' }, work: [{ org: 'O', role: '', highlights: [], blocks: [] }] }, {});
  assert.deepEqual(out.basics, { name: 'N' });
  assert.deepEqual(Object.keys(out.work[0]), ['org']);
  assert.equal(out.source_commit, null);
  assert.equal(out.source_date, null);
  for (const key of SECTIONS) assert.ok(Array.isArray(out[key]), key + ' should still be an empty list');
  assert.ok(!('profile' in out), 'an absent profile should be omitted, not exported empty');
});

test('the generated cv.json carries nothing outside the allowlist', (t) => {
  const file = new URL('../cv.json', import.meta.url);
  if (!existsSync(file)) { t.skip('cv.json has not been generated yet'); return; }
  const doc = JSON.parse(readFileSync(file, 'utf8'));
  checkShape(doc, SHAPE, 'cv.json');
  assertNoDeniedKeys(doc, 'cv.json');
  for (const key of SECTIONS) assert.ok(Array.isArray(doc[key]), 'cv.json is missing the ' + key + ' section');
  const json = JSON.stringify(doc);
  assert.ok(!PHONE_SHAPED.test(json), 'cv.json carries a phone-shaped digit run');
});

// The real number never appears in this repository, so it is read back out of the private source
// when that source is reachable and skipped when it is not.
test('the generated cv.json does not carry the private phone number', (t) => {
  const out = new URL('../cv.json', import.meta.url);
  const src = sourcePath();
  if (!existsSync(out) || !existsSync(src)) { t.skip('cv.json or the private source is not reachable here'); return; }
  const phone = /^\s*phone:\s*"([^"]*)"/m.exec(readFileSync(src, 'utf8'));
  if (!phone) { t.skip('the source carries no phone number'); return; }
  const digits = phone[1].replace(/\D/g, '');
  assert.ok(digits.length >= 10, 'the phone number read back from the source looks wrong');
  const json = readFileSync(out, 'utf8');
  assert.ok(!json.includes(phone[1]), 'cv.json carries the phone number as written');
  assert.ok(!json.includes(digits), 'cv.json carries the bare phone digits');
  assert.ok(!json.includes(digits.slice(-10)), 'cv.json carries the phone digits without the country code');
});
