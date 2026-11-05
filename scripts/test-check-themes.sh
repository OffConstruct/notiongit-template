#!/usr/bin/env bash
#
# Fixture tests for scripts/check-themes.py. Each case scaffolds a minimal
# template tree in a temp directory (one theme "good" from the skeleton via
# scripts/new-theme), breaks one thing, and asserts that the validator exits 1
# and reports the expected rule id. The unbroken tree must pass. Nothing in the
# repository is written.
#
# Usage: ./scripts/test-check-themes.sh

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
work="$(mktemp -d "${TMPDIR:-/tmp}/inkdrafts-check-themes.XXXXXX")"
trap 'rm -rf "$work"' EXIT

python3 - "$repo_root" "$work" <<'PY'
import json, pathlib, shutil, subprocess, sys

repo, work = map(pathlib.Path, sys.argv[1:])
checker = repo / "scripts" / "check-themes.py"
categories = json.loads((repo / "scripts/themes/theme.schema.json").read_text())["$defs"]["category"]["enum"]

def scaffold(dir):
    (dir / "_data" / "themes").mkdir(parents=True)
    subprocess.run([str(repo / "scripts/new-theme"), "good", "--name", "Good", "--category", "writers",
                    "--slots", "home,post", "--root", str(dir)], check=True, stdout=subprocess.DEVNULL)
    (dir / "_config.yml").write_text('title: "x"\ninkdrafts:\n  theme_id: "good"\n  tweaks: {}\n')
    (dir / "docs/themes").mkdir(parents=True)
    rows = "\n".join(f"| `{c}` | x |" for c in categories)
    (dir / "docs/themes/README.md").write_text(f"<!-- categories:start -->\n| id | label |\n|---|---|\n{rows}\n<!-- categories:end -->\n")
    (dir / "scripts/themes/fixtures/writers").mkdir(parents=True)

def manifest(dir):
    return json.loads((dir / "_data/themes/good.json").read_text())

def write_manifest(dir, data, name="good"):
    (dir / f"_data/themes/{name}.json").write_text(json.dumps(data, indent=2))

def edit(fn):
    def apply(dir):
        data = manifest(dir)
        fn(data)
        write_manifest(dir, data)
    return apply

def tweak(data, key):
    return next(t for t in data["tweaks"] if t["key"] == key)

def css_sub(old, new):
    def apply(dir):
        p = dir / "assets/themes/good/theme.css"
        text = p.read_text()
        assert old in text, old
        p.write_text(text.replace(old, new))
    return apply

def slot_write(name, text):
    def apply(dir):
        (dir / f"_includes/themes/good/{name}.html").write_text(text)
    return apply

def second_theme(stem, change):
    def apply(dir):
        data = manifest(dir)
        data["id"] = stem
        change(data)
        write_manifest(dir, data, stem)
        shutil.copytree(dir / "assets/themes/good", dir / f"assets/themes/{stem}")
    return apply

def write(rel, text):
    def apply(dir):
        p = dir / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(text)
    return apply

def remove(rel):
    def apply(dir):
        p = dir / rel
        shutil.rmtree(p) if p.is_dir() else p.unlink()
    return apply

GOOD_HOME = '<div class="ink-home">{{ site.data.home.name }}</div>\n'

cases = [
    ("manifest-parse", write("_data/themes/good.json", "{ not json")),
    ("manifest-parse", write("_data/themes/notes.txt", "x")),
    ("manifest-schema", edit(lambda d: d.update(summary="short"))),
    ("manifest-schema", edit(lambda d: d.update(extra=True))),
    ("manifest-schema", edit(lambda d: d.update(description="A description with <b>markup</b> in it."))),
    ("manifest-schema", edit(lambda d: d["fonts"][0]["stacks"].update(body="Georgia; } body { color: red"))),
    ("id-filename", edit(lambda d: d.update(id="other"))),
    ("id-reserved", second_theme("preview", lambda d: d.update(name="Preview"))),
    ("name-duplicate", second_theme("twin", lambda d: d.update(name="GOOD"))),
    ("id-duplicate", second_theme("twin", lambda d: d.update(id="good", name="Twin"))),
    ("files-stylesheet", remove("assets/themes/good/theme.css")),
    ("files-stylesheet", css_sub("/* ", "---\n---\n/* ")),
    ("files-slot-missing", remove("_includes/themes/good/post.html")),
    ("files-slot-unlisted", slot_write("page", '<div class="ink-page">x</div>\n')),
    ("slot-unknown", slot_write("sidebar", '<div>x</div>\n')),
    ("files-assets", write("assets/themes/good/font.woff2", "x")),
    ("files-assets", write("assets/themes/orphan/theme.css", "x")),
    ("slot-hook", slot_write("home", '<div class="home">x</div>\n')),
    ("tweak-universal", edit(lambda d: d.update(tweaks=[t for t in d["tweaks"] if t["key"] != "webfonts"] + [
        {"key": "wide", "type": "boolean", "label": "Wide", "default": False}]))),
    ("tweak-universal", edit(lambda d: tweak(d, "mode")["options"].pop())),
    ("tweak-key", edit(lambda d: d["tweaks"].append({"key": "title", "type": "boolean", "label": "T", "default": True}))),
    ("tweak-key", edit(lambda d: d["tweaks"].append(dict(tweak(d, "webfonts"))))),
    ("tweak-default", edit(lambda d: tweak(d, "accent").update(default="green"))),
    ("tweak-default", edit(lambda d: tweak(d, "measure").update(default=35))),
    ("tweak-options", edit(lambda d: tweak(d, "accent").update(role="surface"))),
    ("tweak-font", edit(lambda d: d["fonts"].append(dict(d["fonts"][0], value="second")))),
    ("tweak-font", edit(lambda d: (d["fonts"][0].update(google="family=Inter"), tweak(d, "webfonts").update(default=False)))),
    ("palette-contrast", edit(lambda d: d["palette"]["light"].update(muted="#bbbbbb"))),
    ("plain-language", edit(lambda d: d.update(summary="A sticky sidebar beside your posts, for writers."))),
    ("plain-language", edit(lambda d: d.update(description="A hairline nav on a 12-column grid."))),
    ("plain-language", edit(lambda d: tweak(d, "mode").update(label="Colour scheme"))),
    ("plain-language", edit(lambda d: tweak(d, "mode")["options"][0].update(label="Mono rows"))),
    ("fixture-overlay", remove("scripts/themes/fixtures/writers")),
    ("fixture-overlay", write("scripts/themes/fixtures/writers/overlay.yml", "replace_base_posts: true\n")),
    ("fixture-provenance", write("scripts/themes/fixtures/writers/assets/fixtures/stock.jpg", "x")),
    ("accent-contrast", edit(lambda d: tweak(d, "accent")["presets"][0].update(light="#9999ff"))),
    ("css-tokens", css_sub("--ink-bg: #fbfaf7;", "--ink-bg: #ffffff;")),
    ("css-tokens", css_sub("--ink-muted: #5f5b53;", "--ink-muted: #5f5b53 !important;")),
    ("css-tokens", css_sub(":root[data-ink-mode=\"dark\"] {\n  color-scheme: dark;\n  --ink-bg: #161513;\n  --ink-text: #ece9e2;",
                           ":root[data-ink-mode=\"dark\"] {\n  color-scheme: dark;\n  --ink-bg: #161513;\n  --ink-text: #3a3936;")),
    ("css-tokens", css_sub("  :root[data-ink-mode=\"auto\"] {\n    color-scheme: dark;\n    --ink-bg: #161513;\n    --ink-text: #ece9e2;",
                           "  :root[data-ink-mode=\"auto\"] {\n    color-scheme: dark;\n    --ink-bg: #161513;\n    --ink-text: #3a3936;")),
    ("css-tweak-attr", css_sub("img {", 'html[data-ink-webfonts="false"] body { font-family: serif; }\nimg {')),
    ("css-tweak-attr", css_sub("img {", 'html[data-ink-show_rules="on"] hr { border-width: 2px; }\nimg {')),
    ("css-tweak-attr", css_sub("img {", 'html[data-ink-dense] body { line-height: 1.4; }\nimg {')),
    ("css-tweak-attr", css_sub("img {", 'html[data-ink-measure="34"] body { color: red; }\nimg {')),
    ("css-custom-lift", css_sub("max(l, 0.74)", "l")),
    ("tweak-key", edit(lambda d: d["tweaks"].append({"key": "accent_dark", "type": "range", "label": "A", "min": 0, "max": 10, "step": 1, "unit": "", "default": 5}))),
    ("tweak-key", edit(lambda d: d["tweaks"].append({"key": "font_body", "type": "boolean", "label": "F", "default": True}))),
    ("tweak-options", edit(lambda d: d["tweaks"].append({"key": "cta", "type": "select", "label": "C", "default": "yes",
                                                          "options": [{"value": "yes", "label": "Y"}, {"value": "none", "label": "N"}]}))),
    ("manifest-schema", edit(lambda d: tweak(d, "accent")["presets"][0].update(value=tweak(d, "accent")["presets"][0]["value"] + "\n"))),
    ("manifest-schema", edit(lambda d: d["fonts"][0]["stacks"].update(body="Georgia\n"))),
    ("liquid-include-missing", slot_write("home", '<div class="ink-home">{% include themes/good/_nope.html %}</div>\n')),
    ("css-modes", css_sub('[data-ink-mode="dark"]', '.dark')),
    ("css-modes", css_sub('[data-ink-mode="auto"]', '.auto')),
    ("css-external", css_sub("*, *::before", '@import url("x.css");\n*, *::before')),
    ("css-external", css_sub("img {", "body { background: url(https://example.com/x.png); }\nimg {")),
    ("liquid-script", slot_write("home", '<div class="ink-home"><script>alert(1)</script></div>\n')),
    ("liquid-inline-style", slot_write("home", '<div class="ink-home" style="color:red">x</div>\n')),
    ("liquid-inline-style", slot_write("home", '<div class="ink-home"><link rel="stylesheet" href="x.css"></div>\n')),
    ("liquid-include-scope", slot_write("home", '<div class="ink-home">{% include header.html %}</div>\n')),
    ("liquid-include-scope", slot_write("home", '<div class="ink-home">{% include themes/other/home.html %}</div>\n')),
    ("liquid-script", slot_write("_list", '<ul><script>x</script></ul>\n')),
    ("liquid-variants", slot_write("home", '<div class="ink-home">' + "".join(
        f'<div class="ink-variant" data-variant="k{i}:a">x</div>' for i in range(3)) + "</div>\n")),
    ("config-default-theme", write("_config.yml", 'inkdrafts:\n  theme_id: "missing"\n')),
    ("config-default-theme", write("_config.yml", 'title: "x"\n')),
    ("schema-categories", write("docs/themes/README.md", "<!-- categories:start -->\n| `writers` | x |\n<!-- categories:end -->\n")),
]

failures = 0
def run(dir, *extra):
    return subprocess.run([sys.executable, str(checker), "--root", str(dir), *extra],
                          capture_output=True, text=True)

good = work / "good"
scaffold(good)
slot_write("home", GOOD_HOME)(good)
result = run(good)
if result.returncode != 0 or result.stdout.strip():
    print(f"FAIL: good tree should pass\n{result.stdout}{result.stderr}", file=sys.stderr)
    failures += 1
else:
    print("PASS: good tree accepted")

covered = set()
for i, (rule, mutate) in enumerate(cases):
    dir = work / f"case-{i:02d}-{rule}"
    shutil.copytree(good, dir)
    mutate(dir)
    result = run(dir)
    tag = f"[{rule}]"
    if result.returncode == 1 and tag in result.stdout:
        print(f"PASS: {rule} (case {i})")
        covered.add(rule)
    else:
        print(f"FAIL: case {i} expected {tag}, got exit {result.returncode}:\n{result.stdout}{result.stderr}", file=sys.stderr)
        failures += 1

# Built-site rules run on a fake site tree.
def site_case(rule, page_html, extra=None, preview=False):
    global failures
    dir = work / f"site-{rule}-{len(covered)}"
    pages = ["index.html", "blog/index.html", "about/index.html", "tags/index.html",
             "2026/02/14/the-harbour-at-low-tide/index.html", "2025/11/03/keeping-a-commonplace-book/index.html"]
    for p in pages:
        f = dir / p
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_text(page_html)
    (dir / "assets/themes/good").mkdir(parents=True)
    (dir / "assets/themes/good/theme.css").write_text("")
    if extra:
        extra(dir)
    args = ["--site", str(dir), "--theme", "good"] + (["--preview"] if preview else [])
    result = run(work, *args)
    if rule == "good":
        ok = result.returncode == 0
    else:
        ok = result.returncode == 1 and f"[{rule}]" in result.stdout
    print(("PASS: " if ok else "FAIL: ") + f"site {rule}")
    if not ok:
        print(result.stdout + result.stderr, file=sys.stderr)
        failures += 1
    covered.add(rule)

PAGE = ('<!DOCTYPE html><html lang="en" data-ink-theme="good"><head>'
        '<link rel="stylesheet" href="/assets/themes/good/theme.css">'
        '<link href="https://fonts.googleapis.com/css2?family=Inter&amp;display=swap" rel="stylesheet">'
        '<script type="application/ld+json">{}</script>{extra}</head><body></body></html>')
site_case("good", PAGE.replace("{extra}", ""))
site_case("good", PAGE.replace("{extra}", '<script src="/assets/ink-preview/preview.js" defer></script>'), preview=True)
site_case("site-pages", PAGE.replace("{extra}", ""), extra=lambda d: (d / "about/index.html").unlink())
site_case("site-theme-attr", PAGE.replace('data-ink-theme="good"', 'data-ink-theme="classic"').replace("{extra}", ""))
site_case("site-stylesheet", PAGE.replace("/assets/themes/good/theme.css", "/assets/css/main.css").replace("{extra}", ""))
site_case("site-liquid", PAGE.replace("{extra}", "Liquid error: oops"))
site_case("site-script", PAGE.replace("{extra}", "<script>alert(1)</script>"))
site_case("site-script", PAGE.replace("{extra}", '<script src="/assets/ink-preview/preview.js" defer></script>'))
site_case("site-external", PAGE.replace("{extra}", '<img src="https://tracker.example.net/p.gif">'))

if failures:
    print(f"{failures} check-themes fixture test(s) failed", file=sys.stderr)
    sys.exit(1)
print(f"All check-themes fixture tests passed ({len(covered)} rules).")
PY
