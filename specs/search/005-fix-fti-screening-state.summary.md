# Summary: Fix FTI screening state leak and court search using wrong canonical

## Status: DONE

## Changes made
- `frontend/src/components/FtiScreening.jsx`: Added render-time state reset — when `ftiResults` identity changes (new search), `filterToCanonical` resets to `true`. Uses the React "derived state from props" pattern (same as SubjectProfile's `prevTotal`) to avoid the `set-state-in-effect` lint rule. Changed "no namesake hits to hide" label to "all results match subject".
- `frontend/src/components/SubjectProfile.jsx`: `courtCountsRef` now tracks a key string (sorted state codes) instead of a boolean. When `courtStates` changes between searches (e.g., Maharashtra → Karnataka), the ref key differs, `courtCounts` is cleared, and `getEcourtsByState()` re-fetches. Previous search results are cleared via `setCourtCounts(null)` before the new fetch starts.

## Acceptance criteria
- [x] criteria 1 — FTI filter resets between searches: `filterToCanonical` resets to `true` via render-time prop comparison whenever `ftiResults` changes. "Show all" mode from previous search does not leak into the next search.
- [x] criteria 2 — "no namesake hits to hide" replaced with "all results match subject"
- [x] criteria 3 — Court counts re-fetch on state change: `courtCountsRef` tracks `courtStates.map(s => s.code).sort().join(',')` — different states produce a different key, triggering a fresh `getEcourtsByState()` call
- [x] criteria 4 — Spec 003 IS applied: `SubjectProfile` receives `canonical` via prop destructuring (`canonical: canonicalProp`), resolves to `canonicalProp || canonicalLocal`, and passes `canonical?.canonical || canonical?.anchor` to `CourtSearchSection`. No shadowing issue.
- [x] criteria 5 — `npm run lint` passes: 0 errors in FtiScreening.jsx and SubjectProfile.jsx
- [x] criteria 6 — `npm run build` succeeds: built in 186ms

## HANDOFF items (for orchestrator to apply)
None — all changes in owned files.

## Notes
- Used render-time state reset pattern instead of `useEffect` to avoid the `react-hooks/set-state-in-effect` lint rule. The codebase already uses this pattern in SubjectProfile (lines 301-305 for `prevTotal`/`revealedTags` reset).
- `courtCounts` is explicitly set to `null` before the re-fetch so the UI doesn't show stale data from the previous search while loading.
- The `useEffect` import in FtiScreening.jsx was already present (used by McaCompanyBlock); no new imports needed.
