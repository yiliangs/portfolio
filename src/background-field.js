// background-field.js — the three.js half of the background effect.
// One full-screen quad, one fragment shader, one pass. No render targets.
// mount(container) -> { setFragmentShader, setPaused, destroy }
//
// Division of labour with background-field.glsl.js: the shader owns how it
// looks, this file owns the context, sizing, the frame loop, and the one thing
// a single-pass shader cannot own -- state that outlives a frame. The pointer's
// velocity and the agitation it stirs up are integrated here and handed over as
// uniforms, which is what lets a disturbance settle out over time.
import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { VERTEX_SHADER, FRAGMENT_SHADER } from './background-field.glsl.js';

// How far the uploaded cursor closes on the raw pointer each frame. Low values
// trail further behind. At 60Hz, 0.08 settles ~95% of the way in about 36
// frames, a little over half a second.
const CURSOR_LERP = 0.08;

// Hard ceiling on the backing-store scale. A background is the last thing that
// should be paying for a 3x display.
const MAX_PIXEL_RATIO = 2;

// uTime is pinned here whenever prefers-reduced-motion is set. Any constant
// works; 0 just makes the frozen image reproducible.
const REDUCED_MOTION_TIME = 0;

// ── the flow the pointer stirs up ───────────────────────────────────────────
// The shader is stateless by design: one pass, no render targets, so it cannot
// remember a wake. The memory lives here instead, as two small pieces of state
// carried across frames. That is what lets a stroke keep moving after the
// pointer stops, which is the difference between disturbing a medium and
// dragging a shape around on top of one.

// Pointer speed, in viewport widths per second, that counts as stirring at
// full strength. Above this the disturbance is simply saturated.
const FLOW_SPEED_REF = 0.85;

// The agitation envelope: quick to build, slow to settle. The gap between
// these two is the whole effect. Equal values would make the disturbance an
// instantaneous readout of speed, which reads as a cursor-shaped light again.
const STIR_ATTACK = 0.30;
const STIR_RELEASE = 0.022;

// How fast the wake swings around to a new heading. Kept low so a change of
// direction bends the existing stroke rather than snapping it.
const FLOW_TURN = 0.12;

export function mount(container) {
  const renderer = new THREE.WebGLRenderer({
    antialias: false,       // the shader has no geometric edges to alias
    alpha: false,
    powerPreference: 'low-power',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
  renderer.domElement.style.cssText = 'width:100%;height:100%;display:block;';
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  // The vertex shader writes clip space directly, so the camera is a formality.
  const camera = new THREE.Camera();

  const uniforms = {
    uTime: { value: 0 },
    uMouse: { value: new THREE.Vector2(0.5, 0.5) },
    uFlow: { value: new THREE.Vector2(1, 0) },
    uStir: { value: 0 },
    uResolution: { value: new THREE.Vector2(1, 1) },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    depthTest: false,
    depthWrite: false,
    // Nothing uses derivatives now that the contour pass is gone.
    // (kept off deliberately: declaring an unused extension is noise.)

  });

  const geometry = new THREE.PlaneGeometry(2, 2);
  const quad = new THREE.Mesh(geometry, material);
  quad.frustumCulled = false;
  scene.add(quad);

  // ── pointer ───────────────────────────────────────────────────────────────
  // The handler stores raw client coordinates and does nothing else: no
  // normalization, no layout reads, no uniform writes, no render. Everything
  // downstream of the two assignments happens in the frame loop below.
  const pointerPx = { x: NaN, y: NaN };
  const onPointerMove = (event) => {
    pointerPx.x = event.clientX;
    pointerPx.y = event.clientY;
  };
  window.addEventListener('pointermove', onPointerMove, { passive: true });

  // Where the cursor is heading, and where it actually is. Both in UV space:
  // origin bottom-left, y up, matching the shader's vUv.
  const targetUv = new THREE.Vector2(0.5, 0.5);
  const easedUv = new THREE.Vector2(0.5, 0.5);

  // The flow state. lastUv is the previous eased position, so the difference
  // gives velocity; flowDir is the lagging heading of the stroke; stir is the
  // agitation envelope. All three outlive any single frame.
  const lastUv = new THREE.Vector2(0.5, 0.5);
  const flowDir = new THREE.Vector2(1, 0);
  let stir = 0;

  // ── sizing ────────────────────────────────────────────────────────────────
  // The canvas rect is cached rather than read per frame; reading it inside the
  // loop would force a layout on every tick for a value that only changes on
  // resize or scroll.
  let rect = { left: 0, top: 0, width: 1, height: 1 };

  const resize = () => {
    const w = Math.max(1, container.clientWidth || window.innerWidth);
    const h = Math.max(1, container.clientHeight || window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
    renderer.setSize(w, h, false);
    const buffer = renderer.getDrawingBufferSize(new THREE.Vector2());
    uniforms.uResolution.value.copy(buffer);
    rect = renderer.domElement.getBoundingClientRect();
  };
  resize();

  const observer = new ResizeObserver(resize);
  observer.observe(container);
  const onScroll = () => { rect = renderer.domElement.getBoundingClientRect(); };
  window.addEventListener('scroll', onScroll, { passive: true });

  // ── reduced motion ────────────────────────────────────────────────────────
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  let frozen = motionQuery.matches;
  // Wall-clock origin for uTime, rebased whenever the clock resumes so that
  // unfreezing continues from where it stopped instead of jumping.
  let epoch = performance.now();
  let clock = frozen ? REDUCED_MOTION_TIME : 0;

  const onMotionChange = () => {
    frozen = motionQuery.matches;
    if (frozen) {
      clock = REDUCED_MOTION_TIME;
    } else {
      epoch = performance.now() - clock * 1000;
    }
  };
  motionQuery.addEventListener('change', onMotionChange);

  // ── frame loop ────────────────────────────────────────────────────────────
  let paused = false;
  let raf = 0;

  let lastNow = performance.now();

  const tick = (now) => {
    raf = requestAnimationFrame(tick);
    if (paused) return;

    // Clamped so a backgrounded tab or a long frame cannot report a velocity
    // of nearly zero over a huge interval, or an enormous one over a tiny one.
    const dt = Math.min(0.05, Math.max(1 / 240, (now - lastNow) / 1000));
    lastNow = now;

    // Read the coordinates the handler stored, convert to UV, then ease.
    if (!Number.isNaN(pointerPx.x)) {
      targetUv.x = (pointerPx.x - rect.left) / Math.max(rect.width, 1);
      targetUv.y = 1 - (pointerPx.y - rect.top) / Math.max(rect.height, 1);
    }
    easedUv.x += (targetUv.x - easedUv.x) * CURSOR_LERP;
    easedUv.y += (targetUv.y - easedUv.y) * CURSOR_LERP;
    uniforms.uMouse.value.copy(easedUv);

    // ── velocity of the eased pointer, and the flow it stirs up.
    const dx = easedUv.x - lastUv.x;
    const dy = easedUv.y - lastUv.y;
    lastUv.copy(easedUv);
    const speed = Math.sqrt(dx * dx + dy * dy) / dt;

    // Attack quickly toward how hard the pointer is moving, release slowly.
    // The release is why the medium keeps churning after the stroke stops.
    const drive = Math.min(1, speed / FLOW_SPEED_REF);
    stir += (drive - stir) * (drive > stir ? STIR_ATTACK : STIR_RELEASE);

    // Turn the wake toward the current heading. Held over from the last frame
    // when the pointer is still, so a settling disturbance keeps its heading
    // instead of snapping to some default.
    if (speed > 1e-4) {
      flowDir.x += (dx / (speed * dt) - flowDir.x) * FLOW_TURN;
      flowDir.y += (dy / (speed * dt) - flowDir.y) * FLOW_TURN;
    }
    uniforms.uFlow.value.copy(flowDir);
    uniforms.uStir.value = stir;

    // Frozen means the image holds still; the pointer above still disturbs it,
    // since that motion is the user's own and is not what the setting is about.
    uniforms.uTime.value = frozen ? REDUCED_MOTION_TIME : (clock = (now - epoch) / 1000);

    renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(tick);

  return {
    // Tuning hook: swap the fragment shader in place, keeping the clock, the
    // eased pointer and the context. Used by the local tuning portal so that
    // dragging a slider does not restart the field.
    setFragmentShader(source) {
      material.fragmentShader = source;
      material.needsUpdate = true;
    },
    setPaused(value) {
      const next = Boolean(value);
      if (next === paused) return;
      paused = next;
      // Resuming rebases the clock so a pause does not fast-forward the field,
      // and the frame timer so the first tick back does not read as a lurch.
      if (!next) {
        lastNow = performance.now();
        if (!frozen) epoch = lastNow - clock * 1000;
      }
    },
    destroy() {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('scroll', onScroll);
      motionQuery.removeEventListener('change', onMotionChange);
      observer.disconnect();
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    },
  };
}
