"""
Audit admin endpoints — event viewer, analytics, activity feed, export, search history.
"""
import csv
import hashlib
import io
import json
import logging
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response

from app.config import settings
from app.db import get_audit
from app.audit import audit, _maybe_mask

log = logging.getLogger("audit_admin")

router = APIRouter(tags=["audit"])


def _require_audit_enabled():
    client = get_audit()
    if not client:
        raise HTTPException(503, "Audit logging is not configured")
    return client[settings.audit_db_name]


def _get_user(request: Request) -> dict:
    return getattr(request.state, "user", None) or {}


def _clean(doc: dict) -> dict:
    d = dict(doc)
    if "_id" in d:
        d["_id"] = str(d["_id"])
    return d


def _build_filter(
    category: str | None = None,
    action: str | None = None,
    user_id: str | None = None,
    severity: str | None = None,
    ip: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
) -> dict:
    query: dict = {}
    if category:
        query["category"] = category
    if action:
        query["action"] = action
    if user_id:
        query["user_id"] = user_id
    if severity:
        query["severity"] = severity
    if ip:
        query["client_ip"] = ip
    if date_from or date_to:
        ts_filter: dict = {}
        if date_from:
            ts_filter["$gte"] = datetime.fromisoformat(date_from)
        if date_to:
            ts_filter["$lte"] = datetime.fromisoformat(date_to)
        query["timestamp"] = ts_filter
    return query


# ── Event list ────────────────────────────────────────────────

@router.get("/audit/events")
def list_events(
    request: Request,
    page: int = 1,
    page_size: int = 50,
    category: str | None = None,
    action: str | None = None,
    user_id: str | None = None,
    severity: str | None = None,
    ip: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
):
    db = _require_audit_enabled()
    query = _build_filter(category, action, user_id, severity, ip, date_from, date_to)
    skip = (page - 1) * page_size

    total = db["audit_events"].count_documents(query)
    events = [
        _clean(e) for e in
        db["audit_events"]
        .find(query)
        .sort("timestamp", -1)
        .skip(skip)
        .limit(page_size)
    ]

    return {
        "events": events,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": (total + page_size - 1) // page_size if total > 0 else 0,
    }


# ── Activity feed ─────────────────────────────────────────────

@router.get("/audit/activity/feed")
def activity_feed(since: str | None = None, limit: int = 20):
    db = _require_audit_enabled()

    query: dict = {}
    if since:
        ref = db["audit_events"].find_one({"event_id": since}, {"timestamp": 1})
        if ref:
            query["timestamp"] = {"$gt": ref["timestamp"]}

    events = [
        _clean(e) for e in
        db["audit_events"]
        .find(query, {
            "event_id": 1, "category": 1, "action": 1,
            "username": 1, "client_ip": 1, "timestamp": 1,
            "response_time_ms": 1,
            "detail.search_type": 1,
            "detail.search_value_type": 1,
            "detail.endpoint": 1,
        })
        .sort("timestamp", -1)
        .limit(limit)
    ]

    return {"events": events, "server_time": datetime.now(timezone.utc).isoformat()}


@router.get("/audit/activity/active-users")
def active_users(minutes: int = 15):
    db = _require_audit_enabled()
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=minutes)

    pipeline = [
        {"$match": {"last_seen_at": {"$gte": cutoff}, "revoked": False}},
        {"$project": {
            "_id": 0,
            "user_id": 1,
            "username": 1,
            "client_ip": 1,
            "last_seen_at": 1,
        }},
        {"$sort": {"last_seen_at": -1}},
    ]

    return [_clean(s) for s in db["active_sessions"].aggregate(pipeline)]


# ── Analytics ─────────────────────────────────────────────────

@router.get("/audit/analytics/searches-by-hour")
def searches_by_hour():
    db = _require_audit_enabled()
    cutoff = datetime.now(timezone.utc) - timedelta(hours=24)

    pipeline = [
        {"$match": {
            "category": "search",
            "action": "search.execute",
            "timestamp": {"$gte": cutoff},
        }},
        {"$group": {
            "_id": {
                "hour": {"$hour": "$timestamp"},
                "day": {"$dayOfMonth": "$timestamp"},
            },
            "count": {"$sum": 1},
            "avg_time_ms": {"$avg": "$response_time_ms"},
        }},
        {"$sort": {"_id.day": 1, "_id.hour": 1}},
    ]

    return [_clean(r) for r in db["audit_events"].aggregate(pipeline)]


@router.get("/audit/analytics/top-users")
def top_users(days: int = 7, limit: int = 10):
    db = _require_audit_enabled()
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)

    pipeline = [
        {"$match": {
            "category": "search",
            "timestamp": {"$gte": cutoff},
        }},
        {"$group": {
            "_id": "$user_id",
            "username": {"$first": "$username"},
            "search_count": {"$sum": 1},
            "last_search": {"$max": "$timestamp"},
            "unique_ips": {"$addToSet": "$client_ip"},
        }},
        {"$sort": {"search_count": -1}},
        {"$limit": limit},
        {"$project": {
            "_id": 0,
            "user_id": "$_id",
            "username": 1,
            "search_count": 1,
            "last_search": 1,
            "unique_ip_count": {"$size": "$unique_ips"},
        }},
    ]

    return [_clean(r) for r in db["audit_events"].aggregate(pipeline)]


@router.get("/audit/analytics/failed-logins")
def failed_logins(hours: int = 24, threshold: int = 3):
    db = _require_audit_enabled()
    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)

    pipeline = [
        {"$match": {
            "action": "auth.login_failure",
            "timestamp": {"$gte": cutoff},
        }},
        {"$group": {
            "_id": "$client_ip",
            "attempts": {"$sum": 1},
            "usernames_tried": {"$addToSet": "$detail.username_attempted"},
            "first_attempt": {"$min": "$timestamp"},
            "last_attempt": {"$max": "$timestamp"},
        }},
        {"$match": {"attempts": {"$gte": threshold}}},
        {"$sort": {"attempts": -1}},
    ]

    return [_clean(r) for r in db["audit_events"].aggregate(pipeline)]


@router.get("/audit/analytics/search-frequency")
def search_frequency(days: int = 30, limit: int = 20):
    db = _require_audit_enabled()
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)

    pipeline = [
        {"$match": {
            "action": "search.execute",
            "timestamp": {"$gte": cutoff},
        }},
        {"$group": {
            "_id": {
                "hash": "$detail.search_value",
                "type": "$detail.search_type",
            },
            "count": {"$sum": 1},
            "last_searched": {"$max": "$timestamp"},
            "unique_users": {"$addToSet": "$user_id"},
        }},
        {"$sort": {"count": -1}},
        {"$limit": limit},
        {"$project": {
            "_id": 0,
            "search_value_hash": "$_id.hash",
            "search_type": "$_id.type",
            "search_count": "$count",
            "last_searched": 1,
            "unique_user_count": {"$size": "$unique_users"},
        }},
    ]

    return [_clean(r) for r in db["audit_events"].aggregate(pipeline)]


@router.get("/audit/analytics/user-timeline")
def user_timeline(user_id: str, days: int = 7):
    db = _require_audit_enabled()
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)

    pipeline = [
        {"$match": {"user_id": user_id, "timestamp": {"$gte": cutoff}}},
        {"$group": {
            "_id": {
                "date": {"$dateToString": {"format": "%Y-%m-%d", "date": "$timestamp"}},
                "category": "$category",
            },
            "count": {"$sum": 1},
        }},
        {"$sort": {"_id.date": 1}},
    ]

    return [_clean(r) for r in db["audit_events"].aggregate(pipeline)]


# ── Chain verification ────────────────────────────────────────

@router.get("/audit/verify-chain")
def verify_chain(limit: int = 1000, offset: int = 0):
    db = _require_audit_enabled()
    hmac_key = (settings.audit_hmac_key or "default-dev-key").encode("utf-8")

    cursor = db["audit_events"].find(
        {}, {"event_id": 1, "chain_hash": 1, "action": 1, "timestamp": 1,
             "user_id": 1, "detail": 1}
    ).sort("timestamp", 1).skip(offset).limit(limit)

    prev_hash = "genesis"
    if offset > 0:
        prev_doc = db["audit_events"].find(
            {}, {"chain_hash": 1}
        ).sort("timestamp", 1).skip(offset - 1).limit(1)
        prev_list = list(prev_doc)
        if prev_list:
            prev_hash = prev_list[0]["chain_hash"]

    import hmac as hmac_mod
    verified = 0
    for doc in cursor:
        payload = json.dumps({
            "event_id": doc["event_id"],
            "action": doc["action"],
            "timestamp": doc["timestamp"].isoformat(),
            "user_id": doc.get("user_id"),
            "detail": doc.get("detail"),
            "prev_hash": prev_hash,
        }, sort_keys=True, default=str)
        expected = hmac_mod.new(hmac_key, payload.encode(), hashlib.sha256).hexdigest()
        if doc["chain_hash"] != expected:
            return {
                "status": "broken",
                "break_at_event_id": doc["event_id"],
                "break_at_position": offset + verified,
                "verified_before_break": verified,
            }
        prev_hash = doc["chain_hash"]
        verified += 1

    return {
        "status": "ok",
        "verified_count": verified,
        "offset": offset,
    }


# ── User search history ──────────────────────────────────────

@router.get("/my/search-history")
def my_search_history(request: Request, page: int = 1, page_size: int = 20):
    db = _require_audit_enabled()
    user = _get_user(request)
    user_id = user.get("id")
    if not user_id:
        raise HTTPException(401, "Not authenticated")

    skip = (page - 1) * page_size
    total = db["search_history"].count_documents({"user_id": user_id})
    history = [
        _clean(h) for h in
        db["search_history"]
        .find({"user_id": user_id})
        .sort("timestamp", -1)
        .skip(skip)
        .limit(page_size)
    ]

    return {
        "history": history,
        "total": total,
        "page": page,
        "page_size": page_size,
    }


# ── Export ────────────────────────────────────────────────────

@router.get("/audit/export/csv")
def export_csv(
    request: Request,
    date_from: str | None = None,
    date_to: str | None = None,
    category: str | None = None,
):
    db = _require_audit_enabled()
    query = _build_filter(category=category, date_from=date_from, date_to=date_to)
    cursor = db["audit_events"].find(query).sort("timestamp", 1)

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "event_id", "timestamp", "category", "action", "severity",
        "user_id", "username", "client_ip", "response_time_ms",
        "detail_json",
    ])

    count = 0
    for doc in cursor:
        writer.writerow([
            doc.get("event_id"),
            doc.get("timestamp", "").isoformat() if doc.get("timestamp") else "",
            doc.get("category"),
            doc.get("action"),
            doc.get("severity"),
            doc.get("user_id"),
            doc.get("username"),
            doc.get("client_ip"),
            doc.get("response_time_ms"),
            json.dumps(doc.get("detail", {}), default=str),
        ])
        count += 1

    user = _get_user(request)
    audit.log_export(
        user_id=user.get("id"),
        username=user.get("username"),
        client_ip=getattr(request.state, "client_ip", None),
        action="audit_log",
        detail={
            "format": "csv",
            "date_from": date_from,
            "date_to": date_to,
            "category": category,
            "row_count": count,
        },
    )

    content = output.getvalue()
    filename = f"auracle-audit-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}.csv"
    return Response(
        content=content,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/audit/export/json")
def export_json(
    request: Request,
    date_from: str | None = None,
    date_to: str | None = None,
    category: str | None = None,
):
    db = _require_audit_enabled()
    query = _build_filter(category=category, date_from=date_from, date_to=date_to)
    cursor = db["audit_events"].find(query).sort("timestamp", 1)

    lines = []
    count = 0
    for doc in cursor:
        doc["_id"] = str(doc["_id"])
        lines.append(json.dumps(doc, default=str))
        count += 1

    user = _get_user(request)
    audit.log_export(
        user_id=user.get("id"),
        username=user.get("username"),
        client_ip=getattr(request.state, "client_ip", None),
        action="audit_log",
        detail={"format": "json", "row_count": count},
    )

    content = "\n".join(lines)
    filename = f"auracle-audit-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}.jsonl"
    return Response(
        content=content,
        media_type="application/x-ndjson",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ── Rollup trigger ────────────────────────────────────────────

@router.post("/audit/analytics/rollup")
def trigger_rollup(date: str, hour: int | None = None):
    target = datetime.fromisoformat(f"{date}T{hour or 0:02d}:00:00+00:00")
    if hour is not None:
        audit._rollup_hour(target)
        return {"status": "ok", "rolled_up": f"{date} hour {hour}"}
    else:
        for h in range(24):
            audit._rollup_hour(target.replace(hour=h))
        return {"status": "ok", "rolled_up": f"{date} all hours"}
