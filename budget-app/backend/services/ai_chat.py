"""Boucle de chat avec Claude API + function calling.

Stratégie :
  1. Charger l'historique de la conversation
  2. Envoyer à Claude avec la liste des outils
  3. Si Claude renvoie un tool_use :
     - Si l'outil demande confirmation (montant >= 50€ ou add_income)
       → on enregistre une ChatAction en status 'pending' SANS exécuter,
         on stoppe la boucle, on renvoie le résultat à l'utilisateur.
     - Sinon on exécute, on enregistre une ChatAction 'executed',
       on renvoie le résultat à Claude pour qu'il continue.
  4. Quand Claude renvoie un message texte final, on stocke et on retourne.

Limite de sécurité : max 6 itérations par tour pour éviter une boucle infinie.
"""
from __future__ import annotations

import json
import logging
import os
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

from sqlalchemy.orm import Session

from models import ChatAction, ChatConversation, ChatMessage, User
from services import ai_tools

logger = logging.getLogger(__name__)

CLAUDE_MODEL = "claude-haiku-4-5-20251001"
MAX_TURNS = 6

SYSTEM_PROMPT = """Tu es l'assistant intégré à l'app Budget Multi-Coloc, un outil de gestion budgétaire personnel et partagé en colocation.

Tu peux :
- Répondre à des questions sur le fonctionnement de l'app et sur les données de l'utilisateur (comptes, charges, revenus, achats, courses).
- Ajouter des dépenses, charges, revenus, ou éléments à la liste de courses partagée.
- Marquer des courses comme achetées ou les supprimer.

Règles :
- Réponds toujours en français, ton concis et amical.
- Utilise les outils dès que tu as besoin de données fraîches : ne suppose JAMAIS le contenu de la base. Si l'utilisateur dit "ajoute 5€ de courses", appelle `list_accounts` si tu ne connais pas encore les comptes, puis `add_purchase`.
- Pour les actions d'écriture, vérifie le compte avant : si l'utilisateur n'a pas précisé sur quel compte, demande ou propose le premier compte de space `perso`.
- Si une action coûte ≥ 50€ ou ajoute un revenu, l'utilisateur devra confirmer côté UI (tu n'as pas besoin de demander, ça s'affiche automatiquement). Annonce simplement que tu attends sa validation.
- Ne fabrique pas de chiffres : utilise `get_dashboard` ou les listings pour avoir des montants exacts.
"""


def _load_options() -> dict:
    """Lit /data/options.json (config HA add-on) si présent, sinon dict vide."""
    p = Path("/data/options.json")
    if p.exists():
        try:
            return json.loads(p.read_text())
        except Exception as e:
            logger.warning("Impossible de lire /data/options.json: %s", e)
    return {}


def get_claude_api_key() -> Optional[str]:
    """Priorité : env CLAUDE_API_KEY (dev), sinon options HA."""
    env_key = os.environ.get("CLAUDE_API_KEY")
    if env_key:
        return env_key.strip() or None
    options = _load_options()
    key = options.get("claude_api_key") or options.get("anthropic_api_key")
    if key:
        return str(key).strip() or None
    return None


def _serialize_history(messages: list[ChatMessage]) -> list[dict]:
    """Convertit les ChatMessage en format Anthropic Messages API.

    Le rôle 'tool' n'existe pas pour Anthropic — les résultats d'outils sont
    des content blocks de type 'tool_result' à l'intérieur d'un message 'user'.
    On reconstitue donc ça à partir de notre stockage.
    """
    out: list[dict] = []
    for m in messages:
        if m.role == "user":
            out.append({"role": "user", "content": m.content or ""})
        elif m.role == "assistant":
            blocks: list[dict] = []
            if m.content:
                blocks.append({"type": "text", "text": m.content})
            if m.tool_calls:
                try:
                    calls = json.loads(m.tool_calls)
                    for c in calls:
                        blocks.append({
                            "type": "tool_use",
                            "id": c["id"],
                            "name": c["name"],
                            "input": c.get("input", {}),
                        })
                except Exception as e:
                    logger.warning("tool_calls JSON invalide msg=%s: %s", m.id, e)
            if not blocks:
                blocks = [{"type": "text", "text": ""}]
            out.append({"role": "assistant", "content": blocks})
        elif m.role == "tool_result":
            # Stocké comme JSON : {tool_use_id, content, is_error}
            try:
                payload = json.loads(m.content or "{}")
                out.append({
                    "role": "user",
                    "content": [{
                        "type": "tool_result",
                        "tool_use_id": payload["tool_use_id"],
                        "content": payload.get("content", ""),
                        **({"is_error": True} if payload.get("is_error") else {}),
                    }],
                })
            except Exception as e:
                logger.warning("tool_result JSON invalide msg=%s: %s", m.id, e)
    return out


def _persist_assistant_message(
    db: Session,
    conv: ChatConversation,
    text: Optional[str],
    tool_uses: list[dict],
) -> ChatMessage:
    msg = ChatMessage(
        conversation_id=conv.id,
        role="assistant",
        content=text or None,
        tool_calls=json.dumps(tool_uses) if tool_uses else None,
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)
    return msg


def _persist_tool_result(
    db: Session,
    conv: ChatConversation,
    tool_use_id: str,
    content: Any,
    is_error: bool = False,
) -> ChatMessage:
    payload = {
        "tool_use_id": tool_use_id,
        "content": content if isinstance(content, str) else json.dumps(content, default=str),
        "is_error": is_error,
    }
    msg = ChatMessage(
        conversation_id=conv.id,
        role="tool_result",
        content=json.dumps(payload),
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)
    return msg


class AIChatError(Exception):
    pass


def run_chat_turn(
    db: Session,
    user: User,
    conv: ChatConversation,
    user_text: str,
) -> dict:
    """Exécute un tour complet : enregistre le message utilisateur, appelle Claude
    en boucle jusqu'à obtenir une réponse texte finale ou une action en attente.

    Retourne {"messages": [...], "actions": [...]} pour le frontend.
    """
    api_key = get_claude_api_key()
    if not api_key:
        raise AIChatError(
            "Pas de clé Claude API configurée. Renseigne-la dans Paramètres > Add-on > Configuration."
        )

    # Import à l'intérieur pour ne pas crasher si la dépendance est absente en dev
    try:
        from anthropic import Anthropic
    except ImportError as e:
        raise AIChatError(
            "Le SDK Anthropic n'est pas installé. Ajoute `anthropic` à requirements.txt."
        ) from e

    client = Anthropic(api_key=api_key)

    # 1) Stocker le message utilisateur
    user_msg = ChatMessage(conversation_id=conv.id, role="user", content=user_text)
    db.add(user_msg)
    conv.updated_at = datetime.utcnow()
    db.commit()

    new_messages: list[ChatMessage] = [user_msg]
    new_actions: list[ChatAction] = []

    for turn in range(MAX_TURNS):
        # Recharger l'historique à chaque tour pour avoir le dernier tool_result
        history = (
            db.query(ChatMessage)
            .filter(ChatMessage.conversation_id == conv.id)
            .order_by(ChatMessage.id.asc())
            .all()
        )
        messages_for_api = _serialize_history(history)

        try:
            response = client.messages.create(
                model=CLAUDE_MODEL,
                max_tokens=2048,
                system=SYSTEM_PROMPT,
                tools=ai_tools.TOOL_DEFINITIONS,
                messages=messages_for_api,
            )
        except Exception as e:
            logger.exception("Erreur Claude API")
            raise AIChatError(f"Erreur Claude API : {e}")

        text_parts = []
        tool_uses = []
        for block in response.content:
            if block.type == "text":
                text_parts.append(block.text)
            elif block.type == "tool_use":
                tool_uses.append({
                    "id": block.id,
                    "name": block.name,
                    "input": block.input,
                })

        assistant_text = "\n".join(t for t in text_parts if t).strip() or None
        assistant_msg = _persist_assistant_message(db, conv, assistant_text, tool_uses)
        new_messages.append(assistant_msg)

        if response.stop_reason != "tool_use" or not tool_uses:
            # Réponse finale, on arrête
            break

        # Exécuter chaque tool_use
        any_pending = False
        for tu in tool_uses:
            tool_name = tu["name"]
            tool_input = tu["input"] or {}

            if ai_tools.requires_confirmation(tool_name, tool_input):
                # Pas d'exécution : on crée une action 'pending' et on renvoie
                # à Claude un tool_result indiquant l'attente
                action = ChatAction(
                    message_id=assistant_msg.id,
                    user_id=user.id,
                    tool_name=tool_name,
                    tool_input=json.dumps(tool_input, default=str),
                    status="pending",
                )
                db.add(action)
                db.commit()
                db.refresh(action)
                new_actions.append(action)
                _persist_tool_result(
                    db, conv, tu["id"],
                    {
                        "status": "pending_confirmation",
                        "action_id": action.id,
                        "message": "Action mise en attente — confirmation utilisateur requise (montant ≥ 50€ ou revenu).",
                    },
                )
                any_pending = True
            else:
                try:
                    result = ai_tools.execute_tool(db, user, tool_name, tool_input)
                    action = ChatAction(
                        message_id=assistant_msg.id,
                        user_id=user.id,
                        tool_name=tool_name,
                        tool_input=json.dumps(tool_input, default=str),
                        status="executed",
                        entity_type=result.get("entity_type"),
                        entity_id=result.get("entity_id"),
                        result=json.dumps(result, default=str),
                        executed_at=datetime.utcnow(),
                    )
                    db.add(action)
                    db.commit()
                    db.refresh(action)
                    new_actions.append(action)
                    _persist_tool_result(db, conv, tu["id"], result)
                except Exception as e:
                    logger.exception("Erreur outil %s", tool_name)
                    _persist_tool_result(
                        db, conv, tu["id"],
                        {"status": "error", "message": str(e)},
                        is_error=True,
                    )

        if any_pending:
            # On laisse Claude annoncer l'attente dans la même boucle, mais on
            # ne lui redonne pas la main pour proposer une autre action.
            # Le prochain tour servira juste à la réponse texte finale.
            continue

    return {
        "messages": [_serialize_message(m) for m in new_messages],
        "actions": [_serialize_action(a) for a in new_actions],
    }


def confirm_action(db: Session, user: User, action_id: int) -> dict:
    action = db.query(ChatAction).filter(ChatAction.id == action_id).first()
    if not action:
        raise AIChatError("Action introuvable")
    if action.user_id != user.id:
        raise AIChatError("Action appartient à un autre utilisateur")
    if action.status != "pending":
        raise AIChatError(f"Action déjà traitée (status={action.status})")
    tool_input = json.loads(action.tool_input)
    result = ai_tools.execute_tool(db, user, action.tool_name, tool_input)
    action.status = "executed"
    action.entity_type = result.get("entity_type")
    action.entity_id = result.get("entity_id")
    action.result = json.dumps(result, default=str)
    action.executed_at = datetime.utcnow()
    db.commit()
    return _serialize_action(action)


def cancel_action(db: Session, user: User, action_id: int) -> dict:
    action = db.query(ChatAction).filter(ChatAction.id == action_id).first()
    if not action:
        raise AIChatError("Action introuvable")
    if action.user_id != user.id:
        raise AIChatError("Action appartient à un autre utilisateur")
    if action.status != "pending":
        raise AIChatError(f"Action déjà traitée (status={action.status})")
    action.status = "cancelled"
    db.commit()
    return _serialize_action(action)


def undo_action(db: Session, user: User, action_id: int) -> dict:
    action = db.query(ChatAction).filter(ChatAction.id == action_id).first()
    if not action:
        raise AIChatError("Action introuvable")
    if action.user_id != user.id:
        raise AIChatError("Action appartient à un autre utilisateur")
    if action.status != "executed":
        raise AIChatError("Seules les actions exécutées peuvent être annulées")
    ok = ai_tools.undo_action(db, user, action)
    if not ok:
        raise AIChatError("Annulation impossible (entité déjà supprimée ou non supportée)")
    return _serialize_action(action)


def _serialize_message(m: ChatMessage) -> dict:
    return {
        "id": m.id,
        "conversation_id": m.conversation_id,
        "role": m.role,
        "content": m.content,
        "tool_calls": json.loads(m.tool_calls) if m.tool_calls else None,
        "created_at": m.created_at.isoformat() if m.created_at else None,
    }


def _serialize_action(a: ChatAction) -> dict:
    return {
        "id": a.id,
        "message_id": a.message_id,
        "tool_name": a.tool_name,
        "tool_input": json.loads(a.tool_input) if a.tool_input else {},
        "status": a.status,
        "entity_type": a.entity_type,
        "entity_id": a.entity_id,
        "result": json.loads(a.result) if a.result else None,
        "created_at": a.created_at.isoformat() if a.created_at else None,
        "executed_at": a.executed_at.isoformat() if a.executed_at else None,
    }
