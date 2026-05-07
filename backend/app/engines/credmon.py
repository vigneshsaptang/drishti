"""
Breach Intelligence Engine — CREDMON Pipeline

Pipeline:
  1. Search Master_extracts.contactNumbers or .emails (indexed)
  2. Get sources array with collection names + ObjectIDs
  3. Fetch Leaks_info for schema mapping (entity_map)
  4. Fetch actual records via ObjectID from Leaks_referral
  5. Extract emails/phones using entity_map field paths
  6. Queue discovered entities for next depth
  7. Repeat until max_depth or no new entities
"""
import re
import time
from typing import Any
from bson import ObjectId

from app.db import get_credmon
from app.config import settings


# ── Schema cache ──────────────────────────────────────────
_schema_cache: dict[str, dict | None] = {}


def _get_leak_schema(collection_name: str) -> dict | None:
    if collection_name not in _schema_cache:
        master = get_credmon()["Master_extracts"]
        _schema_cache[collection_name] = master["Leaks_info"].find_one(
            {"collection_Name": collection_name}
        )
    return _schema_cache[collection_name]


# ── Entity extraction ─────────────────────────────────────

def _extract_value(doc: dict, path: str) -> Any:
    """Safely extract nested value using dot notation."""
    parts = path.strip('"').split(".")
    current = doc
    for p in parts:
        if isinstance(current, dict):
            current = current.get(p)
        elif isinstance(current, list) and current and isinstance(current[0], dict):
            current = current[0].get(p)
        else:
            return None
        if current is None:
            return None
    return current


def _extract_entities(record: dict, schema_info: dict | None) -> tuple[set[str], set[str]]:
    """Extract emails and phone numbers from a breach record using entity_map."""
    emails: set[str] = set()
    phones: set[str] = set()
    data = record.get("data", record)

    # Use entity_map from Leaks_info
    if schema_info and "entity_map" in schema_info:
        emap = schema_info["entity_map"]
        for path in emap.get("emails", []):
            val = _extract_value(data, path)
            if val:
                vals = val if isinstance(val, list) else [val]
                for v in vals:
                    if isinstance(v, str) and "@" in v:
                        emails.add(v.strip().lower())
        for path in emap.get("contactNumbers", []):
            val = _extract_value(data, path)
            if val:
                vals = val if isinstance(val, list) else [val]
                for v in vals:
                    digits = re.sub(r"\D", "", str(v))
                    if 7 <= len(digits) <= 15:
                        phones.add(digits)

    # Fallback: brute force scan
    def scan(obj: Any):
        if isinstance(obj, dict):
            for v in obj.values():
                scan(v)
        elif isinstance(obj, list):
            for item in obj:
                scan(item)
        elif isinstance(obj, str):
            for m in re.findall(r"[\w.+-]+@[\w-]+\.[\w.]+", obj):
                emails.add(m.lower())
            for m in re.findall(r"\b[6-9]\d{9}\b", obj):
                phones.add(m)

    scan(data)
    return emails, phones


def _flatten_record(record: dict) -> dict[str, str]:
    """Flatten nested record into key-value pairs for display."""
    flat: dict[str, str] = {}

    def walk(obj: Any, prefix: str = ""):
        if isinstance(obj, dict):
            for k, v in obj.items():
                if k in ("_id", "__v", "datahash", "source_id"):
                    continue
                key = f"{prefix}.{k}" if prefix else k
                if isinstance(v, dict):
                    walk(v, key)
                elif isinstance(v, list):
                    if v and isinstance(v[0], dict):
                        flat[key] = str(v)[:500]
                    else:
                        cleaned = [x for x in v if x is not None and x != ""]
                        if cleaned:
                            flat[key] = str(cleaned)[:500]
                elif v is not None and str(v) not in ("", "null", "None", "false", "0"):
                    flat[key] = str(v)[:300]

    walk(record.get("data", record))
    return flat


# ── Core pipeline ─────────────────────────────────────────

def search_master(entity_type: str, value: str, exact: bool = False) -> dict | None:
    """Search Master_extracts for a phone or email. Returns sources with ObjectIDs.

    When exact=True, queries the value as-is (no variant generation for phones).
    """
    master = get_credmon()["Master_extracts"]

    if entity_type == "phone":
        if exact:
            hit = master["contactNumbers"].find_one({"contactNumber": value})
            if hit:
                return {
                    "type": "phone",
                    "value": value,
                    "sources": hit.get("sources", []),
                }
        else:
            digits = re.sub(r"\D", "", value)
            for variant in [digits, digits[-10:], "91" + digits[-10:]]:
                hit = master["contactNumbers"].find_one({"contactNumber": variant})
                if hit:
                    return {
                        "type": "phone",
                        "value": variant,
                        "sources": hit.get("sources", []),
                    }
    elif entity_type == "email":
        hit = master["emails"].find_one({"email": value.lower()})
        if hit:
            return {
                "type": "email",
                "value": value.lower(),
                "sources": hit.get("sources", []),
                "domain": hit.get("domain"),
                "count": hit.get("count"),
            }
    elif entity_type == "username":
        hit = master["usernames"].find_one({"username": value})
        if hit:
            return {
                "type": "username",
                "value": value,
                "sources": hit.get("sources", []),
            }
    elif entity_type == "fullname":
        hit = master["fullnames"].find_one({"fullname": value})
        if hit:
            return {
                "type": "fullname",
                "value": value,
                "sources": hit.get("sources", []),
            }
    return None


def fetch_record_by_id(collection_name: str, record_id: str) -> dict | None:
    """Fetch a single record from Leaks_referral by ObjectID — instant."""
    leaks_db = get_credmon()["Leaks_referral"]
    try:
        return leaks_db[collection_name].find_one({"_id": ObjectId(record_id)})
    except Exception:
        return leaks_db[collection_name].find_one({"_id": record_id})


def run_pipeline(
    seed_type: str,
    seed_value: str,
    max_depth: int | None = None,
) -> list[dict]:
    """
    BFS recursive entity expansion pipeline.
    Returns list of results per entity searched, each with breach sources and extracted entities.
    """
    if max_depth is None:
        max_depth = settings.max_search_depth

    visited: set[str] = set()
    queue: list[tuple[str, str, int]] = [(seed_type, seed_value, 0)]
    results: list[dict] = []

    while queue:
        etype, evalue, depth = queue.pop(0)
        if depth > max_depth:
            continue

        entity_key = f"{etype}:{evalue}"
        if entity_key in visited:
            continue
        visited.add(entity_key)

        # Limit entities per depth
        depth_count = sum(1 for r in results if r["depth"] == depth)
        if depth_count >= settings.max_entities_per_depth:
            continue

        # Search master_extracts
        t0 = time.time()
        hit = search_master(etype, evalue)
        search_time_ms = round((time.time() - t0) * 1000)

        if not hit:
            results.append({
                "depth": depth,
                "entity_type": etype,
                "entity_value": evalue,
                "found": False,
                "search_time_ms": search_time_ms,
            })
            continue

        # Process each source — fetch actual records via ObjectID
        source_results = []
        new_emails: set[str] = set()
        new_phones: set[str] = set()

        for src in hit["sources"]:
            col_name = src["collection"]
            record_ids = src.get("id", [])
            schema_info = _get_leak_schema(col_name)

            records = []
            for rid in record_ids[:3]:
                t1 = time.time()
                rec = fetch_record_by_id(col_name, rid)
                fetch_time = round((time.time() - t1) * 1000)

                if rec:
                    flat = _flatten_record(rec)
                    extracted_emails, extracted_phones = _extract_entities(rec, schema_info)

                    # Remove seed entity from results
                    extracted_emails.discard(evalue.lower() if etype == "email" else "")
                    extracted_phones.discard(evalue if etype == "phone" else "")

                    new_emails.update(extracted_emails)
                    new_phones.update(extracted_phones)

                    records.append({
                        "record_id": str(rid),
                        "fetch_time_ms": fetch_time,
                        "fields": flat,
                        "extracted_emails": list(extracted_emails),
                        "extracted_phones": list(extracted_phones),
                    })

            source_results.append({
                "collection": col_name,
                "leak_name": schema_info.get("leak_name", col_name) if schema_info else col_name,
                "breach_date": schema_info.get("breach_date", "unknown") if schema_info else "unknown",
                "description": (schema_info.get("description", "") if schema_info else "")[:200],
                "record_count_found": len(records),
                "records": records,
            })

        results.append({
            "depth": depth,
            "entity_type": etype,
            "entity_value": evalue,
            "found": True,
            "search_time_ms": search_time_ms,
            "total_sources": len(hit["sources"]),
            "sources": source_results,
            "new_emails_found": list(new_emails),
            "new_phones_found": list(new_phones),
        })

        # Queue new entities for next depth
        for email in new_emails:
            queue.append(("email", email, depth + 1))
        for phone in new_phones:
            queue.append(("phone", phone, depth + 1))

    return results


def run_pipeline_streaming(
    seeds: list[dict],
    max_depth: int = 5,
    max_entities_per_depth: int | None = None,
):
    """
    BFS streaming pipeline — generator that yields per-entity result dicts.

    Args:
        seeds: list of {"type": "phone"|"email", "value": "..."} dicts
        max_depth: maximum BFS depth (default 5)
        max_entities_per_depth: cap per depth level (default from settings)

    Yields:
        dict per entity searched, with keys: depth, entity_type, entity_value,
        found, search_time_ms, sources, new_identifiers
    """
    if max_entities_per_depth is None:
        max_entities_per_depth = settings.max_entities_per_depth

    visited: set[str] = set()
    # BFS queue: list of (type, value, depth)
    queue: list[tuple[str, str, int]] = []
    for seed in seeds:
        queue.append((seed["type"], seed["value"], 0))

    # Track depth-level entity counts for the cap
    depth_counts: dict[int, int] = {}

    while queue:
        etype, evalue, depth = queue.pop(0)

        if depth > max_depth:
            continue

        entity_key = f"{etype}:{evalue}"
        if entity_key in visited:
            continue
        visited.add(entity_key)

        # Enforce per-depth entity cap
        depth_counts.setdefault(depth, 0)
        if depth_counts[depth] >= max_entities_per_depth:
            continue
        depth_counts[depth] += 1

        # Search master_extracts (exact matching only)
        t0 = time.time()
        hit = search_master(etype, evalue, exact=True)
        search_time_ms = round((time.time() - t0) * 1000)

        if not hit:
            yield {
                "depth": depth,
                "entity_type": etype,
                "entity_value": evalue,
                "found": False,
                "search_time_ms": search_time_ms,
                "sources": [],
                "new_identifiers": [],
            }
            continue

        # Process each source — fetch actual records via ObjectID (cap at 50)
        source_results = []
        new_emails: set[str] = set()
        new_phones: set[str] = set()
        new_usernames: set[str] = set()
        new_fullnames: set[str] = set()

        for src in hit["sources"]:
            col_name = src["collection"]
            record_ids = src.get("id", [])
            schema_info = _get_leak_schema(col_name)

            records = []
            for rid in record_ids[:50]:
                rec = fetch_record_by_id(col_name, rid)
                if rec:
                    flat = _flatten_record(rec)
                    extracted_emails, extracted_phones = _extract_entities(rec, schema_info)

                    # Remove current entity from extracted results
                    extracted_emails.discard(evalue.lower() if etype == "email" else "")
                    extracted_phones.discard(evalue if etype == "phone" else "")

                    new_emails.update(extracted_emails)
                    new_phones.update(extracted_phones)

                    # Extract usernames and fullnames from record fields
                    for k, v in flat.items():
                        if not v or not isinstance(v, str) or len(v) < 2 or len(v) > 100:
                            continue
                        kl = k.lower()
                        if ("username" in kl or "user_name" in kl) and "@" not in v and not v.isdigit():
                            new_usernames.add(v.strip())
                        elif ("fullname" in kl or "full_name" in kl or kl == "name") and "@" not in v and not v.isdigit() and len(v) > 3:
                            new_fullnames.add(v.strip())

                    records.append({
                        "record_id": str(rid),
                        "fields": flat,
                    })

            source_results.append({
                "collection": col_name,
                "leak_name": schema_info.get("leak_name", col_name) if schema_info else col_name,
                "breach_date": schema_info.get("breach_date", "unknown") if schema_info else "unknown",
                "records": records,
            })

        # Filter new_identifiers to only those not already visited
        new_identifiers = []
        for email in new_emails:
            if f"email:{email}" not in visited:
                new_identifiers.append({"type": "email", "value": email})
        for phone in new_phones:
            if f"phone:{phone}" not in visited:
                new_identifiers.append({"type": "phone", "value": phone})
        for uname in new_usernames:
            if f"username:{uname}" not in visited:
                new_identifiers.append({"type": "username", "value": uname})
        for fname in new_fullnames:
            if f"fullname:{fname}" not in visited:
                new_identifiers.append({"type": "fullname", "value": fname})

        yield {
            "depth": depth,
            "entity_type": etype,
            "entity_value": evalue,
            "found": True,
            "search_time_ms": search_time_ms,
            "sources": source_results,
            "new_identifiers": new_identifiers,
        }

        # Queue new entities for next depth
        for email in new_emails:
            queue.append(("email", email, depth + 1))
        for phone in new_phones:
            queue.append(("phone", phone, depth + 1))
        for uname in new_usernames:
            queue.append(("username", uname, depth + 1))
        for fname in new_fullnames:
            queue.append(("fullname", fname, depth + 1))
