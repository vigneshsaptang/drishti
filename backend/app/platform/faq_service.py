"""
FAQ / knowledge base service — CRUD for admin-editable help articles.
"""
import re
from datetime import datetime
from bson import ObjectId

from app.db import get_platform_db

FAQ_CATEGORIES = {"getting_started", "searching", "engines", "account", "troubleshooting"}


def _slugify(title: str) -> str:
    slug = re.sub(r"[^a-z0-9\s-]", "", title.lower().strip())
    slug = re.sub(r"[\s]+", "-", slug)
    return slug[:80]


def _unique_slug(db, base_slug: str, exclude_id=None) -> str:
    slug = base_slug
    suffix = 0
    while True:
        query = {"slug": slug}
        if exclude_id:
            query["_id"] = {"$ne": exclude_id}
        if not db.faq_entries.find_one(query):
            return slug
        suffix += 1
        slug = f"{base_slug}-{suffix}"


def create_entry(
    title: str,
    category: str,
    content: str,
    author_id: str,
    author_name: str,
    tags: list[str] | None = None,
    order: int = 0,
    published: bool = False,
) -> dict:
    db = get_platform_db()
    slug = _unique_slug(db, _slugify(title))
    now = datetime.utcnow()
    doc = {
        "slug": slug,
        "title": title,
        "category": category,
        "content": content,
        "tags": tags or [],
        "order": order,
        "published": published,
        "author_id": ObjectId(author_id),
        "author_name": author_name,
        "created_at": now,
        "updated_at": now,
        "view_count": 0,
    }
    db.faq_entries.insert_one(doc)
    return doc


def update_entry(slug: str, updates: dict) -> dict | None:
    db = get_platform_db()
    existing = db.faq_entries.find_one({"slug": slug})
    if not existing:
        return None
    allowed = {"title", "category", "content", "tags", "order", "published"}
    filtered = {k: v for k, v in updates.items() if k in allowed}
    if not filtered:
        return existing
    filtered["updated_at"] = datetime.utcnow()
    db.faq_entries.update_one({"slug": slug}, {"$set": filtered})
    return db.faq_entries.find_one({"slug": slug})


def delete_entry(slug: str) -> bool:
    db = get_platform_db()
    result = db.faq_entries.delete_one({"slug": slug})
    return result.deleted_count > 0


def list_entries(
    category: str | None = None,
    q: str | None = None,
    published_only: bool = True,
    limit: int = 50,
) -> dict:
    db = get_platform_db()
    query = {}
    if published_only:
        query["published"] = True
    if category:
        query["category"] = category

    if q and len(q) >= 3:
        query["$or"] = [
            {"title": {"$regex": q, "$options": "i"}},
            {"content": {"$regex": q, "$options": "i"}},
            {"tags": {"$regex": q, "$options": "i"}},
        ]

    entries = list(
        db.faq_entries.find(query)
        .sort([("category", 1), ("order", 1)])
        .limit(limit)
    )
    return {"entries": entries, "total": len(entries)}


def get_by_slug(slug: str, increment_view: bool = True) -> dict | None:
    db = get_platform_db()
    entry = db.faq_entries.find_one({"slug": slug})
    if entry and increment_view:
        db.faq_entries.update_one({"slug": slug}, {"$inc": {"view_count": 1}})
    return entry


def suggest(q: str, limit: int = 3) -> list[dict]:
    if not q or len(q) < 3:
        return []
    db = get_platform_db()
    entries = list(
        db.faq_entries.find(
            {
                "published": True,
                "$or": [
                    {"title": {"$regex": q, "$options": "i"}},
                    {"tags": {"$regex": q, "$options": "i"}},
                ],
            },
            {"slug": 1, "title": 1, "category": 1},
        ).limit(limit)
    )
    return entries
