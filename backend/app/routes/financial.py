from fastapi import APIRouter, Query
from app.engines import fti, darkmon

router = APIRouter(tags=["financial"])


@router.get("/financial/upi/{phone}")
def upi_by_phone(phone: str):
    return fti.search_upi_by_phone(phone)


@router.get("/financial/bank")
def bank_accounts(phone: str = Query(None), site_url: str = Query(None)):
    return fti.search_bank_accounts(phone=phone or "", site_url=site_url or "")


@router.get("/financial/crypto/{wallet_address}")
def crypto_trace(wallet_address: str):
    wallet_darkmon = darkmon.get_wallet_info(wallet_address)
    txns_darkmon = darkmon.get_wallet_transactions(wallet_address)
    txns_fti = fti.search_crypto_transactions(wallet_address)
    return {
        "wallet": wallet_darkmon,
        "transactions_darkweb": txns_darkmon,
        "transactions_blockchain": txns_fti,
    }


@router.get("/financial/screen/{name}")
def watchlist_screen(name: str):
    return {
        "crimedata": fti.screen_crimedata(name),
        "worldcheck": fti.screen_worldcheck(name),
    }
