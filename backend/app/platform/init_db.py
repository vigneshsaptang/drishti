"""
Platform database initialization — indexes, config singleton, env-var admin migration.
Called once at application startup from lifespan().
"""
import logging
from datetime import datetime, timezone

from pymongo import ASCENDING, DESCENDING
from pymongo.errors import DuplicateKeyError, OperationFailure

from app.config import settings
from app.db import get_platform_db
from app.platform.auth import hash_password
from app.platform.config_store import init_config, get_config, mark_setup_complete
from app.platform.audit import init_audit, log_event
from app.platform.rbac import seed_builtin_roles
from app.db import get_audit
from app.config import settings as app_settings

log = logging.getLogger("platform.init")


def init_platform():
    db = get_platform_db()

    _ensure_indexes(db)
    init_config(db)
    init_audit(db)
    seed_builtin_roles(db)
    _ensure_audit_indexes()
    _auto_migrate_env_admin(db)

    log.info("Platform DB initialized (db=%s)", db.name)


def _ensure_indexes(db):
    try:
        db["users"].create_index("username", unique=True)
        db["users"].create_index("email", unique=True)
        db["users"].create_index("status")

        db["sessions"].create_index([("user_id", ASCENDING), ("revoked", ASCENDING)])
        db["sessions"].create_index("refresh_token_hash", unique=True)
        db["sessions"].create_index("access_token_jti", unique=True)
        db["sessions"].create_index("expires_at", expireAfterSeconds=0)

        db["api_keys"].create_index("key_hash", unique=True)
        db["api_keys"].create_index([("user_id", ASCENDING), ("status", ASCENDING)])

        db["audit_log"].create_index([("timestamp", DESCENDING)])
        db["audit_log"].create_index([("actor_id", ASCENDING), ("timestamp", DESCENDING)])
        db["audit_log"].create_index([("action", ASCENDING), ("timestamp", DESCENDING)])
        db["audit_log"].create_index([("target_id", ASCENDING), ("timestamp", DESCENDING)])

        db["roles"].create_index("level")
        db["roles"].create_index("is_builtin")

        db["rate_limit_counters"].create_index(
            [("user_id", ASCENDING), ("counter_type", ASCENDING), ("window_start", ASCENDING)],
            unique=True,
        )
        db["rate_limit_counters"].create_index("expires_at", expireAfterSeconds=0)
    except OperationFailure as e:
        log.warning("Could not create platform indexes (auth?): %s", e)


def _ensure_audit_indexes():
    """Create indexes on the audit database (separate Mongo deployment)."""
    client = get_audit()
    if not client:
        return
    db = client[app_settings.audit_db_name]

    try:
        ae = db["audit_events"]
        ae.create_index([("timestamp", DESCENDING)])
        ae.create_index([("user_id", ASCENDING), ("timestamp", DESCENDING)])
        ae.create_index([("category", ASCENDING), ("timestamp", DESCENDING)])
        ae.create_index([("action", ASCENDING), ("timestamp", DESCENDING)])
        ae.create_index([("client_ip", ASCENDING), ("timestamp", DESCENDING)])
        ae.create_index([("session_id", ASCENDING), ("timestamp", DESCENDING)])
        ae.create_index([("severity", ASCENDING), ("timestamp", DESCENDING)])
        ae.create_index([("event_id", ASCENDING)], unique=True)
        ae.create_index([("chain_hash", ASCENDING)], unique=True, sparse=True)
        ae.create_index([("expires_at", ASCENDING)], expireAfterSeconds=0)

        sh = db["search_history"]
        sh.create_index([("user_id", ASCENDING), ("timestamp", DESCENDING)])
        sh.create_index([("search_value", ASCENDING), ("timestamp", DESCENDING)])
        sh.create_index([("timestamp", DESCENDING)])
        sh.create_index([("expires_at", ASCENDING)], expireAfterSeconds=0)

        s = db["active_sessions"]
        s.create_index([("session_id", ASCENDING)], unique=True)
        s.create_index([("user_id", ASCENDING), ("last_seen_at", DESCENDING)])
        s.create_index([("last_seen_at", DESCENDING)])
        s.create_index([("expires_at", ASCENDING)], expireAfterSeconds=0)

        ad = db["analytics_daily"]
        ad.create_index([("date", ASCENDING), ("hour", ASCENDING)], unique=True)
        ad.create_index([("expires_at", ASCENDING)], expireAfterSeconds=0)

        log.info("Audit DB indexes ensured (db=%s)", db.name)
    except OperationFailure as e:
        log.warning("Could not create audit indexes (auth?): %s", e)


def _auto_migrate_env_admin(db):
    """If SAPTANG_ADMIN_PASSWORD is set and setup isn't complete, create the bootstrap admin."""
    config = get_config(db)
    if config.get("setup_complete"):
        return

    env_password = (settings.saptang_admin_password or "").strip()
    if not env_password:
        return

    env_user = (settings.saptang_admin_user or "operator").strip().lower()
    env_email = (settings.admin_email or f"{env_user}@saptanglabs.com").strip().lower()

    now = datetime.now(timezone.utc)
    user_doc = {
        "username": env_user,
        "email": env_email,
        "display_name": env_user.title(),
        "password_hash": hash_password(env_password),
        "role": "super_admin",
        "status": "active",
        "avatar_url": None,
        "password_changed_at": now,
        "password_expires_at": None,
        "force_password_change": False,
        "password_history": [],
        "failed_login_attempts": 0,
        "locked_until": None,
        "last_failed_login_at": None,
        "created_at": now,
        "created_by": None,
        "updated_at": now,
        "last_login_at": None,
        "temp_password_hash": None,
        "temp_password_expires_at": None,
    }

    try:
        result = db["users"].insert_one(user_doc)
        mark_setup_complete(db)
        log_event(
            "bootstrap_admin_created",
            actor_username=env_user,
            target_type="user",
            target_id=result.inserted_id,
            detail={"source": "env_migration"},
        )
        log.info(
            "[AUTH] Migrated env-var admin '%s' to database. "
            "You can now remove SAPTANG_ADMIN_PASSWORD from .env.",
            env_user,
        )
    except DuplicateKeyError:
        log.info("[AUTH] Admin user '%s' already exists in database, skipping migration", env_user)
        mark_setup_complete(db)
