// Profiles the home-page pond (pond.js) in a real Chrome and prints what it costs per frame.
//
// This is a measurement, not a check: timing is not pass/fail, so it is not part of `npm run check`.
// Run with `npm run profile:pond` (or `node tools/profile-pond.mjs --help` for the options).
//
// How it works, with no dependency beyond what Node and the machine already have:
// - A small node:http server serves the built site (index.html, app.js, pond.js and the rest) from the repo root,
//   with COOP/COEP headers so the page is cross-origin isolated and performance.now() resolves to 5 us instead of
//   100 us.
// - Requests for /pond.js get pond.js rewritten on the fly; the file on disk is never touched. The rewrite times
//   step() and draw() inside mount()'s rAF tick, exposes the world and the handle to the profiler, can stub mount()
//   out entirely (the pond-off baseline), and with --sections or --ablate cuts draw() into its sections to time or
//   skip each one. Each rewrite anchors on an exact line of pond.js and fails loudly if pond.js has moved on.
// - Chrome (the installed one; CHROME=<path> overrides) is launched with a throwaway profile and driven over the
//   DevTools protocol through Node's built-in WebSocket. It runs headed by default so the canvas rasters on the real
//   GPU; --headless is there but software raster inflates the fill cost it reports.
// - Each scenario gets a fresh tab: viewport and DPR by Emulation.setDeviceMetricsOverride, CPU throttle by
//   Emulation.setCPUThrottlingRate, the tab brought to the front with focus emulated, and sampling starts only once
//   rAF frames are seen to advance (a backgrounded tab reports stalled numbers without erroring).
// - Every tab emulates prefers-reduced-motion: no-preference (Emulation.setEmulatedMedia), whatever the machine
//   reports, so the pond always runs in full motion: under reduced motion the fish crawl, the striders hold still and
//   the dragonfly never comes, and the profile would measure a different pond. The summary line says so.
// - Per scenario it reports: step() and draw() JS time per frame, the rAF frame interval distribution from a probe
//   loop that runs in both modes, main-thread busy share (Performance.getMetrics TaskDuration), and from a trace the
//   busy time per frame of the renderer main thread, the GPU process main thread (where 2D canvas commands raster)
//   and the viz compositor thread, plus V8 GC time on the renderer main thread.
//
// What it cannot see: the GPU hardware's own execution time (no GPU timer queries through CDP), so "gpu ms/fr" is the
// GPU process main thread's busy time issuing the work, not time on the GPU itself. CPU throttling slows only the
// renderer; the GPU process runs at full speed at every throttle rate.
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, extname, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const REDUCED = 'no-preference'; // the prefers-reduced-motion every tab emulates

// ---------- options ----------
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [a, true]; }));
if (args.help) {
  console.log(`node tools/profile-pond.mjs [options]
  --seconds=10            sampling window per scenario
  --throttle=1,4,6        CPU throttle rates
  --view=1080p1,1440p2    viewports: 1080p1 = 1920x1080 at DPR 1, 1440p2 = 2560x1440 at DPR 2
  --load=idle,busy        idle: fish only; busy: a scripted drag dropping treats across the water
  --mode=off,on           pond-off baseline and pond-on
  --coast-res=1,2         pond-on runs at each coastRes (coast layer resolution, CSS px scale); default: the page's own
  --sections              time each section of drawCoasts() and drawLive(), and the coast copy (JS time only)
  --ablate=a,b            extra pond-on runs, each with draw() sections skipped: water,land,shore,fish,treats,surface (pad and flower shadows, pads, flowers),reeds,striders,fly,rings;
                          join with + to skip several in one run (land+shore), or 'all' for an empty draw()
  --cpu-profile           V8 CPU profile during pond-on runs; prints top self-time functions
  --headless              headless Chrome (software raster: inflates fill cost)
  --json=<path>           write every raw result to a JSON file`);
  process.exit(0);
}
const list = (v, d) => String(v ?? d).split(',').map((s) => s.trim()).filter(Boolean);
const SECONDS = Number(args.seconds ?? 10);
const THROTTLES = list(args.throttle, '1,4,6').map(Number);
const VIEWS = { '1080p1': { width: 1920, height: 1080, dpr: 1 }, '1440p2': { width: 2560, height: 1440, dpr: 2 } };
const VIEW_KEYS = list(args.view, '1080p1,1440p2');
for (const v of VIEW_KEYS) if (!VIEWS[v]) throw new Error('unknown --view ' + v);
const LOADS = list(args.load, 'idle,busy');
const MODES = list(args.mode, 'off,on');
const ABLATE = args.ablate ? list(args.ablate) : [];
const COAST_RES = args['coast-res'] ? list(args['coast-res']).map(Number) : [null];
const SECTIONS = ['water', 'land', 'shore', 'fish', 'treats', 'surface', 'reeds', 'striders', 'fly'];
const ablation = (item) => (item === 'all' ? [...SECTIONS] : item.split('+'));
for (const a of ABLATE) for (const p of ablation(a)) if (!SECTIONS.includes(p) && p !== 'rings') throw new Error('unknown --ablate ' + p);

// ---------- pond.js, rewritten on the fly ----------
function once(src, from, to) {
  const n = src.split(from).length - 1;
  if (n !== 1) throw new Error(`profile-pond: expected exactly one "${from.trim()}" in pond.js, found ${n}; update the rewrite`);
  return src.replace(from, () => to);
}
function instrumentedPond() {
  let src = readFileSync(join(ROOT, 'pond.js'), 'utf8').replace(/\r\n/g, '\n'); // a Windows checkout has CRLF
  // the pond-off baseline: mount() hands back a handle that does nothing, so the page runs exactly as it would with the
  // pond, minus the pond
  src = once(src, 'export function mount(container) {\n', `export function mount(container) {
  if (globalThis.__prof && __prof.cfg.off) { const nop = () => {}; const stub = { setSources: nop, setOutlines: nop, setPointer: nop, hit: () => -1, drop: nop, strokeStart: nop, strokeTo: nop, strokeEnd: nop, strokeCancel: nop, params: {}, clear: nop, destroy: nop }; globalThis.__pondApi = stub; return stub; }
`);
  src = once(src, '\n  const ro = new ResizeObserver(resize);', '\n  globalThis.__pondWorld = world;\n  const ro = new ResizeObserver(resize);');
  src = once(src, '\n    step(world, dt);\n', '\n    const __t0 = performance.now(); step(world, dt); const __t1 = performance.now();\n');
  src = once(src, '\n    paint();\n', '\n    const __t2 = performance.now(); paint(); if (globalThis.__prof) __prof.tick(__t1 - __t0, performance.now() - __t2);\n');
  src = once(src, '\n  return api;\n}', '\n  globalThis.__pondApi = api;\n  return api;\n}');
  if (args.sections || ABLATE.length) {
    // the coast layer's sections; then 'copy' runs from the end of the coasts to the first live section (the scaled
    // copy onto the canvas when the coasts are drawn apart, nearly nothing when they are drawn straight on)
    src = sectionFn(src, 'export function drawCoasts(ctx, w, ink, paper, water = paper) {', [
      ['water', (l) => l.startsWith('ctx.globalAlpha = 1; ctx.fillStyle = water;')],
      ['land', (l) => l === 'ctx.fillStyle = paper;'],
      ['shore', (l) => l.startsWith('ctx.strokeStyle = ink;')],
    ], 'copy');
    src = sectionFn(src, 'export function drawLive(ctx, w, ink, paper, gold) {', [
      ['fish', (l) => l.startsWith('// the school')],
      ['treats', (l) => l.startsWith('// ripples, then')],
      ['surface', (l) => l.startsWith('// the surface: every shadow first')],
      ['reeds', (l) => l.startsWith('// the reeds:')],
      ['striders', (l) => l.startsWith('// the striders:')],
      ['fly', (l) => l.startsWith('// the air:')],
    ], null);
  }
  return src;
}
// Cuts one of pond.js's draw functions (drawCoasts, drawLive) at the first line of each section. Each section is a run
// of whole statements, so wrapping it in an if-block to skip it keeps the braces balanced. The function's end opens
// the section named by after; null closes the frame's timing. drawLive sets its own stroke style, so skipping a coast
// section leaves the fish as they are.
function sectionFn(src, head, anchors, after) {
  const start = src.indexOf(head);
  const end = src.indexOf('\n}\n', start);
  if (start < 0 || end < 0) throw new Error(`profile-pond: "${head}" not found in pond.js; update the rewrite`);
  const lines = src.slice(start, end).split('\n');
  const at = anchors.map(([name, test]) => { const i = lines.findIndex((l) => test(l.trim())); if (i < 0) throw new Error(`profile-pond: section "${name}" not found; update the rewrite`); return i; });
  const last = lines.length - 1; // the closing `ctx.globalAlpha = 1;`
  if (lines[last].trim() !== 'ctx.globalAlpha = 1;') throw new Error(`profile-pond: "${head}" no longer ends where the rewrite expects`);
  for (let k = 0; k < at.length - 1; k++) if (!(at[k] < at[k + 1])) throw new Error('profile-pond: sections out of order');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const k = at.indexOf(i);
    if (k > 0) out.push('  }');
    if (k >= 0) out.push(`  __prof.sec('${anchors[k][0]}'); if (!__prof.cfg.ablate.includes('${anchors[k][0]}')) {`);
    if (i === last) out.push('  }', `  __prof.sec(${after === null ? 'null' : `'${after}'`});`);
    out.push(lines[i]);
  }
  return src.slice(0, start) + out.join('\n') + src.slice(end);
}

// ---------- the page-side recorder, injected before any page script ----------
const initScript = (cfg) => `(() => {
  const P = globalThis.__prof = { cfg: ${JSON.stringify(cfg)}, n: 0, recording: false, frames: [], step: [], draw: [], secAcc: {}, secN: 0, cur: null, ct: 0, treats: 0, treatN: 0 };
  P.tick = (s, d) => { if (!P.recording) return; P.step.push(s); P.draw.push(d); const w = globalThis.__pondWorld; if (w) { P.treats += w.treats.length; P.treatN++; } };
  P.sec = (name) => { const t = performance.now(); if (P.cur && P.recording) P.secAcc[P.cur] = (P.secAcc[P.cur] || 0) + t - P.ct; if (name === null && P.recording) P.secN++; P.cur = name; P.ct = t; };
  P.start = () => { P.frames = []; P.step = []; P.draw = []; P.secAcc = {}; P.secN = 0; P.treats = 0; P.treatN = 0; console.timeStamp('__pondStart'); P.recording = true; };
  P.stop = () => { P.recording = false; console.timeStamp('__pondEnd'); };
  const probe = (t) => { P.n++; if (P.recording) P.frames.push(t); requestAnimationFrame(probe); };
  requestAnimationFrame(probe);
})();`;

// ---------- the static server ----------
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.pdf': 'application/pdf', '.mp4': 'video/mp4', '.webm': 'video/webm' };
const pondSrc = instrumentedPond();
const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = resolve(ROOT, '.' + (path === '/' ? '/index.html' : path));
  const head = { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'credentialless', 'Cache-Control': 'no-store' };
  if (path === '/pond.js') { res.writeHead(200, { ...head, 'Content-Type': 'text/javascript' }); res.end(pondSrc); return; }
  if (!(file === ROOT || file.startsWith(ROOT + sep)) || !existsSync(file)) { res.writeHead(404, head); res.end(); return; }
  try { const body = readFileSync(file); res.writeHead(200, { ...head, 'Content-Type': MIME[extname(file).toLowerCase()] || 'application/octet-stream' }); res.end(body); }
  catch { res.writeHead(404, head); res.end(); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

// ---------- Chrome and the protocol ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome'].find(existsSync);
if (!CHROME) { console.error('profile-pond: no Chrome found; set CHROME=<path to chrome>'); process.exit(2); }
const profileDir = mkdtempSync(join(tmpdir(), 'pond-profile-'));
const chrome = spawn(CHROME, [
  '--remote-debugging-port=0', `--user-data-dir=${profileDir}`, '--no-first-run', '--no-default-browser-check',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
  '--disable-extensions', '--window-position=0,0', '--window-size=1600,1000', ...(args.headless ? ['--headless=new'] : []), 'about:blank',
], { stdio: 'ignore' });
let wsUrl = null;
for (let i = 0; i < 100 && !wsUrl; i++) { await sleep(100); try { const [port, path] = readFileSync(join(profileDir, 'DevToolsActivePort'), 'utf8').split('\n'); if (port && path) wsUrl = `ws://127.0.0.1:${port.trim()}${path.trim()}`; } catch {} }
if (!wsUrl) { console.error('profile-pond: Chrome did not open its DevTools port'); chrome.kill(); process.exit(2); }

const ws = new WebSocket(wsUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let nextId = 0; const pending = new Map(); const listeners = new Set();
ws.onmessage = (m) => {
  const msg = JSON.parse(typeof m.data === 'string' ? m.data : Buffer.from(m.data).toString());
  if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.rej(new Error(p.method + ': ' + msg.error.message)) : p.res(msg.result); }
  else for (const f of listeners) f(msg);
};
const send = (method, params = {}, sessionId) => new Promise((res, rej) => { const id = ++nextId; pending.set(id, { res, rej, method }); ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); });

let cleaned = false;
const cleanup = () => { if (cleaned) return; cleaned = true; try { ws.close(); } catch {} try { chrome.kill(); } catch {} server.close(); setTimeout(() => { try { rmSync(profileDir, { recursive: true, force: true }); } catch {} }, 500); };
process.on('exit', cleanup);

// GPU mode: what Chrome says it is compositing and rastering canvas with
const info = await send('SystemInfo.getInfo');
const gpuDev = (info.gpu.devices || [])[0] || {};
const fs = info.gpu.featureStatus || {};
const gpu = { device: gpuDev.deviceString || '?', vendor: gpuDev.vendorString || '?', canvas2d: fs['2d_canvas'], compositing: fs.gpu_compositing, rasterization: fs.rasterization, headless: !!args.headless };

// ---------- one scenario ----------
const TRACE_CATS = ['toplevel', 'devtools.timeline', 'gpu', 'viz', '__metadata'];
async function trace(fn) {
  const events = [];
  const off = (msg) => { if (msg.method === 'Tracing.dataCollected') for (const e of msg.params.value) events.push(e); };
  listeners.add(off);
  await send('Tracing.start', { traceConfig: { includedCategories: TRACE_CATS, recordMode: 'recordAsMuchAsPossible' }, transferMode: 'ReportEvents' });
  const out = await fn();
  const done = new Promise((r) => { const f = (msg) => { if (msg.method === 'Tracing.tracingComplete') { listeners.delete(f); r(); } }; listeners.add(f); });
  await send('Tracing.end'); await done; listeners.delete(off);
  return { out, events };
}

async function runScenario(sc) {
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const s = (m, p) => send(m, p, sessionId);
  const ev = async (expression) => { const r = await s('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error('page: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text)); return r.result.value; };
  try {
    await s('Page.enable'); await s('Runtime.enable'); await s('Performance.enable', { timeDomain: 'timeTicks' });
    await s('Page.bringToFront');
    await s('Emulation.setFocusEmulationEnabled', { enabled: true });
    await s('Emulation.setDeviceMetricsOverride', { width: sc.view.width, height: sc.view.height, deviceScaleFactor: sc.view.dpr, mobile: false });
    await s('Emulation.setCPUThrottlingRate', { rate: sc.throttle });
    await s('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: REDUCED }] });
    await s('Page.addScriptToEvaluateOnNewDocument', { source: initScript({ off: sc.mode === 'off', ablate: sc.ablate ? ablation(sc.ablate) : [] }) });
    await s('Page.navigate', { url: BASE + '/' });
    // wait for the pond (or its stub) to mount, then for frames to be seen advancing
    let ready = false;
    for (let i = 0; i < 300 && !ready; i++) { await sleep(100); ready = await ev('!!globalThis.__pondApi').catch(() => false); }
    if (!ready) throw new Error('the pond never mounted');
    if (await ev('matchMedia("(prefers-reduced-motion: reduce)").matches')) throw new Error('the tab still reports reduced motion');
    const n0 = await ev('__prof.n'); await sleep(1000); const n1 = await ev('__prof.n');
    if (n1 - n0 < 10) throw new Error(`frames are not advancing (${n1 - n0} in 1 s); the tab is backgrounded or stalled`);
    if (sc.ablate && ablation(sc.ablate).includes('rings')) await ev('__pondApi.params.rings = 0');
    if (sc.cr != null) await ev(`__pondApi.params.coastRes = ${sc.cr}`);
    await sleep(2500); // the pond's 900 ms fade-in, and the world settling
    const page = await ev('({ iso: crossOriginIsolated, dpr: devicePixelRatio, w: innerWidth, h: innerHeight, fish: globalThis.__pondWorld ? __pondWorld.fish.length : 0, canvas: (() => { const c = document.querySelector("canvas"); return c ? c.width + "x" + c.height : null; })() })');

    // the busy load: a real mouse drag (through CDP input) looping across open water near the bottom of the view
    let driving = false, driver = null;
    const W = sc.view.width, H = sc.view.height;
    const pathAt = (t) => [W * (0.5 + 0.42 * Math.sin(0.9 * t)), H * (0.88 + 0.05 * Math.sin(2.3 * t))];
    if (sc.load === 'busy') {
      const clear = await ev(`(() => { const ok = (x, y) => { const e = document.elementFromPoint(x, y); return __pondApi.hit(x, y) < 0 && !(e && e.closest && e.closest('a,button,input,select,textarea,[role=button]')); }; return ${JSON.stringify(Array.from({ length: 40 }, (_, i) => pathAt(i * 0.17)))}.map(([x, y]) => ok(x, y)); })()`);
      const i0 = clear.indexOf(true); if (i0 < 0) throw new Error('no open water on the drag path');
      const t0 = i0 * 0.17; const [x0, y0] = pathAt(t0);
      await s('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x0, y: y0 });
      await s('Input.dispatchMouseEvent', { type: 'mousePressed', x: x0, y: y0, button: 'left', buttons: 1, clickCount: 1 });
      driving = true;
      driver = (async () => { const start = Date.now(); while (driving) { const [x, y] = pathAt(t0 + (Date.now() - start) / 1000); await s('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'left', buttons: 1 }); await sleep(16); } })();
      await sleep(3000); // fill the water toward the treat cap before sampling
    }
    if (args['cpu-profile'] && sc.mode === 'on') { await s('Profiler.enable'); await s('Profiler.setSamplingInterval', { interval: 100 }); }
    const { out, events } = await trace(async () => {
      await sleep(300);
      if (args['cpu-profile'] && sc.mode === 'on') await s('Profiler.start');
      await ev('__prof.start()');
      const m0 = await s('Performance.getMetrics');
      await sleep(SECONDS * 1000);
      await ev('__prof.stop()');
      const m1 = await s('Performance.getMetrics');
      const prof = args['cpu-profile'] && sc.mode === 'on' ? (await s('Profiler.stop')).profile : null;
      await sleep(200);
      return { m0, m1, prof };
    });
    driving = false; if (driver) await driver;
    if (sc.load === 'busy') { const [x, y] = pathAt(0); await s('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 }); }
    const dump = await ev('({ frames: __prof.frames, step: __prof.step, draw: __prof.draw, secAcc: __prof.secAcc, secN: __prof.secN, treats: __prof.treatN ? __prof.treats / __prof.treatN : 0, hash: location.hash })');
    return { ...sc, page, dump, metrics: [out.m0, out.m1], trace: analyseTrace(events, dump.frames.length), prof: out.prof ? analyseProfile(out.prof, dump.frames.length) : null };
  } finally {
    await send('Target.closeTarget', { targetId }).catch(() => {});
  }
}

// ---------- analysis ----------
const stats = (a) => { if (!a.length) return { mean: NaN, p95: NaN, max: NaN }; const s = [...a].sort((x, y) => x - y); return { mean: a.reduce((x, y) => x + y, 0) / a.length, p95: s[Math.min(s.length - 1, Math.floor(0.95 * s.length))], max: s[s.length - 1] }; };
function unionMs(intervals, lo, hi) {
  const iv = intervals.map(([a, b]) => [Math.max(a, lo), Math.min(b, hi)]).filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  let tot = 0, ca = -Infinity, cb = -Infinity;
  for (const [a, b] of iv) { if (a > cb) { if (cb > ca) tot += cb - ca; ca = a; cb = b; } else cb = Math.max(cb, b); }
  if (cb > ca) tot += cb - ca;
  return tot / 1000;
}
function analyseTrace(events, frames) {
  const threadName = new Map(), procName = new Map();
  for (const e of events) if (e.ph === 'M') { if (e.name === 'thread_name') threadName.set(e.pid + ':' + e.tid, e.args.name); if (e.name === 'process_name') procName.set(e.pid, e.args.name); }
  const stamp = (msg) => events.find((e) => e.name === 'TimeStamp' && e.args?.data?.message === msg);
  const a = stamp('__pondStart'), b = stamp('__pondEnd');
  if (!a || !b) return { error: 'no start/end markers in the trace' };
  const lo = a.ts, hi = b.ts;
  const byThread = new Map(); const gc = new Map();
  for (const e of events) {
    if (e.ph !== 'X' || !(e.dur > 0)) continue;
    const k = e.pid + ':' + e.tid;
    if (!byThread.has(k)) byThread.set(k, []);
    byThread.get(k).push([e.ts, e.ts + e.dur]);
    if (/^(MinorGC|MajorGC|V8\.GC)/.test(e.name)) { if (!gc.has(k)) gc.set(k, []); gc.get(k).push([e.ts, e.ts + e.dur]); }
  }
  const busy = (k) => (byThread.has(k) ? unionMs(byThread.get(k), lo, hi) : 0);
  const find = (name) => [...threadName].filter(([, n]) => n === name).map(([k]) => k);
  // the page's renderer is the one whose main thread carried the start marker
  const rendererPid = a.pid;
  const rMain = find('CrRendererMain').find((k) => k.startsWith(rendererPid + ':'));
  const rComp = find('Compositor').find((k) => k.startsWith(rendererPid + ':'));
  const gpuMain = find('CrGpuMain')[0];
  const viz = find('VizCompositorThread')[0];
  const per = (ms) => (frames ? ms / frames : NaN);
  return {
    windowMs: (hi - lo) / 1000,
    mainMs: per(busy(rMain)), compMs: per(busy(rComp)), gpuMs: per(busy(gpuMain)), vizMs: per(busy(viz)),
    gcMs: per(gc.has(rMain) ? unionMs(gc.get(rMain), lo, hi) : 0),
    found: { rMain: !!rMain, rComp: !!rComp, gpuMain: !!gpuMain, viz: !!viz },
  };
}
function analyseProfile(p, frames) {
  const node = new Map(p.nodes.map((n) => [n.id, n]));
  const self = new Map();
  for (let i = 0; i < p.samples.length; i++) { const n = node.get(p.samples[i]); const cf = n.callFrame; const key = `${cf.functionName || '(anonymous)'} ${cf.url ? cf.url.split('/').pop() + ':' + (cf.lineNumber + 1) : ''}`.trim(); self.set(key, (self.get(key) || 0) + (p.timeDeltas[i] || 0) / 1000); }
  return [...self].filter(([k]) => !/^\(idle\)/.test(k)).sort((x, y) => y[1] - x[1]).slice(0, 15).map(([k, ms]) => [k, ms / frames]);
}

// ---------- the matrix ----------
const scenarios = [];
for (const throttle of THROTTLES) for (const view of VIEW_KEYS) for (const load of LOADS) {
  for (const mode of MODES) for (const cr of mode === 'on' ? COAST_RES : [null]) scenarios.push({ throttle, viewKey: view, view: VIEWS[view], load, mode, cr });
  for (const cr of COAST_RES) for (const ablate of ABLATE) scenarios.push({ throttle, viewKey: view, view: VIEWS[view], load, mode: 'on', ablate, cr });
}
console.log(`pond profile: ${scenarios.length} scenarios x ${SECONDS} s; Chrome ${gpu.headless ? 'headless' : 'headed'}; GPU ${gpu.vendor} / ${gpu.device}; 2d_canvas=${gpu.canvas2d} gpu_compositing=${gpu.compositing} rasterization=${gpu.rasterization}; prefers-reduced-motion emulated as ${REDUCED}`);

const results = [];
for (const sc of scenarios) {
  const label = `${sc.throttle}x ${sc.viewKey} ${sc.load} ${sc.mode}${sc.cr != null ? ' cr' + sc.cr : ''}${sc.ablate ? ' -' + sc.ablate : ''}`;
  process.stdout.write(label + ' ... ');
  try { const r = await runScenario(sc); results.push(r); console.log(`ok (${r.dump.frames.length} frames, canvas ${r.page.canvas}, iso=${r.page.iso}, fish ${r.page.fish}, treats ${r.dump.treats.toFixed(1)}${r.dump.hash ? ', hash ' + r.dump.hash : ''})`); }
  catch (e) { console.log('FAILED: ' + e.message); results.push({ ...sc, error: e.message }); }
}

// ---------- report ----------
const f = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '-');
const row = (r) => {
  if (r.error) return null;
  const iv = r.dump.frames.slice(1).map((t, i) => t - r.dump.frames[i]);
  const I = stats(iv), S = stats(r.dump.step), D = stats(r.dump.draw);
  const met = (m, k) => m.metrics.find((x) => x.name === k)?.value ?? NaN;
  const busyShare = (met(r.metrics[1], 'TaskDuration') - met(r.metrics[0], 'TaskDuration')) / (met(r.metrics[1], 'Timestamp') - met(r.metrics[0], 'Timestamp'));
  // a gap over 250 ms means the tab stalled mid-sample (backgrounded, occluded, or the machine was busy): the row is
  // printed, flagged, and kept out of every difference below
  return { r, stalled: I.max > 250, fps: 1000 / I.mean, I, over20: iv.filter((x) => x > 20).length, over33: iv.filter((x) => x > 33).length, S, D, busyShare, t: r.trace };
};
const rows = results.map(row).filter(Boolean);
const pad = (s, n) => String(s).padEnd(n);
console.log('\n' + ['scenario'.padEnd(30), 'fps', 'int mean/p95', '>20', '>33', 'step mean/p95/max', 'draw mean/p95/max', 'main%', 'main ms/fr', 'gpu ms/fr', 'viz ms/fr', 'gc ms/fr'].join(' | '));
for (const x of rows) {
  const r = x.r;
  console.log([pad(`${r.throttle}x ${r.viewKey} ${r.load} ${r.mode}${r.cr != null ? ' cr' + r.cr : ''}${r.ablate ? ' -' + r.ablate : ''}${x.stalled ? ' STALLED' : ''}`, 30), f(x.fps, 1), `${f(x.I.mean, 1)}/${f(x.I.p95, 1)}`, x.over20, x.over33,
    r.mode === 'off' ? '-' : `${f(x.S.mean)}/${f(x.S.p95)}/${f(x.S.max)}`, r.mode === 'off' ? '-' : `${f(x.D.mean)}/${f(x.D.p95)}/${f(x.D.max)}`,
    f(100 * x.busyShare, 0), f(x.t.mainMs), f(x.t.gpuMs), f(x.t.vizMs), f(x.t.gcMs, 3)].join(' | '));
}
// marginal cost: pond-on minus pond-off, per frame
console.log('\nmarginal (on - off) per frame: main ms, gpu ms, viz ms, frames >20 ms on/off');
// base: the cell a pond-off baseline belongs to; key: a pond-on variant of it (its coastRes, when set)
const base = (r) => `${r.throttle}x ${r.viewKey} ${r.load}`;
const key = (r) => base(r) + (r.cr != null ? ` cr${r.cr}` : '');
const marg = {};
for (const x of rows) if (x.r.mode === 'on' && !x.r.ablate && !x.stalled) {
  const o = rows.find((y) => y.r.mode === 'off' && !y.stalled && base(y.r) === base(x.r)); if (!o) continue;
  const m = { main: x.t.mainMs - o.t.mainMs, gpu: x.t.gpuMs - o.t.gpuMs, viz: x.t.vizMs - o.t.vizMs, over20: [x.over20, o.over20] };
  marg[key(x.r)] = m;
  console.log(`  ${pad(key(x.r), 20)} main ${f(m.main)}  gpu ${f(m.gpu)}  viz ${f(m.viz)}  >20ms ${m.over20[0]}/${m.over20[1]}`);
}
if (ABLATE.length) {
  console.log('\nablation (full pond - pond with one section skipped) per frame: draw JS ms, main ms, gpu ms');
  for (const x of rows) if (x.r.ablate) {
    const full = rows.find((y) => y.r.mode === 'on' && !y.r.ablate && !y.stalled && key(y.r) === key(x.r)); if (!full || x.stalled) continue;
    console.log(`  ${pad(key(x.r), 20)} ${pad(x.r.ablate, 16)} draw ${f(full.D.mean - x.D.mean)}  main ${f(full.t.mainMs - x.t.mainMs)}  gpu ${f(full.t.gpuMs - x.t.gpuMs)}`);
  }
}
if (args.sections) {
  console.log('\ndraw() sections, JS ms per frame (mean)');
  for (const x of rows) if (x.r.mode === 'on' && !x.r.ablate && x.r.dump.secN) console.log(`  ${pad(key(x.r), 20)} ` + [...SECTIONS.slice(0, 3), 'copy', ...SECTIONS.slice(3)].map((k) => `${k} ${f((x.r.dump.secAcc[k] || 0) / x.r.dump.secN, 3)}`).join('  '));
}
if (args['cpu-profile']) {
  console.log('\nCPU profile, top self time (ms per frame)');
  for (const x of rows) if (x.r.prof) { console.log('  ' + key(x.r)); for (const [k, ms] of x.r.prof) console.log(`    ${f(ms, 3)}  ${k}`); }
}
// the verdict criterion, on 2560x1440 DPR 2 idle
const v1 = marg['1x 1440p2 idle'], v4 = marg['4x 1440p2 idle'];
if (v1 || v4) {
  console.log('\nverdict criterion (1440p2 idle; "sketchy" if any line is true):');
  if (v1) console.log(`  marginal main-thread cost at 1x > 2 ms/frame: ${f(v1.main)} -> ${v1.main > 2}; with GPU process: ${f(v1.main + v1.gpu)} -> ${v1.main + v1.gpu > 2}`);
  if (v4) console.log(`  marginal main-thread cost at 4x > 6 ms/frame: ${f(v4.main)} -> ${v4.main > 6}; with GPU process: ${f(v4.main + v4.gpu)} -> ${v4.main + v4.gpu > 6}`);
  if (v4) console.log(`  frames > 20 ms at 4x that the baseline lacks: on ${v4.over20[0]} vs off ${v4.over20[1]} -> ${v4.over20[0] > v4.over20[1]}`);
}
if (args.json) writeFileSync(String(args.json), JSON.stringify({ gpu, results: results.map(({ prof, ...r }) => ({ ...r, prof })) }, null, 1));
cleanup();
process.exit(0);
