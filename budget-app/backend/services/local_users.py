"""Comptes locaux pour le mode standalone (sans Home Assistant).

Un compte local = un ``User`` (``ha_user_id = "local:<username>"``) + son
``ExternalCredential``. Le 1er admin est créé au démarrage depuis
``ADMIN_USERNAME`` / ``ADMIN_PASSWORD`` si la base n'a encore aucun user.
"""
from __future__ import annotations

import logging
import os
from typing import Optional

from sqlalchemy.orm import Session

from models import ExternalCredential, ExternalScope, User
from models.base import SessionLocal
from services.external_auth import hash_password

logger = logging.getLogger(__name__)

PALETTE = ["#C2410C", "#22C55E", "#8B5CF6"]  # terra / sage / plum (cf Avatar.tsx)


def validate_username(v: str) -> str:
    v = v.strip()
    if not 3 <= len(v) <= 64:
        raise ValueError("Username : entre 3 et 64 caractères.")
    if not all(c.isalnum() or c in "_-." for c in v):
        raise ValueError("Username : lettres/chiffres/._- uniquement.")
    return v


def validate_password(v: str) -> str:
    if len(v) < 10:
        raise ValueError("Mot de passe trop court (min 10 caractères).")
    return v


def create_local_user(
    db: Session,
    username: str,
    password: str,
    display_name: Optional[str] = None,
    scope: ExternalScope = ExternalScope.FULL,
    is_admin: bool = False,
) -> User:
    username = validate_username(username)
    validate_password(password)
    if db.query(ExternalCredential).filter(ExternalCredential.username == username).first():
        raise ValueError("Ce username est déjà utilisé.")
    count = db.query(User).count()
    user = User(
        ha_user_id=f"local:{username}",
        ha_username=username,
        display_name=display_name or username,
        is_admin=is_admin,
        color_hex=PALETTE[count % len(PALETTE)],
    )
    db.add(user)
    db.flush()
    db.add(ExternalCredential(
        user_id=user.id,
        username=username,
        password_hash=hash_password(password),
        scope=scope,
    ))
    db.commit()
    return user


def ensure_bootstrap_admin() -> None:
    username = os.environ.get("ADMIN_USERNAME", "").strip()
    password = os.environ.get("ADMIN_PASSWORD", "")
    db = SessionLocal()
    try:
        if db.query(User).count() > 0:
            return
        if not username or not password:
            logger.warning(
                "Aucun utilisateur en base : définis ADMIN_USERNAME / ADMIN_PASSWORD "
                "ou lance scripts/create_user.py pour créer le premier admin."
            )
            return
        create_local_user(db, username, password, is_admin=True)
        logger.info("Admin initial créé : %s", username)
    finally:
        db.close()
