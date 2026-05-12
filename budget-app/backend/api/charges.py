"""API Charges fixes - CRUD complet (filtré par user_id).

Le calcul de la part personnelle est délégué à services.budget_calc.compute_my_share.
Cet endpoint l'expose aussi via le champ `my_share` dans la sortie.
"""
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from models.base import get_db
from models import Charge, Frequency, SplitMode, User
from services.budget_calc import compute_my_share

router = APIRouter()


class ChargeCreate(BaseModel):
    label: str
    total_amount: Decimal
    frequency: Frequency = Frequency.MENSUELLE
    day_of_month: int
    month: Optional[int] = None
    split_mode: SplitMode = SplitMode.PERSO
    num_colocs: int = 1
    split_value: Optional[Decimal] = None
    account_id: Optional[int] = None
    is_shared: bool = False
    notes: Optional[str] = None
    is_active: bool = True


class ChargeUpdate(BaseModel):
    label: Optional[str] = None
    total_amount: Optional[Decimal] = None
    frequency: Optional[Frequency] = None
    day_of_month: Optional[int] = None
    month: Optional[int] = None
    split_mode: Optional[SplitMode] = None
    num_colocs: Optional[int] = None
    split_value: Optional[Decimal] = None
    account_id: Optional[int] = None
    is_shared: Optional[bool] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None


class ChargeOut(BaseModel):
    id: int
    label: str
    total_amount: Decimal
    frequency: str
    day_of_month: int
    month: Optional[int]
    split_mode: str
    num_colocs: int
    split_value: Optional[Decimal]
    account_id: Optional[int]
    is_shared: bool
    notes: Optional[str]
    is_active: bool
    my_share: Decimal

    class Config:
        from_attributes = True


def _to_out(charge: Charge) -> ChargeOut:
    return ChargeOut(
        id=charge.id,
        label=charge.label,
        total_amount=charge.total_amount,
        frequency=charge.frequency.value if hasattr(charge.frequency, "value") else charge.frequency,
        day_of_month=charge.day_of_month,
        month=charge.month,
        split_mode=charge.split_mode.value if hasattr(charge.split_mode, "value") else charge.split_mode,
        num_colocs=charge.num_colocs,
        split_value=charge.split_value,
        account_id=charge.account_id,
        is_shared=charge.is_shared,
        notes=charge.notes,
        is_active=charge.is_active,
        my_share=compute_my_share(charge),
    )


@router.get("/", response_model=list[ChargeOut])
async def list_charges(
    request: Request,
    db: Session = Depends(get_db),
    include_inactive: bool = False,
):
    user: User = request.state.user
    q = db.query(Charge).filter(Charge.user_id == user.id)
    if not include_inactive:
        q = q.filter(Charge.is_active.is_(True))
    return [_to_out(c) for c in q.order_by(Charge.day_of_month).all()]


@router.post("/", response_model=ChargeOut, status_code=201)
async def create_charge(
    request: Request,
    payload: ChargeCreate,
    db: Session = Depends(get_db),
):
    user: User = request.state.user
    ch = Charge(**payload.model_dump(), user_id=user.id)
    db.add(ch)
    db.commit()
    db.refresh(ch)
    return _to_out(ch)


@router.patch("/{charge_id}", response_model=ChargeOut)
async def update_charge(
    charge_id: int,
    request: Request,
    payload: ChargeUpdate,
    db: Session = Depends(get_db),
):
    user: User = request.state.user
    ch = db.query(Charge).filter(
        Charge.id == charge_id, Charge.user_id == user.id,
    ).first()
    if not ch:
        raise HTTPException(404, "Charge introuvable")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(ch, k, v)
    db.commit()
    db.refresh(ch)
    return _to_out(ch)


@router.delete("/{charge_id}", status_code=204)
async def delete_charge(
    charge_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    user: User = request.state.user
    ch = db.query(Charge).filter(
        Charge.id == charge_id, Charge.user_id == user.id,
    ).first()
    if not ch:
        raise HTTPException(404, "Charge introuvable")
    db.delete(ch)
    db.commit()
