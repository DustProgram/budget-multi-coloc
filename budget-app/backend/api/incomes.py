"""API Revenus — CRUD complet.

Filtrage : un user voit ses propres revenus + ceux liés à un compte joint
dont il est co-titulaire. Co-titulaires peuvent modifier/supprimer toute
ligne du compte (pas seulement leurs propres saisies).
"""
from datetime import date as DateType
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import or_
from sqlalchemy.orm import Session

from models.base import get_db
from models import Income, IncomeType, User
from services.access import accessible_account_ids, user_can_write_account

router = APIRouter()


class IncomeCreate(BaseModel):
    source: str
    amount: Decimal
    day_of_month: int
    type: IncomeType = IncomeType.REGULIER
    account_id: Optional[int] = None
    notes: Optional[str] = None
    is_active: bool = True
    valid_from: Optional[DateType] = None
    valid_to: Optional[DateType] = None


class IncomeUpdate(BaseModel):
    source: Optional[str] = None
    amount: Optional[Decimal] = None
    day_of_month: Optional[int] = None
    type: Optional[IncomeType] = None
    account_id: Optional[int] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None
    valid_from: Optional[DateType] = None
    valid_to: Optional[DateType] = None


class IncomeOut(BaseModel):
    id: int
    source: str
    amount: Decimal
    day_of_month: int
    type: str
    account_id: Optional[int]
    notes: Optional[str]
    is_active: bool
    user_id: int
    valid_from: Optional[DateType] = None
    valid_to: Optional[DateType] = None

    class Config:
        from_attributes = True


def _can_write(db: Session, user: User, inc: Income) -> bool:
    """Le user peut écrire/supprimer si c'est sa propre ligne OU si la ligne
    est sur un compte joint dont il est co-titulaire."""
    if inc.user_id == user.id:
        return True
    if inc.account_id and user_can_write_account(db, user.id, inc.account_id):
        return True
    return False


@router.get("/", response_model=list[IncomeOut])
async def list_incomes(
    request: Request,
    db: Session = Depends(get_db),
    include_inactive: bool = False,
):
    user: User = request.state.user
    acc_ids = accessible_account_ids(db, user.id)
    q = db.query(Income).filter(
        or_(Income.user_id == user.id, Income.account_id.in_(acc_ids))
    )
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
    if payload.account_id and not user_can_write_account(db, user.id, payload.account_id):
        raise HTTPException(403, "Pas le droit d'écrire sur ce compte.")
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
    inc = db.query(Income).filter(Income.id == income_id).first()
    if not inc:
        raise HTTPException(404, "Revenu introuvable")
    if not _can_write(db, user, inc):
        raise HTTPException(403, "Pas le droit de modifier ce revenu.")
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
    inc = db.query(Income).filter(Income.id == income_id).first()
    if not inc:
        raise HTTPException(404, "Revenu introuvable")
    if not _can_write(db, user, inc):
        raise HTTPException(403, "Pas le droit de supprimer ce revenu.")
    db.delete(inc)
    db.commit()


class TransitionIn(BaseModel):
    """Transition à un mois donné :
    - mode='terminate' : pose valid_to et arrête le revenu
    - mode='replace'   : pose valid_to ET crée un successeur avec nouveau montant
    """
    transition_date: DateType  # 1er du mois où le changement prend effet
    mode: str  # 'terminate' | 'replace'
    new_amount: Optional[Decimal] = None
    new_account_id: Optional[int] = None
    new_day_of_month: Optional[int] = None


@router.post("/{income_id}/transition", response_model=IncomeOut)
async def transition_income(
    income_id: int,
    payload: TransitionIn,
    request: Request,
    db: Session = Depends(get_db),
):
    """Évolution : arrêter ou remplacer un revenu à partir d'un mois donné.

    Pose `valid_to` sur l'ancien (= dernier jour du mois précédent la
    transition). Si mode='replace', crée un nouveau revenu avec
    `valid_from = transition_date` et les nouveaux paramètres.
    """
    user: User = request.state.user
    inc = db.query(Income).filter(Income.id == income_id).first()
    if not inc:
        raise HTTPException(404, "Revenu introuvable")
    if not _can_write(db, user, inc):
        raise HTTPException(403, "Pas le droit de modifier ce revenu.")
    if payload.mode not in ("terminate", "replace"):
        raise HTTPException(400, "mode doit être 'terminate' ou 'replace'")

    # Dernier jour du mois précédent
    from calendar import monthrange
    td = payload.transition_date
    if td.month == 1:
        prev_y, prev_m = td.year - 1, 12
    else:
        prev_y, prev_m = td.year, td.month - 1
    prev_last_day = monthrange(prev_y, prev_m)[1]
    inc.valid_to = DateType(prev_y, prev_m, prev_last_day)
    db.flush()

    if payload.mode == "replace":
        if payload.new_amount is None:
            raise HTTPException(400, "new_amount requis pour mode=replace")
        target_acc = payload.new_account_id or inc.account_id
        if target_acc and not user_can_write_account(db, user.id, target_acc):
            raise HTTPException(403, "Pas le droit d'écrire sur le compte cible")
        new_inc = Income(
            source=inc.source,
            amount=payload.new_amount,
            day_of_month=payload.new_day_of_month or inc.day_of_month,
            type=inc.type,
            account_id=target_acc,
            notes=inc.notes,
            is_active=True,
            user_id=user.id,
            valid_from=td,
            valid_to=None,
        )
        db.add(new_inc)
        db.commit()
        db.refresh(new_inc)
        return new_inc

    db.commit()
    db.refresh(inc)
    return inc
