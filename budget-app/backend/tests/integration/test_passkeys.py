"""Passkey en second facteur, avec un authentificateur logiciel (P-256)."""
import hashlib
import json
import os
import struct

import cbor2
import pytest
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi.testclient import TestClient
from webauthn.helpers import bytes_to_base64url

from main import app
from models.base import Base, SessionLocal, engine
from models import ExternalCredential, Passkey, RecoveryCode, User
from services import passkeys as pk_service
from services.local_users import create_local_user
from services.security import login_guard

ORIGIN = "http://testserver"
RP_ID = "testserver"


class SoftAuthenticator:
    def __init__(self):
        self.key = ec.generate_private_key(ec.SECP256R1())
        self.cred_id = os.urandom(16)
        self.count = 0

    def _client_data(self, typ, challenge_b64):
        return json.dumps({"type": typ, "challenge": challenge_b64, "origin": ORIGIN}).encode()

    def register(self, options):
        nums = self.key.public_key().public_numbers()
        cose = cbor2.dumps({1: 2, 3: -7, -1: 1, -2: nums.x.to_bytes(32, "big"), -3: nums.y.to_bytes(32, "big")})
        auth_data = (hashlib.sha256(RP_ID.encode()).digest() + bytes([0x45]) + struct.pack(">I", 0)
                     + bytes(16) + struct.pack(">H", len(self.cred_id)) + self.cred_id + cose)
        att = cbor2.dumps({"fmt": "none", "attStmt": {}, "authData": auth_data})
        cid = bytes_to_base64url(self.cred_id)
        return {
            "id": cid, "rawId": cid, "type": "public-key",
            "response": {
                "clientDataJSON": bytes_to_base64url(self._client_data("webauthn.create", options["challenge"])),
                "attestationObject": bytes_to_base64url(att),
                "transports": ["internal"],
            },
        }

    def assert_(self, options):
        self.count += 1
        auth_data = hashlib.sha256(RP_ID.encode()).digest() + bytes([0x05]) + struct.pack(">I", self.count)
        cdj = self._client_data("webauthn.get", options["challenge"])
        sig = self.key.sign(auth_data + hashlib.sha256(cdj).digest(), ec.ECDSA(hashes.SHA256()))
        cid = bytes_to_base64url(self.cred_id)
        return {
            "id": cid, "rawId": cid, "type": "public-key",
            "response": {
                "clientDataJSON": bytes_to_base64url(cdj),
                "authenticatorData": bytes_to_base64url(auth_data),
                "signature": bytes_to_base64url(sig),
            },
        }


@pytest.fixture(scope="module")
def client():
    Base.metadata.create_all(engine)
    with TestClient(app) as c:
        yield c


@pytest.fixture(autouse=True)
def setup(monkeypatch, client):
    monkeypatch.setenv("DEV_MODE", "false")
    monkeypatch.setenv("AUTH_MODE", "standalone")
    monkeypatch.setenv("COOKIE_SECURE", "false")
    monkeypatch.delenv("DOMAIN", raising=False)
    client.cookies.clear()
    login_guard.reset()
    pk_service.reset()
    db = SessionLocal()
    try:
        db.query(Passkey).delete()
        db.query(RecoveryCode).delete()
        db.query(ExternalCredential).filter(ExternalCredential.username == "alice").delete()
        db.query(User).filter(User.ha_user_id == "local:alice").delete(synchronize_session=False)
        db.commit()
        create_local_user(db, "alice", "alice-pass-123")
        # Les autres modules de tests ne doivent pas hériter d'une 2FA
        db.query(User).update({User.totp_enabled: False, User.totp_secret: None, User.totp_last_step: 0})
        db.commit()
    finally:
        db.close()
    yield
    client.cookies.clear()


def _password(client):
    r = client.post("/api/auth/login/password", json={"username": "alice", "password": "alice-pass-123"})
    assert r.status_code == 200, r.text
    client.cookies.clear()
    return r


def _enroll(client):
    session = {"budget_session": _password(client).cookies["budget_session"]}
    auth = SoftAuthenticator()
    opts = client.post("/api/passkeys/register/options", cookies=session).json()
    r = client.post("/api/passkeys/register", cookies=session,
                    json={"credential": auth.register(opts), "name": "iPhone"})
    client.cookies.clear()
    assert r.status_code == 200, r.text
    return auth, session, r


def test_enroll_returns_recovery_codes_and_revokes_old_sessions(client):
    other_device = {"budget_session": _password(client).cookies["budget_session"]}
    auth, old_session, r = _enroll(client)
    assert len(r.json()["recovery_codes"]) == 10
    new_session = {"budget_session": r.cookies["budget_session"]}
    assert client.get("/api/users/me", cookies=other_device).status_code == 401
    assert client.get("/api/users/me", cookies=new_session).status_code == 200
    assert client.get("/api/passkeys/", cookies=new_session).json()["recovery_codes_remaining"] == 10


def test_password_alone_no_longer_enough(client):
    auth, _, _ = _enroll(client)
    r = _password(client)
    body = r.json()
    assert body["mfa_required"] is True and body["user_id"] is None
    assert "budget_session" not in r.cookies
    mfa = {"budget_mfa": r.cookies["budget_mfa"]}

    r = client.post("/api/auth/login/passkey", cookies=mfa,
                    json={"credential": auth.assert_(body["passkey_options"])})
    assert r.status_code == 200, r.text
    assert client.get("/api/users/me", cookies={"budget_session": r.cookies["budget_session"]}).status_code == 200

    # Le challenge est à usage unique
    r2 = client.post("/api/auth/login/passkey", cookies=mfa,
                     json={"credential": auth.assert_(body["passkey_options"])})
    assert r2.status_code == 401


def test_wrong_key_rejected(client):
    _enroll(client)
    body = _password(client)
    mfa = {"budget_mfa": body.cookies["budget_mfa"]}
    impostor = SoftAuthenticator()
    r = client.post("/api/auth/login/passkey", cookies=mfa,
                    json={"credential": impostor.assert_(body.json()["passkey_options"])})
    assert r.status_code == 401


def test_recovery_code_single_use(client):
    _, _, r = _enroll(client)
    code = r.json()["recovery_codes"][0]
    for expected in (200, 401):
        mfa = {"budget_mfa": _password(client).cookies["budget_mfa"]}
        resp = client.post("/api/auth/login/recovery", cookies=mfa, json={"code": code.lower()})
        assert resp.status_code == expected


def test_no_mfa_cookie_rejected(client):
    assert client.post("/api/auth/login/recovery", json={"code": "AAAAA-BBBBB"}).status_code == 401


def test_deleting_last_passkey_disables_second_factor(client):
    _, _, r = _enroll(client)
    session = {"budget_session": r.cookies["budget_session"]}
    pid = client.get("/api/passkeys/", cookies=session).json()["passkeys"][0]["id"]
    r = client.delete(f"/api/passkeys/{pid}", cookies=session)
    assert r.status_code == 200 and r.json()["recovery_codes_remaining"] == 0
    assert _password(client).json()["mfa_required"] is False


def test_rp_id_from_domain_rejects_other_origin(client, monkeypatch):
    session = {"budget_session": _password(client).cookies["budget_session"]}
    monkeypatch.setenv("DOMAIN", "budget.example.fr")
    auth = SoftAuthenticator()
    opts = client.post("/api/passkeys/register/options", cookies=session).json()
    assert opts["rp"]["id"] == "budget.example.fr"
    r = client.post("/api/passkeys/register", cookies=session, json={"credential": auth.register(opts)})
    assert r.status_code == 422


# ============================================================
# Code à 6 chiffres (appli d'authentification)
# ============================================================

def test_totp_enable_login_replay_disable(client, monkeypatch):
    import time as _time

    import pyotp
    from services import passkeys as svc

    session = {"budget_session": _password(client).cookies["budget_session"]}
    setup = client.post("/api/passkeys/totp/setup", cookies=session).json()
    assert setup["otpauth_uri"].startswith("otpauth://totp/") and setup["qr_svg"].startswith("data:image/svg+xml")
    totp = pyotp.TOTP(setup["secret"])
    t0 = (int(_time.time()) // 30 + 1) * 30 + 5  # après l'émission du cookie (sinon signature « du futur »)
    monkeypatch.setattr(svc.time, "time", lambda: t0)

    assert client.post("/api/passkeys/totp/enable", cookies=session, json={"code": "000000"}).status_code == 422
    r = client.post("/api/passkeys/totp/enable", cookies=session, json={"code": totp.at(t0)})
    assert r.status_code == 200 and len(r.json()["recovery_codes"]) == 10
    client.cookies.clear()

    body = _password(client).json()
    assert body["mfa_required"] and body["methods"] == ["totp", "recovery"] and body["passkey_options"] is None
    mfa = {"budget_mfa": _password(client).cookies["budget_mfa"]}
    # Une faute de frappe ne force pas à retaper le mot de passe
    assert client.post("/api/auth/login/totp", cookies=mfa, json={"code": "123456"}).status_code == 401
    r = client.post("/api/auth/login/totp", cookies=mfa, json={"code": totp.at(t0 + 30)})
    assert r.status_code == 200, r.text
    new_session = {"budget_session": r.cookies["budget_session"]}
    client.cookies.clear()

    login_guard.reset()  # le test enchaîne plus de 5 connexions/minute
    # Même code réutilisé (rejeu) : refusé
    mfa = {"budget_mfa": _password(client).cookies["budget_mfa"]}
    assert client.post("/api/auth/login/totp", cookies=mfa, json={"code": totp.at(t0 + 30)}).status_code == 401

    login_guard.reset()  # le test enchaîne plus de 5 connexions/minute
    monkeypatch.setattr(svc.time, "time", lambda: t0 + 60)
    r = client.post("/api/passkeys/totp/disable", cookies=new_session, json={"code": totp.at(t0 + 60)})
    assert r.status_code == 200 and r.json()["totp_enabled"] is False
    assert r.json()["recovery_codes_remaining"] == 0
    assert _password(client).json()["mfa_required"] is False


# ============================================================
# Passkey seule, sans mot de passe
# ============================================================

def test_passwordless_login(client):
    auth, _, _ = _enroll(client)
    start = client.post("/api/auth/login/passkey/start")
    opts = start.json()["passkey_options"]
    assert not opts.get("allowCredentials")  # l'appareil propose ses passkeys, pas d'identifiant à saisir
    assert opts["userVerification"] == "required"
    r = client.post("/api/auth/login/passkey/finish", cookies={"budget_mfa": start.cookies["budget_mfa"]},
                    json={"credential": auth.assert_(opts)})
    assert r.status_code == 200, r.text
    assert client.get("/api/users/me", cookies={"budget_session": r.cookies["budget_session"]}).status_code == 200


def test_passwordless_unknown_key_rejected(client):
    _enroll(client)
    start = client.post("/api/auth/login/passkey/start")
    r = client.post("/api/auth/login/passkey/finish", cookies={"budget_mfa": start.cookies["budget_mfa"]},
                    json={"credential": SoftAuthenticator().assert_(start.json()["passkey_options"])})
    assert r.status_code == 401
