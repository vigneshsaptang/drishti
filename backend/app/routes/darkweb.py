"""Dark web intelligence endpoints."""
from fastapi import APIRouter, Query
from app.engines import darkmon

router = APIRouter(tags=["darkweb"])


@router.get("/darkweb/author/{username}")
def get_author(username: str):
    return darkmon.search_by_username(username)


@router.get("/darkweb/dread")
def search_dread(q: str = Query(..., min_length=2), limit: int = 10):
    return darkmon.search_dread(q, limit=min(limit, 50))


@router.get("/darkweb/wallet/{address}")
def get_wallet(address: str):
    info = darkmon.get_wallet_info(address)
    txns = darkmon.get_wallet_transactions(address, limit=50)
    return {"wallet": info, "transactions": txns}


@router.get("/darkweb/overview")
def darkweb_overview():
    """Standalone dark web intelligence overview — no search needed."""
    result = {}

    # Drug marketplace listings (India-origin)
    try:
        result["india_vendors"] = darkmon.search_drug_vendors(shipping_from="india", limit=15)
    except Exception:
        result["india_vendors"] = []

    # Drug stats
    try:
        result["drug_stats"] = darkmon.get_drug_stats()
    except Exception:
        result["drug_stats"] = {"categories": [], "marketplaces": []}

    # Top threat actors targeting India
    try:
        db = darkmon.get_darkmon()["forums_market"]
        actors = list(
            db["author_aggregation"]
            .find({"target_countries": "India"})
            .sort("no_of_posts", -1)
            .limit(12)
        )
        result["threat_actors"] = [darkmon._clean(a) for a in actors]
    except Exception:
        result["threat_actors"] = []

    # Recent dread threads
    try:
        db = darkmon.get_darkmon()["forums_market"]
        threads = list(
            db["dread_threads"]
            .find({}, {"thread_title": 1, "subreddit_name": 1, "author_name": 1,
                       "posted_datetime": 1, "total_comments": 1, "thread_score": 1,
                       "screenshot": 1})
            .sort("posted_datetime", -1)
            .limit(10)
        )
        result["recent_dread"] = [darkmon._clean(t) for t in threads]
    except Exception:
        result["recent_dread"] = []

    # Top crypto wallets
    try:
        db = darkmon.get_darkmon()["forums_market"]
        wallets = list(
            db["wallet_info"]
            .find({"total_volume.fiat.amount": {"$exists": True, "$ne": ""}})
            .sort("transactions_count.total", -1)
            .limit(8)
        )
        result["top_wallets"] = [darkmon._clean(w) for w in wallets]
    except Exception:
        result["top_wallets"] = []

    # Forum activity breakdown
    try:
        db = darkmon.get_darkmon()["forums_market"]
        forums = list(db["thread_object"].aggregate([
            {"$group": {"_id": "$forum_name", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
            {"$limit": 15},
        ], allowDiskUse=True, maxTimeMS=15000))
        result["forums"] = [{"name": f["_id"], "threads": f["count"]} for f in forums if f["_id"]]
    except Exception:
        result["forums"] = []

    return result
