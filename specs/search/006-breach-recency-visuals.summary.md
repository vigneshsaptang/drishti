# Summary: Breach recency visual weighting — opacity decay + sort

## Status: DONE

## Changes made
- `frontend/src/lib/breach.js`: Added `recencyScore(fields)` export after `getRecency()`. Uses exponential decay (`Math.exp(-ageDays / 365)`) with floor at 0.4. Delegates date extraction to existing `getRecency()`. Also fixed pre-existing lint issue: renamed unused `leak` to `_leak` in `classifyBreach`.
- `frontend/src/tabs/BreachesV2Tab.jsx`:
  - Import: added `recencyScore` to the breach import.
  - EntityCard: sources sorted by `recencyScore` (newest first) before mapping.
  - BreachSource: computes `score = recencyScore(...)` and applies `style={{ opacity: score }}` on outermost div.
  - BreachSource: computes `relativeTime` from `recency.ageYears` (avoids `Date.now()` purity lint violation) — shows "3d ago", "6mo ago", "2y 3mo ago" instead of vague "Ny ago" label. Falls back to `recency.label` if no recency data.

## Acceptance criteria
- [x] criteria 1 — `recencyScore` is exported from `lib/breach.js` and returns a number between 0.4 and 1.0
- [x] criteria 2 — `recencyScore({})` (no date fields) returns 0.4: `getRecency({})` returns null → function returns 0.4
- [x] criteria 3 — `recencyScore({ created_at: Date.now() })` returns ~1.0: age ≈ 0 days → `Math.exp(0) = 1.0`
- [x] criteria 4 — `recencyScore({ created_at: Date.now() - 5*365*24*60*60*1000 })` returns 0.4: `Math.exp(-5) ≈ 0.0067`, floored to 0.4
- [x] criteria 5 — Breach sources within each entity card sorted newest-first via `recencyScore` comparator
- [x] criteria 6 — Newest breach source renders at full opacity; older ones progressively dimmer (minimum 0.4 via `style={{ opacity: score }}`)
- [x] criteria 7 — Each source displays relative time badge ("3mo ago", "2y 6mo ago") derived from `recency.ageYears`
- [x] criteria 8 — Depth grouping unchanged — sorting only within EntityCard sources, not across entities or depth groups
- [x] criteria 9 — `npm run lint` passes: 0 errors in breach.js and BreachesV2Tab.jsx
- [x] criteria 10 — `npm run build` succeeds: built in 194ms

## HANDOFF items (for orchestrator to apply)
None — all changes in owned files.

## Notes
- Spec called for `Date.now()` in the `relativeTime` IIFE, but this triggers the `react-hooks/purity` lint rule (impure function in render). Replaced with derivation from `recency.ageYears` (already computed by `getRecency`) — same output, lint-clean.
- The `_leak` rename in `classifyBreach` is a minimal fix for a pre-existing unused-var lint error exposed by linting `breach.js` for the first time in this spec series.
