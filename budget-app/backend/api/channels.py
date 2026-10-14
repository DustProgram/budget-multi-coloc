"""Canaux de notification de l'utilisateur courant (app, Discord, iMessage…)."""
import os
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from models import ChannelLink, User
from models.base import get_db
from services.channel_links import CHANNELS, CODE_TTL, create_code

router = APIRouter()


class LinkOut(BaseModel):
    id: int
    channel: str
    handle: str


class ChannelsOut(BaseModel):
    notify_channel: str
    links: list[LinkOut]
    available: list[str]
    agent_enabled: bool


class CodeIn(BaseModel):
    channel: str


class PreferenceIn(BaseModel):
    channel: str


def _out(db: Session, user: User) -> ChannelsOut:
    links = db.query(ChannelLink).filter(ChannelLink.user_id == user.id).order_by(ChannelLink.id).all()
    return ChannelsOut(
        notify_channel=user.notify_channel or "app",
        links=[LinkOut(id=l.id, channel=l.channel, handle=l.handle) for l in links],
        available=list(CHANNELS),
        agent_enabled=bool(os.environ.get("AGENT_API_TOKEN")),
    )


@router.get("/", response_model=ChannelsOut)
async def get_channels(request: Request, db: Session = Depends(get_db)):
    return _out(db, db.get(User, request.state.user.id))


@router.post("/link-code")
async def new_link_code(payload: CodeIn, request: Request):
    if payload.channel not in CHANNELS:
        raise HTTPException(422, "Canal inconnu.")
    return {"code": create_code(request.state.user.id, payload.channel), "expires_in": CODE_TTL}


@router.put("/preference", response_model=ChannelsOut)
async def set_preference(payload: PreferenceIn, request: Request, db: Session = Depends(get_db)):
    user = db.get(User, request.state.user.id)
    if payload.channel != "app" and not db.query(ChannelLink).filter(
        ChannelLink.user_id == user.id, ChannelLink.channel == payload.channel,
    ).first():
        raise HTTPException(422, "Lie d'abord ce canal.")
    user.notify_channel = payload.channel
    db.commit()
    return _out(db, user)


@router.delete("/links/{link_id}", response_model=ChannelsOut)
async def delete_link(link_id: int, request: Request, db: Session = Depends(get_db)):
    user = db.get(User, request.state.user.id)
    link: Optional[ChannelLink] = db.get(ChannelLink, link_id)
    if not link or link.user_id != user.id:
        raise HTTPException(404, "Liaison introuvable.")
    if user.notify_channel == link.channel and db.query(ChannelLink).filter(
        ChannelLink.user_id == user.id, ChannelLink.channel == link.channel,
    ).count() == 1:
        user.notify_channel = "app"
    db.delete(link)
    db.commit()
    return _out(db, user)
