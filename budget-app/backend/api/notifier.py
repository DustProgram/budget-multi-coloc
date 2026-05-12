"""API Notifications HA.

GET  /api/notifier/status   → indique si HA est joignable
POST /api/notifier/test     → envoie une notification de test
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services import notifier

router = APIRouter()


class StatusOut(BaseModel):
    ha_available: bool


class TestPayload(BaseModel):
    title: str = "Budget — test"
    message: str = "Ceci est une notification de test depuis l'add-on Budget."


@router.get("/status", response_model=StatusOut)
async def status():
    return StatusOut(ha_available=notifier.is_ha_available())


@router.post("/test")
async def test_notification(payload: TestPayload):
    ok = notifier.send_persistent(payload.title, payload.message)
    if not ok:
        raise HTTPException(
            502,
            "Impossible d'envoyer la notification — vérifie que homeassistant_api est activé "
            "et que l'add-on tourne bien dans HA.",
        )
    return {"sent": True}
