"""
Main search endpoint — orchestrates all three engines in parallel-ish fashion.
Returns results as a single JSON response (SSE streaming will be added later).
"""
import time
import concurrent.futures
from fastapi import APIRouter
from pydantic import BaseModel

from app.engines import credmon, darkmon, fti

router = APIRouter(tags=["search"])


class SearchRequest(BaseModel):
    type: str = "phone"  # "phone" | "email"
    value: str
    max_depth: int = 2


@router.post("/search")
def search(req: SearchRequest):
    t_start = time.time()
    value = req.value.strip()
    if not value:
        return {"error": "No value provided"}

    # ── Phase 1: CREDMON breach pipeline (fast — sub-second) ──
    t0 = time.time()
    breach_results = credmon.run_pipeline(req.type, value, req.max_depth)
    credmon_time = round((time.time() - t0) * 1000)

    # Collect all discovered entities for cross-engine lookups
    all_emails: set[str] = set()
    all_phones: set[str] = set()
    all_usernames: set[str] = set()

    for r in breach_results:
        if r.get("found"):
            all_emails.update(r.get("new_emails_found", []))
            all_phones.update(r.get("new_phones_found", []))
            # Extract usernames from breach fields
            for src in r.get("sources", []):
                for rec in src.get("records", []):
                    for k, v in rec.get("fields", {}).items():
                        kl = k.lower()
                        if ("username" in kl or "user_name" in kl) and v and "@" not in v and len(v) < 50 and not v.isdigit():
                            all_usernames.add(v)

    # Add seed to the lookup sets
    if req.type == "phone":
        all_phones.add(value)
    elif req.type == "email":
        all_emails.add(value)

    # ── Phase 2: FTI + DARKMON in parallel threads ──
    fti_results = {}
    darkweb_results = {}

    def run_fti():
        nonlocal fti_results
        r = {}

        # Phone-specific queries
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

        # Email-specific queries
        for email in list(all_emails)[:3]:
            email_hits = fti.search_emails(email)
            if email_hits:
                r.setdefault("email_intel", []).extend(email_hits)

        # Name-based watchlist screening (from breach fullname fields)
        discovered_names = set()
        for br in breach_results:
            for src in br.get("sources", []):
                for rec in src.get("records", []):
                    fields = rec.get("fields", {})
                    for k, v in fields.items():
                        kl = k.lower()
                        if ("fullname" in kl or "full_name" in kl or k == "name") and v and len(v) > 3 and not v.isdigit():
                            discovered_names.add(v)

        for name in list(discovered_names)[:2]:
            crime = fti.screen_crimedata(name)
            if crime:
                r.setdefault("crimedata_matches", []).extend(crime)
            wc = fti.screen_worldcheck(name)
            if wc:
                r.setdefault("worldcheck_matches", []).extend(wc)

        fti_results.update(r)

    def run_darkmon():
        nonlocal darkweb_results
        r = {"entity_matches": {"threads": [], "posts": []}, "username_matches": []}

        # SKIP extracted_info entity search — too slow without indexes (50s+)
        # Only do username-based searches (uses author_username index)
        for uname in list(all_usernames)[:5]:
            uh = darkmon.search_by_username(uname)
            if uh.get("threads") or uh.get("posts") or uh.get("author_profile"):
                r["username_matches"].append({"username": uname, **uh})

        darkweb_results.update(r)

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        t1 = time.time()
        f_fti = executor.submit(run_fti)
        f_dw = executor.submit(run_darkmon)
        concurrent.futures.wait([f_fti, f_dw], timeout=60)
        parallel_time = round((time.time() - t1) * 1000)

    total_time = round((time.time() - t_start) * 1000)

    return {
        "seed": {"type": req.type, "value": value},
        "max_depth": req.max_depth,
        "total_time_ms": total_time,
        "timings": {
            "credmon_ms": credmon_time,
            "parallel_ms": parallel_time,
        },
        "breach": {
            "results": breach_results,
            "total_searched": len(breach_results),
            "total_found": sum(1 for r in breach_results if r.get("found")),
        },
        "threat_intel": fti_results,
        "darkweb": darkweb_results,
        "discovered_entities": {
            "emails": list(all_emails),
            "phones": list(all_phones),
            "usernames": list(all_usernames),
        },
    }
