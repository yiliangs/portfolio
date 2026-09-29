// Checks pond.js's simulation headless: the swimming stroke, the islands, the treats, and reduced motion.
//
// The pond's step() is a function of the world, dt and the world's own seeded random source, so every run below is
// the same run every time. None of these properties shows in a still frame: a fish that clips an island for one frame,
// a school that circles a treat without ever taking it, or a reduced-motion school that still bursts all look fine in
// a screenshot and wrong in motion.
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
// (d) groups meet and part: at least 4 merges and 4 splits a minute; (e) partners change: at least half of the fish
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
for (const seed of [2, 19]) {
  const m = fissionMetrics(seed);
  const show = `seed ${seed}: ${m.merges.toFixed(1)} merges and ${m.splits.toFixed(1)} splits a minute, turnover ${(m.turnover * 100).toFixed(0)}%, collapsed ${(m.collapsed * 100).toFixed(0)}% of samples, ${(m.grouped * 100).toFixed(0)}% of fish grouped, ${m.cells}/9 cells, polarisation ${m.polarisation.toFixed(2)}`;
  metric(show);
  if (!(m.merges >= 4 && m.splits >= 4)) fail(`${show}: (d) groups should merge and split at least 4 times a minute each`);
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
    const off = w.treats.filter((t) => Math.abs(t.y - y0) > 1).length, onLand = w.treats.filter((t) => islandAt(w, t.x, t.y) >= 0).length;
    if (!w.treats.length) fail('a stroke across open water and an island laid no treats at all');
    if (onLand) fail(`${onLand} treats lie on an island's land after a stroke across it`);
    if (off > 2) fail(`a stroke across an island rolled ${off} treats off its line onto the shore (want at most the 2 in the shore band)`);
  }
}

if (failures.length) { for (const f of failures) console.error('FAIL ' + f); process.exit(1); }
console.log('check-pond: stroke, islands, treats and reduced motion hold');
