"""Auth externe : hash bcrypt + cookie session HMAC signé.

Le cookie ``budget_session`` contient la signature itsdangerous d'un payload
``{user_id, scope, exp}`` JSON. Pas de JWT — itsdangerous est suffisant et
n'a pas besoin d'une lib externe (en dehors de itsdangerous lui-même).
"""
from __future__ import annotations

import json
import os
import secrets
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

import bcrypt
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

from models import ExternalScope

COOKIE_NAME = "budget_session"
COOKIE_MAX_AGE = 60 * 60 * 24 * 30  # 30 jours
SECRET_PATH = Path(os.environ.get("DATA_DIR", "/data")) / ".session_secret"


def _load_or_create_secret() -> str:
    """Charge ou génère la clé HMAC utilisée pour signer les cookies."""
    try:
        SECRET_PATH.parent.mkdir(parents=True, exist_ok=True)
        if SECRET_PATH.exists():
            return SECRET_PATH.read_text(encoding="utf-8").strip()
        s = secrets.token_urlsafe(48)
        SECRET_PATH.write_text(s, encoding="utf-8")
        try:
            SECRET_PATH.chmod(0o600)
        except OSError:
            pass
        return s
    except OSError:
        # Fallback en mémoire si /data n'est pas writable (mode dev hors HA)
        env_key = os.environ.get("BUDGET_SESSION_SECRET")
        if env_key:
            return env_key
        s = secrets.token_urlsafe(48)
        os.environ["BUDGET_SESSION_SECRET"] = s
        return s


_serializer: Optional[URLSafeTimedSerializer] = None


def _get_serializer() -> URLSafeTimedSerializer:
    global _serializer
    if _serializer is None:
        _serializer = URLSafeTimedSerializer(_load_or_create_secret(), salt="budget-session")
    return _serializer


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))
    except (ValueError, TypeError):
        return False


def make_session_cookie(user_id: int, scope: ExternalScope | str) -> str:
    """Sérialise + signe un payload de session. Inclut une expiration."""
    scope_value = scope.value if hasattr(scope, "value") else str(scope)
    payload = {
        "user_id": int(user_id),
        "scope": scope_value,
        "iat": datetime.now(timezone.utc).isoformat(),
    }
    return _get_serializer().dumps(json.dumps(payload))


def read_session_cookie(cookie_value: str) -> Optional[dict]:
    """Vérifie la signature et la fraîcheur du cookie. Retourne le payload
    ``{user_id, scope, iat}`` ou None si invalide / expiré."""
    if not cookie_value:
        return None
    try:
        raw = _get_serializer().loads(cookie_value, max_age=COOKIE_MAX_AGE)
        return json.loads(raw)
    except (BadSignature, SignatureExpired, ValueError):
        return None


def is_path_allowed_for_scope(path: str, scope: str) -> bool:
    """Filtre par scope pour les comptes externes.

    'full'  → accès complet (équivalent ingress HA).
    'coloc' → uniquement courses + chat + récap coloc + minimum utility.
    """
    if scope == ExternalScope.FULL.value:
        return True
    if scope == ExternalScope.COLOC.value:
        return _is_coloc_path(path)
    return False


def _is_coloc_path(path: str) -> bool:
    allowed_prefixes = (
        "/api/health",
        "/api/users/me",                # profil seul
        "/api/auth/logout",
        "/api/shopping",                # courses
        "/api/coloc",                   # récap coloc
        "/api/households",              # foyer + chat
        "/api/notifier/status",
    )
    if any(path == p or path.startswith(p + "/") or path.startswith(p + "?") for p in allowed_prefixes):
        return True
    # Accès lecture aux comptes joints (pour afficher la liste) — read-only.
    # POST sur /accounts/ est filtré côté endpoint.
    if path == "/api/accounts/" or path == "/api/accounts" or path.startswith("/api/accounts/"):
        return True
    return False
