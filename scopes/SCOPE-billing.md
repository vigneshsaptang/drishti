# Scope: wt-billing

You are working in the **wt-billing** worktree. You own the audit logging system and the credit/billing system — two cross-cutting services consumed by every other worktree.

## Your files (you may edit these freely)

### Backend — audit system
```
backend/app/audit.py                     # AuditService singleton: buffered writes, tamper-evident chain, hourly rollup
backend/app/audit_context_middleware.py   # injects request_id, client_ip, user_agent into request.state
backend/app/routes/audit_admin.py        # admin audit log viewer, export CSV/JSON, integrity check
```

### Backend — credit system
```
backend/app/credits.py                   # cost matrix, check/deduct, refund, dedup, require_credits dependency
backend/app/credit_headers_middleware.py  # injects X-Credit-Balance headers into responses
backend/app/routes/credits.py            # GET /api/credits/balance, /usage, /costs
```

### Frontend — credit UI
```
frontend/src/components/CreditPanel.jsx   # detailed credit usage panel (breakdown by action, daily trend)
frontend/src/components/CreditBar.jsx     # compact credit balance indicator in header
frontend/src/lib/creditContext.jsx        # CreditProvider context, useCredits hook, polling
```

### Frontend — audit UI
```
frontend/src/components/ActivityFeed.jsx  # audit event list with filtering
frontend/src/components/SearchHistoryPanel.jsx  # user's search history timeline
frontend/src/pages/AdminCredits.jsx       # admin credit management (topup, adjust, transaction log)
frontend/src/pages/AdminAuditLog.jsx      # admin audit log viewer with filters and export
```

## Files you may READ but must NOT edit

```
backend/app/config.py                    # you read settings.audit_*, credits_* — don't add fields
backend/app/db.py                        # you call get_audit(), get_platform_db() — don't modify
backend/app/platform/audit.py            # DIFFERENT audit system — owned by wt-platform, ignore it
frontend/src/App.jsx                     # wires CreditProvider — don't modify
frontend/src/lib/api.js                  # contains credit/audit API functions — don't add here
```

## CRITICAL: two audit systems — don't confuse them

| Module | Owner | DB | Purpose |
|--------|-------|----|---------|
| `backend/app/audit.py` | **You (wt-billing)** | `MONGO_URI_AUDIT` → audit DB | App-level: search logs, data access, tamper-evident chain, analytics rollup |
| `backend/app/platform/audit.py` | **wt-platform** | `get_platform_db()` → platform DB | Platform-level: login events, user CRUD, config changes |

You own `app/audit.py`. Do NOT import or modify `app/platform/audit.py`.

## Your public interfaces (consumed by all other worktrees)

These are the contracts you maintain. Other worktrees depend on these — changing signatures requires coordination.

### Audit interface

```python
from app.audit import audit_service  # singleton AuditService instance

# Search logging (used by wt-search: search.py, search_v2.py, stream.py)
audit_service.log_search(
    user_id: str | None,
    username: str | None,
    session_id: str | None = None,
    client_ip: str | None = None,
    user_agent: str | None = None,
    request_id: str | None = None,
    search_type: str,              # "email", "phone", "name", etc.
    search_value: str,             # raw query (hashed if audit_store_plaintext=False)
    seeds: list[dict] | None,     # v2 multi-seed format
    max_depth: int,
    endpoint: str,                 # "/api/search", "/api/v2/search", "/api/stream/search"
    response_time_ms: int,
    result_summary: dict,          # {credmon_entities_found, fti_crimedata_matches, ...}
    is_pivot: bool = False,
    pivot_from: dict | None = None,
)

# Auth logging (used by wt-platform: auth.py)
audit_service.log_auth(
    action: str,                   # "login_success", "login_failure", "logout", "token_refresh"
    client_ip: str | None,
    user_agent: str | None,
    detail: dict,                  # {user_id, username, session_id, ...}
)

# Generic logging from a request (used by wt-ecourts, wt-intel)
audit_service.log_from_request(
    request,                       # FastAPI Request object
    category: str,                 # "ecourts", "darkweb", "financial", etc.
    action: str,                   # "ecourts.search", "darkweb.author_lookup", etc.
    severity: str = "info",
    detail: dict | None = None,
    response_time_ms: int | None = None,
)

# Data access logging (used by wt-ecourts, wt-intel)
audit_service.log_data_access(
    user_id: str | None,
    username: str | None,
    client_ip: str | None,
    request_id: str | None,
    action: str,
    detail: dict,
)

# Export logging
audit_service.log_export(
    user_id: str | None,
    username: str | None,
    client_ip: str | None,
    action: str,
    detail: dict,
)

# Session tracking (used by wt-platform: auth_middleware.py)
audit_service.touch_session(session_id, user_id, username, client_ip, user_agent)
audit_service.create_session_record(session_id, user_id, username, expires_at, client_ip, user_agent)

# Lifecycle (used by wt-infra: main.py)
audit_service.start()
audit_service.stop()
```

### Credits interface

```python
from app.credits import require_credits, get_balance, get_usage, get_cost_matrix
from app.credits import get_action_cost, get_engine_cost, ENGINE_COST_KEYS

# As a FastAPI dependency (used by wt-search, wt-intel, wt-ecourts)
@router.post("/search", dependencies=[Depends(require_credits("combined_search", use_engine_cost=True))])
@router.post("/ecourts/search", dependencies=[Depends(require_credits("ecourts_search"))])
@router.get("/darkweb/author/{u}", dependencies=[Depends(require_credits("darkmon_search"))])

# Direct calls
get_action_cost("ecourts_search")       # → 25
get_engine_cost(["breach", "darkweb"])   # → 5 + 3 = 8
get_balance(user_dict)                   # → {period, credits_used, credits_remaining, ...}
get_cost_matrix()                        # → {"combined_search": 10, ...}

# ENGINE_COST_KEYS mapping
ENGINE_COST_KEYS = {
    "breach": "credmon_search",          # 5 credits
    "threat_intel": "fti_screening",     # 3 credits
    "darkweb": "darkmon_search",         # 3 credits
    "financial": "financial_screening",  # 2 credits
    "ecourts": "ecourts_search",         # 25 credits
}
```

## Internal architecture you own

### Audit internals
- **Buffer**: events accumulate in a `deque(maxlen=10_000)`, flushed every `audit_flush_interval_s` seconds by a background thread
- **Tamper-evident chain**: each event gets an HMAC-SHA256 hash linking to the previous event's hash. Chain state stored in `audit_events` collection → `chain_state` doc
- **Search history**: separate buffer → `search_history` collection with TTL index (`audit_search_history_days`)
- **Hourly rollup**: background thread aggregates search stats into `analytics_daily` collection (search counts, p95 latency, per-user breakdown, auth events)
- **Masking**: if `audit_store_plaintext=False`, search values are SHA-256 hashed before storage
- **Active sessions**: `touch_session()` debounces to 1 write per 60s per session

### Credit internals
- **Cost matrix**: stored in `credit_config` collection, cached for 300s. Fallback: `DEFAULT_COST_MATRIX`
- **Balance tracking**: per-user, per-month in `credit_balances` collection. Daily usage tracked as `daily_usage.{day}` sub-field
- **Dedup**: identical searches within 15 minutes are not re-charged. Hash stored in `recent_searches` with TTL index
- **Overage policies**: `"hard"` = HTTP 402/429, `"soft"` = deduct and warn
- **Role limits**: admin/super_admin = unlimited, analyst = 1000/month + 100/day, viewer = 200/month + 30/day
- **Transactions**: every debit/credit/topup/refund is logged to `credit_transactions` collection

## Config settings you depend on (from wt-infra)

```python
# Audit settings
settings.mongo_uri_audit              # audit DB connection string (empty = audit disabled)
settings.audit_db_name                # default: "sigint_audit"
settings.audit_buffer_size            # max buffer before force-flush
settings.audit_flush_interval_s       # flush frequency (default: 5.0)
settings.audit_retention_days         # TTL for audit events
settings.audit_search_history_days    # TTL for search history
settings.audit_analytics_retention_days  # TTL for daily analytics
settings.audit_store_plaintext        # whether to store raw search values
settings.audit_hmac_key               # HMAC key for chain hashing

# Credit settings
settings.credits_enabled              # master toggle (False = all credits skipped)
```

## When you need something outside your scope

Write to `HANDOFF.md`:

```markdown
## config.py
- Add: `audit_export_format: str = "json"`
- Add: `credits_low_balance_threshold: int = 50`

## main.py
- Register new route: `app.include_router(credits_webhook.router, prefix="/api/credits/webhook")`

## lib/api.js
- Add function:
  ```js
  export async function getAuditIntegrityReport() {
    return apiFetch('/api/audit/integrity')
  }
  ```
```

## Testing

```bash
docker compose -f docker-compose.dev.yml up --build -d
cd frontend && npm run dev
```

### Audit tests
1. Run a search → check `audit_events` collection has a new entry with correct chain hash
2. Check `search_history` collection populated
3. Wait >1 hour (or trigger manually) → `analytics_daily` rollup appeared
4. Admin audit log page → events render, filters work, CSV/JSON export works
5. With `AUDIT_STORE_PLAINTEXT=false` → search values are hashed in audit_events

### Credit tests
1. Run a search as analyst → credits deducted, `X-Credit-Balance` header in response
2. Run same search again within 15 min → dedup: no charge
3. CreditBar in header shows updated balance
4. CreditPanel shows breakdown by action type and daily trend
5. Admin topup → balance increases
6. Exceed daily limit as viewer (hard overage) → HTTP 429
7. Exceed monthly limit as analyst (soft overage) → search succeeds with warning
8. AdminCredits page → transaction log renders, topup form works

### Integration: verify other worktrees still work
After making changes, confirm the interfaces still work:
```bash
# The import that all other worktrees use:
python -c "from app.audit import audit_service; print(audit_service.enabled)"
python -c "from app.credits import require_credits, get_balance, ENGINE_COST_KEYS; print('OK')"
```
