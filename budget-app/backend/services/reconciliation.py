"""Rapprochement relevé bancaire ↔ déclarations.

Ordre pour chaque ligne importée :
  1. achat déjà saisi (ticket importé) de même montant à ±4 jours → rapproché
  2. règle apprise (libellé + fourchette de montant) → rapproché
  3. déclarations du mois (charges, revenus, virements, épargne, abondements)
     → rapproché si UN seul candidat, sinon « à valider »

On ne devine jamais entre deux candidats : c'est l'utilisateur (app ou agent)
qui tranche, et sa réponse peut devenir une règle.
"""
from __future__ import annotations

import hashlib
import re
import unicodedata
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Optional

from sqlalchemy.orm import Session

from models import (
    Account, AutoSaving, BankTransaction, Charge, ChargeSplit, Frequency,
    Income, IncomeType, MatchingRule, OneTimeTransfer, PaymentMethod,
    Purchase, RecurringTransfer, SplitMode, User,
)
from services.access import account_member_user_ids, is_joint_account
from services.budget_calc import _in_validity_window, charge_is_active_in_month
from services.charge_splits import regenerate_splits
from services.statement_parsers import ParsedTx

TO_REVIEW = "to_review"
MATCHED = "matched"
IGNORED = "ignored"

KINDS = {
    "charge", "income", "recurring_transfer", "onetime_transfer", "saving",
    "purchase", "contribution", "new_purchase", "new_charge", "new_income", "ignore",
}

_MONTHS = {
    "JANVIER", "FEVRIER", "MARS", "AVRIL", "MAI", "JUIN", "JUILLET", "AOUT",
    "SEPTEMBRE", "OCTOBRE", "NOVEMBRE", "DECEMBRE", "JANV", "FEV", "FEVR",
    "AVR", "JUIL", "SEPT", "OCT", "NOV", "DEC",
}
_DAY_WINDOW = 5


def normalize_label(label: str) -> str:
    s = (label or "").replace("’", " ").replace("'", " ")  # « l’iban » ≠ « LIBAN »
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().upper()
    s = re.sub(r"[^A-Z0-9]+", " ", s)
    toks = [t for t in s.split() if not re.search(r"\d{3,}", t) and not t.isdigit() and t not in _MONTHS]
    return " ".join(toks)


def label_tokens(label: str) -> set[str]:
    return set(normalize_label(label).split())


def suggest_pattern(label: str) -> str:
    return " ".join(normalize_label(label).split()[:6])


def fingerprint(account_id: int, tx: ParsedTx, occurrence: int) -> str:
    if tx.external_id:
        raw = f"fitid|{tx.external_id}"
    else:
        raw = f"{account_id}|{tx.date.isoformat()}|{tx.amount}|{normalize_label(tx.label)}|{occurrence}"
    return hashlib.sha256(raw.encode()).hexdigest()[:40]


def _tolerance(amount: Decimal, pct: str = "0.03") -> Decimal:
    return max(Decimal("1.00"), abs(amount) * Decimal(pct))


def _day_close(tx_date: date, day_of_month: Optional[int]) -> bool:
    if not day_of_month:
        return True
    return abs(tx_date.day - day_of_month) <= _DAY_WINDOW


def _fmt_eur(v: Decimal) -> str:
    return f"{Decimal(v):,.2f} €".replace(",", " ").replace(".", ",")


@dataclass
class Candidate:
    kind: str
    target_id: Optional[int]
    label: str
    contributor_user_id: Optional[int] = None

    @property
    def key(self) -> str:
        if self.kind == "contribution":
            return f"contribution:{self.contributor_user_id}"
        return f"{self.kind}:{self.target_id}" if self.target_id else self.kind


def _already_matched(db: Session, tx: BankTransaction) -> set[tuple[str, int]]:
    start = tx.date.replace(day=1)
    end = (start + timedelta(days=32)).replace(day=1)
    rows = (
        db.query(BankTransaction.match_kind, BankTransaction.match_id)
        .filter(
            BankTransaction.account_id == tx.account_id,
            BankTransaction.status == MATCHED,
            BankTransaction.date >= start, BankTransaction.date < end,
            BankTransaction.id != tx.id,
            BankTransaction.match_id.isnot(None),
        )
        .all()
    )
    return {(k, i) for k, i in rows}


def _purchase_candidates(db: Session, tx: BankTransaction) -> list[Candidate]:
    if tx.amount >= 0:
        return []
    taken = {
        r[0] for r in db.query(BankTransaction.match_id).filter(
            BankTransaction.match_kind == "purchase", BankTransaction.id != tx.id,
        ).all()
    }
    purchases = db.query(Purchase).filter(
        Purchase.account_id == tx.account_id,
        Purchase.date >= tx.date - timedelta(days=4),
        Purchase.date <= tx.date + timedelta(days=4),
    ).all()
    return [
        Candidate("purchase", p.id, f"Achat « {p.description} » du {p.date:%d/%m} ({_fmt_eur(p.total_amount)})")
        for p in purchases
        if p.id not in taken and abs(Decimal(p.total_amount) - abs(tx.amount)) <= Decimal("0.05")
    ]


def _member_expected(db: Session, account_id: int, year: int, month: int) -> dict[int, Decimal]:
    charges = db.query(Charge).filter(Charge.account_id == account_id, Charge.is_active.is_(True)).all()
    ids = [c.id for c in charges if charge_is_active_in_month(c, month, year)]
    out: dict[int, Decimal] = {}
    if ids:
        for s in db.query(ChargeSplit).filter(ChargeSplit.charge_id.in_(ids)).all():
            out[s.user_id] = out.get(s.user_id, Decimal(0)) + Decimal(s.amount or 0)
    return out


def _user_name(u: User) -> str:
    return u.display_name or u.ha_username


def compute_candidates(db: Session, tx: BankTransaction) -> list[Candidate]:
    y, m = tx.date.year, tx.date.month
    amt = Decimal(tx.amount)
    absamt = abs(amt)
    tol = _tolerance(amt)
    taken = _already_matched(db, tx)
    acc_id = tx.account_id
    cands: list[Candidate] = []

    def free(kind: str, i: int) -> bool:
        return (kind, i) not in taken

    if amt < 0:
        for c in db.query(Charge).filter(Charge.account_id == acc_id, Charge.is_active.is_(True)).all():
            if (charge_is_active_in_month(c, m, y) and free("charge", c.id)
                    and abs(Decimal(c.total_amount) - absamt) <= tol and _day_close(tx.date, c.day_of_month)):
                cands.append(Candidate("charge", c.id, f"Charge « {c.label} » ({_fmt_eur(c.total_amount)})"))
        cands += _purchase_candidates(db, tx)

    for t in db.query(RecurringTransfer).filter(RecurringTransfer.is_active.is_(True)).filter(
        (RecurringTransfer.source_account_id == acc_id) if amt < 0 else (RecurringTransfer.dest_account_id == acc_id)
    ).all():
        if (_in_validity_window(t, y, m) and free("recurring_transfer", t.id)
                and abs(Decimal(t.amount) - absamt) <= tol and _day_close(tx.date, t.day_of_month)):
            cands.append(Candidate(
                "recurring_transfer", t.id, f"Virement « {t.label} » ({_fmt_eur(t.amount)})",
                contributor_user_id=t.user_id if amt > 0 else None,
            ))

    for s in db.query(AutoSaving).filter(AutoSaving.is_active.is_(True)).filter(
        (AutoSaving.source_account_id == acc_id) if amt < 0 else (AutoSaving.dest_account_id == acc_id)
    ).all():
        if (_in_validity_window(s, y, m) and free("saving", s.id)
                and abs(Decimal(s.amount) - absamt) <= tol and _day_close(tx.date, s.day_of_month)):
            cands.append(Candidate("saving", s.id, f"Épargne « {s.label} » ({_fmt_eur(s.amount)})"))

    for o in db.query(OneTimeTransfer).filter(
        (OneTimeTransfer.source_account_id == acc_id) if amt < 0 else (OneTimeTransfer.dest_account_id == acc_id),
        OneTimeTransfer.date >= tx.date - timedelta(days=3),
        OneTimeTransfer.date <= tx.date + timedelta(days=3),
    ).all():
        if free("onetime_transfer", o.id) and abs(Decimal(o.amount) - absamt) <= tol:
            cands.append(Candidate(
                "onetime_transfer", o.id, f"Virement ponctuel « {o.label} » ({_fmt_eur(o.amount)})",
                contributor_user_id=o.user_id if amt > 0 else None,
            ))

    if amt > 0:
        for inc in db.query(Income).filter(Income.account_id == acc_id, Income.is_active.is_(True)).all():
            itol = _tolerance(amt, "0.20") if inc.type == IncomeType.VARIABLE else tol
            if (_in_validity_window(inc, y, m) and free("income", inc.id)
                    and abs(Decimal(inc.amount) - absamt) <= itol and _day_close(tx.date, inc.day_of_month)):
                cands.append(Candidate("income", inc.id, f"Revenu « {inc.source} » ({_fmt_eur(inc.amount)})"))

        if is_joint_account(db, acc_id):
            toks = label_tokens(tx.label)
            expected = _member_expected(db, acc_id, y, m)
            members = db.query(User).filter(User.id.in_(account_member_user_ids(db, acc_id))).all()
            by_name, by_amount = [], []
            for u in members:
                first = (normalize_label(_user_name(u)).split() or [""])[0]
                if len(first) >= 3 and first in toks:
                    by_name.append(u)
                elif u.id in expected and abs(expected[u.id] - absamt) <= tol:
                    by_amount.append(u)
            # Le nom dans le libellé l'emporte : parts égales = montant ambigu
            for u in by_name or by_amount:
                cands.append(Candidate(
                    "contribution", None, f"Abondement de {_user_name(u)}", contributor_user_id=u.id,
                ))

    # Un virement déclaré et un abondement du même membre = même réponse
    contributors = {c.contributor_user_id for c in cands}
    if len(cands) > 1 and len(contributors) == 1 and None not in contributors:
        cands = [cands[0]]
    return cands


def _rule_applies(rule: MatchingRule, tx: BankTransaction) -> bool:
    if rule.account_id and rule.account_id != tx.account_id:
        return False
    pat = set(rule.pattern.split())
    if not pat or not pat <= label_tokens(tx.label):
        return False
    amt = Decimal(tx.amount)
    if rule.match_kind == "new_purchase" and amt >= 0:
        return False
    if rule.amount_min is not None and amt < Decimal(rule.amount_min):
        return False
    if rule.amount_max is not None and amt > Decimal(rule.amount_max):
        return False
    return True


def _target_exists(db: Session, kind: str, target_id: Optional[int]) -> bool:
    model = {
        "charge": Charge, "income": Income, "recurring_transfer": RecurringTransfer,
        "onetime_transfer": OneTimeTransfer, "saving": AutoSaving, "purchase": Purchase,
    }.get(kind)
    if model is None:
        return True
    return target_id is not None and db.get(model, target_id) is not None


def auto_match(db: Session, tx: BankTransaction) -> None:
    purchases = _purchase_candidates(db, tx)
    if len(purchases) == 1:
        _set_match(tx, purchases[0].kind, purchases[0].target_id, None)
        return

    for rule in db.query(MatchingRule).filter(MatchingRule.account_id == tx.account_id).order_by(MatchingRule.id.desc()):
        if _rule_applies(rule, tx) and _target_exists(db, rule.match_kind, rule.match_id):
            if rule.match_kind == "new_purchase":
                p = _create_purchase(db, tx, rule.user_id, rule.category)
                _set_match(tx, "purchase", p.id, None)
            else:
                _set_match(tx, rule.match_kind, rule.match_id, rule.contributor_user_id)
            tx.rule_id = rule.id
            rule.hits = (rule.hits or 0) + 1
            return

    cands = compute_candidates(db, tx)
    if len(cands) == 1:
        c = cands[0]
        _set_match(tx, c.kind, c.target_id, c.contributor_user_id)


def _set_match(tx: BankTransaction, kind: str, target_id: Optional[int], contributor: Optional[int]) -> None:
    tx.status = IGNORED if kind == "ignore" else MATCHED
    tx.match_kind = kind
    tx.match_id = target_id
    tx.contributor_user_id = contributor


def import_transactions(
    db: Session, user: User, account_id: int, rows: list[ParsedTx], source: str,
) -> dict:
    existing = {
        f for (f,) in db.query(BankTransaction.fingerprint).filter(BankTransaction.account_id == account_id).all()
    }
    seen: dict[tuple, int] = {}
    created: list[BankTransaction] = []
    duplicates = 0
    for r in sorted(rows, key=lambda r: r.date):
        k = (r.date, r.amount, normalize_label(r.label))
        occ = seen.get(k, 0)
        seen[k] = occ + 1
        fp = fingerprint(account_id, r, occ)
        if fp in existing:
            duplicates += 1
            continue
        existing.add(fp)
        tx = BankTransaction(
            account_id=account_id, imported_by_user_id=user.id, date=r.date,
            amount=r.amount, label=r.label, source=source, fingerprint=fp, status=TO_REVIEW,
        )
        db.add(tx)
        created.append(tx)
    db.flush()
    for tx in created:
        auto_match(db, tx)
        db.flush()
    db.commit()
    matched = sum(1 for t in created if t.status != TO_REVIEW)
    return {
        "imported": len(created),
        "duplicates": duplicates,
        "matched": matched,
        "to_review": len(created) - matched,
    }


# ============================================================
# Résolution manuelle (app ou agent)
# ============================================================

def options_for(db: Session, tx: BankTransaction) -> list[dict]:
    """Choix proposés à l'utilisateur, avec une clé stable réutilisable par l'agent."""
    opts = [{"key": c.key, "label": c.label} for c in compute_candidates(db, tx)]
    keys = {o["key"] for o in opts}
    if tx.amount < 0:
        opts.append({"key": "new_purchase", "label": "Dépense ponctuelle (achat) — préciser la catégorie"})
        opts.append({"key": "new_charge", "label": "Nouvelle charge mensuelle à déclarer"})
    else:
        if is_joint_account(db, tx.account_id):
            for u in db.query(User).filter(User.id.in_(account_member_user_ids(db, tx.account_id))).all():
                k = f"contribution:{u.id}"
                if k not in keys:
                    opts.append({"key": k, "label": f"Abondement de {_user_name(u)}"})
        opts.append({"key": "new_income", "label": "Nouveau revenu mensuel à déclarer"})
    opts.append({"key": "ignore", "label": "Ignorer (virement interne, remboursement…)"})
    return opts


def question_for(db: Session, tx: BankTransaction) -> str:
    acc = db.get(Account, tx.account_id)
    sens = "Débit" if tx.amount < 0 else "Crédit"
    return (
        f"{sens} de {_fmt_eur(abs(tx.amount))} le {tx.date:%d/%m/%Y} sur {acc.name if acc else '?'} : "
        f"« {tx.label} ». À quoi ça correspond ?"
    )


def parse_option_key(key: str) -> tuple[str, Optional[int], Optional[str]]:
    kind, _, rest = (key or "").partition(":")
    if kind not in KINDS:
        raise ValueError(f"Choix inconnu : {key}")
    if kind == "new_purchase":
        return kind, None, rest or None
    target = int(rest) if rest.isdigit() else None
    return kind, target, None


def _first_of_month(d: date) -> date:
    return d.replace(day=1)


def _create_purchase(db: Session, tx: BankTransaction, user_id: int, category: Optional[str]) -> Purchase:
    p = Purchase(
        user_id=user_id, date=tx.date, description=tx.label[:256],
        total_amount=abs(Decimal(tx.amount)), nb_installments=1,
        category=(category or "Autre")[:64], payment_method=PaymentMethod.CB,
        account_id=tx.account_id, notes="Créé depuis le relevé bancaire",
    )
    db.add(p)
    db.flush()
    return p


def resolve(
    db: Session,
    tx: BankTransaction,
    user: User,
    kind: str,
    target_id: Optional[int] = None,
    category: Optional[str] = None,
    label: Optional[str] = None,
    create_rule: bool = False,
    amount: Optional[Decimal] = None,
    rule_pattern: Optional[str] = None,
) -> BankTransaction:
    if kind not in KINDS:
        raise ValueError(f"Type inconnu : {kind}")
    amt = Decimal(tx.amount)
    contributor: Optional[int] = None
    rule_kind = kind
    nice_label = (label or suggest_pattern(tx.label).title() or tx.label)[:128]

    if kind == "contribution":
        if amt <= 0:
            raise ValueError("Un abondement est forcément un crédit.")
        if target_id not in account_member_user_ids(db, tx.account_id):
            raise ValueError("Cette personne n'est pas membre du compte.")
        contributor, target_id = target_id, None
    elif kind == "new_purchase":
        if amt >= 0:
            raise ValueError("Un achat est forcément un débit.")
        target_id = _create_purchase(db, tx, user.id, category).id
        kind = "purchase"
    elif kind == "new_charge":
        if amt >= 0:
            raise ValueError("Une charge est forcément un débit.")
        ch = Charge(
            user_id=user.id, label=nice_label, total_amount=abs(amount or amt),
            frequency=Frequency.MENSUELLE, day_of_month=tx.date.day,
            split_mode=SplitMode.EGAL if is_joint_account(db, tx.account_id) else SplitMode.PERSO,
            account_id=tx.account_id, valid_from=_first_of_month(tx.date),
        )
        db.add(ch)
        db.flush()
        regenerate_splits(db, ch)
        kind = rule_kind = "charge"
        target_id = ch.id
    elif kind == "new_income":
        if amt <= 0:
            raise ValueError("Un revenu est forcément un crédit.")
        inc = Income(
            user_id=user.id, source=nice_label, amount=abs(amount or amt), day_of_month=tx.date.day,
            type=IncomeType.REGULIER, account_id=tx.account_id, valid_from=_first_of_month(tx.date),
        )
        db.add(inc)
        db.flush()
        kind = rule_kind = "income"
        target_id = inc.id
    elif kind != "ignore":
        if target_id not in _declarations_on_account(db, kind, tx.account_id):
            raise ValueError("Déclaration introuvable sur ce compte.")
        if kind in ("recurring_transfer", "onetime_transfer") and amt > 0:
            model = RecurringTransfer if kind == "recurring_transfer" else OneTimeTransfer
            contributor = db.get(model, target_id).user_id

    _set_match(tx, kind, target_id, contributor)
    tx.resolved_by_user_id = user.id
    tx.resolved_at = datetime.utcnow()

    # Une règle vers un achat précis n'a pas de sens (one-shot) : seule la
    # catégorie d'un nouvel achat se réapplique.
    if create_rule and rule_kind != "purchase":
        pattern = normalize_label(rule_pattern) if rule_pattern else suggest_pattern(tx.label)
        if not pattern:
            raise ValueError("Motif de règle vide.")
        tol = _tolerance(amt, "0.10")
        db.add(MatchingRule(
            user_id=user.id, account_id=tx.account_id, pattern=pattern,
            # Un abondement varie d'un mois à l'autre : seul le nom compte
            amount_min=None if rule_kind in ("ignore", "new_purchase", "contribution") else amt - tol,
            amount_max=None if rule_kind in ("ignore", "new_purchase", "contribution") else amt + tol,
            match_kind=rule_kind,
            match_id=None if rule_kind == "new_purchase" else target_id,
            contributor_user_id=contributor, category=category,
        ))
    db.commit()
    return tx


def _declarations_on_account(db: Session, kind: str, account_id: int) -> set[int]:
    if kind == "charge":
        q = db.query(Charge.id).filter(Charge.account_id == account_id)
    elif kind == "income":
        q = db.query(Income.id).filter(Income.account_id == account_id)
    elif kind == "purchase":
        q = db.query(Purchase.id).filter(Purchase.account_id == account_id)
    elif kind == "recurring_transfer":
        q = db.query(RecurringTransfer.id).filter(
            (RecurringTransfer.source_account_id == account_id) | (RecurringTransfer.dest_account_id == account_id))
    elif kind == "onetime_transfer":
        q = db.query(OneTimeTransfer.id).filter(
            (OneTimeTransfer.source_account_id == account_id) | (OneTimeTransfer.dest_account_id == account_id))
    elif kind == "saving":
        q = db.query(AutoSaving.id).filter(
            (AutoSaving.source_account_id == account_id) | (AutoSaving.dest_account_id == account_id))
    else:
        return set()
    return {r[0] for r in q.all()}


def reopen(db: Session, tx: BankTransaction) -> BankTransaction:
    tx.status = TO_REVIEW
    tx.match_kind = tx.match_id = tx.contributor_user_id = tx.rule_id = None
    tx.resolved_at = tx.resolved_by_user_id = None
    db.commit()
    return tx
