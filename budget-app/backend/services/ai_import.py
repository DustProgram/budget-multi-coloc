"""Import auto via Claude Vision : analyse d'images (tickets, factures, relevés).

Flux :
  1. Frontend upload une image (base64) + type
  2. analyze_image() envoie l'image à Claude Haiku avec un prompt structuré
  3. Claude renvoie un JSON décrivant l'achat / la charge / les transactions
  4. Frontend affiche le preview, l'utilisateur valide
  5. commit_import() persiste les entités et crée un ImportBatch lié

Modèle Claude : claude-haiku-4-5 (vision + texte). Coût ~0.5¢ par ticket.
"""
from __future__ import annotations

import base64
import hashlib
import json
import logging
from datetime import date as DateType, datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy.orm import Session

from models import (
    Charge, ImportBatch, ImportedEntity, OneTimeTransfer, PaymentMethod,
    Purchase, User,
)
from services.access import user_can_write_account
from services.ai_chat import AIChatError
from services.llm_client import LLMError, get_llm_client, is_llm_available

logger = logging.getLogger(__name__)


SYSTEM_PROMPTS = {
    "ticket": (
        "Tu analyses des tickets de caisse français. Extrais les informations "
        "et retourne UNIQUEMENT un JSON valide (pas de texte autour) au format :\n"
        '{"type": "ticket", "marchand": "...", "date": "YYYY-MM-DD", '
        '"total": 47.32, "categorie": "Alimentation", "items": '
        '[{"label": "...", "amount": 1.23}, ...]}\n'
        "Si la date n'est pas lisible, mets null. Categorie possible : Alimentation, "
        "Restaurants, Maison, Tech, Loisirs, Transport, Santé, Vêtements, Autre."
    ),
    "invoice": (
        "Tu analyses une facture / quittance (loyer, EDF, internet, abonnement). "
        "Retourne UNIQUEMENT un JSON valide :\n"
        '{"type": "invoice", "fournisseur": "...", "date": "YYYY-MM-DD", '
        '"total": 850.00, "categorie": "Logement", "is_recurring": true, '
        '"frequency": "Mensuelle", "day_of_month": 5}\n'
        "is_recurring=true si c'est manifestement une charge mensuelle/trimestrielle."
    ),
    "statement": (
        "Tu analyses un relevé bancaire (papier ou capture). Pour CHAQUE ligne "
        "de transaction, extrais date + libellé + montant signé. Retourne :\n"
        '{"type": "statement", "transactions": [{"date": "YYYY-MM-DD", '
        '"label": "...", "amount": -42.50}, ...]}\n'
        "Montant négatif = sortie, positif = entrée. Ignore les soldes."
    ),
}


def _hash_signature(date_iso: str, amount: Decimal, marchand: str) -> str:
    """Hash de dédup : si on importe 2× le même ticket, on s'en aperçoit."""
    raw = f"{date_iso}|{amount}|{(marchand or '').lower().strip()}"
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


def analyze_image(image_b64: str, mime_type: str, source_type: str) -> dict:
    """Envoie l'image au LLM configuré (Anthropic/OpenAI/Gemini) et retourne
    le JSON parsé.

    image_b64 : contenu base64 SANS le préfixe "data:..."
    mime_type : "image/jpeg" | "image/png" | "image/webp"
    """
    if not is_llm_available():
        raise AIChatError(
            "Pas de clé LLM configurée. Renseigne llm_api_key dans Paramètres > Add-on."
        )
    if source_type not in SYSTEM_PROMPTS:
        raise AIChatError(f"Type d'import inconnu : {source_type}")
    try:
        client = get_llm_client()
    except LLMError as e:
        raise AIChatError(str(e))
    try:
        text = client.vision(
            image_b64=image_b64,
            mime_type=mime_type,
            prompt="Analyse cette image et renvoie le JSON demandé.",
            system=SYSTEM_PROMPTS[source_type],
            max_tokens=1024,
        )
    except LLMError as e:
        logger.exception("Vision error")
        raise AIChatError(str(e))
    # Claude peut wrap dans ```json ... ``` malgré l'instruction
    if text.startswith("```"):
        text = text.split("```", 2)[1]
        if text.startswith("json"):
            text = text[4:]
        text = text.strip("` \n")
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError as e:
        raise AIChatError(f"Réponse Claude non parsable : {e}\nRaw: {text[:300]}")
    return parsed


def _find_duplicate_purchase(
    db: Session, user_id: int, date_: DateType, amount: Decimal, description: str,
) -> Optional[Purchase]:
    return (
        db.query(Purchase)
        .filter(
            Purchase.user_id == user_id,
            Purchase.date == date_,
            Purchase.total_amount == amount,
            Purchase.description.ilike(f"%{description.split()[0]}%"),
        )
        .first()
    )


def commit_import(
    db: Session,
    user: User,
    source_type: str,
    parsed: dict,
    edits: Optional[dict] = None,
    default_account_id: Optional[int] = None,
) -> ImportBatch:
    """Crée les entités correspondant au JSON Claude (potentiellement édité par
    l'utilisateur dans `edits`). Retourne le batch créé.

    edits : dict de surcharges utilisateur ex {date, total, categorie, account_id}
    """
    edits = edits or {}
    batch = ImportBatch(
        user_id=user.id,
        source_type=source_type,
        raw_response=json.dumps(parsed, default=str),
        summary="(import en cours)",
        status="committed",
    )
    db.add(batch)
    db.flush()

    summary_bits: list[str] = []

    if source_type == "ticket":
        marchand = str(edits.get("marchand") or parsed.get("marchand") or "Ticket").strip()
        date_str = edits.get("date") or parsed.get("date") or datetime.utcnow().date().isoformat()
        try:
            d = datetime.strptime(date_str, "%Y-%m-%d").date()
        except (ValueError, TypeError):
            d = datetime.utcnow().date()
        total = Decimal(str(edits.get("total") or parsed.get("total") or 0))
        category = edits.get("categorie") or parsed.get("categorie")
        account_id = int(edits.get("account_id") or default_account_id or 0) or None
        if account_id and not user_can_write_account(db, user.id, account_id):
            raise AIChatError(f"Pas le droit d'écrire sur le compte {account_id}")
        # Dédup : si un Purchase identique existe, on bloque
        dup = _find_duplicate_purchase(db, user.id, d, total, marchand)
        if dup and not edits.get("force_duplicate"):
            db.delete(batch)
            db.commit()
            raise AIChatError(
                f"Doublon détecté : un achat identique existe déjà ({marchand} {total}€ le {d}). "
                "Coche 'Forcer même si doublon' pour l'importer quand même."
            )
        p = Purchase(
            user_id=user.id, date=d, description=marchand,
            total_amount=total, nb_installments=1,
            category=category, payment_method=PaymentMethod.CB,
            account_id=account_id,
        )
        db.add(p)
        db.flush()
        db.add(ImportedEntity(batch_id=batch.id, entity_type="purchase", entity_id=p.id))
        summary_bits.append(f"{marchand} {total}€")

    elif source_type == "invoice":
        label = str(edits.get("fournisseur") or parsed.get("fournisseur") or "Facture").strip()
        date_str = edits.get("date") or parsed.get("date") or datetime.utcnow().date().isoformat()
        try:
            d = datetime.strptime(date_str, "%Y-%m-%d").date()
        except (ValueError, TypeError):
            d = datetime.utcnow().date()
        total = Decimal(str(edits.get("total") or parsed.get("total") or 0))
        account_id = int(edits.get("account_id") or default_account_id or 0) or None
        if account_id and not user_can_write_account(db, user.id, account_id):
            raise AIChatError(f"Pas le droit d'écrire sur le compte {account_id}")
        is_recurring = bool(edits.get("is_recurring", parsed.get("is_recurring", False)))
        if is_recurring:
            from models import Frequency, SplitMode
            ch = Charge(
                label=label, total_amount=total,
                day_of_month=int(edits.get("day_of_month") or parsed.get("day_of_month") or d.day),
                frequency=Frequency.MENSUELLE,
                split_mode=SplitMode.PERSO,
                num_colocs=1, account_id=account_id,
                user_id=user.id,
            )
            db.add(ch)
            db.flush()
            db.add(ImportedEntity(batch_id=batch.id, entity_type="charge", entity_id=ch.id))
            summary_bits.append(f"Charge {label} {total}€/mois")
        else:
            # Facture ponctuelle → Purchase
            p = Purchase(
                user_id=user.id, date=d, description=label,
                total_amount=total, nb_installments=1,
                category=edits.get("categorie") or parsed.get("categorie"),
                payment_method=PaymentMethod.PRELEVEMENT,
                account_id=account_id,
            )
            db.add(p)
            db.flush()
            db.add(ImportedEntity(batch_id=batch.id, entity_type="purchase", entity_id=p.id))
            summary_bits.append(f"Facture {label} {total}€")

    elif source_type == "statement":
        # Pour chaque transaction → OneTimeTransfer si interne sinon Purchase
        # V1 simple : tout va dans Purchase (négatif) ou ignoré (positif)
        txs = parsed.get("transactions", [])
        account_id = int(edits.get("account_id") or default_account_id or 0) or None
        if account_id and not user_can_write_account(db, user.id, account_id):
            raise AIChatError(f"Pas le droit d'écrire sur le compte {account_id}")
        kept = 0
        for tx in txs:
            try:
                amount = Decimal(str(tx.get("amount", 0)))
                if amount >= 0:
                    continue  # on ignore les entrées pour V1
                d = datetime.strptime(str(tx["date"]), "%Y-%m-%d").date()
                label = str(tx.get("label") or "Transaction").strip()
                dup = _find_duplicate_purchase(db, user.id, d, abs(amount), label)
                if dup:
                    continue
                p = Purchase(
                    user_id=user.id, date=d, description=label,
                    total_amount=abs(amount), nb_installments=1,
                    payment_method=PaymentMethod.CB,
                    account_id=account_id,
                )
                db.add(p)
                db.flush()
                db.add(ImportedEntity(batch_id=batch.id, entity_type="purchase", entity_id=p.id))
                kept += 1
            except Exception as e:
                logger.warning("Skip transaction (%s): %s", tx, e)
        summary_bits.append(f"{kept} transactions")

    else:
        db.delete(batch)
        db.commit()
        raise AIChatError(f"source_type inconnu : {source_type}")

    batch.summary = " · ".join(summary_bits) or f"Import {source_type}"
    db.commit()
    db.refresh(batch)
    return batch


def undo_batch(db: Session, user: User, batch_id: int) -> ImportBatch:
    batch = db.query(ImportBatch).filter(
        ImportBatch.id == batch_id, ImportBatch.user_id == user.id,
    ).first()
    if not batch:
        raise AIChatError("Batch introuvable")
    if batch.status != "committed":
        raise AIChatError(f"Batch déjà en status '{batch.status}'")

    entities = db.query(ImportedEntity).filter(
        ImportedEntity.batch_id == batch.id,
    ).all()
    model_map = {
        "purchase": Purchase,
        "charge": Charge,
        "onetime_transfer": OneTimeTransfer,
    }
    deleted = 0
    for e in entities:
        Model = model_map.get(e.entity_type)
        if not Model:
            continue
        obj = db.query(Model).filter(Model.id == e.entity_id).first()
        if obj:
            db.delete(obj)
            deleted += 1
    batch.status = "undone"
    batch.undone_at = datetime.utcnow()
    db.commit()
    db.refresh(batch)
    logger.info("Undid batch %s : %d entities deleted", batch.id, deleted)
    return batch
