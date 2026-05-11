"""API Simulateur d'achat - délègue à services.budget_calc.simulate_purchase."""
from datetime import date
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from models.base import get_db
from models import Settings, User
from services.budget_calc import simulate_purchase

router = APIRouter()


class SimulationRequest(BaseModel):
    amount: Decimal
    account_id: Optional[int] = None
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

    sim = simulate_purchase(
        db, user.id, payload.amount, payload.account_id, y, m, threshold,
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
