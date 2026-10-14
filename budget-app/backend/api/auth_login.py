"""API d'auth pour le port externe / le mode standalone.

Public (avant le middleware d'auth) :
- POST /api/auth/login/password   → username + password → cookie session,
  ou, si le user a une passkey, `mfa_required` + options WebAuthn
- POST /api/auth/login/passkey    → second facteur : assertion WebAuthn
- POST /api/auth/login/recovery   → second facteur : code de secours

L'ancien endpoint GET /users a été retiré en 0.4.1 : exposer la liste
des comptes HA et leurs usernames externes = fuite d'information.
"""
import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from models import ExternalCredential, User
from models.base import get_db
from services import passkeys
from services.external_auth import (
    MFA_COOKIE_NAME, MFA_MAX_AGE, make_mfa_cookie, read_mfa_cookie,
    set_session_cookie, verify_password,
)
from services.security import client_ip, cookie_secure, login_guard

logger = logging.getLogger(__name__)
router = APIRouter()


class PasswordLoginPayload(BaseModel):
    username: str
    password: str


class LoginOut(BaseModel):
    user_id: Optional[int] = None
    display_name: Optional[str] = None
    scope: Optional[str] = None
    mfa_required: bool = False
    passkey_options: Optional[dict] = None


class PasskeyLoginPayload(BaseModel):
    credential: dict


class RecoveryLoginPayload(BaseModel):
    code: str


def _guard(request: Request, username: str) -> str:
    ip = client_ip(request)
    if not login_guard.hit_ip(ip):
        logger.warning("Login rate-limited ip=%s username=%s", ip, username)
        raise HTTPException(429, "Trop de tentatives. Réessaie dans une minute.")
    locked = login_guard.locked_for(username)
    if locked:
        logger.warning("Login refusé (compte verrouillé) ip=%s username=%s", ip, username)
        raise HTTPException(429, f"Compte temporairement verrouillé. Réessaie dans {locked // 60 + 1} min.")
    return ip


def _complete(db: Session, response: Response, cred: ExternalCredential) -> LoginOut:
    cred.last_login_at = datetime.utcnow()
    db.commit()
    user = db.get(User, cred.user_id)
    if not user:
        raise HTTPException(500, "Utilisateur sous-jacent introuvable.")
    scope_value = cred.scope.value if hasattr(cred.scope, "value") else str(cred.scope)
    set_session_cookie(response, user, scope_value)
    response.delete_cookie(MFA_COOKIE_NAME, path="/api/auth/login")
    return LoginOut(
        user_id=user.id,
        display_name=user.display_name or user.ha_username,
        scope=scope_value,
    )


@router.post("/password", response_model=LoginOut)
async def login_with_password(
    payload: PasswordLoginPayload,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    username = payload.username.strip()
    ip = _guard(request, username)
    cred: Optional[ExternalCredential] = (
        db.query(ExternalCredential).filter(ExternalCredential.username == username).first()
    )
    if not cred or not verify_password(payload.password, cred.password_hash):
        login_guard.record_failure(username)
        logger.warning("Login échoué ip=%s username=%s", ip, username)
        # Message générique : ne pas révéler si le username existe ou pas
        raise HTTPException(401, "Identifiants invalides.")

    if passkeys.has_passkeys(db, cred.user_id):
        scope_value = cred.scope.value if hasattr(cred.scope, "value") else str(cred.scope)
        nonce, options = passkeys.start_login(db, request, cred.user_id, scope_value)
        response.set_cookie(
            key=MFA_COOKIE_NAME, value=make_mfa_cookie(nonce), max_age=MFA_MAX_AGE,
            httponly=True, samesite="strict", secure=cookie_secure(), path="/api/auth/login",
        )
        logger.info("Mot de passe OK, passkey demandée ip=%s username=%s", ip, username)
        return LoginOut(mfa_required=True, passkey_options=options)

    login_guard.record_success(username)
    logger.info("Login OK ip=%s username=%s", ip, username)
    return _complete(db, response, cred)


def _pending_cred(request: Request, db: Session):
    nonce = read_mfa_cookie(request.cookies.get(MFA_COOKIE_NAME, ""))
    pending = passkeys.take_login(nonce) if nonce else None
    if pending is None:
        raise HTTPException(401, "Étape expirée : reconnecte-toi avec ton mot de passe.")
    cred = db.query(ExternalCredential).filter(ExternalCredential.user_id == pending.user_id).first()
    if cred is None:
        raise HTTPException(401, "Compte introuvable.")
    return pending, cred


@router.post("/passkey", response_model=LoginOut)
async def login_with_passkey(
    payload: PasskeyLoginPayload, request: Request, response: Response, db: Session = Depends(get_db),
):
    pending, cred = _pending_cred(request, db)
    ip = _guard(request, cred.username)
    try:
        passkeys.verify_login(db, request, pending, payload.credential)
    except ValueError as e:
        login_guard.record_failure(cred.username)
        logger.warning("Passkey refusée ip=%s username=%s : %s", ip, cred.username, e)
        raise HTTPException(401, "Passkey refusée : reconnecte-toi.")
    login_guard.record_success(cred.username)
    logger.info("Login OK (passkey) ip=%s username=%s", ip, cred.username)
    return _complete(db, response, cred)


@router.post("/recovery", response_model=LoginOut)
async def login_with_recovery_code(
    payload: RecoveryLoginPayload, request: Request, response: Response, db: Session = Depends(get_db),
):
    pending, cred = _pending_cred(request, db)
    ip = _guard(request, cred.username)
    if not passkeys.use_recovery_code(db, pending.user_id, payload.code):
        login_guard.record_failure(cred.username)
        logger.warning("Code de secours refusé ip=%s username=%s", ip, cred.username)
        raise HTTPException(401, "Code invalide : reconnecte-toi.")
    login_guard.record_success(cred.username)
    logger.warning("Login avec code de secours ip=%s username=%s (%d restants)", ip, cred.username,
                   passkeys.remaining_recovery_codes(db, pending.user_id))
    return _complete(db, response, cred)
