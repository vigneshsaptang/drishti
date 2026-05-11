# Spec 020 — Batch SSE entity:result events to reduce re-renders

## Worktree: wt-search (frontend)
## Priority: P1 (performance polish)

## Goal

Currently every `entity:result` SSE event triggers a separate `setResults(prev => [...prev, parsed])` — 200 breach results = 200 React re-renders. Batch incoming events so we accumulate results for 100ms then flush once, cutting re-renders ~20x.

## Context

The bottleneck is in `frontend/src/hooks/useSearchV2.js`, lines 116-119:
```jsx
case 'entity:result':
  setResults(prev => [...prev, parsed]);
  break;
```

The SSE stream can fire 100+ `entity:result` events in 1-2 seconds during BFS. Each `setResults` creates a new array and triggers a React render cycle. On slower machines (analyst laptops), this causes visible jank.

## File to modify

```
frontend/src/hooks/useSearchV2.js
```

## Implementation

Use a `useRef` buffer + `requestAnimationFrame` to batch entity results:

```jsx
const entityBufferRef = useRef([]);
const rafRef = useRef(null);

const flushEntityBuffer = useCallback(() => {
  if (entityBufferRef.current.length > 0) {
    const batch = entityBufferRef.current;
    entityBufferRef.current = [];
    setResults(prev => [...prev, ...batch]);
  }
  rafRef.current = null;
}, []);

// In the SSE event handler:
case 'entity:result':
  entityBufferRef.current.push(parsed);
  if (!rafRef.current) {
    rafRef.current = requestAnimationFrame(flushEntityBuffer);
  }
  break;

// On search:complete, flush any remaining:
case 'search:complete':
  // Flush buffered entity results first
  if (entityBufferRef.current.length > 0) {
    const batch = entityBufferRef.current;
    entityBufferRef.current = [];
    setResults(prev => [...prev, ...batch]);
  }
  if (rafRef.current) {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }
  searchCompleted = true;
  setSearchMeta(prev => ({ ... }));
  setLoading(false);
  break;
```

Also apply the same pattern to `fti:result`, `financial:result`, and `darkmon:result` — they're lower volume but benefit from the same batching:

```jsx
const ftiBufferRef = useRef([]);
const darkmonBufferRef = useRef([]);
const financialBufferRef = useRef([]);
```

Each uses the same rAF pattern. The `*:complete` events flush the corresponding buffer before processing.

### Cleanup

In the `cancelSearch` and `clearResults` callbacks, cancel any pending rAF:

```jsx
const cancelSearch = useCallback(() => {
  if (abortRef.current) {
    abortRef.current.abort();
    abortRef.current = null;
  }
  if (rafRef.current) {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }
  entityBufferRef.current = [];
  setLoading(false);
  setError(null);
}, []);
```

## Acceptance criteria

- [ ] `entity:result` events are batched via rAF (not one setState per event)
- [ ] `fti:result`, `financial:result`, `darkmon:result` are also batched
- [ ] `search:complete` flushes all buffers before setting final state
- [ ] `cancelSearch` and `clearResults` cancel pending rAF and clear buffers
- [ ] `npm run lint` passes (0 errors)
- [ ] `npm run build` succeeds
- [ ] Search results still appear progressively (just in ~16ms batches instead of per-event)

## HANDOFF items

None — only `useSearchV2.js` modified.

## Summary output

Write summary to: `specs/search/020-sse-batching.summary.md`

## Notes

- `requestAnimationFrame` gives us ~16ms batching (one frame). For SSE events arriving every ~5ms, this means 3-4 results per batch. For bursts of 50 events in 100ms, it means ~6 batches instead of 50 setStates.
- Don't use `setTimeout` — rAF aligns with the browser's paint cycle, which is exactly what we want (batch until the next paint, then flush).
- The buffer uses `useRef` (not state) so appending to it doesn't trigger renders. Only the `setResults` flush triggers a render.
