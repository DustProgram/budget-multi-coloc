"""Relevés bancaires : import, boîte « À valider », règles apprises."""
from datetime import date
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from pydantic import BaseModel
from sqlalchemy.orm import Session

from models import Account, BankTransaction, MatchingRule, User
from models.base import get_db
from services import reconciliation as rec
from services.access import accessible_account_ids, user_can_write_account
from services.bank_import import parse_statement
from services.statement_parsers import StatementParseError

router = APIRouter()


class ImportOut(BaseModel):
    imported: int
    duplicates: int
    matched: int
    to_review: int


class OptionOut(BaseModel):
    key: str
    label: str


class TxOut(BaseModel):
    id: int
    account_id: int
    account_name: str
    date: date
    amount: Decimal
    label: str
    source: str
    status: str
    match_kind: Optional[str]
    match_id: Optional[int]
    contributor_user_id: Optional[int]
    rule_id: Optional[int]
    question: Optional[str] = None
    options: list[OptionOut] = []
    suggested_pattern: Optional[str] = None


class ResolveIn(BaseModel):
    option: str                      # clé renvoyée dans `options` (ex: "charge:12", "new_purchase")
    category: Optional[str] = None   # pour new_purchase
    label: Optional[str] = None      # pour new_charge / new_income
    create_rule: bool = False
    rule_pattern: Optional[str] = None


class RuleOut(BaseModel):
    id: int
    account_id: Optional[int]
    pattern: str
    amount_min: Optional[Decimal]
    amount_max: Optional[Decimal]
    match_kind: str
    match_id: Optional[int]
    contributor_user_id: Optional[int]
    category: Optional[str]
    hits: int


def to_out(db: Session, tx: BankTransaction, with_options: bool = False) -> TxOut:
    acc = db.get(Account, tx.account_id)
    out = TxOut(
        id=tx.id, account_id=tx.account_id, account_name=acc.name if acc else "?",
        date=tx.date, amount=tx.amount, label=tx.label, source=tx.source, status=tx.status,
        match_kind=tx.match_kind, match_id=tx.match_id,
        contributor_user_id=tx.contributor_user_id, rule_id=tx.rule_id,
    )
    if with_options:
        out.question = rec.question_for(db, tx)
        out.options = [OptionOut(**o) for o in rec.options_for(db, tx)]
        out.suggested_pattern = rec.suggest_pattern(tx.label)
    return out


def get_tx_for_write(db: Session, user: User, tx_id: int) -> BankTransaction:
    tx = db.get(BankTransaction, tx_id)
    if not tx or tx.account_id not in accessible_account_ids(db, user.id):
        raise HTTPException(404, "Opération introuvable.")
    if not user_can_write_account(db, user.id, tx.account_id):
        raise HTTPException(403, "Lecture seule sur ce compte.")
    return tx


def apply_resolution(db: Session, user: User, tx: BankTransaction, payload: ResolveIn) -> BankTransaction:
    try:
        kind, target, cat = rec.parse_option_key(payload.option)
        return rec.resolve(
            db, tx, user, kind, target_id=target,
            category=payload.category or cat, label=payload.label,
            create_rule=payload.create_rule, rule_pattern=payload.rule_pattern,
        )
    except ValueError as e:
        db.rollback()
        raise HTTPException(422, str(e))


def import_file(db: Session, user: User, account_id: int, filename: str, data: bytes) -> dict:
    if not user_can_write_account(db, user.id, account_id):
        raise HTTPException(403, "Pas le droit d'écrire sur ce compte.")
    try:
        rows, source = parse_statement(db, user.id, filename, data)
    except StatementParseError as e:
        raise HTTPException(422, str(e))
    return rec.import_transactions(db, user, account_id, rows, source)


@router.post("/import", response_model=ImportOut)
async def import_statement(
    request: Request,
    account_id: int = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    data = await file.read()
    return import_file(db, request.state.user, account_id, file.filename or "", data)


@router.get("/inbox", response_model=list[TxOut])
async def inbox(request: Request, db: Session = Depends(get_db)):
    ids = accessible_account_ids(db, request.state.user.id)
    txs = (
        db.query(BankTransaction)
        .filter(BankTransaction.account_id.in_(ids), BankTransaction.status == rec.TO_REVIEW)
        .order_by(BankTransaction.date.desc())
        .limit(200)
        .all()
    )
    return [to_out(db, t, with_options=True) for t in txs]


@router.get("/inbox/count")
async def inbox_count(request: Request, db: Session = Depends(get_db)):
    ids = accessible_account_ids(db, request.state.user.id)
    n = db.query(BankTransaction).filter(
        BankTransaction.account_id.in_(ids), BankTransaction.status == rec.TO_REVIEW,
    ).count()
    return {"count": n}


@router.get("/transactions", response_model=list[TxOut])
async def list_transactions(
    request: Request,
    db: Session = Depends(get_db),
    account_id: Optional[int] = None,
    year: Optional[int] = None,
    month: Optional[int] = None,
    status: Optional[str] = None,
):
    ids = accessible_account_ids(db, request.state.user.id)
    q = db.query(BankTransaction).filter(BankTransaction.account_id.in_(ids))
    if account_id:
        q = q.filter(BankTransaction.account_id == account_id)
    if year and month:
        start = date(year, month, 1)
        end = date(year + (month == 12), month % 12 + 1, 1)
        q = q.filter(BankTransaction.date >= start, BankTransaction.date < end)
    if status:
        q = q.filter(BankTransaction.status == status)
    return [to_out(db, t) for t in q.order_by(BankTransaction.date.desc()).limit(1000).all()]


@router.post("/transactions/{tx_id}/resolve", response_model=TxOut)
async def resolve_transaction(tx_id: int, payload: ResolveIn, request: Request, db: Session = Depends(get_db)):
    user = request.state.user
    tx = apply_resolution(db, user, get_tx_for_write(db, user, tx_id), payload)
    return to_out(db, tx)


@router.post("/transactions/{tx_id}/reopen", response_model=TxOut)
async def reopen_transaction(tx_id: int, request: Request, db: Session = Depends(get_db)):
    user = request.state.user
    return to_out(db, rec.reopen(db, get_tx_for_write(db, user, tx_id)), with_options=True)


@router.get("/rules", response_model=list[RuleOut])
async def list_rules(request: Request, db: Session = Depends(get_db)):
    ids = accessible_account_ids(db, request.state.user.id)
    rules = db.query(MatchingRule).filter(MatchingRule.account_id.in_(ids)).order_by(MatchingRule.id.desc()).all()
    return [RuleOut.model_validate(r, from_attributes=True) for r in rules]


@router.delete("/rules/{rule_id}", status_code=204)
async def delete_rule(rule_id: int, request: Request, db: Session = Depends(get_db)):
    user = request.state.user
    rule = db.get(MatchingRule, rule_id)
    if not rule or not rule.account_id or not user_can_write_account(db, user.id, rule.account_id):
        raise HTTPException(404, "Règle introuvable.")
    db.delete(rule)
    db.commit()
