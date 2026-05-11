# Summary: React error boundary + global error capture + incomplete search guard

## Status: DONE

## Changes made
- `frontend/src/components/ErrorBoundary.jsx` (NEW): Class component with `getDerivedStateFromError` + `componentDidCatch`. Shows styled error panel with component name, error message, and Retry button. POSTs error details to `/api/errors` fire-and-forget.
- `frontend/src/App.jsx`: Imported ErrorBoundary. Wrapped every tab in `renderTab` (8 cases) and `renderBody` (5 direct renders) with `<ErrorBoundary name="...">`. Also wrapped SubjectProfile and FtiScreening.
- `frontend/src/main.jsx`: Added `window.addEventListener('error', ...)` and `window.addEventListener('unhandledrejection', ...)` before `createRoot`. Both POST to `/api/errors` fire-and-forget.
- `frontend/src/hooks/useSearchV2.js`: Added `searchCompleted` flag, set to `true` on `search:complete` event. In `finally` block, if `!searchCompleted && !controller.signal.aborted`, sets error to `'Search stream ended unexpectedly — results may be incomplete'`.

## Acceptance criteria
- [x] criteria 1 — `ErrorBoundary.jsx` exists with `getDerivedStateFromError` and `componentDidCatch`
- [x] criteria 2 — Every tab in `renderTab` (8) and `renderBody` (5) wrapped in `<ErrorBoundary name="...">`
- [x] criteria 3 — SubjectProfile and FtiScreening wrapped in ErrorBoundary
- [x] criteria 4 — ErrorBoundary shows styled error with component name + Retry button
- [x] criteria 5 — ErrorBoundary POSTs to `/api/errors` (fire-and-forget, catch blocks prevent crash if endpoint missing)
- [x] criteria 6 — `main.jsx` has both `window.addEventListener('error', ...)` and `window.addEventListener('unhandledrejection', ...)`
- [x] criteria 7 — Both global handlers POST to `/api/errors` fire-and-forget
- [x] criteria 8 — Incomplete search detection: if SSE ends without `search:complete` and wasn't user-cancelled, error message shown
- [x] criteria 9 — `npm run lint` passes for changed files (ErrorBoundary.jsx, main.jsx, useSearchV2.js all clean)
- [x] criteria 10 — `npm run build` succeeds (built in 205ms)

## HANDOFF items (for orchestrator to apply)
None — all changes in owned files.

## Notes
- One pre-existing lint error in App.jsx (`Cannot access refs during render` on `renderBody()` line) — this was introduced by the spec 002 HANDOFF when `enginesRef` was added to `handlePivot`. Not caused by this spec's changes. Will need a follow-up to restructure `renderBody` from an inline function to a proper component or move the ref access pattern.
- All lint errors in other files (AuthGate, ApiKeyManager, LoginPage, admin pages) are pre-existing and unrelated.
- The `/api/errors` endpoint doesn't exist yet — it will be created by spec 009 (wt-billing). Until then, the POSTs fail silently, which is the intended behavior.
