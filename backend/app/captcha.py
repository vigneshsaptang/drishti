"""
SVG-based math CAPTCHA with HMAC anti-replay — stateless verification, no external deps.
"""
import base64
import hashlib
import hmac
import random
import time
import uuid
from collections import OrderedDict

from app.config import settings

_USED_IDS: OrderedDict[str, float] = OrderedDict()
_MAX_USED = 10_000
_CAPTCHA_TTL = 300


def _record_used(captcha_id: str, expires_at: float):
    while _USED_IDS and len(_USED_IDS) > _MAX_USED:
        _USED_IDS.popitem(last=False)
    _USED_IDS[captcha_id] = expires_at


def _is_used(captcha_id: str) -> bool:
    return captcha_id in _USED_IDS


def _generate_math_challenge() -> tuple[str, str]:
    op = random.choice(["+", "-", "*"])
    if op == "+":
        a, b = random.randint(1, 50), random.randint(1, 50)
        return f"{a} + {b}", str(a + b)
    elif op == "-":
        a = random.randint(10, 60)
        b = random.randint(1, a)
        return f"{a} - {b}", str(a - b)
    else:
        a, b = random.randint(2, 12), random.randint(2, 9)
        return f"{a} x {b}", str(a * b)


def _render_svg(text: str) -> str:
    width, height = 200, 70
    chars = list(text)
    svg_parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}">',
        f'<rect width="{width}" height="{height}" fill="#f0f0f3"/>',
    ]
    for _ in range(5):
        x1, y1 = random.randint(0, width), random.randint(0, height)
        x2, y2 = random.randint(0, width), random.randint(0, height)
        color = f"#{random.randint(0x80, 0xCC):02x}{random.randint(0x80, 0xCC):02x}{random.randint(0x80, 0xCC):02x}"
        svg_parts.append(
            f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" '
            f'stroke="{color}" stroke-width="1"/>'
        )
    for _ in range(30):
        cx, cy = random.randint(0, width), random.randint(0, height)
        r = round(random.uniform(0.5, 2.0), 1)
        color = f"#{random.randint(0x70, 0xBB):02x}{random.randint(0x70, 0xBB):02x}{random.randint(0x70, 0xBB):02x}"
        svg_parts.append(f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{color}"/>')
    spacing = (width - 30) / max(len(chars), 1)
    fonts = ["monospace", "serif", "sans-serif"]
    for i, ch in enumerate(chars):
        x = 15 + i * spacing + random.randint(-3, 3)
        y = 42 + random.randint(-8, 8)
        angle = random.randint(-25, 25)
        size = random.randint(22, 30)
        font = random.choice(fonts)
        color = f"#{random.randint(0x10, 0x50):02x}{random.randint(0x10, 0x50):02x}{random.randint(0x10, 0x50):02x}"
        svg_parts.append(
            f'<text x="{x}" y="{y}" font-size="{size}" font-family="{font}" '
            f'fill="{color}" transform="rotate({angle},{x},{y})">{ch}</text>'
        )
    svg_parts.append("</svg>")
    return "".join(svg_parts)


def _get_secret() -> bytes:
    return settings.saptang_jwt_secret.encode("utf-8")


def generate_captcha() -> dict:
    display, answer = _generate_math_challenge()
    captcha_id = str(uuid.uuid4())
    expires_at = int(time.time()) + _CAPTCHA_TTL

    payload = f"{captcha_id}:{answer}:{expires_at}"
    mac = hmac.new(_get_secret(), payload.encode(), hashlib.sha256).hexdigest()
    token = f"{captcha_id}:{expires_at}:{mac}"

    svg = _render_svg(display)
    image_b64 = base64.b64encode(svg.encode()).decode()

    return {
        "captcha_token": token,
        "image": f"data:image/svg+xml;base64,{image_b64}",
        "expires_at": expires_at,
    }


def verify_captcha(token: str, answer: str) -> tuple[bool, str]:
    if not token or not answer:
        return False, "Missing CAPTCHA token or answer"

    parts = token.split(":")
    if len(parts) != 3:
        return False, "Malformed CAPTCHA token"

    captcha_id, expires_at_str, mac_given = parts

    try:
        expires_at = int(expires_at_str)
    except ValueError:
        return False, "Malformed CAPTCHA token"

    if time.time() > expires_at:
        return False, "CAPTCHA expired"

    if _is_used(captcha_id):
        return False, "CAPTCHA already used"

    answer = answer.strip()
    payload = f"{captcha_id}:{answer}:{expires_at}"
    mac_expected = hmac.new(_get_secret(), payload.encode(), hashlib.sha256).hexdigest()

    if not hmac.compare_digest(mac_given, mac_expected):
        return False, "Incorrect CAPTCHA answer"

    _record_used(captcha_id, expires_at)
    return True, ""
