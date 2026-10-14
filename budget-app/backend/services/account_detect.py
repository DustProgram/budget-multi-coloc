"""Reconnaît le compte d'un relevé par son numéro de compte (IBAN, ACCTID OFX).

Le numéro est appris au premier import fait en choisissant le compte : ensuite
on peut déposer tous les relevés d'un coup, chacun part sur le bon compte.
"""
from __future__ import annotations

import re
from typing import Optional

from sqlalchemy.orm import Session

from models import Account
from services.access import accessible_account_ids, user_can_write_account

# Lookahead : une fausse piste (« FR12 » dans un libellé) ne masque pas l'IBAN qui suit
_IBAN_FR = re.compile(r"(?=(F\s?R(?:\s?\d){2}(?:\s?[0-9A-Z]){23}))")
_OFX_ACCTID = re.compile(r"<ACCTID>\s*([0-9A-Z]{5,34})", re.I)
# CSV : « Numéro de compte ; 00012345678 » ou « Compte n° 00012345678 »
_CSV_ACCOUNT = re.compile(r"compte[^0-9\n]{0,20}(\d{11})(?!\d)", re.I)


def _iban_ok(iban: str) -> bool:
    s = iban[4:] + iban[:4]
    digits = "".join(str(int(c, 36)) for c in s)
    return int(digits) % 97 == 1


def _text(filename: str, data: bytes) -> str:
    name = (filename or "").lower()
    if name.endswith(".pdf") or data[:5] == b"%PDF-":
        from services.statement_parsers import pdf_to_text
        try:
            return pdf_to_text(data)
        except Exception:
            return ""
    for enc in ("utf-8", "cp1252", "latin-1"):
        try:
            return data[:200_000].decode(enc)
        except UnicodeDecodeError:
            continue
    return ""


def statement_refs(filename: str, data: bytes) -> list[str]:
    """Numéros de compte (11 caractères) trouvés, dans l'ordre d'apparition.
    Le premier est en général celui de l'en-tête du relevé."""
    text = _text(filename, data)
    refs: list[str] = []
    for m in _IBAN_FR.finditer(text.upper()):
        iban = re.sub(r"\s", "", m.group(1))
        if _iban_ok(iban):
            refs.append(iban[14:25])
    for m in _OFX_ACCTID.finditer(text):
        refs.append(m.group(1).upper()[:11])
    for m in _CSV_ACCOUNT.finditer(text[:3000]):
        refs.append(m.group(1))
    return list(dict.fromkeys(refs))


def find_account(db: Session, user_id: int, refs: list[str]) -> Optional[Account]:
    """Le compte connu cité en premier dans le relevé (les IBAN des virements
    viennent après l'en-tête)."""
    if not refs:
        return None
    ids = accessible_account_ids(db, user_id)
    known = {
        a.statement_ref: a for a in db.query(Account).filter(
            Account.id.in_(ids), Account.statement_ref.isnot(None),
        ).all()
    }
    for ref in refs:
        acc = known.get(ref)
        if acc and user_can_write_account(db, user_id, acc.id):
            return acc
    return None


def learn(db: Session, account: Account, refs: list[str]) -> Optional[str]:
    """Retient le numéro du compte choisi à la main. Retourne un avertissement
    si le relevé semble appartenir à un autre compte déjà connu."""
    if not refs:
        return None
    if account.statement_ref:
        if account.statement_ref in refs:
            return None
        other = db.query(Account).filter(
            Account.statement_ref == refs[0], Account.id != account.id,
        ).first()
        if other:
            return f"Ce relevé ressemble à celui du compte « {other.name} » : vérifie le compte choisi."
        return None
    taken = db.query(Account).filter(Account.statement_ref == refs[0]).first()
    if taken is None:
        account.statement_ref = refs[0]
    return None
