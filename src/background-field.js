// background-field.js — the three.js half of the background effect.
// One full-screen quad, one fragment shader, one pass. No render targets.
// mount(container) -> { setFragmentShader, setPaused, destroy }
//
// Division of labour with background-field.glsl.js: everything here is
// plumbing (context, sizing, uniforms, the frame loop). Everything that
// decides how it looks lives in the shader's tunables block.
//
// The field takes no input. It drifts on its own, and the only thing that
// varies per frame is uTime, so when the clock is held still there is nothing
// left to redraw and the loop stops entirely.
import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { VERTEX_SHADER, FRAGMENT_SHADER } from './background-field.glsl.js';

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
    uResolution: { value: new THREE.Vector2(1, 1) },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    depthTest: false,
    depthWrite: false,
  });

  const geometry = new THREE.PlaneGeometry(2, 2);
  const quad = new THREE.Mesh(geometry, material);
  quad.frustumCulled = false;
  scene.add(quad);

  const draw = () => renderer.render(scene, camera);

  // ── sizing ────────────────────────────────────────────────────────────────
  const resize = () => {
    const w = Math.max(1, container.clientWidth || window.innerWidth);
    const h = Math.max(1, container.clientHeight || window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
    renderer.setSize(w, h, false);
    uniforms.uResolution.value.copy(renderer.getDrawingBufferSize(new THREE.Vector2()));
    // When the loop is not running the canvas would otherwise keep the old
    // frame at the new size, so redraw the still image here.
    if (!raf) draw();
  };

  // ── reduced motion ────────────────────────────────────────────────────────
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  let frozen = motionQuery.matches;
  // Wall-clock origin for uTime, rebased whenever the clock resumes so that
  // unfreezing continues from where it stopped instead of jumping.
  let epoch = performance.now();
  let clock = frozen ? REDUCED_MOTION_TIME : 0;

  // ── frame loop ────────────────────────────────────────────────────────────
  let paused = false;
  let raf = 0;

  const tick = (now) => {
    raf = requestAnimationFrame(tick);
    uniforms.uTime.value = clock = (now - epoch) / 1000;
    draw();
  };

  // Frozen or paused means the picture cannot change, and with no pointer to
  // answer to there is nothing to keep a loop alive for: draw the still frame
  // once and stop scheduling. Reduced motion therefore costs no GPU at rest.
  const refresh = () => {
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    if (paused) return;
    if (frozen) {
      uniforms.uTime.value = REDUCED_MOTION_TIME;
      draw();
      return;
    }
    epoch = performance.now() - clock * 1000;
    raf = requestAnimationFrame(tick);
  };

  const onMotionChange = () => {
    frozen = motionQuery.matches;
    if (frozen) clock = REDUCED_MOTION_TIME;
    refresh();
  };
  motionQuery.addEventListener('change', onMotionChange);

  const observer = new ResizeObserver(resize);
  observer.observe(container);

  resize();
  refresh();

  return {
    // Tuning hook: swap the fragment shader in place, keeping the clock and the
    // GL context. Used by the local tuning portal so that dragging a slider
    // does not restart the field.
    setFragmentShader(source) {
      material.fragmentShader = source;
      material.needsUpdate = true;
      if (!raf) draw();       // keep a stopped loop's still frame current
    },
    setPaused(value) {
      const next = Boolean(value);
      if (next === paused) return;
      paused = next;
      refresh();
    },
    destroy() {
      if (raf) cancelAnimationFrame(raf);
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
