import re
from bson import ObjectId
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, HTTPException, Query, Request
from app.db import get_platform_db
from app.platform.auth import hash_password, generate_temp_password, validate_password_policy
from app.platform.sessions import revoke_all_sessions
from app.platform.config_store import get_config, update_config
from app.platform.audit import log_event, query_audit_log
from app.platform.models import CreateUserRequest, UpdateUserRequest, UpdateConfigRequest
from app.credits import (
    get_cost_matrix as _get_cost_matrix,
    get_usage as _get_credit_usage,
    admin_topup,
    invalidate_config_cache,
    DEFAULT_COST_MATRIX,
    DEFAULT_ROLE_LIMITS,
)
from app.platform.rbac import (
    resolve_effective_permissions, resolve_effective_limits,
    can_manage, get_role_level, invalidate_user_cache, invalidate_role_cache,
    BUILTIN_ROLES, ALL_PERMISSIONS, PERMISSION_GROUPS,
    expand_permission_groups, validate_permissions, seed_builtin_roles,
)

router = APIRouter(tags=["admin"])

SENSITIVE_FIELDS = {"password_hash", "password_history", "temp_password_hash"}


def _to_oid(val: str) -> ObjectId:
    try:
        return ObjectId(val)
    except Exception:
        raise HTTPException(400, "Invalid ID format")


def _require_admin(request: Request) -> dict:
    user = getattr(request.state, "user", None)
    if not user:
        raise HTTPException(403, "Admin access required")
    perms = resolve_effective_permissions(user["id"])
    has_any_admin = any(p.startswith("admin.") for p in perms)
    if not has_any_admin:
        raise HTTPException(403, "Admin access required")
    return user


def _require_permission(request: Request, permission: str) -> dict:
    user = getattr(request.state, "user", None)
    if not user:
        raise HTTPException(403, "Admin access required")
    perms = resolve_effective_permissions(user["id"])
    if permission not in perms:
        raise HTTPException(403, "Insufficient permissions")
    return user


def _get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else ""


def _sanitize_user(doc: dict) -> dict:
    out = {}
    for k, v in doc.items():
        if k == "_id":
            out["id"] = str(v)
        elif k not in SENSITIVE_FIELDS:
            out[k] = v
    return out


def _count_active_sessions(db, user_id: str) -> int:
    now = datetime.now(timezone.utc)
    return db.sessions.count_documents({
        "user_id": user_id,
        "expires_at": {"$gt": now},
    })


# ── 1. List users ────────────────────────────────────────────────────

@router.get("/admin/users")
async def list_users(
    request: Request,
    status: str | None = None,
    page: int = 1,
    per_page: int = 20,
    q: str | None = None,
):
    _require_admin(request)
    db = get_platform_db()

    query: dict = {}
    if status:
        query["status"] = status
    if q:
        regex = {"$regex": re.escape(q), "$options": "i"}
        query["$or"] = [
            {"username": regex},
            {"email": regex},
            {"display_name": regex},
        ]

    total = db.users.count_documents(query)
    skip = (max(page, 1) - 1) * per_page
    cursor = db.users.find(query).sort("created_at", -1).skip(skip).limit(per_page)

    users = []
    for doc in cursor:
        user = _sanitize_user(doc)
        user["active_sessions"] = _count_active_sessions(db, str(doc["_id"]))
        users.append(user)

    return {"users": users, "total": total, "page": page, "per_page": per_page}


# ── 2. Create user ───────────────────────────────────────────────────

@router.post("/admin/users", status_code=201)
async def create_user(request: Request, body: CreateUserRequest):
    admin = _require_permission(request, "admin.users.create")
    db = get_platform_db()

    target_role = body.role or "analyst"
    if target_role in ("admin", "super_admin"):
        actor_perms = resolve_effective_permissions(admin["id"])
        if "admin.promote_admin" not in actor_perms:
            raise HTTPException(403, "Only super_admin can create admin accounts")
    if not can_manage(admin.get("role", "admin"), target_role):
        raise HTTPException(403, "Cannot assign a role at or above your own level")

    existing = db.users.find_one({
        "$or": [{"username": body.username}, {"email": body.email}]
    })
    if existing:
        raise HTTPException(409, "Username or email already exists")

    if len(body.password) < 8:
        raise HTTPException(400, "Temporary password must be at least 8 characters")

    now = datetime.now(timezone.utc)
    hashed = hash_password(body.password)

    user_doc = {
        "username": body.username,
        "email": body.email,
        "display_name": body.display_name or body.username,
        "password_hash": hashed,
        "role": body.role or "analyst",
        "status": "active",
        "avatar_url": None,
        "password_changed_at": now,
        "password_expires_at": now + timedelta(days=90),
        "force_password_change": body.force_password_change if body.force_password_change is not None else True,
        "password_history": [hashed],
        "failed_login_attempts": 0,
        "locked_until": None,
        "last_failed_login_at": None,
        "created_at": now,
        "created_by": admin.get("username", "admin"),
        "updated_at": now,
        "last_login_at": None,
        "temp_password_hash": None,
        "temp_password_expires_at": None,
    }

    result = db.users.insert_one(user_doc)
    user_doc["_id"] = result.inserted_id

    log_event(
        "user_created",
        actor_id=admin.get("id", ""),
        actor_username=admin.get("username", "admin"),
        target_id=str(result.inserted_id),
        target_type="user",
        detail={"username": body.username, "email": body.email, "role": user_doc["role"]},
        ip_address=_get_client_ip(request),
    )

    return _sanitize_user(user_doc)


# ── 3. Get user detail ───────────────────────────────────────────────

@router.get("/admin/users/{user_id}")
async def get_user(request: Request, user_id: str):
    _require_permission(request, "admin.users.read")
    db = get_platform_db()

    doc = db.users.find_one({"_id": _to_oid(user_id)})
    if not doc:
        raise HTTPException(404, "User not found")

    user = _sanitize_user(doc)
    user["active_sessions"] = _count_active_sessions(db, user_id)
    user["effective_permissions"] = sorted(resolve_effective_permissions(user_id))
    user["effective_limits"] = resolve_effective_limits(user_id)
    return user


# ── 4. Update user ───────────────────────────────────────────────────

@router.patch("/admin/users/{user_id}")
async def update_user(request: Request, user_id: str, body: UpdateUserRequest):
    admin = _require_permission(request, "admin.users.update")
    db = get_platform_db()

    doc = db.users.find_one({"_id": _to_oid(user_id)})
    if not doc:
        raise HTTPException(404, "User not found")

    if not can_manage(admin.get("role", "admin"), doc.get("role", "viewer")):
        raise HTTPException(403, "Cannot modify a user at or above your role level")

    if str(doc["_id"]) == admin.get("id"):
        if body.role is not None and body.role != doc.get("role"):
            raise HTTPException(400, "Cannot change your own role")

    updates: dict = {}
    changes: dict = {}

    if body.display_name is not None:
        updates["display_name"] = body.display_name
        changes["display_name"] = {"from": doc.get("display_name"), "to": body.display_name}

    if body.email is not None:
        dup = db.users.find_one({"email": body.email, "_id": {"$ne": _to_oid(user_id)}})
        if dup:
            raise HTTPException(409, "Email already in use")
        updates["email"] = body.email
        changes["email"] = {"from": doc.get("email"), "to": body.email}

    if body.role is not None:
        if body.role in ("admin", "super_admin"):
            actor_perms = resolve_effective_permissions(admin["id"])
            if "admin.promote_admin" not in actor_perms:
                raise HTTPException(403, "Only super_admin can assign admin roles")
        if not can_manage(admin.get("role", "admin"), body.role):
            raise HTTPException(403, "Cannot assign a role at or above your own level")
        if doc.get("role") in ("admin", "super_admin") and body.role not in ("admin", "super_admin"):
            admin_count = db.users.count_documents({"role": {"$in": ["admin", "super_admin"]}, "status": {"$ne": "disabled"}})
            if admin_count <= 1:
                raise HTTPException(400, "Cannot demote the last admin")
        updates["role"] = body.role
        changes["role"] = {"from": doc.get("role"), "to": body.role}

    if body.status is not None:
        if doc.get("role") == "admin" and body.status == "disabled":
            admin_count = db.users.count_documents({"role": "admin", "status": {"$ne": "disabled"}})
            if admin_count <= 1:
                raise HTTPException(400, "Cannot disable the last admin")
        updates["status"] = body.status
        changes["status"] = {"from": doc.get("status"), "to": body.status}
        if body.status == "disabled":
            revoke_all_sessions(db, user_id)

    if not updates:
        raise HTTPException(400, "No fields to update")

    updates["updated_at"] = datetime.now(timezone.utc)
    db.users.update_one({"_id": _to_oid(user_id)}, {"$set": updates})
    invalidate_user_cache(user_id)

    log_event(
        "user_updated",
        actor_id=admin.get("id", ""),
        actor_username=admin.get("username", "admin"),
        target_id=user_id,
        target_type="user",
        detail=changes,
        ip_address=_get_client_ip(request),
    )

    updated = db.users.find_one({"_id": _to_oid(user_id)})
    return _sanitize_user(updated)


# ── 5. Delete user ───────────────────────────────────────────────────

@router.delete("/admin/users/{user_id}")
async def delete_user(request: Request, user_id: str):
    admin = _require_permission(request, "admin.users.delete")
    db = get_platform_db()

    doc = db.users.find_one({"_id": _to_oid(user_id)})
    if not doc:
        raise HTTPException(404, "User not found")

    if str(doc["_id"]) == admin.get("id", ""):
        raise HTTPException(400, "Cannot delete yourself")

    if not can_manage(admin.get("role", "admin"), doc.get("role", "viewer")):
        raise HTTPException(403, "Cannot delete a user at or above your role level")

    if doc.get("role") in ("admin", "super_admin"):
        admin_count = db.users.count_documents({"role": {"$in": ["admin", "super_admin"]}})
        if admin_count <= 1:
            raise HTTPException(400, "Cannot delete the last admin")

    sessions_revoked = revoke_all_sessions(db, user_id)
    api_keys_revoked = db.api_keys.delete_many({"user_id": user_id}).deleted_count
    db.users.delete_one({"_id": _to_oid(user_id)})
    invalidate_user_cache(user_id)

    log_event(
        "user_deleted",
        actor_id=admin.get("id", ""),
        actor_username=admin.get("username", "admin"),
        target_id=user_id,
        target_type="user",
        detail={"username": doc.get("username"), "sessions_revoked": sessions_revoked, "api_keys_revoked": api_keys_revoked},
        ip_address=_get_client_ip(request),
    )

    return {"message": f"User {doc.get('username')} deleted", "sessions_revoked": sessions_revoked, "api_keys_revoked": api_keys_revoked}


# ── 6. Reset password ────────────────────────────────────────────────

@router.post("/admin/users/{user_id}/reset-password")
async def reset_password(request: Request, user_id: str):
    admin = _require_permission(request, "admin.users.reset_password")
    db = get_platform_db()

    doc = db.users.find_one({"_id": _to_oid(user_id)})
    if not doc:
        raise HTTPException(404, "User not found")

    if not can_manage(admin.get("role", "admin"), doc.get("role", "viewer")):
        raise HTTPException(403, "Cannot reset password for a user at or above your role level")

    temp_password = generate_temp_password()
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(hours=24)

    db.users.update_one(
        {"_id": _to_oid(user_id)},
        {"$set": {
            "temp_password_hash": hash_password(temp_password),
            "temp_password_expires_at": expires_at,
            "force_password_change": True,
            "status": "pending_password_reset",
            "updated_at": now,
        }},
    )

    log_event(
        "password_reset",
        actor_id=admin.get("id", ""),
        actor_username=admin.get("username", "admin"),
        target_id=user_id,
        target_type="user",
        detail={"username": doc.get("username"), "expires_at": expires_at.isoformat()},
        ip_address=_get_client_ip(request),
    )

    return {"temp_password": temp_password, "expires_at": expires_at.isoformat(), "message": "Temporary password generated. User must change it on next login."}


# ── 7. Unlock user ───────────────────────────────────────────────────

@router.post("/admin/users/{user_id}/unlock")
async def unlock_user(request: Request, user_id: str):
    admin = _require_permission(request, "admin.users.update")
    db = get_platform_db()

    doc = db.users.find_one({"_id": _to_oid(user_id)})
    if not doc:
        raise HTTPException(404, "User not found")

    db.users.update_one(
        {"_id": _to_oid(user_id)},
        {"$set": {"locked_until": None, "failed_login_attempts": 0, "updated_at": datetime.now(timezone.utc)}},
    )

    log_event(
        "user_updated",
        actor_id=admin.get("id", ""),
        actor_username=admin.get("username", "admin"),
        target_id=user_id,
        target_type="user",
        detail={"action": "manual_unlock", "username": doc.get("username")},
        ip_address=_get_client_ip(request),
    )

    return {"message": f"User {doc.get('username')} unlocked"}


# ── 8. Revoke all sessions for a user ────────────────────────────────

@router.delete("/admin/users/{user_id}/sessions")
async def revoke_user_sessions(request: Request, user_id: str):
    admin = _require_permission(request, "admin.users.update")
    db = get_platform_db()

    doc = db.users.find_one({"_id": _to_oid(user_id)})
    if not doc:
        raise HTTPException(404, "User not found")

    count = revoke_all_sessions(db, user_id)

    log_event(
        "sessions_revoked",
        actor_id=admin.get("id", ""),
        actor_username=admin.get("username", "admin"),
        target_id=user_id,
        target_type="user",
        detail={"username": doc.get("username"), "sessions_revoked": count},
        ip_address=_get_client_ip(request),
    )

    return {"message": f"Revoked {count} session(s)", "sessions_revoked": count}


# ── 9. Get platform config ───────────────────────────────────────────

@router.get("/admin/config")
async def get_platform_config(request: Request):
    _require_permission(request, "admin.settings.read")
    db = get_platform_db()
    config = get_config(db)
    config.pop("_id", None)
    return config


# ── 10. Update platform config ───────────────────────────────────────

@router.patch("/admin/config")
async def update_platform_config(request: Request, body: UpdateConfigRequest):
    admin = _require_permission(request, "admin.settings.update")
    db = get_platform_db()

    merged = update_config(db, body.dict(exclude_unset=True))
    merged.pop("_id", None)

    log_event(
        "config_updated",
        actor_id=admin.get("id", ""),
        actor_username=admin.get("username", "admin"),
        target_id="platform_config",
        target_type="system",
        detail={"updated_keys": list(body.dict(exclude_unset=True).keys())},
        ip_address=_get_client_ip(request),
    )

    return merged


# ── 11. Query audit log ──────────────────────────────────────────────

@router.get("/admin/audit-log")
async def get_audit_log(
    request: Request,
    action: str | None = None,
    actor_id: str | None = None,
    target_id: str | None = None,
    from_date: str | None = Query(None, alias="from"),
    to_date: str | None = Query(None, alias="to"),
    page: int = 1,
    per_page: int = 20,
):
    _require_permission(request, "admin.audit.read")
    db = get_platform_db()

    entries, total = query_audit_log(
        db,
        action=action,
        actor_id=actor_id,
        target_id=target_id,
        page=page,
        per_page=per_page,
    )
    return {"entries": entries, "total": total, "page": page, "per_page": per_page}


# ══════════════════════════════════════════════════════════════════════
# ROLE MANAGEMENT ENDPOINTS
# ══════════════════════════════════════════════════════════════════════

# ── 12. List roles ──────────────────────────────────────────────────

@router.get("/admin/roles")
async def list_roles(request: Request):
    _require_permission(request, "admin.roles.list")
    db = get_platform_db()

    roles = list(db.roles.find().sort("level", -1))
    for r in roles:
        r["user_count"] = db.users.count_documents({"role": r["_id"]})
    return {"roles": roles, "groups": {k: sorted(v) for k, v in PERMISSION_GROUPS.items()}}


# ── 13. Create custom role ──────────────────────────────────────────

@router.post("/admin/roles", status_code=201)
async def create_role(request: Request):
    admin = _require_permission(request, "admin.roles.create")
    db = get_platform_db()
    body = await request.json()

    role_id = body.get("id", "").strip().lower()
    if not role_id or not re.match(r'^[a-z][a-z0-9_]{2,49}$', role_id):
        raise HTTPException(400, "Role ID must be 3-50 lowercase alphanumeric characters with underscores")

    if role_id in BUILTIN_ROLES:
        raise HTTPException(409, "Cannot use a built-in role ID")

    if db.roles.find_one({"_id": role_id}):
        raise HTTPException(409, "Role already exists")

    level = body.get("level", 50)
    if not isinstance(level, int) or level < 1 or level > 99:
        raise HTTPException(400, "Level must be between 1 and 99")

    raw_perms = body.get("permissions", [])
    invalid = validate_permissions(raw_perms)
    if invalid:
        raise HTTPException(400, f"Invalid permissions: {', '.join(invalid)}")
    expanded = expand_permission_groups(raw_perms)

    limits = body.get("limits", {})
    now = datetime.now(timezone.utc)

    role_doc = {
        "_id": role_id,
        "display_name": body.get("display_name", role_id.replace("_", " ").title()),
        "description": body.get("description", ""),
        "level": level,
        "is_builtin": False,
        "permissions": sorted(expanded),
        "limits": limits,
        "created_at": now,
        "updated_at": now,
        "created_by": admin.get("username", "admin"),
    }
    db.roles.insert_one(role_doc)

    log_event(
        "role_created",
        actor_id=admin.get("id", ""),
        actor_username=admin.get("username", "admin"),
        target_id=role_id,
        target_type="role",
        detail={"display_name": role_doc["display_name"], "level": level, "permission_count": len(expanded)},
        ip_address=_get_client_ip(request),
    )

    return {"role": role_doc, "_created": True}


# ── 14. Get role detail ─────────────────────────────────────────────

@router.get("/admin/roles/{role_id}")
async def get_role(request: Request, role_id: str):
    _require_permission(request, "admin.roles.read")
    db = get_platform_db()

    role = db.roles.find_one({"_id": role_id})
    if not role:
        raise HTTPException(404, "Role not found")

    role["user_count"] = db.users.count_documents({"role": role_id})
    return {"role": role}


# ── 15. Update role ─────────────────────────────────────────────────

@router.put("/admin/roles/{role_id}")
async def update_role(request: Request, role_id: str):
    admin = _require_permission(request, "admin.roles.update")
    db = get_platform_db()

    role = db.roles.find_one({"_id": role_id})
    if not role:
        raise HTTPException(404, "Role not found")

    body = await request.json()
    updates: dict = {}
    changes: dict = {}

    if "display_name" in body:
        updates["display_name"] = body["display_name"]
        changes["display_name"] = {"from": role.get("display_name"), "to": body["display_name"]}

    if "description" in body:
        updates["description"] = body["description"]

    if "permissions" in body:
        if role.get("is_builtin"):
            actor_perms = resolve_effective_permissions(admin["id"])
            if "admin.promote_admin" not in actor_perms:
                raise HTTPException(403, "Only super_admin can modify built-in role permissions")
        raw_perms = body["permissions"]
        invalid = validate_permissions(raw_perms)
        if invalid:
            raise HTTPException(400, f"Invalid permissions: {', '.join(invalid)}")
        expanded = sorted(expand_permission_groups(raw_perms))
        updates["permissions"] = expanded
        changes["permissions"] = {"count_before": len(role.get("permissions", [])), "count_after": len(expanded)}

    if "limits" in body:
        if role.get("is_builtin"):
            actor_perms = resolve_effective_permissions(admin["id"])
            if "admin.promote_admin" not in actor_perms:
                raise HTTPException(403, "Only super_admin can modify built-in role limits")
        updates["limits"] = body["limits"]
        changes["limits"] = True

    if not updates:
        raise HTTPException(400, "No fields to update")

    updates["updated_at"] = datetime.now(timezone.utc)
    db.roles.update_one({"_id": role_id}, {"$set": updates})
    invalidate_role_cache(role_id)

    log_event(
        "role_updated",
        actor_id=admin.get("id", ""),
        actor_username=admin.get("username", "admin"),
        target_id=role_id,
        target_type="role",
        detail=changes,
        ip_address=_get_client_ip(request),
    )

    updated = db.roles.find_one({"_id": role_id})
    return {"role": updated, "_updated": True}


# ── 16. Delete role ─────────────────────────────────────────────────

@router.delete("/admin/roles/{role_id}")
async def delete_role(request: Request, role_id: str):
    admin = _require_permission(request, "admin.roles.delete")
    db = get_platform_db()

    role = db.roles.find_one({"_id": role_id})
    if not role:
        raise HTTPException(404, "Role not found")

    if role.get("is_builtin"):
        raise HTTPException(400, "Cannot delete a built-in role")

    user_count = db.users.count_documents({"role": role_id})
    if user_count > 0:
        raise HTTPException(400, f"Cannot delete role: {user_count} user(s) still assigned")

    db.roles.delete_one({"_id": role_id})

    log_event(
        "role_deleted",
        actor_id=admin.get("id", ""),
        actor_username=admin.get("username", "admin"),
        target_id=role_id,
        target_type="role",
        detail={"display_name": role.get("display_name")},
        ip_address=_get_client_ip(request),
    )

    return {"_deleted": True}


# ── 17. Get all permissions ─────────────────────────────────────────

@router.get("/admin/permissions")
async def list_permissions(request: Request):
    _require_permission(request, "admin.roles.list")
    return {"permissions": sorted(ALL_PERMISSIONS), "groups": {k: sorted(v) for k, v in PERMISSION_GROUPS.items()}}


# ══════════════════════════════════════════════════════════════════════
# CREDIT MANAGEMENT ENDPOINTS (ADMIN)
# ══════════════════════════════════════════════════════════════════════

# ── 18. Credit usage overview ──────────────────────────────────────

@router.get("/admin/credits/overview")
async def credit_overview(request: Request):
    _require_admin(request)
    db = get_platform_db()
    now = datetime.now(timezone.utc)
    period = now.strftime("%Y-%m")

    pipeline = [
        {"$match": {"type": "debit", "period": period}},
        {"$group": {
            "_id": "$user_id",
            "total_credits": {"$sum": "$amount"},
            "total_searches": {"$sum": 1},
        }},
        {"$sort": {"total_credits": -1}},
    ]
    by_user = list(db["credit_transactions"].aggregate(pipeline))

    users_map = {}
    if by_user:
        user_ids = [e["_id"] for e in by_user]
        for u in db["users"].find({"_id": {"$in": user_ids}}, {"username": 1, "role": 1}):
            users_map[u["_id"]] = u

    user_rows = []
    total_consumed = 0
    for entry in by_user:
        uid = entry["_id"]
        u = users_map.get(uid, {})
        user_rows.append({
            "user_id": str(uid),
            "username": u.get("username", "unknown"),
            "role": u.get("role", ""),
            "credits_used": entry["total_credits"],
            "searches": entry["total_searches"],
        })
        total_consumed += entry["total_credits"]

    action_pipeline = [
        {"$match": {"type": "debit", "period": period}},
        {"$group": {"_id": "$action", "total": {"$sum": "$amount"}, "count": {"$sum": 1}}},
        {"$sort": {"total": -1}},
    ]
    top_actions = [
        {"action": a["_id"], "total": a["total"], "count": a["count"]}
        for a in db["credit_transactions"].aggregate(action_pipeline)
    ]

    return {
        "period": period,
        "users": user_rows,
        "total_credits_consumed": total_consumed,
        "top_actions": top_actions,
    }


# ── 19. Top up credits ────────────────────────────────────────────

@router.post("/admin/credits/topup")
async def topup_credits(request: Request):
    admin = _require_permission(request, "admin.users.update")
    body = await request.json()

    user_id_str = body.get("user_id", "")
    amount = body.get("amount", 0)
    if not user_id_str or not isinstance(amount, int) or amount <= 0:
        raise HTTPException(400, "Valid user_id and positive integer amount required")

    db = get_platform_db()
    user = db["users"].find_one({"_id": _to_oid(user_id_str)})
    if not user:
        raise HTTPException(404, "User not found")

    new_balance = admin_topup(_to_oid(user_id_str), amount, admin.get("username", "admin"))

    log_event(
        "credits_topup",
        actor_id=admin.get("id", ""),
        actor_username=admin.get("username", "admin"),
        target_id=user_id_str,
        target_type="user",
        detail={"amount": amount, "new_balance": new_balance, "username": user.get("username")},
        ip_address=_get_client_ip(request),
    )

    return {"ok": True, "new_balance": new_balance}


# ── 20. Update credit config ──────────────────────────────────────

@router.put("/admin/credits/config")
async def update_credit_config(request: Request):
    admin = _require_permission(request, "admin.settings.update")
    body = await request.json()
    db = get_platform_db()

    updates = {}
    if "cost_matrix" in body:
        updates["cost_matrix"] = body["cost_matrix"]
    if "role_defaults" in body:
        updates["role_defaults"] = body["role_defaults"]

    if not updates:
        raise HTTPException(400, "No fields to update")

    now = datetime.now(timezone.utc)
    db["credit_config"].update_one(
        {"_id": "global"},
        {
            "$set": {**updates, "updated_at": now},
            "$inc": {"version": 1},
        },
        upsert=True,
    )
    invalidate_config_cache()

    log_event(
        "credit_config_updated",
        actor_id=admin.get("id", ""),
        actor_username=admin.get("username", "admin"),
        target_id="credit_config",
        target_type="system",
        detail={"updated_keys": list(updates.keys())},
        ip_address=_get_client_ip(request),
    )

    return {"ok": True}


# ── 21. Browse credit transactions ────────────────────────────────

@router.get("/admin/credits/transactions")
async def list_credit_transactions(
    request: Request,
    user_id: str | None = None,
    action: str | None = None,
    period: str | None = None,
    page: int = 1,
    per_page: int = 50,
):
    _require_admin(request)
    db = get_platform_db()

    query: dict = {}
    if user_id:
        query["user_id"] = _to_oid(user_id)
    if action:
        query["action"] = action
    if period:
        query["period"] = period

    total = db["credit_transactions"].count_documents(query)
    skip = (max(page, 1) - 1) * per_page
    docs = list(
        db["credit_transactions"]
        .find(query)
        .sort("created_at", -1)
        .skip(skip)
        .limit(per_page)
    )

    for d in docs:
        d["_id"] = str(d["_id"])
        if "user_id" in d:
            d["user_id"] = str(d["user_id"])

    return {"transactions": docs, "total": total, "page": page, "per_page": per_page}


# ── 22. Adjust user credit limits ─────────────────────────────────

@router.post("/admin/credits/adjust")
async def adjust_user_credits(request: Request):
    admin = _require_permission(request, "admin.users.update")
    body = await request.json()

    user_id_str = body.get("user_id", "")
    if not user_id_str:
        raise HTTPException(400, "user_id required")

    db = get_platform_db()
    user = db["users"].find_one({"_id": _to_oid(user_id_str)})
    if not user:
        raise HTTPException(404, "User not found")

    credit_updates = {}
    if "monthly_allocation" in body:
        credit_updates["credits.monthly_allocation"] = body["monthly_allocation"]
    if "daily_limit" in body:
        credit_updates["credits.daily_limit"] = body["daily_limit"]
    if "overage_policy" in body:
        if body["overage_policy"] not in ("soft", "hard"):
            raise HTTPException(400, "overage_policy must be 'soft' or 'hard'")
        credit_updates["credits.overage_policy"] = body["overage_policy"]

    if not credit_updates:
        raise HTTPException(400, "No credit fields to update")

    credit_updates["updated_at"] = datetime.now(timezone.utc)
    db["users"].update_one({"_id": _to_oid(user_id_str)}, {"$set": credit_updates})

    log_event(
        "user_credits_adjusted",
        actor_id=admin.get("id", ""),
        actor_username=admin.get("username", "admin"),
        target_id=user_id_str,
        target_type="user",
        detail={k.replace("credits.", ""): v for k, v in credit_updates.items() if k != "updated_at"},
        ip_address=_get_client_ip(request),
    )

    return {"ok": True}
