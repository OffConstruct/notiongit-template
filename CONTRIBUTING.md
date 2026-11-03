# Contributing to NotionGit template

Thanks for helping maintain the reusable NotionGit Jekyll template. Keep
changes focused on the template itself: a fresh repository generated from it
must build with no personal content, custom domain, secrets, or required
Notion data.

## Development setup

Use Ruby and Bundler locally. The CI build currently uses Ruby 3.1.

```sh
bundle install
./scripts/test-hygiene.sh
./scripts/check-hygiene.sh
./scripts/check-neutral-config.sh
bundle exec jekyll build
git diff --check
git status --short
```

The build writes `_site/`, which is ignored and must not be committed. Review
the final `git status --short` output and ensure no generated or unexpected
files were added. The cold-clone procedure in
[`docs/cold-clone-acceptance-test.md`](docs/cold-clone-acceptance-test.md)
covers template generation and GitHub Pages behavior; it requires an
authenticated `gh` installation and should only use disposable repositories.

## Template boundaries

The following directories are sync-managed output. Do not add hand-written
content or fixtures to them:

- `_pages/`
- `_posts/`
- `_data/home.yml`
- `_data/nav.yml`

Keep only the existing `.gitkeep` placeholders in an otherwise clean
checkout. Do not add `CNAME`, personal posts or pages, populated generated
data, private workspace content, expiring Notion-hosted image URLs, tokens,
private keys, or private assistant configuration.

The browser runtime is deliberately pure HTML and CSS. Do not add client-side
JavaScript. Jekyll extensions must be available in GitHub Pages safe mode and
must be declared through the `github-pages`-compatible dependency set in the
`Gemfile`; do not add custom Ruby plugins.

## Bumping a pinned action

Every third-party `uses:` in `.github/workflows/` is pinned to a full 40-hex
commit SHA with a `# vX.Y.Z` comment; the hygiene scan's `action-pin` rule
fails the build otherwise, because the sync workflow runs with
`contents: write` and a moved tag would execute with that permission. To bump
a pin:

1. Resolve the new release's commit SHA from the GitHub API, not from the tag
   name alone:

   ```sh
   gh api repos/OWNER/REPO/git/refs/tags/vX.Y.Z --jq '.object.sha'
   ```

   If the tag is annotated (`"type": "tag"` in the response), resolve the
   commit it points at:

   ```sh
   gh api repos/OWNER/REPO/git/tags/<sha-from-above> --jq '.object.sha'
   ```

2. Cross-check that SHA against `git ls-remote`'s peeled ref, which always
   resolves to the commit even for an annotated tag:

   ```sh
   git ls-remote https://github.com/OWNER/REPO vX.Y.Z^{}
   ```

   Only use the SHA once both commands agree.

3. Update the `uses:` line's SHA and its `# vX.Y.Z` comment in the same edit
   so they can't disagree mid-review.

4. If the action is `OffConstruct/notiongit-sync`, also update the matching
   "pinned to commit `<sha>`" mention in README.md. The hygiene scan's
   `readme-pin-drift` rule fails the build if the two disagree.

5. Run `./scripts/test-hygiene.sh` and `./scripts/check-hygiene.sh` before
   opening the pull request.

## Measuring sync cadence

`scripts/measure-sync-cadence.sh <owner/repo> [cutover_iso8601]` pulls a live
generated site's scheduled sync-run history and reports the gap distribution
between consecutive runs (median, mean, p90, p99, percent over 4h). Pass a
cutover timestamp to split the distribution into before/after and compare a
cron change's effect, as in #29 and #33.

## Licensing and generated sites

The reusable template code is released under the [MIT License](LICENSE).
That includes the layouts, includes, stylesheet, and generic template
configuration contributed here. The presentation layer was copied from the
MIT-licensed source revision documented in [`README.md`](README.md), so the
copyright and license notice must remain with substantial copies.

When this template generates a repository, the site owner retains ownership
of content they provide or sync from Notion, including posts, pages, metadata,
and media. The MIT license does not automatically relicense that content.
Owners may customize their generated repository and may reuse or redistribute
the template code under the MIT License, subject to preserving its required
notice and respecting any separate third-party terms.

The Gemfile dependencies and GitHub Actions used by this repository are
separate components. Their own licenses and notices continue to apply; this
repository's MIT license does not grant rights to third-party code beyond
those terms.

## Issues and pull requests

Open an issue for a reproducible bug, security-neutral improvement, or clearly
scoped template change. Include the expected behavior, the smallest useful
reproduction, and relevant command output. For pull requests, explain the
decision, list affected files, and record the checks you ran. Keep generated
content and unrelated refactors out of the change, and confirm that the diff
contains no secrets or personal data.

## Security reports

Please report suspected vulnerabilities privately through the repository's
[GitHub Security Advisories page](https://github.com/OffConstruct/notiongit-template/security/advisories/new).
Do not open a public issue for an unpatched vulnerability. If a secret is
accidentally committed, revoke or rotate it immediately and include only the
minimum necessary details in the private report.
