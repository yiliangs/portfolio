// background-field.glsl.js — the shader half of the background effect.
// Exports GLSL source as strings so the pair stays buildless: no loader, no
// runtime fetch, so it works from file:// as well as from Pages.
// Every knob worth turning is a named const at the top of FRAGMENT_SHADER.
// The `/* glsl */` tags are picked up by editor extensions for highlighting.
//
// The effect is a DISSOLVE, not a gradient. A very dark flat ground carries a
// slow, soft, low-contrast mass of light; that mass is never drawn directly.
// It is used as the probability that a given pixel of dust lights up. Where
// the mass is near zero almost nothing flips on and the frame stays flat
// black; where it rises, more grains light and the form arrives as sand
// rather than as a smooth wash. Photoshop's Dissolve blend treats a layer's
// alpha the same way.
//
// The measurable signature, and the thing to preserve if this is retuned: the
// grain's variance grows with local brightness instead of holding constant,
// and most of the frame sits at exactly COL_GROUND.

export const VERTEX_SHADER = /* glsl */ `
varying vec2 vUv;

void main() {
  vUv = uv;
  // The quad is already in clip space (PlaneGeometry(2, 2)), so no matrices.
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export const FRAGMENT_SHADER = /* glsl */ `
precision highp float;

// ───────────────────────────────────────────────────────────────────────────
//  TUNABLES
// ───────────────────────────────────────────────────────────────────────────

// Ground --------------------------------------------------------------------
// The flat floor the whole frame sits on. Nothing is ever darkened below it,
// so most of the picture is exactly this value and all light is additive.
const vec3  COL_GROUND = vec3(0.051, 0.051, 0.051);
const vec3  COL_DUST   = vec3(0.925, 0.930, 0.937);

// Mass ----------------------------------------------------------------------
// The soft luminous form. Never drawn on its own; it only decides where dust
// lights. Keep the scale low, one or two features across the viewport.
const int   FBM_OCTAVES    = 3;      // few, so the form stays soft
const float FBM_LACUNARITY = 2.03;   // frequency step per octave
const float FBM_GAIN       = 0.50;   // amplitude step per octave
const float MASS_SCALE     = 1.15;   // features across the short axis
const float MASS_DRIFT     = 0.018;  // domain units/sec the mass slides
const float MASS_WARP      = 0.55;   // domain warp; 0 gives plain round blobs
const float MASS_LOW       = 0.460;   // fBm at or under this lights nothing
const float MASS_HIGH      = 0.95;   // and at or over this is full mass
const float MASS_GAMMA     = 0.80;   // <1 broadens the dim middle of the
                                     // range, which is where most of the
                                     // picture lives

// Dust ----------------------------------------------------------------------
// The dissolve. DENSITY is the odds a pixel lights at full mass, GAIN is how
// bright a lit grain is. Both scale with mass, which is what makes the grain
// grow noisier as the form brightens rather than merely lighter.
const float DUST_DENSITY   = 1.30;   // >1 lets the brightest core go solid
const float DUST_GAIN      = 0.40;  // peak added luminance of a lit grain
const float DUST_SCALE     = 1.0;    // 1.0 = one grain per device pixel
const float DUST_HZ        = 14.0;   // reseeds/sec; 0.0 freezes the dust

// Haze ----------------------------------------------------------------------
// A little mass added smoothly under the dust, so the form still reads where
// the dissolve is too sparse to carry it on its own.
const float HAZE_GAIN      = 0.045;

// Cursor --------------------------------------------------------------------
// The pointer lifts the mass, so more dust lights around it. The sand gathers
// rather than the picture warping.
const float CURSOR_RADIUS  = 0.38;   // influence radius, aspect-corrected units
const float CURSOR_FALLOFF = 1.80;   // >1 tightens the core, softens the edge
const float CURSOR_CORE    = 0.16;   // displacement fades back to zero inside
                                     // this radius. Without it the radial
                                     // direction is undefined at the pointer
                                     // and the field pinches to a hard point.
const float CURSOR_PUSH    = 0.13;   // peak radial displacement of the mass
const float CURSOR_LIFT    = 0.26;   // mass added under the pointer

// Vignette ------------------------------------------------------------------
// Taken out of the dust and haze, never out of the ground, so the floor stays
// perfectly flat across the whole frame.
const float VIGNETTE_START = 0.55;
const float VIGNETTE_END   = 1.30;
const float VIGNETTE_DEPTH = 0.55;

// ───────────────────────────────────────────────────────────────────────────

uniform float uTime;        // seconds; held constant under prefers-reduced-motion
uniform vec2  uMouse;       // pointer in UV space, already lerped on the CPU
uniform vec2  uResolution;  // drawing buffer size, device pixels

varying vec2 vUv;

// Rotation folded between octaves so features do not stack on the axes.
const mat2 OCTAVE_ROT = mat2(0.80, 0.60, -0.60, 0.80);

// Hash by Dave Hoskins (hash12, MIT). Chosen over the usual fract(p * bigVec)
// one-liner because that one stays correlated along columns on an integer
// lattice, which shows up as vertical striping in the dust.
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash12(i);
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float sum = 0.0;
  float amp = 0.5;
  float norm = 0.0;
  for (int i = 0; i < FBM_OCTAVES; i++) {
    sum += amp * vnoise(p);
    norm += amp;
    p = OCTAVE_ROT * p * FBM_LACUNARITY;
    amp *= FBM_GAIN;
  }
  return sum / norm;
}

void main() {
  float aspect = uResolution.x / max(uResolution.y, 1.0);

  // Centered, aspect-corrected space so the cursor falloff stays circular.
  vec2 p = vec2((vUv.x - 0.5) * aspect, vUv.y - 0.5);
  vec2 m = vec2((uMouse.x - 0.5) * aspect, uMouse.y - 0.5);

  // ── cursor influence: one smoothstep falloff, reused for the displacement
  //    and for the lift. No second pass, no extra buffer.
  vec2  toCursor = p - m;
  float dist     = length(toCursor);
  float pull     = pow(1.0 - smoothstep(0.0, CURSOR_RADIUS, dist), CURSOR_FALLOFF);

  // Displacement tapers back to zero inside CURSOR_CORE, so the pointer
  // gathers the dust instead of pinching it to a point.
  float lens = pull * smoothstep(0.0, CURSOR_CORE, dist);
  vec2  q = p + (toCursor / max(dist, 1e-4)) * lens * CURSOR_PUSH;

  vec2 sp = q * MASS_SCALE;

  // ── the soft mass. Lightly domain-warped so the form is organic, drifting
  //    on two axes so it never reads as a pan.
  float t = uTime;
  vec2 warp = vec2(
    fbm(sp * 1.7 + vec2(0.0, t * MASS_DRIFT)),
    fbm(sp * 1.7 + vec2(4.7, 2.3) - vec2(t * MASS_DRIFT * 0.8, 0.0))
  );
  float n = fbm(sp + (warp - 0.5) * 2.0 * MASS_WARP
                   + vec2(t * MASS_DRIFT * 0.5, -t * MASS_DRIFT));

  float mass = pow(smoothstep(MASS_LOW, MASS_HIGH, n), MASS_GAMMA);
  mass = clamp(mass + pull * CURSOR_LIFT, 0.0, 1.0);

  // Corners darken by losing mass, never by darkening the ground.
  float r = length(vUv - 0.5) * 1.41421356;
  mass *= 1.0 - smoothstep(VIGNETTE_START, VIGNETTE_END, r) * VIGNETTE_DEPTH;

  // ── the dissolve. A pixel lights when its draw falls under the local mass,
  //    so grain variance rises with brightness instead of holding flat.
  float seed = floor(t * DUST_HZ);
  float draw = hash12(gl_FragCoord.xy * DUST_SCALE + seed * 137.13);
  float lit  = step(draw, clamp(mass * DUST_DENSITY, 0.0, 1.0));

  vec3 col = COL_GROUND
           + COL_DUST * mass * HAZE_GAIN
           + COL_DUST * mass * DUST_GAIN * lit;

  gl_FragColor = vec4(col, 1.0);
}
`;
