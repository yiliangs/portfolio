// Exports the public subset of the private curriculum-vitae data as cv.json at the site root.
//
// The source is ../curriculum-vitae/data/cv.yaml, a private repository holding a phone number,
// drafting guardrails, unpublished venue notes, and entries flagged public: false. None of that may
// reach this site, so this exporter is an allowlist: a field is copied only because it is named
// below, and a field added to the source later arrives here as nothing until someone names it. The
// inverse, a denylist, would leak every field nobody thought to forbid.
//
// What survives is what templates/resume.typ renders in that repository, minus the phone number.
// The page in design/Portfolio.dc.html reads this file and reimplements the same rendering rules,
// so the CV on the site and the CV in the PDF are one document with two typesettings.
//
// Run with `npm run cv`. Commit the regenerated cv.json.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse } from 'yaml';

const OUT = 'cv.json';
const DEFAULT_SOURCE = '../curriculum-vitae/data/cv.yaml';

// ---------------------------------------------------------------- source

// This checkout, which is where cv.json is written: a linked worktree writes its own copy, never
// the main one.
const siteRoot = () => dirname(dirname(fileURLToPath(import.meta.url)));

// The main checkout, whose sibling is the curriculum-vitae repository. From a linked worktree the
// common dir is <main>/.git, so its parent is the main checkout however deep the worktree sits.
function mainCheckout() {
  const here = siteRoot();
  try {
    const common = execFileSync('git', ['rev-parse', '--git-common-dir'], { cwd: here, encoding: 'utf8' }).trim();
    return dirname(resolve(here, common));
  } catch {
    return here;
  }
}

export function sourcePath() {
  return process.env.CV_SOURCE ? resolve(process.env.CV_SOURCE) : resolve(mainCheckout(), DEFAULT_SOURCE);
}

// The commit the exported facts came from, so a stale cv.json is visible rather than silent. A
// source outside git, or no git at all, is not an error: the page omits the date.
function sourceMeta(file) {
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%h%n%cs', '--', file], {
      cwd: dirname(file), encoding: 'utf8',
    }).trim().split('\n');
    if (!out[0]) return { source_commit: null, source_date: null };
    return { source_commit: out[0], source_date: out[1] || null };
  } catch {
    return { source_commit: null, source_date: null };
  }
}

// ---------------------------------------------------------------- allowlist helpers

const isEmpty = (v) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);

// lib/style.typ: is-public. Absent means public; only an explicit false withholds.
const isPublic = (x) => !(x && typeof x === 'object' && x.public === false);

// One object, only the named keys, and only where the value carries something. An unnamed key
// cannot be reached from here at all, which is the whole point.
function pick(obj, keys) {
  const out = {};
  if (!obj || typeof obj !== 'object') return out;
  for (const k of keys) if (!isEmpty(obj[k])) out[k] = obj[k];
  return out;
}

const listOf = (v) => (Array.isArray(v) ? v.filter(isPublic) : []);
const mapPick = (v, keys) => listOf(v).map((x) => pick(x, keys));

// ---------------------------------------------------------------- the schema

const WORK_KEYS = ['org', 'org_units', 'location', 'start', 'end', 'role', 'employment', 'funding'];
const TITLE_KEYS = ['title', 'start', 'end'];
const BLOCK_KEYS = ['heading', 'role', 'period', 'intro'];
const ENTRY_KEYS = ['name', 'desc'];
const PROJECT_KEYS = ['name', 'category', 'resume_desc'];
const PATENT_KEYS = ['title', 'role', 'application_no', 'status', 'filed'];
const PUBLICATION_KEYS = ['title', 'position', 'venue', 'venue_short', 'volume', 'year', 'status', 'type'];
const AWARD_KEYS = ['resume_line', 'year'];
const SERVICE_KEYS = ['role', 'org', 'detail', 'year'];
const TALK_KEYS = ['resume_line', 'date'];
const EDUCATION_KEYS = ['institution', 'degree', 'field', 'start', 'end'];

// resume.typ renders projects in two places and nowhere else: UPenn / PSL projects as entries under
// the PSL job, Personal ones as the Open Source section. Every other category is client or employer
// work and stays out.
const PROJECT_CATEGORIES = ['UPenn / PSL', 'Personal'];

function job(j) {
  const out = pick(j, WORK_KEYS);
  const titles = mapPick(j.title_progression, TITLE_KEYS);
  const highlights = Array.isArray(j.highlights) ? j.highlights.filter((h) => !isEmpty(h)) : [];
  const blocks = listOf(j.blocks).map((b) => {
    const blk = pick(b, BLOCK_KEYS);
    const entries = mapPick(b.entries, ENTRY_KEYS);
    if (entries.length) blk.entries = entries;
    return blk;
  });
  if (titles.length) out.title_progression = titles;
  if (highlights.length) out.highlights = highlights;
  if (blocks.length) out.blocks = blocks;
  return out;
}

// resume.typ: `cv.publications.filter(is-public).sorted(key: year).rev()`. Typst's sort is stable
// and rev() reverses the ties with everything else, so two papers from the same year come back in
// the reverse of their source order. Reproduced rather than corrected: the site and the PDF are
// meant to list them identically.
function publications(list) {
  return mapPick(list, PUBLICATION_KEYS)
    .map((p, i) => [p, i])
    .sort((a, b) => (String(a[0].year ?? '') < String(b[0].year ?? '') ? -1
      : String(a[0].year ?? '') > String(b[0].year ?? '') ? 1 : a[1] - b[1]))
    .map(([p]) => p)
    .reverse();
}

export function publicCv(doc, meta = {}) {
  const src = doc && typeof doc === 'object' ? doc : {};
  const basics = pick(src.basics, ['name', 'email']);
  const github = src.basics && src.basics.links && src.basics.links.github;
  if (!isEmpty(github)) basics.links = { github };

  const out = {
    source_commit: meta.source_commit ?? null,
    source_date: meta.source_date ?? null,
    basics,
  };

  const profile = src.bios && src.bios.cv_profile;
  if (!isEmpty(profile)) out.profile = profile;

  out.work = listOf(src.work).map(job);
  out.projects = listOf(src.projects)
    .filter((p) => PROJECT_CATEGORIES.includes(p.category) && !isEmpty(p.resume_desc))
    .map((p) => pick(p, PROJECT_KEYS));
  out.patents = listOf(src.patents).map((p) => {
    const pat = pick(p, PATENT_KEYS);
    const total = p.claims && p.claims.total;
    if (!isEmpty(total)) pat.claims = { total };
    return pat;
  });
  out.publications = publications(src.publications);
  out.awards = listOf(src.awards)
    .filter((a) => !isEmpty(a.resume_line))
    .map((a) => pick(a, AWARD_KEYS));
  out.service = mapPick(src.service, SERVICE_KEYS);
  out.talks = listOf(src.talks)
    .filter((t) => !isEmpty(t.resume_line))
    .map((t) => pick(t, TALK_KEYS));
  out.education = mapPick(src.education, EDUCATION_KEYS);
  return out;
}

// ---------------------------------------------------------------- run

function main() {
  const file = sourcePath();
  if (!existsSync(file)) {
    console.error('export-cv: no source at ' + file);
    console.error('export-cv: clone the curriculum-vitae repository beside this one, or set CV_SOURCE.');
    process.exit(1);
  }
  const meta = sourceMeta(file);
  const out = publicCv(parse(readFileSync(file, 'utf8')), meta);
  const target = join(siteRoot(), OUT);
  const json = JSON.stringify(out, null, 2).replace(/\r\n/g, '\n') + '\n';
  writeFileSync(target, json);
  console.log('export-cv: read ' + file);
  console.log('export-cv: source commit ' + (meta.source_commit || 'unknown') +
    ' (' + (meta.source_date || 'undated') + ')');
  console.log('export-cv: wrote ' + target + ' (' + Buffer.byteLength(json) + ' bytes)');
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) main();
