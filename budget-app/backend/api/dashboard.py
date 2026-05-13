"""API Dashboard - synthèse budgétaire mensuelle et annuelle.

Délègue tout le calcul à services.budget_calc.compute_monthly_budget /
compute_yearly_overview, et expose le résultat en JSON.
"""
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from models.base import get_db
from models import User
from services.budget_calc import (
    compute_monthly_budget, compute_yearly_overview, MonthlyBudget,
)

router = APIRouter()


def _serialize(b: MonthlyBudget) -> dict:
    return {
        "user_id": b.user_id,
        "year": b.year,
        "month": b.month,
        "total_incomes": b.total_incomes,
        "total_charges": b.total_charges,
        "total_savings": b.total_savings,
        "total_purchases_imputed": b.total_purchases_imputed,
        "total_initial_balance": b.total_initial_balance,
        "total_final_balance": b.total_final_balance,
        "available_for_purchases": b.available_for_purchases,
        "accounts": [
            {
                "account_id": a.account_id,
                "account_name": a.account_name,
                "bank": a.bank,
                "initial_balance": a.initial_balance,
                "incomes": a.incomes,
                "transfers_net": a.transfers_net,
                "charges": a.charges,
                "savings": a.savings,
                "purchases": a.purchases,
                "final_balance": a.final_balance,
            }
            for a in b.accounts
        ],
    }


@router.get("/")
async def get_dashboard(
    request: Request,
    db: Session = Depends(get_db),
    year: Optional[int] = None,
    month: Optional[int] = None,
):
    """Synthèse pour un mois donné (défaut : mois courant)."""
    user: User = request.state.user
    today = date.today()
    y = year if year is not None else today.year
    m = month if month is not None else today.month
    return _serialize(compute_monthly_budget(db, user.id, y, m))


@router.get("/yearly")
async def get_yearly(
    request: Request,
    db: Session = Depends(get_db),
    year: Optional[int] = None,
):
    """12 résumés mensuels (jan-déc) pour l'année (défaut : année courante)."""
    user: User = request.state.user
    y = year if year is not None else date.today().year
    return [_serialize(b) for b in compute_yearly_overview(db, user.id, y)]


@router.get("/balance_at")
async def get_balance_at(
    request: Request,
    db: Session = Depends(get_db),
    year: Optional[int] = None,
    month: Optional[int] = None,
    history_years: int = 3,
):
    """Solde cumulé au DÉBUT du mois donné.

    = solde_initial(comptes_accessibles) + Σ deltas(mois précédents)
    sur 'history_years' années passées.

    Permet à MonthlyView (mode 'compte') de ne faire qu'UN seul fetch
    au lieu de 4× /dashboard/yearly. Côté backend, profite du cache 30s
    sur compute_monthly_budget.
    """
    user: User = request.state.user
    today = date.today()
    y = year if year is not None else today.year
    m = month if month is not None else today.month

    from models import Account
    accounts = db.query(Account).filter(
        Account.user_id == user.id, Account.is_active.is_(True),
    ).all()
    base = sum((a.initial_balance or 0 for a in accounts), 0)

    cumul_delta = 0
    for yy in range(y - history_years, y + 1):
        for mm in range(1, 13):
            if yy > y or (yy == y and mm >= m):
                continue
            budget = compute_monthly_budget(db, user.id, yy, mm)
            for acc in budget.accounts:
                cumul_delta += float(acc.final_balance - acc.initial_balance)

    return {
        "year": y,
        "month": m,
        "base_balance": float(base),
        "cumul_delta": cumul_delta,
        "balance_at_start": float(base) + cumul_delta,
    }
