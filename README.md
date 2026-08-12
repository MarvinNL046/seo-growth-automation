# SEO Growth Automation — Week 0 kit

This repository contains the shared, PR-first workflow for weekly SEO growth runs. It does not force a page every week: each run researches at least three opportunities and executes at most one evidence-backed action. A valid no-change research report is preferable to an unsupported page.

The reusable skill lives at `skills/weekly-seo-growth/`. It includes the canonical prompt, a versioned 99-check snapshot of the Obsidian “80+ Point Checklist”, guarded DataForSEO scripts, a cannibalisation check, and per-site templates.

## Safety defaults

- No script calls a paid DataForSEO endpoint without `--confirm-paid-api`.
- `--dry-run` shows the endpoint and request count without credentials or network access.
- Research scripts only write below the explicit `--out` directory.
- Credentials are read only from `DATAFORSEO_BASE64` or `DATAFORSEO_LOGIN` + `DATAFORSEO_PASSWORD`.
- Logs never contain authorization headers or request bodies.
- Existing same-day artifacts block a repeated paid call unless `--force` is supplied deliberately.
- The first three runs for each site are PR-only. Mortgage and loan sites remain PR-only.

## Requirements

- Node.js 22.18 or newer (Node 24 is recommended).
- A clean Git checkout for every site that will run automatically.
- GSC data or export access for measurement. The routine may perform DataForSEO-only research when GSC is unavailable, but must record that limitation.
- DataForSEO credentials supplied by the task environment, never committed to a site repository.

No package install is required; the scripts use Node's built-in APIs.

For GSC, set `GSC_OAUTH_CREDENTIALS` to an ignored Google OAuth
`authorized_user` JSON file with read-only Search Console scope. The scripts
read the path at runtime and never copy or print the credential.

## Verify the kit

From this directory:

```powershell
npm test
npm run validate-profile -- --profile skills/weekly-seo-growth/assets/site-profile.template.json
```

The tests are offline and make no API calls.

## Create a site growth folder

Copy these assets into a site's `docs/growth/` directory and commit them on a setup branch:

- `site-profile.template.json` → `site-profile.json`
- `registers/keywords.csv`
- `registers/urls.csv`
- `registers/runs.csv`
- `run-report.template.md`

Fill the profile with real commands, paths, publication policy, source policy, target market, and topic filters. Validate it before scheduling:

```powershell
npm run validate-profile -- --profile C:\path\to\site\docs\growth\site-profile.json
```

## Research commands

Preview the four 28/56-day GSC comparison windows without credentials or API
calls:

```powershell
npm run gsc-baseline -- --profile C:\path\to\site\docs\growth\site-profile.json --out C:\path\to\site\docs\growth\research --dry-run
```

Fetch totals plus bounded query/page rows after reviewing the plan:

```powershell
npm run gsc-baseline -- --profile C:\path\to\site\docs\growth\site-profile.json --out C:\path\to\site\docs\growth\research --confirm-read-api
```

Preview keyword discovery without network access or cost:

```powershell
npm run discover -- --profile C:\path\to\site\docs\growth\site-profile.json --out C:\path\to\site\docs\growth\research --dry-run
```

Run discovery after reviewing the dry run:

```powershell
npm run discover -- --profile C:\path\to\site\docs\growth\site-profile.json --out C:\path\to\site\docs\growth\research --confirm-paid-api
```

Deep-validate three shortlisted keywords with live overview and SERP/PAA data:

```powershell
npm run validate-keywords -- --profile C:\path\to\site\docs\growth\site-profile.json --out C:\path\to\site\docs\growth\research --keyword "candidate one" --keyword "candidate two" --keyword "candidate three" --confirm-paid-api
```

Check cannibalisation before assigning a URL:

```powershell
npm run check-cannibalization -- --register C:\path\to\site\docs\growth\registers\keywords.csv --candidate "candidate keyword"
```

Exit code `2` means a live primary or secondary keyword blocks a new page. Warnings require human review.

## Codex scheduled-task installation

1. Add/open the website checkout as a local Codex project.
2. Test one complete run manually.
3. Create a local scheduled task with worktree isolation enabled.
4. Set its instruction to read the absolute `SKILL.md`, then supply the site's profile path:

```text
Read and follow C:\Users\M_Smi\projecten\seo-growth-automation\skills\weekly-seo-growth\SKILL.md completely.
Run the weekly SEO growth workflow for the site profile at C:\path\to\site\docs\growth\site-profile.json.
Work in an isolated worktree, create at most one evidence-backed change, and stop after opening a PR. Never merge or deploy.
```

Keep the desktop app open and the computer awake for local runs. Do not activate automation for a site until its Week-0 readiness gates in the skill pass.

## Claude Desktop routine installation

1. Open **Routines → New routine → Local**.
2. Choose the website checkout as the folder and enable its worktree option.
3. Use the same instruction block above with the correct profile path.
4. Click **Run now** once, approve only the narrow commands required by that site, and inspect the PR/report.
5. Save permissions only for read-only research, tests/builds, branch commits, push of the task branch, and PR creation. Do not approve merge, production deploy, DNS, billing, or credential-management actions.

Local Claude routines also require the desktop app to remain open and the machine awake. Use a remote routine only when it starts from a verified canonical Git repository and cannot encounter an out-of-date local checkout.

## Current portfolio activation order

Ready for a controlled pilot after profiles and GSC access are configured: UnscrambleQuick, MortgageCalcFast, ImageCompressly, LoanCalcFast, and PassGenFast.

Foundation work is required before recurring growth changes:

- NameSpinly: resolve the dirty worktree, add a verified remote/rollback path, real routes, and route-derived sitemap coverage.
- RandomWordly: restore the source repository, Git history, and tests; compiled archives are not an automation source.
- FreeQRFast: identify the canonical up-to-date repository/checkout before choosing local versus remote execution.

## Updating the Obsidian snapshot

The snapshot is intentionally immutable during a growth run. When the vault checklist changes:

1. Review the diff manually.
2. Copy the complete updated checklist into `references/seo-checklist.snapshot.md`.
3. Update `references/seo-checklist.provenance.json` with its new SHA-256, item count, category counts, source modified time, and snapshot date.
4. Update the machine-readable checklist JSON.
5. Run `npm test` and commit the snapshot change as its own reviewable change.

Do not silently read a newer checklist halfway through a scheduled run; that makes historical compliance reports irreproducible.
