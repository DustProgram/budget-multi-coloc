"""API Chat IA — conversations avec l'assistant Claude.

Endpoints :
  GET    /chat/conversations
  POST   /chat/conversations                 → crée une conversation vide
  DELETE /chat/conversations/{id}            → supprime tout (cascade messages/actions)
  GET    /chat/conversations/{id}/messages   → historique complet
  POST   /chat/conversations/{id}/messages   → envoie un message, exécute la boucle Claude
  POST   /chat/actions/{id}/confirm          → exécute une action pending (>= 50€)
  POST   /chat/actions/{id}/cancel           → annule une action pending
  POST   /chat/actions/{id}/undo             → undo d'une action executed
"""
import json
import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from models import ChatAction, ChatConversation, ChatMessage, User
from models.base import get_db
from services import ai_chat

router = APIRouter()
logger = logging.getLogger(__name__)


class ConvOut(BaseModel):
    id: int
    title: Optional[str]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class SendMessageIn(BaseModel):
    text: str


class TurnOut(BaseModel):
    messages: list[dict]
    actions: list[dict]


@router.get("/conversations", response_model=list[ConvOut])
async def list_conversations(request: Request, db: Session = Depends(get_db)):
    user: User = request.state.user
    return (
        db.query(ChatConversation)
        .filter(ChatConversation.user_id == user.id)
        .order_by(ChatConversation.updated_at.desc())
        .limit(50)
        .all()
    )


@router.post("/conversations", response_model=ConvOut, status_code=201)
async def create_conversation(request: Request, db: Session = Depends(get_db)):
    user: User = request.state.user
    conv = ChatConversation(user_id=user.id, title=None)
    db.add(conv)
    db.commit()
    db.refresh(conv)
    return conv


@router.delete("/conversations/{conv_id}", status_code=204)
async def delete_conversation(
    conv_id: int, request: Request, db: Session = Depends(get_db),
):
    user: User = request.state.user
    conv = (
        db.query(ChatConversation)
        .filter(ChatConversation.id == conv_id, ChatConversation.user_id == user.id)
        .first()
    )
    if not conv:
        raise HTTPException(404, "Conversation introuvable")
    db.delete(conv)
    db.commit()


def _get_conv_or_404(db: Session, user: User, conv_id: int) -> ChatConversation:
    conv = (
        db.query(ChatConversation)
        .filter(ChatConversation.id == conv_id, ChatConversation.user_id == user.id)
        .first()
    )
    if not conv:
        raise HTTPException(404, "Conversation introuvable")
    return conv


@router.get("/conversations/{conv_id}/messages")
async def get_messages(
    conv_id: int, request: Request, db: Session = Depends(get_db),
):
    user: User = request.state.user
    conv = _get_conv_or_404(db, user, conv_id)
    msgs = (
        db.query(ChatMessage)
        .filter(ChatMessage.conversation_id == conv.id)
        .order_by(ChatMessage.id.asc())
        .all()
    )
    actions = (
        db.query(ChatAction)
        .join(ChatMessage, ChatAction.message_id == ChatMessage.id)
        .filter(ChatMessage.conversation_id == conv.id)
        .all()
    )
    return {
        "conversation": {"id": conv.id, "title": conv.title},
        "messages": [ai_chat._serialize_message(m) for m in msgs],
        "actions": [ai_chat._serialize_action(a) for a in actions],
    }


@router.post("/conversations/{conv_id}/messages", response_model=TurnOut)
async def send_message(
    conv_id: int,
    payload: SendMessageIn,
    request: Request,
    db: Session = Depends(get_db),
):
    user: User = request.state.user
    conv = _get_conv_or_404(db, user, conv_id)
    text = payload.text.strip()
    if not text:
        raise HTTPException(400, "Message vide")

    # Si la conversation n'a pas encore de titre, prendre les ~40 premiers chars
    if not conv.title:
        conv.title = text[:60]
        db.commit()

    try:
        result = ai_chat.run_chat_turn(db, user, conv, text)
    except ai_chat.AIChatError as e:
        raise HTTPException(503, str(e))
    return result


@router.post("/actions/{action_id}/confirm")
async def confirm_action(
    action_id: int, request: Request, db: Session = Depends(get_db),
):
    user: User = request.state.user
    try:
        return ai_chat.confirm_action(db, user, action_id)
    except ai_chat.AIChatError as e:
        raise HTTPException(400, str(e))


@router.post("/actions/{action_id}/cancel")
async def cancel_action(
    action_id: int, request: Request, db: Session = Depends(get_db),
):
    user: User = request.state.user
    try:
        return ai_chat.cancel_action(db, user, action_id)
    except ai_chat.AIChatError as e:
        raise HTTPException(400, str(e))


@router.post("/actions/{action_id}/undo")
async def undo_action(
    action_id: int, request: Request, db: Session = Depends(get_db),
):
    user: User = request.state.user
    try:
        return ai_chat.undo_action(db, user, action_id)
    except ai_chat.AIChatError as e:
        raise HTTPException(400, str(e))


@router.get("/providers")
async def list_providers(request: Request):
    """Liste tous les providers LLM supportés avec leur preset par défaut."""
    from services.llm_client import PROVIDER_PRESETS
    return {
        "providers": [
            {
                "key": k,
                "label": v.get("label", k),
                "default_model": v.get("model") or "",
                "default_base_url": v.get("base_url") or "",
                "needs_api_key": k not in ("ollama", "lmstudio"),
            }
            for k, v in PROVIDER_PRESETS.items()
        ],
    }


@router.get("/status")
async def chat_status(request: Request, db: Session = Depends(get_db)):
    """Renvoie provider, modèle, limites configurées et usage courant."""
    from services.llm_client import get_llm_config, get_usage_window
    cfg = get_llm_config()
    usage = get_usage_window(db)
    return {
        "available": bool(cfg.get("api_key")),
        "provider": cfg.get("provider"),
        "model": cfg.get("model"),
        "limits": {
            "rpm": cfg.get("rpm_limit") or 0,
            "tpm": cfg.get("tpm_limit") or 0,
            "rpd": cfg.get("rpd_limit") or 0,
        },
        "usage": usage,
    }
