"""Double authentification de l'user connecté : passkeys, appli (code à 6 chiffres),
codes de secours."""
import os
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session
import segno

from models import Passkey, RecoveryCode, User
from models.base import get_db
from services import passkeys
from services.external_auth import revoke_sessions

router = APIRouter()


class PasskeyOut(BaseModel):
    id: int
    name: str
    created_at: datetime
    last_used_at: Optional[datetime]


class SecurityOut(BaseModel):
    passkeys: list[PasskeyOut]
    totp_enabled: bool
    recovery_codes_remaining: int


class RegisterIn(BaseModel):
    credential: dict
    name: str = "Passkey"


class RegisterOut(BaseModel):
    passkey: PasskeyOut
    recovery_codes: Optional[list[str]] = None


def _out(db: Session, user_id: int) -> SecurityOut:
    pks = db.query(Passkey).filter(Passkey.user_id == user_id).order_by(Passkey.id).all()
    return SecurityOut(
        passkeys=[PasskeyOut.model_validate(p, from_attributes=True) for p in pks],
        totp_enabled=bool(db.get(User, user_id).totp_enabled),
        recovery_codes_remaining=passkeys.remaining_recovery_codes(db, user_id),
    )


def _codes_if_none(db: Session, user_id: int) -> Optional[list[str]]:
    if passkeys.remaining_recovery_codes(db, user_id):
        return None
    return passkeys.regenerate_recovery_codes(db, user_id)


def _scope(request: Request) -> str:
    return getattr(request.state, "scope", "full")


@router.get("/", response_model=SecurityOut)
async def get_security(request: Request, db: Session = Depends(get_db)):
    return _out(db, request.state.user.id)


@router.post("/register/options")
async def register_options(request: Request, db: Session = Depends(get_db)):
    return passkeys.registration_options(db, request, db.get(User, request.state.user.id))


@router.post("/register", response_model=RegisterOut)
async def register(payload: RegisterIn, request: Request, response: Response, db: Session = Depends(get_db)):
    user = db.get(User, request.state.user.id)
    first = not passkeys.has_second_factor(db, user.id)
    try:
        pk = passkeys.register(db, request, user, payload.credential, payload.name)
    except ValueError as e:
        db.rollback()
        raise HTTPException(422, str(e))
    codes = _codes_if_none(db, user.id)
    db.commit()
    if first:
        # Le second facteur devient obligatoire : on coupe les autres sessions
        # ouvertes sans lui, en gardant celle-ci.
        revoke_sessions(db, user, response, _scope(request))
    return RegisterOut(passkey=PasskeyOut.model_validate(pk, from_attributes=True), recovery_codes=codes)


@router.delete("/{passkey_id}", response_model=SecurityOut)
async def delete_passkey(passkey_id: int, request: Request, response: Response, db: Session = Depends(get_db)):
    user = db.get(User, request.state.user.id)
    pk = db.get(Passkey, passkey_id)
    if not pk or pk.user_id != user.id:
        raise HTTPException(404, "Passkey introuvable.")
    db.delete(pk)
    db.flush()
    if not passkeys.has_second_factor(db, user.id):
        db.query(RecoveryCode).filter(RecoveryCode.user_id == user.id).delete()
    db.commit()
    revoke_sessions(db, user, response, _scope(request))
    return _out(db, user.id)


@router.post("/recovery-codes")
async def new_recovery_codes(request: Request, db: Session = Depends(get_db)):
    user_id = request.state.user.id
    if not passkeys.has_second_factor(db, user_id):
        raise HTTPException(400, "Active d'abord la double authentification.")
    codes = passkeys.regenerate_recovery_codes(db, user_id)
    db.commit()
    return {"recovery_codes": codes}


# ============================================================
# Appli d'authentification (code à 6 chiffres)
# ============================================================

class TotpCodeIn(BaseModel):
    code: str


@router.post("/totp/setup")
async def totp_setup(request: Request, db: Session = Depends(get_db)):
    user = db.get(User, request.state.user.id)
    try:
        secret, uri = passkeys.totp_setup(db, user, os.environ.get("DOMAIN") or "Budget Multi-Coloc")
    except ValueError as e:
        raise HTTPException(409, str(e))
    db.commit()
    return {
        "secret": secret,
        "otpauth_uri": uri,
        "qr_svg": segno.make(uri, error="m").svg_data_uri(scale=5, border=2),
    }


@router.post("/totp/enable")
async def totp_enable(payload: TotpCodeIn, request: Request, response: Response, db: Session = Depends(get_db)):
    user = db.get(User, request.state.user.id)
    if user.totp_enabled:
        raise HTTPException(409, "Déjà activée.")
    if not passkeys.verify_totp(user, payload.code):
        db.rollback()
        raise HTTPException(422, "Code incorrect : vérifie l'heure de ton téléphone et réessaie.")
    user.totp_enabled = True
    codes = _codes_if_none(db, user.id)
    db.commit()
    revoke_sessions(db, user, response, _scope(request))
    return {"recovery_codes": codes}


@router.post("/totp/disable", response_model=SecurityOut)
async def totp_disable(payload: TotpCodeIn, request: Request, response: Response, db: Session = Depends(get_db)):
    user = db.get(User, request.state.user.id)
    if not user.totp_enabled or not passkeys.verify_totp(user, payload.code):
        db.rollback()
        raise HTTPException(422, "Code incorrect.")
    user.totp_enabled, user.totp_secret = False, None
    db.flush()
    if not passkeys.has_second_factor(db, user.id):
        db.query(RecoveryCode).filter(RecoveryCode.user_id == user.id).delete()
    db.commit()
    revoke_sessions(db, user, response, _scope(request))
    return _out(db, user.id)
