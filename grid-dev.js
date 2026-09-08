// Tuning panel for the Development register's drawing grid, in both its readings: the landing, which
// is that grid run to the screen's edges, and a project sheet, which is the same grid at a measure.
// One panel, because they are one grid. A module is a module either way, the cell arithmetic is the
// same, and all that differs is which table the thing under the cursor writes.
//
// One row per module on the page, showing the placement entry that put it there and the only two
// things that entry says: where it starts, and how many columns and rows it takes. Click a module to
// select it, drag it to move it, drag one of its handles to resize it, nudge it with the arrows, or
// type the four grid lines in. Every move snaps to a cell, because on this grid the cell is the
// drawing. Loaded only when the URL carries ?dev, so it ships nothing to the page otherwise.
//
// Four tables are reachable, and which one a module writes is read off its name:
//
//   plate.<slug>   a Development entry's plate on the landing        LANDING_PINS
//   statement, platform, contactEmail, contactGithub, contactCv     LANDING_WIDE
//   anything else  a module of the project sheet                    SHEET_WIDE or SHEET_NARROW
//
// A plate is the one that is not simply a table lookup. The landing's plates are drawn onto free
// cells from a seed, so a plate normally has no entry at all, and each pin takes cells away from that
// draw: while any plate is still drawn, pinning one shuffles the others, and a composition made on
// ground that moves is no composition. So the panel freezes the sheet before anything else. The first
// time it finds plates drawn on the landing it claims every one of them where the draw has just left
// it, which changes nothing on the page and takes the draw out of the session; from there nothing
// moves but what is moved. Unpin gives one plate back to the draw and unpin all gives back the lot,
// which reshuffles by design. Reset returns to the frozen composition, not to the empty table the
// page was loaded with.
//
// The sheet being frozen is also why the page behind ?dev draws its landing loosely, placeLanding's
// `strict: false`: a drag carries a pin across its neighbours on the way to wherever it is going, and
// under the strict reading that composition is refused outright and every plate leaves the page,
// including the one under the cursor. So plates may be laid over one another here. What that costs is
// that the block this panel writes is not necessarily one the shipped page can draw, and the warning
// line below names every overlap and every touch for exactly that reason.
//
// Some lines cannot be written, and the panel refuses them rather than recording a number the page
// ignores. The statement and the platform are as deep as the statement's own type, measured off the
// page; the contact band sits on whatever row the draw ended on; a portrait hero takes its columns
// and its depth from its picture; and the single detail plate has no entry of its own, standing for
// the detailA/detailB pair. An edge like that is disabled here and said so in the selection strip.
//
// The panel also reports what would go wrong: what tools/check-sheet-grid.mjs would reject on a
// sheet, what breaks the landing's one-empty-cell rule, and the message placeLanding gives when the
// pins have left the remaining plates nowhere to go, which otherwise shows only as a landing with no
// plates on it at all.
//
// Copy writes all four tables to the clipboard, ready to paste into design/Portfolio.dc.html, and
// says how much it wrote rather than printing the block: the block is what the clipboard is holding,
// and __grid.dump() is where to read it. Paste reads such a block back, so a session survives a
// reload rather than living only in this tab.
//
// Collapse folds the panel down to its header, which stays on the page and stays draggable: clicking
// it, or pressing s, opens it again. Nothing here is ever taken off the page, since a panel that
// vanishes reads as a panel that broke. Escape drops the selection, and the panel does hide itself on
// a view it has nothing to tune, which is the one thing the reader never asked for.
//
// While the panel is open the plates hold their hover text. A landing plate unrolls the reason it was
// built out of itself on hover, over its neighbours and over anything the panel has drawn on the
// grid, and the cursor is on a plate for the whole of a move, so composing with it running means
// composing behind a paragraph. Collapsing the panel gives it back, and so does the box in the panel
// for anyone who wants to see the two together.
//
// mount(api) -> { destroy() }, where api is { tables, sheetTable, landingError, quiet, rerender }: the
// four live tables off the logic class, mutated in place, a getter for which sheet table the width is
// rendering, a getter for the placement's last complaint, a setter for holding the typewriter, and
// the component's re-render. serialize() is pure and exported on its own so the paste-back path can
// be checked without a DOM.

const INK = '#f3f2f2', DIM = '#a8a4a0', GOLD = '#b68235', WARN = '#e07a5f', RULE = 'rgba(243,242,242,0.12)';
const el = (tag, css, text) => { const e = document.createElement(tag); if (css) e.style.cssText = css; if (text != null) e.textContent = text; return e; };

const COLS = 22;              // grid lines run 1..COLS+1, the same count the checks hold
const ROW = 44;               // the row height, read off the grid when there is one
const NAMES = ['SHEET_WIDE', 'SHEET_NARROW', 'LANDING_WIDE', 'LANDING_PINS'];
// the three tables whose modules are fixed: a paste has to bring the same set back. LANDING_PINS is
// the odd one out, since pinning and unpinning is exactly a change of which entries it holds.
const FIXED = ['SHEET_WIDE', 'SHEET_NARROW', 'LANDING_WIDE'];
const LANDING_KEYS = ['statement', 'platform', 'contactEmail', 'contactGithub', 'contactCv'];
const PLATE = /^plate\.(.+)$/;

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const span = (s) => { const m = /^\s*(\d+)\s*\/\s*(\d+)\s*$/.exec(String(s)); return m ? [parseInt(m[1], 10), parseInt(m[2], 10)] : null; };

// ---------------------------------------------------------------- the paste-back block

// A placement table is written back in the source's own shape: one module to a line, the keys and the
// column spans padded so the row spans stand in a column of their own. The padding is measured off
// the entries rather than fixed, so a longer name or a wider span keeps the block aligned. A slug is
// not an identifier, so a key that is not one is quoted, which is how LANDING_PINS reads in the
// source too. What comes out has to be readable by tools/check-sheet-grid.mjs and
// tools/check-landing-grid.mjs, which parse these tables line by line.
const key = (k) => (/^[A-Za-z_$][\w$]*$/.test(k) ? k : "'" + k.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'");

const block = (name, t) => {
  const keys = Object.keys(t);
  const kw = keys.reduce((n, k) => Math.max(n, key(k).length + 1), 0) + 1;
  const cw = keys.reduce((n, k) => Math.max(n, ("'" + t[k].col + "',").length), 0) + 1;
  const line = (k) => '    ' + (key(k) + ':').padEnd(kw) + '{ col: ' + ("'" + t[k].col + "',").padEnd(cw) + 'row: ' + "'" + t[k].row + "' },";
  return name + ' = {' + (keys.length ? '\n' + keys.map(line).join('\n') : '') + '\n  };';
};

export function serialize(tables) {
  return NAMES.map((n) => '  ' + block(n, tables[n])).join('\n');
}

// ---------------------------------------------------------------- reading and writing one entry

// A landing module's row is a word rather than a span: 'fit' for the depth of the statement's own
// type, 'last' for the row the draw ended on. Only the column half of such an entry is writable, so
// the two axes are handled apart all the way down rather than only at the top.
const colOf = (e) => span(e.col);
const rowOf = (e) => span(e.row);
const setCol = (e, v) => { e.col = v[0] + ' / ' + v[1]; };
const setRow = (e, v) => { e.row = v[0] + ' / ' + v[1]; };

const readBox = (e) => ({ c: colOf(e), r: rowOf(e) });
const writeBox = (e, b) => { setCol(e, b.c); setRow(e, b.r); };

// A move carries the whole rectangle, so it keeps its size and its proportion: only where it sits
// changes. The grid has a right edge and a first row, and a module pushed against either stops there
// rather than growing or wrapping.
const colShift = (e, d) => { const v = colOf(e), w = v[1] - v[0], c0 = clamp(v[0] + d, 1, COLS + 1 - w); setCol(e, [c0, c0 + w]); };
const rowShift = (e, d) => { const v = rowOf(e), h = v[1] - v[0], r0 = Math.max(1, v[0] + d); setRow(e, [r0, r0 + h]); };
const shift = (e, dc, dr) => { colShift(e, dc); rowShift(e, dr); };

// A resize moves one grid line and leaves the other three where they are, which is what changes the
// module's size and its proportion at once. A span never closes to nothing: the line being dragged
// stops one cell short of its opposite.
const shut = (v, end) => { if (v[0] >= v[1]) { if (end === 0) v[0] = v[1] - 1; else v[1] = v[0] + 1; } return v; };
const colEdge = (e, end, d) => {
  const v = colOf(e).slice(); v[end] += d;
  v[0] = clamp(v[0], 1, COLS); v[1] = clamp(v[1], 2, COLS + 1);
  setCol(e, shut(v, end));
};
const rowEdge = (e, end, d) => {
  const v = rowOf(e).slice(); v[end] += d;
  v[0] = Math.max(1, v[0]); v[1] = Math.max(2, v[1]);
  setRow(e, shut(v, end));
};

// true when two boxes have an empty cell between them on some axis, which is the gap the landing's
// draw keeps between every pair of modules. The sheet wants the opposite: its modules share a
// hairline and sit edge to edge, so this is asked only of the landing.
const apart = (a, b) => a.c[1] < b.c[0] || b.c[1] < a.c[0] || a.r[1] < b.r[0] || b.r[1] < a.r[0];
const over = (a, b) => a.c[0] < b.c[1] && b.c[0] < a.c[1] && a.r[0] < b.r[1] && b.r[0] < a.r[1];

// ---------------------------------------------------------------- what a module on the page writes
//
// Every module answers with the same four things, so the drag, the handles, the arrows and the typed
// lines all speak to one shape: the entries it writes, the box it shows, a move, and a writer per
// edge that is null when the page answers that line rather than the table.
const binding = (name, T, sheetName, live) => {
  const plate = PLATE.exec(name);

  if (plate) {
    const slug = plate[1], pins = T.LANDING_PINS;
    // A pinned plate is bindable with nothing on the page to bind to, and that is not a nicety: pins
    // that cannot be drawn take the whole landing's plates off the page, and a pin nobody can reach
    // is a pin nobody can undo. An unpinned plate has only its drawn cell to go on and does need one.
    if (!live && !pins[slug]) return null;
    // An unpinned plate is wherever the draw put it, and the first move or resize claims that cell:
    // grabbing a plate is what pins it. Everything below therefore writes through claim() rather
    // than through the entry, which may not exist yet.
    const claim = () => { if (!pins[slug]) { pins[slug] = { col: '', row: '' }; writeBox(pins[slug], live); } return pins[slug]; };
    const pinned = !!pins[slug];
    return {
      table: 'LANDING_PINS', targets: [slug], view: pinned ? readBox(pins[slug]) : live, pinned,
      note: pinned ? 'pinned to these cells; the draw works around it'
        : 'drawn from the seed, so it moves on every load; moving it pins it here',
      move: (dc, dr) => shift(claim(), dc, dr),
      edges: {
        left: (d) => colEdge(claim(), 0, d), right: (d) => colEdge(claim(), 1, d),
        top: (d) => rowEdge(claim(), 0, d), bottom: (d) => rowEdge(claim(), 1, d),
      },
      unpin: pinned ? () => { delete pins[slug]; } : null,
    };
  }

  if (LANDING_KEYS.includes(name)) {
    const t = T.LANDING_WIDE, e = t[name], c = e && colOf(e);
    if (!c || !live) return null;
    return {
      table: 'LANDING_WIDE', targets: [name], view: { c, r: live.r },
      note: e.row === 'fit' ? "as deep as the statement's own type, measured off the page"
        : "on the grid's last row, wherever the draw ended",
      move: (dc) => colShift(e, dc),
      edges: { left: (d) => colEdge(e, 0, d), right: (d) => colEdge(e, 1, d), top: null, bottom: null },
    };
  }

  // the sheet. `detail` is the single plate an entry may carry instead of the detailA/detailB pair;
  // it has no entry of its own, standing for both, so it writes the pair's outer lines and its depth
  // is the picture's. A portrait hero keeps only its top line: renderVals gives it PORTRAIT_COLS of
  // the twenty-two and as many rows as the picture needs, so its other three are answered before the
  // table is read.
  const t = T[sheetName];
  if (name === 'detail') {
    const a = t.detailA && readBox(t.detailA), b = t.detailB && readBox(t.detailB);
    if (!a || !b) return null;
    return {
      table: sheetName, targets: ['detailA', 'detailB'],
      view: { c: [Math.min(a.c[0], b.c[0]), Math.max(a.c[1], b.c[1])], r: [Math.min(a.r[0], b.r[0]), Math.max(a.r[1], b.r[1])] },
      note: "stands in for detailA and detailB; its depth is the picture's",
      move: (dc, dr) => { shift(t.detailA, dc, dr); shift(t.detailB, dc, dr); },
      edges: {
        left: (d) => colEdge(t.detailA, 0, d), right: (d) => colEdge(t.detailB, 1, d),
        top: (d) => { rowEdge(t.detailA, 0, d); rowEdge(t.detailB, 0, d); }, bottom: null,
      },
    };
  }
  const e = t[name];
  if (!e) return null;
  const own = readBox(e);
  const portrait = name === 'hero' && live && (live.c[0] !== own.c[0] || live.c[1] !== own.c[1]);
  return {
    table: sheetName, targets: [name], view: own,
    note: portrait ? "portrait hero; its columns and its depth are the picture's" : '',
    move: portrait ? (dc, dr) => rowShift(e, dr) : (dc, dr) => shift(e, dc, dr),
    edges: {
      left: portrait ? null : (d) => colEdge(e, 0, d),
      right: portrait ? null : (d) => colEdge(e, 1, d),
      top: (d) => rowEdge(e, 0, d),
      bottom: portrait ? null : (d) => rowEdge(e, 1, d),
    },
  };
};

// ---------------------------------------------------------------- what would go wrong

const sheetProblems = (t) => {
  const out = [], boxes = [];
  for (const k of Object.keys(t)) {
    const c = colOf(t[k]), r = rowOf(t[k]);
    if (!c || !r) { out.push(k + ' has a span nothing can read'); continue; }
    if (c[0] < 1 || c[1] > COLS + 1) out.push(k + ' runs off the ' + COLS + ' column grid: ' + t[k].col);
    if (c[0] >= c[1]) out.push(k + ' has an empty column span: ' + t[k].col);
    if (r[0] < 1) out.push(k + ' starts above row 1: ' + t[k].row);
    if (r[0] >= r[1]) out.push(k + ' has an empty row span: ' + t[k].row);
    boxes.push([k, { c, r }]);
  }
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      if (over(boxes[i][1], boxes[j][1])) out.push(boxes[i][0] + ' and ' + boxes[j][0] + ' lie over the same cells');
    }
  }
  return out;
};

// The landing keeps an empty cell between every pair of modules, which is what makes it read as a
// board rather than a table, so touching is a failure here and not only overlapping. `corner` is the
// statement and the platform as the one block the draw reserves for them.
const landingProblems = (T, corner) => {
  const out = [];
  for (const k of LANDING_KEYS) {
    const e = T.LANDING_WIDE[k];
    if (!e) { out.push('LANDING_WIDE has no ' + k); continue; }
    const c = colOf(e);
    if (!c) { out.push(k + ' has a column span nothing can read: ' + e.col); continue; }
    if (c[0] < 1 || c[1] > COLS + 1) out.push(k + ' runs off the ' + COLS + ' column grid: ' + e.col);
    if (c[0] >= c[1]) out.push(k + ' has an empty column span: ' + e.col);
  }
  const pins = Object.entries(T.LANDING_PINS).map(([slug, e]) => [slug, readBox(e)]);
  for (const [slug, b] of pins) {
    if (!b.c || !b.r) { out.push(slug + ' has a pin nothing can read'); continue; }
    if (b.c[0] < 1 || b.c[1] > COLS + 1) out.push(slug + ' is pinned off the ' + COLS + ' column grid');
    if (b.r[0] < 1) out.push(slug + ' is pinned above row 1');
    if (corner && !apart(b, corner)) out.push(slug + ' is pinned onto the statement block, which is filled in before any plate');
  }
  for (let i = 0; i < pins.length; i++) {
    for (let j = i + 1; j < pins.length; j++) {
      const [an, a] = pins[i], [bn, b] = pins[j];
      if (!a.c || !b.c) continue;
      if (over(a, b)) out.push(an + ' and ' + bn + ' are pinned over the same cells');
      else if (!apart(a, b)) out.push(an + ' and ' + bn + ' touch: the landing keeps an empty cell between modules');
    }
  }
  return out;
};

// ---------------------------------------------------------------- the panel

export function mount(api) {
  const { tables: T, sheetTable, landingError, quiet, rerender } = api;
  const initial = JSON.parse(JSON.stringify(T));

  let selected = null, rows = [], drag = null, raf = 0, collapsed = false, built = false;
  // Whether the landing has been taken off the draw yet. Once, per mount: see freeze() below.
  let frozen = false;
  // A landing plate unrolls its reason out of itself on hover, over its neighbours and over the mark,
  // and the cursor sits on a plate for the whole of a move. So the typewriter is held while the panel
  // is open, and comes back the moment it is folded away or the view has no grid on it. The box below
  // turns it back on without collapsing the panel. `told` is the last value the page was given, since
  // telling it again would re-render, and re-rendering is what calls this.
  let typewriter = false, told = null;
  const hold = () => {
    const want = !typewriter && !collapsed && !!surface();
    if (want === told) return;
    told = want;
    if (quiet) quiet(want);
  };

  const root = el('div', `position:fixed; left:16px; bottom:16px; z-index:1000; width:370px; max-height:calc(100vh - 32px); overflow:auto; box-sizing:border-box; padding:4px 0 10px; background:rgba(28,27,26,0.94); color:${INK}; font:11px/1.5 'Geist Mono', ui-monospace, monospace; border-radius:6px; box-shadow:0 12px 40px rgba(0,0,0,0.35); user-select:none; pointer-events:auto;`);
  // The panel opens over the drawing's left columns, which is half of what it is for tuning, so its
  // header is a handle: drag it anywhere and it parks there for the rest of the session.
  const head = el('div', `margin:10px 14px 4px; padding-bottom:4px; border-bottom:1px solid ${RULE}; color:${GOLD}; font-size:10px; letter-spacing:0.14em; text-transform:uppercase; cursor:move;`, 'development grid  ⠿');
  // Collapsed, the handle is the whole panel, so the press that would have dragged it has to open it
  // instead. Which of the two it was is a question of travel and not of intent: a press that moved is
  // a drag, and one that did not is a click. Three pixels because a click on a trackpad is rarely
  // still, and because parking the panel one pixel to the left is not a thing anyone is trying to do.
  head.onpointerdown = (ev) => {
    ev.preventDefault(); ev.stopPropagation();
    const b = root.getBoundingClientRect(), ox = ev.clientX - b.left, oy = ev.clientY - b.top;
    let moved = false;
    const move = (e) => {
      if (!moved && Math.abs(e.clientX - ev.clientX) + Math.abs(e.clientY - ev.clientY) <= 3) return;
      moved = true;
      root.style.right = 'auto'; root.style.bottom = 'auto';
      root.style.left = Math.max(0, Math.min(window.innerWidth - b.width, e.clientX - ox)) + 'px';
      root.style.top = Math.max(0, Math.min(window.innerHeight - 40, e.clientY - oy)) + 'px';
    };
    const up = () => {
      window.removeEventListener('pointermove', move, true); window.removeEventListener('pointerup', up, true);
      if (!moved && collapsed) { collapsed = false; refresh(); }
    };
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', up, true);
  };
  // Everything but the handle, in one box, because collapsing is exactly hiding all of it: the panel
  // folds to its header rather than leaving the page, and a single box is one display to switch
  // rather than a display to remember for each of nine children, three of which are flex rows.
  const body = el('div', '');
  const which = el('div', `margin:0 14px 4px; color:${GOLD}; font-size:10px;`);
  const hint = el('div', `margin:0 14px 6px; color:${DIM}; font-size:10px;`, 'click a module, drag to move it, drag a handle to resize it, arrows to nudge, shift-arrows to grow or shrink, alt-arrows to move the near edge; the landing is pinned where it was drawn, so nothing moves but what you move and plates may be laid over one another; s folds the panel to its handle and gives the plates their hover text back');
  const list = el('div', '');
  const sel = el('div', `margin:6px 14px 0; padding-top:6px; border-top:1px solid ${RULE};`);
  const bad = el('div', `margin:6px 14px 0; color:${WARN}; font-size:10px; white-space:pre-line;`);
  const out = el('pre', `margin:8px 14px 0; white-space:pre; color:${DIM}; font-size:10px; max-height:180px; overflow:auto; user-select:text;`);
  body.append(which, hint, list, sel, bad);
  root.append(head, body);

  // ---------------------------------------------------------------- the modules on the page
  // Read fresh every time: the drawing re-renders on hover and on any change made here, the tables
  // are read again on every render, and pinning one plate redraws the rest, so a held element or a
  // held entry goes stale within one interaction.
  // Scoped to the page, never the document, for the reason the observer is: a register change lifts a
  // clone of the outgoing view into a morph layer beside #dc-root and fades it out over the next
  // second, and that clone carries every data-mod the live view had. Asked of the document, the panel
  // spends that second binding modules that are already dead, and reads the landing as still on the
  // page after the reader has left it.
  const page = () => document.getElementById('dc-root') || document.body;
  const modules = () => [...page().querySelectorAll('[data-mod]')];
  const gridOf = (node) => {
    for (let p = node && node.parentElement; p; p = p.parentElement) if (getComputedStyle(p).display === 'grid') return p;
    return null;
  };
  const grid = () => gridOf(modules()[0]);
  const cell = () => {
    const g = grid(); if (!g) return null;
    const r = g.getBoundingClientRect();
    return { w: r.width / COLS, h: parseFloat(getComputedStyle(g).gridAutoRows) || ROW };
  };
  const found = (name) => modules().find((m) => m.dataset.mod === name);
  // the span the page actually gave a module, which is not the table's wherever the page derived it,
  // and is the only source there is for a plate the draw placed
  const liveBox = (node) => {
    const s = node && node.style;
    const c = s && span(s.gridColumn), r = s && span(s.gridRow);
    return c && r ? { c, r } : null;
  };
  // Which reading of the grid is on the page. The landing's five hand-placed modules and its plates
  // share no name with any module of the sheet, so one module is enough to say.
  const surface = () => {
    const ms = modules();
    if (!ms.length) return null;
    return ms.some((m) => PLATE.test(m.dataset.mod) || LANDING_KEYS.includes(m.dataset.mod)) ? 'landing' : 'sheet';
  };
  const bindOf = (name) => binding(name, T, sheetTable(), liveBox(found(name)));
  // the statement and the platform as the one block landing-grid reserves for the pair, which is what
  // a pin has to stay clear of
  const cornerBox = () => {
    const st = liveBox(found('statement')), pf = liveBox(found('platform'));
    return st && pf ? { c: [Math.min(st.c[0], pf.c[0]), Math.max(st.c[1], pf.c[1])], r: [Math.min(st.r[0], pf.r[0]), Math.max(st.r[1], pf.r[1])] } : null;
  };

  // ---------------------------------------------------------------- the selection mark
  // A box over the selected module carrying the handles that resize it. It lives in the grid, which is
  // positioned, so it needs no scroll handling: it travels with the drawing. Nothing but the handles
  // takes the pointer, so a plate under the mark still answers the cursor.
  // z-index 40 and not the auto it would otherwise take: a landing plate is positioned and carries
  // z-index 1, which paints it over anything at auto in the same stacking context, so the mark was
  // drawn under the very module it was marking and only its overhang was visible. The sheet declares
  // no z-index anywhere, so 40 is above everything on either drawing.
  const mark = el('div', `position:absolute; z-index:40; pointer-events:none; outline:1px solid ${GOLD}; outline-offset:-1px; background:rgba(182,130,53,0.10); display:none;`);
  for (const [name, x, y, cur] of [['left', '0', '50%', 'ew-resize'], ['right', '100%', '50%', 'ew-resize'], ['top', '50%', '0', 'ns-resize'], ['bottom', '50%', '100%', 'ns-resize']]) {
    const h = el('div', `position:absolute; left:${x}; top:${y}; transform:translate(-50%,-50%); width:13px; height:13px; box-sizing:border-box; border:1px solid ${GOLD}; background:#1c1b1a; border-radius:2px; pointer-events:auto; cursor:${cur};`);
    h.dataset.handle = name;
    mark.appendChild(h);
  }
  const placeMark = () => {
    const g = grid(), node = selected && found(selected);
    if (!g || !node) { mark.style.display = 'none'; return; }
    if (mark.parentElement !== g) g.appendChild(mark);
    const gr = g.getBoundingClientRect(), nr = node.getBoundingClientRect();
    mark.style.display = 'block';
    mark.style.left = (nr.left - gr.left) + 'px';
    mark.style.top = (nr.top - gr.top) + 'px';
    mark.style.width = nr.width + 'px';
    mark.style.height = nr.height + 'px';
    const b = bindOf(selected);
    [...mark.children].forEach((h) => { h.style.display = b && b.edges[h.dataset.handle] ? 'block' : 'none'; });
  };

  // ---------------------------------------------------------------- rows
  const build = () => {
    list.textContent = '';
    // The rows are the modules on the page, and on the landing also any plate that is pinned but not
    // drawn. That second set is normally empty and matters entirely when it is not: a pin the draw
    // cannot honour takes every plate off the page, and without a row for it there would be no way
    // back short of reset.
    const shown = modules().map((m) => m.dataset.mod);
    const absent = Object.keys(T.LANDING_PINS).map((s) => 'plate.' + s).filter((n) => !shown.includes(n));
    rows = [...shown, ...(surface() === 'landing' ? absent : [])].map((name) => {
      const row = el('div', 'padding:5px 14px 6px; cursor:pointer; border-left:2px solid transparent;');
      const top = el('div', 'display:flex; justify-content:space-between; align-items:baseline; gap:8px;');
      const label = el('span', `color:${INK}; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;`, name);
      const size = el('span', `color:${DIM}; font-size:10px; white-space:nowrap;`);
      top.append(label, size);
      const vals = el('div', `color:${DIM}; font-size:10px;`);
      const show = () => {
        const b = bindOf(name);
        if (b) {
          vals.textContent = 'col ' + b.view.c.join(' / ') + '   row ' + b.view.r.join(' / ') + (b.pinned === false ? '   drawn' : '');
          size.textContent = (b.view.c[1] - b.view.c[0]) + ' × ' + (b.view.r[1] - b.view.r[0]);
          label.style.color = b.pinned === false ? DIM : INK;
        } else {
          vals.textContent = 'nothing on the page places it';
          size.textContent = '';
        }
        row.style.borderLeftColor = selected === name ? GOLD : 'transparent';
        row.style.background = selected === name ? 'rgba(182,130,53,0.10)' : 'transparent';
      };
      row.onclick = () => { selected = name; refresh(); };
      row.append(top, vals);
      list.appendChild(row);
      return { name, show };
    });
    if (!rows.length) list.appendChild(el('div', `padding:6px 14px; color:${DIM};`, 'nothing on this view sits on the drawing grid'));
  };

  // ---------------------------------------------------------------- the four grid lines, typed
  // A drag settles a composition and a typed line confirms it. The inputs write through the same edge
  // writers the handles use, so a line the page answers is disabled here too rather than accepting a
  // number and dropping it. The strip is rebuilt only when the selection changes, never on a value: a
  // drag refreshes on every pointer move, and a strip rebuilt under a typed line would take the field
  // away mid-number.
  const fields = {};
  const LINES = [['col start', 'left'], ['col end', 'right'], ['row start', 'top'], ['row end', 'bottom']];
  const buildSel = () => {
    if (built === selected) return;
    built = selected;
    for (const k of Object.keys(fields)) delete fields[k];
    sel.textContent = '';
    const b = selected && bindOf(selected);
    if (!b) { sel.appendChild(el('div', `color:${DIM}; font-size:10px;`, 'nothing selected')); return; }
    const head2 = el('div', `display:flex; justify-content:space-between; gap:8px; color:${GOLD}; font-size:10px; margin-bottom:4px;`);
    head2.append(el('span', 'overflow:hidden; text-overflow:ellipsis; white-space:nowrap;', selected),
      el('span', 'flex:none;', b.table + '.' + b.targets.join(', ')));
    sel.appendChild(head2);
    if (b.note) sel.appendChild(el('div', `color:${DIM}; font-size:10px; margin-bottom:4px;`, b.note));
    const four = el('div', 'display:grid; grid-template-columns:repeat(4,1fr); gap:4px;');
    for (const [label, edgeName] of LINES) {
      const wrap = el('div', '');
      wrap.appendChild(el('div', `color:${DIM}; font-size:9px;`, label));
      const inp = el('input', `width:100%; box-sizing:border-box; background:#1c1b1a; color:${INK}; border:1px solid ${RULE}; border-radius:2px; padding:2px 4px; font:11px 'Geist Mono', ui-monospace, monospace;`);
      inp.type = 'number';
      inp.onpointerdown = (ev) => ev.stopPropagation();
      inp.onchange = () => {
        const cur = bindOf(selected); if (!cur || !cur.edges[edgeName]) return;
        const at = { left: cur.view.c[0], right: cur.view.c[1], top: cur.view.r[0], bottom: cur.view.r[1] }[edgeName];
        const d = Math.round(Number(inp.value)) - at;
        if (d) { cur.edges[edgeName](d); rerender(); }
        refresh();
      };
      fields[edgeName] = inp;
      wrap.appendChild(inp);
      four.appendChild(wrap);
    }
    sel.appendChild(four);
    if (b.unpin) {
      const un = el('button', `all:unset; cursor:pointer; display:inline-block; margin:6px 0 0; padding:3px 9px; border:1px solid rgba(243,242,242,0.25); border-radius:3px; color:${INK}; font-size:10px;`, 'unpin');
      un.title = 'give this plate back to the seeded draw';
      un.onclick = () => { b.unpin(); rerender(); rebuild(); };
      sel.appendChild(un);
    }
  };
  const showSel = () => {
    const b = selected && bindOf(selected); if (!b) return;
    const at = { left: b.view.c[0], right: b.view.c[1], top: b.view.r[0], bottom: b.view.r[1] };
    for (const k of Object.keys(fields)) {
      const f = fields[k]; if (!f) continue;
      f.disabled = !b.edges[k];
      f.style.color = f.disabled ? DIM : INK;
      if (document.activeElement !== f) f.value = String(at[k]);
    }
  };

  // Folded, the panel is its header and nothing else: still on the page, still parked where it was
  // dragged to, still the handle that opens it again. A panel that took itself off the page reads as
  // a panel that crashed, and the key that would bring it back is a key nobody can see.
  const fold = () => {
    body.style.display = collapsed ? 'none' : 'block';
    root.style.width = collapsed ? 'auto' : '370px';
    root.style.padding = collapsed ? '0' : '4px 0 10px';
    head.style.margin = collapsed ? '0' : '10px 14px 4px';
    head.style.padding = collapsed ? '5px 12px' : '0 0 4px';
    head.style.borderBottom = collapsed ? 'none' : '1px solid ' + RULE;
    head.textContent = collapsed ? 'grid  ⠿' : 'development grid  ⠿';
    head.title = collapsed ? 'click to open the grid panel, or press s' : 'drag to park the panel';
  };

  const refresh = () => {
    const s = surface();
    which.textContent = s === 'landing' ? 'tuning LANDING_WIDE and LANDING_PINS  ·  the landing at ' + COLS + ' columns'
      : s === 'sheet' ? 'tuning ' + sheetTable() + '  ·  the sheet at ' + COLS + ' columns'
        : 'no drawing grid on this view';
    // the panel is furniture for the grid, so it stands only where there is one to tune, which is
    // also what keeps it from standing beside the Research margins panel with nothing to say. Folding
    // it away is the reader's business and not this line's: a folded panel is still on the page.
    root.hidden = !s;
    fold();
    pins.hidden = s !== 'landing';
    hold();
    rows.forEach((r) => r.show());
    buildSel(); showSel();
    const p = s === 'landing' ? landingProblems(T, cornerBox()) : s === 'sheet' ? sheetProblems(T[sheetTable()]) : [];
    const err = landingError && landingError();
    if (s === 'landing' && err) p.unshift(err + '; the landing is rendering no plates at all');
    bad.textContent = p.length ? p.join('\n') : '';
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(placeMark);
  };
  // Claiming every plate exactly where the draw has just left it. The composition on the page does
  // not change, and from there it is the pin that moves rather than the draw that reruns, which is
  // the difference between composing and watching the sheet reshuffle under every edit.
  const claimDrawn = () => {
    let claimed = 0;
    for (const node of modules()) {
      const pl = PLATE.exec(node.dataset.mod); if (!pl) continue;
      const b = liveBox(node); if (!b || T.LANDING_PINS[pl[1]]) continue;
      T.LANDING_PINS[pl[1]] = { col: '', row: '' };
      writeBox(T.LANDING_PINS[pl[1]], b);
      claimed++;
    }
    return claimed;
  };
  // The same thing, once per mount, without being asked. A tuning session begins the moment the
  // landing is on the screen, and beginning it on a sheet that is still being drawn means every
  // change reshuffles every plate that has no pin yet: the thing being composed moves while it is
  // composed. So the first sight of a drawn landing takes it off the draw. It waits for a landing
  // whose plates have all been placed, because half a sheet frozen is a composition nobody made.
  const freeze = () => {
    if (frozen || surface() !== 'landing') return;
    const plates = modules().filter((m) => PLATE.test(m.dataset.mod));
    if (!plates.length || plates.some((m) => !liveBox(m))) return;
    frozen = true;
    if (claimDrawn()) rerender();
    // and reset goes back to this composition rather than to the empty table the page was loaded
    // with, since handing the sheet back to the draw is what unpin all is for
    initial.LANDING_PINS = JSON.parse(JSON.stringify(T.LANDING_PINS));
  };
  const rebuild = () => { freeze(); build(); refresh(); };
  // The panel's own mark sits inside the drawing it watches, and moving it is a mutation of that
  // drawing. Records that come only from the mark are the panel's echo and are dropped, or the
  // observer would call rebuild in a loop and the page would never come back.
  const ours = (records) => records.every((r) => mark.contains(r.target) || r.target === mark);

  // ---------------------------------------------------------------- move and resize
  const start = (name, handle, ev) => {
    const b = bindOf(name); if (!b) return;
    const c = cell(); if (!c) return;
    // The base is the entries as they stand, so the drag is the pointer's whole travel applied once
    // rather than a sum of steps. A plate with no pin yet has no entry to record: claiming it here
    // rather than on the first move is what gives the drag something to be relative to.
    if (b.table === 'LANDING_PINS' && !b.pinned) { b.move(0, 0); }
    const live = T[b.table], base = {};
    for (const k of b.targets) if (live[k]) base[k] = { ...live[k] };
    drag = { name, handle, x: ev.clientX, y: ev.clientY, table: b.table, base, cell: c };
  };
  const onDown = (ev) => {
    if (root.contains(ev.target)) return;
    const handle = ev.target.dataset && ev.target.dataset.handle;
    const node = handle ? found(selected) : ev.target.closest && ev.target.closest('[data-mod]');
    if (!node) return;
    ev.preventDefault(); ev.stopPropagation();
    selected = node.dataset.mod;
    start(selected, handle || null, ev);
    refresh();
  };
  const onMove = (ev) => {
    if (!drag) return;
    const live = T[drag.table];
    for (const k of Object.keys(drag.base)) Object.assign(live[k], drag.base[k]);
    const dc = Math.round((ev.clientX - drag.x) / drag.cell.w), dr = Math.round((ev.clientY - drag.y) / drag.cell.h);
    const b = binding(drag.name, T, sheetTable(), liveBox(found(drag.name)));
    if (!b) return;
    if (!drag.handle) b.move(dc, dr);
    else if (b.edges[drag.handle]) b.edges[drag.handle](drag.handle === 'left' || drag.handle === 'right' ? dc : dr);
    rerender(); refresh();
  };
  const onUp = () => { if (drag) { drag = null; rebuild(); } };
  const onClick = (ev) => {
    // the press was ours, so the click it would have produced must not reach the control under it
    if (!root.contains(ev.target) && ev.target.closest && ev.target.closest('[data-mod]')) { ev.preventDefault(); ev.stopPropagation(); }
  };

  // The page already binds the arrows to moving between views and Escape to going back, so a nudge
  // would navigate away instead. While a module is selected the panel takes those keys first, in the
  // capture phase, and stops them there; with nothing selected they mean what they always meant.
  const NUDGE = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  const FAR = { ArrowLeft: 'right', ArrowRight: 'right', ArrowUp: 'bottom', ArrowDown: 'bottom' };
  const NEAR = { ArrowLeft: 'left', ArrowRight: 'left', ArrowUp: 'top', ArrowDown: 'top' };
  const onKey = (ev) => {
    if (ev.metaKey || ev.ctrlKey) return;
    // s has to work wherever focus happens to be, or folding the panel with its own button leaves
    // focus on that button and the key that opens it again is dead. Only a text field keeps its s.
    const t = ev.target, typing = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
    if (ev.key === 's' && !typing && !ev.altKey) { ev.stopPropagation(); collapsed = !collapsed; refresh(); return; }
    if (!selected || typing) return;
    if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); selected = null; refresh(); return; }
    if (!NUDGE[ev.key]) return;
    const b = bindOf(selected); if (!b) return;
    ev.preventDefault(); ev.stopPropagation();
    const [dx, dy] = NUDGE[ev.key], d = dx || dy;
    if (ev.shiftKey) { const w = b.edges[FAR[ev.key]]; if (w) w(d); } else if (ev.altKey) { const w = b.edges[NEAR[ev.key]]; if (w) w(d); } else b.move(dx, dy);
    rerender(); rebuild();
  };

  // ---------------------------------------------------------------- buttons
  const button = (text, fn, title, size2) => { const b = el('button', `all:unset; cursor:pointer; padding:4px 10px; border:1px solid rgba(243,242,242,0.25); border-radius:3px; color:${INK};${size2 ? ' font-size:10px;' : ''}`, text); b.onclick = fn; b.title = title; return b; };

  // Pinning takes cells away from the draw, so pinning one plate reshuffles every plate still drawn,
  // and composing against ground that moves is no composing at all. The panel therefore claims them
  // all the moment it sees them, and this button is that same claim asked for by hand, which is what
  // is wanted after an unpin or two. Giving them all back to the draw is the way out.
  const typeBox = el('label', `display:flex; align-items:center; gap:6px; margin:8px 14px 0; color:${DIM}; font-size:10px; cursor:pointer;`);
  const typeOn = el('input', `accent-color:${GOLD}; margin:0;`);
  typeOn.type = 'checkbox';
  typeOn.onchange = () => { typewriter = typeOn.checked; refresh(); };
  typeOn.onpointerdown = (ev) => ev.stopPropagation();
  typeBox.append(typeOn, el('span', '', 'let the plates type on hover'));

  const pins = el('div', `display:flex; gap:6px; margin:8px 14px 0;`);
  pins.append(
    button('pin all', () => { claimDrawn(); rerender(); rebuild(); },
      'claim every plate where the draw has left it, so nothing moves while you compose', true),
    button('unpin all', () => {
      for (const k of Object.keys(T.LANDING_PINS)) delete T.LANDING_PINS[k];
      rerender(); rebuild();
    }, 'give every plate back to the seeded draw', true),
  );

  // The other half of copy. A tuning session lives in one tab's memory, and a reload used to end it;
  // reading a block back in means the work can be parked and picked up, here or on another machine.
  const read = (text) => {
    const grab = (name) => {
      const a = text.indexOf(name + ' = {'), z = text.indexOf('\n  };', a);
      if (a < 0 || z < 0) throw new Error('no ' + name + ' block in that text');
      // eslint-disable-next-line no-new-func
      return new Function('return {' + text.slice(a + name.length + 4, z) + '}')();
    };
    const from = {};
    for (const name of NAMES) from[name] = grab(name);
    for (const name of FIXED) {
      for (const k of Object.keys(T[name])) if (!from[name][k]) throw new Error(name + ' in that text has no ' + k);
    }
    for (const name of FIXED) {
      for (const k of Object.keys(T[name])) { T[name][k].col = from[name][k].col; T[name][k].row = from[name][k].row; }
    }
    // pinning is exactly a change of which entries this table holds, so it is replaced rather than
    // matched key for key
    for (const k of Object.keys(T.LANDING_PINS)) delete T.LANDING_PINS[k];
    for (const [k, v] of Object.entries(from.LANDING_PINS)) T.LANDING_PINS[k] = { col: v.col, row: v.row };
    rerender(); rebuild();
  };

  const bar = el('div', `display:flex; gap:6px; margin:10px 14px 0; padding-top:10px; border-top:1px solid ${RULE};`);
  bar.append(
    // The block goes to the clipboard and the panel says how much of it went. Printing it here as
    // well filled the panel with the one thing nobody needs to read at the moment they have just
    // taken a copy of it, and __grid.dump() is still where to read it. A write that fails says so:
    // swallowing it left a copy that never happened looking exactly like one that did.
    button('copy', () => {
      const text = serialize(T);
      const failed = (e) => { out.textContent = 'copy failed: ' + ((e && e.message) || e); };
      try { navigator.clipboard.writeText(text).then(() => { out.textContent = 'copied ' + text.length + ' characters'; }, failed); } catch (e) { failed(e); }
    }, 'copy all four tables to the clipboard, ready to paste into design/Portfolio.dc.html'),
    button('paste', async () => {
      try { const text = (await navigator.clipboard.readText()) || ''; read(text); out.textContent = 'read ' + text.length + ' characters back in'; } catch (e) { out.textContent = 'paste failed: ' + e.message; }
    }, 'read a copied block back from the clipboard'),
    button('reset', () => {
      for (const name of FIXED) for (const k of Object.keys(T[name])) Object.assign(T[name][k], initial[name][k]);
      for (const k of Object.keys(T.LANDING_PINS)) delete T.LANDING_PINS[k];
      for (const [k, v] of Object.entries(initial.LANDING_PINS)) T.LANDING_PINS[k] = { ...v };
      out.textContent = ''; rerender(); rebuild();
    }, 'back to the values this panel was mounted with'),
    button('collapse', (ev) => { ev.currentTarget.blur(); collapsed = true; refresh(); }, 'collapse to the handle; click it or press s to open'),
  );
  body.append(typeBox, pins, bar, out);
  // the page carries two of these now, so each says which it is: the panels park on opposite sides of
  // the window and their controls read alike, and nothing else tells them apart
  root.dataset.devPanel = 'grid';
  document.body.appendChild(root);

  window.addEventListener('pointerdown', onDown, true);
  window.addEventListener('pointermove', onMove, true);
  window.addEventListener('pointerup', onUp, true);
  window.addEventListener('click', onClick, true);
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('resize', refresh);
  // The drawing re-renders under the panel, and leaving it removes the grid, so the rows are rebuilt
  // when the modules change. What is watched is the page, not the document: a tuning panel is
  // furniture standing beside the page, and two panels each watching the whole document answer each
  // other's redraws in a microtask loop that never lets the main thread go. Both park outside the
  // React root for that reason, and both watch only what they tune.
  const observer = new MutationObserver((records) => { if (!drag && !ours(records)) rebuild(); });
  observer.observe(document.getElementById('dc-root') || document.body, { childList: true, subtree: true });
  rebuild();

  // An escape hatch for the console, so a folded panel or a stuck session is never a dead end:
  // __grid.show(), __grid.dump() for the block as text, __grid.problems() for what would go wrong,
  // __grid.tables for the live objects.
  window.__grid = {
    show: () => { collapsed = false; refresh(); return 'panel back'; },
    collapse: () => { collapsed = true; refresh(); },
    dump: () => serialize(T),
    problems: () => (surface() === 'landing' ? landingProblems(T, cornerBox()) : surface() === 'sheet' ? sheetProblems(T[sheetTable()]) : []),
    read,
    tables: T,
  };

  return {
    destroy() {
      if (window.__grid && window.__grid.tables === T) delete window.__grid;
      // the page keeps its typewriter, so the panel gives it back rather than leaving it held
      if (quiet && told) quiet(false);
      observer.disconnect();
      cancelAnimationFrame(raf);
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerup', onUp, true);
      window.removeEventListener('click', onClick, true);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', refresh);
      mark.remove();
      root.remove();
    },
  };
}
