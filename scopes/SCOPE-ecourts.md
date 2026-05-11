# Scope: wt-ecourts

You are working in the **wt-ecourts** worktree. You own the eCourts feature — court search, court directory, case detail, order viewer.

## Your files (you may edit these freely)

```
backend/app/routes/ecourts.py            # court directory, state/district/court listing endpoints
backend/app/routes/ecourts_search.py     # case search, case detail, order PDF, AI summary endpoints
frontend/src/tabs/EcourtsTab.jsx         # entire eCourts tab (all sub-components are inline)
frontend/src/components/CourtSearchCard.jsx  # standalone court search widget
```

## Files you may READ but must NOT edit

```
backend/app/engines/fti.py               # you call fti.search() — don't modify the engine
backend/app/config.py                    # you read settings.ecourts_* — don't add new fields here
backend/app/audit.py                     # you call audit_service.log_*() — don't modify
backend/app/credits.py                   # you use require_credits() — don't modify
frontend/src/lib/api.js                  # you call ecourts API functions — don't add new ones here
frontend/src/App.jsx                     # renders EcourtsTab — don't modify
```

## What you consume (stable interfaces)

```python
# Credits — use as FastAPI dependency
from app.credits import require_credits
@router.post("/search", dependencies=[Depends(require_credits("ecourts_search"))])

# Audit — call after operations
from app.audit import audit_service
audit_service.log_data_access(user_id=..., action="ecourts.search", detail={...})
audit_service.log_from_request(request, category="ecourts", action="ecourts.order_view", detail={...})

# FTI engine — read-only queries
from app.engines import fti
```

```javascript
// Frontend — these functions already exist in lib/api.js:
import { ecourtsSearch, getEcourtsCaseDetail, getEcourtsOrders, ecourtsOrderPdfUrl, getEcourtsAiSummary, getEcourtsByState } from '../lib/api'
```

## When you need something outside your scope

If you need:
- A **new env var** (e.g., `ECOURTS_CACHE_TTL`) → write it in `HANDOFF.md`
- A **new API function** in `lib/api.js` → write it in `HANDOFF.md`
- A **new route registered** in `main.py` → write it in `HANDOFF.md`
- A **new credit action** (e.g., `ecourts_order_ai: 20`) → write it in `HANDOFF.md`

### HANDOFF.md format

Create `HANDOFF.md` in the worktree root with entries like:

```markdown
## config.py
- Add: `ecourts_cache_ttl: int = 3600`

## lib/api.js
- Add function:
  ```js
  export async function getEcourtsCourtOrders(stateCode, districtCode, courtCode) {
    return apiFetch(`/api/ecourts/court-orders/${stateCode}/${districtCode}/${courtCode}`)
  }
  ```

## main.py
- No changes needed (routes already registered)
```

The **wt-infra** orchestrator will apply these during merge.

## Key context

- EcourtsTab is fully self-contained — all sub-components (CoverageHero, IndiaChoropleth, CourtDirectoryTable, LiveScreeningSection) are defined inline. No shared component imports.
- The eCourts API is external and costs real money per call. Caching matters.
- Read the memory files `court_directory_status.md` and `ecourts_api_caveats.md` before making changes.
- The `ecourts_search` credit action costs 25 credits — highest in the system. Be mindful of unnecessary API calls.

## Testing

```bash
# Start backend
docker compose -f docker-compose.dev.yml up --build -d

# Start frontend
cd frontend && npm run dev

# Verify endpoints
curl http://localhost:8888/api/ecourts/states
curl http://localhost:8888/api/ecourts/courts/coverage
```

Open `http://localhost:4444`, navigate to the eCourts tab, and test:
1. Court directory loads and filters work
2. Case search returns results
3. Case detail view renders
4. Order PDF links work
