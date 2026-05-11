# Spec 018 -- Lazy-load tabs: Summary

## Status: DONE

## What changed

Single file modified: `frontend/src/App.jsx`

### Imports restructured

- Added `lazy, Suspense` to the React import (alongside existing `useState, useCallback, useMemo` -- did NOT re-add `useRef`)
- Converted 7 tab imports to `React.lazy()`: BreachesV2Tab, DarkwebTab, DrugsTab, TelegramTab, FinancialTab, GraphTab, EcourtsTab
- Converted 16 overlay/admin imports to `React.lazy()`: ProfileDialog, SessionList, ApiKeyManager, CreditPanel, MyTickets, FaqPage, StatusPage, HealthDashboard, AdminUsers, AdminConfig, AdminAuditLog, AdminRoles, AdminCredits, TicketManager, FaqManager, StatusManager
- Kept OverviewTab as static import (default landing tab, avoids loading flash)
- Kept all shell components static: Header, CommandBar, StatusLine, SubjectProfile, FtiScreening, ClassificationBanner, TabStrip, DashboardIdle, FeedbackFab, FeedbackModal, ErrorBoundary

### Suspense boundaries added

- `LazyFallback` component: subtle pulsing dot + "Loading module..." text
- `renderTab` function: wraps switch result in `<Suspense fallback={<LazyFallback />}>`
- `renderBody` function: each lazy tab return wrapped individually in `<Suspense>`
- Overlay section: single `<Suspense>` wrapping all 16 overlay conditionals
- ErrorBoundary still wraps each lazy tab (catches both load errors and render errors)

## Verification

- `npm run lint`: 0 errors (1 pre-existing warning in useSearchV2.js)
- `npm run build`: produces 34 output files with clear code splitting:
  - Main bundle: `index-*.js` at 349 KB (gzip 102 KB)
  - GraphTab chunk: 86 KB (was in main bundle before)
  - EcourtsTab chunk: 41 KB
  - leaflet chunk: 149 KB
  - FinancialTab: 23 KB
  - AdminCredits/AdminUsers: ~18 KB each
  - All other tabs/overlays: 3-15 KB each
