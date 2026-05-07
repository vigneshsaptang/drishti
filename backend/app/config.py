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

    # Saptang UI login (leave password empty to disable gate)
    saptang_admin_user: str = "operator"
    saptang_admin_password: str = ""
    saptang_jwt_secret: str = "saptang-dev-change-me"
    saptang_token_exp_hours: int = 24

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
