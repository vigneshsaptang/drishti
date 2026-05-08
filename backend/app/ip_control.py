"""
IP allowlist / blocklist — CIDR-aware, with dynamic block support from brute force tracker.
"""
import ipaddress
import time
import threading
from dataclasses import dataclass, field

from app.config import settings


@dataclass
class IPControlList:
    allowlist: set[str] = field(default_factory=set)
    blocklist: set[str] = field(default_factory=set)
    dynamic_blocks: dict[str, float] = field(default_factory=dict)
    _lock: threading.Lock = field(default_factory=threading.Lock, repr=False)

    def is_allowed(self, ip: str) -> bool:
        try:
            addr = ipaddress.ip_address(ip)
        except ValueError:
            return False

        if self.allowlist:
            for entry in self.allowlist:
                try:
                    if addr in ipaddress.ip_network(entry, strict=False):
                        return True
                except ValueError:
                    continue
            return False

        for entry in self.blocklist:
            try:
                if addr in ipaddress.ip_network(entry, strict=False):
                    return False
            except ValueError:
                continue

        with self._lock:
            if ip in self.dynamic_blocks:
                if time.time() < self.dynamic_blocks[ip]:
                    return False
                else:
                    del self.dynamic_blocks[ip]

        return True

    def block_ip(self, ip: str, duration_seconds: int):
        with self._lock:
            self.dynamic_blocks[ip] = time.time() + duration_seconds

    def unblock_ip(self, ip: str):
        with self._lock:
            self.dynamic_blocks.pop(ip, None)

    def get_dynamic_blocks(self) -> list[dict]:
        now = time.time()
        with self._lock:
            return [
                {"ip": ip, "blocked_until": t}
                for ip, t in self.dynamic_blocks.items()
                if t > now
            ]


def _parse_ip_list(raw: str) -> set[str]:
    if not raw or not raw.strip():
        return set()
    return {entry.strip() for entry in raw.split(",") if entry.strip()}


ip_control = IPControlList(
    allowlist=_parse_ip_list(getattr(settings, "ip_allowlist", "")),
    blocklist=_parse_ip_list(getattr(settings, "ip_blocklist", "")),
)
