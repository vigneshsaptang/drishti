"""
Password hashing, token creation, password policy enforcement, and lockout logic.
"""
import hashlib
import secrets
import re
from datetime import datetime, timedelta, timezone

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError, VerificationError, InvalidHashError

from app.config import settings

ph = PasswordHasher(
    time_cost=3,
    memory_cost=65536,
    parallelism=4,
    hash_len=32,
    salt_len=16,
)

DUMMY_HASH = ph.hash("dummy-password-for-timing-attack-mitigation")

COMMON_PASSWORDS = frozenset([
    "password", "123456", "12345678", "qwerty", "abc123", "monkey", "1234567",
    "letmein", "trustno1", "dragon", "baseball", "iloveyou", "master", "sunshine",
    "ashley", "michael", "shadow", "123123", "654321", "superman", "qazwsx",
    "password1", "password123", "admin", "welcome", "login", "princess",
    "starwars", "passw0rd", "hello", "charlie", "donald", "football", "!@#$%^&*",
])


def hash_password(password: str) -> str:
    return ph.hash(password)


def verify_password(stored_hash: str, password: str) -> bool:
    try:
        ph.verify(stored_hash, password)
        return True
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def verify_password_timing_safe(stored_hash: str | None, password: str) -> bool:
    """Always runs argon2 verify to prevent timing-based user enumeration."""
    if stored_hash is None:
        try:
            ph.verify(DUMMY_HASH, password)
        except (VerifyMismatchError, VerificationError, InvalidHashError):
            pass
        return False
    return verify_password(stored_hash, password)


def check_needs_rehash(stored_hash: str) -> bool:
    return ph.check_needs_rehash(stored_hash)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def generate_refresh_token() -> str:
    return "saprt_" + secrets.token_hex(32)


def generate_api_key() -> str:
    return "sapk_" + secrets.token_hex(16)


def generate_temp_password() -> str:
    alphabet = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%"
    return "".join(secrets.choice(alphabet) for _ in range(16))


def create_access_token(user_id: str, username: str, role: str) -> tuple[str, str]:
    """Returns (jwt_string, jti)."""
    jti = secrets.token_hex(16)
    now = datetime.now(timezone.utc)
    exp = now + timedelta(minutes=30)
    payload = {
        "sub": user_id,
        "username": username,
        "role": role,
        "jti": jti,
        "iat": now,
        "exp": exp,
        "iss": "auracle",
    }
    token = jwt.encode(payload, settings.saptang_jwt_secret, algorithm="HS256")
    return token, jti


def decode_access_token(token: str) -> dict | None:
    try:
        return jwt.decode(
            token,
            settings.saptang_jwt_secret,
            algorithms=["HS256"],
            issuer="auracle",
        )
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        return None


def validate_password_policy(password: str, username: str, policy: dict, password_history: list[str] | None = None) -> list[str]:
    """Returns list of violation messages. Empty = valid."""
    errors = []
    min_len = policy.get("min_length", 12)
    if len(password) < min_len:
        errors.append(f"Password must be at least {min_len} characters")
    if policy.get("require_uppercase", True) and not re.search(r"[A-Z]", password):
        errors.append("Password must contain at least one uppercase letter")
    if policy.get("require_lowercase", True) and not re.search(r"[a-z]", password):
        errors.append("Password must contain at least one lowercase letter")
    if policy.get("require_digit", True) and not re.search(r"\d", password):
        errors.append("Password must contain at least one digit")
    if policy.get("require_special", False) and not re.search(r"[^A-Za-z0-9]", password):
        errors.append("Password must contain at least one special character")
    if username and username.lower() in password.lower():
        errors.append("Password cannot contain your username")
    if password.lower() in COMMON_PASSWORDS:
        errors.append("Password is too common")
    if password_history:
        history_count = policy.get("history_count", 5)
        for old_hash in password_history[:history_count]:
            if verify_password(old_hash, password):
                errors.append(f"Cannot reuse any of your last {history_count} passwords")
                break
    return errors


def check_lockout(user: dict, lockout_policy: dict) -> tuple[bool, int]:
    """Returns (is_locked, remaining_minutes)."""
    locked_until = user.get("locked_until")
    if locked_until is None:
        return False, 0
    now = datetime.now(timezone.utc)
    if locked_until.tzinfo is None:
        locked_until = locked_until.replace(tzinfo=timezone.utc)
    if now >= locked_until:
        return False, 0
    remaining = int((locked_until - now).total_seconds() / 60) + 1
    return True, remaining


def should_lock(user: dict, lockout_policy: dict) -> bool:
    max_attempts = lockout_policy.get("max_failed_attempts", 5)
    return user.get("failed_login_attempts", 0) >= max_attempts


def derive_device_label(ua: str) -> str:
    if not ua:
        return "Unknown"
    browser = "Unknown"
    os_name = "Unknown"
    if "Firefox/" in ua:
        browser = "Firefox"
    elif "Edg/" in ua:
        browser = "Edge"
    elif "Chrome/" in ua:
        browser = "Chrome"
    elif "Safari/" in ua:
        browser = "Safari"
    elif "curl/" in ua:
        browser = "curl"
    elif "python" in ua.lower():
        browser = "Python"

    if "Windows" in ua:
        os_name = "Windows"
    elif "Macintosh" in ua or "Mac OS" in ua:
        os_name = "macOS"
    elif "Linux" in ua:
        os_name = "Linux"
    elif "Android" in ua:
        os_name = "Android"
    elif "iPhone" in ua or "iPad" in ua:
        os_name = "iOS"

    return f"{browser} / {os_name}"


DEFAULT_PASSWORD_POLICY = {
    "min_length": 12,
    "require_uppercase": True,
    "require_lowercase": True,
    "require_digit": True,
    "require_special": False,
    "max_age_days": 90,
    "history_count": 5,
}

DEFAULT_SESSION_POLICY = {
    "max_concurrent_sessions": 5,
    "access_token_ttl_minutes": 30,
    "refresh_token_ttl_days": 7,
    "idle_timeout_minutes": 60,
}

DEFAULT_LOCKOUT_POLICY = {
    "max_failed_attempts": 5,
    "lockout_duration_minutes": 30,
    "reset_attempts_after_minutes": 15,
}
