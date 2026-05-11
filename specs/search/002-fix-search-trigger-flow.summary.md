# Summary: Fix search trigger flow — max_depth override, pivot engine leak, SSE race condition

## Status: PARTIAL

## Changes made
- `frontend/src/hooks/useSearchV2.js`: Changed `doSearch` default `maxDepth` from 5 to 2 (defense-in-depth for fix 1). Added `if (controller.signal.aborted) break;` inside the SSE reader `while` loop to prevent stale events from a cancelled search leaking into a new search's state (fix 3).

## Acceptance criteria
- [ ] criteria 1 — `doSearch` called with `max_depth=2` in `handleSearch`: **HANDOFF** — `App.jsx` is a hot file, cannot edit directly. The `doSearch` default parameter was changed from 5 to 2 in `useSearchV2.js` as a safety net, but the explicit `5` in `App.jsx:136` still overrides it.
- [ ] criteria 2 — `handlePivot` passes engine selection: **HANDOFF** — requires `App.jsx` edit (add `useRef` for engines, wire through `handlePivot`).
- [x] criteria 3 — SSE reader loop checks `controller.signal.aborted` — passed (line 81 of useSearchV2.js)
- [x] criteria 4 — `npm run lint` passes with no new errors — passed (0 errors in useSearchV2.js; all existing errors are in other files)
- [x] criteria 5 — `npm run build` succeeds — passed (built in 222ms)

## HANDOFF items (for orchestrator to apply)

### App.jsx

**Fix 1 — max_depth hardcode (line 136)**

```js
// BEFORE:
doSearch(seeds, 5, engines);

// AFTER:
doSearch(seeds, 2, engines);
```

**Fix 2 — pivot engine leak (lines 133-146)**

Add a `useRef` to capture the engine selection, then pass it through `handlePivot`:

```js
// Add import (line 1):
import { useState, useCallback, useMemo, useRef } from 'react';

// Add ref (after line 91, near other state):
const enginesRef = useRef(null);

// Update handleSearch (lines 133-137):
const handleSearch = useCallback((seeds, engines = null) => {
  enginesRef.current = engines;
  setActiveTab('overview');
  setFocusedEntity(null);
  doSearch(seeds, 2, engines);
}, [doSearch]);

// Update handlePivot (lines 143-146):
const handlePivot = useCallback((type, value) => {
  CommandBar._setSearch?.(type, value);
  handleSearch([{ type, value: value.trim() }], enginesRef.current);
}, [handleSearch]);
```

## Notes
- The `doSearch` function in `useSearchV2.js` also had a default of `maxDepth = 5`. Changed it to 2 as defense-in-depth — even if a caller omits the argument, it won't silently revert to depth 5. This doesn't conflict with the App.jsx HANDOFF since App.jsx passes `max_depth` explicitly.
- The chunk size warning from `npm run build` (833 kB) is pre-existing and unrelated.
- All pre-existing lint errors are in files outside this spec's scope (AuthGate, ApiKeyManager, LoginPage, admin pages, etc.).
