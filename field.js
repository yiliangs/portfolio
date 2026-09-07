// Home field: drafting dust on an ocean. A noise landscape spans the page; every particle rides its contour lines,
// which is the curl of the landscape, so the flow is divergence-free and never pools. The landscape is a slice
// through 3D noise and the slice moves slowly, so the contours morph rather than slide: the turbulence is constant
// and never settles into a pattern. The two home objects are obstacles, not features of the landscape: a particle
// heading for one sheds the part of its motion aimed at it, so it swerves past and carries on rather than circling.
// Each particle draws a tail of a set length behind it, cut from its own recent path, so the background reads like a
// plotter sketching construction lines across the whole page, and the cursor brushes the dust aside. The tail is a
// length in pixels rather than accumulated ink thinned a little each frame: the trail is as long as it is set to be,
// and it stays crisp instead of smearing into the ones around it.
// mount(container) -> { setSources([{x,y,w,h}]), setPointer(x,y,active), params, clear(), destroy() }
// With ?dev in the URL the parameters open in a panel (field-dev.js) and can be tuned live; `params` is that object.
// Parameters by section: [default, min, max, step, label], or [default, 'toggle', label] for a switch.
export const PARAMS = {
  landscape: {
    wavelength: [320, 60, 1200, 10, 'feature size, px'],
    octaves: [3, 1, 4, 1, 'detail levels'],
    morphSpeed: [0.01, 0, 0.5, 0.005, 'how fast the contours deform'],
    showLandscape: [0, 'toggle', 'draw the height field and its contours'],
    contours: [5, 2, 40, 1, 'contour lines across the height range'],
  },
  objects: {
    avoidRadius: [1.8, 1, 4, 0.05, 'where the swerve begins, as a multiple of the object'],
    avoidPush: [40, 0, 200, 2, 'outward nudge at the object edge, px/s'],
  },
  flow: {
    speed: [40, 0, 200, 1, 'px/s on a unit slope'],
    minSpeed: [12, 0, 100, 1, 'speed floor, px/s'],
    maxSpeed: [100, 10, 400, 5, 'speed ceiling, px/s'],
    brush: [110, 0, 400, 5, 'cursor brush radius, px'],
  },
  particles: {
    count: [1050, 100, 3000, 50, 'how many'],
    life: [24, 1, 30, 0.5, 'longest life, s'],
    tail: [24, 0, 200, 1, 'tail length, px'],
    alpha: [0.15, 0.02, 1, 0.01, 'ink opacity'],
    width: [0.8, 0.2, 3, 0.05, 'line width, px'],
  },
};
const defaults = () => Object.fromEntries(Object.values(PARAMS).flatMap((section) => Object.entries(section).map(([k, v]) => [k, v[0]])));

// ----- the tail -----
export const TAIL_STEP = 2;                              // px of travel between stored path points
export const TAIL_CAP = Math.ceil(200 / TAIL_STEP) + 2;  // ring size: enough points for the longest tail the panel allows
// Cuts a particle's tail out of its own path. pts is the path head first, n points of it, flat [x, y, ...]; the tail
// is walked back from the head until `tail` px have been covered and the last point is interpolated so the tail ends
// at exactly that length rather than at whatever vertex happens to be nearest. A vertex is also inserted at each
// third, and its index written to splits, so the three alpha bands meet at a shared point and leave no gap between
// them. Returns how many points were written to out. Pure: every buffer it touches is an argument.
export function tailPath(pts, n, tail, out, splits) {
  splits[0] = splits[1] = -1;
  if (n < 1 || tail <= 0) return 0;
  out[0] = pts[0]; out[1] = pts[1];
  let c = 1, acc = 0;
  const b1 = tail / 3, b2 = tail * 2 / 3;
  for (let i = 1; i < n; i++) {
    const ax = pts[i * 2 - 2], ay = pts[i * 2 - 1], bx = pts[i * 2], by = pts[i * 2 + 1];
    const seg = Math.hypot(bx - ax, by - ay);
    if (seg <= 1e-9) continue;
    const start = acc, end = acc + seg;
    if (splits[0] < 0 && b1 > start && b1 <= end) { const f = (b1 - start) / seg; out[c * 2] = ax + (bx - ax) * f; out[c * 2 + 1] = ay + (by - ay) * f; splits[0] = c++; }
    if (splits[1] < 0 && b2 > start && b2 <= end) { const f = (b2 - start) / seg; out[c * 2] = ax + (bx - ax) * f; out[c * 2 + 1] = ay + (by - ay) * f; splits[1] = c++; }
    if (end >= tail) { const f = (tail - start) / seg; out[c * 2] = ax + (bx - ax) * f; out[c * 2 + 1] = ay + (by - ay) * f; c++; break; }
    out[c * 2] = bx; out[c * 2 + 1] = by; c++; acc = end;
  }
  // a path shorter than the tail is drawn whole, so the bands that never started end where it does
  if (splits[0] < 0) splits[0] = c - 1;
  if (splits[1] < 0) splits[1] = c - 1;
  return c;
}

// cheap 3D value noise: eight lattice hashes, smoothstep blend
const hash = (x, y, z) => { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); };
const lerp = (a, b, k) => a + (b - a) * k;
const noise = (x, y, z) => {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), fx = x - xi, fy = y - yi, fz = z - zi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
  const n00 = lerp(hash(xi, yi, zi), hash(xi + 1, yi, zi), u), n10 = lerp(hash(xi, yi + 1, zi), hash(xi + 1, yi + 1, zi), u);
  const n01 = lerp(hash(xi, yi, zi + 1), hash(xi + 1, yi, zi + 1), u), n11 = lerp(hash(xi, yi + 1, zi + 1), hash(xi + 1, yi + 1, zi + 1), u);
  return lerp(lerp(n00, n10, v), lerp(n01, n11, v), w);
};

export function mount(container) {
  // the landscape view sits under the dust: a quarter-resolution map of the height field with its contour lines
  const map = document.createElement('canvas');
  map.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:none;';
  container.appendChild(map);
  const mx = map.getContext('2d');
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;';
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  // the tokens live on the root div, not on <html>, so read them off the layer itself
  const css = getComputedStyle(container);
  const INK = (css.getPropertyValue('--color-text').trim() || '#201f1d'), GOLD = (css.getPropertyValue('--color-accent').trim() || '#b68235');
  const params = defaults();
  let vw = 1, vh = 1, alive = true, raf, obstacles = [], ptr = { x: -1e4, y: -1e4, on: false }, last = performance.now(), t = 0;
  const MAP_SCALE = 1 / 4;
  let mapImg = null, mapW = 1, mapH = 1, mapLevels = null, mapHeights = null;
  const P = [];
  // a particle never spawns inside an object
  const inside = (x, y) => obstacles.some((o) => Math.hypot((x - o.x) / o.rx, (y - o.y) / o.ry) < 1);
  // each particle carries a ring of its own recent path, sampled by distance rather than by frame, so the tail is the
  // same length whatever the frame rate or the particle's speed
  const spawn = (p) => {
    do { p.x = Math.random() * vw; p.y = Math.random() * vh; } while (inside(p.x, p.y));
    p.life = 0; p.ttl = params.life * (0.5 + Math.random() * 0.5); p.gold = Math.random() < 0.04; p.w = 0.65 + Math.random() * 0.7;
    if (!p.ring) p.ring = new Float32Array(TAIL_CAP * 2);
    p.ring[0] = p.x; p.ring[1] = p.y; p.head = 0; p.n = 1; // a fresh particle starts with no tail behind it
  };
  // the population follows the count: newcomers spawn, the surplus is dropped
  const populate = () => { while (P.length < params.count) { const p = {}; spawn(p); p.life = Math.random() * p.ttl; P.push(p); } P.length = Math.min(P.length, params.count); };
  populate();
  const resize = () => {
    vw = container.clientWidth || 1; vh = container.clientHeight || 1;
    canvas.width = vw * dpr; canvas.height = vh * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    mapW = map.width = Math.max(1, Math.ceil(vw * MAP_SCALE)); mapH = map.height = Math.max(1, Math.ceil(vh * MAP_SCALE)); mapImg = mx.createImageData(mapW, mapH); mapLevels = new Int16Array(mapW * mapH); mapHeights = new Float32Array(mapW * mapH);
    for (const p of P) { spawn(p); p.life = Math.random() * p.ttl; }
  };
  const ro = new ResizeObserver(resize); ro.observe(container); resize();
  // the landscape: three octaves of noise, sliced at a depth that advances with time
  const height = (x, y) => {
    const z = t * params.morphSpeed, S = 1 / params.wavelength;
    let h = noise(x * S, y * S, z);
    if (params.octaves > 1) h += 0.5 * noise(x * S * 2.1 + 7.3, y * S * 2.1 + 3.1, z * 1.3 + 11);
    if (params.octaves > 2) h += 0.25 * noise(x * S * 4.3 + 19, y * S * 4.3 + 5, z * 1.7 + 23);
    if (params.octaves > 3) h += 0.125 * noise(x * S * 8.7 + 41, y * S * 8.7 + 13, z * 2.1 + 37);
    return h;
  };
  // the current at (x,y): the contour direction, which is the gradient turned a quarter turn, at a speed that
  // follows the slope between a floor and a ceiling; plus the cursor's brush-away
  const E = 1.5;
  const field = (x, y, out) => {
    const gx = (height(x + E, y) - height(x - E, y)) / (2 * E), gy = (height(x, y + E) - height(x, y - E)) / (2 * E);
    const m = Math.hypot(gx, gy) + 1e-9, s = Math.min(params.maxSpeed, Math.max(params.minSpeed, m * params.wavelength * params.speed));
    out.x = gy / m * s; out.y = -gx / m * s;
    // the objects: inside the swerve zone the motion aimed at the object is shed, fully at its edge, and a nudge
    // outward keeps the particle from hugging the boundary; motion away from it is left alone
    for (const o of obstacles) {
      const dx = x - o.x, dy = y - o.y, ex = dx / o.rx, ey = dy / o.ry, r = Math.hypot(ex, ey); // 1 at the edge in the box's own ellipse
      if (r > params.avoidRadius) continue;
      const nx = dx / (Math.hypot(dx, dy) + 1e-6), ny = dy / (Math.hypot(dx, dy) + 1e-6), toward = -(out.x * nx + out.y * ny);
      const k = Math.min(1, (params.avoidRadius - r) / (params.avoidRadius - 1)); // 0 at the zone's rim, 1 at the edge
      if (toward > 0) { out.x += nx * toward * k; out.y += ny * toward * k; }
      out.x += nx * params.avoidPush * k * k; out.y += ny * params.avoidPush * k * k;
    }
    if (ptr.on && params.brush > 0) { const dx = x - ptr.x, dy = y - ptr.y, d = Math.hypot(dx, dy) + 1e-3, g = Math.exp(-(d * d) / (params.brush * params.brush)); out.x += dx / d * g * 160; out.y += dy / d * g * 160; }
  };
  // contour map: shade by height, and ink a line wherever the height crosses one of the contour levels
  const drawMap = () => {
    if (!mapImg) return;
    const d = mapImg.data, L = params.contours, lv = mapLevels, hs = mapHeights;
    for (let j = 0, k = 0; j < mapH; j++) for (let i = 0; i < mapW; i++, k++) { const h = height(i / MAP_SCALE, j / MAP_SCALE) / 1.875; hs[k] = h; lv[k] = Math.floor(h * L); }
    // a contour is one pixel wide wherever the level steps to the right or downward neighbour
    for (let j = 0, k = 0; j < mapH; j++) for (let i = 0; i < mapW; i++, k++) {
      const line = (i + 1 < mapW && lv[k + 1] !== lv[k]) || (j + 1 < mapH && lv[k + mapW] !== lv[k]);
      const shade = Math.round(238 - hs[k] * 70 - (line ? 110 : 0)), q = k * 4;
      d[q] = shade; d[q + 1] = shade; d[q + 2] = shade; d[q + 3] = 255;
    }
    mx.putImageData(mapImg, 0, 0);
  };
  let frame = 0;
  const v = { x: 0, y: 0 };
  // one set of scratch buffers for the whole population: the tail is built and stroked one particle at a time
  const tPts = new Float64Array((TAIL_CAP + 1) * 2), tOut = new Float64Array((TAIL_CAP + 4) * 2), tSplit = new Int32Array(2);
  // the taper is three bands rather than a per-segment alpha or a gradient per particle: one stroke each, and the
  // head still reads as the bright end
  const BANDS = [1, 0.55, 0.2];
  const band = (a, b, alpha) => {
    if (b <= a) return;
    ctx.globalAlpha = alpha;
    ctx.beginPath(); ctx.moveTo(tOut[a * 2], tOut[a * 2 + 1]);
    for (let i = a + 1; i <= b; i++) ctx.lineTo(tOut[i * 2], tOut[i * 2 + 1]);
    ctx.stroke();
  };
  const tick = (now) => {
    if (!alive) return; raf = requestAnimationFrame(tick);
    const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
    if (P.length !== params.count) populate();
    map.style.display = params.showLandscape ? 'block' : 'none';
    if (params.showLandscape && frame++ % 3 === 0) drawMap();
    // the whole frame is redrawn: a tail is its own length of path, not ink left behind and thinned
    ctx.clearRect(0, 0, vw, vh);
    ctx.lineCap = 'round';
    const step2 = TAIL_STEP * TAIL_STEP;
    // only the points that could fall inside the tail are worth copying out of the ring
    const need = Math.min(TAIL_CAP, Math.ceil(params.tail / TAIL_STEP) + 2);
    for (const p of P) {
      field(p.x, p.y, v);
      p.x += v.x * dt; p.y += v.y * dt; p.life += dt;
      // fade in and out over the particle's life so threads start and end softly
      const k = Math.min(1, p.life / 1.2, (p.ttl - p.life) / 1.2);
      if (p.life > p.ttl || p.x < -20 || p.y < -20 || p.x > vw + 20 || p.y > vh + 20) { spawn(p); continue; }
      // the path only records a point once the particle has actually gone somewhere
      const lx = p.ring[p.head * 2], ly = p.ring[p.head * 2 + 1];
      if ((p.x - lx) * (p.x - lx) + (p.y - ly) * (p.y - ly) >= step2) {
        p.head = (p.head + 1) % TAIL_CAP;
        p.ring[p.head * 2] = p.x; p.ring[p.head * 2 + 1] = p.y;
        if (p.n < TAIL_CAP) p.n++;
      }
      tPts[0] = p.x; tPts[1] = p.y;
      const take = Math.min(p.n, need);
      for (let i = 0; i < take; i++) {
        const j = (p.head - i + TAIL_CAP) % TAIL_CAP;
        tPts[(i + 1) * 2] = p.ring[j * 2]; tPts[(i + 1) * 2 + 1] = p.ring[j * 2 + 1];
      }
      const c = tailPath(tPts, take + 1, params.tail, tOut, tSplit);
      if (c < 2) continue;
      const a0 = (p.gold ? params.alpha * 1.9 : params.alpha) * k;
      ctx.strokeStyle = p.gold ? GOLD : INK; ctx.lineWidth = p.w * params.width;
      band(0, tSplit[0], a0 * BANDS[0]);
      band(tSplit[0], tSplit[1], a0 * BANDS[1]);
      band(tSplit[1], c - 1, a0 * BANDS[2]);
    }
    ctx.globalAlpha = 1;
  };
  raf = requestAnimationFrame(tick);
  const api = {
    // the objects: each box becomes an elliptical obstacle centred on it
    setSources(list) { obstacles = (list || []).map((b) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2, rx: Math.max(1, b.w / 2), ry: Math.max(1, b.h / 2) })); },
    setPointer(x, y, on) { ptr = { x, y, on: !!on }; },
    params,
    // wipe the trails so a new setting can be read on a clean sheet: the canvas, and the paths behind it that would
    // otherwise be redrawn on the very next frame
    clear() { ctx.clearRect(0, 0, vw, vh); for (const p of P) { p.ring[0] = p.x; p.ring[1] = p.y; p.head = 0; p.n = 1; } },
    // shrinking the canvas to nothing hands the backing store back now rather than at the next collection
    destroy() { alive = false; cancelAnimationFrame(raf); ro.disconnect(); for (const c of [canvas, map]) { c.width = c.height = 0; if (c.parentNode) c.parentNode.removeChild(c); } },
  };
  if (new URLSearchParams(location.search).has('dev')) import('./field-dev.js').then((m) => { if (alive) m.mount(api); }).catch((e) => console.error('field-dev', e));
  return api;
}
