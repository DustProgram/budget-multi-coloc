"""API d'auth pour le port externe.

Public (avant le middleware d'auth) :
- POST /api/auth/login/password   → username + password → cookie session

L'ancien endpoint GET /users a été retiré en 0.4.1 : exposer la liste
des comptes HA et leurs usernames externes = fuite d'information. Si
l'user a oublié son username, il doit le retrouver via l'ingress HA
(Réglages → Compte externe l'affiche).
"""
import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from models import ExternalCredential, User
from models.base import get_db
from services.external_auth import (
    COOKIE_NAME, COOKIE_MAX_AGE, make_session_cookie, verify_password,
)
from services.security import client_ip, cookie_secure, is_standalone, login_guard

logger = logging.getLogger(__name__)
router = APIRouter()


class PasswordLoginPayload(BaseModel):
    username: str
    password: str


class LoginOut(BaseModel):
    user_id: int
    display_name: str
    scope: str


@router.post("/password", response_model=LoginOut)
async def login_with_password(
    payload: PasswordLoginPayload,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    """Vérifie username + password et installe un cookie session signé."""
    username = payload.username.strip()
    ip = client_ip(request)
    if not login_guard.hit_ip(ip):
        logger.warning("Login rate-limited ip=%s username=%s", ip, username)
        raise HTTPException(429, "Trop de tentatives. Réessaie dans une minute.")
    locked = login_guard.locked_for(username)
    if locked:
        logger.warning("Login refusé (compte verrouillé) ip=%s username=%s", ip, username)
        raise HTTPException(429, f"Compte temporairement verrouillé. Réessaie dans {locked // 60 + 1} min.")

    cred: Optional[ExternalCredential] = (
        db.query(ExternalCredential)
        .filter(ExternalCredential.username == username)
        .first()
    )
    if not cred or not verify_password(payload.password, cred.password_hash):
        login_guard.record_failure(username)
        logger.warning("Login échoué ip=%s username=%s", ip, username)
        # Message générique : ne pas révéler si le username existe ou pas
        raise HTTPException(401, "Identifiants invalides.")
    login_guard.record_success(username)
    logger.info("Login OK ip=%s username=%s", ip, username)

    cred.last_login_at = datetime.utcnow()
    db.commit()

    user = db.query(User).filter(User.id == cred.user_id).first()
    if not user:
        raise HTTPException(500, "Utilisateur sous-jacent introuvable.")

    scope_value = cred.scope.value if hasattr(cred.scope, "value") else str(cred.scope)
    cookie = make_session_cookie(cred.user_id, scope_value)
    response.set_cookie(
        key=COOKIE_NAME,
        value=cookie,
        max_age=COOKIE_MAX_AGE,
        httponly=True,
        samesite="strict" if is_standalone() else "lax",
        secure=cookie_secure(),
        path="/",
    )
    return LoginOut(
        user_id=user.id,
        display_name=user.display_name or user.ha_username,
        scope=scope_value,
    )
