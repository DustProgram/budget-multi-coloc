"""Middleware d'authentification.

Deux modes :

1. **Ingress HA** : le supervisor injecte ``X-Remote-User-Id`` + name.
   L'user est cherché/créé en DB et attaché à ``request.state.user``.
2. **Port externe (8765)** : pas de header ingress, le client doit présenter
   son token via ``?token=<...>`` ou ``Authorization: Bearer <...>``.
   Le token doit matcher ``User.external_token`` (opt-in par user via
   /api/users/me/external-token). Avec un token valide, le user a accès
   complet à l'app — sous sa responsabilité (il a choisi d'exposer son token).

L'ancien mode "modules autorisés sans auth" (``EXTERNAL_MODULES``) est
toujours actif en fallback pour la rétrocompat avec la config 0.1.x.
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

# Servent toujours, sans aucune auth (statut/santé/docs).
PUBLIC_PATHS = {"/api/health", "/api/docs", "/api/openapi.json"}


class HAUserMiddleware(BaseHTTPMiddleware):
    """Extrait l'user depuis ingress HA, ou via token externe."""

    async def dispatch(self, request: Request, call_next):
        path = request.url.path

        # Routes publiques : aucune auth
        if (
            path in PUBLIC_PATHS
            or path.startswith("/assets/")
            or path == "/"
            or not path.startswith("/api/")
        ):
            return await call_next(request)

        # Mode dev : user de test
        if os.environ.get("DEV_MODE") == "true":
            user = self._get_or_create_user("dev-user-id", "DevUser", display="Dev User")
            request.state.user = user
            return await call_next(request)

        # Headers ingress HA présents → flux nominal
        ha_user_id = request.headers.get("X-Remote-User-Id")
        if ha_user_id:
            ha_username = request.headers.get("X-Remote-User-Name", "Unknown")
            display = request.headers.get("X-Remote-User-Display-Name") or ha_username
            user = self._get_or_create_user(ha_user_id, ha_username, display)
            request.state.user = user
            return await call_next(request)

        # Sinon → on est sur le port externe (8765). Cherche un token.
        is_external = bool(request.headers.get("X-Forwarded-For"))
        token = self._extract_token(request)

        if token:
            user = self._find_user_by_token(token)
            if user:
                request.state.user = user
                return await call_next(request)
            return JSONResponse(status_code=401, content={"detail": "Token invalide."})

        # Pas de token → mode "modules autorisés sans auth" (legacy).
        # Conservé pour compat config v0.1.x. À retirer dans une v0.3 quand
        # tous les colocs auront migré sur les tokens user.
        if is_external:
            allowed_paths = _legacy_external_allowed(request.url.path)
            if allowed_paths:
                return await call_next(request)
            return JSONResponse(
                status_code=401,
                content={
                    "detail": (
                        "Auth requise. Ajoute ?token=<ton-token> à l'URL, "
                        "ou passe par Home Assistant."
                    ),
                },
            )

        # Requête interne sans aucun marker d'auth — refuse.
        return JSONResponse(
            status_code=401,
            content={"detail": "Authentification HA requise."},
        )

    @staticmethod
    def _extract_token(request: Request) -> Optional[str]:
        """Récupère un token depuis ``Authorization: Bearer …`` ou ``?token=…``."""
        auth = request.headers.get("Authorization", "")
        if auth.lower().startswith("bearer "):
            return auth[7:].strip() or None
        qp = request.query_params.get("token")
        return qp.strip() if qp else None

    @staticmethod
    def _find_user_by_token(token: str) -> Optional[User]:
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


def _legacy_external_allowed(path: str) -> bool:
    """Compat legacy : EXTERNAL_MODULES=courses,coloc-summary autorise les
    routes correspondantes même sans token. À supprimer en v0.3."""
    external_modules = os.environ.get("EXTERNAL_MODULES", "").split(",")
    for module in external_modules:
        m = module.strip()
        if not m:
            continue
        if m == "courses" and path.startswith("/api/shopping"):
            return True
        if m == "coloc-summary" and path.startswith("/api/coloc"):
            return True
    return False
