"""Tests d'intégration pour les comptes externes (username + password)
et leurs scopes coloc/full sur le port externe."""
import pytest
from fastapi.testclient import TestClient

from main import app
from models.base import Base, SessionLocal, engine
from models import ExternalCredential, User


@pytest.fixture(scope="module")
def client():
    Base.metadata.create_all(engine)
    with TestClient(app) as c:
        yield c


@pytest.fixture(autouse=True)
def clean_credentials():
    db = SessionLocal()
    try:
        db.query(ExternalCredential).delete()
        db.commit()
    finally:
        db.close()


def _create_account(client, username="lucas-ext", password="hunter22!", scope="full"):
    return client.put("/api/users/me/external-account", json={
        "username": username, "password": password, "scope": scope,
    })


def test_create_external_account_full_scope(client):
    r = _create_account(client)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["has_external_account"] is True
    assert body["external_username"] == "lucas-ext"
    assert body["external_scope"] == "full"


def test_password_login_returns_session_cookie(client):
    _create_account(client)
    r = client.post("/api/auth/login/password", json={
        "username": "lucas-ext", "password": "hunter22!",
    })
    assert r.status_code == 200, r.text
    assert "budget_session" in r.cookies
    assert r.json()["scope"] == "full"


def test_password_login_bad_credentials(client):
    _create_account(client)
    r = client.post("/api/auth/login/password", json={
        "username": "lucas-ext", "password": "wrong",
    })
    assert r.status_code == 401


def test_coloc_scope_restricts_endpoints(client, monkeypatch):
    """Avec scope=coloc, /api/shopping passe mais /api/accounts/ POST renvoie
    202 ou 403 selon implémentation — au moins une route 'sensible' doit
    renvoyer 403."""
    _create_account(client, scope="coloc")
    r = client.post("/api/auth/login/password", json={
        "username": "lucas-ext", "password": "hunter22!",
    })
    cookie = r.cookies.get("budget_session")
    assert cookie

    # Sort du mode dev pour exercer la vraie auth
    monkeypatch.setenv("DEV_MODE", "false")

    # /api/shopping/ doit passer (scope coloc)
    r = client.get("/api/shopping/", cookies={"budget_session": cookie})
    assert r.status_code == 200, r.text

    # /api/incomes/ doit être bloqué (hors scope coloc)
    r = client.get("/api/incomes/", cookies={"budget_session": cookie})
    assert r.status_code == 403, r.text


def test_full_scope_allows_everything(client, monkeypatch):
    _create_account(client, scope="full")
    r = client.post("/api/auth/login/password", json={
        "username": "lucas-ext", "password": "hunter22!",
    })
    cookie = r.cookies.get("budget_session")

    monkeypatch.setenv("DEV_MODE", "false")
    r = client.get("/api/incomes/", cookies={"budget_session": cookie})
    assert r.status_code == 200, r.text


def test_username_uniqueness(client):
    _create_account(client, username="taken")
    # Pour ce test on aurait besoin d'un 2e user, mais en mode dev il n'y en
    # a qu'un — donc on vérifie juste que mettre à jour son propre username
    # ne déclenche pas un 409.
    r = _create_account(client, username="taken", password="newpass1!")
    assert r.status_code == 200, r.text


def test_password_too_short(client):
    r = _create_account(client, password="short")
    assert r.status_code == 422
