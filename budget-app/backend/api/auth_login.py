"""API d'auth pour le port externe.

Endpoints publics (avant que le middleware n'authentifie quoi que ce soit) :
- GET  /api/auth/login/users   → liste des users HA enregistrés avec
                                 indication de qui a un token externe.
                                 Sert à peupler la page de login externe.
- POST /api/auth/login/verify  → vérifie un token et renvoie le user
                                 correspondant. Permet au frontend de
                                 confirmer le token avant de l'utiliser.
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from models import User
from models.base import get_db

router = APIRouter()


class LoginUserEntry(BaseModel):
    user_id: int
    display_name: str
    ha_username: str
    color_hex: str
    has_external_token: bool


class VerifyPayload(BaseModel):
    token: str


class VerifyOut(BaseModel):
    user_id: int
    display_name: str
    ha_username: str


@router.get("/users", response_model=list[LoginUserEntry])
async def list_users_for_login(db: Session = Depends(get_db)):
    """Liste les users HA connus, utile pour afficher 'connectez-vous comme…'.

    Le token n'est jamais retourné — l'user doit l'avoir noté lors de sa
    génération via l'ingress HA.
    """
    users = db.query(User).order_by(User.display_name, User.ha_username).all()
    return [
        LoginUserEntry(
            user_id=u.id,
            display_name=u.display_name or u.ha_username,
            ha_username=u.ha_username,
            color_hex=u.color_hex,
            has_external_token=u.external_token is not None,
        )
        for u in users
    ]


@router.post("/verify", response_model=VerifyOut)
async def verify_token(payload: VerifyPayload, db: Session = Depends(get_db)):
    """Vérifie un token et renvoie le user correspondant. Si invalide → 401."""
    if not payload.token or not payload.token.strip():
        raise HTTPException(401, "Token manquant.")
    user: Optional[User] = (
        db.query(User).filter(User.external_token == payload.token.strip()).first()
    )
    if not user:
        raise HTTPException(401, "Token invalide.")
    return VerifyOut(
        user_id=user.id,
        display_name=user.display_name or user.ha_username,
        ha_username=user.ha_username,
    )
