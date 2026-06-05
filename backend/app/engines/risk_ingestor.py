"""
Risk factor derivation from v2 search results.

Takes CREDMON breach data, FTI screening results, DARKMON results, and
optional financial / telegram / phone-intel data, produces typed factor
instances for the scoring engine.

Detection heuristics live here; scoring weights do NOT.
"""
from __future__ import annotations

import re
from collections import defaultdict
from datetime import datetime, timezone


_PASSWORD_KEYS = re.compile(r"password|passwd|pwd", re.IGNORECASE)
_FULLNAME_KEYS = {"fullname", "full_name", "name", "first_name", "last_name", "display_name", "displayname"}
_PHONE_KEYS = {"phone", "mobile", "cell", "telephone", "contact_number"}
_CITY_KEYS = {"city", "pincode", "zip", "district"}
_EMAIL_KEYS = {"email", "e-mail", "mail", "email_address", "emailaddress"}
_GOV_ID_KEYS = re.compile(r"aadhaar|aadhar|pan_number|pan_no|voter_id|passport|driving_licen|dl_number|ration_card", re.IGNORECASE)
_FINANCIAL_DATA_KEYS = re.compile(r"bank_account|account_number|card_number|credit_card|debit_card|cvv|ifsc|card_expir|account_no", re.IGNORECASE)
_HEALTH_DATA_KEYS = re.compile(r"diagnosis|patient|prescription|blood_group|medical|health|disease|treatment|hospital|doctor_name", re.IGNORECASE)
_HEALTH_COLLECTION = re.compile(r"icmr|ayush|hospital|patient|medical|health|doctor|pharma|clinic", re.IGNORECASE)
_DOB_KEYS = {"dob", "date_of_birth", "birth_date", "birthday", "dateofbirth"}
_WEAK_PASSWORDS = {
    "123456", "password", "123456789", "12345678", "12345", "1234567",
    "qwerty", "abc123", "password1", "111111", "123123", "admin",
    "letmein", "welcome", "monkey", "master", "dragon", "login",
    "princess", "iloveyou", "sunshine", "trustno1", "000000",
}
_DARKWEB_CYBER_CATEGORIES = re.compile(
    r"hack|exploit|malware|ransomware|phishing|botnet|ddos|rat\b|trojan"
    r"|keylogger|zero.?day|vulnerability|carding|skimmer|spyware|rootkit"
    r"|credential.?stuff|brute.?force|sql.?inject|xss|rce\b",
    re.IGNORECASE,
)
_FRAUD_DOMAIN_PATTERNS = re.compile(
    r"fraud|scam|fake|phish|ponzi|loan.?shark|chit.?fund|mlm|pyramid|betting|gambl",
    re.IGNORECASE,
)
_PAN_KEYS = re.compile(r"pan_number|pan_no|pan$|pan_card", re.IGNORECASE)
_PAN_FORMAT = re.compile(r"^[A-Z]{5}\d{4}[A-Z]$")

_HIGH_RISK_COUNTRIES = {
    "iran", "north korea", "dprk", "syria", "cuba", "sudan", "south sudan",
    "myanmar", "yemen", "afghanistan", "somalia", "libya", "eritrea",
    "iraq", "central african republic", "congo", "venezuela",
}

_HIGH_RISK_NIC_CODES = {
    "64", "65", "66",   # NBFC / Financial services / Insurance
    "92",               # Gambling and betting
    "68",               # Real estate
    "46110",            # Wholesale agents (common in invoice fraud)
}

_MCA_DISSOLVED_STATUSES = re.compile(
    r"dissolved|struck.?off|liquidated|defunct|dormant|not available",
    re.IGNORECASE,
)
_MCA_STRIKE_OFF_STATUS = re.compile(r"under.?(?:process|strike)", re.IGNORECASE)

_GOV_DOMAINS = {
    "gov.in", "nic.in", "mil.in", "police.gov.in", "eci.gov.in",
    "rbi.org.in", "sebi.gov.in", "irda.gov.in",
}

_FREE_EMAIL_DOMAINS = {
    "gmail.com", "yahoo.com", "yahoo.co.in", "yahoo.in",
    "outlook.com", "hotmail.com", "live.com", "msn.com",
    "aol.com", "mail.com", "protonmail.com", "proton.me",
    "yandex.com", "icloud.com", "me.com",
    "rediffmail.com", "zoho.com", "gmx.com", "tutanota.com",
    "mail.ru", "inbox.com", "fastmail.com",
}

_CRIME_VIOLENT = re.compile(
    r"302|307|304[^B]|326|392|395|397|murder|homicide|attempt.to.murder"
    r"|grievous.hurt|assault|robbery|dacoity|kidnap|abduct",
    re.IGNORECASE,
)
_CRIME_SEXUAL = re.compile(
    r"376|354|509|pocso|sexual|rape|molest|outraging.modesty",
    re.IGNORECASE,
)
_CRIME_NDPS = re.compile(
    r"ndps|narcotic|drugs?.act|psychotropic|controlled.substance|ganja|cannabis|opium|cocaine|heroin",
    re.IGNORECASE,
)
_CRIME_UAPA = re.compile(
    r"uapa|unlawful.activities|terror(?:ist|ism)|national.security.act|nsa",
    re.IGNORECASE,
)
_CRIME_PMLA = re.compile(
    r"pmla|money.launder|prevention.of.money|proceeds.of.crime|enforcement.directorate",
    re.IGNORECASE,
)
_CRIME_CORRUPTION = re.compile(
    r"corruption|prevention.of.corruption|briber|disproportionate.assets|pc.act",
    re.IGNORECASE,
)
_CRIME_DV = re.compile(
    r"domestic.violence|dv.act|protection.of.women|cruelty.by.husband",
    re.IGNORECASE,
)
_CRIME_DOWRY = re.compile(
    r"498.?a|dowry|304.?b|stridhan|dowry.death|dowry.prohibition",
    re.IGNORECASE,
)
_WC_GASP = re.compile(
    r"government|state.owned|soe|state.enterprise|public.sector",
    re.IGNORECASE,
)
_SENSITIVE_BREACH = re.compile(
    r"adult|porn|escort|affair|ashley.?madison|dating|hookup|fetish|cam.?site"
    r"|strip|xxx|onlyfans|fling|illicit.?encounters|cheating",
    re.IGNORECASE,
)


def _is_plaintext(val: str) -> bool:
    if not val or len(val) > 30:
        return False
    if "$" in val:
        return False
    if len(val) in (32, 40, 64) and all(c in "0123456789abcdef" for c in val.lower()):
        return False
    return True


def _normalize_name(name: str) -> str:
    return " ".join(name.lower().strip().split())


def _names_are_independent(a: str, b: str) -> bool:
    return a not in b and b not in a


def _email_domain(email: str) -> str:
    parts = email.lower().strip().split("@")
    return parts[1] if len(parts) == 2 else ""


def _is_gov_email(domain: str) -> bool:
    if not domain:
        return False
    for gd in _GOV_DOMAINS:
        if domain == gd or domain.endswith("." + gd):
            return True
    return False


def _is_corporate_email(domain: str) -> bool:
    if not domain or domain in _FREE_EMAIL_DOMAINS:
        return False
    if _is_gov_email(domain):
        return False
    return "." in domain


def _parse_breach_year(date_str: str) -> int | None:
    if not date_str or date_str.lower() in ("unknown", "n/a", ""):
        return None
    for fmt in ("%Y-%m-%d", "%Y/%m/%d", "%d-%m-%Y", "%B %Y", "%Y"):
        try:
            return datetime.strptime(date_str.strip()[:10], fmt).year
        except (ValueError, TypeError):
            continue
    m = re.search(r"20[12]\d", date_str)
    if m:
        return int(m.group(0))
    return None


def derive_factors(
    search_results: list[dict],
    fti_results: list[dict],
    darkmon_results: list[dict],
    canonical_name: str | None = None,
    financial_results: list[dict] | None = None,
    telegram_results: list[dict] | None = None,
    phone_intel_results: list[dict] | None = None,
    ecourts_results: list[dict] | None = None,
    mca_results: list[dict] | None = None,
) -> list[dict]:
    factors: dict[str, dict] = {}

    _derive_credmon_factors(search_results, factors)
    _derive_fti_factors(fti_results, canonical_name, factors)
    _derive_darkmon_factors(darkmon_results, factors)
    _derive_financial_factors(financial_results, factors)
    _derive_telegram_factors(telegram_results, factors)
    _derive_phone_intel_factors(phone_intel_results, factors)
    _derive_ecourts_factors(ecourts_results, canonical_name, factors)
    _derive_mca_factors(mca_results, factors)
    _derive_cross_source_factors(factors, darkmon_results, financial_results, telegram_results, ecourts_results, mca_results)

    return sorted(factors.values(), key=lambda f: f["factor_id"])


# ── CREDMON breach factors ──────────────────────────────────────

def _derive_credmon_factors(results: list[dict], factors: dict[str, dict]) -> None:
    if not results:
        return

    plaintext_count = 0
    malware_log_count = 0
    password_by_collection: dict[str, list[str]] = defaultdict(list)
    names_by_collection: dict[str, set[str]] = defaultdict(set)
    phones: set[str] = set()
    city_pincode_by_collection: dict[str, set[str]] = defaultdict(set)
    has_employer_from_kyc = False
    all_collections: set[str] = set()
    emails_seen: set[str] = set()
    recent_breach_count = 0
    sensitive_breach_count = 0
    current_year = datetime.now(timezone.utc).year
    gov_id_count = 0
    financial_data_count = 0
    health_data_count = 0
    dob_count = 0
    weak_password_count = 0
    pans_seen: set[str] = set()

    for entity in results:
        if not entity.get("found"):
            continue

        if entity.get("entity_type") == "phone" and entity.get("entity_value"):
            phones.add(entity["entity_value"])
        for p in entity.get("new_phones_found", []):
            phones.add(p)

        if entity.get("entity_type") == "email" and entity.get("entity_value"):
            emails_seen.add(entity["entity_value"].lower())

        for source in entity.get("sources", []):
            collection = source.get("collection", "")
            col_lower = collection.lower()
            is_malware = "malware_log" in col_lower
            is_kyc = col_lower.startswith("knowmycustomer")
            all_collections.add(collection)

            if _SENSITIVE_BREACH.search(col_lower) or _SENSITIVE_BREACH.search(source.get("leak_name", "")):
                sensitive_breach_count += 1

            breach_date = source.get("breach_date", "")
            breach_year = _parse_breach_year(breach_date)
            if breach_year and (current_year - breach_year) <= 1:
                recent_breach_count += 1

            for record in source.get("records", []):
                fields = record.get("fields", {})
                for key, val in fields.items():
                    if not val or not isinstance(val, str):
                        continue
                    kl = key.lower()

                    if _PASSWORD_KEYS.search(kl):
                        if _is_plaintext(val):
                            plaintext_count += 1
                            password_by_collection[collection].append(val)
                        if is_malware:
                            malware_log_count += 1

                    if kl in _FULLNAME_KEYS and len(val.strip()) > 3 and "@" not in val and not val.strip().isdigit():
                        names_by_collection[collection].add(_normalize_name(val))

                    if kl in _PHONE_KEYS and re.search(r"\d{7,}", val.replace(" ", "")):
                        phones.add(val.strip())

                    if kl in _CITY_KEYS and len(val.strip()) > 2:
                        city_pincode_by_collection[collection].add(val.strip().lower())

                    if is_kyc and kl in ("company_name", "employer", "company"):
                        if val.strip():
                            has_employer_from_kyc = True

                    if kl in _EMAIL_KEYS and "@" in val:
                        emails_seen.add(val.strip().lower())

                    if _GOV_ID_KEYS.search(kl) and len(val.strip()) >= 4:
                        gov_id_count += 1

                    if _PAN_KEYS.search(kl):
                        candidate = val.strip().upper()
                        if _PAN_FORMAT.match(candidate):
                            pans_seen.add(candidate)

                    if _FINANCIAL_DATA_KEYS.search(kl) and len(val.strip()) >= 4:
                        financial_data_count += 1

                    if _HEALTH_DATA_KEYS.search(kl) and len(val.strip()) >= 2:
                        health_data_count += 1

                    if kl in _DOB_KEYS and len(val.strip()) >= 6:
                        dob_count += 1

                    if _PASSWORD_KEYS.search(kl) and _is_plaintext(val) and val.lower().strip() in _WEAK_PASSWORDS:
                        weak_password_count += 1

            if _HEALTH_COLLECTION.search(collection):
                health_data_count += 1

    if plaintext_count > 0:
        factors["PlaintextPasswordExposure"] = {
            "factor_id": "PlaintextPasswordExposure",
            "confidence": 0.2,
            "count": plaintext_count,
        }

    all_plaintexts: dict[str, set[str]] = defaultdict(set)
    for col, passwords in password_by_collection.items():
        for pw in passwords:
            all_plaintexts[pw].add(col)
    reused = sum(1 for pw, cols in all_plaintexts.items() if len(cols) >= 2)
    if reused > 0:
        factors["ReusedCredentialAcrossBreaches"] = {
            "factor_id": "ReusedCredentialAcrossBreaches",
            "confidence": 0.2,
            "count": reused,
        }

    if malware_log_count > 0:
        factors["ActiveCredentialExposure"] = {
            "factor_id": "ActiveCredentialExposure",
            "confidence": 0.2,
            "count": malware_log_count,
        }

    all_names: set[str] = set()
    for names in names_by_collection.values():
        all_names.update(names)
    independent_names = []
    for name in sorted(all_names):
        if all(_names_are_independent(name, existing) for existing in independent_names):
            independent_names.append(name)
    if len(independent_names) >= 2:
        factors["AliasIdentity"] = {
            "factor_id": "AliasIdentity",
            "confidence": 0.2,
            "count": len(independent_names),
        }

    if len(phones) >= 2:
        factors["UnreportedSecondaryMobile"] = {
            "factor_id": "UnreportedSecondaryMobile",
            "confidence": 0.2,
            "count": len(phones),
        }

    all_locations: set[str] = set()
    for locs in city_pincode_by_collection.values():
        all_locations.update(locs)
    if len(all_locations) >= 2:
        factors["AddressInconsistency"] = {
            "factor_id": "AddressInconsistency",
            "confidence": 0.2,
            "count": len(all_locations),
        }

    # Mitigating: IdentityCorroborated — same name in 3+ collections
    name_collection_count: dict[str, int] = defaultdict(int)
    for col, names in names_by_collection.items():
        for name in names:
            name_collection_count[name] += 1
    if any(count >= 3 for count in name_collection_count.values()):
        factors["IdentityCorroborated"] = {
            "factor_id": "IdentityCorroborated",
            "confidence": 0.2,
            "count": sum(1 for c in name_collection_count.values() if c >= 3),
        }

    # Mitigating: StableLocationFootprint — same city/pincode in 2+ collections
    location_collection_count: dict[str, int] = defaultdict(int)
    for col, locs in city_pincode_by_collection.items():
        for loc in locs:
            location_collection_count[loc] += 1
    if any(count >= 2 for count in location_collection_count.values()):
        factors["StableLocationFootprint"] = {
            "factor_id": "StableLocationFootprint",
            "confidence": 0.2,
            "count": sum(1 for c in location_collection_count.values() if c >= 2),
        }

    if has_employer_from_kyc:
        factors["EmployerVerified"] = {
            "factor_id": "EmployerVerified",
            "confidence": 0.2,
            "count": 1,
        }

    # MassBreachExposure — found in 5+ distinct breach collections
    if len(all_collections) >= 5:
        factors["MassBreachExposure"] = {
            "factor_id": "MassBreachExposure",
            "confidence": 0.2,
            "count": len(all_collections),
        }

    # BreachRecencyRisk — credentials in breach dated within last 12 months
    if recent_breach_count > 0:
        factors["BreachRecencyRisk"] = {
            "factor_id": "BreachRecencyRisk",
            "confidence": 0.2,
            "count": recent_breach_count,
        }

    # Email domain classification
    gov_email_count = 0
    corp_email_count = 0
    for email in emails_seen:
        domain = _email_domain(email)
        if _is_gov_email(domain):
            gov_email_count += 1
        elif _is_corporate_email(domain):
            corp_email_count += 1

    if gov_email_count > 0:
        factors["GovernmentEmailExposure"] = {
            "factor_id": "GovernmentEmailExposure",
            "confidence": 0.2,
            "count": gov_email_count,
        }

    if corp_email_count > 0:
        factors["CorporateEmailExposure"] = {
            "factor_id": "CorporateEmailExposure",
            "confidence": 0.2,
            "count": corp_email_count,
        }

    if sensitive_breach_count > 0:
        factors["AdverseCharacterSignal"] = {
            "factor_id": "AdverseCharacterSignal",
            "confidence": 0.2,
            "count": sensitive_breach_count,
        }

    if gov_id_count > 0:
        factors["GovernmentIDExposure"] = {
            "factor_id": "GovernmentIDExposure",
            "confidence": 0.2,
            "count": gov_id_count,
        }

    if financial_data_count > 0:
        factors["FinancialDataInBreach"] = {
            "factor_id": "FinancialDataInBreach",
            "confidence": 0.2,
            "count": financial_data_count,
        }

    if health_data_count > 0:
        factors["HealthDataExposure"] = {
            "factor_id": "HealthDataExposure",
            "confidence": 0.2,
            "count": health_data_count,
        }

    if dob_count > 0:
        factors["DateOfBirthExposure"] = {
            "factor_id": "DateOfBirthExposure",
            "confidence": 0.2,
            "count": dob_count,
        }

    if weak_password_count > 0:
        factors["WeakPasswordPattern"] = {
            "factor_id": "WeakPasswordPattern",
            "confidence": 0.2,
            "count": weak_password_count,
        }

    if len(pans_seen) >= 2:
        factors["MultiplePANSuspicion"] = {
            "factor_id": "MultiplePANSuspicion",
            "confidence": 0.2,
            "count": len(pans_seen),
        }


# ── FTI screening factors ──────────────────────────────────────

def _classify_crimedata(category_text: str) -> list[str]:
    """Return specific factor IDs based on crime category keywords."""
    hits = []
    if _CRIME_VIOLENT.search(category_text):
        hits.append("PendingCriminalMatter_Violent")
    if _CRIME_SEXUAL.search(category_text):
        hits.append("PendingCriminalMatter_Sexual")
    if _CRIME_NDPS.search(category_text):
        hits.append("NDPSMatter_Pending")
    if _CRIME_UAPA.search(category_text):
        hits.append("UAPAMatter")
    if _CRIME_PMLA.search(category_text):
        hits.append("PMLAMatter_Pending")
    if _CRIME_CORRUPTION.search(category_text):
        hits.append("CorruptionMatter")
    if _CRIME_DV.search(category_text):
        hits.append("DomesticViolenceMatter")
    if _CRIME_DOWRY.search(category_text):
        hits.append("DowryHarassmentMatter")
    return hits


def _derive_fti_factors(fti_results: list[dict], canonical_name: str | None, factors: dict[str, dict]) -> None:
    if not fti_results:
        return

    wc_hits = [r for r in fti_results if r.get("query_type") == "worldcheck" and r.get("found")]
    cd_hits = [r for r in fti_results if r.get("query_type") == "crimedata" and r.get("found")]

    if wc_hits:
        factors["SanctionsMatch"] = {
            "factor_id": "SanctionsMatch",
            "confidence": 0.6,
            "count": len(wc_hits),
        }
        for hit in wc_hits:
            for result in hit.get("results", []):
                list_type = (
                    result.get("list_type")
                    or result.get("category")
                    or result.get("EXTRA_DATA", {}).get("category")
                    or ""
                ).lower()
                keywords = (result.get("EXTRA_DATA", {}).get("keywords") or "").lower()
                combined_wc = list_type + " " + keywords

                if "pep" in combined_wc or "political" in combined_wc:
                    factors.setdefault("PEPStatus", {
                        "factor_id": "PEPStatus",
                        "confidence": 0.6,
                        "count": 1,
                    })

                if _WC_GASP.search(combined_wc):
                    factors.setdefault("GlobalAdverseScreeningStatus", {
                        "factor_id": "GlobalAdverseScreeningStatus",
                        "confidence": 0.6,
                        "count": 1,
                    })

                linked_to = result.get("EXTRA_DATA", {}).get("linked_to")
                if linked_to:
                    linked_list = linked_to if isinstance(linked_to, list) else [linked_to]
                    if linked_list:
                        factors.setdefault("SanctionedEntityNetwork", {
                            "factor_id": "SanctionedEntityNetwork",
                            "confidence": 0.6,
                            "count": len(linked_list),
                        })

                country = (result.get("country") or "").strip().lower()
                if country and country in _HIGH_RISK_COUNTRIES:
                    factors.setdefault("HighRiskCountryNexus", {
                        "factor_id": "HighRiskCountryNexus",
                        "confidence": 0.6,
                        "count": 0,
                    })
                    factors["HighRiskCountryNexus"]["count"] += 1

                entity_type = (
                    result.get("EXTRA_DATA", {}).get("entity_type") or ""
                ).lower()
                if "organisation" in entity_type or "organization" in entity_type or "entity" in entity_type:
                    factors.setdefault("EntityTypeOrganization", {
                        "factor_id": "EntityTypeOrganization",
                        "confidence": 0.6,
                        "count": 0,
                    })
                    factors["EntityTypeOrganization"]["count"] += 1

    if cd_hits:
        total_cd_results = 0
        classified_any = False
        linked_entity_count = 0

        for hit in cd_hits:
            for result in hit.get("results", []):
                total_cd_results += 1
                src = result.get("_source", result)
                category_text = str(src.get("category", ""))
                specific_factors = _classify_crimedata(category_text)
                for fid in specific_factors:
                    classified_any = True
                    if fid in factors:
                        factors[fid]["count"] += 1
                    else:
                        factors[fid] = {
                            "factor_id": fid,
                            "confidence": 0.6,
                            "count": 1,
                        }

                cd_country = str(src.get("country_name", "")).strip().lower()
                if cd_country and cd_country in _HIGH_RISK_COUNTRIES:
                    factors.setdefault("HighRiskCountryNexus", {
                        "factor_id": "HighRiskCountryNexus",
                        "confidence": 0.6,
                        "count": 0,
                    })
                    factors["HighRiskCountryNexus"]["count"] += 1

                detail_info = src.get("detail_info", {}) or {}
                linked_to = detail_info.get("linked_to")
                if linked_to:
                    linked_list = linked_to if isinstance(linked_to, list) else [linked_to]
                    linked_entity_count += len(linked_list)

        if not classified_any:
            factors["PendingCriminalMatter_General"] = {
                "factor_id": "PendingCriminalMatter_General",
                "confidence": 0.6,
                "count": total_cd_results,
            }

        if linked_entity_count > 0:
            factors["CriminalNetworkProximity"] = {
                "factor_id": "CriminalNetworkProximity",
                "confidence": 0.6,
                "count": linked_entity_count,
            }

    # Mitigating: CleanLitigationScreen — both empty for canonical name only
    if canonical_name:
        canon_lower = canonical_name.strip().lower()
        canon_cd_empty = True
        canon_wc_empty = True
        canon_checked = False
        for r in fti_results:
            if (r.get("entity_value") or "").strip().lower() == canon_lower:
                canon_checked = True
                if r.get("query_type") == "crimedata" and r.get("found"):
                    canon_cd_empty = False
                if r.get("query_type") == "worldcheck" and r.get("found"):
                    canon_wc_empty = False

        if canon_checked and canon_cd_empty and canon_wc_empty:
            factors["CleanLitigationScreen"] = {
                "factor_id": "CleanLitigationScreen",
                "confidence": 0.6,
                "count": 1,
            }


# ── DARKMON factors ─────────────────────────────────────────────

def _derive_darkmon_factors(darkmon_results: list[dict], factors: dict[str, dict]) -> None:
    if not darkmon_results:
        return

    matches = [r for r in darkmon_results if r.get("found")]
    if not matches:
        return

    total_posts = sum(
        len(r.get("threads", [])) + len(r.get("posts", []))
        for r in matches
    )
    factors["AdverseMediaHit"] = {
        "factor_id": "AdverseMediaHit",
        "confidence": 0.6,
        "count": max(total_posts, len(matches)),
    }

    factors["UndergroundForumAuthor"] = {
        "factor_id": "UndergroundForumAuthor",
        "confidence": 0.6,
        "count": len(matches),
    }

    if total_posts >= 10:
        factors["UndergroundHighActivity"] = {
            "factor_id": "UndergroundHighActivity",
            "confidence": 0.6,
            "count": total_posts,
        }

    total_views = 0
    total_replies = 0
    forums_seen: set[str] = set()
    has_wallet_balance = False
    has_cyber_threat = False
    has_recent_post = False
    contact_count = 0
    vendor_detected = False
    max_active_days = 0
    now_ts = datetime.now(timezone.utc)

    for r in matches:
        profile = r.get("author_profile") or {}
        target_countries = profile.get("target_countries") or []
        if isinstance(target_countries, list):
            if any("india" in str(c).lower() for c in target_countries):
                factors.setdefault("UndergroundRegionalTargeting", {
                    "factor_id": "UndergroundRegionalTargeting",
                    "confidence": 0.6,
                    "count": 1,
                })

        active_days = profile.get("no_of_active_days") or 0
        if isinstance(active_days, (int, float)) and active_days > max_active_days:
            max_active_days = active_days

        for thread in r.get("threads", []):
            cats = thread.get("thread_categories") or []
            tags = thread.get("thread_tags") or []
            combined = " ".join(str(x) for x in cats + tags).lower()
            if any(kw in combined for kw in ("drug", "narcotic", "pharma", "vendor", "market")):
                factors.setdefault("DrugMarketplaceLinkage", {
                    "factor_id": "DrugMarketplaceLinkage",
                    "confidence": 0.6,
                    "count": 1,
                })

            if _DARKWEB_CYBER_CATEGORIES.search(combined):
                has_cyber_threat = True

            total_views += int(thread.get("thread_views") or 0)
            total_replies += int(thread.get("thread_replies") or 0)

            forum = thread.get("forum_name")
            if forum:
                forums_seen.add(str(forum).lower())

            author_type = str(thread.get("author_type") or "").lower()
            author_level = str(thread.get("author_level") or "").lower()
            if any(kw in author_type for kw in ("vendor", "trusted", "verified")):
                vendor_detected = True
            if any(kw in author_level for kw in ("vendor", "trusted", "verified")):
                vendor_detected = True

            posted_dt = thread.get("posted_datetime")
            if posted_dt:
                try:
                    if isinstance(posted_dt, str):
                        dt = datetime.fromisoformat(posted_dt.replace("Z", "+00:00"))
                    elif isinstance(posted_dt, datetime):
                        dt = posted_dt if posted_dt.tzinfo else posted_dt.replace(tzinfo=timezone.utc)
                    else:
                        dt = None
                    if dt and (now_ts - dt).days <= 90:
                        has_recent_post = True
                except (ValueError, TypeError):
                    pass

            extracted = thread.get("extracted_info") or {}
            contact_count += len(extracted.get("email_ids") or [])
            contact_count += len(extracted.get("mobile_numbers") or [])
            contact_count += len(extracted.get("onions") or [])

        for post in r.get("posts", []):
            wallet_bal = post.get("author_wallet_balance")
            if wallet_bal and str(wallet_bal).strip() not in ("", "0", "0.0", "0.00"):
                has_wallet_balance = True

            forum = post.get("forum_name")
            if forum:
                forums_seen.add(str(forum).lower())

            commented_dt = post.get("commented_datetime")
            if commented_dt:
                try:
                    if isinstance(commented_dt, str):
                        dt = datetime.fromisoformat(commented_dt.replace("Z", "+00:00"))
                    elif isinstance(commented_dt, datetime):
                        dt = commented_dt if commented_dt.tzinfo else commented_dt.replace(tzinfo=timezone.utc)
                    else:
                        dt = None
                    if dt and (now_ts - dt).days <= 90:
                        has_recent_post = True
                except (ValueError, TypeError):
                    pass

            extracted = post.get("extracted_info") or {}
            contact_count += len(extracted.get("email_ids") or [])
            contact_count += len(extracted.get("mobile_numbers") or [])
            contact_count += len(extracted.get("onions") or [])

    if vendor_detected:
        factors["UndergroundVendorStatus"] = {
            "factor_id": "UndergroundVendorStatus",
            "confidence": 0.6,
            "count": 1,
        }

    if has_recent_post:
        factors["UndergroundRecentActivity"] = {
            "factor_id": "UndergroundRecentActivity",
            "confidence": 0.6,
            "count": 1,
        }

    if max_active_days >= 180:
        factors["UndergroundLongTermPresence"] = {
            "factor_id": "UndergroundLongTermPresence",
            "confidence": 0.6,
            "count": max_active_days,
        }

    if total_views >= 1000 or total_replies >= 50:
        factors["UndergroundHighInfluence"] = {
            "factor_id": "UndergroundHighInfluence",
            "confidence": 0.6,
            "count": total_views,
        }

    if has_wallet_balance:
        factors["UndergroundCryptoWallet"] = {
            "factor_id": "UndergroundCryptoWallet",
            "confidence": 0.6,
            "count": 1,
        }

    if has_cyber_threat:
        factors["UndergroundCyberThreats"] = {
            "factor_id": "UndergroundCyberThreats",
            "confidence": 0.6,
            "count": 1,
        }

    if contact_count > 0:
        factors["UndergroundContactExposure"] = {
            "factor_id": "UndergroundContactExposure",
            "confidence": 0.6,
            "count": contact_count,
        }

    if len(forums_seen) >= 3:
        factors["UndergroundForumDiversity"] = {
            "factor_id": "UndergroundForumDiversity",
            "confidence": 0.6,
            "count": len(forums_seen),
        }


# ── Financial factors ───────────────────────────────────────────

def _derive_financial_factors(financial_results: list[dict] | None, factors: dict[str, dict]) -> None:
    if not financial_results:
        return

    fraud_count = 0
    betting_count = 0
    crypto_ex_count = 0
    bank_flag_count = 0
    crypto_wallet_count = 0
    fraud_domain_count = 0
    high_value_crypto_count = 0
    upi_per_phone: dict[str, int] = defaultdict(int)
    recently_created_upi_count = 0
    crypto_tx_count = 0

    for entry in financial_results:
        result_type = entry.get("type", "")
        phone = entry.get("phone", "")

        if result_type == "upi":
            upi_count_for_phone = len(entry.get("records", []))
            if phone:
                upi_per_phone[phone] += upi_count_for_phone
            for rec in entry.get("records", []):
                classification = (rec.get("clasification") or rec.get("classification") or "").upper()
                if classification == "FRAUD":
                    fraud_count += 1
                elif classification == "BETTING_SITE":
                    betting_count += 1
                elif classification == "CRYPTO_EXCHANGE":
                    crypto_ex_count += 1

                site = str(rec.get("site") or "").lower()
                if site and _FRAUD_DOMAIN_PATTERNS.search(site):
                    fraud_domain_count += 1

                created_at = rec.get("created_at")
                if created_at:
                    try:
                        if isinstance(created_at, str):
                            created_dt = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
                        elif isinstance(created_at, datetime):
                            created_dt = created_at if created_at.tzinfo else created_at.replace(tzinfo=timezone.utc)
                        else:
                            created_dt = None
                        if created_dt and (datetime.now(timezone.utc) - created_dt).days <= 90:
                            recently_created_upi_count += 1
                    except (ValueError, TypeError):
                        pass

        elif result_type == "bank":
            bank_flag_count += len(entry.get("records", []))

        elif result_type == "crypto":
            for rec in entry.get("records", []):
                crypto_wallet_count += 1
                crypto_tx_count += 1
                amount_usd = rec.get("amount_usd")
                if amount_usd:
                    try:
                        val = float(str(amount_usd).replace(",", ""))
                        if val >= 10000:
                            high_value_crypto_count += 1
                    except (ValueError, TypeError):
                        pass

    if fraud_count > 0:
        factors["FraudLinkedPaymentAccount"] = {
            "factor_id": "FraudLinkedPaymentAccount",
            "confidence": 0.6,
            "count": fraud_count,
        }
    if betting_count > 0:
        factors["BettingSiteLinkedPayment"] = {
            "factor_id": "BettingSiteLinkedPayment",
            "confidence": 0.6,
            "count": betting_count,
        }
    if crypto_ex_count > 0:
        factors["CryptoExchangeLinkedPayment"] = {
            "factor_id": "CryptoExchangeLinkedPayment",
            "confidence": 0.6,
            "count": crypto_ex_count,
        }
    if bank_flag_count > 0:
        factors["FlaggedBankAccount"] = {
            "factor_id": "FlaggedBankAccount",
            "confidence": 0.6,
            "count": bank_flag_count,
        }
    if crypto_wallet_count > 0:
        factors["CryptoWalletExposure"] = {
            "factor_id": "CryptoWalletExposure",
            "confidence": 0.6,
            "count": crypto_wallet_count,
        }
    if fraud_domain_count > 0:
        factors["FraudDomainLinkedPayment"] = {
            "factor_id": "FraudDomainLinkedPayment",
            "confidence": 0.6,
            "count": fraud_domain_count,
        }
    if high_value_crypto_count > 0:
        factors["HighValueCryptoTransaction"] = {
            "factor_id": "HighValueCryptoTransaction",
            "confidence": 0.6,
            "count": high_value_crypto_count,
        }
    multi_upi_phones = sum(1 for c in upi_per_phone.values() if c >= 3)
    if multi_upi_phones > 0:
        factors["MultiplePaymentAccountsPerPhone"] = {
            "factor_id": "MultiplePaymentAccountsPerPhone",
            "confidence": 0.6,
            "count": multi_upi_phones,
        }
    if recently_created_upi_count > 0:
        factors["PaymentAccountRecentlyCreated"] = {
            "factor_id": "PaymentAccountRecentlyCreated",
            "confidence": 0.6,
            "count": recently_created_upi_count,
        }
    if crypto_tx_count >= 10:
        factors["CryptoHighFrequencyTrader"] = {
            "factor_id": "CryptoHighFrequencyTrader",
            "confidence": 0.6,
            "count": crypto_tx_count,
        }


# ── Telegram factors ───────────────────────────────────────────

def _derive_telegram_factors(telegram_results: list[dict] | None, factors: dict[str, dict]) -> None:
    if not telegram_results:
        return

    total_mentions = 0
    total_groups = 0

    for entry in telegram_results:
        if not entry.get("found"):
            continue
        total_mentions += entry.get("total_mentions", 0)
        total_groups += entry.get("unique_groups", 0)

    if total_mentions > 0:
        factors["MessagingGroupMention"] = {
            "factor_id": "MessagingGroupMention",
            "confidence": 0.6,
            "count": total_mentions,
        }

    if total_groups >= 5 or total_mentions >= 20:
        factors["MessagingHighExposure"] = {
            "factor_id": "MessagingHighExposure",
            "confidence": 0.6,
            "count": total_groups,
        }


# ── I4C phone intelligence factors ─────────────────────────────

def _derive_phone_intel_factors(phone_intel_results: list[dict] | None, factors: dict[str, dict]) -> None:
    if not phone_intel_results:
        return

    flagged_count = sum(1 for r in phone_intel_results if r.get("found"))
    if flagged_count > 0:
        factors["PhoneFraudDatabaseFlag"] = {
            "factor_id": "PhoneFraudDatabaseFlag",
            "confidence": 0.6,
            "count": flagged_count,
        }


# ── eCourts litigation factors ─────────────────────────────────

_CRIMINAL_CASE_TYPES = re.compile(
    r"CRL|CRLP|CRLMC|CRLA|CRLR|CRA|BAIL|FIR|SESSIONS|SC|CC\b|GR\b|CR\b",
    re.IGNORECASE,
)
_CIVIL_CASE_TYPES = re.compile(
    r"CS\b|CMA|RFA|RSA|SA\b|AS\b|OS\b|TS\b|RCA|CRP|CIVIL|CMP",
    re.IGNORECASE,
)
_FAMILY_CASE_TYPES = re.compile(
    r"HMA|GUARDIANSHIP|FAMILY|DV\b|MAINTENANCE|RESTITUTION|DIVORCE|CUSTODY",
    re.IGNORECASE,
)
_CONSUMER_CASE_TYPES = re.compile(
    r"CONSUMER|CC\s*\d|CONSTAPT|CDRC|NCDRC|SCDRC|DCDRC",
    re.IGNORECASE,
)
_LABOR_CASE_TYPES = re.compile(
    r"LABOR|LABOUR|ID\b|INDUSTRIAL|WC\b|WORKMEN|ESI\b|EPF\b|PF\b",
    re.IGNORECASE,
)
_INSOLVENCY_CASE_TYPES = re.compile(
    r"IBC|NCLT|NCLAT|INSOLVENCY|BANKRUPTCY|CP\s*\(IB\)|IA\s*\(IBC\)|CIRP",
    re.IGNORECASE,
)
_COMMERCIAL_CASE_TYPES = re.compile(
    r"COMMERCIAL|COM|ARBITRATION|ARB|IP\s*SUIT|TRADE\s*MARK",
    re.IGNORECASE,
)
_LAND_CASE_TYPES = re.compile(
    r"LAND|PROPERTY|PARTITION|TITLE|SPECIFIC\s*PERFORMANCE|INJUNCTION"
    r"|EVICTION|RENT|LEASE|MORTGAGE",
    re.IGNORECASE,
)
_MV_ACT = re.compile(r"motor.vehicle|MV.act|MACT|138.*NI|138.*negotiable", re.IGNORECASE)
_NI_ACT_138 = re.compile(r"138.*NI|negotiable.instrument|cheque.bounce|cheque.dishonour|sec.*138", re.IGNORECASE)
_HC_COURT_PREFIX = re.compile(r"^[A-Z]{2}HC|HIGH\s*COURT", re.IGNORECASE)
_IPC_SECTIONS_CRIMINAL = re.compile(r"\b(302|304|307|376|354|420|406|419|468|471|120.?B)\b")

_ECOURTS_ACT_NDPS = re.compile(r"ndps|narcotic|drugs?.act", re.IGNORECASE)
_ECOURTS_ACT_UAPA = re.compile(r"uapa|unlawful.activities|terror", re.IGNORECASE)
_ECOURTS_ACT_PMLA = re.compile(r"pmla|money.launder|proceeds.of.crime", re.IGNORECASE)
_ECOURTS_ACT_PC = re.compile(r"prevention.of.corruption|pc.act|briber|disproportionate", re.IGNORECASE)
_ECOURTS_ACT_DV = re.compile(r"domestic.violence|protection.of.women|dv.act", re.IGNORECASE)
_ECOURTS_ACT_DOWRY = re.compile(r"498.?a|dowry|304.?b|stridhan", re.IGNORECASE)
_ECOURTS_ACT_POCSO = re.compile(r"pocso|protection.of.children", re.IGNORECASE)
_ECOURTS_ACT_SC_ST = re.compile(r"sc.?st|scheduled.caste|atrocit", re.IGNORECASE)


def _subject_is_respondent(case: dict, canonical_name: str | None) -> bool:
    if not canonical_name:
        return False
    canon_lower = canonical_name.strip().lower()
    canon_tokens = set(canon_lower.split())
    for resp in (case.get("respondents") or []):
        resp_lower = resp.strip().lower()
        if canon_lower in resp_lower or resp_lower in canon_lower:
            return True
        resp_tokens = set(resp_lower.split())
        if len(canon_tokens & resp_tokens) >= 2:
            return True
    return False


def _subject_is_petitioner(case: dict, canonical_name: str | None) -> bool:
    if not canonical_name:
        return False
    canon_lower = canonical_name.strip().lower()
    canon_tokens = set(canon_lower.split())
    for pet in (case.get("petitioners") or []):
        pet_lower = pet.strip().lower()
        if canon_lower in pet_lower or pet_lower in canon_lower:
            return True
        pet_tokens = set(pet_lower.split())
        if len(canon_tokens & pet_tokens) >= 2:
            return True
    return False


def _is_high_court(case: dict) -> bool:
    court = case.get("court") or {}
    code = court.get("courtComplexCode") or case.get("courtCode") or ""
    name = court.get("courtComplexName") or ""
    return bool(_HC_COURT_PREFIX.search(code) or _HC_COURT_PREFIX.search(name))


def _acts_text(case: dict) -> str:
    acts = case.get("actsAndSections") or []
    if isinstance(acts, list):
        parts = []
        for a in acts:
            if isinstance(a, dict):
                parts.append(f"{a.get('actName', '')} {a.get('sectionName', '')}")
            elif isinstance(a, str):
                parts.append(a)
        return " ".join(parts)
    return str(acts)


def _case_year(case: dict) -> int | None:
    for field in ("filingDate", "registrationDate"):
        val = case.get(field) or ""
        m = re.search(r"(20\d{2}|19\d{2})", str(val))
        if m:
            return int(m.group(1))
    return None


def _derive_ecourts_factors(
    ecourts_results: list[dict] | None,
    canonical_name: str | None,
    factors: dict[str, dict],
) -> None:
    if not ecourts_results:
        return

    total_cases = len(ecourts_results)
    criminal_pending = 0
    criminal_disposed = 0
    civil_pending = 0
    respondent_count = 0
    courts_seen: set[str] = set()
    current_year = datetime.now(timezone.utc).year
    recent_filings = 0
    mv_disposed = 0
    ni_act_count = 0
    hc_cases = 0
    fir_linked = 0
    division_bench = 0
    insolvency_count = 0
    family_count = 0
    consumer_count = 0
    labor_count = 0
    land_count = 0
    commercial_count = 0
    long_pending = 0
    highly_contested = 0
    conviction_count = 0
    acquittal_count = 0
    adverse_order_count = 0

    for case in ecourts_results:
        case_type = str(case.get("caseType") or "")
        case_status = str(case.get("caseStatus") or "").upper()
        acts = _acts_text(case)
        is_criminal = bool(_CRIMINAL_CASE_TYPES.search(case_type)) or bool(_IPC_SECTIONS_CRIMINAL.search(acts))
        is_civil = bool(_CIVIL_CASE_TYPES.search(case_type))
        is_respondent = _subject_is_respondent(case, canonical_name)
        is_petitioner = _subject_is_petitioner(case, canonical_name)
        is_hc = _is_high_court(case)
        bench = str(case.get("benchType") or "").lower()
        filing_year = _case_year(case)

        court = case.get("court") or {}
        court_code = court.get("courtComplexCode") or case.get("courtCode") or ""
        if court_code:
            courts_seen.add(court_code[:4])

        if is_criminal and case_status == "PENDING":
            criminal_pending += 1
        if is_criminal and case_status == "DISPOSED":
            criminal_disposed += 1
        if is_civil and case_status == "PENDING":
            civil_pending += 1

        if is_respondent:
            respondent_count += 1

        if filing_year and (current_year - filing_year) <= 1:
            recent_filings += 1

        if _MV_ACT.search(acts) and case_status == "DISPOSED":
            mv_disposed += 1

        if _NI_ACT_138.search(acts) or _NI_ACT_138.search(case_type):
            ni_act_count += 1

        if is_hc:
            hc_cases += 1

        fir_details = case.get("firDetails") or case.get("fir_details")
        if fir_details:
            fir_linked += 1

        if "division" in bench or "full" in bench:
            division_bench += 1

        if _INSOLVENCY_CASE_TYPES.search(case_type) or _INSOLVENCY_CASE_TYPES.search(acts):
            insolvency_count += 1
        if _FAMILY_CASE_TYPES.search(case_type) or _ECOURTS_ACT_DV.search(acts) or _ECOURTS_ACT_DOWRY.search(acts):
            family_count += 1
        if _CONSUMER_CASE_TYPES.search(case_type):
            consumer_count += 1
        if _LABOR_CASE_TYPES.search(case_type):
            labor_count += 1
        if _LAND_CASE_TYPES.search(case_type) or _LAND_CASE_TYPES.search(acts):
            land_count += 1
        if _COMMERCIAL_CASE_TYPES.search(case_type):
            commercial_count += 1

        hearing_count = case.get("hearingCount") or 0
        ia_count = case.get("iaCount") or 0
        if case_status == "PENDING" and filing_year and (current_year - filing_year) >= 3:
            long_pending += 1
        if hearing_count >= 15 or ia_count >= 5:
            highly_contested += 1

        disposal_type = str(case.get("disposalType") or case.get("stageOfCase") or "").lower()
        if is_criminal and case_status == "DISPOSED":
            if any(kw in disposal_type for kw in ("convict", "guilty", "sentenced")):
                conviction_count += 1
            elif any(kw in disposal_type for kw in ("acquit", "discharg", "not guilty")):
                acquittal_count += 1

        if case_status == "DISPOSED" and is_respondent:
            if any(kw in disposal_type for kw in ("decree", "against", "dismiss", "convict")):
                adverse_order_count += 1

        # Specific act-based factors fed back into FTI-like factors
        if _ECOURTS_ACT_NDPS.search(acts) and case_status == "PENDING":
            factors.setdefault("NDPSMatter_Pending", {
                "factor_id": "NDPSMatter_Pending", "confidence": 0.6, "count": 0,
            })
            factors["NDPSMatter_Pending"]["count"] += 1
        if _ECOURTS_ACT_UAPA.search(acts):
            factors.setdefault("UAPAMatter", {
                "factor_id": "UAPAMatter", "confidence": 0.6, "count": 0,
            })
            factors["UAPAMatter"]["count"] += 1
        if _ECOURTS_ACT_PMLA.search(acts):
            factors.setdefault("PMLAMatter_Pending", {
                "factor_id": "PMLAMatter_Pending", "confidence": 0.6, "count": 0,
            })
            factors["PMLAMatter_Pending"]["count"] += 1
        if _ECOURTS_ACT_PC.search(acts):
            factors.setdefault("CorruptionMatter", {
                "factor_id": "CorruptionMatter", "confidence": 0.6, "count": 0,
            })
            factors["CorruptionMatter"]["count"] += 1
        if _ECOURTS_ACT_DV.search(acts) and not _ECOURTS_ACT_DOWRY.search(acts):
            factors.setdefault("DomesticViolenceMatter", {
                "factor_id": "DomesticViolenceMatter", "confidence": 0.6, "count": 0,
            })
            factors["DomesticViolenceMatter"]["count"] += 1
        if _ECOURTS_ACT_DOWRY.search(acts):
            factors.setdefault("DowryHarassmentMatter", {
                "factor_id": "DowryHarassmentMatter", "confidence": 0.6, "count": 0,
            })
            factors["DowryHarassmentMatter"]["count"] += 1

    # Emit eCourts-specific factors based on aggregated counts
    if criminal_pending > 0 and is_respondent:
        factors["CriminalRespondent"] = {
            "factor_id": "CriminalRespondent",
            "confidence": 0.6,
            "count": criminal_pending,
        }

    if civil_pending > 0:
        factors["ActiveCivilDispute"] = {
            "factor_id": "ActiveCivilDispute",
            "confidence": 0.6,
            "count": civil_pending,
        }

    if respondent_count > 0:
        factors["ActiveLitigationAsRespondent"] = {
            "factor_id": "ActiveLitigationAsRespondent",
            "confidence": 0.6,
            "count": respondent_count,
        }

    if criminal_disposed > 0:
        factors["DisposedCriminalMatter"] = {
            "factor_id": "DisposedCriminalMatter",
            "confidence": 0.6,
            "count": criminal_disposed,
        }

    if mv_disposed > 0:
        factors["MotorVehicleMatter_Disposed"] = {
            "factor_id": "MotorVehicleMatter_Disposed",
            "confidence": 0.6,
            "count": mv_disposed,
        }

    if ni_act_count > 0:
        factors["ChequeDishonourHistory"] = {
            "factor_id": "ChequeDishonourHistory",
            "confidence": 0.6,
            "count": ni_act_count,
        }
        factors["NegotiableInstrumentDishonour"] = {
            "factor_id": "NegotiableInstrumentDishonour",
            "confidence": 0.6,
            "count": ni_act_count,
        }

    if hc_cases > 0:
        factors["HighCourtLitigation"] = {
            "factor_id": "HighCourtLitigation",
            "confidence": 0.6,
            "count": hc_cases,
        }
        factors.setdefault("HCStayedProceedings", {
            "factor_id": "HCStayedProceedings",
            "confidence": 0.6,
            "count": hc_cases,
        })

    if fir_linked > 0:
        factors["FIRLinkedCase"] = {
            "factor_id": "FIRLinkedCase",
            "confidence": 0.6,
            "count": fir_linked,
        }

    if division_bench > 0:
        factors["DivisionBenchMatter"] = {
            "factor_id": "DivisionBenchMatter",
            "confidence": 0.6,
            "count": division_bench,
        }

    if insolvency_count > 0:
        factors["InsolvencyProceeding"] = {
            "factor_id": "InsolvencyProceeding",
            "confidence": 0.6,
            "count": insolvency_count,
        }

    if family_count > 0:
        factors["FamilyCourtMatter"] = {
            "factor_id": "FamilyCourtMatter",
            "confidence": 0.6,
            "count": family_count,
        }

    if consumer_count > 0:
        factors["ConsumerComplaint"] = {
            "factor_id": "ConsumerComplaint",
            "confidence": 0.6,
            "count": consumer_count,
        }

    if labor_count > 0:
        factors["LaborDispute"] = {
            "factor_id": "LaborDispute",
            "confidence": 0.6,
            "count": labor_count,
        }

    if land_count > 0:
        factors["LandPropertyDispute"] = {
            "factor_id": "LandPropertyDispute",
            "confidence": 0.6,
            "count": land_count,
        }

    if commercial_count > 0:
        factors["CommercialCourtCase"] = {
            "factor_id": "CommercialCourtCase",
            "confidence": 0.6,
            "count": commercial_count,
        }

    if long_pending > 0:
        factors["LongPendingLitigation"] = {
            "factor_id": "LongPendingLitigation",
            "confidence": 0.6,
            "count": long_pending,
        }

    if highly_contested > 0:
        factors["HighlyContestedCase"] = {
            "factor_id": "HighlyContestedCase",
            "confidence": 0.6,
            "count": highly_contested,
        }

    if total_cases >= 5:
        factors["SerialLitigant"] = {
            "factor_id": "SerialLitigant",
            "confidence": 0.6,
            "count": total_cases,
        }

    if len(courts_seen) >= 3:
        factors["MultiJurisdictionExposure"] = {
            "factor_id": "MultiJurisdictionExposure",
            "confidence": 0.6,
            "count": len(courts_seen),
        }

    if conviction_count > 0:
        factors["CriminalConviction"] = {
            "factor_id": "CriminalConviction",
            "confidence": 0.6,
            "count": conviction_count,
        }

    if adverse_order_count > 0:
        factors["AdverseCourtOrder"] = {
            "factor_id": "AdverseCourtOrder",
            "confidence": 0.6,
            "count": adverse_order_count,
        }

    if acquittal_count > 0:
        factors["CriminalAcquittal"] = {
            "factor_id": "CriminalAcquittal",
            "confidence": 0.6,
            "count": acquittal_count,
        }

    if recent_filings >= 3:
        factors["RecentFilingSpike"] = {
            "factor_id": "RecentFilingSpike",
            "confidence": 0.6,
            "count": recent_filings,
        }


# ── MCA corporate factors ─────────────────────────────────────

def _parse_capital(val) -> float:
    if not val:
        return 0.0
    if isinstance(val, (int, float)):
        return float(val)
    try:
        return float(str(val).replace(",", "").strip())
    except (ValueError, TypeError):
        return 0.0


def _derive_mca_factors(mca_results: list[dict] | None, factors: dict[str, dict]) -> None:
    if not mca_results:
        return

    dissolved_count = 0
    strike_off_count = 0
    zero_capital_count = 0
    capital_anomaly_count = 0
    non_compliant_count = 0
    recently_incorporated_count = 0
    high_risk_industry_count = 0
    foreign_count = 0
    disqualified_count = 0
    active_healthy_count = 0
    current_year = datetime.now(timezone.utc).year

    for company in mca_results:
        status = str(company.get("CompanyStatus") or company.get("company_status") or "").strip()
        cin = company.get("CIN") or company.get("cin") or ""

        if _MCA_DISSOLVED_STATUSES.search(status):
            dissolved_count += 1
        elif _MCA_STRIKE_OFF_STATUS.search(status):
            strike_off_count += 1

        paidup = _parse_capital(company.get("PaidupCapital") or company.get("paidup_capital"))
        authorized = _parse_capital(company.get("AuthorizedCapital") or company.get("authorized_capital"))

        if paidup <= 0:
            zero_capital_count += 1

        if authorized > 0 and paidup > 0 and authorized / paidup > 100:
            capital_anomaly_count += 1

        reg_date_raw = company.get("CompanyRegistrationdate_date") or company.get("incorporation_date") or ""
        reg_year = None
        if reg_date_raw:
            for fmt in ("%d-%m-%Y", "%Y-%m-%d", "%d/%m/%Y", "%Y"):
                try:
                    reg_year = datetime.strptime(str(reg_date_raw).strip()[:10], fmt).year
                    break
                except (ValueError, TypeError):
                    continue
        if reg_year and (current_year - reg_year) < 2:
            recently_incorporated_count += 1

        nic = str(company.get("nic_code") or "").strip()
        if nic:
            for prefix in _HIGH_RISK_NIC_CODES:
                if nic.startswith(prefix):
                    high_risk_industry_count += 1
                    break

        company_origin = str(
            company.get("CompanyIndian/Foreign Company") or company.get("company_origin") or ""
        ).strip().lower()
        if "foreign" in company_origin:
            foreign_count += 1

        filing_fy = company.get("LatestAnnualReportFY") or company.get("latest_annual_report_fy") or ""
        if filing_fy:
            filing_year = None
            for fmt in ("%d-%m-%Y", "%Y-%m-%d", "%d/%m/%Y"):
                try:
                    filing_year = datetime.strptime(str(filing_fy).strip()[:10], fmt).year
                    break
                except (ValueError, TypeError):
                    continue
            if filing_year and (current_year - filing_year) > 2:
                non_compliant_count += 1
        elif cin:
            non_compliant_count += 1

        is_disqualified = company.get("disqualified_director", False)
        if is_disqualified:
            disqualified_count += 1

        if status.lower() in ("active", "active-compliant") and paidup > 100000:
            active_healthy_count += 1

        shell_signals = 0
        if paidup <= 0:
            shell_signals += 1
        if reg_year and (current_year - reg_year) < 2:
            shell_signals += 1
        if non_compliant_count > 0:
            shell_signals += 1
        if "dormant" in status.lower():
            shell_signals += 1
        if shell_signals >= 3:
            factors.setdefault("ShellCompanyIndicators", {
                "factor_id": "ShellCompanyIndicators",
                "confidence": 0.6,
                "count": 0,
            })
            factors["ShellCompanyIndicators"]["count"] += 1

    if dissolved_count > 0:
        factors["CompanyDissolved"] = {
            "factor_id": "CompanyDissolved",
            "confidence": 0.6,
            "count": dissolved_count,
        }

    if strike_off_count > 0:
        factors["CompanyUnderStrikeOff"] = {
            "factor_id": "CompanyUnderStrikeOff",
            "confidence": 0.6,
            "count": strike_off_count,
        }

    if zero_capital_count > 0:
        factors["ZeroPaidupCapital"] = {
            "factor_id": "ZeroPaidupCapital",
            "confidence": 0.6,
            "count": zero_capital_count,
        }

    if capital_anomaly_count > 0:
        factors["CapitalStructureAnomaly"] = {
            "factor_id": "CapitalStructureAnomaly",
            "confidence": 0.6,
            "count": capital_anomaly_count,
        }

    if non_compliant_count > 0:
        factors["CompanyNonCompliant"] = {
            "factor_id": "CompanyNonCompliant",
            "confidence": 0.6,
            "count": non_compliant_count,
        }

    if recently_incorporated_count > 0:
        factors["RecentlyIncorporatedEntity"] = {
            "factor_id": "RecentlyIncorporatedEntity",
            "confidence": 0.6,
            "count": recently_incorporated_count,
        }

    if high_risk_industry_count > 0:
        factors["HighRiskIndustryCompany"] = {
            "factor_id": "HighRiskIndustryCompany",
            "confidence": 0.6,
            "count": high_risk_industry_count,
        }

    if foreign_count > 0:
        factors["ForeignCompanyPresence"] = {
            "factor_id": "ForeignCompanyPresence",
            "confidence": 0.6,
            "count": foreign_count,
        }

    if disqualified_count > 0:
        factors["DisqualifiedDirectorAssociation"] = {
            "factor_id": "DisqualifiedDirectorAssociation",
            "confidence": 0.6,
            "count": disqualified_count,
        }


# ── Cross-source composite factors ─────────────────────────────

def _derive_cross_source_factors(
    factors: dict[str, dict],
    darkmon_results: list[dict] | None,
    financial_results: list[dict] | None,
    telegram_results: list[dict] | None,
    ecourts_results: list[dict] | None = None,
    mca_results: list[dict] | None = None,
) -> None:
    adverse_sources = set()
    _CREDMON_ADVERSE = {
        "PlaintextPasswordExposure", "ActiveCredentialExposure",
        "ReusedCredentialAcrossBreaches", "MassBreachExposure",
    }
    _FTI_ADVERSE = {
        "SanctionsMatch", "PEPStatus", "PendingCriminalMatter_General",
        "PendingCriminalMatter_Violent", "PendingCriminalMatter_Sexual",
        "NDPSMatter_Pending", "UAPAMatter", "PMLAMatter_Pending",
        "CorruptionMatter", "DomesticViolenceMatter", "DowryHarassmentMatter",
        "HighRiskCountryNexus",
    }
    _FINANCIAL_ADVERSE = {
        "FraudLinkedPaymentAccount", "BettingSiteLinkedPayment", "FlaggedBankAccount",
    }
    _DARKMON_ADVERSE = {
        "UndergroundForumAuthor", "UndergroundHighActivity", "DrugMarketplaceLinkage",
    }
    _TELEGRAM_ADVERSE = {
        "MessagingGroupMention", "MessagingHighExposure",
    }
    _ECOURTS_ADVERSE = {
        "CriminalRespondent", "CriminalConviction", "InsolvencyProceeding",
        "FIRLinkedCase", "NegotiableInstrumentDishonour", "ActiveLitigationAsRespondent",
        "SerialLitigant",
    }
    _MCA_ADVERSE = {
        "CompanyDissolved", "CompanyUnderStrikeOff", "ShellCompanyIndicators",
        "ZeroPaidupCapital", "DisqualifiedDirectorAssociation",
    }

    for fid in factors:
        if fid in _CREDMON_ADVERSE:
            adverse_sources.add("credmon")
        if fid in _FTI_ADVERSE:
            adverse_sources.add("fti")
        if fid in _FINANCIAL_ADVERSE:
            adverse_sources.add("financial")
        if fid in _DARKMON_ADVERSE:
            adverse_sources.add("darkmon")
        if fid in _TELEGRAM_ADVERSE:
            adverse_sources.add("telegram")
        if fid in _ECOURTS_ADVERSE:
            adverse_sources.add("ecourts")
        if fid in _MCA_ADVERSE:
            adverse_sources.add("mca")

    if len(adverse_sources) >= 3:
        factors["MultiSourceAdverseConvergence"] = {
            "factor_id": "MultiSourceAdverseConvergence",
            "confidence": 0.6,
            "count": len(adverse_sources),
        }

    # Clean-screen mitigating factors: only fire when data was actually checked
    darkmon_checked = darkmon_results is not None
    financial_checked = financial_results is not None
    telegram_checked = telegram_results is not None
    ecourts_checked = ecourts_results is not None

    if darkmon_checked and "darkmon" not in adverse_sources:
        has_any_darkmon_match = any(r.get("found") for r in (darkmon_results or []))
        if not has_any_darkmon_match:
            factors["CleanUndergroundScreen"] = {
                "factor_id": "CleanUndergroundScreen",
                "confidence": 0.6,
                "count": 1,
            }

    if financial_checked and "financial" not in adverse_sources:
        has_any_financial_hit = any(
            entry.get("records")
            for entry in (financial_results or [])
        )
        if not has_any_financial_hit:
            factors["CleanFinancialScreen"] = {
                "factor_id": "CleanFinancialScreen",
                "confidence": 0.6,
                "count": 1,
            }

    if telegram_checked and "telegram" not in adverse_sources:
        has_any_telegram_hit = any(
            entry.get("found")
            for entry in (telegram_results or [])
        )
        if not has_any_telegram_hit:
            factors["CleanMessagingScreen"] = {
                "factor_id": "CleanMessagingScreen",
                "confidence": 0.6,
                "count": 1,
            }

    if ecourts_checked and "ecourts" not in adverse_sources:
        if not ecourts_results:
            factors["CleanCourtRecordsScreen"] = {
                "factor_id": "CleanCourtRecordsScreen",
                "confidence": 0.6,
                "count": 1,
            }

    mca_checked = mca_results is not None
    if mca_checked and "mca" not in adverse_sources:
        has_any_mca_adverse = any(fid in factors for fid in _MCA_ADVERSE)
        if not has_any_mca_adverse:
            factors["CleanCorporateRegistryScreen"] = {
                "factor_id": "CleanCorporateRegistryScreen",
                "confidence": 0.6,
                "count": 1,
            }
