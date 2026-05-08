"""
Input sanitization — entity-type-aware validation and regex escaping for MongoDB.
"""
import re
import html


def sanitize_search_value(value: str, entity_type: str) -> str:
    value = value.strip().replace("\x00", "")

    if entity_type == "phone":
        cleaned = re.sub(r"[^\d+]", "", value)
        if not cleaned or len(cleaned) < 7 or len(cleaned) > 16:
            raise ValueError("Invalid phone number format")
        return cleaned

    elif entity_type == "email":
        value = value.lower()
        if not re.match(r"^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$", value):
            raise ValueError("Invalid email format")
        if len(value) > 254:
            raise ValueError("Email too long")
        return value

    elif entity_type == "username":
        if not re.match(r"^[a-zA-Z0-9._\-]{1,50}$", value):
            raise ValueError("Invalid username format")
        return value

    elif entity_type == "fullname":
        if not re.match(r"^[a-zA-Z\s.'\-]{2,100}$", value):
            raise ValueError("Invalid name format")
        return value

    if len(value) > 200:
        raise ValueError("Input too long")
    return value


def safe_regex(value: str) -> str:
    return re.escape(value)


def sanitize_output(value: str) -> str:
    if not isinstance(value, str):
        return value
    return html.escape(value, quote=True)
