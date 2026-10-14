"""API pour l'agent conversationnel (Hermes) et l'automatisation (n8n).

Auth : header ``Authorization: Bearer <AGENT_API_TOKEN>``. Ce token agit
pour le compte d'un utilisateur identifié par son canal + handle (lié via
code, cf services/channel_links.py) ou, pour n8n, par son username. Il ne
donne accès qu'aux routes de ce fichier.

Questions de rapprochement : les opérations d'un compte perso partent sur
le canal choisi par son titulaire ; celles d'un compte joint restent dans
l'app (elles concernent tout le foyer).
"""
import base64
import binascii
import hmac
import os
from datetime import date, datetime
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from api.bank import ResolveIn, apply_resolution, get_tx_for_write, import_file, to_out
from models import (
    Account, BankTransaction, ChannelLink, ExternalCredential, User,
)
from models.base import get_db
from services import reconciliation as rec
from services.access import accessible_account_ids, is_joint_account, user_can_write_account
from services.ai_chat import AIChatError
from services.channel_links import CHANNELS, consume_code

router = APIRouter()


def require_agent(request: Request) -> None:
    expected = os.environ.get("AGENT_API_TOKEN", "")
    if not expected:
        raise HTTPException(503, "API agent désactivée (AGENT_API_TOKEN non défini).")
    auth = request.headers.get("Authorization", "")
    token = auth[7:].strip() if auth.lower().startswith("bearer ") else ""
    if not hmac.compare_digest(token.encode(), expected.encode()):
        raise HTTPException(401, "Token agent invalide.")


class Who(BaseModel):
    channel: Optional[str] = None
    handle: Optional[str] = None
    username: Optional[str] = None


def resolve_actor(db: Session, who: Who) -> User:
    if who.channel and who.handle:
        link = db.query(ChannelLink).filter(
            ChannelLink.channel == who.channel, ChannelLink.handle == who.handle.strip(),
        ).first()
        user = db.get(User, link.user_id) if link else None
        if not user:
            raise HTTPException(404, "Identité inconnue : l'utilisateur doit lier ce compte "
                                     "depuis l'app (Réglages → Notifications) et envoyer le code.")
        return user
    if who.username:
        cred = db.query(ExternalCredential).filter(ExternalCredential.username == who.username.strip()).first()
        user = db.get(User, cred.user_id) if cred else None
        if not user:
            raise HTTPException(404, "Utilisateur inconnu.")
        return user
    raise HTTPException(422, "Préciser channel + handle, ou username.")


def _accounts_out(db: Session, user: User) -> list[dict]:
    accs = db.query(Account).filter(
        Account.id.in_(accessible_account_ids(db, user.id)), Account.is_active.is_(True),
    ).order_by(Account.name).all()
    return [
        {"id": a.id, "name": a.name, "bank": a.bank, "joint": is_joint_account(db, a.id)}
        for a in accs if user_can_write_account(db, user.id, a.id)
    ]


# ============================================================
# Identité
# ============================================================

class LinkIn(BaseModel):
    channel: str
    handle: str
    code: str


@router.post("/link", dependencies=[Depends(require_agent)])
async def link_identity(payload: LinkIn, db: Session = Depends(get_db)):
    if payload.channel not in CHANNELS:
        raise HTTPException(422, "Canal inconnu.")
    user_id = consume_code(payload.code, payload.channel)
    if user_id is None:
        raise HTTPException(400, "Code invalide ou expiré. Génère un nouveau code dans l'app.")
    handle = payload.handle.strip()
    existing = db.query(ChannelLink).filter(
        ChannelLink.channel == payload.channel, ChannelLink.handle == handle,
    ).first()
    if existing and existing.user_id != user_id:
        raise HTTPException(409, "Cette identité est déjà liée à un autre utilisateur.")
    if not existing:
        db.add(ChannelLink(user_id=user_id, channel=payload.channel, handle=handle))
    user = db.get(User, user_id)
    if (user.notify_channel or "app") == "app":
        user.notify_channel = payload.channel
    db.commit()
    return {"user_id": user.id, "display_name": user.display_name or user.ha_username,
            "notify_channel": user.notify_channel}


@router.post("/whoami", dependencies=[Depends(require_agent)])
async def whoami(who: Who, db: Session = Depends(get_db)):
    user = resolve_actor(db, who)
    return {
        "user_id": user.id,
        "display_name": user.display_name or user.ha_username,
        "notify_channel": user.notify_channel or "app",
        "accounts": _accounts_out(db, user),
    }


# ============================================================
# Questions de rapprochement
# ============================================================

@router.get("/pending", dependencies=[Depends(require_agent)])
async def pending(include_notified: bool = False, db: Session = Depends(get_db)):
    """Questions à envoyer, groupées par destinataire (canal + handle)."""
    q = db.query(BankTransaction).filter(BankTransaction.status == rec.TO_REVIEW)
    if not include_notified:
        q = q.filter(BankTransaction.notified_at.is_(None))
    groups: dict[int, dict[str, Any]] = {}
    for tx in q.order_by(BankTransaction.date).limit(500).all():
        if is_joint_account(db, tx.account_id):
            continue
        acc = db.get(Account, tx.account_id)
        owner = db.get(User, acc.user_id) if acc else None
        channel = (owner.notify_channel if owner else None) or "app"
        if channel == "app":
            continue
        link = db.query(ChannelLink).filter(
            ChannelLink.user_id == owner.id, ChannelLink.channel == channel,
        ).first()
        if not link:
            continue
        g = groups.setdefault(owner.id, {
            "user_id": owner.id,
            "display_name": owner.display_name or owner.ha_username,
            "channel": channel,
            "handle": link.handle,
            "items": [],
        })
        out = to_out(db, tx, with_options=True)
        g["items"].append({
            "id": out.id, "date": out.date.isoformat(), "amount": str(out.amount),
            "label": out.label, "account": out.account_name,
            "question": out.question,
            "options": [o.model_dump() for o in out.options],
            "suggested_pattern": out.suggested_pattern,
        })
    return list(groups.values())


class NotifiedIn(BaseModel):
    ids: list[int]


@router.post("/notified", dependencies=[Depends(require_agent)])
async def mark_notified(payload: NotifiedIn, db: Session = Depends(get_db)):
    n = db.query(BankTransaction).filter(BankTransaction.id.in_(payload.ids)).update(
        {BankTransaction.notified_at: datetime.utcnow()}, synchronize_session=False,
    )
    db.commit()
    return {"updated": n}


class AgentResolveIn(Who, ResolveIn):
    pass


@router.post("/transactions/{tx_id}/resolve", dependencies=[Depends(require_agent)])
async def agent_resolve(tx_id: int, payload: AgentResolveIn, db: Session = Depends(get_db)):
    user = resolve_actor(db, payload)
    tx = apply_resolution(db, user, get_tx_for_write(db, user, tx_id), payload)
    return to_out(db, tx).model_dump(mode="json")


@router.post("/transactions/{tx_id}", dependencies=[Depends(require_agent)])
async def agent_get_tx(tx_id: int, who: Who, db: Session = Depends(get_db)):
    user = resolve_actor(db, who)
    return to_out(db, get_tx_for_write(db, user, tx_id), with_options=True).model_dump(mode="json")


# ============================================================
# Fichiers : relevés et documents (tickets, factures, quittances)
# ============================================================

class FileIn(Who):
    filename: str
    content_b64: str
    account_id: Optional[int] = None


def _decode_b64(raw: str) -> bytes:
    try:
        return base64.b64decode(raw.split(",", 1)[-1], validate=False)
    except (binascii.Error, ValueError):
        raise HTTPException(422, "content_b64 invalide.")


@router.post("/statements", dependencies=[Depends(require_agent)])
async def agent_import_statement(payload: FileIn, db: Session = Depends(get_db)):
    user = resolve_actor(db, payload)
    if not payload.account_id:
        raise HTTPException(422, {
            "detail": "Sur quel compte est ce relevé ? Repasse account_id.",
            "accounts": _accounts_out(db, user),
        })
    return import_file(db, user, payload.account_id, payload.filename, _decode_b64(payload.content_b64))


class DocumentIn(Who):
    kind: str  # ticket | invoice
    content_b64: str
    mime_type: str = "image/jpeg"


@router.post("/documents/analyze", dependencies=[Depends(require_agent)])
async def agent_analyze_document(payload: DocumentIn, db: Session = Depends(get_db)):
    """Lit un ticket / une facture / une quittance. Ne crée rien : l'agent
    doit faire confirmer le résultat avant d'appeler /documents/commit."""
    from services.ai_import import analyze_image
    user = resolve_actor(db, payload)
    if payload.kind not in ("ticket", "invoice"):
        raise HTTPException(422, "kind = ticket ou invoice.")
    try:
        parsed = analyze_image(payload.content_b64.split(",", 1)[-1], payload.mime_type,
                               payload.kind, db=db, user_id=user.id)
    except AIChatError as e:
        raise HTTPException(422, str(e))
    return {"parsed": parsed, "accounts": _accounts_out(db, user)}


class CommitIn(Who):
    kind: str
    parsed: dict
    edits: Optional[dict] = None
    account_id: Optional[int] = None


@router.post("/documents/commit", dependencies=[Depends(require_agent)])
async def agent_commit_document(payload: CommitIn, db: Session = Depends(get_db)):
    from services.ai_import import commit_import
    user = resolve_actor(db, payload)
    try:
        batch = commit_import(db, user, payload.kind, payload.parsed, payload.edits,
                              default_account_id=payload.account_id)
    except AIChatError as e:
        raise HTTPException(422, str(e))
    return {"batch_id": batch.id, "summary": batch.summary}


# ============================================================
# Résumé (« combien il me reste ce mois ? »)
# ============================================================

class SummaryIn(Who):
    year: Optional[int] = None
    month: Optional[int] = None


@router.post("/summary", dependencies=[Depends(require_agent)])
async def agent_summary(payload: SummaryIn, db: Session = Depends(get_db)):
    from services.budget_calc import compute_monthly_budget
    from services.envelopes import statuses as envelope_statuses
    user = resolve_actor(db, payload)
    today = date.today()
    y, m = payload.year or today.year, payload.month or today.month
    b = compute_monthly_budget(db, user.id, y, m)
    ids = accessible_account_ids(db, user.id)
    to_review = db.query(BankTransaction).filter(
        BankTransaction.account_id.in_(ids), BankTransaction.status == rec.TO_REVIEW,
    ).count()
    return {
        "year": y, "month": m,
        "total_incomes": str(b.total_incomes),
        "total_charges": str(b.total_charges),
        "total_savings": str(b.total_savings),
        "total_purchases": str(b.total_purchases_imputed),
        "available_for_purchases": str(b.available_for_purchases),
        "envelopes": [
            {"label": e["label"], "budget": str(e["monthly_amount"]), "spent": str(e["spent"]),
             "remaining": str(e["remaining"]), "per_day": str(e["per_day"])}
            for e in envelope_statuses(db, user, y, m) if e["configured"]
        ],
        "final_balance": str(b.total_final_balance),
        "to_review": to_review,
    }
