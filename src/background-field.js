// background-field.js — the three.js half of the background effect.
// One full-screen quad, one fragment shader, one pass. No render targets.
// mount(container) -> { setPaused, destroy }
//
// Division of labour with background-field.glsl.js: everything here is
// plumbing (context, sizing, uniforms, the frame loop). Everything that
// decides how it looks lives in the shader's tunables block.
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
    uResolution: { value: new THREE.Vector2(1, 1) },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    depthTest: false,
    depthWrite: false,
    // fwidth() antialiases the contour lines; on a WebGL1 context that needs
    // the derivatives extension declared.
    extensions: { derivatives: true },
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

  const tick = (now) => {
    raf = requestAnimationFrame(tick);
    if (paused) return;

    // Read the coordinates the handler stored, convert to UV, then ease.
    if (!Number.isNaN(pointerPx.x)) {
      targetUv.x = (pointerPx.x - rect.left) / Math.max(rect.width, 1);
      targetUv.y = 1 - (pointerPx.y - rect.top) / Math.max(rect.height, 1);
    }
    easedUv.x += (targetUv.x - easedUv.x) * CURSOR_LERP;
    easedUv.y += (targetUv.y - easedUv.y) * CURSOR_LERP;
    uniforms.uMouse.value.copy(easedUv);

    // Frozen means the image holds still; the cursor above still responds,
    // since that motion is the user's own and is not what the setting is about.
    uniforms.uTime.value = frozen ? REDUCED_MOTION_TIME : (clock = (now - epoch) / 1000);

    renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(tick);

  return {
    setPaused(value) {
      const next = Boolean(value);
      if (next === paused) return;
      paused = next;
      // Resuming rebases the clock so a pause does not fast-forward the field.
      if (!next && !frozen) epoch = performance.now() - clock * 1000;
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
