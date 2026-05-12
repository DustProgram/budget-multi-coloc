"""API Membres d'un compte joint.

Le owner peut ajouter d'autres users HA déjà connus de l'app (créés à leur 1ère
connexion via l'ingress). Pas d'invitation email — l'authentification HA fait
office d'identité.
"""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from models import Account, AccountMember, AccountMemberRole, User, Charge
from models.base import get_db
from services.access import account_member_user_ids
from services.bulk_loaders import bulk_users
from services.charge_splits import regenerate_splits

router = APIRouter()


class MemberOut(BaseModel):
    user_id: int
    ha_username: str
    display_name: str | None
    color_hex: str
    role: str
    joined_at: datetime | None

    class Config:
        from_attributes = True


class AddMember(BaseModel):
    user_id: int
    role: AccountMemberRole = AccountMemberRole.COTITULAIRE


class UserPickerEntry(BaseModel):
    """Liste des users HA déjà inscrits, pour le picker côté frontend."""
    user_id: int
    ha_username: str
    display_name: str | None
    color_hex: str


def _check_owner(db: Session, account_id: int, user: User) -> Account:
    acc = db.query(Account).filter(Account.id == account_id).first()
    if not acc:
        raise HTTPException(404, "Compte introuvable")
    if acc.user_id != user.id and not user.is_admin:
        raise HTTPException(403, "Seul le propriétaire du compte peut gérer les membres")
    return acc


@router.get("/{account_id}/members", response_model=list[MemberOut])
async def list_members(
    account_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    """Liste les membres d'un compte (visible à tous les membres + owner)."""
    user: User = request.state.user
    acc = db.query(Account).filter(Account.id == account_id).first()
    if not acc:
        raise HTTPException(404, "Compte introuvable")

    member_ids = account_member_user_ids(db, account_id)
    if user.id not in member_ids:
        raise HTTPException(403, "Pas membre de ce compte")

    # Bulk-load tous les users concernés en 1 requête
    member_rows = db.query(AccountMember).filter(
        AccountMember.account_id == account_id,
    ).all()
    all_user_ids = {acc.user_id, *(m.user_id for m in member_rows)}
    users = bulk_users(db, all_user_ids)

    out: list[MemberOut] = []
    owner = users.get(acc.user_id)
    if owner:
        out.append(MemberOut(
            user_id=owner.id,
            ha_username=owner.ha_username,
            display_name=owner.display_name,
            color_hex=owner.color_hex,
            role=AccountMemberRole.OWNER.value,
            joined_at=owner.created_at,
        ))
    for m in member_rows:
        if m.user_id == acc.user_id:
            continue
        u = users.get(m.user_id)
        if u:
            out.append(MemberOut(
                user_id=u.id,
                ha_username=u.ha_username,
                display_name=u.display_name,
                color_hex=u.color_hex,
                role=m.role.value,
                joined_at=m.joined_at,
            ))
    return out


@router.post("/{account_id}/members", status_code=201, response_model=MemberOut)
async def add_member(
    account_id: int,
    payload: AddMember,
    request: Request,
    db: Session = Depends(get_db),
):
    """Ajoute un user HA comme membre du compte joint.

    À la création du 1er membre supplémentaire, le compte devient "joint" :
    on régénère les ChargeSplit de toutes ses charges partagées pour intégrer
    le nouveau membre.
    """
    user: User = request.state.user
    acc = _check_owner(db, account_id, user)

    target = db.query(User).filter(User.id == payload.user_id).first()
    if not target:
        raise HTTPException(404, "Utilisateur introuvable")
    if target.id == acc.user_id:
        raise HTTPException(400, "Le propriétaire est déjà membre implicite")

    existing = db.query(AccountMember).filter(
        AccountMember.account_id == account_id,
        AccountMember.user_id == target.id,
    ).first()
    if existing:
        raise HTTPException(409, "Cet utilisateur est déjà membre")

    member = AccountMember(
        account_id=account_id,
        user_id=target.id,
        role=payload.role,
    )
    db.add(member)
    db.flush()

    # Régénérer les splits de toutes les charges partagées du compte
    for ch in db.query(Charge).filter(Charge.account_id == account_id).all():
        regenerate_splits(db, ch)

    db.commit()
    db.refresh(member)
    return MemberOut(
        user_id=target.id,
        ha_username=target.ha_username,
        display_name=target.display_name,
        color_hex=target.color_hex,
        role=member.role.value,
        joined_at=member.joined_at,
    )


@router.delete("/{account_id}/members/{user_id}", status_code=204)
async def remove_member(
    account_id: int,
    user_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    """Retire un membre. Régénère les splits derrière."""
    user: User = request.state.user
    _check_owner(db, account_id, user)

    member = db.query(AccountMember).filter(
        AccountMember.account_id == account_id,
        AccountMember.user_id == user_id,
    ).first()
    if not member:
        raise HTTPException(404, "Membre introuvable")
    db.delete(member)
    db.flush()

    for ch in db.query(Charge).filter(Charge.account_id == account_id).all():
        regenerate_splits(db, ch)

    db.commit()


@router.get("/available-users", response_model=list[UserPickerEntry])
async def list_available_users(
    request: Request,
    db: Session = Depends(get_db),
):
    """Liste de tous les users HA connus de l'app (pour le picker d'invitation)."""
    users = db.query(User).order_by(User.display_name, User.ha_username).all()
    return [
        UserPickerEntry(
            user_id=u.id,
            ha_username=u.ha_username,
            display_name=u.display_name,
            color_hex=u.color_hex,
        )
        for u in users
    ]
