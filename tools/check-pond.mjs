// Checks pond.js's simulation headless: the swimming stroke, the islands, the treats, and reduced motion.
//
// The pond's step() is a function of the world, dt and the world's own seeded random source, so every run below is
// the same run every time. None of these properties shows in a still frame: a fish that clips an island for one frame,
// a school that circles a treat without ever taking it, or a reduced-motion school that still bursts all look fine in
// a screenshot and wrong in motion.
//
// Run with `npm run check`. Exits non-zero and prints every failure it found.

import { defaults, createWorld, step, setIslands, setPointer, dropTreat, strokeStart, strokeTo, strokeEnd, strokeCancel, envelope, beatHz, lateral, shoreR, coast, islandsFrom, MARGIN } from '../pond.js';

const failures = [];
const fail = (msg) => failures.push(msg);
const DT = 1 / 60;

// (a) the stroke: the tail sweeps wider than the head, and a faster fish beats faster
{
  const p = defaults();
  if (!(envelope(1) > envelope(0) * 3)) fail(`tail amplitude ${envelope(1)} should far exceed head amplitude ${envelope(0)}`);
  let peak = 0; for (let ph = 0; ph < Math.PI * 2; ph += 0.01) peak = Math.max(peak, Math.abs(lateral(1, ph, 5)));
  let head = 0; for (let ph = 0; ph < Math.PI * 2; ph += 0.01) head = Math.max(head, Math.abs(lateral(0, ph, 5)));
  if (!(peak > head)) fail(`lateral sweep at the tail ${peak.toFixed(2)} should exceed the head ${head.toFixed(2)}`);
  const slow = beatHz(p.cruise, p.length, p), fast = beatHz(p.cruise * p.burst, p.length, p);
  if (!(fast > slow * 2)) fail(`beat rate should scale with speed: ${slow.toFixed(2)} Hz at cruise, ${fast.toFixed(2)} Hz at burst`);
  const a = beatHz(40, 24, p) - beatHz(20, 24, p), b = beatHz(60, 24, p) - beatHz(40, 24, p);
  if (Math.abs(a - b) > 1e-9) fail('beat rate should rise linearly with speed');
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

// the islands are organic, not ellipses, keep their shape wherever the page puts them, and hold the object on land
{
  const [a] = islandsFrom([{ x: 0, y: 0, w: 200, h: 200 }]), [b] = islandsFrom([{ x: 500, y: 90, w: 200, h: 200 }]);
  let lo = Infinity, hi = 0, same = true;
  for (let k = 0; k < 360; k++) {
    const t = (k / 360) * Math.PI * 2, r = coast(a, t);
    lo = Math.min(lo, r); hi = Math.max(hi, r);
    if (Math.abs(r - coast(b, t)) > 1e-9) same = false;
  }
  if (!(hi / lo > 1.2)) fail(`island coast should be irregular: radius ranges only ${lo.toFixed(1)} to ${hi.toFixed(1)} on a square box`);
  if (!(lo >= 100 + MARGIN - 1e-9)) fail(`island coast should clear the box's own ellipse plus the margin, narrowest ${lo.toFixed(1)}`);
  if (!same) fail('an island should keep its shape when the page moves it');
  const [, c2] = islandsFrom([{ x: 0, y: 0, w: 200, h: 200 }, { x: 0, y: 0, w: 200, h: 200 }]);
  let differ = false; for (let k = 0; k < 36; k++) if (Math.abs(coast(c2, k / 5.7) - coast(a, k / 5.7)) > 1) differ = true;
  if (!differ) fail('the two islands should have different coasts');
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

// Shoals that patrol. One seeded minute on a 1440x900 page with two islands, sampled twice a second after a
// settling spell. A cluster is a connected group of fish linked within three body lengths, and it counts as a shoal
// once it holds three fish: a pair is not a shoal. What has to read: (1) several shoals at once, not one loose school
// and not a scatter, (2) each shoal swimming as one while it travels, (3) the shoals ranging over the whole pond
// rather than milling where they started, and (4) a visibly busier pond than the calm first version, whose cruise was
// 26 px/s. SPEED_FLOOR is that line.
export const SPEED_FLOOR = 36;
export function patrolMetrics(seed) {
  const w = createWorld(defaults(), { w: 1440, h: 900, seed });
  setIslands(w, [{ x: 300, y: 250, w: 170, h: 340 }, { x: 900, y: 330, w: 240, h: 240 }]);
  const link = 3 * w.params.length, link2 = link * link;
  let frames = 0, good = 0, polSum = 0, polN = 0, speedSum = 0, speedN = 0, grouped = 0, fishSeen = 0;
  const cells = new Set();
  for (let s = 0; s < 60 * 60; s++) {
    step(w, DT);
    if (s < 60 * 5 || s % 30) continue;
    const F = w.fish, n = F.length, id = new Int32Array(n).fill(-1);
    let clusters = 0;
    for (let i = 0; i < n; i++) {
      if (id[i] >= 0) continue;
      const stack = [i], members = []; id[i] = i;
      while (stack.length) { const a = stack.pop(); members.push(a); for (let j = 0; j < n; j++) if (id[j] < 0) { const dx = F[j].x - F[a].x, dy = F[j].y - F[a].y; if (dx * dx + dy * dy < link2) { id[j] = i; stack.push(j); } } }
      if (members.length < 3) continue;
      clusters++; grouped += members.length;
      let cx = 0, cy = 0, hx = 0, hy = 0, sp = 0;
      for (const m of members) { cx += F[m].x; cy += F[m].y; hx += Math.cos(F[m].h); hy += Math.sin(F[m].h); sp += F[m].sp; }
      const k = members.length; cx /= k; cy /= k; sp /= k;
      cells.add(Math.min(2, Math.floor((cx / w.w) * 3)) * 3 + Math.min(2, Math.floor((cy / w.h) * 3)));
      if (sp >= SPEED_FLOOR) { polSum += Math.hypot(hx, hy) / k; polN++; } // travelling
    }
    for (const f of F) { speedSum += f.sp; speedN++; }
    fishSeen += n; frames++;
    if (clusters >= 3 && clusters <= 7) good++;
  }
  return { clustered: good / frames, polarisation: polN ? polSum / polN : 0, cells: cells.size, speed: speedSum / speedN, grouped: grouped / fishSeen };
}
for (const seed of [2, 19]) {
  const m = patrolMetrics(seed);
  const show = `seed ${seed}: 3-7 shoals in ${(m.clustered * 100).toFixed(0)}% of frames, polarisation ${m.polarisation.toFixed(2)}, ${m.cells}/9 cells, mean speed ${m.speed.toFixed(1)} px/s, ${(m.grouped * 100).toFixed(0)}% of fish in shoals`;
  if (process.env.POND_METRICS) console.log(show);
  if (!(m.clustered >= 0.8)) fail(`${show}: 3 to 7 shoals should show in at least 80% of frames`);
  if (!(m.polarisation >= 0.7)) fail(`${show}: a travelling shoal should hold polarisation 0.7`);
  if (!(m.cells >= 7)) fail(`${show}: the shoals should visit at least 7 of 9 cells`);
  if (!(m.speed >= SPEED_FLOOR)) fail(`${show}: mean speed should be at least ${SPEED_FLOOR} px/s`);
  if (!(m.grouped >= 0.7)) fail(`${show}: at least 70% of fish should swim in a shoal`);
}

if (failures.length) { for (const f of failures) console.error('FAIL ' + f); process.exit(1); }
console.log('check-pond: stroke, islands, treats and reduced motion hold');
