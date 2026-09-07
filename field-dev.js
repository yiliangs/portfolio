// Dev panel for the home field. One section per part of the system (landscape, flow, particles), one row per
// parameter with its name, its value and what it does, tuning the live object in place. Loaded only when the URL
// carries ?dev, so it ships nothing to the page otherwise. Clear wipes the trails so a setting can be read on a clean
// sheet. Copy writes the current values as a PARAMS block ready to paste back into field.js; Reset returns to the
// defaults it was mounted with. The d key hides and shows the panel.
// mount(field) -> { destroy() }, where field is what field.js's mount returned
import { PARAMS } from './field.js';

const INK = '#f3f2f2', DIM = '#a8a4a0', GOLD = '#b68235', RULE = 'rgba(243,242,242,0.12)';
const el = (tag, css, text) => { const e = document.createElement(tag); if (css) e.style.cssText = css; if (text != null) e.textContent = text; return e; };

export function mount(field) {
  const params = field.params, initial = { ...params };
  const root = el('div', `position:fixed; right:16px; bottom:16px; z-index:1000; width:320px; max-height:calc(100vh - 32px); overflow:auto; box-sizing:border-box; padding:4px 0 10px; background:rgba(28,27,26,0.94); color:${INK}; font:11px/1.5 'Geist Mono', ui-monospace, monospace; border-radius:6px; box-shadow:0 12px 40px rgba(0,0,0,0.35); user-select:none; pointer-events:auto;`);
  const refresh = [];
  for (const [section, entries] of Object.entries(PARAMS)) {
    root.appendChild(el('div', `margin:10px 14px 4px; padding-bottom:4px; border-bottom:1px solid ${RULE}; color:${GOLD}; font-size:10px; letter-spacing:0.14em; text-transform:uppercase;`, section));
    for (const [key, spec] of Object.entries(entries)) {
      const toggle = spec[1] === 'toggle', label = toggle ? spec[2] : spec[4];
      const row = el('label', 'display:block; padding:5px 14px 6px; cursor:pointer;');
      const head = el('div', 'display:flex; justify-content:space-between; align-items:baseline; gap:8px;');
      const name = el('span', `color:${INK};`, key), value = el('span', `color:${INK}; text-align:right;`);
      head.append(name, value);
      const hint = el('div', `color:${DIM}; font-size:10px; margin-top:1px;`, label);
      row.append(head, hint);
      if (toggle) {
        const box = el('input', 'position:absolute; opacity:0; width:0; height:0;'); box.type = 'checkbox';
        row.style.position = 'relative';
        const show = () => { const on = !!params[key]; value.textContent = on ? 'on' : 'off'; value.style.color = on ? GOLD : DIM; box.checked = on; };
        box.onchange = () => { params[key] = box.checked ? 1 : 0; show(); };
        row.appendChild(box); refresh.push(show); show();
      } else {
        const [, min, max, step] = spec;
        const range = el('input', `display:block; width:100%; margin:4px 0 0; accent-color:${GOLD};`); range.type = 'range'; range.min = min; range.max = max; range.step = step;
        const show = () => { value.textContent = String(params[key]); range.value = params[key]; };
        range.oninput = () => { params[key] = Number(range.value); show(); };
        row.appendChild(range); refresh.push(show); show();
      }
      root.appendChild(row);
    }
  }
  const bar = el('div', `display:flex; gap:6px; margin:10px 14px 0; padding-top:10px; border-top:1px solid ${RULE};`);
  const button = (text, fn, title) => { const b = el('button', `all:unset; cursor:pointer; padding:4px 10px; border:1px solid rgba(243,242,242,0.25); border-radius:3px; color:${INK};`, text); b.onclick = fn; b.title = title; return b; };
  const out = el('pre', `margin:8px 14px 0; white-space:pre-wrap; color:${DIM}; font-size:10px; max-height:140px; overflow:auto; user-select:text;`);
  const dump = () => Object.entries(PARAMS).map(([section, entries]) => `  ${section}: {\n${Object.entries(entries).map(([k, v]) => `    ${k}: [${params[k]}, ${v.slice(1).map((x) => (typeof x === 'string' ? `'${x}'` : x)).join(', ')}],`).join('\n')}\n  },`).join('\n');
  bar.append(
    button('clear', () => field.clear(), 'wipe the trails'),
    button('copy', () => { const text = dump(); out.textContent = text; navigator.clipboard?.writeText(text).catch(() => {}); }, 'copy the values as a PARAMS block'),
    button('reset', () => { Object.assign(params, initial); refresh.forEach((f) => f()); out.textContent = ''; }, 'back to the defaults'),
    button('hide', () => { root.hidden = true; }, 'hide; press d to show again'),
  );
  root.append(bar, out);
  document.body.appendChild(root);
  const onKey = (e) => { if (e.key === 'd' && !e.metaKey && !e.ctrlKey && e.target === document.body) root.hidden = !root.hidden; };
  window.addEventListener('keydown', onKey);
  return { destroy() { window.removeEventListener('keydown', onKey); root.remove(); } };
}
