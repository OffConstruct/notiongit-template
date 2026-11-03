#!/usr/bin/env bash
#
# Documented local demonstration that scripts/check-hygiene.sh accepts a
# clean tree and rejects each forbidden artifact from issue #7. Every
# fixture is generated in an isolated temp directory and initialized as its
# own throwaway git repo (check-hygiene.sh only scans tracked/staged files);
# nothing here is ever committed to the template itself.
#
# Usage: ./scripts/test-hygiene.sh

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
checker="$repo_root/scripts/check-hygiene.sh"

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

failures=0

expect_pass() {
  local name="$1" dir="$2"
  if "$checker" "$dir" > /dev/null 2>&1; then
    echo "PASS: $name accepted as clean"
  else
    echo "FAIL: $name should have passed but was rejected" >&2
    failures=1
  fi
}

expect_fail() {
  local name="$1" dir="$2"
  if "$checker" "$dir" > /dev/null 2>&1; then
    echo "FAIL: $name should have been rejected but passed" >&2
    failures=1
  else
    echo "PASS: $name correctly rejected"
  fi
}

# A minimal clean tree: only the documented .gitkeep placeholders.
clean_case() {
  local dir="$1"
  mkdir -p "$dir"/_pages "$dir"/_posts "$dir"/_data
  : > "$dir"/_pages/.gitkeep
  : > "$dir"/_posts/.gitkeep
  : > "$dir"/_data/.gitkeep
  echo "clean" > "$dir"/index.html
}

# Turns the fixture directory into a throwaway git repo and stages every
# file, so check-hygiene.sh's tracked-file scan sees the fixture content.
stage() {
  local dir="$1"
  git init -q "$dir"
  git -C "$dir" add -A
}

dir="$work/clean"; clean_case "$dir"; stage "$dir"
expect_pass "clean template tree" "$dir"

dir="$work/cname"; clean_case "$dir"
echo "example.com" > "$dir"/CNAME
stage "$dir"
expect_fail "CNAME file" "$dir"

dir="$work/posts"; clean_case "$dir"
printf -- '---\ntitle: test\n---\nbody\n' > "$dir"/_posts/2024-01-01-test.md
stage "$dir"
expect_fail "populated _posts/" "$dir"

dir="$work/pages"; clean_case "$dir"
printf -- '---\ntitle: test\n---\nbody\n' > "$dir"/_pages/about.md
stage "$dir"
expect_fail "populated _pages/" "$dir"

dir="$work/data"; clean_case "$dir"
echo "title: My Site" > "$dir"/_data/home.yml
stage "$dir"
expect_fail "populated _data/ (sync-managed output)" "$dir"


dir="$work/assistant-file"; clean_case "$dir"
echo "instructions" > "$dir"/CLAUDE.md
stage "$dir"
expect_fail "private assistant file (CLAUDE.md)" "$dir"

dir="$work/assistant-dir"; clean_case "$dir"
mkdir -p "$dir"/.claude
echo "instructions" > "$dir"/.claude/settings.json
stage "$dir"
expect_fail "private assistant directory (.claude/)" "$dir"

dir="$work/assistant-file-case"; clean_case "$dir"
echo "instructions" > "$dir"/claude.md
stage "$dir"
expect_fail "private assistant file, case-variant (claude.md)" "$dir"


# Secret fixtures below use clearly fake, non-functional values that only
# match the expected format.
dir="$work/secret-github"; clean_case "$dir"
echo "token=ghp_$(printf 'x%.0s' {1..36})" > "$dir"/notes.txt
stage "$dir"
expect_fail "GitHub token pattern" "$dir"

dir="$work/secret-aws"; clean_case "$dir"
echo "key=AKIAABCDEFGHIJKLMNOP" > "$dir"/notes.txt
stage "$dir"
expect_fail "AWS access key pattern" "$dir"

dir="$work/secret-notion"; clean_case "$dir"
echo "token=ntn_$(printf '1%.0s' {1..30})" > "$dir"/notes.txt
stage "$dir"
expect_fail "Notion token pattern" "$dir"

dir="$work/secret-slack"; clean_case "$dir"
echo "token=xoxb-000000000000-000000000000-$(printf 'a%.0s' {1..24})" > "$dir"/notes.txt
stage "$dir"
expect_fail "Slack token pattern" "$dir"

dir="$work/secret-privatekey"; clean_case "$dir"
printf -- '-----BEGIN RSA PRIVATE KEY-----\nfake\n-----END RSA PRIVATE KEY-----\n' > "$dir"/notes.txt
stage "$dir"
expect_fail "private key block" "$dir"

# README.md must NOT get a pass on secret patterns.
dir="$work/secret-in-readme"; clean_case "$dir"
echo "key=AKIAABCDEFGHIJKLMNOP" > "$dir"/README.md
stage "$dir"
expect_fail "secret pattern inside README.md" "$dir"

dir="$work/action-pin-clean"; clean_case "$dir"
mkdir -p "$dir"/.github/workflows
cat > "$dir"/.github/workflows/ci.yml <<'EOF'
name: CI
on: push
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
      - uses: ./.github/actions/local
EOF
stage "$dir"
expect_pass "pinned and local action refs" "$dir"

dir="$work/action-pin-unpinned"; clean_case "$dir"
mkdir -p "$dir"/.github/workflows
cat > "$dir"/.github/workflows/ci.yml <<'EOF'
name: CI
on: push
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
EOF
stage "$dir"
expect_fail "unpinned third-party action ref" "$dir"

dir="$work/action-pin-no-comment"; clean_case "$dir"
mkdir -p "$dir"/.github/workflows
cat > "$dir"/.github/workflows/ci.yml <<'EOF'
name: CI
on: push
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1
EOF
stage "$dir"
expect_fail "pinned action ref without version comment" "$dir"

dir="$work/action-pin-nonversion-comment"; clean_case "$dir"
mkdir -p "$dir"/.github/workflows
cat > "$dir"/.github/workflows/ci.yml <<'EOF'
name: CI
on: push
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # see docs
EOF
stage "$dir"
expect_fail "pinned action ref with non-version comment" "$dir"

dir="$work/readme-pin-match"; clean_case "$dir"
mkdir -p "$dir"/.github/workflows
cat > "$dir"/.github/workflows/sync.yml <<'EOF'
name: Sync
on: push
jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: OffConstruct/notiongit-sync@d87bb7c034bcd770ad2c39bef59542a41588b448 # v2.0.1
EOF
echo 'pinned to commit `d87bb7c034bcd770ad2c39bef59542a41588b448` (v2.0.1).' > "$dir"/README.md
stage "$dir"
expect_pass "README pin matches workflow pin" "$dir"

dir="$work/readme-pin-drift"; clean_case "$dir"
mkdir -p "$dir"/.github/workflows
cat > "$dir"/.github/workflows/sync.yml <<'EOF'
name: Sync
on: push
jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: OffConstruct/notiongit-sync@d87bb7c034bcd770ad2c39bef59542a41588b448 # v2.0.1
EOF
echo 'pinned to commit `0000000000000000000000000000000000000000` (v2.0.1).' > "$dir"/README.md
stage "$dir"
expect_fail "README pin disagrees with workflow pin" "$dir"

dir="$work/readme-pin-version-drift"; clean_case "$dir"
mkdir -p "$dir"/.github/workflows
cat > "$dir"/.github/workflows/sync.yml <<'EOF'
name: Sync
on: push
jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: OffConstruct/notiongit-sync@d87bb7c034bcd770ad2c39bef59542a41588b448 # v2.1.0
EOF
echo 'pinned to commit `d87bb7c034bcd770ad2c39bef59542a41588b448` (v2.0.1).' > "$dir"/README.md
stage "$dir"
expect_fail "README version label disagrees with workflow version comment" "$dir"

dir="$work/readme-pin-missing"; clean_case "$dir"
mkdir -p "$dir"/.github/workflows
cat > "$dir"/.github/workflows/sync.yml <<'EOF'
name: Sync
on: push
jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: OffConstruct/notiongit-sync@d87bb7c034bcd770ad2c39bef59542a41588b448 # v2.0.1
EOF
echo 'No pin mention here.' > "$dir"/README.md
stage "$dir"
expect_fail "README missing the pin mention entirely" "$dir"

if (( failures != 0 )); then
  echo "hygiene fixture tests failed" >&2
  exit 1
fi

echo "All hygiene fixture tests passed."
