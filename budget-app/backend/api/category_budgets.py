"""API CategoryBudget — plafonds mensuels par catégorie d'achat."""
from datetime import date as DateType
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from models import CategoryBudget, Purchase, User
from models.base import get_db

router = APIRouter()


class BudgetCreate(BaseModel):
    category: str
    monthly_limit: Decimal
    notes: Optional[str] = None


class BudgetUpdate(BaseModel):
    monthly_limit: Optional[Decimal] = None
    notes: Optional[str] = None


class BudgetUsage(BaseModel):
    id: int
    category: str
    monthly_limit: Decimal
    used: Decimal
    remaining: Decimal
    percent: float
    notes: Optional[str] = None


def _used_for_category(db, user_id: int, category: str, year: int, month: int) -> Decimal:
    """Somme des Purchase imputés ce mois sur cette catégorie."""
    from services.budget_calc import purchase_impute_amount
    purchases = (
        db.query(Purchase)
        .filter(Purchase.user_id == user_id, Purchase.category == category)
        .all()
    )
    return sum(
        (purchase_impute_amount(p, year, month) for p in purchases),
        Decimal(0),
    )


def _to_usage(db: Session, b: CategoryBudget, year: int, month: int) -> BudgetUsage:
    used = _used_for_category(db, b.user_id, b.category, year, month)
    limit = Decimal(b.monthly_limit or 0)
    return BudgetUsage(
        id=b.id, category=b.category, monthly_limit=limit,
        used=used, remaining=limit - used,
        percent=float(used / limit * 100) if limit > 0 else 0.0,
        notes=b.notes,
    )


@router.get("/", response_model=list[BudgetUsage])
async def list_budgets(
    request: Request,
    db: Session = Depends(get_db),
    year: Optional[int] = None,
    month: Optional[int] = None,
):
    user: User = request.state.user
    today = DateType.today()
    y = year or today.year
    m = month or today.month
    budgets = (
        db.query(CategoryBudget)
        .filter(CategoryBudget.user_id == user.id)
        .order_by(CategoryBudget.category)
        .all()
    )
    return [_to_usage(db, b, y, m) for b in budgets]


@router.post("/", response_model=BudgetUsage, status_code=201)
async def create_budget(
    payload: BudgetCreate,
    request: Request,
    db: Session = Depends(get_db),
):
    user: User = request.state.user
    if not payload.category.strip():
        raise HTTPException(400, "Catégorie vide")
    if payload.monthly_limit <= 0:
        raise HTTPException(400, "Le plafond doit être > 0")
    existing = db.query(CategoryBudget).filter(
        CategoryBudget.user_id == user.id,
        CategoryBudget.category == payload.category.strip(),
    ).first()
    if existing:
        raise HTTPException(409, f"Un budget pour '{payload.category}' existe déjà")
    b = CategoryBudget(
        user_id=user.id,
        category=payload.category.strip(),
        monthly_limit=payload.monthly_limit,
        notes=payload.notes,
    )
    db.add(b)
    db.commit()
    db.refresh(b)
    today = DateType.today()
    return _to_usage(db, b, today.year, today.month)


@router.patch("/{budget_id}", response_model=BudgetUsage)
async def update_budget(
    budget_id: int,
    payload: BudgetUpdate,
    request: Request,
    db: Session = Depends(get_db),
):
    user: User = request.state.user
    b = db.query(CategoryBudget).filter(
        CategoryBudget.id == budget_id, CategoryBudget.user_id == user.id,
    ).first()
    if not b:
        raise HTTPException(404, "Budget introuvable")
    if payload.monthly_limit is not None:
        if payload.monthly_limit <= 0:
            raise HTTPException(400, "Le plafond doit être > 0")
        b.monthly_limit = payload.monthly_limit
    if payload.notes is not None:
        b.notes = payload.notes
    db.commit()
    db.refresh(b)
    today = DateType.today()
    return _to_usage(db, b, today.year, today.month)


@router.delete("/{budget_id}", status_code=204)
async def delete_budget(
    budget_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    user: User = request.state.user
    b = db.query(CategoryBudget).filter(
        CategoryBudget.id == budget_id, CategoryBudget.user_id == user.id,
    ).first()
    if not b:
        raise HTTPException(404, "Budget introuvable")
    db.delete(b)
    db.commit()
