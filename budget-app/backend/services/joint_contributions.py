"""Calcul des abondements (qui a versé combien sur un compte joint).

Pour un compte joint et un mois donné :
  - `expected`  : somme des ChargeSplit.amount du user pour les charges actives ce mois
  - `actual`    : somme des virements entrants vers ce compte où l'auteur est ce user
                  (RecurringTransfer actif et dans la fenêtre de validité +
                   OneTimeTransfer dont la date tombe dans le mois)
  - `balance`   : actual - expected. Positif = surplus, négatif = retard.

Si le relevé du compte joint a été importé pour ce mois, `actual` vient des
crédits réels rapprochés à un membre (BankTransaction.contributor_user_id)
au lieu des virements déclarés : on montre ce qui est vraiment arrivé.

Cette logique remplace conceptuellement le min-cash-flow pour les comptes
joints où les charges sont payées par le joint et chacun doit abonder sa part.
"""
from calendar import monthrange
from datetime import date
from decimal import Decimal
from typing import NamedTuple

from sqlalchemy.orm import Session

from models import (
    BankTransaction, Charge, ChargeSplit, Envelope, OneTimeTransfer, RecurringTransfer, User,
)
from services.access import account_member_user_ids
from services.budget_calc import charge_is_active_in_month


class MemberContribution(NamedTuple):
    user_id: int
    user_name: str
    expected: Decimal
    actual: Decimal
    balance: Decimal  # actual - expected
    from_bank: bool = False  # actual issu du relevé réel (sinon : déclaré)


def compute_joint_contributions(
    db: Session,
    account_id: int,
    year: int,
    month: int,
) -> list[MemberContribution]:
    """Renvoie la liste des contributions par membre pour un compte joint
    sur un mois donné. Triée par balance croissante (les plus en retard en haut)."""
    members = account_member_user_ids(db, account_id)
    if not members:
        return []
    users_by_id = {
        u.id: u for u in db.query(User).filter(User.id.in_(members)).all()
    }

    # === Expected : somme des parts des charges actives ce mois ===
    charges = (
        db.query(Charge)
        .filter(Charge.account_id == account_id, Charge.is_active.is_(True))
        .all()
    )
    active_charges = [c for c in charges if charge_is_active_in_month(c, month, year)]
    active_charge_ids = [c.id for c in active_charges]
    expected_by_user: dict[int, Decimal] = {uid: Decimal(0) for uid in members}
    if active_charge_ids:
        splits = (
            db.query(ChargeSplit)
            .filter(ChargeSplit.charge_id.in_(active_charge_ids))
            .all()
        )
        for s in splits:
            if s.user_id in expected_by_user:
                expected_by_user[s.user_id] += Decimal(s.amount or 0)

    # L'enveloppe commune (courses, repas…) s'abonde comme une charge partagée
    env = db.query(Envelope).filter(Envelope.account_id == account_id).first()
    if env and env.monthly_amount:
        share = Decimal(env.monthly_amount) / len(members)
        for uid in expected_by_user:
            expected_by_user[uid] += share

    # === Actual : virements entrants vers ce compte ce mois ===
    actual_by_user: dict[int, Decimal] = {uid: Decimal(0) for uid in members}
    last_day = monthrange(year, month)[1]
    month_start = date(year, month, 1)
    month_end = date(year, month, last_day)
    bank_txs = (
        db.query(BankTransaction)
        .filter(
            BankTransaction.account_id == account_id,
            BankTransaction.date >= month_start,
            BankTransaction.date <= month_end,
        )
        .all()
    )
    if bank_txs:
        for t in bank_txs:
            if t.status == "matched" and t.contributor_user_id in actual_by_user and t.amount > 0:
                actual_by_user[t.contributor_user_id] += Decimal(t.amount)
        return _results(members, users_by_id, expected_by_user, actual_by_user, from_bank=True)

    rec_transfers = (
        db.query(RecurringTransfer)
        .filter(
            RecurringTransfer.dest_account_id == account_id,
            RecurringTransfer.is_active.is_(True),
        )
        .all()
    )
    for t in rec_transfers:
        # Fenêtre de validité
        if t.valid_from and t.valid_from > month_end:
            continue
        if t.valid_to and t.valid_to < month_start:
            continue
        if t.user_id in actual_by_user:
            actual_by_user[t.user_id] += Decimal(t.amount or 0)

    ot_transfers = (
        db.query(OneTimeTransfer)
        .filter(
            OneTimeTransfer.dest_account_id == account_id,
            OneTimeTransfer.date >= month_start,
            OneTimeTransfer.date <= month_end,
        )
        .all()
    )
    for t in ot_transfers:
        if t.user_id in actual_by_user:
            actual_by_user[t.user_id] += Decimal(t.amount or 0)

    return _results(members, users_by_id, expected_by_user, actual_by_user)


def _results(members, users_by_id, expected_by_user, actual_by_user, from_bank=False):
    results = []
    for uid in members:
        u = users_by_id.get(uid)
        if not u:
            continue
        exp = expected_by_user[uid]
        act = actual_by_user[uid]
        results.append(MemberContribution(
            user_id=uid,
            user_name=u.display_name or u.ha_username,
            expected=exp,
            actual=act,
            balance=act - exp,
            from_bank=from_bank,
        ))
    results.sort(key=lambda r: r.balance)
    return results
