# SPEC: Breach recency visual weighting — opacity decay + sort

**Worktree**: wt-search
**Priority**: P2 (visual enhancement)
**Protocol**: Read `/Users/vigneshe/Developer/Pinaca/claude-research/sigint/specs/SPEC_PROTOCOL.md` first
**Summary output**: `/Users/vigneshe/Developer/Pinaca/claude-research/sigint/specs/search/006-breach-recency-visuals.summary.md`

## Problem

Breach results currently render in arrival order with equal visual weight. A 2024 credential leak looks identical to a 2012 email-only dump. Analysts have to manually scan dates to prioritize recent exposures.

## Goal

Add two visual-only cues — no logic changes, no risk scoring, no data model changes:

1. **Sort** breach sources within each entity card by recency (newest first)
2. **Opacity decay** on breach source cards so older breaches are visually dimmer

## Changes

### File: `frontend/src/lib/breach.js`

**Add `recencyScore(fields)` function** — exported, placed after the existing `getRecency` function.

```js
export function recencyScore(fields) {
  const rec = getRecency(fields);
  if (!rec || !rec.date) return 0.4;  // unknown date = treat as old
  const ageMs = Date.now() - new Date(rec.date).getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  // Exponential decay: 1.0 at day 0, ~0.37 at 1 year, ~0.14 at 2 years, floor at 0.4
  return Math.max(0.4, Math.exp(-ageDays / 365));
}
```

Key design decisions:
- Floor of 0.4 — even the oldest breach stays readable, never invisible
- Unknown dates get 0.4 (minimum) — we don't penalize missing data more than old data
- Uses the existing `getRecency()` internally so date extraction logic isn't duplicated
- Returns a number between 0.4 and 1.0

### File: `frontend/src/tabs/BreachesV2Tab.jsx`

**Change 1 — Import `recencyScore`**

Add to the existing import from `../lib/breach` (around line 3):
```js
import { classifyBreach, getRecency, recencyScore } from '../lib/breach'
```

**Change 2 — Sort sources within each EntityCard by recency**

Inside the `EntityCard` component (around line 334-336), the sources are currently rendered unsorted:
```jsx
{(entity.sources || []).map((src, si) => (
  <BreachSource key={si} source={src} />
))}
```

Sort them by recency score before mapping:
```jsx
{[...(entity.sources || [])]
  .sort((a, b) => {
    const scoreA = recencyScore(a.records?.[0]?.fields || {});
    const scoreB = recencyScore(b.records?.[0]?.fields || {});
    return scoreB - scoreA;  // newest (highest score) first
  })
  .map((src, si) => (
    <BreachSource key={si} source={src} />
  ))}
```

**Change 3 — Apply opacity to BreachSource based on recency score**

Inside the `BreachSource` component (around line 381-456), compute the score and apply it as inline opacity on the outermost div.

At the top of `BreachSource` (after line 384 where `recency` is computed):
```js
const score = recencyScore(source.records?.[0]?.fields || {});
```

On the outermost div of BreachSource (around line 386), add the opacity style:
```jsx
<div className="border-t border-sap-border" style={{ opacity: score }}>
```

**Change 4 — Add relative time badge**

Enhance the existing recency label display (around lines 404-407). The current label shows "Recent" or "Ny ago". Add a more specific relative time below or beside it:

After computing `recency` (line 384), compute a human-friendly relative time string:
```js
const relativeTime = (() => {
  if (!recency?.date) return null;
  const days = Math.floor((Date.now() - new Date(recency.date).getTime()) / (1000 * 60 * 60 * 24));
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  const years = Math.floor(days / 365);
  const months = Math.floor((days % 365) / 30);
  return months > 0 ? `${years}y ${months}mo ago` : `${years}y ago`;
})();
```

Replace the existing recency display (lines 404-407) with:
```jsx
{recency && (
  <span className={recency.color} title={`Record from ${recency.date}`}>
    {relativeTime || recency.label}
  </span>
)}
```

This replaces the vague "Ny ago" with precise "2y 3mo ago" text.

## What NOT to do

- Do NOT change the depth grouping — entities still group by depth level
- Do NOT sort entities within a depth group — only sort sources within each entity card
- Do NOT change `getRecency()` behavior or return type
- Do NOT add any new UI elements like legends, badges, or headers
- Do NOT change risk scoring, severity classification, or any data model
- Do NOT touch `OverviewTab.jsx`, `App.jsx`, or any backend files

## Must NOT touch

- `backend/app/*` — no backend changes
- `frontend/src/tabs/OverviewTab.jsx` — not part of this spec
- `frontend/src/App.jsx` — owned by orchestrator
- `frontend/src/lib/canonicalIdentity.js` — unrelated
- `frontend/src/lib/canonicalLocation.js` — unrelated

## Acceptance criteria

1. `recencyScore` is exported from `lib/breach.js` and returns a number between 0.4 and 1.0
2. `recencyScore({})` (no date fields) returns 0.4
3. `recencyScore({ created_at: Date.now() })` (just now) returns ~1.0
4. `recencyScore({ created_at: Date.now() - 5*365*24*60*60*1000 })` (5 years ago) returns 0.4 (floored)
5. Breach sources within each entity card are sorted newest-first
6. The newest breach source card renders at full opacity; older ones are progressively dimmer (minimum 0.4)
7. Each source displays a relative time badge ("3mo ago", "2y 6mo ago") instead of the vague "Ny ago" label
8. Depth grouping is unchanged — entities still render under Depth 0, Depth 1, etc.
9. `npm run lint` passes
10. `npm run build` succeeds

## Report back

Write summary to the path in "Summary output" above.
