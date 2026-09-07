// The home cube: a wireframe cube with "Development" struck in ink voxels inside it, read through the faces.
// Anchored to a viewport box like the parchment roll. On click it collapses into the Development platform in three
// beats — the word dissolves, the cube travels and turns into the platform's axonometric pose, then presses down into a
// sheet with the platform's exact proportions and projection — so the parchment platform can take over unseen.
// mount(container) -> { setAnchor, collapse, reset, setPlatformFrame, setInk, setHover, setOpacity, destroy }
import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

const INK = 0x1a1918;
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const smooth = (x) => x * x * (3 - 2 * x);
const cubicInOut = (x) => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;

// (unused now that the word is extruded type) letterforms sampled off a canvas into a voxel field
function wordVoxels(text, font, cols, rows) {
  const c = document.createElement('canvas'); c.width = cols; c.height = rows;
  const x = c.getContext('2d');
  x.clearRect(0, 0, cols, rows);
  x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#fff'; x.font = font;
  x.fillText(text, cols / 2, rows / 2 + 0.5);
  const d = x.getImageData(0, 0, cols, rows).data, out = [];
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) if (d[(j * cols + i) * 4 + 3] > 90) out.push([i, j]);
  return out;
}

export function mount(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setClearColor(0x000000, 0);
  renderer.domElement.style.cssText = 'width:100%;height:100%;display:block;';
  container.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(24, 1, 0.1, 200);
  // the cube is seen in perspective; the platform in parallel projection. As the cube flattens the fov closes toward 3°
  // (the parchment's platform fov) while the camera backs off to keep the same visible height
  const VIS_H = 2 * 6 * Math.tan(12 * Math.PI / 180);
  let visH = VIS_H, visW = VIS_H;
  const project = (f) => {
    const fov = 24 * (1 - f) + 3 * f, ht = Math.tan(fov / 2 * Math.PI / 180);
    camera.fov = fov; camera.position.set(0, 0, VIS_H / (2 * ht)); camera.lookAt(0, 0, 0); camera.updateProjectionMatrix();
    visH = VIS_H; visW = visH * camera.aspect;
  };
  project(0);

  const CS = 1;
  const cube = new THREE.Group(); scene.add(cube);
  const shell = new THREE.Group(); cube.add(shell); // takes the flattening, so the lettering keeps its own scale
  const box = new THREE.BoxGeometry(CS, CS, CS);
  const faceMat = new THREE.MeshBasicMaterial({ color: INK, transparent: true, opacity: 0.04, side: THREE.BackSide, depthWrite: false });
  const edgeMat = new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: 0.5 });
  shell.add(new THREE.Mesh(box, faceMat), new THREE.LineSegments(new THREE.EdgesGeometry(box), edgeMat));
  // the word sits on a plane inside the cube, kept facing the viewer while the cube turns around it
  const inner = new THREE.Group(); cube.add(inner);
  // 3D lettering: the word is extruded type, paper faces under a fixed key light with ink sides, so the profile reads
  // as a modelled object. Its group faces the viewer (only a whisper of the cube's turn leaks through)
  // drawn like the shell: a faint ink wash on the faces and ink edge lines
  const voxMat = new THREE.MeshBasicMaterial({ color: INK, transparent: true, opacity: 0.06, depthWrite: false });
  const voxEdgeMat = new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: 0.7 });
  let textMesh = null, textW = 1, textH = 1;
  const DEPTH = CS * 0.035;
  // glyph outlines from a typeface.json (the same format three's FontLoader reads), extruded with core ExtrudeGeometry —
  // so no addon modules (they import the bare 'three' specifier, which fails without an import map)
  const glyphShapes = (data, text, size) => {
    const scale = size / data.resolution, shapes = []; let ox = 0;
    for (const ch of text) {
      const gl = data.glyphs[ch] || data.glyphs['?']; if (!gl) continue;
      if (gl.o) {
        const cmd = gl.o.split(' '); let path = null; const paths = [];
        for (let i = 0; i < cmd.length;) {
          const c = cmd[i++]; const n = () => ox + parseFloat(cmd[i++]) * scale, m = () => parseFloat(cmd[i++]) * scale;
          if (c === 'm') { path = new THREE.Path(); paths.push(path); const x = n(), y = m(); path.moveTo(x, y); }
          else if (c === 'l') { const x = n(), y = m(); path.lineTo(x, y); }
          else if (c === 'q') { const x = n(), y = m(), cx = n(), cy = m(); path.quadraticCurveTo(cx, cy, x, y); }
          else if (c === 'b') { const x = n(), y = m(), c1x = n(), c1y = m(), c2x = n(), c2y = m(); path.bezierCurveTo(c1x, c1y, c2x, c2y, x, y); }
        }
        // outer contour + holes: the largest-area path is the outline, the rest are holes (letters like D, e, o, p)
        const area = (p) => { const pts = p.getPoints(12); let a = 0; for (let i = 0; i < pts.length; i++) { const q = pts[(i + 1) % pts.length]; a += pts[i].x * q.y - q.x * pts[i].y; } return Math.abs(a); };
        paths.sort((a, b) => area(b) - area(a));
        const sh = new THREE.Shape(); sh.curves = paths[0].curves; sh.holes = paths.slice(1);
        shapes.push(sh);
      }
      ox += gl.ha * scale;
    }
    return shapes;
  };
  fetch('https://unpkg.com/three@0.160.0/examples/fonts/helvetiker_regular.typeface.json').then((r) => r.json()).then((data) => {
    if (!alive || textMesh) return;
    const shapes = glyphShapes(data, 'Development', 0.1);
    const g = new THREE.ExtrudeGeometry(shapes, { depth: DEPTH, curveSegments: 6, bevelEnabled: false });
    g.computeBoundingBox(); const bb = g.boundingBox;
    textW = bb.max.x - bb.min.x; textH = bb.max.y - bb.min.y;
    // take the centering offsets off the box before anything moves it: BufferGeometry.applyMatrix4 recomputes an
    // already-computed boundingBox in place, so translating g first would silently zero these out
    const cx = -(bb.min.x + bb.max.x) / 2, cy = -(bb.min.y + bb.max.y) / 2;
    g.dispose(); // g only ever measured the extruded shapes; the word itself is drawn as cap outlines below
    textMesh = new THREE.Group();
    // only the cap outlines (front and back contours), not the extrusion's side facets — those pile up along curves
    const pts = []; for (const sh of shapes) for (const path of [sh, ...sh.holes]) { const q = path.getPoints(8); for (let i = 0; i < q.length; i++) { const a = q[i], b = q[(i + 1) % q.length]; for (const z of [DEPTH / 2, -DEPTH / 2]) pts.push(a.x, a.y, z, b.x, b.y, z); } }
    const og = new THREE.BufferGeometry(); og.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); og.translate(cx, cy, 0);
    textMesh.add(new THREE.LineSegments(og, voxEdgeMat));
    textMesh.scale.setScalar((CS * 0.84) / textW);
    inner.add(textMesh); shownDis = -1;
  }).catch((e) => console.error('home text failed', e));
  let shownDis = -1;
  // the word dissolves as a whole: it rises, thins and shrinks away
  const layoutVoxels = (dis) => {
    if (!textMesh) return;
    const pv = smooth(dis), sc = (CS * 0.84) / textW * (1 - pv * 0.6);
    textMesh.position.set(0, pv * pv * CS * 0.3, 0); textMesh.scale.setScalar(Math.max(0.0001, sc));
    textMesh.visible = dis < 1;
  };

  // ---- placement: world position + scale so the cube fills a viewport-px anchor box
  const ISO_TILT = -(Math.PI / 2 - 22 * Math.PI / 180), ISO_TURN = 20 * Math.PI / 180;
  // the platform's frame: sheet W×H, the head-room its columns need, and its pose. Overridden with the parchment's
  // own numbers before a collapse so the landed plate is the platform, not a likeness of it
  let frame = { W: 2.9, H: 1.55, stack: 2.15, tilt: ISO_TILT, turn: ISO_TURN };
  let anchor = { x: 0, y: 0, w: 1, h: 1 }, ax = 0, ay = 0, as = 1;
  let vw = 1, vh = 1;
  let hover = 0, hoverTo = 0, alpha = 1, alphaTo = 1;
  let col = null, dis = 0, trav = 0, flat = 0; // the collapse timeline and its three beats
  const CORNERS = [];
  for (const sx of [-0.5, 0.5]) for (const sy of [-0.5, 0.5]) for (const sz of [-0.5, 0.5]) CORNERS.push(new THREE.Vector3(sx * CS, sy * CS, sz * CS));
  const cv = new THREE.Vector3();
  // the exact projected footprint of the (rotated, flattening) shell. At flat = 1 this is the parchment's own fit:
  // the turned sheet's width, its foreshortened depth plus the column head-room, shifted down by half that room
  const fit = () => {
    const pxw = visW / vw, room = frame.stack * Math.abs(Math.sin(frame.tilt)) * flat;
    let mx = 0, my = 0;
    for (const c of CORNERS) {
      cv.copy(c).multiply(shell.scale).applyQuaternion(cube.quaternion);
      mx = Math.max(mx, Math.abs(cv.x)); my = Math.max(my, Math.abs(cv.y));
    }
    const ex = Math.max(2 * mx, 0.4 * CS), ey = Math.max(2 * my, 0.4 * CS) + room;
    as = Math.min(anchor.w * pxw / (ex * 1.08), anchor.h * pxw / (ey * 1.08));
    ax = (anchor.x + anchor.w / 2 - vw / 2) * pxw;
    ay = -(anchor.y + anchor.h / 2 - vh / 2) * pxw - 0.5 * room * as;
  };
  const resize = () => {
    vw = container.clientWidth || 1; vh = container.clientHeight || 1;
    renderer.setSize(vw, vh, false); camera.aspect = vw / vh; project(flat); fit();
  };
  const ro = new ResizeObserver(resize); ro.observe(container); resize();

  const inkCur = new THREE.Color(INK), inkTo = new THREE.Color(INK);
  const qFree = new THREE.Quaternion(), qPose = new THREE.Quaternion(), qIdent = new THREE.Quaternion(), eul = new THREE.Euler();
  let px = 0, py = 0, tx = 0, ty = 0, alive = true, raf, last = performance.now(), t = 0;
  const onMove = (e) => {
    const cx = anchor.x + anchor.w / 2, cy = anchor.y + anchor.h / 2, r = Math.max(anchor.w, anchor.h);
    tx = Math.max(-0.7, Math.min(0.7, (e.clientX - cx) / r));
    ty = Math.max(-0.7, Math.min(0.7, (e.clientY - cy) / r));
  };
  window.addEventListener('pointermove', onMove, { passive: true });

  const tick = (now) => {
    if (!alive) return; raf = requestAnimationFrame(tick);
    const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
    px += (tx - px) * 0.06; py += (ty - py) * 0.06;
    if (col) {
      // beats: the word dissolves (0–0.4), the cube travels and turns into pose (0.22–0.72), then presses flat (0.6–1);
      // the expand runs the same film backwards, from the plate to the cube
      const u0 = clamp01((now - col.t0) / col.dur), u = col.reverse ? 1 - u0 : u0;
      dis = smooth(clamp01(u / 0.4)); trav = cubicInOut(clamp01((u - 0.22) / 0.5)); flat = cubicInOut(clamp01((u - 0.6) / 0.4));
      const L = (a, b) => a + (b - a) * trav;
      anchor = { x: L(col.cube.x, col.plate.x), y: L(col.cube.y, col.plate.y), w: L(col.cube.w, col.plate.w), h: L(col.cube.h, col.plate.h) };
      if (u0 >= 1 && col.reverse) { anchor = { ...col.cube }; col = null; dis = trav = flat = 0; }
    }
    hover += (hoverTo - hover) * 0.1;
    alpha += (alphaTo - alpha) * 0.09;
    // free pose: a slow turn nudged by the cursor; landed pose: the platform's axonometric (in-plane turn, then tilt)
    eul.set(-0.22 + Math.sin(t * 0.42) * 0.05 - py * 0.16, 0.5 + t * 0.16 + px * 0.3, 0); qFree.setFromEuler(eul);
    eul.set(frame.tilt, 0, frame.turn); qPose.setFromEuler(eul);
    cube.quaternion.slerpQuaternions(qFree, qPose, trav);
    // flattening: the shell takes the sheet's proportions and loses its thickness
    shell.scale.set(1 + (frame.W / CS - 1) * flat, 1 + (frame.H / CS - 1) * flat, 1 - 0.99 * flat);
    project(flat); fit();
    cube.position.set(ax, ay + Math.cos(t * 0.55) * visH * 0.012 * (1 - trav), 0);
    cube.scale.setScalar(as * (1 + hover * 0.06));
    // the lettering only half-counters the cube's turn, so it stays legible yet shows its depth
    inner.quaternion.copy(cube.quaternion).invert().slerp(qIdent, 0.12);
    if (dis !== shownDis) { shownDis = dis; layoutVoxels(dis); }
    // the landed plate takes the platform's stroke and sheet weights
    edgeMat.opacity = Math.max(0, ((0.5 + hover * 0.3) * (1 - flat) + 0.62 * flat) * alpha);
    faceMat.opacity = Math.max(0, (0.04 * (1 - flat) + 0.14 * flat) * alpha);
    voxMat.opacity = Math.max(0, 0.06 * (1 - dis) * alpha); voxEdgeMat.opacity = Math.max(0, (0.5 + hover * 0.25) * (1 - dis) * alpha);
    inkCur.lerp(inkTo, 0.08);
    // block faces sit on the opposite side of the ground from the ink: paper blocks with ink edges on the light
    // home page, ink blocks with paper edges once the cube lands on the dark Development page
    edgeMat.color.copy(inkCur); faceMat.color.copy(inkCur); voxEdgeMat.color.copy(inkCur); voxMat.color.copy(inkCur);
    renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(tick);

  return {
    // viewport-px box the cube should occupy (mid-collapse the timeline owns the box; mid-expand this retargets the cube's cell)
    setAnchor(r) { if (!r) return; const b = { x: r.x, y: r.y, w: r.w, h: r.h }; if (col) { if (col.reverse) col.cube = b; return; } anchor = b; },
    // collapse into the platform box over dur ms; a repeat call only retargets the landing box
    collapse(r, dur) {
      if (!r) return;
      const plate = { x: r.x, y: r.y, w: r.w, h: r.h };
      if (col) { col.plate = plate; return; }
      col = { t0: performance.now(), dur: dur || 1500, reverse: false, cube: { ...anchor }, plate }; hoverTo = 0;
    },
    // the reverse: start as the platform's plate in its box, rise back into the cube and travel to the cube's cell
    expand(plate, cube, dur) {
      if (!plate || !cube) return;
      col = { t0: performance.now(), dur: dur || 1500, reverse: true, cube: { x: cube.x, y: cube.y, w: cube.w, h: cube.h }, plate: { x: plate.x, y: plate.y, w: plate.w, h: plate.h } };
      dis = trav = flat = 1; anchor = { ...col.plate }; hoverTo = 0;
    },
    busy() { return !!col; },
    reset() { col = null; dis = trav = flat = 0; },
    setPlatformFrame(f) { if (f) frame = { ...frame, ...f }; },
    // the cube is drawn in ink on the light home ground and in paper once it lands on the dark Development page
    setInk(c, now) { inkTo.set(c); if (now) inkCur.copy(inkTo); },
    setHover(b) { hoverTo = b && !col ? 1 : 0; },
    setOpacity(a) { alphaTo = Math.max(0, Math.min(1, a)); },
    destroy() {
      alive = false; cancelAnimationFrame(raf); ro.disconnect();
      window.removeEventListener('pointermove', onMove);
      renderer.dispose();
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
    },
  };
}
