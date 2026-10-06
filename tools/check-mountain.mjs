// Checks scenes/mountain.js's simulation headless: the soaring, the kettles, the summits kept clear, the lift a visitor
// raises, the gust, reduced motion, the goats, the hachures, the stream, the scene's place in the pick registry and the
// counts on a coarse pointer.
//
// The mountain's step() is a function of the world, dt and the world's own seeded random source, so every run below is
// the same run every time. None of these properties shows in a still frame: an eagle that stalls for a second, a kettle
// that swallows the whole sky, or a reduced-motion cloud that still drifts all look fine in a screenshot and wrong in
// motion.
//
// Run with `npm run check`. Exits non-zero and prints every failure it found.

// MOUNTAIN_MODULE=<path> runs these checks against another copy of scenes/mountain.js (with its kit.js beside it), to
// show a check failing on a broken copy. MOUNTAIN_METRICS=1 prints the measured values the bounds were tuned from.
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
const M = await import(process.env.MOUNTAIN_MODULE ? pathToFileURL(resolve(process.env.MOUNTAIN_MODULE)).href : '../scenes/mountain.js');
// the summits are the kit's footprints, and the defaults are the kit's function of the scene's tables
const K = await import(process.env.MOUNTAIN_MODULE ? new URL('./kit.js', pathToFileURL(resolve(process.env.MOUNTAIN_MODULE))).href : '../scenes/kit.js');
const { createWorld, step, setSummits, setPointer, raiseThermal, strokeStart, strokeTo, strokeEnd, soaring, inCover } = M;

const failures = [];
const fail = (msg) => failures.push(msg);
const DT = 1 / 60;
const metric = (line) => { if (process.env.MOUNTAIN_METRICS) console.log(line); };
const defaults = () => K.paramDefaults(M.PARAMS);

// the two summits placed as the home view places the two objects on a 1440x900 page
const SUMMITS = [{ x: 330, y: 260, w: 200, h: 380 }, { x: 900, y: 330, w: 260, h: 260 }];
function mountain(seed, opts = {}) {
  const w = createWorld(defaults(), { w: 1440, h: 900, seed, ...opts });
  setSummits(w, SUMMITS);
  return w;
}
const run = (w, seconds, each) => { for (let s = 0, n = Math.round(seconds / DT); s < n; s++) { step(w, DT); if (each) each(s); } };
const insideTop = (w) => { let worst = Infinity; for (const e of w.eagles) for (const o of w.summits) worst = Math.min(worst, K.edgeR(o, e.x, e.y, 0)); return worst; };
const userThermals = (w) => w.lifts.filter((k) => k.user && k.kind === 'thermal' && !k.dead).length;
const userRidges = (w) => w.lifts.filter((k) => k.user && k.kind === 'ridge' && !k.dead).length;
// open ground below the saddle, well clear of both summits and their rings
const OPEN = { x: 700, y: 790 };

// (a) soaring, (b) kettles form and disperse, (c) no eagle enters a summit's top contour: twelve seeded minutes each,
// from a start settled for 5 s. An airborne eagle never stalls nor races; its height stays in [0, 1]. Eagles join and
// peel off lift at a steady rate, at least two kettles are busy at once, and no lift ever holds most of the sky.
const STALL = 18, RACE = 1.6, JOINS = 100, PEELS = 100, BUSY = 3, SHARE = 0.5;
let worstIn = Infinity, worstWhere = '';
for (let seed = 1; seed <= 12; seed++) {
  const w = mountain(seed), p = w.params, n = w.eagles.length;
  run(w, 5);
  const j0 = w.joins, p0 = w.peels;
  let slow = Infinity, fast = 0, lo = Infinity, hi = -Infinity, busy = 0, most = 0, slowAt = '';
  run(w, 60, (s) => {
    for (const e of w.eagles) {
      if (e.mode !== 'perch') {
        if (e.v < slow) { slow = e.v; slowAt = `step ${s} mode ${e.mode}`; }
        fast = Math.max(fast, e.v);
      }
      lo = Math.min(lo, e.alt); hi = Math.max(hi, e.alt);
    }
    const r = insideTop(w); if (r < worstIn) { worstIn = r; worstWhere = `seed ${seed} step ${s}`; }
    if (s % 30 === 0) {
      const held = new Map();
      for (const e of w.eagles) if (e.lift && e.mode === 'circle') held.set(e.lift, (held.get(e.lift) || 0) + 1);
      let two = 0; for (const c of held.values()) { if (c >= 2) two++; most = Math.max(most, c); }
      busy = Math.max(busy, two);
    }
  });
  const joins = w.joins - j0, peels = w.peels - p0, show = `seed ${seed}`;
  metric(`${show}: (a) speed ${slow.toFixed(1)}..${fast.toFixed(1)} px/s (slowest at ${slowAt}), alt ${lo.toFixed(3)}..${hi.toFixed(3)}; (b) ${joins} joins, ${peels} peels a minute, ${busy} kettles busy at once, most in one lift ${most} of ${n}`);
  if (!(slow >= STALL)) fail(`${show}: (a) an airborne eagle stalled at ${slow.toFixed(1)} px/s (${slowAt}), floor ${STALL}`);
  if (!(fast <= RACE * p.glide)) fail(`${show}: (a) an eagle flew ${fast.toFixed(1)} px/s, past ${RACE} x glide ${p.glide}`);
  if (!(lo >= 0 && hi <= 1)) fail(`${show}: (a) an eagle's height left [0, 1]: ${lo.toFixed(3)}..${hi.toFixed(3)}`);
  if (!(joins >= JOINS)) fail(`${show}: (b) only ${joins} joins in a minute, want at least ${JOINS}`);
  if (!(peels >= PEELS)) fail(`${show}: (b) only ${peels} peels in a minute, want at least ${PEELS}`);
  if (!(busy >= BUSY)) fail(`${show}: (b) at most ${busy} lifts held two or more circling eagles at once, want ${BUSY}`);
  if (!(most < n && most <= SHARE * n)) fail(`${show}: (b) one lift held ${most} of ${n} circling eagles, the kettles collapsed (bound ${SHARE * 100}%)`);
}
// (c) and with a thermal raised just outside a summit's edge, the eagles it draws circle against the summit
{
  const w = mountain(3); run(w, 5);
  const o = w.summits[1], V = { x: 0, y: 0 };
  K.onEdge(o, o.x + 1, o.y + 1, 10, V);
  const k = raiseThermal(w, V.x, V.y);
  if (!k) fail(`(c) a thermal could not be raised 10 px outside a summit's edge at ${V.x.toFixed(0)}, ${V.y.toFixed(0)}`);
  let near = 0;
  run(w, 30, (s) => {
    const r = insideTop(w); if (r < worstIn) { worstIn = r; worstWhere = `the thermal by the summit, step ${s}`; }
    if (k) near = Math.max(near, w.eagles.filter((e) => e.lift === k && e.mode === 'circle').length);
  });
  metric(`(c) ${near} eagles circled the thermal by the summit at once; least normalised radius over all runs ${worstIn.toFixed(3)} at ${worstWhere}`);
}
if (!(worstIn >= 1)) fail(`(c) an eagle entered a summit's top contour: normalised radius ${worstIn.toFixed(3)} at ${worstWhere}`);

// (d) a press that never moves raises one thermal; it gathers eagles and is spent; a tap raises one too
const GATHER = 4, GATHER_S = 6, SPENT_S = 14;
{
  const w = mountain(5); run(w, 5);
  if (M.summitAt(w, OPEN.x, OPEN.y) >= 0) fail('(d) the open ground the press is made on lies on a summit');
  const before = userThermals(w);
  strokeStart(w, OPEN.x, OPEN.y); strokeEnd(w);
  const made = userThermals(w) - before, k = w.lifts.find((l) => l.user && l.kind === 'thermal' && !l.dead);
  if (made !== 1 || !k) fail(`(d) a press should raise exactly one thermal, raised ${made}`);
  else {
    let peak = 0, gatheredAt = -1, spentAt = -1;
    run(w, 40, (s) => {
      const c = w.eagles.filter((e) => e.lift === k && e.mode === 'circle').length;
      peak = Math.max(peak, c);
      if (gatheredAt < 0 && c >= GATHER) gatheredAt = (s + 1) * DT;
      if (spentAt < 0 && (k.dead || !w.lifts.includes(k))) spentAt = (s + 1) * DT;
    });
    metric(`(d) press: ${peak} eagles circling at most, ${GATHER} by ${gatheredAt.toFixed(2)} s, spent at ${spentAt.toFixed(2)} s`);
    if (!(gatheredAt >= 0 && gatheredAt <= GATHER_S)) fail(`(d) ${GATHER} eagles should circle in a raised thermal within ${GATHER_S} s; at most ${peak} did${gatheredAt >= 0 ? `, first at ${gatheredAt.toFixed(2)} s` : ''}`);
    if (!(spentAt >= 0 && spentAt <= SPENT_S)) fail(`(d) a raised thermal should be spent within ${SPENT_S} s, ${spentAt >= 0 ? `spent at ${spentAt.toFixed(2)} s` : 'still alive after 40 s'}`);
  }
  const b2 = userThermals(w), t = raiseThermal(w, OPEN.x + 200, OPEN.y - 40), made2 = userThermals(w) - b2;
  if (!t || made2 !== 1) fail(`(d) a tap should raise exactly one thermal, raised ${made2}`);
}

// (e) a 300 px drag lays one ridge of lift points a spacing apart, and eagles fly it
const RIDGE_S = 20;
{
  const w = mountain(6); run(w, 5);
  const p = w.params, r0 = userRidges(w), x0 = OPEN.x - 150;
  strokeStart(w, x0, OPEN.y);
  for (let x = x0 + 10; x <= x0 + 300; x += 10) strokeTo(w, x, OPEN.y);
  strokeEnd(w);
  const ridges = w.lifts.filter((k) => k.user && k.kind === 'ridge' && !k.dead), made = userRidges(w) - r0;
  const want = 300 / p.spacing + 1;
  if (made !== 1) fail(`(e) a drag should lay exactly one ridge, laid ${made}`);
  else {
    const g = ridges[ridges.length - 1], pts = g.pts.length / 2;
    if (!(Math.abs(pts - want) <= 1.5)) fail(`(e) a 300 px drag should lay about ${want.toFixed(1)} lift points, laid ${pts}`);
    let on = 0, at = -1;
    run(w, RIDGE_S, (s) => { const c = w.eagles.filter((e) => e.lift === g && e.mode === 'ridge').length; on = Math.max(on, c); if (at < 0 && c > 0) at = (s + 1) * DT; });
    metric(`(e) ridge of ${pts} points (about ${want.toFixed(1)} wanted); first eagle on it at ${at.toFixed(2)} s, ${on} at most`);
    if (!(on >= 1)) fail(`(e) no eagle flew the ridge within ${RIDGE_S} s`);
  }
}

// (f) a fast sweep through a kettle is a gust: it sends eagles to cover, and they all soar again within a bound
const TOSSED = 0.15, CALM_S = 20;
{
  const w = mountain(8); run(w, 8);
  const p = w.params, n = w.eagles.length, frac = () => w.eagles.filter(inCover).length / n;
  let base = 0; run(w, 2, () => { base = Math.max(base, frac()); });
  // the busiest kettle
  const held = new Map(); for (const e of w.eagles) if (e.lift && e.mode === 'circle') held.set(e.lift, (held.get(e.lift) || 0) + 1);
  const k = [...held.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!k) fail('(f) no kettle had an eagle circling in it to sweep through');
  else {
    const speed = 2 * p.gust, g0 = w.gusts, span = 500;
    const sx = k.x - span / 2;
    for (let d = 0; d <= span; d += speed * DT) { setPointer(w, sx + d, k.y, true); step(w, DT); }
    setPointer(w, 0, 0, false);
    const after = frac(), tossed = w.gusts - g0;
    let calm = -1;
    run(w, 60, (s) => { if (calm < 0 && w.eagles.every(soaring)) calm = (s + 1) * DT; });
    metric(`(f) cover baseline ${(base * 100).toFixed(1)}%, after the sweep ${(after * 100).toFixed(1)}% (${tossed} tossed), all soaring again ${calm.toFixed(2)} s after`);
    if (!(after >= base + TOSSED)) fail(`(f) a gust should send at least ${TOSSED * 100}% more of the eagles to cover: ${(base * 100).toFixed(1)}% before, ${(after * 100).toFixed(1)}% after`);
    if (!(calm >= 0 && calm <= CALM_S)) fail(`(f) every eagle should soar again within ${CALM_S} s of a gust, ${calm >= 0 ? `took ${calm.toFixed(2)} s` : 'some still in cover after 60 s'}`);
  }
}

// (g) reduced motion: nothing a visitor does raises lift or tosses an eagle; clouds, wingbeats and goats hold still
{
  const w = mountain(9, { reduced: true }); run(w, 3);
  const t0 = userThermals(w), r0 = userRidges(w), g0 = w.gusts;
  strokeStart(w, OPEN.x, OPEN.y); strokeEnd(w);
  const tap = raiseThermal(w, OPEN.x + 100, OPEN.y);
  strokeStart(w, OPEN.x - 150, OPEN.y); for (let x = OPEN.x - 140; x <= OPEN.x + 150; x += 10) strokeTo(w, x, OPEN.y); strokeEnd(w);
  if (tap || userThermals(w) !== t0) fail(`(g) under reduced motion a press or a tap should raise no thermal, ${userThermals(w) - t0} raised`);
  if (userRidges(w) !== r0) fail(`(g) under reduced motion a drag should lay no ridge, ${userRidges(w) - r0} laid`);
  const c0 = w.cloudT, clouds = w.clouds.map((c) => [c.x, c.y]), goats = w.goats.map((g) => [g.x, g.y]);
  let beat = 0;
  run(w, 5, (s) => {
    const k = s % 120; setPointer(w, 100 + k * 40, 500, k < 30);
    for (const e of w.eagles) beat = Math.max(beat, e.beat);
  });
  const cloudMove = Math.max(0, ...w.clouds.map((c, i) => Math.hypot(c.x - clouds[i][0], c.y - clouds[i][1])));
  const goatMove = Math.max(0, ...w.goats.map((g, i) => Math.hypot(g.x - goats[i][0], g.y - goats[i][1])));
  metric(`(g) reduced: cloudT ${c0.toFixed(3)} -> ${w.cloudT.toFixed(3)}, clouds moved ${cloudMove.toFixed(3)} px, goats ${goatMove.toFixed(3)} px, beat ${beat}, gusts ${w.gusts - g0}`);
  if (w.cloudT !== c0) fail(`(g) under reduced motion cloudT should hold, went ${c0.toFixed(3)} -> ${w.cloudT.toFixed(3)}`);
  if (cloudMove !== 0) fail(`(g) under reduced motion the clouds should hold still, one moved ${cloudMove.toFixed(2)} px`);
  if (beat !== 0) fail(`(g) under reduced motion no eagle should flap, a beat reached ${beat.toFixed(3)}`);
  if (w.gusts !== g0) fail(`(g) under reduced motion a fast sweep should toss nothing, tossed ${w.gusts - g0}`);
  if (goatMove !== 0) fail(`(g) under reduced motion the goats should hold still, one moved ${goatMove.toFixed(2)} px`);
}

// (h) a goat bolts from the cursor within a second; once the cursor leaves, the goats settle
const SETTLE_S = 5, SIT_S = 1.5;
{
  const w = mountain(10); run(w, 3);
  const g = w.goats.find((o) => o.hop === -1 && o.at.links.some((l) => !w.goats.some((q) => q !== o && (q.at === l || q.to === l))));
  if (!g) fail('(h) no sitting goat with a free ledge to bolt to');
  else {
    const cx = g.x, cy = g.y, b0 = w.bolts;
    setPointer(w, cx, cy, true);
    let hopped = false; run(w, 1, () => { if (g.hop >= 0) hopped = true; });
    const away = Math.hypot(g.x - cx, g.y - cy), bolts = w.bolts - b0;
    if (!(hopped && bolts >= 1 && away >= 20)) fail(`(h) a goat under the cursor should bolt within a second: hopped ${hopped}, ${bolts} bolts, ${away.toFixed(1)} px from the cursor`);
    setPointer(w, cx, cy, false);
    const b1 = w.bolts;
    let settled = -1, sit = 0, longest = 0;
    run(w, 10, (s) => {
      if (settled < 0 && w.goats.every((o) => o.hop === -1)) settled = (s + 1) * DT;
      if (g.hop === -1) { sit += DT; longest = Math.max(longest, sit); } else sit = 0;
    });
    metric(`(h) bolted ${bolts} times, ${away.toFixed(1)} px from the cursor after 1 s; every goat sitting ${settled.toFixed(2)} s after the cursor left; the bolted goat's longest sit ${longest.toFixed(2)} s`);
    if (w.bolts !== b1) fail(`(h) no goat should bolt with the cursor off the page, ${w.bolts - b1} did`);
    if (!(settled >= 0 && settled <= SETTLE_S)) fail(`(h) every goat should be sitting within ${SETTLE_S} s of the cursor leaving, ${settled >= 0 ? `took ${settled.toFixed(2)} s` : 'never in 10 s'}`);
    if (!(longest >= SIT_S)) fail(`(h) the bolted goat should stay put at least ${SIT_S} s once settled, sat ${longest.toFixed(2)} s at most`);
  }
}

// (i) the hachures: a measured number on the default page; every one runs downslope; none on a summit
const HACH = [1500, 2200];
for (let seed = 1; seed <= 4; seed++) {
  const w = mountain(seed), p = w.params, R = w.relief, marks = M.hachures(w, 1440, 900, p), sl = { x: 0, y: 0 };
  let up = 0, inside = 0, worst = 1;
  for (const { pts } of marks) {
    const mx = (pts[0] + pts[2]) / 2, my = (pts[1] + pts[3]) / 2, dx = pts[2] - pts[0], dy = pts[3] - pts[1];
    if (M.inZone(R, mx, my)) inside++;
    M.slope(R, mx, my, sl);
    const g = Math.hypot(sl.x, sl.y), L = Math.hypot(dx, dy);
    if (g < 1e-3 * R.gref || L < 1e-9) continue;
    const c = (dx * -sl.x + dy * -sl.y) / (L * g); worst = Math.min(worst, c);
    if (!(c > 0.95)) up++;
  }
  metric(`seed ${seed} (i) ${marks.length} hachures, worst downslope cosine ${worst.toFixed(4)}, ${inside} in a summit zone`);
  if (!(marks.length >= HACH[0] && marks.length <= HACH[1])) fail(`seed ${seed}: (i) ${marks.length} hachures on the default page, want ${HACH[0]}..${HACH[1]}`);
  if (up) fail(`seed ${seed}: (i) ${up} hachures do not run downslope (worst cosine ${worst.toFixed(3)})`);
  if (inside) fail(`seed ${seed}: (i) ${inside} hachures lie in a summit's zone`);
}

// (j) the stream runs at least 20 points down to its tarn and ends on the shore
for (let seed = 1; seed <= 12; seed++) {
  const w = mountain(seed), S = w.relief.stream;
  if (!S) { fail(`seed ${seed}: (j) no stream was laid`); continue; }
  const n = S.pts.length / 2, x = S.pts[2 * n - 2], y = S.pts[2 * n - 1], t = S.tarn;
  const off = Math.hypot(x - t.x, y - t.y) - M.tarnR(t, Math.atan2(y - t.y, x - t.x));
  metric(`seed ${seed} (j) stream of ${n} points ends ${off.toFixed(3)} px off its tarn's shore`);
  if (!(n >= 20)) fail(`seed ${seed}: (j) the stream has ${n} points, want at least 20`);
  if (!(Math.abs(off) <= 1.5)) fail(`seed ${seed}: (j) the stream ends ${off.toFixed(2)} px off its tarn's shore`);
}

// (k) the home view's pick registry holds the mountain
{
  const src = readFileSync(new URL('../design/Portfolio.dc.html', import.meta.url), 'utf8');
  const m = src.match(/scenes = \{([\s\S]*?)\};/);
  if (!m) fail('(k) design/Portfolio.dc.html has no `scenes = {` member');
  else if (!/\bmountain\s*:\s*\(\)\s*=>\s*import\(\s*'\.\/scenes\/mountain\.js'\s*\)/.test(m[1])) fail("(k) the scenes registry should map mountain to import('./scenes/mountain.js')");
}

// (l) a coarse pointer gets the touch counts, a fine one the full counts
for (const coarse of [false, true]) {
  const w = mountain(11, { coarse }), p = w.params, kind = coarse ? 'coarse' : 'fine';
  const want = coarse ? { eagles: p.countTouch, goats: p.goatsTouch, clouds: p.cloudsTouch } : { eagles: p.count, goats: p.goats, clouds: p.clouds };
  if (w.eagles.length !== want.eagles) fail(`(l) ${kind}: ${w.eagles.length} eagles, want ${want.eagles}`);
  if (w.goats.length !== want.goats) fail(`(l) ${kind}: ${w.goats.length} goats, want ${want.goats}`);
  if (w.clouds.length !== want.clouds) fail(`(l) ${kind}: ${w.clouds.length} clouds, want ${want.clouds}`);
}

if (failures.length) { for (const f of failures) console.error('FAIL ' + f); process.exit(1); }
console.log('check-mountain: soaring, kettles, summits kept clear, raised thermals and ridges, gusts, reduced motion, goats, hachures, the stream, the pick registry and the coarse counts hold');
