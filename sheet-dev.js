// Tuning panel for the Development sheet's drawing grid. One row per module on the sheet, showing the
// placement entry that put it there and the only two things that entry says: where the module starts,
// and how many columns and rows it takes. Click a module to select it, drag it to move it, drag one of
// its handles to resize it, nudge it with the arrows, or type the four grid lines in. Every move snaps
// to a cell, because on this sheet the cell is the drawing. Loaded only when the URL carries ?dev, so
// it ships nothing to the page otherwise.
//
// Copy writes both placement tables as SHEET_WIDE and SHEET_NARROW blocks ready to paste back into
// design/Portfolio.dc.html, and paste reads such a block back, so a session survives a reload rather
// than living only in this tab. Reset returns to the values it was mounted with. The s key hides and
// shows the panel, Escape drops the selection.
//
// The panel tunes whichever of the two tables the window width is rendering, and says which one that
// is. Two spans on the page are not read from a table at all: a portrait hero takes its columns and
// its row count from the picture, and an entry naming one detail instead of the pair takes the pair's
// columns with its own row count. Those edges are refused rather than written, or the panel would
// record a number the page ignores and the sheet would move when the picture changed.
//
// The panel also reports what tools/check-sheet-grid.mjs would reject: a module off the 22 column
// grid, an empty span, two modules over the same cells. Tuning into a composition the check refuses
// is easy to do and expensive to discover after the paste.
//
// mount(api) -> { destroy() }, where api is { wide, narrow, liveName, rerender }: the two live tables
// off the logic class, mutated in place, a getter for which of them the width is rendering, and the
// component's re-render. serialize() is pure and exported on its own so the paste-back path can be
// checked without a DOM.

const INK = '#f3f2f2', DIM = '#a8a4a0', GOLD = '#b68235', WARN = '#e07a5f', RULE = 'rgba(243,242,242,0.12)';
const el = (tag, css, text) => { const e = document.createElement(tag); if (css) e.style.cssText = css; if (text != null) e.textContent = text; return e; };

const COLS = 22;              // grid lines run 1..COLS+1, the same count check-sheet-grid holds
const ROW = 44;               // the fallback row height, read off the grid when there is one
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const span = (s) => { const m = /^\s*(\d+)\s*\/\s*(\d+)\s*$/.exec(String(s)); return m ? [parseInt(m[1], 10), parseInt(m[2], 10)] : null; };

// ---------------------------------------------------------------- the paste-back block

// A placement table is written back in the source's own shape: one module to a line, the keys and the
// column spans padded so the row spans stand in a column of their own. The padding is measured off the
// entries rather than fixed, so a longer module name or a wider span keeps the block aligned. What
// comes out has to be readable by tools/check-sheet-grid.mjs, which parses these tables line by line.
const block = (name, t) => {
  const keys = Object.keys(t);
  const kw = keys.reduce((n, k) => Math.max(n, k.length + 1), 0) + 1;
  const cw = keys.reduce((n, k) => Math.max(n, ("'" + t[k].col + "',").length), 0) + 1;
  const line = (k) => '    ' + (k + ':').padEnd(kw) + '{ col: ' + ("'" + t[k].col + "',").padEnd(cw) + 'row: ' + "'" + t[k].row + "' },";
  return name + ' = {\n' + keys.map(line).join('\n') + '\n  };';
};

export function serialize(wide, narrow) {
  return '  ' + block('SHEET_WIDE', wide) + '\n  ' + block('SHEET_NARROW', narrow);
}

// ---------------------------------------------------------------- reading and writing one entry

const readBox = (e) => ({ c: span(e.col), r: span(e.row) });
const writeBox = (e, b) => { e.col = b.c[0] + ' / ' + b.c[1]; e.row = b.r[0] + ' / ' + b.r[1]; };

// A move carries the whole rectangle, so it keeps its size and its proportion: only where it sits
// changes. The grid has a right edge and a first row, and a module pushed against either stops there
// rather than growing or wrapping.
const shift = (e, dc, dr) => {
  const b = readBox(e), w = b.c[1] - b.c[0], h = b.r[1] - b.r[0];
  const c0 = clamp(b.c[0] + dc, 1, COLS + 1 - w), r0 = Math.max(1, b.r[0] + dr);
  writeBox(e, { c: [c0, c0 + w], r: [r0, r0 + h] });
};

// A resize moves one grid line and leaves the other three where they are, which is what changes the
// module's size and its proportion at once. A span never closes to nothing: the line being dragged
// stops one cell short of its opposite.
const edge = (e, axis, end, d) => {
  const b = readBox(e), v = b[axis].slice();
  v[end] += d;
  if (axis === 'c') { v[0] = clamp(v[0], 1, COLS); v[1] = clamp(v[1], 2, COLS + 1); } else { v[0] = Math.max(1, v[0]); v[1] = Math.max(2, v[1]); }
  if (v[0] >= v[1]) { if (end === 0) v[0] = v[1] - 1; else v[1] = v[0] + 1; }
  b[axis] = v; writeBox(e, b);
};

// ---------------------------------------------------------------- what a module on the page writes
//
// A module normally writes its own entry and all four of its edges are free. Two modules do not.
// `detail` is the single plate an entry may carry instead of the detailA/detailB pair; it has no entry
// of its own, standing for both, so it writes the pair's outer lines and its bottom is the picture's.
// A portrait hero keeps only its top line: renderVals gives it PORTRAIT_COLS of the twenty-two and as
// many rows as the picture needs, so its other three lines are answered before the table is read.
const binding = (name, t, live) => {
  const box = (k) => t[k] && readBox(t[k]);
  if (name === 'detail') {
    const a = box('detailA'), b = box('detailB');
    if (!a || !b) return null;
    return {
      targets: ['detailA', 'detailB'],
      view: { c: [Math.min(a.c[0], b.c[0]), Math.max(a.c[1], b.c[1])], r: [Math.min(a.r[0], b.r[0]), Math.max(a.r[1], b.r[1])] },
      note: 'stands in for detailA and detailB; its depth is the picture\'s',
      move: (dc, dr) => { shift(t.detailA, dc, dr); shift(t.detailB, dc, dr); },
      edges: {
        left: (d) => edge(t.detailA, 'c', 0, d),
        right: (d) => edge(t.detailB, 'c', 1, d),
        top: (d) => { edge(t.detailA, 'r', 0, d); edge(t.detailB, 'r', 0, d); },
        bottom: null,
      },
    };
  }
  const own = box(name);
  if (!own) return null;
  // the hero is portrait when the page has given it columns the table did not: that is the one thing
  // about it readable from here without repeating rowsFor and the picture's dimensions
  const portrait = name === 'hero' && live && (live.c[0] !== own.c[0] || live.c[1] !== own.c[1]);
  return {
    targets: [name],
    view: own,
    note: portrait ? 'portrait hero; its columns and its depth are the picture\'s' : '',
    move: portrait ? (dc, dr) => shift(t[name], 0, dr) : (dc, dr) => shift(t[name], dc, dr),
    edges: {
      left: portrait ? null : (d) => edge(t[name], 'c', 0, d),
      right: portrait ? null : (d) => edge(t[name], 'c', 1, d),
      top: (d) => edge(t[name], 'r', 0, d),
      bottom: portrait ? null : (d) => edge(t[name], 'r', 1, d),
    },
  };
};

// ---------------------------------------------------------------- what the check would reject

const problems = (t) => {
  const out = [], boxes = [];
  for (const k of Object.keys(t)) {
    const c = span(t[k].col), r = span(t[k].row);
    if (!c || !r) { out.push(k + ' has a span nothing can read'); continue; }
    if (c[0] < 1 || c[1] > COLS + 1) out.push(k + ' runs off the ' + COLS + ' column grid: ' + t[k].col);
    if (c[0] >= c[1]) out.push(k + ' has an empty column span: ' + t[k].col);
    if (r[0] < 1) out.push(k + ' starts above row 1: ' + t[k].row);
    if (r[0] >= r[1]) out.push(k + ' has an empty row span: ' + t[k].row);
    boxes.push([k, c, r]);
  }
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const [a, ac, ar] = boxes[i], [b, bc, br] = boxes[j];
      if (ac[0] < bc[1] && bc[0] < ac[1] && ar[0] < br[1] && br[0] < ar[1]) out.push(a + ' and ' + b + ' lie over the same cells');
    }
  }
  return out;
};

// ---------------------------------------------------------------- the panel

export function mount(api) {
  const { wide, narrow, liveName, rerender } = api;
  const tables = { SHEET_WIDE: wide, SHEET_NARROW: narrow };
  const initial = JSON.parse(JSON.stringify(tables));
  const live = () => tables[liveName()] || wide;

  let selected = null, rows = [], drag = null, raf = 0;

  const root = el('div', `position:fixed; left:16px; bottom:16px; z-index:1000; width:360px; max-height:calc(100vh - 32px); overflow:auto; box-sizing:border-box; padding:4px 0 10px; background:rgba(28,27,26,0.94); color:${INK}; font:11px/1.5 'Geist Mono', ui-monospace, monospace; border-radius:6px; box-shadow:0 12px 40px rgba(0,0,0,0.35); user-select:none; pointer-events:auto;`);
  // The panel opens over the sheet's left column, which is half of what it is for tuning, so its
  // header is a handle: drag it anywhere and it parks there for the rest of the session.
  const head = el('div', `margin:10px 14px 4px; padding-bottom:4px; border-bottom:1px solid ${RULE}; color:${GOLD}; font-size:10px; letter-spacing:0.14em; text-transform:uppercase; cursor:move;`, 'development sheet  ⠿');
  head.onpointerdown = (ev) => {
    ev.preventDefault(); ev.stopPropagation();
    const b = root.getBoundingClientRect(), ox = ev.clientX - b.left, oy = ev.clientY - b.top;
    const move = (e) => {
      root.style.right = 'auto'; root.style.bottom = 'auto';
      root.style.left = Math.max(0, Math.min(window.innerWidth - b.width, e.clientX - ox)) + 'px';
      root.style.top = Math.max(0, Math.min(window.innerHeight - 40, e.clientY - oy)) + 'px';
    };
    const up = () => { window.removeEventListener('pointermove', move, true); window.removeEventListener('pointerup', up, true); };
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', up, true);
  };
  const which = el('div', `margin:0 14px 4px; color:${GOLD}; font-size:10px;`);
  const hint = el('div', `margin:0 14px 6px; color:${DIM}; font-size:10px;`, 'click a module, drag to move it, drag a handle to resize it, arrows to nudge, shift-arrows to grow or shrink, alt-arrows to move the near edge; s hides the panel');
  const list = el('div', '');
  const sel = el('div', `margin:6px 14px 0; padding-top:6px; border-top:1px solid ${RULE};`);
  const bad = el('div', `margin:6px 14px 0; color:${WARN}; font-size:10px; white-space:pre-line;`);
  const out = el('pre', `margin:8px 14px 0; white-space:pre; color:${DIM}; font-size:10px; max-height:180px; overflow:auto; user-select:text;`);
  root.append(head, which, hint, list, sel, bad);

  // ---------------------------------------------------------------- the modules on the page
  // Read fresh every time: the sheet re-renders on hover and on any change made here, and the tables
  // are read again on every render, so a held element or a held entry goes stale within one drag.
  const modules = () => [...document.querySelectorAll('[data-mod]')];
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
  // the span the page actually gave a module, which is not the table's wherever renderVals derived it
  const liveBox = (node) => {
    const s = node && node.style;
    const c = s && span(s.gridColumn), r = s && span(s.gridRow);
    return c && r ? { c, r } : null;
  };
  const bindOf = (name) => binding(name, live(), liveBox(found(name)));

  // ---------------------------------------------------------------- the selection mark
  // A box over the selected module carrying the eight handles that resize it. It lives in the grid,
  // which is positioned, so it needs no scroll handling: it travels with the drawing. Nothing but the
  // handles takes the pointer, so a plate under the mark still answers the cursor with its readout.
  const mark = el('div', `position:absolute; pointer-events:none; outline:1px solid ${GOLD}; outline-offset:-1px; background:rgba(182,130,53,0.10); display:none;`);
  const HANDLES = [
    ['left', '0', '50%', 'ew-resize', 'translate(-50%,-50%)'],
    ['right', '100%', '50%', 'ew-resize', 'translate(-50%,-50%)'],
    ['top', '50%', '0', 'ns-resize', 'translate(-50%,-50%)'],
    ['bottom', '50%', '100%', 'ns-resize', 'translate(-50%,-50%)'],
  ];
  for (const [name, x, y, cur, tf] of HANDLES) {
    const h = el('div', `position:absolute; left:${x}; top:${y}; transform:${tf}; width:13px; height:13px; box-sizing:border-box; border:1px solid ${GOLD}; background:#1c1b1a; border-radius:2px; pointer-events:auto; cursor:${cur};`);
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
    rows = modules().map((node) => {
      const name = node.dataset.mod;
      const row = el('div', 'padding:5px 14px 6px; cursor:pointer; border-left:2px solid transparent;');
      const top = el('div', 'display:flex; justify-content:space-between; align-items:baseline; gap:8px;');
      const label = el('span', `color:${INK};`, name);
      const size = el('span', `color:${DIM}; font-size:10px; white-space:nowrap;`);
      top.append(label, size);
      const vals = el('div', `color:${DIM}; font-size:10px;`);
      const show = () => {
        const b = bindOf(name);
        if (b) {
          vals.textContent = 'col ' + b.view.c.join(' / ') + '   row ' + b.view.r.join(' / ');
          size.textContent = (b.view.c[1] - b.view.c[0]) + ' × ' + (b.view.r[1] - b.view.r[0]);
        } else {
          vals.textContent = 'no entry in ' + liveName() + ', so nothing here places it';
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
    if (!rows.length) list.appendChild(el('div', `padding:6px 14px; color:${DIM};`, 'no sheet on this view'));
  };

  // ---------------------------------------------------------------- the four grid lines, typed
  // A drag settles a composition and a typed line confirms it. The inputs write through the same
  // edge writers the handles use, so a line the page derives is disabled here too rather than
  // accepting a number and dropping it.
  // The strip is rebuilt only when the selection changes, never on a value: a drag refreshes on every
  // pointer move, and a strip rebuilt under a typed line would take the field away mid-number.
  const fields = {};
  let built = false;
  const buildSel = () => {
    if (built === selected) return;
    built = selected;
    for (const k of Object.keys(fields)) delete fields[k];
    sel.textContent = '';
    const b = selected && bindOf(selected);
    if (!b) { sel.appendChild(el('div', `color:${DIM}; font-size:10px;`, 'nothing selected')); return; }
    sel.appendChild(el('div', `color:${GOLD}; font-size:10px; margin-bottom:4px;`, selected + (b.targets.length > 1 || b.targets[0] !== selected ? '  →  ' + b.targets.join(', ') : '')));
    if (b.note) sel.appendChild(el('div', `color:${DIM}; font-size:10px; margin-bottom:4px;`, b.note));
    const grid4 = el('div', 'display:grid; grid-template-columns:repeat(4,1fr); gap:4px;');
    const LINES = [['col start', 'left'], ['col end', 'right'], ['row start', 'top'], ['row end', 'bottom']];
    for (const [label, which2] of LINES) {
      const wrap = el('div', '');
      wrap.appendChild(el('div', `color:${DIM}; font-size:9px;`, label));
      const inp = el('input', `width:100%; box-sizing:border-box; background:#1c1b1a; color:${INK}; border:1px solid ${RULE}; border-radius:2px; padding:2px 4px; font:11px 'Geist Mono', ui-monospace, monospace;`);
      inp.type = 'number';
      inp.disabled = !b.edges[which2];
      if (inp.disabled) inp.style.color = DIM;
      inp.onpointerdown = (ev) => ev.stopPropagation();
      inp.onchange = () => {
        const cur = bindOf(selected); if (!cur || !cur.edges[which2]) return;
        const at = which2 === 'left' ? cur.view.c[0] : which2 === 'right' ? cur.view.c[1] : which2 === 'top' ? cur.view.r[0] : cur.view.r[1];
        const d = Math.round(Number(inp.value)) - at;
        if (d) { cur.edges[which2](d); apply(); }
        refresh();
      };
      fields[which2] = inp;
      wrap.appendChild(inp);
      grid4.appendChild(wrap);
    }
    sel.appendChild(grid4);
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

  const refresh = () => {
    which.textContent = 'tuning ' + liveName() + '  ·  ' + COLS + ' columns  ·  ' + ROW + 'px rows';
    rows.forEach((r) => r.show());
    buildSel(); showSel();
    const p = problems(live());
    bad.textContent = p.length ? p.join('\n') : '';
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(placeMark);
  };
  const rebuild = () => { build(); refresh(); };
  const apply = () => { rerender(); };
  // The panel's own mark sits inside the drawing it watches, and moving it is a mutation of that
  // drawing. Records that come only from the mark are the panel's echo and are dropped, or the
  // observer would call rebuild in a loop and the page would never come back.
  const ours = (records) => records.every((r) => mark.contains(r.target) || r.target === mark);

  // ---------------------------------------------------------------- move and resize
  const start = (name, handle, ev) => {
    const b = bindOf(name); if (!b) return;
    const c = cell(); if (!c) return;
    const base = {};
    for (const k of b.targets) base[k] = { ...live()[k] };
    drag = { name, handle, x: ev.clientX, y: ev.clientY, base, cell: c };
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
    const t = live();
    for (const k of Object.keys(drag.base)) Object.assign(t[k], drag.base[k]);
    const dc = Math.round((ev.clientX - drag.x) / drag.cell.w), dr = Math.round((ev.clientY - drag.y) / drag.cell.h);
    const b = binding(drag.name, t, liveBox(found(drag.name)));
    if (!b) return;
    if (!drag.handle) b.move(dc, dr);
    else if (b.edges[drag.handle]) b.edges[drag.handle](drag.handle === 'left' || drag.handle === 'right' ? dc : dr);
    apply(); refresh();
  };
  const onUp = () => { drag = null; };
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
    // s has to work wherever focus happens to be, or hiding the panel with its own button leaves
    // focus on that button and the key that brings it back is dead. Only a text field keeps its s.
    const el2 = ev.target, typing = el2 && (el2.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el2.tagName));
    if (ev.key === 's' && !typing && !ev.altKey) { ev.stopPropagation(); root.hidden = !root.hidden; return; }
    if (!selected || typing) return;
    if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); selected = null; refresh(); return; }
    if (!NUDGE[ev.key]) return;
    const b = bindOf(selected); if (!b) return;
    ev.preventDefault(); ev.stopPropagation();
    const [dx, dy] = NUDGE[ev.key], d = dx || dy;
    if (ev.shiftKey) { const w = b.edges[FAR[ev.key]]; if (w) w(d); } else if (ev.altKey) { const w = b.edges[NEAR[ev.key]]; if (w) w(d); } else b.move(dx, dy);
    apply(); refresh();
  };

  // ---------------------------------------------------------------- buttons
  const bar = el('div', `display:flex; gap:6px; margin:10px 14px 0; padding-top:10px; border-top:1px solid ${RULE};`);
  const button = (text, fn, title) => { const b = el('button', `all:unset; cursor:pointer; padding:4px 10px; border:1px solid rgba(243,242,242,0.25); border-radius:3px; color:${INK};`, text); b.onclick = fn; b.title = title; return b; };
  // The other half of copy. A tuning session lives in one tab's memory, and a reload used to end it;
  // reading a block back in means the work can be parked and picked up, here or on another machine.
  const read = (text) => {
    const grab = (name) => {
      const a = text.indexOf(name + ' = {'), z = text.indexOf('\n  };', a);
      if (a < 0 || z < 0) throw new Error('no ' + name + ' block in that text');
      // eslint-disable-next-line no-new-func
      return new Function('return {' + text.slice(a + name.length + 4, z) + '}')();
    };
    for (const name of ['SHEET_WIDE', 'SHEET_NARROW']) {
      const from = grab(name), t = tables[name], keys = Object.keys(t);
      for (const k of keys) if (!from[k]) throw new Error(name + ' in that text has no ' + k);
      for (const k of keys) t[k].col = from[k].col, t[k].row = from[k].row;
    }
    apply(); refresh();
  };

  bar.append(
    button('copy', () => { const text = serialize(wide, narrow); out.textContent = text; navigator.clipboard?.writeText(text).catch(() => {}); }, 'copy both tables ready to paste into design/Portfolio.dc.html'),
    button('paste', async () => {
      try { const text = (await navigator.clipboard.readText()) || ''; read(text); out.textContent = 'read ' + text.length + ' characters back in'; } catch (e) { out.textContent = 'paste failed: ' + e.message; }
    }, 'read a copied block back from the clipboard'),
    button('reset', () => {
      for (const name of ['SHEET_WIDE', 'SHEET_NARROW']) for (const k of Object.keys(tables[name])) Object.assign(tables[name][k], initial[name][k]);
      out.textContent = ''; apply(); refresh();
    }, 'back to the values this panel was mounted with'),
    button('hide', (ev) => { ev.currentTarget.blur(); root.hidden = true; }, 'hide; press s to show again'),
  );
  root.append(bar, out);
  // the page carries two of these now, so each says which it is: the panels park on opposite sides of
  // the window and their controls read alike, and nothing else tells them apart
  root.dataset.devPanel = 'sheet';
  document.body.appendChild(root);

  window.addEventListener('pointerdown', onDown, true);
  window.addEventListener('pointermove', onMove, true);
  window.addEventListener('pointerup', onUp, true);
  window.addEventListener('click', onClick, true);
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('resize', refresh);
  // The sheet re-renders under the panel, and leaving it removes the grid, so the rows are rebuilt
  // when the modules change. What is watched is the page, not the document: a tuning panel is
  // furniture standing beside the page, and two panels each watching the whole document answer each
  // other's redraws in a microtask loop that never lets the main thread go. Both park outside the
  // React root for that reason, and both watch only what they tune.
  const observer = new MutationObserver((records) => { if (!drag && !ours(records)) rebuild(); });
  observer.observe(document.getElementById('dc-root') || document.body, { childList: true, subtree: true });
  rebuild();

  // An escape hatch for the console, so a hidden panel or a stuck session is never a dead end:
  // __sheet.show(), __sheet.dump() for the block as text, __sheet.problems() for what the check would
  // reject, __sheet.tables for the live objects.
  window.__sheet = {
    show: () => { root.hidden = false; return 'panel back'; },
    hide: () => { root.hidden = true; },
    dump: () => serialize(wide, narrow),
    problems: () => problems(live()),
    read,
    tables,
  };

  return {
    destroy() {
      if (window.__sheet && window.__sheet.tables === tables) delete window.__sheet;
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
