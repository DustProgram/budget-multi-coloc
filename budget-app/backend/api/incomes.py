"""API Revenus - CRUD complet (filtré par user_id)."""
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from models.base import get_db
from models import Income, IncomeType, User

router = APIRouter()


class IncomeCreate(BaseModel):
    source: str
    amount: Decimal
    day_of_month: int
    type: IncomeType = IncomeType.REGULIER
    account_id: Optional[int] = None
    notes: Optional[str] = None
    is_active: bool = True


class IncomeUpdate(BaseModel):
    source: Optional[str] = None
    amount: Optional[Decimal] = None
    day_of_month: Optional[int] = None
    type: Optional[IncomeType] = None
    account_id: Optional[int] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None


class IncomeOut(BaseModel):
    id: int
    source: str
    amount: Decimal
    day_of_month: int
    type: str
    account_id: Optional[int]
    notes: Optional[str]
    is_active: bool

    class Config:
        from_attributes = True


@router.get("/", response_model=list[IncomeOut])
async def list_incomes(
    request: Request,
    db: Session = Depends(get_db),
    include_inactive: bool = False,
):
    user: User = request.state.user
    q = db.query(Income).filter(Income.user_id == user.id)
    if not include_inactive:
        q = q.filter(Income.is_active.is_(True))
    return q.order_by(Income.day_of_month).all()


@router.post("/", response_model=IncomeOut, status_code=201)
async def create_income(
    request: Request,
    payload: IncomeCreate,
    db: Session = Depends(get_db),
):
    user: User = request.state.user
    inc = Income(**payload.model_dump(), user_id=user.id)
    db.add(inc)
    db.commit()
    db.refresh(inc)
    return inc


@router.patch("/{income_id}", response_model=IncomeOut)
async def update_income(
    income_id: int,
    request: Request,
    payload: IncomeUpdate,
    db: Session = Depends(get_db),
):
    user: User = request.state.user
    inc = db.query(Income).filter(
        Income.id == income_id, Income.user_id == user.id,
    ).first()
    if not inc:
        raise HTTPException(404, "Revenu introuvable")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(inc, k, v)
    db.commit()
    db.refresh(inc)
    return inc


@router.delete("/{income_id}", status_code=204)
async def delete_income(
    income_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    user: User = request.state.user
    inc = db.query(Income).filter(
        Income.id == income_id, Income.user_id == user.id,
    ).first()
    if not inc:
        raise HTTPException(404, "Revenu introuvable")
    db.delete(inc)
    db.commit()
