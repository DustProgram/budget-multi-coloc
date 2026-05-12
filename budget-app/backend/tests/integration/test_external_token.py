"""Tests d'intégration pour l'auth via token externe sur port 8765."""
import os

import pytest
from fastapi.testclient import TestClient

from main import app
from models.base import Base, SessionLocal, engine
from models import User


@pytest.fixture(scope="module")
def client():
    Base.metadata.create_all(engine)
    with TestClient(app) as c:
        yield c


@pytest.fixture
def user(client):
    """User auto-créé par DEV_MODE à la 1ère requête."""
    # Trigger user creation
    client.get("/api/users/me")
    db = SessionLocal()
    try:
        u = db.query(User).filter(User.ha_user_id == "dev-user-id").first()
        # reset le token pour les tests
        if u and u.external_token:
            u.external_token = None
            db.commit()
        return u
    finally:
        db.close()


def test_generate_and_revoke_token(client, user):
    """Le user peut toujours générer/révoquer son token legacy via l'ingress
    (endpoints conservés deprecated en 0.4 pour la rétrocompat)."""
    r = client.post("/api/users/me/external-token")
    assert r.status_code == 200
    token = r.json()["token"]
    assert len(token) > 30  # 32 octets URL-safe → ~43 chars

    # Revoke
    r = client.delete("/api/users/me/external-token")
    assert r.status_code == 204


def test_external_request_with_valid_token(client, user, monkeypatch):
    """Une requête externe (X-Forwarded-For) avec ?token=<valide> est acceptée."""
    # Génère un token via le mode dev
    r = client.post("/api/users/me/external-token")
    token = r.json()["token"]

    # Sort du mode dev pour exercer le vrai middleware
    monkeypatch.setenv("DEV_MODE", "false")
    r = client.get(
        f"/api/users/me?token={token}",
        headers={"X-Forwarded-For": "1.2.3.4"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["user_id"] == user.id


def test_external_request_without_token(client, monkeypatch):
    """Une requête externe sans token (et sans module legacy autorisé) → 401."""
    monkeypatch.setenv("DEV_MODE", "false")
    monkeypatch.setenv("EXTERNAL_MODULES", "")  # désactive le fallback legacy
    r = client.get(
        "/api/accounts/",
        headers={"X-Forwarded-For": "1.2.3.4"},
    )
    assert r.status_code == 401, r.text


def test_external_request_with_bad_token(client, monkeypatch):
    monkeypatch.setenv("DEV_MODE", "false")
    r = client.get(
        "/api/accounts/?token=wrong-token-xyz",
        headers={"X-Forwarded-For": "1.2.3.4"},
    )
    assert r.status_code == 401, r.text


# NB : Compat EXTERNAL_MODULES sans auth a été retirée en 0.4 — remplacée
# par les comptes externes (username + password + scope coloc/full).


def test_bearer_header_also_works(client, monkeypatch):
    """``Authorization: Bearer <token>`` est aussi accepté."""
    r = client.post("/api/users/me/external-token")
    token = r.json()["token"]

    monkeypatch.setenv("DEV_MODE", "false")
    r = client.get(
        "/api/users/me",
        headers={
            "X-Forwarded-For": "1.2.3.4",
            "Authorization": f"Bearer {token}",
        },
    )
    assert r.status_code == 200, r.text
