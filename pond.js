// Home pond: the page seen from above as still water, with the two home objects standing in it as islands. A small
// school of line-drawn fish mills about between them, water laps inward at each shore, and a click drops a treat the
// fish race for and eat. The layer sits behind reading text, so the resting picture is calm: the school cruises
// slowly and only bursts into speed for a reason (a treat, a fast cursor, or now and then on its own) before it
// settles again.
//
// The simulation is kept apart from the drawing. createWorld() builds a state, step() advances it by dt with the
// world's own seeded random source and touches nothing else, so a run from a seed is the same run every time and
// tools/check-pond.mjs drives it headless. mount() is the browser shell around it: canvas, clock, colours, lifecycle.
//
// mount(container) -> { setSources([{x,y,w,h}]), setPointer(x,y,active), drop(x,y), params, clear(), destroy() }
// With ?dev in the URL the parameters open in a panel (pond-dev.js) and can be tuned live; `params` is that object.
// Parameters by section: [default, min, max, step, label].
export const PARAMS = {
  school: {
    count: [30, 1, 120, 1, 'fish on a fine pointer'],
    countTouch: [14, 1, 120, 1, 'fish on a coarse pointer'],
    repel: [22, 0, 120, 1, 'zone of repulsion, px'],
    orient: [70, 0, 300, 1, 'zone of orientation, px'],
    attract: [190, 0, 600, 5, 'zone of attraction, px'],
    fov: [280, 90, 360, 5, 'field of view, degrees; the rest is blind behind'],
    wander: [0.5, 0, 3, 0.05, 'weight of each fish\'s own meander'],
  },
  motion: {
    cruise: [26, 2, 120, 1, 'calm swimming speed, px/s'],
    burst: [4.2, 1, 10, 0.1, 'burst speed as a multiple of cruise'],
    turn: [1.6, 0.1, 8, 0.1, 'turn rate when calm, rad/s'],
    turnBurst: [5, 0, 15, 0.1, 'extra turn rate at full burst, rad/s'],
    calm: [1.3, 0.2, 6, 0.1, 'burst decay, s'],
    whim: [0.012, 0, 0.2, 0.002, 'spontaneous bursts per fish per s'],
    reduced: [0.4, 0.05, 0.95, 0.05, 'speed under reduced motion, of cruise'],
  },
  body: {
    length: [24, 10, 60, 1, 'mean fish length, px'],
    amp: [0.11, 0, 0.4, 0.01, 'tail sweep, of body length'],
    beat: [0.6, 0, 4, 0.05, 'tail beats per s when still'],
    stride: [0.75, 0.2, 3, 0.05, 'body lengths travelled per beat'],
    alpha: [0.5, 0.05, 1, 0.01, 'ink opacity'],
    width: [1, 0.3, 3, 0.05, 'line width, px'],
  },
  islands: {
    shore: [14, 0, 80, 1, 'gap a fish keeps from an island, px'],
    look: [70, 0, 300, 5, 'distance at which a fish starts to steer around, px'],
    edge: [60, 0, 300, 5, 'screen margin where fish turn back, px'],
    rings: [3, 0, 6, 1, 'waves lapping at each island'],
    reach: [46, 4, 200, 1, 'how far out a wave starts, px'],
    lap: [0.12, 0, 1, 0.01, 'waves per s'],
    ringAlpha: [0.13, 0, 1, 0.01, 'wave opacity'],
    shoreAlpha: [0.16, 0, 1, 0.01, 'shoreline opacity'],
  },
  treats: {
    sense: [240, 0, 800, 10, 'how far a fish notices a treat, px'],
    sink: [8, 1, 30, 0.5, 'seconds before an uneaten treat sinks away'],
    max: [12, 1, 40, 1, 'live treats at once'],
    startle: [800, 100, 4000, 50, 'cursor speed that startles, px/s'],
    scare: [110, 0, 400, 5, 'startle radius, px'],
  },
};
export const defaults = () => Object.fromEntries(Object.values(PARAMS).flatMap((section) => Object.entries(section).map(([k, v]) => [k, v[0]])));

// ----- the seeded random source -----
// mulberry32: small, fast, and good enough for motion. The world owns one, so a run is fixed by its seed.
export function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ----- the swimming stroke -----
export const SPINE = 8;          // points down the body, head first
export const BODY = 0.78;        // share of the length the spine covers; the tail fin is the rest
const WAVE_K = Math.PI * 2 * 0.9; // a little under one wavelength along the body
// Lateral amplitude down the body, s from 0 at the head to 1 at the tail, as a share of the tail's. Carangiform: the
// head yaws a little, the neck barely moves, and the sweep grows toward the tail.
export const envelope = (s) => 0.2 - 0.6 * s + 1.4 * s * s;
// Tail beats per second: a fish covers about `stride` body lengths per beat, so a fast fish beats faster.
export const beatHz = (speed, len, p) => p.beat + speed / (len * p.stride);
// The lateral offset of spine point s at the given phase, for a fish whose tail sweeps `amp` px.
export const lateral = (s, phase, amp) => amp * envelope(s) * Math.sin(phase - WAVE_K * s);

// ----- the islands -----
// Each box becomes an ellipse centred on it. A fish's head is kept outside the ellipse grown by the shore gap.
export const islandsFrom = (boxes) => (boxes || []).map((b) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2, rx: Math.max(1, b.w / 2), ry: Math.max(1, b.h / 2) }));
// Normalised radius of (x,y) in the ellipse (rx+g, ry+g): 1 on it, below 1 inside.
export const ellipseR = (o, x, y, g) => { const ex = (x - o.x) / (o.rx + g), ey = (y - o.y) / (o.ry + g); return Math.sqrt(ex * ex + ey * ey); };

const TAU = Math.PI * 2;
const wrapAngle = (a) => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };

function spawnFish(w, f) {
  const r = w.rand, p = w.params;
  f.len = p.length * (0.75 + 0.5 * r());
  f.pace = 0.85 + 0.3 * r();                      // each fish's own cruise, so the school does not move as one block
  f.x = w.home.x + (r() - 0.5) * 220; f.y = w.home.y + (r() - 0.5) * 160;
  f.h = w.home.h + (r() - 0.5) * 1.2;
  f.sp = p.cruise * f.pace; f.en = 0; f.flee = 0; f.fx = 0; f.fy = 0;
  f.phase = r() * TAU; f.wa = 0;
  f.rope = new Float32Array(SPINE * 2);
  const seg = (f.len * BODY) / (SPINE - 1), cx = Math.cos(f.h), cy = Math.sin(f.h);
  for (let i = 0; i < SPINE; i++) { f.rope[i * 2] = f.x - cx * seg * i; f.rope[i * 2 + 1] = f.y - cy * seg * i; }
  return f;
}

// A world: the pond's whole state. opts: { w, h, seed, coarse, reduced }.
export function createWorld(params, opts = {}) {
  const w = {
    params, w: opts.w || 1, h: opts.h || 1, t: 0, rand: rng(opts.seed == null ? 1 : opts.seed),
    coarse: !!opts.coarse, reduced: !!opts.reduced,
    fish: [], islands: [], treats: [], ripples: [],
    ptr: { x: 0, y: 0, on: false, px: 0, py: 0, seen: false, speed: 0 },
    eaten: 0,
  };
  w.home = { x: w.w * (0.25 + 0.5 * w.rand()), y: w.h * (0.25 + 0.5 * w.rand()), h: w.rand() * TAU };
  populate(w);
  return w;
}
const target = (w) => Math.max(0, Math.round(w.coarse ? w.params.countTouch : w.params.count));
function populate(w) {
  const n = target(w);
  while (w.fish.length < n) w.fish.push(spawnFish(w, {}));
  if (w.fish.length > n) w.fish.length = n;
}
export function resizeWorld(w, width, height) { w.w = Math.max(1, width); w.h = Math.max(1, height); }
export function setIslands(w, boxes) { w.islands = islandsFrom(boxes); }
export function setPointer(w, x, y, on) { w.ptr.x = x; w.ptr.y = y; w.ptr.on = !!on; }
// A treat that lands on an island rolls off into the water at the nearest shore.
export function dropTreat(w, x, y) {
  const g = w.params.shore + 4;
  for (const o of w.islands) {
    const r = ellipseR(o, x, y, g);
    if (r < 1) { const dx = x - o.x, dy = y - o.y; if (dx === 0 && dy === 0) { y = o.y - o.ry - g; } else { x = o.x + dx / Math.max(r, 1e-6); y = o.y + dy / Math.max(r, 1e-6); } }
  }
  if (w.treats.length >= w.params.max) w.treats.splice(0, w.treats.length - w.params.max + 1);
  w.treats.push({ x, y, age: 0 });
  ripple(w, x, y, 34, 1.6);
}
function ripple(w, x, y, size, life) {
  if (w.ripples.length >= 32) w.ripples.shift();
  w.ripples.push({ x, y, age: 0, size, life });
}

// Advances the world by dt seconds. Deterministic: the only randomness is the world's own source.
export function step(w, dt) {
  if (!(dt > 0)) return;
  const p = w.params, r = w.rand, F = w.fish, n = F.length;
  w.t += dt;
  if (n !== target(w)) populate(w);
  // the cursor's speed over this step; a still or slow cursor startles nothing
  const ptr = w.ptr;
  if (ptr.on && ptr.seen) { const d = Math.hypot(ptr.x - ptr.px, ptr.y - ptr.py); ptr.speed = d / dt; } else ptr.speed = 0;
  ptr.px = ptr.x; ptr.py = ptr.y; ptr.seen = ptr.on;
  const startle = !w.reduced && ptr.speed > p.startle;

  // treats age and sink; ripples spread
  for (let i = w.treats.length - 1; i >= 0; i--) { const t = w.treats[i]; t.age += dt; if (t.age > p.sink) w.treats.splice(i, 1); }
  for (let i = w.ripples.length - 1; i >= 0; i--) { const q = w.ripples[i]; q.age += dt; if (q.age > q.life) w.ripples.splice(i, 1); }

  const cosFov = Math.cos((p.fov * Math.PI) / 360);
  const zr2 = p.repel * p.repel, zo2 = p.orient * p.orient, za2 = p.attract * p.attract;
  const decay = Math.exp(-dt / p.calm);
  for (let i = 0; i < n; i++) {
    const f = F[i], hx = Math.cos(f.h), hy = Math.sin(f.h);
    // Couzin's three zones: anyone too close is avoided and nothing else counts; otherwise the fish lines up with the
    // ones near it and closes on the ones further off, seeing only what is in front of it
    let rx = 0, ry = 0, nr = 0, ox = 0, oy = 0, no = 0, ax = 0, ay = 0, na = 0;
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      const g = F[j], dx = g.x - f.x, dy = g.y - f.y, d2 = dx * dx + dy * dy;
      if (d2 > za2 || d2 < 1e-9) continue;
      const d = Math.sqrt(d2);
      if (d2 < zr2) { rx -= dx / d; ry -= dy / d; nr++; continue; }
      if ((dx * hx + dy * hy) / d < cosFov) continue;
      if (d2 < zo2) { ox += Math.cos(g.h); oy += Math.sin(g.h); no++; } else { ax += dx / d; ay += dy / d; na++; }
    }
    let sx = hx, sy = hy; // momentum: with nothing to react to, a fish carries on
    if (nr > 0) { const m = Math.hypot(rx, ry) || 1; sx += (rx / m) * 1.6; sy += (ry / m) * 1.6; }
    else {
      if (no > 0) { const m = Math.hypot(ox, oy) || 1; sx += ox / m; sy += oy / m; }
      if (na > 0) { const m = Math.hypot(ax, ay) || 1; sx += (ax / m) * 0.8; sy += (ay / m) * 0.8; }
    }
    // its own meander: a slow random walk of a preferred bearing
    f.wa += (r() - 0.5) * 3 * Math.sqrt(dt); if (f.wa > 1.2) f.wa = 1.2; else if (f.wa < -1.2) f.wa = -1.2;
    sx += Math.cos(f.h + f.wa) * p.wander; sy += Math.sin(f.h + f.wa) * p.wander;
    // screen edges turn a fish back in; nothing wraps
    const e = Math.max(1, p.edge);
    if (f.x < e) sx += ((e - f.x) / e) * 3; else if (f.x > w.w - e) sx -= ((f.x - (w.w - e)) / e) * 3;
    if (f.y < e) sy += ((e - f.y) / e) * 3; else if (f.y > w.h - e) sy -= ((f.y - (w.h - e)) / e) * 3;
    // the nearest treat it can sense draws it in, harder the closer it is, and sets it bursting
    let tb = -1, tbd = p.sense;
    for (let k = 0; k < w.treats.length; k++) { const t = w.treats[k], d = Math.hypot(t.x - f.x, t.y - f.y); if (d < tbd) { tbd = d; tb = k; } }
    if (tb >= 0) {
      const t = w.treats[tb], d = tbd || 1;
      sx += ((t.x - f.x) / d) * 4; sy += ((t.y - f.y) / d) * 4;
      if (!w.reduced) f.en = Math.max(f.en, 1 - 0.5 * (d / Math.max(1, p.sense)));
    }
    // a fast cursor through the school scatters the fish near it
    if (startle) {
      const dx = f.x - ptr.x, dy = f.y - ptr.y, d = Math.hypot(dx, dy);
      if (d < p.scare && d > 1e-6) { f.flee = 0.7; f.fx = dx / d; f.fy = dy / d; f.en = 1; }
    }
    if (f.flee > 0) { f.flee -= dt; sx += f.fx * 5 * Math.max(0, f.flee); sy += f.fy * 5 * Math.max(0, f.flee); }
    // islands: inside the look zone the part of the heading aimed at the shore is turned along it
    for (const o of w.islands) {
      const rr = ellipseR(o, f.x, f.y, p.shore), reach = 1 + p.look / Math.max(o.rx, o.ry);
      if (rr > reach) continue;
      let gx = (f.x - o.x) / ((o.rx + p.shore) ** 2), gy = (f.y - o.y) / ((o.ry + p.shore) ** 2);
      const gm = Math.hypot(gx, gy) || 1; gx /= gm; gy /= gm;
      const k = Math.min(1, (reach - rr) / (reach - 1)), toward = -(hx * gx + hy * gy);
      if (toward > -0.2) {
        const side = hx * -gy + hy * gx >= 0 ? 1 : -1; // go round on whichever side it already leans to
        sx += -gy * side * 4 * k + gx * 2 * k * k; sy += gx * side * 4 * k + gy * 2 * k * k;
      }
    }
    // turn toward the wish at a limited rate: a burst turns sharper
    if (!w.reduced && r() < p.whim * dt) { f.en = Math.max(f.en, 0.3 + 0.3 * r()); f.wa = (r() - 0.5) * 2.4; }
    if (w.reduced) f.en = 0;
    const want = Math.atan2(sy, sx), turn = (w.reduced ? p.turn * 0.6 : p.turn + p.turnBurst * f.en) * dt;
    let dh = wrapAngle(want - f.h); if (dh > turn) dh = turn; else if (dh < -turn) dh = -turn;
    f.h = wrapAngle(f.h + dh);
    // speed follows energy: a burst kicks in quickly and fades slowly
    const cap = w.reduced ? p.cruise * p.reduced : p.cruise * f.pace * (1 + f.en * (p.burst - 1));
    f.sp += (cap - f.sp) * Math.min(1, dt * (cap > f.sp ? 7 : 1.5));
    if (w.reduced && f.sp > cap) f.sp = cap;
    f.en *= decay;
    f.phase = (f.phase + TAU * beatHz(f.sp, f.len, p) * dt) % TAU;
  }
  // move, then hold every head out of the islands and inside the page
  for (let i = 0; i < n; i++) {
    const f = F[i];
    f.x += Math.cos(f.h) * f.sp * dt; f.y += Math.sin(f.h) * f.sp * dt;
    for (const o of w.islands) {
      const rr = ellipseR(o, f.x, f.y, p.shore);
      if (rr >= 1) continue;
      const dx = f.x - o.x, dy = f.y - o.y;
      if (rr < 1e-6) { f.x = o.x; f.y = o.y - o.ry - p.shore; } else { f.x = o.x + dx / rr; f.y = o.y + dy / rr; }
      // shed the motion aimed inward: the fish slides along the shore
      let gx = (f.x - o.x) / ((o.rx + p.shore) ** 2), gy = (f.y - o.y) / ((o.ry + p.shore) ** 2);
      const gm = Math.hypot(gx, gy) || 1; gx /= gm; gy /= gm;
      let vx = Math.cos(f.h), vy = Math.sin(f.h); const into = vx * gx + vy * gy;
      if (into < 0) { vx -= into * gx; vy -= into * gy; if (Math.hypot(vx, vy) > 1e-6) f.h = Math.atan2(vy, vx); }
    }
    if (f.x < 0) f.x = 0; else if (f.x > w.w) f.x = w.w;
    if (f.y < 0) f.y = 0; else if (f.y > w.h) f.y = w.h;
    // the body trails the head like a rope, which is what bends it through a turn
    const rope = f.rope, seg = (f.len * BODY) / (SPINE - 1);
    rope[0] = f.x; rope[1] = f.y;
    for (let k = 1; k < SPINE; k++) {
      let dx = rope[k * 2] - rope[k * 2 - 2], dy = rope[k * 2 + 1] - rope[k * 2 - 1];
      const d = Math.hypot(dx, dy);
      if (d < 1e-6) { dx = -Math.cos(f.h); dy = -Math.sin(f.h); } else { dx /= d; dy /= d; }
      rope[k * 2] = rope[k * 2 - 2] + dx * seg; rope[k * 2 + 1] = rope[k * 2 - 1] + dy * seg;
      // the body stays in the water too: an island that moves under a fish (the page scrolled) pushes it aside
      for (const o of w.islands) {
        const rr = ellipseR(o, rope[k * 2], rope[k * 2 + 1], 2);
        if (rr < 1 && rr > 1e-6) { rope[k * 2] = o.x + (rope[k * 2] - o.x) / rr; rope[k * 2 + 1] = o.y + (rope[k * 2 + 1] - o.y) / rr; }
      }
    }
    // the first mouth to reach a treat takes it
    const bite = f.len * 0.3 + 4;
    for (let k = 0; k < w.treats.length; k++) {
      const t = w.treats[k];
      if (Math.hypot(t.x - f.x, t.y - f.y) < bite) { w.treats.splice(k, 1); ripple(w, t.x, t.y, 14, 0.9); w.eaten++; if (!w.reduced) f.en = Math.max(f.en, 0.5); break; }
    }
  }
}

// ----- drawing -----
const PX = new Float32Array(SPINE), PY = new Float32Array(SPINE), NX = new Float32Array(SPINE), NY = new Float32Array(SPINE);
const WIDTH = Float32Array.from({ length: SPINE }, (_, i) => { const s = i / (SPINE - 1); return 0.25 * s + 0.75 * Math.sin(Math.PI * Math.min(1, s ** 0.62)); });
// smooth a run of points by curving through their midpoints
function curveThrough(ctx, xs, ys, count) {
  for (let i = 1; i < count - 1; i++) ctx.quadraticCurveTo(xs[i], ys[i], (xs[i] + xs[i + 1]) / 2, (ys[i] + ys[i + 1]) / 2);
  ctx.lineTo(xs[count - 1], ys[count - 1]);
}
const LX = new Float32Array(SPINE), LY = new Float32Array(SPINE);
function drawFish(ctx, f, p, swim) {
  const amp = f.len * p.amp * (0.55 + 0.45 * Math.min(1.6, f.sp / Math.max(1, p.cruise))) * swim;
  const rope = f.rope;
  for (let i = 0; i < SPINE; i++) {
    const a = Math.max(0, i - 1), b = Math.min(SPINE - 1, i + 1);
    let tx = rope[a * 2] - rope[b * 2], ty = rope[a * 2 + 1] - rope[b * 2 + 1];
    const m = Math.hypot(tx, ty) || 1; tx /= m; ty /= m;
    NX[i] = -ty; NY[i] = tx;
    const off = lateral(i / (SPINE - 1), f.phase, amp);
    PX[i] = rope[i * 2] + NX[i] * off; PY[i] = rope[i * 2 + 1] + NY[i] * off;
  }
  // the normals again, from the waved spine, so the outline follows the bend the wave makes
  for (let i = 0; i < SPINE; i++) {
    const a = Math.max(0, i - 1), b = Math.min(SPINE - 1, i + 1);
    let tx = PX[a] - PX[b], ty = PY[a] - PY[b]; const m = Math.hypot(tx, ty) || 1; tx /= m; ty /= m;
    NX[i] = -ty; NY[i] = tx;
  }
  const hw = f.len * 0.12;
  ctx.beginPath();
  ctx.moveTo(PX[0] + (PX[0] - PX[1]) * 0.25, PY[0] + (PY[0] - PY[1]) * 0.25); // a rounded snout just ahead of the head point
  for (let i = 0; i < SPINE; i++) { LX[i] = PX[i] + NX[i] * WIDTH[i] * hw; LY[i] = PY[i] + NY[i] * WIDTH[i] * hw; }
  LX[0] = PX[0] + (PX[0] - PX[1]) * 0.25; LY[0] = PY[0] + (PY[0] - PY[1]) * 0.25;
  curveThrough(ctx, LX, LY, SPINE);
  // the forked tail, off the end of the spine along its last segment
  const e = SPINE - 1;
  let dx = PX[e] - PX[e - 1], dy = PY[e] - PY[e - 1]; const dm = Math.hypot(dx, dy) || 1; dx /= dm; dy /= dm;
  const tl = f.len * 0.26, sp = f.len * 0.14;
  ctx.lineTo(PX[e] + dx * tl + NX[e] * sp, PY[e] + dy * tl + NY[e] * sp);
  ctx.lineTo(PX[e] + dx * tl * 0.45, PY[e] + dy * tl * 0.45);
  ctx.lineTo(PX[e] + dx * tl - NX[e] * sp, PY[e] + dy * tl - NY[e] * sp);
  for (let i = 0; i < SPINE; i++) { LX[i] = PX[e - i] - NX[e - i] * WIDTH[e - i] * hw; LY[i] = PY[e - i] - NY[e - i] * WIDTH[e - i] * hw; }
  LX[e] = PX[0] + (PX[0] - PX[1]) * 0.25; LY[e] = PY[0] + (PY[0] - PY[1]) * 0.25;
  ctx.lineTo(LX[0], LY[0]);
  curveThrough(ctx, LX, LY, SPINE);
  ctx.closePath();
  ctx.globalAlpha = 0.92; ctx.fill();
  ctx.globalAlpha = p.alpha; ctx.stroke();
  // pectoral fins, paddling a little more when the fish is slow
  const flap = 0.35 * Math.sin(f.phase * 0.7) * swim, fl = f.len * 0.13, k = 2;
  let bx = PX[k] - PX[k + 1], by = PY[k] - PY[k + 1]; const bm = Math.hypot(bx, by) || 1; bx /= bm; by /= bm;
  ctx.beginPath();
  for (const side of [1, -1]) {
    const ex = PX[k] + NX[k] * WIDTH[k] * hw * side, ey = PY[k] + NY[k] * WIDTH[k] * hw * side;
    const ang = 0.9 + flap * side, c = Math.cos(ang), s = Math.sin(ang);
    // rotate the backward direction out toward this side
    const ox = -bx * c + NX[k] * side * s, oy = -by * c + NY[k] * side * s;
    ctx.moveTo(ex, ey); ctx.lineTo(ex + ox * fl, ey + oy * fl);
  }
  ctx.stroke();
}

// Draws the world onto ctx (already scaled to CSS px). ink and paper are CSS colours; gold is the treats' colour.
export function draw(ctx, w, ink, paper, gold) {
  const p = w.params, still = w.reduced;
  ctx.clearRect(0, 0, w.w, w.h);
  ctx.strokeStyle = ink; ctx.lineWidth = p.width; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  // the shores and the water lapping in toward them
  for (const o of w.islands) {
    ctx.globalAlpha = p.shoreAlpha;
    ctx.beginPath(); ctx.ellipse(o.x, o.y, o.rx + 3, o.ry + 3, 0, 0, TAU); ctx.stroke();
    const m = Math.round(p.rings);
    for (let i = 0; i < m; i++) {
      const u = still ? (i + 0.5) / m : ((w.t * p.lap + i / m) % 1); // 0 far out, 1 at the shore
      const a = still ? 0.6 : Math.min(1, u * 4) * (1 - u);
      if (a <= 0.001) continue;
      const g = 3 + p.reach * (1 - u);
      ctx.globalAlpha = p.ringAlpha * a;
      ctx.beginPath(); ctx.ellipse(o.x, o.y, o.rx + g, o.ry + g, 0, 0, TAU); ctx.stroke();
    }
  }
  // the school: a paper fill under each outline, so crossing fish read as one over the other
  ctx.fillStyle = paper;
  for (const f of w.fish) drawFish(ctx, f, p, still ? 0.4 : 1);
  // ripples, then the treats on the surface above everything
  for (const q of w.ripples) {
    const k = q.age / q.life;
    ctx.globalAlpha = p.ringAlpha * 2 * (1 - k);
    ctx.beginPath(); ctx.arc(q.x, q.y, 2 + q.size * Math.sqrt(k), 0, TAU); ctx.stroke();
  }
  ctx.fillStyle = gold;
  for (const t of w.treats) {
    const k = t.age / p.sink;
    ctx.globalAlpha = 0.9 * (1 - k * k);
    ctx.beginPath(); ctx.arc(t.x, t.y, 2.4 * (1 - 0.55 * k), 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// ----- the browser shell -----
const GOLD = '#b68235'; // the treats keep gold in both themes; the dark theme's accent is the text colour
export function mount(container) {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;';
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const params = defaults();
  const mq = (q) => (window.matchMedia ? window.matchMedia(q) : null);
  const coarseQ = mq('(pointer: coarse)'), reducedQ = mq('(prefers-reduced-motion: reduce)');
  const world = createWorld(params, { w: container.clientWidth || 1, h: container.clientHeight || 1, seed: (Math.random() * 2 ** 32) >>> 0, coarse: !!coarseQ?.matches, reduced: !!reducedQ?.matches });
  const onReduced = () => { world.reduced = !!reducedQ.matches; };
  reducedQ?.addEventListener?.('change', onReduced);
  // the tokens live on the root div, not on <html>, so read them off the layer itself; and read them again every
  // second, so a change of theme reaches the ink without any hook into how the theme is switched
  let ink = '#201f1d', paper = '#f3f2f2', inkAge = Infinity;
  const readInk = () => { const css = getComputedStyle(container); ink = css.getPropertyValue('--color-text').trim() || ink; paper = css.getPropertyValue('--color-bg').trim() || paper; inkAge = 0; };
  let vw = 1, vh = 1;
  const resize = () => {
    vw = container.clientWidth || 1; vh = container.clientHeight || 1;
    canvas.width = Math.round(vw * dpr); canvas.height = Math.round(vh * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    resizeWorld(world, vw, vh);
  };
  const ro = new ResizeObserver(resize); ro.observe(container); resize();
  let alive = true, raf = 0, last = performance.now();
  const tick = (now) => {
    raf = 0;
    if (!alive || document.hidden) return;
    raf = requestAnimationFrame(tick);
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now;
    inkAge += dt; if (inkAge > 1) readInk();
    step(world, dt);
    draw(ctx, world, ink, paper, GOLD);
  };
  // a hidden tab runs nothing; on return the clock restarts rather than jumping by the time away
  const onVisible = () => { if (!alive) return; if (document.hidden) { if (raf) cancelAnimationFrame(raf); raf = 0; } else if (!raf) { last = performance.now(); raf = requestAnimationFrame(tick); } };
  document.addEventListener('visibilitychange', onVisible);
  raf = requestAnimationFrame(tick);
  let dev = null;
  const api = {
    setSources(list) { setIslands(world, list); },
    setPointer(x, y, on) { setPointer(world, x, y, on); },
    drop(x, y) { dropTreat(world, x, y); },
    params,
    // clear the water: every treat and ripple goes
    clear() { world.treats.length = 0; world.ripples.length = 0; },
    // shrinking the canvas to nothing hands the backing store back now rather than at the next collection
    destroy() {
      alive = false; if (raf) cancelAnimationFrame(raf); ro.disconnect();
      document.removeEventListener('visibilitychange', onVisible); reducedQ?.removeEventListener?.('change', onReduced);
      if (dev) dev.destroy();
      canvas.width = canvas.height = 0; if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    },
  };
  if (new URLSearchParams(location.search).has('dev')) import('./pond-dev.js').then((m) => { if (alive) dev = m.mount(api); }).catch((e) => console.error('pond-dev', e));
  return api;
}
