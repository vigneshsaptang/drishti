# Spec 014 — Extract shared UI primitives (Shimmer, SectionDivider) + add entity-legal token

## Worktree: wt-infra
## Priority: P1
## Depends on: none

## Goal

Extract eCourts' Shimmer and SectionDivider into shared components so other tabs can use them. Add `entity-legal` color token (amber) to the design system so eCourts' amber accent becomes a first-class entity color like `entity-drug` (red) and `entity-darkweb` (purple). This is the foundation spec — spec 015 consumes these components to add loading skeletons to all other tabs.

## Context

- eCourts defines `Shimmer`, `SectionDivider`, `DocStrip`, `CornerMarks` as inline functions inside `EcourtsTab.jsx`
- `Shimmer` uses the existing `animate-shimmer` keyframe already defined in `index.css` line 56-59
- The entity color system in `index.css` already has: phone (blue), email (green), breach (amber), darkweb (purple), drug (red), telegram (cyan), etc.
- `entity-breach` is already `#f59e0b` (amber-500) — eCourts uses `#f59e0b` too, but they're semantically different (breach = data leak, legal = court records)
- eCourts hardcodes `ACCENT = '#f59e0b'` and `ACCENT_DARK = '#92400e'` at line 81-82

## Owned files (create)

```
frontend/src/components/Shimmer.jsx
frontend/src/components/SectionDivider.jsx
```

## Modified files

```
frontend/src/index.css                — add entity-legal color token
frontend/src/tabs/EcourtsTab.jsx      — import Shimmer + SectionDivider from shared, remove inline definitions, replace hardcoded amber with entity-legal token
```

## Read-only

```
frontend/src/tabs/BreachesV2Tab.jsx
frontend/src/tabs/DarkwebTab.jsx
frontend/src/tabs/DrugsTab.jsx
frontend/src/tabs/FinancialTab.jsx
frontend/src/tabs/TelegramTab.jsx
frontend/src/tabs/OverviewTab.jsx
frontend/src/tabs/GraphTab.jsx
```

## Implementation

### 1. `frontend/src/index.css` — add entity-legal token

Add after the existing entity color block (after `--color-entity-watchlist`):

```css
--color-entity-legal: #d97706;
```

Using amber-600 (`#d97706`) rather than amber-500 (`#f59e0b`) because it has better contrast on white backgrounds. The existing `entity-breach` stays at `#f59e0b` — they're different semantic concepts.

### 2. `frontend/src/components/Shimmer.jsx`

Extract from EcourtsTab.jsx lines 134-140. Make it a proper shared component:

```jsx
export default function Shimmer({ className = 'h-4 w-full' }) {
  return (
    <div className={`relative overflow-hidden bg-sap-panel rounded-sm ${className}`}>
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.07] to-transparent animate-shimmer" />
    </div>
  );
}
```

Note: The eCourts version uses `via-white/70` which is very bright. For a shared component on a light theme, `via-white/[0.07]` is too subtle — keep `via-white/70` as in the original since `sap-panel` is `#f0f0f3` (light grey). The shimmer gradient needs visible contrast.

Actually, keep the original: `via-white/70`. It works on the light bg.

### 3. `frontend/src/components/SectionDivider.jsx`

Extract from EcourtsTab.jsx lines 118-132. Parameterize the accent color:

```jsx
export default function SectionDivider({ label, sub, accent = 'text-sap-dim' }) {
  return (
    <div className="flex items-center gap-3 pt-6 pb-3 select-none">
      <span aria-hidden className="text-sap-border text-[10px] font-mono">§</span>
      <span className={`text-[10px] font-mono font-semibold tracking-[0.28em] uppercase ${accent}`}>
        {label}
      </span>
      {sub && <span className="text-[9px] font-mono text-sap-muted">{sub}</span>}
      <span aria-hidden className="flex-1 h-px bg-gradient-to-r from-sap-border via-sap-border/50 to-transparent" />
    </div>
  );
}
```

### 4. `frontend/src/tabs/EcourtsTab.jsx` — refactor to use shared components + entity-legal

**Imports**: Add at top:
```jsx
import Shimmer from '../components/Shimmer';
import SectionDivider from '../components/SectionDivider';
```

**Remove inline definitions**:
- Delete the `function Shimmer` definition (lines ~134-140)
- Delete the `function SectionDivider` definition (lines ~118-132)
- Keep `CornerMarks` and `DocStrip` inline — they're eCourts-specific decorative elements

**Replace hardcoded amber with entity-legal**:
- Replace `ACCENT = '#f59e0b'` → `ACCENT = '#d97706'` (or better: read from CSS var, but inline hex is fine for JS-driven SVG/canvas)
- Replace `text-amber-600` → `text-entity-legal` throughout
- Replace `text-amber-700` → `text-entity-legal` (darker variant not needed — single token is cleaner)
- Replace `text-amber-800` → `text-entity-legal`
- Replace `bg-amber-500` → `bg-entity-legal`
- Replace `bg-amber-600` → `bg-entity-legal`
- Replace `bg-amber-700` → `bg-entity-legal`
- Replace `hover:bg-amber-700` → `hover:bg-entity-legal/90`
- Replace `border-amber-500` → `border-entity-legal`
- Replace `border-amber-600` → `border-entity-legal`
- Replace `border-amber-500/30` → `border-entity-legal/30`
- Replace `border-amber-500/40` → `border-entity-legal/40`
- Replace `bg-amber-500/5` → `bg-entity-legal/5`
- Replace `bg-amber-500/10` → `bg-entity-legal/10`
- Replace `focus:ring-amber-500` → `focus:ring-entity-legal`
- Replace `focus:border-amber-500` → `focus:border-entity-legal`

**Keep as-is**:
- `CornerMarks` (eCourts-specific, fine inline)
- `DocStrip` (eCourts-specific, fine inline)
- Court-kind badge colors (`bg-purple-900/10`, etc.) — those are categorical, not accent
- Leaflet map colors (categorical, not accent)

## Acceptance criteria

- [ ] `entity-legal` token defined in `index.css` with value `#d97706`
- [ ] `Shimmer.jsx` exists as a standalone component with `className` prop
- [ ] `SectionDivider.jsx` exists with `label`, `sub`, `accent` props
- [ ] EcourtsTab imports Shimmer and SectionDivider from `../components/`
- [ ] No inline `function Shimmer` or `function SectionDivider` remains in EcourtsTab.jsx
- [ ] Zero remaining `text-amber-` or `bg-amber-` or `border-amber-` classes in EcourtsTab.jsx (except court-kind badge categorical colors if any use amber for HighCourt)
- [ ] eCourts tab still renders identically (just with slightly different amber shade — #d97706 vs #f59e0b)
- [ ] `npm run lint` passes (0 new errors)
- [ ] `npm run build` succeeds

## Testing instructions

```bash
cd frontend && npm run dev
# Open http://localhost:4444 → eCourts tab
# Verify: coverage hero loads with shimmer, section dividers render, amber accent consistent
# Verify: no visual regressions in cards, tables, forms, search
```

## HANDOFF items

None — all files are in frontend/src/.

## Summary output

Write summary to: `specs/infra/014-shared-ui-components.summary.md`

## Notes

- The HighCourt badge in the table uses `bg-amber-700/10 text-amber-800 border border-amber-700/40`. This is a categorical color for court kind, not accent. If it looks right as `entity-legal` variants, convert it. If it needs to stay distinct from the accent, keep amber. Use your judgment — the test is whether HighCourt badges are visually distinct from the accent elements around them.
- `DocStrip` and `CornerMarks` stay in EcourtsTab because they're legal-document motifs that don't make sense on a breach card or darkweb post. Don't over-extract.
