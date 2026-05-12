"""Bulk loaders pour éviter les N+1 dans les endpoints qui mappent
des listes de rows vers des DTOs nécessitant les infos d'un user.

Usage type :
    rows = db.query(Message).filter(...).all()
    users = bulk_users(db, {m.user_id for m in rows})
    return [
        MessageOut(user_name=display(users.get(m.user_id)), ...)
        for m in rows
    ]
"""
from __future__ import annotations

from typing import Iterable, Optional

from sqlalchemy.orm import Session

from models import User


def bulk_users(db: Session, user_ids: Iterable[int]) -> dict[int, User]:
    """Charge tous les users en une seule requête. Retourne dict id→User.
    Les ids non trouvés sont simplement absents du dict."""
    ids = list({i for i in user_ids if i is not None})
    if not ids:
        return {}
    return {u.id: u for u in db.query(User).filter(User.id.in_(ids)).all()}


def display_name(user: Optional[User]) -> Optional[str]:
    """Nom d'affichage standardisé (display_name | ha_username | None)."""
    if user is None:
        return None
    return user.display_name or user.ha_username
