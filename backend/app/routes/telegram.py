from fastapi import APIRouter, Query
from app.engines import fti

router = APIRouter(tags=["telegram"])


@router.get("/telegram/mentions/{phone}")
def phone_mentions(phone: str):
    mentions = fti.search_telegram_mentions(phone)
    groups = fti.get_telegram_group_details(phone) if mentions.get("found") else []
    return {"mentions": mentions, "groups": groups}


@router.get("/telegram/search")
def search_messages(q: str = Query(..., min_length=2), limit: int = 20):
    return fti.search_telegram_messages(q, limit=min(limit, 50))
