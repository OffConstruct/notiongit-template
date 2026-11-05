# Notes for coding agents

This repository is a Jekyll site template for GitHub Pages (safe mode). Its
look comes from themes. Most agent work here is adding or changing a theme.

## Start here

1. Read [`THEMES.md`](THEMES.md) fully. It lists the paths a theme owns, the
   commands, and the hard rules.
2. Follow the step-by-step recipe in
   [`docs/themes/authoring.md`](docs/themes/authoring.md).
3. Look things up in the API reference,
   [`docs/themes/README.md`](docs/themes/README.md): the content model, slots,
   tweaks and the shared rules (section 8).

## Add or change a theme

```sh
scripts/new-theme <id> --name "<Name>" --category <category> --slots home,blog,post
python3 scripts/check-themes.py --theme <id>   # no output and exit 0 means pass
scripts/build-theme <id>                       # light build
scripts/build-theme <id> --tweaks mode=dark    # dark build
scripts/screenshot-theme <id> --out /tmp/<id>-shots
python3 scripts/check-themes.py                # every theme, before you finish
```

`scripts/check-themes.py` is the validator. Its rules, and how to fix each
one, are listed in `docs/themes/authoring.md` under "Validator rules".

## Rules that are easy to miss

- Keep `_config.yml` neutral: title "My website", empty `url`, empty author,
  and `theme_id: "classic"` with `tweaks: {}`.
  `scripts/check-neutral-config.sh` enforces this. Never put a real person's
  name, email address or site in the template.
- Do not write into `_pages/`, `_posts/` or `_data/` (except
  `_data/themes/<id>.json`). The Notion sync owns them.
- No JavaScript in themes, and no remote files other than Google Fonts.
- Sample content lives in `scripts/themes/fixtures/` and uses the fictional
  Rowan Vale. Every fixture image is listed with its license in
  `scripts/themes/fixtures/PROVENANCE.md`.
- Theme names, summaries and option labels are read by people who are not
  technical. Use plain words: the validator rejects terms such as "kicker",
  "mono" or "markdown" in those strings.
- Run `scripts/check-hygiene.sh` before you finish. It rejects other
  assistant files, such as `CLAUDE.md` or `.cursorrules`.
