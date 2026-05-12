"""Tests du service notifier HA.

Vérifie que les helpers sont no-op silencieux quand SUPERVISOR_TOKEN
n'est pas dans l'env (= mode dev, hors HA). Aucun appel réseau effectué.
"""
import os
from decimal import Decimal
from unittest.mock import patch

from services import notifier


def test_no_token_returns_false():
    """Pas de SUPERVISOR_TOKEN → toutes les notifs sont silencieusement skipées."""
    with patch.dict(os.environ, {}, clear=True):
        assert notifier.is_ha_available() is False
        assert notifier.send_persistent("X", "y") is False
        assert notifier.low_budget_warning("Lucas", Decimal("10"), Decimal("50")) is False


def test_token_present_signals_availability():
    with patch.dict(os.environ, {"SUPERVISOR_TOKEN": "fake"}):
        assert notifier.is_ha_available() is True


def test_low_budget_warning_calls_persistent(monkeypatch):
    """Le helper formate bien le titre/message et délègue à send_persistent."""
    captured = {}

    def fake_post(path, payload):
        captured["path"] = path
        captured["payload"] = payload
        return True

    monkeypatch.setattr(notifier, "_post", fake_post)
    monkeypatch.setenv("SUPERVISOR_TOKEN", "fake")

    ok = notifier.low_budget_warning("Lucas", Decimal("12.34"), Decimal("50"))
    assert ok is True
    assert captured["path"] == "/services/persistent_notification/create"
    assert "Lucas" in captured["payload"]["title"]
    assert "12.34" in captured["payload"]["message"]
    assert "50" in captured["payload"]["message"]
    assert captured["payload"]["notification_id"] == "budget_low_Lucas"
