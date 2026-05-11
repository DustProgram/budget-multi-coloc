"""
Stubs des endpoints API.
À compléter avec Claude Code en suivant le pattern de shopping.py
"""
from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from models.base import get_db

router = APIRouter()


@router.get("/")
async def list_(request: Request, db: Session = Depends(get_db)):
    """TODO : implémenter par Claude Code en s'inspirant de shopping.py"""
    return []


@router.post("/")
async def create(request: Request, db: Session = Depends(get_db)):
    """TODO"""
    pass


@router.patch("/{item_id}")
async def update(item_id: int, request: Request, db: Session = Depends(get_db)):
    """TODO"""
    pass


@router.delete("/{item_id}")
async def delete(item_id: int, db: Session = Depends(get_db)):
    """TODO"""
    pass
