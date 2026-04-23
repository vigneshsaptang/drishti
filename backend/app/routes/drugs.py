from fastapi import APIRouter, Query
from app.engines import darkmon

router = APIRouter(tags=["drugs"])


@router.get("/drugs/stats")
def drug_stats():
    return darkmon.get_drug_stats()


@router.get("/drugs/search")
def search_drugs(q: str = Query(None), shipping_from: str = Query(None), limit: int = 20):
    return darkmon.search_drug_vendors(query=q, shipping_from=shipping_from, limit=min(limit, 100))


@router.get("/drugs/india")
def india_vendors():
    return darkmon.search_drug_vendors(shipping_from="india", limit=50)
