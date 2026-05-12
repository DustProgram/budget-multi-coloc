"""API Messagerie sur compte joint.

GET    /api/accounts/{id}/messages         → liste les messages du compte joint
POST   /api/accounts/{id}/messages         → poste un nouveau message
POST   /api/accounts/{id}/messages/read    → marque tout comme lu jusqu'à maintenant
GET    /api/accounts/{id}/messages/unread  → compteur de messages non lus
"""
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from models import Message, MessageRead, User
from models.base import get_db
from services.access import account_member_user_ids
from services.bulk_loaders import bulk_users, display_name

router = APIRouter()


class MessageCreate(BaseModel):
    body: str


class MessageOut(BaseModel):
    id: int
    user_id: int
    user_name: Optional[str]
    body: str
    created_at: datetime


class UnreadOut(BaseModel):
    count: int


def _ensure_member(db: Session, user: User, account_id: int) -> None:
    if user.id not in account_member_user_ids(db, account_id):
        raise HTTPException(403, "Pas membre de ce compte")


@router.get("/{account_id}/messages", response_model=list[MessageOut])
async def list_messages(
    account_id: int,
    request: Request,
    db: Session = Depends(get_db),
    limit: int = 100,
):
    user: User = request.state.user
    _ensure_member(db, user, account_id)
    rows = (
        db.query(Message)
        .filter(Message.account_id == account_id)
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


@router.post("/{account_id}/messages", response_model=MessageOut, status_code=201)
async def post_message(
    account_id: int,
    request: Request,
    payload: MessageCreate,
    db: Session = Depends(get_db),
):
    user: User = request.state.user
    _ensure_member(db, user, account_id)
    body = payload.body.strip()
    if not body:
        raise HTTPException(400, "Le message ne peut pas être vide.")
    if len(body) > 4000:
        raise HTTPException(400, "Message trop long (max 4000 caractères).")
    msg = Message(account_id=account_id, user_id=user.id, body=body)
    db.add(msg)
    db.commit()
    db.refresh(msg)
    return MessageOut(
        id=msg.id, user_id=msg.user_id,
        user_name=user.display_name or user.ha_username,
        body=msg.body, created_at=msg.created_at,
    )


@router.post("/{account_id}/messages/read", status_code=204)
async def mark_read(
    account_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    """Pointe last_read_at à now → compteur unread tombe à 0 pour ce user."""
    user: User = request.state.user
    _ensure_member(db, user, account_id)
    row = db.query(MessageRead).filter(
        MessageRead.user_id == user.id,
        MessageRead.account_id == account_id,
    ).first()
    if row is None:
        row = MessageRead(user_id=user.id, account_id=account_id, last_read_at=datetime.utcnow())
        db.add(row)
    else:
        row.last_read_at = datetime.utcnow()
    db.commit()


@router.get("/{account_id}/messages/unread", response_model=UnreadOut)
async def unread_count(
    account_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    """Combien de messages n'ont pas encore été marqués lus par ce user."""
    user: User = request.state.user
    _ensure_member(db, user, account_id)
    row = db.query(MessageRead).filter(
        MessageRead.user_id == user.id,
        MessageRead.account_id == account_id,
    ).first()
    last = row.last_read_at if row else datetime(1970, 1, 1)
    cnt = (
        db.query(Message)
        .filter(
            Message.account_id == account_id,
            Message.user_id != user.id,        # je ne compte pas mes propres messages
            Message.created_at > last,
        )
        .count()
    )
    return UnreadOut(count=cnt)
