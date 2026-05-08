"""
Role-Based Access Control — role definitions, permission constants, groups, and resolution.
"""
import time
import threading
from datetime import datetime, timezone

from app.db import get_platform_db

ALL_PERMISSIONS = frozenset([
    # Engine permissions
    "engine.credmon.search", "engine.credmon.read", "engine.credmon.export",
    "engine.darkmon.search", "engine.darkmon.read", "engine.darkmon.export",
    "engine.fti.search", "engine.fti.read", "engine.fti.export",
    # Feature permissions
    "feature.search", "feature.search.stream", "feature.search.batch",
    "feature.dashboard.view", "feature.dashboard.debug",
    "feature.graph.view", "feature.graph.build",
    "feature.report.generate", "feature.report.download",
    "feature.ecourts.cached", "feature.ecourts.search", "feature.ecourts.case",
    "feature.ecourts.orders", "feature.ecourts.ai", "feature.ecourts.usage",
    "feature.mca.search", "feature.mca.lookup", "feature.mca.batch", "feature.mca.stats",
    "feature.darkweb.overview", "feature.darkweb.dread", "feature.darkweb.wallet", "feature.darkweb.author",
    "feature.drugs.view", "feature.drugs.search",
    "feature.telegram.mentions", "feature.telegram.search",
    "feature.financial.upi", "feature.financial.bank", "feature.financial.crypto",
    "feature.financial.screen", "feature.financial.fraud_upis", "feature.financial.bank_accounts",
    # Admin permissions
    "admin.users.list", "admin.users.read", "admin.users.create",
    "admin.users.update", "admin.users.delete", "admin.users.reset_password",
    "admin.roles.list", "admin.roles.read", "admin.roles.create",
    "admin.roles.update", "admin.roles.delete",
    "admin.audit.read", "admin.audit.export",
    "admin.settings.read", "admin.settings.update",
    "admin.promote_admin",
])

PERMISSION_GROUPS = {
    "group:all_engines": {
        "engine.credmon.search", "engine.credmon.read", "engine.credmon.export",
        "engine.darkmon.search", "engine.darkmon.read", "engine.darkmon.export",
        "engine.fti.search", "engine.fti.read", "engine.fti.export",
    },
    "group:search_full": {"feature.search", "feature.search.stream", "feature.search.batch"},
    "group:ecourts_full": {
        "feature.ecourts.cached", "feature.ecourts.search", "feature.ecourts.case",
        "feature.ecourts.orders", "feature.ecourts.ai", "feature.ecourts.usage",
    },
    "group:ecourts_readonly": {"feature.ecourts.cached"},
    "group:mca_full": {"feature.mca.search", "feature.mca.lookup", "feature.mca.batch", "feature.mca.stats"},
    "group:darkweb_full": {
        "feature.darkweb.overview", "feature.darkweb.dread", "feature.darkweb.wallet", "feature.darkweb.author",
        "feature.drugs.view", "feature.drugs.search",
    },
    "group:financial_full": {
        "feature.financial.upi", "feature.financial.bank", "feature.financial.crypto",
        "feature.financial.screen", "feature.financial.fraud_upis", "feature.financial.bank_accounts",
    },
    "group:reporting": {
        "feature.report.generate", "feature.report.download",
        "engine.credmon.export", "engine.darkmon.export", "engine.fti.export",
    },
    "group:user_management": {
        "admin.users.list", "admin.users.read", "admin.users.create",
        "admin.users.update", "admin.users.delete", "admin.users.reset_password",
    },
    "group:audit_readonly": {"admin.audit.read", "admin.audit.export", "admin.settings.read"},
}

_ALL_ENGINE = {
    "engine.credmon.search", "engine.credmon.read", "engine.credmon.export",
    "engine.darkmon.search", "engine.darkmon.read", "engine.darkmon.export",
    "engine.fti.search", "engine.fti.read", "engine.fti.export",
}

_ALL_FEATURES = {
    "feature.search", "feature.search.stream", "feature.search.batch",
    "feature.dashboard.view", "feature.dashboard.debug",
    "feature.graph.view", "feature.graph.build",
    "feature.report.generate", "feature.report.download",
    "feature.ecourts.cached", "feature.ecourts.search", "feature.ecourts.case",
    "feature.ecourts.orders", "feature.ecourts.ai", "feature.ecourts.usage",
    "feature.mca.search", "feature.mca.lookup", "feature.mca.batch", "feature.mca.stats",
    "feature.darkweb.overview", "feature.darkweb.dread", "feature.darkweb.wallet", "feature.darkweb.author",
    "feature.drugs.view", "feature.drugs.search",
    "feature.telegram.mentions", "feature.telegram.search",
    "feature.financial.upi", "feature.financial.bank", "feature.financial.crypto",
    "feature.financial.screen", "feature.financial.fraud_upis", "feature.financial.bank_accounts",
}

BUILTIN_ROLES = {
    "super_admin": {
        "_id": "super_admin",
        "display_name": "Super Admin",
        "description": "Full platform access. Manages other admins and modifies built-in roles.",
        "level": 100,
        "is_builtin": True,
        "permissions": sorted(ALL_PERMISSIONS),
        "limits": {
            "max_search_depth": 10,
            "max_entities_per_depth": 500,
            "max_seeds_per_search": 20,
            "rate": {
                "searches_per_hour": -1,
                "exports_per_hour": -1,
                "ecourts_calls_per_day": -1,
                "mca_lookups_per_hour": -1,
            },
        },
    },
    "admin": {
        "_id": "admin",
        "display_name": "Admin",
        "description": "Full operational access. Manages analysts and viewers.",
        "level": 80,
        "is_builtin": True,
        "permissions": sorted(
            _ALL_ENGINE | _ALL_FEATURES | {
                "admin.users.list", "admin.users.read", "admin.users.create",
                "admin.users.update", "admin.users.delete", "admin.users.reset_password",
                "admin.roles.list", "admin.roles.read",
                "admin.audit.read", "admin.audit.export", "admin.settings.read",
            }
        ),
        "limits": {
            "max_search_depth": 7,
            "max_entities_per_depth": 300,
            "max_seeds_per_search": 10,
            "rate": {
                "searches_per_hour": 200,
                "exports_per_hour": 50,
                "ecourts_calls_per_day": 500,
                "mca_lookups_per_hour": 100,
            },
        },
    },
    "analyst": {
        "_id": "analyst",
        "display_name": "Analyst",
        "description": "Core operational role. Search, view, and export across all engines.",
        "level": 50,
        "is_builtin": True,
        "permissions": sorted(
            _ALL_ENGINE | {
                "feature.search", "feature.search.stream",
                "feature.dashboard.view",
                "feature.graph.view", "feature.graph.build",
                "feature.report.generate", "feature.report.download",
                "feature.ecourts.cached", "feature.ecourts.search", "feature.ecourts.case",
                "feature.ecourts.orders",
                "feature.mca.search", "feature.mca.lookup", "feature.mca.stats",
                "feature.darkweb.overview", "feature.darkweb.dread", "feature.darkweb.wallet", "feature.darkweb.author",
                "feature.drugs.view", "feature.drugs.search",
                "feature.telegram.mentions", "feature.telegram.search",
                "feature.financial.upi", "feature.financial.bank", "feature.financial.crypto",
                "feature.financial.screen", "feature.financial.fraud_upis", "feature.financial.bank_accounts",
            }
        ),
        "limits": {
            "max_search_depth": 5,
            "max_entities_per_depth": 100,
            "max_seeds_per_search": 5,
            "rate": {
                "searches_per_hour": 60,
                "exports_per_hour": 20,
                "ecourts_calls_per_day": 100,
                "mca_lookups_per_hour": 30,
            },
        },
    },
    "viewer": {
        "_id": "viewer",
        "display_name": "Viewer",
        "description": "Read-only access. View dashboard and cached data only.",
        "level": 10,
        "is_builtin": True,
        "permissions": sorted([
            "engine.credmon.read",
            "engine.darkmon.read",
            "engine.fti.read",
            "feature.dashboard.view",
            "feature.graph.view",
            "feature.ecourts.cached",
            "feature.mca.stats",
            "feature.darkweb.overview",
            "feature.drugs.view",
        ]),
        "limits": {
            "max_search_depth": 0,
            "max_entities_per_depth": 0,
            "max_seeds_per_search": 0,
            "rate": {
                "searches_per_hour": 0,
                "exports_per_hour": 0,
                "ecourts_calls_per_day": 0,
                "mca_lookups_per_hour": 0,
            },
        },
    },
}

ROLE_LEVELS = {role_id: data["level"] for role_id, data in BUILTIN_ROLES.items()}

# ── Permission resolution with caching ────────────────────────────────────

_perm_cache: dict[str, tuple[frozenset, dict, float]] = {}
_PERM_CACHE_TTL = 60
_PERM_CACHE_MAX = 500
_cache_lock = threading.Lock()


def resolve_effective_permissions(user_id: str) -> frozenset[str]:
    now = time.time()
    cached = _perm_cache.get(user_id)
    if cached and cached[2] > now:
        return cached[0]

    db = get_platform_db()
    from bson import ObjectId
    user = db["users"].find_one({"_id": ObjectId(user_id)})
    if not user or user.get("status") != "active":
        return frozenset()

    role_id = user.get("role", "viewer")
    role_doc = db["roles"].find_one({"_id": role_id})

    if role_doc:
        perms = set(role_doc.get("permissions", []))
        limits = dict(role_doc.get("limits", {}))
    elif role_id in BUILTIN_ROLES:
        perms = set(BUILTIN_ROLES[role_id]["permissions"])
        limits = dict(BUILTIN_ROLES[role_id]["limits"])
    else:
        perms = set()
        limits = {}

    overrides = user.get("permission_overrides", {})
    perms |= set(overrides.get("grant", []))
    perms -= set(overrides.get("deny", []))

    limits = _merge_limits(limits, user.get("limit_overrides", {}))

    result = frozenset(perms)
    with _cache_lock:
        if len(_perm_cache) >= _PERM_CACHE_MAX:
            cutoff = now - _PERM_CACHE_TTL
            stale = [k for k, (_, _, ts) in _perm_cache.items() if ts < cutoff]
            for k in stale:
                del _perm_cache[k]
        _perm_cache[user_id] = (result, limits, now + _PERM_CACHE_TTL)

    return result


def resolve_effective_limits(user_id: str) -> dict:
    now = time.time()
    cached = _perm_cache.get(user_id)
    if cached and cached[2] > now:
        return cached[1]
    resolve_effective_permissions(user_id)
    cached = _perm_cache.get(user_id)
    return cached[1] if cached else {}


def _merge_limits(role_limits: dict, user_overrides: dict) -> dict:
    result = {}
    for k, v in role_limits.items():
        if isinstance(v, dict):
            result[k] = dict(v)
        else:
            result[k] = v
    for k, v in user_overrides.items():
        if isinstance(v, dict) and isinstance(result.get(k), dict):
            result[k] = {**result[k], **v}
        else:
            result[k] = v
    return result


def invalidate_user_cache(user_id: str):
    with _cache_lock:
        _perm_cache.pop(user_id, None)


def invalidate_role_cache(role_id: str):
    db = get_platform_db()
    user_ids = [str(u["_id"]) for u in db["users"].find({"role": role_id}, {"_id": 1})]
    with _cache_lock:
        for uid in user_ids:
            _perm_cache.pop(uid, None)


def get_role_level(role_id: str) -> int:
    if role_id in ROLE_LEVELS:
        return ROLE_LEVELS[role_id]
    db = get_platform_db()
    role_doc = db["roles"].find_one({"_id": role_id}, {"level": 1})
    return role_doc["level"] if role_doc else 0


def can_manage(actor_role: str, target_role: str) -> bool:
    return get_role_level(actor_role) > get_role_level(target_role)


def expand_permission_groups(permissions: list[str]) -> set[str]:
    result = set()
    for p in permissions:
        if p.startswith("group:") and p in PERMISSION_GROUPS:
            result |= PERMISSION_GROUPS[p]
        else:
            result.add(p)
    return result


def validate_permissions(permissions: list[str]) -> list[str]:
    invalid = []
    for p in permissions:
        if p.startswith("group:"):
            if p not in PERMISSION_GROUPS:
                invalid.append(p)
        elif p not in ALL_PERMISSIONS:
            invalid.append(p)
    return invalid


def seed_builtin_roles(db):
    now = datetime.now(timezone.utc)
    for role_id, role_data in BUILTIN_ROLES.items():
        doc = dict(role_data)
        doc["created_at"] = now
        doc["updated_at"] = now
        doc["created_by"] = "system"
        db["roles"].update_one(
            {"_id": role_id},
            {"$setOnInsert": doc},
            upsert=True,
        )
