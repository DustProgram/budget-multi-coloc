"""Durcissement pour une exposition Internet (mode standalone).

- ``AUTH_MODE=standalone`` : plus de Home Assistant, l'auth passe uniquement
  par login/password (cookie) ou Bearer token. Le header ``X-Remote-User-Id``
  est ignoré, sinon n'importe qui pourrait se faire passer pour un user.
- Rate-limit login par IP + verrouillage par username, en mémoire (1 worker).
- Headers de sécurité HTTP + limite de taille des requêtes.
"""
from __future__ import annotations

import os
import threading
import time
from collections import defaultdict, deque

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse


def is_standalone() -> bool:
    return os.environ.get("AUTH_MODE", "ha").lower() == "standalone"


def cookie_secure() -> bool:
    default = "true" if is_standalone() else "false"
    return os.environ.get("COOKIE_SECURE", default).lower() == "true"


LOGIN_MAX_PER_IP_PER_MIN = 5
LOCKOUT_THRESHOLD = 10
LOCKOUT_SECONDS = 15 * 60


class LoginGuard:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._ip_attempts: dict[str, deque[float]] = defaultdict(deque)
        self._failures: dict[str, int] = defaultdict(int)
        self._locked_until: dict[str, float] = {}

    def reset(self) -> None:
        with self._lock:
            self._ip_attempts.clear()
            self._failures.clear()
            self._locked_until.clear()

    def hit_ip(self, ip: str) -> bool:
        """Enregistre une tentative. False si l'IP dépasse le quota/minute."""
        now = time.monotonic()
        with self._lock:
            q = self._ip_attempts[ip]
            while q and now - q[0] > 60:
                q.popleft()
            if len(q) >= LOGIN_MAX_PER_IP_PER_MIN:
                return False
            q.append(now)
            return True

    def locked_for(self, username: str) -> int:
        """Secondes restantes de verrouillage (0 si libre)."""
        key = username.lower()
        with self._lock:
            until = self._locked_until.get(key)
            if until is None:
                return 0
            remaining = until - time.monotonic()
            if remaining <= 0:
                del self._locked_until[key]
                return 0
            return int(remaining) + 1

    def record_failure(self, username: str) -> None:
        key = username.lower()
        with self._lock:
            self._failures[key] += 1
            if self._failures[key] >= LOCKOUT_THRESHOLD:
                self._locked_until[key] = time.monotonic() + LOCKOUT_SECONDS
                self._failures[key] = 0

    def record_success(self, username: str) -> None:
        with self._lock:
            self._failures.pop(username.lower(), None)


login_guard = LoginGuard()


def client_ip(request: Request) -> str:
    # uvicorn --proxy-headers réécrit request.client depuis X-Forwarded-For
    return request.client.host if request.client else "unknown"


# 'unsafe-inline' sur style-src : React pose des attributs style= partout.
_CSP = "; ".join([
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob:",
    "connect-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com",
    "worker-src 'self'",
    "manifest-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
])


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        if not is_standalone():
            # L'ingress HA affiche l'app dans une iframe : pas de frame-ancestors.
            return response
        h = response.headers
        h.setdefault("X-Content-Type-Options", "nosniff")
        h.setdefault("X-Frame-Options", "DENY")
        h.setdefault("Referrer-Policy", "same-origin")
        h.setdefault("Permissions-Policy", "camera=(self), microphone=(), geolocation=()")
        h.setdefault("Content-Security-Policy", _CSP)
        if cookie_secure():
            h.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
        if request.url.path.startswith("/api/"):
            h.setdefault("Cache-Control", "no-store")
        return response


class MaxBodySizeMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        max_bytes = int(os.environ.get("MAX_BODY_MB", "15")) * 1024 * 1024
        length = request.headers.get("content-length")
        if length and length.isdigit() and int(length) > max_bytes:
            return JSONResponse(status_code=413, content={"detail": "Requête trop volumineuse."})
        return await call_next(request)
