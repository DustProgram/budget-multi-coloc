"""Middleware d'authentification.

Trois modes :

1. **Ingress HA** : header ``X-Remote-User-Id`` (injecté par le supervisor).
   L'user est cherché/créé en DB et attaché à ``request.state.user``.
   Scope implicite : 'full'.

2. **Port externe (8765) avec compte externe** : cookie ``budget_session``
   posé après login via ``POST /api/auth/login/password``. Le cookie est
   signé HMAC et contient ``{user_id, scope}``. Le middleware filtre les
   chemins API selon le scope ('coloc' = courses+chat+récap, 'full' = tout).

3. **Mode dev** : env ``DEV_MODE=true`` → user de test 'DevUser'.

Le legacy token externe (User.external_token) est conservé silencieusement
pour les URLs déjà partagées, mais le système recommandé est désormais
le compte externe (username + password).
"""
import os
import logging
from typing import Optional

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

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
    "/api/auth/login",          # login externe : liste users + password
    "/api/auth/logout",         # logout — toujours public (clear cookie)
)
PUBLIC_PATHS = set(PUBLIC_PATHS_PREFIX)


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

        # 1) Headers ingress HA présents → flux nominal, scope 'full'
        ha_user_id = request.headers.get("X-Remote-User-Id")
        if ha_user_id:
            ha_username = request.headers.get("X-Remote-User-Name", "Unknown")
            display = request.headers.get("X-Remote-User-Display-Name") or ha_username
            user = self._get_or_create_user(ha_user_id, ha_username, display)
            request.state.user = user
            request.state.scope = ExternalScope.FULL.value
            return await call_next(request)

        # 2) Cookie session externe ?
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

        # 3) Legacy : Bearer/?token sur l'ancien User.external_token (compat 0.3.x)
        token = self._extract_legacy_token(request)
        if token:
            user = self._find_user_by_legacy_token(token)
            if user:
                request.state.user = user
                request.state.scope = ExternalScope.FULL.value
                return await call_next(request)

        # Pas d'auth → 401 (le frontend redirige vers la page login)
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
            return db.query(User).filter(User.id == user_id).first()
        finally:
            db.close()

    @staticmethod
    def _find_user_by_legacy_token(token: str) -> Optional[User]:
        db = SessionLocal()
        try:
            return db.query(User).filter(User.external_token == token).first()
        finally:
            db.close()

    @staticmethod
    def _get_or_create_user(ha_user_id: str, ha_username: str, display: Optional[str] = None) -> User:
        db = SessionLocal()
        try:
            user = db.query(User).filter(User.ha_user_id == ha_user_id).first()
            if not user:
                is_first = db.query(User).count() == 0
                user = User(
                    ha_user_id=ha_user_id,
                    ha_username=ha_username,
                    display_name=display,
                    is_admin=is_first,
                )
                db.add(user)
                db.commit()
                db.refresh(user)
                logger.info("Nouvel utilisateur créé : %s (admin=%s)", ha_username, is_first)
            return user
        finally:
            db.close()
