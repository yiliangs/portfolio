// Checks scenes/prairie.js's simulation headless: the herd and its bands, the land a horse walks round, the apples,
// the startle, reduced motion, the hares, the grass, the trails, the scene's place in the home registry, and the horses'
// bodies kept apart and the canopies' caps.
//
// The prairie's step() is a function of the world, dt and the world's own seeded random sources, so every run below is
// the same run every time. None of these properties shows in a still frame: a horse whose nose dips into a boulder for
// one frame, a band that wanders off and never comes back, or a reduced-motion herd that still bolts all look fine in a
// screenshot and wrong in motion.
//
// Run with `npm run check`. Exits non-zero and prints every failure it found. PRAIRIE_METRICS=1 prints what each
// section measured, so a bound can be read against the value it guards.

// PRAIRIE_MODULE=<path> runs these checks against another copy of scenes/prairie.js (with its kit.js beside it), e.g. a
// copy with one behaviour broken, to show a check failing on the code it guards. HOME_SRC=<path> reads the registry out
// of another copy of design/Portfolio.dc.html.
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
const M = await import(process.env.PRAIRIE_MODULE ? pathToFileURL(resolve(process.env.PRAIRIE_MODULE)).href : '../scenes/prairie.js');
const K = await import(process.env.PRAIRIE_MODULE ? new URL('./kit.js', pathToFileURL(resolve(process.env.PRAIRIE_MODULE))).href : '../scenes/kit.js');
const { createWorld, step, setSources, setPointer, dropFeed, strokeStart, strokeTo, strokeEnd, strokeCancel, knollAt, grassMarks, gaitShare, blocksOf, noseReach } = M;
const { edgeR, edgeGap } = K, defaults = () => K.paramDefaults(M.PARAMS);

const failures = [];
const fail = (msg) => failures.push(msg);
const DT = 1 / 60;
const metric = (line) => { if (process.env.PRAIRIE_METRICS) console.log(line); };
// in metrics mode, the seconds each section took, printed as the next one starts
let lapAt = performance.now(), lapName = null;
const lap = (name) => { const t = performance.now(); if (lapName) metric(`(${lapName}) took ${((t - lapAt) / 1000).toFixed(1)} s`); lapAt = t; lapName = name; };

// two knolls on a 1440x900 page, as the home page lays its two objects
const BOXES = [{ x: 300, y: 260, w: 170, h: 340 }, { x: 900, y: 330, w: 240, h: 240 }];
const W = 1440, H = 900;
function world(seed, opts = {}) {
  const w = createWorld(defaults(), { w: W, h: H, seed, ...opts });
  setSources(w, BOXES);
  step(w, DT);
  return w;
}
const run = (w, seconds, dt = DT, each) => { const n = Math.round(seconds / dt); for (let s = 0; s < n; s++) { step(w, dt); if (each) each(w, s); } };
function centroid(w) { let x = 0, y = 0; for (const h of w.horses) { x += h.x; y += h.y; } return { x: x / w.horses.length, y: y / w.horses.length }; }
// A startle: the cursor crosses the herd's middle at 20 px a step (1200 px/s at DT), then lifts. each(w) runs after
// every step of the sweep.
function sweep(w, each, angle = 0.3, steps = 50) {
  const c = centroid(w), ux = Math.cos(angle), uy = Math.sin(angle);
  for (let k = 0; k <= steps; k++) { const s = (k - steps / 2) * 20; setPointer(w, c.x + ux * s, c.y + uy * s, true); step(w, DT); if (each) each(w); }
  setPointer(w, 0, 0, false);
}
// open ground about `dist` px from (x, y): off every knoll, well clear of every block, inside the page
function openNear(w, x, y, dist) {
  for (let i = 0; i < 64; i++) {
    const a = i * 0.7, px = x + Math.cos(a) * dist, py = y + Math.sin(a) * dist;
    if (px < 60 || px > W - 60 || py < 120 || py > H - 60 || knollAt(w, px, py) >= 0) continue;
    if (w.knolls.some((o) => edgeR(o, px, py, 30) < 1)) continue;
    if (blocksOf(w).some((b) => Math.hypot(px - b.x, py - b.y) < b.r + 30)) continue;
    return { x: px, y: py };
  }
  return null;
}

lap('a');
// (a) the herd: over 12 seeds the horses keep near their band's mare, every parting ends with the bands rejoining, and
// partings happen at all. The first parting comes 27.5 s or more into a run, so a band that never comes back can stay
// under A_APART in a short run; the share of comebacks that end (A_REJOIN) catches it. A comeback is a parted band whose
// time apart has run out, so it is making for the main band; only those begun A_BACK s or more before a run's end are
// counted, since a band that parts late in a run cannot have come back by its end however well it behaves.
const A_SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], A_SECONDS = 120, A_DT = 1 / 30;
const A_NEAR = 300, A_SHARE = 0.6, A_SAMPLES = 0.98, A_APART = 100, A_REJOIN = 0.8, A_BACK = 30;
{
  let splits = 0, rejoins = 0, comebacks = 0, cameBack = 0, worstSamples = 1, worstShare = 1, longest = 0;
  for (const seed of A_SEEDS) {
    const w = world(seed);
    let samples = 0, good = 0, minShare = 1, apartAt = null, apartMax = 0, s0 = w.splits;
    // a band can turn back and join in the same step, so one seen apart and then gone is a comeback that ended
    const back = new Map(), seen = new Set();
    run(w, A_SECONDS, A_DT, (w, s) => {
      const t = (s + 1) * A_DT;
      for (const b of w.bands) { seen.add(b.id); if (b.away <= 0 && !back.has(b.id)) back.set(b.id, { t, ended: false }); }
      for (const id of seen) if (!w.bands.some((b) => b.id === id)) { const c = back.get(id); if (c) c.ended = true; else back.set(id, { t, ended: true }); seen.delete(id); }
      if (w.bands.length > 1) { if (apartAt == null) apartAt = t; apartMax = Math.max(apartMax, t - apartAt); } else if (apartAt != null) { apartAt = null; rejoins++; }
      if ((s + 1) % 30) return;
      const lead = new Map(w.bands.map((b) => [b.id, w.horses[b.leader]]));
      let near = 0;
      for (const h of w.horses) { const L = lead.get(h.band); if (L && Math.hypot(h.x - L.x, h.y - L.y) <= A_NEAR) near++; }
      const share = near / w.horses.length;
      samples++; if (share >= A_SHARE) good++; minShare = Math.min(minShare, share);
    });
    const frac = good / samples;
    for (const c of back.values()) if (c.t <= A_SECONDS - A_BACK) { comebacks++; if (c.ended) cameBack++; }
    splits += w.splits - s0; worstSamples = Math.min(worstSamples, frac); worstShare = Math.min(worstShare, minShare); longest = Math.max(longest, apartMax);
    metric(`seed ${seed} (a) herd: ${w.horses.length} horses, ${(frac * 100).toFixed(1)} percent of samples with ${A_SHARE * 100} percent within ${A_NEAR} px of their mare, lowest share ${minShare.toFixed(2)}, ${w.splits - s0} splits, ${w.merges} merges, longest apart ${apartMax.toFixed(1)} s`);
    if (frac < A_SAMPLES) fail(`seed ${seed}: (a) the herd should hold together: ${A_SHARE * 100} percent of horses within ${A_NEAR} px of their band's mare in ${A_SAMPLES * 100} percent of samples, got ${(frac * 100).toFixed(1)} percent`);
    if (apartMax > A_APART) fail(`seed ${seed}: (a) parted bands should rejoin within ${A_APART} s, one parting lasted ${apartMax.toFixed(1)} s`);
  }
  metric(`(a) herd overall: worst sample share ${(worstSamples * 100).toFixed(1)} percent, lowest share ${worstShare.toFixed(2)}, longest apart ${longest.toFixed(1)} s, ${splits} splits, ${rejoins} rejoined (${(rejoins / Math.max(1, splits)).toFixed(2)}), ${cameBack} of ${comebacks} comebacks begun ${A_BACK} s before the end ended`);
  if (!(splits >= 1)) fail(`(a) the herd should part at least once over ${A_SEEDS.length} seeds of ${A_SECONDS} s, it never did`);
  if (!(comebacks >= 1)) fail(`(a) some parted band should start back for the main band ${A_BACK} s or more before a run ends, none did`);
  if (cameBack < A_REJOIN * comebacks) fail(`(a) parted bands should come back: at least ${A_REJOIN * 100} percent of ${comebacks} comebacks begun ${A_BACK} s before a run's end should end within it, ${cameBack} did`);
}

lap('b');
// (b) no horse enters a knoll, a boulder, a shrub or the waterhole: its middle, its nose and its rump, every step, with
// a startle partway through
{
  let worstKnoll = Infinity, worstBlock = Infinity;
  for (const seed of [1, 7, 42]) {
    const w = world(seed);
    let kMin = Infinity, bMin = Infinity, hits = 0, first = '';
    const look = (w) => {
      for (const h of w.horses) {
        const ca = Math.cos(h.a), sa = Math.sin(h.a);
        for (const [part, off] of [['middle', 0], ['nose', noseReach(h.g) * h.size], ['rump', -0.6 * h.size]]) {
          const x = h.x + ca * off, y = h.y + sa * off;
          for (const o of w.knolls) { const r = edgeR(o, x, y, 0); kMin = Math.min(kMin, r); if (r < 1) { hits++; if (!first) first = `${part} in a knoll at t ${w.t.toFixed(2)} s`; } }
          for (const b of blocksOf(w)) { const d = Math.hypot(x - b.x, y - b.y) - b.r; bMin = Math.min(bMin, d); if (d < 0) { hits++; if (!first) first = `${part} in a ${b.kind} at t ${w.t.toFixed(2)} s`; } }
        }
      }
    };
    run(w, 40, DT, look); sweep(w, look); run(w, 40, DT, look); sweep(w, look, 2.1); run(w, 38, DT, look);
    worstKnoll = Math.min(worstKnoll, kMin); worstBlock = Math.min(worstBlock, bMin);
    metric(`seed ${seed} (b) keep-out: least knoll edgeR ${kMin.toFixed(3)}, least block clearance ${bMin.toFixed(2)} px, ${hits} intrusions`);
    if (hits) fail(`seed ${seed}: (b) no horse should enter a knoll or a block; ${hits} intrusions, the first ${first}`);
  }
  metric(`(b) keep-out overall: least knoll edgeR ${worstKnoll.toFixed(3)}, least block clearance ${worstBlock.toFixed(2)} px`);
}

lap('c');
// (c) the apples: one dropped on open ground near the herd is eaten; a press with no drag drops one; a cancelled stroke
// drops none; one dropped on a knoll is refused
const C_EAT = 20;
{
  let slowest = 0;
  for (const seed of [1, 7, 42]) {
    const w = world(seed); run(w, 10);
    const c = centroid(w), at = openNear(w, c.x, c.y, 150);
    if (!at) { fail(`seed ${seed}: (c) found no open ground 150 px from the herd to drop an apple on`); continue; }
    const e0 = w.eaten, d0 = w.drops; dropFeed(w, at.x, at.y);
    if (w.drops !== d0 + 1) fail(`seed ${seed}: (c) an apple dropped on open ground should count as dropped`);
    let t = 0; while (w.eaten === e0 && t < C_EAT * 3) { step(w, DT); t += DT; }
    slowest = Math.max(slowest, t);
    metric(`seed ${seed} (c) an apple 150 px from the herd eaten after ${t.toFixed(2)} s`);
    if (w.eaten === e0 || t > C_EAT) fail(`seed ${seed}: (c) an apple 150 px from the herd should be eaten within ${C_EAT} s, ${w.eaten === e0 ? 'it never was' : `took ${t.toFixed(2)} s`}`);
  }
  metric(`(c) slowest apple ${slowest.toFixed(2)} s`);
  const w = world(1), c = centroid(w), at = openNear(w, c.x, c.y, 200);
  let d0 = w.drops, f0 = w.feed.length;
  strokeStart(w, at.x, at.y); strokeEnd(w);
  if (w.drops - d0 !== 1 || w.feed.length - f0 !== 1) fail(`(c) a press with no drag should drop exactly one apple, dropped ${w.drops - d0}`);
  d0 = w.drops; f0 = w.feed.length;
  strokeStart(w, at.x, at.y); strokeTo(w, at.x + 8, at.y); strokeCancel(w);
  if (w.drops !== d0 || w.feed.length !== f0) fail(`(c) a cancelled stroke should drop no apple, dropped ${w.drops - d0}`);
  d0 = w.drops; f0 = w.feed.length;
  const o = w.knolls[0]; dropFeed(w, o.x, o.y);
  if (w.drops !== d0 || w.feed.length !== f0) fail(`(c) an apple dropped on a knoll should be refused, ${w.drops - d0} counted`);
}

lap('d');
// (d) the startle: a fast cursor across the herd sets horses galloping, and the herd settles back to grazing
const D_PEAK = 0.5, D_CALM = 45, D_GRAZE = 0.7;
{
  let lowPeak = 1, slowest = 0;
  for (const seed of [1, 7, 42]) {
    const w = world(seed); run(w, 20);
    let peak = 0; const watch = (w) => { peak = Math.max(peak, gaitShare(w)[3]); };
    sweep(w, watch); run(w, 5, DT, watch);
    let t = 5, calm = false;
    while (t < D_CALM * 3) { const g = gaitShare(w); if (g[0] >= D_GRAZE && g[3] === 0) { calm = true; break; } step(w, DT); t += DT; }
    lowPeak = Math.min(lowPeak, peak); slowest = Math.max(slowest, t);
    metric(`seed ${seed} (d) startle: peak gallop share ${peak.toFixed(2)}, back to grazing (graze ${D_GRAZE}+, gallop 0) after ${calm ? t.toFixed(2) + ' s' : 'never'}`);
    if (!(peak >= D_PEAK)) fail(`seed ${seed}: (d) a fast cursor across the herd should set at least ${D_PEAK * 100} percent galloping, peak ${(peak * 100).toFixed(1)} percent`);
    if (!calm || t > D_CALM) fail(`seed ${seed}: (d) the herd should be back to grazing within ${D_CALM} s of a startle, ${calm ? `took ${t.toFixed(2)} s` : 'it never was'}`);
  }
  metric(`(d) startle overall: lowest peak gallop ${lowPeak.toFixed(2)}, slowest calm ${slowest.toFixed(2)} s`);
}

lap('e');
// (e) reduced motion: the same sweep sets nothing galloping, the wind's phase holds and no gust blows; in full motion the
// phase runs
{
  for (const seed of [1, 7]) {
    const w = world(seed, { reduced: true }); run(w, 10);
    const ph = w.wind.phase; let gallop = 0, gusts = 0;
    const watch = (w) => { gallop = Math.max(gallop, gaitShare(w)[3]); gusts = Math.max(gusts, w.wind.gusts.length); };
    run(w, 1, DT, watch); sweep(w, watch); run(w, 10, DT, watch);
    metric(`seed ${seed} (e) reduced: peak gallop share ${gallop.toFixed(2)}, wind phase moved ${(w.wind.phase - ph).toFixed(4)}, most gusts ${gusts}`);
    if (gallop > 0) fail(`seed ${seed}: (e) under reduced motion no horse should gallop, peak gallop share ${(gallop * 100).toFixed(1)} percent`);
    if (w.wind.phase !== ph) fail(`seed ${seed}: (e) under reduced motion the wind's phase should hold, it moved ${(w.wind.phase - ph).toFixed(4)}`);
    if (gusts) fail(`seed ${seed}: (e) under reduced motion no gust should blow, ${gusts} at once`);
    const f = world(seed), fph = f.wind.phase; run(f, 2);
    if (!(f.wind.phase > fph)) fail(`seed ${seed}: (e) in full motion the wind's phase should advance, it held at ${fph}`);
  }
}

lap('f');
// (f) the hares: a cursor held by a sitting hare sends it bolting, and once the cursor lifts every hare is out of the
// bolt; under reduced motion no hare bolts
const F_BOLT = 0.2, F_DOWN = 4;
{
  for (const seed of [1, 7, 42]) {
    for (const reduced of [false, true]) {
      const w = world(seed, { reduced }); run(w, 0.5);
      const q = w.hares.find((q) => q.state === 'sit');
      if (!q) { fail(`seed ${seed}: (f) ${reduced ? 'reduced: ' : ''}found no sitting hare to scare (${w.hares.length} hares)`); continue; }
      const hx = q.x + 20, hy = q.y; let t = 0, bolted = -1, everBolt = false;
      while (t < 2) { setPointer(w, hx, hy, true); step(w, DT); t += DT; if (w.hares.some((h) => h.state === 'bolt')) everBolt = true; if (bolted < 0 && q.state === 'bolt') { bolted = t; if (!reduced) break; } }
      if (reduced) {
        metric(`seed ${seed} (f) reduced: a hare under the cursor ${everBolt ? 'bolted' : 'held'}, bolts ${w.hares.reduce((a, h) => a + h.bolts, 0)}`);
        if (everBolt || w.hares.some((h) => h.bolts)) fail(`seed ${seed}: (f) under reduced motion no hare should bolt`);
        continue;
      }
      setPointer(w, 0, 0, false);
      let u = 0; while (u < F_DOWN * 3 && w.hares.some((h) => h.state === 'bolt')) { step(w, DT); u += DT; }
      metric(`seed ${seed} (f) hares: bolted ${bolted >= 0 ? `after ${bolted.toFixed(3)} s` : 'never'}, every hare out of the bolt ${u.toFixed(2)} s after the cursor lifted`);
      if (bolted < 0 || bolted > F_BOLT) fail(`seed ${seed}: (f) a hare with the cursor 20 px off should bolt within ${F_BOLT} s, ${bolted < 0 ? 'it never did' : `took ${bolted.toFixed(3)} s`}`);
      if (u > F_DOWN) fail(`seed ${seed}: (f) every hare should be out of the bolt within ${F_DOWN} s of the cursor lifting, took ${u.toFixed(2)} s`);
    }
  }
}

lap('g');
// (g) the grass: a lattice of blades of a known count, the same for the same seed, twice as many at twice the density;
// the wind's phase runs with the clock
const G_LO = 4500, G_HI = 4950;
{
  for (const seed of [1, 7, 42]) {
    const a = grassMarks(seed, 0.2, W, H, 1), b = grassMarks(seed, 0.2, W, H, 1), two = grassMarks(seed, 0.2, W, H, 2);
    const n = a.length / 4, n2 = two.length / 4, same = a.length === b.length && a.every((v, i) => v === b[i]);
    metric(`seed ${seed} (g) grass: ${n} blades at density 1, ${n2} at density 2 (ratio ${(n2 / n).toFixed(3)}), same seed same blades ${same}`);
    if (!(n >= G_LO && n <= G_HI)) fail(`seed ${seed}: (g) a 1440x900 field should hold ${G_LO} to ${G_HI} blades at density 1, got ${n}`);
    if (!same) fail(`seed ${seed}: (g) the same seed should lay the same blades`);
    if (!(n2 / n >= 1.8 && n2 / n <= 2.2)) fail(`seed ${seed}: (g) density 2 should lay about twice the blades, ratio ${(n2 / n).toFixed(3)}`);
  }
  const w = world(3), ph = w.wind.phase; run(w, 10);
  metric(`(g) wind phase advanced ${(w.wind.phase - ph).toFixed(4)} over 10 s`);
  if (!(Math.abs(w.wind.phase - ph - 10) < 0.01)) fail(`(g) the wind's phase should advance with the clock, ${(w.wind.phase - ph).toFixed(4)} over 10 s`);
}

lap('h');
// (h) the trails: one from each knoll to the waterhole, its points close together and its ends on the two features. A
// trail starts half a trail width (0.5 x thin, 20 px at the defaults) off a knoll's edge, so an end counts as on its
// feature within H_END.
const H_STEP = 20, H_END = 30;
{
  for (const seed of [1, 7, 42]) {
    const w = world(seed), L = w.land;
    if (!L || !L.water) { fail(`seed ${seed}: (h) the land should hold a waterhole`); continue; }
    const near = (name, x, y) => {
      if (name === 'water') return Math.abs(Math.hypot(x - L.water.x, y - L.water.y) - L.water.r);
      const o = w.knolls[+name.slice(5)]; return o ? Math.abs(edgeGap(o, x, y, 0)) : Infinity;
    };
    for (let i = 0; i < w.knolls.length; i++) {
      const k = 'knoll' + i, t = L.trails.find((t) => (t.from === k && t.to === 'water') || (t.from === 'water' && t.to === k));
      if (!t) { fail(`seed ${seed}: (h) there should be a trail from ${k} to the waterhole`); continue; }
      const P = t.pts, n = P.length / 2; let gap = 0;
      for (let j = 1; j < n; j++) gap = Math.max(gap, Math.hypot(P[2 * j] - P[2 * j - 2], P[2 * j + 1] - P[2 * j - 1]));
      const e0 = near(t.from, P[0], P[1]), e1 = near(t.to, P[2 * n - 2], P[2 * n - 1]);
      metric(`seed ${seed} (h) trail ${t.from}-${t.to}: ${n} points, widest step ${gap.toFixed(1)} px, ends ${e0.toFixed(1)} and ${e1.toFixed(1)} px off their features`);
      if (gap > H_STEP) fail(`seed ${seed}: (h) trail ${t.from}-${t.to} should step at most ${H_STEP} px, widest ${gap.toFixed(1)} px`);
      if (e0 > H_END || e1 > H_END) fail(`seed ${seed}: (h) trail ${t.from}-${t.to} should end on its features, ends ${e0.toFixed(1)} and ${e1.toFixed(1)} px off`);
    }
  }
}

lap('i');
// (i) the registry: the home page's logic class lists the prairie as a lazy import of its module
{
  const SRC = process.env.HOME_SRC || 'design/Portfolio.dc.html';
  const src = readFileSync(SRC, 'utf8').replace(/\r\n/g, '\n');
  // every member of the logic class sits at two-space indent, so `\n  }` closes it
  const at = src.indexOf('\n  scenes = {'), open = at < 0 ? -1 : src.indexOf('{', at), end = open < 0 ? -1 : src.indexOf('\n  }', open);
  const text = end < 0 ? null : src.slice(open, end + 4);
  if (!text) fail(`(i) ${SRC} has no scene registry (a \`scenes = { name: () => import(...) }\` field)`);
  else {
    let registry = null; try { registry = new Function('return ' + text)(); } catch (e) { fail(`(i) the scene registry does not parse: ${e.message}`); }
    if (registry && typeof registry.prairie !== 'function') fail('(i) the scene registry should hold the prairie as a lazy import');
    if (!/\n\s+prairie: \(\) => import\('\.\/scenes\/prairie\.js'\),?\n/.test(text)) fail("(i) the registry's prairie entry should be `prairie: () => import('./scenes/prairie.js')`");
  }
}

// A horse's body as a capsule: a segment along its heading from the rump to the nose, each end pulled in by the radius,
// with half the body's width as the radius. cx, cy and R bound it in a circle, so most pairs are rejected cheaply.
function capsule(h, p) {
  const S = h.size, r = (p.girth ?? 0.21) * S, ux = Math.cos(h.a), uy = Math.sin(h.a);
  const back = (p.rump ?? 0.5) * S - r, front = noseReach(h.g) * S - r;
  const ax = h.x - ux * back, ay = h.y - uy * back, bx = h.x + ux * front, by = h.y + uy * front;
  return { ax, ay, bx, by, r, cx: (ax + bx) / 2, cy: (ay + by) / 2, R: Math.hypot(bx - ax, by - ay) / 2 + r };
}
// the least distance between segments P0P1 and Q0Q1, by the closest points on the two lines clamped to the segments
function segDist(px, py, qx, qy, rx, ry, sx, sy) {
  const d1x = qx - px, d1y = qy - py, d2x = sx - rx, d2y = sy - ry, ex = px - rx, ey = py - ry;
  const a = d1x * d1x + d1y * d1y, e = d2x * d2x + d2y * d2y, f = d2x * ex + d2y * ey;
  let s, t;
  if (a < 1e-12 && e < 1e-12) return Math.hypot(ex, ey);
  if (a < 1e-12) { s = 0; t = Math.min(1, Math.max(0, f / e)); }
  else {
    const c = d1x * ex + d1y * ey;
    if (e < 1e-12) { t = 0; s = Math.min(1, Math.max(0, -c / a)); }
    else {
      const b = d1x * d2x + d1y * d2y, den = a * e - b * b;
      s = den > 1e-12 ? Math.min(1, Math.max(0, (b * f - c * e) / den)) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = Math.min(1, Math.max(0, -c / a)); } else if (t > 1) { t = 1; s = Math.min(1, Math.max(0, (b - c) / a)); }
    }
  }
  return Math.hypot(px + d1x * s - (rx + d2x * t), py + d1y * s - (ry + d2y * t));
}
// the least capsule gap over every pair of horses, and the pair; pairs whose bounding circles are apart are skipped, so
// a herd with no pair close reports Infinity
function leastGap(w) {
  const p = w.params, C = w.horses.map((h) => capsule(h, p));
  let least = Infinity;
  for (let i = 0; i < C.length; i++) {
    const A = C[i];
    for (let j = i + 1; j < C.length; j++) {
      const B = C[j];
      if (Math.hypot(A.cx - B.cx, A.cy - B.cy) - A.R - B.R >= least) continue;
      least = Math.min(least, segDist(A.ax, A.ay, A.bx, A.by, B.ax, B.ay, B.bx, B.by) - A.r - B.r);
    }
  }
  return least;
}
// how many horses a grove's canopy may hold
const canopyCap = (w, g) => {
  const p = w.params;
  return M.canopyCap ? M.canopyCap(w, g) : Math.max(1, Math.floor((g.r * g.r) / (p.size * p.size * (p.crowd ?? 1.6))));
};

lap('j');
// (j) hard separation and the canopy queue: over 12 seeds of 120 s with a startle toward cover at 30 s, no two horses'
// bodies overlap by more than J_OVERLAP px at any step after the first 2 s, and no grove's canopy ever holds more horses
// than its cap. Every step is measured.
const J_SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], J_SECONDS = 120, J_STARTLE = 30, J_SETTLE = 2, J_OVERLAP = 0.5;
{
  const t0 = performance.now();
  for (const seed of J_SEEDS) {
    const w = world(seed);
    let t = 0, worst = Infinity, worstAt = 0, overAt = null, canopy = 0, canopyCapAt = 1, ratio = -1;
    const look = (w) => {
      t += DT;
      if (t < J_SETTLE) return;
      const g = leastGap(w);
      if (g < worst) { worst = g; worstAt = t; }
      for (const G of (w.land ? w.land.groves : [])) {
        let n = 0; for (const h of w.horses) if (Math.hypot(h.x - G.x, h.y - G.y) < G.r) n++;
        const cap = canopyCap(w, G);
        if (n / cap > ratio) { ratio = n / cap; canopy = n; canopyCapAt = cap; }
        if (n > cap && !overAt) overAt = { t, n, cap };
      }
    };
    run(w, J_STARTLE, DT, look); sweep(w, look); run(w, J_SECONDS - J_STARTLE - 51 * DT, DT, look);
    metric(`seed ${seed} (j) separation: worst capsule gap ${worst.toFixed(2)} px at t ${worstAt.toFixed(2)} s, fullest canopy ${canopy}/${canopyCapAt}`);
    if (worst < -J_OVERLAP) fail(`seed ${seed}: (j) no two horses should overlap by more than ${J_OVERLAP} px, worst gap ${worst.toFixed(2)} px at t ${worstAt.toFixed(2)} s`);
    if (overAt) fail(`seed ${seed}: (j) no canopy should hold more horses than its cap, ${overAt.n} under a canopy of cap ${overAt.cap} at t ${overAt.t.toFixed(2)} s`);
  }
  metric(`(j) separation ran ${((performance.now() - t0) / 1000).toFixed(1)} s, measuring every step`);
}

lap(null);
if (failures.length) { for (const f of failures) console.error('FAIL ' + f); process.exit(1); }
console.log('check-prairie: the herd holds and rejoins, no horse enters a knoll or a block, apples are eaten, a startle passes, reduced motion stills, hares bolt and settle, the grass, the trails and the registry hold, and bodies stay apart under capped canopies');
