"""
Credit system — cost matrix, check/deduct, refund, config cache, FastAPI dependency.
"""
import hashlib
import json
import threading
import time
import logging
from datetime import datetime, timezone, timedelta

from fastapi import HTTPException, Request

from pymongo import ReturnDocument

from app.db import get_platform_db
from app.config import settings

log = logging.getLogger("credits")

DEFAULT_COST_MATRIX = {
    "combined_search": 10,
    "credmon_search": 5,
    "darkmon_search": 3,
    "fti_screening": 3,
    "financial_screening": 2,
    "ecourts_search": 25,
    "ecourts_case": 10,
    "ecourts_order_md": 15,
    "ecourts_order_ai": 20,
    "mca_lookup": 2,
    "mca_batch": 5,
    "report_export": 5,
}

ENGINE_COST_KEYS = {
    "breach": "credmon_search",
    "threat_intel": "fti_screening",
    "darkweb": "darkmon_search",
    "financial": "financial_screening",
    "ecourts": "ecourts_search",
}

DEFAULT_ROLE_LIMITS = {
    "admin": {"monthly": None, "daily": None, "overage": "soft"},
    "super_admin": {"monthly": None, "daily": None, "overage": "soft"},
    "analyst": {"monthly": 1000, "daily": 100, "overage": "soft"},
    "viewer": {"monthly": 200, "daily": 30, "overage": "hard"},
}

_config_cache: dict | None = None
_config_cache_ts: float = 0
_CONFIG_CACHE_TTL = 300
_config_lock = threading.Lock()


def _db():
    return get_platform_db()


def _load_config() -> dict:
    global _config_cache, _config_cache_ts
    if _config_cache and (time.time() - _config_cache_ts) < _CONFIG_CACHE_TTL:
        return _config_cache
    with _config_lock:
        if _config_cache and (time.time() - _config_cache_ts) < _CONFIG_CACHE_TTL:
            return _config_cache
        doc = _db()["credit_config"].find_one({"_id": "global"})
        if doc is None:
            doc = {
                "_id": "global",
                "cost_matrix": DEFAULT_COST_MATRIX,
                "role_defaults": DEFAULT_ROLE_LIMITS,
                "version": 1,
            }
            try:
                _db()["credit_config"].insert_one(doc)
            except Exception:
                pass
        _config_cache = doc
        _config_cache_ts = time.time()
        return doc


def invalidate_config_cache():
    global _config_cache_ts
    _config_cache_ts = 0


def get_cost_matrix() -> dict:
    config = _load_config()
    return config.get("cost_matrix", DEFAULT_COST_MATRIX)


def get_action_cost(action: str) -> int:
    return get_cost_matrix().get(action, 0)


def get_engine_cost(engines: list[str] | None) -> int:
    if engines is None:
        return get_action_cost("combined_search")
    matrix = get_cost_matrix()
    return sum(matrix.get(ENGINE_COST_KEYS.get(e, ""), 0) for e in engines)


SEARCH_DEDUP_WINDOW_MINUTES = 15

_dedup_index_created = False


def _ensure_dedup_index():
    global _dedup_index_created
    if _dedup_index_created:
        return
    try:
        _db()["recent_searches"].create_index(
            "expires_at", expireAfterSeconds=0
        )
        _dedup_index_created = True
    except Exception:
        _dedup_index_created = True


def _search_hash(user_id, seeds: list[dict], engines: list[str] | None) -> str:
    normalized = json.dumps(
        {"seeds": sorted(seeds, key=lambda s: (s.get("type", ""), s.get("value", ""))),
         "engines": sorted(engines) if engines else None},
        sort_keys=True,
    )
    return hashlib.sha256(f"{user_id}:{normalized}".encode()).hexdigest()


def check_search_dedup(user_id, seeds: list[dict], engines: list[str] | None) -> bool:
    _ensure_dedup_index()
    h = _search_hash(user_id, seeds, engines)
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=SEARCH_DEDUP_WINDOW_MINUTES)
    doc = _db()["recent_searches"].find_one({"_id": h, "searched_at": {"$gte": cutoff}})
    return doc is not None


def record_search_dedup(user_id, seeds: list[dict], engines: list[str] | None):
    _ensure_dedup_index()
    h = _search_hash(user_id, seeds, engines)
    now = datetime.now(timezone.utc)
    _db()["recent_searches"].update_one(
        {"_id": h},
        {"$set": {
            "user_id": user_id,
            "searched_at": now,
            "expires_at": now + timedelta(minutes=SEARCH_DEDUP_WINDOW_MINUTES),
        }},
        upsert=True,
    )


def get_user_limits(user: dict) -> dict:
    config = _load_config()
    role_defaults = config.get("role_defaults", DEFAULT_ROLE_LIMITS)
    role = user.get("role", "analyst")

    base = role_defaults.get(role, role_defaults.get("analyst", {}))
    user_credits = user.get("credits", {})

    return {
        "monthly": user_credits.get("monthly_allocation") if user_credits.get("monthly_allocation") is not None else base.get("monthly"),
        "daily": user_credits.get("daily_limit") if user_credits.get("daily_limit") is not None else base.get("daily"),
        "overage": user_credits.get("overage_policy") or base.get("overage", "soft"),
    }


def check_and_deduct(
    user: dict,
    action: str,
    cost: int,
    metadata: dict | None = None,
    ip: str = "",
    session_id: str | None = None,
) -> dict:
    if cost == 0:
        return {"deducted": 0, "remaining": None, "warning": None}

    user_id = user["_id"] if "_id" in user else user.get("id")
    limits = get_user_limits(user)
    now = datetime.now(timezone.utc)
    period = now.strftime("%Y-%m")
    day = now.strftime("%d")

    monthly_alloc = limits["monthly"] or 999999

    bal = _db()["credit_balances"].find_one_and_update(
        {"user_id": user_id, "period": period},
        {
            "$setOnInsert": {
                "monthly_allocation": monthly_alloc,
                "credits_used": 0,
                "credits_remaining": monthly_alloc,
                "bonus_applied": 0,
                "daily_usage": {},
                "created_at": now,
            },
            "$set": {"updated_at": now},
        },
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )

    remaining = bal.get("credits_remaining", 0)
    daily_used = bal.get("daily_usage", {}).get(day, 0)
    warning = None

    if limits["daily"] and (daily_used + cost) > limits["daily"]:
        if limits["overage"] == "hard":
            raise HTTPException(429, {
                "error": "daily_limit_exceeded",
                "daily_limit": limits["daily"],
                "daily_used": daily_used,
                "cost": cost,
            })
        warning = "daily_limit_exceeded"

    if limits["monthly"] and remaining < cost:
        if limits["overage"] == "hard":
            raise HTTPException(402, {
                "error": "insufficient_credits",
                "required": cost,
                "available": remaining,
                "period": period,
            })
        warning = "monthly_limit_exceeded"

    result = _db()["credit_balances"].find_one_and_update(
        {"user_id": user_id, "period": period},
        {
            "$inc": {
                "credits_used": cost,
                "credits_remaining": -cost,
                f"daily_usage.{day}": cost,
            },
            "$set": {"updated_at": now},
        },
        return_document=ReturnDocument.AFTER,
    )

    new_remaining = result.get("credits_remaining", 0)

    try:
        _db()["credit_transactions"].insert_one({
            "user_id": user_id,
            "period": period,
            "type": "debit",
            "action": action,
            "amount": cost,
            "balance_after": new_remaining,
            "metadata": metadata or {},
            "ip_address": ip,
            "session_id": session_id,
            "created_at": now,
        })
    except Exception:
        pass

    return {"deducted": cost, "remaining": new_remaining, "warning": warning}


def refund_credits(user_id, action: str, amount: int, metadata: dict | None = None):
    now = datetime.now(timezone.utc)
    period = now.strftime("%Y-%m")
    day = now.strftime("%d")
    _db()["credit_balances"].update_one(
        {"user_id": user_id, "period": period},
        {
            "$inc": {
                "credits_used": -amount,
                "credits_remaining": amount,
                f"daily_usage.{day}": -amount,
            },
            "$set": {"updated_at": now},
        },
    )
    try:
        _db()["credit_transactions"].insert_one({
            "user_id": user_id,
            "period": period,
            "type": "credit",
            "action": action,
            "amount": amount,
            "balance_after": None,
            "metadata": {**(metadata or {}), "reason": "cache_hit_refund"},
            "created_at": now,
        })
    except Exception:
        pass


def admin_topup(user_id, amount: int, admin_username: str):
    now = datetime.now(timezone.utc)
    period = now.strftime("%Y-%m")

    _db()["users"].update_one(
        {"_id": user_id},
        {"$inc": {"credits.bonus_credits": amount}},
    )
    result = _db()["credit_balances"].find_one_and_update(
        {"user_id": user_id, "period": period},
        {
            "$inc": {"credits_remaining": amount, "bonus_applied": amount},
            "$set": {"updated_at": now},
            "$setOnInsert": {
                "monthly_allocation": 0,
                "credits_used": 0,
                "daily_usage": {},
                "created_at": now,
            },
        },
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    _db()["credit_transactions"].insert_one({
        "user_id": user_id,
        "period": period,
        "type": "bonus",
        "action": "admin_topup",
        "amount": amount,
        "balance_after": result.get("credits_remaining"),
        "metadata": {"granted_by": admin_username},
        "created_at": now,
    })
    return result.get("credits_remaining", 0)


def get_balance(user: dict) -> dict:
    user_id = user["_id"] if "_id" in user else user.get("id")
    now = datetime.now(timezone.utc)
    period = now.strftime("%Y-%m")
    day = now.strftime("%d")
    limits = get_user_limits(user)

    bal = _db()["credit_balances"].find_one({"user_id": user_id, "period": period})
    if bal is None:
        monthly = limits["monthly"] or 999999
        return {
            "period": period,
            "monthly_allocation": monthly,
            "credits_used": 0,
            "credits_remaining": monthly,
            "daily_used": 0,
            "daily_limit": limits["daily"],
            "overage_policy": limits["overage"],
            "bonus_credits": user.get("credits", {}).get("bonus_credits", 0),
            "role": user.get("role", "analyst"),
        }

    return {
        "period": period,
        "monthly_allocation": bal.get("monthly_allocation", 0),
        "credits_used": bal.get("credits_used", 0),
        "credits_remaining": bal.get("credits_remaining", 0),
        "daily_used": bal.get("daily_usage", {}).get(day, 0),
        "daily_limit": limits["daily"],
        "overage_policy": limits["overage"],
        "bonus_credits": user.get("credits", {}).get("bonus_credits", 0),
        "role": user.get("role", "analyst"),
    }


def get_usage(user_id, period: str | None = None, days: int = 30) -> dict:
    now = datetime.now(timezone.utc)
    if not period:
        period = now.strftime("%Y-%m")

    by_action = list(_db()["credit_transactions"].aggregate([
        {"$match": {"user_id": user_id, "period": period, "type": "debit"}},
        {"$group": {
            "_id": "$action",
            "credits": {"$sum": "$amount"},
            "count": {"$sum": 1},
        }},
        {"$sort": {"credits": -1}},
    ]))

    from datetime import timedelta
    cutoff = now - timedelta(days=days)
    daily_trend = list(_db()["credit_transactions"].aggregate([
        {"$match": {
            "user_id": user_id,
            "type": "debit",
            "created_at": {"$gte": cutoff},
        }},
        {"$group": {
            "_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$created_at"}},
            "credits": {"$sum": "$amount"},
            "searches": {"$sum": 1},
        }},
        {"$sort": {"_id": 1}},
    ]))

    recent = list(
        _db()["credit_transactions"]
        .find({"user_id": user_id, "type": "debit"})
        .sort("created_at", -1)
        .limit(50)
    )
    for r in recent:
        r["_id"] = str(r["_id"])
        if "user_id" in r:
            r["user_id"] = str(r["user_id"])

    return {
        "by_action": [{"action": a["_id"], "credits": a["credits"], "count": a["count"]} for a in by_action],
        "daily_trend": [{"date": d["_id"], "credits": d["credits"], "searches": d["searches"]} for d in daily_trend],
        "recent_transactions": recent,
    }


def require_credits(action: str, *, use_engine_cost: bool = False):
    """Factory: returns a FastAPI dependency that checks/deducts credits.

    If use_engine_cost=True, reads 'engines' from the JSON body to calculate
    cost per-engine instead of using the fixed action cost.
    """

    async def _dep(request: Request):
        if not settings.credits_enabled:
            log.warning("credits disabled, skipping deduction")
            return {"deducted": 0, "remaining": None, "warning": None}

        user_info = getattr(request.state, "user", None)
        if not user_info:
            log.warning("no user_info on request.state, skipping credit check")
            return {"deducted": 0, "remaining": None, "warning": None}

        engines = None
        seeds = None
        if use_engine_cost:
            try:
                body = await request.json()
                engines = body.get("engines")
                seeds = body.get("seeds")
            except Exception:
                pass

        cost = get_engine_cost(engines) if use_engine_cost else get_action_cost(action)
        if cost == 0:
            log.warning("action %s has zero cost (engines=%s)", action, engines)
            return {"deducted": 0, "remaining": None, "warning": None}

        if use_engine_cost and seeds:
            if check_search_dedup(user_info["id"], seeds, engines):
                log.info("dedup hit for user=%s, skipping deduction", user_info.get("id"))
                return {"deducted": 0, "remaining": None, "warning": None, "cached": True}

        from bson import ObjectId
        db = _db()
        try:
            user = db["users"].find_one({"_id": ObjectId(user_info["id"])})
        except Exception as e:
            log.warning("failed to look up user %s: %s", user_info.get("id"), e)
            return {"deducted": 0, "remaining": None, "warning": None}
        if not user:
            log.warning("user not found in DB for id=%s, skipping credit deduction", user_info.get("id"))
            return {"deducted": 0, "remaining": None, "warning": None}

        log.info("deducting %d credits for action=%s engines=%s user=%s (role=%s)", cost, action, engines, user_info.get("id"), user.get("role"))
        ip = request.headers.get("x-forwarded-for", "").split(",")[0].strip() or (request.client.host if request.client else "")
        session_id = user_info.get("session_id")

        result = check_and_deduct(
            user, action, cost,
            metadata={"path": str(request.url.path), "engines": engines},
            ip=ip, session_id=session_id,
        )

        if use_engine_cost and seeds:
            try:
                record_search_dedup(user_info["id"], seeds, engines)
            except Exception:
                pass

        request.state.credit_result = result
        return result

    return _dep
