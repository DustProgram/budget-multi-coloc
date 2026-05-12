"""API Foyer (household) — la coloc / famille explicite.

Un user a au plus un foyer (1-to-1 enforcé côté UI). Endpoints :
- GET    /api/households/me              → mon foyer + members
- POST   /api/households/me              → créer ou renommer mon foyer
- POST   /api/households/me/members      → ajouter un member
- DELETE /api/households/me/members/{user_id}
- GET    /api/households/me/messages     → chat global
- POST   /api/households/me/messages
- POST   /api/households/me/messages/read
- GET    /api/households/me/messages/unread
"""
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from models import (
    Household, HouseholdMember, HouseholdMessageRead, Message, User,
)
from models.base import get_db
from services.bulk_loaders import bulk_users, display_name

router = APIRouter()


# ============================================================
# Schémas
# ============================================================

class MemberOut(BaseModel):
    user_id: int
    display_name: str
    ha_username: str
    color_hex: str
    is_creator: bool
    joined_at: datetime


class HouseholdOut(BaseModel):
    id: int
    name: str
    created_by_user_id: int
    members: list[MemberOut]


class HouseholdCreate(BaseModel):
    name: str = "Mon foyer"


class AddMember(BaseModel):
    user_id: int


class MessageOut(BaseModel):
    id: int
    user_id: int
    user_name: Optional[str]
    body: str
    created_at: datetime


class MessageCreate(BaseModel):
    body: str


class UnreadOut(BaseModel):
    count: int


# ============================================================
# Helpers
# ============================================================

def _my_household(db: Session, user_id: int) -> Optional[Household]:
    """Le foyer où l'user est member. None si pas dans un foyer."""
    row = db.query(HouseholdMember).filter(HouseholdMember.user_id == user_id).first()
    if row is None:
        return None
    return db.query(Household).filter(Household.id == row.household_id).first()


def _shape(db: Session, h: Household) -> HouseholdOut:
    members_rows = db.query(HouseholdMember).filter(HouseholdMember.household_id == h.id).all()
    users = bulk_users(db, [m.user_id for m in members_rows])
    members: list[MemberOut] = []
    for m in members_rows:
        u = users.get(m.user_id)
        if u:
            members.append(MemberOut(
                user_id=u.id,
                display_name=u.display_name or u.ha_username,
                ha_username=u.ha_username,
                color_hex=u.color_hex,
                is_creator=(u.id == h.created_by_user_id),
                joined_at=m.joined_at,
            ))
    return HouseholdOut(
        id=h.id, name=h.name, created_by_user_id=h.created_by_user_id,
        members=members,
    )


# ============================================================
# Foyer
# ============================================================

@router.get("/me", response_model=Optional[HouseholdOut])
async def get_my_household(request: Request, db: Session = Depends(get_db)):
    user: User = request.state.user
    h = _my_household(db, user.id)
    return _shape(db, h) if h else None


@router.post("/me", response_model=HouseholdOut, status_code=201)
async def create_or_rename_household(
    payload: HouseholdCreate,
    request: Request,
    db: Session = Depends(get_db),
):
    """Crée mon foyer si je n'en ai pas, sinon le renomme."""
    user: User = request.state.user
    h = _my_household(db, user.id)
    if h is None:
        h = Household(name=payload.name.strip() or "Mon foyer", created_by_user_id=user.id)
        db.add(h)
        db.flush()
        db.add(HouseholdMember(household_id=h.id, user_id=user.id))
        db.commit()
        db.refresh(h)
    else:
        if h.created_by_user_id != user.id:
            raise HTTPException(403, "Seul le créateur peut renommer le foyer.")
        h.name = payload.name.strip() or h.name
        db.commit()
        db.refresh(h)
    return _shape(db, h)


@router.post("/me/members", response_model=HouseholdOut)
async def add_member(
    payload: AddMember,
    request: Request,
    db: Session = Depends(get_db),
):
    user: User = request.state.user
    h = _my_household(db, user.id)
    if h is None:
        raise HTTPException(404, "Crée ton foyer d'abord.")
    if h.created_by_user_id != user.id:
        raise HTTPException(403, "Seul le créateur peut ajouter des membres.")

    target = db.query(User).filter(User.id == payload.user_id).first()
    if not target:
        raise HTTPException(404, "Utilisateur introuvable.")
    existing = db.query(HouseholdMember).filter(
        HouseholdMember.household_id == h.id,
        HouseholdMember.user_id == target.id,
    ).first()
    if existing:
        raise HTTPException(409, "Déjà membre du foyer.")
    # un user ne peut être que dans un seul foyer (MVP)
    other = db.query(HouseholdMember).filter(HouseholdMember.user_id == target.id).first()
    if other:
        raise HTTPException(409, f"{target.display_name or target.ha_username} est déjà dans un autre foyer.")

    db.add(HouseholdMember(household_id=h.id, user_id=target.id))
    db.commit()
    db.refresh(h)
    return _shape(db, h)


@router.delete("/me/members/{user_id}", status_code=204)
async def remove_member(
    user_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    user: User = request.state.user
    h = _my_household(db, user.id)
    if h is None:
        raise HTTPException(404, "Pas de foyer.")
    if h.created_by_user_id != user.id and user_id != user.id:
        raise HTTPException(403, "Seul le créateur peut retirer un autre membre.")
    if user_id == h.created_by_user_id:
        raise HTTPException(400, "Le créateur ne peut pas être retiré (supprime le foyer plutôt).")
    db.query(HouseholdMember).filter(
        HouseholdMember.household_id == h.id,
        HouseholdMember.user_id == user_id,
    ).delete()
    db.commit()


@router.delete("/me", status_code=204)
async def delete_household(request: Request, db: Session = Depends(get_db)):
    """Supprime entièrement le foyer (réservé au créateur).
    Cascade SQL supprime members, messages et reads."""
    user: User = request.state.user
    h = _my_household(db, user.id)
    if h is None:
        raise HTTPException(404, "Pas de foyer.")
    if h.created_by_user_id != user.id:
        raise HTTPException(403, "Seul le créateur peut supprimer le foyer.")
    # Nettoyer manuellement les reads et messages (les FK CASCADE devraient
    # s'en charger, mais on est explicite pour les anciens schémas).
    from models import HouseholdMessageRead, Message
    db.query(HouseholdMessageRead).filter(HouseholdMessageRead.household_id == h.id).delete()
    db.query(Message).filter(Message.household_id == h.id).delete()
    db.delete(h)
    db.commit()


# ============================================================
# Chat global du foyer
# ============================================================

def _ensure_member(db: Session, user: User) -> Household:
    h = _my_household(db, user.id)
    if h is None:
        raise HTTPException(404, "Pas de foyer.")
    return h


@router.get("/me/messages", response_model=list[MessageOut])
async def list_messages(
    request: Request,
    db: Session = Depends(get_db),
    limit: int = 100,
):
    user: User = request.state.user
    h = _ensure_member(db, user)
    rows = (
        db.query(Message)
        .filter(Message.household_id == h.id)
        .order_by(Message.created_at.desc())
        .limit(limit)
        .all()
    )
    rows.reverse()
    users = bulk_users(db, [m.user_id for m in rows])
    return [
        MessageOut(
            id=m.id, user_id=m.user_id,
            user_name=display_name(users.get(m.user_id)),
            body=m.body, created_at=m.created_at,
        )
        for m in rows
    ]


@router.post("/me/messages", response_model=MessageOut, status_code=201)
async def post_message(
    payload: MessageCreate,
    request: Request,
    db: Session = Depends(get_db),
):
    user: User = request.state.user
    h = _ensure_member(db, user)
    body = payload.body.strip()
    if not body:
        raise HTTPException(400, "Le message ne peut pas être vide.")
    if len(body) > 4000:
        raise HTTPException(400, "Message trop long (max 4000).")
    msg = Message(household_id=h.id, user_id=user.id, body=body)
    db.add(msg)
    db.commit()
    db.refresh(msg)
    return MessageOut(
        id=msg.id, user_id=msg.user_id,
        user_name=user.display_name or user.ha_username,
        body=msg.body, created_at=msg.created_at,
    )


@router.post("/me/messages/read", status_code=204)
async def mark_read(request: Request, db: Session = Depends(get_db)):
    user: User = request.state.user
    h = _ensure_member(db, user)
    row = db.query(HouseholdMessageRead).filter(
        HouseholdMessageRead.user_id == user.id,
        HouseholdMessageRead.household_id == h.id,
    ).first()
    if row is None:
        row = HouseholdMessageRead(
            user_id=user.id, household_id=h.id, last_read_at=datetime.utcnow(),
        )
        db.add(row)
    else:
        row.last_read_at = datetime.utcnow()
    db.commit()


@router.get("/me/messages/unread", response_model=UnreadOut)
async def unread_count(request: Request, db: Session = Depends(get_db)):
    user: User = request.state.user
    h = _ensure_member(db, user)
    row = db.query(HouseholdMessageRead).filter(
        HouseholdMessageRead.user_id == user.id,
        HouseholdMessageRead.household_id == h.id,
    ).first()
    last = row.last_read_at if row else datetime(1970, 1, 1)
    cnt = (
        db.query(Message)
        .filter(
            Message.household_id == h.id,
            Message.user_id != user.id,
            Message.created_at > last,
        )
        .count()
    )
    return UnreadOut(count=cnt)
