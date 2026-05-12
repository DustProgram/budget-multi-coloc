"""API Simulateur d'achat - délègue à services.budget_calc.simulate_purchase.

Supporte un ou plusieurs comptes : le solde après est calculé sur l'ensemble
des comptes sélectionnés (somme des soldes fin de mois).
"""
from datetime import date
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from models.base import get_db
from models import Settings, User
from services.budget_calc import compute_monthly_budget, simulate_purchase

router = APIRouter()


class SimulationRequest(BaseModel):
    amount: Decimal
    account_id: Optional[int] = None
    account_ids: Optional[list[int]] = None
    year: Optional[int] = None
    month: Optional[int] = None


@router.post("/")
async def post_simulate(
    request: Request,
    payload: SimulationRequest,
    db: Session = Depends(get_db),
):
    """Simule un achat et retourne le verdict + soldes projetés."""
    user: User = request.state.user
    today = date.today()
    y = payload.year if payload.year is not None else today.year
    m = payload.month if payload.month is not None else today.month

    settings = db.query(Settings).first()
    threshold = (
        settings.alert_threshold
        if settings and settings.alert_enabled
        else Decimal(0)
    )

    # Normalisation : payload.account_ids prime, fallback sur le legacy
    # account_id (mono) si fourni seul, sinon vue globale (None)
    selected_ids = payload.account_ids
    if selected_ids is None and payload.account_id is not None:
        selected_ids = [payload.account_id]

    # Cas mono ou aucun : on garde le comportement existant
    if not selected_ids or len(selected_ids) <= 1:
        single = selected_ids[0] if selected_ids else None
        sim = simulate_purchase(
            db, user.id, payload.amount, single, y, m, threshold,
        )
        return {
            "can_afford_global": sim.can_afford_global,
            "can_afford_account": sim.can_afford_account,
            "available_before": sim.available_before,
            "available_after": sim.available_after,
            "account_balance_after": sim.account_balance_after,
            "final_balance_before": sim.final_balance_before,
            "final_balance_after": sim.final_balance_after,
            "verdict_message": sim.verdict_message,
        }

    # Multi-comptes : on calcule le solde fin de mois sur la sélection
    # (la "marge dispo globale" reste celle de l'utilisateur tous comptes)
    budget = compute_monthly_budget(db, user.id, y, m)
    selected_set = set(selected_ids)
    accounts_selected = [a for a in budget.accounts if a.account_id in selected_set]
    selection_final_before = sum(
        (a.final_balance for a in accounts_selected), Decimal(0),
    )
    selection_final_after = selection_final_before - payload.amount
    can_afford_selection = selection_final_after >= 0

    available_before = budget.available_for_purchases - threshold
    available_after = available_before - payload.amount
    can_afford_global = available_after >= 0

    if payload.amount == 0:
        verdict = "⏳ Saisis un montant"
    elif can_afford_global and can_afford_selection:
        verdict = "✅ Achat possible sur la sélection"
    elif can_afford_global and not can_afford_selection:
        verdict = "⚠️ Globalement OK mais la sélection passe en négatif"
    else:
        verdict = "❌ Achat non recommandé"

    return {
        "can_afford_global": can_afford_global,
        "can_afford_account": can_afford_selection,
        "available_before": available_before,
        "available_after": available_after,
        "account_balance_after": selection_final_after,
        "final_balance_before": budget.total_final_balance,
        "final_balance_after": budget.total_final_balance - payload.amount,
        "verdict_message": verdict,
    }
