"""API Achats (avec gestion des mensualités) - CRUD complet."""
from datetime import date
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import extract
from sqlalchemy.orm import Session

from models.base import get_db
from models import Purchase, PaymentMethod, Settings, User
from services.budget_calc import compute_monthly_budget
from services import notifier

router = APIRouter()


class PurchaseCreate(BaseModel):
    date: date
    description: str
    total_amount: Decimal
    nb_installments: int = 1
    category: Optional[str] = None
    payment_method: PaymentMethod = PaymentMethod.CB
    account_id: Optional[int] = None
    notes: Optional[str] = None


class PurchaseUpdate(BaseModel):
    date: Optional[date] = None
    description: Optional[str] = None
    total_amount: Optional[Decimal] = None
    nb_installments: Optional[int] = None
    category: Optional[str] = None
    payment_method: Optional[PaymentMethod] = None
    account_id: Optional[int] = None
    notes: Optional[str] = None


class PurchaseOut(BaseModel):
    id: int
    date: date
    description: str
    total_amount: Decimal
    nb_installments: int
    monthly_amount: Decimal
    category: Optional[str]
    payment_method: str
    account_id: Optional[int]
    notes: Optional[str]

    class Config:
        from_attributes = True


def _to_out(p: Purchase) -> PurchaseOut:
    return PurchaseOut(
        id=p.id,
        date=p.date,
        description=p.description,
        total_amount=p.total_amount,
        nb_installments=p.nb_installments,
        monthly_amount=p.monthly_amount,
        category=p.category,
        payment_method=p.payment_method.value if hasattr(p.payment_method, "value") else p.payment_method,
        account_id=p.account_id,
        notes=p.notes,
    )


@router.get("/", response_model=list[PurchaseOut])
async def list_purchases(
    request: Request,
    db: Session = Depends(get_db),
    year: Optional[int] = None,
    month: Optional[int] = None,
    category: Optional[str] = None,
):
    user: User = request.state.user
    q = db.query(Purchase).filter(Purchase.user_id == user.id)
    if year is not None:
        q = q.filter(extract("year", Purchase.date) == year)
    if month is not None:
        q = q.filter(extract("month", Purchase.date) == month)
    if category:
        q = q.filter(Purchase.category == category)
    return [_to_out(p) for p in q.order_by(Purchase.date.desc()).all()]


@router.post("/", response_model=PurchaseOut, status_code=201)
async def create_purchase(
    request: Request,
    payload: PurchaseCreate,
    db: Session = Depends(get_db),
):
    user: User = request.state.user
    p = Purchase(**payload.model_dump(), user_id=user.id)
    db.add(p)
    db.commit()
    db.refresh(p)
    _maybe_warn_threshold(db, user)
    return _to_out(p)


def _maybe_warn_threshold(db: Session, user: User) -> None:
    """Si l'achat fait passer la marge sous le seuil → notif HA persistent."""
    if not notifier.is_ha_available():
        return
    settings = db.query(Settings).first()
    if not settings or not settings.alert_enabled:
        return
    today = date.today()
    budget = compute_monthly_budget(db, user.id, today.year, today.month)
    threshold = settings.alert_threshold or 0
    if budget.available_for_purchases < threshold:
        notifier.low_budget_warning(
            user.display_name or user.ha_username,
            budget.available_for_purchases,
            threshold,
        )


@router.patch("/{purchase_id}", response_model=PurchaseOut)
async def update_purchase(
    purchase_id: int,
    request: Request,
    payload: PurchaseUpdate,
    db: Session = Depends(get_db),
):
    user: User = request.state.user
    p = db.query(Purchase).filter(
        Purchase.id == purchase_id, Purchase.user_id == user.id,
    ).first()
    if not p:
        raise HTTPException(404, "Achat introuvable")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(p, k, v)
    db.commit()
    db.refresh(p)
    return _to_out(p)


@router.delete("/{purchase_id}", status_code=204)
async def delete_purchase(
    purchase_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    user: User = request.state.user
    p = db.query(Purchase).filter(
        Purchase.id == purchase_id, Purchase.user_id == user.id,
    ).first()
    if not p:
        raise HTTPException(404, "Achat introuvable")
    db.delete(p)
    db.commit()
