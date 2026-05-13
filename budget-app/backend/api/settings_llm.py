"""API Settings LLM — permet de modifier le provider/clé/modèle depuis
l'UI in-app, sans redémarrer l'add-on. Les valeurs sont stockées dans
la table `Settings` et priment sur la config.yaml.
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from models import Settings, User
from models.base import get_db

router = APIRouter()


class LLMSettingsOut(BaseModel):
    provider: Optional[str]
    has_api_key: bool
    model: Optional[str]
    base_url: Optional[str]
    rpm_limit: Optional[int]
    tpm_limit: Optional[int]
    rpd_limit: Optional[int]
    exclude_joint_charges_from_personal: bool


class LLMSettingsIn(BaseModel):
    provider: Optional[str] = None
    api_key: Optional[str] = None
    model: Optional[str] = None
    base_url: Optional[str] = None
    rpm_limit: Optional[int] = None
    tpm_limit: Optional[int] = None
    rpd_limit: Optional[int] = None
    exclude_joint_charges_from_personal: Optional[bool] = None


def _get_or_create_settings(db: Session) -> Settings:
    s = db.query(Settings).first()
    if not s:
        s = Settings(id=1)
        db.add(s)
        db.commit()
        db.refresh(s)
    return s


@router.get("/llm", response_model=LLMSettingsOut)
async def get_llm_settings(request: Request, db: Session = Depends(get_db)):
    """Retourne les valeurs DB actuelles (le frontend peut afficher la valeur
    en cours sans la clé en clair)."""
    _user: User = request.state.user
    s = _get_or_create_settings(db)
    return LLMSettingsOut(
        provider=s.llm_provider,
        has_api_key=bool(s.llm_api_key),
        model=s.llm_model,
        base_url=s.llm_base_url,
        rpm_limit=s.llm_rpm_limit,
        tpm_limit=s.llm_tpm_limit,
        rpd_limit=s.llm_rpd_limit,
        exclude_joint_charges_from_personal=bool(getattr(s, "exclude_joint_charges_from_personal", False)),
    )


@router.patch("/llm", response_model=LLMSettingsOut)
async def update_llm_settings(
    payload: LLMSettingsIn,
    request: Request,
    db: Session = Depends(get_db),
):
    """Met à jour les paramètres LLM en DB. Seul l'admin peut modifier."""
    user: User = request.state.user
    if not user.is_admin:
        raise HTTPException(403, "Seul un admin peut modifier les paramètres LLM")

    s = _get_or_create_settings(db)
    data = payload.model_dump(exclude_unset=True)
    if "provider" in data:
        s.llm_provider = (data["provider"] or "").strip() or None
    if "api_key" in data:
        # Vide = clear ; sinon stocker tel quel
        s.llm_api_key = (data["api_key"] or "").strip() or None
    if "model" in data:
        s.llm_model = (data["model"] or "").strip() or None
    if "base_url" in data:
        s.llm_base_url = (data["base_url"] or "").strip() or None
    if "rpm_limit" in data:
        s.llm_rpm_limit = data["rpm_limit"]
    if "tpm_limit" in data:
        s.llm_tpm_limit = data["tpm_limit"]
    if "rpd_limit" in data:
        s.llm_rpd_limit = data["rpd_limit"]
    if "exclude_joint_charges_from_personal" in data:
        s.exclude_joint_charges_from_personal = bool(data["exclude_joint_charges_from_personal"])
    db.commit()
    db.refresh(s)
    return LLMSettingsOut(
        provider=s.llm_provider,
        has_api_key=bool(s.llm_api_key),
        model=s.llm_model,
        base_url=s.llm_base_url,
        rpm_limit=s.llm_rpm_limit,
        tpm_limit=s.llm_tpm_limit,
        rpd_limit=s.llm_rpd_limit,
        exclude_joint_charges_from_personal=bool(getattr(s, "exclude_joint_charges_from_personal", False)),
    )
