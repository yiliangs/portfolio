// Checks pond.js's simulation headless: the swimming stroke, the islands, the treats, and reduced motion.
//
// The pond's step() is a function of the world, dt and the world's own seeded random source, so every run below is
// the same run every time. None of these properties shows in a still frame: a fish that clips an island for one frame,
// a school that circles a treat without ever taking it, or a reduced-motion school that still bursts all look fine in
// a screenshot and wrong in motion.
//
// Run with `npm run check`. Exits non-zero and prints every failure it found.

import { defaults, createWorld, step, setIslands, setPointer, dropTreat, envelope, beatHz, lateral, shoreR, coast, islandsFrom, MARGIN } from '../pond.js';

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

if (failures.length) { for (const f of failures) console.error('FAIL ' + f); process.exit(1); }
console.log('check-pond: stroke, islands, treats and reduced motion hold');
