"""
API Liste de courses partagée entre tous les colocs.
C'est un module collaboratif léger, accessible aussi via port externe.
"""
from datetime import datetime
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from models.base import get_db
from models import ShoppingItem, ShoppingCategory, ShoppingPriority, User

router = APIRouter()


# ============================================================
# Schémas
# ============================================================

class ShoppingItemCreate(BaseModel):
    label: str
    quantity: Optional[str] = None
    category: Optional[str] = None
    priority: ShoppingPriority = ShoppingPriority.NORMAL
    estimated_price: Optional[Decimal] = None
    notes: Optional[str] = None


class ShoppingItemUpdate(BaseModel):
    label: Optional[str] = None
    quantity: Optional[str] = None
    category: Optional[str] = None
    priority: Optional[ShoppingPriority] = None
    estimated_price: Optional[Decimal] = None
    notes: Optional[str] = None


class ShoppingItemOut(BaseModel):
    id: int
    label: str
    quantity: Optional[str] = None
    category: Optional[str] = None
    priority: str
    estimated_price: Optional[Decimal] = None
    actual_price: Optional[Decimal] = None
    is_bought: bool
    bought_at: Optional[datetime] = None
    bought_by_user_id: Optional[int] = None
    bought_by_name: Optional[str] = None
    added_by_user_id: int
    added_by_name: Optional[str] = None
    created_at: datetime
    notes: Optional[str] = None

    class Config:
        from_attributes = True


# ============================================================
# Endpoints
# ============================================================

@router.get("/", response_model=list[ShoppingItemOut])
async def list_items(
    request: Request,
    db: Session = Depends(get_db),
    show_bought: bool = False,
    category: Optional[str] = None,
):
    """Liste tous les articles (par défaut : non achetés uniquement)."""
    query = db.query(ShoppingItem)
    if not show_bought:
        query = query.filter(ShoppingItem.is_bought.is_(False))
    if category:
        query = query.filter(ShoppingItem.category == category)

    items = query.order_by(
        ShoppingItem.priority.desc(),
        ShoppingItem.created_at.desc(),
    ).all()

    result = []
    for item in items:
        out = ShoppingItemOut.model_validate(item)
        # Enrichir avec les noms
        if item.added_by:
            out.added_by_name = item.added_by.display_name or item.added_by.ha_username
        if item.bought_by:
            out.bought_by_name = item.bought_by.display_name or item.bought_by.ha_username
        result.append(out)
    return result


@router.post("/", response_model=ShoppingItemOut, status_code=201)
async def create_item(
    request: Request,
    payload: ShoppingItemCreate,
    db: Session = Depends(get_db),
):
    """Ajouter un article à la liste."""
    user: User = request.state.user
    item = ShoppingItem(
        **payload.model_dump(exclude_unset=True),
        added_by_user_id=user.id,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return _enrich(item)


@router.patch("/{item_id}", response_model=ShoppingItemOut)
async def update_item(
    item_id: int,
    payload: ShoppingItemUpdate,
    db: Session = Depends(get_db),
):
    """Modifier un article."""
    item = db.query(ShoppingItem).filter(ShoppingItem.id == item_id).first()
    if not item:
        raise HTTPException(404, "Article introuvable")

    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(item, k, v)

    db.commit()
    db.refresh(item)
    return _enrich(item)


@router.post("/{item_id}/mark-bought", response_model=ShoppingItemOut)
async def mark_as_bought(
    item_id: int,
    request: Request,
    db: Session = Depends(get_db),
    actual_price: Optional[Decimal] = None,
):
    """Cocher un article comme acheté."""
    user: User = request.state.user
    item = db.query(ShoppingItem).filter(ShoppingItem.id == item_id).first()
    if not item:
        raise HTTPException(404, "Article introuvable")

    item.is_bought = True
    item.bought_by_user_id = user.id
    item.bought_at = datetime.utcnow()
    if actual_price is not None:
        item.actual_price = actual_price

    db.commit()
    db.refresh(item)
    return _enrich(item)


@router.post("/{item_id}/uncheck", response_model=ShoppingItemOut)
async def uncheck_item(
    item_id: int,
    db: Session = Depends(get_db),
):
    """Décocher un article (au cas où erreur)."""
    item = db.query(ShoppingItem).filter(ShoppingItem.id == item_id).first()
    if not item:
        raise HTTPException(404, "Article introuvable")

    item.is_bought = False
    item.bought_by_user_id = None
    item.bought_at = None
    item.actual_price = None

    db.commit()
    db.refresh(item)
    return _enrich(item)


@router.delete("/{item_id}", status_code=204)
async def delete_item(item_id: int, db: Session = Depends(get_db)):
    item = db.query(ShoppingItem).filter(ShoppingItem.id == item_id).first()
    if not item:
        raise HTTPException(404, "Article introuvable")
    db.delete(item)
    db.commit()


@router.post("/cleanup-bought", status_code=204)
async def cleanup_bought(db: Session = Depends(get_db)):
    """Supprimer tous les articles déjà achetés (nettoyage périodique)."""
    db.query(ShoppingItem).filter(ShoppingItem.is_bought.is_(True)).delete()
    db.commit()


@router.get("/categories", response_model=list[str])
async def list_categories(db: Session = Depends(get_db)):
    cats = db.query(ShoppingCategory).order_by(ShoppingCategory.order).all()
    if not cats:
        # Defaults
        return ["Frais", "Sec", "Surgelé", "Hygiène", "Maison", "Boisson", "Autre"]
    return [c.label for c in cats]


def _enrich(item: ShoppingItem) -> ShoppingItemOut:
    out = ShoppingItemOut.model_validate(item)
    if item.added_by:
        out.added_by_name = item.added_by.display_name or item.added_by.ha_username
    if item.bought_by:
        out.bought_by_name = item.bought_by.display_name or item.bought_by.ha_username
    return out
