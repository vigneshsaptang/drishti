"""
Dashboard endpoint — returns proactive intelligence without a search.
Shows leads, latest dark web activity, fraud UPIs, drug stats, etc.

Uses a simple TTL cache so repeated loads are instant.
Cache refreshes in the background after expiry — stale data is served while refresh runs.
"""
import time
import threading
import logging
from fastapi import APIRouter
from app.engines import darkmon, fti

router = APIRouter(tags=["dashboard"])
log = logging.getLogger("dashboard")

# ── Cache ──────────────────────────────────────────────
_cache: dict | None = None
_cache_ts: float = 0
_CACHE_TTL = 300          # 5 minutes — dashboard data is slow-changing
_refresh_lock = threading.Lock()
_refreshing = False


def _build_intel() -> dict:
    """Fetch all dashboard sections from the databases."""
    result = {}

    # 1. Drug stats
    try:
        result["drug_stats"] = darkmon.get_drug_stats()
    except Exception:
        result["drug_stats"] = {"categories": [], "marketplaces": []}

    # 2. India drug listings
    try:
        result["india_drugs"] = darkmon.search_drug_vendors(shipping_from="india", limit=10)
    except Exception:
        result["india_drugs"] = []

    # 3. Fraud UPI handles
    try:
        result["fraud_upis"] = fti._safe_fti_query(
            "testing_i4c", "UPI_ID_parsed",
            {"clasification": "BETTING_SITE"},
            {"upi_details": 1, "clasification": 1, "site": 1, "payment_gateway": 1,
             "home_page_screenshot": 1, "created_at": 1},
            limit=10,
        )
    except Exception:
        result["fraud_upis"] = []

    # 4. Threat actors targeting India
    try:
        db = darkmon.get_darkmon()["forums_market"]
        india_authors = list(
            db["author_aggregation"]
            .find({"target_countries": "India"})
            .sort("no_of_posts", -1)
            .limit(8)
        )
        result["threat_actors"] = [darkmon._clean(a) for a in india_authors]
    except Exception:
        result["threat_actors"] = []

    # 5. Telegram group activity
    try:
        db = fti.get_fti()["TELEMON_PARSED_NEW"]
        pipeline = [
            {"$group": {
                "_id": "$group_id",
                "total_phones": {"$sum": 1},
                "unique_phones": {"$addToSet": "$original_text"},
            }},
            {"$project": {"_id": 1, "total_phones": 1, "unique_phone_count": {"$size": "$unique_phones"}}},
            {"$sort": {"total_phones": -1}},
            {"$limit": 8},
        ]
        result["telegram_groups"] = list(
            db["entities_mobile_numbers_in_dup"].aggregate(pipeline, allowDiskUse=True, maxTimeMS=15000)
        )
    except Exception:
        result["telegram_groups"] = []

    # 6. Top crypto wallets
    try:
        db = darkmon.get_darkmon()["forums_market"]
        wallets = list(
            db["wallet_info"]
            .find({"total_volume.fiat.amount": {"$exists": True, "$ne": ""}})
            .sort("transactions_count.total", -1)
            .limit(6)
        )
        result["top_wallets"] = [darkmon._clean(w) for w in wallets]
    except Exception:
        result["top_wallets"] = []

    # 7. Marketplace status
    try:
        db = darkmon.get_darkmon()["forums_market"]
        mkt = list(db["marketplaces_online_status"].find({}).sort("last_checked", -1).limit(10))
        result["marketplace_status"] = [darkmon._clean(m) for m in mkt]
    except Exception:
        result["marketplace_status"] = []

    return result


def _background_refresh():
    """Refresh the cache in a background thread."""
    global _cache, _cache_ts, _refreshing
    try:
        log.info("Dashboard cache refresh started")
        fresh = _build_intel()
        _cache = fresh
        _cache_ts = time.time()
        log.info("Dashboard cache refreshed")
    except Exception as e:
        log.warning("Dashboard cache refresh failed: %s", e)
    finally:
        _refreshing = False


@router.get("/dashboard/intel")
def get_dashboard_intel():
    """
    Returns cached dashboard intel.
    - First call: blocks while building (cold start).
    - Subsequent calls within TTL: instant from cache.
    - After TTL: returns stale cache immediately, refreshes in background.
    """
    global _cache, _cache_ts, _refreshing

    now = time.time()
    age = now - _cache_ts

    # Cache hit — fresh
    if _cache and age < _CACHE_TTL:
        return {**_cache, "_cached": True, "_age_s": round(age)}

    # Cache hit — stale but usable, kick off background refresh
    if _cache and age >= _CACHE_TTL:
        if not _refreshing:
            with _refresh_lock:
                if not _refreshing:
                    _refreshing = True
                    threading.Thread(target=_background_refresh, daemon=True).start()
        return {**_cache, "_cached": True, "_stale": True, "_age_s": round(age)}

    # Cold start — no cache, must block
    _cache = _build_intel()
    _cache_ts = time.time()
    return {**_cache, "_cached": False, "_age_s": 0}
