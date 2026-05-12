"""Notifications Home Assistant via l'API supervisor.

Quand l'add-on tourne dans HA, la variable d'env ``SUPERVISOR_TOKEN`` est
automatiquement injectée et permet d'appeler ``http://supervisor/core/api/…``.
En dehors de HA (mode dev / pytest), les fonctions no-op silencieusement.
"""
from __future__ import annotations

import logging
import os
from decimal import Decimal
from typing import Optional

import urllib.request
import urllib.error
import json

logger = logging.getLogger(__name__)

SUPERVISOR_URL = "http://supervisor/core/api"


def _token() -> Optional[str]:
    return os.environ.get("SUPERVISOR_TOKEN")


def _post(path: str, payload: dict) -> bool:
    """POST vers l'API HA. Retourne True si OK, False sinon (logged)."""
    tok = _token()
    if not tok:
        logger.debug("notifier: SUPERVISOR_TOKEN absent, skip %s", path)
        return False
    req = urllib.request.Request(
        f"{SUPERVISOR_URL}{path}",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {tok}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=4) as resp:
            return 200 <= resp.status < 300
    except urllib.error.HTTPError as e:
        logger.warning("notifier: HA %s → %s", path, e.code)
        return False
    except (urllib.error.URLError, TimeoutError) as e:
        logger.warning("notifier: HA %s unreachable (%s)", path, e)
        return False


def send_persistent(title: str, message: str, notification_id: Optional[str] = None) -> bool:
    """Crée une persistent_notification visible dans HA."""
    payload = {"title": title, "message": message}
    if notification_id:
        payload["notification_id"] = notification_id
    return _post("/services/persistent_notification/create", payload)


def low_budget_warning(user_name: str, available: Decimal, threshold: Decimal) -> bool:
    """Alerte 'marge sous le seuil'. Dédupliquée par user via notification_id."""
    title = f"Budget {user_name} : marge faible"
    message = (
        f"Il reste **{available:.2f} €** de marge ce mois, "
        f"en dessous du seuil configuré ({threshold:.2f} €). "
        f"Pense à freiner les achats spontanés."
    )
    return send_persistent(title, message, notification_id=f"budget_low_{user_name}")


def is_ha_available() -> bool:
    """True si on tourne en add-on HA (token superviseur dispo)."""
    return _token() is not None
