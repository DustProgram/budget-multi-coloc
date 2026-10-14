"""Enveloppes « vie quotidienne » : combien il reste pour les petites dépenses."""
from __future__ import annotations

import calendar
from collections import defaultdict
from datetime import date
from decimal import Decimal
from typing import Optional

from sqlalchemy.orm import Session

from models import Account, BankTransaction, Envelope, User
from services.access import accessible_account_ids, is_joint_account

DEFAULT_THRESHOLD = Decimal("150")
DAILY = "daily"


def perso_envelope(db: Session, user_id: int) -> Optional[Envelope]:
    return db.query(Envelope).filter(Envelope.user_id == user_id, Envelope.account_id.is_(None)).first()


def envelope_for_account(db: Session, account_id: int) -> Optional[Envelope]:
    if is_joint_account(db, account_id):
        return db.query(Envelope).filter(Envelope.account_id == account_id).first()
    acc = db.get(Account, account_id)
    return perso_envelope(db, acc.user_id) if acc else None


def threshold_for_account(db: Session, account_id: int) -> Decimal:
    env = envelope_for_account(db, account_id)
    return Decimal(env.big_purchase_threshold) if env else DEFAULT_THRESHOLD


def perso_account_ids(db: Session, user_id: int) -> list[int]:
    return [a.id for a in db.query(Account).filter(Account.user_id == user_id).all()
            if not is_joint_account(db, a.id)]


def _month_bounds(year: int, month: int) -> tuple[date, date]:
    return date(year, month, 1), date(year, month, calendar.monthrange(year, month)[1])


def spent(db: Session, account_ids: list[int], year: int, month: int) -> tuple[Decimal, int, Optional[date]]:
    """(dépensé, nb d'opérations, date de la dernière opération connue du mois)."""
    if not account_ids:
        return Decimal(0), 0, None
    start, end = _month_bounds(year, month)
    txs = db.query(BankTransaction).filter(
        BankTransaction.account_id.in_(account_ids),
        BankTransaction.match_kind == DAILY,
        BankTransaction.date >= start, BankTransaction.date <= end,
    ).all()
    total = -sum((Decimal(t.amount) for t in txs), Decimal(0))  # remboursements en déduction
    return total, len(txs), max((t.date for t in txs), default=None)


def suggest_amount(db: Session, account_ids: list[int], threshold: Decimal) -> Optional[Decimal]:
    """Moyenne mensuelle des petites dépenses déjà importées (quotidien ou encore à trier)."""
    if not account_ids:
        return None
    txs = db.query(BankTransaction).filter(
        BankTransaction.account_id.in_(account_ids), BankTransaction.amount < 0,
        (BankTransaction.match_kind == DAILY) | (BankTransaction.status == "to_review"),
    ).all()
    by_month: dict[tuple[int, int], Decimal] = defaultdict(Decimal)
    for t in txs:
        if t.match_kind == DAILY or -Decimal(t.amount) < threshold:
            by_month[(t.date.year, t.date.month)] += -Decimal(t.amount)
    if not by_month:
        return None
    return (sum(by_month.values(), Decimal(0)) / len(by_month)).quantize(Decimal("1"))


def statuses(db: Session, user: User, year: int, month: int, today: Optional[date] = None) -> list[dict]:
    """Enveloppe perso + une par compte joint accessible (configurées ou non)."""
    today = today or date.today()
    start, end = _month_bounds(year, month)
    days_left = (end - today).days + 1 if start <= today <= end else (0 if today > end else (end - start).days + 1)

    scopes: list[tuple[str, Optional[int], str, list[int], Optional[Envelope]]] = [
        ("perso", None, "Mon quotidien", perso_account_ids(db, user.id), perso_envelope(db, user.id)),
    ]
    for acc in db.query(Account).filter(Account.id.in_(accessible_account_ids(db, user.id))).order_by(Account.name):
        if is_joint_account(db, acc.id):
            env = db.query(Envelope).filter(Envelope.account_id == acc.id).first()
            scopes.append(("commune", acc.id, f"Commun — {acc.name}", [acc.id], env))

    out = []
    for scope, account_id, default_label, ids, env in scopes:
        threshold = Decimal(env.big_purchase_threshold) if env else DEFAULT_THRESHOLD
        amount = Decimal(env.monthly_amount) if env else Decimal(0)
        total, count, last = spent(db, ids, year, month)
        remaining = amount - total
        out.append({
            "id": env.id if env else None,
            "scope": scope,
            "account_id": account_id,
            "label": env.label if env else default_label,
            "configured": env is not None,
            "monthly_amount": amount,
            "threshold": threshold,
            "spent": total,
            "remaining": remaining,
            "count": count,
            "last_operation": last,
            "days_left": days_left,
            "per_day": (remaining / days_left).quantize(Decimal("0.01")) if days_left > 0 and remaining > 0 else Decimal(0),
            "suggestion": suggest_amount(db, ids, threshold),
        })
    return out
