// Tuning panel for the Research leaf collage. One row per leaf on the page, showing the style entry
// that placed it and the two things that entry leaves free: its offset and its size. Click a leaf to
// select it, drag it to move it, scale it with the slider, the bracket keys or the wheel, nudge it
// with the arrows. Loaded only when the URL carries ?dev, so it ships nothing to the page otherwise.
// Copy writes both tables as LEAF_SPREADS and LEAF_PAIRS blocks ready to paste back into
// design/Portfolio.dc.html, and paste reads such a block back in, so a session survives a reload
// rather than living only in this tab. Reset returns to the values it was mounted with. The d key
// hides and shows the panel, Escape drops the selection.
//
// The grid cell a leaf sits in is derived from the register by leafSlots and is not tuned here. It
// does not need to be: an offset of any magnitude moves a leaf anywhere on the page, which is how
// the two anchor plates already cross the page edge.
//
// mount(api) -> { destroy() }, where api is { spreads, pairs, rerender }: the two live tables off the
// logic class, mutated in place, and the component's re-render. serialize() is pure and exported on
// its own so the paste-back path can be checked without a DOM.

const INK = '#f3f2f2', DIM = '#a8a4a0', GOLD = '#b68235', RULE = 'rgba(243,242,242,0.12)';
const el = (tag, css, text) => { const e = document.createElement(tag); if (css) e.style.cssText = css; if (text != null) e.textContent = text; return e; };

// ---------------------------------------------------------------- the paste-back block

// A style entry is written back in its own key order, so the block that comes out of the panel is the
// block that went into the source with different numbers in it. Strings keep their quotes, numbers do
// not get any: pasting the result back and reading it again has to yield the same table.
const literal = (v) => (typeof v === 'string' ? "'" + v.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'" : String(v));
const entry = (e) => '      { ' + Object.keys(e).map((k) => k + ': ' + literal(e[k])).join(', ') + ' },';
const table = (name, t) => name + ' = {\n' +
  ['left', 'right'].map((side) => '    ' + side + ': [\n' + t[side].map(entry).join('\n') + '\n    ],').join('\n') +
  '\n  };';

export function serialize(spreads, pairs) {
  return '  ' + table('LEAF_SPREADS', spreads) + '\n  ' + table('LEAF_PAIRS', pairs);
}

// ---------------------------------------------------------------- reading and writing one entry

const px = (s) => parseFloat(s) || 0;
const round = (n) => Math.round(n * 1000) / 1000;

// A leaf can be moved two ways and they are not the same move. `offsetX`/`offsetY` sit on the wrapper
// and carry the whole leaf, plate and caption together; that is what a drag writes. `bleedX`/`bleedY`
// sit on the plate alone, which is how an anchor crosses the page edge while its title stays put.
const bind = (key, spreads, pairs) => {
  const [which, side, i] = key.split('.');
  const t = which === 'spreads' ? spreads : pairs;
  return t[side] && t[side][Number(i)];
};

// The size of a plate is three numbers that have to move together: h and w are the vh and px halves of
// one min(), and maxW caps the width a declared plate takes. stackH and stackW are the same pair for
// the shorter height a stacked title uses. Scaling one and not the others changes the shape, not the size.
const SIZE_KEYS = ['h', 'w', 'stackH', 'stackW'];
const scaleEntry = (e, base, factor) => {
  for (const k of SIZE_KEYS) if (base[k] != null) e[k] = round(base[k] * factor);
  if (base.maxW != null) e.maxW = round(px(base.maxW) * factor) + 'px';
};
const scaleOf = (e, base) => (base.h ? round(e.h / base.h) : 1);

export function mount(api) {
  const { spreads, pairs, rerender } = api;
  const clone = (t) => ({ left: t.left.map((e) => ({ ...e })), right: t.right.map((e) => ({ ...e })) });
  const initial = { spreads: clone(spreads), pairs: clone(pairs) };
  const baseOf = (key) => bind(key, initial.spreads, initial.pairs);
  const liveOf = (key) => bind(key, spreads, pairs);

  let selected = null, rows = [], drag = null;

  // ---------------------------------------------------------------- panel
  const root = el('div', `position:fixed; right:16px; bottom:16px; z-index:1000; width:340px; max-height:calc(100vh - 32px); overflow:auto; box-sizing:border-box; padding:4px 0 10px; background:rgba(28,27,26,0.94); color:${INK}; font:11px/1.5 'Geist Mono', ui-monospace, monospace; border-radius:6px; box-shadow:0 12px 40px rgba(0,0,0,0.35); user-select:none; pointer-events:auto;`);
  // The panel opens over the right gutter, which is half of what it is for tuning, so its header is a
  // handle: drag it anywhere, and it parks there for the rest of the session.
  const head = el('div', `margin:10px 14px 4px; padding-bottom:4px; border-bottom:1px solid ${RULE}; color:${GOLD}; font-size:10px; letter-spacing:0.14em; text-transform:uppercase; cursor:move;`, 'research margins  ⠿');
  head.onpointerdown = (ev) => {
    ev.preventDefault(); ev.stopPropagation();
    const box = root.getBoundingClientRect(), ox = ev.clientX - box.left, oy = ev.clientY - box.top;
    const move = (e) => {
      root.style.right = 'auto'; root.style.bottom = 'auto';
      root.style.left = Math.max(0, Math.min(window.innerWidth - box.width, e.clientX - ox)) + 'px';
      root.style.top = Math.max(0, Math.min(window.innerHeight - 40, e.clientY - oy)) + 'px';
    };
    const up = () => { window.removeEventListener('pointermove', move, true); window.removeEventListener('pointerup', up, true); };
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', up, true);
  };
  const hint = el('div', `margin:0 14px 6px; color:${DIM}; font-size:10px;`, 'click a leaf, drag to move the card, alt-drag to bleed the plate alone, [ ] or wheel to scale, arrows to nudge; drag this header to park the panel');
  const list = el('div', '');
  const out = el('pre', `margin:8px 14px 0; white-space:pre; color:${DIM}; font-size:10px; max-height:180px; overflow:auto; user-select:text;`);
  root.append(head, hint, list);

  // ---------------------------------------------------------------- the leaves on the page
  // Read fresh every time: the collage re-renders on hover and on any change made here, and a leaf's
  // element is replaced rather than mutated, so a held reference goes stale within one interaction.
  const leaves = () => [...document.querySelectorAll('[data-leaf][data-slot]')].map((wrap) => ({
    wrap, plate: wrap.querySelector('button'),
    key: wrap.dataset.slot,
    title: (wrap.querySelector('p[data-morph]') || {}).textContent || '?',
  }));

  const sharing = (key) => leaves().filter((l) => l.key === key).length;

  const build = () => {
    list.textContent = '';
    rows = leaves().map((leaf) => {
      const e = liveOf(leaf.key), base = baseOf(leaf.key);
      const row = el('div', `padding:6px 14px 7px; cursor:pointer; border-left:2px solid transparent;`);
      const top = el('div', 'display:flex; justify-content:space-between; align-items:baseline; gap:8px;');
      const name = el('span', `color:${INK}; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;`, leaf.title);
      const slot = el('span', `color:${DIM}; font-size:10px; white-space:nowrap;`, leaf.key);
      top.append(name, slot);
      const shared = sharing(leaf.key) > 1
        ? el('div', `color:${GOLD}; font-size:10px;`, 'shared by ' + sharing(leaf.key) + ' leaves; they move together')
        : null;
      const vals = el('div', `color:${DIM}; font-size:10px;`);
      const range = el('input', `display:block; width:100%; margin:4px 0 0; accent-color:${GOLD};`);
      range.type = 'range'; range.min = '0.3'; range.max = '2.5'; range.step = '0.01';
      const show = () => {
        const cur = liveOf(leaf.key);
        vals.textContent = 'offset ' + cur.offsetX + ' ' + cur.offsetY
          + '   bleed ' + cur.bleedX + ' ' + cur.bleedY + '   scale ' + scaleOf(cur, base).toFixed(2);
        range.value = String(scaleOf(cur, base));
        row.style.borderLeftColor = selected && selected.key === leaf.key ? GOLD : 'transparent';
        row.style.background = selected && selected.key === leaf.key ? 'rgba(182,130,53,0.10)' : 'transparent';
      };
      range.oninput = () => { scaleEntry(e, base, Number(range.value)); rerender(); refresh(); };
      range.onpointerdown = (ev) => ev.stopPropagation();
      row.onclick = () => { selected = { key: leaf.key }; refresh(); };
      row.append(top, ...(shared ? [shared] : []), vals, range);
      list.appendChild(row);
      return { key: leaf.key, show };
    });
    if (!rows.length) list.appendChild(el('div', `padding:6px 14px; color:${DIM};`, 'no leaves on this view'));
  };
  const refresh = () => { rows.forEach((r) => r.show()); };
  const rebuild = () => { build(); refresh(); };
  // The panel lives in the body alongside the collage it watches, and rebuilding it is itself a body
  // mutation. Records that come only from inside the panel are its own echo and are dropped, or the
  // observer would call rebuild in a loop and the page would never come back.
  const ours = (records) => records.every((r) => root.contains(r.target));

  // ---------------------------------------------------------------- move
  // A drag or a nudge moves the card, so it writes the offset. Holding alt moves the plate alone
  // against its caption, which is the bleed, and is how the off-page anchors were composed.
  const move = (dx, dy, plateOnly) => {
    if (!selected) return;
    const e = liveOf(selected.key), kx = plateOnly ? 'bleedX' : 'offsetX', ky = plateOnly ? 'bleedY' : 'offsetY';
    e[kx] = round(px(e[kx]) + dx) + 'px';
    e[ky] = round(px(e[ky]) + dy) + 'px';
    rerender(); refresh();
  };
  const scaleBy = (f) => {
    if (!selected) return;
    const e = liveOf(selected.key), base = baseOf(selected.key);
    scaleEntry(e, base, Math.min(2.5, Math.max(0.3, scaleOf(e, base) * f)));
    rerender(); refresh();
  };

  // A leaf's plate is a button that opens its chapter. In dev mode the press selects and drags it
  // instead, so the capture phase takes the event before the component's own handler sees it.
  const onDown = (ev) => {
    const wrap = ev.target.closest && ev.target.closest('[data-leaf][data-slot]');
    if (!wrap || root.contains(ev.target)) return;
    ev.preventDefault(); ev.stopPropagation();
    const e = liveOf(wrap.dataset.slot);
    if (!e) return;
    selected = { key: wrap.dataset.slot };
    const plateOnly = ev.altKey, kx = plateOnly ? 'bleedX' : 'offsetX', ky = plateOnly ? 'bleedY' : 'offsetY';
    drag = { key: wrap.dataset.slot, x: ev.clientX, y: ev.clientY, kx, ky, bx: px(e[kx]), by: px(e[ky]) };
    refresh();
  };
  const onMove = (ev) => {
    if (!drag) return;
    const e = liveOf(drag.key);
    e[drag.kx] = round(drag.bx + ev.clientX - drag.x) + 'px';
    e[drag.ky] = round(drag.by + ev.clientY - drag.y) + 'px';
    rerender(); refresh();
  };
  const onUp = () => { drag = null; };
  const onClick = (ev) => {
    // the press was ours, so the click it produces must not reach the chapter it would have opened
    if (ev.target.closest && ev.target.closest('[data-leaf][data-slot]') && !root.contains(ev.target)) {
      ev.preventDefault(); ev.stopPropagation();
    }
  };
  const onWheel = (ev) => {
    const wrap = ev.target.closest && ev.target.closest('[data-leaf][data-slot]');
    if (!wrap || root.contains(ev.target)) return;
    ev.preventDefault();
    selected = { key: wrap.dataset.slot };
    scaleBy(ev.deltaY < 0 ? 1.03 : 1 / 1.03);
  };
  // The page already binds the arrows to moving between views and Escape to going back, so a nudge
  // would navigate away instead. While a leaf is selected the panel takes those keys first, in the
  // capture phase, and stops them there; with nothing selected they mean what they always meant.
  const NUDGE = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  const onKey = (ev) => {
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
    // d has to work wherever focus happens to be, or hiding the panel with its own button leaves
    // focus on that button and the key that brings it back is dead. Only a text field keeps its d.
    const t = ev.target, typing = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
    if (ev.key === 'd' && !typing) { ev.stopPropagation(); root.hidden = !root.hidden; return; }
    if (!selected) return;
    if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); selected = null; refresh(); return; }
    const step = ev.shiftKey ? 10 : 1;
    if (NUDGE[ev.key]) {
      ev.preventDefault(); ev.stopPropagation();
      move(NUDGE[ev.key][0] * step, NUDGE[ev.key][1] * step, ev.altKey);
    } else if (ev.key === '[' || ev.key === ']') {
      ev.preventDefault(); ev.stopPropagation();
      scaleBy(ev.key === ']' ? 1.05 : 1 / 1.05);
    }
  };

  // ---------------------------------------------------------------- buttons
  const bar = el('div', `display:flex; gap:6px; margin:10px 14px 0; padding-top:10px; border-top:1px solid ${RULE};`);
  const button = (text, fn, title) => { const b = el('button', `all:unset; cursor:pointer; padding:4px 10px; border:1px solid rgba(243,242,242,0.25); border-radius:3px; color:${INK};`, text); b.onclick = fn; b.title = title; return b; };
  // The other half of copy. A tuning session lives in one tab's memory, and a reload used to end it;
  // reading a block back in means the work can be parked and picked up, here or on another machine.
  const apply = (text) => {
    const grab = (name) => {
      const a = text.indexOf(name + ' = {'), z = text.indexOf('\n  };', a);
      if (a < 0 || z < 0) throw new Error('no ' + name + ' block in that text');
      // eslint-disable-next-line no-new-func
      return new Function('return {' + text.slice(a + name.length + 4, z) + '}')();
    };
    const read = { spreads: grab('LEAF_SPREADS'), pairs: grab('LEAF_PAIRS') };
    for (const which of ['spreads', 'pairs']) {
      const live = which === 'spreads' ? spreads : pairs;
      for (const side of ['left', 'right']) {
        const from = read[which][side] || [];
        if (from.length !== live[side].length) throw new Error(which + '.' + side + ' has ' + from.length + ' entries, the page has ' + live[side].length);
        live[side].forEach((e, i) => { for (const k of Object.keys(e)) delete e[k]; Object.assign(e, from[i]); });
      }
    }
    rerender(); refresh();
  };

  bar.append(
    button('copy', () => { const text = serialize(spreads, pairs); out.textContent = text; navigator.clipboard?.writeText(text).catch(() => {}); }, 'copy both tables ready to paste into design/Portfolio.dc.html'),
    button('paste', async () => {
      try {
        const text = (await navigator.clipboard.readText()) || '';
        apply(text);
        out.textContent = 'read ' + text.length + ' characters back in';
      } catch (e) { out.textContent = 'paste failed: ' + e.message; }
    }, 'read a copied block back from the clipboard'),
    button('reset', () => {
      for (const which of ['spreads', 'pairs']) {
        const live = which === 'spreads' ? spreads : pairs;
        for (const side of ['left', 'right']) live[side].forEach((e, i) => Object.assign(e, initial[which][side][i]));
      }
      out.textContent = ''; rerender(); refresh();
    }, 'back to the values this panel was mounted with'),
    button('hide', (ev) => { ev.currentTarget.blur(); root.hidden = true; }, 'hide; press d to show again'),
  );
  root.append(bar, out);
  document.body.appendChild(root);

  window.addEventListener('pointerdown', onDown, true);
  window.addEventListener('pointermove', onMove, true);
  window.addEventListener('pointerup', onUp, true);
  window.addEventListener('click', onClick, true);
  window.addEventListener('wheel', onWheel, { capture: true, passive: false });
  window.addEventListener('keydown', onKey, true);
  // the collage re-renders under the panel, so the rows are rebuilt when the leaves change
  const observer = new MutationObserver((records) => { if (!drag && !ours(records)) rebuild(); });
  observer.observe(document.body, { childList: true, subtree: true });
  rebuild();

  // An escape hatch for the console, so a hidden panel or a stuck session is never a dead end:
  // __leaves.show(), __leaves.dump() for the block as text, __leaves.tables for the live objects.
  window.__leaves = {
    show: () => { root.hidden = false; return 'panel back'; },
    hide: () => { root.hidden = true; },
    dump: () => serialize(spreads, pairs),
    apply,
    tables: { spreads, pairs },
  };

  return {
    destroy() {
      if (window.__leaves && window.__leaves.tables && window.__leaves.tables.spreads === spreads) delete window.__leaves;
      observer.disconnect();
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerup', onUp, true);
      window.removeEventListener('click', onClick, true);
      window.removeEventListener('wheel', onWheel, { capture: true });
      window.removeEventListener('keydown', onKey, true);
      root.remove();
    },
  };
}
