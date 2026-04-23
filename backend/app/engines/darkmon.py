"""
Dark Web Intelligence Engine — DARKMON

Searches: thread_object, thread_post (via author_username index + extracted_info),
drugmon, drug_listings, author_aggregation, dread_threads/comments, wallet_info.
"""
import re
from datetime import datetime
from typing import Any
from bson import ObjectId

from app.db import get_darkmon


def _clean(doc):
    """Recursively convert ObjectId/datetime to strings in a MongoDB document."""
    if isinstance(doc, dict):
        return {k: _clean(v) for k, v in doc.items()}
    if isinstance(doc, list):
        return [_clean(v) for v in doc]
    if isinstance(doc, ObjectId):
        return str(doc)
    if isinstance(doc, datetime):
        return doc.isoformat()
    if isinstance(doc, bytes):
        return doc.decode('utf-8', errors='replace')
    return doc
from app.config import settings


def _safe_query(collection_name: str, query: dict, projection: dict, limit: int = 10) -> list[dict]:
    """Run a DARKMON query with max_time_ms to avoid hanging on unindexed fields."""
    try:
        db = get_darkmon()["forums_market"]
        return list(
            db[collection_name]
            .find(query, projection)
            .max_time_ms(settings.darkmon_query_timeout_ms)
            .limit(limit)
        )
    except Exception:
        return []


def _format_thread(t: dict, match_type: str) -> dict:
    extracted = t.get("extracted_info") or {}
    return {
        "type": "thread",
        "match_type": match_type,
        "title": (t.get("thread_title") or "")[:200],
        "forum": t.get("forum_name"),
        "author": t.get("author_username"),
        "date": str(t.get("posted_datetime", "")),
        "views": t.get("thread_views"),
        "replies": t.get("thread_replies"),
        "categories": t.get("thread_categories", []),
        "tags": t.get("thread_tags", []),
        "screenshot": t.get("screenshot_s3link"),
        "extracted_emails": extracted.get("email_ids", []),
        "extracted_phones": extracted.get("mobile_numbers", []),
        "extracted_urls": [u.get("domain_name", "") for u in extracted.get("urls", []) if isinstance(u, dict)],
        "extracted_onions": extracted.get("onions", []),
    }


def _format_post(p: dict, match_type: str) -> dict:
    extracted = p.get("extracted_info") or {}
    return {
        "type": "post",
        "match_type": match_type,
        "title": (p.get("post_title") or "")[:200],
        "forum": p.get("forum_name"),
        "author": p.get("author_username"),
        "author_id": p.get("author_id"),
        "wallet_balance": str(p.get("author_wallet_balance", "")),
        "date": str(p.get("commented_datetime", "")),
        "screenshot": p.get("screenshot_s3link"),
        "extracted_emails": extracted.get("email_ids", []),
        "extracted_phones": extracted.get("mobile_numbers", []),
        "extracted_urls": [u.get("domain_name", "") for u in extracted.get("urls", []) if isinstance(u, dict)],
        "extracted_onions": extracted.get("onions", []),
    }


# ── Public API ────────────────────────────────────────────

THREAD_PROJ = {
    "thread_title": 1, "forum_name": 1, "author_username": 1, "posted_datetime": 1,
    "thread_views": 1, "thread_replies": 1, "screenshot_s3link": 1,
    "extracted_info": 1, "thread_categories": 1, "thread_tags": 1,
}
POST_PROJ = {
    "post_title": 1, "forum_name": 1, "author_username": 1, "author_id": 1,
    "author_wallet_balance": 1, "commented_datetime": 1, "screenshot_s3link": 1,
    "extracted_info": 1,
}


def search_by_entity(entity_type: str, entity_value: str) -> dict:
    """Search extracted_info.email_ids / mobile_numbers in threads and posts."""
    results: dict[str, list] = {"threads": [], "posts": []}

    if entity_type == "email":
        for t in _safe_query("thread_object", {"extracted_info.email_ids": entity_value}, THREAD_PROJ):
            results["threads"].append(_format_thread(t, "email_match"))
        for p in _safe_query("thread_post", {"extracted_info.email_ids": entity_value}, POST_PROJ):
            results["posts"].append(_format_post(p, "email_match"))

    elif entity_type == "phone":
        digits = re.sub(r"\D", "", entity_value)
        variants = list(dict.fromkeys([digits, digits[-10:], "+91" + digits[-10:], "91" + digits[-10:]]))
        for variant in variants:
            if results["threads"] or results["posts"]:
                break
            for t in _safe_query("thread_object", {"extracted_info.mobile_numbers": variant}, THREAD_PROJ):
                results["threads"].append(_format_thread(t, "phone_match"))
            for p in _safe_query("thread_post", {"extracted_info.mobile_numbers": variant}, POST_PROJ):
                results["posts"].append(_format_post(p, "phone_match"))

    return results


def search_by_username(username: str) -> dict:
    """Search by author_username (indexed — fast exact match)."""
    results: dict[str, Any] = {"threads": [], "posts": [], "author_profile": None}

    author_thread_proj = {
        **THREAD_PROJ,
        "author_wallet_balance": 1, "author_reputation": 1, "author_level": 1,
        "author_type": 1, "author_joined": 1, "author_postcount": 1, "author_threadcount": 1,
    }
    for t in _safe_query("thread_object", {"author_username": username}, author_thread_proj, limit=20):
        results["threads"].append(_format_thread(t, "author_match"))

    author_post_proj = {
        **POST_PROJ,
        "author_reputation": 1, "author_level": 1, "author_type": 1,
        "author_joined": 1, "author_postcount": 1,
    }
    for p in _safe_query("thread_post", {"author_username": username}, author_post_proj, limit=20):
        results["posts"].append(_format_post(p, "author_match"))

    # Build profile from first result
    first = (results["threads"] or results["posts"] or [None])[0]
    if first and isinstance(first, dict):
        results["author_profile"] = {
            "username": username,
            "forum": first.get("forum"),
            "source": "forum_post",
        }

    # Enrich from author_aggregation
    try:
        db = get_darkmon()["forums_market"]
        agg = db["author_aggregation"].find_one({"username": username})
        if agg:
            results["author_profile"] = {
                "username": username,
                "forum": agg.get("forum_name"),
                "total_posts": agg.get("no_of_posts"),
                "active_days": agg.get("no_of_active_days"),
                "target_countries": agg.get("target_countries", []),
                "categories": agg.get("categories", {}),
                "last_post": agg.get("last_post_title"),
                "last_active": str(agg.get("last_posted_datetime", "")),
                "source": "author_aggregation",
            }
    except Exception:
        pass

    return results


def search_drug_vendors(query: str | None = None, shipping_from: str | None = None, limit: int = 20) -> list[dict]:
    """Search drugmon for vendors/listings."""
    db = get_darkmon()["forums_market"]
    mongo_query: dict = {}
    if query:
        mongo_query["$or"] = [
            {"vendor_name": {"$regex": query, "$options": "i"}},
            {"listing_category": {"$regex": query, "$options": "i"}},
            {"listing_title": {"$regex": query, "$options": "i"}},
        ]
    if shipping_from:
        mongo_query["shipping_from"] = {"$regex": shipping_from, "$options": "i"}

    try:
        results = list(
            db["drugmon"]
            .find(mongo_query, {
                "listing_title": 1, "vendor_name": 1, "marketplace": 1,
                "listing_category": 1, "listing_price": 1, "shipping_from": 1,
                "shipping_to": 1, "listing_images": 1, "screenshot_s3link": 1,
                "listing_description": 1, "added_datetime": 1, "listing_link": 1,
            })
            .max_time_ms(settings.darkmon_query_timeout_ms)
            .limit(limit)
        )
        return [_clean(r) for r in results]
    except Exception:
        return []


def get_drug_stats() -> dict:
    """Get drug marketplace overview stats."""
    db = get_darkmon()["forums_market"]
    try:
        category_pipeline = [
            {"$match": {"listing_category": {"$exists": True, "$ne": None, "$ne": ""}}},
            {"$group": {"_id": "$listing_category", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
            {"$limit": 30},
        ]
        # Aggregation on 156K docs needs longer timeout than entity search
        agg_timeout = max(settings.darkmon_query_timeout_ms * 4, 30000)
        categories = list(db["drugmon"].aggregate(category_pipeline, allowDiskUse=True, maxTimeMS=agg_timeout))

        market_pipeline = [
            {"$group": {"_id": "$marketplace", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
            {"$limit": 20},
        ]
        marketplaces = list(db["drugmon"].aggregate(market_pipeline, allowDiskUse=True, maxTimeMS=agg_timeout))

        return {
            "categories": [{"name": c["_id"], "count": c["count"]} for c in categories if c["_id"]],
            "marketplaces": [{"name": m["_id"], "count": m["count"]} for m in marketplaces if m["_id"]],
        }
    except Exception:
        return {"categories": [], "marketplaces": []}


def search_dread(query: str, limit: int = 10) -> dict:
    """Search dread threads and comments."""
    db = get_darkmon()["forums_market"]
    results: dict[str, list] = {"threads": [], "comments": []}

    try:
        threads = list(
            db["dread_threads"].find(
                {"$or": [
                    {"thread_content": {"$regex": query, "$options": "i"}},
                    {"thread_title": {"$regex": query, "$options": "i"}},
                ]},
                {"thread_title": 1, "subreddit_name": 1, "author_name": 1,
                 "posted_datetime": 1, "total_comments": 1, "thread_score": 1,
                 "thread_content": 1, "screenshot": 1},
            ).max_time_ms(settings.darkmon_query_timeout_ms).limit(limit)
        )
        results["threads"] = [
            {**_clean(t), "thread_content": (t.get("thread_content") or "")[:500]}
            for t in threads
        ]
    except Exception:
        pass

    try:
        comments = list(
            db["dread_comments"].find(
                {"comment_content": {"$regex": query, "$options": "i"}},
                {"comment_content": 1, "author_name": 1, "posted_datetime": 1,
                 "thread_id": 1, "comment_score": 1},
            ).limit(limit)
        )
        results["comments"] = [
            {**_clean(c), "comment_content": (c.get("comment_content") or "")[:500]}
            for c in comments
        ]
    except Exception:
        pass

    return results


def get_wallet_info(wallet_address: str) -> dict | None:
    """Lookup a crypto wallet profile."""
    db = get_darkmon()["forums_market"]
    try:
        wallet = db["wallet_info"].find_one({"wallet_address": wallet_address})
        return _clean(wallet) if wallet else None
    except Exception:
        return None


def get_wallet_transactions(wallet_address: str, limit: int = 50) -> list[dict]:
    """Get transactions for a wallet."""
    db = get_darkmon()["forums_market"]
    try:
        txns = list(
            db["wallet_transactions"]
            .find({"wallet_address": wallet_address})
            .sort("date", -1)
            .limit(limit)
        )
        return [_clean(t) for t in txns]
    except Exception:
        return []
