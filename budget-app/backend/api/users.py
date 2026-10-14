"""API utilisateur courant : profil + mode pro + compte externe."""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, field_validator
from sqlalchemy.orm import Session

from models.base import get_db
from models import ExternalCredential, ExternalScope, User
from services.external_auth import hash_password, revoke_sessions
from services.local_users import create_local_user, validate_password
from services.security import is_standalone
from services.tokens import generate_external_token

router = APIRouter()


class MeOut(BaseModel):
    user_id: int
    ha_username: str
    display_name: Optional[str]
    color_hex: str
    is_admin: bool
    has_external_account: bool
    external_username: Optional[str] = None
    external_scope: Optional[str] = None
    pro_enabled: bool
    # Scope de la session courante : 'full' (ingress HA ou compte externe full)
    # ou 'coloc' (compte externe scope coloc, accès limité)
    session_scope: str = "full"
    auth_mode: str = "ha"


class ProToggle(BaseModel):
    enabled: bool


class ExternalAccountPayload(BaseModel):
    username: str
    password: str
    scope: ExternalScope = ExternalScope.FULL

    @field_validator("username")
    @classmethod
    def _username_clean(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 3:
            raise ValueError("Username trop court (min 3).")
        if len(v) > 64:
            raise ValueError("Username trop long (max 64).")
        if not all(c.isalnum() or c in "_-." for c in v):
            raise ValueError("Username : lettres/chiffres/._- uniquement.")
        return v

    @field_validator("password")
    @classmethod
    def _password_len(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Mot de passe trop court (min 8 caractères).")
        return v


def _to_me_out(db: Session, user: User, session_scope: str = "full") -> MeOut:
    cred = db.query(ExternalCredential).filter(ExternalCredential.user_id == user.id).first()
    return MeOut(
        user_id=user.id,
        ha_username=user.ha_username,
        display_name=user.display_name,
        color_hex=user.color_hex,
        is_admin=user.is_admin,
        has_external_account=cred is not None,
        external_username=cred.username if cred else None,
        external_scope=(cred.scope.value if cred and hasattr(cred.scope, "value") else None),
        pro_enabled=bool(user.pro_enabled),
        session_scope=session_scope,
        auth_mode="standalone" if is_standalone() else "ha",
    )


@router.get("/me", response_model=MeOut)
async def get_me(request: Request, db: Session = Depends(get_db)):
    user: User = request.state.user
    scope = getattr(request.state, "scope", "full")
    return _to_me_out(db, user, session_scope=scope)


@router.post("/me/pro-enabled", response_model=MeOut)
async def set_pro_enabled(
    payload: ProToggle,
    request: Request,
    db: Session = Depends(get_db),
):
    user_id = request.state.user.id
    user = db.get(User, user_id)
    user.pro_enabled = payload.enabled
    db.commit()
    db.refresh(user)
    return _to_me_out(db, user)


@router.put("/me/external-account", response_model=MeOut)
async def upsert_external_account(
    payload: ExternalAccountPayload,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    """Crée ou met à jour le compte externe (username + password + scope).
    Si username déjà pris par un autre user → 409.
    """
    user_id = request.state.user.id
    if is_standalone():
        try:
            validate_password(payload.password)
        except ValueError as e:
            raise HTTPException(422, str(e))
    other = db.query(ExternalCredential).filter(
        ExternalCredential.username == payload.username,
        ExternalCredential.user_id != user_id,
    ).first()
    if other:
        raise HTTPException(409, "Ce username est déjà utilisé par un autre compte.")

    cred = db.query(ExternalCredential).filter(ExternalCredential.user_id == user_id).first()
    # Seul un admin choisit les scopes en standalone ; et une session limitée
    # ne doit jamais pouvoir s'auto-promouvoir en 'full'.
    session_full = getattr(request.state, "scope", "full") == ExternalScope.FULL.value
    if not session_full or (is_standalone() and not request.state.user.is_admin):
        payload.scope = cred.scope if cred else ExternalScope.COLOC
    if cred is None:
        cred = ExternalCredential(
            user_id=user_id,
            username=payload.username,
            password_hash=hash_password(payload.password),
            scope=payload.scope,
        )
        db.add(cred)
    else:
        cred.username = payload.username
        cred.password_hash = hash_password(payload.password)
        cred.scope = payload.scope

    db.commit()
    user = db.get(User, user_id)
    # Nouveau mot de passe → les autres appareils doivent se reconnecter
    revoke_sessions(db, user, response, getattr(request.state, "scope", "full"))
    return _to_me_out(db, user, getattr(request.state, "scope", "full"))


@router.post("/me/logout-all", status_code=204)
async def logout_everywhere(request: Request, response: Response, db: Session = Depends(get_db)):
    """Déconnecte tous les autres appareils (la session courante reste valide)."""
    revoke_sessions(db, db.get(User, request.state.user.id), response, getattr(request.state, "scope", "full"))


@router.delete("/me/external-account", status_code=204)
async def delete_external_account(request: Request, db: Session = Depends(get_db)):
    if is_standalone():
        raise HTTPException(400, "En mode standalone, c'est ton seul moyen de connexion.")
    user_id = request.state.user.id
    db.query(ExternalCredential).filter(ExternalCredential.user_id == user_id).delete()
    db.commit()


# ============================================================
# Admin : gestion des comptes locaux (standalone)
# ============================================================

class LocalUserOut(BaseModel):
    user_id: int
    username: Optional[str]
    display_name: Optional[str]
    color_hex: str
    is_admin: bool
    scope: Optional[str]
    last_login_at: Optional[str]


class LocalUserCreate(BaseModel):
    username: str
    password: str
    display_name: Optional[str] = None
    scope: ExternalScope = ExternalScope.FULL
    is_admin: bool = False


class LocalUserPatch(BaseModel):
    password: Optional[str] = None
    display_name: Optional[str] = None
    scope: Optional[ExternalScope] = None
    is_admin: Optional[bool] = None


def _require_admin(request: Request) -> None:
    if not request.state.user.is_admin:
        raise HTTPException(403, "Réservé à l'administrateur.")


def _to_local_out(user: User, cred: Optional[ExternalCredential]) -> LocalUserOut:
    return LocalUserOut(
        user_id=user.id,
        username=cred.username if cred else None,
        display_name=user.display_name,
        color_hex=user.color_hex,
        is_admin=bool(user.is_admin),
        scope=(cred.scope.value if cred and hasattr(cred.scope, "value") else None),
        last_login_at=cred.last_login_at.isoformat() if cred and cred.last_login_at else None,
    )


@router.get("/", response_model=list[LocalUserOut])
async def list_users(request: Request, db: Session = Depends(get_db)):
    _require_admin(request)
    creds = {c.user_id: c for c in db.query(ExternalCredential).all()}
    users = db.query(User).order_by(User.id).all()
    return [_to_local_out(u, creds.get(u.id)) for u in users]


@router.post("/", response_model=LocalUserOut, status_code=201)
async def create_user(payload: LocalUserCreate, request: Request, db: Session = Depends(get_db)):
    _require_admin(request)
    try:
        user = create_local_user(
            db, payload.username, payload.password,
            payload.display_name, payload.scope, payload.is_admin,
        )
    except ValueError as e:
        raise HTTPException(422, str(e))
    cred = db.query(ExternalCredential).filter(ExternalCredential.user_id == user.id).first()
    return _to_local_out(user, cred)


@router.patch("/{user_id}", response_model=LocalUserOut)
async def update_user(
    user_id: int, payload: LocalUserPatch, request: Request, db: Session = Depends(get_db),
):
    _require_admin(request)
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(404, "Utilisateur introuvable.")
    cred = db.query(ExternalCredential).filter(ExternalCredential.user_id == user_id).first()
    if user_id == request.state.user.id and payload.is_admin is False:
        raise HTTPException(400, "Tu ne peux pas retirer tes propres droits admin.")
    if payload.display_name is not None:
        user.display_name = payload.display_name.strip() or user.ha_username
    if payload.is_admin is not None:
        user.is_admin = payload.is_admin
    revoke = payload.password is not None or payload.scope is not None
    if revoke:
        if cred is None:
            raise HTTPException(400, "Cet utilisateur n'a pas d'identifiants locaux.")
        if payload.password is not None:
            try:
                cred.password_hash = hash_password(validate_password(payload.password))
            except ValueError as e:
                raise HTTPException(422, str(e))
        if payload.scope is not None:
            cred.scope = payload.scope
    db.commit()
    if revoke and user_id != request.state.user.id:
        revoke_sessions(db, user)
    return _to_local_out(user, cred)


# ============================================================
# Compat 0.3.x — anciens endpoints token (retournent une dépréciation)
# ============================================================

class TokenOut(BaseModel):
    token: str
    deprecated: str = (
        "Le système de token est remplacé par les comptes externes "
        "(username + password + scope). Utilise PUT /api/users/me/external-account."
    )


@router.post("/me/external-token", response_model=TokenOut, deprecated=True)
async def legacy_generate_token(request: Request, db: Session = Depends(get_db)):
    if is_standalone():
        raise HTTPException(410, "Désactivé : utilise l'API agent (AGENT_API_TOKEN) pour les automatisations.")
    # Le token donne un accès 'full' : interdit depuis une session limitée.
    if getattr(request.state, "scope", "full") != ExternalScope.FULL.value:
        raise HTTPException(403, "Scope insuffisant.")
    user_id = request.state.user.id
    user = db.get(User, user_id)
    user.external_token = generate_external_token()
    db.commit()
    db.refresh(user)
    return TokenOut(token=user.external_token)


@router.delete("/me/external-token", status_code=204, deprecated=True)
async def legacy_revoke_token(request: Request, db: Session = Depends(get_db)):
    user_id = request.state.user.id
    user = db.get(User, user_id)
    user.external_token = None
    db.commit()
