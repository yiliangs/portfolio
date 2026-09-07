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
const float MASS_DRIFT     = 0.065;  // domain units/sec the mass slides. At
                                     // MASS_SCALE 2.42 a feature crosses the
                                     // short axis in about 37s; 0.018 took
                                     // over two minutes
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
const float GRAIN_PX       = 1.9;    // size of the finest grains, in device
                                     // pixels. Below about 1.5 the shapes
                                     // cannot resolve and it collapses back
                                     // toward per-pixel speckle
const float GRAIN_COARSE   = 0.42;   // relative size of the second, larger
                                     // population of grains
const float GRAIN_MIX      = 0.40;   // how much of that coarser population is
                                     // blended in. 0 gives one uniform grain
                                     // size, which is the giveaway of a
                                     // procedural effect
const float GRAIN_SPREAD   = 0.30;   // smooth noise is bell-shaped about 0.5,
                                     // not flat, so thresholding it raw makes
                                     // the dissolve wildly non-linear: nothing
                                     // at all below about 0.15 and solid above
                                     // 0.85. This stretches it back toward a
                                     // flat distribution. The few percent that
                                     // clamp at each end become grains that
                                     // always take ink, or never do, which is
                                     // true of a real emulsion too
const float DUST_SOFT      = 0.30;   // width of the threshold ramp, as a
                                     // fraction of the threshold. 0 is a hard
                                     // on/off dissolve in which every grain
                                     // carries identical weight, which is a
                                     // large part of why a naive dissolve
                                     // reads as a noise filter

// Grain motion --------------------------------------------------------------
// The grain has no clock. It used to re-roll to a wholly new field a fixed
// number of times a second, and a fixed rate is a pattern: given a few seconds
// the eye finds the beat and the whole thing reads as an effect running on
// top of the picture. Instead the grain is carried by the same drift and warp
// that move the haze, wanders slowly on its own, and its two populations slide
// against each other so grains form and dissolve. Nothing here shares a period
// with anything else.
const float GRAIN_CARRY    = 1.0;    // share of the haze's drift that carries
                                     // the grain along with it. 1 travels with
                                     // the form; 0 leaves it pinned to the
                                     // screen while the form slides past
const float GRAIN_SHEAR    = 0.12;   // share of the warp that also reaches the
                                     // grain. The warp's gradient is steep
                                     // enough that carrying it whole would
                                     // stretch grains well past a pixel and
                                     // turn them to mush; this is about the
                                     // largest share that still resolves
const float GRAIN_CREEP    = 0.055;  // rate of the grain's own slow wander,
                                     // driven by noise rather than a constant
                                     // so it never repeats or holds a heading
const float GRAIN_CREEP_PX = 26.0;   // how far that wander reaches, device px
const float GRAIN_SLIP     = 0.120;  // rate the two grain populations slide
                                     // against each other. This is what makes
                                     // grains appear and dissolve rather than
                                     // merely translate

// Tooth ---------------------------------------------------------------------
// The sheet's own texture: a slow variation in how readily each patch takes
// ink. Without it the stipple is mechanically even at every scale above the
// pixel, which no real medium is, and the eye reads that evenness as digital.
const float TOOTH_SCALE    = 26.0;   // tooth features per screen height
const float TOOTH_DEPTH    = 0.30;   // 0 is a perfectly even sheet

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

// A second, deliberately unrelated rotation between the two grain populations.
// Value noise sits on an integer lattice; leaving both populations on the same
// axes lets those lattices agree and a faint grid surfaces out of the stipple.
const mat2 GRAIN_ROT = mat2(0.7373688, 0.6754904, -0.6754904, 0.7373688);

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

  // Named because the grain rides them too, further down. These are the whole
  // motion of the field: a slow translation, and a warp that bends it.
  vec2 driftUnits = vec2(t * MASS_DRIFT * 0.5, -t * MASS_DRIFT);
  vec2 warpUnits  = (warp - 0.5) * 2.0 * MASS_WARP;

  float n = fbm(sp + warpUnits + driftUnits);

  float mass = pow(smoothstep(MASS_LOW, MASS_HIGH, n), MASS_GAMMA);

  // Corners fade back to bare paper by losing mass, never by tinting the sheet.
  float r = length(vUv - 0.5) * 1.41421356;
  mass *= 1.0 - smoothstep(VIGNETTE_START, VIGNETTE_END, r) * VIGNETTE_DEPTH;

  // ── the dissolve. A pixel takes ink when its draw falls under the local
  //    mass, so grain variance rises with ink density instead of holding flat.
  //    The draw is a SMOOTH field, not a per-pixel hash. Thresholding a hash
  //    can only ever cut square pixels, and thresholding a regular dither
  //    lattice leaves a visible weave; thresholding smooth noise cuts grains
  //    with irregular outlines. Two scales are blended so the grains come in a
  //    range of sizes rather than one, which is what stops the eye reading the
  //    texture as an effect laid over the picture.

  // Device pixels per domain unit, so the field's motion can be handed to the
  // grain in the grain's own units.
  float pxPerUnit = uResolution.y / MASS_SCALE;

  // The grain rides the field: the same drift, and a safe share of the same
  // warp. Added rather than subtracted, so it travels the way the form does.
  vec2 gpx = gl_FragCoord.xy
           + (driftUnits * GRAIN_CARRY + warpUnits * GRAIN_SHEAR) * pxPerUnit;

  // Its own wander, steered by noise rather than by a constant, so it neither
  // repeats nor keeps a heading long enough to be read as a direction.
  gpx += (vec2(vnoise(vec2(t * GRAIN_CREEP, 11.3)),
               vnoise(vec2(7.9, t * GRAIN_CREEP))) - 0.5) * GRAIN_CREEP_PX;

  vec2  gp   = gpx / GRAIN_PX;
  float slip = t * GRAIN_SLIP;
  float draw = mix(vnoise(gp),
                   vnoise(GRAIN_ROT * gp * GRAIN_COARSE + 53.17 + slip),
                   GRAIN_MIX);
  draw = clamp((draw - 0.5) / GRAIN_SPREAD + 0.5, 0.0, 1.0);

  // How readily this patch of sheet takes ink at all.
  float tooth = 1.0 + (vnoise(vUv * TOOTH_SCALE * vec2(aspect, 1.0)) - 0.5)
                      * 2.0 * TOOTH_DEPTH;

  // A soft edge on the threshold gives grains a range of densities rather than
  // one weight. The width is proportional to the threshold so it closes to
  // nothing as the mass does, which keeps bare paper exactly bare.
  float thr = clamp(mass * DUST_DENSITY * tooth, 0.0, 1.0);
  float w = max(DUST_SOFT * thr, 1e-5);
  float inked = 1.0 - smoothstep(thr - w, thr + w, draw);

  vec3 col = COL_PAPER
           - COL_INK * mass * HAZE_GAIN
           - COL_INK * mass * DUST_GAIN * inked;

  gl_FragColor = vec4(col, 1.0);
}
`;
