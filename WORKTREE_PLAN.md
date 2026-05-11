# Parallel Worktree Plan — Sigint

This file is the orchestrator's reference. The **wt-infra** session owns this document and is responsible for merging all branches, resolving hot-file conflicts, and running final integration.

## Worktree overview

| # | Worktree | Branch | Directory | Purpose |
|---|----------|--------|-----------|---------|
| 1 | wt-ecourts | `wt-ecourts` | `../sigint-ecourts` | eCourts search, court directory, order viewer |
| 2 | wt-platform | `wt-platform` | `../sigint-platform` | Auth, RBAC, admin users, support, sessions |
| 3 | wt-search | `wt-search` | `../sigint-search` | Core search pipeline, engines, breach/overview rendering |
| 4 | wt-intel | `wt-intel` | `../sigint-intel` | Specialty intelligence tabs (darkweb, drugs, telegram, financial, graph) |
| 5 | wt-billing | `wt-billing` | `../sigint-billing` | Audit logging, credit system, usage analytics |
| 6 | wt-infra | `wt-infra` | `../sigint-infra` | Docker, Caddy, config, middleware, main.py, merge orchestration |

## Setup commands

```bash
cd /Users/vigneshe/Developer/Pinaca/claude-research/sigint

git worktree add ../sigint-ecourts   -b wt-ecourts   develop
git worktree add ../sigint-platform  -b wt-platform  develop
git worktree add ../sigint-search    -b wt-search    develop
git worktree add ../sigint-intel     -b wt-intel     develop
git worktree add ../sigint-billing   -b wt-billing   develop
git worktree add ../sigint-infra     -b wt-infra     develop
```

## Teardown (after all merges complete)

```bash
git worktree remove ../sigint-ecourts
git worktree remove ../sigint-platform
git worktree remove ../sigint-search
git worktree remove ../sigint-intel
git worktree remove ../sigint-billing
git worktree remove ../sigint-infra
```

---

## File ownership map

Every file in the project is assigned to exactly one worktree. If a file is not listed, it belongs to **wt-infra** by default.

### wt-ecourts

```
backend/app/routes/ecourts.py
backend/app/routes/ecourts_search.py
frontend/src/tabs/EcourtsTab.jsx
frontend/src/components/CourtSearchCard.jsx
```

### wt-platform

```
backend/app/platform/__init__.py
backend/app/platform/auth.py
backend/app/platform/config_store.py
backend/app/platform/sessions.py
backend/app/platform/models.py
backend/app/platform/registry.py
backend/app/platform/rbac.py
backend/app/platform/dependencies.py
backend/app/platform/init_db.py
backend/app/platform/audit.py           (platform-layer audit, NOT app/audit.py)
backend/app/platform/email_service.py
backend/app/platform/email_templates.py
backend/app/platform/rate_limiter.py
backend/app/platform/faq_service.py
backend/app/platform/notification_service.py
backend/app/platform/ticket_service.py
backend/app/platform/status_service.py
backend/app/routes/auth.py
backend/app/routes/admin.py
backend/app/routes/support.py
backend/app/auth_middleware.py
backend/app/brute_force.py
backend/app/captcha.py

frontend/src/AuthGate.jsx
frontend/src/components/LoginPage.jsx
frontend/src/components/SetupWizard.jsx
frontend/src/components/ForcePasswordChange.jsx
frontend/src/components/ProfileDialog.jsx
frontend/src/components/SessionList.jsx
frontend/src/components/ApiKeyManager.jsx
frontend/src/components/UserMenu.jsx
frontend/src/components/Can.jsx
frontend/src/components/Header.jsx
frontend/src/lib/permissions.jsx
frontend/src/lib/auth.js
frontend/src/lib/fingerprint.js
frontend/src/pages/AdminUsers.jsx
frontend/src/pages/AdminConfig.jsx
frontend/src/pages/AdminRoles.jsx
frontend/src/admin/FaqManager.jsx
frontend/src/admin/StatusManager.jsx
frontend/src/admin/TicketManager.jsx
frontend/src/components/MyTickets.jsx
frontend/src/components/FaqPage.jsx
frontend/src/components/StatusPage.jsx
frontend/src/components/FeedbackFab.jsx
frontend/src/components/FeedbackModal.jsx
```

### wt-search

```
backend/app/engines/__init__.py
backend/app/engines/credmon.py
backend/app/engines/darkmon.py
backend/app/engines/fti.py
backend/app/routes/search.py
backend/app/routes/search_v2.py
backend/app/routes/stream.py
backend/app/sanitize.py

frontend/src/hooks/useSearchV2.js
frontend/src/hooks/useSearch.js          (legacy, but owned here)
frontend/src/tabs/OverviewTab.jsx
frontend/src/tabs/BreachesV2Tab.jsx
frontend/src/tabs/BreachesTab.jsx        (legacy, but owned here)
frontend/src/components/EntityBadge.jsx
frontend/src/components/StatusLine.jsx
frontend/src/components/SubjectProfile.jsx
frontend/src/components/V2StatsBar.jsx
frontend/src/components/StatsBar.jsx
frontend/src/components/CommandBar.jsx
frontend/src/components/TabStrip.jsx
frontend/src/lib/breach.js
frontend/src/lib/serviceMap.js
frontend/src/lib/canonicalIdentity.js
frontend/src/lib/canonicalLocation.js
frontend/src/lib/identifierExtract.js
frontend/src/lib/utils.js
```

### wt-intel

```
backend/app/routes/darkweb.py
backend/app/routes/drugs.py
backend/app/routes/telegram.py
backend/app/routes/financial.py
backend/app/routes/mca.py
backend/app/routes/graph.py
backend/app/routes/dashboard.py
backend/app/routes/stats.py
backend/app/routes/report.py

frontend/src/tabs/DarkwebTab.jsx
frontend/src/tabs/DrugsTab.jsx
frontend/src/tabs/TelegramTab.jsx
frontend/src/tabs/FinancialTab.jsx
frontend/src/tabs/GraphTab.jsx
frontend/src/components/OnionLink.jsx
frontend/src/components/DrugRouteMap.jsx
frontend/src/components/Lightbox.jsx
frontend/src/components/DashboardIdle.jsx
frontend/src/lib/ontology.js
frontend/src/lib/reportGenerator.js
```

### wt-billing

```
backend/app/audit.py
backend/app/credits.py
backend/app/routes/audit_admin.py
backend/app/routes/credits.py
backend/app/audit_context_middleware.py
backend/app/credit_headers_middleware.py

frontend/src/components/CreditPanel.jsx
frontend/src/components/CreditBar.jsx
frontend/src/components/ActivityFeed.jsx
frontend/src/components/SearchHistoryPanel.jsx
frontend/src/lib/creditContext.jsx
frontend/src/pages/AdminCredits.jsx
frontend/src/pages/AdminAuditLog.jsx
```

### wt-infra (orchestrator — owns everything not listed above)

```
backend/app/main.py                     (composition root)
backend/app/config.py                   (all Settings fields)
backend/app/db.py                       (all DB connections)
backend/app/serializer.py
backend/app/security_headers.py
backend/app/rate_limiter.py
backend/app/error_handler.py
backend/app/ip_control.py
backend/app/models/__init__.py
backend/app/scripts/mca_indexes.py
backend/requirements.txt

frontend/src/App.jsx                    (god component — merge target)
frontend/src/main.jsx
frontend/src/index.css
frontend/src/assets/*
frontend/src/components/ClassificationBanner.jsx
frontend/src/components/NotificationBell.jsx
frontend/src/components/NotificationDropdown.jsx
frontend/src/components/SidebarNav.jsx
frontend/src/components/AdminNav.jsx
frontend/src/components/ModuleWaitPlaceholder.jsx
frontend/src/hooks/useNotifications.js
frontend/src/lib/api.js                 (append-only — merge target)
frontend/package.json
frontend/vite.config.js
frontend/eslint.config.js
frontend/index.html

docker-compose.yml
docker-compose.dev.yml
docker-compose.vps.yml
Dockerfile
Dockerfile.dev
Caddyfile
.dockerignore
.env.example
DEPLOY.md
CLAUDE.md
WORKTREE_PLAN.md
```

---

## Hot files — cross-worktree contract

These files are touched by multiple worktrees' work but **owned by one**. Other worktrees must leave a `HANDOFF.md` note instead of editing directly.

| File | Owner | Other worktrees that need changes |
|------|-------|----------------------------------|
| `backend/app/main.py` | wt-infra | wt-platform (new routes), wt-billing (new middleware), wt-ecourts (new routes), wt-intel (new routes) |
| `backend/app/config.py` | wt-infra | wt-billing (new audit settings), wt-platform (new auth settings), wt-ecourts (new ecourts settings) |
| `backend/app/db.py` | wt-infra | Rarely — new DB connections only |
| `frontend/src/App.jsx` | wt-infra | wt-search (search lifecycle), wt-intel (new tab imports), wt-billing (credit provider wiring) |
| `frontend/src/lib/api.js` | wt-infra | All feature worktrees append new API functions |
| `backend/requirements.txt` | wt-infra | Any worktree adding a Python dependency |

### HANDOFF.md protocol

When a feature worktree needs a change in a hot file it does not own:

1. Create a `HANDOFF.md` in the worktree root
2. Add an entry describing the change needed:
   ```
   ## main.py
   - Register new router: `from app.routes import my_new_route`
   - Mount: `app.include_router(my_new_route.router, prefix="/api/my-new-route")`

   ## config.py
   - Add field: `my_new_setting: str = "default"`

   ## lib/api.js
   - Add function: `export async function myNewEndpoint(params) { return apiFetch("/api/my-new-route", { method: "POST", body: params }) }`
   ```
3. The wt-infra session reads all HANDOFF.md files during merge and applies them.

---

## Merge order and procedure

Merge from least-coupled to most-coupled. Each merge is a separate step — do not batch.

### Phase 1 — Independent features (no hot-file conflicts)

```
1. git merge wt-ecourts     # zero overlap, cleanest merge
2. git merge wt-billing     # stable interfaces, self-contained
```

### Phase 2 — Subsystems (may have lib/api.js additions)

```
3. git merge wt-platform    # auth subsystem, may add to lib/api.js
4. git merge wt-intel       # specialty routes, may add to lib/api.js
```

### Phase 3 — Core (owns the most shared files)

```
5. git merge wt-search      # owns search lifecycle, EntityBadge, hooks
```

### Phase 4 — Orchestrator (applies all HANDOFF.md changes, resolves conflicts)

```
6. Apply all HANDOFF.md changes to main.py, config.py, App.jsx, lib/api.js
7. Run: docker compose -f docker-compose.dev.yml up --build
8. Verify: hit /api/health, run a search, check each tab, test login
9. Final commit on develop
```

### Merge checklist (for the orchestrator)

For each branch merge:
- [ ] `git merge --no-ff wt-<name>` — preserve branch history
- [ ] Check for conflicts in hot files — resolve using HANDOFF.md
- [ ] Read that worktree's HANDOFF.md for deferred changes
- [ ] `cd frontend && npm run lint && npm run build` — frontend still compiles
- [ ] `cd backend && python -c "from app.main import app"` — backend still imports
- [ ] Delete the merged branch: `git branch -d wt-<name>`

---

## Interface contracts

These are the stable interfaces between worktrees. Changes to these signatures must be coordinated.

### Audit (wt-billing → consumed by wt-search, wt-platform, wt-ecourts)

```python
from app.audit import audit_service  # or audit

audit_service.log_search(user_id=..., search_type=..., search_value=..., ...)
audit_service.log_auth(action=..., detail=...)
audit_service.log_from_request(request, category=..., action=..., detail=...)
audit_service.log_data_access(user_id=..., action=..., detail=...)
audit_service.log_export(user_id=..., action=..., detail=...)
```

### Credits (wt-billing → consumed by wt-search, wt-intel, wt-ecourts)

```python
from app.credits import require_credits, get_balance, get_usage, get_cost_matrix, ENGINE_COST_KEYS

# As a FastAPI dependency:
@router.post("/search", dependencies=[Depends(require_credits("combined_search", use_engine_cost=True))])

# Direct calls:
get_action_cost("ecourts_search")  # returns int
get_balance(user_dict)             # returns balance dict
```

### Engines (wt-search → consumed by wt-intel, wt-ecourts)

```python
from app.engines import credmon, darkmon, fti

credmon.search(query, max_depth=2)  # returns dict
darkmon.search_author(username)     # returns dict
fti.search(query)                   # returns dict
```

### Auth middleware (wt-platform → consumed by all)

```python
# request.state.user is set by SaptangAuthMiddleware and available in all routes:
user = request.state.user
# {"id": str, "username": str, "role": str, "jti": str, "permissions": [...]}
```

---

## Dependency graph (for conflict prediction)

```
wt-infra ←── owns ──→ main.py, config.py, db.py, App.jsx, lib/api.js
    ↑ merges all
    │
    ├── wt-ecourts     (isolated — routes/ecourts*, EcourtsTab)
    │     └── consumes: engines.fti, audit, credits
    │
    ├── wt-billing     (isolated — audit.py, credits.py, their routes + UI)
    │     └── consumes: config, db
    │     └── consumed by: wt-search, wt-intel, wt-ecourts, wt-platform
    │
    ├── wt-platform    (isolated — platform/*, auth routes, admin pages)
    │     └── consumes: config, db, platform/audit (NOT app/audit)
    │     └── consumed by: auth_middleware → all routes
    │
    ├── wt-intel       (isolated — specialty routes + tabs)
    │     └── consumes: engines, audit, credits
    │
    └── wt-search      (core — engines, search routes, breach tabs)
          └── consumes: engines (owns them), audit, credits
          └── consumed by: wt-intel (engine interfaces), App.jsx (search lifecycle)
```
