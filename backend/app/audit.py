"""
Audit logging service — append-only, tamper-evident, async-buffered.

Usage from any route:
    from app.audit import audit
    audit.log_search(...)

All writes are buffered and flushed in a background thread.
If MONGO_URI_AUDIT is empty, all methods are silent no-ops.
"""
import hashlib
import hmac
import json
import os
import threading
import time
import logging
from collections import deque
from datetime import datetime, timezone, timedelta
from typing import Any

from app.config import settings
from app.db import get_audit

log = logging.getLogger("audit")

_MAX_BUFFER = 10_000


def _ulid_like() -> str:
    ts = int(time.time() * 1000).to_bytes(6, "big").hex()
    rnd = os.urandom(5).hex()
    return f"evt_{ts}{rnd}"


def _hash_value(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _maybe_mask(value: str) -> tuple[str, str]:
    if settings.audit_store_plaintext:
        return value, "plaintext"
    return _hash_value(value), "hashed"


class AuditService:
    def __init__(self):
        self._buffer: deque[dict] = deque(maxlen=_MAX_BUFFER)
        self._sh_buffer: deque[dict] = deque(maxlen=_MAX_BUFFER)
        self._lock = threading.Lock()
        self._flush_thread: threading.Thread | None = None
        self._rollup_thread: threading.Thread | None = None
        self._running = False
        self._chain_hash: str | None = None
        self._consecutive_failures = 0

    @property
    def enabled(self) -> bool:
        return bool(settings.mongo_uri_audit)

    def start(self):
        if not self.enabled:
            log.info("Audit logging disabled (no MONGO_URI_AUDIT)")
            return
        self._running = True
        self._flush_thread = threading.Thread(target=self._flush_loop, daemon=True)
        self._flush_thread.start()
        self._rollup_thread = threading.Thread(target=self._rollup_loop, daemon=True)
        self._rollup_thread.start()
        log.info("Audit service started (buffer=%d, interval=%.1fs)",
                 settings.audit_buffer_size, settings.audit_flush_interval_s)

    def stop(self):
        self._running = False
        if self._flush_thread:
            self._flush_thread.join(timeout=5.0)
        self._flush_now()

    # ── Public logging methods ──────────────────────────────

    def log(self, *,
            category: str,
            action: str,
            severity: str = "info",
            user_id: str | None = None,
            username: str | None = None,
            session_id: str | None = None,
            client_ip: str | None = None,
            user_agent: str | None = None,
            request_id: str | None = None,
            response_time_ms: int | None = None,
            detail: dict | None = None):
        if not self.enabled:
            return

        now = datetime.now(timezone.utc)
        expires_at = now + timedelta(days=settings.audit_retention_days)

        event = {
            "event_id": _ulid_like(),
            "category": category,
            "action": action,
            "severity": severity,
            "user_id": user_id,
            "username": username,
            "session_id": session_id,
            "client_ip": client_ip,
            "user_agent": user_agent,
            "request_id": request_id,
            "timestamp": now,
            "response_time_ms": response_time_ms,
            "detail": detail or {},
            "expires_at": expires_at,
        }

        with self._lock:
            self._buffer.append(event)

    def log_search(self, *,
                   user_id: str | None,
                   username: str | None,
                   session_id: str | None = None,
                   client_ip: str | None = None,
                   user_agent: str | None = None,
                   request_id: str | None = None,
                   search_type: str,
                   search_value: str,
                   seeds: list[dict] | None = None,
                   max_depth: int,
                   endpoint: str,
                   response_time_ms: int,
                   result_summary: dict,
                   is_pivot: bool = False,
                   pivot_from: dict | None = None):
        masked_value, value_type = _maybe_mask(search_value)

        detail = {
            "search_type": search_type,
            "search_value": masked_value,
            "search_value_type": value_type,
            "max_depth": max_depth,
            "endpoint": endpoint,
            "result_summary": result_summary,
        }
        if seeds:
            detail["seeds"] = [
                {"type": s["type"], "value": _maybe_mask(s["value"])[0]}
                for s in seeds
            ]
        if is_pivot and pivot_from:
            detail["pivot_from"] = pivot_from

        self.log(
            category="search",
            action="search.pivot" if is_pivot else "search.execute",
            user_id=user_id,
            username=username,
            session_id=session_id,
            client_ip=client_ip,
            user_agent=user_agent,
            request_id=request_id,
            response_time_ms=response_time_ms,
            detail=detail,
        )

        self._enqueue_search_history(
            user_id=user_id,
            username=username,
            search_type=search_type,
            search_value=search_value,
            seeds=seeds,
            max_depth=max_depth,
            endpoint=endpoint,
            result_summary=result_summary,
            is_pivot=is_pivot,
            pivot_from=pivot_from,
        )

    def log_auth(self, *,
                 action: str,
                 client_ip: str | None = None,
                 user_agent: str | None = None,
                 detail: dict):
        severity = "warn" if "failure" in action else "info"
        self.log(
            category="auth",
            action=f"auth.{action}",
            severity=severity,
            user_id=detail.get("user_id"),
            username=detail.get("username"),
            session_id=detail.get("session_id"),
            client_ip=client_ip,
            user_agent=user_agent,
            detail=detail,
        )

    def log_export(self, *,
                   user_id: str | None,
                   username: str | None,
                   client_ip: str | None = None,
                   action: str,
                   detail: dict):
        self.log(
            category="export",
            action=f"export.{action}",
            user_id=user_id,
            username=username,
            client_ip=client_ip,
            detail=detail,
        )

    def log_data_access(self, *,
                        user_id: str | None,
                        username: str | None,
                        client_ip: str | None = None,
                        request_id: str | None = None,
                        action: str,
                        detail: dict):
        self.log(
            category="data",
            action=f"data.{action}",
            user_id=user_id,
            username=username,
            client_ip=client_ip,
            request_id=request_id,
            detail=detail,
        )

    def log_client_error(self, *,
                         error_type: str,
                         message: str,
                         stack: str | None = None,
                         component: str | None = None,
                         url: str | None = None,
                         client_ip: str | None = None,
                         user_agent: str | None = None,
                         user_id: str | None = None,
                         username: str | None = None):
        self.log(
            category="client_error",
            action=f"client_error.{error_type}",
            severity="error",
            user_id=user_id,
            username=username,
            client_ip=client_ip,
            user_agent=user_agent,
            detail={
                "error_type": error_type,
                "message": message[:2000],
                "stack": (stack or "")[:5000],
                "component": component,
                "url": url,
            },
        )

    def log_slow_query(self, *,
                       engine: str,
                       query_type: str,
                       duration_ms: int,
                       user_id: str | None = None,
                       username: str | None = None,
                       detail: dict | None = None):
        self.log(
            category="performance",
            action=f"slow_query.{engine}",
            severity="warn",
            user_id=user_id,
            username=username,
            response_time_ms=duration_ms,
            detail={
                "engine": engine,
                "query_type": query_type,
                "duration_ms": duration_ms,
                **(detail or {}),
            },
        )

    def log_empty_result(self, *,
                         engine: str,
                         search_type: str,
                         user_id: str | None = None,
                         username: str | None = None,
                         detail: dict | None = None):
        self.log(
            category="diagnostic",
            action=f"empty_result.{engine}",
            severity="info",
            user_id=user_id,
            username=username,
            detail={
                "engine": engine,
                "search_type": search_type,
                **(detail or {}),
            },
        )

    def log_from_request(self, request, *, category: str, action: str,
                         severity: str = "info", detail: dict | None = None,
                         response_time_ms: int | None = None):
        user = getattr(request.state, "user", None) or {}
        self.log(
            category=category,
            action=action,
            severity=severity,
            user_id=user.get("id"),
            username=user.get("username"),
            session_id=user.get("jti"),
            client_ip=getattr(request.state, "client_ip", None),
            user_agent=getattr(request.state, "user_agent", None),
            request_id=getattr(request.state, "request_id", None),
            response_time_ms=response_time_ms,
            detail=detail,
        )

    # ── Search history ────────────────────────────────────────

    def _enqueue_search_history(self, **kwargs):
        now = datetime.now(timezone.utc)
        rs = kwargs["result_summary"]
        doc = {
            "user_id": kwargs["user_id"],
            "username": kwargs["username"],
            "timestamp": now,
            "search_type": kwargs["search_type"],
            "search_value": kwargs["search_value"],
            "seeds": kwargs.get("seeds"),
            "max_depth": kwargs["max_depth"],
            "endpoint": kwargs["endpoint"],
            "breach_sources_found": rs.get("credmon_entities_found", 0),
            "entities_discovered": rs.get("credmon_entities_searched", 0),
            "fti_matches": (
                rs.get("fti_crimedata_matches", 0) +
                rs.get("fti_worldcheck_matches", 0)
            ),
            "darkmon_matches": rs.get("darkmon_matches", 0),
            "total_time_ms": rs.get("total_time_ms", 0),
            "is_pivot": kwargs.get("is_pivot", False),
            "pivot_from": kwargs.get("pivot_from"),
            "expires_at": now + timedelta(days=settings.audit_search_history_days),
        }
        with self._lock:
            self._sh_buffer.append(doc)

    # ── Active session tracking ───────────────────────────────

    _session_last_touch: dict[str, float] = {}

    def touch_session(self, session_id: str, user_id: str, username: str,
                      client_ip: str | None = None, user_agent: str | None = None):
        if not self.enabled or not session_id:
            return
        now = time.time()
        if session_id in self._session_last_touch and (now - self._session_last_touch[session_id]) < 60:
            return
        self._session_last_touch[session_id] = now
        try:
            client = get_audit()
            if client:
                client[settings.audit_db_name]["active_sessions"].update_one(
                    {"session_id": session_id},
                    {"$set": {
                        "last_seen_at": datetime.now(timezone.utc),
                        "client_ip": client_ip,
                        "user_agent": user_agent,
                    },
                     "$setOnInsert": {
                         "user_id": user_id,
                         "username": username,
                         "created_at": datetime.now(timezone.utc),
                         "revoked": False,
                     }},
                    upsert=True,
                )
        except Exception:
            pass

    def create_session_record(self, session_id: str, user_id: str, username: str,
                              expires_at: datetime, client_ip: str | None = None,
                              user_agent: str | None = None):
        if not self.enabled:
            return
        try:
            client = get_audit()
            if client:
                now = datetime.now(timezone.utc)
                client[settings.audit_db_name]["active_sessions"].update_one(
                    {"session_id": session_id},
                    {"$set": {
                        "session_id": session_id,
                        "user_id": user_id,
                        "username": username,
                        "created_at": now,
                        "last_seen_at": now,
                        "client_ip": client_ip,
                        "user_agent": user_agent,
                        "revoked": False,
                        "revoked_at": None,
                        "revoked_by": None,
                        "expires_at": expires_at,
                    }},
                    upsert=True,
                )
        except Exception as e:
            log.debug("Failed to create session record: %s", e)

    # ── Background flush ──────────────────────────────────────

    def _flush_loop(self):
        while self._running:
            time.sleep(settings.audit_flush_interval_s)
            self._flush_now()

    def _flush_now(self):
        events = []
        sh_events = []
        with self._lock:
            while self._buffer:
                events.append(self._buffer.popleft())
            while self._sh_buffer:
                sh_events.append(self._sh_buffer.popleft())

        if not events and not sh_events:
            return

        client = get_audit()
        if not client:
            return
        db = client[settings.audit_db_name]

        if self._chain_hash is None:
            head = db["chain_state"].find_one({"_id": "chain_head"})
            self._chain_hash = head["last_hash"] if head else "genesis"

        hmac_key = (settings.audit_hmac_key or "default-dev-key").encode("utf-8")
        for evt in events:
            payload = json.dumps({
                "event_id": evt["event_id"],
                "action": evt["action"],
                "timestamp": evt["timestamp"].isoformat(),
                "user_id": evt.get("user_id"),
                "detail": evt.get("detail"),
                "prev_hash": self._chain_hash,
            }, sort_keys=True, default=str)
            evt["chain_hash"] = hmac.new(hmac_key, payload.encode(), hashlib.sha256).hexdigest()
            self._chain_hash = evt["chain_hash"]

        if events:
            try:
                db["audit_events"].insert_many(events, ordered=True)
                db["chain_state"].find_one_and_update(
                    {"_id": "chain_head"},
                    {"$set": {
                        "last_hash": self._chain_hash,
                        "last_event_id": events[-1]["event_id"],
                        "updated_at": datetime.now(timezone.utc),
                    }},
                    upsert=True,
                )
                self._consecutive_failures = 0
                log.debug("Flushed %d audit events", len(events))
            except Exception as e:
                self._consecutive_failures += 1
                log.error("Audit flush failed (%d consecutive): %s",
                          self._consecutive_failures, e)
                if self._consecutive_failures < 3:
                    with self._lock:
                        self._buffer.extendleft(reversed(events))

        if sh_events:
            try:
                db["search_history"].insert_many(sh_events, ordered=False)
                log.debug("Flushed %d search history entries", len(sh_events))
            except Exception as e:
                log.error("Search history flush failed: %s", e)

    # ── Hourly analytics rollup ───────────────────────────────

    def _rollup_loop(self):
        time.sleep(60)
        while self._running:
            try:
                target = datetime.now(timezone.utc) - timedelta(hours=1)
                self._rollup_hour(target)
            except Exception as e:
                log.error("Analytics rollup failed: %s", e)
            time.sleep(3600)

    def _rollup_hour(self, target_hour: datetime):
        client = get_audit()
        if not client:
            return
        db = client[settings.audit_db_name]
        hour_start = target_hour.replace(minute=0, second=0, microsecond=0)
        hour_end = hour_start + timedelta(hours=1)
        date_str = hour_start.strftime("%Y-%m-%d")
        hour_num = hour_start.hour

        pipeline = [
            {"$match": {
                "timestamp": {"$gte": hour_start, "$lt": hour_end},
                "category": "search",
                "action": "search.execute",
            }},
            {"$group": {
                "_id": None,
                "total_searches": {"$sum": 1},
                "avg_response_time_ms": {"$avg": "$response_time_ms"},
                "unique_users": {"$addToSet": "$user_id"},
                "search_types": {"$push": "$detail.search_type"},
                "endpoints": {"$push": "$detail.endpoint"},
                "user_counts": {"$push": "$user_id"},
                "response_times": {"$push": "$response_time_ms"},
            }},
        ]

        results = list(db["audit_events"].aggregate(pipeline))
        if not results:
            return

        r = results[0]
        from collections import Counter
        type_counts = dict(Counter(r["search_types"]))
        endpoint_counts = dict(Counter(r["endpoints"]))
        user_counts = dict(Counter(r["user_counts"]))

        times = sorted([t for t in r["response_times"] if t is not None])
        p95 = times[int(len(times) * 0.95)] if times else 0

        auth_pipeline = [
            {"$match": {
                "timestamp": {"$gte": hour_start, "$lt": hour_end},
                "category": "auth",
            }},
            {"$group": {"_id": "$action", "count": {"$sum": 1}}},
        ]
        auth_results = {ar["_id"]: ar["count"] for ar in db["audit_events"].aggregate(auth_pipeline)}

        doc = {
            "date": date_str,
            "hour": hour_num,
            "total_searches": r["total_searches"],
            "searches_by_type": type_counts,
            "searches_by_endpoint": endpoint_counts,
            "avg_response_time_ms": round(r["avg_response_time_ms"] or 0),
            "p95_response_time_ms": p95,
            "unique_users": len(r["unique_users"]),
            "searches_per_user": user_counts,
            "login_successes": auth_results.get("auth.login_success", 0),
            "login_failures": auth_results.get("auth.login_failure", 0),
            "expires_at": datetime.now(timezone.utc) + timedelta(days=settings.audit_analytics_retention_days),
        }

        db["analytics_daily"].update_one(
            {"date": date_str, "hour": hour_num},
            {"$set": doc},
            upsert=True,
        )


audit = AuditService()
