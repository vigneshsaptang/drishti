# SPEC: Fix search trigger flow — max_depth override, pivot engine leak, SSE race condition

**Worktree**: wt-search
**Priority**: P0 (blocking — undoes spec 001 fix)
**Protocol**: Read `/Users/vigneshe/Developer/Pinaca/claude-research/sigint/specs/SPEC_PROTOCOL.md` first
**Summary output**: `/Users/vigneshe/Developer/Pinaca/claude-research/sigint/specs/search/002-fix-search-trigger-flow.summary.md`

## Problem

Three frontend bugs make the v2 search pipeline behave incorrectly despite the backend fixes in spec 001:

1. `App.jsx` hardcodes `max_depth=5` in every `doSearch` call, overriding the backend default of 2 we just fixed.
2. `handlePivot` calls `handleSearch` without passing the user's engine selection, so every pivot runs all 4 engines regardless of what the user selected — wasting credits and time.
3. The SSE reader loop in `useSearchV2.js` has a race condition: when a new search aborts an old one, the old reader loop can still push stale `entity:result` events into the new search's results array because `controller.signal.aborted` is never checked inside the while loop.

## Changes

### File: `frontend/src/App.jsx`

**Fix 1 — max_depth hardcode**

Find `handleSearch` (around line 133-137). It currently calls something like:
```js
doSearch(seeds, 5, engines);
```

Change the `5` to `2`:
```js
doSearch(seeds, 2, engines);
```

**Fix 2 — pivot engine leak**

Find `handlePivot` (around line 143-146). It currently calls:
```js
handleSearch([{ type, value: value.trim() }]);
```

It needs to preserve the current engine selection. The engine state should be available from the last search or from a ref. Find where the engine selection is tracked (likely in CommandBar state or a ref in App) and pass it through:
```js
handleSearch([{ type, value: value.trim() }], currentEngines);
```

If there's no existing engine state tracked in App, add a `useRef` to capture the engines from the most recent `handleSearch` call:
```js
const enginesRef = useRef(null);

const handleSearch = useCallback((seeds, engines = null) => {
  enginesRef.current = engines;
  // ... existing code
  doSearch(seeds, 2, engines);
}, [doSearch]);

const handlePivot = useCallback((type, value) => {
  CommandBar._setSearch?.(type, value);
  handleSearch([{ type, value: value.trim() }], enginesRef.current);
}, [handleSearch]);
```

### File: `frontend/src/hooks/useSearchV2.js`

**Fix 3 — SSE race condition**

Inside the `while (true)` reader loop (around line 78-163), add an abort signal check at the top of each iteration, right after `const { done, value } = await reader.read()`:

```js
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  if (controller.signal.aborted) break;  // ← ADD THIS LINE
  // ... rest of the loop
}
```

This ensures that if a new search fires `controller.abort()`, the old loop won't continue processing buffered chunks and pushing stale results into state.

## Must NOT touch

- `backend/app/routes/search_v2.py` — already fixed in spec 001
- `backend/app/routes/stream.py` — v1, leave alone
- `backend/app/engines/*` — already fixed in spec 001
- `backend/app/config.py` — owned by wt-infra
- `backend/app/audit.py` — owned by wt-billing
- `backend/app/credits.py` — owned by wt-billing

## Acceptance criteria

1. `doSearch` is called with `max_depth=2` (not 5) in `handleSearch`
2. `handlePivot` passes the current engine selection to `handleSearch` — verify by: select only "breach" engine, search, then click an entity to pivot. The pivot search should only hit CREDMON, not all engines
3. The SSE reader loop checks `controller.signal.aborted` inside the while loop body
4. `npm run lint` passes with no new errors
5. `npm run build` succeeds

## Report back

Write summary to the path in "Summary output" above.
