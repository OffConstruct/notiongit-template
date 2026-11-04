# Themes: start here

This file is the entry point for anyone, human or coding agent, who adds or
changes an InkDrafts theme. Read it fully, then follow
[`docs/themes/authoring.md`](docs/themes/authoring.md). The API reference is
[`docs/themes/README.md`](docs/themes/README.md).

## What a theme is

A theme is three paths that only that theme owns. There is no registry file.

```
_data/themes/<id>.json          manifest (required)
assets/themes/<id>/theme.css    stylesheet (required) and optional images
_includes/themes/<id>/*.html    optional slot overrides and _partials
```

A theme may also own one fixture overlay, `scripts/themes/fixtures/<category>/`,
when it is the only theme in that category that needs extra sample content.

## What you may touch

- Your three theme paths, and your category's fixture overlay.
- Nothing else. Do not edit `_layouts/`, `_includes/*.html`, `_includes/ink/`,
  `_config.yml`, `scripts/`, other themes, or the docs, unless your task says
  so. If the shared engine cannot do what you need, report it instead.

## The commands

```sh
scripts/new-theme quire --name "Quire" --category writers --slots home,blog,post
python3 scripts/check-themes.py --theme quire     # while you work: no output, exit 0
scripts/build-theme quire                         # last line = built site dir
scripts/build-theme quire --tweaks mode=dark,accent=teal,drop_cap=false
scripts/screenshot-theme quire --out /tmp/quire-shots
scripts/screenshot-theme quire --tweaks mode=dark --out /tmp/quire-shots
scripts/build-theme quire --preview --serve 4000  # http://127.0.0.1:4000/?t_mode=dark
(cd ../notiongit && bun run themes:audit --theme quire)   # axe, reflow, focus, CSP
python3 scripts/check-themes.py                   # before you finish: every theme
git status --short                                # only your paths
```

All of them are safe to run in parallel with other agents. None of them write
into the repository except `new-theme`, which creates your three paths.
`build-theme` keeps a successful build in `/tmp/inkdrafts-build-<id>.*` until
you delete it (`rm -rf /tmp/inkdrafts-build-<id>.*`); failed builds and
stopped `--serve` runs clean up after themselves. The audit deletes its temp
directory unless you pass `--keep`.

A `--tweaks` value that the manifest does not allow prints
`build-theme: warning: ...` and the build shows the default instead, so a
screenshot taken with it does not show what you asked for.

Done means the step 8 checklist in `docs/themes/authoring.md` passes.

## Hard rules

- No JavaScript in themes. Every tweak works through CSS: `data-ink-*`
  attributes on `<html>` and `--tw-*` custom properties.
- GitHub Pages safe mode: no plugins beyond `jekyll-feed`, `jekyll-seo-tag`
  and `jekyll-sitemap`, no custom Ruby.
- Never add a `theme:` key anywhere in `_config.yml`. Jekyll reserves it for
  gem themes. The site's choice lives in the `inkdrafts:` block.
- Never write into `_pages/`, `_posts/` or `_data/`, except your own
  `_data/themes/<id>.json`. Those directories belong to the Notion sync.
- Fixtures use the fictional Rowan Vale. No real people, no hotlinked
  third-party images, no Notion URLs.
- Slot files: no `<script>`, `<link>`, `<style>` or `style=`. Styling belongs
  in `theme.css`. Fonts come only from the manifest (Google Fonts).
- `theme.css` is static: no front matter, no `@import`, no remote `url()`.
- Every theme renders correctly in light, dark and follow-the-system modes,
  meets WCAG AA contrast, reflows at 320px, and honours reduced motion.
- `classic` is the default and the fallback. Its look must not change. One
  deliberate difference from the pre-theme template: every page, classic
  included, now declares `<meta name="color-scheme">`, so in dark mode the
  browser's scrollbars and form controls match the already-dark page.
- In `theme.css`, booleans are `"on"`/`"off"` (never `true`/`false`) and a
  tweak key's `_` is `-` in its attribute: `drop_cap` is
  `[data-ink-drop-cap="on"]`. The validator rejects anything else.
- Site owners who edit `_config.yml` by hand should quote text values
  (`mode: "dark"`). The template also reads an unquoted `on`, `off` or
  integer back as the matching option.

## Where things are

- Design briefs: your task names the brief (one board entry per theme).
- Content model, slots, tweak contract, Liquid recipes: `docs/themes/README.md`.
- Step-by-step recipe, validator rule list and fixes: `docs/themes/authoring.md`.
- A minimal complete theme: `scripts/themes/skeleton/`. A full worked example:
  the `quire` theme.
