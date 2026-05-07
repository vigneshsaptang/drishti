"""
Platform-wide statistics — big numbers for the hero section.

Uses estimatedDocumentCount (instant, no collection scan) for every collection,
fanned out across a thread pool so cold start ≈ slowest single round-trip
instead of sum-of-all.

DARKMON and Telegram-related counts are intentionally omitted (those engines
were too slow for the idle dashboard).
"""
import time
import threading
import logging
import concurrent.futures
from fastapi import APIRouter
from app.db import get_credmon, get_fti

router = APIRouter(tags=["stats"])
log = logging.getLogger("stats")

_cache: dict | None = None
_cache_ts: float = 0
_TTL = 600  # 10 min — these numbers barely change
_lock = threading.Lock()
_refreshing = False


def _count(db, col) -> int:
    try:
        return db[col].estimated_document_count()
    except Exception:
        return 0


def _build_stats() -> dict:
    t0 = time.time()

    credmon_master = get_credmon()["Master_extracts"]
    fti = get_fti()
    kamal = fti["KAMAL"]
    ti = fti["testing_i4c"]
    cryptodb = fti["cryptoDB"]

    # name → (db, collection)
    tasks: dict[str, tuple] = {
        # CREDMON breach
        "phones":        (credmon_master, "contactNumbers"),
        "emails":        (credmon_master, "emails"),
        "usernames":     (credmon_master, "usernames"),
        "fullnames":     (credmon_master, "fullnames"),
        "origins":       (credmon_master, "origin_domains"),
        "android":       (credmon_master, "android_packages"),
        "leaks_info":    (credmon_master, "Leaks_info"),
        "file_hashes":   (credmon_master, "master_file_hashes_new"),
        "email_domains": (credmon_master, "Email_domain_summary"),
        # FTI KAMAL
        "crime_data":    (kamal, "CrimeData"),
        "crime_hyperv":  (kamal, "CrimeData_Hyperv"),
        "world_check":   (kamal, "world_check"),
        # FTI testing_i4c (non-Telegram)
        "upi_parsed":    (ti, "UPI_ID_parsed"),
        "upi_raw":       (ti, "UPI_ID_raw"),
        "mobile_nums":   (ti, "MOBILE_NUMBERS"),
        "crypto_tx":     (ti, "CRYPTO_TRANSACTION"),
        "bank_accounts": (ti, "BANK_ACCOUNT_DETAILS"),
        "ransomware":    (ti, "RANSOMWARE_GROUP"),
        "ransom_posts":  (ti, "RANSOM_GROUP_POSTS_parsed"),
        "fb_ads":        (ti, "FACEBOOK_ADS_raw"),
        "malware_ioc":   (ti, "MALWARE_IOC"),
        "emails_fti":    (ti, "EMAILS"),
        "urls_fti":      (ti, "URLS"),
        # FTI cryptoDB
        "crypto_db":     (cryptodb, "crypto_data"),
    }

    counts: dict[str, int] = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=12) as ex:
        futs = {ex.submit(_count, db, col): name for name, (db, col) in tasks.items()}
        for fut in concurrent.futures.as_completed(futs):
            counts[futs[fut]] = fut.result()

    breach_total = sum(counts[k] for k in ("phones", "emails", "usernames", "fullnames", "origins", "android"))
    threat_total = sum(counts[k] for k in ("crime_data", "world_check", "upi_parsed", "upi_raw", "crypto_tx", "mobile_nums", "bank_accounts"))

    return {
        "build_time_ms": round((time.time() - t0) * 1000),

        "hero": {
            "total_records":   breach_total + threat_total,
            "breach_records":  breach_total,
            "threat_records":  threat_total,
        },

        "breach": {
            "phone_numbers":             counts["phones"],
            "email_addresses":           counts["emails"],
            "usernames":                 counts["usernames"],
            "full_names":                counts["fullnames"],
            "credential_origins":        counts["origins"],
            "android_packages":          counts["android"],
            "breach_sources_catalogued": counts["leaks_info"],
            "file_hashes":               counts["file_hashes"],
            "email_domains_profiled":    counts["email_domains"],
        },

        "threat_intel": {
            "crime_watchlist":         counts["crime_data"],
            "adverse_media":           counts["crime_hyperv"],
            "sanctions_pep":           counts["world_check"],
            "upi_ids_tracked":         counts["upi_parsed"] + counts["upi_raw"],
            "mobile_numbers_profiled": counts["mobile_nums"],
            "crypto_transactions":     counts["crypto_tx"],
            "crypto_addresses":        counts["crypto_db"],
            "bank_accounts":           counts["bank_accounts"],
            "ransomware_groups":       counts["ransomware"],
            "ransomware_posts":        counts["ransom_posts"],
            "facebook_ads":            counts["fb_ads"],
            "malware_ioc":             counts["malware_ioc"],
            "fraud_emails":            counts["emails_fti"],
            "fraud_urls":              counts["urls_fti"],
        },
    }


def _bg_refresh():
    global _cache, _cache_ts, _refreshing
    try:
        _cache = _build_stats()
        _cache_ts = time.time()
    except Exception as e:
        log.warning("Stats refresh failed: %s", e)
    finally:
        _refreshing = False


@router.get("/stats/platform")
def platform_stats():
    """
    Platform-wide statistics. Uses estimatedDocumentCount fanned out in parallel.
    Cached for 10 minutes. Stale-while-revalidate.
    """
    global _cache, _cache_ts, _refreshing

    now = time.time()
    age = now - _cache_ts

    if _cache and age < _TTL:
        return {**_cache, "_cached": True, "_age_s": round(age)}

    if _cache and age >= _TTL:
        if not _refreshing:
            with _lock:
                if not _refreshing:
                    _refreshing = True
                    threading.Thread(target=_bg_refresh, daemon=True).start()
        return {**_cache, "_cached": True, "_stale": True, "_age_s": round(age)}

    _cache = _build_stats()
    _cache_ts = time.time()
    return {**_cache, "_cached": False, "_age_s": 0}
