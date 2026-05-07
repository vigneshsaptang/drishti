"""
Dashboard endpoints — proactive intelligence panels, one endpoint per panel.

Each section has its own 5-min TTL cache with stale-while-revalidate behavior:
  - cold start: blocks the first request
  - within TTL: serves cached data immediately (`_cached: true`)
  - past TTL: serves stale cache + kicks single-flight background refresh

DARKMON and Telegram (TELEMON_PARSED_NEW) data sources are intentionally NOT
queried here — those engines were too slow for the idle dashboard.
"""
import time
import threading
import logging
import concurrent.futures
from datetime import datetime, timedelta, timezone
from typing import Any, Callable

from fastapi import APIRouter

from app.db import get_credmon
from app.engines import darkmon, fti

router = APIRouter(tags=["dashboard"])
log = logging.getLogger("dashboard")

_CACHE_TTL = 300  # seconds


class _SectionCache:
    """Single-section TTL cache with stale-while-revalidate."""

    def __init__(self, name: str, loader: Callable[[], Any], fallback: Any):
        self.name = name
        self.loader = loader
        self.fallback = fallback
        self.data: Any = None
        self.ts: float = 0.0
        self.lock = threading.Lock()
        self.refreshing = False

    def _refresh(self) -> None:
        try:
            self.data = self.loader()
            self.ts = time.time()
            log.info("dashboard.%s refreshed", self.name)
        except Exception as e:
            log.warning("dashboard.%s refresh failed: %s", self.name, e)
        finally:
            self.refreshing = False

    def _spawn_refresh(self) -> None:
        with self.lock:
            if self.refreshing:
                return
            self.refreshing = True
        threading.Thread(target=self._refresh, daemon=True).start()

    def get(self) -> dict:
        now = time.time()
        age = now - self.ts

        if self.data is not None and age < _CACHE_TTL:
            return {"data": self.data, "_cached": True, "_age_s": round(age)}

        if self.data is not None:
            self._spawn_refresh()
            return {"data": self.data, "_cached": True, "_stale": True, "_age_s": round(age)}

        with self.lock:
            if self.data is not None:
                return {"data": self.data, "_cached": True, "_age_s": round(time.time() - self.ts)}
            try:
                self.data = self.loader()
                self.ts = time.time()
                return {"data": self.data, "_cached": False, "_age_s": 0}
            except Exception as e:
                log.warning("dashboard.%s cold load failed: %s", self.name, e)
                return {"data": self.fallback, "_cached": False, "_error": str(e), "_age_s": 0}


# ── Loaders ─────────────────────────────────────────────────────────────────

def _load_total_info() -> list:
    """All docs from CREDMON `Master_extracts.Total_info` (capped at 50)."""
    coll = get_credmon()["Master_extracts"]["Total_info"]
    return [darkmon._clean(d) for d in coll.find({}).limit(50)]


def _load_world_check() -> dict:
    """Document count for FTI `KAMAL.world_check` (sanctions / PEP). estimated → instant.
    Exceptions propagate to the cache wrapper so `_error` surfaces in the API response."""
    return {"count": fti.get_fti()["KAMAL"]["world_check"].estimated_document_count()}


def _load_fraud_upis() -> list:
    return fti._safe_fti_query(
        "testing_i4c",
        "UPI_ID_parsed",
        {"clasification": "BETTING_SITE"},
        {
            "upi_details": 1, "clasification": 1, "site": 1, "payment_gateway": 1,
            "home_page_screenshot": 1, "created_at": 1,
        },
        limit=10,
    )


def _parallel_counts(tasks: dict) -> dict:
    """Run a {name: callable} dict in parallel, swallowing per-task errors → 0 with a log line."""
    out: dict = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=min(8, len(tasks) or 1)) as ex:
        futs = {ex.submit(fn): name for name, fn in tasks.items()}
        for fut in concurrent.futures.as_completed(futs):
            name = futs[fut]
            try:
                out[name] = fut.result()
            except Exception as e:
                log.warning("dashboard.dw count failed [%s]: %s", name, e)
                out[name] = 0
    return out


def _load_dw_forums() -> dict:
    """Forums panel: post/thread/author totals + 24h activity."""
    db = darkmon.get_darkmon()["forums_market"]
    cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
    return _parallel_counts({
        "posts":       lambda: db["thread_post"].estimated_document_count(),
        "threads":     lambda: db["thread_object"].estimated_document_count(),
        "authors":     lambda: db["author_aggregation"].estimated_document_count(),
        "posts_24h":   lambda: db["thread_post"].count_documents({"added_datetime": {"$gte": cutoff}}),
        "threads_24h": lambda: db["thread_object"].count_documents({"added_datetime": {"$gte": cutoff}}),
    })


def _load_dw_dread() -> dict:
    """Dread panel — data lags ~2 months, frontend renders a 'stale' pill."""
    db = darkmon.get_darkmon()["forums_market"]
    counts = _parallel_counts({
        "communities": lambda: db["dread_communities"].estimated_document_count(),
        "threads":     lambda: db["dread_threads"].estimated_document_count(),
        "comments":    lambda: db["dread_comments"].estimated_document_count(),
        "authors":     lambda: db["dread_author"].estimated_document_count(),
    })
    counts["stale"] = True
    return counts


def _load_dw_markets() -> dict:
    """Darknet markets panel: drugmon listings + marketplace coverage."""
    db = darkmon.get_darkmon()["forums_market"]
    cutoff = datetime.now(timezone.utc) - timedelta(hours=24)

    def _top_marketplace():
        rows = list(db["drugmon"].aggregate(
            [{"$group": {"_id": "$marketplace", "count": {"$sum": 1}}},
             {"$sort": {"count": -1}}, {"$limit": 1}],
            maxTimeMS=5000,
        ))
        if not rows:
            return None
        r = rows[0]
        return {"name": r.get("_id"), "count": r.get("count", 0)}

    raw = _parallel_counts({
        "listings":        lambda: db["drugmon"].estimated_document_count(),
        "listings_24h":    lambda: db["drugmon"].count_documents({"date_added": {"$gte": cutoff}}),
        "markets_total":   lambda: db["marketplaces_online_status"].estimated_document_count(),
        "top_marketplace": _top_marketplace,
    })
    if not isinstance(raw.get("top_marketplace"), dict):
        raw["top_marketplace"] = None
    return raw


def _load_dw_crypto() -> dict:
    """Crypto panel: 9 collections rolled up into 4 semantic tiles."""
    db = darkmon.get_darkmon()["forums_market"]
    raw = _parallel_counts({
        "wallet_info":          lambda: db["wallet_info"].estimated_document_count(),
        "wallet_address_data":  lambda: db["wallet_address_data"].estimated_document_count(),
        "wallet_transactions":  lambda: db["wallet_transactions"].estimated_document_count(),
        "crypto_transactions":  lambda: db["crypto_transactions"].estimated_document_count(),
        "crypto_data":          lambda: db["crypto_data"].estimated_document_count(),
        "platform_crypto_data": lambda: db["platform_crypto_data"].estimated_document_count(),
        "fti_crypto_data":      lambda: db["fti_crypto_data"].estimated_document_count(),
        "fti_blockchain_posts": lambda: db["fti_blockchain_posts"].estimated_document_count(),
        "iitk_crypto_data":     lambda: db["iitk_crypto_data"].estimated_document_count(),
    })
    return {
        "wallets":             raw["wallet_info"] + raw["wallet_address_data"],
        "transactions":        raw["wallet_transactions"] + raw["crypto_transactions"],
        "payment_captures":    raw["crypto_data"],
        "stream_observations": (raw["platform_crypto_data"] + raw["fti_crypto_data"]
                                + raw["fti_blockchain_posts"] + raw["iitk_crypto_data"]),
    }


def _load_dw_health() -> dict:
    """Health panel: coverage totals + freshness of last marketplace check."""
    db = darkmon.get_darkmon()["forums_market"]

    def _last_check_minutes_ago():
        doc = db["marketplaces_online_status"].find_one(
            {}, sort=[("date_checked", -1)], projection={"date_checked": 1},
        )
        if not doc:
            return None
        ts = doc.get("date_checked")
        if not isinstance(ts, datetime):
            return None
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        delta = datetime.now(timezone.utc) - ts
        return max(0, int(delta.total_seconds() // 60))

    counts = _parallel_counts({
        "forums_total":  lambda: db["forums_online_status"].estimated_document_count(),
        "markets_total": lambda: db["marketplaces_online_status"].estimated_document_count(),
    })
    try:
        last = _last_check_minutes_ago()
    except Exception as e:
        log.warning("dashboard.dw count failed [last_check_minutes_ago]: %s", e)
        last = None
    counts["last_check_minutes_ago"] = last
    return counts


# ── Routes ──────────────────────────────────────────────────────────────────

_caches: dict[str, _SectionCache] = {
    "fraud-upis":  _SectionCache("fraud-upis",  _load_fraud_upis,  []),
    "total-info":  _SectionCache("total-info",  _load_total_info,  []),
    "world-check": _SectionCache("world-check", _load_world_check, {"count": 0}),
    "dw-forums":   _SectionCache("dw-forums",   _load_dw_forums,
                                 {"posts": 0, "threads": 0, "authors": 0,
                                  "posts_24h": 0, "threads_24h": 0}),
    "dw-dread":    _SectionCache("dw-dread",    _load_dw_dread,
                                 {"communities": 0, "threads": 0, "comments": 0,
                                  "authors": 0, "stale": True}),
    "dw-markets":  _SectionCache("dw-markets",  _load_dw_markets,
                                 {"listings": 0, "listings_24h": 0,
                                  "markets_total": 0, "top_marketplace": None}),
    "dw-crypto":   _SectionCache("dw-crypto",   _load_dw_crypto,
                                 {"wallets": 0, "transactions": 0,
                                  "payment_captures": 0, "stream_observations": 0}),
    "dw-health":   _SectionCache("dw-health",   _load_dw_health,
                                 {"forums_total": 0, "markets_total": 0,
                                  "last_check_minutes_ago": None}),
}


@router.get("/dashboard/fraud-upis")
def get_fraud_upis():
    return _caches["fraud-upis"].get()


@router.get("/dashboard/total-info")
def get_total_info():
    return _caches["total-info"].get()


@router.get("/dashboard/world-check")
def get_world_check():
    return _caches["world-check"].get()


@router.get("/dashboard/dw/forums")
def get_dw_forums():
    return _caches["dw-forums"].get()


@router.get("/dashboard/dw/dread")
def get_dw_dread():
    return _caches["dw-dread"].get()


@router.get("/dashboard/dw/markets")
def get_dw_markets():
    return _caches["dw-markets"].get()


@router.get("/dashboard/dw/crypto")
def get_dw_crypto():
    return _caches["dw-crypto"].get()


@router.get("/dashboard/dw/health")
def get_dw_health():
    return _caches["dw-health"].get()


@router.get("/dashboard/world-check/debug")
def debug_world_check():
    """Live (uncached) scan of the FTI cluster — finds where world_check actually lives."""
    client = fti.get_fti()
    out: dict = {"list_database_names": None, "list_database_names_error": None, "databases": {}, "found_in": []}
    try:
        db_names = client.list_database_names()
        out["list_database_names"] = db_names
    except Exception as e:
        out["list_database_names_error"] = repr(e)
        return out

    needles = ("world", "check", "wc", "sanction", "pep", "watchlist")
    for db_name in db_names:
        if db_name in {"admin", "local", "config"}:
            continue
        info: dict = {"collections": None, "matches": [], "error": None}
        try:
            colls = client[db_name].list_collection_names()
            info["collections"] = sorted(colls)
            info["matches"] = [c for c in colls if any(n in c.lower() for n in needles)]
            for c in colls:
                if c.lower() == "world_check":
                    out["found_in"].append({"db": db_name, "collection": c})
                    try:
                        info[f"{c}_count"] = client[db_name][c].estimated_document_count()
                    except Exception as e:
                        info[f"{c}_count_error"] = repr(e)
        except Exception as e:
            info["error"] = repr(e)
        out["databases"][db_name] = info
    return out
