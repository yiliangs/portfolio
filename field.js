// Home field: drafting dust. Particles ride a slow curl-noise current and leave hairline ink trails that fade, so the
// background reads like a plotter sketching construction lines. The two home objects bend the current — threads
// orbit and wrap them — and the cursor brushes the dust aside.
// mount(container) -> { setSources([{x,y,w,h}]), setPointer(x,y,active), destroy() }
const N = 700, FADE = 0.035, SPEED = 26; // particles, trail fade per frame, px/s base speed

// cheap 2D value noise
const hash = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
const noise = (x, y) => {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
};

export function mount(container) {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;';
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const css = getComputedStyle(document.documentElement);
  const INK = (css.getPropertyValue('--color-text').trim() || '#201f1d'), GOLD = (css.getPropertyValue('--color-accent').trim() || '#b68235');
  let vw = 1, vh = 1, alive = true, raf, sources = [], quiet = [], ptr = { x: -1e4, y: -1e4, on: false }, last = performance.now(), t = 0;
  // damping near the text blocks: 1 far away, 0 inside a quiet box
  const calm = (x, y) => { let k = 1; for (const q of quiet) { const dx = Math.max(q.x - x, 0, x - q.x - q.w), dy = Math.max(q.y - y, 0, y - q.y - q.h), d = Math.hypot(dx, dy); k = Math.min(k, Math.min(1, d / 70)); } return k; };
  const P = [];
  const spawn = (p) => { p.x = Math.random() * vw; p.y = Math.random() * vh; p.px = p.x; p.py = p.y; p.life = 0; p.ttl = 4 + Math.random() * 8; p.gold = Math.random() < 0.04; p.w = 0.45 + Math.random() * 0.5; };
  for (let i = 0; i < N; i++) { const p = {}; P.push(p); }
  const resize = () => {
    vw = container.clientWidth || 1; vh = container.clientHeight || 1;
    canvas.width = vw * dpr; canvas.height = vh * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const p of P) { spawn(p); p.life = Math.random() * p.ttl; }
  };
  const ro = new ResizeObserver(resize); ro.observe(container); resize();
  // the current at (x,y): curl of a drifting noise potential, plus each object's swirl (tangential, with a soft
  // inward pull so threads wrap the object at a respectful distance), plus the cursor's brush-away
  const S = 1 / 260, E = 0.6;
  const field = (x, y, out) => {
    const n = (a, b) => noise(a * S + t * 0.02, b * S - t * 0.013) + 0.5 * noise(a * S * 2.3 + 7.1, b * S * 2.3 + t * 0.03);
    out.x = (n(x, y + E) - n(x, y - E)) / (2 * E) * 130; out.y = -(n(x + E, y) - n(x - E, y)) / (2 * E) * 130;
    for (const s of sources) {
      const cx = s.x + s.w / 2, cy = s.y + s.h / 2, r = Math.min(140, Math.max(s.w, s.h) * 0.5), dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy) + 1e-3;
      if (d > r * 1.7) continue; // the swirl lives only close to the object; beyond it the noise current has the page
      const g = Math.exp(-((d - r) * (d - r)) / (r * r * 0.18)) * Math.min(1, (r * 1.7 - d) / (r * 0.3)); // a narrow band just outside the object, feathered to nothing
      const tx = -dy / d, ty = dx / d, inward = (d - r) / r; // tangent, and a pull back toward the band
      out.x += (tx * 1.1 - dx / d * inward * 0.5) * g * 40 * s.dir; out.y += (ty * 1.1 - dy / d * inward * 0.5) * g * 40 * s.dir;
    }
    if (ptr.on) { const dx = x - ptr.x, dy = y - ptr.y, d = Math.hypot(dx, dy) + 1e-3, g = Math.exp(-(d * d) / (110 * 110)); out.x += dx / d * g * 160; out.y += dy / d * g * 160; }
  };
  const v = { x: 0, y: 0 };
  const tick = (now) => {
    if (!alive) return; raf = requestAnimationFrame(tick);
    const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
    // trails thin away a little each frame
    ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = `rgba(0,0,0,${FADE})`; ctx.fillRect(0, 0, vw, vh);
    ctx.globalCompositeOperation = 'source-over'; ctx.lineCap = 'round';
    for (const p of P) {
      field(p.x, p.y, v);
      p.px = p.x; p.py = p.y; p.x += v.x * dt * SPEED / 26; p.y += v.y * dt * SPEED / 26; p.life += dt;
      // fade in and out over the particle's life so threads start and end softly
      const k = Math.min(1, p.life / 1.2, (p.ttl - p.life) / 1.2);
      if (p.life > p.ttl || p.x < -20 || p.y < -20 || p.x > vw + 20 || p.y > vh + 20) { spawn(p); continue; }
      const c = calm(p.x, p.y); if (c <= 0) continue;
      ctx.strokeStyle = p.gold ? GOLD : INK; ctx.globalAlpha = (p.gold ? 0.45 : 0.24) * k * c; ctx.lineWidth = p.w;
      ctx.beginPath(); ctx.moveTo(p.px, p.py); ctx.lineTo(p.x, p.y); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  };
  raf = requestAnimationFrame(tick);
  return {
    // the objects: threads orbit the roll one way and the cube the other
    setSources(list) { sources = (list || []).map((s, i) => ({ ...s, dir: i % 2 ? -1 : 1 })); },
    setPointer(x, y, on) { ptr = { x, y, on: !!on }; },
    // boxes the threads stay out of (the headline block, the footer)
    setQuiet(list) { quiet = list || []; },
    // shrinking the canvas to nothing hands the backing store back now rather than at the next collection
    destroy() { alive = false; cancelAnimationFrame(raf); ro.disconnect(); canvas.width = canvas.height = 0; if (canvas.parentNode) canvas.parentNode.removeChild(canvas); },
  };
}
