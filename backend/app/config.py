from pathlib import Path
from pydantic_settings import BaseSettings

# .env lives at project root (sigint/.env), backend runs from sigint/backend/
# In Docker: /app/app/config.py has only 2 parents, so cap at what exists
_this = Path(__file__).resolve()
_env_candidates = [Path(".env")]
for i in range(min(len(_this.parents), 4)):
    _env_candidates.append(_this.parents[i] / ".env")
_env_file = next((p for p in _env_candidates if p.exists()), ".env")


class Settings(BaseSettings):
    # Domain
    domain: str = "localhost"

    # MongoDB
    mongo_uri_credmon: str
    mongo_uri_darkmon: str
    mongo_uri_fti: str

    # Backend
    backend_port: int = 8000
    workers: int = 2
    log_level: str = "info"

    # Search
    max_search_depth: int = 3
    max_entities_per_depth: int = 100
    darkmon_query_timeout_ms: int = 8000
    credmon_socket_timeout_ms: int = 30000

    admin_email: str = ""

    # Platform database (on the FTI Mongo instance)
    mongo_db_platform: str = "auracle_platform"

    # Legacy single-user login (auto-migrated to DB on first startup)
    saptang_admin_user: str = "operator"
    saptang_admin_password: str = ""
    saptang_jwt_secret: str = "saptang-dev-change-me"
    saptang_token_exp_hours: int = 24

    # Audit logging (separate Mongo deployment)
    mongo_uri_audit: str = ""
    audit_db_name: str = "auracle_audit"
    audit_store_plaintext: bool = False
    audit_hmac_key: str = ""
    audit_retention_days: int = 365
    audit_search_history_days: int = 90
    audit_analytics_retention_days: int = 730
    audit_buffer_size: int = 50
    audit_flush_interval_s: float = 2.0

    # IP control (comma-separated CIDR or IPs, leave empty to disable)
    ip_allowlist: str = ""
    ip_blocklist: str = ""

    # Brute force
    ip_block_threshold: int = 50
    ip_block_duration_seconds: int = 1800

    # Rate limiting
    rate_limit_enabled: bool = True

    # Credit system
    credits_enabled: bool = True

    # Support & Feedback (SMTP email)
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_use_tls: bool = True
    smtp_starttls: bool = True
    smtp_timeout_s: int = 30
    support_email_to: str = ""
    support_email_from: str = ""
    support_email_from_name: str = "Auracle Platform"
    feedback_max_per_day: int = 10
    feedback_max_attachment_bytes: int = 5 * 1024 * 1024
    feedback_max_attachments: int = 3

    # AI summary (Claude)
    anthropic_api_key: str = ""

    # eCourts Partner API — for live court-record searches and PDF retrieval
    ecourts_api_token: str = ""
    ecourts_api_base: str = "https://webapi.ecourtsindia.com/api/partner"
    ecourts_request_timeout: int = 30
    ecourts_paid_sleep_ms: int = 1500       # min interval between paid calls
    ecourts_search_chunk_size: int = 30     # >30 court codes per call → silent 404 (per knowledge base)
    ecourts_search_page_size: int = 50      # server caps at 50 even if higher requested
    ecourts_case_ttl_seconds: int = 30 * 24 * 3600   # case detail cache — 30 days
    ecourts_search_ttl_seconds: int = 24 * 3600      # search results cache — 24 hours

    model_config = {"env_file": str(_env_file), "env_file_encoding": "utf-8", "extra": "ignore"}


settings = Settings()
