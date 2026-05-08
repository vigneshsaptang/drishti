"""
Support, Feedback & Knowledge Base — all /api/support/* endpoints.
"""
import logging
import re
from datetime import datetime
from io import BytesIO

from bson import ObjectId
from fastapi import APIRouter, BackgroundTasks, HTTPException, Request, UploadFile, File
from fastapi.responses import StreamingResponse
from gridfs import GridIn
from pymongo import MongoClient

from app.config import settings
from app.db import get_platform_db
from app.platform.ticket_service import (
    FEEDBACK_CATEGORIES, SUPPORT_CATEGORIES, SEVERITIES, URGENCIES,
    VALID_TRANSITIONS,
    check_submission_rate, get_remaining_submissions,
    create_ticket, get_user_tickets, get_user_ticket_detail,
    get_admin_tickets, get_admin_ticket_detail,
    update_ticket_status, assign_ticket,
    add_internal_note, add_reply, update_email_status,
)
from app.platform.notification_service import (
    create_notification, notify_all_active_users,
    get_unread_count, get_notifications,
    mark_read, mark_all_read,
)
from app.platform.faq_service import (
    FAQ_CATEGORIES,
    create_entry as faq_create, update_entry as faq_update,
    delete_entry as faq_delete, list_entries as faq_list,
    get_by_slug as faq_get, suggest as faq_suggest,
)
from app.platform.status_service import (
    get_system_status, create_status_message,
    update_status_message, list_all_messages,
)
from app.platform.email_service import smtp_enabled

logger = logging.getLogger("auracle.support")
router = APIRouter(prefix="/support", tags=["support"])

ALLOWED_MIME = {"image/png", "image/jpeg", "image/gif", "image/webp"}
MAGIC_BYTES = {
    b"\x89PNG": "image/png",
    b"\xff\xd8\xff": "image/jpeg",
    b"GIF8": "image/gif",
    b"RIFF": "image/webp",
}


def _get_user(request: Request) -> dict:
    user = getattr(request.state, "user", None)
    if not user:
        raise HTTPException(401, "Not authenticated")
    return user


def _require_admin(request: Request) -> dict:
    user = _get_user(request)
    role = user.get("role", "")
    if role not in ("admin", "super_admin"):
        raise HTTPException(403, "Admin access required")
    return user


def _sanitize_filename(name: str) -> str:
    name = name.rsplit("/", 1)[-1].rsplit("\\", 1)[-1]
    name = re.sub(r"[^\w\s\-.]", "", name)
    return name[:100] or "file"


# ═══════════════════════════════════════════════════════════════
# Config
# ═══════════════════════════════════════════════════════════════

@router.get("/config")
async def support_config(request: Request):
    user = _get_user(request)
    remaining = get_remaining_submissions(user["id"])
    return {
        "email_enabled": smtp_enabled(),
        "max_attachment_size_bytes": settings.feedback_max_attachment_bytes,
        "max_attachments": settings.feedback_max_attachments,
        "allowed_attachment_types": list(ALLOWED_MIME),
        "max_submissions_per_day": settings.feedback_max_per_day,
        "remaining_submissions_today": remaining,
        "faq_enabled": True,
    }


# ═══════════════════════════════════════════════════════════════
# Ticket endpoints (user)
# ═══════════════════════════════════════════════════════════════

def _send_ticket_email_background(ticket_id: str):
    try:
        from app.platform.email_service import send_ticket_email
        db = get_platform_db()
        ticket = db.support_tickets.find_one({"ticket_id": ticket_id})
        if not ticket:
            return
        success = send_ticket_email(ticket)
        update_email_status(ticket_id, "sent" if success else "failed",
                            None if success else "SMTP delivery failed after retries")
    except Exception as e:
        logger.error("Background email send failed for %s: %s", ticket_id, e)
        update_email_status(ticket_id, "failed", str(e)[:500])


@router.post("/tickets", status_code=201)
async def create_ticket_endpoint(request: Request, background_tasks: BackgroundTasks):
    user = _get_user(request)
    body = await request.json()

    ticket_type = body.get("type", "")
    if ticket_type not in ("feedback", "support"):
        raise HTTPException(400, "type must be 'feedback' or 'support'")

    category = body.get("category", "")
    valid_cats = FEEDBACK_CATEGORIES if ticket_type == "feedback" else SUPPORT_CATEGORIES
    if category not in valid_cats:
        raise HTTPException(400, f"Invalid category for {ticket_type}")

    subject = (body.get("subject") or "").strip()
    if not subject or len(subject) < 5 or len(subject) > 200:
        raise HTTPException(400, "Subject must be 5-200 characters")

    description = (body.get("description") or "").strip()
    if not description or len(description) < 10 or len(description) > 5000:
        raise HTTPException(400, "Description must be 10-5000 characters")

    severity = body.get("severity")
    if severity and severity not in SEVERITIES:
        raise HTTPException(400, "Invalid severity")
    urgency = body.get("urgency")
    if urgency and urgency not in URGENCIES:
        raise HTTPException(400, "Invalid urgency")

    steps = body.get("steps_to_reproduce")
    if steps and len(steps) > 3000:
        raise HTTPException(400, "Steps to reproduce max 3000 characters")

    if user.get("role") != "super_admin":
        allowed, remaining = check_submission_rate(user["id"])
        if not allowed:
            secs_until_midnight = 86400 - (datetime.utcnow().hour * 3600 + datetime.utcnow().minute * 60 + datetime.utcnow().second)
            raise HTTPException(429, detail="Daily submission limit reached. You can submit again tomorrow.",
                                headers={"Retry-After": str(secs_until_midnight)})

    db = get_platform_db()
    user_doc = db.users.find_one({"_id": ObjectId(user["id"])})
    user_email = (user_doc or {}).get("email", "")

    ticket = create_ticket(
        ticket_type=ticket_type,
        category=category,
        subject=subject,
        description=description,
        user_id=user["id"],
        username=user.get("username", ""),
        user_role=user.get("role", ""),
        user_email=user_email,
        severity=severity,
        urgency=urgency,
        steps_to_reproduce=steps,
        context=body.get("context"),
        attachment_ids=body.get("attachment_ids"),
    )

    if smtp_enabled():
        background_tasks.add_task(_send_ticket_email_background, ticket["ticket_id"])

    email_queued = smtp_enabled()
    msg = "Your feedback has been recorded and sent to the support team." if email_queued else "Your feedback has been recorded."
    return {"ticket_id": ticket["ticket_id"], "status": "new", "email_queued": email_queued, "message": msg}


@router.get("/tickets/mine")
async def list_my_tickets(request: Request, status: str | None = None, page: int = 1, per_page: int = 20):
    user = _get_user(request)
    per_page = min(per_page, 50)
    return get_user_tickets(user["id"], status, page, per_page)


@router.get("/tickets/mine/{ticket_id}")
async def my_ticket_detail(request: Request, ticket_id: str):
    user = _get_user(request)
    ticket = get_user_ticket_detail(user["id"], ticket_id)
    if not ticket:
        raise HTTPException(404, "Ticket not found")
    return ticket


@router.get("/tickets/{ticket_id}/attachment/{file_id}")
async def download_attachment(request: Request, ticket_id: str, file_id: str):
    user = _get_user(request)
    db = get_platform_db()

    ticket = db.support_tickets.find_one({"ticket_id": ticket_id})
    if not ticket:
        raise HTTPException(404, "Ticket not found")

    is_admin = user.get("role") in ("admin", "super_admin")
    is_owner = ticket.get("user_id") and str(ticket["user_id"]) == user["id"]
    if not is_admin and not is_owner:
        raise HTTPException(403, "Access denied")

    from gridfs import GridFS
    fs = GridFS(db)
    try:
        grid_out = fs.get(ObjectId(file_id))
    except Exception:
        raise HTTPException(404, "File not found")

    content_type = grid_out.metadata.get("content_type", "application/octet-stream") if grid_out.metadata else "application/octet-stream"
    filename = grid_out.filename or "file"

    return StreamingResponse(
        grid_out,
        media_type=content_type,
        headers={
            "Content-Disposition": f'inline; filename="{filename}"',
            "Cache-Control": "private, max-age=3600",
        },
    )


# ═══════════════════════════════════════════════════════════════
# File upload
# ═══════════════════════════════════════════════════════════════

@router.post("/upload", status_code=201)
async def upload_file(request: Request, file: UploadFile = File(...)):
    user = _get_user(request)

    content_type = file.content_type or ""
    if content_type not in ALLOWED_MIME:
        raise HTTPException(400, f"File type not allowed. Accepted: {', '.join(ALLOWED_MIME)}")

    data = await file.read()
    if len(data) > settings.feedback_max_attachment_bytes:
        raise HTTPException(413, f"File too large. Max {settings.feedback_max_attachment_bytes // (1024*1024)} MB")

    detected = None
    for magic, mime in MAGIC_BYTES.items():
        if data[:len(magic)] == magic:
            detected = mime
            break
    if detected and detected != content_type:
        content_type = detected

    filename = _sanitize_filename(file.filename or "upload.png")
    db = get_platform_db()

    from gridfs import GridFS
    from datetime import timedelta
    fs = GridFS(db)
    now = datetime.utcnow()
    file_id = fs.put(
        data,
        filename=filename,
        metadata={
            "uploader_id": ObjectId(user["id"]),
            "content_type": content_type,
            "uploaded_at": now,
            "ticket_id": None,
            "temp_upload_expires_at": now + timedelta(hours=1),
        },
    )
    return {
        "file_id": str(file_id),
        "filename": filename,
        "content_type": content_type,
        "size_bytes": len(data),
    }


# ═══════════════════════════════════════════════════════════════
# Admin ticket endpoints
# ═══════════════════════════════════════════════════════════════

@router.get("/admin/tickets")
async def admin_list_tickets(
    request: Request,
    status: str | None = None,
    type: str | None = None,
    category: str | None = None,
    severity: str | None = None,
    assigned_to: str | None = None,
    search: str | None = None,
    sort: str = "created_at",
    order: str = "desc",
    page: int = 1,
    per_page: int = 30,
):
    _require_admin(request)
    per_page = min(per_page, 100)
    return get_admin_tickets(status, type, category, severity, assigned_to, search, sort, order, page, per_page)


@router.get("/admin/tickets/{ticket_id}")
async def admin_ticket_detail(request: Request, ticket_id: str):
    _require_admin(request)
    ticket = get_admin_ticket_detail(ticket_id)
    if not ticket:
        raise HTTPException(404, "Ticket not found")
    return ticket


@router.patch("/admin/tickets/{ticket_id}/status")
async def admin_update_status(request: Request, ticket_id: str, background_tasks: BackgroundTasks):
    user = _require_admin(request)
    body = await request.json()
    new_status = body.get("status", "")
    if new_status not in ("new", "acknowledged", "in_progress", "resolved", "closed"):
        raise HTTPException(400, "Invalid status")

    result = update_ticket_status(ticket_id, new_status, user["id"])
    if not result:
        raise HTTPException(400, "Invalid status transition or ticket not found")

    ticket = get_admin_ticket_detail(ticket_id)
    if ticket and ticket.get("user_id"):
        create_notification(
            user_id=str(ticket["user_id"]),
            notification_type="ticket_status_changed",
            title=f"Ticket {ticket_id} updated",
            body=f"Status changed to: {new_status.replace('_', ' ').title()}",
            link={"target": "ticket_detail", "ticket_id": ticket_id},
        )

        if smtp_enabled():
            def _send():
                try:
                    from app.platform.email_service import send_status_notification_email
                    send_status_notification_email(ticket, result["previous_status"], new_status)
                except Exception as e:
                    logger.error("Status email failed: %s", e)
            background_tasks.add_task(_send)

    return result


@router.patch("/admin/tickets/{ticket_id}/assign")
async def admin_assign_ticket(request: Request, ticket_id: str):
    _require_admin(request)
    body = await request.json()
    assignee_id = body.get("user_id")
    result = assign_ticket(ticket_id, assignee_id)
    if not result:
        raise HTTPException(404, "Ticket not found")
    return result


@router.post("/admin/tickets/{ticket_id}/notes", status_code=201)
async def admin_add_note(request: Request, ticket_id: str):
    user = _require_admin(request)
    body = await request.json()
    content = (body.get("content") or "").strip()
    if not content or len(content) > 2000:
        raise HTTPException(400, "Note content must be 1-2000 characters")
    note = add_internal_note(ticket_id, user["id"], user.get("username", "admin"), content)
    if not note:
        raise HTTPException(404, "Ticket not found")
    return note


@router.post("/admin/tickets/{ticket_id}/reply", status_code=201)
async def admin_reply_ticket(request: Request, ticket_id: str, background_tasks: BackgroundTasks):
    user = _require_admin(request)
    body = await request.json()
    content = (body.get("content") or "").strip()
    if not content or len(content) > 5000:
        raise HTTPException(400, "Reply content must be 1-5000 characters")
    send_email = body.get("send_email", True)

    reply = add_reply(ticket_id, user["id"], user.get("username", "admin"), content, send_email)
    if not reply:
        raise HTTPException(404, "Ticket not found")

    ticket = get_admin_ticket_detail(ticket_id)
    if ticket and ticket.get("user_id"):
        create_notification(
            user_id=str(ticket["user_id"]),
            notification_type="ticket_reply",
            title=f"Reply on {ticket_id}",
            body=f"{user.get('username', 'Admin')} replied to your ticket",
            link={"target": "ticket_detail", "ticket_id": ticket_id},
        )

        if send_email and smtp_enabled():
            def _send():
                try:
                    from app.platform.email_service import send_reply_email
                    send_reply_email(ticket, reply)
                except Exception as e:
                    logger.error("Reply email failed: %s", e)
            background_tasks.add_task(_send)

    return reply


# ═══════════════════════════════════════════════════════════════
# FAQ endpoints
# ═══════════════════════════════════════════════════════════════

@router.get("/faq")
async def list_faq(request: Request, category: str | None = None, q: str | None = None, limit: int = 50):
    _get_user(request)
    limit = min(limit, 200)
    return faq_list(category, q, published_only=True, limit=limit)


@router.get("/faq/suggest")
async def suggest_faq(request: Request, q: str = "", limit: int = 3):
    _get_user(request)
    if len(q) < 3:
        return {"suggestions": []}
    return {"suggestions": faq_suggest(q, min(limit, 5))}


@router.get("/faq/{slug}")
async def get_faq(request: Request, slug: str):
    _get_user(request)
    entry = faq_get(slug, increment_view=True)
    if not entry:
        raise HTTPException(404, "FAQ entry not found")
    return entry


@router.post("/admin/faq", status_code=201)
async def admin_create_faq(request: Request):
    user = _require_admin(request)
    body = await request.json()

    title = (body.get("title") or "").strip()
    if not title or len(title) < 5 or len(title) > 200:
        raise HTTPException(400, "Title must be 5-200 characters")
    category = body.get("category", "")
    if category not in FAQ_CATEGORIES:
        raise HTTPException(400, f"Invalid category. Must be one of: {', '.join(FAQ_CATEGORIES)}")
    content = (body.get("content") or "").strip()
    if not content or len(content) < 10 or len(content) > 10000:
        raise HTTPException(400, "Content must be 10-10000 characters")

    tags = body.get("tags", [])
    if len(tags) > 10:
        raise HTTPException(400, "Max 10 tags")

    entry = faq_create(
        title=title, category=category, content=content,
        author_id=user["id"], author_name=user.get("username", "admin"),
        tags=tags, order=body.get("order", 0), published=body.get("published", False),
    )
    return {"slug": entry["slug"], "title": entry["title"], "category": entry["category"],
            "published": entry["published"], "created_at": entry["created_at"]}


@router.put("/admin/faq/{slug}")
async def admin_update_faq(request: Request, slug: str):
    _require_admin(request)
    body = await request.json()
    entry = faq_update(slug, body)
    if not entry:
        raise HTTPException(404, "FAQ entry not found")
    return entry


@router.delete("/admin/faq/{slug}")
async def admin_delete_faq(request: Request, slug: str):
    _require_admin(request)
    if not faq_delete(slug):
        raise HTTPException(404, "FAQ entry not found")
    return {"deleted": True, "slug": slug}


# ═══════════════════════════════════════════════════════════════
# Status endpoints
# ═══════════════════════════════════════════════════════════════

@router.get("/status")
async def system_status(request: Request):
    _get_user(request)
    return get_system_status()


@router.post("/admin/status", status_code=201)
async def admin_create_status(request: Request):
    user = _require_admin(request)
    body = await request.json()

    message = (body.get("message") or "").strip()
    if not message or len(message) < 5 or len(message) > 500:
        raise HTTPException(400, "Message must be 5-500 characters")
    severity = body.get("severity", "")
    if severity not in ("info", "warning", "critical"):
        raise HTTPException(400, "Severity must be info, warning, or critical")

    expires_at = None
    if body.get("expires_at"):
        try:
            expires_at = datetime.fromisoformat(body["expires_at"].replace("Z", "+00:00"))
        except (ValueError, AttributeError):
            raise HTTPException(400, "Invalid expires_at format")

    doc = create_status_message(message, severity, user["id"], user.get("username", "admin"), expires_at)

    if severity in ("critical", "warning"):
        notify_all_active_users(
            "system_announcement",
            f"System {severity}: {message[:60]}",
            message,
            {"target": "status"},
        )

    return doc


@router.patch("/admin/status/{message_id}")
async def admin_update_status(request: Request, message_id: str):
    _require_admin(request)
    body = await request.json()
    result = update_status_message(message_id, body)
    if not result:
        raise HTTPException(404, "Status message not found")
    return result


@router.get("/admin/status")
async def admin_list_status(request: Request):
    _require_admin(request)
    return list_all_messages()


# ═══════════════════════════════════════════════════════════════
# Notification endpoints
# ═══════════════════════════════════════════════════════════════

@router.get("/notifications")
async def list_notifications(request: Request, unread_only: bool = False, page: int = 1, per_page: int = 20):
    user = _get_user(request)
    per_page = min(per_page, 50)
    return get_notifications(user["id"], unread_only, page, per_page)


@router.get("/notifications/unread-count")
async def unread_notification_count(request: Request):
    user = _get_user(request)
    return {"unread_count": get_unread_count(user["id"])}


@router.patch("/notifications/{notification_id}/read")
async def mark_notification_read(request: Request, notification_id: str):
    user = _get_user(request)
    if not mark_read(user["id"], notification_id):
        raise HTTPException(404, "Notification not found")
    return {"read": True}


@router.post("/notifications/mark-all-read")
async def mark_all_notifications_read(request: Request):
    user = _get_user(request)
    count = mark_all_read(user["id"])
    return {"marked": count}
