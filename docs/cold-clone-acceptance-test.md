# Cold-clone acceptance test

Closes the M1 release gate described in
notiongit-template#8:
prove the complete template contract by generating a fresh repository from
this template and building it with zero Notion secrets. This catches
failures a local Jekyll build cannot — template generation, default branch,
Actions behavior, and GitHub Pages configuration.

## Procedure

Run `scripts/cold-clone-acceptance-test.sh <org> [repo-name] [flags]` from a
clean checkout with `gh` authenticated against an account that can create
(and, for `--cleanup`, delete — requires the `delete_repo` token scope)
repositories in `<org>`. It:

1. Generates a disposable repository from `OffConstruct/notiongit-template` in
   the given org (`gh repo create --template`).
2. Confirms `default_branch: main`, `fork: false`, and that the initial
   commit tree matches the template exactly (no personal content, no
   `CNAME`, sync-managed directories empty).
3. Confirms `.github/workflows/template-check.yml` runs on the initial push
   and completes green (neutral-config check + Jekyll build).
4. Dispatches `.github/workflows/sync-notion.yml` (it's schedule-only, so it
   won't fire on its own) with no Notion secrets configured, and confirms it
   completes green as a no-op — the contract added in
   notiongit-sync#4.
5. Enables GitHub Pages (legacy build, `main` branch, `/` root) and waits for
   `status: built`.
6. Loads the reported Pages URL and confirms HTTP 200 plus (with
   `--simulate-provisioning`) that the stylesheet resolves instead of
   404ing.
7. Prints a plain-text evidence summary.
8. With `--cleanup`, deletes the disposable repository.

Manual equivalents of steps 2–6, if you need to run them by hand:

```sh
gh api repos/OWNER/REPO --jq '{fork,default_branch,has_pages}'
gh run list --repo OWNER/REPO
gh api repos/OWNER/REPO/pages --jq '{status,build_type,source}'
# then load the reported Pages URL in a browser
```

### `--simulate-provisioning`

`_config.yml` ships with `url: ""` and `baseurl: ""` on purpose — the
`_config.yml` header comment and README's "Provisioning ownership" section
both say the InkDrafts backend patches these at generation time, including
project-site (`owner.github.io/reponame/`) paths. This acceptance test
doesn't exercise that backend (out of scope per issue #8), so a raw clone
deployed to a project-site URL has a self-inflicted broken stylesheet: every
`relative_url`-based asset link in `_layouts`/`_includes` prepends
`site.baseurl`, which is empty, producing an absolute `/assets/themes/classic/theme.css`
that 404s at the Pages domain root instead of the repo's subpath.

`--simulate-provisioning` patches `_config.yml`'s `url`/`baseurl` in the
disposable repo the same way provisioning would, so the "renders without
broken assets" criterion can actually be checked end to end. This is a
faithful stand-in for that one backend responsibility, not a template
change — nothing in `main` is touched.

## Evidence — 2026-09-02/03 run

Disposable repo: `notiongit-template-coldclone-20260902` (disposable, since deleted)
(created 2026-09-02T23:59:52Z, **deleted after this evidence was captured**,
per the cleanup step below).

| Check | Result |
| --- | --- |
| `default_branch` | `main` |
| `fork` | `false` |
| Initial commit | single commit, tree matches template exactly, no personal content, no `CNAME` |
| `template-check.yml` on initial push | ✅ success, 36s (run 33697574062) |
| `sync-notion.yml`, zero secrets | ✅ success, 17s, no-op (run 33698564865) — see finding 1 |
| GitHub Pages | ✅ `status: built`, legacy build from `main`/`/`, `https://<owner>.github.io/notiongit-template-coldclone-20260902/` → HTTP 200 |
| Empty state renders | ✅ "SETUP IN PROGRESS" / "Your site is almost ready" / "Navigation will appear after the first sync" all present |
| Stylesheet, unpatched `_config.yml` | ❌ `/assets/css/main.css` → HTTP 404 (expected — see `--simulate-provisioning` above; the stylesheet has since moved to `/assets/themes/classic/theme.css`) |
| Stylesheet, after `--simulate-provisioning` | ✅ `/notiongit-template-coldclone-20260902/assets/css/main.css` → HTTP 200, `text/css` (path as of this run; now `assets/themes/classic/theme.css`) |

Total wall-clock time for the run, repo creation to final Pages verification:
~16 minutes, dominated by two GitHub Pages build cycles (~35–40s each) and
polling intervals rather than any single slow step.

### Finding 1 — `notiongit-sync@v1` did not exist (fixed live during this run)

The first `sync-notion.yml` dispatch
(run 33697639209)
failed at "Set up job":

> Unable to resolve action `OffConstruct/notiongit-sync@v1`, unable to find
> version `v1`

notiongit-sync#7
(a prerequisite of notiongit-template#3, closed) had merged the release
*process* but nobody had ever run it — no tags, no releases existed.
`CHANGELOG.md` already had a dated, ready `## [1.0.0]` section. With
explicit maintainer sign-off (this is a cross-repo, immutable production
release, outside notiongit-template's own scope), a dry run confirmed the
release would succeed cleanly, then `release.yml` was dispatched for real:
`v1.0.0`
was tagged and the `v1` alias moved to it. Re-running `sync-notion.yml`
after that then produced the green no-op recorded above.

**This was a real, blocking gap for every site this template generates, not
an artifact of the test setup** — it's fixed now, but flagging it here since
nothing in notiongit-template's own CI would have caught it before this
acceptance test ran.

### Finding 2 — `template-check.yml`'s neutral-config and hygiene checks broke on any real provisioned site (fixed)

`scripts/check-neutral-config.sh`, run by `.github/workflows/template-check.yml`
on every push to `main`, requires `_config.yml`'s `url:` and `baseurl:`
lines to be exactly `""`. That's correct for this template repository, but
`template-check.yml` is not excluded from what GitHub copies into generated
repositories — it's a normal tracked file, present in the disposable repo's
initial commit like everything else. Real provisioning **must** patch
`url`/`baseurl` to a non-empty value (that's the entire point of the
`_config.yml` comment and README's "Provisioning ownership" section), so on
every real generated site, the very first push after provisioning — and
every subsequent Notion sync commit (which also rewrites `title` and
`author.name`, two more fields the check pins to literal defaults) — would
make `template-check.yml`'s "Check neutral configuration" step fail
permanently.

Confirmed directly: patching `_config.yml` in the disposable repo (the
`--simulate-provisioning` step) triggered a new `template-check.yml` run
that failed at "Check neutral configuration"
(run 33698743304),
while `pages build and deployment` succeeded regardless — GitHub Pages'
legacy build is independent of Actions status, so this did **not** block
the "GitHub Pages reaches a successful deployment" criterion, but it did
mean every real deployed site ended up with a permanently red "Template
checks" workflow in its Actions tab. `scripts/check-hygiene.sh`'s rule 2
(sync-managed `_pages`/`_posts`/`_data` may only hold `.gitkeep`) has the
identical flaw for the same reason: a real Notion sync writes exactly the
content that rule forbids.

Filed as
notiongit-template#17,
then fixed directly: `template-check.yml`'s "Check template hygiene" and
"Check neutral configuration" steps now carry
`if: github.repository == 'OffConstruct/notiongit-template'`, so they still
gate this repository's own `main` but no longer run at all in a generated
repository. "Build site" (the Jekyll build) and the hygiene scanner's own
fixture tests stay unconditional — they don't depend on url/baseurl or
sync-managed content, so they're still a real, useful signal on generated
sites.

Confirmed live on the disposable repo: it predates
#15 (the hygiene
checks merged after it was generated), so only the neutral-config guard was
directly verifiable there — pushing the guarded workflow alongside the
still-patched, non-neutral `_config.yml` produced a green
`template-check.yml` run with "Check neutral configuration" correctly
skipped and "Build site" still passing
(run 33699949118).

## Cleanup

```sh
gh repo delete OWNER/REPO --yes
```

Requires the `delete_repo` token scope
(`gh auth refresh -h github.com -s delete_repo` if the call 403s). Only ever
target the disposable repository created in step 1 above — never an existing
user repository. `notiongit-template-coldclone-20260902` was
deleted immediately after the evidence in this document was captured.
