"""API d'auth pour le port externe.

Public (avant le middleware d'auth) :
- GET  /api/auth/login/users      → liste users HA + flag has_external_account
- POST /api/auth/login/password   → username + password → cookie session + payload
"""
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from models import ExternalCredential, ExternalScope, User
from models.base import get_db
from services.external_auth import (
    COOKIE_NAME, COOKIE_MAX_AGE, make_session_cookie, verify_password,
)

router = APIRouter()


class LoginUserEntry(BaseModel):
    user_id: int
    display_name: str
    ha_username: str
    color_hex: str
    has_external_account: bool
    external_username: Optional[str] = None


class PasswordLoginPayload(BaseModel):
    username: str
    password: str


class LoginOut(BaseModel):
    user_id: int
    display_name: str
    scope: str


@router.get("/users", response_model=list[LoginUserEntry])
async def list_users_for_login(db: Session = Depends(get_db)):
    """Liste les users HA enregistrés avec flag 'compte externe configuré'.

    Affiche aussi le username externe choisi par chacun, pour qu'on sache
    avec quel login se connecter.
    """
    out: list[LoginUserEntry] = []
    users = db.query(User).order_by(User.display_name, User.ha_username).all()
    for u in users:
        cred = db.query(ExternalCredential).filter(ExternalCredential.user_id == u.id).first()
        out.append(LoginUserEntry(
            user_id=u.id,
            display_name=u.display_name or u.ha_username,
            ha_username=u.ha_username,
            color_hex=u.color_hex,
            has_external_account=cred is not None,
            external_username=cred.username if cred else None,
        ))
    return out


@router.post("/password", response_model=LoginOut)
async def login_with_password(
    payload: PasswordLoginPayload,
    response: Response,
    db: Session = Depends(get_db),
):
    """Vérifie username + password et installe un cookie session signé."""
    cred: Optional[ExternalCredential] = (
        db.query(ExternalCredential)
        .filter(ExternalCredential.username == payload.username.strip())
        .first()
    )
    if not cred or not verify_password(payload.password, cred.password_hash):
        raise HTTPException(401, "Identifiants invalides.")

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
        samesite="lax",
        secure=False,           # HA est généralement en HTTP local
        path="/",
    )
    return LoginOut(
        user_id=user.id,
        display_name=user.display_name or user.ha_username,
        scope=scope_value,
    )
