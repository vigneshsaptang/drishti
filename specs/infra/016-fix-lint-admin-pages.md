# Spec 016 — Fix all lint errors in admin pages + platform components

## Worktree: wt-platform
## Priority: P0 (client blocker)

## Goal

Zero lint errors in all admin pages, auth components, and the permissions module. Currently 26 of the 30 errors live in these files.

## Files to fix

### 1. `src/pages/AdminAuditLog.jsx` — 4 errors, 4 warnings

**Lines 124-125**: Two `useEffect` hooks call `load()` which sets state synchronously.

Current pattern (repeated across all admin pages):
```jsx
useEffect(() => { load(1); setPage(1); }, [q, status]);
useEffect(() => { load(page); }, [page]);
```

Fix: wrap `load` in `useCallback` with proper deps, include it in the effect dep array, and move the setState into the callback instead of calling it directly in the effect body.

```jsx
const load = useCallback(async (p) => {
  setLoading(true);
  // ... existing fetch logic ...
  setLoading(false);
}, [q, status]);  // or whatever load depends on

useEffect(() => { load(1); setPage(1); }, [load]);
useEffect(() => { load(page); }, [load, page]);
```

Actually — the simpler fix that matches the existing code structure: extract `load` with `useCallback` and add the eslint-disable for the effect that intentionally doesn't re-run on `load` changes. The `load(page)` effect should only fire when `page` changes, not when `load` changes.

**Better approach**: Use `useCallback` for `load`, add `load` to deps where appropriate, and for the `[page]` effect where adding `load` would cause unwanted re-fetches, use `// eslint-disable-next-line react-hooks/exhaustive-deps`.

**Lines 189-190**: Same pattern — second tab's pagination effects. Same fix.

### 2. `src/pages/AdminConfig.jsx` — 3 errors, 2 warnings

**Line 86**: `useEffect` with `setValues(initial)` — setState in effect.
**Line 87**: Missing dep `initial`, complex expression.

Fix: The effect syncs `values` state from `initial` prop/query result. Use `useEffect` with `initial` in deps:
```jsx
useEffect(() => {
  if (initial) setValues(initial);
}, [initial]);
```

**Lines 222, 250, 278**: "Cannot create components during render" — inline component definitions inside the render body.

Fix: Move these component definitions outside the parent component, or use `useMemo` to memoize them. Most likely these are form section renderers defined as `const SomeSection = () => (...)` inside the component body. Move them to module-level or extract as separate components.

### 3. `src/pages/AdminCredits.jsx` — 4 errors, 2 warnings

**Line 208**: setState in effect — same `load` pattern.
**Lines 352-353**: Same `load(page)` pattern as AdminAuditLog.

Fix: Same useCallback + deps approach.

### 4. `src/pages/AdminRoles.jsx` — 1 error

**Line 242**: setState in effect. Same fix.

### 5. `src/pages/AdminUsers.jsx` — 3 errors, 2 warnings

**Line 9**: `adminUnlockUser` imported but never used.
Fix: Remove the import.

**Lines 382-383**: Same `load(page)` pattern.
Fix: Same useCallback + deps approach.

### 6. `src/components/ApiKeyManager.jsx` — 1 error

**Line 89**: setState in effect.
Fix: Same pattern — wrap load function in useCallback.

### 7. `src/components/LoginPage.jsx` — 1 error

**Line 24**: setState in effect.
Fix: Wrap the setState call. Read the code to understand context — likely a captcha load or auth status check.

### 8. `src/components/SessionList.jsx` — 1 error

**Line 42**: setState in effect.
Fix: Same pattern.

### 9. `src/components/StatusLine.jsx` — 1 error

**Line 9**: setState in effect.
Fix: Read the code — likely a timer or subscription pattern.

### 10. `src/components/ProfileDialog.jsx` — 1 error

**Line 101**: "Cannot call impure function during render."
Fix: Move the impure call (likely `Date.now()`, `Math.random()`, or a side-effect) into a `useEffect` or `useMemo`.

### 11. `src/AuthGate.jsx` — 1 error

**Line 13**: `pendingCredentials` assigned but never used.
Fix: Check if it's actually needed. If unused, remove the destructured variable. If it's used for the force-password-change flow, check the actual usage.

### 12. `src/lib/permissions.jsx` — 8 errors

**Lines 27, 32, 37, 42, 47, 52, 57, 62**: "Fast refresh only works when a file only exports components."

This file exports both components and utility functions (like `hasPermission`, `checkRole`, etc.). Fast refresh requires each file to export only components.

Fix: Split into two files:
- `src/lib/permissions.jsx` — keep the `PermissionProvider` component and context
- `src/lib/permissionUtils.js` — move the exported helper functions

Then update imports across the codebase.

## Acceptance criteria

- [ ] `npm run lint` reports 0 errors and 0 warnings (full codebase)
- [ ] `npm run build` succeeds
- [ ] No behavioral changes — all fixes are structural (useCallback, dep arrays, file splits)
- [ ] `src/lib/permissions.jsx` split into component + utils files, all imports updated

## HANDOFF items

If `permissions.jsx` split requires updating imports in files outside this spec's scope, list each import change in the summary.

## Summary output

Write summary to: `specs/infra/016-fix-lint-admin-pages.summary.md`

## Notes

- The `set-state-in-effect` errors are a React Compiler lint rule. The fix is NOT to remove the setState — it's to restructure so the data-fetching function is memoized with `useCallback` and the effect deps are correct.
- For effects that intentionally omit a dep (e.g., `[page]` without `load` because re-running on `load` change would infinite-loop), use `// eslint-disable-next-line react-hooks/exhaustive-deps` with a brief comment explaining why.
- The `permissions.jsx` split is the trickiest fix — grep for all imports of that file and update them after splitting.
- DO NOT suppress errors with eslint-disable unless the fix would change behavior. Prefer structural fixes.
