"""India geo resolver (backend-owned).

Loads the five JSON datasets built by ``scripts/build_india_geo.py`` at
module import. Exposes:

  - ``resolve_place(name)``   — free-text place → canonical form + parents
  - ``state_from_pincode(p)`` — 6-digit pincode → canonical state name
  - ``resolve_canonical_location(results)`` — vote-based canonical location
    from a list of CREDMON-shaped search results, mirroring the frontend's
    historical ``chooseCanonicalLocation`` output shape.

Differences from the frontend implementation it replaces:
  * Uses the full India geo dataset (no MAJOR_CITIES whitelist).
  * Values that resolve to ``type=locality`` contribute votes to the parent
    city AND state too (not just to a locality bucket), so a record listing
    "Adyar" boosts Chennai + Tamil Nadu — not a separate, unrelated locality.
"""

from __future__ import annotations

import json
import re
from collections import Counter
from pathlib import Path
from typing import Optional

_DATA_DIR = Path(__file__).parent / "data"


def _load_json(name: str) -> dict:
    path = _DATA_DIR / name
    with open(path, "r", encoding="utf-8") as fh:
        return json.load(fh)


# ---------------------------------------------------------------------------
# Dataset load (at import time)
# ---------------------------------------------------------------------------

# states: { canonicalName (Title Case): [aliases...] }
_STATES_RAW: dict[str, list[str]] = _load_json("india_geo_states.json")
# districts: { lowercaseName: stateCanonicalName }
_DISTRICTS_RAW: dict[str, str] = _load_json("india_geo_districts.json")
# cities: { lowercaseName: {state, district} }
_CITIES_RAW: dict[str, dict] = _load_json("india_geo_cities.json")
# localities: { lowercaseName: {city, state, pincode} }
_LOCALITIES_RAW: dict[str, dict] = _load_json("india_geo_localities.json")
# pin prefix: { "3-digit": stateCanonicalName }
_PIN_PREFIX: dict[str, str] = _load_json("india_geo_pin_prefix.json")


# Index: lowercase alias / canonical-name → canonical state name
_STATE_LOOKUP: dict[str, str] = {}
_STATE_TO_CODE: dict[str, str] = {}
for canonical, aliases in _STATES_RAW.items():
    _STATE_LOOKUP[canonical.lower()] = canonical
    for alias in aliases:
        key = alias.strip().lower()
        if key and key not in _STATE_LOOKUP:
            _STATE_LOOKUP[key] = canonical
        # 2-letter codes (uppercase in dataset)
        if len(alias) == 2 and alias.isalpha():
            _STATE_TO_CODE.setdefault(canonical, alias.upper())

# Common state aliases not in the dataset (frontend parity)
_STATE_ALIAS_EXTRAS = {
    "new delhi": "Delhi",
    "delhi": "Delhi",
    "tamilnadu": "Tamil Nadu",
    "tamil-nadu": "Tamil Nadu",
    "andhrapradesh": "Andhra Pradesh",
    "uttarpradesh": "Uttar Pradesh",
    "madhyapradesh": "Madhya Pradesh",
    "westbengal": "West Bengal",
    "himachalpradesh": "Himachal Pradesh",
    "arunachalpradesh": "Arunachal Pradesh",
    "orissa": "Odisha",
    "uttaranchal": "Uttarakhand",
    "chattisgarh": "Chhattisgarh",
    "jammu & kashmir": "Jammu and Kashmir",
}
for k, v in _STATE_ALIAS_EXTRAS.items():
    _STATE_LOOKUP.setdefault(k, v)


# City alias map (parity with frontend's CITY_ALIASES; bidirectional canonicalization)
_CITY_ALIASES = {
    "bengaluru": "Bangalore",
    "bengalore": "Bangalore",
    "mysuru": "Mysore",
    "mangaluru": "Mangalore",
    "belagavi": "Belgaum",
    "gurugram": "Gurgaon",
    "prayagraj": "Allahabad",
    "trivandrum": "Thiruvananthapuram",
    "cochin": "Kochi",
    "calicut": "Kozhikode",
    "vizag": "Visakhapatnam",
    "bombay": "Mumbai",
    "madras": "Chennai",
    "calcutta": "Kolkata",
}


def _titleish(name: str) -> str:
    """Cheap title-case for cities/districts (preserves the dataset's casing
    where present, else best-effort)."""
    parts = name.strip().split()
    return " ".join(p[:1].upper() + p[1:].lower() if p else p for p in parts)


# ---------------------------------------------------------------------------
# Public: resolve_place
# ---------------------------------------------------------------------------

def resolve_place(raw_name: str) -> Optional[dict]:
    """Resolve a free-text place to a canonical record + parent chain.

    Lookup priority: state → city → locality → district. State wins first so a
    bare "Delhi" returns ``type=state`` (matching the frontend's intuition that
    Delhi is primarily a state-level identifier even though it is also a city).

    Returns ``None`` when nothing matches.
    """
    if not isinstance(raw_name, str):
        return None
    cleaned = raw_name.strip()
    if not cleaned:
        return None
    key = cleaned.lower()

    # 1. State (canonical name or known alias)
    if key in _STATE_LOOKUP:
        canonical = _STATE_LOOKUP[key]
        return {
            "type": "state",
            "name": canonical,
            "parents": {"city": None, "district": None, "state": canonical},
        }

    # Apply city aliases before city/locality lookups
    aliased = _CITY_ALIASES.get(key, key)

    # 2. Locality (checked before city: localities are curated from top metros
    #    so a name present in localities is almost always the intended hit;
    #    cities are a much wider but lower-signal set). Special-case: when the
    #    locality entry's parent city equals the queried name itself (e.g.
    #    "Chennai" appearing in localities as the H.O. post-office name), the
    #    user clearly meant the city — promote to type=city.
    if aliased in _LOCALITIES_RAW:
        entry = _LOCALITIES_RAW[aliased]
        loc_name = _titleish(aliased)
        city = entry.get("city")
        state = entry.get("state")
        if city and city.lower() == aliased.lower():
            return {
                "type": "city",
                "name": city,
                "parents": {"city": city, "district": city, "state": state},
            }
        district = city  # localities don't carry district directly; city stands in
        return {
            "type": "locality",
            "name": loc_name,
            "parents": {"city": city, "district": district, "state": state},
        }

    # 3. City
    if aliased in _CITIES_RAW:
        entry = _CITIES_RAW[aliased]
        city_name = _titleish(aliased)
        state = entry.get("state")
        district = entry.get("district") or state
        return {
            "type": "city",
            "name": city_name,
            "parents": {"city": city_name, "district": district, "state": state},
        }

    # 4. District
    if aliased in _DISTRICTS_RAW:
        district = _titleish(aliased)
        state = _DISTRICTS_RAW[aliased]
        return {
            "type": "district",
            "name": district,
            "parents": {"city": None, "district": district, "state": state},
        }

    return None


# ---------------------------------------------------------------------------
# Public: state_from_pincode
# ---------------------------------------------------------------------------

_PIN_SHAPE = re.compile(r"^\d{6}$")


def state_from_pincode(pin) -> Optional[str]:
    if pin is None:
        return None
    s = str(pin).strip()
    if not _PIN_SHAPE.match(s):
        return None
    prefix = s[:3]
    return _PIN_PREFIX.get(prefix)


# ---------------------------------------------------------------------------
# Vote-based canonical location resolver
# ---------------------------------------------------------------------------

_LOCATION_KEYS = frozenset([
    "city", "locationinfo.city", "state", "locationinfo.state",
    "district", "pincode", "zipcode", "postal", "postal_code",
    "address", "address_1", "address1", "address2", "area", "region",
    "location", "country",
])

_JUNK_RX = re.compile(r"^(null|none|n/?a|nil|undefined|0|-)$", re.IGNORECASE)
_PINCODE_RX = re.compile(r"^\d{6}$")
_PINCODE_IN_ADDR = re.compile(r"\b(\d{6})\b")


def _is_junk_value(v) -> bool:
    if not isinstance(v, str):
        return True
    t = v.strip()
    if len(t) <= 1:
        return True
    if _JUNK_RX.match(t):
        return True
    if re.match(r"^\d{1,3}$", t):
        return True
    return False


def _normalize_state(raw: str) -> Optional[str]:
    if not raw:
        return None
    key = raw.strip().lower().replace("  ", " ")
    if key in _STATE_LOOKUP:
        return _STATE_LOOKUP[key]
    stripped = re.sub(r"[^a-z ]", "", key).strip()
    if stripped in _STATE_LOOKUP:
        return _STATE_LOOKUP[stripped]
    return None


def _extract_state_from_address(addr: str) -> Optional[str]:
    """Longest-alias match against all known state aliases."""
    if not addr:
        return None
    lower = addr.lower()
    best: Optional[str] = None
    best_len = 0
    for alias, canonical in _STATE_LOOKUP.items():
        # skip 2-letter aliases here; handled in separate whole-word pass below
        if len(alias) <= 2:
            continue
        if alias in lower and len(alias) > best_len:
            best = canonical
            best_len = len(alias)
    if best is not None:
        return best
    # 2-letter abbreviation whole-word pass
    for canonical, code in _STATE_TO_CODE.items():
        if re.search(rf"\b{re.escape(code)}\b", addr, re.IGNORECASE):
            return canonical
    return None


def _extract_pincode_from_address(addr: str) -> Optional[str]:
    if not addr:
        return None
    m = _PINCODE_IN_ADDR.search(addr)
    return m.group(1) if m else None


def _extract_city_or_locality_from_address(addr: str):
    """Scan address for any known city or locality token (longest wins)."""
    if not addr:
        return None
    lower = addr.lower()
    best = None
    best_len = 0
    for name, entry in _CITIES_RAW.items():
        if len(name) <= 2:
            continue
        if re.search(rf"\b{re.escape(name)}\b", lower) and len(name) > best_len:
            best = ("city", name, entry)
            best_len = len(name)
    for name, entry in _LOCALITIES_RAW.items():
        if len(name) <= 2:
            continue
        if re.search(rf"\b{re.escape(name)}\b", lower) and len(name) > best_len:
            best = ("locality", name, entry)
            best_len = len(name)
    return best


def _extract_fields(fields: dict) -> dict:
    out = {"cities": [], "localities": [], "districts": [], "states": [], "pincodes": [], "addresses": []}
    if not isinstance(fields, dict):
        return out

    for raw_key, raw_val in fields.items():
        if not isinstance(raw_key, str):
            continue
        key = raw_key.lower().replace(" ", "")
        val = raw_val if isinstance(raw_val, str) else (str(raw_val) if raw_val is not None else "")
        if _is_junk_value(val):
            continue

        # Filter to location-related keys
        if (
            key not in _LOCATION_KEYS
            and "city" not in key
            and "state" not in key
            and "district" not in key
            and "pin" not in key
            and "zip" not in key
            and "postal" not in key
            and "address" not in key
            and "area" not in key
            and "region" not in key
            and "location" not in key
        ):
            continue

        # Country: only progress India
        if key == "country" or key.endswith("_country") or key.endswith(".country"):
            cl = val.lower()
            if cl not in ("india", "in", "ind"):
                continue
            continue

        if "pin" in key or "zip" in key or key in ("postal", "postal_code"):
            if _PINCODE_RX.match(val.strip()):
                out["pincodes"].append(val.strip())
            continue

        if "address" in key:
            out["addresses"].append(val)
            continue

        clean = val.strip()
        if len(clean) < 2:
            continue

        is_state_key = (
            key == "state" or key == "locationinfo.state" or key == "region"
            or key.endswith("_state") or key.endswith("_region")
            or key.endswith(".state") or key.endswith(".region")
        )
        if is_state_key:
            ns = _normalize_state(clean)
            if ns:
                out["states"].append(ns)
                continue
            # The state field may actually carry a city/locality name in messy data.
            place = resolve_place(clean)
            if place:
                _route_place(place, out)
            continue

        is_city_key = (
            key == "city" or key == "locationinfo.city" or key == "district"
            or key == "area" or key == "location"
            or key.endswith("_city") or key.endswith(".city")
            or key.endswith("_district") or key.endswith(".district")
        )
        if is_city_key:
            ns = _normalize_state(clean)
            if ns:
                out["states"].append(ns)
                continue
            if not clean.isdigit():
                place = resolve_place(clean)
                if place:
                    _route_place(place, out)
                else:
                    # Unknown — record as raw city so the bucket still
                    # surfaces signal in noisy datasets.
                    out["cities"].append(_titleish(clean))
            continue

    return out


def _route_place(place: dict, out: dict) -> None:
    """Route a resolve_place() hit into the appropriate buckets.

    Localities cascade up: locality vote + city vote + state vote.
    Cities cascade up: city vote + state vote.
    Districts: district vote + state vote.
    States: state vote.
    """
    name = place["name"]
    parents = place.get("parents") or {}
    t = place["type"]
    if t == "locality":
        out["localities"].append(name)
        if parents.get("city"):
            out["cities"].append(parents["city"])
        if parents.get("state"):
            out["states"].append(parents["state"])
    elif t == "city":
        out["cities"].append(name)
        if parents.get("state"):
            out["states"].append(parents["state"])
    elif t == "district":
        out["districts"].append(name)
        if parents.get("state"):
            out["states"].append(parents["state"])
    elif t == "state":
        out["states"].append(name)


def _empty_canonical(total_records: int = 0, records_with_location: int = 0) -> dict:
    return {
        "state": None,
        "stateCode": None,
        "district": None,
        "city": None,
        "locality": None,
        "pincode": None,
        "confidence": 0,
        "evidence": {
            "state_votes": {},
            "city_votes": {},
            "district_votes": {},
            "locality_votes": {},
            "pincode_votes": {},
            "total_records": total_records,
            "records_with_location": records_with_location,
        },
        "alternates": [],
    }


def _top_entry(counter: Counter):
    if not counter:
        return None, 0
    # ties broken alphabetically (matches JS `k < best` ordering)
    best_count = max(counter.values())
    candidates = sorted(k for k, v in counter.items() if v == best_count)
    return candidates[0], best_count


def resolve_canonical_location(results: list[dict]) -> dict:
    """Vote across all records to pick a canonical (state, district/city, pincode).

    Same scoring weights, alternates derivation, and confidence formula as the
    frontend's historical chooseCanonicalLocation, with the dataset-level
    improvement that localities cascade votes up to their parent city + state.
    """
    if not isinstance(results, list) or not results:
        return _empty_canonical()

    state_votes: Counter = Counter()
    city_votes: Counter = Counter()
    district_votes: Counter = Counter()
    locality_votes: Counter = Counter()
    pincode_votes: Counter = Counter()
    state_city_pairs: Counter = Counter()

    total_records = 0
    records_with_location = 0

    for entity in results:
        for source in (entity or {}).get("sources") or []:
            for record in (source or {}).get("records") or []:
                total_records += 1
                buckets = _extract_fields((record or {}).get("fields") or {})

                # Address-string fallback
                if not buckets["states"] and not buckets["cities"] and not buckets["localities"] and not buckets["pincodes"]:
                    for addr in buckets["addresses"]:
                        ap = _extract_pincode_from_address(addr)
                        if ap:
                            buckets["pincodes"].append(ap)
                        as_ = _extract_state_from_address(addr)
                        if as_:
                            buckets["states"].append(as_)
                        hit = _extract_city_or_locality_from_address(addr)
                        if hit:
                            kind, name, entry = hit
                            place_type = kind  # "city" or "locality"
                            parents = {}
                            if place_type == "city":
                                parents = {"city": _titleish(name), "district": entry.get("district") or entry.get("state"), "state": entry.get("state")}
                            else:
                                parents = {"city": entry.get("city"), "district": entry.get("city"), "state": entry.get("state")}
                            _route_place({"type": place_type, "name": _titleish(name), "parents": parents}, buckets)

                # Pincode → state fallback
                for pin in buckets["pincodes"]:
                    if not buckets["states"]:
                        ps = state_from_pincode(pin)
                        if ps:
                            buckets["states"].append(ps)

                has_any = (
                    bool(buckets["states"]) or bool(buckets["cities"])
                    or bool(buckets["localities"]) or bool(buckets["districts"])
                    or bool(buckets["pincodes"])
                )
                if not has_any:
                    continue
                records_with_location += 1

                voted_states = set(buckets["states"])
                voted_cities = set(buckets["cities"])
                voted_localities = set(buckets["localities"])
                voted_districts = set(buckets["districts"])
                voted_pins = set(buckets["pincodes"])

                # Cities imply a state if we know it
                for c in list(voted_cities):
                    entry = _CITIES_RAW.get(c.lower())
                    if entry and entry.get("state"):
                        voted_states.add(entry["state"])

                for s in voted_states:
                    state_votes[s] += 1
                for c in voted_cities:
                    city_votes[c] += 1
                for d in voted_districts:
                    district_votes[d] += 1
                for loc in voted_localities:
                    locality_votes[loc] += 1
                for p in voted_pins:
                    pincode_votes[p] += 1

                for c in voted_cities:
                    for s in voted_states:
                        state_city_pairs[f"{s}|||{c}"] += 1

    if records_with_location == 0:
        return _empty_canonical(total_records=total_records, records_with_location=0)

    win_state, win_state_count = _top_entry(state_votes)
    win_pincode, _ = _top_entry(pincode_votes)
    win_locality, _ = _top_entry(locality_votes)

    # Choose city compatible with winning state
    win_city: Optional[str] = None
    if win_state:
        compat: Counter = Counter()
        for city, count in city_votes.items():
            entry = _CITIES_RAW.get(city.lower())
            implied = entry.get("state") if entry else None
            paired = state_city_pairs.get(f"{win_state}|||{city}", 0)
            if implied == win_state or paired > 0 or not implied:
                compat[city] = count
        win_city, _ = _top_entry(compat)
    if not win_city:
        win_city, _ = _top_entry(city_votes)

    # District: prefer voted districts; else reuse city as a "district label"
    # (the frontend collapses these into the same bucket).
    win_district, _ = _top_entry(district_votes)
    if not win_district:
        win_district = win_city

    # Confidence
    confidence = (win_state_count / records_with_location) if win_state else 0
    if win_state and win_city:
        entry = _CITIES_RAW.get(win_city.lower())
        if entry and entry.get("state") == win_state:
            confidence *= 1.15
    if records_with_location < 3:
        confidence *= 0.70
    confidence = max(0.0, min(1.0, confidence))

    state_code = _STATE_TO_CODE.get(win_state) if win_state else None

    # Alternates: top non-winning districts then non-winning states
    alt_candidates = []
    for d, dv in district_votes.items():
        if d == win_district:
            continue
        alt_candidates.append((d, dv))
    for c, cv in city_votes.items():
        if c == win_city:
            continue
        entry = _CITIES_RAW.get(c.lower())
        ds = (entry or {}).get("state") or win_state
        label = f"{c}, {ds}" if ds else c
        alt_candidates.append((label, cv))
    for s, sv in state_votes.items():
        if s == win_state:
            continue
        alt_candidates.append((s, sv))
    alt_candidates.sort(key=lambda kv: kv[1], reverse=True)
    seen = set()
    alternates = []
    for label, _score in alt_candidates:
        if len(alternates) >= 3:
            break
        k = label.lower()
        if k in seen:
            continue
        seen.add(k)
        alternates.append(label)

    return {
        "state": win_state,
        "stateCode": state_code,
        "district": win_district,
        "city": win_city,
        "locality": win_locality,
        "pincode": win_pincode,
        "confidence": confidence,
        "evidence": {
            "state_votes": dict(state_votes),
            "city_votes": dict(city_votes),
            "district_votes": dict(district_votes),
            "locality_votes": dict(locality_votes),
            "pincode_votes": dict(pincode_votes),
            "total_records": total_records,
            "records_with_location": records_with_location,
        },
        "alternates": alternates,
    }


# ---------------------------------------------------------------------------
# Self-check (run as `python3 -m backend.app.engines.geo`)
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import sys

    failures: list[str] = []

    def _check(label: str, ok: bool, detail: str = "") -> None:
        status = "PASS" if ok else "FAIL"
        print(f"  {status}  {label}{(' — ' + detail) if detail else ''}")
        if not ok:
            failures.append(label)

    print("resolve_place()")
    p = resolve_place("Adyar")
    _check(
        "Adyar -> locality of Chennai/Tamil Nadu",
        bool(p) and p["type"] == "locality" and (p["parents"]["state"] == "Tamil Nadu"),
        repr(p),
    )
    p = resolve_place("Chennai")
    _check("Chennai -> city in Tamil Nadu", bool(p) and p["type"] == "city" and p["parents"]["state"] == "Tamil Nadu", repr(p))
    p = resolve_place("Tamil Nadu")
    _check("Tamil Nadu -> state", bool(p) and p["type"] == "state", repr(p))

    print("\nstate_from_pincode()")
    _check("600020 -> Tamil Nadu", state_from_pincode("600020") == "Tamil Nadu", repr(state_from_pincode("600020")))
    _check("110021 -> Delhi", state_from_pincode("110021") == "Delhi", repr(state_from_pincode("110021")))

    print("\nresolve_canonical_location([])")
    empty = resolve_canonical_location([])
    _check("empty -> state None, confidence 0", empty["state"] is None and empty["confidence"] == 0)

    if failures:
        print(f"\n{len(failures)} FAILURE(S):")
        for f in failures:
            print(f"  - {f}")
        sys.exit(1)
    print("\nALL TESTS PASSED")
    sys.exit(0)
