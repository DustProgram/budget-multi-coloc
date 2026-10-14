"""Lecture locale (sans IA) des relevés PDF à colonnes Débit / Crédit.

Testé sur les relevés BRED et BoursoBank. Le texte brut d'un PDF ne dit pas
si un montant est au débit ou au crédit : on lit la position X de chaque
mot (pdfminer) et on compare au bord droit des en-têtes « Débit » / « Crédit ».
Le résultat est vérifié par le solde : ancien solde + crédits − débits doit
redonner le nouveau solde, sinon on ne fait pas confiance à la lecture.
"""
from __future__ import annotations

import io
import re
import unicodedata
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from typing import Optional

from services.statement_parsers import ParsedTx, parse_amount

_AMOUNT = re.compile(r"^\d{1,3}(?:[.  ]\d{3})*,\d{2}$")
_DATE_SHORT = re.compile(r"^(\d{2})\.(\d{2})$")              # BRED : 28.07
_DATE_VALUE = re.compile(r"^(\d{2})\.(\d{2})\.(\d{2})$")     # BRED : 28.07.26
_DATE_LONG = re.compile(r"^(\d{2})/(\d{2})/(\d{4})$")        # Bourso : 04/08/2026
_YEAR_HINT = re.compile(r"\b(20\d{2})\b")
_NOISE = [
    re.compile(r"\ble \d{2}/\d{2}/\d{2,4}\b"),
    re.compile(r"\b\d{2}/\d{2}/\d{2}\b"),
    re.compile(r"\bCB\*\d+", re.I),
    re.compile(r"\bcb[.*]\S+"),
    re.compile(r"\borigine\s*:.*", re.I),
    re.compile(r"\bmontant\s*:.*", re.I),
    re.compile(r"\bnotprovided\b", re.I),
    re.compile(r"\d{2}/\d{2}/\d{4} \d{2}:\d{2}:\d{2}.*"),
    re.compile(r"\bR.f\s*:.*", re.I),
]
_STOP = ("total des mouvements", "nouveau solde", "poste annexe", "montant frais bancaires")


@dataclass
class _Word:
    y: float
    x0: float
    x1: float
    text: str


@dataclass
class LocalStatement:
    rows: list[ParsedTx] = field(default_factory=list)
    opening: Optional[Decimal] = None
    closing: Optional[Decimal] = None
    verified: bool = False


def _fold(s: str) -> str:
    # Les PDF Bourso encodent « é » en « Ø » : on compare sans accents ni casse.
    s = s.replace("Ø", "e").replace("Ł", "e")
    return unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()


def _words(page) -> list[_Word]:
    from pdfminer.layout import LTChar, LTTextContainer, LTTextLine

    out: list[_Word] = []

    def flush(chars):
        if chars:
            out.append(_Word(round(chars[0].y0, 1), chars[0].x0, chars[-1].x1,
                             "".join(c.get_text() for c in chars)))

    for el in page:
        if not isinstance(el, LTTextContainer):
            continue
        for line in el:
            if not isinstance(line, LTTextLine):
                continue
            cur: list = []
            for ch in line:
                if isinstance(ch, LTChar) and ch.get_text().strip():
                    if cur and ch.x0 - cur[-1].x1 > 2.0:
                        flush(cur)
                        cur = []
                    cur.append(ch)
                else:
                    flush(cur)
                    cur = []
            flush(cur)
    return out


def _lines(words: list[_Word]) -> list[list[_Word]]:
    rows: list[list[_Word]] = []
    for w in sorted(words, key=lambda w: (-w.y, w.x0)):
        # 3.5 pt : chez Bourso le montant du nouveau solde est décalé de ~3 pt
        if rows and abs(rows[-1][0].y - w.y) <= 3.5:
            rows[-1].append(w)
        else:
            rows.append([w])
    return [sorted(r, key=lambda w: w.x0) for r in rows]


def _clean(text: str) -> str:
    for rx in _NOISE:
        text = rx.sub(" ", text)
    return " ".join(text.replace("/", " ").split())


def parse_pdf_columns(data: bytes) -> LocalStatement:
    from pdfminer.high_level import extract_pages

    res = LocalStatement()
    year_hint: Optional[int] = None
    current: Optional[dict] = None
    stopped = False

    def close_current():
        nonlocal current
        if current:
            label = " ".join([current["label"], *current["details"][:3]])
            res.rows.append(ParsedTx(date=current["date"], label=_clean(label)[:256] or "Opération",
                                     amount=current["amount"]))
        current = None

    for page in extract_pages(io.BytesIO(data)):
        lines = _lines(_words(page))
        if year_hint is None:
            years = [int(y) for l in lines for w in l for y in _YEAR_HINT.findall(w.text)]
            year_hint = max(years) if years else date.today().year
        debit_x1 = credit_x1 = None
        in_table = False
        for line in lines:
            folded = [_fold(w.text) for w in line]
            joined = " ".join(folded)
            if "debit" in folded and "credit" in folded:
                debit_x1 = line[folded.index("debit")].x1
                credit_x1 = line[folded.index("credit")].x1
                in_table = not stopped
                close_current()
                continue
            if not in_table:
                continue
            boundary = (debit_x1 + credit_x1) / 2
            amounts = [w for w in line if _AMOUNT.match(w.text) and w.x1 > debit_x1 - 60]

            if "solde" in joined and ("precedent" in joined or "solde au" in joined):
                if amounts and res.opening is None:
                    res.opening = parse_amount(amounts[-1].text)
                continue
            if any(s in joined for s in _STOP):
                close_current()
                if "nouveau solde" in joined:
                    nums = [w for w in line if _AMOUNT.match(w.text)]
                    if nums:
                        res.closing = parse_amount(nums[-1].text)
                if "poste annexe" in joined or "nouveau solde" in joined:
                    stopped = True
                    in_table = False
                continue

            first = line[0].text
            d = _parse_op_date(first, line, year_hint)
            if d is not None and amounts:
                close_current()
                amt_word = amounts[-1]
                value = parse_amount(amt_word.text)
                sign = -1 if amt_word.x1 < boundary else 1
                label_words = [
                    w.text for w in line[1:]
                    if w is not amt_word and not _AMOUNT.match(w.text)
                    and not _DATE_VALUE.match(w.text) and not _DATE_LONG.match(w.text)
                    and not (w.x0 > debit_x1 - 140 and re.fullmatch(r"[0-9a-zA-Z]{6,8}", w.text))
                ]
                current = {"date": d, "label": " ".join(label_words), "amount": value * sign,
                           "details": []}
            elif current is not None and line[0].x0 > 60 and not amounts:
                current["details"].append(" ".join(w.text for w in line))
        close_current()

    if res.opening is not None and res.closing is not None and res.rows:
        res.verified = res.opening + sum(r.amount for r in res.rows) == res.closing
    return res


def _parse_op_date(token: str, line: list[_Word], year_hint: int) -> Optional[date]:
    m = _DATE_LONG.match(token)
    if m:
        try:
            return date(int(m.group(3)), int(m.group(2)), int(m.group(1)))
        except ValueError:
            return None
    m = _DATE_SHORT.match(token)
    if not m:
        return None
    day, month = int(m.group(1)), int(m.group(2))
    year = year_hint
    for w in line:  # la date de valeur BRED porte l'année : 28.07.26
        v = _DATE_VALUE.match(w.text)
        if v:
            year = 2000 + int(v.group(3))
            break
    try:
        return date(year, month, day)
    except ValueError:
        return None
