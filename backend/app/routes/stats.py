"""
Platform-wide statistics — big numbers for the hero section.
Uses estimatedDocumentCount (instant, no collection scan) for all large collections.
Cached aggressively — these numbers change slowly.
"""
import time
import threading
import logging
from fastapi import APIRouter
from app.db import get_credmon, get_darkmon, get_fti

router = APIRouter(tags=["stats"])
log = logging.getLogger("stats")

_cache: dict | None = None
_cache_ts: float = 0
_TTL = 600  # 10 min — these numbers barely change
_lock = threading.Lock()
_refreshing = False


def _count(db, col):
    """estimatedDocumentCount — reads collection metadata, no scan. Instant on any size."""
    try:
        return db[col].estimated_document_count()
    except Exception:
        return 0


def _build_stats() -> dict:
    t0 = time.time()

    # ── CREDMON (breach intelligence) ──
    credmon = get_credmon()
    master = credmon["Master_extracts"]

    phones = _count(master, "contactNumbers")
    emails = _count(master, "emails")
    usernames = _count(master, "usernames")
    fullnames = _count(master, "fullnames")
    origins = _count(master, "origin_domains")
    android = _count(master, "android_packages")
    leaks_info = _count(master, "Leaks_info")
    file_hashes = _count(master, "master_file_hashes_new")
    email_domains = _count(master, "Email_domain_summary")

    breach_total = phones + emails + usernames + fullnames + origins + android

    # ── DARKMON (dark web) ──
    darkmon = get_darkmon()["forums_market"]

    dw_posts = _count(darkmon, "thread_post")
    dw_threads = _count(darkmon, "thread_object")
    dw_links = _count(darkmon, "thread_links")
    dw_drugmon = _count(darkmon, "drugmon")
    dw_drug_listings = _count(darkmon, "drug_listings")
    dw_authors = _count(darkmon, "author_aggregation")
    dw_dread = _count(darkmon, "dread_communities")
    dw_dread_threads = _count(darkmon, "dread_threads")
    dw_dread_comments = _count(darkmon, "dread_comments")
    dw_wallets = _count(darkmon, "wallet_info")
    dw_wallet_tx = _count(darkmon, "wallet_transactions")
    dw_wallet_addr = _count(darkmon, "wallet_address_data")
    dw_crypto = _count(darkmon, "crypto_data")
    dw_platform_crypto = _count(darkmon, "platform_crypto_data")

    darkweb_total = dw_posts + dw_threads + dw_links + dw_drugmon + dw_authors + dw_dread + dw_wallets + dw_wallet_tx + dw_crypto

    # ── FTI (threat intelligence) ──
    fti = get_fti()

    # KAMAL
    kamal = fti["KAMAL"]
    crime_data = _count(kamal, "CrimeData")
    crime_hyperv = _count(kamal, "CrimeData_Hyperv")
    world_check = _count(kamal, "world_check")

    # testing_i4c (production dataset)
    ti = fti["testing_i4c"]
    upi_parsed = _count(ti, "UPI_ID_parsed")
    upi_raw = _count(ti, "UPI_ID_raw")
    mobile_nums = _count(ti, "MOBILE_NUMBERS")
    crypto_tx = _count(ti, "CRYPTO_TRANSACTION")
    bank_accounts = _count(ti, "BANK_ACCOUNT_DETAILS")
    tg_raw = _count(ti, "TELEGRAM_raw")
    tg_channels = _count(ti, "TELEGRAM_CHANNELS")
    tg_messages_parsed = _count(ti, "TELEGRAM_parsed")
    ransomware = _count(ti, "RANSOMWARE_GROUP")
    ransom_posts = _count(ti, "RANSOM_GROUP_POSTS_parsed")
    fb_ads = _count(ti, "FACEBOOK_ADS_raw")
    malware_ioc = _count(ti, "MALWARE_IOC")
    emails_fti = _count(ti, "EMAILS")
    urls_fti = _count(ti, "URLS")

    # Telegram scraper
    tg_scraper = fti["telegram_data"]
    tg_messages = _count(tg_scraper, "messages")
    tg_users = _count(tg_scraper, "users")
    tg_groups = _count(tg_scraper, "groups")
    tg_memberships = _count(tg_scraper, "user_group_memberships")

    # TELEMON parsed entities
    telemon = fti["TELEMON_PARSED_NEW"]
    tel_phones_in = _count(telemon, "entities_mobile_numbers_in_dup")
    tel_urls = _count(telemon, "entities_urls_dup")
    tel_crypto = _count(telemon, "entities_crypto_addresses_dup")

    # cryptoDB
    crypto_db = _count(fti["cryptoDB"], "crypto_data")

    threat_total = crime_data + world_check + upi_parsed + crypto_tx + tg_messages + mobile_nums

    build_time = round((time.time() - t0) * 1000)

    return {
        "build_time_ms": build_time,

        # ── Hero numbers ──
        "hero": {
            "total_records": breach_total + darkweb_total + threat_total,
            "breach_records": breach_total,
            "darkweb_records": darkweb_total,
            "threat_records": threat_total,
        },

        # ── Breach intelligence ──
        "breach": {
            "phone_numbers": phones,
            "email_addresses": emails,
            "usernames": usernames,
            "full_names": fullnames,
            "credential_origins": origins,
            "android_packages": android,
            "breach_sources_catalogued": leaks_info,
            "file_hashes": file_hashes,
            "email_domains_profiled": email_domains,
        },

        # ── Dark web ──
        "darkweb": {
            "forum_posts": dw_posts,
            "forum_threads": dw_threads,
            "thread_links": dw_links,
            "marketplace_listings": dw_drugmon,
            "drug_listings_curated": dw_drug_listings,
            "threat_actor_profiles": dw_authors,
            "dread_communities": dw_dread,
            "dread_threads": dw_dread_threads,
            "dread_comments": dw_dread_comments,
            "crypto_wallets": dw_wallets,
            "wallet_transactions": dw_wallet_tx,
            "wallet_addresses": dw_wallet_addr,
            "crypto_records": dw_crypto + dw_platform_crypto,
        },

        # ── Threat intelligence ──
        "threat_intel": {
            "crime_watchlist": crime_data,
            "adverse_media": crime_hyperv,
            "sanctions_pep": world_check,
            "upi_ids_tracked": upi_parsed + upi_raw,
            "mobile_numbers_profiled": mobile_nums,
            "crypto_transactions": crypto_tx,
            "crypto_addresses": crypto_db,
            "bank_accounts": bank_accounts,
            "telegram_messages": tg_messages,
            "telegram_messages_parsed": tg_messages_parsed,
            "telegram_raw_messages": tg_raw,
            "telegram_channels": tg_channels,
            "telegram_groups": tg_groups,
            "telegram_users": tg_users,
            "telegram_memberships": tg_memberships,
            "telegram_phones_extracted": tel_phones_in,
            "telegram_urls_extracted": tel_urls,
            "telegram_crypto_extracted": tel_crypto,
            "ransomware_groups": ransomware,
            "ransomware_posts": ransom_posts,
            "facebook_ads": fb_ads,
            "malware_ioc": malware_ioc,
            "fraud_emails": emails_fti,
            "fraud_urls": urls_fti,
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
    Platform-wide statistics. Uses estimatedDocumentCount — instant on any collection size.
    Cached for 10 minutes. Stale-while-revalidate pattern.
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

    # Cold start
    _cache = _build_stats()
    _cache_ts = time.time()
    return {**_cache, "_cached": False, "_age_s": 0}
