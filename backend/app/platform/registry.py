"""
Route-Permission Registry — maps API paths to required permissions.
"""
import re
from dataclasses import dataclass, field


@dataclass
class RouteRule:
    pattern: str
    method: str
    permission: str
    _regex: re.Pattern = field(init=False, repr=False)

    def __post_init__(self):
        regex_str = re.sub(r"\{[^}]+\}", r"[^/]+", self.pattern)
        self._regex = re.compile(f"^{regex_str}$")

    def matches(self, path: str, method: str) -> bool:
        if self.method != "*" and self.method != method:
            return False
        return bool(self._regex.match(path))


class RoutePermissionMap:
    def __init__(self):
        self.rules: list[RouteRule] = []

    def add(self, pattern: str, method: str, permission: str):
        self.rules.append(RouteRule(pattern, method, permission))

    def match(self, path: str, method: str) -> str | None:
        for rule in self.rules:
            if rule.matches(path, method):
                return rule.permission
        return None


ROUTE_PERMISSION_MAP = RoutePermissionMap()

# ── Search ─────────────────────────────────────────────────────
ROUTE_PERMISSION_MAP.add("/api/search", "POST", "feature.search")
ROUTE_PERMISSION_MAP.add("/api/stream/search", "POST", "feature.search.stream")
ROUTE_PERMISSION_MAP.add("/api/v2/search", "POST", "feature.search.stream")

# ── Dashboard ──────────────────────────────────────────────────
ROUTE_PERMISSION_MAP.add("/api/dashboard/fraud-upis", "GET", "feature.dashboard.view")
ROUTE_PERMISSION_MAP.add("/api/dashboard/total-info", "GET", "feature.dashboard.view")
ROUTE_PERMISSION_MAP.add("/api/dashboard/world-check", "GET", "feature.dashboard.view")
ROUTE_PERMISSION_MAP.add("/api/dashboard/world-check/debug", "GET", "feature.dashboard.debug")
ROUTE_PERMISSION_MAP.add("/api/dashboard/dw/forums", "GET", "feature.dashboard.view")
ROUTE_PERMISSION_MAP.add("/api/dashboard/dw/dread", "GET", "feature.dashboard.view")
ROUTE_PERMISSION_MAP.add("/api/dashboard/dw/markets", "GET", "feature.dashboard.view")
ROUTE_PERMISSION_MAP.add("/api/dashboard/dw/crypto", "GET", "feature.dashboard.view")
ROUTE_PERMISSION_MAP.add("/api/dashboard/dw/health", "GET", "feature.dashboard.view")

# ── Stats ──────────────────────────────────────────────────────
ROUTE_PERMISSION_MAP.add("/api/stats/platform", "GET", "feature.dashboard.view")

# ── Dark Web ───────────────────────────────────────────────────
ROUTE_PERMISSION_MAP.add("/api/darkweb/author/{username}", "GET", "feature.darkweb.author")
ROUTE_PERMISSION_MAP.add("/api/darkweb/dread", "GET", "feature.darkweb.dread")
ROUTE_PERMISSION_MAP.add("/api/darkweb/wallet/{address}", "GET", "feature.darkweb.wallet")
ROUTE_PERMISSION_MAP.add("/api/darkweb/overview", "GET", "feature.darkweb.overview")

# ── Drugs ──────────────────────────────────────────────────────
ROUTE_PERMISSION_MAP.add("/api/drugs/stats", "GET", "feature.drugs.view")
ROUTE_PERMISSION_MAP.add("/api/drugs/search", "GET", "feature.drugs.search")
ROUTE_PERMISSION_MAP.add("/api/drugs/india", "GET", "feature.drugs.view")

# ── Telegram ───────────────────────────────────────────────────
ROUTE_PERMISSION_MAP.add("/api/telegram/mentions/{phone}", "GET", "feature.telegram.mentions")
ROUTE_PERMISSION_MAP.add("/api/telegram/search", "GET", "feature.telegram.search")

# ── Financial ──────────────────────────────────────────────────
ROUTE_PERMISSION_MAP.add("/api/financial/upi/{phone}", "GET", "feature.financial.upi")
ROUTE_PERMISSION_MAP.add("/api/financial/bank", "GET", "feature.financial.bank")
ROUTE_PERMISSION_MAP.add("/api/financial/crypto/{wallet_address}", "GET", "feature.financial.crypto")
ROUTE_PERMISSION_MAP.add("/api/financial/screen/{name}", "GET", "feature.financial.screen")
ROUTE_PERMISSION_MAP.add("/api/financial/fraud-upis", "GET", "feature.financial.fraud_upis")
ROUTE_PERMISSION_MAP.add("/api/financial/bank-accounts", "GET", "feature.financial.bank_accounts")

# ── Graph ──────────────────────────────────────────────────────
ROUTE_PERMISSION_MAP.add("/api/graph/build", "POST", "feature.graph.build")

# ── Report ─────────────────────────────────────────────────────
ROUTE_PERMISSION_MAP.add("/api/report/json", "POST", "feature.report.generate")

# ── eCourts (cached) ──────────────────────────────────────────
ROUTE_PERMISSION_MAP.add("/api/ecourts/coverage", "GET", "feature.ecourts.cached")
ROUTE_PERMISSION_MAP.add("/api/ecourts/by-state", "GET", "feature.ecourts.cached")
ROUTE_PERMISSION_MAP.add("/api/ecourts/courts", "GET", "feature.ecourts.cached")
ROUTE_PERMISSION_MAP.add("/api/ecourts/case-types", "GET", "feature.ecourts.cached")

# ── eCourts (live/paid) ──────────────────────────────────────
ROUTE_PERMISSION_MAP.add("/api/ecourts/search", "POST", "feature.ecourts.search")
ROUTE_PERMISSION_MAP.add("/api/ecourts/case/{cnr}", "GET", "feature.ecourts.case")
ROUTE_PERMISSION_MAP.add("/api/ecourts/case/{cnr}/refresh", "POST", "feature.ecourts.case")
ROUTE_PERMISSION_MAP.add("/api/ecourts/case/{cnr}/orders", "GET", "feature.ecourts.orders")
ROUTE_PERMISSION_MAP.add("/api/ecourts/case/{cnr}/order/{filename}", "GET", "feature.ecourts.orders")
ROUTE_PERMISSION_MAP.add("/api/ecourts/case/{cnr}/order/{filename}/pdf", "GET", "feature.ecourts.orders")
ROUTE_PERMISSION_MAP.add("/api/ecourts/case/{cnr}/order/{filename}/ai", "GET", "feature.ecourts.ai")
ROUTE_PERMISSION_MAP.add("/api/ecourts/usage", "GET", "feature.ecourts.usage")

# ── MCA ────────────────────────────────────────────────────────
ROUTE_PERMISSION_MAP.add("/api/mca/company", "GET", "feature.mca.lookup")
ROUTE_PERMISSION_MAP.add("/api/mca/search", "GET", "feature.mca.search")
ROUTE_PERMISSION_MAP.add("/api/mca/cin/{cin}", "GET", "feature.mca.lookup")
ROUTE_PERMISSION_MAP.add("/api/mca/address", "GET", "feature.mca.search")
ROUTE_PERMISSION_MAP.add("/api/mca/industry/{nic_code}", "GET", "feature.mca.search")
ROUTE_PERMISSION_MAP.add("/api/mca/batch-name-check", "POST", "feature.mca.batch")
ROUTE_PERMISSION_MAP.add("/api/mca/stats", "GET", "feature.mca.stats")
ROUTE_PERMISSION_MAP.add("/api/mca/roc/{roc_code}", "GET", "feature.mca.search")

# ── Admin ──────────────────────────────────────────────────────
ROUTE_PERMISSION_MAP.add("/api/admin/users", "GET", "admin.users.list")
ROUTE_PERMISSION_MAP.add("/api/admin/users", "POST", "admin.users.create")
ROUTE_PERMISSION_MAP.add("/api/admin/users/{user_id}", "GET", "admin.users.read")
ROUTE_PERMISSION_MAP.add("/api/admin/users/{user_id}", "PATCH", "admin.users.update")
ROUTE_PERMISSION_MAP.add("/api/admin/users/{user_id}", "DELETE", "admin.users.delete")
ROUTE_PERMISSION_MAP.add("/api/admin/users/{user_id}/reset-password", "POST", "admin.users.reset_password")
ROUTE_PERMISSION_MAP.add("/api/admin/users/{user_id}/unlock", "POST", "admin.users.update")
ROUTE_PERMISSION_MAP.add("/api/admin/users/{user_id}/sessions", "DELETE", "admin.users.update")
ROUTE_PERMISSION_MAP.add("/api/admin/config", "GET", "admin.settings.read")
ROUTE_PERMISSION_MAP.add("/api/admin/config", "PATCH", "admin.settings.update")
ROUTE_PERMISSION_MAP.add("/api/admin/audit-log", "GET", "admin.audit.read")
ROUTE_PERMISSION_MAP.add("/api/admin/roles", "GET", "admin.roles.list")
ROUTE_PERMISSION_MAP.add("/api/admin/roles", "POST", "admin.roles.create")
ROUTE_PERMISSION_MAP.add("/api/admin/roles/{role_id}", "GET", "admin.roles.read")
ROUTE_PERMISSION_MAP.add("/api/admin/roles/{role_id}", "PUT", "admin.roles.update")
ROUTE_PERMISSION_MAP.add("/api/admin/roles/{role_id}", "DELETE", "admin.roles.delete")

# ── Audit (comprehensive) ───────────────────────────────────
ROUTE_PERMISSION_MAP.add("/api/audit/events", "GET", "admin.audit.read")
ROUTE_PERMISSION_MAP.add("/api/audit/activity/feed", "GET", "admin.audit.read")
ROUTE_PERMISSION_MAP.add("/api/audit/activity/active-users", "GET", "admin.audit.read")
ROUTE_PERMISSION_MAP.add("/api/audit/analytics/searches-by-hour", "GET", "admin.audit.read")
ROUTE_PERMISSION_MAP.add("/api/audit/analytics/top-users", "GET", "admin.audit.read")
ROUTE_PERMISSION_MAP.add("/api/audit/analytics/failed-logins", "GET", "admin.audit.read")
ROUTE_PERMISSION_MAP.add("/api/audit/analytics/search-frequency", "GET", "admin.audit.read")
ROUTE_PERMISSION_MAP.add("/api/audit/analytics/user-timeline", "GET", "admin.audit.read")
ROUTE_PERMISSION_MAP.add("/api/audit/analytics/rollup", "POST", "admin.audit.read")
ROUTE_PERMISSION_MAP.add("/api/audit/verify-chain", "GET", "admin.audit.read")
ROUTE_PERMISSION_MAP.add("/api/audit/export/csv", "GET", "admin.audit.export")
ROUTE_PERMISSION_MAP.add("/api/audit/export/json", "GET", "admin.audit.export")
