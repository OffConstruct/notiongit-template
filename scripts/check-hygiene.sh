#!/usr/bin/env bash
#
# Deterministic hygiene scan for the notiongit-template repository.
#
# Rejects personal content and unsafe template artifacts: a CNAME file,
# non-placeholder content in the sync-managed _pages/_posts/_data
# directories (theme manifests in _data/themes/ excepted), private
# AI-assistant files, obvious secret patterns, unpinned third-party actions, and a
# README pin mention that disagrees with the workflow's actual pin. Matched
# secret values are never printed; only the file path and rule name are
# reported.
#
# Only tracked (or staged) files are scanned, matching what a checkout of
# the repository actually ships — the same scope scripts/check-neutral-config.sh
# uses via `git grep`. Local build output, vendored gems, and other untracked
# or gitignored files are out of scope.
#
# Usage: ./scripts/check-hygiene.sh [TARGET_DIR]   (defaults to the current directory)

set -euo pipefail

target="${1:-.}"
target="${target%/}"
[[ -z "$target" ]] && target="."

if ! git -C "$target" rev-parse --is-inside-work-tree > /dev/null 2>&1; then
  echo "hygiene: $target is not a git working tree" >&2
  exit 1
fi

failures=0

fail() {
  echo "hygiene: $1" >&2
  failures=1
}


# Only test-hygiene.sh is exempt from the secret-pattern scan: it
# intentionally embeds fake values shaped like each rule to prove the
# scanner rejects them. Nothing else — including README.md — gets a pass on
# secret patterns.
SECRET_ALLOWLIST=(
  "scripts/test-hygiene.sh"
)


is_secret_allowlisted() {
  local rel="$1" entry
  for entry in "${SECRET_ALLOWLIST[@]}"; do
    [[ "$rel" == "$entry" ]] && return 0
  done
  return 1
}

TRACKED_FILES=()
while IFS= read -r -d '' rel; do
  TRACKED_FILES+=("$rel")
done < <(git -C "$target" ls-files -z)

# 1. No CNAME file: custom domains belong to the provisioned site, not the template.
for rel in "${TRACKED_FILES[@]}"; do
  [[ "$rel" == "CNAME" ]] && fail "CNAME [cname]: custom-domain file must not be committed to the template"
done

# 2. _pages/, _posts/, and _data/ are sync-managed output. Only the
# documented .gitkeep placeholder may be committed there, plus theme
# manifests at _data/themes/<id>.json (the sync never writes or deletes them).
for rel in "${TRACKED_FILES[@]}"; do
  case "$rel" in
    _pages/*|_posts/*|_data/*)
      [[ "$(basename "$rel")" == ".gitkeep" ]] && continue
      [[ "$rel" =~ ^_data/themes/[a-z]{2,24}\.json$ ]] && continue
      fail "$rel [sync-managed-output]: ${rel%%/*}/ must contain only the .gitkeep placeholder"
      ;;
  esac
done


# 4. Private AI-assistant files must not be committed to the template.
# AGENTS.md is allowed: the template ships one that points coding agents at
# the theme docs, and it holds no private configuration.
PRIVATE_ASSISTANT_NAMES=(
  "CLAUDE.md"
  ".claude"
  ".cursor"
  ".cursorrules"
  ".codex"
  ".windsurfrules"
  ".aider.conf.yml"
  ".aider.chat.history.md"
  ".aider.input.history"
  "copilot-instructions.md"
)
# Case-insensitive: a checkout on a case-insensitive filesystem would
# collapse e.g. "Claude.md" onto "CLAUDE.md" anyway, so match the same way here.
for rel in "${TRACKED_FILES[@]}"; do
  IFS='/' read -ra parts <<< "$rel"
  for part in "${parts[@]}"; do
    for name in "${PRIVATE_ASSISTANT_NAMES[@]}"; do
      if [[ "${part,,}" == "${name,,}" ]]; then
        fail "$rel [private-assistant-file]: private assistant file must not be committed"
        continue 3
      fi
    done
  done
done

# 5. Obvious secret patterns. Reports the path and rule name only; the
# matched value is never printed.
SECRET_RULES=(
  "github-token:gh[opsu]_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{22,}"
  "aws-access-key:AKIA[0-9A-Z]{16}"
  "notion-token:secret_[A-Za-z0-9]{43}|ntn_[A-Za-z0-9]{20,}"
  "slack-token:xox[baprs]-[A-Za-z0-9-]{10,}"
  "private-key-block:-----BEGIN [A-Z ]*PRIVATE KEY-----"
)
for rel in "${TRACKED_FILES[@]}"; do
  is_secret_allowlisted "$rel" && continue
  for rule_entry in "${SECRET_RULES[@]}"; do
    rule_name="${rule_entry%%:*}"
    pattern="${rule_entry#*:}"
    if grep -IqE -e "$pattern" "$target/$rel" 2>/dev/null; then
      fail "$rel [$rule_name]: possible secret detected (value withheld)"
    fi
  done
done

# 6. Third-party actions and reusable workflows are pinned to a full commit
# SHA: the sync workflow runs with contents:write, so a moved upstream tag
# executes attacker code with those permissions. Local ./ refs are this
# repository and carry no upstream to move.
USES_LINE_RE='^[[:space:]]*(-[[:space:]]+)?uses:[[:space:]]*([^[:space:]]+)(.*)$'
VERSION_COMMENT_RE='#[[:space:]]*v?[0-9]+(\.[0-9]+)+'
quote="'"
for rel in "${TRACKED_FILES[@]}"; do
  case "$rel" in
    .github/workflows/*.yml|.github/workflows/*.yaml) ;;
    *) continue ;;
  esac
  while IFS= read -r line; do
    [[ "$line" =~ $USES_LINE_RE ]] || continue
    value="${BASH_REMATCH[2]}"
    rest="${BASH_REMATCH[3]}"
    value="${value%\"}"; value="${value#\"}"
    value="${value%$quote}"; value="${value#$quote}"
    [[ "$value" == ./* ]] && continue
    ref="${value##*@}"
    if [[ ! "$ref" =~ ^[0-9a-fA-F]{40}$ ]]; then
      fail "$rel [action-pin]: uses: '$value' must be pinned to a full 40-hex commit SHA"
    elif [[ ! "$rest" =~ $VERSION_COMMENT_RE ]]; then
      fail "$rel [action-pin]: uses: '$value' is pinned but has no version comment (expected '@<sha> # vX.Y.Z')"
    fi
  done < "$target/$rel"
done

# 7. The README's documented pin and version label for OffConstruct/notiongit-sync
# must match the workflow's actual pin and version comment, so a version bump
# can't update one and leave the other silently disagreeing (the hygiene scan
# only reads workflows).
workflow_sync_sha=""
workflow_sync_version=""
for rel in "${TRACKED_FILES[@]}"; do
  case "$rel" in
    .github/workflows/*.yml|.github/workflows/*.yaml) ;;
    *) continue ;;
  esac
  while IFS= read -r line; do
    [[ "$line" =~ uses:[[:space:]]*[\'\"]?OffConstruct/notiongit-sync@([0-9a-fA-F]{40}) ]] || continue
    workflow_sync_sha="${BASH_REMATCH[1]}"
    if [[ "$line" =~ \#[[:space:]]*(v[0-9]+(\.[0-9]+)+) ]]; then
      workflow_sync_version="${BASH_REMATCH[1]}"
    else
      # Rule 6 reports a missing version comment; clear it here so this pin is
      # not compared against a version carried over from an earlier line.
      workflow_sync_version=""
    fi
  done < "$target/$rel"
done

if [[ -n "$workflow_sync_sha" ]]; then
  readme_sync_sha=""
  readme_sync_version=""
  if [[ -f "$target/README.md" ]]; then
    match="$(grep -oE 'pinned to commit `[0-9a-fA-F]{40}`( \(v[0-9]+(\.[0-9]+)+\))?' "$target/README.md" | head -n1 || true)"
    if [[ -n "$match" ]]; then
      readme_sync_sha="$(grep -oE '[0-9a-fA-F]{40}' <<< "$match")"
      readme_sync_version="$(grep -oE 'v[0-9]+(\.[0-9]+)+' <<< "$match" || true)"
    fi
  fi
  if [[ -z "$readme_sync_sha" ]]; then
    fail "README.md [readme-pin-drift]: no 'pinned to commit <sha>' mention found for OffConstruct/notiongit-sync"
  elif [[ "$readme_sync_sha" != "$workflow_sync_sha" ]]; then
    fail "README.md [readme-pin-drift]: documented notiongit-sync pin ($readme_sync_sha) does not match the workflow pin ($workflow_sync_sha)"
  elif [[ -n "$workflow_sync_version" && "$readme_sync_version" != "$workflow_sync_version" ]]; then
    fail "README.md [readme-pin-drift]: documented notiongit-sync version (${readme_sync_version:-none}) does not match the workflow's version comment ($workflow_sync_version)"
  fi
fi

if (( failures != 0 )); then
  exit 1
fi

echo "Template hygiene checks passed."
