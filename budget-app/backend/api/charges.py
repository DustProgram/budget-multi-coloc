"""API Charges fixes - CRUD complet.

Filtrage : un user voit les charges qu'il a saisies + les charges portées
par les comptes joints où il est member.
Calcul de la part personnelle : déléguée à services.charge_splits.my_share_for_user
(splits persistés sur comptes joints, fallback compute_my_share sinon).
"""
from datetime import date as DateType
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from models.base import get_db
from models import Charge, ChargeSplit, Frequency, Settings, SplitMode, User
from services.access import accessible_account_ids, user_can_write_account
from services.budget_calc import compute_monthly_budget
from services.charge_splits import my_share_for_user, regenerate_splits
from services import notifier

router = APIRouter()


class SplitOut(BaseModel):
    id: int
    user_id: int
    amount: Decimal
    settled_at: Optional[str] = None


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
    valid_from: Optional[DateType] = None
    valid_to: Optional[DateType] = None


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
    valid_from: Optional[DateType] = None
    valid_to: Optional[DateType] = None


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
    payer_user_id: int
    splits: list[SplitOut] = []
    valid_from: Optional[DateType] = None
    valid_to: Optional[DateType] = None

    class Config:
        from_attributes = True


def _to_out(db: Session, charge: Charge, user_id: int) -> ChargeOut:
    splits = db.query(ChargeSplit).filter(ChargeSplit.charge_id == charge.id).all()
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
        my_share=my_share_for_user(db, charge, user_id),
        payer_user_id=charge.user_id,
        valid_from=charge.valid_from,
        valid_to=charge.valid_to,
        splits=[
            SplitOut(
                id=s.id, user_id=s.user_id,
                amount=Decimal(s.amount or 0),
                settled_at=s.settled_at.isoformat() if s.settled_at else None,
            )
            for s in splits
        ],
    )


@router.get("/", response_model=list[ChargeOut])
async def list_charges(
    request: Request,
    db: Session = Depends(get_db),
    include_inactive: bool = False,
):
    """Charges saisies par l'user OU sur un compte qu'il peut voir."""
    user: User = request.state.user
    acc_ids = accessible_account_ids(db, user.id)
    q = db.query(Charge).filter(
        (Charge.user_id == user.id) | (Charge.account_id.in_(acc_ids))
    )
    if not include_inactive:
        q = q.filter(Charge.is_active.is_(True))
    return [_to_out(db, c, user.id) for c in q.order_by(Charge.day_of_month).all()]


@router.post("/", response_model=ChargeOut, status_code=201)
async def create_charge(
    request: Request,
    payload: ChargeCreate,
    db: Session = Depends(get_db),
):
    """Crée une charge et génère automatiquement les ChargeSplit si le compte
    porteur est un compte joint et le mode est partagé."""
    user: User = request.state.user
    if payload.account_id and not user_can_write_account(db, user.id, payload.account_id):
        raise HTTPException(403, "Pas le droit d'écrire sur ce compte")

    ch = Charge(**payload.model_dump(), user_id=user.id)
    db.add(ch)
    db.flush()
    regenerate_splits(db, ch)
    db.commit()
    db.refresh(ch)
    _maybe_warn_threshold(db, user)
    return _to_out(db, ch, user.id)


@router.patch("/{charge_id}", response_model=ChargeOut)
async def update_charge(
    charge_id: int,
    request: Request,
    payload: ChargeUpdate,
    db: Session = Depends(get_db),
):
    """Tout co-titulaire (role owner ou cotitulaire) du compte porteur de
    la charge peut la modifier. Pour les charges sur compte solo, seul le
    propriétaire (créateur) peut éditer."""
    user: User = request.state.user
    ch = db.query(Charge).filter(Charge.id == charge_id).first()
    if not ch:
        raise HTTPException(404, "Charge introuvable")
    if not ch.account_id or not user_can_write_account(db, user.id, ch.account_id):
        if ch.user_id != user.id:
            raise HTTPException(403, "Modification réservée aux co-titulaires du compte.")

    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(ch, k, v)
    db.flush()
    regenerate_splits(db, ch)
    db.commit()
    db.refresh(ch)
    return _to_out(db, ch, user.id)


@router.delete("/{charge_id}", status_code=204)
async def delete_charge(
    charge_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    """Idem PATCH : tout co-titulaire du compte joint peut supprimer."""
    user: User = request.state.user
    ch = db.query(Charge).filter(Charge.id == charge_id).first()
    if not ch:
        raise HTTPException(404, "Charge introuvable")
    if not ch.account_id or not user_can_write_account(db, user.id, ch.account_id):
        if ch.user_id != user.id:
            raise HTTPException(403, "Suppression réservée aux co-titulaires du compte.")
    db.delete(ch)
    db.commit()


def _maybe_warn_threshold(db: Session, user: User) -> None:
    """Si la marge dispo passe sous le seuil alerte → notif HA persistent.

    No-op silencieuse quand HA n'est pas joignable (mode dev ou SUPERVISOR_TOKEN
    absent) ou que l'alerte est désactivée dans Settings.
    """
    if not notifier.is_ha_available():
        return
    settings = db.query(Settings).first()
    if not settings or not settings.alert_enabled:
        return
    from datetime import date
    today = date.today()
    budget = compute_monthly_budget(db, user.id, today.year, today.month)
    threshold = settings.alert_threshold or 0
    if budget.available_for_purchases < threshold:
        notifier.low_budget_warning(
            user.display_name or user.ha_username,
            budget.available_for_purchases,
            threshold,
        )
