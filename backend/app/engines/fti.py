"""
Threat Intelligence Engine — FTI

Covers: MOBILE_NUMBERS, UPI_ID_parsed, TELEMON_PARSED_NEW, CrimeData, world_check,
CRYPTO_TRANSACTION, TELEGRAM_raw, BANK_ACCOUNT_DETAILS, EMAILS, telegram_data.
"""
import re
from typing import Any

from app.db import get_fti
from app.config import settings


def _safe_fti_query(db_name: str, col_name: str, query: dict, projection: dict | None = None, limit: int = 20) -> list[dict]:
    try:
        db = get_fti()[db_name]
        cursor = db[col_name].find(query, projection).limit(limit)
        results = list(cursor)
        for r in results:
            r["_id"] = str(r["_id"])
        return results
    except Exception:
        return []


# ── Phone Intelligence ────────────────────────────────────

def search_mobile_numbers(phone: str) -> dict | None:
    """Search MOBILE_NUMBERS for phone intelligence."""
    digits = re.sub(r"\D", "", phone)
    for variant in [digits, f"91{digits[-10:]}", digits[-10:]]:
        results = _safe_fti_query("i4c_testing_env", "MOBILE_NUMBERS", {"entity": {"$regex": variant}}, limit=5)
        if results:
            return results[0]
    return None


# ── Telegram Intelligence ─────────────────────────────────

def search_telegram_mentions(phone: str) -> dict:
    """Search TELEMON_PARSED_NEW for phone mentions in Telegram groups."""
    digits = re.sub(r"\D", "", phone)[-10:]
    db = get_fti()["TELEMON_PARSED_NEW"]

    try:
        pipeline = [
            {"$match": {"original_text": {"$regex": digits}}},
            {"$group": {
                "_id": None,
                "total_mentions": {"$sum": 1},
                "groups": {"$addToSet": "$group_id"},
                "senders": {"$addToSet": "$sender_id"},
            }},
        ]
        agg = list(db["entities_mobile_numbers_in_dup"].aggregate(pipeline, allowDiskUse=True, maxTimeMS=10000))
        if agg:
            result = agg[0]
            return {
                "found": True,
                "total_mentions": result["total_mentions"],
                "unique_groups": len(result["groups"]),
                "unique_senders": len(result["senders"]),
                "group_ids": result["groups"][:20],
                "sender_ids": result["senders"][:20],
            }
    except Exception:
        pass

    return {"found": False, "total_mentions": 0, "unique_groups": 0, "unique_senders": 0}


def get_telegram_group_details(phone: str, limit: int = 10) -> list[dict]:
    """Get per-group breakdown of phone mentions."""
    digits = re.sub(r"\D", "", phone)[-10:]
    db = get_fti()["TELEMON_PARSED_NEW"]
    try:
        pipeline = [
            {"$match": {"original_text": {"$regex": digits}}},
            {"$group": {
                "_id": "$group_id",
                "mentions": {"$sum": 1},
                "senders": {"$addToSet": "$sender_id"},
            }},
            {"$project": {"_id": 1, "mentions": 1, "sender_count": {"$size": "$senders"}}},
            {"$sort": {"mentions": -1}},
            {"$limit": limit},
        ]
        return list(db["entities_mobile_numbers_in_dup"].aggregate(pipeline, allowDiskUse=True, maxTimeMS=10000))
    except Exception:
        return []


# ── UPI / Financial Intelligence ──────────────────────────

def search_upi_by_phone(phone: str) -> list[dict]:
    """Search UPI_ID_parsed for UPI addresses linked to a phone number."""
    digits = re.sub(r"\D", "", phone)[-10:]
    return _safe_fti_query(
        "testing_i4c", "UPI_ID_parsed",
        {"upi_details.pa": {"$regex": digits}},
        {"upi_details": 1, "clasification": 1, "site": 1, "payment_gateway": 1,
         "home_page_screenshot": 1, "upi_screen_shot": 1, "created_at": 1},
        limit=10,
    )


def search_bank_accounts(phone: str = "", site_url: str = "") -> list[dict]:
    """Search BANK_ACCOUNT_DETAILS."""
    query_parts = []
    if phone:
        query_parts.append({"mobile_number": {"$regex": phone}})
    if site_url:
        query_parts.append({"site_url": {"$regex": site_url, "$options": "i"}})
    if not query_parts:
        return []
    query = {"$or": query_parts} if len(query_parts) > 1 else query_parts[0]
    return _safe_fti_query("testing_i4c", "BANK_ACCOUNT_DETAILS", query, limit=10)


# ── Crime / Watchlist Screening ───────────────────────────

def screen_crimedata(name: str) -> list[dict]:
    """Screen a name against CrimeData (text indexed)."""
    try:
        db = get_fti()["KAMAL"]
        results = list(
            db["CrimeData"]
            .find(
                {"$text": {"$search": f'"{name}"'}},
                {"_source.name": 1, "_source.category": 1, "_source.entity_type": 1,
                 "_source.country_name": 1, "_source.detail_info.dob": 1,
                 "_source.detail_info.address": 1, "_source.detail_info.national_id": 1,
                 "_source.detail_info.passport_id": 1, "_source.detail_info.linked_to": 1,
                 "score": {"$meta": "textScore"}},
            )
            .sort([("score", {"$meta": "textScore"})])
            .max_time_ms(10000)
            .limit(5)
        )
        for r in results:
            r["_id"] = str(r["_id"])
        return results
    except Exception:
        return []


def screen_worldcheck(name: str) -> list[dict]:
    """Screen a name against world_check (text indexed)."""
    try:
        db = get_fti()["KAMAL"]
        results = list(
            db["world_check"]
            .find(
                {"$text": {"$search": f'"{name}"'}},
                {"primary_name": 1, "alternative_names": 1, "country": 1,
                 "date_of_birth": 1, "EXTRA_DATA.category": 1,
                 "EXTRA_DATA.entity_type": 1, "EXTRA_DATA.further_info": 1,
                 "EXTRA_DATA.linked_to": 1, "EXTRA_DATA.keywords": 1,
                 "score": {"$meta": "textScore"}},
            )
            .sort([("score", {"$meta": "textScore"})])
            .max_time_ms(10000)
            .limit(5)
        )
        for r in results:
            r["_id"] = str(r["_id"])
            if r.get("EXTRA_DATA", {}).get("further_info"):
                r["EXTRA_DATA"]["further_info"] = r["EXTRA_DATA"]["further_info"][:300]
        return results
    except Exception:
        return []


# ── Crypto Intelligence ───────────────────────────────────

def search_crypto_transactions(wallet_address: str, limit: int = 20) -> list[dict]:
    """Search CRYPTO_TRANSACTION by wallet address."""
    return _safe_fti_query(
        "testing_i4c", "CRYPTO_TRANSACTION",
        {"wallet_address": wallet_address},
        {"wallet_address": 1, "transaction_id": 1, "amount_crypto": 1, "amount_usd": 1,
         "from_address": 1, "to_address": 1, "date": 1, "direction": 1, "screenshot": 1},
        limit=limit,
    )


# ── Email Intelligence ────────────────────────────────────

def search_emails(email: str) -> list[dict]:
    """Search EMAILS collection."""
    return _safe_fti_query(
        "i4c_testing_env", "EMAILS",
        {"value": email.lower()},
        limit=5,
    )


# ── Telegram Message Search ──────────────────────────────

def search_telegram_messages(query: str, limit: int = 20) -> list[dict]:
    """Full-text search across Telegram message corpus."""
    try:
        db = get_fti()["telegram_data"]
        results = list(
            db["messages"]
            .find(
                {"$text": {"$search": query}},
                {"message_text": 1, "sender_id": 1, "sender_username": 1,
                 "group_id": 1, "group_title": 1, "date": 1, "views": 1,
                 "score": {"$meta": "textScore"}},
            )
            .sort([("score", {"$meta": "textScore"})])
            .max_time_ms(10000)
            .limit(limit)
        )
        for r in results:
            r["_id"] = str(r["_id"])
            r["message_text"] = (r.get("message_text") or "")[:500]
        return results
    except Exception:
        return []
