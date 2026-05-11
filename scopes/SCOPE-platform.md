# Scope: wt-platform

You are working in the **wt-platform** worktree. You own the auth, RBAC, user management, session management, and support subsystem.

## Your files (you may edit these freely)

### Backend — platform core
```
backend/app/platform/__init__.py
backend/app/platform/auth.py              # JWT encode/decode, password hashing, token generation
backend/app/platform/config_store.py       # platform config CRUD (setup wizard state, app config)
backend/app/platform/sessions.py          # session create/revoke/list
backend/app/platform/models.py            # Pydantic models (CreateUserRequest, UpdateUserRequest, etc.)
backend/app/platform/registry.py          # ROUTE_PERMISSION_MAP — maps routes to required permissions
backend/app/platform/rbac.py              # role/permission resolution, builtin role seeding
backend/app/platform/dependencies.py      # FastAPI deps: get_current_user, require_permission, rate limit
backend/app/platform/init_db.py           # bootstrap: create admin user, seed roles, init audit
backend/app/platform/audit.py             # platform-layer audit (log_event, query_audit_log) — NOT app/audit.py
backend/app/platform/email_service.py     # SMTP sending
backend/app/platform/email_templates.py   # HTML email templates
backend/app/platform/rate_limiter.py      # per-user rate limiting
backend/app/platform/faq_service.py       # FAQ CRUD
backend/app/platform/notification_service.py  # notification CRUD
backend/app/platform/ticket_service.py    # support ticket CRUD
backend/app/platform/status_service.py    # system status checks (pings all 3 engine DBs + platform DB)
```

### Backend — routes and middleware
```
backend/app/routes/auth.py                # login, logout, refresh, setup, password change, captcha
backend/app/routes/admin.py               # user CRUD, role assignment, config management
backend/app/routes/support.py             # ticket list/create/reply, FAQ, notifications, system status
backend/app/auth_middleware.py            # SaptangAuthMiddleware — JWT validation, permission injection
backend/app/brute_force.py               # login attempt tracking and lockout
backend/app/captcha.py                   # CAPTCHA generation and verification
```

### Frontend — auth flow
```
frontend/src/AuthGate.jsx                 # boot orchestrator: setup → login → force-password-change → app
frontend/src/components/LoginPage.jsx
frontend/src/components/SetupWizard.jsx
frontend/src/components/ForcePasswordChange.jsx
frontend/src/lib/auth.js                  # token storage, JWT decode, login/logout, getAuthHeaders
frontend/src/lib/fingerprint.js           # browser fingerprinting for session tracking
```

### Frontend — user/session management
```
frontend/src/components/ProfileDialog.jsx   # change password, update profile
frontend/src/components/SessionList.jsx     # view/revoke sessions
frontend/src/components/ApiKeyManager.jsx   # API key create/revoke
frontend/src/components/UserMenu.jsx        # dropdown: profile, sessions, sign out
frontend/src/components/Header.jsx          # top bar (contains UserMenu, CreditBar, NotificationBell)
frontend/src/components/Can.jsx             # RBAC wrapper: <Can permission="admin.users">...</Can>
frontend/src/lib/permissions.jsx            # PermissionProvider context, usePermission hooks
```

### Frontend — admin pages
```
frontend/src/pages/AdminUsers.jsx           # user list, create, edit, delete
frontend/src/pages/AdminConfig.jsx          # platform config editor
frontend/src/pages/AdminRoles.jsx           # role list, create, edit permissions
```

### Frontend — support system
```
frontend/src/admin/FaqManager.jsx           # admin FAQ editor
frontend/src/admin/StatusManager.jsx        # admin status message manager
frontend/src/admin/TicketManager.jsx        # admin ticket inbox
frontend/src/components/MyTickets.jsx       # user's own tickets
frontend/src/components/FaqPage.jsx         # public FAQ viewer
frontend/src/components/StatusPage.jsx      # system status page
frontend/src/components/FeedbackFab.jsx     # floating feedback button
frontend/src/components/FeedbackModal.jsx   # feedback/ticket submission form
```

## Files you may READ but must NOT edit

```
backend/app/config.py                     # you read settings.saptang_jwt_secret, etc. — don't add fields
backend/app/db.py                         # you call get_platform_db() — don't modify
backend/app/audit.py                      # this is wt-billing's app-level audit — you use platform/audit.py
backend/app/credits.py                    # you don't directly touch credits
frontend/src/App.jsx                      # renders your overlays — don't modify
frontend/src/lib/api.js                   # contains your API functions — don't add new ones here
frontend/src/lib/creditContext.jsx        # CreditProvider wraps in AuthGate — owned by wt-billing
```

## Important: two audit systems

There are TWO separate audit modules — don't confuse them:

| Module | Owner | Purpose |
|--------|-------|---------|
| `backend/app/audit.py` | **wt-billing** | App-level audit: search logs, data access, tamper-evident chain |
| `backend/app/platform/audit.py` | **wt-platform (you)** | Platform audit: login events, user CRUD, config changes |

You own `platform/audit.py`. Do NOT import or modify `app/audit.py`.

## What you consume

```python
# DB connection (read-only dependency)
from app.db import get_platform_db
db = get_platform_db()  # returns the platform MongoDB database

# Config (read-only dependency)
from app.config import settings
settings.saptang_jwt_secret
settings.saptang_admin_password
settings.access_token_expire_minutes
settings.refresh_token_expire_days
```

## What others consume from you

The auth middleware sets `request.state.user` on every authenticated request. All other worktrees depend on this shape:

```python
request.state.user = {
    "id": str,              # user ObjectId as string
    "username": str,
    "role": str,            # "admin" | "super_admin" | "analyst" | "viewer"
    "jti": str,             # JWT token ID (session ID)
    "permissions": [str],   # resolved permission list
    "session_id": str,      # same as jti
}
```

**Do not change this shape without coordinating with all worktrees.** It is the universal auth contract.

## When you need something outside your scope

Write to `HANDOFF.md`:

```markdown
## config.py
- Add: `password_min_length: int = 12`
- Add: `max_sessions_per_user: int = 5`

## main.py
- No changes needed (auth routes already registered)

## lib/api.js
- Add function:
  ```js
  export async function adminResetPassword(userId) {
    return apiFetch(`/api/admin/users/${userId}/reset-password`, { method: "POST" })
  }
  ```
```

## Testing

```bash
docker compose -f docker-compose.dev.yml up --build -d
cd frontend && npm run dev
```

Test matrix:
1. Fresh setup wizard (clear platform DB, restart)
2. Login → token refresh → logout
3. Session list shows current session, revoke works
4. Admin user CRUD (create analyst, change role, delete)
5. RBAC: analyst cannot see admin pages, viewer cannot search
6. Password change (including force-change flow)
7. Brute force lockout (5 failed attempts)
8. CAPTCHA appears after 3 failed attempts
9. Support ticket create → admin sees it → admin replies → user sees reply
