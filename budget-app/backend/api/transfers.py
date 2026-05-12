"""API Virements interbancaires - récurrents et ponctuels.

Deux ressources distinctes :
  - /recurring  (RecurringTransfer)
  - /onetime    (OneTimeTransfer)
"""
from datetime import date
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from models.base import get_db
from models import RecurringTransfer, OneTimeTransfer, Frequency, User
from services.access import accessible_account_ids, user_can_write_account
from sqlalchemy import or_


def _can_write_transfer(db: Session, user: User, tr) -> bool:
    """Co-titulaire d'un des comptes (source ou dest) du virement, ou créateur."""
    if tr.user_id == user.id:
        return True
    for acc_id in (tr.source_account_id, tr.dest_account_id):
        if acc_id and user_can_write_account(db, user.id, acc_id):
            return True
    return False

router = APIRouter()


# ============================================================
# Récurrents
# ============================================================

class RecurringCreate(BaseModel):
    label: str
    source_account_id: int
    dest_account_id: int
    amount: Decimal
    day_of_month: int
    frequency: Frequency = Frequency.MENSUELLE
    is_active: bool = True
    notes: Optional[str] = None


class RecurringUpdate(BaseModel):
    label: Optional[str] = None
    source_account_id: Optional[int] = None
    dest_account_id: Optional[int] = None
    amount: Optional[Decimal] = None
    day_of_month: Optional[int] = None
    frequency: Optional[Frequency] = None
    is_active: Optional[bool] = None
    notes: Optional[str] = None


class RecurringOut(BaseModel):
    id: int
    label: str
    source_account_id: int
    dest_account_id: int
    amount: Decimal
    day_of_month: int
    frequency: str
    is_active: bool
    notes: Optional[str]
    user_id: int

    class Config:
        from_attributes = True


@router.get("/recurring/", response_model=list[RecurringOut])
async def list_recurring(
    request: Request,
    db: Session = Depends(get_db),
    include_inactive: bool = False,
):
    """Mes virements + virements sur les comptes que je peux voir."""
    user: User = request.state.user
    acc_ids = accessible_account_ids(db, user.id)
    q = db.query(RecurringTransfer).filter(
        or_(
            RecurringTransfer.user_id == user.id,
            RecurringTransfer.source_account_id.in_(acc_ids),
            RecurringTransfer.dest_account_id.in_(acc_ids),
        )
    )
    if not include_inactive:
        q = q.filter(RecurringTransfer.is_active.is_(True))
    return q.order_by(RecurringTransfer.day_of_month).all()


@router.post("/recurring/", response_model=RecurringOut, status_code=201)
async def create_recurring(
    request: Request,
    payload: RecurringCreate,
    db: Session = Depends(get_db),
):
    user: User = request.state.user
    # On peut écrire si on est co-titulaire d'au moins un des comptes
    if not (
        user_can_write_account(db, user.id, payload.source_account_id)
        or user_can_write_account(db, user.id, payload.dest_account_id)
    ):
        raise HTTPException(403, "Pas le droit d'écrire sur ces comptes.")
    tr = RecurringTransfer(**payload.model_dump(), user_id=user.id)
    db.add(tr)
    db.commit()
    db.refresh(tr)
    return tr


@router.patch("/recurring/{transfer_id}", response_model=RecurringOut)
async def update_recurring(
    transfer_id: int,
    request: Request,
    payload: RecurringUpdate,
    db: Session = Depends(get_db),
):
    user: User = request.state.user
    tr = db.query(RecurringTransfer).filter(RecurringTransfer.id == transfer_id).first()
    if not tr:
        raise HTTPException(404, "Virement récurrent introuvable")
    if not _can_write_transfer(db, user, tr):
        raise HTTPException(403, "Pas le droit de modifier ce virement.")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(tr, k, v)
    db.commit()
    db.refresh(tr)
    return tr


@router.delete("/recurring/{transfer_id}", status_code=204)
async def delete_recurring(
    transfer_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    user: User = request.state.user
    tr = db.query(RecurringTransfer).filter(RecurringTransfer.id == transfer_id).first()
    if not tr:
        raise HTTPException(404, "Virement récurrent introuvable")
    if not _can_write_transfer(db, user, tr):
        raise HTTPException(403, "Pas le droit de supprimer ce virement.")
    db.delete(tr)
    db.commit()


# ============================================================
# Ponctuels
# ============================================================

class OneTimeCreate(BaseModel):
    date: date
    label: str
    source_account_id: int
    dest_account_id: int
    amount: Decimal
    notes: Optional[str] = None


class OneTimeUpdate(BaseModel):
    date: Optional[date] = None
    label: Optional[str] = None
    source_account_id: Optional[int] = None
    dest_account_id: Optional[int] = None
    amount: Optional[Decimal] = None
    notes: Optional[str] = None


class OneTimeOut(BaseModel):
    id: int
    date: date
    label: str
    source_account_id: int
    dest_account_id: int
    amount: Decimal
    notes: Optional[str]
    user_id: int

    class Config:
        from_attributes = True


@router.get("/onetime/", response_model=list[OneTimeOut])
async def list_onetime(
    request: Request,
    db: Session = Depends(get_db),
    year: Optional[int] = None,
    month: Optional[int] = None,
):
    user: User = request.state.user
    acc_ids = accessible_account_ids(db, user.id)
    q = db.query(OneTimeTransfer).filter(
        or_(
            OneTimeTransfer.user_id == user.id,
            OneTimeTransfer.source_account_id.in_(acc_ids),
            OneTimeTransfer.dest_account_id.in_(acc_ids),
        )
    )
    if year is not None:
        from sqlalchemy import extract
        q = q.filter(extract("year", OneTimeTransfer.date) == year)
    if month is not None:
        from sqlalchemy import extract
        q = q.filter(extract("month", OneTimeTransfer.date) == month)
    return q.order_by(OneTimeTransfer.date.desc()).all()


@router.post("/onetime/", response_model=OneTimeOut, status_code=201)
async def create_onetime(
    request: Request,
    payload: OneTimeCreate,
    db: Session = Depends(get_db),
):
    user: User = request.state.user
    if not (
        user_can_write_account(db, user.id, payload.source_account_id)
        or user_can_write_account(db, user.id, payload.dest_account_id)
    ):
        raise HTTPException(403, "Pas le droit d'écrire sur ces comptes.")
    tr = OneTimeTransfer(**payload.model_dump(), user_id=user.id)
    db.add(tr)
    db.commit()
    db.refresh(tr)
    return tr


@router.patch("/onetime/{transfer_id}", response_model=OneTimeOut)
async def update_onetime(
    transfer_id: int,
    request: Request,
    payload: OneTimeUpdate,
    db: Session = Depends(get_db),
):
    user: User = request.state.user
    tr = db.query(OneTimeTransfer).filter(OneTimeTransfer.id == transfer_id).first()
    if not tr:
        raise HTTPException(404, "Virement ponctuel introuvable")
    if not _can_write_transfer(db, user, tr):
        raise HTTPException(403, "Pas le droit de modifier ce virement.")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(tr, k, v)
    db.commit()
    db.refresh(tr)
    return tr


@router.delete("/onetime/{transfer_id}", status_code=204)
async def delete_onetime(
    transfer_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    user: User = request.state.user
    tr = db.query(OneTimeTransfer).filter(OneTimeTransfer.id == transfer_id).first()
    if not tr:
        raise HTTPException(404, "Virement ponctuel introuvable")
    if not _can_write_transfer(db, user, tr):
        raise HTTPException(403, "Pas le droit de supprimer ce virement.")
    db.delete(tr)
    db.commit()
