"""API Événements custom (non-bancaires) dans le planning.

Visibilité :
- un user voit toujours ses propres événements (user_id == self)
- + les événements partagés (is_shared) liés à un compte joint où il est membre
"""
from datetime import date as DateType
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import or_
from sqlalchemy.orm import Session

from models import Account, AccountMember, CustomEvent, CustomEventKind, User
from models.base import get_db
from services.access import accessible_account_ids
from services.bulk_loaders import bulk_users, display_name

router = APIRouter()


class EventCreate(BaseModel):
    date: DateType
    label: str
    kind: CustomEventKind = CustomEventKind.PERSO
    description: Optional[str] = None
    is_shared: bool = False
    account_id: Optional[int] = None


class EventUpdate(BaseModel):
    date: Optional[DateType] = None
    label: Optional[str] = None
    kind: Optional[CustomEventKind] = None
    description: Optional[str] = None
    is_shared: Optional[bool] = None
    account_id: Optional[int] = None


class EventOut(BaseModel):
    id: int
    user_id: int
    user_name: Optional[str] = None
    date: DateType
    label: str
    kind: str
    description: Optional[str]
    is_shared: bool
    account_id: Optional[int]

    class Config:
        from_attributes = True


def _to_out(db: Session, ev: CustomEvent, user_cache: Optional[dict[int, User]] = None) -> EventOut:
    user = (user_cache or {}).get(ev.user_id) if user_cache is not None else \
        db.query(User).filter(User.id == ev.user_id).first()
    return EventOut(
        id=ev.id, user_id=ev.user_id,
        user_name=display_name(user),
        date=ev.date, label=ev.label,
        kind=ev.kind.value if hasattr(ev.kind, "value") else ev.kind,
        description=ev.description,
        is_shared=ev.is_shared, account_id=ev.account_id,
    )


@router.get("/", response_model=list[EventOut])
async def list_events(
    request: Request,
    db: Session = Depends(get_db),
    from_date: Optional[DateType] = None,
    to_date: Optional[DateType] = None,
):
    """Mes événements + les événements partagés sur les comptes que je vois."""
    user: User = request.state.user
    acc_ids = accessible_account_ids(db, user.id)
    q = db.query(CustomEvent).filter(
        or_(
            CustomEvent.user_id == user.id,
            (CustomEvent.is_shared.is_(True)) & (CustomEvent.account_id.in_(acc_ids)),
        )
    )
    if from_date:
        q = q.filter(CustomEvent.date >= from_date)
    if to_date:
        q = q.filter(CustomEvent.date <= to_date)
    events = q.order_by(CustomEvent.date).all()
    user_cache = bulk_users(db, [ev.user_id for ev in events])
    return [_to_out(db, ev, user_cache) for ev in events]


@router.post("/", response_model=EventOut, status_code=201)
async def create_event(
    request: Request,
    payload: EventCreate,
    db: Session = Depends(get_db),
):
    user: User = request.state.user
    # Si is_shared sans account_id : refuser (sinon personne ne le verra)
    if payload.is_shared and not payload.account_id:
        raise HTTPException(400, "Pour partager un événement, sélectionne un compte joint.")
    if payload.account_id and user.id not in accessible_account_ids(db, payload.account_id):
        raise HTTPException(403, "Ce compte n'est pas dans ta liste.")

    ev = CustomEvent(**payload.model_dump(), user_id=user.id)
    db.add(ev)
    db.commit()
    db.refresh(ev)
    return _to_out(db, ev)


@router.patch("/{event_id}", response_model=EventOut)
async def update_event(
    event_id: int,
    request: Request,
    payload: EventUpdate,
    db: Session = Depends(get_db),
):
    user: User = request.state.user
    ev = db.query(CustomEvent).filter(CustomEvent.id == event_id).first()
    if not ev:
        raise HTTPException(404, "Événement introuvable")
    if ev.user_id != user.id:
        raise HTTPException(403, "Seul le créateur peut modifier l'événement")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(ev, k, v)
    db.commit()
    db.refresh(ev)
    return _to_out(db, ev)


@router.delete("/{event_id}", status_code=204)
async def delete_event(
    event_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    user: User = request.state.user
    ev = db.query(CustomEvent).filter(
        CustomEvent.id == event_id, CustomEvent.user_id == user.id,
    ).first()
    if not ev:
        raise HTTPException(404, "Événement introuvable")
    db.delete(ev)
    db.commit()
