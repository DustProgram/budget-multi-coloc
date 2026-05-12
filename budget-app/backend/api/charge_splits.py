"""API ChargeSplits — settle/unsettle d'une part de charge partagée."""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from models import Charge, ChargeSplit, User
from models.base import get_db
from services.access import account_member_user_ids

router = APIRouter()


class SplitOut(BaseModel):
    id: int
    charge_id: int
    user_id: int
    amount: float
    settled_at: datetime | None


@router.get("/{charge_id}", response_model=list[SplitOut])
async def list_splits(
    charge_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    """Liste les splits d'une charge. Visible aux membres du compte."""
    user: User = request.state.user
    charge = db.query(Charge).filter(Charge.id == charge_id).first()
    if not charge:
        raise HTTPException(404, "Charge introuvable")
    if charge.account_id and user.id not in account_member_user_ids(db, charge.account_id):
        raise HTTPException(403, "Pas membre du compte porteur de cette charge")

    splits = db.query(ChargeSplit).filter(ChargeSplit.charge_id == charge_id).all()
    return [
        SplitOut(
            id=s.id, charge_id=s.charge_id, user_id=s.user_id,
            amount=float(s.amount or 0), settled_at=s.settled_at,
        )
        for s in splits
    ]


@router.post("/{split_id}/settle", response_model=SplitOut)
async def settle(
    split_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    """Marque une part comme remboursée. Seul le payeur de la charge ou
    le débiteur lui-même peuvent settle."""
    user: User = request.state.user
    split = db.query(ChargeSplit).filter(ChargeSplit.id == split_id).first()
    if not split:
        raise HTTPException(404, "Split introuvable")

    charge = db.query(Charge).filter(Charge.id == split.charge_id).first()
    if not charge or (user.id != charge.user_id and user.id != split.user_id):
        raise HTTPException(403, "Settle réservé au payeur ou au débiteur")

    split.settled_at = datetime.utcnow()
    db.commit()
    db.refresh(split)
    return SplitOut(
        id=split.id, charge_id=split.charge_id, user_id=split.user_id,
        amount=float(split.amount or 0), settled_at=split.settled_at,
    )


@router.post("/{split_id}/unsettle", response_model=SplitOut)
async def unsettle(
    split_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    """Annule le settlement (en cas d'erreur)."""
    user: User = request.state.user
    split = db.query(ChargeSplit).filter(ChargeSplit.id == split_id).first()
    if not split:
        raise HTTPException(404, "Split introuvable")
    charge = db.query(Charge).filter(Charge.id == split.charge_id).first()
    if not charge or (user.id != charge.user_id and user.id != split.user_id):
        raise HTTPException(403, "Unsettle réservé au payeur ou au débiteur")

    split.settled_at = None
    db.commit()
    db.refresh(split)
    return SplitOut(
        id=split.id, charge_id=split.charge_id, user_id=split.user_id,
        amount=float(split.amount or 0), settled_at=split.settled_at,
    )
