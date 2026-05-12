"""Middleware d'authentification.

Trois modes :

1. **Ingress HA** : header ``X-Remote-User-Id``. L'user est cherché/créé en DB
   et attaché à ``request.state.user``. Scope implicite : 'full'.
2. **Port externe (8765)** : cookie ``budget_session`` HMAC contenant
   ``{user_id, scope}``. Le scope filtre les chemins API.
3. **Mode dev** : env ``DEV_MODE=true`` → user de test 'DevUser'.

Optim α2 : le mapping ``ha_user_id → user_id`` est cached module-level
(immutable une fois créé). Évite la query ``WHERE ha_user_id = ?`` à
chaque requête au profit d'un ``db.get(User, id)`` (PK lookup).
"""
import os
import logging
from typing import Optional

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse
from sqlalchemy.orm import Session

from models.base import SessionLocal
from models import ExternalScope, User
from services.external_auth import (
    COOKIE_NAME, read_session_cookie, is_path_allowed_for_scope,
)

logger = logging.getLogger(__name__)

PUBLIC_PATHS_PREFIX = (
    "/api/health",
    "/api/docs",
    "/api/openapi.json",
    "/api/auth/login",
    "/api/auth/logout",
)
PUBLIC_PATHS = set(PUBLIC_PATHS_PREFIX)


# Cache module-level immutable : ha_user_id → user_id.
# Le mapping ne change pas une fois un user créé, donc pas de TTL nécessaire.
# Permet d'éviter la query WHERE ha_user_id = ? à chaque requête.
_HA_TO_USER_ID: dict[str, int] = {}


class HAUserMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        path = request.url.path

        # Routes publiques : aucune auth
        is_public_api = path in PUBLIC_PATHS or any(
            path.startswith(p + "/") for p in PUBLIC_PATHS_PREFIX
        )
        if (
            is_public_api
            or path.startswith("/assets/")
            or path == "/"
            or not path.startswith("/api/")
        ):
            return await call_next(request)

        # Mode dev : user de test
        if os.environ.get("DEV_MODE") == "true":
            user = self._get_or_create_user("dev-user-id", "DevUser", display="Dev User")
            request.state.user = user
            request.state.scope = ExternalScope.FULL.value
            return await call_next(request)

        # 1) Ingress HA
        ha_user_id = request.headers.get("X-Remote-User-Id")
        if ha_user_id:
            ha_username = request.headers.get("X-Remote-User-Name", "Unknown")
            display = request.headers.get("X-Remote-User-Display-Name") or ha_username
            user = self._get_or_create_user(ha_user_id, ha_username, display)
            request.state.user = user
            request.state.scope = ExternalScope.FULL.value
            return await call_next(request)

        # 2) Cookie session externe
        cookie = request.cookies.get(COOKIE_NAME)
        session = read_session_cookie(cookie) if cookie else None
        if session:
            user = self._find_user(session.get("user_id"))
            scope = session.get("scope", ExternalScope.FULL.value)
            if user and is_path_allowed_for_scope(path, scope):
                request.state.user = user
                request.state.scope = scope
                return await call_next(request)
            if user and not is_path_allowed_for_scope(path, scope):
                return JSONResponse(
                    status_code=403,
                    content={"detail": f"Scope '{scope}' insuffisant pour {path}."},
                )

        # 3) Legacy : Bearer/?token (compat 0.3.x)
        token = self._extract_legacy_token(request)
        if token:
            user = self._find_user_by_legacy_token(token)
            if user:
                request.state.user = user
                request.state.scope = ExternalScope.FULL.value
                return await call_next(request)

        return JSONResponse(
            status_code=401,
            content={
                "detail": "Authentification requise.",
                "hint": "Connecte-toi via Home Assistant (ingress) ou via /api/auth/login/password.",
            },
        )

    @staticmethod
    def _extract_legacy_token(request: Request) -> Optional[str]:
        auth = request.headers.get("Authorization", "")
        if auth.lower().startswith("bearer "):
            return auth[7:].strip() or None
        qp = request.query_params.get("token")
        return qp.strip() if qp else None

    @staticmethod
    def _find_user(user_id: Optional[int]) -> Optional[User]:
        if not user_id:
            return None
        db = SessionLocal()
        try:
            return db.get(User, user_id)
        finally:
            db.close()

    @staticmethod
    def _find_user_by_legacy_token(token: str) -> Optional[User]:
        db = SessionLocal()
        try:
            return db.query(User).filter(User.external_token == token).first()
        finally:
            db.close()

    @classmethod
    def _get_or_create_user(
        cls, ha_user_id: str, ha_username: str, display: Optional[str] = None,
    ) -> User:
        db: Session = SessionLocal()
        try:
            # Fast path : ha_user_id déjà connu → db.get par PK (cache identité SQLA)
            cached_id = _HA_TO_USER_ID.get(ha_user_id)
            if cached_id is not None:
                u = db.get(User, cached_id)
                if u is not None:
                    return u
                # User supprimé en DB depuis le cache : on invalide et on retombe
                _HA_TO_USER_ID.pop(ha_user_id, None)

            # Slow path : query WHERE ha_user_id puis cache
            user = db.query(User).filter(User.ha_user_id == ha_user_id).first()
            if user is not None:
                _HA_TO_USER_ID[ha_user_id] = user.id
                return user

            # Création : 1er user = admin
            is_first = db.query(User).count() == 0
            user = User(
                ha_user_id=ha_user_id,
                ha_username=ha_username,
                display_name=display,
                is_admin=is_first,
            )
            db.add(user)
            db.commit()
            # Pas de refresh : les defaults Python sont déjà en place et on
            # n'utilise pas l'id dans la suite du flow.
            _HA_TO_USER_ID[ha_user_id] = user.id
            logger.info("Nouvel utilisateur créé : %s (admin=%s)", ha_username, is_first)
            return user
        finally:
            db.close()
