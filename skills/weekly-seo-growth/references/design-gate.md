# Design gate (Impeccable)

Applies only when a run's change touches UI beyond plain copy: layout,
components, styling, navigation, imagery. Copy-only and metadata-only runs
skip this file.

The operator runs pbakaus/impeccable user-global (see the Obsidian note
"Impeccable — Design-skill voor de vloot", SHA-256 pin
`6BC9D1CA72FF42D40691A4B4FF137ACF1E42AB407AD1BAB552E3D1280E0A013E`).

## The gate

1. If `~/.claude/skills/impeccable` is absent, note "design gate:
   unavailable" in the run report and continue — the gate never blocks a
   site that lacks the tooling.
2. Otherwise run the deterministic detector over the changed UI files:
   `node ~/.claude/skills/impeccable/scripts/detect.mjs --json <files>`.
   Know its two quirks: the CLI reads no ignore config (the project's
   `.impeccable/config.json` ignores apply only to the hook), and a
   session's Stop-hook running outside the repo cwd re-reports suppressed
   findings — neither is a new defect.
3. Triage every finding in the run report: fixed, suppressed (narrowest
   `ignore-value`, with reason), or left standing with justification.
   Never add an ignore to push a blocked change through.
4. Respect the site's `PRODUCT.md` and `.impeccable/config.json` where they
   exist (e.g. therockhoundinghub: pen-name authors — no personal
   experience claims; buildPath code-first).
5. Contrast changes are measured with the WCAG formula against real token
   values, never eyeballed. Text 4.5:1, large text and graphics 3:1.
