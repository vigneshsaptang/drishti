# Spec 017 — Fix lint error in App.jsx

## Status: DONE

## What changed

Converted `enginesRef` (a `useRef`) to `currentEngines` (a `useState`) in `src/App.jsx`.

The React Compiler lint rule `react-hooks/refs` flagged line 212 (`{renderBody()}`) because
`renderBody` transitively closed over `enginesRef` via `handlePivot`. Even though
`enginesRef.current` was only read when the callback fired (not during render), the
compiler conservatively treats any ref captured in a render-path closure as a violation.

### Fix (Option A from spec)

| Before | After |
|---|---|
| `const enginesRef = useRef(null)` | `const [currentEngines, setCurrentEngines] = useState(null)` |
| `enginesRef.current = engines` in `handleSearch` | `setCurrentEngines(engines)` in `handleSearch` |
| `enginesRef.current` in `handlePivot` | `currentEngines` in `handlePivot` dep array |
| `useRef` imported | `useRef` import removed |

The extra `setCurrentEngines` setState is harmless — `handleSearch` already calls
`setActiveTab`, `setFocusedEntity`, and `doSearch` in the same tick, so React batches
them into one render.

Behavior is unchanged: pivots still carry the engines from the last explicit search.

## Verification

- `npm run lint src/App.jsx` — 0 errors in App.jsx
- `npm run build` — succeeds
