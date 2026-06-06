"""Identifier categorizer (backend-owned).

Port + tightening of the frontend SubjectProfile categorizer (see
`frontend/src/components/SubjectProfile.jsx`). Classifies field/value pairs
from CREDMON-shaped records into canonical profile categories.

The categorizer applies word-bounded key regexes plus per-category value
validators to reject shape-blind matches (e.g. "Active" leaking into
financial, "110060" leaking into devices).

Run as `python3 -m backend.app.engines.identifier_categorizer` from the
sigint/ project root to execute the embedded test block.
"""

from __future__ import annotations

import re
import sys
from dataclasses import dataclass
from typing import Callable, Optional

# ---------------------------------------------------------------------------
# Skip values / composite key sets — ported verbatim from SubjectProfile.jsx
# ---------------------------------------------------------------------------

SKIP_VALUES = frozenset(
    ["", "null", "None", "none", "undefined", "N/A", "n/a", "-", "0", "false"]
)

NAME_COMPOSITE_KEYS = frozenset(
    ["fullname", "full_name", "displayname", "display_name", "real_name", "name"]
)
NAME_COMPONENT_KEYS = frozenset(
    ["first_name", "firstname", "last_name", "lastname", "middle_name", "middlename"]
)

ADDR_PART_KEYS = [
    "address1", "address2", "building", "area", "street", "landmark",
    "city", "district", "state", "zip", "zipcode", "postal", "pincode",
    "country",
]
ADDR_PART_SET = frozenset(ADDR_PART_KEYS)

COUNTRY_EXPAND = {
    "IN": "India", "US": "United States", "UK": "United Kingdom",
    "AU": "Australia", "CA": "Canada", "SG": "Singapore",
    "AE": "United Arab Emirates", "NZ": "New Zealand", "DE": "Germany",
    "FR": "France", "GB": "United Kingdom",
}

# Category output order (every key always present in extract_profile output)
CATEGORY_KEYS = (
    "names", "usernames", "emails", "phones", "ips", "locations",
    "accounts", "financial", "devices", "dob",
)

PER_CATEGORY_CAP = 15


# ---------------------------------------------------------------------------
# Value helpers
# ---------------------------------------------------------------------------

def _is_useful(v) -> bool:
    if not isinstance(v, str):
        return False
    trimmed = v.strip()
    if trimmed in SKIP_VALUES:
        return False
    if len(trimmed) < 2 or len(trimmed) > 500:
        return False
    return True


# ---------------------------------------------------------------------------
# Per-category value validators
# ---------------------------------------------------------------------------

_EMAIL_SHAPE = re.compile(r".+@.+\..+")
_IP_SHAPE = re.compile(r"^(\d{1,3}\.){3}\d{1,3}$")
_PHONE_DIGITS = re.compile(r"\d{7,}")

# Financial sub-shapes
_UPI_SHAPE = re.compile(r"^[\w.\-]+@[\w]+$")
_IFSC_SHAPE = re.compile(r"^[A-Z]{4}0[A-Z0-9]{6}$")
_PAN_SHAPE = re.compile(r"^[A-Z]{5}[0-9]{4}[A-Z]$")
_AADHAAR_SHAPE = re.compile(r"^\d{12}$")
_ACCOUNT_NUMBER_SHAPE = re.compile(r"^\d{9,18}$")
_CARD_SHAPE = re.compile(r"^\d{13,19}$")
_WALLET_SHAPE = re.compile(r"^[A-Za-z0-9_\-]{6,}$")

# Username rejection shapes (likely-IDs / dates)
_ALL_DIGITS_LONG = re.compile(r"^\d{8,}$")
_DATE_ISO = re.compile(r"^\d{4}[-/]\d{2}[-/]\d{2}")
_DATE_DDMMM = re.compile(r"^\d{2}-[A-Z]{3}-\d{2,4}$", re.IGNORECASE)
_DATE_DDMMYYYY = re.compile(r"^\d{2}/\d{2}/\d{4}$")

# Accounts shape: URL, @-handle, or platform-style alnum id
_HAS_SCHEME = re.compile(r"://")
_HANDLE = re.compile(r"^@?[A-Za-z0-9._\-]+$")
_PURE_DIGITS_SHORT = re.compile(r"^\d{1,7}$")  # reject "110060"-like
_HAS_ALPHA = re.compile(r"[A-Za-z]")
_HAS_DIGIT_OR_DASH_OR_YEAR = re.compile(r"[/\-]|\d{4}")


def _v_names(v: str) -> bool:
    s = v.strip()
    if "@" in s:
        return False
    if s.isdigit():
        return False
    return 3 <= len(s) <= 100


def _v_usernames(v: str) -> bool:
    s = v.strip()
    if len(s) < 3:
        return False
    if "@" in s:
        return False
    if _ALL_DIGITS_LONG.match(s):
        return False
    if _DATE_ISO.match(s) or _DATE_DDMMM.match(s) or _DATE_DDMMYYYY.match(s):
        return False
    return True


def _v_emails(v: str) -> bool:
    s = v.strip()
    if "@" not in s:
        return False
    at_idx = s.rfind("@")
    after = s[at_idx + 1:]
    return "." in after


def _v_phones(v: str) -> bool:
    s = v.replace(" ", "")
    return bool(_PHONE_DIGITS.search(s))


def _v_ips(v: str) -> bool:
    return bool(_IP_SHAPE.match(v.strip()))


def _v_locations(v: str) -> bool:
    return len(v.strip()) >= 2


def _v_accounts(v: str) -> bool:
    s = v.strip()
    if _HAS_SCHEME.search(s):
        return True
    if _PURE_DIGITS_SHORT.match(s):
        return False
    if s.startswith("@") and _HANDLE.match(s):
        return True
    if _HAS_ALPHA.search(s) and _HANDLE.match(s):
        return True
    return False


def _v_financial(v: str) -> bool:
    s = v.strip()
    if _UPI_SHAPE.match(s):
        return True
    if _IFSC_SHAPE.match(s):
        return True
    if _PAN_SHAPE.match(s):
        return True
    if _AADHAAR_SHAPE.match(s):
        return True
    if _ACCOUNT_NUMBER_SHAPE.match(s):
        return True
    if _CARD_SHAPE.match(s):
        return True
    if _WALLET_SHAPE.match(s):
        # Wallet-shape is the loosest catch-all; require it to not be a pure
        # short-numeric (already handled by length >= 6) and not contain
        # whitespace.
        if " " in s:
            return False
        return True
    return False


def _v_devices(v: str) -> bool:
    s = v.strip()
    return bool(_HAS_ALPHA.search(s))


def _v_dob(v: str) -> bool:
    s = v.strip()
    return bool(_HAS_DIGIT_OR_DASH_OR_YEAR.search(s))


# ---------------------------------------------------------------------------
# Category rules (priority order — first match wins)
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class CategoryRule:
    key: str
    key_match: Callable[[str], bool]
    validator: Optional[Callable[[str], bool]]


def _re_match(pattern: str, flags: int = re.IGNORECASE) -> Callable[[str], bool]:
    rx = re.compile(pattern, flags)
    return lambda k: bool(rx.match(k))


def _re_search(pattern: str, flags: int = re.IGNORECASE) -> Callable[[str], bool]:
    rx = re.compile(pattern, flags)
    return lambda k: bool(rx.search(k))


_PLATFORM_TOKENS = frozenset([
    "facebook", "linkedin", "twitter", "instagram", "telegram", "skype",
    "discord", "steam", "truecaller", "whatsapp", "snapchat", "tiktok",
    "reddit", "github", "spotify", "netflix", "amazon", "appleid",
    "apple", "google", "googleplus", "yahoo", "outlook", "website",
    "homepage", "social",
])
_SLOT_TOKENS = frozenset(["url", "account", "profile", "handle", "id", "accounts"])
_PROFILE_URL_KEYS = frozenset(["profile_url", "profileurl"])


def _tokenize_key(k: str) -> list[str]:
    """Split a snake_case / camelCase key into lowercase tokens."""
    # First split on non-alphanumeric (handles snake_case, dashes, dots).
    rough = re.split(r"[^A-Za-z0-9]+", k)
    out: list[str] = []
    for chunk in rough:
        if not chunk:
            continue
        # Split camelCase: insert breaks before capitals.
        parts = re.findall(r"[A-Z]+(?=[A-Z][a-z])|[A-Z]?[a-z]+|[A-Z]+|\d+", chunk)
        for p in parts:
            out.append(p.lower())
    return out


def _accounts_key_match(k: str) -> bool:
    """Tightened accounts matcher.

    Tokenizes the key (treating `_`, `-`, `.`, and camelCase as separators),
    then requires either:
      - a platform token AND a slot token (e.g. `facebook_url`, `google_account`)
      - OR a bare platform token by itself (e.g. `facebook`)
      - OR the literal "profile_url" / "social*" forms
    This prevents loose substring matches like `tour_letterboxd_url` (no
    platform token) or `survey_url` (no platform token).
    """
    tokens = _tokenize_key(k)
    if not tokens:
        return False
    tokset = set(tokens)
    if tokens[0] == "social":
        return True
    if tokset & _PROFILE_URL_KEYS:
        return True
    has_platform = bool(tokset & _PLATFORM_TOKENS)
    has_slot = bool(tokset & _SLOT_TOKENS)
    if has_platform and has_slot:
        return True
    # Bare platform key on its own (single-token key like "facebook").
    if len(tokens) == 1 and tokens[0] in _PLATFORM_TOKENS:
        return True
    return False


def _phones_key_match(k: str) -> bool:
    if re.search(r"email", k, re.IGNORECASE):
        return False
    return bool(re.search(r"phone|mobile|cell|telephone|contact_?number|contactnumber", k, re.IGNORECASE))


def _locations_key_match(k: str) -> bool:
    if re.search(r"\bip\b", k, re.IGNORECASE):
        return False
    if re.search(r"email", k, re.IGNORECASE):
        return False
    return bool(
        re.search(
            r"city|state|country|region|zip|zipcode|postal|address|"
            r"location|geo|pincode|district|area",
            k,
            re.IGNORECASE,
        )
    )


def _devices_key_match(k: str) -> bool:
    # Word-bounded `os` so `most_recent_x` no longer matches.
    return bool(
        re.search(
            r"\b(device|browser|user_?agent|os|platform|device_?id|imei|mac_?address)\b",
            k,
            re.IGNORECASE,
        )
    )


CATEGORY_RULES: tuple[CategoryRule, ...] = (
    CategoryRule(
        key="names",
        key_match=_re_match(
            r"^(name|fullname|full_name|first_?name|last_?name|middle_?name|"
            r"display_?name|displayname|real_?name)$"
        ),
        validator=_v_names,
    ),
    CategoryRule(
        key="usernames",
        key_match=_re_match(
            r"^(user_?name|username|nick(?:name)?|screen_?name|handle|"
            r"loginname|user_?id|username_?2)$"
        ),
        validator=_v_usernames,
    ),
    CategoryRule(
        key="emails",
        key_match=_re_match(r"^(e-?mail|mail|email_?address)$"),
        validator=_v_emails,
    ),
    CategoryRule(
        key="phones",
        key_match=_phones_key_match,
        validator=_v_phones,
    ),
    CategoryRule(
        key="ips",
        key_match=_re_match(
            r"^(ip|ip_?address|last_?ip|signup_?ip|login_?ip|created_?ip|"
            r"register_?ip|reg_?ip)$"
        ),
        validator=_v_ips,
    ),
    CategoryRule(
        key="locations",
        key_match=_locations_key_match,
        validator=_v_locations,
    ),
    # Financial BEFORE accounts: UPI handles ("user@paytm") fit financial first.
    CategoryRule(
        key="financial",
        key_match=_re_match(
            r"^(upi|upi_?id|bank_?account|account_?number|bank_?ifsc|ifsc|"
            r"card_?number|pan|pan_?card|aadhaar|aadhar|cibil|payment_?id|"
            r"wallet_?id)$"
        ),
        validator=_v_financial,
    ),
    CategoryRule(
        key="accounts",
        key_match=_accounts_key_match,
        validator=_v_accounts,
    ),
    CategoryRule(
        key="devices",
        key_match=_devices_key_match,
        validator=_v_devices,
    ),
    CategoryRule(
        key="dob",
        key_match=_re_match(r"^(dob|date_?of_?birth|birth_?date|birthday)$"),
        validator=_v_dob,
    ),
)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def categorize_field(key: str, value) -> Optional[tuple[str, str]]:
    """Classify a single key/value pair.

    Returns (category_key, normalized_value) or None.
    """
    if not isinstance(key, str) or not key:
        return None
    if not _is_useful(value):
        return None
    normalized = value.strip()
    for rule in CATEGORY_RULES:
        if not rule.key_match(key):
            continue
        if rule.validator is not None and not rule.validator(normalized):
            # First key match wins (no fall-through to next rule), to mirror
            # the frontend's break-on-match behavior.
            return None
        return rule.key, normalized
    return None


def _compose_name(fields: dict) -> tuple[Optional[str], set[str]]:
    consumed: set[str] = set()
    for k in fields.keys():
        if k.lower() in NAME_COMPOSITE_KEYS:
            v = fields[k]
            if _is_useful(v):
                consumed.add(k.lower())
                for ck in NAME_COMPONENT_KEYS:
                    consumed.add(ck)
                return v.strip(), consumed
    parts: list[str] = []
    for part_key in ("first_name", "firstname", "middle_name", "middlename",
                     "last_name", "lastname"):
        v = fields.get(part_key)
        if v is None:
            v = fields.get(part_key.replace("_", ""))
        if v is not None and _is_useful(v):
            parts.append(v.strip())
    if parts:
        for ck in NAME_COMPOSITE_KEYS:
            consumed.add(ck)
        for ck in NAME_COMPONENT_KEYS:
            consumed.add(ck)
        return " ".join(parts), consumed
    return None, consumed


def _compose_address(fields: dict) -> tuple[Optional[str], set[str]]:
    consumed: set[str] = set()
    fields_lower: dict[str, dict] = {}
    for k in fields.keys():
        fields_lower[k.lower()] = {"key": k, "val": fields[k]}

    parts: list[str] = []
    country_entry = fields_lower.get("country")
    country_val = (
        country_entry["val"].strip()
        if country_entry and _is_useful(country_entry["val"])
        else None
    )
    if country_val and re.match(r"^[A-Z]{2}$", country_val, re.IGNORECASE):
        country_val = COUNTRY_EXPAND.get(country_val.upper())

    for part_key in ADDR_PART_KEYS:
        if part_key == "country":
            continue
        entry = fields_lower.get(part_key)
        if not entry or not _is_useful(entry["val"]):
            continue
        v = entry["val"].strip()
        if re.match(r"^\d{1,6}$", v):
            consumed.add(part_key)
            continue
        if len(v) < 4:
            consumed.add(part_key)
            continue
        if v == "#":
            consumed.add(part_key)
            continue
        parts.append(v)
        consumed.add(part_key)
    if country_entry:
        consumed.add("country")
    if country_val:
        parts.append(country_val)

    if not parts:
        return None, consumed
    deduped: list[str] = []
    for i, p in enumerate(parts):
        if i == 0 or p.lower() != parts[i - 1].lower():
            deduped.append(p)
    return ", ".join(deduped), consumed


def extract_profile(results: list[dict]) -> dict[str, list[str]]:
    """Walk CREDMON-shaped results and bucket field values by category."""
    buckets: dict[str, dict[str, str]] = {k: {} for k in CATEGORY_KEYS}

    def _add(cat: str, value: str) -> None:
        key = value.lower()
        if key not in buckets[cat]:
            buckets[cat][key] = value

    for entity in (results or []):
        if not isinstance(entity, dict):
            continue
        if not entity.get("found"):
            # Still surface entity_value below — mirror frontend behavior:
            # frontend only adds entity_value when entity.found loops execute
            # past the records loop. We replicate that by also gating the
            # entity_value pass on `found`.
            continue
        for src in (entity.get("sources") or []):
            for rec in (src.get("records") or []):
                fields = rec.get("fields") or {}
                if not isinstance(fields, dict):
                    continue

                composed_name, name_consumed = _compose_name(fields)
                if composed_name and _is_useful(composed_name):
                    _add("names", composed_name.strip())

                composed_addr, addr_consumed = _compose_address(fields)
                if composed_addr and _is_useful(composed_addr):
                    _add("locations", composed_addr.strip())

                for key, val in fields.items():
                    if not _is_useful(val):
                        continue
                    key_lower = key.lower()
                    if key_lower in name_consumed:
                        continue
                    if key_lower in addr_consumed or key_lower in ADDR_PART_SET:
                        continue

                    for rule in CATEGORY_RULES:
                        if rule.key in ("names", "locations"):
                            continue
                        if not rule.key_match(key):
                            continue
                        if rule.validator is not None and not rule.validator(val.strip()):
                            break  # first match wins, do not fall through
                        _add(rule.key, val.strip())
                        break

        # Surface raw entity_value for the seed identifiers, matching frontend.
        if entity.get("entity_type") == "email" and entity.get("entity_value"):
            ev = str(entity["entity_value"]).strip()
            if ev:
                _add("emails", ev)
        if entity.get("entity_type") == "phone" and entity.get("entity_value"):
            ev = str(entity["entity_value"]).strip()
            if ev:
                _add("phones", ev)

    profile: dict[str, list[str]] = {}
    for k in CATEGORY_KEYS:
        values = list(buckets[k].values())
        profile[k] = values[:PER_CATEGORY_CAP]
    return profile


# ---------------------------------------------------------------------------
# Embedded test block — `python3 -m backend.app.engines.identifier_categorizer`
# ---------------------------------------------------------------------------

def _run_tests() -> int:
    failures: list[str] = []

    def check(label: str, expected, actual) -> None:
        if expected == actual:
            print(f"  PASS  {label}")
        else:
            failures.append(f"{label}: expected {expected!r}, got {actual!r}")
            print(f"  FAIL  {label}: expected {expected!r}, got {actual!r}")

    print("categorize_field()")
    check(
        "payment_status='Active' is uncategorized",
        None,
        categorize_field("payment_status", "Active"),
    )
    check(
        "upi_id='user@paytm' -> financial",
        ("financial", "user@paytm"),
        categorize_field("upi_id", "user@paytm"),
    )
    check(
        "upi_id='DELHI HATHWAY' rejected by UPI shape",
        None,
        categorize_field("upi_id", "DELHI HATHWAY"),
    )
    check(
        "device_id='110060' rejected (no alpha)",
        None,
        categorize_field("device_id", "110060"),
    )
    check(
        "device_id='iPhone 13' -> devices",
        ("devices", "iPhone 13"),
        categorize_field("device_id", "iPhone 13"),
    )
    check(
        "most_recent_login='2024-01-15' uncategorized (os word-bounded)",
        None,
        categorize_field("most_recent_login", "2024-01-15"),
    )
    check(
        "survey_url='https://x.com/y' uncategorized (tightened accounts)",
        None,
        categorize_field("survey_url", "https://x.com/y"),
    )
    res = categorize_field("facebook_url", "https://facebook.com/abc")
    check(
        "facebook_url='https://facebook.com/abc' -> accounts",
        ("accounts", "https://facebook.com/abc"),
        res,
    )
    res = categorize_field("google_account", "android://DGtXunqz2_B11G")
    check(
        "google_account='android://DGtXunqz2_B11G' -> accounts (URI preserved)",
        ("accounts", "android://DGtXunqz2_B11G"),
        res,
    )

    # Bonus checks that mirror the spec's intent.
    check(
        "bank_name='DELHI HATHWAY' uncategorized (no plain 'bank' rule)",
        None,
        categorize_field("bank_name", "DELHI HATHWAY"),
    )
    check(
        "card_type='Private' uncategorized (no plain 'card' rule)",
        None,
        categorize_field("card_type", "Private"),
    )
    check(
        "ghost_x='abc' uncategorized (os no longer substring-matches)",
        None,
        categorize_field("ghost_x", "abc"),
    )
    check(
        "email='alice@example.com' -> emails",
        ("emails", "alice@example.com"),
        categorize_field("email", "alice@example.com"),
    )
    check(
        "phone='+91 9876543210' -> phones",
        ("phones", "+91 9876543210"),
        categorize_field("phone", "+91 9876543210"),
    )
    check(
        "ip='192.168.1.1' -> ips",
        ("ips", "192.168.1.1"),
        categorize_field("ip", "192.168.1.1"),
    )
    check(
        "pan='ABCDE1234F' -> financial",
        ("financial", "ABCDE1234F"),
        categorize_field("pan", "ABCDE1234F"),
    )
    check(
        "aadhaar='123456789012' -> financial",
        ("financial", "123456789012"),
        categorize_field("aadhaar", "123456789012"),
    )
    check(
        "ifsc='HDFC0001234' -> financial",
        ("financial", "HDFC0001234"),
        categorize_field("ifsc", "HDFC0001234"),
    )
    check(
        "dob='1990-05-12' -> dob",
        ("dob", "1990-05-12"),
        categorize_field("dob", "1990-05-12"),
    )

    print("\nextract_profile()")
    sample = [{
        "entity_type": "email",
        "entity_value": "alice@example.com",
        "found": True,
        "sources": [{
            "records": [{
                "fields": {
                    "full_name": "Alice Anderson",
                    "first_name": "Alice",
                    "last_name": "Anderson",
                    "email": "alice@example.com",
                    "phone": "+91 9876543210",
                    "ip": "192.168.1.1",
                    "city": "Mumbai",
                    "state": "Maharashtra",
                    "country": "IN",
                    "pincode": "400001",
                    "upi_id": "alice@paytm",
                    "pan": "ABCDE1234F",
                    "device_id": "iPhone 13",
                    "facebook_url": "https://facebook.com/alice",
                    "google_account": "android://DGtXunqz2_B11G",
                    "survey_url": "https://survey.example.com/q",
                    "payment_status": "Active",
                    "card_type": "Private",
                    "bank_name": "DELHI HATHWAY",
                    "dob": "1990-05-12",
                    "username": "alice_a",
                },
            }],
        }],
    }]
    profile = extract_profile(sample)

    # Every category key must be present.
    check(
        "profile has all 10 category keys",
        set(CATEGORY_KEYS),
        set(profile.keys()),
    )
    check("names contains 'Alice Anderson'", True, "Alice Anderson" in profile["names"])
    check("emails contains 'alice@example.com'", True, "alice@example.com" in profile["emails"])
    check("phones contains '+91 9876543210'", True, "+91 9876543210" in profile["phones"])
    check("ips contains '192.168.1.1'", True, "192.168.1.1" in profile["ips"])
    # Composed address should include city/state and expanded country.
    loc_str = "; ".join(profile["locations"])
    check("locations includes Mumbai", True, "Mumbai" in loc_str)
    check("locations expands IN to India", True, "India" in loc_str)
    check("financial includes UPI", True, "alice@paytm" in profile["financial"])
    check("financial includes PAN", True, "ABCDE1234F" in profile["financial"])
    check("financial excludes 'Active'", True, "Active" not in profile["financial"])
    check("financial excludes 'Private'", True, "Private" not in profile["financial"])
    check(
        "financial excludes 'DELHI HATHWAY'",
        True,
        "DELHI HATHWAY" not in profile["financial"],
    )
    check("devices includes 'iPhone 13'", True, "iPhone 13" in profile["devices"])
    check("devices excludes pincode '400001'", True, "400001" not in profile["devices"])
    check(
        "accounts includes facebook URL",
        True,
        "https://facebook.com/alice" in profile["accounts"],
    )
    check(
        "accounts includes android:// URI",
        True,
        "android://DGtXunqz2_B11G" in profile["accounts"],
    )
    check(
        "accounts excludes survey_url",
        True,
        "https://survey.example.com/q" not in profile["accounts"],
    )
    check("dob includes '1990-05-12'", True, "1990-05-12" in profile["dob"])
    check("usernames includes 'alice_a'", True, "alice_a" in profile["usernames"])

    print()
    if failures:
        print(f"{len(failures)} FAILURE(S):")
        for f in failures:
            print(f"  - {f}")
        return 1
    print("ALL TESTS PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(_run_tests())
