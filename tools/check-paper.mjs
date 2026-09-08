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
  const body = src.slice(src.indexOf('renderPaper(mod, phone)'), src.indexOf('renderPaperCaptions(mod)'));
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
// the row plan
//
// planPaperRows() is a pure static method on the logic class, so the same slicing that reads the
// kinds out of the template can lift the whole method and run it here against the real modules.
// What it decides is geometry: which grid row each block stands on, and which run of rows each
// caption spans. A caption that spans too little inflates the one row it sits on and leaves a
// blank band down the body beside it; one that spans too far shares a cell with the next caption,
// or with a wide plate that already reaches across column 2 on its row, and draws over it. None of
// that is an error in the browser, so this is the only place any of it can be caught.

const PLANNER = 'static planPaperRows(blocks, phone) {';

function templatePlanner() {
  const src = readFileSync(TEMPLATE, 'utf8');
  const at = src.indexOf(PLANNER);
  if (at < 0) {
    fail('tools/check-paper.mjs', 'the template no longer has "' + PLANNER + '", so the row plan cannot be checked');
    return null;
  }
  // every method of the logic class closes on a line of its own at two spaces of indent; the
  // template is checked in with CRLF line endings, so the line break is matched either way
  const rest = src.slice(at + PLANNER.length);
  const close = /\r?\n {2}\}\r?\n/.exec(rest);
  if (!close) {
    fail('tools/check-paper.mjs', 'planPaperRows is not closed with "  }" so this script cannot slice it out');
    return null;
  }
  return new Function('blocks', 'phone', rest.slice(0, close.index));
}

const planPaperRows = templatePlanner();

// A block kind the planner does not place gets no grid cell, and a paper carrying one would spill
// out of the body grid. Run the planner over one block of every kind so that a kind added to
// renderPaper without a row is caught here rather than on the first module that uses it.
function checkPlannerKinds() {
  if (!planPaperRows) return;
  const plan = planPaperRows(KINDS.map((k) => ({ k, wide: false, figs: [] })));
  KINDS.forEach((k, i) => {
    if (k === 'fold') {
      if (plan.cells[i]) fail('tools/check-paper.mjs', 'planPaperRows gives a fold block a row of its own; renderPaperTail places the tail');
    } else if (!plan.cells[i]) {
      fail('tools/check-paper.mjs', 'planPaperRows gives block kind "' + k + '" no row, so renderPaper would place it nowhere');
    }
  });

  // The shortest arrangement in which a caption meets a wide plate before it meets the next
  // caption: a narrow plate, one paragraph, then a wide one. The first caption stands on row 1 and
  // the wide plate takes row 3, so the caption has to stop at 3 and leave that row to the plate.
  // Pinned on a made-up module rather than on a real one, so it survives the papers being edited.
  const meets = planPaperRows([{ k: 'fig', n: 1, wide: false }, { k: 'p', r: [] }, { k: 'fig', n: 2, wide: true }]);
  const first = meets.caps[0];
  if (!first || first.row !== 1 || first.end !== 3) {
    fail('tools/check-paper.mjs', 'over a narrow plate, a paragraph and a wide plate, planPaperRows spans the first caption '
      + (first ? first.row + ' / ' + first.end : 'nowhere') + ' rather than 1 / 3, so it does not stop at the wide plate on row 3');
  }
}

// The phone reading of the same plan. There is no column 2 on a phone, so the aside opens the body
// on its own row, every block follows it in document order, and a caption takes the row under its
// own plate instead of standing beside it. Three things can go wrong and none of them is visible in
// the browser: a block or a caption left in column 2, where nothing is; two of them on one row,
// which lays a caption over a plate; and a caption that is not directly under the plate it belongs
// to, which is the whole point of the arrangement.
function checkPhonePlan(rel, blocks) {
  if (!planPaperRows) return;
  let plan;
  try {
    plan = planPaperRows(blocks, true);
  } catch (err) {
    return fail(rel, 'planPaperRows threw on this module read as a phone: ' + err.message);
  }
  const taken = new Map();
  const claim = (row, what) => {
    if (taken.has(row)) fail(rel, 'on a phone ' + what + ' shares row ' + row + ' with ' + taken.get(row) + ', and one would draw over the other');
    else taken.set(row, what);
  };
  const figRow = new Map();
  blocks.forEach((b, i) => {
    if (b && b.k === 'fold') return;
    const c = plan.cells[i];
    if (!c) return fail(rel + ' block[' + i + '] ' + (b && b.k), 'planPaperRows gives it no grid cell on a phone');
    if (String(c.gridColumn) !== '1') fail(rel + ' block[' + i + '] ' + (b && b.k), 'stands in column ' + JSON.stringify(c.gridColumn) + ' on a phone, where there is only column 1');
    claim(Number(c.gridRow), 'block[' + i + '] ' + (b && b.k));
    if (b && (b.k === 'fig' || b.k === 'figrow')) figRow.set(b, Number(c.gridRow));
  });
  for (const c of plan.caps || []) {
    if (String(c.col) !== '1') fail(rel, 'a caption stands in column ' + JSON.stringify(c.col) + ' on a phone, where there is only column 1');
    if (c.end !== c.row + 1) fail(rel, 'a caption spans rows ' + c.row + ' / ' + c.end + ' on a phone, where every caption is one row under its plate');
    claim(c.row, 'the caption for Fig. ' + (c.figs || []).map((f) => f && f.n).join(' and '));
  }
  // every caption directly under the plate it belongs to
  const plates = blocks.filter((b) => b && (b.k === 'fig' || b.k === 'figrow'));
  if ((plan.caps || []).length !== plates.length) {
    fail(rel, 'on a phone the plan carries ' + (plan.caps || []).length + ' captions for ' + plates.length + ' plates');
  }
  plates.forEach((b, k) => {
    const cap = (plan.caps || [])[k];
    if (!cap) return;
    const want = figRow.get(b);
    if (cap.row !== want + 1) fail(rel, 'on a phone the caption for the plate on row ' + want + ' stands on row ' + cap.row + ', not the row under it');
  });
  const aside = /^\s*(\d+)\s*\/\s*(\d+)\s*$/.exec(String(plan.asideRow || ''));
  if (!aside) return fail(rel, 'the aside row span is not a pair of grid lines on a phone: ' + JSON.stringify(plan.asideRow));
  if (Number(aside[1]) !== 1 || Number(aside[2]) !== 2) {
    fail(rel, 'the aside opens the body on rows ' + plan.asideRow + ' on a phone, not the single row 1 / 2 above every block');
  }
  if (taken.has(1)) fail(rel, 'a block stands on row 1 on a phone, which belongs to the aside');
}

function checkRowPlan(rel, blocks) {
  if (!planPaperRows) return;
  let plan;
  try {
    plan = planPaperRows(blocks);
  } catch (err) {
    return fail(rel, 'planPaperRows threw on this module: ' + err.message);
  }
  blocks.forEach((b, i) => {
    if (b && b.k === 'fold') return;
    if (!plan.cells[i]) fail(rel + ' block[' + i + '] ' + (b && b.k), 'planPaperRows gives it no grid cell, so it would fall outside the body');
  });

  // read back off the placements rather than recomputed here, so this stays a check on what the
  // planner decided and not a second copy of how it decides it
  const wideRows = plan.cells
    .filter((c) => c && c.gridColumn === '1 / -1')
    .map((c) => Number(c.gridRow))
    .sort((a, b) => a - b);

  const caps = plan.caps || [];
  let prevEnd = 0;
  caps.forEach((c, i) => {
    const at = rel + ' caption for Fig. ' + (c.figs || []).map((f) => f && f.n).join(' and ');
    if (!Number.isInteger(c.row) || c.row < 1) return fail(at, 'stands on no row: ' + JSON.stringify(c.row));
    if (!Number.isInteger(c.end)) return fail(at, 'has no end line, so it spans one row and inflates it: end is ' + JSON.stringify(c.end));
    if (c.end <= c.row) return fail(at, 'spans rows ' + c.row + ' / ' + c.end + ', which is empty or reversed');
    if (c.row < prevEnd) fail(at, 'starts on row ' + c.row + ', inside the previous caption which runs to ' + prevEnd);
    prevEnd = c.end;

    // a wide block reaches across both columns, so it owns column 2 on its row; a caption spanning
    // over that row shares the cell with the plate and draws on it once it outgrows the body between
    const clash = wideRows.find((w) => w >= c.row && w < c.end);
    if (clash !== undefined) {
      return fail(at, 'spans rows ' + c.row + ' / ' + c.end + ', covering row ' + clash
        + ' where a wide block already reaches across column 2, so the caption can draw over the plate');
    }

    // and it must not stop short either: a caption that gives up rows it could stand beside is the
    // single-row caption again, inflating the one row it has
    const nextCap = i + 1 < caps.length ? caps[i + 1].row : plan.tailRow + 1;
    const nextWide = wideRows.find((w) => w > c.row);
    const reach = nextWide === undefined ? nextCap : Math.min(nextCap, nextWide);
    const want = reach > c.row ? reach : c.row + 1;
    if (c.end !== want) {
      fail(at, 'ends at row ' + c.end + ' but should reach row ' + want + ', the earlier of the next caption on row '
        + nextCap + ' and the next wide block on row ' + (nextWide === undefined ? 'none' : nextWide));
    }
  });

  const aside = /^\s*(\d+)\s*\/\s*(\d+)\s*$/.exec(String(plan.asideRow || ''));
  if (!aside) return fail(rel, 'the aside row span is not a pair of grid lines: ' + JSON.stringify(plan.asideRow));
  if (caps.length && Number(aside[2]) > caps[0].row) {
    fail(rel, 'the aside runs to row ' + aside[2] + ', past the first caption on row ' + caps[0].row);
  }
  return { rows: plan.tailRow, caps: caps.length };
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
      // one entry per author, because a paper with three of them has three affiliations to set and
      // a single t/aff pair can only carry one. `eq` marks an equal-contribution author, `note` is
      // the line that explains the mark.
      if (!Array.isArray(b.authors) || !b.authors.length) { fail(where, 'a byline needs a non-empty authors array of {t, aff}'); break; }
      b.authors.forEach((a, j) => {
        const at = where + '.authors[' + j + ']';
        if (!a || typeof a !== 'object') return fail(at, 'an author must be an object with t and aff');
        if (typeof a.t !== 'string' || !a.t) fail(at, 'an author needs a name t');
        if (typeof a.aff !== 'string' || !a.aff) fail(at, 'an author needs an affiliation aff');
        if (a.eq !== undefined && typeof a.eq !== 'boolean') fail(at, 'eq marks equal contribution and must be a boolean');
        checkText(at + '.t', String(a.t || '')); checkText(at + '.aff', String(a.aff || ''));
      });
      if (b.note !== undefined) { if (typeof b.note !== 'string') fail(where, 'note must be a string'); else checkText(where + '.note', b.note); }
      break;
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
  const plan = checkRowPlan(rel, mod.blocks);
  checkPhonePlan(rel, mod.blocks);
  return { rel, blocks: mod.blocks.length, figs: seq.fig.length, eqs: seq.eq.length, tables: seq.table.length, algs: seq.alg.length, refs,
    rows: plan ? plan.rows : 0 };
}

const args = process.argv.slice(2);
const targets = args.length
  ? args.map((a) => path.relative(ROOT, path.resolve(a)).split(path.sep).join('/'))
  : readdirSync(path.join(ROOT, 'content')).filter((f) => f.endsWith('.js')).sort().map((f) => 'content/' + f);

checkKindsInSync();
checkPlannerKinds();
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
    + s.tables + ' tables, ' + s.algs + ' listings, ' + s.refs + ' references, ' + s.rows + ' grid rows');
}
console.log('check-paper: ' + summaries.length + ' module' + (summaries.length === 1 ? '' : 's') + ' clean');
