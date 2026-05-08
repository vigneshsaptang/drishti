"""
In-app notification service — create, list, mark read, unread count.
"""
from datetime import datetime, timedelta
from bson import ObjectId

from app.db import get_platform_db

NOTIFICATION_TTL_DAYS = 90


def create_notification(
    user_id: str,
    notification_type: str,
    title: str,
    body: str,
    link: dict | None = None,
):
    db = get_platform_db()
    now = datetime.utcnow()
    doc = {
        "user_id": ObjectId(user_id),
        "type": notification_type,
        "title": title,
        "body": body,
        "read": False,
        "read_at": None,
        "link": link,
        "created_at": now,
        "expires_at": now + timedelta(days=NOTIFICATION_TTL_DAYS),
    }
    db.notifications.insert_one(doc)
    return doc


def notify_all_active_users(notification_type: str, title: str, body: str, link: dict | None = None):
    db = get_platform_db()
    users = db.users.find({"status": {"$ne": "disabled"}}, {"_id": 1})
    now = datetime.utcnow()
    docs = []
    for u in users:
        docs.append({
            "user_id": u["_id"],
            "type": notification_type,
            "title": title,
            "body": body,
            "read": False,
            "read_at": None,
            "link": link,
            "created_at": now,
            "expires_at": now + timedelta(days=NOTIFICATION_TTL_DAYS),
        })
    if docs:
        db.notifications.insert_many(docs)


def get_unread_count(user_id: str) -> int:
    db = get_platform_db()
    return db.notifications.count_documents({"user_id": ObjectId(user_id), "read": False})


def get_notifications(user_id: str, unread_only: bool = False, page: int = 1, per_page: int = 20) -> dict:
    db = get_platform_db()
    query = {"user_id": ObjectId(user_id)}
    if unread_only:
        query["read"] = False

    total = db.notifications.count_documents(query)
    unread = db.notifications.count_documents({"user_id": ObjectId(user_id), "read": False})
    items = list(
        db.notifications.find(query)
        .sort([("read", 1), ("created_at", -1)])
        .skip((page - 1) * per_page)
        .limit(per_page)
    )
    return {
        "notifications": items,
        "total": total,
        "unread_count": unread,
        "page": page,
        "per_page": per_page,
    }


def mark_read(user_id: str, notification_id: str) -> bool:
    db = get_platform_db()
    result = db.notifications.update_one(
        {"_id": ObjectId(notification_id), "user_id": ObjectId(user_id)},
        {"$set": {"read": True, "read_at": datetime.utcnow()}},
    )
    return result.modified_count > 0


def mark_all_read(user_id: str) -> int:
    db = get_platform_db()
    result = db.notifications.update_many(
        {"user_id": ObjectId(user_id), "read": False},
        {"$set": {"read": True, "read_at": datetime.utcnow()}},
    )
    return result.modified_count
