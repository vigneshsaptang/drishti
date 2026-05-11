# Spec 020 -- SSE Batching: Summary

## Status: DONE

## What changed

Single file modified: `frontend/src/hooks/useSearchV2.js`

Replaced per-event `setState` calls for all four result streams (`entity:result`, `fti:result`, `darkmon:result`, `financial:result`) with a `useRef` buffer + `requestAnimationFrame` batching pattern. Incoming SSE events are pushed into ref buffers (no render), and a single rAF callback flushes all four buffers into their respective state setters once per animation frame (~16ms).

## Implementation details

- **4 buffer refs**: `entityBufferRef`, `ftiBufferRef`, `darkmonBufferRef`, `financialBufferRef` (all `useRef([])`)
- **1 rAF ref**: `rafRef` tracks the pending animation frame handle
- **`flushAllBuffers`**: drains each non-empty buffer into its setter via `setX(prev => [...prev, ...batch])`; resets `rafRef.current = null`
- **`scheduleFlush`**: gates rAF scheduling so only one frame callback is pending at a time
- **`cancelBuffers`**: cancels pending rAF and empties all buffers -- called by `cancelSearch`, `clearResults`, and at the start of `doSearch`
- **`search:complete` handler**: cancels pending rAF, synchronously flushes all buffers, then sets final meta/loading state -- guarantees no results are lost

## Acceptance criteria

- [x] `entity:result` events batched via rAF (not one setState per event)
- [x] `fti:result`, `financial:result`, `darkmon:result` also batched
- [x] `search:complete` flushes all buffers before setting final state
- [x] `cancelSearch` and `clearResults` cancel pending rAF and clear buffers
- [x] `npm run lint` passes (0 errors)
- [x] `npm run build` succeeds
- [x] Search results still appear progressively (in ~16ms batches instead of per-event)

## Files modified

- `frontend/src/hooks/useSearchV2.js`
