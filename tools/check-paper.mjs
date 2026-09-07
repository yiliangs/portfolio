// Structural check for a paper content module.
//
// A chapter whose data entry carries `paper` gets its body from one of these modules, a flat list
// of typed blocks that renderPaper() turns into elements. Nothing in the browser validates them:
// a block kind the template does not know is silently dropped, a figure whose file is missing
// leaves a hole, and MathML that is not well-formed is handed to dangerouslySetInnerHTML anyway.
// This script is what stands in for that, and it runs on every paper module, not only the newest,
// so the first paper is the regression control for the second.
//
//   node tools/check-paper.mjs                       # every module under content/
//   node tools/check-paper.mjs content/<name>.js     # one module
//
// Two rules are looser than they look, and both are loose because the first paper is honest and
// the naive rule was wrong:
//
//   * Figure numbers must run consecutively upward, but need not start at 1. The ACADIA paper's
//     Figure 1 is its cover plate: it appears as the chapter's hero image and never as a `fig`
//     block, so that module's figures start at 2.
//   * Only a `sup` run whose text is a list of positive integers is read as a citation and bounded
//     by the References fold. The ACADIA paper also uses `sup` for negative exponents ("-3"), which
//     are typography, not references.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEMPLATE = path.join(ROOT, 'design', 'Portfolio.dc.html');

// The kinds renderPaper() understands. Kept here rather than derived, so that a kind added to the
// template without a rule here is a loud failure rather than a silent pass.
const KINDS = ['byline', 'abstract', 'keywords', 'h2', 'h3', 'p', 'ul', 'fig', 'figrow', 'table', 'alg', 'fold', 'eq'];

// Run keys paperRuns() understands, plus the plain string.
const RUN_KEYS = ['m', 'i', 'b', 'c', 'sup'];

const { DOMParser } = new JSDOM().window;
const parser = new DOMParser();

const errors = [];
const fail = (where, msg) => errors.push(where + ': ' + msg);

// --------------------------------------------------------------------------------------------
// the template's own list of kinds, so this file cannot drift away from renderPaper()

function templateKinds() {
  const src = readFileSync(TEMPLATE, 'utf8');
  const body = src.slice(src.indexOf('renderPaper(mod)'), src.indexOf('renderPaperCaptions(mod)'));
  const found = new Set();
  for (const m of body.matchAll(/b\.k === '([a-z0-9]+)'/g)) found.add(m[1]);
  return found;
}

function checkKindsInSync() {
  const inTemplate = templateKinds();
  const here = new Set(KINDS);
  for (const k of inTemplate) if (!here.has(k)) fail('tools/check-paper.mjs', 'renderPaper handles "' + k + '" but this script does not list it');
  for (const k of here) if (!inTemplate.has(k)) fail('tools/check-paper.mjs', 'this script lists "' + k + '" but renderPaper does not handle it');
}

// --------------------------------------------------------------------------------------------
// runs

const CITATION = /^\d+([,–-]\d+)*$/;

function checkRuns(where, runs, ctx) {
  if (!Array.isArray(runs)) return fail(where, 'expected a run array, got ' + JSON.stringify(runs).slice(0, 60));
  runs.forEach((r, i) => {
    const at = where + '[' + i + ']';
    if (typeof r === 'string') return checkText(at, r);
    if (!r || typeof r !== 'object') return fail(at, 'a run must be a string or an object');
    const keys = Object.keys(r);
    if (keys.length !== 1 || !RUN_KEYS.includes(keys[0])) return fail(at, 'unknown run shape {' + keys.join(',') + '}');
    if (r.m !== undefined) return checkMath(at, r.m);
    if (r.sup !== undefined && CITATION.test(r.sup)) {
      for (const n of r.sup.split(/[,–-]/)) {
        if (Number(n) > ctx.refs) fail(at, 'citation ' + n + ' has no entry in the References fold (' + ctx.refs + ' entries)');
      }
    }
    checkText(at, String(r[keys[0]]));
  });
}

// Any backslash at all, not only \word: the short section titles \secref expands into carry
// spacing macros such as \, whose escape is punctuation, and a \word-only rule waves those through.
function checkText(where, s) {
  const m = /\\.?|[$~]/.exec(s);
  if (m) fail(where, 'unconverted LaTeX ' + JSON.stringify(m[0]) + ' in text: ' + JSON.stringify(s.slice(Math.max(0, m.index - 30), m.index + 40)));
}

function checkMath(where, inner) {
  if (typeof inner !== 'string') return fail(where, 'm must be a string');
  if (inner.includes('mfenced')) fail(where, 'uses <mfenced>, which Chrome MathML Core does not implement');
  const doc = parser.parseFromString('<math xmlns="http://www.w3.org/1998/Math/MathML">' + inner + '</math>', 'application/xml');
  const err = doc.getElementsByTagName('parsererror')[0];
  if (err) fail(where, 'MathML is not well-formed XML: ' + err.textContent.trim().split('\n')[0]);
}

// --------------------------------------------------------------------------------------------
// blocks

function checkFig(where, b, seq) {
  seq.fig.push(b.n);
  if (typeof b.src !== 'string' || !b.src) return fail(where, 'a fig needs a src');
  if (!existsSync(path.join(ROOT, b.src))) fail(where, 'src does not exist on disk: ' + b.src);
  if (!Number.isInteger(b.w) || !Number.isInteger(b.h) || b.w <= 0 || b.h <= 0) fail(where, 'a fig needs pixel w and h; got ' + b.w + 'x' + b.h);
  if (typeof b.capText !== 'string' || !b.capText) fail(where, 'a fig needs capText, which the caption column types out');
  checkRuns(where + '.cap', b.cap, seq.ctx);
  checkText(where + '.capText', b.capText);
  checkText(where + '.alt', String(b.alt || ''));
}

function checkBlock(where, b, seq) {
  if (!b || typeof b !== 'object' || typeof b.k !== 'string') return fail(where, 'a block needs a string k');
  if (!KINDS.includes(b.k)) return fail(where, 'block kind "' + b.k + '" is outside what renderPaper handles (' + KINDS.join(', ') + ')');
  switch (b.k) {
    case 'byline':
      checkText(where + '.t', b.t); checkText(where + '.aff', b.aff); break;
    case 'keywords': case 'h2': case 'h3':
      checkText(where + '.t', String(b.t || '')); break;
    case 'abstract': case 'p':
      checkRuns(where + '.r', b.r, seq.ctx); break;
    case 'ul':
      (b.items || []).forEach((it, j) => checkRuns(where + '.items[' + j + ']', it, seq.ctx)); break;
    case 'fig':
      checkFig(where, b, seq); break;
    case 'figrow':
      (b.figs || []).forEach((f, j) => checkFig(where + '.figs[' + j + ']', f, seq)); break;
    case 'eq':
      if (b.n !== null && b.n !== undefined) seq.eq.push(b.n);
      checkMath(where + '.m', b.m); break;
    case 'table':
      seq.table.push(b.n);
      checkRuns(where + '.cap', b.cap, seq.ctx);
      checkText(where + '.capText', String(b.capText || ''));
      (b.panels || []).forEach((p, pi) => {
        const w = where + '.panels[' + pi + ']';
        if (!Array.isArray(p.cols) || !p.cols.length) return fail(w, 'a panel needs a cols spec');
        for (const grp of ['head', 'rows', 'foot']) {
          (p[grp] || []).forEach((row, ri) => {
            if (row.length !== p.cols.length) fail(w + '.' + grp + '[' + ri + ']', 'has ' + row.length + ' cells against ' + p.cols.length + ' columns');
            row.forEach((c, ci) => checkRuns(w + '.' + grp + '[' + ri + '][' + ci + ']', c, seq.ctx));
          });
        }
      });
      break;
    case 'alg':
      seq.alg.push(b.n);
      checkRuns(where + '.cap', b.cap, seq.ctx);
      checkText(where + '.capText', String(b.capText || ''));
      (b.lines || []).forEach((l, li) => {
        if (!Number.isInteger(l.d) || l.d < 0) fail(where + '.lines[' + li + ']', 'needs a non-negative indent depth d');
        checkRuns(where + '.lines[' + li + '].r', l.r, seq.ctx);
      });
      break;
    case 'fold':
      if (!b.id || !b.t) fail(where, 'a fold needs an id and a title');
      // an appendix fold holds whole blocks, because an algorithm listing cannot be said in runs
      (b.items || []).forEach((it, j) => Array.isArray(it)
        ? checkRuns(where + '.items[' + j + ']', it, seq.ctx)
        : checkBlock(where + '.items[' + j + ']', it, seq));
      break;
  }
}

function checkSequence(where, label, nums) {
  if (!nums.length) return;
  for (let i = 0; i < nums.length; i++) {
    if (!Number.isInteger(nums[i])) return fail(where, label + ' number ' + JSON.stringify(nums[i]) + ' is not an integer');
    if (i && nums[i] !== nums[i - 1] + 1) return fail(where, label + ' numbers must run consecutively upward; ' + nums[i - 1] + ' is followed by ' + nums[i]);
  }
  if (nums[0] > 2) fail(where, label + ' numbers start at ' + nums[0] + '; a run may start at 1, or at 2 when figure 1 is the chapter cover');
}

// --------------------------------------------------------------------------------------------

async function checkModule(rel) {
  const abs = path.join(ROOT, rel);
  if (!existsSync(abs)) return fail(rel, 'module does not exist');
  let mod;
  try {
    mod = (await import(pathToFileURL(abs).href)).default;
  } catch (err) {
    return fail(rel, 'module does not load: ' + err.message);
  }
  if (!mod || !Array.isArray(mod.blocks)) return fail(rel, 'module does not export a blocks array');
  const refs = (mod.blocks.find((b) => b && b.k === 'fold' && b.id === 'refs') || { items: [] }).items.length;
  const seq = { fig: [], eq: [], table: [], alg: [], ctx: { refs } };
  mod.blocks.forEach((b, i) => checkBlock(rel + ' block[' + i + '] ' + (b && b.k), b, seq));
  checkSequence(rel, 'figure', seq.fig);
  checkSequence(rel, 'equation', seq.eq);
  checkSequence(rel, 'table', seq.table);
  checkSequence(rel, 'algorithm', seq.alg);
  return { rel, blocks: mod.blocks.length, figs: seq.fig.length, eqs: seq.eq.length, tables: seq.table.length, algs: seq.alg.length, refs };
}

const args = process.argv.slice(2);
const targets = args.length
  ? args.map((a) => path.relative(ROOT, path.resolve(a)).split(path.sep).join('/'))
  : readdirSync(path.join(ROOT, 'content')).filter((f) => f.endsWith('.js')).sort().map((f) => 'content/' + f);

checkKindsInSync();
const summaries = [];
for (const t of targets) {
  const s = await checkModule(t);
  if (s) summaries.push(s);
}

if (errors.length) {
  for (const e of errors) console.error('check-paper: ' + e);
  console.error('check-paper: ' + errors.length + ' problem' + (errors.length === 1 ? '' : 's') + ' in ' + targets.length + ' module' + (targets.length === 1 ? '' : 's'));
  process.exit(1);
}
for (const s of summaries) {
  console.log('check-paper: ' + s.rel + ': ' + s.blocks + ' blocks, ' + s.figs + ' figures, ' + s.eqs + ' numbered equations, '
    + s.tables + ' tables, ' + s.algs + ' listings, ' + s.refs + ' references');
}
console.log('check-paper: ' + summaries.length + ' module' + (summaries.length === 1 ? '' : 's') + ' clean');
