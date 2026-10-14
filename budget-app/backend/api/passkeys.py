"""Gestion de ses passkeys et codes de secours (user connecté)."""
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from models import Passkey, User
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
        recovery_codes_remaining=passkeys.remaining_recovery_codes(db, user_id),
    )


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
    first = not passkeys.has_passkeys(db, user.id)
    try:
        pk = passkeys.register(db, request, user, payload.credential, payload.name)
    except ValueError as e:
        db.rollback()
        raise HTTPException(422, str(e))
    codes = passkeys.regenerate_recovery_codes(db, user.id) if first else None
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
    if not passkeys.has_passkeys(db, user.id):
        passkeys.disable_second_factor(db, user.id)
    db.commit()
    revoke_sessions(db, user, response, _scope(request))
    return _out(db, user.id)


@router.post("/recovery-codes")
async def new_recovery_codes(request: Request, db: Session = Depends(get_db)):
    user_id = request.state.user.id
    if not passkeys.has_passkeys(db, user_id):
        raise HTTPException(400, "Ajoute d'abord une passkey.")
    codes = passkeys.regenerate_recovery_codes(db, user_id)
    db.commit()
    return {"recovery_codes": codes}
