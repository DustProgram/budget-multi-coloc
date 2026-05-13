"""API Bulk import via Excel/CSV — sans IA, validation locale.

  GET  /bulk-import/template               → télécharge le template Excel
  POST /bulk-import/preview                → upload fichier, retourne parsed+validé
  POST /bulk-import/commit                 → applique avec résolutions optionnelles
"""
import logging
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from models import ImportBatch, User
from models.base import get_db
from services import bulk_import as svc

router = APIRouter()
logger = logging.getLogger(__name__)

MAX_BYTES = 5 * 1024 * 1024  # 5 MB


@router.get("/template")
async def download_template(request: Request):
    _user: User = request.state.user  # noqa: F841 (auth required)
    content = svc.generate_template()
    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": 'attachment; filename="budget_template.xlsx"',
        },
    )


class CommitIn(BaseModel):
    parsed: dict
    resolutions: Optional[dict] = None


class BatchOut(BaseModel):
    id: int
    source_type: str
    summary: Optional[str]
    status: str
    created_at: str


@router.post("/preview")
async def preview(
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    user: User = request.state.user
    data = await file.read()
    if len(data) > MAX_BYTES:
        raise HTTPException(413, f"Fichier trop volumineux (max {MAX_BYTES} octets)")
    try:
        parsed = svc.parse_workbook(data, file.filename or "")
    except Exception as e:
        logger.exception("Parse error")
        raise HTTPException(400, f"Impossible de lire le fichier : {e}")
    parsed = svc.validate(parsed, db, user)
    return parsed.to_dict()


@router.post("/commit", response_model=BatchOut)
async def commit(
    payload: CommitIn,
    request: Request,
    db: Session = Depends(get_db),
):
    user: User = request.state.user
    parsed = svc.ParsedImport.from_dict(payload.parsed)
    # On revalide pour empêcher un client de bypasser les checks
    parsed = svc.validate(parsed, db, user)
    batch = svc.commit_parsed(db, user, parsed, payload.resolutions or {})
    return BatchOut(
        id=batch.id,
        source_type=batch.source_type,
        summary=batch.summary,
        status=batch.status,
        created_at=batch.created_at.isoformat() if batch.created_at else "",
    )
