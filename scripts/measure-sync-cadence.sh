#!/usr/bin/env bash
# Measure the gap distribution between consecutive scheduled sync runs on a
# live generated site, and optionally split the distribution at a cutover
# timestamp to compare before/after a cron change (see issue #29, #33).
#
# Usage:
#   scripts/measure-sync-cadence.sh <owner/repo> [cutover_iso8601]
#
# Examples:
#   scripts/measure-sync-cadence.sh OWNER/REPO
#   scripts/measure-sync-cadence.sh OWNER/REPO 2026-09-05T19:55:27Z
set -euo pipefail

REPO="${1:?usage: measure-sync-cadence.sh <owner/repo> [cutover_iso8601]}"
CUTOVER="${2:-}"

gh api "repos/${REPO}/actions/runs" \
  --paginate \
  --method GET \
  -f event=schedule \
  -f status=completed \
  -f per_page=100 \
  --jq '.workflow_runs[].created_at' \
  | python3 "$(dirname "$0")/measure-sync-cadence.py" "$CUTOVER"
