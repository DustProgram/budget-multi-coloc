"""Choisit le bon parseur selon le fichier reçu (app, agent ou n8n)."""
from __future__ import annotations

import base64
import logging
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Optional

from sqlalchemy.orm import Session

from services.ai_chat import AIChatError
from services.llm_client import (
    LLMError, RateLimitError, check_rate_limits, get_llm_client, is_llm_available, record_usage,
)
from services.statement_parsers import (
    STATEMENT_TEXT_PROMPT, ParsedTx, StatementParseError,
    parse_csv, parse_ofx, pdf_to_text, rows_from_llm_json,
)

logger = logging.getLogger(__name__)

MAX_STATEMENT_BYTES = 10 * 1024 * 1024


@dataclass
class StatementMeta:
    opening: Optional[Decimal] = None
    closing: Optional[Decimal] = None
    verified: bool = False
    warnings: list[str] = field(default_factory=list)


IMAGE_MIMES = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}


def parse_statement(db: Session, user_id: int, filename: str, data: bytes) -> tuple[list[ParsedTx], str]:
    """Retourne (lignes, source). Lève StatementParseError avec un message lisible."""
    rows, source, _ = parse_statement_with_meta(db, user_id, filename, data)
    return rows, source


def parse_statement_with_meta(
    db: Session, user_id: int, filename: str, data: bytes,
) -> tuple[list[ParsedTx], str, StatementMeta]:
    if len(data) > MAX_STATEMENT_BYTES:
        raise StatementParseError("Fichier trop volumineux (max 10 Mo).")
    name = (filename or "").lower()
    ext = name[name.rfind("."):] if "." in name else ""

    meta = StatementMeta()
    if ext in (".csv", ".txt"):
        return parse_csv(data), "csv", meta
    if ext in (".ofx", ".qfx"):
        return parse_ofx(data), "ofx", meta
    if ext == ".pdf" or data[:5] == b"%PDF-":
        return _parse_pdf(db, user_id, data, meta)
    if ext in IMAGE_MIMES:
        return _with_llm(db, user_id, image=data, mime=IMAGE_MIMES[ext]), "image", meta
    if b"<OFX>" in data[:2000].upper():
        return parse_ofx(data), "ofx", meta
    return parse_csv(data), "csv", meta


def _parse_pdf(db: Session, user_id: int, data: bytes, meta: StatementMeta):
    """PDF à colonnes Débit/Crédit (BRED, BoursoBank…) lu localement et vérifié
    par le solde ; l'IA ne sert qu'en secours."""
    from services.pdf_statements import parse_pdf_columns
    try:
        local = parse_pdf_columns(data)
    except Exception:  # pdfminer lève des types variés sur un PDF exotique
        logger.exception("Lecture locale du PDF impossible")
        local = None
    if local and local.rows:
        meta.opening, meta.closing, meta.verified = local.opening, local.closing, local.verified
        if local.verified:
            return local.rows, "pdf", meta
    if is_llm_available():
        return _with_llm(db, user_id, text=pdf_to_text(data)), "pdf-ia", meta
    if local and local.rows:
        meta.warnings.append(
            "Relevé lu sans pouvoir vérifier le solde : contrôle les montants, ou configure l'IA."
        )
        return local.rows, "pdf", meta
    return _with_llm(db, user_id, text=pdf_to_text(data)), "pdf-ia", meta


def _with_llm(db: Session, user_id: int, text: str | None = None,
              image: bytes | None = None, mime: str = "") -> list[ParsedTx]:
    if not is_llm_available():
        raise StatementParseError(
            "Lire un PDF ou une photo de relevé demande l'IA (Réglages → Provider LLM). "
            "Sinon, exporte le relevé en CSV ou OFX depuis l'espace bancaire."
        )
    try:
        check_rate_limits(db)
        client = get_llm_client()
        if image is not None:
            from services.ai_import import analyze_image
            return rows_from_llm_json(analyze_image(
                base64.b64encode(image).decode(), mime, "statement", db=db, user_id=user_id,
            ))
        resp = client.chat(
            messages=[{"role": "user", "content": text[:60000]}],
            system=STATEMENT_TEXT_PROMPT, max_tokens=8000,
        )
        record_usage(db, user_id, resp, kind="statement")
        return rows_from_llm_json(resp.text or "")
    except (LLMError, RateLimitError, AIChatError) as e:
        raise StatementParseError(f"Erreur IA : {e}")
