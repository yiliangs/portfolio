// check-sheet-fit: every text module of every Development sheet fits the rows its table gives it.
//
// The sheet places each module by a literal row span from SHEET_WIDE, SHEET_NARROW or SHEET_PHONE,
// and only the plates and the linked sheets measure their rows. A text module (the title block, the
// spec cells, the captions, the three body notes, the aside, the next-sheet control) takes the same
// span for every entry, so the span has to hold the longest entry at the width where that tier's
// text wraps hardest. Nothing on the page clips or measures, so a span that is too short shows as
// text and chips running over the module's frame line (issue #89).
//
// This check has no browser. It lays each module's text out in the one face the sheet uses, Geist
// Mono, whose advance is 0.6em (measured in headless Chrome: a run of 100 characters at 12.5px is
// 750px wide), wraps it greedily at spaces and after dashes, and sums the module's line heights,
// gaps and padding as the markup in design/Portfolio.dc.html writes them. It sweeps every whole
// pixel width each tier can be seen at, so a size that scales with the viewport is caught at
// whichever width it is worst. Run with `--at <width> <tier>` to print the estimate for one width.
//
// Calibrated against the probe of issue #89 (headless Chrome, all fourteen entries, 1000 to 1440
// wide, 600 to 1024 narrow, 320 to 599 phone): the stack line counts agree within one line, and
// before the tables were retuned the check flagged the modules the probe found overflowing.
import { readEntries, registerOf, readTable } from './dc-data.mjs';

const ADV = 0.6;          // Geist Mono advance, in em
const ROW = 44;           // grid-auto-rows
const COLS = 22;
const SCROLLBAR = 15;     // a desktop scrollbar; the phone tier's is an overlay and takes nothing
const SPACE_3 = 13.8;     // --space-3 in the design system stylesheet
const clamp = (lo, v, hi) => Math.min(hi, Math.max(lo, v));

const TIERS = {
  // wide: w >= STACK_W (1000) and landscape; the sheet stops growing at SHEET_MAX (1160) plus gutters
  SHEET_WIDE: { from: 1000, to: 1920, scrollbar: SCROLLBAR },
  // narrow: stacked but not a phone, which a portrait page of any width can be
  SHEET_NARROW: { from: 600, to: 1920, scrollbar: SCROLLBAR },
  SHEET_PHONE: { from: 320, to: 599, scrollbar: 0 },
};

// Greedy line count for `text` in a box `width` px wide at `size` px, with `spacing` em of letter
// spacing. Breaks at spaces and after a hyphen or dash, as Chrome does; a word longer than the
// line overflows sideways on one line rather than adding lines.
function lines(text, width, size, spacing = 0) {
  const adv = size * (ADV + spacing);
  const cap = Math.max(1, Math.floor((width + 0.01) / adv));
  const pieces = [];
  for (const word of String(text).split(/\s+/).filter(Boolean)) {
    const parts = word.split(/(?<=[-–—])(?=.)/);
    parts.forEach((p, i) => pieces.push({ t: p, space: i === 0 }));
  }
  let n = 0, len = 0;
  for (const p of pieces) {
    const add = (len && p.space ? 1 : 0) + p.t.length;
    if (len && len + add > cap) { n++; len = p.t.length; }
    else len += add;
  }
  return n + (len ? 1 : 0);
}

const span = (s) => { const [a, b] = s.split('/').map((x) => parseInt(x, 10)); return b - a; };
const ROMAN = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
const roman = (n) => { let s = ''; for (const [v, r] of ROMAN) while (n >= v) { s += r; n -= v; } return s; };

// The heights one entry's text modules need on one table at one viewport width.
function estimate(entry, ordinal, table, tableName, width, next) {
  const vw = width - TIERS[tableName].scrollbar;
  const sheet = Math.min(1160, vw) - 2 * clamp(20, 0.04 * vw, 48);
  const col = sheet / COLS;
  const padH = clamp(14, 0.037 * vw, 22);
  const padV = clamp(7, 0.0185 * vw, 11);
  const inner = (name) => span(table[name].col) * col - 2 * padH;
  const out = {};

  // title block: kicker, 22px, title at 1.04, 22px, lede
  {
    const w = inner('header');
    const tf = clamp(26, 0.05 * vw, 72), lf = clamp(16, 0.04 * vw, 20), llh = clamp(21, 0.052 * vw, 26);
    out.header = 2 * padH + 14 + 22 + lines(entry.title, Math.min(w, 16 * ADV * tf), tf, -0.03) * tf * 1.04
      + 22 + lines(entry.subtitle, Math.min(w, 52 * ADV * lf), lf) * llh;
  }
  // spec cells: a 12px label over 18px lines of 13px text
  const specs = { specSheet: 'SHT-' + String(ordinal + 1).padStart(2, '0'), specRole: entry.role, specWith: entry.with,
    specStatus: entry.status, specRev: entry.year + ' · 1:1' };
  for (const [name, text] of Object.entries(specs)) out[name] = 2 * padV + 12 + lines(text, inner(name), 13) * 18;
  // captions: 20px lines of 13px text, the figure word running into the caption
  out.heroCaption = 2 * padV + lines('Fig. ' + roman(ordinal + 1) + '. ' + (entry.caption || ''), inner('heroCaption'), 13) * 20;
  if (entry.detail || entry.detailA || entry.detailB) {
    const word = entry.detail ? 'Fig. 1.' : 'Figs. 1–2.';
    out.detailCaption = 2 * padV + lines(word + ' ' + (entry.detailCaption || ''), inner('detailCaption'), 13) * 20;
  }
  // body notes: a 3.5em label column and --space-3 of gap beside the text
  {
    const f = clamp(13, 0.034 * vw, 14.5), lh = clamp(23, 0.061 * vw, 26);
    for (const name of ['body1', 'body2', 'body3']) {
      if (!entry[name]) continue;
      out[name] = 2 * padH + lines(entry[name], inner(name) - 3.5 * f - SPACE_3, f) * lh;
    }
  }
  // aside: the note (a 12px rule and indent), 20px, four label rows 4px apart, 20px, the chips
  {
    const w = inner('aside');
    const value = w - 7 * ADV * 12.5 - 14;
    let h = 2 * padH;
    if (entry.margin) h += lines('// ' + entry.margin, w - 13, 12.5) * 20 + 20;
    for (const v of [entry.stack, entry.status, entry.pages, entry.link]) h += Math.max(1, lines(v || '', value, 12.5)) * 20;
    h += 3 * 4 + 20 + 28; // the chips: 11px on a 20px line, 3px padding and a 1px border either side
    out.aside = h;
  }
  // next-sheet control: the kicker, 4px, then the next sheet's title and its arrow
  {
    const f = clamp(18, 0.046 * vw, 24), lh = clamp(24, 0.062 * vw, 32);
    out.navNext = 2 * padV + 14 + 4 + lines(next.title + ' →', inner('navNext'), f, -0.03) * lh;
  }
  return out;
}

const entries = readEntries().filter((e) => registerOf(e) === 'mono');
// the next control names the following Development entry, wrapping to the first (neighbour() in the logic class)
const nextOf = (i) => entries[(i + 1) % entries.length];
const tables = Object.fromEntries(Object.keys(TIERS).map((n) => [n, readTable(n)]));

const at = process.argv.indexOf('--at');
if (at > 0) {
  const width = Number(process.argv[at + 1]), name = process.argv[at + 2] || 'SHEET_WIDE';
  entries.forEach((e, i) => {
    const est = estimate(e, i, tables[name], name, width, nextOf(i));
    console.log(e.id, Object.entries(est).map(([k, v]) => k + ' ' + Math.round(v) + '/' + span(tables[name][k].row) * ROW).join(', '));
  });
  process.exit(0);
}

const worst = new Map();
for (const [name, tier] of Object.entries(TIERS)) {
  for (let width = tier.from; width <= tier.to; width++) {
    entries.forEach((e, i) => {
      for (const [mod, h] of Object.entries(estimate(e, i, tables[name], name, width, nextOf(i)))) {
        const room = span(tables[name][mod].row) * ROW;
        if (h <= room + 0.5) continue;
        const key = name + ' ' + mod + ' ' + e.id;
        const prev = worst.get(key);
        if (!prev || h - room > prev.over) worst.set(key, { over: h - room, width, room, need: Math.ceil(h / ROW) });
      }
    });
  }
}

if (worst.size) {
  console.error('check-sheet-fit: ' + worst.size + ' module' + (worst.size === 1 ? '' : 's') + ' outgrow their rows');
  for (const [key, w] of worst) console.error('  - ' + key + ': ' + Math.round(w.over) + 'px over its ' + w.room
    + 'px at ' + w.width + 'px wide; needs ' + w.need + ' rows');
  process.exit(1);
}
console.log('check-sheet-fit: ' + entries.length + ' Development entries fit every text module of the '
  + Object.keys(TIERS).length + ' sheet tables at every width from 320 to 1920');
