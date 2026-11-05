# Theme API reference

This is the contract between a theme and the InkDrafts template. Start with
[`THEMES.md`](../../THEMES.md) and use [`authoring.md`](authoring.md) for the
step-by-step recipe.

## 1. Content model

Themes may rely only on what the Notion sync writes. Every field below may be
empty on a real site, and the first build of a new site has no content at
all, so every slot needs an empty state.

### `site.data.home` (`_data/home.yml`)

| field | type | notes |
|---|---|---|
| `name` | string | The owner's name. Empty before the first sync. |
| `tagline` | string | One line. May be `""`. |
| `profile_picture` | string (URL) | May be `""`. Can be an expiring Notion URL, so never assume it stays valid. |
| `social_links` | list of `{name, url}` | May be `[]`. `url` can be `https:`, `mailto:` or a relative path. |
| `bio` | string (Markdown) | May be `""`. May contain `##` headings, lists and links. Render with `markdownify`. |

### `site.data.nav` (`_data/nav.yml`)

A list of `{title, url}`. `url` is site-relative (`/`, `/blog/`, `/about/`), so
pass it through `relative_url`. May be empty or absent.

### Pages (`_pages/<slug>.md`)

Front matter: `layout` (`home`, `blog` or `page`), `title`, `slug`, and an
optional `description`. The body is Markdown. URLs are `/<slug>/`.

### Posts (`_posts/<date>-<slug>.md`)

| field | type | notes |
|---|---|---|
| `title` | string | Can be long (over 100 characters). |
| `date` | date | Newest first in `site.posts`. |
| `slug` | string | URL is `/:year/:month/:day/:slug/`. |
| `tags` | list of strings | May be absent. |
| `excerpt` | string | Absent when the Notion page has no description; Jekyll then uses the first paragraph. |
| `cover_image` | string (URL) | May be absent. Aspect ratio is unknown. |
| `canonical_url` | string (URL) | Set when the post first appeared elsewhere (a "clip"). |
| `featured` | `true` | Present only when true. |

The body is GitHub-flavoured Markdown: headings, lists, tables, code blocks
(Rouge, class `highlight`), footnotes (`.footnotes`), blockquotes and images.

## 2. Package layout and manifest

```
_data/themes/<id>.json          manifest (required)
assets/themes/<id>/theme.css    stylesheet (required; static, no front matter)
assets/themes/<id>/*.svg|png|webp|avif   optional images, 200 KB in total
_includes/themes/<id>/<slot>.html        one file per slot listed in the manifest
_includes/themes/<id>/_<name>.html       optional partials, included by your slots
scripts/themes/fixtures/<category>/      fixture overlay for your category (every category has one)
```

A fixture overlay holds sample content for one kind of site: `_data/home.yml`,
pages and posts, copied over the base fixtures. With an `overlay.yml` that
says `replace_base_posts: true`, the base posts are dropped first, so the
preview shows only that category's posts. Such an overlay must still provide
`_posts/2026-02-14-the-harbour-at-low-tide.md` and
`_posts/2025-11-03-keeping-a-commonplace-book.md` (any title, same slug),
because the audit and the screenshots open those pages. Give one or two posts
no `cover_image`: real sites often have posts without covers, and the theme
must show them well. Images come only from
`scripts/themes/fixtures/PROVENANCE.md`.

Theme ids match `^[a-z]{2,24}$` and equal the file name. Reserved ids:
`size first last empty blank nil default none themes ink preview previews
assets custom all new`.

The schema is [`scripts/themes/theme.schema.json`](../../scripts/themes/theme.schema.json).
Editors pick it up through the manifest's `$schema` field. Every object
rejects unknown fields.

| field | rule |
|---|---|
| `schema_version` | `1` |
| `id` | as above |
| `name` | 1 to 24 characters, `^[A-Za-z][A-Za-z0-9 .'-]*$`, unique (case-insensitive) |
| `version` | `MAJOR.MINOR.PATCH` |
| `summary` | 10 to 120 characters (gallery card) |
| `description` | 10 to 400 characters (detail page) |
| `categories` | 1 to 3 of the list in section 7; the first is primary |
| `author` | `{ "name": 1-60 chars, "url"?: https URL }` |
| `license` | `"MIT"` |
| `slots` | unique subset of the slots in section 3; may be `[]` |
| `fonts` | 1 to 3 pairings (section 9) |
| `palette` | `light` and `dark`, each `{bg, text, muted}` as lowercase `#rrggbb` |
| `tweaks` | 3 to 10 tweaks (section 4); `mode`, `accent` and `webfonts` are required |

No manifest string may contain `<` or `>`.

## 3. Slots and hook classes

The shared layouts call your slot file when, and only when, the slot is
listed in `slots`. Anything you do not override renders the base markup
(the classic look's HTML), which your `theme.css` must then style.

| slot | replaces | outermost element must have class |
|---|---|---|
| `header` | `_includes/header.html` | `ink-header` (and render `<nav aria-label="...">` from `site.data.nav`) |
| `footer` | `_includes/footer.html` | `ink-footer` |
| `home` | body of `_layouts/home.html` | `ink-home` |
| `blog` | body of `_layouts/blog.html` (the whole list) | `ink-post-list` |
| `post-item` | one entry in the base blog list (`_includes/post-card.html`) | `ink-post-item` |
| `post` | body of `_layouts/post.html` | `ink-post` |
| `page` | body of `_layouts/page.html` | `ink-page` |
| `tags` | body of `tags.html` | `ink-tags` |

The base markup carries the same hook classes, plus `ink-body` and
`ink-body--<layout>` on `<body>` (the home page keeps `home-body` too). These
classes are the stable surface for owners' `custom.css`.

Variables in scope in every slot: `site`, `page`, `content` (post and page
slots), `ink_id`, `ink_theme` (your manifest), `ink_slots`. In `post-item`,
the post is `include.post`. There is no `paginator`. Slot files may include
only `themes/<your id>/...`, `empty-state.html` and `post-card.html`.

A theme that also overrides `post-item` should call it from its own `blog` or
`home` slot like this:

```liquid
{% if ink_slots contains "post-item" %}{% include themes/quire/post-item.html post=post %}{% else %}{% include post-card.html post=post %}{% endif %}
```

## 4. Tweaks

Tweaks are the owner's settings for a theme. They reach the page only as
attributes on `<html>` and declarations in one `<style id="ink-tweaks">`
block. `<key>` in names below is the tweak key with `_` replaced by `-`.

| type | manifest fields | config value | on `<html>` | in `#ink-tweaks` `:root{}` |
|---|---|---|---|---|
| `select` | `options[{value,label}]` (2-6), `default` | an option value | `data-ink-<key>="<value>"` | nothing |
| `boolean` | `default` | `true` / `false` | `data-ink-<key>="on"` or `"off"` | nothing |
| `color` | `presets[{value,label,light,dark,on?}]` (1-6), `default`, `custom`, `role` | preset value, or `#rrggbb` if `custom` | `data-ink-<key>="<preset>"` or `"custom"` | `--tw-<key>:<light>;--tw-<key>-dark:<dark>;` plus `--tw-<key>-on:<on>;` when set; custom: only `--tw-<key>:<hex>;` |
| `range` | `min`, `max`, `step`, `unit` (`px rem em ch %` or `""`), `default` | a number on the `step` grid from `min` | nothing | `--tw-<key>:<n><unit>;` |
| `font` | `default` (a pairing value); key must be `font`; only with 2+ pairings | a pairing value | `data-ink-font="<value>"` | (see below) |

Always emitted: `data-ink-theme="<id>"` on `<html>`,
`<meta name="color-scheme">` (`light dark`, `light` or `dark` from `mode`),
and `--tw-font-body`, `--tw-font-display`, `--tw-font-mono` from the active
pairing.

Tweak keys match `^[a-z][a-z0-9_]{0,23}$`. These keys are reserved:
`name email title description url baseurl theme theme_id author lang tweaks
font_body font_display font_mono`. A key may not be another color tweak's
key plus `_dark` or `_on`, because those names are the color's own
`--tw-<key>-dark` and `--tw-<key>-on` variables.

Option, preset and pairing values may not be `y n yes no true false null` or
digits with a leading zero: unquoted in `_config.yml`, YAML would read them as
something else. The template reads an unquoted `on`/`off` or plain integer
back as the matching option, but owners should still quote values they type.

In `theme.css`, an attribute selector must name a declared tweak with `_`
written as `-` (`drop_cap` is `[data-ink-drop-cap]`), and a value the engine
emits: an option, a preset or `custom`, a pairing, or `on`/`off` for a
boolean (never `true`/`false`). A range has no attribute; use its `--tw-*`
variable. The validator rejects anything else (`css-tweak-attr`).

### Universal tweaks

| key | type | rules |
|---|---|---|
| `mode` | `select` | options exactly `auto`, `light`, `dark`; you choose the default and labels |
| `accent` | `color` | 1 to 6 presets; a theme with no accent declares one preset whose hexes equal `palette.*.text`, with `custom: false` |
| `webfonts` | `boolean` | must default to `true` if any pairing loads Google Fonts |

### Color roles

- `text`: the accent is used for text; each preset needs 4.5:1 against
  `palette.<mode>.bg`.
- `large`: used only at 24px and up (or 18.66px bold); needs 3:1.
- `surface`: the accent is a background; each preset needs an `on` text color
  with 4.5:1 against it, and `custom` must be `false`.

The role must match how `theme.css` uses the accent. With `large` or
`surface` you must not use `--ink-accent` as the color of body-size text,
including the skeleton's `a { color: var(--ink-accent) }` rule and link hover
states: underline in the accent instead. The validator warns
(`accent-role`) when a link rule colors text with the accent under those
roles.

A custom accent is checked by inkdrafts.com on the grounds the chosen color
scheme shows: the light background as written, and the dark background as the
theme lifts it (`oklch(from <hex> max(l, 0.74) c h)`, see the token block
below). Every theme that sets `custom: true` must include that lift.

### Required token block

Every `theme.css` declares the palette as literal values and handles all three
modes. The validator checks the literals and the selectors.

```css
:root {
  color-scheme: light;
  --ink-bg: #f1ecde;      /* == palette.light.bg */
  --ink-text: #1a1a18;    /* == palette.light.text */
  --ink-muted: #6b6553;   /* == palette.light.muted */
  --ink-accent: var(--tw-accent);
  --ink-font-body: var(--tw-font-body);
  --ink-font-display: var(--tw-font-display);
  --ink-font-mono: var(--tw-font-mono);
}
:root[data-ink-mode="dark"] {
  color-scheme: dark;
  --ink-bg: #1a1916; --ink-text: #eae3d2; --ink-muted: #a39b86;
  --ink-accent: var(--tw-accent-dark, var(--tw-accent));
}
@media (prefers-color-scheme: dark) {
  :root[data-ink-mode="auto"] { /* the same dark block */ }
}
/* A custom accent has no dark hex. A var() declaration never fails at parse
   time, so guard relative color with @supports, not a fallback line. */
@supports (color: oklch(from red l c h)) {
  :root[data-ink-mode="dark"][data-ink-accent="custom"] {
    --ink-accent: oklch(from var(--tw-accent) max(l, 0.74) c h);
  }
  @media (prefers-color-scheme: dark) {
    :root[data-ink-mode="auto"][data-ink-accent="custom"] {
      --ink-accent: oklch(from var(--tw-accent) max(l, 0.74) c h);
    }
  }
}
body { background: var(--ink-bg); color: var(--ink-text); font-family: var(--ink-font-body); }
```

Do not put `!important` on `--ink-*` tokens; owners override them in
`custom.css`.

### Styling a tweak

```css
html[data-ink-drop-cap="off"] .quire-body > p:first-of-type::first-letter { float: none; }
html[data-ink-numbering="roman"] .quire-toc { list-style: upper-roman; }
.main { width: min(100% - 2.5rem, var(--tw-measure, 34em)); }
```

### Markup variants

If a tweak needs different markup, render every variant, each wrapped in
`<div class="ink-variant" data-variant="<key>:<value>">`, and hide the
inactive ones with `display:none` (never `visibility` or opacity):

```css
html:not([data-ink-grouping="tag"]) [data-variant="grouping:tag"] { display: none; }
```

At most 2 such tweaks per theme, and variants must not repeat `id`
attributes. Prefer rearranging one markup tree with CSS.

## 5. Site configuration

The owner's choice lives in a column-zero block in `_config.yml`:

```yaml
inkdrafts:
  theme_id: "quire"
  tweaks:
    accent: "teal"
    drop_cap: false
    measure: 36
```

- Only non-default values are stored, and only keys the theme declares.
- No block, an unknown `theme_id`, or a missing manifest all fall back to
  `classic`. An invalid or undeclared tweak value falls back to the
  manifest default; it never reaches the page as written.
- Never use the key `theme:`.

### Owner `custom.css`

If a site has `assets/css/custom.css`, it is linked after the theme
stylesheet and survives theme switches. The template does not ship one. To
add one, create the file on GitHub, for example:

```css
:root { --ink-accent: #0b6e4f; }
.ink-home { text-align: left; }
```

## 6. Liquid recipes (verified in safe mode)

| need | Liquid |
|---|---|
| featured posts | `{% assign featured = site.posts \| where: "featured", true %}` |
| featured posts with a cover | `{% assign books = featured \| where_exp: "p", "p.cover_image" %}` |
| year groups | `{% assign years = site.posts \| group_by_exp: "p", "p.date \| date: '%Y'" %}`, then `y.name` and `y.items` |
| bio as HTML | `{{ site.data.home.bio \| markdownify }}` |
| bio split at its `##` headings | `{% assign parts = bio_html \| split: "<h2" %}`; `parts[0]` is the lead, prepend `<h2` to the rest |
| outlet host of a clip | `{{ post.canonical_url \| split: "/" \| slice: 2, 1 \| first \| remove: "www." }}` |
| reading time | `{{ content \| number_of_words \| divided_by: 230 \| plus: 1 }} min` |
| tags with counts | `{% assign tags = site.tags \| sort %}`, then `t[0]` and `t[1].size` |
| countdown number | `{{ forloop.rindex }}` inside `{% for post in site.posts %}` |
| day-of-year color cycle | `{{ post.date \| date: "%j" \| modulo: 5 }}` (0 to 4) |
| owner custom.css present | `site.static_files \| where: "path", "/assets/css/custom.css" \| first` |

`forloop.rindex` counts within the loop, so with `limit:` it restarts; use
`site.posts.size | minus: forloop.index0` for the global number. To show the
front-matter excerpt without repeating the first paragraph, compare
`page.excerpt | strip_html | strip` with
`content | split: "</p>" | first | strip_html | strip`.

## 7. Categories and the accessibility floor

The first category in `categories` is the gallery filter and selects the
fixture overlay.

<!-- categories:start -->
| id | label |
|---|---|
| `developers` | Developers |
| `designers` | Designers |
| `writers` | Writers |
| `researchers` | Researchers |
| `educators` | Educators |
| `artists` | Artists |
| `photographers` | Photographers |
| `musicians` | Musicians |
| `entrepreneurs` | Entrepreneurs |
| `marketing` | Marketing |
| `professionals` | Professionals |
<!-- categories:end -->

Every theme meets, in every mode and tweak value:

- WCAG AA contrast (the validator checks the palette and accent presets; the
  audit checks the rendered pages);
- a visible focus indicator on every link and control;
- no horizontal scrolling at 320px wide or at 200% zoom;
- no motion under `prefers-reduced-motion: reduce`;
- hidden variants removed with `display:none`.

## 8. Shared rules and spacing decisions

`assets/ink/shared.css` loads after every theme's stylesheet. It holds only
the rules every theme follows, so a theme does not need to repeat them:

- **Phone menu (below 600px).** The `nav[aria-label="Main navigation"]` menu
  is one row that scrolls sideways, with each link at least 44px tall. A
  visible row is easier to find than a Menu button for people who are not
  technical, and it never leaves one orphaned item on a second row. The
  last link is cut off at the edge, which shows that the row scrolls. The
  audit fails a theme whose menu wraps with one link on its last row, or
  whose menu links are shorter than 44px.
- **Footnote links** are underlined, so they never rely on color alone.

Spacing decisions made in the November 2026 review, for theme authors to
follow:

- **Space between sections:** 56px on phones to about 104px on wide
  screens. More than about 140px reads as a missing section.
- **First screen:** never stretch the first section to the full screen
  height with content pinned to its bottom; an empty band of 200px or more
  between the tagline and the next item looks broken. Halo puts its cover
  48 to 64px under the tagline; Megaphone centers its headline in at most
  80% of the screen and drops the minimum height below 768px; Confetti's
  first screen is at most 640px tall.
- **Menus** sit in a top bar. Halo's menu used to sit along the bottom of
  its poster, where it was hard to find and its links were 14px tall.
- **A work and its caption are one unit.** Vitrine places the caption
  against the plate's edge, whatever the artwork's shape, sizes plates by
  height (at most 70% of the screen), and leaves 64 to 96px between works.
- **Long lists on the home page** stop at about eight items and link to the
  full list (Anamorph's reel).
- **Text size:** body text at least 16px; captions and small labels at
  least 15px on wide screens.
- **Posts without a cover** get a designed tile: the title on a field
  tinted with the accent color (Crate, Specimen) or a date set like a flyer
  (Halo), never an empty box.

## 9. Fonts

- Google Fonts families only, loaded through the manifest's `google` field
  (`family=EB+Garamond:ital,wght@0,400;1,400`, at most 3 families per
  pairing), or `null` for system stacks.
- At most 3 pairings. Two or more pairings need a `font` tweak.
- Every stack ends in system fallbacks, because owners can switch web fonts
  off. Stacks use only letters, digits, spaces, commas, hyphens and double
  quotes.
