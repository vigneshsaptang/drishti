# Spec 015 — Loading Skeletons for All Tabs — Summary

## Status: Complete

## Changes made

### 1. DrugsTab.jsx
- Added `import Shimmer from '../components/Shimmer'`
- Replaced plain-text `Loading drug intelligence...` (line 49) with shimmer skeleton: 3 stat cards in a responsive grid + vendor list section with 4 shimmer rows

### 2. TelegramTab.jsx
- Added `import Shimmer from '../components/Shimmer'`
- Replaced `if (!data) return null` early return with shimmer skeleton: search bar (input + button) + 5 message card skeletons with header and body lines

### 3. DarkwebTab.jsx
- Added `import Shimmer from '../components/Shimmer'`
- Added `if (!data)` early return with shimmer skeleton: search bar + author profile card (avatar, name, stats grid) + 3 post skeletons
- Note: DarkwebTab did not have an existing loading text to replace (unlike what the spec table assumed). The skeleton is shown when `data` prop is null/undefined, which is the pre-search state.

### 4. FinancialTab.jsx
- Added `import Shimmer from '../components/Shimmer'`
- Replaced pulsing dot + "Loading financial intelligence..." (lines 240-246) with shimmer skeleton: 2-column grid with 3 shimmer rows each + search section with label and input shimmer

## Verification

- `npm run lint` — 0 new errors in any of the 4 modified files (all reported errors are pre-existing in other files)
- `npm run build` — succeeds, 648 modules transformed

## Acceptance criteria

- [x] All 4 tabs import `Shimmer` from `../components/Shimmer`
- [x] DrugsTab loading state shows 3 stat card skeletons + vendor list skeleton
- [x] TelegramTab loading state shows search bar skeleton + 5 message card skeletons
- [x] DarkwebTab loading state shows search bar + author profile + 3 post skeletons
- [x] FinancialTab loading state shows 2-column grid + search section skeletons
- [x] No plain-text "Loading..." messages remain in any of the 4 tabs
- [x] All skeletons use `animate-fade-in` for smooth entry
- [x] `npm run lint` passes (0 new errors)
- [x] `npm run build` succeeds
