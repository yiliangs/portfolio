// The home cube: a tesseract turning in four dimensions, with "Development" struck in ink voxels inside it, read
// through the faces. Its 32 edges are the cube's only wireframe, so the object is the hypercube rather than a figure
// hung inside a box: at a settled pose the near cell projects to exactly the box and the rest folds into it. Each of
// its eight cells is washed on the three walls it turns away from the reader, which is what makes the wireframe read
// as an object rather than a tangle.
// Anchored to a viewport box like the parchment roll. On click it collapses into the Development platform in three
// beats — the word dissolves, the cube travels and turns into the platform's axonometric pose, then presses down into a
// sheet with the platform's exact proportions and projection — so the parchment platform can take over unseen.
// mount(container) -> { setAnchor, collapse, reset, setPlatformFrame, setInk, setHover, setOpacity, destroy }
import * as THREE from './vendor/three-0.160.0.module.min.js';

const INK = 0x1a1918;
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const smooth = (x) => x * x * (3 - 2 * x);
const cubicInOut = (x) => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;

// ----- the cube is a tesseract -----
const CS = 1;              // the cube's side, and the box the projection is refitted into
// The figure turns in one 4D plane and no more. A simple rotation is the one a reader can follow: a quarter turn in
// a single plane carries the tesseract onto itself, so the whole of it is a cycle of about four and a half seconds
// that comes back to where it began and can be learned by watching. Turning in two planes at once, which is what
// this did, never repeats and never settles into a shape; locking the two rates to a whole-number ratio makes it
// periodic and no easier to read, because it is the second plane and not the long period that loses the reader.
const HYPER_XW = 0.35;     // rad/s in the xw plane, the only plane the figure turns in
const HYPER_D = 2.0;       // eye distance for the 4D perspective divide: the far cell shrinks, the near one swells
const HYPER_INNER = 0.55;  // weight of the far cell and the connectors against the near cell's, which reads as depth
// And the viewpoint holds still apart from a slow roll about the axis pointing at the reader. That is the only turn
// of the three that takes nothing out of sight: pitch and yaw carry a face away behind the figure, roll only turns
// what is already facing you. So the three-quarter view is fixed, the roll rocks inside a bounded arc, and the only
// thing that moves pitch and yaw is the cursor.
const CUBE_PITCH = -0.22, CUBE_YAW = 0.5; // the three-quarter view the figure is read from
const CUBE_ROLL = 0.28;    // rad the roll reaches either side of it
const CUBE_ROLL_W = 0.13;  // rad/s of phase, so the rock takes about 48 s and is slower than the figure's own turn
// The word counters the cube's turn completely and then wobbles by a bounded amount. It cannot instead keep a share
// of that turn: a share of the roll tips the word off level by as much again, and the word is the one thing in the
// figure that has to stay square to the reader, since it is read rather than looked at.
const WORD_WOBBLE = 0.07;  // rad of free wobble, so the word shows its depth without ever leaving the reader
const HYPER_SPAN = 1.2;    // the turned w runs to +-sqrt(0.75); this divides it back into a 0..1 depth
// The wash the walls are drawn at. A fixed key light gives every wall a tone from the way it lies, so the figure
// reads as planes meeting at angles instead of lines crossing at none: that difference between one wall and its
// neighbour is the whole of the readability, which is why the range is wide against so small a base. WALL_AERIAL is
// the share of the tone the fourth dimension takes back, thinning the far cell the way distance thins a wash.
const WALL_LIGHT = new THREE.Vector3(-0.4, 0.75, 0.5).normalize();
const WALL_BASE = 0.015;   // ink alpha on a wall turned right away from the light
const WALL_RANGE = 0.22;   // and how much more the best-lit wall takes
const WALL_AERIAL = 0.55;
// 16 vertices at (+/-0.5) in four coordinates, and an edge wherever two of them differ in exactly one coordinate
const HC_V = [], HC_E = [], HC_F = [];
for (let i = 0; i < 16; i++) HC_V.push([i & 1 ? 0.5 : -0.5, i & 2 ? 0.5 : -0.5, i & 4 ? 0.5 : -0.5, i & 8 ? 0.5 : -0.5]);
for (let i = 0; i < 16; i++) for (let b = 0; b < 4; b++) { const j = i ^ (1 << b); if (j > i) HC_E.push([i, j]); }
// and a square face wherever two coordinates run free and the other two are held: six pairs, four corners each, 24
// faces, every edge in three of them
for (let p = 0; p < 4; p++) for (let q = p + 1; q < 4; q++) {
  const held = [0, 1, 2, 3].filter((k) => k !== p && k !== q);
  for (let s = 0; s < 4; s++) {
    const b = (s & 1 ? 1 << held[0] : 0) | (s & 2 ? 1 << held[1] : 0);
    HC_F.push([b, b | (1 << p), b | (1 << p) | (1 << q), b | (1 << q)]);
  }
}
// The eight cells: hold one coordinate, let the other three run, and what is left is a cube. Every face is a wall of
// exactly two cells, which read it from opposite sides, so the figure has 48 walls and each is a wall of one solid.
// That is the whole reason the cells are listed at all. A face on its own has no outside: nothing in the figure says
// which of its two sides faces the reader, and a side picked by hand flips as the pose turns, which blinks the wash
// on and off. A wall of a cell does have one, the way a wall of a room does, and the cell's own centre says which
// way it points. Three walls of a cell face away from the reader at any pose, so the wash is always half the figure.
const HC_C = [], HC_W = [];
for (let c = 0; c < 4; c++) for (const on of [0, 1]) {
  const cell = [];
  for (let i = 0; i < 16; i++) if (((i >> c) & 1) === on) cell.push(i);
  const ci = HC_C.push(cell) - 1;
  for (const face of HC_F) if (face.every((i) => ((i >> c) & 1) === on)) HC_W.push([ci, face[0], face[1], face[2], face[3]]);
}
const hcC = new Float32Array(24), hcR = new Float32Array(8); // the eight cells' centres and radii, which orient their walls
// A wall is fully out of its cell once its plane stands this much of the cell's own radius clear of the cell's
// centre, and every wall of an honest cell stands far clear of that. It matters only where a cell folds through
// itself: the reading then crosses zero over a short arc instead of at a point, so the wash fades rather than turns
// over. Measuring the clearance against the cell's radius rather than a fixed length is what lets the thin
// connecting cells shade as firmly as the two cubical ones.
const WALL_SOFT = 0.08;
const hcP = new Float32Array(48), hcW = new Float32Array(16); // the 16 projected points and their turned w
// Turns the figure by a in the xw plane and b in the yw plane, divides it down to three dimensions, and refits it so
// it exactly fills the cube's box. pos takes the 32 edges' endpoints (192 floats), wt a per-endpoint weight (64):
// 1 on an edge of the near cell, 0 on the far cell and the connectors. wpos takes the 48 walls as two triangles each
// (864 floats) and wnd a per-wall outward normal and 4D depth (192), which is all the wash on a wall is decided from.
// fold 0..1 takes the 4D perspective to orthographic. At fold = 1 both cells project onto the same cube and the eight
// connectors shrink to nothing, so the figure visibly folds shut into a plain cube instead of merely going still. At a
// pose that is a multiple of a quarter turn in both planes every turned w is +-0.5 exactly, so the weights come out a
// clean 1 and 0 and the folded figure lands on the box. That pair is what the collapse steers onto before it flattens.
export function hypercube(a, b, fold, pos, wt, wpos, wnd) {
  const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
  const invD = (1 - fold) / HYPER_D; // 1/D open, 0 folded shut: the divide goes orthographic
  let m = 0;
  for (let i = 0; i < 16; i++) {
    const v = HC_V[i];
    const x = v[0] * ca - v[3] * sa, w1 = v[0] * sa + v[3] * ca;   // turn in xw
    const y = v[1] * cb - w1 * sb, w = v[1] * sb + w1 * cb;        // then in yw
    const s = 1 / (1 - w * invD);                                  // w * invD never reaches 1: |w| <= sqrt(0.75)
    const o = i * 3; hcP[o] = x * s; hcP[o + 1] = y * s; hcP[o + 2] = v[2] * s; hcW[i] = w;
    m = Math.max(m, Math.abs(hcP[o]), Math.abs(hcP[o + 1]), Math.abs(hcP[o + 2]));
  }
  const k = m > 0 ? 0.5 * CS / m : 0;
  for (let e = 0; e < HC_E.length; e++) {
    const i = HC_E[e][0], j = HC_E[e][1], p = i * 3, q = j * 3, o = e * 6;
    pos[o] = hcP[p] * k; pos[o + 1] = hcP[p + 1] * k; pos[o + 2] = hcP[p + 2] * k;
    pos[o + 3] = hcP[q] * k; pos[o + 4] = hcP[q + 1] * k; pos[o + 5] = hcP[q + 2] * k;
    // an edge counts as the near cell's only while both its ends are out at the near w, so the ring hands over
    // smoothly as the figure turns rather than flicking between cells
    wt[e * 2] = wt[e * 2 + 1] = smooth(clamp01((Math.min(hcW[i], hcW[j]) - 0.3) / 0.2));
  }
  for (let c = 0; c < HC_C.length; c++) {
    const cell = HC_C[c], o = c * 3;
    hcC[o] = hcC[o + 1] = hcC[o + 2] = 0;
    for (let v = 0; v < 8; v++) { const i = cell[v] * 3; hcC[o] += hcP[i]; hcC[o + 1] += hcP[i + 1]; hcC[o + 2] += hcP[i + 2]; }
    hcC[o] *= k / 8; hcC[o + 1] *= k / 8; hcC[o + 2] *= k / 8;
    // the cell's radius, which is the length its walls' clearances are read against. A cell can flatten but it
    // cannot shrink to a point, so this never reaches zero and is safe to divide by
    let r = 0;
    for (let v = 0; v < 8; v++) {
      const i = cell[v] * 3;
      r += Math.hypot(hcP[i] * k - hcC[o], hcP[i + 1] * k - hcC[o + 1], hcP[i + 2] * k - hcC[o + 2]);
    }
    hcR[c] = r / 8;
  }
  for (let w = 0; w < HC_W.length; w++) {
    const wall = HC_W[w], o = w * 18, n = w * 4, c = wall[0] * 3;
    // the corners in the square's own order, then the two triangles cut along one diagonal
    for (let t = 0; t < 6; t++) {
      const i = wall[1 + [0, 1, 2, 0, 2, 3][t]] * 3, d = o + t * 3;
      wpos[d] = hcP[i] * k; wpos[d + 1] = hcP[i + 1] * k; wpos[d + 2] = hcP[i + 2] * k;
    }
    // The wall's normal, pointed out of its cell and scaled by how firmly the cell says which way out is: how far
    // the cell's centre stands clear of the wall's own plane, in units of the cell's radius, held to 1. One
    // triangle's normal is the whole wall's, exactly: the divide is projective on the wall's own plane, so a square
    // still projects to a flat quadrilateral. The scaling is not decoration. A cell of this figure folds through
    // itself as the pose turns, and at the moment it does its centre lies in the plane of its own wall and there is
    // no out. Taking the sign there would turn a whole wall's tone over in one frame; the clearance instead passes
    // through zero, so the wash thins away as the cell flattens and comes back as it opens. It has to be the
    // clearance and not the direction of the step from the centre, which is the same +-1 either side of the fold.
    // Everything downstream reads this vector twice over, so the raw normal's own sign, the arbitrary one, cancels.
    const ux = wpos[o + 3] - wpos[o], uy = wpos[o + 4] - wpos[o + 1], uz = wpos[o + 5] - wpos[o + 2];
    const vx = wpos[o + 6] - wpos[o + 3], vy = wpos[o + 7] - wpos[o + 4], vz = wpos[o + 8] - wpos[o + 5];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    const mx = (wpos[o] + wpos[o + 3] + wpos[o + 6] + wpos[o + 15]) / 4 - hcC[c];
    const my = (wpos[o + 1] + wpos[o + 4] + wpos[o + 7] + wpos[o + 16]) / 4 - hcC[c + 1];
    const mz = (wpos[o + 2] + wpos[o + 5] + wpos[o + 8] + wpos[o + 17]) / 4 - hcC[c + 2];
    const clear = (nx * mx + ny * my + nz * mz) / (WALL_SOFT * hcR[wall[0]] || 1);
    const out = Math.max(-1, Math.min(1, clear));
    wnd[n] = nx * out; wnd[n + 1] = ny * out; wnd[n + 2] = nz * out;
    // and how deep in the fourth dimension the wall lies, so the far cell comes out lighter than the near one the
    // way distance thins a wash
    wnd[n + 3] = clamp01(0.5 + (hcW[wall[1]] + hcW[wall[2]] + hcW[wall[3]] + hcW[wall[4]]) / (4 * HYPER_SPAN));
  }
  return pos;
}

// Where the figure stands at rest: the three-quarter view, rocked by the roll and nudged by the cursor. Written as a
// pure function because the word's counter-turn is only as good as what it is countering, so a check has to be able
// to step the clock through both of them at once and watch what the reader would see.
const cubeEul = new THREE.Euler();
export function cubePose(t, px, py, out) {
  cubeEul.set(CUBE_PITCH - py * 0.16, CUBE_YAW + px * 0.3, Math.sin(t * CUBE_ROLL_W) * CUBE_ROLL);
  return out.setFromEuler(cubeEul);
}

// The word's own orientation: the cube's turn taken off completely, then a small bounded wobble put back. Writing it
// as a pure function is what lets a check step the clock and prove the word neither walks nor jumps.
const wordEul = new THREE.Euler(), wordQ = new THREE.Quaternion();
export function wordPose(t, px, py, cubeQuat, out) {
  wordEul.set(Math.sin(t * 0.31) * WORD_WOBBLE + py * 0.05, Math.sin(t * 0.23) * WORD_WOBBLE * 1.4 + px * 0.08, 0);
  wordQ.setFromEuler(wordEul);
  return out.copy(cubeQuat).invert().multiply(wordQ);
}

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

  const cube = new THREE.Group(); scene.add(cube);
  const shell = new THREE.Group(); cube.add(shell); // takes the flattening, so the lettering keeps its own scale
  // the wash exists only for the plate, and a plate is a sheet, so this is one quad rather than a box. A box drew its
  // three back faces blended with no depth write, and once the shell flattened, the extra layer where the side faces
  // overlapped the bottom left a hard seam: an inset rectangle with diagonals at the corners, which read as stray
  // wireframe on the landed plate. One quad has nothing to overlap. It is also drawn at nothing until the flatten
  // brings it in, since a wash at rest would stand proud of the tesseract
  const plateGeom = new THREE.PlaneGeometry(CS, CS);
  const plateMat = new THREE.MeshBasicMaterial({ color: INK, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });
  // per-vertex alpha on a stock material, the same hook parchment.js uses: the tesseract's cells have to be drawn at
  // different weights, and they are one LineSegments and one Mesh because they are one figure
  const perVertexAlpha = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', 'attribute float aA; varying float vA;\n#include <common>').replace('#include <begin_vertex>', '#include <begin_vertex>\nvA = aA;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', 'varying float vA;\n#include <common>').replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vA;');
  };
  const edgeMat = new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: 0.5 });
  edgeMat.onBeforeCompile = perVertexAlpha;
  // the tesseract's 32 edges are the cube's whole wireframe: there is no box drawn around it. It sits in the shell,
  // so the flatten presses it into the plate exactly as it pressed the box's edges before
  const hyperGeom = new THREE.BufferGeometry();
  hyperGeom.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(192), 3));
  hyperGeom.setAttribute('aA', new THREE.Float32BufferAttribute(new Float32Array(64), 1));
  const hyperPos = hyperGeom.attributes.position.array, hyperA = hyperGeom.attributes.aA.array;
  const hyperW = new Float32Array(64); // the raw near-cell weight, before the dissolve thins the rest away
  const hyper = new THREE.LineSegments(hyperGeom, edgeMat);
  hyper.frustumCulled = false; // the endpoints are rewritten every frame, so a once-computed bounding sphere lies
  // and the same figure's 48 walls, washed. Only the ones turned away from the reader take any: the three at the
  // back of each cell, the way the far walls of a room are the ones you see into it against. That is what leaves the
  // middle of the figure open for the word, and puts a ground behind the wireframe rather than a veil in front of it.
  // A wall crosses from lit to nothing exactly as it turns edge on, where it has no area left to show the change
  const wallMat = new THREE.MeshBasicMaterial({ color: INK, transparent: true, opacity: 1, side: THREE.DoubleSide, depthWrite: false });
  wallMat.onBeforeCompile = perVertexAlpha;
  const wallGeom = new THREE.BufferGeometry();
  wallGeom.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(864), 3));
  wallGeom.setAttribute('aA', new THREE.Float32BufferAttribute(new Float32Array(288), 1));
  const wallPos = wallGeom.attributes.position.array, wallA = wallGeom.attributes.aA.array;
  const wallND = new Float32Array(192); // each wall's outward normal and its 4D depth, which the tone is read off
  const walls = new THREE.Mesh(wallGeom, wallMat);
  walls.frustumCulled = false;
  walls.renderOrder = -1; // the wash is a ground: the wireframe and the word draw over it, never under it
  const plateMesh = new THREE.Mesh(plateGeom, plateMat);
  shell.add(walls, plateMesh, hyper);
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
  fetch('./vendor/helvetiker_regular.typeface.json').then((r) => r.json()).then((data) => {
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
  let col = null, dis = 0, trav = 0, flat = 0, fold = 0; // the collapse timeline and its beats
  // the 4D pose. It runs free while nothing is collapsing; a collapse records where it was and the quarter turn it is
  // nearest, and the fold beat carries it there, so the figure is a plain cube before the travel starts
  let ha = 0, ha0 = 0, haq = 0;
  const settle = (x) => Math.round(x / (Math.PI / 2)) * (Math.PI / 2);
  const markPose = () => { ha0 = ha; haq = settle(ha); };
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
  const qFree = new THREE.Quaternion(), qPose = new THREE.Quaternion(), eul = new THREE.Euler(), wallN = new THREE.Vector3();
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
    if (!col) ha += HYPER_XW * dt;
    if (col) {
      // beats: the word dissolves (0–0.4), the cube travels and turns into pose (0.22–0.72), then presses flat (0.6–1);
      // the expand runs the same film backwards, from the plate to the cube
      const u0 = clamp01((now - col.t0) / col.dur), u = col.reverse ? 1 - u0 : u0;
      dis = smooth(clamp01(u / 0.4)); trav = cubicInOut(clamp01((u - 0.22) / 0.5)); flat = cubicInOut(clamp01((u - 0.6) / 0.4));
      // the fold is its own beat, finished before the flatten starts, so the figure is seen to shut into a cube
      fold = cubicInOut(clamp01(u / 0.5));
      const L = (a, b) => a + (b - a) * trav;
      anchor = { x: L(col.cube.x, col.plate.x), y: L(col.cube.y, col.plate.y), w: L(col.cube.w, col.plate.w), h: L(col.cube.h, col.plate.h) };
      // the pose settles onto its nearest quarter turn on the same beat, so the turning and the folding finish together
      ha = ha0 + (haq - ha0) * fold;
      if (u0 >= 1 && col.reverse) { anchor = { ...col.cube }; col = null; dis = trav = flat = fold = 0; }
    }
    hover += (hoverTo - hover) * 0.1;
    alpha += (alphaTo - alpha) * 0.09;
    // free pose: the three-quarter view rocking on the reader's own axis, nudged by the cursor; landed pose: the
    // platform's axonometric (in-plane turn, then tilt)
    cubePose(t, px, py, qFree);
    eul.set(frame.tilt, 0, frame.turn); qPose.setFromEuler(eul);
    cube.quaternion.slerpQuaternions(qFree, qPose, trav);
    // flattening: the shell takes the sheet's proportions and loses its thickness
    shell.scale.set(1 + (frame.W / CS - 1) * flat, 1 + (frame.H / CS - 1) * flat, 1 - 0.99 * flat);
    project(flat); fit();
    cube.position.set(ax, ay + Math.cos(t * 0.55) * visH * 0.012 * (1 - trav), 0);
    cube.scale.setScalar(as * (1 + hover * 0.06));
    // the lettering counters the cube's turn and wobbles inside a few degrees of the reader, so it shows its depth
    // without ever turning away
    wordPose(t, px, py, cube.quaternion, inner.quaternion);
    if (dis !== shownDis) { shownDis = dis; layoutVoxels(dis); }
    // the near cell always draws at the full edge weight; the far cell and the connectors draw lighter, and go out
    // as the figure folds, so at fold = 1 the wireframe left standing is the box the plate is pressed from
    hypercube(ha, 0, fold, hyperPos, hyperW, wallPos, wallND);
    for (let i = 0; i < 64; i++) hyperA[i] = hyperW[i] + (1 - hyperW[i]) * HYPER_INNER * (1 - fold);
    // a wall takes a tone from where its own normal stands to the key light, thinned by how deep in the fourth
    // dimension it lies and cut away entirely once it turns back toward the reader. Both readings are products with
    // the outward vector, never with its sign, which is what keeps a folding cell from flashing. The wash goes out
    // with the fold for the same reason the connectors do: what the travel and the flatten act on has to be the bare
    // box, and the plate brings its own wash in behind it
    const wash = (1 - fold) * alpha;
    for (let w = 0; w < 48; w++) {
      wallN.fromArray(wallND, w * 4).applyQuaternion(cube.quaternion);
      const away = smooth(clamp01(-wallN.z * 2));
      const lit = clamp01(0.5 + 0.5 * wallN.dot(WALL_LIGHT));
      const a = Math.max(0, away * (WALL_BASE + lit * WALL_RANGE) * (1 - WALL_AERIAL + WALL_AERIAL * wallND[w * 4 + 3]) * wash);
      for (let v = 0; v < 6; v++) wallA[w * 6 + v] = a;
    }
    hyperGeom.attributes.position.needsUpdate = true; hyperGeom.attributes.aA.needsUpdate = true;
    wallGeom.attributes.position.needsUpdate = true; wallGeom.attributes.aA.needsUpdate = true;
    // the landed plate takes the platform's stroke and sheet weights
    edgeMat.opacity = Math.max(0, ((0.5 + hover * 0.3) * (1 - flat) + 0.62 * flat) * alpha);
    plateMat.opacity = Math.max(0, 0.14 * flat * alpha);
    voxMat.opacity = Math.max(0, 0.06 * (1 - dis) * alpha); voxEdgeMat.opacity = Math.max(0, (0.5 + hover * 0.25) * (1 - dis) * alpha);
    inkCur.lerp(inkTo, 0.08);
    // block faces sit on the opposite side of the ground from the ink: paper blocks with ink edges on the light
    // home page, ink blocks with paper edges once the cube lands on the dark Development page
    edgeMat.color.copy(inkCur); wallMat.color.copy(inkCur); plateMat.color.copy(inkCur); voxEdgeMat.color.copy(inkCur); voxMat.color.copy(inkCur);
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
      markPose();
      col = { t0: performance.now(), dur: dur || 1500, reverse: false, cube: { ...anchor }, plate }; hoverTo = 0;
    },
    // the reverse: start as the platform's plate in its box, rise back into the cube and travel to the cube's cell
    expand(plate, cube, dur) {
      if (!plate || !cube) return;
      // the plate was left on a settled pose, so this records ha0 = haq and the figure simply waits there until the
      // expand clears col and the free turn picks up again
      markPose();
      col = { t0: performance.now(), dur: dur || 1500, reverse: true, cube: { x: cube.x, y: cube.y, w: cube.w, h: cube.h }, plate: { x: plate.x, y: plate.y, w: plate.w, h: plate.h } };
      dis = trav = flat = fold = 1; anchor = { ...col.plate }; hoverTo = 0;
    },
    busy() { return !!col; },
    reset() { col = null; dis = trav = flat = fold = 0; },
    setPlatformFrame(f) { if (f) frame = { ...frame, ...f }; },
    // the cube is drawn in ink on the light home ground and in paper once it lands on the dark Development page
    setInk(c, now) { inkTo.set(c); if (now) inkCur.copy(inkTo); },
    setHover(b) { hoverTo = b && !col ? 1 : 0; },
    setOpacity(a) { alphaTo = Math.max(0, Math.min(1, a)); },
    destroy() {
      alive = false; cancelAnimationFrame(raf); ro.disconnect();
      window.removeEventListener('pointermove', onMove);
      // give back everything mount built: the plate's quad, the tesseract's washed faces and its edge lines, and
      // the word outline once the typeface has landed. voxMat never reaches an object, so the walk cannot find it
      scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
      voxMat.dispose();
      // dispose only frees the renderer's own caches; the GL context lives on until forceContextLoss drops it
      renderer.dispose(); renderer.forceContextLoss();
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
    },
  };
}
