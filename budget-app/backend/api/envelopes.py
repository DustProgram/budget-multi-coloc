"""Enveloppes vie quotidienne : perso et commune (compte joint)."""
from datetime import date
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from models import Account, Envelope
from models.base import get_db
from services import envelopes
from services.access import is_joint_account, user_can_write_account

router = APIRouter()


class EnvelopeOut(BaseModel):
    id: Optional[int]
    scope: str
    account_id: Optional[int]
    label: str
    configured: bool
    monthly_amount: Decimal
    threshold: Decimal
    spent: Decimal
    remaining: Decimal
    count: int
    last_operation: Optional[date]
    days_left: int
    per_day: Decimal
    suggestion: Optional[Decimal]


class EnvelopeIn(BaseModel):
    monthly_amount: Decimal = Field(ge=0, le=100000)
    threshold: Decimal = Field(gt=0, le=100000)
    label: Optional[str] = None


@router.get("/", response_model=list[EnvelopeOut])
async def list_envelopes(
    request: Request, db: Session = Depends(get_db),
    year: Optional[int] = None, month: Optional[int] = None,
):
    today = date.today()
    return envelopes.statuses(db, request.state.user, year or today.year, month or today.month)


def _save(env: Envelope, payload: EnvelopeIn) -> None:
    env.monthly_amount = payload.monthly_amount
    env.big_purchase_threshold = payload.threshold
    if payload.label and payload.label.strip():
        env.label = payload.label.strip()[:64]


@router.put("/perso", status_code=204)
async def set_perso(payload: EnvelopeIn, request: Request, db: Session = Depends(get_db)):
    user_id = request.state.user.id
    env = envelopes.perso_envelope(db, user_id)
    if env is None:
        env = Envelope(user_id=user_id, label="Mon quotidien")
        db.add(env)
    _save(env, payload)
    db.commit()


@router.put("/account/{account_id}", status_code=204)
async def set_common(account_id: int, payload: EnvelopeIn, request: Request, db: Session = Depends(get_db)):
    if not user_can_write_account(db, request.state.user.id, account_id):
        raise HTTPException(403, "Pas le droit d'écrire sur ce compte.")
    if not is_joint_account(db, account_id):
        raise HTTPException(422, "Une enveloppe commune se règle sur un compte joint.")
    env = db.query(Envelope).filter(Envelope.account_id == account_id).first()
    if env is None:
        acc = db.get(Account, account_id)
        env = Envelope(account_id=account_id, label=f"Commun — {acc.name}")
        db.add(env)
    _save(env, payload)
    db.commit()
