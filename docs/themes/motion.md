# Ink motion: shader surfaces for themes

A theme can carry one quiet moving surface: a slow color field behind the
page, a grain under the name, a cover photo printed as dots. The shared
**ink motion engine** runs it. Themes still ship no JavaScript: a theme
describes the surface in its manifest's `motion` block and styles it in
`theme.css`, and the engine draws and animates it.

The shaders come from [Paper Shaders](https://shaders.paper.design)
(`@paper-design/shaders` 0.0.82, Apache-2.0), vendored in
`assets/ink/motion/` with Paper's `LICENSE` and `NOTICE`. Use the Paper
playground to try presets and parameters, then copy the values into the
manifest.

Read [`THEMES.md`](../../THEMES.md) and [`authoring.md`](authoring.md) first.
This page adds the motion contract on top of them.

## 1. Taste rules

Motion is one idea per theme, never decoration everywhere.

- **One surface.** A backdrop or one slot surface, not both. The engine
  mounts at most 3 surfaces on a page; design for one.
- **Slow.** `speed` 0.05 to 0.4. Above 0.4 the validator warns
  (`motion-calm`). Most good surfaces read as still at a glance.
- **Low contrast.** Mix the shader's colors from the palette: the background
  and a tint of the accent (`color-mix(in oklab, var(--ink-accent) 20%,
  var(--ink-bg))`), not the full accent against the full background.
- **Content first.** Text never depends on the shader. Body text sits on
  the plain background or on a surface whose every frame keeps AA contrast.
- **Fully usable without it.** With motion off, with JavaScript off, without
  WebGL and under `prefers-reduced-motion`, the page looks designed, not
  broken: the surface shows its CSS fallback.

## 2. The manifest block

`motion` is optional. A theme with motion must also declare the `motion`
tweak, exactly as below (the validator checks the options and labels).

```json
"motion": {
  "shader": "grain-gradient",
  "placement": "slot",
  "speed": 0.2,
  "frame": 2400,
  "colors": {
    "colorBack": "--ink-bg",
    "colors": ["--ink-bg", "--motion-tint", "--ink-accent"]
  },
  "params": { "shape": "wave", "softness": 0.85, "intensity": 0.2, "noise": 0.25, "scale": 1.6 }
},
"tweaks": [
  ...,
  { "key": "motion", "type": "select", "label": "Motion", "default": "on",
    "options": [
      { "value": "on", "label": "Moving" },
      { "value": "still", "label": "Still" },
      { "value": "off", "label": "Off" } ] }
]
```

| field | rule |
|---|---|
| `shader` | one of the shaders in section 6 |
| `placement` | `"backdrop"`: the engine places the surface as the first element of `<body>`, fixed behind the page. `"slot"`: your slot includes `{% include ink/motion.html %}` where the surface goes |
| `speed` | 0 to 1 (Paper's own speed; 1 is fast). Calm: 0.05 to 0.4. Or a custom property name (section 4). Default 0.2 |
| `frame` | the moment shown when the surface is still (motion `still`, reduced motion, or a shader that does not move), in milliseconds of shader time. Default 0. Pick it in the playground |
| `colors` | the shader's color inputs (section 6), each a CSS custom property name such as `"--ink-accent"`; list inputs take 1 to the shader's maximum. Missing colors use the defaults in `scripts/motion/shaders.json` |
| `params` | the shader's parameters and Paper's sizing parameters (`fit`, `scale`, `rotation`, `offsetX`, `offsetY`, `originX`, `originY`, `worldWidth`, `worldHeight`), checked against Paper's ranges. Numbers and options may be a custom property name instead |

The `motion` tweak:

- `on` (default): the surface moves. Under `prefers-reduced-motion: reduce`
  it shows one still frame instead.
- `still`: one frame, no animation loop.
- `off`: no canvas and no shader download. On a real site the engine script
  is not even linked; previews always link it so the customizer can switch
  back.

Under forced colors (Windows high contrast) the engine treats every value as
`off`, and `motion.css` hides any canvas, so the system colors never sit on a
moving surface.

In `theme.css`, `[data-ink-motion="off"]` and the other values work like
any select tweak.

## 3. Placement and CSS

`assets/ink/motion.css` loads before your `theme.css` on themes with motion.
The surface is:

```html
<div class="ink-motion ink-motion--slot" aria-hidden="true" data-ink-motion-config="..."></div>
```

Your CSS gives it a box and a fallback. The box must be reserved in CSS
(size, `inset`, or `aspect-ratio`), so nothing shifts when the canvas
arrives.

```css
/* A slot surface behind the home page's name. */
.drift-hero { position: relative; isolation: isolate; padding: 72px 24px 48px; }
.drift-hero > .ink-motion {
  position: absolute; inset: 0; z-index: -1; border-radius: 12px;
  --ink-motion-fallback: linear-gradient(160deg, var(--motion-tint), var(--ink-bg) 70%);
}
:root { --motion-tint: color-mix(in oklab, var(--ink-accent) 28%, var(--ink-bg)); }
```

| hook | does |
|---|---|
| `.ink-motion` | the surface: `position: relative; overflow: hidden; pointer-events: none` and `background: var(--ink-motion-fallback, transparent)` |
| `.ink-motion--backdrop` | `position: fixed; inset: 0; z-index: -1`. Keep `body { background: var(--ink-bg) }`: it paints the viewport, and the backdrop sits above it and below the content. Confine it with `position: absolute` and a capped height (for example `min(100svh, 900px)`), so it scrolls away and pauses: a fixed backdrop is always on screen and animates for as long as the page is open |
| `--ink-motion-fallback` | what the surface shows before the canvas, and forever without JavaScript or WebGL. Make it a still version of the idea (a gradient, a tint) |
| `--ink-motion-opacity` | the canvas's final opacity (default 1); lower it to soften a shader |
| `[data-ink-motion-ready]` | set once the canvas has drawn; the canvas fades in over 1.2s (no fade under reduced motion) |
| `[data-ink-motion-state]` | `on`, `still`, `off` or `failed`, for tests and for CSS |

Image shaders (`halftone-dots`, `fluted-glass`, `image-dithering`, and
`paper-texture` optionally) draw a post's cover photo. Keep your own `<img>`
for the photo, so it shows without JavaScript and keeps its alt text, and lay
the surface over it:

```liquid
<figure class="inkdot-cover">
  <img src="{{ page.cover_image }}" alt="">
  {% include ink/motion.html image=page.cover_image %}
</figure>
```

```css
.inkdot-cover { position: relative; aspect-ratio: 3 / 2; overflow: hidden; }
.inkdot-cover > img { width: 100%; height: 100%; object-fit: cover; }
.inkdot-cover > .ink-motion { position: absolute; inset: 0; }
```

A photo from another site loads only if that site allows it (CORS); when it
does not, the surface stays empty and your `<img>` shows. Include the
surface once per page, for example on the post page's cover, not in every
card of a list.

## 4. Colors and live tweaks

Colors are custom property **names**, resolved on the surface element at
run time, so anything that changes the property recolors the shader without
a reload: the accent tweak, light and dark mode, follow-the-system mode
switching, the inkdrafts.com customizer, and an owner's `custom.css`.
Define your own mixes in `theme.css`:

```css
:root { --motion-tint: color-mix(in oklab, var(--ink-accent) 20%, var(--ink-bg)); }
:root[data-ink-palette="sea"] { --motion-tint: #cfe3e8; }
```

Number and option parameters, and `speed`, may also be custom property
names (`"intensity": "--motion-strength"`), so a range or select tweak can
drive them through CSS (`--motion-strength: var(--tw-strength)`).

The engine watches `<html>` attributes, the `#ink-tweaks` block and
`prefers-color-scheme`, and redraws when they change.

## 5. What the engine guarantees

- **No render blocking, no layout shift.** One `<script type="module">`
  from the site's own origin, linked only on themes with motion. The surface
  box comes from CSS. The canvas fades in over the fallback.
- **Only what the page uses.** `core.js` (about 7 KB gzip) plus one module
  for the theme's shader (1 to 6 KB gzip). Shaders that need Paper's noise
  texture also load `noise.js` (about 18 KB gzip, cached).
- **Cheap.** The animation pauses while the tab is hidden or the surface is
  off screen (no `requestAnimationFrame` at all), runs at most 30 frames a
  second, renders at most 1.5 device pixels per CSS pixel and at most 1.6
  million pixels per surface.
- **Clamped.** At run time every number (including one read from a custom
  property or a tweak) is clamped to Paper's range in `shaders.json`, and
  `speed` to 0 to 1, so CSS can never push a shader past what the validator
  allows.
- **Accessible.** The surface is `aria-hidden`, takes no pointer events and
  holds nothing focusable.
- **Safe failure.** No WebGL, a shader that does not compile, a lost GPU
  context, or a cover photo that cannot load: the canvas is removed, the
  state becomes `failed`, and the CSS fallback stays.
- **No inline styles.** Paper's runtime `<style>` injection is patched out;
  `motion.css` has the rules. The previews' CSP needs nothing beyond
  `script-src 'self'`.

## 6. Shaders

Ranges are Paper's; the validator rejects values outside them. The calm
column is the range this page recommends for quiet surfaces (the validator
warns outside it). The full list of parameters, defaults and ranges is
`scripts/motion/shaders.json`.

| shader | looks like | motion | colors | params | calm |
|---|---|---|---|---|---|
| `mesh-gradient` | Soft color spots that drift and blend | moves | `colors` (list, up to 10) | `distortion`, `swirl`, `grainMixer`, `grainOverlay` | `distortion` 0.3 to 0.8; `swirl` 0 to 0.3; `grainOverlay` 0 to 0.15 |
| `grain-gradient` | Grainy color fields, like risograph ink | moves | `colorBack`, `colors` (list, up to 7) | `softness`, `intensity`, `noise`, `shape` | `softness` 0.6 to 1; `intensity` 0.05 to 0.3; `noise` 0.1 to 0.35 |
| `dithering` | Two-color dithered shapes, like an old screen | moves | `colorBack`, `colorFront` | `shape`, `type`, `size` | `size` 2 to 4 |
| `dot-grid` | A still grid of dots | still | `colorBack`, `colorFill`, `colorStroke` | `size`, `gapX`, `gapY`, `strokeWidth`, `sizeRange`, `opacityRange`, `shape` | `size` 1 to 3; `opacityRange` 0.2 to 0.8 |
| `perlin-noise` | Slow two-color noise, like clouds or marble | moves | `colorBack`, `colorFront` | `proportion`, `softness`, `octaveCount`, `persistence`, `lacunarity` | `softness` 0.5 to 1 |
| `simplex-noise` | Flowing bands of color | moves | `colors` (list, up to 10) | `stepsPerColor`, `softness` | `softness` 0.6 to 1 |
| `waves` | Rows of wavy lines | still | `colorBack`, `colorFront` | `shape`, `frequency`, `amplitude`, `spacing`, `proportion`, `softness` | `proportion` 0.03 to 0.15 |
| `warp` | Patterns that bend and swirl like liquid | moves | `colors` (list, up to 10) | `proportion`, `softness`, `distortion`, `swirl`, `swirlIterations`, `shapeScale`, `shape` | `distortion` 0.05 to 0.3; `swirl` 0.2 to 0.8 |
| `voronoi` | Cells like cracked glaze or leaf veins | moves | `colors` (list, up to 5), `colorGlow`, `colorGap` | `stepsPerColor`, `distortion`, `gap`, `glow` | `distortion` 0.1 to 0.4 |
| `neuro-noise` | Fine glowing threads | moves | `colorFront`, `colorMid`, `colorBack` | `brightness`, `contrast` | `brightness` 0 to 0.1; `contrast` 0.1 to 0.4 |
| `god-rays` | Soft rays of light from one point | moves | `colorBack`, `colorBloom`, `colors` (list, up to 5) | `density`, `spotty`, `midIntensity`, `midSize`, `intensity`, `bloom` | `intensity` 0.1 to 0.4 |
| `smoke-ring` | A ring of slow smoke | moves | `colorBack`, `colors` (list, up to 10) | `noiseScale`, `noiseIterations`, `radius`, `thickness`, `innerShape` | - |
| `paper-texture` | Paper grain, folds and fibers | still, optional `image=` | `colorBack`, `colorPaper`, `colorShadow` | `blending`, `distortion`, `clip`, `angle`, `seed`, `roughness`, `roughnessSize`, `roughnessRows`, `fiber`, `fiberSize`, `folds`, `foldSizeX`, `foldSizeY`, `foldOffsetX`, `foldOffsetY`, `wrinkles`, `wrinkleSize`, `crumples`, `crumpleCount`, `drops` | - |
| `halftone-dots` | A post's cover photo as printed dots | still, needs `image=` | `colorBack`, `colorFront` | `size`, `radius`, `contrast`, `originalColors`, `inverted`, `grainMixer`, `grainOverlay`, `grainSize`, `grid`, `type` | - |
| `fluted-glass` | A post's cover photo through ribbed glass | still, needs `image=` | `colorBack`, `colorShadow`, `colorHighlight` | `shadows`, `highlights`, `size`, `shape`, `angle`, `distortionShape`, `distortion`, `shift`, `stretch`, `blur`, `edges`, `marginLeft`, `marginRight`, `marginTop`, `marginBottom`, `grainMixer`, `grainOverlay` | - |
| `image-dithering` | A post's cover photo as dithered pixels | still, needs `image=` | `colorFront`, `colorBack`, `colorHighlight` | `type`, `size`, `colorSteps`, `originalColors`, `inverted` | - |

Options: `grain-gradient` `shape` wave, dots, truchet, corners, ripple,
blob, sphere. `dithering` `shape` simplex, warp, dots, wave, ripple, swirl,
sphere; `type` random, 2x2, 4x4, 8x8. `dot-grid` `shape` circle, diamond,
square, triangle. `warp` `shape` checks, stripes, edge. `halftone-dots`
`grid` square, hex; `type` classic, gooey, holes, soft. `fluted-glass`
`shape` lines, linesIrregular, wave, zigzag, pattern; `distortionShape`
prism, lens, contour, cascade, flat. `image-dithering` `type` random, 2x2,
4x4, 8x8. Sizing `fit` none, contain, cover.

## 7. Check readability

The audit's axe pass cannot see into a canvas, so measure text over the
surface yourself:

1. Over the CSS fallback: `scripts/screenshot-theme <id> --tweaks motion=off`
   and measure the text over the surface. axe in the audit reports text over
   a gradient or a canvas as "cannot tell", not as a failure, so it does not
   do this for you.
2. Over a bright frame: find the lightest frame in the playground, set it as
   `frame`, build with `--tweaks motion=still`, screenshot in light and dark,
   and measure the text color against the brightest pixel behind it. Body
   text needs 4.5:1; large text 3:1.

If a frame fails, lower the tint, lower `--ink-motion-opacity`, or move the
text off the surface.

## 8. Validator rules

| rule | means | fix |
|---|---|---|
| `motion-shader` | a param or color the shader does not take, a value outside Paper's range, an unknown option, or a color list that is too long | use the names and ranges in section 6 and `scripts/motion/shaders.json` |
| `motion-tweak` | a theme with motion lacks the `motion` tweak, its options are not exactly on "Moving", still "Still", off "Off" in that order, or a theme without motion declares it | copy the tweak from section 2 |
| `motion-include` | `slot` placement without `{% include ink/motion.html %}`, `backdrop` with one, an image shader without `slot` placement and `image=`, `image=` given anything but a cover photo variable (`page.cover_image`, `post.cover_image`), or a hand-written surface (`data-ink-motion` in a slot file) | place the surface as section 3 shows, only through the include |
| `motion-calm` (warning) | `speed` above 0.4, a param outside its calm range, or a `speed` on a shader that does not move | slow it down; see section 1 |
| `liquid-include-scope` | `{% include ink/motion.html %}` in a theme without a motion block | add the block or remove the include |
| `site-script` | a `<script>` other than JSON-LD, `preview.js` in previews, and one engine module (`/assets/ink/motion/core.js`, same origin, no inline code) on a theme with motion | do not add scripts |
| `site-motion` | the theme declares motion but no built page renders a surface, a surface's config differs from the manifest's `motion` block, or a page has more than 3 surfaces | include the surface once, in a slot that renders (not once per post in a list) |
| `site-external` | also covers `data-ink-motion-image`: a cover photo from a host that is not in the content | use the post's own cover photo |

## 9. Testing

```sh
python3 scripts/check-themes.py --theme <id>
scripts/build-theme <id> --tweaks motion=still
scripts/screenshot-theme <id> --out /tmp/<id>-shots              # WebGL via SwiftShader
scripts/screenshot-theme <id> --tweaks motion=off --out /tmp/<id>-shots
scripts/build-theme <id> --preview --serve 4000                   # ?t_motion=still, ?t_mode=dark
(cd ../notiongit && bun run themes:audit --theme <id>)
```

The audit runs axe with reduced motion (still frames), then, for a theme
with motion, opens every preview page with motion allowed and checks that
each surface starts and stays hidden from pointers, keyboards and screen
readers; with `?t_motion=off` it checks that no canvas appears and no shader
downloads. It also fails on any page exception or CSP violation.

Headless Chrome renders WebGL in software with
`--use-angle=swiftshader --enable-unsafe-swiftshader`; `screenshot-theme` and
the worker's `chrome-cdp.ts` pass these flags.

## 10. Maintaining the engine

Engine paths: `scripts/motion/` (the shader list `shaders.json` and the
runtime source `src/core.js`), `scripts/build-motion`, `assets/ink/motion/`
(built, committed), `assets/ink/motion.css`, `_includes/ink/motion.html`, and
the motion lines in `_includes/ink/head.html`, `_includes/ink/tweaks.html`
and `_layouts/default.html`. Themes never edit them.

```sh
scripts/build-motion            # rebuild assets/ink/motion/ (needs Node 18+ and npm network access)
scripts/build-motion --check    # fail if the committed bundle differs from a fresh build
```

The build `npm pack`s the pinned Paper version and checks its sha512,
checks every shader, option list and color limit in `shaders.json` against
the package, patches out ShaderMount's `<style>` injection, bundles with the
pinned esbuild, copies Paper's `LICENSE` and `NOTICE`, and fails if
`core.js` exceeds 15 KB gzip or a shader 6 KB. To add a shader, add its entry
to `shaders.json` (ranges from Paper's type docs in
`dist/shaders/<name>.d.ts`), rebuild, and add it to section 6. To upgrade
Paper, change `paper.version` and `paper.integrity`
(`npm view @paper-design/shaders@<v> dist.integrity`) and rebuild; the build
stops on any mismatch.

Credit: Paper Shaders, Copyright 2026 Paper, Apache License 2.0,
https://shaders.paper.design. The bundle's banner and `NOTICE` record the
one modification.
