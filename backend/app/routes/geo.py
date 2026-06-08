"""Geo helpers — pincode resolution and friends."""
from fastapi import APIRouter, HTTPException
from app.engines import geo

router = APIRouter(tags=["geo"])


@router.get("/geo/pincode/{pincode}")
def pincode_lookup(pincode: str):
    info = geo.resolve_pincode(pincode)
    if not info:
        # 200 with empty body — frontend treats it as "unknown" silently.
        return {"pincode": pincode, "found": False}
    return {**info, "found": True}
