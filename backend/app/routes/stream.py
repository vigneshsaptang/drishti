"""
Streaming search endpoint — SSE (Server-Sent Events).
Returns CREDMON results immediately, then FTI and DARKMON as they complete.
"""
import json
import time
import concurrent.futures
from datetime import datetime
from bson import ObjectId
from fastapi import APIRouter
from sse_starlette.sse import EventSourceResponse
from pydantic import BaseModel

from app.engines import credmon, darkmon, fti


def _serialize(obj):
    """JSON serializer that handles MongoDB types."""
    if isinstance(obj, ObjectId):
        return str(obj)
    if isinstance(obj, datetime):
        return obj.isoformat()
    if isinstance(obj, bytes):
        return obj.decode('utf-8', errors='replace')
    return str(obj)


def _dumps(data):
    return json.dumps(data, default=_serialize)

router = APIRouter(tags=["stream"])


class StreamSearchRequest(BaseModel):
    type: str = "phone"
    value: str
    max_depth: int = 2


@router.post("/stream/search")
async def stream_search(req: StreamSearchRequest):
    value = req.value.strip()
    if not value:
        return {"error": "No value provided"}

    async def event_generator():
        t_start = time.time()

        # Phase 1: CREDMON (fast — <500ms)
        yield {"event": "status", "data": _dumps({"message": "Searching breach intelligence..."})}

        t0 = time.time()
        breach_results = credmon.run_pipeline(req.type, value, req.max_depth)
        credmon_time = round((time.time() - t0) * 1000)

        # Collect discovered entities
        all_emails, all_phones, all_usernames = set(), set(), set()
        for r in breach_results:
            if r.get("found"):
                all_emails.update(r.get("new_emails_found", []))
                all_phones.update(r.get("new_phones_found", []))
                for src in r.get("sources", []):
                    for rec in src.get("records", []):
                        for k, v in rec.get("fields", {}).items():
                            kl = k.lower()
                            if ("username" in kl or "user_name" in kl) and v and "@" not in v and len(v) < 50 and not v.isdigit():
                                all_usernames.add(v)

        if req.type == "phone":
            all_phones.add(value)
        else:
            all_emails.add(value)

        # Send breach results immediately
        yield {
            "event": "breach",
            "data": _dumps({
                "results": breach_results,
                "total_searched": len(breach_results),
                "total_found": sum(1 for r in breach_results if r.get("found")),
                "time_ms": credmon_time,
                "discovered": {
                    "emails": list(all_emails),
                    "phones": list(all_phones),
                    "usernames": list(all_usernames),
                },
            }),
        }

        # Phase 2: FTI (parallel)
        yield {"event": "status", "data": _dumps({"message": "Querying threat intelligence..."})}

        def run_fti():
            r = {}
            for phone in list(all_phones)[:3]:
                if not r.get("mobile_numbers"):
                    r["mobile_numbers"] = fti.search_mobile_numbers(phone)
                tg = fti.search_telegram_mentions(phone)
                if tg.get("found"):
                    r["telegram"] = tg
                    r["telegram_groups"] = fti.get_telegram_group_details(phone)
                upi = fti.search_upi_by_phone(phone)
                if upi:
                    r.setdefault("upi_ids", []).extend(upi)
            for email in list(all_emails)[:3]:
                hits = fti.search_emails(email)
                if hits:
                    r.setdefault("email_intel", []).extend(hits)
            # Watchlist
            names = set()
            for br in breach_results:
                for src in br.get("sources", []):
                    for rec in src.get("records", []):
                        for k, v in rec.get("fields", {}).items():
                            kl = k.lower()
                            if ("fullname" in kl or "full_name" in kl or k == "name") and v and len(v) > 3 and not v.isdigit():
                                names.add(v)
            for name in list(names)[:2]:
                crime = fti.screen_crimedata(name)
                if crime:
                    r.setdefault("crimedata_matches", []).extend(crime)
                wc = fti.screen_worldcheck(name)
                if wc:
                    r.setdefault("worldcheck_matches", []).extend(wc)
            return r

        def run_darkmon():
            r = {"entity_matches": {"threads": [], "posts": []}, "username_matches": []}
            # SKIP extracted_info entity search — too slow without indexes (50s+ on 9M docs)
            # Only do username-based searches (uses author_username index — instant)
            for uname in list(all_usernames)[:3]:
                uh = darkmon.search_by_username(uname)
                if uh.get("threads") or uh.get("posts") or uh.get("author_profile"):
                    r["username_matches"].append({"username": uname, **uh})
            return r

        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
            f_fti = executor.submit(run_fti)
            f_dw = executor.submit(run_darkmon)

            # Stream FTI when ready (15s max — most queries are sub-second)
            try:
                fti_result = f_fti.result(timeout=15)
                yield {"event": "threat_intel", "data": _dumps(fti_result)}
            except Exception:
                yield {"event": "threat_intel", "data": _dumps({})}

            # Stream DARKMON when ready (10s max — don't block the user)
            yield {"event": "status", "data": _dumps({"message": "Scanning dark web intelligence..."})}
            try:
                dw_result = f_dw.result(timeout=10)
                yield {"event": "darkweb", "data": _dumps(dw_result)}
            except Exception:
                yield {"event": "darkweb", "data": _dumps({"entity_matches": {"threads": [], "posts": []}, "username_matches": []})}

        total_time = round((time.time() - t_start) * 1000)
        yield {
            "event": "complete",
            "data": _dumps({"total_time_ms": total_time, "credmon_ms": credmon_time}),
        }

    return EventSourceResponse(event_generator())
