// background-field.glsl.js — the shader half of the background effect.
// Exports GLSL source as strings so the pair stays buildless: no loader, no
// runtime fetch, so it works from file:// as well as from Pages.
// Every knob worth turning is a named const at the top of FRAGMENT_SHADER.
// The `/* glsl */` tags are picked up by editor extensions for highlighting.
//
// The effect is a DISSOLVE, not a gradient. A flat sheet of paper carries a
// slow, soft, low-contrast mass; that mass is never drawn directly. It is used
// as the probability that a given pixel takes a grain of ink. Where the mass
// is near zero almost nothing lands and the frame stays bare paper; where it
// rises, more grains ink and the form arrives as sand rather than as a smooth
// wash. Photoshop's Dissolve blend treats a layer's alpha the same way.
//
// The measurable signature, and the thing to preserve if this is retuned: the
// grain's variance grows with local ink density instead of holding constant,
// and most of the frame sits at exactly COL_PAPER. field-measure.html scores a
// set of constants against those numbers, working in ink density so the
// figures taken off the dark reference still apply.
//
// There is no pointer input. The field drifts on its own and is not steered.

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
// The flat sheet the whole frame sits on. Nothing is ever lightened above it,
// so most of the picture is exactly this value and every mark is subtractive:
// ink landing on paper, not light landing on black. COL_PAPER is the exact
// complement of the ground this was inverted from, which puts it within one
// level of the Classical --color-bg (#f3f2f2).
const vec3  COL_PAPER = vec3(0.949, 0.949, 0.949);
const vec3  COL_INK   = vec3(0.925, 0.930, 0.937);

// Mass ----------------------------------------------------------------------
// The soft form. Never drawn on its own; it only decides where ink lands.
const int   FBM_OCTAVES    = 6;      // detail in the form; each one costs a
                                     // full noise lookup in all three fBm
                                     // calls, so this is the expensive knob
const float FBM_LACUNARITY = 2.090;   // frequency step per octave
const float FBM_GAIN       = 0.540;   // amplitude step per octave
const float MASS_SCALE     = 2.420;   // features across the short axis
const float MASS_DRIFT     = 0.018;  // domain units/sec the mass slides
const float MASS_WARP      = 0.550;   // domain warp; 0 gives plain round blobs
const float MASS_LOW       = 0.460;  // fBm at or under this takes no ink
const float MASS_HIGH      = 0.950;   // and at or over this is full mass
const float MASS_GAMMA     = 0.800;   // <1 broadens the dim middle of the
                                     // range, which is where most of the
                                     // picture lives

// Dust ----------------------------------------------------------------------
// The dissolve. DENSITY is the odds a pixel takes ink at full mass, GAIN is
// how dark an inked grain is. Both scale with mass, which is what makes the
// grain grow noisier as the form deepens rather than merely darker.
const float DUST_DENSITY   = 1.30;   // >1 lets the deepest core go solid
const float DUST_GAIN      = 0.40;   // peak luminance removed by one grain
const float DUST_SCALE     = 1.0;    // 1.0 = one grain per device pixel
const float DUST_HZ        = 14.0;   // reseeds/sec; 0.0 freezes the dust

// Haze ----------------------------------------------------------------------
// A little mass laid smoothly under the dust, so the form still reads where
// the dissolve is too sparse to carry it on its own.
const float HAZE_GAIN      = 0.045;

// Vignette ------------------------------------------------------------------
// Taken out of the ink, never out of the paper, so the sheet stays perfectly
// flat across the whole frame.
const float VIGNETTE_START = 0.55;
const float VIGNETTE_END   = 1.30;
const float VIGNETTE_DEPTH = 0.55;

// ───────────────────────────────────────────────────────────────────────────

uniform float uTime;        // seconds; held constant under prefers-reduced-motion
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

  // Centered and aspect-corrected, so the form is not stretched by the window.
  vec2 sp = vec2((vUv.x - 0.5) * aspect, vUv.y - 0.5) * MASS_SCALE;

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

  // Corners fade back to bare paper by losing mass, never by tinting the sheet.
  float r = length(vUv - 0.5) * 1.41421356;
  mass *= 1.0 - smoothstep(VIGNETTE_START, VIGNETTE_END, r) * VIGNETTE_DEPTH;

  // ── the dissolve. A pixel takes ink when its draw falls under the local
  //    mass, so grain variance rises with ink density instead of holding flat.
  float seed = floor(t * DUST_HZ);
  float draw = hash12(gl_FragCoord.xy * DUST_SCALE + seed * 137.13);
  float inked = step(draw, clamp(mass * DUST_DENSITY, 0.0, 1.0));

  vec3 col = COL_PAPER
           - COL_INK * mass * HAZE_GAIN
           - COL_INK * mass * DUST_GAIN * inked;

  gl_FragColor = vec4(col, 1.0);
}
`;
