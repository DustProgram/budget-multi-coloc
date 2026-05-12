"""API Comptes bancaires - CRUD complet (filtré par user_id)."""
from datetime import datetime
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from models.base import get_db
from models import Account, AccountType, User

router = APIRouter()


class AccountCreate(BaseModel):
    bank: str
    type: AccountType
    name: str
    initial_balance: Decimal = Decimal(0)
    notes: Optional[str] = None
    is_active: bool = True
    space: str = "perso"  # 'perso' (par défaut) ou 'pro'


class AccountUpdate(BaseModel):
    bank: Optional[str] = None
    type: Optional[AccountType] = None
    name: Optional[str] = None
    initial_balance: Optional[Decimal] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None
    space: Optional[str] = None


class AccountOut(BaseModel):
    id: int
    bank: str
    type: str
    name: str
    initial_balance: Decimal
    notes: Optional[str]
    is_active: bool
    created_at: datetime
    space: str

    class Config:
        from_attributes = True


@router.get("/", response_model=list[AccountOut])
async def list_accounts(
    request: Request,
    db: Session = Depends(get_db),
    include_inactive: bool = False,
    space: Optional[str] = None,
):
    """Comptes de l'user. ?space=perso|pro pour filtrer (sinon tout)."""
    user: User = request.state.user
    q = db.query(Account).filter(Account.user_id == user.id)
    if not include_inactive:
        q = q.filter(Account.is_active.is_(True))
    if space in ("perso", "pro"):
        q = q.filter(Account.space == space)
    return q.order_by(Account.bank, Account.name).all()


@router.post("/", response_model=AccountOut, status_code=201)
async def create_account(
    request: Request,
    payload: AccountCreate,
    db: Session = Depends(get_db),
):
    user: User = request.state.user
    acc = Account(**payload.model_dump(), user_id=user.id)
    db.add(acc)
    db.commit()
    db.refresh(acc)
    return acc


@router.patch("/{account_id}", response_model=AccountOut)
async def update_account(
    account_id: int,
    request: Request,
    payload: AccountUpdate,
    db: Session = Depends(get_db),
):
    user: User = request.state.user
    acc = db.query(Account).filter(
        Account.id == account_id, Account.user_id == user.id,
    ).first()
    if not acc:
        raise HTTPException(404, "Compte introuvable")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(acc, k, v)
    db.commit()
    db.refresh(acc)
    return acc


@router.delete("/{account_id}", status_code=204)
async def delete_account(
    account_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    user: User = request.state.user
    acc = db.query(Account).filter(
        Account.id == account_id, Account.user_id == user.id,
    ).first()
    if not acc:
        raise HTTPException(404, "Compte introuvable")
    db.delete(acc)
    db.commit()
