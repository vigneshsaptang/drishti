# SPEC: Fix FTI screening state leak and court search using wrong canonical

**Worktree**: wt-search
**Priority**: P1 (FTI filter silently shows unfiltered namesakes on second search)
**Protocol**: Read `/Users/vigneshe/Developer/Pinaca/claude-research/sigint/specs/SPEC_PROTOCOL.md` first
**Summary output**: `/Users/vigneshe/Developer/Pinaca/claude-research/sigint/specs/search/005-fix-fti-screening-state.summary.md`

## Problem

Two related issues with FTI screening and court search:

1. **FTI filter state not reset between searches**: `FtiScreening.jsx` has a `filterToCanonical` state (line ~533) that defaults to `true`. If the operator clicks "Show all" (setting it to `false`), then runs a new search, the component is never unmounted — so `filterToCanonical` stays `false`. The new search silently shows all namesake matches unfiltered, with no warning. The "no namesake hits to hide" label can also mislead when the canonical filter is wrong.

2. **Court search uses wrong canonical**: `SubjectProfile.jsx` passes its internally-computed canonical to `CourtSearchSection` (line ~376-380). After spec 003, SubjectProfile will use the canonical prop from App.jsx — but the court count data is fetched only once per mount via a `useRef` flag (`courtCountsRef`, line ~572-579) and never refreshes for subsequent searches.

## Changes

### File: `frontend/src/components/FtiScreening.jsx`

**Fix 1 — Reset `filterToCanonical` when search results change**

Find the `filterToCanonical` state declaration (around line 533):
```js
const [filterToCanonical, setFilterToCanonical] = useState(true);
```

Add a `useEffect` that resets it whenever `ftiResults` changes (meaning a new search completed):
```js
useEffect(() => {
  setFilterToCanonical(true);
}, [ftiResults]);
```

This ensures every new search starts with the filter ON, regardless of what the operator toggled in the previous search.

**Fix 2 — Fix the "no namesake hits to hide" label**

Find the span that shows the hidden count (around line 675-677). When `filterToCanonical` is true and `hiddenCount` is 0, the current message "no namesake hits to hide" is misleading if the canonical tokens are wrong. Change it to be neutral:

```jsx
// Before:
'no namesake hits to hide'

// After:
'all results match subject'
```

This is factually accurate when 0 results are hidden — it means the filter found no namesakes to exclude.

### File: `frontend/src/components/SubjectProfile.jsx`

**Fix 3 — Reset court count ref between searches**

Find `courtCountsRef` (around line 572-579):
```js
const courtCountsRef = useRef(false);
useEffect(() => {
  if (courtCountsRef.current || courtStates.length === 0) return;
  courtCountsRef.current = true;
  getEcourtsByState().then(...);
}, [courtStates.length]);
```

The problem: `courtCountsRef.current` is set to `true` on first fetch and never reset, so subsequent searches in different states never re-fetch court data.

Fix: reset the ref when the canonical identity or `courtStates` changes:
```js
const courtCountsRef = useRef(null); // Track what we fetched for, not just boolean

useEffect(() => {
  if (courtStates.length === 0) return;
  const key = courtStates.sort().join(',');
  if (courtCountsRef.current === key) return;  // already fetched for these states
  courtCountsRef.current = key;
  getEcourtsByState().then(...);
}, [courtStates]);
```

This way, if the second search resolves to a different state (e.g., Karnataka instead of Maharashtra), the court counts re-fetch automatically.

**Fix 4 — Court search should use the canonical prop**

After spec 003 is applied, SubjectProfile receives a `canonical` prop from App.jsx. Find where `CourtSearchSection` is rendered (around line 376-380):
```jsx
<CourtSearchSection
  name={canonical?.canonical || canonical?.anchor || null}
  ...
/>
```

Verify that this `canonical` refers to the **prop** (not the old internal computation). If the internal variable was also named `canonical`, there will be a shadowing issue after spec 003 removes the internal call. Rename if needed:

```jsx
// If the prop is named `canonical` and there was an internal variable also named `canonical`:
const { canonical: canonicalProp } = props;
// ... then use canonicalProp in CourtSearchSection:
<CourtSearchSection
  name={canonicalProp?.canonical || canonicalProp?.anchor || null}
  ...
/>
```

NOTE: This fix depends on spec 003 being applied first. If spec 003 is not yet applied, skip this fix and note it in the summary as "deferred — depends on spec 003".

## Must NOT touch

- `backend/app/*` — no backend changes
- `frontend/src/lib/canonicalIdentity.js` — owned by spec 003
- `frontend/src/App.jsx` — owned by spec 002 and 003
- `frontend/src/tabs/*` — no tab changes

## Acceptance criteria

1. Run a search → FTI results show filtered (canonical matches only). Click "Show all" → all results visible. Run a SECOND search → FTI results are filtered again (not still in "Show all" mode)
2. The "no namesake hits to hide" text is replaced with "all results match subject"
3. Run a search for a Mumbai number (pincode 40xxxx) → court section shows Maharashtra courts. Run a second search for a Bangalore number (pincode 56xxxx) → court section refreshes to show Karnataka courts (not still showing Maharashtra)
4. If spec 003 is applied: SubjectProfile's `CourtSearchSection` uses the canonical prop, not an internal computation
5. `npm run lint` passes
6. `npm run build` succeeds

## Report back

Write summary to the path in "Summary output" above. If spec 003 was not yet applied when you ran this, note which parts were deferred.
