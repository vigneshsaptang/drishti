"""
Support ticket service — create, list, detail, rate limiting, ticket ID generation.
"""
from datetime import datetime, timedelta
from bson import ObjectId
from pymongo import ReturnDocument

from app.config import settings
from app.db import get_platform_db

FEEDBACK_CATEGORIES = {"bug_report", "feature_request", "general_feedback", "question"}
SUPPORT_CATEGORIES = {"cant_search", "wrong_results", "access_denied", "performance", "other"}
SEVERITIES = {"critical", "high", "medium", "low"}
URGENCIES = {"urgent", "high", "normal", "low"}
STATUSES = {"new", "acknowledged", "in_progress", "resolved", "closed"}

VALID_TRANSITIONS = {
    "new": {"acknowledged", "in_progress", "closed"},
    "acknowledged": {"in_progress", "closed"},
    "in_progress": {"resolved", "closed"},
    "resolved": {"closed", "in_progress"},
    "closed": {"in_progress"},
}


def _generate_ticket_id() -> str:
    db = get_platform_db()
    today = datetime.utcnow().strftime("%Y%m%d")
    doc = db.ticket_counters.find_one_and_update(
        {"_id": today},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    return f"TKT-{today}-{doc['seq']:04d}"


def check_submission_rate(user_id: str) -> tuple[bool, int]:
    db = get_platform_db()
    today = datetime.utcnow().strftime("%Y-%m-%d")
    limit = settings.feedback_max_per_day

    result = db.rate_limits.find_one_and_update(
        {"user_id": ObjectId(user_id), "date": today, "count": {"$lt": limit}},
        {"$inc": {"count": 1}, "$set": {"updated_at": datetime.utcnow()}},
        upsert=False,
        return_document=ReturnDocument.AFTER,
    )
    if result:
        return True, limit - result["count"]

    existing = db.rate_limits.find_one({"user_id": ObjectId(user_id), "date": today})
    if existing is None:
        db.rate_limits.insert_one({
            "user_id": ObjectId(user_id),
            "date": today,
            "count": 1,
            "updated_at": datetime.utcnow(),
        })
        return True, limit - 1

    return False, 0


def get_remaining_submissions(user_id: str) -> int:
    db = get_platform_db()
    today = datetime.utcnow().strftime("%Y-%m-%d")
    doc = db.rate_limits.find_one({"user_id": ObjectId(user_id), "date": today})
    if not doc:
        return settings.feedback_max_per_day
    return max(0, settings.feedback_max_per_day - doc.get("count", 0))


def create_ticket(
    ticket_type: str,
    category: str,
    subject: str,
    description: str,
    user_id: str,
    username: str,
    user_role: str,
    user_email: str = "",
    severity: str | None = None,
    urgency: str | None = None,
    steps_to_reproduce: str | None = None,
    context: dict | None = None,
    attachment_ids: list[str] | None = None,
) -> dict:
    db = get_platform_db()
    ticket_id = _generate_ticket_id()
    now = datetime.utcnow()

    attachments = []
    if attachment_ids:
        for aid in attachment_ids:
            try:
                fobj = db.fs.files.find_one({"_id": ObjectId(aid), "metadata.uploader_id": ObjectId(user_id)})
                if fobj:
                    attachments.append({
                        "file_id": fobj["_id"],
                        "filename": fobj.get("filename", "file"),
                        "content_type": fobj.get("metadata", {}).get("content_type", "application/octet-stream"),
                        "size_bytes": fobj.get("length", 0),
                        "uploaded_at": fobj.get("uploadDate", now),
                    })
                    db.fs.files.update_one({"_id": fobj["_id"]}, {"$set": {"metadata.ticket_id": ticket_id}})
            except Exception:
                pass

    smtp_enabled = bool(settings.smtp_host)
    doc = {
        "ticket_id": ticket_id,
        "type": ticket_type,
        "user_id": ObjectId(user_id) if user_id else None,
        "username": username,
        "user_role": user_role,
        "user_email": user_email,
        "category": category,
        "severity": severity,
        "urgency": urgency,
        "subject": subject,
        "description": description,
        "steps_to_reproduce": steps_to_reproduce,
        "context": context or {},
        "attachments": attachments,
        "status": "new",
        "assigned_to": None,
        "assigned_to_name": None,
        "email_status": "pending" if smtp_enabled else "skipped",
        "email_attempts": 0,
        "email_error": None,
        "email_sent_at": None,
        "internal_notes": [],
        "replies": [],
        "created_at": now,
        "updated_at": now,
        "resolved_at": None,
        "closed_at": None,
    }
    db.support_tickets.insert_one(doc)
    return doc


def get_user_tickets(user_id: str, status: str | None = None, page: int = 1, per_page: int = 20) -> dict:
    db = get_platform_db()
    query = {"user_id": ObjectId(user_id)}
    if status:
        if status == "open":
            query["status"] = {"$in": ["new", "acknowledged", "in_progress"]}
        elif status == "closed":
            query["status"] = {"$in": ["resolved", "closed"]}
        else:
            query["status"] = status

    total = db.support_tickets.count_documents(query)
    tickets = list(
        db.support_tickets.find(query, {
            "ticket_id": 1, "type": 1, "category": 1, "severity": 1,
            "urgency": 1, "subject": 1, "status": 1, "created_at": 1,
            "updated_at": 1, "replies": 1,
        })
        .sort("created_at", -1)
        .skip((page - 1) * per_page)
        .limit(per_page)
    )
    for t in tickets:
        t["reply_count"] = len(t.get("replies", []))
        t.pop("replies", None)
    return {"tickets": tickets, "total": total, "page": page, "per_page": per_page}


def get_user_ticket_detail(user_id: str, ticket_id: str) -> dict | None:
    db = get_platform_db()
    ticket = db.support_tickets.find_one(
        {"ticket_id": ticket_id, "user_id": ObjectId(user_id)},
        {"internal_notes": 0, "email_status": 0, "email_attempts": 0, "email_error": 0, "email_sent_at": 0},
    )
    return ticket


def get_admin_tickets(
    status: str | None = None,
    ticket_type: str | None = None,
    category: str | None = None,
    severity: str | None = None,
    assigned_to: str | None = None,
    search: str | None = None,
    sort_field: str = "created_at",
    sort_order: str = "desc",
    page: int = 1,
    per_page: int = 30,
) -> dict:
    db = get_platform_db()
    query = {}
    if status:
        query["status"] = status
    if ticket_type:
        query["type"] = ticket_type
    if category:
        query["category"] = category
    if severity:
        query["severity"] = severity
    if assigned_to:
        query["assigned_to"] = ObjectId(assigned_to) if assigned_to != "unassigned" else None
    if search:
        query["$or"] = [
            {"subject": {"$regex": search, "$options": "i"}},
            {"description": {"$regex": search, "$options": "i"}},
            {"ticket_id": {"$regex": search, "$options": "i"}},
        ]

    direction = -1 if sort_order == "desc" else 1
    total = db.support_tickets.count_documents(query)

    counts = {}
    for s in STATUSES:
        counts[s] = db.support_tickets.count_documents({"status": s})

    tickets = list(
        db.support_tickets.find(query, {
            "ticket_id": 1, "type": 1, "category": 1, "severity": 1,
            "subject": 1, "username": 1, "user_role": 1, "status": 1,
            "email_status": 1, "assigned_to_name": 1,
            "attachments": 1, "replies": 1, "internal_notes": 1,
            "created_at": 1, "updated_at": 1,
        })
        .sort(sort_field, direction)
        .skip((page - 1) * per_page)
        .limit(per_page)
    )
    for t in tickets:
        t["attachment_count"] = len(t.get("attachments", []))
        t["reply_count"] = len(t.get("replies", []))
        t["internal_note_count"] = len(t.get("internal_notes", []))
        t.pop("attachments", None)
        t.pop("replies", None)
        t.pop("internal_notes", None)

    return {"tickets": tickets, "total": total, "page": page, "per_page": per_page, "counts": counts}


def get_admin_ticket_detail(ticket_id: str) -> dict | None:
    db = get_platform_db()
    return db.support_tickets.find_one({"ticket_id": ticket_id})


def update_ticket_status(ticket_id: str, new_status: str, admin_id: str) -> dict | None:
    db = get_platform_db()
    ticket = db.support_tickets.find_one({"ticket_id": ticket_id})
    if not ticket:
        return None
    current = ticket["status"]
    if new_status not in VALID_TRANSITIONS.get(current, set()):
        return None

    now = datetime.utcnow()
    update = {"$set": {"status": new_status, "updated_at": now}}
    if new_status == "resolved":
        update["$set"]["resolved_at"] = now
    if new_status == "closed":
        update["$set"]["closed_at"] = now

    db.support_tickets.update_one({"ticket_id": ticket_id}, update)
    return {"ticket_id": ticket_id, "status": new_status, "previous_status": current, "updated_at": now}


def assign_ticket(ticket_id: str, assignee_id: str | None) -> dict | None:
    db = get_platform_db()
    ticket = db.support_tickets.find_one({"ticket_id": ticket_id})
    if not ticket:
        return None

    assignee_name = None
    if assignee_id:
        user = db.users.find_one({"_id": ObjectId(assignee_id)})
        assignee_name = user["username"] if user else None

    now = datetime.utcnow()
    db.support_tickets.update_one(
        {"ticket_id": ticket_id},
        {"$set": {
            "assigned_to": ObjectId(assignee_id) if assignee_id else None,
            "assigned_to_name": assignee_name,
            "updated_at": now,
        }},
    )
    return {"ticket_id": ticket_id, "assigned_to": assignee_id, "assigned_to_name": assignee_name}


def add_internal_note(ticket_id: str, author_id: str, author_name: str, content: str) -> dict | None:
    db = get_platform_db()
    now = datetime.utcnow()
    note = {
        "note_id": ObjectId(),
        "author_id": ObjectId(author_id),
        "author_name": author_name,
        "content": content,
        "created_at": now,
    }
    result = db.support_tickets.update_one(
        {"ticket_id": ticket_id},
        {"$push": {"internal_notes": note}, "$set": {"updated_at": now}},
    )
    if result.modified_count == 0:
        return None
    return note


def add_reply(ticket_id: str, author_id: str, author_name: str, content: str, send_email: bool = True) -> dict | None:
    db = get_platform_db()
    now = datetime.utcnow()
    smtp_on = bool(settings.smtp_host)
    reply = {
        "reply_id": ObjectId(),
        "author_id": ObjectId(author_id),
        "author_name": author_name,
        "content": content,
        "reply_email_status": "pending" if (send_email and smtp_on) else "skipped",
        "created_at": now,
    }
    result = db.support_tickets.update_one(
        {"ticket_id": ticket_id},
        {"$push": {"replies": reply}, "$set": {"updated_at": now}},
    )
    if result.modified_count == 0:
        return None
    return reply


def update_email_status(ticket_id: str, status: str, error: str | None = None):
    db = get_platform_db()
    update = {"email_status": status, "email_attempts": 1}
    if status == "sent":
        update["email_sent_at"] = datetime.utcnow()
    if error:
        update["email_error"] = error
    db.support_tickets.update_one({"ticket_id": ticket_id}, {"$set": update})
