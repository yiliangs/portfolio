# Handoff: Portfolio Website (Yiliang Shao)

## Overview
A personal portfolio in three registers: a **Home** page with two objects in the void (the Research parchment roll and the Development wireframe cube), a **Research** page (book-like, serif, justified columns), a **Development** page (drawing register, monospace, dense dated index), and per-project **Chapter** sheets. Navigation between pages is choreographed: the roll and the cube physically travel and morph into the next page's hero object, and headline text morphs between registers.

## About the Design Files
Everything in `design/` is a **design reference built in HTML** (a Design Component prototype plus three.js/canvas helper modules). It shows intended look and behavior; it is not production code to ship as-is. Recreate it in the target codebase's environment (the connected repo is a static GitHub Pages site — see `design/github.md`; a vanilla or React build both work). Lift exact values, easing and sequencing from the source files.

## Fidelity
**High-fidelity.** Colors, type, spacing, timing and 3D behavior are final. Rebuild pixel-for-pixel using the Classical design system tokens (bundled in `design/_ds/…/styles.css`).

## Screens / Views

### Home (`main[data-screen-label="Home"]`)
- Grid rows: `auto minmax(0,1fr) auto`, min-height `calc(100vh - 57px)`, horizontal padding `clamp(20px,5vw,72px)`.
- Headline block (top, centered): `h1` "Yiliang Shao" — `--font-heading` (Cormorant Garamond) 300, `clamp(30px,4.4vw,58px)`, line-height 1.08, letter-spacing -0.01em. Subline beneath in body serif.
- Middle: two-column grid `minmax(0,1.1fr) minmax(0,0.9fr)`, gap `clamp(16px,4vw,72px)`, min-height `min(60vh,600px)`.
  - Left: **Research roll** — a button cell (`height:min(44vh,400px)`) holding the word "Research" (heading face 300, `clamp(26px,3.4vw,50px)`, letter-spacing 0.01em). The 3D parchment roll (`parchment.js`) is anchored to this cell in a fixed full-viewport WebGL layer (`z-index:1`, opacity 0.8). Clicking → Research page.
  - Right: **Development cube** — a button cell; `home.js` mounts a three.js wireframe cube (ink `#1a1918`, edge opacity 0.5, face wash 0.04 back-side) with the word "Development" as extruded 3D outline type inside (helvetiker glyph outlines → `ExtrudeGeometry`, depth `0.035 × cube side`; only cap contours are stroked, opacity 0.5 → 0.75 on hover). The lettering counter-rotates so it stays facing the viewer (`inner.quaternion = cube⁻¹ slerp identity 0.12`). Clicking → Development page.
- Footer line (bottom): centered flex row, gap 24px, small-caps meta links.
- **Background field** (`field.js`, fixed layer `z-index:0`, fades in 900ms): 700 particles ride a curl-noise current and leave hairline ink trails (line width 0.45–0.95px, alpha 0.24; 4% of particles gold `--color-accent` at 0.45). Trails fade by `destination-out` 3.5%/frame. Each home object bends the current into a narrow tangential band just outside it (radius `min(140, max(w,h)/2)`; roll clockwise, cube counter-clockwise); the cursor pushes particles away within ~110px. Trails thin to zero within 70px of the headline block and footer ("quiet" boxes). Field is destroyed 1s after leaving Home.

### Research (`data-screen-label="Research"`)
- Full-viewport hero (`height:calc(100vh - 57px)`, perspective 1200px) with the parchment roll unrolled into a script; hero text tilts with the cursor (see Interactions). Dotted radial-gradient paper texture at 16% ink.
- Below: centered measure, justified Lora body, hairline rules, contents list, plates (`.plate`), notes.

### Development (`data-screen-label="Development"`)
- `max-width:1160px`, monospace 14px/22px. A 22-column drafting grid (`grid-auto-rows:44px`, 1px rules at 16% ink) with the parchment shown as a flat **platform** (axonometric plate) in the top cell; dated index rows; plates as evidence.

### Chapter
- `max-width:1200px`, 28px square grid background; register (serif/mono) inherited from the project's kind.

### Header (all pages)
- Sticky, 56px, bottom hairline `--color-divider`. Brand "Yiliang Shao" (18px, 600) rendered per-character so it can swap font/tracking between registers with a stagger. Right: two tabs "Research" / "Development" (heading face; tab color `--color-text` when active, `--color-neutral-600` otherwise), hidden on Home. Background/border transition 780ms `cubic-bezier(.65,0,.15,1)`.

## Interactions & Behavior
- **Page transitions** (`transition()`): 780ms, easing `cubic-bezier(.65,0,.15,1)`. Text marked `[data-morph]` is captured (`captureTexts`) and morphed to its new position (`morphTexts`).
- **Home → Development (cube click)**: 1.5s, three beats — the 3D word dissolves (rises, shrinks, fades), the cube travels/turns into the platform's axonometric pose while camera fov closes 24°→3° (perspective→parallel), then flattens into a sheet with the platform's exact proportions. The parchment platform fades in only after its first frame draws, giving a 200ms cross-fade with no gap.
- **Development → Home (brand click)**: reverse — platform box is remembered (`goHome`) and the cube takes over from it, growing back to 3D.
- **Home → Research (roll click)**: the roll travels to the Research hero and unrolls.
- **Cursor tilt** (`onTilt`, pointermove): measures against the Research hero, the Development platform, or on Home the roll cell; sets `--mx/--my` on root, tilts the hero text and parchment, and feeds the background field's pointer.
- **Cube hover**: edge/lettering opacity rises (+0.25), cursor pointer.
- **Keyboard**: `Esc` back to page, `T` Development, `E` Research, `←/→` prev/next project, `1–9` open project n.
- **Research tab hover**: `startTyping` types the label; `.breathe` is a slow opacity pulse.

## State Management
`view: 'home' | 'page' | 'chapter'`, `page: 'writing' | 'tooling'`, `idx` (project), `hovered`, `leafHover`, `typed`, `previewReg`, `brandAnim`. Transient (non-state) flags: `parchTravel`, `cubeLead`, `plateLead`, `plateFrom`. Canvas layers (`parch`, `home`, `fog`) are lazily imported modules mounted into fixed layers and destroyed when their view leaves (home/fog after a 1s grace).

## Design Tokens (Classical)
- Ground `--color-bg #f3f2f2`, ink `--color-text #201f1d` (3D ink `#1a1918`), accent `--color-accent #b68235`; neutral/accent 100–900 OKLCH ramps in `styles.css`.
- Type: `--font-heading` Cormorant Garamond (300–600), `--font-body` Lora; monospace register `Geist Mono, ui-monospace`.
- Spacing `--space-*` (1.15× density), radius `--radius-*` (4px base), shadows `--shadow-sm/md/lg`.
- Easing used everywhere: `cubic-bezier(.65,0,.15,1)`; durations 420 / 780 / 900 / 1500ms.
- Hairlines: 1px `--color-divider` or `color-mix(ink 16%)`.

## Assets
- `design/_ds/…` — Classical design system (styles.css, bundle).
- three.js 0.160 via unpkg (`three.module.js`); helvetiker typeface JSON from three's examples for the 3D lettering.
- Lucide icons. No raster imagery bundled; plates are `<image-slot>` placeholders.

## Files
- `design/Portfolio.dc.html` — the whole site (template + logic class).
- `design/home.js` — Development cube (three.js) and the cube→platform collapse.
- `design/parchment.js` — Research roll / script / platform (three.js).
- `design/field.js` — home background particle field (2D canvas).
- `design/src/text-rippling.js` — text ripple helper.
- `design/image-slot.js`, `design/support.js` — runtime helpers for the prototype.
- `design/github.md` — connected repository record.
