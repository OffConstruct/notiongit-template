#!/usr/bin/env bash
# Cold-clone acceptance test for notiongit-template (issue #8).
#
# Generates a disposable repository from this template, verifies main/fork
# status, confirms the Notion sync workflow completes green as a no-op with
# zero secrets, enables legacy GitHub Pages, and confirms the empty state
# deploys and renders without broken assets. Prints a plain-text evidence
# report you can paste into a PR or issue.
#
# Requires: gh (authenticated with repo + workflow scopes), curl, jq.
#
# Usage:
#   scripts/cold-clone-acceptance-test.sh <org> [repo-name] [flags]
#
# Flags:
#   --simulate-provisioning   Patch _config.yml's url/baseurl in the disposable
#                             repo to match its actual Pages URL, the same way
#                             InkDrafts' provisioning backend does for a
#                             project-site deployment. Needed to fully satisfy
#                             the "renders without broken assets" criterion for
#                             a repo that isn't named <org>.github.io. Skipping
#                             this flag leaves _config.yml untouched, which is
#                             the true zero-config cold-clone result but will
#                             show a 404'd stylesheet for a project-site URL.
#   --cleanup                 Delete the disposable repository once evidence
#                             has been captured. Requires the gh token to have
#                             the delete_repo scope (gh auth refresh -s delete_repo).
#   --template <owner/repo>   Template to generate from. Default:
#                             OffConstruct/notiongit-template.
#
# Example:
#   scripts/cold-clone-acceptance-test.sh inkdrafts "" --simulate-provisioning --cleanup

set -euo pipefail

ORG="${1:?usage: $0 <org> [repo-name] [--simulate-provisioning] [--cleanup] [--template owner/repo]}"
shift || true

REPO=""
if [[ $# -gt 0 && "$1" != --* ]]; then
  REPO="$1"
  shift
fi
[[ -z "$REPO" ]] && REPO="notiongit-template-coldclone-$(date -u +%Y%m%d%H%M%S)"

TEMPLATE="OffConstruct/notiongit-template"
SIMULATE_PROVISIONING=0
CLEANUP=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --simulate-provisioning) SIMULATE_PROVISIONING=1 ;;
    --cleanup) CLEANUP=1 ;;
    --template) TEMPLATE="$2"; shift ;;
    *) echo "Unknown flag: $1" >&2; exit 1 ;;
  esac
  shift
done

TARGET="${ORG}/${REPO}"
WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

log() { printf '\n=== %s ===\n' "$1"; }
wait_for_run() {
  # wait_for_run <repo> <run-id> -> prints final conclusion
  local repo="$1" run_id="$2" status conclusion
  while true; do
    status="$(gh run view "$run_id" --repo "$repo" --json status --jq .status)"
    [[ "$status" == "completed" ]] && break
    sleep 10
  done
  conclusion="$(gh run view "$run_id" --repo "$repo" --json conclusion --jq .conclusion)"
  echo "$conclusion"
}

log "Creating disposable repo ${TARGET} from ${TEMPLATE}"
gh repo create "$TARGET" --template "$TEMPLATE" --public \
  --description "DISPOSABLE cold-clone acceptance test for notiongit-template#8 - safe to delete"

log "Repo metadata"
gh api "repos/${TARGET}" --jq '{fork,default_branch,has_pages,visibility}'

log "Waiting for the initial-commit Template checks run"
sleep 5
INIT_RUN="$(gh run list --repo "$TARGET" --workflow=template-check.yml --limit 1 --json databaseId --jq '.[0].databaseId')"
INIT_CONCLUSION="$(wait_for_run "$TARGET" "$INIT_RUN")"
echo "template-check.yml (initial commit): $INIT_CONCLUSION"

log "Triggering sync-notion.yml with zero Notion secrets configured"
gh workflow run sync-notion.yml --repo "$TARGET" -f allow_bulk_delete=false
sleep 5
SYNC_RUN="$(gh run list --repo "$TARGET" --workflow=sync-notion.yml --limit 1 --json databaseId --jq '.[0].databaseId')"
SYNC_CONCLUSION="$(wait_for_run "$TARGET" "$SYNC_RUN")"
echo "sync-notion.yml (no secrets): $SYNC_CONCLUSION"
if [[ "$SYNC_CONCLUSION" != "success" ]]; then
  echo "Sync workflow did not complete green. Inspect: gh run view $SYNC_RUN --repo $TARGET --log" >&2
fi

log "Enabling legacy GitHub Pages from main /"
gh api -X POST "repos/${TARGET}/pages" -f "build_type=legacy" -f "source[branch]=main" -f "source[path]=/" >/dev/null

if [[ "$SIMULATE_PROVISIONING" -eq 1 ]]; then
  log "Simulating provisioning: patching _config.yml url/baseurl for a project-site deployment"
  CUR_SHA="$(gh api "repos/${TARGET}/contents/_config.yml" --jq '.sha')"
  gh api "repos/${TARGET}/contents/_config.yml" --jq '.content' | base64 -d > "${WORKDIR}/_config.yml"
  sed -i \
    -e "s#^url: \"\"#url: \"https://${ORG}.github.io\"#" \
    -e "s#^baseurl: \"\"#baseurl: \"/${REPO}\"#" \
    "${WORKDIR}/_config.yml"
  base64 -w0 "${WORKDIR}/_config.yml" > "${WORKDIR}/_config.b64"
  jq -n --arg msg "test: patch url/baseurl to simulate provisioning for cold-clone acceptance test" \
    --rawfile content "${WORKDIR}/_config.b64" --arg sha "$CUR_SHA" --arg branch "main" \
    '{message:$msg, content:($content | rtrimstr("\n")), sha:$sha, branch:$branch}' > "${WORKDIR}/payload.json"
  gh api -X PUT "repos/${TARGET}/contents/_config.yml" --input "${WORKDIR}/payload.json" \
    --jq '{commit:.commit.sha}'
  echo "NOTE: this will make template-check.yml's neutral-config check fail on this push -- known, see the acceptance-test doc."
fi

log "Waiting for a Pages build to report status=built"
for _ in $(seq 1 30); do
  PAGES_STATUS="$(gh api "repos/${TARGET}/pages" --jq '.status')"
  [[ "$PAGES_STATUS" == "built" ]] && break
  sleep 10
done
gh api "repos/${TARGET}/pages" --jq '{status,build_type,html_url}'

PAGES_URL="$(gh api "repos/${TARGET}/pages" --jq '.html_url')"
log "Checking ${PAGES_URL}"
HTTP_CODE="$(curl -s -o /dev/null -w '%{http_code}' "$PAGES_URL")"
echo "Pages URL: $PAGES_URL -> HTTP $HTTP_CODE"
CSS_HREF="$(curl -s "$PAGES_URL" | grep -Eo '/[^"]*main\.css' | head -1)"
if [[ -n "$CSS_HREF" ]]; then
  CSS_CODE="$(curl -s -o /dev/null -w '%{http_code}' "https://$(echo "$PAGES_URL" | sed -E 's#https?://([^/]+)/.*#\1#')${CSS_HREF}")"
  echo "Stylesheet ${CSS_HREF} -> HTTP $CSS_CODE"
fi

log "Summary"
echo "Repo:              https://github.com/${TARGET}"
echo "Default branch:    $(gh api "repos/${TARGET}" --jq '.default_branch') (fork: $(gh api "repos/${TARGET}" --jq '.fork'))"
echo "template-check.yml (initial commit): $INIT_CONCLUSION"
echo "sync-notion.yml (no secrets):         $SYNC_CONCLUSION"
echo "Pages:              $PAGES_URL ($HTTP_CODE)"

if [[ "$CLEANUP" -eq 1 ]]; then
  log "Deleting disposable repo ${TARGET}"
  gh repo delete "$TARGET" --yes
  echo "Deleted."
else
  echo
  echo "Cleanup skipped. Delete manually when done: gh repo delete ${TARGET} --yes"
fi
