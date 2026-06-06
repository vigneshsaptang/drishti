"""
CREDMON v2 streaming search endpoint — SSE (Server-Sent Events).
Streams per-entity breach results as they are discovered via BFS.
"""
import asyncio
import concurrent.futures
import json
import logging
import re
import time
from datetime import datetime
from bson import ObjectId
from fastapi import APIRouter, Depends, Request
from sse_starlette.sse import EventSourceResponse
from pydantic import BaseModel, field_validator, model_validator

from app.engines import credmon, darkmon, fti, risk_ingestor, risk_scorer, geo
from app.engines.credmon import (
    _get_leak_schema,
    _flatten_record,
    search_master as credmon_search_master,
    fetch_record_by_id as credmon_fetch_record,
)
from app.engines.identifier_categorizer import extract_profile as categorizer_extract_profile
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


class SubjectName(BaseModel):
    first:    str | None = None
    middle:   str | None = None
    last:     str | None = None
    initials: str | None = None
    dob:      str | None = None

    @model_validator(mode="after")
    def at_least_one_part(self) -> "SubjectName":
        # If the whole object is empty, treat as absent at the caller layer.
        return self


class SearchRequestV2(BaseModel):
    seeds: list[SeedItem]
    max_depth: int = 2
    engines: list[str] | None = None
    subject: SubjectName | None = None

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


def _explicit_canonical_name(subject: SubjectName | None) -> str | None:
    """Build a display name from structured subject input.

    Returns None when subject is absent or all of first/last/initials empty.
    """
    if subject is None:
        return None
    parts = [p for p in (subject.first, subject.middle, subject.last) if p]
    if parts:
        extra = subject.initials.strip() if subject.initials else ""
        return (" ".join(parts) + (f" {extra}" if extra and not subject.middle else "")).strip()
    if subject.initials:
        letters = [ch for ch in subject.initials if ch.isalpha()]
        if letters:
            return ".".join(letters).upper() + "."
    return None


def _explicit_canonical_tokens(subject: SubjectName | None) -> list[str]:
    """Tokens for the FTI canonical filter when structured subject is provided.

    Multi-char tokens (full first/middle/last) appear as-is, lowercased.
    Initials contribute single-letter tokens. Empty list when nothing usable.
    """
    if subject is None:
        return []
    tokens: list[str] = []
    for k in ("last", "first", "middle"):
        v = getattr(subject, k, None)
        if v:
            vv = v.strip().lower()
            if len(vv) >= 2:
                tokens.append(vv)
    if subject.initials:
        for ch in subject.initials.replace(" ", "").replace(".", ""):
            if ch.isalpha():
                tokens.append(ch.lower())
    # dedupe preserving order
    seen: set[str] = set()
    out: list[str] = []
    for t in tokens:
        if t not in seen:
            seen.add(t)
            out.append(t)
    return out


def _build_profile_payload(all_results: list[dict], subject: SubjectName | None = None) -> dict:
    """Compute the profile + canonical_location pair from current results.

    Used both for the early ``profile:ready`` SSE event (emitted right after
    CREDMON so the report's Subject section appears before screening engines
    run) and for the final ``summary`` event.
    """
    profile = categorizer_extract_profile(all_results)
    profile["source_count"] = sum(len(r.get("sources", [])) for r in all_results if r.get("found"))
    profile["total_entities"] = len(all_results)
    profile["total_found"] = sum(1 for r in all_results if r.get("found"))
    if "dobs" not in profile:
        profile["dobs"] = profile.get("dob", [])
    canonical_location = geo.resolve_canonical_location(all_results)
    explicit_name = _explicit_canonical_name(subject)
    if explicit_name:
        canonical_name = explicit_name
        canonical_source = "investigator"
    else:
        canonical_name = profile.get("names", [None])[0] if profile.get("names") else None
        canonical_source = "inferred" if canonical_name else None
    return {
        "profile": profile,
        "canonical_location": canonical_location,
        "canonical_name": canonical_name,
        "canonical_source": canonical_source,
    }


def _format_canonical_location_str(loc: dict | None) -> str | None:
    """Render a canonical_location dict as 'City, State' / 'District, State' / 'State'.

    Prefers city > district > locality for the place portion. Returns None if the
    location couldn't be resolved.
    """
    if not loc:
        return None
    state = loc.get("state")
    if not state:
        return None
    place = loc.get("city") or loc.get("district") or loc.get("locality")
    if place and place.lower() != state.lower():
        return f"{place}, {state}"
    return state


def _generate_programmatic_summary(
    profile: dict,
    fti_summary: dict,
    darkmon_summary: dict,
    financial_summary: dict,
    canonical_location: dict | None = None,
) -> str:
    """Build a deterministic prose intelligence summary from profile data."""
    parts: list[str] = []

    # Lead with identified subject
    names = profile.get("names", [])
    locations = profile.get("locations", [])
    if names:
        lead = f"Subject identified as {names[0]}"
        # Prefer the canonical resolved location (City, State) over the first
        # raw address from profile.locations — the latter is verbose street
        # addressing, not "where is the subject."
        canon_loc_str = _format_canonical_location_str(canonical_location)
        if canon_loc_str:
            lead += f", located in {canon_loc_str}"
        elif locations:
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


def _run_fti_and_financial(engines: set, all_results: list[dict], seeds_dicts: list[dict], explicit_name: str | None = None) -> dict:
    """FTI screening + financial screening (runs in thread).

    When ``explicit_name`` is provided, only that single name is screened
    against the watchlist / crime database — bypassing the breach-record
    name extraction entirely. This eliminates the "namesake" class of hits,
    because we never look up anyone other than the investigator-named
    subject.
    """
    events = []
    parsed_fti = []
    t_fti = time.time()
    names_screened = 0
    cd_matches = 0
    wc_matches = 0

    if "threat_intel" in engines:
        if explicit_name:
            fullnames = [explicit_name]
        else:
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
            parsed_fti.append({"query_type": "crimedata", "entity_value": name, "found": cd_found, "results": cd_results})

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
            parsed_fti.append({"query_type": "worldcheck", "entity_value": name, "found": wc_found, "results": wc_results})

    fti_ms = round((time.time() - t_fti) * 1000)
    events.append({"event": "fti:complete", "data": _dumps({
        "total_names_screened": names_screened,
        "crimedata_matches": cd_matches, "worldcheck_matches": wc_matches,
        "total_time_ms": fti_ms,
    })})

    t_fin = time.time()
    phones_screened = 0
    upi_hits = 0
    parsed_financial = []
    parsed_telegram = []
    parsed_phone_intel = []

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
                parsed_financial.append({"type": "upi", "phone": phone, "records": upi_results})
            events.append({"event": "financial:result", "data": _dumps({
                "phone": phone, "found": upi_found,
                "upi_records": upi_results, "search_time_ms": q_time,
            })})

        for phone in list(phones)[:10]:
            try:
                bank_results = fti.search_bank_accounts(phone)
                if bank_results:
                    parsed_financial.append({"type": "bank", "phone": phone, "records": bank_results})
            except Exception:
                pass

        for phone in list(phones)[:10]:
            try:
                tg_result = fti.search_telegram_mentions(phone)
                if tg_result and tg_result.get("total_mentions", 0) > 0:
                    parsed_telegram.append({
                        "phone": phone,
                        "found": True,
                        "total_mentions": tg_result.get("total_mentions", 0),
                        "unique_groups": tg_result.get("unique_groups", 0),
                    })
            except Exception:
                pass

        for phone in list(phones)[:10]:
            try:
                mobile_results = fti.search_mobile_numbers(phone)
                if mobile_results:
                    parsed_phone_intel.append({"phone": phone, "found": True, "records": mobile_results})
            except Exception:
                pass

    fin_ms = round((time.time() - t_fin) * 1000)
    events.append({"event": "financial:complete", "data": _dumps({
        "total_phones_screened": phones_screened,
        "total_upi_hits": upi_hits, "total_time_ms": fin_ms,
    })})

    return {
        "events": events,
        "parsed_fti": parsed_fti,
        "names_screened": names_screened,
        "cd_matches": cd_matches, "wc_matches": wc_matches,
        "fti_ms": fti_ms,
        "phones_screened": phones_screened, "upi_hits": upi_hits,
        "fin_ms": fin_ms,
        "parsed_financial": parsed_financial,
        "parsed_telegram": parsed_telegram,
        "parsed_phone_intel": parsed_phone_intel,
    }


def _run_darkmon(engines: set, all_results: list[dict]) -> dict:
    """DARKMON username search (runs in thread)."""
    events = []
    parsed_darkmon = []
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
            parsed_darkmon.append({"username": uname, "found": has_data, "threads": uh.get("threads", []), "posts": uh.get("posts", []), "author_profile": uh.get("author_profile")})

    dm_ms = round((time.time() - t_dm) * 1000)
    events.append({"event": "darkmon:complete", "data": _dumps({
        "total_usernames_searched": unames_searched,
        "total_matches": dm_matches, "total_time_ms": dm_ms,
    })})

    return {
        "events": events,
        "parsed_darkmon": parsed_darkmon,
        "unames_searched": unames_searched,
        "dm_matches": dm_matches, "dm_ms": dm_ms,
    }


def _run_credmon_shallow(seed_type: str, seed_value: str) -> list[dict]:
    """Shallow CREDMON lookup — fetch breach records for a single entity, no BFS."""
    t0 = time.time()
    hit = credmon_search_master(seed_type, seed_value)
    search_time_ms = round((time.time() - t0) * 1000)

    if not hit:
        return [{
            "depth": 0,
            "entity_type": seed_type,
            "entity_value": seed_value,
            "found": False,
            "search_time_ms": search_time_ms,
        }]

    source_results = []
    for src in hit["sources"]:
        col_name = src["collection"]
        record_ids = src.get("id", [])
        schema_info = _get_leak_schema(col_name)

        records = []
        for rid in record_ids[:3]:
            rec = credmon_fetch_record(col_name, rid)
            if rec:
                flat = _flatten_record(rec)
                records.append({
                    "record_id": str(rid),
                    "fields": flat,
                })

        if records:
            leak_info = schema_info or {}
            source_results.append({
                "collection": col_name,
                "leak_name": leak_info.get("leak_name", col_name),
                "breach_date": str(leak_info.get("breach_date", "")),
                "records_count": leak_info.get("records_count"),
                "records": records,
            })

    return [{
        "depth": 0,
        "entity_type": seed_type,
        "entity_value": seed_value,
        "found": True,
        "search_time_ms": search_time_ms,
        "sources": source_results,
        "new_emails_found": [],
        "new_phones_found": [],
    }]


def _run_darkmon_direct(username: str) -> dict:
    """DARKMON search for a single known username (Tier 2a)."""
    events = []
    parsed_darkmon = []
    t_dm = time.time()
    dm_matches = 0

    try:
        uh = darkmon.search_by_username(username)
    except Exception:
        log.warning("darkmon search_by_username failed: uname=%s", username, exc_info=True)
        uh = {"threads": [], "posts": [], "author_profile": None}

    q_time = round((time.time() - t_dm) * 1000)
    has_data = bool(uh.get("threads") or uh.get("posts") or uh.get("author_profile"))
    if has_data:
        dm_matches = 1

    events.append({"event": "darkmon:result", "data": _dumps({
        "username": username, "breach_sources": [],
        "threads": uh.get("threads", []), "posts": uh.get("posts", []),
        "author_profile": uh.get("author_profile"),
        "found": has_data, "search_time_ms": q_time,
    })})
    parsed_darkmon.append({"username": username, "found": has_data, "threads": uh.get("threads", []), "posts": uh.get("posts", []), "author_profile": uh.get("author_profile")})

    events.append({"event": "darkmon:complete", "data": _dumps({
        "total_usernames_searched": 1,
        "total_matches": dm_matches, "total_time_ms": q_time,
    })})

    return {"events": events, "parsed_darkmon": parsed_darkmon, "unames_searched": 1, "dm_matches": dm_matches, "dm_ms": q_time}


def _run_fti_direct(fullname: str) -> dict:
    """FTI screening for a single known fullname (Tier 2b)."""
    events = []
    parsed_fti = []
    t_fti = time.time()
    cd_matches = 0
    wc_matches = 0

    t_q = time.time()
    cd_results = fti.screen_crimedata(fullname)
    cd_time = round((time.time() - t_q) * 1000)
    cd_found = len(cd_results) > 0
    if cd_found:
        cd_matches = 1
    events.append({"event": "fti:result", "data": _dumps({
        "query_type": "crimedata", "entity_value": fullname,
        "found": cd_found, "results": cd_results, "search_time_ms": cd_time,
    })})
    parsed_fti.append({"query_type": "crimedata", "entity_value": fullname, "found": cd_found, "results": cd_results})

    t_q = time.time()
    wc_results = fti.screen_worldcheck(fullname)
    wc_time = round((time.time() - t_q) * 1000)
    wc_found = len(wc_results) > 0
    if wc_found:
        wc_matches = 1
    events.append({"event": "fti:result", "data": _dumps({
        "query_type": "worldcheck", "entity_value": fullname,
        "found": wc_found, "results": wc_results, "search_time_ms": wc_time,
    })})
    parsed_fti.append({"query_type": "worldcheck", "entity_value": fullname, "found": wc_found, "results": wc_results})

    fti_ms = round((time.time() - t_fti) * 1000)
    events.append({"event": "fti:complete", "data": _dumps({
        "total_names_screened": 1,
        "crimedata_matches": cd_matches, "worldcheck_matches": wc_matches,
        "total_time_ms": fti_ms,
    })})

    return {
        "events": events,
        "parsed_fti": parsed_fti,
        "names_screened": 1,
        "cd_matches": cd_matches, "wc_matches": wc_matches,
        "fti_ms": fti_ms,
    }


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

        # 2. Route by seed type
        total_entities_searched = 0
        total_found = 0
        max_depth_reached = 0
        all_results = []
        total_names_screened = 0
        crimedata_matches = 0
        worldcheck_matches = 0
        fti_total_time_ms = 0
        total_phones_screened = 0
        total_upi_hits = 0
        fin_total_time_ms = 0
        total_usernames_searched = 0
        total_darkmon_matches = 0
        darkmon_total_time_ms = 0
        collected_fti_results = []
        collected_darkmon_results = []
        collected_financial_results = []
        collected_telegram_results = []
        collected_phone_intel_results = []
        collected_ecourts_results = []
        collected_mca_results = []

        seed_type = seeds_dicts[0]["type"]

        if seed_type in ("phone", "email"):
            # === TIER 1: Full BFS pipeline (unchanged) ===

            def _run_bfs():
                results = []
                for result in credmon.run_pipeline_streaming(
                    seeds=seeds_dicts,
                    max_depth=req.max_depth,
                ):
                    results.append(result)
                return results

            bfs_results = await asyncio.to_thread(_run_bfs)

            for result in bfs_results:
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

            # Emit subject profile + canonical location early — before the
            # screening engines run — so the report surfaces the subject
            # identity as soon as breach data is in, instead of waiting on
            # FTI/darkmon/financial.
            yield {"event": "profile:ready", "data": _dumps(_build_profile_payload(all_results, req.subject))}

            def _run_parallel():
                with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
                    f_fti = executor.submit(_run_fti_and_financial, engines, all_results, seeds_dicts, _explicit_canonical_name(req.subject))
                    f_dm = executor.submit(_run_darkmon, engines, all_results)

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

                    return fti_result, dm_result

            fti_result, dm_result = await asyncio.to_thread(_run_parallel)

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
            collected_fti_results = fti_result.get("parsed_fti", [])
            collected_darkmon_results = dm_result.get("parsed_darkmon", [])
            collected_financial_results = fti_result.get("parsed_financial", [])
            collected_telegram_results = fti_result.get("parsed_telegram", [])
            collected_phone_intel_results = fti_result.get("parsed_phone_intel", [])

        elif seed_type == "username":
            # === TIER 2a: Shallow CREDMON + DARKMON ===

            bfs_results = await asyncio.to_thread(_run_credmon_shallow, "username", seeds_dicts[0]["value"])

            for result in bfs_results:
                all_results.append(result)
                if result.get("found"):
                    total_found += 1
                total_entities_searched += 1
                yield {"event": "entity:result", "data": _dumps(result)}

            # Early profile emit — see phone/email tier above.
            yield {"event": "profile:ready", "data": _dumps(_build_profile_payload(all_results, req.subject))}

            if "darkweb" in engines:
                dm_result = await asyncio.to_thread(_run_darkmon_direct, seeds_dicts[0]["value"])
                for evt in dm_result["events"]:
                    yield evt
                total_usernames_searched = dm_result["unames_searched"]
                total_darkmon_matches = dm_result["dm_matches"]
                darkmon_total_time_ms = dm_result["dm_ms"]
                collected_darkmon_results = dm_result.get("parsed_darkmon", [])
            else:
                yield {"event": "darkmon:complete", "data": _dumps({"total_usernames_searched": 0, "total_matches": 0, "total_time_ms": 0})}

            yield {"event": "fti:complete", "data": _dumps({"total_names_screened": 0, "crimedata_matches": 0, "worldcheck_matches": 0, "total_time_ms": 0, "skipped": True, "reason": "username_search"})}
            yield {"event": "financial:complete", "data": _dumps({"total_phones_screened": 0, "total_upi_hits": 0, "total_time_ms": 0, "skipped": True, "reason": "username_search"})}

        elif seed_type == "fullname":
            # === TIER 2b: FTI screening only ===

            yield {"event": "entity:result", "data": _dumps({"depth": 0, "entity_type": "fullname", "entity_value": seeds_dicts[0]["value"], "found": False, "search_time_ms": 0, "skipped": True, "reason": "fullname_screening_only"})}

            if "threat_intel" in engines:
                fti_result = await asyncio.to_thread(_run_fti_direct, seeds_dicts[0]["value"])
                for evt in fti_result["events"]:
                    yield evt
                total_names_screened = fti_result["names_screened"]
                crimedata_matches = fti_result["cd_matches"]
                worldcheck_matches = fti_result["wc_matches"]
                fti_total_time_ms = fti_result["fti_ms"]
                collected_fti_results = fti_result.get("parsed_fti", [])
            else:
                yield {"event": "fti:complete", "data": _dumps({"total_names_screened": 0, "crimedata_matches": 0, "worldcheck_matches": 0, "total_time_ms": 0})}

            yield {"event": "darkmon:complete", "data": _dumps({"total_usernames_searched": 0, "total_matches": 0, "total_time_ms": 0, "skipped": True, "reason": "fullname_search"})}
            yield {"event": "financial:complete", "data": _dumps({"total_phones_screened": 0, "total_upi_hits": 0, "total_time_ms": 0, "skipped": True, "reason": "fullname_search"})}

        # 8. Programmatic summary — reuse the same helper that built the
        # early profile:ready event so frontend sees a consistent payload.
        _profile_payload = _build_profile_payload(all_results, req.subject)
        profile = _profile_payload["profile"]
        canonical_location = _profile_payload["canonical_location"]

        # Apply the canonical-name token filter to FTI hits before counting, so
        # the programmatic summary agrees with FtiScreening + deriveAlerts on
        # what a "watchlist match" is (namesake screening hits are excluded).
        explicit_name = _explicit_canonical_name(req.subject)
        if explicit_name:
            canonical_name = explicit_name
            canonical_tokens_for_summary = _explicit_canonical_tokens(req.subject)
        else:
            canonical_name = profile.get("names", [None])[0] if profile.get("names") else None
            canonical_tokens_for_summary = [
                t for t in (canonical_name or "").lower().split() if len(t) >= 2
            ]

        if req.subject and _explicit_canonical_name(req.subject):
            multi    = [t for t in canonical_tokens_for_summary if len(t) >= 2]
            initials = [t for t in canonical_tokens_for_summary if len(t) == 1]
            _initial_patterns = [re.compile(rf"\b{re.escape(c)}", re.IGNORECASE) for c in initials]

            def _entry_matches_canonical(entry: dict) -> bool:
                ev = (entry.get("entity_value") or "").lower()
                if not multi and not initials:
                    return True
                if multi and not all(t in ev for t in multi):
                    return False
                if initials and not any(p.search(ev) for p in _initial_patterns):
                    return False
                return True
        else:
            def _entry_matches_canonical(entry: dict) -> bool:
                if not canonical_tokens_for_summary:
                    return True
                ev = (entry.get("entity_value") or "").lower()
                return all(t in ev for t in canonical_tokens_for_summary)

        filtered_cd = sum(
            1 for r in collected_fti_results
            if r.get("query_type") == "crimedata" and r.get("found") and _entry_matches_canonical(r)
        )
        filtered_wc = sum(
            1 for r in collected_fti_results
            if r.get("query_type") == "worldcheck" and r.get("found") and _entry_matches_canonical(r)
        )

        fti_summary = {
            "crimedata_matches": filtered_cd,
            "worldcheck_matches": filtered_wc,
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

        summary_text = _generate_programmatic_summary(
            profile, fti_summary, darkmon_summary, financial_summary,
            canonical_location=canonical_location,
        )
        # Always emit the summary event so profile + canonical_location reach
        # the frontend even when no prose summary is generated.
        yield {
            "event": "summary",
            "data": _dumps({
                "text": summary_text or None,
                "profile": profile,
                "canonical_location": canonical_location,
                "canonical_name": canonical_name,
            }),
        }

        # 8.5 Risk scoring
        risk_factors = risk_ingestor.derive_factors(
            search_results=all_results,
            fti_results=collected_fti_results,
            darkmon_results=collected_darkmon_results,
            canonical_name=canonical_name,
            financial_results=collected_financial_results or None,
            telegram_results=collected_telegram_results or None,
            phone_intel_results=collected_phone_intel_results or None,
            ecourts_results=collected_ecourts_results or None,
            mca_results=collected_mca_results or None,
        )
        risk_output = risk_scorer.score(risk_factors) if risk_factors else None
        if risk_output:
            yield {
                "event": "risk:score",
                "data": _dumps(risk_output),
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
                "search_tier": "tier1" if seed_type in ("phone", "email") else "tier2",
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
