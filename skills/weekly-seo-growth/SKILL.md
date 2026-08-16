---
name: weekly-seo-growth
description: Research and execute a safe weekly SEO growth action for a tool or calculator website using GSC evidence, guarded DataForSEO discovery and live SERP validation, cannibalisation checks, a versioned 99-item on-page checklist, tests, and PR-only delivery. Use for scheduled SEO routines, Week-0 site readiness, keyword/page opportunity selection, content refreshes, internal-link improvements, technical SEO repairs, tool UX improvements, or a new landing page only when search intent is uniquely supported.
---

# Weekly SEO growth

Execute at most one evidence-backed action. Never force a new page to satisfy a schedule.

## Load the required context

1. Read the site's `site-profile.json`, all three registers, and any prep brief in
   `docs/growth/research/`.
2. Read [master-prompt.md](references/master-prompt.md).
3. Read [seo-checklist.provenance.json](references/seo-checklist.provenance.json) and [seo-checklist.snapshot.md](references/seo-checklist.snapshot.md) completely before implementation.
4. For tools, read [tool-site-overlay.md](references/tool-site-overlay.md).
5. For mortgage or loan content, also read [ymyl-source-policy.md](references/ymyl-source-policy.md).

Stop if any required file is absent or malformed.

## Week-0 readiness gate

Verify all of these before enabling a recurring task:

- Identify the canonical source repository, remote, production branch, hosting target, and rollback path.
- Require a clean or fully explained worktree and a reproducible install/test/build path.
- Inventory existing indexable URLs, canonicals, sitemap entries, primary keywords, schemas, and internal links.
- Initialize keyword, URL, and run registers without inventing historical data.
- Confirm the task can create an isolated worktree/branch and open a PR without merging.
- Confirm GSC access or record `unavailable` in the profile.
- Validate DataForSEO configuration with `--dry-run`; do not spend API credit during Week 0 unless explicitly authorized.
- Record baseline windows of 28 and 56 days when GSC data exists.

Do not schedule growth implementation while the canonical source or rollback path is uncertain.

## Weekly run

1. **Preflight.** Inspect Git status, previous run, profile, credentials presence, build commands, source freshness, and same-week duplicate guard. Never reveal credentials.
2. **Measure.** Capture available GSC query/page metrics for the latest comparable 28- and 56-day windows with `scripts/gsc-baseline.ts`. Preview with `--dry-run`, then use `--confirm-read-api`. Label incomplete data explicitly.
3. **Discover.** Research at least three candidates. A prep brief in `docs/growth/research/` is evidence an earlier run already paid for: if one covers the keywords in hand and its collection date still stands, reuse it, cite that date, and record that discovery was skipped for this reason. Buy the same data again only when the brief is stale, incomplete, or about other keywords, and write down which. Otherwise use `scripts/discover-keywords.ts` for broad ideas, then `scripts/validate-keywords.ts` for overview plus live SERP/PAA validation. Review request count before `--confirm-paid-api`.
4. **Check intent.** Compare the top three organic results for format, headings, coverage, sources, schema, SERP features, and content depth. Research PAA answers, not only questions.
5. **Prevent cannibalisation.** Run `scripts/check-cannibalization.ts` against the keyword register. A `BLOCK` forbids a competing page.
6. **Choose one action.** Prefer, in order: repair a material technical issue; refresh an underperforming relevant page; improve internal links; improve tool UX; create a page only for unique, evidenced intent. Document why it beats the other candidates.
7. **Implement in isolation.** Use a dedicated worktree/branch. Preserve unrelated changes. Never work directly on the production branch.
8. **Validate.** Pass every applicable snapshot check, the tool-site overlay, site tests, typecheck/build, rendered HTML/meta/schema checks, sitemap/canonical checks, 375 px layout checks, and relevant performance checks.
9. **Report.** Record `X/X applicable checks passed` and list each N/A with a reason. Never convert the checklist into an invented weighted score.
10. **Deliver.** Update registers and the run report, commit intentionally, push only the task branch, and open a PR. Never merge or deploy.

## Stop conditions

Stop without implementation and leave a research report when:

- fewer than three candidates have trustworthy evidence;
- intent conflicts or a cannibalisation block remains;
- source, GSC, or repository state is ambiguous enough to change the decision;
- primary-source support is insufficient for a financial or safety claim;
- any applicable checklist item, relevant test, build, or rendered-output check fails;
- the previous run already executed in the same ISO week;
- publication would require merge, deployment, billing, DNS, or credential authority.

Research-only is a successful outcome when a stop condition is documented.

## Publication policy

- Keep the first three runs for every site PR-only.
- Keep mortgage and loan sites PR-only permanently, unless that site's profile declares a complete
  `publicationPolicy.mergeOverride` under `mode: "split"`. A YMYL site can only ever waive review for
  technical work; its financial content stays PR-only whatever the profile says.
- Treat all merge, deploy, DNS, billing, and credential changes as user-controlled actions, except the
  narrow merge permission an accepted override grants.
- Never fabricate rankings, traffic, volume, difficulty, dates, credentials, reviews, testimonials, experience, or schema fields.
