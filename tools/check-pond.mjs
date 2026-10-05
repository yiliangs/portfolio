// Checks pond.js's simulation headless: the swimming stroke, the islands, the treats, and reduced motion.
//
// The pond's step() is a function of the world, dt and the world's own seeded random source, so every run below is
// the same run every time. None of these properties shows in a still frame: a fish that clips an island for one frame,
// a school that circles a treat without ever taking it, or a reduced-motion school that still bursts all look fine in
// a screenshot and wrong in motion.
//
// The checks are lettered in the order they were written. (l), the reeds, and (o), the dragonfly, went with the
// things they checked; the other letters keep their names, so the gaps are deliberate.
//
// Run with `npm run check`. Exits non-zero and prints every failure it found.

// POND_MODULE=<path> runs these checks against another copy of pond.js, e.g. an older commit's, to show a check failing
// on the code it was written to replace.
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const M = await import(process.env.POND_MODULE ? pathToFileURL(resolve(process.env.POND_MODULE)).href : '../pond.js');
const { defaults, createWorld, step, setIslands, setPointer, dropTreat, strokeStart, strokeTo, strokeEnd, strokeCancel, envelope, thrustHz, lateral, shoreR, coast, waterOf } = M;

const failures = [];
const fail = (msg) => failures.push(msg);
const DT = 1 / 60;
const TAU = Math.PI * 2;
const metric = (line) => { if (process.env.POND_METRICS) console.log(line); };

// the stroke: the tail sweeps wider than the head; a thrust's beat rate follows the speed it aims at through the
// stride, so an urgent thrust beats faster, but never past maxHz
{
  const p = defaults();
  if (!(envelope(1) > envelope(0) * 3)) fail(`tail amplitude ${envelope(1)} should far exceed head amplitude ${envelope(0)}`);
  let peak = 0; for (let ph = 0; ph < TAU; ph += 0.01) peak = Math.max(peak, Math.abs(lateral(1, ph, 5)));
  let head = 0; for (let ph = 0; ph < TAU; ph += 0.01) head = Math.max(head, Math.abs(lateral(0, ph, 5)));
  if (!(peak > head)) fail(`lateral sweep at the tail ${peak.toFixed(2)} should exceed the head ${head.toFixed(2)}`);
  if (typeof thrustHz !== 'function') fail('pond.js should export thrustHz, the beat rate of a thrust');
  else {
    const slow = thrustHz(p.cruise * p.over, p.length, p), fast = thrustHz(p.cruise * p.burst * p.over, p.length, p);
    if (!(fast > slow * 1.5)) fail(`an urgent thrust should beat faster: ${slow.toFixed(2)} Hz at cruise, ${fast.toFixed(2)} Hz at burst`);
    if (!(thrustHz(1e4, p.length, p) <= p.maxHz)) fail(`a thrust should never beat past maxHz ${p.maxHz}`);
  }
}

// Beat and glide, over a seeded minute on a 1440x900 page with two islands. The beat rate is read off the tail's
// phase each frame, so it holds for any model of the stroke: a frame whose phase does not advance is a glide. A
// cruising fish is one with nothing urgent on it and not hovering. (a) the beat of a cruising fish sits at a pond
// fish's 1 to 2 Hz, never past 4.5 Hz for anything; (b) a cruising fish glides 35% to 65% of the time; the pond stays
// active, mean speed at least SPEED_FLOOR.
const ISL2 = [{ x: 300, y: 250, w: 170, h: 340 }, { x: 900, y: 330, w: 240, h: 240 }];
export const SPEED_FLOOR = 30;
export function beatMetrics(seed) {
  const w = createWorld(defaults(), { w: 1440, h: 900, seed });
  setIslands(w, ISL2);
  const prev = w.fish.map((f) => f.phase), hz = [];
  let top = 0, glide = 0, cruising = 0, speed = 0, speedN = 0;
  for (let s = 0; s < 60 * 65; s++) {
    step(w, DT);
    w.fish.forEach((f, i) => {
      const d = (((f.phase - prev[i]) % TAU) + TAU) % TAU; prev[i] = f.phase;
      if (s < 60 * 5) return;
      const b = d / TAU / DT;
      top = Math.max(top, b); speed += f.sp; speedN++;
      if (f.en > 0.05 || f.flee > 0 || f.idle > 0) return;
      cruising++;
      if (b < 0.05) glide++; else hz.push(b);
    });
  }
  hz.sort((a, b) => a - b);
  return { median: hz.length ? hz[hz.length >> 1] : 0, top, glide: glide / Math.max(1, cruising), speed: speed / Math.max(1, speedN) };
}
for (const seed of [2, 19]) {
  const m = beatMetrics(seed);
  const show = `seed ${seed}: cruising beat median ${m.median.toFixed(2)} Hz, top ${m.top.toFixed(2)} Hz, glide ${(m.glide * 100).toFixed(0)}%, mean speed ${m.speed.toFixed(1)} px/s`;
  metric(show);
  if (!(m.median >= 1 && m.median <= 2.2)) fail(`${show}: (a) a cruising fish should beat at 1 to 2.2 Hz`);
  if (!(m.top <= 4.5)) fail(`${show}: (a) no tail should beat past 4.5 Hz`);
  if (!(m.glide >= 0.35 && m.glide <= 0.65)) fail(`${show}: (b) a cruising fish should glide 35% to 65% of the time`);
  if (!(m.speed >= SPEED_FLOOR)) fail(`${show}: mean speed should be at least ${SPEED_FLOOR} px/s`);
}
// (c) a fish that wants no speed hovers: a lone fish held idle for a minute beats well under once every three seconds
{
  const p = defaults(); p.count = 1;
  const w = createWorld(p, { w: 1440, h: 900, seed: 6 });
  let turns = 0, prev = w.fish[0].phase;
  for (let s = 0; s < 60 * 60; s++) {
    w.fish[0].idle = 1e9; step(w, DT);
    turns += ((((w.fish[0].phase - prev) % TAU) + TAU) % TAU) / TAU; prev = w.fish[0].phase;
  }
  metric(`hover: ${(turns / 60).toFixed(2)} Hz`);
  if (!(turns / 60 < 0.3)) fail(`(c) a hovering fish should beat under 0.3 Hz on average, beat ${(turns / 60).toFixed(2)} Hz`);
}

// a pond with the two islands placed as the home view places them, and a cursor sweeping through
const ISLANDS = [{ x: 260, y: 220, w: 160, h: 300 }, { x: 820, y: 300, w: 220, h: 220 }];
function pond(seed, reduced) {
  const w = createWorld(defaults(), { w: 1280, h: 800, seed, reduced });
  setIslands(w, ISLANDS);
  return w;
}

// (b) no fish ever enters an island, whatever the school is doing: milling, chasing treats dropped behind the
// islands, or scattering from a fast cursor
for (const seed of [1, 7, 42]) {
  const w = pond(seed, false);
  let worst = Infinity, where = '';
  for (let s = 0; s < 60 * 60; s++) {
    if (s % 240 === 0) dropTreat(w, [340, 930, 600, 150][(s / 240) % 4], [380, 410, 90, 700][(s / 240) % 4]);
    // every 5 s the cursor crosses the page fast for half a second
    const k = s % 300; setPointer(w, 100 + k * 40, 400, k < 30);
    step(w, DT);
    for (const f of w.fish) for (const o of w.islands) {
      for (let i = 0; i < f.rope.length; i += 2) {
        const r = shoreR(o, f.rope[i], f.rope[i + 1], 0);
        if (r < worst) { worst = r; where = `seed ${seed} step ${s} spine point ${i / 2}`; }
      }
    }
  }
  if (!(worst >= 1)) fail(`a fish entered an island: normalised radius ${worst.toFixed(3)} at ${where}`);
}

// an island follows its object's outline on screen: the object always stands on land, the coast follows a turning
// object within a few follow times yet changes slowly, the swell distorts it well past the object's own profile, a box
// stands in when the object shows nothing, and reduced motion freezes the swell but not the following
{
  const has = typeof M.setOutlines === 'function';
  const CX = 400, CY = 400, HALF = 60;
  // 16 points of a square turned by angle a: its corners and three points along each side
  const square = (a) => (out) => {
    const c = Math.cos(a()), s = Math.sin(a()), q = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    let n = 0;
    for (let e = 0; e < 4; e++) for (let j = 0; j < 4; j++) {
      const u = j / 4, x = (q[e][0] + (q[(e + 1) % 4][0] - q[e][0]) * u) * HALF, y = (q[e][1] + (q[(e + 1) % 4][1] - q[e][1]) * u) * HALF;
      out[2 * n] = CX + x * c - y * s; out[2 * n + 1] = CY + x * s + y * c; n++;
    }
    return n;
  };
  // 60 points round a thin rectangle 300 x 40 that tilts back and forth, like the scroll under the cursor
  const RX = 900, RY = 450;
  const rect = (a) => (out) => {
    const c = Math.cos(a()), s = Math.sin(a()), per = 2 * (300 + 40);
    for (let n = 0; n < 60; n++) {
      let d = (n / 60) * per, x, y;
      if (d < 300) { x = -150 + d; y = -20; } else if ((d -= 300) < 40) { x = 150; y = -20 + d; } else if ((d -= 40) < 300) { x = 150 - d; y = 20; } else { d -= 300; x = -150; y = 20 - d; }
      out[2 * n] = RX + x * c - y * s; out[2 * n + 1] = RY + x * s + y * c;
    }
    return 60;
  };
  const SQ_BOX = { x: CX - HALF, y: CY - HALF, w: 2 * HALF, h: 2 * HALF }, RC_BOX = { x: RX - 150, y: RY - 20, w: 300, h: 40 };
  const quiet = (reduced) => { const p = defaults(); p.count = 0; p.countTouch = 0; return createWorld(p, { w: 1440, h: 900, seed: 5, reduced }); };
  const BUF = new Float32Array(512);
  // least land in px between any outline point and the coast
  const clearance = (o, fn) => {
    const n = fn(BUF); let low = Infinity;
    for (let j = 0; j < n; j++) { const dx = BUF[2 * j] - o.x, dy = BUF[2 * j + 1] - o.y; low = Math.min(low, coast(o, Math.atan2(dy, dx)) - Math.hypot(dx, dy)); }
    return low;
  };
  const ring = (o, m = 360) => Array.from({ length: m }, (_, k) => coast(o, (k / m) * TAU));
  const corr = (a, b) => {
    const n = a.length, ma = a.reduce((s, v) => s + v, 0) / n, mb = b.reduce((s, v) => s + v, 0) / n;
    let ab = 0, aa = 0, bb = 0; for (let k = 0; k < n; k++) { ab += (a[k] - ma) * (b[k] - mb); aa += (a[k] - ma) ** 2; bb += (b[k] - mb) ** 2; }
    return ab / Math.sqrt(aa * bb || 1);
  };
  // (iv) distorted: the swell spans a good share of the radius and breaks the square's quarter-turn symmetry
  const distortion = (o, base) => {
    const c = ring(o), dev = c.map((v, k) => v - base(k)), mean = c.reduce((s, v) => s + v, 0) / c.length;
    return { span: (Math.max(...dev) - Math.min(...dev)) / mean, sym: corr(c, c.map((_, k) => c[(k + 90) % 360])) };
  };
  let dist;
  if (!has) {
    const [o] = M.islandsFrom([SQ_BOX]); o.time = 10;
    dist = distortion(o, (k) => M.offsetRay(o.a, o.b, M.MARGIN, (k / 360) * TAU));
    fail('islands should follow outline functions (setOutlines); (i), (ii), (iii), (v), (vi) cannot run on this model');
  } else {
    const P = defaults();
    // (i) on land, under a turning square and a tilting thin rectangle
    {
      const w = quiet(false);
      const sq = square(() => 0.25 * w.t), rc = rect(() => 0.5 * Math.sin(0.4 * w.t));
      M.setOutlines(w, [sq, rc]); setIslands(w, [SQ_BOX, RC_BOX]);
      let low = [Infinity, Infinity];
      for (let s = 1; s <= 60 * 40; s++) { step(w, DT); if (w.t > 2 && s % 6 === 0) { low[0] = Math.min(low[0], clearance(w.islands[0], sq)); low[1] = Math.min(low[1], clearance(w.islands[1], rc)); } }
      ['square', 'rectangle'].forEach((name, i) => { if (!(low[i] >= P.floor - 1e-3)) fail(`(i) the ${name} should stand ${P.floor} px inside its coast, came within ${low[i].toFixed(2)} px`); });
      metric(`islands: least land square ${low[0].toFixed(1)} px, rectangle ${low[1].toFixed(1)} px`);
    }
    // (ii) follows: turn the square 45 degrees; within 3 follow times the profile is within 2 px of its new target
    {
      const w = quiet(false); let a = 0;
      M.setOutlines(w, [square(() => a)]); setIslands(w, [SQ_BOX]);
      for (let s = 0; s < 60 * 3; s++) step(w, DT);
      a = Math.PI / 4;
      for (let s = 0; s < Math.ceil((3 * P.follow) / DT); s++) step(w, DT);
      const o = w.islands[0], fresh = M.makeIsland(0, SQ_BOX); M.updateIsland(fresh, square(() => a), 0, P, false, w.t);
      let off = 0; for (let j = 0; j < M.BEARINGS; j++) off = Math.max(off, Math.abs(o.S[j] - fresh.S[j]));
      if (!(off <= 2)) fail(`(ii) after ${(3 * P.follow).toFixed(2)} s the coast should be within 2 px of the turned square's, is ${off.toFixed(2)} px off`);
      // and it did move: the target for the turned square differs from the upright one
      const up = M.makeIsland(0, SQ_BOX); M.updateIsland(up, square(() => 0), 0, P, false, w.t);
      let moved = 0; for (let j = 0; j < M.BEARINGS; j++) moved = Math.max(moved, Math.abs(up.S[j] - fresh.S[j]));
      metric(`islands: follow residue ${off.toFixed(2)} px of a ${moved.toFixed(2)} px change`);
    }
    // (iii) smooth: under a square turning at the tesseract's rate the coast changes at most 12 px/s at any bearing
    {
      const w = quiet(false);
      M.setOutlines(w, [square(() => 0.25 * w.t)]); setIslands(w, [SQ_BOX]);
      for (let s = 0; s < 60 * 3; s++) step(w, DT);
      let prev = ring(w.islands[0]), fast = 0;
      for (let s = 0; s < 60 * 30; s++) { step(w, DT); const c = ring(w.islands[0]); for (let k = 0; k < 360; k++) fast = Math.max(fast, Math.abs(c[k] - prev[k]) / DT); prev = c; }
      if (!(fast <= 12)) fail(`(iii) the coast should change at most 12 px/s under a turning square, changed ${fast.toFixed(2)} px/s`);
      metric(`islands: fastest coast change ${fast.toFixed(2)} px/s`);
    }
    {
      const w = quiet(false);
      M.setOutlines(w, [square(() => 0)]); setIslands(w, [SQ_BOX]);
      for (let s = 0; s < 60 * 10; s++) step(w, DT);
      const o = w.islands[0];
      dist = distortion(o, (k) => { const u = (k / 360) * M.BEARINGS, i = Math.floor(u), f = u - i; return o.S[i % M.BEARINGS] * (1 - f) + o.S[(i + 1) % M.BEARINGS] * f; });
    }
    // (v) fallback: an object that shows nothing still has its box on land
    {
      const w = quiet(false), B = { x: 100, y: 100, w: 200, h: 120 };
      M.setOutlines(w, [() => 0]); setIslands(w, [B]);
      for (let s = 0; s < 60; s++) step(w, DT);
      const corners = (out) => { const q = [B.x, B.y, B.x + B.w, B.y, B.x + B.w, B.y + B.h, B.x, B.y + B.h]; q.forEach((v, j) => (out[j] = v)); return 4; };
      const low = clearance(w.islands[0], corners);
      if (!(low >= P.floor - 1e-3)) fail(`(v) an island with no outline should keep its box ${P.floor} px inside the coast, came within ${low.toFixed(2)} px`);
    }
    // (vi) reduced motion: the swell holds still, yet the coast still follows its object
    {
      const w = quiet(true); let a = 0;
      M.setOutlines(w, [square(() => a)]); setIslands(w, [SQ_BOX]);
      for (let s = 0; s < 60 * 10; s++) step(w, DT);
      const c0 = ring(w.islands[0]);
      for (let s = 0; s < 60 * 5; s++) step(w, DT);
      const c1 = ring(w.islands[0]); let drift = 0; for (let k = 0; k < 360; k++) drift = Math.max(drift, Math.abs(c1[k] - c0[k]));
      if (!(drift <= 1e-3)) fail(`(vi) reduced motion: a still object's coast should hold, moved ${drift.toFixed(3)} px in 5 s`);
      a = Math.PI / 4;
      for (let s = 0; s < 60 * 8; s++) step(w, DT);
      const o = w.islands[0], fresh = M.makeIsland(0, SQ_BOX); M.updateIsland(fresh, square(() => a), 0, w.params, true, w.t);
      let off = 0; for (let j = 0; j < M.BEARINGS; j++) off = Math.max(off, Math.abs(o.S[j] - fresh.S[j]));
      if (!(off <= 2)) fail(`(vi) reduced motion: the coast should still follow a turned object, ${off.toFixed(2)} px off after 8 s`);
    }
  }
  if (!(dist.span >= 0.15)) fail(`(iv) the swell should span at least 0.15 of the mean radius, spans ${dist.span.toFixed(3)}`);
  if (!(dist.sym < 0.9)) fail(`(iv) a square's coast should not repeat every quarter turn, correlation ${dist.sym.toFixed(3)}`);
  metric(`islands: swell span ${dist.span.toFixed(3)} of the mean radius, quarter-turn correlation ${dist.sym.toFixed(3)}`);
}

// (c) a treat dropped within sensing range is eaten within a bounded time, and a reduced-motion school still eats
function eatTime(reduced, dist, seed) {
  const w = pond(seed, reduced);
  for (let s = 0; s < 120; s++) step(w, DT); // let the school settle a moment first
  let cx = 0, cy = 0; for (const f of w.fish) { cx += f.x; cy += f.y; } cx /= w.fish.length; cy /= w.fish.length;
  // the fish nearest the school's middle, and a treat off to its side, so only seeking reaches it
  let near = w.fish[0], nd = Infinity; for (const f of w.fish) { const d = Math.hypot(f.x - cx, f.y - cy); if (d < nd) { nd = d; near = f; } }
  const tx = Math.min(1200, Math.max(80, near.x + Math.cos(near.h + Math.PI / 2) * dist)), ty = Math.min(720, Math.max(80, near.y + Math.sin(near.h + Math.PI / 2) * dist));
  dropTreat(w, tx, ty);
  const before = w.eaten;
  for (let s = 0; s < 60 * 8; s++) { step(w, DT); if (w.eaten > before) return s * DT; }
  return Infinity;
}
for (const seed of [3, 11]) {
  const t = eatTime(false, 150, seed);
  if (!(t < 4)) fail(`seed ${seed}: a treat 150 px to the side should be eaten within 4 s, took ${t}`);
  const tr = eatTime(true, 50, seed);
  if (!(tr < 8)) fail(`seed ${seed}: under reduced motion a treat 50 px to the side should be eaten before it sinks, took ${tr}`);
}

// (d) under reduced motion nothing bursts: treats and a fast cursor leave every fish below the calm cruise speed
{
  const w = pond(5, true);
  let top = 0;
  for (let s = 0; s < 60 * 30; s++) {
    if (s % 90 === 0) dropTreat(w, 200 + (s * 7) % 900, 100 + (s * 13) % 600);
    const k = s % 120; setPointer(w, 50 + k * 60, 300 + k, k < 20);
    step(w, DT);
    for (const f of w.fish) top = Math.max(top, f.sp);
  }
  if (!(top < w.params.cruise)) fail(`reduced motion: top speed ${top.toFixed(1)} px/s should stay below the cruise ${w.params.cruise}`);
}

// and a full-motion school does burst, or (d) proves nothing
{
  const w = pond(5, false);
  let top = 0;
  for (let s = 0; s < 60 * 10; s++) { if (s % 90 === 0) dropTreat(w, 200 + (s * 7) % 900, 100 + (s * 13) % 600); step(w, DT); for (const f of w.fish) top = Math.max(top, f.sp); }
  if (!(top > w.params.cruise * 2)) fail(`full motion: a treat should set fish bursting, top speed only ${top.toFixed(1)} px/s`);
}

// Feeding by drag: a stroke drops a treat where it began and one every `spacing` px of travel after, whatever the size
// of the pointer's steps; a press that never moves drops one; a cancelled stroke drops nothing more; and a long line
// keeps its newest treats up to the cap.
{
  const w = pond(8, false), sp = w.params.spacing;
  strokeStart(w, 100, 770); for (let x = 107; x <= 320; x += 7) strokeTo(w, x, 770); strokeTo(w, 320, 770); strokeEnd(w); // below both islands, so no treat rolls to a shore
  const want = 1 + Math.floor(220 / sp);
  if (w.treats.length !== want) fail(`a 220 px drag should drop ${want} treats, dropped ${w.treats.length}`);
  const gaps = w.treats.slice(1).map((t, i) => t.x - w.treats[i].x);
  if (gaps.some((g) => Math.abs(g - sp) > 1e-6)) fail(`treats along a drag should sit ${sp} px apart, gaps ${gaps.map((g) => g.toFixed(1)).join(',')}`);
  const c = pond(8, false); strokeStart(c, 600, 600); strokeTo(c, 603, 601); strokeEnd(c);
  if (c.treats.length !== 1) fail(`a press without a drag should drop one treat, dropped ${c.treats.length}`);
  const k = pond(8, false); strokeStart(k, 600, 600); strokeTo(k, 610, 600); strokeCancel(k); strokeTo(k, 700, 600); strokeEnd(k);
  if (k.treats.length !== 0) fail(`a cancelled stroke should drop nothing, dropped ${k.treats.length}`);
  const m = pond(8, false); strokeStart(m, 40, 700); strokeTo(m, 1240, 700); strokeEnd(m);
  if (m.treats.length !== m.params.max || !(m.treats[m.treats.length - 1].x > 1200)) fail(`a long line should keep the newest ${m.params.max} treats, kept ${m.treats.length}`);
  // and a line of treats draws a shoal along it: a line laid ahead of the nearest shoal is mostly eaten
  const e = pond(4, false);
  for (let s = 0; s < 120; s++) step(e, DT);
  const f0 = e.fish[0];
  strokeStart(e, f0.x, f0.y); for (let d = 10; d <= 300; d += 10) strokeTo(e, f0.x + Math.cos(f0.h) * d, f0.y + Math.sin(f0.h) * d); strokeEnd(e);
  const laid = e.treats.length, before = e.eaten;
  for (let s = 0; s < 60 * 8; s++) step(e, DT);
  if (!(e.eaten - before >= laid * 0.6)) fail(`a line of ${laid} treats laid ahead of a shoal should mostly be eaten, ${e.eaten - before} were`);
}

// Fission-fusion. Groups are not objects in the pond; they are whatever the fish happen to form, so they are read off
// the fish the way an observer would. Ninety seeded seconds on a 1440x900 page with two islands, sampled once a
// second after a settling spell. A cluster links fish within three body lengths and counts once it holds three.
// Clusters in consecutive samples are matched by the members they share, and an event must still hold HOLD seconds
// later, so a fish flickering at the edge of a link, or two groups brushing past each other, is not read as a split
// and a merge: a merge is fish that stay together, a split fish that stay apart.
// (d) groups meet and part: at least 4 merges and 4 splits a minute on average over twelve seeds, and 2 on each; (e) partners change: at least half of the fish
// spend STAY seconds in one cluster with a fish they were not with at the start; (f) no collapse: one cluster holds more than 70% of
// the fish in under 20% of samples; (g) no scatter: at least 60% of the fish are in some cluster, on average; (h) the
// groups range over the pond, visiting at least 7 of 9 cells, and a moving group swims as one, polarisation 0.6.
const HOLD = 5, STAY = 10;
function clustersOf(F) {
  const n = F.length, id = new Int32Array(n).fill(-1), out = [];
  for (let i = 0; i < n; i++) {
    if (id[i] !== -1) continue;
    const stack = [i], members = []; id[i] = -2;
    while (stack.length) {
      const a = stack.pop(); members.push(a);
      for (let j = 0; j < n; j++) {
        if (id[j] !== -1) continue;
        const link = 1.5 * (F[a].len + F[j].len), dx = F[j].x - F[a].x, dy = F[j].y - F[a].y;
        if (dx * dx + dy * dy < link * link) { id[j] = -2; stack.push(j); }
      }
    }
    if (members.length >= 3) { for (const m of members) id[m] = out.length; out.push(members); } else for (const m of members) id[m] = -3;
  }
  for (let i = 0; i < n; i++) if (id[i] < 0) id[i] = -1;
  return { list: out, of: id };
}
// how many of the fish in `set` share a cluster in sample S with at least two of `other`
const together = (S, a, b) => S.list.some((c) => a.filter((m) => S.of[m] === S.of[c[0]]).length >= 2 && b.filter((m) => S.of[m] === S.of[c[0]]).length >= 2);
export function fissionMetrics(seed) {
  const w = createWorld(defaults(), { w: 1440, h: 900, seed });
  setIslands(w, ISL2);
  const S = [], cells = new Set();
  let polSum = 0, polN = 0, collapsed = 0, grouped = 0;
  for (let s = 0; s <= 60 * 95; s++) {
    step(w, DT);
    if (s < 60 * 5 || s % 60) continue;
    const F = w.fish, n = F.length, C = clustersOf(F);
    S.push(C);
    let big = 0, inC = 0;
    for (const c of C.list) {
      big = Math.max(big, c.length); inC += c.length;
      let cx = 0, cy = 0, hx = 0, hy = 0, sp = 0;
      for (const m of c) { cx += F[m].x; cy += F[m].y; hx += Math.cos(F[m].h); hy += Math.sin(F[m].h); sp += F[m].sp; }
      const k = c.length; cx /= k; cy /= k; sp /= k;
      cells.add(Math.min(2, Math.floor((cx / w.w) * 3)) * 3 + Math.min(2, Math.floor((cy / w.h) * 3)));
      if (sp >= 20) { polSum += Math.hypot(hx, hy) / k; polN++; }
    }
    if (big > 0.7 * n) collapsed++;
    grouped += inC / n;
  }
  let merges = 0, splits = 0;
  for (let t = 0; t + 1 + HOLD < S.length; t++) {
    const A = S[t], B = S[t + 1], L = S[t + 1 + HOLD];
    // a merge: a cluster drawing at least two fish from each of two earlier clusters, still together a second later
    for (const b of B.list) {
      const parts = new Map();
      for (const m of b) if (A.of[m] >= 0) { const k = A.of[m]; if (!parts.has(k)) parts.set(k, []); parts.get(k).push(m); }
      const big = [...parts.values()].filter((q) => q.length >= 2).sort((x, y) => y.length - x.length);
      if (big.length >= 2 && together(L, big[0], big[1])) merges++;
    }
    // a split: a cluster whose fish go two ways, at least two each, and are still apart a second later
    for (const a of A.list) {
      const parts = new Map();
      for (const m of a) if (B.of[m] >= 0) { const k = B.of[m]; if (!parts.has(k)) parts.set(k, []); parts.get(k).push(m); }
      const big = [...parts.values()].filter((q) => q.length >= 2).sort((x, y) => y.length - x.length);
      if (big.length >= 2 && !together(L, big[0], big[1])) splits++;
    }
  }
  // turnover: a fish has changed company once it has swum STAY seconds in one cluster with a fish that was not in its
  // cluster at the first sample; brushing past a stranger does not count
  const n = w.fish.length, first = S[0], changed = new Uint8Array(n), run = new Int32Array(n * n);
  for (let t = 1; t < S.length; t++) for (let m = 0; m < n; m++) for (let o = 0; o < n; o++) {
    if (o === m) continue;
    const km = first.of[m], stranger = km < 0 || first.of[o] !== km, with_ = S[t].of[m] >= 0 && S[t].of[m] === S[t].of[o];
    run[m * n + o] = stranger && with_ ? run[m * n + o] + 1 : 0;
    if (run[m * n + o] >= STAY) changed[m] = 1;
  }
  const minutes = (S.length - 1) / 60;
  return {
    merges: merges / minutes, splits: splits / minutes, turnover: changed.reduce((a, b) => a + b, 0) / n,
    collapsed: collapsed / S.length, grouped: grouped / S.length, cells: cells.size, polarisation: polN ? polSum / polN : 0,
  };
}
// (d) is judged over FISSION_SEEDS: one seed's rate is a noisy sample (5.3 to 11.3 splits a minute across these on
// master), so a per-seed bar flakes on any change to the islands' geometry. The other criteria keep seeds 2 and 19.
const FISSION_SEEDS = [2, 19, 1, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const fission = FISSION_SEEDS.map((seed) => ({ seed, ...fissionMetrics(seed) }));
{
  const mean = (k) => fission.reduce((a, m) => a + m[k], 0) / fission.length;
  const worst = (k) => fission.reduce((a, m) => (m[k] < a[k] ? m : a));
  const wm = worst('merges'), ws = worst('splits');
  const show = `over ${fission.length} seeds: mean ${mean('merges').toFixed(1)} merges and ${mean('splits').toFixed(1)} splits a minute, fewest merges ${wm.merges.toFixed(1)} (seed ${wm.seed}), fewest splits ${ws.splits.toFixed(1)} (seed ${ws.seed})`;
  metric(show);
  if (!(mean('merges') >= 4 && mean('splits') >= 4 && wm.merges >= 2 && ws.splits >= 2)) fail(`${show}: (d) groups should merge and split at least 4 times a minute each on average, and at least twice a minute on every seed`);
}
for (const m of fission.filter((f) => f.seed === 2 || f.seed === 19)) {
  const seed = m.seed;
  const show = `seed ${seed}: ${m.merges.toFixed(1)} merges and ${m.splits.toFixed(1)} splits a minute, turnover ${(m.turnover * 100).toFixed(0)}%, collapsed ${(m.collapsed * 100).toFixed(0)}% of samples, ${(m.grouped * 100).toFixed(0)}% of fish grouped, ${m.cells}/9 cells, polarisation ${m.polarisation.toFixed(2)}`;
  metric(show);
  if (!(m.turnover >= 0.5)) fail(`${show}: (e) at least half the fish should end up with a fish they were not with at the start`);
  if (!(m.collapsed < 0.2)) fail(`${show}: (f) one group should hold over 70% of the fish in under 20% of samples`);
  if (!(m.grouped >= 0.6)) fail(`${show}: (g) at least 60% of the fish should be in a group`);
  if (!(m.cells >= 7)) fail(`${show}: (h) the groups should visit at least 7 of 9 cells`);
  if (!(m.polarisation >= 0.6)) fail(`${show}: (h) a moving group should hold polarisation 0.6`);
}

// The water is the paper tinted a shade toward the depth: darker than the land in either theme, the paper itself at
// depth 0, and the same answer whether the paper arrives as hex or as rgb().
{
  if (typeof waterOf !== 'function') fail('pond.js should export waterOf, the water colour over a paper');
  else {
    const lum = (s) => { const [r, g, b] = s.match(/\d+/g).map(Number); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    if (!(lum(waterOf('#f3f2f2', 0.08)) < lum('rgb(243, 242, 242)'))) fail(`light theme: the water ${waterOf('#f3f2f2', 0.08)} should be darker than the land #f3f2f2`);
    if (!(lum(waterOf('#1b1a19', 0.08)) < lum('rgb(27, 26, 25)'))) fail(`dark theme: the water ${waterOf('#1b1a19', 0.08)} should be darker than the land #1b1a19`);
    if (waterOf('#f3f2f2', 0) !== 'rgb(243, 242, 242)') fail(`water at depth 0 should be the paper itself, got ${waterOf('#f3f2f2', 0)}`);
    if (waterOf('rgb(27, 26, 25)', 0.08) !== waterOf('#1b1a19', 0.08)) fail(`water over rgb() and hex paper should agree: ${waterOf('rgb(27, 26, 25)', 0.08)} vs ${waterOf('#1b1a19', 0.08)}`);
  }
}

// The pointer's land is the drawn coast: islandAt answers from the same shore the fish keep off, so a point on an
// island's land hits that island, a point just past its coast is water, and the answer follows the outline as it
// turns. A drag stroke that crosses an island lays nothing on the land and does not pile its treats on the shore.
{
  if (typeof M.islandAt !== 'function') fail('islandAt(w, x, y) is not exported');
  else {
    const { islandAt } = M;
    const p = defaults(); p.count = 0; p.countTouch = 0;
    const w = createWorld(p, { w: 1440, h: 900, seed: 7, reduced: true });
    const RX = 900, RY = 450, L = 150, T = 20; let ang = 0;
    const bar = (out) => {   // a thin bar, 300 x 40, turned by ang
      const c = Math.cos(ang), s = Math.sin(ang), q = [[-L, -T], [L, -T], [L, T], [-L, T]]; let n = 0;
      for (let e = 0; e < 4; e++) for (let j = 0; j < 8; j++) {
        const u = j / 8, x = q[e][0] + (q[(e + 1) % 4][0] - q[e][0]) * u, y = q[e][1] + (q[(e + 1) % 4][1] - q[e][1]) * u;
        out[2 * n] = RX + x * c - y * s; out[2 * n + 1] = RY + x * s + y * c; n++;
      }
      return n;
    };
    const SQ = { x: 340, y: 390, w: 120, h: 120 };
    M.setOutlines(w, [null, bar]); setIslands(w, [SQ, { x: RX - L, y: RY - T, w: 2 * L, h: 2 * T }]);
    for (let s = 0; s < 60 * 10; s++) step(w, DT);
    const [sq, rb] = w.islands;
    if (islandAt(w, sq.x, sq.y) !== 0) fail(`islandAt at island 0's centre should be 0, got ${islandAt(w, sq.x, sq.y)}`);
    if (islandAt(w, rb.x, rb.y) !== 1) fail(`islandAt at island 1's centre should be 1, got ${islandAt(w, rb.x, rb.y)}`);
    if (islandAt(w, 40, 40) !== -1) fail(`islandAt on open water should be -1, got ${islandAt(w, 40, 40)}`);
    let miss = 0, hit = 0;
    for (let k = 0; k < 48; k++) {
      const t = (k / 48) * TAU;
      for (const o of [sq, rb]) {
        const R = coast(o, t);
        if (islandAt(w, o.x + Math.cos(t) * (R - 2), o.y + Math.sin(t) * (R - 2)) !== o.i) hit++;
        if (islandAt(w, o.x + Math.cos(t) * (R + 2), o.y + Math.sin(t) * (R + 2)) !== -1) miss++;
      }
    }
    if (hit) fail(`islandAt: ${hit}/96 points 2 px inside a coast missed their island`);
    if (miss) fail(`islandAt: ${miss}/96 points 2 px past a coast still hit an island`);
    // the bar's far end: land while the bar lies flat, water once it stands up
    const ex = RX + L - 10, ey = RY;
    const before = islandAt(w, ex, ey);
    ang = Math.PI / 2; for (let s = 0; s < 60 * 10; s++) step(w, DT);
    const after = islandAt(w, ex, ey);
    if (before !== 1 || after !== -1) fail(`islandAt should follow the outline: the bar's end hit ${before} lying flat (want 1) and ${after} standing (want -1)`);
    // a stroke straight through island 0 lays nothing on its land
    const y0 = sq.y + 25;   // off the centre, so a treat rolled radially to the shore leaves the line
    strokeStart(w, 60, y0); strokeTo(w, sq.x, y0); strokeTo(w, 700, y0); strokeEnd(w);
    // a treat that falls on a stone rolls off it, so a treat beside a stone is not counted as rolled to the shore
    const byStone = (t) => (w.rocks || []).some((q) => Math.hypot(t.x - q.x, t.y - q.y) - q.r < w.params.shore + 5);
    const off = w.treats.filter((t) => Math.abs(t.y - y0) > 1 && !byStone(t)).length, onLand = w.treats.filter((t) => islandAt(w, t.x, t.y) >= 0).length;
    if (!w.treats.length) fail('a stroke across open water and an island laid no treats at all');
    if (onLand) fail(`${onLand} treats lie on an island's land after a stroke across it`);
    if (off > 2) fail(`a stroke across an island rolled ${off} treats off its line onto the shore (want at most the 2 in the shore band)`);
  }
}

// Koi. (k) the first `koi` fish (koiTouch on a coarse pointer) wear patches and no other fish does, the same patches
// whatever the world's seed and after a minute of swimming; each has 1 to 3 patches, placed 0.15 to 0.85 down the spine
// with radii 0.12 to 0.25 of the length, and every patch centre lies inside the body's half-width there. The patches
// are drawn clipped to the body path in drawFish, which has no headless seam; this checks the geometry it draws from.
{
  if (typeof M.koiPatches !== 'function' || typeof M.bodyWidth !== 'function') fail('(k) pond.js should export koiPatches and bodyWidth');
  else {
    const koiOf = (w) => w.fish.map((f, i) => (f.koi ? i : -1)).filter((i) => i >= 0);
    const sig = (w) => JSON.stringify(w.fish.map((f) => f.koi));
    for (const coarse of [false, true]) {
      const a = createWorld(defaults(), { w: 1440, h: 900, seed: 2, coarse }), b = createWorld(defaults(), { w: 1440, h: 900, seed: 19, coarse });
      const want = coarse ? a.params.koiTouch : a.params.koi, got = koiOf(a);
      if (got.length !== want || got.some((i, k) => i !== k)) fail(`(k) ${coarse ? 'coarse' : 'fine'} pointer: the first ${want} fish should be koi, koi are ${got.join(',')}`);
      if (sig(a) !== sig(b)) fail(`(k) ${coarse ? 'coarse' : 'fine'} pointer: koi patches should not depend on the world's seed`);
      const before = sig(a); for (let s = 0; s < 60 * 60; s++) step(a, DT);
      if (sig(a) !== before) fail('(k) a koi\'s patches should not change as it swims');
    }
    let bad = 0, worst = 0;
    for (let i = 0; i < 64; i++) {
      const P = M.koiPatches(i);
      if (P.length < 1 || P.length > 3) { bad++; continue; }
      for (const q of P) {
        worst = Math.max(worst, Math.abs(q.lat));
        if (!(q.u >= 0.15 && q.u <= 0.85 && q.rx >= 0.12 && q.rx <= 0.25 && q.ry <= q.rx && Math.abs(q.lat) <= 1)) bad++;
      }
    }
    metric(`koi: widest patch offset ${worst.toFixed(2)} of the half-width`);
    if (bad) fail(`(k) ${bad} koi patches fall outside 1 to 3 per fish, u 0.15..0.85, radius 0.12..0.25 of the length, or centre inside the half-width`);
    // and dropping the count in the dev panel takes the patches off at once
    const w = createWorld(defaults(), { w: 1440, h: 900, seed: 2 }); w.params.koi = 1; step(w, DT);
    if (koiOf(w).length !== 1) fail(`(k) after koi is set to 1 there should be one koi, there are ${koiOf(w).length}`);
  }
}

// Lily pads, on a 1440x900 page with two islands at seeds 2 and 19. (g) the pads are laid out on open water, 40 px
// clear of every coast and 30 px inside the edges, apart from each other, and through three simulated minutes of drift,
// ripples from treats dropped among them, cursor passes and a resize (given a second to settle), every pad stays on the
// water, on screen and clear of the others. (i) a pad drifts under 6 px/s except within 2 s of a ripple's push, and a
// ripple does push it, or (i) proves nothing. (h) a fast cursor pass through fish near the pads sends at least 2 of
// them to hide under a pad (head under it for a full second) within 6 s, once 4 fish have gathered within 180 px of
// a pad (the pass waits for them up to a minute; a school that never gathers there fails).
const padsOf = (w) => (Array.isArray(w.pads) ? w.pads : null);
for (const seed of [2, 19]) {
  const w = createWorld(defaults(), { w: 1440, h: 900, seed });
  setIslands(w, ISL2);
  const P = padsOf(w);
  if (!P) { fail(`seed ${seed}: (g) the world should carry lily pads (w.pads)`); continue; }
  const coarse = padsOf(createWorld(defaults(), { w: 1440, h: 900, seed, coarse: true }));
  if (P.length !== w.params.pads || coarse.length !== w.params.padsTouch) fail(`seed ${seed}: (g) want ${w.params.pads} pads on a fine pointer and ${w.params.padsTouch} on a coarse one, got ${P.length} and ${coarse.length}`);
  let spawnBad = 0;
  P.forEach((q, i) => {
    if (q.x < 30 + q.r || q.x > w.w - 30 - q.r || q.y < 30 + q.r || q.y > w.h - 30 - q.r) spawnBad++;
    else if (w.islands.some((o) => M.shoreGap(o, q.x, q.y, 40 + q.r) < 0)) spawnBad++;
    else if (P.some((o, j) => j !== i && Math.hypot(o.x - q.x, o.y - q.y) < o.r + q.r)) spawnBad++;
    if (!(q.r >= 10 && q.r <= 22)) spawnBad++;
  });
  if (spawnBad) fail(`seed ${seed}: (g) ${spawnBad} pads were laid out off open water, within 40 px of a coast, 30 px of an edge, on another pad, or outside 10 to 22 px radius`);
  let land = Infinity, edge = Infinity, apart = Infinity, clear = Infinity, calm = 0, pushed = 0, grace = 0;
  const prev = P.map((q) => [q.x, q.y]);
  for (let s = 0; s < 60 * 180; s++) {
    if (s % 600 === 300) { const q = P[(s / 600) % P.length | 0]; dropTreat(w, q.x + 25, q.y - 10); }
    const k = s % 420; setPointer(w, 100 + k * 40, 300 + (s % 840 < 420 ? 0 : 300), k < 30);
    if (s === 60 * 120) { M.resizeWorld(w, 1200, 780); grace = 60; }
    step(w, DT);
    if (grace > 0) { grace--; P.forEach((q, i) => { prev[i][0] = q.x; prev[i][1] = q.y; }); continue; }
    P.forEach((q, i) => {
      const v = Math.hypot(q.x - prev[i][0], q.y - prev[i][1]) / DT; prev[i][0] = q.x; prev[i][1] = q.y;
      if (q.since < 2) pushed = Math.max(pushed, v); else calm = Math.max(calm, v);
      for (const o of w.islands) { land = Math.min(land, M.shoreGap(o, q.x, q.y, q.r)); clear = Math.min(clear, M.shoreGap(o, q.x, q.y, 0)); }
      edge = Math.min(edge, q.x - q.r, w.w - q.r - q.x, q.y - q.r, w.h - q.r - q.y);
      for (let j = i + 1; j < P.length; j++) apart = Math.min(apart, Math.hypot(P[j].x - q.x, P[j].y - q.y) - P[j].r - q.r);
    });
  }
  const show = `seed ${seed}: pads' least water ${land.toFixed(1)} px, centre to coast ${clear.toFixed(1)} px, edge ${edge.toFixed(1)} px, gap ${apart.toFixed(1)} px; top drift ${calm.toFixed(2)} px/s, top pushed ${pushed.toFixed(2)} px/s`;
  metric(show);
  if (!(land >= -0.5 && edge >= -0.5 && apart >= -0.5)) fail(`${show}: (g) every pad should stay on the water, on screen and clear of the others`);
  if (!(calm < 6)) fail(`${show}: (i) a pad should drift under 6 px/s unless a ripple pushed it in the last 2 s`);
  if (!(pushed >= 7)) fail(`${show}: (i) a ripple should push a pad well past its drift`);
}
for (const seed of [2, 19]) {
  const w = createWorld(defaults(), { w: 1440, h: 900, seed });
  setIslands(w, ISL2);
  const P = padsOf(w);
  if (!P) { fail(`seed ${seed}: (h) the world should carry lily pads (w.pads)`); continue; }
  // the pads keep to their clusters, so the school may be elsewhere at 5 s: wait up to a minute for GATHER fish to be
  // near one, the precondition of the pass; a school that never gathers by the pads in a minute fails on its own
  const GATHER = 4, nearPad = () => w.fish.filter((f) => P.some((q) => Math.hypot(q.x - f.x, q.y - f.y) < 180)).length;
  for (let s = 0; s < 60 * 5 || (s < 60 * 60 && nearPad() < GATHER); s++) step(w, DT);
  if (nearPad() < GATHER) { fail(`seed ${seed}: (h) the school never gathered by the pads: ${nearPad()} fish within 180 px of a pad after a minute, want ${GATHER}`); continue; }
  const under = (f) => P.some((q) => Math.hypot(q.x - f.x, q.y - f.y) < q.r);
  // the pass goes through the fish near a pad with the most company within 100 px
  let at = null, most = -1;
  for (const f of w.fish) {
    if (!P.some((q) => Math.hypot(q.x - f.x, q.y - f.y) < 180)) continue;
    const c = w.fish.filter((g) => Math.hypot(g.x - f.x, g.y - f.y) < 100).length;
    if (c > most) { most = c; at = f; }
  }
  if (!at) { fail(`seed ${seed}: (h) no fish within 180 px of a pad in a minute`); continue; }
  const was = new Set(w.fish.filter(under)), run = new Map(), hid = new Set(), X = at.x, Y = at.y;
  for (let s = 0; s < 60 * 6; s++) {
    setPointer(w, X - 300 + s * 30, Y, s < 20);
    step(w, DT);
    for (const f of w.fish) {
      const n = under(f) ? (run.get(f) || 0) + 1 : 0; run.set(f, n);
      if (n >= 60 && !was.has(f)) hid.add(f);
    }
  }
  metric(`seed ${seed}: ${hid.size} fish hid under a pad within 6 s of a cursor pass through ${most} fish`);
  if (!(hid.size >= 2)) fail(`seed ${seed}: (h) a fast cursor pass through ${most} fish near the pads should send at least 2 under a pad within 6 s, sent ${hid.size}`);
}

// Lotus flowers, on a 1440x900 page with two islands at seeds 2 and 19. (m) `flowers` flowers (flowersTouch on a coarse
// pointer) each sit on a pad of their own, in different clusters, and through ten simulated minutes of drift and
// ripples each passes through bud, opening, open and closing and never leaves its pad (its centre stays inside it).
for (const seed of [2, 19]) {
  const p = defaults(); p.count = 4;
  const w = createWorld(p, { w: 1440, h: 900, seed }); setIslands(w, ISL2); step(w, DT);
  if (!Array.isArray(w.flowers)) { fail(`seed ${seed}: (m) the world should carry lotus flowers (w.flowers)`); continue; }
  const cw = createWorld(defaults(), { w: 1440, h: 900, seed, coarse: true }); setIslands(cw, ISL2); step(cw, DT);
  if (w.flowers.length !== p.flowers || cw.flowers.length !== p.flowersTouch) fail(`seed ${seed}: (m) want ${p.flowers} flowers on a fine pointer and ${p.flowersTouch} on a coarse one, got ${w.flowers.length} and ${cw.flowers.length}`);
  const k = new Set(w.pads.map((q) => q.cl)).size, cl = new Set(w.flowers.map((f) => f.q.cl)), own = new Set(w.flowers.map((f) => f.q));
  if (cl.size !== Math.min(k, w.flowers.length) || own.size !== w.flowers.length) fail(`seed ${seed}: (m) each flower should sit on a pad of its own in a different cluster`);
  const seen = w.flowers.map(() => new Set()), pads0 = w.flowers.map((f) => f.q);
  let off = 0, stray = 0;
  for (let s = 0; s < 60 * 600; s++) {
    if (s % 900 === 450) { const q = pads0[(s / 900 | 0) % pads0.length]; dropTreat(w, q.x + 25, q.y - 10); }
    step(w, DT);
    w.flowers.forEach((f, i) => { seen[i].add(f.stage); if (f.q !== pads0[i]) stray++; off = Math.max(off, Math.hypot(f.x - f.q.x, f.y - f.q.y) / f.q.r); });
  }
  const show = `seed ${seed}: flowers saw ${seen.map((S) => S.size).join(',')} of 4 stages in 10 min, farthest ${off.toFixed(2)} of a pad's radius from its centre`;
  metric(show);
  if (seen.some((S) => S.size < 4)) fail(`${show}: (m) every flower should pass through all four stages`);
  if (!(off < 1) || stray) fail(`${show}: (m) a flower should stay on its own pad`);
}

// Water striders, on a 1440x900 page with two islands at seeds 2 and 19. (n) `striders` striders (stridersTouch on a
// coarse pointer) through three simulated minutes of cursor passes and treats: every strider stays on open water (off
// the pads, 20 px off the land, 20 px inside the edges); each dart runs 20 to 60 px at the dart speed and starts exactly
// one dimple (a ripple of size 8 at the strider); with the cursor away every pause lasts 0.5 to 3 s; the cursor within
// 60 px sends a pausing strider darting away from it. Under reduced motion no strider moves and no dimple starts.
for (const seed of [2, 19]) {
  for (const cursor of [true, false]) {
    const p = defaults(); p.count = 12;
    const w = createWorld(p, { w: 1440, h: 900, seed }); setIslands(w, ISL2); step(w, DT);
    if (!Array.isArray(w.striders)) { fail(`seed ${seed}: (n) the world should carry water striders (w.striders)`); break; }
    if (cursor) { const cw = createWorld(defaults(), { w: 1440, h: 900, seed, coarse: true }); setIslands(cw, ISL2); step(cw, DT); if (w.striders.length !== p.striders || cw.striders.length !== p.stridersTouch) fail(`seed ${seed}: (n) want ${p.striders} striders on a fine pointer and ${p.stridersTouch} on a coarse one, got ${w.striders.length} and ${cw.striders.length}`); }
    const S = w.striders, seenR = new WeakSet(w.ripples);
    let pad = Infinity, land = Infinity, edge = Infinity, fast = 0, lenLo = Infinity, lenHi = 0, darts = 0, dimples = 0, stray = 0, pLo = Infinity, pHi = 0;
    const was = S.map((s) => s.dart), paused = S.map(() => 0), prev = S.map((s) => [s.x, s.y]), count = S.map((s) => s.darts);
    for (let s = 0; s < 60 * 180; s++) {
      if (cursor) { const k = s % 420; setPointer(w, 100 + k * 40, 300 + (s % 840 < 420 ? 0 : 300), k < 30); if (s % 600 === 300) dropTreat(w, 700, 450); }
      step(w, DT);
      const fresh = w.ripples.filter((g) => !seenR.has(g)); fresh.forEach((g) => seenR.add(g));
      for (const g of fresh) if (g.size === 8) { dimples++; if (!S.some((t) => Math.hypot(t.x - g.x, t.y - g.y) <= p.dart * DT + 1e-6)) stray++; }
      S.forEach((t, i) => {
        const v = Math.hypot(t.x - prev[i][0], t.y - prev[i][1]) / DT; prev[i][0] = t.x; prev[i][1] = t.y;
        if (t.dart || was[i]) fast = Math.max(fast, v);
        if (t.darts !== count[i]) { darts += t.darts - count[i]; count[i] = t.darts; lenLo = Math.min(lenLo, t.len); lenHi = Math.max(lenHi, t.len); if (!cursor && !was[i] && s > 0) { pLo = Math.min(pLo, paused[i]); pHi = Math.max(pHi, paused[i]); } paused[i] = 0; }
        else if (!t.dart) paused[i] += DT;
        was[i] = t.dart;
        for (const q of w.pads) pad = Math.min(pad, Math.hypot(q.x - t.x, q.y - t.y) - q.r);
        for (const o of w.islands) land = Math.min(land, M.shoreGap(o, t.x, t.y, 20));
        edge = Math.min(edge, t.x - 20, w.w - 20 - t.x, t.y - 20, w.h - 20 - t.y);
      });
    }
    const show = `seed ${seed} ${cursor ? 'with cursor and treats' : 'calm'}: striders' least pad gap ${pad.toFixed(1)} px, land ${land.toFixed(1)} px, edge ${edge.toFixed(1)} px; ${darts} darts of ${lenLo.toFixed(1)} to ${lenHi.toFixed(1)} px, top speed ${fast.toFixed(1)} px/s, ${dimples} dimples (${stray} away from a strider)${cursor ? '' : `, pauses ${pLo.toFixed(2)} to ${pHi.toFixed(2)} s`}`;
    metric(show);
    if (!(pad >= 3 && land >= -0.5 && edge >= -0.5)) fail(`${show}: (n) a strider should stay on open water, off the pads`);
    if (!(darts >= 20 && lenLo >= 20 && lenHi <= 60 && fast <= p.dart * 1.25)) fail(`${show}: (n) darts should run 20 to 60 px at the dart speed ${p.dart} px/s`);
    if (dimples !== darts || stray) fail(`${show}: (n) each dart should start exactly one dimple at the strider`);
    if (!cursor && !(pLo >= 0.5 - DT && pHi <= 3 + DT)) fail(`${show}: (n) a pause should last 0.5 to 3 s`);
  }
}
{
  const p = defaults(); p.count = 0;
  const w = createWorld(p, { w: 1440, h: 900, seed: 2 }); setIslands(w, ISL2); step(w, DT);
  // the strider with the most open water round it, so a dart away from the cursor has somewhere to go
  const room = (t) => Math.min(t.x, w.w - t.x, t.y, w.h - t.y, ...w.islands.map((o) => M.shoreGap(o, t.x, t.y, 0)), ...w.pads.map((q) => Math.hypot(q.x - t.x, q.y - t.y) - q.r));
  const s = w.striders && w.striders.slice().sort((a, b) => room(b) - room(a))[0];
  if (s) {
    s.dart = false; s.left = 10;
    setPointer(w, s.x + 30, s.y, true); step(w, DT);
    if (!s.dart || !(Math.cos(s.a) < 0)) fail(`(n) the cursor 30 px from a pausing strider should send it darting away (darting ${s.dart}, heading ${s.a.toFixed(2)})`);
    const r = createWorld(p, { w: 1440, h: 900, seed: 2, reduced: true }); setIslands(r, ISL2); step(r, DT);
    const at = r.striders.map((t) => [t.x, t.y]), rip = r.ripples.length;
    for (let k = 0; k < 60 * 20; k++) { setPointer(r, at[0][0] + 20, at[0][1], k % 60 < 5); step(r, DT); }
    const moved = Math.max(0, ...r.striders.map((t, i) => Math.hypot(t.x - at[i][0], t.y - at[i][1])));
    if (moved > 1e-6 || r.ripples.length !== rip) fail(`(n) under reduced motion striders should stay still and start no dimple: moved ${moved.toFixed(2)} px, ${r.ripples.length - rip} ripples`);
  }
}

// An island's outermost drawn extent at bearing t, bounded independently of the pond's own helper: the coast at the top
// of the swell (the low-swell coast S plus the swell's full span, rough times the mean radius), then the wider of
// the 36 px band of shallows and the outermost lapping ring (3 + reach px out; the two overlap, not stack). How far disc q's edge stands past it along the bearing to the island's centre,
// least over the islands.
const SHALLOW_BAND = 36;
function lowCoast(o, t) {
  const B = o.S.length; let u = (t / (2 * Math.PI)) * B; u -= Math.floor(u / B) * B;
  const i = Math.floor(u), f = u - i;
  return o.S[i % B] * (1 - f) + o.S[(i + 1) % B] * f;
}
const extent = (w, o, t) => lowCoast(o, t) + w.params.rough * o.mean + Math.max(SHALLOW_BAND, 3 + w.params.reach);
const beyond = (w, q) => Math.min(...w.islands.map((o) => Math.hypot(q.x - o.x, q.y - o.y) - q.r - extent(w, o, Math.atan2(q.y - o.y, q.x - o.x))));
// How far the live coast has risen past the top of the swell the bound assumes, at the tables' own bearings (0 or less).
const swellOver = (w) => Math.max(...w.islands.flatMap((o) => [...o.C].map((c, j) => c - o.S[j] - w.params.rough * o.mean)));

// The distance in use (w.plan.away, span, clear: the rung of awayLadder the stones were laid at). (t) it is a rung of
// awayLadder(rockAway), never below the old rule's floor of 60 px, the whole of rockAway on a 1920x1080 page, and the
// nearest it had to be: the rung before it does not lay every stone wanted (a world asked for that rung's distance as
// its rockAway tries that rung first, with the same draws, and must step down past it).
const ladderCheck = (w, tag, again) => {
  if (typeof M.awayLadder !== 'function' || !w.plan || typeof w.plan.away !== 'number') { fail(`${tag} (t) the pond should export awayLadder and the plan carry the distance in use (plan.away, span, clear)`); return; }
  const L = M.awayLadder(w.params.rockAway), same = (k, p) => k.away === p.away && k.span === p.span && k.clear === p.clear;
  const i = L.findIndex((k) => same(k, w.plan)), show = `${tag} stones laid at ${w.plan.away.toFixed(1)} px (rung ${i} of ${L.map((k) => k.away.toFixed(1)).join(', ')})`;
  metric(show);
  if (i < 0) fail(`${show}: (t) the distance in use should be a rung of awayLadder(rockAway)`);
  if (!(w.plan.away >= 60 - 1e-9)) fail(`${show}: (t) the distance in use should never fall below 60 px`);
  if (w.w === 1920 && w.h === 1080 && w.plan.away !== w.params.rockAway) fail(`${show}: (t) a 1920x1080 page should lay the stones at the whole of rockAway (${w.params.rockAway})`);
  if (i > 0) { const u = again(L[i - 1].away); if (same(L[i - 1], u.plan)) fail(`${show}: (t) the rung before (${L[i - 1].away.toFixed(1)} px) lays every stone wanted, so the stones should stand there`); }
};

// (u) The header band, on every page (p), (q) and (w) lay: the canvas runs under the site's opaque header, 56 px tall,
// so every stone's edge stands 80 px or more below the top of the page (the header plus an islet's outermost wave), and
// every islet's outermost drawn extent (its coast plus ISLET_OUTER, at 360 bearings) stays below the header. A stone
// the header hides is a stone the page does not have. The stones keep no foot band: the footer only overlaps.
const bandCheck = (w, tag) => {
  const R = w.rocks || [], top = Math.min(...R.map((q) => q.y - q.r));
  let wave = Infinity;
  for (const s of w.islets || []) for (let i = 0; i < 360; i++) { const t = (i / 360) * TAU; wave = Math.min(wave, s.y + Math.sin(t) * (M.coast(s, t) + (M.ISLET_OUTER || 0))); }
  const show = `${tag} ${R.length} stones, the highest edge ${top.toFixed(1)} px from the top of the page, the highest islet wave ${wave.toFixed(1)} px`;
  metric(show);
  if (!(top >= 80 - 1e-6 && wave >= 56)) fail(`${show}: (u) every stone's edge should stand 80 px or more below the top of the page and every islet's outermost wave below the 56 px header`);
};

// Stones, on a 1440x900 page with two islands at seeds 2 and 19. (p) `rocks` stones (rocksTouch on a coarse pointer),
// each 4 to 44 px with 5 to 7 vertices, stand as laid 20 px inside the screen edge; every stone's edge stands the
// distance in use (plan.clear: the rung's distance, 24 px at the floor) or more past its island's outermost drawn
// extent at high swell (the coast at the top of the swell, the shallows and the lapping rings); two may overlap as circles (the stones draw inside their circles,
// so two that touch do) but never by more than 35 percent of the smaller one's radius. Through 70 simulated
// seconds of cursor passes and treats dropped beside the stones, after the first 10 s no fish's head or body comes
// within a stone's radius, and no pad or strider ever stands on one.
for (const seed of [2, 19]) {
  const lay = (away) => { const p = defaults(); if (away != null) p.rockAway = away; const u = createWorld(p, { w: 1440, h: 900, seed }); setIslands(u, ISL2); step(u, DT); return u; };
  const w = lay();
  const R = Array.isArray(w.rocks) ? w.rocks : null;
  if (!R) { fail(`seed ${seed}: (p) the world should carry stones (w.rocks)`); continue; }
  ladderCheck(w, `1440x900 seed ${seed}:`, lay);
  const coarse = createWorld(defaults(), { w: 1440, h: 900, seed, coarse: true }); setIslands(coarse, ISL2); step(coarse, DT);
  bandCheck(w, `1440x900 seed ${seed}:`); bandCheck(coarse, `1440x900 coarse seed ${seed}:`);
  if (R.length !== w.params.rocks || coarse.rocks.length !== w.params.rocksTouch) fail(`seed ${seed}: (p) want ${w.params.rocks} stones on a fine pointer and ${w.params.rocksTouch} on a coarse one, got ${R.length} and ${coarse.rocks.length}`);
  let bad = 0, land = Infinity, edge = Infinity, over = -Infinity;
  R.forEach((q, i) => {
    if (!(q.r >= 4 && q.r <= 44) || !(q.k.length >= 5 && q.k.length <= 7)) bad++;
    land = Math.min(land, beyond(w, q));
    edge = Math.min(edge, q.x - q.r, w.w - q.r - q.x, q.y - q.r, w.h - q.r - q.y);
    for (let j = i + 1; j < R.length; j++) { const o = R[j]; over = Math.max(over, (q.r + o.r - Math.hypot(o.x - q.x, o.y - q.y)) / Math.min(q.r, o.r)); }
  });
  let near = Infinity, padOn = Infinity, strOn = Infinity, landRun = Infinity;
  for (let s = 0; s < 60 * 70; s++) {
    if (s % 600 === 300) { const q = R[(s / 600) % R.length | 0]; dropTreat(w, q.x + q.r + 30, q.y); }
    const k = s % 420; setPointer(w, 100 + k * 40, 300 + (s % 840 < 420 ? 0 : 300), k < 30);
    step(w, DT);
    if (s < 600) continue;
    for (const q of R) {
      for (const f of w.fish) for (let m = 0; m < f.rope.length; m += 2) near = Math.min(near, Math.hypot(f.rope[m] - q.x, f.rope[m + 1] - q.y) - q.r);
      for (const o of w.pads) padOn = Math.min(padOn, Math.hypot(o.x - q.x, o.y - q.y) - o.r - q.r);
      for (const o of w.striders) strOn = Math.min(strOn, Math.hypot(o.x - q.x, o.y - q.y) - q.r);
      if (s % 60 === 0) landRun = Math.min(landRun, beyond(w, q));
    }
  }
  const show = `seed ${seed}: ${R.length} stones, edges at least ${land.toFixed(1)} px past the islands' outermost drawn extent at high swell (${landRun.toFixed(1)} px through the run), ${edge.toFixed(1)} px inside the edge, overlapping at most ${(Math.max(0, over) * 100).toFixed(0)}% of the smaller; after 10 s the fish came within ${near.toFixed(1)} px of a stone's edge, pads ${padOn.toFixed(1)} px, striders ${strOn.toFixed(1)} px`;
  metric(show);
  if (bad) fail(`${show}: (p) ${bad} stones outside 4 to 44 px or 5 to 7 vertices`);
  const away = w.plan && w.plan.clear;
  if (!(land >= away - 1e-6 && landRun >= away - 1e-6 && edge >= 20 && over <= 0.35 + 1e-9)) fail(`${show}: (p) every stone's edge should stand the distance in use (${away}) px past the islands' outermost drawn extent at high swell, all 20 px inside the edge, overlapping by at most 35 percent`);
  if (!(near >= 0 && padOn >= -0.5 && strOn >= 0)) fail(`${show}: (p) no fish, pad or strider should stand on a stone`);
}

// The layout, at seeds 2 and 19 on 1920x1080 and 1280x720 pages with the two islands placed in proportion. (q) after
// 60 simulated seconds of drift: the outcrop holds 3 to 5 stones; every pad's edge stands 24 px or more and every
// stone's the distance in use (plan.clear) or more past the islands' outermost drawn extent at high swell (the pads
// sampled every half second through the drift, and the live coast never rising past the top of the swell the bound
// assumes), and the outcrop's nearest edge plan.away to plan.away + plan.span px past it (140 to 220 at rockAway's
// default, 60 to 100 at the floor), so it belongs to that shore with open water between its waves and the island's; (t)
// holds for the distance in use; no pad
// comes within 90 px of a stone (edge to edge); no cluster's centre (a pad cluster's, or the stone group's in open
// water) lies within 60 px of a coast, and no pad cluster's centre within 90 px of the screen's edge; no pad or
// stone lies within 30 px of the screen's edge, and no pad on the land. Unless the plan reports that it gave way
// (plan.gaveWay: no room for the whole composition), the stones stand in two groups and the pads' centroid and the
// stones' lie on opposite sides of the screen's middle.
for (const [W, H] of [[1920, 1080], [1280, 720]]) for (const seed of [2, 19]) {
  const lay = (away) => { const p = defaults(); if (away != null) p.rockAway = away; const u = createWorld(p, { w: W, h: H, seed }); setIslands(u, ISL2.map((b) => ({ x: (b.x * W) / 1440, y: (b.y * H) / 900, w: (b.w * W) / 1440, h: (b.h * H) / 900 }))); return u; };
  const w = lay();
  step(w, DT); ladderCheck(w, `${W}x${H} seed ${seed}:`, (a) => { const u = lay(a); step(u, DT); return u; });
  bandCheck(w, `${W}x${H} seed ${seed}:`);
  let padClear = Infinity, swellUp = -Infinity;
  for (let s = 0; s < 60 * 60; s++) {
    step(w, DT);
    if (s % 30 === 29) { for (const q of w.pads || []) padClear = Math.min(padClear, beyond(w, q)); swellUp = Math.max(swellUp, swellOver(w)); }
  }
  const R = w.rocks || [], P = w.pads || [];
  if (!R.length || !P.length || R.some((q) => q.grp == null) || P.some((q) => q.cl == null)) { fail(`${W}x${H} seed ${seed}: (q) the stones and the pads should carry their groups (grp, cl)`); continue; }
  const gap = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) - a.r - b.r;
  const land = (x, y, g) => Math.min(...w.islands.map((o) => M.shoreGap(o, x, y, g)));
  const mean = (L) => ({ x: L.reduce((a, q) => a + q.x, 0) / L.length, y: L.reduce((a, q) => a + q.y, 0) / L.length });
  let padRock = Infinity;
  for (const q of P) for (const o of R) padRock = Math.min(padRock, gap(q, o));
  const centres = [...new Set(P.map((q) => q.cl))].map((c) => mean(P.filter((q) => q.cl === c))), group = R.filter((q) => q.grp === 1), crop = R.filter((q) => q.grp === 0);
  const padEdge = Math.min(...centres.map((c) => Math.min(c.x, W - c.x, c.y, H - c.y)));
  if (group.length) centres.push(mean(group));
  const centreCoast = Math.min(...centres.map((c) => land(c.x, c.y, 0)));
  let edge = Infinity, onLand = Infinity;
  const calm = (q) => Math.min(...w.islands.map((o) => M.calmGap(o, q.x, q.y, q.r)));
  for (const q of [...P, ...R]) edge = Math.min(edge, q.x - q.r, W - q.r - q.x, q.y - q.r, H - q.r - q.y);
  for (const q of P) onLand = Math.min(onLand, land(q.x, q.y, q.r));
  const rockClear = Math.min(...R.map((q) => beyond(w, q))), cropNear = Math.min(...crop.map((q) => beyond(w, q)));
  const mid = (c) => (W >= H ? c.x - W / 2 : c.y - H / 2), pm = mid(mean(P)), rm = mid(mean(R));
  const show = `${W}x${H} seed ${seed}: ${w.plan && w.plan.gaveWay ? 'gave way; ' : ''}${crop.length} stones in the outcrop (nearest edge ${cropNear.toFixed(1)} px past the outermost drawn extent at high swell; every stone ${rockClear.toFixed(1)}, every pad ${padClear.toFixed(1)} through the drift; live coast ${swellUp.toFixed(2)} px over the swell's top) and ${group.length} in open water, ${P.length} pads in ${centres.length - (group.length ? 1 : 0)} clusters; pad to stone ${padRock.toFixed(1)} px, cluster centre to coast ${centreCoast.toFixed(1)} px, pad cluster centre to edge ${padEdge.toFixed(1)} px, edge ${edge.toFixed(1)} px, pads to land ${onLand.toFixed(1)} px; centroids ${pm.toFixed(0)} px (pads) and ${rm.toFixed(0)} px (stones) off the middle`;
  metric(show);
  const { away, span, clear } = w.plan || {};
  if (!(crop.length >= 3 && crop.length <= 5 && rockClear >= clear - 1e-6 && padClear >= 24 - 1e-6 && cropNear >= away - 1e-6 && cropNear <= away + span && swellUp <= 0.01)) fail(`${show}: (q) the outcrop should hold 3 to 5 stones, every pad's edge 24 px and every stone's the distance in use (${clear}) px past the islands' outermost drawn extent at high swell, the outcrop's nearest ${away} to ${away + span} px past it`);
  if (!(padRock >= 90 && centreCoast >= 60 && padEdge >= 90 && edge >= 30 && onLand >= 0)) fail(`${show}: (q) pads 90 px off the stones, cluster centres 60 px off the coasts and pad cluster centres 90 px off the edge, nothing within 30 px of the edge, no pad on the land`);
  const gave = !!(w.plan && w.plan.gaveWay);
  if (!gave && !group.length) fail(`${show}: (q) with room for the whole composition the stones should stand in two groups`);
  if (!gave && !(pm * rm < 0)) fail(`${show}: (q) the pads and the stones should sit on opposite sides of the middle`);
}

// The islets, at seeds 2 and 19 on 1920x1080 and 1280x720 pages laid as in (q). (w) each group of stones is one islet
// (w.islets: its stones and a coast in the islands' representation, a radius per bearing round a centre, read by
// coast()); every stone belongs to the islet of its group; the coast holds every vertex of its stones (the vertex no
// farther from the centre than the coast at its bearing, to 1e-3 px; the drawn stone lies inside its vertices); the
// coast is smooth: the largest second difference of the radius over three neighbouring bearings is under 0.03 of the
// islet's mean radius. A corner is a jump in the radius's slope, not a large step, so the second difference is what
// tells it: the old convex-hull profile of the same stones measured 0.066 to 0.21 on seeds 2,19,3,7,11 at three page
// sizes, the blurred coast at most 0.011. The islet's outermost drawn extent (ISLET_OUTER px past the coast) stands
// short of every island's outermost drawn extent at high swell, so open water lies between the islet's waves and the
// island's; two worlds of one seed lay the same stones and coasts; and moving rockAway lays the stones again on its
// new ladder, every stone the distance in use past the islands.
const isletLay = (W, H, seed) => { const w = createWorld(defaults(), { w: W, h: H, seed }); setIslands(w, ISL2.map((b) => ({ x: (b.x * W) / 1440, y: (b.y * H) / 900, w: (b.w * W) / 1440, h: (b.h * H) / 900 }))); step(w, DT); return w; };
for (const [W, H] of [[1920, 1080], [1280, 720]]) for (const seed of [2, 19]) {
  const w = isletLay(W, H, seed), tag = `${W}x${H} seed ${seed}:`, S = w.islets;
  if (!Array.isArray(S) || !S.length || typeof M.ISLET_OUTER !== 'number') { fail(`${tag} (w) the world should carry its islets (w.islets) and the pond their outermost reach (ISLET_OUTER)`); continue; }
  let member = true, holds = true, bend = 0, open = Infinity;
  for (const q of w.rocks) member &&= S.filter((s) => s.rocks.includes(q) && s.grp === q.grp).length === 1;
  for (const s of S) {
    for (const q of s.rocks) q.t.forEach((t, k) => { const vx = q.x + Math.cos(t) * q.r * q.k[k] - s.x, vy = q.y + Math.sin(t) * q.r * q.k[k] - s.y; if (Math.hypot(vx, vy) > M.coast(s, Math.atan2(vy, vx)) + 1e-3) holds = false; });
    const n = s.C.length;
    for (let i = 0; i < n; i++) bend = Math.max(bend, Math.abs(s.C[i] - 2 * s.C[(i + 1) % n] + s.C[(i + 2) % n]) / s.mean);
    for (let i = 0; i < 360; i++) {
      const t = (i / 360) * TAU, R = M.coast(s, t) + M.ISLET_OUTER, x = s.x + Math.cos(t) * R, y = s.y + Math.sin(t) * R;
      for (const o of w.islands) open = Math.min(open, Math.hypot(x - o.x, y - o.y) - extent(w, o, Math.atan2(y - o.y, x - o.x)));
    }
  }
  const same = (u) => JSON.stringify({ r: u.rocks, h: u.islets.map((s) => [s.grp, s.x, s.y, [...s.C], s.ph]) });
  const twin = same(isletLay(W, H, seed)) === same(w);
  w.params.rockAway += 40; for (let s = 0; s < 60; s++) step(w, DT);
  const moved = Math.min(...w.rocks.map((q) => beyond(w, q))), L = typeof M.awayLadder === 'function' ? M.awayLadder(w.params.rockAway) : [];
  const relaid = !!w.plan && L.some((k) => k.away === w.plan.away && k.span === w.plan.span && k.clear === w.plan.clear) && moved >= w.plan.clear - 1e-6;
  const show = `${tag} ${S.length} islets of ${S.map((s) => s.rocks.length).join('+')} stones, coast bend ${bend.toFixed(4)} of the mean radius, outermost wave ${open.toFixed(1)} px short of the islands' outermost drawn extent; rockAway raised to ${w.params.rockAway}, stones laid at ${w.plan && w.plan.away != null ? w.plan.away.toFixed(1) : '?'}, ${moved.toFixed(1)} px past it`;
  metric(show);
  if (!member) fail(`${show}: (w) every stone should belong to exactly the islet of its group`);
  if (!holds) fail(`${show}: (w) each islet's coast should hold every vertex of its stones`);
  if (!(bend < 0.03)) fail(`${show}: (w) each islet's coast should be smooth, its largest second difference under 0.03 of its mean radius`);
  if (!(open > 0)) fail(`${show}: (w) an islet's outermost wave should stand short of every island's outermost drawn extent`);
  if (!twin) fail(`${show}: (w) two worlds of one seed should lay the same stones and islets`);
  if (!relaid) fail(`${show}: (w) moving rockAway should lay the stones again on its ladder, at the distance in use`);
}

// (r) The pond floor, at seeds 2 and 19 on 1920x1080 and 1280x720 pages with the two islands placed in proportion, once
// the plan is laid round them, and once on a coarse pointer: as many leaves and branches as the params ask; each leaf
// 10 to 16 px, the branch 50 to 90 px with 1 or 2 forks; every thing, measured from its own drawn shape, 12 px or more
// past the islands' outermost drawn extent, 30 px off every stone and every pad's home, 30 px inside the screen, and
// clear of the top 80 px and the bottom 100 px; and two worlds of one seed lay the same floor.
const floorReach = (q) => {
  if (q.kind === 'leaf') return 0.65 * q.L; // the stalk runs 0.15 L past the tip; the blade's control points lie inside
  return Math.max(...q.outline.map((p) => Math.hypot(p[0], p[1]))); // the branch: its drawn outline
};
for (const [W, H, coarse] of [[1920, 1080, false], [1280, 720, false], [1920, 1080, true]]) for (const seed of [2, 19]) {
  if (coarse && seed === 19) continue;
  const lay = () => {
    const w = createWorld(defaults(), { w: W, h: H, seed, coarse });
    setIslands(w, ISL2.map((b) => ({ x: (b.x * W) / 1440, y: (b.y * H) / 900, w: (b.w * W) / 1440, h: (b.h * H) / 900 })));
    for (let s = 0; s < 120; s++) step(w, DT);
    return w;
  };
  const w = lay(), p = w.params, F = w.floor || [];
  const tag = `${W}x${H}${coarse ? ' coarse' : ''} seed ${seed}: (r)`;
  const count = (k) => F.filter((q) => q.kind === k).length;
  const want = [coarse ? p.leavesTouch : p.leaves, p.branch];
  const have = [count('leaf'), count('branch')];
  if (have.join() !== want.join()) { fail(`${tag} the floor should hold ${want.join('/')} leaves/branches, holds ${have.join('/')}`); continue; }
  let land = Infinity, near = Infinity, edge = Infinity, band = Infinity, shape = true;
  for (const q of F) {
    const R = floorReach(q), d = { x: q.x, y: q.y, r: R };
    land = Math.min(land, beyond(w, d));
    for (const o of w.rocks) near = Math.min(near, Math.hypot(o.x - q.x, o.y - q.y) - o.r - R);
    for (const o of w.pads) near = Math.min(near, Math.hypot(o.hx - q.x, o.hy - q.y) - o.r - R);
    edge = Math.min(edge, q.x - R, W - q.x - R, q.y - R, H - q.y - R);
    band = Math.min(band, q.y - R - 80, H - 100 - q.y - R);
    if (q.kind === 'leaf') shape &&= q.L >= 10 && q.L <= 16;
    if (q.kind === 'branch') { const m = q.lines[0], L = Math.hypot(m[4] - m[0], m[5] - m[1]); shape &&= L >= 50 - 1e-9 && L <= 90 + 1e-9 && q.lines.length >= 2 && q.lines.length <= 3; }
  }
  metric(`${tag} floor land ${land.toFixed(1)} near ${near.toFixed(1)} edge ${edge.toFixed(1)} band ${band.toFixed(1)}`);
  if (!(land >= 12 - 1e-6 && near >= 30 - 1e-6 && edge >= 30 - 1e-6 && band >= -1e-6)) fail(`${tag} every floor thing should stand 12 px past the islands' extent (${land.toFixed(1)}), 30 px off stones and pads (${near.toFixed(1)}), 30 px inside the screen (${edge.toFixed(1)}) and clear of the header and footer bands (${band.toFixed(1)})`);
  if (!shape) fail(`${tag} a floor thing is out of its size range`);
  if (JSON.stringify(lay().floor) !== JSON.stringify(F)) fail(`${tag} two worlds of one seed should lay the same floor`);
}

// (s) The hatch on the water. One seed gives the same marks twice and three seeds give three sets, so each load differs.
// The marks are anchored in the world: a page holds every dash anchored within HATCH_REACH of it (x in [-reach,
// W + reach), y likewise), so an 800x600 page's marks are exactly those of the same seed's 1440x900 page so anchored,
// and a resize shows more of the same picture. Every point of a dash lies within the reach of its anchor and its length
// within 10 to 34 px; over five seeds a 1440x900 page holds 2000 to 2600 dashes at the default jitter. The marks draw
// on no stream of the world's: a world stepped after marks were made from its seed is the world stepped without them.
// The hatch is an even field over the whole page, so cut a 1440x900 page into a 6 x 4 grid of tiles and every tile
// holds within 15 percent of the mean count of strokes (by each stroke's midpoint), for five seeds, strict and at the
// default jitter. At jitter 0 it is a strict lattice: every dash one length and level, and the rows on one pitch (each
// gap between neighbouring rows the same). The defaults are 0.05 alpha and a jitter in [0, 1].
{
  const { waterMarks, drawMarks, HATCH_REACH: R } = M;
  if (typeof waterMarks !== 'function' || typeof drawMarks !== 'function' || !(R > 0)) fail('(s) pond.js should export waterMarks, drawMarks and HATCH_REACH, the hatch on the water');
  else {
    const p = defaults(), key = (ms) => ms.map((m) => JSON.stringify(m)).sort().join('\n'), marks = (seed, W, H) => waterMarks(seed, W, H, 1);
    if (p.markAlpha !== 0.05 || !(p.markJitter >= 0 && p.markJitter <= 1)) fail(`(s) the defaults should be the hatch at alpha 0.05 with a markJitter in [0, 1]; got alpha ${p.markAlpha}, jitter ${p.markJitter}`);
    if (key(marks(5, 800, 600)) !== key(marks(5, 800, 600))) fail('(s) one seed should give the same marks twice');
    const three = [3, 4, 1234567].map((s) => key(marks(s, 800, 600)));
    if (three[0] === three[1] || three[0] === three[2] || three[1] === three[2]) fail('(s) three seeds should give three different sets of marks');
    const small = marks(9, 800, 600), inner = marks(9, 1440, 900).filter((m) => m.x >= -R && m.x < 800 + R && m.y >= -R && m.y < 600 + R);
    if (!small.length || key(small) !== key(inner)) fail(`(s) an 800x600 page's marks should be exactly the 1440x900 page's marks anchored within ${R} px of it; ${small.length} vs ${inner.length}`);
    for (const seed of [1, 2, 19, 77, 4242]) {
      const ms = marks(seed, 1440, 900); let far = 0, lo = Infinity, hi = 0;
      for (const m of ms) {
        let L = 0; for (let i = 0; i < m.pts.length; i += 2) { far = Math.max(far, Math.hypot(m.pts[i] - m.x, m.pts[i + 1] - m.y)); if (i) L += Math.hypot(m.pts[i] - m.pts[i - 2], m.pts[i + 1] - m.pts[i - 1]); }
        lo = Math.min(lo, L); hi = Math.max(hi, L);
      }
      metric(`seed ${seed} (s) hatch: ${ms.length} strokes, length ${lo.toFixed(1)}..${hi.toFixed(1)}, farthest point ${far.toFixed(1)} px`);
      if (far > R + 1e-9) fail(`seed ${seed}: (s) every point should lie within ${R} px of its mark's anchor, one lies ${far.toFixed(2)} px off`);
      if (ms.length && !(lo >= 10 - 1e-9 && hi <= 34 + 1e-9)) fail(`seed ${seed}: (s) strokes should be 10 to 34 px long, got ${lo.toFixed(2)}..${hi.toFixed(2)}`);
      if (!(ms.length >= 2000 && ms.length <= 2600)) fail(`seed ${seed}: (s) a 1440x900 page should hold 2000 to 2600 strokes, got ${ms.length}`);
    }
    const run = (first) => { const w = createWorld(defaults(), { w: 1440, h: 900, seed: 31 }); setIslands(w, ISL2); if (first) marks(w.seed, 1440, 900); for (let s = 0; s < 240; s++) step(w, DT); return JSON.stringify([w.fish, w.pads, w.floor]); };
    if (run(false) !== run(true)) fail('(s) making marks from a world\'s seed should leave the world\'s steps unchanged');
    for (const j of [0, p.markJitter ?? 0.35]) for (const seed of [1, 2, 19, 77, 4242]) {
      const ms = waterMarks(seed, 1440, 900, 1, j), tiles = new Array(24).fill(0);
      for (const { pts } of ms) { const mx = (pts[0] + pts[2]) / 2, my = pts[1]; if (mx >= 0 && mx < 1440 && my >= 0 && my < 900) tiles[Math.floor(my / 225) * 6 + Math.floor(mx / 240)]++; }
      const mean = tiles.reduce((a, b) => a + b, 0) / 24, worst = Math.max(...tiles.map((t) => Math.abs(t - mean) / mean));
      metric(`seed ${seed} (s) hatch at jitter ${j}: ${ms.length} strokes, tiles ${Math.min(...tiles)}..${Math.max(...tiles)} about a mean of ${mean.toFixed(1)}, worst ${(worst * 100).toFixed(1)} percent off`);
      if (!(mean > 0 && worst <= 0.15)) fail(`seed ${seed}: (s) at jitter ${j} every tile of the hatch should hold within 15 percent of the mean ${mean.toFixed(1)} strokes, one is ${(worst * 100).toFixed(1)} percent off`);
      if (j === 0) {
        const lens = new Set(ms.map(({ pts }) => (pts[2] - pts[0]).toFixed(6))), level = ms.every(({ pts }) => pts.length === 4 && pts[1] === pts[3]);
        const rows = [...new Set(ms.map(({ pts }) => pts[1]))].sort((a, b) => a - b), gaps = new Set(rows.slice(1).map((y, i) => (y - rows[i]).toFixed(6)));
        if (lens.size !== 1 || !level || gaps.size !== 1) fail(`seed ${seed}: (s) at jitter 0 the hatch should be a strict lattice, one length and one row pitch; got ${lens.size} lengths, ${gaps.size} row gaps, level ${level}`);
      }
    }
  }
}

if (failures.length) { for (const f of failures) console.error('FAIL ' + f); process.exit(1); }
console.log('check-pond: stroke, islands, treats, reduced motion, koi, lily pads, flowers, striders, stones and their layout, the islets, the pond floor, the marks on the water hold');
