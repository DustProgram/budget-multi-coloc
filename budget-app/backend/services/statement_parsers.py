"""Lecture des relevés bancaires : CSV (exports FR type BRED), OFX, PDF.

CSV et OFX sont parsés localement. Le PDF (ex : Sumeria, qui n'exporte
qu'en PDF) passe par extraction de texte puis par le LLM.
"""
from __future__ import annotations

import csv
import io
import json
import re
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from typing import Optional


class StatementParseError(ValueError):
    pass


@dataclass
class ParsedTx:
    date: date
    label: str
    amount: Decimal
    external_id: Optional[str] = None  # FITID OFX


def _decode(data: bytes) -> str:
    for enc in ("utf-8-sig", "cp1252", "latin-1"):
        try:
            return data.decode(enc)
        except UnicodeDecodeError:
            continue
    raise StatementParseError("Encodage du fichier illisible.")


def parse_amount(raw: str) -> Optional[Decimal]:
    s = (raw or "").strip().replace(" ", "").replace(" ", "").replace(" ", "")
    s = s.replace("€", "").replace("EUR", "")
    if not s:
        return None
    neg = s.startswith("(") and s.endswith(")")
    s = s.strip("()+")
    # "1.234,56" ou "1234,56" → format FR ; "1,234.56" → format EN
    if "," in s and "." in s:
        if s.rfind(",") > s.rfind("."):
            s = s.replace(".", "").replace(",", ".")
        else:
            s = s.replace(",", "")
    else:
        s = s.replace(",", ".")
    try:
        v = Decimal(s)
    except InvalidOperation:
        return None
    return -v if neg else v


def parse_date(raw: str) -> Optional[date]:
    raw = (raw or "").strip()
    for fmt in ("%d/%m/%Y", "%d/%m/%y", "%Y-%m-%d", "%d-%m-%Y", "%d.%m.%Y", "%Y%m%d"):
        try:
            return datetime.strptime(raw[:10] if fmt != "%d/%m/%y" else raw[:8], fmt).date()
        except ValueError:
            continue
    return None


def _norm_header(h: str) -> str:
    h = h.strip().lower()
    for a, b in (("é", "e"), ("è", "e"), ("ê", "e"), ("ô", "o"), ("û", "u")):
        h = h.replace(a, b)
    return h


def parse_csv(data: bytes) -> list[ParsedTx]:
    text = _decode(data)
    lines = [l for l in text.splitlines() if l.strip()]
    if not lines:
        raise StatementParseError("Fichier vide.")
    delim = ";" if sum(l.count(";") for l in lines[:10]) >= sum(l.count(",") for l in lines[:10]) else ","

    rows = list(csv.reader(lines, delimiter=delim))
    # Les exports bancaires ont souvent quelques lignes d'en-tête (n° de compte,
    # solde…) avant la vraie ligne de titres : on cherche celle qui a "date".
    header_idx = next(
        (i for i, r in enumerate(rows[:30]) if any(_norm_header(c).startswith("date") for c in r)),
        None,
    )
    if header_idx is None:
        raise StatementParseError("Colonne 'Date' introuvable dans le CSV.")
    header = [_norm_header(c) for c in rows[header_idx]]

    def col(*names: str) -> Optional[int]:
        for n in names:
            for i, h in enumerate(header):
                if h == n or h.startswith(n):
                    return i
        return None

    i_date = col("date operation", "date de l'operation", "date comptable", "date")
    i_label = col("libelle", "libelle operation", "description", "intitule", "detail")
    i_amount = col("montant", "amount", "somme")
    i_debit = col("debit")
    i_credit = col("credit")
    if i_date is None or i_label is None or (i_amount is None and i_debit is None and i_credit is None):
        raise StatementParseError(
            "Colonnes attendues : Date, Libellé et Montant (ou Débit/Crédit). "
            f"Trouvées : {', '.join(rows[header_idx])}"
        )

    out: list[ParsedTx] = []
    for r in rows[header_idx + 1:]:
        if len(r) <= max(x for x in (i_date, i_label) if x is not None):
            continue
        d = parse_date(r[i_date])
        if d is None:
            continue
        if i_amount is not None and i_amount < len(r) and r[i_amount].strip():
            amt = parse_amount(r[i_amount])
        else:
            debit = parse_amount(r[i_debit]) if i_debit is not None and i_debit < len(r) else None
            credit = parse_amount(r[i_credit]) if i_credit is not None and i_credit < len(r) else None
            amt = (credit or Decimal(0)) - abs(debit or Decimal(0))
            if debit is None and credit is None:
                amt = None
        if amt is None or amt == 0:
            continue
        label = " ".join(r[i_label].split())
        out.append(ParsedTx(date=d, label=label[:256], amount=amt.quantize(Decimal("0.01"))))
    if not out:
        raise StatementParseError("Aucune opération lisible dans le CSV.")
    return out


_OFX_TX = re.compile(r"<STMTTRN>(.*?)(?:</STMTTRN>|(?=<STMTTRN>)|(?=</BANKTRANLIST>))", re.S | re.I)


def _ofx_field(block: str, name: str) -> Optional[str]:
    m = re.search(rf"<{name}>([^<\r\n]*)", block, re.I)
    return m.group(1).strip() if m else None


def parse_ofx(data: bytes) -> list[ParsedTx]:
    text = _decode(data)
    out: list[ParsedTx] = []
    for block in _OFX_TX.findall(text):
        d = parse_date((_ofx_field(block, "DTPOSTED") or "")[:8])
        amt = parse_amount(_ofx_field(block, "TRNAMT") or "")
        if d is None or amt is None or amt == 0:
            continue
        name = _ofx_field(block, "NAME") or ""
        memo = _ofx_field(block, "MEMO") or ""
        label = " ".join(f"{name} {memo}".split()) if memo and memo not in name else name
        out.append(ParsedTx(
            date=d, label=(label or "Opération")[:256],
            amount=amt.quantize(Decimal("0.01")),
            external_id=_ofx_field(block, "FITID"),
        ))
    if not out:
        raise StatementParseError("Aucune opération trouvée dans le fichier OFX.")
    return out


def pdf_to_text(data: bytes) -> str:
    from pypdf import PdfReader
    try:
        reader = PdfReader(io.BytesIO(data))
        text = "\n".join((p.extract_text() or "") for p in reader.pages)
    except Exception as e:  # pypdf lève des types variés sur PDF corrompu
        raise StatementParseError(f"PDF illisible : {e}")
    if len(text.strip()) < 20:
        raise StatementParseError("PDF sans texte (scan ?) : envoie plutôt une photo ou un CSV.")
    return text


STATEMENT_TEXT_PROMPT = (
    "Tu reçois le texte brut d'un relevé bancaire français. Pour CHAQUE opération, "
    "extrais la date, le libellé complet et le montant signé (négatif = débit/sortie, "
    "positif = crédit/entrée). Ignore les soldes, totaux et lignes d'en-tête. "
    "Retourne UNIQUEMENT un JSON valide : "
    '{"transactions": [{"date": "YYYY-MM-DD", "label": "...", "amount": -42.50}]}'
)


def rows_from_llm_json(raw: str | dict) -> list[ParsedTx]:
    if isinstance(raw, str):
        txt = raw.strip()
        if txt.startswith("```"):
            txt = txt.split("```", 2)[1].removeprefix("json").strip("` \n")
        try:
            raw = json.loads(txt)
        except json.JSONDecodeError as e:
            raise StatementParseError(f"Réponse IA non parsable : {e}")
    out = []
    for t in (raw or {}).get("transactions", []) or []:
        d = parse_date(str(t.get("date") or ""))
        try:
            amt = Decimal(str(t.get("amount")))
        except (InvalidOperation, TypeError):
            continue
        if d is None or amt == 0:
            continue
        out.append(ParsedTx(date=d, label=str(t.get("label") or "Opération")[:256],
                            amount=amt.quantize(Decimal("0.01"))))
    if not out:
        raise StatementParseError("L'IA n'a trouvé aucune opération dans ce relevé.")
    return out
