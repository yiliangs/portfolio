// Checks that on the home view the islands, not the two buttons' boxes, decide what a pointer does.
//
// The scroll and the cube are drawn as live organic islands in the pond, but their pointer zones used to be the
// two home buttons: tall rectangles that neither matched the land nor changed with it. A click on island land
// outside a button's box did nothing (it started a feed stroke instead), and a press on open water that happened
// to lie inside a box fed nothing, because feeding skips anything inside a button.
//
// Once the pond is up the buttons stop taking pointer hits and the window routing asks the pond which island a
// point is on. Before the pond has loaded the buttons keep their boxes, so the objects still open by pointer.
//
// The routing code is read out of componentDidMount and run for real against a stub `this` and a stub window, with
// jsdom elements as event targets so `closest` answers as in a browser. Hit testing is modelled: a point inside a
// button's box lands on the button unless the button has pointer-events none, otherwise on the main element.

import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const SRC = process.env.HOME_SRC || 'design/Portfolio.dc.html';   // HOME_SRC runs it against another copy
const src = readFileSync(SRC, 'utf8');
const failures = [];
const fail = (msg) => failures.push(msg);

// the routing block: from its first const to the line that adds the window listeners
function routing() {
  const starts = ['const homePond', 'const feedable'].map((k) => src.indexOf(k)).filter((i) => i >= 0);
  if (!starts.length) return null;
  const at = Math.min(...starts), line = src.lastIndexOf('\n', at) + 1;
  const add = src.indexOf("window.addEventListener('pointerdown', this.onFeedDown)", at);
  if (add < 0) return null;
  return src.slice(line, src.indexOf('\n', add));
}
function readMethod(name) {
  const at = src.indexOf('\n  ' + name + '(');
  if (at < 0) return null;
  const open = src.indexOf('{', at), end = src.indexOf('\n  }', open);
  return open < 0 || end < 0 ? null : src.slice(open + 1, end);
}

const code = routing();
if (!code) { console.error('check-home-pointer: could not find the home pointer routing in ' + SRC); process.exit(1); }
const sync = readMethod('syncPond') || '';
// the buttons give up the pointer only after the pond exists: the line sits past the `if (!this.pond)` early return
const mountAt = sync.indexOf('if (!this.pond)'), noneAt = sync.search(/roll\.style\.pointerEvents\s*=\s*cube\.style\.pointerEvents\s*=\s*'none'/);
const buttonsYield = mountAt >= 0 && noneAt > mountAt;

const { window: win } = new JSDOM('<!doctype html><body><a id="link" href="#">x</a><main id="main"><button id="roll"></button><button id="cube"></button></main></body>');
const doc = win.document, main = doc.getElementById('main'), link = doc.getElementById('link');
const roll = doc.getElementById('roll'), cube = doc.getElementById('cube');
// the old boxes: the roll is a tall cell, the cube a square
const BOX = new Map([[roll, { x0: 100, y0: 100, x1: 300, y1: 500 }], [cube, { x0: 700, y0: 200, x1: 900, y1: 400 }]]);
// the islands the pond draws: an ellipse round each object, wider than the roll's box and not the same shape
const ISLANDS = [{ cx: 200, cy: 300, rx: 180, ry: 120 }, { cx: 800, cy: 300, rx: 140, ry: 140 }];
const hit = (x, y) => ISLANDS.findIndex((o) => ((x - o.cx) / o.rx) ** 2 + ((y - o.cy) / o.ry) ** 2 < 1);

function world({ pond = true } = {}) {
  const log = { nav: [], feed: [], hover: [] };
  const P = pond ? {
    hit, strokeStart: (x, y) => log.feed.push(['start', x, y]), strokeTo: (x, y) => log.feed.push(['to', x, y]),
    strokeEnd: () => log.feed.push(['end']), strokeCancel: () => log.feed.push(['cancel']), drop: (x, y) => log.feed.push(['drop', x, y]),
  } : null;
  for (const b of [roll, cube]) b.style.pointerEvents = pond && buttonsYield ? 'none' : '';
  const self = {
    state: { view: 'home' }, pond: P, rootRef: { current: main },
    goPage: (p) => log.nav.push(p), goCube: () => log.nav.push('tooling'), homeHoverAt: (i) => log.hover.push(i),
  };
  const on = {};
  const fakeWin = { addEventListener: (t, f) => { (on[t] = on[t] || []).push(f); }, getSelection: () => '' };
  new Function('window', code).call(self, fakeWin);
  const targetAt = (x, y) => {
    for (const [b, r] of BOX) if (b.style.pointerEvents !== 'none' && x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1) return b;
    return main;
  };
  const fire = (type, x, y, extra = {}) => {
    const e = { type, button: 0, pointerType: 'mouse', clientX: x, clientY: y, target: extra.target || targetAt(x, y), ...extra };
    for (const f of on[type] || []) f(e);
    // a button that takes the hit runs its own onClick: goWriting / goToolingFromCube
    if (type === 'click' && e.target === roll) log.nav.push('writing');
    if (type === 'click' && e.target === cube) log.nav.push('tooling');
  };
  const tap = (x, y, extra = {}) => { fire('pointerdown', x, y, extra); fire('pointerup', x, y, extra); fire('click', x, y, extra); };
  return { log, fire, tap };
}
const said = (log) => `nav ${JSON.stringify(log.nav)}, feed ${JSON.stringify(log.feed.map((f) => f[0]))}`;

// 1. a click on the scroll's island outside the roll button's old box opens Research, and feeds nothing
{
  const { log, tap } = world(); tap(360, 300);
  if (log.nav.join() !== 'writing' || log.feed.length) fail(`click on island 0 outside the old box should open writing and feed nothing: ${said(log)}`);
}
// 2. a click on open water inside the roll button's old box drops a treat and navigates nowhere
{
  const { log, tap } = world(); tap(120, 130);
  const dropped = log.feed.some((f) => f[0] === 'start') && log.feed.some((f) => f[0] === 'end');
  if (log.nav.length || !dropped) fail(`click on water inside the old roll box should feed (start + end) and not navigate: ${said(log)}`);
}
// 3. a click on the cube's island opens Development through the cube
{
  const { log, tap } = world(); tap(800, 300);
  if (log.nav.join() !== 'tooling' || log.feed.length) fail(`click on island 1 should open tooling and feed nothing: ${said(log)}`);
}
// 4. a drag that starts on an island neither feeds nor navigates
{
  const { log, fire } = world();
  fire('pointerdown', 200, 300); fire('pointermove', 260, 300); fire('pointermove', 420, 300); fire('pointerup', 420, 300); fire('click', 420, 300);
  if (log.nav.length || log.feed.length) fail(`a drag starting on an island should neither feed nor navigate: ${said(log)}`);
}
// 5. touch: a tap on an island navigates, a tap on water drops one treat, a drag that the browser turns into a
//    scroll does neither
{
  const t = { pointerType: 'touch' };
  let { log, tap } = world(); tap(360, 300, t);
  if (log.nav.join() !== 'writing' || log.feed.length) fail(`touch tap on island 0 should open writing: ${said(log)}`);
  ({ log, tap } = world()); tap(120, 130, t);
  if (log.nav.length || log.feed.map((f) => f[0]).join() !== 'drop') fail(`touch tap on water should drop one treat: ${said(log)}`);
  const w2 = world(); w2.fire('pointerdown', 360, 300, t); w2.fire('pointercancel', 360, 340, t); w2.fire('pointerdown', 120, 130, t); w2.fire('pointermove', 120, 180, t); w2.fire('pointercancel', 120, 180, t);
  if (w2.log.nav.length || w2.log.feed.length) fail(`a touch scroll should neither navigate nor feed: ${said(w2.log)}`);
}
// 6. a press on a real control is left alone
{
  const { log, tap } = world(); tap(360, 300, { target: link });
  if (log.feed.length || log.nav.length) fail(`a press on a link should be left to the link: ${said(log)}`);
}
// 7. hovering: the island under a mouse is reported, water and controls report -1
{
  const { log, fire } = world(); fire('pointermove', 800, 300); fire('pointermove', 40, 40); fire('pointermove', 360, 300); fire('pointermove', 360, 300, { target: link });
  if (log.hover.join() !== '1,-1,0,-1') fail(`hover should report 1,-1,0,-1, got ${log.hover.join()}`);
}
// 8. before the pond is up the buttons keep their boxes and still open the objects by pointer
{
  const { log, tap } = world({ pond: false }); tap(150, 450);
  if (log.nav.join() !== 'writing' || log.feed.length) fail(`with no pond a click in the roll box should still open writing: ${said(log)}`);
}
// 9. the home view's text cannot be selected
{
  const home = src.match(/<main key="home"[^>]*>/);
  if (!home || !/user-select:\s*none/.test(home[0]) || !/-webkit-user-select:\s*none/.test(home[0])) fail('the home <main> should carry user-select:none and -webkit-user-select:none');
}
// 10. the listeners come off on unmount
{
  const un = readMethod('componentWillUnmount') || '';
  for (const t of ["'pointerdown', this.onFeedDown", "'pointermove', this.onFeedMove", "'pointerup', this.onFeedUp", "'pointercancel', this.onFeedUp", "'click', this.onHomeClick"]) {
    if (/onHomeClick/.test(code) || !/onHomeClick/.test(t)) if (!un.includes('removeEventListener(' + t)) fail(`componentWillUnmount should remove ${t}`);
  }
}

if (failures.length) {
  console.error('check-home-pointer: ' + failures.length + ' failure(s)');
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
console.log('check-home-pointer: on home the islands route clicks, hovers and feeding; the buttons yield only once the pond is up; home text is not selectable');
