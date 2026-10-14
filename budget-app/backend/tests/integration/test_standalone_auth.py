"""Mode standalone (AUTH_MODE=standalone) : exposition Internet sans HA."""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from main import app
from models.base import Base, SessionLocal, engine
from models import ExternalCredential, ExternalScope, User
from services import local_users
from services.local_users import create_local_user
from services.security import LOCKOUT_THRESHOLD, login_guard


@pytest.fixture(scope="module")
def client():
    Base.metadata.create_all(engine)
    with TestClient(app) as c:
        yield c


@pytest.fixture(autouse=True)
def standalone(monkeypatch):
    monkeypatch.setenv("DEV_MODE", "false")
    monkeypatch.setenv("AUTH_MODE", "standalone")
    login_guard.reset()
    db = SessionLocal()
    try:
        db.query(ExternalCredential).delete()
        db.query(User).filter(User.ha_user_id.like("local:%")).delete(synchronize_session=False)
        db.commit()
        create_local_user(db, "admin", "admin-pass-123", is_admin=True)
        create_local_user(db, "bob", "bob-pass-1234")
        create_local_user(db, "coloc", "coloc-pass-123", scope=ExternalScope.COLOC)
    finally:
        db.close()
    yield
    login_guard.reset()


def _login(client, username, password):
    return client.post("/api/auth/login/password", json={"username": username, "password": password})


def _cookie(client, username, password):
    r = _login(client, username, password)
    assert r.status_code == 200, r.text
    return {"budget_session": r.cookies["budget_session"]}


def test_ha_header_is_not_trusted(client):
    r = client.get("/api/users/me", headers={"X-Remote-User-Id": "spoof", "X-Remote-User-Name": "x"})
    assert r.status_code == 401


def test_legacy_tokens_disabled(client):
    db = SessionLocal()
    try:
        u = db.query(User).filter(User.ha_user_id == "local:bob").first()
        u.external_token = "tok-bob-123"
        db.commit()
    finally:
        db.close()
    assert client.get("/api/users/me?token=tok-bob-123").status_code == 401
    r = client.get("/api/users/me", headers={"Authorization": "Bearer tok-bob-123"})
    assert r.status_code == 401
    bob = _cookie(client, "bob", "bob-pass-1234")
    assert client.get("/api/users/me", cookies=bob).json()["auth_mode"] == "standalone"
    assert client.post("/api/users/me/external-token", cookies=bob).status_code == 410


def test_security_headers_and_cookie_flags(client):
    r = client.get("/api/health")
    assert r.headers["X-Frame-Options"] == "DENY"
    assert "frame-ancestors 'none'" in r.headers["Content-Security-Policy"]
    assert "max-age" in r.headers["Strict-Transport-Security"]

    r = _login(client, "bob", "bob-pass-1234")
    set_cookie = r.headers["set-cookie"].lower()
    assert "httponly" in set_cookie and "secure" in set_cookie and "samesite=strict" in set_cookie


def test_login_rate_limit_per_ip(client):
    for _ in range(5):
        assert _login(client, "bob", "wrong").status_code == 401
    assert _login(client, "bob", "bob-pass-1234").status_code == 429


def test_lockout_after_repeated_failures(client):
    for _ in range(LOCKOUT_THRESHOLD):
        login_guard.record_failure("bob")
    assert login_guard.locked_for("bob") > 0
    assert _login(client, "bob", "bob-pass-1234").status_code == 429
    # Les autres comptes ne sont pas impactés
    assert _login(client, "admin", "admin-pass-123").status_code == 200


def test_body_size_limit(client, monkeypatch):
    monkeypatch.setenv("MAX_BODY_MB", "1")
    r = client.post("/api/auth/login/password", content=b"x" * (2 * 1024 * 1024),
                    headers={"Content-Type": "application/json"})
    assert r.status_code == 413


def test_admin_manages_users(client):
    admin = _cookie(client, "admin", "admin-pass-123")
    r = client.post("/api/users/", cookies=admin, json={
        "username": "camille", "password": "camille-pass-1", "display_name": "Camille",
    })
    assert r.status_code == 201, r.text
    uid = r.json()["user_id"]
    assert _login(client, "camille", "camille-pass-1").status_code == 200

    r = client.patch(f"/api/users/{uid}", cookies=admin, json={"password": "nouveau-pass-1"})
    assert r.status_code == 200
    assert _login(client, "camille", "nouveau-pass-1").status_code == 200

    names = [u["username"] for u in client.get("/api/users/", cookies=admin).json()]
    assert {"admin", "bob", "camille"} <= set(names)


def test_non_admin_cannot_manage_users(client):
    bob = _cookie(client, "bob", "bob-pass-1234")
    assert client.get("/api/users/", cookies=bob).status_code == 403
    r = client.post("/api/users/", cookies=bob, json={"username": "eve", "password": "eve-pass-1234"})
    assert r.status_code == 403


def test_coloc_scope_cannot_escalate(client):
    coloc = _cookie(client, "coloc", "coloc-pass-123")
    r = client.put("/api/users/me/external-account", cookies=coloc, json={
        "username": "coloc", "password": "coloc-pass-123", "scope": "full",
    })
    assert r.status_code == 200
    assert r.json()["external_scope"] == "coloc"
    # Le changement de mot de passe révoque l'ancien cookie et en réémet un
    assert client.get("/api/shopping/", cookies=coloc).status_code == 401
    coloc = {"budget_session": r.cookies["budget_session"]}
    assert client.post("/api/users/me/external-token", cookies=coloc).status_code in (403, 410)


def test_cannot_delete_only_credentials(client):
    bob = _cookie(client, "bob", "bob-pass-1234")
    assert client.delete("/api/users/me/external-account", cookies=bob).status_code == 400


def test_bootstrap_admin(monkeypatch):
    mem = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(mem)
    monkeypatch.setattr(local_users, "SessionLocal", sessionmaker(bind=mem))
    monkeypatch.setenv("ADMIN_USERNAME", "root")
    monkeypatch.setenv("ADMIN_PASSWORD", "root-pass-123")
    local_users.ensure_bootstrap_admin()
    local_users.ensure_bootstrap_admin()  # idempotent
    db = sessionmaker(bind=mem)()
    users = db.query(User).all()
    assert len(users) == 1 and users[0].is_admin and users[0].ha_user_id == "local:root"
    db.close()


def test_attach_credentials_to_existing_ha_user(client):
    from services.local_users import attach_credentials
    db = SessionLocal()
    try:
        u = db.query(User).filter(User.ha_user_id == "ha-legacy-user").first()
        if not u:
            u = User(ha_user_id="ha-legacy-user", ha_username="legacy", display_name="Legacy")
            db.add(u)
            db.commit()
        attach_credentials(db, u, "legacy-login", "legacy-pass-1", is_admin=True)
        with pytest.raises(ValueError):
            attach_credentials(db, u, "autre-login", "legacy-pass-1")
        uid = u.id
    finally:
        db.close()
    r = _login(client, "legacy-login", "legacy-pass-1")
    assert r.status_code == 200 and r.json()["user_id"] == uid


def test_logout_all_revokes_other_sessions(client):
    phone = _cookie(client, "bob", "bob-pass-1234")
    laptop = _cookie(client, "bob", "bob-pass-1234")
    r = client.post("/api/users/me/logout-all", cookies=laptop)
    assert r.status_code == 204
    assert client.get("/api/users/me", cookies=phone).status_code == 401
    laptop = {"budget_session": r.cookies["budget_session"]}
    assert client.get("/api/users/me", cookies=laptop).status_code == 200


def test_admin_password_reset_revokes_sessions(client):
    bob = _cookie(client, "bob", "bob-pass-1234")
    admin = _cookie(client, "admin", "admin-pass-123")
    uid = client.get("/api/users/me", cookies=bob).json()["user_id"]
    client.patch(f"/api/users/{uid}", cookies=admin, json={"password": "nouveau-bob-1"})
    assert client.get("/api/users/me", cookies=bob).status_code == 401
