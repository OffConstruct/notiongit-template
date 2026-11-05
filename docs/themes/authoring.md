# Authoring a theme

This is the end-to-end recipe for adding one theme. It assumes you have read
[`THEMES.md`](../../THEMES.md). The API reference is [`README.md`](README.md).
Every command runs from the template repository root and is safe to run while
other agents build other themes.

Requirements: `bash`, `python3` (3.10 or later), `git`, Docker, and Google
Chrome or Chromium for screenshots. There is no need for a local Ruby or
Jekyll: builds run in a Docker image built from `scripts/themes/Dockerfile`.

## 0. Prepare (once per machine)

```sh
scripts/build-theme --prepare
```

This builds the Jekyll image (about a minute the first time) and prints its
tag. Later runs, and concurrent first runs, reuse it. Every other command
prepares the image on demand, so this step is optional.

## 1. Read the brief

Your task names the design brief: the theme's board entry (palette with
checked contrasts, type, layout, tweaks, references). Map the board's tweak
names to keys: color mode becomes `mode`, the main accent becomes `accent`,
and per-theme prefixes are dropped. Tweaks that need client JavaScript are
dropped (see `README.md` section 4). Use the Hallmark skill for the visual
pass if it is available.

## 2. Scaffold

```sh
scripts/new-theme quire --name "Quire" --category writers --slots home,blog,post
```

Passing looks like:

```
created _data/themes/quire.json
created assets/themes/quire
created _includes/themes/quire
```

`new-theme` refuses an existing, reserved or malformed id and an unknown
slot or category. The scaffold already passes the validator and builds. Pick
only the slots you need; everything else renders the base markup, which your
CSS styles.

## 3. Edit your three paths

1. `_data/themes/quire.json`: summary, description, fonts, palette, tweaks.
   Keep `mode`, `accent` and `webfonts`.
2. `assets/themes/quire/theme.css`: in the `:root` block, set `--ink-bg`,
   `--ink-text` and `--ink-muted` to `palette.light`'s hexes. In both dark
   blocks (`:root[data-ink-mode="dark"]` and the
   `@media (prefers-color-scheme: dark)` `:root[data-ink-mode="auto"]`
   block), set them to `palette.dark`'s hexes. The validator checks all
   three blocks. Style the base markup for any slot you did not override
   (header, footer, pages, tags, empty states).

   **Tweak selectors:** booleans are `"on"`/`"off"`, never `true`/`false`,
   and `_` in a key becomes `-` in its attribute (`drop_cap` is
   `[data-ink-drop-cap="on"]`). A range tweak has no attribute; use its
   `--tw-<key>` variable. A wrong selector does nothing at all, so the
   validator rejects it (`css-tweak-attr`).
3. `_includes/themes/quire/<slot>.html`: one file per listed slot, outermost
   element carrying the slot's hook class. Shared markup goes in
   `_<name>.html` partials, included as `{% include themes/quire/_contents.html %}`.

Render `home.bio` and `home.social_links`, handle posts with and without
`cover_image` and `excerpt`, and give every slot an empty state (the first
build of a real site has no content).

## 4. Validate

```sh
python3 scripts/check-themes.py --theme quire
```

Passing: no output and exit status 0. `warning:` lines on stderr are advisory
(for example body text below 7:1 contrast) and do not fail. Each failure is
one line, `<path>:[<rule>] <message>`; see the rule list below.

## 5. Build with fixtures

```sh
scripts/build-theme quire
scripts/build-theme quire --tweaks mode=dark,accent=teal,drop_cap=false,measure=38
```

Each build copies the repository to a private temp directory, adds the
Rowan Vale fixture site (`scripts/themes/fixtures/base/` plus your category
overlay), builds with Jekyll in Docker, and runs the built-site checks
(`site-*` rules). The last stdout line is the built site directory,
`/tmp/inkdrafts-build-<id>.XXXXXX/site`; it stays until you delete it
(`rm -rf /tmp/inkdrafts-build-<id>.*`). A failed build removes its temp
directory itself. Test every tweak at a non-default value at least once.

`--tweaks` values are typed by your manifest: `true`/`false` (or `on`/`off`)
for booleans, numbers for ranges, strings otherwise. A value the manifest
does not allow (an unknown option, an off-step or out-of-range number, an
undeclared key) still goes through, to prove the theme ignores it, but
prints a warning such as
`build-theme: warning: tweak 'density': 'huge' is not an option (cozy, compact); using the default 'cozy'`.
When you see one, the build and any screenshot of it show the default.

When Jekyll fails, the real error is at the **top** of its output, above the
`from ...` Ruby backtrace lines. A missing include is reported by the
validator first (`liquid-include-missing`). An unknown Liquid filter such as
`{{ x | nosuchfilter }}` is silently ignored by Jekyll 3 and passes every
check, so look at the output of every filter you add (the recipes in
`README.md` section 6 are verified in safe mode).

| `build-theme` flag | does |
|---|---|
| `--tweaks k=v[,k=v]` | sets `inkdrafts.tweaks` for this build |
| `--preview` | adds `preview.js`, so `?t_<key>=<value>` works in the browser |
| `--serve PORT` | serves the build on 127.0.0.1 until Ctrl-C, then deletes it |
| `--out DIR` | copies the site to `DIR` and deletes the temp directory |
| `--baseurl /x` | builds under a sub-path, as a project site |
| `--fixtures-base URL` | where fixture images are served from (default: `<baseurl>/assets/fixtures`) |
| `--keep` | keeps the copied source tree too, for debugging |
| `--native` | uses local Ruby and Bundler instead of Docker |
| `--all` | builds every theme; without `--out` it only checks and deletes each build |
| `--prepare` | builds the Docker image and exits |

## 6. Look at it

```sh
scripts/screenshot-theme quire --out /tmp/quire-shots
scripts/screenshot-theme quire --pages home,blog,post,featured,page,tags --widths 1280,768,320 --modes light,dark --out /tmp/quire-shots
scripts/screenshot-theme quire --tweaks mode=dark --modes light --out /tmp/quire-shots
```

Defaults: pages `home,post`, widths `1280,320` (320 is the reflow width
every theme must survive), modes `light,dark`, height 2000px (`--height`).
Files are named `<id>[-<tweaks>]-<page>-<width>-<mode>.png`; a `--tweaks`
run carries its tweaks in the name (`quire-mode-dark-home-1280-light.png`),
so it never overwrites the default shots. `--modes` sets the OS color
preference; force a mode with `--tweaks mode=...`. Pages: `home`, `blog`,
`post` (long-form: code, table, footnotes, image), `featured` (a featured
post with a cover), `page` (About), `tags`. `--site DIR` screenshots an
existing build instead of building. Compare the tweak shots with the
default ones: a tweak that changes nothing is a broken selector.

For a live look with tweak switching through the query string:

```sh
scripts/build-theme quire --preview --serve 4000
# http://127.0.0.1:4000/?t_mode=dark&t_accent=teal&t_drop_cap=false
```

## 7. Audit (required)

```sh
(cd ../notiongit && bun run themes:audit --theme quire)
```

This runs axe in real Chrome on every preview page in light, dark, and
follow-the-system with the OS set to dark, and on the home page for every
non-default tweak value, plus 320px and 200% zoom reflow, the phone menu at
390px (one row, 44px links) and a keyboard walk.
Zero findings is passing. It deletes its temp directory when it finishes;
pass `--keep` to keep `report.json` (the path is printed; delete it
afterwards).

## 8. Finish

Every one of these must pass:

```sh
python3 scripts/check-themes.py      # all themes: catches id and name clashes too
scripts/build-theme quire            # then rm -rf /tmp/inkdrafts-build-quire.*
(cd ../notiongit && bun run themes:audit --theme quire)
git status --short
```

`scripts/build-theme --all` is not required for a change to one theme; it is
for changes to shared files (see `CONTRIBUTING.md`). Only your paths may
appear in `git status`:

```
?? _data/themes/quire.json
?? _includes/themes/quire/
?? assets/themes/quire/
```

plus `scripts/themes/fixtures/<category>/` if your task owns that overlay.

## Validator rules

| rule | means | fix |
|---|---|---|
| `manifest-parse` | not valid UTF-8 JSON, or a non-`.json` file in `_data/themes/` | fix the syntax; keep only `<id>.json` files there |
| `manifest-schema` | a field is missing, unknown, the wrong type, or out of range; or a string contains `<` / `>` | read the message's `$.path`; see `README.md` section 2 |
| `id-filename` | `id` differs from the file name, or the name is not `^[a-z]{2,24}$` | rename the file or fix `id` |
| `id-reserved` | the id is reserved | pick another id |
| `id-duplicate` | two manifests share an `id` | one id per theme |
| `name-duplicate` | another theme has the same `name` (any case) | rename |
| `files-stylesheet` | `assets/themes/<id>/theme.css` missing, or it has front matter | add it; remove the `---` lines |
| `files-slot-missing` | a slot is listed but has no file | add `_includes/themes/<id>/<slot>.html` or unlist it |
| `files-slot-unlisted` | a slot file exists but is not listed | add it to `slots` or delete it |
| `slot-unknown` | a file in your includes dir is neither a slot nor a `_partial.html` | rename or remove it |
| `files-assets` | a disallowed file type, assets over 200 KB, or a theme directory with no manifest | use `.css .svg .png .webp .avif`; compress; remove orphans |
| `slot-hook` | the outermost element lacks the slot's hook class, or the header has no `<nav aria-label>` | add the class from `README.md` section 3 |
| `tweak-universal` | `mode`, `accent` or `webfonts` missing or mistyped, or `mode` options are not exactly auto/light/dark | declare them as in the skeleton |
| `tweak-key` | a key is malformed, reserved, declared twice, or collides with an engine variable (`font_body`, `<color key>_dark`, `<color key>_on`) | rename |
| `tweak-default` | a default is not an option, preset or pairing, or is outside `[min, max]` or off `step` | fix the default |
| `tweak-options` | duplicate option or preset values; `min >= max`; a `surface` color without `on`, or with `custom: true`; a value YAML would retype when unquoted (`yes`, `no`, `true`, `null`, `007`) | fix the list; rename the value (`none` for `no`) |
| `tweak-font` | a font tweak without 2 pairings (or the reverse), duplicate pairing values, or `webfonts` defaulting to false while a pairing uses Google Fonts | add or remove the tweak; default `webfonts` to true |
| `palette-contrast` | text or muted below 4.5:1 on `bg` (warning below 7:1 for text) | darken or lighten the color |
| `accent-contrast` | a preset misses its role in light or dark | adjust that preset's `light` / `dark` / `on` hex |
| `css-tokens` | `--ink-bg/--ink-text/--ink-muted` not declared with the literal `palette.light` hex, or not set to the literal `palette.dark` hex in the forced-dark block and in the follow-the-system dark block, or `!important` on an `--ink-*` token | copy the exact hexes into all three blocks; drop `!important` |
| `css-tweak-attr` | a `[data-ink-<x>]` selector names no declared tweak (after `_` to `-`), or a value the engine never emits (booleans are `on`/`off`) | fix the selector; ranges use `--tw-<key>` |
| `css-custom-lift` | a color tweak allows custom hexes but `theme.css` does not lift them in dark mode | copy the skeleton's `@supports (color: oklch(from red l c h))` block |
| `accent-role` (warning) | an accent with role `large` or `surface` colors link text | underline in the accent instead, or use role `text` |
| `css-modes` | no `[data-ink-mode="dark"]` block, or no `prefers-color-scheme: dark` block keyed on `[data-ink-mode="auto"]` | add both dark blocks |
| `css-external` | `@import`, `url(http...)`, `url(//...)` or `expression(` | fonts go in the manifest; images in `assets/themes/<id>/` |
| `liquid-script` | `<script` in a slot or partial | remove it; themes have no JavaScript |
| `liquid-inline-style` | `<style`, `<link` or `style=` in a slot or partial | move the styling to `theme.css` |
| `liquid-include-scope` | an include outside `themes/<id>/`, `empty-state.html` and `post-card.html` | copy the markup into your own partial |
| `liquid-include-missing` | an include of `themes/<id>/_x.html` that does not exist | add the partial or fix the name |
| `liquid-variants` | more than 2 markup-variant tweak keys in `data-variant` | rearrange with CSS instead |
| `config-default-theme` | `_config.yml` has no `inkdrafts.theme_id`, or it names no manifest | leave `_config.yml` alone; it must say `classic` |
| `schema-categories` | the category list in `README.md` differs from the schema enum | edit both together (foundation owners only) |
| `site-pages` | a fixture page was not built | a slot or layout broke the build; read the Jekyll output |
| `site-theme-attr` | `<html>` lacks `data-ink-theme="<id>"` | do not edit `_layouts/default.html` |
| `site-stylesheet` | the theme stylesheet is missing or not linked | keep `assets/themes/<id>/theme.css` |
| `site-liquid` | the page contains `Liquid error` | fix the Liquid in your slot |
| `site-script` | a `<script>` other than JSON-LD (and, in previews, `preview.js`) | remove it |
| `plain-language` | a summary, tweak label or option label uses jargon (kicker, measure, markdown, mono, sans, sticky) or British spelling (centred, colour, grey, programme, catalogue) | use the plain word the message names; summaries say who the theme suits and what the home page shows |
| `fixture-overlay` | a category used by a theme has no `scripts/themes/fixtures/<category>/`, or an overlay with `replace_base_posts: true` lacks a post a preview page needs | add the overlay; keep the two post files the message names |
| `fixture-provenance` | a fixture image is not listed in `scripts/themes/fixtures/PROVENANCE.md` | add a row with the source link and license (public domain or CC0 only) |
| `site-external` | a `src`/`href` points at a host other than Google Fonts or the fixture content | serve images from `assets/themes/<id>/` |

## The skeleton

`scripts/themes/skeleton/` is the minimal complete theme that `new-theme`
copies: a manifest with the universal tweaks and a `measure` range, a
stylesheet that styles every piece of base markup, and one example file per
slot. `quire` is a full worked example built from it (EB Garamond, a contents
list partial, a chapter-style post page, four theme-specific tweaks).

## Validator flags

| `check-themes.py` flag | does |
|---|---|
| `--theme ID` | checks one theme's package (cross-theme duplicates still count) |
| `--json` | prints failures and warnings as JSON |
| `--root DIR` | checks another template tree |
| `--site DIR --theme ID` | checks a built site instead (what `build-theme` runs) |
| `--source DIR` | with `--site`: the source tree, whose fixture link hosts are allowed |
| `--preview` | with `--site`: allows `preview.js` |

## Do not

- Edit shared layouts, `_includes/*.html`, `_includes/ink/`, `_config.yml`,
  `scripts/`, the docs, or other themes.
- Add a registry or list of themes anywhere. The manifest file is the
  registration.
- Run `bun run themes:sync` in the worker. That is a separate unit.
- Commit build output, screenshots or temp directories.
