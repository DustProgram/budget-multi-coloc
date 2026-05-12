"""API Épargne mensuelle automatique - CRUD complet."""
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from models.base import get_db
from models import AutoSaving, User

router = APIRouter()


class SavingCreate(BaseModel):
    label: str
    amount: Decimal
    source_account_id: int
    dest_account_id: int
    day_of_month: int
    is_active: bool = True
    notes: Optional[str] = None


class SavingUpdate(BaseModel):
    label: Optional[str] = None
    amount: Optional[Decimal] = None
    source_account_id: Optional[int] = None
    dest_account_id: Optional[int] = None
    day_of_month: Optional[int] = None
    is_active: Optional[bool] = None
    notes: Optional[str] = None


class SavingOut(BaseModel):
    id: int
    label: str
    amount: Decimal
    source_account_id: int
    dest_account_id: int
    day_of_month: int
    is_active: bool
    notes: Optional[str]

    class Config:
        from_attributes = True


@router.get("/", response_model=list[SavingOut])
async def list_savings(
    request: Request,
    db: Session = Depends(get_db),
    include_inactive: bool = False,
):
    user: User = request.state.user
    q = db.query(AutoSaving).filter(AutoSaving.user_id == user.id)
    if not include_inactive:
        q = q.filter(AutoSaving.is_active.is_(True))
    return q.order_by(AutoSaving.day_of_month).all()


@router.post("/", response_model=SavingOut, status_code=201)
async def create_saving(
    request: Request,
    payload: SavingCreate,
    db: Session = Depends(get_db),
):
    user: User = request.state.user
    sv = AutoSaving(**payload.model_dump(), user_id=user.id)
    db.add(sv)
    db.commit()
    db.refresh(sv)
    return sv


@router.patch("/{saving_id}", response_model=SavingOut)
async def update_saving(
    saving_id: int,
    request: Request,
    payload: SavingUpdate,
    db: Session = Depends(get_db),
):
    user: User = request.state.user
    sv = db.query(AutoSaving).filter(
        AutoSaving.id == saving_id, AutoSaving.user_id == user.id,
    ).first()
    if not sv:
        raise HTTPException(404, "Épargne introuvable")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(sv, k, v)
    db.commit()
    db.refresh(sv)
    return sv


@router.delete("/{saving_id}", status_code=204)
async def delete_saving(
    saving_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    user: User = request.state.user
    sv = db.query(AutoSaving).filter(
        AutoSaving.id == saving_id, AutoSaving.user_id == user.id,
    ).first()
    if not sv:
        raise HTTPException(404, "Épargne introuvable")
    db.delete(sv)
    db.commit()
