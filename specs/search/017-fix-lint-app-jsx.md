# Spec 017 — Fix lint error in App.jsx (refs during render)

## Worktree: wt-search
## Priority: P0 (client blocker)

## Goal

Fix the single remaining lint error in `App.jsx`: "Cannot access refs during render" at line 212.

## Context

The error is at the `renderBody()` call site. `renderBody` is an inline function that accesses `enginesRef.current` during render. The React Compiler lint rule forbids ref access during render because refs are mutable and reading them makes the render impure.

The `enginesRef` was added by spec 002 (search trigger flow fix) to preserve the selected engines across pivot searches. It's read inside `renderBody` to pass to search components.

## File to fix

```
frontend/src/App.jsx — line 212
```

## Implementation

Read App.jsx around line 212 to understand the exact `renderBody` pattern and where `enginesRef.current` is accessed.

The fix depends on what `enginesRef` is used for:

**Option A** — If `enginesRef.current` is passed as a prop, convert it to regular state:
```jsx
const [currentEngines, setCurrentEngines] = useState(null);
// Update engines via setCurrentEngines instead of enginesRef.current = ...
```

**Option B** — If `enginesRef` must stay a ref (e.g., it's read in event handlers and shouldn't cause re-renders), move the ref read out of the render path:
```jsx
// Instead of reading enginesRef.current inside renderBody(),
// read it in the event handler that triggers the search and pass it as state
```

**Option C** — If the ref read is inside a callback prop (like `onPivot`), that's not actually a render-time read — the lint rule may be a false positive. In that case, wrap just the ref access line with `// eslint-disable-next-line react-hooks/purity`.

Read the code first, then pick the option that doesn't change behavior.

## Acceptance criteria

- [ ] `npm run lint` on `src/App.jsx` reports 0 errors
- [ ] `npm run build` succeeds
- [ ] Pivot search still works (engines are preserved across pivots)
- [ ] No other files modified

## Summary output

Write summary to: `specs/search/017-fix-lint-app-jsx.summary.md`
