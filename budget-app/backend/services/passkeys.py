"""Double authentification : passkeys (WebAuthn), code à 6 chiffres (TOTP),
codes de secours.

Deux façons de se connecter :
- mot de passe + second facteur (code d'une appli d'authentification, ou passkey) ;
- passkey seule (Face ID / Touch ID / empreinte), sans mot de passe.
Dès qu'un user a un second facteur, le mot de passe seul ne pose plus la
session : il ouvre une étape de 5 min (cookie signé + état en mémoire).
"""
from __future__ import annotations

import hashlib
import json
import os
import secrets
import threading
import time
from dataclasses import dataclass
from datetime import datetime
from typing import Optional

from fastapi import Request
from sqlalchemy.orm import Session
from webauthn import (
    generate_authentication_options, generate_registration_options, options_to_json,
    verify_authentication_response, verify_registration_response,
)
from webauthn.helpers import base64url_to_bytes, bytes_to_base64url
from webauthn.helpers.structs import (
    AuthenticatorSelectionCriteria, AuthenticatorTransport, PublicKeyCredentialDescriptor,
    ResidentKeyRequirement, UserVerificationRequirement,
)

import pyotp

from models import Passkey, RecoveryCode, User

CHALLENGE_TTL = 300
RECOVERY_CODES = 10


def rp_config(request: Request) -> tuple[str, str]:
    """(rp_id, origin). En prod : le domaine du .env, jamais le Host reçu."""
    configured = os.environ.get("WEBAUTHN_RP_ID") or os.environ.get("DOMAIN")
    if configured:
        return configured, os.environ.get("WEBAUTHN_ORIGIN") or f"https://{configured}"
    return request.url.hostname or "localhost", f"{request.url.scheme}://{request.url.netloc}"


@dataclass
class _Pending:
    user_id: int
    challenge: bytes
    expires: float
    scope: Optional[str] = None


_lock = threading.Lock()
_pending: dict[str, _Pending] = {}


def _put(key: str, p: _Pending) -> None:
    with _lock:
        now = time.monotonic()
        for k in [k for k, v in _pending.items() if v.expires < now]:
            del _pending[k]
        _pending[key] = p


def _pop(key: str) -> Optional[_Pending]:
    with _lock:
        p = _pending.pop(key, None)
    if p is None or p.expires < time.monotonic():
        return None
    return p


def reset() -> None:
    with _lock:
        _pending.clear()


def has_passkeys(db: Session, user_id: int) -> bool:
    return db.query(Passkey).filter(Passkey.user_id == user_id).count() > 0


def has_second_factor(db: Session, user_id: int) -> bool:
    user = db.get(User, user_id)
    return bool(user and user.totp_enabled) or has_passkeys(db, user_id)


def second_factor_methods(db: Session, user_id: int) -> list[str]:
    user = db.get(User, user_id)
    methods = []
    if user and user.totp_enabled:
        methods.append("totp")
    if has_passkeys(db, user_id):
        methods.append("passkey")
    if remaining_recovery_codes(db, user_id):
        methods.append("recovery")
    return methods


def _descriptors(db: Session, user_id: int) -> list[PublicKeyCredentialDescriptor]:
    out = []
    for pk in db.query(Passkey).filter(Passkey.user_id == user_id).all():
        transports = [AuthenticatorTransport(t) for t in (pk.transports or "").split(",") if t]
        out.append(PublicKeyCredentialDescriptor(
            id=base64url_to_bytes(pk.credential_id), transports=transports or None,
        ))
    return out


# ============================================================
# Enregistrement (user connecté)
# ============================================================

def registration_options(db: Session, request: Request, user: User) -> dict:
    rp_id, _ = rp_config(request)
    opts = generate_registration_options(
        rp_id=rp_id,
        rp_name="Budget Multi-Coloc",
        user_name=user.ha_username,
        user_display_name=user.display_name or user.ha_username,
        user_id=str(user.id).encode(),
        exclude_credentials=_descriptors(db, user.id),
        authenticator_selection=AuthenticatorSelectionCriteria(
            # Clé « découvrable » : permet la connexion sans saisir d'identifiant
            resident_key=ResidentKeyRequirement.REQUIRED,
            user_verification=UserVerificationRequirement.PREFERRED,
        ),
    )
    _put(f"reg:{user.id}", _Pending(user.id, opts.challenge, time.monotonic() + CHALLENGE_TTL))
    return json.loads(options_to_json(opts))


def register(db: Session, request: Request, user: User, credential: dict, name: str) -> Passkey:
    pending = _pop(f"reg:{user.id}")
    if pending is None:
        raise ValueError("Demande expirée, recommence.")
    rp_id, origin = rp_config(request)
    try:
        v = verify_registration_response(
            credential=credential, expected_challenge=pending.challenge,
            expected_rp_id=rp_id, expected_origin=origin,
        )
    except Exception as e:  # la lib lève plusieurs types selon l'étape qui échoue
        raise ValueError(f"Passkey refusée : {e}")
    transports = credential.get("response", {}).get("transports") or []
    pk = Passkey(
        user_id=user.id,
        credential_id=bytes_to_base64url(v.credential_id),
        public_key=bytes_to_base64url(v.credential_public_key),
        sign_count=v.sign_count,
        transports=",".join(transports)[:128] or None,
        name=(name or "Passkey").strip()[:64] or "Passkey",
    )
    db.add(pk)
    db.flush()
    return pk


# ============================================================
# Second facteur au login
# ============================================================

def start_login(db: Session, request: Request, user_id: int, scope: str) -> tuple[str, dict]:
    """Retourne (nonce à mettre dans le cookie signé, options pour le navigateur)."""
    rp_id, _ = rp_config(request)
    opts = generate_authentication_options(
        rp_id=rp_id,
        allow_credentials=_descriptors(db, user_id),
        user_verification=UserVerificationRequirement.PREFERRED,
    )
    nonce = secrets.token_urlsafe(24)
    _put(f"login:{nonce}", _Pending(user_id, opts.challenge, time.monotonic() + CHALLENGE_TTL, scope))
    return nonce, json.loads(options_to_json(opts))


def take_login(nonce: str) -> Optional[_Pending]:
    return _pop(f"login:{nonce}")


def peek_login(nonce: str) -> Optional[_Pending]:
    """Sans consommer : une faute de frappe dans le code ne force pas à retaper le mot de passe
    (le rate-limit et le verrouillage du compte bornent les essais)."""
    with _lock:
        p = _pending.get(f"login:{nonce}")
    return p if p and p.expires >= time.monotonic() else None


# ============================================================
# Connexion par passkey seule (sans mot de passe)
# ============================================================

def start_passwordless(request: Request) -> tuple[str, dict]:
    rp_id, _ = rp_config(request)
    opts = generate_authentication_options(rp_id=rp_id, user_verification=UserVerificationRequirement.REQUIRED)
    nonce = secrets.token_urlsafe(24)
    _put(f"pwl:{nonce}", _Pending(0, opts.challenge, time.monotonic() + CHALLENGE_TTL))
    return nonce, json.loads(options_to_json(opts))


def verify_passwordless(db: Session, request: Request, nonce: str, credential: dict) -> Passkey:
    pending = _pop(f"pwl:{nonce}")
    if pending is None:
        raise ValueError("Demande expirée, recommence.")
    raw_id = credential.get("rawId") or credential.get("id") or ""
    pk = db.query(Passkey).filter(Passkey.credential_id == raw_id).first()
    if pk is None:
        raise ValueError("Passkey inconnue.")
    rp_id, origin = rp_config(request)
    try:
        v = verify_authentication_response(
            credential=credential, expected_challenge=pending.challenge,
            expected_rp_id=rp_id, expected_origin=origin,
            credential_public_key=base64url_to_bytes(pk.public_key),
            credential_current_sign_count=pk.sign_count,
            # Sans mot de passe, la biométrie / le code de l'appareil est obligatoire
            require_user_verification=True,
        )
    except Exception as e:
        raise ValueError(f"Passkey refusée : {e}")
    pk.sign_count = v.new_sign_count
    pk.last_used_at = datetime.utcnow()
    return pk


# ============================================================
# Code à 6 chiffres (appli d'authentification)
# ============================================================

def totp_setup(db: Session, user: User, issuer: str) -> tuple[str, str]:
    """Nouveau secret (pas encore actif). Retourne (secret, URI otpauth)."""
    if user.totp_enabled:
        raise ValueError("Déjà activée : désactive-la d'abord pour changer d'appareil.")
    user.totp_secret = pyotp.random_base32()
    db.flush()
    return user.totp_secret, pyotp.TOTP(user.totp_secret).provisioning_uri(
        name=user.ha_username, issuer_name=issuer,
    )


def verify_totp(user: User, code: str) -> bool:
    """Accepte le code courant ±30 s, une seule fois (anti-rejeu)."""
    if not user.totp_secret:
        return False
    code = "".join(c for c in (code or "") if c.isdigit())
    if len(code) != 6:
        return False
    totp = pyotp.TOTP(user.totp_secret)
    now_step = int(time.time()) // 30
    for step in (now_step - 1, now_step, now_step + 1):
        if secrets.compare_digest(totp.at(step * 30), code) and step > (user.totp_last_step or 0):
            user.totp_last_step = step
            return True
    return False


def verify_login(db: Session, request: Request, pending: _Pending, credential: dict) -> Passkey:
    raw_id = credential.get("rawId") or credential.get("id") or ""
    pk = db.query(Passkey).filter(
        Passkey.user_id == pending.user_id, Passkey.credential_id == raw_id,
    ).first()
    if pk is None:
        raise ValueError("Passkey inconnue pour ce compte.")
    rp_id, origin = rp_config(request)
    try:
        v = verify_authentication_response(
            credential=credential, expected_challenge=pending.challenge,
            expected_rp_id=rp_id, expected_origin=origin,
            credential_public_key=base64url_to_bytes(pk.public_key),
            credential_current_sign_count=pk.sign_count,
        )
    except Exception as e:
        raise ValueError(f"Passkey refusée : {e}")
    pk.sign_count = v.new_sign_count
    pk.last_used_at = datetime.utcnow()
    return pk


# ============================================================
# Codes de secours
# ============================================================

def _hash_code(code: str) -> str:
    return hashlib.sha256(code.strip().upper().replace("-", "").replace(" ", "").encode()).hexdigest()


def regenerate_recovery_codes(db: Session, user_id: int) -> list[str]:
    db.query(RecoveryCode).filter(RecoveryCode.user_id == user_id).delete()
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    codes = []
    for _ in range(RECOVERY_CODES):
        raw = "".join(secrets.choice(alphabet) for _ in range(10))
        codes.append(f"{raw[:5]}-{raw[5:]}")
        db.add(RecoveryCode(user_id=user_id, code_hash=_hash_code(raw)))
    db.flush()
    return codes


def use_recovery_code(db: Session, user_id: int, code: str) -> bool:
    rc = db.query(RecoveryCode).filter(
        RecoveryCode.user_id == user_id,
        RecoveryCode.code_hash == _hash_code(code),
        RecoveryCode.used_at.is_(None),
    ).first()
    if rc is None:
        return False
    rc.used_at = datetime.utcnow()
    return True


def remaining_recovery_codes(db: Session, user_id: int) -> int:
    return db.query(RecoveryCode).filter(
        RecoveryCode.user_id == user_id, RecoveryCode.used_at.is_(None),
    ).count()


def disable_second_factor(db: Session, user_id: int) -> None:
    """Pour l'admin (CLI) quand un user a perdu passkeys, appli et codes."""
    db.query(Passkey).filter(Passkey.user_id == user_id).delete()
    db.query(RecoveryCode).filter(RecoveryCode.user_id == user_id).delete()
    user = db.get(User, user_id)
    if user:
        user.totp_enabled, user.totp_secret, user.totp_last_step = False, None, 0
