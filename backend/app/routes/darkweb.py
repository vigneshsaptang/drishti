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
