"""MCA company data endpoints — search, lookup, and aggregation against MCA_PRELIM_08052026."""
import re
import time
import logging
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from app.db import get_fti
from app.audit import audit as audit_service
from app.credits import require_credits

router = APIRouter(tags=["mca"])
log = logging.getLogger("mca")

_DB = "AURACLE"
_COL = "MCA_FULL"
_CACHE_DB = "mca_cache"
_CACHE_COL = "lookups"
_USAGE_COL = "usage_log"
_CACHE_TTL_SECONDS = 7 * 24 * 3600  # 7 days

# Corporate suffixes to strip during name normalization (order matters — longer first)
_STRIP_SUFFIXES = re.compile(
    r"\b(PRIVATE LIMITED|PRIVATE LTD|PVT LIMITED|PVT LTD|LIMITED|LTD)\b",
    re.IGNORECASE,
)
_STRIP_CONJUNCTIONS = re.compile(r"\b(AND|&)\b", re.IGNORECASE)
_MULTI_SPACE = re.compile(r"\s{2,}")


def _col():
    return get_fti()[_DB][_COL]


def _cache_db():
    return get_fti()[_CACHE_DB]


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _normalize_name(name: str) -> str:
    """Strip whitespace, corporate suffixes, and conjunctions for matching."""
    n = name.strip().upper()
    n = _STRIP_SUFFIXES.sub(" ", n)
    n = _STRIP_CONJUNCTIONS.sub(" ", n)
    n = _MULTI_SPACE.sub(" ", n).strip()
    return n


def _build_company_filter(normalized: str) -> dict:
    """Build a per-token regex that requires each meaningful token to appear."""
    tokens = [t for t in normalized.split() if len(t) >= 2]
    if not tokens:
        return {}
    # Each token must appear somewhere in CompanyName (case-insensitive)
    clauses = [{"CompanyName": {"$regex": re.escape(tok), "$options": "i"}} for tok in tokens]
    return {"$and": clauses} if len(clauses) > 1 else clauses[0]


def _match_score(company_name: str, normalized_query: str) -> float:
    """Simple token overlap score 0..1."""
    q_tokens = set(normalized_query.split())
    c_tokens = set(_normalize_name(company_name).split())
    if not q_tokens:
        return 0.0
    hits = len(q_tokens & c_tokens)
    return round(hits / len(q_tokens), 3)


def _log_usage(query: str, matched_count: int, latency_ms: int) -> None:
    try:
        _cache_db()[_USAGE_COL].insert_one({
            "ts": _utc_now(),
            "query": query,
            "matched_count": matched_count,
            "latency_ms": latency_ms,
        })
    except Exception:
        pass  # usage log is best-effort


_BASE_PROJ = {
    "_id": 0,
    "CIN": 1,
    "CompanyName": 1,
    "CompanyStatus": 1,
    "CompanyRegistrationdate_date": 1,
    "Registered_Office_Address": 1,
    "CompanyIndustrialClassification": 1,
    "State": 1,
}


def _base_projection():
    return {
        "_id": 0,
        "CIN": 1,
        "CompanyName": 1,
        "CompanyROCcode": 1,
        "CompanyCategory": 1,
        "CompanySubCategory": 1,
        "CompanyClass": 1,
        "AuthorizedCapital": 1,
        "PaidupCapital": 1,
        "CompanyRegistrationdate_date": 1,
        "Registered_Office_Address": 1,
        "Listingstatus": 1,
        "CompanyStatus": 1,
        "CompanyStateCode": 1,
        "CompanyIndian/Foreign Company": 1,
        "nic_code": 1,
        "CompanyIndustrialClassification": 1,
        "State": 1,
        "StateCode": 1,
    }


@router.get("/company")
def company_lookup(
    request: Request,
    q: str = Query(..., min_length=2),
    limit: int = Query(5, ge=1, le=20),
    _credits: dict = Depends(require_credits("mca_lookup")),
):
    """
    Lookup MCA companies by name with normalization + 7-day cache.
    Used by the FtiScreening frontend to enrich MCA Disqualified Directors hits.
    Returns { query, matched_count, results: [...], _cached? }
    """
    t0 = time.time()
    normalized = _normalize_name(q)

    if not normalized:
        return {"query": q, "matched_count": 0, "results": [],
                "_error": "Query reduces to empty after normalization"}

    # Check cache
    cache_key = f"company:{normalized}:{limit}"
    cached_doc = _cache_db()[_CACHE_COL].find_one({"_id": cache_key})
    if cached_doc:
        expires = cached_doc.get("_expires_at")
        if expires is None or expires.replace(tzinfo=timezone.utc) > _utc_now():
            payload = cached_doc.get("payload", {})
            _log_usage(q, payload.get("matched_count", 0), round((time.time() - t0) * 1000))
            return {**payload, "_cached": True}

    # Query
    filt = _build_company_filter(normalized)
    if not filt:
        return {"query": q, "matched_count": 0, "results": [],
                "_error": "MCA collection not configured"}

    try:
        raw_results = list(_col().find(filt, _BASE_PROJ).limit(limit * 3))  # fetch extra to score+sort
    except Exception as exc:
        log.warning("mca.company query failed: %s", exc)
        return {"query": q, "matched_count": 0, "results": [],
                "_error": "MCA collection not configured"}

    # Score and sort
    scored = sorted(
        raw_results,
        key=lambda d: _match_score(d.get("CompanyName", ""), normalized),
        reverse=True,
    )[:limit]

    results = [
        {
            "cin": d.get("CIN", ""),
            "company_name": d.get("CompanyName", ""),
            "company_status": d.get("CompanyStatus", ""),
            "incorporation_date": d.get("CompanyRegistrationdate_date", ""),
            "address": d.get("Registered_Office_Address", ""),
            "industry": d.get("CompanyIndustrialClassification", ""),
            "state": d.get("State", ""),
            "_source_collection": f"AURACLE.{_COL}",
            "_match_score": _match_score(d.get("CompanyName", ""), normalized),
        }
        for d in scored
    ]

    payload = {"query": q, "matched_count": len(results), "results": results}

    # Store in cache
    expires_at = _utc_now().fromtimestamp(time.time() + _CACHE_TTL_SECONDS, tz=timezone.utc)
    try:
        _cache_db()[_CACHE_COL].replace_one(
            {"_id": cache_key},
            {"_id": cache_key, "payload": payload, "_cached_at": _utc_now(), "_expires_at": expires_at},
            upsert=True,
        )
    except Exception:
        pass  # cache write is best-effort

    elapsed_ms = round((time.time() - t0) * 1000)
    _log_usage(q, len(results), elapsed_ms)

    audit_service.log_from_request(request,
        category="data", action="data.mca_lookup",
        detail={"query": q, "result_count": len(results)},
    )

    return payload


def _build_filter(state: Optional[str], status: Optional[str], company_class: Optional[str]) -> dict:
    f = {}
    if state:
        f["State"] = {"$regex": re.escape(state), "$options": "i"}
    if status:
        f["CompanyStatus"] = {"$regex": re.escape(status), "$options": "i"}
    if company_class:
        f["CompanyClass"] = {"$regex": re.escape(company_class), "$options": "i"}
    return f


@router.get("/search")
def search_companies(
    q: str = Query(..., min_length=3),
    state: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    company_class: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(25, ge=1, le=100),
):
    filt = _build_filter(state, status, company_class)
    filt["CompanyName"] = {"$regex": re.escape(q), "$options": "i"}

    col = _col()
    total = col.count_documents(filt)
    skip = (page - 1) * limit
    results = list(col.find(filt, _base_projection()).skip(skip).limit(limit))

    return {"results": results, "total": total, "page": page, "limit": limit}


@router.get("/cin/{cin}")
def get_by_cin(cin: str):
    doc = _col().find_one({"CIN": cin.upper()}, _base_projection())
    if not doc:
        raise HTTPException(status_code=404, detail=f"CIN {cin} not found")
    return doc


@router.get("/address")
def search_by_address(
    q: str = Query(..., min_length=3),
    state: Optional[str] = Query(None),
    limit: int = Query(25, ge=1, le=100),
):
    filt: dict = {"Registered_Office_Address": {"$regex": re.escape(q), "$options": "i"}}
    if state:
        filt["State"] = {"$regex": re.escape(state), "$options": "i"}

    results = list(_col().find(filt, _base_projection()).limit(limit))
    return {"results": results, "total": len(results), "limit": limit}


@router.get("/industry/{nic_code}")
def companies_by_nic(
    nic_code: str,
    state: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(25, ge=1, le=100),
):
    filt = _build_filter(state, status, None)
    filt["nic_code"] = nic_code

    col = _col()
    total = col.count_documents(filt)
    skip = (page - 1) * limit
    results = list(col.find(filt, _base_projection()).skip(skip).limit(limit))

    return {"results": results, "total": total, "page": page, "limit": limit}


class BatchNameCheckRequest(BaseModel):
    names: list[str]


@router.post("/batch-name-check")
def batch_name_check(body: BatchNameCheckRequest, _credits: dict = Depends(require_credits("mca_batch"))):
    if len(body.names) > 20:
        raise HTTPException(status_code=400, detail="Maximum 20 names per request")
    if not body.names:
        return {"matches": {}}

    col = _col()
    proj = _base_projection()
    matches: dict[str, list] = {}

    for name in body.names:
        name = name.strip()
        if not name:
            matches[name] = []
            continue
        pattern = {"$regex": re.escape(name), "$options": "i"}
        results = list(col.find(
            {"$or": [{"CompanyName": pattern}, {"Registered_Office_Address": pattern}]},
            proj,
        ).limit(10))
        matches[name] = results

    return {"matches": matches}


@router.get("/stats")
def mca_stats():
    col = _col()

    state_pipeline = [
        {"$group": {"_id": "$State", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
    ]
    status_pipeline = [
        {"$group": {"_id": "$CompanyStatus", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
    ]
    class_pipeline = [
        {"$group": {"_id": "$CompanyClass", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
    ]
    industry_pipeline = [
        {"$match": {"nic_code": {"$ne": None, "$ne": ""}}},
        {"$group": {
            "_id": "$nic_code",
            "count": {"$sum": 1},
            "label": {"$first": "$CompanyIndustrialClassification"},
        }},
        {"$sort": {"count": -1}},
        {"$limit": 20},
    ]

    return {
        "total": col.estimated_document_count(),
        "by_state": list(col.aggregate(state_pipeline)),
        "by_status": list(col.aggregate(status_pipeline)),
        "by_class": list(col.aggregate(class_pipeline)),
        "top_industries": list(col.aggregate(industry_pipeline)),
    }


@router.get("/roc/{roc_code}")
def companies_by_roc(
    roc_code: str,
    status: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(25, ge=1, le=100),
):
    filt: dict = {"CompanyROCcode": {"$regex": re.escape(roc_code), "$options": "i"}}
    if status:
        filt["CompanyStatus"] = {"$regex": re.escape(status), "$options": "i"}

    col = _col()
    total = col.count_documents(filt)
    skip = (page - 1) * limit
    results = list(col.find(filt, _base_projection()).skip(skip).limit(limit))

    return {"results": results, "total": total, "page": page, "limit": limit}
