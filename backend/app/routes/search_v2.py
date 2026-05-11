"""
CREDMON v2 streaming search endpoint — SSE (Server-Sent Events).
Streams per-entity breach results as they are discovered via BFS.
"""
import concurrent.futures
import json
import logging
import re
import time
from datetime import datetime
from bson import ObjectId
from fastapi import APIRouter, Depends, Request
from sse_starlette.sse import EventSourceResponse
from pydantic import BaseModel, field_validator

from app.engines import credmon, darkmon, fti
from app.audit import audit as audit_service
from app.credits import require_credits, ENGINE_COST_KEYS

log = logging.getLogger("search_v2")


# ── Serialization helpers (same pattern as stream.py) ──────

def _serialize(obj):
    """JSON serializer that handles MongoDB types."""
    if isinstance(obj, ObjectId):
        return str(obj)
    if isinstance(obj, datetime):
        return obj.isoformat()
    if isinstance(obj, bytes):
        return obj.decode("utf-8", errors="replace")
    return str(obj)


def _dumps(data):
    return json.dumps(data, default=_serialize)


# ── Router ─────────────────────────────────────────────────

router = APIRouter(tags=["search_v2"])


class SeedItem(BaseModel):
    type: str
    value: str

    @field_validator("type")
    @classmethod
    def validate_type(cls, v: str) -> str:
        if v not in ("phone", "email", "username", "fullname"):
            raise ValueError("type must be 'phone', 'email', 'username', or 'fullname'")
        return v

    @field_validator("value")
    @classmethod
    def validate_value(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("value must be non-empty")
        return v


VALID_ENGINES = {"breach", "threat_intel", "darkweb", "financial", "ecourts"}

class SearchRequestV2(BaseModel):
    seeds: list[SeedItem]
    max_depth: int = 2
    engines: list[str] | None = None

    @field_validator("seeds")
    @classmethod
    def validate_seeds(cls, v: list) -> list:
        if not v:
            raise ValueError("at least one seed is required")
        return v

    @field_validator("engines")
    @classmethod
    def validate_engines(cls, v: list[str] | None) -> list[str] | None:
        if v is None:
            return None
        filtered = [e for e in v if e in VALID_ENGINES]
        return filtered or None


_FULLNAME_FIELD_KEYS = {"fullname", "full_name", "name", "first_name", "last_name"}


def _extract_usernames(results: list[dict]) -> list[dict]:
    """Extract unique usernames with their breach sources from CREDMON results (capped at 5)."""
    seen: dict[str, list[str]] = {}

    for result in results:
        if not result.get("found"):
            continue
        for source in result.get("sources", []):
            collection = source.get("collection", "")
            for record in source.get("records", []):
                for key, val in record.get("fields", {}).items():
                    kl = key.lower()
                    if ("username" in kl or "user_name" in kl) and val and "@" not in val and len(val) < 50 and not val.isdigit():
                        if val not in seen:
                            seen[val] = []
                        if collection and collection not in seen[val]:
                            seen[val].append(collection)

    return [{"username": u, "breach_sources": srcs} for u, srcs in list(seen.items())[:5]]


def _extract_fullnames(results: list[dict]) -> list[str]:
    """Extract unique fullnames from CREDMON entity results (capped at 10)."""
    seen: set[str] = set()

    for result in results:
        if not result.get("found"):
            continue

        # Source 1: entity_type == "fullname" → use entity_value directly
        if result.get("entity_type") == "fullname":
            val = (result.get("entity_value") or "").strip()
            if val:
                seen.add(val)

        # Source 2: scan sources[].records[].fields for name-like keys
        for source in result.get("sources", []):
            for record in source.get("records", []):
                fields = record.get("fields", {})
                for key, val in fields.items():
                    if key.lower() in _FULLNAME_FIELD_KEYS:
                        if (
                            isinstance(val, str)
                            and len(val.strip()) > 3
                            and "@" not in val
                            and not val.strip().isdigit()
                        ):
                            seen.add(val.strip())

    # Cap at 10 names
    return list(seen)[:10]


_NAME_KEYS = {"fullname", "full_name", "name", "first_name", "last_name", "display_name", "displayname"}
_USERNAME_KEYS = {"username", "user_name", "nickname", "handle", "screen_name", "loginname"}
_EMAIL_KEYS = {"email", "e-mail", "mail", "email_address"}
_PHONE_KEYS = {"phone", "mobile", "cell", "telephone", "contact_number"}
_IP_KEYS = {"ip", "ip_address", "last_ip", "signup_ip", "login_ip"}
_DOB_KEYS = {"dob", "date_of_birth", "birth_date", "birthday"}
_LOCATION_KEYS = {"city", "state", "country", "region", "district", "address", "pincode", "zip"}
_ACCOUNT_KEYS = {"facebook", "linkedin", "twitter", "instagram", "telegram", "discord", "github", "reddit"}
_SKIP_VALUES = {"", "null", "None", "none", "undefined", "N/A", "n/a", "-", "0", "false"}


def _extract_profile_for_summary(results: list[dict]) -> dict:
    """Build a compact profile dict for the AI summary prompt."""
    names: set[str] = set()
    emails: set[str] = set()
    phones: set[str] = set()
    usernames: set[str] = set()
    ips: set[str] = set()
    dobs: set[str] = set()
    locations: set[str] = set()
    accounts: set[str] = set()
    source_count = 0

    for result in results:
        if not result.get("found"):
            continue
        if result.get("entity_type") == "email" and result.get("entity_value"):
            emails.add(result["entity_value"])
        if result.get("entity_type") == "phone" and result.get("entity_value"):
            phones.add(result["entity_value"])
        source_count += len(result.get("sources", []))

        for source in result.get("sources", []):
            for record in source.get("records", []):
                for key, val in record.get("fields", {}).items():
                    if not val or not isinstance(val, str) or val.strip() in _SKIP_VALUES:
                        continue
                    v = val.strip()
                    kl = key.lower()
                    if kl in _NAME_KEYS and len(v) > 3 and "@" not in v and not v.isdigit():
                        names.add(v)
                    elif kl in _USERNAME_KEYS and len(v) >= 3 and "@" not in v and not v.isdigit():
                        usernames.add(v)
                    elif kl in _EMAIL_KEYS and "@" in v:
                        emails.add(v)
                    elif any(pk in kl for pk in _PHONE_KEYS) and re.search(r"\d{7,}", v.replace(" ", "")):
                        phones.add(v)
                    elif kl in _IP_KEYS and re.match(r"\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}", v):
                        ips.add(v)
                    elif kl in _DOB_KEYS:
                        dobs.add(v)
                    elif kl in _LOCATION_KEYS and len(v) > 2:
                        locations.add(v)
                    elif kl in _ACCOUNT_KEYS:
                        accounts.add(v)

    return {
        "names": list(names)[:15],
        "emails": list(emails)[:15],
        "phones": list(phones)[:10],
        "usernames": list(usernames)[:10],
        "ips": list(ips)[:10],
        "dobs": list(dobs)[:3],
        "locations": list(locations)[:10],
        "accounts": list(accounts)[:10],
        "source_count": source_count,
        "total_entities": len(results),
        "total_found": sum(1 for r in results if r.get("found")),
    }


def _generate_programmatic_summary(
    profile: dict,
    fti_summary: dict,
    darkmon_summary: dict,
    financial_summary: dict,
) -> str:
    """Build a deterministic prose intelligence summary from profile data."""
    parts: list[str] = []

    # Lead with identified subject
    names = profile.get("names", [])
    locations = profile.get("locations", [])
    if names:
        lead = f"Subject identified as {names[0]}"
        if locations:
            lead += f", located in {locations[0]}"
        lead += "."
        parts.append(lead)

    # Digital footprint sentence
    n_emails = len(profile.get("emails", []))
    n_phones = len(profile.get("phones", []))
    n_usernames = len(profile.get("usernames", []))
    n_ips = len(profile.get("ips", []))
    source_count = profile.get("source_count", 0)
    total_found = profile.get("total_found", 0)

    footprint_parts = []
    if n_emails:
        footprint_parts.append(f"{n_emails} email{'s' if n_emails != 1 else ''}")
    if n_phones:
        footprint_parts.append(f"{n_phones} phone number{'s' if n_phones != 1 else ''}")
    if n_usernames:
        footprint_parts.append(f"{n_usernames} username{'s' if n_usernames != 1 else ''}")
    if n_ips:
        footprint_parts.append(f"{n_ips} IP address{'es' if n_ips != 1 else ''}")

    if footprint_parts:
        fp_str = ", ".join(footprint_parts)
        sentence = f"Digital footprint spans {fp_str}"
        if source_count:
            sentence += f" across {source_count} breach source{'s' if source_count != 1 else ''}"
        sentence += "."
        parts.append(sentence)

    # Watchlist / crime hits
    cd_matches = fti_summary.get("crimedata_matches", 0)
    wc_matches = fti_summary.get("worldcheck_matches", 0)
    if cd_matches or wc_matches:
        hits = []
        if cd_matches:
            hits.append(f"{cd_matches} crime database hit{'s' if cd_matches != 1 else ''}")
        if wc_matches:
            hits.append(f"{wc_matches} watchlist match{'es' if wc_matches != 1 else ''}")
        parts.append(f"Screening flagged {' and '.join(hits)}.")

    # Dark web activity
    dm_matches = darkmon_summary.get("total_matches", 0)
    if dm_matches:
        parts.append(f"Dark web forum activity detected for {dm_matches} username{'s' if dm_matches != 1 else ''}.")

    # Financial fraud
    upi_hits = financial_summary.get("total_upi_hits", 0)
    if upi_hits:
        parts.append(f"Financial screening linked {upi_hits} phone number{'s' if upi_hits != 1 else ''} to fraud-flagged UPI IDs.")

    if not parts:
        if total_found:
            return f"Search returned data for {total_found} entities but no structured profile could be assembled."
        return ""

    return " ".join(parts)


@router.post("/search")
async def search_v2(req: SearchRequestV2, request: Request, _credits: dict = Depends(require_credits("combined_search", use_engine_cost=True))):
    """Stream CREDMON breach search results via SSE, one event per entity."""

    engines = set(req.engines) if req.engines else {"breach", "threat_intel", "darkweb", "financial"}
    seeds_dicts = [{"type": s.type, "value": s.value} for s in req.seeds]

    async def event_generator():
        t_start = time.time()

        # 1. search:start
        yield {
            "event": "search:start",
            "data": _dumps({
                "seeds": seeds_dicts,
                "max_depth": req.max_depth,
            }),
        }

        if _credits.get("cached"):
            yield {
                "event": "credits:update",
                "data": _dumps({
                    "deducted": 0,
                    "remaining": _credits.get("remaining"),
                    "cached": True,
                }),
            }
        elif _credits.get("deducted"):
            yield {
                "event": "credits:update",
                "data": _dumps({
                    "deducted": _credits["deducted"],
                    "remaining": _credits["remaining"],
                    "warning": _credits.get("warning"),
                }),
            }

        # 2. Stream entity:result events from the pipeline generator
        total_entities_searched = 0
        total_found = 0
        max_depth_reached = 0
        all_results = []

        for result in credmon.run_pipeline_streaming(
            seeds=seeds_dicts,
            max_depth=req.max_depth,
        ):
            total_entities_searched += 1
            if result.get("found"):
                total_found += 1
            entity_depth = result.get("depth", 0)
            if entity_depth > max_depth_reached:
                max_depth_reached = entity_depth

            all_results.append(result)

            yield {
                "event": "entity:result",
                "data": _dumps(result),
            }

        # 3. FTI + Financial + DARKMON — run in parallel with 60s wall timeout
        t_parallel_start = time.time()

        def _run_fti_and_financial():
            """FTI screening + financial screening (runs in thread)."""
            events = []
            t_fti = time.time()
            names_screened = 0
            cd_matches = 0
            wc_matches = 0

            if "threat_intel" in engines:
                fullnames = _extract_fullnames(all_results)
                names_screened = len(fullnames)
                for name in fullnames:
                    t_q = time.time()
                    cd_results = fti.screen_crimedata(name)
                    cd_time = round((time.time() - t_q) * 1000)
                    cd_found = len(cd_results) > 0
                    if cd_found:
                        cd_matches += 1
                    events.append({"event": "fti:result", "data": _dumps({
                        "query_type": "crimedata", "entity_value": name,
                        "found": cd_found, "results": cd_results, "search_time_ms": cd_time,
                    })})

                    t_q = time.time()
                    wc_results = fti.screen_worldcheck(name)
                    wc_time = round((time.time() - t_q) * 1000)
                    wc_found = len(wc_results) > 0
                    if wc_found:
                        wc_matches += 1
                    events.append({"event": "fti:result", "data": _dumps({
                        "query_type": "worldcheck", "entity_value": name,
                        "found": wc_found, "results": wc_results, "search_time_ms": wc_time,
                    })})

            fti_ms = round((time.time() - t_fti) * 1000)
            events.append({"event": "fti:complete", "data": _dumps({
                "total_names_screened": names_screened,
                "crimedata_matches": cd_matches, "worldcheck_matches": wc_matches,
                "total_time_ms": fti_ms,
            })})

            t_fin = time.time()
            phones_screened = 0
            upi_hits = 0

            if "financial" in engines:
                phones: set[str] = set()
                for result in all_results:
                    if result.get("entity_type") == "phone":
                        phones.add(result["entity_value"])
                    for p in result.get("new_phones_found", []):
                        phones.add(p)
                for seed in seeds_dicts:
                    if seed["type"] == "phone":
                        phones.add(seed["value"])

                for phone in list(phones)[:10]:
                    phones_screened += 1
                    t_q = time.time()
                    upi_results = fti.search_upi_by_phone(phone)
                    q_time = round((time.time() - t_q) * 1000)
                    upi_found = len(upi_results) > 0
                    if upi_found:
                        upi_hits += 1
                    events.append({"event": "financial:result", "data": _dumps({
                        "phone": phone, "found": upi_found,
                        "upi_records": upi_results, "search_time_ms": q_time,
                    })})

            fin_ms = round((time.time() - t_fin) * 1000)
            events.append({"event": "financial:complete", "data": _dumps({
                "total_phones_screened": phones_screened,
                "total_upi_hits": upi_hits, "total_time_ms": fin_ms,
            })})

            return {
                "events": events,
                "names_screened": names_screened,
                "cd_matches": cd_matches, "wc_matches": wc_matches,
                "fti_ms": fti_ms,
                "phones_screened": phones_screened, "upi_hits": upi_hits,
                "fin_ms": fin_ms,
            }

        def _run_darkmon():
            """DARKMON username search (runs in thread)."""
            events = []
            t_dm = time.time()
            unames_searched = 0
            dm_matches = 0

            if "darkweb" in engines:
                usernames = _extract_usernames(all_results)
                for entry in usernames:
                    uname = entry["username"]
                    breach_sources = entry["breach_sources"]
                    unames_searched += 1
                    t_q = time.time()
                    try:
                        uh = darkmon.search_by_username(uname)
                    except Exception:
                        log.warning("darkmon search_by_username failed: uname=%s", uname, exc_info=True)
                        uh = {"threads": [], "posts": [], "author_profile": None}
                    q_time = round((time.time() - t_q) * 1000)

                    has_data = bool(uh.get("threads") or uh.get("posts") or uh.get("author_profile"))
                    if has_data:
                        dm_matches += 1
                    events.append({"event": "darkmon:result", "data": _dumps({
                        "username": uname, "breach_sources": breach_sources,
                        "threads": uh.get("threads", []), "posts": uh.get("posts", []),
                        "author_profile": uh.get("author_profile"),
                        "found": has_data, "search_time_ms": q_time,
                    })})

            dm_ms = round((time.time() - t_dm) * 1000)
            events.append({"event": "darkmon:complete", "data": _dumps({
                "total_usernames_searched": unames_searched,
                "total_matches": dm_matches, "total_time_ms": dm_ms,
            })})

            return {
                "events": events,
                "unames_searched": unames_searched,
                "dm_matches": dm_matches, "dm_ms": dm_ms,
            }

        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
            f_fti = executor.submit(_run_fti_and_financial)
            f_dm = executor.submit(_run_darkmon)

            try:
                fti_result = f_fti.result(timeout=60)
            except Exception:
                log.error("FTI/financial thread failed or timed out", exc_info=True)
                fti_result = {
                    "events": [
                        {"event": "fti:complete", "data": _dumps({"total_names_screened": 0, "crimedata_matches": 0, "worldcheck_matches": 0, "total_time_ms": 0})},
                        {"event": "financial:complete", "data": _dumps({"total_phones_screened": 0, "total_upi_hits": 0, "total_time_ms": 0})},
                    ],
                    "names_screened": 0, "cd_matches": 0, "wc_matches": 0, "fti_ms": 0,
                    "phones_screened": 0, "upi_hits": 0, "fin_ms": 0,
                }

            try:
                dm_result = f_dm.result(timeout=60)
            except Exception:
                log.error("DARKMON thread failed or timed out", exc_info=True)
                dm_result = {
                    "events": [{"event": "darkmon:complete", "data": _dumps({"total_usernames_searched": 0, "total_matches": 0, "total_time_ms": 0})}],
                    "unames_searched": 0, "dm_matches": 0, "dm_ms": 0,
                }

        for evt in fti_result["events"]:
            yield evt
        for evt in dm_result["events"]:
            yield evt

        total_names_screened = fti_result["names_screened"]
        crimedata_matches = fti_result["cd_matches"]
        worldcheck_matches = fti_result["wc_matches"]
        fti_total_time_ms = fti_result["fti_ms"]
        total_phones_screened = fti_result["phones_screened"]
        total_upi_hits = fti_result["upi_hits"]
        fin_total_time_ms = fti_result["fin_ms"]
        total_usernames_searched = dm_result["unames_searched"]
        total_darkmon_matches = dm_result["dm_matches"]
        darkmon_total_time_ms = dm_result["dm_ms"]

        # 8. AI summary
        profile = _extract_profile_for_summary(all_results)
        fti_summary = {
            "crimedata_matches": crimedata_matches,
            "worldcheck_matches": worldcheck_matches,
            "total_names_screened": total_names_screened,
        }
        darkmon_summary = {
            "total_matches": total_darkmon_matches,
            "total_usernames_searched": total_usernames_searched,
        }
        financial_summary = {
            "total_upi_hits": total_upi_hits,
            "total_phones_screened": total_phones_screened,
        }

        summary_text = _generate_programmatic_summary(profile, fti_summary, darkmon_summary, financial_summary)
        if summary_text:
            yield {
                "event": "summary",
                "data": _dumps({"text": summary_text}),
            }

        # 9. search:complete
        total_time_ms = round((time.time() - t_start) * 1000)

        reason = "max_depth" if max_depth_reached >= req.max_depth else "exhausted"

        yield {
            "event": "search:complete",
            "data": _dumps({
                "total_time_ms": total_time_ms,
                "credmon_time_ms": total_time_ms - fti_total_time_ms - fin_total_time_ms - darkmon_total_time_ms,
                "fti_time_ms": fti_total_time_ms,
                "financial_time_ms": fin_total_time_ms,
                "darkmon_time_ms": darkmon_total_time_ms,
                "total_entities_searched": total_entities_searched,
                "total_found": total_found,
                "max_depth_reached": max_depth_reached,
                "reason": reason,
            }),
        }

        user = getattr(request.state, "user", None) or {}
        audit_service.log_search(
            user_id=user.get("id"),
            username=user.get("username"),
            session_id=user.get("jti"),
            client_ip=getattr(request.state, "client_ip", None),
            user_agent=getattr(request.state, "user_agent", None),
            request_id=getattr(request.state, "request_id", None),
            search_type=seeds_dicts[0]["type"],
            search_value=seeds_dicts[0]["value"],
            seeds=seeds_dicts,
            max_depth=req.max_depth,
            endpoint="/api/v2/search",
            response_time_ms=total_time_ms,
            result_summary={
                "credmon_entities_searched": total_entities_searched,
                "credmon_entities_found": total_found,
                "fti_names_screened": total_names_screened,
                "fti_crimedata_matches": crimedata_matches,
                "fti_worldcheck_matches": worldcheck_matches,
                "darkmon_usernames_searched": total_usernames_searched,
                "darkmon_matches": total_darkmon_matches,
                "credmon_time_ms": total_time_ms - fti_total_time_ms - fin_total_time_ms - darkmon_total_time_ms,
                "fti_time_ms": fti_total_time_ms,
                "darkmon_time_ms": darkmon_total_time_ms,
                "total_time_ms": total_time_ms,
            },
        )

    return EventSourceResponse(event_generator())
