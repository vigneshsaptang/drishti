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

    # Tor
    tor_socks_port: int = 9050
    tor_http_port: int = 8118

    admin_email: str = ""

    # Saptang UI login (leave password empty to disable gate)
    saptang_admin_user: str = "operator"
    saptang_admin_password: str = ""
    saptang_jwt_secret: str = "saptang-dev-change-me"
    saptang_token_exp_hours: int = 24

    model_config = {"env_file": str(_env_file), "env_file_encoding": "utf-8", "extra": "ignore"}


settings = Settings()
