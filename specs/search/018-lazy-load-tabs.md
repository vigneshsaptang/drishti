# Spec 018 — Lazy-load tabs with React.lazy + Suspense

## Worktree: wt-search (frontend)
## Priority: P0 (performance — deploy blocker for 20 users)

## Goal

Replace static tab imports in App.jsx with `React.lazy()` so each tab's JS only loads when the user first clicks it. The initial bundle drops from ~500KB+ to ~150KB (just the shell: Header, CommandBar, AuthGate, OverviewTab). Heavy tabs like EcourtsTab (Leaflet maps), GraphTab (force-directed graph lib), and DrugsTab only load on demand.

## Context

Current App.jsx imports all 8 tabs statically at the top (lines 30-37):
```jsx
import OverviewTab from './tabs/OverviewTab';
import BreachesV2Tab from './tabs/BreachesV2Tab';
import DarkwebTab from './tabs/DarkwebTab';
import DrugsTab from './tabs/DrugsTab';
import TelegramTab from './tabs/TelegramTab';
import FinancialTab from './tabs/FinancialTab';
import GraphTab from './tabs/GraphTab';
import EcourtsTab from './tabs/EcourtsTab';
```

Also lazy-load the admin/overlay pages — they're rarely accessed but included in the main bundle:
```jsx
import AdminUsers from './pages/AdminUsers';
import AdminConfig from './pages/AdminConfig';
import AdminAuditLog from './pages/AdminAuditLog';
import AdminRoles from './pages/AdminRoles';
import AdminCredits from './pages/AdminCredits';
import TicketManager from './admin/TicketManager';
import FaqManager from './admin/FaqManager';
import StatusManager from './admin/StatusManager';
import HealthDashboard from './components/HealthDashboard';
```

## File to modify

```
frontend/src/App.jsx
```

## Implementation

### 1. Replace static imports with React.lazy

```jsx
import { useState, useCallback, useMemo, lazy, Suspense } from 'react';

// Keep static: shell components always visible
import Header from './components/Header';
import CommandBar from './components/CommandBar';
import StatusLine from './components/StatusLine';
import SubjectProfile from './components/SubjectProfile';
import FtiScreening from './components/FtiScreening';
import ClassificationBanner from './components/ClassificationBanner';
import TabStrip from './components/TabStrip';
import DashboardIdle from './components/DashboardIdle';
import ErrorBoundary from './components/ErrorBoundary';
import FeedbackFab from './components/FeedbackFab';
import FeedbackModal from './components/FeedbackModal';

// Keep static: OverviewTab is the default tab (always shown first)
import OverviewTab from './tabs/OverviewTab';

// Lazy: tabs loaded on demand
const BreachesV2Tab = lazy(() => import('./tabs/BreachesV2Tab'));
const DarkwebTab = lazy(() => import('./tabs/DarkwebTab'));
const DrugsTab = lazy(() => import('./tabs/DrugsTab'));
const TelegramTab = lazy(() => import('./tabs/TelegramTab'));
const FinancialTab = lazy(() => import('./tabs/FinancialTab'));
const GraphTab = lazy(() => import('./tabs/GraphTab'));
const EcourtsTab = lazy(() => import('./tabs/EcourtsTab'));

// Lazy: overlays/admin (rarely accessed)
const ProfileDialog = lazy(() => import('./components/ProfileDialog'));
const SessionList = lazy(() => import('./components/SessionList'));
const ApiKeyManager = lazy(() => import('./components/ApiKeyManager'));
const CreditPanel = lazy(() => import('./components/CreditPanel'));
const MyTickets = lazy(() => import('./components/MyTickets'));
const FaqPage = lazy(() => import('./components/FaqPage'));
const StatusPage = lazy(() => import('./components/StatusPage'));
const HealthDashboard = lazy(() => import('./components/HealthDashboard'));
const AdminUsers = lazy(() => import('./pages/AdminUsers'));
const AdminConfig = lazy(() => import('./pages/AdminConfig'));
const AdminAuditLog = lazy(() => import('./pages/AdminAuditLog'));
const AdminRoles = lazy(() => import('./pages/AdminRoles'));
const AdminCredits = lazy(() => import('./pages/AdminCredits'));
const TicketManager = lazy(() => import('./admin/TicketManager'));
const FaqManager = lazy(() => import('./admin/FaqManager'));
const StatusManager = lazy(() => import('./admin/StatusManager'));
```

### 2. Add Suspense fallback

Create a simple inline fallback (no new component file needed):

```jsx
function LazyFallback() {
  return (
    <div className="flex items-center justify-center p-12">
      <div className="h-2 w-2 rounded-full bg-sap-accent animate-pulse" />
      <span className="ml-3 text-xs font-mono text-sap-dim">Loading module...</span>
    </div>
  );
}
```

### 3. Wrap lazy components in Suspense

In `renderTab`, wrap the switch body:
```jsx
function renderTab(...) {
  const tab = (() => {
    switch (activeTab) {
      case 'graph': return <ErrorBoundary name="GraphTab"><GraphTab ... /></ErrorBoundary>;
      // ... other cases
      default: return <ErrorBoundary name="OverviewTab"><OverviewTab ... /></ErrorBoundary>;
    }
  })();
  return <Suspense fallback={<LazyFallback />}>{tab}</Suspense>;
}
```

Similarly, wrap the overlay section in `renderBody` in a single `<Suspense>`:
```jsx
<Suspense fallback={<LazyFallback />}>
  {overlay === 'profile' && <ProfileDialog ... />}
  {overlay === 'sessions' && <SessionList ... />}
  {/* ... rest of overlays ... */}
</Suspense>
```

### 4. Keep OverviewTab static

OverviewTab is the landing tab — it shows immediately after login. Lazy-loading it would add a flash. Keep it as a static import.

## Acceptance criteria

- [ ] App.jsx uses `React.lazy()` for 7 tabs (all except OverviewTab) and 13 overlay/admin components
- [ ] `Suspense` wraps both the tab render and the overlay render sections
- [ ] OverviewTab is still a static import (no loading flash on first render)
- [ ] `LazyFallback` component shows a subtle loading indicator
- [ ] `npm run build` produces multiple chunks (not one monolithic chunk) — verify the build output shows separate chunk files
- [ ] `npm run lint` passes (0 errors)
- [ ] Tab switching still works: click a tab → brief loading indicator → tab renders
- [ ] ErrorBoundary still wraps each lazy tab (catches both load errors and render errors)

## Testing instructions

```bash
cd frontend && npm run build
# Check dist/assets/ — should see multiple .js chunk files instead of one large one
npm run dev
# Open http://localhost:4444 → check Network tab → initial load should be smaller
# Click eCourts tab → see a chunk load in Network tab → tab renders
```

## HANDOFF items

None — only App.jsx is modified.

## Summary output

Write summary to: `specs/search/018-lazy-load-tabs.summary.md`

## Notes

- `React.lazy` only works with default exports. All tab files already use `export default`, so no changes needed in tab files.
- The Shimmer component (used in tab loading states) is tiny and imported by each tab — it'll be duplicated into each chunk but at <1KB that's irrelevant.
- Vite handles code splitting automatically with dynamic `import()` — no rollup config needed.
- If `lazy` + `Suspense` causes a lint error about "cannot create components during render" for the IIFE pattern in renderTab, restructure to avoid the IIFE — e.g., use a direct `switch` or conditional returns inside a function component.
