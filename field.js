// Home field: drafting dust on an ocean. A noise landscape spans the page; every particle rides its contour lines,
// which is the curl of the landscape, so the flow is divergence-free and never pools. The landscape is a slice
// through 3D noise and the slice moves slowly, so the contours morph rather than slide: the turbulence is constant
// and never settles into a pattern. The two home objects are obstacles, not features of the landscape: a particle
// heading for one sheds the part of its motion aimed at it, so it swerves past and carries on rather than circling. Trails are hairline ink that fades, so the background reads like a plotter
// sketching construction lines across the whole page, and the cursor brushes the dust aside.
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
    fade: [0.073, 0.005, 0.1, 0.001, 'trail fade per frame; lower is a longer wake'],
    alpha: [0.15, 0.02, 1, 0.01, 'ink opacity'],
    width: [0.8, 0.2, 3, 0.05, 'line width, px'],
  },
};
const defaults = () => Object.fromEntries(Object.values(PARAMS).flatMap((section) => Object.entries(section).map(([k, v]) => [k, v[0]])));

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
  const spawn = (p) => { do { p.x = Math.random() * vw; p.y = Math.random() * vh; } while (inside(p.x, p.y)); p.px = p.x; p.py = p.y; p.life = 0; p.ttl = params.life * (0.5 + Math.random() * 0.5); p.gold = Math.random() < 0.04; p.w = 0.65 + Math.random() * 0.7; };
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
  const tick = (now) => {
    if (!alive) return; raf = requestAnimationFrame(tick);
    const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
    if (P.length !== params.count) populate();
    map.style.display = params.showLandscape ? 'block' : 'none';
    if (params.showLandscape && frame++ % 3 === 0) drawMap();
    // trails thin away a little each frame
    ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = `rgba(0,0,0,${params.fade})`; ctx.fillRect(0, 0, vw, vh);
    ctx.globalCompositeOperation = 'source-over'; ctx.lineCap = 'round';
    for (const p of P) {
      field(p.x, p.y, v);
      p.px = p.x; p.py = p.y; p.x += v.x * dt; p.y += v.y * dt; p.life += dt;
      // fade in and out over the particle's life so threads start and end softly
      const k = Math.min(1, p.life / 1.2, (p.ttl - p.life) / 1.2);
      if (p.life > p.ttl || p.x < -20 || p.y < -20 || p.x > vw + 20 || p.y > vh + 20) { spawn(p); continue; }
      ctx.strokeStyle = p.gold ? GOLD : INK; ctx.globalAlpha = (p.gold ? params.alpha * 1.9 : params.alpha) * k; ctx.lineWidth = p.w * params.width;
      ctx.beginPath(); ctx.moveTo(p.px, p.py); ctx.lineTo(p.x, p.y); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  };
  raf = requestAnimationFrame(tick);
  const api = {
    // the objects: each box becomes an elliptical obstacle centred on it
    setSources(list) { obstacles = (list || []).map((b) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2, rx: Math.max(1, b.w / 2), ry: Math.max(1, b.h / 2) })); },
    setPointer(x, y, on) { ptr = { x, y, on: !!on }; },
    params,
    // wipe the trails so a new setting can be read on a clean sheet
    clear() { ctx.clearRect(0, 0, vw, vh); },
    // shrinking the canvas to nothing hands the backing store back now rather than at the next collection
    destroy() { alive = false; cancelAnimationFrame(raf); ro.disconnect(); for (const c of [canvas, map]) { c.width = c.height = 0; if (c.parentNode) c.parentNode.removeChild(c); } },
  };
  if (new URLSearchParams(location.search).has('dev')) import('./field-dev.js').then((m) => { if (alive) m.mount(api); }).catch((e) => console.error('field-dev', e));
  return api;
}
