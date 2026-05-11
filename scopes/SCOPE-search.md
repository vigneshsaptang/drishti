# Scope: wt-search

You are working in the **wt-search** worktree. You own the core search pipeline — the three engines, search/stream routes, and the primary result-rendering tabs (Overview, Breaches).

## Your files (you may edit these freely)

### Backend — engines
```
backend/app/engines/__init__.py
backend/app/engines/credmon.py            # breach data engine: BFS across Master_extracts → Leaks_referral
backend/app/engines/darkmon.py            # darkweb forum engine: author search on Dread etc.
backend/app/engines/fti.py               # threat intel engine: MOBILE_NUMBERS, UPI_ID, CrimeData, world_check, etc.
backend/app/sanitize.py                  # safe_regex() — used by darkmon and fti for input sanitization
```

### Backend — search routes
```
backend/app/routes/search.py             # POST /api/search — single JSON response, all 3 engines
backend/app/routes/search_v2.py          # POST /api/v2/search — v2 with per-engine control, seed-based
backend/app/routes/stream.py             # POST /api/stream/search — SSE streaming, progressive results
```

### Frontend — search lifecycle
```
frontend/src/hooks/useSearchV2.js         # SSE subscription hook — connects to /api/stream/search
frontend/src/hooks/useSearch.js           # legacy hook (not used by App.jsx, but you own it)
frontend/src/components/CommandBar.jsx    # search input bar
frontend/src/components/TabStrip.jsx      # tab selector (Overview, Breaches, Darkweb, etc.)
frontend/src/components/StatusLine.jsx    # "searching...", "found 42 results", etc.
frontend/src/components/V2StatsBar.jsx    # v2 stats summary bar
frontend/src/components/StatsBar.jsx      # legacy stats bar
```

### Frontend — result tabs you own
```
frontend/src/tabs/OverviewTab.jsx         # summary view: digital footprint, severity breakdown
frontend/src/tabs/BreachesV2Tab.jsx       # breach detail view: source cards, entity highlighting
frontend/src/tabs/BreachesTab.jsx         # legacy breach tab (you own it, not rendered)
frontend/src/components/EntityBadge.jsx   # colored badge for emails/phones/usernames
frontend/src/components/SubjectProfile.jsx  # top-of-page identity summary card
```

### Frontend — shared libs you own
```
frontend/src/lib/breach.js               # classifyBreach, getRecency, extractGeoIntel
frontend/src/lib/serviceMap.js           # collection → category/severity mapping
frontend/src/lib/canonicalIdentity.js    # pick best identity label from results
frontend/src/lib/canonicalLocation.js    # pick best location from results
frontend/src/lib/identifierExtract.js    # extract emails/phones/usernames from result set
frontend/src/lib/utils.js               # fieldClass, redactPassword, entityColors, STATUS_MESSAGES
```

## Files you may READ but must NOT edit

```
backend/app/config.py                    # you read settings.credmon_*, darkmon_*, etc.
backend/app/db.py                        # you call get_credmon(), get_darkmon(), get_fti()
backend/app/audit.py                     # you call audit_service.log_search() — don't modify
backend/app/credits.py                   # you use require_credits() as a dependency — don't modify
frontend/src/App.jsx                     # orchestrates your hook + tabs — don't modify
frontend/src/lib/api.js                  # contains search API calls — don't add new ones here
```

## What you consume (stable interfaces)

```python
# Audit (from wt-billing)
from app.audit import audit_service
audit_service.log_search(
    user_id=..., username=..., search_type=..., search_value=...,
    max_depth=..., endpoint=..., response_time_ms=..., result_summary=...,
    is_pivot=False, pivot_from=None,
)

# Credits (from wt-billing)
from app.credits import require_credits, ENGINE_COST_KEYS
# As a FastAPI Depends:
dependencies=[Depends(require_credits("combined_search", use_engine_cost=True))]

# DB connections (from wt-infra)
from app.db import get_credmon, get_darkmon, get_fti

# Config (from wt-infra)
from app.config import settings
settings.credmon_socket_timeout_ms
settings.darkmon_query_timeout_ms
settings.default_search_depth
```

## What others consume from you

### Engine interfaces (consumed by wt-intel, wt-ecourts)

Other worktrees import your engines. These are the public interfaces — don't break them:

```python
# CREDMON
credmon.search(query: str, max_depth: int = 2) -> dict
# Returns: {"results": [...], "entities_searched": int, "entities_found": int, ...}

# DARKMON
darkmon.search_author(username: str) -> dict
darkmon.search_posts(query: str) -> dict
# Returns: {"results": [...], "match_count": int, ...}

# FTI
fti.search(query: str) -> dict
fti.search_mobile(number: str) -> dict
fti.search_upi(upi_id: str) -> dict
# Returns: {"results": {...}, "match_count": int, ...}
```

### Shared libs (consumed by wt-intel)

`lib/breach.js` is imported by GraphTab (wt-intel). Don't change these exports:
```javascript
export function classifyBreach(collectionName) -> { severity, category, ... }
export function getRecency(dateStr) -> "recent" | "aging" | "stale"
export function extractGeoIntel(records) -> [{ country, city, ... }]
```

### Data shape contract

`App.jsx` passes `data` to all tabs. Your search hook produces this shape:

```javascript
data = {
  breach: { results: [...], stats: {...} },    // from CREDMON
  darkweb: { results: [...], stats: {...} },   // from DARKMON
  fti: { results: {...}, stats: {...} },       // from FTI
  meta: { query, searchType, timing, ... },
}
```

wt-intel tabs consume `data.darkweb`, `data.fti`, etc. Don't restructure this without coordination.

## Search pipeline architecture

```
User types query
    → CommandBar → useSearchV2 hook
    → SSE to POST /api/stream/search (or /api/v2/search for non-streaming)
    → Backend fans out:
        1. CREDMON runs first (sub-second, seeds entity sets)
        2. FTI + DARKMON run in 2-worker ThreadPoolExecutor, 60s timeout
        3. Username discovery: CREDMON breach fields → DARKMON author search
    → SSE events stream back: credmon_done → fti_done → darkmon_done → complete
    → useSearchV2 accumulates into `data` state
    → App.jsx passes `data` to active tab
```

## When you need something outside your scope

Write to `HANDOFF.md`:

```markdown
## config.py
- Add: `credmon_max_bfs_depth: int = 5`
- Add: `search_result_limit: int = 500`

## lib/api.js
- Add function:
  ```js
  export async function searchV2(params) {
    return apiFetch('/api/v2/search', { method: 'POST', body: params })
  }
  ```

## App.jsx
- Update v2ToLegacyData() to include new field: `data.breach.geo_intel`
```

## Testing

```bash
docker compose -f docker-compose.dev.yml up --build -d
cd frontend && npm run dev
```

Test matrix:
1. Email search → CREDMON results populate, breach cards render
2. Phone search → FTI results populate
3. Deep search (max_depth=3) → BFS expands entities correctly
4. SSE streaming → progressive results appear (check Network tab for EventSource)
5. Pivot → click an email in breach results → re-searches with that email
6. Timeout handling → DARKMON slow query doesn't block the whole response
7. Empty results → "no results found" state renders cleanly
8. OverviewTab → severity/category breakdown is accurate
9. EntityBadge → correct colors for email/phone/username/IP types
