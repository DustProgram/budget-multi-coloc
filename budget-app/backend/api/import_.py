"""API Import auto via Claude Vision.

  POST /import/analyze   — analyse une image, renvoie le JSON Claude (preview)
  POST /import/commit    — persiste le résultat (avec édits éventuels)
  GET  /import/batches   — liste les imports récents
  POST /import/batches/{id}/undo — annule un import
"""
import base64
import logging
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from pydantic import BaseModel
from sqlalchemy.orm import Session

from models import ImportBatch, User
from models.base import get_db
from services import ai_import
from services.ai_chat import AIChatError

router = APIRouter()
logger = logging.getLogger(__name__)

ALLOWED_MIME = {"image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic"}
MAX_BYTES = 8 * 1024 * 1024  # 8 MB — Claude accepte jusqu'à 5MB encodé b64


class CommitIn(BaseModel):
    source_type: str
    parsed: dict
    edits: Optional[dict] = None
    default_account_id: Optional[int] = None


class BatchOut(BaseModel):
    id: int
    source_type: str
    summary: Optional[str]
    status: str
    created_at: str
    undone_at: Optional[str]

    class Config:
        from_attributes = True


@router.post("/analyze")
async def analyze(
    request: Request,
    source_type: str = Form(...),
    image: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    _user: User = request.state.user  # noqa: F841  — auth requise (middleware)
    if image.content_type not in ALLOWED_MIME:
        raise HTTPException(400, f"Type d'image non supporté : {image.content_type}")
    data = await image.read()
    if len(data) > MAX_BYTES:
        raise HTTPException(413, f"Image trop volumineuse ({len(data)} octets, max {MAX_BYTES})")
    b64 = base64.b64encode(data).decode()
    mime = image.content_type
    if mime == "image/jpg":
        mime = "image/jpeg"
    try:
        parsed = ai_import.analyze_image(b64, mime, source_type)
    except AIChatError as e:
        raise HTTPException(503, str(e))
    return {"source_type": source_type, "parsed": parsed}


@router.post("/commit", response_model=BatchOut)
async def commit(
    request: Request,
    payload: CommitIn,
    db: Session = Depends(get_db),
):
    user: User = request.state.user
    try:
        batch = ai_import.commit_import(
            db, user,
            source_type=payload.source_type,
            parsed=payload.parsed,
            edits=payload.edits,
            default_account_id=payload.default_account_id,
        )
    except AIChatError as e:
        raise HTTPException(400, str(e))
    return _serialize_batch(batch)


@router.get("/batches", response_model=list[BatchOut])
async def list_batches(
    request: Request,
    db: Session = Depends(get_db),
    limit: int = 30,
):
    user: User = request.state.user
    rows = (
        db.query(ImportBatch)
        .filter(ImportBatch.user_id == user.id)
        .order_by(ImportBatch.id.desc())
        .limit(limit)
        .all()
    )
    return [_serialize_batch(b) for b in rows]


@router.post("/batches/{batch_id}/undo", response_model=BatchOut)
async def undo(
    batch_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    user: User = request.state.user
    try:
        batch = ai_import.undo_batch(db, user, batch_id)
    except AIChatError as e:
        raise HTTPException(400, str(e))
    return _serialize_batch(batch)


def _serialize_batch(b: ImportBatch) -> dict:
    return {
        "id": b.id,
        "source_type": b.source_type,
        "summary": b.summary,
        "status": b.status,
        "created_at": b.created_at.isoformat() if b.created_at else "",
        "undone_at": b.undone_at.isoformat() if b.undone_at else None,
    }
