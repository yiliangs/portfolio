# Background field (experiment)

An exploration, not adopted. It was built alongside the portfolio rather than
into it, and nothing on `master` imports it. The branch is kept because the
mechanism and the measuring rigs are reusable even though the result was not
accepted.

## What it is

A full-screen three.js quad running one GLSL fragment shader in a single pass.
No render targets, no ping-pong, no external assets, no build step. It renders
a dissolve: a flat sheet of paper carries a slow, soft, low-contrast mass, and
that mass is never drawn. It is used as the probability that a given pixel
takes a grain of ink. Where the mass is near zero almost nothing lands and the
frame stays bare paper; where it rises, more grains ink and the form arrives as
sand rather than as a smooth wash.

The distinguishing statistic, and the thing to preserve in any retune, is that
grain variance grows with local ink density instead of holding constant. A
gradient with noise added over it holds it constant. That difference is what
separates this from an Add Noise filter, and it is what `field-measure.html`
scores.

Two motions, deliberately unlike each other:

- The **haze** drifts and warps. It travels and it persists.
- The **grain** does not travel at all. It sits on a lattice fixed to the
  screen, the way grain sits in an emulsion while the image moves through it,
  and is animated through a third axis of the noise so grains form and dissolve
  where they are. Anything that carries grains across the screen gives each one
  a trajectory, and a trajectory gets followed and read as a direction.

## Files

| file | |
| --- | --- |
| `src/background-field.glsl.js` | the shader. Every tunable is a named `const` grouped at the top |
| `src/background-field.js` | three.js setup. `mount(container) -> { setFragmentShader, setPaused, destroy }` |
| `portal.html` | live tuning. Controls are generated from the shader source |
| `field-measure.html` | the measuring rigs, described below |
| `background-field-demo.html` | the bare effect, no chrome |

The shader ships as exported template strings rather than a `.glsl` file so the
pair needs no loader and no runtime fetch, which keeps it working from `file://`
as well as from Pages.

## Running it

Any static server from the branch root, then open `portal.html`:

    npx --yes serve .

The portal slices the `TUNABLES` block out of the exported shader source,
generates a control per constant with that constant's own comment as its
caption, and rewrites the same block in a working copy on each change. The
shipped shader therefore stays exactly as authored, plain consts at the top,
with no uniforms added to make it tunable and no second parameter list to drift
out of sync. `Export block` emits the rewritten block ready to paste back.

## The measuring rigs

`field-measure.html` exists because this effect is judged by statistics that the
eye is bad at, and because two separate wrong readings were taken here before
the rigs were built properly. All three modes render offscreen at chosen `uTime`
values rather than from the wall clock, since statistics taken at one arbitrary
moment describe where the form happened to be, not the effect.

- `?v=[["name",{"DUST_GAIN":"0.40"}], ...]` scores constants against the
  reference distribution and prints a ranked table.
- `?clock=1` walks `uTime` in 120ths of a second and reports how much the
  picture changes between steps, to show the grain has no beat. Read it by
  coefficient of variation, never by the height of a spectral peak: a hard
  reseed is an impulse train, fills every harmonic, lifts the median with it,
  and scores a clean clock lower than smooth motion.
- `?drift=1` cross-correlates frames a fixed interval apart to show the grain
  does not travel while the haze does. It separates the two by a 25 pixel low
  pass first, and carries a control that shifts a frame by a known offset and
  must find it.

Keep that control. It caught a version of the check that was sampling a window
of bare paper, where every correlation is zero and the absence of drift is
indistinguishable from the absence of an image.

## Where it actually stands

The mechanism is right and the grain character is close: 17.97 against the
reference's 19.31 in the deepest band, 14.06 against 13.46 in the one below.

The tonal distribution is not close. Bare paper sits at about 7 percent of the
frame against the reference's 50 percent, which is the largest single
difference and follows from the dialled `MASS_LOW` of 0.460 together with six
octaves at `MASS_SCALE` 2.42. `MASS_LOW` is the one knob that buys coverage
back: 0.520 gives 53 percent bare paper, 0.560 gives 62. Peak ink also falls
short, 107 against 119, and the top percentile runs heavy. Every attempt to
raise the peak widened the bright region instead of concentrating it; the
reference appears to have a smaller, hotter core than this mass field produces.

Two directions were tried for pointer interaction, a displacement lens and a
velocity-driven disturbance of the flow, and both were rejected. There is no
pointer input now and none of that code remains. Since `uTime` became the only
thing that varies per frame, the loop draws one frame and stops scheduling
under `prefers-reduced-motion`, so the effect costs no GPU at rest.

Six octaves is the expensive knob, one full noise lookup per octave in each of
three fBm calls. Software rendering fell from 54 to 39 fps when it went from
three to six. A real GPU will not notice at this size; a low-end phone might.

## If it is picked up later

The palette is inverted from the dark original by sign, not by swapping
constants: the two accumulation terms are subtracted from `COL_PAPER` rather
than added to a dark ground. Every pixel is therefore the exact complement of
the dark version, and inverting back is the same one-character change in both
places. `field-measure.html` works in ink density for the same reason, so its
reference figures survive either orientation.
