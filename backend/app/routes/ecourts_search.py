"""
eCourts live API endpoints — paid litigant searches, case details, and order PDFs.

Wraps the EcourtsIndia Partner API per `docs/ecourts-knowledge-base.md`. Every
paid response is cached in `ecourts_cache.<cases|searches|orders|orders_ai>` on
the FTI cluster so re-fetches are free; usage is logged to
`ecourts_cache.usage_log` for cost tracking.

Operational guard-rails baked in (per the KB):
  - `courtCodes` chunked at 30 max (§5.1) — values above silently 404
  - `pageSize` capped at 50 server-side (§5.2) — paginate when len(results)==50
  - Embedded `data.files.files[*].markdownContent` checked before paying for
    `/order-md` (§5.6) — bonus content the vendor didn't document
  - 429 → flat 30s sleep (§5.5) — no Retry-After header is sent
  - 4xx errors raise; never silently aggregate
"""
import base64
import hashlib
import json
import re
import time
from datetime import datetime, timezone
from typing import Any, Optional

import httpx
from bson import ObjectId
from fastapi import APIRouter, HTTPException, Path, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field

from app.config import settings
from app.engines import fti

router = APIRouter(tags=["ecourts-live"])

CACHE_DB = "ecourts_cache"
CNR_RE = re.compile(r"^[A-Z0-9]{16}$")  # KB §12 says 4 alpha + 12 digits but
                                         # examples like WBWM0I00…  show alphanumerics
                                         # in the case-number portion


# ── Mongo helpers ───────────────────────────────────────────────────────────

def _db():
    return fti.get_fti()[CACHE_DB]


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _serialise(obj: Any) -> Any:
    """Make a Mongo / API response safe for FastAPI's JSON encoder."""
    if isinstance(obj, ObjectId):
        return str(obj)
    if isinstance(obj, datetime):
        return obj.isoformat()
    if isinstance(obj, bytes):
        return base64.b64encode(obj).decode("ascii")
    if isinstance(obj, dict):
        return {k: _serialise(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_serialise(v) for v in obj]
    return obj


def _cached(coll_name: str, key: str) -> Optional[dict]:
    doc = _db()[coll_name].find_one({"_id": key})
    if not doc:
        return None
    expires = doc.get("_expires_at")
    if expires and expires < _utc_now():
        return None
    return doc.get("payload")


def _store(coll_name: str, key: str, payload: Any, ttl_seconds: Optional[int] = None) -> None:
    record = {"_id": key, "payload": payload, "_cached_at": _utc_now()}
    if ttl_seconds:
        record["_expires_at"] = _utc_now().fromtimestamp(time.time() + ttl_seconds, tz=timezone.utc)
    _db()[coll_name].replace_one({"_id": key}, record, upsert=True)


def _log_usage(method: str, path: str, params: Optional[dict], status: int,
               elapsed_ms: int, response_bytes: int, cost_headers: dict) -> None:
    try:
        _db()["usage_log"].insert_one({
            "ts": _utc_now(),
            "method": method,
            "path": path,
            "params": params,
            "status": status,
            "elapsed_ms": elapsed_ms,
            "bytes": response_bytes,
            "cost_headers": cost_headers or None,
        })
    except Exception:
        # Logging is best-effort; never fail a request because the log write failed.
        pass


# ── HTTP layer ──────────────────────────────────────────────────────────────

class ChunkTooLargeError(RuntimeError):
    """Raised when /search returns 404 — courtCodes array exceeded the silent cap."""


_LAST_PAID_CALL_TS: float = 0.0


def _throttle() -> None:
    """Block until at least `ecourts_paid_sleep_ms` has passed since the last paid call."""
    global _LAST_PAID_CALL_TS
    min_gap = settings.ecourts_paid_sleep_ms / 1000.0
    elapsed = time.time() - _LAST_PAID_CALL_TS
    if elapsed < min_gap:
        time.sleep(min_gap - elapsed)
    _LAST_PAID_CALL_TS = time.time()


def _client() -> httpx.Client:
    if not settings.ecourts_api_token:
        raise HTTPException(503, "ECOURTS_API_TOKEN not configured on this server")
    return httpx.Client(
        base_url=settings.ecourts_api_base,
        headers={
            "Authorization": f"Bearer {settings.ecourts_api_token}",
            "Accept": "application/json",
            "User-Agent": "auracle-ecourts/1.0",
        },
        timeout=settings.ecourts_request_timeout,
    )


def _api_call(method: str, path: str, *, params: Optional[dict] = None,
              json_body: Optional[dict] = None, throttle: bool = True,
              max_attempts: int = 5) -> dict:
    """One paid API call with logging + retry per the KB's status table."""
    if throttle:
        _throttle()
    attempt = 0
    last_error: Optional[str] = None
    while attempt < max_attempts:
        attempt += 1
        t0 = time.time()
        with _client() as c:
            r = c.request(method, path, params=params, json=json_body)
        elapsed_ms = round((time.time() - t0) * 1000)
        cost_headers = {
            k: v for k, v in r.headers.items()
            if any(p in k.lower() for p in ("cost", "credit", "balance", "remaining", "limit", "quota"))
        }
        _log_usage(method, path, params, r.status_code, elapsed_ms, len(r.content or b""), cost_headers)

        if r.status_code == 200:
            try:
                return r.json()
            except Exception as e:
                raise HTTPException(502, f"ecourts non-JSON 200: {e}")
        if r.status_code == 429:
            time.sleep(30)
            continue
        if r.status_code == 404 and path.endswith("/search"):
            raise ChunkTooLargeError(f"/search 404 — courtCodes array too large (try smaller chunks)")
        if r.status_code == 404:
            raise HTTPException(404, f"ecourts not found: {path}")
        if r.status_code in (400, 401, 402, 403):
            try:
                detail = r.json().get("error", {}).get("message", r.text[:300])
            except Exception:
                detail = r.text[:300]
            raise HTTPException(r.status_code, f"ecourts {r.status_code}: {detail}")
        if r.status_code >= 500:
            time.sleep(2 ** attempt)
            last_error = f"5xx after {elapsed_ms}ms"
            continue
        raise HTTPException(502, f"ecourts unexpected {r.status_code}: {r.text[:200]}")
    raise HTTPException(504, f"ecourts max retries exceeded on {path} ({last_error})")


# ── courtCode resolution from the cached enum ───────────────────────────────

def _resolve_court_codes(states: Optional[list], kinds: Optional[list]) -> list[str]:
    """Use the locally-cached `enums_courtCode` to build the courtCodes array.
    Always uses the alphanumeric ENUM namespace (never `complex_code` per KB §3)."""
    flt: dict = {}
    if states:
        flt["_state_prefix"] = {"$in": [s.upper() for s in states]}
    if kinds:
        flt["_court_kind"] = {"$in": kinds}
    cursor = _db()["enums_courtCode"].find(flt, {"_id": 0, "code": 1})
    return [d["code"] for d in cursor if d.get("code")]


# ── /search ─────────────────────────────────────────────────────────────────

class SearchBody(BaseModel):
    name: str = Field(..., min_length=2, description="Litigant name")
    states: Optional[list[str]] = Field(default=None, description="State prefixes, e.g. ['KA','TS']")
    kinds: Optional[list[str]] = Field(default=None, description="Court kinds, e.g. ['HighCourt','District']")
    case_status: Optional[str] = Field(default=None, description="DISPOSED | PENDING (optional)")
    skip_cache: bool = Field(default=False, description="Bypass cache, force fresh paid sweep")


@router.post("/search")
def search(body: SearchBody):
    """Litigant search across the full case corpus.
    Chunks courtCodes at the safe limit, paginates within each chunk, deduplicates by CNR,
    and caches the aggregate keyed by (name, codes-hash, filters).
    """
    name = body.name.strip()
    codes = _resolve_court_codes(body.states, body.kinds)
    if not codes:
        raise HTTPException(400, "No court codes match the given filters")

    cache_key = hashlib.sha1(
        f"{name}|{','.join(sorted(codes))}|{body.case_status or ''}".encode()
    ).hexdigest()
    if not body.skip_cache:
        cached = _cached("searches", cache_key)
        if cached:
            return {**cached, "_cached": True}

    chunk_size = settings.ecourts_search_chunk_size
    page_size = settings.ecourts_search_page_size

    aggregate: dict[str, dict] = {}            # cnr → result
    chunk_diagnostics: list[dict] = []
    total_paid_calls = 0

    for start in range(0, len(codes), chunk_size):
        chunk = codes[start:start + chunk_size]
        page = 1
        chunk_calls = 0
        chunk_hits = 0
        while True:
            params = {
                "litigants": name,
                "courtCodes": ",".join(chunk),
                "page": str(page),
                "pageSize": str(page_size),
            }
            if body.case_status:
                params["caseStatus"] = body.case_status
            try:
                res = _api_call("GET", "/search", params=params)
            except ChunkTooLargeError:
                # Should never happen since we cap at chunk_size, but guard anyway.
                chunk_diagnostics.append({"chunk_idx": start // chunk_size, "error": "ChunkTooLarge"})
                break
            chunk_calls += 1
            total_paid_calls += 1
            data = res.get("data", {}) or {}
            results = data.get("results", []) or []
            chunk_hits += len(results)
            for row in results:
                cnr = row.get("cnr")
                if cnr:
                    aggregate[cnr] = row
            total_hits = data.get("totalHits", 0) or 0
            total_pages = data.get("totalPages", 1) or 1
            # Paginate only when the chunk hit the page-cap AND more pages exist.
            if len(results) < page_size or page >= total_pages:
                break
            page += 1
        chunk_diagnostics.append({
            "chunk_idx": start // chunk_size,
            "codes": len(chunk),
            "calls": chunk_calls,
            "hits_returned": chunk_hits,
        })

    payload = {
        "name": name,
        "filters": {"states": body.states, "kinds": body.kinds, "case_status": body.case_status},
        "court_codes_searched": len(codes),
        "chunks": chunk_diagnostics,
        "total_paid_calls": total_paid_calls,
        "total_unique_cnrs": len(aggregate),
        "results": list(aggregate.values()),
        "_cached": False,
        "_fetched_at": _utc_now().isoformat(),
    }
    _store("searches", cache_key, payload, ttl_seconds=settings.ecourts_search_ttl_seconds)
    return payload


# ── /case/{cnr} ─────────────────────────────────────────────────────────────

def _validate_cnr(cnr: str) -> str:
    cnr = cnr.upper().strip()
    if not CNR_RE.match(cnr):
        raise HTTPException(400, f"Invalid CNR: {cnr!r} — expected 16 alphanumeric chars")
    return cnr


@router.get("/case/{cnr}")
def case_detail(cnr: str = Path(..., min_length=16, max_length=16),
                refresh: bool = Query(False, description="Bypass cache, fetch fresh from eCourts")):
    cnr = _validate_cnr(cnr)
    if not refresh:
        cached = _cached("cases", cnr)
        if cached:
            return {**cached, "_cached": True}

    res = _api_call("GET", f"/case/{cnr}")
    res["_fetched_at"] = _utc_now().isoformat()
    _store("cases", cnr, res, ttl_seconds=settings.ecourts_case_ttl_seconds)
    return {**_serialise(res), "_cached": False}


@router.post("/case/{cnr}/refresh")
def case_refresh(cnr: str = Path(..., min_length=16, max_length=16)):
    cnr = _validate_cnr(cnr)
    res = _api_call("POST", f"/case/{cnr}/refresh")
    return res


@router.get("/case/{cnr}/orders")
def case_orders(cnr: str = Path(..., min_length=16, max_length=16)):
    """List orders for a case from the cached case detail (no extra paid call).
    If the case isn't cached yet, fetch it (paid). Each order entry includes a
    flag `has_embedded_markdown` indicating whether the order text is already
    available without paying for /order-md."""
    cnr = _validate_cnr(cnr)
    case = _cached("cases", cnr)
    if not case:
        case = _api_call("GET", f"/case/{cnr}")
        case["_fetched_at"] = _utc_now().isoformat()
        _store("cases", cnr, case, ttl_seconds=settings.ecourts_case_ttl_seconds)

    files = (case.get("data", {}) or {}).get("files", {}) or {}
    file_list = files.get("files") if isinstance(files, dict) else None
    if not isinstance(file_list, list):
        file_list = []

    out = []
    for f in file_list:
        out.append({
            "pdf_file": f.get("pdfFile"),
            "markdown_file": f.get("markdownFile"),
            "has_embedded_markdown": bool(f.get("markdownContent")),
            "embedded_markdown_chars": len(f.get("markdownContent") or ""),
        })

    # Also fold in the order-stub list from courtCaseData when present
    court_case = (case.get("data", {}) or {}).get("courtCaseData", {}) or {}
    interim = court_case.get("interimOrders", []) or []
    judgment = court_case.get("judgmentOrders", []) or []

    return {
        "cnr": cnr,
        "files": out,
        "interim_orders":  interim,
        "judgment_orders": judgment,
        "order_count": court_case.get("orderCount", len(out)),
    }


# ── /case/{cnr}/order/{filename} ────────────────────────────────────────────

def _embedded_markdown(case: dict, filename: str) -> Optional[str]:
    files = ((case.get("data", {}) or {}).get("files", {}) or {}).get("files") or []
    for f in files:
        if f.get("pdfFile") == filename or f.get("markdownFile") == filename:
            md = f.get("markdownContent")
            if md:
                return md
    return None


def _order_cache_key(cnr: str, filename: str) -> str:
    return f"{cnr}__{filename}"


def _fetch_and_cache_order(cnr: str, filename: str) -> dict:
    """Try the embedded markdown shortcut first (KB §5.6); fall back to paid /order-md."""
    cnr = _validate_cnr(cnr)

    # 1. Cache hit
    key = _order_cache_key(cnr, filename)
    cached = _cached("orders", key)
    if cached:
        return cached

    # 2. Embedded markdown from cached case (free)
    case = _cached("cases", cnr)
    if case:
        md = _embedded_markdown(case, filename)
        if md:
            payload = {
                "cnr": cnr,
                "filename": filename,
                "markdown": md,
                "pdf_base64": None,
                "source": "embedded",
                "_fetched_at": _utc_now().isoformat(),
            }
            _store("orders", key, payload)  # forever
            return payload

    # 3. Paid /order-md
    res = _api_call("GET", f"/case/{cnr}/order-md/{filename}")
    data = res.get("data", {}) or {}
    payload = {
        "cnr": cnr,
        "filename": filename,
        "markdown": data.get("markdown") or data.get("markdownContent") or "",
        "pdf_base64": data.get("pdfBase64") or data.get("pdf_base64"),
        "source": "order-md",
        "_fetched_at": _utc_now().isoformat(),
    }
    _store("orders", key, payload)
    return payload


@router.get("/case/{cnr}/order/{filename}")
def order_detail(cnr: str = Path(..., min_length=16, max_length=16),
                 filename: str = Path(..., min_length=3)):
    payload = _fetch_and_cache_order(cnr, filename)
    # Don't ship the base64 in the JSON response — it's huge. Use the /pdf endpoint instead.
    return {
        "cnr": payload["cnr"],
        "filename": payload["filename"],
        "markdown": payload["markdown"],
        "has_pdf": bool(payload.get("pdf_base64")),
        "source": payload["source"],
        "pdf_url": f"/api/ecourts/case/{payload['cnr']}/order/{payload['filename']}/pdf"
                   if payload.get("pdf_base64") else None,
        "_fetched_at": payload["_fetched_at"],
    }


@router.get("/case/{cnr}/order/{filename}/pdf")
def order_pdf(cnr: str = Path(..., min_length=16, max_length=16),
              filename: str = Path(..., min_length=3)):
    payload = _fetch_and_cache_order(cnr, filename)
    b64 = payload.get("pdf_base64")
    if not b64:
        raise HTTPException(404, "No PDF binary available for this order — only markdown was returned")
    try:
        binary = base64.b64decode(b64)
    except Exception as e:
        raise HTTPException(500, f"Failed to decode cached PDF: {e}")
    safe_name = re.sub(r"[^A-Za-z0-9._-]", "_", filename)
    return Response(
        content=binary,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'inline; filename="{cnr}__{safe_name}"',
            "Cache-Control": "private, max-age=3600",
        },
    )


# ── /case/{cnr}/order/{filename}/ai ─────────────────────────────────────────

@router.get("/case/{cnr}/order/{filename}/ai")
def order_ai(cnr: str = Path(..., min_length=16, max_length=16),
             filename: str = Path(..., min_length=3)):
    """Premium AI-extracted analysis. First access does OCR — may take 10–60s."""
    cnr = _validate_cnr(cnr)
    key = _order_cache_key(cnr, filename)
    cached = _cached("orders_ai", key)
    if cached:
        return {**cached, "_cached": True}

    res = _api_call("GET", f"/case/{cnr}/order-ai/{filename}")
    payload = {
        "cnr": cnr,
        "filename": filename,
        "data": res.get("data", res),
        "_fetched_at": _utc_now().isoformat(),
        "_cached": False,
    }
    _store("orders_ai", key, payload)  # forever
    return payload


# ── Usage summary (free, internal) ──────────────────────────────────────────

@router.get("/usage")
def usage_summary(days: int = Query(7, ge=1, le=90)):
    """Recent usage rolled up — read-only summary of paid calls over the last N days."""
    since = datetime.fromtimestamp(time.time() - days * 86400, tz=timezone.utc)
    pipeline = [
        {"$match": {"ts": {"$gte": since}}},
        {"$group": {
            "_id": {"path": "$path", "status": "$status"},
            "n":          {"$sum": 1},
            "total_ms":   {"$sum": "$elapsed_ms"},
            "total_bytes": {"$sum": "$bytes"},
        }},
        {"$sort": {"n": -1}},
    ]
    rows = list(_db()["usage_log"].aggregate(pipeline))
    return {
        "since": since.isoformat(),
        "by_endpoint": [
            {
                "path":   r["_id"]["path"],
                "status": r["_id"]["status"],
                "calls":  r["n"],
                "total_ms":    r["total_ms"],
                "total_bytes": r["total_bytes"],
            }
            for r in rows
        ],
    }
