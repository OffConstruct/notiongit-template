#!/usr/bin/env python3
"""Validate InkDrafts theme packages, and optionally a built fixture site.

Usage:
  python3 scripts/check-themes.py [--root DIR] [--theme ID] [--json]
  python3 scripts/check-themes.py --site BUILT_DIR --theme ID [--source SRC_DIR] [--preview]

Prints one line per failure as `<path>:[<rule>] <message>` and exits 1 if
there is any. Advisory findings are printed as `warning:` lines on stderr and
do not fail. Standard library only. Rules are documented in
docs/themes/authoring.md ("Validator rules").
"""

from __future__ import annotations

import argparse
import html.parser
import json
import math
import pathlib
import re
import sys
from urllib.parse import urlsplit

REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent
SCHEMA_PATH = REPO_ROOT / "scripts" / "themes" / "theme.schema.json"

ID_RE = re.compile(r"^[a-z]{2,24}$")
RESERVED_IDS = {
    "size", "first", "last", "empty", "blank", "nil", "default", "none",
    "themes", "ink", "preview", "previews", "assets", "custom", "all", "new",
}
DENIED_KEYS = {
    "name", "email", "title", "description", "url", "baseurl", "theme",
    "theme_id", "author", "lang", "tweaks",
    # The engine emits --tw-font-body/-display/-mono for the font pairing.
    "font_body", "font_display", "font_mono",
}
# Unquoted, YAML 1.1 reads these as booleans or null, so a hand-edited
# `_config.yml` could never select them. (on/off and plain integers are read
# back by ink/tweaks.html.)
YAML_COERCED = {"y", "n", "yes", "no", "true", "false", "null"}
SLOT_HOOKS = {
    "header": "ink-header",
    "footer": "ink-footer",
    "home": "ink-home",
    "blog": "ink-post-list",
    "post-item": "ink-post-item",
    "post": "ink-post",
    "page": "ink-page",
    "tags": "ink-tags",
}
ASSET_SUFFIXES = {".css", ".svg", ".png", ".webp", ".avif"}
ASSET_BUDGET = 200 * 1024
SITE_PAGES = [
    "index.html",
    "blog/index.html",
    "about/index.html",
    "tags/index.html",
    "2026/02/14/the-harbour-at-low-tide/index.html",
    "2025/11/03/keeping-a-commonplace-book/index.html",
]
FONT_HOSTS = {"fonts.googleapis.com", "fonts.gstatic.com"}

# Keywords the interpreter understands. Anything else in the schema is an
# error, so a keyword can never silently stop being enforced.
VALIDATING = {
    "type", "properties", "required", "additionalProperties", "items",
    "minItems", "maxItems", "uniqueItems", "enum", "const", "pattern",
    "minLength", "maxLength", "minimum", "maximum", "oneOf", "$ref",
}
ANNOTATIONS = {"$schema", "$id", "title", "description", "$defs"}

# Site owners are not technical. These words in a summary, a description or a
# tweak or option label read as jargon (or as British spelling, which the
# labels avoid), so each one names the plain wording to use instead.
PLAIN_WORDS = {
    "kicker": "label above the headline",
    "measure": "line length or text width",
    "markdown": "say what the reader sees, such as # signs",
    "mono": "say what it looks like, such as code-style",
    "sans": "say what it looks like, such as clean",
    "sticky": "fixed",
    "centred": "centered",
    "colour": "color",
    "grey": "gray",
    "greys": "grays",
    "programme": "program",
    "catalogue": "catalog",
    "nav": "menu",
    "hairline": "fine line",
    "lede": "intro",
    "gutter": "margin",
    "chip": "label",
    "booktabs": "neat tables",
    "masonry": "a wall of pictures",
    "tabular": "say what it looks like, such as lined up",
    "front matter": "say what the reader sees",
    "12-column": "say what it looks like, such as orderly",
}
PLAIN_RE = re.compile(r"\b(" + "|".join(re.escape(w) for w in PLAIN_WORDS) + r")\b", re.IGNORECASE)


class Report:
    def __init__(self) -> None:
        self.failures: list[tuple[str, str, str]] = []
        self.warnings: list[tuple[str, str, str]] = []

    def fail(self, path: str, rule: str, message: str) -> None:
        self.failures.append((path, rule, message))

    def warn(self, path: str, rule: str, message: str) -> None:
        self.warnings.append((path, rule, message))


# --- JSON Schema subset ------------------------------------------------------

class SchemaError(Exception):
    pass


def type_ok(value, kind: str) -> bool:
    if kind == "object":
        return isinstance(value, dict)
    if kind == "array":
        return isinstance(value, list)
    if kind == "string":
        return isinstance(value, str)
    if kind == "boolean":
        return isinstance(value, bool)
    if kind == "null":
        return value is None
    if kind == "integer":
        return isinstance(value, int) and not isinstance(value, bool)
    if kind == "number":
        return isinstance(value, (int, float)) and not isinstance(value, bool)
    raise SchemaError(f"unknown type {kind!r}")


def same(a, b) -> bool:
    return type(a) is type(b) and a == b


def resolve_ref(root: dict, ref: str) -> dict:
    if not ref.startswith("#/$defs/"):
        raise SchemaError(f"only local #/$defs refs are supported, got {ref!r}")
    name = ref[len("#/$defs/"):]
    try:
        return root["$defs"][name]
    except KeyError:
        raise SchemaError(f"unresolved $ref {ref!r}") from None


def check_schema_keywords(node, where="#") -> None:
    if not isinstance(node, dict):
        raise SchemaError(f"{where}: schema must be an object")
    for key in node:
        if key not in VALIDATING and key not in ANNOTATIONS:
            raise SchemaError(f"{where}: unsupported keyword {key!r}")
    for name, sub in node.get("properties", {}).items():
        check_schema_keywords(sub, f"{where}/properties/{name}")
    for name, sub in node.get("$defs", {}).items():
        check_schema_keywords(sub, f"{where}/$defs/{name}")
    if isinstance(node.get("items"), dict):
        check_schema_keywords(node["items"], f"{where}/items")
    if isinstance(node.get("additionalProperties"), dict):
        check_schema_keywords(node["additionalProperties"], f"{where}/additionalProperties")
    for i, sub in enumerate(node.get("oneOf", [])):
        check_schema_keywords(sub, f"{where}/oneOf/{i}")


def validate(value, schema: dict, root: dict, path: str) -> list[str]:
    errors: list[str] = []
    if "$ref" in schema:
        errors += validate(value, resolve_ref(root, schema["$ref"]), root, path)
    if "type" in schema:
        kinds = schema["type"] if isinstance(schema["type"], list) else [schema["type"]]
        if not any(type_ok(value, k) for k in kinds):
            return errors + [f"{path}: expected {' or '.join(kinds)}"]
    if "const" in schema and not same(value, schema["const"]):
        errors.append(f"{path}: must be {json.dumps(schema['const'])}")
    if "enum" in schema and not any(same(value, e) for e in schema["enum"]):
        errors.append(f"{path}: must be one of {', '.join(map(json.dumps, schema['enum']))}")
    if isinstance(value, str):
        if "minLength" in schema and len(value) < schema["minLength"]:
            errors.append(f"{path}: shorter than {schema['minLength']} characters")
        if "maxLength" in schema and len(value) > schema["maxLength"]:
            errors.append(f"{path}: longer than {schema['maxLength']} characters")
        # fullmatch: Python's `$` also matches before a trailing newline.
        if "pattern" in schema and not re.fullmatch(schema["pattern"], value):
            errors.append(f"{path}: {json.dumps(value)} does not match {schema['pattern']}")
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        if "minimum" in schema and value < schema["minimum"]:
            errors.append(f"{path}: below minimum {schema['minimum']}")
        if "maximum" in schema and value > schema["maximum"]:
            errors.append(f"{path}: above maximum {schema['maximum']}")
    if isinstance(value, list):
        if "minItems" in schema and len(value) < schema["minItems"]:
            errors.append(f"{path}: needs at least {schema['minItems']} items")
        if "maxItems" in schema and len(value) > schema["maxItems"]:
            errors.append(f"{path}: allows at most {schema['maxItems']} items")
        if schema.get("uniqueItems"):
            seen = []
            for item in value:
                if any(same(item, s) for s in seen):
                    errors.append(f"{path}: duplicate item {json.dumps(item)}")
                seen.append(item)
        if isinstance(schema.get("items"), dict):
            for i, item in enumerate(value):
                errors += validate(item, schema["items"], root, f"{path}[{i}]")
    if isinstance(value, dict):
        props = schema.get("properties", {})
        for key in schema.get("required", []):
            if key not in value:
                errors.append(f"{path}: missing required field {key!r}")
        for key, item in value.items():
            if key in props:
                errors += validate(item, props[key], root, f"{path}.{key}")
            elif schema.get("additionalProperties") is False:
                errors.append(f"{path}: unknown field {key!r}")
            elif isinstance(schema.get("additionalProperties"), dict):
                errors += validate(item, schema["additionalProperties"], root, f"{path}.{key}")
    if "oneOf" in schema:
        results = [validate(value, sub, root, path) for sub in schema["oneOf"]]
        passing = [r for r in results if not r]
        if len(passing) != 1:
            if not passing:
                # Report the closest branch, which is far more useful than
                # "matches none of oneOf".
                best = min(results, key=len)
                errors += best
            else:
                errors.append(f"{path}: matches more than one alternative")
    return errors


# --- helpers ------------------------------------------------------------------

def luminance(hex_color: str) -> float:
    def channel(c: int) -> float:
        s = c / 255
        return s / 12.92 if s <= 0.04045 else ((s + 0.055) / 1.055) ** 2.4
    r, g, b = (int(hex_color[i:i + 2], 16) for i in (1, 3, 5))
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)


def contrast(a: str, b: str) -> float:
    la, lb = luminance(a), luminance(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def walk_strings(value, path="$"):
    if isinstance(value, str):
        yield path, value
    elif isinstance(value, dict):
        for k, v in value.items():
            yield from walk_strings(v, f"{path}.{k}")
    elif isinstance(value, list):
        for i, v in enumerate(value):
            yield from walk_strings(v, f"{path}[{i}]")


def is_hex(value) -> bool:
    return isinstance(value, str) and re.fullmatch(r"#[0-9a-f]{6}", value) is not None


def rel(root: pathlib.Path, path: pathlib.Path) -> str:
    try:
        return str(path.relative_to(root))
    except ValueError:
        return str(path)


# --- package checks -----------------------------------------------------------

def load_manifests(root: pathlib.Path, report: Report) -> dict[str, tuple[pathlib.Path, dict]]:
    manifests: dict[str, tuple[pathlib.Path, dict]] = {}
    themes_dir = root / "_data" / "themes"
    if not themes_dir.is_dir():
        return manifests
    for path in sorted(themes_dir.iterdir()):
        r = rel(root, path)
        if path.is_dir() or path.suffix != ".json":
            report.fail(r, "manifest-parse", "only <id>.json files may live in _data/themes/")
            continue
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except UnicodeDecodeError:
            report.fail(r, "manifest-parse", "not valid UTF-8")
            continue
        except json.JSONDecodeError as exc:
            report.fail(r, "manifest-parse", f"invalid JSON: {exc}")
            continue
        if not isinstance(data, dict):
            report.fail(r, "manifest-parse", "manifest must be a JSON object")
            continue
        manifests[path.stem] = (path, data)
    return manifests


def check_identity(root, stem, path, data, manifests, report):
    r = rel(root, path)
    if data.get("id") != stem:
        report.fail(r, "id-filename", f"id {data.get('id')!r} must equal the file name {stem!r}")
    if not ID_RE.fullmatch(stem):
        report.fail(r, "id-filename", f"file name {stem!r} must match ^[a-z]{{2,24}}$")
    if stem in RESERVED_IDS:
        report.fail(r, "id-reserved", f"{stem!r} is a reserved id")
    for other, (other_path, other_data) in manifests.items():
        if other == stem:
            continue
        if data.get("id") is not None and other_data.get("id") == data.get("id"):
            report.fail(r, "id-duplicate", f"id {data.get('id')!r} is also used by {rel(root, other_path)}")
        name, other_name = data.get("name"), other_data.get("name")
        if isinstance(name, str) and isinstance(other_name, str) and name.lower() == other_name.lower():
            report.fail(r, "name-duplicate", f"name {name!r} is also used by {rel(root, other_path)}")


def check_files(root, theme_id, data, report):
    css = root / "assets" / "themes" / theme_id / "theme.css"
    css_r = rel(root, css)
    if not css.is_file():
        report.fail(css_r, "files-stylesheet", "theme.css is required")
    elif css.read_text(encoding="utf-8", errors="replace").startswith("---"):
        report.fail(css_r, "files-stylesheet", "theme.css must be static (no front matter)")

    assets_dir = root / "assets" / "themes" / theme_id
    if assets_dir.is_dir():
        total = 0
        for f in sorted(assets_dir.rglob("*")):
            if f.is_file():
                total += f.stat().st_size
                if f.suffix.lower() not in ASSET_SUFFIXES:
                    report.fail(rel(root, f), "files-assets", f"only {' '.join(sorted(ASSET_SUFFIXES))} files are allowed")
        if total > ASSET_BUDGET:
            report.fail(rel(root, assets_dir), "files-assets", f"theme assets total {total} bytes, over the {ASSET_BUDGET} byte budget")

    slots = data.get("slots") if isinstance(data.get("slots"), list) else []
    inc_dir = root / "_includes" / "themes" / theme_id
    present = {}
    partials = {}
    if inc_dir.is_dir():
        for f in sorted(inc_dir.iterdir()):
            if f.is_dir():
                report.fail(rel(root, f), "slot-unknown", "slot directories may not contain subdirectories")
                continue
            if f.suffix == ".html" and re.fullmatch(r"_[a-z0-9-]+", f.stem):
                partials[f.stem] = f
                continue
            if f.suffix != ".html" or f.stem not in SLOT_HOOKS:
                report.fail(rel(root, f), "slot-unknown", f"not a slot file or _partial.html; slots are {', '.join(SLOT_HOOKS)}")
                continue
            present[f.stem] = f
    for slot in slots:
        if isinstance(slot, str) and slot in SLOT_HOOKS and slot not in present:
            report.fail(rel(root, inc_dir / f"{slot}.html"), "files-slot-missing", f"slot {slot!r} is listed in the manifest but has no file")
    for slot, f in present.items():
        if slot not in slots:
            report.fail(rel(root, f), "files-slot-unlisted", f"slot file exists but {slot!r} is not in the manifest's slots")
    return present, partials


LIQUID_TAG = re.compile(r"\{%-?.*?-?%\}", re.S)
LIQUID_COMMENT = re.compile(r"\{%-?\s*comment\s*-?%\}.*?\{%-?\s*endcomment\s*-?%\}", re.S)
INCLUDE_RE = re.compile(r"\{%-?\s*(include|include_relative|render)\s+([^\s%]+)", re.S)


def check_slot_files(root, theme_id, present, partials, report):
    variant_keys = set()
    for slot, f in list(present.items()) + list(partials.items()):
        r = rel(root, f)
        text = f.read_text(encoding="utf-8", errors="replace")
        lowered = text.lower()
        for needle, what in (("<script", "<script>"), ("<link", "<link>"), ("<style", "<style>")):
            if needle in lowered:
                report.fail(r, "liquid-script" if needle == "<script" else "liquid-inline-style",
                            f"slot files may not contain {what}; styling belongs in theme.css")
        if re.search(r"\sstyle\s*=", lowered):
            report.fail(r, "liquid-inline-style", "slot files may not use style= attributes; styling belongs in theme.css")
        for kind, target in INCLUDE_RE.findall(re.sub(r"\{\{\s*(\w+)\s*\}\}", r"{{\1}}", text)):
            ok = kind == "include" and (
                target in ("empty-state.html", "post-card.html")
                or target.startswith(f"themes/{theme_id}/")
                or target.startswith("themes/{{ink_id}}/")
            )
            if not ok:
                report.fail(r, "liquid-include-scope",
                            f"{{% {kind} {target} %}} is outside themes/{theme_id}/, empty-state.html and post-card.html")
            elif "{{" not in target:
                path = root / "_includes" / target.replace("themes/{{ink_id}}/", f"themes/{theme_id}/")
                if not path.is_file():
                    report.fail(r, "liquid-include-missing", f"{{% include {target} %}}: _includes/{target} does not exist")
        variant_keys |= set(re.findall(r'data-variant="([a-z0-9_]+):', text))
        if slot not in SLOT_HOOKS:
            continue  # partials have no required root hook
        stripped = LIQUID_TAG.sub("", LIQUID_COMMENT.sub("", text))
        m = re.search(r"<([a-zA-Z][a-zA-Z0-9-]*)\b([^>]*)>", stripped)
        hook = SLOT_HOOKS[slot]
        cls = re.search(r'class\s*=\s*"([^"]*)"', m.group(2)) if m else None
        if not cls or hook not in re.split(r"\s+", re.sub(r"\{\{.*?\}\}", " ", cls.group(1))):
            report.fail(r, "slot-hook", f"the outermost element must carry class {hook!r}")
        if slot == "header" and not re.search(r"<nav\b[^>]*aria-label=", text):
            report.fail(r, "slot-hook", "the header slot must render <nav aria-label=...> for site.data.nav")
    if len(variant_keys) > 2:
        report.fail(rel(root, root / "_includes" / "themes" / theme_id), "liquid-variants",
                    f"at most 2 markup-variant tweaks are allowed, found {', '.join(sorted(variant_keys))}")


def check_tweaks(root, path, data, report):
    r = rel(root, path)
    tweaks = [t for t in data.get("tweaks", []) if isinstance(t, dict)]
    fonts = [f for f in data.get("fonts", []) if isinstance(f, dict)]
    pairings = {f.get("value") for f in fonts}
    by_key = {}
    for t in tweaks:
        key = t.get("key")
        if not isinstance(key, str):
            continue
        if key in by_key:
            report.fail(r, "tweak-key", f"tweak key {key!r} is declared twice")
        by_key[key] = t
        if not re.fullmatch(r"[a-z][a-z0-9_]{0,23}", key):
            report.fail(r, "tweak-key", f"tweak key {key!r} must match ^[a-z][a-z0-9_]{{0,23}}$")
        if key in DENIED_KEYS:
            report.fail(r, "tweak-key", f"tweak key {key!r} is reserved")
    # A color tweak also emits --tw-<key>-dark and --tw-<key>-on.
    for t in tweaks:
        if t.get("type") != "color" or not isinstance(t.get("key"), str):
            continue
        for suffix in ("_dark", "_on"):
            if t["key"] + suffix in by_key:
                report.fail(r, "tweak-key", f"tweak key {t['key'] + suffix!r} collides with the --tw-{t['key'].replace('_', '-')}{suffix.replace('_', '-')} variable of color tweak {t['key']!r}")

    universal = {"mode": "select", "accent": "color", "webfonts": "boolean"}
    for key, kind in universal.items():
        t = by_key.get(key)
        if t is None:
            report.fail(r, "tweak-universal", f"every theme must declare the {key!r} tweak ({kind})")
        elif t.get("type") != kind:
            report.fail(r, "tweak-universal", f"tweak {key!r} must have type {kind!r}")
    mode = by_key.get("mode")
    if mode and mode.get("type") == "select":
        values = [o.get("value") for o in mode.get("options", []) if isinstance(o, dict)]
        if sorted(values) != ["auto", "dark", "light"]:
            report.fail(r, "tweak-universal", "the mode tweak must offer exactly auto, light and dark")

    font_tweaks = [t for t in tweaks if t.get("type") == "font"]
    if len(fonts) >= 2 and not font_tweaks:
        report.fail(r, "tweak-font", "a theme with 2 or more font pairings must declare a font tweak")
    if len(fonts) < 2 and font_tweaks:
        report.fail(r, "tweak-font", "a font tweak needs at least 2 font pairings")
    if len(font_tweaks) > 1:
        report.fail(r, "tweak-font", "at most one font tweak")
    if len(pairings) != len(fonts):
        report.fail(r, "tweak-font", "font pairing values must be unique")
    webfonts = by_key.get("webfonts")
    if webfonts and webfonts.get("default") is not True and any(f.get("google") for f in fonts):
        report.fail(r, "tweak-font", "webfonts must default to true when a pairing loads Google Fonts")

    for t in tweaks:
        key, kind = t.get("key"), t.get("type")
        values = [o.get("value") for o in t.get("options", []) + t.get("presets", []) if isinstance(o, dict)]
        if kind == "font":
            values = list(pairings)
        for value in values:
            if isinstance(value, str) and (value in YAML_COERCED or re.fullmatch(r"0\d+", value)):
                report.fail(r, "tweak-options", f"tweak {key!r} value {value!r} changes type when written unquoted in _config.yml; rename it")

    for t in tweaks:
        key, kind, default = t.get("key"), t.get("type"), t.get("default")
        if kind == "select":
            values = [o.get("value") for o in t.get("options", []) if isinstance(o, dict)]
            if len(set(values)) != len(values):
                report.fail(r, "tweak-options", f"tweak {key!r} has duplicate option values")
            if default not in values:
                report.fail(r, "tweak-default", f"tweak {key!r} default {default!r} is not one of its options")
        elif kind == "boolean":
            if not isinstance(default, bool):
                report.fail(r, "tweak-default", f"tweak {key!r} default must be true or false")
        elif kind == "color":
            presets = [p for p in t.get("presets", []) if isinstance(p, dict)]
            values = [p.get("value") for p in presets]
            if len(set(values)) != len(values):
                report.fail(r, "tweak-options", f"tweak {key!r} has duplicate preset values")
            if default not in values:
                report.fail(r, "tweak-default", f"tweak {key!r} default {default!r} is not one of its presets")
            if t.get("role") == "surface":
                if t.get("custom"):
                    report.fail(r, "tweak-options", f"tweak {key!r}: a surface color cannot allow custom hex values")
                for p in presets:
                    if not is_hex(p.get("on")):
                        report.fail(r, "tweak-options", f"tweak {key!r} preset {p.get('value')!r}: surface presets need an 'on' text color")
        elif kind == "range":
            lo, hi, step = t.get("min"), t.get("max"), t.get("step")
            if all(isinstance(x, (int, float)) and not isinstance(x, bool) for x in (lo, hi, step, default)):
                if lo >= hi:
                    report.fail(r, "tweak-options", f"tweak {key!r}: min must be below max")
                if not lo <= default <= hi:
                    report.fail(r, "tweak-default", f"tweak {key!r} default {default} is outside [{lo}, {hi}]")
                elif step > 0:
                    n = (default - lo) / step
                    if not math.isclose(n, round(n), abs_tol=1e-9):
                        report.fail(r, "tweak-default", f"tweak {key!r} default {default} is not on step {step} from {lo}")
        elif kind == "font":
            if default not in pairings:
                report.fail(r, "tweak-default", f"font tweak default {default!r} is not a pairing value")


def check_plain_language(root, path, data, report):
    r = rel(root, path)
    strings = [("summary", data.get("summary")), ("description", data.get("description"))]
    for t in data.get("tweaks") or []:
        strings.append((f"tweak {t.get('key')!r} label", t.get("label")))
        for o in (t.get("options") or []) + (t.get("presets") or []):
            strings.append((f"tweak {t.get('key')!r} option {o.get('value')!r}", o.get("label")))
    for where, text in strings:
        if not isinstance(text, str):
            continue
        for m in PLAIN_RE.finditer(text):
            word = m.group(1).lower()
            report.fail(r, "plain-language", f"{where}: {m.group(1)!r} is jargon for site owners; use: {PLAIN_WORDS[word]}")


def check_fixture_overlays(root, manifests, report):
    """Every category a theme lists needs sample content of its own, so its
    preview shows that kind of site instead of the base essays."""
    fixtures = root / "scripts" / "themes" / "fixtures"
    used = sorted({c for _, data in manifests.values() for c in (data.get("categories") or []) if isinstance(c, str)})
    for category in used:
        if not (fixtures / category).is_dir():
            report.fail(f"scripts/themes/fixtures/{category}", "fixture-overlay",
                        f"category {category!r} is used by a theme but has no fixture overlay directory")
    # An overlay that drops the base posts must still build every SITE_PAGES post.
    required = [re.sub(r"^(\d{4})/(\d{2})/(\d{2})/([^/]+)/index\.html$", r"\1-\2-\3-\4.md", p)
                for p in SITE_PAGES if re.match(r"^\d{4}/", p)]
    for overlay in sorted(fixtures.glob("*/overlay.yml")):
        if re.search(r"^replace_base_posts:\s*true\s*$", overlay.read_text(encoding="utf-8"), re.M):
            for name in required:
                if not (overlay.parent / "_posts" / name).is_file():
                    report.fail(rel(root, overlay), "fixture-overlay", f"replace_base_posts is true, so _posts/{name} is required (a preview page links it)")
    provenance = fixtures / "PROVENANCE.md"
    listed = provenance.read_text(encoding="utf-8") if provenance.is_file() else ""
    for f in sorted(fixtures.glob("*/assets/fixtures/*")):
        if f.suffix.lower() in (".jpg", ".jpeg", ".png", ".webp", ".avif", ".gif") and f"`{rel(fixtures, f)}`" not in listed:
            report.fail(rel(root, f), "fixture-provenance", "fixture image is not listed with its source and license in scripts/themes/fixtures/PROVENANCE.md")


def check_contrast(root, path, data, report):
    r = rel(root, path)
    palette = data.get("palette") if isinstance(data.get("palette"), dict) else {}
    for mode in ("light", "dark"):
        sw = palette.get(mode)
        if not isinstance(sw, dict) or not all(is_hex(sw.get(k)) for k in ("bg", "text", "muted")):
            continue
        ratio = contrast(sw["text"], sw["bg"])
        if ratio < 4.5:
            report.fail(r, "palette-contrast", f"{mode} text/bg is {ratio:.2f}:1, needs 4.5:1")
        elif ratio < 7:
            report.warn(r, "palette-contrast", f"{mode} text/bg is {ratio:.2f}:1; 7:1 is recommended for body text")
        ratio = contrast(sw["muted"], sw["bg"])
        if ratio < 4.5:
            report.fail(r, "palette-contrast", f"{mode} muted/bg is {ratio:.2f}:1, needs 4.5:1")
    for t in data.get("tweaks", []):
        if not isinstance(t, dict) or t.get("type") != "color":
            continue
        role = t.get("role")
        need = {"text": 4.5, "large": 3.0, "surface": 4.5}.get(role)
        if need is None:
            continue
        for p in t.get("presets", []):
            if not isinstance(p, dict):
                continue
            for mode in ("light", "dark"):
                sw = palette.get(mode) if isinstance(palette.get(mode), dict) else {}
                color = p.get(mode)
                if not is_hex(color) or not is_hex(sw.get("bg")):
                    continue
                if role == "surface":
                    if not is_hex(p.get("on")):
                        continue
                    ratio = contrast(p["on"], color)
                    what = f"'on' text on the {mode} surface"
                else:
                    ratio = contrast(color, sw["bg"])
                    what = f"{mode} hex on palette.{mode}.bg"
                if ratio < need:
                    report.fail(r, "accent-contrast",
                                f"tweak {t.get('key')!r} preset {p.get('value')!r}: {what} is {ratio:.2f}:1, role {role!r} needs {need}:1")


def css_blocks(code: str) -> list[tuple[tuple[str, ...], str, str]]:
    """Every rule as (enclosing at-rule preludes, prelude, its own
    declarations). Comments must already be stripped."""
    blocks: list[tuple[tuple[str, ...], str, str]] = []
    stack: list[tuple[str, list[str]]] = []
    buf = ""
    for ch in code:
        if ch == "{":
            stack.append((buf.strip(), []))
            buf = ""
        elif ch == "}":
            if stack:
                prelude, parts = stack.pop()
                parts.append(buf)
                blocks.append((tuple(p for p, _ in stack), prelude, "".join(parts)))
            buf = ""
        elif ch == ";" and stack:
            stack[-1][1].append(buf + ";")
            buf = ""
        else:
            buf += ch
    return blocks


TOKEN_FIELDS = (("--ink-bg", "bg"), ("--ink-text", "text"), ("--ink-muted", "muted"))
FORCED_DARK = re.compile(r'(?::root|html)?\[data-ink-mode="dark"\]')
AUTO_DARK = re.compile(r'(?::root|html)?(?:\[data-ink-mode="auto"\]|:not\(\[data-ink-mode="light"\]\))')
ATTR_SELECTOR = re.compile(r'\[data-ink-([a-z0-9_-]+)(?:\s*([~|^$*]?=)\s*(?:"([^"]*)"|\'([^\']*)\'|([^\]\s]*)))?\s*\]')


def declared(body: str, token: str) -> str | None:
    found = re.findall(re.escape(token) + r"\s*:\s*([^;]+?)\s*(?:;|$)", body)
    return found[-1].strip().lower() if found else None


def check_dark_tokens(r, blocks, dark, report):
    for label, selector, in_media in (('[data-ink-mode="dark"]', FORCED_DARK, False),
                                      ('@media (prefers-color-scheme: dark) [data-ink-mode="auto"]', AUTO_DARK, True)):
        # Overrides inside @supports are progressive enhancement over the
        # literal (Plaintext's hue tint); the literal is the contract.
        matching = [body for context, prelude, body in blocks
                    if any(selector.fullmatch(part.strip()) for part in prelude.split(","))
                    and not any(c.startswith("@supports") for c in context)
                    and (not in_media or any(re.search(r"prefers-color-scheme:\s*dark", c) for c in context))]
        for token, field in TOKEN_FIELDS:
            want = dark.get(field)
            if not is_hex(want):
                continue
            values = [v for v in (declared(body, token) for body in matching) if v is not None]
            if not values or values[-1] != want:
                report.fail(r, "css-tokens", f"{token} in the {label} block must be the literal palette.dark.{field} value {want}"
                            + (f", found {values[-1]}" if values else ""))


def check_tweak_selectors(r, code, data, report):
    """Every data-ink-* attribute selector must name a declared tweak (with
    `_` as `-`) and, for `=`, a value the engine can emit."""
    tweaks = [t for t in data.get("tweaks", []) if isinstance(t, dict) and isinstance(t.get("key"), str)]
    allowed: dict[str, set[str] | None] = {"theme": None}
    for t in tweaks:
        name = t["key"].replace("_", "-")
        kind = t.get("type")
        if kind == "select":
            allowed[name] = {o.get("value") for o in t.get("options", []) if isinstance(o, dict)}
        elif kind == "boolean":
            allowed[name] = {"on", "off"}
        elif kind == "color":
            allowed[name] = {p.get("value") for p in t.get("presets", []) if isinstance(p, dict)} | {"custom"}
        elif kind == "font":
            allowed["font"] = {f.get("value") for f in data.get("fonts", []) if isinstance(f, dict)}
    for m in ATTR_SELECTOR.finditer(code):
        name, op = m.group(1), m.group(2)
        value = next((g for g in m.group(3, 4, 5) if g is not None), None)
        if name not in allowed:
            hint = " (range tweaks set a --tw-* variable, not an attribute)" if any(
                t.get("type") == "range" and t["key"].replace("_", "-") == name for t in tweaks) else ""
            report.fail(r, "css-tweak-attr", f"[data-ink-{name}] matches no declared tweak{hint}; attribute names use - for _")
        elif op == "=" and allowed[name] is not None and value not in allowed[name]:
            report.fail(r, "css-tweak-attr", f'[data-ink-{name}="{value}"] is never emitted; values are {", ".join(sorted(allowed[name]))}'
                        + (" (booleans render on/off)" if allowed[name] == {"on", "off"} else ""))


def check_css(root, theme_id, data, report):
    css_path = root / "assets" / "themes" / theme_id / "theme.css"
    if not css_path.is_file():
        return
    r = rel(root, css_path)
    css = css_path.read_text(encoding="utf-8", errors="replace")
    code = re.sub(r"/\*.*?\*/", "", css, flags=re.S)
    blocks = css_blocks(code)
    palette = data.get("palette") if isinstance(data.get("palette"), dict) else {}
    light = palette.get("light")
    if isinstance(light, dict):
        for token, field in TOKEN_FIELDS:
            value = light.get(field)
            if not is_hex(value):
                continue
            if not re.search(re.escape(token) + r"\s*:\s*" + re.escape(value) + r"\s*[;}]", code, re.I):
                report.fail(r, "css-tokens", f"{token} must be declared with the literal palette.light.{field} value {value}")
    if '[data-ink-mode="dark"]' not in code:
        report.fail(r, "css-modes", 'missing a [data-ink-mode="dark"] block (forced dark mode)')
    if not re.search(r"prefers-color-scheme:\s*dark", code) or not (
        '[data-ink-mode="auto"]' in code or ':not([data-ink-mode="light"])' in code
    ):
        report.fail(r, "css-modes", 'missing @media (prefers-color-scheme: dark) with [data-ink-mode="auto"] (follow-the-system mode)')
    elif isinstance(palette.get("dark"), dict):
        check_dark_tokens(r, blocks, palette["dark"], report)
    check_tweak_selectors(r, code, data, report)
    for t in data.get("tweaks", []):
        if isinstance(t, dict) and t.get("type") == "color" and t.get("custom") and isinstance(t.get("key"), str):
            name = t["key"].replace("_", "-")
            # inkdrafts.com checks custom colors on the dark ground as lifted to L 0.74.
            floors = [float(f) for f in re.findall(r"oklch\(\s*from\s+var\(--tw-" + re.escape(name) + r"\)\s+max\(\s*l\s*,\s*(0?\.\d+)\s*\)", code)]
            if f'[data-ink-{name}="custom"]' not in code or not floors or min(floors) < 0.74:
                report.fail(r, "css-custom-lift", f'tweak {t["key"]!r} allows custom hexes, so dark mode must lift them: '
                            f'[data-ink-{name}="custom"] with oklch(from var(--tw-{name}) max(l, 0.74) c h)')
    accent = next((t for t in data.get("tweaks", []) if isinstance(t, dict) and t.get("key") == "accent"), None)
    if accent and accent.get("role") in ("large", "surface"):
        for _, prelude, body in blocks:
            if re.search(r"(?:^|[\s>+~,])a(?::[\w-]+)*\s*(?:,|$)", prelude) and re.search(r"(?<![\w-])color\s*:\s*var\(--ink-accent\)", body):
                report.warn(r, "accent-role", f"accent role {accent['role']!r} is not for body-size text, but {prelude.strip()!r} colors links with --ink-accent")
                break
    for pattern, what in ((r"@import", "@import"), (r"url\(\s*['\"]?\s*https?:", "url(http...)"),
                          (r"url\(\s*['\"]?\s*//", "url(//...)"), (r"expression\(", "expression(")):
        if re.search(pattern, code, re.I):
            report.fail(r, "css-external", f"{what} is not allowed; fonts come from the manifest and images from assets/themes/{theme_id}/")
    if re.search(r"--ink-[\w-]+\s*:[^;}]*!important", code):
        report.fail(r, "css-tokens", "--ink-* tokens may not use !important (custom.css must be able to override them)")


def check_orphans(root, manifests, report):
    for base in (root / "assets" / "themes", root / "_includes" / "themes"):
        if not base.is_dir():
            continue
        for d in sorted(base.iterdir()):
            if d.is_dir() and d.name not in manifests:
                report.fail(rel(root, d), "files-assets", f"no manifest _data/themes/{d.name}.json for this directory")
            elif not d.is_dir():
                report.fail(rel(root, d), "files-assets", "only per-theme directories may live here")


def check_config(root, manifests, report):
    cfg = root / "_config.yml"
    if not cfg.is_file():
        return
    text = cfg.read_text(encoding="utf-8", errors="replace")
    m = re.search(r"^inkdrafts:[ \t]*\n((?:[ \t]+.*\n|[ \t]*\n|[ \t]*#.*\n)*)", text + "\n", re.M)
    if not m:
        report.fail("_config.yml", "config-default-theme", "missing the column-zero inkdrafts: block")
        return
    tid = re.search(r'^[ \t]+theme_id:[ \t]*"?([^"\s]*)"?[ \t]*$', m.group(1), re.M)
    if not tid:
        report.fail("_config.yml", "config-default-theme", "inkdrafts: block has no theme_id")
    elif tid.group(1) not in manifests:
        report.fail("_config.yml", "config-default-theme", f"theme_id {tid.group(1)!r} has no manifest in _data/themes/")


def check_categories_doc(root, schema, report):
    readme = root / "docs" / "themes" / "README.md"
    if not readme.is_file():
        if root.resolve() == REPO_ROOT:
            report.fail("docs/themes/README.md", "schema-categories", "missing; it must list the theme categories")
        return
    text = readme.read_text(encoding="utf-8")
    m = re.search(r"<!-- categories:start -->(.*?)<!-- categories:end -->", text, re.S)
    if not m:
        report.fail("docs/themes/README.md", "schema-categories", "missing the <!-- categories:start --> ... <!-- categories:end --> list")
        return
    documented = re.findall(r"^\|\s*`([a-z]+)`", m.group(1), re.M)
    enum = schema["$defs"]["category"]["enum"]
    if documented != enum:
        report.fail("docs/themes/README.md", "schema-categories",
                    f"documented categories {documented} differ from the schema enum {enum}")


# --- built site checks ----------------------------------------------------------

class TagCollector(html.parser.HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.tags: list[tuple[str, dict]] = []

    def handle_starttag(self, tag, attrs):
        self.tags.append((tag, {k: (v or "") for k, v in attrs}))


def source_hosts(source: pathlib.Path | None) -> set[str]:
    hosts: set[str] = set()
    if source is None:
        return hosts
    candidates = []
    for sub in ("_data", "_pages", "_posts"):
        candidates += [p for p in (source / sub).rglob("*") if p.is_file()]
    candidates += [p for p in (source / "_includes").glob("*.html")]
    # The site's own `url` (set by provisioning) feeds canonical and feed links.
    candidates += [p for p in source.glob("_config*.yml")]
    for p in candidates:
        if p.suffix not in (".md", ".yml", ".yaml", ".html"):
            continue
        for url in re.findall(r"https?://[^\s\"'()<>\]]+", p.read_text(encoding="utf-8", errors="replace")):
            hosts.add(urlsplit(url).hostname or "")
    return hosts


def check_site(site: pathlib.Path, theme_id: str, source: pathlib.Path | None, preview: bool, report: Report) -> None:
    for page in SITE_PAGES:
        if not (site / page).is_file():
            report.fail(page, "site-pages", "expected page was not built")
    allowed_hosts = FONT_HOSTS | source_hosts(source)
    css_href = f"/assets/themes/{theme_id}/theme.css"
    if not (site / "assets" / "themes" / theme_id / "theme.css").is_file():
        report.fail(f"assets/themes/{theme_id}/theme.css", "site-stylesheet", "theme stylesheet missing from the built site")
    for f in sorted(site.rglob("*.html")):
        r = rel(site, f)
        text = f.read_text(encoding="utf-8", errors="replace")
        if "Liquid Exception" in text or "Liquid error" in text:
            report.fail(r, "site-liquid", "page contains a Liquid error")
        parser = TagCollector()
        parser.feed(text)
        html_tags = [a for t, a in parser.tags if t == "html"]
        if not html_tags:
            continue  # a static .html asset, not a rendered page
        if html_tags[0].get("data-ink-theme") != theme_id:
            report.fail(r, "site-theme-attr", f'<html> must carry data-ink-theme="{theme_id}"')
        if not any(t == "link" and a.get("href", "").endswith(css_href) for t, a in parser.tags):
            report.fail(r, "site-stylesheet", f"page does not link {css_href}")
        for tag, attrs in parser.tags:
            if tag == "script":
                kind = attrs.get("type", "")
                if kind == "application/ld+json":
                    continue
                if preview and kind == "application/json" and attrs.get("id") == "ink-manifest":
                    continue
                if preview and attrs.get("src", "").endswith("/assets/ink-preview/preview.js"):
                    continue
                report.fail(r, "site-script", f"unexpected <script{' src=' + attrs['src'] if attrs.get('src') else ''}>")
            for attr in ("src", "href", "srcset", "poster", "data"):
                value = attrs.get(attr)
                if not value:
                    continue
                for url in value.split(",") if attr == "srcset" else [value]:
                    url = url.strip().split(" ")[0]
                    parts = urlsplit(url)
                    if parts.scheme in ("http", "https") or url.startswith("//"):
                        host = parts.hostname or ""
                        if host not in allowed_hosts:
                            report.fail(r, "site-external", f"<{tag} {attr}> points at {host}, which is neither a font host nor in the fixture content")


# --- main ---------------------------------------------------------------------------

def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description="Validate InkDrafts theme packages.")
    ap.add_argument("--root", default=str(REPO_ROOT), help="template tree to check (default: this repository)")
    ap.add_argument("--theme", help="check only this theme's package (cross-theme duplicates still count)")
    ap.add_argument("--site", help="also check a built fixture site (needs --theme)")
    ap.add_argument("--source", help="the source tree the --site was built from (fixture link hosts are allowed)")
    ap.add_argument("--preview", action="store_true", help="the --site is a preview build (allows preview.js)")
    ap.add_argument("--json", action="store_true", help="print failures and warnings as JSON")
    args = ap.parse_args(argv)

    report = Report()
    root = pathlib.Path(args.root).resolve()

    try:
        schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
        check_schema_keywords(schema)
    except (OSError, json.JSONDecodeError, SchemaError) as exc:
        report.fail(rel(REPO_ROOT, SCHEMA_PATH), "manifest-schema", f"schema is unusable: {exc}")
        schema = None

    if args.site:
        if not args.theme:
            ap.error("--site needs --theme")
        check_site(pathlib.Path(args.site), args.theme, pathlib.Path(args.source) if args.source else None,
                   args.preview, report)
    else:
        manifests = load_manifests(root, report)
        if args.theme and args.theme not in manifests:
            report.fail(f"_data/themes/{args.theme}.json", "manifest-parse", "no such manifest")
        for stem, (path, data) in manifests.items():
            if args.theme and stem != args.theme:
                continue
            r = rel(root, path)
            if schema is not None:
                try:
                    for message in validate(data, schema, schema, "$"):
                        report.fail(r, "manifest-schema", message)
                except SchemaError as exc:
                    report.fail(rel(REPO_ROOT, SCHEMA_PATH), "manifest-schema", f"schema is unusable: {exc}")
            for where, value in walk_strings(data):
                if "<" in value or ">" in value:
                    report.fail(r, "manifest-schema", f"{where}: '<' and '>' are not allowed in manifest strings")
            check_identity(root, stem, path, data, manifests, report)
            theme_id = stem
            present, partials = check_files(root, theme_id, data, report)
            check_slot_files(root, theme_id, present, partials, report)
            check_tweaks(root, path, data, report)
            check_contrast(root, path, data, report)
            check_plain_language(root, path, data, report)
            check_css(root, theme_id, data, report)
        if not args.theme:
            check_orphans(root, manifests, report)
            check_config(root, manifests, report)
            check_fixture_overlays(root, manifests, report)
            if schema is not None:
                check_categories_doc(root, schema, report)

    if args.json:
        print(json.dumps({
            "failures": [{"path": p, "rule": r, "message": m} for p, r, m in report.failures],
            "warnings": [{"path": p, "rule": r, "message": m} for p, r, m in report.warnings],
        }, indent=2))
    else:
        for p, r, m in report.warnings:
            print(f"warning: {p}:[{r}] {m}", file=sys.stderr)
        for p, r, m in report.failures:
            print(f"{p}:[{r}] {m}")
    return 1 if report.failures else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
