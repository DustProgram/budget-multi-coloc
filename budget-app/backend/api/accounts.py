"""API Comptes bancaires - CRUD complet (filtré par user_id)."""
from datetime import datetime
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from sqlalchemy import or_

from models.base import get_db
from models import (
    Account, AccountType, AutoSaving, Charge, ChargeSplit, CustomEvent,
    Income, OneTimeTransfer, Purchase, RecurringTransfer, User,
)
from services.access import accessible_account_ids
from services.joint_contributions import compute_joint_contributions

router = APIRouter()


class AccountCreate(BaseModel):
    bank: str
    type: AccountType
    name: str
    initial_balance: Decimal = Decimal(0)
    notes: Optional[str] = None
    is_active: bool = True
    space: str = "perso"  # 'perso' (par défaut) ou 'pro'


class AccountUpdate(BaseModel):
    bank: Optional[str] = None
    type: Optional[AccountType] = None
    name: Optional[str] = None
    initial_balance: Optional[Decimal] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None
    space: Optional[str] = None


class AccountOut(BaseModel):
    id: int
    bank: str
    type: str
    name: str
    initial_balance: Decimal
    notes: Optional[str]
    is_active: bool
    created_at: datetime
    space: str

    class Config:
        from_attributes = True


@router.get("/", response_model=list[AccountOut])
async def list_accounts(
    request: Request,
    db: Session = Depends(get_db),
    include_inactive: bool = False,
    space: Optional[str] = None,
):
    """Comptes accessibles à l'user : ceux qu'il a créés + ceux où il est
    co-titulaire (account_members). ?space=perso|pro pour filtrer."""
    user: User = request.state.user
    acc_ids = accessible_account_ids(db, user.id)
    q = db.query(Account).filter(
        or_(Account.user_id == user.id, Account.id.in_(acc_ids))
    )
    if not include_inactive:
        q = q.filter(Account.is_active.is_(True))
    if space in ("perso", "pro"):
        q = q.filter(Account.space == space)
    return q.order_by(Account.bank, Account.name).all()


@router.post("/", response_model=AccountOut, status_code=201)
async def create_account(
    request: Request,
    payload: AccountCreate,
    db: Session = Depends(get_db),
):
    user: User = request.state.user
    acc = Account(**payload.model_dump(), user_id=user.id)
    db.add(acc)
    db.commit()
    db.refresh(acc)
    return acc


@router.patch("/{account_id}", response_model=AccountOut)
async def update_account(
    account_id: int,
    request: Request,
    payload: AccountUpdate,
    db: Session = Depends(get_db),
):
    user: User = request.state.user
    acc = db.query(Account).filter(
        Account.id == account_id, Account.user_id == user.id,
    ).first()
    if not acc:
        raise HTTPException(404, "Compte introuvable")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(acc, k, v)
    db.commit()
    db.refresh(acc)
    return acc


class DependencyItem(BaseModel):
    id: int
    label: str
    amount: Optional[Decimal] = None
    extra: Optional[str] = None


class DependenciesOut(BaseModel):
    account_id: int
    account_name: str
    incomes: list[DependencyItem]
    charges: list[DependencyItem]
    charge_splits: int   # nb de splits coloc liés à des charges sur ce compte
    recurring_transfers_out: list[DependencyItem]
    recurring_transfers_in: list[DependencyItem]
    onetime_transfers_out: list[DependencyItem]
    onetime_transfers_in: list[DependencyItem]
    savings_out: list[DependencyItem]
    savings_in: list[DependencyItem]
    purchases: list[DependencyItem]
    custom_events: list[DependencyItem]
    total_count: int


@router.get("/{account_id}/dependencies", response_model=DependenciesOut)
async def get_dependencies(
    account_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    """Liste tout ce qui pointe vers ce compte. Sert à informer l'utilisateur
    avant suppression : cascade ou réassignation."""
    user: User = request.state.user
    acc = db.query(Account).filter(Account.id == account_id).first()
    if not acc:
        raise HTTPException(404, "Compte introuvable")
    # L'user doit avoir accès au compte (owner ou cotitulaire)
    if account_id not in accessible_account_ids(db, user.id):
        raise HTTPException(403, "Pas accès à ce compte")

    incomes = db.query(Income).filter(Income.account_id == account_id).all()
    charges = db.query(Charge).filter(Charge.account_id == account_id).all()
    charge_ids = [c.id for c in charges]
    splits_count = (
        db.query(ChargeSplit).filter(ChargeSplit.charge_id.in_(charge_ids)).count()
        if charge_ids else 0
    )
    rec_out = db.query(RecurringTransfer).filter(RecurringTransfer.source_account_id == account_id).all()
    rec_in = db.query(RecurringTransfer).filter(RecurringTransfer.dest_account_id == account_id).all()
    ot_out = db.query(OneTimeTransfer).filter(OneTimeTransfer.source_account_id == account_id).all()
    ot_in = db.query(OneTimeTransfer).filter(OneTimeTransfer.dest_account_id == account_id).all()
    sav_out = db.query(AutoSaving).filter(AutoSaving.source_account_id == account_id).all()
    sav_in = db.query(AutoSaving).filter(AutoSaving.dest_account_id == account_id).all()
    purchases = db.query(Purchase).filter(Purchase.account_id == account_id).all()
    customs = db.query(CustomEvent).filter(CustomEvent.account_id == account_id).all()

    def _item(obj, label_attr: str, amount_attr: Optional[str] = None, extra: Optional[str] = None) -> DependencyItem:
        return DependencyItem(
            id=obj.id,
            label=str(getattr(obj, label_attr, "")) or "(sans libellé)",
            amount=Decimal(str(getattr(obj, amount_attr))) if amount_attr and getattr(obj, amount_attr) is not None else None,
            extra=extra,
        )

    incomes_l = [_item(i, "source", "amount", f"le {i.day_of_month}") for i in incomes]
    charges_l = [_item(c, "label", "total_amount", f"le {c.day_of_month}") for c in charges]
    rec_out_l = [_item(t, "label", "amount", f"le {t.day_of_month}") for t in rec_out]
    rec_in_l = [_item(t, "label", "amount", f"le {t.day_of_month}") for t in rec_in]
    ot_out_l = [_item(t, "label", "amount", str(t.date)) for t in ot_out]
    ot_in_l = [_item(t, "label", "amount", str(t.date)) for t in ot_in]
    sav_out_l = [_item(s, "label", "amount", f"le {s.day_of_month}") for s in sav_out]
    sav_in_l = [_item(s, "label", "amount", f"le {s.day_of_month}") for s in sav_in]
    purch_l = [_item(p, "description", "total_amount", str(p.date)) for p in purchases]
    custom_l = [_item(e, "label", None, str(e.date)) for e in customs]

    total = (
        len(incomes_l) + len(charges_l) + len(rec_out_l) + len(rec_in_l)
        + len(ot_out_l) + len(ot_in_l) + len(sav_out_l) + len(sav_in_l)
        + len(purch_l) + len(custom_l)
    )

    return DependenciesOut(
        account_id=account_id,
        account_name=acc.name,
        incomes=incomes_l,
        charges=charges_l,
        charge_splits=splits_count,
        recurring_transfers_out=rec_out_l,
        recurring_transfers_in=rec_in_l,
        onetime_transfers_out=ot_out_l,
        onetime_transfers_in=ot_in_l,
        savings_out=sav_out_l,
        savings_in=sav_in_l,
        purchases=purch_l,
        custom_events=custom_l,
        total_count=total,
    )


@router.delete("/{account_id}", status_code=204)
async def delete_account(
    account_id: int,
    request: Request,
    db: Session = Depends(get_db),
    cascade: bool = False,
    reassign_to: Optional[int] = None,
):
    """Supprime un compte. Si le compte a des mouvements liés :
      - cascade=true : supprime tout (charges, revenus, virements, etc.)
      - reassign_to=<id> : redirige tous les mouvements vers cet autre compte
      - sinon : 409 avec liste des dépendances → l'user appelle /dependencies
    """
    user: User = request.state.user
    acc = db.query(Account).filter(
        Account.id == account_id, Account.user_id == user.id,
    ).first()
    if not acc:
        raise HTTPException(404, "Compte introuvable (seul le propriétaire peut supprimer)")

    # Vérifier qu'il y a des dépendances
    deps = (
        db.query(Income).filter(Income.account_id == account_id).count()
        + db.query(Charge).filter(Charge.account_id == account_id).count()
        + db.query(RecurringTransfer).filter(
            (RecurringTransfer.source_account_id == account_id)
            | (RecurringTransfer.dest_account_id == account_id)
        ).count()
        + db.query(OneTimeTransfer).filter(
            (OneTimeTransfer.source_account_id == account_id)
            | (OneTimeTransfer.dest_account_id == account_id)
        ).count()
        + db.query(AutoSaving).filter(
            (AutoSaving.source_account_id == account_id)
            | (AutoSaving.dest_account_id == account_id)
        ).count()
        + db.query(Purchase).filter(Purchase.account_id == account_id).count()
        + db.query(CustomEvent).filter(CustomEvent.account_id == account_id).count()
    )

    if deps > 0 and not cascade and reassign_to is None:
        raise HTTPException(
            409,
            f"Le compte a {deps} mouvement(s) lié(s). "
            "Précise ?cascade=true (tout supprimer) ou ?reassign_to=<id> (réassigner).",
        )

    if reassign_to is not None:
        if reassign_to == account_id:
            raise HTTPException(400, "Impossible de réassigner à soi-même")
        target = db.query(Account).filter(Account.id == reassign_to).first()
        if not target:
            raise HTTPException(404, "Compte cible introuvable")
        if reassign_to not in accessible_account_ids(db, user.id):
            raise HTTPException(403, "Pas accès au compte cible")
        # Bascule toutes les FK
        db.query(Income).filter(Income.account_id == account_id).update(
            {Income.account_id: reassign_to}, synchronize_session=False)
        db.query(Charge).filter(Charge.account_id == account_id).update(
            {Charge.account_id: reassign_to}, synchronize_session=False)
        db.query(RecurringTransfer).filter(RecurringTransfer.source_account_id == account_id).update(
            {RecurringTransfer.source_account_id: reassign_to}, synchronize_session=False)
        db.query(RecurringTransfer).filter(RecurringTransfer.dest_account_id == account_id).update(
            {RecurringTransfer.dest_account_id: reassign_to}, synchronize_session=False)
        db.query(OneTimeTransfer).filter(OneTimeTransfer.source_account_id == account_id).update(
            {OneTimeTransfer.source_account_id: reassign_to}, synchronize_session=False)
        db.query(OneTimeTransfer).filter(OneTimeTransfer.dest_account_id == account_id).update(
            {OneTimeTransfer.dest_account_id: reassign_to}, synchronize_session=False)
        db.query(AutoSaving).filter(AutoSaving.source_account_id == account_id).update(
            {AutoSaving.source_account_id: reassign_to}, synchronize_session=False)
        db.query(AutoSaving).filter(AutoSaving.dest_account_id == account_id).update(
            {AutoSaving.dest_account_id: reassign_to}, synchronize_session=False)
        db.query(Purchase).filter(Purchase.account_id == account_id).update(
            {Purchase.account_id: reassign_to}, synchronize_session=False)
        db.query(CustomEvent).filter(CustomEvent.account_id == account_id).update(
            {CustomEvent.account_id: reassign_to}, synchronize_session=False)

    if cascade:
        # Supprime tout ce qui est lié — les ChargeSplit s'en vont en cascade
        # avec les Charges (FK ondelete=CASCADE dans le modèle).
        charges_to_delete = db.query(Charge).filter(Charge.account_id == account_id).all()
        for c in charges_to_delete:
            # Supprime d'abord les splits manuellement par sécurité
            db.query(ChargeSplit).filter(ChargeSplit.charge_id == c.id).delete()
            db.delete(c)
        db.query(Income).filter(Income.account_id == account_id).delete()
        db.query(RecurringTransfer).filter(
            (RecurringTransfer.source_account_id == account_id)
            | (RecurringTransfer.dest_account_id == account_id)
        ).delete(synchronize_session=False)
        db.query(OneTimeTransfer).filter(
            (OneTimeTransfer.source_account_id == account_id)
            | (OneTimeTransfer.dest_account_id == account_id)
        ).delete(synchronize_session=False)
        db.query(AutoSaving).filter(
            (AutoSaving.source_account_id == account_id)
            | (AutoSaving.dest_account_id == account_id)
        ).delete(synchronize_session=False)
        db.query(Purchase).filter(Purchase.account_id == account_id).delete()
        db.query(CustomEvent).filter(CustomEvent.account_id == account_id).delete()

    db.delete(acc)
    db.commit()


class ContributionOut(BaseModel):
    user_id: int
    user_name: str
    expected: Decimal
    actual: Decimal
    balance: Decimal


@router.get("/{account_id}/contributions", response_model=list[ContributionOut])
async def get_contributions(
    account_id: int,
    request: Request,
    db: Session = Depends(get_db),
    year: Optional[int] = None,
    month: Optional[int] = None,
):
    """Pour un compte joint : qui a abondé combien vs sa part attendue ce mois.

    Trié par balance croissante (les plus en retard en premier).
    """
    user: User = request.state.user
    if account_id not in accessible_account_ids(db, user.id):
        raise HTTPException(404, "Compte introuvable ou non accessible")

    from datetime import date as DateType
    today = DateType.today()
    y = year or today.year
    m = month or today.month
    rows = compute_joint_contributions(db, account_id, y, m)
    return [
        ContributionOut(
            user_id=r.user_id, user_name=r.user_name,
            expected=r.expected, actual=r.actual, balance=r.balance,
        )
        for r in rows
    ]
