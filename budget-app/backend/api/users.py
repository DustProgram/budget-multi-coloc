"""API utilisateur courant : profil, gestion du token d'accès externe."""
from typing import Optional

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from models.base import get_db
from models import User
from services.tokens import generate_external_token

router = APIRouter()


class MeOut(BaseModel):
    user_id: int
    ha_username: str
    display_name: Optional[str]
    color_hex: str
    is_admin: bool
    has_external_token: bool


class TokenOut(BaseModel):
    token: str
    note: str = (
        "Garde ce token secret — quiconque y a accès peut piloter ton compte "
        "via le port externe 8765 sans passer par Home Assistant. Si tu le "
        "perds, régénère-le pour invalider l'ancien."
    )


@router.get("/me", response_model=MeOut)
async def get_me(request: Request):
    user: User = request.state.user
    return MeOut(
        user_id=user.id,
        ha_username=user.ha_username,
        display_name=user.display_name,
        color_hex=user.color_hex,
        is_admin=user.is_admin,
        has_external_token=user.external_token is not None,
    )


@router.post("/me/external-token", response_model=TokenOut)
async def generate_token(request: Request, db: Session = Depends(get_db)):
    """(Re)génère le token d'accès externe. L'ancien est invalidé."""
    user_id = request.state.user.id
    user = db.get(User, user_id)
    user.external_token = generate_external_token()
    db.commit()
    db.refresh(user)
    return TokenOut(token=user.external_token)


@router.delete("/me/external-token", status_code=204)
async def revoke_token(request: Request, db: Session = Depends(get_db)):
    """Révoque le token : plus aucun accès externe possible pour ce user."""
    user_id = request.state.user.id
    user = db.get(User, user_id)
    user.external_token = None
    db.commit()
