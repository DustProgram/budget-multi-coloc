"""API utilisateur courant : profil + mode pro + compte externe."""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, field_validator
from sqlalchemy.orm import Session

from models.base import get_db
from models import ExternalCredential, ExternalScope, User
from services.external_auth import hash_password
from services.tokens import generate_external_token

router = APIRouter()


class MeOut(BaseModel):
    user_id: int
    ha_username: str
    display_name: Optional[str]
    color_hex: str
    is_admin: bool
    has_external_account: bool
    external_username: Optional[str] = None
    external_scope: Optional[str] = None
    pro_enabled: bool
    # Scope de la session courante : 'full' (ingress HA ou compte externe full)
    # ou 'coloc' (compte externe scope coloc, accès limité)
    session_scope: str = "full"


class ProToggle(BaseModel):
    enabled: bool


class ExternalAccountPayload(BaseModel):
    username: str
    password: str
    scope: ExternalScope = ExternalScope.FULL

    @field_validator("username")
    @classmethod
    def _username_clean(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 3:
            raise ValueError("Username trop court (min 3).")
        if len(v) > 64:
            raise ValueError("Username trop long (max 64).")
        if not all(c.isalnum() or c in "_-." for c in v):
            raise ValueError("Username : lettres/chiffres/._- uniquement.")
        return v

    @field_validator("password")
    @classmethod
    def _password_len(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Mot de passe trop court (min 8 caractères).")
        return v


def _to_me_out(db: Session, user: User, session_scope: str = "full") -> MeOut:
    cred = db.query(ExternalCredential).filter(ExternalCredential.user_id == user.id).first()
    return MeOut(
        user_id=user.id,
        ha_username=user.ha_username,
        display_name=user.display_name,
        color_hex=user.color_hex,
        is_admin=user.is_admin,
        has_external_account=cred is not None,
        external_username=cred.username if cred else None,
        external_scope=(cred.scope.value if cred and hasattr(cred.scope, "value") else None),
        pro_enabled=bool(user.pro_enabled),
        session_scope=session_scope,
    )


@router.get("/me", response_model=MeOut)
async def get_me(request: Request, db: Session = Depends(get_db)):
    user: User = request.state.user
    scope = getattr(request.state, "scope", "full")
    return _to_me_out(db, user, session_scope=scope)


@router.post("/me/pro-enabled", response_model=MeOut)
async def set_pro_enabled(
    payload: ProToggle,
    request: Request,
    db: Session = Depends(get_db),
):
    user_id = request.state.user.id
    user = db.get(User, user_id)
    user.pro_enabled = payload.enabled
    db.commit()
    db.refresh(user)
    return _to_me_out(db, user)


@router.put("/me/external-account", response_model=MeOut)
async def upsert_external_account(
    payload: ExternalAccountPayload,
    request: Request,
    db: Session = Depends(get_db),
):
    """Crée ou met à jour le compte externe (username + password + scope).
    Si username déjà pris par un autre user → 409.
    """
    user_id = request.state.user.id
    other = db.query(ExternalCredential).filter(
        ExternalCredential.username == payload.username,
        ExternalCredential.user_id != user_id,
    ).first()
    if other:
        raise HTTPException(409, "Ce username est déjà utilisé par un autre compte.")

    cred = db.query(ExternalCredential).filter(ExternalCredential.user_id == user_id).first()
    if cred is None:
        cred = ExternalCredential(
            user_id=user_id,
            username=payload.username,
            password_hash=hash_password(payload.password),
            scope=payload.scope,
        )
        db.add(cred)
    else:
        cred.username = payload.username
        cred.password_hash = hash_password(payload.password)
        cred.scope = payload.scope

    db.commit()
    user = db.get(User, user_id)
    return _to_me_out(db, user)


@router.delete("/me/external-account", status_code=204)
async def delete_external_account(request: Request, db: Session = Depends(get_db)):
    user_id = request.state.user.id
    db.query(ExternalCredential).filter(ExternalCredential.user_id == user_id).delete()
    db.commit()


# ============================================================
# Compat 0.3.x — anciens endpoints token (retournent une dépréciation)
# ============================================================

class TokenOut(BaseModel):
    token: str
    deprecated: str = (
        "Le système de token est remplacé par les comptes externes "
        "(username + password + scope). Utilise PUT /api/users/me/external-account."
    )


@router.post("/me/external-token", response_model=TokenOut, deprecated=True)
async def legacy_generate_token(request: Request, db: Session = Depends(get_db)):
    user_id = request.state.user.id
    user = db.get(User, user_id)
    user.external_token = generate_external_token()
    db.commit()
    db.refresh(user)
    return TokenOut(token=user.external_token)


@router.delete("/me/external-token", status_code=204, deprecated=True)
async def legacy_revoke_token(request: Request, db: Session = Depends(get_db)):
    user_id = request.state.user.id
    user = db.get(User, user_id)
    user.external_token = None
    db.commit()
