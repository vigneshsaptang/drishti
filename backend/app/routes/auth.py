from datetime import datetime, timedelta, timezone

import jwt
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.config import settings

router = APIRouter()


class LoginBody(BaseModel):
    username: str = ""
    password: str = ""


def _auth_enabled() -> bool:
    return bool((settings.saptang_admin_password or "").strip())


def create_access_token() -> str:
    exp = datetime.now(timezone.utc) + timedelta(hours=settings.saptang_token_exp_hours)
    return jwt.encode(
        {"sub": settings.saptang_admin_user, "exp": exp},
        settings.saptang_jwt_secret,
        algorithm="HS256",
    )


def verify_token(authorization: str | None) -> bool:
    if not authorization or not authorization.startswith("Bearer "):
        return False
    token = authorization[7:].strip()
    if not token:
        return False
    try:
        jwt.decode(token, settings.saptang_jwt_secret, algorithms=["HS256"])
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        return False
    return True


@router.get("/auth/status")
def auth_status():
    return {
        "app_name": "Auracle by Saptang Labs",
        "auth_required": _auth_enabled(),
    }


@router.post("/auth/login")
def auth_login(body: LoginBody):
    if not _auth_enabled():
        return {"access_token": create_access_token(), "token_type": "bearer", "auth_disabled": True}
    u = (body.username or "").strip()
    p = body.password or ""
    if u != (settings.saptang_admin_user or "").strip() or p != (settings.saptang_admin_password or ""):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    return {"access_token": create_access_token(), "token_type": "bearer", "auth_disabled": False}
