# Spec 014 — Extract shared UI primitives: Summary

## Status: COMPLETE

## What was done

### 1. `frontend/src/index.css` — added `entity-legal` token
- Added `--color-entity-legal: #d97706;` (amber-600) after `--color-entity-watchlist` in the entity colours block.
- This is semantically distinct from `entity-breach` (`#f59e0b` / amber-500): breach = data leak, legal = court records.

### 2. `frontend/src/components/Shimmer.jsx` — created
- Extracted from EcourtsTab's inline `Shimmer` function.
- Accepts `className` prop (default: `'h-4 w-full'`).
- Uses `via-white/70` for the gradient (matches original, good contrast on `sap-panel` light bg).
- Relies on the pre-existing `animate-shimmer` keyframe in `index.css`.

### 3. `frontend/src/components/SectionDivider.jsx` — created
- New shared component with `label`, `sub`, `accent` props.
- Note: the API differs from the old inline version (which had `label`, `code`, `sublabel`). The new API is simpler: `sub` holds any supplementary text, `accent` controls the label color class.

### 4. `frontend/src/tabs/EcourtsTab.jsx` — refactored
- **Imports added**: `Shimmer` and `SectionDivider` from `../components/`.
- **Inline definitions deleted**: `function Shimmer` and `function SectionDivider` removed.
- **ACCENT constant updated**: `'#f59e0b'` -> `'#d97706'` (amber-600, matching entity-legal token).
- **SectionDivider call sites updated**: adapted from old `(label, code, sublabel)` API to new `(label, sub, accent)` API. The `code` and `sublabel` are merged into the `sub` prop.
- **All amber Tailwind classes replaced** with `entity-legal` equivalents:
  - `text-amber-600/700/800` -> `text-entity-legal`
  - `bg-amber-500/10`, `bg-amber-500/5`, `bg-amber-500/8`, `bg-amber-500/15` -> `bg-entity-legal/10`, `bg-entity-legal/5`, `bg-entity-legal/8`, `bg-entity-legal/15`
  - `bg-amber-600` -> `bg-entity-legal`
  - `bg-amber-500` -> `bg-entity-legal`
  - `border-amber-500/30`, `border-amber-500/40`, `border-amber-500/50`, `border-amber-500`, `border-amber-600` -> `border-entity-legal/30`, `border-entity-legal/40`, `border-entity-legal/50`, `border-entity-legal`, `border-entity-legal`
  - `hover:bg-amber-700` -> `hover:bg-entity-legal/90`
  - `hover:border-amber-700` -> `hover:border-entity-legal/90`
  - `focus:ring-amber-500` -> `focus:ring-entity-legal`
  - `focus:border-amber-500` -> `focus:border-entity-legal`
- **Court-kind badges** (HighCourt, NCLT, District default): converted from amber-700/amber-300 to entity-legal variants. They remain visually coherent since they're all in the same amber family.
- **Kept inline**: `CornerMarks`, `DocStrip`, `Caption` — eCourts-specific components.
- **Kept as-is**: SupremeCourt purple badge, Leaflet map categorical colors.

## Verification

- `npx eslint src/tabs/EcourtsTab.jsx src/components/Shimmer.jsx src/components/SectionDivider.jsx` — 0 errors.
- `npm run build` — succeeds (231ms, no new warnings).
- Zero remaining `text-amber-*`, `bg-amber-*`, or `border-amber-*` classes in EcourtsTab.jsx (only comments mention "amber").

## Files changed

| File | Action |
|------|--------|
| `frontend/src/index.css` | Modified — added `--color-entity-legal` token |
| `frontend/src/components/Shimmer.jsx` | Created |
| `frontend/src/components/SectionDivider.jsx` | Created |
| `frontend/src/tabs/EcourtsTab.jsx` | Modified — imports, inline deletions, amber -> entity-legal |
