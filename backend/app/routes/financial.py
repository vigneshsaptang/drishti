"""Financial trail endpoints — UPI, bank accounts, crypto, watchlist screening."""
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


@router.get("/financial/fraud-upis")
def list_fraud_upis(limit: int = Query(50, le=200), classification: str = Query(None)):
    """List all tracked fraud UPI IDs — standalone, no search needed."""
    query = {}
    if classification:
        query["clasification"] = classification
    else:
        query["clasification"] = {"$in": ["BETTING_SITE", "FRAUD", "CRYPTO_EXCHANGE"]}

    return fti._safe_fti_query(
        "testing_i4c", "UPI_ID_parsed",
        query,
        {"upi_details": 1, "clasification": 1, "site": 1, "payment_gateway": 1,
         "home_page_screenshot": 1, "upi_screen_shot": 1, "created_at": 1},
        limit=limit,
    )


@router.get("/financial/bank-accounts")
def list_bank_accounts(limit: int = Query(50, le=200)):
    """List all tracked bank accounts — standalone."""
    return fti._safe_fti_query(
        "testing_i4c", "BANK_ACCOUNT_DETAILS",
        {},
        None,
        limit=limit,
    )
