// background-field.glsl.js — the shader half of the background effect.
// Exports GLSL source as strings so the pair stays buildless: no loader, no
// runtime fetch, so it works from file:// as well as from Pages.
// Every knob worth turning is a named const at the top of FRAGMENT_SHADER.
// The `/* glsl */` tags are picked up by editor extensions for highlighting.

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

// Noise ---------------------------------------------------------------------
const int   FBM_OCTAVES    = 4;      // more = finer detail, linearly more cost
const float FBM_LACUNARITY = 2.03;   // frequency step per octave (off-integer
                                     // on purpose: keeps octaves from aligning)
const float FBM_GAIN       = 0.52;   // amplitude step per octave

// Field ---------------------------------------------------------------------
const float FIELD_SCALE    = 2.55;   // noise cells across the short axis
const float FIELD_DRIFT    = 0.042;  // domain units/sec the whole field slides
const float WARP_SCALE     = 1.30;   // frequency of the warp field vs the field
const float WARP_STRENGTH  = 0.90;   // how far the warp drags samples; the
                                     // difference between "clouds" and "smoke"

// Cursor --------------------------------------------------------------------
const float CURSOR_RADIUS  = 0.42;   // influence radius, aspect-corrected units
const float CURSOR_FALLOFF = 1.60;   // >1 tightens the core, softens the edge
const float CURSOR_CORE    = 0.19;   // displacement fades back to zero inside
                                     // this radius. Without it the radial
                                     // direction is undefined at the pointer
                                     // and the field pinches to a hard point.
const float CURSOR_PUSH    = 0.24;   // peak radial displacement
const float CURSOR_SWIRL   = 0.80;   // peak twist, radians
const float CURSOR_LIFT    = 0.14;   // tone added under the pointer

// Tone ----------------------------------------------------------------------
// fBm keeps most of its mass in the middle, so the palette's light stop never
// gets reached on the raw value. The field is stretched toward the ends, then
// blended back against the original: a full smoothstep alone clips the tails
// into flat black and flat white plates and loses the mist entirely.
const float FIELD_LOW      = 0.24;   // stretch window, low end
const float FIELD_HIGH     = 0.80;   // stretch window, high end
const float FIELD_CONTRAST = 0.50;   // 0 = raw fBm, 1 = fully stretched

// Contours ------------------------------------------------------------------
const float CONTOUR_COUNT  = 7.0;    // isolines across the field's 0..1 range
const float CONTOUR_WIDTH  = 0.085;  // half-width, in normalized band units
const float CONTOUR_INK    = 0.34;   // how far a line pulls toward COL_DEEP
const float CONTOUR_AA     = 1.5;    // fwidth multiplier for line antialiasing

// Palette -------------------------------------------------------------------
const vec3  COL_DEEP  = vec3(0.082, 0.082, 0.090);
const vec3  COL_MID   = vec3(0.355, 0.368, 0.392);
const vec3  COL_PAPER = vec3(0.931, 0.922, 0.898);

// The gap between RAMP_A1 and RAMP_B0 is what gives COL_MID real territory;
// overlap the two windows and the palette collapses to a two-tone.
const float RAMP_A0 = 0.00;          // deep -> mid, start
const float RAMP_A1 = 0.50;          // deep -> mid, end
const float RAMP_B0 = 0.62;          // mid -> paper, start
const float RAMP_B1 = 1.00;          // mid -> paper, end

// Grain ---------------------------------------------------------------------
const float GRAIN_AMOUNT = 0.052;    // peak-to-peak is roughly this
const float GRAIN_SCALE  = 1.0;      // 1.0 = one grain per device pixel
const float GRAIN_HZ     = 12.0;     // reseeds/sec; 0.0 freezes the grain

// Vignette ------------------------------------------------------------------
const float VIGNETTE_START = 0.58;
const float VIGNETTE_END   = 1.18;
const float VIGNETTE_DEPTH = 0.34;

// ───────────────────────────────────────────────────────────────────────────

uniform float uTime;        // seconds; held constant under prefers-reduced-motion
uniform vec2  uMouse;       // pointer in UV space, already lerped on the CPU
uniform vec2  uResolution;  // drawing buffer size, device pixels

varying vec2 vUv;

// Rotation folded between octaves so features do not stack on the axes.
const mat2 OCTAVE_ROT = mat2(0.80, 0.60, -0.60, 0.80);

// Hash by Dave Hoskins (hash12, MIT). Chosen over the usual
// fract(p * bigVec) one-liner because that one stays correlated along columns
// on an integer lattice, which shows up as vertical striping in the grain.
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

  // ── cursor influence: one smoothstep falloff, reused for both the
  //    displacement and the tone lift. No second pass, no extra buffer.
  vec2  toCursor = p - m;
  float dist     = length(toCursor);
  float pull     = pow(1.0 - smoothstep(0.0, CURSOR_RADIUS, dist), CURSOR_FALLOFF);

  // Displacement is tapered back to zero inside CURSOR_CORE, so the pointer
  // reads as a lens with a calm eye instead of a singularity.
  float lens = pull * smoothstep(0.0, CURSOR_CORE, dist);

  // Twist the sample point around the pointer, then shove it radially out.
  float ang = lens * CURSOR_SWIRL;
  float cs  = cos(ang);
  float sn  = sin(ang);
  vec2  q   = mat2(cs, sn, -sn, cs) * toCursor + m;
  q += (toCursor / max(dist, 1e-4)) * lens * CURSOR_PUSH;

  vec2 sp = q * FIELD_SCALE;

  // ── domain-warped fBm. Two noise lookups steer a third; the drift terms
  //    move along different axes so the field never reads as a pan.
  float t = uTime;
  vec2 warp = vec2(
    fbm(sp * WARP_SCALE + vec2(0.0, t * FIELD_DRIFT)),
    fbm(sp * WARP_SCALE + vec2(4.7, 2.3) - vec2(t * FIELD_DRIFT * 0.8, 0.0))
  );
  vec2 warped = sp + (warp - 0.5) * 2.0 * WARP_STRENGTH;
  float field = fbm(warped + vec2(t * FIELD_DRIFT * 0.5, -t * FIELD_DRIFT));

  // Stretch the field across the palette, then lift what sits under the pointer.
  float tone = mix(field, smoothstep(FIELD_LOW, FIELD_HIGH, field), FIELD_CONTRAST);
  tone = clamp(tone + pull * CURSOR_LIFT, 0.0, 1.0);

  // ── three-stop ramp
  vec3 col = mix(COL_DEEP, COL_MID, smoothstep(RAMP_A0, RAMP_A1, tone));
  col = mix(col, COL_PAPER, smoothstep(RAMP_B0, RAMP_B1, tone));

  // ── isolines of the field, antialiased against the screen-space gradient
  float ridge = field * CONTOUR_COUNT;
  float tri   = abs(fract(ridge) - 0.5) * 2.0;   // 0 on the line, 1 between
  float aa    = fwidth(ridge) * CONTOUR_AA + 1e-4;
  float line  = 1.0 - smoothstep(CONTOUR_WIDTH, CONTOUR_WIDTH + aa, tri);
  col = mix(col, COL_DEEP, line * CONTOUR_INK);

  // ── grain, quantized in time so it stutters like film rather than boiling
  float seed  = floor(t * GRAIN_HZ);
  float grain = hash12(gl_FragCoord.xy * GRAIN_SCALE + seed * 137.13) - 0.5;
  col += grain * GRAIN_AMOUNT;

  // ── vignette
  float r   = length(vUv - 0.5) * 1.41421356;
  float vig = smoothstep(VIGNETTE_START, VIGNETTE_END, r);
  col *= 1.0 - vig * VIGNETTE_DEPTH;

  gl_FragColor = vec4(col, 1.0);
}
`;
