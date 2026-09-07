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
// and most of the frame sits at exactly COL_GROUND. field-measure.html scores
// a set of constants against those numbers.
//
// The pointer does not draw. It disturbs the medium, and only while it is
// moving: the shader is handed a flow direction and an agitation level, both
// carried on the CPU with inertia, and uses them to drag the field along the
// stroke, shear it either side, and stir turbulence into it. Hold the pointer
// still and the disturbance settles out on its own.

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
const float MASS_LOW       = 0.460;  // fBm at or under this lights nothing
const float MASS_HIGH      = 0.95;   // and at or over this is full mass
const float MASS_GAMMA     = 0.80;   // <1 broadens the dim middle of the
                                     // range, which is where most of the
                                     // picture lives

// Dust ----------------------------------------------------------------------
// The dissolve. DENSITY is the odds a pixel lights at full mass, GAIN is how
// bright a lit grain is. Both scale with mass, which is what makes the grain
// grow noisier as the form brightens rather than merely lighter.
const float DUST_DENSITY   = 1.30;   // >1 lets the brightest core go solid
const float DUST_GAIN      = 0.40;   // peak added luminance of a lit grain
const float DUST_SCALE     = 1.0;    // 1.0 = one grain per device pixel
const float DUST_HZ        = 14.0;   // reseeds/sec; 0.0 freezes the dust

// Haze ----------------------------------------------------------------------
// A little mass added smoothly under the dust, so the form still reads where
// the dissolve is too sparse to carry it on its own.
const float HAZE_GAIN      = 0.045;

// Flow ----------------------------------------------------------------------
// What the pointer does to the medium. All of it is gated by uStir, which is
// zero when the pointer is not moving, so a parked cursor leaves no mark.
const float FLOW_RADIUS    = 0.34;   // reach across the stroke
const float FLOW_FALLOFF   = 1.60;   // >1 tightens the core, softens the edge
const float WAKE_STRETCH   = 2.60;   // how much further the disturbance
                                     // reaches behind the pointer than ahead;
                                     // this is what makes it read as a wake
                                     // rather than as a halo
const float ADVECT         = 0.17;   // how far the medium is dragged along the
                                     // stroke. The field is sampled from where
                                     // the dust came from, not pushed outward,
                                     // so it looks carried rather than bulged
const float SHEAR          = 0.085;  // sideways drag, opposite either side of
                                     // the stroke, so the edges roll
const float STIR_SCALE     = 3.40;   // frequency of the turbulence stirred in
const float STIR_RATE      = 0.55;   // how fast that turbulence churns
const float STIR_AMOUNT    = 0.22;   // how hard it perturbs the mass. This is
                                     // the disturbance proper: it moves the
                                     // field, so dust reorganises instead of
                                     // the picture simply getting brighter

// Vignette ------------------------------------------------------------------
// Taken out of the dust and haze, never out of the ground, so the floor stays
// perfectly flat across the whole frame.
const float VIGNETTE_START = 0.55;
const float VIGNETTE_END   = 1.30;
const float VIGNETTE_DEPTH = 0.55;

// ───────────────────────────────────────────────────────────────────────────

uniform float uTime;        // seconds; held constant under prefers-reduced-motion
uniform vec2  uMouse;       // pointer in UV space, already lerped on the CPU
uniform vec2  uFlow;        // unit direction the pointer is travelling, UV space
uniform float uStir;        // 0..1 agitation; fast attack, slow release
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

  // Centered, aspect-corrected space so the falloff stays circular.
  vec2 p = vec2((vUv.x - 0.5) * aspect, vUv.y - 0.5);
  vec2 m = vec2((uMouse.x - 0.5) * aspect, uMouse.y - 0.5);

  // ── the stroke frame: along the direction of travel, and across it.
  vec2  flow = vec2(uFlow.x * aspect, uFlow.y);
  float fl   = length(flow);
  vec2  dirV = (fl > 1e-5) ? flow / fl : vec2(1.0, 0.0);
  vec2  perp = vec2(-dirV.y, dirV.x);

  vec2  toCursor = p - m;
  float along    = dot(toCursor, dirV);
  float across   = dot(toCursor, perp);

  // Stretch the influence backwards along the stroke, so the disturbance
  // trails the pointer instead of sitting on it as a disc.
  float a  = (along < 0.0) ? along / WAKE_STRETCH : along;
  float d2 = length(vec2(a, across));

  // One smoothstep falloff on that distance, gated by how hard the pointer is
  // actually stirring. Stationary pointer, uStir 0, no disturbance at all.
  float pull = pow(1.0 - smoothstep(0.0, FLOW_RADIUS, d2), FLOW_FALLOFF);
  float act  = pull * uStir;

  // ── advection. What sits here now is what the stroke dragged here, so the
  //    field is sampled from behind the direction of travel. Sideways drag
  //    reverses either side of the centreline, which rolls the edges; it
  //    passes smoothly through zero, so there is no seam down the middle.
  float lateral = clamp(across / FLOW_RADIUS, -1.0, 1.0);
  vec2  q = p - dirV * act * ADVECT
              - perp * lateral * act * SHEAR;

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

  // Turbulence stirred into the field itself, not added to the output. The
  // dust reorganises around the stroke rather than the area simply lighting.
  float stir = fbm(q * STIR_SCALE + vec2(t * STIR_RATE, -t * STIR_RATE * 0.7)) - 0.5;
  n += stir * act * STIR_AMOUNT;

  float mass = pow(smoothstep(MASS_LOW, MASS_HIGH, n), MASS_GAMMA);

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
