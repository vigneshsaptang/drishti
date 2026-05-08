from bson import ObjectId
from fastapi import APIRouter, HTTPException, Query, Request

from app.credits import get_balance, get_usage, get_cost_matrix, get_action_cost, ENGINE_COST_KEYS

router = APIRouter(tags=["credits"])


def _get_current_user(request: Request) -> dict:
    user = getattr(request.state, "user", None)
    if not user:
        raise HTTPException(401, "Not authenticated")
    return user


def _load_full_user(db, user_info: dict) -> dict:
    user = db["users"].find_one({"_id": ObjectId(user_info["id"])})
    if not user:
        raise HTTPException(401, "User not found")
    return user


@router.get("/credits/balance")
def credit_balance(request: Request):
    user_info = _get_current_user(request)
    from app.db import get_platform_db
    db = get_platform_db()
    user = _load_full_user(db, user_info)
    balance = get_balance(user)
    balance["is_admin"] = user.get("role") in ("admin", "super_admin")
    return balance


@router.get("/credits/usage")
def credit_usage(
    request: Request,
    period: str | None = None,
    days: int = Query(default=30, ge=1, le=365),
):
    user_info = _get_current_user(request)
    from bson import ObjectId
    user_id = ObjectId(user_info["id"])
    return get_usage(user_id, period=period, days=days)


@router.get("/credits/preview")
def credit_preview(request: Request, action: str = Query(...)):
    user_info = _get_current_user(request)
    from app.db import get_platform_db
    db = get_platform_db()
    user = _load_full_user(db, user_info)

    cost = get_action_cost(action)
    balance = get_balance(user)

    return {
        "action": action,
        "cost": cost,
        "balance": balance["credits_remaining"],
        "sufficient": balance["credits_remaining"] >= cost,
        "warning": None if balance["credits_remaining"] >= cost else "insufficient_credits",
    }


@router.get("/credits/cost-matrix")
def cost_matrix():
    return get_cost_matrix()


@router.get("/credits/engine-costs")
def engine_costs():
    matrix = get_cost_matrix()
    return {
        engine: matrix.get(cost_key, 0)
        for engine, cost_key in ENGINE_COST_KEYS.items()
    }
