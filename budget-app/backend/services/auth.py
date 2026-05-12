"""
Middleware d'authentification via Home Assistant Ingress.
HA injecte automatiquement les headers suivants quand un user accède via l'ingress :
  - X-Remote-User-Id : UUID utilisateur HA
  - X-Remote-User-Name : nom d'affichage
  - X-Ingress-Path : préfixe du path
"""
import os
import logging
from typing import Optional

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from models.base import SessionLocal
from models import User

logger = logging.getLogger(__name__)

PUBLIC_PATHS = {"/api/health", "/api/docs", "/api/openapi.json"}


class HAUserMiddleware(BaseHTTPMiddleware):
    """Extrait l'utilisateur depuis les headers Ingress HA et le crée si nouveau."""

    async def dispatch(self, request: Request, call_next):
        path = request.url.path

        # Routes publiques
        if path in PUBLIC_PATHS or path.startswith("/assets/") or path == "/" or not path.startswith("/api/"):
            return await call_next(request)

        # Mode dev : user de test
        if os.environ.get("DEV_MODE") == "true":
            user = self._get_or_create_user("dev-user-id", "DevUser", display="Dev User")
            request.state.user = user
            return await call_next(request)

        # Mode externe : limiter aux modules autorisés
        external_modules = os.environ.get("EXTERNAL_MODULES", "").split(",")
        is_external = request.headers.get("X-Forwarded-For") and not request.headers.get("X-Remote-User-Id")

        if is_external:
            # Vérifier que le path correspond à un module autorisé
            allowed = False
            for module in external_modules:
                if module and f"/api/{module.replace('-', '_')}" in path:
                    allowed = True
                    break
                # Adapter : courses -> shopping, coloc-summary -> coloc
                if module == "courses" and path.startswith("/api/shopping"):
                    allowed = True
                elif module == "coloc-summary" and path.startswith("/api/coloc"):
                    allowed = True

            if not allowed:
                return JSONResponse(
                    status_code=403,
                    content={"detail": "Module non accessible en mode externe"},
                )

        # Récupération de l'user HA depuis les headers
        ha_user_id = request.headers.get("X-Remote-User-Id")
        ha_username = request.headers.get("X-Remote-User-Name", "Unknown")
        display_name = request.headers.get("X-Remote-User-Display-Name") or ha_username

        if not ha_user_id and not is_external:
            return JSONResponse(
                status_code=401,
                content={"detail": "Authentification HA requise"},
            )

        if ha_user_id:
            user = self._get_or_create_user(ha_user_id, ha_username, display_name)
            request.state.user = user

        return await call_next(request)

    @staticmethod
    def _get_or_create_user(ha_user_id: str, ha_username: str, display: Optional[str] = None) -> User:
        """Cherche l'utilisateur ou le crée à la 1ère connexion."""
        db = SessionLocal()
        try:
            user = db.query(User).filter(User.ha_user_id == ha_user_id).first()
            if not user:
                # 1er user créé = admin par défaut
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
                logger.info(f"Nouvel utilisateur créé : {ha_username} (admin={is_first})")
            return user
        finally:
            db.close()
