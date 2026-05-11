# Spec 015 — Add loading skeletons to all tabs

## Worktree: wt-infra
## Priority: P1
## Depends on: spec 014 (Shimmer component must exist)

## Goal

Replace the plain-text "Loading..." messages in every non-eCourts tab with Shimmer-based skeleton screens that match the layout each tab will render. This raises the perceived quality of the entire app to match the eCourts tab's polish.

## Context

Current loading states by tab:

| Tab | Current loading UI | Line |
|-----|-------------------|------|
| DrugsTab | `<p className="... animate-scan">Loading drug intelligence...</p>` | 49 |
| TelegramTab | `<p className="... animate-scan">Loading telegram data...</p>` | (similar pattern) |
| DarkwebTab | `<p className="... animate-scan">Loading dark web data...</p>` | (similar pattern) |
| FinancialTab | `<div>` with pulsing dot + "Loading financial intelligence..." | 240-246 |
| OverviewTab | Inline loading in search flow, no standalone skeleton | — |
| BreachesV2Tab | No loading state (streams in progressively via SSE) | — |
| GraphTab | No loading state (renders after search completes) | — |

The `Shimmer` component from spec 014 is at `frontend/src/components/Shimmer.jsx`.

## Owned files (modify)

```
frontend/src/tabs/DrugsTab.jsx
frontend/src/tabs/TelegramTab.jsx
frontend/src/tabs/DarkwebTab.jsx
frontend/src/tabs/FinancialTab.jsx
```

## Read-only

```
frontend/src/components/Shimmer.jsx    — use, don't modify
frontend/src/tabs/EcourtsTab.jsx       — reference for skeleton patterns, don't modify
frontend/src/tabs/BreachesV2Tab.jsx    — no loading state needed (SSE streaming)
frontend/src/tabs/GraphTab.jsx         — no loading state needed (post-search render)
frontend/src/tabs/OverviewTab.jsx      — skip for now (complex layout, separate spec)
```

## Implementation

### Pattern

Each tab's `if (loading)` block gets replaced with a skeleton that approximates the tab's actual layout. Use `Shimmer` with `className` props to match the shapes that will appear when data loads.

Import at top of each file:
```jsx
import Shimmer from '../components/Shimmer';
```

### 1. `DrugsTab.jsx`

Replace line 49 (`if (loading) return <p>...</p>`) with:

```jsx
if (loading) {
  return (
    <div className="space-y-4 p-4 animate-fade-in">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="bg-sap-surface border border-sap-border rounded-lg p-4 space-y-3">
            <Shimmer className="h-3 w-24" />
            <Shimmer className="h-8 w-20" />
            <Shimmer className="h-2 w-full" />
          </div>
        ))}
      </div>
      <div className="bg-sap-surface border border-sap-border rounded-lg p-4 space-y-3">
        <Shimmer className="h-3 w-32" />
        <div className="space-y-2">
          {[1, 2, 3, 4].map(i => <Shimmer key={i} className="h-10 w-full" />)}
        </div>
      </div>
    </div>
  );
}
```

This mimics: 3 stat cards on top + a vendor list below.

### 2. `TelegramTab.jsx`

Replace loading return with:

```jsx
if (loading) {
  return (
    <div className="space-y-4 p-4 animate-fade-in">
      <div className="flex gap-3">
        <Shimmer className="h-10 flex-1" />
        <Shimmer className="h-10 w-24" />
      </div>
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="bg-sap-surface border border-sap-border rounded-lg p-4 space-y-2">
            <div className="flex items-center gap-3">
              <Shimmer className="h-3 w-20" />
              <Shimmer className="h-3 w-32" />
            </div>
            <Shimmer className="h-4 w-full" />
            <Shimmer className="h-4 w-3/4" />
          </div>
        ))}
      </div>
    </div>
  );
}
```

This mimics: search bar + message result cards.

### 3. `DarkwebTab.jsx`

Replace loading return with:

```jsx
if (loading) {
  return (
    <div className="space-y-4 p-4 animate-fade-in">
      <div className="flex gap-3">
        <Shimmer className="h-10 flex-1" />
        <Shimmer className="h-10 w-24" />
      </div>
      <div className="bg-sap-surface border border-sap-border rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-4">
          <Shimmer className="h-12 w-12 rounded-full" />
          <div className="space-y-2 flex-1">
            <Shimmer className="h-4 w-40" />
            <Shimmer className="h-3 w-24" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4 pt-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="text-center space-y-2">
              <Shimmer className="h-6 w-16 mx-auto" />
              <Shimmer className="h-3 w-12 mx-auto" />
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="bg-sap-surface border border-sap-border rounded-lg p-4 space-y-2">
            <Shimmer className="h-4 w-3/4" />
            <Shimmer className="h-3 w-full" />
            <Shimmer className="h-3 w-2/3" />
          </div>
        ))}
      </div>
    </div>
  );
}
```

This mimics: search bar + author profile card with stats + forum posts.

### 4. `FinancialTab.jsx`

Replace lines 240-246 (the pulsing dot loading state) with:

```jsx
if (loading) {
  return (
    <div className="space-y-4 p-4 animate-fade-in">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {[1, 2].map(i => (
          <div key={i} className="bg-sap-surface border border-sap-border rounded-lg p-4 space-y-3">
            <Shimmer className="h-3 w-28" />
            <div className="space-y-2">
              {[1, 2, 3].map(j => <Shimmer key={j} className="h-10 w-full" />)}
            </div>
          </div>
        ))}
      </div>
      <div className="bg-sap-surface border border-sap-border rounded-lg p-4 space-y-3">
        <Shimmer className="h-3 w-32" />
        <Shimmer className="h-10 w-full" />
      </div>
    </div>
  );
}
```

This mimics: 2-column grid (fraud UPIs + bank accounts) + crypto search section.

## Acceptance criteria

- [ ] All 4 tabs import `Shimmer` from `../components/Shimmer`
- [ ] DrugsTab loading state shows 3 stat card skeletons + vendor list skeleton
- [ ] TelegramTab loading state shows search bar skeleton + 5 message card skeletons
- [ ] DarkwebTab loading state shows search bar + author profile + 3 post skeletons
- [ ] FinancialTab loading state shows 2-column grid + search section skeletons
- [ ] No plain-text "Loading..." messages remain in any of the 4 tabs
- [ ] All skeletons use `animate-fade-in` for smooth entry
- [ ] `npm run lint` passes (0 new errors)
- [ ] `npm run build` succeeds

## Testing instructions

```bash
cd frontend && npm run dev
# For each tab: trigger a loading state (initial load or search)
# Verify: shimmer skeletons appear instead of plain text
# Verify: layout of skeleton roughly matches the real content layout
```

## HANDOFF items

None — all files in frontend/src/tabs/.

## Summary output

Write summary to: `specs/infra/015-loading-skeletons-all-tabs.summary.md`

## Notes

- OverviewTab is skipped because its loading state is tied to the search flow (SSE streaming), not a simple boolean. A skeleton for OverviewTab would need to account for partial data states — save for a separate spec.
- BreachesV2Tab and GraphTab don't have standalone loading states — they render progressively as SSE data arrives or after search completion. No skeleton needed.
- The skeleton layouts don't need to be pixel-perfect matches — they just need to hint at the shape of the real content. A 3-card grid skeleton for DrugsTab is better than "Loading drug intelligence..." even if the cards are slightly different sizes.
- Keep the `animate-fade-in` on the skeleton wrapper so it doesn't pop in harshly.
