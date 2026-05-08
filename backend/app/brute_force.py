"""
Per-IP brute force tracking — progressive delays and IP-level blocking.

Works alongside the per-user lockout in platform/auth.py (check_lockout / should_lock).
This module adds the IP dimension: an IP that fails against ANY username accumulates
toward IP-level blocks, independent of which account was targeted.
"""
import time
import threading
from collections import defaultdict
from dataclasses import dataclass, field

from app.config import settings


@dataclass
class IPRecord:
    failures: list[float] = field(default_factory=list)
    blocked_until: float = 0.0


class BruteForceTracker:
    def __init__(self):
        self._ip_records: dict[str, IPRecord] = defaultdict(IPRecord)
        self._lock = threading.Lock()

    def is_ip_blocked(self, ip: str) -> bool:
        with self._lock:
            rec = self._ip_records.get(ip)
            if not rec:
                return False
            if rec.blocked_until > time.time():
                return True
            if rec.blocked_until > 0:
                rec.blocked_until = 0.0
            return False

    def record_ip_failure(self, ip: str):
        now = time.time()
        with self._lock:
            rec = self._ip_records[ip]
            rec.failures.append(now)
            rec.failures = [t for t in rec.failures if now - t < 86400]

            recent_15m = sum(1 for t in rec.failures if now - t < 900)
            recent_1h = sum(1 for t in rec.failures if now - t < 3600)

            threshold = getattr(settings, "ip_block_threshold", 50)
            duration = getattr(settings, "ip_block_duration_seconds", 1800)

            if recent_15m >= threshold:
                rec.blocked_until = now + duration
            elif recent_1h >= threshold * 2:
                rec.blocked_until = now + duration * 48

    def clear_ip_failures(self, ip: str):
        with self._lock:
            self._ip_records.pop(ip, None)

    def block_ip(self, ip: str, duration_seconds: int):
        with self._lock:
            rec = self._ip_records[ip]
            rec.blocked_until = time.time() + duration_seconds

    def unblock_ip(self, ip: str):
        with self._lock:
            rec = self._ip_records.get(ip)
            if rec:
                rec.blocked_until = 0.0

    def get_blocked_ips(self) -> list[dict]:
        now = time.time()
        with self._lock:
            return [
                {"ip": ip, "blocked_until": rec.blocked_until}
                for ip, rec in self._ip_records.items()
                if rec.blocked_until > now
            ]

    def cleanup(self, max_age: float = 86400):
        cutoff = time.time() - max_age
        with self._lock:
            stale = [
                ip for ip, rec in self._ip_records.items()
                if not rec.failures or max(rec.failures) < cutoff
            ]
            for ip in stale:
                del self._ip_records[ip]


def get_delay_seconds(failure_count: int) -> float:
    if failure_count <= 3:
        return 0
    elif failure_count <= 6:
        return 2.0
    elif failure_count <= 9:
        return 5.0
    elif failure_count <= 14:
        return 10.0
    else:
        return -1


brute_force = BruteForceTracker()
