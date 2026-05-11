# SPEC: Add error states to intelligence tab API calls

**Worktree**: wt-intel
**Priority**: P1 (tabs silently show empty when API fails — client sees no data with no explanation)
**Protocol**: Read `/Users/vigneshe/Developer/Pinaca/claude-research/sigint/specs/SPEC_PROTOCOL.md` first
**Summary output**: `/Users/vigneshe/Developer/Pinaca/claude-research/sigint/specs/intel/010-tab-error-states.summary.md`

## Problem

When tab-level API calls fail (500, network error, timeout), these tabs silently show empty state — no error message, no retry option. The client sees "nothing found" when the real issue is "the server is down":

- **DrugsTab** — calls `getDrugStats()`, `getIndiaVendors()`, `searchDrugs()` — all have no `res.ok` check in `lib/api.js`, so a 500 with non-JSON body throws a silent parse error
- **TelegramTab** — calls `searchTelegramMessages()` — same issue
- **DarkwebTab** — calls `getDarkwebAuthor()` — same issue
- **FinancialTab** — calls `listFraudUpis()`, `listBankAccounts()`, `getCryptoTrace()` — same issue
- **GraphTab** — calls `buildGraph()` — this one actually shows errors (has its own error state), so it's the model to follow

## Changes

For each tab, add a simple error state pattern. Follow GraphTab's existing pattern as the template.

### Pattern to apply to each tab:

```jsx
const [error, setError] = useState(null);

// In each fetch call, wrap with try/catch:
try {
  setError(null);
  const data = await apiFunction(params);
  // ... existing state setting
} catch (err) {
  setError(err.message || 'Failed to load data');
}

// In the render, show error if present:
{error && (
  <div className="rounded-lg border border-entity-drug/30 bg-entity-drug/5 p-4 mb-4">
    <p className="text-entity-drug font-mono text-sm">{error}</p>
    <button
      onClick={() => { setError(null); /* re-trigger the fetch */ }}
      className="mt-2 text-xs font-mono text-sap-accent hover:underline"
    >
      Retry
    </button>
  </div>
)}
```

### File: `frontend/src/tabs/DrugsTab.jsx`

Add error state. DrugsTab has multiple independent fetches (stats, vendors, search). Each should set the same error state on failure. Add a retry button that re-triggers the failed fetch.

Find each `useEffect` or fetch handler. Wrap the fetch in try/catch:
- `getDrugStats()` fetch → catch → `setError('Failed to load drug statistics')`
- `getIndiaVendors()` fetch → catch → `setError('Failed to load vendor data')`
- `searchDrugs()` fetch → catch → `setError('Drug search failed')`

### File: `frontend/src/tabs/TelegramTab.jsx`

Add error state. TelegramTab has a single search fetch:
- `searchTelegramMessages()` → catch → `setError('Telegram search failed')`

### File: `frontend/src/tabs/DarkwebTab.jsx`

Add error state. DarkwebTab calls `getDarkwebAuthor()`:
- Wrap in try/catch → `setError('Failed to load darkweb data')`

### File: `frontend/src/tabs/FinancialTab.jsx`

Add error state. FinancialTab has multiple fetches:
- `listFraudUpis()` → catch → `setError('Failed to load UPI data')`
- `listBankAccounts()` → catch → `setError('Failed to load bank account data')`
- `getCryptoTrace()` → catch → `setError('Failed to load crypto data')`

### Style guidelines

- Use the same error styling across all tabs — red border with the `entity-drug` color tokens
- Keep the error inline within the tab (not a modal or toast)
- Always include a "Retry" button
- Clear the error when retrying (`setError(null)` before the fetch)
- Don't block the rest of the tab — if one fetch fails, still show data from other fetches that succeeded. Only show the error message alongside the working data.

## Must NOT touch

- `frontend/src/tabs/GraphTab.jsx` — already has error handling, leave it as the reference
- `frontend/src/tabs/OverviewTab.jsx` — owned by wt-search
- `frontend/src/tabs/BreachesV2Tab.jsx` — owned by wt-search
- `frontend/src/tabs/EcourtsTab.jsx` — owned by wt-ecourts
- `frontend/src/lib/api.js` — owned by wt-infra
- `backend/app/*` — no backend changes

## Acceptance criteria

1. Each of the 4 tabs (DrugsTab, TelegramTab, DarkwebTab, FinancialTab) has an `error` state
2. API failures show a styled error message with the specific failure reason
3. Each error message has a "Retry" button that re-triggers the failed fetch
4. Error styling uses `entity-drug` color tokens matching GraphTab's pattern
5. If one fetch fails in a multi-fetch tab (DrugsTab, FinancialTab), successful fetches still display their data
6. `npm run lint` passes
7. `npm run build` succeeds

## Report back

Write summary to the path in "Summary output" above.
