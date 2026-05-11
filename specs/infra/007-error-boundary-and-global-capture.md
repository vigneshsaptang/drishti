# SPEC: React error boundary + global error capture + incomplete search guard

**Worktree**: wt-infra
**Priority**: P0 (a single tab crash white-screens the entire app)
**Protocol**: Read `/Users/vigneshe/Developer/Pinaca/claude-research/sigint/specs/SPEC_PROTOCOL.md` first
**Summary output**: `/Users/vigneshe/Developer/Pinaca/claude-research/sigint/specs/infra/007-error-boundary-and-global-capture.summary.md`

## Problem

Three gaps that will embarrass us in front of a client:

1. **No React error boundary anywhere.** If any tab throws during render (null pointer, bad data shape), React unmounts the ENTIRE app — blank white screen, no message, no recovery. The user must refresh.
2. **No global error capture.** `window.onerror` and `unhandledrejection` are not wired. Runtime errors and unhandled promise rejections vanish into the browser console.
3. **SSE stream drop is silent.** If the backend crashes mid-search, the spinner stops, partial results display, and the user thinks the search completed. No warning that data is incomplete.

## Changes

### File: `frontend/src/components/ErrorBoundary.jsx` (NEW FILE)

Create a class component error boundary:

```jsx
import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error(`[ErrorBoundary:${this.props.name || 'unknown'}]`, error, info.componentStack);
    try {
      fetch('/api/errors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'react_render',
          message: error?.message || String(error),
          stack: error?.stack || null,
          componentStack: info?.componentStack || null,
          component: this.props.name || 'unknown',
          url: window.location.href,
          timestamp: new Date().toISOString(),
        }),
      }).catch(() => {});
    } catch {}
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-lg border border-entity-drug/30 bg-entity-drug/5 p-6 m-4">
          <p className="text-entity-drug font-mono text-sm mb-2">
            Module failed to render: {this.props.name || 'unknown'}
          </p>
          <p className="text-sap-dim text-xs mb-3">
            {this.state.error?.message || 'An unexpected error occurred'}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="text-xs font-mono text-sap-accent hover:underline"
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
```

### File: `frontend/src/App.jsx`

**Change 1 — Import ErrorBoundary**

Add at the top with other imports:
```js
import ErrorBoundary from './components/ErrorBoundary';
```

**Change 2 — Wrap tabs in renderBody and renderTab**

In `renderTab` (around line 62-73), wrap each tab return in an ErrorBoundary:

```jsx
function renderTab(activeTab, data, results, onPivot, loading, ftiResults, onFocusEntity, focusedEntity, clearFocusedEntity, darkmonResults, darkmonMeta, financialResults, financialMeta) {
  switch (activeTab) {
    case 'graph': return <ErrorBoundary name="GraphTab"><GraphTab data={data} onPivot={onPivot} focusedEntity={focusedEntity} onClearFocus={clearFocusedEntity} /></ErrorBoundary>;
    case 'financial': return <ErrorBoundary name="FinancialTab"><FinancialTab financialResults={financialResults} financialMeta={financialMeta} /></ErrorBoundary>;
    case 'telegram': return <ErrorBoundary name="TelegramTab"><TelegramTab data={data} /></ErrorBoundary>;
    case 'breaches': return <ErrorBoundary name="BreachesV2Tab"><BreachesV2Tab results={results} onPivot={onPivot} loading={loading} onFocusEntity={onFocusEntity} /></ErrorBoundary>;
    case 'darkweb': return <ErrorBoundary name="DarkwebTab"><DarkwebTab data={data} onPivot={onPivot} darkmonResults={darkmonResults} darkmonMeta={darkmonMeta} /></ErrorBoundary>;
    case 'drugs': return <ErrorBoundary name="DrugsTab"><DrugsTab /></ErrorBoundary>;
    case 'ecourts': return <ErrorBoundary name="EcourtsTab"><EcourtsTab /></ErrorBoundary>;
    default: return <ErrorBoundary name="OverviewTab"><OverviewTab data={data} results={results} onPivot={onPivot} ftiResults={ftiResults} /></ErrorBoundary>;
  }
}
```

Also in `renderBody` (around line 148-165), wrap the direct tab renders:

```jsx
if (activeTab === 'drugs') return <ErrorBoundary name="DrugsTab"><DrugsTab /></ErrorBoundary>;
if (activeTab === 'financial') return <ErrorBoundary name="FinancialTab"><FinancialTab financialResults={financialResults} financialMeta={financialMeta} /></ErrorBoundary>;
if (activeTab === 'darkweb') return <ErrorBoundary name="DarkwebTab"><DarkwebTab data={data} onPivot={handlePivot} darkmonResults={darkmonResults} darkmonMeta={darkmonMeta} /></ErrorBoundary>;
if (activeTab === 'ecourts') return <ErrorBoundary name="EcourtsTab"><EcourtsTab /></ErrorBoundary>;
if (activeTab === 'graph') return <ErrorBoundary name="GraphTab"><GraphTab data={data} onPivot={handlePivot} focusedEntity={focusedEntity} onClearFocus={clearFocusedEntity} /></ErrorBoundary>;
```

Also wrap SubjectProfile and FtiScreening (around line 205-206):

```jsx
{hasResults && activeTab === 'overview' && <ErrorBoundary name="SubjectProfile"><SubjectProfile results={results} loading={loading} onFocusEntity={handleFocusEntity} onSwitchTab={setActiveTab} aiSummary={aiSummary} canonical={canonical} /></ErrorBoundary>}
{(ftiResults.length > 0 || ftiMeta) && activeTab === 'overview' && <ErrorBoundary name="FtiScreening"><FtiScreening ftiResults={ftiResults} ftiMeta={ftiMeta} loading={loading} canonicalTokens={watchlistFilterTokens} canonicalName={canonical?.canonical || null} /></ErrorBoundary>}
```

### File: `frontend/src/main.jsx`

**Change 3 — Add global error capture**

Before the `createRoot` call, add:

```js
window.addEventListener('error', (event) => {
  try {
    fetch('/api/errors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'runtime',
        message: event.message || 'Unknown error',
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        stack: event.error?.stack || null,
        url: window.location.href,
        timestamp: new Date().toISOString(),
      }),
    }).catch(() => {});
  } catch {}
});

window.addEventListener('unhandledrejection', (event) => {
  try {
    const err = event.reason;
    fetch('/api/errors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'unhandled_rejection',
        message: err?.message || String(err),
        stack: err?.stack || null,
        url: window.location.href,
        timestamp: new Date().toISOString(),
      }),
    }).catch(() => {});
  } catch {}
});
```

### File: `frontend/src/hooks/useSearchV2.js`

**Change 4 — Detect incomplete search (search:complete never received)**

After the `while (true)` reader loop exits (around the `finally` block), add a check: if `loading` was true but `search:complete` was never received, set a warning:

Find where the reader loop ends and the `finally` block is. Add a ref or variable to track whether `search:complete` was received:

At the top of `doSearch`, add:
```js
let searchCompleted = false;
```

In the event handler for `search:complete`, set:
```js
searchCompleted = true;
```

In the `finally` block (or after the loop breaks), add:
```js
if (!searchCompleted && !controller.signal.aborted) {
  setError('Search stream ended unexpectedly — results may be incomplete');
}
```

This ensures that if the SSE stream drops mid-search (server crash, network error), the user sees a clear warning instead of silently viewing partial data.

## Must NOT touch

- `backend/app/*` — the `/api/errors` endpoint is in spec 009 (wt-billing). The frontend POSTs to it fire-and-forget; if the endpoint doesn't exist yet, the POST fails silently and that's fine
- `frontend/src/tabs/*` — owned by wt-search / wt-intel
- `frontend/src/lib/api.js` — not in scope for this spec

## Acceptance criteria

1. `ErrorBoundary.jsx` exists and exports a class component with `getDerivedStateFromError` and `componentDidCatch`
2. Every tab in `renderTab` and `renderBody` is wrapped in `<ErrorBoundary name="...">` 
3. SubjectProfile and FtiScreening are wrapped in ErrorBoundary
4. ErrorBoundary shows a styled error message with component name + retry button (not a white screen)
5. ErrorBoundary POSTs error details to `/api/errors` (fire-and-forget, no crash if endpoint missing)
6. `main.jsx` has `window.addEventListener('error', ...)` and `window.addEventListener('unhandledrejection', ...)`
7. Both global handlers POST to `/api/errors` (fire-and-forget)
8. If SSE stream ends without `search:complete` and wasn't user-cancelled, an error/warning is shown
9. `npm run lint` passes
10. `npm run build` succeeds

## Report back

Write summary to the path in "Summary output" above.
