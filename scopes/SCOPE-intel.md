# Scope: wt-intel

You are working in the **wt-intel** worktree. You own the specialty intelligence tabs and their backend routes — darkweb, drugs, telegram, financial, graph visualization, dashboard, stats, and report generation.

## Your files (you may edit these freely)

### Backend — specialty routes
```
backend/app/routes/darkweb.py            # darkweb author deep-dive, post search
backend/app/routes/drugs.py              # drug stats, India vendor listing, drug search
backend/app/routes/telegram.py           # telegram message search
backend/app/routes/financial.py          # fraud UPIs, bank accounts, crypto trace
backend/app/routes/mca.py               # MCA company lookup, batch search
backend/app/routes/graph.py             # entity relationship graph builder
backend/app/routes/dashboard.py         # dashboard stats and metrics
backend/app/routes/stats.py             # collection-level statistics
backend/app/routes/report.py            # PDF/DOCX report generation endpoint
```

### Frontend — intelligence tabs
```
frontend/src/tabs/DarkwebTab.jsx         # darkweb forum posts, author profiles
frontend/src/tabs/DrugsTab.jsx           # drug marketplace analytics, vendor listing
frontend/src/tabs/TelegramTab.jsx        # telegram message search and display
frontend/src/tabs/FinancialTab.jsx       # UPI fraud, bank accounts, crypto, Leaflet map
frontend/src/tabs/GraphTab.jsx           # D3 force/hierarchy graph visualization
```

### Frontend — tab-specific components
```
frontend/src/components/OnionLink.jsx    # .onion URL display with copy-to-clipboard
frontend/src/components/DrugRouteMap.jsx  # Leaflet drug route visualization
frontend/src/components/Lightbox.jsx     # evidence image viewer (EvidenceImage)
frontend/src/components/DashboardIdle.jsx # idle state dashboard display
```

### Frontend — tab-specific libs
```
frontend/src/lib/ontology.js             # EDGE_TYPES for graph rendering
frontend/src/lib/reportGenerator.js      # client-side PDF/report generation
```

## Files you may READ but must NOT edit

```
backend/app/engines/credmon.py           # darkweb.py and graph.py may call credmon — don't modify
backend/app/engines/darkmon.py           # you call darkmon.search_* — don't modify the engine
backend/app/engines/fti.py              # you call fti.search — don't modify the engine
backend/app/config.py                   # read settings — don't add fields
backend/app/db.py                       # read get_credmon/get_fti — don't modify
backend/app/audit.py                    # call audit_service methods — don't modify
backend/app/credits.py                  # use require_credits — don't modify
frontend/src/App.jsx                    # renders your tabs — don't modify
frontend/src/lib/api.js                 # contains your API functions — don't add new ones here
frontend/src/lib/breach.js              # GraphTab imports classifyBreach, getRecency — don't modify
frontend/src/components/EntityBadge.jsx  # DarkwebTab uses this — owned by wt-search
```

## What you consume (stable interfaces)

### Engines (from wt-search)
```python
from app.engines import credmon, darkmon, fti

# DARKMON — used by darkweb.py, drugs.py
darkmon.search_author(username)
darkmon.search_posts(query)

# FTI — used by telegram.py, financial.py, mca.py
fti.search(query)
fti.search_mobile(number)
fti.search_upi(upi_id)

# CREDMON — used by dashboard.py, graph.py
credmon.search(query, max_depth=1)
```

### Audit (from wt-billing)
```python
from app.audit import audit_service
audit_service.log_from_request(request, category="darkweb", action="darkweb.author_lookup", detail={...})
audit_service.log_data_access(user_id=..., action="financial.upi_lookup", detail={...})
```

### Credits (from wt-billing)
```python
from app.credits import require_credits
@router.get("/author/{username}", dependencies=[Depends(require_credits("darkmon_search"))])
```

### Breach classification (from wt-search)
```javascript
// GraphTab uses these — stable exports, don't expect changes
import { classifyBreach, getRecency } from '../lib/breach'
```

### Data shape (from wt-search via App.jsx)
```javascript
// Your tabs receive `data` and `onPivot` as props
// data.darkweb  → DARKMON results (DarkwebTab)
// data.fti      → FTI results (TelegramTab, FinancialTab)
// data.breach   → CREDMON results (GraphTab uses this for node building)
// onPivot(type, value) → triggers a new search from App.jsx
```

## Tab coupling notes

Each tab is independent of the others. No shared components between your tabs:
- `OnionLink` → only DarkwebTab
- `DrugRouteMap` → only DrugsTab
- `Lightbox/EvidenceImage` → only FinancialTab
- `DashboardIdle` → only renders when no search is active

**GraphTab is the most complex.** It builds a D3 force-directed graph from all three engine results. It imports `lib/breach.js` (owned by wt-search) and `lib/ontology.js` (you own). The graph node/edge construction happens inline in GraphTab — it's self-contained but large.

**FinancialTab contains an inline Leaflet map** (BankMap sub-component) — not extracted to a shared component.

## When you need something outside your scope

Write to `HANDOFF.md`:

```markdown
## config.py
- Add: `graph_max_nodes: int = 200`

## lib/api.js
- Add function:
  ```js
  export async function getDarkwebThread(threadId) {
    return apiFetch(`/api/darkweb/thread/${threadId}`)
  }
  ```

## credits.py (for wt-billing)
- Add new action to DEFAULT_COST_MATRIX: `"darkweb_thread": 5`

## App.jsx
- Import and register new tab: `import CryptoTab from './tabs/CryptoTab'`
```

## Testing

```bash
docker compose -f docker-compose.dev.yml up --build -d
cd frontend && npm run dev
```

Test each tab independently (they don't depend on each other):

**DarkwebTab:**
1. Search for a known username → author profile loads
2. Post list renders with .onion links (copy-to-clipboard, NOT clickable)
3. No `extracted_info` searches (50s+ timeout risk)

**DrugsTab:**
1. Drug stats endpoint loads
2. India vendor listing renders
3. Drug search returns and filters correctly

**TelegramTab:**
1. Search for a phone number or keyword
2. Message list renders with timestamps and channel info

**FinancialTab:**
1. UPI fraud list loads
2. Bank account details render
3. Crypto trace data renders
4. Leaflet map pins appear for bank branches

**GraphTab:**
1. Run a search first (needs breach data)
2. Graph renders with correct node types (person, email, phone, breach)
3. Click a node → NodeDetailPanel shows details
4. Pivot from a node → triggers new search
5. Hierarchy/force layout toggle works
