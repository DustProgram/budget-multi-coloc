"""API Récap colocation - répartition des charges partagées et PDF.

Ressource partagée entre tous les colocs (pas de filtrage par user_id).
"""
import tempfile
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from models.base import get_db
from services.coloc_split import compute_coloc_breakdown, generate_coloc_pdf

router = APIRouter()


def _serialize(data: dict) -> dict:
    """Convertit les dataclasses en dict JSON-serializable."""
    return {
        "charges_lines": [
            {
                "charge_id": l.charge_id,
                "label": l.label,
                "total": l.total,
                "per_person": l.per_person,
                "split_mode": l.split_mode,
                "payer_user_id": l.payer_user_id,
            }
            for l in data["charges_lines"]
        ],
        "summaries": [
            {
                "year": s.year,
                "month": s.month,
                "user_id": s.user_id,
                "user_name": s.user_name,
                "total_due": s.total_due,
                "by_charge": [
                    {
                        "charge_id": l.charge_id,
                        "label": l.label,
                        "total": l.total,
                        "split_mode": l.split_mode,
                        "my_share": l.per_person.get(s.user_id),
                    }
                    for l in s.by_charge
                ],
                "owes_to": s.owes_to,
            }
            for s in data["summaries"]
        ],
        "debts": data["debts"],
    }


@router.get("/breakdown")
async def get_breakdown(
    request: Request,
    year: int = Query(...),
    month: int = Query(..., ge=1, le=12),
    db: Session = Depends(get_db),
):
    """Répartition complète des charges partagées pour (year, month)."""
    return _serialize(compute_coloc_breakdown(db, year, month))


@router.get("/pdf")
async def get_pdf(
    request: Request,
    year: int = Query(...),
    month: int = Query(..., ge=1, le=12),
    user_id: int = Query(...),
    db: Session = Depends(get_db),
):
    """Génère le PDF récap du mois pour un coloc donné."""
    data = compute_coloc_breakdown(db, year, month)
    summary = next((s for s in data["summaries"] if s.user_id == user_id), None)
    if not summary:
        raise HTTPException(404, "Coloc introuvable pour ce mois")

    output = Path(tempfile.gettempdir()) / f"coloc_{user_id}_{year}_{month:02d}.pdf"
    generate_coloc_pdf(summary, output)
    return FileResponse(
        path=output,
        media_type="application/pdf",
        filename=f"coloc_{year}_{month:02d}.pdf",
    )
