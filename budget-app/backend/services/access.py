"""Helpers de contrôle d'accès aux ressources : un user voit ses propres
comptes (Account.user_id) plus les comptes joints où il est dans
AccountMember.
"""
from typing import Iterable

from sqlalchemy.orm import Session

from models import Account, AccountMember, AccountMemberRole


def accessible_account_ids(db: Session, user_id: int) -> list[int]:
    """Tous les account.id que l'user peut voir : ses propres comptes +
    ceux où il est member (cotitulaire/viewer/owner via la table de jointure)."""
    own = {row[0] for row in db.query(Account.id).filter(Account.user_id == user_id).all()}
    via_member = {
        row[0]
        for row in db.query(AccountMember.account_id)
        .filter(AccountMember.user_id == user_id)
        .all()
    }
    return list(own | via_member)


def user_can_write_account(db: Session, user_id: int, account_id: int) -> bool:
    """L'user peut écrire sur le compte (créer/modifier/supprimer charges,
    revenus, etc.) s'il en est propriétaire ou owner/cotitulaire (pas viewer)."""
    acc = db.query(Account).filter(Account.id == account_id).first()
    if acc and acc.user_id == user_id:
        return True
    member = db.query(AccountMember).filter(
        AccountMember.account_id == account_id,
        AccountMember.user_id == user_id,
    ).first()
    return member is not None and member.role in (
        AccountMemberRole.OWNER, AccountMemberRole.COTITULAIRE,
    )


def account_member_user_ids(db: Session, account_id: int) -> list[int]:
    """Tous les users qui ont accès au compte : owner d'origine (Account.user_id)
    + tous les AccountMember. Liste dédupliquée."""
    acc = db.query(Account).filter(Account.id == account_id).first()
    if not acc:
        return []
    ids: set[int] = {acc.user_id}
    for m in db.query(AccountMember).filter(AccountMember.account_id == account_id).all():
        ids.add(m.user_id)
    return sorted(ids)


def is_joint_account(db: Session, account_id: int) -> bool:
    """True si le compte a au moins un AccountMember en plus du owner."""
    return db.query(AccountMember).filter(AccountMember.account_id == account_id).count() > 0
