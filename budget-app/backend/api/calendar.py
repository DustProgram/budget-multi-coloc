"""API Calendrier - événements à venir avec projection de solde par compte.

Pour chaque événement futur (revenu, charge, virement, épargne, mensualité
d'achat), on calcule le solde projeté du compte concerné juste après l'événement.
Le frontend peut ainsi afficher "le jour où passe le gaz" et, au clic, l'état
estimé du compte après validation.

Hypothèse : `account.initial_balance` est le solde de référence courant
(mis à jour par l'utilisateur). La projection part de ce solde et n'applique
que les événements >= today.
"""
from calendar import monthrange
from datetime import date, timedelta
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from models.base import get_db
from models import (
    Account, Income, Charge, RecurringTransfer, OneTimeTransfer,
    AutoSaving, Purchase, User, Frequency,
)
from services.budget_calc import compute_my_share, charge_is_active_in_month

router = APIRouter()


def _safe_day(year: int, month: int, day: int) -> date:
    """Borne le jour au dernier jour du mois (ex : 31 fév → 28/29)."""
    last = monthrange(year, month)[1]
    return date(year, month, min(day, last))


def _iter_months(start: date, end: date):
    """Itère sur (year, month) du mois de `start` au mois de `end` inclus."""
    y, m = start.year, start.month
    while date(y, m, 1) <= end:
        yield y, m
        m += 1
        if m > 12:
            m = 1
            y += 1


class CalendarEvent(BaseModel):
    date: date
    type: str           # income | charge | transfer_in | transfer_out | saving_in | saving_out | purchase
    label: str
    amount: Decimal     # signé : + crédit, − débit
    account_id: int
    account_name: str
    source_kind: str    # income | charge | recurring_transfer | onetime_transfer | saving | purchase
    source_id: int
    balance_after: Decimal


class AccountProjection(BaseModel):
    account_id: int
    name: str
    starting_balance: Decimal
    projected_end_balance: Decimal


class UpcomingResponse(BaseModel):
    from_date: date
    to_date: date
    events: list[CalendarEvent]
    accounts: list[AccountProjection]


@router.get("/upcoming", response_model=UpcomingResponse)
async def list_upcoming_events(
    request: Request,
    db: Session = Depends(get_db),
    days: int = 60,
    from_date: Optional[date] = None,
):
    """Liste les événements financiers à venir, avec solde projeté par compte.

    Chaque événement contient `balance_after` : le solde du compte concerné
    juste après que l'événement soit validé (utile pour l'estimation au clic).
    """
    from sqlalchemy import or_
    from services.access import accessible_account_ids

    user: User = request.state.user
    today = from_date or date.today()
    end = today + timedelta(days=max(days, 0))

    # Élargir : tous les comptes accessibles à l'user (perso + joints)
    acc_ids = accessible_account_ids(db, user.id)

    accounts = db.query(Account).filter(
        or_(Account.user_id == user.id, Account.id.in_(acc_ids)),
        Account.is_active.is_(True),
    ).all()
    acc_by_id = {a.id: a for a in accounts}
    starting = {a.id: (a.initial_balance or Decimal(0)) for a in accounts}
    running = dict(starting)

    incomes = db.query(Income).filter(
        or_(Income.user_id == user.id, Income.account_id.in_(acc_ids)),
        Income.is_active.is_(True),
    ).all()
    charges = db.query(Charge).filter(
        or_(Charge.user_id == user.id, Charge.account_id.in_(acc_ids)),
        Charge.is_active.is_(True),
    ).all()
    rec_transfers = db.query(RecurringTransfer).filter(
        or_(
            RecurringTransfer.user_id == user.id,
            RecurringTransfer.source_account_id.in_(acc_ids),
            RecurringTransfer.dest_account_id.in_(acc_ids),
        ),
        RecurringTransfer.is_active.is_(True),
    ).all()
    ot_transfers = db.query(OneTimeTransfer).filter(
        or_(
            OneTimeTransfer.user_id == user.id,
            OneTimeTransfer.source_account_id.in_(acc_ids),
            OneTimeTransfer.dest_account_id.in_(acc_ids),
        ),
        OneTimeTransfer.date >= today,
        OneTimeTransfer.date <= end,
    ).all()
    savings = db.query(AutoSaving).filter(
        or_(
            AutoSaving.user_id == user.id,
            AutoSaving.source_account_id.in_(acc_ids),
            AutoSaving.dest_account_id.in_(acc_ids),
        ),
        AutoSaving.is_active.is_(True),
    ).all()
    purchases = db.query(Purchase).filter(
        or_(Purchase.user_id == user.id, Purchase.account_id.in_(acc_ids))
    ).all()

    raw: list[tuple] = []  # (date, type, label, amount, account_id, source_kind, source_id)

    for y, m in _iter_months(today, end):
        # Revenus récurrents
        for inc in incomes:
            if inc.account_id is None:
                continue
            d = _safe_day(y, m, inc.day_of_month)
            if today <= d <= end:
                raw.append((d, "income", inc.source, inc.amount,
                            inc.account_id, "income", inc.id))

        # Charges (mensuelles + non-mensuelles via helper)
        for ch in charges:
            if not charge_is_active_in_month(ch, m, y):
                continue
            if ch.account_id is None:
                continue
            d = _safe_day(y, m, ch.day_of_month)
            if today <= d <= end:
                share = compute_my_share(ch)
                raw.append((d, "charge", ch.label, -share,
                            ch.account_id, "charge", ch.id))

        # Virements récurrents (mensuels uniquement, cf. budget_calc)
        for tr in rec_transfers:
            if tr.frequency != Frequency.MENSUELLE:
                continue
            d = _safe_day(y, m, tr.day_of_month)
            if today <= d <= end:
                raw.append((d, "transfer_out", tr.label, -tr.amount,
                            tr.source_account_id, "recurring_transfer", tr.id))
                raw.append((d, "transfer_in", tr.label, tr.amount,
                            tr.dest_account_id, "recurring_transfer", tr.id))

        # Épargne auto
        for sv in savings:
            d = _safe_day(y, m, sv.day_of_month)
            if today <= d <= end:
                raw.append((d, "saving_out", sv.label, -sv.amount,
                            sv.source_account_id, "saving", sv.id))
                raw.append((d, "saving_in", sv.label, sv.amount,
                            sv.dest_account_id, "saving", sv.id))

    # Virements ponctuels (filtrés en SQL)
    for tr in ot_transfers:
        raw.append((tr.date, "transfer_out", tr.label, -tr.amount,
                    tr.source_account_id, "onetime_transfer", tr.id))
        raw.append((tr.date, "transfer_in", tr.label, tr.amount,
                    tr.dest_account_id, "onetime_transfer", tr.id))

    # Mensualités d'achats : 1ʳᵉ mensualité = jour de l'achat, puis même jour
    # les mois suivants (avec clamp en fin de mois).
    for p in purchases:
        if p.account_id is None:
            continue
        nb = p.nb_installments or 1
        for i in range(nb):
            y = p.date.year
            m = p.date.month + i
            while m > 12:
                m -= 12
                y += 1
            d = _safe_day(y, m, p.date.day)
            if today <= d <= end:
                label = p.description if nb == 1 else f"{p.description} ({i+1}/{nb})"
                raw.append((d, "purchase", label, -p.monthly_amount,
                            p.account_id, "purchase", p.id))

    # Tri chronologique stable (date, type pour ordre déterministe)
    raw.sort(key=lambda e: (e[0], e[1]))

    # IMPORTANT — modèle abondement (0.9.0) : charges partagées sur compte
    # joint sont affichées mais ne plombent pas le solde projeté (on assume
    # que les abondements des colocs équilibrent).
    from services.access import is_joint_account
    from models import SplitMode
    _joint_cache: dict[int, bool] = {}
    def _is_joint(acc_id):
        if acc_id is None:
            return False
        if acc_id not in _joint_cache:
            _joint_cache[acc_id] = is_joint_account(db, acc_id)
        return _joint_cache[acc_id]
    neutralized_charge_ids = {
        ch.id for ch in charges
        if ch.split_mode != SplitMode.PERSO and _is_joint(ch.account_id)
    }

    events: list[CalendarEvent] = []
    for d, evt_type, label, amount, acc_id, src_kind, src_id in raw:
        # Skip impact balance pour charges neutralisées (joint partagé)
        is_neutralized_charge = src_kind == "charge" and src_id in neutralized_charge_ids
        if acc_id not in running:
            # Compte inactif ou appartenant à un autre user : on ignore
            continue
        if not is_neutralized_charge:
            running[acc_id] += amount
        events.append(CalendarEvent(
            date=d,
            type=evt_type,
            label=label,
            amount=amount,
            account_id=acc_id,
            account_name=acc_by_id[acc_id].name,
            source_kind=src_kind,
            source_id=src_id,
            balance_after=running[acc_id],
        ))

    return UpcomingResponse(
        from_date=today,
        to_date=end,
        events=events,
        accounts=[
            AccountProjection(
                account_id=a.id,
                name=a.name,
                starting_balance=starting[a.id],
                projected_end_balance=running[a.id],
            )
            for a in accounts
        ],
    )
