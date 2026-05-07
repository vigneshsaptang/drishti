"""
eCourts cached-data endpoints for the Court Directory tab.

Reads from the `ecourts_cache` DB on the FTI cluster — populated offline by
`ecourts-api-tests/scripts/13_cache_to_mongo.py`. Zero API credits; all queries
are local Mongo aggregations on already-indexed data.

See `docs/ecourts-explorer-spec.md` for the full design.
"""
from typing import Optional
import re

from fastapi import APIRouter, Query

from app.engines import fti

router = APIRouter(tags=["ecourts"])

DB_NAME = "ecourts_cache"


def _db():
    return fti.get_fti()[DB_NAME]


# ── Coverage hero ───────────────────────────────────────────────────────────

@router.get("/coverage")
def coverage():
    """Hero strip: total counts across the cached corpus."""
    db = _db()
    courts = db["enums_courtCode"].estimated_document_count()
    states = db["enums_stateCode"].estimated_document_count()
    hc_master = db["enums_highCourtCode"].estimated_document_count()
    case_types = db["enums_caseType"].estimated_document_count()

    # Court-kind breakdown via the indexed _court_kind field
    kind_breakdown: dict[str, int] = {"District": 0, "HighCourt": 0, "NCLT": 0, "Other": 0}
    for row in db["enums_courtCode"].aggregate([
        {"$group": {"_id": "$_court_kind", "n": {"$sum": 1}}},
    ]):
        kind = row["_id"] or "Other"
        kind_breakdown[kind] = kind_breakdown.get(kind, 0) + row["n"]

    return {
        "courts":      courts,
        "states":      states,
        "hc_master":   hc_master,    # 29 — the Major High Courts list
        "hc_benches":  kind_breakdown.get("HighCourt", 0),  # 40 — actual HC bench codes
        "case_types":  case_types,
        "court_kinds": kind_breakdown,
    }


# ── Per-state aggregation ───────────────────────────────────────────────────

@router.get("/by-state")
def by_state():
    """One row per state: total + court-kind breakdown. Feeds the choropleth + top-states bar."""
    db = _db()
    pipeline = [
        {"$match": {"_state_prefix": {"$ne": None}}},
        {"$group": {
            "_id": "$_state_prefix",
            "state_name": {"$first": "$_state_name"},
            "count": {"$sum": 1},
            "district": {"$sum": {"$cond": [{"$eq": ["$_court_kind", "District"]}, 1, 0]}},
            "highcourt": {"$sum": {"$cond": [{"$eq": ["$_court_kind", "HighCourt"]}, 1, 0]}},
            "nclt":      {"$sum": {"$cond": [{"$eq": ["$_court_kind", "NCLT"]},      1, 0]}},
            "other":     {"$sum": {"$cond": [{"$in": ["$_court_kind", [None, "Other"]]}, 1, 0]}},
        }},
        {"$sort": {"count": -1}},
    ]
    rows = []
    for r in db["enums_courtCode"].aggregate(pipeline):
        rows.append({
            "state_code": r["_id"],
            "state_name": r.get("state_name"),
            "count": r["count"],
            "kind_breakdown": {
                "District":  r["district"],
                "HighCourt": r["highcourt"],
                "NCLT":      r["nclt"],
                "Other":     r["other"],
            },
        })
    return {"data": rows}


# ── Court directory ─────────────────────────────────────────────────────────

@router.get("/courts")
def courts(
    state: Optional[str] = Query(None, description="State prefix, e.g. 'KA'"),
    kind: Optional[str]  = Query(None, description="District / HighCourt / NCLT"),
    q:    Optional[str]  = Query(None, description="Substring match against code or description"),
    page: int = Query(1, ge=1),
    limit: int = Query(100, ge=1, le=500),
):
    """Paginated, filterable court directory. All filters AND together."""
    db = _db()
    flt: dict = {}
    if state:
        flt["_state_prefix"] = state.upper()
    if kind:
        flt["_court_kind"] = kind
    if q:
        # Case-insensitive substring on either code or description.
        rx = re.escape(q)
        flt["$or"] = [
            {"code":        {"$regex": rx, "$options": "i"}},
            {"description": {"$regex": rx, "$options": "i"}},
        ]

    total = db["enums_courtCode"].count_documents(flt)
    skip = (page - 1) * limit
    rows = list(
        db["enums_courtCode"]
        .find(flt, {"_id": 0, "_fetched_at": 0})
        .sort("code", 1)
        .skip(skip)
        .limit(limit)
    )
    return {
        "data": rows,
        "total": total,
        "page": page,
        "limit": limit,
        "has_next": skip + len(rows) < total,
    }


# ── Reference: case types ───────────────────────────────────────────────────

@router.get("/case-types")
def case_types():
    """All cached case types — small reference list."""
    db = _db()
    rows = list(db["enums_caseType"].find({}, {"_id": 0, "_fetched_at": 0}).sort("code", 1))
    return {"data": rows, "total": len(rows)}
