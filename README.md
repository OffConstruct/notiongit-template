# Your Notion site

This repository is your website. Edit the content in Notion; GitHub Actions
copies published pages and posts here, and GitHub Pages publishes the result.

The reusable template code is released under the [MIT License](LICENSE). See
[`CONTRIBUTING.md`](CONTRIBUTING.md) for maintainer setup, generated-file
boundaries, validation commands, and security reporting.

## Licensing and generated content

The MIT license covers the reusable template code, including the layouts,
includes, stylesheet, and generic configuration. It is compatible with the
MIT-licensed presentation layer imported from the source revision documented
in the repository history. The directly declared Jekyll/GitHub Pages
dependencies are separate components and retain their own licenses and
notices.

Repositories generated from this template are not automatically covered by
one license. The person or organization using the template retains rights to
content they provide or sync from Notion, including posts, pages, metadata,
and media. That content is not automatically relicensed under MIT. Generated
site owners may customize and redistribute the template code under MIT while
preserving the copyright and license notice and honoring third-party terms.

## Start here

### Publish something

1. Open the Pages or Posts database in your connected Notion workspace.
2. Edit a row while its `Status` is `Draft`.
3. When it is ready, change `Status` to `Published`.
4. To publish now, open the **Actions** tab, choose **Sync Notion → Jekyll**,
   select **Run workflow**, and run it with `allow_bulk_delete` off. A manual
   run starts right away instead of waiting in GitHub's schedule queue, and
   the site updates a few minutes after it finishes. Otherwise the scheduled
   sync picks the change up on its own.
5. Open the live-site link shown in your repository's **Settings → Pages**.

Posts use `Publish Date` to control their date; if it is blank, the sync uses
today's date. A page or post can be published without being added to the
navigation; for pages, check `Show in Nav` when you want it in the header. Keep
each `Slug` unique and URL-safe because it becomes part of the page URL.

GitHub Actions attempts a sync every 10 minutes, but under load GitHub can
delay or skip a scheduled run by hours rather than minutes, so the schedule
is best-effort. A second workflow, **Sync watchdog**, backs it up: whenever
the last sync attempt is more than about 90 minutes old, the watchdog starts
a fresh sync for you. Even so, don't wait on a fixed clock: open the
**Actions** tab to see the latest run, or select **Run workflow** to sync
immediately. The repository remains the source of truth for the site, and it
continues to work if InkDrafts is unavailable after provisioning.

### What the sync changes

The Action synchronizes these files from Notion:

- `_pages/` — published Pages rows, except the `home` row.
- `_posts/` — published Posts rows.
- `_data/home.yml` — home-page profile and biography.
- `_data/nav.yml` — navigation items.
- `_config.yml` — only the site `title` and `author.name` lines.

Do not edit those generated files by hand. Your next sync can overwrite them.
Edit the corresponding Notion row instead. Provisioning owns `_config.yml`'s
`url` and `baseurl`; do not replace them with a custom value unless you are
manually maintaining the site.

### Check sync status or run it again

Open the repository's **Actions** tab and choose **Sync Notion → Jekyll**.
Each run shows whether content changed and includes a short run summary.

To sync now, select **Run workflow** and start it with `allow_bulk_delete`
turned off. A manual run starts right away instead of waiting in GitHub's
schedule queue, so use it after publishing something you want live. When a
scheduled run goes missing instead, the **Sync watchdog** workflow notices
and re-runs the sync for you within about 90 minutes.

If syncs ever stop entirely after a long quiet period, check whether GitHub
disabled the repository's scheduled workflows: GitHub turns them off
automatically after 60 days without repository activity, and a Notion-only
publishing flow can go that long without a commit. Re-enabling them is a
one-click action on the **Actions** screen.

If a run is red, open the run and read the failed step. A missing token or
database ID is treated as a safe, green no-op before any files are changed;
other failures need attention before retrying. Do not put a Notion token or
private workspace content in an issue, log, or support message.

### Bulk-delete protection and recovery

The sync protects the repository from a damaged or incomplete Notion response.
It stops before deleting files when Notion reports no published rows while
tracked generated files exist, or when a run would delete an unusually large
share of generated files. The normal workflow then makes no commit.

If that stop was unexpected:

1. Confirm the Notion integration is still connected to both databases.
2. Confirm the intended rows still have `Status: Published`.
3. Restore any accidentally removed `Slug`, `Publish Date`, or database
   access, then run the workflow again.

Only enable `allow_bulk_delete` when you intentionally unpublished most or all
of the generated content and have checked the result in Notion. If an unwanted
sync commit was already made, use the repository's Git history to identify it
and revert it, then correct Notion and run a fresh sync. Generated files should
not become a second, conflicting source of truth.

### Images

Use stable, externally hosted image URLs for profile pictures, cover images,
and images in page or post content. Notion-hosted file URLs expire, so an image
that works immediately after publishing can later disappear. Never paste a
private URL or a credential into a public page.

### Custom domains

A custom domain is configured on the generated repository, not in this
template. In **Settings → Pages**, enter the domain under **Custom domain** and
follow GitHub's verification instructions. Configure DNS as GitHub documents:
an apex domain uses the GitHub Pages A/AAAA records, while a subdomain such as
`www.example.com` uses a CNAME to the Pages hostname shown by GitHub.

Do not add a `CNAME` file to this template. GitHub Pages and provisioning own
that setting for the generated repository. See GitHub's [custom domain
documentation](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site).

## Manual setup (developers)

InkDrafts normally performs these steps for you. Use this appendix if you are
installing the template without the provisioning service.

### 1. Generate the repository

Create a public repository from the template using GitHub's **Use this
template** button, or with GitHub CLI:

```sh
gh repo create OWNER/REPOSITORY --template OffConstruct/notiongit-template --public
```

Keep the generated repository's default branch as `main`. The template is
intentionally neutral: it contains no personal posts, pages, custom domain,
Notion data, or Notion-hosted image URLs.

### 2. Create and share the Notion databases

Create one Pages database and one Posts database in Notion, then share both
with the Notion integration that will perform the sync. The database names do
not matter; the property names and types do.

Pages database:

| Property | Type | Notes |
| --- | --- | --- |
| `Title` | Title | Page name and heading |
| `Slug` | Rich text | URL-safe path segment; defaults from the title |
| `Type` | Select | `home`, `blog-list`, `blog`, or `markdown` |
| `Nav Order` | Number | Lower numbers appear first |
| `Show in Nav` | Checkbox | Adds the page to site navigation |
| `Status` | Select | The row must be `Published` to sync; use `Draft` while editing |
| `Description` | Rich text | Optional page description |
| `Name` | Rich text | Home display name; also sets site title and author name |
| `Profile Picture` | Rich text | Home profile image URL; use an external URL |
| `Tagline` | Rich text | Optional home-page tagline |
| `Social Links` | Rich text | One `Name: URL` pair per line |

Posts database:

| Property | Type | Notes |
| --- | --- | --- |
| `Title` | Title | Post title |
| `Slug` | Rich text | URL-safe post slug; defaults from the title |
| `Status` | Select | The row must be `Published` to sync |
| `Publish Date` | Date | Used for the post date and filename |
| `Tags` | Multi-select | Optional post tags |
| `Description` | Rich text | Optional excerpt |
| `Cover Image` | Files & media | Prefer an external image URL because Notion file URLs expire |
| `Canonical URL` | URL | Optional canonical link |
| `Featured` | Checkbox | Optional featured flag |

The sync also reads the page body. A Pages row with `Type: home` supplies the
home biography; other Pages rows become site pages. A Posts row becomes a blog
post. The action accepts common capitalization and a few legacy aliases, but
the names above are the recommended schema.

### 3. Add repository secrets

Create a Notion integration, copy its token through a secure prompt, and make
sure it has access to the databases. Add these GitHub Actions secrets under
**Settings → Secrets and variables → Actions**:

| Secret | Value |
| --- | --- |
| `NOTION_TOKEN` | The integration token |
| `NOTION_PAGES_DATABASE_ID` | The Pages database ID |
| `NOTION_POSTS_DATABASE_ID` | The Posts database ID |

At least one database ID is required alongside `NOTION_TOKEN`; using both is
recommended. A posts-only installation may use the legacy
`NOTION_DATABASE_ID` name instead of `NOTION_POSTS_DATABASE_ID`.

With GitHub CLI, set each value interactively so tokens do not appear in shell
history or command output:

```sh
gh secret set NOTION_TOKEN --repo OWNER/REPOSITORY
gh secret set NOTION_PAGES_DATABASE_ID --repo OWNER/REPOSITORY
gh secret set NOTION_POSTS_DATABASE_ID --repo OWNER/REPOSITORY
```

### 4. Configure GitHub Pages

In the generated repository, open **Settings → Pages** and select:

- **Source:** Deploy from a branch
- **Branch:** `main`
- **Folder:** `/ (root)`

For a project site, set the URL values in `_config.yml` before the first build:

```yaml
url: "https://OWNER.github.io"
baseurl: "/REPOSITORY"
```

Use `baseurl: ""` for a user site named `OWNER.github.io`. InkDrafts sets these
values during provisioning; a manual installation must set them itself so
stylesheet and page links work under a project-site path.

This template is built with GitHub Pages' Jekyll environment and the
`github-pages` gem. The included workflow writes synchronized files to `main`;
Pages then builds that branch. The site's URL appears in the Pages settings.
For a user site it normally follows `https://OWNER.github.io/`; for a project
site it normally follows `https://OWNER.github.io/REPOSITORY/`.

The workflow uses the reusable
[`OffConstruct/notiongit-sync`](https://github.com/OffConstruct/notiongit-sync)
Action, pinned to commit `d87bb7c034bcd770ad2c39bef59542a41588b448` (v2.0.1),
and needs write permission for repository contents. The checked-in workflows
are the complete configuration: `sync-notion.yml` performs every sync, and
`sync-watchdog.yml` only re-triggers it when the schedule stalls. It has no
Notion access and cannot write site files. Do not add your own sync
workflows: a second path writing site content cannot conflict-check against
Notion the way the sync's bulk-delete protection does.

### 5. Local verification

From a checkout with Ruby and Bundler installed:

```sh
bundle install
./scripts/check-neutral-config.sh
./scripts/check-hygiene.sh
bundle exec jekyll build
git diff --check
```

The build creates `_site/`, which is ignored and should not be committed.

## Security

Generated repositories inherit no security settings from this template. Turn
on secret scanning with push protection so a token pasted into your Notion
content fails the push instead of landing in git history. Open
**Settings → Code security**, then enable **Secret scanning** and **Push
protection**.

GitHub's scanner matches known provider token formats. Base64-encoded values
and tokens split across multiple lines are not detected. That is GitHub's
detection boundary.

InkDrafts runs secret scanning with push protection and Dependabot alerts on
its own repositories (`notiongit`, `notiongit-sync`, and this template) and
restricts their GitHub Actions to an explicit allowlist. InkDrafts does not
scan generated site content for malware. Site content lives in your
repository, where GitHub's Acceptable Use Policy applies, as described in the
InkDrafts [acceptable-use policy](https://inkdrafts.com/acceptable-use). That
decision is revisited only if GitHub's enforcement proves insufficient in a
real incident.

## Help and service status

For product information and InkDrafts support, visit
[inkdrafts.com](https://inkdrafts.com/). For this public template's technical
questions, use the [template issue tracker](https://github.com/OffConstruct/notiongit-template/issues).
For GitHub platform incidents, check [GitHub
Status](https://www.githubstatus.com/); for a site-specific result, check the
repository's Actions and Pages screens first.

After provisioning, your site is an ordinary repository and GitHub Pages site
in your account. It does not require InkDrafts to keep serving content; these
links are support and troubleshooting references, not runtime dependencies.
